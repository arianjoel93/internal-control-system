"""Reporte gerencial reproducible desde una exportación MCP autorizada. Sin red."""
import argparse
import base64
from collections import defaultdict
from datetime import date, datetime
from decimal import Decimal
from html import escape
import json
from pathlib import Path
import statistics

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import font_manager
from matplotlib.ticker import FuncFormatter
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, PageBreak, KeepTogether


def number(v):
    n = Decimal(str(v))
    if not n.is_finite():
        raise ValueError('Importe no finito')
    return n


def group(rows, fields):
    output = {}
    for r in rows:
        key = tuple(r.get(f) for f in fields)
        x = output.setdefault(key, {'sales': Decimal(0), 'margin': Decimal(0), 'rows': 0, 'label': r.get('seller_name') or r.get('company_name') or str(key)})
        x['sales'] += number(r['untaxed_amount'])
        x['margin'] += number(r['margin_amount'])
        x['rows'] += 1
    for x in output.values():
        x['sales'], x['margin'] = float(x['sales']), float(x['margin'])
        x['rate'] = 100*x['margin']/x['sales'] if x['sales']>0 else None
    return output


def analyze(data):
    if data.get('source') != 'supabase' or data.get('complete') is not True or data.get('dataset_kind') != 'sales_aggregates':
        raise ValueError('Se requiere exportación MCP completa de agregados Supabase')
    if data.get('grain') != 'daily' or data.get('dimension') != 'seller':
        raise ValueError('El informe ejecutivo requiere grano diario por vendedor')
    rows = data['rows']
    if not rows or len({r['currency_code'] for r in rows}) != 1:
        raise ValueError('Se requiere una moneda y datos no vacíos')
    seen = set()
    for r in rows:
        date.fromisoformat(r['metric_date'])
        key = tuple(r.get(k) for k in ['source_database','metric_date','company_id','seller_id','currency_code'])
        if key in seen:
            raise ValueError('Duplicado de agregado')
        seen.add(key)
    total = group(rows, []) [()]
    if total['sales'] <= 0:
        raise ValueError('La composición porcentual requiere venta neta positiva')
    sellers = sorted(group(rows, ['source_database','seller_id']).items(), key=lambda x:x[1]['sales'], reverse=True)
    companies = group(rows, ['source_database','company_id','company_name'])
    daily = dict(sorted(group(rows, ['metric_date']).items()))
    # Compare only complete ISO weeks whose five weekdays all exist in this extraction.
    weeks = defaultdict(list)
    last_day = date.fromisoformat(max(r['metric_date'] for r in rows))
    for (day,), value in daily.items():
        day = date.fromisoformat(day)
        if day.weekday()<5 and day < last_day:
            weeks[day.isocalendar()[:2]].append(day)
    full = [sorted(v) for _,v in sorted(weeks.items()) if len(v)==5 and {d.weekday() for d in v}==set(range(5))]
    comparison = None
    if len(full)>=2:
        old, new = full[-2:]
        a = [r for r in rows if date.fromisoformat(r['metric_date']) in old]
        b = [r for r in rows if date.fromisoformat(r['metric_date']) in new]
        av,bv = group(a,[])[()],group(b,[])[()]
        ag,bg = group(a,['source_database','seller_id']),group(b,['source_database','seller_id'])
        contributions=[]
        for key in ag.keys()|bg.keys():
            before,after=ag.get(key,{}),bg.get(key,{})
            contributions.append({'label':after.get('label',before.get('label','Sin vendedor')), 'delta':after.get('sales',0)-before.get('sales',0), 'before':before.get('sales',0),'after':after.get('sales',0)})
        comparison=dict(old=[str(d) for d in old],new=[str(d) for d in new],before=av,after=bv,delta=bv['sales']-av['sales'],growth=100*(bv['sales']/av['sales']-1) if av['sales'] else None,contributions=sorted(contributions,key=lambda v:v['delta']))
        assert abs(sum(x['delta'] for x in contributions)-comparison['delta'])<.01
    observed=[v['sales'] for v in daily.values()]
    completed=[v['sales'] for (day,),v in daily.items() if day<str(last_day)]
    q1,_,q3=statistics.quantiles(completed,n=4,method='inclusive') if len(completed)>1 else (0,0,0)
    anomalies=[day for (day,),v in daily.items() if day<str(last_day) and (v['sales']<q1-1.5*(q3-q1) or v['sales']>q3+1.5*(q3-q1))]
    top3=sum(v['sales'] for _,v in sellers[:3])/total['sales']*100
    top5=sum(v['sales'] for _,v in sellers[:5])/total['sales']*100
    return dict(total=total,sellers=sellers,companies=companies,daily=daily,comparison=comparison,top3=top3,top5=top5,
                mean=statistics.mean(observed),median=statistics.median(observed),stddev=statistics.stdev(observed) if len(observed)>1 else None,
                completed_mean=statistics.mean(completed) if completed else None,iqr_anomalies=anomalies,
                negative_rows=sum(number(r['untaxed_amount'])<0 for r in rows),zero_rows=sum(number(r['untaxed_amount'])==0 for r in rows),
                last_day=str(last_day),first_day=min(r['metric_date'] for r in rows),currency=rows[0]['currency_code'],row_count=len(rows))


