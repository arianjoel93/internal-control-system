import { jsPDF } from "jspdf";

export type SupportReportChart = {
  title: string;
  kind: "bar" | "line";
  labels: string[];
  series: Array<{ label: string; color: string; values: number[] }>;
};

type SupportReportDocument = {
  month: string;
  agentName: string;
  dateRange: string;
  comparison: string;
  service: string;
  methodology: string;
  partialMonth: boolean;
  kpis: Array<{ label: string; current: string; comparison: string; change: string }>;
  charts: [SupportReportChart, SupportReportChart, SupportReportChart];
};

const ink = "#19334e";
const muted = "#495e74";
const left = 20;
const contentWidth = 170;

function drawChart(pdf: jsPDF, chart: SupportReportChart, top: number, plotHeight: number) {
  pdf.setFont("helvetica", "bold").setFontSize(13).setTextColor(ink);
  pdf.text(chart.title, left, top);
  const plotLeft = left + 12;
  const plotWidth = contentWidth - 14;
  const plotTop = top + 9;
  const plotBottom = plotTop + plotHeight;
  const largest = Math.max(0, ...chart.series.flatMap((series) => series.values));
  const tickSize = Math.max(1, Math.ceil(largest / 4));
  const tickCount = Math.max(1, Math.ceil(largest / tickSize));
  const max = tickSize * tickCount;
  const valueY = (value: number) => plotBottom - value / max * plotHeight;
  const step = plotWidth / chart.labels.length;
  const categoryX = (index: number) => plotLeft + step * (index + 0.5);
  pdf.setFont("helvetica", "normal").setFontSize(8).setTextColor(muted).setLineWidth(0.2);
  for (let index = 0; index <= tickCount; index += 1) {
    const value = index * tickSize;
    const y = valueY(value);
    pdf.setDrawColor("#dce5ef").line(plotLeft, y, plotLeft + plotWidth, y);
    pdf.text(String(value), plotLeft - 3, y + 1, { align: "right" });
  }
  const labelInterval = Math.ceil(chart.labels.length / 11);
  chart.labels.forEach((label, index) => {
    if (index % labelInterval === 0) {
      pdf.text(label, categoryX(index), plotBottom + 5, { align: "center" });
    }
  });

  const barWidth = Math.min(9, step * 0.65 / chart.series.length);
  let legendX = left;
  chart.series.forEach((series, seriesIndex) => {
    pdf.setFillColor(series.color).setDrawColor(series.color).setLineWidth(0.65);
    series.values.forEach((value, index) => {
      const x = categoryX(index);
      const y = valueY(value);
      if (chart.kind === "line") {
        if (index > 0) pdf.line(categoryX(index - 1), valueY(series.values[index - 1]), x, y);
        pdf.circle(x, y, 0.85, "F");
      } else if (value > 0) {
        const groupOffset = (seriesIndex - chart.series.length / 2) * barWidth;
        pdf.rect(x + groupOffset, y, barWidth - 0.4, plotBottom - y, "F");
      }
    });
    pdf.roundedRect(legendX, plotBottom + 10, 4, 3, 0.5, 0.5, "F");
    pdf.text(series.label, legendX + 6, plotBottom + 12.5);
    legendX += pdf.getTextWidth(series.label) + 15;
  });
}

