import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAgentInvoiceAnalysisDomain, shiftDateOneYearBack, summarizeAgentMarginGroups } from '../core.ts';

test('compara el mismo rango del año anterior y ajusta el día bisiesto', () => {
  assert.equal(shiftDateOneYearBack('2026-09-01'), '2025-09-01');
  assert.equal(shiftDateOneYearBack('2026-09-30'), '2025-09-30');
  assert.equal(shiftDateOneYearBack('2024-02-29'), '2023-02-28');
});

test('filtra el análisis contable por facturas, vendedor, periodo y dimensiones seleccionadas', () => {
  const domain = buildAgentInvoiceAnalysisDomain({
    startDate: '2026-09-01', endDate: '2026-09-30', companyIds: [2],
    teamId: 4, customerId: 7, productId: 8, categoryId: 9,
  }, [101, 102], [33]);
  assert.deepEqual(domain, [
    ['move_id', 'in', [101, 102]],
    ['move_type', 'in', ['out_invoice', 'out_refund']],
    ['state', '=', 'posted'],
    ['invoice_date', '>=', '2026-09-01'],
    ['invoice_date', '<=', '2026-09-30'],
    ['invoice_user_id', 'in', [33]],
    ['company_id', 'in', [2]],
    ['team_id', '=', 4],
    ['partner_id', '=', 7],
    ['product_id', '=', 8],
    ['product_categ_id', '=', 9],
  ]);
});

test('gerencia consulta margen de toda la compañía o del vendedor elegido', () => {
  const filters = {
    startDate: '2026-09-01', endDate: '2026-09-30',
    visibilityScope: 'all', companyIds: [2],
  };
  const all = buildAgentInvoiceAnalysisDomain(filters, [101, 102], []);
  assert.ok(!all.some((condition) => condition[0] === 'invoice_user_id'));
  assert.deepEqual(all.find((condition) => condition[0] === 'company_id'), ['company_id', 'in', [2]]);

  const seller = buildAgentInvoiceAnalysisDomain({ ...filters, sellerIds: [33] }, [101, 102], []);
  assert.deepEqual(seller.find((condition) => condition[0] === 'invoice_user_id'), ['invoice_user_id', 'in', [33]]);
});

test('agrupa margen y porcentaje de Análisis de facturas, incluidas notas de crédito', () => {
  const result = summarizeAgentMarginGroups([
    { product_categ_id: [10, 'Etiquetas'], price_margin: 125, price_subtotal: 500, margin_percent: 25, __count: 3 },
    { product_categ_id: [20, 'Equipo'], price_margin: -10, price_subtotal: -40, margin_percent: 25, __count: 1 },
  ], true);
  assert.equal(result.available, true);
  assert.equal(result.margin, 115);
  assert.equal(result.untaxed, 460);
  assert.equal(result.marginPct, 25);
  assert.equal(result.rowCount, 4);
  assert.deepEqual(result.categories.map((row) => [row.category, row.marginPct]), [['Etiquetas', 25], ['Equipo', 25]]);
});

test('usa suma de margen y base si margin_percent no se puede agrupar', () => {
  const result = summarizeAgentMarginGroups([
    { product_categ_id: [10, 'Etiquetas'], price_margin: 15, price_subtotal: 60, __count: 1 },
  ], false);
  assert.equal(result.categories[0].marginPct, 25);
});
