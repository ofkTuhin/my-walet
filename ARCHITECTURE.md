# Architecture & Development Record

What has been built, how it fits together, and *why* each significant decision went the way it
did. `README.md` covers how to run the thing; this document covers how it works and what to know
before changing it.

**Status as of the last commit:** single Next.js app, deployable to Vercel, with per-user
tenancy and Clerk authentication in place. Remote MCP and billing are not built yet.

---

## 1. What this is

A personal wallet manager with two front doors onto one dataset:

- a **Next.js dashboard** — summary cards, filtering, charts, natural-language search
- an **MCP server** — so Claude Desktop / Cursor / Claude Code can read and write the same
  wallet through typed tools

The MCP server is the reason the project exists. Anything an assistant can do, the dashboard can
do, and vice versa, because both call the same service module.

---

## 2. Current status

| Area | State |
|---|---|
| Dashboard (cards, filters, table, add/delete) | Done |
| MCP server over stdio (4 tools) | Done — local only |
| REST API | Done — Next.js route handlers |
| Natural-language search (Groq / Anthropic) | Done |
| Charts driven by the question | Done — 6 chart types |
| Per-user tenancy | Done — verified by 8 isolation checks |
| Clerk authentication | Done |
| Remote MCP over HTTP | **Not started** |
| AI usage quotas | **Not started** |
| Stripe billing | **Not started** |
| Automated tests | **None** — verification has been manual |

Roughly 2,300 lines of TypeScript across `app/`, `lib/`, `mcp/`, and `prisma/`.

---

## 3. Shape of the codebase

```
mcp-server/
├── app/
│   ├── api/wallet/*/route.ts   REST handlers (serverless on Vercel)
│   ├── sign-in, sign-up/       Clerk pages
│   └── page.tsx                the dashboard
├── components/
│   ├── dashboard/              cards, filters, table, ask bar, charts
│   └── ui/                     hand-written Shadcn-style primitives
├── lib/
│   ├── server/                 ← everything server-side lives here
│   │   ├── wallet-service.ts   the only module that touches Prisma for wallet data
│   │   ├── current-user.ts     identity resolution
│   │   ├── ask-service.ts      natural language → filters
│   │   ├── mcp-handlers.ts     MCP tool dispatch (shared)
│   │   ├── tool-schemas.ts     the four MCP JSON Schemas
│   │   ├── validation.ts       Zod schemas
│   │   ├── http.ts             error → status mapping
│   │   ├── prisma.ts, env.ts, logger.ts, serialize.ts
│   └── api.ts, types.ts, utils.ts   browser-side
├── mcp/server.ts               stdio entry point (local dev)
├── prisma/                     schema, 2 migrations, seed
└── middleware.ts               Clerk route protection
```

**One rule holds the whole thing together:** wallet data is only ever read or written through
`lib/server/wallet-service.ts`. The MCP tools and the HTTP routes both call it. That is why an
assistant and the dashboard can never disagree about a balance, and why tenancy could be
enforced in one place.

### Request paths

```
Browser ──► /api/wallet/*  ──► requireUserId() ──┐
                                                 ├──► wallet-service ──► Prisma ──► Postgres
Claude  ──► mcp/server.ts  ──► standalone id ────┘
              (stdio)
```

---

## 4. Data model

Three tables. `Transaction` and `Category` both belong to a `User`.

**`Transaction`** — `id`, `type` (`INCOME`/`EXPENSE`), `amount`, `category`, `note`, `date`,
`createdAt`, `updatedAt`, `userId`, `categoryId?`

**`Category`** — `id`, `name`, `type?`, `color?`, `icon?`, `createdAt`, `updatedAt`, `userId`

**`User`** — `id`, `clerkId` (unique), `email?`, `name?`

### Decisions

**`amount` is `Decimal(12,2)`, never `Float`.** Binary floating point cannot represent `0.10`
exactly, and the error compounds across a ledger. Values become `number` only at the JSON
boundary, where two-decimal values in this range are exact.

**Amounts are always positive.** Direction lives in `type`. A signed amount plus a type field is
two sources of truth that will eventually disagree.

