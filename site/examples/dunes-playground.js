import {
  AmbientLight,
  BoxGeometry,
  Color,
  DirectionalLight,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  Plane,
  PlaneGeometry,
  Raycaster,
  RingGeometry,
  Scene,
  Vector2,
  Vector3,
  WebGPURenderer,
  MeshBasicNodeMaterial,
} from 'three/webgpu';
import * as tsl from 'three/tsl';
import { makeTslAdapter } from '../../src/backend-tsl.js';
import { numberAdapter as N } from '../../src/number.js';
import { DUNES_PAD, dunesField } from '../../examples/dunes.js';
import { installFieldCamera } from './camera-interaction.js';
import {
  addButton,
  addDriveControls,
  clamp,
  createFixedLoop,
  createInput,
  createReadouts,
  formatMode,
  installFullscreen,
  setStageStatus,
} from './runtime.js';

const WORLD = { cx: 40, cz: -340, width: 760, depth: 600 };
const START = { x: -85, z: -155, heading: 2.34 };

function contactHeight(mode, x, z) {
  if (mode === 'unified') return dunesField(N, x, z);
  const cell = 86;
  const staleX = Math.round((x + 34) / cell) * cell - 34;
  const staleZ = Math.round((z - 29) / cell) * cell + 29;
  return dunesField(N, staleX, staleZ);
}

function angleDelta(target, current) {
  return Math.atan2(Math.sin(target - current), Math.cos(target - current));
}

function buildRover() {
  const root = new Group();
  const chassis = new Mesh(
    new BoxGeometry(12, 3.5, 18),
    new MeshStandardMaterial({ color: 0xe0ff76, roughness: 0.72, metalness: 0.12 }),
  );
  chassis.position.y = 3.2;
  root.add(chassis);
  const canopy = new Mesh(
    new BoxGeometry(8, 3.2, 7),
    new MeshStandardMaterial({ color: 0x1c302d, roughness: 0.2, metalness: 0.48 }),
  );
  canopy.position.set(0, 5.6, -1.4);
  root.add(canopy);
  const wheelMaterial = new MeshStandardMaterial({ color: 0x11150f, roughness: 0.95 });
  for (const x of [-7, 7]) {
    for (const z of [-6, 6]) {
      const wheel = new Mesh(new CylinderGeometry(2.4, 2.4, 1.8, 18), wheelMaterial);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 1.8, z);
      root.add(wheel);
    }
  }
  return root;
}

function sampleRover(state) {
  const c = Math.cos(state.heading);
  const s = Math.sin(state.heading);
  const probe = (forward, side, mode = state.mode) => {
    const x = state.x + forward * s + side * c;
    const z = state.z + forward * c - side * s;
    return { x, z, height: contactHeight(mode, x, z), authored: dunesField(N, x, z) };
  };
  const frontLeft = probe(6, -5);
  const frontRight = probe(6, 5);
  const rearLeft = probe(-6, -5);
  const rearRight = probe(-6, 5);
  const contacts = [frontLeft, frontRight, rearLeft, rearRight];
  const contact = contacts.reduce((sum, point) => sum + point.height, 0) / contacts.length;
  const authored = contacts.reduce((sum, point) => sum + point.authored, 0) / contacts.length;
  const front = (frontLeft.height + frontRight.height) / 2;
  const rear = (rearLeft.height + rearRight.height) / 2;
  const left = (frontLeft.height + rearLeft.height) / 2;
  const right = (frontRight.height + rearRight.height) / 2;
  return {
    contacts,
    contact,
    authored,
    proxyDrift: contact - authored,
    pitch: Math.atan2(front - rear, 12),
    roll: Math.atan2(right - left, 10),
  };
}

async function createRenderer(canvas) {
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
  renderer.setClearColor(new Color(0x10160f));
  return renderer;
}

