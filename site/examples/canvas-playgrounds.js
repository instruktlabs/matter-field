import { numberAdapter as N } from '../../src/number.js';
import { buoyancy, swellField } from '../../examples/swell.js';
import { windField } from '../../examples/wind.js';
import { serpentSpine } from '../../examples/serpent.js';
import {
  addButton,
  addDriveControls,
  canvasPoint,
  clamp,
  createFixedLoop,
  createInput,
  createReadouts,
  formatMode,
  installFullscreen,
  lerp,
  setStageStatus,
  wrap,
} from './runtime.js';

function prepareCanvas(canvas) {
  const ctx = canvas.getContext('2d', { alpha: false });
  const resize = () => {
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    const width = Math.max(320, Math.round(canvas.clientWidth * dpr));
    const height = Math.max(180, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  };
  new ResizeObserver(resize).observe(canvas);
  resize();
  return ctx;
}

function drawGrid(ctx, canvas, alpha = 0.11) {
  ctx.strokeStyle = `rgba(188,210,172,${alpha})`;
  ctx.lineWidth = 1;
  const step = Math.max(34, Math.round(canvas.width / 12));
  for (let x = 0; x <= canvas.width; x += step) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
  }
  for (let y = 0; y <= canvas.height; y += step) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
  }
}

function toggleMode(state, button, onChange) {
  state.mode = state.mode === 'unified' ? 'proxy' : 'unified';
  button.textContent = state.mode === 'unified' ? 'Inject stale proxy' : 'Restore unified field';
  button.setAttribute('aria-pressed', String(state.mode !== 'unified'));
  onChange?.();
}

function addStandardControls(controls, state, input, reset, onMode) {
  const mode = addButton(controls, 'Inject stale proxy', (button) => toggleMode(state, button, onMode), { ariaPressed: false });
  mode.classList.add('mode-toggle');
  addButton(controls, 'Pause', (button) => {
    state.paused = !state.paused;
    button.textContent = state.paused ? 'Resume' : 'Pause';
  });
  addButton(controls, 'Reset', reset);
  addDriveControls(controls, input);
}

