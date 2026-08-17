import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  assertOdooEnvironment,
  readOdooEnvironment,
  type OdooEnvironment,
} from '../_shared/odoo-readonly.ts';
import {
  fetchCommercialDataset,
  resolveOdooSalespersonIdentity,
} from './core.ts';
import {
  normalizeOdooEmail,
  resolveServerCompanyIds,
  resolveServerSellerIds,
  shouldUseOwnReportScope,
} from './salesperson-scope.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const datasetCache = new Map<string, { expiresAt: number; data: unknown }>();
const salespersonIdentityCache = new Map<string, {
  expiresAt: number;
  data: Awaited<ReturnType<typeof resolveOdooSalespersonIdentity>>;
}>();
const CACHE_TTL_MS = 1000 * 60 * 3;

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
    const loadMode = body.loadMode === 'fast' ? 'fast' : 'full';

    stage = 'permissions';
    const access = await getReportsAccess(adminClient, caller.id, caller.email, requestedDomain);
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
    const cacheKey = JSON.stringify({
      requestedDomain,
      userId: caller.id,
      role: access.role,
      forcedSalespersonId,
      forcedCompanyId,
      visibilityScope: access.visibilityScope,
      loadMode,
      filters: normalizedFilters,
    });
    const cachedEntry = datasetCache.get(cacheKey);
    if (cachedEntry && cachedEntry.expiresAt > Date.now()) {
      return jsonResponse(cachedEntry.data as Record<string, unknown>);
    }

    stage = 'odoo.dataset';
    const report = await fetchCommercialDataset({
      apiKey: odoo.apiKey,
      filters: normalizedFilters,
      odooUrl: odoo.url,
      odooDatabase: odoo.database,
      requestedDomain,
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
    datasetCache.set(cacheKey, {
      expiresAt: Date.now() + CACHE_TTL_MS,
      data: safeReport,
    });

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

  const ownScope = shouldUseOwnReportScope(
    role,
    reportPermission?.visibility_scope ?? marketingPermission?.visibility_scope,
  );

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
    requiresOdooLink: role === 'sales_agent',
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
