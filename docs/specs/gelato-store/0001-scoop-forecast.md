# 0001. Scoop Forecast

**Date**: 2026-11-13
**Status**: Accepted

## Summary

Give managers a seven day branch outlook and a tomorrow preparation list using recorded sales, Open-Meteo weather, and Nager.Date public holidays. The user authorized implementation of this proposal on `feat/implement-external-api-Scoop-Forecast`.

## Context

The prototype stores paid orders, menu recipes, branch availability, and ingredient stock. Branches have no location data. The existing cream and green interface is the visual source. There is no AGENTS.md, scope row, or test runner. Build one coherent slice through settings, services, API, and the manager page.

## Requirements

1. AC-1: Only managers may read forecasts or save location settings. Every request selects one existing branch by UUID.
2. AC-2: Managers can find a city and select a result to fill latitude, longitude, country, and timezone. Country and timezone use dropdowns. Exact coordinates remain editable. Managers can save these settings per branch. An unconfigured branch shows a setup state without invented weather.
3. AC-3: Show today and the next six local dates, maximum temperature, maximum rain probability, national public holidays, expected servings, and each adjustment explanation.
4. AC-4: Show tomorrow's highest preparation gaps, comparing serving targets with current menu availability. Show ingredient shortages against usable stock. This feature never changes orders, stock, availability, or promotions.
5. AC-5: Explain sparse history, missing providers, unsupported countries, and stale cached data. Do not treat missing holiday coverage as proof that there are no holidays. Do not display numerical targets until there are seven complete observed calendar days and three distinct selling days.
6. AC-6: Match existing UI, support mobile and keyboard use, provide loading, retry, save feedback, and keep requests scoped when switching branches.
7. AC-7: Verify timezone boundaries, year boundaries, zero sales days, archived menu items, provider timeouts, cache fallback, validation, and authorization with automated checks and the running app.

## Decision

Use existing React, Express, Drizzle, generated OpenAPI clients, and native fetch. Keep the forecast as an explained planning heuristic. A trained model would require a much larger verified history. Persist only branch settings in a new table. Fetch provider data on the server with bounded timeouts and an in memory cache. Match the existing page styles and lucide icons, without new images or UI dependencies.

## Feature design

### Data model

`gelato_forecast_settings` has one row per branch: `branch_id` UUID primary key and cascading foreign key to branches, required `latitude` double precision from -90 to 90, `longitude` double precision from -180 to 180, `country_code` uppercase two letter ISO code, and `timezone` text validated with Intl.DateTimeFormat. Save uses an atomic upsert. Include an additive SQL migration and apply it to the local development database.

### API surface

| Endpoint | Method | Inputs | Outputs | Authorization | Errors |
| --- | --- | --- | --- | --- | --- |
| `/branches/{id}/forecast-settings` | PUT | Latitude, longitude, countryCode, timezone | Saved settings | Manager session | 400 invalid input, 404 unknown branch |
| `/dashboard/scoop-forecast` | GET | Required branchId UUID | Branch, nullable settings, history, provider statuses, seven days, tomorrow prep and ingredient gaps | Manager session | 400 invalid input, 404 unknown branch |
| `/forecast/locations` | GET | Required q string 2 to 100 characters, optional countryCode | Up to eight matching cities with coordinates, country, region, timezone, fresh or stale status | Manager session | 400 invalid input, 503 search unavailable |

Use generated Zod request and response schemas. Return an empty forecast with nullable history and provider metadata when no settings exist. A database error remains an API error, while provider failure permits a partial result.

### Value sourcing and rules

