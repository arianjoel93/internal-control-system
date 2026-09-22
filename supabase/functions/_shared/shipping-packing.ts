// Pure packing domain shared by the browser and the shipping Edge Function.
export type PackingStrategy = 'BALANCED' | 'MIN_PACKAGES' | 'COMPACT' | 'CONSERVATIVE';
export type Dimensions = { length: number; width: number; height: number };
export type Position = { x: number; y: number; z: number };
export type ProductRules = {
  canRotate?: boolean; canStack?: boolean; fragile?: boolean; shipAlone?: boolean;
  canCombine?: boolean; packingGroup?: string | null; protectionMarginCm?: number;
};
export type PackingLine = ProductRules & {
  lineId: number; productId: number; sku: string | null; productName: string; quantity: number;
  lengthCm: number | null; widthCm: number | null; heightCm: number | null; weightKg: number | null;
};
export type PhysicalUnit = ProductRules & {
  id: string; lineId: number; productId: number; sku: string | null; productName: string;
  unitIndex: number; originalQuantity: number; weightKg: number; dimensions: Dimensions;
};
export type PackagingRow = {
  id: string; name: string; internal_code: string; is_active: boolean; sort_order: number;
  length: number | null; width: number | null; height: number | null;
  internal_length?: number | null; internal_width?: number | null; internal_height?: number | null;
  external_length?: number | null; external_width?: number | null; external_height?: number | null;
  dimension_unit: 'CM' | 'IN'; weight_unit: 'KG' | 'LB'; empty_weight: number | null;
  max_weight: number | null; max_fill_percent?: number | null; box_cost?: number | null;
};
export type PackingBox = {
  id: string; name: string; internal: Dimensions; external: Dimensions; tareKg: number;
  maxWeightKg: number; maxUtilization: number; cost: number; priority: number;
};
export type Placement = { unit: PhysicalUnit; position: Position; orientation: Dimensions };
export type PackingPackage = {
  id: string; packagingTypeId: string | null; packagingName: string;
  internalDimensions: Dimensions; externalDimensions: Dimensions; items: Placement[];
  productsWeight: number; packagingWeight: number; totalWeight: number;
  maxWeight: number; usedVolume: number; availableVolume: number; utilizationPercentage: number;
  packagingCost: number; explanation: string; warnings: string[]; errors: string[]; status: 'PACKED' | 'INVALID_PACKING';
};
export type UnpackedItem = { unit: PhysicalUnit; reason: string; code: 'OVERSIZE' | 'UNASSIGNED' };
export type PackingAssignment = { id: string; packagingTypeId: string | null; unitIds: string[]; ownPackageConfirmed?: boolean };
export type PackingRequest = { version: 1; strategy: PackingStrategy; lines: PackingLine[]; assignments: PackingAssignment[] };
export type PackingPlan = {
  version: 1; strategy: PackingStrategy; packages: PackingPackage[]; unpackedItems: UnpackedItem[];
  warnings: string[]; errors: string[]; missingLines: Array<{ lineId: number; name: string; quantity: number; reason: string }>;
  status: 'PENDING_DATA' | 'PARTIALLY_PACKED' | 'INVALID_PACKING' | 'READY_FOR_QUOTE';
  metrics: { articleCount: number; packageCount: number; netWeight: number; grossWeight: number;
    productVolume: number; packagingVolume: number; averageUtilization: number; missingProducts: number; unpackedCount: number };
};
export type PackingLog = (event: string, detail: Record<string, string | number>) => void;
const EPS = 1e-7;
export const MAX_PHYSICAL_UNITS = 2000;
const STRATEGIES: PackingStrategy[] = ['BALANCED', 'MIN_PACKAGES', 'COMPACT', 'CONSERVATIVE'];
type Space = Dimensions & Position;
type OpenBox = { box: PackingBox; placements: Placement[]; spaces: Space[]; used: number; weight: number; explanation?: string };
const volume = (d: Dimensions) => d.length * d.width * d.height;
const positive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;
const nonNegative = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const round = (v: number) => Math.round(v * 1000) / 1000;

