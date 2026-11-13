import type { ForecastLocation, ForecastProvider, ForecastSettings } from "@workspace/api-zod";

export type WeatherDay = {
  date: string;
  maxTemperatureC: number | null;
  rainProbabilityPercent: number | null;
  weatherCode: number | null;
};
export type Holiday = { date: string; name: string };
type Result<T> = ForecastProvider & { data: T | null };
const minute = 60_000;
const day = 24 * 60 * minute;

// Successful data survives a temporary outage. Failed calls have a short cooldown,
// and concurrent readers share the same request rather than consuming provider quota.
export class ForecastCache<T> {
  private entries = new Map<string, { data: T; fetchedAt: number }>();
  private failures = new Map<string, number>();
  private pending = new Map<string, Promise<Result<T>>>();

  private ttl: number;
  private maxAge: number;
  private now: () => number;

  constructor(ttl: number, maxAge: number, now = Date.now) {
    this.ttl = ttl;
    this.maxAge = maxAge;
    this.now = now;
  }

  async get(key: string, load: () => Promise<T>): Promise<Result<T>> {
    const cached = this.entries.get(key);
    const age = cached ? this.now() - cached.fetchedAt : Infinity;
    if (cached && age < this.ttl) return this.result(cached, "fresh");
    const pending = this.pending.get(key);
    if (pending) return pending;
    const fallback = (): Result<T> => cached && this.now() - cached.fetchedAt <= this.maxAge
      ? this.result(cached, "stale") : { data: null, status: "unavailable", fetchedAt: null };
    if (this.now() - (this.failures.get(key) ?? -Infinity) < minute) return fallback();
    const request = (async () => {
      try {
        const entry = { data: await load(), fetchedAt: this.now() };
        this.entries.delete(key);
        this.entries.set(key, entry);
        this.failures.delete(key);
        this.trim(this.entries);
        return this.result(entry, "fresh");
      } catch {
        this.failures.delete(key);
        this.failures.set(key, this.now());
        this.trim(this.failures);
        return fallback();
      }
    })();
    this.pending.set(key, request);
    try { return await request; } finally { this.pending.delete(key); }
  }

  private result(entry: { data: T; fetchedAt: number }, status: "fresh" | "stale"): Result<T> {
    return { data: entry.data, status, fetchedAt: new Date(entry.fetchedAt).toISOString() };
  }

  private trim(map: Map<string, unknown>) {
    while (map.size > 100) map.delete(map.keys().next().value!);
  }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid provider object");
  return value as Record<string, unknown>;
}
function date(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !Number.isFinite(Date.parse(`${value}T00:00:00Z`)) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) {
    throw new Error("Invalid provider date");
  }
  return value;
}
function numberOrNull(value: unknown, min: number, max: number): number | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw new Error("Invalid provider number");
  return value;
}

