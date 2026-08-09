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

> **Public preview:** MIT licensed, zero runtime dependencies, and not yet
> published to npm. The first hardware receipts cover one NVIDIA RTX 3070 on
> Windows through WebGPU and WebGL2. AMD, Intel, and Apple silicon remain open
> cells, so no cross-vendor portability claim is being made yet.

[Open the live examples](https://instruktlabs.github.io/matter-field/#examples)
· [Inspect the receipts](https://instruktlabs.github.io/matter-field/#evidence)
· [Contribute a hardware result](./docs/RECEIPTS.md)

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

The CPU height and GPU displacement come from the same parenthesized field
definition. They can still differ by floating-point rounding, compiler
contraction, and backend behavior. That is why a field ships with budgets and
receipts rather than an equality assertion.

## What is actually guaranteed

Matter Field separates structural guarantees from observed evidence.

| Tier | Contract | Current evidence |
|---|---|---|
| CPU materializations | Fields restricted to committed constants and specified ECMAScript arithmetic are intended to be bit-stable across supported JS runtimes. | A committed 300-point golden passes on Node 18, 20, and 22 and in Chromium, Firefox, and WebKit main threads and Workers in [public CI](https://github.com/instruktlabs/matter-field/actions/workflows/ci.yml). |
| Integer hash | The raw u32 hash uses matching multiply, xor, and shift operations. Floats may enter only through `floor -> latt` within the documented lattice domain. | Eleven committed vectors were observed bit-exact on the current NVIDIA WebGPU and WebGL2 receipts. |
| Float tree | CPU f64 and GPU f32 are **not** bit-exact. Each field declares an absolute-error budget in field units; ULP counts are diagnostic. | Receipts report the maximum observed drift over a named finite sample set on one hardware/backend combination. A passing receipt is not a universal bound. |

Read [the measurement contract](./docs/MEASUREMENT.md) before interpreting or
publishing a result.

## Current measured receipts

Both current receipts used 300 committed f32 coordinate pairs over a
±20,000-unit extent: 24 targeted boundary/stamp/domain cases plus 276
deterministic LCG points. “Max observed abs” is the largest sampled error
across the four probed scalar outputs; it is not the worst possible value
everywhere.

| Hardware | Backend | Samples | Max observed abs | Max observed ULP | Raw hash vectors | Scope |
|---|---:|---:|---:|---:|---:|---|
| NVIDIA GeForce RTX 3070, Windows, Chrome 151 | WebGPU | 300 | `7.482643748e-4` | 623,919 | 11/11 exact | [receipt](./parity/reports/windows-local-webgpu.json) |
| NVIDIA GeForce RTX 3070, Windows, Chrome 151 | WebGL2 via ANGLE/D3D11 | 300 | `7.488812152e-4` | 385,346 | 11/11 exact | [receipt](./parity/reports/windows-local-webgl2.json) |
| AMD | — | — | — | — | — | unmeasured |
| Intel | — | — | — | — | — | unmeasured |
| Apple silicon / Metal | — | — | — | — | — | highest-priority missing cell |

Apple/Metal is especially valuable because compiler fast-math behavior is a
known portability pressure point. Results from other browsers, operating
systems, drivers, and GPUs are also welcome.

## Interactive examples

The examples are small field laboratories, not benchmark claims against other
libraries:

- [Dunes + collision](https://instruktlabs.github.io/matter-field/examples/dunes.html)
- [Swell + buoyancy](https://instruktlabs.github.io/matter-field/examples/swell.html)
- [Wind + forces](https://instruktlabs.github.io/matter-field/examples/wind.html)
- [Serpent + hit test](https://instruktlabs.github.io/matter-field/examples/serpent.html)
- [Live parity assay](https://instruktlabs.github.io/matter-field/examples/parity.html)

Each example pairs consumers that would normally be split across CPU and GPU.
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

### Relationship to TypeGPU

[TypeGPU](https://docs.swmansion.com/TypeGPU/) is a broader typed WebGPU
toolkit concerned with shader authoring, resources, pipelines, and WebGPU
application structure. Matter Field does not replace that surface. Its current
GPU integration is deliberately smaller and Three.js-specific: adapt one
restricted field expression to TSL and measure CPU/GPU drift. The two ideas
could coexist; a TypeGPU adapter would be a future backend, not a reason to
turn Matter Field into another general WebGPU framework.

See [Positioning](./docs/POSITIONING.md) for the project boundary.

## Local development

Requires Node 18 or newer.

```bash
npm ci
npm test
npm run test:package
npm run assay
npm run bench
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
parity/harness.js              CPU assay and field-unit verdicts
parity/golden.js               deterministic points and f32 diagnostics
parity/gpu-probe-template.js   implemented WebGPU/WebGL2 assay
parity/reports/                committed measured receipts
examples/                      teaching fields and consumers
site/                          GitHub Pages source
test/                          contract, examples, hash, and assay tests
```

## Contributing

The most useful contributions right now are:

- real AMD, Intel, and Apple silicon receipts;
- adversarial samples around lattice, stamp, zero-crossing, and time limits;
- browser/Worker bit-stability evidence;
- accessible interactive examples that pair real GPU rendering with CPU
  gameplay queries;
- field-identity and receipt-schema improvements;
- careful backend experiments that preserve the small core.

Start with [CONTRIBUTING.md](./CONTRIBUTING.md), the
[roadmap](./ROADMAP.md), and the [receipt guide](./docs/RECEIPTS.md).

Do not publish this package to npm yet. The project will hold the first npm
release until the initial vendor matrix contains real NVIDIA, AMD, Intel, and
Apple silicon evidence. The v2 assay identity is already bound to coordinates,
expected CPU values, field sources, package version, and Three.js version.

## License and provenance

Matter Field is available under the [MIT License](./LICENSE). It was
generalized from a math-adapter pattern used in the proprietary OBJEKT-62 game;
the standalone examples contain no OBJEKT-62 game content. See
[PROVENANCE.md](./PROVENANCE.md) for the extraction record.
