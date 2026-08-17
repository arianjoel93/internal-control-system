import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildShippingPackages,
  normalizeManualPackages,
  transformPackagesToFedexLineItems,
  validateManualPackages,
  type PackingLine,
  type ProductShippingProfile,
  type ShippingBox,
} from './packing.ts';

const smallBox: ShippingBox = {
  id: 'small',
  name: 'Caja chica',
  innerLengthCm: 20,
  innerWidthCm: 20,
  innerHeightCm: 20,
  outerLengthCm: 22,
  outerWidthCm: 22,
  outerHeightCm: 22,
  emptyWeightKg: 0.2,
  paddingWeightKg: 0.1,
  maxWeightKg: 5,
  enabled: true,
};

const mediumBox: ShippingBox = {
  id: 'medium',
  name: 'Caja mediana',
  innerLengthCm: 45,
  innerWidthCm: 35,
  innerHeightCm: 30,
  outerLengthCm: 48,
  outerWidthCm: 38,
  outerHeightCm: 33,
  emptyWeightKg: 0.5,
  paddingWeightKg: 0.25,
  maxWeightKg: 20,
  enabled: true,
};

test('un rollo genera un paquete en la caja más pequeña posible', () => {
  const result = buildShippingPackages([line('roll-a', 1)], [mediumBox, smallBox]);

  assert.equal(result.errors.length, 0);
  assert.equal(result.packages.length, 1);
  assert.equal(result.packages[0].boxId, 'small');
  assert.equal(result.packages[0].items[0].quantity, 1);
});

test('diez rollos iguales conservan cantidades y se dividen si exceden peso', () => {
  const result = buildShippingPackages([line('roll-a', 10, { unitWeightKg: 1 })], [smallBox, mediumBox]);
  const quantity = result.packages.flatMap((pkg) => pkg.items).reduce((total, item) => total + item.quantity, 0);

  assert.equal(result.errors.length, 0);
  assert.equal(quantity, 10);
  assert.ok(result.packages.length >= 1);
});

test('tres rollos diferentes se agrupan sin duplicar productos', () => {
  const result = buildShippingPackages([
    line('roll-a', 1),
    line('roll-b', 1, { lengthCm: 12 }),
    line('roll-c', 1, { widthCm: 14 }),
  ], [mediumBox]);

  assert.equal(result.errors.length, 0);
  assert.equal(result.packages.flatMap((pkg) => pkg.items).length, 3);
});

test('una impresora con caja original genera paquete propio', () => {
  const result = buildShippingPackages([printerLine('printer-a', 1)], [mediumBox]);

  assert.equal(result.packages.length, 1);
  assert.equal(result.packages[0].packageType, 'FACTORY_PACKAGE');
  assert.equal(result.packages[0].items[0].quantity, 1);
});

test('dos impresoras iguales generan dos paquetes independientes', () => {
  const result = buildShippingPackages([printerLine('printer-a', 2)], [mediumBox]);

  assert.equal(result.errors.length, 0);
  assert.equal(result.packages.length, 2);
});

test('dos impresoras diferentes generan dos paquetes independientes', () => {
  const result = buildShippingPackages([printerLine('printer-a', 1), printerLine('printer-b', 1)], [mediumBox]);

  assert.equal(result.errors.length, 0);
  assert.equal(result.packages.length, 2);
});

test('diez rollos y dos impresoras crean paquetes de equipo y cajas combinadas', () => {
  const result = buildShippingPackages([printerLine('printer-a', 2), line('roll-a', 10)], [smallBox, mediumBox]);
  const printerPackages = result.packages.filter((pkg) => pkg.packageType === 'FACTORY_PACKAGE');

  assert.equal(result.errors.length, 0);
  assert.equal(printerPackages.length, 2);
  assert.equal(totalQuantity(result.packages), 12);
});

test('tres rollos y dos impresoras diferentes mantienen el total', () => {
  const result = buildShippingPackages([
    printerLine('printer-a', 1),
    printerLine('printer-b', 1),
    line('roll-a', 1),
    line('roll-b', 1),
    line('roll-c', 1),
  ], [mediumBox]);

  assert.equal(result.errors.length, 0);
  assert.equal(totalQuantity(result.packages), 5);
});

test('producto que excede peso máximo devuelve error', () => {
  const result = buildShippingPackages([line('heavy', 1, { unitWeightKg: 40 })], [mediumBox]);

  assert.ok(result.errors.some((error) => error.includes('excede el peso')));
});

test('producto que no cabe en ninguna caja devuelve error', () => {
  const result = buildShippingPackages([line('large', 1, { lengthCm: 100 })], [smallBox]);

  assert.ok(result.errors.some((error) => error.includes('no cabe')));
});

