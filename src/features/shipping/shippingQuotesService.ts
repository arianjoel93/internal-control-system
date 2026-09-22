import { supabase } from '../../lib/supabase';
import type {
  ShippingAddressSnapshot,
  ShippingCarrierConfig,
  ShippingPackageType,
  ShippingProductDimension,
  ShippingQuoteDetail,
  ShippingQuoteRow,
} from '../../lib/types';
import type { ShippingPackageDraft } from './shippingQuoteMath';
import type { PackingRequest, ProductRules } from '../../../supabase/functions/_shared/shipping-packing';

export type ShippingPhysicalRules = {
  can_rotate?: boolean; stackable?: boolean; fragile?: boolean; requires_individual_package?: boolean;
  can_combine?: boolean; packaging_group?: string | null; protection_margin_cm?: number; notes?: string | null;
};
export type ShippingPhysicalProduct = ShippingProductDimension & ShippingPhysicalRules;

export type ShippingAccess = {
  canAccess: boolean;
  isAdmin: boolean;
  viewAll: boolean;
};

export type ShippingBootstrap = {
  access: ShippingAccess;
  config: ShippingCarrierConfig | null;
  packageTypes: ShippingPackageType[];
};

export type ShippingCarrierConfigDraft = {
  environment: 'SANDBOX' | 'PRODUCTION';
  is_active: boolean;
  account_number: string;
  client_id: string;
  client_secret: string;
  origin_country_code: string;
  origin_postal_code: string;
  origin_state_code: string;
  origin_city: string;
  origin_street?: string;
  preferred_currency: string;
  pickup_type: string;
  return_transit_times: boolean;
  rate_request_types: string[];
  rate_display_option: string;
  weight_input_mode: 'NET_CONTENT' | 'GROSS_PACKAGE';
  final_volume_padding_enabled: boolean;
  final_padding_length_cm: number | null;
  final_padding_width_cm: number | null;
  final_padding_height_cm: number | null;
  final_packaging_cost_enabled: boolean;
  final_packaging_material_cost: number | null;
};

export type ShippingPackageTypeDraft = {
  id?: string;
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
};

export type CreateShippingQuotePayload = {
  destination: ShippingAddressSnapshot;
  requestedShipDate: string | null;
  packages: ShippingPackageDraft[];
  odooOrderName?: string | null;
  odooOrderId?: number | null;
  selectedPackingPlan?: Record<string, unknown> | null;
  packingRequest?: PackingRequest;
};

export type ShippingOrderLine = ProductRules & {
  lineId: number;
  productId: number;
  sku: string | null;
  productName: string;
  description: string;
  quantity: number;
  uom: string | null;
  priceUnit: number;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  weightKg: number | null;
  volumeWeightKg: number | null;
  productType: string | null;
  productCategory: string | null;
  saleOk: boolean;
  isEligibleForShipping: boolean;
  exclusionReason: string | null;
  logisticsSource: string | null;
  physicalProductId?: string | null;
  canRotate: boolean;
  canStack: boolean;
  shipAlone: boolean;
  fragile: boolean;
  packingGroup: string | null;
  missingFields: string[];
};

export type ShippingOrderLookupResult = {
  fetchedAt: string;
  order: {
    id: number;
    name: string;
    dateOrder: string | null;
    state: string;
    amountTotal: number;
    currencyCode: string | null;
    salesperson: string | null;
    company: string | null;
  };
  destination: ShippingAddressSnapshot & {
    name: string | null;
    company: string | null;
    email: string | null;
    phone: string | null;
  };
  lines: ShippingOrderLine[];
  warnings: string[];
};

export type ShippingQuoteListResult = {
  rows: ShippingQuoteRow[];
  total: number;
};