export function normalizePackaging(row: PackagingRow): PackingBox | null {
  const dimensionFactor = row.dimension_unit === 'IN' ? 2.54 : 1;
  const weightFactor = row.weight_unit === 'LB' ? 0.45359237 : 1;
  const internal = { length: Number(row.internal_length ?? row.length), width: Number(row.internal_width ?? row.width), height: Number(row.internal_height ?? row.height) };
  const external = { length: Number(row.external_length ?? row.length), width: Number(row.external_width ?? row.width), height: Number(row.external_height ?? row.height) };
  const fill = Number(row.max_fill_percent ?? 100);
  if (!Object.values(internal).every(positive) || !Object.values(external).every(positive)
    || row.empty_weight === null || !nonNegative(Number(row.empty_weight)) || !positive(Number(row.max_weight))
    || Number(row.empty_weight) >= Number(row.max_weight) || !positive(fill) || fill > 100
    || external.length < internal.length || external.width < internal.width || external.height < internal.height) return null;
  for (const key of ['length', 'width', 'height'] as const) { internal[key] *= dimensionFactor; external[key] *= dimensionFactor; }
  return { id: row.id, name: row.name, internal, external, tareKg: Number(row.empty_weight) * weightFactor,
    maxWeightKg: Number(row.max_weight) * weightFactor, maxUtilization: fill, cost: Math.max(0, Number(row.box_cost) || 0), priority: row.sort_order || 0 };
}

export function normalizePackingLines(lines: PackingLine[], log?: PackingLog) {
  const units: PhysicalUnit[] = [];
  const missingLines: PackingPlan['missingLines'] = [];
  const seen = new Set<number>();
  const requestedCount = lines.reduce((sum, line) => sum + (positive(line.quantity) ? line.quantity : 0), 0);
  if (requestedCount > MAX_PHYSICAL_UNITS) throw new Error(`La orden supera ${MAX_PHYSICAL_UNITS} unidades físicas; divide el envío para validar el acomodo.`);
  for (const line of lines) {
    const missing = [!positive(line.lengthCm) && 'largo', !positive(line.widthCm) && 'ancho', !positive(line.heightCm) && 'alto',
      !nonNegative(line.weightKg) && 'peso físico', (!Number.isInteger(line.quantity) || line.quantity <= 0) && 'cantidad entera',
      (line.protectionMarginCm != null && !nonNegative(line.protectionMarginCm)) && 'margen de protección',
      (!Number.isSafeInteger(line.lineId) || !Number.isSafeInteger(line.productId) || seen.has(line.lineId)) && 'referencia de línea única'].filter(Boolean);
    seen.add(line.lineId);
    if (missing.length) { missingLines.push({ lineId: line.lineId, name: line.productName, quantity: Number.isInteger(line.quantity) && line.quantity > 0 ? line.quantity : 0, reason: `Datos físicos incompletos: ${missing.join(', ')}.` }); continue; }
    for (let i = 1; i <= line.quantity; i++) {
      units.push({ id: `${line.lineId}:${line.productId}:${i}`, lineId: line.lineId, productId: line.productId, sku: line.sku,
        productName: line.productName, unitIndex: i, originalQuantity: line.quantity, weightKg: Number(line.weightKg),
        dimensions: { length: Number(line.lengthCm), width: Number(line.widthCm), height: Number(line.heightCm) },
        canRotate: line.canRotate !== false, canStack: line.canStack !== false, fragile: line.fragile === true,
        shipAlone: line.shipAlone === true, canCombine: line.canCombine !== false,
        packingGroup: line.packingGroup || null, protectionMarginCm: line.protectionMarginCm ?? 0 });
    }
    log?.('ITEM_NORMALIZED', { lineId: line.lineId, quantity: line.quantity });
  }
  return { units, missingLines };
}

