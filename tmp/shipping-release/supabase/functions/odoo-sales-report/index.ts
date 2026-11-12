import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  assertOdooEnvironment,
  authenticateWithDatabaseCandidates,
  readOdooEnvironment,
  type OdooEnvironment,
} from '../_shared/odoo-readonly.ts';
import {
  fetchInvoiceDailyMetrics,
  fetchCommercialDataset,
  resolveOdooSalespersonIdentity,
} from './core.ts';
import { fetchAgentHistoricalBaselines, fetchPreviousOpenQuoteCount } from './agent-summary-context.ts';
import { decodeReportDataset, encodeReportDataset, reportDatasetCacheKey, reportDatasetCacheTtlMs } from './dataset-cache.ts';
import { resolveClosedMonthComparisonRange } from './closed-month-comparison.ts';
import { preparedKey, readPreparedSummary } from './prepared-summary.ts';
import {
  normalizeOdooEmail,
  resolveServerCompanyIds,
  resolveServerSellerIds,
  shouldUseOwnMarketingScope,
  shouldUseOwnReportScope,
} from './salesperson-scope.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const salespersonIdentityCache = new Map<string, {
  expiresAt: number;
  data: Awaited<ReturnType<typeof resolveOdooSalespersonIdentity>>;
}>();
const CACHE_TTL_MS = 1000 * 60 * 3;
let lastDatasetCachePruneAt = 0;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Metodo no permitido.' }, 405);
  }

  let stage = 'bootstrap';

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = resolveSupabasePublishableKey();
    const serviceRoleKey = resolveSupabaseSecretKey();

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse(
        {
          error:
            'Faltan variables de entorno de Supabase. Verifica SUPABASE_URL y una clave publishable/anon junto con una secret/service_role en la Edge Function.',
        },
        500,
      );
    }

    stage = 'auth.header';
    const authorization = req.headers.get('Authorization') ?? '';

    stage = 'supabase.clients';
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    stage = 'odoo.secrets';
    const odoo = await resolveOdooEnvironment(adminClient);
    assertOdooEnvironment(odoo);

    stage = 'auth.user';
    const {
      data: { user: caller },
      error: callerError,
    } = await userClient.auth.getUser();

    if (callerError || !caller) {
      return jsonResponse({ error: 'Sesion no valida.' }, 401);
    }

    stage = 'payload';
    const body = await req.json();
    const requestedDomain = body.requestedDomain === 'purchases'
      ? 'purchases'
      : body.requestedDomain === 'all'
        ? 'all'
        : 'sales';
    const loadMode = body.loadMode === 'fast' || body.loadMode === 'partition'
      ? body.loadMode
      : 'full';
    const reportContext = body.reportContext === 'marketing' ? 'marketing' : 'reports';

    stage = 'permissions';
    const access = await getReportsAccess(adminClient, caller.id, caller.email, requestedDomain, reportContext);
    if (!access.canAccess) {
      return jsonResponse(
        { error: access.reason ?? 'No tienes permisos para consultar el modulo solicitado.' },
        403,
      );
    }

    let salespersonIdentity: Awaited<ReturnType<typeof resolveOdooSalespersonIdentity>> | null = null;
    let forcedSalespersonId: number | null = null;
    let forcedCompanyId: number | null = null;
    if (access.visibilityScope === 'own') {
      stage = 'odoo.salesperson';
      const normalizedEmail = normalizeOdooEmail(caller.email);
      const identityCacheKey = JSON.stringify({
        userId: caller.id,
        email: normalizedEmail,
        odooUrl: odoo.url,
        odooDatabase: odoo.database,
      });
      const cachedIdentity = salespersonIdentityCache.get(identityCacheKey);
      salespersonIdentity =
        cachedIdentity && cachedIdentity.expiresAt > Date.now()
          ? cachedIdentity.data
          : await resolveOdooSalespersonIdentity({
              apiKey: odoo.apiKey,
              email: normalizedEmail,
              odooUrl: odoo.url,
              odooDatabase: odoo.database,
              user: odoo.user,
            });
      salespersonIdentityCache.set(identityCacheKey, {
        expiresAt: Date.now() + CACHE_TTL_MS,
        data: salespersonIdentity,
      });

      await persistSalespersonResolution({
        access,
        adminClient,
        caller,
        identity: salespersonIdentity,
      });

      if (salespersonIdentity.status !== 'linked') {
        const ambiguous = salespersonIdentity.status === 'ambiguous';
        return jsonResponse(
          {
            error: ambiguous
              ? 'Hay más de un vendedor activo de Odoo con tu correo. El Propietario debe corregir la duplicidad antes de abrir el reporte.'
              : 'No existe un vendedor activo de Odoo asociado exactamente con tu correo. Solicita al Propietario que revise tu usuario en Odoo.',
            code: ambiguous
              ? 'odoo_salesperson_ambiguous'
              : 'odoo_salesperson_not_found',
            linkStatus: salespersonIdentity.status,
          },
          409,
        );
      }

      forcedSalespersonId = numberOrNull(salespersonIdentity.users[0]?.id);
      forcedCompanyId = many2oneId(salespersonIdentity.users[0]?.company_id);
      if (!forcedSalespersonId || !forcedCompanyId) {
        return jsonResponse(
          {
            error: !forcedSalespersonId
              ? 'No fue posible determinar de forma segura el vendedor asociado con tu cuenta.'
              : 'El usuario de Odoo asociado con tu correo no tiene una compañía principal válida.',
            code: !forcedSalespersonId
              ? 'odoo_salesperson_not_found'
              : 'odoo_company_not_found',
            linkStatus: 'not_found',
          },
          409,
        );
      }
    }

    const normalizedFilters = normalizeFilters(
      body,
      access.visibilityScope,
      forcedSalespersonId,
      forcedCompanyId,
    );
    if (body.action === 'executive-summary') {
      if (reportContext !== 'reports' || requestedDomain !== 'sales') {
        return jsonResponse({ error: 'Resumen disponible solamente para Reportes de ventas.' }, 403);
      }
      stage = 'reports.prepared-summary';
      const result = await readPreparedSummary(adminClient, {
        filters: normalizedFilters, config: body.config,
        source: { database: odoo.database, url: odoo.url.replace(/\/+$/, ''), user: odoo.user },
        scope: access.visibilityScope === 'all' ? 'all' : `own:${forcedCompanyId}:${forcedSalespersonId}`,
        users: salespersonIdentity?.users ?? [], role: access.role, forceRefresh: body.forceRefresh === true,
      });
      return jsonResponse(result, result.ready ? 200 : result.error ? 503 : 202);
    }
    if (body.action === 'agent-summary-context') {
      if (reportContext !== 'reports' || requestedDomain !== 'sales' || access.visibilityScope !== 'own' ||
        !forcedSalespersonId || !forcedCompanyId || !salespersonIdentity) {
        return jsonResponse({ error: 'Este análisis solo está disponible para el agente de ventas autenticado.' }, 403);
      }
      stage = 'odoo.agent-summary-context';
      const connection = salespersonIdentity.connection;
      const [historyResult, quoteResult] = await Promise.allSettled([
        fetchAgentHistoricalBaselines({
          adminClient, apiKey: odoo.apiKey, connection, filters: normalizedFilters,
          sellerId: forcedSalespersonId, companyId: forcedCompanyId,
          forceRefresh: body.forceRefresh === true,
        }),
        fetchPreviousOpenQuoteCount({
          apiKey: odoo.apiKey, connection, filters: normalizedFilters,
          sellerId: forcedSalespersonId, companyId: forcedCompanyId,
          rangeKey: typeof body.rangeKey === 'string' ? body.rangeKey : null,
        }),
      ]);
      if (historyResult.status === 'rejected') console.warn('[odoo-sales-report] historical baseline unavailable', historyResult.reason);
      if (quoteResult.status === 'rejected') console.warn('[odoo-sales-report] previous quotes unavailable', quoteResult.reason);
      return jsonResponse({
        baselines: historyResult.status === 'fulfilled' ? historyResult.value.baselines : [],
        baselineAvailable: historyResult.status === 'fulfilled',
        baselineSaved: historyResult.status === 'fulfilled' && historyResult.value.saved,
        previousQuoteCount: quoteResult.status === 'fulfilled' ? quoteResult.value.count : null,
        previousQuoteRange: quoteResult.status === 'fulfilled' ? quoteResult.value.range : null,
      });
    }
    if (body.action === 'daily-sales-summary') {
      if (reportContext !== 'reports' || requestedDomain !== 'sales') {
        return jsonResponse({ error: 'El resumen diario solo está disponible para Reportes de ventas.' }, 403);
      }
      stage = 'reports.daily-summary';
      const closedMonthRange = resolveClosedMonthComparisonRange(normalizedFilters, access.visibilityScope);
      const comparisonRange = closedMonthRange ?? resolveDailyComparisonRange(normalizedFilters);
      const { data: syncState, error: syncStateError } = await adminClient
        .from('report_odoo_sync_state')
        .select('source_database,synced_start_date,synced_end_date,last_successful_sync,status')
        .eq('sync_key', 'global')
        .eq('model_name', 'account.invoice.report.aggregates')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (syncStateError) throw syncStateError;
      if (!syncState?.source_database) {
        return jsonResponse({ available: false, points: [], message: 'La carga inicial de Reportes todavía no ha terminado.' });
      }
      const database = `${syncState.source_database}`;
      const effectiveFilters = {
        ...normalizedFilters,
        companyIds: normalizedFilters.companyIds?.length
          ? normalizedFilters.companyIds
          : forcedCompanyId ? [forcedCompanyId] : [],
        sellerIds: normalizedFilters.sellerIds?.length
          ? normalizedFilters.sellerIds
          : forcedSalespersonId ? [forcedSalespersonId] : [],
      };
      const [monthlyMetrics, yearToDateTotals] = await Promise.all([
        readMonthlyComparison(adminClient, database, effectiveFilters, comparisonRange, Boolean(closedMonthRange)),
        closedMonthRange
          ? readYearToDateTotals(adminClient, database, effectiveFilters).catch((error) => {
            console.warn('[odoo-sales-report] Year-to-date total unavailable.', error);
            return null;
          })
          : Promise.resolve(null),
      ]);
      const summary = closedMonthRange
        ? buildMonthlySummaryResponse(monthlyMetrics, comparisonRange)
        : await readDailyComparison(adminClient, database, effectiveFilters, comparisonRange);
      return jsonResponse({
        ...summary,
        monthlyMetrics,
        yearToDateTotals,
        closedMonthsOnly: Boolean(closedMonthRange),
        comparisonCurrentEndDate: closedMonthRange?.currentEndDate ?? null,
        previousRange: {
          startDate: comparisonRange.previousStartDate,
          endDate: comparisonRange.previousEndDate,
        },
        syncKey: 'global',
        syncStatus: syncState.status ?? 'idle',
        lastSuccessfulSync: syncState.last_successful_sync,
      });
    }
    const sourceScope = access.visibilityScope === 'all' ? 'all' : `own:${forcedCompanyId}:${forcedSalespersonId}`;
    const sourceIdentity = { database: odoo.database, url: odoo.url.replace(/\/+$/, ''), user: odoo.user };
    const sourceFilters = {
      ...normalizedFilters, grouping: 'day',
      companyIds: [...new Set(normalizedFilters.companyIds ?? [])].sort((a, b) => a - b),
      sellerIds: [...new Set(normalizedFilters.sellerIds ?? [])].sort((a, b) => a - b),
    };
    const sourcePartitionKey = reportContext === 'reports' && requestedDomain === 'sales' && loadMode === 'partition'
      ? await preparedKey({ kind: 'source', source: sourceIdentity, scope: sourceScope,
        filters: sourceFilters })
      : null;
    if (sourcePartitionKey && body.forceRefresh !== true) {
      stage = 'cache.source-partition';
      try {
        const { data: storedSource, error: sourceError } = await adminClient.from('report_prepared_cache')
          .select('payload_gzip_base64,source_checked_at').eq('cache_key', sourcePartitionKey).maybeSingle();
        if (sourceError) throw sourceError;
        if (storedSource?.payload_gzip_base64) {
          const cachedSource = await decodeReportDataset(storedSource.payload_gzip_base64);
          if (cachedSource.scopeApplied === access.visibilityScope && cachedSource.availableFilters) {
            const checkedAt = storedSource.source_checked_at ? Date.parse(storedSource.source_checked_at) : 0;
            if (!checkedAt || Date.now() - checkedAt > 30 * 60 * 60_000) {
              EdgeRuntime.waitUntil((async () => {
                const { error: queueError } = await adminClient.rpc('enqueue_report_preparation', {
                  p_key: sourcePartitionKey,
                  p_kind: 'source',
                  p_scope: sourceScope,
                  p_parameters: { filters: sourceFilters, source: sourceIdentity, scope: sourceScope,
                    users: salespersonIdentity?.users ?? [] },
                  p_priority: 5,
                });
                if (queueError) throw queueError;
                const { error: dispatchError } = await adminClient.rpc('dispatch_report_preparation');
                if (dispatchError) throw dispatchError;
              })().catch((refreshError) => console.warn('[odoo-sales-report] Source refresh unavailable.', refreshError)));
            }
            return jsonResponse(sanitizeReport({ ...cachedSource, viewerRole: access.role }));
          }
        }
      } catch (sourceError) {
        console.warn('[odoo-sales-report] Source partition cache unavailable.', sourceError);
      }
    }
    const persistentCacheKey = await reportDatasetCacheKey({
      odooUrl: odoo.url,
      odooDatabase: odoo.database,
      odooUser: odoo.user,
      odooApiKey: odoo.apiKey,
      requestedDomain,
      reportContext,
      loadMode,
      visibilityScope: access.visibilityScope,
      forcedSalespersonId,
      forcedCompanyId,
      filters: normalizedFilters,
    });
    if (body.forceRefresh !== true) {
      stage = 'cache.read';
      try {
        const { data: stored, error: cacheError } = await adminClient
          .from('report_dataset_cache')
          .select('payload_gzip_base64')
          .eq('cache_key', persistentCacheKey)
          .gt('expires_at', new Date().toISOString())
          .maybeSingle();
        if (cacheError) throw cacheError;
        if (stored?.payload_gzip_base64) {
          const cachedReport = await decodeReportDataset(stored.payload_gzip_base64);
          if (cachedReport.scopeApplied === access.visibilityScope && cachedReport.availableFilters) {
            const safeCachedReport = sanitizeReport({ ...cachedReport, viewerRole: access.role });
            return jsonResponse(safeCachedReport);
          }
        }
      } catch (cacheError) {
        console.warn('[odoo-sales-report] Persistent dataset cache unavailable; loading Odoo.', cacheError);
      }
    }

    stage = 'odoo.dataset';
    const report = await fetchCommercialDataset({
      apiKey: odoo.apiKey,
      filters: normalizedFilters,
      odooUrl: odoo.url,
      odooDatabase: odoo.database,
      requestedDomain,
      reportContext,
      loadMode,
      user: odoo.user,
      viewerEmail: caller.email,
      viewerOdooUsers: salespersonIdentity?.users ?? [],
      viewerOdooUserIds: forcedSalespersonId ? [forcedSalespersonId] : [],
      connection: salespersonIdentity?.connection,
    });
    const safeReport = sanitizeReport({
      ...report,
      viewerRole: access.role,
    });
    EdgeRuntime.waitUntil((async () => {
      try {
        const { viewerRole: _viewerRole, ...cachePayload } = safeReport;
        const encoded = await encodeReportDataset(cachePayload);
        if (!encoded) return;
        const now = Date.now();
        if (sourcePartitionKey) {
          const { error: sourceSaveError } = await adminClient.from('report_prepared_cache').upsert({
            cache_key: sourcePartitionKey,
            kind: 'source', scope_key: sourceScope,
            start_date: sourceFilters.startDate, end_date: sourceFilters.endDate,
            parameters: { filters: sourceFilters, source: sourceIdentity, scope: sourceScope,
              users: salespersonIdentity?.users ?? [] },
            payload_gzip_base64: encoded.value, payload_bytes: encoded.bytes,
            source_checked_at: new Date(now).toISOString(), calculated_at: new Date(now).toISOString(),
            stale: false,
          }, { onConflict: 'cache_key' });
          if (sourceSaveError) console.warn('[odoo-sales-report] Source partition could not be retained.', sourceSaveError.message);
        }
        const { error: cacheError } = await adminClient.from('report_dataset_cache').upsert({
          cache_key: persistentCacheKey,
          scope_key: access.visibilityScope === 'all'
            ? 'all'
            : `own:${forcedCompanyId}:${forcedSalespersonId}`,
          payload_gzip_base64: encoded.value,
          payload_bytes: encoded.bytes,
          source_fetched_at: report.fetchedAt,
          expires_at: new Date(now + reportDatasetCacheTtlMs(normalizedFilters.endDate, loadMode)).toISOString(),
          updated_at: new Date(now).toISOString(),
        }, { onConflict: 'cache_key' });
        if (cacheError) throw cacheError;
        if (now - lastDatasetCachePruneAt > 60 * 60_000) {
          lastDatasetCachePruneAt = now;
          const { error: pruneError } = await adminClient.from('report_dataset_cache').delete()
            .lt('expires_at', new Date(now - 7 * 86_400_000).toISOString());
          if (pruneError) console.warn('[odoo-sales-report] Dataset cache cleanup unavailable.', pruneError);
        }
      } catch (cacheError) {
        console.warn('[odoo-sales-report] Persistent dataset cache could not be saved.', cacheError);
      }
    })());

    return jsonResponse(safeReport);
  } catch (error) {
    console.error('[odoo-sales-report]', { stage, error });
    const message =
      error instanceof Error
        ? error.message
        : 'No se pudo generar el reporte de ventas desde Odoo.';

    return jsonResponse({ error: `[odoo-sales-report:${stage}] ${message}` }, 500);
  }
});

