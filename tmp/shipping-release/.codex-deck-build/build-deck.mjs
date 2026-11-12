import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { FileBlob, PresentationFile } from "@oai/artifact-tool";
const { finalizePresentation } = await import(pathToFileURL("C:/Users/Johana/.codex/plugins/cache/openai-primary-runtime/presentations/26.909.12148/skills/presentations/container_tools/artifact_tool_utils.mjs").href);

const workspace = "C:/SOFTWARE/supports_tectronic";
const buildDir = path.join(workspace, ".codex-deck-build");
const outputDir = path.join(workspace, "artifacts");
const containerTools = "C:/Users/Johana/.codex/plugins/cache/openai-primary-runtime/presentations/26.909.12148/skills/presentations/container_tools";
const pythonExecutable = "C:/Users/Johana/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe";
const templatePath = "C:/Users/Johana/.codex/plugins/cache/openai-curated-remote/openai-templates/0.1.1/skills/artifact-template-team-alignment/assets/reference.pptx";
const candidatePath = path.join(buildDir, "cotizador-envios-presentacion.pptx");
const finalPath = path.join(outputDir, "cotizador-envios-presentacion-20260918.pptx");

const p = await PresentationFile.importPptx(await FileBlob.load(templatePath));
const font = "Arial";

const C = {
  navy: "#2D607C",
  ink: "#17324A",
  teal: "#7FA4A6",
  tealDark: "#3E707A",
  sand: "#E9E0CF",
  sand2: "#F3EEE6",
  paper: "#FCFBF8",
  white: "#FFFFFF",
  orange: "#C47B4D",
  green: "#6B8E66",
  yellow: "#D1A84B",
  red: "#B85C5C",
  muted: "#6B7880",
  line: "#D8E0E1",
  dark: "#203A4D",
};

const W = 1280;
const H = 720;
const FONT = font;

function pos(left, top, width, height) { return { left, top, width, height }; }

function addShape(slide, geometry, left, top, width, height, fill = "none", lineFill = "none", lineWidth = 0) {
  return slide.shapes.add({
    geometry,
    position: pos(left, top, width, height),
    fill,
    line: { style: "solid", fill: lineFill, width: lineWidth },
  });
}

function addText(slide, text, left, top, width, height, style = {}) {
  const shape = addShape(slide, "textbox", left, top, width, height, "none", "none", 0);
  shape.text = text;
  shape.text.style = {
    typeface: FONT,
    fontSize: style.fontSize ?? 18,
    color: style.color ?? C.ink,
    bold: style.bold ?? false,
    italic: style.italic ?? false,
    alignment: style.alignment ?? "left",
    verticalAlignment: style.verticalAlignment ?? "middle",
    autoFit: "shrinkTextOnOverflow",
    marginLeft: style.marginLeft ?? 0,
    marginRight: style.marginRight ?? 0,
    marginTop: style.marginTop ?? 0,
    marginBottom: style.marginBottom ?? 0,
  };
  return shape;
}

function addLine(slide, x1, y1, x2, y2, color = C.line, width = 1.5) {
  return addShape(slide, "line", x1, y1, x2 - x1, y2 - y1, "none", color, width);
}

function addArrow(slide, x, y, width, color = C.tealDark) {
  addShape(slide, "rightArrow", x, y, width, 24, color, color, 0);
}

function addPill(slide, text, left, top, width, color = C.sand, textColor = C.ink) {
  addShape(slide, "roundRect", left, top, width, 30, color, color, 0);
  addText(slide, text, left + 10, top + 2, width - 20, 26, { fontSize: 13, color: textColor, bold: true, alignment: "center" });
}

function addCard(slide, left, top, width, height, title, body, accent = C.tealDark, fill = C.white) {
  addShape(slide, "roundRect", left, top, width, height, fill, C.line, 1);
  addShape(slide, "rect", left, top, 6, height, accent, accent, 0);
  addText(slide, title, left + 20, top + 14, width - 36, 28, { fontSize: 16, bold: true, color: C.ink });
  addText(slide, body, left + 20, top + 49, width - 36, height - 58, { fontSize: 13, color: C.muted, verticalAlignment: "top" });
}

