import { copyFile, cp, mkdir, readFile, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { makeProbeGoldenSet } from './build-gpu-probe.mjs';
import { buildTypegpu } from './build-typegpu.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const FONT_SOURCE = join(ROOT, 'node_modules', '@fontsource-variable');
const FONT_DIST = join(DIST, 'assets', 'fonts');
const BRAND_DIST = join(DIST, 'assets', 'brand');
const TYPEGPU_DIST = join(ROOT, 'dist-typegpu');
const TYPEGPU_RECEIPT = 'windows-rtx3070-chrome-webgpu-2026-08-09.json';
const REPORTS = [
  ['windowsRtx3070Webgpu', 'NVIDIA RTX 3070 · Windows', 'WebGPU', 'windows-local-webgpu.json'],
  ['windowsRtx3070Webgl2', 'NVIDIA RTX 3070 · Windows', 'WebGL2 / D3D11', 'windows-local-webgl2.json'],
  ['linuxVega10Webgpu', 'AMD Radeon Vega 10 · Linux', 'WebGPU / Vulkan', 'linux-vega10-chrome-webgpu-2026-08-09.json'],
  ['linuxVega10Webgl2', 'AMD Radeon Vega 10 · Linux', 'WebGL2 / Vulkan', 'linux-vega10-chrome-webgl2-2026-08-09.json'],
  ['linuxGtx1660TiWebgpu', 'NVIDIA GTX 1660 Ti Max-Q · Linux', 'WebGPU / Vulkan', 'linux-gtx1660ti-chrome-webgpu-2026-08-09.json'],
  ['linuxGtx1660TiWebgl2', 'NVIDIA GTX 1660 Ti Max-Q · Linux', 'WebGL2 / Vulkan', 'linux-gtx1660ti-chrome-webgl2-2026-08-09.json'],
].map(([key, label, backendLabel, file]) => ({
  key,
  label,
  backendLabel,
  file,
  path: join(ROOT, 'parity', 'reports', file),
}));

const reports = {};
for (const { key, label, backendLabel, file, path } of REPORTS) {
  try {
    reports[key] = {
      ...JSON.parse(await readFile(path, 'utf8')),
      site: { label, backendLabel, receipt: `./reports/${file}` },
    };
  } catch {
    reports[key] = null;
  }
}

const liveProbe = await makeProbeGoldenSet(300);

// Build the publishable precompiled TypeGPU bridge before the site bundle so a
// clean checkout never relies on a stale generated artifact.
await buildTypegpu({ outDir: TYPEGPU_DIST, logLevel: 'silent' });

// A production build is a complete snapshot. Remove only the repository's
// resolved dist directory so deleted source assets cannot survive locally.
await rm(DIST, { recursive: true, force: true });
await mkdir(DIST, { recursive: true });
await mkdir(join(DIST, 'reports'), { recursive: true });
await mkdir(join(DIST, 'reports', 'typegpu'), { recursive: true });
await mkdir(join(DIST, 'examples'), { recursive: true });
await mkdir(FONT_DIST, { recursive: true });
await mkdir(BRAND_DIST, { recursive: true });
const examplePages = ['dunes.html', 'swell.html', 'wind.html', 'serpent.html', 'parity.html'];
await Promise.all([
  copyFile(join(ROOT, 'site', 'index.html'), join(DIST, 'index.html')),
  copyFile(join(ROOT, 'site', 'styles.css'), join(DIST, 'styles.css')),
  copyFile(join(ROOT, 'site', 'og-preview.jpg'), join(DIST, 'og-preview.jpg')),
  copyFile(join(ROOT, 'LICENSE'), join(DIST, 'LICENSE')),
  copyFile(join(ROOT, 'THIRD_PARTY_NOTICES.md'), join(DIST, 'THIRD_PARTY_NOTICES.md')),
  cp(join(ROOT, 'schemas'), join(DIST, 'schemas'), { recursive: true }),
  cp(join(ROOT, 'site', 'assets', 'brand'), BRAND_DIST, { recursive: true }),
  copyFile(join(FONT_SOURCE, 'newsreader', 'files', 'newsreader-latin-standard-normal.woff2'), join(FONT_DIST, 'newsreader-latin-standard-normal.woff2')),
  copyFile(join(FONT_SOURCE, 'recursive', 'files', 'recursive-latin-full-normal.woff2'), join(FONT_DIST, 'recursive-latin-full-normal.woff2')),
  copyFile(join(FONT_SOURCE, 'newsreader', 'LICENSE'), join(FONT_DIST, 'newsreader-OFL.txt')),
  copyFile(join(FONT_SOURCE, 'recursive', 'LICENSE'), join(FONT_DIST, 'recursive-OFL.txt')),
  copyFile(join(ROOT, 'site', 'examples', 'demo.css'), join(DIST, 'examples', 'demo.css')),
  copyFile(join(ROOT, 'parity', 'reports', 'typegpu', TYPEGPU_RECEIPT), join(DIST, 'reports', 'typegpu', TYPEGPU_RECEIPT)),
  ...examplePages.map((name) => copyFile(join(ROOT, 'site', 'examples', name), join(DIST, 'examples', name))),
  ...REPORTS.map(async ({ path }) => {
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
