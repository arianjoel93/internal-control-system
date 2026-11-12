import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPreviousMarketingFilters } from '../marketingPeriod.ts';
import type { ReportFilters } from '../../reports/odooSalesCore.ts';

const base: ReportFilters = {
  startDate: '2026-09-23', endDate: '2026-09-29',
  companyId: 4, companyIds: [4], sellerId: 7, sellerIds: [7], teamId: 2,
  customerId: 12, productId: null, categoryId: null, currencyCode: null,
  channel: null, stateScope: 'all', grouping: 'day', visibilityScope: 'all',
};

test('siete días se comparan con los siete días consecutivos anteriores y se conservan los filtros', () => {
  const previous = buildPreviousMarketingFilters(base);
  assert.equal(previous.startDate, '2026-09-16');
  assert.equal(previous.endDate, '2026-09-22');
  assert.deepEqual(previous.sellerIds, [7]);
  assert.deepEqual(previous.companyIds, [4]);
  assert.equal(previous.customerId, 12);
});

test('un mes completo se compara con el mes calendario anterior', () => {
  const previous = buildPreviousMarketingFilters({ ...base, startDate: '2026-08-01', endDate: '2026-08-31' });
  assert.equal(previous.startDate, '2026-07-01');
  assert.equal(previous.endDate, '2026-07-31');
});

test('un año completo se compara con el año anterior', () => {
  const previous = buildPreviousMarketingFilters({ ...base, startDate: '2025-01-01', endDate: '2025-12-31' });
  assert.equal(previous.startDate, '2024-01-01');
  assert.equal(previous.endDate, '2024-12-31');
});

test('treinta días usan una ventana anterior de igual duración', () => {
  const previous = buildPreviousMarketingFilters({ ...base, startDate: '2026-08-31', endDate: '2026-09-29' });
  assert.equal(previous.startDate, '2026-08-01');
  assert.equal(previous.endDate, '2026-08-30');
});

test('mes actual compara los mismos días transcurridos del mes anterior', () => {
  const previous = buildPreviousMarketingFilters(
    { ...base, startDate: '2026-09-01', endDate: '2026-09-29' },
    new Date('2026-09-29T12:00:00Z'),
  );
  assert.equal(previous.startDate, '2026-08-01');
  assert.equal(previous.endDate, '2026-08-29');
});

test('año actual compara el mismo avance del año anterior', () => {
  const previous = buildPreviousMarketingFilters(
    { ...base, startDate: '2026-01-01', endDate: '2026-09-29' },
    new Date('2026-09-29T12:00:00Z'),
  );
  assert.equal(previous.startDate, '2025-01-01');
  assert.equal(previous.endDate, '2025-09-29');
});

test('trimestre completo conserva límites de calendario', () => {
  const previous = buildPreviousMarketingFilters({ ...base, startDate: '2026-04-01', endDate: '2026-06-30' });
  assert.equal(previous.startDate, '2026-01-01');
  assert.equal(previous.endDate, '2026-03-31');
});
