# Yukimi Gestión

Sistema administrativo interno para clientes, productos, inventario, ventas, pagos, entregas, importaciones, finanzas, alertas y reportes.

## Estado — v1.1.0 en validación

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

La actualización v1.1 añade reglas posteriores a la especificación original:

- Penalidad de liberación calculada por línea, con valor sugerido por categoría y edición auditada.
- Condiciones VIP negociadas por venta, sin límite monetario global.
- Costo importado automático con distribución auditable de tarjeta, comisión, aduana, flete y seguro.
- Obligaciones de tarjeta con banco, alias, últimos cuatro dígitos, cierre, vencimiento, cuotas y alerta de 15 días.
- Búsqueda global sobre clientes, ventas, productos, importaciones y entregas.
- Preparación multi-RUC sin cargar datos legales ficticios.
- Verificaciones estáticas de UI responsive integradas en CI.
- Carga diferida por ruta para reducir el JavaScript inicial y acelerar la apertura en móvil.

Las decisiones, contradicciones y datos pendientes de la clienta están en `docs/DECISIONES_NEGOCIO_V1_1.md`. La cobertura por requisito está en `docs/MATRIZ_TRAZABILIDAD_V1_1.md`.

Las cuentas definitivas de Lorena y Camila deben crearse mediante invitación al publicar. Durante desarrollo puede mantenerse la cuenta de pruebas de Claudia.

## Requisitos

- Node.js 24 recomendado.
- npm 10 o superior.
- Proyecto Supabase con migraciones previas aplicadas en orden.

## Actualización de Supabase

Las migraciones son incrementales y deben aplicarse en orden. Para v1.1:

```text
supabase/migrations/024_force_report_exports_rls.sql
...
supabase/migrations/032_global_erp_search.sql
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
/api/v1/search
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
npm run test:migrations:static
npm run test:db:static
npm run test:ui:static
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
