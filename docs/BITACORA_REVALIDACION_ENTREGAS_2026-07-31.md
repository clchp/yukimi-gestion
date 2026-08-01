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

## Clasificación de esta ronda

- **Defectos funcionales:** creación de entrega por agencia sin destino, ausencia de advertencia por saldo pendiente y posible transición logística regresiva.
- **Defectos visuales:** etiquetas y valores pegados en resumen y fechas.
- **Datos que sí se conservaron:** operador, fecha planificada, costo, responsable del costo y notas.

## Estado

**La primera prueba de creación de entrega falló en las validaciones esperadas. Pendiente revisar las transiciones de estado sin ejecutar una acción regresiva. `main` no debe modificarse.**
