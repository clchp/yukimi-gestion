# Bitácora de ajustes pendientes — 06/08/2026

## Alcance

Esta entrega consolida los hallazgos de la revisión manual realizada después de la revalidación general y del ajuste urgente de entregas. La integración se dirige exclusivamente a `version-1-1`; `main` permanece sin cambios.

## Inicio

- Los botones disponibles son Hoy, 7 días, 1 mes y Total.
- Hoy muestra un único grupo con Ventas y Cobros.
- 7 días muestra siete grupos diarios.
- 1 mes muestra siempre cinco semanas del mes calendario, incluso cuando alguna todavía tiene valor cero.
- Total divide todo el historial disponible en cinco periodos consecutivos.
- El gráfico aprovecha la tarjeta sin dejar una zona vacía inferior.
- El tooltip conserva únicamente Ventas y Cobros, sin repetir la fecha.

## Ventas y clientes VIP

- La revisión final usa el texto Entrega pendiente en lugar de Pendiente de definir.
- El subtítulo del resumen distingue entre próxima entrega y acumulación de compras.
- El mensaje del siguiente paso se presenta como una tarjeta informativa diferenciada.
- Cuando el adelanto mínimo VIP es mayor que cero, la fecha límite del adelanto es obligatoria.
- Cuando el adelanto es cero, la fecha no se solicita ni se guarda.
- El detalle muestra el adelanto requerido, fecha límite, importe pagado, faltante y estado.
- La fecha queda almacenada en la venta y en la instantánea de términos negociados.

## Pagos y comprobantes

- Los avisos de constancia resuelta desaparecen cuando el pago ya está confirmado y tiene archivo.
- Los avisos pueden cerrarse manualmente.
- Serie y número incluyen una ayuda contextual con el ejemplo B001-00000010.
- El archivo de la boleta se identifica expresamente como opcional y no sustituye la emisión en SUNAT.

## Productos e inventario

- Productos muestra la columna Acumulado para mantener coherencia con Inventario.
- Los encabezados extensos de Inventario admiten dos líneas y mayor separación horizontal.
- Rótulos como `En tránsito`, `Costo actual` y `Stock mínimo` pueden dividirse entre sus palabras para evitar que se choquen.
- El cambio afecta únicamente los rótulos y no modifica los valores de las filas.

## Importaciones

- La tabla, el avance y las acciones de cada caja permanecen contenidos dentro de su propia tarjeta.
- Los menús de `Vincular preventa` se muestran completos, con altura máxima, scroll interno y prioridad visual sobre las tarjetas inferiores.
- Cuando no existe una preventa compatible se muestra un mensaje explícito y no un selector aparentemente vacío.
- `Diferencia no recibida` se reemplaza visualmente por `Valor pendiente de recibir`.
- Una caja que ya está `Recibida en Perú` puede iniciar una recepción parcial aunque otra caja continúe en tránsito.
- Antes de abrir la recepción, el sistema sincroniza el estado general a `Recibida en Perú` cuando aún estaba almacenado como `En tránsito`; las demás cajas conservan su estado y el resumen continúa mostrando avance parcial.

## Conciliación bancaria

- La X cierra el lote actualmente abierto, pero no elimina el archivo importado ni sus movimientos.
- La vista vacía se conserva al recargar la pestaña mediante estado de sesión.
- El usuario puede volver a abrir el mismo lote o seleccionar otro desde `Archivo importado`.
- Al elegir un lote se restablecen los pasos, contadores y movimientos correspondientes.

## Entregas y costo logístico

- Cliente significa pago directo a la agencia o motorizado, sin afectar saldo ni cuentas de Yukimi.
- Yukimi significa que el negocio asume el costo; no se suma al cliente y debe registrarse como gasto cuando se pague.
- Compartido exige documentar en notas cuánto paga cada parte; solo la porción de Yukimi corresponde a gasto.
- La pantalla aclara que preparar una entrega física hace que las unidades acumuladas entren al flujo de despacho.

## Base de datos

- Migración incremental `048_vip_deposit_deadline_and_pending_ux.sql`.
- No reinicia ni elimina información.
- Agrega `sales.negotiated_minimum_deposit_due_at`.
- Actualiza `create_sale_v3` y `get_sale_detail_v3` de forma compatible con las rutas existentes.

## Verificación prevista

- Lint y formato.
- Compilación de tipos compartidos.
- Typecheck de API y web.
- Pruebas Node, incluida la validación del adelanto VIP.
- Pruebas estáticas y pgTAP de migraciones.
- Build completo.
- Revisión manual de recepción parcial, preventa y persistencia de la selección bancaria.
