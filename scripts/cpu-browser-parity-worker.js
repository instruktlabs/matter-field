import { cpuFieldBits, typegpuCpuFieldBits } from './cpu-browser-parity-core.js';

self.addEventListener('message', (event) => self.postMessage({
  adapter: cpuFieldBits(event.data),
  typegpu: typegpuCpuFieldBits(event.data),
}), { once: true });
