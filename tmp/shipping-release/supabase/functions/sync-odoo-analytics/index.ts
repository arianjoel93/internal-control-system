import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  assertOdooEnvironment,
  authenticateWithDatabaseCandidates,
  executeReadKw,
  fieldsGet,
  readOdooEnvironment,
  type OdooEnvironment,
} from '../_shared/odoo-readonly.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-report-cron-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SYNC_KEY = 'global';
const MODEL_NAME = 'account.invoice.report.aggregates';
const DAILY_CATEGORY_MODEL_NAME = 'account.invoice.report.daily.category';
const DAILY_HISTORY_DAYS = 400;
const MONTHLY_REFRESH_MONTHS = 25;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Método no permitido.' }, 405);

  const lockOwner = crypto.randomUUID();
  let sourceDatabase = '';
  let stage = 'bootstrap';
  let lockAcquired = false;

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = resolveSupabasePublishableKey();
    const serviceRoleKey = resolveSupabaseSecretKey();
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse({ error: 'Faltan variables de entorno de Supabase para sincronizar Reportes.' }, 500);
    }

    const authorization = req.headers.get('Authorization') ?? '';
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    stage = 'auth.user';
    const { data: { user } } = await userClient.auth.getUser();
    const isScheduledCall = user
      ? false
      : await isValidScheduledCall(adminClient, req.headers.get('x-report-cron-token'));
    if (!user && !isScheduledCall) return jsonResponse({ error: 'Sesión no válida.' }, 401);

    if (user) {
      stage = 'permissions';
      const access = await getReportsAccess(adminClient, user.id, user.email);
      if (!access.canAccess) {
        return jsonResponse({ error: access.reason ?? 'No tienes permisos para sincronizar reportes.' }, 403);
      }
      if (!access.canSync) {
        return jsonResponse({ error: 'La sincronización compartida de Reportes solo puede iniciarla un administrador o gerente.' }, 403);
      }
    }

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const forceFull = body.forceFull === true;
    const scheduled = isScheduledCall;
    const today = new Date().toISOString().slice(0, 10);
    const requestedDailyStart = addDays(today, -DAILY_HISTORY_DAYS);
    if (!forceFull && !scheduled) {
      const { data: latestState, error: latestStateError } = await adminClient
        .from('report_odoo_sync_state')
        .select('source_database,synced_start_date,last_successful_sync')
        .eq('sync_key', SYNC_KEY)
        .eq('model_name', MODEL_NAME)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latestStateError) throw latestStateError;
      const lastSuccessMs = latestState?.last_successful_sync
        ? Date.parse(latestState.last_successful_sync)
        : 0;
      const categoryCoverageFresh = latestState?.source_database
        ? await isDailyCategoryCoverageFresh(adminClient, latestState.source_database, requestedDailyStart, today)
        : false;
      if (latestState?.synced_start_date && categoryCoverageFresh && Date.now() - lastSuccessMs < 20 * 60 * 60_000) {
        return jsonResponse({ status: 'fresh', processed: 0, hasMore: false });
      }
    }

    stage = 'odoo.secrets';
    const odoo = await resolveOdooEnvironment(adminClient);
    assertOdooEnvironment(odoo);
    stage = 'odoo.auth';
    const connection = await authenticateWithDatabaseCandidates({
      apiKey: odoo.apiKey,
      configuredDatabase: odoo.database ?? '',
      odooUrl: odoo.url,
      user: odoo.user,
    });
    sourceDatabase = connection.database;

    stage = 'sync.state';
    const { data: claimed, error: claimError } = await adminClient.rpc('claim_report_odoo_sync', {
      p_source_database: sourceDatabase,
      p_sync_key: SYNC_KEY,
      p_model_name: MODEL_NAME,
      p_lock_owner: lockOwner,
    });
    if (claimError) throw claimError;
    lockAcquired = claimed === true;
    if (!lockAcquired) {
      return jsonResponse({ status: 'running', message: 'La sincronización de Reportes ya está en curso.' });
    }

    const { data: syncState, error: stateError } = await adminClient
      .from('report_odoo_sync_state')
      .select('synced_start_date,synced_end_date,last_successful_sync')
      .eq('source_database', sourceDatabase)
      .eq('sync_key', SYNC_KEY)
      .eq('model_name', MODEL_NAME)
      .maybeSingle();
    if (stateError) throw stateError;

    const lastSuccessMs = syncState?.last_successful_sync
      ? Date.parse(syncState.last_successful_sync)
      : 0;
    const categoryCoverageFresh = await isDailyCategoryCoverageFresh(
      adminClient,
      sourceDatabase,
      requestedDailyStart,
      today,
    );
    if (!forceFull && !scheduled && categoryCoverageFresh && syncState?.synced_start_date &&
      Date.now() - lastSuccessMs < 20 * 60 * 60_000) {
      await finishSync(adminClient, sourceDatabase, lockOwner, true, null, null, 0);
      lockAcquired = false;
      return jsonResponse({ status: 'fresh', processed: 0, hasMore: false });
    }

    stage = 'odoo.metadata';
    const meta = await fieldsGet({
      apiKey: odoo.apiKey,
      database: connection.database,
      model: 'account.invoice.report',
      odooUrl: connection.odooUrl,
      uid: connection.uid,
    });
    const requiredFields = ['invoice_date', 'company_id', 'price_subtotal'];
    const missingFields = requiredFields.filter((field) => !meta[field]);
    if (missingFields.length) throw new Error(`Análisis de facturas no tiene los campos requeridos: ${missingFields.join(', ')}.`);

    stage = 'sync.range';
    const todayMonth = firstDayOfMonth(today);
    const isBootstrap = forceFull || !syncState?.synced_start_date;
    const earliestDate = isBootstrap
      ? await findEarliestInvoiceDate(odoo, connection, meta)
      : null;
    const rangeStart = isBootstrap
      ? earliestDate ?? todayMonth
      : firstDayOfMonth(addMonths(todayMonth, -(MONTHLY_REFRESH_MONTHS - 1)));
    const dailyStart = maxDate(rangeStart, addDays(today, -DAILY_HISTORY_DAYS));

    stage = 'odoo.read-group';
    const sellerField = meta.invoice_user_id ? 'invoice_user_id' : meta.user_id ? 'user_id' : null;
    const currencyField = meta.currency_id ? 'currency_id' : null;
    const categoryField = meta.product_categ_id ? 'product_categ_id' : null;
    const marginField = meta.price_margin ? 'price_margin' : null;
    const monthlyTotals = await readGroupedMetrics({
      apiKey: odoo.apiKey, connection, meta, dateStart: rangeStart, dateEnd: today,
      dateGroup: 'month', sellerField, currencyField, marginField,
    });
    const monthlyCategories = categoryField
      ? await readGroupedMetrics({
        apiKey: odoo.apiKey, connection, meta, dateStart: rangeStart, dateEnd: today,
        dateGroup: 'month', sellerField, currencyField, marginField, categoryField,
      })
      : [];
    const dailyMetrics = await readGroupedMetrics({
      apiKey: odoo.apiKey, connection, meta, dateStart: dailyStart, dateEnd: today,
      dateGroup: 'day', sellerField, currencyField, marginField,
    });
    const dailyCategoryMetrics = categoryField
      ? await readGroupedMetrics({
        apiKey: odoo.apiKey, connection, meta, dateStart: dailyStart, dateEnd: today,
        dateGroup: 'day', sellerField, currencyField, marginField, categoryField,
      })
      : [];

    stage = 'supabase.replace-aggregates';
    await replaceMonthlyMetrics(adminClient, sourceDatabase, rangeStart, todayMonth, monthlyTotals);
    await replaceMonthlyCategoryMetrics(adminClient, sourceDatabase, rangeStart, todayMonth, monthlyCategories);
    await replaceDailyMetrics(adminClient, sourceDatabase, dailyStart, today, dailyMetrics);
    await replaceDailyCategoryMetrics(adminClient, sourceDatabase, dailyStart, today, dailyCategoryMetrics);

    stage = 'sync.finish';
    const processed = monthlyTotals.length + monthlyCategories.length + dailyMetrics.length + dailyCategoryMetrics.length;
    await finishSync(
      adminClient,
      sourceDatabase,
      lockOwner,
      true,
      rangeStart,
      today,
      processed,
    );
    lockAcquired = false;
    await persistDailyCategorySyncState(adminClient, sourceDatabase, dailyStart, today, dailyCategoryMetrics.length);

    return jsonResponse({
      status: 'ok',
      mode: isBootstrap ? 'initial_aggregate_load' : scheduled ? 'scheduled_refresh' : 'rolling_refresh',
      processed,
      monthlyRows: monthlyTotals.length,
      monthlyCategoryRows: monthlyCategories.length,
      dailyRows: dailyMetrics.length,
      dailyCategoryRows: dailyCategoryMetrics.length,
      rangeStart,
      rangeEnd: today,
      dailyStart,
      hasMore: false,
    });
  } catch (error) {
    console.error('[sync-odoo-analytics]', { stage, error });
    if (sourceDatabase && lockAcquired) {
      await safeFinishSync(sourceDatabase, lockOwner, false, error);
    }
    return jsonResponse({
      error: `[sync-odoo-analytics:${stage}] ${error instanceof Error ? error.message : 'No se pudo sincronizar Odoo.'}`,
    }, 500);
  }
});

