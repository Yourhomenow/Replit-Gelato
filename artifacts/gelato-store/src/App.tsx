import { createContext, useContext, useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Link, Route, Router as WouterRouter, Switch, useLocation } from 'wouter';
import { ArrowDownRight, ArrowRight, Check, ChevronDown, CircleAlert, ClipboardList, IceCreamBowl, LayoutDashboard, LoaderCircle, LogOut, Package, Plus, Search, ShoppingBag, Sparkles, Store, X } from 'lucide-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  getGetCurrentUserQueryKey, getGetDashboardSummaryQueryKey, getListMenuQueryKey,
  getListOrdersQueryKey, getListStockLotsQueryKey, useCreateMenuItem, useCreateOrder,
  useCreateStockLot, useGetCurrentUser, useGetDashboardSummary, useListBranches,
  useListMenu, useListOrders, useListStockLots, useLogin, useLogout, useRecordPayment,
  useRegister, useUpdateMenuAvailability, useUpdateMenuItem, useUpdateOrderStatus,
  useVerifyOtp,
} from '@workspace/api-client-react';
import type { MenuItem, MenuItemInput, Order, OrderLineInput, OrderStatusInputStatus, PaymentInputMethod } from '@workspace/api-client-react';

const client = new QueryClient();
const BranchSelectionContext = createContext<{
  branchId: string;
  setBranchId: (branchId: string) => void;
} | null>(null);
function useCurrentBranchId() {
  return useContext(BranchSelectionContext)?.branchId ?? '';
}
const money = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
const shortDate = (date: string) => new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(date));
const statusLabel: Record<string, string> = { blending: 'Blending', resting: 'Resting', ready_to_serve: 'Ready to serve' };
const statusNext: Record<string, OrderStatusInputStatus> = { blending: 'resting', resting: 'ready_to_serve' };
const stages = ['blending', 'resting', 'ready_to_serve'];

function QueryState({ loading, error, retry, children }: { loading: boolean; error: boolean; retry: () => void; children: ReactNode }) {
  if (loading) return <div className="skeleton-stack" data-testid="state-loading"><div className="skeleton wide" /><div className="skeleton" /><div className="skeleton" /></div>;
  if (error) return <div className="state-panel error-state" data-testid="state-error"><CircleAlert size={21} /><strong>We couldn’t load this view.</strong><span>Check your connection and try again.</span><button className="button secondary" onClick={retry} data-testid="button-retry">Try again</button></div>;
  return <>{children}</>;
}

function Shell({ children, selectedBranchId, onBranchChange }: { children: ReactNode; selectedBranchId: string; onBranchChange: (branchId: string) => void }) {
  const [location] = useLocation();
  const user = useGetCurrentUser();
  const branches = useListBranches();
  const logout = useLogout();
  const qc = useQueryClient();
  const selectedBranchName = branches.data?.find((branch) => branch.id === selectedBranchId)?.name || user.data?.branchName || 'Branch workspace';
  const nav = [
    { href: '/', label: 'Counter', icon: LayoutDashboard },
    { href: '/new-order', label: 'New order', icon: ShoppingBag },
    { href: '/orders', label: 'Orders', icon: ClipboardList },
    { href: '/menu', label: 'Menu', icon: IceCreamBowl },
    { href: '/stock', label: 'Stock', icon: Package },
  ];
  return <div className="app-shell">
    <aside className="sidebar">
      <Link href="/" className="brand" data-testid="link-brand"><span className="brand-mark"><IceCreamBowl size={21} /></span><span>gelato<span className="brand-light"> / counter</span></span></Link>
      {user.data?.role === 'manager' ? <label className="branch-chip manager-branch-select"><span className="live-dot" /><span className="sr-only">Viewing branch</span><select value={selectedBranchId} onChange={(event) => { onBranchChange(event.target.value); qc.invalidateQueries(); }} data-testid="select-branch-workspace">{branches.data?.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select><ChevronDown size={14} /></label> : <div className="branch-chip"><span className="live-dot" />{user.data?.branchName || 'Branch workspace'}<ChevronDown size={14} /></div>}
      <div className="nav-label">WORKSPACE</div>
      <nav className="side-nav">{nav.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={`nav-link ${location === href ? 'active' : ''}`} data-testid={`link-nav-${label.toLowerCase().replace(' ', '-')}`}><Icon size={18} /><span>{label}</span>{href === '/orders' && <span className="nav-arrow"><ArrowRight size={14} /></span>}</Link>)}</nav>
      <div className="sidebar-bottom">
        <div className="shift-card"><div className="shift-icon"><Sparkles size={16} /></div><div><strong>Keep the line moving</strong><span>Orders, from scoop to serve.</span></div></div>
        {user.data ? <div className="user-strip"><span className="user-avatar">{user.data.fullName.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()}</span><span className="user-meta"><strong data-testid="text-user-name">{user.data.fullName}</strong><small>{user.data.role} · {user.data.branchName}</small></span><button className="icon-button logout-button" aria-label="Sign out" onClick={() => logout.mutate(undefined, { onSuccess: () => qc.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() }) })} data-testid="button-sign-out"><LogOut size={16} /></button></div> : <Link href="/auth" className="auth-shortcut" data-testid="link-sign-in">Sign in to your branch <ArrowRight size={15} /></Link>}
      </div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div className="crumb"><Store size={15} /><span>{selectedBranchName}</span><span className="crumb-sep">/</span><span>{nav.find((n) => n.href === location)?.label || 'Workspace'}</span></div><div className="topbar-right"><span className="counter-status">{user.data?.role || 'Staff'} view</span><span className="top-avatar">{user.data?.fullName?.[0] || 'G'}</span></div></header>
      <div className="page-wrap">{children}</div>
    </main>
  </div>;
}

