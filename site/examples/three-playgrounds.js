import {
  AmbientLight,
  ArrowHelper,
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  MeshBasicNodeMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  Plane,
  PlaneGeometry,
  Points,
  PointsNodeMaterial,
  Raycaster,
  RingGeometry,
  Scene,
  SphereGeometry,
  Vector2,
  Vector3,
  WebGPURenderer,
} from 'three/webgpu';
import * as tsl from 'three/tsl';
import { makeTslAdapter } from '../../src/backend-tsl.js';
import { numberAdapter as N } from '../../src/number.js';
import { buoyancy, swellField } from '../../examples/swell.js';
import { windField } from '../../examples/wind.js';
import { serpentSpine } from '../../examples/serpent.js';
import {
  runSerpentPlayground as runSerpentFallback,
  runSwellPlayground as runSwellFallback,
  runWindPlayground as runWindFallback,
} from './canvas-playgrounds.js';
import {
  addButton,
  addDriveControls,
  clamp,
  createFixedLoop,
  createInput,
  createReadouts,
  installFullscreen,
  lerp,
  setStageStatus,
  wrap,
} from './runtime.js';

async function createThreeStage(canvas, { background, cameraPosition, lookAt }) {
  const make = (forceWebGL) => new WebGPURenderer({ canvas, antialias: true, forceWebGL, powerPreference: 'high-performance' });
  let renderer = make(!navigator.gpu);
  try {
    await renderer.init();
  } catch (error) {
    if (!navigator.gpu) throw error;
    renderer.dispose();
    renderer = make(true);
    await renderer.init();
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.setClearColor(new Color(background));
  const scene = new Scene();
  scene.background = new Color(background);
  scene.add(new AmbientLight(0xcad8bd, 2.1));
  const sun = new DirectionalLight(0xffe8bd, 3.2);
  sun.position.set(120, 180, 100);
  scene.add(sun);
  const camera = new PerspectiveCamera(44, 16 / 9, 0.1, 1200);
  camera.position.fromArray(cameraPosition);
  camera.lookAt(...lookAt);
  const resize = () => {
    const width = Math.max(1, canvas.clientWidth), height = Math.max(1, canvas.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(canvas);
  resize();
  return {
    renderer, scene, camera,
    backend: renderer.backend?.isWebGPUBackend ? 'WebGPU' : 'WebGL2 fallback',
  };
}

function replaceCanvasForFallback(args) {
  const replacement = args.canvas.cloneNode(false);
  replacement.width = 900;
  replacement.height = 520;
  args.canvas.replaceWith(replacement);
  args.controls.replaceChildren();
  args.readouts.replaceChildren();
  return { ...args, canvas: replacement };
}

async function withFallback(args, run3d, fallback, label) {
  try {
    await run3d(args);
  } catch (error) {
    console.warn(`${label} 3D TSL initialization failed; using CPU canvas fallback`, error);
    fallback(replaceCanvasForFallback(args));
    setStageStatus(`CPU canvas fallback · 3D TSL unavailable: ${error?.message ?? error}`, 'warn');
  }
}

function buildBoat() {
  const root = new Group();
  const hull = new Mesh(new BoxGeometry(14, 2.8, 6), new MeshStandardMaterial({ color: 0xd4ff52, roughness: 0.6, metalness: 0.15 }));
  hull.position.y = 1.3;
  root.add(hull);
  const bow = new Mesh(new ConeGeometry(3, 6, 4), new MeshStandardMaterial({ color: 0xe8ff9d, roughness: 0.5 }));
  bow.rotation.z = -Math.PI / 2;
  bow.position.set(9.5, 1.3, 0);
  root.add(bow);
  const cabin = new Mesh(new BoxGeometry(5, 3.4, 4.2), new MeshStandardMaterial({ color: 0x173536, roughness: 0.25, metalness: 0.35 }));
  cabin.position.set(-1.5, 4, 0);
  root.add(cabin);
  return root;
}

function addModeControls(controls, state, input, reset, faultLabel, onMode, actionLabel = null) {
  const modeButton = addButton(controls, faultLabel, (button) => {
    state.mode = state.mode === 'unified' ? 'proxy' : 'unified';
    button.textContent = state.mode === 'unified' ? faultLabel : 'Restore unified field';
    button.setAttribute('aria-pressed', String(state.mode !== 'unified'));
    onMode?.();
  }, { ariaPressed: false });
  modeButton.classList.add('mode-toggle');
  addButton(controls, 'Pause', (button) => {
    state.paused = !state.paused;
    button.textContent = state.paused ? 'Resume' : 'Pause';
  });
  addButton(controls, 'Reset', reset);
  addDriveControls(controls, input, { actionLabel });
}

async function runSwell3D({ canvas, controls, readouts }) {
  setStageStatus('initializing TSL water…');
  const { renderer, scene, camera, backend } = await createThreeStage(canvas, {
    background: 0x07131a, cameraPosition: [128, 102, 134], lookAt: [0, 0, 0],
  });
  const state = { paused: false, mode: 'unified', t: 0, x: -82, z: 42, yaw: -0.38, speed: 0, gate: 0, target: null, actual: null, applied: null };
  const input = createInput(canvas);
  const timeNode = tsl.uniform(0);
  const A = makeTslAdapter(tsl, { fnName: 'mfSwellPlaygroundHash' });
  const p = tsl.positionLocal;
  const worldZ = p.y.negate();
  const height = swellField(A, p.x, worldZ, timeNode);
  const waterMaterial = new MeshBasicNodeMaterial({ side: 2, transparent: true, opacity: 0.94 });
  waterMaterial.positionNode = tsl.vec3(p.x, p.y, height);
  waterMaterial.colorNode = tsl.mix(tsl.color(0x0b4051), tsl.color(0x72e1cf), tsl.clamp(height.add(1.5).div(3), 0, 1));
  const water = new Mesh(new PlaneGeometry(240, 160, 120, 80), waterMaterial);
  water.rotation.x = -Math.PI / 2;
  scene.add(water);
  const boat = buildBoat();
  scene.add(boat);
  const gates = [{ x: -34, z: 8 }, { x: 28, z: -32 }, { x: 88, z: 24 }];
  const gateMeshes = gates.map((gate) => {
    const mesh = new Mesh(new RingGeometry(10, 12, 48), new MeshBasicMaterial({ color: 0x6c7862, transparent: true, opacity: 0.8, side: 2 }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(gate.x, swellField(N, gate.x, gate.z, 0) + 0.35, gate.z);
    scene.add(mesh);
    return mesh;
  });
  const targetMarker = new Mesh(new RingGeometry(4, 5.5, 32), new MeshBasicMaterial({ color: 0x7af2ce, side: 2 }));
  targetMarker.rotation.x = -Math.PI / 2; targetMarker.visible = false; scene.add(targetMarker);
  const updateReadouts = createReadouts(readouts, [
    ['mode', 'buoyancy mode'], ['backend', 'visual / hull'], ['surface', 'surface / heave'],
    ['attitude', 'pitch / roll'], ['goal', 'navigation gates'], ['readback', 'GPU readback'],
  ]);
  const reset = () => Object.assign(state, { t: 0, x: -82, z: 42, yaw: -0.38, speed: 0, gate: 0, target: null });
  addModeControls(controls, state, input, reset, 'Inject flat proxy', () => setStageStatus(
    state.mode === 'unified' ? 'GPU water and CPU hull share swellField' : 'fault injected: CPU hull responds to a flat plane',
    state.mode === 'unified' ? 'pass' : 'warn',
  ));
  installFullscreen(canvas);
  const raycaster = new Raycaster(), mouse = new Vector2(), plane = new Plane(new Vector3(0, 1, 0), 0), hit = new Vector3();
  canvas.addEventListener('pointerdown', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouse.set((event.clientX - rect.left) / rect.width * 2 - 1, -((event.clientY - rect.top) / rect.height * 2 - 1));
    raycaster.setFromCamera(mouse, camera);
    if (raycaster.ray.intersectPlane(plane, hit)) state.target = { x: clamp(hit.x, -112, 112), z: clamp(hit.z, -72, 72) };
  });
  function update(dt) {
    state.t = wrap(state.t + dt, 0, 600);
    let throttle = clamp(input.throttle, -1, 1), steer = clamp(input.steer, -1, 1);
    if (Math.abs(throttle) > 0.05 || Math.abs(steer) > 0.05) state.target = null;
    if (state.target) {
      const dx = state.target.x - state.x, dz = state.target.z - state.z, distance = Math.hypot(dx, dz);
      if (distance < 6) state.target = null;
      else {
        const desired = Math.atan2(dz, dx), delta = Math.atan2(Math.sin(desired - state.yaw), Math.cos(desired - state.yaw));
        steer = clamp(delta * 1.7, -1, 1); throttle = Math.abs(delta) < 1.1 ? 1 : 0.2;
      }
    }
    state.speed = clamp((state.speed + throttle * 8 * dt) * Math.exp(-1.2 * dt), -4, 13);
    state.yaw += steer * (0.55 + Math.abs(state.speed) * 0.035) * dt;
    state.x = clamp(state.x + Math.cos(state.yaw) * state.speed * dt, -112, 112);
    state.z = clamp(state.z + Math.sin(state.yaw) * state.speed * dt, -72, 72);
    state.actual = buoyancy(N, { x: state.x, z: state.z, yaw: state.yaw, halfL: 7, halfW: 3 }, state.t);
    state.applied = state.mode === 'unified' ? state.actual : { heave: 0, pitch: 0, roll: 0 };
    if (state.gate < gates.length && Math.hypot(state.x - gates[state.gate].x, state.z - gates[state.gate].z) < 12) state.gate++;
  }
  function render() {
    if (!state.actual) update(0);
    timeNode.value = state.t;
    boat.position.set(state.x, state.applied.heave + 1.1, state.z);
    boat.rotation.order = 'YXZ';
    boat.rotation.set(-state.applied.pitch, -state.yaw, state.applied.roll);
    gateMeshes.forEach((mesh, index) => {
      mesh.position.y = swellField(N, gates[index].x, gates[index].z, state.t) + 0.25;
      mesh.material.color.set(index < state.gate ? 0x7af2ce : index === state.gate ? 0xd4ff52 : 0x6c7862);
    });
    if (state.target) {
      targetMarker.visible = true; targetMarker.position.set(state.target.x, swellField(N, state.target.x, state.target.z, state.t) + 0.3, state.target.z);
    } else targetMarker.visible = false;
    renderer.render(scene, camera);
    const center = swellField(N, state.x, state.z, state.t);
    updateReadouts({
      mode: state.mode === 'unified' ? 'UNIFIED FIELD' : 'FAULT: FLAT PLANE', backend: `${backend} TSL / CPU f64`,
      surface: `${center.toFixed(3)} / ${state.applied.heave.toFixed(3)} m`,
      attitude: `${(state.applied.pitch * 57.2958).toFixed(1)}° / ${(state.applied.roll * 57.2958).toFixed(1)}°`,
      goal: state.gate >= gates.length ? 'COURSE COMPLETE' : `${state.gate} / ${gates.length}`, readback: '0 per frame',
    });
  }
  createFixedLoop({ state, update, render, text: () => ({
    demo: 'swell-3d', coordinateSystem: 'world metres; +x right, +y up, +z depth', renderer: backend, mode: state.mode, paused: state.paused, time: +state.t.toFixed(3),
    boat: { x: +state.x.toFixed(3), y: +state.applied.heave.toFixed(3), z: +state.z.toFixed(3), yaw: +state.yaw.toFixed(3), speed: +state.speed.toFixed(3) },
    buoyancy: Object.fromEntries(Object.entries(state.applied).map(([key, value]) => [key, +value.toFixed(5)])), gatesPassed: state.gate, gateCount: gates.length, target: state.target,
    materialization: 'GPU TSL water displacement; CPU numberAdapter four-point buoyancy; zero per-frame readbacks',
    controls: 'WASD/arrows or on-screen arrows; click water to set course; F fullscreen',
  }) });
  setStageStatus(`${backend} TSL water · CPU four-point buoyancy · zero readbacks`, 'pass');
}

function buildGlider() {
  const root = new Group();
  const wing = new Mesh(new BoxGeometry(16, 0.8, 4), new MeshStandardMaterial({ color: 0xd4ff52, roughness: 0.45, metalness: 0.18 }));
  root.add(wing);
  const nose = new Mesh(new ConeGeometry(2.2, 8, 4), new MeshStandardMaterial({ color: 0x7af2ce, roughness: 0.38 }));
  nose.rotation.z = -Math.PI / 2; nose.position.x = 7; root.add(nose);
  const tail = new Mesh(new BoxGeometry(5, 3, 0.8), new MeshStandardMaterial({ color: 0xb8c49e, roughness: 0.7 }));
  tail.position.set(-7, 2, 0); root.add(tail);
  return root;
}

async function runWind3D({ canvas, controls, readouts }) {
  setStageStatus('initializing TSL stream volume…');
  const { renderer, scene, camera, backend } = await createThreeStage(canvas, {
    background: 0x07100c, cameraPosition: [112, 112, 148], lookAt: [0, 5, 0],
  });
  const state = { paused: false, mode: 'unified', t: 0, x: -78, z: 46, vx: 0, vz: 0, heading: -0.45, score: 0 };
  const input = createInput(canvas);
  const particlePositions = [];
  let seed = 0x9e3779b9;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 1800; i++) particlePositions.push((random() * 2 - 1) * 110, 3 + random() * 30, (random() * 2 - 1) * 80);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(particlePositions, 3));
  const timeNode = tsl.uniform(0);
  const A = makeTslAdapter(tsl, { fnName: 'mfWindPlaygroundHash' });
  const p = tsl.positionLocal;
  const wind = windField(A, p.x, p.z, timeNode);
  const phase = tsl.fract(timeNode.mul(0.13).add(p.y.mul(0.031)));
  const travel = phase.mul(8);
  const pointsMaterial = new PointsNodeMaterial({ color: 0xaacb98, size: 2.2, sizeAttenuation: true, transparent: true, opacity: 0.72 });
  pointsMaterial.positionNode = tsl.vec3(p.x.add(wind.wx.mul(travel)), p.y, p.z.add(wind.wz.mul(travel)));
  pointsMaterial.colorNode = tsl.mix(tsl.color(0x78916d), tsl.color(0xd4ff52), phase);
  scene.add(new Points(geometry, pointsMaterial));
  const ground = new Mesh(new PlaneGeometry(240, 170, 1, 1), new MeshBasicMaterial({ color: 0x0c1710, transparent: true, opacity: 0.65, side: 2 }));
  ground.rotation.x = -Math.PI / 2; scene.add(ground);
  const glider = buildGlider(); scene.add(glider);
  const rings = [{ x: -34, z: 8 }, { x: 20, z: -30 }, { x: 78, z: 20 }];
  const ringMeshes = rings.map((ring) => {
    const mesh = new Mesh(new RingGeometry(10, 12, 48), new MeshBasicMaterial({ color: 0x63705e, side: 2, transparent: true, opacity: 0.84 }));
    mesh.rotation.x = -Math.PI / 2; mesh.position.set(ring.x, 0.35, ring.z); scene.add(mesh); return mesh;
  });
  const visibleArrow = new ArrowHelper(new Vector3(1, 0, 0), new Vector3(), 18, 0x7af2ce, 4, 2); scene.add(visibleArrow);
  const appliedArrow = new ArrowHelper(new Vector3(1, 0, 0), new Vector3(), 18, 0xff9d73, 4, 2); scene.add(appliedArrow);
  const updateReadouts = createReadouts(readouts, [
    ['mode', 'force mode'], ['backend', 'stream / glider'], ['wind', 'visible / applied wind'],
    ['gap', 'force-vector gap'], ['speed', 'ground speed'], ['goal', 'gust gates'],
  ]);
  const reset = () => Object.assign(state, { t: 0, x: -78, z: 46, vx: 0, vz: 0, heading: -0.45, score: 0 });
  addModeControls(controls, state, input, reset, 'Inject stale wind grid', () => setStageStatus(
    state.mode === 'unified' ? 'TSL stream volume and CPU glider share windField' : 'fault injected: CPU glider samples a stale coarse wind grid',
    state.mode === 'unified' ? 'pass' : 'warn',
  ));
  installFullscreen(canvas);
  const pointer = new Vector2();
  canvas.addEventListener('pointerdown', (event) => {
    const rect = canvas.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -((event.clientY - rect.top) / rect.height * 2 - 1));
    const ray = new Raycaster(); ray.setFromCamera(pointer, camera);
    const hit = new Vector3();
    if (ray.ray.intersectPlane(new Plane(new Vector3(0, 1, 0), 0), hit)) state.heading = Math.atan2(hit.z - state.z, hit.x - state.x);
  });
  const actualWind = () => windField(N, state.x, state.z, state.t);
  const appliedWind = () => state.mode === 'unified' ? actualWind() : windField(N, Math.round(state.x / 70) * 70, Math.round(state.z / 70) * 70, Math.floor(state.t / 4) * 4);
  function update(dt) {
    state.t = wrap(state.t + dt, 0, 600);
    state.heading += clamp(input.steer, -1, 1) * 1.65 * dt;
    const airspeed = 9 + clamp(input.throttle, -1, 1) * 3;
    const applied = appliedWind();
    const desiredVx = Math.cos(state.heading) * airspeed + applied.wx, desiredVz = Math.sin(state.heading) * airspeed + applied.wz;
    state.vx += (desiredVx - state.vx) * 1.7 * dt; state.vz += (desiredVz - state.vz) * 1.7 * dt;
    state.x = wrap(state.x + state.vx * dt, -110, 110); state.z = wrap(state.z + state.vz * dt, -78, 78);
    const ring = rings[state.score]; if (ring && Math.hypot(state.x - ring.x, state.z - ring.z) < 12) state.score++;
  }
  function setArrow(arrow, vector, colorOffset = 0) {
    const length = Math.max(0.01, Math.hypot(vector.wx, vector.wz));
    arrow.position.set(state.x, 7 + colorOffset, state.z);
    arrow.setDirection(new Vector3(vector.wx / length, 0, vector.wz / length)); arrow.setLength(length * 4.5, 3, 1.5);
  }
  function render() {
    timeNode.value = state.t;
    glider.position.set(state.x, 7, state.z); glider.rotation.y = -state.heading; glider.rotation.z = clamp(-input.steer * 0.35, -0.35, 0.35);
    const visible = actualWind(), applied = appliedWind(); setArrow(visibleArrow, visible); setArrow(appliedArrow, applied, 1);
    appliedArrow.visible = state.mode !== 'unified';
    ringMeshes.forEach((mesh, index) => mesh.material.color.set(index < state.score ? 0x7af2ce : index === state.score ? 0xd4ff52 : 0x63705e));
    renderer.render(scene, camera);
    updateReadouts({
      mode: state.mode === 'unified' ? 'UNIFIED FIELD' : 'FAULT: STALE GRID', backend: `${backend} TSL / CPU f64`,
      wind: `${visible.wx.toFixed(2)},${visible.wz.toFixed(2)} / ${applied.wx.toFixed(2)},${applied.wz.toFixed(2)}`,
      gap: `${Math.hypot(visible.wx - applied.wx, visible.wz - applied.wz).toFixed(3)} m/s`, speed: `${Math.hypot(state.vx, state.vz).toFixed(1)} m/s`,
      goal: state.score >= rings.length ? 'COURSE COMPLETE' : `${state.score} / ${rings.length}`,
    });
  }
  createFixedLoop({ state, update, render, text: () => {
    const visible = actualWind(), applied = appliedWind();
    return {
      demo: 'wind-3d', coordinateSystem: 'world metres; +x right, +y up, +z depth', renderer: backend, mode: state.mode, paused: state.paused, time: +state.t.toFixed(3),
      glider: { x: +state.x.toFixed(3), y: 7, z: +state.z.toFixed(3), vx: +state.vx.toFixed(3), vz: +state.vz.toFixed(3), heading: +state.heading.toFixed(3) },
      visibleWind: { wx: +visible.wx.toFixed(5), wz: +visible.wz.toFixed(5) }, appliedWind: { wx: +applied.wx.toFixed(5), wz: +applied.wz.toFixed(5) },
      gatesPassed: state.score, gateCount: rings.length, materialization: 'GPU TSL stream volume; CPU numberAdapter glider force; zero per-frame readbacks',
      controls: 'A/D or arrows steer; W/S vary airspeed; click ground to turn; F fullscreen',
    };
  } });
  setStageStatus(`${backend} TSL stream volume · CPU glider forces · zero readbacks`, 'pass');
}

function makeSerpentGeometry() {
  const positions = [];
  const segments = 170, radial = 14;
  for (let i = 0; i <= segments; i++) {
    const u = i / segments;
    const radius = 1.25 + 3.2 * Math.sin(Math.PI * u);
    for (let j = 0; j < radial; j++) {
      const angle = j / radial * Math.PI * 2;
      positions.push(u, Math.cos(angle) * radius, Math.sin(angle) * radius);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  return geometry;
}

function raySpineHit(ray, time, radius = 2.5) {
  let best = { u: 0, dist: Infinity, point: null };
  const probe = (u) => {
    const value = serpentSpine(N, u, time);
    const point = new Vector3(value.x, value.y, value.z);
    const dist = ray.distanceToPoint(point);
    if (dist < best.dist) best = { u, dist, point };
  };
  const steps = 120;
  for (let i = 0; i <= steps; i++) probe(i / steps);
  const lo = Math.max(0, best.u - 1 / steps), hi = Math.min(1, best.u + 1 / steps);
  for (let i = 0; i <= 28; i++) probe(lerp(lo, hi, i / 28));
  return { ...best, hit: best.dist <= radius };
}

async function runSerpent3D({ canvas, controls, readouts }) {
  setStageStatus('initializing TSL procedural body…');
  const { renderer, scene, camera, backend } = await createThreeStage(canvas, {
    background: 0x100c08, cameraPosition: [45, 30, 78], lookAt: [45, 2.5, 0],
  });
  const state = { paused: false, mode: 'unified', t: 0, aim: new Vector2(0, 0), result: null, score: 0, shots: 0, flash: 0 };
  const input = createInput(canvas);
  const timeNode = tsl.uniform(0);
  const A = makeTslAdapter(tsl, { fnName: 'mfSerpentPlaygroundHash' });
  const p = tsl.positionLocal;
  const spine = serpentSpine(A, p.x, timeNode);
  const bodyMaterial = new PointsNodeMaterial({ color: 0xd4ff52, size: 12, sizeAttenuation: true });
  bodyMaterial.positionNode = tsl.vec3(spine.x, spine.y.add(p.y), spine.z.add(p.z));
  bodyMaterial.colorNode = tsl.mix(tsl.color(0x718436), tsl.color(0xe8ff7c), p.x);
  scene.add(new Points(makeSerpentGeometry(), bodyMaterial));
  const ground = new Mesh(new PlaneGeometry(120, 70), new MeshBasicMaterial({ color: 0x17130d, side: 2 })); ground.rotation.x = -Math.PI / 2; ground.position.set(45, -0.4, 0); scene.add(ground);
  const ghostGeometry = new BufferGeometry();
  ghostGeometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(81 * 3), 3));
  const ghost = new Line(ghostGeometry, new LineBasicMaterial({ color: 0xff9d73, transparent: true, opacity: 0.86 })); ghost.visible = false; scene.add(ghost);
  const marker = new Mesh(new SphereGeometry(2.1, 18, 12), new MeshBasicMaterial({ color: 0x7af2ce, wireframe: true })); marker.visible = false; scene.add(marker);
  const shotGeometry = new BufferGeometry(); shotGeometry.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
  const shotLine = new Line(shotGeometry, new LineBasicMaterial({ color: 0xff746b, transparent: true, opacity: 0.8 })); shotLine.visible = false; scene.add(shotLine);
  const raycaster = new Raycaster();
  const updateReadouts = createReadouts(readouts, [
    ['mode', 'hit-test mode'], ['backend', 'body / hit test'], ['score', 'hits / shots'],
    ['result', 'last shot'], ['distance', 'ray distance'], ['arc', 'closest arc u'],
  ]);
  const reset = () => Object.assign(state, { t: 0, result: null, score: 0, shots: 0, flash: 0 });
  addModeControls(controls, state, input, reset, 'Inject 350 ms hitbox lag', () => setStageStatus(
    state.mode === 'unified' ? 'TSL body and CPU ray test share serpentSpine at one time' : 'fault injected: CPU hit test trails the TSL body by 350 ms',
    state.mode === 'unified' ? 'pass' : 'warn',
  ), 'Fire');
  installFullscreen(canvas);
  const setAim = (event) => {
    const rect = canvas.getBoundingClientRect();
    state.aim.set((event.clientX - rect.left) / rect.width * 2 - 1, -((event.clientY - rect.top) / rect.height * 2 - 1));
  };
  const fire = () => {
    raycaster.setFromCamera(state.aim, camera);
    const sampleTime = state.mode === 'unified' ? state.t : Math.max(0, state.t - 0.35);
    state.result = raySpineHit(raycaster.ray, sampleTime);
    state.shots++;
    if (state.result.hit) state.score++;
    marker.visible = true; marker.position.copy(state.result.point); marker.material.color.set(state.result.hit ? 0x7af2ce : 0xff746b);
    const shotPositions = shotGeometry.attributes.position;
    shotPositions.setXYZ(0, raycaster.ray.origin.x, raycaster.ray.origin.y, raycaster.ray.origin.z);
    const end = raycaster.ray.at(150, new Vector3()); shotPositions.setXYZ(1, end.x, end.y, end.z); shotPositions.needsUpdate = true;
    shotLine.visible = true; shotLine.material.color.set(state.result.hit ? 0x7af2ce : 0xff746b); state.flash = 0.22;
  };
  canvas.addEventListener('pointermove', setAim);
  canvas.addEventListener('pointerdown', (event) => { setAim(event); fire(); });
  function update(dt) {
    state.t = wrap(state.t + dt, 0, 600);
    state.aim.x = clamp(state.aim.x + input.steer * 0.7 * dt, -1, 1);
    state.aim.y = clamp(state.aim.y + input.throttle * 0.7 * dt, -1, 1);
    if (input.consumeAction()) fire();
    state.flash = Math.max(0, state.flash - dt); if (!state.flash) shotLine.visible = false;
  }
  function updateGhost() {
    if (state.mode === 'unified') { ghost.visible = false; return; }
    ghost.visible = true;
    const attr = ghostGeometry.attributes.position;
    const time = Math.max(0, state.t - 0.35);
    for (let i = 0; i <= 80; i++) {
      const point = serpentSpine(N, i / 80, time); attr.setXYZ(i, point.x, point.y, point.z);
    }
    attr.needsUpdate = true;
  }
  function render() {
    timeNode.value = state.t; updateGhost(); renderer.render(scene, camera);
    updateReadouts({
      mode: state.mode === 'unified' ? 'UNIFIED FIELD' : 'FAULT: 350 MS LAG', backend: `${backend} TSL / CPU ray`,
      score: `${state.score} / ${state.shots}`, result: state.result ? (state.result.hit ? 'HIT' : 'MISS') : 'AIM + FIRE',
      distance: state.result ? `${state.result.dist.toFixed(3)} m` : '—', arc: state.result ? state.result.u.toFixed(3) : '—',
    });
  }
  createFixedLoop({ state, update, render, text: () => ({
    demo: 'serpent-3d', coordinateSystem: 'world metres; +x headward, +y up, +z lateral; aim is normalized device coordinates', renderer: backend, mode: state.mode, paused: state.paused, time: +state.t.toFixed(3),
    aim: { x: +state.aim.x.toFixed(3), y: +state.aim.y.toFixed(3) }, score: state.score, shots: state.shots,
    lastShot: state.result ? { hit: state.result.hit, distance: +state.result.dist.toFixed(5), u: +state.result.u.toFixed(5), point: state.result.point.toArray().map((value) => +value.toFixed(4)) } : null,
    materialization: 'GPU TSL point body from serpentSpine; CPU world-ray hit test from the same field',
    controls: 'Mouse/touch aim and fire; arrows/WASD aim; Space or Fire button shoots; F fullscreen',
  }) });
  setStageStatus(`${backend} TSL procedural body · CPU world-ray hit test · zero readbacks`, 'pass');
}

export const runSwellPlayground = (args) => withFallback(args, runSwell3D, runSwellFallback, 'swell');
export const runWindPlayground = (args) => withFallback(args, runWind3D, runWindFallback, 'wind');
export const runSerpentPlayground = (args) => withFallback(args, runSerpent3D, runSerpentFallback, 'serpent');
