# Community share draft

This copy is deliberately framed as a request for technical scrutiny, not a
launch announcement or a claim that Matter Field is necessary.

Publish to the Three.js community first. It is the tested product beachhead,
not the project's entire possible audience. Follow with a separate TypeGPU
message about the optional assayed lane; do not send one generic pitch to every
WebGPU, game-development, procedural-generation, or ML community.

## Three.js Discord version

> **A shader is not a world if gameplay cannot query it.**
>
> I have been working on Matter Field, a small experiment for procedural
> Three.js worlds where CPU gameplay and GPU rendering both need a field such
> as terrain height, swell, wind, or a moving parametric volume.
>
> The core defines a restricted field once through math adapters, then
> materializes it as JS f64, an operation-by-operation f32 estimate, dual
> numbers for analytic gradients, and caller-supplied Three TSL. I also built an
> optional TypeGPU/WebGPU port to test the strongest overlapping approach.
> That lane works, but I want to be precise: it is currently a separately
> maintained implementation checked against the adapter authority—not a magic
> generated backend.
>
> The unusual part is the evidence contract. I am not claiming CPU/GPU float
> equality. Each device run records maximum observed absolute drift over named
> samples, raw integer-hash agreement, source identity, browser/backend, and
> adapter metadata. Current native-TSL receipts cover three physical GPUs on
> Windows/Linux through WebGPU and WebGL2; the TypeGPU lane has one clean RTX
> 3070 WebGPU receipt. These are finite regression observations, not universal
> bounds or speed results.
>
> I exercised the package in **FIELDWORK: Breach Run**: one 3D mission where CPU
> dunes drive contact and slope, swell drives four-point buoyancy, wind pushes
> the skiff, and a GPU-animated serpent has a CPU-queryable collision volume.
> Gameplay performs zero per-frame GPU readbacks. The default WebGPU and
> WebGL2 lanes use the native one-definition TSL path; an explicit optional
> WebGPU lane uses the precompiled TypeGPU/Three bridge.
>
> Live game and assays: https://instruktlabs.github.io/matter-field/
> Source and receipts: https://github.com/instruktlabs/matter-field
>
> The GitHub prerelease is public, but I do not yet know whether it earns a
> stable API or npm release. TypeGPU is broader and more natural for
> WebGPU-first applications; duplicated handwritten math may be perfectly
> reasonable in many games. I would value skeptical feedback:
> **what real project would make this useful, what claim is still too strong,
> and what measurement would you require before trusting it?**

## TypeGPU community follow-up

> **Can an evidence contract add value above CPU-callable TypeGPU functions?**
>
> I am testing that question in Matter Field, a deliberately restricted
> procedural-field package. TypeGPU already solves the broader typed WebGPU
> authoring, resource, pipeline, and compute problem, and I am not presenting
> Matter Field as a replacement.
>
> Matter Field's narrower layer adds an f64 authority, an operation-wise f32
> diagnostic, generic forward dual gradients, field identity, field-unit error
> budgets, source/artifact-bound hardware receipts, and a separate native
> Three.js TSL path that retains WebGL2.
>
> The current `matter-field/typegpu` functions are a precompiled handwritten
> twin, assayed against the adapter-authored fields. They do **not** eliminate
> formula duplication yet. A research-only dunes recorder now preserves a
> canonical operation tape and emits TypeGPU source that passes direct-CPU and
> build-transform checks. It is not packaged or GPU-assayed, so the shipped
> lane remains the handwritten twin.
>
> I would value criticism from TypeGPU users: is that contract useful above
> `use gpu`, or is the restriction greater than the maintenance risk it removes?
>
> Release: https://github.com/instruktlabs/matter-field/releases/tag/v0.0.1-preview.2
> Live application and assays: https://instruktlabs.github.io/matter-field/

## Reddit / forum version

### I made the CPU query the procedural field the shader draws, then tried to prove how far they still drift

Procedural Three.js scenes often have two versions of reality: a GPU function
that displaces or animates geometry, and a CPU approximation used for
collision, buoyancy, AI, placement, or hit tests. Copying the formula works,
until one side changes, a constant is rounded differently, or an optimization
changes evaluation order. GPU readback avoids the duplicate authority but is a
poor fit for sparse synchronous gameplay queries.

Matter Field is my attempt at a deliberately narrow middle layer:

- one restricted adapter-authored field for JS f64, CPU f32 emulation, analytic
  dual gradients, and native Three.js TSL;
- an optional precompiled TypeGPU/WebGPU materialization and
  `@typegpu/three` bridge;
