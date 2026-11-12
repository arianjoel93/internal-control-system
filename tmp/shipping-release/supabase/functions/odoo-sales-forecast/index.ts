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
import {
  normalizeOdooEmail,
  selectExactActiveOdooUsers,
  shouldUseOwnReportScope,
} from '../odoo-sales-report/salesperson-scope.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const forecastCache = new Map<string, { expiresAt: number; data: unknown }>();
const CACHE_TTL_MS = 1000 * 60 * 10;
const FORECAST_COMPANY_NAME = 'Corporación Tectronic';
const HISTORICAL_START_DATE = '2000-01-01';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Método no permitido.' }, 405);
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
            'Faltan variables de entorno de Supabase para consultar pronósticos.',
        },
        500,
      );
    }

    stage = 'auth';
    const authorization = req.headers.get('Authorization') ?? '';
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const {
      data: { user: caller },
      error: callerError,
    } = await userClient.auth.getUser();

    if (callerError || !caller) {
      return jsonResponse({ error: 'Sesión no válida.' }, 401);
    }

    stage = 'permissions';
    const access = await getReportsAccess(adminClient, caller.id, caller.email);
    if (!access.canAccess) {
      return jsonResponse(
        { error: access.reason ?? 'No tienes permisos para consultar pronósticos.' },
        403,
      );
    }

    stage = 'odoo.secrets';
    const odoo = await resolveOdooEnvironment(adminClient);
    assertOdooEnvironment(odoo);

    stage = 'odoo.auth';
    const connection = await authenticateWithDatabaseCandidates({
      apiKey: odoo.apiKey,
      configuredDatabase: odoo.database,
      odooUrl: odoo.url,
      user: odoo.user,
    });

    let forcedSalespersonId: number | null = null;
    let forcedSellerName: string | null = null;
    if (access.visibilityScope === 'own') {
      stage = 'odoo.salesperson';
      const identity = await resolveOdooSalespersonIdentity({
        apiKey: odoo.apiKey,
        connection,
        email: normalizeOdooEmail(caller.email),
      });

      if (identity.status !== 'linked') {
        return jsonResponse(
          {
            error:
              identity.status === 'ambiguous'
                ? 'Hay más de un vendedor activo de Odoo con tu correo.'
                : 'No existe un vendedor activo de Odoo asociado exactamente con tu correo.',
          },
          409,
        );
      }

      forcedSalespersonId = numberOrNull(identity.users[0]?.id);
      forcedSellerName = typeof identity.users[0]?.name === 'string' ? identity.users[0].name : null;
    }

    const cacheKey = JSON.stringify({
      userId: caller.id,
      visibilityScope: access.visibilityScope,
      forcedSalespersonId,
      company: FORECAST_COMPANY_NAME,
      currentYear: new Date().getUTCFullYear(),
      odooUrl: connection.odooUrl,
      database: connection.database,
    });
    const cached = forecastCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return jsonResponse(cached.data as Record<string, unknown>);
    }

    stage = 'odoo.forecast';
    const forecast = await fetchSalesForecastDataset({
      apiKey: odoo.apiKey,
      companyName: FORECAST_COMPANY_NAME,
      database: connection.database,
      forcedSalespersonId,
      forcedSellerName,
      odooUrl: connection.odooUrl,
      uid: connection.uid,
      visibilityScope: access.visibilityScope,
    });

    forecastCache.set(cacheKey, {
      expiresAt: Date.now() + CACHE_TTL_MS,
      data: forecast,
    });

    return jsonResponse(forecast);
  } catch (error) {
    console.error('[odoo-sales-forecast]', { stage, error });
    const message =
      error instanceof Error
        ? error.message
        : 'No se pudo generar el pronóstico de ventas desde Odoo.';
    return jsonResponse({ error: `[odoo-sales-forecast:${stage}] ${message}` }, 500);
  }
});

