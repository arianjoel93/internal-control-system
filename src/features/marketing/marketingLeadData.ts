import type { OdooCommercialDataset, OdooCrmLeadRecord, ReportFilters } from '../reports/odooSalesCore';

type InvoiceCustomerEntry = { amount: number; sellerAmounts: Map<number, number> };

export type MarketingLeadSourceRow = { name: string; count: number; won: number; invoiced: number };
export type MarketingLeadIntakePoint = { label: string; current: number; previous: number };

const DAY_MS = 86_400_000;
const marketingDateFormatter = new Intl.DateTimeFormat('en-CA', {
  day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Mexico_City',
});

export function marketingCrmDateKey(value: string | null | undefined) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return null;
  const parts = marketingDateFormatter.formatToParts(parsed);
  const read = (part: string) => parts.find((item) => item.type === part)?.value ?? '';
  return `${read('year')}-${read('month')}-${read('day')}`;
}

export function marketingNewLeadsForPeriod(leads: OdooCrmLeadRecord[], filters: ReportFilters) {
  return leads.filter((lead) => lead.createDate &&
    marketingCrmDateKey(lead.createDate)! >= filters.startDate && marketingCrmDateKey(lead.createDate)! <= filters.endDate);
}

export function buildMarketingLeadSourceRows(
  leads: OdooCrmLeadRecord[],
  isWon: (lead: OdooCrmLeadRecord) => boolean,
  invoicedLeadIds = new Set<number>(),
): MarketingLeadSourceRow[] {
  const bySource = new Map<string, MarketingLeadSourceRow>();
  leads.forEach((lead) => {
    const name = lead.sourceName?.trim() || (lead.mediumName?.trim() ? `Medio: ${lead.mediumName.trim()}` : 'Sin origen registrado');
    const key = name.toLocaleLowerCase('es-MX');
    const row = bySource.get(key) ?? { name, count: 0, won: 0, invoiced: 0 };
    row.count += 1;
    if (isWon(lead)) row.won += 1;
    if (invoicedLeadIds.has(lead.id)) row.invoiced += 1;
    bySource.set(key, row);
  });
  return [...bySource.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'es-MX'));
}

export function matchMarketingLeadsToInvoices(
  leads: OdooCrmLeadRecord[],
  dataset: OdooCommercialDataset,
  filters: ReportFilters,
) {
  const byCustomerSeller = new Map<string, OdooCrmLeadRecord[]>();
  leads.forEach((lead) => {
    if (!lead.customerId || !lead.sellerId || !lead.createDate) return;
    const key = `${lead.customerId}:${lead.sellerId}`;
    const matches = byCustomerSeller.get(key) ?? [];
    matches.push(lead);
    byCustomerSeller.set(key, matches);
  });
  byCustomerSeller.forEach((matches) => matches.sort((a, b) =>
    (marketingCrmDateKey(b.createDate) ?? '').localeCompare(marketingCrmDateKey(a.createDate) ?? '') || b.id - a.id));

  const invoicedLeadIds = new Set<number>();
  const invoices = (dataset.invoices ?? [])
    .filter((invoice) => invoice.state === 'posted' && invoice.moveType === 'out_invoice' &&
      invoice.untaxedAmountSigned > 0 && invoice.invoiceDate &&
      invoice.invoiceDate.slice(0, 10) >= filters.startDate && invoice.invoiceDate.slice(0, 10) <= filters.endDate)
    .sort((a, b) => (a.invoiceDate ?? '').localeCompare(b.invoiceDate ?? '') || a.id - b.id);
  invoices.forEach((invoice) => {
    const candidates = byCustomerSeller.get(`${invoice.customerId}:${invoice.sellerId}`) ?? [];
    const lead = candidates.find((candidate) => !invoicedLeadIds.has(candidate.id) &&
      (marketingCrmDateKey(candidate.createDate) ?? '') <= invoice.invoiceDate!.slice(0, 10) &&
      (!candidate.companyId || candidate.companyId === invoice.companyId));
    if (lead) invoicedLeadIds.add(lead.id);
  });
  return invoicedLeadIds;
}

