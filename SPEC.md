# SPEC — Gelato Store Management (Prototype)

Goal: one working sale flow, end to end, through DB, API, and screen. Everything else comes after.

**Roles:** `staff`, `manager`. Manager can do everything staff can unless noted.
**Branches:** each user belongs to a branch. Managers can view across branches.

## Prototype shortcuts (allowed)
- **OTP:** call `sendOtp(phone, code)`. The prototype implementation logs the code to the server console. Swap in an SMS provider later.
- **Payments:** record method (`qr` | `card` | `transfer`), amount, status. No gateway.
- **"Real-time":** polling every few seconds is enough.
- **Alerts:** a flag or list on the manager dashboard. No push notifications.
- **Purchase orders:** create and track records. No sending to suppliers.
- **IDs:** every account and inventory item gets a unique, indexed ID.

## Core sale flow (build in order)

### S1 Auth
- Staff and managers register and sign in with credentials.
- OTP to the registered phone is required before a session exists.
- **Done when:** wrong password or OTP is rejected; no session before OTP; role is in the session; role-protected routes reject the wrong role.

### S2 Menu and availability
- Manager creates and updates menu items: recipe, ingredient requirements, storage guidelines, unit price.
- Staff and manager view a menu item's details and search menu items by keyword.
- Staff adjust a menu item's remaining availability quantity.
- **Done when:** manager edits persist; search finds by keyword; staff cannot edit recipes or prices.

### S3 Stock
- Staff and manager register stock lots: quantity, import date, supplier, shelf-life.
- Manager audits current stock levels. Staff and manager search stock by keyword.
- **Done when:** a registered lot appears in the audit; search finds by keyword.

### S4 Orders
- Staff create orders with customizations (size, toppings, flavor).
- Validate against stock and availability. Over-allocation must be impossible, including with two simultaneous orders.
- **Done when:** a valid order stores and reduces what it must; an over-limit order is rejected with a clear message.

### S5 Preparation status
- Staff update status: `blending` → `resting` → `ready to serve`.
- Staff and manager see current statuses (polling).
- **Done when:** a status change appears on another screen without a manual reload.

### S6 Payment
- Record payment for an order via QR, card, or bank transfer.
- **Done when:** one order cannot be paid twice, even if the request is repeated.

## After the core (priority order)
- **Reports:** daily itemized sales (staff + manager). Branch financial summary, branch sales summary, cross-branch comparison (manager).
- **Low-stock alerts:** manager sees items below the safety threshold.
- **Purchase orders:** manager issues purchase orders for replenishment.
- **Members:** staff search by phone or full name, register, and update member accounts.
- **Promotions:** manager configures and updates campaigns (name, discount rate, applicable menu items, active duration).

## Open decisions (decide when you reach them)
- Do promotions change order totals at checkout? Not specified.
- Does an order deduct stock on creation or on payment? Pick one, record it in `database/README.md`.
- What safety threshold is used for low-stock: per item or global?

## Not in the prototype
Real SMS, real payment gateway, push notifications, animations, visual polish, multi-language.