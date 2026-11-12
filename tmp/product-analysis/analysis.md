Fecha: <date start="2026-11-11" />. Estado: análisis y propuesta; sin altas ni modificaciones de productos en producción.

Proyecto: <mention url="https://app.notion.com/p/3e5125790739815fa40aef69bcb8f681">Corporación Tectronic</mention>. Fuente: [TEC-ALM-Empaque Medidas y Peso.xlsx](https://chatgpt.com/library?file_id=libfile_c70be91f120c8191a594c39d59707c60&account_id=personal).

## Resultado

Se revisaron seis hojas, 571 filas con código y 553 SKU distintos. Hay 18 SKU repetidos con dos registros cada uno. Las filas de fórmulas y casillas sin código no se contaron como productos. No se detectaron errores Excel guardados #REF!, #VALUE!, #DIV/0! o #N/A en las filas de producto. Se analizaron valores guardados y fórmulas: no se actualizaron vínculos externos.

No hay una terna explícita de dimensiones individuales de rollos/ribbons. Las medidas del empaque y las de la etiqueta no son las del rollo. Los 72 equipos tienen peso y caja: son candidatos a cargar como equipo embalado, tras confirmar una pieza por empaque y unidad Odoo.

## Lógica propuesta, aún por validar

Separar cantidad comercial Odoo, unidad física manipulable y presentación de transporte. Conservar cantidad, unidad y precio comerciales sin alterarlos. Calcular physicalQuantity para el motor de empaque y guardar el factor aplicado en el historial.

Para millares: rollos = cantidadOdoo / millaresPorRollo. Para etiquetas individuales: rollos = cantidadOdoo / etiquetasPorRollo. Para rollos/piezas: conversión 1:1 solamente con UDM confirmada. Para cajas cerradas: preservar dimensiones y bruto de la caja; multiplicar por su contenido únicamente si se decide abrir y reempacar. Para metros: metrosVendidos/metrosPorRollo con capacidad específica.

Si salen rollos fraccionarios, marcar pendiente para confirmar rebobinado o venta parcial. No redondear silenciosamente. Usar tolerancia de decimales para evitar falsos errores de coma flotante.

Capacidad: configuración explícita validada > lectura contextual del SKU contrastada con descripción. El cociente millaresCaja/rollosCaja es control, pero procede de una fórmula basada en la descripción. SKU 2K5 significa 2.5 millares solo en familias de etiquetas compatibles. N250 y M750 requieren contexto y descripción; códigos sin capacidad pueden resolverse por descripción con revisión. 0K0 no es divisor cero: hay continuos. No interpretar CSC10M como diez millares; su descripción dice caja de 250 rollos.

Peso: preferir medición individual validada. Conservar como estimación (bruto - tara)/contenido cuando solo existe caja. La tara de 0.4 kg no está medida por presentación. Ribbon usa 0.10/0.15/0.25 kg según volumen. Para equipo en su empaque conservar bruto sin descontar tara ni duplicar una caja adicional.

Dimensiones: registrar diámetro exterior y ancho axial para rollos medidos. Una envolvente rectangular puede ser diámetro × diámetro × ancho axial con orientación libre. Ancho de etiqueta y centro no alcanzan para conocer diámetro o ancho axial exacto. No dividir dimensiones de caja ni deducir dimensiones a partir de peso volumétrico.

## Ejemplo verificado

Etiquetas de Linea, fila 51: 051025TD011P0000C1P2K5. 36 rollos/caja, 90 millares/caja, caja ancho 38 × largo 38 × alto 22 cm y bruto 18 kg. Capacidad 2.5 millares/rollo. Peso calculado (18-0.4)/36 = 0.488888889 kg por rollo. Dimensiones individuales pendientes. 5 millares → 2 rollos; 90 millares → 36 rollos; 1 millar → 0.4 rollo, requiere decisión operativa.

## Hallazgos por resolver

040031TT011P0000C3G10K: SKU sugiere 10K y descripción R10.5K. Conflicto: no convertir hasta validar. 30GT-BPO: peso individual declarado 0.08 kg frente a calculado 0.09 kg; además Sin Registro x Caja está activado aunque existen datos de caja. 18 códigos tienen múltiples empaques/proveedores: conservar cada variante sin promediar ni usar el último registro como verdad.

Otros: 38 códigos sin peso o medidas. En Diseño y Especiales faltan pesos en cinco filas; en Ribbon faltan en 19. Los nombres Peso Real no acreditan medición trazable: validar unidad y fuente.

## Implementación y carga

El código actual entrega product_uom_qty directamente como quantity al motor físico; falta una conversión comercial previa. El catálogo actual exige dimensiones completas para guardar producto, por lo que no admite correctamente todos estos registros parciales. Proponer perfiles de producto con estado parcial/verificado y presentaciones por proveedor. No sobreescribir cantidad/precio comercial, porque también alimentan la distribución de costo de envío.

Orden: preparar candidatos con fuente hoja/fila; cruzar SKU y UDM con Odoo en lectura; resolver conflictos; aprobar factor y peso por presentación; medir dimensiones faltantes; cargar cambios verificables de forma idempotente; comparar antes/después y verificar cada escritura. Iniciar piloto con el SKU 2K5, un equipo y un térmico vendido por caja. Ningún producto ha sido cargado a producción por este análisis.

## Inventario de hojas

| Hoja | Filas con SKU | SKU distintos |
| --- | --- | --- |
| Etiquetas de Linea | 158 | 143 |
| Etiquetas de Diseño y Especiale | 117 | 117 |
| Termico, Marca precio | 47 | 44 |
| Equipos | 72 | 72 |
| Ribbon | 139 | 139 |
| Otros | 38 | 38 |

## Etiquetas de Linea — columna por columna

| Columna | Nombre | Con valor guardado | Uso e interpretación |
| --- | --- | --- | --- |
| A | Producto | 158 | Clave de cruce exacta con default_code de Odoo. Preservar ceros iniciales y variantes. |
| B | Descripcion | 158 | Referencia comercial. Contiene capacidad o presentación en algunos casos; proviene de fórmulas con datos externos guardados en el XLSX. |
| C | Rollos por Tubo | 123 | Jerarquía de empaque. No son dimensiones del rollo; confirmar significado físico de tubo. |
| D | Cantidad de Tubos x  Caja | 117 | Cantidad de agrupaciones por caja. |
| E | Total Rollos x Caja | 117 | Contenido de la caja; normalmente calculado. No confundir con cantidad vendida en Odoo. |
| F | Total Millares x Caja | 117 | Total comercial por caja; dividido entre rollos permite revisar capacidad. Es fórmula basada en descripción, no medición independiente. |
| G | Caja de Empaque (ancho x largo x alto cm) | 123 | Medidas de la caja exterior. Separar ancho, largo, alto en este orden; no asignar al rollo. |
| H | Peso Real x Caja | 117 | Peso bruto declarado de la presentación. Confirmar kg. Incluye empaque. |
| I | Medida | 158 | Tamaño de la etiqueta derivado del SKU, no tamaño exterior del rollo. Confirmar mm. |
| J | Material | 158 | Clasificación del material; no deducir peso ni diámetro sin especificaciones. |
| K | Centro | 158 | Núcleo del rollo, no diámetro exterior. Valores mezclan números y texto; confirmar unidad. |
| L | Sin Registro x Caja | 158 | Indicador auxiliar; no prueba que falten datos ni que estén completos. Validar los campos reales. |
| M | Calculo Peso x Rollo | 117 | Peso estimado: (bruto - 0.4 kg)/rollos. Tara supuesta; no es peso medido. |
| N | Calculo Peso Volumetrico Caja | 117 | Volumen exterior /5000. Nunca usar como peso físico individual. |
| O | Valor mas alto | 117 | Comparación del peso físico y volumétrico de la caja. |
| P | Redondeo para Paqueteria | 117 | Estimación redondeada de peso facturable; no es peso físico del producto. |
| Q | Peso Real x Rollo | 45 | Peso individual declarado directamente. Preferente tras verificar fecha, fuente, precisión y presentación. |
| R | Observaciones | 34 | Conservar proveedor, variante, reempacado y CONFIRMAR; afectan selección del perfil. |

### Registros producto por producto

Capacidad en millares/rollo es candidata, no confirma UDM Odoo. Peso calculado no equivale a peso medido. Medidas listadas son de caja; las individuales permanecen pendientes, salvo posible perfil de equipo embalado. Cada fila original se conserva por separado.

| Fila | SKU | Descripción | Millares/rollo candidato | Contenido/caja | Caja ancho×largo×alto cm | Bruto caja kg | Peso unitario candidato kg | Origen peso | Alertas / observaciones |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2 | 020020BM044P0000C3O5K0 | 020*020 BM04 HOLOGRAMA 5K CIRCULO | 5.0 | Pendiente | Pendiente | Pendiente | 0.25 | MEDIDO_DECLARADO |   |
| 3 | 025260BB081P0000C1N250 | BRAZALETE 25*260 BB08 BLANCO R0.25K CON SPOT | 0.25 | Pendiente | Pendiente | Pendiente | 0.25 | MEDIDO_DECLARADO |   |
| 4 | 025260BB091P000KC1N250 | BRAZALETE 25*260 BB09 BLANCO R0.25K CON SPOT | 0.25 | 72.0 | 30X30X32 | 21.1 | 0.29 | MEDIDO_DECLARADO |  EMPAQUE VARIABLE |
| 5 | 025260BB091P0021C1N250 | BRAZALETE 25*260 BB09 NARANJA 021 2T R0.25K CON SPOT | 0.25 | 72.0 | 30X30X32 | 21.1 | 0.29 | MEDIDO_DECLARADO |  EMPAQUE VARIABLE |
| 6 | 027013TD013P0000C1G12K | 27*13 TD01 BLANCO R12K | 12.0 | 21.0 | 24X42X30 | 14.9 | 0.690476 | CALCULADO_CON_TARA_SUPUESTA | VARIANTES_MISMO_SKU SIMARC |
| 7 | 027013TD013P0000C1G12K | 27*13 TD01 BLANCO R12K | 12.0 | 18.0 | 38X38X20 | 13.1 | 0.705556 | CALCULADO_CON_TARA_SUPUESTA | VARIANTES_MISMO_SKU RIBETEC |
| 8 | 027013TT013P0000C1G12K | 27*13 TT01 BLANCO R12K | 12.0 | 18.0 | 38X38X19 | 12.6 | 0.677778 | CALCULADO_CON_TARA_SUPUESTA |   |
| 9 | 027013TT013P0000C3G24K | 27*13 TT01 BLANCO R24K | 24.0 | 8.0 | 38X38X19 | 11.5 | 1.3875 | CALCULADO_CON_TARA_SUPUESTA |   |
| 10 | 028020BM041P0000C3G9K0 | 028*020 BM04 R9K HOLOGRAMA | 9.0 | Pendiente | Pendiente | Pendiente | 0.7 | MEDIDO_DECLARADO |   |
| 11 | 028020BM042P0000C3D5K0 | 028*020 BM04 HOLOGRAMA 5K  CORTE DE SEGURIDAD | 5.0 | Pendiente | Pendiente | Pendiente | 0.45 | MEDIDO_DECLARADO |   |
| 12 | 030017PL013P0000C1G9K0 | 30*17 PL01 PLATINIUM R9K | 9.0 | Pendiente | Pendiente | Pendiente | 1.05 | MEDIDO_DECLARADO |   |
| 13 | 030017PL013PC3T021KS | 30*17 PL01 PLATINIUM R21K | 21.0 | Pendiente | Pendiente | Pendiente | 2.45 | MEDIDO_DECLARADO |   |
| 14 | 030022BB013P0000C3G18K | 30*22 BB01 BLANCA R18K | 18.0 | 8.0 | 38X38X22 | 13.7 | 1.6625 | CALCULADO_CON_TARA_SUPUESTA |   |
| 15 | 030022TD011P0000C1G2K0 | 30*22 TD01 BLANCO R2K | 2.0 | 63.0 | 38X38X23 | 14.3 | 0.220635 | CALCULADO_CON_TARA_SUPUESTA |   |
| 16 | 030022TD011P0000C1G400 | 30*22 TD01 BLANCA R0.4K | 0.4 | Pendiente | Pendiente | Pendiente | 0.05 | MEDIDO_DECLARADO |   |
| 17 | 030022TT013P0000C3G18K | 30*22 TT01 BLANCO R18K | 18.0 | 8.0 | 38X38X22 | 15.5 | 1.8875 | CALCULADO_CON_TARA_SUPUESTA |   |
| 18 | 030030BT013P0000C3O15K | 30*30 BT01 TRANSPARENTE R15K CIRCULO CON SPOT | 15.0 | 8.0 | 38X38X22 | 15.2 | 1.85 | CALCULADO_CON_TARA_SUPUESTA |   |
| 19 | 030200NY011P0000C3C0K0 | 30mm*200mts NY01 BLANCO CONTINUO NT | Pendiente | 11.0 | 28X28X36 | 5.6 | 0.472727 | CALCULADO_CON_TARA_SUPUESTA | CAPACIDAD_NO_RESUELTA  |
| 20 | 030260NY013P0000C3N2K1 | 30*260 NY01 BLANCO R2.1K CON SPOT | 2.1 | 8.0 | 38X38X22 | 10.4 | 1.25 | CALCULADO_CON_TARA_SUPUESTA |   |
| 21 | 032065NY013P000KC3N7K5 | 32*65 NY01 BLANCO R7.5K CON SPOT | 7.5 | 8.0 | 38X38X22 | 9.4 | 1.125 | CALCULADO_CON_TARA_SUPUESTA |   |
| 22 | 036024TD011P0000C1G2K5 | 36*24 TD01 BLANCO R2.5K | 2.5 | 45.0 | 38X38X23 | 15.3 | 0.331111 | CALCULADO_CON_TARA_SUPUESTA |   |
| 23 | 038025TD011P0000C1G2K0 | 38*25 TD01 BLANCO R2K | 2.0 | 45.0 | 38X38X22 | 14.4 | 0.311111 | CALCULADO_CON_TARA_SUPUESTA |   |
| 24 | 038025TD011P0000C1G400 | 38*25 TD01 BLANCA R.4K | 4.0 | Pendiente | Pendiente | Pendiente | 0.05 | MEDIDO_DECLARADO |   |
| 25 | 038025TT012P0000C3G12K | 38*25 TT01 BLANCO R12K | 12.0 | 8.0 | 38X38X19 | 14.7 | 1.7875 | CALCULADO_CON_TARA_SUPUESTA |   |
| 26 | 038064CA031P0000C3G1K5 | 38*64 CA03 BLANCO R1.5K MARBETE | 1.5 | 20.0 | 38X38X23 | 13.9 | 0.675 | CALCULADO_CON_TARA_SUPUESTA |   |
| 27 | 040022TD012P0000C1G5K0 | 40*22 TD01 BLANCO R5K | 5.0 | 21.0 | 24X42X30 | 15.6 | 0.72381 | CALCULADO_CON_TARA_SUPUESTA |  SIMARC |
| 28 | 040022TT012P0000C3G14K | 40*22 TT01 BLANCO R14K | 14.0 | 8.0 | 38X38X19 | 15.0 | 1.825 | CALCULADO_CON_TARA_SUPUESTA |   |
| 29 | 040031TT012P0000C1G4K0 | 40*31 TT01 BLANCO R4K | 4.0 | 18.0 | 38X38X19 | 14.0 | 0.755556 | CALCULADO_CON_TARA_SUPUESTA |   |
| 30 | 040040TD011P0000C1O1K5 | 40*40 TD01 BLANCA R1.5K CIRCULAR | 1.5 | Pendiente | Pendiente | Pendiente | 0.35 | MEDIDO_DECLARADO |   |
| 31 | 040040TD011P0000C1O250 | 040*040 TD01 BLANCO R0.250K CIRCULAR | 0.25 | Pendiente | Pendiente | Pendiente | 0.05 | MEDIDO_DECLARADO |   |
| 32 | 040040TD011P000YC1O1K0 | 040*040 TD01 AMARILLO R1K CIRCULAR | 1.0 | Pendiente | Pendiente | Pendiente | 0.25 | MEDIDO_DECLARADO |   |
| 33 | 040040TD011P0217C1O1K0 | 040*040 TD01 1T ROSA 217C R1K CIRCULAR | 1.0 | Pendiente | Pendiente | Pendiente | 0.25 | MEDIDO_DECLARADO |   |
| 34 | 040040TD011P0248C1O1K0 | 040*040 TD01 1T MORADO 248 R1K CIRCULAR | 1.0 | Pendiente | Pendiente | Pendiente | 0.25 | MEDIDO_DECLARADO |   |
| 35 | 040040TD011P0291C1O1K0 | 040*040 TD01 1T AZUL 291C R1K CIRCULAR | 1.0 | Pendiente | Pendiente | Pendiente | 0.25 | MEDIDO_DECLARADO |   |
| 36 | 040040TD011P0367C1O1K0 | 040*040 TD01 VERDE 367 R1K CIRCULAR | 1.0 | Pendiente | Pendiente | Pendiente | 0.25 | MEDIDO_DECLARADO |   |
| 37 | 040040TD011P1485C1O1K0 | 040*040 TD01 NARANJA 1485 C R1K CIRCULAR | 1.0 | Pendiente | Pendiente | Pendiente | 0.25 | MEDIDO_DECLARADO |   |
| 38 | 050050BT011P0000C1O1K0 | 50*50 BT01 TRANSPARENTE R1K CIRCULO CON SPOT | 1.0 | Pendiente | Pendiente | Pendiente | 0.3 | MEDIDO_DECLARADO |   |
| 39 | 050200NY011P0000C3C0K0 | 50mm*200mts NY01 BLANCO CONTINUO NT | Pendiente | 5.0 | 28X28X36 | 4.3 | 0.78 | CALCULADO_CON_TARA_SUPUESTA | CAPACIDAD_NO_RESUELTA  |
| 40 | 051025BB011P0000C1G2K5 | 51*25 BB01 BLANCO R2.5K | 2.5 | 36.0 | 38X38X23 | 15.3 | 0.413889 | CALCULADO_CON_TARA_SUPUESTA |   |
| 41 | 051025BB011P000YC1G2K5 | 51*25 BB01 AMARILLO R2.5K | 2.5 | 36.0 | 38X38X23 | 15.3 | 0.413889 | CALCULADO_CON_TARA_SUPUESTA |   |
| 42 | 051025BB011PC1T02K0S | 51*25 BB01 BLANCO R2K DOBLE GRAMAJE | 2.0 | Pendiente | Pendiente | Pendiente | 0.4 | MEDIDO_DECLARADO |   |
| 43 | 051025BB091P0000C1G1K0 | 51*25 BB09 BLANCO R1K | 1.0 | Pendiente | Pendiente | Pendiente | 0.1 | MEDIDO_DECLARADO |   |
| 44 | 051025BB091P0000C1G400 | 051*025 BB09 BLANCA R0.4K | 0.4 | Pendiente | Pendiente | Pendiente | 0.23 | MEDIDO_DECLARADO |   |
| 45 | 051025BM041P0000C3D2K0 | 051*025 BM04 HOLOGRAMA R2K CORTE DE SEGURIDAD | 2.0 | 32.0 | 38X38X23 | 12.2 | 0.37 | MEDIDO_DECLARADO |   |
| 46 | 051025BT011P0000C1S2K5 | 51*25 BT01 TRANSPARENTE R2.5K CON SPOT | 2.5 | 36.0 | 38X38X23 | 16.6 | 0.45 | CALCULADO_CON_TARA_SUPUESTA |   |
| 47 | 051025PB011P0000C1G2K5 | 51*25 PB01 BLANCO R2.5K | 2.5 | 36.0 | 38X38X22 | 25.6 | 0.7 | CALCULADO_CON_TARA_SUPUESTA |   |
| 48 | 051025PL011P0000C1G2K5 | 51*25 PL01 PLATINIUM R2.5K | 2.5 | 36.0 | 38X38X22 | 25.3 | 0.691667 | CALCULADO_CON_TARA_SUPUESTA |   |
| 49 | 051025SG041P0000C1G2K5 | 51*25 SG04 PLATINO R2.5K | 2.5 | 36.0 | 38X38X22 | 22.0 | 0.6 | CALCULADO_CON_TARA_SUPUESTA |   |
| 50 | 051025TD011P0000C1P1K0 | 51*25 TD01 BLANCO R1K CON PLECA | 1.0 | 84.0 | 30X30X32 | 17.8 | 0.207143 | CALCULADO_CON_TARA_SUPUESTA |   |
| 51 | 051025TD011P0000C1P2K5 | 51*25 TD01 BLANCO R2.5K CON PLECA | 2.5 | 36.0 | 38X38X22 | 18.0 | 0.488889 | CALCULADO_CON_TARA_SUPUESTA |   |
| 52 | 051025TD011P0000C1P400 | 051*025 TD01 BLANCA R0.4K CON PLECA | 0.4 | Pendiente | Pendiente | Pendiente | 0.1 | MEDIDO_DECLARADO |   |
| 53 | 051025TD011P0000CLP0K4 | 51*25 TD01 BLANCA R0.4K CON PLECA | 0.4 | Pendiente | Pendiente | Pendiente | 0.075 | MEDIDO_DECLARADO |   |
| 54 | 051025TD011P000YC1P1K0 | 51*25 TD01 AMARILLO C R1K CON PLECA | 1.0 | 84.0 | 30X30X32 | 17.8 | 0.207143 | CALCULADO_CON_TARA_SUPUESTA | VARIANTES_MISMO_SKU, CONFIRMAR_ORIGEN RIBETEC 1  CONFIRMAR |
| 55 | 051025TD011P000YC1P1K0 | 51*25 TD01 AMARILLO C R1K CON PLECA | 1.0 | Pendiente | 38X38X22 | Pendiente | 0.2 | MEDIDO_DECLARADO | VARIANTES_MISMO_SKU, CONFIRMAR_ORIGEN RIBETEC 2 CONFIRMAR |
| 56 | 051025TD011P0217C1P1K0 | 51*25  TD01 ROSA 217C R1K CON PLECA | 1.0 | 84.0 | 30X30X32 | 17.8 | 0.207143 | CALCULADO_CON_TARA_SUPUESTA | VARIANTES_MISMO_SKU, CONFIRMAR_ORIGEN RIBETEC 1  CONFIRMAR |
| 57 | 051025TD011P0217C1P1K0 | 51*25  TD01 ROSA 217C R1K CON PLECA | 1.0 | Pendiente | 38X38X22 | Pendiente | 0.2 | MEDIDO_DECLARADO | VARIANTES_MISMO_SKU, CONFIRMAR_ORIGEN RIBETEC 2 CONFIRMAR |
| 58 | 051025TD011P0291C1P1K0 | 51*25  TD01 AZUL 291C R1K CON PLECA | 1.0 | 84.0 | 30X30X32 | 17.8 | 0.207143 | CALCULADO_CON_TARA_SUPUESTA | VARIANTES_MISMO_SKU, CONFIRMAR_ORIGEN RIBETEC 1  CONFIRMAR |
| 59 | 051025TD011P0291C1P1K0 | 51*25  TD01 AZUL 291C R1K CON PLECA | 1.0 | Pendiente | 38X38X22 | Pendiente | 0.2 | MEDIDO_DECLARADO | VARIANTES_MISMO_SKU, CONFIRMAR_ORIGEN RIBETEC 2 CONFIRMAR |
| 60 | 051025TD011P0367C1P1K0 | 51*25 TD01 VERDE 367U R1K CON PLECA | 1.0 | 84.0 | 30X30X32 | 17.8 | 0.207143 | CALCULADO_CON_TARA_SUPUESTA | VARIANTES_MISMO_SKU, CONFIRMAR_ORIGEN RIBETEC 1  CONFIRMAR |
| 61 | 051025TD011P0367C1P1K0 | 51*25 TD01 VERDE 367U R1K CON PLECA | 1.0 | Pendiente | 38X38X22 | Pendiente | 0.2 | MEDIDO_DECLARADO | VARIANTES_MISMO_SKU, CONFIRMAR_ORIGEN RIBETEC 2 CONFIRMAR |
| 62 | 051025TD011P1485C1P1K0 | 51*25  TD01 NARANJA 1485C R1K CON PLECA | 1.0 | 84.0 | 30X30X32 | 17.8 | 0.207143 | CALCULADO_CON_TARA_SUPUESTA | VARIANTES_MISMO_SKU, CONFIRMAR_ORIGEN RIBETEC 1  CONFIRMAR |
| 63 | 051025TD011P1485C1P1K0 | 51*25  TD01 NARANJA 1485C R1K CON PLECA | 1.0 | Pendiente | 38X38X22 | Pendiente | 0.2 | MEDIDO_DECLARADO | VARIANTES_MISMO_SKU, CONFIRMAR_ORIGEN RIBETEC 2 CONFIRMAR |
| 64 | 051025TD011P2345C1P1K0 | 51*25 TD01 NARANJA 2345 C R1K CON PLECA | 1.0 | 84.0 | 30X30X32 | 17.8 | 0.207143 | CALCULADO_CON_TARA_SUPUESTA | VARIANTES_MISMO_SKU, CONFIRMAR_ORIGEN RIBETEC 1  CONFIRMAR |
| 65 | 051025TD011P2345C1P1K0 | 51*25 TD01 NARANJA 2345 C R1K CON PLECA | 1.0 | Pendiente | 38X38X22 | Pendiente | 0.2 | MEDIDO_DECLARADO | VARIANTES_MISMO_SKU, CONFIRMAR_ORIGEN RIBETEC 2 CONFIRMAR |
| 66 | 051025TD012P0000C3P12K | 51*25 TD01 BLANCO R12K CON PLECA | 12.0 | 8.0 | 38X38X23 | 20.1 | 2.4625 | CALCULADO_CON_TARA_SUPUESTA |   |
| 67 | 051025TT011P0000C1P2K5 | 51*25 TT01 BLANCO R2.5K CON PLECA | 2.5 | 36.0 | 38X38X23 | 17.5 | 0.475 | CALCULADO_CON_TARA_SUPUESTA |   |
| 68 | 051025TT012P0000C3P12K | 51*25 TT01 BLANCO R12K CON PLECA | 12.0 | 8.0 | 38X38X22 | 18.8 | 2.3 | CALCULADO_CON_TARA_SUPUESTA |   |
| 69 | 051025TT012P000YC3P12K | 051*025 TT01 AMARILLO R12K CON PLECA | 12.0 | 8.0 | 38X38X22 | 18.8 | 2.3 | CALCULADO_CON_TARA_SUPUESTA |   |
| 70 | 051025TT012P0021C3P12K | 51*25 TT01 NARANJA 021 U R12K CON PLECA | 12.0 | 8.0 | 38X38X22 | 18.8 | 2.3 | CALCULADO_CON_TARA_SUPUESTA |   |
| 71 | 051025TT012P0367C3P12K | 51*25 TT01 VERDE 367 R12K CON PLECA | 12.0 | 8.0 | 38X38X22 | 18.8 | 2.3 | CALCULADO_CON_TARA_SUPUESTA |   |
| 72 | 051025VD011P0000C1S1K0 | 51*25 VD01 BLANCO R1K SEGURIDAD CON SPOT | 1.0 | Pendiente | Pendiente | Pendiente | 0.35 | MEDIDO_DECLARADO |   |
| 73 | 051032TT011P0000C1G2K0 | 51*32 TT01 BLANCO R2K | 2.0 | 36.0 | 38X38X23 | 17.0 | 0.461111 | CALCULADO_CON_TARA_SUPUESTA |   |
| 74 | 051032TT012P0000C3G10K | 51*32 TT01 BLANCO R10K | 10.0 | 6.0 | 24X42X34 | 15.2 | 2.466667 | CALCULADO_CON_TARA_SUPUESTA | VARIANTES_MISMO_SKU SIMARC |
| 75 | 051032TT012P0000C3G10K | 51*32 TT01 BLANCO R10K | 10.0 | 8.0 | 38X38X22 | 18.9 | 2.3125 | CALCULADO_CON_TARA_SUPUESTA | VARIANTES_MISMO_SKU RIBETEC |
| 76 | 051051BM011P0000C3O2K5 | 051*051 BM01 PELICULA METALIZADA R2.5K CIRCULO | 2.5 | Pendiente | Pendiente | Pendiente | 0.8 | MEDIDO_DECLARADO |   |
| 77 | 051051TD011P0000C1G1K0 | 51*51 TD01 BLANCO R1K | 1.0 | Pendiente | Pendiente | Pendiente | 0.4 | MEDIDO_DECLARADO |   |
| 78 | 051051TD011P0000C1G200 | 051*051 TD01 BLANCO R0.2K | 0.2 | Pendiente | Pendiente | Pendiente | 0.08 | MEDIDO_DECLARADO |   |
| 79 | 056013BB091P0000C1G2K0 | JOYERIA 56*13 BB09 BLANCO R2K | 2.0 | Pendiente | Pendiente | Pendiente | 0.23 | MEDIDO_DECLARADO |   |
| 80 | 058040TD011P0000C1G1K0 | 58*40 TD01 BLANCO R1KC1 | 1.0 | 45.0 | 30X30X32 | 16.8 | 0.364444 | CALCULADO_CON_TARA_SUPUESTA |   |
| 81 | 058040TD011P0000C1G250 | 058*040 TD01 BLANCO R0.250K | 0.25 | Pendiente | Pendiente | Pendiente | 0.1 | MEDIDO_DECLARADO |   |
| 82 | 058040TD011P0000C3G3K0 | 058*040 TD01 BLANCO R3K | 3.0 | 12.0 | 38X38X22 | 13.0 | 1.05 | CALCULADO_CON_TARA_SUPUESTA |   |
| 83 | 060030TT011P0000C3G5K0 | 60*30 TT01 BLANCO R5K | 5.0 | 12.0 | 38X38X22 | 16.4 | 1.333333 | CALCULADO_CON_TARA_SUPUESTA |   |
| 84 | 063011BB031P0000C1G5K0 | JOYERIA 63*11 BB03 BLANCO R5K | 5.0 | 27.0 | 38X38X22 | 13.7 | 0.492593 | CALCULADO_CON_TARA_SUPUESTA |   |
| 85 | 063011BB091P0000C1G2K5 | JOYERIA 63*11 BB09 BLANCO R2.5K | 2.5 | Pendiente | Pendiente | Pendiente | 0.3 | MEDIDO_DECLARADO |   |
| 86 | 063022BB031P0000C1G3K0 | JOYERIA 63*22 BB03 BLANCO R3K | 3.0 | 27.0 | 38X38X22 | 15.0 | 0.540741 | CALCULADO_CON_TARA_SUPUESTA |   |
| 87 | 063022BB091P0000C1G1K5 | JOYERIA 63*22 BB09 BLANCO R1.5K | 1.5 | 48.0 | 38X38X22 | 15.7 | 0.31875 | CALCULADO_CON_TARA_SUPUESTA |   |
| 88 | 076025TD011P0000C1G1K0 | 76*25 TD01 BLANCO R1K | 1.0 | Pendiente | Pendiente | Pendiente | 0.3 | MEDIDO_DECLARADO |   |
| 89 | 076025TD011P0000C1P1K0 | 076*025 TD01 BLANCO 1K CON PLECA | 1.0 | Pendiente | Pendiente | Pendiente | 0.3 | MEDIDO_DECLARADO |   |
| 90 | 076025TD011P0000C1P400 | 76*25 TD01 BLANCO R0.4K CON PLECA | 0.4 | Pendiente | Pendiente | Pendiente | 0.15 | MEDIDO_DECLARADO |   |
| 91 | 076025TT011P0000C1G2K5 | 76*25 TT01 BLANCO R2.5K | 2.5 | 27.0 | 38X38X25 | 19.8 | 0.718519 | CALCULADO_CON_TARA_SUPUESTA |   |
| 92 | 076025TT011P0000C3G6K0 | 76*25 TT01 BLANCO R6K | 6.0 | 12.0 | 38X38X25 | 21.2 | 1.733333 | CALCULADO_CON_TARA_SUPUESTA |   |
| 93 | 076038BT011P0000C1S2K0 | 76*38 BT01 TRANSPARENTE R2K CON SPOT | 2.0 | Pendiente | Pendiente | Pendiente | 0.7 | MEDIDO_DECLARADO |   |
| 94 | 076051PB011P0000C3G3K0 | 76*51 PB01 BLANCO R3K | 3.0 | 12.0 | 38X38X25 | 26.8 | 2.2 | MEDIDO_DECLARADO |   |
| 95 | 076051TD011P0000C1P120 | 76*51 TD01 BLANCO R0.120K CON PLECA | 0.12 | 192.0 | 38X38X22 | 16.6 | 0.084375 | CALCULADO_CON_TARA_SUPUESTA |   |
| 96 | 076051TD011P0000C1P1K5 | 76*51 TD01 BLANCO R1.5K CON PLECA | 1.5 | 15.0 | 24X40X25 | 14.8 | 0.96 | CALCULADO_CON_TARA_SUPUESTA | VARIANTES_MISMO_SKU SIMARC |
| 97 | 076051TD011P0000C1P1K5 | 76*51 TD01 BLANCO R1.5K CON PLECA | 1.5 | 27.0 | 38X38X25 | 24.0 | 0.874074 | CALCULADO_CON_TARA_SUPUESTA | VARIANTES_MISMO_SKU RIBETEC |
| 98 | 076051TD011P0000C3P3K0 | 76*51 TD01 BLANCO R3K CON PLECA | 3.0 | 12.0 | 38X38X25 | 22.1 | 1.808333 | CALCULADO_CON_TARA_SUPUESTA | VARIANTES_MISMO_SKU SIMARC 1 REEMPACADO |
| 99 | 076051TD011P0000C3P3K0 | 76*51 TD01 BLANCO R3K CON PLECA | 3.0 | 6.0 | 24X40X25 | 11.1 | 1.783333 | CALCULADO_CON_TARA_SUPUESTA | VARIANTES_MISMO_SKU SIMARC 2 |
| 100 | 076051TT011P0000C1P1K5 | 76*51 TT01 BLANCO R1.5K CON PLECA | 1.5 | 18.0 | 38X38X19 | 15.4 | 0.833333 | CALCULADO_CON_TARA_SUPUESTA | VARIANTES_MISMO_SKU RIBETEC 1 |
| 101 | 076051TT011P0000C1P1K5 | 76*51 TT01 BLANCO R1.5K CON PLECA | 1.5 | 27.0 | 38X38X25 | 22.9 | 0.833333 | CALCULADO_CON_TARA_SUPUESTA | VARIANTES_MISMO_SKU RIBETEC 2 |
| 102 | 076051TT011P0000C3P3K0 | 76*51 TT01 BLANCO R3K CON PLECA | 3.0 | 12.0 | 38X38X25 | 20.5 | 1.675 | CALCULADO_CON_TARA_SUPUESTA |   |
| 103 | 076051TT011P000YC3P3K0 | 76*51 TT01 AMARILLO C R3K CON PLECA | 3.0 | 12.0 | 38X38X25 | 20.5 | 1.675 | CALCULADO_CON_TARA_SUPUESTA |   |
| 104 | 076051TT011P0021C3P3K0 | 076*051 TT01 NARANJA 021 U R3K PLECA | 3.0 | 12.0 | 38X38X25 | 20.8 | 1.7 | CALCULADO_CON_TARA_SUPUESTA |   |
| 105 | 076051TT011P0367C3P3K0 | 76*51 TT01 VERDE 367 U R3K CON PLECA | 3.0 | 12.0 | 38X38X25 | 20.8 | 1.7 | CALCULADO_CON_TARA_SUPUESTA |   |
| 106 | 076076TT051P0000C3G2K0 | 76*76 TT05 BLANCO R2K | 2.0 | 12.0 | 38X38X25 | 22.4 | 1.833333 | CALCULADO_CON_TARA_SUPUESTA |   |
| 107 | 102018VD011P0000C1N2K0 | 102*18 VD01 BLANCO R2K SEGURIDAD CON SPOT | 2.0 | Pendiente | Pendiente | Pendiente | 0.9 | MEDIDO_DECLARADO |   |
| 108 | 102025TD011P0000C1G2K5 | 102*25 TD01 BLANCO R2.5K | 2.5 | 18.0 | 38X38X22 | 19.0 | 1.033333 | CALCULADO_CON_TARA_SUPUESTA |   |
| 109 | 102025TT011P0000C3G6K0 | 102*25 TT01 BLANCO R6K | 6.0 | 8.0 | 38X38X22 | 18.8 | 2.3 | CALCULADO_CON_TARA_SUPUESTA |   |
| 110 | 102038BB011P0000C1G2K0 | 102*38 BB01 BLANCO R2K | 2.0 | 18.0 | 38X38X22 | 17.3 | 0.938889 | CALCULADO_CON_TARA_SUPUESTA |   |
| 111 | 102038BT031P000KC3S6K0 | 102*038 BT03 BLANCO R6K  SPOT | 6.0 | Pendiente | Pendiente | Pendiente | 2.65 | MEDIDO_DECLARADO |   |
| 112 | 102051TD011P0000C1P1K5 | 102*51 TD01 BLANCO R1.5K CON PLECA | 1.5 | 18.0 | 24X42X34 | 21.8 | 1.188889 | CALCULADO_CON_TARA_SUPUESTA | VARIANTES_MISMO_SKU SIMARC 1 |
| 113 | 102051TD011P0000C1P1K5 | 102*51 TD01 BLANCO R1.5K CON PLECA | 1.5 | 18.0 | 32X41X33 | 22.1 | 1.205556 | CALCULADO_CON_TARA_SUPUESTA | VARIANTES_MISMO_SKU SIMARC 2 |
| 114 | 102051TD011P0000C3P3K0 | 102*51 TD01 BLANCO R3K CON PLECA | 3.0 | 6.0 | 24X41X34 | 15.0 | 2.433333 | CALCULADO_CON_TARA_SUPUESTA | VARIANTES_MISMO_SKU SIMARC |
| 115 | 102051TD011P0000C3P3K0 | 102*51 TD01 BLANCO R3K CON PLECA | 3.0 | 8.0 | 38X38X22 | 19.4 | 2.375 | CALCULADO_CON_TARA_SUPUESTA | VARIANTES_MISMO_SKU RIBETEC |
| 116 | 102051TD011P000YC1P1K5 | 102*51 TD01 AMARILLO C R1.5K CON PLECA | 1.5 | 18.0 | 30X30X32 | 21.8 | 1.188889 | CALCULADO_CON_TARA_SUPUESTA |   |
| 117 | 102051TD011P0217C1P1K5 | 102*51TD01 ROSA 217C R1.5K CON PLECA | 1.5 | 18.0 | 30X30X32 | 21.8 | 1.188889 | CALCULADO_CON_TARA_SUPUESTA |   |
| 118 | 102051TD011P0291C1P1K5 | 102*51TD01 AZUL 291C R1.5K CON PLECA | 1.5 | 18.0 | 30X30X32 | 21.8 | 1.188889 | CALCULADO_CON_TARA_SUPUESTA |   |
| 119 | 102051TD011P0367C1P1K5 | 102*51 TD01 VERDE 367U R1.5K CON PLECA | 1.5 | 18.0 | 30X30X32 | 21.8 | 1.188889 | CALCULADO_CON_TARA_SUPUESTA |   |
| 120 | 102051TD011P1485C1P1K5 | 102*51 TD01 NARANJA 1485C  R1.5K CON PLECA | 1.5 | 18.0 | 30X30X32 | 21.8 | 1.188889 | CALCULADO_CON_TARA_SUPUESTA |   |
| 121 | 102051TT011P0000C1P1K5 | 102*51 TT01 BLANCO R1.5K CON PLECA | 1.5 | 18.0 | 38X38X22 | 20.2 | 1.1 | CALCULADO_CON_TARA_SUPUESTA |   |
| 122 | 102051TT011P0000C3P3K0 | 102*51 TT01 BLANCO R3K CON PLECA | 3.0 | 8.0 | 38X38X22 | 18.3 | 2.2375 | CALCULADO_CON_TARA_SUPUESTA |   |
| 123 | 102064TT011P0000C3P2K5 | 102*64 TT01 BLANCO R2.5K CON PLECA | 2.5 | 8.0 | 38X38X22 | 19.3 | 2.3625 | CALCULADO_CON_TARA_SUPUESTA |   |
| 124 | 102076BB011P0000C3G2K0 | 102*76 BB01 BLANCO R2K | 2.0 | 8.0 | 38X38X22 | 15.6 | 1.9 | CALCULADO_CON_TARA_SUPUESTA |   |
| 125 | 102076TD011P0000C1P1K0 | 102*76 TD01 BLANCA R1K CON PLECA | 1.0 | 18.0 | 38X38X22 | 21.5 | 1.172222 | CALCULADO_CON_TARA_SUPUESTA |   |
| 126 | 102076TD011P0000C3G2K0 | 102*76 TD01 BLANCO R2K | 2.0 | 8.0 | 24X42X33 | 14.8 | 1.8 | CALCULADO_CON_TARA_SUPUESTA |  SIMARC |
| 127 | 102076TD011P0000C3P2K0 | 102*76 TD01 BLANCO R2K CON PLECA | 2.0 | 8.0 | 38X38X22 | 19.6 | 2.4 | CALCULADO_CON_TARA_SUPUESTA |   |
| 128 | 102076TT011P0000C3P2K0 | 102*76 TT01 BLANCO R2K CON PLECA | 2.0 | 6.0 | 24X42X35 | 14.3 | 2.316667 | CALCULADO_CON_TARA_SUPUESTA | VARIANTES_MISMO_SKU SIMARC 1 |
| 129 | 102076TT011P0000C3P2K0 | 102*76 TT01 BLANCO R2K CON PLECA | 2.0 | 9.0 | 32X40X33 | 21.0 | 2.288889 | CALCULADO_CON_TARA_SUPUESTA | VARIANTES_MISMO_SKU SIMARC 2 |
| 130 | 102076TT011P000YC3P2K0 | 102*76 TT01 AMARILLO R2K CON PLECA | 2.0 | 8.0 | 38X38X22 | 18.8 | 2.3 | CALCULADO_CON_TARA_SUPUESTA |   |
| 131 | 102076TT011P0367C3P2K0 | 102*76 TT01 VERDE 367 U R2K CON PLECA | 2.0 | 8.0 | 38X38X22 | 18.8 | 2.3 | CALCULADO_CON_TARA_SUPUESTA |   |
| 132 | 102102TD011P0000C1G0K5 | 102*102 TD01 BLANCO R0.5K | 0.5 | 24.0 | 38X38X22 | 18.9 | 0.770833 | CALCULADO_CON_TARA_SUPUESTA |   |
| 133 | 102102TD011P0000C3G1K5 | 102*102 TD01 BLANCO R1.5K | 1.5 | 8.0 | 38X38X23 | 19.1 | 2.3375 | CALCULADO_CON_TARA_SUPUESTA |   |
| 134 | 102102TT011P0000C1G0K7 | 102*102 TT01 BLANCO R0.7K | 0.7 | 18.0 | 38X38X22 | 18.7 | 1.016667 | CALCULADO_CON_TARA_SUPUESTA |   |
| 135 | 102102TT011P0000C3G1K5 | 102*102 TT01 BLANCO R1.5K | 1.5 | 8.0 | 38X38X22 | 17.9 | 2.1875 | CALCULADO_CON_TARA_SUPUESTA |   |
| 136 | 102127TD011P0000C3G1K0 | 102*127 TD01 BLANCO R1K | 1.0 | 8.0 | 38X38X23 | 16.4 | 2.0 | CALCULADO_CON_TARA_SUPUESTA |   |
| 137 | 102127TT011P0000C3G1K0 | 102*127 TT01 BLANCO R1K | 1.0 | 8.0 | 38X38X22 | 15.3 | 1.8625 | CALCULADO_CON_TARA_SUPUESTA |   |
| 138 | 102152BB011P0000C3P1K0 | 102*152 BB01 BLANCO R1K CON PLECA | 1.0 | 8.0 | 38X38X22 | 15.6 | 1.9 | CALCULADO_CON_TARA_SUPUESTA |   |
| 139 | 102152TD011P0000C1P0K3 | 102*152 TD01 BLANCO R0.3K CON PLECA | 0.3 | 36.0 | 32X41X33 | 26.9 | 0.736111 | CALCULADO_CON_TARA_SUPUESTA | VARIANTES_MISMO_SKU SIMARC |
| 140 | 102152TD011P0000C1P0K3 | 102*152 TD01 BLANCO R0.3K CON PLECA | 0.3 | 27.0 | 30X30X32 | 18.9 | 0.685185 | CALCULADO_CON_TARA_SUPUESTA | VARIANTES_MISMO_SKU RIBETEC |
| 141 | 102152TD011P0000C3P1K0 | 102*152 TD01 BLANCO R1K CON PLECA | 1.0 | 8.0 | 38X38X23 | 19.0 | 2.325 | CALCULADO_CON_TARA_SUPUESTA |   |
| 142 | 102152TD011P000YC1P0K3 | 102*152 TD01 AMARILLO C R0.3K CON PLECA | 0.3 | 27.0 | 30X30X32 | 19.3 | 0.7 | CALCULADO_CON_TARA_SUPUESTA |   |
| 143 | 102152TD011P0217C1P0K3 | 102*152 TD01 ROSA 217 R0.3K CON PLECA | 0.3 | 27.0 | 30X30X32 | 19.3 | 0.7 | CALCULADO_CON_TARA_SUPUESTA |   |
| 144 | 102152TD011P0291C1P0K3 | 102*152 TD01 AZUL 291U R0.3K CON PLECA | 0.3 | 27.0 | 30X30X32 | 19.3 | 0.7 | CALCULADO_CON_TARA_SUPUESTA |   |
| 145 | 102152TD011P0367C1P0K3 | 102*152 TD01 VERDE 367U R0.3K CON PLECA | 0.3 | 27.0 | 30X30X32 | 19.3 | 0.7 | CALCULADO_CON_TARA_SUPUESTA |   |
| 146 | 102152TD011P1485C1P0K3 | 102*152 TD01 NARANJA 1485 R0.3K CON PLECA | 0.3 | 27.0 | 30X30X32 | 19.3 | 0.7 | CALCULADO_CON_TARA_SUPUESTA |   |
| 147 | 102152TD011P2345C1P0K3 | 102*152 TD01 ROJO 2345C R0.3K CON PLECA | 0.3 | 27.0 | 30X30X32 | 19.3 | 0.7 | CALCULADO_CON_TARA_SUPUESTA |   |
| 148 | 102152TT011P0000C1P0K5 | 102*152 TT01 BLANCO R0.50K CON PLECA | 0.5 | 18.0 | 38X38X22 | 20.2 | 1.1 | CALCULADO_CON_TARA_SUPUESTA |   |
| 149 | 102152TT011P0000C3P1K0 | 102*152 TT01 BLANCO R1K CON PLECA | 1.0 | 8.0 | 38X38X22 | 19.7 | 2.4125 | CALCULADO_CON_TARA_SUPUESTA |   |
| 150 | 102152TT011P000YC3P1K0 | 102*152 TT01 AMARILLO R1K PLECA | 1.0 | 8.0 | 38X38X22 | 18.0 | 2.2 | CALCULADO_CON_TARA_SUPUESTA |   |
| 151 | 102152TT011P0021C3P1K0 | 102*152 TT01 NARANJA 021C R1K CON PLECA | 1.0 | 8.0 | 38X38X22 | 18.0 | 2.2 | CALCULADO_CON_TARA_SUPUESTA |   |
| 152 | 102152TT011P0367C3P1K0 | 102*152 TT01 VERDE 367 R1K CON PLECA | 1.0 | 8.0 | 38X38X22 | 18.0 | 2.2 | CALCULADO_CON_TARA_SUPUESTA |   |
| 153 | 102152TT011P1485C3P1K0 | 102*152 TT01 NARANJA 1485 R1K CON PLECA | 1.0 | 8.0 | 38X38X22 | 18.0 | 2.2 | CALCULADO_CON_TARA_SUPUESTA |   |
| 154 | 102152TT051P0000C3P1K0 | 102*152 TT05 BLANCO R1K CON PLECA | 1.0 | 8.0 | 38X38X22 | 17.8 | 2.175 | CALCULADO_CON_TARA_SUPUESTA |   |
| 155 | 102152TT101P0021C3P1K0 | 102*152 TT10 NARANJA 021 R1K PLECA | 1.0 | 8.0 | 38X38X22 | 18.0 | 2.2 | CALCULADO_CON_TARA_SUPUESTA |   |
| 156 | 102165TT011P0000C3P1K0 | 102*165 TT01 BLANCO R1K CON PLECA | 1.0 | 8.0 | 38X38X22 | 19.4 | 2.375 | CALCULADO_CON_TARA_SUPUESTA |   |
| 157 | 102203TD011P0000C1P0K2 | 102*203 TD01 BLANCA R0.20K CON PLECA | 0.2 | 27.0 | 30X30X32 | 19.4 | 0.703704 | CALCULADO_CON_TARA_SUPUESTA |   |
| 158 | 102203TD011P0000C3P0K8 | 102*203 TD01 BLANCO R0.8K CON PLECA | 0.8 | 8.0 | 38X38X23 | 19.9 | 2.4375 | CALCULADO_CON_TARA_SUPUESTA |   |
| 159 | 102203TT011P0000C3P0K8 | 102*203 TT01 BLANCO R0.8K CON PLECA | 0.8 | 8.0 | 38X38X22 | 19.0 | 2.325 | CALCULADO_CON_TARA_SUPUESTA |   |

## Etiquetas de Diseño y Especiale — columna por columna

| Columna | Nombre | Con valor guardado | Uso e interpretación |
| --- | --- | --- | --- |
| A | Producto | 117 | Clave de cruce exacta con default_code de Odoo. Preservar ceros iniciales y variantes. |
| B | Descripcion | 117 | Referencia comercial. Contiene capacidad o presentación en algunos casos; proviene de fórmulas con datos externos guardados en el XLSX. |
| C | Rollos por Tubo | 98 | Jerarquía de empaque. No son dimensiones del rollo; confirmar significado físico de tubo. |
| D | Cantidad de Tubos | 98 | Cantidad de agrupaciones por caja. |
| E | Total Rollos x Caja | 98 | Contenido de la caja; normalmente calculado. No confundir con cantidad vendida en Odoo. |
| F | Total Millares x Caja | 98 | Total comercial por caja; dividido entre rollos permite revisar capacidad. Es fórmula basada en descripción, no medición independiente. |
| G | Caja de Empaque (ancho x largo x alto cm) | 98 | Medidas de la caja exterior. Separar ancho, largo, alto en este orden; no asignar al rollo. |
| H | Peso Real x Caja | 98 | Peso bruto declarado de la presentación. Confirmar kg. Incluye empaque. |
| I | Medida | 117 | Tamaño de la etiqueta derivado del SKU, no tamaño exterior del rollo. Confirmar mm. |
| J | Material | 117 | Clasificación del material; no deducir peso ni diámetro sin especificaciones. |
| K | Centro | 117 | Núcleo del rollo, no diámetro exterior. Valores mezclan números y texto; confirmar unidad. |
| L | Sin Registro x Caja | 117 | Indicador auxiliar; no prueba que falten datos ni que estén completos. Validar los campos reales. |
| M | Calculo Peso x Rollo | 98 | Peso estimado: (bruto - 0.4 kg)/rollos. Tara supuesta; no es peso medido. |
| N | Calculo Peso Volumetrico Caja | 98 | Volumen exterior /5000. Nunca usar como peso físico individual. |
| O | Valor mas alto | 98 | Comparación del peso físico y volumétrico de la caja. |
| P | Redondeo para Paqueteria | 98 | Estimación redondeada de peso facturable; no es peso físico del producto. |
| Q | Peso Real x Rollo | 14 | Peso individual declarado directamente. Preferente tras verificar fecha, fuente, precisión y presentación. |
| R | Observaciones | 3 | Conservar proveedor, variante, reempacado y CONFIRMAR; afectan selección del perfil. |
| S | Auxiliar 1 | 117 | Auxiliar de fórmula para interpretar prefijo del SKU; no es dato logístico. |
| T | Auxiliar 2 | 117 | Auxiliar de fórmula para interpretar prefijo del SKU; no es dato logístico. |

### Registros producto por producto

Capacidad en millares/rollo es candidata, no confirma UDM Odoo. Peso calculado no equivale a peso medido. Medidas listadas son de caja; las individuales permanecen pendientes, salvo posible perfil de equipo embalado. Cada fila original se conserva por separado.

| Fila | SKU | Descripción | Millares/rollo candidato | Contenido/caja | Caja ancho×largo×alto cm | Bruto caja kg | Peso unitario candidato kg | Origen peso | Alertas / observaciones |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2 | 030022TT013P0291C3G18K | 30*22 TT01 AZUL CIELO 291 R18K | 18.0 | 8.0 | 38X38X22 | 16.0 | 1.95 | CALCULADO_CON_TARA_SUPUESTA |   |
| 3 | 030022TT013P0367C3G18K | 30*22 TT01 VERDE LIMON 367 R18K | 18.0 | 8.0 | 38X38X22 | 16.0 | 1.95 | CALCULADO_CON_TARA_SUPUESTA |   |
| 4 | 030200TV011PC3T0 | TYVEK BLANCO 30*200 TV01 ROLLO | Pendiente | Pendiente | Pendiente | Pendiente | 0.7 | MEDIDO_DECLARADO | CAPACIDAD_NO_RESUELTA  |
| 5 | 033013TT013P0000C3G9K0 | 033*013 TT01 BLANCO R9K | 9.0 | 18.0 | 38X38X23 | 12.4 | 0.666667 | CALCULADO_CON_TARA_SUPUESTA |   |
| 6 | 038025BB012PC1002090157 | 38*25 BB01 VERDE 374C R10K | 10.0 | Pendiente | Pendiente | Pendiente | 1.3 | MEDIDO_DECLARADO |   |
| 7 | 038025BB012PC1103040156 | 38*25 BB01 AMARILLO C R10K | 10.0 | Pendiente | Pendiente | Pendiente | 1.3 | MEDIDO_DECLARADO |   |
| 8 | 040032TD011P0000CQG2K0 | 40*32 TD01 BLANCA R2K | 2.0 | 45.0 | 38X38X23 | 18.7 | 0.406667 | CALCULADO_CON_TARA_SUPUESTA |   |
| 9 | 040032TD011P000YCQG2K0 | 40*32 TD01 AMARILLO R2K | 2.0 | 45.0 | 38X38X23 | 18.7 | 0.406667 | CALCULADO_CON_TARA_SUPUESTA |   |
| 10 | 040032TD011P3517CQG2K0 | 40*32 TD01 ROJO 3517 R2K | 2.0 | 45.0 | 38X38X23 | 18.7 | 0.406667 | CALCULADO_CON_TARA_SUPUESTA |   |
| 11 | 048100SG021PC3T0100C | 48*100 SG02 SEGURIDAD ABIERTO VERDE R100MTS CONTINUO | Pendiente | Pendiente | Pendiente | Pendiente | 0.85 | MEDIDO_DECLARADO | CAPACIDAD_NO_RESUELTA  |
| 12 | 050100BD011P0000C3P1K0 | 50*100 BD01 BLANCO R1K CON PLECA | 1.0 | 20.0 | 38X38X23 | 14.8 | 0.72 | CALCULADO_CON_TARA_SUPUESTA |   |
| 13 | 051025TD081P0000C1P2K0 | 51*25 TD08 BLANCO R2K CON PLECA | 2.0 | 48.0 | 38X38X23 | 19.7 | 0.402083 | CALCULADO_CON_TARA_SUPUESTA |   |
| 14 | 065025TT011P0367C3G5K0 | 065*025 TT01 VERDE 367 R5K | 5.0 | 12.0 | 38X38X22 | 15.4 | 1.25 | CALCULADO_CON_TARA_SUPUESTA |   |
| 15 | 076025TT011P0009C1P1K0 | 76*25 TT01 COOL GRAY 09 R1K | 1.0 | Pendiente | Pendiente | Pendiente | 0.3 | MEDIDO_DECLARADO |   |
| 16 | 076025TT011P000YC1G1K0 | 76*25 TT01 AMARILLO C R1K NOVIEMBRE- REBOBINADO | 1.0 | Pendiente | Pendiente | Pendiente | 0.3 | MEDIDO_DECLARADO |   |
| 17 | 076025TT011P000YC3G5K0 | 76*25 TT01 AMARILLO C R5K NOVIEMBRE | 5.0 | 12.0 | 38X38X25 | 18.2 | 1.483333 | CALCULADO_CON_TARA_SUPUESTA |   |
| 18 | 076025TT011P0021C3G5K0 | 76*25 TT01 NARANJA 021C R5K ENERO | 5.0 | 12.0 | 38X38X25 | 18.2 | 1.483333 | CALCULADO_CON_TARA_SUPUESTA |   |
| 19 | 076025TT011P0032C3G5K0 | 76*25 TT01 ROJO 032C R5K FEBRERO | 5.0 | 12.0 | 38X38X25 | 18.2 | 1.483333 | CALCULADO_CON_TARA_SUPUESTA |   |
| 20 | 076025TT011P0217C3G5K0 | 76*25 TT01 ROSA 217C R5K JULIO | 5.0 | 12.0 | 38X38X25 | 18.2 | 1.483333 | CALCULADO_CON_TARA_SUPUESTA |   |
| 21 | 076025TT011P0291C3G5K0 | 76*25 TT01 AZUL 291C R5K JUNIO | 5.0 | 12.0 | 38X38X25 | 18.2 | 1.483333 | CALCULADO_CON_TARA_SUPUESTA |   |
| 22 | 076025TT011P0352C3G5K0 | 76*25 TT01 VERDE 352C R5K DICIEMBRE | 5.0 | 12.0 | 38X38X25 | 18.2 | 1.483333 | CALCULADO_CON_TARA_SUPUESTA |   |
| 23 | 076025TT011P0367C1G1K0 | 76*25 TT01 VERDE 367C R1K | 1.0 | Pendiente | Pendiente | Pendiente | 0.3 | MEDIDO_DECLARADO |   |
| 24 | 076025TT011P0367C3G5K0 | 76*25 TT01 VERDE 367C R5K OCTUBRE | 5.0 | 12.0 | 38X38X25 | 18.2 | 1.483333 | CALCULADO_CON_TARA_SUPUESTA |   |
| 25 | 076025TT011P0460C3G5K0 | 76*25 TT01 AMARILLO-BEIGE 460C R5K MAYO | 5.0 | 12.0 | 38X38X25 | 18.2 | 1.483333 | CALCULADO_CON_TARA_SUPUESTA |   |
| 26 | 076025TT011P0482C3G5K0 | 76*25 TT01 CAFE 482C R5K ABRIL | 5.0 | 12.0 | 38X38X25 | 18.2 | 1.483333 | CALCULADO_CON_TARA_SUPUESTA |   |
| 27 | 076025TT011P0WG1C3G5K0 | 76*25 TT01 GRIS WARM GRAY 1C R5K AGOSTO | 5.0 | 12.0 | 38X38X25 | 18.2 | 1.483333 | CALCULADO_CON_TARA_SUPUESTA |   |
| 28 | 076025TT011P1485C3G5K0 | 76*25 TT01 NARANJA 1485C R5K SEPTIEMBRE | 5.0 | 12.0 | 38X38X25 | 18.2 | 1.483333 | CALCULADO_CON_TARA_SUPUESTA |   |
| 29 | 076025TT011P2572C3G5K0 | 76*25 TT01 MORADO 2572C R5K MARZO | 5.0 | 12.0 | 38X38X25 | 18.2 | 1.483333 | CALCULADO_CON_TARA_SUPUESTA |   |
| 30 | 076025TT011PC2003240120 | 76*25 TT01 AZUL 654C R5K | 5.0 | 12.0 | 38X38X25 | 18.2 | 1.483333 | CALCULADO_CON_TARA_SUPUESTA |   |
| 31 | 076025TT011PC2003240128 | 76*25 TT01 MORADO 7650C R5K | 5.0 | 12.0 | 38X38X25 | 18.2 | 1.483333 | CALCULADO_CON_TARA_SUPUESTA |   |
| 32 | 076025TT011PC2003240133 | 76*25 TT01 VERDE 2427C R5K | 5.0 | 12.0 | 38X38X25 | 18.2 | 1.483333 | CALCULADO_CON_TARA_SUPUESTA |   |
| 33 | 076025TT011PC2004030123 | 76*25 TT01 CAFE 140C R6K | 6.0 | 12.0 | 38X38X25 | 18.2 | 1.483333 | CALCULADO_CON_TARA_SUPUESTA |   |
| 34 | 076025TT011PC2105270125 | 76*25 TT01 COOL GRAY 09 R5K | 5.0 | 12.0 | 38X38X25 | 18.2 | 1.483333 | CALCULADO_CON_TARA_SUPUESTA |   |
| 35 | 076044TD011P0000C1G1K5 | 76*44 TD01 BLANCO R1.5K | 1.5 | 27.0 | 38X38X25 | 21.1 | 0.766667 | CALCULADO_CON_TARA_SUPUESTA |   |
| 36 | 076044TD011P0000CQG1K5 | 76*44 TD01 BLANCA C DE 1.5" R1.5K  | 1.5 | 27.0 | 38X38X25 | 21.4 | 0.777778 | CALCULADO_CON_TARA_SUPUESTA |   |
| 37 | 076051TT011P0232C3P3K0 | 076*051 TT01 ROSA 232 R3K PLECA | 3.0 | 12.0 | 38X38X25 | 20.9 | 1.708333 | CALCULADO_CON_TARA_SUPUESTA |   |
| 38 | 076051TT011PC1811201204 | 76*51 TT01 AZUL 306C R1K | 1.0 | Pendiente | Pendiente | Pendiente | 0.6 | MEDIDO_DECLARADO |   |
| 39 | 076051TT011PC1TFYLLW | 76*51 TT01 AMARILLO C R1.5K CON PLECA | 1.5 | 27.0 | 38X38X22 | 23.3 | 0.848148 | CALCULADO_CON_TARA_SUPUESTA |   |
| 40 | 076076TT011P000YC3G2K0 | 76*76 TT01 AMARILLO C R2K | 2.0 | Pendiente | Pendiente | Pendiente | Pendiente | FALTANTE | FALTA_PESO  |
| 41 | 082045TD011P0000C1G1K5 | 82*45 TD01 BLANCO R1.5K | 1.5 | 18.0 | 38X38X19 | 15.5 | 0.838889 | CALCULADO_CON_TARA_SUPUESTA |   |
| 42 | 102025TT011P0291C3G5K0 | 102*025 TT01 AZUL 291 R5K | 5.0 | 8.0 | 38X38X22 | 16.0 | 1.95 | CALCULADO_CON_TARA_SUPUESTA |   |
| 43 | 102051TD011P0000CQP1K0 | 102*051 TD01 BLANCO C/1.5" R1K PLECA | 1.0 | 24.0 | 38X38X23 | 18.8 | 0.766667 | CALCULADO_CON_TARA_SUPUESTA |   |
| 44 | 102076TD011P0000C1P240 | 102*76 TD01 BLANCO R0.24K P/ZEBRA QLN420 CON PLECA | 0.24 | 60.0 | 38X38X22 | 17.7 | 0.288333 | CALCULADO_CON_TARA_SUPUESTA |   |
| 45 | 102076TT011P0000C1G0K7 | 102*76 TT01 BLANCO R0.7K | 0.7 | 27.0 | 30X30X33 | 21.7 | 0.788889 | CALCULADO_CON_TARA_SUPUESTA |   |
| 46 | 102076TT011P0232C3P2K0 | 102*076 TT01 ROSA 232 R2K PLECA | 2.0 | 8.0 | 38X38X22 | 18.9 | 2.3125 | CALCULADO_CON_TARA_SUPUESTA |   |
| 47 | 102127CA031P0000C3G0K5 | CARTONCILLO 102*127 CA03 BLANCO R0.5K | 0.5 | 10.0 | 38X38X22 | 12.8 | 1.24 | CALCULADO_CON_TARA_SUPUESTA |   |
| 48 | 102127TD011P0000C1G0K6 | 102*127 TD01 BLANCO R0.6K | 0.6 | 18.0 | 38X38X22 | 21.1 | 1.15 | CALCULADO_CON_TARA_SUPUESTA |   |
| 49 | 102127TT011P0232C3G1K0 | 102*127 TT01 TT01 ROSA 232 R1K | 1.0 | 8.0 | 38X38X22 | 15.4 | 1.875 | CALCULADO_CON_TARA_SUPUESTA |   |
| 50 | 102127TT041P0000C3G1K0 | 102*127 TT04 BLANCO R1K | 1.0 | 8.0 | 38X38X22 | 17.1 | 2.0875 | CALCULADO_CON_TARA_SUPUESTA |   |
| 51 | 102152TD011P0000C1G200 | 102*152 TD01 BLANCO R0.2K CON PLECA | 0.2 | 54.0 | 33X41X32 | 27.5 | 0.501852 | CALCULADO_CON_TARA_SUPUESTA |  SIMARC |
| 52 | 102152TT011P2975C3P1K0 | 102*152 TT01 AZUL 2975 R1K CON PLECA | 1.0 | 8.0 | 38X38X23 | 18.4 | 2.25 | CALCULADO_CON_TARA_SUPUESTA |   |
| 53 | 102152TX061P0000C1G200 | 102*152 TX06 BLANCO R0.2K | 0.2 | 24.0 | 38X38X22 | 14.2 | 0.575 | CALCULADO_CON_TARA_SUPUESTA |   |
| 54 | 102200BB011P0000C3C200 | 102*200 BB01 BLANCO R200 MTS. CONTINUO | Pendiente | 6.0 | 38X38X22 | 15.1 | 2.45 | CALCULADO_CON_TARA_SUPUESTA | CAPACIDAD_NO_RESUELTA  |
| 55 | 108047DG041P0000C3P1K2 | 108*47 DG04 BLANCA R1.2K CON PLECA | 1.2 | 10.0 | 38X38X25 | 14.0 | 1.36 | CALCULADO_CON_TARA_SUPUESTA |   |
| 56 | 203127DG041P0000C3P450 | 203*127 DG04 BLANCA R0.450K CON PLECA | 0.45 | 5.0 | 38X38X22 | 14.2 | 2.76 | CALCULADO_CON_TARA_SUPUESTA |   |
| 57 | ALF13019025CS2407150915 | SWEET SEASONS RED 4688 19*24.8 CS02 2T R5K | 5.0 | 36.0 | 38X38X22 | 13.6 | 0.366667 | CALCULADO_CON_TARA_SUPUESTA |   |
| 58 | ALF13019025CS2407150920 | SWEET SEASONS YELLOW 4689 19*24.8 CS02 2T R5K | 5.0 | 36.0 | 38X38X22 | 13.6 | 0.366667 | CALCULADO_CON_TARA_SUPUESTA |   |
| 59 | ATM09046046BB2607101203 | PRECAUTORIA 3003029 046*046 BB03 1T R4K BNZ MATE | 4.0 | 12.0 | 38X38X22 | 12.2 | 0.983333 | CALCULADO_CON_TARA_SUPUESTA |   |
| 60 | ATM09102076TT2510141347 | VAINILLA 2025 102*76 TT01 2T R2K CON PLECA | 2.0 | 8.0 | 38X38X22 | 18.6 | 2.275 | CALCULADO_CON_TARA_SUPUESTA |   |
| 61 | ATM09102076TT2510141350 | MADERA 2025 102*76 TT01 2T R2K CON PLECA | 2.0 | 8.0 | 38X38X22 | 18.6 | 2.275 | CALCULADO_CON_TARA_SUPUESTA |   |
| 62 | ATM09102076TT2510141400 | LLUVIA DE JARDIN 2025 102*76 TT01 2T R2K CON PLECA | 2.0 | 8.0 | 38X38X22 | 18.6 | 2.275 | CALCULADO_CON_TARA_SUPUESTA |   |
| 63 | ATM09102076TT2512081100 | MANDARINA 102*076 TT01 2T R2K CON PLECA | 2.0 | 8.0 | 38X38X22 | 18.6 | 2.275 | CALCULADO_CON_TARA_SUPUESTA |   |
| 64 | ATM09102076TT2512081105 | FRUTOS ROJOS 102*076 TT01 2T R2K CON PLECA | 2.0 | 8.0 | 38X38X22 | 18.6 | 2.275 | CALCULADO_CON_TARA_SUPUESTA |   |
| 65 | ATM09102076TT2512081110 | REVITALIZANTE 102*076 TT01 2T R2K CON PLECA | 2.0 | 8.0 | 38X38X22 | 18.6 | 2.275 | CALCULADO_CON_TARA_SUPUESTA |   |
| 66 | ATM09102076TT2512081112 | EQUILIBRIO 102*076 TT01 2T R2K CON PLECA | 2.0 | 8.0 | 38X38X22 | 18.6 | 2.275 | CALCULADO_CON_TARA_SUPUESTA |   |
| 67 | AUGHA102076TD2405031320 | ALDAZ DISTRIBUIDORA 102*76 TD05 3T R0.7K | 0.7 | 18.0 | 38X38X23 | 17.0 | 0.922222 | CALCULADO_CON_TARA_SUPUESTA |   |
| 68 | AVA22076051TT2507071524 | AVO VALLEY TRAZABILIDAD 76*51 TT01 5T R3K CON PLECA | 3.0 | 12.0 | 38X38X25 | 20.5 | 1.675 | CALCULADO_CON_TARA_SUPUESTA |   |
| 69 | CALEA051025TT2010230136 | MARCO VERDE 51*25 TT01 1T R2.5K | 2.5 | Pendiente | Pendiente | Pendiente | 0.48 | MEDIDO_DECLARADO |   |
| 70 | EFF26060060BT2609281205 | BLACKBERRIES FTE 060*060 BT01 5T UV R2K | 2.0 | 12.0 | 38X38X22 | 12.6 | 1.016667 | CALCULADO_CON_TARA_SUPUESTA |   |
| 71 | EFF26060060BT2609281215 | RASPBERRIES FTE 060*060 BT01 5T UV R2K | 2.0 | 12.0 | 38X38X22 | 12.6 | 1.016667 | CALCULADO_CON_TARA_SUPUESTA |   |
| 72 | EFF26060060BT2609281225 | BLUEBERRIES FTE 060*060 BT01 5T UV R2K | 2.0 | 12.0 | 38X38X22 | 12.6 | 1.016667 | CALCULADO_CON_TARA_SUPUESTA |   |
| 73 | FTE14080080TT2211241700 | CIRCULO CON FRANJAS 80*80 TT01 1T R2.2K | 2.2 | 8.0 | 38X38X19 | 15.2 | 1.85 | CALCULADO_CON_TARA_SUPUESTA |   |
| 74 | HLG1A080040TD1905210122 | HLG 80*40 TD01 1T R3.5K | 3.5 | 8.0 | 38X38X22 | 13.9 | 1.6875 | CALCULADO_CON_TARA_SUPUESTA |   |
| 75 | IF&0A102152TD2510021358 | ONE PAQUETERIA 102*152 TD01 2T R0.350K CON PLECA | 0.35 | 24.0 | 38X38X22 | 20.1 | 0.820833 | CALCULADO_CON_TARA_SUPUESTA |   |
| 76 | IME7A102152TT2004140153 | MELDER AZUL 102*152 TT01 1T R1K CON PLECA | 1.0 | 8.0 | 38X38X22 | 18.0 | 2.2 | CALCULADO_CON_TARA_SUPUESTA |   |
| 77 | IME7A102152TT2004140158 | MELDER MORADO 102*152 TT01 1T R1K CON PLECA | 1.0 | 8.0 | 38X38X22 | 18.0 | 2.2 | CALCULADO_CON_TARA_SUPUESTA |   |
| 78 | IME7A102152TT2004141201 | MELDER ROJO 102*152 TT01 1T R1K CON PLECA | 1.0 | 8.0 | 38X38X22 | 18.0 | 2.2 | CALCULADO_CON_TARA_SUPUESTA |   |
| 79 | IME7A102152TT2005260156 | MELDER CAFE 102*152 TT01 1T R1K CON PLECA | 1.0 | 8.0 | 38X38X22 | 18.0 | 2.2 | CALCULADO_CON_TARA_SUPUESTA |   |
| 80 | IME7A102152TT2006260152 | MELDER AMARILLO 102*152 TT01 1T R1K CON PLECA | 1.0 | 8.0 | 38X38X22 | 18.0 | 2.2 | CALCULADO_CON_TARA_SUPUESTA |   |
| 81 | IME7A102152TT2010121203 | MELDER VERDE 102*152 TT01 1T R1K CON PLECA | 1.0 | 8.0 | 38X38X22 | 18.0 | 2.2 | CALCULADO_CON_TARA_SUPUESTA |   |
| 82 | J063022BB001P1911080150 | JOYERIA 63*22 BB00 BLANCO ADH PATRON R3K | 3.0 | Pendiente | Pendiente | Pendiente | 0.55 | MEDIDO_DECLARADO |   |
| 83 | LDL23051025BB2410070848 | OFERTA 51*25 BB09 1T UV R0.3K IMPRESIÓN LINNER | 0.3 | Pendiente | Pendiente | Pendiente | 0.063 | MEDIDO_DECLARADO |   |
| 84 | LPI83054082BB2504020845 | AIRLIFE CHB0020 ID: 1079944 54*82 BB04 1T UV R2K BARNIZ BRILLANTE ALTA FRICCION | 2.0 | 12.0 | 38X38X19 | 14.3 | 1.158333 | CALCULADO_CON_TARA_SUPUESTA |   |
| 85 | LPI83075065BB2506031630 | AIRLIFE ID: 1079484 75*65 BB05 2T UV R2.5K | 2.5 | 12.0 | 38X38X25 | 18.6 | 1.516667 | CALCULADO_CON_TARA_SUPUESTA |   |
| 86 | LPI83100160BB2504021045 | AIRLIFE - CN0010 ID: 1079969 100*160 BB04 1T UV R1K BARNIZ UV BRILLANTE ALTA FRICCION | 1.0 | 8.0 | 38X38X22 | 16.7 | 2.0375 | CALCULADO_CON_TARA_SUPUESTA |   |
| 87 | METJA032127CS2012291257 | ETIQUETA MOD1 32*127 CS01 4T R0.6K LAM IMP | 0.6 | Pendiente | Pendiente | Pendiente | 0.45 | MEDIDO_DECLARADO |  NO SE COMPRA POR CAJA COMPLETA, SE ACOMODA DE ACUERDO A LA CANTIDAD RECIBIDA |
| 88 | SCP97165076TT2409201223 | CORTE ESPECIAL 165*75.5 TT04 BLANCA R3K | 3.0 | 2.0 | 38X38X19 | 12.7 | 6.15 | CALCULADO_CON_TARA_SUPUESTA |   |
| 89 | XXXXX102152CS2509191228 | FRAGIL 102*152 CS01 1T C3 R0.5K CON PLECA | 0.5 | Pendiente | Pendiente | Pendiente | 1.3 | MEDIDO_DECLARADO |   |
| 90 | 022015BB011P000C1G2K5 | 22*15 BB01 BLANCA  R2.5K | 2.5 | Pendiente | Pendiente | Pendiente | 0.125 | MEDIDO_DECLARADO |   |
| 91 | 051025PL011P0000C3P5K3 | 051*025 PL01 PLATINUM R5.3K PLECA | 5.3 | 16.0 | 38X38X23 | 23.6 | 1.45 | CALCULADO_CON_TARA_SUPUESTA |  EN ODOO SE MANEJA POR ROLLOS, NO POR MILLAR |
| 92 | 080040TD011P000CC1G1K5 | 80*40 TD01 PROCESS CYAN C R1.5K | 1.5 | 18.0 | 38X38X19 | 13.9 | 0.75 | CALCULADO_CON_TARA_SUPUESTA |   |
| 93 | 102051BB011P0000C3G2K0 | 102*51 BB01 BLANCO R2K | 2.0 | 8.0 | 38X38X22 | 10.85 | 1.30625 | CALCULADO_CON_TARA_SUPUESTA |   |
| 94 | TRI91032032TT2610081052 | AMARILLO C 032*032 TT01 1T R15K CIRCULO | 15.0 | 8.0 | 38X38X22 | 17.15 | 2.09375 | CALCULADO_CON_TARA_SUPUESTA |   |
| 95 | AIS16051025BT2610081515 | ID: 1081329 051*025 BT01 TRANSPARENTE R18K CON SPOT | 18.0 | 2.0 | 30X30X12 | 6.35 | 2.975 | CALCULADO_CON_TARA_SUPUESTA |   |
| 96 | AIS16122320BB2610011106 | CRE MH 450g ID: 1079941 122*320 BB01 2T R1K LAM MATE / BNZ SERI AR | 1.0 | 2.0 | 30X30X26 | 12.5 | 6.05 | CALCULADO_CON_TARA_SUPUESTA |   |
| 97 | MES17102076BB2508141533 | ESBRA MANTECA 1kg VER 2 102*76 BB01 3T UV R1.5K | 1.5 | 8.0 | 38X38X22 | 12.05 | 1.45625 | CALCULADO_CON_TARA_SUPUESTA |   |
| 98 | PGR00135300CS2608201346 | GRUNNY ARTESANAL 135*300 CS01 4T R0.6K BNZ UV REG | 0.6 | 3.0 | 38X38X19 | 11.9 | 3.833333 | CALCULADO_CON_TARA_SUPUESTA |   |
| 99 | 102102TD081P0000C1P0K5 | 102*102 TD08 BLANCO R0.5K CON PLECA | 0.5 | Pendiente | Pendiente | Pendiente | Pendiente | FALTANTE | FALTA_PESO  |
| 100 | 038063TD011P000YCLG175 | 038*063 TD01 AMARILLO R0.175K | 0.175 | 320.0 | 38X38X22 | 21.4 | 0.065625 | CALCULADO_CON_TARA_SUPUESTA |   |
| 101 | 105067DG011P0000C1C67M | 105mm*67mts DG01 BLANCA CONTINUO | Pendiente | 14.0 | 38X38X22 | 18.35 | 1.282143 | CALCULADO_CON_TARA_SUPUESTA | CAPACIDAD_NO_RESUELTA  |
| 102 | GURJ5080057CS2610151011 | ETQ SOMOS WOW 080*57.5 CS01 3T R2.5K LAM BRILL | 2.5 | 6.0 | 38X38X19 | 13.25 | 2.141667 | CALCULADO_CON_TARA_SUPUESTA |   |
| 103 | 102076TD011P0000C1G700 | 102* 076 TD01 BLANCO R0.7K CORTE DE SEGURIDAD | 0.7 | 18.0 | 38X38X22 | 15.3 | 0.827778 | CALCULADO_CON_TARA_SUPUESTA |   |
| 104 | 102127TT021P0000C3G1K0 | 102*127 TT02 BLANCO R1K | 1.0 | 8.0 | 38X38X22 | 16.35 | 1.99375 | CALCULADO_CON_TARA_SUPUESTA |   |
| 105 | LPI83075065BB2608191500 | AIRLIFE ID: 1079482 75*65 BB05 2T UV R2.5K | 2.5 | 12.0 | 38X38X25 | 19.05 | 1.554167 | CALCULADO_CON_TARA_SUPUESTA |   |
| 106 | PLA97030072CS2610121141 | DURADBOX 13" GRAL FTE Y CTA 30*72 CS01 2T R3K LAMINADA | 3.0 | 12.0 | 38X38X23 | 15.15 | 1.229167 | CALCULADO_CON_TARA_SUPUESTA |   |
| 107 | AIS16122320BB2610011050 | CRE MH 400g ID: 1086476 122*320 BB01 2T R1K LAM MATE / BNZ SERI AR | 1.0 | 2.0 | 30X30X26 | 12.8 | 6.2 | CALCULADO_CON_TARA_SUPUESTA |   |
| 108 | SCP97048023BT2510011658 | SPOT PHILIP 48*24  BT05 1T R12K BNZ UV ANT ADH / SPOT | 12.0 | 8.0 | 30X30X22 | 15.1 | 1.8375 | CALCULADO_CON_TARA_SUPUESTA |   |
| 109 | PGL17099053CS2609301210 | SOLUCION DX-10 1000ml ID:1044559 099*053 CS03 3T R10K BNZ BRILL | 10.0 | 2.0 | 30X30X23 | 17.65 | 8.625 | CALCULADO_CON_TARA_SUPUESTA |   |
| 110 | 040022TD011P0000C1G2K5 | 40*22 TD01 BLANCO R2.5K | 2.5 | 45.0 | 38X38X19 | 15.4 | 0.333333 | CALCULADO_CON_TARA_SUPUESTA |   |
| 111 | 080040TD011P0021C1G1K5 | 80*40 TD01 NARANJA 021C R1.5K | 1.5 | 18.0 | 38X38X19 | 13.85 | 0.747222 | CALCULADO_CON_TARA_SUPUESTA |   |
| 112 | 080040TD011P0367C1G1K5 | 80*40 TD01 VERDE 367C R1.5K | 1.5 | 18.0 | 38X38X19 | 13.85 | 0.747222 | CALCULADO_CON_TARA_SUPUESTA |   |
| 113 | 049019TT011P0000C3G8KO | 049*019 TT01 BLANCO R8K | 8.0 | 16.0 | 38X38X22 | 18.45 | 1.128125 | CALCULADO_CON_TARA_SUPUESTA |   |
| 114 | AIS16080200BB2610011130 | MAG ZZZ ID: 1085710 080*200 BB01 2T R1K LAM MATE / BNZ SERI AR | 1.0 | 4.0 | 38X38X19 | 10.6 | 2.55 | CALCULADO_CON_TARA_SUPUESTA |   |
| 115 | 040022TD012P0000C1G2K0 | 40*22TD01 BLANCO R2K | 2.0 | 50.0 | 38X38X19 | 16.8 | 0.328 | CALCULADO_CON_TARA_SUPUESTA |   |
| 116 | AAC15075062TD2601211400 | LABEL ROBINSON HASS AVOCADOS 075*062.5 TD01 3TUV R3K | 3.0 | Pendiente | Pendiente | Pendiente | Pendiente | FALTANTE | FALTA_PESO  |
| 117 | 040031TT011P0000C3G10K | 040*031 TT01 BLANCO R10.5K | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente | FALTANTE | CONFLICTO_CAPACIDAD, FALTA_PESO, CAPACIDAD_NO_RESUELTA  |
| 118 | 102067BT011P0000C3C67M | 102mm*67mts BT01 TRANSPARENTE CONTINUO | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente | FALTANTE | FALTA_PESO, CAPACIDAD_NO_RESUELTA  |

## Termico, Marca precio — columna por columna

| Columna | Nombre | Con valor guardado | Uso e interpretación |
| --- | --- | --- | --- |
| A | Producto | 47 | Clave de cruce exacta con default_code de Odoo. Preservar ceros iniciales y variantes. |
| B | Descripcion | 47 | Referencia comercial. Contiene capacidad o presentación en algunos casos; proviene de fórmulas con datos externos guardados en el XLSX. |
| C | Tipo | 47 | Familia comercial; ayuda a decidir si se vende por pieza, rollo, caja o millar. |
| D | Rollos por Tubo | 47 | Jerarquía de empaque. No son dimensiones del rollo; confirmar significado físico de tubo. |
| E | Cantidad de Tubos | 41 | Cantidad de agrupaciones por caja. |
| F | Total Rollos x Caja | 47 | Contenido de la caja; normalmente calculado. No confundir con cantidad vendida en Odoo. |
| G | Caja de Empaque (ancho x largo x alto cm) | 39 | Medidas de la caja exterior. Separar ancho, largo, alto en este orden; no asignar al rollo. |
| H | Peso Real x Caja | 39 | Peso bruto declarado de la presentación. Confirmar kg. Incluye empaque. |
| I | Centro | 47 | Núcleo del rollo, no diámetro exterior. Valores mezclan números y texto; confirmar unidad. |
| J | Sin Registro x Caja | 47 | Indicador auxiliar; no prueba que falten datos ni que estén completos. Validar los campos reales. |
| K | Calculo Peso x Rollo | 39 | Peso estimado: (bruto - 0.4 kg)/rollos. Tara supuesta; no es peso medido. |
| L | Calculo Peso Volumetrico Caja | 39 | Volumen exterior /5000. Nunca usar como peso físico individual. |
| M | Valor mas alto | 39 | Comparación del peso físico y volumétrico de la caja. |
| N | Redondeo para Paqueteria | 39 | Estimación redondeada de peso facturable; no es peso físico del producto. |
| O | Peso Real x Rollo | 14 | Peso individual declarado directamente. Preferente tras verificar fecha, fuente, precisión y presentación. |
| P | Observaciones | 8 | Conservar proveedor, variante, reempacado y CONFIRMAR; afectan selección del perfil. |

### Registros producto por producto

Capacidad en millares/rollo es candidata, no confirma UDM Odoo. Peso calculado no equivale a peso medido. Medidas listadas son de caja; las individuales permanecen pendientes, salvo posible perfil de equipo embalado. Cada fila original se conserva por separado.

| Fila | SKU | Descripción | Millares/rollo candidato | Contenido/caja | Caja ancho×largo×alto cm | Bruto caja kg | Peso unitario candidato kg | Origen peso | Alertas / observaciones |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2 | 016023BD021P0802C1M750 | MARCA PRECIO 16*23 BD02 C1 1P VERDE FLU 802 MUESCA R 0.75K | 0.75 | Pendiente | Pendiente | Pendiente | 0.05 | MEDIDO_DECLARADO |   |
| 3 | 016023BD021P0804C1M750 | MARCA PRECIO 16*23 BD02 C1 1P NARANJA FLU 804 MUESCA R 0.75K | 0.75 | Pendiente | Pendiente | Pendiente | 0.05 | MEDIDO_DECLARADO |   |
| 4 | 016023BD021P0805C1M750 | MARCA PRECIO 16*23 BD02 C1 1P ROJO FLU 805 MUESCA R 0.75K | 0.75 | Pendiente | Pendiente | Pendiente | 0.05 | MEDIDO_DECLARADO |   |
| 5 | 016023BD021P0806C1M750 | MARCA PRECIO 16*23 BD02 C1 1P ROSA FLU 806 MUESCA R 0.75K | 0.75 | Pendiente | Pendiente | Pendiente | 0.05 | MEDIDO_DECLARADO |   |
| 6 | 016023BD021P0809C1M750 | MARCA PRECIO 16*23 BD02 C1 1P AMARILLO FLU 809 MUESCA R 0.75K | 0.75 | Pendiente | Pendiente | Pendiente | 0.05 | MEDIDO_DECLARADO |   |
| 7 | 021012BD021P0000C1M1K0 | MARCA PRECIO 21*12 BD02 C1 1P BLANCA C.LINEA ROJA MUESCA R1K | 1.0 | 100.0 | 14X23X33 | 5.0 | 0.046 | CALCULADO_CON_TARA_SUPUESTA |   |
| 8 | 021012BD021P0802C1M1K0 | MARCA PRECIO 21*12 BD02 C1 1P VERDE FLU 802 MUESCA R1K | 1.0 | Pendiente | Pendiente | Pendiente | 0.05 | MEDIDO_DECLARADO |   |
| 9 | 057030PT011P0000CSC050 | PAPEL TICKET TERMICO, 57MM*30MM CAJA/50 ROLLOS | Pendiente | 50.0 | 22X26X08 | 1.8 | 0.028 | CALCULADO_CON_TARA_SUPUESTA |   |
| 10 | 057030PT011P0000CSC10M | PAPEL TICKET TERMICO, 57MM*30MM CAJA/250 ROLLOS | Pendiente | 250.0 | 27X27X23 | 8.6 | 0.0328 | CALCULADO_CON_TARA_SUPUESTA |   |
| 11 | 057040PT011P0000CSC020 | PAPEL TICKET TÉRMICO, 57MM*40MM CAJA/20 ROLLOS | Pendiente | 20.0 | 15X22X13 | 1.2 | 0.04 | CALCULADO_CON_TARA_SUPUESTA | VARIANTES_MISMO_SKU EN CAJA  |
| 12 | 057040PT011P0000CSC020 | PAPEL TICKET TÉRMICO, 57MM*40MM CAJA/20 ROLLOS | Pendiente | 20.0 | 13X25X09 | 1.15 | 0.0375 | CALCULADO_CON_TARA_SUPUESTA | VARIANTES_MISMO_SKU EN BOLSA |
| 13 | 057040PT011P0000CSC050 | PAPEL TICKET TÉRMICO, 57MM*40MM CAJA/50 ROLLOS | Pendiente | 50.0 | 21X41X13 | 3.1 | 0.054 | CALCULADO_CON_TARA_SUPUESTA |   |
| 14 | 057040PT011P0000CSC100 | PAPEL TICKET TÉRMICO, 57MM*40MM CAJA/100 ROLLOS | Pendiente | 100.0 | 21X41X13 | 5.7 | 0.053 | CALCULADO_CON_TARA_SUPUESTA |   |
| 15 | 057040PT011P0000CSC240 | PAPEL TICKET TERMICO, 57MM*40MM CAJA/240 ROLLOS | Pendiente | 240.0 | 42X42X18 | 13.4 | 0.054167 | CALCULADO_CON_TARA_SUPUESTA |   |
| 16 | 057040PT011P0000CSC250 | PAPEL TICKET TERMICO, 57MM*40MM CAJA/250 ROLLOS | Pendiente | 250.0 | 42X42X18 | 14.0 | 0.0544 | CALCULADO_CON_TARA_SUPUESTA |   |
| 17 | 057060PT011P0000CPC108 | PAPEL TICKET TERMICO, 57MM*60MM CAJA/108 PZAS | Pendiente | 108.0 | 36X36X19 | 14.6 | 0.131481 | CALCULADO_CON_TARA_SUPUESTA |   |
| 18 | 075045PT011P0000CSC192 | CAJA C/192 ROLL 3" PAPEL TICKET TÉRMICO PARA RIBETEC RT-320PB | Pendiente | 192.0 | 38X38X24 | 19.8 | 0.101042 | CALCULADO_CON_TARA_SUPUESTA |   |
| 19 | 080070PT011P0000CPC025 | PAPEL TICKET TÉRMICO, 80MM*70MM, CAJA/25 ROLLOS | Pendiente | 25.0 | 24X31X19 | 6.4 | 0.24 | CALCULADO_CON_TARA_SUPUESTA |   |
| 20 | 080070PT011P0000CPC050 | PAPEL TICKET TÉRMICO, 80MM*70MM, CAJA/50 ROLLOS | Pendiente | 50.0 | 36X36X17 | 12.7 | 0.246 | CALCULADO_CON_TARA_SUPUESTA |   |
| 21 | 080080PT011P0000CPC040 | PAPEL TICKET TÉRMICO, 80MM*80MM, CAJA/40 ROLLOS | Pendiente | 40.0 | 37X37X17 | 13.5 | 0.3275 | CALCULADO_CON_TARA_SUPUESTA | VARIANTES_MISMO_SKU J&M 1 |
| 22 | 080080PT011P0000CPC040 | PAPEL TICKET TÉRMICO, 80MM*80MM, CAJA/40 ROLLOS | Pendiente | 40.0 | 42X42X17 | 13.8 | 0.335 | CALCULADO_CON_TARA_SUPUESTA | VARIANTES_MISMO_SKU J&M 2 |
| 23 | 080080PT011P0000CPC72M | PAPEL TICKET TÉRMICO, 80MM*80MM, CAJA/50 ROLLOS | Pendiente | 50.0 | 38X38X25 | 17.4 | 0.34 | CALCULADO_CON_TARA_SUPUESTA |   |
| 24 | 16GL-BIM-ROL | 16GL 21*18 IMPRESA NEGRO, FECHA CADUCIDAD, LOTE NO. | Pendiente | 500.0 | 32X32X44 | 19.2 | 0.0376 | CALCULADO_CON_TARA_SUPUESTA |   |
| 25 | 16GL-BPO | 16GL 21*18 BLANCO CON PERFORACIÓN | Pendiente | 500.0 | 32X32X44 | 19.6 | 0.0384 | CALCULADO_CON_TARA_SUPUESTA |   |
| 26 | 16GL-FIM | 16GL 21*18 FLUORESCENTE NARANJA | Pendiente | 500.0 | 32X32X44 | 22.9 | 0.045 | MEDIDO_DECLARADO |   |
| 27 | 16GL-FLU | 16GL 21*18 FLUORESCENTE AMARILLO | Pendiente | 500.0 | 32X32X44 | 22.9 | 0.045 | MEDIDO_DECLARADO |   |
| 28 | 16GL-FRJ | 16GL 21*18 FLUORESCENTE ROJO | Pendiente | 500.0 | 32X32X44 | 22.9 | 0.045 | MEDIDO_DECLARADO |   |
| 29 | 16GL-FRS | 16GL 21*18 FLUORESCENTE ROSA | Pendiente | 500.0 | 32X32X44 | 22.9 | 0.045 | MEDIDO_DECLARADO |   |
| 30 | 16GL-FVD | 16GL 21*18 FLUORESCENTE VERDE | Pendiente | 500.0 | 32X32X44 | 22.9 | 0.045 | MEDIDO_DECLARADO |   |
| 31 | 2189-16GL | 16GL TRINITIS MARCA PRECIO 1T | Pendiente | 500.0 | 32X32X46 | 22.4 | 0.044 | CALCULADO_CON_TARA_SUPUESTA |   |
| 32 | 30GT-BPO | 30GT 30*18 BLANCO CON PERFORACIÓN R1K | 1.0 | 250.0 | 32X32X44 | 22.9 | 0.08 | MEDIDO_DECLARADO | DIFERENCIA_PESO_MAYOR_10_PCT  |
| 33 | 8GS-BPO-ROLLO | 8GS 21*12 BLANCO CON PERFORACIÓN ROLLO | Pendiente | 500.0 | 32X32X44 | 18.9 | 0.037 | CALCULADO_CON_TARA_SUPUESTA |   |
| 34 | 8GS-FLU-ROLLO | 8GS 21*12 FLUORESCENTE AMARILLO | Pendiente | 500.0 | 32X32X44 | 22.0 | 0.0432 | CALCULADO_CON_TARA_SUPUESTA |   |
| 35 | 8GS-FNJ-ROLLO | 8GS 21*12 FLUORESCENTE NARANJA | Pendiente | 500.0 | 32X32X44 | 22.0 | 0.0432 | CALCULADO_CON_TARA_SUPUESTA |   |
| 36 | 8GS-FRJ-ROLLO | 8GS 21*12 FLUORESCENTE ROJO ROLLO | Pendiente | 500.0 | 32X32X44 | 22.0 | 0.0432 | CALCULADO_CON_TARA_SUPUESTA |   |
| 37 | 8GS-FRS-ROLLO | 8GS 21*12 FLUORESCENTE ROSA ROLLO | Pendiente | 500.0 | 32X32X44 | 22.0 | 0.0432 | CALCULADO_CON_TARA_SUPUESTA |   |
| 38 | 8GS-FVD-ROLLO | 8GS 21*12 FLUORESCENTE VERDE ROLLO | Pendiente | 500.0 | 32X32X44 | 22.0 | 0.0432 | CALCULADO_CON_TARA_SUPUESTA |   |
| 39 | JC20-BCO-ROL | ET2L 26*16 BLANCO ONDULADO IN ETIQUETA MARCA PRECIO ROLLO | Pendiente | 300.0 | 32X41X29 | 17.2 | 0.056 | CALCULADO_CON_TARA_SUPUESTA |   |
| 40 | OFFICE-MCP | OFFICE DEPOT 16*23 BLANCO MARCA PRECIO | Pendiente | 300.0 | 24X42X34 | 15.8 | 0.051333 | CALCULADO_CON_TARA_SUPUESTA | VARIANTES_MISMO_SKU SIMARC 1 |
| 41 | OFFICE-MCP | OFFICE DEPOT 16*23 BLANCO MARCA PRECIO | Pendiente | 360.0 | 24X42X34 | 19.35 | 0.052639 | CALCULADO_CON_TARA_SUPUESTA | VARIANTES_MISMO_SKU SIMARC 2 |
| 42 | OFFICE-MCPI1T | OFFICE DEPOT 16*23 IMPRESA NEGRO, NO. LOTE, FECHA CADUCIDAD | Pendiente | 300.0 | 24X42X34 | 15.8 | 0.051333 | CALCULADO_CON_TARA_SUPUESTA |   |
| 43 | RPRP7670-2 | PAPEL TICKET ORIGINAL Y COPIA, 76MM*70MM, CAJA/50 ROLLOS | Pendiente | 50.0 | 36X36X18 | 10.4 | 0.2 | CALCULADO_CON_TARA_SUPUESTA |   |
| 44 | RPRT5045 | PAPEL TICKET TÉRMICO FONDEADO, 50MM*45MM, CAJA/100 ROLLOS | Pendiente | 100.0 | Pendiente | Pendiente | 0.07 | MEDIDO_DECLARADO |  NO ES DE LINEA |
| 45 | RPRT5735-110 | PAPEL TICKET TÉRMICO, 57MM*35MM  CAJA/110 ROLLOS | Pendiente | 110.0 | 22X26X19 | 5.4 | 0.045455 | CALCULADO_CON_TARA_SUPUESTA |   |
| 46 | RPRT80200 | PAPEL TICKET TÉRMICO, 80MM*200MM, CAJA/6 ROLLOS | Pendiente | 6.0 | Pendiente | Pendiente | 2.4 | MEDIDO_DECLARADO |  NO ES DE LINEA |
| 47 | SATO016018-MCP | SATO 16*18 BLANCO MARCA PRECIO | Pendiente | 360.0 | 24X42X34 | 15.4 | 0.041667 | CALCULADO_CON_TARA_SUPUESTA |   |
| 48 | SATO016018-MCP-IMP | E101AD0009807 SATO 16*18 BLANCO IMPRESA NEGRO, LOTE NO. FECHA CADUCIDAD | Pendiente | 360.0 | 24X42X34 | 15.6 | 0.042222 | CALCULADO_CON_TARA_SUPUESTA |   |

## Equipos — columna por columna

| Columna | Nombre | Con valor guardado | Uso e interpretación |
| --- | --- | --- | --- |
| A | Producto | 72 | Clave de cruce exacta con default_code de Odoo. Preservar ceros iniciales y variantes. |
| B | Descripcion | 72 | Referencia comercial. Contiene capacidad o presentación en algunos casos; proviene de fórmulas con datos externos guardados en el XLSX. |
| C | Marca | 72 | Marca comercial. No determina automáticamente la unidad de venta. |
| D | Tipo | 72 | Familia comercial; ayuda a decidir si se vende por pieza, rollo, caja o millar. |
| E | Caja de Empaque (ancho x largo x alto cm) | 72 | Medidas de la caja exterior. Separar ancho, largo, alto en este orden; no asignar al rollo. |
| F | Peso Real x Caja | 72 | Peso bruto declarado de la presentación. Confirmar kg. Incluye empaque. |
| G | Calculo Peso Volumetrico Caja | 72 | Volumen exterior /5000. Nunca usar como peso físico individual. |
| H | Valor mas alto | 72 | Comparación del peso físico y volumétrico de la caja. |
| I | Redondeo para Paqueteria | 72 | Estimación redondeada de peso facturable; no es peso físico del producto. |
| J | Observaciones | 0 | Conservar proveedor, variante, reempacado y CONFIRMAR; afectan selección del perfil. |

### Registros producto por producto

Capacidad en millares/rollo es candidata, no confirma UDM Odoo. Peso calculado no equivale a peso medido. Medidas listadas son de caja; las individuales permanecen pendientes, salvo posible perfil de equipo embalado. Cada fila original se conserva por separado.

| Fila | SKU | Descripción | Millares/rollo candidato | Contenido/caja | Caja ancho×largo×alto cm | Bruto caja kg | Peso unitario candidato kg | Origen peso | Alertas / observaciones |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2 | 011-T10051-000 | GODEX T-10 REBOBINADOR EXTERNO 4" | Pendiente | Pendiente | 31X46X41 | 6.9 | 6.9 | BRUTO_CAJA_INDIVIDUAL |   |
| 3 | 50013-001-104 | HID DIGITAL PERSONA URU4500 LECTOR DE HUELLA, USB | Pendiente | Pendiente | 13X18X02 | 0.1 | 0.1 | BRUTO_CAJA_INDIVIDUAL |   |
| 4 | 5500-900097G | UNITECH P/EA520 GUN GRIP | Pendiente | Pendiente | 12X15X09 | 0.2 | 0.2 | BRUTO_CAJA_INDIVIDUAL |   |
| 5 | 99-033A031-0001 | TSC TTP-244CE IMPRESORA, TT/TD, 203DPI, USB/SER/PAR/ETHER. | Pendiente | Pendiente | 27X41X25 | 3.5 | 3.5 | BRUTO_CAJA_INDIVIDUAL |   |
| 6 | 99-052A002-50LF | TSC ALPHA 4L, 4" IMP MOVIL, TD, 203DPI, WIFI/BT/LCD | Pendiente | Pendiente | 22X30X11 | 1.5 | 1.5 | BRUTO_CAJA_INDIVIDUAL |   |
| 7 | 99-053A033-0201 | TSC TX200, IMPRESORA TT/TD, 203DPI, USB/ETH/HOST DISPLAY | Pendiente | Pendiente | 33X47X30 | 5.8 | 5.8 | BRUTO_CAJA_INDIVIDUAL |   |
| 8 | 99-053A033-50LF | TSC TX200, IMPRESORA TT/TD, 203DPI, USB/ETH/HOST DISPLAY | Pendiente | Pendiente | 33X47X30 | 5.8 | 5.8 | BRUTO_CAJA_INDIVIDUAL |   |
| 9 | 99-059A001-1001 | TSC TC210 IMPRESORA, TT 203 DPI, USB/SER/PAR/ETH LCD DISPLAY | Pendiente | Pendiente | 27X41X28 | 3.7 | 3.7 | BRUTO_CAJA_INDIVIDUAL |   |
| 10 | 99-059A002-2001 | TSC TC310 IMPRESORA, TT/DT,300DPI, USB/SER/ETH, USB HOST | Pendiente | Pendiente | 27X41X27 | 3.8 | 3.8 | BRUTO_CAJA_INDIVIDUAL |   |
| 11 | 99-065A100-00LF00 | TSC TE200 IMPRESORA, TT/TD, 203DPI, USB | Pendiente | Pendiente | 28X41X24 | 3.8 | 3.8 | BRUTO_CAJA_INDIVIDUAL |   |
| 12 | 99-065A300-00LF00 | TSC TE210 IMPRESORA, TT/TD, 203DPI, USB/SER/ETH, USB HOST | Pendiente | Pendiente | 28X41X24 | 3.8 | 3.8 | BRUTO_CAJA_INDIVIDUAL |   |
| 13 | 99-082A101-0001 | TSC TDM-20 2" IMP MOVIL TD 203 DPI MFI BT C/SENSOR | Pendiente | Pendiente | 13X25X06 | 0.4 | 0.4 | BRUTO_CAJA_INDIVIDUAL |   |
| 14 | 99-083A101-0011 | TSC TDM-30 3" IMP MOVIL TD 203 DPI MFI BT C/SENSOR | Pendiente | Pendiente | 13X25X06 | 0.6 | 0.6 | BRUTO_CAJA_INDIVIDUAL |   |
| 15 | 99-158A013-1101 | TSC DA220, IMPRESORA TD 203 DPI, 6 IPS, USB, ETHERNET, RS232 | Pendiente | Pendiente | 24X35X22 | 2.6 | 2.6 | BRUTO_CAJA_INDIVIDUAL |   |
| 16 | C31CL47022 | EPSON TM-T20IV-SP, MINIPRINTER TD, USB/SER/ETH NGA. | Pendiente | Pendiente | 19X24X28 | 2.7 | 2.7 | BRUTO_CAJA_INDIVIDUAL |   |
| 17 | CUT-RT425-0001 | RIBETEC P/RT-425TT/ KIT FULL CUTTER | Pendiente | Pendiente | 16X20X11 | 0.5 | 0.5 | BRUTO_CAJA_INDIVIDUAL |   |
| 18 | DC0650-2N | 3NSTAR NUSTAR 65 TERMINAL 6.5" AND 14, BT/WIFI/4G LTE, 2D CON FUNDA | Pendiente | Pendiente | 10X20X06 | 0.5 | 0.5 | BRUTO_CAJA_INDIVIDUAL |   |
| 19 | DPO78-2394-01/GCO | REBOBINADOR EXTERNO PARA I CLASS GCO | Pendiente | Pendiente | 27X36X27 | 4.0 | 4.0 | BRUTO_CAJA_INDIVIDUAL |   |
| 20 | DS2278-SR7U2100PRW | ZEBRA DS2278 LECTOR, IMAGER 2D, USB KIT C/BASE, NGO | Pendiente | Pendiente | 20X23X17 | 0.8 | 0.8 | BRUTO_CAJA_INDIVIDUAL |   |
| 21 | DS9308-SR4U2100AZW | ZEBRA DS9308 LECTOR, IMAGER 2D, RANGO ESTANDAR, USB KIT | Pendiente | Pendiente | 17X24X12 | 0.6 | 0.6 | BRUTO_CAJA_INDIVIDUAL |   |
| 22 | LTT214 | 3NSTAR LTT214 IMPRESORA 4" TT/TD 203DPI USB/ETH NGO. | Pendiente | Pendiente | 25X35X23 | 2.9 | 2.9 | BRUTO_CAJA_INDIVIDUAL |   |
| 23 | LTT334 | 3NSTAR LTT334 IMPRESORA 4" TT/TD 203DPI USB/ETH NGO INC. S/EXT. | Pendiente | Pendiente | 28X45X23 | 4.5 | 4.5 | BRUTO_CAJA_INDIVIDUAL |   |
| 24 | MB241T-A001-0201 | TSC MB241T IMPRESORA TT/TD, 203DPI, USB/SER/ETH USBHOST, LCD | Pendiente | Pendiente | 35X53X38 | 11.8 | 11.8 | BRUTO_CAJA_INDIVIDUAL |   |
| 25 | MH241T-A001-0301 | TSC MH241T IMPRESORA TT/TD 203 DPI, USB/SER/PAR/ETH/WIFI LCD | Pendiente | Pendiente | 40X63X46 | 18.1 | 18.1 | BRUTO_CAJA_INDIVIDUAL |   |
| 26 | MH261T-A001-0301 | TSC MH261T IMPRESORA TT/TD 203 DPI, USB/SER/PAR/ETH LCD | Pendiente | Pendiente | 50X63X46 | 21.0 | 21.0 | BRUTO_CAJA_INDIVIDUAL |   |
| 27 | MT-50/GCO | MT-50 ETIQUETADORA DE BOTELLAS MANUAL GCO | Pendiente | Pendiente | 31X52X32 | 8.1 | 8.1 | BRUTO_CAJA_INDIVIDUAL |   |
| 28 | MX241P-A001-0001 | TSC MX241P IMPRESORA TT/TD 203 DPI, WIFI | Pendiente | Pendiente | 45X66X55 | 20.6 | 20.6 | BRUTO_CAJA_INDIVIDUAL |   |
| 29 | P415-09-8240W11 | 3NSTAR SISTEMA POS 15" 1024x768, N95, 8GB RAM, 240GB SSD, Capacitive, Windows 11 IOT | Pendiente | Pendiente | 17X45X42 | 5.5 | 5.5 | BRUTO_CAJA_INDIVIDUAL |   |
| 30 | PPR-40BS | TECNOCOR BASCULA ELEC DE MESA 40KG CON BANDERA LCD PLASTICO C/RS232 | Pendiente | Pendiente | 34X22X21 | 5.5 | 5.5 | BRUTO_CAJA_INDIVIDUAL |   |
| 31 | PPT305BT | 3NSTAR PPT305BT IMP MOVIL 3" 203DPI USB/BT NGO/RJO. | Pendiente | Pendiente | 16X18X08 | 0.7 | 0.7 | BRUTO_CAJA_INDIVIDUAL |   |
| 32 | QBT2430-BK-BTK1-K625 | ET02, LECTOR DE CODIGO 2D, K625 BLUETOOTH C/BASE RECARGABLE-YRHK73374 | Pendiente | Pendiente | 17X22X10 | 0.5 | 0.5 | BRUTO_CAJA_INDIVIDUAL |   |
| 33 | QR-4142LS | OKAYPOS CAJON DE DINERO NGO | Pendiente | Pendiente | 47X47X16 | 7.5 | 7.5 | BRUTO_CAJA_INDIVIDUAL |   |
| 34 | QW2520-BKK1S | DATALOGIC QW2520 LECTOR 2D USB STRAIGHT C/BASE | Pendiente | Pendiente | 19X22X10 | 0.6 | 0.6 | BRUTO_CAJA_INDIVIDUAL |   |
| 35 | RDR-80531BKU | RFIDEAS PCPROX PLUS LECTOR RFID USB PLUG & PLAY | Pendiente | Pendiente | 15X11X04 | 0.1 | 0.1 | BRUTO_CAJA_INDIVIDUAL |   |
| 36 | RE-326BE-1 | RIBETEC RE-326BE IMPRESORA TERMICA TICKET Y RECIBOS 3" 203 DPI USB/ETH/BT NGO. | Pendiente | Pendiente | 20X22X15 | 1.45 | 1.45 | BRUTO_CAJA_INDIVIDUAL |   |
| 37 | RH-60 | RIBETEC RH-60 ETIQUETADORA MANUAL | Pendiente | Pendiente | 13X29X10 | 0.6 | 0.6 | BRUTO_CAJA_INDIVIDUAL |   |
| 38 | RI-430TT | RIBETEC RI-430TT IMPRESORA  4" TT/TD 300 DPI USB/ETH | Pendiente | Pendiente | 34X58X38 | 12.6 | 12.6 | BRUTO_CAJA_INDIVIDUAL |   |
| 39 | RM-351LU | RIBETEC MAMBA 351LU, LECTOR  IMAG 1D/2D USB C/BASE | Pendiente | Pendiente | 11X18X15 | 0.55 | 0.55 | BRUTO_CAJA_INDIVIDUAL |   |
| 40 | RM-352BT | RIBETEC MAMBA 352BT, LECTOR IMAG 1D/2D, BLUETOOTH | Pendiente | Pendiente | 11X18X15 | 0.55 | 0.55 | BRUTO_CAJA_INDIVIDUAL |   |
| 41 | RM-523PB | RIBETEC MAMBA 523PB, LECTOR IMAG 2D, PORTATIL BT C/GUANTE | Pendiente | Pendiente | 10X12X10 | 0.3 | 0.3 | BRUTO_CAJA_INDIVIDUAL |   |
| 42 | RPT004 | 3NSTAR RPT004 MINIPRINTER TD USB/ETH NGO. | Pendiente | Pendiente | 20X22X15 | 1.6 | 1.6 | BRUTO_CAJA_INDIVIDUAL |   |
| 43 | RT-220PB-1 | RIBETEC RT-220PB IMP MOVIL 2" 203DPI USB/BT NGO | Pendiente | Pendiente | 10X16X07 | 0.4 | 0.4 | BRUTO_CAJA_INDIVIDUAL |   |
| 44 | RT-320PB | RIBETEC RT-320PB IMP MOVIL 3" 203DPI USB/BT NGO/BCO. | Pendiente | Pendiente | 16X18X08 | 0.65 | 0.65 | BRUTO_CAJA_INDIVIDUAL |   |
| 45 | RT-420BE | RIBETEC RT-420BE IMPRESORA  4" TD 203 DPI USB/ETH/BT BCO-NGO | Pendiente | Pendiente | 25X34X23 | 2.5 | 2.5 | BRUTO_CAJA_INDIVIDUAL |   |
| 46 | RT-425TT | RIBETEC RT-425TT IMPRESORA  4" TT/TD 203 DPI USB/ETH BCO. | Pendiente | Pendiente | 28X41X23 | 3.8 | 3.8 | BRUTO_CAJA_INDIVIDUAL |   |
| 47 | RT-425TT-CUT | RIBETEC RT-425TT IMPRESORA 4" TT/TD 203 DPI USB/ETH BCO C/CUTTER | Pendiente | Pendiente | 28X41X23 | 4.0 | 4.0 | BRUTO_CAJA_INDIVIDUAL |   |
| 48 | RT-5500EOS | RIBETEC ETIQUETADORA 1 LINEA 8 DÍGITOS | Pendiente | Pendiente | 15X23X06 | 0.5 | 0.5 | BRUTO_CAJA_INDIVIDUAL |   |
| 49 | RT-6600EOS | RIBETEC ETIQUETADORA 2 LINEAS 20 DÍGITOS | Pendiente | Pendiente | 18X26X06 | 0.5 | 0.5 | BRUTO_CAJA_INDIVIDUAL |   |
| 50 | SC415 | 3NSTAR SC415, LECTOR IMAG 1D/2D USB C/BASE | Pendiente | Pendiente | 12X20X09 | 0.5 | 0.5 | BRUTO_CAJA_INDIVIDUAL |   |
| 51 | SF-400 | ELECTRONIC SF-400 BASCULA 7KG, OZ/G/LCD DIGITAL BCO | Pendiente | Pendiente | 18X24X04 | 0.4 | 0.4 | BRUTO_CAJA_INDIVIDUAL |   |
| 52 | SOPORTE-420ME | RIBETEC P/420ME SOPORTE EXTERNO DE ETIQUETAS NEGRO | Pendiente | Pendiente | 22X28X06 | 0.65 | 0.65 | BRUTO_CAJA_INDIVIDUAL |   |
| 53 | SP-COM-1003 | TSC P/ALPHA 3R, FUENTE DE PODER | Pendiente | Pendiente | 11X18X05 | 0.2 | 0.2 | BRUTO_CAJA_INDIVIDUAL |   |
| 54 | SRP-330IIIESK | BIXOLON SRP-330III MINIPRINTER, TD, 180DPI, USB/SER/ETH/CUTT | Pendiente | Pendiente | 20X25X29 | 2.5 | 2.5 | BRUTO_CAJA_INDIVIDUAL |   |
| 55 | SRP-330IIISK | BIXOLON SRP-330III MINIPRINTER, TD, 180DPI, USB/SERIAL/CUTT | Pendiente | Pendiente | 20X25X29 | 2.5 | 2.5 | BRUTO_CAJA_INDIVIDUAL |   |
| 56 | TOWAAP-F30 | TOWA APF-30 ETIQUETADORA MANUAL | Pendiente | Pendiente | 12X28X06 | 0.5 | 0.5 | BRUTO_CAJA_INDIVIDUAL |   |
| 57 | TOWAAP65100 | TOWA AP65-100 ETIQUETADORA MANUAL | Pendiente | Pendiente | 13X28X11 | 0.5 | 0.5 | BRUTO_CAJA_INDIVIDUAL |   |
| 58 | TOWAAP6530 | TOWA AP65-30 ETIQUETADORA MANUAL | Pendiente | Pendiente | 12X29X06 | 0.4 | 0.4 | BRUTO_CAJA_INDIVIDUAL |   |
| 59 | TOWAAP6560 | TOWA AP65-60 ETIQUETADORA MANUAL | Pendiente | Pendiente | 12X28X09 | 0.5 | 0.5 | BRUTO_CAJA_INDIVIDUAL |   |
| 60 | TRAK16GL | TRAK 16GL ETIQUETADORA | Pendiente | Pendiente | 15X26X06 | 0.5 | 0.5 | BRUTO_CAJA_INDIVIDUAL |   |
| 61 | TRAK30GT | TRAK 30GT ETIQUETADORA | Pendiente | Pendiente | 16X28X07 | 0.8 | 0.8 | BRUTO_CAJA_INDIVIDUAL |   |
| 62 | TRAK8GS | TRAK 8GS ETIQUETADORA | Pendiente | Pendiente | 14X25X06 | 0.5 | 0.5 | BRUTO_CAJA_INDIVIDUAL |   |
| 63 | TX610-A001-1201 | TSC TX610, IMPRESORA TT/TD, 600 DPI, USB/ETH/SER/HOST DISP | Pendiente | Pendiente | 30X45X28 | 6.3 | 6.3 | BRUTO_CAJA_INDIVIDUAL |   |
| 64 | WA2010508 | SATO ETIQUETADORA PB2-180 AZUL 2 LINEAS 16 DÍGITOS | Pendiente | Pendiente | 19X27X06 | 0.6 | 0.6 | BRUTO_CAJA_INDIVIDUAL |   |
| 65 | WA2010523 | SATO ETIQUETADORA PB2-180 NGA 2 LINEAS 16 DÍGITOS | Pendiente | Pendiente | 19X27X06 | 0.6 | 0.6 | BRUTO_CAJA_INDIVIDUAL |   |
| 66 | ZC11-0000Q00LA00 | ZEBRA ZC100 IMPRESORA DE CREDENCIALES, UNA CARA USB KIT | Pendiente | Pendiente | 21X59X42 | 8.5 | 8.5 | BRUTO_CAJA_INDIVIDUAL |   |
| 67 | ZC32-000C000LA00 | ZEBRA ZC300 IMPRESORA DE CREDENCIALES, DOBLE CARA, USB/ETH | Pendiente | Pendiente | 20X58X31 | 6.7 | 6.7 | BRUTO_CAJA_INDIVIDUAL |   |
| 68 | ZC32-000CQ00LA00 | ZEBRA ZC300 IMPRESORA DE CREDENCIALES, 2 CARAS, USB/ETH KIT | Pendiente | Pendiente | 21X60X43 | 9.0 | 9.0 | BRUTO_CAJA_INDIVIDUAL |   |
| 69 | ZD22042-D01G00EZ | ZEBRA ZD220 IMPRESORA, TD, USB, 203DPI | Pendiente | Pendiente | 20X31X22 | 2.4 | 2.4 | BRUTO_CAJA_INDIVIDUAL |   |
| 70 | ZD22042-T01G00EZ | ZEBRA ZD220 IMPRESORA, TT/TD, USB, 203DPI | Pendiente | Pendiente | 24X34X28 | 3.2 | 3.2 | BRUTO_CAJA_INDIVIDUAL |   |
| 71 | ZD4A042-301M00EZ | ZEBRA ZD421 IMPRESORA, TT/TD, USB/USBHOST, 203 DPI, (74/300M) | Pendiente | Pendiente | 29X33X23 | 3.6 | 3.6 | BRUTO_CAJA_INDIVIDUAL |   |
| 72 | ZT23142-T01000FZ | ZEBRA ZT231 IMPRESORA, TT/TD, USB/SER/ETH, 203 DPI, 4" | Pendiente | Pendiente | 29X49X33 | 10.2 | 10.2 | BRUTO_CAJA_INDIVIDUAL |   |
| 73 | ZT41142-T010000Z | ZEBRA ZT411 IMPRESORA, TT/TD USB/SER/ETH/BT 203 DPI | Pendiente | Pendiente | 38X59X46 | 18.1 | 18.1 | BRUTO_CAJA_INDIVIDUAL |   |

## Ribbon — columna por columna

| Columna | Nombre | Con valor guardado | Uso e interpretación |
| --- | --- | --- | --- |
| A | Producto | 139 | Clave de cruce exacta con default_code de Odoo. Preservar ceros iniciales y variantes. |
| B | Descripcion | 139 | Referencia comercial. Contiene capacidad o presentación en algunos casos; proviene de fórmulas con datos externos guardados en el XLSX. |
| C | Marca | 139 | Marca comercial. No determina automáticamente la unidad de venta. |
| D | Tipo | 137 | Familia comercial; ayuda a decidir si se vende por pieza, rollo, caja o millar. |
| E | Centro | 135 | Núcleo del rollo, no diámetro exterior. Valores mezclan números y texto; confirmar unidad. |
| F | Total Piezas x Caja | 111 | Contenido de caja de ribbons; no acredita por sí solo la UDM de venta en Odoo. |
| G | Caja de Empaque (ancho x largo x alto cm) | 94 | Medidas de la caja exterior. Separar ancho, largo, alto en este orden; no asignar al rollo. |
| H | Peso Real x Caja | 92 | Peso bruto declarado de la presentación. Confirmar kg. Incluye empaque. |
| I | Sin Registro x Caja | 139 | Indicador auxiliar; no prueba que falten datos ni que estén completos. Validar los campos reales. |
| J | Calculo Peso x Pieza | 92 | Peso estimado con tara de 0.10, 0.15 o 0.25 kg según peso volumétrico de caja; es una heurística. |
| K | Calculo Peso Volumetrico Caja | 92 | Volumen exterior /5000. Nunca usar como peso físico individual. |
| L | Valor mas alto | 92 | Comparación del peso físico y volumétrico de la caja. |
| M | Redondeo para Paqueteria | 92 | Estimación redondeada de peso facturable; no es peso físico del producto. |
| N | Peso Real x Pieza | 28 | Peso individual declarado directamente; no es dimensión física. |
| O | Observaciones | 0 | Conservar proveedor, variante, reempacado y CONFIRMAR; afectan selección del perfil. |

### Registros producto por producto

Capacidad en millares/rollo es candidata, no confirma UDM Odoo. Peso calculado no equivale a peso medido. Medidas listadas son de caja; las individuales permanecen pendientes, salvo posible perfil de equipo embalado. Cada fila original se conserva por separado.

| Fila | SKU | Descripción | Millares/rollo candidato | Contenido/caja | Caja ancho×largo×alto cm | Bruto caja kg | Peso unitario candidato kg | Origen peso | Alertas / observaciones |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2 | 025122THSSI | HSF025122BLK RIBBON 25*122 HOT STAMPING STD NEGRO | Pendiente | Pendiente | Pendiente | Pendiente | 0.1 | MEDIDO_DECLARADO |   |
| 3 | 025300TCEPO | ZEB025300PVW RIBBON TECTRONIC 25*300 CEPO | Pendiente | 36.0 | 22X22X13 | 2.9 | 0.073611 | CALCULADO_CON_TARA_SUPUESTA |   |
| 4 | 026122HSN-TDZ | RIBBON 25*122 HOT STAMPING NEGRO 1067002 | Pendiente | 24.0 | 17X20X13 | 2.1 | 0.083333 | CALCULADO_CON_TARA_SUPUESTA |   |
| 5 | 030122THSSI | HSF030122BLK RIBBON TECTRONIC 30*122 HOT STAMPING STD NEGRO | Pendiente | 48.0 | 22X32X19 | 5.5 | 0.109375 | CALCULADO_CON_TARA_SUPUESTA |   |
| 6 | 030300ZRETO-2 | RIBBON ZEB 30*300 RETO PREMIUM | Pendiente | Pendiente | Pendiente | Pendiente | 0.1 | MEDIDO_DECLARADO |   |
| 7 | 0331000TNECRSI | MSD033000TTO-K RIBBON TECTRONIC 33*1000 NECRSI PARA MARKEM | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente | FALTANTE | FALTA_PESO  |
| 8 | 033550TNECRSO | VDJ033550 RIBBON TECTRONIC 33*550 NECRSO | Pendiente | 24.0 | 24X30X17 | 4.3 | 0.16875 | CALCULADO_CON_TARA_SUPUESTA |   |
| 9 | 033600TNECRSO | VDJ033600TTO RIBBON TECTRONIC 33*600 TNECRSO | Pendiente | 20.0 | 24X31X17 | 4.05 | 0.19 | CALCULADO_CON_TARA_SUPUESTA |   |
| 10 | 035122THSSI | HSF035122BLK RIBBON TECTRONIC 35*122 HOT STAMPING STD NEGRO | Pendiente | 48.0 | 24X30X17 | 6.35 | 0.127083 | CALCULADO_CON_TARA_SUPUESTA |   |
| 11 | 035300TRXSO | ZEB035300WCP RIBBON TECTRONIC 35*300 RXSO | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente | FALTANTE | FALTA_PESO  |
| 12 | 038183THSSI | HSF038183BLK RIBBON TECTRONIC 38*183 HOT STAMPING STD NEGRO | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente | FALTANTE | FALTA_PESO  |
| 13 | 038183THSSIB | HSF038183LB5 RIBBON TECTRONIC 38*183 HOT STAMPING STD BLANCO | Pendiente | 48.0 | 25X31X25 | 10.75 | 0.21875 | CALCULADO_CON_TARA_SUPUESTA |   |
| 14 | 038300TRESO | ZEB038300VR RIBBON TECTRONIC 38*300 RESO | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente | FALTANTE | FALTA_PESO  |
| 15 | 040300TREPO | ZEB040300R RIBBON TECTRONIC 40*300 REPO | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente | FALTANTE | FALTA_PESO  |
| 16 | 040300TRESO | ZEB040300VR RIBBON TECTRONIC 40*300 RESO | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente | FALTANTE | FALTA_PESO  |
| 17 | 042213THSSIB | HSF042213LB5-T RIBBON TECTRONIC 42*213 HOT STAMPING STD BLANCO | Pendiente | 48.0 | 25X31X28 | 13.85 | 0.283333 | CALCULADO_CON_TARA_SUPUESTA |   |
| 18 | 050122HSN-TDZ | RIBBON 50*122 HOT STAMPING NEGRO | Pendiente | Pendiente | Pendiente | Pendiente | 0.15 | MEDIDO_DECLARADO |   |
| 19 | 051450ZCESO | RIBBON ZEB 51*450 CESO | Pendiente | 36.0 | 23X33X18 | 8.65 | 0.233333 | CALCULADO_CON_TARA_SUPUESTA |   |
| 20 | 053300RRXSO | RIBBON RIBETEC 53*300 RXSO | Pendiente | 12.0 | 15X22X13 | 1.75 | 0.1375 | CALCULADO_CON_TARA_SUPUESTA |   |
| 21 | 053300TRXSO | ZEB053300WCP RIBBON TECTRONIC 53*300 RXSO | Pendiente | 36.0 | 25X30X17 | 5.95 | 0.158333 | CALCULADO_CON_TARA_SUPUESTA |   |
| 22 | 055074RRXSO | RIBBON RIBETEC 55*74 RXSO | Pendiente | 24.0 | 15X22X13 | 1.15 | 0.04375 | CALCULADO_CON_TARA_SUPUESTA |   |
| 23 | 055074TCESO | ZEB055074CRA RIBBON TECTRONIC 55*74 CESO | Pendiente | 36.0 | 21X21X13 | Pendiente | Pendiente | FALTANTE | FALTA_PESO  |
| 24 | 055074TRESO | ZEB055074VR RIBBON TECTRONIC 55*74 RESO | Pendiente | 36.0 | 21X21X13 | Pendiente | Pendiente | FALTANTE | FALTA_PESO  |
| 25 | 055074TRXSO | ZEB055074WCP RIBBON TECTRONIC 55*74 RXSO | Pendiente | 36.0 | 21X21X13 | 2.0 | 0.051389 | CALCULADO_CON_TARA_SUPUESTA |   |
| 26 | 055500SCRTI | RIBBON SWI 55*500 CRTI | Pendiente | Pendiente | Pendiente | Pendiente | 0.3 | MEDIDO_DECLARADO |   |
| 27 | 055700TNECRSO | VDJ055700 RIBBON TECTRONIC 55*700 NECRSO | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente | FALTANTE | FALTA_PESO  |
| 28 | 060075SCRTO | RIBBON TSC 60*75 CRTO BLANCO P/TTP 225 | Pendiente | 60.0 | 21X21X15 | 4.0 | 0.0625 | CALCULADO_CON_TARA_SUPUESTA |   |
| 29 | 060300RCRSO | RIBBON RIBETEC 60*300 CRSO | Pendiente | 12.0 | 17X20X14 | 1.95 | 0.15 | CALCULADO_CON_TARA_SUPUESTA |   |
| 30 | 060300TCESO | ZEB060300CRA RIBBON TECTRONIC 60*300 CESO | Pendiente | 36.0 | 21X29X24 | 7.0 | 0.1875 | CALCULADO_CON_TARA_SUPUESTA |   |
| 31 | 060300TCRPO | ZEB060300PWR RIBBON TECTRONIC 60*300 CRPO | Pendiente | 36.0 | 22X29X24 | 6.95 | 0.186111 | CALCULADO_CON_TARA_SUPUESTA |   |
| 32 | 060450TCESO | ZEB060450CRA RIBBON TECTRONIC 60*450 CESO | Pendiente | 36.0 | 24X31X24 | 9.7 | 0.2625 | CALCULADO_CON_TARA_SUPUESTA |   |
| 33 | 060450TRESO | ZEB060450VR RIBBON TECTRONIC 60*450 RESO | Pendiente | 36.0 | 24X31X22 | 8.6 | 0.231944 | CALCULADO_CON_TARA_SUPUESTA |   |
| 34 | 064074RCESO | RIBBON RIBETEC 64*74 CESO | Pendiente | 72.0 | 24X24X25 | 4.0 | 0.052083 | CALCULADO_CON_TARA_SUPUESTA |   |
| 35 | 064074RCRSO | RIBBON RIBETEC 64*74 CRSO | Pendiente | 24.0 | 17X20X14 | 1.35 | 0.05 | CALCULADO_CON_TARA_SUPUESTA |   |
| 36 | 064074RRESO | RIBBON RIBETEC 64*74 RESO | Pendiente | 24.0 | 17X20X14 | 1.95 | 0.075 | CALCULADO_CON_TARA_SUPUESTA |   |
| 37 | 064074TCESO | ZEB064074CRA RIBBON TECTRONIC 64*74 CESO | Pendiente | 36.0 | 21X21X13 | 2.2 | 0.056944 | CALCULADO_CON_TARA_SUPUESTA |   |
| 38 | 064074TCRPO | ZEB064074PWR RIBBON TECTRONIC 64*74 CRPO | Pendiente | 36.0 | 21X21X13 | 2.3 | 0.059722 | CALCULADO_CON_TARA_SUPUESTA |   |
| 39 | 064074TRESO | ZEB064074VR RIBBON TECTRONIC 64*74 RESO | Pendiente | 36.0 | 21X21X13 | 2.05 | 0.052778 | CALCULADO_CON_TARA_SUPUESTA |   |
| 40 | 064074ZCEPO | RIBBON ZEB 64*74 CEPO | Pendiente | 24.0 | Pendiente | Pendiente | 0.05 | MEDIDO_DECLARADO |   |
| 41 | 064074ZRETO | RIBBON ZEB 64*74 RETO | Pendiente | 24.0 | 17X20X13 | 1.25 | 0.047917 | CALCULADO_CON_TARA_SUPUESTA |   |
| 42 | 064300TRESOB | ZEB064300RW RIBBON TECTRONIC 64*300 RESO BLANCO | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente | FALTANTE | FALTA_PESO  |
| 43 | 065300RRESO | RIBBON RIBETEC 65*300 RESO | Pendiente | 12.0 | 20X24X15 | 2.45 | 0.183333 | CALCULADO_CON_TARA_SUPUESTA |   |
| 44 | 065300TRESO | ZEB065300VR RIBBON TECTRONIC 65*300 RESO | Pendiente | 36.0 | 22X29X24 | 6.6 | 0.176389 | CALCULADO_CON_TARA_SUPUESTA |   |
| 45 | 075300RCRSOP | RIBBON RIBETEC 75*300 CRSO PLATA | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente | FALTANTE | FALTA_PESO  |
| 46 | 076360TCEPI | DMX076360PVW RIBBON TECTRONIC 76*360 CEPI | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente | FALTANTE | FALTA_PESO  |
| 47 | 076800TECCEO | RIBBON TEC 76*800 CE-RE AG5 | Pendiente | Pendiente | Pendiente | Pendiente | 0.5 | MEDIDO_DECLARADO |   |
| 48 | 083074RCESO | RIBBON RIBETEC 83*74 CESO | Pendiente | 72.0 | 24X24X25 | 5.8 | 0.077083 | CALCULADO_CON_TARA_SUPUESTA |   |
| 49 | 083074TCESO | ZEB083074CRA RIBBON TECTRONIC 83*74 CESO | Pendiente | 36.0 | 21X21X13 | 2.8 | 0.073611 | CALCULADO_CON_TARA_SUPUESTA |   |
| 50 | 083074ZCEPO | RIBBON ZEB 83*74 CEPO | Pendiente | 24.0 | Pendiente | Pendiente | 0.05 | MEDIDO_DECLARADO |   |
| 51 | 083300RCESO | RIBBON RIBETEC 83*300 CESO | Pendiente | 24.0 | Pendiente | Pendiente | 0.25 | MEDIDO_DECLARADO |   |
| 52 | 083300TCESO | ZEB083300CRA RIBBON TECTRONIC 83*300 CESO | Pendiente | 24.0 | 22X32X18 | 6.4 | 0.25625 | CALCULADO_CON_TARA_SUPUESTA |   |
| 53 | 083450RCEPO | RIBBON RIBETEC 83*450 CEPO | Pendiente | 12.0 | 20X24X19 | 4.9 | 0.3875 | CALCULADO_CON_TARA_SUPUESTA |   |
| 54 | 083450RCRSO | RIBBON RIBETEC 83*450 CRSO | Pendiente | 12.0 | 20X24X19 | 4.25 | 0.333333 | CALCULADO_CON_TARA_SUPUESTA |   |
| 55 | 083450RRESO | RIBBON RIBETEC 83*450 RESO | Pendiente | 12.0 | 19X24X19 | 4.15 | 0.325 | CALCULADO_CON_TARA_SUPUESTA |   |
| 56 | 083450TCEPO | ZEB083450PVW RIBBON TECTRONIC 83*450 CEPO | Pendiente | 24.0 | 24X31X21 | 8.95 | 0.3625 | CALCULADO_CON_TARA_SUPUESTA |   |
| 57 | 083450TCRPO | ZEB083450PWR RIBBON TECTRONIC 83*450 CRPO | Pendiente | 24.0 | 24X31X21 | 9.1 | 0.36875 | CALCULADO_CON_TARA_SUPUESTA |   |
| 58 | 083450TREGO | ZEB083450VR9 RIBBON TECTRONIC 83*450 REGO | Pendiente | 24.0 | Pendiente | Pendiente | Pendiente | FALTANTE | FALTA_PESO  |
| 59 | 083450TRESO | ZEB083450VR RIBBON TECTRONIC 83*450 RESO | Pendiente | 24.0 | 24X31X25 | 8.0 | 0.322917 | CALCULADO_CON_TARA_SUPUESTA |   |
| 60 | 083450TRESO-ID1036093 | ZEB083450VR RIBBON TECTRONIC ID: 1036093 83*450 RESO  | Pendiente | 24.0 | 24X31X25 | 8.0 | 0.322917 | CALCULADO_CON_TARA_SUPUESTA |   |
| 61 | 083450ZCEPO | RIBBON ZEB 83*450 CEPO | Pendiente | 12.0 | Pendiente | Pendiente | 0.4 | MEDIDO_DECLARADO |   |
| 62 | 083450ZCRTO | RIBBON ZEB 83*450 CRTO | Pendiente | 12.0 | Pendiente | Pendiente | 0.4 | MEDIDO_DECLARADO |   |
| 63 | 085450TCEUI-CC | MSD085450PWN RIBBON TECTRONIC 85*450 CEUI | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente | FALTANTE | FALTA_PESO  |
| 64 | 102250TCEPOA | ZEB102250GPB RIBBON TECTRONIC 102*250 CEPO AZUL | Pendiente | 24.0 | 22X29X24 | 6.8 | 0.272917 | CALCULADO_CON_TARA_SUPUESTA |   |
| 65 | 102250TCEPOR | ZEB102250GPR RIBBON TECTRONIC 102*250 CEPO ROJO | Pendiente | 24.0 | 22X29X24 | 6.8 | 0.272917 | CALCULADO_CON_TARA_SUPUESTA |   |
| 66 | 102250TRESOB | ZEB102250RW RIBBON TECTRONIC 102*250 RESO BLANCO | Pendiente | 24.0 | 21X29X24 | 8.6 | 0.347917 | CALCULADO_CON_TARA_SUPUESTA |   |
| 67 | 102300RCESO | RIBBON RIBETEC 102*300 CESO | Pendiente | 24.0 | Pendiente | Pendiente | 0.3 | MEDIDO_DECLARADO |   |
| 68 | 102300RRESO | RIBBON RIBETEC 102*300 RESO | Pendiente | 12.0 | 22X29X13 | 3.65 | 0.283333 | CALCULADO_CON_TARA_SUPUESTA |   |
| 69 | 102300RRXSO | RIBBON RIBETEC 102*300 RXSO | Pendiente | 12.0 | 22X28X13 | 3.45 | 0.266667 | CALCULADO_CON_TARA_SUPUESTA |   |
| 70 | 102300TCEPOA | ZEB102300GPB RIBBON TECTRONIC 102*300 CEPO AZUL | Pendiente | 24.0 | 22X29X24 | 8.65 | 0.35 | CALCULADO_CON_TARA_SUPUESTA |   |
| 71 | 102300TCEPOR | ZEB102300GPR RIBBON TECTRONIC 102*300 CEPO ROJO | Pendiente | 24.0 | 22X29X24 | 8.65 | 0.35 | CALCULADO_CON_TARA_SUPUESTA |   |
| 72 | 102300TCESO | ZEB102300CRA RIBBON TECTRONIC 102*300 CESO | Pendiente | 24.0 | 22X29X24 | 7.85 | 0.316667 | CALCULADO_CON_TARA_SUPUESTA |   |
| 73 | 102300TCRPO | ZEB102300PWR RIBBON TECTRONIC 102*300 CRPO | Pendiente | 24.0 | 22X29X24 | 7.85 | 0.316667 | CALCULADO_CON_TARA_SUPUESTA |   |
| 74 | 102300TRESO | ZEB102300VR RIBBON TECTRONIC 102*300 RESO | Pendiente | 24.0 | 22X29X24 | 6.9 | 0.277083 | CALCULADO_CON_TARA_SUPUESTA |   |
| 75 | 102300TRESOB | ZEB102300RW RIBBON TECTRONIC 102*300 RESO BLANCO | Pendiente | 24.0 | 22X29X24 | 7.35 | 0.295833 | CALCULADO_CON_TARA_SUPUESTA |   |
| 76 | 102300TRESOR | ZEB102300RR RIBBON TECTRONIC 102*300 RESO ROJO | Pendiente | 24.0 | 22X29X24 | 7.35 | 0.295833 | CALCULADO_CON_TARA_SUPUESTA |   |
| 77 | 102300TRXSO | ZEB102300WCP RIBBON TECTRONIC 102*300 RXSO | Pendiente | 24.0 | 22X29X24 | 7.75 | 0.3125 | CALCULADO_CON_TARA_SUPUESTA |   |
| 78 | 102300ZCESO | RIBBON ZEB 102*300 CESO | Pendiente | 12.0 | Pendiente | Pendiente | 0.35 | MEDIDO_DECLARADO |   |
| 79 | 102300ZCRTO | RIBBON ZEB 102*300 CRTO | Pendiente | 12.0 | Pendiente | Pendiente | 0.35 | MEDIDO_DECLARADO |   |
| 80 | 102360FRETI | RIBBON RIBETEC 102*360 FRETI | Pendiente | 12.0 | Pendiente | Pendiente | 0.35 | MEDIDO_DECLARADO |   |
| 81 | 102360TRESO | ZEB102360VR RIBBON TECTRONIC 102*360 RESO | Pendiente | 24.0 | 22X29X27 | 7.85 | 0.316667 | CALCULADO_CON_TARA_SUPUESTA |   |
| 82 | 102360ZRETO | RIBBON ZEB 102*360 RETO | Pendiente | 12.0 | Pendiente | Pendiente | 0.35 | MEDIDO_DECLARADO |   |
| 83 | 102450RRESO | RIBBON RIBETEC 102*450 RESO | Pendiente | 12.0 | 27X32X13 | 5.3 | 0.420833 | CALCULADO_CON_TARA_SUPUESTA |   |
| 84 | 102450TRESO | ZEB102450VR RIBBON TECTRONIC 102*450 RESO | Pendiente | 24.0 | 24X31X25 | 9.7 | 0.39375 | CALCULADO_CON_TARA_SUPUESTA |   |
| 85 | 102450ZRETO | RIBBON ZEB 102*450 RETO 1036089 | Pendiente | 24.0 | 24X31X24 | 9.9 | 0.402083 | CALCULADO_CON_TARA_SUPUESTA |   |
| 86 | 106800TECCEO | RIBBON TEC 106*800 CE-RE AG5 | Pendiente | 5.0 | 20X24X13 | 3.5 | 0.65 | CALCULADO_CON_TARA_SUPUESTA |   |
| 87 | 110074RCESO | RIBBON RIBETEC 110*74 CESO | Pendiente | 72.0 | 24X24X25 | 6.9 | 0.092361 | CALCULADO_CON_TARA_SUPUESTA |   |
| 88 | 110074RRESO | RIBBON RIBETEC 110*74 RESO | Pendiente | 24.0 | 17X20X14 | 1.95 | 0.075 | CALCULADO_CON_TARA_SUPUESTA |   |
| 89 | 110074TCESO | ZEB110074CRA RIBBON TECTRONIC 110*74 CESO | Pendiente | 36.0 | 21X21X13 | 3.35 | 0.088889 | CALCULADO_CON_TARA_SUPUESTA |   |
| 90 | 110074TCRPO | ZEB110074PWR RIBBON TECTRONIC 110*74 CRPO | Pendiente | 36.0 | 21X21X13 | 3.4 | 0.090278 | CALCULADO_CON_TARA_SUPUESTA |   |
| 91 | 110074TREPO | ZEB110074R RIBBON TECTRONIC 110*74 REPO | Pendiente | 36.0 | 21X21X13 | 3.05 | 0.080556 | CALCULADO_CON_TARA_SUPUESTA |   |
| 92 | 110074TRESO | ZEB110074VR RIBBON TECTRONIC 110*74 RESO | Pendiente | 36.0 | 21X21X13 | 3.05 | 0.080556 | CALCULADO_CON_TARA_SUPUESTA |   |
| 93 | 110074TRXSO | ZEB110074WCP RIBBON TECTRONIC 110*74 RXSO | Pendiente | 36.0 | 21X21X13 | 3.4 | 0.090278 | CALCULADO_CON_TARA_SUPUESTA |   |
| 94 | 110074ZCEPO | RIBBON ZEB/ELT 110*74 CEPO | Pendiente | 24.0 | Pendiente | Pendiente | 0.1 | MEDIDO_DECLARADO |   |
| 95 | 110074ZRETO | RIBBON ZEB/ELT 110*74 RETO | Pendiente | 24.0 | Pendiente | Pendiente | Pendiente | FALTANTE | FALTA_PESO  |
| 96 | 110110DRETI | RIBBON DAT 110*110 RETI | Pendiente | Pendiente | Pendiente | Pendiente | 0.1 | MEDIDO_DECLARADO |   |
| 97 | 110300TCEPO | ZEB110300PVW RIBBON TECTRONIC 110*300 CEPO | Pendiente | 24.0 | 22X29X24 | 8.25 | 0.333333 | CALCULADO_CON_TARA_SUPUESTA |   |
| 98 | 110300TCESO | ZEB110300CRA RIBBON TECTRONIC 110*300 CESO | Pendiente | 24.0 | 21X28X24 | 8.4 | 0.339583 | CALCULADO_CON_TARA_SUPUESTA |   |
| 99 | 110300TCRSO | ZEB110300GWR RIBBON TECTRONIC 110*300 CRSO | Pendiente | 24.0 | Pendiente | Pendiente | Pendiente | FALTANTE | FALTA_PESO  |
| 100 | 110300TRXSO | ZEB110300WCP RIBBON TECTRONIC 110*300 RXSO | Pendiente | 24.0 | Pendiente | Pendiente | Pendiente | FALTANTE | FALTA_PESO  |
| 101 | 110360FRETI | RIBBON FAR/SAT/DAT 110*360 RETI | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente | FALTANTE | FALTA_PESO  |
| 102 | 110360TRESI | DMX110360VR RIBBON TECTRONIC 110*360 RESI | Pendiente | 24.0 | 21X29X24 | 8.8 | 0.35625 | CALCULADO_CON_TARA_SUPUESTA |   |
| 103 | 110450RCEPO | RIBBON RIBETEC 110*450 CEPO | Pendiente | 12.0 | 26X32X13 | 6.35 | 0.508333 | CALCULADO_CON_TARA_SUPUESTA |   |
| 104 | 110450RCESO | RIBBON RIBETEC 110*450 CESO | Pendiente | 24.0 | 26X34X24 | 12.35 | 0.504167 | CALCULADO_CON_TARA_SUPUESTA |   |
| 105 | 110450RCRSO | RIBBON RIBETEC 110*450 CRSO | Pendiente | 12.0 | 27X32X13 | 5.6 | 0.445833 | CALCULADO_CON_TARA_SUPUESTA |   |
| 106 | 110450TCEPO | ZEB110450PVW RIBBON TECTRONIC 110*450 CEPO | Pendiente | 24.0 | 24X31X25 | 11.7 | 0.477083 | CALCULADO_CON_TARA_SUPUESTA |   |
| 107 | 110450TCESO | ZEB110450CRA RIBBON TECTRONIC 110*450 CESO | Pendiente | 24.0 | 24X31X25 | 11.9 | 0.485417 | CALCULADO_CON_TARA_SUPUESTA |   |
| 108 | 110450TCRPO | ZEB110450PWR RIBBON TECTRONIC 110*450 CRPO | Pendiente | 24.0 | 24X31X25 | 12.1 | 0.49375 | CALCULADO_CON_TARA_SUPUESTA |   |
| 109 | 110450ZCEPO | RIBBON ZEB 110*450 CEPO | Pendiente | 12.0 | Pendiente | Pendiente | 0.5 | MEDIDO_DECLARADO |   |
| 110 | 110450ZCESO | RIBBON ZEB 110*450 CESO | Pendiente | 12.0 | Pendiente | Pendiente | 0.5 | MEDIDO_DECLARADO |   |
| 111 | 110450ZCTT808 | RIBBON ZEB 110*450 TT-808-110-450 | Pendiente | 24.0 | 24X31X25 | 11.75 | 0.479167 | CALCULADO_CON_TARA_SUPUESTA |   |
| 112 | 110450ZRETO | RIBBON ZEB 110*450 RETO | Pendiente | 12.0 | 27X32X13 | 5.5 | 0.4375 | CALCULADO_CON_TARA_SUPUESTA |   |
| 113 | 110600RCEUOM | RIBBON MON 110*600 CEUOM | Pendiente | 12.0 | 24X30X24 | 8.0 | 0.645833 | CALCULADO_CON_TARA_SUPUESTA |   |
| 114 | 152450TRESO | ZEB152450VR RIBBON TECTRONIC 152*450 RESO | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente | FALTANTE | FALTA_PESO  |
| 115 | 154300TCEPO | ZEB154300PVW RIBBON TECTRONIC 154*300 CEPO | Pendiente | 12.0 | 24X30X17 | 5.9 | 0.470833 | CALCULADO_CON_TARA_SUPUESTA |   |
| 116 | 154300ZCEPO | RIBBON ZEB 154*300 CEPO | Pendiente | 6.0 | 21X24X15 | 3.15 | 0.483333 | CALCULADO_CON_TARA_SUPUESTA |   |
| 117 | 170560TCEUI-CC | MSD170560PWN RIBBON TECTRONIC 170*560 CEUI | Pendiente | 12.0 | 25X32X28 | 11.65 | 0.95 | CALCULADO_CON_TARA_SUPUESTA |   |
| 118 | 800033-840 | ZEBRA XI SERIES RIBBON, 200 IMG. YMCKO PARA ZXP SERIE 3 | Pendiente | 1.0 | 15X22X13 | 0.25 | 0.15 | CALCULADO_CON_TARA_SUPUESTA |   |
| 119 | 800300-250LA | ZEBRA ZC300 RIBBON COLOR YMCKO 200 IMAGENES | Pendiente | 1.0 | 15X22X13 | 0.3 | 0.2 | CALCULADO_CON_TARA_SUPUESTA |   |
| 120 | 800300-264LA | ZEBRA ZC300 RIBBON COLOR-YMCKLL 200 IMAGENES | Pendiente | 1.0 | 15X22X13 | 0.3 | 0.2 | CALCULADO_CON_TARA_SUPUESTA |   |
| 121 | 800300-301 | ZEBRA ZC300 RIBBON MONOCROMATICO NEGRO 2000 IMAGENES | Pendiente | 1.0 | 15X22X13 | 0.3 | 0.2 | CALCULADO_CON_TARA_SUPUESTA |   |
| 122 | 800300-301LA | ZEBRA ZC300 RIBBON MONOCROMATICO NEGRO 200 IMAGENES | Pendiente | 1.0 | 15X22X13 | 0.3 | 0.2 | CALCULADO_CON_TARA_SUPUESTA |   |
| 123 | 800300-306 | ZEBRA ZC100/300 RIBBON MONO METALLIC GOLD 1500 IMG | Pendiente | 1.0 | 15X22X13 | 0.3 | 0.2 | CALCULADO_CON_TARA_SUPUESTA |   |
| 124 | 800300-307 | ZEBRA ZC100/300 RIBBON MONO METALLIC PLATA 1500 IMG | Pendiente | 1.0 | 15X22X13 | 0.3 | 0.2 | CALCULADO_CON_TARA_SUPUESTA |   |
| 125 | 800300-309LA | ZEBRA ZC100/300 RIBBON MONOCROMATICO BLANCO 1500 IMAGENES | Pendiente | 1.0 | 15X22X13 | 0.3 | 0.2 | CALCULADO_CON_TARA_SUPUESTA |   |
| 126 | 800300-350LA | ZEBRA ZC300 RIBBON COLOR YMCKO 200 IMAGENES | Pendiente | 1.0 | 15X22X13 | 0.3 | 0.2 | CALCULADO_CON_TARA_SUPUESTA |   |
| 127 | 800300-350LAF | ZEBRA ZC300 RIBBON COLOR YMCKO 200 IMAGENES F | Pendiente | 1.0 | 15X22X13 | 0.3 | 0.2 | CALCULADO_CON_TARA_SUPUESTA |   |
| 128 | 800300-360LA | ZEBRA ZC300 RIBBON COLOR YMCKOK 200 IMAGENES | Pendiente | 1.0 | 15X22X13 | 0.3 | 0.2 | CALCULADO_CON_TARA_SUPUESTA |   |
| 129 | 800300-550LA | ZEBRA ZC300 RIBBON COLOR YMCKO 300 IMAGENES | Pendiente | 1.0 | 15X22X13 | 0.3 | 0.2 | CALCULADO_CON_TARA_SUPUESTA |   |
| 130 | 800300-562LA | ZEBRA ZC300 RIBBON COLOR YMCPKO 200 IMAGENES | Pendiente | 1.0 | 15X22X13 | 0.3 | 0.2 | CALCULADO_CON_TARA_SUPUESTA |   |
| 131 | 800300-563LA | ZEBRA ZC300 RIBBON COLOR YMCKLL 200 IMAGENES | Pendiente | 1.0 | 15X22X13 | 0.3 | 0.2 | CALCULADO_CON_TARA_SUPUESTA |   |
| 132 | MX053300TRXSOB | RIBBON TECTRONIC 53*300 RXSO BLANCO | Pendiente | Pendiente | Pendiente | Pendiente | 0.2 | MEDIDO_DECLARADO |   |
| 133 | MX075200TRESOAM | RIBBON TECTRONIC 75*200 AMARILLO METALICO | Pendiente | Pendiente | Pendiente | Pendiente | 0.175 | MEDIDO_DECLARADO |   |
| 134 | MX075200TRESOAZ | RIBBON TECTRONIC 75*200 AZUL METALICO | Pendiente | Pendiente | Pendiente | Pendiente | 0.175 | MEDIDO_DECLARADO |   |
| 135 | MX075200TRESOD | RIBBON TECTRONIC 75*200 DORADO | Pendiente | Pendiente | Pendiente | Pendiente | 0.175 | MEDIDO_DECLARADO |   |
| 136 | MX075200TRESODL | RIBBON TECTRONIC 75*200 DORADO PARA LISTON | Pendiente | Pendiente | Pendiente | Pendiente | 0.175 | MEDIDO_DECLARADO |   |
| 137 | MX075200TRESOP | RIBBON TECTRONIC 75*200 PLATA | Pendiente | Pendiente | Pendiente | Pendiente | 0.175 | MEDIDO_DECLARADO |   |
| 138 | MX075200TRESOR | RIBBON TECTRONIC 75*200 ROJO METALICO | Pendiente | Pendiente | Pendiente | Pendiente | 0.175 | MEDIDO_DECLARADO |   |
| 139 | MX075200TRESORS | RIBBON TECTRONIC 75*200 ROSA METALICO | Pendiente | Pendiente | Pendiente | Pendiente | 0.175 | MEDIDO_DECLARADO |   |
| 140 | MX075200TRESOVE | RIBBON TECTRONIC 75*200 VERDE METALICO | Pendiente | Pendiente | Pendiente | Pendiente | 0.175 | MEDIDO_DECLARADO |   |

## Otros — columna por columna

| Columna | Nombre | Con valor guardado | Uso e interpretación |
| --- | --- | --- | --- |
| A | Producto | 38 | Clave de cruce exacta con default_code de Odoo. Preservar ceros iniciales y variantes. |
| B | Descripcion | 38 | Referencia comercial. Contiene capacidad o presentación en algunos casos; proviene de fórmulas con datos externos guardados en el XLSX. |
| C | Centro | 0 | Núcleo del rollo, no diámetro exterior. Valores mezclan números y texto; confirmar unidad. |
| D | Rollos por Tubo | 0 | Jerarquía de empaque. No son dimensiones del rollo; confirmar significado físico de tubo. |
| E | Cantidad de Tubos | 0 | Cantidad de agrupaciones por caja. |
| F | Total Rollos x Caja | 0 | Contenido de la caja; normalmente calculado. No confundir con cantidad vendida en Odoo. |
| G | Total Millares x Caja | 0 | Total comercial por caja; dividido entre rollos permite revisar capacidad. Es fórmula basada en descripción, no medición independiente. |
| H | Caja de Empaque | 0 | Medidas del empaque; sin valores en Otros. |
| I | Peso Real x Caja | 0 | Peso bruto declarado de la presentación. Confirmar kg. Incluye empaque. |
| J | Sin Registro x Caja | 38 | Indicador auxiliar; no prueba que falten datos ni que estén completos. Validar los campos reales. |
| K | Calculo Peso x Rollo | 0 | Peso estimado: (bruto - 0.4 kg)/rollos. Tara supuesta; no es peso medido. |
| L | Calculo Peso Volumetrico Caja | 0 | Volumen exterior /5000. Nunca usar como peso físico individual. |
| M | Peso Real x Rollo | 0 | Peso individual declarado directamente. Preferente tras verificar fecha, fuente, precisión y presentación. |
| N | Observaciones | 0 | Conservar proveedor, variante, reempacado y CONFIRMAR; afectan selección del perfil. |

### Registros producto por producto

Capacidad en millares/rollo es candidata, no confirma UDM Odoo. Peso calculado no equivale a peso medido. Medidas listadas son de caja; las individuales permanecen pendientes, salvo posible perfil de equipo embalado. Cada fila original se conserva por separado.

| Fila | SKU | Descripción | Millares/rollo candidato | Contenido/caja | Caja ancho×largo×alto cm | Bruto caja kg | Peso unitario candidato kg | Origen peso | Alertas / observaciones |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2 | CORREA | CORREA DE SEGURIDAD PARA MUÑECA | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente | FALTANTE | FALTA_PESO  |
| 3 | C13T52L420 | EPSON P/CW-C4000 CARTUCHO DE TINTA AMARILLO | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente | FALTANTE | FALTA_PESO  |
| 4 | C13T52L320 | EPSON P/CW-C4000 CARTUCHO DE TINTA MAGENTA | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente | FALTANTE | FALTA_PESO  |
| 5 | C13T52L120 | EPSON P/CW-C4000 CARTUCHO DE TINTA NEGRO BTE | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente | FALTANTE | FALTA_PESO  |
| 6 | C33S021601 | EPSON P/CW-C4000 TANQUE DE MANTENIMIENTO | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente | FALTANTE | FALTA_PESO  |
| 7 | C13T44B220 | EPSON P/TM-C6500 CARTUCHO DE TINTA CYAN | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente | FALTANTE | FALTA_PESO  |
| 8 | COJENTET2L | JOLLY P/ET2L-20 COJIN ENTINTADOR | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente | FALTANTE | FALTA_PESO  |
| 9 | MX025200PSB | LISTON SATIN BLANCO 25*200mts C/1.5 CONTINUO | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente | FALTANTE | FALTA_PESO  |
| 10 | MX030200PSB | LISTON SATIN BLANCO 30*200mts C/1.5 CONTINUO | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente | FALTANTE | FALTA_PESO  |
| 11 | MX035200PSB | LISTON SATIN BLANCO 35*200mts C/1.5 CONTINUO | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente | FALTANTE | FALTA_PESO  |
| 12 | MX040200PSB | LISTON SATIN BLANCO 40*200mts C/1.5 CONTINUO | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente | FALTANTE | FALTA_PESO  |
| 13 | MX050200PSB | LISTON SATIN BLANCO 50*200mts C/1.5 CONTINUO | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente | FALTANTE | FALTA_PESO  |
| 14 | MX025200PSN | LISTON SATIN NEGRO 25*200mts C/1.5 CONTINUO | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente | FALTANTE | FALTA_PESO  |
| 15 | MX030200PSN | LISTON SATIN NEGRO 30*200mts C/1.5 CONTINUO | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente | FALTANTE | FALTA_PESO  |
| 16 | MX035200PSN | LISTON SATIN NEGRO 35*200mts C/1.5 CONTINUO | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente | FALTANTE | FALTA_PESO  |
| 17 | MX040200PSN | LISTON SATIN NEGRO 40*200mts C/1.5 CONTINUO | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente | FALTANTE | FALTA_PESO  |
| 18 | MX050200PSN | LISTON SATIN NEGRO 50*200mts C/1.5 CONTINUO | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente | FALTANTE | FALTA_PESO  |
| 19 | MX080200PSN | LISTON SATIN NEGRO 80*200mts C/1.5 CONTINUO | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente | FALTANTE | FALTA_PESO  |
| 20 | CR23-05-0106 | RESORTE CR23-05-0106 INOX 49*121 | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente | FALTANTE | FALTA_PESO  |
| 21 | COJENTRT | RIBETEC P/ETIQUETADORA RT5500EOS COJIN ENTINTADOR | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente | FALTANTE | FALTA_PESO  |
| 22 | COJENTRT6 | RIBETEC P/ETIQUETADORA RT6600EOS COJIN ENTINTADOR | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente | FALTANTE | FALTA_PESO  |
| 23 | FUNDART-320-B | RIBETEC P/RT-320PB FUNDA CON CORREA DE HOMBRO (B) | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente | FALTANTE | FALTA_PESO  |
| 24 | 3D-ADAPTADOR-RIBBON-1/2 | TECTRONIC ADAPTADOR P/RT-425TT RIBBON 1/2" JUEGO 2 PZAS | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente | FALTANTE | FALTA_PESO  |
| 25 | 3D-GUIA-LISTON-25MM | TECTRONIC GUIA UNIVERSAL P/LISTON 25mm | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente | FALTANTE | FALTA_PESO  |
| 26 | 3D-GUIA-LISTON-30MM | TECTRONIC GUIA UNIVERSAL P/LISTON 30mm | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente | FALTANTE | FALTA_PESO  |
| 27 | 3D-GUIA-LISTON-35MM | TECTRONIC GUIA UNIVERSAL P/LISTON 35mm | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente | FALTANTE | FALTA_PESO  |
| 28 | 3D-GUIA-LISTON-40MM | TECTRONIC GUIA UNIVERSAL P/LISTON 40mm | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente | FALTANTE | FALTA_PESO  |
| 29 | 3D-SOPORTE-RIBBON | TECTRONIC SOPORTE UNIVERSAL P/RIBBON 1" | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente | FALTANTE | FALTA_PESO  |
| 30 | COJENT20GT | TRAK P/ETIQUETADORA 20GT JGO COJIN ENTINTADOR NGO/RJO | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente | FALTANTE | FALTA_PESO  |
| 31 | COJENTGL | TRAK P/ETIQUETADORA GL COJIN ENTINTADOR | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente | FALTANTE | FALTA_PESO  |
| 32 | COJENTGS | TRAK P/ETIQUETADORA GS COJIN ENTINTADOR | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente | FALTANTE | FALTA_PESO  |
| 33 | 98-0410010-00LF | TSC P/2610MTTSC P/2610MT/TTP-368MT PLATEN ROLLER 6" | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente | FALTANTE | FALTA_PESO  |
| 34 | PH-MH241-0001 | TSC P/MH241T CABEZA DE IMPRESION 203 DPI | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente | FALTANTE | FALTA_PESO  |
| 35 | PH-MH241-0004 | TSC P/MH241T CABEZA DE IMPRESION 203 DPI | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente | FALTANTE | FALTA_PESO  |
| 36 | 30-0650045-01LF | TSC P/TE LABEL ROLL | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente | FALTANTE | FALTA_PESO  |
| 37 | SP-TE200-0033 | TSC P/TE200 GUIA DE PAPEL DERECHA | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente | FALTANTE | FALTA_PESO  |
| 38 | SP-TE200-0031 | TSC P/TE200 GUIA DE PAPEL IZQUIERDA | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente | FALTANTE | FALTA_PESO  |
| 39 | 98-0650019-02LF | TSC P/TTP-TE210 & TTP-TE310 KIT FULL/PARTIAL CUTTER | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente | FALTANTE | FALTA_PESO  |