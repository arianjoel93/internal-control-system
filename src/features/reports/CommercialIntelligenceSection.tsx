import { lazy, Suspense, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { OdooCommercialDataset, ReportFilters } from './odooSalesCore';
import { buildCommercialIntelligence, type AffinityAnalysis } from './commercialIntelligence';
import { getBusinessIntelligenceCustomerMargins, getBusinessIntelligenceStock } from './reportsService';

const money = (value: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(value);
const number = (value: number, digits = 0) => new Intl.NumberFormat('es-MX', { maximumFractionDigits: digits }).format(value);
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function AffinityMatrix({ analysis, compact = false }: { analysis: AffinityAnalysis; compact?: boolean }) {
  const products = analysis.products.slice(0, compact ? 6 : 8);
  const [selected, setSelected] = useState<string | null>(null);
  const pairMap = new Map(analysis.pairs.map((pair) => [`${pair.firstId}:${pair.secondId}`, pair]));
  const maxInvoices = Math.max(1, ...analysis.pairs.map((pair) => pair.invoices));
  const selectedPair = analysis.pairs.find((pair) => `${pair.firstId}:${pair.secondId}` === selected);
  if (products.length < 2) return <p className="bi-empty">No hay suficientes productos facturados juntos en el periodo para calcular afinidad.</p>;
  return <div className={`bi-affinity ${compact ? 'bi-affinity-compact' : ''}`}>
    <div className="bi-affinity-matrix" style={{ gridTemplateColumns: `minmax(38px, 50px) repeat(${products.length}, minmax(32px, 1fr))` }}>
      <span aria-hidden="true" />
      {products.map((product, index) => <span className="bi-matrix-label" key={product.id} title={product.name}>{index + 1}</span>)}
      {products.map((row, rowIndex) => <div className="bi-matrix-row" key={row.id} style={{ display: 'contents' }}>
        <span className="bi-matrix-label" title={row.name}>{rowIndex + 1}</span>
        {products.map((column) => {
          const key = `${Math.min(row.id, column.id)}:${Math.max(row.id, column.id)}`;
          const pair = pairMap.get(key);
          const strength = pair ? pair.invoices / maxInvoices : 0;
          return row.id === column.id
            ? <span className="bi-matrix-cell bi-matrix-self" key={column.id} title={`${row.name}: ${row.invoices} facturas`}>{row.invoices}</span>
            : <button type="button" key={column.id} className={`bi-matrix-cell ${selected === key ? 'is-selected' : ''}`}
                style={{ backgroundColor: pair ? `rgba(18, 116, 104, ${0.12 + strength * 0.7})` : undefined }}
                title={`${row.name} + ${column.name}: ${pair?.invoices ?? 0} facturas compartidas`}
                onClick={() => setSelected(key)}>{pair?.invoices ?? '·'}</button>;
        })}
      </div>)}
    </div>
    <div className="bi-affinity-legend">{products.map((product, index) => <span key={product.id}><b>{index + 1}</b> {product.name}</span>)}</div>
    {selectedPair ? <div className="bi-insight"><strong>{products.find((item) => item.id === selectedPair.firstId)?.name} + {products.find((item) => item.id === selectedPair.secondId)?.name}</strong><span>{selectedPair.invoices} facturas · Soporte {number(selectedPair.supportPct, 1)}% · Afinidad relativa {number(selectedPair.lift, 2)}×</span></div> : null}
    <p className="bi-caption">Cada celda indica cuántas facturas incluyen ambos productos. La diagonal indica facturas por producto; la afinidad no implica causalidad.</p>
  </div>;
}

const CustomerProfitabilityMatrix = lazy(() => import('./CustomerProfitabilityScatter'));

export function CommercialIntelligenceSection({ dataset, filters }: { dataset: OdooCommercialDataset; filters: ReportFilters }) {
  const base = useMemo(() => buildCommercialIntelligence(dataset, filters), [dataset, filters]);
  const marginQuery = useQuery({
    queryKey: ['commercial-intelligence-customer-margin', filters],
    queryFn: () => getBusinessIntelligenceCustomerMargins(filters),
    staleTime: 15 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const productIds = base.demand.map((row) => row.productId);
  const stockQuery = useQuery({
    queryKey: ['commercial-intelligence-stock', filters.companyIds, filters.companyId, productIds],
    queryFn: () => getBusinessIntelligenceStock(filters, productIds),
    enabled: productIds.length > 0,
    staleTime: 15 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const data = useMemo(() => buildCommercialIntelligence(
    dataset,
    filters,
    stockQuery.data?.products ?? [],
    marginQuery.data ?? [],
  ), [dataset, filters, marginQuery.data, stockQuery.data]);
  const largestMargin = Math.max(1, ...data.customers.map((row) => Math.abs(row.margin)));
  const largestSales = Math.max(1, ...data.customers.map((row) => row.sales));
  return <div className="bi-page">
    <header className="bi-hero"><div><span className="bi-eyebrow">Inteligencia de negocios · {filters.startDate} a {filters.endDate}</span><h3>Decisiones que nacen de la operación</h3><p>Rentabilidad, compras conjuntas, cobertura de inventario y velocidad de cierre con los mismos filtros del Resumen.</p></div><div className="bi-hero-stat"><strong>{number(data.affinity.basketCount)}</strong><span>facturas analizadas para afinidad</span></div></header>
    <div className="bi-metric-row">
      <div><span>Clientes con margen completo</span><strong>{number(data.profitabilityCoverage.analyzed)}</strong></div>
      <div><span>Pares de productos</span><strong>{number(data.affinity.pairs.length)}</strong></div>
      <div><span>SKU de mayor demanda</span><strong>{number(data.demand.length)}</strong></div>
      <div><span>Vendedores con cierres medibles</span><strong>{number(data.velocity.length)}</strong></div>
    </div>
    <section className="bi-card bi-card-wide"><div className="bi-card-heading"><div><span className="bi-kicker">01 / Cartera</span><h4>Matriz de Rentabilidad de Clientes</h4><p>Detecta clientes estratégicos y cuentas donde conviene revisar precios o costos.</p></div></div>
      {marginQuery.isFetching ? <p className="bi-caption">Consultando margen y ventas por cliente desde Análisis de facturas…</p> : null}
      {marginQuery.isError ? <p className="bi-caution">Odoo no entregó el margen agrupado por cliente. Se intentará mostrar el margen disponible en las líneas cargadas.</p> : null}
      <Suspense fallback={<p className="bi-empty">Preparando matriz de rentabilidad…</p>}><CustomerProfitabilityMatrix customers={data.customers} thresholdX={data.salesThreshold} odooBaseUrl={dataset.odooBaseUrl} /></Suspense>
      {data.profitabilityCoverage.missing ? <p className="bi-caution">{number(data.profitabilityCoverage.missing)} líneas sin margen contable verificable; sus clientes no se clasifican para evitar conclusiones falsas.</p> : null}</section>
    <div className="bi-grid">
      <section className="bi-card"><div className="bi-card-heading"><div><span className="bi-kicker">02 / Afinidad</span><h4>Productos comprados juntos</h4><p>Las celdas más intensas son combinaciones que aparecen más veces en una misma factura.</p></div></div><AffinityMatrix analysis={data.affinity} /></section>
      <section className="bi-card"><div className="bi-card-heading"><div><span className="bi-kicker">03 / Inventario</span><h4>Demanda y riesgo de desabasto</h4><p>Cobertura estimada = existencias actuales / unidades diarias facturadas en el periodo.</p></div></div>
        {stockQuery.isFetching ? <p className="bi-caption">Consultando existencias actuales de los SKU principales…</p> : null}
        {stockQuery.isError ? <p className="bi-caution">No se pudieron consultar existencias; la demanda sigue visible, pero no se asigna riesgo.</p> : null}
        {data.demand.length ? <div className="bi-heatmap">{data.demand.map((row) => <div className={`bi-heatmap-row bi-risk-${row.risk}`} key={row.productId}><div className="bi-heatmap-name"><strong>{row.productName}</strong><span>{row.sku ?? `ID ${row.productId}`}</span></div><div><small>Unidades</small><strong>{number(row.units, 1)}</strong></div><div><small>Existencia</small><strong>{row.onHand === null ? 'Sin dato' : number(row.onHand, 1)}</strong></div><div><small>Cobertura</small><strong>{row.coverageDays === null ? 'Sin dato' : `${number(row.coverageDays, 0)} días`}</strong></div></div>)}</div> : <p className="bi-empty">No hay unidades facturadas para este filtro.</p>}
        <p className="bi-caption">Rojo: menos de 14 días; ámbar: 14–29; verde: 30 o más. Es una señal orientativa: no descuenta reservas ni incorpora compras futuras. Las existencias son actuales, aunque la demanda provenga de un periodo histórico.</p>
      </section>
      <section className="bi-card"><div className="bi-card-heading"><div><span className="bi-kicker">04 / Ciclo comercial</span><h4>Velocidad de cierre por vendedor</h4><p>Días entre la creación y confirmación de órdenes cerradas dentro del periodo.</p></div></div>
        {data.velocity.length ? <div className="bi-boxplots">{data.velocity.map((row) => { const max = Math.max(1, ...data.velocity.map((item) => item.max)); const pos = (value: number) => `${clamp(value / max * 100, 0, 100)}%`; return <div className="bi-boxplot-row" key={row.sellerId}><span title={row.seller}>{row.seller}</span><div className="bi-boxplot-track" title={`Mín ${number(row.min, 1)} · Q1 ${number(row.q1, 1)} · Mediana ${number(row.median, 1)} · Q3 ${number(row.q3, 1)} · Máx ${number(row.max, 1)} días`}><i className="bi-boxplot-whisker" style={{ left: pos(row.min), width: `${(row.max-row.min)/max*100}%` }} /><i className="bi-boxplot-box" style={{ left: pos(row.q1), width: `${(row.q3-row.q1)/max*100}%` }} /><i className="bi-boxplot-median" style={{ left: pos(row.median) }} /></div><b>{number(row.median, 1)} d</b><small>n={row.count}</small></div>; })}</div> : <p className="bi-empty">No hay órdenes confirmadas con fecha de creación y cierre para calcular velocidad.</p>}
        <p className="bi-caption">Caja: percentiles 25–75; línea interior: mediana; extremos: mínimo y máximo. Solo mide órdenes confirmadas, no oportunidades todavía abiertas.</p>
      </section>
      <section className="bi-card"><div className="bi-card-heading"><div><span className="bi-kicker">05 / Valor</span><h4>Ventas vs. margen por cliente</h4><p>Contrasta facturación con margen monetario para priorizar cuentas de alto volumen y bajo retorno.</p></div></div>
        {data.customers.length ? <div className="bi-value-scatter" role="img" aria-label="Dispersión de ventas y margen monetario por cliente"><div className="bi-value-axis-y">Margen ↑</div><div className="bi-value-plot">{data.customers.slice(0, 100).map((row) => <span key={row.id} className={`bi-value-dot bi-segment-${row.segment}`} style={{ left: `${clamp(row.sales / largestSales * 96, 2, 96)}%`, bottom: `${clamp((row.margin / largestMargin + 1) * 47, 2, 96)}%` }} title={`${row.name}: ventas ${money(row.sales)}, margen ${money(row.margin)}`} />)}<i className="bi-value-zero" /></div><div className="bi-value-axis-x">Ventas →</div></div> : <p className="bi-empty">Sin margen verificable para construir la dispersión.</p>}
        <p className="bi-caption">Cada punto es un cliente; la línea central indica margen cero. Pasa el cursor o toca un punto para ver los valores.</p>
      </section>
    </div>
  </div>;
}
