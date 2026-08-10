// Print the prototype identity/shape, or emit the generated TypeGPU module.
// Usage:
//   node research/canonical-ir/inspect.mjs
//   node research/canonical-ir/inspect.mjs --typegpu
//   node research/canonical-ir/inspect.mjs --verify-typegpu

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  canonicalIrOpCounts,
  canonicalIrSha256,
  serializeCanonicalIr,
} from './canonical-ir.js';
import { buildDunesCanonicalIr } from './dunes-ir.js';
import { emitTypeGpuSource } from './typegpu-emitter.js';

const ir = buildDunesCanonicalIr();
if (process.argv.includes('--verify-typegpu')) {
  const [{ build }, { default: typegpu }] = await Promise.all([
    import('esbuild'),
    import('unplugin-typegpu/esbuild'),
  ]);
  const primitiveImport = fileURLToPath(
    new URL('../../src/typegpu/primitives.js', import.meta.url),
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
  const transformed = result.outputFiles.some((file) => /name:\s*["']generatedDunes["']/u.test(file.text));
  if (!transformed) throw new Error('TypeGPU build did not transform generatedDunes');
  console.log(JSON.stringify({
    transformed,
    outputs: result.outputFiles.length,
    outputBytes: result.outputFiles.reduce((sum, file) => sum + file.contents.length, 0),
  }, null, 2));
} else if (process.argv.includes('--typegpu')) {
  process.stdout.write(emitTypeGpuSource(ir));
} else {
  const serialized = serializeCanonicalIr(ir);
  const generated = emitTypeGpuSource(ir);
  console.log(JSON.stringify({
    schema: ir.schema,
    sha256: canonicalIrSha256(ir),
    nodes: ir.nodes.length,
    operations: canonicalIrOpCounts(ir),
    serializedBytes: Buffer.byteLength(serialized),
    generatedTypeGpuBytes: Buffer.byteLength(generated),
    generatedTypeGpuLines: generated.split('\n').length,
  }, null, 2));
}
