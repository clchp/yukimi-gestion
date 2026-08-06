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
- El cambio afecta únicamente los rótulos y no modifica los valores de las filas.

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
