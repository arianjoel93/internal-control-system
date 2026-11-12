import { useState } from 'react';
import { CartesianGrid, ReferenceArea, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts';
import { classifyProfitabilityCustomer, percentile, type ProfitabilityCustomer } from './commercialIntelligence';
import { cappedMarginPercent, createBalancedAxis } from './customerProfitabilityScale';

const money = (value: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(value);
const number = (value: number, digits = 0) => new Intl.NumberFormat('es-MX', { maximumFractionDigits: digits }).format(value);
const shortMoney = (value: number) => value >= 1_000_000 ? `$${number(value / 1_000_000, 1)} M` : value >= 1_000 ? `$${number(value / 1_000, 0)} mil` : money(value);

const profitGroups: { id: ProfitabilityCustomer['segment']; title: string; shortTitle: string; color: string; background: string }[] = [
  { id: 'profitable', title: 'Rentables de bajo volumen', shortTitle: 'Rentables', color: '#24856a', background: 'var(--bi-zone-profitable)' },
  { id: 'strategic', title: 'Clientes estratégicos', shortTitle: 'Estratégicos', color: '#267fa5', background: 'var(--bi-zone-strategic)' },
  { id: 'lowVolume', title: 'Baja contribución', shortTitle: 'Bajo aporte', color: '#b58832', background: 'var(--bi-zone-low)' },
  { id: 'review', title: 'Requieren revisión', shortTitle: 'Revisar', color: '#bd6851', background: 'var(--bi-zone-review)' },
];

export default function CustomerProfitabilityMatrix({ customers, thresholdX, odooBaseUrl }: {
  customers: ProfitabilityCustomer[]; thresholdX: number; odooBaseUrl: string;
}) {
  const [active, setActive] = useState<string | null>(null);
  const [salesOverride, setSalesOverride] = useState<string | null>(null);
  const [marginInput, setMarginInput] = useState('25');
  if (!customers.length) return <p className="bi-empty">No hay clientes con margen completo y ventas positivas para este filtro.</p>;
  const enteredSales = Number(salesOverride);
  const enteredMargin = Number(marginInput);
  const salesThreshold = salesOverride === null || salesOverride === '' || !Number.isFinite(enteredSales) ? thresholdX : Math.max(0, enteredSales);
  const marginTarget = marginInput === '' || !Number.isFinite(enteredMargin) ? 25 : enteredMargin;
  const selected = customers.find((row) => row.id === active) ?? null;
  const selectedSegment = selected ? classifyProfitabilityCustomer(selected.sales, selected.marginPct, salesThreshold, marginTarget) : null;
  const positiveMarginPercentages = customers.map((row) => Math.max(0, row.marginPct)).sort((a, b) => a - b);
  const sizeCap = Math.max(1, percentile(positiveMarginPercentages, 0.9));
  const xMax = customers.reduce((max, row) => Math.max(max, row.sales * 1.06), Math.max(1, salesThreshold * 1.15));
  const yMin = customers.reduce((min, row) => Math.min(min, row.marginPct - 3), Math.min(0, marginTarget - 10));
  const yMax = customers.reduce((max, row) => Math.max(max, row.marginPct + 7), Math.max(40, marginTarget + 10));
  const salesAxis = createBalancedAxis(0, salesThreshold, xMax);
  const marginAxis = createBalancedAxis(yMin, marginTarget, yMax);
  const points = customers.map((row) => ({ ...row, x: salesAxis.toPlot(row.sales), y: marginAxis.toPlot(row.marginPct),
    z: cappedMarginPercent(row.marginPct, sizeCap),
    quadrant: classifyProfitabilityCustomer(row.sales, row.marginPct, salesThreshold, marginTarget) }));
  const odooLink = selected?.partnerId && /^https?:\/\//.test(odooBaseUrl)
    ? `${odooBaseUrl.replace(/\/+$/, '')}/web#id=${selected.partnerId}&model=res.partner&view_type=form` : null;
  const totalMargin = customers.reduce((sum, row) => sum + row.margin, 0);
  const strategicCount = points.filter((row) => row.quadrant === 'strategic').length;
  const reviewCount = points.filter((row) => row.quadrant === 'review').length;
  const quadrantCounts = new Map(profitGroups.map((group) => [group.id, points.filter((row) => row.quadrant === group.id).length]));
  const formatDate = (value: string | null) => value ? new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`)) : 'No disponible';
  return <div className="bi-profit-layout">
    <div className="bi-profit-kpis">
      <div><span>Clientes analizados</span><strong>{number(customers.length)}</strong></div>
      <div><span>Estratégicos</span><strong>{number(strategicCount)}</strong></div>
      <div><span>Requieren revisión</span><strong>{number(reviewCount)}</strong></div>
      <div><span>Margen bruto total</span><strong>{money(totalMargin)}</strong></div>
    </div>
    <div className="bi-profit-controls"><label>Umbral de ventas (MXN)<input type="number" min="0" step="1000" value={salesOverride ?? String(Math.round(thresholdX))} onChange={(event) => setSalesOverride(event.target.value)} onBlur={() => { if (salesOverride === '') setSalesOverride(null); }} /></label><button type="button" onClick={() => setSalesOverride(null)}>Usar mediana</button><label>Objetivo de margen (%)<input type="number" step="1" value={marginInput} onChange={(event) => setMarginInput(event.target.value)} onBlur={() => { if (marginInput === '') setMarginInput('25'); }} /></label><span className="bi-profit-controls-note">Los umbrales recalculan los cuadrantes al instante.</span></div>
    <div className={`bi-profit-main${selected ? ' has-selection' : ''}`}>
      <div className="bi-profit-chart" role="region" aria-label="Dispersión de clientes según ventas netas y margen bruto porcentual">
        <ResponsiveContainer width="100%" height={450} minWidth={0}>
          <ScatterChart margin={{ top: 24, right: 22, bottom: 26, left: 8 }}>
            <ReferenceArea x1={0} x2={0.5} y1={0.5} y2={1} fill={profitGroups[0].background} fillOpacity={0.8} label={{ value: `${profitGroups[0].shortTitle} · ${quadrantCounts.get('profitable')}`, position: 'insideTopLeft', fill: profitGroups[0].color, fontSize: 10 }} />
            <ReferenceArea x1={0.5} x2={1} y1={0.5} y2={1} fill={profitGroups[1].background} fillOpacity={0.8} label={{ value: `${profitGroups[1].shortTitle} · ${quadrantCounts.get('strategic')}`, position: 'insideTopLeft', fill: profitGroups[1].color, fontSize: 10 }} />
            <ReferenceArea x1={0} x2={0.5} y1={0} y2={0.5} fill={profitGroups[2].background} fillOpacity={0.8} label={{ value: `${profitGroups[2].shortTitle} · ${quadrantCounts.get('lowVolume')}`, position: 'insideTopLeft', fill: profitGroups[2].color, fontSize: 10 }} />
            <ReferenceArea x1={0.5} x2={1} y1={0} y2={0.5} fill={profitGroups[3].background} fillOpacity={0.8} label={{ value: `${profitGroups[3].shortTitle} · ${quadrantCounts.get('review')}`, position: 'insideTopLeft', fill: profitGroups[3].color, fontSize: 10 }} />
            <CartesianGrid stroke="#dae2de" strokeDasharray="3 5" />
            <XAxis type="number" dataKey="x" domain={[0, 1]} ticks={[0, 0.5, 1]} tickFormatter={(value: number) => shortMoney(salesAxis.fromPlot(value))} tick={{ fontSize: 11 }} label={{ value: 'Ventas netas acumuladas (MXN)', position: 'insideBottom', offset: -14, fontSize: 11 }} />
            <YAxis type="number" dataKey="y" domain={[0, 1]} ticks={[0, 0.5, 1]} tickFormatter={(value: number) => `${number(marginAxis.fromPlot(value), 0)}%`} tick={{ fontSize: 11 }} width={48} label={{ value: 'Margen bruto (%)', angle: -90, position: 'insideLeft', fontSize: 11 }} />
            <ZAxis type="number" dataKey="z" range={[14, 50]} domain={[0, sizeCap]} />
            <ReferenceLine x={0.5} stroke="#849b93" strokeDasharray="5 4" />
            <ReferenceLine y={0.5} stroke="#849b93" strokeDasharray="5 4" />
            <Tooltip cursor={false} content={({ active, payload }) => {
              const point = payload?.[0]?.payload as typeof points[number] | undefined;
              if (!active || !point) return null;
              return <div className="bi-profit-tooltip"><strong>{point.name}</strong><span>{profitGroups.find((group) => group.id === point.quadrant)?.title}</span><dl><dt>Ventas netas</dt><dd>{money(point.sales)}</dd><dt>Margen bruto</dt><dd>{money(point.margin)}</dd><dt>Margen bruto %</dt><dd>{number(point.marginPct, 1)}%</dd><dt>Pedidos confirmados</dt><dd>{point.orderCount == null ? 'No disponible' : number(point.orderCount)}</dd><dt>Última compra facturada</dt><dd>{formatDate(point.lastPurchaseDate)}</dd></dl></div>;
            }} />
            {profitGroups.map((group) => <Scatter key={group.id} name={group.title} data={points.filter((row) => row.quadrant === group.id)} fill={group.color} fillOpacity={0.85} stroke="#fff" strokeWidth={1} isAnimationActive={false} onClick={(entry) => setActive(String(entry.payload?.id))} />)}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      {selected ? <aside className="bi-profit-detail"><button type="button" className="bi-profit-close" onClick={() => setActive(null)} aria-label="Cerrar detalle de cliente">×</button><span className="bi-kicker">Detalle comercial</span><h5>{selected.name}</h5><span className={`bi-profit-segment bi-profit-segment-${selectedSegment}`}>{profitGroups.find((group) => group.id === selectedSegment)?.title}</span><dl><dt>Ventas netas</dt><dd>{money(selected.sales)}</dd><dt>Margen bruto</dt><dd>{money(selected.margin)}</dd><dt>Margen bruto %</dt><dd>{number(selected.marginPct, 1)}%</dd><dt>Pedidos confirmados</dt><dd>{selected.orderCount == null ? 'No disponible' : number(selected.orderCount)}</dd><dt>Última compra facturada</dt><dd>{formatDate(selected.lastPurchaseDate)}</dd></dl><small>Margen histórico de Análisis de facturas (`price_margin`); no se sustituye por el costo actual del producto.</small>{odooLink ? <a href={odooLink} target="_blank" rel="noopener noreferrer">Abrir cliente en Odoo ↗</a> : null}</aside> : null}
    </div>
    <div className="bi-profit-legend">{profitGroups.map((group) => <span key={group.id}><i style={{ background: group.color }} />{group.title} ({quadrantCounts.get(group.id)})</span>)}</div>
    <p className="bi-caption">Ventas altas: desde la mediana ({money(salesThreshold)}). Margen alto: desde {number(marginTarget, 1)}%. Un cliente exactamente en el umbral se clasifica como alto. Los ejes usan una escala adaptativa no lineal, con cada umbral en el centro, para que los valores extremos no oculten al resto; las etiquetas y el detalle muestran importes reales. El tamaño del punto representa el porcentaje de margen positivo y está limitado visualmente. El margen monetario procede de `price_margin` en Análisis de facturas.</p>
  </div>;
}