async function resolveOdooEnvironment(
  adminClient: ReturnType<typeof createClient>,
): Promise<OdooEnvironment> {
  const environment = readOdooEnvironment();
  const { data, error } = await adminClient.rpc('get_odoo_readonly_connection');

  if (error || !Array.isArray(data)) {
    return environment;
  }

  const secrets = new Map<string, string>();
  for (const row of data) {
    const name = typeof row?.secret_name === 'string' ? row.secret_name.trim() : '';
    const value = typeof row?.secret_value === 'string' ? row.secret_value.trim() : '';
    if (name && value) {
      secrets.set(name, value);
    }
  }

  return {
    apiKey: secrets.get('odoo_reports_api_key') ?? environment.apiKey,
    database: secrets.get('odoo_reports_database') ?? environment.database,
    url: (secrets.get('odoo_reports_url') ?? environment.url).replace(/\/+$/, ''),
    user: secrets.get('odoo_reports_user') ?? environment.user,
  };
}

async function authenticateReportConnection(odoo: OdooEnvironment) {
  return authenticateWithDatabaseCandidates({
    apiKey: odoo.apiKey,
    configuredDatabase: odoo.database ?? '',
    odooUrl: odoo.url,
    user: odoo.user,
  });
}

function resolveDailyComparisonRange(filters: ReturnType<typeof normalizeFilters>) {
  return {
    currentStartDate: filters.startDate,
    currentEndDate: filters.endDate,
    previousStartDate: shiftDateByYears(filters.startDate, -1),
    previousEndDate: shiftDateByYears(filters.endDate, -1),
  };
}

