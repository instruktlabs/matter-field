import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTypegpu } from './build-typegpu.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = await buildTypegpu({
  outDir: join(ROOT, 'dist-typegpu'),
  logLevel: 'info',
});

console.log(`[matter-field] publishable TypeGPU artifacts built at ${output}`);
