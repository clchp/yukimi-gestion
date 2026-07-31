# Anexo 02 — Bitácora de mejoras UX pendientes de Yukimi Gestión v1.1

Fecha de registro: 30 de julio de 2026.
Estado: pendiente de implementación.
Documento relacionado: `docs/BITACORA_MEJORAS_UX_V1_1.md`.

Este anexo conserva las observaciones detectadas durante la prueba manual del panel, ventas, inventario e importaciones. Debe revisarse junto con la bitácora principal antes de realizar el cierre visual y funcional.

## UX-019 — Periodo configurable en el gráfico de rendimiento

### Problema observado

El panel muestra “Rendimiento semanal” con los últimos siete días, pero la usuaria no puede cambiar el periodo.

### Requerimiento

- Mantener como valor inicial los últimos siete días.
- Permitir cambiar entre `Hoy`, `7 días`, `Mes` y un rango personalizado cuando aporte valor operativo.
- El título, total y etiquetas del eje deben actualizarse según el periodo elegido.
- Conservar una navegación rápida al reporte completo.
- No presentar datos fuera del rango seleccionado.

### Criterios de aceptación

- El filtro modifica barras, total y fechas en una sola operación.
- El estado de carga es visible.
- Un periodo sin datos muestra un estado vacío claro, no barras falsas.

## UX-020 — Leyenda, valores y accesibilidad del gráfico

### Requerimiento

- Mostrar una leyenda permanente que explique los colores de `Ventas` y `Cobros`.
- Al colocar el cursor o enfocar una barra con teclado, mostrar fecha, serie e importe exacto.
- El tooltip debe permanecer dentro de la pantalla y funcionar también mediante foco de teclado.
- En móvil debe existir una alternativa táctil.
- No depender exclusivamente del color para diferenciar series.

Ejemplo esperado:

`29 jul. 2026 · Ventas: S/ 418.00`

## UX-021 — Actividad reciente comprensible y completamente en español

### Problema observado

La actividad muestra códigos como `UPDATE`, `INSERT`, `OTHER`, nombres técnicos de módulos y UUID que una usuaria no técnica no puede interpretar con facilidad.

### Requerimiento

- Traducir todos los estados, acciones, módulos y entidades visibles al español.
- Sustituir `UPDATE` por `Actualización`, `INSERT` por `Creación`, `OTHER` por un nombre específico y entendible.
- Mostrar qué se cambió, sobre qué registro y, cuando exista, el motivo.
- Reducir la prominencia de identificadores técnicos; dejarlos disponibles solo en detalle o para soporte.
- Permitir abrir un detalle de auditoría comprensible desde cada actividad.

Ejemplo recomendado:

`Claudia actualizó el inventario de Figura Gojo Satoru en Almacén Camila.`

## UX-022 — Elementos interactivos claramente reconocibles

### Requerimiento transversal

- Botones, enlaces, filas y tarjetas pulsables deben diferenciarse visualmente del texto informativo.
- Usar un color un poco más sólido, borde, icono, subrayado, sombra ligera o cambio de fondo según el componente.
- Añadir estados `hover`, `focus`, `active` y `disabled` consistentes.
- No usar únicamente un texto tenue para una acción importante.
- Mantener contraste y accesibilidad.

### Notas y ayudas

- Las explicaciones importantes deben mostrarse en una tarjeta con contorno o mediante un icono de información claramente pulsable.
- Un icono `i` debe tener etiqueta accesible y abrir una ayuda breve sin tapar datos importantes.
- La información crítica no debe quedar escondida únicamente en un tooltip.

## UX-023 — Borradores reales, editables y con validación apropiada

### Problema observado

El botón `Guardar borrador` aparece durante la creación de una venta, pero al faltar información devuelve `Los datos enviados no son válidos`. Eso contradice la finalidad de un borrador.

### Decisión alineada con los requisitos

La versión v1.1 incluye borradores persistentes; por tanto, no debe retirarse la función. Debe convertirse en un borrador real que permita guardar información parcial y continuarla después.

