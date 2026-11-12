"""Reportes locales reproducibles. Sin red ni credenciales."""
import argparse
import datetime as dt
from decimal import Decimal
import json
from pathlib import Path
import statistics


def analyze(data):
    if data.get('source') != 'supabase' or data.get('complete') is not True:
        raise ValueError('Se requiere exportación completa de Supabase.')
    dt.datetime.fromisoformat(data['retrieved_at'].replace('Z', '+00:00'))
    rows = data['rows']
    if not rows:
        raise ValueError('Sin registros; no se interpreta como ventas cero.')
    if data.get('dataset_kind') == 'sales_aggregates':
        return analyze_aggregates(data)
    currencies = {r['currency_code'] for r in rows}
    if len(currencies) != 1 or not next(iter(currencies)):
        raise ValueError('Se requiere una sola moneda identificada.')
    seen, invoices, daily, sellers = set(), set(), {}, {}
    total, margin = Decimal(0), Decimal(0)
    for r in rows:
        key = (r['source_database'], r['odoo_line_id'])
        if key in seen:
            raise ValueError('Hechos duplicados; revisar paginación.')
        seen.add(key)
        if r['state'] != 'posted' or r['move_type'] not in ('out_invoice', 'out_refund'):
            raise ValueError('Solo facturas y notas de crédito de cliente contabilizadas.')
        day = dt.date.fromisoformat(r['invoice_date']).isoformat()
        amount, profit = Decimal(str(r['untaxed_amount'])), Decimal(str(r['margin_amount']))
        if not amount.is_finite() or not profit.is_finite():
            raise ValueError('Importes no finitos.')
        total += amount
        margin += profit
        invoices.add((r['source_database'], r['company_id'], r['invoice_id']))
        daily[day] = daily.get(day, Decimal(0)) + amount
        seller = r.get('seller_name') or 'Sin vendedor'
        sellers[seller] = sellers.get(seller, Decimal(0)) + amount
    values = [float(v) for v in daily.values()]
    return dict(currency=next(iter(currencies)), net_sales=float(total), margin=float(margin),
                margin_pct=float(margin / total * 100) if total else None,
                invoices=len(invoices), rows=len(rows), observed_days=len(daily),
                daily_mean=statistics.mean(values), daily_median=statistics.median(values),
                daily_stddev=statistics.stdev(values) if len(values) > 1 else None,
                daily={k: float(v) for k, v in sorted(daily.items())},
                sellers={k: float(v) for k, v in sorted(sellers.items(), key=lambda item: item[1], reverse=True)},
                retrieved_at=data['retrieved_at'], filters=data.get('filters', {}))


def analyze_aggregates(data):
    rows = data['rows']
    currencies = {r['currency_code'] for r in rows}
    if len(currencies) != 1 or not next(iter(currencies)):
        raise ValueError('No mezclar monedas.')
    if data.get('grain') not in ('daily', 'monthly') or data.get('dimension') not in ('seller', 'category'):
        raise ValueError('Grano o dimensión inválidos.')
    field = 'metric_date' if data['grain'] == 'daily' else 'metric_month'
    dates, sellers, seen = {}, {}, set()
    total, margin = Decimal(0), Decimal(0)
    for r in rows:
        day = dt.date.fromisoformat(r[field]).isoformat()
        key = (r['source_database'], r['company_id'], r['seller_id'], day, r['currency_code'], r.get('category_id'))
        if key in seen:
            raise ValueError('Agregados duplicados.')
        seen.add(key)
        amount, profit = Decimal(str(r['untaxed_amount'])), Decimal(str(r['margin_amount']))
        if not amount.is_finite() or not profit.is_finite():
            raise ValueError('Importes inválidos.')
        total += amount
        margin += profit
        dates[day] = dates.get(day, Decimal(0)) + amount
        seller = f"{r.get('seller_name') or 'Sin vendedor'} [{r['seller_id']}]"
        sellers[seller] = sellers.get(seller, Decimal(0)) + amount
    values = [float(v) for v in dates.values()]
    refreshed = [r['source_fetched_at'] for r in rows if r.get('source_fetched_at')]
    return dict(currency=next(iter(currencies)), net_sales=float(total), margin=float(margin),
                margin_pct=float(margin / total * 100) if total else None, invoices=None,
                rows=len(rows), observed_days=len(dates), daily_mean=statistics.mean(values),
                daily_median=statistics.median(values), daily_stddev=statistics.stdev(values) if len(values)>1 else None,
                daily={k:float(v) for k,v in sorted(dates.items())},
                sellers={k:float(v) for k,v in sorted(sellers.items(), key=lambda x:x[1], reverse=True)},
                retrieved_at=data['retrieved_at'], filters=data.get('filters',{}), grain=data['grain'],
                source_oldest=min(refreshed) if refreshed else None, source_newest=max(refreshed) if refreshed else None,
                dataset_kind='sales_aggregates')


