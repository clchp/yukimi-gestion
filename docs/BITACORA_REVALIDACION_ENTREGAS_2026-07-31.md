# Bitácora de revalidación — Entregas

> Fecha: 31 de julio de 2026  
> Rama: `version-1-1`  
> Complementa las bitácoras de pruebas manuales de Yukimi Gestión v1.1.

## Hallazgo 1 — Preparación logística antes del pago

- La especificación describe el pago y la entrega como estados separados y no establece expresamente que la preparación logística solo pueda comenzar después del pago total.
- Se recomienda permitir preparar una entrega aunque la venta esté `Sin pago`, pero mostrar de forma visible el estado de pago.
- Preparar la entrega no debe equivaler a marcarla como despachada ni entregada.
- Antes de cambiar a un estado físico como `Entregado a agencia`, `En reparto` o `Entregado al cliente`, el sistema debe advertir si existe saldo pendiente.
- La regla de si debe bloquearse el despacho con saldo pendiente o permitirse mediante confirmación administrativa queda como decisión de negocio pendiente.
- Propuesta de UX: mostrar una advertencia amarilla con icono `(i)` o alerta: `Esta venta tiene saldo pendiente. Puedes preparar la entrega, pero verifica el pago antes de despachar.`

## Hallazgo 2 — Direcciones y puntos de entrega

- La pantalla actual solo muestra `Sin dirección registrada` cuando el cliente no tiene una dirección guardada.
- Para `Motorizado`, la dirección exacta o punto de destino debe ser obligatorio.
- Para `Agencia`, debe ser obligatorio registrar el destino logístico correspondiente: dirección del cliente, oficina/agencia elegida o punto de recojo acordado.
- Para `Entrega presencial`, debe existir al menos un lugar o referencia de entrega, aunque no necesariamente una dirección domiciliaria completa.
- Para `Otro`, debe exigirse un punto de destino o una explicación en notas.
- Añadir un botón `+ Agregar dirección o punto de entrega` cuando no existan opciones.
- El botón debe abrir una ventana emergente sin sacar a la administradora del formulario.
- La ventana debe permitir:
  - Registrar dirección o punto de referencia.
  - Distrito.
  - Referencia adicional.
  - Etiqueta opcional, por ejemplo `Casa`, `Trabajo`, `Agencia Olva Centro` o `Punto de encuentro`.
  - Elegir si se guarda también en el perfil del cliente para futuras entregas.
- Al aceptar, la nueva dirección debe quedar seleccionada automáticamente y el formulario de entrega debe conservar los demás datos ingresados.
- Permitir varias direcciones o puntos por cliente y poder editarlos o desactivarlos desde su perfil.

## Hallazgo 3 — Campos según método de entrega

### Agencia

- Agencia obligatoria.
- Destino o punto de recojo obligatorio.
- Fecha planificada de despacho obligatoria.
- Número de seguimiento opcional al crear; debe poder registrarse después.
- Costo de envío y quién lo asume deben conservarse.

### Motorizado

- Dirección exacta obligatoria.
- Fecha planificada de despacho obligatoria.
- Operador o motorizado configurable.
- Costo de envío y quién lo asume obligatorios, permitiendo costo cero cuando corresponda.

### Entrega presencial

- Punto o referencia de entrega obligatorio.
- Puede ser una dirección guardada, tienda, feria, evento o punto acordado.
- No debe exigir agencia ni número de seguimiento.
- La fecha planificada debe poder registrarse.

### Otro

- Exigir una descripción del método y un destino o referencia.
- Conservar notas para trazabilidad.

## Prueba manual en curso — VTA-0000012

### Datos observados

- Cliente: Priscila.
- Venta: `VTA-0000012`.
- Cantidad pendiente: 1 unidad.
- Estado de pago: sin pago.
- Método inicialmente seleccionado: Agencia.
- No existe dirección registrada.

### Objetivo inmediato