async function fetchSalesForecastDataset({
  apiKey,
  companyName,
  database,
  forcedSalespersonId,
  forcedSellerName,
  odooUrl,
  uid,
  visibilityScope,
}: {
  apiKey: string;
  companyName: string;
  database: string;
  forcedSalespersonId: number | null;
  forcedSellerName: string | null;
  odooUrl: string;
  uid: number;
  visibilityScope: 'all' | 'own';
}) {
  const today = new Date();
  const currentYear = today.getUTCFullYear();
  const currentDate = today.toISOString().slice(0, 10);
  const currentYearStart = `${currentYear}-01-01`;
  const invoiceMeta = await fieldsGet({
    apiKey,
    database,
    model: 'account.invoice.report',
    odooUrl,
    uid,
  });
  const dateField = pick(invoiceMeta, ['invoice_date', 'date']) ?? 'invoice_date';
  const amountField = pick(invoiceMeta, ['price_subtotal', 'price_subtotal_signed', 'price_total']) ?? 'price_subtotal';
  const sellerField = pick(invoiceMeta, ['invoice_user_id', 'user_id']);
  const categoryField = pick(invoiceMeta, ['product_categ_id', 'product_category_id', 'categ_id']);
  const customerField = pick(invoiceMeta, ['partner_id', 'commercial_partner_id']);
  const moveField = pick(invoiceMeta, ['move_id']);
  const company = await resolveCompany({
    apiKey,
    companyName,
    database,
    odooUrl,
    uid,
  });
  const baseDomain = buildInvoiceReportDomain({
    companyId: company.id,
    dateField,
    endDate: currentDate,
    forcedSalespersonId,
    sellerField,
    startDate: HISTORICAL_START_DATE,
  });
  const yearDomain = buildInvoiceReportDomain({
    companyId: company.id,
    dateField,
    endDate: currentDate,
    forcedSalespersonId,
    sellerField,
    startDate: currentYearStart,
  });
  const monthlyRows = await executeReadKw({
    apiKey,
    args: [
      baseDomain,
      [`${amountField}:sum`, ...(moveField ? [`${moveField}:count_distinct`] : [])],
      [`${dateField}:month`],
    ],
    database,
    kwargs: { lazy: false, orderby: `${dateField}:month asc` },
    method: 'read_group',
    model: 'account.invoice.report',
    odooUrl,
    uid,
  });
  const [sellerRows, categoryRows, customerRows] = await Promise.all([
    sellerField
      ? readDimensionRows({
          apiKey,
          amountField,
          database,
          dimensionField: sellerField,
          domain: yearDomain,
          model: 'account.invoice.report',
          moveField,
          odooUrl,
          uid,
        })
      : [],
    categoryField
      ? readDimensionRows({
          apiKey,
          amountField,
          database,
          dimensionField: categoryField,
          domain: yearDomain,
          model: 'account.invoice.report',
          moveField,
          odooUrl,
          uid,
        })
      : [],
    customerField
      ? readDimensionRows({
          apiKey,
          amountField,
          database,
          dimensionField: customerField,
          domain: yearDomain,
          model: 'account.invoice.report',
          moveField,
          odooUrl,
          uid,
        })
      : [],
  ]);
  const monthly = normalizeMonthlyRows(monthlyRows, dateField, amountField, moveField);
  const historicalStartDate = monthly[0]?.month ? `${monthly[0].month}-01` : HISTORICAL_START_DATE;
  const totalYearAmount = sellerRows.reduce((sum, row) => sum + row.amount, 0) ||
    monthly
      .filter((point) => point.month.startsWith(`${currentYear}-`))
      .reduce((sum, point) => sum + point.amount, 0);

  return {
    fetchedAt: new Date().toISOString(),
    companyId: company.id,
    companyName: company.name,
    currentYear,
    currentDate,
    historicalStartDate,
    historicalEndDate: currentDate,
    visibilityScope,
    sellerName: forcedSellerName,
    monthly,
    currentYearSellers: withShare(sellerRows, totalYearAmount),
    currentYearCategories: withShare(categoryRows, totalYearAmount),
    currentYearCustomers: withShare(customerRows, totalYearAmount),
    warnings: [],
  };
}

