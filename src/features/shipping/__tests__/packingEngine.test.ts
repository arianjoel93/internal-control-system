import assert from 'node:assert/strict';
import test from 'node:test';
import type { ShippingPackageType } from '../../../lib/types.ts';
import { expandOrderItems, generatePackingPlans, type PackingItem } from '../packingEngine.ts';

let productIdSequence = 1;
const smallBox = box('small', 10, 10, 10, 2);
const mediumBox = box('medium', 20, 20, 20, 10);
const flatBox = box('flat', 12, 8, 4, 5);
const narrowBox = box('narrow', 12, 4, 8, 5);

test('un producto cabe exactamente en una caja', () => {
  const plans = generatePackingPlans([item('Exacto', 10, 10, 10, 1)], [smallBox]);
  assert.equal(plans[0].valid, true);
  assert.equal(plans[0].packages.length, 1);
});

test('un producto no cabe por dimensiones aunque su volumen sea menor', () => {
  const plans = generatePackingPlans([item('Largo', 12, 5, 5, 1)], [smallBox]);
  assert.equal(plans[0].valid, false);
  assert.match(plans[0].warnings[0], /no cabe/);
});

test('un producto cabe únicamente si se rota', () => {
  const plans = generatePackingPlans([item('Rotable', 12, 8, 4, 1)], [narrowBox]);
  assert.equal(plans[0].valid, true);
});

test('respeta canRotate=false', () => {
  const plans = generatePackingPlans([item('No rotable', 12, 8, 4, 1, { canRotate: false })], [narrowBox]);
  assert.equal(plans[0].valid, false);
});

test('dos productos pequeños caben juntos', () => {
  const plans = generatePackingPlans([item('A', 5, 5, 5, 0.5), item('B', 5, 5, 5, 0.5)], [smallBox]);
  assert.equal(plans[0].valid, true);
  assert.equal(plans[0].packages.length, 1);
});

test('dos productos requieren cajas separadas', () => {
  const plans = generatePackingPlans([item('A', 10, 10, 10, 0.5), item('B', 10, 10, 10, 0.5)], [smallBox]);
  assert.equal(plans[0].valid, true);
  assert.equal(plans[0].packages.length, 2);
});

test('bloquea límite de peso', () => {
  const plans = generatePackingPlans([item('Pesado', 5, 5, 5, 3)], [smallBox]);
  assert.equal(plans[0].valid, false);
});

test('shipAlone crea paquete dedicado', () => {
  const plans = generatePackingPlans([item('Solo', 5, 5, 5, 0.5, { shipAlone: true }), item('B', 5, 5, 5, 0.5)], [smallBox]);
  assert.equal(plans[0].valid, true);
  assert.equal(plans[0].packages.length, 2);
});

test('sin embalajes activos devuelve error claro', () => {
  const plans = generatePackingPlans([item('A', 5, 5, 5, 1)], [{ ...smallBox, is_active: false }]);
  assert.equal(plans[0].valid, false);
  assert.match(plans[0].warnings[0], /No existen embalajes activos/);
});

test('si se desactiva un embalaje continúa con los activos', () => {
  const plans = generatePackingPlans([item('A', 15, 15, 15, 1)], [{ ...mediumBox, is_active: false }, box('large', 30, 30, 30, 20)]);
  assert.equal(plans[0].valid, true);
  assert.equal(plans[0].packages[0].packagingName, 'large');
});

test('los nuevos embalajes se contemplan automáticamente', () => {
  const plans = generatePackingPlans([item('A', 25, 25, 25, 1)], [smallBox, mediumBox, box('extra', 30, 30, 30, 20)]);
  assert.equal(plans[0].valid, true);
  assert.equal(plans[0].packages[0].packagingName, 'extra');
});

test('producto no cabe en ningún embalaje', () => {
  const plans = generatePackingPlans([item('Gigante', 100, 100, 100, 1)], [smallBox, mediumBox]);
  assert.equal(plans[0].valid, false);
});

test('expande 20 unidades del mismo rollo', () => {
  const expanded = expandOrderItems([{ lineId: 1, productId: 1, sku: 'R', productName: 'Rollo', quantity: 20, lengthCm: 5, widthCm: 5, heightCm: 5, weightKg: 0.2 }]);
  assert.equal(expanded.items.length, 20);
  const plans = generatePackingPlans(expanded.items, [mediumBox]);
  assert.equal(plans[0].valid, true);
});