export function runSwellPlayground({ canvas, controls, readouts }) {
  const ctx = prepareCanvas(canvas);
  const state = {
    demo: 'swell', paused: false, mode: 'unified', t: 0,
    x: -78, z: 28, yaw: Math.PI / 2, speed: 0, gate: 0, target: null,
    actual: { heave: 0, pitch: 0, roll: 0 }, applied: { heave: 0, pitch: 0, roll: 0 },
  };
  const input = createInput(canvas);
  const gates = [{ x: -25, z: -18 }, { x: 42, z: 30 }, { x: 88, z: -25 }];
  const updateReadouts = createReadouts(readouts, [
    ['mode', 'buoyancy mode'], ['surface', 'surface / heave'], ['attitude', 'pitch / roll'],
    ['speed', 'boat speed'], ['goal', 'navigation gates'], ['readback', 'GPU readback'],
  ]);
  const reset = () => Object.assign(state, { t: 0, x: -78, z: 28, yaw: Math.PI / 2, speed: 0, gate: 0, target: null });
  addStandardControls(controls, state, input, reset, () => setStageStatus(
    state.mode === 'unified' ? 'four hull probes share swellField' : 'fault injected: hull responds to a flat proxy plane',
    state.mode === 'unified' ? 'pass' : 'warn',
  ));
  installFullscreen(canvas);

  const view = { minX: -120, maxX: 120, minZ: -80, maxZ: 80 };
  const worldToScreen = (x, z) => ({
    x: (x - view.minX) / (view.maxX - view.minX) * canvas.width,
    y: (z - view.minZ) / (view.maxZ - view.minZ) * canvas.height,
  });
  canvas.addEventListener('pointerdown', (event) => {
    const p = canvasPoint(canvas, event);
    state.target = {
      x: lerp(view.minX, view.maxX, p.x / canvas.width),
      z: lerp(view.minZ, view.maxZ, p.y / canvas.height),
    };
  });

  function update(dt) {
    state.t = wrap(state.t + dt, 0, 600);
    let throttle = clamp(input.throttle, -1, 1);
    let steer = clamp(input.steer, -1, 1);
    if (Math.abs(throttle) > 0.05 || Math.abs(steer) > 0.05) state.target = null;
    if (state.target) {
      const dx = state.target.x - state.x, dz = state.target.z - state.z;
      const distance = Math.hypot(dx, dz);
      if (distance < 7) state.target = null;
      else {
        const desired = Math.atan2(dz, dx);
        const delta = Math.atan2(Math.sin(desired - state.yaw), Math.cos(desired - state.yaw));
        steer = clamp(delta * 1.7, -1, 1);
        throttle = Math.abs(delta) < 1.1 ? 1 : 0.2;
      }
    }
    state.speed += throttle * 8 * dt;
    state.speed *= Math.exp(-1.35 * dt);
    state.speed = clamp(state.speed, -4, 13);
    state.yaw += steer * (0.55 + Math.abs(state.speed) * 0.035) * dt;
    state.x = clamp(state.x + Math.cos(state.yaw) * state.speed * dt, view.minX + 4, view.maxX - 4);
    state.z = clamp(state.z + Math.sin(state.yaw) * state.speed * dt, view.minZ + 4, view.maxZ - 4);
    const boat = { x: state.x, z: state.z, yaw: state.yaw, halfL: 7, halfW: 2.4 };
    state.actual = buoyancy(N, boat, state.t);
    state.applied = state.mode === 'unified' ? state.actual : { heave: 0, pitch: 0, roll: 0 };
    if (state.gate < gates.length && Math.hypot(state.x - gates[state.gate].x, state.z - gates[state.gate].z) < 13) state.gate++;
  }

  let waterFrame = -1;
  const water = document.createElement('canvas');
  water.width = 80; water.height = 46;
  const waterCtx = water.getContext('2d');
  const waterImage = waterCtx.createImageData(water.width, water.height);
  function updateWater() {
    const frame = Math.floor(state.t * 12);
    if (frame === waterFrame) return;
    waterFrame = frame;
    for (let y = 0; y < water.height; y++) {
      for (let x = 0; x < water.width; x++) {
        const wx = lerp(view.minX, view.maxX, x / (water.width - 1));
        const wz = lerp(view.minZ, view.maxZ, y / (water.height - 1));
        const h = swellField(N, wx, wz, state.t);
        const t = clamp((h + 1.6) / 3.2, 0, 1);
        const i = (y * water.width + x) * 4;
        waterImage.data[i] = 15 + t * 34;
        waterImage.data[i + 1] = 52 + t * 100;
        waterImage.data[i + 2] = 67 + t * 102;
        waterImage.data[i + 3] = 255;
      }
    }
    waterCtx.putImageData(waterImage, 0, 0);
  }

  function render() {
    updateWater();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(water, 0, 0, canvas.width, canvas.height);
    drawGrid(ctx, canvas, 0.08);
    gates.forEach((gate, index) => {
      const p = worldToScreen(gate.x, gate.z);
      ctx.strokeStyle = index < state.gate ? '#7af2ce' : index === state.gate ? '#d4ff52' : 'rgba(225,238,203,.35)';
      ctx.lineWidth = Math.max(2, canvas.width / 450);
      ctx.beginPath(); ctx.arc(p.x, p.y, canvas.width * 0.035, 0, Math.PI * 2); ctx.stroke();
    });
    const p = worldToScreen(state.x, state.z);
    const scale = canvas.width / 900;
    ctx.save();
    ctx.translate(p.x, p.y + state.applied.heave * 4 * scale);
    ctx.rotate(state.yaw);
    ctx.transform(1, state.applied.roll * 0.45, state.applied.pitch * 0.9, 1, 0, 0);
    ctx.fillStyle = state.mode === 'unified' ? '#d4ff52' : '#ff9d73';
    ctx.beginPath(); ctx.moveTo(18 * scale, 0); ctx.lineTo(-12 * scale, -8 * scale); ctx.lineTo(-8 * scale, 0); ctx.lineTo(-12 * scale, 8 * scale); ctx.closePath(); ctx.fill();
    ctx.restore();
    if (state.target) {
      const q = worldToScreen(state.target.x, state.target.z);
      ctx.strokeStyle = '#7af2ce'; ctx.beginPath(); ctx.arc(q.x, q.y, 8 * scale, 0, Math.PI * 2); ctx.stroke();
    }
    const center = swellField(N, state.x, state.z, state.t);
    updateReadouts({
      mode: formatMode(state.mode),
      surface: `${center.toFixed(3)} / ${state.applied.heave.toFixed(3)} m`,
      attitude: `${(state.applied.pitch * 57.2958).toFixed(1)}° / ${(state.applied.roll * 57.2958).toFixed(1)}°`,
      speed: `${state.speed.toFixed(1)} m/s`,
      goal: state.gate >= gates.length ? 'COURSE COMPLETE' : `${state.gate} / ${gates.length}`,
      readback: '0 per frame',
    });
  }

  createFixedLoop({ state, update, render, text: () => ({
    demo: 'swell-navigation', coordinateSystem: 'top-down water map; +x right, +z down',
    mode: state.mode, paused: state.paused, time: +state.t.toFixed(3),
    boat: { x: +state.x.toFixed(3), z: +state.z.toFixed(3), yaw: +state.yaw.toFixed(3), speed: +state.speed.toFixed(3) },
    buoyancy: Object.fromEntries(Object.entries(state.applied).map(([key, value]) => [key, +value.toFixed(5)])),
    gatesPassed: state.gate, gateCount: gates.length, target: state.target,
    rendering: 'CPU canvas visualization; CPU numberAdapter buoyancy (GPU parity is measured in the parity lab)',
    controls: 'WASD/arrows or on-screen arrows; click water to set course; F fullscreen',
  }) });
  setStageStatus('CPU canvas field visualization · four-point CPU buoyancy · click to set course', 'neutral');
}

