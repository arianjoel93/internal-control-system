import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPresentationAlternatives, generatePackingPlan, normalizePackingLines, assignmentsFromPlan, preparePackingQuote,
  type PackingLine, type PackagingRow } from '../../../../supabase/functions/_shared/shipping-packing.ts';
import { normalizeLogisticsMetadata, mergeCatalogCandidate } from '../../../../supabase/functions/_shared/shipping-catalog.ts';

const values = { length_cm: 5, width_cm: 5, height_cm: 5, unit_weight_kg: 0.1 };
const metadata = normalizeLogisticsMetadata({ standard_presentation: { units_per_box: 36,
  length_cm: 20, width_cm: 20, height_cm: 15, gross_weight_kg: 4, origin: 'DECLARED' } }, values);
const line = (rolls: number): PackingLine => ({ lineId: 1, productId: 1, sku: '051025TD011P0000C1P2K5',
  productName: 'Etiquetas', quantity: rolls * 2.5, uom: 'Millares', lengthCm: 5, widthCm: 5, heightCm: 5,
  weightKg: 0.1, logisticsMetadata: metadata });
const box = (id: string, size: number, tare: number): PackagingRow => ({ id, internal_code: id, name: id,
  is_active: true, sort_order: 1, length: size, width: size, height: size,
  external_length: size + 1, external_width: size + 1, external_height: size + 1,
  empty_weight: tare, dimension_unit: 'CM', weight_unit: 'KG', max_weight: 20, max_fill_percent: 90 });
const boxes = [box('small', 12, 0.12), box('outer', 29, 0.45)];

for (const rolls of [35, 36, 37, 40, 72]) test(`${rolls} rollos conservan cantidad y presentaciones completas`, () => {
  const { units } = normalizePackingLines([line(rolls)]);
  assert.equal(units.filter(u => u.presentationQuantity).length, Math.floor(rolls / 36));
  assert.equal(units.filter(u => !u.prepacked).length, rolls % 36);
  assert.equal(units.reduce((sum, u) => sum + (u.presentationQuantity ?? 1), 0), rolls);
});

test('40 rollos: 36 cerrados más cuatro, comparan dos paquetes con una caja exterior sin duplicar tara', () => {
  const alternatives = buildPresentationAlternatives([line(40)], boxes)!;
  assert.equal(alternatives.separate.status, 'READY_FOR_QUOTE');
  assert.equal(alternatives.separate.metrics.packageCount, 2);
  assert.equal(alternatives.separate.metrics.grossWeight, 4.52);
  assert.equal(alternatives.outer?.metrics.packageCount, 1);
  assert.equal(alternatives.outer?.metrics.grossWeight, 4.85);
  for (const plan of [alternatives.separate, alternatives.outer!]) {
    const result = preparePackingQuote({ version: 1, strategy: plan.strategy, lines: [line(40)], assignments: assignmentsFromPlan(plan) }, boxes);
    assert.equal(result.plan.status, 'READY_FOR_QUOTE');
    assert.equal(result.plan.metrics.articleCount, 40);
    assert.equal(result.plan.metrics.grossWeight, plan.metrics.grossWeight);
    assert.equal(result.packages.length, plan.packages.length);
    assert.equal(result.packages.reduce((sum, p) => sum + p.contentWeight, 0), plan.metrics.grossWeight);
  }
});

test('no propone caja exterior cuando excede geometría, peso o está desactivada', () => {
  for (const rows of [[boxes[0]], boxes.map(b => ({ ...b, max_weight: 2 })), boxes.map(b => ({ ...b, is_active: false }))]) {
    assert.equal(buildPresentationAlternatives([line(40)], rows)?.outer, null);
  }
});

