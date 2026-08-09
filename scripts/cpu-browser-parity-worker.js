import { cpuFieldBits } from './cpu-browser-parity-core.js';

self.addEventListener('message', (event) => self.postMessage(cpuFieldBits(event.data)), { once: true });