export type ShippingProductDimensionImportRow = {
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

export type ShippingProductDimensionsImportPreview = {
  rows: ShippingProductDimensionImportRow[];
  conflicts: Array<{
    sku: string;
    existing: ShippingProductDimension;
    incoming: ShippingProductDimensionImportRow;
    changed: boolean;
  }>;
  invalidRows: Array<{ row: number; reason: string }>;
  newCount: number;
  updateCount: number;
  unchangedCount: number;
};

export type ShippingProductDimensionsListResult = {
  rows: ShippingProductDimension[];
  total: number;
};

export type FedexHistoricalComparable = {
  id: string;
  amount: number;
  currency: string;
  environment: 'PRODUCTION' | 'SANDBOX';
  serviceCode: string | null;
  serviceName: string | null;
  packageCount: number;
  physicalWeight: number;
  volumetricWeight: number;
  billableWeight: number;
  volumeCm3: number;
  fedexZone: string | null;
  createdAt: string;
  similarityScore: number;
  recencyWeight: number;
  weightedAmount: number;
  source: 'shipping_quotes' | 'odoo_delivery';
  orderName: string | null;
  isOutlier?: boolean;
};

export type FedexEstimatorCatalog = {
  services: Array<{ serviceCode: string; serviceName: string }>;
  weightBands: Array<{ id: string; label: string; minKg: number; maxKg: number | null }>;
  hasRateCard: boolean;
};

export type FedexEstimatorStats = {
  total: number;
  compared: number;
  averageErrorPercent: number | null;
  medianErrorPercent: number | null;
  within5Percent: number | null;
  within10Percent: number | null;
  within20Percent: number | null;
};

export type FedexLiveRate = {
  amount: number;
  currency: string;
  serviceCode: string;
  serviceName: string;
  transitDays: number | null;
  deliveryLabel: string | null;
};

export type FedexHistoricalEstimate = {
  estimateId: string | null;
  originPostalCode: string;
  destinationPostalCode: string;
  originGroup: string | null;
  destinationGroup: string | null;
  fedexZone: string | null;
  packageCount: number;
  physicalWeight: number;
  volumetricWeight: number;
  billableWeight: number;
  environmentSource: 'PRODUCTION' | 'SANDBOX' | 'NONE';
  currency: string | null;
  warning: string | null;
  estimatedAmount: number | null;
  estimatedLow: number | null;
  estimatedHigh: number | null;
  medianAmount: number | null;
  averageAmount: number | null;
  minimumAmount: number | null;
  maximumAmount: number | null;
  p25Amount: number | null;
  p75Amount: number | null;
  confidence: 'MUY_ALTA' | 'ALTA' | 'MEDIA' | 'BAJA' | 'INSUFICIENTE';
  confidenceScore: number;
  comparables: FedexHistoricalComparable[];
  outlierQuoteIds: string[];
  method: 'FEDEX_API' | 'HISTORICAL_MEDIAN' | 'TARIFF' | 'NONE';
  methodLabel: string;
  periodDays: number | null;
  weightBand: string | null;
  liveRate: FedexLiveRate | null;
  differenceAmount: number | null;
  differencePercent: number | null;
  apiError: { status: number | null; code: string | null; message: string | null; transactionId: string | null } | null;
};

export type FedexZoneResolution = {
  originPostalCode: string | null;
  destinationPostalCode: string;
  originGroup: string | null;
  destinationGroup: string | null;
  zone: string | null;
  available: boolean;
  message: string;
};

export async function getShippingBootstrap() {
  return invokeShippingFunction<ShippingBootstrap>('bootstrap');
}

export async function getFedexZone(destinationPostalCode: string) {
  return invokeShippingFunction<FedexZoneResolution>('getFedexZone', { destinationPostalCode });
}

export async function getFedexEstimatorCatalog() {
  return invokeShippingFunction<FedexEstimatorCatalog>('getEstimatorCatalog');
}

export async function getFedexEstimatorStats() {
  return invokeShippingFunction<FedexEstimatorStats>('getEstimatorStats');
}

export async function estimateHistoricalFedexRate(payload: {
  originPostalCode?: string | null;
  destinationPostalCode: string;
  weightKg?: number | null;
  packageCount?: number | null;
  currency?: string | null;
  serviceCode?: string | null;
  serviceName?: string | null;
  odooOrderId?: number | null;
  odooOrderName?: string | null;
  packages?: Array<{ lengthCm?: number | null; widthCm?: number | null; heightCm?: number | null; physicalWeightKg?: number | null }>;
}) {
  return invokeShippingFunction<FedexHistoricalEstimate>('estimateHistoricalRate', payload);
}

export async function getHistoricalEstimateDetail(id: string) {
  return invokeShippingFunction<Record<string, unknown>>('getHistoricalEstimateDetail', { id });
}

export async function saveShippingCarrierConfig(payload: ShippingCarrierConfigDraft) {
  return invokeShippingFunction<{ config: ShippingCarrierConfig }>('saveConfig', payload);
}

export async function testShippingCarrierConnection() {
  return invokeShippingFunction<{ message: string }>('testConnection');
}

export async function saveShippingPackageType(payload: ShippingPackageTypeDraft) {
  return invokeShippingFunction<{ packageType: ShippingPackageType }>('savePackageType', payload);
}

export async function deleteShippingPackageType(id: string) {
  return invokeShippingFunction<{ deleted: boolean }>('deletePackageType', { id });
}

export async function listShippingProductDimensions() {
  return invokeShippingFunction<ShippingProductDimensionsListResult>('listProductDimensions');
}

export async function previewShippingProductDimensionsImport(payload: {
  fileName: string;
  fileBase64: string;
}) {
  return invokeShippingFunction<ShippingProductDimensionsImportPreview>('previewProductDimensionsImport', payload);
}

export async function importShippingProductDimensions(payload: {
  fileName: string;
  rows: ShippingProductDimensionImportRow[];
  replaceExisting: boolean;
}) {
  return invokeShippingFunction<{ inserted: number; updated: number; unchanged: number; total: number }>(
    'importProductDimensions',
    payload,
  );
}

export async function saveShippingProductDimension(payload: ShippingPhysicalRules & {
  id?: string;
  sku: string;
  product_name: string | null;
  width_cm: number;
  length_cm: number;
  height_cm: number;
  unit_weight_kg: number | null;
}) {
  return invokeShippingFunction<{ product: ShippingPhysicalProduct }>('saveProductDimension', payload);
}

export async function createShippingQuote(payload: CreateShippingQuotePayload) {
  return invokeShippingFunction<{ quote: ShippingQuoteDetail }>('createQuote', payload);
}

export async function lookupOdooShippingOrder(orderNumber: string) {
  return invokeShippingFunction<ShippingOrderLookupResult>('lookupOdooOrder', { orderNumber });
}

export async function listShippingQuotes(payload: {
  page: number;
  pageSize: number;
  scope: 'mine' | 'all';
  search: string;
  status: 'all' | 'SUCCESS' | 'ERROR';
  dateFrom: string | null;
  dateTo: string | null;
}) {
  return invokeShippingFunction<ShippingQuoteListResult>('listQuotes', payload);
}

export async function getShippingQuote(id: string) {
  return invokeShippingFunction<{ quote: ShippingQuoteDetail }>('getQuote', { id });
}

async function invokeShippingFunction<T>(action: string, payload?: Record<string, unknown>) {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) throw sessionError;

  const { data, error } = await supabase.functions.invoke('shipping-quote', {
    body: {
      action,
      ...(payload ?? {}),
    },
    headers: session?.access_token
      ? { Authorization: `Bearer ${session.access_token}` }
      : undefined,
  });

  if (error) {
    const detail = await readFunctionErrorDetail(error);
    throw new Error(detail || error.message || 'No se pudo completar la solicitud del cotizador de envíos.');
  }

  const response = data as { data?: T; error?: string } | T | null;
  if (response && typeof response === 'object' && 'error' in response && response.error) {
    throw new Error(response.error);
  }
  if (response && typeof response === 'object' && 'data' in response) {
    return response.data as T;
  }
  return response as T;
}

async function readFunctionErrorDetail(error: unknown) {
  const context = typeof error === 'object' && error && 'context' in error ? (error as { context?: unknown }).context : null;
  if (!(context instanceof Response)) return null;

  const payload = await context
    .clone()
    .json()
    .catch(() => null);
  if (payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string') {
    return payload.error;
  }
  return null;
}
