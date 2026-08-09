# Positioning and Project Boundary

## The short position

Matter Field is the shared field-math layer for procedural JavaScript and
Three.js TSL worlds: define a restricted field once, query it from gameplay,
materialize it for rendering, derive analytic gradients, and measure the
remaining numeric drift.

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

TypeGPU is a typed WebGPU toolkit with a substantially broader responsibility:
shader authoring, data layouts, resources, pipelines, and WebGPU application
structure. Matter Field should not duplicate those concerns or present itself
as a competing general framework.

The current Matter Field backend targets caller-supplied Three.js TSL because
that is the concrete integration extracted and measured. A future TypeGPU
backend could translate the same restricted adapter operations while leaving
pipeline and resource ownership to TypeGPU. That would demonstrate another
materialization target; it would not change Matter Field's core job.

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

