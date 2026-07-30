# Fase 7 — Entregas, agencias y seguimiento

Esta fase convierte la pantalla demostrativa de Entregas en un flujo real conectado a Supabase.

## Alcance implementado

- Lista, búsqueda, filtros, resumen y vista móvil de entregas.
- Ventas acumuladas visibles como pendientes de preparar despacho.
- Creación de entregas parciales por líneas de venta.
- Métodos: agencia, motorizado/courier, presencial y otro.
- Operadores reales: Shalom, Olva y AF Express según su tipo.
- Dirección del cliente, fecha planificada, costo, responsable del costo y notas.
- Estados separados: pendiente de indicaciones, pendiente de agencia, entregado a agencia, en reparto, entregado al cliente y cancelado.
- Tracking obligatorio al confirmar la recepción por una agencia.
- Fecha real de despacho, recepción de agencia y entrega al cliente.
- Historial completo de cambios.
- Protección atómica para que la suma de entregas no supere lo vendido.
- Entregas parciales: una venta puede dividirse en varias entregas.
- Al confirmar la entrega al cliente, el inventario pasa de reservado/acumulado a entregado.
- El estado global de la venta se actualiza a parcial o entregada.
- El costo asumido por el cliente se incorpora al total de la venta.
- Idempotencia para evitar entregas duplicadas por doble clic.

## Decisiones de diseño

“Acumula almacén” sigue siendo un estado global de la venta, no un envío ficticio. En la pantalla de Entregas se muestran esas ventas y desde allí se prepara una entrega real por agencia, motorizado o presencial.

El stock no sale del almacén cuando solo se crea la guía o se entrega a la agencia. La salida terminal a `DELIVERED` ocurre cuando se confirma que el cliente recibió los productos.

## Rutas

- `GET /api/v1/deliveries`
- `GET /api/v1/deliveries/support-data`
- `GET /api/v1/deliveries/:deliveryId`
- `POST /api/v1/deliveries`
- `POST /api/v1/deliveries/:deliveryId/state`

## Migración

Ejecutar `017_deliveries_agencies_api.sql` después de las migraciones anteriores. La versión completa del proyecto también conserva `016_fix_payment_declared_amount.sql`.
