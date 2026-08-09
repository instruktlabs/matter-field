import { makeF32Adapter, numberAdapter } from '../src/number.js';
import { dunesField } from '../examples/dunes.js';

const canvas = document.querySelector('#field');
const context = canvas.getContext('2d', { alpha: false });
const width = canvas.width;
const height = canvas.height;
const count = width * height;
const valuesF64 = new Float64Array(count);
const valuesF32 = new Float32Array(count);
const residuals = new Float64Array(count);
const f32Adapter = makeF32Adapter();
let min = Infinity;
let max = -Infinity;
let maxResidual = 0;

const worldAt = (x, y) => ({
  x: (x / (width - 1) - 0.5) * 9200 + 500,
  z: (y / (height - 1) - 0.5) * 6100 - 900,
});

for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const world = worldAt(x, y);
    const i = y * width + x;
    const f64 = dunesField(numberAdapter, world.x, world.z);
    const f32 = dunesField(f32Adapter, world.x, world.z);
    const residual = Math.abs(f64 - f32);
    valuesF64[i] = f64;
    valuesF32[i] = f32;
    residuals[i] = residual;
    min = Math.min(min, f64);
    max = Math.max(max, f64);
    maxResidual = Math.max(maxResidual, residual);
  }
}

function mix(a, b, t) {
  return Math.round(a + (b - a) * t);
}

function gradient(stops, value) {
  const t = Math.max(0, Math.min(0.9999, value)) * (stops.length - 1);
  const i = Math.floor(t);
  const f = t - i;
  return [mix(stops[i][0], stops[i + 1][0], f), mix(stops[i][1], stops[i + 1][1], f), mix(stops[i][2], stops[i + 1][2], f)];
}

const surfaceStops = [
  [13, 46, 48],
  [28, 84, 81],
  [172, 163, 126],
  [232, 218, 186],
  [183, 68, 46],
];
const residualStops = [
  [12, 36, 34],
  [29, 76, 78],
  [49, 95, 140],
  [183, 68, 46],
  [244, 197, 148],
];

function makeView(mode) {
  const target = document.createElement('canvas');
  target.width = width;
  target.height = height;
  const targetContext = target.getContext('2d', { alpha: false });
  const image = targetContext.createImageData(width, height);

  for (let i = 0; i < count; i++) {
    const normalized = (valuesF64[i] - min) / (max - min);
    const residual = maxResidual === 0 ? 0 : Math.min(1, residuals[i] / maxResidual);
    const color = gradient(mode === 'surface' ? surfaceStops : residualStops, mode === 'surface' ? normalized : Math.sqrt(residual));
    const contourDistance = Math.abs((normalized * 15) % 1 - 0.5) * 2;
    const contourInk = contourDistance > .88 ? (mode === 'surface' ? 24 : 14) : 0;
    image.data[i * 4] = Math.max(0, color[0] - contourInk);
    image.data[i * 4 + 1] = Math.max(0, color[1] - contourInk);
    image.data[i * 4 + 2] = Math.max(0, color[2] - contourInk);
    image.data[i * 4 + 3] = 255;
  }
  targetContext.putImageData(image, 0, 0);
  return target;
}

const views = {
  surface: makeView('surface'),
  residual: makeView('residual'),
};
let mode = 'surface';
let probe = { x: Math.round(width * .63), y: Math.round(height * .38) };
let framePending = false;
let announceNext = false;

const outputF64 = document.querySelector('#sample-f64');
const outputF32 = document.querySelector('#sample-f32');
const outputDelta = document.querySelector('#sample-delta');
const sampleCount = document.querySelector('#sample-count');
const probeStatus = document.querySelector('#probe-status');
sampleCount.textContent = `${count.toLocaleString()} paired samples`;

function drawProbe() {
  context.drawImage(views[mode], 0, 0);
  const { x, y } = probe;
  context.save();
  context.translate(.5, .5);
  context.strokeStyle = '#fffcf3';
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(x - 18, y);
  context.lineTo(x + 18, y);
  context.moveTo(x, y - 18);
  context.lineTo(x, y + 18);
  context.stroke();
  context.setLineDash([4, 4]);
  context.strokeStyle = '#e77b5e';
  context.lineWidth = 2;
  context.beginPath();
  context.arc(x, y, 11, 0, Math.PI * 2);
  context.stroke();
  context.restore();

  const i = Math.round(y) * width + Math.round(x);
  outputF64.textContent = valuesF64[i].toFixed(6);
  outputF32.textContent = valuesF32[i].toFixed(6);
  outputDelta.textContent = residuals[i] === 0 ? '0 field units' : `${residuals[i].toExponential(3)} units`;
  const world = worldAt(x, y);
  if (announceNext) {
    probeStatus.textContent = `World x ${world.x.toFixed(0)}, z ${world.z.toFixed(0)}. CPU ${valuesF64[i].toFixed(6)}. F32 ${valuesF32[i].toFixed(6)}. Absolute drift ${residuals[i].toExponential(3)} field units.`;
    announceNext = false;
  }
  framePending = false;
}