async function hasDailyMetricCoverage(
  adminClient: ReturnType<typeof createClient>,
  database: string,
  comparisonRange: { previousStartDate: string; previousEndDate: string },
  filters: ReturnType<typeof normalizeFilters>,
  scopeKey: string,
) {
  const startDate = [filters.startDate, comparisonRange.previousStartDate].sort()[0];
  const endDate = [filters.endDate, comparisonRange.previousEndDate].sort().at(-1) ?? filters.endDate;
  const { data, error } = await adminClient
    .from('report_odoo_sync_state')
    .select('synced_start_date,synced_end_date,updated_at')
    .eq('source_database', database)
    .eq('sync_key', scopeKey)
    .eq('model_name', 'account.invoice.report.daily')
    .maybeSingle();
  if (error) {
    console.warn('[odoo-sales-report] daily coverage unavailable', error);
    return false;
  }
  if (!data?.synced_start_date || !data?.synced_end_date) return false;
  if (Date.now() - Date.parse(data.updated_at) > 12 * 60 * 60_000) return false;
  return data.synced_start_date <= startDate && data.synced_end_date >= endDate;
}

async function persistDailyMetrics(
  adminClient: ReturnType<typeof createClient>,
  database: string,
  rows: Array<{
    metricDate: string;
    companyId: number | null;
    companyName: string | null;
    sellerId: number | null;
    sellerName: string | null;
    currencyCode: string | null;
    invoiceCount: number;
    untaxedAmount: number;
    marginAmount: number;
  }>,
) {
  if (!rows.length) return;
  const now = new Date().toISOString();
  const payload = rows.map((row) => ({
    source_database: database,
    metric_date: row.metricDate,
    company_id: row.companyId ?? 0,
    company_name: row.companyName,
    seller_id: row.sellerId ?? 0,
    seller_name: row.sellerName,
    currency_code: row.currencyCode ?? 'MXN',
    invoice_count: Math.max(0, Math.round(row.invoiceCount)),
    untaxed_amount: row.untaxedAmount,
    margin_amount: row.marginAmount,
    source_fetched_at: now,
    updated_at: now,
  }));
  for (let index = 0; index < payload.length; index += 500) {
    const chunk = payload.slice(index, index + 500);
    const { error } = await adminClient
      .from('report_sales_daily_metrics')
      .upsert(chunk, { onConflict: 'source_database,metric_date,company_id,seller_id,currency_code' });
    if (error) throw error;
  }
}

