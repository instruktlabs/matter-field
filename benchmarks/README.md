# Publication CPU benchmark

This directory contains a deliberately separate benchmark suite. It does not
replace `examples/bench.mjs`, which remains a quick consumer-cost illustration.
The publication harness isolates each implementation in a fresh subprocess,
uses deterministic pre-generated coordinates, consumes every result through a
checksum, calibrates long batches, and preserves every raw measurement in JSON.

## Run it

Build the publishable TypeGPU artifact, test the policy helpers, then invoke the
runner from the exact Matter Field Git worktree root:

```bash
npm run build:typegpu:package
npm run bench:cpu:self-test
taskset -c 4 node benchmarks/run-cpu.mjs --output /tmp/matter-field-cpu.json
```

The publication defaults are:

- 250 ms minimum calibration target per batch;
- 10 warm-up and 30 measured batches per fresh process;
- 5 fresh process blocks per cell;
- 4,096 pre-generated coordinates from the committed LCG;
- 10,000 paired bootstrap resamples;
- every required cell in a deterministic counterbalanced order.

`taskset` affinity is inherited by every subprocess. Choose one physical core
from `lscpu -e=CPU,CORE,SOCKET` and leave its SMT sibling unused; do not blindly
copy CPU 4 to a host with different topology. A run not restricted to one
logical CPU is conservatively classified as exploratory.

Use six process blocks when you want one complete balanced-square cycle; the
five-process default is the requested minimum and uses the first five rows of
that schedule. Configuration is available through `--help`.

For a quick integration check, reduce the settings explicitly:

```bash
node benchmarks/run-cpu.mjs \
  --target-ms 5 --warmups 1 --samples 2 --processes 1 \
  --bootstrap 100 --preflight skip --output /tmp/matter-field-smoke.json
```

Such output is automatically marked `exploratory-only`; it is not performance
evidence.

## Cells and what their ratios mean

| Cell | Work per timed evaluation | Valid interpretation |
|---|---:|---|
| `handwritten-equivalent` | One plain-JS dunes field | No-adapter baseline with the canonical expression order |
| `canonical-number` | One dunes field through `numberAdapter` | Total f64 adapter-call cost versus handwritten JS |
| `typegpu-direct` | One direct CPU call from `dist-typegpu/index.js` | Cost of the precompiled publish artifact's CPU-callable field |
| `f32-emulated` | One field with rounding after each adapter operation | Cost of the diagnostic f32 semantics, not like-for-like f64 overhead |
| `dual` | One dual-number field, consuming value, dx, and dz | Cost of analytic value plus gradient from one expression tree |
| `central-finite-difference` | Five canonical f64 field calls | Cost of value plus central dx/dz at the recorded epsilon |

The TypeGPU artifact, handwritten baseline, and canonical number adapter are
validated against the same f64 oracle points. The f32 lane intentionally has
different numeric semantics. The dual and finite-difference lanes intentionally
produce more information and have different operation/allocation counts.
Their ratios are useful cost comparisons, but they are not measurements of
adapter dispatch overhead.

The timed unit is one requested field result. For finite differences, that one
result contains five underlying field evaluations. The raw JSON records this
caveat, the epsilon, calibration attempts, warm-ups, every measured batch,
checksums, validation drift, process order, dependency versions, source status,
commit, and hashes of relevant source/build files.

Receipts intentionally omit the machine hostname and absolute checkout,
worktree, and output paths. Exact-root validation still happens locally before
timing; the shareable JSON retains its boolean result, commit, branch, dirty
state, relative status entries, source hashes, and CPU/OS/runtime evidence.

## Statistics

The report gives median, IQR, MAD, p95, and p99 both across raw batches and
across fresh-process medians. The fresh-process medians also receive a
coefficient-of-variation stability gate at 5%; a cell above that threshold
forces the whole report to `exploratory-only`. The harness preserves unstable
samples instead of deleting them. Ratios use paired process blocks: each cell's
process median is divided by the handwritten baseline median from the same
block, then the median ratio receives a deterministic 95% bootstrap interval.
A ratio greater than 1 means the cell took more nanoseconds per requested
result. Do not headline the minimum or delete outliers after seeing them.

The five default process pairs are the requested minimum, not a magically large
sample. Preserve the raw JSON and repeat on independent clean boots when making
public performance claims.

## Linux publication gate

`linux-preflight.sh` is read-only. It does not kill processes, log out the user,
change a power profile, select a GPU, reboot, modify the repository, or inspect
credentials. It observes the host for 30 seconds and reports JSON:

```bash
bash benchmarks/linux-preflight.sh \
  --json --repo "$PWD" --expect "$(git rev-parse HEAD)"
```

The orchestrator runs the full 30-second gate both before and after the timed
cells. Both receipts must pass. A publication candidate requires a clean exact
checkout, AC power, the performance power profile, an idle local session, no
unrelated Chrome/Codex/Node processes, at least 98% average CPU idle, negligible
I/O wait, no swapping, GPU utilization no higher than 2%, stable temperatures,
and no matching kernel/GPU errors in the boot or either observation window. A
shorter observation, missing telemetry, dirty source, failed postflight, reduced
benchmark settings, or a non-Linux host forces `exploratory-only`.

Git identity is accepted only when the harness directory's package root is the
exact `git rev-parse --show-toplevel`. A benchmark copied into `node_modules`
cannot silently inherit the consumer project's commit or clean status; installed
package runs are diagnostic unless performed from an exact Matter Field source
checkout. The compared absolute paths never enter the emitted receipt.

The orchestrator passes its Node CLI flags to every fresh child and records each
child's Node version, V8 version, executable, `process.execArgv`, and
`NODE_OPTIONS`. Any runtime mismatch forces `exploratory-only`.

The gate is conservative by design. Passing it means the receipt met declared
conditions; it does not prove that an operating system introduced no noise.
Pinning the benchmark to an isolated physical core and repeating across clean
boots remain recommended for final publication runs.

## GPU work is separate

This suite makes no GPU performance claim. The existing GPU probes combine
dispatch and readback and are correctness receipts. A publication GPU harness
must separately compare raw WGSL, adapter-generated TSL, handwritten TSL, and
native TypeGPU using matched operation counts and workgroup sizes. It must use
GPU timestamp queries for shader execution while reporting CPU encode/submit,
queue completion, and readback as separate lanes. WebGL2 needs disjoint-aware
timer queries. Rendering throughput and mixed sparse-CPU/dense-GPU application
tests are also separate from this CPU suite.