async function readGroupedMetrics(input: {
  apiKey: string;
  connection: { database: string; odooUrl: string; uid: number };
  meta: Record<string, unknown>;
  dateStart: string;
  dateEnd: string;
  dateGroup: 'day' | 'month';
  sellerField: string | null;
  currencyField: string | null;
  marginField: string | null;
  categoryField?: string | null;
}) {
  const domain: unknown[] = [
    ['move_type', 'in', ['out_invoice', 'out_refund']],
    ['state', '=', 'posted'],
    ['invoice_date', '>=', input.dateStart],
    ['invoice_date', '<=', input.dateEnd],
  ];
  const groupBy = [
    `invoice_date:${input.dateGroup}`,
    'company_id',
    ...(input.sellerField ? [input.sellerField] : []),
    ...(input.currencyField ? [input.currencyField] : []),
    ...(input.categoryField ? [input.categoryField] : []),
  ];
  const aggregateFields = [
    'invoice_date',
    'company_id',
    ...(input.sellerField ? [input.sellerField] : []),
    ...(input.currencyField ? [input.currencyField] : []),
    ...(input.categoryField ? [input.categoryField] : []),
    'price_subtotal:sum',
    ...(input.marginField ? [`${input.marginField}:sum`] : []),
  ];
  const rows = await executeReadKw({
    apiKey: input.apiKey,
    args: [domain, aggregateFields, groupBy],
    database: input.connection.database,
    kwargs: { lazy: false },
    method: 'read_group',
    model: 'account.invoice.report',
    odooUrl: input.connection.odooUrl,
    uid: input.connection.uid,
  }) as Record<string, unknown>[];

  return rows.map((row) => {
    const groupedDate = groupedDateValue(row, 'invoice_date');
    const month = groupedDate ? firstDayOfMonth(groupedDate) : null;
    if (!groupedDate || !month) return null;
    const company = row.company_id;
    const seller = input.sellerField ? row[input.sellerField] : null;
    const currency = input.currencyField ? row[input.currencyField] : null;
    const category = input.categoryField ? row[input.categoryField] : null;
    const dimensions = {
      company_id: many2oneId(company) ?? 0,
      company_name: many2oneName(company),
      seller_id: many2oneId(seller) ?? 0,
      seller_name: many2oneName(seller),
      currency_code: many2oneName(currency) ?? 'MXN',
      invoice_count: Math.max(0, Math.round(numberValue(row.__count ?? row.invoice_date_count))),
      untaxed_amount: numberValue(row.price_subtotal),
      margin_amount: input.marginField ? numberValue(row[input.marginField]) : 0,
    };
    return {
      ...(input.dateGroup === 'day' ? { metric_date: groupedDate } : { metric_month: month }),
      ...dimensions,
      ...(input.categoryField ? {
        category_id: many2oneId(category) ?? 0,
        category_name: many2oneName(category) ?? 'Sin categoría',
      } : {}),
    };
  }).filter((row): row is NonNullable<typeof row> => row !== null);
}

