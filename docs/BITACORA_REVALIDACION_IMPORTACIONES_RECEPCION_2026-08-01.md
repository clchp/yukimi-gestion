# Bitácora de revalidación — Recepción parcial de importaciones

> Fecha: 1 de agosto de 2026  
> Rama: `version-1-1`  
> Complementa las bitácoras previas de Importaciones.

## Prueba ejecutada

Se avanzó únicamente la caja `CJA-0000004` desde `En tránsito` hasta `Recibida en Perú`.

## Resultado observado

- `CJA-0000004`: `Recibida en Perú`.
- `CJA-0000005`: `En tránsito`.
- La caja recibida sigue mostrando `Recibidas: 0` y `Faltantes: 37`.
- La caja recibida ofrece la acción `Recibir e ingresar caja a stock`.
- La segunda caja continúa ofreciendo `Avanzar a Recibida en Perú`.
- La importación general `IMP-000003` continúa mostrando `Despacho confirmado`.
- La línea de tiempo general continúa detenida en `Despacho confirmado`.
- La acción general continúa mostrando `Avanzar a Embarcado`.
- Las unidades recibidas generales permanecen en `0`.
- El historial registró correctamente `CJA-0000004: En tránsito → Recibida en Perú`, con fecha, hora, administradora y motivo.

## Aclaración funcional aprobada

- `Recibida en Perú` significa que la caja llegó físicamente al país o al punto local, pero todavía no se ha contado ni ingresado su contenido al inventario.
- `Recibir e ingresar caja a stock` debe abrir una segunda etapa de recepción física para confirmar cantidades por producto y almacén.
- Por ello es correcto que el inventario no aumente al marcar únicamente `Recibida en Perú`.

## Hallazgo 21 — Estado general no refleja recepción parcial

- La importación debería mostrar `Recepción parcial — 1 de 2 cajas` o una etiqueta equivalente.
- La línea de tiempo general debería mostrar `En tránsito` como completado y una recepción parcial como estado actual.
- La acción general `Avanzar a Embarcado` es incorrecta y debe desaparecer.

## Hallazgo 22 — Etiqueta `Faltantes` antes del conteo físico

- Aunque la caja ya llegó a Perú, todavía no se han confirmado las cantidades recibidas.
- No debe mostrar `Faltantes: 37` como un faltante real antes de abrir la recepción y contar los productos.
- Hasta confirmar el conteo debe mostrar `Pendientes de confirmar: 37` o `Pendientes de recibir: 37`.
- `Faltantes` debe calcularse únicamente después de comparar cantidades esperadas contra cantidades físicamente recibidas.

## Requisitos para la acción `Recibir e ingresar caja a stock`

La acción debe abrir una ventana o pantalla de confirmación y no ingresar todo automáticamente. Debe permitir por cada línea:

- Producto y variante.
- Almacén de destino.
- Cantidad esperada.
- Cantidad físicamente recibida.
- Cantidad dañada, cuando corresponda.
- Cantidad faltante calculada automáticamente.
- Observación o incidencia.
- Evidencia opcional o requerida cuando exista daño o faltante.

Además debe solicitar:

- Fecha real de recepción.
- Motivo o evidencia del ingreso.
- Confirmación final antes de crear lotes y movimientos de inventario.

## Reglas de inventario esperadas

- Solo las cantidades físicamente recibidas deben ingresar al almacén correspondiente.
- Las cantidades faltantes o dañadas no deben sumarse al stock disponible.
- Si una caja contiene líneas destinadas a distintos almacenes, cada cantidad debe ingresar a su destino correcto.
- Una recepción parcial debe conservar la caja abierta o con estado `Recibida parcialmente` hasta resolver las unidades pendientes.
- Repetir la confirmación no debe duplicar el stock.

## Revisión de la ventana `Recibir CJA-0000004`

### Elementos correctos observados

- La ventana identifica claramente la caja que se recibirá.
- Muestra por cada línea:
  - Producto y variante.
  - SKU.
  - Almacén de destino.
  - Cantidad esperada.
  - Cantidad recibida editable.
  - Nota por línea.
- Calcula un resumen inferior con:
  - Total esperado.
  - Total que se recibirá.
  - Diferencia.
- Incluye `Motivo de la recepción *` como campo obligatorio.
- El botón `Revisar y confirmar recepción` indica que todavía existirá una segunda confirmación antes de crear el movimiento de inventario.

### Hallazgo 23 — Campos faltantes o poco explícitos

- No existe un campo separado para `Cantidad dañada`.
- No existe un campo visible para adjuntar evidencia cuando haya faltantes o daños.
- La diferencia se muestra solo en el resumen general; conviene mostrar también la diferencia calculada en cada línea.
- El texto de ayuda dice que se cambiará la cantidad si faltan unidades, pero no explica qué ocurrirá con la unidad faltante ni si se generará una incidencia.
- Debe aparecer un icono `(i)` o texto contextual breve cuando exista diferencia: `Las unidades faltantes o dañadas no ingresarán a stock y requerirán una observación o incidencia.`
- La fecha real de recepción no aparece como campo editable; puede registrarse automáticamente con fecha y hora actuales, pero debe mostrarse en la revisión final y permitir corrección cuando la recepción se registre después.

## Prueba manual a ejecutar

Modificar únicamente la primera línea:

- Figura de acción Bulma — Almacén Camila:
  - Esperado: 14.
  - Recibido: 13.
  - Nota de la línea: `Falta 1 unidad al abrir la caja.`
- Figura de acción Bulma — Almacén Lorena:
  - Esperado: 23.
  - Recibido: 23.
  - Nota de la línea: dejar vacía.
- Motivo de la recepción:
  - `Prueba manual de recepción parcial de CJA-0000004.`

### Resultado esperado antes de confirmar definitivamente

- Esperadas: 37.
- Se recibirán: 36.
- Diferencia: 1.
- La interfaz debe advertir que existe un faltante y explicar que no ingresará a stock.
- Al pulsar `Revisar y confirmar recepción`, debe aparecer un resumen final que detalle:
  - 13 unidades para Almacén Camila.
  - 23 unidades para Almacén Lorena.
  - 1 unidad faltante.
  - Motivo y observación.
- No debe ingresar stock hasta la confirmación final.

## Estado

**La pantalla de recepción física permite capturar cantidades por línea y destino, pero requiere mejorar el tratamiento explícito de daños, evidencia, diferencia por línea y fecha real. Pendiente ejecutar la recepción parcial controlada y revisar la confirmación final. `main` no debe modificarse.**
