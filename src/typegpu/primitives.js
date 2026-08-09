// Matter Field's restricted procedural primitives, authored as first-class
// TypeGPU functions. Direct JS calls are the f64 CPU reference path; the
// exported tgpu.fn kernels provide explicit f32/u32 shader signatures.
//
// TypeGPU deliberately keeps ordinary JS numbers as JS numbers on the CPU.
// That is useful for the reference path, but it is not an operation-by-
// operation f32 emulator. Keep using makeF32Adapter() for that diagnostic.

import tgpu, { d } from 'typegpu';
import { abs, floor, isBeingTranspiled, max, min } from 'typegpu/std';
import { hashU32 as hashU32Cpu } from '../hash.js';

export const TYPEGPU_LATTICE_OFFSET = 131072;

const HASH_SCALE = 1 / 4294967296;
const RC = 0.75836187599050819;
const RS = 0.65183377102153661;
const LAC = 2.03;
const OSX = 37.71;
const OSZ = 17.34;

function hashU32GpuImpl(ix, iz, ox, oz) {
  'use gpu';
  const a = d.u32(ix + ox);
  const b = d.u32(iz + oz);
  let h = d.u32(a * d.u32(0x85ebca6b)) ^ d.u32(b * d.u32(0xc2b2ae3d));
  h = d.u32((h ^ (h >> d.u32(13))) * d.u32(0x27d4eb2f));
  return h ^ (h >> d.u32(15));
}

const hashU32Gpu = tgpu
  .fn([d.u32, d.u32, d.u32, d.u32], d.u32)(hashU32GpuImpl)
  .$name('mfHashU32Gpu');

/**
 * The existing exact u32 hash with dual execution semantics.
 *
 * CPU uses Math.imul through hashU32Cpu: multiplying two arbitrary u32 values
 * as JS numbers can lose low bits above 2^53. GPU uses native wrapping u32
 * multiplication. Both implement the same operation sequence.
 */
export function typegpuHashU32(ix, iz, ox, oz) {
  'use gpu';
  return isBeingTranspiled()
    ? hashU32Gpu(ix, iz, ox, oz)
    : hashU32Cpu(ix, iz, ox, oz);
}

export const typegpuHashU32Kernel = tgpu
  .fn([d.u32, d.u32, d.u32, d.u32], d.u32)(typegpuHashU32)
  .$name('mfHashU32');

/** CPU returns the exact f64 scaling; GPU performs the required u32->f32 cast. */
export function typegpuHash01(ix, iz, ox, oz) {
  'use gpu';
  const bits = typegpuHashU32(ix, iz, ox, oz);
  return isBeingTranspiled() ? d.f32(bits) * HASH_SCALE : bits * HASH_SCALE;
}

export function typegpuSmooth(e0, e1, x) {
  'use gpu';
  const t = (x - e0) / (e1 - e0);
  const c = max(0, min(1, t));
  return c * c * (3 - 2 * c);
}

export function typegpuFade(t) {
  'use gpu';
  const t3 = t * t * t;
  return t3 * (t * (t * 6 - 15) + 10);
}

export function typegpuVnoise(x, z, ox, oz) {
  'use gpu';
  const fx = floor(x);
  const fz = floor(z);
  const tx = x - fx;
  const tz = z - fz;
  const ux = typegpuFade(tx);
  const uz = typegpuFade(tz);
  const ix = d.u32(fx + TYPEGPU_LATTICE_OFFSET);
  const iz = d.u32(fz + TYPEGPU_LATTICE_OFFSET);
  const h00 = typegpuHash01(ix, iz, ox, oz);
  const h10 = typegpuHash01(ix, iz, ox + d.u32(1), oz);
  const h01 = typegpuHash01(ix, iz, ox, oz + d.u32(1));
  const h11 = typegpuHash01(ix, iz, ox + d.u32(1), oz + d.u32(1));
  const a = h00 + (h10 - h00) * ux;
  const b = h01 + (h11 - h01) * ux;
  return a + (b - a) * uz;
}

export function typegpuFbm2(x0, z0, freq) {
  'use gpu';
  const x = x0 * freq;
  const z = z0 * freq;
  let sum = typegpuVnoise(x, z, d.u32(0), d.u32(0)) * 0.5;

  const x1 = (x * RC - z * RS) * LAC + OSX;
  const z1 = (x * RS + z * RC) * LAC + OSZ;
  sum = sum + typegpuVnoise(x1, z1, d.u32(0), d.u32(0)) * 0.25;
  return sum * (1 / 0.75);
}

export function typegpuFbm3(x0, z0, freq) {
  'use gpu';
  const x = x0 * freq;
  const z = z0 * freq;
  let sum = typegpuVnoise(x, z, d.u32(0), d.u32(0)) * 0.5;

  const x1 = (x * RC - z * RS) * LAC + OSX;
  const z1 = (x * RS + z * RC) * LAC + OSZ;
  sum = sum + typegpuVnoise(x1, z1, d.u32(0), d.u32(0)) * 0.25;

  const x2 = (x1 * RC - z1 * RS) * LAC + OSX;
  const z2 = (x1 * RS + z1 * RC) * LAC + OSZ;
  sum = sum + typegpuVnoise(x2, z2, d.u32(0), d.u32(0)) * 0.125;
  return sum * (1 / 0.875);
}

export function typegpuRidge(n, sharp) {
  'use gpu';
  const r = 1 - abs(n * 2 - 1);
  return r + (r * r - r) * (sharp - 1);
}

export function typegpuPwave(t) {
  'use gpu';
  const saw = t - floor(t);
  const tri = 1 - abs(saw * 2 - 1);
  return tri * tri * (3 - tri * 2);
}

export function typegpuStamp(h, x, z, cx, cz, rIn, rOut, level) {
  'use gpu';
  const dx = x - cx;
  const dz = z - cz;
  const d2 = dx * dx + dz * dz;
  const w = 1 - typegpuSmooth(rIn * rIn, rOut * rOut, d2);
  return h + (level - h) * w;
}

export const typegpuPrimitiveKernels = Object.freeze({
  hashU32: typegpuHashU32Kernel,
  vnoise: tgpu.fn([d.f32, d.f32, d.u32, d.u32], d.f32)(typegpuVnoise).$name('mfVnoise'),
  fbm2: tgpu.fn([d.f32, d.f32, d.f32], d.f32)(typegpuFbm2).$name('mfFbm2'),
  fbm3: tgpu.fn([d.f32, d.f32, d.f32], d.f32)(typegpuFbm3).$name('mfFbm3'),
  pwave: tgpu.fn([d.f32], d.f32)(typegpuPwave).$name('mfPwave'),
});
