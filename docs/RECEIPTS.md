# Contributing a Hardware Receipt

Hardware receipts are the highest-priority Matter Field contribution. They
turn an abstract portability claim into a visible, reproducible ledger of what
was actually observed.

Read [MEASUREMENT.md](./MEASUREMENT.md) first.

## Needed configurations

The first matrix targets:

- NVIDIA WebGPU and WebGL2;
- AMD WebGPU and WebGL2;
- Intel WebGPU and WebGL2;
- Apple silicon WebGPU/Metal and the available fallback path.

The existing NVIDIA RTX 3070 result is useful but should be reproduced on
other drivers, browsers, and operating systems. Apple/Metal is the most
important missing cell.

## Before running

1. Use a clean checkout of the commit you intend to report.
2. Record `git rev-parse HEAD` and `git status --short`.
3. Install exactly from the lockfile with `npm ci`.
4. Confirm the browser is using the intended hardware GPU.
5. Close workloads that could force a software adapter or unusual power mode.
6. Understand that the generated report publishes GPU, driver, browser, and
   operating-system details. Review it before submission.

## Run the probes

```bash
node scripts/run-gpu-probe.mjs --backend=webgpu --headed
node scripts/run-gpu-probe.mjs --backend=webgl2 --headed
```

The runner writes JSON under `artifacts/gpu-reports/` by default. A software
adapter marks the report failed unless explicitly allowed for harness-only
testing. Harness-only evidence does not fill a hardware matrix cell.

## Inspect the result

Confirm:

- `schema` is `matter-field-gpu-parity/v2`;
- `backend` matches the requested backend;
- `pointCount` is the standard committed count;
- `goldenSet.sha256` matches the source checkout's generated identity;
- the GPU and driver identify the intended device;
- browser and OS metadata are present;
- `run.softwareAdapter` is `false` for a hardware receipt;
- each field reports `maxAbs`, `maxUlp`, `budget`, and `pass`;
- the raw hash section reports every tested vector;
- no private or unrelated machine data is included.

Receipt v2 binds coordinates, expected CPU values, field sources, package
version, and Three.js version. Confirm the recorded run metadata as well:

```text
source commit:
working tree clean: yes/no
matter-field version:
three version:
GPU model:
driver:
browser + version:
OS:
backend:
```

## Submit

Use the “Hardware receipt” GitHub issue form. Attach the JSON or open a focused
pull request that adds it under `parity/reports/` with a descriptive filename.
Do not overwrite a different machine's receipt.

Recommended naming:

```text
<os>-<gpu-family>-<browser>-<backend>-<yyyy-mm-dd>.json
```

Examples:

```text
macos-m3-pro-chrome-webgpu-2026-08-09.json
linux-rx-7900-xtx-chrome-webgl2-2026-08-09.json
```

## Language for the matrix

Good:

> Maximum observed absolute drift was 7.49e-4 field units over 300 points on
> this RTX 3070 / Chrome / WebGL2 configuration.

Avoid:

> Matter Field is accurate to 7.49e-4 everywhere.

Avoid:

> CPU and GPU are identical.

The matrix should preserve unmeasured cells instead of inferring them from the
nearest vendor or backend.

## Failed results are valuable

Submit a failure when it is reproducible. Include browser console output and
the raw receipt. A failed field budget, non-exact hash vector, backend mismatch,
or wrong adapter identity can reveal more than another passing row.

Do not loosen a budget simply to turn a measured failure green. First determine
whether the field changed, the identity is stale, the implementation violates
the contract, or the hardware exposed a real portability limit.
