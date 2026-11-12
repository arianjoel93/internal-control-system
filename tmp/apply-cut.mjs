import fs from 'node:fs';
const shared='supabase/functions/_shared/shipping-packing.ts';
let s=fs.readFileSync(shared,'utf8');
let scene=fs.readFileSync('src/features/shipping/shippingPackingScene.ts','utf8');
const start=scene.indexOf('// Advisory only.');const end=scene.indexOf('export function projectScenePoint',start);
const helper=scene.slice(start,end);
scene=scene.slice(0,start)+"export { suggestHeightReduction } from '../../../supabase/functions/_shared/shipping-packing';\n\n"+scene.slice(end);
fs.writeFileSync('src/features/shipping/shippingPackingScene.ts',scene);
s=s.replace('assignments: PackingAssignment[] };','assignments: PackingAssignment[]; disabledHeightCuts?: string[] };');
s=s.replace('// FedEx receives one entry',helper+`export function applyHeightCuts(plan: PackingPlan, disabled: string[] = []): PackingPlan {
  const packages = plan.packages.map(pkg => {
    const cut = disabled.includes(pkg.id) ? null : suggestHeightReduction(pkg);
    if (!cut) return pkg;
    const externalDimensions = {...pkg.externalDimensions, height:cut.externalHeight};
    const internalDimensions = {...pkg.internalDimensions, height:cut.internalHeight};
    const volumetricWeight=round(volume(externalDimensions)/5000);
    const availableVolume=volume(internalDimensions);
    return {...pkg,externalDimensions,internalDimensions,volumetricWeight,
      billableWeight:round(Math.max(pkg.totalWeight,volumetricWeight)),availableVolume,
      utilizationPercentage:round(pkg.usedVolume/availableVolume*100),
      explanation:pkg.explanation+' Recorte superior aplicado: '+cut.removableCm+' cm.',
      warnings:[...pkg.warnings,'Recorte previsto: validar cierre y medidas finales en almacén.']};
  });
  const sum=(f:(p:PackingPackage)=>number)=>round(packages.reduce((n,p)=>n+f(p),0));
  const available=sum(p=>p.availableVolume);
  return {...plan,packages,warnings:[...new Set(packages.flatMap(p=>p.warnings))],metrics:{...plan.metrics,
    volumetricWeight:sum(p=>p.volumetricWeight),billableWeight:sum(p=>p.billableWeight),
    packagingVolume:sum(p=>volume(p.externalDimensions)),totalAvailableVolume:available,
    averageUtilization:available?round(plan.metrics.totalUsedVolume/available*100):0,
    wastedVolume:round(Math.max(0,available-plan.metrics.totalUsedVolume))}};
}

// FedEx receives one entry`);
s=s.replace('const plan = validatePackingAssignments(request.lines, rows, request.assignments, request.strategy);','const originalPlan = validatePackingAssignments(request.lines, rows, request.assignments, request.strategy);\n  const plan = applyHeightCuts(originalPlan, request.disabledHeightCuts);');
s=s.replace('snapshot: { ...plan, lines: request.lines, assignments: assignmentsFromPlan(plan) },','snapshot: { ...plan, originalPackages: originalPlan.packages, disabledHeightCuts: request.disabledHeightCuts ?? [], lines: request.lines, assignments: assignmentsFromPlan(plan) },');
fs.writeFileSync(shared,s);
const dash='src/features/shipping/ShippingQuotesDashboard.tsx';s=fs.readFileSync(dash,'utf8');
s=s.replace('import { mapPackingToShipment,','import { applyHeightCuts, mapPackingToShipment,');
s=s.replace('  const manualAssignments =',"  const [heightCutEdits,setHeightCutEdits] = useState<{key:string; disabled:string[]}|null>(null);\n  const disabledHeightCuts = heightCutEdits?.key===packingKey ? heightCutEdits.disabled : [];\n  const manualAssignments =");
s=s.replace("  const packages = packing.plan?.status", "  const quotePlan = packing.plan ? applyHeightCuts(packing.plan,disabledHeightCuts) : null;\n  const packages = quotePlan?.status");
s=s.replace('mapPackingToShipment(packing.plan,','mapPackingToShipment(quotePlan!,');
s=s.replace('baseVolumetricWeight: packing.plan?.packages','baseVolumetricWeight: quotePlan?.packages');
s=s.replace('    packing.assignments,','    packing.assignments,\n    disabledHeightCuts,');
s=s.replace('          assignments: packing.assignments,','          assignments: packing.assignments,\n          disabledHeightCuts,');
s=s.replace('<ShippingPackingWorkspace plan={packing.plan} lines=', '<ShippingPackingWorkspace plan={packing.plan} disabledHeightCuts={disabledHeightCuts} onHeightCut={(id,enabled)=>{setHeightCutEdits({key:packingKey,disabled:enabled?disabledHeightCuts.filter(v=>v!==id):[...disabledHeightCuts,id]});setQuote(null);}} lines=');
fs.writeFileSync(dash,s);
const workspace='src/features/shipping/ShippingPackingWorkspace.tsx';s=fs.readFileSync(workspace,'utf8');
s=s.replace('({plan,lines,assignments,packageTypes,strategy,onStrategy,onAssignments,onRecalculate}', '({plan,lines,assignments,packageTypes,strategy,onStrategy,onAssignments,onRecalculate,disabledHeightCuts,onHeightCut}');
s=s.replace('  plan:PackingPlan; lines:PackingLine[];', '  disabledHeightCuts:string[]; onHeightCut:(id:string,enabled:boolean)=>void;\n  plan:PackingPlan; lines:PackingLine[];');
s=s.replace('<ShippingPackingViewer plan={plan} lines={lines} />','<ShippingPackingViewer plan={plan} lines={lines} disabledHeightCuts={disabledHeightCuts} onHeightCut={onHeightCut} />');fs.writeFileSync(workspace,s);
const viewer='src/features/shipping/ShippingPackingViewer.tsx';s=fs.readFileSync(viewer,'utf8');
s="import { applyHeightCuts } from '../../../supabase/functions/_shared/shipping-packing';\n"+s;
s=s.replace('({ plan, lines = [] }: { plan: PackingPlan; lines?: PackingLine[] })','({ plan, lines = [], disabledHeightCuts = [], onHeightCut }: { plan: PackingPlan; lines?: PackingLine[]; disabledHeightCuts?:string[]; onHeightCut?:(id:string,enabled:boolean)=>void })');
s=s.replace('  const [cutPackageId,setCutPackageId] = useState<string|null>(null);','  const [localDisabled,setLocalDisabled] = useState<string[]>([]);\n  const disabledCuts = onHeightCut ? disabledHeightCuts : localDisabled;\n  const effectivePlan = applyHeightCuts(plan,disabledCuts);');
s=s.replace('const showCut = !!pkg && cutPackageId===pkg.id;','const showCut = !!pkg && !!cut && !disabledCuts.includes(pkg.id);');
s=s.replace('setCutPackageId(event.target.checked?pkg.id:null);','if(onHeightCut)onHeightCut(pkg.id,event.target.checked);else setLocalDisabled(event.target.checked?disabledCuts.filter(id=>id!==pkg.id):[...disabledCuts,pkg.id]);');
s=s.replace('Esta caja es de cartón recortable: mostrar zona libre','Aplicar recorte sugerido para cotizar');
s=s.replace('Las tarifas y dimensiones actuales no cambian.','La cotización usa la altura recortada mientras esta opción esté activada.');
s=s.replace('number(plan.metrics.volumetricWeight)','number(effectivePlan.metrics.volumetricWeight)');
fs.writeFileSync(viewer,s);
