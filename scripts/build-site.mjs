import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { makeProbeGoldenSet } from './build-gpu-probe.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const FONT_SOURCE = join(ROOT, 'node_modules', '@fontsource-variable');
const FONT_DIST = join(DIST, 'assets', 'fonts');
const REPORTS = [
  ['webgpu', join(ROOT, 'parity', 'reports', 'windows-local-webgpu.json')],
  ['webgl2', join(ROOT, 'parity', 'reports', 'windows-local-webgl2.json')],
];

const reports = {};
for (const [key, path] of REPORTS) {
  try {
    reports[key] = JSON.parse(await readFile(path, 'utf8'));
  } catch {
    reports[key] = null;
  }
}

const liveProbe = await makeProbeGoldenSet(300);

await mkdir(DIST, { recursive: true });
await mkdir(join(DIST, 'reports'), { recursive: true });
await mkdir(join(DIST, 'examples'), { recursive: true });
await mkdir(FONT_DIST, { recursive: true });
const examplePages = ['dunes.html', 'swell.html', 'wind.html', 'serpent.html', 'parity.html'];
await Promise.all([
  copyFile(join(ROOT, 'site', 'index.html'), join(DIST, 'index.html')),
  copyFile(join(ROOT, 'site', 'styles.css'), join(DIST, 'styles.css')),
  copyFile(join(ROOT, 'site', 'og-preview.jpg'), join(DIST, 'og-preview.jpg')),
  copyFile(join(FONT_SOURCE, 'newsreader', 'files', 'newsreader-latin-standard-normal.woff2'), join(FONT_DIST, 'newsreader-latin-standard-normal.woff2')),
  copyFile(join(FONT_SOURCE, 'recursive', 'files', 'recursive-latin-full-normal.woff2'), join(FONT_DIST, 'recursive-latin-full-normal.woff2')),
  copyFile(join(FONT_SOURCE, 'newsreader', 'LICENSE'), join(FONT_DIST, 'newsreader-OFL.txt')),
  copyFile(join(FONT_SOURCE, 'recursive', 'LICENSE'), join(FONT_DIST, 'recursive-OFL.txt')),
  copyFile(join(ROOT, 'site', 'examples', 'demo.css'), join(DIST, 'examples', 'demo.css')),
  ...examplePages.map((name) => copyFile(join(ROOT, 'site', 'examples', name), join(DIST, 'examples', name))),
  ...REPORTS.map(async ([, path]) => {
    try {
      await copyFile(path, join(DIST, 'reports', path.split(/[\\/]/).at(-1)));
    } catch {
      // A source checkout can build before any local hardware report exists.
    }
  }),
]);
await build({
  entryPoints: [join(ROOT, 'site', 'main.js')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2020',
  minify: true,
  outfile: join(DIST, 'app.js'),
  banner: { js: `globalThis.__MATTER_FIELD_REPORTS__=${JSON.stringify(reports)};` },
});
await build({
  entryPoints: [join(ROOT, 'site', 'examples', 'demo.js')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2020',
  minify: true,
  outfile: join(DIST, 'examples', 'demo.js'),
});
await build({
  entryPoints: [join(ROOT, 'site', 'examples', 'parity-lab.js')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  outfile: join(DIST, 'examples', 'parity-lab.js'),
  banner: { js: `globalThis.__MATTER_FIELD_PROBE_CONFIG__=${JSON.stringify({ points: liveProbe.points, goldenSet: liveProbe.identity })};` },
});
console.log(`[matter-field] site built at ${DIST}`);