function addSectionTitle(slide, kicker, title, subtitle = "") {
  addText(slide, kicker.toUpperCase(), 56, 32, 420, 22, { fontSize: 11, bold: true, color: C.orange });
  addText(slide, title, 56, 58, 920, 50, { fontSize: 29, bold: true, color: C.navy });
  if (subtitle) addText(slide, subtitle, 58, 111, 980, 32, { fontSize: 14, color: C.muted });
  addLine(slide, 56, 151, 1222, 151, C.line, 1);
}

function addFooter(slide, index, label = "Cotizador de Envíos · Tectronic") {
  addLine(slide, 56, 681, 1222, 681, C.line, 1);
  addText(slide, label, 56, 690, 420, 18, { fontSize: 10, color: C.muted });
  addText(slide, String(index).padStart(2, "0"), 1170, 688, 52, 22, { fontSize: 12, bold: true, color: C.navy, alignment: "right" });
}

function addBulletList(slide, items, left, top, width, lineHeight = 30, color = C.ink, bulletColor = C.orange, fontSize = 15) {
  items.forEach((item, i) => {
    const y = top + i * lineHeight;
    addShape(slide, "ellipse", left, y + 8, 9, 9, bulletColor, bulletColor, 0);
    addText(slide, item, left + 20, y, width - 20, lineHeight - 2, { fontSize, color, verticalAlignment: "top" });
  });
}

function addTable(slide, rows, cols, values, left, top, width, height, columnWidths, headerFill = C.navy) {
  const table = slide.tables.add({
    rows,
    columns: cols,
    left,
    top,
    width,
    height,
    values,
    columnWidths,
  });
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const cell = table.getCell(r, c);
      cell.fill = r === 0 ? headerFill : (r % 2 === 0 ? C.sand2 : C.white);
      cell.text.style = {
        typeface: FONT,
        fontSize: r === 0 ? 12 : 11,
        bold: r === 0,
        color: r === 0 ? C.white : C.ink,
        alignment: c === 0 ? "left" : "left",
        verticalAlignment: "middle",
        autoFit: "shrinkTextOnOverflow",
        marginLeft: 8,
        marginRight: 8,
        marginTop: 3,
        marginBottom: 3,
      };
    }
  }
  return table;
}

function notes(slide, text) { slide.speakerNotes.textFrame.setText(text); }

// Preserve the template's title slide and its bottom visual treatment.
const cover = p.slides.items[0];
const coverText = cover.shapes.items.filter((s) => s.text?.plainText || s.text?.toString?.());
if (coverText[0]) {
  coverText[0].text = "Cotizador de\nEnvíos";
  coverText[0].text.style = { typeface: FONT, fontSize: 40, bold: true, color: C.navy, alignment: "left", autoFit: "shrinkTextOnOverflow" };
}
if (coverText[1]) {
  coverText[1].text = "Embalaje, resumen y distribución propuesta\nGuía técnica y operativa · Septiembre 2026";
  coverText[1].text.style = { typeface: FONT, fontSize: 17, color: C.ink, alignment: "left", autoFit: "shrinkTextOnOverflow" };
}
notes(cover, "Presentación elaborada a partir de la implementación actual. Fuente principal: src/features/shipping/ShippingQuotesDashboard.tsx, src/features/shipping/ShippingPackingWorkspace.tsx, src/features/shipping/packingPreview.ts, src/features/shipping/shippingQuoteMath.ts y supabase/functions/_shared/shipping-packing.ts.");

for (let i = p.slides.items.length - 1; i >= 1; i -= 1) p.slides.remove(i);

function newSlide() {
  return p.slides.add({ layoutId: "/ppt/slideLayouts/slideLayout8.xml" });
}