function PageHeading({ eyebrow, title, subtitle, action }: { eyebrow: string; title: string; subtitle: string; action?: ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{subtitle}</p></div>{action && <div className="heading-action">{action}</div>}</div>;
}

function EmptyState({ title, message, action }: { title: string; message: string; action?: React.ReactNode }) {
  return <div className="empty-state" data-testid="state-empty"><div className="empty-mark"><IceCreamBowl size={22} /></div><strong>{title}</strong><p>{message}</p>{action}</div>;
}

function HomePage() {
  const branch = useCurrentBranchId();
  const summary = useGetDashboardSummary({ branchId: branch });
  const orders = useListOrders({ branchId: branch, limit: 6 });
  const activeOrders = orders.data?.filter((o) => !o.payment) || [];
  const retry = () => { summary.refetch(); orders.refetch(); };
  return <><PageHeading eyebrow="AT A GLANCE" title="Good service starts here." subtitle="A clear view of what’s moving at your counter today." action={<Link href="/new-order" className="button primary" data-testid="button-start-order"><Plus size={17} /> Start an order</Link>} />
    <QueryState loading={summary.isLoading || orders.isLoading} error={summary.isError || orders.isError} retry={retry}>
      {summary.data && <div className="summary-row">
        <article className="summary-card summary-feature"><div className="summary-label">ACTIVE ORDERS <span className="tiny-dot" /></div><div className="summary-value">{summary.data.activeOrders}</div><div className="summary-foot">In preparation now <ArrowDownRight size={15} /></div><div className="summary-watermark"><IceCreamBowl size={76} /></div></article>
        <article className="summary-card"><div className="summary-label">ORDERS TODAY</div><div className="summary-value">{summary.data.todayOrders}</div><div className="summary-foot">Across this branch</div></article>
        <article className="summary-card"><div className="summary-label">TAKEN TODAY</div><div className="summary-value">{money(summary.data.todayRevenueCents)}</div><div className="summary-foot">Recorded payments</div></article>
      </div>}
      <section className="section-block"><div className="section-heading"><div><div className="eyebrow">THE PASS</div><h2>Active orders</h2></div><Link href="/orders" className="text-link" data-testid="link-all-orders">All orders <ArrowRight size={15} /></Link></div>
        {activeOrders.length ? <div className="order-table">{activeOrders.map((order) => <OrderRow key={order.id} order={order} compact />)}</div> : <EmptyState title="Your pass is clear" message="New orders will appear here as soon as they’re created." action={<Link href="/new-order" className="button secondary" data-testid="button-create-first-order">Create first order <ArrowRight size={15} /></Link>} />}
      </section>
    </QueryState>
  </>;
}

function OrderRow({ order, compact = false }: { order: Order; compact?: boolean }) {
  return <div className="order-row" data-testid={`row-order-${order.id}`}><div className="order-number"><span className="order-dot" /><strong>#{order.id.slice(-6).toUpperCase()}</strong><small>{shortDate(order.createdAt)}</small></div><div className="order-items">{order.lines.map((l) => `${l.quantity} × ${l.menuItemName}`).join(' · ')}</div><span className={`status-pill ${order.status}`} data-testid={`status-order-${order.id}`}>{statusLabel[order.status]}</span><strong className="order-total">{money(order.totalCents)}</strong>{!compact && <span className="payment-state">{order.payment ? 'Paid' : 'Payment due'}</span>}</div>;
}

function NewOrderPage() {
  const branchId = useCurrentBranchId();
  const menu = useListMenu({ branchId });
  const [selected, setSelected] = useState<MenuItem | null>(null);
  const [size, setSize] = useState<OrderLineInput['size']>('regular');
  const [flavor, setFlavor] = useState('');
  const [toppings, setToppings] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [cart, setCart] = useState<OrderLineInput[]>([]);
  const [query, setQuery] = useState('');
  const create = useCreateOrder();
  const qc = useQueryClient();
  const items = (menu.data || []).filter((i) => i.isActive && i.availability > 0 && `${i.name} ${i.category}`.toLowerCase().includes(query.toLowerCase()));
  const sum = cart.reduce((acc, line) => acc + (menu.data?.find((m) => m.id === line.menuItemId)?.priceCents || 0) * line.quantity, 0);
  const addLine = () => {
    if (!selected) return;
    setCart((prev) => [...prev, { menuItemId: selected.id, quantity, size, flavor: flavor.trim() || selected.name, toppings: toppings.split(',').map((x) => x.trim()).filter(Boolean) }]);
    setSelected(null); setQuantity(1); setFlavor(''); setToppings('');
  };
  return <><PageHeading eyebrow="NEW TICKET" title="Build an order" subtitle="Choose a menu item, make it theirs, then send it to preparation." />
    <div className="builder-layout">
      <section className="builder-main"><div className="section-heading compact-heading"><div><div className="eyebrow">01 / MENU</div><h2>Choose a base</h2></div><label className="search-box"><Search size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a gelato" data-testid="input-order-search" /></label></div>
        <QueryState loading={menu.isLoading} error={menu.isError} retry={() => menu.refetch()}>
          {items.length ? <div className="menu-grid">{items.map((item, index) => <button key={item.id} className={`menu-tile ${selected?.id === item.id ? 'selected' : ''}`} onClick={() => setSelected(item)} data-testid={`button-menu-select-${item.id}`}><span className={`flavor-stamp stamp-${index % 4}`}><IceCreamBowl size={21} /></span><span className="menu-tile-title">{item.name}</span><span className="menu-tile-description">{item.description}</span><span className="menu-tile-bottom"><span>{item.category}</span><strong>{money(item.priceCents)}</strong></span><small className="availability-count">{item.availability} available</small></button>)}</div> : <EmptyState title="Nothing on the menu yet" message={query ? 'Try another search term.' : 'No available items are listed for this branch.'} />}
        </QueryState>
        {selected && <div className="customize-panel" data-testid="panel-customize"><div className="panel-title"><div><div className="eyebrow">02 / CUSTOMIZE</div><h2>{selected.name}</h2></div><button className="icon-button" onClick={() => setSelected(null)} aria-label="Close customization" data-testid="button-close-customize"><X size={17} /></button></div>
          <div className="customize-grid"><label>Size<select value={size} onChange={(e) => setSize(e.target.value as OrderLineInput['size'])} data-testid="select-order-size"><option value="small">Small</option><option value="regular">Regular</option><option value="large">Large</option></select></label><label>Flavor note<input value={flavor} onChange={(e) => setFlavor(e.target.value)} placeholder={selected.name} data-testid="input-order-flavor" /></label><label className="span-two">Toppings<input value={toppings} onChange={(e) => setToppings(e.target.value)} placeholder="Comma-separated toppings" data-testid="input-order-toppings" /></label><label>Quantity<input type="number" min="1" value={quantity} onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))} data-testid="input-order-quantity" /></label></div>
          <button className="button primary" onClick={addLine} data-testid="button-add-line"><Plus size={16} /> Add to ticket</button></div>}
      </section>
      <aside className="ticket-card"><div className="ticket-top"><span className="eyebrow">03 / YOUR TICKET</span><span className="ticket-number">COUNTER · NEW</span></div><h2>Order details</h2>{cart.length ? <div className="ticket-lines">{cart.map((line, idx) => { const item = menu.data?.find((m) => m.id === line.menuItemId); return <div className="ticket-line" key={`${line.menuItemId}-${idx}`} data-testid={`line-ticket-${idx}`}><div><strong>{line.quantity} × {item?.name}</strong><small>{line.size} · {line.flavor}{line.toppings.length ? ` · ${line.toppings.join(', ')}` : ''}</small></div><span>{money((item?.priceCents || 0) * line.quantity)}</span><button className="icon-button remove-line" aria-label="Remove item" onClick={() => setCart(cart.filter((_, i) => i !== idx))} data-testid={`button-remove-line-${idx}`}><X size={14} /></button></div>; })}</div> : <div className="ticket-empty"><div className="ticket-empty-mark"><ShoppingBag size={22} /></div><strong>Your ticket starts here</strong><span>Select a menu item to build the order.</span></div>}<div className="ticket-total"><span>Estimated total</span><strong>{money(sum)}</strong></div><button className="button primary full-button" disabled={!cart.length || create.isPending} onClick={() => create.mutate({ data: { lines: cart, branchId } }, { onSuccess: () => { qc.invalidateQueries({ queryKey: getListOrdersQueryKey() }); qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }); setCart([]); } })} data-testid="button-create-order">{create.isPending ? <LoaderCircle className="spin" size={17} /> : <ArrowRight size={17} />} Send to preparation</button>{create.isError && <p className="inline-error" data-testid="error-create-order">Order could not be created. Check availability and try again.</p>}</aside>
    </div>
  </>;
}

