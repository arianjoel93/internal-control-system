import json
from pathlib import Path
p=Path(__file__).parent
a=json.loads((p/'audit.json').read_text(encoding='utf8'))
rows=json.loads((p/'normalized.json').read_text(encoding='utf8'))
meaning={
'Producto':'Clave de cruce exacta con default_code de Odoo. Preservar ceros iniciales y variantes.',
'Descripcion':'Referencia comercial. Contiene capacidad o presentación en algunos casos; proviene de fórmulas con datos externos guardados en el XLSX.',
'Rollos por Tubo':'Jerarquía de empaque. No son dimensiones del rollo; confirmar significado físico de tubo.',
'Cantidad de Tubos x  Caja':'Cantidad de agrupaciones por caja.', 'Cantidad de Tubos':'Cantidad de agrupaciones por caja.',
'Total Rollos x Caja':'Contenido de la caja; normalmente calculado. No confundir con cantidad vendida en Odoo.',
'Total Millares x Caja':'Total comercial por caja; dividido entre rollos permite revisar capacidad. Es fórmula basada en descripción, no medición independiente.',
'Caja de Empaque (ancho x largo x alto cm)':'Medidas de la caja exterior. Separar ancho, largo, alto en este orden; no asignar al rollo.',
'Caja de Empaque':'Medidas del empaque; sin valores en Otros.',
'Peso Real x Caja':'Peso bruto declarado de la presentación. Confirmar kg. Incluye empaque.',
'Medida':'Tamaño de la etiqueta derivado del SKU, no tamaño exterior del rollo. Confirmar mm.',
'Material':'Clasificación del material; no deducir peso ni diámetro sin especificaciones.',
'Centro':'Núcleo del rollo, no diámetro exterior. Valores mezclan números y texto; confirmar unidad.',
'Sin Registro x Caja':'Indicador auxiliar; no prueba que falten datos ni que estén completos. Validar los campos reales.',
'Calculo Peso x Rollo':'Peso estimado: (bruto - 0.4 kg)/rollos. Tara supuesta; no es peso medido.',
'Calculo Peso x Pieza':'Peso estimado con tara de 0.10, 0.15 o 0.25 kg según peso volumétrico de caja; es una heurística.',
'Calculo Peso Volumetrico Caja':'Volumen exterior /5000. Nunca usar como peso físico individual.',
'Valor mas alto':'Comparación del peso físico y volumétrico de la caja.',
'Redondeo para Paqueteria':'Estimación redondeada de peso facturable; no es peso físico del producto.',
'Peso Real x Rollo':'Peso individual declarado directamente. Preferente tras verificar fecha, fuente, precisión y presentación.',
'Peso Real x Pieza':'Peso individual declarado directamente; no es dimensión física.',
'Observaciones':'Conservar proveedor, variante, reempacado y CONFIRMAR; afectan selección del perfil.',
'Auxiliar 1':'Auxiliar de fórmula para interpretar prefijo del SKU; no es dato logístico.',
'Auxiliar 2':'Auxiliar de fórmula para interpretar prefijo del SKU; no es dato logístico.',
'Tipo':'Familia comercial; ayuda a decidir si se vende por pieza, rollo, caja o millar.',
'Marca':'Marca comercial. No determina automáticamente la unidad de venta.',
'Total Piezas x Caja':'Contenido de caja de ribbons; no acredita por sí solo la UDM de venta en Odoo.'}
def cell(v):return str(v if v is not None else 'Pendiente').replace('|','\\|').replace('\n',' ')
def table(head,rs):return '\n'.join(['| '+' | '.join(head)+' |','| '+' | '.join(['---']*len(head))+' |']+['| '+' | '.join(cell(v) for v in r)+' |' for r in rs])
parts=['Fecha: <date start="2026-11-11" />. Estado: análisis y propuesta; sin altas ni modificaciones de productos en producción.',
'Proyecto: <mention url="https://app.notion.com/p/3e5125790739815fa40aef69bcb8f681">Corporación Tectronic</mention>. Fuente: [TEC-ALM-Empaque Medidas y Peso.xlsx](https://chatgpt.com/library?file_id=libfile_c70be91f120c8191a594c39d59707c60&account_id=personal).',
'## Resultado',
'Se revisaron seis hojas, 571 filas con código y 553 SKU distintos. Hay 18 SKU repetidos con dos registros cada uno. Las filas de fórmulas y casillas sin código no se contaron como productos. No se detectaron errores Excel guardados #REF!, #VALUE!, #DIV/0! o #N/A en las filas de producto. Se analizaron valores guardados y fórmulas: no se actualizaron vínculos externos.',
'No hay una terna explícita de dimensiones individuales de rollos/ribbons. Las medidas del empaque y las de la etiqueta no son las del rollo. Los 72 equipos tienen peso y caja: son candidatos a cargar como equipo embalado, tras confirmar una pieza por empaque y unidad Odoo.',
'## Lógica propuesta, aún por validar',
'Separar cantidad comercial Odoo, unidad física manipulable y presentación de transporte. Conservar cantidad, unidad y precio comerciales sin alterarlos. Calcular physicalQuantity para el motor de empaque y guardar el factor aplicado en el historial.',
'Para millares: rollos = cantidadOdoo / millaresPorRollo. Para etiquetas individuales: rollos = cantidadOdoo / etiquetasPorRollo. Para rollos/piezas: conversión 1:1 solamente con UDM confirmada. Para cajas cerradas: preservar dimensiones y bruto de la caja; multiplicar por su contenido únicamente si se decide abrir y reempacar. Para metros: metrosVendidos/metrosPorRollo con capacidad específica.',
'Si salen rollos fraccionarios, marcar pendiente para confirmar rebobinado o venta parcial. No redondear silenciosamente. Usar tolerancia de decimales para evitar falsos errores de coma flotante.',
'Capacidad: configuración explícita validada > lectura contextual del SKU contrastada con descripción. El cociente millaresCaja/rollosCaja es control, pero procede de una fórmula basada en la descripción. SKU 2K5 significa 2.5 millares solo en familias de etiquetas compatibles. N250 y M750 requieren contexto y descripción; códigos sin capacidad pueden resolverse por descripción con revisión. 0K0 no es divisor cero: hay continuos. No interpretar CSC10M como diez millares; su descripción dice caja de 250 rollos.',
'Peso: preferir medición individual validada. Conservar como estimación (bruto - tara)/contenido cuando solo existe caja. La tara de 0.4 kg no está medida por presentación. Ribbon usa 0.10/0.15/0.25 kg según volumen. Para equipo en su empaque conservar bruto sin descontar tara ni duplicar una caja adicional.',
'Dimensiones: registrar diámetro exterior y ancho axial para rollos medidos. Una envolvente rectangular puede ser diámetro × diámetro × ancho axial con orientación libre. Ancho de etiqueta y centro no alcanzan para conocer diámetro o ancho axial exacto. No dividir dimensiones de caja ni deducir dimensiones a partir de peso volumétrico.',
'## Ejemplo verificado',
'Etiquetas de Linea, fila 51: 051025TD011P0000C1P2K5. 36 rollos/caja, 90 millares/caja, caja ancho 38 × largo 38 × alto 22 cm y bruto 18 kg. Capacidad 2.5 millares/rollo. Peso calculado (18-0.4)/36 = 0.488888889 kg por rollo. Dimensiones individuales pendientes. 5 millares → 2 rollos; 90 millares → 36 rollos; 1 millar → 0.4 rollo, requiere decisión operativa.',
'## Hallazgos por resolver',
'040031TT011P0000C3G10K: SKU sugiere 10K y descripción R10.5K. Conflicto: no convertir hasta validar. 30GT-BPO: peso individual declarado 0.08 kg frente a calculado 0.09 kg; además Sin Registro x Caja está activado aunque existen datos de caja. 18 códigos tienen múltiples empaques/proveedores: conservar cada variante sin promediar ni usar el último registro como verdad.',
'Otros: 38 códigos sin peso o medidas. En Diseño y Especiales faltan pesos en cinco filas; en Ribbon faltan en 19. Los nombres Peso Real no acreditan medición trazable: validar unidad y fuente.',
'## Implementación y carga',
'El código actual entrega product_uom_qty directamente como quantity al motor físico; falta una conversión comercial previa. El catálogo actual exige dimensiones completas para guardar producto, por lo que no admite correctamente todos estos registros parciales. Proponer perfiles de producto con estado parcial/verificado y presentaciones por proveedor. No sobreescribir cantidad/precio comercial, porque también alimentan la distribución de costo de envío.',
'Orden: preparar candidatos con fuente hoja/fila; cruzar SKU y UDM con Odoo en lectura; resolver conflictos; aprobar factor y peso por presentación; medir dimensiones faltantes; cargar cambios verificables de forma idempotente; comparar antes/después y verificar cada escritura. Iniciar piloto con el SKU 2K5, un equipo y un térmico vendido por caja. Ningún producto ha sido cargado a producción por este análisis.',
'## Inventario de hojas',
table(['Hoja','Filas con SKU','SKU distintos'],[(s['sheet'],s['rows'],s['unique_skus']) for s in a['sheets']])]
for s in a['sheets']:
    parts += ['## '+s['sheet']+' — columna por columna',table(['Columna','Nombre','Con valor guardado','Uso e interpretación'],[(c['column'],c['name'],c['filled'],meaning.get(c['name'],'Auxiliar sin interpretación logística confirmada')) for c in s['columns']]),
    '### Registros producto por producto',
    'Capacidad en millares/rollo es candidata, no confirma UDM Odoo. Peso calculado no equivale a peso medido. Medidas listadas son de caja; las individuales permanecen pendientes, salvo posible perfil de equipo embalado. Cada fila original se conserva por separado.',
    table(['Fila','SKU','Descripción','Millares/rollo candidato','Contenido/caja','Caja ancho×largo×alto cm','Bruto caja kg','Peso unitario candidato kg','Origen peso','Alertas / observaciones'],[(r['row'],r['sku'],r['description'],r['thousands_per_roll_candidate'],r['units_per_box'],r['box_dimensions_width_length_height_cm'],r['box_gross_weight_kg'],round(r['individual_weight_candidate_kg'],6) if r['individual_weight_candidate_kg'] is not None else None,r['weight_source'],', '.join(r['issues'])+' '+str(r['notes'] or '')) for r in rows if r['sheet']==s['sheet']])]
(p/'analysis.md').write_text('\n\n'.join(parts),encoding='utf8')
print(json.dumps({'characters':len('\n\n'.join(parts)),'rows':len(rows)}))
