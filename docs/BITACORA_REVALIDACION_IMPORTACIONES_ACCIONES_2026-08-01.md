# Continuación de bitácora — Acciones auxiliares de Importaciones

> Fecha: 1 de agosto de 2026  
> Rama: `version-1-1`  
> Complementa `docs/BITACORA_REVALIDACION_IMPORTACIONES_2026-08-01.md`.

## Contexto

Durante la validación de `IMP-000003`, en estado `Despacho confirmado`, se revisaron las secciones inferiores de costos, incidencias, preventas, cajas e historial.

## Aclaración funcional de cada sección

### Registrar costo

- Registra un costo adicional de la importación, no un cobro al cliente.
- Ejemplos: flete internacional, seguro, comisión, aduanas, almacenaje u otros gastos.
- Puede aplicarse a toda la importación o a una caja específica.
- No reemplaza el costo de compra de los productos.

### Registrar incidencia

- Registra un problema real de la importación.
- Ejemplos: faltante, daño, pérdida, demora, retención o problema cubierto por seguro.
- Debe relacionarse con caja, producto, cantidad afectada, descripción, evidencia y seguimiento.
- No corresponde usarla antes de que exista un problema real.

### Vincular preventa

- Relaciona una venta en preventa con unidades esperadas de la importación.
- Sirve para separar esas unidades cuando lleguen.
- No debe permitir vincular más unidades que las disponibles para preventa.

### Costos registrados

- Es el historial de costos adicionales ya agregados.
- Debe mostrar tipo, importe, moneda, caja relacionada, fecha y responsable.

### Incidencias y seguros

- Es el historial de problemas y reclamos registrados.
- Debe mostrar estado, caja o producto afectado, cantidad, evidencia y seguimiento del seguro o reclamo.

### Historial

- Conserva cada cambio de estado, fecha, hora, administradora y motivo.
- Debe permanecer disponible para auditoría, pero no necesita ocupar siempre toda la pantalla.

## Hallazgo 12 — Acciones auxiliares demasiado extensas y alejadas

- Los formularios completos de `Registrar costo`, `Registrar incidencia` y `Vincular preventa` aparecen desplegados permanentemente al final de una página muy larga.
- Esto obliga a desplazarse demasiado y dificulta entender qué acción corresponde realizar.
- La usuaria puede confundir `Registrar costo` con un cobro o pago.

## Propuesta de experiencia de usuario

- Crear una sección compacta cerca de la parte superior llamada `Acciones de la importación`.
- Mostrar tres botones:
  - `+ Registrar costo adicional`.
  - `+ Registrar incidencia`.
  - `Vincular preventa`.
- Cada botón debe abrir una ventana emergente sin abandonar la ficha ni perder el estado actual.
- Después de guardar, cerrar la ventana y actualizar el resumen correspondiente.
- Mantener abajo únicamente paneles compactos o plegables:
  - `Costos registrados (0)`.
  - `Incidencias y seguros (0)`.
  - `Preventas vinculadas (0)`.
  - `Historial`.
- Cada panel debe poder expandirse cuando la administradora necesite revisar detalles.
- Agregar iconos `(i)` para explicar brevemente el propósito de cada acción.

## Hallazgo 13 — Estados generales y cajas

- Después de actualizar la página, la importación general y las dos cajas aparecen correctamente en `Despacho confirmado`.
- Esto confirma que el sistema sí puede sincronizar los estados, aunque la actualización visual no fue inmediata en una revisión anterior.
- Aun así, la pantalla muestra simultáneamente:
  - un botón general `Avanzar a Embarcado`;
  - un botón `Avanzar a Embarcada` dentro de cada caja.
- Tener ambas acciones sin explicar su alcance genera ambigüedad y riesgo de avanzar dos veces o no saber qué opción usar.

## Regla propuesta — avance general y avance por caja

- Las cajas deben poder avanzar de forma independiente, porque una importación puede contener varias cajas y no necesariamente todas se embarcan, transitan o llegan el mismo día.
- El estado general de la importación debe ser un resumen calculado automáticamente a partir de los estados de las cajas; no debe ser un estado independiente que pueda contradecirlas.
- Ejemplos:
  - Si ambas cajas están en `Despacho confirmado`, la importación muestra `Despacho confirmado`.
  - Si una caja está `Embarcada` y otra sigue en `Despacho confirmado`, la importación debe mostrar `Embarque parcial — 1 de 2 cajas` o `En proceso de embarque`.
  - Cuando todas las cajas estén `Embarcadas`, la importación pasa automáticamente a `Embarcada`.