function scheduleDraw() {
  if (!framePending) {
    framePending = true;
    requestAnimationFrame(drawProbe);
  }
}

function setProbeFromEvent(event) {
  const rect = canvas.getBoundingClientRect();
  probe = {
    x: Math.max(0, Math.min(width - 1, Math.round((event.clientX - rect.left) / rect.width * (width - 1)))),
    y: Math.max(0, Math.min(height - 1, Math.round((event.clientY - rect.top) / rect.height * (height - 1)))),
  };
  scheduleDraw();
}

let dragging = false;
canvas.addEventListener('pointerdown', (event) => {
  dragging = true;
  canvas.setPointerCapture?.(event.pointerId);
  setProbeFromEvent(event);
});
canvas.addEventListener('pointermove', (event) => {
  if (event.pointerType === 'mouse' || dragging) setProbeFromEvent(event);
});
canvas.addEventListener('pointerup', (event) => {
  dragging = false;
  canvas.releasePointerCapture?.(event.pointerId);
});
canvas.addEventListener('pointercancel', () => { dragging = false; });
canvas.addEventListener('keydown', (event) => {
  const movement = {
    ArrowLeft: [-4, 0],
    ArrowRight: [4, 0],
    ArrowUp: [0, -4],
    ArrowDown: [0, 4],
  }[event.key];
  if (movement) {
    event.preventDefault();
    announceNext = true;
    probe.x = Math.max(0, Math.min(width - 1, probe.x + movement[0]));
    probe.y = Math.max(0, Math.min(height - 1, probe.y + movement[1]));
    scheduleDraw();
  } else if (event.key === 'Home') {
    event.preventDefault();
    announceNext = true;
    probe = { x: Math.round(width / 2), y: Math.round(height / 2) };
    scheduleDraw();
  }
});

for (const button of document.querySelectorAll('[data-field-mode]')) {
  button.addEventListener('click', () => {
    mode = button.dataset.fieldMode;
    for (const peer of document.querySelectorAll('[data-field-mode]')) {
      const active = peer === button;
      peer.classList.toggle('is-active', active);
      peer.setAttribute('aria-pressed', String(active));
    }
    scheduleDraw();
  });
}

drawProbe();

const reports = globalThis.__MATTER_FIELD_REPORTS__ ?? {};
const matrix = document.querySelector('#matrix');
const labels = ['Hardware', 'Backend', 'Max observed abs', 'Max ULP', 'u32 hash', 'Status'];

function appendRow(values, className = '') {
  const tr = document.createElement('tr');
  if (className) tr.className = className;
  values.forEach((value, index) => {
    const td = document.createElement('td');
    td.dataset.label = labels[index];
    if (value instanceof Node) td.append(value);
    else td.textContent = value;
    tr.append(td);
  });
  matrix.append(tr);
}

const rows = Object.values(reports).filter(Boolean);
for (const report of rows) {
  const gpu = report.site?.label
    ?? report.chromeGpu?.devices?.find((device) => /nvidia|amd|intel|apple/i.test(device.deviceString))?.deviceString
    ?? report.adapter?.renderer
    ?? report.adapter?.description
    ?? report.adapter?.vendor
    ?? 'Unknown GPU';
  const worstAbs = Math.max(...report.fields.map((field) => field.maxAbs));
  const worstUlp = Math.max(...report.fields.map((field) => field.maxUlp));
  const status = document.createElement(report.site?.receipt ? 'a' : 'span');
  status.className = report.pass ? 'pass' : 'fail';
  status.textContent = report.pass ? 'PASS ↗' : 'FAIL ↗';
  if (report.site?.receipt) {
    status.href = report.site.receipt;
    status.setAttribute('aria-label', `${report.pass ? 'Passing' : 'Failing'} raw receipt for ${gpu}`);
  }
  appendRow([gpu, report.site?.backendLabel ?? report.backend.toUpperCase(), worstAbs.toExponential(3), worstUlp.toLocaleString(), report.hash.bitExact ? 'exact' : 'failed', status]);
}

for (const vendor of ['Intel', 'Apple silicon / Metal']) {
  appendRow([vendor, '—', '—', '—', '—', 'UNMEASURED'], 'unmeasured');
}
