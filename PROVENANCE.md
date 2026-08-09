# Provenance

Matter Field was generalized from a math-adapter pattern used in the
proprietary OBJEKT-62 game. The standalone source was extracted from
`incubator/matter-field` at OBJEKT-62 commit
`5c0bc3663603a1113cb56090a31fe7c628b43a71` on 2026-08-09.

The standalone repository's root commit,
`026d7e0eccf9af1453b06e126b67c3b22e9f7eef`, preserves that incubator package
before public-release scaffolding. Subsequent licensing, CI, measurement,
documentation, and site changes therefore remain reviewable as a separate
history.

## What was generalized

The reusable idea is a small abstract math adapter that lets a pure procedural
field be evaluated as CPU numbers, analytic dual numbers, or a shader graph.
The package also includes a new parity harness, portable hash surface, and
teaching examples for the standalone project.

## What was not copied

The standalone package contains no OBJEKT-62 production dune constants,
authored site stamps, creature trajectories, game assets, story content, or
world data. Its dunes, swell, wind, and serpent examples were written as
smaller teaching fields for the generalized 15-operation contract.

This provenance statement describes the extraction boundary; it is not a
claim that every future contribution is derived from OBJEKT-62. Contributors
retain responsibility for submitting work they have the right to license.

## Ownership and license

The extracted standalone work is copyright Instrukt Labs LLC and is released
under the [MIT License](./LICENSE). OBJEKT-62 remains proprietary and is not
licensed by this repository.

