# Review, feat/implement-external-api-Scoop-Forecast, 2026-11-13

**Reviewed by**: GPT-6 independent reviewer (author on gpt-6.1-sol)
**Scope**: 26 files, uncommitted
**Verdict**: Approve

## Summary
The change adds manager-only branch location settings, a seven-day explained serving forecast, provider freshness handling, and tomorrow's preparation and ingredient checks. The final reviewed tree has no outstanding correctness findings. Three concrete issues discovered during review were fixed by the author and rechecked: PostgreSQL grouping of parameterized timezone expressions, rounding at exact serving boundaries, and malformed weather codes escaping the provider boundary. Approval covers the code review; live database, HTTP authorization, and browser verification remain separate gates being performed by the implementation agent.

## Resolved during review
- `Replit-Gelato-replit-agent/artifacts/api-server/src/routes/gelato-forecast.ts:75`: Repeating the parameterized sales date expression in `GROUP BY` generated separate timezone placeholders from the selected expression, causing PostgreSQL grouping failure. The author now groups by the selected date column using a fixed `GROUP BY 1` expression; the timezone remains safely parameterized.
- `Replit-Gelato-replit-agent/artifacts/api-server/src/lib/scoop-forecast.ts:57`: A 50-serving baseline with a 10 percent holiday increase produced 56 because floating point multiplication yielded `55.00000000000001` before `ceil`. Integer numerator arithmetic now returns 55, verified against the actual calculation function and a new regression test.
- `Replit-Gelato-replit-agent/artifacts/api-server/src/lib/forecast-providers.ts:119`: A fractional weather code was accepted and cached as fresh even though the response schema requires an integer, allowing malformed provider data to fail the forecast endpoint. Integer codes and consecutive dates are now checked inside the cache loader. A direct malformed-payload check now returns `unavailable`.

## Strengths
- Authentication and manager authorization precede settings mutation and external provider calls; branch selection is validated and no forecasting path mutates sales or stock.
- Calendar arithmetic uses branch local dates, zero-sales dates remain in weekday averages, and insufficient history produces null targets.
- Ingredient demand uses the entire tomorrow mix before output truncation, aggregates shared ingredients, and excludes stock unusable tomorrow.
- Successful provider data has bounded caches, deduplicated refreshes, failure cooldowns, and explicit stale, unavailable, and unsupported states.
- The generated contract is driven by OpenAPI, and branch-scoped query keys plus the keyed page prevent form state leaking between branches.

## Test coverage
Executed `node tests/scoop-forecast.test.ts` in the API server package: all 12 tests passed. Coverage includes local timezone and year boundaries, weekday zero-sales denominators, excluded archived items, sparse history, additive adjustments, exact integer rounding, shared ingredient demand, expired and future lots, list truncation, cache deduplication and fallback, malformed weather payloads, unsupported holiday coverage, and cross-year national holiday filtering. Additional direct module probes confirmed the rounding correction and fractional weather-code rejection.

These module tests do not execute the SQL against PostgreSQL, exercise HTTP authentication and settings validation, or drive branch switching and save feedback in a browser. Those checks remain part of the separate running-app verification required by AC-7; this review does not claim they passed.
