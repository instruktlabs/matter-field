import {
  AgXToneMapping,
  BoxGeometry,
  Color,
  DirectionalLight,
  CylinderGeometry,
  Group,
  HemisphereLight,
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
  MeshStandardNodeMaterial,
} from 'three/webgpu';
import * as tsl from 'three/tsl';
import { makeTslAdapter } from '../../src/backend-tsl.js';
import { numberAdapter as N } from '../../src/number.js';
import { DUNES_PAD, dunesField } from '../../examples/dunes.js';
import { installFieldCamera } from './camera-interaction.js';
import {
  DUNES_DISPLAY_SCALE,
  ROVER_TUNING,
  scaleDunesHeight,
  stepRoverSpeed,
} from './demo-tuning.js';
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
  if (mode === 'unified') return scaleDunesHeight(N, dunesField(N, x, z), DUNES_PAD.level);
  const cell = 86;
  const staleX = Math.round((x + 34) / cell) * cell - 34;
  const staleZ = Math.round((z - 29) / cell) * cell + 29;
  return scaleDunesHeight(N, dunesField(N, staleX, staleZ), DUNES_PAD.level);
}

function displayDunesHeightNumber(x, z) {
  return scaleDunesHeight(N, dunesField(N, x, z), DUNES_PAD.level);
}

function angleDelta(target, current) {
  return Math.atan2(Math.sin(target - current), Math.cos(target - current));
}

function buildRover() {
  const root = new Group();
  const body = new Group();
  root.add(body);
  const chassis = new Mesh(
    new BoxGeometry(12, 3.5, 18),
    new MeshStandardMaterial({ color: 0xe0ff76, roughness: 0.72, metalness: 0.12 }),
  );
  chassis.position.y = 3.2;
  body.add(chassis);
  const canopy = new Mesh(
    new BoxGeometry(8, 3.2, 7),
    new MeshStandardMaterial({ color: 0x1c302d, roughness: 0.2, metalness: 0.48 }),
  );
  canopy.position.set(0, 5.6, -1.4);
  body.add(canopy);
  const wheelMaterial = new MeshStandardMaterial({ color: 0x11150f, roughness: 0.95 });
  const wheels = [];
  const wheelLayout = [
    { side: -7, forward: 6 },
    { side: 7, forward: 6 },
    { side: -7, forward: -6 },
    { side: 7, forward: -6 },
  ];
  for (const layout of wheelLayout) {
    const wheel = new Mesh(new CylinderGeometry(2.4, 2.4, 1.8, 18), wheelMaterial);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(layout.side, 1.8, layout.forward);
    root.add(wheel);
    wheels.push({ wheel, y: 1.8 });
  }
  return { root };
}

function sampleRover(state) {
  const c = Math.cos(state.heading);
  const s = Math.sin(state.heading);
  const probe = (forward, side, mode = state.mode) => {
    const x = state.x + forward * s + side * c;
    const z = state.z + forward * c - side * s;
    return { x, z, height: contactHeight(mode, x, z), authored: displayDunesHeightNumber(x, z) };
  };
  const frontLeft = probe(6, -7);
  const frontRight = probe(6, 7);
  const rearLeft = probe(-6, -7);
  const rearRight = probe(-6, 7);
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
    roll: Math.atan2(right - left, 14),
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
  renderer.toneMapping = AgXToneMapping;
  renderer.toneMappingExposure = 1.08;
  return renderer;
}