// 2. Problem solved
{
  const s = newSlide();
  addSectionTitle(s, "01 · Propósito", "Del pedido de Odoo a una cotización auditable", "El módulo convierte una orden en un conjunto realista de bultos para consultar a FedEx.");
  const steps = [
    ["01", "Orden Odoo", "Cliente, líneas, cantidades y destino."],
    ["02", "Datos físicos", "SKU, peso y dimensiones por producto."],
    ["03", "Distribución", "El motor propone cajas y asignaciones."],
    ["04", "FedEx", "Se envía un paquete por bulto a Rates API."],
  ];
  steps.forEach((st, i) => {
    const x = 56 + i * 292;
    addShape(s, "roundRect", x, 205, 238, 142, i === 2 ? C.sand : C.white, C.line, 1);
    addText(s, st[0], x + 18, 218, 48, 28, { fontSize: 14, bold: true, color: C.orange });
    addText(s, st[1], x + 18, 251, 202, 27, { fontSize: 18, bold: true, color: C.navy });
    addText(s, st[2], x + 18, 288, 202, 43, { fontSize: 13, color: C.muted, verticalAlignment: "top" });
    if (i < steps.length - 1) addArrow(s, x + 246, 266, 34);
  });
  addCard(s, 56, 398, 360, 150, "Solo lectura en Odoo", "La integración consulta órdenes, contactos y productos; no modifica datos en Odoo.", C.tealDark);
  addCard(s, 438, 398, 360, 150, "Sin dimensiones inventadas", "Si falta peso o medida, el usuario completa el dato en Paquetes y resumen antes de cotizar.", C.orange);
  addCard(s, 820, 398, 360, 150, "Menos paquetes por defecto", "La estrategia inicial es MIN_PACKAGES: buscar la menor cantidad de bultos válidos.", C.green);
  addFooter(s, 2);
  notes(s, "Fuentes: src/features/shipping/ShippingQuotesDashboard.tsx; src/features/shipping/shippingQuotesService.ts; supabase/functions/shipping-quote/index.ts. La presentación resume el flujo visible y la separación de responsabilidades.");
}

// 3. Architecture
{
  const s = newSlide();
  addSectionTitle(s, "02 · Arquitectura", "Cinco piezas que trabajan como un solo flujo", "La interfaz orquesta servicios especializados; cada etapa deja datos verificables para la siguiente.");
  const cards = [
    ["OdooService", "Orden, contacto, dirección de entrega, SKU y líneas.", "src/features/shipping/shippingQuotesService.ts", C.navy],
    ["Producto físico", "Dimensiones, peso, rotación y reglas guardadas en Supabase.", "shipping_product_dimensions", C.tealDark],
    ["Packing engine", "Normaliza unidades, prueba rotaciones y arma bultos.", "supabase/functions/_shared/shipping-packing.ts", C.orange],
    ["FedExService", "Convierte cada paquete a requestedPackageLineItems.", "supabase/functions/shipping-quote/index.ts", C.green],
    ["Historial y auditoría", "Guarda cotización, bultos, tarifas y configuración.", "shipping_quotes · shipping_quote_packages", C.yellow],
  ];
  cards.forEach((c, i) => {
    const x = 56 + (i % 3) * 388;
    const y = 196 + Math.floor(i / 3) * 188;
    addCard(s, x, y, 350, 145, c[0], `${c[1]}\n\n${c[2]}`, c[3], i === 4 ? C.sand2 : C.white);
  });
  addLine(s, 237, 341, 237, 368, C.line, 2);
  addLine(s, 625, 341, 625, 368, C.line, 2);
  addLine(s, 1013, 341, 1013, 368, C.line, 2);
  addText(s, "Resultado: un request de tarifas basado en paquetes físicos, no en una lista genérica de productos.", 56, 575, 1110, 38, { fontSize: 17, bold: true, color: C.navy, alignment: "center" });
  addFooter(s, 3);
  notes(s, "Fuentes: src/features/shipping/ShippingQuotesDashboard.tsx; src/features/shipping/ShippingPackingWorkspace.tsx; src/features/shipping/packingPreview.ts; src/features/shipping/shippingQuoteMath.ts; supabase/functions/_shared/shipping-packing.ts; supabase/functions/shipping-quote/index.ts.");
}

// 4. Data sources table
{
  const s = newSlide();
  addSectionTitle(s, "03 · Datos", "Qué se toma de cada fuente", "La coincidencia principal entre Odoo y la base física es el código interno o SKU.");
  addTable(s, 6, 3, [
    ["Dato", "Fuente", "Uso en el cotizador"],
    ["Orden, cliente y líneas", "Odoo · lectura", "Identificar pedido, cantidades y productos vendibles."],
    ["Código interno / SKU", "Odoo + Supabase", "Vincular producto con dimensiones y peso conocidos."],
    ["Peso y dimensiones", "Producto físico", "Construir unidades y validar si caben en la caja."],
    ["CP y dirección de entrega", "Contacto Odoo", "Definir destino FedEx; fallback al contacto general si falta."],
    ["Credenciales y origen", "shipping_carrier_settings", "Autenticar backend y completar el request sin exponer secretos."],
  ], 56, 190, 1168, 364, [238, 280, 650]);
  addPill(s, "Fallback controlado", 56, 588, 170, C.sand, C.ink);
  addText(s, "Si el SKU no coincide o faltan datos físicos, el producto no se inventa: queda visible para completar manualmente.", 242, 588, 930, 30, { fontSize: 14, color: C.muted });
  addFooter(s, 4);
  notes(s, "Fuentes: src/features/shipping/ShippingQuotesDashboard.tsx, src/features/shipping/ShippingPackingWorkspace.tsx, supabase/functions/_shared/shipping-packing.ts. Los nombres de tablas se basan en el esquema actual del cotizador.");
}

