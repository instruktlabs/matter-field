import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium, firefox, webkit } from 'playwright';
import { makeGoldenPoints } from '../parity/golden.js';
import { cpuFieldBits } from './cpu-browser-parity-core.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'artifacts', 'cpu-browser-parity');
const browserArg = process.argv.find((arg) => arg.startsWith('--browsers='));
const requested = (browserArg?.slice('--browsers='.length) ?? 'chromium,firefox,webkit').split(',');
const GOLDEN_SHA256 = 'db340c484b206d57f05512bd04494731b976e93984368e9fb6d4d6d4bcbb68cc';
const points = makeGoldenPoints(300).map((point) => ({ ...point, x: Math.fround(point.x), z: Math.fround(point.z) }));
const expected = cpuFieldBits(points);
const nodeSha256 = createHash('sha256').update(JSON.stringify(expected)).digest('hex');
if (nodeSha256 !== GOLDEN_SHA256) {
  throw new Error(`Node CPU values do not match committed golden: ${nodeSha256}`);
}

await mkdir(OUT, { recursive: true });
await Promise.all([
  build({
    entryPoints: [join(ROOT, 'scripts', 'cpu-browser-parity-page.js')],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    outfile: join(OUT, 'page.js'),
    banner: { js: `globalThis.__MATTER_FIELD_CPU_POINTS__=${JSON.stringify(points)};` },
  }),
  build({
    entryPoints: [join(ROOT, 'scripts', 'cpu-browser-parity-worker.js')],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2020',
    outfile: join(OUT, 'worker.js'),
  }),
]);
await writeFile(join(OUT, 'index.html'), '<!doctype html><meta charset="utf-8"><title>matter-field CPU parity</title><script type="module" src="./page.js"></script>', 'utf8');

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  const relative = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/+/, '');
  const file = resolve(OUT, relative);
  if (file !== OUT && !file.startsWith(`${OUT}${sep}`)) { response.writeHead(403).end(); return; }
  try {
    const body = await readFile(file);
    response.writeHead(200, { 'Content-Type': extname(file) === '.js' ? 'text/javascript' : 'text/html' });
    response.end(body);
  } catch { response.writeHead(404).end(); }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const url = `http://127.0.0.1:${server.address().port}/`;

const launchers = {
  chromium: () => chromium.launch({ headless: true }),
  chrome: () => chromium.launch({ channel: 'chrome', headless: true }),
  firefox: () => firefox.launch({ headless: true }),
  webkit: () => webkit.launch({ headless: true }),
};
const reports = [];
try {
  for (const name of requested) {
    if (!launchers[name]) throw new Error(`Unknown browser ${name}`);
    const browser = await launchers[name]();
    try {
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      const actual = await page.waitForFunction(() => globalThis.__MATTER_FIELD_CPU_PARITY__ ?? null, undefined, { timeout: 30_000 }).then((handle) => handle.jsonValue());
      const mainBitExact = JSON.stringify(actual.main) === JSON.stringify(expected);
      const workerBitExact = JSON.stringify(actual.worker) === JSON.stringify(expected);
      const typegpuMainBitExact = JSON.stringify(actual.typegpuMain) === JSON.stringify(expected);
      const typegpuWorkerBitExact = JSON.stringify(actual.typegpuWorker) === JSON.stringify(expected);
      const report = {
        browser: name,
        version: browser.version(),
        userAgent: actual.userAgent,
        mainBitExact,
        workerBitExact,
        typegpuMainBitExact,
        typegpuWorkerBitExact,
        pointCount: points.length,
        goldenSha256: GOLDEN_SHA256,
        pass: mainBitExact && workerBitExact && typegpuMainBitExact && typegpuWorkerBitExact,
      };
      reports.push(report);
      console.log(`[matter-field] ${name} adapter-main=${mainBitExact ? 'exact' : 'DIFF'} adapter-worker=${workerBitExact ? 'exact' : 'DIFF'} typegpu-main=${typegpuMainBitExact ? 'exact' : 'DIFF'} typegpu-worker=${typegpuWorkerBitExact ? 'exact' : 'DIFF'}`);
    } finally {
      await browser.close();
    }
  }
} finally {
  await new Promise((done) => server.close(done));
}

await writeFile(join(OUT, 'report.json'), `${JSON.stringify({ schema: 'matter-field-cpu-browser-parity/v1', node: process.version, reports }, null, 2)}\n`, 'utf8');
if (reports.some((report) => !report.pass)) process.exitCode = 1;
