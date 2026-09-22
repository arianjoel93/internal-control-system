from __future__ import annotations

import re
from datetime import date
from html import escape
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    HRFlowable,
    KeepTogether,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output" / "pdf"
TODAY = "17 de septiembre de 2026"
COMPANY = "Corporación Tectronic"

PALETTE = {
    "ink": colors.HexColor("#24313F"),
    "muted": colors.HexColor("#64748B"),
    "brand": colors.HexColor("#A9563A"),
    "brand_dark": colors.HexColor("#783B2A"),
    "sand": colors.HexColor("#F5EEE9"),
    "line": colors.HexColor("#D9E0E7"),
    "soft": colors.HexColor("#F8FAFC"),
    "green": colors.HexColor("#2F7D5A"),
}


styles = getSampleStyleSheet()
styles.add(ParagraphStyle(
    name="DocTitle", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=24,
    leading=29, textColor=PALETTE["ink"], spaceAfter=7 * mm,
))
styles.add(ParagraphStyle(
    name="Subtitle", parent=styles["Normal"], fontName="Helvetica", fontSize=10.5,
    leading=15, textColor=PALETTE["muted"], spaceAfter=6 * mm,
))
styles.add(ParagraphStyle(
    name="H1Doc", parent=styles["Heading1"], fontName="Helvetica-Bold", fontSize=16,
    leading=20, textColor=PALETTE["brand_dark"], spaceBefore=5 * mm, spaceAfter=3 * mm,
))
styles.add(ParagraphStyle(
    name="H2Doc", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=12,
    leading=15, textColor=PALETTE["ink"], spaceBefore=3 * mm, spaceAfter=2 * mm,
))
styles.add(ParagraphStyle(
    name="BodyDoc", parent=styles["BodyText"], fontName="Helvetica", fontSize=9.2,
    leading=13.2, textColor=PALETTE["ink"], spaceAfter=2.3 * mm,
))
styles.add(ParagraphStyle(
    name="SmallDoc", parent=styles["BodyText"], fontName="Helvetica", fontSize=7.8,
    leading=10.5, textColor=PALETTE["muted"], spaceAfter=1.6 * mm,
))
styles.add(ParagraphStyle(
    name="Callout", parent=styles["BodyText"], fontName="Helvetica", fontSize=9,
    leading=13, textColor=PALETTE["ink"], backColor=PALETTE["sand"],
    borderColor=PALETTE["brand"], borderWidth=0.6, borderPadding=7,
    spaceBefore=2 * mm, spaceAfter=3 * mm,
))
styles.add(ParagraphStyle(
    name="CoverKicker", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=8.5,
    leading=11, textColor=PALETTE["brand"], tracking=1.3, spaceAfter=4 * mm,
))
styles.add(ParagraphStyle(
    name="TableHead", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=7.5,
    leading=9, textColor=colors.white,
))
styles.add(ParagraphStyle(
    name="TableCell", parent=styles["Normal"], fontName="Helvetica", fontSize=7.5,
    leading=9.5, textColor=PALETTE["ink"],
))
styles.add(ParagraphStyle(
    name="Footer", parent=styles["Normal"], fontName="Helvetica", fontSize=7,
    textColor=PALETTE["muted"], alignment=TA_CENTER,
))


def p(text: str, style: str = "BodyDoc") -> Paragraph:
    return Paragraph(escape(text).replace("\n", "<br/>"), styles[style])


def rich(text: str, style: str = "BodyDoc") -> Paragraph:
    return Paragraph(text, styles[style])


def bullet(text: str) -> Paragraph:
    return rich(f"<font color='{PALETTE['brand'].hexval()}'><b>-</b></font> {escape(text)}")


def bullets(items: list[str]) -> list[Paragraph]:
    return [bullet(item) for item in items]


def section(title: str, body: list[str] | None = None) -> list:
    flow = [p(title, "H1Doc")]
    if body:
        flow.extend(p(item) for item in body)
    return flow


def table(headers: list[str], rows: list[list[str]], widths: list[float] | None = None) -> Table:
    data = [[p(h, "TableHead") for h in headers]]
    data.extend([[p(str(cell), "TableCell") for cell in row] for row in rows])
    result = Table(data, colWidths=widths, repeatRows=1, hAlign="LEFT")
    result.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), PALETTE["brand_dark"]),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.35, PALETTE["line"]),
        ("BACKGROUND", (0, 1), (-1, -1), colors.white),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, PALETTE["soft"]]),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return result


