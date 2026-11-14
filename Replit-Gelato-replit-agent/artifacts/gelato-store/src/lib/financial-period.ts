export type ReportDates = { startDate?: string; endDate?: string };
export type PeriodMode = 'all' | 'week' | 'months' | 'custom';

export function calendarToday(now = new Date()): string {
  return `${String(now.getFullYear()).padStart(4, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function weekDates(anchor: string): ReportDates | null {
  if (!validDate(anchor)) return null;
  const monday = new Date(`${anchor}T00:00:00Z`);
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
  const sunday = new Date(monday);
  sunday.setUTCDate(sunday.getUTCDate() + 6);
  const startDate = monday.toISOString().slice(0, 10), endDate = sunday.toISOString().slice(0, 10);
  return validDate(startDate) && validDate(endDate) ? { startDate, endDate } : null;
}

export function monthDates(from: string, through: string): ReportDates | null {
  if (!validDate(`${from}-01`) || !validDate(`${through}-01`) || from > through) return null;
  const last = new Date(`${through}-01T00:00:00Z`);
  last.setUTCMonth(last.getUTCMonth() + 1, 0);
  return { startDate: `${from}-01`, endDate: last.toISOString().slice(0, 10) };
}

export function customDates(startDate: string, endDate: string): ReportDates | null {
  return validDate(startDate) && validDate(endDate) && startDate <= endDate ? { startDate, endDate } : null;
}

export function periodLabel(startDate?: string | null, endDate?: string | null): string {
  if (!startDate || !endDate) return 'All time';
  const format = (date: string) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
  return `${format(startDate)} to ${format(endDate)}`;
}