async function isDailyCategoryCoverageFresh(
  client: ReturnType<typeof createClient>,
  database: string,
  requestedStart: string,
  requestedEnd: string,
) {
  const { data, error } = await client.from('report_odoo_sync_state')
    .select('synced_start_date,synced_end_date,last_successful_sync')
    .eq('source_database', database)
    .eq('sync_key', SYNC_KEY)
    .eq('model_name', DAILY_CATEGORY_MODEL_NAME)
    .maybeSingle();
  if (error) throw error;
  const lastSuccessMs = data?.last_successful_sync ? Date.parse(data.last_successful_sync) : 0;
  return Boolean(data?.synced_start_date && data.synced_start_date <= requestedStart &&
    data.synced_end_date && data.synced_end_date >= requestedEnd &&
    Date.now() - lastSuccessMs < 20 * 60 * 60_000);
}

async function persistDailyCategorySyncState(
  client: ReturnType<typeof createClient>,
  database: string,
  start: string,
  end: string,
  rowCount: number,
) {
  const now = new Date().toISOString();
  const { error } = await client.from('report_odoo_sync_state').upsert({
    source_database: database,
    sync_key: SYNC_KEY,
    model_name: DAILY_CATEGORY_MODEL_NAME,
    last_sync_at: now,
    last_successful_sync: now,
    synced_start_date: start,
    synced_end_date: end,
    row_count: rowCount,
    records_processed: rowCount,
    status: 'idle',
    updated_at: now,
  }, { onConflict: 'source_database,sync_key,model_name' });
  if (error) throw error;
}