async function readDimensionRows({
  apiKey,
  amountField,
  database,
  dimensionField,
  domain,
  model,
  moveField,
  odooUrl,
  uid,
}: {
  apiKey: string;
  amountField: string;
  database: string;
  dimensionField: string;
  domain: unknown[];
  model: string;
  moveField: string | null;
  odooUrl: string;
  uid: number;
}) {
  const rows = await executeReadKw({
    apiKey,
    args: [
      domain,
      [dimensionField, `${amountField}:sum`, ...(moveField ? [`${moveField}:count_distinct`] : [])],
      [dimensionField],
    ],
    database,
    kwargs: { lazy: false },
    method: 'read_group',
    model,
    odooUrl,
    uid,
  });

  return rows
    .map((row: Record<string, unknown>) => ({
      id: many2oneId(row[dimensionField]),
      label: many2oneLabel(row[dimensionField]) ?? 'Sin clasificar',
      amount: readAggregate(row, amountField),
      invoiceCount: readCount(row, moveField),
    }))
    .filter((row) => Math.abs(row.amount) > 0)
    .sort((left, right) => right.amount - left.amount)
    .slice(0, 12);
}

function normalizeMonthlyRows(
  rows: Array<Record<string, unknown>>,
  dateField: string,
  amountField: string,
  moveField: string | null,
) {
  const groupKey = `${dateField}:month`;

  return rows
    .map((row) => {
      const range = row.__range as Record<string, { from?: string; to?: string }> | undefined;
      const from = range?.[groupKey]?.from;
      const month = from?.slice(0, 7) ?? null;
      if (!month) return null;

      return {
        month,
        label: formatMonthLabel(month),
        amount: readAggregate(row, amountField),
        invoiceCount: readCount(row, moveField),
      };
    })
    .filter(Boolean)
    .sort((left, right) => left!.month.localeCompare(right!.month));
}

function buildInvoiceReportDomain({
  companyId,
  dateField,
  endDate,
  forcedSalespersonId,
  sellerField,
  startDate,
}: {
  companyId: number;
  dateField: string;
  endDate: string;
  forcedSalespersonId: number | null;
  sellerField: string | null;
  startDate: string;
}) {
  const domain: unknown[] = [
    [dateField, '>=', startDate],
    [dateField, '<=', endDate],
    ['company_id', '=', companyId],
    ['move_type', 'in', ['out_invoice', 'out_refund']],
    ['state', 'not in', ['draft', 'cancel']],
  ];

  if (forcedSalespersonId && sellerField) {
    domain.push([sellerField, '=', forcedSalespersonId]);
  }

  return domain;
}

async function resolveCompany({
  apiKey,
  companyName,
  database,
  odooUrl,
  uid,
}: {
  apiKey: string;
  companyName: string;
  database: string;
  odooUrl: string;
  uid: number;
}) {
  const companies = await executeReadKw({
    apiKey,
    args: [[['name', 'ilike', companyName]]],
    database,
    kwargs: { fields: ['id', 'name'], limit: 20, order: 'id asc' },
    method: 'search_read',
    model: 'res.company',
    odooUrl,
    uid,
  });
  const exact =
    companies.find((row: Record<string, unknown>) => normalizeText(row.name) === normalizeText(companyName)) ??
    companies[0];

  const id = numberOrNull(exact?.id);
  const name = typeof exact?.name === 'string' ? exact.name : companyName;
  if (!id) {
    throw new Error(`No se encontró la compañía ${companyName} en Odoo.`);
  }

  return { id, name };
}

function withShare<T extends { amount: number }>(rows: T[], total: number) {
  return rows.map((row) => ({
    ...row,
    sharePct: total > 0 ? (row.amount / total) * 100 : 0,
  }));
}

