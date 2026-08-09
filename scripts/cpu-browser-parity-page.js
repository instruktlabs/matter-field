import { cpuFieldBits } from './cpu-browser-parity-core.js';

const points = globalThis.__MATTER_FIELD_CPU_POINTS__;
const worker = new Worker('./worker.js', { type: 'module' });
const workerBits = new Promise((resolve, reject) => {
  worker.addEventListener('message', (event) => resolve(event.data), { once: true });
  worker.addEventListener('error', reject, { once: true });
});
worker.postMessage(points);

globalThis.__MATTER_FIELD_CPU_PARITY__ = {
  main: cpuFieldBits(points),
  worker: await workerBits,
  userAgent: navigator.userAgent,
};
worker.terminate();
