#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  bootstrapPairedRatio,
  CELL_IDS,
  counterbalancedOrders,
  hostGateProblems,
  parseInteger,
  parseNumber,
  redactLocalReceiptIdentity,
  runtimeReceiptProblems,
  sameFilesystemPath,
  sha256File,
  stabilityProblems,
  summarize,
} from './lib.mjs';

const BENCHMARK_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(BENCHMARK_DIR, '..');
const CELL_SCRIPT = join(BENCHMARK_DIR, 'cell.mjs');
const PREFLIGHT_SCRIPT = join(BENCHMARK_DIR, 'linux-preflight.sh');

function usage() {
  return `matter-field publication CPU benchmark

Usage: node benchmarks/run-cpu.mjs [options]

  --cells <csv>          ${CELL_IDS.join(',')} (default: all)
  --target-ms <number>   calibrated batch target (default: 250)
  --warmups <integer>    warm-up batches per process (default: 10)
  --samples <integer>    measured batches per process (default: 30)
  --processes <integer>  fresh process blocks per cell (default: 5)
  --points <integer>     pre-generated deterministic inputs (default: 4096)
  --seed <integer>       unsigned deterministic input seed (default: 11259375)
  --extent <number>      coordinate half-extent (default: 20000)
  --epsilon <number>     central-difference epsilon (default: 0.01)
  --bootstrap <integer>  paired bootstrap iterations (default: 10000)
  --preflight <mode>     auto, required, or skip (default: auto)
  --output <path|->      raw JSON path; '-' writes JSON to stdout (default: -)
  --help                 show this message
`;
}

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    if (token === '--help') return { help: true };
    if (!token.startsWith('--')) throw new Error(`unexpected argument: ${token}`);
    const [name, inlineValue] = token.slice(2).split('=', 2);
    const value = inlineValue ?? argv[++index];
    if (value === undefined) throw new Error(`missing value for --${name}`);
    values[name] = value;
  }

  const cells = (values.cells ?? CELL_IDS.join(','))
    .split(',')
    .map((cell) => cell.trim())
    .filter(Boolean);
  if (cells.length === 0 || new Set(cells).size !== cells.length) {
    throw new Error('--cells must contain one or more unique cell IDs');
  }
  for (const cell of cells) {
    if (!CELL_IDS.includes(cell)) throw new Error(`unknown cell: ${cell}`);
  }

  const preflight = values.preflight ?? 'auto';
  if (!['auto', 'required', 'skip'].includes(preflight)) {
    throw new Error('--preflight must be auto, required, or skip');
  }
  return {
    help: false,
    cells,
    targetMs: parseNumber(values['target-ms'] ?? 250, 'target-ms', { exclusiveMin: true }),
    warmups: parseInteger(values.warmups ?? 10, 'warmups', { min: 0 }),
    samples: parseInteger(values.samples ?? 30, 'samples'),
    processes: parseInteger(values.processes ?? 5, 'processes'),
    points: parseInteger(values.points ?? 4096, 'points', { min: 64 }),
    seed: parseInteger(values.seed ?? 0xabcdef, 'seed', { min: 0 }),
    extent: parseNumber(values.extent ?? 20000, 'extent', { exclusiveMin: true }),
    epsilon: parseNumber(values.epsilon ?? 0.01, 'epsilon', { exclusiveMin: true }),
    bootstrap: parseInteger(values.bootstrap ?? 10000, 'bootstrap'),
    preflight,
    output: values.output ?? '-',
  };
}

function run(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? ROOT,
      env: options.env ?? process.env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code, signal) => resolvePromise({ code, signal, stdout, stderr }));
  });
}

