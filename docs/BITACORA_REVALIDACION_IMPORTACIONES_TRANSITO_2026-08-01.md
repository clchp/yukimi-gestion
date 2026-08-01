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

## Siguiente prueba recomendada

- Avanzar `CJA-0000005` a `En tránsito`.
- Verificar si la importación general cambia automáticamente a `En tránsito` cuando ambas cajas alcanzan ese estado.
- Si continúa en `Despacho confirmado`, quedará confirmado que el estado general no se consolida en ninguna etapa posterior al despacho.
- Después se probará una recepción parcial de una sola caja antes de modificar el inventario.

## Estado

**Prueba de tránsito parcial completada. El seguimiento por caja funciona, pero el estado y la acción general permanecen incorrectos. Pendiente continuar con la segunda caja y la recepción parcial. `main` no debe modificarse.**