export function runWindPlayground({ canvas, controls, readouts }) {
  const ctx = prepareCanvas(canvas);
  const state = { demo: 'wind', paused: false, mode: 'unified', t: 0, x: -78, z: 48, vx: 0, vz: 0, heading: -0.45, score: 0 };
  const input = createInput(canvas);
  const rings = [{ x: -35, z: 8 }, { x: 18, z: -28 }, { x: 68, z: 18 }];
  const particles = Array.from({ length: 360 }, (_, i) => ({ x: (i * 73 % 200) - 100, z: (i * 131 % 200) - 100 }));
  const updateReadouts = createReadouts(readouts, [
    ['mode', 'force mode'], ['wind', 'visible / applied wind'], ['airspeed', 'ground speed'],
    ['gap', 'force-vector gap'], ['goal', 'gust gates'], ['field', 'visualization'],
  ]);
  const reset = () => Object.assign(state, { t: 0, x: -78, z: 48, vx: 0, vz: 0, heading: -0.45, score: 0 });
  addStandardControls(controls, state, input, reset, () => setStageStatus(
    state.mode === 'unified' ? 'glider and particles query windField at the same time' : 'fault injected: glider samples a stale coarse wind grid',
    state.mode === 'unified' ? 'pass' : 'warn',
  ));
  installFullscreen(canvas);
  canvas.addEventListener('pointerdown', (event) => {
    const p = canvasPoint(canvas, event);
    const targetX = (p.x / canvas.width - 0.5) * 200;
    const targetZ = (p.y / canvas.height - 0.5) * 200;
    state.heading = Math.atan2(targetZ - state.z, targetX - state.x);
  });

  const actualWind = () => windField(N, state.x, state.z, state.t);
  const appliedWind = () => state.mode === 'unified'
    ? actualWind()
    : windField(N, Math.round(state.x / 70) * 70, Math.round(state.z / 70) * 70, Math.floor(state.t / 4) * 4);

  function update(dt) {
    state.t = wrap(state.t + dt, 0, 600);
    state.heading += clamp(input.steer, -1, 1) * 1.75 * dt;
    const throttle = 8.5 + clamp(input.throttle, -1, 1) * 3;
    const applied = appliedWind();
    const desiredVx = Math.cos(state.heading) * throttle + applied.wx;
    const desiredVz = Math.sin(state.heading) * throttle + applied.wz;
    state.vx += (desiredVx - state.vx) * 1.7 * dt;
    state.vz += (desiredVz - state.vz) * 1.7 * dt;
    state.x = wrap(state.x + state.vx * dt, -100, 100);
    state.z = wrap(state.z + state.vz * dt, -100, 100);
    for (const p of particles) {
      const wind = windField(N, p.x, p.z, state.t);
      p.x = wrap(p.x + wind.wx * dt * 0.9, -100, 100);
      p.z = wrap(p.z + wind.wz * dt * 0.9, -100, 100);
    }
    const ring = rings[state.score];
    if (ring && Math.hypot(state.x - ring.x, state.z - ring.z) < 13) state.score++;
  }

  const map = (x, z) => ({ x: (x / 200 + 0.5) * canvas.width, y: (z / 200 + 0.5) * canvas.height });
  function render() {
    ctx.fillStyle = '#0b110d'; ctx.fillRect(0, 0, canvas.width, canvas.height); drawGrid(ctx, canvas);
    ctx.fillStyle = 'rgba(170,202,157,.58)';
    const dot = Math.max(1.4, canvas.width / 700);
    for (const particle of particles) {
      const p = map(particle.x, particle.z); ctx.beginPath(); ctx.arc(p.x, p.y, dot, 0, Math.PI * 2); ctx.fill();
    }
    rings.forEach((ring, index) => {
      const p = map(ring.x, ring.z);
      ctx.strokeStyle = index < state.score ? '#7af2ce' : index === state.score ? '#d4ff52' : 'rgba(225,238,203,.3)';
      ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(p.x, p.y, canvas.width * 0.035, 0, Math.PI * 2); ctx.stroke();
    });
    const p = map(state.x, state.z);
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(state.heading); ctx.fillStyle = state.mode === 'unified' ? '#d4ff52' : '#ff9d73';
    ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-11, -9); ctx.lineTo(-5, 0); ctx.lineTo(-11, 9); ctx.closePath(); ctx.fill(); ctx.restore();
    const visible = actualWind(), applied = appliedWind();
    const gap = Math.hypot(visible.wx - applied.wx, visible.wz - applied.wz);
    ctx.strokeStyle = '#7af2ce'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + visible.wx * 7, p.y + visible.wz * 7); ctx.stroke();
    updateReadouts({
      mode: formatMode(state.mode),
      wind: `${visible.wx.toFixed(2)},${visible.wz.toFixed(2)} / ${applied.wx.toFixed(2)},${applied.wz.toFixed(2)}`,
      airspeed: `${Math.hypot(state.vx, state.vz).toFixed(1)} m/s`, gap: `${gap.toFixed(3)} m/s`,
      goal: state.score >= rings.length ? 'COURSE COMPLETE' : `${state.score} / ${rings.length}`, field: 'CPU canvas (honest)',
    });
  }

  createFixedLoop({ state, update, render, text: () => {
    const visible = actualWind(), applied = appliedWind();
    return {
      demo: 'wind-glider', coordinateSystem: 'top-down; +x right, +z down', mode: state.mode, paused: state.paused,
      time: +state.t.toFixed(3), glider: { x: +state.x.toFixed(3), z: +state.z.toFixed(3), vx: +state.vx.toFixed(3), vz: +state.vz.toFixed(3), heading: +state.heading.toFixed(3) },
      visibleWind: { wx: +visible.wx.toFixed(5), wz: +visible.wz.toFixed(5) }, appliedWind: { wx: +applied.wx.toFixed(5), wz: +applied.wz.toFixed(5) },
      ringsPassed: state.score, ringCount: rings.length, rendering: 'CPU canvas particles; real GPU parity is measured in parity lab',
      controls: 'A/D or arrows steer; W/S adjust airspeed; click to turn; F fullscreen',
    };
  } });
  setStageStatus('CPU canvas particles · CPU glider forces · steer through the gust gates', 'neutral');
}

