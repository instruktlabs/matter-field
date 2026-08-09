import { runGpuProbe } from '../parity/gpu-probe-template.js';

const config = globalThis.__MATTER_FIELD_PROBE_CONFIG__;

try {
  globalThis.__MATTER_FIELD_GPU_REPORT__ = await runGpuProbe(config);
} catch (error) {
  globalThis.__MATTER_FIELD_GPU_REPORT__ = {
    schema: 'matter-field-gpu-parity/v2',
    backend: config?.backend ?? 'unknown',
    pass: false,
    error: String(error?.stack ?? error),
  };
}