def inventory() -> tuple[list[str], list[str], list[str]]:
    migration_names = sorted(path.name for path in (ROOT / "supabase" / "migrations").glob("*.sql"))
    edge_names = sorted(
        path.name for path in (ROOT / "supabase" / "functions").iterdir()
        if path.is_dir() and path.name != "_shared"
    )
    sql = "\n".join(path.read_text(encoding="utf-8", errors="ignore") for path in (ROOT / "supabase" / "migrations").glob("*.sql"))
    tables = sorted(set(re.findall(r"create table(?: if not exists)? public\.([a-zA-Z0-9_]+)", sql, re.I)))
    return migration_names, edge_names, tables


MIGRATIONS, FUNCTIONS, TABLES = inventory()


MODULES = {
    "soportes": {
        "file": "manual-modulo-soportes.pdf",
        "title": "Módulo de Soportes",
        "purpose": "Registrar, asignar y dar seguimiento a folios de soporte, diagnóstico, reparación, autorización y entrega, conservando una trazabilidad clara para el cliente y el equipo interno.",
        "sections": [
            ("Flujo recomendado", [
                "Crea un folio con los datos del cliente, equipo, número de serie, problema reportado y evidencias disponibles.",
                "Avanza el estado conforme ocurre la operación. El historial conserva cada movimiento y permite explicar qué sucedió y cuándo.",
                "En diagnóstico, registra la cotización y utiliza el plazo de respuesta de siete días hábiles para controlar autorizaciones.",
                "Antes de marcar el equipo listo para entrega, valida que la autorización y las evidencias estén completas.",
            ]),
            ("Qué revisar en cada caso", [
                "El folio, cliente, contacto y medio de comunicación deben ser consistentes.",
                "Las fotos, archivos y notas deben documentar el diagnóstico y la solución sin datos ambiguos.",
                "Una autorización no revisada por el cliente no equivale a una autorización aceptada.",
                "Los administradores pueden corregir un paso del historial; esa acción debe usarse solo para errores reales de captura.",
            ]),
            ("Notificaciones y correo", [
                "Los cambios relevantes pueden notificar al cliente mediante la plantilla configurada por un administrador.",
                "El mensaje debe destacar la descripción del movimiento, el movimiento y el estado actual.",
                "Si el envío falla, conserva el folio y revisa la configuración del correo y el registro de respuesta antes de repetir la operación.",
            ]),
            ("Preguntas frecuentes", [
                "¿Qué hago si el cliente no responde? Mantén el estado como no revisado y revisa la fecha límite de siete días hábiles.",
                "¿Puedo eliminar un evento? Solo un administrador con la acción visible en el historial debe hacerlo, y únicamente cuando se trate de una corrección.",
                "¿Qué pasa con un soporte creado por otro usuario? Un administrador puede consultar el conjunto completo de registros según sus permisos.",
            ]),
        ],
    },
    "inventario": {
        "file": "manual-modulo-inventario.pdf", "title": "Módulo de Inventario",
        "purpose": "Controlar productos, almacenes, existencias, movimientos, lotes y requisitos operativos sin perder la seguridad de los saldos.",
        "sections": [
            ("Inicio rápido", ["Revisa el tablero para identificar existencias y alertas.", "Busca un producto por código, nombre o categoría.", "Registra entradas, salidas o ajustes con motivo, almacén y detalle de partidas.", "Consulta el historial antes de corregir un movimiento para conservar la trazabilidad."]),
            ("Conceptos clave", ["Producto: catálogo maestro con unidad, categoría, código y estado.", "Stock: existencia por producto y almacén.", "Movimiento: entrada, salida o ajuste que explica el cambio.", "Lote: detalle opcional para rastrear cantidades y fechas.", "Stock insuficiente y bloqueos de seguridad evitan movimientos que producirían saldos inconsistentes."]),
            ("Buenas prácticas", ["Usa códigos únicos y nombres descriptivos.", "Captura cantidades con la unidad correcta.", "Documenta la causa de cada ajuste.", "Usa filtros y exportaciones para conciliaciones periódicas."]),
            ("Preguntas frecuentes", ["Si no encuentras un producto, valida que esté activo y que la búsqueda use el código correcto.", "Si un movimiento no permite guardar, revisa almacén, cantidades y disponibilidad.", "La información queda en Supabase y respeta el alcance de visibilidad asignado al usuario."]),
        ],
    },
    "polizas": {
        "file": "manual-modulo-polizas.pdf", "title": "Módulo de Pólizas",
        "purpose": "Administrar clientes con póliza, servicios contratados, consumos, renovaciones, recargas y archivo histórico.",
        "sections": [
            ("Operación diaria", ["Registra o localiza al cliente.", "Consulta horas contratadas, consumidas y disponibles.", "Agrega servicios con tipo, fechas y descripción.", "Aplica recargas desde el formulario correspondiente y confirma el resultado."]),
            ("Lectura de saldos", ["Horas totales representan el saldo contratado.", "Horas consumidas se acumulan por los servicios registrados.", "Horas restantes son el saldo operativo para decidir si se requiere una recarga.", "El archivo permite conservar clientes fuera de operación sin mezclarlos con la cartera activa."]),
            ("Control y preguntas", ["Evita duplicar clientes: busca antes de crear.", "Valida fechas y tipo de servicio.", "Si un cliente está archivado, restáuralo solo cuando exista una necesidad operativa confirmada."]),
        ],
    },
    "reportes": {
        "file": "manual-modulo-reportes.pdf", "title": "Módulo de Reportes",
        "purpose": "Convertir la facturación y las órdenes de Odoo en un tablero para decisiones comerciales, respetando roles, filtros y comparaciones.",
        "sections": [
            ("Cómo usarlo", ["Selecciona el periodo y aplica los filtros con el botón Aplicar filtros.", "El Resumen ejecutivo presenta facturación, total sin impuestos, cotizaciones, órdenes y señales de desempeño.", "Explora Conversión, Clientes, Productos, Vendedores, Pareto, Carritos abandonados y Pronósticos desde el sidebar.", "Usa el detalle de un KPI para revisar los registros que lo forman y exporta el reporte cuando necesites compartirlo."]),
            ("Origen y significado de los datos", ["La facturación y el total sin impuestos se basan en el análisis de facturas de Odoo, usando fecha de factura y movimientos de clientes no borrador ni cancelados, incluyendo facturas y notas de crédito según la lógica vigente.", "Cotizaciones y órdenes provienen del modelo de ventas: cotizaciones usan fecha de creación y estado de cotización; órdenes usan date_order y estado sale.", "Conversión comercial = órdenes / (órdenes + cotizaciones). No es una tasa de facturación.", "Los clientes nuevos son clientes sin compra en todo el historial disponible; los perfiles PUBLICO EN GENERAL se resuelven con la dirección de entrega cuando existe."]),
            ("Roles y lectura", ["Propietarios, administradores y gerentes pueden consultar el alcance global permitido y metas.", "Un Agente de ventas ve sus datos y comparativas con el mismo periodo del año anterior; no puede cambiar la configuración analítica.", "Los filtros de compañía y vendedor se adaptan al rol y se aplican en bloque para evitar consultas innecesarias."]),
            ("Cómo tomar decisiones", ["Usa crecimiento vs. año anterior para distinguir tendencia de temporada.", "En vendedores, combina ventas, conversión, clientes nuevos y categorías: un monto alto con conversión baja requiere revisar el embudo.", "En Pareto, atiende primero los productos y clientes que concentran la mayor parte del resultado.", "En Carritos abandonados, revisa frecuencia de cotización, precio unitario, vendedor, cliente y productos excluidos para detectar fricción comercial.", "En Pronósticos, interpreta la confiabilidad junto con la cobertura histórica y no como una garantía."]),
            ("Preguntas frecuentes", ["¿Por qué una nota de crédito reduce el total? Porque es un movimiento de cliente que impacta el total facturado neto.", "¿Por qué no aparecen datos anteriores? Revisa periodo, compañía, vendedor y estado; después usa Actualizar para solicitar datos frescos.", "¿Por qué la línea del periodo anterior no aparece? Se oculta cuando no hay datos comparables o el total es cero, para no sugerir una tendencia inexistente."]),
        ],
    },
    "marketing": {
        "file": "manual-modulo-marketing.pdf", "title": "Módulo de Marketing",
        "purpose": "Segmentar clientes, priorizar acciones comerciales y convertir datos de ventas y CRM en campañas accionables.",
        "sections": [
            ("Recorrido", ["Abre Resumen para revisar Salud de marketing y el Mapa de decisiones.", "Haz clic en un KPI para abrir el detalle con clientes, contactos, productos u oportunidades.", "Usa segmentos como clientes en riesgo, dormidos, clientes que necesitan atención y oportunidades de cross-selling.", "Descarga el CSV o Excel del detalle para preparar una campaña y consulta las notificaciones para saber qué acción priorizar."]),
            ("Indicadores principales", ["Clientes en riesgo: clientes cuya recencia o caída de compras sugiere una intervención.", "Participación: peso de un segmento o categoría en el total analizado.", "Fugas del embudo: oportunidades o leads sin avance esperado.", "Concentración y Pareto: dependencia de pocos clientes, productos o categorías.", "CRM sin seguimiento: oportunidades que requieren una actividad comercial."]),
            ("Acciones recomendadas", ["A los clientes dormidos: contacto de recuperación con producto y fecha de última compra.", "A los clientes en riesgo: campaña personalizada con el producto recurrente y una alternativa.", "Para cross-selling: ofrece complementos a partir de compras reales, no de suposiciones.", "Para leads sin actividad: asigna responsable, siguiente acción y fecha de seguimiento."]),
            ("Preguntas frecuentes", ["Los números de las gráficas mensuales se calculan para el mes corriente; el reporte del mes anterior se descarga desde su botón.", "Si un CSV aparece sin contacto, revisa la sincronización de datos de cliente y la calidad de los campos en Odoo.", "Las notificaciones deben ser accionables y evitar repetirse mientras no cambie la situación detectada."]),
        ],
    },
    "formularios": {
        "file": "manual-modulo-formularios.pdf", "title": "Módulo de Formularios",
        "purpose": "Crear un levantamiento profesional de requerimientos, compartirlo con clientes y conservar sus respuestas y archivos.",
        "sections": [
            ("Para el cliente", ["Abre el enlace público y completa el formulario por pasos.", "Los campos obligatorios se marcan y los errores explican cómo corregirlos.", "Guarda un borrador local para continuar más tarde.", "Antes de finalizar revisa todas las respuestas y edita cualquier sección."]),
            ("Levantamiento de requerimiento", ["Identifica cliente, contacto y tipo de solución.", "Las ramas condicionales muestran solo preguntas de báscula, códigos, estacionamiento, exportación, producción, comedor o turnos cuando aplican.", "Las dimensiones se capturan en milímetros y las muestras se pueden adjuntar como imágenes.", "La salida incluye resumen PDF, JSON, CSV/XLSX, especificación técnica y prompt para Codex."]),
            ("Para el administrador", ["Consulta la tabla de formularios y el número de respuestas.", "Usa Ver para abrir las respuestas en un modal ordenado con orientación de implementación.", "Las respuestas y adjuntos se guardan en Supabase; el sistema notifica cuando llega una nueva respuesta.", "Elimina formularios o respuestas solo después de confirmar el alcance de la acción."]),
            ("Preguntas frecuentes", ["¿Qué ocurre con un requisito no definido? Se muestra como Pendiente de confirmar; el sistema no lo inventa.", "¿Qué archivos acepta? Imágenes y documentos permitidos por el control del formulario.", "¿Puedo responder desde móvil? Sí, el flujo es responsive y los controles están pensados para tableta y teléfono."]),
        ],
    },
    "cotizador-imeba": {
        "file": "manual-modulo-cotizador-imeba.pdf", "title": "Cotizador IMEBA",
        "purpose": "Calcular costos de etiquetas con la lógica y precisión de la plantilla de referencia, incluyendo margen, tipo de cambio y cantidad de millares.",
        "sections": [
            ("Flujo de cotización", ["Captura los datos del trabajo y selecciona el margen.", "Usa el tipo de cambio USD a MXN obtenido por la misma API de la Calculadora cuando corresponda.", "Indica la cantidad de millares; el resultado final se presenta para esa cantidad, no solo para una etiqueta.", "Revisa Criterios aplicados para confirmar que los valores finales de la cantidad solicitada sean los usados en el cálculo."]),
            ("Precisión y lógica", ["Los cálculos se conservan a tres cifras decimales para coincidir con la hoja de Excel.", "Los valores de tinta y demás decisiones siguen la lógica de la plantilla vigente, no una interpretación nueva en la interfaz.", "El margen es un selector y sus valores alimentan el precio final."]),
            ("Buenas prácticas", ["Verifica unidades antes de calcular.", "Si el tipo de cambio se carga automáticamente, confirma que el campo tenga un valor numérico válido.", "Compara el resultado con un caso conocido de Excel cuando se incorpore una nueva combinación de datos."]),
        ],
    },
    "cotizador-envios": {
        "file": "manual-modulo-cotizador-envios.pdf", "title": "Cotizador de Envíos",
        "purpose": "Obtener tarifas de FedEx a partir de una orden de Odoo, productos vendibles, destino y paquetes editables, sin modificar datos de Odoo.",
        "sections": [
            ("Flujo operativo", ["Captura el número de orden y selecciona Buscar orden en Odoo.", "El destino usa primero la dirección de entrega del contacto en res.partner; si no existe, usa el contacto general y lo notifica.", "Solo entran productos de tipo Consumible y con Se puede vender habilitado.", "Los productos aparecen en Paquetes del envío; si faltan dimensiones o volumen, edítalos allí.", "Revisa el peso facturable: es el mayor entre peso real y peso volumétrico largo x ancho x alto / 5000.", "La estrategia inicial es Menos paquetes; el plan intenta resolver el envío con la menor cantidad posible de paquetes, sin impedir editar el resultado.", "Pulsa Cotizar con FedEx una sola vez y compara los servicios devueltos en pesos mexicanos."]),
            ("Configuración", ["En Credenciales se guardan de forma protegida las credenciales y el Account Number; no uses los placeholders como valores reales.", "En Base de datos de productos puedes cargar o editar dimensiones y pesos por código interno o referencia Legacy de Odoo.", "La configuración de embalaje final, cuando está habilitada, suma dimensiones de protección al volumen y costo de materia prima al resultado en MXN.", "La configuración es visible para administrador o propietario con permiso; los usuarios operativos solo cotizan."]),
            ("Errores frecuentes", ["Si FedEx devuelve 502 o 503, verifica disponibilidad del entorno, token y credenciales; no borres automáticamente la sesión del navegador.", "Si falta destino, revisa el contacto de entrega y el código postal en Odoo.", "Si una orden no se encuentra, valida el número exacto y que el usuario tenga acceso de lectura a Odoo.", "Una cotización no escribe órdenes, clientes ni productos en Odoo: las solicitudes de Odoo son de lectura."]),
            ("Preguntas frecuentes", ["¿Puedo agregar paquetes manualmente? No: los paquetes parten de la orden y se editan en el área de Paquetes del envío.", "¿Puedo dejar fuera un producto? Solo se excluyen automáticamente los que no cumplen el tipo o la opción de venta; revisa el estado antes de cotizar.", "¿Qué significa menos paquetes? Es el objetivo predeterminado para reducir bultos enviados a FedEx, sujeto a las restricciones físicas y de peso."]),
        ],
    },
    "calculadora": {
        "file": "manual-modulo-calculadora.pdf", "title": "Calculadora",
        "purpose": "Resolver cálculos operativos y conversiones, incluyendo el tipo de cambio utilizado por el Cotizador IMEBA.",
        "sections": [
            ("Uso", ["Selecciona la operación disponible y captura los valores con sus unidades.", "Revisa el resultado y el detalle de la fórmula cuando la operación lo muestre.", "Para USD a MXN, usa el valor recuperado por la API y valida la fecha de actualización."]),
            ("Calidad", ["No mezcles pesos, longitudes o monedas sin confirmar unidades.", "Los campos numéricos deben conservar precisión suficiente para alimentar otros módulos.", "Si la API no responde, no uses un tipo de cambio vacío: espera una respuesta válida o captura el valor permitido por el flujo."]),
        ],
    },
    "ajustes": {
        "file": "manual-modulo-ajustes.pdf", "title": "Módulo de Ajustes",
        "purpose": "Administrar usuarios, roles, módulos, alcances y configuraciones operativas de la plataforma.",
        "sections": [
            ("Usuarios y permisos", ["Crea o edita usuarios con correo, rol y módulos habilitados.", "El propietario joeltrincadov@gmail.com conserva acceso global al sistema.", "Un agente solo ve los módulos asignados; si no hay módulos, la pantalla informa que no tiene acceso asignado.", "Los cambios de módulos se reflejan al recargar la sesión del usuario.", "La tabla de usuarios ofrece una vista resumida y el detalle para evitar una tabla excesivamente ancha."]),
            ("Roles", ["Propietario y administrador: control amplio de configuración.", "Gerente: acceso a reportes y funciones autorizadas por permisos.", "Agente de ventas: reportes filtrados a su vendedor y compañía, sin cambiar configuración analítica.", "Agente de soporte: acceso inicial al módulo de Soportes sin carga de Odoo.", "Agente de marketing: recibe notificaciones y funciones de Marketing según su asignación."]),
            ("Configuraciones sensibles", ["Las credenciales de FedEx se gestionan desde la configuración del Cotizador de Envíos y se guardan protegidas en Supabase.", "La plantilla y el correo de notificaciones de Soportes se administran desde Ajustes.", "Los permisos y cambios sensibles deben revisarse antes de guardar para evitar dejar a un usuario sin acceso."]),
        ],
    },
}


