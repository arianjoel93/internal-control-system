import type { OdooCommercialDataset, OdooCustomerContactRecord, OdooOrderRecord, OdooOrderLineRecord, ReportFilters, ReportsConfig } from './odooSalesCore';
import { buildCommercialDashboard, type CommercialDashboardSnapshot, type ClientLifecycleRow, type AgentYearDimensionRow } from './reportsAnalytics';
import { buildAgentInvoiceMargin, type AgentInvoiceMarginResult } from './agentInvoiceMargin';
import { buildAgentCrossSellOpportunities, buildRepurchaseAttentionRows, buildLeadAgeBands, type RepurchaseAttentionRow, type AgentCrossSellOpportunity } from './agentDashboardInsights';
import { buildSalesAgentNotifications, type SalesAgentNotificationDraft } from './salesAgentIntelligence';
const normalizeText = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
const formatNumber = (value: number) => new Intl.NumberFormat('es-MX').format(value);
export type AgentAbandonedQuoteBalance = { current: number; previous: number | null; differencePct: number | null };

export function countAbandonedQuotesPreviousPeriod(
  dataset: OdooCommercialDataset,
  snapshot: CommercialDashboardSnapshot,
): number {
  return countAnalyzableAbandonedQuotes(dataset, snapshot.details.previousPendingQuotes);
}

export function countAnalyzableAbandonedQuotes(
  dataset: OdooCommercialDataset,
  quotes: OdooOrderRecord[],
  sellerName: string | null = null,
): number {
  const seller = normalizeText(sellerName ?? '');
  const matchingQuotes = seller
    ? quotes.filter((quote) => normalizeText(quote.sellerName) === seller)
    : quotes;
  const quoteIds = new Set(matchingQuotes.map((quote) => quote.id));
  const linesByOrderId = groupOrderLinesByOrderId(
    dataset.orderLines.filter((line) => quoteIds.has(line.orderId)),
  );
  const analysis = buildAbandonedQuoteAnalysisIndex(matchingQuotes, linesByOrderId);
  return matchingQuotes.filter((quote) => (analysis.get(quote.id)?.amount ?? 0) > 0).length;
}

export function buildAgentAbandonedQuoteBalance(
  dataset: OdooCommercialDataset,
  snapshot: CommercialDashboardSnapshot,
  sellerName: string | null,
  previous: number | null,
): AgentAbandonedQuoteBalance {
  // Match the sidebar's exclusion of quotes without analyzable line amounts.
  const current = countAnalyzableAbandonedQuotes(dataset, snapshot.details.pendingQuotes, sellerName);
  return {
    current,
    previous,
    differencePct: previous ? (current - previous) / previous * 100 : null,
  };
}

export type AgentLeadAttention = {
  label: string;
  customer: string;
  days: number;
  stage: string;
  email: string;
  phone: string;
  expectedRevenue: number;
};

export type AgentCustomerBalance = {
  newCount: number;
  lostCount: number;
  reactivatedCount: number;
  toReactivateCount: number;
  newValue: number;
  lostValue: number;
  reactivatedValue: number;
  toReactivateValue: number;
  netCount: number;
  netValue: number;
  maxValue: number;
  details: AgentCustomerLifecycleDetail[];
  repurchaseDetails: RepurchaseAttentionRow[];
};

export type AgentCustomerLifecycleDetail = {
  customer: string;
  status: 'Nuevo' | 'Reactivado' | 'A reactivar' | 'Perdido';
  email: string | null;
  phone: string | null;
  lastPurchaseDate: string;
  daysSincePurchase: number;
  averageRepurchaseDays: number;
  thresholdDays: number;
  value: number;
};

