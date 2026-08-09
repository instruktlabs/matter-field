# Claims Ledger

This is the short, falsifiable account of what Matter Field's current evidence
supports. It exists so a demo, benchmark, or community post does not silently
become a stronger claim than the repository can defend.

## Supported now

- The package can materialize its restricted example fields as ordinary
  JavaScript numbers, an operation-by-operation f32 estimate, dual numbers,
  and caller-supplied Three.js TSL graphs.
- The committed CPU golden agrees bit-for-bit in the Node, browser-engine, and
  Worker configurations named in public CI.
- On the two committed RTX 3070 receipts, every sampled float output stayed
  within its declared regression budget and all eleven sampled raw u32 hash
  vectors agreed.
- The same source field can serve dense GPU rendering and sparse immediate CPU
  queries without a per-frame GPU readback.
- The dual backend returns a value channel bit-identical to the number backend
  and analytic CPU derivatives away from nonsmooth operations.

## Not established

- A universal CPU/GPU numeric bound, or correctness at unsampled coordinates.
- Results on AMD, Intel, Apple silicon, other NVIDIA devices, or unrecorded
  browser/driver combinations.
- That 300 points are statistically representative. They are a deterministic
  regression set with targeted cases.
- That the current budgets are application-valid tolerances. They were chosen
  above prior observations to detect regressions.
- Equality between an analytic field and the triangles or other primitives
  used to render or collide with it between sampled vertices.
- Superior speed, lower total engineering cost, or stronger adoption than an
  existing approach. The current benchmark has no handwritten or competing
  baseline.
- That every example is in the GPU receipt. The serpent currently has graph
  construction tests and an interactive demo, but no numeric GPU matrix row.
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

Avoid:

- "CPU and GPU are identical."
- "Collision equals render."
- "Bit-exact on every device."
- "The worst error is X" when only a finite set was sampled.
- "The f32 emulator bounds the GPU" without a proof for that backend.
- "Analytic and GPU gradients match" without measuring both.
- "First" or "only" shared CPU/GPU math package.
- "Faster" or "necessary" without a scoped comparison or user evidence.

## What would strengthen the claim

1. Fill the AMD, Intel, and Apple/Metal WebGPU and fallback cells with raw
   receipts from clean source states.
2. Derive each field budget from a named consumer tolerance, then add targeted
   samples around that consumer's failure boundaries.
3. Add a separate geometry/materialization assay for tessellation, LOD,
   interpolation, and collision-shape residuals.
4. Benchmark end-to-end alternatives on one real workload: duplicated source,
   CPU-authored mesh/texture, GPU readback, TypeGPU integration, and Matter
   Field.
5. Add source-bound serpent outputs to the numeric GPU probe.
6. Collect outside attempts, including failed receipts and fields the current
   vocabulary cannot express.

Read [MEASUREMENT.md](./MEASUREMENT.md) for the receipt contract and
[POSITIONING.md](./POSITIONING.md) for the project boundary.
