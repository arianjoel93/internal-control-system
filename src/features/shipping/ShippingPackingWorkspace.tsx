import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Box, Pencil, Plus, Save, Trash2 } from 'lucide-react';
import { createPortal } from 'react-dom';
import type { ShippingPackageType } from '../../lib/types';
import { normalizePackingLines, type PackingAssignment, type PackingLine, type PackingPlan, type PackingStrategy } from '../../../supabase/functions/_shared/shipping-packing';
import { saveShippingProductDimension, type ShippingOrderLine, type ShippingPhysicalRules } from './shippingQuotesService';
import './shippingPacking.css';

import { packingStrategyLabels, fmtPacking } from './packingPreview';

export function PackingModal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return createPortal(<div className="shipping-packing-modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="shipping-packing-modal" role="dialog" aria-modal="true" aria-label={title} onKeyDown={e => { if (e.key === 'Escape') onClose(); }}>
      <div className="shipping-packing-toolbar"><h3>{title}</h3><button type="button" className="secondary-button" aria-label="Cerrar" onClick={onClose}>Cerrar</button></div>
      {children}
    </div>
  </div>, document.body);
}

export function PackingNumber({ label, value, onChange, min = 0, required = true }: { label: string; value: number | null; onChange: (value: number | null) => void; min?: number; required?: boolean }) {
  return <label className="field"><span>{label}</span><input type="number" step="any" min={min} required={required} value={value ?? ''} onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))} /></label>;
}

export function PhysicalRulesFields({ value, onChange }: { value: ShippingPhysicalRules; onChange: (patch: ShippingPhysicalRules) => void }) {
  return <div className="shipping-physical-rules">
    <div className="shipping-packing-checks">
      {([
        ['can_rotate', 'Permite rotación', true], ['stackable', 'Apilable', true], ['fragile', 'Frágil', false],
        ['requires_individual_package', 'Paquete individual', false], ['can_combine', 'Puede combinarse', true],
      ] as const).map(([key,label,fallback]) => <label key={key}><input type="checkbox" checked={value[key] ?? fallback} onChange={e => onChange({ [key]: e.target.checked })} />{label}</label>)}
    </div>
    <div className="shipping-packing-fields">
      <label className="field"><span>Grupo compatible (opcional)</span><input value={value.packaging_group ?? ''} onChange={e => onChange({ packaging_group: e.target.value || null })} placeholder="Ej. consumibles" /></label>
      <PackingNumber label="Protección por lado (cm)" value={value.protection_margin_cm ?? 0} onChange={v => onChange({ protection_margin_cm: v ?? 0 })} />
      <label className="field"><span>Observaciones</span><input value={value.notes ?? ''} onChange={e => onChange({ notes: e.target.value })} /></label>
    </div>
  </div>;
}