**`Transaction.category` is a denormalised string *and* there is an optional `categoryId` FK.**
The string keeps a transaction readable even if the catalog entry is deleted; the FK uses
`onDelete: SetNull` so removing a category never destroys financial history.

**Dates from `YYYY-MM-DD` are anchored at 12:00 UTC.** Midnight anchoring lets a timezone offset
shift a transaction to the previous or next day. Noon gives ±12 hours of slack. The dashboard
formats in UTC to match.

**Every index leads with `userId`.** Each query carries a tenant filter, and an index that does
not lead with the filtered column cannot serve it.

**`Category.name` is unique per user (`@@unique([userId, name])`), not globally.** Two people
must both be able to keep a "Groceries" category. This was a global unique constraint before
tenancy and would have failed on the second user to sign up.

---

## 5. The MCP server

Four tools, each with a hand-written JSON Schema in `lib/server/tool-schemas.ts`:

| Tool | Purpose |
|---|---|
| `get_wallet_summary` | Balance, totals, counts, top categories, recent transactions |
| `add_transaction` | Create an `INCOME` or `EXPENSE`; creates the category if new |
| `search_transactions` | Filter by type, category, dates, amounts, free text; paging and sorting |
| `delete_transaction` | Remove one transaction by id |

### Decisions

**The low-level `Server` API, not `McpServer.registerTool`.** `registerTool` only accepts Zod
schemas. Hand-written JSON Schema was a requirement, and it allows richer descriptions —
units, formats, defaults, and per-tool `annotations` (`readOnlyHint`, `destructiveHint`,
`idempotentHint`) that tell a client which tools are safe to call speculatively.

**Failures return `isError: true` inside the result, not a JSON-RPC error.** The model sees what
went wrong and can retry sensibly, instead of the call simply failing.

**Every payload is re-validated with Zod after the schema.** The JSON Schema advertises the
contract; Zod enforces it. A model that ignores the schema cannot reach the database.

**Identity is a parameter, never a tool argument.** `callWalletTool(userId, name, args)`. The
transport authenticates the caller; the model cannot name an account it does not own.

**`mcp-handlers.ts` is separate from `mcp/server.ts`** so the stdio entry point and the coming
HTTP route share one dispatch implementation rather than drifting.

### Hard-won constraints

**Never write to stdout.** `StdioServerTransport` owns stdout for JSON-RPC framing. A single
`console.log` corrupts the stream. Use `lib/server/logger.ts`, which writes to stderr.

This bit us for real: Prisma's shorthand `log: ['warn', 'error']` writes to **stdout**. Actual
malformed lines appeared in the protocol stream. `prisma.ts` now emits logs as *events*
forwarded to stderr.

**`.env` is resolved from the package root, not the working directory.** MCP clients launch the
server from an arbitrary cwd, so a cwd-relative lookup silently finds nothing. `env.ts` resolves
via `import.meta.url`.

**`@clerk/nextjs/server` cannot be imported outside Next.js.** It throws *"This module cannot be
imported from a Client Component module"* and broke every stdio tool call the moment Clerk keys
were configured. Hence two resolvers: `requireUserId()` for HTTP, `resolveStandaloneUserId()`
for processes with no request.

**MCP clients launch with a minimal `PATH`.** nvm's `node` is not on it, so configs must use an
absolute path to the node binary, not a bare `"node"`. The failure mode is a silent
disconnection with no useful error.

---

## 6. REST API

All routes are Next.js handlers under `/api/wallet/*`, same origin as the dashboard — no CORS,
no proxy.

| Method | Endpoint | Notes |
|---|---|---|
| `GET` | `/api/wallet/health` | Public. Reports whether Ask is configured |
| `GET` | `/api/wallet/summary` | `recentLimit`, `startDate`, `endDate` |
| `GET` | `/api/wallet/transactions` | Same filters as `search_transactions` |
| `POST` | `/api/wallet/transactions` | `{ type, amount, category, note?, date? }` |
| `DELETE` | `/api/wallet/transactions/:id` | |
| `GET` | `/api/wallet/categories` | |
| `POST` | `/api/wallet/categories` | `{ name, type?, color?, icon? }` |
| `POST` | `/api/wallet/ask` | `{ question }` — natural language |

