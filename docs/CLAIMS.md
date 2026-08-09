# Claims Ledger

This is the short, falsifiable account of what Matter Field's current evidence
supports. It exists so a demo, benchmark, or community post does not silently
become a stronger claim than the repository can defend.

## Supported now

- The package can materialize its restricted example fields as ordinary
  JavaScript numbers, an operation-by-operation f32 estimate, dual numbers,
  and caller-supplied Three.js TSL graphs.
- The optional TypeGPU preview hand-ports the four shipped field families into
  precompiled CPU-callable `'use gpu'` functions, typed TypeGPU kernels, and
  WebGPU-only `@typegpu/three` node helpers. It does not materialize arbitrary
  adapter-authored fields.
- The committed CPU golden agrees bit-for-bit in the Node, browser-engine, and
  Worker configurations named in public CI.
- Across six committed receipts from an RTX 3070 on Windows and a GTX 1660 Ti
  Max-Q plus Radeon Vega 10 on Linux, every sampled float output stayed within
  its declared regression budget and all eleven sampled raw u32 hash vectors
  agreed. Each receipt covers one named browser/backend/device configuration.
- The same source field can serve dense GPU rendering and sparse immediate CPU
  queries without a per-frame GPU readback.
- The dual backend returns a value channel bit-identical to the number backend
  and analytic CPU derivatives away from nonsmooth operations.
- One clean
  [TypeGPU receipt](../parity/reports/typegpu/windows-rtx3070-chrome-webgpu-2026-08-09.json)
  at commit `0ffc635c58fdb21b318686cfd715df07071ae0df` records a physical
  RTX 3070 / Windows / Chrome WebGPU run. Across its named samples, 1,200
  direct-CPU scalar results matched the adapter f64 oracle bit-for-bit, the four
  GPU scalar outputs stayed inside their existing absolute budgets, and all 11
  raw-u32 vectors matched. Its five Three helpers passed a spatially
  nonconstant render smoke; that last check is integration evidence, not a
  numeric parity assay.

## Not established

- A universal CPU/GPU numeric bound, or correctness at unsampled coordinates.
- Results on Intel, Apple silicon, other AMD or NVIDIA devices, or unrecorded
  browser/driver combinations. One device never establishes a vendor family.
- That 300 points are statistically representative. They are a deterministic
  regression set with targeted cases.
- That the current budgets are application-valid tolerances. They were chosen
  above prior observations to detect regressions.
- Equality between an analytic field and the triangles or other primitives
  used to render or collide with it between sampled vertices.
- Superior speed, lower total engineering cost, or stronger adoption than an
  existing approach. A controlled harness now includes a matched handwritten
  dunes baseline, but no clean publication timing or competing-library result
  has been accepted.
- That the TypeGPU port is generated from the adapter source, removes formula
  duplication, or preserves the adapter's per-operation f32 diagnostic and
  generic dual gradients. The current TypeGPU field formulas are handwritten.
- TypeGPU correctness outside the single recorded NVIDIA/Windows/Chrome
  configuration, or any transfer of the six native-TSL receipts to
  TypeGPU-generated WGSL.
- That every example is in a numeric GPU receipt. The serpent has graph and
  interactive native-TSL coverage, and the TypeGPU Three helpers have an
  integration smoke, but neither receipt schema currently assays serpent
  values numerically.
- Neural-network training, reverse-mode differentiation, optimizer support, or
  a general tensor runtime.

## Language that survives review

Use:

> One restricted field definition, several measured materializations.

> Maximum observed absolute drift was X over N named samples on this recorded
> hardware, browser, backend, and source state.

> CPU/GPU parity is not a boolean. It is an application error budget with a
> hardware receipt.

> Structural sharing removes a hand-maintained formula twin; measurement tells
> us what floating-point and materialization differences remain.

> The optional TypeGPU port is a separately handwritten materialization checked
> against the adapter authority on named CPU and GPU samples.

Avoid:

- "CPU and GPU are identical."
- "Collision equals render."
- "Bit-exact on every device."
- "The worst error is X" when only a finite set was sampled.
- "The f32 emulator bounds the GPU" without a proof for that backend.
- "Analytic and GPU gradients match" without measuring both.
- "First" or "only" shared CPU/GPU math package.
- "Faster" or "necessary" without a scoped comparison or user evidence.
- "Generated TypeGPU backend" or "one TypeGPU source for every Matter Field
  backend" while the port remains handwritten.
- Treating a TypeGPU result as another cell in the native-TSL vendor matrix.

## What would strengthen the claim

1. Fill the Intel and Apple/Metal WebGPU and fallback cells, and broaden the
   current NVIDIA/AMD coverage with raw receipts from clean source states.
2. Derive each field budget from a named consumer tolerance, then add targeted
   samples around that consumer's failure boundaries.
3. Add a separate geometry/materialization assay for tessellation, LOD,
   interpolation, and collision-shape residuals.
4. Benchmark end-to-end alternatives on one real workload: duplicated source,
   CPU-authored mesh/texture, GPU readback, TypeGPU integration, and Matter
   Field.
5. Add source-bound serpent outputs to the numeric GPU probe.
6. Repeat the TypeGPU assay on AMD, Intel, and Apple silicon, and publish failed
   receipts as readily as passing ones.
7. Generate the TypeGPU materialization from a reviewed canonical
   representation, or continue labeling it an independently synchronized port.
8. Collect outside attempts, including failed receipts and fields the current
   vocabulary cannot express.

Read [MEASUREMENT.md](./MEASUREMENT.md) for the receipt contract and
[POSITIONING.md](./POSITIONING.md) for the project boundary.
