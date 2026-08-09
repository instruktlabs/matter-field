const FIXED_DT = 1 / 60;

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function wrap(value, min, max) {
  const span = max - min;
  return ((value - min) % span + span) % span + min;
}

export function canvasPoint(canvas, event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) / rect.width * canvas.width,
    y: (event.clientY - rect.top) / rect.height * canvas.height,
  };
}

export function createReadouts(container, definitions) {
  const outputs = new Map();
  container.replaceChildren(...definitions.map(([key, label]) => {
    const node = document.createElement('div');
    node.className = 'readout';
    const name = document.createElement('span');
    name.textContent = label;
    const output = document.createElement('strong');
    output.textContent = '—';
    node.append(name, output);
    outputs.set(key, output);
    return node;
  }));
  let previous = 0;
  return (values, force = false) => {
    const now = performance.now();
    if (!force && now - previous < 90) return;
    previous = now;
    for (const [key, value] of Object.entries(values)) {
      const output = outputs.get(key);
      if (output) output.textContent = String(value);
    }
  };
}

export function addButton(container, label, onClick, options = {}) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  if (options.className) button.className = options.className;
  if (options.ariaPressed !== undefined) button.setAttribute('aria-pressed', String(options.ariaPressed));
  button.addEventListener('click', () => onClick(button));
  container.append(button);
  return button;
}

export function addHoldButton(container, label, intent, value = 1) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'hold-button';
  button.textContent = label;
  const release = () => {
    intent.value = 0;
    button.classList.remove('is-held');
  };
  button.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    button.setPointerCapture?.(event.pointerId);
    intent.value = value;
    button.classList.add('is-held');
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, release);
  container.append(button);
  return button;
}

export function createInput(canvas) {
  const keys = new Set();
  const input = {
    forward: { value: 0 },
    reverse: { value: 0 },
    left: { value: 0 },
    right: { value: 0 },
    actionQueued: false,
    get throttle() {
      return (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0)
        - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0)
        + this.forward.value - this.reverse.value;
    },
    get steer() {
      return (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0)
        - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0)
        + this.right.value - this.left.value;
    },
    consumeAction() {
      const queued = this.actionQueued;
      this.actionQueued = false;
      return queued;
    },
    clear() {
      keys.clear();
      this.forward.value = this.reverse.value = this.left.value = this.right.value = 0;
    },
  };

  window.addEventListener('keydown', (event) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLButtonElement) return;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
    keys.add(event.code);
    if (event.code === 'Space' && !event.repeat) input.actionQueued = true;
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  window.addEventListener('blur', () => input.clear());
  document.addEventListener('visibilitychange', () => { if (document.hidden) input.clear(); });
  canvas.addEventListener('pointerdown', () => canvas.focus({ preventScroll: true }));
  return input;
}

export function addDriveControls(container, input, { actionLabel = null } = {}) {
  const cluster = document.createElement('div');
  cluster.className = 'drive-controls';
  addHoldButton(cluster, '←', input.left);
  addHoldButton(cluster, '↑', input.forward);
  addHoldButton(cluster, '↓', input.reverse);
  addHoldButton(cluster, '→', input.right);
  if (actionLabel) addButton(cluster, actionLabel, () => { input.actionQueued = true; });
  container.append(cluster);
}

export function createFixedLoop({ update, render, text, state }) {
  let accumulator = 0;
  let previous = performance.now();
  let manual = false;

  function step(seconds) {
    const count = Math.max(1, Math.round(seconds / FIXED_DT));
    for (let i = 0; i < count; i++) update(FIXED_DT);
  }

  function frame(now) {
    const elapsed = Math.min(0.1, (now - previous) / 1000);
    previous = now;
    if (!manual && !state.paused) {
      accumulator += elapsed;
      while (accumulator >= FIXED_DT) {
        update(FIXED_DT);
        accumulator -= FIXED_DT;
      }
    }
    render();
    requestAnimationFrame(frame);
  }

  window.render_game_to_text = () => JSON.stringify(text());
  window.advanceTime = (milliseconds) => {
    manual = true;
    if (!state.paused) step(Math.max(0, milliseconds) / 1000);
    render();
    return window.render_game_to_text();
  };
  requestAnimationFrame(frame);
  return { step };
}

export function formatMode(mode) {
  return mode === 'unified' ? 'UNIFIED FIELD' : 'FAULT: STALE PROXY';
}

export function installFullscreen(canvas) {
  window.addEventListener('keydown', async (event) => {
    if (event.code !== 'KeyF' || event.repeat) return;
    if (document.fullscreenElement) await document.exitFullscreen();
    else await canvas.closest('.stage')?.requestFullscreen();
  });
}

export function setStageStatus(message, tone = '') {
  const status = document.querySelector('#stage-status');
  if (!status) return;
  status.textContent = message;
  status.dataset.tone = tone;
}
