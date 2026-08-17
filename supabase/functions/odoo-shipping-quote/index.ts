import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  assertOdooEnvironment,
  authenticateWithDatabaseCandidates as connectOdooReadOnly,
  fieldsGet as getOdooFields,
  readOdooEnvironment,
  searchReadAll as searchReadOdoo,
} from '../_shared/odoo-readonly.ts';
import {
  buildShippingPackages,
  normalizeManualPackages,
  transformPackagesToFedexLineItems,
  validateManualPackages,
  type FinalPackage,
  type PackingLine,
  type ProductShippingProfile,
  type ShippingBox,
  type ShippingMode,
} from './packing.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const DEFAULT_FEDEX_BASE_URL = 'https://apis.fedex.com';
const DEFAULT_RATE_REQUEST_TYPES = ['ACCOUNT'];
const DEFAULT_PACKAGING_TYPE = 'YOUR_PACKAGING';

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
    const odoo = readOdooEnvironment();
    const odooApiKey = odoo.apiKey;
    let odooUrl = odoo.url;

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse({ error: 'Faltan variables de entorno de Supabase.' }, 500);
    }

    assertOdooEnvironment(odoo);

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
      return jsonResponse({ error: 'Sesion no valida.' }, 401);
    }

    stage = 'permissions';
    const access = await getQuotingAccess(adminClient, caller.id);
    if (!access.canAccess) {
      return jsonResponse({ error: 'No tienes permisos para usar el cotizador.' }, 403);
    }

    stage = 'payload';
    const body = await req.json();
    const quoteNumber = String(body.quoteNumber ?? '').trim();
    const manualPackages = Array.isArray(body.packages) ? body.packages as FinalPackage[] : null;
    if (!quoteNumber) {
      return jsonResponse({ error: 'Debes indicar un numero de cotizacion.' }, 400);
    }

    stage = 'settings';
    const { data: settings, error: settingsError } = await adminClient
      .from('shipping_quote_settings')
      .select('*')
      .eq('provider', 'fedex')
      .maybeSingle();

    if (settingsError) throw settingsError;
    if (!settings?.is_active) {
      return jsonResponse({ error: 'El cotizador no esta activo en Ajustes > Cotizador.' }, 400);
    }

    const fedexConfig = {
      baseUrl: trimSlash(readText(settings.fedex_base_url) ?? DEFAULT_FEDEX_BASE_URL),
      originPostalCode: readText(settings.fedex_origin_postal_code) ?? '',
      clientId: readText(settings.fedex_client_id) ?? '',
      clientSecret: readText(settings.fedex_client_secret) ?? '',
      accountNumber: readText(settings.fedex_account_number) ?? '',
      childKey: readText(settings.fedex_child_key) ?? '',
      childSecret: readText(settings.fedex_child_secret) ?? '',
    };

    if (
      !fedexConfig.originPostalCode ||
      !fedexConfig.clientId ||
      !fedexConfig.clientSecret ||
      !fedexConfig.accountNumber
    ) {
      return jsonResponse(
        {
          error:
            'Faltan FEDEX_ORIGIN_POSTAL_CODE, Client ID, Client Secret o Account Number en Ajustes > Configuracion del cotizador.',
        },
        400,
      );
    }

    stage = 'odoo.auth';
    const connection = await connectOdooReadOnly({
      apiKey: odoo.apiKey,
      configuredDatabase: odoo.database,
      odooUrl: odoo.url,
      user: odoo.user,
    });
    const { database, uid } = connection;
    odooUrl = connection.odooUrl;

    stage = 'odoo.metadata';
    const partnerMeta = await getOdooFields({ apiKey: odoo.apiKey, database, model: 'res.partner', odooUrl, uid });
    const partnerPostalFields = detectPartnerPostalFields(partnerMeta);

    stage = 'odoo.order';
    const [order] = await searchReadOdoo({
      apiKey: odooApiKey,
      database,
      domain: [['name', '=', quoteNumber]],
      fields: [
        'id',
        'name',
        'state',
        'partner_id',
        'partner_shipping_id',
        'partner_invoice_id',
        'company_id',
        'currency_id',
        'amount_untaxed',
        'amount_total',
      ],
      model: 'sale.order',
      odooUrl,
      order: 'id desc',
      uid,
    });

    if (!order?.id) {
      return jsonResponse({ error: `No se encontro la cotizacion ${quoteNumber} en Odoo.` }, 404);
    }

    const orderId = Number(order.id);
    const shippingPartnerId =
      many2oneId(order.partner_shipping_id) ??
      many2oneId(order.partner_invoice_id) ??
      many2oneId(order.partner_id);
    const preferredCustomerPartnerIds = uniqueNumbers([
      many2oneId(order.partner_shipping_id),
      many2oneId(order.partner_invoice_id),
      many2oneId(order.partner_id),
    ]);
    const companyId = many2oneId(order.company_id);

    if (!shippingPartnerId) {
      return jsonResponse({ error: 'La cotizacion no tiene cliente de envio asociado en Odoo.' }, 400);
    }
    if (!companyId) {
      return jsonResponse({ error: 'La cotizacion no tiene compania asociada en Odoo.' }, 400);
    }

    stage = 'odoo.partner';
    const customerPartnerIds = uniqueNumbers([
      shippingPartnerId,
      many2oneId(order.partner_invoice_id),
      many2oneId(order.partner_id),
    ]);
    const [customerPartners, company, orderLines] = await Promise.all([
      searchReadOdoo({
        apiKey: odooApiKey,
        database,
        domain: [['id', 'in', customerPartnerIds]],
        fields: buildPartnerFields(partnerPostalFields),
        model: 'res.partner',
        odooUrl,
        uid,
      }),
      searchReadOdoo({
        apiKey: odooApiKey,
        database,
        domain: [['id', '=', companyId]],
        fields: ['id', 'name', 'partner_id'],
        model: 'res.company',
        odooUrl,
        uid,
      }).then((rows) => rows[0] ?? null),
      searchReadOdoo({
        apiKey: odooApiKey,
        database,
        domain: [['order_id', '=', orderId]],
        fields: ['id', 'name', 'product_id', 'product_uom_qty', 'price_subtotal', 'price_total'],
        model: 'sale.order.line',
        odooUrl,
        order: 'id asc',
        uid,
      }),
    ]);

    const relatedCustomerPartnerIds = uniqueNumbers(
      customerPartners.flatMap((partner) => [
        many2oneId(partner.parent_id),
        many2oneId(partner.commercial_partner_id),
      ]),
    ).filter((partnerId) => !customerPartnerIds.includes(partnerId));

    const relatedCustomerPartners = relatedCustomerPartnerIds.length
      ? await searchReadOdoo({
          apiKey: odooApiKey,
          database,
          domain: [['id', 'in', relatedCustomerPartnerIds]],
          fields: buildPartnerFields(partnerPostalFields),
          model: 'res.partner',
          odooUrl,
          uid,
        })
      : [];

    const customer = mergePartnerRecords(
      [...customerPartners, ...relatedCustomerPartners],
      preferredCustomerPartnerIds,
      partnerPostalFields,
    );

    if (!customer?.id) {
      return jsonResponse({ error: 'No se pudo leer la direccion del cliente en Odoo.' }, 400);
    }
    const originPartnerId = many2oneId(company?.partner_id);
    if (!originPartnerId) {
      return jsonResponse({ error: 'No se pudo leer la compania origen en Odoo.' }, 400);
    }

    stage = 'odoo.origin';
    const originPartnerRows = await searchReadOdoo({
      apiKey: odooApiKey,
      database,
      domain: [['id', '=', originPartnerId]],
      fields: buildPartnerFields(partnerPostalFields),
      model: 'res.partner',
      odooUrl,
      uid,
    });
    const relatedOriginPartnerIds = uniqueNumbers(
      originPartnerRows.flatMap((partner) => [
        many2oneId(partner.parent_id),
        many2oneId(partner.commercial_partner_id),
      ]),
    ).filter((partnerId) => partnerId !== originPartnerId);
    const relatedOriginPartners = relatedOriginPartnerIds.length
        ? await searchReadOdoo({
          apiKey: odooApiKey,
          database,
          domain: [['id', 'in', relatedOriginPartnerIds]],
        fields: buildPartnerFields(partnerPostalFields),
          model: 'res.partner',
          odooUrl,
          uid,
        })
      : [];
    const originPartner = mergePartnerRecords(
      [...originPartnerRows, ...relatedOriginPartners],
      [originPartnerId],
      partnerPostalFields,
    );

    if (!originPartner?.id) {
      return jsonResponse({ error: 'No se pudo leer la direccion origen de la compania en Odoo.' }, 400);
    }

    const countryIds = uniqueNumbers([
      many2oneId(customer.country_id),
      many2oneId(originPartner.country_id),
    ]);
    const countryRows = countryIds.length
        ? await searchReadOdoo({
          apiKey: odooApiKey,
          database,
          domain: [['id', 'in', countryIds]],
          fields: ['id', 'code', 'name'],
          model: 'res.country',
          odooUrl,
          uid,
        })
      : [];
    const countryCodeById = new Map(
      countryRows.map((row) => [Number(row.id), readText(row.code) ?? readText(row.name) ?? null]),
    );

    const customerPostalCode = readPostalCode(customer.postalCode);
    const customerCountryCode = resolveCountryCode(customer.country_id, countryCodeById);
    const originPostalCode = fedexConfig.originPostalCode;
    const originCountryCode = resolveCountryCode(originPartner.country_id, countryCodeById);
    if (!customerPostalCode || !customerCountryCode) {
      return jsonResponse({ error: 'El cliente destino no tiene codigo postal o pais completos en Odoo.' }, 400);
    }
    if (!originPostalCode || !originCountryCode) {
      return jsonResponse({ error: 'La compania origen no tiene codigo postal o pais completos en Odoo.' }, 400);
    }

    stage = 'odoo.products';
    const productIds = uniqueNumbers(
      orderLines.map((line) => many2oneId(line.product_id)).filter((value) => value !== null),
    );
    const productFields = buildProductFields();
    const productRows = productIds.length
        ? await searchReadOdoo({
          apiKey: odooApiKey,
          database,
          domain: [['id', 'in', productIds]],
          fields: productFields,
          model: 'product.product',
          odooUrl,
          uid,
        })
      : [];
    const productMap = new Map(productRows.map((row) => [Number(row.id), row]));

    const productTemplateIds = uniqueNumbers(
      productRows.map((row) => many2oneId(row.product_tmpl_id)).filter((value) => value !== null),
    );
    const productTemplateRows = productTemplateIds.length
        ? await searchReadOdoo({
          apiKey: odooApiKey,
          database,
          domain: [['id', 'in', productTemplateIds]],
          fields: buildProductTemplateFields(),
          model: 'product.template',
          odooUrl,
          uid,
        })
      : [];
    const productTemplateMap = new Map(productTemplateRows.map((row) => [Number(row.id), row]));
    const [profileResult, boxResult] = await Promise.all([
      adminClient
        .from('shipping_product_profiles')
        .select('*')
        .in('odoo_product_id', productIds),
      adminClient
        .from('shipping_boxes')
        .select('*')
        .eq('enabled', true)
        .order('outer_length_cm', { ascending: true }),
    ]);

    if (profileResult.error) throw profileResult.error;
    if (boxResult.error) throw boxResult.error;

    const profileMap = new Map(
      ((profileResult.data ?? []) as Record<string, unknown>[]).map((row) => [Number(row.odoo_product_id), row]),
    );
    const shippingBoxes = ((boxResult.data ?? []) as Record<string, unknown>[]).map(normalizeShippingBox);

    const warnings: string[] = [];
    const missingConfiguration: string[] = [];
    const enrichedLines = orderLines
      .map((line) => {
        const productId = many2oneId(line.product_id);
        const product = productMap.get(productId ?? -1) ?? null;
        const productTemplateId = many2oneId(product?.product_tmpl_id);
        const productTemplate = productTemplateId ? productTemplateMap.get(productTemplateId) ?? null : null;
        const profile = resolveProductShippingProfile({
          line,
          product,
          productTemplate,
          savedProfile: productId ? profileMap.get(productId) ?? null : null,
        });
        const lineSummary = summarizeOrderLine({
          line,
          product,
          productTemplate,
          profile,
          warnings,
        });
        const packingLine = lineSummary
          ? buildPackingLineFromSummary(lineSummary, profile)
          : null;

        collectMissingProfileConfiguration(profile, lineSummary?.productName ?? many2oneLabel(line.product_id), missingConfiguration);
        return { lineSummary, packingLine };
      });
    const lineSummaries = enrichedLines
      .map((row) => row.lineSummary)
      .filter(Boolean);
    const packingLines = enrichedLines
      .map((row) => row.packingLine)
      .filter(Boolean) as PackingLine[];

    if (!lineSummaries.length) {
      return jsonResponse({ error: 'La cotizacion no tiene lineas de producto validas.' }, 400);
    }

    if (missingConfiguration.length) {
      return jsonResponse(
        {
          error: 'No es posible cotizar el envio. Hay productos sin informacion logistica completa.',
          missingConfiguration: uniqueTexts(missingConfiguration),
        },
        400,
      );
    }

    const packingStarted = Date.now();
    const packingResult = manualPackages
      ? {
          packages: normalizeManualPackages(manualPackages),
          warnings: [] as string[],
          errors: [] as string[],
          signature: 'manual',
        }
      : buildShippingPackages(packingLines, shippingBoxes);
    const packingMs = Date.now() - packingStarted;
    console.log('[odoo-shipping-quote:packing]', {
      quoteNumber,
      lines: packingLines.length,
      packages: packingResult.packages.length,
      warnings: packingResult.warnings.length,
      errors: packingResult.errors.length,
      packingMs,
    });

    if (manualPackages) {
      packingResult.errors.push(...validateManualPackages(packingResult.packages));
      packingResult.errors.push(...validatePackageQuantities(packingResult.packages, packingLines));
    }

    if (packingResult.errors.length) {
      return jsonResponse(
        {
          error: 'No es posible cotizar el envio con el empaque actual.',
          packingErrors: uniqueTexts(packingResult.errors),
          packages: packingResult.packages,
        },
        400,
      );
    }

    const packageLineItems = transformPackagesToFedexLineItems(packingResult.packages);
    if (!packageLineItems.length) {
      return jsonResponse({
        error:
          'No fue posible construir paquetes para FedEx. Revisa que los productos tengan peso o volumen en Odoo.',
      }, 400);
    }

    stage = 'fedex.token';
    const token = await getFedexAccessToken(fedexConfig);

    stage = 'fedex.rate';
    const fedexStarted = Date.now();
    const fedexPayload = await fetchFedexRates({
      fedexConfig,
      customer,
      customerCountryCode,
      originPartner,
      originCountryCode,
      packageLineItems,
      token,
    });
    console.log('[odoo-shipping-quote:fedex.rate]', {
      quoteNumber,
      packages: packageLineItems.length,
      responseMs: Date.now() - fedexStarted,
    });

    const rates = normalizeFedexRates(fedexPayload);
    if (!rates.length) {
      warnings.push('FedEx no devolvio tarifas para esta combinacion de origen, destino y peso.');
    }

    return jsonResponse({
      fetchedAt: new Date().toISOString(),
      quoteNumber,
      orderName: readText(order.name) ?? quoteNumber,
      orderState: readText(order.state) ?? 'draft',
      currencyCode: currencyLabel(order.currency_id),
      amountUntaxed: num(order.amount_untaxed),
      amountTotal: num(order.amount_total),
      customer: {
        name: readText(customer.name) ?? 'Cliente sin nombre',
        email: readText(customer.email),
        phone: readText(customer.phone),
        postalCode: customerPostalCode,
        city: readText(customer.city),
        stateCode: stateShortCode(customer.state_id) ?? many2oneLabel(customer.state_id),
        countryCode: customerCountryCode,
        street: readText(customer.street),
      },
      summary: {
        lineCount: lineSummaries.length,
        packageCount: packageLineItems.length,
        totalQuantity: round(sum(lineSummaries.map((line) => line.quantity))),
        actualWeight: round(sum(packingResult.packages.map((item) => item.actualWeightKg))),
        volumetricWeight: round(sum(packingResult.packages.map((item) => item.dimensionalWeightKg))),
        billableWeight: round(sum(packingResult.packages.map((item) => item.estimatedBillableWeightKg))),
      },
      lines: lineSummaries,
      packages: packingResult.packages,
      packageSignature: packingResult.signature,
      rates,
      warnings: uniqueTexts([...warnings, ...packingResult.warnings]),
    });
  } catch (error) {
    console.error('[odoo-shipping-quote]', { stage, error });
    const message =
      error instanceof Error ? error.message : 'No se pudo calcular el envio desde Odoo y FedEx.';
    return jsonResponse({ error: `[odoo-shipping-quote:${stage}] ${message}` }, 500);
  }
});

