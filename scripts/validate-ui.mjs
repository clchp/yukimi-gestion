import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const read = (path) => readFile(resolve(root, path), 'utf8');
const failures = [];

const [
  responsive,
  saleDetail,
  newSale,
  inventory,
  importDetail,
  deliveryDetail,
  salePayments,
  finance,
  audit,
  reports,
] = await Promise.all([
  read('apps/web/src/styles/responsive.css'),
  read('apps/web/src/pages/sale-detail-page.tsx'),
  read('apps/web/src/pages/new-sale-page.tsx'),
  read('apps/web/src/pages/inventory-page.tsx'),
  read('apps/web/src/pages/import-detail-page.tsx'),
  read('apps/web/src/pages/delivery-detail-page.tsx'),
  read('apps/web/src/features/payments/sale-payments-section.tsx'),
  read('apps/web/src/pages/finance-page.tsx'),
  read('apps/web/src/pages/audit-page.tsx'),
  read('apps/web/src/pages/reports-page.tsx'),
]);

const requireText = (source, text, message) => {
  if (!source.includes(text)) failures.push(message);
};
const rejectText = (source, text, message) => {
  if (source.includes(text)) failures.push(message);
};

requireText(responsive, '@media (max-width: 410px)', 'Falta el ajuste para teléfonos angostos.');
requireText(responsive, '.modal-card', 'Los formularios modales no tienen adaptación móvil.');
requireText(
  responsive,
  '.modal-card-wide',
  'Los formularios modales anchos no tienen adaptación móvil.',
);
requireText(
  responsive,
  '.mobile-scroll-panel .responsive-table-wrap',
  'Las tablas ERP sin tarjetas no tienen alternativa móvil.',
);
requireText(
  responsive,
  '.import-box-detail .responsive-table-wrap',
  'Las líneas de importación no tienen desplazamiento móvil.',
);
requireText(saleDetail, 'sale-item-mobile-list', 'El detalle de venta oculta sus líneas en móvil.');
requireText(inventory, 'inventory-mobile-list', 'Inventario no tiene vista móvil.');
requireText(
  importDetail,
  'import-box-detail',
  'La importación no conserva acceso a sus líneas en móvil.',
);
requireText(finance, 'mobile-scroll-panel', 'Finanzas pierde sus movimientos en móvil.');
requireText(audit, 'mobile-scroll-panel', 'Auditoría pierde sus registros en móvil.');
requireText(
  reports,
  'mobile-scroll-panel',
  'Reportes pierde su rentabilidad por producto en móvil.',
);
rejectText(
  saleDetail,
  'window.prompt',
  'El flujo sensible de liberación aún usa prompts del navegador.',
);
rejectText(newSale, 'window.prompt', 'La creación de venta aún usa prompts del navegador.');
rejectText(newSale, 'Fase 6', 'La creación de venta muestra fases inexistentes.');
rejectText(newSale, 'Fase 7', 'La creación de venta muestra fases inexistentes.');
rejectText(importDetail, 'window.prompt', 'Importaciones aún usa prompts del navegador.');
rejectText(deliveryDetail, 'window.prompt', 'Entregas aún usa prompts del navegador.');
rejectText(salePayments, 'window.prompt', 'Pagos aún usa prompts del navegador.');

if (failures.length > 0) {
  console.error('Validación UI fallida:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Validación UI correcta: flujos críticos y alternativas responsive presentes.');
