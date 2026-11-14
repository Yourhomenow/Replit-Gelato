import assert from "node:assert/strict";
import { test } from "node:test";
import { addDays, calculateForecast, localDate } from "../src/lib/scoop-forecast.ts";
import { createForecastProviders, ForecastCache } from "../src/lib/forecast-providers.ts";

const menu = [{ id: "pistachio", name: "Pistachio", availability: 1, ingredients: [{ ingredientName: "Milk", unit: "l", quantityPerServing: 0.1 }] }];
const today = "2026-11-13";
const base = {
  today, firstSaleDate: addDays(today, -28), menu, weather: [], holidays: [], stock: [],
  sales: [
    { date: "2026-10-17", menuItemId: "pistachio", quantity: 8 },
    { date: "2026-10-24", menuItemId: "pistachio", quantity: 8 },
    { date: "2026-10-31", menuItemId: "pistachio", quantity: 8 },
    // The fourth Saturday has no sales and must remain in the denominator.
  ],
};

test("calendar dates use branch timezones and survive daylight saving and year boundaries", () => {
  const instant = new Date("2026-12-31T18:30:00Z");
  assert.equal(localDate(instant, "Asia/Bangkok"), "2027-01-01");
  assert.equal(localDate(instant, "America/Los_Angeles"), "2026-12-31");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2026-03-08", 1), "2026-03-09");
  assert.equal(addDays("2028-02-28", 1), "2028-02-29");
});

test("weekday baseline includes zero sale days, excludes today/outside window and ignores archived items", () => {
  const result = calculateForecast({ ...base, sales: [...base.sales,
    { date: today, menuItemId: "pistachio", quantity: 1000 },
    { date: "2026-10-10", menuItemId: "pistachio", quantity: 1000 },
    { date: "2026-10-17", menuItemId: "archived", quantity: 20 },
  ] });
  assert.equal(result.history.calendarDays, 28);
  assert.equal(result.history.sufficient, true);
  assert.equal(result.days[1].expectedServings, 6);
  assert.deepEqual(result.prep, [{ menuItemId: "pistachio", name: "Pistachio", targetServings: 6, availableServings: 1, extraServings: 5 }]);
});

test("new or sparse branches have null targets rather than fabricated demand", () => {
  for (const input of [
    { ...base, firstSaleDate: null, sales: [] },
    { ...base, firstSaleDate: "2026-11-10", sales: [{ date: "2026-11-10", menuItemId: "pistachio", quantity: 4 }] },
    { ...base, sales: base.sales.slice(0, 2) },
  ]) {
    const result = calculateForecast(input);
    assert.equal(result.history.sufficient, false);
    assert.ok(result.days.every((day) => day.expectedServings === null));
    assert.deepEqual(result.prep, []);
    assert.deepEqual(result.ingredientGaps, []);
  }
});

test("observed history starts at first sale rather than assuming a new branch was open for 28 days", () => {
  const result = calculateForecast({ ...base, firstSaleDate: "2026-11-01", sales: [
    { date: "2026-11-01", menuItemId: "pistachio", quantity: 4 },
    { date: "2026-11-02", menuItemId: "pistachio", quantity: 4 },
    { date: "2026-11-07", menuItemId: "pistachio", quantity: 10 },
  ] });
  assert.equal(result.history.calendarDays, 12);
  assert.equal(result.days[1].expectedServings, 10);
});

test("weather and holiday adjustments add together and round each menu target up", () => {
  const result = calculateForecast({ ...base,
    weather: [{ date: "2026-11-14", maxTemperatureC: 30, rainProbabilityPercent: 60, weatherCode: 61 }],
    holidays: [{ date: "2026-11-14", name: "Example holiday" }],
  });
  assert.equal(result.days[1].adjustmentPercent, 10);
  assert.equal(result.days[1].expectedServings, 7);
  assert.equal(result.days[1].reasons.length, 3);
  assert.equal(calculateForecast(base).days[1].adjustmentPercent, 0);
});