// 5. Packing and summary
{
  const s = newSlide();
  addSectionTitle(s, "04 · Embalaje y resumen", "La vista que traduce datos físicos en una decisión", "Antes de consultar FedEx, el usuario puede comprobar qué se va a enviar y por qué.");
  addShape(s, "roundRect", 56, 187, 435, 370, C.sand2, C.line, 1);
  addText(s, "RESUMEN DEL ENVÍO", 80, 208, 300, 22, { fontSize: 12, bold: true, color: C.orange });
  const metrics = [["Artículos", "12"], ["Paquetes", "3"], ["Peso bruto", "28.400 kg"], ["Peso volumétrico", "31.250 kg"], ["Peso facturable", "31.250 kg"], ["Utilización", "86%"]];
  metrics.forEach((m, i) => {
    const y = 247 + i * 46;
    addText(s, m[0], 80, y, 190, 25, { fontSize: 14, color: C.muted });
    addText(s, m[1], 286, y, 160, 25, { fontSize: 16, bold: true, color: C.navy, alignment: "right" });
    addLine(s, 80, y + 31, 446, y + 31, C.line, 1);
  });
  addShape(s, "roundRect", 538, 187, 686, 370, C.white, C.line, 1);
  addText(s, "Tres bultos listos para cotizar", 568, 208, 580, 28, { fontSize: 18, bold: true, color: C.navy });
  const boxes = [
    ["Bulto 1", "40 × 30 × 25 cm", "8.4 kg", C.teal],
    ["Bulto 2", "50 × 40 × 30 cm", "12.6 kg", C.sand],
    ["Bulto 3", "35 × 25 × 20 cm", "10.7 kg", "#DCE8EA"],
  ];
  boxes.forEach((b, i) => {
    const x = 570 + i * 205;
    addShape(s, "roundRect", x, 279, 170, 170, b[3], b[3], 0);
    addText(s, b[0], x + 12, 294, 145, 24, { fontSize: 14, bold: true, color: C.navy, alignment: "center" });
    addShape(s, "rect", x + 38, 331, 95, 60, "none", C.tealDark, 2);
    addText(s, b[1], x + 9, 406, 152, 21, { fontSize: 11, color: C.ink, alignment: "center" });
    addText(s, b[2], x + 9, 431, 152, 21, { fontSize: 13, bold: true, color: C.navy, alignment: "center" });
  });
  addText(s, "El resumen conserva peso real, peso volumétrico, peso facturable, tara, cantidad de bultos y utilización para que la decisión sea auditable.", 568, 482, 610, 48, { fontSize: 14, color: C.muted, verticalAlignment: "top" });
  addFooter(s, 5);
  notes(s, "Fuentes: src/features/shipping/ShippingPackingWorkspace.tsx; src/features/shipping/shippingQuoteMath.ts. La ilustración muestra datos de ejemplo para explicar la UI; no representa una orden real.");
}