export function buildAgentCustomerBalance(
  lifecycleRows: ClientLifecycleRow[],
  filters: ReportFilters,
  rows: AgentYearDimensionRow[],
  customerContacts: OdooCustomerContactRecord[] = [],
): AgentCustomerBalance {
  const start = filters.startDate;
  const rowValues = new Map(rows.map((row) => [normalizeText(row.label), row]));
  const contactById = new Map(customerContacts.map((contact) => [contact.customerId, contact]));
  const contactByName = new Map(customerContacts.map((contact) => [normalizeText(contact.customerName.split(',')[0] ?? ''), contact]));
  const details: AgentCustomerLifecycleDetail[] = lifecycleRows.flatMap((customer) => {
    const lastPurchase = customer.lastPurchaseDate?.slice(0, 10);
    if (!lastPurchase || lastPurchase > filters.endDate) return [];
    const averageRepurchaseDays = Math.round(customer.averagePurchaseGapDays ?? 0);
    const thresholdDays = Math.max(90, averageRepurchaseDays);
    const daysSincePurchase = customer.daysSinceLastPurchase ?? 0;
    let status: AgentCustomerLifecycleDetail['status'] | null = null;
    if (customer.isNewCustomer && customer.firstPurchaseDate && customer.firstPurchaseDate.slice(0, 10) >= start) status = 'Nuevo';
    else if (customer.isReactivated) status = 'Reactivado';
    else if (lastPurchase < start) {
      if (daysSincePurchase > thresholdDays + 60) status = 'Perdido';
      else if (daysSincePurchase > thresholdDays) status = 'A reactivar';
    }
    if (!status) return [];
    const row = rowValues.get(normalizeText(customer.customerName));
    const contact = (customer.customerId ? contactById.get(customer.customerId) : null) ??
      contactByName.get(normalizeText(customer.customerName.split(',')[0] ?? ''));
    return [{
      customer: customer.customerName,
      status,
      email: contact?.email ?? null,
      phone: contact?.mobile ?? contact?.phone ?? null,
      lastPurchaseDate: lastPurchase,
      daysSincePurchase,
      averageRepurchaseDays,
      thresholdDays,
      value: status === 'Perdido' ? row?.previous ?? 0 : row?.current ?? 0,
    }];
  });

  const newDetails = details.filter((detail) => detail.status === 'Nuevo');
  const lostDetails = details.filter((detail) => detail.status === 'Perdido');
  const reactivatedDetails = details.filter((detail) => detail.status === 'Reactivado');
  const toReactivateDetails = details.filter((detail) => detail.status === 'A reactivar');
  const newValue = newDetails.reduce((sum, detail) => sum + detail.value, 0);
  const lostValue = lostDetails.reduce((sum, detail) => sum + detail.value, 0);
  const reactivatedValue = reactivatedDetails.reduce((sum, detail) => sum + detail.value, 0);
  const toReactivateValue = toReactivateDetails.reduce((sum, detail) => sum + detail.value, 0);
  return {
    newCount: newDetails.length,
    lostCount: lostDetails.length,
    reactivatedCount: reactivatedDetails.length,
    toReactivateCount: toReactivateDetails.length,
    newValue,
    lostValue,
    reactivatedValue,
    toReactivateValue,
    netCount: newDetails.length + reactivatedDetails.length - lostDetails.length,
    netValue: newValue + reactivatedValue - lostValue,
    maxValue: Math.max(newValue, lostValue, 1),
    details,
    repurchaseDetails: buildRepurchaseAttentionRows(lifecycleRows, filters, customerContacts),
  };
}

export type AgentCrmLeadDetail = { label: string; customer: string; stage: string; attended: boolean; createdAt: string };

export type AgentCrmBalance = { assigned: number; attended: number; attentionRate: number; note: string; details: AgentCrmLeadDetail[] };

export function leadMatchesReportScope(
  lead: OdooCommercialDataset['crmLeads'][number],
  filters: ReportFilters,
  sellerName: string | null,
): boolean {
  if (sellerName && normalizeText(lead.sellerName ?? '') !== normalizeText(sellerName)) return false;
  const sellerIds = filters.sellerIds?.length ? filters.sellerIds : filters.sellerId ? [filters.sellerId] : [];
  const companyIds = filters.companyIds?.length ? filters.companyIds : filters.companyId ? [filters.companyId] : [];
  return (!sellerIds.length || sellerIds.includes(lead.sellerId ?? -1)) &&
    (!companyIds.length || companyIds.includes(lead.companyId ?? -1)) &&
    (!filters.teamId || lead.teamId === filters.teamId) &&
    (!filters.customerId || lead.customerId === filters.customerId);
}

