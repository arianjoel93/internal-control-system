import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveClosedMonthComparisonRange } from '../closed-month-comparison.ts';

test('6 de octubre compara enero-septiembre y omite octubre parcial', () => {
  assert.deepEqual(resolveClosedMonthComparisonRange(
    { startDate: '2026-01-01', endDate: '2026-10-06' },
    'all',
    new Date('2026-10-06T18:00:00.000Z'),
  ), {
    currentStartDate: '2026-01-01',
    currentEndDate: '2026-09-30',
    previousStartDate: '2025-01-01',
    previousEndDate: '2025-09-30',
    closedThroughMonth: 9,
  });
});

test('el primer día de noviembre ya incluye octubre completo', () => {
  assert.deepEqual(resolveClosedMonthComparisonRange(
    { startDate: '2026-01-01', endDate: '2026-11-01' },
    'all',
    new Date('2026-11-01T07:00:00.000Z'),
  ), {
    currentStartDate: '2026-01-01',
    currentEndDate: '2026-10-31',
    previousStartDate: '2025-01-01',
    previousEndDate: '2025-10-31',
    closedThroughMonth: 10,
  });
});

test('conserva el comparativo existente para agentes de venta y otros rangos', () => {
  const filters = { startDate: '2026-01-01', endDate: '2026-10-06' };
  assert.equal(resolveClosedMonthComparisonRange(filters, 'own', new Date('2026-10-06T18:00:00.000Z')), null);
  assert.equal(resolveClosedMonthComparisonRange(
    { startDate: '2026-09-01', endDate: '2026-09-30' },
    'all',
    new Date('2026-10-06T18:00:00.000Z'),
  ), null);
});