test("ingredient check uses the full mix and aggregates shared recipes, ignoring expired/future stock", () => {
  const result = calculateForecast({ ...base,
    menu: [...menu, { ...menu[0], id: "vanilla", name: "Vanilla", availability: 10 }],
    sales: [...base.sales, ...base.sales.map((sale) => ({ ...sale, menuItemId: "vanilla" }))],
    stock: [
      { ingredientName: " milk ", unit: "L", quantity: 0.5, importDate: "2026-11-01", shelfLife: "2026-11-14" },
      { ingredientName: "Milk", unit: "l", quantity: 10, importDate: "2026-11-01", shelfLife: "2026-11-13" },
      { ingredientName: "Milk", unit: "l", quantity: 10, importDate: "2026-11-15", shelfLife: null },
    ],
  });
  assert.deepEqual(result.ingredientGaps, [{ ingredientName: "Milk", unit: "l", requiredQuantity: 1.2, availableQuantity: 0.5, shortageQuantity: 0.7 }]);
  assert.equal(result.days[1].expectedServings, 12);
});

test("whole serving targets do not round up from floating point noise", () => {
  const result = calculateForecast({ ...base,
    sales: base.sales.map((sale) => ({ ...sale, quantity: 200 })),
    holidays: [{ date: "2026-11-14", name: "Holiday" }],
  });
  assert.equal(result.days[1].expectedServings, 165);
  const fifty = calculateForecast({ ...base,
    sales: [...base.sales.map((sale) => ({ ...sale, quantity: 50 })), { date: "2026-11-07", menuItemId: "pistachio", quantity: 50 }],
    holidays: [{ date: "2026-11-14", name: "Holiday" }],
  });
  assert.equal(fifty.days[1].expectedServings, 55);
});

test("bounded prep list does not truncate total demand or ingredient checks", () => {
  const items = Array.from({ length: 25 }, (_, i) => ({ ...menu[0], id: `item-${i}`, name: `Item ${i}` }));
  const result = calculateForecast({ ...base, menu: items, sales: items.flatMap((item) => base.sales.map((sale) => ({ ...sale, menuItemId: item.id }))) });
  assert.equal(result.prep.length, 20);
  assert.equal(result.prepItemCount, 25);
  assert.equal(result.days[1].expectedServings, 150);
  assert.equal(result.ingredientGaps[0].requiredQuantity, 15);
});

test("cache deduplicates requests, falls back with timestamps and stops serving old data", async () => {
  let now = Date.parse("2026-11-13T00:00:00Z");
  let calls = 0;
  const cache = new ForecastCache<number[]>(1000, 120_000, () => now);
  const load = async () => { calls++; return [1]; };
  const results = await Promise.all([cache.get("branch", load), cache.get("branch", load)]);
  assert.equal(calls, 1);
  assert.equal(results[0].status, "fresh");
  now += 2000;
  const fail = async (): Promise<number[]> => { calls++; throw new Error("timeout"); };
  const stale = await cache.get("branch", fail);
  assert.equal(stale.status, "stale");
  assert.equal(stale.fetchedAt, results[0].fetchedAt);
  await cache.get("branch", fail);
  assert.equal(calls, 2);
  now += 121_000;
  assert.equal((await cache.get("branch", fail)).status, "unavailable");
});

const settings = { latitude: 13.7563, longitude: 100.5018, countryCode: "TH", timezone: "Asia/Bangkok" };
const response = (value: unknown) => new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } });

test("weather request uses fixed HTTPS host, branch coordinates and timezone; malformed responses degrade", async () => {
  let requested: URL | undefined;
  const providers = createForecastProviders(async (input) => {
    requested = new URL(String(input));
    return response({ daily: { time: Array.from({ length: 7 }, (_, i) => addDays(today, i)), temperature_2m_max: [30,30,30,30,30,30,30], precipitation_probability_max: [0,0,0,0,0,0,0], weather_code: [0,0,0,0,0,0,0] } });
  });
  assert.equal((await providers.weather(settings, today)).data?.length, 7);
  assert.equal(requested?.searchParams.get("timezone"), "Asia/Bangkok");
  assert.equal(requested?.searchParams.get("latitude"), "13.7563");
  assert.equal(requested?.protocol, "https:");
  const invalid = createForecastProviders(async () => response({ daily: { time: [today] } }));
  assert.equal((await invalid.weather(settings, today)).status, "unavailable");
  const unavailable = createForecastProviders(async () => { throw new Error("timeout"); });
  assert.equal((await unavailable.weather(settings, today)).status, "unavailable");
});

