import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CircleAlert, Plus, Sparkles, X } from 'lucide-react';
import {
  getListPromotionsQueryKey, useCreatePromotion, useListMenu, useListPromotions,
  useUpdatePromotion, type Promotion, type PromotionInput,
} from '@workspace/api-client-react';

type Editor = Promotion | 'new' | null;
const localTime = (value: Date) => new Date(value.getTime() - value.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

export function PromotionsPage({ branchId }: { branchId: string }) {
  const promotions = useListPromotions();
  const menu = useListMenu({ branchId });
  const create = useCreatePromotion();
  const update = useUpdatePromotion();
  const qc = useQueryClient();
  const [editor, setEditor] = useState<Editor>(null);
  const [error, setError] = useState('');
  const busy = create.isPending || update.isPending;
  const menuNames = new Map(menu.data?.map((item) => [item.id, item.name]) ?? []);

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor) return;
    const values = new FormData(event.currentTarget);
    const menuItemIds = values.getAll('menuItemIds').map(String);
    const startsAt = new Date(String(values.get('startsAt')));
    const endsAt = new Date(String(values.get('endsAt')));
    if (!menuItemIds.length || !Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) || endsAt <= startsAt) {
      setError('Choose at least one menu item and an end time after the start time.');
      return;
    }
    const data: PromotionInput = {
      name: String(values.get('name')).trim(),
      discountPercent: Number(values.get('discountPercent')),
      menuItemIds,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      isActive: values.get('isActive') === 'on',
    };
    const onSuccess = () => { qc.invalidateQueries({ queryKey: getListPromotionsQueryKey() }); setEditor(null); setError(''); };
    const onError = () => setError('Could not save this promotion. Check the details and try again.');
    if (editor === 'new') create.mutate({ data }, { onSuccess, onError });
    else update.mutate({ id: editor.id, data }, { onSuccess, onError });
  }

  return <>
    <div className="page-heading"><div><div className="eyebrow">CAMPAIGNS</div><h1>Promotions</h1><p>Set discounts for selected menu items and choose when they run.</p></div><div className="heading-action"><button className="button primary" onClick={() => { setError(''); setEditor('new'); }} data-testid="button-add-promotion"><Plus size={17} /> Add promotion</button></div></div>
    {promotions.isLoading ? <div className="skeleton-stack"><div className="skeleton wide" /><div className="skeleton" /></div> : promotions.isError ? <div className="state-panel"><CircleAlert size={21} /><strong>Could not load promotions.</strong><button className="button secondary" onClick={() => promotions.refetch()}>Try again</button></div> : promotions.data?.length ? <div className="promotion-list">{promotions.data.map((promotion) => {
      const now = Date.now();
      const state = !promotion.isActive ? 'Paused' : now < Date.parse(promotion.startsAt) ? 'Scheduled' : now >= Date.parse(promotion.endsAt) ? 'Ended' : 'Running';
      return <article className="promotion-card" key={promotion.id} data-testid={`card-promotion-${promotion.id}`}><span className="promotion-icon"><Sparkles size={20} /></span><div className="promotion-details"><div className="promotion-title"><h2>{promotion.name}</h2><span className={`availability-tag ${state === 'Running' ? 'in-stock' : 'out-stock'}`}>{state}</span></div><p>{promotion.menuItemIds.map((id) => menuNames.get(id) ?? 'Removed item').join(' · ')}</p><small>{new Date(promotion.startsAt).toLocaleString()} to {new Date(promotion.endsAt).toLocaleString()}</small></div><strong className="promotion-rate">{promotion.discountPercent}% off</strong><button className="button secondary small-button" onClick={() => { setError(''); setEditor(promotion); }} data-testid={`button-edit-promotion-${promotion.id}`}>Edit</button></article>;
    })}</div> : <div className="empty-state"><div className="empty-mark"><Sparkles size={22} /></div><strong>No promotions yet</strong><p>Add a campaign to discount selected menu items.</p></div>}
    {editor && <div className="modal-backdrop" onClick={() => setEditor(null)}><section className="recipe-modal" role="dialog" aria-modal="true" aria-labelledby="promotion-editor-title" onClick={(event) => event.stopPropagation()}><div className="modal-head"><div><div className="eyebrow">CAMPAIGN</div><h2 id="promotion-editor-title">{editor === 'new' ? 'Add promotion' : 'Edit promotion'}</h2></div><button className="icon-button" aria-label="Close promotion form" onClick={() => setEditor(null)}><X size={17} /></button></div>
      <form key={editor === 'new' ? 'new' : editor.id} onSubmit={save} data-testid="form-promotion"><div className="form-grid"><label>Name<input name="name" required maxLength={120} defaultValue={editor === 'new' ? '' : editor.name} data-testid="input-promotion-name" /></label><label>Discount (%)<input name="discountPercent" type="number" min="1" max="100" step="1" required defaultValue={editor === 'new' ? 10 : editor.discountPercent} data-testid="input-promotion-discount" /></label><label>Starts<input name="startsAt" type="datetime-local" required defaultValue={editor === 'new' ? localTime(new Date()) : localTime(new Date(editor.startsAt))} data-testid="input-promotion-start" /></label><label>Ends<input name="endsAt" type="datetime-local" required defaultValue={editor === 'new' ? localTime(new Date(Date.now() + 7 * 86400000)) : localTime(new Date(editor.endsAt))} data-testid="input-promotion-end" /></label></div>
        <fieldset className="promotion-items"><legend>Menu items</legend>{menu.isLoading ? <p>Loading menu…</p> : menu.isError ? <p className="inline-error">Could not load the menu.</p> : menu.data?.map((item) => <label key={item.id}><input type="checkbox" name="menuItemIds" value={item.id} defaultChecked={editor !== 'new' && editor.menuItemIds.includes(item.id)} /> {item.name}</label>)}</fieldset>
        <label className="promotion-active"><input type="checkbox" name="isActive" defaultChecked={editor === 'new' || editor.isActive} /> Enabled</label>
        {error && <p className="inline-error" role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="button secondary" onClick={() => setEditor(null)}>Cancel</button><button className="button primary" disabled={busy || menu.isLoading || menu.isError} data-testid="button-save-promotion">{busy ? 'Saving…' : 'Save promotion'}</button></div></form>
    </section></div>}
  </>;
}
