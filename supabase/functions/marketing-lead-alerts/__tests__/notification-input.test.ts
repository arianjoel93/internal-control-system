import assert from 'node:assert/strict';
import test from 'node:test';
import { notificationLeadIds } from '../notification-input.ts';

test('acciones individuales y por lote conservan solo identificadores numéricos seguros sin duplicados', () => {
  assert.deepEqual(notificationLeadIds([42, 42, 7, true, '8', null, {}, -1, 0, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]), [42, 7]);
  assert.deepEqual(notificationLeadIds([42]), [42]);
});

test('entradas ausentes o incorrectas no se convierten en una acción global', () => {
  for (const value of [undefined, null, {}, 'all', 42]) assert.deepEqual(notificationLeadIds(value), []);
});

test('los lotes se limitan a 500 identificadores únicos y permiten los lotes siguientes', () => {
  const ids = Array.from({ length: 1200 }, (_, i) => i + 1);
  assert.equal(notificationLeadIds(ids).length, 500);
  assert.deepEqual(notificationLeadIds(ids.slice(500, 1000)), ids.slice(500, 1000));
});