async function persistDailySyncState(
  adminClient: ReturnType<typeof createClient>,
  input: { database: string; scopeKey: string; startDate: string; endDate: string; rowCount: number },
) {
  const now = new Date().toISOString();
  const { error } = await adminClient.from('report_odoo_sync_state').upsert({
    source_database: input.database,
    sync_key: input.scopeKey,
    model_name: 'account.invoice.report.daily',
    last_sync_at: now,
    last_write_date: now,
    synced_start_date: input.startDate,
    synced_end_date: input.endDate,
    row_count: input.rowCount,
    updated_at: now,
  }, { onConflict: 'source_database,sync_key,model_name' });
  if (error) console.warn('[odoo-sales-report] daily sync state unavailable', error);
}

async function readDailyComparison(
  adminClient: ReturnType<typeof createClient>,
  database: string,
  filters: ReturnType<typeof normalizeFilters>,
  comparisonRange: { previousStartDate: string; previousEndDate: string },
) {
  const companyIds = Array.isArray(filters.companyIds) ? filters.companyIds : [];
  const sellerIds = Array.isArray(filters.sellerIds) ? filters.sellerIds : [];
  const { data, error } = await adminClient.rpc('get_report_sales_daily_comparison', {
    p_source_database: database,
    p_current_start: filters.startDate,
    p_current_end: filters.endDate,
    p_previous_start: comparisonRange.previousStartDate,
    p_previous_end: comparisonRange.previousEndDate,
    p_company_ids: companyIds,
    p_seller_ids: sellerIds,
  });
  if (error) throw error;
  return buildDailySummaryResponse(filters, comparisonRange, Array.isArray(data) ? data : []);
}