export function buildMarketingLeadIntakeSeries(
  currentLeads: OdooCrmLeadRecord[],
  currentFilters: ReportFilters,
  previousLeads: OdooCrmLeadRecord[],
  previousFilters: ReportFilters,
): MarketingLeadIntakePoint[] {
  const start = Date.parse(`${currentFilters.startDate}T00:00:00Z`);
  const end = Date.parse(`${currentFilters.endDate}T00:00:00Z`);
  const days = Math.max(1, Math.round((end - start) / DAY_MS) + 1);
  const bins = days <= 14 ? days : days <= 90 ? 6 : Math.min(12, Math.ceil(days / 30));
  const current = Array<number>(bins).fill(0);
  const previous = Array<number>(bins).fill(0);
  const add = (leads: OdooCrmLeadRecord[], filters: ReportFilters, values: number[]) => {
    const rangeStart = Date.parse(`${filters.startDate}T00:00:00Z`);
    const rangeEnd = Date.parse(`${filters.endDate}T00:00:00Z`);
    const rangeDays = Math.max(1, Math.round((rangeEnd - rangeStart) / DAY_MS) + 1);
    leads.forEach((lead) => {
      const dateKey = marketingCrmDateKey(lead.createDate);
      const date = dateKey ? Date.parse(`${dateKey}T00:00:00Z`) : NaN;
      if (!Number.isFinite(date) || date < rangeStart || date > rangeEnd) return;
      const index = Math.min(bins - 1, Math.floor(((date - rangeStart) / DAY_MS) * bins / rangeDays));
      values[index] += 1;
    });
  };
  add(currentLeads, currentFilters, current);
  add(previousLeads, previousFilters, previous);
  const dateFormat = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return current.map((value, index) => {
    const offset = Math.floor(index * days / bins);
    return {
      label: dateFormat.format(new Date(start + offset * DAY_MS)),
      current: value,
      previous: previous[index],
    };
  });
}

export function marketingLeadsForPeriod(dataset: OdooCommercialDataset, filters: ReportFilters) {
  return (dataset.crmLeads ?? []).filter((lead) => {
    if (lead.active === false && !lead.closedDate) return false;
    return [lead.createDate, lead.assignmentDate, lead.closedDate, lead.writeDate].some((date) => {
      const dateKey = marketingCrmDateKey(date);
      return dateKey && dateKey >= filters.startDate && dateKey <= filters.endDate;
    });
  });
}

export function marketingAssignedLeadsForPeriod(leads: OdooCrmLeadRecord[], filters: ReportFilters) {
  return leads.filter((lead) => {
    const dateKey = marketingCrmDateKey(lead.assignmentDate);
    return Boolean(lead.sellerId) && Boolean(dateKey &&
      dateKey >= filters.startDate && dateKey <= filters.endDate);
  });
}

export function marketingWonLeadsForPeriod(leads: OdooCrmLeadRecord[], filters: ReportFilters) {
  return leads.filter((lead) => {
    const stage = `${lead.stageName ?? ''}`.toLocaleLowerCase('es-MX');
    const dateKey = marketingCrmDateKey(lead.closedDate);
    const won = lead.stageIsWon ?? (lead.probability >= 100 || stage.includes('ganad') || stage === 'won');
    return lead.active !== false && won && Boolean(dateKey &&
      dateKey >= filters.startDate && dateKey <= filters.endDate);
  });
}

export function marketingLostLeadsForPeriod(leads: OdooCrmLeadRecord[], filters: ReportFilters) {
  return leads.filter((lead) => {
    const dateKey = marketingCrmDateKey(lead.closedDate);
    return lead.active === false && lead.probability === 0 && Boolean(dateKey &&
      dateKey >= filters.startDate && dateKey <= filters.endDate);
  });
}

