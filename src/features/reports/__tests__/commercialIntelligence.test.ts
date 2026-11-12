import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCommercialIntelligence, buildProductAffinity, classifyProfitabilityCustomer, type CustomerMarginAggregate } from '../commercialIntelligence.ts';
import type { OdooCommercialDataset, OdooInvoiceLineRecord, OdooOrderRecord, ReportFilters } from '../odooSalesCore.ts';

const filters = { startDate: '2026-09-01', endDate: '2026-09-30', companyId: 1,
  sellerId: null, teamId: null, customerId: null, productId: null, categoryId: null,
  currencyCode: null } as ReportFilters;
const line = (id: number, invoiceId: number, productId: number, overrides: Partial<OdooInvoiceLineRecord> = {}) => ({
  id, invoiceId, productId, productName: `SKU ${productId}`, customerId: 10, customerName: 'Cliente A',
  sellerId: 3, companyId: 1, invoiceDate: '2026-09-15', invoiceState: 'posted',
  moveType: 'out_invoice', displayType: 'product', quantity: 2, untaxedAmount: 100,
  analysisMarginAmount: 30, analysisUntaxedAmount: 100, linePurchaseUnitCost: null, ...overrides,
} as OdooInvoiceLineRecord);
const dataset = (invoiceLines: OdooInvoiceLineRecord[], orders: OdooOrderRecord[] = []) =>
  ({ invoiceLines, orders } as OdooCommercialDataset);

test('afinidad cuenta facturas compartidas, no líneas repetidas', () => {
  const result = buildProductAffinity(dataset([
    line(1, 101, 1), line(2, 101, 1), line(3, 101, 2),
    line(4, 102, 1), line(5, 102, 3),
    line(6, 103, 2, { invoiceDate: '2026-08-31' }),
  ]), filters);
  assert.equal(result.basketCount, 2);
  assert.equal(result.pairs.find((pair) => pair.firstId === 1 && pair.secondId === 2)?.invoices, 1);
  assert.equal(result.products.find((product) => product.id === 1)?.invoices, 2);
});

test('rentabilidad no usa margen inferido del costo estándar', () => {
  const result = buildCommercialIntelligence(dataset([
    line(1, 101, 1, { customerId: 10, customerName: 'A' }),
    line(2, 102, 2, { customerId: 20, customerName: 'B', analysisMarginAmount: null,
      marginAmount: 50, directMarginAvailable: false, linePurchaseUnitCost: null }),
    line(3, 103, 3, { customerId: 30, customerName: 'C', analysisMarginAmount: null,
      marginAmount: 40, directMarginAvailable: true, linePurchaseUnitCost: null }),
  ]), filters);
  assert.equal(result.profitabilityCoverage.analyzed, 2);
  assert.equal(result.profitabilityCoverage.missing, 1);
  assert.equal(result.customers.find((customer) => customer.id === '30')?.margin, 40);
});

test('usa agregados del Análisis de facturas aunque falte margen en las líneas del dataset', () => {
  const rows = [line(1, 101, 1, { displayType: null, analysisMarginAmount: null, marginAmount: null })];
  const margins: CustomerMarginAggregate[] = [{ partnerId: 10, partnerName: 'Cliente A', sales: 500, margin: 125, invoices: 2, lastPurchaseDate: '2026-09-19' }];
  const result = buildCommercialIntelligence(dataset(rows), filters, [], margins);
  assert.equal(result.customers.length, 1);
  assert.equal(result.customers[0].sales, 500);
  assert.equal(result.customers[0].marginPct, 25);
  assert.equal(result.customers[0].lastPurchaseDate, '2026-09-19');
  assert.equal(result.customers[0].orderCount, null);
});

test('un cliente exactamente en ambos umbrales pertenece al cuadrante alto', () => {
  assert.equal(classifyProfitabilityCustomer(500, 25, 500, 25), 'strategic');
  assert.equal(classifyProfitabilityCustomer(499, 25, 500, 25), 'profitable');
  assert.equal(classifyProfitabilityCustomer(500, 24.9, 500, 25), 'review');
  assert.equal(classifyProfitabilityCustomer(499, 24.9, 500, 25), 'lowVolume');
});

test('el detalle distingue pedidos confirmados de filas del reporte de facturas', () => {
  const order = { id: 501, customerId: 10, deliveryCustomerId: null, companyId: 1, sellerId: 3,
    state: 'sale', confirmationDate: '2026-09-20 10:00:00' } as OdooOrderRecord;
  const margins: CustomerMarginAggregate[] = [{ partnerId: 10, partnerName: 'Cliente A', sales: 500, margin: 125,
    invoices: 4, lastPurchaseDate: '2026-09-18' }];
  const result = buildCommercialIntelligence(dataset([line(1, 101, 1)], [order]), filters, [], margins);
  assert.equal(result.customers[0].orderCount, 1);
  assert.equal(result.customers[0].invoices, 4);
  assert.equal(result.customers[0].lastPurchaseDate, '2026-09-18');
});

test('cobertura usa existencia actual y demanda facturada, sin inventar stock', () => {
  const source = dataset([line(1, 101, 1, { quantity: 60 }), line(2, 102, 2, { quantity: 10 })]);
  const result = buildCommercialIntelligence(source, filters, [{ productId: 1, onHand: 10, forecast: 20, sku: 'A1' }]);
  assert.equal(result.demand.find((row) => row.productId === 1)?.risk, 'critical');
  assert.equal(result.demand.find((row) => row.productId === 2)?.risk, 'unknown');
  assert.equal(result.demand.find((row) => row.productId === 1)?.coverageDays, 5);
});

test('velocidad calcula cuartiles de órdenes confirmadas en periodo y compañía', () => {
  const order = (id: number, days: number, companyId = 1) => ({ id, sellerId: 3,
    sellerName: 'Agente', companyId, state: 'sale', createDate: `2026-09-${String(10 - days).padStart(2, '0')} 12:00:00`,
    confirmationDate: '2026-09-10 12:00:00' } as OdooOrderRecord);
  const result = buildCommercialIntelligence(dataset([], [order(1, 1), order(2, 2), order(3, 3), order(4, 4), order(5, 5, 2)]), filters);
  assert.equal(result.velocity[0].count, 4);
  assert.equal(result.velocity[0].median, 2.5);
  assert.equal(result.velocity[0].q1, 1.75);
});
