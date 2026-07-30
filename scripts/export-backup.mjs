#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

for (const name of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'])
  if (!process.env[name]) throw new Error(`Falta ${name}.`);
const url = process.env.SUPABASE_URL.replace(/\/$/, '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const tables = (
  process.env.BACKUP_TABLES ??
  [
    'business_settings',
    'profiles',
    'user_roles',
    'clients',
    'client_phones',
    'client_addresses',
    'catalog_categories',
    'catalog_brands',
    'catalog_franchises',
    'catalog_characters',
    'products',
    'product_variants',
    'warehouses',
    'inventory_lots',
    'inventory_balances',
    'inventory_movements',
    'inventory_movement_lines',
    'sales',
    'sale_items',
    'sale_item_allocations',
    'payments',
    'payment_allocations',
    'sales_receipts',
    'deliveries',
    'import_shipments',
    'import_boxes',
    'financial_accounts',
    'financial_categories',
    'financial_movements',
    'obligations',
    'loans',
    'notifications',
    'notification_recipients',
    'notification_preferences',
    'audit_log',
  ].join(',')
)
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

async function readTable(table) {
  const response = await fetch(`${url}/rest/v1/${encodeURIComponent(table)}?select=*`, {
    headers: { apikey: key, authorization: `Bearer ${key}`, prefer: 'count=exact' },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${table}: ${response.status} ${text}`);
  return JSON.parse(text);
}

const data = {};
for (const table of tables) {
  data[table] = await readTable(table);
  console.log(`${table}: ${data[table].length}`);
}
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const output = resolve(process.env.BACKUP_OUTPUT ?? `backups/yukimi-backup-${stamp}.json`);
await mkdir(dirname(output), { recursive: true });
await writeFile(
  output,
  JSON.stringify(
    { format: 'yukimi-backup-v1', createdAt: new Date().toISOString(), tables: data },
    null,
    2,
  ),
);
console.log(output);