test("holiday unsupported coverage is distinct from provider failure or a successful empty calendar", async () => {
  let calls = 0;
  const unsupported = createForecastProviders(async () => { calls++; return response([{ countryCode: "IT" }]); });
  assert.equal((await unsupported.holidays("TH", [today])).status, "unsupported");
  assert.equal(calls, 1);
  const failed = createForecastProviders(async () => new Response("failure", { status: 503 }));
  assert.equal((await failed.holidays("TH", [today])).status, "unavailable");
  const empty = createForecastProviders(async (input) => String(input).endsWith("AvailableCountries") ? response([{ countryCode: "TH" }]) : response([]));
  const result = await empty.holidays("TH", [today]);
  assert.equal(result.status, "fresh");
  assert.deepEqual(result.data, []);
});

test("fractional weather codes and nonconsecutive dates are rejected before response validation", async () => {
  const validDaily = {
    time: Array.from({ length: 7 }, (_, i) => addDays(today, i)),
    temperature_2m_max: Array(7).fill(30), precipitation_probability_max: Array(7).fill(0), weather_code: Array(7).fill(0),
  };
  for (const daily of [
    { ...validDaily, weather_code: [1.5, 0, 0, 0, 0, 0, 0] },
    { ...validDaily, time: [today, '2026-12-01', ...validDaily.time.slice(2)] },
  ]) {
    const providers = createForecastProviders(async () => response({ daily }));
    assert.equal((await providers.weather(settings, today)).status, 'unavailable');
  }
});

test("holiday lookup spans both years and includes only national public holidays", async () => {
  const requests: string[] = [];
  const providers = createForecastProviders(async (input) => {
    const url = String(input); requests.push(url);
    if (url.endsWith("AvailableCountries")) return response([{ countryCode: "IT" }]);
    const year = url.includes("/2026/") ? "2026" : "2027";
    return response([
      { date: `${year}-01-01`, name: "New Year", countryCode: "IT", global: true, types: ["Public"] },
      { date: `${year}-01-02`, name: "Regional", countryCode: "IT", global: false, types: ["Public"] },
      { date: `${year}-01-03`, name: "School", countryCode: "IT", global: true, types: ["School"] },
    ]);
  });
  const result = await providers.holidays("IT", ["2026-12-31", "2027-01-01", "2027-01-02", "2027-01-03"]);
  assert.equal(result.status, "fresh");
  assert.equal(requests.length, 3);
  assert.deepEqual(result.data, [{ date: "2027-01-01", name: "New Year" }]);
});

test("city search uses a country filter and maps coordinates and timezone for selection", async () => {
  let requested: URL | undefined;
  const providers = createForecastProviders(async (input) => {
    requested = new URL(String(input));
    return response({ results: [{ id: 1609350, name: 'Bangkok', admin1: 'Bangkok', country: 'Thailand', country_code: 'TH', latitude: 13.754, longitude: 100.50144, timezone: 'Asia/Bangkok' }] });
  });
  const result = await providers.locations('Bangkok', 'TH');
  assert.equal(result.status, 'fresh');
  assert.equal(requested?.hostname, process.env.OPEN_METEO_API_KEY ? 'customer-geocoding-api.open-meteo.com' : 'geocoding-api.open-meteo.com');
  assert.equal(requested?.searchParams.get('countryCode'), 'TH');
  assert.equal(requested?.searchParams.get('count'), '8');
  assert.deepEqual(result.data, [{ id: 1609350, name: 'Bangkok', region: 'Bangkok', country: 'Thailand', countryCode: 'TH', latitude: 13.754, longitude: 100.50144, timezone: 'Asia/Bangkok' }]);
});

test("city search distinguishes no results from failure and rejects invalid locations", async () => {
  const empty = createForecastProviders(async () => response({ generationtime_ms: 1 }));
  assert.deepEqual((await empty.locations('Nothing')).data, []);
  const failed = createForecastProviders(async () => { throw new Error('timeout'); });
  assert.equal((await failed.locations('Bangkok')).status, 'unavailable');
  const valid = { id: 1, name: 'City', country: 'Thailand', country_code: 'TH', latitude: 13, longitude: 100, timezone: 'Asia/Bangkok' };
  for (const invalid of [{ ...valid, latitude: 91 }, { ...valid, timezone: 'Mars/Olympus' }, { ...valid, country_code: 'IT' }]) {
    const providers = createForecastProviders(async () => response({ results: [invalid] }));
    assert.equal((await providers.locations('City', 'TH')).status, 'unavailable');
  }
});
