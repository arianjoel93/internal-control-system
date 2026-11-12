import assert from 'node:assert/strict';
import test from 'node:test';
import {
  aggregateInvoiceAnalysisGroups,
  allocatePublicInvoiceHistory,
  buildPreviousQuoteDomain,
  countOpenQuotes,
  customerBaselineKey,
  previousRange,
} from '../agent-summary-context.ts';

const filters = {
  startDate: '2026-09-24', endDate: '2026-09-30', stateScope: 'all',
  teamId: null, customerId: null, productId: null, categoryId: null,
  currencyCode: null, channel: null,
};

test('Odoo consulta cotizaciones draft creadas hasta el final del último día anterior', () => {
  const { domain, range } = buildPreviousQuoteDomain(filters, 7, 2);
  assert.deepEqual(range, { startDate: '2026-09-17', endDate: '2026-09-23' });
  assert.deepEqual(domain.slice(0, 3), [
    ['state', '=', 'draft'],
    ['create_date', '>=', '2026-09-17 00:00:00'],
    ['create_date', '<=', '2026-09-23 23:59:59'],
  ]);
  assert.deepEqual(previousRange({ startDate: '2026-09-01', endDate: '2026-09-30' }),
    { startDate: '2026-08-01', endDate: '2026-08-31' });
  assert.deepEqual(previousRange({ startDate: '2026-09-01', endDate: '2026-09-07' }),
    { startDate: '2026-08-25', endDate: '2026-08-31' });
  assert.deepEqual(previousRange({ startDate: '2026-07-01', endDate: '2026-09-30' }, 'current_quarter'),
    { startDate: '2026-04-01', endDate: '2026-06-30' });
  assert.deepEqual(previousRange({ startDate: '2026-07-01', endDate: '2026-09-15' }, 'current_quarter'),
    { startDate: '2026-04-01', endDate: '2026-06-30' });
  assert.deepEqual(previousRange({ startDate: '2026-01-01', endDate: '2026-09-30' }, 'current_year'),
    { startDate: '2025-01-01', endDate: '2025-09-30' });
});

test('ignora producto placeholder y cuenta cotizaciones con monto real', () => {
  const orders = [{ id: 1 }, { id: 2 }];
  const lines = [
    { order_id: [1, 'SO1'], product_id: [4, '[PRODUCTO PARA COTIZAR]'], price_subtotal: 1000 },
    { order_id: [2, 'SO2'], product_id: [5, 'Equipo'], price_subtotal: 500 },
  ];
  assert.equal(countOpenQuotes(orders, lines, filters), 1);
});

test('agrega monto neto y cuenta compras, no notas de crédito como compras', () => {
  const groups = [
    { partner_id: [5, 'Edwin García, operador'], move_type: 'out_invoice', total_amount: 300, purchase_count: 2 },
    { partner_id: [5, 'Edwin García, operador'], move_type: 'out_refund', total_amount: -50, purchase_count: 1 },
  ];
  assert.equal(customerBaselineKey('Edwin García, operador'), 'customer:EDWIN GARCIA');
  assert.deepEqual(aggregateInvoiceAnalysisGroups(groups, 'customer'), [
    { dimension: 'customer', key: 'customer:EDWIN GARCIA', totalAmount: 250, purchaseCount: 2 },
  ]);
});

test('asigna facturas de PUBLICO EN GENERAL al contacto de entrega antes de guardar su media', () => {
  const groups = [
    { partner_id: [1, 'PUBLICO EN GENERAL'], move_type: 'out_invoice', total_amount: 500, purchase_count: 2 },
    { partner_id: [2, 'Edwin García'], move_type: 'out_invoice', total_amount: 100, purchase_count: 1 },
  ];
  const moveGroups = [
    { move_id: [11, 'F-11'], move_type: 'out_invoice', total_amount: 300 },
    { move_id: [12, 'F-12'], move_type: 'out_invoice', total_amount: 200 },
  ];
  assert.deepEqual(allocatePublicInvoiceHistory(groups, moveGroups, new Map([
    [11, 'Edwin García, operador'], [12, 'Cliente nuevo'],
  ])), [
    { dimension: 'customer', key: 'customer:CLIENTE NUEVO', totalAmount: 200, purchaseCount: 1 },
    { dimension: 'customer', key: 'customer:EDWIN GARCIA', totalAmount: 400, purchaseCount: 2 },
  ]);
});