async function getQuotingAccess(
  adminClient: ReturnType<typeof createClient>,
  userId: string,
) {
  const { data: summary, error: summaryError } = await adminClient
    .from('admin_module_permissions')
    .select('role, is_active')
    .eq('user_id', userId)
    .maybeSingle();

  if (summaryError) throw summaryError;
  if (summary?.role === 'owner' && summary?.is_active !== false) {
    return { canAccess: true };
  }

  const { data, error } = await adminClient
    .from('admin_module_permission_items')
    .select('can_access')
    .eq('user_id', userId)
    .eq('module_key', 'quoting')
    .maybeSingle();

  if (error) throw error;
  return { canAccess: Boolean(data?.can_access) };
}

function detectPartnerPostalFields(meta: Record<string, unknown>) {
  const preferredNames = [
    'zip',
    'cp',
    'codigo_postal',
    'codigo_postal_cliente',
    'postal_code',
    'zip_code',
    'x_cp',
    'x_codigo_postal',
    'l10n_mx_edi_zip',
  ];

  const fields = preferredNames.filter((fieldName) => isPostalFieldDescriptor(meta[fieldName]));
  const detectedFields = Object.entries(meta).filter(([fieldName, descriptor]) => {
    if (!isPostalFieldDescriptor(descriptor)) return false;
    const normalizedName = normalizeSearchText(fieldName);
    const normalizedLabel = normalizeSearchText(
      isRecord(descriptor) && typeof descriptor.string === 'string' ? descriptor.string : '',
    );
    return (
      normalizedName.includes('postal') ||
      normalizedName.includes('codigo_postal') ||
      normalizedName === 'cp' ||
      normalizedName.startsWith('cp_') ||
      normalizedLabel.includes('codigo postal') ||
      normalizedLabel === 'cp' ||
      normalizedLabel === 'c_p' ||
      normalizedLabel.includes('c p')
    );
  }).map(([fieldName]) => fieldName);

  return uniq(['zip', ...fields, ...detectedFields]);
}

