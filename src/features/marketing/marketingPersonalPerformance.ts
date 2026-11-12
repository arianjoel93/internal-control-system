import type {
  OdooCommercialDataset,
  OdooCrmLeadRecord,
  OdooInvoiceRecord,
  OdooOrderRecord,
  ReportFilters,
} from '../reports/odooSalesCore';
// @ts-expect-error Node strip-types resolution requires the .ts suffix.
import { marketingCrmDateKey, marketingLostLeadsForPeriod, marketingNewLeadsForPeriod } from './marketingLeadData.ts';

type LinkedDocument<T> = { document: T; lead: OdooCrmLeadRecord };
export type PersonalMarketingCrmFollowUp = {
  lead: OdooCrmLeadRecord;
  firstPurchaseDate: string;
  crmWonDate: string | null;
  delayDays: number;
};

export type PersonalMarketingPeriod = {
  billedAmount: number;
  billedCustomers: number;
  createdLeads: OdooCrmLeadRecord[];
  createdWithQuote: number;
  firstSoldLeadIds: number[];
  invoices: LinkedDocument<OdooInvoiceRecord>[];
  lostLeads: OdooCrmLeadRecord[];
  delayedCrmWins: PersonalMarketingCrmFollowUp[];
  medianDelayDays: number | null;
  openQuotes: LinkedDocument<OdooOrderRecord>[];
  openQuoteAmount: number;
  quoteAmount: number;
  quotes: LinkedDocument<OdooOrderRecord>[];
  quotedLeadIds: number[];
  pendingCrmWins: PersonalMarketingCrmFollowUp[];
  series: Array<{ label: string; quoted: number; billed: number }>;
  wonLeads: OdooCrmLeadRecord[];
};

const DAY_MS = 86_400_000;
const QUOTE_STATES = new Set(['draft', 'sent', 'sale', 'done']);

function inPeriod(date: string | null | undefined, filters: ReportFilters) {
  const key = marketingCrmDateKey(date);
  return Boolean(key && key >= filters.startDate && key <= filters.endDate);
}

function crmWonDate(lead: OdooCrmLeadRecord) {
  const stage = `${lead.stageName ?? ''}`.toLocaleLowerCase('es-MX');
  const won = lead.stageIsWon ?? (lead.probability >= 100 || stage.includes('ganad') || stage === 'won');
  return lead.active !== false && won ? marketingCrmDateKey(lead.closedDate) : null;
}

function matchingLead(
  byCustomer: Map<number, OdooCrmLeadRecord[]>,
  customerId: number | null,
  companyId: number | null,
  sellerId: number | null,
  documentDate: string,
) {
  if (!customerId) return null;
  const candidates = (byCustomer.get(customerId) ?? []).filter((lead) => {
    const created = marketingCrmDateKey(lead.createDate);
    return Boolean(created && created <= documentDate &&
      (!lead.companyId || !companyId || lead.companyId === companyId) &&
      (!lead.sellerId || !sellerId || lead.sellerId === sellerId));
  });
  candidates.sort((a, b) => {
    const sellerA = Boolean(sellerId && a.sellerId === sellerId);
    const sellerB = Boolean(sellerId && b.sellerId === sellerId);
    return Number(sellerB) - Number(sellerA) ||
      (b.createDate ?? '').localeCompare(a.createDate ?? '') || b.id - a.id;
  });
  return candidates[0] ?? null;
}

function buildValueSeries(
  quotes: LinkedDocument<OdooOrderRecord>[],
  invoices: LinkedDocument<OdooInvoiceRecord>[],
  filters: ReportFilters,
) {
  const start = Date.parse(`${filters.startDate}T00:00:00Z`);
  const end = Date.parse(`${filters.endDate}T00:00:00Z`);
  const days = Math.max(1, Math.round((end - start) / DAY_MS) + 1);
  const count = days <= 14 ? days : days <= 90 ? 6 : Math.min(12, Math.ceil(days / 30));
  const result = Array.from({ length: count }, (_, index) => {
    const date = new Date(start + Math.floor(index * days / count) * DAY_MS);
    return {
      label: new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(date),
      quoted: 0,
      billed: 0,
    };
  });
  const indexFor = (date: string) => Math.min(count - 1,
    Math.max(0, Math.floor(((Date.parse(`${date}T00:00:00Z`) - start) / DAY_MS) * count / days)));
  quotes.forEach(({ document }) => {
    const date = marketingCrmDateKey(document.createDate ?? document.quotationDate);
    if (date) result[indexFor(date)].quoted += document.amountUntaxed;
  });
  invoices.forEach(({ document }) => {
    const date = marketingCrmDateKey(document.invoiceDate);
    if (date) result[indexFor(date)].billed += document.untaxedAmountSigned;
  });
  return result;
}