def draw_page(canvas, doc):
    canvas.saveState()
    width, height = A4
    canvas.setStrokeColor(PALETTE["line"])
    canvas.setLineWidth(0.4)
    canvas.line(18 * mm, 14 * mm, width - 18 * mm, 14 * mm)
    canvas.setFont("Helvetica", 7)
    canvas.setFillColor(PALETTE["muted"])
    canvas.drawString(18 * mm, 9 * mm, COMPANY)
    canvas.drawRightString(width - 18 * mm, 9 * mm, f"Documentación | {doc.page}")
    canvas.restoreState()


def document(title: str, filename: str, story: list, subtitle: str):
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / filename
    doc = BaseDocTemplate(
        str(path), pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm,
        topMargin=17 * mm, bottomMargin=19 * mm, title=title, author=COMPANY,
    )
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="normal")
    doc.addPageTemplates([PageTemplate(id="main", frames=[frame], onPage=draw_page)])
    cover = [
        Spacer(1, 17 * mm),
        p("DOCUMENTACIÓN EMPRESARIAL", "CoverKicker"),
        p(title, "DocTitle"),
        p(subtitle, "Subtitle"),
        HRFlowable(width="100%", thickness=1.2, color=PALETTE["brand"], spaceAfter=7 * mm),
        p(f"Empresa: {COMPANY}"),
        p(f"Fecha de edición: {TODAY}"),
        Spacer(1, 10 * mm),
        rich(f"<b>Propósito.</b> {escape(subtitle)}", "Callout"),
        PageBreak(),
    ]
    doc.build(cover + story)
    return path


