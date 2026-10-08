import type { OdooInvoiceAnalysisMargin, OdooInvoiceLineRecord, ReportFilters } from './odooSalesCore';

export type AgentInvoiceMarginCategory = {
  category: string;
  margin: number;
  untaxed: number;
  marginPct: number | null;
};

export type AgentInvoiceMarginResult = {
  available: boolean;
  categories: AgentInvoiceMarginCategory[];
  lines: OdooInvoiceLineRecord[];
  margin: number;
  untaxed: number;
  marginPct: number | null;
  missingLines: number;
  rowCount: number;
};

export function buildAgentInvoiceMargin(
  lines: OdooInvoiceLineRecord[],
  filters: ReportFilters,
  analysis?: OdooInvoiceAnalysisMargin | null,
): AgentInvoiceMarginResult {
  if (analysis) return { ...analysis, lines: [], missingLines: 0 };
  const companyIds = filters.companyIds?.length ? filters.companyIds : filters.companyId ? [filters.companyId] : [];
  const sellerIds = filters.sellerIds?.length ? filters.sellerIds : filters.sellerId ? [filters.sellerId] : [];
  const scoped = filters.stateScope === 'quotation' || filters.stateScope === 'cancelled'
    ? []
    : lines.filter((line) =>
      line.invoiceState === 'posted' &&
      line.displayType === 'product' &&
      ['out_invoice', 'out_refund'].includes(line.moveType) &&
      Boolean(line.invoiceDate && line.invoiceDate >= filters.startDate && line.invoiceDate <= filters.endDate) &&
      (!companyIds.length || companyIds.includes(line.companyId ?? -1)) &&
      (!sellerIds.length || sellerIds.includes(line.sellerId ?? -1)) &&
      (!filters.teamId || line.teamId === filters.teamId) &&
      (!filters.customerId || line.customerId === filters.customerId) &&
      (!filters.currencyCode || line.currencyCode === filters.currencyCode) &&
      (!filters.productId || line.productId === filters.productId) &&
      (!filters.categoryId || line.categoryId === filters.categoryId));
  const missingLines = scoped.filter((line) => line.analysisMarginAmount == null || line.analysisUntaxedAmount == null).length;
  const buckets = new Map<string, { margin: number; untaxed: number }>();
  for (const line of scoped) {
    if (line.analysisMarginAmount == null || line.analysisUntaxedAmount == null) continue;
    const category = line.categoryName?.trim() || 'Sin categoría';
    const bucket = buckets.get(category) ?? { margin: 0, untaxed: 0 };
    bucket.margin += line.analysisMarginAmount;
    bucket.untaxed += line.analysisUntaxedAmount;
    buckets.set(category, bucket);
  }
  const categories = [...buckets.entries()]
    .map(([category, bucket]) => ({
      category,
      margin: bucket.margin,
      untaxed: bucket.untaxed,
      marginPct: bucket.untaxed !== 0 ? bucket.margin / bucket.untaxed * 100 : null,
    }))
    .sort((a, b) => b.margin - a.margin || a.category.localeCompare(b.category, 'es-MX'));
  const margin = categories.reduce((total, category) => total + category.margin, 0);
  const untaxed = categories.reduce((total, category) => total + category.untaxed, 0);
  return {
    available: missingLines === 0,
    categories,
    lines: scoped,
    margin,
    untaxed,
    marginPct: untaxed !== 0 ? margin / untaxed * 100 : null,
    missingLines,
    rowCount: scoped.length,
  };
}
