import { Vector3 } from 'three/webgpu';
import { clamp } from './runtime.js';

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

export function installFieldCamera({
  canvas,
  camera,
  focus,
  controls,
  onPrimaryDown,
  onPrimaryMove,
  minDistance = 35,
  maxDistance = 420,
}) {
  const target = focus instanceof Vector3 ? focus.clone() : new Vector3(...focus);
  const initialTarget = target.clone();
  const initialPosition = camera.position.clone();
  const touches = new Map();
  let touchCandidate = null;
  let touchGesture = null;
  let touchWasMulti = false;
  let mouseOrbit = null;
  let yaw = 0;
  let pitch = 0;
  let distance = 1;

  function deriveOrbit() {
    const offset = camera.position.clone().sub(target);
    distance = clamp(offset.length(), minDistance, maxDistance);
    pitch = Math.asin(clamp(offset.y / distance, -0.98, 0.98));
    yaw = Math.atan2(offset.x, offset.z);
  }

  function applyOrbit() {
    const horizontal = Math.cos(pitch) * distance;
    camera.position.set(
      target.x + Math.sin(yaw) * horizontal,
      target.y + Math.sin(pitch) * distance,
      target.z + Math.cos(yaw) * horizontal,
    );
    camera.lookAt(target);
  }

  function orbitBy(dx, dy) {
    yaw -= dx * 0.006;
    pitch = clamp(pitch + dy * 0.005, 0.08, 1.38);
    applyOrbit();
  }

  function zoomBy(factor) {
    distance = clamp(distance * factor, minDistance, maxDistance);
    applyOrbit();
  }

  function reset() {
    target.copy(initialTarget);
    camera.position.copy(initialPosition);
    deriveOrbit();
    applyOrbit();
  }

  function capturePointer(pointerId) {
    try {
      canvas.setPointerCapture?.(pointerId);
    } catch {
      // Synthetic QA events do not create an active platform pointer. The
      // gesture still remains fully testable through our own pointer map.
    }
  }

  deriveOrbit();
  applyOrbit();
  canvas.classList.add('field-camera');
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    zoomBy(Math.exp(clamp(event.deltaY, -240, 240) * 0.0014));
  }, { passive: false });

  canvas.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'touch') {
      capturePointer(event.pointerId);
      touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touches.size === 1) {
        touchCandidate = { id: event.pointerId, x: event.clientX, y: event.clientY };
        touchWasMulti = false;
        onPrimaryMove?.(event);
      } else if (touches.size === 2) {
        touchWasMulti = true;
        touchCandidate = null;
        touchGesture = touchMetrics(touches);
      }
      return;
    }
    if (event.button === 2) {
      event.preventDefault();
      capturePointer(event.pointerId);
      mouseOrbit = { id: event.pointerId, x: event.clientX, y: event.clientY };
      return;
    }
    if (event.button === 0) onPrimaryDown?.(event);
  });

  canvas.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'touch') {
      if (!touches.has(event.pointerId)) return;
      touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touches.size >= 2) {
        const next = touchMetrics(touches);
        if (touchGesture && next) {
          orbitBy(next.x - touchGesture.x, next.y - touchGesture.y);
          zoomBy(touchGesture.distance / next.distance);
        }
        touchGesture = next;
      } else {
        onPrimaryMove?.(event);
      }
      return;
    }
    if (mouseOrbit?.id === event.pointerId) {
      orbitBy(event.clientX - mouseOrbit.x, event.clientY - mouseOrbit.y);
      mouseOrbit = { id: event.pointerId, x: event.clientX, y: event.clientY };
    } else {
      onPrimaryMove?.(event);
    }
  });

  function release(event) {
    if (event.pointerType === 'touch') {
      const wasCandidate = touchCandidate?.id === event.pointerId && !touchWasMulti;
      touches.delete(event.pointerId);
      if (wasCandidate) onPrimaryDown?.(event);
      if (touches.size < 2) touchGesture = null;
      if (touches.size === 0) {
        touchCandidate = null;
        touchWasMulti = false;
      }
      return;
    }
    if (mouseOrbit?.id === event.pointerId) mouseOrbit = null;
  }
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(type, release);

  const resetButton = document.createElement('button');
  resetButton.type = 'button';
  resetButton.className = 'camera-reset';
  resetButton.textContent = 'Reset camera [C]';
  resetButton.addEventListener('click', reset);
  controls.append(resetButton);
  const help = document.createElement('p');
  help.className = 'camera-help';
  help.textContent = 'Camera: right-drag orbit · wheel zoom · two-finger orbit/pinch · C reset';
  controls.append(help);
  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyC' && !event.repeat && !(event.target instanceof HTMLInputElement)) reset();
  });

  return {
    reset,
    getState: () => ({
      position: camera.position.toArray().map((value) => +value.toFixed(3)),
      target: target.toArray().map((value) => +value.toFixed(3)),
      yaw: +yaw.toFixed(4),
      pitch: +pitch.toFixed(4),
      distance: +distance.toFixed(3),
    }),
  };
}
