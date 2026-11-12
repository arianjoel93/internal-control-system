import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCatalogValues, normalizeLogisticsMetadata, catalogComputedWeights, catalogStatus, catalogMetadataEqual, parseCatalogSheets, mergeCatalogCandidate } from '../../../../supabase/functions/_shared/shipping-catalog.ts';

const label = { Producto: '051025TD011P0000C1P2K5', Descripcion: '51*25 TD01 BLANCO R2.5K CON PLECA',
  'Rollos por Tubo': 4, 'Cantidad de Tubos x  Caja': 9, 'Total Rollos x Caja': 36,
  'Caja de Empaque (ancho x largo x alto cm)': '38X38X22', 'Peso Real x Caja': 18, 'Calculo Peso x Rollo': 0.4888888889 };
const parse = (values: Record<string, unknown>, name = 'Etiquetas de Linea') => parseCatalogSheets([{ name, rows: [{ row: 51, values }] }]);

test('guarda campos parciales sin convertir blancos a cero ni calcular peso facturable incompleto', () => {
  const values = normalizeCatalogValues({ unit_weight_kg: '0.25', length_cm: null, width_cm: '', height_cm: undefined });
  assert.deepEqual(values, { length_cm: null, width_cm: null, height_cm: null, unit_weight_kg: 0.25 });
  assert.deepEqual(catalogComputedWeights(values), { volumetric_weight_kg: null, billable_weight_kg: null });
  assert.equal(catalogStatus(values), 'INCOMPLETE');
  assert.throws(() => normalizeCatalogValues({ length_cm: 0 }));
  assert.throws(() => normalizeCatalogValues({ length_cm: true }));
});

test('estimaciones requieren método y datos faltantes nunca se presentan como medidos', () => {
  const values = normalizeCatalogValues({ unit_weight_kg: 1 });
  assert.throws(() => normalizeLogisticsMetadata({ weight_origin: 'ESTIMATED' }, values));
  const metadata = normalizeLogisticsMetadata({ dimensions_origin: 'MEASURED' }, values);
  assert.equal(metadata.dimensions_origin, 'UNKNOWN');
});

test('rollo 2K5 usa hipótesis explícita de cuadrícula, nunca las medidas de caja como pieza', () => {
  const row = parse(label).rows[0];
  assert.equal(row.unit_weight_kg, 0.489);
  assert.equal(row.height_cm, 5.5);
  assert.equal(row.length_cm, 12.67);
  assert.equal(row.width_cm, 12.67);
  assert.equal(row.logistics_metadata?.dimensions_origin, 'ESTIMATED');
  assert.equal(row.logistics_metadata?.weight_origin, 'ESTIMATED');
  assert.equal(row.logistics_metadata?.confidence, 'LOW');
  assert.match(row.logistics_metadata?.dimensions_method ?? '', /Hipótesis/);
  assert.equal(catalogStatus({ ...row, product_name: null }, row.logistics_metadata), 'ESTIMATED');
});

test('sin acomodo conocido conserva peso y deja dimensiones individuales pendientes', () => {
  const row = parse({ ...label, 'Cantidad de Tubos x  Caja': null }).rows[0];
  assert.equal(row.length_cm, null);
  assert.equal(row.width_cm, null);
  assert.equal(row.height_cm, null);
  assert.equal(row.unit_weight_kg, 0.489);
});

test('lee todas las hojas y conserva fila y orden ancho-largo-alto de cajas térmicas y equipos', () => {
  const parsed = parseCatalogSheets([
    { name: 'Equipos', rows: [{ row: 7, values: { Producto: 'EQ-01', Descripcion: 'Equipo', 'Caja de Empaque (ancho x largo x alto cm)': '28X41X24', 'Peso Real x Caja': 3.8 } }] },
    { name: 'Termico, Marca precio', rows: [{ row: 9, values: { Producto: '057030PT011P0000CSC050', Descripcion: 'PAPEL TICKET CAJA/50 ROLLOS', 'Caja de Empaque (ancho x largo x alto cm)': '22X26X08', 'Peso Real x Caja': 1.8, 'Calculo Peso x Rollo': 0.028 } }] },
    { name: 'Otros', rows: [{ row: 3, values: { Producto: 'CORREA', Descripcion: 'Correa' } }, { row: 500, values: { 'Sin Registro x Caja': false } }] },
  ]);
  assert.equal(parsed.rows.length, 3);
  assert.deepEqual([parsed.rows[0].width_cm, parsed.rows[0].length_cm, parsed.rows[0].height_cm], [28, 41, 24]);
  assert.equal(parsed.rows[1].unit_weight_kg, 1.8);
  assert.equal(parsed.rows[1].logistics_metadata?.physical_unit, 'CAJA');
  assert.equal(parsed.rows[2].unit_weight_kg, null);
  assert.equal(parsed.rows[0].source_row, 7);
});

test('separa variantes duplicadas y capacidad contradictoria, sin escoger última fila', () => {
  const result = parseCatalogSheets([{ name: 'Etiquetas de Linea', rows: [
    { row: 2, values: label }, { row: 3, values: { ...label, 'Peso Real x Caja': 19 } },
    { row: 4, values: { Producto: '040031TT011P0000C3G10K', Descripcion: 'R10.5K' } },
  ] }]);
  assert.equal(result.rows.length, 0);
  assert.equal(result.invalidRows.length, 3);
});

test('estimaciones no reemplazan datos medidos y conservan referencia anterior', () => {
  const incoming = parse(label).rows[0];
  const values = normalizeCatalogValues({ length_cm: 11, width_cm: 11, height_cm: 5.4, unit_weight_kg: 0.5 });
  const previous = { ...values, source_file_name: 'medicion.xlsx', source_row: 9, logistics_metadata: normalizeLogisticsMetadata({ weight_origin: 'MEASURED', dimensions_origin: 'MEASURED', source_sheet: 'Almacen' }, values) };
  const merged = mergeCatalogCandidate(previous, incoming);
  assert.equal(merged.unit_weight_kg, 0.5);
  assert.equal(merged.length_cm, 11);
  assert.equal(merged.logistics_metadata?.weight_origin, 'MEASURED');
  assert.match(merged.logistics_metadata?.notes ?? '', /medicion.xlsx/);
});

test('compatibilidad con formato anterior Equipo Ancho Largo Alto Peso', () => {
  const row = parse({ Equipo: 'RT-425TT', Ancho: 27.5, Largo: 41, Alto: 23, 'Peso Real': 3.8 }, 'Equipos').rows[0];
  assert.equal(row.length_cm, 41);
  assert.equal(row.unit_weight_kg, 3.8);
  assert.equal(row.logistics_metadata?.weight_origin, 'DECLARED');
});

test('verificación de JSONB no depende del orden de las claves', () => {
  assert.equal(catalogMetadataEqual({ weight_origin: 'ESTIMATED', version: 1 }, { version: 1, weight_origin: 'ESTIMATED' }), true);
  assert.equal(catalogMetadataEqual({ weight_origin: 'MEASURED' }, { weight_origin: 'ESTIMATED' }), false);
});
