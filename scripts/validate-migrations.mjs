import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const migrationsDirectory = path.resolve('supabase/migrations');
const entries = (await readdir(migrationsDirectory, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
  .map((entry) => entry.name)
  .sort();

if (entries.length === 0) {
  throw new Error('No se encontraron migraciones SQL.');
}

const versions = new Map();
const hashes = new Map();
const problems = [];

for (const filename of entries) {
  const match = /^(\d+)_([a-z0-9_]+)\.sql$/i.exec(filename);
  if (!match) {
    problems.push(`${filename}: el nombre no sigue <versión>_<descripción>.sql`);
    continue;
  }

  const version = match[1];
  const previousVersion = versions.get(version);
  if (previousVersion) {
    problems.push(`${filename}: repite la versión ${version}, ya utilizada por ${previousVersion}`);
  } else {
    versions.set(version, filename);
  }

  const contents = await readFile(path.join(migrationsDirectory, filename), 'utf8');
  const hash = createHash('sha256').update(contents).digest('hex');
  const previousHash = hashes.get(hash);
  if (previousHash) {
    problems.push(`${filename}: duplica exactamente el contenido de ${previousHash}`);
  } else {
    hashes.set(hash, filename);
  }

  const beginCount = (contents.match(/^\s*begin\s*;\s*$/gim) ?? []).length;
  const commitCount = (contents.match(/^\s*commit\s*;\s*$/gim) ?? []).length;
  if (beginCount !== commitCount) {
    problems.push(
      `${filename}: transacciones superiores desbalanceadas (${beginCount} BEGIN, ${commitCount} COMMIT)`,
    );
  }
}

if (problems.length > 0) {
  console.error('Validación estática de migraciones fallida:');
  for (const problem of problems) console.error(`- ${problem}`);
  process.exitCode = 1;
} else {
  console.log(
    `Validación estática correcta: ${entries.length} migraciones, versiones únicas y sin duplicados exactos.`,
  );
}