`lib/server/http.ts` maps errors centrally: Zod → **400**, `UnauthorizedError` → **401**,
`TransactionNotFoundError` → **404**, not-a-search → **422**, Ask unconfigured → **501**.

---

## 7. Natural-language search and charts

The Ask bar turns a plain question into a search *and* decides how to draw it.

```
question → Groq | Anthropic → Zod validate → wallet-service → table + chart
```

**The model never writes a query.** It fills in values for the same `search_transactions` JSON
Schema the MCP server exposes, extended with two presentation fields (`chartType`, `groupBy`).
Those values pass through `searchTransactionsSchema` before reaching Prisma, so the model cannot
produce a search the REST API would have rejected. It chooses filter *values*; it does not shape
the query.

The ask tool schema is built by *extending* the MCP schema, not copying it, so the search half
cannot drift. A startup guard throws if `search_transactions` disappears from `TOOLS`.

**Grounding facts go into every prompt** — today's date, the user's real category names, and the
actual data range. Without them the model guesses at "last month" and invents categories, which
was the single biggest source of empty results.

**Two providers behind one interface.** Groq (`openai/gpt-oss-120b`) and Anthropic
(`claude-opus-5`), auto-detected from whichever key is present. Groq's catalogue changes —
`GET https://api.groq.com/openai/v1/models` lists what a key can actually reach.

### Charts

Six types: bar, line, area, pie, donut, table. An explicitly requested type always wins.

**Colour was computed, not chosen.** Both palettes were run through a validator for lightness
band, chroma floor, colourblind separation, and contrast. The income/expense pair lands at
ΔE 6.9 — inside the colourblind floor band — which is legal *only* with secondary encoding.
That is why every chart carries a legend and direct labels: identity is never colour alone.

Categorical hues are assigned in fixed order and never cycled; past eight categories the tail
folds into "Other" rather than reusing a hue.

**Bugs a screenshot caught that reasoning did not:** Recharts animates marks from zero and they
never completed, so bars, slices, and lines rendered blank; legend text wore series colours; and
donut labels collided on small slices. All three were invisible until the page was rendered and
looked at.

---

## 8. Authentication and tenancy

### The guiding principle

`userId` is a **required first parameter** on every service function, not an optional filter each
call site remembers to apply:

```ts
searchTransactions(userId, filters)
deleteTransaction(userId, id)
buildTransactionWhere(userId, filters)
```

A forgotten scope is a compile error, not a data leak. Adding the parameter surfaced exactly
**15 unscoped call sites**, which `tsc` enumerated — that list was the checklist.

`buildTransactionWhere` seeds `where.userId` before applying any filter, which covers most of the
read surface in one place.

### Two bugs this fixed

**An IDOR in `deleteTransaction`.** It took a bare id and deleted it — any user could have
deleted any other user's transaction by guessing a UUID. It now reads and deletes scoped, and
reports another account's id as **not found** rather than forbidden, so the response cannot
confirm the row exists.

**Cross-tenant leakage in `ask-service`.** `buildContext()` listed *every* category in the
database into the prompt.

### Clerk

Pages and API routes get different failure modes on purpose:

- signed-out **page** request → **307** to `/sign-in`
- signed-out **API** request → **401** with a JSON body

Clerk's `auth.protect()` 404s everything by default, which hides route existence but is unhelpful
for a documented API. So middleware protects pages only, and `requireUserId()` throws inside the
handler, flowing through the same error mapping as everything else.

Users are provisioned just-in-time on first API call — no webhook needed.

### Verified

Eight isolation checks, run against two real accounts:

```
PASS  both accounts hold a category named "Groceries"
PASS  search returns only own rows
PASS  summary totals scoped
PASS  cross-account delete rejected as not-found
PASS  the other account's transaction survived the attempt
PASS  listCategories scoped
PASS  own delete still works
PASS  account deletion cascaded to transactions
```

---

## 9. Environment variables

