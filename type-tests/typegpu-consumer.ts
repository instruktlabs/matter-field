import { typegpuDunes, typegpuKernels, typegpuWind } from 'matter-field/typegpu';
import {
  TYPEGPU_THREE_WEBGPU_ONLY,
  makeNativeTslCompatibility,
  typegpuDunesNode,
  typegpuSerpentSpineNode,
  typegpuWindNode,
} from 'matter-field/typegpu/three';
import tgpu from 'typegpu';
import * as tsl from 'three/tsl';

const cpuHeight: number = typegpuDunes(12, -30);
const wind = typegpuWind(12, -30, 1);
const windX: number = wind.x;
const wgsl: string = tgpu.resolve({ template: 'field', externals: { field: typegpuKernels.dunes } });
const typegpuNode = typegpuDunesNode(tsl.float(1), tsl.float(2));
const scaledHeight = typegpuNode.mul(0.25);
const windNodeX = typegpuWindNode(tsl.float(1), tsl.float(2), tsl.float(3)).x;
const spineNodeY = typegpuSerpentSpineNode(tsl.float(0.5), tsl.float(3)).y;
const portableNode = makeNativeTslCompatibility(tsl).dunes(tsl.float(1), tsl.float(2));
const portableScaledHeight = portableNode.mul(0.25);

void [
  cpuHeight,
  windX,
  wgsl,
  typegpuNode,
  scaledHeight,
  windNodeX,
  spineNodeY,
  portableNode,
  portableScaledHeight,
  TYPEGPU_THREE_WEBGPU_ONLY,
];
