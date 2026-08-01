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

## Siguiente prueba recomendada

- Pulsar `Recibir e ingresar caja a stock` en `CJA-0000004`.
- No confirmar todavía.
- Capturar la ventana o pantalla completa para revisar campos y validaciones.
- Probar una recepción parcial controlada:
  - Figura de acción Bulma — Almacén Camila: esperadas 14, recibidas 13.
  - Figura de acción Bulma — Almacén Lorena: esperadas 23, recibidas 23.
- Resultado esperado al confirmar después:
  - Total recibido de la caja: 36.
  - Faltante real: 1 unidad en Almacén Camila.
  - Ingreso de 13 unidades a Camila y 23 a Lorena.
  - Creación de incidencia o solicitud de explicación por la unidad faltante.
  - Inventario general incrementado una sola vez en 36 unidades.

## Estado

**La recepción parcial en Perú fue registrada sin modificar inventario, lo cual es correcto. Persisten el fallo del estado general y la etiqueta prematura de faltantes. Pendiente revisar la pantalla de recepción física antes de ingresar la caja a stock. `main` no debe modificarse.**
