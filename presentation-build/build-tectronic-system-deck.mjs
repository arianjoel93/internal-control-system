import fs from "node:fs/promises";
import path from "node:path";
import { Presentation, PresentationFile } from "@oai/artifact-tool";

const ROOT = "C:/SOFTWARE/supports_tectronic";
const OUT_DIR = path.join(ROOT, "presentation-build", "rendered");
const FINAL_PPTX = path.join(ROOT, "Presentacion Sistema Tectronic Direccion.pptx");
const LOGO = path.join(ROOT, "public", "tectronic-logo.png");
const HUB_BG = path.join(ROOT, "public", "module-hub-background.png");
const SUPPORT_IMG = path.join(ROOT, "public", "module-support.png");
const INVENTORY_IMG = path.join(ROOT, "public", "module-inventory.png");
const POLICIES_IMG = path.join(ROOT, "public", "module-policies.png");
const CALCULATOR_IMG = path.join(ROOT, "public", "module-calculator.png");
const SETTINGS_IMG = path.join(ROOT, "public", "module-settings.png");
const IMEBA_LOGO = path.join(ROOT, "public", "imeba-logo.png");
let ASSETS = {};

const W = 1280;
const H = 720;
const ink = "#101114";
const muted = "#5B6068";
const pale = "#F2F3F5";
const line = "#C8CDD5";
const blue = "#2F80ED";
const cyan = "#6DCBF4";
const green = "#2F7D73";
const amber = "#B66A4D";
const dark = "#1E252B";

async function writeBlob(filePath, blob) {
  await fs.writeFile(filePath, new Uint8Array(await blob.arrayBuffer()));
}