export function buildAgentCrmBalance(dataset: OdooCommercialDataset, filters: ReportFilters, sellerName: string | null): AgentCrmBalance {
  const start = new Date(`${filters.startDate}T00:00:00.000Z`).getTime();
  const end = new Date(`${filters.endDate}T23:59:59.999Z`).getTime();
  const leads = dataset.crmLeads.filter((lead) => {
    if (!leadMatchesReportScope(lead, filters, sellerName)) return false;
    const assigned = lead.assignmentDate ?? lead.createDate;
    const assignedAt = assigned ? new Date(assigned).getTime() : NaN;
    return Number.isFinite(assignedAt) && assignedAt >= start && assignedAt <= end;
  });
  const details = leads.map((lead) => ({
    label: lead.name || `Lead ${lead.id}`,
    customer: lead.customerName ?? 'Sin cliente',
    stage: lead.stageName ?? 'Sin etapa',
    attended: isAgentLeadAttendedStage(lead.stageName),
    createdAt: (lead.assignmentDate ?? lead.createDate)?.slice(0, 10) ?? '-',
  }));
  const attended = details.filter((lead) => lead.attended).length;
  const assigned = leads.length;
  return {
    assigned,
    attended,
    attentionRate: assigned ? attended / assigned * 100 : 0,
    note: assigned ? `${formatNumber(assigned - attended)} pendientes de atención` : 'No hay leads asignados en el periodo',
    details,
  };
}

export function isAgentLeadAttendedStage(stageName: string | null | undefined) {
  const stage = normalizeText(stageName ?? '');
  return ['cotiz', 'sin cotizar', 'ganad', 'perdid'].some((status) => stage.includes(status));
}

export function buildAgentLeadAttention(dataset: OdooCommercialDataset, filters: ReportFilters, sellerName: string | null): AgentLeadAttention[] {
  const now = Date.now();
  const start = new Date(`${filters.startDate}T00:00:00.000Z`).getTime();
  const end = new Date(`${filters.endDate}T23:59:59.999Z`).getTime();
  return dataset.crmLeads
    .filter((lead) => {
      if (!leadMatchesReportScope(lead, filters, sellerName)) return false;
      if (!lead.active || lead.closedDate) return false;
      const assigned = lead.assignmentDate ?? lead.createDate;
      const assignedAt = assigned ? new Date(assigned).getTime() : NaN;
      if (!Number.isFinite(assignedAt) || assignedAt < start || assignedAt > end) return false;
      const stage = normalizeText(lead.stageName ?? '');
      return !isAgentLeadAttendedStage(stage);
    })
    .map((lead) => {
      const assignedAt = new Date(lead.assignmentDate ?? lead.createDate ?? '').getTime();
      const days = Number.isFinite(assignedAt) ? Math.max(0, Math.floor((now - assignedAt) / 86_400_000)) : 0;
      return {
        label: lead.name || lead.customerName || `Lead ${lead.id}`,
        customer: lead.customerName ?? 'Sin cliente',
        days,
        stage: lead.stageName ?? 'Sin etapa',
        email: lead.emailFrom ?? '-',
        phone: lead.phone ?? '-',
        expectedRevenue: lead.expectedRevenue,
      };
    });
}

export type AbandonedQuoteAnalysisLine = {
  amount: number;
  hasProductSignal: boolean;
};

export function isDeliveryOrderLine(line: OdooOrderLineRecord) {
  const productName = normalizeText(line.productName);
  return productName === 'entrega' || productName.includes('entrega') || productName.includes('flete');
}

export function isPlaceholderQuoteProductName(productName: string) {
  const normalized = normalizeText(productName).replace(/[[\]]/g, ' ');
  return normalized.includes('producto para cotizar');
}

export function buildAbandonedQuoteAnalysisIndex(
  abandonedQuotes: OdooOrderRecord[],
  linesByOrderId: Map<number, OdooOrderLineRecord[]>,
) {
  const index = new Map<number, AbandonedQuoteAnalysisLine>();
  abandonedQuotes.forEach((quote) => {
    const lines = linesByOrderId.get(quote.id) ?? [];
    index.set(quote.id, calculateAbandonedQuoteAnalysisAmount(lines));
  });
  return index;
}

export function calculateAbandonedQuoteAnalysisAmount(lines: OdooOrderLineRecord[]): AbandonedQuoteAnalysisLine {
  const includedLines = lines.filter((line) => !isPlaceholderQuoteProductName(line.productName));
  const amount = includedLines.reduce((total, line) => total + Math.max(line.untaxedAmount, 0), 0);
  return {
    amount,
    hasProductSignal: includedLines.some((line) => !isDeliveryOrderLine(line)),
  };
}

