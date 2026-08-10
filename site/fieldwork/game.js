/**
 * FIELDWORK: BREACH RUN browser contract
 *
 * Required:
 *   #game
 *
 * Optional, enhanced when present:
 *   #stage #briefing #result #result-title #result-copy
 *   #start-game #retry-game #pause-game #fault-game #mute-game
 *   #fullscreen-game #recorder-toggle #recorder-panel
 *   #objective-value #timer-value #integrity-value #integrity-bar
 *   #route-value #backend-value #materializer-value #readback-value
 *   #queries-value #drift-value #mode-value #status-line #event-log
 *   [data-control="left|forward|reverse|right"]
 *
 * Public test/integration hooks:
 *   window.__FIELDWORK__
 *   window.__THREE_GAME_DIAGNOSTICS__
 *   window.render_game_to_text()
 *   window.advanceTime(milliseconds)
 *   window "fieldwork:event" CustomEvents
 */

import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  ArrowHelper,
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  FogExp2,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshBasicNodeMaterial,
  MeshStandardMaterial,
  MeshStandardNodeMaterial,
  OctahedronGeometry,
  PerspectiveCamera,
  Plane,
  PlaneGeometry,
  Points,
  PointsNodeMaterial,
  Raycaster,
  RingGeometry,
  Scene,
  SRGBColorSpace,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
  WebGPUCoordinateSystem,
  WebGPURenderer,
} from 'three/webgpu';
import * as tsl from 'three/tsl';
import { makeTslAdapter } from '../../src/backend-tsl.js';
import { dualAdapter, dualInputs, evalWithGradient } from '../../src/dual.js';
import { makeF32Adapter, numberAdapter as N } from '../../src/number.js';
import { DUNES_PAD, dunesField } from '../../examples/dunes.js';
import { buoyancy, swellField } from '../../examples/swell.js';
import { serpentRadius, serpentSpine, spineHitTest } from '../../examples/serpent.js';
import { windField } from '../../examples/wind.js';
import { createFieldworkAudio } from './audio.js';

export const FIELDWORK_DOM_CONTRACT = Object.freeze({
  required: ['game'],
  optional: [
    'stage', 'briefing', 'result', 'result-title', 'result-copy',
    'start-game', 'retry-game', 'pause-game', 'fault-game', 'mute-game',
    'fullscreen-game', 'recorder-toggle', 'recorder-panel',
    'objective-value', 'timer-value', 'integrity-value', 'integrity-bar',
    'route-value', 'backend-value', 'materializer-value', 'readback-value',
    'queries-value', 'drift-value', 'mode-value', 'status-line', 'status-live',
    'event-log',
  ],
  touchControls: '[data-control="left"], [data-control="forward"], [data-control="reverse"], [data-control="right"]',
});

const FIXED_DT = 1 / 60;
const MAX_FRAME_DELTA = 0.1;
const MAX_CATCHUP_STEPS = 6;
const MISSION_SECONDS = 78;
const SEA_LEVEL = 8;
const CRAFT_RADIUS = 3.8;
const SERPENT_STEPS = 32;
const WORLD = Object.freeze({ cx: 10, cz: -360, width: 520, depth: 420 });
const START = Object.freeze({ x: -126, z: -445, heading: Math.PI * 0.24 });
const CORE = Object.freeze({ x: -100, z: -420 });
const SERPENT = Object.freeze({ x: 10, z: -425, rotation: -Math.PI / 2 });
const F32 = makeF32Adapter();

const tempA = new Vector3();
const tempB = new Vector3();
const tempC = new Vector3();

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, amount) {
  return a + (b - a) * amount;
}

function damp(value, target, rate, dt) {
  return lerp(value, target, 1 - Math.exp(-rate * dt));
}