async function readMonthlyComparison(
  adminClient: ReturnType<typeof createClient>,
  database: string,
  filters: ReturnType<typeof normalizeFilters>,
  comparisonRange: {
    currentStartDate: string;
    currentEndDate: string;
    previousStartDate: string;
    previousEndDate: string;
  },
  closedMonthsOnly = false,
) {
  const { data, error } = await adminClient.rpc(closedMonthsOnly
    ? 'get_report_sales_closed_month_comparison'
    : 'get_report_sales_monthly_comparison', {
    p_source_database: database,
    p_current_start: comparisonRange.currentStartDate,
    p_current_end: comparisonRange.currentEndDate,
    p_previous_start: comparisonRange.previousStartDate,
    p_previous_end: comparisonRange.previousEndDate,
    p_company_ids: filters.companyIds?.length ? filters.companyIds : null,
    p_seller_ids: filters.sellerIds?.length ? filters.sellerIds : null,
  });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

async function readYearToDateTotals(
  adminClient: ReturnType<typeof createClient>,
  database: string,
  filters: ReturnType<typeof normalizeFilters>,
) {
  const range = resolveDailyComparisonRange(filters);
  const { data, error } = await adminClient.rpc('get_report_sales_ytd_total_comparison', {
    p_source_database: database,
    p_current_start: range.currentStartDate,
    p_current_end: range.currentEndDate,
    p_previous_start: range.previousStartDate,
    p_previous_end: range.previousEndDate,
    p_company_ids: filters.companyIds?.length ? filters.companyIds : null,
    p_seller_ids: filters.sellerIds?.length ? filters.sellerIds : null,
  });
  if (error) throw error;
  if (!Array.isArray(data) || !data.some((row) => row.period === 'current')) return null;
  return {
    current: data.reduce((sum, row) => sum + (row.period === 'current' ? Number(row.untaxed_amount ?? 0) : 0), 0),
    previous: data.reduce((sum, row) => sum + (row.period === 'previous' ? Number(row.untaxed_amount ?? 0) : 0), 0),
  };
}

function buildMonthlySummaryResponse(
  rows: Array<Record<string, unknown>>,
  range: { currentStartDate: string; currentEndDate: string; previousStartDate: string; previousEndDate: string },
) {
  const current = { untaxed: 0, margin: 0, invoices: 0 };
  const previous = { untaxed: 0, margin: 0, invoices: 0 };
  const monthBuckets = new Map<number, { current: number; previous: number }>();
  for (const row of rows) {
    if (row.grain !== 'total') continue;
    const period = row.period === 'previous' ? 'previous' : 'current';
    const amount = Number(row.untaxed_amount ?? 0);
    const margin = Number(row.margin_amount ?? 0);
    const invoices = Number(row.invoice_count ?? 0);
    const target = period === 'previous' ? previous : current;
    target.untaxed += amount;
    target.margin += margin;
    target.invoices += invoices;
    const month = Number(`${row.metric_month ?? ''}`.slice(5, 7));
    if (Number.isInteger(month) && month >= 1 && month <= 12) {
      const bucket = monthBuckets.get(month) ?? { current: 0, previous: 0 };
      bucket[period] += amount;
      monthBuckets.set(month, bucket);
    }
  }

  const endMonth = Number(range.currentEndDate.slice(5, 7));
  const previousYear = Number(range.previousStartDate.slice(0, 4));
  const monthFormatter = new Intl.DateTimeFormat('es-MX', { month: 'short', timeZone: 'UTC' });
  const points = Array.from({ length: endMonth }, (_, index) => {
    const month = index + 1;
    const monthStart = `${range.currentStartDate.slice(0, 4)}-${`${month}`.padStart(2, '0')}-01`;
    const previousMonthStart = `${previousYear}-${`${month}`.padStart(2, '0')}-01`;
    return {
      bucketKey: monthStart,
      label: monthFormatter.format(new Date(`${monthStart}T00:00:00.000Z`)).replace('.', ''),
      invoicedAmount: monthBuckets.get(month)?.current ?? 0,
      previousInvoicedAmount: monthBuckets.get(month)?.previous ?? 0,
      previousLabel: monthFormatter.format(new Date(`${previousMonthStart}T00:00:00.000Z`)).replace('.', ''),
    };
  });

  return {
    points,
    currentTotal: current.untaxed,
    previousTotal: previous.untaxed,
    currentMargin: current.margin,
    previousMargin: previous.margin,
    currentInvoiceCount: current.invoices,
    previousInvoiceCount: previous.invoices,
    available: rows.some((row) => row.grain === 'total'),
  };
}

function buildDailySummaryResponse(
  filters: ReturnType<typeof normalizeFilters>,
  comparisonRange: { previousStartDate: string; previousEndDate: string },
  rows: Array<Record<string, unknown>>,
) {
  const dayMs = 86_400_000;
  const currentStart = new Date(`${filters.startDate}T00:00:00.000Z`);
  const currentEnd = new Date(`${filters.endDate}T00:00:00.000Z`);
  const days = Math.max(1, Math.round((currentEnd.getTime() - currentStart.getTime()) / dayMs) + 1);
  const current = Array.from({ length: days }, () => ({ untaxed: 0, margin: 0, invoices: 0 }));
  const previous = Array.from({ length: days }, () => ({ untaxed: 0, margin: 0, invoices: 0, firstDate: null as string | null, lastDate: null as string | null }));

  rows.forEach((row) => {
    const index = Number(row.day_index);
    if (!Number.isFinite(index) || index < 0 || index >= days) return;
    const target = row.period === 'previous' ? previous[index] : current[index];
    target.untaxed += Number(row.untaxed_amount ?? 0);
    target.margin += Number(row.margin_amount ?? 0);
    target.invoices += Number(row.invoice_count ?? 0);
    if (row.period === 'previous') {
      const date = typeof row.metric_date === 'string' ? row.metric_date : null;
      if (date) {
        previous[index].firstDate = previous[index].firstDate && previous[index].firstDate < date ? previous[index].firstDate : date;
        previous[index].lastDate = previous[index].lastDate && previous[index].lastDate > date ? previous[index].lastDate : date;
      }
    }
  });

  const points = current.map((bucket, index) => {
    const date = new Date(currentStart.getTime() + index * dayMs).toISOString().slice(0, 10);
    const previousBucket = previous[index];
    return {
      bucketKey: date,
      label: formatShortDate(date),
      invoicedAmount: bucket.untaxed,
      previousInvoicedAmount: previousBucket.untaxed,
      previousLabel: previousBucket.firstDate
        ? previousBucket.firstDate === previousBucket.lastDate
          ? formatShortDate(previousBucket.firstDate)
          : `${formatShortDate(previousBucket.firstDate)} - ${formatShortDate(previousBucket.lastDate ?? previousBucket.firstDate)}`
        : 'Sin día equivalente',
    };
  });

  return {
    points,
    currentTotal: current.reduce((sum, row) => sum + row.untaxed, 0),
    previousTotal: previous.reduce((sum, row) => sum + row.untaxed, 0),
    currentMargin: current.reduce((sum, row) => sum + row.margin, 0),
    previousMargin: previous.reduce((sum, row) => sum + row.margin, 0),
    currentInvoiceCount: current.reduce((sum, row) => sum + row.invoices, 0),
    previousInvoiceCount: previous.reduce((sum, row) => sum + row.invoices, 0),
    available: points.some((point) => point.invoicedAmount !== 0 || point.previousInvoicedAmount !== 0),
  };
}

function buildDailySummaryScopeKey({ filters, forcedCompanyId, forcedSalespersonId, visibilityScope }: {
  filters: ReturnType<typeof normalizeFilters>;
  forcedCompanyId: number | null;
  forcedSalespersonId: number | null;
  visibilityScope: 'all' | 'own';
}) {
  return JSON.stringify({
    visibilityScope,
    companyIds: filters.companyIds?.length ? filters.companyIds : forcedCompanyId ? [forcedCompanyId] : [],
    sellerIds: filters.sellerIds?.length ? filters.sellerIds : forcedSalespersonId ? [forcedSalespersonId] : [],
  });
}

function shiftDateByYears(value: string, years: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  const year = date.getUTCFullYear() + years;
  const month = date.getUTCMonth();
  const day = Math.min(date.getUTCDate(), new Date(Date.UTC(year, month + 1, 0)).getUTCDate());
  return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
}

function formatShortDate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  return new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short' }).format(date);
}

