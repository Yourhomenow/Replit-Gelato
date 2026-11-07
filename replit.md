# Gelato Store

A branch-aware gelato shop prototype that lets staff and managers manage menu availability, place orders, track preparation, and record payment.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (development only)
- Required environment: `DATABASE_URL`, `SESSION_SECRET`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Frontend: React + Vite

## Where things live

- `lib/api-spec/openapi.yaml` — API contract and generated client source
- `lib/db/src/schema/gelato.ts` — PostgreSQL schema
- `artifacts/api-server/src/routes/` — authentication, menu, stock, orders, and dashboard endpoints
- `artifacts/gelato-store/src/` — web app
- `database/README.md` — inventory deduction decision
- `database/seed.sql` — sample branches, menu items, and stock lots

## Architecture decisions

- Users receive a session only after OTP verification; development mode also returns the prototype code for the demo.
- Managers may view across branches; staff are restricted to their assigned branch.
- Order creation atomically reserves menu availability and consumes the oldest matching stock lots.
- Each order can have one recorded payment; the database enforces one payment per order.

## Product

Staff can search the menu, customize and place an order, advance preparation status, and record a QR, card, or transfer payment. Managers can maintain recipes and prices, inspect branch stock, and register stock lots. Reports, alerts, purchase orders, members, and promotions are deferred.

## User preferences

- Keep the prototype focused on the current slice; prioritize working behavior over polish.

## Gotchas

- Apply schema updates with `pnpm --filter @workspace/db run push` in development.
- `database/seed.sql` is safe to re-run and provides two branches plus sample menu and stock data.
- Prototype OTP codes appear in development API server logs and in the development response; production responses omit the code.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
