# Tectronic Intelligence 0.3.0

Plugin privado con MCP remoto desplegado en el proyecto `soporte_tectronic` y motor Python local.

## Conectar

Instalar o actualizar el plugin y configurar la clave de integración en el formulario seguro de la conexión. La clave se entrega por separado, nunca dentro del ZIP, las instrucciones o el chat. No requiere una cuenta de usuario Tectronic. Una conexión compartida tiene acceso gerencial compartido.

El endpoint es `https://sqzrvzwyvjeosuvzotja.supabase.co/functions/v1/tectronic-intelligence-mcp`. Autenticación Bearer. Herramientas: `estado_datos` y `consultar_ventas`. Solo lecturas de agregados de ventas; no SQL libre, modificaciones ni conexiones directas a Odoo.

## Reportes

El motor ejecutivo requiere Python, matplotlib y reportlab y genera reporte-gerencial.pdf, reporte-gerencial.html, analysis.json y gráficas. Incluye análisis de ventas y margen, semanas comparables dentro del periodo, vendedores, empresas, concentración y decisiones sustentadas. El motor breve anterior permanece disponible para solicitudes expresas de resumen. Los datos se obtienen con las herramientas del plugin y se pasan al script según SKILL.md. La plataforma debe ofrecer ejecución local; la instalación del plugin no proporciona Python en plataformas que no lo tienen. No incluye modelos predictivos entrenados.

## Operación

El servidor guarda únicamente un hash SHA-256 de la clave de integración en auth-config.ts. Para revocar o rotar, generar una nueva clave y actualizar ese hash con un nuevo despliegue. Las claves administrativas propias del servidor Supabase nunca salen de su entorno.

El límite de 60 solicitudes por minuto es por instancia del proceso; no es una cuota global distribuida. Las consultas tienen campos y tablas fijas, tamaño de página limitado a 500 y timeout. No hay snapshot transaccional entre páginas. El estado de sincronización determina la cobertura; registros viejos no prueban historia completa.

Este paquete no contiene datos comerciales ni secretos.