function smoothstep(a, b, value) {
  const t = clamp((value - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

function angleDelta(target, current) {
  return Math.atan2(Math.sin(target - current), Math.cos(target - current));
}

function dampAngle(value, target, rate, dt) {
  return value + angleDelta(target, value) * (1 - Math.exp(-rate * dt));
}

function wrapTime(value) {
  return ((value % 600) + 600) % 600;
}

function seededRandom(seed = 0x9e3779b9) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function element(root, id) {
  return root.querySelector(`#${id}`);
}

function collectDom(root) {
  const canvas = element(root, 'game');
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error('FIELDWORK requires a <canvas id="game">');
  const dom = { canvas, touchControls: [...root.querySelectorAll('[data-control]')] };
  for (const id of FIELDWORK_DOM_CONTRACT.optional) {
    dom[id.replaceAll('-', '_')] = element(root, id);
  }
  return dom;
}

function setText(node, value) {
  if (!node) return;
  const next = String(value);
  if (node.textContent !== next) node.textContent = next;
}

function setVisible(node, visible) {
  if (!node) return;
  node.hidden = !visible;
  node.setAttribute('aria-hidden', String(!visible));
}

function setPressed(node, value) {
  node?.setAttribute('aria-pressed', String(Boolean(value)));
}

function isTextEntry(target) {
  return target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
    || Boolean(target?.isContentEditable);
}

function emitFieldwork(type, detail = {}) {
  window.dispatchEvent(new CustomEvent('fieldwork:event', { detail: { type, ...detail } }));
}

function makeHullGeometry() {
  // Authored low-poly wedge: wide stern, narrow raised prow, chamfered belly.
  const vertices = new Float32Array([
    -3.8, 0.1, -5.2,  3.8, 0.1, -5.2,  -4.5, 1.4, -3.8,  4.5, 1.4, -3.8,
    -2.8, 0.0,  4.6,  2.8, 0.0,  4.6,  -2.2, 1.9,  5.8,  2.2, 1.9,  5.8,
    -2.8, -1.0, -3.8, 2.8, -1.0, -3.8, -1.5, -0.6, 4.2, 1.5, -0.6, 4.2,
  ]);
  const indices = [
    0, 1, 3, 0, 3, 2, 2, 3, 7, 2, 7, 6, 4, 6, 7, 4, 7, 5,
    0, 2, 6, 0, 6, 4, 1, 5, 7, 1, 7, 3, 8, 10, 11, 8, 11, 9,
    0, 8, 9, 0, 9, 1, 4, 5, 11, 4, 11, 10, 0, 4, 10, 0, 10, 8,
    1, 9, 11, 1, 11, 5,
  ];
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function makeSkimmer() {
  const root = new Group();
  root.name = 'fieldworkSkimmer';
  const shell = new MeshStandardMaterial({ color: 0xd5dca6, roughness: 0.58, metalness: 0.22 });
  const trim = new MeshStandardMaterial({ color: 0x173f42, roughness: 0.32, metalness: 0.58 });
  const dark = new MeshStandardMaterial({ color: 0x111c1a, roughness: 0.82, metalness: 0.12 });
  const signal = new MeshStandardMaterial({ color: 0xb7442e, emissive: 0x5f160c, emissiveIntensity: 1.2, roughness: 0.38 });

  const hull = new Mesh(makeHullGeometry(), shell);
  hull.castShadow = true;
  root.add(hull);

  const deck = new Mesh(new BoxGeometry(5.6, 0.42, 6.8), trim);
  deck.position.set(0, 1.65, -0.7);
  deck.castShadow = true;
  root.add(deck);

  const canopy = new Mesh(new SphereGeometry(2.15, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), trim);
  canopy.scale.set(1, 0.72, 1.42);
  canopy.position.set(0, 1.94, -0.6);
  canopy.castShadow = true;
  root.add(canopy);

  const railGeometry = new BoxGeometry(0.28, 0.28, 7.4);
  for (const x of [-3.45, 3.45]) {
    const rail = new Mesh(railGeometry, signal);
    rail.position.set(x, 1.52, -0.15);
    root.add(rail);
  }

  const thrusterGeometry = new CylinderGeometry(1.05, 1.28, 3.6, 16, 1, false);
  for (const x of [-3.8, 3.8]) {
    const thruster = new Mesh(thrusterGeometry, dark);
    thruster.rotation.x = Math.PI / 2;
    thruster.position.set(x, 0.4, -3.4);
    thruster.castShadow = true;
    root.add(thruster);
    const glow = new Mesh(new RingGeometry(0.42, 0.9, 20), signal);
    glow.position.set(x, 0.4, -5.24);
    root.add(glow);
  }

  const cargoSocket = new Mesh(new TorusGeometry(1.2, 0.18, 10, 28), signal);
  cargoSocket.rotation.x = Math.PI / 2;
  cargoSocket.position.set(0, 2.08, -3.25);
  cargoSocket.visible = false;
  cargoSocket.name = 'cargoSocket';
  root.add(cargoSocket);
  return root;
}

function makeCore() {
  const root = new Group();
  root.name = 'fieldCore';
  const coreMaterial = new MeshStandardMaterial({
    color: 0xd4ff52,
    emissive: 0x315f18,
    emissiveIntensity: 1.5,
    roughness: 0.25,
    metalness: 0.34,
  });
  const frameMaterial = new MeshStandardMaterial({ color: 0x173f42, roughness: 0.45, metalness: 0.65 });
  const crystal = new Mesh(new OctahedronGeometry(1.65, 1), coreMaterial);
  crystal.castShadow = true;
  root.add(crystal);
  for (let i = 0; i < 2; i++) {
    const ring = new Mesh(new TorusGeometry(2.25, 0.13, 10, 36), frameMaterial);
    ring.rotation.set(i ? Math.PI / 2 : 0, i ? 0 : Math.PI / 2, Math.PI * 0.2);
    root.add(ring);
  }
  return root;
}

function makeSerpentGeometry(segments = 132, radial = 12) {
  const positions = [];
  const fieldU = [];
  const indices = [];
  for (let i = 0; i <= segments; i++) {
    const u = i / segments;
    for (let j = 0; j < radial; j++) {
      const angle = (j / radial) * Math.PI * 2;
      positions.push(u, Math.cos(angle), Math.sin(angle));
      fieldU.push(u);
    }
  }
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * radial + j;
      const b = i * radial + (j + 1) % radial;
      const c = (i + 1) * radial + j;
      const d = (i + 1) * radial + (j + 1) % radial;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  // Preserve the undeformed field parameter explicitly. `positionLocal` is a
  // mutable TSL variable after positionNode runs, so using its x channel for
  // fragment color would extrapolate with the deformed world-space spine x.
  geometry.setAttribute('fieldU', new Float32BufferAttribute(fieldU, 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function makeSerpentHead() {
  const root = new Group();
  const hide = new MeshStandardMaterial({ color: 0x6d7e39, roughness: 0.86, metalness: 0.04 });
  const plate = new MeshStandardMaterial({ color: 0xa9c04c, roughness: 0.62, metalness: 0.08 });
  const eye = new MeshStandardMaterial({ color: 0xff8a67, emissive: 0x8a2414, emissiveIntensity: 2.3 });
  const skull = new Mesh(new IcosahedronGeometry(3.5, 2), hide);
  skull.scale.set(1.5, 0.92, 1.08);
  skull.castShadow = true;
  root.add(skull);
  for (const side of [-1, 1]) {
    const cheek = new Mesh(new ConeGeometry(0.9, 4.8, 5), plate);
    cheek.rotation.z = -Math.PI / 2;
    cheek.position.set(1.4, -0.2, side * 2.35);
    root.add(cheek);
    const iris = new Mesh(new SphereGeometry(0.38, 14, 10), eye);
    iris.position.set(2.6, 1.08, side * 1.62);
    root.add(iris);
  }
  return root;
}

function makeInput(dom) {
  const keys = new Set();
  const touch = { left: 0, forward: 0, reverse: 0, right: 0 };
  const cleanups = [];
  const listen = (target, type, fn, options) => {
    target.addEventListener(type, fn, options);
    cleanups.push(() => target.removeEventListener(type, fn, options));
  };
  const input = {
    get throttle() {
      return (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0)
        - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0)
        + touch.forward - touch.reverse;
    },
    get steer() {
      return (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0)
        - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0)
        + touch.right - touch.left;
    },
    clear() {
      keys.clear();
      for (const name of Object.keys(touch)) touch[name] = 0;
      for (const button of dom.touchControls) button.classList.remove('is-held');
    },
    destroy() {
      input.clear();
      cleanups.splice(0).forEach((fn) => fn());
    },
  };

  listen(window, 'keydown', (event) => {
    if (isTextEntry(event.target)) return;
    if (event.target instanceof HTMLButtonElement && ['Space', 'Enter'].includes(event.code)) return;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
    keys.add(event.code);
  });
  listen(window, 'keyup', (event) => keys.delete(event.code));
  listen(window, 'blur', () => input.clear());
  listen(document, 'visibilitychange', () => { if (document.hidden) input.clear(); });

  for (const button of dom.touchControls) {
    const control = button.dataset.control;
    if (!(control in touch)) continue;
    const release = () => {
      touch[control] = 0;
      button.classList.remove('is-held');
    };
    listen(button, 'pointerdown', (event) => {
      event.preventDefault();
      try { button.setPointerCapture(event.pointerId); } catch { /* synthetic input */ }
      touch[control] = 1;
      button.classList.add('is-held');
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) listen(button, type, release);
  }
  return input;
}

function touchMetrics(touches) {
  const values = [...touches.values()];
  if (values.length < 2) return null;
  const [a, b] = values;
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
  };
}

class FieldCamera {
  constructor(canvas, camera, onWaypoint) {
    this.canvas = canvas;
    this.camera = camera;
    this.onWaypoint = onWaypoint;
    this.target = new Vector3(START.x, 6, START.z);
    this.desired = new Vector3();
    this.yaw = START.heading + Math.PI;
    this.pitch = 0.52;
    this.distance = 106;
    this.autoYaw = true;
    this.touches = new Map();
    this.touchCandidate = null;
    this.touchGesture = null;
    this.touchWasMulti = false;
    this.mouseGesture = null;
    this.mouseCandidate = null;
    this.cleanups = [];
    this.#install();
  }

  #listen(target, type, fn, options) {
    target.addEventListener(type, fn, options);
    this.cleanups.push(() => target.removeEventListener(type, fn, options));
  }

  #capture(pointerId) {
    try { this.canvas.setPointerCapture(pointerId); } catch { /* synthetic QA pointer */ }
  }

  #orbit(dx, dy) {
    this.autoYaw = false;
    this.yaw -= dx * 0.006;
    this.pitch = clamp(this.pitch + dy * 0.005, 0.16, 1.25);
  }

  #zoom(factor) {
    this.distance = clamp(this.distance * factor, 48, 210);
  }

  #install() {
    this.canvas.classList.add('field-camera');
    this.#listen(this.canvas, 'contextmenu', (event) => event.preventDefault());
    this.#listen(this.canvas, 'wheel', (event) => {
      event.preventDefault();
      this.#zoom(Math.exp(clamp(event.deltaY, -240, 240) * 0.00135));
    }, { passive: false });
    this.#listen(this.canvas, 'pointerdown', (event) => {
      this.canvas.focus({ preventScroll: true });
      if (event.pointerType === 'touch') {
        event.preventDefault();
        this.#capture(event.pointerId);
        this.touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (this.touches.size === 1) {
          this.touchCandidate = { id: event.pointerId, x: event.clientX, y: event.clientY, time: performance.now() };
          this.touchWasMulti = false;
        } else if (this.touches.size === 2) {
          this.touchWasMulti = true;
          this.touchCandidate = null;
          this.touchGesture = touchMetrics(this.touches);
        }
        return;
      }
      if (event.button === 2 || event.button === 1) {
        event.preventDefault();
        this.#capture(event.pointerId);
        this.mouseGesture = { id: event.pointerId, x: event.clientX, y: event.clientY };
      } else if (event.button === 0) {
        this.#capture(event.pointerId);
        this.mouseCandidate = { id: event.pointerId, x: event.clientX, y: event.clientY, time: performance.now() };
      }
    });
    this.#listen(this.canvas, 'pointermove', (event) => {
      if (event.pointerType === 'touch') {
        if (!this.touches.has(event.pointerId)) return;
        event.preventDefault();
        this.touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (this.touches.size >= 2) {
          const next = touchMetrics(this.touches);
          if (next && this.touchGesture) {
            this.#orbit(next.x - this.touchGesture.x, next.y - this.touchGesture.y);
            this.#zoom(this.touchGesture.distance / next.distance);
          }
          this.touchGesture = next;
        }
        return;
      }
      if (this.mouseGesture?.id === event.pointerId) {
        this.#orbit(event.clientX - this.mouseGesture.x, event.clientY - this.mouseGesture.y);
        this.mouseGesture = { id: event.pointerId, x: event.clientX, y: event.clientY };
      }
    });
    const release = (event) => {
      if (event.pointerType === 'touch') {
        const candidate = this.touchCandidate?.id === event.pointerId ? this.touchCandidate : null;
        this.touches.delete(event.pointerId);
        if (candidate && !this.touchWasMulti) {
          const moved = Math.hypot(event.clientX - candidate.x, event.clientY - candidate.y);
          if (moved <= 12 && performance.now() - candidate.time <= 420) this.onWaypoint(event);
        }
        if (this.touches.size < 2) this.touchGesture = null;
        if (this.touches.size === 0) {
          this.touchCandidate = null;
          this.touchWasMulti = false;
        }
        return;
      }
      if (this.mouseGesture?.id === event.pointerId) this.mouseGesture = null;
      if (this.mouseCandidate?.id === event.pointerId) {
        const moved = Math.hypot(event.clientX - this.mouseCandidate.x, event.clientY - this.mouseCandidate.y);
        if (moved <= 7 && performance.now() - this.mouseCandidate.time <= 500) this.onWaypoint(event);
        this.mouseCandidate = null;
      }
    };
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) this.#listen(this.canvas, type, release);
  }

  recenter() {
    this.autoYaw = true;
    this.pitch = 0.52;
    this.distance = 106;
  }

  update(dt, craft) {
    const speed = Math.hypot(craft.vx, craft.vz);
    const lookAhead = clamp(speed * 0.55, 5, 14);
    this.desired.set(
      craft.x + Math.sin(craft.heading) * lookAhead,
      craft.y + 2.4,
      craft.z + Math.cos(craft.heading) * lookAhead,
    );
    this.target.lerp(this.desired, 1 - Math.exp(-5.2 * dt));
    if (this.autoYaw) this.yaw = dampAngle(this.yaw, craft.heading + Math.PI, 3.4, dt);
    const horizontal = Math.cos(this.pitch) * this.distance;
    this.desired.set(
      this.target.x + Math.sin(this.yaw) * horizontal,
      this.target.y + Math.sin(this.pitch) * this.distance,
      this.target.z + Math.cos(this.yaw) * horizontal,
    );
    this.camera.position.lerp(this.desired, 1 - Math.exp(-7.5 * dt));
    this.camera.lookAt(this.target);
  }

  snapshot() {
    return {
      mode: this.autoYaw ? 'follow-orbit' : 'manual-orbit',
      yaw: +this.yaw.toFixed(4),
      pitch: +this.pitch.toFixed(4),
      distance: +this.distance.toFixed(2),
      target: this.target.toArray().map((value) => +value.toFixed(2)),
    };
  }

  destroy() {
    this.cleanups.splice(0).forEach((fn) => fn());
  }
}