Validar si el sistema permite crear una entrega por agencia sin dirección ni punto de destino y cómo maneja una venta todavía sin pago.

### Datos de prueba propuestos

- Método: `Agencia`.
- Agencia: `Olva`.
- Dirección o punto de referencia: mantener `Sin dirección registrada` para comprobar la validación.
- Fecha planificada de despacho: `01/08/2026`.
- Número de seguimiento: vacío.
- Costo de envío: `15`.
- Quién asume el costo: `Cliente`.
- Notas: `Prueba manual de entrega por agencia sin dirección registrada.`

### Resultado esperado

- El sistema debe impedir crear la entrega y mostrar el error junto al campo de dirección o punto de destino.
- El mensaje debe indicar claramente que se necesita registrar una dirección, agencia de destino o punto de entrega.
- Debe ofrecer la acción `Agregar dirección o punto de entrega` sin perder los datos del formulario.
- El estado `Sin pago` debe seguir visible como advertencia, pero no necesariamente impedir la preparación logística.

## Resultado real de la prueba — ENT-0000005

- El sistema permitió crear la entrega por agencia con `Sin dirección registrada`.
- La entrega quedó en estado `Pendiente de despacho a agencia`.
- No se mostró una advertencia visible por tratarse de una venta `Sin pago`.
- El resultado confirma dos defectos funcionales:
  1. Falta validación de destino obligatorio para una entrega por agencia.
  2. Falta una advertencia clara del saldo pendiente durante la preparación logística.
- La operación creada conserva correctamente:
  - Agencia `Olva`.
  - Fecha planificada `2026-08-01`.
  - Costo `S/ 15.00`.
  - Responsable del costo: cliente.
  - Notas de la prueba.

## Hallazgo 4 — Presentación visual del detalle de entrega

- En el resumen superior aparecen valores pegados a sus etiquetas, por ejemplo `VentaVTA-0000012`, `ClientePriscila`, `MétodoAgencia`, `Unidades1` y `CostoS/ 15.00`.
- En la tarjeta de fechas también aparecen textos unidos, como `Planificado2026-08-01`, `DespachadoSin registrar` y `Entregado al clienteSin registrar`.
- Debe existir separación visual suficiente entre etiqueta y valor, manteniendo columnas, márgenes y alineación uniforme.
- Los códigos, nombres, importes y estados no deben verse amontonados al cambiar el ancho de pantalla.

## Hallazgo 5 — Acción siguiente incoherente

- La entrega ya está en estado `Pendiente de despacho a agencia`, pero la sección `Siguiente acción` muestra un botón llamado `Pendiente de indicaciones`.
- Ese texto parece representar un estado anterior, por lo que podría hacer retroceder el flujo logístico de manera confusa.
- La siguiente acción esperada para una entrega por agencia debería ser una opción como `Registrar despacho a agencia` o `Marcar como entregado a agencia`, según la secuencia definida.
- No debe ofrecerse como acción principal un estado anterior sin una explicación y confirmación explícita.
- Antes de continuar esta prueba, se debe revisar el resto de botones de la sección para confirmar si existen más transiciones disponibles.

## Hallazgo 6 — No debe permitirse elegir cualquier estado libremente

- La especificación exige que cada entrega avance únicamente por estados válidos y registre sus fechas.
- Los estados definidos son:
  - `Pendiente de indicaciones`: todavía falta que el cliente indique cómo o dónde recibir.
  - `Acumula almacén`: el cliente decide conservar temporalmente los productos en Yukimi.
  - `Pendiente de despacho a agencia`: ya se definieron agencia y datos logísticos, pero el paquete aún no fue entregado a la agencia.
  - `Entregado a agencia`: Yukimi ya dejó físicamente el paquete en la agencia; debe registrarse la fecha de despacho y, cuando exista, el seguimiento.
  - `En reparto`: la agencia o motorizado ya trasladan el paquete al destino final.
  - `Entregado al cliente`: el cliente ya recibió; es un estado final y debe registrar la fecha real de entrega.