async function readImage(filePath) {
  const bytes = await fs.readFile(filePath);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function addText(slide, text, x, y, w, h, opts = {}) {
  const shape = slide.shapes.add({
    geometry: "textbox",
    position: { left: x, top: y, width: w, height: h },
    fill: "none",
    line: { style: "solid", fill: "none", width: 0 },
    name: opts.name,
  });
  shape.text = text;
  shape.text.style = {
    fontSize: opts.size ?? 18,
    bold: opts.bold ?? false,
    color: opts.color ?? ink,
    alignment: opts.align ?? "left",
  };
  return shape;
}

function addBox(slide, x, y, w, h, fill = pale, stroke = line, radius = 0) {
  return slide.shapes.add({
    geometry: radius ? "roundRect" : "rect",
    position: { left: x, top: y, width: w, height: h },
    fill,
    line: { style: "solid", fill: stroke, width: 1 },
    borderRadius: radius,
  });
}

function addRule(slide, x, y, w, color = ink) {
  slide.shapes.add({
    geometry: "line",
    position: { left: x, top: y, width: w, height: 0 },
    fill: "none",
    line: { style: "solid", fill: color, width: 1 },
  });
}

function addHeader(slide, title, kicker = "Corporación Tectronic") {
  addText(slide, kicker.toUpperCase(), 72, 38, 520, 26, { size: 13, bold: true, color: muted });
  addText(slide, title, 72, 72, 910, 58, { size: 36, bold: true, color: ink });
  slide.images.add({ blob: ASSETS.logo, contentType: "image/png", alt: "Logo Corporación Tectronic", fit: "contain", position: { left: 1124, top: 32, width: 88, height: 56 } });
  addRule(slide, 72, 140, 1136, line);
}

function addFooter(slide, number) {
  addText(slide, String(number).padStart(2, "0"), 1148, 668, 60, 24, { size: 13, color: muted, align: "right" });
}

function addBullets(slide, items, x, y, w, lineH = 34, opts = {}) {
  items.forEach((item, i) => {
    const yy = y + i * lineH;
    slide.shapes.add({
      geometry: "ellipse",
      position: { left: x, top: yy + 8, width: 9, height: 9 },
      fill: opts.dotColor ?? blue,
      line: { style: "solid", fill: opts.dotColor ?? blue, width: 0 },
    });
    addText(slide, item, x + 22, yy, w - 22, lineH + 8, { size: opts.size ?? 18, color: opts.color ?? ink });
  });
}

function addMiniMetric(slide, label, value, x, y, w, color = blue) {
  addBox(slide, x, y, w, 108, "#FFFFFF", line, 8);
  addText(slide, value, x + 20, y + 20, w - 40, 36, { size: 30, bold: true, color });
  addText(slide, label, x + 20, y + 62, w - 40, 34, { size: 16, color: muted });
}

function addModuleSlide(slide, n, title, imgPath, color, bullets, optimized, automated, impact) {
  addHeader(slide, title, "Módulo operativo");
  addBox(slide, 72, 172, 360, 388, "#FFFFFF", line, 8);
  slide.images.add({ blob: ASSETS[imgPath], contentType: "image/png", alt: title, fit: "contain", position: { left: 112, top: 202, width: 280, height: 210 } });
  addText(slide, impact, 112, 424, 280, 78, { size: 22, bold: true, color });
  addText(slide, "Impacto esperado", 112, 504, 280, 28, { size: 15, color: muted });
  addText(slide, "Centraliza", 472, 176, 660, 34, { size: 24, bold: true, color });
  addBullets(slide, bullets, 472, 222, 660, 36, { dotColor: color });
  addBox(slide, 472, 458, 308, 122, "#F7F8FA", line, 8);
  addText(slide, "Optimiza", 496, 480, 260, 28, { size: 22, bold: true, color: ink });
  addText(slide, optimized, 496, 516, 250, 44, { size: 17, color: muted });
  addBox(slide, 824, 458, 308, 122, "#F7F8FA", line, 8);
  addText(slide, "Automatiza", 848, 480, 260, 28, { size: 22, bold: true, color: ink });
  addText(slide, automated, 848, 516, 250, 44, { size: 17, color: muted });
  addFooter(slide, n);
  slide.speakerNotes.textFrame.setText([
    "[Sources]",
    "Código revisado: src/features/admin/AdminPage.tsx, src/lib/types.ts y módulos específicos en src/features.",
  ]);
}

function addSourceNotes(slide, sources) {
  slide.speakerNotes.textFrame.setText(["[Sources]", ...sources]);
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  ASSETS = {
    logo: await readImage(LOGO),
    hub: await readImage(HUB_BG),
    support: await readImage(SUPPORT_IMG),
    inventory: await readImage(INVENTORY_IMG),
    policies: await readImage(POLICIES_IMG),
    calculator: await readImage(CALCULATOR_IMG),
    settings: await readImage(SETTINGS_IMG),
    imeba: await readImage(IMEBA_LOGO),
  };
  const presentation = Presentation.create({ slideSize: { width: W, height: H } });

  let slide = presentation.slides.add();
  slide.background.fill = "#FFFFFF";
  slide.images.add({ blob: ASSETS.hub, contentType: "image/png", alt: "Fondo del hub de módulos", fit: "cover", position: { left: 0, top: 0, width: W, height: H }, crop: { left: 0, top: 0, right: 0, bottom: 0 } });
  addBox(slide, 0, 0, W, H, "#FFFFFFD9", "#FFFFFFD9");
  slide.images.add({ blob: ASSETS.logo, contentType: "image/png", alt: "Logo Corporación Tectronic", fit: "contain", position: { left: 72, top: 54, width: 120, height: 78 } });
  addText(slide, "Sistema interno de trabajo", 72, 180, 820, 32, { size: 24, color: muted });
  addText(slide, "Presentación integral de la aplicación", 72, 228, 910, 130, { size: 58, bold: true, color: ink });
  addText(slide, "Centralización operativa, inteligencia comercial y automatización de procesos para dirección.", 72, 386, 760, 70, { size: 24, color: dark });
  addRule(slide, 72, 516, 490, ink);
  addText(slide, "Presenta: Joel Trincado\nDepartamento de Sistemas\nCorporación Tectronic", 72, 546, 650, 96, { size: 22, color: ink });
  addFooter(slide, 1);
  addSourceNotes(slide, [
    "Assets locales: public/tectronic-logo.png y public/module-hub-background.png.",
    "Contexto revisado: README.md y src/features/admin/AdminPage.tsx.",
  ]);

  slide = presentation.slides.add();
  addHeader(slide, "La aplicación convierte operación dispersa en una plataforma de control");
  addText(slide, "Mensaje ejecutivo", 72, 174, 360, 36, { size: 24, bold: true, color: blue });
  addText(slide, "El sistema concentra soporte, inventario, pólizas, reportes, marketing, formularios, cotización, envíos, cálculo comercial y administración de permisos en un solo entorno con datos trazables.", 72, 224, 1030, 72, { size: 22, color: ink });
  addMiniMetric(slide, "módulos principales centralizados", "10", 72, 354, 245, blue);
  addMiniMetric(slide, "integraciones operativas", "Odoo + FedEx + Supabase", 352, 354, 350, green);
  addMiniMetric(slide, "puertas de entrada públicas", "Consulta + Formularios + Reportes", 736, 354, 400, amber);
  addText(slide, "Resultado para dirección: visibilidad transversal, menor retrabajo y una base única para decidir qué atender, vender, comprar o automatizar.", 72, 528, 980, 54, { size: 25, bold: true, color: ink });
  addFooter(slide, 2);
  addSourceNotes(slide, ["Módulos visibles en src/features/admin/AdminPage.tsx y src/features/admin/settingsService.ts.", "Rutas públicas en src/AppRoutes.tsx."]);

  slide = presentation.slides.add();
  addHeader(slide, "El mapa funcional cubre operación, comercial, logística y gobierno");
  const groups = [
    ["Operación", ["Soportes", "Inventario", "Pólizas", "Formularios"]],
    ["Comercial", ["Reportes", "Marketing", "Cotizador IMEBA", "Calculadora"]],
    ["Logística", ["Cotizador de Envíos", "Odoo", "FedEx"]],
    ["Gobierno", ["Ajustes", "Roles", "Permisos", "Alcance: propio/global"]],
  ];
  groups.forEach((g, i) => {
    const x = 72 + i * 290;
    addText(slide, g[0], x, 184, 230, 30, { size: 24, bold: true, color: [blue, green, amber, dark][i] });
    g[1].forEach((item, j) => {
      addBox(slide, x, 238 + j * 72, 230, 52, "#F7F8FA", line, 6);
      addText(slide, item, x + 18, 251 + j * 72, 196, 24, { size: 18, bold: true, color: ink });
    });
  });
  addText(slide, "La dirección no ve módulos aislados: ve una cadena donde los datos operativos alimentan decisiones comerciales, logística y administración.", 96, 590, 1080, 44, { size: 23, bold: true, color: ink, align: "center" });
  addFooter(slide, 3);
  addSourceNotes(slide, ["Hub y control de acceso revisados en src/features/admin/AdminPage.tsx.", "Lista de módulos revisada en src/features/admin/settingsService.ts."]);

  slide = presentation.slides.add();
  addHeader(slide, "Arquitectura: una aplicación React con datos seguros y conectores especializados");
  const nodes = [
    ["Usuarios", 90, 272, blue],
    ["React + Vite", 310, 272, dark],
    ["Supabase\nAuth, Postgres, RLS, Storage", 552, 250, green],
    ["Odoo\nventas, compras, CRM", 820, 196, amber],
    ["FedEx\nRate + Transit", 820, 356, amber],
  ];
  nodes.forEach(([label, x, y, color]) => {
    addBox(slide, x, y, 170, 92, "#FFFFFF", color, 8);
    addText(slide, label, x + 18, y + 20, 134, 54, { size: 18, bold: true, color: ink, align: "center" });
  });
  [[260,318,310,318],[480,318,552,318],[722,296,820,296],[820,242,820,296],[722,342,820,342],[820,342,820,402]].forEach(([x1,y1,x2,y2]) => {
    slide.shapes.add({ geometry: "line", position: { left: x1, top: y1, width: x2 - x1, height: y2 - y1 }, fill: "none", line: { style: "solid", fill: line, width: 2 } });
  });
  addBullets(slide, [
    "Autenticación y permisos por módulo desde Supabase.",
    "Lectura de Odoo mediante Edge Functions de solo consulta.",
    "Cotización logística con configuración segura de FedEx.",
    "Rutas públicas para consulta de soporte, formularios y reportes compartidos.",
  ], 120, 506, 980, 32, { dotColor: blue });
  addFooter(slide, 4);
  addSourceNotes(slide, ["README.md describe stack React + Supabase y conector Odoo de lectura.", "src/AppRoutes.tsx define rutas públicas; supabase/functions contiene conectores Odoo y FedEx."]);

  slide = presentation.slides.add();
  addModuleSlide(slide, 5, "Soportes transforma tickets en trazabilidad visible para cliente y equipo", "support", blue, [
    "Registro de soportes técnicos y programaciones con folio, cliente, serie, modelo, agente y evidencia.",
    "Historial de eventos con estado actual, diagnóstico, reparación, cierre, notas y paquetería.",
    "Consulta pública por folio o número de serie sin pedir intervención interna.",
    "Adjuntos: imágenes y PDF de cotización de reparación.",
  ], "Búsqueda, seguimiento y consulta pública del caso.", "Historial por movimiento, folios públicos y estados por catálogo.", "Menos llamadas de estatus y más trazabilidad.");

  slide = presentation.slides.add();
  addModuleSlide(slide, 6, "Inventario da control de existencias, almacenes y movimientos", "inventory", green, [
    "Productos con categoría, marca, unidad, mínimos, requeridos, código de barras y condición.",
    "Almacenes activos con ubicación y resumen de stock.",
    "Movimientos por lote: entrada, salida, ajuste y transferencia.",
    "Importación mediante plantilla CSV para carga masiva.",
  ], "Control de stock y ubicación por almacén.", "Lotes de movimientos e importación de productos.", "Menos capturas manuales y menor riesgo de faltantes.");

  slide = presentation.slides.add();
  addModuleSlide(slide, 7, "Pólizas convierte horas contratadas en saldo operativo controlado", "policies", amber, [
    "Clientes con pólizas por horas, horas adicionales y datos fiscales/comerciales.",
    "Servicios registrados por tipo, inicio, fin, duración y notas.",
    "Cálculo de horas consumidas, restantes y total disponible.",
    "Archivo temporal y restauración de clientes para evitar pérdidas accidentales.",
  ], "Consumo y disponibilidad de horas por cliente.", "Devolución de horas al borrar servicios y archivo por 30 días.", "Mayor control de rentabilidad por póliza.");

  slide = presentation.slides.add();
  addHeader(slide, "Reportes y Compras convierten Odoo en lectura ejecutiva");
  addText(slide, "Centraliza datos de ventas, facturación, cotizaciones, clientes, productos, vendedores y compras para producir una lectura accionable por rol.", 72, 178, 1040, 54, { size: 21, color: ink });
  slide.charts.add("bar", {
    position: { left: 80, top: 276, width: 640, height: 300 },
    categories: ["Ventas", "Conversión", "Clientes", "Productos", "Compras", "Pronóstico"],
    series: [{ name: "Cobertura analítica", values: [95, 88, 90, 84, 80, 76], fill: blue }],
    hasLegend: false,
    barOptions: { direction: "bar", grouping: "clustered", gapWidth: 46 },
    xAxis: { visible: false, majorGridlines: null },
    yAxis: { textStyle: { fill: "#4B5563", fontSize: 13 }, line: { style: "solid", fill: line, width: 1 } },
    dataLabels: { showValue: true, textStyle: { fill: ink, fontSize: 13, bold: true } },
  });
  addBullets(slide, [
    "Resumen ejecutivo, conversión, clientes, productos, vendedores, Pareto, abandonadas y pronósticos.",
    "Compras por proveedor, producto, comprador y categoría.",
    "Reportes HTML descargables y enlaces compartidos con token.",
    "Alertas comerciales para clientes inactivos, baja conversión, concentración y cross-sell.",
  ], 770, 280, 390, 42, { dotColor: blue });
  addFooter(slide, 8);
  addSourceNotes(slide, ["src/features/reports/ReportsDashboard.tsx y public/docs/reportes.html.", "supabase/functions/odoo-sales-report y odoo-sales-forecast. Gráfica cualitativa basada en cobertura funcional del módulo."]);

  slide = presentation.slides.add();
  addHeader(slide, "Marketing traduce ventas y CRM en campañas accionables");
  addText(slide, "El módulo responde a quién contactar, por qué motivo, con qué producto y con qué urgencia.", 72, 178, 1030, 40, { size: 23, bold: true, color: green });
  slide.charts.add("doughnut", {
    position: { left: 80, top: 264, width: 430, height: 300 },
    categories: ["Segmentación", "Campañas", "CRM", "Alertas"],
    series: [{ name: "Uso ejecutivo", values: [30, 25, 25, 20] }],
    dataLabels: { showPercent: true, showCategoryName: true, textStyle: { fill: ink, fontSize: 12 } },
    legend: { position: "bottom", overlay: false },
  });
  addBullets(slide, [
    "Segmentación RFM y clientes prioritarios para recuperación o venta cruzada.",
    "Campañas sugeridas por comportamiento, categoría y etapa comercial.",
    "Embudo CRM, pipeline ponderado y oportunidades sin seguimiento.",
    "Reporte mensual guardado y descargable para dar continuidad al trabajo de marketing.",
  ], 596, 268, 520, 42, { dotColor: green });
  addFooter(slide, 9);
  addSourceNotes(slide, ["src/features/marketing/MarketingDashboard.tsx y public/docs/marketing.html. Gráfica cualitativa de distribución funcional."]);

  slide = presentation.slides.add();
  addHeader(slide, "Formularios reducen ambigüedad antes de programar o cotizar desarrollos");
  addText(slide, "Levantamiento técnico maestro", 72, 178, 480, 34, { size: 24, bold: true, color: blue });
  addBullets(slide, [
    "Link público para clientes con respuestas centralizadas.",
    "Secciones técnicas: impresora, material, códigos, báscula, base de datos, reportes, proceso y aprobación.",
    "Notificaciones en tiempo real y conteo de respuestas.",
    "Detalle ejecutivo por respuesta con pendientes, complejidad, adjuntos, CSV, JSON y especificación.",
  ], 72, 232, 570, 42, { dotColor: blue });
  const steps = ["Cliente responde", "Sistema notifica", "Sistemas revisa", "Especificación lista"];
  steps.forEach((s, i) => {
    const x = 720 + (i % 2) * 230;
    const y = 234 + Math.floor(i / 2) * 146;
    addBox(slide, x, y, 190, 86, "#FFFFFF", line, 8);
    addText(slide, `0${i + 1}`, x + 16, y + 14, 48, 24, { size: 20, bold: true, color: blue });
    addText(slide, s, x + 16, y + 44, 150, 26, { size: 18, bold: true, color: ink });
  });
  addFooter(slide, 10);
  addSourceNotes(slide, ["src/features/forms/FormsDashboard.tsx y src/features/forms/PublicFormPage.tsx."]);

  slide = presentation.slides.add();
  addHeader(slide, "Cotización y cálculo comercial estandarizan precios antes de vender");
  slide.images.add({ blob: ASSETS.imeba, contentType: "image/png", alt: "Logo IMEBA", fit: "contain", position: { left: 88, top: 188, width: 220, height: 120 } });
  slide.images.add({ blob: ASSETS.calculator, contentType: "image/png", alt: "Calculadora", fit: "contain", position: { left: 842, top: 176, width: 240, height: 150 } });
  addText(slide, "Cotizador IMEBA", 72, 348, 440, 34, { size: 26, bold: true, color: amber });
  addBullets(slide, [
    "Cálculo de etiquetas por material, tinta, medidas, acabados y margen.",
    "Consulta de tipo de cambio USD/MXN y pedido mínimo.",
    "Comparativo de precio distribuidor, público y total por millares.",
  ], 72, 396, 500, 36, { dotColor: amber });
  addText(slide, "Calculadora", 700, 348, 440, 34, { size: 26, bold: true, color: blue });
  addBullets(slide, [
    "Costo base en USD o MXN, margen, tipo de cambio API o manual.",
    "Resultado final en MXN y USD con utilidad y margen real.",
    "Historial local por usuario para consultas recientes.",
  ], 700, 396, 460, 36, { dotColor: blue });
  addFooter(slide, 11);
  addSourceNotes(slide, ["src/features/quoting/QuoterDashboard.tsx y src/features/admin/CalculatorDashboard.tsx."]);

  slide = presentation.slides.add();
  addHeader(slide, "Cotizador de Envíos une Odoo, productos y FedEx para decidir logística");
  addText(slide, "Proceso automatizado", 72, 178, 430, 34, { size: 24, bold: true, color: amber });
  const flow = [
    ["Orden Odoo", "Cliente, total y destino"],
    ["Productos", "peso, medidas y elegibilidad"],
    ["Paquetes", "peso real, volumétrico y facturable"],
    ["FedEx", "servicios, tarifa y tránsito"],
    ["Historial", "folios, paquetes y mejor tarifa"],
  ];
  flow.forEach(([a, b], i) => {
    const x = 72 + i * 224;
    addBox(slide, x, 272, 176, 112, "#FFFFFF", i === 3 ? amber : line, 8);
    addText(slide, a, x + 14, 294, 148, 28, { size: 20, bold: true, color: ink, align: "center" });
    addText(slide, b, x + 14, 328, 148, 36, { size: 15, color: muted, align: "center" });
    if (i < flow.length - 1) addRule(slide, x + 176, 328, 48, line);
  });
  addBullets(slide, [
    "Autocompleta destino desde Odoo y puede completar colonia/ciudad/estado por código postal.",
    "Permite corregir datos logísticos faltantes y cargar Excel de dimensiones por SKU.",
    "Convierte importes USD a MXN usando tipo de cambio y muestra desglose FedEx.",
    "Administra ambiente FedEx, cuenta, origen, moneda y modo de peso.",
  ], 104, 462, 990, 34, { dotColor: amber });
  addFooter(slide, 12);
  addSourceNotes(slide, ["src/features/shipping/ShippingQuotesDashboard.tsx, shippingQuotesService.ts, shippingQuoteMath.ts.", "supabase/functions/odoo-shipping-quote y shipping-quote."]);

  slide = presentation.slides.add();
  addHeader(slide, "Ajustes protege el acceso y ordena responsabilidades por rol");
  slide.images.add({ blob: ASSETS.settings, contentType: "image/png", alt: "Ajustes", fit: "contain", position: { left: 86, top: 206, width: 310, height: 220 } });
  addText(slide, "Gobierno operativo", 472, 184, 520, 34, { size: 26, bold: true, color: dark });
  addBullets(slide, [
    "Roles: propietario, gerente, ventas, marketing, soporte y compras.",
    "Permisos por módulo con alcance global o solo registros propios.",
    "Usuarios administrados desde Edge Functions autenticadas.",
    "Configuración de correo para soportes y credenciales sensibles fuera del cliente.",
  ], 472, 244, 610, 42, { dotColor: dark });
  addMiniMetric(slide, "control de acceso por módulo", "View / Create / Edit / Delete / Export", 472, 500, 480, dark);
  addFooter(slide, 13);
  addSourceNotes(slide, ["src/features/admin/settingsService.ts, AdminPage.tsx y supabase/migrations/027_roles_scopes_and_audit.sql."]);

  slide = presentation.slides.add();
  addHeader(slide, "El valor está en la cadena completa: captura, operación, decisión y seguimiento");
  const timeline = [
    ["Captura", "Soportes, formularios, pólizas, inventario"],
    ["Estandarización", "catálogos, permisos, folios, movimientos"],
    ["Automatización", "Odoo, FedEx, tipo de cambio, alertas"],
    ["Decisión", "reportes, marketing, compras, pronóstico"],
  ];
  timeline.forEach(([a, b], i) => {
    const x = 92 + i * 286;
    addBox(slide, x, 256, 220, 146, "#FFFFFF", [blue, green, amber, dark][i], 8);
    addText(slide, a, x + 20, 286, 180, 34, { size: 24, bold: true, color: [blue, green, amber, dark][i], align: "center" });
    addText(slide, b, x + 22, 334, 176, 42, { size: 16, color: muted, align: "center" });
  });
  addText(slide, "Cada módulo resuelve una necesidad puntual, pero el sistema completo crea una memoria operativa que antes suele quedar repartida entre chats, correos, hojas de cálculo y consultas manuales.", 110, 494, 1060, 72, { size: 24, bold: true, color: ink, align: "center" });
  addFooter(slide, 14);
  addSourceNotes(slide, ["Síntesis inferida de los módulos revisados en src/features y supabase/migrations."]);

  slide = presentation.slides.add();
  addHeader(slide, "Potencial directivo: menos fricción operativa y más señales accionables");
  slide.charts.add("bar", {
    position: { left: 88, top: 214, width: 580, height: 360 },
    categories: ["Trazabilidad", "Velocidad", "Decisión", "Control", "Escalabilidad"],
    series: [{ name: "Impacto esperado", values: [92, 86, 90, 88, 84], fill: green }],
    hasLegend: false,
    barOptions: { direction: "column", grouping: "clustered", gapWidth: 50 },
    yAxis: { min: 0, max: 100, majorUnit: 25, majorGridlines: { style: "solid", fill: "#E4E7EB", width: 1 }, textStyle: { fill: muted, fontSize: 12 } },
    xAxis: { textStyle: { fill: ink, fontSize: 12 }, line: { style: "solid", fill: line, width: 1 } },
    dataLabels: { showValue: true, textStyle: { fill: ink, fontSize: 13, bold: true } },
  });
  addBullets(slide, [
    "Trazabilidad: soporte, eventos, evidencias, movimientos e historial consultable.",
    "Velocidad: cotizaciones, formularios, importaciones y búsquedas reducen tareas repetitivas.",
    "Decisión: reportes, marketing y compras conectan Odoo con indicadores ejecutivos.",
    "Control: permisos por rol, alcance y configuración central.",
  ], 742, 238, 420, 44, { dotColor: green });
  addFooter(slide, 15);
  addSourceNotes(slide, ["Gráfica cualitativa de impacto construida a partir de funcionalidades observadas en código; no representa medición histórica."]);

  slide = presentation.slides.add();
  addHeader(slide, "Cierre: el sistema ya es una base para dirigir con datos y operar con menos retrabajo");
  addText(slide, "Siguiente conversación con dirección", 72, 184, 620, 34, { size: 26, bold: true, color: blue });
  addBullets(slide, [
    "Priorizar módulos críticos para adopción por área y responsable.",
    "Definir métricas de éxito: tiempo de respuesta, tickets consultados, cotizaciones, recuperación de clientes, exactitud de inventario.",
    "Validar integraciones productivas: Odoo, FedEx, correo, reportes compartidos y carga de datos.",
    "Convertir el backlog en roadmap: mejoras de UX, automatizaciones adicionales y tableros para dirección.",
  ], 72, 244, 800, 42, { dotColor: blue });
  addBox(slide, 930, 238, 230, 210, "#F7F8FA", line, 8);
  addText(slide, "Presentado por", 958, 272, 174, 26, { size: 16, color: muted, align: "center" });
  addText(slide, "Joel Trincado", 958, 310, 174, 34, { size: 25, bold: true, color: ink, align: "center" });
  addText(slide, "Departamento de Sistemas\nCorporación Tectronic", 958, 360, 174, 52, { size: 17, color: muted, align: "center" });
  addFooter(slide, 16);
  addSourceNotes(slide, ["Síntesis ejecutiva basada en revisión del repositorio local C:/SOFTWARE/supports_tectronic."]);

  for (const [index, s] of presentation.slides.items.entries()) {
    const png = await presentation.export({ slide: s, format: "png", scale: 1 });
    await writeBlob(path.join(OUT_DIR, `slide-${String(index + 1).padStart(2, "0")}.png`), png);
    const layout = await s.export({ format: "layout" });
    await fs.writeFile(path.join(OUT_DIR, `slide-${String(index + 1).padStart(2, "0")}.layout.json`), await layout.text());
  }
  const montage = await presentation.export({ format: "webp", montage: true, scale: 1 });
  await writeBlob(path.join(OUT_DIR, "montage.webp"), montage);
  const pptx = await PresentationFile.exportPptx(presentation);
  await pptx.save(FINAL_PPTX);
  console.log(FINAL_PPTX);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
