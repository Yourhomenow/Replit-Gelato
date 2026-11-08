# Gelato Store

A branch-aware gelato shop management prototype. Staff can manage orders and preparation, while managers can oversee branches, menu items, stock, promotions, and financial summaries.

> The application workspace is in [`Replit-Gelato-replit-agent/`](Replit-Gelato-replit-agent/). Run the commands below from that directory.

## Features

- Staff and manager accounts, with phone OTP verification before a session is created.
- Branch-aware access: staff work within their assigned branch; managers can view across branches.
- Menu and availability management, including recipes, ingredient requirements, and prices.
- Stock lot registration, stock auditing, and low-stock warnings.
- Order creation with customizations, preparation status tracking, and QR, card, or bank-transfer payment records.
- Manager tools for promotions, employees, and financial summaries.

This is a prototype: OTP delivery and payment processing are not connected to external providers. In development, OTP codes are logged by the API and included in the development response; production responses omit the code. Payments are recorded, not processed by a gateway.

## Tech stack

- Node.js 24 and pnpm workspaces
- TypeScript
- React and Vite frontend
- Express API
- PostgreSQL with Drizzle ORM
- Zod validation and generated API clients

## Prerequisites

- Node.js 24
- pnpm
- PostgreSQL

The API requires `DATABASE_URL` and `SESSION_SECRET` environment variables. The Replit development setup uses a local PostgreSQL instance on port `55433`; configure these variables for your own environment before starting the services.

## Getting started

```bash
cd Replit-Gelato-replit-agent
pnpm install
```

Set `DATABASE_URL` and `SESSION_SECRET` in a local `.env` file, then apply the development database schema:

```bash
pnpm --filter @workspace/db run push
```

To load the sample branches, menu items, and stock lots, run `database/seed.sql` against the configured PostgreSQL database using your preferred PostgreSQL client.

Start the API and web app in separate terminals:

```bash
pnpm run dev:api
```

```bash
pnpm run dev:web
```

The web app is available at [http://localhost:5173](http://localhost:5173). Its development server proxies API requests to `http://127.0.0.1:3000`.

## Useful commands

Run from `Replit-Gelato-replit-agent/`:

| Command | Description |
| --- | --- |
| `pnpm run dev:api` | Build and start the API in development mode. |
| `pnpm run dev:web` | Start the Vite development server. |
| `pnpm run typecheck` | Typecheck libraries, artifacts, and scripts. |
| `pnpm run build` | Typecheck and build workspace packages. |
| `pnpm --filter @workspace/db run push` | Push schema changes to the development database. |
| `pnpm --filter @workspace/api-spec run codegen` | Regenerate API clients and schemas from the OpenAPI specification. |

Use pnpm to install dependencies; the workspace's `preinstall` script rejects other package managers.

## Repository structure

```text
Replit-Gelato-replit-agent/
├── artifacts/
│   ├── api-server/       # Express API and routes
│   ├── gelato-store/     # React/Vite web application
│   └── mockup-sandbox/   # UI mockup sandbox
├── database/             # Seed data and data/inventory decisions
├── lib/
│   ├── api-client-react/ # Generated React API client
│   ├── api-spec/         # OpenAPI specification and code generation
│   ├── api-zod/          # Generated Zod schemas
│   └── db/               # Drizzle schema and database package
└── scripts/              # Workspace scripts
```

## Project notes

- [`SPEC.md`](SPEC.md) describes the prototype goals and product requirements.
- [`Replit-Gelato-replit-agent/replit.md`](Replit-Gelato-replit-agent/replit.md) contains workspace-specific run instructions and architecture notes.
- [`Replit-Gelato-replit-agent/database/README.md`](Replit-Gelato-replit-agent/database/README.md) records data decisions, including inventory reservation, low-stock thresholds, and promotions.
- [`Replit-Gelato-replit-agent/lib/api-spec/openapi.yaml`](Replit-Gelato-replit-agent/lib/api-spec/openapi.yaml) is the API contract.

## Prototype behavior

Inventory and menu availability are reserved when an order is created, as part of the order transaction. A payment records how an existing order was paid; it does not reserve stock. The prototype uses polling for status updates and does not send supplier purchase orders or push notifications.