// 6. Proposed distribution
{
  const s = newSlide();
  addSectionTitle(s, "05 · Distribución propuesta", "El usuario revisa y ajusta el plan antes de enviarlo", "La propuesta no es una caja negra: cada unidad puede moverse, separarse o documentarse.");
  addPill(s, "Estrategia inicial", 56, 184, 138, C.sand, C.ink);
  addText(s, "Menos paquetes · MIN_PACKAGES", 208, 184, 350, 30, { fontSize: 17, bold: true, color: C.navy });
  addText(s, "Objetivo: agrupar tanto como sea válido, sin superar límites físicos o de peso.", 560, 184, 615, 30, { fontSize: 14, color: C.muted });
  const stages = [
    ["Líneas", "SKU + cantidad"],
    ["Unidades", "cada pieza física"],
    ["Candidatos", "cajas disponibles"],
    ["Asignaciones", "unidad → bulto"],
    ["Validación", "listo para FedEx"],
  ];
  stages.forEach((st, i) => {
    const x = 56 + i * 238;
    addShape(s, "roundRect", x, 247, 190, 100, i === 4 ? C.sand : C.white, C.line, 1);
    addText(s, st[0], x + 12, 264, 166, 25, { fontSize: 16, bold: true, color: C.navy, alignment: "center" });
    addText(s, st[1], x + 12, 299, 166, 25, { fontSize: 12, color: C.muted, alignment: "center" });
    if (i < stages.length - 1) addArrow(s, x + 194, 285, 30);
  });
  addCard(s, 56, 391, 350, 145, "Cambiar estrategia", "Equilibrado, Menos paquetes, Compacto o Conservador. La selección vuelve a generar el plan.", C.tealDark);
  addCard(s, 465, 391, 350, 145, "Mover unidades", "Mover a otra caja, crear una nueva o separar una unidad con dimensiones propias.", C.orange);
  addCard(s, 874, 391, 350, 145, "Explicar la decisión", "La vista permite inspeccionar por qué se eligió cada distribución y qué queda pendiente.", C.green);
  addFooter(s, 6);
  notes(s, "Fuentes: src/features/shipping/ShippingPackingWorkspace.tsx; src/features/shipping/packingPreview.ts; src/features/shipping/packingEngine.ts. Estrategias y controles corresponden a la implementación actual.");
}

// 7. Packing engine
{
  const s = newSlide();
  addSectionTitle(s, "06 · Motor de embalaje", "Cómo decide si una unidad cabe", "El motor prueba restricciones físicas y de negocio antes de aceptar una asignación.");
  const nodes = [
    ["Normalizar", "cm · kg · cantidad"],
    ["Ordenar", "peso · volumen · reglas"],
    ["Rotar", "orientaciones válidas"],
    ["Colocar", "espacio libre + soporte"],
    ["Validar", "peso · límites · vacíos"],
  ];
  nodes.forEach((n, i) => {
    const x = 74 + i * 232;
    addShape(s, "ellipse", x, 228, 145, 145, i === 4 ? C.sand : C.white, i === 4 ? C.orange : C.tealDark, 2);
    addText(s, n[0], x + 12, 267, 121, 27, { fontSize: 16, bold: true, color: C.navy, alignment: "center" });
    addText(s, n[1], x + 12, 306, 121, 38, { fontSize: 12, color: C.muted, alignment: "center" });
    if (i < nodes.length - 1) addArrow(s, x + 150, 289, 55);
  });
  addCard(s, 84, 443, 326, 122, "Rotable", "Por defecto puede probar orientaciones; la línea puede bloquear rotación cuando el producto lo requiera.", C.tealDark);
  addCard(s, 477, 443, 326, 122, "Peso límite", "La caja no se acepta si el peso total supera su máximo configurado.", C.orange);
  addCard(s, 870, 443, 326, 122, "Pendientes visibles", "Unidades sin asignar o datos incompletos se reportan; no desaparecen silenciosamente.", C.red);
  addText(s, "La optimización no busca solo volumen: valida simultáneamente dimensiones, peso y reglas de combinación.", 80, 604, 1110, 32, { fontSize: 15, bold: true, color: C.navy, alignment: "center" });
  addFooter(s, 7);
  notes(s, "Fuente: supabase/functions/_shared/shipping-packing.ts. Se describen normalizePackaging, normalizePackingLines, generatePackingPlan y validatePackingAssignments.");
}

