# Fase 10 — Reportes, alertas, auditoría y publicación

Esta fase reemplaza las últimas pantallas demostrativas por consultas reales y deja el proyecto preparado para publicación.

## Funcionalidad

- Panel principal con ventas y cobros del día, pagos próximos/vencidos, entregas, boletas, stock bajo e importaciones.
- Gráfico real de los últimos siete días.
- Saldos reales de cuentas financieras.
- Centro de notificaciones dentro de la aplicación.
- Avisos del navegador para prioridades altas y críticas mientras Yukimi está abierto.
- Alertas deduplicadas de pagos, stock, importaciones, despachos, boletas y obligaciones.
- Reportes por periodo y almacén.
- Ventas, cobros, costo y ganancia estimada, ticket promedio, clientes, categorías y productos.
- Exportación CSV compatible con Excel y opción de impresión/guardado como PDF.
- Registro de cada exportación en auditoría.
- Auditoría real con filtros, paginación, valores anteriores/nuevos y exportación.
- Configuración de CI y archivos para Cloudflare Pages y Render.

## Migración

Ejecutar:

```text
supabase/migrations/023_reports_notifications_audit_release.sql
supabase/tests/011_phase10_release_checks.sql
```

La respuesta correcta para las comprobaciones es `Success. No rows returned`.

## Reglas de alertas

La aplicación actualiza alertas al abrir el panel o el centro de notificaciones y luego cada minuto mientras está abierta.

- Pago próximo a vencer: usa `notifications.payment_due_days_before`.
- Pago vencido: una alerta activa por venta.
- Stock bajo: suma disponibilidad visible y la compara con el mínimo de la variante.
- Importación próxima o retrasada: usa la fecha estimada.
- Despacho pendiente: entregas pendientes con fecha próxima o sin fecha.
- Boleta pendiente: pago confirmado con importe todavía no asociado.
- Tarjeta/SUNAT: obligaciones abiertas dentro de su anticipación configurada.

Los avisos del navegador no son un servicio push en segundo plano: aparecen mientras la aplicación está abierta. Las alertas dentro de Yukimi permanecen disponibles al volver a entrar.

## Rentabilidad estimada

La ganancia se calcula como ventas menos el costo final en soles de los lotes asignados. Cuando una línea todavía no tiene un lote con costo final, su costo estimado puede aparecer en cero hasta completar la recepción o asignación.

## Verificación técnica

```bash
npm install
npm run build:shared
npm run typecheck
npm test
npm run build
```
