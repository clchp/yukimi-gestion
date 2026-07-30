#!/usr/bin/env node
import { readFile } from 'node:fs/promises';

if (process.env.CONFIRM_RESTORE !== 'YUKIMI_RESTORE')
  throw new Error('Restauración bloqueada. Define CONFIRM_RESTORE=YUKIMI_RESTORE.');
for (const name of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'])
  if (!process.env[name]) throw new Error(`Falta ${name}.`);
const input = process.argv[2];
if (!input) throw new Error('Uso: node scripts/restore-backup.mjs <archivo.json>');
const backup = JSON.parse(await readFile(input, 'utf8'));
if (backup.format !== 'yukimi-backup-v1' || !backup.tables)
  throw new Error('Formato de respaldo no reconocido.');
const url = process.env.SUPABASE_URL.replace(/\/$/, '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

const skipped = new Set(
  (process.env.RESTORE_SKIP_TABLES ?? 'audit_log,outbox_events')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean),
);
for (const [table, rows] of Object.entries(backup.tables)) {
  if (skipped.has(table)) {
    console.log(`${table}: omitida por RESTORE_SKIP_TABLES.`);
    continue;
  }
  if (!Array.isArray(rows) || rows.length === 0) continue;
  for (let offset = 0; offset < rows.length; offset += 250) {
    const response = await fetch(`${url}/rest/v1/${encodeURIComponent(table)}`, {
      method: 'POST',
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
        prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(rows.slice(offset, offset + 250)),
    });
    if (!response.ok) throw new Error(`${table}: ${response.status} ${await response.text()}`);
  }
  console.log(`${table}: ${rows.length} filas restauradas/actualizadas.`);
}
