import json,re,collections,math
from pathlib import Path
p=Path(__file__).parent
a=json.loads((p/'audit.json').read_text(encoding='utf8'))
def positive(v):
    try:
        n=float(v)
        return n if math.isfinite(n) and n>0 else None
    except (ValueError,TypeError):return None
records=[]
for r in a['rows']:
    sku=r['sku']; desc=r['Descripcion']; issues=[]
    boxcount=positive(r.get('Total Rollos x Caja',r.get('Total Piezas x Caja')))
    boxweight=positive(r.get('Peso Real x Caja'))
    measured=positive(r.get('Peso Real x Rollo',r.get('Peso Real x Pieza')))
    calculated=positive(r.get('Calculo Peso x Rollo',r.get('Calculo Peso x Pieza')))
    dims=next((v for k,v in r.items() if k.startswith('Caja de Empaque')),None)
    match=re.search(r'(\d+)K(\d*)$',sku)
    bysku=float(match[1]+'.'+(match[2] or '0')) if match else None
    m=re.search(r'\bR\s*(\d+(?:\.\d+)?)\s*K\b',desc,re.I)
    bydesc=float(m[1]) if m else None
    if not bydesc:
        m=re.search(r'\b(\d+(?:\.\d+)?)\s*K\b',desc,re.I)
        bydesc=float(m[1]) if m else None
    millares=positive(r.get('Total Millares x Caja'))
    byratio=millares/boxcount if millares and boxcount else None
    candidates=[x for x in [bysku,bydesc,byratio] if x is not None and x>0]
    capacity=candidates[0] if candidates and max(candidates)-min(candidates)<1e-7 else None
    if candidates and capacity is None:issues.append('CONFLICTO_CAPACIDAD')
    if sku in a['duplicates']:issues.append('VARIANTES_MISMO_SKU')
    if 'CONFIRMAR' in str(r.get('Observaciones','')).upper():issues.append('CONFIRMAR_ORIGEN')
    if measured and calculated and abs(measured-calculated)/measured>0.1:issues.append('DIFERENCIA_PESO_MAYOR_10_PCT')
    if r['sheet']=='Equipos':
        physical='EQUIPO_EN_EMPAQUE'; weight=boxweight; weight_source='BRUTO_CAJA_INDIVIDUAL';status='VALIDAR_UNIDAD_ODOO_Y_CAJA_INDIVIDUAL'
    else:
        physical='ROLLO' if r['sheet']!='Otros' else 'PENDIENTE'
        weight=measured or calculated;weight_source='MEDIDO_DECLARADO' if measured else ('CALCULADO_CON_TARA_SUPUESTA' if calculated else 'FALTANTE')
        status='FALTAN_DIMENSIONES_INDIVIDUALES'
        if not weight:issues.append('FALTA_PESO')
    if not capacity and r['sheet'].startswith('Etiquetas'):issues.append('CAPACIDAD_NO_RESUELTA')
    records.append(dict(sheet=r['sheet'],row=r['row'],sku=sku,description=desc,physical_unit=physical,
        thousands_per_roll_candidate=capacity,capacity_sku=bysku,capacity_description=bydesc,capacity_box_ratio=byratio,
        units_per_box=boxcount,box_dimensions_width_length_height_cm=dims,box_gross_weight_kg=boxweight,
        individual_weight_candidate_kg=weight,weight_source=weight_source,
        individual_dimensions_cm=None,status=status,issues=issues,notes=r.get('Observaciones'),source=r))
(p/'normalized.json').write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf8')
for sheet in a['sheets']:
    rows=[r for r in records if r['sheet']==sheet['sheet']]
    print(sheet['sheet'],json.dumps(dict(rows=len(rows),weight_measured=sum(r['weight_source']=='MEDIDO_DECLARADO' for r in rows),weight_calculated=sum(r['weight_source']=='CALCULADO_CON_TARA_SUPUESTA' for r in rows),weight_missing=sum(r['individual_weight_candidate_kg'] is None for r in rows),capacity=sum(r['thousands_per_roll_candidate'] is not None for r in rows),box_dimensions=sum(r['box_dimensions_width_length_height_cm'] is not None for r in rows),issues=dict(collections.Counter(i for r in rows for i in r['issues'])))))
print('CAPACITY_CONFLICTS',json.dumps([{k:r[k] for k in ['sheet','row','sku','description','capacity_sku','capacity_description','capacity_box_ratio']} for r in records if 'CONFLICTO_CAPACIDAD' in r['issues']],ensure_ascii=True))
print('LABEL_UNRESOLVED',json.dumps([{k:r[k] for k in ['sku','description']} for r in records if r['sheet'].startswith('Etiquetas') and r['thousands_per_roll_candidate'] is None],ensure_ascii=True))
