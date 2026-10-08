import type { AgentYearDimensionRow } from './reportsAnalytics';
import type { OdooInvoiceLineRecord, ReportFilters } from './odooSalesCore';
import type { AgentHistoricalBaseline } from './reportsService';

export type AgentHistoricalComparisonRow = AgentYearDimensionRow & {
  periodTotal: number;
  periodPurchases: number;
  historicalTotal: number;
  historicalPurchases: number;
};

function customerKey(name: string) {
  const normalized = name.split(',')[0]?.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ').trim().toUpperCase();
  return `customer:${normalized || 'CLIENTE SIN NOMBRE'}`;
}

function isGeneralPublic(name: string) {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase() === 'PUBLICO EN GENERAL';
}

export function buildAgentHistoricalComparison(
  profileRows: AgentYearDimensionRow[],
  invoiceLines: OdooInvoiceLineRecord[],
  filters: ReportFilters,
  baselines: AgentHistoricalBaseline[],
  dimension: 'customer' | 'product',
): AgentHistoricalComparisonRow[] {
  const companyIds = filters.companyIds?.length ? filters.companyIds : filters.companyId ? [filters.companyId] : [];
  const sellerIds = filters.sellerIds?.length ? filters.sellerIds : filters.sellerId ? [filters.sellerId] : [];
  const purchases = new Map<string, Set<number>>();
  for (const line of invoiceLines) {
    if (line.invoiceState !== 'posted' || line.moveType !== 'out_invoice' || line.displayType !== 'product' ||
      !line.invoiceDate || line.invoiceDate < filters.startDate || line.invoiceDate > filters.endDate ||
      (companyIds.length > 0 && !companyIds.includes(line.companyId ?? -1)) ||
      (sellerIds.length > 0 && !sellerIds.includes(line.sellerId ?? -1)) ||
      (filters.teamId && line.teamId !== filters.teamId) ||
      (filters.customerId && line.customerId !== filters.customerId) ||
      (filters.currencyCode && line.currencyCode !== filters.currencyCode) ||
      (filters.productId && line.productId !== filters.productId) ||
      (filters.categoryId && line.categoryId !== filters.categoryId)) continue;
    const customerName = isGeneralPublic(line.customerName) && line.deliveryCustomerName
      ? line.deliveryCustomerName : line.customerName;
    const key = dimension === 'customer' ? customerKey(customerName) : `id:${line.productId}`;
    const invoiceIds = purchases.get(key) ?? new Set<number>();
    invoiceIds.add(line.invoiceId);
    purchases.set(key, invoiceIds);
  }
  const historicalByKey = new Map(baselines.filter((row) => row.dimension === dimension).map((row) => [row.key, row]));
  return profileRows.map((row) => {
    const historical = historicalByKey.get(row.key);
    const periodPurchases = purchases.get(row.key)?.size ?? 0;
    const historicalPurchases = historical?.purchaseCount ?? 0;
    const historicalTotal = historical?.totalAmount ?? 0;
    const periodAverage = periodPurchases > 0 ? row.current / periodPurchases : 0;
    const historicalAverage = historicalPurchases > 0 ? historicalTotal / historicalPurchases : 0;
    const difference = periodAverage - historicalAverage;
    return {
      ...row,
      current: periodAverage,
      previous: historicalAverage,
      difference,
      differencePct: historicalAverage > 0 ? difference / historicalAverage * 100 : null,
      periodTotal: row.current,
      periodPurchases,
      historicalTotal,
      historicalPurchases,
    };
  }).filter((row) => row.periodTotal !== 0 || row.historicalPurchases > 0);
}
