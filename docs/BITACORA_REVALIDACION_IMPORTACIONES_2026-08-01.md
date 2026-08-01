# Bitácora de revalidación — Importaciones

> Fecha: 1 de agosto de 2026  
> Rama: `version-1-1`  
> Complementa las bitácoras de pruebas manuales de Yukimi Gestión v1.1.

## Alcance de esta ronda

Validación manual de creación de proveedor, creación de una importación con dos cajas, productos distribuidos por almacén, costos, operadores, estados iniciales y presentación del detalle.

## Datos creados durante la prueba

- Importación: `IMP-000003`.
- Proveedor: `AmiAmi`.
- Medio de transporte: aéreo.
- Moneda: USD.
- Tipo de cambio: 3.4.
- Fecha de compra: 01/08/2026.
- Llegada estimada: 15/08/2026.
- Unidades esperadas: 62.
- Cajas generadas:
  - `CJA-0000004`.
  - `CJA-0000005`.
- Estado inicial: `Cotización`.
- Stock recibido: 0.

## Resultado general aprobado hasta ahora

- La importación se creó y quedó inicialmente en estado `Cotización`.
- Se generaron dos cajas con correlativos diferentes.
- El sistema mostró 62 unidades esperadas y 0 unidades recibidas.
- La creación no agregó stock al inventario, lo cual es correcto.
- Los productos quedaron relacionados con sus almacenes de destino.
- La pantalla conserva costos, fechas, proveedor, transporte, cajas e historial inicial.

## Hallazgo 1 — Campos obligatorios del proveedor poco claros

- En el formulario de proveedor, `Nombre` y `País` muestran asterisco rojo, pero `Notas` no lo muestra aunque la pantalla indica que existe otro campo obligatorio.
- La usuaria tuvo que escribir una nota sin contenido real para poder continuar.
- `Notas` debe ser opcional, salvo que el negocio confirme una razón concreta para exigirla.
- Si un campo es obligatorio, debe mostrar `*` rojo junto a su etiqueta, no únicamente una leyenda general al final.
- Cuando falte información, el error debe aparecer debajo del campo correspondiente.
- La ventana debe desplazar el foco al primer campo inválido y conservar los datos ya escritos.

## Hallazgo 2 — Mensaje técnico ajeno al proveedor

- Durante el intento de crear proveedor apareció en la terminal un error de regla de negocio con el mensaje `La venta todavía no tiene días de retraso.`
- Ese mensaje pertenece al flujo de ventas o penalidades y no explica un fallo de creación de proveedor.
- No debe utilizarse como respuesta de una operación de importaciones.
- Debe investigarse si existe una consulta automática o proceso secundario ejecutándose al mismo tiempo.
- La interfaz debe mostrar únicamente el error correspondiente a la acción actual y nunca depender de que la usuaria lea la terminal.

## Hallazgo 3 — Error general sin identificar los campos

- Al intentar crear la importación apareció: `Corrige 2 campos marcados en rojo`.
- Los campos concretos no quedaron claramente visibles ni identificados en la captura.
- La validación debe:
  - Mostrar el mensaje debajo de cada campo inválido.
  - Resaltar su borde y etiqueta.
  - Desplazar la pantalla al primer error.
  - Indicar el nombre del campo en el resumen general.
- No debe obligar a revisar manualmente un formulario largo para descubrir los errores.

## Hallazgo 4 — El resumen flotante tapa el formulario

- La tarjeta `Resumen` permanece encima del contenido y se superpone con cajas, productos, campos y botones.
- En varias capturas cubre parte de los costos, monedas y controles de la caja.
- Debe mantenerse dentro de su columna sin invadir el formulario.
- En pantallas con menor ancho debe pasar a una fila superior o inferior, dejar de ser fija o contraerse.
- Ningún campo ni acción debe quedar oculto detrás de la tarjeta.

## Hallazgo 5 — No existe forma visible de crear operador internacional

- El selector de `Operador internacional` aparece vacío y muestra `Sin resultados`.
- No existe junto al selector un botón equivalente al `Crear` disponible para proveedores.
- Los operadores internacionales y locales deben ser entidades reutilizables.
- Agregar una acción `+ Crear operador` desde el mismo formulario, mediante ventana emergente, sin perder los datos de la importación.
- La ventana debe permitir nombre, tipo, país, contacto y notas opcionales.
- Al guardar, el operador nuevo debe quedar seleccionado automáticamente.
- En estado `Cotización` el operador puede quedar como pendiente si todavía no fue elegido; antes de confirmar el despacho o marcar la mercadería como enviada debe ser obligatorio.

## Hallazgo 6 — Secuencia entre importación y cajas por validar

- Debe existir una matriz clara de transiciones:
  1. Cotización.
  2. Compra confirmada.
  3. En almacén internacional.
  4. Despacho confirmado.
  5. Embarcada o enviada desde origen.
  6. En tránsito.
  7. Recibida en Perú.
  8. Ingresada a stock.
- Las cajas no deben avanzar a una etapa incompatible con el estado general de la importación.
- La interfaz debe mostrar únicamente la siguiente acción válida y la API debe rechazar saltos o retrocesos no permitidos.

## Hallazgo 7 — `Faltantes` antes de realizar la recepción

