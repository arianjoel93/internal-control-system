import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { EmptyState } from "../../components/EmptyState";
import { type SupportReportChart } from "./supportReportPdf";
import { getMySupportReportCases } from "./supportService";

type ReportCase = Awaited<ReturnType<typeof getMySupportReportCases>>[number];
type ServiceType = ReportCase["support_type"];

const serviceLabels: Record<ServiceType, string> = {
  technical: "Soporte técnico",
  programming: "Programación",
};
const serviceTypes = Object.keys(serviceLabels) as ServiceType[];
const numberFormat = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 1 });
const calendarZone = "America/Mexico_City";
const monthKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: calendarZone,
  year: "numeric",
  month: "2-digit",
});
const monthLabel = new Intl.DateTimeFormat("es-MX", {
  timeZone: "UTC",
  month: "short",
  year: "numeric",
});
const dayMs = 86_400_000;
const dayFormatter = new Intl.DateTimeFormat("es-MX", { timeZone: calendarZone, day: "numeric" });
const fullDate = new Intl.DateTimeFormat("es-MX", { timeZone: "UTC", dateStyle: "long" });
const methodology = "Los cierres cuentan una vez por folio, en la fecha de su primer movimiento de cierre. La mediana usa días naturales desde el registro. Las revisiones y pruebas cuentan una vez por folio al mes cuando hay un movimiento de tipo diagnóstico.";

function monthKey(date: number | Date) {
  const parts = monthKeyFormatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return `${year}-${month}`;
}

function monthOffset(month: string, offset: number) {
  const [year, number] = month.split("-").map(Number);
  return new Date(Date.UTC(year, number - 1 + offset, 1)).toISOString().slice(0, 7);
}

function labelForMonth(month: string) {
  return monthLabel.format(new Date(month + "-01T00:00:00Z"));
}

function emptyMonth() {
  return { registered: 0, registeredByDay: new Array<number>(32).fill(0), reviewed: 0, daysToClose: [] as number[] };
}

function summarize(cases: ReportCase[]) {
  const months = new Map<string, Record<ServiceType, ReturnType<typeof emptyMonth>>>();
  function bucket(date: number, type: ServiceType) {
    const key = monthKey(date);
    let month = months.get(key);
    if (!month) {
      month = { technical: emptyMonth(), programming: emptyMonth() };
      months.set(key, month);
    }
    return month[type];
  }

  for (const support of cases) {
    const created = Date.parse(support.created_at);
    if (!Number.isFinite(created)) continue;
    const opened = bucket(created, support.support_type);
    opened.registered += 1;
    opened.registeredByDay[Number(dayFormatter.format(created))] += 1;
    let firstClose = Infinity;
    const reviewMonths = new Set<string>();
    for (const event of support.support_events ?? []) {
      const date = Date.parse(event.event_date);
      if (!Number.isFinite(date) || date < created) continue;
      if (event.event_type === "closed") firstClose = Math.min(firstClose, date);
      if (event.event_type === "diagnosis") {
        const key = monthKey(date);
        if (!reviewMonths.has(key)) {
          bucket(date, support.support_type).reviewed += 1;
          reviewMonths.add(key);
        }
      }
    }
    if (Number.isFinite(firstClose)) {
      const closed = bucket(firstClose, support.support_type);
      closed.daysToClose.push((firstClose - created) / dayMs);
    }
  }
  return months;
}

function totals(
  month: Record<ServiceType, ReturnType<typeof emptyMonth>> | undefined,
  types: ServiceType[],
) {
  const records = types.map((type) => month?.[type] ?? emptyMonth());
  const times = records.flatMap((record) => record.daysToClose).sort((a, b) => a - b);
  const mid = Math.floor(times.length / 2);
  return {
    registered: records.reduce((sum, record) => sum + record.registered, 0),
    closed: times.length,
    reviewed: records.reduce((sum, record) => sum + record.reviewed, 0),
    typicalDays: times.length ? (times[mid] + times[Math.floor((times.length - 1) / 2)]) / 2 : null,
  };
}

