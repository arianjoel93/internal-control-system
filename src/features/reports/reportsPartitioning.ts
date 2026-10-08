import type {
  OdooCommercialDataset,
  OdooInvoiceAnalysisMargin,
  ReportFilters,
  ReportOption,
  ReportRequestedDomain,
} from './odooSalesCore';
import type { ReportLoadMode } from './reportsService';

export type ReportPartition = {
  startDate: string;
  endDate: string;
  period: 'current' | 'previous' | 'bridge';
};

export function buildReportPartitions(filters: ReportFilters): ReportPartition[] {
  const previousStart = shiftYearBack(filters.startDate);
  const previousEnd = shiftYearBack(filters.endDate);
  const historyStart = shiftDays(filters.startDate, -420);
  const partitions: ReportPartition[] = [];
  let cursor = historyStart < previousStart ? historyStart : previousStart;
  while (cursor <= filters.endDate) {
    const monthEnd = new Date(`${cursor}T00:00:00Z`);
    monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1, 0);
    const endDate = [
      formatDate(monthEnd), filters.endDate,
      dayBefore(previousStart), previousEnd, dayBefore(filters.startDate),
    ]
      .filter((value) => value >= cursor)
      .sort()[0];
    partitions.push({
      startDate: cursor,
      endDate,
      period: cursor >= previousStart && endDate <= previousEnd
        ? 'previous'
        : cursor >= filters.startDate ? 'current' : 'bridge',
    });
    cursor = dayAfter(endDate);
  }
  return partitions;
}

export async function fetchPartitionedCommercialDataset(
  filters: ReportFilters,
  requestedDomain: ReportRequestedDomain,
  fetchDataset: (
    filters: ReportFilters,
    requestedDomain: ReportRequestedDomain,
    loadMode: ReportLoadMode,
    reportContext: 'reports',
    forceRefresh: boolean,
  ) => Promise<OdooCommercialDataset>,
  forceRefreshCurrent = false,
): Promise<OdooCommercialDataset> {
  const partitions = buildReportPartitions(filters);
  const accumulator = createReportPartitionAccumulator();
  const completed = new Map<number, OdooCommercialDataset>();
  let nextIndex = 0;
  let nextToMerge = 0;
  await Promise.all(Array.from({ length: Math.min(2, partitions.length) }, async () => {
    while (nextIndex < partitions.length) {
      const index = nextIndex++;
      const partition = partitions[index];
      const dataset = await fetchDataset(
        { ...filters, startDate: partition.startDate, endDate: partition.endDate },
        requestedDomain,
        'partition',
        'reports',
        forceRefreshCurrent && partition.period === 'current' && partition.endDate === filters.endDate,
      );
      completed.set(index, dataset);
      while (completed.has(nextToMerge)) {
        accumulator.add(partitions[nextToMerge], completed.get(nextToMerge)!);
        completed.delete(nextToMerge);
        nextToMerge += 1;
      }
    }
  }));
  if (nextToMerge !== partitions.length) throw new Error('Faltan tramos para completar el reporte.');
  return accumulator.finish();
}

