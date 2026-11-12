import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import nodemailer from 'npm:nodemailer@6.10.1';
import { notificationLeadIds } from './notification-input.ts';
import {
  assertOdooEnvironment,
  authenticateWithDatabaseCandidates,
  fieldsGet,
  readOdooEnvironment,
  searchReadAll,
} from '../_shared/odoo-readonly.ts';

const RECIPIENTS = ['alejandro@tectronic.mx', 'alejandrotectro@gmail.com'];
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-report-cron-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type AdminClient = ReturnType<typeof createClient>;
type OdooConnection = { apiKey: string; database: string; odooUrl: string; uid: number };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return respond({ error: 'Método no permitido.' }, 405);

  try {
    const url = Deno.env.get('SUPABASE_URL');
    const publishable = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY');
    const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY');
    if (!url || !publishable || !secret) throw new Error('Falta la configuración de Supabase.');
    const admin = createClient(url, secret);
    const userClient = createClient(url, publishable, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? 'poll');
    const scheduled = !user && action === 'scan-new-leads' &&
      await validCronToken(admin, req.headers.get('x-report-cron-token'));
    if (!user && !scheduled) return respond({ error: 'Sesión no válida.' }, 401);
    if (user && !(await hasMarketingAccess(admin, user.id))) {
      return respond({ error: 'Sin permiso para consultar alertas de Marketing.' }, 403);
    }

    if ((action === 'ack-won' || action === 'delete-won') && user) {
      const ids = notificationLeadIds(body.leadIds);
      if (ids.length) {
        const { error } = await admin.from('marketing_won_notifications')
          .update(action === 'delete-won'
            ? { deleted_at: new Date().toISOString() }
            : { delivered_at: new Date().toISOString() })
          .eq('user_id', user.id).is('deleted_at', null).in('lead_id', ids);
        if (error) throw error;
      }
      return respond({ acknowledged: ids.length });
    }

    if (action === 'list-won' && user) {
      await scanWonLeads(admin, user.id);
      const offset = Number.isSafeInteger(body.offset) && body.offset >= 0 ? body.offset : 0;
      const [{ data, error }, unread] = await Promise.all([
        admin.from('marketing_won_notifications')
          .select('lead_id,lead_name,seller_name,closed_at,created_at,delivered_at')
          .eq('user_id', user.id).is('deleted_at', null)
          .order('created_at', { ascending: false }).order('lead_id', { ascending: false })
          .range(offset, offset + 100),
        admin.from('marketing_won_notifications').select('lead_id', { count: 'exact', head: true })
          .eq('user_id', user.id).is('deleted_at', null).is('delivered_at', null),
      ]);
      if (error || unread.error) throw error ?? unread.error;
      return respond({ wonLeads: (data ?? []).slice(0, 100), unreadCount: unread.count ?? 0,
        nextOffset: (data?.length ?? 0) > 100 ? offset + 100 : null });
    }

    if (action === 'poll' && user) {
      await scanWonLeads(admin, user.id);
      const { data, error } = await admin.from('marketing_won_notifications')
        .select('lead_id,lead_name,seller_name,closed_at')
        .eq('user_id', user.id).is('delivered_at', null).is('deleted_at', null)
        .order('closed_at', { ascending: true }).limit(30);
      if (error) throw error;
      return respond({ wonLeads: data ?? [] });
    }

    if (action === 'scan-new-leads') {
      const result = await scanNewLeads(admin);
      return respond(result);
    }
    return respond({ error: 'Acción no soportada.' }, 400);
  } catch (error) {
    console.error('[marketing-lead-alerts]', error instanceof Error ? error.message : String(error));
    return respond({ error: 'No se pudieron revisar las alertas de Marketing.' }, 500);
  }
});

async function validCronToken(admin: AdminClient, supplied: string | null) {
  if (!supplied) return false;
  const { data, error } = await admin.rpc('get_report_sync_cron_token');
  return !error && typeof data === 'string' && data.length > 20 && supplied === data;
}

async function hasMarketingAccess(admin: AdminClient, userId: string) {
  const { data, error } = await admin.from('admin_module_permissions')
    .select('role,user_type,is_active,can_access_marketing')
    .eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return Boolean(data && data.is_active !== false && data.can_access_marketing &&
    (data.role === 'owner' || data.user_type === 'owner' || data.role === 'marketing_agent'));
}

async function odooConnection(): Promise<OdooConnection> {
  const env = readOdooEnvironment();
  assertOdooEnvironment(env);
  const connection = await authenticateWithDatabaseCandidates({
    apiKey: env.apiKey, configuredDatabase: env.database, odooUrl: env.url, user: env.user,
  });
  return { apiKey: env.apiKey, ...connection };
}