def render(data, output):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from matplotlib.backends.backend_pdf import PdfPages
    result = analyze(data)
    output.mkdir(parents=True, exist_ok=True)
    (output / 'metrics.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    plt.rcParams.update({'font.family': 'DejaVu Sans', 'axes.spines.top': False, 'axes.spines.right': False})
    fig, axes = plt.subplots(2, 1, figsize=(11.7, 8.3), gridspec_kw={'height_ratios': [1, 1]})
    fig.suptitle('TECTRONIC | Reporte gerencial', fontsize=20, fontweight='bold', x=.08, ha='left')
    docs = result['invoices'] if result['invoices'] is not None else 'No deducibles del agregado'
    fig.text(.08, .89, f"Ventas netas: {result['net_sales']:,.2f} {result['currency']}   |   Margen: {result['margin']:,.2f}   |   Facturas/NC: {docs}", fontsize=10)
    daily = result['daily']
    axes[0].plot([dt.date.fromisoformat(d) for d in daily], list(daily.values()), color='#006B70', marker='o')
    grain = 'mes' if result.get('grain') == 'monthly' else 'día'
    axes[0].set_title(f'Ventas netas por {grain} con registros', loc='left')
    if len(daily) == 1:
        day = dt.date.fromisoformat(next(iter(daily)))
        axes[0].set_xlim(day - dt.timedelta(days=1), day + dt.timedelta(days=1))
    from matplotlib.dates import DateFormatter
    axes[0].xaxis.set_major_formatter(DateFormatter('%Y-%m-%d'))
    axes[0].tick_params(axis='x', labelrotation=25)
    top = list(result['sellers'].items())[:8]
    axes[1].barh([k[:45] for k, _ in top][::-1], [v for _, v in top][::-1], color='#006B70')
    axes[1].set_title('Vendedores por venta neta (hasta 8)', loc='left')
    for ax in axes:
        ax.grid(axis='y', alpha=.15)
    fig.text(.08, .025, 'Fuente: API Supabase | Estadísticas descriptivas | Importes normalizados con signo | Sin inferencia causal', fontsize=8)
    fig.tight_layout(rect=[.05, .06, .97, .86])
    fig.savefig(output / 'charts.png', dpi=160)
    with PdfPages(output / 'report.pdf') as pdf:
        pdf.savefig(fig)
        page = plt.figure(figsize=(11.7, 8.3))
        text = 'Fuente y metodología\n\nActualización: ' + result['retrieved_at'] + '\nFiltros: ' + json.dumps(result['filters'], ensure_ascii=False) + '\n\nVentas: suma sin impuestos; notas de crédito con signo normalizado por la API.\nMargen: suma del margen aportado; no equivale a utilidad neta.\nMargen porcentual: margen total / venta neta total; indefinido con venta cero.\nFacturas/NC: documentos únicos por origen, empresa e identificador.\nMedia, mediana y desviación: días observados; no se imputan días faltantes.\nNo incluye pronósticos, metas ni atribución causal.\n\n' + f"Días observados: {result['observed_days']}\nMedia diaria: {result['daily_mean']:,.2f}\nMediana diaria: {result['daily_median']:,.2f}\nDesviación diaria: {result['daily_stddev']}"
        if result.get('dataset_kind') == 'sales_aggregates':
            text = ('Fuente y metodología\n\nConsulta: ' + result['retrieved_at'] + '\n'
                    + 'Actualización de origen (mínima): ' + str(result['source_oldest']) + '\n'
                    + 'Actualización de origen (máxima): ' + str(result['source_newest']) + '\n'
                    + 'Grano: ' + result['grain'] + '\n'
                    + 'Filtros: ' + json.dumps(result['filters'], ensure_ascii=False) + '\n\n'
                    + 'Ventas y margen: sumas de los agregados almacenados en Supabase.\n'
                    + 'No se convierten monedas ni se altera el signo de los importes.\n'
                    + 'Margen porcentual: margen total / ventas netas; indefinido si ventas = 0.\n'
                    + 'No se informa número global de facturas: los grupos pueden compartir documentos.\n'
                    + f'Estadísticas por {grain} observado: no se imputan periodos sin registros.\n'
                    + f"Media: {result['daily_mean']:,.2f} | Mediana: {result['daily_median']:,.2f}\n"
                    + 'Sin inferencia causal ni pronóstico. Cobertura sujeta al estado de sincronización.')
        import textwrap
        text = '\n'.join(textwrap.fill(line, 100) if line else '' for line in text.splitlines())
        page.text(.08, .90, text, va='top', fontsize=10)
        pdf.savefig(page)
        plt.close(page)
    plt.close(fig)
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    render(json.loads(args.input.read_text(encoding='utf-8-sig')), args.output)
