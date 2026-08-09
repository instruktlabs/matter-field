#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { dunesField } from '../examples/dunes.js';
import { evalWithGradient } from '../src/dual.js';
import { makeF32Adapter, numberAdapter } from '../src/number.js';
import { handwrittenDunes } from './handwritten-dunes.mjs';
import { CELL_IDS, parseInteger, parseNumber, summarize } from './lib.mjs';

const GRADIENT_X_WEIGHT = 1 / 1024;
const GRADIENT_Z_WEIGHT = 1 / 2048;

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    if (!token.startsWith('--')) throw new Error(`unexpected argument: ${token}`);
    const [rawName, inlineValue] = token.slice(2).split('=', 2);
    const value = inlineValue ?? argv[++index];
    if (value === undefined) throw new Error(`missing value for --${rawName}`);
    values[rawName] = value;
  }

  const config = {
    cell: values.cell,
    targetMs: parseNumber(values['target-ms'] ?? 250, 'target-ms', { exclusiveMin: true }),
    warmups: parseInteger(values.warmups ?? 10, 'warmups', { min: 0 }),
    samples: parseInteger(values.samples ?? 30, 'samples'),
    points: parseInteger(values.points ?? 4096, 'points', { min: 64 }),
    seed: parseInteger(values.seed ?? 0xabcdef, 'seed', { min: 0 }),
    extent: parseNumber(values.extent ?? 20000, 'extent', { exclusiveMin: true }),
    epsilon: parseNumber(values.epsilon ?? 0.01, 'epsilon', { exclusiveMin: true }),
  };
  if (!CELL_IDS.includes(config.cell)) {
    throw new Error(`--cell must be one of: ${CELL_IDS.join(', ')}`);
  }
  return config;
}

function makeInputs(count, seed, extent) {
  let state = seed >>> 0;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const x = new Float64Array(count);
  const z = new Float64Array(count);
  for (let index = 0; index < count; index++) {
    x[index] = (next() * 2 - 1) * extent;
    z[index] = (next() * 2 - 1) * extent;
  }
  const digest = createHash('sha256')
    .update(new Uint8Array(x.buffer))
    .update(new Uint8Array(z.buffer))
    .digest('hex');
  return { x, z, digest };
}

async function makeCell(cell, epsilon) {
  const canonicalValue = (x, z) => dunesField(numberAdapter, x, z);

  if (cell === 'handwritten-equivalent') {
    return {
      evaluate: handwrittenDunes,
      value: handwrittenDunes,
      semantics: 'f64 scalar; handwritten expression tree; one field evaluation',
    };
  }
  if (cell === 'canonical-number') {
    return {
      evaluate: canonicalValue,
      value: canonicalValue,
      semantics: 'f64 scalar; canonical number adapter; one field evaluation',
    };
  }
  if (cell === 'typegpu-direct') {
    const { typegpuDunes } = await import('../dist-typegpu/index.js');
    return {
      evaluate: typegpuDunes,
      value: typegpuDunes,
      semantics: 'f64 scalar CPU call; precompiled publish artifact; one field evaluation',
    };
  }
  if (cell === 'f32-emulated') {
    const adapter = makeF32Adapter();
    const value = (x, z) => dunesField(adapter, x, z);
    return {
      evaluate: value,
      value,
      semantics: 'f32-round-after-each-op diagnostic; one field evaluation',
    };
  }
  if (cell === 'dual') {
    const gradient = (x, z) => evalWithGradient(dunesField, x, z);
    return {
      evaluate: (x, z) => {
        const result = gradient(x, z);
        return result.v + result.dx * GRADIENT_X_WEIGHT + result.dz * GRADIENT_Z_WEIGHT;
      },
      value: (x, z) => gradient(x, z).v,
      semantics: 'f64 value plus analytic dx/dz; one dual field evaluation; all channels consumed',
    };
  }

  const gradient = (x, z) => {
    const center = canonicalValue(x, z);
    const dx = (
      canonicalValue(x + epsilon, z) - canonicalValue(x - epsilon, z)
    ) / (2 * epsilon);
    const dz = (
      canonicalValue(x, z + epsilon) - canonicalValue(x, z - epsilon)
    ) / (2 * epsilon);
    return { v: center, dx, dz };
  };
  return {
    evaluate: (x, z) => {
      const result = gradient(x, z);
      return result.v + result.dx * GRADIENT_X_WEIGHT + result.dz * GRADIENT_Z_WEIGHT;
    },
    value: (x, z) => gradient(x, z).v,
    semantics: `f64 value plus central dx/dz; five canonical field evaluations; epsilon=${epsilon}`,
  };
}

function runBatch(evaluate, inputs, iterations, startIndex) {
  let index = startIndex;
  let checksum = 0;
  for (let iteration = 0; iteration < iterations; iteration++) {
    const value = evaluate(inputs.x[index], inputs.z[index]);
    // The tiny deterministic weight prevents cancellation from making the
    // consumed result independent of visit order. It is common to every cell.
    checksum += value * (1 + ((iteration & 7) / 1048576));
    index++;
    if (index === inputs.x.length) index = 0;
  }
  if (!Number.isFinite(checksum)) throw new Error('benchmark checksum is non-finite');
  return checksum;
}

