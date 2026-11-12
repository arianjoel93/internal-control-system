import assert from 'node:assert/strict';
import test from 'node:test';
import {generatePackingPlan,packagingDisplayName,applyHeightCuts,preparePackingQuote,assignmentsFromPlan,type PackagingRow} from '../../../../supabase/functions/_shared/shipping-packing.ts';
import {suggestHeightReduction} from '../../../../supabase/functions/_shared/shipping-packing.ts';
const box:PackagingRow={id:'box',name:'Caja alta',internal_code:'BOX',is_active:true,sort_order:1,length:30,width:30,height:40,
  external_length:31,external_width:31,external_height:41,dimension_unit:'CM',weight_unit:'KG',empty_weight:.5,max_weight:30,max_fill_percent:90};
const plan=generatePackingPlan([{lineId:1,productId:1,sku:'A',productName:'Accesorios',quantity:1,uom:'Unidades',lengthCm:10,widthCm:10,heightCm:10,weightKg:1,canRotate:false}],[box]);
test('recorte predeterminado y desmarcado usan las mismas dimensiones en cliente y servidor',()=>{
  const lines=[{lineId:1,productId:1,sku:'A',productName:'Accesorios',quantity:1,uom:'Unidades',lengthCm:10,widthCm:10,heightCm:10,weightKg:1,canRotate:false}];
  const request={version:1 as const,strategy:plan.strategy,lines,assignments:assignmentsFromPlan(plan)};
  const cut=preparePackingQuote(request,[box]);
  assert.equal(cut.packages[0].height,13);
  assert.equal(cut.plan.metrics.volumetricWeight,applyHeightCuts(plan).metrics.volumetricWeight);
  assert.equal(cut.plan.metrics.grossWeight,plan.metrics.grossWeight);
  const full=preparePackingQuote({...request,disabledHeightCuts:[plan.packages[0].id]},[box]);
  assert.equal(full.packages[0].height,41);
  assert.equal(full.plan.metrics.volumetricWeight,plan.metrics.volumetricWeight);
  assert.equal(plan.packages[0].externalDimensions.height,41);
  assert.ok(cut.snapshot.originalPackages.length);
});
test('etiqueta del embalaje muestra nombre y medidas exteriores',()=>{
  assert.equal(packagingDisplayName(box),'Caja alta · 31 × 31 × 41 cm');
});
test('sugerencia usa altura ocupada más holgura; no cambia masa, posiciones ni dimensiones',()=>{
  const pkg=plan.packages[0],snapshot=JSON.stringify(pkg),cut=suggestHeightReduction(pkg)!;
  assert.equal(cut.internalHeight,12);assert.equal(cut.externalHeight,13);assert.equal(cut.removableCm,28);
  assert.equal(cut.volumetricSavingKg,5.382);assert.equal(JSON.stringify(pkg),snapshot);
});
test('no propone cortar cajas propias, cajas llenas ni paquetes inválidos',()=>{
  const pkg=plan.packages[0];
  assert.equal(suggestHeightReduction({...pkg,packagingTypeId:null}),null);
  assert.equal(suggestHeightReduction({...pkg,status:'INVALID_PACKING'}),null);
  assert.equal(suggestHeightReduction({...pkg,internalDimensions:{...pkg.internalDimensions,height:12},externalDimensions:{...pkg.externalDimensions,height:13}}),null);
});
