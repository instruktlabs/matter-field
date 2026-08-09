import { execFile } from 'node:child_process';
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { build } from 'esbuild';

const execFileAsync = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ARTIFACTS = join(ROOT, 'artifacts', 'package-consumer');
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('npm_execpath is required; run this check through npm run test:typegpu:consumer');
const runNpm = (args, options) => execFileAsync(
  process.execPath,
  [npmCli, ...args],
  options,
);

function parsePackMetadata(stdout) {
  const objectStart = stdout.lastIndexOf('\n{');
  const arrayStart = stdout.lastIndexOf('\n[');
  const jsonStart = Math.max(objectStart, arrayStart);
  const payload = stdout.slice(jsonStart >= 0 ? jsonStart + 1 : 0).trim();

  let parsed;
  try {
    parsed = JSON.parse(payload);
  } catch (error) {
    throw new Error(`npm pack did not emit a parseable JSON payload:\n${stdout}`, { cause: error });
  }

  const metadata = Array.isArray(parsed) ? parsed[0] : Object.values(parsed)[0];
  if (!metadata?.filename) {
    throw new Error(`npm pack JSON omitted the tarball filename:\n${payload}`);
  }
  return metadata;
}

await mkdir(ARTIFACTS, { recursive: true });
const consumer = await mkdtemp(join(tmpdir(), 'matter-field-consumer-'));

try {
  const { stdout: packStdout } = await runNpm(
    ['pack', '--json', '--pack-destination', ARTIFACTS],
    { cwd: ROOT, maxBuffer: 8 * 1024 * 1024 },
  );
  const packed = parsePackMetadata(packStdout);
  const tarball = join(ARTIFACTS, packed.filename);

  await writeFile(join(consumer, 'package.json'), `${JSON.stringify({
    name: 'matter-field-typegpu-consumer-smoke',
    private: true,
    type: 'module',
  }, null, 2)}\n`, 'utf8');
  await runNpm(
    [
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      tarball,
    ],
    { cwd: consumer, maxBuffer: 8 * 1024 * 1024 },
  );

  const typegpuInstalled = await access(join(consumer, 'node_modules', 'typegpu', 'package.json'))
    .then(() => true)
    .catch(() => false);
  if (typegpuInstalled) {
    throw new Error('The core-only install unexpectedly pulled in the optional TypeGPU peer');
  }
  await writeFile(join(consumer, 'core-smoke.mjs'), `
import assert from 'node:assert/strict';
import { numberAdapter } from 'matter-field';

assert.equal(numberAdapter.add(20, 22), 42);
console.log('[matter-field] core-only consumer import passed without optional GPU peers');
`.trimStart(), 'utf8');
  const { stdout: coreStdout } = await execFileAsync(process.execPath, ['core-smoke.mjs'], {
    cwd: consumer,
    maxBuffer: 8 * 1024 * 1024,
  });
  process.stdout.write(coreStdout);

  await runNpm(
    [
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      'typegpu@0.11.9',
      '@typegpu/three@0.11.0',
      'three@0.185.1',
    ],
    { cwd: consumer, maxBuffer: 8 * 1024 * 1024 },
  );
  await runNpm(
    [
      'install',
      '--save-dev',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '@types/three@0.185.4',
      'typescript@npm:tsover@6.0.2',
    ],
    { cwd: consumer, maxBuffer: 8 * 1024 * 1024 },
  );

  const smoke = `
import assert from 'node:assert/strict';
import tgpu from 'typegpu';
import * as tsl from 'three/tsl';
import { typegpuDunes, typegpuKernels } from 'matter-field/typegpu';
import { TYPEGPU_THREE_WEBGPU_ONLY, typegpuDunesNode } from 'matter-field/typegpu/three';

assert.ok(Number.isFinite(typegpuDunes(12, -30)));
for (const [name, kernel] of Object.entries(typegpuKernels)) {
  const wgsl = tgpu.resolve({ template: 'field', externals: { field: kernel } });
  assert.match(wgsl, /fn\\s+\\w+\\(/u, name);
}
assert.equal(TYPEGPU_THREE_WEBGPU_ONLY, true);
assert.ok(typegpuDunesNode(tsl.float(1), tsl.float(2)).isNode);
console.log('[matter-field] clean consumer import, CPU call, WGSL resolution, and Three node construction passed');
`;
  await writeFile(join(consumer, 'smoke.mjs'), smoke.trimStart(), 'utf8');
  const { stdout } = await execFileAsync(process.execPath, ['smoke.mjs'], {
    cwd: consumer,
    maxBuffer: 8 * 1024 * 1024,
  });
  process.stdout.write(stdout);

  await writeFile(join(consumer, 'consumer-smoke.ts'), `
import tgpu from 'typegpu';
import * as tsl from 'three/tsl';
import { typegpuDunes, typegpuKernels } from 'matter-field/typegpu';
import {
  makeNativeTslCompatibility,
  typegpuDunesNode,
  typegpuSerpentSpineNode,
  typegpuWindNode,
} from 'matter-field/typegpu/three';

const height: number = typegpuDunes(12, -30);
const wgsl: string = tgpu.resolve({ template: 'field', externals: { field: typegpuKernels.dunes } });
const scaled = typegpuDunesNode(tsl.float(1), tsl.float(2)).mul(0.25);
const windX = typegpuWindNode(tsl.float(1), tsl.float(2), tsl.float(3)).x;
const spineY = typegpuSerpentSpineNode(tsl.float(0.5), tsl.float(3)).y;
const portable = makeNativeTslCompatibility(tsl).dunes(tsl.float(1), tsl.float(2)).mul(0.25);
void [height, wgsl, scaled, windX, spineY, portable];
`.trimStart(), 'utf8');
  await writeFile(join(consumer, 'tsconfig.json'), `${JSON.stringify({
    compilerOptions: {
      target: 'ESNext',
      module: 'ESNext',
      moduleResolution: 'Bundler',
      lib: ['ESNext', 'DOM', 'DOM.Iterable'],
      strict: true,
      noEmit: true,
      skipLibCheck: true,
    },
    include: ['consumer-smoke.ts'],
  }, null, 2)}\n`, 'utf8');
  await execFileAsync(
    process.execPath,
    [join(consumer, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', join(consumer, 'tsconfig.json')],
    { cwd: consumer, maxBuffer: 8 * 1024 * 1024 },
  );
  console.log('[matter-field] external packed TypeScript consumer passed with typed scalar/vector Three nodes');

  await writeFile(join(consumer, 'browser-entry.js'), `
import { typegpuKernels } from 'matter-field/typegpu';
import { typegpuDunesNode } from 'matter-field/typegpu/three';
import * as tsl from 'three/tsl';
globalThis.__MATTER_FIELD_PACKED_SMOKE__ = [typegpuKernels.dunes, typegpuDunesNode(tsl.float(1), tsl.float(2))];
`.trimStart(), 'utf8');
  await build({
    entryPoints: [join(consumer, 'browser-entry.js')],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    outfile: join(consumer, 'browser-bundle.js'),
    logLevel: 'silent',
  });
  console.log('[matter-field] packed public subpaths bundled for browsers without the TypeGPU transform plugin');
} finally {
  await rm(consumer, { recursive: true, force: true });
}
