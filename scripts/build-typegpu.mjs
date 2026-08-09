import { copyFile, mkdir, rm } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import typegpu from 'unplugin-typegpu/esbuild';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_OUT = join(ROOT, 'artifacts', 'typegpu-build');

export async function buildTypegpu({ outDir = DEFAULT_OUT, logLevel = 'info' } = {}) {
  const destination = resolve(outDir);
  const artifactsRoot = join(ROOT, 'artifacts');
  const publishRoot = join(ROOT, 'dist-typegpu');
  const isScopedArtifact = destination.startsWith(`${artifactsRoot}${sep}`);
  if (destination !== publishRoot && !isScopedArtifact) {
    throw new Error(`Refusing to clean an unscoped TypeGPU build directory: ${destination}`);
  }
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  await build({
    entryPoints: {
      index: join(ROOT, 'src', 'typegpu', 'index.js'),
      three: join(ROOT, 'src', 'typegpu', 'three.js'),
    },
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    outdir: destination,
    sourcemap: true,
    external: [
      'typegpu',
      'typegpu/*',
      '@typegpu/three',
      'three',
      'three/*',
    ],
    plugins: [typegpu()],
    logLevel,
  });
  await Promise.all([
    copyFile(join(ROOT, 'src', 'typegpu', 'index.d.ts'), join(destination, 'index.d.ts')),
    copyFile(join(ROOT, 'src', 'typegpu', 'three.d.ts'), join(destination, 'three.d.ts')),
  ]);
  return destination;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const output = await buildTypegpu();
  console.log(`[matter-field] TypeGPU sources compiled at ${output}`);
}
