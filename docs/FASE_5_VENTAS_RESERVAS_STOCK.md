# Fase 5 — Ventas, reservas y control atómico de stock

## Alcance implementado

- Lista real de ventas con búsqueda, filtros, resumen y paginación.
- Creación guiada de una venta para un cliente activo.
- Selección de variante y almacén con disponibilidad real.
- Reserva FIFO por lote dentro del almacén elegido.
- Transacción atómica: venta, líneas, descuentos, asignaciones y movimiento de inventario.
- Protección contra doble clic mediante clave de idempotencia.
- Protección contra sobreventa cuando dos administradoras intentan reservar el mismo stock.
- Precio original, precio final, tipo y motivo obligatorio del descuento.
- Vencimiento automático de 14 días o plazo VIP; también admite una fecha manual.
- Estado de entrega pendiente o “Acumula almacén”.
- Detalle real de la venta, asignaciones por lote y almacén, totales e historial de estados.
- Solicitud de liberación con motivo y penalidad propuesta.
- Revisión de liberación por una administradora distinta; al aprobar, el stock vuelve a disponible mediante movimiento compensatorio.
- Cancelación lógica sin borrar la venta ni el historial.

## Migración requerida

Ejecutar:

1. `supabase/migrations/014_sales_reservations_api.sql`
2. `supabase/tests/005_phase5_sales_checks.sql`

## Endpoints

```text
GET    /api/v1/sales
GET    /api/v1/sales/support-data
GET    /api/v1/sales/:saleId
POST   /api/v1/sales
POST   /api/v1/sales/:saleId/release-requests
POST   /api/v1/sales/release-requests/:requestId/review
```

## Límites conscientes de esta fase

- Los pagos y sus constancias se incorporan en la Fase 6.
- Las boletas y penalidades cobradas se incorporan en la Fase 6.
- Las entregas por agencia, motorizado o presencial se incorporan en la Fase 7.
- Las preventas vinculadas a importaciones se incorporan en la Fase 8.
- En esta fase se crean ventas regulares de productos que ya tienen stock disponible.

## Prueba principal

1. Crear un cliente activo.
2. Crear un producto con 3 unidades en Lorena y 2 en Camila.
3. Crear una venta de 2 unidades desde Lorena.
4. Comprobar que la venta queda `RESERVED` y el pago `UNPAID`.
5. Comprobar inventario: Lorena baja de 3 disponibles a 1 disponible y sube a 2 reservadas.
6. Intentar reservar 2 unidades adicionales desde Lorena: debe fallar por stock insuficiente.
7. Confirmar que el intento fallido no creó una venta parcial ni alteró el stock.

## Liberación

La solicitud la realiza una administradora y la aprobación debe hacerla otra. Con una sola cuenta de pruebas se puede comprobar la creación de la solicitud; la aprobación se prueba al disponer de una segunda cuenta administradora.