function orientations(unit: PhysicalUnit): Dimensions[] {
  const pad = (unit.protectionMarginCm ?? 0) * 2;
  const l = unit.dimensions.length + pad, w = unit.dimensions.width + pad, h = unit.dimensions.height + pad;
  const candidates = unit.canRotate !== false ? [[l,w,h], [l,h,w], [w,l,h], [w,h,l], [h,l,w], [h,w,l]] : [[l,w,h]];
  return [...new Map(candidates.map(([length,width,height]) => [`${length}:${width}:${height}`, { length,width,height }])).values()];
}
function ordered(units: PhysicalUnit[]) {
  return units.slice().sort((a,b) => Number(b.shipAlone || b.canCombine === false) - Number(a.shipAlone || a.canCombine === false)
    || Math.max(...Object.values(b.dimensions)) - Math.max(...Object.values(a.dimensions))
    || volume(b.dimensions) - volume(a.dimensions) || b.weightKg - a.weightKg || a.id.localeCompare(b.id));
}
function openBox(box: PackingBox): OpenBox {
  return { box, placements: [], spaces: [{ x:0,y:0,z:0,...box.internal }], used:0,weight:0 };
}
function overlaps(a: Space, b: Space) {
  return a.x < b.x+b.length-EPS && a.x+a.length > b.x+EPS && a.y < b.y+b.width-EPS && a.y+a.width > b.y+EPS && a.z < b.z+b.height-EPS && a.z+a.height > b.z+EPS;
}
function contains(a: Space, b: Space) {
  return a.x <= b.x+EPS && a.y <= b.y+EPS && a.z <= b.z+EPS && a.x+a.length+EPS >= b.x+b.length && a.y+a.width+EPS >= b.y+b.width && a.z+a.height+EPS >= b.z+b.height;
}
function supported(pkg: OpenBox, item: PhysicalUnit, position: Position, d: Dimensions) {
  if (position.z <= EPS) return true;
  if (item.canStack === false || item.fragile) return false;
  // Require a full supporting footprint. Never place an item over fragile/non-stackable goods.
  const supports = pkg.placements.filter(p => Math.abs(p.position.z+p.orientation.height-position.z) < EPS
    && p.unit.canStack !== false && !p.unit.fragile);
  const area = supports.reduce((sum,p) => sum + Math.max(0, Math.min(position.x+d.length,p.position.x+p.orientation.length)-Math.max(position.x,p.position.x))
    * Math.max(0,Math.min(position.y+d.width,p.position.y+p.orientation.width)-Math.max(position.y,p.position.y)),0);
  return area+EPS >= d.length*d.width;
}
function findPlacement(pkg: OpenBox, unit: PhysicalUnit, strategy: PackingStrategy): Placement | null {
  if (pkg.placements.length && (unit.shipAlone || unit.canCombine === false || pkg.placements.some(p => p.unit.shipAlone || p.unit.canCombine === false))) return null;
  if (unit.packingGroup && pkg.placements.some(p => p.unit.packingGroup && p.unit.packingGroup !== unit.packingGroup)) return null;
  if (pkg.weight+unit.weightKg+pkg.box.tareKg > pkg.box.maxWeightKg+EPS) return null;
  const fill = Math.min(pkg.box.maxUtilization, strategy === 'CONSERVATIVE' ? 80 : 100,
    unit.fragile || pkg.placements.some(p => p.unit.fragile) ? 80 : 100);
  const candidates: Array<Placement & { score: number }> = [];
  for (const d of orientations(unit)) {
    if (pkg.used+volume(d) > volume(pkg.box.internal)*fill/100+EPS) continue;
    for (const s of pkg.spaces) {
      if (d.length>s.length+EPS || d.width>s.width+EPS || d.height>s.height+EPS) continue;
      const pos = { x:s.x,y:s.y,z:s.z };
      if (!supported(pkg,unit,pos,d) || pkg.placements.some(p => overlaps({...p.position,...p.orientation},{...pos,...d}))) continue;
      candidates.push({ unit,position:pos,orientation:d,score: s.z*1e9+(volume(s)-volume(d))+(s.length-d.length+s.width-d.width+s.height-d.height)*0.001 });
    }
  }
  candidates.sort((a,b)=>a.score-b.score || a.position.y-b.position.y || a.position.x-b.position.x);
  const candidate = candidates[0];
  return candidate ? {unit:candidate.unit,position:candidate.position,orientation:candidate.orientation} : null;
}
function place(pkg: OpenBox, p: Placement) {
  pkg.placements.push(p); pkg.weight += p.unit.weightKg; pkg.used += volume(p.orientation);
  const b = {...p.position,...p.orientation};
  const spaces: Space[] = [];
  for (const s of pkg.spaces) {
    if (!overlaps(s,b)) { spaces.push(s); continue; }
    // Split every intersected empty prism on all six faces, retaining only empty spaces.
    spaces.push({...s,length:b.x-s.x}, {...s,x:b.x+b.length,length:s.x+s.length-b.x-b.length},
      {...s,width:b.y-s.y}, {...s,y:b.y+b.width,width:s.y+s.width-b.y-b.width},
      {...s,height:b.z-s.z}, {...s,z:b.z+b.height,height:s.z+s.height-b.z-b.height});
  }
  const unique = [...new Map(spaces.filter(s=>s.length>EPS&&s.width>EPS&&s.height>EPS)
    .map(s=>[`${s.x}:${s.y}:${s.z}:${s.length}:${s.width}:${s.height}`,s])).values()];
  pkg.spaces = unique.filter((s,i)=>!unique.some((other,j)=>i!==j&&contains(other,s)))
    .sort((a,b)=>a.z-b.z || volume(a)-volume(b) || a.y-b.y || a.x-b.x).slice(0,160);
}
function packed(pkg: OpenBox, id: string, own = false): PackingPackage {
  const utilization = pkg.used/volume(pkg.box.internal)*100;
  const warnings = [];
  if (utilization >= pkg.box.maxUtilization*0.92) warnings.push('Esta caja está cerca del límite de ocupación configurado.');
  if (pkg.placements.some(p=>p.unit.fragile)) warnings.push('Contenido frágil: ocupación limitada al 80 % y sin carga encima.');
  if (own) warnings.push('Envío individual sin caja de catálogo confirmado por el usuario.');
  return { id,packagingTypeId:own?null:pkg.box.id,packagingName:pkg.box.name,internalDimensions:pkg.box.internal,externalDimensions:pkg.box.external,
    items:pkg.placements,productsWeight:round(pkg.weight),packagingWeight:round(pkg.box.tareKg),totalWeight:round(pkg.weight+pkg.box.tareKg),
    maxWeight:pkg.box.maxWeightKg,usedVolume:round(pkg.used),availableVolume:round(volume(pkg.box.internal)*pkg.box.maxUtilization/100),
    utilizationPercentage:round(utilization),packagingCost:pkg.box.cost,status:'PACKED',warnings,errors:[],
    explanation:own?'Se usarán las dimensiones propias de esta unidad.':pkg.explanation ?? 'Distribución revisada: se validaron orientación, apoyo, peso y ocupación de cada unidad dentro de este embalaje.' };
}
function finish(strategy: PackingStrategy, units: PhysicalUnit[], packages: PackingPackage[], missingLines: PackingPlan['missingLines'], unpackedItems: UnpackedItem[], errors: string[]): PackingPlan {
  const pv = packages.reduce((s,p)=>s+volume(p.internalDimensions),0);
  const warnings = [...new Set(packages.flatMap(p=>p.warnings))];
  return { version:1,strategy,packages,missingLines,unpackedItems,errors,warnings,
    status:errors.length?'INVALID_PACKING':missingLines.length?'PENDING_DATA':unpackedItems.length?'PARTIALLY_PACKED':packages.length?'READY_FOR_QUOTE':'INVALID_PACKING',
    metrics:{articleCount:units.length+missingLines.reduce((sum,line)=>sum+line.quantity,0),packageCount:packages.length,netWeight:round(units.reduce((s,u)=>s+u.weightKg,0)),
      grossWeight:round(packages.reduce((s,p)=>s+p.totalWeight,0)), productVolume:round(units.reduce((s,u)=>s+volume(u.dimensions),0)),packagingVolume:round(pv),
      averageUtilization:pv?round(packages.reduce((s,p)=>s+p.usedVolume,0)/pv*100):0,missingProducts:missingLines.length,unpackedCount:unpackedItems.length} };
}