export async function runDunesPlayground({ canvas, controls, readouts }) {
  setStageStatus('initializing TSL terrain…');
  const renderer = await createRenderer(canvas);
  const backend = renderer.backend?.isWebGPUBackend ? 'WebGPU' : 'WebGL2 fallback';
  const scene = new Scene();
  scene.background = new Color(0x10160f);
  scene.add(new AmbientLight(0xc9d9b7, 2.2));
  const sun = new DirectionalLight(0xffe9bd, 3.4);
  sun.position.set(180, 260, 120);
  scene.add(sun);
  const camera = new PerspectiveCamera(43, 16 / 9, 1, 1800);
  camera.position.set(305, 245, 115);
  camera.lookAt(45, 4, -350);

  const A = makeTslAdapter(tsl, { fnName: 'mfDunesPlaygroundHash' });
  const local = tsl.positionLocal;
  const worldX = local.x.add(WORLD.cx);
  const worldZ = tsl.float(WORLD.cz).sub(local.y);
  const height = dunesField(A, worldX, worldZ);
  const terrainMaterial = new MeshBasicNodeMaterial({ side: 2 });
  terrainMaterial.positionNode = tsl.vec3(local.x, local.y, height);
  const elevation = tsl.clamp(height.add(8).div(38), 0, 1);
  terrainMaterial.colorNode = tsl.mix(tsl.color(0x253422), tsl.color(0xb9c76b), elevation);
  const terrain = new Mesh(new PlaneGeometry(WORLD.width, WORLD.depth, 152, 120), terrainMaterial);
  terrain.rotation.x = -Math.PI / 2;
  terrain.position.set(WORLD.cx, 0, WORLD.cz);
  scene.add(terrain);

  const pad = new Mesh(
    new RingGeometry(DUNES_PAD.rIn - 3, DUNES_PAD.rIn + 2, 64),
    new MeshBasicMaterial({ color: 0xd4ff52, transparent: true, opacity: 0.84, side: 2 }),
  );
  pad.rotation.x = -Math.PI / 2;
  pad.position.set(DUNES_PAD.cx, DUNES_PAD.level + 0.16, DUNES_PAD.cz);
  scene.add(pad);

  const targetMarker = new Mesh(
    new RingGeometry(5, 7, 32),
    new MeshBasicMaterial({ color: 0x7af2ce, transparent: true, opacity: 0.92, side: 2 }),
  );
  targetMarker.rotation.x = -Math.PI / 2;
  targetMarker.visible = false;
  scene.add(targetMarker);

  const rover = buildRover();
  scene.add(rover);
  const state = {
    demo: 'dunes',
    paused: false,
    mode: 'unified',
    x: START.x,
    z: START.z,
    heading: START.heading,
    speed: 0,
    target: null,
    contact: null,
    complete: false,
  };
  const input = createInput(canvas);
  const updateReadouts = createReadouts(readouts, [
    ['mode', 'contact mode'],
    ['backend', 'renderer / sampler'],
    ['gap', 'proxy / authored drift'],
    ['speed', 'rover speed'],
    ['goal', 'landing pad'],
    ['readback', 'GPU readback'],
  ]);

  const modeButton = addButton(controls, 'Inject stale proxy', (button) => {
    state.mode = state.mode === 'unified' ? 'proxy' : 'unified';
    button.textContent = state.mode === 'unified' ? 'Inject stale proxy' : 'Restore unified field';
    button.setAttribute('aria-pressed', String(state.mode !== 'unified'));
    setStageStatus(state.mode === 'unified' ? 'GPU displacement and CPU contacts both evaluate dunesField' : 'fault injected: CPU contacts sample a stale coarse proxy', state.mode === 'unified' ? 'pass' : 'warn');
  }, { ariaPressed: false });
  modeButton.classList.add('mode-toggle');
  const pauseButton = addButton(controls, 'Pause', (button) => {
    state.paused = !state.paused;
    button.textContent = state.paused ? 'Resume' : 'Pause';
  });
  addButton(controls, 'Reset rover', () => Object.assign(state, { ...START, speed: 0, target: null, complete: false }));
  addDriveControls(controls, input);
  installFullscreen(canvas);

  const raycaster = new Raycaster();
  const mouse = new Vector2();
  const ground = new Plane(new Vector3(0, 1, 0), 0);
  const hit = new Vector3();
  const setTargetFromPointer = (event) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    if (raycaster.ray.intersectPlane(ground, hit)) {
      state.target = {
        x: clamp(hit.x, WORLD.cx - WORLD.width / 2 + 12, WORLD.cx + WORLD.width / 2 - 12),
        z: clamp(hit.z, WORLD.cz - WORLD.depth / 2 + 12, WORLD.cz + WORLD.depth / 2 - 12),
      };
      targetMarker.visible = true;
    }
  };
  const cameraControls = installFieldCamera({
    canvas,
    camera,
    focus: [45, 4, -350],
    controls,
    onPrimaryDown: setTargetFromPointer,
    minDistance: 120,
    maxDistance: 620,
  });

  function update(dt) {
    const manualInput = Math.abs(input.throttle) > 0.05 || Math.abs(input.steer) > 0.05;
    if (manualInput) state.target = null;
    let throttle = clamp(input.throttle, -1, 1);
    let steer = clamp(input.steer, -1, 1);
    if (state.target) {
      const dx = state.target.x - state.x;
      const dz = state.target.z - state.z;
      const distance = Math.hypot(dx, dz);
      if (distance < 9) {
        state.target = null;
        throttle = 0;
      } else {
        const desired = Math.atan2(dx, dz);
        const delta = angleDelta(desired, state.heading);
        steer = clamp(delta * 1.9, -1, 1);
        throttle = Math.abs(delta) < 1.15 ? 1 : 0.28;
      }
    }
    const acceleration = throttle >= 0 ? 18 : 12;
    state.speed += throttle * acceleration * dt;
    state.speed *= Math.exp(-2.1 * dt);
    state.speed = clamp(state.speed, -12, 29);
    state.heading += steer * (0.75 + Math.abs(state.speed) * 0.034) * dt * (state.speed < 0 ? -1 : 1);
    state.x += Math.sin(state.heading) * state.speed * dt;
    state.z += Math.cos(state.heading) * state.speed * dt;
    state.x = clamp(state.x, WORLD.cx - WORLD.width / 2 + 10, WORLD.cx + WORLD.width / 2 - 10);
    state.z = clamp(state.z, WORLD.cz - WORLD.depth / 2 + 10, WORLD.cz + WORLD.depth / 2 - 10);
    state.contact = sampleRover(state);
    state.complete = Math.hypot(state.x - DUNES_PAD.cx, state.z - DUNES_PAD.cz) < DUNES_PAD.rIn - 7 && Math.abs(state.speed) < 4;
  }

  function resize() {
    const width = Math.max(1, canvas.clientWidth);
    const heightPx = Math.max(1, canvas.clientHeight);
    renderer.setSize(width, heightPx, false);
    camera.aspect = width / heightPx;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  function render() {
    if (!state.contact) state.contact = sampleRover(state);
    rover.position.set(state.x, state.contact.contact + 1.6, state.z);
    rover.rotation.order = 'YXZ';
    rover.rotation.set(-state.contact.pitch, state.heading, state.contact.roll);
    if (state.target) {
      targetMarker.visible = true;
      targetMarker.position.set(state.target.x, dunesField(N, state.target.x, state.target.z) + 0.35, state.target.z);
    } else targetMarker.visible = false;
    pad.material.color.set(state.complete ? 0x7af2ce : 0xd4ff52);
    renderer.render(scene, camera);
    updateReadouts({
      mode: formatMode(state.mode),
      backend: `${backend} / CPU f64`,
      gap: `${state.contact.proxyDrift >= 0 ? '+' : ''}${state.contact.proxyDrift.toFixed(3)} m`,
      speed: `${state.speed.toFixed(1)} m/s`,
      goal: state.complete ? 'PAD SECURED' : `${Math.hypot(state.x - DUNES_PAD.cx, state.z - DUNES_PAD.cz).toFixed(0)} m`,
      readback: '0 per frame',
    });
  }

  createFixedLoop({
    state,
    update,
    render,
    text: () => ({
      demo: 'dunes-rover',
      coordinateSystem: 'world metres; +x right across terrain, +z toward rover heading 0',
      mode: state.mode,
      paused: state.paused,
      renderer: backend,
      rover: { x: +state.x.toFixed(3), z: +state.z.toFixed(3), heading: +state.heading.toFixed(3), speed: +state.speed.toFixed(3) },
      contact: { height: +state.contact.contact.toFixed(5), authoredFieldMean: +state.contact.authored.toFixed(5), proxyDrift: +state.contact.proxyDrift.toFixed(5) },
      target: state.target,
      camera: cameraControls.getState(),
      landingPad: { x: DUNES_PAD.cx, z: DUNES_PAD.cz, radius: DUNES_PAD.rIn, complete: state.complete },
      controls: 'WASD/arrows drive; left-click/one-finger targets; right-drag/two-finger orbit; wheel/pinch zoom; C camera reset; F fullscreen',
    }),
  });
  setStageStatus(`${backend} terrain displacement · CPU contact probes · click terrain or drive`, 'pass');
}