function OrdersPage() {
  const branchId = useCurrentBranchId();
  const orders = useListOrders({ branchId, limit: 100 });
  const update = useUpdateOrderStatus();
  const payment = useRecordPayment();
  const qc = useQueryClient();
  const [methods, setMethods] = useState<Record<string, PaymentInputMethod>>({});
  const refresh = () => { orders.refetch(); qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }); };
  return <><PageHeading eyebrow="PREPARATION" title="Orders in motion" subtitle="Move each ticket forward as it leaves your station." action={<Link href="/new-order" className="button primary" data-testid="button-new-order"><Plus size={17} /> New order</Link>} />
    <QueryState loading={orders.isLoading} error={orders.isError} retry={() => orders.refetch()}>
      {orders.data?.length ? <div className="orders-list">{orders.data.map((order) => <article className="order-card" key={order.id} data-testid={`card-order-${order.id}`}>
        <div className="order-card-head"><div><span className="eyebrow">TICKET · {shortDate(order.createdAt)}</span><h2>#{order.id.slice(-6).toUpperCase()}</h2></div><span className={`status-pill ${order.status}`}>{statusLabel[order.status]}</span></div>
        <div className="stage-track">{stages.map((stage, i) => <div key={stage} className={`stage ${stages.indexOf(order.status) >= i ? 'complete' : ''}`}><span>{stages.indexOf(order.status) > i ? <Check size={13} /> : i + 1}</span><small>{statusLabel[stage]}</small></div>)}</div>
        <div className="order-card-lines">{order.lines.map((line) => <div className="detail-line" key={line.id}><span><b>{line.quantity} × {line.menuItemName}</b><small>{line.size} · {line.flavor}{line.toppings.length ? ` · ${line.toppings.join(', ')}` : ''}</small></span><strong>{money(line.totalCents)}</strong></div>)}</div>
        <div className="order-card-foot"><div><span className="eyebrow">TOTAL</span><strong className="foot-total">{money(order.totalCents)}</strong></div>{order.payment ? <span className="paid-badge" data-testid={`status-payment-${order.id}`}><Check size={14} /> Paid · {order.payment.method}</span> : <div className="order-actions">{statusNext[order.status] && <button className="button secondary small-button" disabled={update.isPending} onClick={() => update.mutate({ id: order.id, data: { status: statusNext[order.status] } }, { onSuccess: refresh })} data-testid={`button-advance-${order.id}`}>Move to {statusLabel[statusNext[order.status]]} <ArrowRight size={14} /></button>}{order.status === 'ready_to_serve' && <div className="payment-control"><select aria-label="Payment method" value={methods[order.id] || 'qr'} onChange={(e) => setMethods({ ...methods, [order.id]: e.target.value as PaymentInputMethod })} data-testid={`select-payment-method-${order.id}`}><option value="qr">QR payment</option><option value="card">Card</option><option value="transfer">Transfer</option></select><button className="button primary small-button" disabled={payment.isPending} onClick={() => payment.mutate({ id: order.id, data: { method: methods[order.id] || 'qr', amountCents: order.totalCents } }, { onSuccess: refresh })} data-testid={`button-record-payment-${order.id}`}>Record payment</button></div>}</div>}</div>{(update.isError || payment.isError) && <p className="inline-error" data-testid={`error-order-${order.id}`}>Could not save this update. Please try again.</p>}
      </article>)}</div> : <EmptyState title="No orders in the queue" message="Orders created at this branch will appear here." action={<Link href="/new-order" className="button primary" data-testid="button-empty-new-order"><Plus size={16} /> Create an order</Link>} />}
    </QueryState>
  </>;
}

