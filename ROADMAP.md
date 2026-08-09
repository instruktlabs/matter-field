# Roadmap

Matter Field is a public preview. The roadmap prioritizes evidence and a useful
contributor loop before package distribution or a wider API surface.

## Before the first npm release

- [x] Bind receipt identity to field source, package version, Three.js version,
  and source commit—not only sampled coordinates and field labels.
- [x] Add a committed 300-point CPU golden and a local browser/Worker
  comparison runner.
- [x] Publish passing Node 18/20/22 and browser/Worker CI evidence after the
  repository's first push.
- [ ] Expand targeted numeric samples around float-to-lattice boundaries,
  zero crossings, long-running time inputs, and supported coordinate limits.
  The current set covers stamp radii and several domain boundaries but fixes
  swell at `t=2.5` and wind at `t=1`.
- [x] Collect real WebGPU and WebGL2 receipts for the owned NVIDIA/Windows and
  NVIDIA-plus-AMD/Linux hardware lanes.
- [ ] Collect real WebGPU receipts for Intel and Apple silicon.
- [ ] Collect the corresponding Intel and Apple fallback receipts where
  supported.
- [ ] Review Apple/Metal results before making any portability statement.
- [ ] Validate receipt JSON against a versioned schema.
- [ ] Bind probe code, comparison code, budgets, and hash vectors into a
  separate harness identity in the next receipt schema.
- [ ] Store enough per-sample output or a reproducible artifact to independently
  recompute summaries and error distributions.
- [x] Replace explanatory CPU-only visuals with accessible demonstrations that
  pair real TSL rendering and CPU gameplay queries.
- [x] Complete desktop, mobile, keyboard, touch, and reduced-motion QA.
- [x] Publish contribution guidance for accepting and reproducing receipts.
- [ ] Tag a reviewed `0.1.0` only after the matrix and release checklist pass.

## Near-term research

- Derive application-facing budget guidance from field units and gameplay
  tolerances rather than choosing one global epsilon.
- Measure cold shader compilation, dispatch/readback cost, and steady-state CPU
  query cost separately.
- Keep the source-bound golden identity reproducible without embedding
  machine-specific build output as the schema evolves.
- Evaluate a raw WGSL backend to prove the adapter is not inherently tied to
  Three.js.
- Prototype a TypeGPU adapter only if it stays optional and complements rather
  than duplicates TypeGPU's broader pipeline/resource responsibilities.
- Improve analytic vector-field derivatives and multi-output assay reporting.
- Prototype a fixed-weight learned navigation field: train a small ReLU MLP
  offline, render its committed inference graph through TSL, steer CPU agents
  with dual spatial gradients, and report model-fit error separately from
  CPU/GPU materialization drift. Neural-network training remains out of scope.

## Deliberate non-goals

- Becoming a physics engine.
- Supporting stateful erosion, fluids, or cellular simulations through the
  same closed-form contract.
- Growing into a general shader language, render graph, or WebGPU framework.
- Claiming universal CPU/GPU equality.
- Publishing benchmark comparisons that are not reproducible and scoped to a
  named workload, version, and machine.

## How to help

The most valuable open lane is hardware evidence. See
[docs/RECEIPTS.md](./docs/RECEIPTS.md) and use the hardware receipt issue form.
For code or API proposals, read [CONTRIBUTING.md](./CONTRIBUTING.md) first.
