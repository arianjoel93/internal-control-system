import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateFedexHistory, scoreFedexCandidate } from '../../../../supabase/functions/_shared/fedex-estimator.ts';

const target = {
  fedexZone: 'Z1', serviceCode: 'FEDEX_EXPRESS_SAVER', packageCount: 1,
  physicalWeight: 4, volumetricWeight: 5, billableWeight: 5,
  volumeCm3: 25_000, environment: 'PRODUCTION' as const, currency: 'MXN',
  now: new Date('2026-09-17T12:00:00Z'),
};

function candidate(id: string, amount: number, overrides: Partial<Parameters<typeof scoreFedexCandidate>[1]> = {}) {
  return {
    id, amount, currency: 'MXN', environment: 'PRODUCTION' as const,
    serviceCode: 'FEDEX_EXPRESS_SAVER', serviceName: 'Express Saver', packageCount: 1,
    physicalWeight: 4, volumetricWeight: 5, billableWeight: 5, volumeCm3: 25_000,
    fedexZone: 'Z1', createdAt: '2026-09-01T12:00:00Z', ...overrides,
  };
}

test('usa el peso facturable y premia un comparable exacto', () => {
  assert.equal(scoreFedexCandidate(target, candidate('exact', 100)), 100);
  assert.equal(scoreFedexCandidate(target, candidate('other-zone', 100, { fedexZone: 'Z9' })), 60);
});

test('calcula mediana ponderada, rango y elimina outliers robustos', () => {
  const result = estimateFedexHistory(target, [
    candidate('a', 100), candidate('b', 110), candidate('c', 105), candidate('d', 115), candidate('outlier', 900),
  ]);
  assert.equal(result.comparables.length, 5);
  assert.deepEqual(result.outlierQuoteIds, ['outlier']);
  assert.ok(result.estimatedAmount && result.estimatedAmount < 150);
  assert.ok(result.estimatedLow && result.estimatedHigh && result.estimatedLow <= result.estimatedHigh);
});

test('no mezcla moneda ni ambiente y devuelve insuficiente cuando no hay evidencia', () => {
  const result = estimateFedexHistory(target, [candidate('usd', 100, { currency: 'USD' }), candidate('sandbox', 100, { environment: 'SANDBOX' })]);
  assert.equal(result.confidence, 'INSUFICIENTE');
  assert.equal(result.estimatedAmount, null);
});
