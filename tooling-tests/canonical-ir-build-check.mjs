import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import typegpu from 'unplugin-typegpu/esbuild';

import { canonicalIrSha256 } from '../research/canonical-ir/canonical-ir.js';
import { buildDunesCanonicalIr } from '../research/canonical-ir/dunes-ir.js';
import { emitTypeGpuSource } from '../research/canonical-ir/typegpu-emitter.js';

test('canonical dunes source passes the real TypeGPU build transform', async () => {
  const ir = buildDunesCanonicalIr();
  const primitiveImport = fileURLToPath(
    new URL('../src/typegpu/primitives.js', import.meta.url),
  ).replaceAll('\\', '/');
  const source = emitTypeGpuSource(ir, { primitiveImport });
  const temporary = await mkdtemp(join(tmpdir(), 'matter-field-canonical-ir-'));
  const entry = join(temporary, 'generated-dunes.js');
  let result;
  try {
    await writeFile(entry, source, 'utf8');
    result = await build({
      entryPoints: [entry],
      bundle: true,
      write: false,
      format: 'esm',
      platform: 'neutral',
      target: 'es2022',
      external: ['typegpu', 'typegpu/*'],
      plugins: [typegpu()],
      logLevel: 'silent',
    });
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }

  assert.equal(result.outputFiles.length, 1);
  const output = result.outputFiles[0].text;
  assert.ok(output.length > 0, 'TypeGPU transform must emit a nonempty module');
  assert.match(source, new RegExp(`canonical-ir-sha256: ${canonicalIrSha256(ir)}`));
  assert.match(output, /name:\s*["']generatedDunes["']/u, 'generated function must carry TypeGPU metadata');
});
