import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveIndividualLogistics, bracketedProductReference } from '../../../../supabase/functions/_shared/shipping-catalog.ts';
import { normalizePackingLines, generatePackingPlan, type PackingLine, type PackagingRow } from '../../../../supabase/functions/_shared/shipping-packing.ts';

test('catálogo parcial no oculta medidas individuales conocidas en Odoo',()=>{
  const result=resolveIndividualLogistics({length_cm:12.67,width_cm:null,height_cm:null,unit_weight_kg:.489},
    {length_cm:99,width_cm:12.67,height_cm:5.5,unit_weight_kg:99});
  assert.deepEqual(result,{length_cm:12.67,width_cm:12.67,height_cm:5.5,unit_weight_kg:.489});
});
test('sin medida individual no utiliza dimensiones de una presentación completa',()=>{
  const result=resolveIndividualLogistics({}, {length_cm:null,width_cm:null,height_cm:null,unit_weight_kg:null});
  assert.deepEqual(result,{length_cm:null,width_cm:null,height_cm:null,unit_weight_kg:null});
});
test('referencia explícita de Odoo mantiene ceros iniciales y no hace coincidencias por descripción',()=>{
  assert.equal(bracketedProductReference('[051025TD011P0000C1P2K5] Etiqueta'), '051025TD011P0000C1P2K5');
  assert.equal(bracketedProductReference('Etiqueta 051025TD011P0000C1P2K5'), null);
});
test('un rollo y 2.5 millares recuperan las mismas dimensiones individuales',()=>{
  const line:PackingLine={lineId:1,productId:1,sku:'051025TD011P0000C1P2K5',productName:'Etiquetas',quantity:1,uom:'Rollos',
    lengthCm:12.67,widthCm:12.67,heightCm:5.5,weightKg:.489};
  const box:PackagingRow={id:'BOX',name:'Caja',internal_code:'BOX',is_active:true,sort_order:1,length:20,width:20,height:20,external_length:21,external_width:21,external_height:21,dimension_unit:'CM',weight_unit:'KG',empty_weight:.12,max_weight:3,max_fill_percent:90};
  for(const source of [line,{...line,quantity:2.5,uom:'Millares'}]){
    const normalized=normalizePackingLines([source]);
    assert.equal(normalized.missingLines.length,0);
    assert.equal(normalized.units.length,1);
    assert.deepEqual(normalized.units[0].dimensions,{length:12.67,width:12.67,height:5.5});
    assert.equal(generatePackingPlan([source],[box]).status,'READY_FOR_QUOTE');
  }
  assert.equal(normalizePackingLines([{...line,quantity:1,uom:'Millares'}]).missingLines.length,1);
});
