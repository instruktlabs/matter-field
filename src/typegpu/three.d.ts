import type * as THREE from 'three/webgpu';
import type * as TSL from 'three/tsl';

export type MatterTslNode = THREE.TSL.NodeObject<THREE.Node>;
export type MatterFloatNode = THREE.TSL.NodeObject<THREE.Node<'float'>>;
export type MatterVec2Node = THREE.TSL.NodeObject<THREE.Node<'vec2'>>;
export type MatterVec3Node = THREE.TSL.NodeObject<THREE.Node<'vec3'>>;

export declare const TYPEGPU_THREE_WEBGPU_ONLY = true;
export declare function typegpuDunesNode(xNode: MatterTslNode, zNode: MatterTslNode): MatterFloatNode;
export declare function typegpuSwellNode(
  xNode: MatterTslNode,
  zNode: MatterTslNode,
  timeNode: MatterTslNode,
): MatterFloatNode;
export declare function typegpuWindNode(
  xNode: MatterTslNode,
  zNode: MatterTslNode,
  timeNode: MatterTslNode,
): MatterVec2Node;
export declare function typegpuSerpentSpineNode(uNode: MatterTslNode, timeNode: MatterTslNode): MatterVec3Node;
export declare function typegpuSerpentRadiusNode(uNode: MatterTslNode): MatterFloatNode;

export interface NativeTslCompatibility {
  readonly webgpu: true;
  readonly webgl2: true;
  dunes(x: MatterTslNode, z: MatterTslNode): MatterFloatNode;
  swell(x: MatterTslNode, z: MatterTslNode, t: MatterTslNode): MatterFloatNode;
  wind(x: MatterTslNode, z: MatterTslNode, t: MatterTslNode): { wx: MatterFloatNode; wz: MatterFloatNode };
  serpentRadius(u: MatterTslNode): MatterFloatNode;
  serpentSpine(u: MatterTslNode, t: MatterTslNode): {
    x: MatterFloatNode;
    y: MatterFloatNode;
    z: MatterFloatNode;
  };
}

export declare function makeNativeTslCompatibility(
  tsl: typeof TSL,
  options?: Record<string, unknown>,
): NativeTslCompatibility;