async function git(args) {
  const result = await run('git', args);
  return result.code === 0 ? result.stdout.trim() : null;
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function dependencyVersion(name) {
  const packagePath = join(ROOT, 'node_modules', ...name.split('/'), 'package.json');
  return (await readJson(packagePath))?.version ?? null;
}

function sanitizeRemote(remote) {
  if (!remote) return null;
  try {
    const parsed = new URL(remote);
    if (!['http:', 'https:', 'ssh:', 'git:', 'git+ssh:'].includes(parsed.protocol)) return null;
    parsed.username = '';
    parsed.password = '';
    return parsed.toString();
  } catch {
    // Normalize an SCP-style remote without retaining its local SSH username.
    const scp = remote.match(/^(?:[^/@:\s]+@)?([^/:\s]+):([^\s]+)$/);
    return scp ? `ssh://${scp[1]}/${scp[2]}` : null;
  }
}

async function processAffinity() {
  if (process.platform !== 'linux') return null;
  try {
    const status = await readFile('/proc/self/status', 'utf8');
    return status.match(/^Cpus_allowed_list:\s*(.+)$/m)?.[1]?.trim() ?? null;
  } catch {
    return null;
  }
}

async function collectMetadata(config) {
  const packageJson = await readJson(join(ROOT, 'package.json'));
  const gitTopLevel = await git(['rev-parse', '--show-toplevel']);
  const rootMatchesGitTopLevel = sameFilesystemPath(gitTopLevel, ROOT);
  const status = rootMatchesGitTopLevel
    ? await git(['status', '--porcelain=v1', '--untracked-files=all'])
    : null;
  const hashTargets = [
    'package.json',
    'package-lock.json',
    'examples/dunes.js',
    'src/number.js',
    'src/dual.js',
    'src/noise.js',
    'src/hash.js',
    'src/typegpu/fields.js',
    'src/typegpu/primitives.js',
    'scripts/build-typegpu.mjs',
    'scripts/build-typegpu-package.mjs',
    'dist-typegpu/index.js',
    'benchmarks/handwritten-dunes.mjs',
    'benchmarks/lib.mjs',
    'benchmarks/cell.mjs',
    'benchmarks/run-cpu.mjs',
    'benchmarks/linux-preflight.sh',
    'benchmarks/self-test.mjs',
  ];
  const hashes = {};
  for (const target of hashTargets) hashes[target] = await sha256File(join(ROOT, target));
  const cpuModels = [...new Set(os.cpus().map((cpu) => cpu.model))];

  return redactLocalReceiptIdentity({
    capturedAt: new Date().toISOString(),
    system: {
      platform: os.platform(),
      release: os.release(),
      arch: os.arch(),
      logicalCpuCount: os.cpus().length,
      cpuModels,
      totalMemoryBytes: os.totalmem(),
      uptimeSeconds: os.uptime(),
      node: process.version,
      v8: process.versions.v8,
      execPath: process.execPath,
      execArgv: process.execArgv,
      nodeOptions: process.env.NODE_OPTIONS ?? null,
      processCpuAffinity: await processAffinity(),
    },
    package: {
      name: packageJson?.name ?? null,
      version: packageJson?.version ?? null,
      dependencies: {
        typegpu: await dependencyVersion('typegpu'),
        '@typegpu/three': await dependencyVersion('@typegpu/three'),
        three: await dependencyVersion('three'),
        'unplugin-typegpu': await dependencyVersion('unplugin-typegpu'),
      },
    },
    source: {
      rootMatchesGitTopLevel,
      available: rootMatchesGitTopLevel,
      statusAvailable: rootMatchesGitTopLevel && status !== null,
      commit: rootMatchesGitTopLevel ? await git(['rev-parse', 'HEAD']) : null,
      branch: rootMatchesGitTopLevel ? await git(['branch', '--show-current']) : null,
      dirty: !rootMatchesGitTopLevel || status === null || Boolean(status),
      porcelain: status ? status.split(/\r?\n/) : [],
      origin: rootMatchesGitTopLevel
        ? sanitizeRemote(await git(['remote', 'get-url', 'origin']))
        : null,
      hashes,
    },
    benchmarkConfig: config,
  });
}

async function runPreflight(mode, expectedCommit, phase) {
  if (mode === 'skip') {
    return { phase, ran: false, publicationEligible: false, reasons: ['Linux preflight explicitly skipped'] };
  }
  if (process.platform !== 'linux') {
    if (mode === 'required') throw new Error('required Linux preflight cannot run on this platform');
    return {
      phase,
      ran: false,
      publicationEligible: false,
      reasons: [`Linux preflight unavailable on ${process.platform}`],
    };
  }

  const args = [
    PREFLIGHT_SCRIPT,
    '--json',
    '--repo', ROOT,
  ];
  if (expectedCommit) args.push('--expect', expectedCommit);
  const result = await run('bash', args, {
    env: { ...process.env, MF_ALLOWED_NODE_PROCESSES: '1' },
  });
  if (result.code !== 0) {
    const message = `Linux preflight failed (${result.code}): ${result.stderr.trim() || result.stdout.trim()}`;
    if (mode === 'required') throw new Error(message);
    return { phase, ran: true, publicationEligible: false, reasons: [message] };
  }
  try {
    return {
      phase,
      ran: true,
      ...redactLocalReceiptIdentity(JSON.parse(result.stdout)),
    };
  } catch {
    throw new Error(`Linux preflight emitted invalid JSON: ${result.stdout.slice(0, 500)}`);
  }
}

async function runCell(cell, config) {
  const args = [
    ...process.execArgv,
    CELL_SCRIPT,
    '--cell', cell,
    '--target-ms', String(config.targetMs),
    '--warmups', String(config.warmups),
    '--samples', String(config.samples),
    '--points', String(config.points),
    '--seed', String(config.seed),
    '--extent', String(config.extent),
    '--epsilon', String(config.epsilon),
  ];
  const result = await run(process.execPath, args);
  if (result.code !== 0) {
    throw new Error(`cell ${cell} failed (${result.code}): ${result.stderr.trim() || result.stdout.trim()}`);
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error(`cell ${cell} emitted invalid JSON: ${result.stdout.slice(0, 500)}`);
  }
}

function summarizeRuns(runs, config) {
  const cells = {};
  for (const cell of config.cells) {
    const cellRuns = runs.filter((run) => run.cell === cell);
    const processMedians = cellRuns.map((run) => run.result.summaryNsPerEval.median);
    const allMeasurements = cellRuns.flatMap((run) => (
      run.result.measurements.map((measurement) => measurement.nsPerEval)
    ));
    const mean = processMedians.reduce((sum, value) => sum + value, 0) / processMedians.length;
    const variance = processMedians.length > 1
      ? processMedians.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (processMedians.length - 1)
      : 0;
    const coefficientOfVariation = mean === 0 ? 0 : Math.sqrt(variance) / mean;
    cells[cell] = {
      semantics: cellRuns[0]?.result.semantics ?? null,
      processMediansNsPerEval: processMedians,
      processMedianSummaryNsPerEval: summarize(processMedians),
      allBatchSummaryNsPerEval: summarize(allMeasurements),
      processStability: {
        coefficientOfVariation,
        threshold: 0.05,
        flagged: coefficientOfVariation > 0.05,
      },
      validation: cellRuns.map((run) => run.result.validation),
    };
  }

  if (cells['handwritten-equivalent']) {
    const baselineByBlock = new Map(
      runs
        .filter((run) => run.cell === 'handwritten-equivalent')
        .map((run) => [run.processBlock, run.result.summaryNsPerEval.median]),
    );
    for (const cell of config.cells) {
      const cellRuns = runs
        .filter((run) => run.cell === cell)
        .sort((a, b) => a.processBlock - b.processBlock);
      const cellValues = [];
      const baselineValues = [];
      for (const run of cellRuns) {
        if (!baselineByBlock.has(run.processBlock)) continue;
        cellValues.push(run.result.summaryNsPerEval.median);
        baselineValues.push(baselineByBlock.get(run.processBlock));
      }
      cells[cell].pairedRatioToHandwritten = bootstrapPairedRatio(cellValues, baselineValues, {
        iterations: config.bootstrap,
        seed: (config.seed ^ (CELL_IDS.indexOf(cell) + 1) * 0x9e3779b9) >>> 0,
      });
    }
  }
  return cells;
}

function classify(config, metadata, preflight, postflight, runs, summaries) {
  const reasons = [];
  if (config.targetMs < 250) reasons.push('target batch duration is below 250 ms');
  if (config.warmups < 10) reasons.push('fewer than 10 warm-up batches');
  if (config.samples < 30) reasons.push('fewer than 30 measured batches');
  if (config.processes < 5) reasons.push('fewer than 5 fresh processes per cell');
  if (config.bootstrap < 10000) reasons.push('fewer than 10000 bootstrap resamples');
  if (config.cells.length !== CELL_IDS.length || CELL_IDS.some((cell) => !config.cells.includes(cell))) {
    reasons.push('not all required benchmark cells were run');
  }
  if (metadata.source.dirty) reasons.push('source checkout is dirty');
  if (!metadata.source.rootMatchesGitTopLevel) {
    reasons.push('harness root is not the exact Git worktree top level');
  }
  if (!metadata.source.statusAvailable) reasons.push('source status is unavailable');
  if (!metadata.source.commit) reasons.push('source commit is unavailable');
  if (!metadata.source.hashes['dist-typegpu/index.js']) reasons.push('precompiled TypeGPU artifact is missing');
  reasons.push(...hostGateProblems(preflight, postflight));
  if (!/^\d+$/.test(metadata.system.processCpuAffinity ?? '')) {
    reasons.push('benchmark process is not pinned to one logical CPU');
  }
  for (const run of runs) {
    if (run.result.calibration.calibratedMs < config.targetMs) {
      reasons.push(`${run.cell} block ${run.processBlock} calibrated below target`);
    }
    if (run.result.measurements.some((measurement) => measurement.elapsedMs < config.targetMs)) {
      reasons.push(`${run.cell} block ${run.processBlock} contains a measured batch below target duration`);
    }
    const validation = run.result.validation;
    if (run.cell !== 'f32-emulated' && validation.maxAbs !== 0) {
      reasons.push(`${run.cell} block ${run.processBlock} was not f64-oracle exact`);
    }
  }
  reasons.push(...runtimeReceiptProblems({
    node: metadata.system.node,
    v8: metadata.system.v8,
    execPath: metadata.system.execPath,
    execArgv: metadata.system.execArgv,
    nodeOptions: metadata.system.nodeOptions,
  }, runs));
  reasons.push(...stabilityProblems(summaries));
  return {
    classification: reasons.length === 0 ? 'publication-candidate' : 'exploratory-only',
    publicationEligible: reasons.length === 0,
    reasons: [...new Set(reasons)],
  };
}

async function emitOutput(report, output) {
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (output === '-') {
    process.stdout.write(json);
    return;
  }
  const path = resolve(output);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, json, 'utf8');
  process.stdout.write(`${JSON.stringify({
    kind: report.kind,
    outputWritten: true,
    classification: report.acceptance.classification,
  })}\n`);
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  if (config.help) {
    process.stdout.write(usage());
    return;
  }

  const metadata = await collectMetadata(config);
  const preflight = await runPreflight(config.preflight, metadata.source.commit, 'preflight');
  const orders = counterbalancedOrders(config.cells, config.processes);
  const runs = [];

  for (let processBlock = 0; processBlock < orders.length; processBlock++) {
    const order = orders[processBlock];
    for (let orderPosition = 0; orderPosition < order.length; orderPosition++) {
      const cell = order[orderPosition];
      process.stderr.write(
        `[matter-field bench] block ${processBlock + 1}/${orders.length}, `
        + `position ${orderPosition + 1}/${order.length}: ${cell}\n`,
      );
      const result = await runCell(cell, config);
      runs.push({ processBlock, orderPosition, cell, result });
    }
  }

  const postflight = await runPreflight(config.preflight, metadata.source.commit, 'postflight');
  const summaries = summarizeRuns(runs, config);

  const report = {
    schemaVersion: 1,
    kind: 'matter-field-publication-cpu-benchmark',
    metadata,
    preflight,
    postflight,
    design: {
      inputPolicy: 'pre-generated deterministic Float64 inputs; common checksum sink',
      isolation: 'one fresh subprocess per cell per process block',
      orderPolicy: 'deterministic Williams-style counterbalanced rows',
      ratioDirection: 'cell median ns/eval divided by handwritten median ns/eval; >1 is slower',
      warning: 'f32, dual, and finite-difference cells have different semantics or operation counts; ratios are cost lanes, not adapter-overhead claims',
      orders,
    },
    rawRuns: runs,
    summaries,
  };
  report.acceptance = classify(config, metadata, preflight, postflight, runs, summaries);
  await emitOutput(report, config.output);
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});