function worldToSerpent(x, y, z) {
  const dx = x - SERPENT.x;
  const dz = z - SERPENT.z;
  const c = Math.cos(SERPENT.rotation);
  const s = Math.sin(SERPENT.rotation);
  return { x: c * dx - s * dz, y, z: s * dx + c * dz };
}

function serpentToWorld(point, target = new Vector3()) {
  const c = Math.cos(SERPENT.rotation);
  const s = Math.sin(SERPENT.rotation);
  return target.set(
    SERPENT.x + c * point.x + s * point.z,
    point.y,
    SERPENT.z - s * point.x + c * point.z,
  );
}

async function createRenderer(canvas) {
  const requested = new URLSearchParams(location.search).get('backend');
  const forceWebGL = requested === 'webgl2' || !navigator.gpu;
  const make = (fallback) => new WebGPURenderer({
    canvas,
    antialias: true,
    forceWebGL: fallback,
    powerPreference: 'high-performance',
  });
  let renderer = make(forceWebGL);
  try {
    await renderer.init();
  } catch (error) {
    if (forceWebGL) throw error;
    renderer.dispose();
    renderer = make(true);
    await renderer.init();
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, innerWidth < 720 ? 1.25 : 1.5));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  return renderer;
}

function createNativeMaterializer(isWebGPU, fallback = false) {
  const A = makeTslAdapter(tsl, {
    fnName: fallback ? 'mfFieldworkFallbackHash' : 'mfFieldworkNativeHash',
  });
  const target = isWebGPU ? 'WGSL' : 'WebGL2 / GLSL';
  return Object.freeze({
    lane: fallback
      ? 'native-tsl-fallback'
      : `native-tsl-${isWebGPU ? 'webgpu' : 'webgl2'}`,
    label: fallback
      ? `native TSL fallback → ${target}`
      : `adapter → native TSL → ${target}`,
    webgpu: true,
    webgl2: true,
    dunes: (x, z) => dunesField(A, x, z),
    swell: (x, z, time) => swellField(A, x, z, time),
    wind: (x, z, time) => {
      const node = windField(A, x, z, time);
      return { x: node.wx, z: node.wz };
    },
    serpentSpine: (u, time) => serpentSpine(A, u, time),
    serpentRadius: (u) => serpentRadius(A, u),
  });
}

function markActiveMaterializerLane(root, materializer, isWebGPU) {
  const actualLane = materializer.lane === 'native-tsl-fallback'
    ? `native-tsl-${isWebGPU ? 'webgpu' : 'webgl2'}`
    : materializer.lane;
  for (const link of root.querySelectorAll('[data-materializer-lane]')) {
    if (link.dataset.materializerLane === actualLane) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
}

async function createMaterializer(isWebGPU) {
  const requested = new URLSearchParams(location.search).get('materializer');
  if (!isWebGPU || requested !== 'typegpu') return createNativeMaterializer(isWebGPU);

  const bridge = await import('../../dist-typegpu/three.js');
  if (isWebGPU) {
    return Object.freeze({
      lane: 'typegpu-webgpu',
      label: 'TypeGPU → @typegpu/three → WGSL',
      webgpu: true,
      webgl2: false,
      dunes: bridge.typegpuDunesNode,
      swell: bridge.typegpuSwellNode,
      wind: (x, z, time) => {
        const node = bridge.typegpuWindNode(x, z, time);
        return { x: node.x, z: node.y };
      },
      serpentSpine: bridge.typegpuSerpentSpineNode,
      serpentRadius: bridge.typegpuSerpentRadiusNode,
    });
  }
  return createNativeMaterializer(false);
}

function setShadowFlags(object) {
  object.traverse?.((child) => {
    if (!child.isMesh) return;
    child.castShadow = true;
    child.receiveShadow = true;
  });
}

function addWorldDressing(scene) {
  const random = seededRandom(0x62f13d09);
  const rockGeometry = new IcosahedronGeometry(1, 1);
  const rockMaterial = new MeshStandardMaterial({ color: 0x69705a, roughness: 0.96, metalness: 0.01 });
  const rocks = new InstancedMesh(rockGeometry, rockMaterial, 42);
  const matrix = new Matrix4();
  let rockCount = 0;
  for (let attempt = 0; attempt < 160 && rockCount < rocks.count; attempt++) {
    const x = WORLD.cx + (random() - 0.5) * (WORLD.width - 34);
    const z = WORLD.cz + (random() - 0.5) * (WORLD.depth - 34);
    const h = dunesField(N, x, z);
    if (h < SEA_LEVEL + 0.7 || Math.hypot(x - DUNES_PAD.cx, z - DUNES_PAD.cz) < DUNES_PAD.rOut + 12) continue;
    const scale = 0.8 + random() * 3.5;
    matrix.makeScale(scale * (0.7 + random() * 0.7), scale, scale * (0.75 + random() * 0.55));
    matrix.setPosition(x, h + scale * 0.52, z);
    rocks.setMatrixAt(rockCount++, matrix);
  }
  rocks.count = rockCount;
  rocks.instanceMatrix.needsUpdate = true;
  rocks.castShadow = true;
  rocks.receiveShadow = true;
  scene.add(rocks);

  const stakeGeometry = new CylinderGeometry(0.23, 0.36, 5.5, 7);
  const stakeMaterial = new MeshStandardMaterial({ color: 0xb7442e, roughness: 0.58, metalness: 0.35 });
  const stakes = new InstancedMesh(stakeGeometry, stakeMaterial, 18);
  for (let i = 0; i < stakes.count; i++) {
    const side = i % 2 ? -1 : 1;
    const z = WORLD.cz - WORLD.depth * 0.42 + (i / (stakes.count - 1)) * WORLD.depth * 0.84;
    const x = WORLD.cx + side * (WORLD.width * 0.43 - (i % 3) * 5);
    const h = dunesField(N, x, z);
    matrix.makeRotationY((random() - 0.5) * 0.2);
    matrix.setPosition(x, h + 2.75, z);
    stakes.setMatrixAt(i, matrix);
  }
  stakes.instanceMatrix.needsUpdate = true;
  scene.add(stakes);
}

function makeExtractionPad(scene) {
  const root = new Group();
  root.position.set(DUNES_PAD.cx, DUNES_PAD.level + 0.18, DUNES_PAD.cz);
  const ringMaterial = new MeshStandardMaterial({
    color: 0xd4ff52,
    emissive: 0x40580f,
    emissiveIntensity: 1.25,
    roughness: 0.52,
    metalness: 0.32,
    side: DoubleSide,
  });
  const ring = new Mesh(new RingGeometry(DUNES_PAD.rIn - 4, DUNES_PAD.rIn, 72), ringMaterial);
  ring.rotation.x = -Math.PI / 2;
  root.add(ring);
  const beaconMaterial = new MeshStandardMaterial({ color: 0x173f42, emissive: 0x0c393c, emissiveIntensity: 0.8, roughness: 0.42 });
  for (let i = 0; i < 6; i++) {
    const angle = i / 6 * Math.PI * 2;
    const pylon = new Mesh(new CylinderGeometry(0.6, 0.9, 7.5, 8), beaconMaterial);
    pylon.position.set(Math.cos(angle) * (DUNES_PAD.rIn - 7), 3.75, Math.sin(angle) * (DUNES_PAD.rIn - 7));
    root.add(pylon);
  }
  scene.add(root);
  return { root, ring, material: ringMaterial };
}

function makeWindGeometry(count) {
  const random = seededRandom(0x9e3779b9);
  const values = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    values[i * 3] = WORLD.cx + (random() - 0.5) * WORLD.width;
    values[i * 3 + 1] = 10 + random() * 38;
    values[i * 3 + 2] = WORLD.cz + (random() - 0.5) * WORLD.depth;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(values, 3));
  return geometry;
}

