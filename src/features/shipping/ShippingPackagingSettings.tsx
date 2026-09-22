import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Box, Pencil, Plus, Save, Trash2 } from 'lucide-react';
import type { ShippingPackageType } from '../../lib/types';
import { deleteShippingPackageType, saveShippingPackageType, type ShippingPackageTypeDraft } from './shippingQuotesService';
import { PackingModal, PackingNumber } from './ShippingPackingWorkspace';
import { fmtPacking } from './packingPreview';

function newDraft(): ShippingPackageTypeDraft {
  return { name:'',internal_code:'',description:null,length:null,width:null,height:null,
    internal_length:null,internal_width:null,internal_height:null,external_length:null,external_width:null,external_height:null,
    empty_weight:0,max_weight:null,max_fill_percent:90,box_cost:0,dimension_unit:'CM',weight_unit:'KG',
    sort_order:100,is_active:true,fedex_packaging_type:'YOUR_PACKAGING' };
}
export function ShippingPackagingSettings({packageTypes}: {packageTypes:ShippingPackageType[]}) {
  const [draft,setDraft]=useState<ShippingPackageTypeDraft|null>(null);
  const [removing,setRemoving]=useState<ShippingPackageType|null>(null);
  const [search,setSearch]=useState('');
  const client=useQueryClient();
  const save=useMutation({mutationFn:saveShippingPackageType,onSuccess:()=>{setDraft(null);void client.invalidateQueries({queryKey:['shipping-quotes-bootstrap']});}});
  const remove=useMutation({mutationFn:deleteShippingPackageType,onSuccess:()=>{setRemoving(null);void client.invalidateQueries({queryKey:['shipping-quotes-bootstrap']});}});
  const filtered=packageTypes.filter(t=>`${t.name} ${t.internal_code}`.toLocaleLowerCase('es-MX').includes(search.toLocaleLowerCase('es-MX')));
  function update(p:Partial<ShippingPackageTypeDraft>){setDraft(d=>d?{...d,...p}:d);}
  return <article className="panel shipping-packaging-settings">
    <div className="panel-header"><div><h2>Embalajes</h2><p>Medidas internas para acomodar los productos. Medidas externas y peso bruto para FedEx.</p></div><Box size={24}/></div>
    <div className="shipping-packing-toolbar"><input aria-label="Buscar embalaje" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar nombre o código"/><button type="button" onClick={()=>{save.reset();setDraft(newDraft());}}><Plus size={16}/>Nuevo embalaje</button></div>
    <div className="table-wrap"><table className="records-table shipping-packing-catalog"><thead><tr><th>Embalaje</th><th>Medidas internas / externas</th><th>Peso vacío / máximo</th><th>Ocupación</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>
      {filtered.map(t=><tr key={t.id}><td>{t.name}<small>{t.internal_code}</small></td><td>{t.internal_length??t.length} × {t.internal_width??t.width} × {t.internal_height??t.height}<small>{t.external_length??t.length} × {t.external_width??t.width} × {t.external_height??t.height} {t.dimension_unit.toLowerCase()}</small></td>
        <td>{fmtPacking(Number(t.empty_weight))} / {fmtPacking(Number(t.max_weight))} {t.weight_unit.toLowerCase()}</td><td>{t.max_fill_percent??100} %</td><td>{t.is_active?'Activo':'Inactivo'}</td><td><div className="shipping-packing-actions"><button type="button" className="table-action" onClick={()=>{save.reset();setDraft({...newDraft(),...t});}}><Pencil size={14}/>Editar</button><button type="button" className="table-action" aria-label={`Eliminar ${t.name}`} onClick={()=>{remove.reset();setRemoving(t);}}><Trash2 size={14}/></button></div></td></tr>)}
    </tbody></table></div>
    {!filtered.length?<p>No hay embalajes que coincidan. Agrega uno con las medidas reales de tus cajas.</p>:null}
    {draft?<PackingModal title={draft.id?'Editar embalaje':'Nuevo embalaje'} onClose={()=>{if(!save.isPending)setDraft(null);}}>
      <form onSubmit={e=>{e.preventDefault();save.mutate({...draft,length:draft.internal_length,width:draft.internal_width,height:draft.internal_height});}}>
        <div className="shipping-packing-fields"><label className="field"><span>Nombre</span><input required value={draft.name} onChange={e=>update({name:e.target.value})}/></label><label className="field"><span>Código interno</span><input required value={draft.internal_code} onChange={e=>update({internal_code:e.target.value})}/></label>
          <label className="field"><span>Unidad de medidas</span><select value={draft.dimension_unit} onChange={e=>update({dimension_unit:e.target.value as 'CM'|'IN'})}><option value="CM">Centímetros</option><option value="IN">Pulgadas</option></select></label>
          <label className="field"><span>Unidad de peso</span><select value={draft.weight_unit} onChange={e=>update({weight_unit:e.target.value as 'KG'|'LB'})}><option value="KG">Kilogramos</option><option value="LB">Libras</option></select></label></div>
        <h4>Dimensiones internas · espacio útil</h4><div className="shipping-packing-fields">{(['length','width','height'] as const).map((k,i)=><PackingNumber key={k} label={['Largo','Ancho','Alto'][i]} value={draft[`internal_${k}`]} min={0.01} onChange={v=>update({[`internal_${k}`]:v})}/>)}</div>
        <h4>Dimensiones externas · cotización FedEx</h4><div className="shipping-packing-fields">{(['length','width','height'] as const).map((k,i)=><PackingNumber key={k} label={['Largo','Ancho','Alto'][i]} value={draft[`external_${k}`]} min={draft[`internal_${k}`]??0.01} onChange={v=>update({[`external_${k}`]:v})}/>)}</div>
        <div className="shipping-packing-fields"><PackingNumber label="Peso del embalaje vacío" value={draft.empty_weight} onChange={v=>update({empty_weight:v})}/><PackingNumber label="Peso bruto máximo" value={draft.max_weight} min={0.001} onChange={v=>update({max_weight:v})}/><label className="field"><span>Ocupación máxima (%)</span><input required type="number" min="1" max="100" step="any" value={draft.max_fill_percent??90} onChange={e=>update({max_fill_percent:Number(e.target.value)})}/></label><PackingNumber label="Costo del embalaje (MXN, opcional)" value={draft.box_cost} onChange={v=>update({box_cost:v})} required={false}/><PackingNumber label="Prioridad (menor primero)" value={draft.sort_order} onChange={v=>update({sort_order:v??100})}/><label className="field"><span>Observaciones</span><input value={draft.description??''} onChange={e=>update({description:e.target.value})}/></label></div>
        <label className="shipping-packing-checks"><input type="checkbox" checked={draft.is_active} onChange={e=>update({is_active:e.target.checked})}/>Embalaje activo</label>
        {save.error?<p className="form-error">{save.error.message}</p>:null}<div className="shipping-packing-actions"><button type="submit" disabled={save.isPending}><Save size={16}/>{save.isPending?'Guardando...':'Guardar embalaje'}</button></div>
      </form>
    </PackingModal>:null}
    {removing?<PackingModal title="Eliminar embalaje" onClose={()=>{if(!remove.isPending)setRemoving(null);}}><p>¿Eliminar {removing.name}? Dejará de estar disponible para nuevos planes. Las cotizaciones guardadas conservarán su información.</p>{remove.error?<p className="form-error">{remove.error.message}</p>:null}<div className="shipping-packing-actions"><button type="button" disabled={remove.isPending} onClick={()=>remove.mutate(removing.id)}>{remove.isPending?'Eliminando...':'Confirmar eliminación'}</button></div></PackingModal>:null}
  </article>;
}
