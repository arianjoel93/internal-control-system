import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAgentCrossSellOpportunities, buildLeadAgeBands, buildRepurchaseAttentionRows } from '../agentDashboardInsights.ts';
import type { ClientLifecycleRow } from '../reportsAnalytics.ts';
import type { OdooInvoiceLineRecord, ReportFilters } from '../odooSalesCore.ts';

const filters: ReportFilters = {
  startDate: '2026-06-01', endDate: '2026-06-30', companyId: 1, sellerId: 7,
  companyIds: [1], sellerIds: [7], teamId: null, customerId: null, productId: null,
  categoryId: null, currencyCode: 'MXN', channel: null, stateScope: 'all', grouping: 'day',
  visibilityScope: 'own',
};

function line(partial: Partial<OdooInvoiceLineRecord>): OdooInvoiceLineRecord {
  return {
    id: 1, invoiceId: 20, invoiceName: 'INV-20', invoiceState: 'posted', moveType: 'out_invoice',
    invoiceDate: '2026-06-15', customerId: 42, customerName: 'Cliente Uno', deliveryCustomerId: null,
    deliveryCustomerName: null, sellerId: 7, sellerName: 'Vendedora', teamId: null, teamName: null,
    companyId: 1, companyName: 'Tectronic', currencyCode: 'MXN', productId: 8, productName: 'Etiqueta térmica',
    categoryId: 1, categoryName: 'Etiquetas', quantity: 1, untaxedAmount: 1000, totalAmount: 1160,
    unitCost: null, costAmount: null, marginAmount: null, linePurchaseUnitCost: null, standardUnitCost: null,
    discount: null, displayType: 'product', sourceOrderIds: [], sourceOrderNames: [], sourceSaleLineIds: [],
    ...partial,
  };
}

function lifecycleRow(id: number, daysAgo: number, averageGap: number, totalOrders = 4): ClientLifecycleRow {
  const end = new Date(`${filters.endDate}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() - daysAgo);
  return {
    customerId: id, customerName: `Cliente ${id}`, firstPurchaseDate: '2025-01-01T00:00:00.000Z',
    lastPurchaseDate: end.toISOString(), daysSinceLastPurchase: daysAgo, totalOrders,
    revenue: 10000, margin: 2000, averageTicket: 2500, averagePurchaseGapDays: averageGap,
    currentStatus: 'activo', previousStatus: 'activo', riskLevel: 'bajo', sellerName: 'Vendedora',
    rfmScore: '555', rfmSegment: 'Leal', isNewCustomer: false, isReactivated: false,
  };
}

test('agrupa los leads por antigüedad y conserva el total de la población', () => {
  const bands = buildLeadAgeBands([0, 2, 3, 5, 6, 10, 11, 40]);
  assert.deepEqual(bands.map(({ count }) => count), [2, 2, 2, 2]);
  assert.equal(bands.reduce((sum, band) => sum + band.count, 0), 8);
});

test('propone complemento únicamente con evidencia facturada y respeta filtros', () => {
  const opportunities = buildAgentCrossSellOpportunities([
    line({}),
    line({ id: 2, invoiceId: 21, invoiceName: 'INV-21', productName: 'Ribbon de cera', categoryName: 'Ribbon', untaxedAmount: 400 }),
    line({ id: 3, customerId: 90, customerName: 'Fuera de alcance', sellerId: 9, productName: 'Impresora TSC', categoryName: 'Equipo' }),
  ], filters);

  assert.equal(opportunities.length, 1);
  assert.equal(opportunities[0].customer, 'Cliente Uno');
  assert.equal(opportunities[0].purchased, 'Etiquetas');
  assert.match(opportunities[0].recommendation, /impresora/i);
  assert.equal(opportunities[0].revenue, 1000);
});

test('usa dirección de entrega para identificar facturas de público en general', () => {
  const opportunities = buildAgentCrossSellOpportunities([
    line({ customerName: 'PUBLICO EN GENERAL', deliveryCustomerName: 'Cliente Real, Contacto', productName: 'Impresora Zebra', categoryName: 'Equipo' }),
  ], filters);
  assert.equal(opportunities[0]?.customer, 'Cliente Real');
});

test('destaca atención temprana solo cuando se superó el ciclo promedio entre 60 y 90 días', () => {
  const rows = buildRepurchaseAttentionRows([
    lifecycleRow(1, 65, 40),
    lifecycleRow(2, 90, 95),
    lifecycleRow(3, 95, 80),
    lifecycleRow(4, 155, 30),
    lifecycleRow(5, 45, 30),
  ], filters);

  assert.equal(rows.find((row) => row.customer === 'Cliente 1')?.priority, 'Atención temprana');
  assert.equal(rows.find((row) => row.customer === 'Cliente 1')?.averageRepurchaseDays, 40);
  assert.equal(rows.some((row) => row.customer === 'Cliente 2'), false);
  assert.equal(rows.find((row) => row.customer === 'Cliente 3')?.priority, 'A reactivar');
  assert.equal(rows.find((row) => row.customer === 'Cliente 4')?.priority, 'Perdido');
  assert.equal(rows.find((row) => row.customer === 'Cliente 5')?.priority, 'Ciclo vencido');
});

test('marca como limitada la media con menos de tres compras', () => {
  const [row] = buildRepurchaseAttentionRows([lifecycleRow(8, 70, 40, 2)], filters);
  assert.equal(row?.historyConfidence, 'limitada');
});
