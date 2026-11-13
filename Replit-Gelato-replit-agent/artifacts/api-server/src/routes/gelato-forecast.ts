import { Router, type IRouter } from "express";
import { and, eq, gte, isNull, min, sql, sum } from "drizzle-orm";
import {
  GetScoopForecastQueryParams, GetScoopForecastResponse, SaveForecastSettingsBody,
  SaveForecastSettingsParams, SaveForecastSettingsResponse,
  SearchForecastLocationsQueryParams, SearchForecastLocationsResponse,
} from "@workspace/api-zod";
import {
  branchesTable, db, forecastSettingsTable, menuAvailabilityTable, menuItemsTable,
  orderLinesTable, ordersTable, paymentsTable, stockLotsTable,
} from "@workspace/db";
import { requireGelatoAuth, requireManager } from "../middlewares/gelato-auth";
import { forecastProviders } from "../lib/forecast-providers";
import { addDays, calculateForecast, localDate } from "../lib/scoop-forecast";
import { servingsFromStock } from "../lib/stock-availability";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.get("/forecast/locations", requireGelatoAuth, requireManager, async (req, res): Promise<void> => {
  res.set("Cache-Control", "private, no-store");
  if (typeof req.query.q !== "string" || (req.query.countryCode !== undefined && typeof req.query.countryCode !== "string")) {
    res.status(400).json({ error: "Enter a city name and an optional two letter country code" });
    return;
  }
  const parsed = SearchForecastLocationsQueryParams.safeParse(req.query);
  if (!parsed.success || parsed.data.q.trim().length < 2) {
    res.status(400).json({ error: "Enter at least two characters to find a city" });
    return;
  }
  const result = await forecastProviders.locations(parsed.data.q.trim(), parsed.data.countryCode);
  if (!result.data) {
    res.status(503).json({ error: "City search is unavailable. Try again or enter coordinates manually" });
    return;
  }
  res.json(SearchForecastLocationsResponse.parse({ locations: result.data, status: result.status }));
});

router.put("/branches/:id/forecast-settings", requireGelatoAuth, requireManager, async (req, res): Promise<void> => {
  const params = SaveForecastSettingsParams.safeParse(req.params);
  const parsed = SaveForecastSettingsBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Enter valid coordinates, a two letter country code, and an IANA timezone" });
    return;
  }
  const settings = { ...parsed.data, timezone: parsed.data.timezone.trim() };
  try {
    if (/^[+-]/.test(settings.timezone)) throw new Error("Use an IANA timezone");
    new Intl.DateTimeFormat("en-US", { timeZone: settings.timezone }).format();
  } catch {
    res.status(400).json({ error: "Enter an IANA timezone such as Asia/Bangkok or Europe/Rome" });
    return;
  }
  const [branch] = await db.select({ id: branchesTable.id }).from(branchesTable).where(eq(branchesTable.id, params.data.id)).limit(1);
  if (!branch) { res.status(404).json({ error: "Branch not found" }); return; }
  const [saved] = await db.insert(forecastSettingsTable).values({ branchId: branch.id, ...settings })
    .onConflictDoUpdate({ target: forecastSettingsTable.branchId, set: settings }).returning();
  res.json(SaveForecastSettingsResponse.parse(saved));
});

router.get("/dashboard/scoop-forecast", requireGelatoAuth, requireManager, async (req, res): Promise<void> => {
  res.set("Cache-Control", "private, no-store");
  const parsed = GetScoopForecastQueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: "Select a valid branch" }); return; }
  const { branchId } = parsed.data;
  const [branch] = await db.select().from(branchesTable).where(eq(branchesTable.id, branchId)).limit(1);
  if (!branch) { res.status(404).json({ error: "Branch not found" }); return; }
  const [settings] = await db.select().from(forecastSettingsTable).where(eq(forecastSettingsTable.branchId, branchId)).limit(1);
  const now = new Date();
  const base = { branchId, branchName: branch.name, generatedAt: now.toISOString() };
  if (!settings) {
    const unavailable = { status: "unavailable", fetchedAt: null };
    res.json(GetScoopForecastResponse.parse({
      ...base, settings: null, history: null, weather: unavailable, holidays: unavailable,
      days: [], prep: [], prepItemCount: 0, ingredientGaps: [], ingredientGapCount: 0,
    }));
    return;
  }
  const today = localDate(now, settings.timezone);
  const dates = Array.from({ length: 7 }, (_, offset) => addDays(today, offset));
  const salesDate = sql<string>`(${paymentsTable.paidAt} AT TIME ZONE ${settings.timezone})::date::text`;
  const paidFilters = and(eq(ordersTable.branchId, branchId), eq(paymentsTable.status, "paid"), isNull(ordersTable.cancelledAt), sql`${paymentsTable.paidAt} <= ${now}`);
  const [weather, holidays, firstSale, sales, menuRows, stock] = await Promise.all([
    forecastProviders.weather(settings, today),
    forecastProviders.holidays(settings.countryCode, dates),
    db.select({ paidAt: min(paymentsTable.paidAt) }).from(paymentsTable)
      .innerJoin(ordersTable, eq(ordersTable.id, paymentsTable.orderId)).where(paidFilters),
    db.select({ date: salesDate, menuItemId: orderLinesTable.menuItemId, quantity: sum(orderLinesTable.quantity) })
      .from(paymentsTable).innerJoin(ordersTable, eq(ordersTable.id, paymentsTable.orderId))
      .innerJoin(orderLinesTable, eq(orderLinesTable.orderId, ordersTable.id))
      .where(and(paidFilters, gte(paymentsTable.paidAt, new Date(now.getTime() - 30 * 86_400_000)),
        sql`${salesDate} >= ${addDays(today, -28)}`, sql`${salesDate} < ${today}`))
      // Repeating a parameterized timezone expression creates distinct SQL
      // placeholders in PostgreSQL. Group by the selected date column instead.
      .groupBy(sql`1`, orderLinesTable.menuItemId),
    db.select({ id: menuItemsTable.id, name: menuItemsTable.name, ingredients: menuItemsTable.ingredients, availability: menuAvailabilityTable.quantity })
      .from(menuItemsTable).innerJoin(menuAvailabilityTable, and(eq(menuAvailabilityTable.menuItemId, menuItemsTable.id), eq(menuAvailabilityTable.branchId, branchId)))
      .where(eq(menuItemsTable.isActive, true)),
    db.select().from(stockLotsTable).where(eq(stockLotsTable.branchId, branchId)),
  ]);
  const menu = menuRows.map((item) => {
    const capacity = servingsFromStock(item.ingredients, stock);
    return { ...item, availability: capacity === null ? item.availability : Math.min(item.availability, capacity) };
  });
  const firstPaidAt = firstSale[0]?.paidAt;
  const forecast = calculateForecast({
    today, firstSaleDate: firstPaidAt ? localDate(new Date(firstPaidAt), settings.timezone) : null,
    sales: sales.map((sale) => ({ ...sale, quantity: Number(sale.quantity ?? 0) })), menu, stock,
    weather: weather.data ?? [], holidays: holidays.data ?? [],
  });
  if ([weather.status, holidays.status].some((status) => status === "unavailable" || status === "stale")) {
    logger.warn({ branchId, weather: weather.status, holidays: holidays.status }, "Scoop Forecast has limited provider data");
  }
  res.json(GetScoopForecastResponse.parse({
    ...base, settings, ...forecast,
    weather: { status: weather.status, fetchedAt: weather.fetchedAt },
    holidays: { status: holidays.status, fetchedAt: holidays.fetchedAt },
  }));
});

export default router;
