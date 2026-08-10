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
  ['.svg', 'image/svg+xml'],
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

  const liveFieldLink = page.locator('header a[href="#examples"]');
  await liveFieldLink.click();
  assert.equal(new URL(page.url()).hash, '#examples', 'Live fields must open the field index instead of another route');
  assert.equal(await page.locator('.field-entry').count(), 6, 'field index must expose every field, assay, and production-lineage entry');

  const residual = page.locator('[data-field-mode="residual"]');
  await residual.click();
  assert.equal(await residual.getAttribute('aria-pressed'), 'true', 'drift contrast control must remain interactive');
  assert.equal(new URL(page.url()).pathname, '/', 'drift contrast must not navigate into a field demo');
  assert.equal(new URL(page.url()).hash, '#examples', 'drift contrast must not hijack the current index location');

  const f64Before = await page.locator('#sample-f64').textContent();
  await page.locator('#field').click({ position: { x: 84, y: 96 } });
  await page.waitForFunction((before) => document.querySelector('#sample-f64')?.textContent !== before, f64Before);
  assert.equal(new URL(page.url()).pathname, '/', 'sampling the map must not navigate into the dunes demo');

  for (const route of [
    '/examples/dunes.html',
    '/examples/swell.html',
    '/examples/wind.html',
    '/examples/serpent.html',
    '/examples/parity.html',
    '/reports/typegpu/windows-rtx3070-chrome-webgpu-2026-08-09.json',
    '/schemas/receipts/common.schema.json',
    '/schemas/receipts/native-v2.schema.json',
    '/schemas/receipts/typegpu-v1.schema.json',
    '/assets/brand/matter-field-mark.svg',
    '/assets/brand/matter-field-mark-inverse.svg',
    '/assets/brand/favicon.svg',
    '/LICENSE',
    '/THIRD_PARTY_NOTICES.md',
  ]) {
    const response = await context.request.get(`${origin}${route}`);
    assert.equal(response.status(), 200, `${route} must be present in the production artifact`);
  }

  for (const [route, current] of [
    ['/examples/dunes.html', 'dunes'],
    ['/examples/swell.html', 'swell'],
    ['/examples/wind.html', 'wind'],
    ['/examples/serpent.html', 'serpent'],
    ['/examples/parity.html', 'parity'],
  ]) {
    await page.goto(`${origin}${route}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForSelector('.field-switcher');
    assert.equal(await page.locator('.field-switcher a').count(), 6, `${route} must expose the complete field chooser`);
    assert.equal(await page.locator(`.field-switcher [data-field-route="${current}"]`).getAttribute('aria-current'), 'page');
  }

  assert.deepEqual(faults, [], `production browser faults:\n${faults.join('\n')}`);
  console.log('[matter-field] production site smoke passed (home, examples, receipts, schemas)');
} finally {
  await browser?.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}
