import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import type {
  OdooCommercialDataset,
  ReportFilters,
  ReportRequestedDomain,
  ReportsConfig,
} from './odooSalesCore';

export type ReportLoadMode = 'fast' | 'full' | 'partition';

export type AgentHistoricalBaseline = {
  dimension: 'customer' | 'product';
  key: string;
  totalAmount: number;
  purchaseCount: number;
};

export type AgentSummaryContext = {
  baselines: AgentHistoricalBaseline[];
  baselineAvailable: boolean;
  baselineSaved: boolean;
  previousQuoteCount: number | null;
  previousQuoteRange: { startDate: string; endDate: string } | null;
};

export type ReportDailySalesPoint = {
  bucketKey: string;
  label: string;
  invoicedAmount: number;
  previousInvoicedAmount: number;
  previousLabel: string;
};

export type ReportDailySalesComparison = {
  points: ReportDailySalesPoint[];
  currentTotal: number;
  previousTotal: number;
  currentMargin: number;
  previousMargin: number;
  currentInvoiceCount?: number;
  previousInvoiceCount?: number;
  monthlyMetrics?: Array<{
    period: 'current' | 'previous';
    grain: 'total' | 'category';
    metric_month: string;
    company_id: number;
    company_name: string | null;
    seller_id: number;
    seller_name: string | null;
    category_id: number;
    category_name: string;
    currency_code: string;
    invoice_count: number;
    untaxed_amount: number;
    margin_amount: number;
  }>;
  closedMonthsOnly?: boolean;
  yearToDateTotals?: { current: number; previous: number } | null;
  comparisonCurrentEndDate?: string | null;
  available: boolean;
  previousRange: { startDate: string; endDate: string };
  syncKey: string;
  lastSuccessfulSync?: string | null;
  syncStatus?: string;
};

export type ReportAnalyticsSyncResult = {
  status: 'ok' | 'idle' | 'running' | 'fresh';
  processed?: number;
  refreshedDates?: number;
  refreshedAggregates?: number;
  lastWriteDate?: string | null;
  hasMore?: boolean;
  message?: string;
};

export async function syncOdooReportAnalytics(options: {
  batchSize?: number;
  forceFull?: boolean;
  initialStartDate?: string;
  maxBatches?: number;
} = {}): Promise<ReportAnalyticsSyncResult> {
  const { data, error } = await supabase.functions.invoke('sync-odoo-analytics', {
    body: {
      batchSize: options.batchSize ?? 350,
      forceFull: options.forceFull === true,
      initialStartDate: options.initialStartDate,
      maxBatches: options.maxBatches ?? 2,
    },
  });
  if (error) throw new Error(await readFunctionErrorMessage(error) || error.message);
  if (data?.error) throw new Error(normalizeReportFunctionError(String(data.error)));
  return data as ReportAnalyticsSyncResult;
}

export async function getAgentSummaryContext(filters: ReportFilters, rangeKey: string | null, forceRefresh = false): Promise<AgentSummaryContext> {
  const { data, error } = await supabase.functions.invoke('odoo-sales-report', {
    body: { ...filters, rangeKey, forceRefresh, requestedDomain: 'sales', reportContext: 'reports', action: 'agent-summary-context' },
  });
  if (error) throw new Error(await readFunctionErrorMessage(error) || error.message);
  if (data?.error) throw new Error(normalizeReportFunctionError(String(data.error)));
  return data as AgentSummaryContext;
}

export async function getReportDailySalesComparison(filters: ReportFilters, forceRefresh = false): Promise<ReportDailySalesComparison> {
  const { data, error } = await supabase.functions.invoke('odoo-sales-report', {
    body: { ...filters, forceRefresh, requestedDomain: 'sales', reportContext: 'reports', action: 'daily-sales-summary' },
  });
  if (error) throw new Error(await readFunctionErrorMessage(error) || error.message);
  if (data?.error) throw new Error(normalizeReportFunctionError(String(data.error)));
  return data as ReportDailySalesComparison;
}

