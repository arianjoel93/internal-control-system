export type MarketingReportMetric = { label: string; value: string; note?: string };
export type MarketingReportBar = { label: string; value: number; display: string; comparison?: number; comparisonDisplay?: string };
export type MarketingReportChart =
  | { kind: 'bars'; title: string; note?: string; bars: MarketingReportBar[]; comparisonLabel?: string }
  | { kind: 'donut'; title: string; note?: string; value: number; total: number; primaryLabel: string; secondaryLabel: string }
  | { kind: 'trend'; title: string; note?: string; primaryLabel?: string; comparisonLabel?: string; points: Array<{ label: string; value: number; display: string; comparison?: number; comparisonDisplay?: string }> };
export type MarketingReportTable = { title: string; columns: string[]; rows: string[][] };
export type MarketingReportSection = {
  title: string;
  note?: string;
  metrics?: MarketingReportMetric[];
  charts?: MarketingReportChart[];
  tables?: MarketingReportTable[];
};
export type MarketingReportDocument = {
  title: string;
  period: string;
  scope: string;
  sections: MarketingReportSection[];
};

export function resolveMarketingReportAgentName(
  creatorId: number | null | undefined,
  creatorName: string | null | undefined,
  leads: Array<{ creatorId?: number | null; creatorName?: string | null }>,
) {
  return creatorName?.trim()
    || leads.find((lead) => lead.creatorId === creatorId && lead.creatorName?.trim())?.creatorName?.trim()
    || 'Agente de marketing';
}

const escapeHtml = (value: string | number) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character] ?? character);
const safePercent = (value: number, total: number) => total > 0 && Number.isFinite(value)
  ? Math.max(0, Math.min(100, value / total * 100)) : 0;

function renderBars(chart: Extract<MarketingReportChart, { kind: 'bars' }>) {
  const largest = Math.max(1, ...chart.bars.flatMap((bar) => [bar.value, bar.comparison ?? 0]));
  if (!chart.bars.length) return '<p class="empty">Sin datos para este corte.</p>';
  return `<div class="bars">${chart.bars.map((bar) => `<div class="bar-row"><span>${escapeHtml(bar.label)}</span><div class="tracks"><i style="width:${safePercent(bar.value, largest)}%"></i>${bar.comparison !== undefined ? `<em style="width:${safePercent(bar.comparison, largest)}%"></em>` : ''}</div><strong>${escapeHtml(bar.display)}${bar.comparisonDisplay !== undefined ? `<small>Anterior: ${escapeHtml(bar.comparisonDisplay)}</small>` : ''}</strong></div>`).join('')}</div>${chart.comparisonLabel ? `<p class="legend"><i></i> Actual <em></em> ${escapeHtml(chart.comparisonLabel)}</p>` : ''}`;
}

function renderDonut(chart: Extract<MarketingReportChart, { kind: 'donut' }>) {
  const share = safePercent(chart.value, chart.total);
  const circumference = 2 * Math.PI * 41;
  return `<div class="donut-layout"><svg viewBox="0 0 110 110" role="img" aria-label="${escapeHtml(chart.primaryLabel)}: ${share.toFixed(1)}%"><circle cx="55" cy="55" r="41" class="donut-base"/><circle cx="55" cy="55" r="41" class="donut-fill" stroke-dasharray="${circumference * share / 100} ${circumference}" transform="rotate(-90 55 55)"/><text x="55" y="59" text-anchor="middle">${share.toFixed(1)}%</text></svg><div><p><b>${escapeHtml(chart.primaryLabel)}</b><strong>${escapeHtml(chart.value)}</strong></p><p><b>${escapeHtml(chart.secondaryLabel)}</b><strong>${escapeHtml(Math.max(0, chart.total - chart.value))}</strong></p></div></div>`;
}