export function generatePackingPlan(lines: PackingLine[], rows: PackagingRow[], strategy: PackingStrategy = 'BALANCED', log?: PackingLog): PackingPlan {
  if (!STRATEGIES.includes(strategy)) throw new Error('Estrategia de embalaje no válida.');
  log?.('PACKING_STARTED',{lines:lines.length,strategy});
  const {units,missingLines}=normalizePackingLines(lines,log);
  const boxes=rows.filter(r=>r.is_active).map(normalizePackaging).filter((b):b is PackingBox=>!!b)
    .sort((a,b)=>volume(a.internal)-volume(b.internal)||a.priority-b.priority||a.id.localeCompare(b.id));
  const opened:OpenBox[]=[]; const unpacked:UnpackedItem[]=[]; const sorted=ordered(units);
  for(let index=0;index<sorted.length;index++) {
    const unit=sorted[index];
    const existing=opened.map(pkg=>({pkg,placement:findPlacement(pkg,unit,strategy)})).filter(x=>x.placement)
      .sort((a,b)=>(volume(a.pkg.box.internal)-a.pkg.used)-(volume(b.pkg.box.internal)-b.pkg.used));
    if(existing[0]?.placement) {place(existing[0].pkg,existing[0].placement);log?.('ITEM_PACKED',{unitId:unit.id,boxId:existing[0].pkg.box.id});continue;}
    const options=boxes.flatMap(box=>{
      const pkg=openBox(box); const p=findPlacement(pkg,unit,strategy);
      if(!p){log?.('ITEM_REJECTED_FROM_PACKAGE',{unitId:unit.id,boxId:box.id});return [];}
      place(pkg,p);
      // Bounded deterministic look-ahead rewards boxes that absorb the next units.
      if(strategy!=='COMPACT') for(const next of sorted.slice(index+1,index+65)){const q=findPlacement(pkg,next,strategy);if(q)place(pkg,q);}
      const count=pkg.placements.length; const waste=1-pkg.used/volume(box.internal);
      const capacityWaste=(box.maxWeightKg-pkg.weight-box.tareKg)/box.maxWeightKg;
      const score=strategy==='MIN_PACKAGES'?-count*1e6+volume(box.external)/count:
        strategy==='COMPACT'?volume(box.external)+box.cost*10:
        volume(box.external)/count+(waste+capacityWaste)*100+box.cost*10+5000/count;
      return [{box,score,count}];
    }).sort((a,b)=>a.score-b.score||a.box.priority-b.box.priority||a.box.id.localeCompare(b.box.id));
    if(!options.length){unpacked.push({unit,code:'OVERSIZE',reason:boxes.length?'El producto no cabe en ninguno de los embalajes configurados con sus límites de peso y ocupación.':'No existen embalajes activos con datos completos.'});continue;}
    const pkg=openBox(options[0].box);
    pkg.explanation = strategy === 'COMPACT'
      ? `Se eligió ${pkg.box.name} por su menor volumen externo entre los embalajes compatibles, considerando el costo de la caja.`
      : `Se compararon ${options.length} embalajes compatibles. ${pkg.box.name} obtuvo la mejor puntuación de ${strategy === 'MIN_PACKAGES' ? 'consolidación' : 'equilibrio entre volumen por unidad, ocupación, capacidad de peso y costo'}. La revisión de los siguientes artículos estimó espacio para ${options[0].count} unidades. No incluye una comparación de tarifas FedEx.`;
    place(pkg,findPlacement(pkg,unit,strategy)!);opened.push(pkg);
    log?.('PACKAGE_OPENED',{boxId:pkg.box.id});
  }
  const packages=opened.map((p,i)=>{log?.('PACKAGE_COMPLETED',{boxId:p.box.id,units:p.placements.length});return packed(p,`box-${i+1}`);});
  const result=finish(strategy,units,packages,missingLines,unpacked,[]);
  log?.('PACKING_COMPLETED',{packages:packages.length,unpacked:unpacked.length});return result;
}