export function createForecastProviders(fetcher: typeof fetch = fetch, now = Date.now) {
  const weatherCache = new ForecastCache<WeatherDay[]>(30 * minute, day, now);
  const countryCache = new ForecastCache<string[]>(day, 7 * day, now);
  const holidayCache = new ForecastCache<Holiday[]>(day, 7 * day, now);
  const locationCache = new ForecastCache<ForecastLocation[]>(day, 7 * day, now);

  async function json(url: URL): Promise<unknown> {
    const response = await fetcher(url, { signal: AbortSignal.timeout(4000), headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("Forecast provider unavailable");
    return response.json();
  }

  return {
    locations(query: string, countryCode?: string): Promise<Result<ForecastLocation[]>> {
      const apiKey = process.env.OPEN_METEO_API_KEY;
      const key = JSON.stringify([query.toLocaleLowerCase(), countryCode ?? null, Boolean(apiKey)]);
      return locationCache.get(key, async () => {
        const url = new URL("/v1/search", apiKey ? "https://customer-geocoding-api.open-meteo.com" : "https://geocoding-api.open-meteo.com");
        url.search = new URLSearchParams({
          name: query, count: "8", language: "en", format: "json",
          ...(countryCode ? { countryCode } : {}), ...(apiKey ? { apikey: apiKey } : {}),
        }).toString();
        const value = record(await json(url));
        // An empty result is represented by an absent results field.
        if (value.results === undefined) return [];
        if (!Array.isArray(value.results) || value.results.length > 8) throw new Error("Invalid city results");
        return value.results.map((item): ForecastLocation => {
          const entry = record(item);
          const latitude = numberOrNull(entry.latitude, -90, 90);
          const longitude = numberOrNull(entry.longitude, -180, 180);
          if (!Number.isInteger(entry.id) || typeof entry.id !== "number" || typeof entry.name !== "string" ||
              typeof entry.country !== "string" || typeof entry.country_code !== "string" || !/^[A-Z]{2}$/.test(entry.country_code) ||
              (countryCode && entry.country_code !== countryCode) || typeof entry.timezone !== "string" ||
              entry.timezone.length > 100 || /^[+-]/.test(entry.timezone) || latitude === null || longitude === null ||
              (entry.admin1 !== undefined && typeof entry.admin1 !== "string")) throw new Error("Invalid city location");
          new Intl.DateTimeFormat("en-US", { timeZone: entry.timezone }).format();
          return {
            id: entry.id, name: entry.name, region: typeof entry.admin1 === "string" ? entry.admin1 : "",
            country: entry.country, countryCode: entry.country_code, latitude, longitude, timezone: entry.timezone,
          };
        });
      });
    },

    weather(settings: ForecastSettings, today: string): Promise<Result<WeatherDay[]>> {
      const apiKey = process.env.OPEN_METEO_API_KEY;
      const key = JSON.stringify([settings.latitude, settings.longitude, settings.timezone, today, Boolean(apiKey)]);
      return weatherCache.get(key, async () => {
        const url = new URL("/v1/forecast", apiKey ? "https://customer-api.open-meteo.com" : "https://api.open-meteo.com");
        url.search = new URLSearchParams({
          latitude: String(settings.latitude), longitude: String(settings.longitude), timezone: settings.timezone,
          daily: "temperature_2m_max,precipitation_probability_max,weather_code", forecast_days: "7",
          ...(apiKey ? { apikey: apiKey } : {}),
        }).toString();
        const daily = record(record(await json(url)).daily);
        const times = daily.time;
        const temperatures = daily.temperature_2m_max;
        const rain = daily.precipitation_probability_max;
        const codes = daily.weather_code;
        if (!Array.isArray(times) || times.length !== 7 || !Array.isArray(temperatures) ||
            !Array.isArray(rain) || !Array.isArray(codes) ||
            [temperatures, rain, codes].some((values) => values.length !== times.length)) throw new Error("Invalid forecast days");
        const days = times.map((time, i) => ({
          date: date(time), maxTemperatureC: numberOrNull(temperatures[i], -100, 70),
          rainProbabilityPercent: numberOrNull(rain[i], 0, 100), weatherCode: numberOrNull(codes[i], 0, 99),
        }));
        if (days.some((entry, i) => entry.date !== new Date(Date.parse(`${today}T00:00:00Z`) + i * day).toISOString().slice(0, 10) ||
            (entry.weatherCode !== null && !Number.isInteger(entry.weatherCode)))) throw new Error("Unexpected forecast dates or codes");
        return days;
      });
    },

    async holidays(countryCode: string, dates: string[]): Promise<Result<Holiday[]>> {
      const countries = await countryCache.get("countries", async () => {
        const value = await json(new URL("https://date.nager.at/api/v3/AvailableCountries"));
        if (!Array.isArray(value) || !value.length) throw new Error("Invalid countries");
        return value.map((item) => {
          const code = record(item).countryCode;
          if (typeof code !== "string" || !/^[A-Z]{2}$/.test(code)) throw new Error("Invalid country code");
          return code;
        });
      });
      if (!countries.data) return { data: null, status: "unavailable", fetchedAt: null };
      if (!countries.data.includes(countryCode)) return {
        data: null, status: countries.status === "fresh" ? "unsupported" : "unavailable", fetchedAt: countries.fetchedAt,
      };
      const years = [...new Set(dates.map((value) => value.slice(0, 4)))];
      const results = await Promise.all(years.map((year) => holidayCache.get(`${countryCode}/${year}`, async () => {
        const value = await json(new URL(`https://date.nager.at/api/v3/PublicHolidays/${year}/${countryCode}`));
        if (!Array.isArray(value)) throw new Error("Invalid holidays");
        return value.flatMap((item): Holiday[] => {
          const entry = record(item);
          const holidayDate = date(entry.date);
          if (typeof entry.name !== "string" || typeof entry.global !== "boolean" || !Array.isArray(entry.types) ||
              entry.countryCode !== countryCode || !holidayDate.startsWith(year)) throw new Error("Invalid holiday");
          return entry.global && entry.types.includes("Public") ? [{ date: holidayDate, name: entry.name }] : [];
        });
      })));
      if (results.some((result) => !result.data)) return { data: null, status: "unavailable", fetchedAt: null };
      const fetchedAt = results.map((result) => result.fetchedAt!).sort()[0] ?? countries.fetchedAt;
      return {
        data: results.flatMap((result) => result.data ?? []).filter((entry) => dates.includes(entry.date)), fetchedAt,
        status: countries.status === "stale" || results.some((result) => result.status === "stale") ? "stale" : "fresh",
      };
    },
  };
}

export const forecastProviders = createForecastProviders();