function timeBatch(evaluate, inputs, iterations, startIndex) {
  const start = performance.now();
  const checksum = runBatch(evaluate, inputs, iterations, startIndex);
  const elapsedMs = performance.now() - start;
  return { elapsedMs, checksum };
}

function roundUp(value, multiple) {
  return Math.ceil(value / multiple) * multiple;
}

function calibrate(evaluate, inputs, targetMs, initialIterations = inputs.x.length) {
  let iterations = roundUp(initialIterations, inputs.x.length);
  const attempts = [];
  for (let attempt = 0; attempt < 12; attempt++) {
    const result = timeBatch(evaluate, inputs, iterations, attempt * 17 % inputs.x.length);
    attempts.push({ iterations, elapsedMs: result.elapsedMs });
    if (result.elapsedMs >= targetMs * 1.1) {
      return { iterations, attempts, calibratedMs: result.elapsedMs };
    }
    const observed = Math.max(result.elapsedMs, 0.01);
    const scaled = Math.ceil(iterations * ((targetMs * 1.2) / observed));
    iterations = roundUp(Math.max(iterations * 2, scaled), inputs.x.length);
    if (!Number.isSafeInteger(iterations)) throw new Error('calibration iteration count overflowed');
  }
  throw new Error(`unable to calibrate a ${targetMs} ms batch after 12 attempts`);
}

function validateValue(value, inputs) {
  const count = Math.min(128, inputs.x.length);
  let maxAbs = 0;
  let bitExact = 0;
  for (let index = 0; index < count; index++) {
    const want = dunesField(numberAdapter, inputs.x[index], inputs.z[index]);
    const got = value(inputs.x[index], inputs.z[index]);
    if (!Number.isFinite(got)) throw new Error(`non-finite validation value at input ${index}`);
    if (Object.is(want, got)) bitExact++;
    maxAbs = Math.max(maxAbs, Math.abs(want - got));
  }
  return { sampleCount: count, bitExactCount: bitExact, maxAbs };
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  const inputs = makeInputs(config.points, config.seed, config.extent);
  const cell = await makeCell(config.cell, config.epsilon);
  const validation = validateValue(cell.value, inputs);
  const initialCalibration = calibrate(cell.evaluate, inputs, config.targetMs);

  const warmups = [];
  let consumedChecksum = 0;
  for (let index = 0; index < config.warmups; index++) {
    const result = timeBatch(
      cell.evaluate,
      inputs,
      initialCalibration.iterations,
      (index * 104729) % inputs.x.length,
    );
    warmups.push(result.elapsedMs);
    consumedChecksum += result.checksum * (index + 1);
  }

  // Re-check after the declared warm-up period: optimized JIT code can be
  // substantially faster than the calibration that preceded warm-up.
  const postWarmupCalibration = calibrate(
    cell.evaluate,
    inputs,
    config.targetMs,
    initialCalibration.iterations,
  );
  const calibration = {
    targetMs: config.targetMs,
    iterations: postWarmupCalibration.iterations,
    calibratedMs: postWarmupCalibration.calibratedMs,
    initial: initialCalibration,
    postWarmup: postWarmupCalibration,
  };

  const measurements = [];
  for (let index = 0; index < config.samples; index++) {
    const result = timeBatch(
      cell.evaluate,
      inputs,
      postWarmupCalibration.iterations,
      ((index + config.warmups) * 104729) % inputs.x.length,
    );
    const nsPerEval = result.elapsedMs * 1e6 / postWarmupCalibration.iterations;
    measurements.push({
      index,
      elapsedMs: result.elapsedMs,
      iterations: postWarmupCalibration.iterations,
      nsPerEval,
      checksum: result.checksum,
    });
    consumedChecksum += result.checksum * (index + config.warmups + 1);
  }
  if (!Number.isFinite(consumedChecksum)) throw new Error('consumed checksum is non-finite');

  const output = {
    schemaVersion: 1,
    kind: 'matter-field-cpu-benchmark-cell',
    cell: config.cell,
    pid: process.pid,
    runtime: {
      node: process.version,
      v8: process.versions.v8,
      execPath: process.execPath,
      execArgv: process.execArgv,
      nodeOptions: process.env.NODE_OPTIONS ?? null,
    },
    semantics: cell.semantics,
    config,
    input: {
      generator: 'LCG(1664525,1013904223) -> Float64Array x/z',
      sha256: inputs.digest,
    },
    validation,
    calibration,
    warmupElapsedMs: warmups,
    measurements,
    summaryNsPerEval: summarize(measurements.map((measurement) => measurement.nsPerEval)),
    consumedChecksum,
    timer: 'node:perf_hooks performance.now; wall-clock steady-state CPU batch',
  };
  process.stdout.write(`${JSON.stringify(output)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});
