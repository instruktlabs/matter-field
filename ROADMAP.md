# Roadmap

Matter Field is one product with two integration entry points and one current
authority:

- the dependency-free core plus native Three.js TSL path is the primary entry;
- the precompiled TypeGPU path is an optional, separately assayed entry;
- the adapter-authored field definition remains authoritative until reviewed
  generation replaces the handwritten TypeGPU twin.

The roadmap is gated. A later phase may be researched early, but it should not
be presented as shipped architecture until the prior exit criteria are met.

## Phase 0 — Public preview baseline

- [x] Publish the standalone repository without OBJEKT-62 history or game
  content.
- [x] Publish Pages, focused examples, and the integrated FIELDWORK dogfood
  mission.
- [x] Tag
  [`v0.0.1-preview.1`](https://github.com/instruktlabs/matter-field/releases/tag/v0.0.1-preview.1)
  with a tested package tarball. This is a GitHub prerelease, not an npm
  release.
- [x] Bind receipt identity to field source, package version, Three.js version,
  source commit, coordinates, and expected CPU values.
- [x] Publish a committed 300-point CPU golden and browser/Worker comparison.
- [x] Publish six native-TSL WebGPU/WebGL2 receipts across three physical
  NVIDIA/AMD GPUs on Windows and Linux.
- [x] Publish one exact-artifact TypeGPU WebGPU receipt on RTX 3070 / Windows.
- [x] Add a controlled CPU benchmark harness with a clean-host rejection gate.
  No publication timing has been accepted.

**Exit gate: met.** A public source state, prerelease artifact, live dogfood
application, CI baseline, and clearly scoped receipt set are reviewable.

## Phase 1 — Complete the public developer contract

- [x] Audit every package export for runtime source, JSDoc, declarations, and
  an external consumer test.
- [x] Add precise JSDoc to public adapter, number, f32, dual, noise, native TSL,
  parity, and golden APIs.
- [x] Run strict JavaScript checking with `allowJs`, `checkJs`, and `noEmit`.
- [x] Generate declarations from annotated JavaScript where practical. Keep any
  handwritten declaration small and guarded by an automated API consistency
  test.
- [x] Add `types` conditions for every relevant public export.
- [x] Test clean packed-package consumers with NodeNext and bundler resolution.
- [x] Exercise inferred values, dual gradients, TSL node composition, scalar
  chaining, and vector swizzles—not import success alone.
- [x] Keep Three and TypeGPU types isolated to their integration subpaths so a
  core-only consumer does not need optional peers.
- [x] Verify and document the exact supported `three`, `@types/three`,
  `typegpu`, and `@typegpu/three` combination.
- [x] Publish the completed developer-contract work as the immutable GitHub
  prerelease `v0.0.1-preview.2`, without replacing `preview.1` or publishing to
  npm. The manifest remains `0.0.1` to preserve the existing receipt identity;
  the release asset has a unique preview-specific filename.

**Exit gate: met for the preview.** A clean consumer can install the packed
artifact and type-check every advertised export in both resolution modes; the
dependency-free core does not resolve Three or TypeGPU; declaration output is
reproducible and stale output cannot enter the package; no field identity or
receipt changes are introduced. Core and native TSL fixtures run with full
library checking.
The pinned TypeGPU 0.11.9 fixture uses `skipLibCheck` because that dependency's
own declarations fail upstream TypeScript 7 variance checks; Matter Field's
positive inference and negative-misuse checks still run in both modes.

## Phase 2 — Replace synchronization with generation

The current `src/typegpu/` fields are handwritten twins. Their tests detect
sampled disagreement when it occurs, but they do not eliminate the maintenance
risk.

- [x] Execute dunes against a research-only expression-recording adapter; see
  the [prototype record](./research/canonical-ir/README.md).
- [x] Produce a versioned canonical IR prototype that preserves constants,
  parenthesization, operation order, stamp order, float-to-lattice boundaries,
  and field identity.
- [x] Generate a reviewable TypeGPU source prototype from that IR and pass it
  through the real TypeGPU/esbuild transform without using transform metadata
  as the public contract.
- [x] Compare the IR f64 evaluator and emitted function's direct CPU execution
  with the authoritative f64 result and current handwritten TypeGPU result,
  and compare the IR f32 evaluator with the operation-wise f32 adapter, at all
  300 committed assay points.
- [ ] Compare the generated GPU result with the authoritative oracle, existing
  budgets, operation-wise f32 diagnostic, and committed golden set.
- [ ] Bind generator source, generated artifact, final WGSL or bundle identity,
  dependency versions, assay, and commit into fresh evidence.
- [ ] Expand generation to swell, wind, and serpent only if the dunes prototype
  remains readable, debuggable, and numerically unchanged.
- [ ] Retire a handwritten twin only after generated output passes the same
  clean-consumer, integration, and receipt checks.

**Exit gate:** at least one shipped field has one reviewable authority and a
generated TypeGPU materialization; every supported numeric materialization and
the emitted artifact are identity-bound; the old and generated paths agree on
the committed assay; any intentional difference is handled as an explicit
field migration with new goldens and receipts.

## Phase 3 — Deepen evidence and portability

- [ ] Expand targeted samples around float-to-lattice boundaries, zero
  crossings, long-running time inputs, stamp boundaries, and supported
  coordinate limits.
- [x] Validate committed native v2 and TypeGPU v1 receipt JSON against
  versioned Draft 2020-12 schemas plus semantic integrity checks.
- [ ] Bind probe code, comparison code, budgets, and raw hash vectors into a
  separate harness identity.
- [ ] Store sufficient per-sample output or a reproducible artifact to
  independently recompute summaries and error distributions.
- [ ] Derive application-facing budgets from gameplay tolerances rather than a
  single abstract epsilon.
- [ ] Collect native-TSL WebGPU and WebGL2 evidence on Intel and Apple silicon,
  and review Apple/Metal before making wider portability statements.
- [ ] If the TypeGPU subpaths remain release candidates, collect their separate
  WebGPU receipts on AMD, Intel, and Apple silicon. Native-TSL receipts do not
  transfer to TypeGPU-generated WGSL.
- [ ] Add numeric serpent coverage beyond current integration smoke tests.
- [ ] Measure field arithmetic drift separately from tessellation,
  interpolation, LOD, coordinate synchronization, and collision-shape error.
- [ ] On a genuinely quiet host, separately measure CPU query cost, analytic
  gradients versus finite differences, cold resolution/compilation, GPU
  throughput, readback, and application frame cost. Publish no result rejected
  by the clean-host gate.

**Exit gate:** every public portability or performance claim points to a
versioned method, raw artifact, named workload, exact source state, and relevant
hardware; missing cells and non-covered error surfaces remain explicit.

## Phase 4 — Decide whether the preview earns `0.1.0`

- [ ] Obtain outside feedback from at least one real Three.js/TSL project where
  CPU gameplay must query a GPU-rendered procedural field.
- [ ] Validate at least one outside-authored field and record which vocabulary
  restrictions help or block it.
- [ ] Resolve the handwritten-TypeGPU maintenance decision: generated lane,
  explicitly synchronized lane, or removal from the stable surface.
- [ ] Freeze and document the supported export, peer-version, field-identity,
  and receipt-schema contracts.
- [ ] Pass the complete source, browser, Worker, declaration, clean-consumer,
  package, site, and release-checklist suites from the exact candidate commit.
- [ ] Review the Intel and Apple evidence cells required by the release policy.
- [ ] Publish to npm only after the measured differentiator and support burden
  justify a registry release.

**Exit gate:** a reviewed `0.1.0` candidate has external-use evidence, a stable
authority story, reproducible packaging, and no claim that exceeds its receipts.

## Deferred until the core contract earns expansion

These are not current product promises or near-term contribution targets:

- a raw WGSL backend;
- neural-network training, learned-field demonstrations, or a general ML
  runtime;
- integrations for Unity, Godot, Unreal, or other non-JavaScript engines;
- a general shader language, render graph, WebGPU resource layer, or game
  engine;
- stateful erosion, fluids, cellular simulation, or general physics.

A deferred lane should re-enter the roadmap only when the canonical authority
work is stable, a real adopter supplies a use case the current entry points
cannot serve, and the lane has an owner plus an evidence plan.

## How to help now

The best current contributions are a precise type-surface fix, an adversarial
numeric sample, a reproducible hardware receipt, or an outside field that tests
the contract. See [CONTRIBUTING.md](./CONTRIBUTING.md) and
[docs/RECEIPTS.md](./docs/RECEIPTS.md).
