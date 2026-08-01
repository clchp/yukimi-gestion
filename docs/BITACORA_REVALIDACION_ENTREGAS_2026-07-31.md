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

## Estado

**Pendiente de continuar la prueba manual y definir la política final de despacho con saldo pendiente. `main` no debe modificarse.**
