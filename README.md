# Gelato Store

A branch-aware gelato shop prototype for staff and managers: manage menu
availability, place orders, track preparation, and record payment.

- **API:** Express 5 + TypeScript (`artifacts/api-server`)
- **Web:** React + Vite (`artifacts/gelato-store`)
- **DB:** PostgreSQL + Drizzle ORM (`lib/db`)
- **Validation/client:** Zod, Orval-generated API hooks
- **Tooling:** pnpm workspaces, Node.js 24, TypeScript 5.9

## Prerequisites

- Node.js 24 (22+ works)
- pnpm 11 (`corepack enable`)
- PostgreSQL 16+

`npm` and `yarn` are intentionally rejected by the root `preinstall` script.

## Setup

You have to run 
```bash
cd Replit-Gelato-replit-agent
```
Run everything from the repository root.

### 1. Install dependencies

```bash
pnpm install
```

Generated API clients in `lib/*/src/generated` are committed, so codegen is not
required for a fresh checkout.

### 2. Create the database

```bash
sudo -u postgres psql -c "CREATE ROLE gelato_app LOGIN PASSWORD 'choose-a-password';"
sudo -u postgres createdb -O gelato_app gelato
```

### 3. Create `.env`

`.env` is not committed. Create it in the repo root:

```dotenv
PORT=3000
DATABASE_URL=postgresql://gelato_app:choose-a-password@127.0.0.1:5432/gelato
SESSION_SECRET=dev-secret-change-me-in-production
```

`dev:api` loads this file automatically.

### 4. Push the schema and seed data

```bash
set -a; . ./.env; set +a
pnpm --filter @workspace/db run push
psql "$DATABASE_URL" -f database/seed.sql
```

The seed is idempotent and creates two branches, three menu items, and sample
stock lots. It does not create users.

## Run

```bash
# terminal 1 — API on http://localhost:3000
pnpm run dev:api

# terminal 2 — web app on http://localhost:5173
pnpm run dev:web
```

Open http://localhost:5173 and register a staff or manager account. In
development the six-digit OTP code is shown on screen and written to the API
logs; production omits it.

## Scripts

| Command | Description |
| --- | --- |
| `pnpm run dev:api` | Run the API server on port 3000 (loads `.env`) |
| `pnpm run dev:web` | Run Vite on port 5173, proxying `/api` to port 3000 |
| `pnpm run build` | Typecheck and build every package |
| `pnpm run typecheck` | Full typecheck across the workspace |
| `pnpm --filter @workspace/api-spec run codegen` | Regenerate API hooks and Zod schemas from the OpenAPI spec |
| `pnpm --filter @workspace/db run push` | Apply Drizzle schema changes (development only) |

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `SESSION_SECRET` | yes | Signs session cookies |
| `PORT` | yes | API port in dev; overridden to 5173 by `dev:web` |
| `API_PROXY_TARGET` | no | Enables the Vite `/api` proxy (set by `dev:web`) |
| `NODE_ENV` | no | `development` exposes demo OTP codes |

## Project layout

| Path | Contents |
| --- | --- |
| `lib/api-spec/openapi.yaml` | API contract and generated-client source |
| `lib/db/src/schema/gelato.ts` | PostgreSQL schema |
| `artifacts/api-server/src/routes/` | Auth, menu, stock, orders, dashboard endpoints |
| `artifacts/gelato-store/src/` | Web app |
| `database/README.md` | Inventory deduction decision |
| `database/seed.sql` | Sample branches, menu items, and stock lots |

## Behavior notes

- A session is issued only after OTP verification.
- Managers can view across branches; staff are restricted to their branch.
- Creating an order atomically reserves menu availability and consumes the
  oldest matching stock lots; payment only records how an order was paid.
- Each order can have at most one recorded payment.

## Troubleshooting

**`EADDRINUSE: address already in use :::3000`** — another API instance is
running:

```bash
ss -ltnp | grep -E ':3000|:5173'
kill <pid>
```

**`/api` returns HTML instead of JSON** — the Vite proxy is not enabled. Make
sure you started the frontend with `pnpm run dev:web` (which sets
`API_PROXY_TARGET=http://127.0.0.1:3000`).

**`. ./.env: No such file or directory`** — create `.env` as described above.

## Running on Replit

Replit provisions PostgreSQL via the `postgresql-16` module and routes traffic
using `.replit` and the artifact configs:

- API: port 8080, served at `/api`
- Web: port 25008, served at `/`

No manual `.env` or local proxy setup is needed there. The `dev:api`/`dev:web`
scripts are for local development.
