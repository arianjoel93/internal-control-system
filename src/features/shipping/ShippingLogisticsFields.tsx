import { supportsStandardPresentation, type DataOrigin, type LogisticsMetadata } from '../../../supabase/functions/_shared/shipping-catalog';

export function ShippingLogisticsFields({ value, onChange, sku, productName = '' }: { value: LogisticsMetadata; onChange: (value: LogisticsMetadata) => void; sku?: string | null; productName?: string }) {
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
    <label className="shipping-logistics-switch"><span><strong>Empaque original</strong><small>Enviar sin caja adicional</small></span><input role="switch" type="checkbox" checked={value.original_package === true} onChange={event => update({ original_package: event.target.checked })} /></label>
    <label className="field"><span>Confianza</span><select value={value.confidence} onChange={event => update({ confidence: event.target.value as LogisticsMetadata['confidence'] })}><option value="LOW">Baja</option><option value="MEDIUM">Media</option><option value="HIGH">Alta</option></select></label>
    <label className="field"><span>Hoja de origen</span><input value={value.source_sheet ?? ''} onChange={event => update({ source_sheet: event.target.value || null })} /></label>
    <label className="field"><span>Observaciones del dato</span><input value={value.notes ?? ''} onChange={event => update({ notes: event.target.value || null })} /></label>
    <label className="shipping-logistics-switch"><span><strong>Presentación por caja</strong><small>{supportsStandardPresentation(sku,productName,value.source_sheet??'')?'Rollos por caja · Etiquetas y tickets':'Disponible solo para etiquetas y tickets'}</small></span><input role="switch" type="checkbox" disabled={!supportsStandardPresentation(sku,productName,value.source_sheet??'')} checked={supportsStandardPresentation(sku,productName,value.source_sheet??'')&&!!value.standard_presentation} onChange={event => update({ standard_presentation: event.target.checked ? { units_per_box: 0, length_cm: 0, width_cm: 0, height_cm: 0, gross_weight_kg: 0, origin: 'UNKNOWN' } : null })} /></label>
    {value.standard_presentation && supportsStandardPresentation(sku,productName,value.source_sheet??'') ? <>
      <p>Captura la caja cerrada del proveedor. El peso bruto incluye su cartón. La capacidad por rollo del SKU no indica cuántos rollos trae una caja.</p>
      {([
        ['units_per_box', 'Rollos completos por caja'], ['length_cm', 'Largo exterior de la presentación (cm)'],
        ['width_cm', 'Ancho exterior de la presentación (cm)'], ['height_cm', 'Alto exterior de la presentación (cm)'],
        ['gross_weight_kg', 'Peso bruto de la presentación (kg)'],
      ] as const).map(([field, label]) => <label className="field" key={field}><span>{label}</span><input type="number" required min={field === 'units_per_box' ? 2 : 0.001} step={field === 'units_per_box' ? 1 : 'any'} value={value.standard_presentation![field] || ''} onChange={event => update({ standard_presentation: { ...value.standard_presentation!, [field]: Number(event.target.value) } })} /></label>)}
      <label className="field"><span>Origen de la presentación</span><select value={value.standard_presentation.origin} onChange={event => update({ standard_presentation: { ...value.standard_presentation!, origin: event.target.value as DataOrigin } })}><option value="UNKNOWN">Sin verificar</option><option value="DECLARED">Declarado por proveedor</option><option value="ESTIMATED">Estimado</option><option value="MEASURED">Medido</option></select></label>
    </> : null}
  </fieldset>;
}