function resolveSupabasePublishableKey() {
  const directKey = Deno.env.get('SUPABASE_ANON_KEY')?.trim();
  if (directKey) {
    return directKey;
  }

  const keyMap = parseKeyMap('SUPABASE_PUBLISHABLE_KEYS');
  return keyMap?.default?.trim() || null;
}

function resolveSupabaseSecretKey() {
  const directKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();
  if (directKey) {
    return directKey;
  }

  const keyMap = parseKeyMap('SUPABASE_SECRET_KEYS');
  return keyMap?.default?.trim() || null;
}

function parseKeyMap(envName: string) {
  const raw = Deno.env.get(envName)?.trim();
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return null;
  }
}

async function getReportsAccess(
  adminClient: ReturnType<typeof createClient>,
  userId: string,
  callerEmail: string | null | undefined,
  requestedDomain: 'sales' | 'purchases' | 'all',
  reportContext: 'reports' | 'marketing',
) {
  const { data: summary, error: summaryError } = await adminClient
    .from('admin_module_permissions')
    .select('role, is_active, odoo_salesperson_id, odoo_user_id, odoo_partner_id, odoo_email, odoo_link_status')
    .eq('user_id', userId)
    .maybeSingle();

  if (summaryError) throw summaryError;

  const designatedOwner = callerEmail?.trim().toLowerCase() === 'joeltrincadov@gmail.com';
  if ((!summary || summary.is_active === false) && !designatedOwner) {
    return { canAccess: false, visibilityScope: 'all' as const, reason: 'Tu usuario esta inactivo.' };
  }

  const role = designatedOwner ? 'owner' : normalizeRole(summary?.role);
  const forcedSalespersonId = numberOrNull(summary?.odoo_salesperson_id) ?? numberOrNull(summary?.odoo_user_id);

  const { data: reportPermission, error: reportError } = await adminClient
    .from('admin_module_permission_items')
    .select('can_access, visibility_scope')
    .eq('user_id', userId)
    .eq('module_key', 'reports')
    .maybeSingle();

  if (reportError) throw reportError;

  const { data: purchasePermission, error: purchaseError } = await adminClient
    .from('admin_module_permission_items')
    .select('can_access')
    .eq('user_id', userId)
    .eq('module_key', 'purchases')
    .maybeSingle();

  if (purchaseError) throw purchaseError;

  const { data: marketingPermission, error: marketingError } = await adminClient
    .from('admin_module_permission_items')
    .select('can_access, visibility_scope')
    .eq('user_id', userId)
    .eq('module_key', 'marketing')
    .maybeSingle();

  if (marketingError) throw marketingError;

  const canAccessReports = Boolean(reportPermission?.can_access) || role === 'owner';
  const canAccessMarketing = Boolean(marketingPermission?.can_access) || role === 'owner';
  const canAccessPurchases =
    role === 'owner' ||
    role === 'purchase_agent' ||
    Boolean(purchasePermission?.can_access);

  if (requestedDomain === 'purchases' && !canAccessPurchases) {
    return {
      canAccess: false,
      visibilityScope: 'all' as const,
      reason: 'No tienes permisos para consultar el modulo de Compras.',
    };
  }

  if (requestedDomain === 'sales' && !canAccessReports && !canAccessMarketing) {
    return {
      canAccess: false,
      visibilityScope: 'all' as const,
      reason: 'No tienes permisos para consultar información comercial.',
    };
  }

  if (reportContext === 'marketing' && !canAccessMarketing) {
    return { canAccess: false, visibilityScope: 'all' as const, reason: 'No tienes permisos para consultar Marketing.' };
  }

  const ownScope = reportContext === 'marketing'
    ? shouldUseOwnMarketingScope(role, marketingPermission?.visibility_scope)
    : shouldUseOwnReportScope(role, reportPermission?.visibility_scope);

  if (requestedDomain === 'all' && (!canAccessReports || !canAccessPurchases)) {
    return {
      canAccess: false,
      visibilityScope: 'all' as const,
      reason: 'No tienes permisos suficientes para consultar ventas y compras en conjunto.',
    };
  }

  return {
    canAccess: true,
    role,
    visibilityScope: ownScope ? 'own' : 'all',
    forcedSalespersonId: ownScope ? forcedSalespersonId : null,
    requiresOdooLink: role === 'sales_agent' || role === 'marketing_agent',
    odooEmail: summary?.odoo_email ?? null,
    odooLinkStatus: summary?.odoo_link_status ?? 'unlinked',
    odooPartnerId: numberOrNull(summary?.odoo_partner_id),
  };
}

