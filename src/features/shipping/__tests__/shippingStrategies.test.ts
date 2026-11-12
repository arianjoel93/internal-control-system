import assert from 'node:assert/strict';
import test from 'node:test';
import { generatePackingPlan, preparePackingQuote, assignmentsFromPlan, sumProductVolumetricWeight, suggestHeightReduction, type PackagingRow, type PackingLine } from '../../../../supabase/functions/_shared/shipping-packing.ts';
import { normalizeLogisticsMetadata } from '../../../../supabase/functions/_shared/shipping-catalog.ts';
const box=(id:string,side:number,max=30):PackagingRow=>({id,name:id,internal_code:id,is_active:true,sort_order:1,
  length:side,width:side,height:side,external_length:side+2,external_width:side+2,external_height:side+2,
  empty_weight:.5,max_weight:max,max_fill_percent:90,dimension_unit:'CM',weight_unit:'KG'});
const equipment:PackingLine={lineId:1,productId:1,sku:'TSC-DA220',productName:'Impresora',quantity:1,uom:'Unidades',
  lengthCm:10,widthCm:8,heightCm:6,weightKg:2,logisticsMetadata:normalizeLogisticsMetadata({source_sheet:'Equipos'},
    {length_cm:10,width_cm:8,height_cm:6,unit_weight_kg:2})};
const rolls:PackingLine={lineId:2,productId:2,sku:'ROLL',productName:'Rollos',quantity:3,uom:'Rollos',lengthCm:3,widthCm:3,heightCm:3,weightKg:.1};
test('pedido grande llena la máster antes de abrir otra y recorta solo el sobrante',()=>{
  const rows=[{...box('small',10,1000),max_fill_percent:100},{...box('master',20,1000),max_fill_percent:100}];
  const lines=[{...rolls,quantity:200,lengthCm:4,widthCm:4,heightCm:4,canRotate:false}];
  const plan=generatePackingPlan(lines,rows,'MIN_PACKAGES');
  assert.equal(plan.packages.length,2);
  assert.deepEqual(plan.packages.map(p=>p.items.length),[125,75]);
  assert.equal(suggestHeightReduction(plan.packages[0]),null);
  assert.ok(suggestHeightReduction(plan.packages[1]));
  assert.equal(new Set(plan.packages.flatMap(p=>p.items.map(i=>i.unit.id))).size,200);
  const server=preparePackingQuote({version:1,strategy:plan.strategy,lines,assignments:assignmentsFromPlan(plan)},rows);
  assert.deepEqual(server.plan.packages.map(p=>p.items.length),[125,75]);
  const remainder=generatePackingPlan([{...lines[0],quantity:130}],rows,'MIN_PACKAGES');
  assert.deepEqual(remainder.packages.map(p=>[p.packagingTypeId,p.items.length]),[['master',125],['small',5]]);
});
test('volumétrico de productos suma unidades físicas, sin volumen de la caja exterior',()=>{
  assert.deepEqual(sumProductVolumetricWeight([equipment,rolls]),{weightKg:.112,missingLines:0});
  const label={...rolls,sku:'051025TD011P0000C1P2K5',quantity:5,uom:'Millares',lengthCm:12.67,widthCm:12.67,heightCm:5.5};
  assert.equal(sumProductVolumetricWeight([label]).weightKg,.406);
  assert.equal(sumProductVolumetricWeight([{...label,lengthCm:null}]).weightKg,null);
  assert.equal(sumProductVolumetricWeight([{...label,quantity:1}]).weightKg,null);
});
test('menos paquetes consolida equipo cerrado y rollos; compacto conserva dos si reducen volumen',()=>{
  const lines=[equipment,rolls],rows=[box('small',8),box('large',20)];
  const minimum=generatePackingPlan(lines,rows,'MIN_PACKAGES');
  const compact=generatePackingPlan(lines,rows,'COMPACT');
  assert.equal(minimum.status,'READY_FOR_QUOTE');assert.equal(minimum.packages.length,1);
  assert.equal(minimum.packages[0].packagingTypeId,'large');assert.equal(minimum.metrics.grossWeight,2.8);
  assert.equal(minimum.packages[0].items.filter(i=>i.unit.prepacked).length,1);
  assert.equal(compact.packages.length,2);assert.ok(compact.metrics.volumetricWeight<minimum.metrics.volumetricWeight);
  for(const plan of [minimum,compact]){
    const validated=preparePackingQuote({version:1,strategy:plan.strategy,lines,assignments:assignmentsFromPlan(plan)},rows);
    assert.equal(validated.plan.metrics.packageCount,plan.metrics.packageCount);
    assert.equal(validated.plan.metrics.grossWeight,plan.metrics.grossWeight);
  }
});
test('un solo paquete no ignora límites de peso ni aislamiento obligatorio',()=>{
  assert.equal(generatePackingPlan([equipment,rolls],[box('small',8),box('large',20,2.5)],'MIN_PACKAGES').packages.length,2);
  assert.equal(generatePackingPlan([{...equipment,shipAlone:true},rolls],[box('small',8),box('large',20)],'MIN_PACKAGES').packages.length,2);
  assert.equal(generatePackingPlan([{...equipment,canCombine:false},rolls],[box('small',8),box('large',20)],'MIN_PACKAGES').packages.length,2);
});
test('conservador separa frágiles mientras menos paquetes puede compartir el suelo',()=>{
  const lines=[{...rolls,quantity:1,fragile:true},{...rolls,lineId:3,productId:3,quantity:1}];
  assert.equal(generatePackingPlan(lines,[box('big',20)],'MIN_PACKAGES').packages.length,1);
  assert.equal(generatePackingPlan(lines,[box('big',20)],'CONSERVATIVE').packages.length,2);
});
test('más de doce unidades también prueban consolidación en una caja',()=>{
  const plan=generatePackingPlan([{...rolls,quantity:13}],[box('small',8),box('big',20)],'MIN_PACKAGES');
  assert.equal(plan.packages.length,1);assert.equal(plan.packages[0].items.length,13);
});