test('ofrece alternativa con cada unidad en paquete separado', () => {
  const expanded = expandOrderItems([{ lineId: 1, productId: 1, sku: 'ETQ', productName: 'Caja de etiquetas', quantity: 5, lengthCm: 8, widthCm: 8, heightCm: 8, weightKg: 6 }]);
  const plans = generatePackingPlans(expanded.items, [mediumBox, box('bulk', 40, 40, 40, 40)]);
  const separated = plans.find((plan) => plan.strategy === 'SEPARATE_EACH_UNIT');

  assert.ok(separated);
  assert.equal(separated.valid, true);
  assert.equal(separated.packages.length, 5);
  assert.equal(separated.totalActualWeightKg, 30.5);
});

test('ofrece alternativas llenando embalajes pequeños o consolidando en uno mayor', () => {
  const expanded = expandOrderItems([{ lineId: 1, productId: 1, sku: 'ETQ', productName: 'Etiqueta', quantity: 5, lengthCm: 5, widthCm: 5, heightCm: 5, weightKg: 0.2 }]);
  const compact = box('compact', 10, 10, 5, 10);
  const consolidated = box('consolidated', 15, 15, 10, 10);
  const plans = generatePackingPlans(expanded.items, [compact, consolidated]);
  const compactPlan = plans.find((plan) => plan.strategy === 'SAME_BOX_TYPE' && plan.variantName === 'compact');
  const consolidatedPlan = plans.find((plan) => plan.strategy === 'SAME_BOX_TYPE' && plan.variantName === 'consolidated');

  assert.ok(compactPlan);
  assert.ok(consolidatedPlan);
  assert.equal(compactPlan.valid, true);
  assert.equal(consolidatedPlan.valid, true);
  assert.equal(compactPlan.packages.length, 2);
  assert.equal(consolidatedPlan.packages.length, 1);
});

test('orden mixta genera plan válido', () => {
  const expanded = expandOrderItems([
    { lineId: 1, productId: 1, sku: 'IMP', productName: 'Impresora', quantity: 2, lengthCm: 18, widthCm: 16, heightCm: 16, weightKg: 3 },
    { lineId: 2, productId: 2, sku: 'ROL', productName: 'Rollo', quantity: 12, lengthCm: 5, widthCm: 5, heightCm: 5, weightKg: 0.2 },
    { lineId: 3, productId: 3, sku: 'LEC', productName: 'Lector', quantity: 2, lengthCm: 8, widthCm: 4, heightCm: 4, weightKg: 0.3 },
  ]);
  const plans = generatePackingPlans(expanded.items, [mediumBox, box('large', 40, 40, 40, 30)]);
  assert.equal(expanded.errors.length, 0);
  assert.equal(plans[0].valid, true);
});

test('la recomendación por FedEx puede no ser la de menos cajas', () => {
  const plans = [
    { id: 'a', totalPackages: 1, cost: 600 },
    { id: 'b', totalPackages: 2, cost: 480 },
  ].sort((left, right) => left.cost - right.cost);
  assert.equal(plans[0].id, 'b');
});

function item(
  productName: string,
  lengthCm: number,
  widthCm: number,
  heightCm: number,
  weightKg: number,
  patch: Partial<PackingItem> = {},
): PackingItem {
  return {
    lineId: 1,
    productId: productIdSequence++,
    sku: productName,
    productName,
    unitIndex: 1,
    lengthCm,
    widthCm,
    heightCm,
    weightKg,
    canRotate: true,
    canStack: true,
    shipAlone: false,
    fragile: false,
    packingGroup: null,
    ...patch,
  };
}

function box(name: string, length: number, width: number, height: number, maxWeight: number): ShippingPackageType {
  return {
    id: name,
    carrier: 'FEDEX',
    name,
    internal_code: name.toUpperCase(),
    description: null,
    length,
    width,
    height,
    internal_length: length,
    internal_width: width,
    internal_height: height,
    external_length: length + 1,
    external_width: width + 1,
    external_height: height + 1,
    dimension_unit: 'CM',
    empty_weight: 0.1,
    weight_unit: 'KG',
    max_weight: maxWeight,
    is_active: true,
    sort_order: 10,
    fedex_packaging_type: 'YOUR_PACKAGING',
    created_at: '2026-08-25T00:00:00Z',
    updated_at: '2026-08-25T00:00:00Z',
  };
}
