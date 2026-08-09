# matter-field

Write world math once. Run it as CPU numbers, GPU shader graphs, and analytic
gradients - with a measurable parity contract instead of hope.

**Status: incubated package.** Extracted 2026-08-09 from OBJEKT-62 (where the
pattern shipped as the terrain core and the sandworm trajectory of a live
WebGPU open-world game) for promotion into its own repository. Zero runtime
dependencies. Everything CPU-side is tested here (`npm test`, 41 tests); the
GPU numeric probe requires a browser and is included as a documented template.

## The problem

GPU vertex displacement is invisible to CPU physics - engine-documented in
Unreal (World Position Offset "does not change collision"), Unity, and
three.js alike. The standard outs all hurt: duplicate the math in two
languages and drift; bake heightmaps and lose proceduralism; read the GPU back
and eat frames of latency; or generate everything on CPU and forfeit GPU
displacement. Multiplayer makes it worse: a server that cannot afford a GPU
still has to agree with every client about the ground.

## The pattern

A field is a pure, branchless expression tree written once against a ~15-op
abstract math adapter `A`:

```js
import { fbm, ridge, stamp } from 'matter-field/noise';

export function myTerrain(A, x, z) {
  const base = fbm(A, x, z, 0.0016, 2);
  const h = A.mul(A.sub(base, A.f(0.5)), A.f(24));
  return stamp(A, h, x, z, { cx: 120, cz: -340, rIn: 40, rOut: 90, level: 14 });
}
```

Then every backend runs the SAME function:

```js
import { numberAdapter, makeF32Adapter, surfaceNormal } from 'matter-field';
import { makeTslAdapter } from 'matter-field/backend-tsl';
import * as tsl from 'three/tsl';

myTerrain(numberAdapter, x, z);        // f64 CPU oracle: collision, AI, server sim
myTerrain(makeF32Adapter(), x, z);     // GPU-drift emulation for the assay
surfaceNormal(myTerrain, x, z);        // analytic gradient via dual numbers
myTerrain(makeTslAdapter(tsl), px, pz) // WGSL/GLSL vertex displacement graph
```

Collision equals render because there is nothing to diverge: gameplay samples
the limit function the mesh is an approximation of. The server needs no
assets, no GPU, no readback - it imports the module.

## The guarantee tiers (state these honestly or not at all)

| Tier | Claim | Basis |
|---|---|---|
| 1 | CPU <-> CPU (browser, Worker, Node): **bit-exact** | ECMAScript fully specifies f64 arithmetic (roundTiesToEven) |
| 2 | Integer lattice hash CPU <-> GPU: **bit-exact** | u32 mul/xor/shift are exact mod 2^32 in JS (`Math.imul`, `>>>`), WGSL, and GLSL - no accuracy-table latitude |
| 3 | Float tree CPU <-> GPU: **bounded by f32 rounding** | WGSL 15.7: `+ - *` correctly rounded (no mandated direction), `/` 2.5 ulp, smoothstep inherits `/`, reassociation/FMA permitted. Origin measurement: max 0.43 mm / 28 ulp over a full production terrain (NVIDIA Turing, WebGPU) |

Tier 3 is why the design rules below exist: the restricted op set is exactly
the subset where the specs bound divergence. `sin`-based hashes and
cancellation-dependent math are the documented casualty classes (Metal
compiles shaders fast-math by default; WebGPU has no off switch).

## The design rules (the contract beyond the signatures)

1. **No data-dependent branching.** Selection is mix/smoothstep/min/max, so
   the graph is straight-line shader code with identical evaluation order.
2. **No transcendentals in the tree.** No cross-vendor precision contract on
   GPUs; JS `Math.sin` is not correctly rounded either. Fold trig of
   constants on the host; oscillate with `pwave` (floor-based, exact).
3. **Floats reach the hash only through `floor -> latt`.** `floor` is exact
   by spec; any other float-to-int path voids Tier 2.
4. **Parenthesization and stamp order are part of the field.** Reassociating
   "equivalent" float expressions changes the world.
5. **Constants are shared f64 literals** consumed by every backend.
6. **Keep intermediates finite and normal** (specs permit denormal flushing
   and assume no inf/NaN).
7. **Every op goes through the adapter.** The dual backend doubles as the
   lint: naked `+` on a dual is NaN, and the assay fails loudly.

## Layout

