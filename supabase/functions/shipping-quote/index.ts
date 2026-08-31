import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import * as XLSX from 'npm:xlsx@0.18.5';
import {
  assertOdooEnvironment,
  authenticateWithDatabaseCandidates as connectOdooReadOnly,
  fieldsGet as getOdooFields,
  readOdooEnvironment,
  searchReadAll as searchReadOdoo,
} from '../_shared/odoo-readonly.ts';

type SupabaseClient = ReturnType<typeof createClient>;
type Access = {
  canAccess: boolean;
  isAdmin: boolean;
  viewAll: boolean;
};

type CarrierSettings = {
  id: string;
  carrier: 'FEDEX';
  environment: 'SANDBOX' | 'PRODUCTION';
  is_active: boolean;
  fedex_base_url: string;
  account_number_masked: string | null;
  client_id_masked: string | null;
  child_key_masked: string | null;
  account_number_encrypted: string | null;
  client_id_encrypted: string | null;
  client_secret_encrypted: string | null;
  child_key_encrypted: string | null;
  child_secret_encrypted: string | null;
  origin_country_code: string;
  origin_postal_code: string | null;
  origin_state_code: string | null;
  origin_city: string | null;
  origin_street: string | null;
  preferred_currency: string;
  pickup_type: string;
  return_transit_times: boolean;
  rate_request_types: string[] | unknown;
  rate_display_option: string;
  weight_input_mode: 'NET_CONTENT' | 'GROSS_PACKAGE';
  final_volume_padding_enabled: boolean;
  final_padding_length_cm: number | null;
  final_padding_width_cm: number | null;
  final_padding_height_cm: number | null;
  final_packaging_cost_enabled: boolean;
  final_packaging_material_cost: number | null;
  created_at: string;
  updated_at: string;
};

type PackageType = {
  id: string;
  carrier: 'FEDEX';
  name: string;
  internal_code: string;
  description: string | null;
  length: number | null;
  width: number | null;
  height: number | null;
  internal_length: number | null;
  internal_width: number | null;
  internal_height: number | null;
  external_length: number | null;
  external_width: number | null;
  external_height: number | null;
  max_fill_percent: number | null;
  box_cost: number | null;
  dimension_unit: 'CM' | 'IN';
  empty_weight: number | null;
  weight_unit: 'KG' | 'LB';
  max_weight: number | null;
  is_active: boolean;
  sort_order: number;
  fedex_packaging_type: string;
  created_at: string;
  updated_at: string;
};

type NormalizedRate = {
  carrier: 'FEDEX';
  serviceCode: string;
  serviceName: string;
  currency: string;
  baseAmount: number | null;
  discountAmount: number | null;
  surchargeAmount: number | null;
  taxAmount: number | null;
  totalAmount: number;
  transitDays: number | null;
  estimatedDeliveryDate: string | null;
  deliveryTimestamp: string | null;
  deliveryLabel: string | null;
  rateType: string | null;
  rawSummary: Record<string, unknown>;
};

type PreparedPackage = {
  packageType: PackageType;
  packageTypeId: string | null;
  packageIndex: number;
  contentWeight: number;
  tareWeight: number;
  actualWeight: number;
  volumetricWeight: number;
  billableWeight: number;
};

type ProductLogisticsFields = {
  length: string[];
  width: string[];
  height: string[];
};

type ProductReferenceFields = {
  product: string[];
  template: string[];
};

type ProductDimensionImportRow = {
  sku: string;
  product_name: string | null;
  width_cm: number;
  length_cm: number;
  height_cm: number;
  unit_weight_kg: number | null;
  volumetric_weight_kg: number | null;
  billable_weight_kg: number | null;
  source_row: number;
};

class ShippingError extends Error {
  status: number;
  code: string;
  retryable: boolean;
  providerStatus: number | null;

  constructor(
    message: string,
    options: { status?: number; code?: string; retryable?: boolean; providerStatus?: number | null } = {},
  ) {
    super(message);
    this.name = 'ShippingError';
    this.status = options.status ?? 500;
    this.code = options.code ?? 'SHIPPING_ERROR';
    this.retryable = options.retryable ?? false;
    this.providerStatus = options.providerStatus ?? null;
  }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const tokenCache = new Map<string, { token: string; expiresAt: number }>();
const officialPackagingTypes = new Set([
  'YOUR_PACKAGING',
  'FEDEX_ENVELOPE',
  'FEDEX_PAK',
  'FEDEX_BOX',
  'FEDEX_SMALL_BOX',
  'FEDEX_MEDIUM_BOX',
  'FEDEX_LARGE_BOX',
  'FEDEX_EXTRA_LARGE_BOX',
  'FEDEX_EXTRA_SMALL_BOX',
  'FEDEX_10KG_BOX',
  'FEDEX_25KG_BOX',
]);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Método no permitido.' }, 405);

  let stage = 'bootstrap';

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse({ error: 'Faltan variables de entorno de Supabase.' }, 500);
    }

    const authorization = req.headers.get('Authorization') ?? '';
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) return jsonResponse({ error: 'Sesión no válida.' }, 401);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? 'bootstrap');
    const access = await getShippingAccess(adminClient, user.id, user.email, user.app_metadata);
    if (!access.canAccess) return jsonResponse({ error: 'No tienes permisos para usar el Cotizador de Envíos.' }, 403);

    if (action === 'bootstrap') {
      stage = 'bootstrap.data';
      const settings = await getCarrierSettings(adminClient);
      return jsonResponse({
        data: {
          access,
          config: settings ? publicConfig(settings) : null,
          packageTypes: [],
        },
      });
    }

    if (action === 'saveConfig') {
      stage = 'config.save';
      if (!access.isAdmin) return jsonResponse({ error: 'Solo administradores pueden configurar FedEx.' }, 403);
      const settings = await saveCarrierSettings(adminClient, body, user.id, user.email);
      return jsonResponse({ data: { config: publicConfig(settings) } });
    }

    if (action === 'testConnection') {
      stage = 'fedex.test';
      if (!access.isAdmin) return jsonResponse({ error: 'Solo administradores pueden probar la conexión.' }, 403);
      const settings = await requireConfiguredSettings(adminClient, true);
      const fedexConfig = await decryptFedexConfig(settings);
      const token = await getFedexAccessToken(fedexConfig);
      const origin = {
        countryCode: settings.origin_country_code,
        postalCode: settings.origin_postal_code,
        stateOrProvinceCode: settings.origin_state_code,
        city: settings.origin_city,
        street: null,
      };
      try {
        const probe = await fetchFedexRates(fedexConfig, token, buildFedexConnectionProbe(fedexConfig.accountNumber, origin, settings.pickup_type));
        if (!normalizeFedExRateResponse(probe).length) {
          throw new Error('FedEx autenticó la cuenta, pero Rate API no devolvió servicios para la prueba.');
        }
      } catch (error) {
        const normalizedError = normalizeShippingError(error);
        if (normalizedError.code !== 'FEDEX_UNAVAILABLE') throw error;
        return jsonResponse({
          data: {
            message: `Credenciales autenticadas con FedEx ${settings.environment === 'SANDBOX' ? 'Sandbox' : 'Producción'}. Rate API no respondió en este momento; puedes guardar la configuración e intentar cotizar nuevamente en unos minutos.`,
          },
        });
      }
      return jsonResponse({
        data: {
          message: `Autenticación y Rate API correctas con FedEx ${settings.environment === 'SANDBOX' ? 'Sandbox' : 'Producción'}.`,
        },
      });
    }

    if (action === 'savePackageType') {
      stage = 'package.save';
      if (!access.isAdmin) return jsonResponse({ error: 'Solo administradores pueden modificar embalajes.' }, 403);
      const packageType = await savePackageType(adminClient, body, user.id, user.email);
      return jsonResponse({ data: { packageType } });
    }

    if (action === 'listProductDimensions') {
      stage = 'product_dimensions.list';
      const result = await listProductDimensions(adminClient);
      return jsonResponse({ data: result });
    }

    if (action === 'previewProductDimensionsImport') {
      stage = 'product_dimensions.preview';
      if (!access.isAdmin) return jsonResponse({ error: 'Solo administradores pueden cargar bases de productos.' }, 403);
      const result = await previewProductDimensionsImport(adminClient, body);
      return jsonResponse({ data: result });
    }

    if (action === 'importProductDimensions') {
      stage = 'product_dimensions.import';
      if (!access.isAdmin) return jsonResponse({ error: 'Solo administradores pueden actualizar bases de productos.' }, 403);
      const result = await importProductDimensions(adminClient, body, user.id, user.email);
      return jsonResponse({ data: result });
    }

    if (action === 'saveProductDimension') {
      stage = 'product_dimensions.save';
      if (!access.isAdmin) return jsonResponse({ error: 'Solo administradores pueden editar bases de productos.' }, 403);
      const product = await saveProductDimension(adminClient, body, user.id, user.email);
      return jsonResponse({ data: { product } });
    }

    if (action === 'createQuote') {
      stage = 'quote.create';
      const quote = await createQuote(adminClient, body, user.id, user.email ?? null);
      return jsonResponse({ data: { quote } });
    }

    if (['lookupOdooOrder', 'lookupOrder', 'findOdooOrder'].includes(action)) {
      stage = 'odoo.order.lookup';
      const result = await lookupOdooOrder(adminClient, body);
      return jsonResponse({ data: result });
    }

    if (action === 'listQuotes') {
      stage = 'quote.list';
      const result = await listQuotes(adminClient, body, user.id, access);
      return jsonResponse({ data: result });
    }

    if (action === 'getQuote') {
      stage = 'quote.detail';
      const quote = await getQuoteDetail(adminClient, String(body.id ?? ''), user.id, access);
      if (!quote) return jsonResponse({ error: 'No se encontró la cotización solicitada.' }, 404);
      return jsonResponse({ data: { quote } });
    }

    return jsonResponse({ error: 'Acción no soportada.' }, 400);
  } catch (error) {
    const normalizedError = normalizeShippingError(error);
    console.error('[shipping-quote]', {
      stage,
      status: normalizedError.status,
      code: normalizedError.code,
      retryable: normalizedError.retryable,
      providerStatus: normalizedError.providerStatus,
      error: sanitizeError(error),
    });
    return jsonResponse(
      {
        error: normalizedError.message,
        code: normalizedError.code,
        retryable: normalizedError.retryable,
        providerStatus: normalizedError.providerStatus,
      },
      normalizedError.status,
    );
  }
});

async function getShippingAccess(
  adminClient: SupabaseClient,
  userId: string,
  email?: string | null,
  appMetadata?: unknown,
): Promise<Access> {
  if (email?.trim().toLowerCase() === 'joeltrincadov@gmail.com') {
    return { canAccess: true, isAdmin: true, viewAll: true };
  }

  const metadata = isRecord(appMetadata) ? appMetadata : {};
  const metadataRole = readText(metadata.role)?.toLowerCase();
  const metadataUserType = readText(metadata.user_type)?.toLowerCase();
  const metadataIsAdmin = metadataRole === 'owner' || metadataRole === 'manager' || metadataUserType === 'owner';

  const { data: permission, error: permissionError } = await adminClient
    .from('admin_module_permissions')
    .select('role, user_type, is_active')
    .eq('user_id', userId)
    .maybeSingle();
  if (permissionError) throw permissionError;
  if (!permission && metadataIsAdmin) {
    return { canAccess: true, isAdmin: true, viewAll: true };
  }

  if (!permission || permission.is_active === false) {
    return { canAccess: false, isAdmin: false, viewAll: false };
  }

  const { data: item, error: itemError } = await adminClient
    .from('admin_module_permission_items')
    .select('can_access, actions')
    .eq('user_id', userId)
    .eq('module_key', 'shipping_quotes')
    .maybeSingle();
  if (itemError) throw itemError;

  const isAdmin =
    metadataIsAdmin ||
    permission.role === 'owner' ||
    permission.role === 'manager' ||
    permission.user_type === 'owner';
  const actions = isRecord(item?.actions) ? item?.actions : {};
  return {
    canAccess: isAdmin || Boolean(item?.can_access),
    isAdmin,
    viewAll: isAdmin || actions.view_all === true || actions.viewAll === true,
  };
}

async function getCarrierSettings(adminClient: SupabaseClient) {
  const { data, error } = await adminClient
    .from('shipping_carrier_settings')
    .select('*')
    .eq('carrier', 'FEDEX')
    .maybeSingle();
  if (error) throw error;
  return data as CarrierSettings | null;
}

async function requireConfiguredSettings(adminClient: SupabaseClient, allowInactive = false) {
  const settings = await getCarrierSettings(adminClient);
  if (!settings) throw new Error('Configura FedEx antes de cotizar.');
  if (!settings.is_active && !allowInactive) throw new Error('El Cotizador de Envíos todavía no está disponible. Contacta al administrador.');
  if (!settings.origin_postal_code || !settings.origin_country_code) {
    throw new Error('Falta configurar el origen predeterminado de FedEx.');
  }
  return settings;
}

