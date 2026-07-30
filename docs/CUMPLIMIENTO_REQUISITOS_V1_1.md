# Cierre de requisitos — Yukimi Gestión v1.1

Fecha de revisión: 30 de julio de 2026.

Se contrastó el informe de etapas 1 y 2 con el código entregado. La versión 1.1 conserva los módulos existentes y completa los vacíos detectados sin introducir datos comerciales inventados.

## Funcionalidad completada

- Catálogo: categorías, marcas, franquicias y personajes editables/desactivables; penalidades por categoría; exportación de productos; etiquetas QR descargables e imprimibles.
- Inventario: transferencias, mermas, pérdidas, regalos y movimientos manuales mediante una operación atómica, con motivo, idempotencia y auditoría.
- Clientes y VIP: política negociada por venta, plazo especial, historial y operaciones sensibles con confirmación.
- Ventas: borradores persistentes, tipo de venta normal/pedido, fecha de vencimiento con motivo, pago mixto, liberación por línea, cotización de penalidad y revisión administrativa.
- Postventa: devoluciones y cambios con entrada/salida de inventario en una sola transacción.
- Reportes: descarga CSV, XLSX y PDF; cálculo de rentabilidad usando costo final asignado de lotes.
- Administración: datos del negocio, administradoras, almacenes, cuentas financieras y preferencias de notificación configurables.
- Notificaciones: PWA instalable, suscripción push, correo semanal los lunes a las 08:00 (America/Lima), recordatorios de despacho lunes/jueves, outbox con reintentos y horario silencioso.
- Operación: monitoreo de capacidad, respaldo lógico semanal, restauración protegida y workflows de CI.

## Datos que deben completar las propietarias

Los requisitos mencionan información real que no debe inventarse. La configuración queda preparada, pero antes del despliegue deben ingresarse:

- razón social/nombre comercial definitivo, RUC, dirección, teléfono y correo;
- números enmascarados o identificadores de BCP y Scotiabank;
- nombres de las dos titulares de Yape y su vínculo con la cuenta BCP;
- correos de las administradoras que recibirán resúmenes;
- credenciales de correo y del gateway push;
- saldos iniciales y fecha de corte.

## Evidencia y validación

- Migraciones consecutivas `000`–`034`.
- Suite pgTAP en `supabase/tests/database`, incluida `012_compliance_closure.test.sql`.
- Validadores estáticos de migraciones, pruebas, UI y cierre de cumplimiento.
- CI ejecuta formato, lint, typecheck, pruebas, migraciones locales y build.

Comando de validación integral:

```bash
npm ci
npm run verify
```

La validación contra Supabase real requiere las variables del proyecto y la aplicación de la migración 034 en un entorno de prueba antes de producción.
