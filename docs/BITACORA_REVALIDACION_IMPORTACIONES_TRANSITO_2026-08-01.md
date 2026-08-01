# Continuación de bitácora — Tránsito parcial de importaciones

> Fecha: 1 de agosto de 2026  
> Rama: `version-1-1`  
> Complementa las bitácoras previas de Importaciones.

## Prueba ejecutada

Se avanzó únicamente la caja `CJA-0000004` desde `Enviada` hasta `En tránsito`.

## Resultado observado

- `CJA-0000004`: `En tránsito`.
- `CJA-0000005`: `Enviada`.
- La importación general `IMP-000003` continúa mostrando `Despacho confirmado`.
- La acción general continúa mostrando `Avanzar a Embarcado`.
- Las unidades recibidas continúan en `0`.
- El inventario no se incrementó, lo cual es correcto.
- El historial registró el cambio específico `CJA-0000004: Enviada → En tránsito`, con fecha, hora, administradora y motivo.

## Hallazgo 17 — El estado general no refleja el tránsito parcial

- El avance independiente por caja funciona correctamente.
- El estado general permanece atrasado y no refleja que una caja ya está en tránsito mientras la otra continúa embarcada.
- Debe mostrarse un estado consolidado claro, por ejemplo:
  - `Tránsito parcial — 1 de 2 cajas`.
  - `En proceso de tránsito`.
- La acción general debe adaptarse al estado real de las cajas; no debe continuar mostrando `Avanzar a Embarcado` cuando todas las cajas ya están embarcadas y una incluso ya está en tránsito.
- Una acción masiva, si se conserva, debe indicar exactamente qué cajas afectará, por ejemplo `Pasar 1 caja pendiente a En tránsito`.

## Hallazgo 18 — Línea de tiempo general desacoplada

- La línea de tiempo general sigue marcando `Despacho confirmado` como etapa actual aunque las cajas ya superaron esa etapa.
- Debe calcularse automáticamente a partir de los estados de las cajas o mostrar un estado parcial especial.
- No debe requerir un cambio manual adicional en la importación general para repetir lo que ya se registró por caja.

## Hallazgo 19 — Historial aprobado con observación de presentación

- El historial conserva correctamente los cambios por importación y por caja.
- Debe mantenerse esa trazabilidad independiente.
- Para facilitar la lectura, conviene permitir filtros o agrupación por:
  - Importación general.
  - Caja `CJA-0000004`.
  - Caja `CJA-0000005`.
- Los motivos escritos durante pruebas deben mostrarse como fueron registrados, pero la interfaz debe conservar una separación visual clara entre transición, motivo, responsable y fecha.

## Hallazgo persistente — etiqueta `Faltantes`

- Las cajas siguen mostrando `Faltantes: 37` y `Faltantes: 25` antes de la recepción física.
- Hasta la recepción debe mostrarse `Pendientes de recibir`.

## Segunda prueba ejecutada — ambas cajas en tránsito

Se avanzó `CJA-0000005` desde `Enviada` hasta `En tránsito`.

### Resultado observado

- `CJA-0000004`: `En tránsito`.
- `CJA-0000005`: `En tránsito`.
- Ambas cajas ofrecen como siguiente acción `Avanzar a Recibida en Perú`.
- La importación general `IMP-000003` continúa mostrando `Despacho confirmado`.
- La línea de tiempo general continúa detenida en `Despacho confirmado`.
- La acción general continúa mostrando `Avanzar a Embarcado`.
- Las unidades recibidas permanecen en `0`.
- No se generó ingreso de inventario, lo cual es correcto.
- El historial registró por separado:
  - `CJA-0000004: Enviada → En tránsito`.
  - `CJA-0000005: Enviada → En tránsito`.

## Hallazgo 20 — El estado general nunca se consolida después del despacho

- La prueba confirma que el estado general no se recalcula ni siquiera cuando todas las cajas alcanzan la misma etapa posterior.
- Cuando ambas cajas están en tránsito, la importación debe mostrar automáticamente `En tránsito`.
- La acción general correcta debería ser `Marcar todas las cajas en tránsito como recibidas en Perú` únicamente si se mantiene una acción masiva; de lo contrario, debe desaparecer y dejar el avance por caja.
- El botón `Avanzar a Embarcado` es incorrecto y debe desaparecer porque ninguna caja permanece en despacho confirmado.
- La línea de tiempo general debe marcar `Enviada` como completada y `En tránsito` como etapa actual.

## Regla de consolidación recomendada

- El estado general debe calcularse desde los estados reales de las cajas.
- Cuando todas las cajas comparten un estado, la importación muestra ese mismo estado.
- Cuando existen estados diferentes, debe mostrar un resumen parcial, por ejemplo:
  - `Embarque parcial — 1 de 2 cajas`.
  - `Tránsito parcial — 1 de 2 cajas`.
  - `Recepción parcial — 1 de 2 cajas`.
- La acción superior debe ser una acción masiva explícita o no mostrarse.
- Nunca debe permitir repetir una etapa ya completada por todas las cajas.

## Siguiente prueba recomendada — recepción parcial en Perú

- Avanzar únicamente `CJA-0000004` a `Recibida en Perú`.
- No avanzar todavía `CJA-0000005`.
- Abrir la ventana y revisar qué campos solicita antes de confirmar.
- Debe permitir registrar la llegada física a Perú, pero todavía no necesariamente aumentar stock hasta confirmar las cantidades recibidas.
- Después del cambio debe esperarse:
  - `CJA-0000004`: `Recibida en Perú`.
  - `CJA-0000005`: `En tránsito`.
  - Estado general: `Recepción parcial — 1 de 2 cajas`.
  - Inventario: sin incremento hasta confirmar la recepción física y cantidades por producto.

## Estado

**Las dos cajas se encuentran en `En tránsito`, pero la importación general continúa incorrectamente en `Despacho confirmado`. Queda confirmado el defecto de consolidación del estado general. Pendiente probar la recepción parcial de una caja. `main` no debe modificarse.**
