import { cpuFieldBits, typegpuCpuFieldBits } from './cpu-browser-parity-core.js';

const points = globalThis.__MATTER_FIELD_CPU_POINTS__;
const worker = new Worker('./worker.js', { type: 'module' });
const workerBits = new Promise((resolve, reject) => {
  worker.addEventListener('message', (event) => resolve(event.data), { once: true });
  worker.addEventListener('error', reject, { once: true });
});
worker.postMessage(points);
const workerResult = await workerBits;

globalThis.__MATTER_FIELD_CPU_PARITY__ = {
  main: cpuFieldBits(points),
  worker: workerResult.adapter,
  typegpuWorker: workerResult.typegpu,
  typegpuMain: typegpuCpuFieldBits(points),
  userAgent: navigator.userAgent,
};
worker.terminate();
