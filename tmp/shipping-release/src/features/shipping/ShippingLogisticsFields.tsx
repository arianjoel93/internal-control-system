import type { DataOrigin, LogisticsMetadata } from '../../../supabase/functions/_shared/shipping-catalog';

export function ShippingLogisticsFields({ value, onChange }: { value: LogisticsMetadata; onChange: (value: LogisticsMetadata) => void }) {
  const update = (patch: Partial<LogisticsMetadata>) => onChange({ ...value, ...patch });
  return <fieldset className="shipping-packing-fields">
    <legend>Origen de pesos y medidas</legend>
    {(['weight_origin', 'dimensions_origin'] as const).map(field => <label className="field" key={field}>
      <span>{field === 'weight_origin' ? 'Peso' : 'Medidas'}</span>
      <select value={value[field]} onChange={event => update({ [field]: event.target.value as DataOrigin })}>
        <option value="UNKNOWN">Sin verificar</option><option value="DECLARED">Declarado en documento</option><option value="ESTIMATED">Estimado</option><option value="MEASURED">Medido y verificado</option>
      </select>
    </label>)}
    <label className="field"><span>Método del peso</span><input required={value.weight_origin === 'ESTIMATED'} value={value.weight_method ?? ''} onChange={event => update({ weight_method: event.target.value || null })} placeholder="Ej. (bruto − tara) / rollos" /></label>
    <label className="field"><span>Método de las medidas</span><input required={value.dimensions_origin === 'ESTIMATED'} value={value.dimensions_method ?? ''} onChange={event => update({ dimensions_method: event.target.value || null })} placeholder="Medición o hipótesis de acomodo" /></label>
    <label className="field"><span>Unidad física de estos datos</span><select value={value.physical_unit} onChange={event => update({ physical_unit: event.target.value as LogisticsMetadata['physical_unit'] })}><option value="UNKNOWN">Pendiente</option><option value="ROLLO">Rollo</option><option value="CAJA">Caja cerrada</option><option value="PIEZA">Pieza / equipo</option></select></label>
    <label className="check-field"><input type="checkbox" checked={value.original_package === true} onChange={event => update({ original_package: event.target.checked })} />Enviar en empaque original, sin caja adicional</label>
    <label className="field"><span>Confianza</span><select value={value.confidence} onChange={event => update({ confidence: event.target.value as LogisticsMetadata['confidence'] })}><option value="LOW">Baja</option><option value="MEDIUM">Media</option><option value="HIGH">Alta</option></select></label>
    <label className="field"><span>Hoja de origen</span><input value={value.source_sheet ?? ''} onChange={event => update({ source_sheet: event.target.value || null })} /></label>
    <label className="field"><span>Observaciones del dato</span><input value={value.notes ?? ''} onChange={event => update({ notes: event.target.value || null })} /></label>
  </fieldset>;
}
