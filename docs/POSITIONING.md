# Positioning and Project Boundary

## The short position

Matter Field is the shared field-math layer for procedural JavaScript and
Three.js TSL worlds: define a restricted field once, query it from gameplay,
materialize it for rendering, derive analytic gradients, and measure the
remaining numeric drift.

> If gameplay must touch it, do not leave it trapped in a shader.

The project is for developers who already recognize the split between what a
shader draws and what CPU systems can touch.

## The job it does

Matter Field combines four small surfaces:

1. a 15-operation abstract math adapter;
2. CPU f64, CPU f32-emulation, dual-number, and Three.js TSL backends;
3. deterministic teaching fields and consumer examples;
4. CPU and real-browser assays that emit reviewable evidence.

Its differentiator is not a new noise algorithm. It is the combination of one
authoritative expression, a deliberately restricted numeric vocabulary, and
hardware-scoped receipts.

## Market and product shape

Three.js is the beachhead, not an arbitrary limitation. The repository's
native TSL path, WebGPU/WebGL2 assays, and focused examples exercise one
concrete user problem: a GPU-rendered procedural world that CPU gameplay must
query immediately.

Use concentric audiences rather than one broad “all developers” message:

1. **Primary users — Three.js/TSL and React Three Fiber game or simulation
   developers.** They need terrain contact, buoyancy, wind, placement, AI, or
   hit tests to agree with a shader-defined world.
2. **Adjacent users — TypeGPU developers building procedural world fields.**
   They may value Matter Field's restricted numeric contract, generic CPU dual
   derivatives, native TSL/WebGL2 lane, and receipt system while retaining
   TypeGPU for broader GPU resources and pipelines.
3. **Evidence collaborators — WebGPU portability and procedural-generation
   developers.** They can supply devices, adversarial cases, and architectural
   critique even when Matter Field is not directly installable in their stack.

Generic web developers, shader-art-only projects, ML training systems, and
Unity/Godot/Unreal projects are not present product audiences.

The architecture should be explained as one product, two entry points, and one
authority:

| Surface | Role | Present source status |
|---|---|---|
| Core + native Three.js TSL | Primary dependency-free entry; f64, f32 diagnostic, dual gradients, WebGPU, and WebGL2 | Materialized structurally from the adapter-authored field |
| Optional TypeGPU + `@typegpu/three` | WebGPU-oriented entry for TypeGPU users | Precompiled and assayed, but currently a handwritten field twin |
| Adapter-authored field | Numeric and identity authority | Canonical today |
| Research canonical IR | Candidate future generation boundary | Dunes recorder/source-emitter prototype exists; not shipped architecture or GPU evidence |

## What it should not claim

Avoid these positions:

- “CPU and GPU always match.”
- “Bit-exact procedural worlds on every GPU.”
- “A universal math portability layer.”
- “A replacement for a physics engine.”
- “A faster or better noise library” without a scoped benchmark.
- “A general WebGPU framework.”

Prefer:

- “one expression tree, several measured materializations”;
- “authoritative procedural fields for gameplay and rendering”;
- “maximum observed drift over this named sample set and machine”;
- “bring a GPU and add a receipt.”

## Adjacent tools

Noise libraries provide rich generators and often outperform Matter Field at
dense CPU sampling. Physics engines manage state, bodies, constraints, and
collision response. Shader languages and node systems author GPU programs.
Matter Field is narrower: it helps a pure field remain structurally shared
when more than one of those systems needs to evaluate it.

## TypeGPU, narrowly

TypeGPU is the closest direct overlap. Its `use gpu` functions can remain
CPU-callable, `@typegpu/three` converts functions to Three.js TSL, and the
ecosystem includes `@typegpu/noise`. It also has a substantially broader
responsibility: typed shader authoring, data layouts, resources, pipelines,
and WebGPU application structure. Matter Field should acknowledge that overlap
and should not present itself as the first shared CPU/GPU source approach.

The primary Matter Field path targets caller-supplied Three.js TSL because that
is the concrete integration extracted, exercised, and measured. The optional
`matter-field/typegpu` subpath hand-ports the shipped fields into
precompiled TypeGPU functions with pinned optional peers; it does not yet
materialize arbitrary adapter-authored fields. A future generated TypeGPU
backend could translate the same restricted adapter operations while leaving
pipeline and resource ownership to TypeGPU. That would demonstrate another
materialization target; it would not change Matter Field's core job.

The honest present distinction is evidence and scope: Matter Field's core has
a restricted no-transform adapter, f64/f32-estimate/dual/TSL materializations,
Three WebGPU and WebGL2 probes, and source-bound public receipts. The optional
TypeGPU integration is precompiled but adds runtime peers. Whether that
combination deserves an independent package is a question for real users, not
a conclusion established by the current benchmarks.

The first clean TypeGPU receipt covers one RTX 3070 / Windows / Chrome WebGPU
configuration. It checks the precompiled port against the adapter f64 authority
at named CPU samples, measures four GPU scalar outputs against existing field
budgets, and smoke-tests the five Three helpers. It does not establish a speed
advantage, a cross-vendor result, numeric serpent parity, or a generated
single-source architecture. Keep it separate from the native-TSL vendor matrix.

The TypeGPU lane is therefore a supported experiment and comparison surface,
not the brand headline. Projects that need general typed WebGPU programming,
buffers, compute, inference kernels, or ordinary control flow should generally
start with TypeGPU itself. Matter Field should earn adoption through the
narrower authority-and-evidence job.

## Application-level precedent

[Eternal Ride](https://discourse.threejs.org/t/eternal-ride-infinite-terrain-in-three-js-with-no-lod-no-seams/91868)
is close prior art in the Three.js community. It evaluates corresponding
terrain algorithms for GPU rendering and CPU collision while solving a harder
large-coordinate presentation problem with f64 host wrapping, small
GPU-relative coordinates, and a continuous terrain fan. It is a compelling
application, not an adapter library.

Its published source uses separately maintained JavaScript and GLSL terrain
implementations. Matter Field's narrower contribution is the shared restricted
definition plus an explicit measurement ledger. Do not frame that distinction
as a takedown: Eternal Ride demonstrates the use case better, while Matter
Field makes a different authoring and evidence trade.

## Evidence categories

Keep four questions separate:

1. **Structural:** did every consumer derive from the same field definition?
2. **Numeric:** what drift was observed over which inputs and hardware?
3. **Application:** did sharing the field remove a real gameplay failure or
   maintenance burden?
4. **Performance:** what did the approach cost against a named baseline and
   workload?

The current repository has meaningful evidence for the first two, interactive
illustrations for the third, and only machine-local total-cost timings for the
fourth. It does not yet prove adoption, necessity, or superior performance.

## Deferred positions

Do not use raw WGSL, neural networks, or general-engine portability to enlarge
the launch story. They dilute the tested job and currently lack shipped
integration evidence. Reconsider them only after the canonical authority work
is stable and a real adopter demonstrates a use case the two current entry
points cannot serve.

## Contributor appeal

The project can grow without a large existing audience by making the open work
legible:

- the vendor matrix has obvious empty cells;
- receipts are small, attributable contributions;
- failed results are welcome evidence;
- interactive examples make numeric abstractions tangible;
- backend proposals have a clear contract and review bar.

The most credible invitation is therefore not “star a finished library.” It is:

> Bring a field, a browser, or a GPU. Help make the evidence better.
