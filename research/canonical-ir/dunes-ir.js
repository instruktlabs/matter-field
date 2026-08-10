// Research-only bridge: execute the existing authoritative dunes field once
// against the recorder. No field constants or expressions are copied here.

import { dunesField } from '../../examples/dunes.js';
import { CanonicalIrBuilder } from './canonical-ir.js';

export function buildDunesCanonicalIr() {
  const builder = new CanonicalIrBuilder({
    name: 'dunesField',
    parameters: ['x', 'z'],
  });
  const { x, z } = builder.inputs;
  return builder.finish(dunesField(builder.adapter, x, z));
}
