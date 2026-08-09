import { numberAdapter } from '../src/number.js';
import { dunesField } from '../examples/dunes.js';
import { swellField } from '../examples/swell.js';
import { windField } from '../examples/wind.js';

function f64Hex(value) {
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  view.setFloat64(0, value, false);
  return `${view.getUint32(0, false).toString(16).padStart(8, '0')}${view.getUint32(4, false).toString(16).padStart(8, '0')}`;
}

export function cpuFieldBits(points) {
  return points.map(({ x, z }) => {
    const wind = windField(numberAdapter, x, z, 1);
    return [
      f64Hex(dunesField(numberAdapter, x, z)),
      f64Hex(swellField(numberAdapter, x, z, 2.5)),
      f64Hex(wind.wx),
      f64Hex(wind.wz),
    ];
  });
}