export function mergeReportPartitions(
  partitions: ReportPartition[],
  datasets: OdooCommercialDataset[],
): OdooCommercialDataset {
  if (!datasets.length || datasets.length !== partitions.length) throw new Error('Faltan tramos para completar el reporte.');
  const first = datasets[0];
  if (datasets.some((dataset) => dataset.database !== first.database || dataset.scopeApplied !== first.scopeApplied)) {
    throw new Error('Los tramos del reporte pertenecen a bases o alcances distintos.');
  }
  const current = datasets.filter((_, index) => partitions[index].period === 'current');
  const previous = datasets.filter((_, index) => partitions[index].period === 'previous');
  const newestFirst = [...datasets].sort((a, b) => b.fetchedAt.localeCompare(a.fetchedAt));
  const options = (key: keyof OdooCommercialDataset['availableFilters']): ReportOption[] => {
    const map = new Map<string, ReportOption>();
    current.forEach((dataset) => dataset.availableFilters[key].forEach((option) => map.set(String(option.id), option)));
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, 'es-MX'));
  };
  const contacts = new Map<number, OdooCommercialDataset['customerContacts'][number]>();
  datasets.forEach((dataset) => dataset.customerContacts.forEach((row) => contacts.set(row.customerId, row)));
  const purchases = new Map<string, OdooCommercialDataset['customerFirstPurchases'][number]>();
  datasets.forEach((dataset) => dataset.customerFirstPurchases.forEach((row) => {
    const key = `${row.customerId}:${row.sellerId}`;
    const previousRow = purchases.get(key);
    if (!previousRow || (row.invoiceDate && (!previousRow.invoiceDate || row.invoiceDate < previousRow.invoiceDate))) {
      purchases.set(key, row);
    }
  }));
  const drillLinks: OdooCommercialDataset['drillLinks'] = {};
  Object.keys(first.drillLinks).forEach((key) => {
    const map = new Map<string, OdooCommercialDataset['drillLinks'][string][number]>();
    [...datasets].reverse().forEach((dataset) => (dataset.drillLinks[key] ?? []).forEach((link) => {
      map.set(`${link.model}:${link.recordId}`, link);
    }));
    drillLinks[key] = [...map.values()].slice(0, 25);
  });
  return {
    ...first,
    fetchedAt: datasets.map((dataset) => dataset.fetchedAt).sort().at(-1) ?? first.fetchedAt,
    warnings: [...new Set(datasets.flatMap((dataset) => dataset.warnings))],
    dataQualityAlerts: [...new Set(datasets.flatMap((dataset) => dataset.dataQualityAlerts))],
    availableFilters: {
      companies: options('companies'), sellers: options('sellers'), teams: options('teams'),
      customers: options('customers'), products: options('products'), categories: options('categories'),
      currencies: options('currencies'), channels: options('channels'),
    },
    orders: mergeRecordsById(newestFirst.map((dataset) => dataset.orders)),
    orderLines: mergeRecordsById(newestFirst.map((dataset) => dataset.orderLines)),
    invoices: mergeRecordsById(newestFirst.map((dataset) => dataset.invoices)),
    invoiceLines: mergeRecordsById(newestFirst.map((dataset) => dataset.invoiceLines)),
    crmLeads: mergeRecordsById(newestFirst.map((dataset) => dataset.crmLeads)),
    purchaseOrders: mergeRecordsById(datasets.map((dataset) => dataset.purchaseOrders)),
    purchaseOrderLines: mergeRecordsById(datasets.map((dataset) => dataset.purchaseOrderLines)),
    vendorBills: mergeRecordsById(datasets.map((dataset) => dataset.vendorBills)),
    vendorBillLines: mergeRecordsById(datasets.map((dataset) => dataset.vendorBillLines)),
    customerContacts: [...contacts.values()],
    customerFirstPurchases: [...purchases.values()],
    invoiceAnalysisMargin: mergeInvoiceMargins(current.map((dataset) => dataset.invoiceAnalysisMargin)),
    previousInvoiceAnalysisMargin: mergeInvoiceMargins(previous.map((dataset) => dataset.invoiceAnalysisMargin)),
    drillLinks,
  };
}

function mergeRecordsById<T extends { id: number }>(groups: T[][]): T[] {
  // Keep only numeric identifiers in the dedupe index. A Map retaining a
  // second reference to every large Odoo record causes a significant peak
  // memory spike while annual partitions are merged.
  const seenIds = new Set<number>();
  const merged: T[] = [];
  groups.forEach((rows) => rows.forEach((row) => {
    if (seenIds.has(row.id)) return;
    seenIds.add(row.id);
    merged.push(row);
  }));
  return merged;
}