def money(n): return f'${n:,.2f}'
def pct(n): return 'No definido' if n is None else f'{n:,.2f}%'


def build(data, output):
    a=analyze(data)
    output.mkdir(parents=True,exist_ok=True)
    chartdir=output/'charts';chartdir.mkdir(exist_ok=True)
    font=font_manager.findfont('DejaVu Sans')
    bold=font_manager.findfont(font_manager.FontProperties(family='DejaVu Sans',weight='bold'))
    pdfmetrics.registerFont(TTFont('Executive',font));pdfmetrics.registerFont(TTFont('ExecutiveBold',bold))
    pdfmetrics.registerFontFamily('Executive',normal='Executive',bold='ExecutiveBold',italic='Executive',boldItalic='ExecutiveBold')
    teal='#006B70';navy='#142D3B';amber='#B66A15';red='#AC3841'
    plt.rcParams.update({'font.family':'DejaVu Sans','axes.spines.top':False,'axes.spines.right':False,'axes.labelcolor':navy,'axes.titleweight':'bold','font.size':10})
    charts={}
    def save(name, fig):
        fig.tight_layout();path=chartdir/f'{name}.png';fig.savefig(path,dpi=170,bbox_inches='tight');plt.close(fig);charts[name]=path
    fmt=FuncFormatter(lambda x,pos:f'{x/1000:,.0f} mil')
    days=[k[0] for k in a['daily']];values=[v['sales'] for v in a['daily'].values()]
    fig,ax=plt.subplots(figsize=(10.3,3.6));ax.bar(range(len(days)),values,color=[teal]*(len(days)-1)+[amber]);ax.axhline(a['median'],color=navy,ls='--',label='Mediana observada');ax.set_xticks(range(len(days)),[d[8:] for d in days]);ax.set_xlabel('Día de octubre de 2026' if a['first_day'][:7]=='2026-10' else 'Días con registros');ax.set_ylabel(a['currency']);ax.yaxis.set_major_formatter(fmt);ax.legend(frameon=False);save('daily',fig)
    fig,ax=plt.subplots(figsize=(10.3,4));names=[v['label'] for _,v in a['sellers']];sales=[v['sales'] for _,v in a['sellers']];rates=[v['rate'] for _,v in a['sellers']]
    ax.barh(names[::-1],sales[::-1],color=teal);ax.xaxis.set_major_formatter(fmt);ax.set_xlabel(a['currency']);save('sellers',fig)
    fig,ax=plt.subplots(figsize=(10.3,3.7))
    for i,(_,v) in enumerate(a['sellers']):
        if v['rate'] is not None:
            ax.scatter(v['sales'],v['rate'],s=max(45,abs(v['margin'])/700),alpha=.75,color=teal)
            ax.annotate(str(i+1),(v['sales'],v['rate']),xytext=(5,4),textcoords='offset points',fontsize=9)
    ax.axhline(a['total']['rate'],ls='--',color=amber,label=f"Margen ponderado {pct(a['total']['rate'])}");ax.xaxis.set_major_formatter(fmt);ax.set_xlabel('Ventas netas '+a['currency']);ax.set_ylabel('Margen sobre ventas (%)');ax.legend(frameon=False,fontsize=8);save('profitability',fig)
    fig,ax=plt.subplots(figsize=(10.3,3.7));shares=[v/a['total']['sales']*100 for v in sales];cum=[];s=0
    for v in shares:s+=v;cum.append(s)
    ax.bar(range(1,len(shares)+1),shares,color=teal);ax.set_xlabel('Vendedores ordenados por venta');ax.set_ylabel('Participación individual (%)');other=ax.twinx();other.plot(range(1,len(shares)+1),cum,color=amber,marker='o');other.set_ylabel('Participación acumulada (%)');other.set_ylim(0,max(105,max(cum)+2));save('concentration',fig)
    if a['comparison']:
        c=a['comparison'];items=c['contributions'];fig,ax=plt.subplots(figsize=(10.3,4));ax.barh([x['label'] for x in items],[x['delta'] for x in items],color=[teal if x['delta']>=0 else red for x in items]);ax.axvline(0,color=navy,lw=.8);ax.xaxis.set_major_formatter(fmt);ax.set_xlabel('Cambio de ventas entre semanas comparables ('+a['currency']+')');save('weekly_change',fig)
    cv=list(a['companies'].items());fig,axes=plt.subplots(1,2,figsize=(10.3,3.4))
    labels=[f'Empresa {k[1]}' for k,v in cv]
    axes[0].bar(labels,[v['sales'] for k,v in cv],color=teal);axes[0].set_title('Ventas netas');axes[0].yaxis.set_major_formatter(fmt)
    axes[1].bar(labels,[v['rate'] or 0 for k,v in cv],color=amber);axes[1].set_title('Margen sobre ventas (%)');save('companies',fig)
    styles=getSampleStyleSheet()
    for name in ['Normal','BodyText','Heading1','Heading2','Title']:styles[name].fontName='Executive'
    styles['BodyText'].fontSize=9.5;styles['BodyText'].leading=14;styles['BodyText'].spaceAfter=9
    styles['Heading1'].fontName='ExecutiveBold';styles['Heading1'].fontSize=22;styles['Heading1'].leading=28;styles['Heading1'].textColor=colors.HexColor(navy)
    styles['Heading2'].fontName='ExecutiveBold';styles['Heading2'].fontSize=13;styles['Heading2'].leading=18;styles['Heading2'].spaceBefore=12;styles['Heading2'].spaceAfter=8
    small=ParagraphStyle('Small',parent=styles['BodyText'],fontSize=8,leading=11)
    story=[];html=[]
    def para(text, heading=False):
        story.append(Paragraph(text,styles['Heading2'] if heading else styles['BodyText']));html.append(f'<h3>{text}</h3>' if heading else f'<p>{text}</p>')
    def page(title,subtitle):
        if story:story.append(PageBreak())
        if html:html.append('</section>')
        html.append(f'<section><h2>{escape(title)}</h2>')
        story.append(Paragraph(title,styles['Heading1']));story.append(Spacer(1,10));para(subtitle)
    def table(headers, rows, widths=None):
        header_style=ParagraphStyle('TH',parent=small,textColor=colors.white,fontName='ExecutiveBold')
        cells=[[Paragraph(escape(str(c)),header_style if i==0 else small) for c in row] for i,row in enumerate([headers]+rows)]
        t=Table(cells,colWidths=widths,repeatRows=1,hAlign='LEFT')
        t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor(navy)),('TEXTCOLOR',(0,0),(-1,0),colors.white),('VALIGN',(0,0),(-1,-1),'TOP'),('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.HexColor('#EEF5F5'),colors.white]),('LINEBELOW',(0,0),(-1,0),1,colors.HexColor(teal))]))
        story.append(t);story.append(Spacer(1,10));html.append('<table><thead><tr>'+''.join(f'<th>{escape(str(c))}</th>' for c in headers)+'</tr></thead><tbody>'+''.join('<tr>'+''.join(f'<td>{escape(str(c))}</td>' for c in row)+'</tr>' for row in rows)+'</tbody></table>')
    def chart(name,height=220):
        img=Image(str(charts[name]));img.drawWidth=7.15*inch;img.drawHeight=height;story.append(img);story.append(Spacer(1,8));html.append('<img alt="'+name+'" src="data:image/png;base64,'+base64.b64encode(charts[name].read_bytes()).decode()+'">')
    def label(v):return escape(v['label'])
    total=a['total'];lead=a['sellers'][0][1]
    page('Ventas y rentabilidad para decidir',f"Reporte gerencial | {a['first_day']} a {a['last_day']} | {a['currency']} | Datos recuperados previamente")
    para('Resumen ejecutivo',True)
    table(['Ventas netas','Margen registrado','Margen ponderado','Vendedores con registros'],[[money(total['sales']),money(total['margin']),pct(total['rate']),len(a['sellers'])]],[135,135,125,120])
    para(f"<b>Escala comercial.</b> La extracción suma {money(total['sales'])} de ventas netas y {money(total['margin'])} de margen registrado. El margen ponderado es {pct(total['rate'])}; este indicador no descuenta todos los gastos operativos de la empresa.")
    para(f"<b>Concentración.</b> Los tres vendedores con mayor venta aportan {pct(a['top3'])} del total; los cinco primeros, {pct(a['top5'])}. {label(lead)} encabeza el volumen con {money(lead['sales'])}. La concentración orienta la revisión de continuidad comercial, sin demostrar por sí sola un riesgo excesivo.")
    if a['comparison']:
        c=a['comparison'];para(f"<b>Movimiento comparable dentro del mes.</b> Las ventas de {c['new'][0]} a {c['new'][-1]} cambian {money(c['delta'])} ({pct(c['growth'])}) frente a {c['old'][0]}–{c['old'][-1]}. Ambas ventanas contienen cinco días de lunes a viernes con registros. Es una comparación entre semanas del mismo mes, no contra septiembre.")
    para('<b>Decisión recomendada.</b> Revisar primero los vendedores que explican el cambio semanal y los de alto volumen con margen inferior al promedio. Antes de ajustar precios o incentivos, contrastar mezcla de productos, descuentos, devoluciones y cartera: esos detalles no están en esta extracción.')
    para('Alcance de este corte',True)
    para(f"Se analizaron {a['row_count']} agregados, {len(a['daily'])} fechas con registros y {len(a['companies'])} empresas. El último día puede estar incompleto. La conexión de herramientas no está disponible en este chat: este informe reutiliza la extracción autorizada anterior y no afirma una actualización nueva.")
    page('Cómo se distribuyen las ventas diarias','Distinguir variación operativa de un cambio sostenido requiere observar el calendario y la madurez del corte.')
    chart('daily',240)
    table(['Media observada','Mediana observada','Desviación estándar','Fechas observadas'],[[money(a['mean']),money(a['median']),money(a['stddev']) if a['stddev'] is not None else 'N/D',len(a['daily'])]],[135,135,135,110])
    para(f"La media de los días anteriores al último corte es {money(a['completed_mean']) if a['completed_mean'] is not None else 'no calculable'}. El último día aparece en ámbar y no se usa para la comparación de semanas completas ni para identificar valores atípicos.")
    para(f"La regla descriptiva de 1.5 veces el rango intercuartílico señala {len(a['iqr_anomalies'])} días anteriores al corte como posibles valores atípicos"+(': '+', '.join(a['iqr_anomalies']) if a['iqr_anomalies'] else '')+'. No constituye una prueba de anomalía comercial ni una explicación de causa.')
    para('Uso gerencial: revisar documentos de días extremos antes de modificar la planeación. No convertir los días sin filas en ventas cero ni comparar el último día parcial con días cerrados.')
    page('Qué vendedores explican el cambio semanal','Contribución aritmética al cambio de ventas; no atribución causal ni evaluación definitiva de desempeño.')
    if a['comparison']:
        c=a['comparison'];table(['Ventana','Ventas netas','Margen registrado','Margen %'],[[c['old'][0]+' a '+c['old'][-1],money(c['before']['sales']),money(c['before']['margin']),pct(c['before']['rate'])],[c['new'][0]+' a '+c['new'][-1],money(c['after']['sales']),money(c['after']['margin']),pct(c['after']['rate'])]],[180,115,115,105]);chart('weekly_change',245)
        worst=c['contributions'][0];best=c['contributions'][-1]
        para(f"La mayor contribución negativa corresponde a {escape(worst['label'])}: {money(worst['delta'])}. La mayor contribución positiva corresponde a {escape(best['label'])}: {money(best['delta'])}. La suma de las contribuciones concilia con el cambio total de {money(c['delta'])}.")
        para(f"El margen registrado cambia {money(c['after']['margin']-c['before']['margin'])}, mientras que el porcentaje de margen pasa de {pct(c['before']['rate'])} a {pct(c['after']['rate'])}. Una mejora porcentual no implica un mayor margen en pesos; revisar ambos indicadores antes de decidir.")
        para('Revisar la oportunidad de facturación, notas de crédito y mezcla de ventas de esos vendedores. La comparación no controla feriados, tamaño de cartera, ausencias ni asignación de oportunidades.')
    else:para('La extracción no contiene dos semanas completas comparables. No se calcula un cambio con ventanas incompletas.')
    page('Venta y margen de cada vendedor','La tabla conserva todos los vendedores con registros. La participación usa la venta neta total como denominador.')
    table(['# / Vendedor','Venta neta','Part.','Margen','Margen %'],[[f"{i+1}. {v['label']}",money(v['sales']),pct(100*v['sales']/total['sales']),money(v['margin']),pct(v['rate'])] for i,(k,v) in enumerate(a['sellers'])],[185,100,55,100,75])
    para('Los nombres se agrupan por origen e identificador de vendedor y se consolidan entre empresas. Las ventas negativas se conservan, pero su porcentaje de margen no se interpreta como rentabilidad. Volumen y margen deben revisarse junto con cartera, metas y mezcla de productos antes de evaluar resultados personales.')
    page('Dónde revisar la calidad del margen','Los números del gráfico corresponden al orden de vendedores en la tabla anterior. El tamaño del punto representa el valor absoluto del margen.')
    chart('profitability',240)
    candidates=[(i+1,v) for i,(k,v) in enumerate(a['sellers']) if v['sales']>total['sales']/len(a['sellers']) and v['rate'] is not None and v['rate']<total['rate']]
    para('Vendedores de volumen superior a la media con margen inferior al ponderado',True)
    if candidates:
        table(['Vendedor','Ventas','Margen %','Diferencia vs ponderado'],[[str(i)+'. '+v['label'],money(v['sales']),pct(v['rate']),f"{v['rate']-total['rate']:+.2f} puntos"] for i,v in candidates],[210,100,90,115])
    else:para('No aparecen vendedores que cumplan ambos criterios en esta extracción.')
    para('Este cruce es un criterio de priorización, no una meta ni evidencia de mala ejecución. La mezcla de productos o clientes puede explicar diferencias legítimas.')
    para(f"<b>Sensibilidad ilustrativa.</b> Un punto porcentual adicional de margen sobre el mismo volumen equivaldría a {money(total['sales']*.01)} de margen registrado. Es una identidad aritmética con volumen constante, no un pronóstico ni un beneficio alcanzable garantizado.")
    page('Cómo contribuye cada empresa','Separar volumen y porcentaje de margen ayuda a evitar decisiones basadas únicamente en el tamaño de las ventas.')
    chart('companies',220)
    table(['Empresa','Ventas','Participación','Margen','Margen %'],[[k[2],money(v['sales']),pct(v['sales']/total['sales']*100),money(v['margin']),pct(v['rate'])] for k,v in cv],[180,100,70,100,65])
    para('Los importes se consolidan únicamente en la moneda seleccionada. Esta extracción no demuestra eliminación de operaciones entre empresas, conversión cambiaria ni un estado de resultados contable consolidado.')
    para('Decisión sugerida: contrastar las diferencias de margen entre empresas con su mezcla de productos y estructura comercial. No trasladar objetivos o presupuestos de una empresa a otra solo por su margen porcentual.')
    page('Concentración y continuidad comercial','Una cartera de ventas concentrada puede requerir seguimiento, pero los agregados por vendedor no revelan la concentración por cliente.')
    chart('concentration',235)
    table(['Participación del primero','Participación de los tres primeros','Participación de los cinco primeros'],[[pct(sales[0]/total['sales']*100),pct(a['top3']),pct(a['top5'])]],[170,175,170])
    para('El gráfico combina participación individual y acumulada sobre ventas netas. Las contribuciones negativas pueden llevar el acumulado temporalmente por encima de 100%. La concentración depende de la asignación de cuentas y no permite inferir dependencia de clientes sin el detalle de cartera.')
    para('Decisión sugerida: documentar continuidad de atención para las cuentas de los vendedores de mayor contribución y revisar si el resto del equipo dispone de oportunidades comparables. Requiere validar cartera y carga de trabajo antes de reasignar cuentas.')
    page('Agenda de decisiones para gerencia','Acciones propuestas para revisión. No se han ejecutado cambios en precios, metas, cuentas ni permisos.')
    actions=[
        ['Cambio semanal','Revisar vendedores con mayor contribución negativa y positiva; conciliar facturación y notas de crédito.','Detalle por documento y fecha; cartera y oportunidades.','Distinguir efecto de calendario de pérdida comercial.'],
        ['Calidad del margen','Examinar los vendedores de alto volumen con margen por debajo del ponderado.','Precio, costo, descuento y mezcla por producto y cliente.','Determinar si conviene actuar en precio, mezcla o seguimiento.'],
        ['Saldos negativos','Conciliar vendedores con venta o margen netos negativos.','Notas de crédito, devoluciones y correcciones de costo.','Distinguir ajustes contables de problemas comerciales.'],
        ['Continuidad','Revisar cobertura de cuentas de los vendedores con mayor contribución.','Clientes activos, responsables y próxima actividad.','Definir respaldos de atención sin reasignar por intuición.'],
        ['Empresas','Conciliar las diferencias de margen y el alcance de consolidación.','Operaciones entre empresas y políticas de costos.','Validar una lectura gerencial comparable.'],
        ['Medición','Habilitar consulta de periodos anteriores y categorías con las herramientas del plugin.','Conexión autorizada de solo lectura.','Completar variaciones históricas y análisis de mezcla.']]
    table(['Prioridad de revisión','Acción propuesta','Evidencia adicional','Decisión que habilita'],actions,[90,160,135,130])
    para('Gerencia debe asignar responsables y fechas según su operación. Este informe no inventa compromisos, metas ni umbrales de aprobación. Las recomendaciones priorizan investigaciones que pueden cambiar una decisión, en lugar de afirmar causas que los datos no demuestran.')
    page('Fuentes, calidad y alcance de las conclusiones','El reporte distingue los resultados calculados, las propuestas de revisión y la información todavía no disponible.')
    refreshed=[r['source_fetched_at'] for r in data['rows'] if r.get('source_fetched_at')]
    table(['Control','Resultado'],[
        ['Fuente','API MCP del proyecto Supabase soporte_tectronic; extracción autorizada guardada previamente.'],
        ['Consulta original',data['retrieved_at']],
        ['Actualización de origen',min(refreshed)+' a '+max(refreshed) if refreshed else 'No disponible'],
        ['Población',f"{a['row_count']} filas agregadas por día, origen, empresa, vendedor y moneda."],
        ['Calidad',f"Sin claves duplicadas; {a['negative_rows']} filas con venta negativa y {a['zero_rows']} con venta cero. Se conservaron sus signos."],
        ['Moneda',a['currency']+'; no se mezcló con USD ni se convirtió moneda.'],
        ['Conteo de facturas','No deducible como documentos únicos a partir de la suma de conteos por grupo.'],
        ['Cobertura','No se pudo volver a consultar estado_datos. No se garantiza cobertura completa por ausencia de filas.'],
        ['Modelos','Estadística descriptiva y sensibilidad aritmética; sin pronóstico entrenado ni inferencia causal.']],[135,380])
    para('Definiciones de cálculo',True)
    para('Venta neta = suma de untaxed_amount; margen registrado = suma de margin_amount; margen ponderado = margen total / venta neta total. Participación = venta del grupo / venta total. Cambio semanal = nueva ventana menos anterior; porcentaje de cambio = diferencia / ventana anterior. La media y la desviación describen fechas con registros y no implican una muestra aleatoria.')
    para('Información necesaria para ampliar decisiones',True)
    para('Comparación contra septiembre y año anterior; metas y presupuesto; detalle de categorías y productos; clientes y recurrencia; oportunidades y conversión; cobranza, costos operativos e inventario. Esta extracción no permite calcular esos resultados. La ausencia se declara, no se sustituye por ceros ni datos simulados.')
    def footer(canvas,doc):
        canvas.setStrokeColor(colors.HexColor(teal));canvas.line(40,36,555,36);canvas.setFont('Executive',8);canvas.setFillColor(colors.HexColor(navy));canvas.drawString(40,24,'TECTRONIC | Uso gerencial | '+a['currency']);canvas.drawRightString(555,24,f'{doc.page}')
    pdf=output/'reporte-gerencial.pdf'
    SimpleDocTemplate(str(pdf),pagesize=(595.28,841.89),leftMargin=40,rightMargin=40,topMargin=38,bottomMargin=48,title='Tectronic · Reporte gerencial',author='Tectronic').build(story,onFirstPage=footer,onLaterPages=footer)
    document='<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tectronic · Reporte gerencial</title><style>body{font:16px/1.65 system-ui;color:#142d3b;background:#f3f7f7;margin:0}main{max-width:1100px;margin:auto;background:white;padding:40px}h1,h2{line-height:1.2}h2{margin-top:56px;border-top:3px solid #006b70;padding-top:24px}img{width:100%;height:auto}table{width:100%;border-collapse:collapse;font-size:13px;margin:20px 0;display:block;overflow:auto}th{background:#142d3b;color:white}th,td{padding:12px;text-align:left;border-bottom:1px solid #dde8e8}tr:nth-child(even){background:#eef5f5}p{max-width:95ch}@media(max-width:600px){main{padding:18px}}</style><main><h1>TECTRONIC · Reporte gerencial</h1>'+''.join(html)+'</main></html>'
    document=document.replace('</main>','</section></main>')
    (output/'reporte-gerencial.html').write_text(document,encoding='utf-8')
    metrics={k:v for k,v in a.items() if k not in ('sellers','companies','daily')};metrics['sellers']=[dict(source_database=k[0],seller_id=k[1],**v) for k,v in a['sellers']];metrics['companies']=[dict(source_database=k[0],company_id=k[1],company_name=k[2],**v) for k,v in cv];metrics['daily']=[dict(date=k[0],**v) for k,v in a['daily'].items()]
    (output/'analysis.json').write_text(json.dumps(metrics,ensure_ascii=False,indent=2),encoding='utf-8')
    return metrics


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--input',type=Path,required=True);parser.add_argument('--output',type=Path,required=True);args=parser.parse_args()
    build(json.loads(args.input.read_text(encoding='utf-8-sig')),args.output)
