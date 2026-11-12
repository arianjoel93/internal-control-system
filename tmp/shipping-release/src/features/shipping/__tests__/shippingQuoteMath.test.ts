import assert from 'node:assert/strict';
import test from 'node:test';
import type { ShippingPackageType } from '../../../lib/types.ts';
import {
  calculateVolumetricWeight,
  convertDimension,
  convertWeight,
  preparePackages,
  summarizePackages,
} from '../shippingQuoteMath.ts';

const smallBox: ShippingPackageType = {
  id: 'box-small',
  carrier: 'FEDEX',
  name: 'Embalaje pequeño',
  internal_code: 'SMALL',
  description: null,
  length: 30,
  width: 20,
  height: 15,
  dimension_unit: 'CM',
  empty_weight: 0.35,
  weight_unit: 'KG',
  max_weight: 10,
  is_active: true,
  sort_order: 10,
  fedex_packaging_type: 'YOUR_PACKAGING',
  created_at: '2026-08-24T00:00:00Z',
  updated_at: '2026-08-24T00:00:00Z',
};

test('convierte unidades de peso y dimensiones con precisión estable', () => {
  assert.equal(convertWeight(1, 'KG', 'LB'), 2.205);
  assert.equal(convertWeight(2.2046226218, 'LB', 'KG'), 1);
  assert.equal(convertDimension(2.54, 'CM', 'IN'), 1);
  assert.equal(convertDimension(1, 'IN', 'CM'), 2.54);
});

test('expande cantidades y suma tara cuando se captura peso de contenido', () => {
  const result = preparePackages({
    drafts: [{ id: 'draft-1', packageTypeId: smallBox.id, quantity: 3, contentWeight: 4 }],
    packageTypes: [smallBox],
    weightInputMode: 'NET_CONTENT',
  });

  assert.deepEqual(result.errors, []);
  assert.equal(result.packages.length, 3);
  assert.equal(result.packages[0].actualWeight, 4.35);
  assert.equal(result.packages[0].volumetricWeight, 1.8);
  assert.equal(result.packages[0].billableWeight, 4.35);
  assert.deepEqual(summarizePackages(result.packages), {
    packageCount: 3,
    contentWeight: 12,
    tareWeight: 1.05,
    actualWeight: 13.05,
    volumetricWeight: 5.4,
    billableWeight: 13.05,
  });
});

test('usa peso volumétrico cuando supera al peso real', () => {
  const largeBox = {
    ...smallBox,
    id: 'box-large',
    name: 'Embalaje grande',
    length: 60,
    width: 40,
    height: 40,
    max_weight: 30,
  } satisfies ShippingPackageType;
  const result = preparePackages({
    drafts: [{ id: 'draft-1', packageTypeId: largeBox.id, quantity: 1, contentWeight: 1 }],
    packageTypes: [largeBox],
    weightInputMode: 'NET_CONTENT',
  });

  assert.deepEqual(result.errors, []);
  assert.equal(calculateVolumetricWeight(largeBox), 19.2);
  assert.equal(result.packages[0].actualWeight, 1.35);
  assert.equal(result.packages[0].billableWeight, 19.2);
});

test('bloquea paquetes que superan el peso máximo configurado', () => {
  const result = preparePackages({
    drafts: [{ id: 'draft-1', packageTypeId: smallBox.id, quantity: 1, contentWeight: 12 }],
    packageTypes: [smallBox],
    weightInputMode: 'NET_CONTENT',
  });

  assert.equal(result.packages.length, 0);
  assert.match(result.errors[0], /supera el máximo permitido/);
});