async function getPackageTypes(adminClient: SupabaseClient, includeInactive: boolean) {
  let query = adminClient
    .from('shipping_package_types')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  if (!includeInactive) query = query.eq('is_active', true);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as PackageType[];
}

async function saveCarrierSettings(
  adminClient: SupabaseClient,
  body: Record<string, unknown>,
  userId: string,
  userEmail?: string | null,
) {
  const current = await getCarrierSettings(adminClient);
  const environment = readEnum(body.environment, ['SANDBOX', 'PRODUCTION'], 'SANDBOX');
  const baseUrl = readText(body.fedex_base_url) ?? (environment === 'PRODUCTION' ? 'https://apis.fedex.com' : 'https://apis-sandbox.fedex.com');
  const accountNumber = normalizeFedexAccountNumber(body.account_number);
  const previousPublic = current ? publicConfig(current) : null;
  const payload: Record<string, unknown> = {
    carrier: 'FEDEX',
    environment,
    is_active: body.is_active === true,
    fedex_base_url: normalizeFedexBaseUrl(baseUrl, environment),
    origin_country_code: (readText(body.origin_country_code) ?? 'MX').toUpperCase(),
    origin_postal_code: readText(body.origin_postal_code),
    origin_state_code: readText(body.origin_state_code)?.toUpperCase() ?? null,
    origin_city: readText(body.origin_city),
    origin_street: null,
    preferred_currency: (readText(body.preferred_currency) ?? 'MXN').toUpperCase(),
    pickup_type: readText(body.pickup_type) ?? 'USE_SCHEDULED_PICKUP',
    return_transit_times: body.return_transit_times !== false,
    rate_request_types: Array.isArray(body.rate_request_types) && body.rate_request_types.length
      ? body.rate_request_types.map((item) => String(item).toUpperCase())
      : ['ACCOUNT', 'LIST'],
    rate_display_option: readEnum(
      body.rate_display_option,
      ['LOWER_RATE', 'SELECTED_RATES_INCLUDING_F1R', 'SELECTED_RATES_EXCLUDING_F1R'],
      'SELECTED_RATES_EXCLUDING_F1R',
    ),
    weight_input_mode: readEnum(body.weight_input_mode, ['NET_CONTENT', 'GROSS_PACKAGE'], 'NET_CONTENT'),
    final_volume_padding_enabled: body.final_volume_padding_enabled !== false,
    final_padding_length_cm: nullableNonNegative(body.final_padding_length_cm) ?? 0,
    final_padding_width_cm: nullableNonNegative(body.final_padding_width_cm) ?? 0,
    final_padding_height_cm: nullableNonNegative(body.final_padding_height_cm) ?? 0,
    final_packaging_cost_enabled: body.final_packaging_cost_enabled !== false,
    final_packaging_material_cost: nullableNonNegative(body.final_packaging_material_cost) ?? 0,
    updated_by: userId,
  };

  await assignEncryptedSecret(payload, 'account_number', accountNumber, current?.account_number_encrypted ?? null);
  await assignEncryptedSecret(payload, 'client_id', body.client_id, current?.client_id_encrypted ?? null);
  await assignEncryptedSecret(payload, 'client_secret', body.client_secret, current?.client_secret_encrypted ?? null);
  payload.child_key_encrypted = null;
  payload.child_key_masked = null;
  payload.child_secret_encrypted = null;

  if (!current) payload.created_by = userId;

  const { data, error } = await adminClient
    .from('shipping_carrier_settings')
    .upsert(payload, { onConflict: 'carrier' })
    .select('*')
    .single();
  if (error) throw error;

  await audit(adminClient, {
    actorId: userId,
    actorEmail: userEmail,
    action: 'shipping.config.updated',
    entityType: 'shipping_carrier_settings',
    entityId: String(data.id),
    previousValue: previousPublic,
    newValue: publicConfig(data as CarrierSettings),
  });

  // The token cache keys include URL and client credentials, so clearing the
  // map is required after the administrator updates FedEx settings.
  tokenCache.clear();
  return data as CarrierSettings;
}

async function savePackageType(
  adminClient: SupabaseClient,
  body: Record<string, unknown>,
  userId: string,
  userEmail?: string | null,
) {
  const id = readText(body.id);
  const fedexPackagingType = (readText(body.fedex_packaging_type) ?? 'YOUR_PACKAGING').toUpperCase();
  if (!officialPackagingTypes.has(fedexPackagingType)) {
    throw new Error('Selecciona un tipo de embalaje FedEx válido.');
  }

  const payload = {
    carrier: 'FEDEX',
    name: requiredText(body.name, 'Indica el nombre del embalaje.'),
    internal_code: requiredText(body.internal_code, 'Indica el código interno.').toUpperCase(),
    description: readText(body.description),
    length: nullablePositive(body.internal_length) ?? nullablePositive(body.length),
    width: nullablePositive(body.internal_width) ?? nullablePositive(body.width),
    height: nullablePositive(body.internal_height) ?? nullablePositive(body.height),
    internal_length: nullablePositive(body.internal_length) ?? nullablePositive(body.length),
    internal_width: nullablePositive(body.internal_width) ?? nullablePositive(body.width),
    internal_height: nullablePositive(body.internal_height) ?? nullablePositive(body.height),
    external_length: nullablePositive(body.external_length) ?? nullablePositive(body.length),
    external_width: nullablePositive(body.external_width) ?? nullablePositive(body.width),
    external_height: nullablePositive(body.external_height) ?? nullablePositive(body.height),
    max_fill_percent: nullablePositive(body.max_fill_percent),
    box_cost: nullableNonNegative(body.box_cost),
    dimension_unit: readEnum(body.dimension_unit, ['CM', 'IN'], 'CM'),
    empty_weight: nullableNonNegative(body.empty_weight),
    weight_unit: readEnum(body.weight_unit, ['KG', 'LB'], 'KG'),
    max_weight: nullablePositive(body.max_weight),
    is_active: body.is_active === true,
    sort_order: Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 100,
    fedex_packaging_type: fedexPackagingType,
    updated_by: userId,
  };

  if (payload.is_active && (!payload.length || !payload.width || !payload.height || payload.empty_weight === null || !payload.max_weight)) {
    throw new Error('Para activar un embalaje debes capturar largo, ancho, alto, tara y peso máximo.');
  }

  const query = id
    ? adminClient.from('shipping_package_types').update(payload).eq('id', id).select('*').single()
    : adminClient.from('shipping_package_types').insert({ ...payload, created_by: userId }).select('*').single();
  const { data, error } = await query;
  if (error) throw error;

  await audit(adminClient, {
    actorId: userId,
    actorEmail: userEmail,
    action: id ? 'shipping.package_type.updated' : 'shipping.package_type.created',
    entityType: 'shipping_package_types',
    entityId: String(data.id),
    previousValue: null,
    newValue: data,
  });

  return data as PackageType;
}

async function listProductDimensions(adminClient: SupabaseClient) {
  const { data, error, count } = await adminClient
    .from('shipping_product_dimensions')
    .select('*', { count: 'exact' })
    .order('updated_at', { ascending: false })
    .limit(12);
  if (error) throw error;
  return { rows: data ?? [], total: count ?? 0 };
}

async function previewProductDimensionsImport(adminClient: SupabaseClient, body: Record<string, unknown>) {
  const fileName = requiredText(body.fileName, 'Selecciona un archivo Excel válido.');
  const fileBase64 = requiredText(body.fileBase64, 'No se pudo leer el archivo Excel.');
  const parsed = parseProductDimensionsWorkbook(fileBase64);
  const normalizedSkus = parsed.rows.map((row) => normalizeSku(row.sku));
  const { data: existingRows, error } = normalizedSkus.length
    ? await adminClient
        .from('shipping_product_dimensions')
        .select('*')
        .in('normalized_sku', normalizedSkus)
    : { data: [], error: null };
  if (error) throw error;

  const existingBySku = new Map(
    ((existingRows ?? []) as Record<string, unknown>[]).map((row) => [readText(row.normalized_sku) ?? normalizeSku(String(row.sku ?? '')), row]),
  );
  let newCount = 0;
  let updateCount = 0;
  let unchangedCount = 0;
  const conflicts = parsed.rows.flatMap((row) => {
    const existing = existingBySku.get(normalizeSku(row.sku));
    if (!existing) {
      newCount += 1;
      return [];
    }
    const changed = productDimensionChanged(existing, row);
    if (changed) updateCount += 1;
    else unchangedCount += 1;
    return [{ sku: row.sku, existing, incoming: row, changed }];
  });

  return {
    fileName,
    rows: parsed.rows,
    conflicts,
    invalidRows: parsed.invalidRows,
    newCount,
    updateCount,
    unchangedCount,
  };
}

async function importProductDimensions(
  adminClient: SupabaseClient,
  body: Record<string, unknown>,
  userId: string,
  userEmail?: string | null,
) {
  const fileName = requiredText(body.fileName, 'Indica el nombre del archivo importado.');
  const replaceExisting = body.replaceExisting === true;
  const rows = Array.isArray(body.rows)
    ? body.rows.map(normalizeProductDimensionImportRow).filter((row): row is ProductDimensionImportRow => Boolean(row))
    : [];
  if (!rows.length) throw new Error('No hay productos válidos para importar.');

  const normalizedSkus = rows.map((row) => normalizeSku(row.sku));
  const { data: existingRows, error: existingError } = await adminClient
    .from('shipping_product_dimensions')
    .select('*')
    .in('normalized_sku', normalizedSkus);
  if (existingError) throw existingError;
  const existingBySku = new Map(
    ((existingRows ?? []) as Record<string, unknown>[]).map((row) => [readText(row.normalized_sku) ?? normalizeSku(String(row.sku ?? '')), row]),
  );
  const changedExisting = rows.filter((row) => {
    const existing = existingBySku.get(normalizeSku(row.sku));
    return existing && productDimensionChanged(existing, row);
  });
  if (changedExisting.length && !replaceExisting) {
    throw new Error(`Hay ${changedExisting.length} SKU existentes con cambios. Confirma el reemplazo para actualizar la base.`);
  }

  const payload = rows.map((row) => ({
    sku: row.sku,
    product_name: row.product_name,
    unit_weight_kg: row.unit_weight_kg,
    volumetric_weight_kg: row.volumetric_weight_kg,
    billable_weight_kg: row.billable_weight_kg,
    width_cm: row.width_cm,
    length_cm: row.length_cm,
    height_cm: row.height_cm,
    source_file_name: fileName,
    source_row: row.source_row,
    uploaded_by: userId,
    updated_by: userId,
  }));
  const { error } = await adminClient
    .from('shipping_product_dimensions')
    .upsert(payload, { onConflict: 'normalized_sku' });
  if (error) throw error;

  const inserted = rows.filter((row) => !existingBySku.has(normalizeSku(row.sku))).length;
  const updated = changedExisting.length;
  const unchanged = rows.length - inserted - updated;
  await audit(adminClient, {
    actorId: userId,
    actorEmail: userEmail,
    action: 'shipping.product_dimensions.imported',
    entityType: 'shipping_product_dimensions',
    entityId: fileName,
    previousValue: null,
    newValue: { fileName, inserted, updated, unchanged, total: rows.length },
  });

  return { inserted, updated, unchanged, total: rows.length };
}

async function saveProductDimension(
  adminClient: SupabaseClient,
  body: Record<string, unknown>,
  userId: string,
  userEmail?: string | null,
) {
  const id = requiredText(body.id, 'Selecciona un producto válido.');
  const sku = requiredText(body.sku, 'Indica el código del producto.');
  const lengthCm = requiredPositiveNumber(body.length_cm, 'Indica un largo válido.');
  const widthCm = requiredPositiveNumber(body.width_cm, 'Indica un ancho válido.');
  const heightCm = requiredPositiveNumber(body.height_cm, 'Indica un alto válido.');
  const unitWeightKg = nullablePositive(body.unit_weight_kg);
  const volumetricWeightKg = round((Math.ceil(lengthCm) * Math.ceil(widthCm) * Math.ceil(heightCm)) / 5000, 3);
  const billableWeightKg = round(Math.max(unitWeightKg ?? 0, volumetricWeightKg), 3);
  const payload = {
    sku,
    product_name: readText(body.product_name),
    length_cm: lengthCm,
    width_cm: widthCm,
    height_cm: heightCm,
    unit_weight_kg: unitWeightKg,
    volumetric_weight_kg: volumetricWeightKg,
    billable_weight_kg: billableWeightKg,
    updated_by: userId,
  };
  const { data: previous } = await adminClient.from('shipping_product_dimensions').select('*').eq('id', id).maybeSingle();
  const { data, error } = await adminClient
    .from('shipping_product_dimensions')
    .update(payload)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  await audit(adminClient, {
    actorId: userId,
    actorEmail: userEmail,
    action: 'shipping.product_dimension.updated',
    entityType: 'shipping_product_dimensions',
    entityId: id,
    previousValue: previous,
    newValue: data,
  });
  return data;
}

