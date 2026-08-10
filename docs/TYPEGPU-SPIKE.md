# Optional TypeGPU materialization spike

Status: working optional, separately assayed integration. It is not the product
authority and is not a recommendation to replace the adapter core.

## Product decision

Matter Field remains one product with two entry points:

- core plus native Three.js TSL is the primary dependency-free entry;
- TypeGPU plus `@typegpu/three` is the optional WebGPU-oriented entry.

The adapter-authored field is the authority for both. Today, however, the
TypeGPU fields are handwritten twins whose comparison tests detect drift; they
are not generated from that authority. A research-only dunes recorder and
TypeGPU source emitter now demonstrates a possible canonical-IR boundary, but
it is not packaged or GPU-assayed. Until generated artifacts pass the remaining
exit gates, documentation and release notes must continue to call the shipped
TypeGPU lane handwritten.

Reviewed implementation commit:
[`0ffc635`](https://github.com/instruktlabs/matter-field/commit/0ffc635c58fdb21b318686cfd715df07071ae0df).
Committed raw receipt:
[`windows-rtx3070-chrome-webgpu-2026-08-09.json`](../parity/reports/typegpu/windows-rtx3070-chrome-webgpu-2026-08-09.json).

Pinned test set:

- `typegpu@0.11.9`
- `@typegpu/three@0.11.0`
- `unplugin-typegpu@0.11.6`
- `three@0.185.1`
- `esbuild@0.28.2`

The bridge's upstream-tested Three version is 0.181.2. This spike deliberately
tests current Three 0.185.1 as an upgrade lane because `@typegpu/three` imports
Three internals despite declaring a broad peer range.

The installed precompiled runtime remains compatible with Node 18+, but the
current `unplugin-typegpu` build toolchain requires Node 20.19 or newer. CI
therefore keeps Node 18 in the runtime suite and runs build, pack, declaration,
and clean-consumer checks on Node 22.

## What was built

The four example families and restricted noise/hash primitives now have native
TypeGPU forms under `src/typegpu/`:

- readable CPU-callable `'use gpu'` scalar functions;
- explicit `tgpu.fn` f32/u32 kernels for shader use;
- a native TypeGPU compute/readback probe;
- precompiled publish artifacts, so a consumer does not need to transform
  package code from `node_modules`;
- typed package declarations and a clean-consumer tarball smoke;
- `@typegpu/three` node helpers for dunes, swell, wind, and serpent;
- an explicitly separate native-TSL compatibility lane for WebGPU and WebGL2.

The u32 hash needs a deliberate dual implementation. CPU execution uses
`Math.imul` and unsigned shifts; generated WGSL uses native wrapping u32
operations. Ordinary JS multiplication cannot retain the low 32 bits of every
u32 product above JavaScript's exact-integer range.

## Observed result

A clean NVIDIA GeForce RTX 3070 / Windows / Chrome 151 WebGPU correctness run
on August 9, 2026 used the same 300 f32 points and absolute field-unit budgets
as the existing assay. The report binds the exact emitted TypeGPU JavaScript
modules, final browser bundle, dependency versions, clean worktree, and commit
`0ffc635c58fdb21b318686cfd715df07071ae0df`. Its raw file SHA-256 is
`85a664d7db123813f995be6a7444889763c6f1b8b7ce5fe28152ab85090034f2`.
Timing from this machine is intentionally ignored because the host was in
active use; the recorded dispatch-and-readback duration is not benchmark
evidence.

| Field | Max observed absolute drift | Budget | Result |
|---|---:|---:|---|
| dunes | 0.0007492180491617262 | 0.004 | pass |
| swell at t=2.5 | 0.0002236813009637295 | 0.001 | pass |
| wind x at t=1 | 0.000020787901877872272 | 0.0001 | pass |
| wind z at t=1 | 0.00002657150133833497 | 0.0001 | pass |

Additional checks in that run:

- 1,200 TypeGPU direct-CPU scalar values matched the existing adapter f64
  oracle bit-for-bit at the sampled points;
- the probe consumed the same precompiled `dist-typegpu` JavaScript placed in
  the tarball and bound both publish-artifact and final browser-bundle hashes;
- all 11 raw-u32 GPU hash vectors were bit-exact;
- the Three r185 bridge compiled and rendered dunes, swell, wind, serpent
  spine, and serpent radius independently, and every integration readback was
  spatially nonconstant after excluding WebGPU row padding;
- in the separate browser CPU suite, Chromium, Firefox, and WebKit main-thread
  and Worker results matched the existing committed f64 golden for both
  implementations.

These are correctness and integration observations, not speed evidence or a
universal numeric bound.

The receipt supports only the named source state, precompiled artifact, finite
sample set, and physical configuration. It does not extend the six native-TSL
receipts to TypeGPU-generated WGSL, fill an AMD/Intel/Apple TypeGPU matrix cell,
or establish numeric serpent parity. The serpent Three helpers are render
integration checks only.

## Where TypeGPU is better

TypeGPU is materially better when the problem is broader than a procedural
field expression:

- natural JavaScript/TypeScript operators and control flow are easier to read
  than explicit adapter calls;
- typed buffers, resources, pipelines, and compute readback are first-class;
- one ecosystem can cover field evaluation, particle compute, grid updates,
  and other general compute kernels;
- `@typegpu/three` can place a TypeGPU function inside a Three node material;
- TypeGPU's package ecosystem includes reusable noise and resource-aware
  caches, although substituting those would intentionally change Matter
  Field's current field identity.

For a WebGPU-only application already using TypeGPU, this is a substantially
more natural integration surface than asking the app to learn Matter Field's
adapter syntax.

## Where the adapter core is still better

The TypeGPU port does not reproduce Matter Field's full contract:

- TypeGPU's direct scalar CPU operations are ordinary JavaScript f64; they are
  not an operation-by-operation f32 evaluator.
- TypeGPU's typed vector constructors package CPU components as f32. Use the
  scalar wind and serpent channels when comparing the handwritten port's f64
  query values with the adapter authority; vector helpers are explicitly
  convenience values.
- TypeGPU has shader derivatives, but not Matter Field's generic forward-mode
  world-coordinate dual gradients.
- TypeGPU permits a much broader language and does not enforce the restricted
  no-transcendental, floor-before-lattice, or ordered-expression discipline.
- `@typegpu/three` currently emits WGSL and removes Three's WebGL2 fallback.
- the spike is a second handwritten formula surface, so synchronized tests are
  guarding duplication rather than eliminating it.
- existing adapter/TSL receipts do not transfer to TypeGPU-generated WGSL.

TypeGPU also does not inherently make equivalent field arithmetic faster. The
GPU may receive nearly the same operations. This branch has no valid timing
comparison because the available host was busy, and dispatch-plus-readback is
not a rendering-throughput benchmark.

## Verdict

The TypeGPU implementation works and deserves to remain an optional assayed
materialization and integration. It is not a general backend for arbitrary
adapter-authored fields, nor is it a second source of truth in its current
handwritten form.

The strongest near-term architecture is:

1. keep the restricted adapter-authored definition as authority for f64, f32
   diagnostic, dual gradients, identity, and native TSL/WebGL2;
2. ship a precompiled `matter-field/typegpu` materialization for TypeGPU and
   WebGPU users;
3. assay that materialization against the existing authority on every change;
4. advance the existing dunes canonical-IR prototype through packaged-artifact
   and GPU assay gates before attempting a broad rewrite.

If natural `'use gpu'` source must become the authoring center, Matter Field
would need its own supported source transform that lowers the original source
to a canonical operation IR before TypeGPU transforms it. TypeGPU exposes no
stable public AST visitor for this; consuming its internal metadata would be a
semver hazard.

## Canonical-generation phases and gates

### Phase A — record one authoritative field

- Execute dunes once against an expression-recording adapter.
- Preserve constants, parenthesization, operation order, stamp order,
  float-to-lattice boundaries, and field identity in a small typed IR.
- Make the serialized IR reviewable and deterministic.

**Exit gate:** recorded dunes reproduces the authoritative f64 evaluation,
operation-wise f32 diagnostic, and committed golden set without an identity
change.

**Research status:** met for the recorder and direct CPU evaluators at all 300
committed assay points. The emitted source also passes the actual
TypeGPU/esbuild transform. This does not satisfy Phase B or establish generated
GPU behavior.

### Phase B — generate and assay TypeGPU

- Generate a precompiled dunes TypeGPU function from the reviewed IR.
- Compare it with the current handwritten TypeGPU result and bind source,
  generator, comparison harness, build plugin, emitted artifact, dependency
  versions, and commit into fresh evidence.
- Do not depend on TypeGPU private transform metadata as a public contract.

**Exit gate:** the generated result passes the clean consumer, TypeGPU/Three
integration, raw hash, and numeric probe checks for the exact artifact. Any
output change receives a new field identity, golden, and receipt rather than
inheriting previous evidence.

### Phase C — decide whether to expand

- Review whether the IR and generator are easier to maintain and debug than the
  synchronized handwritten twin.
- Only then expand to swell, wind, and serpent.
- Retain and independently test native TSL WebGL2 while the TypeGPU bridge is
  WebGPU-only.
- Add adversarial float-to-lattice vectors and repeat separate TypeGPU receipts
  on AMD, Intel, and Apple silicon before a stable TypeGPU claim.
- Benchmark only on a quiet host, separating CPU f64, gradients,
  resolution/compile cost, GPU throughput, and readback.

**Exit gate:** all advertised TypeGPU fields are generated or the documentation
explicitly retains the synchronized-port boundary. TypeGPU remains an optional
entry point either way; it does not need to become the default package surface.

## Primary references

- [TypeGPU functions](https://docs.swmansion.com/TypeGPU/apis/functions/)
- [TypeGPU buffers](https://docs.swmansion.com/TypeGPU/apis/buffers/)
- [TypeGPU pipelines](https://docs.swmansion.com/TypeGPU/apis/pipelines/)
- [`unplugin-typegpu`](https://docs.swmansion.com/TypeGPU/tooling/unplugin-typegpu/)
- [`@typegpu/three`](https://docs.swmansion.com/TypeGPU/ecosystem/typegpu-three/)
- [Three WebGPURenderer](https://threejs.org/docs/pages/WebGPURenderer.html)