function rayHitTest(t, aim, canvas, radius = 2.5) {
  const left = canvas.width * 0.07;
  const bottom = canvas.height * 0.83;
  const scaleX = canvas.width * 0.86 / 90;
  const scaleY = canvas.height * 0.58 / 7;
  const shot = { x: (aim.x - left) / scaleX, y: (bottom - aim.y) / scaleY };
  let best = { u: 0, dist: Infinity, point: null };
  const probe = (u) => {
    const point = serpentSpine(N, u, t);
    const dist = Math.hypot(point.x - shot.x, point.y - shot.y);
    if (dist < best.dist) best = { u, dist, point };
  };
  const steps = 96;
  for (let i = 0; i <= steps; i++) probe(i / steps);
  const lo = Math.max(0, best.u - 1 / steps), hi = Math.min(1, best.u + 1 / steps);
  for (let i = 0; i <= 24; i++) probe(lerp(lo, hi, i / 24));
  return { ...best, hit: best.dist <= radius, shot };
}

export function runSerpentPlayground({ canvas, controls, readouts }) {
  const ctx = prepareCanvas(canvas);
  const state = { demo: 'serpent', paused: false, mode: 'unified', t: 0, aim: { x: 450, y: 250 }, result: null, score: 0, shots: 0, flash: 0 };
  const input = createInput(canvas);
  const updateReadouts = createReadouts(readouts, [
    ['mode', 'hit-test mode'], ['score', 'hits / shots'], ['result', 'last shot'],
    ['distance', 'ray distance'], ['arc', 'closest arc u'], ['field', 'visualization'],
  ]);
  const reset = () => Object.assign(state, { t: 0, result: null, score: 0, shots: 0, flash: 0 });
  addStandardControls(controls, state, input, reset, () => setStageStatus(
    state.mode === 'unified' ? 'visual spine and CPU ray test share the same time' : 'fault injected: hit test trails the visual by 350 ms',
    state.mode === 'unified' ? 'pass' : 'warn',
  ));
  installFullscreen(canvas);

  const project = (point) => ({
    x: canvas.width * 0.07 + point.x * (canvas.width * 0.86 / 90),
    y: canvas.height * 0.83 - point.y * (canvas.height * 0.58 / 7),
  });
  const fire = () => {
    const sampleTime = state.mode === 'unified' ? state.t : Math.max(0, state.t - 0.35);
    state.result = rayHitTest(sampleTime, state.aim, canvas);
    state.shots++;
    if (state.result.hit) state.score++;
    state.flash = 0.18;
  };
  canvas.addEventListener('pointermove', (event) => { state.aim = canvasPoint(canvas, event); });
  canvas.addEventListener('pointerdown', (event) => { state.aim = canvasPoint(canvas, event); fire(); });

  function update(dt) {
    state.t = wrap(state.t + dt, 0, 600);
    state.aim.x = clamp(state.aim.x + input.steer * canvas.width * 0.42 * dt, 0, canvas.width);
    state.aim.y = clamp(state.aim.y - input.throttle * canvas.height * 0.42 * dt, 0, canvas.height);
    if (input.consumeAction()) fire();
    state.flash = Math.max(0, state.flash - dt);
  }

  function render() {
    ctx.fillStyle = '#100d09'; ctx.fillRect(0, 0, canvas.width, canvas.height); drawGrid(ctx, canvas, 0.08);
    const points = Array.from({ length: 151 }, (_, i) => serpentSpine(N, i / 150, state.t));
    ctx.lineCap = 'round';
    for (let width = 22; width >= 4; width -= 6) {
      ctx.beginPath();
      points.forEach((point, index) => {
        const p = project(point); if (index === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      });
      ctx.strokeStyle = width > 16 ? '#34351f' : width > 9 ? '#84923d' : '#d4ff52';
      ctx.lineWidth = width * canvas.width / 900; ctx.stroke();
    }
    if (state.mode !== 'unified') {
      const ghost = Array.from({ length: 76 }, (_, i) => serpentSpine(N, i / 75, Math.max(0, state.t - 0.35)));
      ctx.beginPath(); ghost.forEach((point, index) => { const p = project(point); if (!index) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
      ctx.setLineDash([10, 8]); ctx.strokeStyle = 'rgba(255,157,115,.78)'; ctx.lineWidth = 3; ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.strokeStyle = state.result?.hit ? '#7af2ce' : state.result ? '#ff746b' : '#e1eecb';
    ctx.lineWidth = state.flash ? 4 : 2; ctx.beginPath(); ctx.arc(state.aim.x, state.aim.y, 14, 0, Math.PI * 2); ctx.moveTo(state.aim.x - 21, state.aim.y); ctx.lineTo(state.aim.x + 21, state.aim.y); ctx.moveTo(state.aim.x, state.aim.y - 21); ctx.lineTo(state.aim.x, state.aim.y + 21); ctx.stroke();
    updateReadouts({
      mode: formatMode(state.mode), score: `${state.score} / ${state.shots}`, result: state.result ? (state.result.hit ? 'HIT' : 'MISS') : 'AIM + FIRE',
      distance: state.result ? `${state.result.dist.toFixed(3)} m` : '—', arc: state.result ? state.result.u.toFixed(3) : '—', field: 'CPU canvas (honest)',
    });
  }

  createFixedLoop({ state, update, render, text: () => ({
    demo: 'serpent-gallery', coordinateSystem: 'orthographic aim plane; +x right, +y up; shot ray travels along z',
    mode: state.mode, paused: state.paused, time: +state.t.toFixed(3), aimPixels: { x: +state.aim.x.toFixed(1), y: +state.aim.y.toFixed(1) },
    score: state.score, shots: state.shots,
    lastShot: state.result ? { hit: state.result.hit, distance: +state.result.dist.toFixed(5), u: +state.result.u.toFixed(5) } : null,
    rendering: 'CPU canvas spine; CPU world-ray hit test from the same serpentSpine field',
    controls: 'Mouse/touch aim and fire; arrows/WASD aim; Space fires; F fullscreen',
  }) });
  setStageStatus('CPU canvas spine · world-ray CPU hit test · click/tap or Space to fire', 'neutral');
}