- No deben mostrarse todos los estados como botones equivalentes desde cualquier punto.
- Para `ENT-0000005`, cuyo estado actual es `Pendiente de despacho a agencia`, la acción principal correcta es `Marcar como entregado a agencia`.
- `Pendiente de indicaciones` solo puede ofrecerse como corrección o retroceso controlado antes del despacho, con confirmación y motivo obligatorio.
- `En reparto` no debe poder seleccionarse antes de `Entregado a agencia`.
- `Entregado al cliente` no debe poder seleccionarse directamente desde `Pendiente de despacho a agencia`; debe respetar la secuencia o requerir una corrección excepcional con motivo y trazabilidad.
- `Acumula almacén` no debe mezclarse con el avance normal de una entrega por agencia ya creada; si el cliente cambia de decisión antes del despacho, debe tratarse como cambio de modalidad con confirmación.
- La interfaz debe mostrar solo la siguiente acción válida como botón principal y colocar las correcciones excepcionales dentro de `Más opciones`, explicando su efecto.

## Resultado final de la exploración manual — salto confirmado

- La usuaria ejecutó las opciones disponibles en `ENT-0000005` para comprobar el comportamiento.
- El sistema permitió pasar de `Pendiente de despacho a agencia` a `Entregado a agencia` y luego directamente a `Entregado al cliente`.
- No exigió el estado intermedio `En reparto`.
- El historial muestra:
  1. `Pendiente de despacho a agencia` — 31 jul. 2026, 7:05 p. m.
  2. `Entregado a agencia` — 31 jul. 2026, 7:17 p. m.
  3. `Entregado al cliente` — 31 jul. 2026, 7:17 p. m.
- También quedaron registradas fechas de despacho y recepción por agencia, pero la entrega seguía sin destino registrado.
- El caso confirma que la validación no podía limitarse a la interfaz: la API también debía rechazar saltos de estado.
- `ENT-0000005` permanece como registro histórico de prueba ya finalizado; la corrección se aplica a nuevas transiciones y no reescribe silenciosamente su historial.

## Correcciones implementadas en la rama de trabajo

- Se definió una matriz secuencial por método de entrega en la API.
- Para agencia, el flujo queda: `Pendiente de despacho a agencia` → `Entregado a agencia` → `En reparto` → `Entregado al cliente`.
- La API rechaza una transición fuera de orden con un mensaje claro y código de conflicto.
- El detalle de entrega muestra solamente las siguientes acciones válidas devueltas por la API.
- Se exige destino para agencia, motorizado, entrega presencial y otros métodos no acumulados.
- Se exige fecha planificada para agencia, motorizado y entrega presencial.
- Se añadió un botón `Agregar` que abre una ventana emergente para guardar una dirección o punto en la ficha del cliente y seleccionarlo sin abandonar la entrega.
- Se muestra una advertencia visible cuando la venta tiene saldo pendiente, sin impedir la preparación logística.
- Se mejoraron la separación entre etiquetas y valores, el formato de fechas, la traducción de quién paga el envío y la visualización de destinos faltantes históricos.
- Se añadieron pruebas automáticas para destino obligatorio y secuencia de estados.

## Clasificación de esta ronda

- **Defectos funcionales confirmados:** creación de entrega por agencia sin destino, ausencia de advertencia por saldo pendiente, transición logística regresiva, selección libre de estados y salto directo a entrega final.
- **Defectos visuales confirmados:** etiquetas y valores pegados en resumen y fechas.
- **Datos que sí se conservaron:** operador, fecha planificada, costo, responsable del costo, seguimiento, fechas e historial.

## Estado

**Correcciones implementadas en `fix/entregas-flow-validation`, pendiente de validación técnica y fusión únicamente hacia `version-1-1`. `main` no debe modificarse.**