- El botón general puede conservarse únicamente como acción masiva y debe llamarse claramente `Embarcar todas las cajas pendientes`.
- La acción masiva debe mostrar cuántas cajas afectará y aplicar el cambio solo a las cajas que estén habilitadas para avanzar.
- No debe existir una actualización general separada que deje las cajas atrás ni una actualización por caja que deje el resumen general incorrecto.

## Resultado de la prueba manual — embarque parcial

- Se avanzó únicamente `CJA-0000004`.
- Resultado observado:
  - `CJA-0000004`: `Enviada`.
  - `CJA-0000005`: `Despacho confirmado`.
  - La importación general continuó mostrando `Despacho confirmado`.
  - La acción general continuó mostrando `Avanzar a Embarcado`.
  - El inventario permaneció con 0 unidades recibidas, lo cual es correcto.
- La prueba confirma que el avance independiente por caja funciona.
- Sin embargo, el resumen general no expresa que existe un embarque parcial.
- Debe mostrarse una señal clara como:
  - `Embarque parcial — 1 de 2 cajas`, o
  - `En proceso de embarque`.
- La acción general debe cambiar a una etiqueta explícita como `Embarcar 1 caja pendiente` o `Embarcar todas las cajas pendientes`, indicando cuántas cajas serán afectadas.
- No debe decir simplemente `Avanzar a Embarcado`, porque puede interpretarse como cambiar solo el estado general sin actuar sobre la caja restante.
- El historial debe registrar únicamente el avance de `CJA-0000004` en esta prueba.

## Resultado de la prueba manual — todas las cajas embarcadas

- Se avanzó después `CJA-0000005`.
- Resultado observado:
  - `CJA-0000004`: `Enviada` y ofrece `Avanzar a En tránsito`.
  - `CJA-0000005`: `Enviada` y ofrece `Avanzar a En tránsito`.
  - Ambas cajas están por tanto en la misma etapa posterior al despacho.
  - La importación general continúa mostrando `Despacho confirmado`.
  - La línea de tiempo general sigue marcando `Despacho confirmado` como estado actual.
  - El botón general continúa diciendo `Avanzar a Embarcado`.
  - Las unidades recibidas continúan en 0, lo cual es correcto mientras la mercadería no haya llegado a Perú.
- Este resultado confirma un defecto funcional de consolidación: el estado general no se recalcula cuando todas las cajas alcanzan la etapa de embarque.
- Cuando todas las cajas estén `Embarcadas`, el sistema debe actualizar automáticamente:
  - estado general: `Embarcada`;
  - línea de tiempo: etapa de embarque como actual;
  - siguiente acción general: `Avanzar todas a En tránsito` o una acción masiva equivalente;
  - etiqueta superior de estado.
- El botón `Avanzar a Embarcado` ya no debe mostrarse porque no queda ninguna caja pendiente de embarque.
- La API y la vista deben usar la misma regla de consolidación para evitar que el resumen general contradiga a las cajas.

## Hallazgo 14 — Etiqueta `Faltantes` todavía prematura

- Las cajas muestran 37 y 25 unidades como `Faltantes` aunque todavía no se ha realizado una recepción física.
- Debe decir `Pendientes de recibir` hasta que se cuenten las unidades recibidas.

## Hallazgo 15 — Ventana de avance a Embarcado

- La ventana muestra correctamente `Motivo o evidencia *` como obligatorio.
- `Tracking maestro` no tiene asterisco y debe ser opcional.
- La leyenda general `* Campo obligatorio`, colocada debajo de Tracking maestro, genera confusión y debe eliminarse.
- Renombrar el campo como `Tracking maestro (opcional)` para dejarlo claro.
- Antes de permitir `Embarcado`, debe validarse la existencia de operador internacional y la coherencia de estados de todas las cajas.

## Hallazgo 16 — Terminología inconsistente

- La misma etapa aparece con tres textos distintos:
  - `Embarcado` en la acción general.
  - `Embarcada` en el botón de la caja.
  - `Enviada` en el estado ya aplicado a la caja.
- Debe elegirse una única terminología y aplicarse en línea de tiempo, botones, tarjetas, historial, filtros y reportes.
- Propuesta: usar `Embarcada` para caja e importación, con una descripción secundaria `Enviada desde origen`.

## Estado

**Las dos cajas fueron embarcadas individualmente. El avance por caja funciona, pero la importación general no se consolidó y continúa incorrectamente en `Despacho confirmado`. Pendiente probar el avance parcial a `En tránsito` y corregir la consolidación, las acciones masivas y la terminología en `version-1-1`. `main` no debe modificarse.**
