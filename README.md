# Personal Wallet — MCP Server + Dashboard

A full-stack personal wallet manager built around an **MCP (Model Context Protocol) server**, so an
AI assistant (Claude Desktop, Cursor) can read and write your finances through typed tools — with a
**Next.js dashboard** over the same data.

```
mcp-server/
├── backend/            MCP server + REST API + Prisma/PostgreSQL
│   ├── prisma/         schema, migrations, seed
│   └── src/
│       ├── lib/        env, prisma, validation, wallet-service  ← shared core
│       ├── mcp/        MCP server (stdio) + tool JSON Schemas
│       └── api/        Express REST API (used by the dashboard)
├── frontend/           Next.js App Router + Tailwind v4 + Shadcn/UI
└── config/             ready-to-paste Claude Desktop / Cursor configs
```

The MCP tools and the REST API both call the **same** `wallet-service` module, so the assistant and
the dashboard can never disagree about what your balance is.

---

## Prerequisites

- **Node.js 20+** (developed on 25.x)
- **PostgreSQL 14+** running locally or reachable via URL

---

## Quick start

```bash
# 1. Install everything
npm run install:all

# 2. Configure the database
cp backend/.env.example backend/.env
#    edit backend/.env → DATABASE_URL

# 3. Create the database (if it does not exist yet)
createdb wallet

# 4. Generate the client, apply migrations, seed demo data, build
npm run db:generate
npm run db:migrate
npm run db:seed
npm run build
```

Then run the two pieces you need:

```bash
npm run dev:api    # REST API on http://localhost:4000  (needed by the dashboard)
npm run dev:web    # dashboard on http://localhost:3000
```

The MCP server is launched by your AI client, not by you — see **Connecting to Claude / Cursor**.

---

## Environment variables

`backend/.env` (template in `backend/.env.example`):

| Variable       | Purpose                                            | Example |
|----------------|----------------------------------------------------|---------|
| `DATABASE_URL` | PostgreSQL connection string                       | `postgresql://USER:PASSWORD@HOST:PORT/DATABASE?schema=public` |
| `PORT`         | Port for the REST API (MCP uses stdio, not a port) | `4000` |
| `CORS_ORIGIN`  | Comma-separated origins allowed to call the API    | `http://localhost:3000` |
| `GROQ_API_KEY` | Optional. Enables natural-language search via Groq | _unset_ |
| `ANTHROPIC_API_KEY` | Optional. Enables natural-language search via Anthropic | _unset_ |
| `ASK_PROVIDER` | Force `groq` or `anthropic`; unset auto-detects (Groq first) | _unset_ |
| `ASK_MODEL`    | Override the model | `openai/gpt-oss-120b` (Groq) / `claude-opus-5` (Anthropic) |

`frontend/.env.local`:

| Variable      | Purpose                                    | Example |
|---------------|--------------------------------------------|---------|
| `BACKEND_URL` | Where the Next.js proxy forwards API calls | `http://localhost:4000` |

---

## MCP tools

| Tool | Purpose |
|------|---------|
| `get_wallet_summary` | Balance, total income, total expense, counts, top categories, recent transactions. Optional date range. |
| `add_transaction` | Create an `INCOME` or `EXPENSE` entry. Creates the category if it is new. |
| `search_transactions` | Dynamic filtering by `type`, `category`, `startDate`, `endDate`, `minAmount`, `maxAmount`, free text — plus paging and sorting. Totals are computed across all matches, not just the returned page. |
| `delete_transaction` | Permanently remove a transaction by id. |

Each tool ships a detailed hand-written JSON Schema (`backend/src/mcp/tool-schemas.ts`) describing
units, formats and defaults, and every payload is re-validated with Zod
(`backend/src/lib/validation.ts`) before it reaches the database.

**Amounts are always positive.** Direction is carried by `type`, never by a negative number.

**Dates** accept `YYYY-MM-DD` (anchored at 12:00 UTC so timezones cannot shift the day) or a full
ISO-8601 timestamp.

---

## Connecting to Claude / Cursor

Build first — the configs point at the compiled output:

```bash
npm run build --prefix backend
```

### Claude Desktop

Config file location:

- **macOS** — `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows** — `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "wallet": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/mcp-server/backend/dist/mcp/server.js"],
      "env": {
        "DATABASE_URL": "postgresql://USER:PASSWORD@HOST:PORT/DATABASE?schema=public"
      }
    }
  }
}
```

Restart Claude Desktop completely, then look for the tools icon.

### Cursor

Project-scoped `.cursor/mcp.json`, or global `~/.cursor/mcp.json` — same shape:

```json
{
  "mcpServers": {
    "wallet": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/mcp-server/backend/dist/mcp/server.js"],
      "env": {
        "DATABASE_URL": "postgresql://USER:PASSWORD@HOST:PORT/DATABASE?schema=public"
      }
    }
  }
}
```

> Copies of both, pre-filled with this project's absolute path, are in [`config/`](config/).
> `config/claude_desktop_config.dev.json` runs the TypeScript source via `tsx` instead of the build.

**Paths must be absolute** — the client does not resolve relative paths. `DATABASE_URL` must be set
in the `env` block: the client launches the server from an arbitrary working directory, so the
`.env` file will not be found.

### Try it

> "What's my wallet balance?"
> "I spent $42 on groceries yesterday."
> "Show me every expense over $100 from last month."

### Inspect without an AI client

```bash
npm run inspect     # opens the MCP Inspector against the built server
```

---

## REST API

| Method | Endpoint | Notes |
|--------|----------|-------|
| `GET` | `/health` | Liveness probe |
| `GET` | `/api/summary` | `recentLimit`, `startDate`, `endDate` |
| `GET` | `/api/transactions` | Same filters as `search_transactions` |
| `POST` | `/api/transactions` | `{ type, amount, category, note?, date? }` |
| `DELETE` | `/api/transactions/:id` | |
| `GET` | `/api/categories` | |
| `POST` | `/api/categories` | `{ name, type?, color?, icon? }` |
| `POST` | `/api/ask` | `{ question }` — natural language. `501` if no API key, `422` if not a search |

The dashboard never calls this directly from the browser: it goes through a Next.js proxy at
`/api/wallet/*`, which keeps `BACKEND_URL` server-side and avoids CORS entirely.

---

## Data model

`Transaction` — `id`, `type` (`INCOME`/`EXPENSE`), `amount`, `category`, `note`, `date`,
`createdAt`, `updatedAt`, `categoryId?`

`Category` — `id`, `name` (unique), `type?`, `color?`, `icon?`, `createdAt`, `updatedAt`

Two deliberate choices:

- **`amount` is `Decimal(12,2)`, not `Float`.** Binary floats cannot represent `0.10` exactly, and
  the error compounds across a ledger. Values are converted to `number` only at the JSON boundary,
  where 2-dp values in this range are exact.
- **`Transaction.category` is a denormalised string alongside the optional `categoryId` FK.** A
  transaction stays readable even if the catalog entry is deleted, and the FK uses `onDelete:
  SetNull` so removing a category never destroys financial history.

---

## Useful commands

```bash
npm run build          # build backend + frontend
npm run typecheck      # typecheck both
npm run db:migrate     # create/apply a migration
npm run db:seed        # demo data (safe to re-run)
npm run db:studio      # browse the DB in Prisma Studio
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

- **Prisma 7 requires a driver adapter.** The client no longer connects from `DATABASE_URL` on its
  own; `backend/src/lib/prisma.ts` wires up `@prisma/adapter-pg`.
- **Prisma 7 does not auto-load `.env`.** `backend/prisma7.config.ts` imports `dotenv/config`
  explicitly, and the datasource URL lives in that config rather than in `schema.prisma`.
- **Never `console.log` in the backend.** `StdioServerTransport` owns stdout for JSON-RPC framing;
  a single stray write corrupts the MCP stream. Use the stderr logger in `backend/src/lib/logger.ts`.
  For the same reason Prisma is configured to emit logs as *events* forwarded to stderr — its
  shorthand `log: ['warn','error']` writes to stdout and would break the connection.
- **`npm audit` reports 3 high-severity advisories** in `deepmerge-ts`, a transitive dependency of
  the Prisma **CLI** (`@prisma/config`). It is a dev-only dependency and is not part of the running
  server. `npm audit fix --force` would downgrade the CLI to 6.x and break the match with
  `@prisma/client@7.10.0`, so it is intentionally left in place.
- The schema uses the `prisma-client-js` generator, which is removed in Prisma 8. Upgrading to
  Prisma 8 means switching to the `prisma-client` generator (which emits TypeScript into
  `generated/prisma` and needs `rewriteRelativeImportExtensions` in `tsconfig.json`).
