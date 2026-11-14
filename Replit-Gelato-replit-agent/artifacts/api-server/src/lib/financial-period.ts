export type FinancialPeriod = { startDate: string | null; endDate: string | null; timezone: string };

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function parseFinancialPeriod(query: { startDate?: unknown; endDate?: unknown; timezone?: unknown }): FinancialPeriod | null {
  const { startDate, endDate } = query;
  const timezone = query.timezone === undefined ? 'UTC' : query.timezone;
  if (typeof timezone !== 'string' || !timezone || timezone.length > 100 || /^[+-]/.test(timezone)) return null;
  let reportingTimezone: string;
  try { reportingTimezone = new Intl.DateTimeFormat('en-US', { timeZone: timezone }).resolvedOptions().timeZone; } catch { return null; }
  if (startDate === undefined && endDate === undefined) return { startDate: null, endDate: null, timezone: reportingTimezone };
  if (typeof startDate !== 'string' || typeof endDate !== 'string' ||
      !isCalendarDate(startDate) || !isCalendarDate(endDate) || startDate > endDate) return null;
  return { startDate, endDate, timezone: reportingTimezone };
}