export function SupportReports({ accountId, agentName }: { accountId: string; agentName: string }) {
  const currentMonth = monthKey(new Date());
  const [month, setMonth] = useState(currentMonth);
  const [comparison, setComparison] = useState("");
  const [dailyMode, setDailyMode] = useState<"total" | "byService">("total");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [service, setService] = useState<ServiceType | "all">("all");
  const query = useQuery({
    queryKey: ["support-reports", accountId],
    queryFn: getMySupportReportCases,
  });
  const months = useMemo(() => summarize(query.data ?? []), [query.data]);
  const comparisonMonth = comparison && comparison < month ? comparison : monthOffset(month, -1);
  const types = service === "all" ? serviceTypes : [service];
  const periods = new Set([currentMonth, month, comparisonMonth, ...months.keys()]);
  for (let offset = 1; offset < 12; offset += 1) periods.add(monthOffset(currentMonth, -offset));
  const choices = [...periods].filter((period) => period <= currentMonth).sort().reverse();
  const actual = totals(months.get(month), types);
  const baseline = totals(months.get(comparisonMonth), types);
  const trend = Array.from({ length: 6 }, (_, index) => {
    const key = monthOffset(month, index - 5);
    return { label: labelForMonth(key), ...totals(months.get(key), types) };
  });
  const byService = types.map((type) => ({
    label: serviceLabels[type],
    selected: totals(months.get(month), [type]).registered,
    comparison: totals(months.get(comparisonMonth), [type]).registered,
  }));
  const endDay = month === currentMonth
    ? Number(dayFormatter.format(new Date()))
    : new Date(Date.parse(monthOffset(month, 1) + "-01T00:00:00Z") - dayMs).getUTCDate();
  const daily = Array.from({ length: endDay }, (_, index) => {
    const day = index + 1;
    const count = (type: ServiceType) => months.get(month)?.[type].registeredByDay[day] ?? 0;
    return {
      label: String(day),
      total: types.reduce((sum, type) => sum + count(type), 0),
      technical: count("technical"),
      programming: count("programming"),
    };
  });
  const dailySeries = dailyMode === "total"
    ? [{ key: "total" as const, label: "Total", color: "#3469ab" }]
    : types.map((type) => ({
        key: type,
        label: serviceLabels[type],
        color: type === "technical" ? "#3469ab" : "#8661ad",
      }));
  const kpis = [
    { label: "Soportes registrados", value: actual.registered, prior: baseline.registered, unit: "" },
    { label: "Soportes cerrados", value: actual.closed, prior: baseline.closed, unit: "" },
    { label: "Folios con revisión o pruebas", value: actual.reviewed, prior: baseline.reviewed, unit: "" },
    { label: "Mediana hasta el cierre", value: actual.typicalDays, prior: baseline.typicalDays, unit: " días" },
  ];

  async function downloadReport() {
    setExporting(true);
    setExportError("");
    const formatKpi = (value: number | null, unit: string) =>
      value === null ? "Sin cierres" : numberFormat.format(value) + unit;
    const chart = <T extends { label: string }, K extends Exclude<keyof T, "label">>(
      title: string,
      kind: SupportReportChart["kind"],
      data: T[],
      series: Array<{ key: K; label: string; color: string }>,
    ): SupportReportChart => ({
      title,
      kind,
      labels: data.map((row) => row.label),
      series: series.map(({ key, label, color }) => ({ label, color, values: data.map((row) => Number(row[key])) })),
    });
    try {
      const { downloadSupportReportPdf } = await import("./supportReportPdf");
      const first = new Date(month + "-01T00:00:00Z");
      const last = new Date(first.getTime() + (endDay - 1) * dayMs);
      await downloadSupportReportPdf({
        month,
        agentName,
        dateRange: fullDate.formatRange(first, last),
        comparison: labelForMonth(comparisonMonth),
        service: service === "all" ? "Todos los servicios" : serviceLabels[service],
        methodology,
        partialMonth: month === currentMonth,
        kpis: kpis.map(({ label, value, prior, unit }) => ({
          label,
          current: formatKpi(value, unit),
          comparison: formatKpi(prior, unit),
          change: value === null || prior === null
            ? "—"
            : (value > prior ? "+" : "") + formatKpi(value - prior, unit),
        })),
        charts: [
          chart("Volumen de trabajo en seis meses", "bar", trend, [
            { key: "registered", label: "Registrados", color: "#3469ab" },
            { key: "closed", label: "Cerrados", color: "#178476" },
          ]),
          chart("Registros por tipo de servicio", "bar", byService, [
            { key: "selected", label: labelForMonth(month), color: "#3469ab" },
            { key: "comparison", label: labelForMonth(comparisonMonth), color: "#8661ad" },
          ]),
          chart("Soportes registrados por día", "line", daily, dailySeries),
        ],
      });
    } catch {
      setExportError("No se pudo descargar el PDF. Inténtalo de nuevo.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className="admin-section support-reports">
      <div className="admin-section-head">
        <div>
          <p className="eyebrow">Soportes</p>
          <h2>Reportes de servicios</h2>
          <p>Actividad de los soportes registrados por tu cuenta.</p>
        </div>
        <button type="button" disabled={!query.data || exporting} onClick={() => void downloadReport()}>
          <Download size={18} aria-hidden="true" />
          {exporting ? "Preparando PDF…" : "Descargar reporte"}
        </button>
      </div>
      {exportError ? <p role="alert" className="form-error">{exportError}</p> : null}
      {query.isPending ? (
        <EmptyState title="Cargando reportes">Consultando los registros de tu cuenta.</EmptyState>
      ) : query.isError ? (
        <EmptyState title="No se pudieron cargar los reportes">
          <button type="button" onClick={() => void query.refetch()}>Reintentar</button>
        </EmptyState>
      ) : months.size === 0 ? (
        <EmptyState title="Sin actividad">Los indicadores aparecerán cuando tu cuenta registre soportes.</EmptyState>
      ) : (
        <>
          <div className="panel support-report-filters">
            <label className="field">
              <span>Tipo de servicio</span>
              <select value={service} onChange={(event) => setService(event.target.value as typeof service)}>
                <option value="all">Todos los servicios</option>
                {serviceTypes.map((type) => <option key={type} value={type}>{serviceLabels[type]}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Mes analizado</span>
              <select value={month} onChange={(event) => setMonth(event.target.value)}>
                {choices.map((key) => <option key={key} value={key}>{labelForMonth(key)}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Comparar con</span>
              <select value={comparisonMonth} onChange={(event) => setComparison(event.target.value)}>
                {choices.filter((key) => key < month).map((key) => (
                  <option key={key} value={key}>{labelForMonth(key)}</option>
                ))}
              </select>
            </label>
          </div>
          {month === currentMonth ? <p className="support-report-note">El mes actual está en curso. El mes de comparación se muestra completo.</p> : null}
          <div className="support-report-kpis">
            {kpis.map(({ label, value, prior, unit }) => {
              const change = value === null || prior === null ? null : value - prior;
              return (
                <article className="panel support-report-kpi" key={label}>
                  <span>{label}</span>
                  <strong>{value === null ? "Sin cierres" : numberFormat.format(value) + unit}</strong>
                  <small>{labelForMonth(comparisonMonth)} · {prior === null ? "Sin cierres" : numberFormat.format(prior) + unit}</small>
                  {change === null ? null : <small>{change > 0 ? "+" : ""}{numberFormat.format(change)}{unit} frente al mes comparado</small>}
                </article>
              );
            })}
          </div>
          <div className="support-report-charts">
            <article className="panel support-report-chart">
              <h3>Volumen de trabajo en seis meses</h3>
              <ResponsiveContainer width="100%" height={270}>
                <BarChart data={trend} accessibilityLayer>
                  <CartesianGrid vertical={false} stroke="#e5ecf4" />
                  <XAxis dataKey="label" tickLine={false} />
                  <YAxis allowDecimals={false} width={34} tickLine={false} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="registered" name="Registrados" fill="#3469ab" radius={[5, 5, 0, 0]} />
                  <Bar dataKey="closed" name="Cerrados" fill="#178476" radius={[5, 5, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </article>
            <article className="panel support-report-chart">
              <h3>Registros por tipo de servicio</h3>
              <ResponsiveContainer width="100%" height={270}>
                <BarChart data={byService} accessibilityLayer>
                  <CartesianGrid vertical={false} stroke="#e5ecf4" />
                  <XAxis dataKey="label" tickLine={false} />
                  <YAxis allowDecimals={false} width={34} tickLine={false} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="selected" name={labelForMonth(month)} fill="#3469ab" radius={[5, 5, 0, 0]} />
                  <Bar dataKey="comparison" name={labelForMonth(comparisonMonth)} fill="#8661ad" radius={[5, 5, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </article>
          </div>
          <article className="panel support-report-chart">
            <div className="support-daily-heading">
              <h3>Soportes registrados por día</h3>
              <label className="field">
                <span>Vista diaria</span>
                <select value={dailyMode} onChange={(event) => setDailyMode(event.target.value as typeof dailyMode)}>
                  <option value="total">Total</option>
                  <option value="byService">Por tipo de soporte</option>
                </select>
              </label>
            </div>
            <ResponsiveContainer width="100%" height={270}>
              <LineChart data={daily} accessibilityLayer>
                <CartesianGrid vertical={false} stroke="#e5ecf4" />
                <XAxis dataKey="label" tickLine={false} />
                <YAxis allowDecimals={false} width={34} tickLine={false} />
                <Tooltip labelFormatter={(day) => `Día ${day}`} />
                <Legend />
                {dailySeries.map(({ key, label, color }) => (
                  <Line key={key} dataKey={key} name={label} stroke={color} strokeWidth={2} dot={{ r: 2 }} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </article>
          <p className="support-report-note">{methodology}</p>
        </>
      )}
    </section>
  );
}
