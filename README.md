# Matter Field

[![CI](https://github.com/instruktlabs/matter-field/actions/workflows/ci.yml/badge.svg)](https://github.com/instruktlabs/matter-field/actions/workflows/ci.yml)
[![Pages](https://github.com/instruktlabs/matter-field/actions/workflows/pages.yml/badge.svg)](https://instruktlabs.github.io/matter-field/)
[![License: MIT](https://img.shields.io/badge/license-MIT-174e52.svg)](./LICENSE)

Authoritative procedural fields for JavaScript gameplay and Three.js TSL
rendering.

Matter Field lets collision, buoyancy, forces, hit tests, and shader graphs
materialize one pure expression tree through different math adapters. It does
not promise that CPU and GPU floating-point results are identical. It gives
you a restricted field vocabulary, CPU and TSL backends, analytic gradients,
and a repeatable assay for measuring the remaining drift on real hardware.

> **Public preview:** MIT licensed, zero required core runtime dependencies,
> and not yet
> published to npm. Six receipts now cover three physical GPU adapters across
> NVIDIA and AMD on Windows and Linux, through WebGPU and WebGL2. Intel and
> Apple silicon remain open cells; this is multi-device evidence, not a
> vendor-wide portability claim.

[Open the live examples](https://instruktlabs.github.io/matter-field/#examples)
· [Inspect the receipts](https://instruktlabs.github.io/matter-field/#evidence)
· [Contribute a hardware result](./docs/RECEIPTS.md)
· [Read the hardware-lab plan](./docs/HARDWARE-LAB.md)

## TypeGPU-first experiment

The current preview adds precompiled `matter-field/typegpu` and
`matter-field/typegpu/three` subpaths. It rewrites the shipped fields as
ordinary CPU-callable `'use gpu'` functions, exposes typed TypeGPU kernels,
runs a native TypeGPU compute/readback assay, and provides an optional
`@typegpu/three` bridge. The reviewed implementation is bound to commit
[`0ffc635`](https://github.com/instruktlabs/matter-field/commit/0ffc635c58fdb21b318686cfd715df07071ae0df):

```js
import tgpu from 'typegpu';
import { typegpuDunes, typegpuKernels } from 'matter-field/typegpu';

const collisionHeight = typegpuDunes(playerX, playerZ); // direct JS f64 path
const wgsl = tgpu.resolve({
  template: 'field',
  externals: { field: typegpuKernels.dunes },
});
```

Matter Field is intentionally not published to npm yet. Current npm releases
may reject Git dependencies by default and may skip their `prepack` scripts, so
this preview does not pretend that a `github:` dependency is portable. Clone
`main`, build the precompiled artifacts from checked-in source with Node 20.19
or newer, and install that local package into a consumer. TypeScript consumers
of the Three bridge also need `@types/three@0.185.4`:

```sh
git clone --branch main --single-branch \
  https://github.com/instruktlabs/matter-field.git
cd matter-field
npm ci
npm run build:typegpu:package

# From your consumer project:
npm install ../matter-field typegpu@0.11.9 @typegpu/three@0.11.0 three@0.185.1
npm install --save-dev @types/three@0.185.4
```

The first preview tag will provide a tested package tarball so consumers do not
need the repository's authoring toolchain. The installed core and generated
precompiled artifacts themselves remain compatible with Node 18 or newer.

```js
import { typegpuDunesNode } from 'matter-field/typegpu/three';
import * as tsl from 'three/tsl';

const height = typegpuDunesNode(tsl.positionLocal.x, tsl.positionLocal.z);
```

The experiment works on WebGPU, but it is not a drop-in architectural win.
The current `@typegpu/three` bridge is WebGPU-only; TypeGPU direct CPU calls do
not replace the per-operation f32 diagnostic or generic analytic gradients;
and this spike is a second handwritten implementation. The adapter source
therefore remains authoritative while the TypeGPU lane is evaluated. Read the
[full spike report](./docs/TYPEGPU-SPIKE.md) before treating it as a migration
recommendation.

One clean correctness receipt is committed for the exact precompiled artifact:
[Windows / RTX 3070 / Chrome / TypeGPU WebGPU](./parity/reports/typegpu/windows-rtx3070-chrome-webgpu-2026-08-09.json).
It records one physical configuration and finite sample set. It is not speed
evidence, a cross-vendor result, or proof that the handwritten port cannot drift
at unmeasured inputs.

## The split-world problem

A vertex shader can displace terrain, water, particles, or a creature without
giving CPU gameplay code a way to query the result. Common workarounds create
two authorities: copy the formula into JavaScript, sample a proxy, bake a map,
or read the GPU back. Those approaches can drift, lose procedural detail, or
add latency.

Matter Field makes the field definition authoritative. A backend decides what
each operation means:

- `numberAdapter` evaluates f64 JavaScript numbers for gameplay and servers.
- `makeF32Adapter()` estimates f32 quantization on the CPU for assays.
- the dual backend evaluates values plus analytic derivatives.
- `makeTslAdapter(tsl)` builds a Three.js TSL graph supplied by the caller.

The expression is shared; the numeric materializations are measured.

## One field, several consumers

```js
import { numberAdapter, surfaceNormal } from 'matter-field';
import { fbm, stamp } from 'matter-field/noise';
import { makeTslAdapter } from 'matter-field/backend-tsl';
import * as tsl from 'three/tsl';

export function terrain(A, x, z) {
  const base = fbm(A, x, z, 0.0016, 2);
  const height = A.mul(A.sub(base, A.f(0.5)), A.f(24));
  return stamp(A, height, x, z, {
    cx: 120,
    cz: -340,
    rIn: 40,
    rOut: 90,
    level: 14,
  });
}

const collisionHeight = terrain(numberAdapter, playerX, playerZ);
const normal = surfaceNormal(terrain, playerX, playerZ);
const displacementNode = terrain(
  makeTslAdapter(tsl),
  tsl.positionLocal.x,
  tsl.positionLocal.z,
);
```

The CPU height and GPU displacement come from the same parenthesized source
definition. They can still differ through floating-point rounding, compiler
contraction, reassociation, and backend behavior. A rendered triangle mesh can
also approximate the field between its vertices even when every sampled vertex
is correct. Arithmetic drift and mesh-materialization error are separate
budgets. That is why a field ships with measurements rather than an equality
assertion.

## What is actually guaranteed

Matter Field separates structural guarantees from observed evidence.

| Tier | Contract | Current evidence |
|---|---|---|
| CPU materializations | Fields restricted to committed constants and specified ECMAScript arithmetic are intended to be bit-stable across supported JS runtimes. | A committed 300-point golden passes on Node 18, 20, and 22 and in Chromium, Firefox, and WebKit main threads and Workers in [public CI](https://github.com/instruktlabs/matter-field/actions/workflows/ci.yml). |
| Integer hash | The raw u32 hash uses matching multiply, xor, and shift operations. Floats may enter only through `floor -> latt`; the currently supported floored lattice range is `[-131072, 131071]`. Identical lattice integers remain a precondition. | Eleven committed raw-u32 vectors were observed bit-exact on the current NVIDIA and AMD WebGPU and WebGL2 receipts. Float-to-lattice boundary vectors are still owed. |
| Float tree | CPU f64 and GPU f32 are **not** bit-exact. Each field declares an absolute-error budget in field units; ULP counts are diagnostic. | Receipts report the maximum observed drift over a named finite sample set on one hardware/backend combination. A passing receipt is not a universal bound. |

Read [the measurement contract](./docs/MEASUREMENT.md) before interpreting or
publishing a result. The shorter [claims ledger](./docs/CLAIMS.md) separates
what the current evidence supports from what remains unproven.

## Current measured receipts

All six current receipts used the same 300 committed f32 coordinate pairs over a
±20,000-unit extent: 24 targeted boundary/stamp/domain cases plus 276
deterministic LCG points. “Max observed abs” is the largest sampled error
across the four probed scalar outputs; it is not the worst possible value
everywhere.

The six-receipt matrix below measures the authoritative adapter through native
Three.js TSL. The TypeGPU result uses a different implementation and generated
WGSL, so its separate one-configuration receipt is not an additional cell in
this matrix.

| Hardware | Backend | Samples | Max observed abs | Max observed ULP | Raw hash vectors | Scope |
|---|---:|---:|---:|---:|---:|---|
| NVIDIA GeForce RTX 3070, Windows, Chrome 151 | WebGPU | 300 | `7.482643748e-4` | 623,919 | 11/11 exact | [receipt](./parity/reports/windows-local-webgpu.json) |
| NVIDIA GeForce RTX 3070, Windows, Chrome 151 | WebGL2 via ANGLE/D3D11 | 300 | `7.488812152e-4` | 385,346 | 11/11 exact | [receipt](./parity/reports/windows-local-webgl2.json) |
| AMD Radeon Vega 10, Linux, Chrome 150 | WebGPU via Vulkan | 300 | `7.822737963e-4` | 577,730 | 11/11 exact | [receipt](./parity/reports/linux-vega10-chrome-webgpu-2026-08-09.json) |
| AMD Radeon Vega 10, Linux, Chrome 150 | WebGL2 via ANGLE/Vulkan | 300 | `7.822737963e-4` | 577,730 | 11/11 exact | [receipt](./parity/reports/linux-vega10-chrome-webgl2-2026-08-09.json) |
| NVIDIA GeForce GTX 1660 Ti Max-Q, Linux, Chrome 150 | WebGPU via Vulkan | 300 | `7.689083759e-4` | 1,619,247 | 11/11 exact | [receipt](./parity/reports/linux-gtx1660ti-chrome-webgpu-2026-08-09.json) |
| NVIDIA GeForce GTX 1660 Ti Max-Q, Linux, Chrome 150 | WebGL2 via ANGLE/Vulkan | 300 | `7.689083759e-4` | 1,619,247 | 11/11 exact | [receipt](./parity/reports/linux-gtx1660ti-chrome-webgl2-2026-08-09.json) |
| Intel | — | — | — | — | — | unmeasured |
| Apple silicon / Metal | — | — | — | — | — | highest-priority missing cell |

Apple/Metal is especially valuable because it adds a different compiler/backend
family and an important consumer platform. Intel, other browsers, operating
systems, drivers, and GPU generations remain welcome evidence.

The receipt timing fields are diagnostic metadata, not performance results.
These captures were not run on controlled quiet hosts—the Windows machine in
particular had concurrent interactive and agent workloads—so they cannot rank
hardware, backends, or package speed.

## Interactive examples

The examples are small field laboratories, not benchmark claims against other
libraries:

- **[FIELDWORK: Breach Run](https://instruktlabs.github.io/matter-field/fieldwork/)** —
  the integrated 3D dogfood mission combining dunes, swell, wind, and the
  serpent field in one fixed-step CPU-authoritative game. Read its
  [architecture and asset record](./docs/FIELDWORK.md).
- [Dunes + collision](https://instruktlabs.github.io/matter-field/examples/dunes.html)
- [Swell + buoyancy](https://instruktlabs.github.io/matter-field/examples/swell.html)
- [Wind + forces](https://instruktlabs.github.io/matter-field/examples/wind.html)
- [Serpent + hit test](https://instruktlabs.github.io/matter-field/examples/serpent.html)
- [Live parity assay](https://instruktlabs.github.io/matter-field/examples/parity.html)

FIELDWORK is the application pressure test; each focused lab isolates one
consumer pair that would normally be split across CPU and GPU.
The live assay is the numeric evidence surface; a visual demonstration alone
does not establish a parity result.

## Design discipline

Fields that want portable evidence follow these rules:

1. Route every value-producing operation through the adapter.
2. Keep data-dependent branching outside the shared field tree.
3. Do not use `sin`, `cos`, `pow`, `exp`, or other transcendentals in the tree.
4. Precompute and commit transcendental constants as numeric literals.
5. Send floats to the integer hash only through `floor -> latt`.
6. Treat parenthesization, cache points, and stamp order as field identity.
7. Keep intermediates finite and normal over the supported input domain.
8. Set absolute-error budgets in application field units; never use ULP alone
   as a pass/fail threshold near zero crossings.

The adapter is a discipline, not a compiler that can prove arbitrary
JavaScript portable. Tests and receipts remain required.

## Scope

Matter Field is intentionally narrow:

- It is not a physics engine.
- It is not a stateful fluid, erosion, or cellular simulation framework.
- It is not primarily a noise collection.
- It is not a universal shader language or WebGPU resource layer.
- It does not make unmeasured hardware portable by assertion.

It fits closed-form scalar or vector fields that gameplay needs to query and
Three.js needs to materialize as TSL.

Use it when a procedural field is rendered densely on the GPU but queried
sparsely and immediately by CPU gameplay, Workers, or a server. Skip it when
only the shader consumes the field, a CPU-authored mesh or texture is already
the authority, the result can be baked, or the problem is a stateful
simulation. It is an inference surface, not a neural-network training system.

### Relationship to TypeGPU

[TypeGPU](https://docs.swmansion.com/TypeGPU/) is the closest general-purpose
overlap, not merely an adjacent WebGPU tool. Its `use gpu` functions remain
callable from JavaScript, [`@typegpu/three`](https://docs.swmansion.com/TypeGPU/ecosystem/typegpu-three/)
converts them to TSL for Three.js, and [`@typegpu/noise`](https://docs.swmansion.com/TypeGPU/ecosystem/typegpu-noise/)
provides procedural noise. TypeGPU owns a much broader typed WebGPU surface:
data schemas, resources, pipelines, and application structure.

Matter Field's adapter core explores a smaller evidence-first contract: no
transform step or required runtime dependency, f64/f32-estimate/dual/TSL
materializations, current Three WebGPU and WebGL2 probe paths, and public
hardware-scoped numeric receipts. The experimental TypeGPU subpath is
precompiled, but it has optional pinned runtime peers. Those are distinctions,
not proof that Matter Field is categorically better.

At the application level, [Eternal Ride](https://discourse.threejs.org/t/eternal-ride-infinite-terrain-in-three-js-with-no-lod-no-seams/91868)
is important Three.js prior art: it demonstrates CPU collision and GPU terrain
at enormous coordinates using carefully mirrored JavaScript/GLSL functions,
host-side wrapping, and a continuous terrain fan. It is a stronger large-world
demo than Matter Field's teaching labs. Matter Field's different trade is to
derive restricted backends from one definition and publish the observed
numeric residual instead of treating matching formulas as a proof.

See [Positioning](./docs/POSITIONING.md) for the project boundary.

## Local development

The core runtime and installed precompiled TypeGPU artifacts support Node 18 or
newer. Building, packing, type-checking, or probing the TypeGPU source requires
Node 20.19 or newer because the current `unplugin-typegpu` toolchain does.

```bash
npm ci
npm test
npm run test:package
npm run assay
npm run bench
```

For the full TypeGPU lane on Node 20.19 or newer:

```bash
npm run build:typegpu
npm run test:typegpu:build
npm run test:typegpu:types
npm run test:typegpu:consumer
npm run probe:typegpu
```

Run the real browser probes on hardware:

```bash
npm run probe:gpu
npm run probe:webgl2
```

Use `--headed` with `scripts/run-gpu-probe.mjs` when collecting a receipt for
contribution. Software adapters do not count as hardware evidence unless the
report is explicitly marked harness-only.

## Repository map

```text
src/adapter.js                 15-operation field contract
src/number.js                  f64 oracle and f32-emulation adapters
src/dual.js                    analytic value/gradient backend
src/noise.js                   portable field building blocks
src/hash.js                    raw u32 hash and shader references
src/backend-tsl.js             caller-supplied Three.js TSL backend
src/typegpu/                   handwritten optional TypeGPU materialization
dist-typegpu/                  generated precompiled publish artifacts
parity/harness.js              CPU assay and field-unit verdicts
parity/golden.js               deterministic points and f32 diagnostics
parity/gpu-probe-template.js   implemented WebGPU/WebGL2 assay
parity/typegpu-gpu-probe.js     TypeGPU compute and Three integration assay
parity/reports/                committed measured receipts
benchmarks/                    controlled CPU comparison and clean-host gate
examples/                      teaching fields and consumers
site/fieldwork/                integrated 3D dogfood mission
site/                          GitHub Pages source and focused labs
test/                          contract, examples, hash, and assay tests
tooling-tests/                 precompiled TypeGPU artifact checks
```

## Contributing

The most useful contributions right now are:

- real Intel and Apple silicon receipts, plus broader AMD and NVIDIA coverage;
- clean TypeGPU WebGPU receipts beyond the current single NVIDIA/Windows run;
- adversarial samples around lattice, stamp, zero-crossing, and time limits;
- browser/Worker bit-stability evidence;
- accessible interactive examples that pair real GPU rendering with CPU
  gameplay queries;
- field-identity and receipt-schema improvements;
- careful backend experiments that preserve the small core.

Start with [CONTRIBUTING.md](./CONTRIBUTING.md), the
[roadmap](./ROADMAP.md), the [receipt guide](./docs/RECEIPTS.md), and the
[community share draft](./docs/COMMUNITY-POST.md).

Do not publish this package to npm yet. The project will hold the first npm
release until the initial vendor matrix contains real NVIDIA, AMD, Intel, and
Apple silicon evidence. The v2 assay identity is already bound to coordinates,
expected CPU values, field sources, package version, and Three.js version.

## License and provenance

Matter Field's code and package documentation are available under the
[MIT License](./LICENSE). Fieldwork asset provenance and any provider-specific
release conditions are recorded separately in [docs/FIELDWORK.md](./docs/FIELDWORK.md).
Bundled dependency licenses and attributions are retained in
[THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
The adapter pattern was generalized from a pattern used in the proprietary OBJEKT-62 game;
the standalone examples contain no OBJEKT-62 game content. See
[PROVENANCE.md](./PROVENANCE.md) for the extraction record.