async function createWorld(renderer, materializer) {
  const scene = new Scene();
  scene.background = new Color(0x071717);
  scene.fog = new FogExp2(0x0b2422, 0.0032);
  scene.add(new HemisphereLight(0xc9d9b7, 0x13221e, 2.35));
  const sun = new DirectionalLight(0xffe3af, 4.1);
  sun.position.set(-140, 260, 110);
  sun.castShadow = false;
  scene.add(sun);

  const camera = new PerspectiveCamera(47, 16 / 9, 0.5, 1400);
  camera.position.set(START.x - 60, 70, START.z - 72);
  camera.lookAt(START.x, 5, START.z);

  const timeNode = tsl.uniform(0);
  const p = tsl.positionLocal;
  const worldX = p.x.add(WORLD.cx);
  const worldZ = tsl.float(WORLD.cz).sub(p.y);

  const duneHeight = materializer.dunes(worldX, worldZ);
  const terrainMaterial = new MeshStandardNodeMaterial({ side: DoubleSide });
  terrainMaterial.positionNode = tsl.vec3(p.x, p.y, duneHeight);
  const elevation = tsl.clamp(duneHeight.sub(SEA_LEVEL - 3).div(14), 0, 1);
  terrainMaterial.colorNode = tsl.mix(tsl.color(0x53633f), tsl.color(0xc7c17a), elevation);
  terrainMaterial.roughnessNode = tsl.float(0.9);
  terrainMaterial.metalnessNode = tsl.float(0.02);
  const terrain = new Mesh(new PlaneGeometry(WORLD.width, WORLD.depth, 156, 126), terrainMaterial);
  terrain.rotation.x = -Math.PI / 2;
  terrain.position.set(WORLD.cx, 0, WORLD.cz);
  terrain.receiveShadow = true;
  scene.add(terrain);

  const waveHeight = materializer.swell(worldX, worldZ, timeNode).add(SEA_LEVEL);
  const waterMaterial = new MeshBasicNodeMaterial({
    side: DoubleSide,
    transparent: true,
    opacity: 0.78,
    depthWrite: false,
  });
  waterMaterial.positionNode = tsl.vec3(p.x, p.y, waveHeight);
  const foam = tsl.clamp(waveHeight.sub(SEA_LEVEL - 0.8).div(2.1), 0, 1);
  waterMaterial.colorNode = tsl.mix(tsl.color(0x0a4050), tsl.color(0x69c9b6), foam);
  const water = new Mesh(new PlaneGeometry(WORLD.width, WORLD.depth, 132, 106), waterMaterial);
  water.rotation.x = -Math.PI / 2;
  water.position.set(WORLD.cx, 0, WORLD.cz);
  water.renderOrder = 2;
  scene.add(water);

  const windGeometry = makeWindGeometry(innerWidth < 720 ? 1050 : 2600);
  const wind = materializer.wind(p.x, p.z, timeNode);
  const phase = tsl.fract(timeNode.mul(0.11).add(p.y.mul(0.037)));
  const travel = phase.mul(10.5);
  const windMaterial = new PointsNodeMaterial({
    size: innerWidth < 720 ? 1.45 : 1.8,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  windMaterial.positionNode = tsl.vec3(
    p.x.add(wind.x.mul(travel)),
    p.y.add(phase.mul(1.8)),
    p.z.add(wind.z.mul(travel)),
  );
  windMaterial.colorNode = tsl.mix(tsl.color(0x5d8c7f), tsl.color(0xd4ff52), phase);
  const windPoints = new Points(windGeometry, windMaterial);
  windPoints.frustumCulled = false;
  windPoints.renderOrder = 3;
  scene.add(windPoints);

  const serpentRoot = new Group();
  serpentRoot.position.set(SERPENT.x, 0, SERPENT.z);
  serpentRoot.rotation.y = SERPENT.rotation;
  const serpentP = tsl.positionLocal;
  const serpentU = tsl.attribute('fieldU', 'float');
  const spine = materializer.serpentSpine(serpentU, timeNode);
  const radius = materializer.serpentRadius(serpentU);
  // Keep the breach body unlit and instrument-readable. Its generated tube
  // normals are not part of the field contract, and strong standard lighting
  // can wash this hazard into a flat white silhouette on some WebGPU paths.
  const serpentMaterial = new MeshBasicNodeMaterial({ side: DoubleSide });
  serpentMaterial.positionNode = tsl.vec3(
    spine.x,
    spine.y.add(serpentP.y.mul(radius)),
    spine.z.add(serpentP.z.mul(radius)),
  );
  serpentMaterial.colorNode = tsl.mix(tsl.color(0x263f37), tsl.color(0xb8d84f), serpentU);
  const serpentBody = new Mesh(makeSerpentGeometry(), serpentMaterial);
  serpentBody.castShadow = true;
  serpentRoot.add(serpentBody);
  const serpentHead = makeSerpentHead();
  serpentRoot.add(serpentHead);
  scene.add(serpentRoot);

  const skimmer = makeSkimmer();
  scene.add(skimmer);
  const core = makeCore();
  scene.add(core);
  const extraction = makeExtractionPad(scene);

  const target = new Mesh(
    new RingGeometry(3.5, 4.8, 34),
    new MeshBasicMaterial({ color: 0x7af2ce, transparent: true, opacity: 0.9, side: DoubleSide }),
  );
  target.rotation.x = -Math.PI / 2;
  target.visible = false;
  target.renderOrder = 4;
  scene.add(target);

  const windArrow = new ArrowHelper(new Vector3(1, 0, 0), new Vector3(), 12, 0x7af2ce, 3, 1.3);
  scene.add(windArrow);
  addWorldDressing(scene);
  setShadowFlags(skimmer);

  return {
    scene,
    camera,
    timeNode,
    terrain,
    water,
    windPoints,
    serpentRoot,
    serpentHead,
    skimmer,
    cargoSocket: skimmer.getObjectByName('cargoSocket'),
    core,
    extraction,
    target,
    windArrow,
  };
}

function freshState() {
  return {
    phase: 'briefing',
    pausedFrom: null,
    fault: false,
    deviceLost: false,
    manualClock: false,
    time: 0,
    remaining: MISSION_SECONDS,
    integrity: 100,
    coreRecovered: false,
    x: START.x,
    y: Math.max(dunesField(N, START.x, START.z), SEA_LEVEL) + 2.1,
    z: START.z,
    previousX: START.x,
    previousY: Math.max(dunesField(N, START.x, START.z), SEA_LEVEL) + 2.1,
    previousZ: START.z,
    heading: START.heading,
    previousHeading: START.heading,
    speed: 0,
    vx: 0,
    vz: 0,
    driftX: 0,
    driftZ: 0,
    pitch: 0,
    previousPitch: 0,
    roll: 0,
    previousRoll: 0,
    target: null,
    medium: 'shore',
    landFactor: 0.5,
    slope: 0,
    wind: { wx: 0, wz: 0 },
    serpentDistance: Infinity,
    serpentHit: null,
    hitCooldown: 0,
    terrainDamageCooldown: 0,
    queriesThisTick: 0,
    droppedSimulationSeconds: 0,
    ticks: 0,
    eventLog: ['Recover the core, then reach the authored landing pad.'],
    status: 'Awaiting deployment',
  };
}

function terrainCoordinate(state, x, z) {
  if (!state.fault) return { x, z };
  const cell = 62;
  return {
    x: Math.round((x + 17) / cell) * cell - 17,
    z: Math.round((z - 23) / cell) * cell + 23,
  };
}

function sampleCraftSurface(state) {
  let queries = 0;
  const c = Math.cos(state.heading);
  const s = Math.sin(state.heading);
  const probe = (forward, side) => {
    const worldX = state.x + forward * s + side * c;
    const worldZ = state.z + forward * c - side * s;
    const sample = terrainCoordinate(state, worldX, worldZ);
    queries++;
    return dunesField(N, sample.x, sample.z);
  };
  const halfL = 4.8;
  const halfW = 3.1;
  const frontLeft = probe(halfL, -halfW);
  const frontRight = probe(halfL, halfW);
  const rearLeft = probe(-halfL, -halfW);
  const rearRight = probe(-halfL, halfW);
  const terrainMean = (frontLeft + frontRight + rearLeft + rearRight) / 4;
  const terrainPitch = Math.atan2((frontLeft + frontRight) - (rearLeft + rearRight), 4 * halfL);
  const terrainRoll = Math.atan2((frontRight + rearRight) - (frontLeft + rearLeft), 4 * halfW);

  const gradientPoint = terrainCoordinate(state, state.x, state.z);
  const gradient = evalWithGradient(dunesField, gradientPoint.x, gradientPoint.z);
  queries++;
  const slope = Math.hypot(gradient.dx, gradient.dz);

  let water;
  if (state.fault) {
    water = { heave: 0, pitch: 0, roll: 0 };
  } else {
    water = buoyancy(N, {
      x: state.x,
      z: state.z,
      yaw: Math.PI / 2 - state.heading,
      halfL,
      halfW,
    }, state.time);
    queries += 4;
  }
  const appliedWater = SEA_LEVEL + water.heave;
  const landFactor = smoothstep(-0.75, 1.35, terrainMean - appliedWater);
  return {
    queries,
    height: lerp(appliedWater + 1.35, terrainMean + 1.75, landFactor),
    pitch: lerp(water.pitch, terrainPitch, landFactor),
    roll: lerp(water.roll, terrainRoll, landFactor),
    terrainMean,
    waterHeight: appliedWater,
    landFactor,
    slope,
    gradient,
  };
}

function sampleSerpentContact(state) {
  const local = worldToSerpent(state.x, state.y, state.z);
  const outsideX = local.x < -12 ? -12 - local.x : local.x > 102 ? local.x - 102 : 0;
  const outsideZ = Math.max(0, Math.abs(local.z) - 42);
  const broadDistance = Math.hypot(outsideX, outsideZ);
  if (broadDistance > 0) return { distance: broadDistance + 18, queries: 0, hit: null };
  const sampleTime = state.fault ? wrapTime(state.time - 0.35) : state.time;
  const result = spineHitTest(N, local, sampleTime, { steps: SERPENT_STEPS });
  const distance = result.dist - result.radius - CRAFT_RADIUS;
  return { distance, queries: SERPENT_STEPS + 19, hit: result };
}

function localDriftEstimate(state) {
  const x = Math.fround(state.x);
  const z = Math.fround(state.z);
  const t = Math.fround(state.time);
  const f64Wind = windField(N, x, z, t);
  const f32Wind = windField(F32, x, z, t);
  const values = [
    Math.abs(dunesField(N, x, z) - dunesField(F32, x, z)),
    Math.abs(swellField(N, x, z, t) - swellField(F32, x, z, t)),
    Math.abs(f64Wind.wx - f32Wind.wx),
    Math.abs(f64Wind.wz - f32Wind.wz),
  ];
  return Math.max(...values);
}

function planarDistance(ax, az, bx, bz) {
  return Math.hypot(bx - ax, bz - az);
}

function formatSeconds(seconds) {
  const value = Math.max(0, seconds);
  const minutes = Math.floor(value / 60);
  const remainder = Math.floor(value % 60);
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

function eventLine(state, message) {
  const stamp = formatSeconds(MISSION_SECONDS - state.remaining);
  state.status = message;
  state.eventLog.unshift(`${stamp}  ${message}`);
  state.eventLog.length = Math.min(state.eventLog.length, 5);
  emitFieldwork('log', { message, tick: state.ticks });
}

function fieldWind(state) {
  if (!state.fault) return windField(N, state.x, state.z, state.time);
  const point = terrainCoordinate(state, state.x, state.z);
  const staleTime = Math.floor(Math.max(0, state.time - 1.25) / 4) * 4;
  return windField(N, point.x, point.z, staleTime);
}

function objectivePoint(state) {
  return state.coreRecovered ? DUNES_PAD : CORE;
}

/**
 * Owns the real-time shell around the portable fields. Gameplay remains CPU
 * authoritative; GPU nodes render the selected named materialization. Native
 * TSL shares the adapter-authored tree, while TypeGPU is the separately
 * maintained port checked by the assay. There is deliberately no render-target
 * or mapped-buffer readback in this loop.
 */
export class FieldworkGame {
  constructor({ root, dom, renderer, materializer, world }) {
    this.root = root;
    this.dom = dom;
    this.renderer = renderer;
    this.materializer = materializer;
    this.world = world;
    this.state = freshState();
    this.input = makeInput(dom);
    this.audio = createFieldworkAudio({
      onError: (message, error) => console.warn(`[FIELDWORK] ${message}`, error),
    });
    this.raycaster = new Raycaster();
    this.pointerNdc = new Vector2();
    this.waypointPlane = new Plane(new Vector3(0, 1, 0), -SEA_LEVEL);
    this.cameraRig = new FieldCamera(dom.canvas, world.camera, (event) => this.setWaypointFromPointer(event));
    this.cleanups = [];
    this.running = true;
    this.lastFrameAt = performance.now();
    this.accumulator = 0;
    this.lastHudAt = -Infinity;
    this.lastDriftAt = -Infinity;
    this.lastDrift = 0;
    this.frameHandle = 0;
    this.resizeObserver = null;
    this.#bindDom();
    this.#bindRendererLoss();
    this.resize();
    this.#resetVisuals();
    this.updateHud(true);
    this.frameHandle = requestAnimationFrame((time) => this.frame(time));
  }

  #listen(target, type, callback, options) {
    if (!target) return;
    target.addEventListener(type, callback, options);
    this.cleanups.push(() => target.removeEventListener(type, callback, options));
  }

  #bindDom() {
    this.#listen(this.dom.start_game, 'click', () => this.start());
    this.#listen(this.dom.retry_game, 'click', () => this.retry());
    this.#listen(this.dom.pause_game, 'click', () => this.togglePause());
    this.#listen(this.dom.fault_game, 'click', () => this.toggleFault());
    this.#listen(this.dom.mute_game, 'click', () => this.toggleMute());
    this.#listen(this.dom.fullscreen_game, 'click', () => this.toggleFullscreen());
    this.#listen(this.dom.recorder_toggle, 'click', () => this.toggleRecorder());
    this.#listen(window, 'keydown', (event) => {
      if (event.repeat || isTextEntry(event.target)) return;
      if (event.target instanceof HTMLButtonElement && ['Space', 'Enter'].includes(event.code)) return;
      if (event.code === 'KeyC') this.cameraRig.recenter();
      if (event.code === 'KeyP' || event.code === 'Escape') this.togglePause();
      if (event.code === 'KeyR') this.retry();
      if (event.code === 'KeyF') this.toggleFullscreen();
    });
    this.#listen(document, 'visibilitychange', () => {
      if (document.hidden && this.state.phase === 'running') this.pause('Page hidden');
    });
    this.#listen(window, 'resize', () => this.resize(), { passive: true });
    if (globalThis.ResizeObserver) {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(this.dom.canvas);
    }
  }

  #bindRendererLoss() {
    const previousLost = this.renderer.onDeviceLost;
    this.renderer.onDeviceLost = (info) => {
      try { previousLost?.call(this.renderer, info); } catch (error) { console.warn(error); }
      this.handleDeviceLoss(info);
    };
    const previousError = this.renderer.onError;
    this.renderer.onError = (error) => {
      try { previousError?.call(this.renderer, error); } catch (secondary) { console.warn(secondary); }
      console.error('[FIELDWORK] renderer error', error);
      emitFieldwork('renderer-error', { message: String(error?.message ?? error) });
    };
  }

  #resetVisuals() {
    const state = this.state;
    this.world.skimmer.position.set(state.x, state.y, state.z);
    this.world.skimmer.rotation.set(0, state.heading, 0);
    this.world.core.visible = true;
    this.world.cargoSocket.visible = false;
    this.world.target.visible = false;
    this.world.extraction.material.emissiveIntensity = 0.45;
    this.world.timeNode.value = state.time;
    this.cameraRig.target.set(state.x, state.y + 2, state.z);
    this.cameraRig.recenter();
    this.cameraRig.update(1, state);
    if (this.dom.stage) this.dom.stage.dataset.phase = state.phase;
    setVisible(this.dom.briefing, true);
    setVisible(this.dom.result, false);
  }

  resize() {
    const rect = this.dom.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width || this.dom.canvas.width || 1280));
    const height = Math.max(1, Math.round(rect.height || this.dom.canvas.height || 720));
    this.renderer.setSize(width, height, false);
    this.world.camera.aspect = width / height;
    this.world.camera.updateProjectionMatrix();
  }

  start({ unlockAudio = true } = {}) {
    if (this.state.deviceLost) {
      location.reload();
      return;
    }
    if (this.state.phase === 'briefing' || this.state.phase === 'won' || this.state.phase === 'failed') {
      const fault = this.state.fault;
      const manualClock = this.state.manualClock;
      this.state = freshState();
      this.state.fault = fault;
      this.state.manualClock = manualClock;
    }
    this.state.phase = 'running';
    this.state.status = this.state.fault ? 'Fault proxy enabled' : 'Field authority synchronized';
    this.lastFrameAt = performance.now();
    this.accumulator = 0;
    setVisible(this.dom.briefing, false);
    setVisible(this.dom.result, false);
    this.dom.canvas.focus({ preventScroll: true });
    if (this.dom.stage) this.dom.stage.dataset.phase = 'running';
    this.world.core.visible = !this.state.coreRecovered;
    this.world.cargoSocket.visible = this.state.coreRecovered;
    this.audio.setRunning(true);
    this.audio.setPaused(false);
    if (unlockAudio) this.audio.unlock().catch((error) => console.warn('[FIELDWORK] audio unlock failed', error));
    eventLine(this.state, 'Breach run started — recover the core.');
    this.audio.play('confirm', { group: 'ui', volume: 0.7 });
    this.updateHud(true);
    emitFieldwork('start', this.snapshot());
  }

  retry() {
    if (this.state.deviceLost) {
      location.reload();
      return;
    }
    const fault = this.state.fault;
    const manualClock = this.state.manualClock;
    this.state = freshState();
    this.state.fault = fault;
    this.state.manualClock = manualClock;
    this.input.clear();
    this.#resetVisuals();
    this.start();
    emitFieldwork('retry', { fault });
  }

  pause(reason = 'Mission paused') {
    if (this.state.phase !== 'running') return false;
    this.state.pausedFrom = 'running';
    this.state.phase = 'paused';
    this.state.status = reason;
    this.audio.setPaused(true);
    this.input.clear();
    setText(this.dom.pause_game, 'Resume');
    setPressed(this.dom.pause_game, true);
    if (this.dom.stage) this.dom.stage.dataset.phase = 'paused';
    this.updateHud(true);
    emitFieldwork('pause', { reason });
    return true;
  }

  resume() {
    if (this.state.phase !== 'paused') return false;
    this.state.phase = this.state.pausedFrom ?? 'running';
    this.state.pausedFrom = null;
    this.state.status = 'Field authority synchronized';
    this.lastFrameAt = performance.now();
    this.audio.setPaused(false);
    setText(this.dom.pause_game, 'Pause');
    setPressed(this.dom.pause_game, false);
    if (this.dom.stage) this.dom.stage.dataset.phase = this.state.phase;
    this.updateHud(true);
    emitFieldwork('resume');
    return true;
  }

  togglePause() {
    if (this.state.phase === 'running') return this.pause();
    if (this.state.phase === 'paused') return this.resume();
    return false;
  }

  toggleFault(force) {
    this.state.fault = typeof force === 'boolean' ? force : !this.state.fault;
    setPressed(this.dom.fault_game, this.state.fault);
    if (this.dom.fault_game) this.dom.fault_game.textContent = this.state.fault ? 'Disable stale proxy' : 'Inject stale proxy';
    eventLine(
      this.state,
      this.state.fault
        ? 'FAULT: CPU contact, buoyancy, and wind now use a deliberately stale coarse proxy.'
        : 'Unified authority restored — CPU consumers use the authored fields again.',
    );
    this.audio.play('toggle', { group: 'ui', volume: 0.6 });
    this.updateHud(true);
    emitFieldwork('fault', { enabled: this.state.fault });
    return this.state.fault;
  }

  async toggleMute() {
    await this.audio.unlock().catch(() => false);
    const muted = this.audio.toggleMuted();
    setPressed(this.dom.mute_game, muted);
    setText(this.dom.mute_game, muted ? 'Sound off' : 'Sound on');
    emitFieldwork('mute', { muted });
    return muted;
  }

  async toggleFullscreen() {
    const target = this.dom.stage ?? this.dom.canvas;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await target.requestFullscreen?.();
      emitFieldwork('fullscreen', { active: Boolean(document.fullscreenElement) });
    } catch (error) {
      eventLine(this.state, 'Fullscreen request was declined by the browser.');
      console.warn('[FIELDWORK] fullscreen unavailable', error);
    }
  }

  toggleRecorder(force) {
    if (!this.dom.recorder_panel) return false;
    const visible = typeof force === 'boolean' ? force : this.dom.recorder_panel.hidden;
    setVisible(this.dom.recorder_panel, visible);
    this.dom.recorder_toggle?.setAttribute('aria-expanded', String(visible));
    return visible;
  }

  setWaypointFromPointer(event) {
    if (this.state.phase !== 'running') return false;
    const rect = this.dom.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    this.pointerNdc.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointerNdc, this.world.camera);
    const point = this.raycaster.ray.intersectPlane(this.waypointPlane, tempA);
    if (!point) return false;
    const margin = 12;
    this.state.target = {
      x: clamp(point.x, WORLD.cx - WORLD.width / 2 + margin, WORLD.cx + WORLD.width / 2 - margin),
      z: clamp(point.z, WORLD.cz - WORLD.depth / 2 + margin, WORLD.cz + WORLD.depth / 2 - margin),
    };
    this.world.target.visible = true;
    this.audio.playScan();
    eventLine(this.state, `Waypoint set ${Math.round(planarDistance(this.state.x, this.state.z, this.state.target.x, this.state.target.z))} m away.`);
    emitFieldwork('waypoint', { ...this.state.target });
    return true;
  }

  updateFixed(dt) {
    const state = this.state;
    if (state.phase !== 'running') return;
    state.previousX = state.x;
    state.previousY = state.y;
    state.previousZ = state.z;
    state.previousHeading = state.heading;
    state.previousPitch = state.pitch;
    state.previousRoll = state.roll;
    state.time = wrapTime(state.time + dt);
    state.remaining = Math.max(0, state.remaining - dt);
    state.hitCooldown = Math.max(0, state.hitCooldown - dt);
    state.terrainDamageCooldown = Math.max(0, state.terrainDamageCooldown - dt);
    state.ticks++;

    const manualThrottle = clamp(this.input.throttle, -1, 1);
    const manualSteer = clamp(this.input.steer, -1, 1);
    let throttle = manualThrottle;
    let steer = manualSteer;
    if (Math.abs(manualThrottle) > 0.02 || Math.abs(manualSteer) > 0.02) {
      state.target = null;
      this.world.target.visible = false;
    } else if (state.target) {
      const dx = state.target.x - state.x;
      const dz = state.target.z - state.z;
      const distance = Math.hypot(dx, dz);
      if (distance < 6) {
        state.target = null;
        state.speed *= 0.7;
        this.world.target.visible = false;
      } else {
        const targetHeading = Math.atan2(dx, dz);
        const turn = angleDelta(targetHeading, state.heading);
        steer = clamp(turn * 1.75, -1, 1);
        throttle = Math.abs(turn) > 1.55 ? 0.15 : clamp(distance / 26, 0.3, 1);
      }
    }

    const before = sampleCraftSurface(state);
    const traction = lerp(0.72, 1, before.landFactor);
    const acceleration = throttle >= 0 ? 22 : 15;
    state.speed += throttle * acceleration * traction * dt;
    state.speed = clamp(state.speed, -10, before.landFactor > 0.7 ? 30 : 24);
    state.speed *= Math.exp(-lerp(0.52, 0.78, before.landFactor) * dt);
    state.speed *= Math.exp(-Math.max(0, before.slope - 0.35) * 0.8 * dt);
    const turnAuthority = (0.42 + Math.min(1, Math.abs(state.speed) / 12) * 1.35) * traction;
    state.heading += steer * turnAuthority * Math.sign(state.speed || throttle || 1) * dt;

    const wind = fieldWind(state);
    state.wind = wind;
    state.driftX += (wind.wx * 0.29 - state.driftX) * 0.72 * dt;
    state.driftZ += (wind.wz * 0.29 - state.driftZ) * 0.72 * dt;
    const forwardX = Math.sin(state.heading);
    const forwardZ = Math.cos(state.heading);
    state.vx = forwardX * state.speed + state.driftX;
    state.vz = forwardZ * state.speed + state.driftZ;
    state.x += state.vx * dt;
    state.z += state.vz * dt;

    const minX = WORLD.cx - WORLD.width / 2 + 8;
    const maxX = WORLD.cx + WORLD.width / 2 - 8;
    const minZ = WORLD.cz - WORLD.depth / 2 + 8;
    const maxZ = WORLD.cz + WORLD.depth / 2 - 8;
    if (state.x < minX || state.x > maxX || state.z < minZ || state.z > maxZ) {
      state.x = clamp(state.x, minX, maxX);
      state.z = clamp(state.z, minZ, maxZ);
      state.speed *= -0.18;
      if (state.hitCooldown <= 0) this.damage(9, 'Survey boundary impact');
    }

    const surface = sampleCraftSurface(state);
    state.y = damp(state.y, surface.height, 8.6, dt);
    state.pitch = damp(state.pitch, surface.pitch, 6.5, dt);
    state.roll = damp(state.roll, surface.roll - steer * 0.12, 6.8, dt);
    state.landFactor = surface.landFactor;
    state.medium = surface.landFactor > 0.67 ? 'dunes' : surface.landFactor < 0.28 ? 'water' : 'shore';
    state.slope = surface.slope;

    if (surface.landFactor > 0.7 && surface.slope > 0.82 && Math.abs(state.speed) > 20 && state.terrainDamageCooldown <= 0) {
      state.terrainDamageCooldown = 1.2;
      this.damage(5, 'Hard dune contact');
    }

    const serpent = sampleSerpentContact(state);
    state.serpentDistance = serpent.distance;
    state.serpentHit = serpent.hit;
    if (serpent.distance <= 0 && state.hitCooldown <= 0) {
      const hitPoint = serpentToWorld(serpent.hit.point, tempB);
      tempC.set(state.x - hitPoint.x, 0, state.z - hitPoint.z);
      if (tempC.lengthSq() < 0.001) tempC.set(-forwardX, 0, -forwardZ);
      tempC.normalize();
      state.x += tempC.x * 6;
      state.z += tempC.z * 6;
      state.driftX += tempC.x * 11;
      state.driftZ += tempC.z * 11;
      state.speed *= 0.38;
      this.damage(state.fault ? 34 : 24, state.fault ? 'Stale proxy missed the visible breach' : 'Breach-body contact');
    }

    const coreDistance = planarDistance(state.x, state.z, CORE.x, CORE.z);
    if (!state.coreRecovered && coreDistance <= 7.5) this.recoverCore();
    const padDistance = planarDistance(state.x, state.z, DUNES_PAD.cx, DUNES_PAD.cz);
    if (state.coreRecovered && padDistance < DUNES_PAD.rIn - 6 && Math.abs(state.speed) < 10) {
      this.completeMission();
    }

    state.queriesThisTick = before.queries + surface.queries + 1 + serpent.queries;
    if (state.remaining <= 0) this.failMission('EXTRACTION WINDOW CLOSED', 'The field core was not delivered before the basin sealed.');
  }

  damage(amount, reason) {
    const state = this.state;
    if (state.phase !== 'running') return;
    state.integrity = Math.max(0, state.integrity - amount);
    state.hitCooldown = 0.85;
    this.audio.play('impact', { volume: 0.75 + Math.min(0.2, amount / 100), rate: state.fault ? 0.82 : 1 });
    eventLine(state, `${reason}: integrity -${amount}.`);
    emitFieldwork('damage', { amount, reason, integrity: state.integrity });
    if (state.integrity <= 0) this.failMission('CORE INTEGRITY LOST', 'The breach run ended before the package reached DUNES_PAD.');
  }

  recoverCore() {
    const state = this.state;
    if (state.coreRecovered || state.phase !== 'running') return;
    state.coreRecovered = true;
    state.target = null;
    this.world.target.visible = false;
    this.world.core.visible = false;
    this.world.cargoSocket.visible = true;
    this.audio.play('checkpoint', { volume: 0.9 });
    eventLine(state, 'Core secured — deliver it to DUNES_PAD and settle below 10 m/s.');
    emitFieldwork('core-recovered', { remaining: state.remaining, integrity: state.integrity });
  }

  completeMission() {
    const state = this.state;
    if (state.phase !== 'running') return;
    state.phase = 'won';
    state.speed *= 0.35;
    state.target = null;
    this.world.target.visible = false;
    this.audio.setRunning(false);
    this.audio.play('complete', { volume: 0.95 });
    const elapsed = MISSION_SECONDS - state.remaining;
    setText(this.dom.result_title, 'Core delivered');
    setText(this.dom.result_copy, `${formatSeconds(elapsed)} elapsed · ${Math.round(state.integrity)}% integrity · zero GPU readbacks in the authority loop.`);
    setVisible(this.dom.result, true);
    if (this.dom.stage) this.dom.stage.dataset.phase = 'won';
    eventLine(state, 'DUNES_PAD accepted the core. Field record sealed.');
    this.updateHud(true);
    emitFieldwork('complete', { elapsed, integrity: state.integrity, fault: state.fault });
  }

  failMission(title, copy) {
    const state = this.state;
    if (!['running', 'paused'].includes(state.phase)) return;
    state.phase = 'failed';
    state.target = null;
    this.world.target.visible = false;
    this.audio.setRunning(false);
    this.audio.play('fail', { group: 'ui', volume: 0.85 });
    setText(this.dom.result_title, title);
    setText(this.dom.result_copy, copy);
    setVisible(this.dom.result, true);
    if (this.dom.stage) this.dom.stage.dataset.phase = 'failed';
    eventLine(state, copy);
    this.updateHud(true);
    emitFieldwork('failed', { title, copy, integrity: state.integrity });
  }

  handleDeviceLoss(info) {
    if (this.state.deviceLost) return;
    this.state.deviceLost = true;
    this.state.phase = 'device-lost';
    this.audio.setRunning(false);
    setText(this.dom.result_title, 'GPU device lost');
    setText(this.dom.result_copy, 'The renderer device ended this run. Reload to request a fresh adapter and restart safely.');
    setText(this.dom.retry_game, 'Reload renderer');
    setVisible(this.dom.result, true);
    if (this.dom.stage) this.dom.stage.dataset.phase = 'device-lost';
    eventLine(this.state, `Renderer device lost${info?.reason ? `: ${info.reason}` : '.'}`);
    this.updateHud(true);
    emitFieldwork('device-lost', { reason: String(info?.reason ?? 'unknown') });
  }

  render(alpha, frameDt) {
    const state = this.state;
    const x = lerp(state.previousX, state.x, alpha);
    const y = lerp(state.previousY, state.y, alpha);
    const z = lerp(state.previousZ, state.z, alpha);
    const heading = state.previousHeading + angleDelta(state.heading, state.previousHeading) * alpha;
    const pitch = lerp(state.previousPitch, state.pitch, alpha);
    const roll = lerp(state.previousRoll, state.roll, alpha);
    this.world.skimmer.position.set(x, y, z);
    this.world.skimmer.rotation.set(pitch, heading, -roll, 'YXZ');
    this.world.timeNode.value = state.time;

    const coreY = Math.max(dunesField(N, CORE.x, CORE.z), SEA_LEVEL + swellField(N, CORE.x, CORE.z, state.time));
    this.world.core.position.set(CORE.x, coreY + 3.2 + Math.sin(state.time * 2.2) * 0.35, CORE.z);
    this.world.core.rotation.y = state.time * 0.72;
    this.world.core.rotation.x = Math.sin(state.time * 0.8) * 0.18;
    this.world.cargoSocket.rotation.z = state.time * 1.2;

    const seed = dualInputs(1, state.time);
    const head = serpentSpine(dualAdapter, seed.x, seed.z);
    this.world.serpentHead.position.set(head.x.v, head.y.v, head.z.v);
    tempA.set(head.x.dx, head.y.dx, head.z.dx);
    if (tempA.lengthSq() > 0.0001) {
      tempA.normalize();
      this.world.serpentHead.quaternion.setFromUnitVectors(tempB.set(1, 0, 0), tempA);
    }

    if (state.target) {
      const targetHeight = Math.max(
        dunesField(N, state.target.x, state.target.z),
        SEA_LEVEL + swellField(N, state.target.x, state.target.z, state.time),
      );
      this.world.target.position.set(state.target.x, targetHeight + 0.3, state.target.z);
      this.world.target.rotation.z = state.time * 0.65;
    }

    const windLength = Math.hypot(state.wind.wx, state.wind.wz);
    this.world.windArrow.position.set(x, y + 8, z);
    if (windLength > 0.001) this.world.windArrow.setDirection(tempA.set(state.wind.wx, 0, state.wind.wz).normalize());
    this.world.windArrow.setLength(clamp(windLength * 1.8, 6, 18), 3, 1.3);
    this.world.extraction.material.emissiveIntensity = state.coreRecovered
      ? 1.4 + Math.sin(state.time * 4) * 0.35
      : 0.42;
    this.world.extraction.root.rotation.y = state.time * 0.03;

    this.cameraRig.update(Math.max(frameDt, FIXED_DT), { ...state, x, y, z, heading });
    this.audio.update({ speed: state.speed, wind: windLength, serpentDistance: state.serpentDistance });
    this.renderer.render(this.world.scene, this.world.camera);
  }

  updateHud(force = false) {
    const now = performance.now();
    if (!force && now - this.lastHudAt < 100) return;
    this.lastHudAt = now;
    const state = this.state;
    const objective = state.coreRecovered ? DUNES_PAD : CORE;
    const route = planarDistance(state.x, state.z, objective.cx ?? objective.x, objective.cz ?? objective.z);
    const objectiveText = state.coreRecovered
      ? 'Deliver core to DUNES_PAD'
      : 'Recover the field core';
    setText(this.dom.objective_value, objectiveText);
    setText(this.dom.timer_value, formatSeconds(state.remaining));
    setText(this.dom.integrity_value, `${Math.round(state.integrity)}%`);
    if (this.dom.integrity_bar) {
      this.dom.integrity_bar.style.width = `${clamp(state.integrity, 0, 100)}%`;
      this.dom.integrity_bar.parentElement?.setAttribute('aria-valuenow', String(Math.round(state.integrity)));
    }
    setText(this.dom.route_value, `${Math.round(route)} m · ${state.medium}`);
    setText(this.dom.backend_value, this.renderer.coordinateSystem === WebGPUCoordinateSystem ? 'WebGPU' : 'WebGL2 fallback');
    setText(this.dom.materializer_value, this.materializer.label);
    setText(this.dom.readback_value, '0 / frame');
    setText(this.dom.queries_value, `${state.queriesThisTick} / fixed tick`);
    if (force || now - this.lastDriftAt >= 250 || this.lastDrift === 0) {
      this.lastDrift = localDriftEstimate(state);
      this.lastDriftAt = now;
    }
    setText(this.dom.drift_value, `CPU f32 estimate ${this.lastDrift.toExponential(2)} · GPU unmeasured`);
    const authorityMode = this.materializer.lane === 'typegpu-webgpu'
      ? 'SYNCED PORT · CPU authority'
      : 'STRUCTURAL · shared adapter field';
    setText(this.dom.mode_value, state.fault ? 'FAULT · stale coarse CPU proxy' : authorityMode);
    setText(this.dom.status_line, state.status);
    setText(this.dom.status_live, state.status);
    setText(this.dom.event_log, state.eventLog.join('\n'));
    setPressed(this.dom.fault_game, state.fault);
    setPressed(this.dom.pause_game, state.phase === 'paused');
  }

  frame(timestamp) {
    if (!this.running) return;
    const state = this.state;
    let frameDt = clamp((timestamp - this.lastFrameAt) / 1000, 0, MAX_FRAME_DELTA);
    this.lastFrameAt = timestamp;
    if (state.manualClock) frameDt = 0;
    if (state.phase === 'running') {
      this.accumulator += frameDt;
      let steps = 0;
      while (this.accumulator >= FIXED_DT && steps < MAX_CATCHUP_STEPS) {
        this.updateFixed(FIXED_DT);
        this.accumulator -= FIXED_DT;
        steps++;
      }
      if (this.accumulator >= FIXED_DT) {
        state.droppedSimulationSeconds += this.accumulator;
        this.accumulator = 0;
      }
    } else {
      this.accumulator = 0;
    }
    this.render(this.accumulator / FIXED_DT, frameDt);
    this.updateHud();
    this.frameHandle = requestAnimationFrame((time) => this.frame(time));
  }

  advanceTime(milliseconds) {
    const ms = Math.max(0, Number(milliseconds) || 0);
    if (this.state.phase === 'briefing') this.start({ unlockAudio: false });
    this.state.manualClock = true;
    const steps = Math.min(36000, Math.round(ms / (FIXED_DT * 1000)));
    for (let i = 0; i < steps && this.state.phase === 'running'; i++) this.updateFixed(FIXED_DT);
    this.accumulator = 0;
    this.render(1, FIXED_DT);
    this.updateHud(true);
    return this.snapshot();
  }

  snapshot() {
    const state = this.state;
    const target = objectivePoint(state);
    return {
      game: 'FIELDWORK: BREACH RUN',
      coordinateSystem: 'Y-up metres; +X east, +Z north; authored world origin is independent of the camera.',
      phase: state.phase,
      objective: state.coreRecovered ? 'deliver-core-to-dunes-pad' : 'recover-core',
      timerSeconds: +state.remaining.toFixed(3),
      integrity: +state.integrity.toFixed(2),
      coreRecovered: state.coreRecovered,
      craft: {
        x: +state.x.toFixed(3),
        y: +state.y.toFixed(3),
        z: +state.z.toFixed(3),
        heading: +state.heading.toFixed(4),
        speed: +state.speed.toFixed(3),
        medium: state.medium,
        slope: +state.slope.toFixed(5),
      },
      target: { x: target.cx ?? target.x, z: target.cz ?? target.z },
      wind: { wx: +state.wind.wx.toFixed(4), wz: +state.wind.wz.toFixed(4) },
      serpentDistance: Number.isFinite(state.serpentDistance) ? +state.serpentDistance.toFixed(3) : null,
      authority: state.fault ? 'deliberately-stale-coarse-cpu-proxy' : 'authored-cpu-fields',
      renderer: this.renderer.coordinateSystem === WebGPUCoordinateSystem ? 'webgpu' : 'webgl2',
      materializer: this.materializer.lane,
      readbacksPerFrame: 0,
      cpuQueriesLastTick: state.queriesThisTick,
      driftReadout: {
        kind: 'local-cpu-f64-vs-f32-estimate-not-gpu-measurement',
        maxAbs: this.lastDrift,
      },
      camera: this.cameraRig.snapshot(),
      ticks: state.ticks,
      droppedSimulationSeconds: +state.droppedSimulationSeconds.toFixed(5),
      status: state.status,
      events: [...state.eventLog],
    };
  }

  async destroy() {
    this.running = false;
    cancelAnimationFrame(this.frameHandle);
    this.resizeObserver?.disconnect();
    this.cleanups.splice(0).forEach((cleanup) => cleanup());
    this.input.destroy();
    this.cameraRig.destroy();
    await this.audio.destroy();
    this.renderer.dispose();
  }
}

