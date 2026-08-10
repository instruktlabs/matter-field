import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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

const EXPECTED_EXPORTS = [
  '.',
  './typegpu',
  './typegpu/three',
  './adapter-core',
  './adapter',
  './number',
  './hash',
  './dual',
  './noise',
  './backend-tsl',
  './parity',
  './parity/golden',
];

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

async function packageInstalled(root, packagePath) {
  return access(join(root, 'node_modules', ...packagePath.split('/'), 'package.json'))
    .then(() => true)
    .catch(() => false);
}

async function writePackage(root, name) {
  await writeFile(join(root, 'package.json'), `${JSON.stringify({
    name,
    private: true,
    type: 'module',
  }, null, 2)}\n`, 'utf8');
}

async function typecheck(root, entry, { skipLibCheck = false } = {}) {
  const configs = [
    {
      name: 'nodenext',
      compilerOptions: {
        target: 'ES2022',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
      },
    },
    {
      name: 'bundler',
      compilerOptions: {
        target: 'ESNext',
        module: 'ESNext',
        moduleResolution: 'Bundler',
      },
    },
  ];

  for (const config of configs) {
    const configPath = join(root, `tsconfig.${config.name}.json`);
    await writeFile(configPath, `${JSON.stringify({
      compilerOptions: {
        ...config.compilerOptions,
        lib: ['ES2022', 'DOM', 'DOM.Iterable'],
        strict: true,
        noEmit: true,
        skipLibCheck,
        // TypeScript 7 ships WebGPU declarations in lib.dom. Loading the
        // separately installed @webgpu/types package here would duplicate
        // those globals; it remains installed for the pinned ecosystem audit.
        types: [],
      },
      include: [entry],
    }, null, 2)}\n`, 'utf8');
    await execFileAsync(
      process.execPath,
      [join(root, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', configPath],
      { cwd: root, maxBuffer: 8 * 1024 * 1024 },
    );
  }
}

const packageJson = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'));
assert.deepEqual(Object.keys(packageJson.exports), EXPECTED_EXPORTS, 'package export audit');
for (const [subpath, target] of Object.entries(packageJson.exports)) {
  assert.equal(typeof target, 'object', `${subpath} must expose conditional exports`);
  assert.equal(typeof target.types, 'string', `${subpath} must expose a types condition`);
  assert.equal(typeof target.default, 'string', `${subpath} must expose a default condition`);
  assert.deepEqual(Object.keys(target).slice(0, 2), ['types', 'default'], `${subpath} types condition order`);
}

await mkdir(ARTIFACTS, { recursive: true });
const workspace = await mkdtemp(join(tmpdir(), 'matter-field-consumers-'));
const core = join(workspace, 'core');
const gpu = join(workspace, 'gpu');
await Promise.all([mkdir(core), mkdir(gpu)]);

try {
  const { stdout: packStdout } = await runNpm(
    ['pack', '--json', '--pack-destination', ARTIFACTS],
    { cwd: ROOT, maxBuffer: 8 * 1024 * 1024 },
  );
  const packed = parsePackMetadata(packStdout);
  const tarball = join(ARTIFACTS, packed.filename);
  const packedPaths = new Set((packed.files ?? []).map(({ path }) => path));
  for (const expected of [
    'dist-types/src/index.d.ts',
    'dist-types/src/adapter.d.ts',
    'dist-types/src/number.d.ts',
    'dist-types/src/hash.d.ts',
    'dist-types/src/dual.d.ts',
    'dist-types/src/noise.d.ts',
    'dist-types/src/backend-tsl.d.ts',
    'dist-types/parity/harness.d.ts',
    'dist-types/parity/golden.d.ts',
    'dist-typegpu/index.d.ts',
    'dist-typegpu/three.d.ts',
    'schemas/receipts/common.schema.json',
    'schemas/receipts/native-v2.schema.json',
    'schemas/receipts/typegpu-v1.schema.json',
  ]) {
    assert.ok(packedPaths.has(expected), `packed declaration missing: ${expected}`);
  }

  await writePackage(core, 'matter-field-core-consumer-smoke');
  await runNpm(
    ['install', '--ignore-scripts', '--no-audit', '--no-fund', tarball, 'typescript@7.0.2'],
    { cwd: core, maxBuffer: 8 * 1024 * 1024 },
  );

  for (const optionalPeer of ['three', '@types/three', 'typegpu', '@typegpu/three']) {
    assert.equal(await packageInstalled(core, optionalPeer), false, `core install pulled optional peer ${optionalPeer}`);
  }

  await writeFile(join(core, 'runtime-smoke.mjs'), `
import assert from 'node:assert/strict';
import { numberAdapter as rootNumber } from 'matter-field';
import { numberAdapter as aliasNumber } from 'matter-field/adapter-core';
import { ADAPTER_OPS } from 'matter-field/adapter';
import { makeF32Adapter } from 'matter-field/number';
import { hashU32 } from 'matter-field/hash';
import { dualInputs } from 'matter-field/dual';
import { fade } from 'matter-field/noise';
import { assayVerdict } from 'matter-field/parity';
import { makeGoldenPoints } from 'matter-field/parity/golden';

assert.equal(rootNumber.add(20, 22), 42);
assert.equal(aliasNumber, rootNumber);
assert.equal(ADAPTER_OPS.length, 15);
assert.ok(Number.isFinite(makeF32Adapter().f(1 / 3)));
assert.equal(typeof hashU32(1, 2, 3, 4), 'number');
assert.equal(dualInputs(1, 2).x.dx, 1);
assert.equal(fade(rootNumber, 0.5), 0.5);
assert.equal(assayVerdict({
  deterministic: true,
  dual: { bitExact: true, worst: null },
  f64VsF32: { maxAbs: 0, maxUlp: 0, nonFiniteCount: 0 },
  gradient: { mismatchFraction: 0, nonFiniteCount: 0 },
}).pass, true);
assert.equal(makeGoldenPoints(2).length, 2);
console.log('[matter-field] core-only runtime imports passed without optional GPU peers');
`.trimStart(), 'utf8');
  const { stdout: coreRuntimeStdout } = await execFileAsync(process.execPath, ['runtime-smoke.mjs'], {
    cwd: core,
    maxBuffer: 8 * 1024 * 1024,
  });
  process.stdout.write(coreRuntimeStdout);

  await writeFile(join(core, 'consumer-core.ts'), `
import {
  dualAdapter,
  evalWithGradient,
  numberAdapter,
  type Adapter,
  type Dual,
  type Field,
} from 'matter-field';
import { ADAPTER_OPS, numericAdapterProblems, type Adapter as AdapterFromSubpath } from 'matter-field/adapter';
import { numberAdapter as aliasNumber } from 'matter-field/adapter-core';
import { makeF32Adapter } from 'matter-field/number';
import { hashU32 } from 'matter-field/hash';
import { surfaceNormal } from 'matter-field/dual';
import { fade, fbm, pwave, stamp } from 'matter-field/noise';
import { assayVerdict, runCpuAssay, type CpuAssayReport } from 'matter-field/parity';
import { captureGolden, compareToGolden, makeGoldenPoints, type GoldenRecord } from 'matter-field/parity/golden';

const genericField = <V, L>(A: Adapter<V, L>, x: V, z: V): V => A.add(x, A.mul(z, A.f(0.25)));
const numberField: Field<number, number, [number, number]> = genericField;
const adapterAlias: AdapterFromSubpath<number, number> = numberAdapter;
const value: number = numberField(numberAdapter, 8, 4);
const gradient: Dual = evalWithGradient(genericField, 8, 4);
const normal = surfaceNormal(genericField, 8, 4);
const report: CpuAssayReport = runCpuAssay(genericField, { points: makeGoldenPoints(4), benchN: 4 });
const records: GoldenRecord[] = captureGolden((x, z) => numberField(numberAdapter, x, z), makeGoldenPoints(4));
const comparison = compareToGolden((x, z) => numberField(makeF32Adapter(), x, z), records);
const verdict = assayVerdict(report, { maxAbs: 1 });
const noiseValue: number = stamp(numberAdapter, fbm(numberAdapter, 1, 2, 0.1, 2), 1, 2, {
  cx: 0,
  cz: 0,
  rIn: 1,
  rOut: 2,
  level: fade(numberAdapter, pwave(numberAdapter, 0.5)),
});
const exactHash: number = hashU32(1, 2, 3, 4);
const ops = ADAPTER_OPS;
const problems = numericAdapterProblems(dualAdapter, (dual) => dual.v);

// @ts-expect-error number adapters reject string values
numberAdapter.add('1', 2);
// @ts-expect-error the adapter contract requires every operation
const incompleteAdapter: Adapter<number, number> = { f: (x: number) => x };

void [
  adapterAlias,
  aliasNumber,
  value,
  gradient.dx,
  normal.y,
  report.schema,
  comparison.maxAbs,
  verdict.pass,
  noiseValue,
  exactHash,
  ops,
  problems,
  incompleteAdapter,
];
`.trimStart(), 'utf8');
  await typecheck(core, 'consumer-core.ts');
  console.log('[matter-field] core-only packed TypeScript consumer passed NodeNext and Bundler with full lib checking');

  await writePackage(gpu, 'matter-field-gpu-consumer-smoke');
  await runNpm(
    [
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      tarball,
      'typegpu@0.11.9',
      '@typegpu/three@0.11.0',
      'three@0.185.1',
      '@types/three@0.185.4',
      '@webgpu/types@0.1.71',
      'typescript@7.0.2',
    ],
    { cwd: gpu, maxBuffer: 8 * 1024 * 1024 },
  );

  await writeFile(join(gpu, 'runtime-smoke.mjs'), `
import assert from 'node:assert/strict';
import tgpu from 'typegpu';
import * as tsl from 'three/tsl';
import { makeTslAdapter } from 'matter-field/backend-tsl';
import { typegpuDunes, typegpuKernels } from 'matter-field/typegpu';
import { TYPEGPU_THREE_WEBGPU_ONLY, typegpuDunesNode } from 'matter-field/typegpu/three';

assert.ok(Number.isFinite(typegpuDunes(12, -30)));
for (const [name, kernel] of Object.entries(typegpuKernels)) {
  const wgsl = tgpu.resolve({ template: 'field', externals: { field: kernel } });
  assert.match(wgsl, /fn\\s+\\w+\\(/u, name);
}
assert.equal(TYPEGPU_THREE_WEBGPU_ONLY, true);
assert.ok(typegpuDunesNode(tsl.float(1), tsl.float(2)).isNode);
assert.ok(makeTslAdapter(tsl).add(tsl.float(1), tsl.float(2)).isNode);
console.log('[matter-field] pinned GPU runtime imports, WGSL resolution, and TSL nodes passed');
`.trimStart(), 'utf8');
  const { stdout: gpuRuntimeStdout } = await execFileAsync(process.execPath, ['runtime-smoke.mjs'], {
    cwd: gpu,
    maxBuffer: 8 * 1024 * 1024,
  });
  process.stdout.write(gpuRuntimeStdout);

  await writeFile(join(gpu, 'consumer-gpu.ts'), `
import tgpu from 'typegpu';
import * as tsl from 'three/tsl';
import { makeTslAdapter, makeTslHashU32, type TslFloatNode } from 'matter-field/backend-tsl';
import { typegpuDunes, typegpuKernels, typegpuWind } from 'matter-field/typegpu';
import {
  makeNativeTslCompatibility,
  typegpuDunesNode,
  typegpuSerpentSpineNode,
  typegpuWindNode,
} from 'matter-field/typegpu/three';

const cpuHeight: number = typegpuDunes(12, -30);
const cpuWindX: number = typegpuWind(12, -30, 1).x;
const wgsl: string = tgpu.resolve({ template: 'field', externals: { field: typegpuKernels.dunes } });
const typegpuNode = typegpuDunesNode(tsl.float(1), tsl.float(2));
const scaledHeight = typegpuNode.mul(0.25);
const windNodeX = typegpuWindNode(tsl.float(1), tsl.float(2), tsl.float(3)).x;
const spineNodeY = typegpuSerpentSpineNode(tsl.float(0.5), tsl.float(3)).y;
const portableScaledHeight = makeNativeTslCompatibility(tsl).dunes(tsl.float(1), tsl.float(2)).mul(0.25);
const nativeAdapter = makeTslAdapter(tsl);
const nativeNode: TslFloatNode = nativeAdapter.add(tsl.float(1), tsl.float(2));
const hashBits = makeTslHashU32(tsl)(tsl.uint(1), tsl.uint(2), 0, 0);

// @ts-expect-error the native TSL adapter requires the Three TSL namespace
makeTslAdapter({});
// @ts-expect-error a scalar node has no z swizzle
typegpuNode.z;

void [
  cpuHeight,
  cpuWindX,
  wgsl,
  scaledHeight,
  windNodeX,
  spineNodeY,
  portableScaledHeight,
  nativeNode,
  hashBits,
];
`.trimStart(), 'utf8');

  await writeFile(join(gpu, 'consumer-native-tsl.ts'), `
import * as tsl from 'three/tsl';
import {
  makeTslAdapter,
  makeTslHashU32,
  type TslFloatNode,
  type TslUintNode,
} from 'matter-field/backend-tsl';

const adapter = makeTslAdapter(tsl);
const value: TslFloatNode = adapter.add(tsl.float(1), tsl.float(2));
const lattice: TslUintNode = adapter.latt(tsl.floor(value));
const hashBits: TslUintNode = makeTslHashU32(tsl)(lattice, lattice, 0, 0);
const scaled = value.mul(0.5);

// @ts-expect-error the adapter requires Three's complete TSL namespace
makeTslAdapter({ float: tsl.float });

void [value, lattice, hashBits, scaled];
`.trimStart(), 'utf8');
  await typecheck(gpu, 'consumer-native-tsl.ts');
  console.log('[matter-field] pinned native TSL types passed NodeNext and Bundler with full lib checking');

  // TypeGPU 0.11's own declarations do not pass upstream TypeScript 7's
  // stricter variance checks. Keep dependency lib checking scoped off here;
  // the consumer expressions still verify Matter Field's scalar/vector API.
  await typecheck(gpu, 'consumer-gpu.ts', { skipLibCheck: true });
  console.log('[matter-field] pinned TypeGPU consumer passed NodeNext and Bundler API checks');

  await writeFile(join(gpu, 'browser-entry.js'), `
import { makeTslAdapter } from 'matter-field/backend-tsl';
import { typegpuKernels } from 'matter-field/typegpu';
import { typegpuDunesNode } from 'matter-field/typegpu/three';
import * as tsl from 'three/tsl';
globalThis.__MATTER_FIELD_PACKED_SMOKE__ = [
  makeTslAdapter(tsl),
  typegpuKernels.dunes,
  typegpuDunesNode(tsl.float(1), tsl.float(2)),
];
`.trimStart(), 'utf8');
  await build({
    entryPoints: [join(gpu, 'browser-entry.js')],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    outfile: join(gpu, 'browser-bundle.js'),
    logLevel: 'silent',
  });
  console.log('[matter-field] packed public GPU subpaths bundled for browsers without repository-local resolution');
} finally {
  await rm(workspace, { recursive: true, force: true });
}