async function claimCursor(admin: AdminClient, scope: string) {
  const { error: insertError } = await admin.from('marketing_alert_cursors')
    .upsert({ scope }, { onConflict: 'scope', ignoreDuplicates: true });
  if (insertError) throw insertError;
  const token = crypto.randomUUID();
  const now = new Date();
  const { data, error } = await admin.from('marketing_alert_cursors')
    .update({ lease_token: token, lease_until: new Date(now.getTime() + 120_000).toISOString() })
    .eq('scope', scope).lt('lease_until', now.toISOString())
    .select('checked_at,baseline_created_at').maybeSingle();
  if (error) throw error;
  return data ? { token, checkedAt: data.checked_at as string, baseline: data.baseline_created_at as string } : null;
}

async function releaseCursor(admin: AdminClient, scope: string, token: string, checkedAt?: string) {
  const { error } = await admin.from('marketing_alert_cursors')
    .update({ lease_token: null, lease_until: '-infinity', ...(checkedAt ? { checked_at: checkedAt } : {}) })
    .eq('scope', scope).eq('lease_token', token);
  if (error) throw error;
}

function odooDate(date: string) {
  return new Date(date).toISOString().replace('T', ' ').slice(0, 19);
}

function many2oneLabel(value: unknown) {
  return Array.isArray(value) ? String(value[1] ?? '') : '';
}

async function scanWonLeads(admin: AdminClient, userId: string) {
  const scope = `won:${userId}`;
  const cursor = await claimCursor(admin, scope);
  if (!cursor) {
    for (let attempt = 0; attempt < 16; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const { data, error } = await admin.from('marketing_alert_cursors')
        .select('lease_token').eq('scope', scope).single();
      if (error) throw error;
      if (!data?.lease_token) break;
    }
    return;
  }
  const started = new Date();
  try {
    const odoo = await odooConnection();
    const meta = await fieldsGet({ ...odoo, model: 'crm.stage' }) as Record<string, unknown>;
    const leads = await searchReadAll({ ...odoo, model: 'crm.lead',
      domain: [['type', 'in', ['lead', 'opportunity']], ['date_closed', '>=', odooDate(cursor.checkedAt)],
        ['date_closed', '<=', odooDate(started.toISOString())], ['active', '=', true]],
      fields: ['id', 'name', 'stage_id', 'probability', 'date_closed', 'user_id'],
      order: 'date_closed asc, id asc', pageSize: 200,
    });
    const stageIds = [...new Set(leads.map((row) => Array.isArray(row.stage_id) ? Number(row.stage_id[0]) : 0).filter(Boolean))];
    const stages = stageIds.length ? await searchReadAll({ ...odoo, model: 'crm.stage',
      domain: [['id', 'in', stageIds]], fields: ['id', 'name', ...(meta.is_won ? ['is_won'] : [])],
    }) : [];
    const wonByStage = new Map(stages.map((row) => [Number(row.id), meta.is_won
      ? row.is_won === true : String(row.name ?? '').toLowerCase().includes('ganad')]));
    const rows = leads.filter((row) => {
      const stageId = Array.isArray(row.stage_id) ? Number(row.stage_id[0]) : 0;
      return wonByStage.get(stageId) ?? Number(row.probability) >= 100;
    }).map((row) => ({
      user_id: userId, lead_id: Number(row.id), lead_name: String(row.name ?? `Lead ${row.id}`),
      seller_name: many2oneLabel(row.user_id), closed_at: new Date(`${row.date_closed}Z`).toISOString(),
    }));
    if (rows.length) {
      const { error } = await admin.from('marketing_won_notifications')
        .upsert(rows, { onConflict: 'user_id,lead_id', ignoreDuplicates: true });
      if (error) throw error;
    }
    await releaseCursor(admin, scope, cursor.token, started.toISOString());
    console.info('[marketing-lead-alerts] won scan', { userId, examined: leads.length, won: rows.length });
  } catch (error) {
    await releaseCursor(admin, scope, cursor.token);
    throw error;
  }
}

