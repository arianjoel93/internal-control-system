import assert from 'node:assert/strict';
import test from 'node:test';
import { buildReportPartitions, fetchPartitionedCommercialDataset, mergeReportPartitions } from '../reportsPartitioning.ts';
import type { OdooCommercialDataset, ReportFilters } from '../odooSalesCore.ts';

const filters = {
  startDate: '2026-01-01', endDate: '2026-10-01', visibilityScope: 'all',
} as ReportFilters;

function dataset(overrides: Partial<OdooCommercialDataset> = {}): OdooCommercialDataset {
  return {
    database: 'tectronic', fetchedAt: '2026-10-01T12:00:00Z', odooBaseUrl: 'https://example.odoo.com',
    scopeApplied: 'all', warnings: [], dataQualityAlerts: [],
    availableFilters: {
      companies: [], sellers: [], teams: [], customers: [], products: [], categories: [], currencies: [], channels: [],
    },
    orders: [], orderLines: [], invoices: [], invoiceLines: [], customerFirstPurchases: [], customerContacts: [],
    crmLeads: [], purchaseOrders: [], purchaseOrderLines: [], vendorBills: [], vendorBillLines: [], drillLinks: {},
    ...overrides,
  } as OdooCommercialDataset;
}

test('divide el año en meses, conserva los 420 días de historial y separa el año comparable', () => {
  const partitions = buildReportPartitions(filters);
  assert.equal(partitions[0].startDate, '2024-11-07');
  assert.equal(partitions.at(-1)?.endDate, '2026-10-01');
  assert.equal(partitions.filter((part) => part.period === 'previous')[0].startDate, '2025-01-01');
  assert.equal(partitions.filter((part) => part.period === 'previous').at(-1)?.endDate, '2025-10-01');
  assert.equal(partitions.filter((part) => part.period === 'current')[0].startDate, '2026-01-01');
  for (let index = 1; index < partitions.length; index += 1) {
    const previousEnd = new Date(`${partitions[index - 1].endDate}T00:00:00Z`);
    previousEnd.setUTCDate(previousEnd.getUTCDate() + 1);
    assert.equal(partitions[index].startDate, previousEnd.toISOString().slice(0, 10));
  }
});

test('combina registros sin duplicarlos y calcula porcentajes de margen ponderados', () => {
  const partitions = [
    { startDate: '2025-09-01', endDate: '2025-09-30', period: 'previous' as const },
    { startDate: '2026-09-01', endDate: '2026-09-30', period: 'current' as const },
    { startDate: '2026-10-01', endDate: '2026-10-01', period: 'current' as const },
  ];
  const margin = (amount: number, base: number) => ({
    available: true, margin: amount, untaxed: base, marginPct: amount / base * 100, rowCount: 1,
    categories: [{ category: 'Equipo', margin: amount, untaxed: base, marginPct: amount / base * 100 }],
  });
  const merged = mergeReportPartitions(partitions, [
    dataset({ invoiceAnalysisMargin: margin(5, 10) }),
    dataset({ invoices: [{ id: 9 } as OdooCommercialDataset['invoices'][number]], invoiceAnalysisMargin: margin(20, 100) }),
    dataset({ invoices: [{ id: 9 } as OdooCommercialDataset['invoices'][number]], invoiceAnalysisMargin: margin(10, 100) }),
  ]);
  assert.equal(merged.invoices.length, 1);
  assert.equal(merged.invoiceAnalysisMargin?.margin, 30);
  assert.equal(merged.invoiceAnalysisMargin?.marginPct, 15);
  assert.equal(merged.previousInvoiceAnalysisMargin?.margin, 5);
  assert.equal(merged.previousInvoiceAnalysisMargin?.marginPct, 50);
});

test('consulta los tramos con el modo acotado y actualiza solo el tramo vigente', async () => {
  const calls: Array<{ startDate: string; loadMode: string; forceRefresh: boolean }> = [];
  await fetchPartitionedCommercialDataset(filters, 'sales', async (part, _domain, loadMode, _context, forceRefresh) => {
    calls.push({ startDate: part.startDate, loadMode, forceRefresh });
    return dataset();
  }, true);
  assert.ok(calls.length > 12);
  assert.ok(calls.every((call) => call.loadMode === 'partition'));
  assert.equal(calls.filter((call) => call.forceRefresh).length, 1);
  assert.equal(calls.find((call) => call.forceRefresh)?.startDate, '2026-10-01');
});

test('la unión progresiva conserva el orden y toma la versión más reciente de cada registro', async () => {
  const smallFilters = { ...filters, startDate: '2026-09-30', endDate: '2026-10-01' };
  const partitions = buildReportPartitions(smallFilters);
  const datasets = partitions.map((part, index) => dataset({
    fetchedAt: new Date(Date.UTC(2026, 9, 1, 0, index)).toISOString(),
    orders: index === 0
      ? [{ id: 7, state: 'draft' } as OdooCommercialDataset['orders'][number]]
      : index === partitions.length - 1
        ? [{ id: 7, state: 'sale' } as OdooCommercialDataset['orders'][number],
          { id: 8 } as OdooCommercialDataset['orders'][number]]
        : [],
  }));
  const expected = mergeReportPartitions(partitions, datasets);
  let nextIndex = 0;
  const actual = await fetchPartitionedCommercialDataset(smallFilters, 'sales', async () => {
    const index = nextIndex++;
    await new Promise((resolve) => setTimeout(resolve, index % 2 ? 0 : 1));
    return datasets[index];
  });
  assert.deepEqual(actual.orders, expected.orders);
  assert.equal(actual.orders.find((order) => order.id === 7)?.state, 'sale');
  assert.deepEqual(actual.availableFilters, expected.availableFilters);
});
