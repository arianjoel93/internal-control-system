import { useEffect, useRef, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Bell, CheckCheck, Check, Trash2, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';

type WonNotification = {
  lead_id: number;
  lead_name: string;
  seller_name: string | null;
  closed_at: string;
  delivered_at: string | null;
};
type NotificationPage = { wonLeads: WonNotification[]; unreadCount: number; nextOffset: number | null };

export function MarketingWonNotifications({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const query = useInfiniteQuery({
    queryKey: ['marketing-won-notifications', userId],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const { data, error: invokeError } = await supabase.functions.invoke('marketing-lead-alerts', {
        body: { action: 'list-won', offset: pageParam },
      });
      if (invokeError || data?.error) throw new Error('No se pudieron cargar las notificaciones.');
      return data as NotificationPage;
    },
    getNextPageParam: (last) => last.nextOffset ?? undefined,
    refetchInterval: 60_000,
    retry: false,
  });
  const notifications = [...new Map((query.data?.pages.flatMap((page) => page.wonLeads) ?? [])
    .map((notification) => [notification.lead_id, notification])).values()];
  const unreadCount = query.data?.pages[0]?.unreadCount ?? 0;
  const selectedIds = selected.filter((id) => notifications.some((notification) => notification.lead_id === id));
  const allSelected = notifications.length > 0 && selectedIds.length === notifications.length;

  useEffect(() => {
    if (!open) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); }
    };
    document.addEventListener('pointerdown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  async function update(action: 'ack-won' | 'delete-won', ids: number[]) {
    if (!ids.length || busy) return;
    setBusy(true); setError(null);
    try {
      for (let index = 0; index < ids.length; index += 500) {
        const { data, error: invokeError } = await supabase.functions.invoke('marketing-lead-alerts', {
          body: { action, leadIds: ids.slice(index, index + 500) },
        });
        if (invokeError || data?.error) throw new Error('No se pudieron guardar los cambios. Inténtalo de nuevo.');
      }
      setSelected([]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudieron guardar los cambios.');
    } finally {
      await query.refetch();
      setBusy(false);
    }
  }

  return <div className="marketing-notification-menu" ref={container}>
    <button ref={trigger} type="button" className="secondary-button marketing-notification-trigger"
      aria-label={`Notificaciones de leads ganados: ${unreadCount} sin leer`}
      aria-expanded={open} aria-controls="marketing-won-inbox" onClick={() => setOpen((value) => !value)}>
      <Bell size={19} /><span>Notificaciones</span>
      {unreadCount > 0 ? <span className="marketing-notification-count">{unreadCount > 99 ? '99+' : unreadCount}</span> : null}
    </button>
    {open ? <section id="marketing-won-inbox" className="marketing-notification-panel" aria-label="Notificaciones de leads ganados" aria-busy={busy}>
      <header><div><strong>Leads ganados</strong><small>{unreadCount} sin leer</small></div>
        <button type="button" className="secondary-button" aria-label="Cerrar notificaciones" onClick={() => { setOpen(false); trigger.current?.focus(); }}><X size={17} /></button>
      </header>
      <div className="marketing-notification-body">
      {notifications.length > 0 ? <div className="marketing-notification-bulk">
        <label><input type="checkbox" checked={allSelected} disabled={busy}
          ref={(node) => { if (node) node.indeterminate = selectedIds.length > 0 && !allSelected; }}
          onChange={() => setSelected(allSelected ? [] : notifications.map((notification) => notification.lead_id))} />Seleccionar cargadas</label>
        <span className="marketing-notification-selection">{selectedIds.length} seleccionadas</span>
        <div className="marketing-notification-bulk-actions">
        <button type="button" className="secondary-button" disabled={busy || !selectedIds.length} onClick={() => void update('ack-won', selectedIds)}><CheckCheck size={15} />Marcar leídas</button>
        <button type="button" className="secondary-button" disabled={busy || !selectedIds.length} onClick={() => void update('delete-won', selectedIds)}><Trash2 size={15} />Eliminar</button>
        </div>
      </div> : null}
      {error || query.isError ? <div role="alert" className="marketing-notification-error">{error ?? 'No se pudieron cargar las notificaciones.'}
        {query.isError ? <button type="button" className="secondary-button" onClick={() => void query.refetch()}>Reintentar</button> : null}</div> : null}
      {query.isPending ? <p role="status">Cargando notificaciones…</p> : null}
      {!query.isPending && !query.isError && notifications.length === 0 ? <p className="marketing-notification-empty">No tienes notificaciones de leads ganados.</p> : null}
      <ul className="marketing-notification-list">{notifications.map((notification) => <li key={notification.lead_id} className={notification.delivered_at ? 'is-read' : 'is-unread'}>
        <input type="checkbox" aria-label={`Seleccionar ${notification.lead_name}`} disabled={busy} checked={selectedIds.includes(notification.lead_id)}
          onChange={(event) => setSelected(event.target.checked ? [...selected, notification.lead_id] : selected.filter((id) => id !== notification.lead_id))} />
        <div><small>{notification.delivered_at ? 'Leída' : 'Nueva'} · Lead ganado</small><strong>{notification.lead_name}</strong>
          {notification.seller_name ? <span>Vendedor: {notification.seller_name}</span> : null}
          <time dateTime={notification.closed_at}>{new Date(notification.closed_at).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}</time>
          <div className="marketing-notification-item-actions">
            {!notification.delivered_at ? <button type="button" className="secondary-button" disabled={busy} onClick={() => void update('ack-won', [notification.lead_id])}><Check size={14} />Marcar leída</button> : null}
            <button type="button" className="secondary-button" disabled={busy} aria-label={`Eliminar notificación de ${notification.lead_name}`} onClick={() => void update('delete-won', [notification.lead_id])}><Trash2 size={14} />Eliminar</button>
          </div>
        </div>
      </li>)}</ul>
      {query.hasNextPage ? <button type="button" className="secondary-button" disabled={query.isFetchingNextPage || busy} onClick={() => void query.fetchNextPage()}>{query.isFetchingNextPage ? 'Cargando…' : 'Cargar más notificaciones'}</button> : null}
      </div>
    </section> : null}
  </div>;
}
