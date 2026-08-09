import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolve } from 'node:path';
import { dunesField } from '../examples/dunes.js';
import { numberAdapter } from '../src/number.js';
import { handwrittenDunes } from './handwritten-dunes.mjs';
import {
  bootstrapPairedRatio,
  CELL_IDS,
  counterbalancedOrders,
  hostGateProblems,
  quantile,
  redactLocalReceiptIdentity,
  runtimeReceiptProblems,
  sameFilesystemPath,
  stabilityProblems,
  summarize,
} from './lib.mjs';

function points(count, seed = 0xabcdef) {
  let state = seed >>> 0;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  return Array.from({ length: count }, () => ({
    x: (next() * 2 - 1) * 20000,
    z: (next() * 2 - 1) * 20000,
  }));
}

test('handwritten baseline is bit-exact with the canonical number adapter', () => {
  for (const { x, z } of points(512)) {
    assert.ok(
      Object.is(handwrittenDunes(x, z), dunesField(numberAdapter, x, z)),
      `mismatch at ${x},${z}`,
    );
  }
});

test('counterbalanced schedule rows are permutations and fully balance positions', () => {
  const rows = counterbalancedOrders(CELL_IDS, CELL_IDS.length);
  for (const row of rows) assert.deepEqual([...row].sort(), [...CELL_IDS].sort());
  for (let position = 0; position < CELL_IDS.length; position++) {
    assert.deepEqual(
      rows.map((row) => row[position]).sort(),
      [...CELL_IDS].sort(),
    );
  }
});

test('summary statistics and paired bootstrap preserve exact identity', () => {
  assert.equal(quantile([1, 2, 3, 4], 0.5), 2.5);
  assert.deepEqual(summarize([1, 2, 3, 4]), {
    count: 4,
    min: 1,
    q1: 1.75,
    median: 2.5,
    q3: 3.25,
    iqr: 1.5,
    mad: 1,
    p95: 3.8499999999999996,
    p99: 3.9699999999999998,
    max: 4,
  });
  const ratio = bootstrapPairedRatio([2, 3, 4, 5, 6], [2, 3, 4, 5, 6], {
    iterations: 100,
  });
  assert.equal(ratio.estimate, 1);
  assert.deepEqual(ratio.ci95, [1, 1]);
});

test('publication host gate requires independently passing preflight and postflight', () => {
  const pass = { publicationEligible: true, reasons: [] };
  assert.deepEqual(hostGateProblems(pass, pass), []);
  assert.deepEqual(
    hostGateProblems(pass, { publicationEligible: false, reasons: ['new GPU error'] }),
    ['postflight: new GPU error'],
  );
  assert.deepEqual(
    hostGateProblems(null, pass),
    ['preflight: preflight did not produce a publication-eligible receipt'],
  );
});

test('process instability is a publication problem, not a passive warning', () => {
  const summaries = {
    stable: { processStability: { coefficientOfVariation: 0.05, threshold: 0.05, flagged: false } },
    unstable: { processStability: { coefficientOfVariation: 0.051, threshold: 0.05, flagged: true } },
  };
  assert.deepEqual(stabilityProblems({ stable: summaries.stable }), []);
  assert.deepEqual(stabilityProblems(summaries), [
    'unstable process-median CV 0.051 exceeds 0.05',
  ]);
});

test('runtime receipts must match Node, V8, executable, CLI flags, and NODE_OPTIONS', () => {
  const expected = {
    node: process.version,
    v8: process.versions.v8,
    execPath: process.execPath,
    execArgv: ['--conditions=matter-field'],
    nodeOptions: '--no-warnings',
  };
  const matchingRun = {
    cell: 'canonical-number',
    processBlock: 0,
    result: { runtime: { ...expected } },
  };
  assert.deepEqual(runtimeReceiptProblems(expected, [matchingRun]), []);
  const mismatched = {
    ...matchingRun,
    result: { runtime: { ...expected, nodeOptions: '--jitless' } },
  };
  assert.deepEqual(runtimeReceiptProblems(expected, [mismatched]), [
    'canonical-number block 0 used different NODE_OPTIONS',
  ]);
});

test('Git identity path comparison rejects a nested consumer package root', () => {
  const root = resolve('benchmark-root');
  assert.equal(sameFilesystemPath(root, resolve('benchmark-root', '.')), true);
  assert.equal(sameFilesystemPath(root, resolve('benchmark-root', 'node_modules', 'matter-field')), false);
});

test('shareable receipts omit local identity while retaining validation and runtime evidence', () => {
  const receipt = redactLocalReceiptIdentity({
    system: {
      hostname: 'private-hostname',
      platform: 'linux',
      node: 'v22.0.0',
      v8: '12.4',
      execPath: '/opt/node/bin/node',
    },
    source: {
      root: '/home/private/matter-field',
      repo: '/home/private/matter-field',
      resolvedRepo: '/home/private/matter-field',
      gitTopLevel: '/home/private/matter-field',
      rootMatchesGitTopLevel: true,
      commit: '0123456789abcdef',
      dirty: false,
    },
    benchmarkConfig: {
      targetMs: 250,
      output: '/home/private/matter-field/receipt.json',
    },
  });

  assert.deepEqual(receipt.system, {
    platform: 'linux',
    node: 'v22.0.0',
    v8: '12.4',
    execPath: '/opt/node/bin/node',
  });
  assert.deepEqual(receipt.source, {
    rootMatchesGitTopLevel: true,
    commit: '0123456789abcdef',
    dirty: false,
  });
  assert.deepEqual(receipt.benchmarkConfig, { targetMs: 250 });
  assert.doesNotMatch(JSON.stringify(receipt), /private/);
});