export function assignmentsFromPlan(plan: PackingPlan): PackingAssignment[] {
  return plan.packages.map(p=>({id:p.id,packagingTypeId:p.packagingTypeId,unitIds:p.items.map(i=>i.unit.id),ownPackageConfirmed:p.packagingTypeId===null}));
}

export function validatePackingAssignments(lines: PackingLine[], rows: PackagingRow[], assignments: PackingAssignment[], strategy: PackingStrategy): PackingPlan {
  if(!STRATEGIES.includes(strategy))throw new Error('Estrategia de embalaje no válida.');
  if(!Array.isArray(assignments)||assignments.length>MAX_PHYSICAL_UNITS)throw new Error('Distribución de paquetes no válida.');
  const {units,missingLines}=normalizePackingLines(lines); const byId=new Map(units.map(u=>[u.id,u]));
  const seen=new Set<string>();const referenced=new Set<string>();const packageIds=new Set<string>();const errors:string[]=[];
  type PackingContext = { id:string; box:PackingBox; pkg:OpenBox; preferredUnitIds:Set<string>; errors:string[]; own:boolean };
  const contexts:PackingContext[]=[];
  const originalContext=new Map<string,PackingContext>();
  const unresolvedReasons=new Map<string,string>();

  for(const a of assignments){
    if(!a || typeof a.id!=='string'||!Array.isArray(a.unitIds)||a.unitIds.length>MAX_PHYSICAL_UNITS)throw new Error('Paquete no válido.');
    if(packageIds.has(a.id))errors.push('Hay identificadores de paquete duplicados.');packageIds.add(a.id);
    const requested= a.unitIds.map(id=>byId.get(id)).filter((u):u is PhysicalUnit=>!!u);
    for(const id of a.unitIds){
      if(!byId.has(id))errors.push(`Unidad desconocida: ${id}.`);
      else if(referenced.has(id))errors.push(`Unidad duplicada: ${id}.`);
      else referenced.add(id);
    }
    let box: PackingBox|null=null;
    if(a.packagingTypeId){const row=rows.find(r=>r.id===a.packagingTypeId&&r.is_active);box=row?normalizePackaging(row):null;}
    else if(a.ownPackageConfirmed&&requested.length===1){const u=requested[0];const d=orientations({...u,canRotate:false})[0];box={id:a.id,name:'Paquete individual confirmado',internal:d,external:d,tareKg:0,maxWeightKg:Math.max(u.weightKg,0.001),maxUtilization:100,cost:0,priority:0};}
    if(!box){errors.push(`${a.id}: selecciona un embalaje activo o confirma un paquete individual con sus dimensiones.`);continue;}
    if(!requested.length){errors.push(`${a.id}: la caja está vacía; agrega un artículo o elimínala.`);continue;}
    const context:PackingContext={id:a.id,box,pkg:openBox(box),preferredUnitIds:new Set(requested.map(u=>u.id)),errors:[],own:!a.packagingTypeId};
    contexts.push(context);
    for(const u of requested)if(!originalContext.has(u.id))originalContext.set(u.id,context);
  }

  // A selected box is filled as much as possible before the remaining units
  // are assigned to the next compatible box. This also makes manual changes
  // behave like a controlled re-optimization instead of a hard assignment.
  for(const context of contexts){
    const preferred=ordered(units.filter(u=>context.preferredUnitIds.has(u.id)&&!seen.has(u.id)));
    const remaining=ordered(units.filter(u=>!context.preferredUnitIds.has(u.id)&&!seen.has(u.id)));
    for(const u of [...preferred,...remaining]){
      if(seen.has(u.id))continue;
      const placement=findPlacement(context.pkg,u,strategy);
      if(placement){place(context.pkg,placement);seen.add(u.id);}
    }
  }

  for(const unit of units.filter(u=>!seen.has(u.id))){
    const source=originalContext.get(unit.id);
    if(source){
      const alternatives=rows
      .filter(row=>row.is_active && row.id!==source.box.id)
      .map(row=>{const box=normalizePackaging(row);if(!box)return null;const probe=openBox(box);return findPlacement(probe,unit,strategy)?box.name:null;})
      .filter((name):name is string=>!!name);
      const recommendation=alternatives.length?` Prueba con: ${alternatives.slice(0,3).join(', ')}.`:' Selecciona un embalaje mayor o divide la distribución.';
      const message=`El producto ${unit.productName} no cabe en este embalaje con la distribución actual.${recommendation}`;
      source.errors.push(message);
      unresolvedReasons.set(unit.id,`No cabe en el embalaje seleccionado. ${recommendation.trim()}`);
    }
  }

  const packages=contexts.filter(context=>context.pkg.placements.length).map(context=>{
    const result=packed(context.pkg,context.id,context.own);
    if(context.errors.length){result.status='INVALID_PACKING';result.errors=context.errors;}
    return result;
  });
  const unpacked=units.filter(u=>!seen.has(u.id)).map(unit=>({unit,code:'UNASSIGNED' as const,reason:unresolvedReasons.get(unit.id)??'Unidad pendiente de asignar a un paquete.'}));
  return finish(strategy,units,packages,missingLines,unpacked,errors);
}