async function findEarliestInvoiceDate(
  odoo: OdooEnvironment,
  connection: { database: string; odooUrl: string; uid: number },
  meta: Record<string, unknown>,
) {
  const rows = await executeReadKw({
    apiKey: odoo.apiKey,
    args: [[
      ['move_type', 'in', ['out_invoice', 'out_refund']],
      ['state', '=', 'posted'],
      ['invoice_date', '!=', false],
    ]],
    database: connection.database,
    kwargs: { fields: ['invoice_date'], limit: 1, order: 'invoice_date asc' },
    method: 'search_read',
    model: 'account.invoice.report',
    odooUrl: connection.odooUrl,
    uid: connection.uid,
  }) as Array<Record<string, unknown>>;
  const value = `${rows[0]?.invoice_date ?? ''}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? firstDayOfMonth(value) : null;
}

async function replaceMonthlyMetrics(
  client: ReturnType<typeof createClient>, database: string, start: string, end: string, rows: Array<Record<string, unknown>>,
) {
  const { error: deleteError } = await client.from('report_sales_monthly_metrics')
    .delete().eq('source_database', database).gte('metric_month', firstDayOfMonth(start)).lte('metric_month', firstDayOfMonth(end));
  if (deleteError) throw deleteError;
  const now = new Date().toISOString();
  const payload = rows.map((row) => ({ ...row, source_database: database, source_fetched_at: now, updated_at: now }));
  await upsertChunks(client, 'report_sales_monthly_metrics', payload,
    'source_database,metric_month,company_id,seller_id,currency_code');
}

async function replaceMonthlyCategoryMetrics(
  client: ReturnType<typeof createClient>, database: string, start: string, end: string, rows: Array<Record<string, unknown>>,
) {
  const { error: deleteError } = await client.from('report_sales_monthly_category_metrics')
    .delete().eq('source_database', database).gte('metric_month', firstDayOfMonth(start)).lte('metric_month', firstDayOfMonth(end));
  if (deleteError) throw deleteError;
  const now = new Date().toISOString();
  const payload = rows.map((row) => ({ ...row, source_database: database, source_fetched_at: now, updated_at: now }));
  await upsertChunks(client, 'report_sales_monthly_category_metrics', payload,
    'source_database,metric_month,company_id,seller_id,category_id,currency_code');
}

async function replaceDailyMetrics(
  client: ReturnType<typeof createClient>, database: string, start: string, end: string, rows: Array<Record<string, unknown>>,
) {
  const { error: deleteError } = await client.from('report_sales_daily_metrics')
    .delete().eq('source_database', database).gte('metric_date', start).lte('metric_date', end);
  if (deleteError) throw deleteError;
  const now = new Date().toISOString();
  const payload = rows.map((row) => ({ ...row, source_database: database, source_fetched_at: now, updated_at: now }));
  await upsertChunks(client, 'report_sales_daily_metrics', payload,
    'source_database,metric_date,company_id,seller_id,currency_code');
}

async function replaceDailyCategoryMetrics(
  client: ReturnType<typeof createClient>, database: string, start: string, end: string, rows: Array<Record<string, unknown>>,
) {
  const { error: deleteError } = await client.from('report_sales_daily_category_metrics')
    .delete().eq('source_database', database).gte('metric_date', start).lte('metric_date', end);
  if (deleteError) throw deleteError;
  const now = new Date().toISOString();
  const payload = rows.map((row) => ({ ...row, source_database: database, source_fetched_at: now, updated_at: now }));
  await upsertChunks(client, 'report_sales_daily_category_metrics', payload,
    'source_database,metric_date,company_id,seller_id,category_id,currency_code');
}

async function upsertChunks(
  client: ReturnType<typeof createClient>, table: string, rows: Array<Record<string, unknown>>, onConflict: string,
) {
  for (let index = 0; index < rows.length; index += 500) {
    const { error } = await client.from(table).upsert(rows.slice(index, index + 500), { onConflict });
    if (error) throw error;
  }
}

async function finishSync(
  client: ReturnType<typeof createClient>, database: string, owner: string, success: boolean,
  start: string | null, end: string | null, processed: number, errorMessage: string | null = null,
) {
  const { error } = await client.rpc('finish_report_odoo_sync', {
    p_source_database: database,
    p_sync_key: SYNC_KEY,
    p_model_name: MODEL_NAME,
    p_lock_owner: owner,
    p_success: success,
    p_last_write_date: null,
    p_synced_start_date: start,
    p_synced_end_date: end,
    p_records_processed: processed,
    p_error_message: errorMessage,
  });
  if (error) throw error;
}

async function safeFinishSync(database: string, owner: string, success: boolean, error: unknown) {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = resolveSupabaseSecretKey();
    if (!supabaseUrl || !serviceRoleKey) return;
    const client = createClient(supabaseUrl, serviceRoleKey);
    await finishSync(client, database, owner, success, null, null, 0,
      error instanceof Error ? error.message : 'Error desconocido');
  } catch {
    // The synchronization lock expires if best-effort cleanup fails.
  }
}

async function isValidScheduledCall(client: ReturnType<typeof createClient>, suppliedToken: string | null) {
  if (!suppliedToken) return false;
  const { data, error } = await client.rpc('get_report_sync_cron_token');
  if (error || typeof data !== 'string') return false;
  return constantTimeEqual(suppliedToken, data);
}

function constantTimeEqual(left: string, right: string) {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  return difference === 0;
}

async function resolveOdooEnvironment(client: ReturnType<typeof createClient>): Promise<OdooEnvironment> {
  const environment = readOdooEnvironment();
  const { data, error } = await client.rpc('get_odoo_readonly_connection');
  if (error || !Array.isArray(data)) return environment;
  const secrets = new Map<string, string>();
  for (const row of data) {
    const name = typeof row?.secret_name === 'string' ? row.secret_name.trim() : '';
    const value = typeof row?.secret_value === 'string' ? row.secret_value.trim() : '';
    if (name && value) secrets.set(name, value);
  }
  return {
    apiKey: secrets.get('odoo_reports_api_key') ?? environment.apiKey,
    database: secrets.get('odoo_reports_database') ?? environment.database,
    url: (secrets.get('odoo_reports_url') ?? environment.url).replace(/\/+$/, ''),
    user: secrets.get('odoo_reports_user') ?? environment.user,
  };
}

async function getReportsAccess(client: ReturnType<typeof createClient>, userId: string, email: string | null | undefined) {
  const { data: summary, error } = await client.from('admin_module_permissions')
    .select('role,is_active').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  const owner = email?.trim().toLowerCase() === 'joeltrincadov@gmail.com';
  const role = owner ? 'owner' : `${summary?.role ?? ''}`;
  if ((!summary || summary.is_active === false) && !owner) return { canAccess: false, reason: 'Tu usuario está inactivo.' };
  if (role === 'owner' || role === 'manager' || role === 'admin' || role === 'administrator') {
    return { canAccess: true, canSync: true };
  }
  const { data: permission, error: permissionError } = await client.from('admin_module_permission_items')
    .select('can_access').eq('user_id', userId).eq('module_key', 'reports').maybeSingle();
  if (permissionError) throw permissionError;
  return permission?.can_access
    ? { canAccess: true, canSync: false }
    : { canAccess: false, reason: 'No tienes permisos para consultar Reportes.' };
}

function resolveSupabasePublishableKey() {
  const direct = Deno.env.get('SUPABASE_ANON_KEY')?.trim();
  if (direct) return direct;
  try {
    const map = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}') as Record<string, string>;
    return map.default?.trim() || map.anon?.trim() || null;
  } catch { return null; }
}

function resolveSupabaseSecretKey() {
  const direct = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();
  if (direct) return direct;
  try {
    const map = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, string>;
    return map.default?.trim() || null;
  } catch { return null; }
}

function groupedDateValue(row: Record<string, unknown>, field: string) {
  const range = row.__range;
  if (range && typeof range === 'object') {
    for (const [key, value] of Object.entries(range as Record<string, unknown>)) {
      if (!key.startsWith(`${field}:`) || !value || typeof value !== 'object') continue;
      const from = `${(value as Record<string, unknown>).from ?? ''}`;
      const fromMatch = from.match(/^(\d{4}-\d{2}-\d{2})/);
      if (fromMatch) return fromMatch[1];
    }
  }

  const raw = `${row[`${field}:day`] ?? row[`${field}:month`] ?? row[field] ?? ''}`.trim();
  const iso = raw.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3] ?? '01'}`;

  const normalized = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const monthNumbers: Record<string, string> = {
    ene: '01', enero: '01', feb: '02', febrero: '02', mar: '03', marzo: '03',
    abr: '04', abril: '04', may: '05', mayo: '05', jun: '06', junio: '06',
    jul: '07', julio: '07', ago: '08', agosto: '08', sep: '09', sept: '09',
    septiembre: '09', setiembre: '09', oct: '10', octubre: '10', nov: '11',
    noviembre: '11', dic: '12', diciembre: '12',
  };
  const monthYear = normalized.match(/^([a-z.]+)\s+(\d{4})$/);
  if (monthYear && monthNumbers[monthYear[1].replace('.', '')]) {
    return `${monthYear[2]}-${monthNumbers[monthYear[1].replace('.', '')]}-01`;
  }
  const dayMonthYear = normalized.match(/^(\d{1,2})\s+([a-z.]+)\s+(\d{4})$/);
  if (dayMonthYear) {
    const month = monthNumbers[dayMonthYear[2].replace('.', '')];
    if (month) return `${dayMonthYear[3]}-${month}-${dayMonthYear[1].padStart(2, '0')}`;
  }
  return null;
}

function many2oneId(value: unknown) {
  if (Array.isArray(value) && Number.isFinite(Number(value[0]))) return Number(value[0]);
  if (Number.isFinite(Number(value))) return Number(value);
  return null;
}

function many2oneName(value: unknown) {
  return Array.isArray(value) && typeof value[1] === 'string' ? value[1] : null;
}

function numberValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function firstDayOfMonth(value: string) { return `${value.slice(0, 7)}-01`; }
function addMonths(value: string, amount: number) {
  const [year, month] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1 + amount, 1)).toISOString().slice(0, 10);
}
function addDays(value: string, amount: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}
function maxDate(left: string, right: string) { return left > right ? left : right; }

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
