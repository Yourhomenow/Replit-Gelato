# 0002. Financial report periods

**Date**: 2026-11-13
**Status**: Accepted

## Summary

Let managers filter financial totals by a Monday to Sunday week, a range of whole months, or inclusive custom calendar dates. The user requested implementation on `feat/add-scope-to-finance-summery`.

## Context

The existing financial summary aggregates paid payments for a selected branch or all branches, without date limits. Payment time is stored in `gelato_payments.paid_at`. The page uses generated React Query hooks and existing cream and green form styles. There is no matching scope row or AGENTS.md.

## Requirements

1. AC-1: Managers can select All time, Week, Month range, or Custom dates. Week means Monday through Sunday containing the chosen date. Month range includes the first day of the start month through the last day of the end month, including years.
2. AC-2: Applying a period updates paid revenue, paid order count, average paid order, and payment method totals together for the selected branch. All time remains the default.
3. AC-3: Both endpoints of a selected date range include their full local calendar day. The reporting timezone is visible and editable, initially the browser's IANA timezone. The API defaults to UTC for callers omitting timezone.
4. AC-4: Empty, reversed, invalid, or incomplete ranges are rejected without running the report query. Unpaid payments remain excluded. No matching payments produces zero totals and a clear empty state.
5. AC-5: Editing filters does not relabel the currently displayed totals. Apply commits the draft filter. Branch switching preserves the applied period and timezone while fetching that branch's values. Staff and unauthenticated callers remain excluded.
6. AC-6: Verify weekly and monthly boundaries, leap years, timezone midnight, daylight saving changes, payment dates differing from order dates, branch isolation, validation, browser controls, mobile layout, typecheck, and build.

## Decision

Extend the existing endpoint in place. Keep its paid payment semantics, branch behavior, and currency formatting. Use native date and month controls, the existing timezone dropdown options, generated OpenAPI clients, and PostgreSQL local calendar date conversion. No new dependencies or database schema changes are needed. Build the API and its page as one coherent slice.

## Feature design

### API and security

`GET /dashboard/financial` remains authenticated and manager restricted. Optional query fields are `branchId` UUID, paired `startDate` and `endDate` in strict YYYY-MM-DD format, and `timezone` (valid IANA timezone, default UTC). Require date and timezone query values to be single strings. Dates must be real Gregorian dates in years 0001 through 9999, with startDate <= endDate. Reject one missing endpoint, blanks, arrays, impossible dates, year zero, and invalid timezone names or fixed offset strings with 400. Unknown branch remains 404.

The response retains its existing fields and adds required nullable `startDate` and `endDate`, plus required `timezone`. No dates means All time. These response fields describe the exact period used for the returned totals.

### Value sourcing

| Value | Source |
| --- | --- |
| Sales timestamp | Payment paidAt, never order createdAt |
| Payment calendar date | `(paid_at AT TIME ZONE reportingTimezone)::date`, mapping each payment instant to its local date without ambiguous midnight inversion |
| Start bound | Payment calendar date >= selected start date |
| End bound | Payment calendar date < end date + one calendar day, including repeated midnights and naturally returning no payments for skipped calendar days |
| Totals | Existing paid status filter and optional branch filter, plus the payment calendar date bounds |
| Average | Rounded revenueCents divided by paidOrders, zero when there are no paid orders |
| Week | Monday and Sunday derived from the selected anchor date with UTC calendar arithmetic on date strings |
| Month range | First day of selected start month and last calendar day of selected end month; month inputs include years |
| Initial controls | Browser local today and IANA timezone from Intl; API caller fallback UTC |
| Displayed period | Returned startDate, endDate, and timezone, not an unapplied draft |

### Page

Keep the existing report heading, three summary cards, and revenue by method. Add a filter form before them. Period type defaults to All time. Week displays a date picker labeled Week containing and a preview of Monday through Sunday. Month range uses From month and Through month. Custom dates uses From date and Through date. All modes expose a Reporting timezone dropdown, initialized from the browser and retaining valid IANA aliases. Apply period commits the validated draft and changes the query key. Keep filters available during loading and API errors. Disable only repeat requests for an unchanged pending period, allow validation messages, and announce the applied report period. Show zero totals and an explanatory note for no matching paid payments. Use semantic labels, native keyboard controls, responsive layout, and the existing UI style.

## Build plan

- [x] Extend the OpenAPI contract, regenerate clients, add strict period parsing, and filter paidAt in the manager API. Satisfies AC-2 through AC-5.
- [x] Add calendar helpers and the period filter form with applied period labels, empty and error states. Satisfies AC-1 through AC-5.
- [x] Add and run calendar regression tests, local API boundary checks, browser and mobile verification, full typecheck and production build. Satisfies AC-6.

## Consequences

Different reporting timezones can intentionally include different transactions around midnight, so the timezone is shown with each period. All branch reports use one explicit reporting timezone for a consistent interval. Historical paid and cancelled order semantics remain those of the existing report; refunds are outside this change. The existing paid_at column is not indexed, so very large histories may later need a measured query optimization.

## Rationale

An inclusive calendar range expresses both requested examples and arbitrary dates without adding separate weekly and monthly APIs. An in place extension keeps the existing report and avoids introducing a second accounting implementation.