export async function bootstrapFieldwork(root = document) {
  const dom = collectDom(root);
  const renderer = await createRenderer(dom.canvas);
  const isWebGPU = renderer.coordinateSystem === WebGPUCoordinateSystem;
  let materializer;
  try {
    materializer = await createMaterializer(isWebGPU);
  } catch (error) {
    console.error('[FIELDWORK] TypeGPU package artifact unavailable; using the explicit emergency lane.', error);
    materializer = createNativeMaterializer(isWebGPU, true);
  }
  markActiveMaterializerLane(root, materializer, isWebGPU);
  const world = await createWorld(renderer, materializer);
  const game = new FieldworkGame({ root, dom, renderer, materializer, world });
  try {
    await renderer.compileAsync(world.scene, world.camera);
  } catch (error) {
    game.state.status = `Material compilation failed: ${error?.message ?? error}`;
    game.updateHud(true);
    await game.destroy();
    throw error;
  }

  window.__FIELDWORK__ = Object.freeze({
    game,
    start: (options) => game.start(options),
    retry: () => game.retry(),
    pause: () => game.pause(),
    resume: () => game.resume(),
    togglePause: () => game.togglePause(),
    toggleFault: (force) => game.toggleFault(force),
    toggleMute: () => game.toggleMute(),
    recenter: () => game.cameraRig.recenter(),
    setWaypoint: (x, z) => {
      game.state.target = { x: Number(x), z: Number(z) };
      game.world.target.visible = true;
    },
    snapshot: () => game.snapshot(),
    destroy: () => game.destroy(),
  });
  window.__THREE_GAME_DIAGNOSTICS__ = Object.freeze({
    renderer,
    rendererInfo: renderer.info,
    getState: () => game.snapshot(),
    claim: 'Local runtime diagnostics only; not a controlled hardware benchmark.',
  });
  window.render_game_to_text = () => JSON.stringify(game.snapshot());
  window.advanceTime = (milliseconds) => game.advanceTime(milliseconds);
  emitFieldwork('ready', {
    renderer: isWebGPU ? 'webgpu' : 'webgl2',
    materializer: materializer.lane,
    readbacksPerFrame: 0,
  });
  return game;
}

if (typeof document !== 'undefined') {
  const launch = () => {
    if (!document.querySelector('#game') || window.__FIELDWORK_BOOTSTRAP__) return;
    window.__FIELDWORK_BOOTSTRAP__ = bootstrapFieldwork().catch((error) => {
      console.error('[FIELDWORK] bootstrap failed', error);
      const status = document.querySelector('#status-line');
      const liveStatus = document.querySelector('#status-live');
      if (status) status.textContent = `Unable to initialize fieldwork: ${error?.message ?? error}`;
      if (liveStatus) liveStatus.textContent = `Unable to initialize fieldwork: ${error?.message ?? error}`;
      const title = document.querySelector('#result-title');
      const copy = document.querySelector('#result-copy');
      const result = document.querySelector('#result');
      if (title) title.textContent = 'Renderer initialization failed';
      if (copy) copy.textContent = String(error?.message ?? error);
      if (result) result.hidden = false;
      throw error;
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', launch, { once: true });
  else launch();
}
