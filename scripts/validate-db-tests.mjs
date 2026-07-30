import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const testsDirectory = path.resolve('supabase/tests/database');
const filenames = (await readdir(testsDirectory))
  .filter((filename) => filename.endsWith('.test.sql'))
  .sort();
const problems = [];

if (filenames.length === 0) {
  problems.push('No se encontraron pruebas pgTAP con extensión .test.sql.');
}

for (const filename of filenames) {
  const contents = await readFile(path.join(testsDirectory, filename), 'utf8');
  const planMatch = /select\s+plan\((\d+)\)/i.exec(contents);
  const assertionCount = (
    contents.match(/^select\s+(?:ok|is|isnt|results_eq|lives_ok|throws_ok)\s*\(/gim) ?? []
  ).length;

  if (!planMatch) {
    problems.push(`${filename}: falta select plan(...).`);
  } else if (Number(planMatch[1]) !== assertionCount) {
    problems.push(
      `${filename}: declara ${planMatch[1]} pruebas, pero contiene ${assertionCount} aserciones.`,
    );
  }

  if (!/select\s+\*\s+from\s+finish\(\)\s*;/i.test(contents)) {
    problems.push(`${filename}: falta select * from finish();`);
  }
  if (!/rollback\s*;\s*$/i.test(contents)) {
    problems.push(`${filename}: debe terminar con ROLLBACK.`);
  }
}

if (problems.length > 0) {
  console.error('Validación estática de pruebas de base de datos fallida:');
  for (const problem of problems) console.error(`- ${problem}`);
  process.exitCode = 1;
} else {
  console.log(
    `Pruebas pgTAP correctas: ${filenames.length} archivos con planes y rollback coherentes.`,
  );
}
