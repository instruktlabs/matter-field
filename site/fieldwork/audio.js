const AudioContextCtor = globalThis.AudioContext ?? globalThis.webkitAudioContext;

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function moveGain(gain, value, seconds = 0.08) {
  if (!gain) return;
  const now = gain.context.currentTime;
  gain.gain.cancelScheduledValues(now);
  gain.gain.setValueAtTime(gain.gain.value, now);
  gain.gain.linearRampToValueAtTime(value, now + seconds);
}

function makeNoiseBuffer(context, seconds, seed) {
  const length = Math.max(1, Math.ceil(context.sampleRate * seconds));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const channel = buffer.getChannelData(0);
  let state = seed >>> 0;
  for (let i = 0; i < length; i += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    channel[i] = (state / 0x80000000) - 1;
  }
  return buffer;
}

/**
 * Procedural Web Audio owner for FIELDWORK: BREACH RUN.
 *
 * Nothing is created until `unlock()` runs from a user gesture. The release
 * contains no external sound files: wind, engine, telemetry, impacts, and UI
 * cues are synthesized locally from oscillators, filters, envelopes, and a
 * deterministic noise generator.
 */
export class FieldworkAudio {
  constructor({ onError = console.warn } = {}) {
    this.onError = onError;
    this.context = null;
    this.groups = new Map();
    this.loops = new Map();
    this.muted = false;
    this.paused = true;
    this.running = false;
    this.destroyed = false;
    this.lastScanAt = -Infinity;
    this.noiseSeed = 0x6d617474;
  }

  get supported() {
    return Boolean(AudioContextCtor);
  }

  async unlock() {
    if (this.destroyed || !this.supported) return false;
    try {
      if (!this.context) this.#createContext();
      if (this.context.state !== 'running') await this.context.resume();
      this.#ensureLoops();
      this.#applyMix();
      return true;
    } catch (error) {
      this.onError('Procedural audio unavailable', error);
      return false;
    }
  }

  #createContext() {
    this.context = new AudioContextCtor();
    const master = this.context.createGain();
    master.gain.value = 0.76;
    master.connect(this.context.destination);
    this.groups.set('master', master);