function MenuPage() {
  const user = useGetCurrentUser();
  const branchId = useCurrentBranchId();
  const manager = user.data?.role === 'manager';
  const [search, setSearch] = useState('');
  const items = useListMenu({ branchId, search: search || undefined });
  const [editing, setEditing] = useState<MenuItem | null | 'new'>(null);
  const [availability, setAvailability] = useState<Record<string, string>>({});
  const create = useCreateMenuItem();
  const edit = useUpdateMenuItem();
  const updateAvailability = useUpdateMenuAvailability();
  const qc = useQueryClient();
  const saveRecipe = (form: FormData) => {
    const rawIngredients = String(form.get('ingredients') || '').split('\n').map((line) => line.trim()).filter(Boolean);
    const recipe: MenuItemInput = { name: String(form.get('name')), description: String(form.get('description')), category: String(form.get('category')), priceCents: Math.round(Number(form.get('price')) * 100), recipe: String(form.get('recipe')), storageGuidelines: String(form.get('storage')), ingredients: rawIngredients.map((line) => { const [ingredientName, qty, unit] = line.split(',').map((x) => x.trim()); return { ingredientName, quantityPerServing: Number(qty), unit }; }) };
    const onDone = () => { qc.invalidateQueries({ queryKey: getListMenuQueryKey() }); setEditing(null); };
    if (editing === 'new') create.mutate({ data: recipe }, { onSuccess: onDone });
    else if (editing) edit.mutate({ id: editing.id, data: recipe }, { onSuccess: onDone });
  };
  return <><PageHeading eyebrow="BRANCH MENU" title="What’s in the cabinet?" subtitle="Browse what’s available and keep the branch menu accurate." action={manager ? <button className="button primary" onClick={() => setEditing('new')} data-testid="button-create-menu-item"><Plus size={17} /> Add recipe</button> : <span className="permission-note" data-testid="permission-menu">Staff access · availability only</span>} />
    <div className="toolbar"><label className="search-box wide-search"><Search size={17} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search menu items" data-testid="input-menu-search" /></label><span className="result-hint">{items.data?.length ?? 0} items</span></div>
    <QueryState loading={items.isLoading} error={items.isError} retry={() => items.refetch()}>
      {items.data?.length ? <div className="menu-list">{items.data.map((item, i) => <article className="menu-row" key={item.id} data-testid={`row-menu-${item.id}`}><div className={`flavor-stamp stamp-${i % 4}`}><IceCreamBowl size={22} /></div><div className="menu-info"><div className="menu-name-line"><h2>{item.name}</h2><span className={`availability-tag ${item.availability > 0 && item.isActive ? 'in-stock' : 'out-stock'}`}>{item.isActive && item.availability > 0 ? `${item.availability} available` : 'Unavailable'}</span></div><p>{item.description}</p><div className="menu-meta"><span>{item.category}</span><span>{item.ingredients.length} ingredients</span><span>{item.storageGuidelines}</span></div></div><strong className="menu-price">{money(item.priceCents)}</strong>{manager ? <button className="button secondary small-button" onClick={() => setEditing(item)} data-testid={`button-edit-menu-${item.id}`}>Edit recipe</button> : <div className="availability-edit"><input type="number" min="0" aria-label={`Availability for ${item.name}`} value={availability[item.id] ?? String(item.availability)} onChange={(e) => setAvailability({ ...availability, [item.id]: e.target.value })} data-testid={`input-availability-${item.id}`} /><button className="button secondary small-button" disabled={updateAvailability.isPending} onClick={() => updateAvailability.mutate({ id: item.id, data: { branchId, quantity: Number(availability[item.id] ?? item.availability) } }, { onSuccess: () => qc.invalidateQueries({ queryKey: getListMenuQueryKey() }) })} data-testid={`button-save-availability-${item.id}`}>Save</button>{updateAvailability.isError && <span className="inline-error">Could not save availability.</span>}</div>}</article>)}</div> : <EmptyState title="No menu items found" message={search ? 'Try a different name or category.' : 'There are no items available for this branch yet.'} />}
    </QueryState>
    {editing && manager && <div className="modal-backdrop" role="presentation"><form className="recipe-modal" onSubmit={(e) => { e.preventDefault(); saveRecipe(new FormData(e.currentTarget)); }} data-testid="form-menu-item"><div className="modal-head"><div><div className="eyebrow">{editing === 'new' ? 'NEW RECIPE' : 'MENU EDIT'}</div><h2>{editing === 'new' ? 'Add to the cabinet' : 'Edit recipe'}</h2></div><button type="button" className="icon-button" onClick={() => setEditing(null)} aria-label="Close recipe editor" data-testid="button-close-recipe"><X size={18} /></button></div>
      <div className="form-grid"><label>Name<input name="name" required defaultValue={editing === 'new' ? '' : editing.name} data-testid="input-recipe-name" /></label><label>Category<input name="category" required defaultValue={editing === 'new' ? '' : editing.category} data-testid="input-recipe-category" /></label><label>Price<input name="price" type="number" step="0.01" min="0" required defaultValue={editing === 'new' ? '' : (editing.priceCents / 100).toFixed(2)} data-testid="input-recipe-price" /></label><label>Storage guidelines<input name="storage" defaultValue={editing === 'new' ? '' : editing.storageGuidelines} data-testid="input-recipe-storage" /></label><label className="form-span">Description<textarea name="description" defaultValue={editing === 'new' ? '' : editing.description} data-testid="input-recipe-description" /></label><label className="form-span">Recipe<textarea name="recipe" defaultValue={editing === 'new' ? '' : editing.recipe} data-testid="input-recipe-method" /></label><label className="form-span">Ingredients <small>One per line: ingredient, quantity per serving, unit</small><textarea name="ingredients" defaultValue={editing === 'new' ? '' : editing.ingredients.map((i) => `${i.ingredientName}, ${i.quantityPerServing}, ${i.unit}`).join('\n')} data-testid="input-recipe-ingredients" /></label></div>
      {(create.isError || edit.isError) && <p className="inline-error">Could not save this recipe. Review the fields and try again.</p>}<div className="modal-actions"><button type="button" className="button secondary" onClick={() => setEditing(null)} data-testid="button-cancel-recipe">Cancel</button><button className="button primary" disabled={create.isPending || edit.isPending} data-testid="button-save-recipe">{create.isPending || edit.isPending ? 'Saving…' : 'Save recipe'}</button></div></form></div>}
  </>;
}

