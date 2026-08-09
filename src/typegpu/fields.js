// First-class TypeGPU versions of Matter Field's four example families.
// These are intentionally ordinary, readable JS functions with `use gpu`:
// direct calls are CPU queries, and typed kernels generate WGSL.

import tgpu, { d } from 'typegpu';
import {
  typegpuFbm2,
  typegpuFbm3,
  typegpuPwave,
  typegpuRidge,
  typegpuSmooth,
  typegpuStamp,
} from './primitives.js';

const DUNE_CA = 0.81387845666253389;
const DUNE_SA = 0.58103516053730508;

export function typegpuDunes(x, z) {
  'use gpu';
  const base = typegpuFbm2(x, z, 0.0016);
  const hBase = (base - 0.5) * 24;

  const mRaw = typegpuFbm2(x + 4100, z - 2900, 0.0009);
  const mask = typegpuSmooth(0.35, 0.7, mRaw);

  const u = x * DUNE_CA + z * DUNE_SA;
  const v = z * DUNE_CA - x * DUNE_SA;
  const dn = typegpuFbm3(u * 0.011, v * 0.0028, 1);
  const crests = typegpuRidge(dn, 1.7);
  const hDunes = crests * 18 * (0.25 + mask * 0.75);

  return typegpuStamp(hBase + hDunes, x, z, 120, -340, 40, 90, 14);
}

const SWELL_T1_CA = 0.87758256189037276;
const SWELL_T1_SA = 0.47942553860420301;
const SWELL_T2_CA = -0.58850111725534582;
const SWELL_T2_SA = 0.80849640381959009;

export function typegpuSwell(x, z, t) {
  'use gpu';
  const u1 = x * SWELL_T1_CA + z * SWELL_T1_SA;
  const p1 = (u1 - t * 8) * (1 / 60);
  const w1 = (typegpuPwave(p1) - 0.5) * 1.8;

  const u2 = x * SWELL_T2_CA + z * SWELL_T2_SA;
  const p2 = (u2 - t * 5) * (1 / 23);
  const w2 = (typegpuPwave(p2) - 0.5) * 0.7;

  const cx = x + t * 1.7;
  const cz = z - t * 1.1;
  const chop = (typegpuFbm2(cx, cz, 0.08) - 0.5) * 0.5;
  return w1 + w2 + chop;
}

const WIND_CA = 0.62160996827066439;
const WIND_SA = 0.78332690962748341;
const WIND_SPEED = 6;

function windSurge(t) {
  'use gpu';
  return 0.4 + typegpuPwave(t * (1 / 18)) * 0.6;
}

function windAdvectedX(x, t) {
  'use gpu';
  return x + t * (-WIND_CA * WIND_SPEED);
}

function windAdvectedZ(z, t) {
  'use gpu';
  return z + t * (-WIND_SA * WIND_SPEED);
}

export function typegpuWindX(x, z, t) {
  'use gpu';
  const ax = windAdvectedX(x, t);
  const az = windAdvectedZ(z, t);
  const m1 = (typegpuFbm3(ax, az, 0.004) - 0.5) * 2;
  return (WIND_CA * WIND_SPEED + m1 * 2.5) * windSurge(t);
}

export function typegpuWindZ(x, z, t) {
  'use gpu';
  const ax = windAdvectedX(x, t);
  const az = windAdvectedZ(z, t);
  const m2 = (typegpuFbm3(ax + 7300, az - 1900, 0.004) - 0.5) * 2;
  return (WIND_SA * WIND_SPEED + m2 * 2.5) * windSurge(t);
}

export function typegpuWind(x, z, t) {
  'use gpu';
  return d.vec2f(typegpuWindX(x, z, t), typegpuWindZ(x, z, t));
}

const SERPENT_SPAN = 90;
const SERPENT_LAG = 0.35;
const SERPENT_HUMP_AMP = 7;
const SERPENT_HUMP_FREQ = 1.4;
const SERPENT_SWAY_AMP = 4;
const SERPENT_SWAY_FREQ = 0.55;

export function typegpuSerpentRadius(u) {
  'use gpu';
  return 1.25 + typegpuPwave(u) * 3.2;
}

export function typegpuSerpentX(u, t) {
  'use gpu';
  return u * SERPENT_SPAN;
}

export function typegpuSerpentY(u, t) {
  'use gpu';
  const rt = t - u * SERPENT_LAG;
  const hump = typegpuPwave(rt * SERPENT_HUMP_FREQ) * SERPENT_HUMP_AMP;
  return hump * typegpuSmooth(0.05, 0.3, u);
}

export function typegpuSerpentZ(u, t) {
  'use gpu';
  const rt = t - u * SERPENT_LAG;
  const sway = (typegpuPwave(rt * SERPENT_SWAY_FREQ) - 0.5) * (2 * SERPENT_SWAY_AMP);
  return sway * typegpuSmooth(0.05, 0.3, u);
}

export function typegpuSerpentSpine(u, t) {
  'use gpu';
  return d.vec3f(
    typegpuSerpentX(u, t),
    typegpuSerpentY(u, t),
    typegpuSerpentZ(u, t),
  );
}

export const typegpuKernels = Object.freeze({
  dunes: tgpu.fn([d.f32, d.f32], d.f32)(typegpuDunes).$name('matterDunes'),
  swell: tgpu.fn([d.f32, d.f32, d.f32], d.f32)(typegpuSwell).$name('matterSwell'),
  windX: tgpu.fn([d.f32, d.f32, d.f32], d.f32)(typegpuWindX).$name('matterWindX'),
  windZ: tgpu.fn([d.f32, d.f32, d.f32], d.f32)(typegpuWindZ).$name('matterWindZ'),
  wind: tgpu.fn([d.f32, d.f32, d.f32], d.vec2f)(typegpuWind).$name('matterWind'),
  serpentRadius: tgpu.fn([d.f32], d.f32)(typegpuSerpentRadius).$name('matterSerpentRadius'),
  serpentSpine: tgpu.fn([d.f32, d.f32], d.vec3f)(typegpuSerpentSpine).$name('matterSerpentSpine'),
});
