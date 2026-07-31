import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const errors = [];

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(absolute)));
    else files.push(absolute);
  }
  return files;
}

function relative(file) {
  return path.relative(root, file).replaceAll(path.sep, '/');
}

function fail(message) {
  errors.push(message);
}

const webFiles = (await walk(path.join(root, 'apps/web/src'))).filter((file) =>
  /\.(?:ts|tsx)$/.test(file),
);
for (const file of webFiles) {
  const source = await readFile(file, 'utf8');
  const fileName = relative(file);
  const forbidden = [
    /\bwindow\.(?:alert|prompt|confirm)\s*\(/g,
    /(?<![.$\w])(?:alert|prompt|confirm)\s*\(/g,
  ];
  for (const pattern of forbidden) {
    const match = pattern.exec(source);
    if (match) {
      fail(`${fileName}: contiene un diálogo nativo prohibido cerca de “${match[0]}”.`);
    }
  }
}

const migrationDirectory = path.join(root, 'supabase/migrations');
const migrationFiles = (await readdir(migrationDirectory)).filter((file) => file.endsWith('.sql'));
const versions = new Map();
for (const file of migrationFiles) {
  const version = file.split('_')[0];
  const list = versions.get(version) ?? [];
  list.push(file);
  versions.set(version, list);
}
for (const [version, files] of versions) {
  if (files.length > 1) fail(`Migración duplicada ${version}: ${files.join(', ')}`);
}

const requiredFiles = [
  'apps/web/src/components/ui/feedback-provider.tsx',
  'apps/web/src/components/ui/searchable-select.tsx',
  'apps/web/src/components/ui/filter-panel.tsx',
  'apps/web/src/features/products/product-label.ts',
  'apps/web/src/pages/product-detail-page.tsx',
  'apps/web/src/pages/edit-product-page.tsx',
  'supabase/migrations/037_product_maintenance_and_ux_integrity.sql',
  'supabase/migrations/038_import_workflow_integrity.sql',
  'supabase/migrations/039_repair_historical_zero_import_receipts.sql',
  'supabase/migrations/040_atomic_import_cancellations.sql',
  'supabase/migrations/041_partial_sale_drafts.sql',
  'supabase/migrations/042_atomic_import_cancellation_events.sql',
];
for (const file of requiredFiles) {
  try {
    await readFile(path.join(root, file));
  } catch {
    fail(`Falta el archivo requerido: ${file}`);
  }
}

const globalCss = await readFile(path.join(root, 'apps/web/src/styles/global.css'), 'utf8');
for (const stylesheet of [
  './ux.css',
  './ux-dashboard.css',
  './ux-products.css',
  './ux-imports.css',
  './ux-new-import.css',
]) {
  if (!globalCss.includes(stylesheet)) fail(`global.css no carga ${stylesheet}.`);
}

const inventoryPage = await readFile(
  path.join(root, 'apps/web/src/pages/inventory-page.tsx'),
  'utf8',
);
if (!inventoryPage.includes('Registrar movimiento')) {
  fail('Inventario no expone el flujo unificado “Registrar movimiento”.');
}
if (inventoryPage.includes('Ajuste dinámico')) {
  fail('Inventario todavía muestra el nombre ambiguo “Ajuste dinámico”.');
}

const importPage = await readFile(
  path.join(root, 'apps/web/src/pages/import-detail-page.tsx'),
  'utf8',
);
if (!importPage.includes('Recibir e ingresar caja a stock')) {
  fail('Importaciones no expone el único flujo de recepción requerido.');
}
if (!importPage.includes('Corregir recepción')) {
  fail('Importaciones no permite corregir recepciones históricas con cero unidades.');
}

const productPage = await readFile(path.join(root, 'apps/web/src/pages/products-page.tsx'), 'utf8');
if (!productPage.includes('Descargar etiqueta')) {
  fail('Productos no muestra la descarga de etiqueta completa.');
}
if (!productPage.includes('Exportación completada')) {
  fail('Productos no confirma la exportación CSV.');
}

if (errors.length > 0) {
  console.error('La verificación UX encontró problemas:\n');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `Verificación UX correcta: ${webFiles.length} archivos revisados y ${migrationFiles.length} migraciones sin duplicados.`,
);