function StockPage() {
  const branchId = useCurrentBranchId();
  const [search, setSearch] = useState('');
  const lots = useListStockLots({ branchId, search: search || undefined });
  const create = useCreateStockLot();
  const qc = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  return <><PageHeading eyebrow="INVENTORY" title="Stock on hand" subtitle="Register incoming lots and find the ingredients you need." action={<button className="button primary" onClick={() => setFormOpen(!formOpen)} data-testid="button-register-stock"><Plus size={17} /> Register stock</button>} />
    {formOpen && <form className="stock-form" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); create.mutate({ data: { branchId, ingredientName: String(f.get('ingredient')), quantity: Number(f.get('quantity')), unit: String(f.get('unit')), importDate: String(f.get('date')), supplier: String(f.get('supplier')), shelfLife: String(f.get('shelfLife') || '') || null } }, { onSuccess: () => { qc.invalidateQueries({ queryKey: getListStockLotsQueryKey() }); setFormOpen(false); } }); }} data-testid="form-stock-lot">
      <div className="form-topline"><div><div className="eyebrow">INCOMING LOT</div><h2>Register delivery</h2></div><button type="button" className="icon-button" onClick={() => setFormOpen(false)} aria-label="Close stock form" data-testid="button-close-stock-form"><X size={17} /></button></div>
      <div className="stock-form-grid"><label>Ingredient<input name="ingredient" required placeholder="Pistachio paste" data-testid="input-stock-ingredient" /></label><label>Quantity<input name="quantity" type="number" step="0.01" min="0.01" required data-testid="input-stock-quantity" /></label><label>Unit<input name="unit" required placeholder="kg" data-testid="input-stock-unit" /></label><label>Import date<input name="date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} data-testid="input-stock-date" /></label><label>Supplier<input name="supplier" required data-testid="input-stock-supplier" /></label><label>Shelf life<input name="shelfLife" type="date" data-testid="input-stock-shelf-life" /></label></div>{create.isError && <p className="inline-error">Could not register this lot. Please try again.</p>}<button className="button primary" disabled={create.isPending} data-testid="button-save-stock">{create.isPending ? 'Registering…' : 'Save stock lot'}</button>
    </form>}
    <div className="toolbar"><label className="search-box wide-search"><Search size={17} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search ingredients or supplier" data-testid="input-stock-search" /></label><span className="result-hint">{lots.data?.length ?? 0} lots</span></div>
    <QueryState loading={lots.isLoading} error={lots.isError} retry={() => lots.refetch()}>
      {lots.data?.length ? <div className="stock-table"><div className="stock-table-head"><span>INGREDIENT</span><span>QUANTITY</span><span>RECEIVED</span><span>SUPPLIER</span><span>SHELF LIFE</span></div>{lots.data.map((lot) => <div className="stock-table-row" key={lot.id} data-testid={`row-stock-${lot.id}`}><div className="stock-ingredient"><span className="stock-icon"><Package size={17} /></span><strong>{lot.ingredientName}</strong></div><strong className="mono">{lot.quantity} {lot.unit}</strong><span>{lot.importDate}</span><span>{lot.supplier}</span><span>{lot.shelfLife || 'Not set'}</span></div>)}</div> : <EmptyState title="No stock lots yet" message="Register a delivery to keep branch stock visible." action={!formOpen && <button className="button secondary" onClick={() => setFormOpen(true)} data-testid="button-empty-register-stock"><Plus size={15} /> Register first lot</button>} />}
    </QueryState>
  </>;
}

