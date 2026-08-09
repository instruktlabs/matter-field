import { runTypegpuProbe } from '../parity/typegpu-gpu-probe.js';

const config = globalThis.__MATTER_FIELD_PROBE_CONFIG__;

try {
  globalThis.__MATTER_FIELD_GPU_REPORT__ = await runTypegpuProbe(config);
} catch (error) {
  globalThis.__MATTER_FIELD_GPU_REPORT__ = {
    schema: 'matter-field-typegpu-parity/v1',
    implementation: 'typegpu-first-class-spike',
    backend: 'webgpu',
    pass: false,
    error: String(error?.stack ?? error),
  };
}