async function createQuote(adminClient: SupabaseClient, body: Record<string, unknown>, userId: string, userEmail: string | null) {
  const settings = await requireConfiguredSettings(adminClient);
  const packages = applyFinalPackagingAdjustments(preparePackages(body.packages, settings.weight_input_mode), settings);
  const destination = normalizeAddress(body.destination, 'destino');
  const origin = {
    countryCode: settings.origin_country_code || 'MX',
    postalCode: settings.origin_postal_code ?? '',
    stateOrProvinceCode: settings.origin_state_code,
    city: settings.origin_city,
    neighborhood: null,
    street: null,
  };
  if (!packages.length) throw new Error('Agrega al menos un paquete válido.');

  const fedexConfig = await decryptFedexConfig(settings);
  const quoteNumber = await nextQuoteNumber(adminClient);
  const totals = summarizePreparedPackages(packages);

  try {
    const token = await getFedexAccessToken(fedexConfig);
    const payload = buildFedexRatePayload({
      settings,
      fedexConfig,
      origin,
      destination,
      packages,
      requestedShipDate: null,
    });
    const response = await fetchFedexRates(fedexConfig, token, payload);
    const rates = applyFinalPackagingCost(normalizeFedExRateResponse(response), settings);
    if (!rates.length) {
      const fallbackPayload = buildFedexListRateFallback(payload);
      const fallbackResponse = fallbackPayload ? await fetchFedexRates(fedexConfig, token, fallbackPayload) : null;
      const fallbackRates = fallbackResponse ? applyFinalPackagingCost(normalizeFedExRateResponse(fallbackResponse), settings) : [];
      if (fallbackRates.length) {
        const bestRate = fallbackRates.slice().sort((left, right) => left.totalAmount - right.totalAmount)[0];
        return insertQuote(adminClient, {
          quoteNumber,
          userId,
          userEmail,
          settings,
          origin,
          destination,
          requestedShipDate: null,
          packages,
          totals,
          status: 'SUCCESS',
          errorMessage: null,
          technicalError: null,
          bestRate,
          rates: fallbackRates,
          odooOrderName: readText(body.odooOrderName),
          odooOrderId: nullableInteger(body.odooOrderId),
          selectedPackingPlan: isRecord(body.selectedPackingPlan) ? body.selectedPackingPlan : null,
        });
      }
      throw new Error(`FedEx no devolvió servicios disponibles. Respuesta: ${safeFedexText(JSON.stringify(response).slice(0, 1800))}`);
    }
    const bestRate = rates.slice().sort((left, right) => left.totalAmount - right.totalAmount)[0];
    const quote = await insertQuote(adminClient, {
      quoteNumber,
      userId,
      userEmail,
      settings,
      origin,
      destination,
      requestedShipDate: null,
      packages,
      totals,
      status: 'SUCCESS',
      errorMessage: null,
      technicalError: null,
      bestRate,
      rates,
      odooOrderName: readText(body.odooOrderName),
      odooOrderId: nullableInteger(body.odooOrderId),
      selectedPackingPlan: isRecord(body.selectedPackingPlan) ? body.selectedPackingPlan : null,
    });
    return quote;
  } catch (error) {
    const technicalError = sanitizeErrorText(error);
    const userMessage = mapFedexError(error);
    const normalizedError = normalizeShippingError(error, userMessage);
    await insertQuote(adminClient, {
      quoteNumber,
      userId,
      userEmail,
      settings,
      origin,
      destination,
      requestedShipDate: null,
      packages,
      totals,
      status: 'ERROR',
      errorMessage: userMessage,
      technicalError,
      bestRate: null,
      rates: [],
      odooOrderName: readText(body.odooOrderName),
      odooOrderId: nullableInteger(body.odooOrderId),
      selectedPackingPlan: isRecord(body.selectedPackingPlan) ? body.selectedPackingPlan : null,
    });
    throw normalizedError;
  }
}

async function lookupOdooOrder(adminClient: SupabaseClient, body: Record<string, unknown>) {
  const orderNumber = requiredText(body.orderNumber, 'Indica el número de cotización u orden.');
  const odoo = readOdooEnvironment();
  assertOdooEnvironment(odoo);
  const connection = await connectOdooReadOnly({
    apiKey: odoo.apiKey,
    configuredDatabase: odoo.database,
    odooUrl: odoo.url,
    user: odoo.user,
  });
  const { database, odooUrl, uid } = connection;

  const partnerMeta = await getOdooFields({ apiKey: odoo.apiKey, database, model: 'res.partner', odooUrl, uid });
  const partnerPostalFields = detectPartnerPostalFields(partnerMeta);
  const orderRows = await searchReadOdoo({
    apiKey: odoo.apiKey,
    database,
    domain: [['name', '=', orderNumber]],
    fields: [
      'id',
      'name',
      'date_order',
      'state',
      'partner_id',
      'partner_shipping_id',
      'order_line',
      'amount_total',
      'currency_id',
      'user_id',
      'company_id',
    ],
    model: 'sale.order',
    odooUrl,
    order: 'id desc',
    uid,
  });
  const fallbackOrderRows = orderRows.length
    ? []
    : await searchReadOdoo({
        apiKey: odoo.apiKey,
        database,
        domain: [['name', '=ilike', orderNumber]],
        fields: [
          'id',
          'name',
          'date_order',
          'state',
          'partner_id',
          'partner_shipping_id',
          'order_line',
          'amount_total',
          'currency_id',
          'user_id',
          'company_id',
        ],
        model: 'sale.order',
        odooUrl,
        order: 'id desc',
        uid,
      });
  const [order] = orderRows.length ? orderRows : fallbackOrderRows;

  if (!order?.id) {
    throw new Error(`No se encontró una cotización u orden con el número ${orderNumber}.`);
  }

  const orderId = Number(order.id);
  const invoicePartnerId = many2oneId(order.partner_id);
  const shippingPartnerId = many2oneId(order.partner_shipping_id) ?? invoicePartnerId;
  if (!shippingPartnerId) throw new Error('La orden no tiene una dirección de entrega asociada en Odoo.');
  const partnerIds = uniqueNumbers([shippingPartnerId, invoicePartnerId]);

  const [basePartnerRows, lineRows] = await Promise.all([
    searchReadOdoo({
      apiKey: odoo.apiKey,
      database,
      domain: [['id', 'in', partnerIds]],
      fields: buildPartnerFields(partnerPostalFields),
      model: 'res.partner',
      odooUrl,
      uid,
    }),
    searchReadOdoo({
      apiKey: odoo.apiKey,
      database,
      domain: [['order_id', '=', orderId], ['display_type', '=', false]],
      fields: ['id', 'product_id', 'product_uom_qty', 'product_uom', 'name', 'price_unit'],
      model: 'sale.order.line',
      odooUrl,
      order: 'id asc',
      uid,
    }),
  ]);

  if (!lineRows.length) throw new Error('La orden no contiene productos para enviar.');
  const basePartnersById = new Map(basePartnerRows.map((partner) => [Number(partner.id), partner]));
  const directShippingPartner = shippingPartnerId ? basePartnersById.get(shippingPartnerId) ?? null : null;
  const directInvoicePartner = invoicePartnerId ? basePartnersById.get(invoicePartnerId) ?? null : null;
  const deliveryParentIds = uniqueNumbers([
    shippingPartnerId,
    invoicePartnerId,
    many2oneId(directShippingPartner?.parent_id),
    many2oneId(directInvoicePartner?.parent_id),
    many2oneId(directShippingPartner?.commercial_partner_id),
    many2oneId(directInvoicePartner?.commercial_partner_id),
  ]);
  const deliveryChildRows = deliveryParentIds.length
    ? await searchReadOdoo({
      apiKey: odoo.apiKey,
      database,
      domain: [['parent_id', 'in', deliveryParentIds], ['type', '=', 'delivery']],
      fields: buildPartnerFields(partnerPostalFields),
      model: 'res.partner',
      odooUrl,
      order: 'id asc',
      uid,
    })
    : [];
  const partnerRows = uniquePartnerRows([...basePartnerRows, ...deliveryChildRows]);

  const productIds = uniqueNumbers(lineRows.map((line) => many2oneId(line.product_id)));
  const [productMeta, templateMeta] = await Promise.all([
    getOdooFields({ apiKey: odoo.apiKey, database, model: 'product.product', odooUrl, uid }),
    getOdooFields({ apiKey: odoo.apiKey, database, model: 'product.template', odooUrl, uid }),
  ]);
  const productLogisticsFields = detectProductLogisticsFields(productMeta);
  const templateLogisticsFields = detectProductLogisticsFields(templateMeta);
  const productReferenceFields = detectProductReferenceFields(productMeta);
  const templateReferenceFields = detectProductReferenceFields(templateMeta);
  const productRows = productIds.length
    ? await searchReadOdoo({
        apiKey: odoo.apiKey,
        database,
        domain: [['id', 'in', productIds]],
        fields: buildProductFields(productMeta, productLogisticsFields, productReferenceFields),
        model: 'product.product',
        odooUrl,
        uid,
      })
    : [];
  const productMap = new Map(productRows.map((product) => [Number(product.id), product]));
  const templateIds = uniqueNumbers(productRows.map((product) => many2oneId(product.product_tmpl_id)));
  const templateRows = templateIds.length
    ? await searchReadOdoo({
        apiKey: odoo.apiKey,
        database,
        domain: [['id', 'in', templateIds]],
        fields: buildTemplateFields(templateMeta, templateLogisticsFields, templateReferenceFields),
        model: 'product.template',
        odooUrl,
        uid,
      })
    : [];
  const templateMap = new Map(templateRows.map((template) => [Number(template.id), template]));

  const { data: savedProfiles, error: profileError } = productIds.length
    ? await adminClient
        .from('shipping_product_profiles')
        .select('odoo_product_id, sku, product_name, unit_weight_kg, length_cm, width_cm, height_cm, can_rotate, stackable, fragile, can_combine, packaging_group, shipping_mode')
        .in('odoo_product_id', productIds)
    : { data: [], error: null };
  if (profileError) console.error('[shipping-quote:profiles]', sanitizeError(profileError));
  const profileMap = new Map(
    ((savedProfiles ?? []) as Record<string, unknown>[]).map((profile) => [Number(profile.odoo_product_id), profile]),
  );
  const candidateSkus = uniqueTexts(productRows.flatMap((product) => {
    const templateId = many2oneId(product.product_tmpl_id);
    const template = templateId ? templateMap.get(templateId) ?? {} : {};
    return resolveProductReferenceCandidates(product, template, { product: productReferenceFields, template: templateReferenceFields })
      .map((value) => normalizeSku(value));
  }));
  const { data: savedDimensions, error: dimensionError } = candidateSkus.length
    ? await adminClient
        .from('shipping_product_dimensions')
        .select('*')
        .in('normalized_sku', candidateSkus)
    : { data: [], error: null };
  if (dimensionError) console.error('[shipping-quote:dimensions]', sanitizeError(dimensionError));
  const dimensionMap = new Map(
    ((savedDimensions ?? []) as Record<string, unknown>[]).map((dimension) => [readText(dimension.normalized_sku) ?? normalizeSku(String(dimension.sku ?? '')), dimension]),
  );

  const countryIds = uniqueNumbers(partnerRows.map((partner) => many2oneId(partner.country_id)));
  const countryRows = countryIds.length
    ? await searchReadOdoo({
        apiKey: odoo.apiKey,
        database,
        domain: [['id', 'in', countryIds]],
        fields: ['id', 'code', 'name'],
        model: 'res.country',
        odooUrl,
        uid,
      })
    : [];
  const countryCodeById = new Map(countryRows.map((country) => [Number(country.id), readText(country.code) ?? readText(country.name)]));
  const shippingPartner = partnerRows.find((row) => Number(row.id) === shippingPartnerId) ?? partnerRows[0] ?? {};
  const invoicePartner = partnerRows.find((row) => Number(row.id) === invoicePartnerId) ?? {};
  const shippingChildDeliveryPartner = findMatchingDeliveryPartner(partnerRows, shippingPartner, partnerPostalFields);
  const invoiceChildDeliveryPartner = findMatchingDeliveryPartner(partnerRows, invoicePartner, partnerPostalFields);
  const shippingPostalCode = firstPostalCodeFromPartner(shippingPartner, partnerPostalFields);
  const shippingChildPostalCode = firstPostalCodeFromPartner(shippingChildDeliveryPartner ?? {}, partnerPostalFields);
  const invoiceChildPostalCode = firstPostalCodeFromPartner(invoiceChildDeliveryPartner ?? {}, partnerPostalFields);
  const invoicePostalCode = firstPostalCodeFromPartner(invoicePartner, partnerPostalFields);
  const usedShippingChildAddress = Boolean(shippingChildPostalCode);
  const usedInvoiceChildAddress = !shippingChildPostalCode && Boolean(invoiceChildPostalCode);
  const usedInvoicePostalFallback = !shippingChildPostalCode && !invoiceChildPostalCode && !shippingPostalCode && Boolean(invoicePostalCode);
  const partner = shippingChildPostalCode && shippingChildDeliveryPartner
    ? mergeMissingPartnerFields(shippingChildDeliveryPartner, shippingPartner)
    : invoiceChildPostalCode && invoiceChildDeliveryPartner
      ? mergeMissingPartnerFields(invoiceChildDeliveryPartner, invoicePartner)
      : shippingPostalCode
        ? shippingPartner
        : mergeMissingPartnerFields(shippingPartner, invoicePartner);
  const postalCode = firstPostalCodeFromPartner(partner, partnerPostalFields);
  const countryCode = resolveCountryCode(partner.country_id, countryCodeById) ?? 'MX';

  const lines = lineRows.map((line) => {
    const productId = many2oneId(line.product_id) ?? 0;
    const product = productMap.get(productId) ?? {};
    const templateId = many2oneId(product.product_tmpl_id);
    const template = templateId ? templateMap.get(templateId) ?? {} : {};
    const profile = profileMap.get(productId) ?? {};
    const productName = many2oneLabel(line.product_id) ?? readText(product.name) ?? readText(template.name) ?? readText(line.name) ?? 'Producto sin nombre';
    const skuCandidates = resolveProductReferenceCandidates(product, template, { product: productReferenceFields, template: templateReferenceFields });
    const matchedSku = skuCandidates.find((candidate) => dimensionMap.has(normalizeSku(candidate))) ?? null;
    const sku = matchedSku ?? readText(product.default_code) ?? readText(template.default_code) ?? readText(product.barcode) ?? readText(profile.sku);
    const dimension = matchedSku ? dimensionMap.get(normalizeSku(matchedSku)) ?? {} : {};
    const matchedDimension = Boolean(matchedSku);
    const productType = readText(product.detailed_type) ?? readText(product.type) ?? readText(template.detailed_type) ?? readText(template.type);
    const productCategory = many2oneLabel(product.categ_id) ?? many2oneLabel(template.categ_id);
    const volumeWeightKg = firstNumber(product.volume, template.volume);
    const isConsumable = isConsumableProduct(productType, productCategory);
    const saleOk = firstBoolean(product.sale_ok, template.sale_ok) === true;
    const exclusionReason = !isConsumable
      ? 'No entra en envío: el tipo de producto no es Consumible.'
      : !saleOk
        ? 'No entra en envío: el producto no tiene marcada la opción Se puede vender.'
        : null;
    const isEligibleForShipping = !exclusionReason;
    const lengthCm = firstNumberFromFields(product, productLogisticsFields.length) ?? firstNumberFromFields(template, templateLogisticsFields.length) ?? firstNumber(dimension.length_cm, profile.length_cm);
    const widthCm = firstNumberFromFields(product, productLogisticsFields.width) ?? firstNumberFromFields(template, templateLogisticsFields.width) ?? firstNumber(dimension.width_cm, profile.width_cm);
    const heightCm = firstNumberFromFields(product, productLogisticsFields.height) ?? firstNumberFromFields(template, templateLogisticsFields.height) ?? firstNumber(dimension.height_cm, profile.height_cm);
    const physicalWeightKg = firstNumber(product.weight, template.weight, dimension.unit_weight_kg, profile.unit_weight_kg);
    const configuredBillableWeightKg = firstNumber(dimension.billable_weight_kg);
    const configuredVolumetricWeightKg = firstNumber(dimension.volumetric_weight_kg);
    const resolvedVolumetricWeightKg = volumeWeightKg ?? configuredVolumetricWeightKg;
    const weightKg = configuredBillableWeightKg ?? maxPositive(physicalWeightKg, resolvedVolumetricWeightKg);
    const logisticsSource = matchedDimension
      ? 'Base de dimensiones por SKU'
      : resolvedVolumetricWeightKg && resolvedVolumetricWeightKg >= (physicalWeightKg ?? 0)
        ? 'Peso volumétrico de Odoo'
        : physicalWeightKg
          ? 'Peso de Odoo'
          : null;
    const missingFields = [
      isEligibleForShipping && !lengthCm ? 'largo' : null,
      isEligibleForShipping && !widthCm ? 'ancho' : null,
      isEligibleForShipping && !heightCm ? 'alto' : null,
      isEligibleForShipping && !weightKg ? 'peso' : null,
    ].filter((value): value is string => Boolean(value));

    return {
      lineId: Number(line.id),
      productId,
      sku,
      productName,
      description: readText(line.name) ?? '',
      quantity: num(line.product_uom_qty),
      uom: many2oneLabel(line.product_uom),
      priceUnit: num(line.price_unit),
      lengthCm: lengthCm ?? null,
      widthCm: widthCm ?? null,
      heightCm: heightCm ?? null,
      weightKg: weightKg ?? null,
      volumeWeightKg: resolvedVolumetricWeightKg ?? null,
      productType: productType ?? null,
      productCategory: productCategory ?? null,
      saleOk,
      isEligibleForShipping,
      exclusionReason,
      logisticsSource,
      // En este cotizador todos los consumibles pueden girarse y combinarse.
      // No imponemos fragilidad ni separación provenientes de perfiles anteriores.
      canRotate: true,
      canStack: true,
      shipAlone: false,
      fragile: false,
      packingGroup: null,
      missingFields,
    };
  });

  return {
    fetchedAt: new Date().toISOString(),
    order: {
      id: orderId,
      name: readText(order.name) ?? orderNumber,
      dateOrder: readText(order.date_order),
      state: readText(order.state) ?? 'draft',
      amountTotal: num(order.amount_total),
      currencyCode: currencyLabel(order.currency_id),
      salesperson: many2oneLabel(order.user_id),
      company: many2oneLabel(order.company_id),
    },
    destination: {
      name: readText(partner.name),
      company: many2oneLabel(partner.parent_id),
      email: readText(partner.email),
      phone: readText(partner.phone),
      countryCode,
      postalCode: postalCode ?? '',
      stateOrProvinceCode: stateShortCode(partner.state_id) ?? many2oneLabel(partner.state_id),
      city: readText(partner.city),
      neighborhood: null,
      street: readText(partner.street),
    },
    lines,
    warnings: [
      usedShippingChildAddress
        ? 'Se usó el código postal del contacto de Entrega asociado al contacto de la orden.'
        : null,
      usedInvoiceChildAddress
        ? 'La dirección de entrega directa no tenía código postal; se usó un contacto de Entrega asociado al cliente.'
        : null,
      usedInvoicePostalFallback
        ? 'La dirección de entrega no tiene código postal; se usó el código postal del contacto de la orden.'
        : null,
      lines.some((line) => line.missingFields.length)
        ? 'Hay productos con información logística incompleta. Completa esos datos antes de calcular embalaje.'
        : null,
      lines.some((line) => !line.isEligibleForShipping)
        ? 'Se omitieron productos que no son Consumible o no tienen marcada la opción Se puede vender.'
        : null,
    ].filter((item): item is string => Boolean(item)),
  };
}