function AuthPage() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const branches = useListBranches();
  const login = useLogin();
  const register = useRegister();
  const verify = useVerifyOtp();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [challenge, setChallenge] = useState<{ challengeId: string; deliveryHint: string; demoCode: string | null } | null>(null);
  const [error, setError] = useState('');
  const submitAuth = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setError('');
    const f = new FormData(e.currentTarget);
    if (mode === 'login') login.mutate({ data: { phone: String(f.get('phone')), password: String(f.get('password')) } }, { onSuccess: (data) => setChallenge(data), onError: () => setError('We couldn’t start sign in. Check your details and try again.') });
    else register.mutate({ data: { fullName: String(f.get('fullName')), phone: String(f.get('phone')), password: String(f.get('password')), role: String(f.get('role')) as 'staff' | 'manager', branchId: String(f.get('branchId')) } }, { onSuccess: (data) => setChallenge(data), onError: () => setError('Registration could not be completed. Review your details and try again.') });
  };
  const busy = login.isPending || register.isPending || verify.isPending;
  return <div className="auth-page"><Link href="/" className="brand auth-brand" data-testid="link-auth-brand"><span className="brand-mark"><IceCreamBowl size={21} /></span><span>gelato<span className="brand-light"> / counter</span></span></Link><div className="auth-layout"><div className="auth-story"><span className="eyebrow">A BETTER COUNTER SHIFT</span><h1>Every scoop,<br /><em>in its place.</em></h1><p>One calm workspace for taking an order, keeping the cabinet ready, and getting every ticket to the pass.</p><div className="auth-illustration"><div className="scoop scoop-one" /><div className="scoop scoop-two" /><div className="scoop scoop-three" /><div className="cone" /><span className="illustration-caption">MADE FRESH · SERVED WITH CARE</span></div></div>
      <section className="auth-card"><div className="auth-card-top"><div className="eyebrow">{challenge ? 'VERIFY YOUR NUMBER' : mode === 'login' ? 'WELCOME BACK' : 'JOIN YOUR BRANCH'}</div><h2>{challenge ? 'One quick check.' : mode === 'login' ? 'Sign in to the counter' : 'Create your account'}</h2><p>{challenge ? `We sent a six-digit code to ${challenge.deliveryHint}.` : 'Use your phone number and password to continue.'}</p></div>
        {challenge ? <form onSubmit={(e) => { e.preventDefault(); setError(''); const f = new FormData(e.currentTarget); verify.mutate({ data: { challengeId: challenge.challengeId, code: String(f.get('code')) } }, { onSuccess: () => { qc.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() }); setLocation('/'); }, onError: () => setError('That code could not be verified. Please check it and try again.') }); }} data-testid="form-otp">
          <label>Six-digit code<input name="code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required autoFocus placeholder="000000" className="otp-input" data-testid="input-otp-code" /></label>{challenge.demoCode && <div className="demo-code" data-testid="text-demo-code">Demo code <strong>{challenge.demoCode}</strong></div>}{error && <p className="inline-error" data-testid="error-auth">{error}</p>}<button className="button primary full-button" disabled={busy} data-testid="button-verify-otp">{busy ? 'Checking…' : 'Verify and continue'} <ArrowRight size={16} /></button><button type="button" className="text-button" onClick={() => { setChallenge(null); setError(''); }} data-testid="button-back-auth">Back to sign in</button>
        </form> : <form onSubmit={submitAuth} data-testid="form-auth">{mode === 'register' && <><label>Full name<input name="fullName" required minLength={2} placeholder="Your name" data-testid="input-full-name" /></label><label>Branch<select name="branchId" required disabled={branches.isLoading || branches.isError} data-testid="select-auth-branch"><option value="">{branches.isLoading ? 'Loading branches…' : branches.isError ? 'Branches unavailable' : 'Choose a branch'}</option>{branches.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label><label>Role<select name="role" data-testid="select-auth-role"><option value="staff">Staff</option><option value="manager">Manager</option></select></label></>}<label>Phone number<input name="phone" type="tel" required minLength={8} placeholder="+1 555 012 3456" data-testid="input-auth-phone" /></label><label>Password<input name="password" type="password" required minLength={8} placeholder="At least 8 characters" data-testid="input-auth-password" /></label>{error && <p className="inline-error" data-testid="error-auth">{error}</p>}<button className="button primary full-button" disabled={busy || (mode === 'register' && branches.isError)} data-testid="button-submit-auth">{busy ? 'Sending code…' : mode === 'login' ? 'Continue with phone' : 'Create account'} <ArrowRight size={16} /></button><p className="auth-switch">{mode === 'login' ? 'New to this branch?' : 'Already have an account?'} <button type="button" className="text-button inline" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }} data-testid="button-toggle-auth">{mode === 'login' ? 'Register' : 'Sign in'}</button></p></form>}
        {branches.isError && mode === 'register' && <p className="inline-error">Branch list unavailable. <button type="button" className="text-button inline" onClick={() => branches.refetch()} data-testid="button-retry-branches">Retry</button></p>}
      </section>
    </div><div className="auth-footer">GELATO STORE · BRANCH OPERATIONS</div></div>;
}

