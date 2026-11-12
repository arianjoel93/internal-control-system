import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveShippingQuantity, normalizePackingLines, generatePackingPlan, assignmentsFromPlan, preparePackingQuote, type PackingLine } from '../../../../supabase/functions/_shared/shipping-packing.ts';
import { normalizeLogisticsMetadata } from '../../../../supabase/functions/_shared/shipping-catalog.ts';

const roll = (patch: Partial<PackingLine> = {}): PackingLine => ({
  lineId: 1, productId: 1, sku: '051025TD011P0000C1P2K5', productName: '51*25 TD01 BLANCO R2.5K',
  quantity: 5, uom: 'Millares', lengthCm: 10, widthCm: 10, heightCm: 5.5, weightKg: 0.489, ...patch,
});

test('conserva cantidad comercial y convierte 5 millares a dos rollos 2K5', () => {
  const line = roll();
  const result = normalizePackingLines([line]);
  assert.equal(result.units.length, 2);
  assert.equal(line.quantity, 5);
  assert.equal(result.units[0].commercialQuantity, 5);
  assert.equal(result.units[0].commercialUom, 'Millares');
  assert.equal(result.units[0].commercialUnitsPerPhysicalUnit, 2.5);
  assert.equal(result.units[0].weightKg, 0.489);
});

test('solo acepta rollos completos y tolera ruido decimal', () => {
  assert.equal(resolveShippingQuantity(roll({ quantity: 7.5 })).physicalQuantity, 3);
  assert.equal(resolveShippingQuantity(roll({ quantity: 7.50000000001 })).physicalQuantity, 3);
  assert.match(resolveShippingQuantity(roll({ quantity: 6 })).error!, /2.4 rollos/);
  assert.equal(normalizePackingLines([roll({ quantity: 6 })]).units.length, 0);
  assert.match(resolveShippingQuantity(roll({ quantity: 1e-9 })).error!, /completas/);
});

test('lee 12K, 0K3 y capacidades por descripción para códigos especiales', () => {
  assert.equal(resolveShippingQuantity(roll({ sku: '027013TD013P0000C1G12K', productName: 'R12K', quantity: 24 })).physicalQuantity, 2);
  assert.equal(resolveShippingQuantity(roll({ sku: '102152TD011P0000C1P0K3', productName: 'R0.3K', quantity: 0.9 })).physicalQuantity, 3);
  assert.equal(resolveShippingQuantity(roll({ sku: '025260BB091P000KC1N250', productName: 'BRAZALETE R0.25K', quantity: 1 })).physicalQuantity, 4);
  assert.equal(resolveShippingQuantity(roll({ sku: '016023BD021P0802C1M750', productName: 'R 0.75K', quantity: 3 })).physicalQuantity, 4);
});

test('bloquea capacidad contradictoria, continuos y unidad no confirmada', () => {
  assert.match(resolveShippingQuantity(roll({ sku: '040031TT011P0000C3G10K', productName: 'R10.5K' })).error!, /no coincide/);
  assert.ok(resolveShippingQuantity(roll({ sku: '030200NY011P0000C3C0K0', productName: '200MTS CONTINUO' })).error);
  assert.ok(resolveShippingQuantity(roll({ uom: 'Unidades' })).error);
  assert.ok(resolveShippingQuantity(roll({ uom: null })).error);
  assert.ok(resolveShippingQuantity(roll({ uom: 'Metros' })).error);
  assert.equal(resolveShippingQuantity(roll({ uom: 'Rollos', quantity: 5 })).physicalQuantity, 5);
});

const thermal = (quantity = 1): PackingLine => roll({ sku: '057030PT011P0000CSC050', productName: 'PAPEL TICKET TERMICO CAJA/50 ROLLOS',
  uom: 'Unidades', quantity, lengthCm: 26, widthCm: 22, heightCm: 8, weightKg: 1.8,
  logisticsMetadata: normalizeLogisticsMetadata({original_package:true},{length_cm:26,width_cm:22,height_cm:8,unit_weight_kg:1.8}) });

test('R0.175 y LG175 representan 175 etiquetas o 0.175 millares por rollo',()=>{
  const source=roll({sku:'038063TD011P000YCLG175',productName:'038*063 TD01 AMARILLO R0.175',quantity:.175});
  assert.equal(resolveShippingQuantity(source).physicalQuantity,1);
  assert.equal(resolveShippingQuantity({...source,quantity:.35}).physicalQuantity,2);
  assert.equal(resolveShippingQuantity({...source,productName:'AMARILLO R0,175',quantity:.175}).physicalQuantity,1);
  assert.match(resolveShippingQuantity({...source,productName:'AMARILLO R0.2'}).error!,/no coincide/);
  assert.ok(resolveShippingQuantity({...source,quantity:.1}).error);
});