export function groupOrderLinesByOrderId(lines: OdooOrderLineRecord[]) {
  const grouped = new Map<number, OdooOrderLineRecord[]>();
  lines.forEach((line) => {
    const current = grouped.get(line.orderId) ?? [];
    current.push(line);
    grouped.set(line.orderId, current);
  });
  return grouped;
}

export type PreparedExecutiveSummary = {
  snapshot: CommercialDashboardSnapshot;
  customerBalance: AgentCustomerBalance;
  crmBalance: AgentCrmBalance;
  leadAttention: AgentLeadAttention[];
  crossSellOpportunities: AgentCrossSellOpportunity[];
  abandonedQuoteBalance: AgentAbandonedQuoteBalance;
  currentMargin: AgentInvoiceMarginResult;
  previousMargin: AgentInvoiceMarginResult | null;
  notifications: SalesAgentNotificationDraft[];
  monthlyValues: Record<string, number>;
};

export function prepareExecutiveDataset(dataset: OdooCommercialDataset, filters: ReportFilters, config: ReportsConfig): OdooCommercialDataset {
  const snapshot = buildCommercialDashboard(dataset, filters, config);
  const profile = snapshot.agentProfile;
  const sellerName = filters.visibilityScope === 'own' ? profile?.sellerName ?? null : null;
  const customerBalance = buildAgentCustomerBalance(snapshot.clientLifecycle.rows, filters, profile?.clients.rows ?? [], dataset.customerContacts);
  const crmBalance = buildAgentCrmBalance(dataset, filters, sellerName);
  const leadAttention = buildAgentLeadAttention(dataset, filters, sellerName);
  const abandonedQuoteBalance = buildAgentAbandonedQuoteBalance(dataset, snapshot, sellerName, countAbandonedQuotesPreviousPeriod(dataset, snapshot));
  const currentMargin = buildAgentInvoiceMargin(dataset.invoiceLines, filters, dataset.invoiceAnalysisMargin);
  const previousMargin = dataset.previousInvoiceAnalysisMargin ? buildAgentInvoiceMargin([], filters, dataset.previousInvoiceAnalysisMargin) : null;
  const monthlyValues = {
    untaxedAmount: snapshot.invoicing.invoicedAmount.current, marginAmount: currentMargin.margin, marginPercent: currentMargin.marginPct ?? 0,
    quotations: snapshot.quoteSummary.totalQuotes.current, convertedQuotations: snapshot.quoteSummary.convertedQuotes,
    salesOrders: snapshot.sales.confirmedOrders.current, newCustomers: snapshot.sales.newCustomers.current,
    lostCustomers: customerBalance.lostCount, reactivatedCustomers: customerBalance.reactivatedCount,
    customersToReactivate: customerBalance.toReactivateCount, leadsAssigned: crmBalance.assigned, leadsAttended: crmBalance.attended,
    leadsPending: leadAttention.length, abandonedQuotations: abandonedQuoteBalance.current,
    ...Object.fromEntries(buildLeadAgeBands(leadAttention.map((lead) => lead.days)).map((band) => ['leadAge_' + band.id, band.count])),
  };
  const executiveSummary: PreparedExecutiveSummary = {
    // Raw invoice/order drilldowns load with their sidebar section, not with
    // the executive view. Chart-specific detail rows remain above in full.
    snapshot: { ...snapshot, details: { ...snapshot.details, pendingQuotes: [], previousPendingQuotes: [], expiredQuotes: [],
      cancelledQuotes: [], convertedQuotes: [], confirmedOrders: [], postedInvoices: [] } },
    customerBalance, crmBalance, leadAttention, abandonedQuoteBalance, currentMargin, previousMargin,
    crossSellOpportunities: buildAgentCrossSellOpportunities(dataset.invoiceLines, filters, dataset.customerContacts),
    notifications: buildSalesAgentNotifications(dataset), monthlyValues,
  };
  return { ...dataset, orders: [], orderLines: [], invoices: [], invoiceLines: [], customerFirstPurchases: [], customerContacts: [], crmLeads: [],
    purchaseOrders: [], purchaseOrderLines: [], vendorBills: [], vendorBillLines: [], executiveSummary };
}