async function persistSalespersonResolution({ adminClient, caller, access, identity }: {
  adminClient: ReturnType<typeof createClient>;
  caller: { id: string; email?: string | null };
  access: Record<string, unknown>;
  identity: Awaited<ReturnType<typeof resolveOdooSalespersonIdentity>>;
}) {
  if (identity.status !== 'linked') {
    if (access.odooLinkStatus === identity.status && !access.forcedSalespersonId) return;
    const { error: linkError } = await adminClient
      .from('admin_module_permissions')
      .update({
        odoo_user_id: null,
        odoo_salesperson_id: null,
        odoo_partner_id: null,
        odoo_email: identity.normalizedEmail || null,
        odoo_link_status: identity.status,
        odoo_linked_at: null,
        updated_by: caller.id,
      })
      .eq('user_id', caller.id);
    if (linkError) throw linkError;
    await writeAuditLog(adminClient, {
      actorId: caller.id,
      actorEmail: caller.email,
      targetId: caller.id,
      action: 'odoo.salesperson_link_failed',
      previousValue: { status: access.odooLinkStatus ?? 'unlinked' },
      newValue: { status: identity.status },
    });
    return;
  }

  const user = identity.users[0];
  const odooUserId = numberOrNull(user?.id);
  const odooPartnerId = many2oneId(user?.partner_id);
  if (!odooUserId) return;
  const alreadyLinked =
    access.odooLinkStatus === 'linked' &&
    access.forcedSalespersonId === odooUserId &&
    access.odooPartnerId === odooPartnerId &&
    normalizeOdooEmail(access.odooEmail) === identity.normalizedEmail;
  if (alreadyLinked) return;

  const { error: linkError } = await adminClient
    .from('admin_module_permissions')
    .update({
      odoo_user_id: odooUserId,
      odoo_salesperson_id: odooUserId,
      odoo_partner_id: odooPartnerId,
      odoo_email: identity.normalizedEmail,
      odoo_link_status: 'linked',
      odoo_linked_at: new Date().toISOString(),
      updated_by: caller.id,
    })
    .eq('user_id', caller.id);
  if (linkError) throw linkError;
  await writeAuditLog(adminClient, {
    actorId: caller.id,
    actorEmail: caller.email,
    targetId: caller.id,
    action: 'odoo.salesperson_linked',
    previousValue: { status: access.odooLinkStatus ?? 'unlinked' },
    newValue: {
      status: 'linked',
      odoo_user_id: odooUserId,
      odoo_partner_id: odooPartnerId,
    },
  });
}