// Consume one persisted month at a time. Keeping all decompressed months alive
// duplicates CRM, contacts, and orders present under multiple event dates.
export function createReportPartitionAccumulator() {
  const keys = ['orders', 'orderLines', 'invoices', 'invoiceLines', 'crmLeads', 'purchaseOrders', 'purchaseOrderLines', 'vendorBills', 'vendorBillLines'] as const;
  type IndexedRow = { row: unknown; fetchedAt: string; partitionIndex: number; rowIndex: number };
  const records = Object.fromEntries(keys.map((key) => [key, new Map<number, IndexedRow>()])) as Record<typeof keys[number], Map<number, IndexedRow>>;
  const contacts = new Map<number, OdooCommercialDataset['customerContacts'][number]>();
  const purchases = new Map<string, OdooCommercialDataset['customerFirstPurchases'][number]>();
  const metadata: OdooCommercialDataset[] = [];
  const partitions: ReportPartition[] = [];
  return {
    add(partition: ReportPartition, dataset: OdooCommercialDataset) {
      const partitionIndex = partitions.length;
      partitions.push(partition);
      for (const key of keys) dataset[key].forEach((row, rowIndex) => {
        const old = records[key].get(row.id);
        if (!old || dataset.fetchedAt > old.fetchedAt) records[key].set(row.id, { row, fetchedAt: dataset.fetchedAt, partitionIndex, rowIndex });
      });
      for (const row of dataset.customerContacts) contacts.set(row.customerId, row);
      for (const row of dataset.customerFirstPurchases) {
        const key = `${row.customerId}:${row.sellerId}`;
        const old = purchases.get(key);
        if (!old || (row.invoiceDate && (!old.invoiceDate || row.invoiceDate < old.invoiceDate))) purchases.set(key, row);
      }
      metadata.push({ ...dataset, orders: [], orderLines: [], invoices: [], invoiceLines: [], crmLeads: [],
        purchaseOrders: [], purchaseOrderLines: [], vendorBills: [], vendorBillLines: [], customerContacts: [], customerFirstPurchases: [] });
    },
    finish(): OdooCommercialDataset {
      const result = mergeReportPartitions(partitions, metadata);
      for (const key of keys) {
        // Each table keeps its existing record type; the shared index only
        // relies on the numeric primary key common to those types.
        (result[key] as unknown[]) = [...records[key].values()]
          .sort((a, b) => b.fetchedAt.localeCompare(a.fetchedAt) || a.partitionIndex - b.partitionIndex || a.rowIndex - b.rowIndex)
          .map((entry) => entry.row);
        records[key].clear();
      }
      result.customerContacts = [...contacts.values()];
      result.customerFirstPurchases = [...purchases.values()];
      contacts.clear(); purchases.clear(); metadata.length = 0;
      return result;
    },
  };
}

function mergeInvoiceMargins(values: Array<OdooInvoiceAnalysisMargin | null | undefined>): OdooInvoiceAnalysisMargin | null {
  if (!values.length) return null;
  const categories = new Map<string, { category: string; margin: number; untaxed: number }>();
  values.forEach((value) => value?.categories.forEach((row) => {
    const bucket = categories.get(row.category) ?? { category: row.category, margin: 0, untaxed: 0 };
    bucket.margin += row.margin;
    bucket.untaxed += row.untaxed;
    categories.set(row.category, bucket);
  }));
  const margin = values.reduce((total, value) => total + (value?.margin ?? 0), 0);
  const untaxed = values.reduce((total, value) => total + (value?.untaxed ?? 0), 0);
  return {
    available: values.every((value) => value?.available === true),
    categories: [...categories.values()].map((row) => ({
      ...row, marginPct: row.untaxed ? row.margin / row.untaxed * 100 : null,
    })).sort((a, b) => b.margin - a.margin),
    margin, untaxed,
    marginPct: untaxed ? margin / untaxed * 100 : null,
    rowCount: values.reduce((total, value) => total + (value?.rowCount ?? 0), 0),
  };
}

function shiftYearBack(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  const year = date.getUTCFullYear() - 1;
  const month = date.getUTCMonth();
  const day = Math.min(date.getUTCDate(), new Date(Date.UTC(year, month + 1, 0)).getUTCDate());
  return formatDate(new Date(Date.UTC(year, month, day)));
}

function dayAfter(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return formatDate(date);
}

function dayBefore(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return formatDate(date);
}

function shiftDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDate(date);
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