export function ShippingProductInputs({ lines, isAdmin, onChange }: { lines: ShippingOrderLine[]; isAdmin: boolean; onChange: (line: ShippingOrderLine) => void }) {
  const [editing, setEditing] = useState<ShippingOrderLine | null>(null);
  const [permanent, setPermanent] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const client = useQueryClient();
  const save = useMutation({ mutationFn: saveShippingProductDimension, onSuccess: ({ product }) => {
    if (editing) onChange({ ...editing, physicalProductId: product.id });
    setEditing(null); void client.invalidateQueries({ queryKey: ['shipping-product-dimensions'] });
  } });
  const visible = lines.filter(l => `${l.productName} ${l.sku ?? ''}`.toLocaleLowerCase('es-MX').includes(search.toLocaleLowerCase('es-MX')));
  const safePage = Math.min(page, Math.max(0,Math.ceil(visible.length/8)-1));
  return <section className="shipping-packing-products">
    <div className="shipping-packing-toolbar"><h3>Productos de la orden</h3><span>{lines.length} líneas</span></div>
    {lines.length > 8 ? <input aria-label="Buscar producto" placeholder="Buscar producto o referencia" value={search} onChange={e => { setSearch(e.target.value);setPage(0); }} /> : null}
    <div className="shipping-packing-product-list">
      {visible.slice(safePage*8,safePage*8+8).map(line => {
        const missing = normalizePackingLines([line]).missingLines.length > 0;
        return <div key={line.lineId} className="shipping-packing-product">
          <div><span>{line.productName}</span><small>{line.sku || 'Sin referencia'} · {line.quantity} unidades</small>
            <small className={missing ? 'form-error' : ''}>{missing ? 'Datos físicos incompletos' : `${line.lengthCm} × ${line.widthCm} × ${line.heightCm} cm · ${line.weightKg} kg por unidad`}</small></div>
          <button type="button" className="secondary-button" onClick={() => {save.reset();setEditing({...line});setPermanent(false);}}><Pencil size={14} />{missing ? 'Completar' : 'Editar'}</button>
        </div>;
      })}
    </div>
    {visible.length>8?<div className="shipping-packing-toolbar"><button type="button" disabled={!safePage} onClick={()=>setPage(safePage-1)}>Anterior</button><span>{safePage+1} / {Math.ceil(visible.length/8)}</span><button type="button" disabled={(safePage+1)*8>=visible.length} onClick={()=>setPage(safePage+1)}>Siguiente</button></div>:null}
    {editing ? <PackingModal title="Datos físicos del producto" onClose={() => { if(!save.isPending)setEditing(null); }}>
      <form onSubmit={e => {
        e.preventDefault();
        if(normalizePackingLines([editing]).missingLines.length)return;
        if(permanent) save.mutate({ id: editing.physicalProductId ?? undefined, sku: editing.sku!, product_name: editing.productName,
          length_cm: editing.lengthCm!,width_cm:editing.widthCm!,height_cm:editing.heightCm!,unit_weight_kg:editing.weightKg,
          can_rotate:editing.canRotate,stackable:editing.canStack,fragile:editing.fragile,requires_individual_package:editing.shipAlone,
          can_combine:editing.canCombine,packaging_group:editing.packingGroup,protection_margin_cm:editing.protectionMarginCm });
        else {onChange(editing);setEditing(null);}
      }}>
        <p>{editing.productName} · {editing.sku ?? 'Sin referencia'}</p>
        <div className="shipping-packing-fields">
          <PackingNumber label="Largo (cm)" min={0.001} value={editing.lengthCm} onChange={v=>setEditing({...editing,lengthCm:v})} />
          <PackingNumber label="Ancho (cm)" min={0.001} value={editing.widthCm} onChange={v=>setEditing({...editing,widthCm:v})} />
          <PackingNumber label="Alto (cm)" min={0.001} value={editing.heightCm} onChange={v=>setEditing({...editing,heightCm:v})} />
          <PackingNumber label="Peso físico por unidad (kg)" value={editing.weightKg} onChange={v=>setEditing({...editing,weightKg:v})} />
        </div>
        <PhysicalRulesFields value={{can_rotate:editing.canRotate,stackable:editing.canStack,fragile:editing.fragile,requires_individual_package:editing.shipAlone,
          can_combine:editing.canCombine,packaging_group:editing.packingGroup,protection_margin_cm:editing.protectionMarginCm}}
          onChange={p=>setEditing({...editing,canRotate:p.can_rotate??editing.canRotate,canStack:p.stackable??editing.canStack,fragile:p.fragile??editing.fragile,
            shipAlone:p.requires_individual_package??editing.shipAlone,canCombine:p.can_combine??editing.canCombine,
            packingGroup:p.packaging_group!==undefined?p.packaging_group:editing.packingGroup,protectionMarginCm:p.protection_margin_cm??editing.protectionMarginCm})} />
        {isAdmin && editing.sku ? <label className="shipping-packing-checks"><input type="checkbox" checked={permanent} onChange={e=>setPermanent(e.target.checked)} />Guardar también en la base de productos de Supabase</label>:null}
        <p className="shipping-quotes-muted">Los cambios temporales se usan en esta cotización. El peso debe ser físico, sin sustituirlo por el peso volumétrico.</p>
        {save.error?<p className="form-error">{save.error.message}</p>:null}
        <div className="shipping-packing-actions"><button disabled={save.isPending} type="submit"><Save size={16}/>{save.isPending?'Guardando...':'Aplicar datos'}</button></div>
      </form>
    </PackingModal>:null}
  </section>;
}

