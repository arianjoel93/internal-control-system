import assert from 'node:assert/strict';
import test from 'node:test';

import { mergeCrmCreators, missingCrmCreatorIds } from '../crm-creator-cache.ts';

test('identifica solo leads antiguos sin el metadato de usuario de creación', () => {
  assert.deepEqual(missingCrmCreatorIds([
    { id: 7, name: 'Lead antiguo' },
    { id: 8, creatorId: 8, creatorName: 'María' },
    { id: 9, creatorId: null, creatorName: null },
    { id: 10, creatorName: 'Valeria' },
  ]), [7, 9, 10]);
});

test('completa create_uid sin modificar el vendedor ni los demás campos del lead', () => {
  const leads = [{ id: 7, name: 'Lead antiguo', sellerName: 'Ana' }, { id: 8, creatorId: 8, creatorName: 'María', sellerName: 'Luis' }, { id: 9, creatorName: 'Valeria' }, { id: 10, creatorId: null, creatorName: null }];
  const enriched = mergeCrmCreators(leads, [{ id: 7, create_uid: [41, 'Equipo de Marketing'] }, { id: 9, create_uid: [9, 'Valeria'] }, { id: 10, create_uid: [10, 'Ogarita'] }]);
  assert.deepEqual(enriched, [
    { id: 7, name: 'Lead antiguo', sellerName: 'Ana', creatorId: 41, creatorName: 'Equipo de Marketing' },
    { id: 8, creatorId: 8, creatorName: 'María', sellerName: 'Luis' },
    { id: 9, creatorId: 9, creatorName: 'Valeria' },
    { id: 10, creatorId: 10, creatorName: 'Ogarita' },
  ]);
  assert.deepEqual(leads[0], { id: 7, name: 'Lead antiguo', sellerName: 'Ana' });
});
