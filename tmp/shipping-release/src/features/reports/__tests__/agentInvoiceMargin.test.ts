import assert from 'node:assert/strict';
import test from 'node:test';
import type { OdooInvoiceLineRecord, ReportFilters } from '../odooSalesCore.ts';
import { buildAgentInvoiceMargin } from '../agentInvoiceMargin.ts';

const filters = { startDate: '2026-09-01', endDate: '2026-09-30', stateScope: 'all' } as ReportFilters;
const line = (id: number, overrides: Partial<OdooInvoiceLineRecord>): OdooInvoiceLineRecord => ({
  id, invoiceId: id, invoiceName: `F-${id}`, invoiceState: 'posted', moveType: 'out_invoice',
  invoiceDate: '2026-09-15', categoryName: 'Equipos', categoryId: 1, displayType: 'product',
  analysisMarginAmount: 25, analysisUntaxedAmount: 100, ...overrides,
} as OdooInvoiceLineRecord);

test('margen de Análisis de facturas agrega notas de crédito por categoría sin estimar costos', () => {
  const result = buildAgentInvoiceMargin([
    line(1, {}),
    line(2, { moveType: 'out_refund', analysisMarginAmount: -5, analysisUntaxedAmount: -20 }),
    line(3, { invoiceDate: '2026-08-31', analysisMarginAmount: 1000 }),
    line(4, { invoiceState: 'draft', analysisMarginAmount: 1000 }),
    line(5, { displayType: 'tax', analysisMarginAmount: 1000 }),
  ], filters);
  assert.equal(result.available, true);
  assert.equal(result.margin, 20);
  assert.equal(result.untaxed, 80);
  assert.equal(result.marginPct, 25);
  assert.equal(result.lines.length, 2);
  assert.deepEqual(result.categories.map((category) => category.category), ['Equipos']);
});

test('dato incompleto se marca como no disponible en lugar de sustituir el margen de Odoo', () => {
  const result = buildAgentInvoiceMargin([line(1, {}), line(2, { analysisMarginAmount: null })], filters);
  assert.equal(result.available, false);
  assert.equal(result.missingLines, 1);
});

test('respeta filtros de categoría y producto', () => {
  const result = buildAgentInvoiceMargin([
    line(1, { productId: 3, categoryId: 1 }),
    line(2, { productId: 4, categoryId: 2 }),
  ], { ...filters, productId: 3, categoryId: 1 });
  assert.equal(result.lines.length, 1);
  assert.equal(result.margin, 25);
});

test('respeta compañía, vendedor y cliente del filtro aplicado', () => {
  const result = buildAgentInvoiceMargin([
    line(1, { companyId: 2, sellerId: 7, customerId: 30 }),
    line(2, { companyId: 3, sellerId: 7, customerId: 30 }),
    line(3, { companyId: 2, sellerId: 8, customerId: 30 }),
    line(4, { companyId: 2, sellerId: 7, customerId: 31 }),
  ], { ...filters, companyId: 2, sellerId: 7, customerId: 30 });
  assert.deepEqual(result.lines.map((item) => item.id), [1]);
  assert.equal(result.margin, 25);
});

test('el porcentaje total es ponderado por ventas y no el promedio simple de categorías', () => {
  const result = buildAgentInvoiceMargin([
    line(1, { categoryName: 'Servicios', categoryId: 1, analysisUntaxedAmount: 100, analysisMarginAmount: 80 }),
    line(2, { categoryName: 'Equipos', categoryId: 2, analysisUntaxedAmount: 900, analysisMarginAmount: 90 }),
  ], filters);
  assert.equal(result.margin, 170);
  assert.equal(result.untaxed, 1000);
  assert.equal(result.marginPct, 17);
  assert.deepEqual(result.categories.map((row) => [row.category, row.marginPct]), [
    ['Equipos', 10], ['Servicios', 80],
  ]);
});

test('usa directamente los agregados de account.invoice.report aunque la línea contable no tenga margen', () => {
  const result = buildAgentInvoiceMargin([line(1, { analysisMarginAmount: null })], filters, {
    available: true,
    categories: [{ category: 'Etiquetas', margin: 45.5, untaxed: 100, marginPct: 45.5 }],
    margin: 45.5,
    untaxed: 100,
    marginPct: 45.5,
    rowCount: 2,
  });
  assert.equal(result.available, true);
  assert.equal(result.margin, 45.5);
  assert.equal(result.categories[0].marginPct, 45.5);
  assert.equal(result.rowCount, 2);
});