export function ShippingPackingWorkspace({plan,lines,assignments,packageTypes,strategy,onStrategy,onAssignments,onRecalculate}: {
  plan:PackingPlan; lines:PackingLine[]; assignments:PackingAssignment[]; packageTypes:ShippingPackageType[]; strategy:PackingStrategy;
  onStrategy:(s:PackingStrategy)=>void; onAssignments:(a:PackingAssignment[])=>void; onRecalculate:()=>void;
}) {
  const [newBox,setNewBox]=useState('');
  const [ownUnit,setOwnUnit]=useState<string|null>(null);
  const [page,setPage]=useState(0);
  const units=normalizePackingLines(lines).units;
  const unitMap=new Map(units.map(u=>[u.id,u]));
  const active=packageTypes.filter(t=>t.is_active);
  const nextId=()=>`manual-${crypto.randomUUID()}`;
  const safePage=Math.min(page,Math.max(0,Math.ceil(assignments.length/5)-1));
  function move(unitId:string,target:string){
    const next=assignments.map(a=>({...a,unitIds:a.unitIds.filter(id=>id!==unitId)}));
    let prioritizedId=target;
    const dest=next.find(a=>a.id===target);if(dest)dest.unitIds.push(unitId);
    else if(target.startsWith('new:')){const created={id:nextId(),packagingTypeId:target.slice(4),unitIds:[unitId]};next.unshift(created);prioritizedId=created.id;}
    const prioritized=next.find(a=>a.id===prioritizedId);
    onAssignments((prioritized?[prioritized,...next.filter(a=>a.id!==prioritizedId)]:next).filter(a=>a.unitIds.length));
  }
  function moveSelect(unitId:string,current=''){
    return <select aria-label={`Mover ${unitMap.get(unitId)?.productName ?? 'artículo'}`} value="" onChange={e=>{if(e.target.value==='own')setOwnUnit(unitId);else if(e.target.value)move(unitId,e.target.value);}}>
      <option value="">Mover a…</option>{assignments.filter(a=>a.id!==current&&a.packagingTypeId).map((a,i)=><option key={a.id} value={a.id}>Caja {i+1} · {packageTypes.find(t=>t.id===a.packagingTypeId)?.name}</option>)}
      {active.map(t=><option key={t.id} value={`new:${t.id}`}>Nueva caja · {t.name}</option>)}<option value="own">Separar: dimensiones propias</option>
    </select>;
  }
  return <section className="shipping-packing-workspace">
    <div className="shipping-packing-toolbar"><div><h3>Distribución propuesta del envío</h3><p>Valida el contenido de cada caja antes de cotizar.</p></div><Box size={24}/></div>
    <div className="shipping-packing-toolbar">
      <label className="field"><span>Estrategia</span><select value={strategy} onChange={e=>onStrategy(e.target.value as PackingStrategy)}>{Object.entries(packingStrategyLabels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
      <button type="button" className="secondary-button" onClick={onRecalculate}>Volver a optimizar</button>
    </div>
    <div className="shipping-packing-metrics"><span>{plan.metrics.articleCount} artículos</span><span>{plan.metrics.packageCount} paquetes</span><span>{fmtPacking(plan.metrics.grossWeight)} kg brutos</span><span>{fmtPacking(plan.metrics.averageUtilization)} % ocupación</span><span>{plan.metrics.unpackedCount} pendientes</span></div>
    <div className="shipping-packing-actions"><select aria-label="Tipo de caja nueva" value={newBox} onChange={e=>setNewBox(e.target.value)}><option value="">Elegir embalaje</option>{active.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select><button type="button" className="secondary-button" disabled={!newBox} onClick={()=>{onAssignments([...assignments,{id:nextId(),packagingTypeId:newBox,unitIds:[]}]);setPage(Math.floor(assignments.length/5));}}><Plus size={16}/>Crear caja</button></div>
    {!active.length?<p className="form-error">Configura al menos un embalaje activo en Configuración → Embalajes.</p>:null}
    {assignments.slice(safePage*5,safePage*5+5).map((a,index)=>{
      const p=plan.packages.find(p=>p.id===a.id);
      const packageErrors=p?.errors ?? [];
      const invalidPackage=p?.status === 'INVALID_PACKING' || packageErrors.length > 0;
      const displayedUnitIds=p?.items.map(item=>item.unit.id) ?? a.unitIds;
      return <article className={`shipping-packed-box${invalidPackage ? ' is-invalid' : ''}`} key={a.id}>
        <div className="shipping-packing-toolbar"><h4>Caja {safePage*5+index+1} · {p?.packagingName ?? 'Pendiente'}</h4><button type="button" className="secondary-button" aria-label="Eliminar caja y dejar sus artículos pendientes" onClick={()=>onAssignments(assignments.filter(x=>x.id!==a.id))}><Trash2 size={15}/></button></div>
        <label className="field"><span>Tipo de embalaje</span><select value={a.packagingTypeId??''} disabled={!a.packagingTypeId} onChange={e=>{const selected={...a,packagingTypeId:e.target.value};onAssignments([selected,...assignments.filter(x=>x.id!==a.id)]);setPage(0);}}><option value="">Dimensiones propias</option>{active.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        {invalidPackage ? <div className="shipping-packing-box-error" role="alert">
          <strong>Embalaje no recomendado</strong>
          <span>{packageErrors.join(' ') || 'La distribución actual no es válida para este embalaje. Selecciona otro o ajusta los artículos.'}</span>
        </div> : null}
        {p?<><p className="shipping-packed-box-size">{fmtPacking(p.externalDimensions.length)} × {fmtPacking(p.externalDimensions.width)} × {fmtPacking(p.externalDimensions.height)} cm externos · {fmtPacking(p.totalWeight)} kg</p><small>Contenido {fmtPacking(p.productsWeight)} kg + caja {fmtPacking(p.packagingWeight)} kg</small><progress max={100} value={p.utilizationPercentage} aria-label="Ocupación actual de la caja"/><small>{fmtPacking(p.utilizationPercentage)} % de ocupación · {displayedUnitIds.length} unidades actuales</small></>:null}
        <details><summary>Contenido: {displayedUnitIds.length} unidades · editar distribución</summary><div className="shipping-packed-items">{displayedUnitIds.map(id=><div key={id}><span>{unitMap.get(id)?.productName} <small>unidad {unitMap.get(id)?.unitIndex}</small></span>{moveSelect(id,a.id)}</div>)}</div></details>
        {p?<details><summary>Por qué se eligió esta distribución</summary><p>{p.explanation}</p>{p.warnings.map(w=><p key={w}>{w}</p>)}</details>:null}
      </article>;
    })}
    {assignments.length>5?<div className="shipping-packing-toolbar"><button type="button" disabled={!safePage} onClick={()=>setPage(safePage-1)}>Anterior</button><span>{safePage+1} / {Math.ceil(assignments.length/5)}</span><button type="button" disabled={(safePage+1)*5>=assignments.length} onClick={()=>setPage(safePage+1)}>Siguiente</button></div>:null}
    {plan.unpackedItems.length?<details open className="shipping-packing-pending"><summary>Artículos pendientes ({plan.unpackedItems.length})</summary>{plan.unpackedItems.slice(0,50).map(({unit,reason})=><div className="shipping-packing-product" key={unit.id}><div>{unit.productName}<small>{reason}</small></div>{moveSelect(unit.id)}</div>)}{plan.unpackedItems.length>50?<p>Se muestran los primeros 50. Asigna estos artículos para continuar con los siguientes.</p>:null}</details>:null}
    {[...plan.errors,...plan.missingLines.map(l=>`${l.name}: ${l.reason}`)].map((e,i)=><p className="form-error" key={`${i}:${e}`}>{e}</p>)}
    {ownUnit?<PackingModal title="Confirmar paquete individual" onClose={()=>setOwnUnit(null)}><p>Confirma que {unitMap.get(ownUnit)?.productName} puede enviarse con sus dimensiones propias y sin caja adicional. Se mantendrá como una sola unidad.</p><div className="shipping-packing-actions"><button type="button" onClick={()=>{const remaining=assignments.map(a=>({...a,unitIds:a.unitIds.filter(id=>id!==ownUnit)})).filter(a=>a.unitIds.length);onAssignments([{id:nextId(),packagingTypeId:null,ownPackageConfirmed:true,unitIds:[ownUnit]},...remaining]);setOwnUnit(null);}}>Confirmar paquete individual</button></div></PackingModal>:null}
  </section>;
}
