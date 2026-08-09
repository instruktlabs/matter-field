import type { TgpuFn } from 'typegpu';
import type { F32, U32, Vec2f, Vec3f, v2f, v3f } from 'typegpu/data';

export declare const TYPEGPU_LATTICE_OFFSET = 131072;

export declare function typegpuHashU32(ix: number, iz: number, ox: number, oz: number): number;
export declare function typegpuHash01(ix: number, iz: number, ox: number, oz: number): number;
export declare function typegpuSmooth(e0: number, e1: number, x: number): number;
export declare function typegpuFade(t: number): number;
export declare function typegpuVnoise(x: number, z: number, ox: number, oz: number): number;
export declare function typegpuFbm2(x: number, z: number, frequency: number): number;
export declare function typegpuFbm3(x: number, z: number, frequency: number): number;
export declare function typegpuRidge(n: number, sharpness: number): number;
export declare function typegpuPwave(t: number): number;
export declare function typegpuStamp(
  h: number,
  x: number,
  z: number,
  cx: number,
  cz: number,
  innerRadius: number,
  outerRadius: number,
  level: number,
): number;

export declare const typegpuHashU32Kernel: TgpuFn<(ix: U32, iz: U32, ox: U32, oz: U32) => U32>;
export declare const typegpuPrimitiveKernels: Readonly<{
  hashU32: TgpuFn<(ix: U32, iz: U32, ox: U32, oz: U32) => U32>;
  vnoise: TgpuFn<(x: F32, z: F32, ox: U32, oz: U32) => F32>;
  fbm2: TgpuFn<(x: F32, z: F32, frequency: F32) => F32>;
  fbm3: TgpuFn<(x: F32, z: F32, frequency: F32) => F32>;
  pwave: TgpuFn<(t: F32) => F32>;
}>;

export declare function typegpuDunes(x: number, z: number): number;
export declare function typegpuSwell(x: number, z: number, t: number): number;
export declare function typegpuWindX(x: number, z: number, t: number): number;
export declare function typegpuWindZ(x: number, z: number, t: number): number;
/** Convenience f32 vector packaging; use scalar channels for f64 authority. */
export declare function typegpuWind(x: number, z: number, t: number): v2f;
export declare function typegpuSerpentRadius(u: number): number;
export declare function typegpuSerpentX(u: number, t: number): number;
export declare function typegpuSerpentY(u: number, t: number): number;
export declare function typegpuSerpentZ(u: number, t: number): number;
/** Convenience f32 vector packaging; use scalar channels for f64 authority. */
export declare function typegpuSerpentSpine(u: number, t: number): v3f;

export declare const typegpuKernels: Readonly<{
  dunes: TgpuFn<(x: F32, z: F32) => F32>;
  swell: TgpuFn<(x: F32, z: F32, t: F32) => F32>;
  windX: TgpuFn<(x: F32, z: F32, t: F32) => F32>;
  windZ: TgpuFn<(x: F32, z: F32, t: F32) => F32>;
  wind: TgpuFn<(x: F32, z: F32, t: F32) => Vec2f>;
  serpentRadius: TgpuFn<(u: F32) => F32>;
  serpentSpine: TgpuFn<(u: F32, t: F32) => Vec3f>;
}>;