test('caja de tickets usa sus dimensiones propias sin activar la preferencia original',()=>{
  const source={...thermal(),logisticsMetadata:null};
  assert.equal(resolveShippingQuantity(source).prepacked,true);
  assert.equal(resolveShippingQuantity(source).physicalUnit,'CAJA');
  assert.equal(generatePackingPlan([source],[]).status,'READY_FOR_QUOTE');
});

test('térmico cerrado conserva caja y bruto sin multiplicar rollos o sumar tara', () => {
  const lines = [thermal(3)];
  const plan = generatePackingPlan(lines, []);
  assert.equal(plan.status, 'READY_FOR_QUOTE');
  assert.equal(plan.metrics.articleCount, 3);
  assert.equal(plan.packages.length, 3);
  assert.equal(plan.metrics.grossWeight, 5.4);
  assert.ok(plan.packages.every(pkg => pkg.packagingWeight === 0 && pkg.packagingTypeId === null));
  const result = preparePackingQuote({ version: 1, strategy: plan.strategy, lines, assignments: assignmentsFromPlan(plan) }, []);
  assert.equal(result.packages.length, 3);
  assert.equal(result.packages[0].contentWeight, 1.8);
  assert.deepEqual(result.snapshot.lines[0], lines[0]);
  assert.equal(result.snapshot.packages[0].items[0].unit.physicalUnit, 'CAJA');
});

test('caja térmica no usa CSC10M como capacidad de etiquetas ni permite fracciones', () => {
  const line = { ...thermal(), sku: '057030PT011P0000CSC10M', productName: 'PAPEL TICKET TERMICO CAJA/250 ROLLOS' };
  assert.equal(resolveShippingQuantity(line).physicalQuantity, 1);
  assert.ok(resolveShippingQuantity({ ...line, quantity: 1.5 }).error);
  assert.ok(resolveShippingQuantity({ ...line, uom: 'Rollos' }).error);
});

test('límite de 2000 aplica después de convertir millares a unidades físicas', () => {
  assert.equal(normalizePackingLines([roll({ quantity: 2500 })]).units.length, 1000);
  assert.throws(() => normalizePackingLines([roll({ quantity: 5002.5 })]), /2000/);
  assert.throws(() => normalizePackingLines([roll({ sku: 'A', uom: 'Piezas', quantity: 2001 })]), /2000/);
});

test('unidades por pieza mantienen el comportamiento anterior', () => {
  assert.equal(resolveShippingQuantity(roll({ sku: 'RIBBON-01', uom: 'Piezas', quantity: 4 })).physicalQuantity, 4);
});

test('permite poner una caja térmica cerrada dentro de un embalaje adicional', () => {
  const lines = [thermal()];
  const box = { id: 'large', name: 'Grande', internal_code: 'G', is_active: true, sort_order: 1,
    length: 100, width: 100, height: 100, empty_weight: 1, max_weight: 100,
    dimension_unit: 'CM' as const, weight_unit: 'KG' as const };
  const result=preparePackingQuote({ version: 1, strategy: 'BALANCED', lines,
    assignments: [{ id: 'changed', packagingTypeId: 'large', unitIds: ['1:1:1'] }] }, [box]);
  assert.equal(result.plan.status,'READY_FOR_QUOTE');
  assert.equal(result.plan.metrics.grossWeight,2.8);
});

test('orden mixta conserva cajas cerradas y convierte solo la línea en millares', () => {
  const lines = [thermal(2), roll({ lineId: 2, productId: 2 })];
  const box = { id: 'large', name: 'Grande', internal_code: 'G', is_active: true, sort_order: 1,
    length: 30, width: 30, height: 30, empty_weight: 0.4, max_weight: 20,
    dimension_unit: 'CM' as const, weight_unit: 'KG' as const };
  const plan = generatePackingPlan(lines, [box]);
  assert.equal(plan.status, 'READY_FOR_QUOTE');
  assert.equal(plan.metrics.articleCount, 4);
  assert.equal(plan.packages.flatMap(pkg => pkg.items).filter(item => item.unit.prepacked).length, 2);
  const verified = preparePackingQuote({ version: 1, strategy: plan.strategy, lines, assignments: assignmentsFromPlan(plan) }, [box]);
  assert.deepEqual(verified.packages.map(pkg => pkg.contentWeight), plan.packages.map(pkg => pkg.totalWeight));
  assert.equal(verified.snapshot.lines[1].quantity, 5);
});
