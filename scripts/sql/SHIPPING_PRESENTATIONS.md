# Carga de presentaciones estándar

`shipping-quote` **v52**: al finalizar cada paquete, un equipo embalado que viaja solo usa su caja propia, sin caja exterior ni tara extra, aunque el envío tenga varios paquetes. Si comparte paquete con otros productos, conserva el embalaje exterior necesario. La regla aplica también a la validación del servidor y no modifica las preferencias de producto.

Estrategias vigentes (`shipping-quote` **v51**): una caja propia puede consolidarse como bloque cerrado con otros productos. Menos paquetes prioriza cantidad y luego peso facturable; Compacto prioriza volumen exterior; Equilibrado combina peso, paquetes y volumen mediante una puntuación heurística sin valor monetario; Conservador aplica ocupación máxima de 80% y separación de frágiles. Las reglas de aislamiento explícito y los límites físicos prevalecen. La búsqueda es acotada y no garantiza optimalidad global. Frontend actualizado pendiente de publicación por Joe.

Última aclaración de Joe: `shipping-quote` **v50** admite equipos y cajas completas con dimensiones propias y peso bruto, sin tara exterior adicional; esto no marca `original_package` en las fichas. Etiquetas vendidas por caja utilizan la presentación completa cuando la ficha describe un rollo. El visor conserva las colocaciones individuales (caso de 13 rollos verificado). Frontend local con tarjetas en cuadrícula, resumen más ancho e input de orden limitado a 300 px.

Estado vigente tras el ajuste solicitado por Joe: `shipping-quote` **v49** activa; **cero** productos marcados como empaque original, **208** presentaciones solo de etiquetas/tickets. Se retiraron de Supabase las 78 presentaciones de ribbons y se regeneró el archivo SQL local con la misma restricción. Los cambios de preferencias quedaron auditados. El frontend actualizado añade interruptores compactos, acciones con iconos, colores por producto y cotas en el visor; pendiente de publicación por Joe.

Actualización de interfaz del 12 de noviembre de 2026: `shipping-quote` **v48** publicada y verificada, con acción de borrado administrativo auditado y recuperación reforzada de medidas individuales. Frontend local con navegación superior, formulario organizado y consulta automática al continuar a Tarifas; los reintentos se realizan con Cotizar con FedEx. El frontend actualizado sigue pendiente de publicación por Joe. No se eliminaron productos durante las pruebas.

Datos preparados del archivo **TEC-ALM-Empaque Medidas y Peso.xlsx**. La extracción revisada deja **208 presentaciones** de etiquetas y tickets; los ribbons se excluyen de esta función. Los motivos de las exclusiones están en el conjunto de datos. Equipos y otros productos no se convierten en rollos.

## Publicación

Estado verificado el 12 de noviembre de 2026: Joe autorizó expresamente continuar en Supabase. `shipping-quote` v47 está activa, con JWT habilitado. Las 286 presentaciones se cargaron y se compararon exactamente con la fuente; hay 286 registros de auditoría. Los 539 productos conservaron sus pesos y dimensiones individuales y siguen activas las seis cajas. **Solo falta que Joe publique el frontend actualizado y valide el flujo autenticado. No es necesario repetir la carga SQL.** Los pasos siguientes se conservan como procedimiento reproducible.

1. Desplegar la función `shipping-quote` con sus dependencias actualizadas, especialmente `_shared/shipping-catalog.ts` y `_shared/shipping-packing.ts`.
2. Publicar el frontend compilado con `npm run build`.
3. Ejecutar `scripts/sql/load-shipping-standard-presentations.sql` en la base correspondiente al cotizador. Es una carga de datos, no una migración de esquema.
4. Revisar el resultado por SKU. `APPLIED_OR_ALREADY_IDENTICAL` confirma la presentación; los demás estados indican productos ausentes, presentaciones previas conservadas o empaques originales conservados.
5. Recargar el cotizador y consultar un producto con presentación configurada. No comparar tarifas todavía: el bloque actual compara el embalaje físico.

La carga conserva pesos y medidas individuales, añade solo `logistics_metadata.standard_presentation` y registra cada modificación en `shipping_settings_audit`. No reemplaza presentaciones existentes y puede ejecutarse de nuevo sin duplicar cambios. Ya se ejecutó y verificó en el proyecto Supabase `sqzrvzwyvjeosuvzotja`.

## Interfaz y visor preparados en local

La nueva cotización se organiza en pestañas Productos, Embalaje y Tarifas. El visor del embalaje usa las posiciones y orientaciones del plan calculado; permite cambiar de paquete, girar, acercar, ver desde arriba, alternar transparencia de la caja exterior e identificar unidades desde el dibujo o la lista accesible. Las presentaciones cerradas se representan como bloques completos: no se simula un interior desconocido. En paquetes con más de 120 unidades se simplifican las formas para mantener fluidez.

La interfaz es un cambio de frontend; no requiere otra migración ni otro despliegue de `shipping-quote`. Joe mantiene la publicación del frontend a su cargo. La consulta real de tarifas se conserva y sigue requiriendo sesión y configuración FedEx; las pruebas locales del visor no sustituyen una prueba autenticada completa.

### Ejemplo documentado

`051025TD011P0000C1P2K5`: 2.5 millares por rollo; **36 rollos por caja**, **38 × 38 × 22 cm exteriores**, **18 kg brutos**. Fuente: hoja Etiquetas de Linea, fila 51. Una venta de 100 millares equivale a 40 rollos y se separa en una presentación de 36 y cuatro sobrantes.

El peso de la presentación ya incluye su cartón. Si no cabe en una caja exterior disponible o supera su máximo provisional, esa alternativa no se ofrece. Por ejemplo, los 18 kg de esta presentación más los cuatro rollos y la tara exterior pueden superar el límite provisional de 20 kg de la caja máster. No se aumenta ese límite automáticamente.

Los valores del Excel son **declarados**, no mediciones nuevas. Las dimensiones de caja se interpretan en el orden original **ancho × largo × alto** y se convierten a los campos correspondientes. No se asigna capacidad 36 a otros SKU. Los productos sin datos físicos individuales completos continúan pendientes hasta completarlos.

## Archivos y verificación local

- `scripts/data/shipping-standard-presentations.json`: presentaciones, exclusiones, hoja/fila y SHA-256 del Excel.
- `scripts/prepare-shipping-presentations.py`: regenera la carga desde la extracción revisada en `tmp/product-analysis/normalized.json`; usa la instantánea del catálogo, si existe. No conecta ni escribe en una base.
- `scripts/test-shipping-presentations-import.mjs`: prueba local PostgreSQL con PGlite; requiere `@electric-sql/pglite` instalado o la instalación temporal existente en `tmp/catalog-sql-check`.
- `src/features/shipping/__tests__/shippingPresentation.test.ts`: pruebas del cálculo y paridad cliente/servidor.