// 8. Weight chart
{
  const s = newSlide();
  addSectionTitle(s, "07 · Cálculo", "Peso volumétrico vs. peso facturable", "FedEx cotiza el mayor entre el peso real y el peso volumétrico del bulto.");
  addText(s, "Peso volumétrico", 74, 189, 260, 28, { fontSize: 17, bold: true, color: C.navy });
  addText(s, "Largo × Ancho × Alto ÷ 5000", 74, 224, 390, 42, { fontSize: 24, bold: true, color: C.orange });
  addText(s, "La implementación convierte unidades, redondea el cálculo a tres decimales y aplica la tara según el modo configurado.", 74, 285, 390, 82, { fontSize: 14, color: C.muted, verticalAlignment: "top" });
  addText(s, "Ejemplo ilustrativo · kg por bulto", 525, 188, 650, 26, { fontSize: 17, bold: true, color: C.navy });
  const bars = [["Real", 8.4, C.tealDark], ["Volumétrico", 12.6, C.orange], ["Facturable", 12.6, C.navy]];
  bars.forEach((b, i) => {
    const y = 252 + i * 78;
    addText(s, b[0], 525, y, 130, 25, { fontSize: 14, color: C.ink });
    addShape(s, "roundRect", 665, y + 2, b[1] * 31, 25, b[2], b[2], 0);
    addText(s, `${b[1].toFixed(1)} kg`, 665 + b[1] * 31 + 14, y, 120, 25, { fontSize: 14, bold: true, color: C.navy });
  });
  addLine(s, 665, 470, 1055, 470, C.line, 1);
  addText(s, "Mayor valor = peso que se factura", 665, 482, 390, 24, { fontSize: 12, color: C.muted });
  addShape(s, "roundRect", 74, 426, 395, 104, C.sand2, C.line, 1);
  addText(s, "Regla", 95, 442, 100, 22, { fontSize: 12, bold: true, color: C.orange });
  addText(s, "Peso facturable = max(peso real, peso volumétrico)", 95, 470, 344, 35, { fontSize: 16, bold: true, color: C.navy });
  addText(s, "Ejemplo ilustrativo, no corresponde a una orden real.", 525, 555, 650, 22, { fontSize: 11, color: C.muted, alignment: "right" });
  addFooter(s, 8);
  notes(s, "Fuentes: src/features/shipping/shippingQuoteMath.ts; supabase/functions/_shared/shipping-packing.ts. Los valores del gráfico son un ejemplo visual para explicar la fórmula; el sistema calcula los valores reales de cada bulto.");
}

// 9. Validation states
{
  const s = newSlide();
  addSectionTitle(s, "08 · Control de calidad", "No se cotiza hasta que el envío sea coherente", "Los estados hacen visible si falta información o si una distribución necesita corrección.");
  const rows = [
    ["PENDING_DATA", "Faltan dimensiones, peso, destino o configuración.", "Completar datos en el flujo."],
    ["PARTIALLY_PACKED", "Hay unidades sin bulto asignado.", "Mover o separar unidades."],
    ["INVALID_PACKING", "Peso, dimensiones, caja vacía o duplicidad inválida.", "Corregir distribución."],
    ["READY_FOR_QUOTE", "Paquetes válidos y resumen listo.", "Enviar request a FedEx."],
  ];
  addTable(s, 5, 3, [["Estado", "Qué significa", "Acción"], ...rows], 56, 201, 1168, 308, [260, 520, 388], C.navy);
  addPill(s, "Regla de seguridad", 56, 556, 160, C.sand, C.ink);
  addText(s, "Los errores se muestran en la interfaz; una unidad pendiente no se oculta ni se convierte en una dimensión inventada.", 230, 556, 930, 31, { fontSize: 15, color: C.muted });
  addFooter(s, 9);
  notes(s, "Fuentes: src/features/shipping/packingPreview.ts; src/features/shipping/shippingQuoteMath.ts; src/features/shipping/ShippingPackingWorkspace.tsx. Estados y validaciones se resumen de la lógica actual.");
}

