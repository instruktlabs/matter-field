import { execFile } from 'node:child_process';
import { access, readdir, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'dist-types');
const COMPILER = join(ROOT, 'node_modules', 'typescript-upstream', 'bin', 'tsc');

await rm(OUT_DIR, { recursive: true, force: true });
await execFileAsync(process.execPath, [COMPILER, '-p', join(ROOT, 'tsconfig.types.json')], {
  cwd: ROOT,
  maxBuffer: 8 * 1024 * 1024,
});

const expected = [
  'src/index.d.ts',
  'src/adapter.d.ts',
  'src/number.d.ts',
  'src/hash.d.ts',
  'src/dual.d.ts',
  'src/noise.d.ts',
  'src/backend-tsl.d.ts',
  'parity/harness.d.ts',
  'parity/golden.d.ts',
];

await Promise.all(expected.map((path) => access(join(OUT_DIR, path))));
const topLevelEntries = (await readdir(OUT_DIR)).sort();
console.log(`[matter-field] generated ${expected.length} declaration entry points in ${topLevelEntries.join(', ')}`);
