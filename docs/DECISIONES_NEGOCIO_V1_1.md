# Decisiones de negocio — Yukimi Gestión v1.1

Fecha de corte: 30 de julio de 2026.

Este documento registra la información recibida después de v1.0. Cuando contradice la especificación original, la decisión más reciente prevalece sin borrar el historial.

## Decisiones confirmadas e implementadas

| Tema | Decisión vigente | Cambio frente a v1.0 |
|---|---|---|
| Penalidad por liberación | Se calcula por línea de venta. El sistema propone Peluches S/5, Figuras S/10, Acrílicos S/3, Llaveros S/1 y Otros S/0. La administradora puede cambiar el monto con trazabilidad. | La liberación deja de tratarse como una penalidad única para toda la venta. |
| Devolución del adelanto | La penalidad se retiene del adelanto y se devuelve el resto. El sistema muestra adelanto atribuible, retención y devolución estimada. | Se explicita la compensación, no un cobro adicional por defecto. |
| Mora frente a liberación | Se aplica un solo monto: el mayor entre la mora acumulada activa y la penalidad de liberación. | No se suman ambas penalidades. |
| Descuentos | Monto y criterio libres. Si existe descuento, el motivo es obligatorio. Vender bajo costo genera advertencia, no bloqueo. | No hay una tabla rígida de porcentajes. |
| VIP | No existe un límite monetario global. El adelanto mínimo se negocia por venta/producto y queda documentado; el plazo especial puede permanecer en el perfil. | Reemplaza RF-014 y el límite global de v1.0. Los valores antiguos se archivan, no se borran. |
| Pago combinado | Un pago puede tener varias partes, por ejemplo Yape y efectivo, y genera un solo comprobante. Caja conserva el detalle por medio/cuenta. | Confirma el modelo de pago compuesto. |
| Costos de importación | Cálculo automático. Tarjeta, comisión y aduana se distribuyen por valor; flete y seguro por peso y, si falta peso, por cantidad. Los céntimos residuales van a la línea de mayor valor. | Sustituye el costo final escrito manualmente. |
| Costos posteriores | Si el lote ya fue recibido, se crea un ajuste de costo separado, auditado y reversible; no se reescribe el movimiento original de recepción. | Preserva trazabilidad contable y operativa. |
| Tarjetas | Las obligaciones de compra/importación registran banco, alias, últimos cuatro dígitos, moneda, cierre, vencimiento, cuotas, estado y alerta 15 días antes. | Amplía obligaciones de v1.0. |
| Reporte semanal | Lunes 08:00, zona `America/Lima`, con ventas, cobros, saldos, penalidades, productos, stock, gastos, rentabilidad, importaciones y despachos. | La programación queda preparada; faltan correos destinatarios. |
| Yape | Los dos Yapes pertenecen al circuito BCP. Scotiabank se usa para pagos de tarjeta. | Faltan cuentas y propietarios exactos. |
| Emisores | Yukimi opera con dos RUC. El sistema queda preparado para seleccionar entidad emisora sin inventar datos. | Amplía el modelo de comprobantes. |

## Decisión técnica configurable

- La categoría Otros conserva S/0 como sugerencia para exigir una decisión consciente al liberar.
- Una penalidad editada conserva el monto sugerido, el monto final, la persona y la regla aplicada.
- El adelanto atribuible a una línea se calcula proporcionalmente por su total dentro de la venta.
- Si la penalidad supera el adelanto atribuible, el sistema muestra el monto no cubierto. No crea una deuda nueva hasta que la clienta confirme esa política.
- Los costos recibidos después de la mercadería se registran como ajustes separados.
- Los valores operativos aún no confirmados se guardan como configuración pendiente, no como datos ficticios.

## Bloqueo legal y tributario

La solicitud de permitir que ingresos nuevos por diferencias de envío queden fuera de declaración no se implementa. El sistema no debe ocultar ingresos ni automatizar una omisión tributaria.

Los estados de comprobante `PENDING`, `ISSUED`, `VOIDED` y `LEGACY_NO_RECEIPT` se conservan para trazabilidad. El uso definitivo de “sin comprobante” en operaciones nuevas y el tratamiento de cobros de envío requieren una decisión del contador o asesor tributario de la empresa.

## Datos pendientes de la clienta

1. Nombre visible, propietario y cuenta BCP de cada uno de los dos Yapes; confirmar si son dos cuentas BCP distintas.
2. Razón social/nombre legal y número exacto de cada RUC; indicar cuándo se elige uno u otro emisor.
3. Banco, alias, últimos cuatro dígitos y moneda de cada tarjeta; confirmar la cuenta Scotiabank exacta desde la que se paga.
4. Definir si las cuotas se controlan por compra o por estado de cuenta.
5. Los dos correos que recibirán el reporte semanal.
6. Confirmar que lunes 08:00 `America/Lima` es la hora definitiva.
7. Dispositivos que recibirán push y posibles horarios de silencio.
8. Tratamiento contable/tributario de los cobros y diferencias de envío.
9. Confirmar si una penalidad no cubierta por el adelanto crea saldo por cobrar o se limita al monto retenible.
10. Cuenta y medio desde los que se ejecutan las devoluciones reales al cliente.