### Requerimiento

- Separar el esquema de validación de borrador del esquema de confirmación de venta.
- Para un borrador, exigir únicamente datos estructuralmente válidos y permitir campos comerciales pendientes.
- Para confirmar y reservar, exigir todos los campos obligatorios de la venta.
- Mostrar claramente `Borrador guardado` y la fecha de última modificación.
- Permitir abrir, editar, guardar de nuevo, descartar y convertir el borrador en venta.
- Conservar lo escrito ante errores y marcar los campos inválidos.
- Si técnicamente no se ofrece guardado parcial, ocultar el botón hasta que la función sea coherente; no dejar una acción engañosa.

## UX-024 — Significado correcto de los movimientos de inventario

### Reglas de negocio que deben comunicarse

- `Transferencia entre almacenes`: resta unidades del almacén de origen y agrega exactamente la misma cantidad al almacén de destino.
- `Producto dañado`: mueve unidades desde disponible hacia dañado dentro del almacén seleccionado.
- `Pérdida`: mueve o descuenta unidades hacia el estado perdido dentro del almacén seleccionado.
- `Regalo`: representa una salida gratuita de mercadería desde un almacén. No significa que un almacén le regale unidades a otro almacén.
- `Ajuste manual de stock`: corrige una diferencia comprobada y exige motivo y auditoría.

### Mejora propuesta

- Cambiar `Ajuste dinámico` por `Ajuste manual de stock`.
- Mantener un solo botón general `Registrar movimiento`.
- Para ajustes que afecten varios almacenes, permitir seleccionar cada almacén y escribir una cantidad independiente por línea.
- No usar una sola cantidad global para dos almacenes sin explicar cómo se distribuye.
- Validar que ninguna línea deje cantidades negativas.
- Mostrar una vista previa del efecto antes de confirmar.

Ejemplo:

- Almacén Camila: `+5`.
- Almacén Lorena: `+15`.
- Total del ajuste: `+20`.

La operación debe ejecutarse atómicamente y conservar el detalle de cada línea.

## UX-025 — Tipo de cambio coherente con la moneda de compra

### Problema observado

La importación permite seleccionar PEN y, al mismo tiempo, escribir un tipo de cambio inválido o distinto de uno. En una captura se observó `PEN · TC 0.000001`.

### Requerimiento

- Cuando la moneda de compra sea `PEN`, el tipo de cambio a soles debe ser exactamente `1`.
- El campo debe quedar oculto o bloqueado con el texto `1.000000`.
- Cuando se seleccione una moneda extranjera, el tipo de cambio debe habilitarse y ser mayor que cero.
- Las líneas de producto deben heredar el tipo de cambio general, salvo que exista una regla de negocio explícita para una excepción.
- No permitir crear una importación en PEN con costo convertido a cero por un tipo de cambio incorrecto.
- Mostrar mensajes específicos junto al campo.

## UX-026 — Entradas numéricas y resumen de importación legibles

### Problemas observados

- Se pueden visualizar valores como `020`.
- El resumen junta etiquetas y cifras: `Cajas1`, `Productos1`, `Unidades esperadas20`.
- Una importación puede mostrar compra estimada `S/ 0.00` aunque tenga veinte unidades, debido a costo y tipo de cambio inválidos.

### Requerimiento

- Normalizar cantidades enteras y eliminar ceros iniciales al perder el foco.
- Separar visualmente etiquetas y valores.
- Advertir cuando una línea tenga costo unitario cero antes de crear la importación.
- Mostrar una vista previa de cantidad × costo × tipo de cambio.
- No bloquear un costo cero cuando sea una decisión válida, pero exigir confirmación y motivo para evitar errores accidentales.

## UX-027 — Un único ingreso real de caja a stock

### Problema observado

La interfaz mostró dos acciones similares: `Ingresar a stock` e `Ingresar caja a stock`. La primera permitió marcar la caja o importación como ingresada sin confirmar cantidades recibidas. El resultado fue:

