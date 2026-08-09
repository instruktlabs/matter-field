// Handwritten plain-JavaScript equivalent of examples/dunes.js.
//
// Keep every expression ordered like the canonical adapter implementation.
// This is the no-adapter baseline: changing parenthesization here changes the
// benchmark question and must be accompanied by a bit-exact self-test update.

const LATTICE_OFFSET = 131072;
const RC = 0.75836187599050819;
const RS = 0.65183377102153661;
const OSX = 37.71;
const OSZ = 17.34;
const CA = 0.81387845666253389;
const SA = 0.58103516053730508;

function hash01(ix, iz, ox, oz) {
  const a = (ix + ox) | 0;
  const b = (iz + oz) | 0;
  let h = (Math.imul(a, 0x85ebca6b) ^ Math.imul(b, 0xc2b2ae3d)) | 0;
  h = Math.imul(h ^ (h >>> 13), 0x27d4eb2f) | 0;
  h = (h ^ (h >>> 15)) >>> 0;
  return h * (1 / 4294967296);
}

function mix(a, b, t) {
  return a + (b - a) * t;
}

function smooth(e0, e1, x) {
  const t = (x - e0) / (e1 - e0);
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
}

function fade(t) {
  const t3 = (t * t) * t;
  return t3 * (t * ((t * 6) - 15) + 10);
}

function vnoise(x, z, ox = 0, oz = 0) {
  const fx = Math.floor(x);
  const fz = Math.floor(z);
  const tx = x - fx;
  const tz = z - fz;
  const ux = fade(tx);
  const uz = fade(tz);
  const ix = (fx + LATTICE_OFFSET) | 0;
  const iz = (fz + LATTICE_OFFSET) | 0;
  const h00 = hash01(ix, iz, ox, oz);
  const h10 = hash01(ix, iz, ox + 1, oz);
  const h01 = hash01(ix, iz, ox, oz + 1);
  const h11 = hash01(ix, iz, ox + 1, oz + 1);
  const a = mix(h00, h10, ux);
  const b = mix(h01, h11, ux);
  return mix(a, b, uz);
}

function fbm(x0, z0, freq, oct, gain = 0.5, lac = 2.03) {
  let x = x0 * freq;
  let z = z0 * freq;
  let amp = 0.5;
  let sum = null;
  let norm = 0;

  for (let i = 0; i < oct; i++) {
    const n = vnoise(x, z);
    const term = n * amp;
    sum = sum === null ? term : sum + term;
    norm += amp;
    amp *= gain;
    if (i < oct - 1) {
      const nx = ((((x * RC) - (z * RS)) * lac) + OSX);
      const nz = ((((x * RS) + (z * RC)) * lac) + OSZ);
      x = nx;
      z = nz;
    }
  }

  return sum * (1 / norm);
}

function ridge(n, sharp) {
  const r = 1 - Math.abs((n * 2) - 1);
  return mix(r, r * r, sharp - 1);
}

function stamp(h, x, z) {
  const dx = x - 120;
  const dz = z - (-340);
  const d2 = (dx * dx) + (dz * dz);
  const w = 1 - smooth(40 * 40, 90 * 90, d2);
  return mix(h, 14, w);
}

export function handwrittenDunes(x, z) {
  const base = fbm(x, z, 0.0016, 2);
  const hBase = (base - 0.5) * 24;

  const mRaw = fbm(x + 4100, z - 2900, 0.0009, 2);
  const mask = smooth(0.35, 0.7, mRaw);

  const u = (x * CA) + (z * SA);
  const v = (z * CA) - (x * SA);
  const dn = fbm(u * 0.011, v * 0.0028, 1, 3);
  const crests = ridge(dn, 1.7);
  const hDunes = (crests * 18) * (0.25 + (mask * 0.75));

  const h = hBase + hDunes;
  return stamp(h, x, z);
}
