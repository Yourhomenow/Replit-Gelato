import { useState } from 'react';
import { ForecastLocationForm } from '@/components/forecast-location-form';
import { CalendarDays, CircleAlert, CloudRain, CloudSun, MapPin, RefreshCw, Settings2, Sun, Thermometer } from 'lucide-react';
import {
  getGetScoopForecastQueryKey, useGetScoopForecast,
} from '@workspace/api-client-react';
import type { ForecastDay, ForecastProvider } from '@workspace/api-client-react';

const dateLabel = (date: string, options: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' }) =>
  new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
const quantity = (value: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(value);
const updatedLabel = (timestamp: string, timezone: string) => new Intl.DateTimeFormat('en-US', {
  timeZone: timezone, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
}).format(new Date(timestamp));

function ProviderNotice({ name, provider, timezone }: { name: string; provider: ForecastProvider; timezone: string }) {
  if (provider.status === 'fresh') return null;
  const message = provider.status === 'unsupported'
    ? 'National holiday coverage is unavailable for this country. Holiday adjustments are omitted.'
    : provider.status === 'stale'
      ? `Using saved ${name.toLowerCase()} data${provider.fetchedAt ? ` from ${updatedLabel(provider.fetchedAt, timezone)}` : ''}.`
      : `${name} is unavailable. Its adjustments are omitted; the sales baseline still works.`;
  return <div className="forecast-notice" role="status"><CircleAlert size={17} /><span>{message}</span></div>;
}

function DayCard({ day, index }: { day: ForecastDay; index: number }) {
  const Icon = day.rainProbabilityPercent != null && day.rainProbabilityPercent >= 60 ? CloudRain
    : day.weatherCode != null && day.weatherCode <= 1 ? Sun : CloudSun;
  return <article className={`forecast-day ${index === 1 ? 'forecast-day-tomorrow' : ''}`} data-testid={`forecast-day-${day.date}`}>
    <div className="eyebrow">{index === 0 ? 'TODAY' : index === 1 ? 'TOMORROW' : dateLabel(day.date, { weekday: 'long' })}</div>
    <time dateTime={day.date}>{dateLabel(day.date, { month: 'short', day: 'numeric' })}</time>
    <Icon size={27} aria-hidden="true" />
    <div className="forecast-temperature">{day.maxTemperatureC === null ? '—' : `${Math.round(day.maxTemperatureC)}°C`}</div>
    <span className="forecast-rain">{day.rainProbabilityPercent === null ? 'Rain unavailable' : `${Math.round(day.rainProbabilityPercent)}% rain`}</span>
    <div className="forecast-servings"><strong>{day.expectedServings === null ? '—' : quantity(day.expectedServings)}</strong><span>{day.expectedServings === null ? 'Gathering history' : 'suggested servings'}</span></div>
    <div className="forecast-reasons">{day.holidays.map((holiday) => <span className="forecast-holiday" key={holiday}><CalendarDays size={12} />{holiday}</span>)}{day.reasons.length ? day.reasons.map((reason) => <span key={reason}>{reason}</span>) : <span>Sales baseline</span>}</div>
  </article>;
}

export function ScoopForecastPage({ branchId }: { branchId: string }) {
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const forecast = useGetScoopForecast({ branchId }, { query: {
    queryKey: getGetScoopForecastQueryKey({ branchId }), staleTime: 60_000, retry: 1,
  } });
  const data = forecast.data;
  const history = data?.history;
  const tomorrow = data?.days[1];
  return <>
    <div className="page-heading"><div><div className="eyebrow">MANAGER PLANNING</div><h1>Scoop Forecast</h1><p>A little foresight for tomorrow’s cabinet. Weather, holidays, and your branch’s sales, together.</p></div><div className="forecast-actions">
      {data?.settings && <button className="button secondary" onClick={() => { setEditing(!editing); setSaved(false); }} aria-expanded={editing}><Settings2 size={15} /> Location</button>}
      <button className="button secondary" onClick={() => forecast.refetch()} disabled={forecast.isFetching} data-testid="button-refresh-forecast"><RefreshCw size={15} className={forecast.isFetching ? 'spin' : ''} /> Refresh</button>
    </div></div>
    {forecast.isLoading ? <div className="skeleton-stack" role="status" aria-label="Loading Scoop Forecast"><div className="skeleton wide" /><div className="skeleton" /><div className="skeleton" /></div>
      : forecast.isError ? <div className="state-panel" role="alert"><CircleAlert size={21} /><strong>Could not load Scoop Forecast.</strong><span>Check your connection and try again.</span><button className="button secondary" onClick={() => forecast.refetch()}>Try again</button></div>
        : data && <>
          {saved && <p className="forecast-save-status" role="status">Branch location saved.</p>}
          {(!data.settings || editing) && <ForecastLocationForm key={JSON.stringify(data.settings)} branchId={branchId} branchName={data.branchName} settings={data.settings} onSaved={() => { setEditing(false); setSaved(true); }} onCancel={data.settings ? () => setEditing(false) : undefined} />}
          {!data.settings ? <div className="state-panel"><CloudSun size={30} /><strong>Start with your branch location.</strong><span>Your forecast will appear here after you save it. Sales and stock stay as they are.</span></div> : <>
            <div className="forecast-location-line"><MapPin size={14} /><span>{data.branchName} · {data.settings.latitude}, {data.settings.longitude} · {data.settings.timezone}</span></div>
            <ProviderNotice name="Weather" provider={data.weather} timezone={data.settings.timezone} />
            <ProviderNotice name="Holiday data" provider={data.holidays} timezone={data.settings.timezone} />
            <div className="summary-row forecast-summary">
              <article className="summary-card summary-feature"><div className="summary-label">TOMORROW’S SERVINGS</div><div className="summary-value">{tomorrow?.expectedServings ?? '—'}</div><div className="summary-foot">{tomorrow ? dateLabel(tomorrow.date) : 'Awaiting forecast'} · planning estimate</div></article>
              <article className="summary-card"><div className="summary-label">SALES HISTORY</div><div className="summary-value">{history?.sellingDays ?? 0}<small> selling days</small></div><div className="summary-foot">{history?.totalServings ?? 0} servings across {history?.calendarDays ?? 0} complete days</div></article>
              <article className="summary-card"><div className="summary-label">INGREDIENT SHORTAGES</div><div className="summary-value">{history?.sufficient ? data.ingredientGapCount : '—'}</div><div className="summary-foot">{history?.sufficient ? 'Checked against tomorrow’s full mix' : 'Waiting for enough sales history'}</div></article>
            </div>
            {!history?.sufficient && <div className="forecast-notice" role="status" data-testid="forecast-insufficient-history"><Thermometer size={18} /><span>Building your baseline. Serving suggestions need at least 7 complete calendar days since the first paid sale and 3 distinct selling days. Weather and holidays are still shown below.</span></div>}
            <section className="section-block" aria-labelledby="forecast-outlook-title"><div className="section-heading"><div><div className="eyebrow">THE WEEK AHEAD</div><h2 id="forecast-outlook-title">Seven days, one clearer plan</h2></div></div><div className="forecast-week">{data.days.map((day, index) => <DayCard key={day.date} day={day} index={index} />)}</div></section>
            <section className="section-block" aria-labelledby="forecast-prep-title"><div className="section-heading"><div><div className="eyebrow">TOMORROW’S CABINET</div><h2 id="forecast-prep-title">What to prepare</h2></div></div>
              <p className="forecast-copy">Targets are servings per menu item. Current capacity comes from menu availability and ingredients; shared ingredients also need the check below.</p>
              {!history?.sufficient ? <div className="empty-state">Preparation suggestions appear when this branch has enough sales history.</div> : !data.prep.length ? <div className="empty-state">No active menu items for this branch. Add items to the branch menu to plan preparation.</div> : <div className="forecast-table-wrap"><table className="forecast-table" data-testid="forecast-prep-table"><caption className="sr-only">Tomorrow’s suggested servings and current serving capacity</caption><thead><tr><th scope="col">Menu item</th><th scope="col">Suggested</th><th scope="col">Current capacity</th><th scope="col">Capacity gap</th></tr></thead><tbody>{data.prep.map((item) => <tr key={item.menuItemId}><th scope="row">{item.name}</th><td>{item.targetServings}</td><td>{item.availableServings}</td><td><span className={item.extraServings ? 'forecast-gap' : ''}>{item.extraServings ? `+${item.extraServings}` : 'Covered'}</span></td></tr>)}</tbody></table></div>}
              {data.prepItemCount > data.prep.length && <p className="forecast-copy">Showing the {data.prep.length} largest capacity gaps from {data.prepItemCount} menu items. The ingredient check includes every target.</p>}
            </section>
            {history?.sufficient && <section className="section-block" aria-labelledby="forecast-ingredients-title"><div className="section-heading"><div><div className="eyebrow">BEFORE YOU PREPARE</div><h2 id="forecast-ingredients-title">Ingredient check</h2></div></div><p className="forecast-copy">Compares the full suggested mix with stock usable tomorrow, including shared ingredients. Expired lots and later deliveries are excluded. Quantities update when you refresh.</p>
              {data.ingredientGaps.length ? <div className="forecast-table-wrap"><table className="forecast-table" data-testid="forecast-ingredient-table"><caption className="sr-only">Ingredient shortages for tomorrow’s suggested mix</caption><thead><tr><th scope="col">Ingredient</th><th scope="col">Needed</th><th scope="col">Usable stock</th><th scope="col">Shortage</th></tr></thead><tbody>{data.ingredientGaps.map((gap) => <tr key={JSON.stringify([gap.ingredientName, gap.unit])}><th scope="row">{gap.ingredientName}</th><td>{quantity(gap.requiredQuantity)} {gap.unit}</td><td>{quantity(gap.availableQuantity)} {gap.unit}</td><td className="forecast-gap">{quantity(gap.shortageQuantity)} {gap.unit}</td></tr>)}</tbody></table></div> : <div className="forecast-notice">No ingredient shortages found for the suggested mix. Confirm recipes and stock before preparing.</div>}
              {data.ingredientGapCount > data.ingredientGaps.length && <p className="forecast-copy">Showing {data.ingredientGaps.length} of {data.ingredientGapCount} shortages.</p>}
            </section>}
            <details className="forecast-method"><summary>How these suggestions are calculated</summary><p>We average each active menu item’s paid, noncancelled sales on matching weekdays over the last 28 complete local days, starting from your first recorded sale. Days with no sales count as zero.</p><p>A maximum temperature of 30°C or above adds 15%. A rain probability of 60% or above subtracts 15%. A national public holiday adds 10%. These adjustments are added together, then each serving target is rounded up. Missing provider data contributes no adjustment.</p><p>These are starting rules for planning, rather than measured demand predictions. Opening hours, local events, regional holidays, promotions, and batch sizes are not included.</p></details>
            <footer className="forecast-footer"><span>Updated {updatedLabel(data.generatedAt, data.settings.timezone)} · branch local time</span><span>Weather: <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a> · Holidays: <a href="https://date.nager.at/" target="_blank" rel="noreferrer">Nager.Date</a></span></footer>
          </>}
        </>}
  </>;
}