test('equipo solo dentro de un envío de dos paquetes conserva caja propia en todas las estrategias',()=>{
  const lines=[equipment,rolls],rows=[box('small',8),box('large',20,2.5)];
  for(const strategy of ['MIN_PACKAGES','COMPACT','BALANCED','CONSERVATIVE'] as const){
    const plan=generatePackingPlan(lines,rows,strategy);
    assert.equal(plan.packages.length,2);
    const own=plan.packages.find(p=>p.items.some(i=>i.unit.productId===1))!;
    assert.equal(own.packagingTypeId,null);
    assert.equal(own.packagingWeight,0);
    assert.equal(own.totalWeight,2);
    assert.deepEqual(own.externalDimensions,{length:10,width:8,height:6});
    const checked=preparePackingQuote({version:1,strategy,lines,assignments:assignmentsFromPlan(plan)},rows);
    assert.equal(checked.plan.metrics.grossWeight,plan.metrics.grossWeight);
  }
});

test('validación elimina caja exterior innecesaria del equipo solo, pero la conserva en paquete mixto',()=>{
  const lines=[equipment,rolls],rows=[box('small',8),box('large',20)];
  const separate=preparePackingQuote({version:1,strategy:'MIN_PACKAGES',lines,assignments:[
    {id:'equipment',packagingTypeId:'large',unitIds:['1:1:1']},
    {id:'rolls',packagingTypeId:'small',unitIds:['2:2:1','2:2:2','2:2:3']},
  ]},rows);
  // Fill the selected roll carton first to preserve the separate equipment package.
  const isolated=preparePackingQuote({version:1,strategy:'MIN_PACKAGES',lines,assignments:[
    {id:'rolls',packagingTypeId:'small',unitIds:['2:2:1','2:2:2','2:2:3']},
    {id:'equipment',packagingTypeId:'large',unitIds:['1:1:1']},
  ]},rows);
  const own=isolated.plan.packages.find(p=>p.items.some(i=>i.unit.productId===1))!;
  assert.equal(own.packagingTypeId,null);assert.equal(own.packagingWeight,0);
  const mixed=separate.plan.packages.find(p=>p.items.length>1)!;
  assert.equal(mixed.packagingTypeId,'large');assert.equal(mixed.packagingWeight,.5);
});
