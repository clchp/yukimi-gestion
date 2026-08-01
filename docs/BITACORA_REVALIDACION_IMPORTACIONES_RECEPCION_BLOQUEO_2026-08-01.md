# Continuación de bitácora — Bloqueo al confirmar recepción parcial

> Fecha: 1 de agosto de 2026  
> Rama: `version-1-1`  
> Complementa `docs/BITACORA_REVALIDACION_IMPORTACIONES_RECEPCION_2026-08-01.md`.

## Prueba ejecutada

En la caja `CJA-0000004`, ya marcada como `Recibida en Perú`, se intentó revisar y confirmar una recepción física parcial con estos datos:

- Figura de acción Bulma — Almacén Camila:
  - Esperado: 14.
  - Recibido: 13.
  - Nota: `Falta 1 unidad al abrir la caja.`
- Figura de acción Bulma — Almacén Lorena:
  - Esperado: 23.
  - Recibido: 23.
- Motivo: `Prueba manual de recepción parcial de CJA-0000004.`
- Resumen calculado:
  - Esperadas: 37.
  - Se recibirán: 36.
  - Diferencia: 1.

## Resultado observado

1. La pantalla mostró el banner rojo general:
   - `No se pudo continuar. Corrige los campos marcados en rojo.`
2. No se observó ningún campo efectivamente marcado en rojo después de completar la nota de la línea faltante y el motivo de recepción.
3. Al intentar continuar nuevamente, apareció una notificación superior derecha:
   - `No se pudo completar la operación`.
   - `La importación general debe estar marcada como recibida en Perú antes de ingresar una caja a stock.`
4. La caja específica sí estaba en estado `Recibida en Perú`.
5. La importación general seguía incorrectamente en `Despacho confirmado` debido al defecto de consolidación de estados ya identificado.
6. No se ingresaron unidades al inventario, lo cual evita una modificación parcial o duplicada.

## Hallazgo 24 — Banner de validación no se limpia

- El banner rojo de validación permanece visible después de corregir los datos que originaron el error.
- Debe desaparecer automáticamente cuando ya no existan errores de formulario o cuando se realice un nuevo intento válido.
- Si todavía existe un error, debe marcarse el campo concreto y mostrarse el mensaje junto a ese campo.
- No debe mantenerse el mensaje genérico `Corrige los campos marcados en rojo` cuando ningún control aparece marcado.
- Al cambiar cualquier campo relacionado, la validación general debe recalcularse y retirar errores ya resueltos.

## Hallazgo 25 — Bloqueo incorrecto por estado general atrasado

- La recepción de una caja se bloquea porque la API exige que la importación general esté en `Recibida en Perú`.
- Esa condición es incompatible con la recepción independiente por caja cuando una importación contiene varias cajas que pueden llegar en fechas distintas.
- En esta prueba:
  - `CJA-0000004` ya estaba `Recibida en Perú`.
  - `CJA-0000005` continuaba `En tránsito`.
  - Por lo tanto, la importación debía considerarse `Recepción parcial`, no mantenerse en `Despacho confirmado` ni exigir que todas las cajas estuvieran recibidas antes de procesar la primera.
- La validación para ingresar una caja a stock debe comprobar el estado de la caja seleccionada, no exigir que toda la importación general esté recibida.
- El estado general debe calcularse desde las cajas y no utilizarse como bloqueo independiente que impida recepciones parciales válidas.

## Regla funcional requerida

Para permitir una recepción física por caja:

1. La caja debe estar en `Recibida en Perú`.
2. Deben validarse las cantidades recibidas por línea.
3. Si existe diferencia, debe exigirse nota o incidencia para las líneas afectadas.
4. Solo las cantidades recibidas deben ingresar a sus almacenes de destino.
5. La otra caja puede continuar en tránsito sin bloquear la recepción de la primera.
6. La importación general debe mostrar `Recepción parcial — 1 de 2 cajas`.
7. Cuando todas las cajas estén recibidas o ingresadas, el estado general debe avanzar automáticamente.
8. Un segundo intento sobre una recepción ya confirmada no debe duplicar movimientos de inventario.

## Mensajería esperada

- Para errores de formulario:
  - mensaje junto al campo específico;
  - banner general solo como resumen y debe desaparecer al resolverlos.
- Para un bloqueo de estado real:
  - explicar exactamente qué caja o etapa falta;
  - no mostrar un requisito contradictorio con el flujo por cajas.
- En este caso, el sistema no debía bloquear la operación porque `CJA-0000004` ya estaba recibida en Perú.

## Clasificación

- **Defecto funcional crítico:** una caja recibida no puede ingresarse a stock por depender del estado general desactualizado.
- **Defecto de validación:** el banner rojo persiste sin campos marcados.
- **Defecto de arquitectura del flujo:** el estado general se usa como requisito independiente en lugar de consolidarse desde las cajas.
- **Comportamiento seguro observado:** no se realizó ningún movimiento parcial de inventario después del error.

## Estado

**La prueba de recepción parcial quedó bloqueada por un defecto funcional. No debe continuarse con más ingresos de stock hasta corregir la consolidación de estados y la validación por caja. `main` no debe modificarse.**