// 10. FedEx request
{
  const s = newSlide();
  addSectionTitle(s, "09 · FedEx", "Un request por cada paquete físico", "La integración conserva el detalle necesario para que el resultado sea comparable y trazable.");
  addShape(s, "roundRect", 56, 198, 372, 320, C.sand2, C.line, 1);
  addText(s, "REQUEST", 80, 220, 110, 20, { fontSize: 12, bold: true, color: C.orange });
  addBulletList(s, ["Origen y destino", "Servicio y pickup", "TotalPackageCount", "requestedPackageLineItems", "Peso redondeado a 3 decimales", "Dimensiones enteras en cm"], 82, 258, 300, 35, C.ink, C.tealDark, 14);
  addShape(s, "roundRect", 502, 198, 340, 320, C.white, C.line, 1);
  addText(s, "PAQUETES", 526, 220, 160, 20, { fontSize: 12, bold: true, color: C.orange });
  ["Bulto 1 · 8.4 kg", "Bulto 2 · 12.6 kg", "Bulto 3 · 10.7 kg"].forEach((t, i) => {
    addShape(s, "roundRect", 530, 262 + i * 68, 282, 46, i === 1 ? C.sand : "#EAF1F2", "none", 0);
    addText(s, t, 548, 272 + i * 68, 246, 25, { fontSize: 14, bold: true, color: C.navy, alignment: "center" });
  });
  addShape(s, "roundRect", 900, 198, 324, 320, C.white, C.line, 1);
  addText(s, "RESPONSE", 924, 220, 160, 20, { fontSize: 12, bold: true, color: C.orange });
  addText(s, "Servicios FedEx\n\nCosto · moneda · tránsito\n\nSe guarda el resultado para historial y comparación.", 924, 262, 252, 155, { fontSize: 15, color: C.ink, verticalAlignment: "top" });
  addPill(s, "Seguridad", 56, 564, 110, C.sand, C.ink);
  addText(s, "OAuth, client secret y credenciales viven en backend/Edge Function; nunca se exponen al navegador.", 184, 564, 990, 30, { fontSize: 14, color: C.muted });
  addFooter(s, 10);
  notes(s, "Fuentes: supabase/functions/shipping-quote/index.ts; src/features/shipping/shippingQuotesService.ts; src/features/shipping/shippingQuoteMath.ts. La presentación no muestra secretos ni tokens.");
}

// 11. Supabase traceability
{
  const s = newSlide();
  addSectionTitle(s, "10 · Persistencia", "Cada cotización deja un rastro útil", "Supabase conserva configuración, snapshot de bultos, tarifas y auditoría para repetir o investigar el resultado.");
  addTable(s, 6, 2, [
    ["Tabla", "Responsabilidad"],
    ["shipping_carrier_settings", "Credenciales cifradas, ambiente y origen FedEx."],
    ["shipping_product_dimensions", "SKU, peso, dimensiones y reglas físicas del producto."],
    ["shipping_quotes", "Orden, usuario, request/response, resumen y estado."],
    ["shipping_quote_packages", "Snapshot de cada bulto enviado a FedEx."],
    ["shipping_quote_rates / audit", "Tarifas devueltas y cambios de configuración."],
  ], 56, 192, 680, 360, [280, 400], C.navy);
  addShape(s, "roundRect", 792, 210, 390, 292, C.sand2, C.line, 1);
  addText(s, "Cadena de trazabilidad", 820, 232, 330, 26, { fontSize: 18, bold: true, color: C.navy });
  const trace = ["Configuración", "Orden", "Bultos", "Tarifas", "Historial"];
  trace.forEach((t, i) => {
    const y = 286 + i * 40;
    addShape(s, "ellipse", 830, y, 16, 16, i === 4 ? C.orange : C.tealDark, "none", 0);
    addText(s, t, 864, y - 5, 200, 24, { fontSize: 15, bold: i === 4, color: C.ink });
    if (i < trace.length - 1) addLine(s, 838, y + 16, 838, y + 40, C.line, 2);
  });
  addText(s, "Esto permite explicar qué se cotizó, con qué datos y con qué respuesta del proveedor.", 792, 550, 390, 48, { fontSize: 14, color: C.muted, verticalAlignment: "top" });
  addFooter(s, 11);
  notes(s, "Fuentes: esquema actual en supabase/migrations y funciones del módulo de envíos. Nombres de tablas representados según la implementación existente.");
}

