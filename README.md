# Yukimi Gestión

Sistema administrativo interno para clientes, productos, inventario, ventas, pagos, entregas, importaciones, finanzas, alertas y reportes.

## Estado — v1.0.0

La primera versión funcional completa incluye:

- Autenticación Supabase y acceso exclusivo para administradoras activas.
- Catálogos, productos, variantes, imágenes y stock por almacén.
- Clientes, direcciones, condición VIP e incidentes.
- Ventas, reservas, descuentos y asignación atómica de stock.
- Pagos parciales/combinados, constancias, boletas, notas de crédito y penalidades.
- Entregas parciales, agencias, motorizado, tracking y edición antes del despacho.
- Importaciones, cajas, proveedores, monedas, costos, incidencias, seguro y preventas.
- Finanzas, cuentas, transferencias, gastos, obligaciones, préstamos, caja y conciliación bancaria.
- Panel principal, alertas operativas, reportes reales y auditoría consultable.
- Exportación CSV compatible con Excel y guardado como PDF mediante impresión.
- CI con GitHub Actions y configuración para Cloudflare Pages + Render + Supabase.

Las cuentas definitivas de Lorena y Camila deben crearse mediante invitación al publicar. Durante desarrollo puede mantenerse la cuenta de pruebas de Claudia.

## Requisitos

- Node.js 24 recomendado.
- npm 10 o superior.
- Proyecto Supabase con migraciones 000–022 aplicadas antes de ejecutar la 023.

## Actualización de Supabase

Ejecutar en este orden:

```text
supabase/migrations/023_reports_notifications_audit_release.sql
supabase/tests/011_phase10_release_checks.sql
```

`Success. No rows returned` significa que las comprobaciones pasaron.

## Instalación

```bash
npm install
npm run build:shared
npm run typecheck
npm test
npm run build
```

Crear los archivos locales:

```powershell
Copy-Item apps/api/.env.example apps/api/.env
Copy-Item apps/web/.env.example apps/web/.env
```

Completar la URL y clave pública `anon` de Supabase. No usar `service_role` en el frontend ni en esta API.

## Ejecución local

Terminal 1:

```bash
npm run dev:api
```

Terminal 2:

```bash
npm run dev:web
```

- Frontend: `http://localhost:5173`
- API: `http://localhost:3000/api/v1`
- Salud: `http://localhost:3000/api/v1/health`

## Endpoints principales

```text
/api/v1/auth
/api/v1/catalogs
/api/v1/products
/api/v1/clients
/api/v1/sales
/api/v1/payments
/api/v1/deliveries
/api/v1/imports
/api/v1/finance
```

### Panel, reportes y sistema

```text
GET   /api/v1/insights/dashboard
GET   /api/v1/insights/notifications
PATCH /api/v1/insights/notifications/:notificationId/status
GET   /api/v1/insights/reports
POST  /api/v1/insights/reports/exports
GET   /api/v1/insights/audit
```

## Verificaciones

```bash
npm run build:shared
npm run typecheck
npm test
npm run build
npm run lint
npm run format:check
```

## Documentación

- `docs/FASE_1_FUNDACION.md`
- `docs/FASE_2_SISTEMA_VISUAL.md`
- `docs/FASE_3_CATALOGO_PRODUCTOS_INVENTARIO.md`
- `docs/FASE_4_CLIENTES_VIP.md`
- `docs/FASE_5_VENTAS_RESERVAS_STOCK.md`
- `docs/FASE_6_PAGOS_BOLETAS_PENALIDADES.md`
- `docs/FASE_7_ENTREGAS_AGENCIAS.md`
- `docs/FASE_7_1_EDICION_ENTREGAS.md`
- `docs/FASE_8_IMPORTACIONES_PREVENTAS.md`
- `docs/FASE_8_1_PROVEEDORES_MONEDAS.md`
- `docs/FASE_9_FINANZAS_BANCOS_CONCILIACION.md`
- `docs/FASE_10_REPORTES_ALERTAS_PUBLICACION.md`
- `docs/GUIA_PUBLICACION.md`
