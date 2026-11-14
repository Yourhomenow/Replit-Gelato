import { useState } from 'react';
import type { FormEvent } from 'react';
import { CalendarRange, CircleAlert, LoaderCircle } from 'lucide-react';
import { getGetFinancialSummaryQueryKey, useGetFinancialSummary } from '@workspace/api-client-react';
import { calendarToday, customDates, monthDates, periodLabel, weekDates } from '@/lib/financial-period';
import type { PeriodMode, ReportDates } from '@/lib/financial-period';
import { timezoneLabel, timezoneOptions } from '@/lib/location-options';

const money = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

export function FinancialSummaryPage({ branchId }: { branchId: string }) {
  const [initial] = useState(() => ({ today: calendarToday(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' }));
  const [mode, setMode] = useState<PeriodMode>('all');
  const [weekAnchor, setWeekAnchor] = useState(initial.today);
  const [fromMonth, setFromMonth] = useState(initial.today.slice(0, 7));
  const [throughMonth, setThroughMonth] = useState(initial.today.slice(0, 7));
  const [fromDate, setFromDate] = useState(initial.today);
  const [throughDate, setThroughDate] = useState(initial.today);
  const [timezone, setTimezone] = useState(initial.timezone);
  const [applied, setApplied] = useState<ReportDates & { timezone: string }>({ timezone: initial.timezone });
  const [error, setError] = useState('');
  const params = { branchId, ...applied };
  const summary = useGetFinancialSummary(params, { query: { queryKey: getGetFinancialSummaryQueryKey(params), retry: 1 } });
  const draft = mode === 'all' ? {} : mode === 'week' ? weekDates(weekAnchor) : mode === 'months' ? monthDates(fromMonth, throughMonth) : customDates(fromDate, throughDate);
  const draftApplied = draft !== null && draft.startDate === applied.startDate && draft.endDate === applied.endDate && timezone === applied.timezone;
  const applyPeriod = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft) { setError('Choose valid dates, with the start on or before the end.'); return; }
    setError('');
    if (draftApplied) void summary.refetch();
    else setApplied({ ...draft, timezone });
  };
  return <>
    <div className="page-heading"><div><div className="eyebrow">MANAGER REPORT</div><h1>Financial summary</h1><p>Review paid transactions for the selected branch and reporting period.</p></div></div>
    <form className="financial-filters" onSubmit={applyPeriod} data-testid="form-financial-period">
      <div className="financial-filter-title"><CalendarRange size={20} /><div><h2>Choose a reporting period</h2><p>Apply your selection to update every total below.</p></div></div>
      <div className="financial-filter-grid">
        <label>Period<select value={mode} onChange={(event) => { setMode(event.target.value as PeriodMode); setError(''); }} data-testid="select-financial-period"><option value="all">All time</option><option value="week">Week (Monday to Sunday)</option><option value="months">Month range</option><option value="custom">Custom dates</option></select></label>
        <label>Reporting timezone<select required value={timezone} onChange={(event) => { setTimezone(event.target.value); setError(''); }} data-testid="select-financial-timezone">{timezoneOptions(timezone).map((zone) => <option value={zone} key={zone}>{timezoneLabel(zone)}</option>)}</select></label>
        {mode === 'week' && <label>Week containing<input type="date" required min="0001-01-01" max="9999-12-31" value={weekAnchor} onChange={(event) => { setWeekAnchor(event.target.value); setError(''); }} data-testid="input-financial-week" /></label>}
        {mode === 'months' && <><label>From month<input type="month" required min="0001-01" max="9999-12" value={fromMonth} onChange={(event) => { setFromMonth(event.target.value); setError(''); }} data-testid="input-financial-from-month" /></label><label>Through month<input type="month" required min="0001-01" max="9999-12" value={throughMonth} onChange={(event) => { setThroughMonth(event.target.value); setError(''); }} data-testid="input-financial-through-month" /></label></>}
        {mode === 'custom' && <><label>From date<input type="date" required min="0001-01-01" max="9999-12-31" value={fromDate} onChange={(event) => { setFromDate(event.target.value); setError(''); }} data-testid="input-financial-from-date" /></label><label>Through date<input type="date" required min="0001-01-01" max="9999-12-31" value={throughDate} onChange={(event) => { setThroughDate(event.target.value); setError(''); }} data-testid="input-financial-through-date" /></label></>}
      </div>
      <div className="financial-filter-footer"><p>{mode === 'all' ? 'Includes every recorded paid transaction.' : draft ? `${mode === 'week' ? 'Monday through Sunday: ' : ''}${periodLabel(draft.startDate, draft.endDate)}. Both dates are included.` : 'Choose the beginning and end of your period.'}</p><button className="button primary" disabled={summary.isFetching && draftApplied} data-testid="button-apply-financial-period">{summary.isFetching && draftApplied && <LoaderCircle size={15} className="spin" />} Apply period</button></div>
      {error && <p className="inline-error" role="alert" data-testid="error-financial-period">{error}</p>}
    </form>
    {summary.isLoading ? <div className="skeleton-stack" role="status" aria-label="Loading financial summary"><div className="skeleton wide" /><div className="skeleton" /></div> : summary.isError ? <div className="state-panel" role="alert"><CircleAlert size={21} /><strong>Could not load the financial summary.</strong><button className="button secondary" onClick={() => summary.refetch()}>Try again</button></div> : summary.data && <>
      <p className="financial-applied-period" role="status" data-testid="financial-applied-period">Showing <strong>{periodLabel(summary.data.startDate, summary.data.endDate)}</strong> · {summary.data.timezone}</p>
      {summary.data.paidOrders === 0 && <div className="financial-empty" role="status">No paid transactions in this period. Try another date range or choose All time.</div>}
      <div className="summary-row" data-testid="financial-summary">
        <article className="summary-card summary-feature"><div className="summary-label">PAID REVENUE</div><div className="summary-value" data-testid="financial-revenue">{money(summary.data.revenueCents)}</div><div className="summary-foot">{summary.data.branchName}</div></article>
        <article className="summary-card"><div className="summary-label">PAID ORDERS</div><div className="summary-value" data-testid="financial-paid-orders">{summary.data.paidOrders}</div><div className="summary-foot">Completed payments in this period</div></article>
        <article className="summary-card"><div className="summary-label">AVERAGE PAID ORDER</div><div className="summary-value" data-testid="financial-average-order">{money(summary.data.averageOrderCents)}</div><div className="summary-foot">Revenue divided by paid orders</div></article>
      </div>
      <section className="section-block"><div className="section-heading"><div><div className="eyebrow">PAYMENT METHODS</div><h2>Revenue by method</h2></div></div><div className="financial-methods">{([['QR', summary.data.byMethodCents.qr], ['Card', summary.data.byMethodCents.card], ['Bank transfer', summary.data.byMethodCents.transfer]] as const).map(([label, amount]) => <div className="financial-method" key={label} data-testid={`financial-method-${label.toLowerCase().replace(' ', '-')}`}><span>{label}</span><strong>{money(amount)}</strong></div>)}</div></section>
    </>}
  </>;
}
