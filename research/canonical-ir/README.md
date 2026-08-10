# Canonical IR research prototype

This directory tests one narrow question from
[issue #10](https://github.com/instruktlabs/matter-field/issues/10): can an
adapter-authored Matter Field be recorded once and emitted as reviewable
TypeGPU source without making the TypeGPU formula a second authority?

The answer for the shipped dunes field is provisionally yes. This is research,
not a package export or migration.

## What exists

- `canonical-ir.js` implements the complete 15-operation recording adapter,
  validation, canonical serialization, SHA-256 identity, and an f64 evaluator.
- `dunes-ir.js` executes the existing authoritative `dunesField` once against
  that recorder. It copies no field formula or constants.
- `typegpu-emitter.js` emits expanded, readable `'use gpu'` source and a typed
  TypeGPU kernel.
- `inspect.mjs` prints the IR shape, generated source, or verifies the actual
  unplugin-TypeGPU/esbuild transform in memory.
- `test/ir/canonical-ir.test.js` checks exact constant identity, lattice/hash
  discipline, deterministic structure, and the committed CPU sample set.

At the current source state, dunes records as 453 ordered nodes: 28 hashes, 14
floors, 14 lattice conversions, and 55 explicit cache boundaries. Its canonical
serialization is 37,269 bytes and its generated TypeGPU source is 468 lines.
Those measurements describe this prototype implementation; they are not an API
or optimization target.

## What the current tests establish

- IEEE-754 f64 constants preserve their exact bits, including the distinction
  between `0` and `-0`.
- A lattice value can only derive from `floor` through explicit cache nodes.
- Serialization and IR identity are deterministic for the same source field.
- At all 300 committed assay coordinates, the IR f64 evaluator is bit-identical
  to both the authoritative number-adapter result and the current handwritten
  TypeGPU direct-CPU result.
- At those coordinates, the IR f32 evaluator is bit-identical to the existing
  operation-wise f32 adapter.
- The emitted function's direct CPU execution matches the handwritten TypeGPU
  function at those same points.
- The emitted module passes the real TypeGPU/esbuild transform.

Run the focused checks:

```sh
node --test test/ir/canonical-ir.test.js
node research/canonical-ir/inspect.mjs
node research/canonical-ir/inspect.mjs --verify-typegpu
```

## What remains unproven

- No generated artifact is part of the package export map.
- No browser/GPU numeric assay or hardware receipt covers the generated code.
- The generated source is deliberately expanded and substantially larger than
  the handwritten helper-based implementation.
- A source-visible cache alias cannot force a shader compiler to materialize or
  preserve that boundary.
- The prototype reuses the existing TypeGPU hash and smooth primitives; those
  dependencies must be included in any future generator identity.
- Only dunes is recorded. Swell, wind, serpent, vector outputs, and time inputs
  are future design tests.
- Agreement at 300 finite points is regression evidence, not proof over the
  supported domain.

Do not replace the handwritten TypeGPU exports until generated output is
packaged from a clean build, assayed on a real GPU against the same oracle and
budgets, identity-bound, and independently reviewable.