| Value | Source and derivation |
| --- | --- |
| Branch and location | Requested branch row and its saved settings, never inferred from the manager's browser |
| Local today | Server clock formatted in the saved IANA timezone; date arithmetic uses date strings, never host timezone |
| History window | Last 28 complete local calendar days, shortened to the first recorded paid, noncancelled sale if more recent |
| Historical servings | Order line quantities joined to paid payments and noncancelled orders in this branch; local sales day comes from payment paidAt |
| Data sufficiency | At least seven complete calendar days since the first sale and at least three distinct selling days in the window |
| Baseline | For each active menu item, average quantities on the same weekday in the history window, including zero sale dates; archived items never enter preparation targets |
| Weather | Open-Meteo daily temperature_2m_max, precipitation_probability_max, weather_code for saved coordinates and timezone, forecast_days=7 |
| Holiday | Nager.Date AvailableCountries then PublicHolidays for each year intersecting the seven dates; apply only global holidays with types containing Public |
| Adjustment | Add 15 percentage points at max temperature >=30 Celsius, subtract 15 at rain probability >=60%, add 10 for a known national public holiday; factor = 1 + points/100. Missing inputs contribute zero and are disclosed |
| Serving target | Ceil each item's weekday average times the factor, sum those rounded targets for the daily total; null when history is insufficient |
| Tomorrow prep | Next local date; max(0, target minus branch menu availability); label availability as serving capacity because it derives from ingredients, not already prepared inventory; list up to 20 items sorted by extra servings then name, disclose total item count |
| Ingredient gaps | Sum full tomorrow targets times recipe quantityPerServing across all items, matching trimmed case insensitive ingredient names and units as the existing stock engine does; compare remaining branch stock where importDate <= tomorrow and shelfLife is null or >= tomorrow; return up to 20 shortages, disclose count. Use full targets because availability already represents potential from this same stock and shared ingredients cannot be counted twice |
| History confidence | Window dates, calendar days, selling days, total sold servings, and explicit sufficiency flag; show the heuristic explanation |
| Provider freshness | Cached successful fetch timestamp and status fresh/stale/unavailable/unsupported. Cache TTL weather 30 minutes, country/holidays 24 hours; stale weather at most 24 hours, stale holiday data at most seven days; retry failed fetch after one minute. Never pass stale countries as authoritative unsupported coverage |

### Provider and security boundaries

Use fixed HTTPS provider origins. Four second timeout per request. Validate provider payload shapes and ranges, do not expose provider URLs containing API keys in logs. Deduplicate concurrent fetches and bound each cache to 100 entries. Unsupported country coverage is explicit. A public holiday name is rendered as text. All endpoints require authentication and manager authorization before any provider call or mutation.

Optional `OPEN_METEO_API_KEY` switches weather calls to the fixed customer-api.open-meteo.com origin. Without it, use api.open-meteo.com for the prototype. Document that commercial use requires the provider's commercial subscription. No credentials are required for Nager.Date.

City search uses Open-Meteo's geocoding API on geocoding-api.open-meteo.com, or customer-geocoding-api.open-meteo.com with the same optional commercial key. Search happens on explicit button or Enter, with up to eight results and an optional country filter. Validate provider coordinates, country code, and timezone. Use a four second timeout and bounded cache with 24 hour TTL and at most seven day stale fallback. A provider outage leaves manual coordinate entry usable. City names are display data and are not persisted. A selection fills all four settings together. Changing country clears previous results and coordinates so an earlier city cannot be saved under a different country. Editing city search text hides old results. Stale search data is disclosed.

Country choices come from the complete ISO 3166 alpha 2 code list with English names from Intl.DisplayNames, independently of holiday coverage. Timezone choices come from Intl.supportedValuesOf('timeZone'), plus UTC, any saved timezone, and any selected city timezone to preserve valid IANA aliases. The existing form styles and native selects are the visual source. No new dependencies or database changes are required for this enhancement.

### Page

Add manager navigation and route `/scoop-forecast`, tied to the existing selected branch. Order: heading and refresh/settings actions, location setup/editor, provider notices, history summary, seven day cards, tomorrow prep table and ingredient shortages, methodology and provider attribution links. A branch change remounts the page so unsaved settings and errors cannot leak. Keep existing cream backgrounds, green accents, typefaces, buttons, and form conventions. Date labels use returned branch local dates; units are servings and Celsius. Null values show unavailable or gathering history, never zero. Disable repeated save/refresh while pending and announce errors and save results. Only a location change writes data.

## Build plan

- [x] Add settings schema, SQL migration, OpenAPI contract and generated types. Satisfies AC-1, AC-2.
- [x] Build provider cache and pure calendar/forecast calculations, then authorized routes. Satisfies AC-1 through AC-5.
- [x] Build manager page, branch setup, navigation, responsive styling and attribution. Satisfies AC-2 through AC-6.
- [x] Apply and inspect local schema, run forecast regression checks, typecheck and production builds, exercise API and browser flows. Satisfies AC-7.

## Consequences

Weather and holiday weights are initial business rules, not measured causal effects or guaranteed demand. Zero sale dates are treated as zero since the first recorded sale because opening schedules are not stored. Inventory quantities reflect the time the page loads and shared ingredients may have other uses. Recipe units must match stock units. In memory caches reset on restart and are independent per process. Nager.Date does not cover every country or every regional observance. Commercial weather access needs a subscription.

## Rationale

This gives a useful daily planning view using existing data and two small integrations. A weather widget alone is simpler but does not support preparation. A trained demand model could improve accuracy later but requires more data, measurement, and operations than this prototype has.

## Follow-up

Measure forecast error before tuning weights. Add opening schedules, regional holidays, and batch size rules when requested.
