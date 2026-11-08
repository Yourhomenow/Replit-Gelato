# Gelato Store data decisions

## Order inventory reservation

Menu availability and ingredient stock are deducted when an order is created, not when it is paid. The deduction is part of the order transaction: branch availability and matching stock lots are locked, and the order is rejected without changes when either limit is insufficient. Stock is consumed from the oldest imported lot first.

**Why:** This prototype needs to prevent two concurrent sales from over-allocating the same stock or menu availability. Reserving at order creation makes the sale step atomic and avoids allowing a second order to spend inventory already promised to the first.

**How to apply:** Keep the stock reservation, menu availability update, order record, and order lines within one database transaction. A payment only records how the existing order was paid.

## Low stock warning

The warning threshold is **below 2** for each ingredient and unit at a branch. Add the remaining quantity across that ingredient's stock lots before checking the threshold. A total of exactly 2 does not warn. The Inventory page shows the warning to staff and managers; the manager dashboard also shows it. Both use the current stock API data, which refreshes every few seconds.

## Menu availability after restocking

For recipes with ingredients, the available serving count is the smallest whole number of servings supported by the branch's stock for each required ingredient and unit. Ingredient and unit matching ignores letter case and surrounding spaces; units are not converted. Menu responses never show more servings than stock can make. The API recalculates stored availability after a stock lot or recipe changes and once when the API starts, so stock that was already added can restore an item whose old availability count is zero. A staff adjustment remains a temporary serving limit until the next stock or recipe change or API restart. Recipes without ingredient requirements keep their manual availability count.

## Order cancellation

Only unpaid orders created with a recorded stock deduction can be cancelled automatically. Each new order stores the exact lot quantities it consumed. Cancellation restores those lots and the menu serving count in one transaction, then marks the order cancelled. Repeated cancellation, preparation changes, and payment are rejected. Older orders have no deduction record, so cancelling them automatically could restore the wrong lot or amount. Paid orders need a separate refund process.

Apply the schema with `pnpm --filter @workspace/db run push` before running the updated API. The new `stock_deductions` and `cancelled_at` fields are additive.

## Promotions

Managers create and update campaigns with a name, whole percent discount, one or more menu items, start and end times, and an enabled switch. Campaigns apply to all branches. Staff can see only currently active campaigns. The API requires an active manager session for promotion changes. Public registration creates staff accounts only; managers create additional manager accounts through Employee Management.

At order creation, the API applies the highest active discount for each eligible item. Ties use a stable campaign ID order. It rounds the discount to cents per serving, then multiplies by the order quantity. Order lines save the original unit price, discount amount, campaign name, and final line total, so later campaign edits do not change an existing order. The order total and recorded payment amount use the discounted total. The ticket shows an estimate from current campaigns; the server calculates the final amount when the order is saved.

Apply the schema with `pnpm --filter @workspace/db run push`. The `gelato_promotions` table and order line discount fields are additive.