async function insertQuote(
  adminClient: SupabaseClient,
  input: {
    quoteNumber: string;
    userId: string;
    userEmail: string | null;
    settings: CarrierSettings;
    origin: Record<string, unknown>;
    destination: Record<string, unknown>;
    requestedShipDate: string | null;
    packages: PreparedPackage[];
    totals: ReturnType<typeof summarizePreparedPackages>;
    status: 'SUCCESS' | 'ERROR';
    errorMessage: string | null;
    technicalError: string | null;
    bestRate: NormalizedRate | null;
    rates: NormalizedRate[];
    odooOrderName?: string | null;
    odooOrderId?: number | null;
    selectedPackingPlan?: Record<string, unknown> | null;
  },
) {
  const { data: quote, error: quoteError } = await adminClient
    .from('shipping_quotes')
    .insert({
      quote_number: input.quoteNumber,
      user_id: input.userId,
      user_email: input.userEmail,
      carrier: 'FEDEX',
      environment: input.settings.environment,
      status: input.status,
      calculation_method: 'MULTI_PACKAGE_RATE',
      origin: input.origin,
      destination: input.destination,
      requested_ship_date: input.requestedShipDate,
      package_count: input.packages.length,
      total_content_weight: input.totals.contentWeight,
      total_billable_weight: input.totals.billableWeight,
      weight_unit: 'KG',
      best_total_amount: input.bestRate?.totalAmount ?? null,
      best_currency: input.bestRate?.currency ?? null,
      best_service_code: input.bestRate?.serviceCode ?? null,
      best_service_name: input.bestRate?.serviceName ?? null,
      best_delivery_label: input.bestRate?.deliveryLabel ?? null,
      error_message: input.errorMessage,
      technical_error: input.technicalError,
      odoo_order_name: input.odooOrderName ?? null,
      odoo_order_id: input.odooOrderId ?? null,
      selected_packing_plan: input.selectedPackingPlan ?? null,
      packing_source: input.selectedPackingPlan ? 'ODOO_PACKING_ENGINE' : 'MANUAL',
    })
    .select('*')
    .single();
  if (quoteError) throw quoteError;

  const quoteId = String(quote.id);
  const [packagesResult, ratesResult] = await Promise.all([
    adminClient.from('shipping_quote_packages').insert(
      input.packages.map((item) => ({
        quote_id: quoteId,
        package_type_id: item.packageTypeId,
        package_snapshot: packageSnapshot(item.packageType),
        package_index: item.packageIndex,
        content_weight: item.contentWeight,
        tare_weight: item.tareWeight,
        billable_weight: item.billableWeight,
        weight_unit: item.packageType.weight_unit,
        length: item.packageType.external_length ?? item.packageType.length,
        width: item.packageType.external_width ?? item.packageType.width,
        height: item.packageType.external_height ?? item.packageType.height,
        dimension_unit: item.packageType.dimension_unit,
      })),
    ).select('*'),
    input.rates.length
      ? adminClient.from('shipping_quote_rates').insert(
          input.rates.map((rate) => ({
            quote_id: quoteId,
            carrier: rate.carrier,
            service_code: rate.serviceCode,
            service_name: rate.serviceName,
            currency: rate.currency,
            base_amount: rate.baseAmount,
            discount_amount: rate.discountAmount,
            surcharge_amount: rate.surchargeAmount,
            tax_amount: rate.taxAmount,
            total_amount: rate.totalAmount,
            transit_days: rate.transitDays,
            estimated_delivery_date: rate.estimatedDeliveryDate,
            delivery_timestamp: rate.deliveryTimestamp,
            delivery_label: rate.deliveryLabel,
            rate_type: rate.rateType,
            raw_summary: rate.rawSummary,
          })),
        ).select('*')
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (packagesResult.error) throw packagesResult.error;
  if (ratesResult.error) throw ratesResult.error;
  const rates = (ratesResult.data ?? []) as Array<{ id: string; total_amount: number }>;
  const bestRateRow = rates.slice().sort((left, right) => Number(left.total_amount) - Number(right.total_amount))[0];
  if (bestRateRow) {
    await adminClient.from('shipping_quotes').update({ best_rate_id: bestRateRow.id }).eq('id', quoteId);
  }

  return {
    ...quote,
    best_rate_id: bestRateRow?.id ?? null,
    packages: packagesResult.data ?? [],
    rates: ratesResult.data ?? [],
  };
}

async function listQuotes(adminClient: SupabaseClient, body: Record<string, unknown>, userId: string, access: Access) {
  const pageSize = clamp(Number(body.pageSize) || 20, 5, 50);
  const page = Math.max(1, Number(body.page) || 1);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const requestedAll = body.scope === 'all';
  let query = adminClient
    .from('shipping_quotes')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (!access.viewAll || !requestedAll) query = query.eq('user_id', userId);
  if (body.status === 'SUCCESS' || body.status === 'ERROR') query = query.eq('status', body.status);
  const search = readText(body.search);
  if (search) query = query.or(`quote_number.ilike.%${escapeLike(search)}%,user_email.ilike.%${escapeLike(search)}%,best_service_name.ilike.%${escapeLike(search)}%`);
  if (readText(body.dateFrom)) query = query.gte('created_at', `${readText(body.dateFrom)}T00:00:00`);
  if (readText(body.dateTo)) query = query.lte('created_at', `${readText(body.dateTo)}T23:59:59`);

  const { data, error, count } = await query;
  if (error) throw error;
  return { rows: data ?? [], total: count ?? 0 };
}

async function getQuoteDetail(adminClient: SupabaseClient, id: string, userId: string, access: Access) {
  if (!id) return null;
  let query = adminClient.from('shipping_quotes').select('*').eq('id', id);
  if (!access.viewAll) query = query.eq('user_id', userId);
  const { data: quote, error } = await query.maybeSingle();
  if (error) throw error;
  if (!quote) return null;

  const [packagesResult, ratesResult] = await Promise.all([
    adminClient.from('shipping_quote_packages').select('*').eq('quote_id', id).order('package_index', { ascending: true }),
    adminClient.from('shipping_quote_rates').select('*').eq('quote_id', id).order('total_amount', { ascending: true }),
  ]);
  if (packagesResult.error) throw packagesResult.error;
  if (ratesResult.error) throw ratesResult.error;
  return {
    ...quote,
    packages: packagesResult.data ?? [],
    rates: ratesResult.data ?? [],
  };
}

async function nextQuoteNumber(adminClient: SupabaseClient) {
  const { data, error } = await adminClient.rpc('next_shipping_quote_number');
  if (error) throw error;
  return String(data);
}

function publicConfig(settings: CarrierSettings) {
  return {
    id: settings.id,
    carrier: settings.carrier,
    environment: settings.environment,
    is_active: settings.is_active,
    fedex_base_url: settings.fedex_base_url,
    account_number_masked: settings.account_number_masked,
    client_id_masked: settings.client_id_masked,
    origin_country_code: settings.origin_country_code,
    origin_postal_code: settings.origin_postal_code,
    origin_state_code: settings.origin_state_code,
    origin_city: settings.origin_city,
    origin_street: settings.origin_street,
    preferred_currency: settings.preferred_currency,
    pickup_type: settings.pickup_type,
    return_transit_times: settings.return_transit_times,
    rate_request_types: Array.isArray(settings.rate_request_types) ? settings.rate_request_types : ['ACCOUNT'],
    rate_display_option: settings.rate_display_option,
    weight_input_mode: settings.weight_input_mode,
    final_volume_padding_enabled: settings.final_volume_padding_enabled !== false,
    final_padding_length_cm: Number(settings.final_padding_length_cm ?? 0),
    final_padding_width_cm: Number(settings.final_padding_width_cm ?? 0),
    final_padding_height_cm: Number(settings.final_padding_height_cm ?? 0),
    final_packaging_cost_enabled: settings.final_packaging_cost_enabled !== false,
    final_packaging_material_cost: Number(settings.final_packaging_material_cost ?? 0),
    created_at: settings.created_at,
    updated_at: settings.updated_at,
  };
}

async function decryptFedexConfig(settings: CarrierSettings) {
  const accountNumber = normalizeFedexAccountNumber(await decryptSecret(settings.account_number_encrypted));
  const clientId = await decryptSecret(settings.client_id_encrypted);
  const clientSecret = await decryptSecret(settings.client_secret_encrypted);
  if (!accountNumber || !clientId || !clientSecret) {
    throw new Error('Faltan Account Number, Client ID o Client Secret de FedEx.');
  }
  return {
    baseUrl: trimSlash(settings.fedex_base_url),
    accountNumber,
    clientId,
    clientSecret,
  };
}

async function getFedexAccessToken(config: {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
}) {
  const cacheKey = buildFedexTokenCacheKey(config);
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const errors: string[] = [];

  for (const attempt of [{ label: 'credenciales principales', grantType: 'client_credentials' }]) {
    const payload = await requestFedexOAuthToken(config, attempt.grantType);
    if (payload.ok) {
      const token = readText(payload.body.access_token);
      if (!token) throw new Error('FedEx no devolvió un token OAuth válido.');
      const expiresIn = Number(payload.body.expires_in);
      const maxTokenTtlMs = 50 * 60 * 1000;
      const reportedTokenTtlMs = Number.isFinite(expiresIn) ? Math.max(0, expiresIn * 1000) : maxTokenTtlMs;
      tokenCache.set(cacheKey, {
        token,
        expiresAt: Date.now() + Math.min(reportedTokenTtlMs, maxTokenTtlMs),
      });
      return token;
    }
    errors.push(`${attempt.label}: ${payload.status}${payload.errorText ? ` - ${payload.errorText}` : ''}`);
  }

  throw new Error(
    `FedEx rechazó la autenticación OAuth en ${config.baseUrl}. Verifica que Client ID, Client Secret y Account Number pertenezcan al ambiente configurado. Detalle: ${errors.join(' | ')}`,
  );
}

function buildFedexTokenCacheKey(config: {
  baseUrl: string;
  clientId?: string;
  clientSecret?: string;
}) {
  return [
    'FEDEX',
    config.baseUrl,
    config.clientId ?? '',
    config.clientSecret ? maskSecret(config.clientSecret) : '',
  ].join(':');
}

async function requestFedexOAuthToken(
  config: {
    baseUrl: string;
    clientId: string;
    clientSecret: string;
  },
  grantType: string,
): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; status: number; errorText: string }> {
  const params = new URLSearchParams();
  params.set('grant_type', grantType);
  params.set('client_id', config.clientId);
  params.set('client_secret', config.clientSecret);

  const response = await fetch(`${config.baseUrl}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  const text = await response.text();
  const parsed = parseJsonObject(text);
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      errorText: safeFedexText(text),
    };
  }
  if (!parsed) throw new Error('FedEx devolvió una respuesta OAuth inválida.');
  return { ok: true, body: parsed };
}

function parseJsonObject(value: string) {
  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function fetchFedexRates(
  config: {
    baseUrl: string;
    clientId?: string;
    clientSecret?: string;
  },
  token: string,
  body: Record<string, unknown>,
) {
  let activeToken = token;
  let firstAttempt = await postFedexRateRequest(config, activeToken, body);
  if (isFedexAuthStatus(firstAttempt.response.status) && config.clientId && config.clientSecret) {
    tokenCache.delete(buildFedexTokenCacheKey(config));
    activeToken = await getFedexAccessToken({
      baseUrl: config.baseUrl,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
    });
    firstAttempt = await postFedexRateRequest(config, activeToken, body);
  }
  if (firstAttempt.response.ok) {
    const parsed = parseJsonObject(firstAttempt.text);
    if (!parsed) throw new Error('FedEx devolvió una respuesta de tarifas inválida.');
    return parsed;
  }

  if (firstAttempt.response.status === 400 && firstAttempt.text.includes('SERVICE.PACKAGECOMBINATION.INVALID')) {
    const fallbackBody = buildFedexPackageCombinationFallback(body);
    if (fallbackBody) {
      const secondAttempt = await postFedexRateRequest(config, activeToken, fallbackBody);
      if (secondAttempt.response.ok) {
        const parsed = parseJsonObject(secondAttempt.text);
        if (!parsed) throw new Error('FedEx devolvió una respuesta de tarifas inválida.');
        return parsed;
      }
      throw new Error(
        `FedEx no pudo obtener tarifas (${secondAttempt.response.status}). Primer intento: ${safeFedexText(firstAttempt.text)} Reintento: ${safeFedexText(secondAttempt.text)}`,
      );
    }
  }

  // El entorno Sandbox de FedEx puede rechazar opciones de presentación o de
  // tránsito aunque acepte el OAuth. Conservamos el envío y reintentamos con
  // la forma mínima documentada para Rate API antes de reportar indisponibilidad.
  if (isFedexSystemUnavailable(firstAttempt)) {
    const fallbackBody = buildFedexSandboxCompatibilityFallback(body);
    if (fallbackBody) {
      const fallbackAttempt = await postFedexRateRequest(config, activeToken, fallbackBody, 1);
      if (fallbackAttempt.response.ok) {
        const parsed = parseJsonObject(fallbackAttempt.text);
        if (!parsed) throw new Error('FedEx devolvió una respuesta de tarifas inválida.');
        return parsed;
      }
      throw new Error(
        `FedEx no pudo obtener tarifas (${fallbackAttempt.response.status}). Solicitud estándar: ${safeFedexText(firstAttempt.text)} Solicitud compatible: ${safeFedexText(fallbackAttempt.text)}`,
      );
    }
  }

  throw new Error(`FedEx no pudo obtener tarifas (${firstAttempt.response.status}). ${safeFedexText(firstAttempt.text)}`);
}

async function postFedexRateRequest(
  config: { baseUrl: string },
  token: string,
  body: Record<string, unknown>,
  maxAttempts = 2,
) {
  // The compatibility payload gets one request only, so an interactive quote
  // does not issue four calls when FedEx Sandbox is unavailable.
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const response = await fetch(`${config.baseUrl}/rate/v1/rates/quotes`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-locale': 'es_MX',
      },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    if (response.ok || !isTransientFedexStatus(response.status) || attempt === maxAttempts - 1) {
      return { response, text };
    }
    await delay(850);
  }
  throw new Error('No fue posible completar la consulta de tarifas de FedEx.');
}

function isTransientFedexStatus(status: number) {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

function isFedexAuthStatus(status: number) {
  return status === 401 || status === 403;
}

function isFedexSystemUnavailable(attempt: { response: Response; text: string }) {
  return attempt.response.status === 503 && (
    attempt.text.includes('SYSTEM.UNAVAILABLE.EXCEPTION') ||
    attempt.text.toLowerCase().includes('unable to process this request')
  );
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

function buildFedexPackageCombinationFallback(body: Record<string, unknown>) {
  const cloned = parseJsonObject(JSON.stringify(body));
  if (!cloned) return null;
  const requestedShipment = isRecord(cloned.requestedShipment) ? cloned.requestedShipment : null;
  if (!requestedShipment) return null;
  requestedShipment.packagingType = 'YOUR_PACKAGING';
  requestedShipment.rateRequestType = ['ACCOUNT', 'LIST'];
  delete requestedShipment.rateDisplayOption;
  delete requestedShipment.serviceType;
  delete requestedShipment.specialServicesRequested;
  return cloned;
}

function buildFedexSandboxCompatibilityFallback(body: Record<string, unknown>) {
  const requestedShipment = isRecord(body.requestedShipment) ? body.requestedShipment : null;
  const accountNumber = isRecord(body.accountNumber) ? body.accountNumber : null;
  if (!requestedShipment || !accountNumber) return null;

  const packageLines = Array.isArray(requestedShipment.requestedPackageLineItems)
    ? requestedShipment.requestedPackageLineItems
      .filter(isRecord)
      .map((line) => ({
        weight: line.weight,
        dimensions: line.dimensions,
      }))
    : [];
  if (!packageLines.length) return null;

  return {
    accountNumber,
    requestedShipment: {
      shipper: requestedShipment.shipper,
      recipient: requestedShipment.recipient,
      pickupType: requestedShipment.pickupType,
      packagingType: 'YOUR_PACKAGING',
      rateRequestType: ['ACCOUNT', 'LIST'],
      requestedPackageLineItems: packageLines,
    },
  };
}

function buildFedexListRateFallback(body: Record<string, unknown>) {
  const cloned = parseJsonObject(JSON.stringify(body));
  if (!cloned) return null;
  const requestedShipment = isRecord(cloned.requestedShipment) ? cloned.requestedShipment : null;
  if (!requestedShipment) return null;
  requestedShipment.packagingType = 'YOUR_PACKAGING';
  requestedShipment.rateRequestType = ['ACCOUNT', 'LIST'];
  requestedShipment.rateDisplayOption = 'SELECTED_RATES_EXCLUDING_F1R';
  delete requestedShipment.serviceType;
  delete requestedShipment.shipDateStamp;
  return cloned;
}

function buildFedexRatePayload({
  settings,
  fedexConfig,
  origin,
  destination,
  packages,
  requestedShipDate,
}: {
  settings: CarrierSettings;
  fedexConfig: { accountNumber: string };
  origin: Record<string, unknown>;
  destination: Record<string, unknown>;
  packages: PreparedPackage[];
  requestedShipDate: string | null;
}) {
  return {
    accountNumber: { value: fedexConfig.accountNumber },
    rateRequestControlParameters: {
      returnTransitTimes: settings.return_transit_times,
      servicesNeededOnRateFailure: true,
      rateSortOrder: 'SERVICENAMETRADITIONAL',
    },
    requestedShipment: {
      shipper: { address: fedexAddress(origin, false) },
      recipient: { address: fedexAddress(destination, false) },
      // La pantalla no solicita fecha: FedEx recibe la fecha local actual para
      // calcular la disponibilidad y el tránsito sin añadir un campo manual.
      shipDateStamp: requestedShipDate || mexicoBusinessDate(),
      pickupType: settings.pickup_type,
      packagingType: 'YOUR_PACKAGING',
      rateRequestType: resolveRateRequestTypes(settings.rate_request_types),
      rateDisplayOption: readEnum(
        settings.rate_display_option,
        ['LOWER_RATE', 'SELECTED_RATES_INCLUDING_F1R', 'SELECTED_RATES_EXCLUDING_F1R'],
        'SELECTED_RATES_EXCLUDING_F1R',
      ),
      totalPackageCount: packages.length,
      requestedPackageLineItems: packages.map((item, index) => ({
        sequenceNumber: index + 1,
        groupPackageCount: 1,
        weight: {
          units: item.packageType.weight_unit.toUpperCase(),
          value: round(Math.max(item.actualWeight, item.billableWeight), 3),
        },
        dimensions: {
          length: Math.max(1, Math.ceil(item.packageType.external_length ?? item.packageType.length ?? 0)),
          width: Math.max(1, Math.ceil(item.packageType.external_width ?? item.packageType.width ?? 0)),
          height: Math.max(1, Math.ceil(item.packageType.external_height ?? item.packageType.height ?? 0)),
          units: item.packageType.dimension_unit.toUpperCase(),
        },
      })),
    },
  };
}

function buildFedexConnectionProbe(
  accountNumber: string,
  origin: Record<string, unknown>,
  pickupType: string,
) {
  const address = fedexAddress(origin, false);
  return {
    accountNumber: { value: accountNumber },
    requestedShipment: {
      shipper: { address },
      recipient: { address },
      pickupType,
      packagingType: 'YOUR_PACKAGING',
      rateRequestType: ['ACCOUNT', 'LIST'],
      requestedPackageLineItems: [
        {
          weight: { units: 'KG', value: 1 },
          dimensions: { length: 10, width: 10, height: 10, units: 'CM' },
        },
      ],
    },
  };
}

function resolveRateRequestTypes(value: unknown) {
  const configured = Array.isArray(value) ? value.map((item) => readText(item)).filter(Boolean) : [];
  return [...new Set(['ACCOUNT', 'LIST', ...configured])] as string[];
}

function normalizeFedExRateResponse(payload: Record<string, unknown>): NormalizedRate[] {
  const output = isRecord(payload.output) ? payload.output : {};
  const details = Array.isArray(output.rateReplyDetails)
    ? output.rateReplyDetails
    : Array.isArray(payload.rateReplyDetails)
      ? payload.rateReplyDetails
      : [];

  return details
    .map((row): NormalizedRate | null => {
      if (!isRecord(row)) return null;
      const serviceCode = readText(row.serviceType) ?? 'UNKNOWN';
      const serviceName = readText(row.serviceName) ?? serviceCode;
      const shipmentDetails = Array.isArray(row.ratedShipmentDetails) ? row.ratedShipmentDetails : [];
      const accountRate = shipmentDetails.find((detail) =>
        isRecord(detail) && readText(detail.rateType)?.includes('ACCOUNT')
      ) ?? shipmentDetails[0] ?? null;
      if (!isRecord(accountRate)) return null;
      const rateDetail = isRecord(accountRate.shipmentRateDetail) ? accountRate.shipmentRateDetail : {};
      const totalNet =
        money(rateDetail.totalNetCharge) ??
        money(rateDetail.totalNetFedExCharge) ??
        money(accountRate.totalNetCharge) ??
        money(accountRate.totalNetFedExCharge) ??
        money(row.totalNetCharge) ??
        money(rateDetail.totalBaseCharge);
      if (!totalNet || totalNet.amount < 0) return null;
      const base = money(rateDetail.totalBaseCharge);
      const currency = totalNet.currency ?? base?.currency ?? readText(rateDetail.currency) ?? 'USD';
      const commit = isRecord(row.commit) ? row.commit : {};
      const dateDetail = isRecord(commit.dateDetail) ? commit.dateDetail : {};
      const deliveryTimestamp = readText(commit.commitTimestamp) ?? readText(dateDetail.dayFormat) ?? null;
      const estimatedDeliveryDate = readText(dateDetail.date) ?? readText(commit.date) ?? null;
      const transitDays = firstNumber(commit.transitDays, commit.estimatedTransitDays);
      const deliveryLabel =
        estimatedDeliveryDate ??
        (transitDays !== null ? `${Math.round(transitDays)} días` : 'Tiempo de entrega no disponible');

      return {
        carrier: 'FEDEX',
        serviceCode,
        serviceName,
        currency,
        baseAmount: base?.amount ?? null,
        discountAmount: sumMoneyArray(rateDetail.discounts),
        surchargeAmount: sumMoneyArray(rateDetail.surcharges),
        taxAmount: sumMoneyArray(rateDetail.taxes),
        totalAmount: totalNet.amount,
        transitDays: transitDays === null ? null : Math.round(transitDays),
        estimatedDeliveryDate,
        deliveryTimestamp,
        deliveryLabel,
        rateType: readText(accountRate.rateType),
        rawSummary: {
          serviceType: row.serviceType,
          serviceName: row.serviceName,
          rateType: accountRate.rateType,
          commit: row.commit ?? null,
        },
      };
    })
    .filter((row): row is NormalizedRate => Boolean(row))
    .sort((left, right) => left.totalAmount - right.totalAmount);
}

function preparePackages(value: unknown, weightInputMode: 'NET_CONTENT' | 'GROSS_PACKAGE') {
  if (!Array.isArray(value)) throw new Error('Agrega al menos un paquete.');
  const output: PreparedPackage[] = [];
  for (const draft of value) {
    if (!isRecord(draft)) continue;
    const quantity = Math.floor(Number(draft.quantity));
    const contentWeight = Number(draft.contentWeight);
    const length = Number(draft.length);
    const width = Number(draft.width);
    const height = Number(draft.height);
    const name = readText(draft.name) ?? `Paquete ${output.length + 1}`;
    const dimensionUnit = readEnum(draft.dimensionUnit, ['CM', 'IN'], 'CM');
    const weightUnit = readEnum(draft.weightUnit, ['KG', 'LB'], 'KG');
    if (![length, width, height].every((item) => Number.isFinite(item) && item > 0)) {
      throw new Error(`${name}: indica largo, ancho y alto válidos.`);
    }
    if (!Number.isFinite(quantity) || quantity < 1) throw new Error(`${name}: la cantidad debe ser mayor a cero.`);
    if (!Number.isFinite(contentWeight) || contentWeight <= 0) throw new Error(`${name}: indica un peso válido.`);
    const type: PackageType = {
      id: readText(draft.id) ?? crypto.randomUUID(),
      carrier: 'FEDEX',
      name,
      internal_code: 'PRODUCTO_ORDEN',
      description: null,
      length,
      width,
      height,
      internal_length: length,
      internal_width: width,
      internal_height: height,
      external_length: length,
      external_width: width,
      external_height: height,
      max_fill_percent: null,
      box_cost: null,
      dimension_unit: dimensionUnit,
      empty_weight: 0,
      weight_unit: weightUnit,
      max_weight: null,
      is_active: true,
      sort_order: output.length + 1,
      fedex_packaging_type: 'YOUR_PACKAGING',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const tare = weightInputMode === 'NET_CONTENT' ? Number(type.empty_weight) : 0;
    const actualWeight = round(contentWeight + tare, 3);
    const volumetricWeight = calculateVolumetricWeight(type);
    const billableWeight = round(Math.max(actualWeight, volumetricWeight), 3);
    for (let index = 0; index < quantity; index += 1) {
      output.push({
        packageType: type,
        packageTypeId: null,
        packageIndex: output.length + 1,
        contentWeight: round(contentWeight, 3),
        tareWeight: round(tare, 3),
        actualWeight,
        volumetricWeight,
        billableWeight,
      });
    }
  }
  if (!output.length) throw new Error('Agrega al menos un paquete válido.');
  return output;
}

function summarizePreparedPackages(packages: PreparedPackage[]) {
  return {
    contentWeight: round(packages.reduce((total, item) => total + item.contentWeight, 0), 3),
    tareWeight: round(packages.reduce((total, item) => total + item.tareWeight, 0), 3),
    billableWeight: round(packages.reduce((total, item) => total + item.billableWeight, 0), 3),
  };
}

function applyFinalPackagingAdjustments(packages: PreparedPackage[], settings: CarrierSettings) {
  const extraVolumetricWeight = calculateFinalPaddingVolumetricWeight(settings);
  if (!extraVolumetricWeight || !packages.length) return packages;
  const perPackageExtra = round(extraVolumetricWeight / packages.length, 3);
  let assigned = 0;
  return packages.map((item, index) => {
    const extra = index === packages.length - 1
      ? round(extraVolumetricWeight - assigned, 3)
      : perPackageExtra;
    assigned = round(assigned + extra, 3);
    return {
      ...item,
      billableWeight: round(item.billableWeight + extra, 3),
    };
  });
}

function calculateFinalPaddingVolumetricWeight(settings: CarrierSettings) {
  if (settings.final_volume_padding_enabled === false) return 0;
  const length = Number(settings.final_padding_length_cm);
  const width = Number(settings.final_padding_width_cm);
  const height = Number(settings.final_padding_height_cm);
  if (![length, width, height].every((value) => Number.isFinite(value) && value > 0)) return 0;
  return round((Math.ceil(length) * Math.ceil(width) * Math.ceil(height)) / 5000, 3);
}

function applyFinalPackagingCost(rates: NormalizedRate[], settings: CarrierSettings) {
  const packagingCost = settings.final_packaging_cost_enabled === false
    ? 0
    : Number(settings.final_packaging_material_cost);
  if (!Number.isFinite(packagingCost) || packagingCost <= 0) return rates;
  return rates.map((rate) => {
    if (rate.currency.toUpperCase() !== 'MXN') {
      return {
        ...rate,
        rawSummary: {
          ...rate.rawSummary,
          finalPackagingMaterialCostPendingMxn: packagingCost,
        },
      };
    }
    return {
      ...rate,
      surchargeAmount: round((rate.surchargeAmount ?? 0) + packagingCost, 2),
      totalAmount: round(rate.totalAmount + packagingCost, 2),
      rawSummary: {
        ...rate.rawSummary,
        finalPackagingMaterialCost: packagingCost,
      },
    };
  });
}

function calculateVolumetricWeight(type: Pick<PackageType, 'length' | 'width' | 'height' | 'external_length' | 'external_width' | 'external_height' | 'dimension_unit' | 'weight_unit'>) {
  const length = Number(type.external_length ?? type.length);
  const width = Number(type.external_width ?? type.width);
  const height = Number(type.external_height ?? type.height);
  if (![length, width, height].every((value) => Number.isFinite(value) && value > 0)) return 0;

  if (type.dimension_unit === 'CM' && type.weight_unit === 'KG') {
    return round((Math.ceil(length) * Math.ceil(width) * Math.ceil(height)) / 5000, 3);
  }

  if (type.dimension_unit === 'IN' && type.weight_unit === 'LB') {
    return round((Math.ceil(length) * Math.ceil(width) * Math.ceil(height)) / 139, 3);
  }

  if (type.dimension_unit === 'IN' && type.weight_unit === 'KG') {
    return round((Math.ceil(length) * Math.ceil(width) * Math.ceil(height)) / 305, 3);
  }

  const lengthIn = Math.ceil(length / 2.54);
  const widthIn = Math.ceil(width / 2.54);
  const heightIn = Math.ceil(height / 2.54);
  return round((lengthIn * widthIn * heightIn) / 139, 3);
}

function normalizeAddress(value: unknown, label: string) {
  const source = isRecord(value) ? value : {};
  const countryCode = requiredText(source.countryCode, `Indica el país de ${label}.`).toUpperCase();
  const postalCode = requiredText(source.postalCode, `Indica el código postal de ${label}.`);
  return {
    countryCode,
    postalCode,
    stateOrProvinceCode: readText(source.stateOrProvinceCode)?.toUpperCase() ?? null,
    city: readText(source.city),
    neighborhood: readText(source.neighborhood),
    street: readText(source.street),
  };
}

function detectPartnerPostalFields(meta: Record<string, unknown>) {
  const preferred = ['zip', 'cp', 'codigo_postal', 'postal_code', 'zip_code', 'x_cp', 'x_codigo_postal', 'l10n_mx_edi_zip'];
  return uniqueTexts([
    'zip',
    ...preferred.filter((field) => field in meta),
    ...Object.entries(meta)
      .filter(([field, descriptor]) => isRecord(descriptor) && ['char', 'text', 'integer'].includes(`${descriptor.type ?? ''}`) && /postal|codigo.*postal|(^|_)cp(_|$)/i.test(`${field} ${descriptor.string ?? ''}`))
      .map(([field]) => field),
  ]);
}

function buildPartnerFields(postalFields: string[]) {
  return uniqueTexts([
    'id',
    'name',
    'display_name',
    'type',
    'email',
    'phone',
    'zip',
    ...postalFields,
    'street',
    'city',
    'state_id',
    'country_id',
    'parent_id',
    'commercial_partner_id',
  ]);
}

function detectProductLogisticsFields(meta: Record<string, unknown>): ProductLogisticsFields {
  return {
    length: detectFieldNames(meta, ['length', 'product_length', 'x_length', 'x_length_cm', 'x_largo', 'x_studio_largo', 'largo', 'longitud']),
    width: detectFieldNames(meta, ['width', 'product_width', 'x_width', 'x_width_cm', 'x_ancho', 'x_studio_ancho', 'ancho']),
    height: detectFieldNames(meta, ['height', 'product_height', 'x_height', 'x_height_cm', 'x_alto', 'x_studio_alto', 'alto']),
  };
}

function detectProductReferenceFields(meta: Record<string, unknown>) {
  const preferred = [
    'legacy_code',
    'x_legacy_code',
    'x_codigo_legacy',
    'x_studio_codigo_legacy',
    'x_studio_referencia',
    'referencia',
    'reference',
    'default_code',
    'barcode',
  ].filter((field) => field in meta);
  const detected = Object.entries(meta)
    .filter(([field, descriptor]) => {
      if (!isRecord(descriptor) || !['char', 'text'].includes(`${descriptor.type ?? ''}`)) return false;
      const haystack = normalizeIdentifier(`${field} ${descriptor.string ?? ''}`);
      return haystack.includes('legacy') ||
        haystack.includes('referencia') ||
        haystack.includes('reference') ||
        haystack.includes('codigo_interno') ||
        haystack.includes('sku');
    })
    .map(([field]) => field);
  return uniqueTexts([...preferred, ...detected]);
}

function detectFieldNames(meta: Record<string, unknown>, preferred: string[]) {
  const preferredExisting = preferred.filter((field) => field in meta);
  const normalizedNeedles = preferred.map(normalizeIdentifier);
  const detected = Object.entries(meta)
    .filter(([field, descriptor]) => {
      if (!isRecord(descriptor) || !['float', 'integer', 'monetary'].includes(`${descriptor.type ?? ''}`)) return false;
      const haystack = normalizeIdentifier(`${field} ${descriptor.string ?? ''}`);
      return normalizedNeedles.some((needle) => haystack.includes(needle));
    })
    .map(([field]) => field);
  return uniqueTexts([...preferredExisting, ...detected]);
}

function buildProductFields(meta: Record<string, unknown>, logisticsFields: ProductLogisticsFields, referenceFields: string[]) {
  return uniqueTexts([
    'id',
    'name',
    'default_code',
    'barcode',
    'weight',
    'volume',
    'type',
    'detailed_type',
    'sale_ok',
    'categ_id',
    'product_tmpl_id',
    ...Object.values(logisticsFields).flat(),
    ...referenceFields,
  ].filter((field) => field in meta));
}

function buildTemplateFields(meta: Record<string, unknown>, logisticsFields: ProductLogisticsFields, referenceFields: string[]) {
  return uniqueTexts([
    'id',
    'name',
    'default_code',
    'barcode',
    'weight',
    'volume',
    'type',
    'detailed_type',
    'sale_ok',
    'categ_id',
    ...Object.values(logisticsFields).flat(),
    ...referenceFields,
  ].filter((field) => field in meta));
}

function resolveProductReferenceCandidates(
  product: Record<string, unknown>,
  template: Record<string, unknown>,
  fields: ProductReferenceFields,
) {
  return uniqueTexts([
    readText(product.default_code),
    readText(template.default_code),
    ...fields.product.map((field) => readText(product[field])),
    ...fields.template.map((field) => readText(template[field])),
    readText(product.barcode),
    readText(template.barcode),
  ].filter((value): value is string => Boolean(value)));
}

function isConsumableProduct(productType: string | null, productCategory: string | null) {
  const normalizedType = normalizeIdentifier(productType ?? '');
  const normalizedCategory = normalizeIdentifier(productCategory ?? '');
  return ['consu', 'consumable', 'consumible'].includes(normalizedType) || normalizedCategory === 'consumible';
}

function mergeMissingPartnerFields(primary: Record<string, unknown>, fallback: Record<string, unknown>) {
  const merged = { ...primary };
  for (const [field, value] of Object.entries(fallback)) {
    if (hasUsableValue(merged[field])) continue;
    if (hasUsableValue(value)) merged[field] = value;
  }
  return merged;
}

function uniquePartnerRows(rows: Record<string, unknown>[]) {
  const seen = new Set<number>();
  const output: Record<string, unknown>[] = [];
  for (const row of rows) {
    const id = Number(row.id);
    if (!Number.isFinite(id) || seen.has(id)) continue;
    seen.add(id);
    output.push(row);
  }
  return output;
}

function findMatchingDeliveryPartner(
  rows: Record<string, unknown>[],
  referencePartner: Record<string, unknown>,
  postalFields: string[],
) {
  const parentIds = uniqueNumbers([
    Number(referencePartner.id),
    many2oneId(referencePartner.parent_id),
    many2oneId(referencePartner.commercial_partner_id),
  ]);
  if (!parentIds.length) return null;
  const candidates = rows.filter((row) =>
    parentIds.includes(many2oneId(row.parent_id) ?? 0) &&
    (readText(row.type) ?? '').toLowerCase() === 'delivery' &&
    Boolean(firstPostalCodeFromPartner(row, postalFields))
  );
  return candidates.find((row) => partnerNamesAreCompatible(row, referencePartner)) ?? null;
}

function partnerNamesAreCompatible(candidate: Record<string, unknown>, reference: Record<string, unknown>) {
  const candidateKeys = partnerNameKeys(candidate);
  const referenceKeys = partnerNameKeys(reference);
  return candidateKeys.some((candidateKey) =>
    referenceKeys.some((referenceKey) =>
      candidateKey === referenceKey ||
      candidateKey.endsWith(referenceKey) ||
      referenceKey.endsWith(candidateKey)
    )
  );
}

function partnerNameKeys(row: Record<string, unknown>) {
  return uniqueTexts([
    readText(row.name),
    readText(row.display_name),
    ...splitPartnerName(readText(row.name)),
    ...splitPartnerName(readText(row.display_name)),
  ].map(normalizePartnerName).filter((value): value is string => Boolean(value)));
}

function splitPartnerName(value: string | null) {
  if (!value) return [];
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizePartnerName(value: string | null) {
  if (!value) return null;
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toLowerCase();
  return normalized || null;
}

function hasUsableValue(value: unknown) {
  if (value === null || value === undefined || value === false) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function firstNumberFromFields(row: Record<string, unknown>, fields: string[]) {
  for (const field of fields) {
    const value = firstNumber(row[field]);
    if (value) return value;
  }
  return null;
}

function firstPostalCodeFromPartner(row: Record<string, unknown>, postalFields: string[]) {
  for (const field of postalFields) {
    const text = readPostalCode(row[field]);
    if (text) return text;
  }
  return null;
}

function fedexAddress(value: Record<string, unknown>, residential: boolean) {
  const countryCode = readText(value.countryCode)?.toUpperCase() ?? null;
  const postalCode = normalizePostalCode(readText(value.postalCode), countryCode);
  const shouldSendLocality = countryCode === 'US' || countryCode === 'CA' || countryCode === 'PR';
  return {
    streetLines: shouldSendLocality && readText(value.street) ? [readText(value.street)] : undefined,
    city: shouldSendLocality ? readText(value.city) ?? undefined : undefined,
    stateOrProvinceCode: shouldSendLocality ? normalizeStateCode(readText(value.stateOrProvinceCode), countryCode) ?? undefined : undefined,
    postalCode,
    countryCode,
    residential,
  };
}

function normalizePostalCode(value: string | null, countryCode: string | null) {
  if (!value) return value;
  const normalized = countryCode === 'MX' ? value.replace(/\D/g, '').slice(0, 5) : value.replace(/\s+/g, '').toUpperCase();
  return normalized || value;
}

function normalizeStateCode(value: string | null, countryCode: string | null) {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  if ((countryCode === 'US' || countryCode === 'CA' || countryCode === 'PR') && normalized.length > 2) {
    return null;
  }
  return normalized;
}

function many2oneId(value: unknown) {
  if (Array.isArray(value) && value.length) {
    const parsed = Number(value[0]);
    return Number.isFinite(parsed) ? parsed : null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function many2oneLabel(value: unknown) {
  return Array.isArray(value) && value.length > 1 && typeof value[1] === 'string' && value[1].trim()
    ? value[1].trim()
    : null;
}

function readPostalCode(value: unknown) {
  const text = readText(value);
  if (text) return text;
  if (typeof value === 'number' && Number.isFinite(value)) return `${value}`;
  return null;
}

function resolveCountryCode(value: unknown, countryCodeById: Map<number, string | null>) {
  const byId = many2oneId(value);
  if (byId !== null) {
    const code = countryCodeById.get(byId);
    if (code) return code.toUpperCase();
  }
  const label = many2oneLabel(value);
  if (!label) return null;
  const code = label.match(/\(([A-Z]{2})\)$/)?.[1];
  return code ?? (label.length === 2 ? label.toUpperCase() : null);
}

function stateShortCode(value: unknown) {
  const label = many2oneLabel(value);
  if (!label) return null;
  const code = label.match(/\(([A-Z0-9]{2,4})\)$/)?.[1];
  return code ?? null;
}

function currencyLabel(value: unknown) {
  const label = many2oneLabel(value) ?? readText(value);
  if (!label) return null;
  const upper = label.toUpperCase();
  return upper.length <= 6 ? upper : label;
}

function packageSnapshot(type: PackageType) {
  return {
    id: type.id,
    name: type.name,
    internal_code: type.internal_code,
    length: type.length,
    width: type.width,
    height: type.height,
    internal_length: type.internal_length,
    internal_width: type.internal_width,
    internal_height: type.internal_height,
    external_length: type.external_length,
    external_width: type.external_width,
    external_height: type.external_height,
    dimension_unit: type.dimension_unit,
    empty_weight: type.empty_weight,
    weight_unit: type.weight_unit,
    max_weight: type.max_weight,
    fedex_packaging_type: type.fedex_packaging_type,
  };
}

async function assignEncryptedSecret(
  payload: Record<string, unknown>,
  field: 'account_number' | 'client_id' | 'client_secret' | 'child_key' | 'child_secret',
  value: unknown,
  currentEncrypted: string | null,
) {
  const text = readText(value);
  const encryptedKey = `${field}_encrypted`;
  const maskedKey = `${field}_masked`;
  if (!text) {
    if (currentEncrypted) return;
    payload[encryptedKey] = null;
    if (field !== 'client_secret' && field !== 'child_secret') payload[maskedKey] = null;
    return;
  }
  payload[encryptedKey] = await encryptSecret(text);
  if (field !== 'client_secret' && field !== 'child_secret') payload[maskedKey] = maskSecret(text);
}

async function encryptSecret(value: string) {
  const key = await getCryptoKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(value);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  return JSON.stringify({
    v: 1,
    iv: encodeBase64(iv),
    data: encodeBase64(new Uint8Array(encrypted)),
  });
}

async function decryptSecret(value: string | null) {
  if (!value) return null;
  const parsed = JSON.parse(value) as { iv?: string; data?: string };
  if (!parsed.iv || !parsed.data) return null;
  const key = await getCryptoKey();
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: decodeBase64(parsed.iv) },
    key,
    decodeBase64(parsed.data),
  );
  return new TextDecoder().decode(decrypted);
}

async function getCryptoKey() {
  const secret = Deno.env.get('SHIPPING_CREDENTIALS_KEY')?.trim();
  if (!secret || secret.length < 16) {
    throw new Error('Falta configurar SHIPPING_CREDENTIALS_KEY en los secretos de la Edge Function.');
  }
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function audit(
  adminClient: SupabaseClient,
  input: {
    actorId: string;
    actorEmail?: string | null;
    action: string;
    entityType: string;
    entityId: string;
    previousValue: unknown;
    newValue: unknown;
  },
) {
  const { error } = await adminClient.from('shipping_settings_audit').insert({
    actor_user_id: input.actorId,
    actor_email: input.actorEmail ?? null,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId,
    previous_value: input.previousValue,
    new_value: input.newValue,
  });
  if (error) console.error('[shipping-quote:audit]', sanitizeError(error));
}

function money(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return { amount: round(value, 2), currency: null };
  }
  if (!isRecord(value)) return null;
  const amount = Number(value.amount);
  if (!Number.isFinite(amount)) return null;
  return {
    amount: round(amount, 2),
    currency: readText(value.currency),
  };
}

function sumMoneyArray(value: unknown) {
  if (!Array.isArray(value)) return null;
  const total = value.reduce((sum, item) => {
    if (!isRecord(item)) return sum;
    const direct = money(item.amount) ?? money(item.surchargeAmount) ?? money(item.discountAmount) ?? money(item.taxAmount);
    return sum + (direct?.amount ?? 0);
  }, 0);
  return total > 0 ? round(total, 2) : null;
}

function normalizeShippingError(error: unknown, userMessage?: string) {
  if (error instanceof ShippingError) {
    if (!userMessage || userMessage === error.message) return error;
    return new ShippingError(userMessage, {
      status: error.status,
      code: error.code,
      retryable: error.retryable,
      providerStatus: error.providerStatus,
    });
  }

  const technicalMessage = sanitizeErrorText(error);
  const message = technicalMessage.toLowerCase();
  const fallbackMessage = userMessage ?? (error instanceof Error ? error.message : 'No se pudo completar la solicitud del Cotizador de Envíos.');

  if (message.includes('system.unavailable.exception') || message.includes('unable to process this request') || /\(503\)/.test(message)) {
    return new ShippingError(fallbackMessage, { status: 503, code: 'FEDEX_UNAVAILABLE', retryable: true, providerStatus: 503 });
  }
  if (/\(429\)/.test(message) || message.includes('too many requests')) {
    return new ShippingError(fallbackMessage, { status: 429, code: 'FEDEX_RATE_LIMITED', retryable: true, providerStatus: 429 });
  }
  if (/\((502|504)\)/.test(message) || message.includes('timeout') || message.includes('network') || message.includes('fetch failed')) {
    return new ShippingError(fallbackMessage, { status: 503, code: 'FEDEX_TEMPORARY_ERROR', retryable: true, providerStatus: extractProviderStatus(technicalMessage, [502, 504]) });
  }
  if (/\((401|403)\)/.test(message) || message.includes('forbidden.error') || message.includes('could not authorize your credentials') || message.includes('oauth') || message.includes('autentic')) {
    return new ShippingError(fallbackMessage, { status: 502, code: 'FEDEX_AUTH_ERROR', retryable: false, providerStatus: extractProviderStatus(technicalMessage, [401, 403]) });
  }
  if (/\(400\)/.test(message) || message.includes('service.packagecombination.invalid') || message.includes('postal') || message.includes('zip') || message.includes('weight') || message.includes('peso') || message.includes('dimension') || message.includes('no devolvió servicios disponibles')) {
    return new ShippingError(fallbackMessage, { status: 422, code: message.includes('no devolvió servicios disponibles') ? 'FEDEX_NO_RATES' : 'FEDEX_REQUEST_REJECTED', retryable: false, providerStatus: /\(400\)/.test(message) ? 400 : null });
  }
  if (message.includes('fedex')) {
    return new ShippingError(fallbackMessage, { status: 502, code: 'FEDEX_ERROR', retryable: false, providerStatus: extractProviderStatus(technicalMessage) });
  }
  return new ShippingError(fallbackMessage, { status: 500, code: 'INTERNAL_ERROR', retryable: false, providerStatus: null });
}

function extractProviderStatus(value: string, allowed?: number[]) {
  const match = value.match(/\((\d{3})\)/);
  if (!match) return null;
  const status = Number(match[1]);
  if (!Number.isFinite(status) || (allowed && !allowed.includes(status))) return null;
  return status;
}

function mapFedexError(error: unknown) {
  const technicalMessage = sanitizeErrorText(error);
  const message = technicalMessage.toLowerCase();
  if (message.includes('system.unavailable.exception') || message.includes('unable to process this request')) {
    const transactionId = extractFedexTransactionId(technicalMessage);
    return `FedEx Sandbox no pudo responder desde Rate API. Verifica que Account Number, Client ID y Client Secret sean las credenciales de prueba del mismo proyecto de FedEx que tiene habilitada Rate API.${transactionId ? ` Referencia FedEx: ${transactionId}.` : ''}`;
  }
  if (message.includes('service.packagecombination.invalid') || message.includes('combinación de servicio y embalaje')) {
    return 'FedEx rechazó la combinación de servicio y embalaje. Revisa que el envío use embalaje propio, dimensiones reales y que no combine servicios One Rate con varios bultos.';
  }
  if (message.includes('oauth') || message.includes('autentic') || message.includes('forbidden.error') || message.includes('could not authorize your credentials')) {
    return 'FedEx rechazó las credenciales para Rate API. Verifica que Account Number, Client ID y Client Secret sean del mismo proyecto y ambiente de FedEx.';
  }
  if (message.includes('postal') || message.includes('zip')) return 'FedEx no pudo validar el código postal. Revisa que origen y destino sean códigos postales mexicanos de 5 dígitos.';
  if (message.includes('weight') || message.includes('peso')) return 'FedEx rechazó el peso del paquete. Revisa peso, tara y máximo permitido.';
  if (message.includes('dimension')) return 'FedEx rechazó las dimensiones del paquete. Revisa largo, ancho y alto.';
  if (message.includes('no devolvió servicios disponibles')) {
    return 'FedEx respondió correctamente, pero no devolvió servicios disponibles para ese origen, destino y paquete. Revisa que la cuenta Sandbox tenga servicios nacionales México habilitados para esos códigos postales.';
  }
  if (message.includes('timeout') || message.includes('network') || message.includes('fetch')) return 'FedEx no respondió a tiempo. Intenta nuevamente en unos minutos.';
  const fedexDetail = extractFedexErrorMessage(technicalMessage);
  return fedexDetail
    ? `FedEx rechazó la cotización: ${fedexDetail}`
    : 'FedEx no pudo generar tarifas para esta combinación de origen, destino y embalajes. Revisa la configuración de la cuenta Sandbox/Producción y vuelve a calcular el embalaje.';
}

function extractFedexErrorMessage(value: string) {
  const payload = parseJsonObject(value.match(/\{[\s\S]*\}/)?.[0] ?? '');
  const errors = Array.isArray(payload?.errors) ? payload.errors : [];
  const details = errors
    .filter(isRecord)
    .map((item) => readText(item.message) ?? readText(item.code))
    .filter((item): item is string => Boolean(item));
  return details.length ? details.join(' ') : null;
}

function extractFedexTransactionId(value: string) {
  const payload = parseJsonObject(value.match(/\{[\s\S]*\}/)?.[0] ?? '');
  return readText(payload?.transactionId) ?? null;
}

function mexicoBusinessDate() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function safeFedexText(value: string) {
  return value
    .replace(/"access_token"\s*:\s*"[^"]+"/gi, '"access_token":"[oculto]"')
    .replace(/"client_secret"\s*:\s*"[^"]+"/gi, '"client_secret":"[oculto]"')
    .slice(0, 800);
}

function sanitizeError(error: unknown) {
  return sanitizeErrorText(error).slice(0, 1000);
}

function sanitizeErrorText(error: unknown) {
  return error instanceof Error ? safeFedexText(error.message) : safeFedexText(String(error));
}

function maskSecret(value: string) {
  const clean = value.trim();
  return clean.length <= 4 ? '••••' : `••••••••••${clean.slice(-4)}`;
}

function normalizeFedexAccountNumber(value: unknown) {
  const text = readText(value);
  if (!text) return null;
  const normalized = text.replace(/[\s-]+/g, '');
  if (!/^\d+$/.test(normalized)) {
    throw new Error('El Account Number de FedEx debe contener solo números. Quita espacios, guiones u otros caracteres.');
  }
  return normalized;
}

function encodeBase64(value: Uint8Array) {
  return btoa(String.fromCharCode(...value));
}

function decodeBase64(value: string) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

function readText(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function requiredText(value: unknown, message: string) {
  const text = readText(value);
  if (!text) throw new Error(message);
  return text;
}

function nullablePositive(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function nullableInteger(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function nullableNonNegative(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function requiredPositiveNumber(value: unknown, message: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(message);
  return parsed;
}

function readEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T) {
  const text = readText(value)?.toUpperCase();
  return allowed.includes(text as T) ? text as T : fallback;
}

function num(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function firstBoolean(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'boolean') return value;
  }
  return null;
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}

function parseProductDimensionsWorkbook(fileBase64: string) {
  const workbook = XLSX.read(decodeBase64(fileBase64), { type: 'array' });
  const sheetName = workbook.SheetNames.find((name) => workbook.Sheets[name]) ?? workbook.SheetNames[0];
  if (!sheetName) throw new Error('El archivo Excel no contiene hojas para importar.');
  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null, raw: true });
  const rows: ProductDimensionImportRow[] = [];
  const invalidRows: Array<{ row: number; reason: string }> = [];
  const bySku = new Map<string, ProductDimensionImportRow>();

  rawRows.forEach((raw, index) => {
    const sourceRow = index + 2;
    const normalized = normalizeWorkbookRow(raw);
    const sku = readText(normalized.equipo ?? normalized.sku ?? normalized.codigo ?? normalized.codigo_interno);
    const width = firstNumber(normalized.ancho, normalized.width, normalized.width_cm);
    const length = firstNumber(normalized.largo, normalized.length, normalized.length_cm);
    const height = firstNumber(normalized.alto, normalized.height, normalized.height_cm);
    const realWeight = firstNumber(normalized.peso_real, normalized.peso, normalized.weight, normalized.weight_kg);
    const volumetricWeight = firstNumber(normalized.peso_volumetrico, normalized.peso_volumetrico_kg, normalized.volumetric_weight);
    const roundedWeight = firstNumber(normalized.redondeo, normalized.peso_redondeado);
    const billableWeight = roundedWeight ?? maxPositive(realWeight, volumetricWeight);
    const productName = readText(normalized.descripcion ?? normalized.description ?? normalized.nombre ?? normalized.producto);

    if (!sku) {
      invalidRows.push({ row: sourceRow, reason: 'Falta Equipo/SKU.' });
      return;
    }
    if (!width || !length || !height) {
      invalidRows.push({ row: sourceRow, reason: 'Faltan dimensiones válidas.' });
      return;
    }
    if (!billableWeight && !realWeight && !volumetricWeight) {
      invalidRows.push({ row: sourceRow, reason: 'Falta peso real o peso volumétrico.' });
      return;
    }

    const row: ProductDimensionImportRow = {
      sku: sku.toUpperCase(),
      product_name: productName,
      width_cm: round(width, 2),
      length_cm: round(length, 2),
      height_cm: round(height, 2),
      unit_weight_kg: realWeight ? round(realWeight, 3) : null,
      volumetric_weight_kg: volumetricWeight ? round(volumetricWeight, 3) : null,
      billable_weight_kg: billableWeight ? round(billableWeight, 3) : null,
      source_row: sourceRow,
    };
    bySku.set(normalizeSku(row.sku), row);
  });

  rows.push(...bySku.values());
  if (!rows.length) {
    throw new Error('No se encontraron productos válidos en el Excel. Verifica columnas Equipo, Ancho, Largo, Alto y Peso.');
  }
  return { rows, invalidRows };
}

function normalizeWorkbookRow(raw: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [normalizeIdentifier(key), value]),
  ) as Record<string, unknown>;
}

function normalizeProductDimensionImportRow(value: unknown): ProductDimensionImportRow | null {
  if (!isRecord(value)) return null;
  const sku = readText(value.sku);
  const width = firstNumber(value.width_cm);
  const length = firstNumber(value.length_cm);
  const height = firstNumber(value.height_cm);
  const billableWeight = firstNumber(value.billable_weight_kg, value.unit_weight_kg, value.volumetric_weight_kg);
  if (!sku || !width || !length || !height || !billableWeight) return null;
  return {
    sku: sku.toUpperCase(),
    product_name: readText(value.product_name),
    width_cm: round(width, 2),
    length_cm: round(length, 2),
    height_cm: round(height, 2),
    unit_weight_kg: firstNumber(value.unit_weight_kg) ? round(firstNumber(value.unit_weight_kg) as number, 3) : null,
    volumetric_weight_kg: firstNumber(value.volumetric_weight_kg) ? round(firstNumber(value.volumetric_weight_kg) as number, 3) : null,
    billable_weight_kg: round(billableWeight, 3),
    source_row: Math.max(1, Number(value.source_row) || 1),
  };
}

function productDimensionChanged(existing: Record<string, unknown>, incoming: ProductDimensionImportRow) {
  return normalizeComparableText(existing.product_name) !== normalizeComparableText(incoming.product_name) ||
    compareNumber(existing.width_cm, incoming.width_cm, 2) ||
    compareNumber(existing.length_cm, incoming.length_cm, 2) ||
    compareNumber(existing.height_cm, incoming.height_cm, 2) ||
    compareNumber(existing.unit_weight_kg, incoming.unit_weight_kg, 3) ||
    compareNumber(existing.volumetric_weight_kg, incoming.volumetric_weight_kg, 3) ||
    compareNumber(existing.billable_weight_kg, incoming.billable_weight_kg, 3);
}

function compareNumber(left: unknown, right: unknown, decimals: number) {
  const leftNumber = firstNumber(left);
  const rightNumber = firstNumber(right);
  if (!leftNumber && !rightNumber) return false;
  return round(leftNumber ?? 0, decimals) !== round(rightNumber ?? 0, decimals);
}

function maxPositive(...values: Array<number | null>) {
  const positives = values.filter((value): value is number => Number.isFinite(value ?? NaN) && (value ?? 0) > 0);
  return positives.length ? Math.max(...positives) : null;
}

function normalizeSku(value: string) {
  return value.trim().replace(/\s+/g, '').toUpperCase();
}

function normalizeComparableText(value: unknown) {
  return readText(value)?.trim().toUpperCase() ?? null;
}

function uniqueNumbers(values: Array<number | null>) {
  return [...new Set(values.filter((value): value is number => Number.isFinite(value ?? NaN)))];
}

function uniqueTexts(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function normalizeIdentifier(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function trimSlash(value: string) {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function normalizeFedexBaseUrl(value: string, environment: 'SANDBOX' | 'PRODUCTION') {
  const fallback = environment === 'PRODUCTION' ? 'https://apis.fedex.com' : 'https://apis-sandbox.fedex.com';
  const normalized = trimSlash((value || fallback).trim());
  if (!/^https:\/\/apis(-sandbox)?\.fedex\.com$/i.test(normalized)) {
    throw new Error('La URL de FedEx debe ser https://apis-sandbox.fedex.com o https://apis.fedex.com.');
  }
  return normalized;
}

function round(value: number, decimals: number) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function escapeLike(value: string) {
  return value.replace(/[%_]/g, (match) => `\\${match}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
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
