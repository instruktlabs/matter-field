# Contributing to Matter Field

Matter Field welcomes code, documentation, browser evidence, and hardware
receipts. The project is small by design: contributions should make the field
contract easier to trust, measure, understand, or use without turning it into
a general-purpose engine.

By participating, you agree to follow the [Code of Conduct](./CODE_OF_CONDUCT.md).

## Good first contributions

- Run the existing assay on an unmeasured GPU and submit the JSON receipt.
- Add an adversarial sample that exposes an important numeric edge case.
- Improve an example's keyboard, touch, reduced-motion, or screen-reader path.
- Clarify a limit or replace an equality claim with measured language.
- Add a test for an adapter operation or field identity rule.

Before starting a large backend or API change, open a proposal issue so scope
can be aligned before implementation.

## Set up

```bash
npm ci
npm test
npm run test:package
```

Useful local commands:

```bash
npm run assay
npm run bench
npm run site:build
npm run test:browsers
```

The browser suite requires Playwright browsers. Install them with:

```bash
npx playwright install chromium firefox webkit
```

## Change classes

### Documentation or governance

Check local links, commands, names, and numeric claims against repository
truth. A screenshot is useful for site-facing changes, but not required for
plain Markdown.

### Field or adapter changes

Changes to `src/`, `examples/`, field constants, operation ordering, or cache
placement can change field identity. Run:

```bash
npm test
npm run assay
npm run probe:gpu
npm run probe:webgl2
```

Attach new receipts when the field identity or GPU output changes. Do not
silently keep an old receipt next to changed field code.

### Site and interactive examples

Test the production build at desktop and mobile widths. Exercise keyboard,
pointer, and touch paths. Capture console errors. Interactive examples should
state which work is CPU, which is GPU, and which values are measured rather
than visually inferred.

### New backend proposals

A backend proposal should explain:

- what ecosystem it serves;
- how each adapter operation maps to the target;
- what numeric semantics are specified versus implementation-dependent;
- how it will emit a comparable receipt;
- whether it adds runtime or peer dependencies.

Matter Field currently prioritizes JavaScript and caller-supplied Three.js
TSL. A raw WGSL, TypeGPU, or other backend should remain optional and should
not broaden the core contract without evidence.

## Hardware receipts

Read [docs/RECEIPTS.md](./docs/RECEIPTS.md) before running the probe. The short
version is:

```bash
node scripts/run-gpu-probe.mjs --backend=webgpu --headed
node scripts/run-gpu-probe.mjs --backend=webgl2 --headed
```

A useful receipt includes:

- actual GPU and driver;
- backend, browser, and operating system;
- package version and source commit when available;
- point count and golden-set identity;
- per-field maximum observed absolute drift and budgets;
- ULP values clearly labeled diagnostic;
- raw hash comparison;
- whether a software adapter was involved.

A passing result applies only to the recorded configuration and finite sample
set. Do not describe it as a universal bound or cross-vendor guarantee.

## Numeric review rules

Reviewers will look for these invariants:

1. Every shared value operation goes through the adapter.
2. Transcendentals are absent from the shared tree.
3. Transcendental constants are precomputed and committed as literals.
4. Floats reach the integer hash only through `floor -> latt`.
5. Parenthesization, cache points, and stamp order are intentional.
6. Intermediates stay finite and normal within the declared domain.
7. Absolute error in field units decides field-level pass/fail.
8. ULP is reported as a diagnostic, not used alone near zero crossings.

If a change intentionally breaks one of these rules, it needs a new contract,
new identity, tests, and evidence—not just an explanatory comment.

## Pull requests

Keep pull requests focused. Include:

- the problem and intended user-visible outcome;
- tests run and their results;
- receipt paths for numeric changes;
- screenshots or recordings for interactive changes;
- known limits and unmeasured configurations.

Do not include generated browser profiles, Playwright state, build output, or
unrelated machine-local artifacts.

## Commit and release policy

Maintainers control releases. Contributors should not publish the package to
npm or create release tags. The project is intentionally holding npm release
until the source-bound v2 receipts and initial hardware matrix are reviewed.

## Reporting problems

Use the GitHub issue forms for reproducible bugs, hardware receipts, and scoped
proposals. Report security issues privately as described in
[SECURITY.md](./SECURITY.md).