function isPostalFieldDescriptor(descriptor: unknown) {
  return (
    isRecord(descriptor) &&
    ['char', 'text', 'integer'].includes(`${descriptor.type ?? ''}`)
  );
}

function buildPartnerFields(postalFields: string[]) {
  return uniq([
    'id',
    'name',
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

function normalizeSearchText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function buildProductFields() {
  return ['id', 'name', 'default_code', 'barcode', 'weight', 'volume', 'product_tmpl_id'];
}

function buildProductTemplateFields() {
  return ['id', 'name', 'default_code', 'barcode', 'weight', 'volume'];
}

function summarizeOrderLine({
  line,
  product,
  productTemplate,
  profile,
  warnings,
}: {
  line: Record<string, unknown>;
  product: Record<string, unknown> | null;
  productTemplate: Record<string, unknown> | null;
  profile: ProductShippingProfile;
  warnings: string[];
}) {
  const quantity = num(line.product_uom_qty);
  if (quantity <= 0) {
    return null;
  }

  // The Inventory > Weight value is the volumetric weight already calculated
  // for the product using (height * length * width) / 5000.
  const unitVolumetricWeight = firstNumber(product?.weight, productTemplate?.weight, profile.unitWeightKg) ?? 0;

  if (!unitVolumetricWeight) {
    warnings.push(
      `El producto ${many2oneLabel(line.product_id) ?? readText(line.name) ?? 'sin nombre'} no tiene peso en Inventario en Odoo.`,
    );
  }

  const totalVolumetricWeight = round(unitVolumetricWeight * quantity);

  return {
    lineId: Number(line.id),
    description: readText(line.name) ?? '',
    productName: many2oneLabel(line.product_id) ?? readText(line.name) ?? 'Producto sin nombre',
    quantity,
    unitWeight: profile.unitWeightKg || unitVolumetricWeight || null,
    totalWeight: round((profile.unitWeightKg || unitVolumetricWeight) * quantity),
    length: profile.lengthCm || null,
    width: profile.widthCm || null,
    height: profile.heightCm || null,
    unitVolumetricWeight,
    totalVolumetricWeight,
    billableWeight: totalVolumetricWeight,
    untaxedAmount: num(line.price_subtotal),
    totalAmount: num(line.price_total),
  };
}

function resolveProductShippingProfile({
  line,
  product,
  productTemplate,
  savedProfile,
}: {
  line: Record<string, unknown>;
  product: Record<string, unknown> | null;
  productTemplate: Record<string, unknown> | null;
  savedProfile: Record<string, unknown> | null;
}): ProductShippingProfile {
  const productId = `${many2oneId(line.product_id) ?? readText(savedProfile?.product_id) ?? ''}`;
  const productName =
    readText(savedProfile?.product_name) ??
    many2oneLabel(line.product_id) ??
    readText(product?.name) ??
    readText(productTemplate?.name) ??
    readText(line.name) ??
    'Producto sin nombre';
  const sku =
    readText(savedProfile?.sku) ??
    readText(product?.default_code) ??
    readText(productTemplate?.default_code) ??
    readText(product?.barcode) ??
    productId;
  const shippingMode = normalizeShippingMode(savedProfile?.shipping_mode) ?? inferShippingMode(productName);
  const unitWeightKg = firstNumber(savedProfile?.unit_weight_kg, product?.weight, productTemplate?.weight) ?? 0;

  return {
    productId,
    sku,
    productName,
    unitWeightKg,
    lengthCm: num(savedProfile?.length_cm),
    widthCm: num(savedProfile?.width_cm),
    heightCm: num(savedProfile?.height_cm),
    shippingMode,
    packedWeightKg: firstNumber(savedProfile?.packed_weight_kg),
    packedLengthCm: firstNumber(savedProfile?.packed_length_cm),
    packedWidthCm: firstNumber(savedProfile?.packed_width_cm),
    packedHeightCm: firstNumber(savedProfile?.packed_height_cm),
    unitsPerMasterCarton: firstNumber(savedProfile?.units_per_master_carton),
    canRotate: savedProfile?.can_rotate !== false,
    stackable: savedProfile?.stackable !== false,
    fragile: savedProfile?.fragile === true,
    canCombine: savedProfile?.can_combine !== false && shippingMode === 'LOOSE_ITEM',
    productFamily: readText(savedProfile?.product_family),
    packagingGroup: readText(savedProfile?.packaging_group),
    maxUnitsPerPackage: firstNumber(savedProfile?.max_units_per_package),
  };
}

function buildPackingLineFromSummary(
  line: NonNullable<ReturnType<typeof summarizeOrderLine>>,
  profile: ProductShippingProfile,
): PackingLine {
  return {
    lineId: line.lineId,
    productId: profile.productId,
    sku: profile.sku,
    productName: line.productName,
    description: line.description,
    quantity: line.quantity,
    profile,
  };
}

function collectMissingProfileConfiguration(
  profile: ProductShippingProfile,
  fallbackName: string | null | undefined,
  output: string[],
) {
  const label = `${profile.sku || profile.productId || 'SIN-SKU'} - ${profile.productName || fallbackName || 'Producto sin nombre'}`;
  if (!profile.productId) output.push(`${label}: no se pudo identificar el producto de Odoo.`);
  if (!firstNumber(profile.unitWeightKg)) output.push(`${label}: falta peso unitario.`);
  if (!firstNumber(profile.lengthCm) || !firstNumber(profile.widthCm) || !firstNumber(profile.heightCm)) {
    output.push(`${label}: faltan dimensiones unitarias.`);
  }
  if (profile.shippingMode === 'FACTORY_PACKAGE' || profile.shippingMode === 'SHIP_SEPARATELY') {
    if (!firstNumber(profile.packedWeightKg, profile.unitWeightKg)) output.push(`${label}: falta peso empacado.`);
    if (
      !firstNumber(profile.packedLengthCm, profile.lengthCm) ||
      !firstNumber(profile.packedWidthCm, profile.widthCm) ||
      !firstNumber(profile.packedHeightCm, profile.heightCm)
    ) {
      output.push(`${label}: faltan dimensiones empacadas.`);
    }
  }
}

function normalizeShippingBox(row: Record<string, unknown>): ShippingBox {
  return {
    id: String(row.id),
    name: readText(row.name) ?? 'Caja sin nombre',
    innerLengthCm: num(row.inner_length_cm),
    innerWidthCm: num(row.inner_width_cm),
    innerHeightCm: num(row.inner_height_cm),
    outerLengthCm: num(row.outer_length_cm),
    outerWidthCm: num(row.outer_width_cm),
    outerHeightCm: num(row.outer_height_cm),
    emptyWeightKg: num(row.empty_weight_kg),
    paddingWeightKg: num(row.padding_weight_kg),
    maxWeightKg: num(row.max_weight_kg),
    enabled: row.enabled !== false,
  };
}

function normalizeShippingMode(value: unknown): ShippingMode | null {
  const raw = readText(value)?.toUpperCase();
  if (
    raw === 'FACTORY_PACKAGE' ||
    raw === 'LOOSE_ITEM' ||
    raw === 'MASTER_CARTON' ||
    raw === 'SHIP_SEPARATELY'
  ) {
    return raw;
  }
  return null;
}

function inferShippingMode(productName: string): ShippingMode {
  const normalized = normalizeSearchText(productName);
  if (
    normalized.includes('impresora') ||
    normalized.includes('printer') ||
    normalized.includes('bascula') ||
    normalized.includes('equipo')
  ) {
    return 'FACTORY_PACKAGE';
  }
  return 'LOOSE_ITEM';
}

function validatePackageQuantities(packages: FinalPackage[], lines: PackingLine[]) {
  const expected = new Map<string, number>();
  lines.forEach((line) => expected.set(line.productId, (expected.get(line.productId) ?? 0) + line.quantity));

  const actual = new Map<string, number>();
  packages.forEach((pkg) =>
    pkg.items.forEach((item) => actual.set(item.productId, (actual.get(item.productId) ?? 0) + item.quantity)),
  );

  const errors: string[] = [];
  expected.forEach((quantity, productId) => {
    if (round(actual.get(productId) ?? 0) !== round(quantity)) {
      const line = lines.find((item) => item.productId === productId);
      errors.push(`${line?.productName ?? productId}: la cantidad empacada no coincide con la cotizacion.`);
    }
  });
  actual.forEach((_quantity, productId) => {
    if (!expected.has(productId)) errors.push(`El paquete contiene un producto no esperado: ${productId}.`);
  });
  return errors;
}

async function getFedexAccessToken(config: {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  childKey: string;
  childSecret: string;
}) {
  const params = new URLSearchParams();
  const hasChildCredentials = Boolean(config.childKey && config.childSecret);
  params.set('grant_type', hasChildCredentials ? 'csp_credentials' : 'client_credentials');
  params.set('client_id', config.clientId);
  params.set('client_secret', config.clientSecret);
  if (hasChildCredentials) {
    params.set('child_key', config.childKey);
    params.set('child_secret', config.childSecret);
  }

  const response = await fetch(`${config.baseUrl}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`FedEx rechazo el token OAuth. ${text || response.statusText}`);
  }

  const payload = await response.json();
  const token = readText(payload.access_token);
  if (!token) {
    throw new Error('FedEx no devolvio un access_token valido.');
  }

  return token;
}

async function fetchFedexRates({
  fedexConfig,
  customer,
  customerCountryCode,
  originPartner,
  originCountryCode,
  packageLineItems,
  token,
}: {
  fedexConfig: {
    baseUrl: string;
    accountNumber: string;
    originPostalCode: string;
  };
  customer: Record<string, unknown>;
  customerCountryCode: string;
  originPartner: Record<string, unknown>;
  originCountryCode: string;
  packageLineItems: Array<Record<string, unknown>>;
  token: string;
}) {
  const body = {
    accountNumber: { value: fedexConfig.accountNumber },
    requestedShipment: {
      shipper: {
        address: {
          streetLines: readText(originPartner.street) ? [readText(originPartner.street)] : undefined,
          city: readText(originPartner.city) ?? undefined,
          stateOrProvinceCode: stateShortCode(originPartner.state_id),
          postalCode: fedexConfig.originPostalCode,
          countryCode: originCountryCode,
          residential: false,
        },
      },
      recipient: {
        address: {
          streetLines: readText(customer.street) ? [readText(customer.street)] : undefined,
          city: readText(customer.city) ?? undefined,
          stateOrProvinceCode: stateShortCode(customer.state_id),
          postalCode: readText(customer.postalCode),
          countryCode: customerCountryCode,
          residential: false,
        },
      },
      pickupType: 'USE_SCHEDULED_PICKUP',
      rateRequestType: DEFAULT_RATE_REQUEST_TYPES,
      packagingType: DEFAULT_PACKAGING_TYPE,
      totalPackageCount: packageLineItems.length,
      requestedPackageLineItems: packageLineItems,
    },
    returnTransitTimes: true,
  };

  const response = await fetch(`${fedexConfig.baseUrl}/rate/v1/rates/quotes`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-locale': 'es_MX',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`FedEx rechazo la consulta de tarifas. ${text || response.statusText}`);
  }

  return response.json();
}

function normalizeFedexRates(payload: Record<string, unknown>) {
  const output = isRecord(payload.output) ? payload.output : null;
  const rows = Array.isArray(output?.rateReplyDetails)
    ? output.rateReplyDetails
    : Array.isArray(payload.rateReplyDetails)
      ? payload.rateReplyDetails
      : [];

  return rows
    .map((row) => {
      if (!isRecord(row)) return null;
      const serviceType = readText(row.serviceType) ?? 'UNKNOWN';
      const serviceName = readText(row.serviceName) ?? serviceType;
      const ratedShipmentDetails = Array.isArray(row.ratedShipmentDetails) ? row.ratedShipmentDetails : [];
      const accountRate =
        ratedShipmentDetails.find(
          (detail) => isRecord(detail) && readText(detail.rateType) === 'ACCOUNT',
        ) ?? ratedShipmentDetails[0] ?? null;
      const shipmentRateDetail =
        isRecord(accountRate) && isRecord(accountRate.shipmentRateDetail)
          ? accountRate.shipmentRateDetail
          : null;
      const totalCharge = num(
        getNestedNumber(shipmentRateDetail, ['totalNetCharge', 'amount']) ??
          getNestedNumber(shipmentRateDetail, ['totalNetFedExCharge', 'amount']) ??
          getNestedNumber(shipmentRateDetail, ['totalBaseCharge', 'amount']),
      );
      const baseCharge = firstNumber(
        getNestedNumber(shipmentRateDetail, ['totalBaseCharge', 'amount']),
        getNestedNumber(shipmentRateDetail, ['totalNetCharge', 'amount']),
      );
      const currency =
        getNestedText(shipmentRateDetail, ['totalNetCharge', 'currency']) ??
        getNestedText(shipmentRateDetail, ['totalBaseCharge', 'currency']) ??
        getNestedText(shipmentRateDetail, ['currency']) ??
        'USD';
      const commit = isRecord(row.commit) ? row.commit : null;
      const dateDetail = isRecord(commit?.dateDetail) ? commit?.dateDetail : null;
      const transitDays = firstNumber(commit?.transitDays, commit?.estimatedTransitDays);
      const deliveryDate = readText(dateDetail?.date) ?? null;

      return {
        serviceName,
        serviceType,
        currency,
        totalCharge: round(totalCharge),
        baseCharge: baseCharge === null ? null : round(baseCharge),
        transitDays: transitDays === null ? null : Math.round(transitDays),
        deliveryDate,
      };
    })
    .filter((row): row is {
      serviceName: string;
      serviceType: string;
      currency: string;
      totalCharge: number;
      baseCharge: number | null;
      transitDays: number | null;
      deliveryDate: string | null;
    } => Boolean(row) && row.totalCharge > 0)
    .sort((left, right) => left.totalCharge - right.totalCharge);
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

function readText(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readPostalCode(value: unknown) {
  const text = readText(value);
  if (text) return text;
  if (typeof value === 'number' && Number.isFinite(value)) return `${value}`;
  return null;
}

function mergePartnerRecords(
  rows: Record<string, unknown>[],
  preferredIds: number[],
  postalFields: string[],
) {
  if (!rows.length) return null;

  const ordered = [...rows].sort((left, right) => {
    const leftScore = partnerPriority(left, preferredIds, postalFields);
    const rightScore = partnerPriority(right, preferredIds, postalFields);
    return rightScore - leftScore;
  });
  const primary = ordered[0];

  return {
    ...primary,
    name: firstTextFromPartners(ordered, 'name'),
    email: firstTextFromPartners(ordered, 'email'),
    phone: firstTextFromPartners(ordered, 'phone'),
    postalCode: firstPostalCodeFromPartners(ordered, postalFields),
    street: firstTextFromPartners(ordered, 'street'),
    city: firstTextFromPartners(ordered, 'city'),
    state_id: firstMany2oneFromPartners(ordered, 'state_id'),
    country_id: firstMany2oneFromPartners(ordered, 'country_id'),
  };
}

function partnerPriority(row: Record<string, unknown>, preferredIds: number[], postalFields: string[]) {
  let score = 0;
  const preferredIndex = preferredIds.indexOf(Number(row.id));
  if (preferredIndex >= 0) score += (preferredIds.length - preferredIndex) * 100;
  if (firstPostalCodeFromPartners([row], postalFields)) score += 20;
  if (many2oneId(row.country_id)) score += 20;
  if (readText(row.street)) score += 10;
  if (readText(row.city)) score += 10;
  return score;
}

function firstTextFromPartners(rows: Record<string, unknown>[], field: string) {
  for (const row of rows) {
    const value = readText(row[field]);
    if (value) return value;
  }
  return null;
}

function firstPostalCodeFromPartners(rows: Record<string, unknown>[], postalFields: string[]) {
  for (const row of rows) {
    for (const field of postalFields) {
      const value = readPostalCode(row[field]);
      if (value) return value;
    }
  }
  return null;
}

function firstMany2oneFromPartners(rows: Record<string, unknown>[], field: string) {
  for (const row of rows) {
    const value = row[field];
    if (many2oneId(value) !== null) {
      return value;
    }
  }
  return null;
}

function resolveCountryCode(
  value: unknown,
  countryCodeById: Map<number, string | null>,
) {
  const byId = many2oneId(value);
  if (byId !== null) {
    const code = countryCodeById.get(byId);
    if (code) return code.toUpperCase();
  }
  return readCountryCode(value);
}

function readCountryCode(value: unknown) {
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

function num(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
}

function currencyLabel(value: unknown) {
  const label = many2oneLabel(value) ?? readText(value);
  if (!label) return null;
  const upper = label.toUpperCase();
  return upper.length <= 6 ? upper : label;
}

function uniq(values: Array<string | null>) {
  return [...new Set(values.filter(Boolean) as string[])];
}

function uniqueNumbers(values: Array<number | null>) {
  return [...new Set(values.filter((value): value is number => Number.isFinite(value ?? NaN)))];
}

function trimSlash(value: string | null | undefined) {
  const normalized = `${value ?? ''}`.trim();
  return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
}

function resolveSupabasePublishableKey() {
  return Deno.env.get('SUPABASE_ANON_KEY')?.trim() || parseKeyMap('SUPABASE_PUBLISHABLE_KEYS')?.default?.trim() || null;
}

function resolveSupabaseSecretKey() {
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim() || parseKeyMap('SUPABASE_SECRET_KEYS')?.default?.trim() || null;
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

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function sum(values: number[]) {
  return values.reduce((accumulator, value) => accumulator + value, 0);
}

function uniqueTexts(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getNestedNumber(value: Record<string, unknown> | null, path: string[]) {
  let current: unknown = value;
  for (const segment of path) {
    if (!isRecord(current)) return null;
    current = current[segment];
  }
  const parsed = Number(current);
  return Number.isFinite(parsed) ? parsed : null;
}

function getNestedText(value: Record<string, unknown> | null, path: string[]) {
  let current: unknown = value;
  for (const segment of path) {
    if (!isRecord(current)) return null;
    current = current[segment];
  }
  return readText(current);
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
