import type { Adapter } from './adapter.js';
export type TslFloatNode = import('three/webgpu').TSL.NodeObject<import('three/webgpu').Node<'float'>>;
export type TslUintNode = import('three/webgpu').TSL.NodeObject<import('three/webgpu').Node<'uint'>>;
export type TslHashU32 = (ix: TslUintNode, iz: TslUintNode, ox: number, oz: number) => TslUintNode;
export type TslHash = (ix: TslUintNode, iz: TslUintNode, ox: number, oz: number) => TslFloatNode;
export type TslHashOptions = {
    fnName?: string;
};
export type TslAdapterOptions = TslHashOptions & {
    hash01?: TslHash;
};
export declare function makeTslHashU32(tsl: typeof import('three/tsl'), options?: TslHashOptions): TslHashU32;
export declare function makeTslHash(tsl: typeof import('three/tsl'), options?: TslHashOptions): TslHash;
export declare function makeTslAdapter(tsl: typeof import('three/tsl'), opts?: TslAdapterOptions): Adapter<TslFloatNode, TslUintNode>;
//# sourceMappingURL=backend-tsl.d.ts.map