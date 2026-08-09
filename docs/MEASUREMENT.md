# Measurement Contract

Matter Field uses measurements to constrain claims. This document defines what
a receipt proves, what it does not prove, and how field budgets are interpreted.

## Structural identity versus numeric result

One field definition is materialized through several adapters. Sharing that
definition removes a hand-maintained second formula, but it does not remove
backend arithmetic differences. A receipt compares specific materializations
at specific inputs.

Current probes evaluate four scalar outputs:

- `dunes`;
- `swell(A, x, z, A.f(2.5))`;
- `wind(A, x, z, A.f(1)).wx`;
- `wind(A, x, z, A.f(1)).wz`.

The serpent example builds through TSL in tests but is not yet included in the
numeric GPU receipt. Do not imply that the current matrix measures it.

The probe measures **field-evaluation drift at sampled coordinates**. It does
not measure the distance between an analytic CPU field and the triangles,
voxels, particles, or other geometry used to display it. Tessellation,
interpolation, LOD, morphing, normal reconstruction, and collision-shape
approximation need separate application-level assays and budgets.

## Receipt v2

The current `matter-field-gpu-parity/v2` reports contain:

- requested and actual backend;
- available adapter/GPU information;
- deterministic sample-set metadata;
- point count;
- per-field maximum observed absolute error;
- per-field maximum observed ULP distance;
- field budgets;
- raw u32 hash comparisons;
- browser, operating system, and local run metadata when collected by the
  Playwright runner.

The v2 golden-set SHA-256 binds the coordinate payload, expected CPU value
bits, hashes of the field/adapter source files, package version, and Three.js
version. The runner also records the Git commit and whether the worktree was
dirty. A clean receipt must be regenerated after any identity-changing source
edit; the source hashes are the numeric identity while the commit makes the
repository state reviewable.

## How to read a pass

A field passes one receipt when every sampled absolute error is at or below its
declared budget and every sampled raw hash vector matches.

That pass means:

> On this recorded hardware, driver, browser, backend, source state, and finite
> sample set, no observed value exceeded the declared field-unit budget.

It does not mean:

- the CPU and GPU values were equal;
- the budget is a mathematical global bound;
- untested coordinates pass;
- another GPU, browser, driver, backend, or compiler passes;
- a later field implementation has the same result;
- every package example was probed.

Use “maximum observed” for sampled results. Reserve “bound” for a quantity that
has actually been derived or exhaustively established over a declared domain.

## Absolute error and ULP

Field behavior is judged in application field units. For a height field, an
absolute budget can be interpreted as vertical distance. For wind, it is a
velocity component. The field author must choose a budget that is meaningful
to gameplay, not merely convenient for the implementation. The current
example budgets are regression thresholds set above previously observed
values; they have not yet been derived from a particular game's contact,
buoyancy, force, or targeting tolerance.

ULP distance remains useful diagnostic evidence, but it is a poor universal
pass criterion. Near zero crossings, the spacing between representable f32
values shrinks and a physically negligible absolute error can span many ULPs.
Reports therefore retain ULP values without using them alone to decide pass.

## Current deterministic sample set

The committed reports use 300 f32 coordinate pairs over a ±20,000-unit extent:
24 targeted boundary, stamp, and domain cases plus 276 points generated from
seed `0x9e3779b9`. Coordinates are rounded to f32 before upload so the CPU and
GPU comparison begins from the same sampled input.

This mixed set is a baseline, not exhaustive coverage. Future revisions should
continue expanding targeted cases around:

- positive and negative lattice boundaries;
- supported coordinate-domain limits;
- stamp inner and outer radii;
- field zero crossings and extrema;
- long-running time inputs and host-side time wrapping;
- values that exercise min, max, clamp, smoothstep, and square root edges.

## Three evidence tiers

### CPU materialization

CPU stability depends on using committed constants and operations whose
ECMAScript results are specified for the supported finite, normal domain.
Re-evaluation in one process proves only local determinism. Cross-runtime
claims require comparing bits across Node versions, browser engines, and
Workers.

### Raw integer hash

The raw hash is compared before the intentionally lossy u32-to-f32 conversion.
Its exactness depends on matching u32 operation sequences and the sanctioned
`floor -> latt` input path. The conservative supported domain for the floored
value entering `latt` is `[-131072, 131071]`; after the offset and current
corner-channel offsets, those remain exactly represented non-negative f32
integers. Reports identify the finite raw-u32 vectors actually tested. The v2
probe does not yet exercise float values immediately around lattice boundaries,
so it establishes the hash core rather than the entire float-to-hash path.

### Float expression tree

WGSL/GLSL materialization is f32 and may differ from JavaScript f64 through
rounding, division accuracy, contraction, reassociation, denormal handling,
or implementation behavior allowed by the backend. The package reduces this
surface with a restricted vocabulary and then measures the result.

## Publishing results

Do not merge numbers copied from screenshots or handwritten summaries. Commit
the raw JSON, preserve the environment fields, and link the receipt from the
matrix. If adapter identity is ambiguous on a multi-GPU system, treat the
result as incomplete until the actual renderer device is confirmed.

See [RECEIPTS.md](./RECEIPTS.md) for the contribution procedure.