def technical_story() -> list:
    flow: list = []
    flow += section("1. Alcance y mapa del sistema", [
        "Este documento describe la versión de trabajo del sistema de Corporación Tectronic desde la perspectiva de desarrollo: arquitectura, módulos, persistencia, integraciones, permisos, funciones serverless, seguridad, pruebas y operación.",
        "La aplicación es una SPA React + TypeScript construida con Vite. La autenticación, persistencia y operaciones protegidas se resuelven con Supabase. Odoo y FedEx se consumen desde Edge Functions para no exponer secretos en el navegador.",
    ])
    flow.extend(bullets([
        "Frontend: React, React Router, React Hook Form, TanStack Query, lucide-react y estilos CSS propios.",
        "Backend administrado: Supabase Auth, Postgres, Row Level Security, Edge Functions y Storage según el flujo.",
        "ERP: Odoo consultado en modo lectura mediante las funciones de reportes, pronósticos y cotizador.",
        "Transporte: FedEx OAuth y Rates and Transit Times API detrás de shipping-quote.",
        "Persistencia local: cachés de reportes y borradores únicamente como aceleradores; la fuente de verdad de configuración y registros de negocio es Supabase.",
    ]))
    flow += section("2. Módulos y responsabilidades")
    flow.append(table(["Módulo", "Responsabilidad", "Integraciones / datos"], [
        ["Soportes", "Folios, historial, diagnóstico, reparación, autorización y entrega.", "Supabase, correo y archivos."],
        ["Inventario", "Productos, almacenes, existencias, movimientos y lotes.", "Supabase; controles de stock."],
        ["Pólizas", "Clientes, servicios, horas, recargas y archivo.", "Supabase."],
        ["Reportes", "Resumen ejecutivo, ventas, compras, marketing comercial y pronósticos.", "Odoo de lectura, Supabase, caché."],
        ["Marketing", "Segmentación, mapa de decisiones, campañas, CRM y notificaciones.", "Odoo de lectura, Supabase."],
        ["Formularios", "Levantamiento por pasos, respuestas, adjuntos y salidas.", "Supabase; enlaces públicos."],
        ["Cotizador IMEBA", "Costo de etiquetas con lógica de Excel.", "Supabase/API de tipo de cambio."],
        ["Cotizador de Envíos", "Orden Odoo, peso, paquetes y FedEx.", "Odoo de lectura, Supabase, FedEx."],
        ["Calculadora", "Operaciones numéricas y tipo de cambio.", "API de tipo de cambio."],
        ["Ajustes", "Usuarios, roles, permisos y plantillas.", "Supabase Auth y Postgres."],
    ], [34 * mm, 72 * mm, 62 * mm]))
    flow += section("3. Flujo de autenticación y permisos", [
        "La sesión se obtiene de Supabase Auth. El cliente consulta permisos por usuario y la interfaz decide qué módulos mostrar. Las Edge Functions vuelven a validar autorización en servidor para evitar que ocultar un botón sea la única barrera.",
        "El propietario designado se resuelve por la regla de correo configurada y mantiene acceso global. Los demás usuarios se autorizan por admin_module_permissions y admin_module_permission_items. El alcance puede ser all, own o el que defina el permiso vigente.",
    ])
    flow.extend(bullets([
        "Nunca confiar solo en una condición visual del frontend para proteger una operación.",
        "Funciones administrativas usan el cliente de servicio solo después de validar al usuario invocador.",
        "Odoo y FedEx no reciben credenciales desde componentes React: se leen en servidor desde secrets o tablas protegidas.",
        "La edición de permisos invalida las consultas de permisos y se refleja al recargar la sesión.",
    ]))
    flow += section("4. Integración de Odoo: fuente y reglas", [
        "Las funciones odoo-sales-report, odoo-sales-forecast y odoo-shipping-quote consultan Odoo. El sistema debe tratar Odoo como una fuente externa de solo lectura: no crear, actualizar ni borrar registros del ERP.",
        "Reportes de facturación parten del análisis de facturas: fecha de factura, estado no borrador ni cancelado, movimientos de clientes y factura o nota de crédito. Órdenes y cotizaciones parten del modelo de ventas con fecha de creación o date_order y estados separados.",
        "El contacto PUBLICO EN GENERAL se normaliza usando la dirección de entrega de res.partner cuando existe. Contactos con el mismo nombre antes de una coma se consolidan para evitar duplicidad artificial.",
    ])
    flow.append(table(["Área", "Modelo / criterio", "Regla técnica"], [
        ["Facturación", "account.move / account.invoice.report según instancia", "Fecha de factura y movimientos de cliente; conservar decimales."],
        ["Órdenes", "sale.order", "date_order + state = sale."],
        ["Cotizaciones", "sale.order", "Fecha de creación + estado de cotización."],
        ["Productos", "Líneas y producto", "Agrupar por producto, categoría y precio unitario cuando aplique."],
        ["Clientes", "res.partner", "Contacto de entrega para público general; fallback al contacto principal."],
        ["CRM", "crm.lead", "Asignación, actividad y oportunidad para alertas de seguimiento."],
    ], [34 * mm, 62 * mm, 72 * mm]))
    flow += section("5. Reportes, caché y carga progresiva", [
        "ReportsDashboard separa la carga rápida del Resumen de la carga diferida de secciones pesadas como Pronósticos. El filtro inicial puede comenzar con últimos 7 días y el resto se consulta progresivamente según la arquitectura vigente.",
        "reportsDatasetCache y reportsForecastCache reducen solicitudes repetidas. La caché debe tener clave por usuario, rol, alcance, rango y filtros; debe limitar tamaño, expirar y conservar la última lectura válida cuando Odoo no esté disponible.",
        "La regla de actualización es explícita: cambiar filtros o pulsar Actualizar solicita una lectura nueva. Mientras tanto, la UI conserva el último snapshot y muestra un estado en español entendible.",
    ])
    flow.extend(bullets([
        "Evitar N+1: pedir por lotes y agrupar en memoria o con agregaciones.",
        "Solicitar campos usados y no transferir datasets completos si solo se necesita Top N o una serie.",
        "Mantener los decimales de moneda; formatear únicamente para presentación.",
        "Ocultar la comparación anterior si no hay observaciones comparables, en vez de dibujar una línea en cero.",
    ]))
    flow += section("6. Cotizador de Envíos y motor de paquetes", [
        "ShippingQuotesDashboard obtiene una orden sin escribir en Odoo. La dirección destino prioriza el partner de entrega (type = delivery) relacionado con el partner original; si no hay código postal, usa el contacto general como fallback y lo informa.",
        "La línea elegible requiere producto vendible y tipo Consumible. Las dimensiones pueden venir del perfil de producto en Supabase o ser completadas manualmente. El peso facturable es max(peso real, peso volumétrico), con peso volumétrico largo x ancho x alto / 5000.",
        "El motor compartido en supabase/functions/_shared/shipping-packing.ts genera y valida planes. La estrategia MIN_PACKAGES es ahora el valor inicial del frontend y se muestra como Menos paquetes. El usuario aún puede elegir otras estrategias y editar el plan.",
        "El payload a FedEx usa paquetes reales con dimensiones externas y peso bruto. La configuración final puede añadir protección: volumen adicional calculado y costo de materia prima sumado a la tarifa mostrada en MXN.",
    ])
    flow += section("7. Supabase: migraciones y tablas")
    flow.append(p("El repositorio contiene las siguientes migraciones versionadas. Deben aplicarse en orden en el proyecto objetivo y verificarse con el estado de migraciones antes de desplegar:"))
    flow.extend(bullets(MIGRATIONS))
    flow.append(Spacer(1, 2 * mm))
    flow.append(p("Tablas detectadas por el inventario SQL del repositorio:"))
    flow.extend(bullets(TABLES))
    flow += section("8. Edge Functions", [
        "Todas las funciones se ejecutan en Supabase Edge Runtime. Las funciones públicas de integración validan JWT cuando corresponde, responden JSON y deben normalizar errores para que el frontend no intente interpretar HTML como JSON.",
    ])
    function_rows = []
    purposes = {
        "admin-create-user": "Crear usuario y permisos iniciales.",
        "admin-update-user": "Editar correo, rol, módulos y permisos.",
        "admin-delete-user": "Eliminar usuario con autorización administrativa.",
        "admin-get-permissions": "Listar permisos para administración.",
        "get-my-module-permissions": "Resolver módulos del usuario actual.",
        "admin-get-supports": "Consultar soportes para administración.",
        "admin-get-shipping-quote-settings": "Leer configuración protegida de envíos.",
        "admin-save-shipping-quote-settings": "Guardar credenciales y origen FedEx.",
        "admin-get-support-mailer-settings": "Leer plantilla/correo de Soportes.",
        "admin-save-support-mailer-settings": "Guardar configuración de correo.",
        "send-support-status-email": "Enviar actualización de estado de soporte.",
        "odoo-sales-report": "Consultar dataset de ventas y facturación de Odoo.",
        "odoo-sales-forecast": "Consultar histórico para modelos de pronóstico.",
        "odoo-shipping-quote": "Compatibilidad histórica para lectura de Odoo en envíos.",
        "shipping-quote": "Cotizar FedEx, validar paquetes y guardar cotización.",
    }
    for name in FUNCTIONS:
        function_rows.append([name, purposes.get(name, "Función serverless del sistema."), "Lectura" if name.startswith("odoo-") else "Supabase / API protegida"])
    flow.append(table(["Edge Function", "Responsabilidad", "Tipo de operación"], function_rows, [43 * mm, 88 * mm, 37 * mm]))
    flow += section("9. Seguridad y secretos", [
        "Las credenciales Odoo, FedEx y claves de servicio no deben compilarse en el frontend. Se almacenan en secrets de la Edge Function o en tablas con acceso restringido, nunca en localStorage.",
        "La tabla de configuración puede devolver máscaras o indicadores de configurado, pero no secretos completos. Después de guardar, el formulario debe mostrar el valor persistido o una máscara correcta, no un placeholder engañoso.",
        "RLS limita consultas directas. Las operaciones administrativas pasan por funciones que comprueban el rol. Los logs no deben incluir tokens, API keys, contraseñas ni cuerpos completos con información sensible.",
    ])
    flow += section("10. Pruebas y operación", [
        "Antes de publicar, ejecutar typecheck, lint, pruebas unitarias del motor de paquetes y build de Vite. Verificar además una orden Odoo, una respuesta FedEx, una configuración guardada y un usuario con cada rol.",
        "Para incidencias de producción, identificar si el error es de frontend, Supabase o proveedor externo. Un 502/503 de FedEx no prueba que el token esté mal; revisar transactionId, disponibilidad, entorno y payload validado.",
    ])
    flow.extend(bullets([
        "Caso Odoo: solo lectura, partner de entrega, estado y rango correctos.",
        "Caso FedEx: token válido, Account Number persistido, destino MX, peso y dimensiones positivas.",
        "Caso permisos: propietario ve todo; agente ve solo lo asignado; soporte no dispara carga de Odoo.",
        "Caso resiliencia: caché visible, mensaje en español y reintento controlado sin duplicar escrituras.",
        "Caso formularios: borrador, validación condicional, adjuntos, respuesta y notificación.",
    ]))
    flow += section("11. Referencias de código", [
        "Frontend principal: src/features/admin/AdminPage.tsx y src/features/admin/settingsService.ts.",
        "Reportes: src/features/reports/ReportsDashboard.tsx, reportsService.ts, odooSalesCore.ts y reportsAnalytics.ts.",
        "Envíos: src/features/shipping/ShippingQuotesDashboard.tsx, ShippingPackingWorkspace.tsx, packingPreview.ts, packingEngine.ts y shippingQuotesService.ts.",
        "Backend de envíos: supabase/functions/shipping-quote/index.ts y supabase/functions/_shared/shipping-packing.ts.",
        "Esquema: supabase/migrations/*.sql. Configuración de funciones: supabase/config.toml.",
    ])
    return flow


