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

## Stock lot editing (`feat/Stock-Lot-Edit`)

- [x] Add an Edit button to each stock lot and allow its details and remaining quantity to be saved.
- [x] Verify saved changes and rejection of invalid, signed-out, and cross-branch edits against a disposable database.
- [ ] Verify the edit form in a browser.

## Menu availability from stock (`feat/Order-Cancel-Stock-Availability`)

- [x] Recalculate recipe serving counts from matching branch ingredient stock after stock or recipe changes and on API startup.
- [x] Limit displayed menu availability to what the ingredient stock can make.
- [x] Apply the additive schema fields to the local database and reconcile existing stock: Sukhumvit Pistachio Cream returned from 0 to 273 available servings.
- [x] Verify a stock delivery restored availability from 0 to 26 in a disposable database, then a two-serving order reduced it to 24.
- [ ] Verify the menu refresh in a browser after a stock delivery.

## Order cancellation (`feat/Order-Cancel-Stock-Availability`)

- [x] Add a confirmed Cancel order action for unpaid orders with recorded inventory deductions.
- [x] Restore exact stock lot quantities and menu availability in one transaction.
- [x] Verify cancellation, repeated cancellation rejection, multi-lot restoration, paid-order rejection, and cross-branch access in a disposable database.
- [ ] Verify cancellation and restored counts in a browser.
- [ ] Decide how to handle older orders that lack an inventory deduction record; automatic cancellation is disabled for them.

## Integration

- [x] Merge all three feature branches into local `develop` and resolve the `App.tsx` import conflict.
- [x] Run the full workspace typecheck and build after merging.
- [ ] Push `develop` when ready; the merge is local only.

## Manager financial summary (`feat/Manager-Financial-Summary`)

- [x] Add a manager-only Finance page for the selected branch.
- [x] Show all-time paid revenue, paid order count, average paid order, and revenue by payment method.
- [x] Restrict the financial API to managers and hide dashboard revenue from staff.
- [x] Verify manager access, staff and signed-out rejection, totals, and hidden staff revenue against the local API.
- [x] Run the full workspace typecheck and build.
- [ ] Check the page visually in a browser.
