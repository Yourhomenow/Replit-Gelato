import { CircleAlert } from 'lucide-react';
import { useGetFinancialSummary } from '@workspace/api-client-react';

const money = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

export function FinancialSummaryPage({ branchId }: { branchId: string }) {
  const summary = useGetFinancialSummary({ branchId });
  return <>
    <div className="page-heading"><div><div className="eyebrow">MANAGER REPORT</div><h1>Financial summary</h1><p>All-time recorded payments for the selected branch.</p></div></div>
    {summary.isLoading ? <div className="skeleton-stack"><div className="skeleton wide" /><div className="skeleton" /></div> : summary.isError ? <div className="state-panel"><CircleAlert size={21} /><strong>Could not load the financial summary.</strong><button className="button secondary" onClick={() => summary.refetch()}>Try again</button></div> : summary.data && <>
      <div className="summary-row" data-testid="financial-summary">
        <article className="summary-card summary-feature"><div className="summary-label">PAID REVENUE</div><div className="summary-value">{money(summary.data.revenueCents)}</div><div className="summary-foot">{summary.data.branchName}</div></article>
        <article className="summary-card"><div className="summary-label">PAID ORDERS</div><div className="summary-value">{summary.data.paidOrders}</div><div className="summary-foot">Completed payments</div></article>
        <article className="summary-card"><div className="summary-label">AVERAGE PAID ORDER</div><div className="summary-value">{money(summary.data.averageOrderCents)}</div><div className="summary-foot">Revenue divided by paid orders</div></article>
      </div>
      <section className="section-block"><div className="section-heading"><div><div className="eyebrow">PAYMENT METHODS</div><h2>Revenue by method</h2></div></div><div className="financial-methods">{([['QR', summary.data.byMethodCents.qr], ['Card', summary.data.byMethodCents.card], ['Bank transfer', summary.data.byMethodCents.transfer]] as const).map(([label, amount]) => <div className="financial-method" key={label}><span>{label}</span><strong>{money(amount)}</strong></div>)}</div></section>
    </>}
  </>;
}