export function buildPersonalMarketingPeriod(
  dataset: OdooCommercialDataset,
  filters: ReportFilters,
  creatorId: number,
): PersonalMarketingPeriod {
  const allLeads = dataset.crmLeads ?? [];
  const myLeads = allLeads.filter((lead) => lead.creatorId === creatorId);
  const byCustomer = new Map<number, OdooCrmLeadRecord[]>();
  allLeads.forEach((lead) => {
    if (!lead.customerId || !lead.createDate) return;
    const group = byCustomer.get(lead.customerId) ?? [];
    group.push(lead);
    byCustomer.set(lead.customerId, group);
  });
  const firstSaleByLeadId = new Map<number, string>();
  (dataset.customerFirstPurchases ?? []).forEach((purchase) => {
    const date = marketingCrmDateKey(purchase.invoiceDate);
    if (!date) return;
    const lead = matchingLead(byCustomer, purchase.customerId, purchase.companyId ?? null, purchase.sellerId, date);
    if (lead?.creatorId === creatorId) firstSaleByLeadId.set(lead.id, date);
  });

  const quotes: LinkedDocument<OdooOrderRecord>[] = [];
  const seenOrders = new Set<number>();
  (dataset.orders ?? []).forEach((document) => {
    if (seenOrders.has(document.id) || !QUOTE_STATES.has(document.state) ||
      !inPeriod(document.createDate ?? document.quotationDate, filters)) return;
    seenOrders.add(document.id);
    const date = marketingCrmDateKey(document.createDate ?? document.quotationDate);
    const lead = date ? matchingLead(byCustomer, document.customerId, document.companyId, document.sellerId, date) : null;
    if (lead?.creatorId === creatorId) quotes.push({ document, lead });
  });

  const firstInvoiceByCustomer = new Map((dataset.customerFirstPurchases ?? [])
    .filter((row) => row.customerId && row.firstInvoiceId)
    .map((row) => [row.customerId as number, row.firstInvoiceId as number]));
  const invoices: LinkedDocument<OdooInvoiceRecord>[] = [];
  const firstSales: OdooCrmLeadRecord[] = [];
  const seenInvoices = new Set<number>();
  (dataset.invoices ?? []).forEach((document) => {
    if (seenInvoices.has(document.id) || document.state !== 'posted' || document.moveType !== 'out_invoice' ||
      !inPeriod(document.invoiceDate, filters) || !document.customerId ||
      firstInvoiceByCustomer.get(document.customerId) !== document.id) return;
    seenInvoices.add(document.id);
    const date = marketingCrmDateKey(document.invoiceDate);
    const lead = date ? matchingLead(byCustomer, document.customerId, document.companyId, document.sellerId, date) : null;
    if (lead?.creatorId === creatorId) {
      invoices.push({ document, lead });
      firstSales.push(lead);
    }
  });
  const firstInvoiceByName = new Map(invoices.filter((row) => row.document.name?.trim())
    .map((row) => [row.document.name.trim().toLowerCase(), row]));
  (dataset.invoices ?? []).forEach((document) => {
    if (seenInvoices.has(document.id) || document.state !== 'posted' || document.moveType !== 'out_refund' ||
      !inPeriod(document.invoiceDate, filters) || !document.invoiceOrigin) return;
    const original = firstInvoiceByName.get(document.invoiceOrigin.trim().toLowerCase());
    if (!original || document.customerId !== original.document.customerId ||
      document.companyId !== original.document.companyId) return;
    seenInvoices.add(document.id);
    invoices.push({ document, lead: original.lead });
  });
  invoices.sort((a, b) => (a.document.invoiceDate ?? '').localeCompare(b.document.invoiceDate ?? '') ||
    a.document.id - b.document.id);

  const createdLeads = marketingNewLeadsForPeriod(myLeads, filters);
  const quotedLeadIds = [...new Set(quotes.map(({ lead }) => lead.id))];
  const quotedSet = new Set(quotedLeadIds);
  const openQuotes = quotes.filter(({ document }) => document.state === 'draft' || document.state === 'sent');
  const wonLeads = [...new Map(myLeads.filter((lead) => {
    const conversionDate = [crmWonDate(lead), firstSaleByLeadId.get(lead.id)]
      .filter((date): date is string => Boolean(date)).sort()[0];
    return inPeriod(conversionDate, filters);
  }).map((lead) => [lead.id, lead])).values()];
  const followUps = myLeads.flatMap((lead) => {
    const firstPurchaseDate = firstSaleByLeadId.get(lead.id);
    if (!firstPurchaseDate) return [];
    const wonDate = crmWonDate(lead);
    const delayDays = wonDate
      ? Math.max(0, Math.round((Date.parse(`${wonDate}T00:00:00Z`) - Date.parse(`${firstPurchaseDate}T00:00:00Z`)) / DAY_MS))
      : 0;
    return [{ lead, firstPurchaseDate, crmWonDate: wonDate, delayDays }];
  });
  const pendingCrmWins = followUps.filter((row) => inPeriod(row.firstPurchaseDate, filters) &&
    (!row.crmWonDate || row.crmWonDate > filters.endDate));
  const delayedCrmWins = followUps.filter((row) => row.crmWonDate && inPeriod(row.crmWonDate, filters) && row.delayDays > 0);
  const sortedDelays = delayedCrmWins.map((row) => row.delayDays).sort((a, b) => a - b);
  const middle = Math.floor(sortedDelays.length / 2);
  const medianDelayDays = sortedDelays.length
    ? (sortedDelays[middle] + sortedDelays[Math.floor((sortedDelays.length - 1) / 2)]) / 2 : null;

  return {
    billedAmount: invoices.reduce((sum, { document }) => sum + document.untaxedAmountSigned, 0),
    billedCustomers: new Set(invoices.map(({ document }) => document.customerId).filter(Boolean)).size,
    createdLeads,
    createdWithQuote: createdLeads.filter((lead) => quotedSet.has(lead.id)).length,
    firstSoldLeadIds: [...new Set(firstSales.map((lead) => lead.id))],
    invoices,
    lostLeads: marketingLostLeadsForPeriod(myLeads, filters),
    delayedCrmWins,
    medianDelayDays,
    openQuotes,
    openQuoteAmount: openQuotes.reduce((sum, { document }) => sum + document.amountUntaxed, 0),
    quoteAmount: quotes.reduce((sum, { document }) => sum + document.amountUntaxed, 0),
    quotes,
    quotedLeadIds,
    pendingCrmWins,
    series: buildValueSeries(quotes, invoices, filters),
    wonLeads,
  };
}
