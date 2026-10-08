import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAnnualInvoiceComparison, buildCumulativeInvoiceComparison } from '../invoiceComparisonTrend.ts';

test('annual comparison uses monthly aggregates for both periods and keeps months aligned', () => {
  const comparison = buildAnnualInvoiceComparison([
    { period: 'current', grain: 'total', metric_month: '2026-01-01', untaxed_amount: 100, margin_amount: 40, invoice_count: 2 },
    { period: 'current', grain: 'total', metric_month: '2026-02-01', untaxed_amount: 120, margin_amount: 50, invoice_count: 3 },
    { period: 'previous', grain: 'total', metric_month: '2025-01-01', untaxed_amount: 90, margin_amount: 30, invoice_count: 1 },
    { period: 'previous', grain: 'total', metric_month: '2025-02-01', untaxed_amount: 125, margin_amount: 45, invoice_count: 4 },
    { period: 'current', grain: 'category', metric_month: '2026-01-01', untaxed_amount: 999 },
  ], 2026, '2026-02-16');

  assert.ok(comparison);
  const { points } = comparison;
  assert.equal(points.length, 2);
  assert.deepEqual(points.map(({ invoicedAmount, previousInvoicedAmount }) => [invoicedAmount, previousInvoicedAmount]), [[100, 90], [120, 125]]);
  assert.equal(points.every((point) => point.bucketKind === 'month'), true);
  assert.deepEqual([comparison.currentTotal, comparison.previousTotal, comparison.currentMargin, comparison.previousMargin], [220, 215, 90, 75]);
  assert.deepEqual([comparison.currentInvoiceCount, comparison.previousInvoiceCount], [5, 5]);
});

test('cumulative comparison makes positive period growth explicit even if monthly gap narrows', () => {
  const points = buildCumulativeInvoiceComparison([
    { bucketKey: '2026-01-01', label: 'ene', invoicedAmount: 200, previousInvoicedAmount: 100, previousLabel: 'ene', bucketKind: 'month' },
    { bucketKey: '2026-02-01', label: 'feb', invoicedAmount: 120, previousInvoicedAmount: 110, previousLabel: 'feb', bucketKind: 'month' },
    { bucketKey: '2026-03-01', label: 'mar', invoicedAmount: 100, previousInvoicedAmount: 150, previousLabel: 'mar', bucketKind: 'month' },
  ]);

  assert.equal(points.at(-1)?.accumulatedCurrent, 420);
  assert.equal(points.at(-1)?.accumulatedPrevious, 360);
  assert.equal(points.at(-1)?.accumulatedDifference, 60);
});

test('annual aggregates remain usable when the daily previous-year cache has shorter coverage', () => {
  const monthly = buildAnnualInvoiceComparison([
    { period: 'current', grain: 'total', metric_month: '2026-01-01', untaxed_amount: 200 },
    { period: 'current', grain: 'total', metric_month: '2026-02-01', untaxed_amount: 120 },
    { period: 'previous', grain: 'total', metric_month: '2025-01-01', untaxed_amount: 100 },
    { period: 'previous', grain: 'total', metric_month: '2025-02-01', untaxed_amount: 110 },
  ], 2026, '2026-02-16');
  const truncatedDailyPreviousTotal = 110;

  assert.ok(monthly);
  assert.equal(monthly.previousTotal, 210);
  assert.notEqual(monthly.previousTotal, truncatedDailyPreviousTotal);
  assert.equal(monthly.currentTotal - monthly.previousTotal, 110);
});

test('year-to-date comparison uses the aligned partial-month aggregates, not a full prior month', () => {
  const monthly = buildAnnualInvoiceComparison([
    { period: 'current', grain: 'total', metric_month: '2026-09-01', untaxed_amount: 62002806.25, margin_amount: 20000000, invoice_count: 15000 },
    { period: 'previous', grain: 'total', metric_month: '2025-09-01', untaxed_amount: 58003967.30, margin_amount: 19000000, invoice_count: 13000 },
    { period: 'current', grain: 'total', metric_month: '2026-10-01', untaxed_amount: 878124.24, margin_amount: 262119.04, invoice_count: 221 },
    { period: 'previous', grain: 'total', metric_month: '2025-10-01', untaxed_amount: 758926.17, margin_amount: 241934.11, invoice_count: 214 },
  ], 2026, '2026-10-05');

  assert.ok(monthly);
  assert.equal(monthly.currentTotal, 62880930.49);
  assert.equal(monthly.previousTotal, 58762893.47);
  assert.ok(monthly.currentTotal > monthly.previousTotal);
  assert.ok(Math.abs((monthly.currentTotal - monthly.previousTotal) - 4118037.02) < 0.001);
  assert.equal(monthly.points.at(-1)?.invoicedAmount, 878124.24);
  assert.equal(monthly.points.at(-1)?.previousInvoicedAmount, 758926.17);
});

test('closed-month annual comparison excludes the current partial month from both years', () => {
  const monthly = buildAnnualInvoiceComparison([
    { period: 'current', grain: 'total', metric_month: '2026-09-01', untaxed_amount: 8550179.97 },
    { period: 'previous', grain: 'total', metric_month: '2025-09-01', untaxed_amount: 5894748.66 },
    { period: 'current', grain: 'total', metric_month: '2026-10-01', untaxed_amount: 1000000 },
    { period: 'previous', grain: 'total', metric_month: '2025-10-01', untaxed_amount: 900000 },
  ], 2026, '2026-09-30');

  assert.ok(monthly);
  assert.equal(monthly.points.length, 9);
  assert.equal(monthly.points.at(-1)?.invoicedAmount, 8550179.97);
  assert.equal(monthly.currentTotal, 8550179.97);
  assert.equal(monthly.previousTotal, 5894748.66);
});

test('closed-month annual comparison reproduces the production Jan-Sep totals across currency rows', () => {
  const monthly = buildAnnualInvoiceComparison([
    { period: 'current', grain: 'total', metric_month: '2026-09-01', untaxed_amount: 40196823.42 },
    { period: 'current', grain: 'total', metric_month: '2026-09-01', untaxed_amount: 21805982.83 },
    { period: 'previous', grain: 'total', metric_month: '2025-09-01', untaxed_amount: 36465584.53 },
    { period: 'previous', grain: 'total', metric_month: '2025-09-01', untaxed_amount: 21538382.77 },
    { period: 'current', grain: 'total', metric_month: '2026-10-01', untaxed_amount: 1000000 },
    { period: 'previous', grain: 'total', metric_month: '2025-10-01', untaxed_amount: 900000 },
  ], 2026, '2026-09-30');

  assert.ok(monthly);
  assert.equal(monthly.currentTotal, 62002806.25);
  assert.equal(monthly.previousTotal, 58003967.30);
  assert.ok(Math.abs(monthly.currentTotal - monthly.previousTotal - 3998838.95) < 0.001);
  assert.equal(monthly.points.length, 9);
});