- Unidades esperadas: `20`.
- Unidades recibidas: `0`.
- Estado: `Ingresada a stock`.
- Flujo finalizado.

Ese estado es inconsistente y no debe ser posible.

### Requerimiento

- Eliminar la duplicidad y usar una sola acción: `Recibir e ingresar caja a stock`.
- Antes de finalizar, abrir un modal con cada producto de la caja.
- Mostrar por línea: producto, variante, SKU, almacén destino, esperado, recibido, preventa asignada y costo calculado.
- Precargar `Recibido` con la cantidad esperada, permitiendo reducirla cuando exista faltante.
- Exigir motivo o referencia de recepción.
- Registrar automáticamente una incidencia cuando lo recibido sea menor que lo esperado.
- Actualizar cantidades recibidas, lotes, inventario, caja e importación dentro de una sola transacción.
- Evitar doble ingreso mediante idempotencia.

### Resultado esperado para una recepción completa

- Esperado: `20`.
- Recibido: `20`.
- Caja: `Ingresada a stock`.
- Inventario del almacén destino: incremento de veinte unidades, menos cualquier cantidad que deba ir a una reserva o preventa conforme a las reglas vigentes.

## UX-028 — Impedir estados de importación inconsistentes

### Reglas

- Una caja no puede quedar `STOCKED` con todas sus cantidades recibidas en cero, salvo un flujo explícito de recepción nula por pérdida total o cancelación.
- La importación general no puede mostrar `Flujo finalizado` mientras existan cajas pendientes de recepción válida.
- La cantidad recibida no puede superar la esperada sin una operación de ajuste documentada.
- La cantidad recibida no puede ser menor que la cantidad ya comprometida en preventas sin resolver la inconsistencia.
- El estado final debe derivarse de los datos reales y no solamente de pulsar un botón de transición.

## UX-029 — Corrección controlada de importaciones ya inconsistentes

### Requerimiento

Para registros que ya quedaron como `Ingresada a stock` con `Recibido 0`:

- Crear una acción administrativa `Corregir recepción` visible solo cuando se detecte la inconsistencia.
- Mostrar el estado actual y explicar por qué requiere corrección.
- Permitir registrar las cantidades físicamente recibidas con motivo obligatorio.
- Crear movimientos compensatorios y auditoría; no editar silenciosamente el historial.
- Evitar insertar stock manualmente por fuera del flujo de recepción.

## UX-030 — Pruebas obligatorias del flujo de importación

Antes de cerrar la mejora se debe comprobar:

1. Importación en PEN fija el tipo de cambio en 1.
2. Moneda extranjera exige un tipo de cambio válido.
3. Cantidad, costo y total estimado se calculan correctamente.
4. Recepción completa: esperado 20, recibido 20 e inventario +20 según asignaciones.
5. Recepción parcial registra faltante e incidencia.
6. Recepción con producto dañado separa la cantidad correspondiente.
7. No existe más de un botón para ingresar la misma caja.
8. Doble clic o reintento no duplica lotes ni stock.
9. No se puede finalizar con recibido 0 por una transición equivocada.
10. La importación general finaliza solamente cuando todas sus cajas tienen un resultado válido.
11. La corrección de un registro inconsistente genera auditoría y movimientos compensatorios.
12. Todos los textos, estados y errores visibles aparecen en español y explican la acción.

## Prioridad

- UX-027 y UX-028: crítica, porque pueden dejar inventario y trazabilidad inconsistentes.
- UX-023, UX-024 y UX-025: alta.
- UX-019 a UX-022, UX-026, UX-029 y UX-030: alta antes del cierre de aceptación visual y funcional.

## Nota de alcance

Este anexo registra decisiones y mejoras pendientes. No afirma que estén implementadas todavía. Debe incorporarse al mismo lote de revisión que la bitácora UX principal y validarse contra los requisitos funcionales antes de modificar base de datos, backend o interfaz.
