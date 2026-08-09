// Three.js integration for the TypeGPU-first spike.
//
// The @typegpu/three bridge emits WGSL into Three's node graph and is currently
// WebGPU-only. The native TSL compatibility factory below remains the path for
// Three's WebGL2 fallback. Both are exposed so callers cannot accidentally
// infer portability from a TSL-looking return value.

import * as t3 from '@typegpu/three';
import { d } from 'typegpu';
import { makeTslAdapter } from '../backend-tsl.js';
import { dunesField as adapterDunes } from '../../examples/dunes.js';
import { swellField as adapterSwell } from '../../examples/swell.js';
import { serpentRadius as adapterSerpentRadius, serpentSpine as adapterSerpentSpine } from '../../examples/serpent.js';
import { windField as adapterWind } from '../../examples/wind.js';
import {
  typegpuDunes,
  typegpuSerpentRadius,
  typegpuSerpentSpine,
  typegpuSwell,
  typegpuWind,
} from './fields.js';

export const TYPEGPU_THREE_WEBGPU_ONLY = true;

export function typegpuDunesNode(xNode, zNode) {
  const x = t3.fromTSL(xNode, d.f32);
  const z = t3.fromTSL(zNode, d.f32);
  return t3.toTSL(() => {
    'use gpu';
    return typegpuDunes(x.$, z.$);
  });
}

export function typegpuSwellNode(xNode, zNode, timeNode) {
  const x = t3.fromTSL(xNode, d.f32);
  const z = t3.fromTSL(zNode, d.f32);
  const t = t3.fromTSL(timeNode, d.f32);
  return t3.toTSL(() => {
    'use gpu';
    return typegpuSwell(x.$, z.$, t.$);
  });
}

export function typegpuWindNode(xNode, zNode, timeNode) {
  const x = t3.fromTSL(xNode, d.f32);
  const z = t3.fromTSL(zNode, d.f32);
  const t = t3.fromTSL(timeNode, d.f32);
  return t3.toTSL(() => {
    'use gpu';
    return typegpuWind(x.$, z.$, t.$);
  });
}

export function typegpuSerpentSpineNode(uNode, timeNode) {
  const u = t3.fromTSL(uNode, d.f32);
  const t = t3.fromTSL(timeNode, d.f32);
  return t3.toTSL(() => {
    'use gpu';
    return typegpuSerpentSpine(u.$, t.$);
  });
}

export function typegpuSerpentRadiusNode(uNode) {
  const u = t3.fromTSL(uNode, d.f32);
  return t3.toTSL(() => {
    'use gpu';
    return typegpuSerpentRadius(u.$);
  });
}

/**
 * Native TSL compatibility materialization. This keeps Three's WebGPU and
 * WebGL2 builders available while @typegpu/three remains WebGPU-only.
 * It intentionally uses the adapter-authored compatibility source, so the
 * spike's verdict can account for this remaining dual surface honestly.
 */
export function makeNativeTslCompatibility(tsl, options = {}) {
  const A = makeTslAdapter(tsl, options);
  return Object.freeze({
    webgpu: true,
    webgl2: true,
    dunes: (x, z) => adapterDunes(A, x, z),
    swell: (x, z, t) => adapterSwell(A, x, z, t),
    wind: (x, z, t) => adapterWind(A, x, z, t),
    serpentRadius: (u) => adapterSerpentRadius(A, u),
    serpentSpine: (u, t) => adapterSerpentSpine(A, u, t),
  });
}
