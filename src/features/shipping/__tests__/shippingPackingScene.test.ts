import assert from 'node:assert/strict';
import test from 'node:test';
import { placementToScene, projectScenePoint, buildPackingScene, packingProductColors } from '../shippingPackingScene.ts';
import { generatePackingPlan, type Placement, type PackagingRow } from '../../../../supabase/functions/_shared/shipping-packing.ts';

const placement: Placement = {
  unit: { id:'1:2:1',lineId:1,productId:2,sku:'R',productName:'Rollo',unitIndex:1,originalQuantity:1,
    weightKg:1,physicalUnit:'ROLLO',dimensions:{length:10,width:10,height:4},protectionMarginCm:1 },
  position:{x:3,y:5,z:7},orientation:{length:6,width:12,height:12},
};

test('escena respeta posición, orientación y protección del acomodo, con eje vertical en Z del motor',()=>{
  const scene=placementToScene(placement);
  assert.deepEqual(scene.center,{x:6,y:13,z:11});
  assert.deepEqual(scene.size,{length:4,width:10,height:10});
  assert.equal(scene.rollAxis,'x');
  assert.equal(scene.shape,'roll');
  assert.equal(placement.position.x,3);
});

test('presentación cerrada sigue siendo bloque aun si sus metadatos mencionan rollos',()=>{
  const scene=placementToScene({...placement,unit:{...placement.unit,prepacked:true,presentationQuantity:36}});
  assert.equal(scene.closed,true);
  assert.equal(scene.shape,'box');
});

test('proyección permite girar 90 grados y no altera distancia al origen',()=>{
  const point={x:10,y:4,z:2};
  const initial=projectScenePoint(point,0,0),rotated=projectScenePoint(point,Math.PI/2,0);
  assert.equal(initial.x,10);
  assert.ok(Math.abs(rotated.x+2)<1e-9);
  assert.ok(Math.abs(rotated.depth-10)<1e-9);
  for(const yaw of [0,1,Math.PI]) for(const pitch of [-.2,.5,1.48]){
    const p=projectScenePoint(point,yaw,pitch);
    assert.ok(Math.abs(p.x*p.x+p.y*p.y+p.depth*p.depth-120)<1e-9);
  }
});

test('visor conserva todos los identificadores y pesos del plan calculado',()=>{
  const box:PackagingRow={id:'box',name:'Caja',internal_code:'BOX',is_active:true,sort_order:1,
    length:25,width:25,height:25,external_length:26,external_width:26,external_height:26,
    empty_weight:.4,max_weight:20,max_fill_percent:90,dimension_unit:'CM',weight_unit:'KG'};
  const plan=generatePackingPlan([{lineId:1,productId:2,sku:'A',productName:'Rollos',quantity:13,uom:'Rollos',lengthCm:10,widthCm:10,heightCm:4,weightKg:.5}], [box]);
  assert.equal(plan.packages.length,1);
  assert.equal(buildPackingScene(plan.packages[0]).length,13);
  const before=JSON.stringify(plan);
  for(const pkg of plan.packages){
    const scene=buildPackingScene(pkg);
    assert.deepEqual(scene.map(s=>s.id),pkg.items.map(p=>p.unit.id));
    assert.ok(scene.every(s=>s.shape==='roll'));
  }
  assert.equal(JSON.stringify(plan),before);
  const twoProducts=[...plan.packages,{...plan.packages[0],items:[{...placement,unit:{...placement.unit,productId:88}}]}];
  const colors=packingProductColors(twoProducts);
  assert.notEqual(colors.get('2'),colors.get('88'));
  assert.deepEqual(packingProductColors(twoProducts.slice().reverse()),colors);
});
