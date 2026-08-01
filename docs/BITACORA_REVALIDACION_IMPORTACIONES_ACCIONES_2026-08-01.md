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

## Hallazgo 13 — Estados generales y cajas siguen desincronizados

- La importación general ya llegó a `Despacho confirmado`.
- Las cajas `CJA-0000004` y `CJA-0000005` continúan como `Registrada` y todavía muestran `Avanzar a Almacén extranjero`.
- Esto confirma una desincronización entre el estado general y el de las cajas.
- La interfaz permite que el proceso general avance mientras las cajas permanecen varias etapas atrás.
- Debe definirse una regla única:
  - o el estado general se calcula según el avance de todas las cajas;
  - o cada avance general actualiza automáticamente las cajas compatibles;
  - o el sistema bloquea el avance general hasta que todas las cajas alcancen el estado requerido.
- No debe ser posible marcar la importación como embarcada mientras una caja siga solamente registrada.

## Hallazgo 14 — Etiqueta `Faltantes` todavía prematura

- Las cajas muestran 37 y 25 unidades como `Faltantes` aunque todavía no se ha realizado una recepción física.
- Debe decir `Pendientes de recibir` hasta que se cuenten las unidades recibidas.

## Hallazgo 15 — Ventana de avance a Embarcado

- La ventana muestra correctamente `Motivo o evidencia *` como obligatorio.
- `Tracking maestro` no tiene asterisco y debe ser opcional.
- La leyenda general `* Campo obligatorio`, colocada debajo de Tracking maestro, genera confusión y debe eliminarse.
- Renombrar el campo como `Tracking maestro (opcional)` para dejarlo claro.
- Antes de permitir `Embarcado`, debe validarse la existencia de operador internacional y la coherencia de estados de todas las cajas.

## Estado

**Hallazgos funcionales y de experiencia de usuario registrados. Pendiente implementar en `version-1-1`. `main` no debe modificarse.**