test('presentaciones de 36 y 72 se validan en servidor y los rollos fraccionarios permanecen bloqueados', () => {
  for (const rolls of [36, 72]) {
    const candidate = buildPresentationAlternatives([line(rolls)], boxes)!.separate;
    const result = preparePackingQuote({ version: 1, strategy: candidate.strategy, lines: [line(rolls)], assignments: assignmentsFromPlan(candidate) }, boxes);
    assert.equal(result.plan.status, 'READY_FOR_QUOTE');
    assert.equal(result.plan.metrics.articleCount, rolls);
    assert.equal(result.plan.metrics.packageCount, rolls / 36);
    assert.equal(result.plan.metrics.grossWeight, rolls / 36 * 4);
  }
  assert.equal(normalizePackingLines([line(36.5)]).missingLines.length, 1);
});

test('sin presentación no infiere 36 del SKU, y una caja comercial no vuelve a agruparse', () => {
  assert.equal(buildPresentationAlternatives([{ ...line(40), logisticsMetadata: null }], boxes), null);
  const { units } = normalizePackingLines([{ ...line(40), quantity: 2, uom: 'Cajas' }]);
  assert.equal(units.length, 2);
  assert.ok(units.every(u => !u.presentationQuantity));
});

test('rechaza presentaciones incompletas y conserva la configuración ante reimportación', () => {
  assert.throws(() => normalizeLogisticsMetadata({ standard_presentation: { units_per_box: 36 } }, values), /presentación/);
  const merged = mergeCatalogCandidate({ ...values, logistics_metadata: metadata }, { ...values, sku: 'A', product_name: 'Etiquetas', source_row: 1, volumetric_weight_kg: null, billable_weight_kg: null });
  assert.deepEqual(merged.logistics_metadata?.standard_presentation, metadata.standard_presentation);
});

test('ribbon vendido por piezas usa su unidad física de rollo documentada en catálogo', () => {
  const ribbon = { ...line(40), sku: '110074TCESO', quantity: 40, uom: 'Unidades',
    logisticsMetadata: { ...metadata, physical_unit: 'ROLLO' as const } };
  const units = normalizePackingLines([ribbon]).units;
  assert.equal(units.filter(u => u.presentationQuantity).length, 1);
  assert.equal(units.filter(u => !u.prepacked).length, 4);
});

test('trece rollos sueltos conservan trece colocaciones visibles, sin agruparlos',()=>{
  const plan=buildPresentationAlternatives([line(40)],boxes)!.separate;
  assert.equal(plan.status,'READY_FOR_QUOTE');
  const units=normalizePackingLines([line(13)]).units;
  assert.equal(units.length,13);
  assert.ok(units.every(u=>!u.prepacked&&u.physicalUnit==='ROLLO'));
});

test('equipo individual y caja comercial de etiquetas usan dimensiones propias sin tara adicional',()=>{
  const equipment={...line(1),sku:'TSC-DA220',productName:'Impresora TSC',quantity:1,uom:'Unidades',
    lengthCm:40,widthCm:30,heightCm:25,weightKg:4,logisticsMetadata:{...metadata,physical_unit:'PIEZA' as const,source_sheet:'Equipos',original_package:false}};
  const equipmentPlan=buildPresentationAlternatives([equipment],boxes);
  assert.equal(equipmentPlan,null);
  const normalized=normalizePackingLines([equipment]);
  assert.equal(normalized.units[0].prepacked,true);
  const direct=generatePackingPlan([equipment],[]);
  assert.equal(direct.status,'READY_FOR_QUOTE');
  assert.equal(direct.packages[0].totalWeight,4);
  assert.equal(direct.packages[0].packagingWeight,0);
  assert.deepEqual(direct.packages[0].externalDimensions,{length:40,width:30,height:25});
  const boxedLabel={...line(1),quantity:1,uom:'Cajas',logisticsMetadata:{...metadata,physical_unit:'ROLLO' as const}};
  const normalizedBox=normalizePackingLines([boxedLabel]);
  assert.deepEqual(normalizedBox.units[0].dimensions,{length:20,width:20,height:15});
  assert.equal(normalizedBox.units[0].weightKg,4);
  assert.equal(normalizedBox.units[0].prepacked,true);
  assert.equal(generatePackingPlan([boxedLabel],[]).packages[0].totalWeight,4);
});