function renderTrend(chart: Extract<MarketingReportChart, { kind: 'trend' }>) {
  if (!chart.points.length) return '<p class="empty">Sin datos para este corte.</p>';
  const values = chart.points.flatMap((point) => [point.value, ...(point.comparison === undefined ? [] : [point.comparison])]);
  const top = Math.max(1, ...values);
  const bottom = Math.min(0, ...values);
  const x = (index: number) => chart.points.length === 1 ? 250 : 25 + index * 450 / (chart.points.length - 1);
  const y = (value: number) => 145 - (value - bottom) / (top - bottom) * 110;
  const path = (key: 'value' | 'comparison') => chart.points.map((point, index) => `${x(index)},${y(point[key] ?? 0)}`).join(' ');
  const comparison = chart.points.some((point) => point.comparison !== undefined);
  return `<svg class="trend" viewBox="0 0 500 170" role="img" aria-label="${escapeHtml(chart.title)}"><line x1="25" x2="475" y1="145" y2="145" class="axis"/><polyline points="${path('value')}" class="current"/>${comparison ? `<polyline points="${path('comparison')}" class="previous"/>` : ''}${chart.points.map((point, index) => `<circle cx="${x(index)}" cy="${y(point.value)}" r="3.5" class="current-dot"/>`).join('')}</svg><p class="legend"><i></i> ${escapeHtml(chart.primaryLabel ?? 'Serie principal')}${comparison ? `<em></em> ${escapeHtml(chart.comparisonLabel ?? 'Serie comparativa')}` : ''}</p><div class="trend-values">${chart.points.map((point) => `<div><span>${escapeHtml(point.label)}</span><strong>${escapeHtml(point.display)}</strong>${point.comparisonDisplay !== undefined ? `<small>${escapeHtml(chart.comparisonLabel ?? 'Comparación')}: ${escapeHtml(point.comparisonDisplay)}</small>` : ''}</div>`).join('')}</div>`;
}

function renderChart(chart: MarketingReportChart) {
  const content = chart.kind === 'bars' ? renderBars(chart) : chart.kind === 'donut' ? renderDonut(chart) : renderTrend(chart);
  return `<article class="chart"><h3>${escapeHtml(chart.title)}</h3>${chart.note ? `<p>${escapeHtml(chart.note)}</p>` : ''}${content}</article>`;
}

