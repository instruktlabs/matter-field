import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPORTS = join(ROOT, 'parity', 'reports');
const SCHEMAS = join(ROOT, 'schemas', 'receipts');

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

async function jsonFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) return jsonFiles(file);
    return entry.isFile() && entry.name.endsWith('.json') ? [file] : [];
  }));
  return nested.flat().sort();
}

const [commonSchema, nativeSchema, typegpuSchema, reportFiles] = await Promise.all([
  readJson(join(SCHEMAS, 'common.schema.json')),
  readJson(join(SCHEMAS, 'native-v2.schema.json')),
  readJson(join(SCHEMAS, 'typegpu-v1.schema.json')),
  jsonFiles(REPORTS),
]);

const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  // Conditional overlays inherit object types from their enclosing schema.
  strictTypes: false,
});
ajv.addSchema(commonSchema);
const validators = new Map([
  ['matter-field-gpu-parity/v2', ajv.compile(nativeSchema)],
  ['matter-field-typegpu-parity/v1', ajv.compile(typegpuSchema)],
]);

function schemaResult(receipt) {
  const validate = validators.get(receipt.schema);
  if (!validate) return { valid: false, errors: `unknown receipt schema ${receipt.schema}` };
  const valid = validate(receipt);
  return {
    valid,
    errors: valid ? '' : ajv.errorsText(validate.errors, { separator: '\n' }),
  };
}

function assertSemanticIntegrity(receipt, label) {
  assert.equal(receipt.pointCount, receipt.goldenSet.pointCount, `${label}: point counts differ`);

  for (const field of receipt.fields) {
    assert.equal(
      field.finiteSamples + field.nonFiniteCount,
      receipt.pointCount,
      `${label}: ${field.name} finite summary does not cover every point`,
    );
    assert.equal(
      field.pass,
      field.nonFiniteCount === 0 && field.maxAbs <= field.budget,
      `${label}: ${field.name} pass state disagrees with its budget/non-finite summary`,
    );
    if (field.maxAbsSample) {
      assert.equal(field.maxAbsSample.abs, field.maxAbs, `${label}: ${field.name} maxAbs sample disagrees`);
    }
    if (field.maxUlpSample) {
      assert.equal(field.maxUlpSample.ulp, field.maxUlp, `${label}: ${field.name} maxUlp sample disagrees`);
    }
  }

  assert.equal(receipt.hash.count, receipt.hash.samples.length, `${label}: hash count disagrees with samples`);
  for (const [index, sample] of receipt.hash.samples.entries()) {
    assert.equal(
      sample.exact,
      sample.cpu === sample.gpu,
      `${label}: hash sample ${index} exact state disagrees with its values`,
    );
  }
  assert.equal(
    receipt.hash.bitExact,
    receipt.hash.samples.every((sample) => sample.exact),
    `${label}: hash pass state disagrees with samples`,
  );

  const expectedPass = receipt.fields.every((field) => field.pass)
    && receipt.hash.bitExact
    && (receipt.schema !== 'matter-field-typegpu-parity/v1'
      || (receipt.migration.bitExactAtSampledPoints && receipt.three.pass))
    && !receipt.error;
  if (receipt.error) {
    assert.equal(receipt.run.softwareAdapter, true, `${label}: environment error lacks software-adapter evidence`);
  }
  assert.equal(receipt.pass, expectedPass, `${label}: top-level pass state disagrees with evidence`);
}

function assertReceipt(receipt, label) {
  const result = schemaResult(receipt);
  assert.equal(result.valid, true, `${label}:\n${result.errors}`);
  assertSemanticIntegrity(receipt, label);
}

test('every committed GPU receipt validates against its versioned schema', async () => {
  assert.ok(reportFiles.length > 0, 'expected committed receipt fixtures');
  for (const file of reportFiles) {
    const label = relative(ROOT, file).replaceAll('\\', '/');
    assertReceipt(await readJson(file), label);
  }
});

test('schemas reject receipt-family, backend, summary, hash, and identity corruption', async () => {
  const nativeFile = reportFiles.find((file) => !file.includes(`${join('reports', 'typegpu')}`)
    && file.endsWith('webgpu.json'));
  const typegpuFile = reportFiles.find((file) => file.includes(`${join('reports', 'typegpu')}`));
  assert.ok(nativeFile, 'expected a native WebGPU fixture');
  assert.ok(typegpuFile, 'expected a TypeGPU fixture');
  const native = await readJson(nativeFile);
  const typegpu = await readJson(typegpuFile);

  const corruptions = [
    ['receipt family mixup', native, (copy) => { copy.schema = 'matter-field-typegpu-parity/v1'; }],
    ['backend/adapter mixup', native, (copy) => { copy.backend = 'webgl2'; }],
    ['missing finite summary', native, (copy) => { delete copy.fields[0].finiteSamples; }],
    ['bad hash count', native, (copy) => { copy.hash.count -= 1; }],
    ['bad hash pass state', native, (copy) => { copy.hash.samples[0].exact = false; }],
    ['bad field pass state', native, (copy) => { copy.fields[0].pass = false; }],
    ['unexplained top-level failure', native, (copy) => { copy.pass = false; }],
    ['software failure missing error', native, (copy) => {
      copy.pass = false;
      copy.run.softwareAdapter = true;
    }],
    ['missing source identity', native, (copy) => { delete copy.goldenSet.sourceSha256; }],
    ['missing run identity', native, (copy) => { delete copy.run.commit; }],
    ['TypeGPU backend mixup', typegpu, (copy) => { copy.backend = 'webgl2'; }],
    ['missing TypeGPU build identity', typegpu, (copy) => { delete copy.build.probeBundleSha256; }],
  ];

  for (const [label, fixture, mutate] of corruptions) {
    const copy = structuredClone(fixture);
    mutate(copy);
    const result = schemaResult(copy);
    assert.equal(result.valid, false, `${label} unexpectedly validated`);
  }
});

test('software-adapter rejection is a valid explicit environment failure', async () => {
  const nativeFile = reportFiles.find((file) => !file.includes(`${join('reports', 'typegpu')}`));
  assert.ok(nativeFile, 'expected a native fixture');
  const receipt = await readJson(nativeFile);
  receipt.run.softwareAdapter = true;
  receipt.pass = false;
  receipt.error = 'Software GPU adapter detected; harness-only evidence.';
  assertReceipt(receipt, 'synthetic software-adapter failure');
});

test('semantic integrity rejects value/state contradictions JSON Schema cannot compare', async () => {
  const receipt = await readJson(reportFiles[0]);
  receipt.hash.samples[0].gpu = (receipt.hash.samples[0].gpu + 1) >>> 0;
  assert.equal(schemaResult(receipt).valid, true, 'structural schema should remain portable JSON Schema');
  assert.throws(
    () => assertSemanticIntegrity(receipt, 'mutated receipt'),
    /exact state disagrees with its values/,
  );
});
