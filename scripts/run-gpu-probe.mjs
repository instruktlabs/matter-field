import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { arch, platform, release } from 'node:os';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { promisify } from 'node:util';
import { buildGpuProbe } from './build-gpu-probe.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const execFileAsync = promisify(execFile);
const packageJson = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'));
const threePackage = JSON.parse(await readFile(join(ROOT, 'node_modules', 'three', 'package.json'), 'utf8'));
const commit = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: ROOT }).then(({ stdout }) => stdout.trim()).catch(() => 'unknown');
const dirty = await execFileAsync('git', ['status', '--porcelain'], { cwd: ROOT }).then(({ stdout }) => stdout.trim().length > 0).catch(() => null);
const args = new Map();
for (const value of process.argv.slice(2)) {
  if (!value.startsWith('--')) continue;
  const [key, option = 'true'] = value.slice(2).split('=');
  args.set(key, option);
}

const backend = args.get('backend') ?? 'webgpu';
const headed = args.has('headed');
const channel = args.get('channel') ?? 'chrome';
const browserArgs = [
  '--enable-unsafe-webgpu',
  '--ignore-gpu-blocklist',
];
if (platform() === 'linux') {
  // Chrome's documented hardware-headless path on Linux. The receipt records
  // these flags and still rejects SwiftShader/llvmpipe/lavapipe below.
  browserArgs.push(
    '--use-angle=vulkan',
    '--enable-features=Vulkan',
    '--disable-vulkan-surface',
  );
}
if (args.has('no-sandbox')) browserArgs.push('--no-sandbox');
const output = resolve(args.get('output') ?? join(
  ROOT,
  'artifacts',
  'gpu-reports',
  `matter-field-${backend}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
));
if (!['webgpu', 'webgl2'].includes(backend)) throw new Error(`Unsupported backend: ${backend}`);

const built = await buildGpuProbe({ backend });
const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
]);
const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  const relative = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/+/, '');
  const file = resolve(built.outDir, relative);
  if (file !== built.outDir && !file.startsWith(`${built.outDir}${sep}`)) {
    response.writeHead(403).end('forbidden');
    return;
  }
  try {
    const body = await readFile(file);
    response.writeHead(200, { 'Content-Type': contentTypes.get(extname(file)) ?? 'application/octet-stream' });
    response.end(body);
  } catch {
    response.writeHead(404).end('not found');
  }
});
await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
const address = server.address();
const url = `http://127.0.0.1:${address.port}/`;

let browser;
try {
  browser = await chromium.launch({
    channel,
    headless: !headed,
    args: browserArgs,
  });
  const cdp = await browser.newBrowserCDPSession();
  const systemInfo = await cdp.send('SystemInfo.getInfo').catch(() => null);
  const page = await browser.newPage();
  page.on('console', (message) => {
    if (message.type() === 'error') console.error(`[browser console] ${message.text()}`);
  });
  page.on('pageerror', (error) => console.error(`[browser page] ${error.stack ?? error}`));
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  const result = await page.waitForFunction(
    () => globalThis.__MATTER_FIELD_GPU_REPORT__ ?? null,
    undefined,
    { timeout: 90_000 },
  ).then((handle) => handle.jsonValue());

  const report = {
    ...result,
    browser: {
      name: channel,
      version: browser.version(),
      userAgent: await page.evaluate(() => navigator.userAgent),
    },
    os: { platform: platform(), release: release(), arch: arch() },
    chromeGpu: {
      devices: systemInfo?.gpu?.devices ?? [],
      driverBugWorkarounds: systemInfo?.gpu?.driverBugWorkarounds ?? [],
      featureStatus: systemInfo?.gpu?.featureStatus ?? {},
    },
    run: {
      headed,
      generatedAt: new Date().toISOString(),
      node: process.version,
      package: `${packageJson.name}@${packageJson.version}`,
      three: threePackage.version,
      commit,
      dirty,
      browserArgs,
    },
  };
  const deviceText = JSON.stringify(report.chromeGpu.devices).toLowerCase();
  report.run.softwareAdapter = /swiftshader|llvmpipe|lavapipe|software/.test(deviceText);
  if (report.run.softwareAdapter && !args.has('allow-software')) {
    report.pass = false;
    report.error = 'Software GPU adapter detected; rerun on hardware or pass --allow-software for harness-only evidence.';
  }

  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`[matter-field] ${backend} probe ${report.pass ? 'PASS' : 'FAIL'}`);
  for (const field of report.fields ?? []) {
    console.log(`[matter-field] ${field.name}: maxAbs=${field.maxAbs} maxUlp=${field.maxUlp} budget=${field.budget}`);
  }
  console.log(`[matter-field] hash bit-exact=${report.hash?.bitExact ?? false}`);
  console.log(`[matter-field] report ${output}`);
  if (!report.pass) process.exitCode = 1;
} finally {
  await browser?.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}
