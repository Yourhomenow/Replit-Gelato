# Todo

## Employee Management (`feat/Employee-Management`)

- [x] Add manager-only employee list, creation, editing, and active status controls.
- [x] Add employee API endpoints and update the API contract.
- [x] Keep employee work on its own feature branch and merge it into `develop`.
- [ ] Verify the full flow against a running database and browser.
- [ ] Review public registration, which still lets a new user choose the manager role.

## Stock refresh (`feat/Stock-Realtime`)

- [x] Confirm the existing order flow deducts recipe ingredients and menu availability based on order quantity.
- [x] Refresh stock and menu data after an order; poll the Inventory and Menu views every 3 seconds.
- [x] Verify with a disposable database: 2 vanilla servings reduced stock from 4.5 kg to 4.2 kg and availability from 20 to 18; an over-limit order was rejected without another deduction.
- [ ] Verify the refresh timing in a browser.

## Low stock alerts (`feat/Low-Stock-Alerts`)

- [x] Warn below 2 units per ingredient and unit, totaled across lots at the selected branch.
- [x] Show the warning on Inventory and on the manager dashboard.
- [x] Record the threshold rule in `database/README.md`.
- [ ] Verify the warning appears and clears in a browser as stock changes.

## Integration

- [x] Merge all three feature branches into local `develop` and resolve the `App.tsx` import conflict.
- [x] Run the full workspace typecheck and build after merging.
- [ ] Push `develop` when ready; the merge is local only.
