# Personal Wallet — MCP Server + Dashboard

A personal wallet manager built around an **MCP (Model Context Protocol) server**, so an AI
assistant (Claude Desktop, Cursor, Claude Code) can read and write your finances through typed
tools — with a **Next.js dashboard** over the same data, deployable to Vercel.

```
mcp-server/
├── app/
│   ├── api/wallet/     REST route handlers (serverless on Vercel)
│   └── page.tsx        the dashboard
├── components/         UI + dashboard widgets (Tailwind v4, Shadcn/UI)
├── lib/
│   ├── server/         env, prisma, validation, wallet-service, ask-service,
│   │                   tool-schemas  ← the shared core
│   └── *.ts            browser-side client, types, helpers
├── mcp/server.ts       MCP server over stdio — runs locally, never deployed
├── prisma/             schema, migrations, seed
└── config/             ready-to-paste Claude Desktop / Cursor configs
```

**One app, one copy of the logic.** The MCP tools and the HTTP routes both import the same
`lib/server/wallet-service`, so the assistant and the dashboard can never disagree about your
balance. There is no separate API process and no proxy hop.

---

## Prerequisites

- **Node.js 20+** (developed on 25.x)
- **PostgreSQL 14+** running locally or reachable via URL

---

## Quick start

```bash
npm install

cp .env.example .env.local        # then edit DATABASE_URL
createdb wallet                   # if it does not exist yet

npm run db:generate               # Prisma client
npm run db:migrate                # apply migrations
npm run db:seed                   # demo data (safe to re-run)

npm run dev                       # dashboard + API on http://localhost:3000
```

That is the whole stack. The MCP server is launched by your AI client, not by you — see
**Connecting to Claude / Cursor**.

---

## Environment variables

`.env.local` (template in `.env.example`). Next.js loads it automatically; the MCP server loads it
explicitly, resolved from the project root rather than the working directory.

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL connection string. On a pooled host (Neon), the **pooled** string. |
| `DIRECT_URL` | pooled hosts only | Unpooled string, used only by `prisma migrate` — a transaction-mode pooler cannot run migration DDL. |
| `GROQ_API_KEY` | no | Enables natural-language search via Groq |
| `ANTHROPIC_API_KEY` | no | Enables natural-language search via Anthropic |
| `ASK_PROVIDER` | no | Force `groq` or `anthropic`; unset auto-detects (Groq first) |
| `ASK_MODEL` | no | Override the model. Defaults `openai/gpt-oss-120b` (Groq) / `claude-opus-5` (Anthropic) |

Everything except `DATABASE_URL` is optional — the MCP tools, the REST routes and the dashboard all
work without an AI key. Only the **Ask** bar needs one.

---

## MCP tools

| Tool | Purpose |
|------|---------|
| `get_wallet_summary` | Balance, total income, total expense, counts, top categories, recent transactions. Optional date range. |
| `add_transaction` | Create an `INCOME` or `EXPENSE` entry. Creates the category if it is new. |
| `search_transactions` | Dynamic filtering by `type`, `category`, `startDate`, `endDate`, `minAmount`, `maxAmount`, free text — plus paging and sorting. Totals cover all matches, not just the returned page. |
| `delete_transaction` | Permanently remove a transaction by id. |

Each tool ships a hand-written JSON Schema (`lib/server/tool-schemas.ts`) describing units, formats
and defaults, and every payload is re-validated with Zod (`lib/server/validation.ts`) before it
reaches the database.

**Amounts are always positive.** Direction is carried by `type`, never by a negative number.

**Dates** accept `YYYY-MM-DD` (anchored at 12:00 UTC so timezones cannot shift the day) or a full
ISO-8601 timestamp.

---

## Connecting to Claude / Cursor

The server runs straight from TypeScript via `tsx` — no build step.

### Claude Desktop

Config file location:

- **macOS** — `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows** — `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "wallet": {
      "command": "/ABSOLUTE/PATH/TO/node",
      "args": [
        "/ABSOLUTE/PATH/TO/mcp-server/node_modules/tsx/dist/cli.mjs",
        "/ABSOLUTE/PATH/TO/mcp-server/mcp/server.ts"
      ]
    }
  }
}
```

Quit Claude Desktop completely (⌘Q — closing the window is not enough), reopen, then look for the
tools icon.

### Cursor

Project-scoped `.cursor/mcp.json`, or global `~/.cursor/mcp.json` — same shape.

### Claude Code

```bash
claude mcp add wallet --scope local -- \
  /ABSOLUTE/PATH/TO/node \
  /ABSOLUTE/PATH/TO/mcp-server/node_modules/tsx/dist/cli.mjs \
  /ABSOLUTE/PATH/TO/mcp-server/mcp/server.ts
```

Restart the session, then `/mcp` to confirm.

> Copies pre-filled with this project's absolute paths are in [`config/`](config/).

**Two things that bite:**

- **Paths must be absolute**, including `node` itself. MCP clients launch with a minimal `PATH` that
  does not include nvm, so a bare `"node"` fails with no useful error.
- **`DATABASE_URL` needs no `env` block.** The server resolves `.env.local` from its own file
  location, so it works from any working directory. Set it in the config only to override.

### Try it

> "What's my wallet balance?"
> "I spent $42 on groceries yesterday."
> "Show me every expense over $100 from last month."

### Inspect without an AI client

```bash
npm run inspect     # MCP Inspector against mcp/server.ts
```

---

## REST API

All routes are Next.js handlers under `/api/wallet/*` — same origin as the dashboard, so there is no
CORS configuration and no proxy.

| Method | Endpoint | Notes |
|--------|----------|-------|
| `GET` | `/api/wallet/health` | Liveness, plus whether the Ask bar is configured |
| `GET` | `/api/wallet/summary` | `recentLimit`, `startDate`, `endDate` |
| `GET` | `/api/wallet/transactions` | Same filters as `search_transactions` |
| `POST` | `/api/wallet/transactions` | `{ type, amount, category, note?, date? }` |
| `DELETE` | `/api/wallet/transactions/:id` | |
| `GET` | `/api/wallet/categories` | |
| `POST` | `/api/wallet/categories` | `{ name, type?, color?, icon? }` |
| `POST` | `/api/wallet/ask` | `{ question }` — natural language. `501` if no AI key, `422` if not a search |

Error mapping lives in `lib/server/http.ts`: Zod failures → `400`, missing transaction → `404`,
unconfigured Ask → `501`, not-a-search → `422`.

---

## Natural-language search

The **Ask** bar turns a plain question into a search *and* picks how to draw it:

> "how much did I spend on groceries last month?"
> "show my monthly expense on pie chart"
> "my biggest expenses over $200"

The model never writes a query. It fills in values for the same `search_transactions` JSON Schema
the MCP server exposes, and those values are validated by `searchTransactionsSchema` before they
reach Prisma — so it cannot produce a search the REST API would have rejected.

```
question → Groq | Anthropic → Zod validate → searchTransactions() → table + chart
```

Charts render as bar, line, area, pie, donut or table. An explicitly requested type always wins.
Categorical colours are assigned in fixed order and never cycled; past eight categories the tail
folds into "Other" rather than reusing a hue.

---

## Data model

`Transaction` — `id`, `type` (`INCOME`/`EXPENSE`), `amount`, `category`, `note`, `date`,
`createdAt`, `updatedAt`, `categoryId?`

`Category` — `id`, `name` (unique), `type?`, `color?`, `icon?`, `createdAt`, `updatedAt`

Two deliberate choices:

- **`amount` is `Decimal(12,2)`, not `Float`.** Binary floats cannot represent `0.10` exactly, and
  the error compounds across a ledger. Values become `number` only at the JSON boundary, where 2-dp
  values in this range are exact.
- **`Transaction.category` is a denormalised string alongside the optional `categoryId` FK.** A
  transaction stays readable even if the catalog entry is deleted, and the FK uses
  `onDelete: SetNull` so removing a category never destroys financial history.

---

## Useful commands

```bash
npm run dev            # dashboard + API on :3000
npm run build          # prisma generate + next build
npm run typecheck      # tsc --noEmit
npm run db:migrate     # create/apply a migration
npm run db:deploy      # apply migrations without prompting (CI/production)
npm run db:seed        # demo data (safe to re-run)
npm run db:studio      # browse the DB in Prisma Studio
npm run mcp            # run the MCP server directly (for debugging)
```

---

## Deploying to Vercel

The whole app — dashboard and API — is one Next.js project, so it is a single
deploy. The MCP server is **not** deployed: it speaks stdio and is launched by
Claude Desktop on your own machine. It talks to the same database.

### 1. Create a Neon database

At [neon.tech](https://neon.tech), create a project and copy **both** strings:

| Neon calls it | Set it as | Used for |
|---|---|---|
| Pooled connection (host contains `-pooler`) | `DATABASE_URL` | the running app |
| Direct connection (no `-pooler`) | `DIRECT_URL` | `prisma migrate` only |

The pooler is required because each serverless invocation opens its own
connection; a direct string will exhaust the connection limit. Migrations need
the opposite — a pooler in transaction mode cannot run migration DDL.

### 2. Push to GitHub, import in Vercel

```bash
git remote add origin git@github.com:<you>/<repo>.git
git push -u origin main
```

Then "Add New Project" in Vercel and import the repo. Framework autodetects as
Next.js; leave the root directory as `./`.

### 3. Set environment variables

In Project Settings → Environment Variables:

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Neon **pooled** string |
| `DIRECT_URL` | yes | Neon **direct** string |
| `GROQ_API_KEY` | no | enables the Ask bar |
| `ANTHROPIC_API_KEY` | no | alternative to Groq |

### 4. Deploy

`vercel.json` runs `prisma generate && prisma migrate deploy && next build`, so
the schema is applied on the first deploy. To load the sample data once:

```bash
DATABASE_URL="<direct url>" npm run db:seed
```

### 5. Point the local MCP server at the deployed database

Edit `.env.local` and set `DATABASE_URL` to the Neon **direct** string, then
restart Claude Desktop. Your local MCP tools and the deployed dashboard now read
and write the same wallet.

### Known constraints

- **The MCP server cannot be hosted.** stdio transport means the client spawns
  the process locally. Exposing it remotely would require rewriting it against
  an HTTP/SSE transport.
- **`maxDuration = 60` on `/api/wallet/ask`.** Model calls exceed the default
  function budget. Vercel's Hobby plan caps at 60s; longer needs Pro.
- **Cold starts open a new Prisma connection.** This is why the pooled string is
  not optional.


## Notes and known issues

- **The MCP server cannot be deployed.** It speaks stdio and the client spawns the process locally.
  Hosting it would mean rewriting it against an HTTP/SSE transport. It reads whichever database
  `DATABASE_URL` points at, so pointing it at Neon gives you one wallet across local and deployed.
- **Relative imports carry no `.js` extension.** TypeScript's bundler resolution substitutes
  `.js` → `.ts`, but the Next.js bundler does not, so `./env.js` fails to resolve at build time.
  Package specifiers such as `@modelcontextprotocol/sdk/server/index.js` keep theirs — those are
  real files.
- **Prisma 7 requires a driver adapter.** The client no longer connects from `DATABASE_URL` on its
  own; `lib/server/prisma.ts` wires up `@prisma/adapter-pg`.
- **Never `console.log` on the server.** `StdioServerTransport` owns stdout for JSON-RPC framing; a
  single stray write corrupts the MCP stream. Use the stderr logger in `lib/server/logger.ts`. For
  the same reason Prisma emits logs as *events* forwarded to stderr — its shorthand
  `log: ['warn','error']` writes to stdout and would break the connection.
- **`npm audit` reports high-severity advisories** in `deepmerge-ts`, a transitive dependency of the
  Prisma **CLI** (`@prisma/config`). It is dev-only and not part of the running app.
  `npm audit fix --force` would downgrade the CLI and break the match with `@prisma/client@7.10.0`,
  so it is intentionally left in place.
- **The schema uses the `prisma-client-js` generator**, which is removed in Prisma 8. Upgrading means
  switching to the `prisma-client` generator (which emits TypeScript into `generated/prisma` and
  needs `rewriteRelativeImportExtensions` in `tsconfig.json`).
- **Seed dates are fixed, not relative to today.** Once they fall far behind, questions like "this
  week" correctly return nothing — re-seed or edit `prisma/seed.ts` if the demo looks empty.