// 12. Operating flow
{
  const s = newSlide();
  addSectionTitle(s, "11 · Operación", "La secuencia recomendada para el usuario", "El objetivo es llegar a FedEx con un resumen entendido y editable.");
  const flow = [
    ["1", "Buscar orden", "Número de orden Odoo"],
    ["2", "Verificar destino", "CP de dirección de entrega"],
    ["3", "Completar físicos", "Dimensiones y peso faltantes"],
    ["4", "Revisar plan", "Embalaje y resumen"],
    ["5", "Ajustar", "Estrategia o distribución"],
    ["6", "Cotizar", "Enviar a FedEx"],
    ["7", "Comparar", "Servicios e historial"],
  ];
  flow.forEach((f, i) => {
    const x = 56 + (i % 4) * 292;
    const y = 194 + Math.floor(i / 4) * 170;
    addShape(s, "roundRect", x, y, 238, 112, i === 5 ? C.sand : C.white, C.line, 1);
    addShape(s, "ellipse", x + 16, y + 20, 34, 34, C.tealDark, C.tealDark, 0);
    addText(s, f[0], x + 16, y + 23, 34, 26, { fontSize: 14, bold: true, color: C.white, alignment: "center" });
    addText(s, f[1], x + 65, y + 20, 155, 25, { fontSize: 16, bold: true, color: C.navy });
    addText(s, f[2], x + 65, y + 52, 155, 36, { fontSize: 12, color: C.muted, verticalAlignment: "top" });
    if (i < flow.length - 1 && i !== 3) addArrow(s, x + 246, y + 45, 30);
  });
  addShape(s, "roundRect", 56, 548, 1168, 62, C.sand2, C.line, 1);
  addText(s, "Punto de decisión", 78, 566, 174, 25, { fontSize: 14, bold: true, color: C.orange });
  addText(s, "Si los datos físicos no están completos, el flujo se detiene en el paso 3; si el plan es READY_FOR_QUOTE, continúa al paso 6.", 272, 566, 910, 25, { fontSize: 14, color: C.ink });
  addFooter(s, 12);
  notes(s, "Fuente: src/features/shipping/ShippingQuotesDashboard.tsx y src/features/shipping/ShippingPackingWorkspace.tsx. Es la secuencia operativa sugerida a partir de la UI actual.");
}

// 13. Decision checklist
{
  const s = newSlide();
  addSectionTitle(s, "12 · Cierre", "Qué debe quedar claro antes de confirmar", "La mejor cotización empieza por un paquete bien definido.");
  addCard(s, 56, 195, 520, 100, "1 · Datos confiables", "Orden, destino, SKU, peso y dimensiones corresponden a la mercancía real.", C.tealDark);
  addCard(s, 56, 319, 520, 100, "2 · Distribución explicable", "La propuesta usa el menor número de paquetes posible sin romper las restricciones.", C.orange);
  addCard(s, 56, 443, 520, 100, "3 · Comparación útil", "Los servicios FedEx se comparan con el mismo conjunto de bultos y condiciones.", C.green);
  addShape(s, "roundRect", 668, 195, 556, 348, C.sand2, C.line, 1);
  addText(s, "La idea central", 700, 229, 450, 32, { fontSize: 22, bold: true, color: C.navy });
  addText(s, "Embalaje y resumen no son una pantalla intermedia: son el control que conecta la orden de Odoo con el request de FedEx.", 700, 282, 466, 95, { fontSize: 21, bold: true, color: C.ink, verticalAlignment: "top" });
  addText(s, "Si falta un dato, se completa. Si una unidad no cabe, se corrige. Si una tarifa cambia, queda registrada con su contexto.", 700, 405, 466, 72, { fontSize: 15, color: C.muted, verticalAlignment: "top" });
  addPill(s, "Resultado", 700, 500, 105, C.navy, C.white);
  addText(s, "Cotizaciones más rápidas de revisar, comparar y defender.", 820, 500, 350, 30, { fontSize: 15, bold: true, color: C.navy });
  addFooter(s, 13);
  notes(s, "Fuentes: arquitectura y archivos del módulo de Cotizador de Envíos. La conclusión resume el propósito operativo de Embalaje y resumen y Distribución propuesta del envío.");
}

await fs.mkdir(outputDir, { recursive: true });
const exported = await (await PresentationFile.exportPptx(p)).save(candidatePath);
const requirements = {
  explicitTotalSlideCount: 13,
  sourceTemplatePath: templatePath,
  requiredTemplateReferenceSlides: [1],
  requiredNativeTableOwnerSlides: [4, 9, 11],
  expectedSlideSizeEmu: { width: 12192000, height: 6858000 },
  fontPolicy: { basis: "design", families: [FONT] },
};
await finalizePresentation({
  artifactType: "presentation",
  candidatePath,
  finalPath,
  workspaceDir: workspace,
  pythonExecutable,
  integrityValidatorPath: path.join(containerTools, "inspect_presentation_package_integrity.py"),
  layoutValidatorPath: path.join(containerTools, "inspect_presentation_layout_geometry.py"),
  requirements,
  slideCount: 13,
  expectedSlideCount: 13,
  renderSlides: true,
});
console.log(`FINAL_PATH=${finalPath}`);