async function scanNewLeads(admin: AdminClient) {
  const scope = 'new-leads';
  const cursor = await claimCursor(admin, scope);
  let queued = 0;
  if (cursor) {
    const started = new Date();
    try {
      const odoo = await odooConnection();
      const leads = await searchReadAll({ ...odoo, model: 'crm.lead',
        domain: [['type', 'in', ['lead', 'opportunity']], ['create_date', '>=', odooDate(cursor.baseline)],
          ['write_date', '>=', odooDate(cursor.checkedAt)], ['write_date', '<=', odooDate(started.toISOString())],
          ['user_id', '!=', false]],
        fields: ['id', 'name', 'user_id'], order: 'write_date asc, id asc', pageSize: 200,
      });
      const rows = leads.flatMap((lead) => RECIPIENTS.map((recipient) => ({
        lead_id: Number(lead.id), recipient, lead_name: String(lead.name ?? `Lead ${lead.id}`),
        seller_name: many2oneLabel(lead.user_id),
      })));
      if (rows.length) {
        const { error } = await admin.from('marketing_lead_email_deliveries')
          .upsert(rows, { onConflict: 'lead_id,recipient', ignoreDuplicates: true });
        if (error) throw error;
      }
      queued = rows.length;
      await releaseCursor(admin, scope, cursor.token, started.toISOString());
      console.info('[marketing-lead-alerts] new lead scan', { examined: leads.length, queued });
    } catch (error) {
      await releaseCursor(admin, scope, cursor.token);
      throw error;
    }
  }
  const sent = await deliverPendingEmails(admin);
  return { queued, sent, status: cursor ? 'scanned' : 'scan-in-progress' };
}

async function deliverPendingEmails(admin: AdminClient) {
  const now = new Date().toISOString();
  const { data: pending, error } = await admin.from('marketing_lead_email_deliveries')
    .select('lead_id,recipient,lead_name,seller_name,attempts')
    .is('sent_at', null).lt('lease_until', now).lt('attempts', 5)
    .order('created_at', { ascending: true }).limit(10);
  if (error) throw error;
  if (!pending?.length) return 0;

  const { data: settings, error: settingsError } = await admin.from('support_mailer_settings')
    .select('smtp_host,smtp_port,smtp_secure,smtp_username,smtp_password,sender_name,sender_email,reply_to_email')
    .eq('is_active', true).order('updated_at', { ascending: false }).limit(1).maybeSingle();
  if (settingsError) throw settingsError;
  if (!settings) throw new Error('No hay una configuración SMTP activa para avisos de leads.');
  const transporter = nodemailer.createTransport({
    host: settings.smtp_host, port: settings.smtp_port, secure: settings.smtp_secure,
    connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000,
    auth: { user: settings.smtp_username, pass: settings.smtp_password },
  });
  let sent = 0;
  for (const row of pending) {
    const claimTime = new Date();
    const { data: claimed, error: claimError } = await admin.from('marketing_lead_email_deliveries')
      .update({ status: 'processing', lease_until: new Date(claimTime.getTime() + 90_000).toISOString(),
        attempts: row.attempts + 1 })
      .eq('lead_id', row.lead_id).eq('recipient', row.recipient).is('sent_at', null)
      .lt('lease_until', claimTime.toISOString()).select('lead_id').maybeSingle();
    if (claimError) throw claimError;
    if (!claimed) continue;
    try {
      const title = row.lead_name.replace(/[\r\n]+/g, ' ').slice(0, 180);
      const seller = row.seller_name.replace(/[\r\n]+/g, ' ').slice(0, 160) || 'Sin vendedor';
      await transporter.sendMail({
        from: `"${settings.sender_name}" <${settings.sender_email}>`, to: row.recipient,
        replyTo: settings.reply_to_email || settings.sender_email,
        subject: `Nuevo lead asignado: ${title}`,
        text: `Se registró un nuevo lead en Odoo.\n\nLead: ${title}\nVendedor asignado: ${seller}\nID de Odoo: ${row.lead_id}\n`,
        messageId: `<marketing-lead-${row.lead_id}-${row.recipient.replace(/[^a-z0-9]/gi, '-')}@tectronic.mx>`,
      });
      const { error: sentError } = await admin.from('marketing_lead_email_deliveries')
        .update({ status: 'sent', sent_at: new Date().toISOString(), last_error: null,
          lease_until: '-infinity' }).eq('lead_id', row.lead_id).eq('recipient', row.recipient);
      if (sentError) throw sentError;
      sent += 1;
    } catch (mailError) {
      const message = mailError instanceof Error ? mailError.message : String(mailError);
      console.warn('[marketing-lead-alerts] email failed', { leadId: row.lead_id, recipient: row.recipient,
        error: message.slice(0, 300) });
      await admin.from('marketing_lead_email_deliveries')
        .update({ status: 'pending', lease_until: new Date(Date.now() + 60_000).toISOString(),
          last_error: message.slice(0, 500) })
        .eq('lead_id', row.lead_id).eq('recipient', row.recipient);
    }
  }
  transporter.close();
  return sent;
}

function respond(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  });
}