- no required runtime dependency for the adapter core;
- finite, source-bound CPU/browser/GPU receipts with application-unit absolute
  error budgets and ULPs retained only as diagnostics.

The closest overlap is TypeGPU, and that comparison changed the project. A
TypeGPU `'use gpu'` function can remain CPU-callable, its Three bridge produces
TSL nodes, and its resource/pipeline/compute model is much broader than Matter
Field. Matter Field's defensible distinction is narrower: a restricted numeric
discipline, f64/f32/dual/native-TSL materializations, WebGL2 fallback, and an
evidence ledger. The current TypeGPU implementation is handwritten and assayed
against the adapter-authored authority; it does not eliminate source
duplication yet. A research-only dunes canonical-IR recorder/source emitter now
exists, but it is not a packaged backend or generated-GPU receipt.

To see whether the architecture survives contact with an application, I built
**FIELDWORK: Breach Run**. It combines four fields in one short 3D courier run:
terrain controls skiff contact and slope, swell controls buoyancy, wind changes
handling, and a moving serpent body has an independently queryable CPU volume.
The GPU renders the dense surfaces; a fixed 60 Hz CPU loop owns the mission,
damage, and objective. There are zero per-frame GPU readbacks.

What the repository currently supports:

- cross-runtime CPU golden checks in Node, Chromium, Firefox, and WebKit,
  including Workers;
- six native-TSL receipts across RTX 3070, GTX 1660 Ti Max-Q, and Radeon Vega
  10, through WebGPU and WebGL2;
- one exact-artifact TypeGPU WebGPU receipt on the RTX 3070;
- a controlled CPU benchmark harness with a matched handwritten baseline—but
  no accepted clean timing yet, so I am **not** making a speed claim.

What it does not support:

- universal CPU/GPU equality or a global error bound;
- proof that a 300-point set characterizes a field's tail;
- sub-millimetre collision/render agreement (mesh interpolation is a separate,
  often much larger error surface);
- a claim that Matter Field is faster, necessary, or better than TypeGPU;
- neural-network training or a general shader/compute framework.

The provocative version is: **parity is not equality; it is a budget plus a
receipt.** I would especially welcome attempts to falsify the current receipt,
ports to missing Intel/Apple hardware, examples of fields the restricted
vocabulary cannot express, and comparisons against a clean duplicated-source
implementation.

- Live game and assays: https://instruktlabs.github.io/matter-field/
- Repository: https://github.com/instruktlabs/matter-field
- GitHub prerelease: https://github.com/instruktlabs/matter-field/releases/tag/v0.0.1-preview.2
- Claims ledger: https://github.com/instruktlabs/matter-field/blob/main/docs/CLAIMS.md
- TypeGPU spike report: https://github.com/instruktlabs/matter-field/blob/main/docs/TYPEGPU-SPIKE.md

## Likely questions and concise answers

**Isn't this just TypeGPU?**  TypeGPU is the closest overlap and is better for
a broad WebGPU pipeline. Matter Field's adapter core is narrower, keeps native
TSL/WebGL2, adds generic forward dual gradients and an f32 diagnostic, and
centres hardware-scoped receipts. Its optional TypeGPU port is currently a
handwritten, assayed integration—not a second product, a generated backend, or
evidence that the projects are interchangeable.

**Who is it for?**  Start with Three.js/TSL or React Three Fiber games and
simulations whose shader-rendered field must be queried by CPU gameplay. The
next audience is TypeGPU projects that specifically need the added derivative,
fallback, identity, or receipt contract. It is not presently aimed at generic
web development, ML training, or non-JavaScript engines.

**Why not maintain two formulas and write tests?**  That is a valid option.
Matter Field is useful only when structural sharing, immediate CPU queries,
gradients, or receipt discipline repay the adapter restriction. The project
needs outside application evidence before claiming that trade is generally
worthwhile.

**Does the benchmark prove it is fast?**  No. The harness is ready, but the
owned Linux machine was active and had recent GPU-driver errors, so it rejected
the run. Correctness receipt timings are not performance results.

**Does a passing receipt prove collision matches the rendered mesh?**  No. It
measures field arithmetic at named samples. Tessellation, interpolation, LOD,
coordinate synchronization, and collision shapes require separate assays.

**Why forbid transcendental functions?**  The current contract chooses a small
operation set whose CPU/GPU behavior can be reasoned about and measured more
meaningfully. That restriction is a tradeoff, not a statement that shader trig
is unusable.