function renderTable(table: MarketingReportTable) {
  return `<div class="report-table"><h3>${escapeHtml(table.title)}</h3><div class="table-wrap"><table><thead><tr>${table.columns.map((column) => `<th>${escapeHtml(column)}</th>`).join('')}</tr></thead><tbody>${table.rows.map((row) => `<tr>${row.map((value) => `<td>${escapeHtml(value)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>${table.rows.length ? '' : '<p class="empty">Sin registros en el periodo.</p>'}</div>`;
}

export function buildMarketingReportHtml(report: MarketingReportDocument) {
  const sections = report.sections.map((section) => `<section><div class="section-head"><h2>${escapeHtml(section.title)}</h2>${section.note ? `<p>${escapeHtml(section.note)}</p>` : ''}</div>${section.metrics?.length ? `<div class="metrics">${section.metrics.map((metric) => `<article><span>${escapeHtml(metric.label)}</span><strong>${escapeHtml(metric.value)}</strong>${metric.note ? `<small>${escapeHtml(metric.note)}</small>` : ''}</article>`).join('')}</div>` : ''}${section.charts?.length ? `<div class="charts">${section.charts.map(renderChart).join('')}</div>` : ''}${section.tables?.map(renderTable).join('') ?? ''}</section>`).join('');
  return `<!doctype html><html lang="es-MX"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(report.title)}</title><style>
  :root{color-scheme:light}*{box-sizing:border-box}body{margin:0;padding:clamp(16px,3vw,32px);background:#f5f2ec;color:#233b37;font-family:Arial,sans-serif;line-height:1.45}main{max-width:1160px;margin:auto}header{padding:28px;background:#173f3b;color:#fff;border-radius:16px;margin-bottom:18px}header small{color:#bed6cf;letter-spacing:.1em;text-transform:uppercase}h1{margin:8px 0;font-size:30px}header p{margin:4px 0;color:#e2eee9}section{padding:22px;margin:0 0 18px;background:#fff;border:1px solid #dce6df;border-radius:16px;break-inside:avoid}h2{margin:0;font-size:20px}h3{margin:0 0 8px;font-size:16px}.section-head{margin-bottom:14px}.section-head p,.chart>p{color:#60746e;font-size:13px;margin:5px 0 12px}.metrics,.charts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.metrics{grid-template-columns:repeat(auto-fit,minmax(185px,1fr));margin:12px 0}.metrics article,.chart{min-width:0;padding:15px;border:1px solid #e0e8e2;border-radius:12px;background:#fcfdfb}.metrics span,.metrics small{display:block;color:#60746e;font-size:12px}.metrics strong{display:block;margin:5px 0;font-size:21px;overflow-wrap:anywhere}.bars{display:grid;gap:11px}.bar-row{display:grid;grid-template-columns:minmax(92px,1fr) minmax(90px,2fr) auto;align-items:center;gap:10px;font-size:12px}.bar-row span{overflow-wrap:anywhere}.bar-row strong{text-align:right}.bar-row small{display:block;color:#788780;font-weight:400}.tracks{display:grid;align-content:center;gap:3px;height:18px}.tracks i,.tracks em{height:6px;min-width:0;border-radius:10px;background:#397c70}.tracks em{background:#b5c4be}.legend{display:flex;align-items:center;gap:6px;font-size:11px;color:#60746e}.legend i,.legend em{width:14px;height:5px;border-radius:8px;background:#397c70}.legend em{background:#b5c4be}.donut-layout{display:flex;align-items:center;gap:22px}.donut-layout svg{width:126px;flex:0 0 126px}.donut-layout svg text{fill:#23453d;font-weight:700;font-size:17px}.donut-base,.donut-fill{fill:none;stroke-width:13}.donut-base{stroke:#e4ebe5}.donut-fill{stroke:#397c70}.donut-layout p{display:grid;gap:2px;margin:8px 0;font-size:13px}.donut-layout strong{font-size:18px}.trend{width:100%;height:auto}.trend .axis{stroke:#dbe3dd}.trend polyline{fill:none;stroke-width:3;stroke-linecap:round;stroke-linejoin:round}.trend .current{stroke:#397c70}.trend .previous{stroke:#b5c4be;stroke-dasharray:6 4}.trend .current-dot{fill:#397c70}.trend-values{display:flex;flex-wrap:wrap;gap:8px 16px;font-size:11px}.trend-values>div{display:grid}.trend-values span,.trend-values small{color:#60746e}.report-table{margin-top:16px}.table-wrap{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:12px}th,td{padding:8px;border-bottom:1px solid #e1e8e2;text-align:left}th{color:#397c70}.empty{color:#71817a;font-size:13px}footer{color:#667771;font-size:12px;padding:0 8px 18px}@media(max-width:700px){.charts{grid-template-columns:1fr}.bar-row{grid-template-columns:minmax(80px,1fr) minmax(75px,2fr) auto}section{padding:15px}}@media print{body{padding:0;background:#fff}main{max-width:none}header{border-radius:0}section{border-radius:0;box-shadow:none}.chart,.report-table{break-inside:avoid}a[href]:after{content:none}}
  @media print{section{break-inside:auto}.chart{break-inside:avoid}.report-table{break-inside:auto}tr{break-inside:avoid}}
  </style></head><body><main><header><small>Corporación Tectronic · Reporte de Marketing</small><h1>${escapeHtml(report.title)}</h1><p>${escapeHtml(report.period)}</p><p>${escapeHtml(report.scope)}</p></header>${sections}<footer>Reporte fijo generado con los filtros aplicados. Las coincidencias entre leads y facturas no prueban causalidad. No incluye correos ni teléfonos de contacto.</footer></main></body></html>`;
}
