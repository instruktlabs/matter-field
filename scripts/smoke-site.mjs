#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const types = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.md', 'text/markdown; charset=utf-8'],
  ['.jpg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.woff2', 'font/woff2'],
]);

function fileForRequest(requestUrl) {
  const url = new URL(requestUrl ?? '/', 'http://127.0.0.1');
  const pathname = decodeURIComponent(url.pathname);
  const relative = pathname.endsWith('/')
    ? `${pathname.replace(/^\/+|\/+$/g, '')}${pathname === '/' ? '' : '/'}index.html`
    : pathname.replace(/^\/+/, '');
  const file = resolve(ROOT, relative);
  return file === ROOT || file.startsWith(`${ROOT}${sep}`) ? file : null;
}

const server = createServer(async (request, response) => {
  const file = fileForRequest(request.url);
  if (!file) {
    response.writeHead(403).end('forbidden');
    return;
  }
  try {
    const body = await readFile(file);
    response.writeHead(200, { 'Content-Type': types.get(extname(file)) ?? 'application/octet-stream' });
    response.end(body);
  } catch {
    response.writeHead(404).end('not found');
  }
});

await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
const address = server.address();
const origin = `http://127.0.0.1:${address.port}`;
let browser;

try {
  browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader'],
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const faults = [];
  page.on('pageerror', (error) => faults.push(`pageerror: ${error}`));
  page.on('console', (message) => {
    if (message.type() === 'error') faults.push(`console: ${message.text()}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400) faults.push(`http ${response.status()}: ${response.url()}`);
  });

  await page.goto(`${origin}/`, { waitUntil: 'networkidle', timeout: 30_000 });
  assert.equal(await page.locator('a[href="./fieldwork/"]').count() > 0, true, 'home page must link FIELDWORK');

  for (const route of [
    '/fieldwork/',
    '/examples/dunes.html',
    '/examples/swell.html',
    '/examples/wind.html',
    '/examples/serpent.html',
    '/examples/parity.html',
    '/reports/typegpu/windows-rtx3070-chrome-webgpu-2026-08-09.json',
    '/fieldwork/assets/manifest.json',
    '/fieldwork/assets/ui/fieldwork-sigil.webp',
    '/LICENSE',
    '/THIRD_PARTY_NOTICES.md',
  ]) {
    const response = await context.request.get(`${origin}${route}`);
    assert.equal(response.status(), 200, `${route} must be present in the production artifact`);
  }

  await page.goto(`${origin}/fieldwork/?backend=webgl2`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForFunction(() => globalThis.__FIELDWORK__ ?? null, null, { timeout: 90_000 });
  let state = JSON.parse(await page.evaluate(() => globalThis.render_game_to_text()));
  assert.equal(state.renderer, 'webgl2');
  assert.equal(state.materializer, 'native-tsl-webgl2');
  assert.equal(state.phase, 'briefing');

  await page.click('#start-game');
  await page.waitForFunction(() => {
    const audio = globalThis.__FIELDWORK__?.game?.audio;
    return !audio?.supported || (audio.context?.state === 'running' && audio.loops?.size === 2);
  }, null, { timeout: 10_000 });
  const audio = await page.evaluate(() => ({
    supported: globalThis.__FIELDWORK__.game.audio.supported,
    contextState: globalThis.__FIELDWORK__.game.audio.context?.state ?? 'unsupported',
    loopCount: globalThis.__FIELDWORK__.game.audio.loops?.size ?? 0,
  }));
  if (audio.supported) {
    assert.equal(audio.contextState, 'running', 'audio must unlock from the start gesture');
    assert.equal(audio.loopCount, 2, 'procedural ambience and engine loops must start exactly once');
  }
  await page.evaluate(() => globalThis.advanceTime(1000));
  state = JSON.parse(await page.evaluate(() => globalThis.render_game_to_text()));
  assert.equal(state.phase, 'running');
  assert.ok(state.ticks >= 59, 'fixed-step hook must advance the game');
  assert.equal(state.readbacksPerFrame, 0);

  await page.click('#pause-game');
  assert.equal((await page.evaluate(() => globalThis.__FIELDWORK__.game.audio.loops.size)), 2, 'pause must not stack procedural loops');
  await page.click('#pause-game');
  assert.equal((await page.evaluate(() => globalThis.__FIELDWORK__.game.audio.loops.size)), 2, 'resume must reuse procedural loops');
  await page.click('#mute-game');
  assert.equal((await page.evaluate(() => globalThis.__FIELDWORK__.game.audio.muted)), true, 'mute control must reach audio state');
  await page.click('#mute-game');
  assert.equal((await page.evaluate(() => globalThis.__FIELDWORK__.game.audio.muted)), false, 'mute control must restore audio state');

  await page.click('#fault-game');
  state = JSON.parse(await page.evaluate(() => globalThis.render_game_to_text()));
  assert.equal(state.authority, 'deliberately-stale-coarse-cpu-proxy');

  await page.evaluate(() => globalThis.__FIELDWORK__.game.handleDeviceLoss({ reason: 'production-smoke' }));
  state = JSON.parse(await page.evaluate(() => globalThis.render_game_to_text()));
  assert.equal(state.phase, 'device-lost');
  assert.equal(await page.locator('#result').isVisible(), true);

  assert.deepEqual(faults, [], `production browser faults:\n${faults.join('\n')}`);
  console.log('[matter-field] production site smoke passed (home, assets, procedural audio, WebGL2 game, fixed-step, fault, device loss)');
} finally {
  await browser?.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}
