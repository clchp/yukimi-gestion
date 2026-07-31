import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = join(root, 'apps', 'web', 'src');
const outputPath = join(root, 'docs', 'UX_SOURCE_AUDIT.md');

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(fullPath)));
    else if (['.ts', '.tsx', '.css'].includes(extname(entry.name))) files.push(fullPath);
  }
  return files;
}

const checks = [
  { id: 'native-prompt', re: /\b(?:window\.)?prompt\s*\(/g, label: 'Diálogo nativo prompt' },
  { id: 'native-confirm', re: /\b(?:window\.)?confirm\s*\(/g, label: 'Diálogo nativo confirm' },
  { id: 'native-alert', re: /\b(?:window\.)?alert\s*\(/g, label: 'Diálogo nativo alert' },
  { id: 'generic-invalid', re: /Los datos enviados no son v[aá]lidos/gi, label: 'Mensaje genérico de validación' },
  { id: 'english-state', re: /\b(?:ACCUMULATED|DELIVERED|PENDING|IN_TRANSIT|RECEIVED|STOCKED|CANCELLED|OTHER|INSERT|UPDATE|DELETE)\b/g, label: 'Código técnico visible potencial' },
  { id: 'filter-button', re: />\s*Filtros\s*</g, label: 'Botón Filtros a revisar' },
];

const findings = [];
for (const file of await walk(sourceRoot)) {
  const source = await readFile(file, 'utf8');
  const lines = source.split(/\r?\n/);
  for (const check of checks) {
    check.re.lastIndex = 0;
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const line = lines[lineIndex];
      check.re.lastIndex = 0;
      if (check.re.test(line)) {
        findings.push({
          check: check.label,
          id: check.id,
          file: relative(root, file).replaceAll('\\', '/'),
          line: lineIndex + 1,
          excerpt: line.trim().replaceAll('|', '\\|').slice(0, 220),
        });
      }
    }
  }
}

const grouped = Map.groupBy(findings, (finding) => finding.check);
const sections = [];
for (const [label, items] of grouped) {
  sections.push(`## ${label}\n\n| Archivo | Línea | Fragmento |\n|---|---:|---|`);
  for (const item of items) {
    sections.push(`| \`${item.file}\` | ${item.line} | \`${item.excerpt}\` |`);
  }
  sections.push('');
}

const report = `# Auditoría automática del frontend\n\nGenerado: ${new Date().toISOString()}\n\nTotal de hallazgos: **${findings.length}**.\n\n${sections.join('\n')}\n`;
await writeFile(outputPath, report, 'utf8');
console.log(`Auditoría generada con ${findings.length} hallazgos en ${relative(root, outputPath)}.`);