def module_story(module_key: str, meta: dict) -> list:
    flow: list = []
    flow += section("1. Para qué sirve", [meta["purpose"]])
    flow += section("2. Guía de uso")
    for title, paragraphs in meta["sections"]:
        flow.append(p(title, "H2Doc"))
        flow.extend(p(item) for item in paragraphs)
    flow += section("3. Criterios de calidad", [
        "Captura información concreta, conserva las unidades y valida el resultado antes de compartirlo.",
        "Respeta el rol asignado: las opciones visibles dependen del permiso y el sistema vuelve a validar las operaciones sensibles.",
        "Si una integración externa falla, conserva el último dato válido, registra el mensaje y evita repetir acciones que puedan duplicar información.",
    ])
    flow += section("4. Soporte rápido", [
        "Recarga la página solo después de confirmar que la sesión sigue activa. Si el problema persiste, anota módulo, usuario, hora, folio y mensaje exacto.",
        "Para datos de Odoo, valida primero filtros, compañía, vendedor, fechas y estados. Para Supabase, revisa permisos y configuración del entorno.",
    ])
    return flow


def main():
    technical = document(
        "Documentación técnica del proyecto",
        "documentacion-tecnica-proyecto.pdf",
        technical_story(),
        "Arquitectura, módulos, reglas, integraciones, seguridad, Supabase y operación para el equipo de desarrollo.",
    )
    manuals = []
    for key, meta in MODULES.items():
        manuals.append(document(
            meta["title"], meta["file"], module_story(key, meta),
            f"Manual de usuario de {meta['title']}: propósito, pasos, indicadores, ejemplos y solución de dudas.",
        ))
    print(f"Generados {len(manuals) + 1} PDFs en {OUT}")
    print(technical)
    for path in manuals:
        print(path)


if __name__ == "__main__":
    main()