- En la caja `CJA-0000004` se muestran 37 esperadas, 0 recibidas y 37 faltantes antes de la recepción física.
- Antes de la recepción no se sabe que esas unidades sean faltantes.
- Cambiar la etiqueta por `Pendientes de recibir` durante cotización, compra, almacén internacional, despacho y tránsito.
- Utilizar `Faltantes` solamente después de registrar la recepción física y comparar esperado contra recibido.

## Hallazgo 8 — Nombre de estado `Enviada`

- La especificación utiliza el estado `Embarcado` dentro del flujo de importación.
- La interfaz muestra `Enviada`.
- Usar una etiqueta más precisa y consistente, por ejemplo `Embarcada / enviada desde origen`, especialmente porque también existe `En tránsito`.
- Aplicar el mismo texto en línea de tiempo, botones, historial, filtros y reportes.

## Hallazgo 9 — Presentación de cajas y productos

- La tabla de productos de cada caja requiere desplazamiento horizontal aun en computadora.
- Revisar anchos, alineación, encabezados y comportamiento responsive para evitar que información esencial quede escondida.
- Mantener visibles producto, destino, esperado, recibido, preventa y costo.
- La información de destino con varios almacenes debe tener separación visual, por ejemplo `Almacén Camila · Almacén Lorena`.

## Hallazgo 10 — Preventa sin contexto suficiente

- La sección `Vincular preventa` queda deshabilitada cuando no existe una preventa compatible, pero no explica claramente por qué.
- Mostrar un estado vacío o icono `(i)` con un texto breve: `No hay ventas en preventa pendientes para los productos de esta importación`.
- No mostrar el botón como si estuviera averiado.

## Aclaración de secciones existentes

### Registrar costo

- Se utiliza para costos adicionales de la importación, como flete, seguro, comisión, aduanas u otros.
- No reemplaza el costo de compra registrado en cada producto.
- Puede aplicarse a toda la importación o a una caja específica.

### Registrar incidencia

- Se utiliza después de detectar un faltante, daño, pérdida u otro problema real.
- Debe conservar caja, producto, cantidad afectada, descripción, evidencia y seguimiento del reclamo o seguro.

### Vincular preventa

- Relaciona una venta en preventa con unidades esperadas de la importación.
- No debe permitir asignar más unidades de las esperadas o disponibles para preventa.

## Resultado del avance a `Compra confirmada`

- La importación `IMP-000003` avanzó correctamente desde `Cotización` hasta `Compra confirmada`.
- Antes de ejecutar el cambio apareció una ventana de confirmación.
- La ventana solicitó un motivo obligatorio, que quedó asociado al cambio de estado.
- La línea de tiempo marcó `Cotización` como completada y `Compra confirmada` como estado actual.
- La acción principal cambió a `Avanzar a Almacén extranjero`.
- Las unidades recibidas continuaron en cero y no se produjo ingreso prematuro a stock.

## Corrección de observación anterior — Confirmación sí existente

- Se elimina la observación anterior que afirmaba que el cambio a `Compra confirmada` se ejecutaba sin confirmación.
- La confirmación y el motivo obligatorio son adecuados para conservar trazabilidad del cambio.
- Debe mantenerse consistencia entre la etiqueta y la validación: si el campo es obligatorio debe mostrarse como `Motivo *`; no debe llamarse `Nota opcional` mientras el sistema lo exige.
- La fecha, hora y administradora responsable deben seguir registrándose automáticamente en el historial.

## Resultado del avance a `En almacén internacional`

- La importación avanzó después a `En almacén internacional`.
- En la captura, `Cotización` y `Compra confirmada` aparecen completadas y `En almacén internacional` aparece como estado actual.
- La siguiente acción general mostrada es `Avanzar a Confirmación de despacho`, lo que respeta la secuencia esperada.
- Las unidades recibidas continúan en cero y los costos adicionales permanecen en S/ 0.00.
- Antes de confirmar el despacho debe verificarse que exista un operador internacional seleccionado y que los datos reales de seguimiento estén registrados o claramente pendientes.

## Siguiente prueba recomendada

- No confirmar todavía el despacho.
- Pulsar `Avanzar a Confirmación de despacho` únicamente para abrir la ventana de confirmación.
- Capturar la ventana completa antes de aceptar.
- Verificar si exige operador internacional, seguimiento, fecha real, motivo o evidencia.
- Si permite confirmar sin operador internacional, registrarlo como defecto porque la importación no tendría responsable logístico internacional antes del despacho.

## Clasificación

- **Defectos funcionales prioritarios:** validaciones sin campo identificado, imposibilidad visible de crear operador internacional y posible incompatibilidad entre estados generales y estados de cajas.
- **Defectos de experiencia de usuario:** resumen superpuesto, campo obligatorio sin asterisco, mensajes sin contexto, etiqueta `Faltantes` prematura y preventa deshabilitada sin explicación.
- **Comportamientos aprobados:** importación creada en cotización, dos correlativos únicos, 62 unidades esperadas, cero recibidas, ausencia de ingreso prematuro a stock, confirmación con motivo para avanzar estados y secuencia general hasta `En almacén internacional`.

## Estado

**La importación se encuentra en `En almacén internacional`. Pendiente validar la confirmación de despacho y la obligatoriedad del operador internacional. `main` no debe modificarse.**