export async function downloadSupportReportPdf(report: SupportReportDocument) {
  const response = await fetch("/tectronic-logo.png");
  if (!response.ok) throw new Error("No se pudo cargar el logo.");
  const logo = new Uint8Array(await response.arrayBuffer());
  const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
  pdf.setProperties({ title: "Reporte de servicios | Corporación Tectronic", author: "Corporación Tectronic" });
  const { width, height } = pdf.getImageProperties(logo);
  const logoScale = Math.min(64 / width, 24 / height);

  pdf.setFillColor("#edf4fa").rect(0, 0, 210, 83, "F");
  pdf.addImage(logo, "PNG", left, 20, width * logoScale, height * logoScale);
  pdf.setFont("helvetica", "normal").setFontSize(10).setTextColor(muted);
  pdf.text("CORPORACIÓN TECTRONIC  /  SOPORTES", left, 57);
  pdf.setFont("helvetica", "bold").setFontSize(28).setTextColor(ink);
  pdf.text("Reporte de servicios", left, 72);

  let y = 102;
  const fields = [
    ["Agente", report.agentName],
    ["Rango de fechas", report.dateRange],
    ["Tipo de reporte", `Actividad mensual · ${report.service}`],
    ["Mes de comparación", report.comparison],
    ["Objetivo", "Medir el volumen de servicios registrados, la actividad de revisión y la velocidad de cierre, y comparar los resultados con un mes anterior."],
  ];
  for (const [label, value] of fields) {
    pdf.setFont("helvetica", "bold").setFontSize(10).setTextColor(muted);
    pdf.text(label, left, y);
    pdf.setFont("helvetica", "normal").setFontSize(13).setTextColor(ink);
    const lines: string[] = pdf.splitTextToSize(value, contentWidth);
    pdf.text(lines, left, y + 7);
    y += 16 + lines.length * 5;
  }
  if (report.partialMonth) {
    pdf.setFontSize(9).setTextColor(muted);
    pdf.text("El mes analizado está en curso. El mes comparado se muestra completo.", left, y);
  }

  pdf.addPage();
  pdf.setFont("helvetica", "bold").setFontSize(20).setTextColor(ink);
  pdf.text("Indicadores y comparación mensual", left, 24);
  pdf.setFont("helvetica", "normal").setFontSize(9).setTextColor(muted);
  pdf.text(`${report.dateRange}  |  Comparación: ${report.comparison}`, left, 32);
  const columns = [left + 4, 111, 145, 184];
  pdf.setFillColor("#edf4fa").roundedRect(left, 40, contentWidth, 10, 2, 2, "F");
  pdf.setFont("helvetica", "bold").setTextColor(ink);
  pdf.text("Indicador", columns[0], 46.5);
  ["Período", "Comparación", "Variación"].forEach((label, index) => {
    pdf.text(label, columns[index + 1], 46.5, { align: "right" });
  });
  pdf.setFont("helvetica", "normal");
  report.kpis.forEach((kpi, index) => {
    const rowY = 57 + index * 9;
    pdf.setDrawColor("#dce5ef").setLineWidth(0.2).line(left, rowY + 3, left + contentWidth, rowY + 3);
    pdf.text(kpi.label, columns[0], rowY);
    [kpi.current, kpi.comparison, kpi.change].forEach((value, column) => {
      pdf.text(value, columns[column + 1], rowY, { align: "right" });
    });
  });
  drawChart(pdf, report.charts[0], 104, 51);
  drawChart(pdf, report.charts[1], 191, 51);

  pdf.addPage();
  pdf.setFont("helvetica", "bold").setFontSize(20).setTextColor(ink);
  pdf.text("Actividad diaria", left, 24);
  pdf.setFont("helvetica", "normal").setFontSize(9).setTextColor(muted);
  pdf.text(report.dateRange, left, 32);
  drawChart(pdf, report.charts[2], 54, 95);
  pdf.setFont("helvetica", "bold").setFontSize(11).setTextColor(ink);
  pdf.text("Cómo leer los indicadores", left, 190);
  pdf.setFont("helvetica", "normal").setFontSize(10).setTextColor(muted);
  pdf.text(pdf.splitTextToSize(report.methodology, contentWidth), left, 197);

  for (let page = 1; page <= pdf.getNumberOfPages(); page += 1) {
    pdf.setPage(page).setFont("helvetica", "normal").setFontSize(9).setTextColor(muted);
    pdf.setDrawColor("#dce5ef").setLineWidth(0.2).line(left, 278, left + contentWidth, 278);
    pdf.text("Corporación Tectronic", left, 284);
    pdf.text(String(page), left + contentWidth, 284, { align: "right" });
  }
  pdf.save(`tectronic-reporte-soportes-${report.month}.pdf`);
}
