import { supabase } from '../../lib/supabase';
import type {
  SalesAgentNotificationDraft,
  SalesNotificationSeverity,
} from './salesAgentIntelligence';

export type SalesAgentNotification = {
  id: string;
  user_id: string;
  seller_email: string;
  fingerprint: string;
  category: SalesAgentNotificationDraft['category'];
  severity: SalesNotificationSeverity;
  title: string;
  message: string;
  recommendation: string;
  entity_type: SalesAgentNotificationDraft['entityType'];
  entity_key: string | null;
  metadata: Record<string, unknown>;
  is_read: boolean;
  dismissed_at: string | null;
  first_detected_at: string;
  last_detected_at: string;
  created_at: string;
  updated_at: string;
};

export type SharedSalesReport = {
  id: string;
  token: string;
  company_name: string;
  seller_name: string | null;
  title: string;
  report_period: string;
  report_html: string;
  score: number | null;
  created_at: string;
};

export async function createSharedSalesReport(input: {
  companyName: string;
  sellerName?: string | null;
  title: string;
  reportPeriod: string;
  reportHtml: string;
  score?: number | null;
}) {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user) throw new Error('La sesión expiró. Inicia sesión para compartir el reporte.');

  const { data, error } = await supabase
    .from('shared_sales_reports')
    .insert({
      owner_user_id: user.id,
      company_name: input.companyName,
      seller_name: input.sellerName ?? null,
      title: input.title,
      report_period: input.reportPeriod,
      report_html: input.reportHtml,
      score: input.score ?? null,
    })
    .select('token')
    .single();

  if (error) throw error;
  return `${window.location.origin}/reportes/compartido/${data.token}`;
}

export async function getSharedSalesReport(token: string): Promise<SharedSalesReport | null> {
  const { data, error } = await supabase.rpc('get_shared_sales_report', {
    p_token: token,
  });
  if (error) throw error;
  return (data?.[0] as SharedSalesReport | undefined) ?? null;
}

export async function listSalesAgentNotifications(): Promise<SalesAgentNotification[]> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user) return [];

  const { data, error } = await supabase
    .from('sales_agent_notifications')
    .select('*')
    .eq('user_id', user.id)
    .is('dismissed_at', null)
    .order('is_read', { ascending: true })
    .order('last_detected_at', { ascending: false })
    .limit(40);
  if (error) throw error;
  return (data ?? []) as SalesAgentNotification[];
}

export async function syncSalesAgentNotifications(
  sellerEmail: string,
  notifications: SalesAgentNotificationDraft[],
) {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user) return;

  const now = new Date().toISOString();
  if (!notifications.length) {
    const { error } = await supabase
      .from('sales_agent_notifications')
      .update({ dismissed_at: now })
      .eq('user_id', user.id)
      .is('dismissed_at', null);
    if (error) throw error;
    return;
  }

  const fingerprints = notifications.map((notification) => notification.fingerprint);
  const { data: existingRows, error: existingError } = fingerprints.length
    ? await supabase
        .from('sales_agent_notifications')
        .select('fingerprint,dismissed_at')
        .eq('user_id', user.id)
        .in('fingerprint', fingerprints)
    : { data: [], error: null };
  if (existingError) throw existingError;

  const dismissedFingerprints = new Set(
    (existingRows ?? [])
      .filter((row) => row.dismissed_at !== null)
      .map((row) => row.fingerprint),
  );

  const rows = notifications
    .filter((notification) => !dismissedFingerprints.has(notification.fingerprint))
    .map((notification) => ({
    user_id: user.id,
    seller_email: sellerEmail.trim().toLowerCase(),
    fingerprint: notification.fingerprint,
    category: notification.category,
    severity: notification.severity,
    title: notification.title,
    message: notification.message,
    recommendation: notification.recommendation,
    entity_type: notification.entityType,
    entity_key: notification.entityKey,
    metadata: notification.metadata,
    last_detected_at: now,
    dismissed_at: null,
  }));

  if (rows.length) {
    const { error } = await supabase
      .from('sales_agent_notifications')
      .upsert(rows, { onConflict: 'user_id,fingerprint' });
    if (error) throw error;
  }

  const { error: staleError } = await supabase
    .from('sales_agent_notifications')
    .update({ dismissed_at: now })
    .eq('user_id', user.id)
    .is('dismissed_at', null)
    .lt('last_detected_at', now);
  if (staleError) throw staleError;
}

export async function markSalesAgentNotificationRead(id: string) {
  const { error } = await supabase
    .from('sales_agent_notifications')
    .update({ is_read: true })
    .eq('id', id);
  if (error) throw error;
}

export async function markAllSalesAgentNotificationsRead() {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user) return;

  const { error } = await supabase
    .from('sales_agent_notifications')
    .update({ is_read: true })
    .eq('user_id', user.id)
    .eq('is_read', false)
    .is('dismissed_at', null);
  if (error) throw error;
}

export async function dismissSalesAgentNotification(id: string) {
  await dismissSalesAgentNotifications([id]);
}

export async function dismissSalesAgentNotifications(ids: string[]) {
  if (!ids.length) return;
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user) return;

  const { error } = await supabase
    .from('sales_agent_notifications')
    .update({ dismissed_at: new Date().toISOString(), is_read: true })
    .eq('user_id', user.id)
    .in('id', ids);
  if (error) throw error;
}
