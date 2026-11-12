import assert from 'node:assert/strict';
import test from 'node:test';

import { selectUniqueOdooCreatorByName } from '../marketing-creator-identity.ts';

test('vincula solo un usuario activo con nombre exacto', () => {
  const result = selectUniqueOdooCreatorByName([
    { id: 4, name: 'Valeria', active: true },
    { id: 5, name: 'Valeria Soporte', active: true },
    { id: 6, name: 'Valeria', active: false },
  ], '  VALERIA  ');
  assert.equal(result.status, 'linked');
  assert.equal(result.user?.id, 4);
});

test('no atribuye leads si el nombre es ambiguo o no coincide', () => {
  const rows = [{ id: 4, name: 'Ogarita', active: true }, { id: 5, name: 'Ogarita', active: true }];
  assert.equal(selectUniqueOdooCreatorByName(rows, 'Ogarita').status, 'ambiguous');
  assert.equal(selectUniqueOdooCreatorByName(rows, 'Valeria').status, 'not_found');
});
