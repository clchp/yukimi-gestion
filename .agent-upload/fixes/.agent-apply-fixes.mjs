import { readFileSync, writeFileSync } from 'node:fs';

function replaceOnce(path, before, after) {
  const source = readFileSync(path, 'utf8');
  if (!source.includes(before)) {
    throw new Error(`No se encontró el bloque esperado en ${path}`);
  }
  writeFileSync(path, source.replace(before, after));
}

replaceOnce(
  'packages/shared/src/admin.ts',
  '  accountTypeCode: z.string(),',
  "  accountTypeCode: z.enum(['BANK', 'WALLET', 'CASH', 'CREDIT_CARD']),",
);

replaceOnce(
  'apps/web/src/features/products/qr-code.ts',
  `      next[position] ^= coefficient;\n      next[position + 1] ^= multiply(coefficient, factor);`,
  `      next[position] = (next[position] ?? 0) ^ coefficient;\n      next[position + 1] = (next[position + 1] ?? 0) ^ multiply(coefficient, factor);`,
);

replaceOnce(
  'apps/web/src/features/insights/file-export.ts',
  `function downloadBlob(filename: string, blob: Blob) {`,
  `function copyToArrayBuffer(bytes: Uint8Array): ArrayBuffer {\n  const buffer = new ArrayBuffer(bytes.byteLength);\n  new Uint8Array(buffer).set(bytes);\n  return buffer;\n}\n\nfunction downloadBlob(filename: string, blob: Blob) {`,
);

replaceOnce(
  'apps/web/src/features/insights/file-export.ts',
  `downloadBlob(filename, new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));`,
  `downloadBlob(filename, new Blob([copyToArrayBuffer(bytes)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));`,
);