export async function runDunesPlayground({ canvas, controls, readouts }) {
  setStageStatus('initializing TSL terrain…');
  const renderer = await createRenderer(canvas);
  const backend = renderer.backend?.isWebGPUBackend ? 'WebGPU' : 'WebGL2 fallback';
  const scene = new Scene();
  scene.background = new Color(0x172026);
  scene.add(new HemisphereLight(0xa9c2c6, 0xcaa87a, 0.46));
  const sun = new DirectionalLight(0xffe9bd, 3.7);
  sun.position.set(180, 260, 120);
  scene.add(sun);
  const camera = new PerspectiveCamera(43, 16 / 9, 1, 1800);
  camera.position.set(105, 78, -35);
  camera.lookAt(15, 8, -245);

  const A = makeTslAdapter(tsl, { fnName: 'mfDunesPlaygroundHash' });
  const local = tsl.positionLocal;
  const worldX = local.x.add(WORLD.cx);
  const worldZ = tsl.float(WORLD.cz).sub(local.y);
  const surfaceHeight = tsl.Fn(([x, z]) => (
    scaleDunesHeight(A, dunesField(A, x, z), DUNES_PAD.level)
  )).setLayout({
    name: 'mfDunesSurfaceHeight',
    type: 'float',
    inputs: [
      { name: 'x', type: 'float' },
      { name: 'z', type: 'float' },
    ],
  });
  const height = surfaceHeight(worldX, worldZ);
  const tap = 5;
  const heightX = surfaceHeight(worldX.add(tap), worldZ);
  const heightY = surfaceHeight(worldX, worldZ.sub(tap));
  const objectNormal = tsl.normalize(tsl.vec3(
    height.sub(heightX).div(tap),
    height.sub(heightY).div(tap),
    1,
  ));
  const terrainNormal = tsl.varying(objectNormal);
  const slope = tsl.clamp(tsl.float(1).sub(terrainNormal.z).mul(3.2), 0, 1);
  const worldNormalX = terrainNormal.x;
  const worldNormalZ = terrainNormal.y.negate();
  const lee = tsl.clamp(
    worldNormalX.mul(0.8138784566625339)
      .add(worldNormalZ.mul(0.5810351605373051))
      .mul(-3),
    0,
    1,
  );
  const slipFace = slope.mul(lee);
  const terrainMaterial = new MeshStandardNodeMaterial({ side: 2, metalness: 0, roughness: 0.94 });
  terrainMaterial.positionNode = tsl.vec3(local.x, local.y, height);
  terrainMaterial.normalNode = tsl.transformNormalToView(terrainNormal);
  const elevation = tsl.clamp(height.add(14).div(32), 0, 1);
  const highFlat = elevation.mul(elevation).mul(tsl.float(1).sub(slope));
  const sand = tsl.mix(tsl.color(0xa87545), tsl.color(0xe6cb9c), elevation);
  const leeSand = tsl.mix(sand, tsl.color(0x704223), slipFace.mul(0.64));
  terrainMaterial.colorNode = tsl.mix(leeSand, tsl.color(0xf2e0b7), highFlat.mul(0.3));
  terrainMaterial.roughnessNode = tsl.mix(tsl.float(0.97), tsl.float(0.9), slope);
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
  scene.add(rover.root);
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
    ['ride', 'terrain contact'],
    ['scale', 'display relief'],
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
  addButton(controls, 'Reset rover', () => Object.assign(state, {
    ...START,
    speed: 0,
    target: null,
    complete: false,
  }));
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
    focus: [15, 8, -245],
    controls,
    onPrimaryDown: setTargetFromPointer,
    minDistance: 80,
    maxDistance: 480,
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
    state.speed = stepRoverSpeed(state.speed, throttle, dt);
    // The rover's local +z nose and the camera-facing view make a positive
    // heading a visual left turn. Keep the familiar controls literal: right
    // must turn right, left must turn left (reverse steering mirrors it).
    state.heading -= steer * (0.75 + Math.abs(state.speed) * 0.018) * dt * (state.speed < 0 ? -1 : 1);
    state.x += Math.sin(state.heading) * state.speed * dt;
    state.z += Math.cos(state.heading) * state.speed * dt;
    state.x = clamp(state.x, WORLD.cx - WORLD.width / 2 + 10, WORLD.cx + WORLD.width / 2 - 10);
    state.z = clamp(state.z, WORLD.cz - WORLD.depth / 2 + 10, WORLD.cz + WORLD.depth / 2 - 10);
    state.contact = sampleRover(state);
    state.complete = Math.hypot(state.x - DUNES_PAD.cx, state.z - DUNES_PAD.cz) < DUNES_PAD.rIn - 7
      && Math.abs(state.speed) < 4;
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
    const roverY = state.contact.contact + 1.6;
    rover.root.position.set(state.x, roverY, state.z);
    rover.root.rotation.order = 'YXZ';
    rover.root.rotation.set(-state.contact.pitch, state.heading, state.contact.roll);
    const cameraLookAhead = 20 + Math.abs(state.speed) * 1.2;
    cameraControls.setTarget([
      state.x + Math.sin(state.heading) * cameraLookAhead,
      roverY + 4,
      state.z + Math.cos(state.heading) * cameraLookAhead,
    ]);
    if (state.target) {
      targetMarker.visible = true;
      targetMarker.position.set(state.target.x, displayDunesHeightNumber(state.target.x, state.target.z) + 0.35, state.target.z);
    } else targetMarker.visible = false;
    const targetFov = 43 + Math.min(Math.abs(state.speed) * 0.24, 4.5);
    if (Math.abs(camera.fov - targetFov) > 0.01) {
      camera.fov = targetFov;
      camera.updateProjectionMatrix();
    }
    pad.material.color.set(state.complete ? 0x7af2ce : 0xd4ff52);
    renderer.render(scene, camera);
    updateReadouts({
      mode: formatMode(state.mode),
      backend: `${backend} / CPU f64`,
      gap: `${state.contact.proxyDrift >= 0 ? '+' : ''}${state.contact.proxyDrift.toFixed(3)} m`,
      speed: `${state.speed.toFixed(1)} m/s`,
      ride: '4 CPU PROBES',
      scale: `${DUNES_DISPLAY_SCALE.toFixed(2)}×`,
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
      rover: {
        x: +state.x.toFixed(3), y: +(state.contact.contact + 1.6).toFixed(3), z: +state.z.toFixed(3),
        heading: +state.heading.toFixed(3), speed: +state.speed.toFixed(3),
        pitch: +state.contact.pitch.toFixed(4), roll: +state.contact.roll.toFixed(4),
      },
      contact: { height: +state.contact.contact.toFixed(5), authoredFieldMean: +state.contact.authored.toFixed(5), proxyDrift: +state.contact.proxyDrift.toFixed(5) },
      displayReliefScale: DUNES_DISPLAY_SCALE,
      target: state.target,
      camera: cameraControls.getState(),
      landingPad: { x: DUNES_PAD.cx, z: DUNES_PAD.cz, radius: DUNES_PAD.rIn, complete: state.complete },
      controls: 'WASD/arrows drive; left-click/one-finger targets; right-drag/two-finger orbit; wheel/pinch zoom; C camera reset; F fullscreen',
    }),
  });
  setStageStatus(`${backend} terrain displacement · CPU contact probes · click terrain or drive`, 'pass');
}