function AppRoutes() {
  const [location] = useLocation();
  const user = useGetCurrentUser({
    query: { enabled: location !== '/auth', queryKey: getGetCurrentUserQueryKey(), retry: false },
  });
  const [selectedBranchId, setSelectedBranchId] = useState('');
  useEffect(() => {
    if (user.data?.branchId) setSelectedBranchId(user.data.branchId);
  }, [user.data?.id, user.data?.branchId]);
  if (location === '/auth') return <AuthPage />;
  if (user.isLoading) return <div className="auth-loading" data-testid="state-auth-loading"><LoaderCircle className="spin" size={22} /><span>Opening your branch workspace…</span></div>;
  if (user.isError || !user.data) return <AuthPage />;
  const branchId = user.data.role === 'manager' ? selectedBranchId || user.data.branchId : user.data.branchId;
  return <BranchSelectionContext.Provider value={{ branchId, setBranchId: setSelectedBranchId }}><Shell selectedBranchId={branchId} onBranchChange={setSelectedBranchId}><ErrorBoundary resetKey={location}><Switch><Route path="/" component={HomePage} /><Route path="/new-order" component={NewOrderPage} /><Route path="/orders" component={OrdersPage} /><Route path="/menu" component={MenuPage} /><Route path="/stock" component={StockPage} /><Route><div className="state-panel"><h2>That page isn’t here.</h2><Link href="/" className="text-link">Back to the counter <ArrowRight size={14} /></Link></div></Route></Switch></ErrorBoundary></Shell></BranchSelectionContext.Provider>;
}

function App() {
  return <QueryClientProvider client={client}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><AppRoutes /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;
