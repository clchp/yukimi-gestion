#!/usr/bin/env node
import { readFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const failures = [];

async function text(path) {
  try {
    return await readFile(resolve(root, path), 'utf8');
  } catch {
    failures.push(`No existe o no se puede leer: ${path}`);
    return '';
  }
}

async function exists(path) {
  try {
    await access(resolve(root, path));
    return true;
  } catch {
    failures.push(`Falta el archivo requerido: ${path}`);
    return false;
  }
}

function requirePattern(content, pattern, message) {
  if (!pattern.test(content)) failures.push(message);
}

const migration = await text('supabase/migrations/034_compliance_closure.sql');
const packageJson = JSON.parse(await text('package.json'));
const products = await text('apps/web/src/pages/products-page.tsx');
const sales = await text('apps/web/src/pages/new-sale-page.tsx');
const saleDetail = await text('apps/web/src/pages/sale-detail-page.tsx');
const settings = await text('apps/web/src/pages/settings-page.tsx');
const reports = await text('apps/web/src/pages/reports-page.tsx');
const inventory = await text('apps/web/src/pages/inventory-page.tsx');
const main = await text('apps/web/src/main.tsx');

for (const file of [
  'apps/web/public/manifest.webmanifest',
  'apps/web/public/sw.js',
  'apps/web/public/icons/icon-192.png',
  'apps/web/public/icons/icon-512.png',
  '.github/workflows/ci.yml',
  '.github/workflows/notifications.yml',
  '.github/workflows/backup.yml',
  'scripts/process-notifications.mjs',
  'scripts/export-backup.mjs',
  'scripts/restore-backup.mjs',
  'docs/CUMPLIMIENTO_REQUISITOS_V1_1.md',
  'docs/NOTIFICACIONES_Y_SCHEDULER.md',
  'docs/RESPALDO_Y_RESTAURACION.md',
])
  await exists(file);

const functions = [
  'save_sale_draft_v1',
  'confirm_sale_draft_v1',
  'create_inventory_movement_v1',
  'create_return_case_v1',
  'update_business_setting_v1',
  'upsert_warehouse_v1',
  'upsert_financial_account_v1',
  'update_admin_profile_v1',
  'update_catalog_item_v1',
  'update_finance_category_v1',
  'queue_weekly_summary_v1',
  'queue_dispatch_day_reminders_v1',
  'claim_outbox_events_v1',
  'defer_outbox_event_v1',
  'complete_outbox_event_v1',
  'get_capacity_snapshot_v1',
];
for (const name of functions)
  requirePattern(
    migration,
    new RegExp(`create or replace function public\\.${name}\\b`, 'i'),
    `Falta la función ${name}.`,
  );

requirePattern(
  products,
  /downloadProductLabelPng|downloadQrLabel/,
  'La pantalla de productos no descarga etiquetas QR.',
);
requirePattern(products, /exportProducts/, 'La pantalla de productos no exporta el catálogo.');
requirePattern(
  sales,
  /saveSaleDraft|saveDraft/,
  'La venta no contiene guardado persistente de borradores.',
);
requirePattern(sales, /dueDateReason/, 'La venta no exige motivo de fecha de vencimiento.');
requirePattern(
  saleDetail,
  /createReturnCase|returnMutation/,
  'El detalle de venta no implementa devoluciones/cambios.',
);
requirePattern(
  inventory,
  /createInventoryMovement/,
  'Inventario no registra movimientos atómicos.',
);
requirePattern(settings, /upsertWarehouse/, 'Configuración no administra almacenes.');
requirePattern(
  settings,
  /upsertFinancialAccount/,
  'Configuración no administra cuentas financieras.',
);
requirePattern(settings, /updateCatalogItem/, 'Configuración no administra catálogos.');
requirePattern(reports, /downloadXlsx/, 'Reportes no genera XLSX.');
requirePattern(reports, /downloadPdf/, 'Reportes no genera PDF.');
requirePattern(main, /serviceWorker\.register/, 'La aplicación no registra el service worker.');

for (const script of [
  'test:compliance:static',
  'notifications:process',
  'backup:export',
  'backup:restore',
]) {
  if (!packageJson.scripts?.[script]) failures.push(`Falta el script npm ${script}.`);
}

if (failures.length) {
  console.error(`Validación de cumplimiento fallida (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(
  'Validación de cumplimiento correcta: cierre funcional, PWA, notificaciones, respaldo y CI presentes.',
);
