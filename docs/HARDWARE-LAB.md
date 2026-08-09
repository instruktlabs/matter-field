# Hardware Lab Plan

Matter Field needs graphics-compiler diversity, not merely a large number of
virtual machines. Every row must say what physical or virtual hardware,
operating system, browser, driver, backend, and source identity it actually
measured.

## Recommended coverage

| Lane | Suggested source | Evidence label | Purpose |
|---|---|---|---|
| NVIDIA / Windows / D3D | owned RTX 3070 | consumer physical | existing Ampere baseline |
| AMD + NVIDIA / Linux / Vulkan | owned hybrid laptop | consumer physical | Linux plus two driver stacks |
| NVIDIA Ada / Linux / Vulkan | RunPod Secure Cloud RTX 4090 | dedicated cloud GPU | repeatable second NVIDIA generation |
| AMD / cloud graphics | AWS G4ad Radeon Pro V520 | hardware-backed cloud VM | AMD driver/compiler evidence |
| Intel | physical Intel machine or community receipt | consumer physical | representative Intel browser path |
| Apple / Metal | physical M-series Mac; EC2 Mac only if needed | physical Apple hardware | highest-priority Metal evidence |
| iOS + Android | qualifying real-device service or community | physical mobile | branded Safari/Chrome device coverage |

Run WebGPU and WebGL2 on each row where the platform exposes them. Never turn
one Radeon Pro, one GeForce, or one M-series result into a vendor-wide claim.
Cloud, fractional/vGPU, consumer physical, mobile physical, and software-only
results stay visibly separate.

## RunPod's role

[RunPod Pods](https://docs.runpod.io/pods/overview) are useful for inexpensive,
reproducible NVIDIA/Linux/Vulkan runs. It is not the vendor matrix: Pods are
Linux containers, its common inventory is
NVIDIA-heavy, and a compute accelerator does not automatically provide a
browser graphics stack.

A valid RunPod result must show all of the following:

- a dedicated hardware GPU visible to the container;
- compatible Vulkan and vendor drivers;
- Chrome's hardware-accelerated WebGPU or WebGL2 path;
- no SwiftShader, llvmpipe, lavapipe, or other software adapter;
- pinned image digest, browser version, lockfile, source commit, and flags;
- a raw receipt reviewed before publication.

The runner adds
[Chrome's documented Vulkan/ANGLE hardware-headless flags](https://developer.chrome.com/blog/supercharge-web-ai-testing)
on Linux. Use `--no-sandbox` only inside a trusted ephemeral worker running
Chrome as root.

## Owned Linux laptop

The first inventory pass found a useful hybrid configuration:

- AMD Ryzen 7 3750H CPU with Radeon Vega 10 graphics;
- NVIDIA GeForce GTX 1660 Ti Max-Q;
- CachyOS Linux;
- Mesa/RADV and the proprietary NVIDIA Vulkan driver;
- Chrome, Firefox, and Node 22.

That can provide two genuinely different Linux/Vulkan graphics paths if each
run proves which adapter the renderer used. On a hybrid machine, do not infer
the adapter from an environment variable alone; inspect the receipt and Chrome
GPU metadata.

For each adapter/backend pair:

1. check out the exact approved commit and run `npm ci`;
2. record `vulkaninfo`, vendor driver information, browser version, and kernel;
3. run three fresh-browser repetitions of WebGPU and WebGL2;
4. reject software adapters and ambiguous renderer identity;
5. compare output digests as well as per-run maxima;
6. keep the raw JSON and publish only reviewed, source-bound receipts.

The laptop should be a privately controlled lab host, not a self-hosted runner
attached to the public repository. [GitHub warns](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/add-runners)
that forks of a public repository can potentially execute dangerous workflow
code on a self-hosted machine.

### Completed owned-laptop evidence

On 2026-08-09, a clean checkout of `a2af9932` produced three fresh-browser
repetitions for every adapter/backend pair. Within each pair, numeric summaries
were identical across repetitions; all runs passed, reported zero non-finite
samples, rejected software adapters, and matched all 11 raw-u32 vectors.

| Adapter | Backend | Published receipt |
|---|---|---|
| Radeon Vega 10 / RADV | WebGPU / Vulkan | [JSON](../parity/reports/linux-vega10-chrome-webgpu-2026-08-09.json) |
| Radeon Vega 10 / RADV | WebGL2 / ANGLE / Vulkan | [JSON](../parity/reports/linux-vega10-chrome-webgl2-2026-08-09.json) |
| GTX 1660 Ti Max-Q / NVIDIA | WebGPU / Vulkan | [JSON](../parity/reports/linux-gtx1660ti-chrome-webgpu-2026-08-09.json) |
| GTX 1660 Ti Max-Q / NVIDIA | WebGL2 / ANGLE / Vulkan | [JSON](../parity/reports/linux-gtx1660ti-chrome-webgl2-2026-08-09.json) |

These are correctness receipts, not performance benchmarks. Dispatch/readback
timings in the JSON include uncontrolled machine and browser conditions and
must not be used to rank hardware or implementations.

## Complementary services

- [**AWS G4ad**](https://aws.amazon.com/ec2/instance-types/g4/) is the most
  direct cloud AMD graphics lane. Label its Radeon Pro V520 result as that
  model and environment, not as all AMD hardware.
- [**EC2 Mac**](https://aws.amazon.com/ec2/instance-types/mac/) supplies actual
  Apple hardware but has a long minimum host allocation. Prefer a
  borrowed/community M-series receipt and batch the full
  Safari/Chrome/WebGPU/WebGL2 suite if EC2 Mac is used.
- [**BrowserStack**](https://www.browserstack.com/open-source) or
  [**Sauce Labs**](https://saucelabs.com/open-source) can add physical
  iOS/Android coverage. Apply
  to their open-source programs before buying a plan. Treat desktop sessions
  as compatibility evidence unless the receipt can attest the actual GPU.
- [**Azure NVads V710 v5**](https://learn.microsoft.com/en-us/azure/virtual-machines/sizes/gpu-accelerated/nvadsv710-v5-series)
  is a possible newer AMD cloud lane when capacity is
  available. Fractional GPU rows remain labeled cloud/vGPU.
- **GCP GPU VMs** are a well-documented NVIDIA hardware-headless path but add
  little initial vendor diversity after owned NVIDIA plus RunPod.

## Receipt controller

A later lab controller should accept an approved commit SHA and nonce, launch
an ephemeral worker, run repeated probes, validate the schema and source
identity, strip account identifiers, and open a receipt-only pull request.
Workers should receive neither an organization GitHub token nor long-lived
provider credentials. Provider attestations and provisioning metadata belong
in a separate provenance envelope from the numeric report.

Until that controller exists, use the manual process in [RECEIPTS.md](./RECEIPTS.md).