// FedEx receives one entry per physical package, with gross mass and external dimensions.
export function mapPackingToShipment(plan: PackingPlan, extraProtectionVolumeCm3=0) {
  if(plan.status!=='READY_FOR_QUOTE')throw new Error('Completa y valida la distribución antes de cotizar.');
  if(!nonNegative(extraProtectionVolumeCm3))throw new Error('Volumen de protección no válido.');
  return plan.packages.map(p=>{
    const {length,width,height}=p.externalDimensions;
    // Keep the existing final protection allowance, represented as extra external space.
    const addedHeight=extraProtectionVolumeCm3/plan.packages.length/(length*width);
    return {id:p.id,packageTypeId:p.packagingTypeId,name:p.packagingName,quantity:1,contentWeight:p.totalWeight,
      length:Math.ceil(length),width:Math.ceil(width),height:Math.ceil(height+addedHeight),dimensionUnit:'CM' as const,weightUnit:'KG' as const};
  });
}

export function fedexPackageLineItems(packages: Array<{contentWeight:number;length:number;width:number;height:number}>,log?:PackingLog) {
  if(!packages.length||packages.some(p=>!positive(p.contentWeight)||![p.length,p.width,p.height].every(positive)))throw new Error('El envío contiene peso o dimensiones no válidos.');
  log?.('FEDEX_PACKAGES_CREATED',{count:packages.length});
  return packages.map((p,i)=>({sequenceNumber:i+1,groupPackageCount:1,weight:{units:'KG',value:Math.ceil(p.contentWeight*1000)/1000},
    dimensions:{length:Math.ceil(p.length),width:Math.ceil(p.width),height:Math.ceil(p.height),units:'CM'}}));
}