```
src/adapter.js     the 15-op contract + structural/numeric conformance checks
src/hash.js        the bit-exact u32 hash: JS + WGSL + GLSL, golden-vector locked
src/number.js      numberAdapter (f64 oracle) + makeF32Adapter (drift emulation)
src/dual.js        dual-number backend: analytic gradients/normals/tangents
src/noise.js       vnoise, fbm, ridge, pwave, stamp - written once against A
src/backend-tsl.js Three.js TSL backend (dependency-inverted: pass your three/tsl)
parity/golden.js   golden points, f32 ulp arithmetic, capture/compare
parity/harness.js  runCpuAssay + assayVerdict - the CPU half of the proof
parity/gpu-probe-template.js  the browser/WebGPU half (documented method)
examples/          four fields, four walls (below)
test/              41 tests, node --test, zero deps
```

## The examples (each breaks a documented wall)

| Example | The wall it breaks |
|---|---|
| `dunes.js` | Terrain collision vs GPU-displaced render - the origin pattern, with authored-pad stamps that stay exactly flat on both sides |
| `swell.js` | Boat physics on GPU-displaced water: buoyancy samples the same animated sea the vertex shader displaces - no readback, no proxy plane; a server evaluates the identical sea state from the shared clock |
| `wind.js` | Visual-only GPU particles: one vector field both advects a million motes (TSL) and applies forces to gameplay bodies (CPU) - the glider drifts with the particles it flies among |
| `serpent.js` | Vertex-animated creatures with no hitbox: a closed-form spine with retarded-time coils; the GPU swarm and the CPU hit test evaluate the same curve, so the hitbox IS the visual. Dual backend gives analytic tangent frames |

```
npm test        # 41 tests (contract, hash goldens, noise, assays, examples, TSL smoke)
npm run assay   # demo: all four fields through every backend + CPU assay table
npm run bench   # adapter cost on this machine
```

Sandbox results (Node 22, x64 container, 2026-08-09): all tests green; f32
absolute drift over a +-20 km golden extent: dunes 9.5e-4, swell 2.6e-4, wind
2.6e-5 field units; dual backend bit-exact against the number backend on all
fields; example-field cost 0.8 us/sample (f64), 5.0 us/sample with full
gradients (the origin's full production terrain measured 8.7 us/sample).

Note the assay budgets ABSOLUTE drift, not ulps: near a field's zero
crossings, physically negligible drift measures as thousands of ulps because
ulps shrink toward zero. Both numbers are reported; only the absolute one is
budgeted by default.

## What this is not

- Not a physics engine, and not for stateful simulation (erosion, fluids) -
  fields must be closed-form pure functions.
- Not bit-exact floats across CPU/GPU - nothing is; see Tier 3.
- Not a noise library first. FastNoiseLite et al. have more noise. What they
  do not have is any cross-backend agreement contract - that is the product.
- CPU throughput is adapter-shaped (~1-9 us/sample): fine for gameplay
  queries (tens to hundreds per frame), wrong for CPU meshing over dense
  grids.

## Promotion checklist (turning this into its own repo)

1. Copy `incubator/matter-field/` out; `npm install` needs nothing (dev-only:
   `npm i -D three` to enable the TSL smoke test).
2. Wire the GPU probe: bundle `parity/gpu-probe-template.js`'s sketch with
   your bundler + Playwright against a real `three/webgpu` build.
3. Fill the vendor matrix before ANY public parity claim: NVIDIA, AMD, Intel,
   Apple silicon (Metal fast-math is the highest-value cell), plus WebGL2
   fallback. Publish measured numbers; let them make the claim.
4. Decide licence + name (currently UNLICENSED, working title matter-field;
   owner decision - the pattern originates in proprietary OBJEKT-62 code,
   generalized here without game content).
5. CI: `node --test` on Node 18/20/22 (Tier 1 is a cross-runtime claim -
   test it as one).
6. Consider `backend-wgsl` (raw string codegen, Three-independent) as the
   second GPU backend to prove genericity.

## Provenance

Generalized from OBJEKT-62's `src/heightcore.js` (terrain, shipped),
`src/loop/keeperSwarm.js` (trajectory swarm, shipped), and
`dev/rd/terrain-parity/` (the Fence A parity lane that measured the origin
claims). Analysis behind the extraction:
`brainstorm/research/MATH-ADAPTER-MATTER-FIELD-ANALYSIS.md` in the same
repository. No game content (dune constants, site stamps, creature
trajectories) was copied - the examples here are new, smaller, and exist to
teach the discipline.
