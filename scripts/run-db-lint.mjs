import { spawnSync } from 'node:child_process';
import process from 'node:process';

const executable = process.platform === 'win32' ? 'supabase.cmd' : 'supabase';
const result = spawnSync(
  executable,
  ['db', 'lint', '--local', '--level', 'error', '--schema', 'public,private'],
  {
    encoding: 'utf8',
    env: process.env,
  },
);

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);

if (result.error) {
  console.error(`No se pudo ejecutar Supabase DB lint: ${result.error.message}`);
  process.exit(1);
}

const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
const reportedError =
  /"level"\s*:\s*"error"/i.test(output) ||
  /\blevel\s*:\s*error\b/i.test(output) ||
  /\[\s*error\s*\]/i.test(output);

if (result.status !== 0 || reportedError) {
  if (reportedError && result.status === 0) {
    console.error(
      'Supabase DB lint reportó errores aunque la CLI devolvió código 0; la verificación se marca como fallida.',
    );
  }
  process.exit(result.status && result.status !== 0 ? result.status : 1);
}

console.log('Supabase DB lint no reportó errores de nivel error.');