async function resolveOdooSalespersonIdentity({
  apiKey,
  connection,
  email,
}: {
  apiKey: string;
  connection: { database: string; odooUrl: string; uid: number };
  email: unknown;
}) {
  const normalizedEmail = normalizeOdooEmail(email);
  if (!normalizedEmail) {
    return {
      normalizedEmail,
      status: 'not_found' as const,
      users: [],
    };
  }

  const rows = await executeReadKw({
    apiKey,
    args: [[
      ['active', '=', true],
      '|',
      ['login', '=ilike', normalizedEmail],
      ['email', '=ilike', normalizedEmail],
    ]],
    database: connection.database,
    kwargs: {
      fields: [
        'id',
        'name',
        'login',
        'email',
        'active',
        'partner_id',
        'company_id',
        'company_ids',
      ],
      limit: 50,
      order: 'id asc',
    },
    method: 'search_read',
    model: 'res.users',
    odooUrl: connection.odooUrl,
    uid: connection.uid,
  });
  const users = selectExactActiveOdooUsers(rows, normalizedEmail);

  return {
    normalizedEmail,
    status: users.length === 1 ? 'linked' as const : users.length > 1 ? 'ambiguous' as const : 'not_found' as const,
    users,
  };
}

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

async function getReportsAccess(
  adminClient: ReturnType<typeof createClient>,
  userId: string,
  callerEmail: string | null | undefined,
) {
  const { data: summary, error: summaryError } = await adminClient
    .from('admin_module_permissions')
    .select('role, is_active')
    .eq('user_id', userId)
    .maybeSingle();

  if (summaryError) throw summaryError;

  const designatedOwner = callerEmail?.trim().toLowerCase() === 'joeltrincadov@gmail.com';
  if ((!summary || summary.is_active === false) && !designatedOwner) {
    return { canAccess: false, visibilityScope: 'all' as const, reason: 'Tu usuario está inactivo.' };
  }

  const role = designatedOwner ? 'owner' : normalizeRole(summary?.role);
  const { data: reportPermission, error: reportError } = await adminClient
    .from('admin_module_permission_items')
    .select('can_access, visibility_scope')
    .eq('user_id', userId)
    .eq('module_key', 'reports')
    .maybeSingle();

  if (reportError) throw reportError;

  const canAccessReports = Boolean(reportPermission?.can_access) || role === 'owner';
  if (!canAccessReports) {
    return {
      canAccess: false,
      visibilityScope: 'all' as const,
      reason: 'No tienes permisos para consultar el módulo de Reportes.',
    };
  }

  return {
    canAccess: true,
    role,
    visibilityScope: shouldUseOwnReportScope(role, reportPermission?.visibility_scope)
      ? 'own' as const
      : 'all' as const,
  };
}

function pick(meta: Record<string, unknown>, candidates: string[]) {
  return candidates.find((candidate) => Boolean(meta[candidate])) ?? null;
}

function readAggregate(row: Record<string, unknown>, field: string) {
  const value = row[field] ?? row[`${field}_sum`] ?? row[`${field}:sum`];
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function readCount(row: Record<string, unknown>, moveField: string | null) {
  const value = moveField
    ? row[`${moveField}_count_distinct`] ?? row[`${moveField}:count_distinct`] ?? row.__count
    : row.__count;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function many2oneId(value: unknown) {
  const parsed = Array.isArray(value) ? Number(value[0]) : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function many2oneLabel(value: unknown) {
  return Array.isArray(value) && typeof value[1] === 'string' ? value[1] : null;
}

function numberOrNull(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
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

function normalizeText(value: unknown) {
  return `${value ?? ''}`
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

function formatMonthLabel(month: string) {
  return new Intl.DateTimeFormat('es-MX', {
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(`${month}-01T00:00:00.000Z`));
}

function resolveSupabasePublishableKey() {
  const directKey = Deno.env.get('SUPABASE_ANON_KEY')?.trim();
  if (directKey) return directKey;
  const keyMap = parseKeyMap('SUPABASE_PUBLISHABLE_KEYS');
  return keyMap?.default?.trim() || null;
}

function resolveSupabaseSecretKey() {
  const directKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();
  if (directKey) return directKey;
  const keyMap = parseKeyMap('SUPABASE_SECRET_KEYS');
  return keyMap?.default?.trim() || null;
}

function parseKeyMap(envName: string) {
  const raw = Deno.env.get(envName)?.trim();
  if (!raw) return null;

  try {
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return null;
  }
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
