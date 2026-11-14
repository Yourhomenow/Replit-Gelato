import type { ForecastDay, ForecastHistory, ForecastIngredientGap, ForecastPrepItem } from "@workspace/api-zod";
import type { IngredientRequirement } from "@workspace/db";
import type { Holiday, WeatherDay } from "./forecast-providers";

export function localDate(now: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function addDays(date: string, amount: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}
const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();
const ingredientKey = (name: string, unit: string) => JSON.stringify([name.trim().toLocaleLowerCase(), unit.trim().toLocaleLowerCase()]);
const roundQuantity = (quantity: number) => Math.round(quantity * 1000) / 1000;

export type ForecastMenu = { id: string; name: string; availability: number; ingredients: IngredientRequirement[] };
export type DailySale = { date: string; menuItemId: string; quantity: number };
export type ForecastStock = { ingredientName: string; unit: string; quantity: number; importDate: string; shelfLife: string | null };

export function calculateForecast(input: {
  today: string; firstSaleDate: string | null; sales: DailySale[]; menu: ForecastMenu[];
  stock: ForecastStock[]; weather: WeatherDay[]; holidays: Holiday[];
}) {
  const { today, menu } = input;
  const windowStart = addDays(today, -28);
  const startsOn = input.firstSaleDate && input.firstSaleDate > windowStart ? input.firstSaleDate : windowStart;
  const historicalDates: string[] = [];
  for (let date = startsOn; date < today; date = addDays(date, 1)) historicalDates.push(date);
  const sales = input.sales.filter((sale) => sale.date >= startsOn && sale.date < today);
  const sellingDays = new Set(sales.filter((sale) => sale.quantity > 0).map((sale) => sale.date)).size;
  const history: ForecastHistory = {
    startsOn, endsOn: addDays(today, -1), calendarDays: historicalDates.length, sellingDays,
    totalServings: sales.reduce((sum, sale) => sum + sale.quantity, 0),
    sufficient: historicalDates.length >= 7 && sellingDays >= 3,
  };
  const days: ForecastDay[] = [];
  let tomorrowTargets: ForecastPrepItem[] = [];
  for (let offset = 0; offset < 7; offset++) {
    const date = addDays(today, offset);
    const weather = input.weather.find((entry) => entry.date === date);
    const holidays = [...new Set(input.holidays.filter((entry) => entry.date === date).map((entry) => entry.name))];
    const reasons: string[] = [];
    let adjustmentPercent = 0;
    if (weather?.maxTemperatureC != null && weather.maxTemperatureC >= 30) { adjustmentPercent += 15; reasons.push("Hot day: +15%"); }
    if (weather?.rainProbabilityPercent != null && weather.rainProbabilityPercent >= 60) { adjustmentPercent -= 15; reasons.push("Rain likely: −15%"); }
    if (holidays.length) { adjustmentPercent += 10; reasons.push("National public holiday: +10%"); }
    const matchingDates = historicalDates.filter((entry) => weekday(entry) === weekday(date));
    const matchingSet = new Set(matchingDates);
    const totals = new Map<string, number>();
    for (const sale of sales) {
      if (matchingSet.has(sale.date)) totals.set(sale.menuItemId, (totals.get(sale.menuItemId) ?? 0) + sale.quantity);
    }
    const targets = history.sufficient ? menu.map((item): ForecastPrepItem => {
      const targetServings = Math.ceil(((totals.get(item.id) ?? 0) * (100 + adjustmentPercent)) / (matchingDates.length * 100));
      return {
        menuItemId: item.id, name: item.name, targetServings, availableServings: Math.max(0, item.availability),
        extraServings: Math.max(0, targetServings - Math.max(0, item.availability)),
      };
    }) : [];
    if (offset === 1) tomorrowTargets = targets;
    days.push({
      date, maxTemperatureC: weather?.maxTemperatureC ?? null, rainProbabilityPercent: weather?.rainProbabilityPercent ?? null,
      weatherCode: weather?.weatherCode ?? null, holidays, adjustmentPercent, reasons,
      expectedServings: history.sufficient ? targets.reduce((sum, item) => sum + item.targetServings, 0) : null,
    });
  }
  const required = new Map<string, { ingredientName: string; unit: string; quantity: number }>();
  const menuById = new Map(menu.map((item) => [item.id, item]));
  for (const target of tomorrowTargets) {
    for (const ingredient of menuById.get(target.menuItemId)?.ingredients ?? []) {
      if (ingredient.quantityPerServing <= 0 || target.targetServings === 0) continue;
      const key = ingredientKey(ingredient.ingredientName, ingredient.unit);
      const entry = required.get(key) ?? { ingredientName: ingredient.ingredientName, unit: ingredient.unit, quantity: 0 };
      entry.quantity += ingredient.quantityPerServing * target.targetServings;
      required.set(key, entry);
    }
  }
  const stock = new Map<string, number>();
  const tomorrow = addDays(today, 1);
  for (const lot of input.stock) {
    if (lot.importDate > tomorrow || (lot.shelfLife && lot.shelfLife < tomorrow)) continue;
    const key = ingredientKey(lot.ingredientName, lot.unit);
    stock.set(key, (stock.get(key) ?? 0) + Math.max(0, lot.quantity));
  }
  const gaps: ForecastIngredientGap[] = [];
  for (const [key, entry] of required) {
    const availableQuantity = stock.get(key) ?? 0;
    const shortageQuantity = roundQuantity(Math.max(0, entry.quantity - availableQuantity));
    if (shortageQuantity > 0) gaps.push({
      ingredientName: entry.ingredientName, unit: entry.unit,
      requiredQuantity: roundQuantity(entry.quantity), availableQuantity: roundQuantity(availableQuantity), shortageQuantity,
    });
  }
  gaps.sort((a, b) => a.ingredientName.localeCompare(b.ingredientName) || a.unit.localeCompare(b.unit));
  tomorrowTargets.sort((a, b) => b.extraServings - a.extraServings || b.targetServings - a.targetServings || a.name.localeCompare(b.name));
  return {
    history, days, prep: tomorrowTargets.slice(0, 20), prepItemCount: tomorrowTargets.length,
    ingredientGaps: gaps.slice(0, 20), ingredientGapCount: gaps.length,
  };
}