`.env.local` locally; Vercel project settings in production.

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Postgres. On Neon, the **pooled** string |
| `DIRECT_URL` | pooled hosts | Unpooled string, for `prisma migrate` only |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | yes | Clerk client |
| `CLERK_SECRET_KEY` | yes | Clerk server |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | no | `/sign-in` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | no | `/sign-up` |
| `GROQ_API_KEY` | no | Enables Ask via Groq |
| `ANTHROPIC_API_KEY` | no | Enables Ask via Anthropic |
| `ASK_PROVIDER` | no | Force `groq` or `anthropic` |
| `ASK_MODEL` | no | Override the model |
| `WALLET_USER_ID` | no | Binds the stdio MCP server to one account |
| `SEED_CLERK_ID` | no | Which account `db:seed` fills |

**`DIRECT_URL` matters.** A transaction-mode pooler cannot run migration DDL. `prisma7.config.ts`
prefers `DIRECT_URL` and falls back to `DATABASE_URL`.

---

## 10. Development

```bash
npm install
cp .env.example .env.local     # then fill DATABASE_URL + Clerk keys
npm run db:migrate
npm run db:seed
npm run dev                    # dashboard + API on :3000
```

| Command | Does |
|---|---|
| `npm run dev` | Dashboard and API on :3000 |
| `npm run build` | `prisma generate && next build` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:migrate` | Create/apply a migration |
| `npm run db:deploy` | Apply without prompting (CI/prod) |
| `npm run db:seed` | Demo data, safe to re-run |
| `npm run mcp` | Run the stdio MCP server directly |
| `npm run inspect` | MCP Inspector |

The MCP server is launched by your AI client, not by you — see `README.md`.

---

## 11. Deployment

One Vercel project. `vercel.json` runs `prisma generate && prisma migrate deploy && next build`.

**The MCP server is not deployed, and cannot be.** stdio means the client spawns the process
locally. It reads whichever database `DATABASE_URL` names, so pointing it at the hosted database
gives one wallet across local and deployed. Making it a hosted, multi-tenant service is Phase 3.

---

## 12. Known issues and gotchas

- **No automated tests.** All verification so far has been manual or via throwaway scripts. The
  highest-value first target is `buildTransactionWhere` plus the Zod schemas — pure functions,
  no database, where a silent bug corrupts every search.
- **Existing data belongs to a `bootstrap` account.** The tenancy migration backfilled it there.
  A newly signed-in Clerk user sees an empty dashboard until claimed:
  `UPDATE users SET "clerkId" = '<real id>' WHERE "clerkId" = 'bootstrap';`
- **Relative imports carry no `.js` extension.** TypeScript's bundler resolution substitutes
  `.js` → `.ts`; the Next.js bundler does not. Package specifiers such as
  `@modelcontextprotocol/sdk/server/index.js` keep theirs — those are real files.
- **Seed dates are fixed, not relative to today.** As they age, "this week" correctly returns
  nothing and the demo looks broken.
- **Prisma 7 requires a driver adapter** (`@prisma/adapter-pg`) and does not auto-load `.env`.
- **`prisma-client-js` generator is removed in Prisma 8.** Upgrading means switching to the
  `prisma-client` generator, which emits TypeScript into `generated/prisma`.
- **`npm audit` reports high-severity advisories** in `deepmerge-ts`, transitively via the Prisma
  **CLI**. Dev-only, not in the running app. `--force` would downgrade the CLI and break the
  match with `@prisma/client@7.10.0`.
- **Development keys are in use.** Clerk `pk_test_`/`sk_test_` and a Groq key that was shared in
  plain text. Rotate before production.

---

## 13. What comes next

From the SaaS plan in `Phase-1.md`:

**Phase 3 — remote MCP over HTTP.** The installed SDK ships
`WebStandardStreamableHTTPServerTransport`, whose `handleRequest(req: Request):
Promise<Response>` is exactly a Next.js route handler signature. The dispatch is already
extracted and shared. The gating unknown is whether **Clerk can act as the OAuth provider** that
remote MCP clients authenticate against; the fallback is per-user API tokens, a smaller build
that still gives zero-install access.

**Phase 4 — AI usage quotas.** `askWallet` calls a paid model on every question with no per-user
cap. An unmetered AI endpoint behind a free signup loses money quickly.

**Later — Stripe billing.** Deliberately after tenancy: billing on top of correct isolation is
straightforward; retrofitting isolation under live billing is not.
