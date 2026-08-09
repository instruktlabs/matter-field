import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export const CELL_IDS = Object.freeze([
  'handwritten-equivalent',
  'canonical-number',
  'typegpu-direct',
  'f32-emulated',
  'dual',
  'central-finite-difference',
]);

export function quantile(values, q) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * q;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

export function summarize(values) {
  if (values.length === 0) return null;
  const median = quantile(values, 0.5);
  const q1 = quantile(values, 0.25);
  const q3 = quantile(values, 0.75);
  return {
    count: values.length,
    min: Math.min(...values),
    q1,
    median,
    q3,
    iqr: q3 - q1,
    mad: quantile(values.map((value) => Math.abs(value - median)), 0.5),
    p95: quantile(values, 0.95),
    p99: quantile(values, 0.99),
    max: Math.max(...values),
  };
}

function makeLcg(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function bootstrapPairedRatio(cellValues, baselineValues, {
  iterations = 10000,
  seed = 0x51f15e,
} = {}) {
  if (cellValues.length !== baselineValues.length || cellValues.length === 0) {
    throw new Error('paired bootstrap requires equally sized non-empty arrays');
  }
  const pairs = cellValues.map((value, index) => ({
    cell: value,
    baseline: baselineValues[index],
  }));
  const observedRatios = pairs.map(({ cell, baseline }) => cell / baseline);
  const random = makeLcg(seed);
  const bootstrapped = new Array(iterations);

  for (let iteration = 0; iteration < iterations; iteration++) {
    const ratios = new Array(pairs.length);
    for (let i = 0; i < pairs.length; i++) {
      const pair = pairs[Math.floor(random() * pairs.length)];
      ratios[i] = pair.cell / pair.baseline;
    }
    bootstrapped[iteration] = quantile(ratios, 0.5);
  }

  return {
    direction: 'cell_ns_per_eval / handwritten_ns_per_eval',
    estimate: quantile(observedRatios, 0.5),
    ci95: [quantile(bootstrapped, 0.025), quantile(bootstrapped, 0.975)],
    pairedProcessBlocks: pairs.length,
    bootstrapIterations: iterations,
    observedRatios,
  };
}

// Williams-style balanced Latin-square rows. With all n rows, every cell
// occupies every position once; prefixes remain deterministic and broadly
// counterbalanced when the configured process count is not a multiple of n.
export function counterbalancedOrders(cells, processCount) {
  const n = cells.length;
  if (n < 2) return Array.from({ length: processCount }, () => [...cells]);
  const rows = [];
  for (let row = 0; row < processCount; row++) {
    const offset = row % n;
    const indices = [offset];
    for (let position = 1; position < n; position++) {
      const delta = Math.ceil(position / 2);
      const index = position % 2 === 1
        ? (offset + delta) % n
        : (offset - delta + n) % n;
      indices.push(index);
    }
    rows.push(indices.map((index) => cells[index]));
  }
  return rows;
}

export function sameFilesystemPath(left, right, platform = process.platform) {
  if (!left || !right) return false;
  const normalize = (value) => {
    const absolute = resolve(value);
    return platform === 'win32' ? absolute.toLowerCase() : absolute;
  };
  return normalize(left) === normalize(right);
}

// Receipt files are intended to be shareable. The benchmark may use these
// values locally to establish source identity, but they are not evidence and
// must not disclose the machine name or checkout/output locations.
export function redactLocalReceiptIdentity(receipt) {
  const redacted = { ...receipt };
  if (receipt.system) {
    const { hostname: _hostname, ...system } = receipt.system;
    redacted.system = system;
  }
  if (receipt.source) {
    const {
      root: _root,
      repo: _repo,
      resolvedRepo: _resolvedRepo,
      gitTopLevel: _gitTopLevel,
      ...source
    } = receipt.source;
    redacted.source = source;
  }
  if (receipt.benchmarkConfig) {
    const { output: _output, ...benchmarkConfig } = receipt.benchmarkConfig;
    redacted.benchmarkConfig = benchmarkConfig;
  }
  return redacted;
}

export function hostGateProblems(preflight, postflight) {
  const problems = [];
  for (const [phase, receipt] of [['preflight', preflight], ['postflight', postflight]]) {
    if (receipt?.publicationEligible) continue;
    const reasons = receipt?.reasons?.length
      ? receipt.reasons
      : [`${phase} did not produce a publication-eligible receipt`];
    for (const reason of reasons) problems.push(`${phase}: ${reason}`);
  }
  return problems;
}

export function stabilityProblems(summaries) {
  const problems = [];
  for (const [cell, summary] of Object.entries(summaries)) {
    const stability = summary?.processStability;
    if (!stability || !Number.isFinite(stability.coefficientOfVariation)) {
      problems.push(`${cell} has no finite process-stability receipt`);
      continue;
    }
    if (stability.flagged || stability.coefficientOfVariation > stability.threshold) {
      problems.push(
        `${cell} process-median CV ${stability.coefficientOfVariation} exceeds ${stability.threshold}`,
      );
    }
  }
  return problems;
}

export function runtimeReceiptProblems(expected, runs) {
  const problems = [];
  const expectedArgs = JSON.stringify(expected.execArgv ?? []);
  for (const run of runs) {
    const runtime = run.result?.runtime;
    const label = `${run.cell} block ${run.processBlock}`;
    if (!runtime) {
      problems.push(`${label} has no child runtime receipt`);
      continue;
    }
    if (runtime.node !== expected.node) problems.push(`${label} used a different Node version`);
    if (runtime.v8 !== expected.v8) problems.push(`${label} used a different V8 version`);
    if (!sameFilesystemPath(runtime.execPath, expected.execPath)) {
      problems.push(`${label} used a different Node executable`);
    }
    if (JSON.stringify(runtime.execArgv ?? []) !== expectedArgs) {
      problems.push(`${label} used different Node CLI flags`);
    }
    if ((runtime.nodeOptions ?? null) !== (expected.nodeOptions ?? null)) {
      problems.push(`${label} used different NODE_OPTIONS`);
    }
  }
  return problems;
}

export function parseInteger(value, name, { min = 1 } = {}) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min) {
    throw new Error(`${name} must be an integer >= ${min}; received ${value}`);
  }
  return parsed;
}

export function parseNumber(value, name, { min = 0, exclusiveMin = false } = {}) {
  const parsed = Number(value);
  const invalidMin = exclusiveMin ? parsed <= min : parsed < min;
  if (!Number.isFinite(parsed) || invalidMin) {
    const relation = exclusiveMin ? '>' : '>=';
    throw new Error(`${name} must be finite and ${relation} ${min}; received ${value}`);
  }
  return parsed;
}

export async function sha256File(path) {
  try {
    const bytes = await readFile(path);
    return createHash('sha256').update(bytes).digest('hex');
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}