test('producto sin peso bloquea el empaque', () => {
  const result = buildShippingPackages([line('no-weight', 1, { unitWeightKg: 0 })], [smallBox]);

  assert.ok(result.errors.some((error) => error.includes('peso')));
});

test('producto sin dimensiones bloquea el empaque', () => {
  const result = buildShippingPackages([line('no-size', 1, { lengthCm: 0 })], [smallBox]);

  assert.ok(result.errors.some((error) => error.includes('dimensiones')));
});

test('pedido pequeño genera un paquete', () => {
  const result = buildShippingPackages([line('roll-a', 2)], [mediumBox]);

  assert.equal(result.errors.length, 0);
  assert.equal(result.packages.length, 1);
});

test('pedido pesado genera varios paquetes', () => {
  const result = buildShippingPackages([line('roll-a', 12, { unitWeightKg: 2 })], [smallBox, mediumBox]);

  assert.equal(result.errors.length, 0);
  assert.ok(result.packages.length > 1);
});

test('cambio manual de caja recalcula peso dimensional', () => {
  const result = buildShippingPackages([line('roll-a', 1)], [smallBox]);
  const manual = normalizeManualPackages([{ ...result.packages[0], lengthCm: 50 }]);

  assert.equal(validateManualPackages(manual).length, 0);
  assert.ok(manual[0].dimensionalWeightKg > result.packages[0].dimensionalWeightKg);
});

test('movimiento manual de productos entre cajas sigue siendo validable', () => {
  const result = buildShippingPackages([line('roll-a', 2, { unitWeightKg: 3 })], [smallBox, mediumBox]);
  const manual = normalizeManualPackages(result.packages);

  assert.equal(validateManualPackages(manual).length, 0);
  assert.equal(totalQuantity(manual), 2);
});

test('paquete vacío manual es inválido', () => {
  const result = buildShippingPackages([line('roll-a', 1)], [smallBox]);
  const errors = validateManualPackages([{ ...result.packages[0], items: [] }]);

  assert.ok(errors.some((error) => error.includes('vacío')));
});

test('payload FedEx recibe tantos paquetes como generó el motor', () => {
  const result = buildShippingPackages([printerLine('printer-a', 2), line('roll-a', 1)], [smallBox]);
  const payload = transformPackagesToFedexLineItems(result.packages);

  assert.equal(payload.length, result.packages.length);
  assert.ok(payload.every((item) => item.dimensions.units === 'CM'));
});

test('cotización repetida conserva firma estable', () => {
  const first = buildShippingPackages([line('roll-a', 4)], [smallBox, mediumBox]);
  const second = buildShippingPackages([line('roll-a', 4)], [smallBox, mediumBox]);

  assert.equal(first.signature, second.signature);
});

test('caja desactivada no se usa', () => {
  const disabled = { ...smallBox, enabled: false };
  const result = buildShippingPackages([line('roll-a', 1)], [disabled, mediumBox]);

  assert.equal(result.errors.length, 0);
  assert.equal(result.packages[0].boxId, 'medium');
});

function line(productId: string, quantity: number, overrides: Partial<ProductShippingProfile> = {}): PackingLine {
  const profile = profileFor(productId, {
    shippingMode: 'LOOSE_ITEM',
    ...overrides,
  });
  return {
    lineId: Math.round(Math.random() * 100000),
    productId,
    sku: productId.toUpperCase(),
    productName: productId,
    description: productId,
    quantity,
    profile,
  };
}

function printerLine(productId: string, quantity: number): PackingLine {
  const profile = profileFor(productId, {
    shippingMode: 'FACTORY_PACKAGE',
    unitWeightKg: 5,
    lengthCm: 35,
    widthCm: 25,
    heightCm: 25,
    packedWeightKg: 6,
    packedLengthCm: 40,
    packedWidthCm: 30,
    packedHeightCm: 30,
    canCombine: false,
  });
  return {
    lineId: Math.round(Math.random() * 100000),
    productId,
    sku: productId.toUpperCase(),
    productName: productId,
    description: productId,
    quantity,
    profile,
  };
}

function profileFor(productId: string, overrides: Partial<ProductShippingProfile>): ProductShippingProfile {
  return {
    productId,
    sku: productId.toUpperCase(),
    productName: productId,
    unitWeightKg: 0.5,
    lengthCm: 10,
    widthCm: 10,
    heightCm: 10,
    shippingMode: 'LOOSE_ITEM',
    canRotate: true,
    stackable: true,
    fragile: false,
    canCombine: true,
    ...overrides,
  };
}

function totalQuantity(packages: Array<{ items: Array<{ quantity: number }> }>) {
  return packages.flatMap((pkg) => pkg.items).reduce((total, item) => total + item.quantity, 0);
}
