# Gelato Store data decisions

## Order inventory reservation

Menu availability and ingredient stock are deducted when an order is created, not when it is paid. The deduction is part of the order transaction: branch availability and matching stock lots are locked, and the order is rejected without changes when either limit is insufficient. Stock is consumed from the oldest imported lot first.

**Why:** This prototype needs to prevent two concurrent sales from over-allocating the same stock or menu availability. Reserving at order creation makes the sale step atomic and avoids allowing a second order to spend inventory already promised to the first.

**How to apply:** Keep the stock reservation, menu availability update, order record, and order lines within one database transaction. A payment only records how the existing order was paid.