function sanitizeReport(report: Record<string, unknown>) {
  const safeReport = { ...report };
  delete safeReport.scopeIdentity;
  return safeReport;
}

function many2oneId(value: unknown) {
  const parsed = Array.isArray(value) ? Number(value[0]) : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

async function writeAuditLog(
  adminClient: ReturnType<typeof createClient>,
  input: {
    actorId: string;
    actorEmail?: string | null;
    targetId: string;
    action: string;
    previousValue: unknown;
    newValue: unknown;
  },
) {
  const { error } = await adminClient.from('admin_audit_log').insert({
    actor_user_id: input.actorId,
    actor_email: input.actorEmail ?? null,
    target_user_id: input.targetId,
    action: input.action,
    previous_value: input.previousValue,
    new_value: input.newValue,
  });
  if (error) throw error;
}

function normalizeFilters(
  body: Record<string, unknown>,
  visibilityScope: 'all' | 'own',
  forcedSalespersonId: number | null,
  forcedCompanyId: number | null,
) {
  const requestedSellerIds = readOptionalNumberList(body.sellerIds);
  const requestedCompanyIds = readOptionalNumberList(body.companyIds);
  const sellerIds = resolveServerSellerIds({
    requestedSellerIds,
    resolvedSellerId: forcedSalespersonId,
    visibilityScope,
  });
  const companyIds = resolveServerCompanyIds({
    requestedCompanyIds,
    resolvedCompanyId: forcedCompanyId,
    visibilityScope,
  });

  return {
    startDate: readRequiredDate(body.startDate),
    endDate: readRequiredDate(body.endDate),
    companyId: readOptionalNumber(body.companyId),
    companyIds,
    sellerId: null,
    sellerIds,
    teamId: readOptionalNumber(body.teamId),
    customerId: readOptionalNumber(body.customerId),
    productId: readOptionalNumber(body.productId),
    categoryId: readOptionalNumber(body.categoryId),
    currencyCode: readOptionalString(body.currencyCode),
    channel: readOptionalString(body.channel),
    stateScope:
      body.stateScope === 'quotation' ||
      body.stateScope === 'confirmed' ||
      body.stateScope === 'cancelled'
        ? body.stateScope
        : 'all',
    grouping:
      body.grouping === 'month' ||
      body.grouping === 'quarter' ||
      body.grouping === 'year'
        ? body.grouping
        : 'day',
    visibilityScope,
  };
}

function normalizeRole(value: unknown) {
  return value === 'sales_agent' ||
    value === 'manager' ||
    value === 'marketing_agent' ||
    value === 'support_agent' ||
    value === 'purchase_agent' ||
    value === 'owner'
    ? value
    : 'manager';
}

function numberOrNull(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function readRequiredDate(value: unknown) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new Error('Las fechas del dashboard deben enviarse en formato YYYY-MM-DD.');
  }
  return raw;
}

function readOptionalNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readOptionalNumberList(value: unknown) {
  if (!Array.isArray(value)) {
    if (typeof value === 'string' && value.trim()) {
      return value
        .split(',')
        .map((item) => Number(item.trim()))
        .filter((item) => Number.isFinite(item));
    }

    const singleValue = readOptionalNumber(value);
    return singleValue === null ? [] : [singleValue];
  }

  return value
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item));
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}