export async function getCommercialDataset(
  filters: ReportFilters,
  requestedDomain: ReportRequestedDomain = 'sales',
  loadMode: ReportLoadMode = 'full',
  reportContext: 'reports' | 'marketing' = 'reports',
  forceRefresh = false,
) {
  if (reportContext === 'marketing' && import.meta.env.DEV && filters.visibilityScope !== 'own') {
    const params = new URLSearchParams(serializeFilters(filters, requestedDomain, loadMode));
    const response = await fetch(`/api/reports/odoo-sales?${params.toString()}`);

    if (!response.ok) {
      const errorPayload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      throw new Error(
        errorPayload?.error ??
          'No se pudo consultar el proxy local del dashboard comercial.',
      );
    }

    return (await response.json()) as OdooCommercialDataset;
  }

  const { data, error } = await supabase.functions.invoke('odoo-sales-report', {
    body: {
      ...filters,
      requestedDomain,
      loadMode,
      reportContext,
      forceRefresh,
    },
  });

  if (error) {
    const detailedMessage = await readFunctionErrorMessage(error);
    throw new Error(
      detailedMessage || error.message || 'No se pudo consultar el dashboard comercial de Odoo.',
    );
  }

  if (data?.error) {
    throw new Error(normalizeReportFunctionError(String(data.error)));
  }

  return data as OdooCommercialDataset;
}

export async function getPreparedExecutiveSummary(filters: ReportFilters, config: ReportsConfig, forceRefresh = false, signal?: AbortSignal) {
  const { data, error } = await supabase.functions.invoke('odoo-sales-report', {
    body: { ...filters, config, forceRefresh, action: 'executive-summary', requestedDomain: 'sales', reportContext: 'reports' },
    signal,
  });
  if (error) throw new Error(await readFunctionErrorMessage(error) || error.message);
  if (data?.error) throw new Error(String(data.error));
  return data as { ready: boolean; dataset?: OdooCommercialDataset; refreshing: boolean; calculatedAt?: string };
}

async function readFunctionErrorMessage(error: unknown) {
  if (error instanceof FunctionsHttpError) {
    const response = error.context;
    if (response instanceof Response) {
      const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';

      try {
        if (contentType.includes('application/json')) {
          const payload = (await response.clone().json()) as {
            error?: string;
            message?: string;
          };
          return normalizeReportFunctionError(payload.error || payload.message || error.message);
        }

        const text = (await response.clone().text()).trim();
        return normalizeReportFunctionError(text || error.message);
      } catch {
        return normalizeReportFunctionError(error.message);
      }
    }
  }

  if (error instanceof Error) {
    return normalizeReportFunctionError(error.message);
  }

  return null;
}

function normalizeReportFunctionError(message: string | undefined | null) {
  const text = `${message ?? ''}`.trim();
  const lower = text.toLowerCase();

  if (
    lower.includes('not having enough compute resources') ||
    lower.includes('compute resources') ||
    lower.includes('please check logs')
  ) {
    return 'La actualización completa del reporte tardó más de lo permitido por el servidor. Se mantiene la información disponible y seguiremos priorizando la carga rápida para que puedas continuar trabajando.';
  }

  if (lower.includes('edge function returned a non-2xx status code')) {
    return 'No fue posible completar la actualización del reporte en este momento. Se mantiene la información disponible; intenta actualizar nuevamente en unos minutos.';
  }

  return text;
}

function serializeFilters(
  filters: ReportFilters,
  requestedDomain: ReportRequestedDomain,
  loadMode: ReportLoadMode,
) {
  return {
    startDate: filters.startDate,
    endDate: filters.endDate,
    companyId: nullableValue(filters.companyId),
    companyIds: serializeNumberList(filters.companyIds, filters.companyId),
    sellerIds: serializeNumberList(filters.sellerIds, filters.sellerId),
    teamId: nullableValue(filters.teamId),
    customerId: nullableValue(filters.customerId),
    productId: nullableValue(filters.productId),
    categoryId: nullableValue(filters.categoryId),
    currencyCode: nullableString(filters.currencyCode),
    channel: nullableString(filters.channel),
    stateScope: filters.stateScope,
    grouping: filters.grouping,
    visibilityScope: filters.visibilityScope,
    requestedDomain,
    loadMode,
  };
}

function nullableValue(value: number | null) {
  return value === null ? '' : String(value);
}

function nullableString(value: string | null) {
  return value ?? '';
}

function serializeNumberList(values?: number[], fallbackValue?: number | null) {
  if (Array.isArray(values) && values.length > 0) {
    return values.join(',');
  }

  return fallbackValue === null || fallbackValue === undefined ? '' : String(fallbackValue);
}
