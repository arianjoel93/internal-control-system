import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAgentHistoricalComparison } from '../agentHistoricalComparison.ts';
import type { AgentYearDimensionRow } from '../reportsAnalytics.ts';
import type { OdooInvoiceLineRecord, ReportFilters } from '../odooSalesCore.ts';

const filters = { startDate: '2026-09-01', endDate: '2026-09-30', stateScope: 'all' } as ReportFilters;
const row = (key: string, current: number): AgentYearDimensionRow => ({
  key, label: key, current, previous: 0, difference: current, differencePct: null,
  currentSharePct: 100, previousSharePct: 0,
});
const line = (invoiceId: number, values: Partial<OdooInvoiceLineRecord>): OdooInvoiceLineRecord => ({
  id: invoiceId, invoiceId, invoiceDate: '2026-09-15', invoiceState: 'posted',
  moveType: 'out_invoice', displayType: 'product', customerId: 5, customerName: 'Cliente Uno',
  productId: 9, productName: 'Etiqueta', ...values,
} as OdooInvoiceLineRecord);

test('compara la media por compra del cliente con suma y compras históricas', () => {
  const result = buildAgentHistoricalComparison(
    [row('customer:CLIENTE UNO', 300)],
    [line(1, {}), line(1, { id: 2 }), line(2, {}), line(3, { moveType: 'out_refund' })],
    filters,
    [{ dimension: 'customer', key: 'customer:CLIENTE UNO', totalAmount: 400, purchaseCount: 4 }],
    'customer',
  );
  assert.equal(result[0].periodPurchases, 2);
  assert.equal(result[0].current, 150);
  assert.equal(result[0].previous, 100);
  assert.equal(result[0].differencePct, 50);
});

test('agrupa entrega de PUBLICO EN GENERAL por el contacto real', () => {
  const result = buildAgentHistoricalComparison(
    [row('customer:EDWIN GARCIA', 120)],
    [line(1, { customerName: 'PUBLICO EN GENERAL', deliveryCustomerName: 'Edwin García, operador' })],
    filters, [], 'customer',
  );
  assert.equal(result[0].periodPurchases, 1);
  assert.equal(result[0].differencePct, null);
});

test('compara productos por ID y excluye facturas fuera del periodo', () => {
  const result = buildAgentHistoricalComparison(
    [row('id:9', 200)],
    [line(1, {}), line(2, { invoiceDate: '2026-08-31' }), line(3, { productId: 8 })],
    filters,
    [{ dimension: 'product', key: 'id:9', totalAmount: 300, purchaseCount: 3 }],
    'product',
  );
  assert.equal(result[0].periodPurchases, 1);
  assert.equal(result[0].differencePct, 100);
});
