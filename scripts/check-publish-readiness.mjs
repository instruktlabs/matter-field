import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const reportDir = join(ROOT, 'parity', 'reports');
const required = new Set(['nvidia', 'amd', 'intel', 'apple']);
const measured = new Set();

for (const name of await readdir(reportDir).catch(() => [])) {
  if (!name.endsWith('.json')) continue;
  const report = JSON.parse(await readFile(join(reportDir, name), 'utf8'));
  if (!report.pass || report.run?.softwareAdapter) continue;
  const identity = JSON.stringify({ adapter: report.adapter, chromeGpu: report.chromeGpu }).toLowerCase();
  for (const vendor of required) if (identity.includes(vendor)) measured.add(vendor);
}

const missing = [...required].filter((vendor) => !measured.has(vendor));
if (missing.length > 0) {
  console.error(`[matter-field] npm publication is intentionally gated; missing real hardware receipts: ${missing.join(', ')}`);
  process.exit(1);
}

console.log('[matter-field] hardware receipt gate satisfied');
