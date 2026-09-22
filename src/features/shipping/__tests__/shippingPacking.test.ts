import assert from 'node:assert/strict';
import test from 'node:test';
import { generatePackingPlan, normalizePackingLines, assignmentsFromPlan, validatePackingAssignments, mapPackingToShipment, fedexPackageLineItems,
  type PackagingRow, type PackingLine } from '../../../../supabase/functions/_shared/shipping-packing.ts';

const box = (id='small', side=10, maxWeight=20):PackagingRow => ({ id,name:id,internal_code:id,is_active:true,sort_order:10,
  length:side,width:side,height:side,internal_length:side,internal_width:side,internal_height:side,
  external_length:side+2,external_width:side+2,external_height:side+2,empty_weight:0.5,max_weight:maxWeight,max_fill_percent:100,
  dimension_unit:'CM',weight_unit:'KG',box_cost:0 });
const line = (patch:Partial<PackingLine>={}):PackingLine => ({lineId:1,productId:1,sku:'A',productName:'Producto A',quantity:1,
  lengthCm:5,widthCm:5,heightCm:5,weightKg:1,canRotate:true,canStack:true,...patch});

test('1. ajuste exacto en las dimensiones internas',()=>{
  const p=generatePackingPlan([line({lengthCm:10,widthCm:10,heightCm:10})],[box()]);
  assert.equal(p.status,'READY_FOR_QUOTE');assert.equal(p.metrics.packageCount,1);assert.equal(p.packages[0].utilizationPercentage,100);
});
test('2. cinco unidades pequeñas comparten una caja',()=>{
  const p=generatePackingPlan([line({quantity:5})],[box()]);assert.equal(p.metrics.packageCount,1);assert.equal(p.packages[0].items.length,5);
});
test('3. distribuye al superar peso bruto',()=>{
  const p=generatePackingPlan([line({quantity:5,weightKg:3})],[box('limited',10,7)]);
  assert.equal(p.status,'READY_FOR_QUOTE');assert.equal(p.metrics.packageCount,3);assert.ok(p.packages.every(p=>p.totalWeight<=7));
});
test('4. volumen menor no sustituye comprobación dimensional',()=>{
  const p=generatePackingPlan([line({lengthCm:11,widthCm:1,heightCm:1})],[box()]);assert.equal(p.unpackedItems.length,1);assert.equal(p.unpackedItems[0].code,'OVERSIZE');
});
test('5. prueba rotación y respeta su prohibición',()=>{
  const b={...box(),internal_length:4,internal_width:8,internal_height:10};
  const l=line({lengthCm:10,widthCm:8,heightCm:4});assert.equal(generatePackingPlan([l],[b]).status,'READY_FOR_QUOTE');
  assert.equal(generatePackingPlan([{...l,canRotate:false}],[b]).unpackedItems.length,1);
});
test('6. conserva unidades que no caben',()=>{
  const p=generatePackingPlan([line({lengthCm:100}),line({lineId:2,productId:2})],[box()]);
  assert.equal(p.packages.length,1);assert.equal(p.unpackedItems.length,1);assert.equal(p.status,'PARTIALLY_PACKED');assert.throws(()=>mapPackingToShipment(p));
});
test('7. paquete individual y no combinable van solos',()=>{
  for(const rule of [{shipAlone:true},{canCombine:false}]){
    const p=generatePackingPlan([line({...rule,quantity:2}),line({lineId:2,productId:2})],[box()]);assert.equal(p.packages.length,3);
  }
});
test('8. datos desconocidos nunca se convierten en cero',()=>{
  const p=generatePackingPlan([line({lengthCm:null,weightKg:null})],[box()]);assert.equal(p.status,'PENDING_DATA');assert.equal(p.missingLines.length,1);assert.equal(p.packages.length,0);
  assert.match(p.missingLines[0].reason,/Datos físicos incompletos/);
});
test('9. explota cantidades sin perder referencia de la línea',()=>{
  const p=generatePackingPlan([line({quantity:10})],[box()]);assert.equal(p.packages.length,2);
  const units=p.packages.flatMap(p=>p.items.map(i=>i.unit));assert.equal(units.length,10);assert.equal(new Set(units.map(i=>i.id)).size,10);
  assert.ok(units.every(i=>i.originalQuantity===10&&i.lineId===1&&i.productId===1&&i.sku==='A'));
});
test('10. prefiere la caja eficiente y evalúa consolidación',()=>{
  const p=generatePackingPlan([line()],[box('large',30),box()]);assert.equal(p.packages[0].packagingTypeId,'small');
  const lines=[line({quantity:5})];const types=[{...box('flat'),internal_height:5},box('taller')];
  const balanced=generatePackingPlan(lines,types);assert.equal(balanced.packages.length,1);
  assert.equal(generatePackingPlan(lines,types,'COMPACT').packages.length,2);
});
test('11. peso neto aceptable pero tara supera máximo',()=>{
  const p=generatePackingPlan([line({weightKg:10})],[box('overweight',10,10)]);assert.equal(p.unpackedItems.length,1);
});
test('12. pedido heterogéneo entrega paquetes y peso bruto a FedEx',()=>{
  const lines=[line({lengthCm:10,widthCm:10,heightCm:10,quantity:2}),line({lineId:2,productId:2,quantity:5})];
  const p=generatePackingPlan(lines,[box()]);const packages=mapPackingToShipment(p);const payload=fedexPackageLineItems(packages);
  assert.equal(payload.length,3);assert.equal(p.metrics.articleCount,7);assert.ok(payload.every(p=>p.groupPackageCount===1));
  assert.deepEqual(payload.map(p=>p.weight.value).sort((a,b)=>a-b),[1.5,1.5,5.5]);
  assert.deepEqual(payload[0].dimensions,{length:12,width:12,height:12,units:'CM'});
});
test('valida el mismo plan en el servidor sin duplicar tara ni peso volumétrico',()=>{
  const lines=[line({quantity:5})],rows=[box()];const original=generatePackingPlan(lines,rows);
  const verified=validatePackingAssignments(lines,rows,assignmentsFromPlan(original),original.strategy);
  assert.equal(verified.status,'READY_FOR_QUOTE');assert.equal(mapPackingToShipment(verified)[0].contentWeight,5.5);
  assert.deepEqual(mapPackingToShipment(verified),mapPackingToShipment(original));
});
test('edición manual rechaza duplicados, unidades omitidas y caja incompatible',()=>{
  const lines=[line({quantity:2})],rows=[box(),box('tiny',3)];const p=generatePackingPlan(lines,rows);const a=assignmentsFromPlan(p);
  assert.equal(validatePackingAssignments(lines,rows,[{...a[0],unitIds:[a[0].unitIds[0],a[0].unitIds[0]]}],'BALANCED').status,'INVALID_PACKING');
  assert.equal(validatePackingAssignments(lines,rows,[],'BALANCED').unpackedItems.length,2);
  assert.equal(validatePackingAssignments(lines,rows,[{...a[0],packagingTypeId:'tiny'}],'BALANCED').status,'INVALID_PACKING');
});
test('sin caja requiere confirmación explícita de unidad propia',()=>{
  const lines=[line({lengthCm:30})];const id=normalizePackingLines(lines).units[0].id;
  const a={id:'own',packagingTypeId:null,unitIds:[id]};
  assert.equal(validatePackingAssignments(lines,[],[a],'BALANCED').status,'INVALID_PACKING');
  assert.equal(validatePackingAssignments(lines,[],[{...a,ownPackageConfirmed:true}],'BALANCED').status,'READY_FOR_QUOTE');
});
test('no apilable conserva espacio de suelo sin bloquear acomodo lateral',()=>{
  const p=generatePackingPlan([line({quantity:5,canStack:false})],[box()]);assert.equal(p.packages.length,2);
  assert.ok(p.packages.flatMap(p=>p.items).every(p=>p.position.z===0));
});
test('respeta fragilidad, grupo compatible y protección por lado',()=>{
  const p=generatePackingPlan([line({quantity:5,fragile:true})],[box()]);assert.ok(p.packages.every(p=>p.utilizationPercentage<=80));
  const groups=generatePackingPlan([line({packingGroup:'A'}),line({lineId:2,packingGroup:'B'})],[box()]);assert.equal(groups.packages.length,2);
  assert.equal(generatePackingPlan([line({lengthCm:9,widthCm:9,heightCm:9,protectionMarginCm:1})],[box()]).unpackedItems.length,1);
});
test('convierte pulgadas y libras a cm/kg',()=>{
  const b={...box(),dimension_unit:'IN' as const,weight_unit:'LB' as const};
  const p=generatePackingPlan([line({lengthCm:20,widthCm:20,heightCm:20,weightKg:1})],[b]);
  assert.equal(p.status,'READY_FOR_QUOTE');assert.equal(p.packages[0].externalDimensions.length,30.48);assert.equal(p.packages[0].totalWeight,1.227);
});
test('resultado determinista, incluido el orden de entrada',()=>{
  const lines=[line({quantity:9}),line({lineId:2,productId:2,lengthCm:9,quantity:2})],types=[box(),box('medium',20)];
  assert.deepEqual(generatePackingPlan(lines,types),generatePackingPlan(lines,types));
  assert.deepEqual(generatePackingPlan(lines,types).packages,generatePackingPlan(lines.slice().reverse(),types.slice().reverse()).packages);
});
test('no hay intersecciones entre unidades ni unidades fuera de caja',()=>{
  const p=generatePackingPlan([line({quantity:17}),line({lineId:2,productId:2,lengthCm:3,widthCm:7,heightCm:4,quantity:9})],[box(),box('b',15)]);
  assert.equal(p.status,'READY_FOR_QUOTE');
  for(const pkg of p.packages)for(const a of pkg.items){
    for(const [position,dimension] of [['x','length'],['y','width'],['z','height']] as const)assert.ok(a.position[position]+a.orientation[dimension]<=pkg.internalDimensions[dimension]+1e-7);
    for(const b of pkg.items.filter(b=>b!==a))assert.ok(!(['x','y','z'] as const).every((axis,i)=>{const key=(['length','width','height'] as const)[i];return a.position[axis]<b.position[axis]+b.orientation[key]-1e-7&&a.position[axis]+a.orientation[key]>b.position[axis]+1e-7;}));
  }
});
test('protección final se agrega al volumen externo, sin alterar el peso físico',()=>{
  const p=generatePackingPlan([line()],[box()]);const base=mapPackingToShipment(p)[0],withProtection=mapPackingToShipment(p,1440)[0];
  assert.equal(withProtection.height,base.height+10);assert.equal(withProtection.contentWeight,base.contentWeight);
});
test('cantidades fraccionarias y demasiado grandes se rechazan sin truncarlas',()=>{
  assert.equal(normalizePackingLines([line({quantity:1.5})]).missingLines.length,1);
  assert.throws(()=>normalizePackingLines([line({quantity:2001})]),/divide el envío/);
});
