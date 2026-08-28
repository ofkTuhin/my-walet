# Wallet → SaaS: multi-tenancy, auth, and a hosted MCP server

## Context

The app is a single-tenant personal wallet: one Next.js project on Vercel, one Postgres
database, and an MCP server that runs locally over stdio. There is **no concept of a user
anywhere in the codebase** — `grep` for `userId`/`session`/`auth` across `lib/`, `app/`, and
`components/` returns nothing. Every one of the 16 Prisma call sites reads and writes the
single global dataset.

The goal is to turn it into a product multiple paying customers can use. That is mostly a
data-isolation problem, plus one genuinely hard piece: the MCP server currently has no way to
know *who* is asking, because stdio has no request context and no credentials.

Two latent bugs make this urgent rather than cosmetic:

- **`deleteTransaction(id)`** ([lib/server/wallet-service.ts:237](lib/server/wallet-service.ts#L237))
  deletes by bare id with no ownership check. The moment a second user exists this is an IDOR —
  any user could delete any other user's transaction by guessing a UUID.
- **`Category.name` is globally `@unique`** ([prisma/schema.prisma](prisma/schema.prisma)).
  The second user to create "Groceries" hits a unique-constraint error.

Decisions taken: **one wallet per user**, **Clerk** for auth, **remote MCP over HTTP + OAuth**,
and **multi-tenancy first — billing deferred to a later milestone**.

---

## Guiding principle: make tenancy a compile-time guarantee

Do **not** add `userId` as an optional field that each call site remembers to filter on. Make
it a **required first parameter** on every service function:

```ts
export async function searchTransactions(userId: string, filters: SearchTransactionsInput)
export async function deleteTransaction(userId: string, id: string)
export function buildTransactionWhere(userId: string, filters: SearchTransactionsInput)
```

Every existing call site then fails to compile, and `tsc` enumerates the work rather than
leaving it to review. A forgotten scope becomes a build error instead of a data leak.

`buildTransactionWhere` is the single choke point for reads — it already builds the `where`
clause for `searchTransactions`, `aggregateForChart`, and the summary totals. Injecting
`userId` there covers most of the read surface in one edit.

---

## Phase 1 — Schema and data isolation

**`prisma/schema.prisma`**

- Add `model User { id, clerkId @unique, email, createdAt, ... }` plus relations.
- Add `userId String` + relation to **`Transaction`** and **`Category`**, both
  `onDelete: Cascade` (deleting an account removes its data).
- Replace `Category.name @unique` with `@@unique([userId, name])`.
- Re-scope every index to lead with `userId`: `@@index([userId, date])`,
  `@@index([userId, type, date])`, `@@index([userId, category])`. A tenant filter that is not
  the leading column will table-scan as the dataset grows.

**Migration** — existing rows have no owner. Write the migration to create a bootstrap user
and backfill `userId` on all existing rows *before* adding the `NOT NULL` constraint, so the
current 33 transactions survive. Three steps in one migration: add nullable column → backfill →
set `NOT NULL`.

**`lib/server/wallet-service.ts`** — add `userId` as the first parameter to all 8 exported
functions. Key changes beyond the signature:

- `buildTransactionWhere` seeds `where.userId = userId` before applying filters.
- `deleteTransaction` becomes a scoped delete — `deleteMany({ where: { id, userId } })` and
  throw `TransactionNotFoundError` when `count === 0`. This returns "not found" rather than
  "forbidden" for someone else's id, which is the correct behaviour: it does not confirm the
  row exists.
- `resolveCategoryId` looks up and creates within the user's scope; the `P2002` race-recovery
  branch must match on `[userId, name]`.

**`lib/server/ask-service.ts`** — `buildContext()` queries categories and the date range
unscoped; both need `userId`. Without this, one user's category names leak into another user's
prompt.

## Phase 2 — Auth with Clerk

- Add `@clerk/nextjs`, wrap the app in `<ClerkProvider>`, add `middleware.ts` protecting
  `/` and `/api/wallet/*`.
- Add `lib/server/current-user.ts`: resolve the Clerk session → local `User` row, creating it
  on first sign-in (just-in-time provisioning; no webhook needed for v1).
- Every route handler in `app/api/wallet/*` calls it and passes `userId` into the service.
  `lib/server/http.ts` gains an `UnauthorizedError → 401` mapping alongside the existing ones.
- Sign-in/sign-up pages, and a user button in the dashboard header.

The browser client (`lib/api.ts`) needs **no changes** — same origin, cookies ride along.

## Phase 3 — Remote MCP server

This is the phase that makes MCP a product feature rather than a local dev tool.

The installed SDK (`@modelcontextprotocol/sdk@1.30.0`) ships
**`WebStandardStreamableHTTPServerTransport`**, whose `handleRequest(req: Request):
Promise<Response>` is exactly a Next.js route handler signature. This is the right transport —
it needs no Node `http` server and runs as a Vercel function.

- New route `app/api/mcp/route.ts` (POST + GET) constructing the transport per request.
- Extract the tool dispatch out of `mcp/server.ts` into `lib/server/mcp-handlers.ts` so both
  the stdio entry (kept for local development) and the HTTP route share one implementation.
  The `TOOLS` schemas in `lib/server/tool-schemas.ts` are already shared and need no change.
- Authenticate the request, resolve the user, and pass `userId` into the same scoped service
  functions from Phase 1. The tools themselves gain no new arguments — the *transport* carries
  identity, not the tool schema.
- Users then add one URL to Claude Desktop and sign in. No Node, no clone, no token file.

**Verify Clerk's OAuth-provider support before committing to this phase.** Remote MCP clients
perform an OAuth authorization-code flow against your server. If Clerk cannot act as the OAuth
provider on your plan, the fallback is a **per-user API token** (`wt_live_…`, generated in the
dashboard, sent as a bearer token) — a smaller build that still gives zero-install remote
access, at the cost of a less polished connect experience. This is the single biggest unknown
in the plan and should be checked first.

## Phase 4 — AI usage quotas

`askWallet` calls Groq or Anthropic on every question. Per-user cost is unbounded today, which
is a real problem the moment strangers can sign up.

- `model UsageEvent { userId, kind, model, createdAt }` and a monthly count per user.
- Check the quota in `askWallet` before the model call; throw a typed `QuotaExceededError`
  mapped to **429** in `lib/server/http.ts`.
- Surface remaining quota in the Ask bar so the limit is visible before it is hit.

This is deliberately in the tenancy milestone, not the billing one — an unmetered AI endpoint
behind a free signup is a way to lose money quickly.

---

## Deferred to the billing milestone

Stripe checkout, plans, webhooks, customer portal, and plan-based quota tiers. Adding billing
on top of correct tenancy is straightforward; retrofitting tenancy under live billing is not.

---

## Verification

1. **Tenancy holds under compile** — `npm run typecheck` must fail loudly at every unscoped
   call site before the work is done, and pass after. That failure list *is* the checklist.
2. **Isolation test (the one that matters)** — create two users, add transactions to each,
   then confirm from user A's session:
   - `GET /api/wallet/transactions` returns only A's rows
   - `GET /api/wallet/summary` totals exclude B's amounts
   - `DELETE /api/wallet/transactions/{B's id}` returns **404**, and B's row still exists
   - both users can create a category named "Groceries"
3. **Unauthenticated access** — every `/api/wallet/*` route returns 401 with no session.
4. **Ask isolation** — user A's question must not surface B's category names; check the
   `buildContext` output for A contains only A's categories.
5. **Remote MCP** — connect Claude Desktop to the hosted URL as user A, run all four tools,
   confirm the data matches A's dashboard and that `delete_transaction` on B's id fails.
6. **Regression** — the existing dashboard flows (filter, add, delete, charts, Ask) still work
   end to end for a signed-in user; the local stdio MCP server still runs for development.

## Risks

- **Clerk OAuth for MCP is unverified** — gates Phase 3; check first, fallback is API tokens.
- **The backfill migration is one-way.** Take a database snapshot before running it.
- **Vercel function limits** — `/api/mcp` may hold a streaming connection; confirm behaviour
  against Hobby-plan timeouts (the Ask route already needs `maxDuration = 60`).