export function marketingStaleLeadsAtPeriodStart(leads: OdooCrmLeadRecord[], filters: ReportFilters) {
  const start = Date.parse(`${filters.startDate}T00:00:00Z`);
  return leads.filter((lead) => {
    if (lead.active === false || lead.probability >= 100 || !lead.sellerId) return false;
    const assigned = Date.parse(`${marketingCrmDateKey(lead.assignmentDate ?? lead.createDate) ?? ''}T00:00:00Z`);
    const lastActivity = Date.parse(`${marketingCrmDateKey(lead.writeDate ?? lead.createDate) ?? ''}T00:00:00Z`);
    return Number.isFinite(assigned) && Number.isFinite(lastActivity) &&
      assigned <= start - 60 * DAY_MS && lastActivity <= start - 60 * DAY_MS;
  });
}

export function marketingLeadCustomerInvoiceRows(
  leads: OdooCrmLeadRecord[], dataset: OdooCommercialDataset, filters: ReportFilters,
) {
  const leadsByCustomer = new Map<number, OdooCrmLeadRecord[]>();
  leads.forEach((lead) => {
    if (!lead.customerId || !lead.createDate) return;
    const group = leadsByCustomer.get(lead.customerId) ?? [];
    group.push(lead);
    leadsByCustomer.set(lead.customerId, group);
  });
  return (dataset.invoices ?? []).filter((invoice) => {
    const date = invoice.invoiceDate?.slice(0, 10);
    if (invoice.state !== 'posted' || !['out_invoice', 'out_refund'].includes(invoice.moveType) ||
      !date || date < filters.startDate || date > filters.endDate || !invoice.customerId) return false;
    const candidates = leadsByCustomer.get(invoice.customerId!) ?? [];
    return candidates.some((lead) => (marketingCrmDateKey(lead.createDate) ?? '') <= date &&
      (!lead.companyId || lead.companyId === invoice.companyId));
  });
}

export function sumMarketingLeadCustomerInvoices(
  leads: OdooCrmLeadRecord[], dataset: OdooCommercialDataset, filters: ReportFilters,
) {
  const invoices = marketingLeadCustomerInvoiceRows(leads, dataset, filters);
  let total = 0;
  const bySeller = new Map<number, number>();
  invoices.forEach((invoice) => {
    total += invoice.untaxedAmountSigned;
    if (invoice.sellerId) {
      bySeller.set(invoice.sellerId, (bySeller.get(invoice.sellerId) ?? 0) + invoice.untaxedAmountSigned);
    }
  });
  return { total, bySeller };
}

export function buildMarketingInvoiceCustomerIndex(dataset: OdooCommercialDataset, filters: ReportFilters) {
  const index = new Map<number, InvoiceCustomerEntry>();
  (dataset.invoices ?? []).forEach((invoice) => {
    if (!invoice.customerId || !invoice.invoiceDate || invoice.invoiceDate.slice(0, 10) < filters.startDate || invoice.invoiceDate.slice(0, 10) > filters.endDate) return;
    const entry = index.get(invoice.customerId) ?? { amount: 0, sellerAmounts: new Map<number, number>() };
    entry.amount += invoice.untaxedAmountSigned;
    if (invoice.sellerId) {
      entry.sellerAmounts.set(invoice.sellerId, (entry.sellerAmounts.get(invoice.sellerId) ?? 0) + invoice.untaxedAmountSigned);
    }
    index.set(invoice.customerId, entry);
  });
  return index;
}

export function sumMarketingInvoiceAmountsForCustomers(
  index: Map<number, InvoiceCustomerEntry>,
  customerIds: Set<number>,
  sellerId?: number | null,
) {
  return [...customerIds].reduce((total, customerId) => {
    const entry = index.get(customerId);
    if (!entry) return total;
    return total + (sellerId ? entry.sellerAmounts.get(sellerId) ?? 0 : entry.amount);
  }, 0);
}