    for (const [name, level] of [
      ['ambience', 0],
      ['engine', 0],
      ['sfx', 0.68],
      ['ui', 0.52],
    ]) {
      const gain = this.context.createGain();
      gain.gain.value = level;
      gain.connect(master);
      this.groups.set(name, gain);
    }
  }

  #ensureLoops() {
    if (!this.context || this.loops.size > 0) return;
    const context = this.context;

    const wind = context.createBufferSource();
    const windFilter = context.createBiquadFilter();
    const windGain = context.createGain();
    wind.buffer = makeNoiseBuffer(context, 4, 0x77696e64);
    wind.loop = true;
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 620;
    windFilter.Q.value = 0.42;
    windGain.gain.value = 0.34;
    wind.connect(windFilter).connect(windGain).connect(this.groups.get('ambience'));

    const fieldHum = context.createOscillator();
    const fieldHumGain = context.createGain();
    fieldHum.type = 'sine';
    fieldHum.frequency.value = 54;
    fieldHumGain.gain.value = 0.055;
    fieldHum.connect(fieldHumGain).connect(this.groups.get('ambience'));

    const engine = context.createOscillator();
    const engineOvertone = context.createOscillator();
    const engineFilter = context.createBiquadFilter();
    const engineGain = context.createGain();
    engine.type = 'triangle';
    engineOvertone.type = 'sawtooth';
    engine.frequency.value = 58;
    engineOvertone.frequency.value = 116;
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 460;
    engineFilter.Q.value = 0.7;
    engineGain.gain.value = 0.25;
    engine.connect(engineFilter);
    engineOvertone.connect(engineFilter);
    engineFilter.connect(engineGain).connect(this.groups.get('engine'));

    wind.start();
    fieldHum.start();
    engine.start();
    engineOvertone.start();

    this.loops.set('ambience', {
      nodes: [wind, fieldHum],
      filter: windFilter,
      hum: fieldHum,
      gain: windGain,
    });
    this.loops.set('engine', {
      nodes: [engine, engineOvertone],
      primary: engine,
      overtone: engineOvertone,
      filter: engineFilter,
      gain: engineGain,
    });
  }

  #tone({
    group = 'sfx',
    frequency,
    endFrequency = frequency,
    start = 0,
    duration = 0.16,
    volume = 0.3,
    type = 'sine',
  }) {
    if (!this.context) return;
    const context = this.context;
    const at = context.currentTime + start;
    const end = at + duration;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(Math.max(20, frequency), at);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), end);
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), at + Math.min(0.018, duration * 0.2));
    envelope.gain.exponentialRampToValueAtTime(0.0001, end);
    oscillator.connect(envelope).connect(this.groups.get(group) ?? this.groups.get('sfx'));
    oscillator.start(at);
    oscillator.stop(end + 0.02);
  }

  #noiseBurst({
    group = 'sfx',
    start = 0,
    duration = 0.18,
    volume = 0.22,
    frequency = 340,
    endFrequency = frequency,
    type = 'lowpass',
  }) {
    if (!this.context) return;
    const context = this.context;
    const at = context.currentTime + start;
    const end = at + duration;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const envelope = context.createGain();
    this.noiseSeed = (Math.imul(this.noiseSeed, 1664525) + 1013904223) >>> 0;
    source.buffer = makeNoiseBuffer(context, duration + 0.03, this.noiseSeed);
    filter.type = type;
    filter.Q.value = 0.8;
    filter.frequency.setValueAtTime(Math.max(30, frequency), at);
    filter.frequency.exponentialRampToValueAtTime(Math.max(30, endFrequency), end);
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), at + Math.min(0.012, duration * 0.2));
    envelope.gain.exponentialRampToValueAtTime(0.0001, end);
    source.connect(filter).connect(envelope).connect(this.groups.get(group) ?? this.groups.get('sfx'));
    source.start(at);
    source.stop(end + 0.02);
  }

  #applyMix() {
    if (!this.context) return;
    moveGain(this.groups.get('master'), this.muted ? 0 : 0.76, 0.06);
    const active = this.running && !this.paused;
    moveGain(this.groups.get('ambience'), active ? 0.34 : 0.09, 0.18);
    if (!active) moveGain(this.groups.get('engine'), 0, 0.12);
  }

  setRunning(running) {
    this.running = Boolean(running);
    this.#applyMix();
  }

  setPaused(paused) {
    this.paused = Boolean(paused);
    this.#applyMix();
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    this.#applyMix();
    return this.muted;
  }

  toggleMuted() {
    return this.setMuted(!this.muted);
  }

  update({ speed = 0, wind = 0, serpentDistance = Infinity } = {}) {
    if (!this.context || !this.running || this.paused) return;
    const now = this.context.currentTime;
    const normalizedSpeed = clamp01(Math.abs(speed) / 26);
    const gust = clamp01(wind / 9);
    const danger = Number.isFinite(serpentDistance)
      ? clamp01(1 - serpentDistance / 32)
      : 0;
    moveGain(this.groups.get('engine'), 0.06 + normalizedSpeed * 0.34, 0.09);
    moveGain(this.groups.get('ambience'), 0.26 + gust * 0.13 + danger * 0.07, 0.16);

    const engine = this.loops.get('engine');
    engine?.primary.frequency.setTargetAtTime(54 + normalizedSpeed * 48, now, 0.08);
    engine?.overtone.frequency.setTargetAtTime(108 + normalizedSpeed * 101, now, 0.08);
    engine?.filter.frequency.setTargetAtTime(390 + normalizedSpeed * 520, now, 0.08);

    const ambience = this.loops.get('ambience');
    ambience?.filter.frequency.setTargetAtTime(520 + gust * 780, now, 0.18);
    ambience?.hum.frequency.setTargetAtTime(52 + danger * 14, now, 0.16);
  }

  play(id, { group = 'sfx', volume = 1, rate = 1 } = {}) {
    if (!this.context || this.context.state !== 'running' || this.muted) return false;
    const v = Math.max(0.01, volume);
    const r = Math.max(0.25, rate);

    switch (id) {
      case 'confirm':
        this.#tone({ group, frequency: 392 * r, endFrequency: 440 * r, duration: 0.09, volume: 0.24 * v, type: 'triangle' });
        this.#tone({ group, frequency: 587 * r, start: 0.065, duration: 0.13, volume: 0.2 * v });
        break;
      case 'toggle':
        this.#tone({ group, frequency: 240 * r, endFrequency: 170 * r, duration: 0.065, volume: 0.2 * v, type: 'square' });
        this.#noiseBurst({ group, duration: 0.045, volume: 0.08 * v, frequency: 1100, endFrequency: 420 });
        break;
      case 'fail':
        this.#tone({ group, frequency: 330 * r, endFrequency: 92 * r, duration: 0.52, volume: 0.26 * v, type: 'triangle' });
        this.#tone({ group, frequency: 165 * r, endFrequency: 55 * r, start: 0.06, duration: 0.48, volume: 0.16 * v });
        break;
      case 'checkpoint':
        this.#tone({ group, frequency: 520 * r, endFrequency: 570 * r, duration: 0.12, volume: 0.26 * v });
        this.#tone({ group, frequency: 780 * r, start: 0.09, duration: 0.24, volume: 0.22 * v, type: 'triangle' });
        break;
      case 'scan':
        this.#noiseBurst({ group, duration: 0.38, volume: 0.16 * v, frequency: 170, endFrequency: 1500, type: 'bandpass' });
        this.#tone({ group, frequency: 210 * r, endFrequency: 630 * r, duration: 0.34, volume: 0.14 * v });
        break;
      case 'impact':
        this.#noiseBurst({ group, duration: 0.22, volume: 0.34 * v, frequency: 260, endFrequency: 72 });
        this.#tone({ group, frequency: 92 * r, endFrequency: 38 * r, duration: 0.26, volume: 0.3 * v, type: 'triangle' });
        this.#tone({ group, frequency: 860 * r, endFrequency: 430 * r, start: 0.025, duration: 0.08, volume: 0.08 * v });
        break;
      case 'complete':
        [392, 494, 659].forEach((frequency, index) => this.#tone({
          group,
          frequency: frequency * r,
          start: index * 0.11,
          duration: 0.46,
          volume: (0.2 - index * 0.018) * v,
          type: index === 2 ? 'sine' : 'triangle',
        }));
        break;
      default:
        return false;
    }
    return true;
  }

  playScan() {
    if (!this.context) return false;
    const now = this.context.currentTime;
    if (now - this.lastScanAt < 0.22) return false;
    this.lastScanAt = now;
    return this.play('scan', { volume: 0.48, rate: 0.96 });
  }

  async destroy() {
    this.destroyed = true;
    for (const loop of this.loops.values()) {
      for (const node of loop.nodes) {
        try { node.stop(); } catch { /* already stopped */ }
      }
    }
    this.loops.clear();
    if (this.context && this.context.state !== 'closed') await this.context.close();
    this.context = null;
  }
}

export function createFieldworkAudio(options) {
  return new FieldworkAudio(options);
}
