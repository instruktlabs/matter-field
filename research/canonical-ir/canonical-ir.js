// Research-only canonical expression IR for Matter Field.
//
// This deliberately lives outside the package export surface. It records an
// adapter-authored field as an ordered, versioned tape without changing the
// authoritative field or any published backend.

import { createHash } from 'node:crypto';
import { hash01, hash01f32, LATTICE_OFFSET } from '../../src/hash.js';

export const CANONICAL_IR_SCHEMA = 'matter-field-canonical-ir/v1';
export const CANONICAL_IR_VERSION = 1;

const REF_OWNER = Symbol('matter-field-canonical-ir-owner');
const F64_BUFFER = new ArrayBuffer(8);
const F64_VIEW = new DataView(F64_BUFFER);

const SCALAR_OPS = new Set([
  'add', 'sub', 'mul', 'abs', 'floor', 'sqrt', 'min', 'max', 'mix',
  'clamp01', 'smooth', 'hash01', 'cache',
]);

const OP_ARITY = Object.freeze({
  input: 0,
  const: 0,
  add: 2,
  sub: 2,
  mul: 2,
  abs: 1,
  floor: 1,
  sqrt: 1,
  min: 2,
  max: 2,
  mix: 3,
  clamp01: 1,
  smooth: 3,
  latt: 1,
  hash01: 2,
  cache: 1,
});

/** Encode the exact IEEE-754 binary64 identity of a JavaScript number. */
export function encodeF64(value) {
  if (typeof value !== 'number') throw new TypeError(`expected number, got ${typeof value}`);
  F64_VIEW.setFloat64(0, value, false);
  const hi = F64_VIEW.getUint32(0, false).toString(16).padStart(8, '0');
  const lo = F64_VIEW.getUint32(4, false).toString(16).padStart(8, '0');
  return `0x${hi}${lo}`;
}

/** Decode an exact IEEE-754 binary64 identity produced by encodeF64. */
export function decodeF64(bits) {
  if (typeof bits !== 'string' || !/^0x[0-9a-f]{16}$/.test(bits)) {
    throw new TypeError(`invalid f64 identity: ${String(bits)}`);
  }
  F64_VIEW.setUint32(0, Number.parseInt(bits.slice(2, 10), 16), false);
  F64_VIEW.setUint32(4, Number.parseInt(bits.slice(10, 18), 16), false);
  return F64_VIEW.getFloat64(0, false);
}

/** A shortest round-tripping JavaScript literal, preserving negative zero. */
export function f64Literal(bits) {
  const value = decodeF64(bits);
  if (!Number.isFinite(value)) {
    throw new RangeError(`non-finite constants are outside the canonical field prototype: ${bits}`);
  }
  return Object.is(value, -0) ? '-0' : String(value);
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function makeRef(owner, id) {
  return Object.freeze({ [REF_OWNER]: owner, id });
}

function assertPlainFinite(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite plain number`);
  }
}

/**
 * Expression-recording implementation of the complete 15-operation adapter.
 * Constants are never deduplicated: occurrence and order are field identity.
 */
export class CanonicalIrBuilder {
  constructor({ name, parameters }) {
    if (typeof name !== 'string' || name.length === 0) throw new TypeError('field name is required');
    if (!Array.isArray(parameters) || parameters.length === 0) {
      throw new TypeError('at least one field parameter is required');
    }
    if (new Set(parameters).size !== parameters.length) throw new TypeError('field parameters must be unique');
    for (const parameter of parameters) {
      if (typeof parameter !== 'string' || !/^[A-Za-z_$][\w$]*$/.test(parameter)) {
        throw new TypeError(`invalid field parameter: ${String(parameter)}`);
      }
    }

    this.name = name;
    this.nodes = [];
    this.finished = false;
    const inputs = {};
    const parameterRecords = [];
    for (const parameter of parameters) {
      const ref = this.#append({ op: 'input', valueType: 'scalar', name: parameter });
      inputs[parameter] = ref;
      parameterRecords.push({ name: parameter, node: ref.id, valueType: 'scalar' });
    }
    this.inputs = Object.freeze(inputs);
    this.parameters = Object.freeze(parameterRecords);

    this.adapter = Object.freeze({
      f: (value) => this.#constant(value),
      add: (a, b) => this.#scalarOp('add', [a, b]),
      sub: (a, b) => this.#scalarOp('sub', [a, b]),
      mul: (a, b) => this.#scalarOp('mul', [a, b]),
      abs: (a) => this.#scalarOp('abs', [a]),
      floor: (a) => this.#scalarOp('floor', [a]),
      sqrt: (a) => this.#scalarOp('sqrt', [a]),
      min: (a, b) => this.#scalarOp('min', [a, b]),
      max: (a, b) => this.#scalarOp('max', [a, b]),
      mix: (a, b, t) => this.#scalarOp('mix', [a, b, t]),
      clamp01: (a) => this.#scalarOp('clamp01', [a]),
      smooth: (e0, e1, x) => {
        assertPlainFinite(e0, 'smooth lower edge');
        assertPlainFinite(e1, 'smooth upper edge');
        return this.#scalarOp('smooth', [this.#constant(e0), this.#constant(e1), x]);
      },
      latt: (floored) => {
        const input = this.#assertRef(floored, 'scalar');
        if (!this.#isFloorDerived(input.id)) {
          throw new Error('latt input must derive directly from floor through cache nodes');
        }
        return this.#append({
          op: 'latt',
          valueType: 'lattice-u32',
          args: [input.id],
          offsetF64: encodeF64(LATTICE_OFFSET),
          conversion: 'ECMAScript-ToInt32-via-bitwise-or-zero',
        });
      },
      hash01: (ix, iz, ox, oz) => {
        const x = this.#assertRef(ix, 'lattice-u32');
        const z = this.#assertRef(iz, 'lattice-u32');
        assertPlainFinite(ox, 'hash x offset');
        assertPlainFinite(oz, 'hash z offset');
        if (!Number.isSafeInteger(ox) || !Number.isSafeInteger(oz)) {
          throw new TypeError('hash offsets must be safe plain integers');
        }
        return this.#append({
          op: 'hash01',
          valueType: 'scalar',
          args: [x.id, z.id],
          offsetXF64: encodeF64(ox),
          offsetZF64: encodeF64(oz),
          hashSemantics: 'matter-field-u32-lattice-hash/v1-scaled-by-2^-32',
        });
      },
      cache: (value) => this.#scalarOp('cache', [value], {
        cacheSemantics: 'value-identity-materialization-boundary',
      }),
    });
  }

  #append(node) {
    if (this.finished) throw new Error('canonical IR builder is already finished');
    const id = this.nodes.length;
    this.nodes.push(Object.freeze({ id, ...node }));
    return makeRef(this, id);
  }

  #constant(value) {
    assertPlainFinite(value, 'field constant');
    return this.#append({ op: 'const', valueType: 'scalar', f64: encodeF64(value) });
  }

  #assertRef(value, expectedType) {
    if (!value || value[REF_OWNER] !== this || !Number.isSafeInteger(value.id)) {
      throw new TypeError('adapter operation received a value from outside this IR builder');
    }
    const node = this.nodes[value.id];
    if (!node || node.valueType !== expectedType) {
      throw new TypeError(`adapter operation expected ${expectedType}, got ${node?.valueType ?? 'unknown'}`);
    }
    return value;
  }

  #scalarOp(op, values, extra = {}) {
    const args = values.map((value) => this.#assertRef(value, 'scalar').id);
    return this.#append({ op, valueType: 'scalar', args, ...extra });
  }

  #isFloorDerived(id) {
    const node = this.nodes[id];
    if (node.op === 'floor') return true;
    return node.op === 'cache' && this.#isFloorDerived(node.args[0]);
  }

  finish(result) {
    const output = this.#assertRef(result, 'scalar');
    this.finished = true;
    const ir = {
      schema: CANONICAL_IR_SCHEMA,
      irVersion: CANONICAL_IR_VERSION,
      field: {
        name: this.name,
        parameters: this.parameters,
        resultNode: output.id,
      },
      semantics: {
        evaluationOrder: 'ascending-node-id',
        arithmetic: 'ECMAScript-Number-f64-with-explicit-parenthesization',
        constants: 'IEEE-754-binary64-hex-no-deduplication',
        floor: 'Math.floor',
        mix: 'a + (b - a) * t',
        smooth: 'clamp((x-e0)/(e1-e0),0,1); c*c*(3-2*c)',
        cache: 'numeric identity; retained as a materialization boundary',
        lattice: 'floor-derived-value plus 131072 then ECMAScript ToInt32',
        hash01: 'matter-field hashU32 sequence multiplied by exact 2^-32',
      },
      nodes: this.nodes,
    };
    const problems = canonicalIrProblems(ir);
    if (problems.length > 0) throw new Error(`invalid canonical IR:\n${problems.join('\n')}`);
    return deepFreeze(ir);
  }
}

/** Return validation problems without mutating the IR. */
export function canonicalIrProblems(ir) {
  const problems = [];
  if (!ir || typeof ir !== 'object') return ['IR is not an object'];
  if (ir.schema !== CANONICAL_IR_SCHEMA) problems.push(`unsupported schema: ${String(ir.schema)}`);
  if (ir.irVersion !== CANONICAL_IR_VERSION) problems.push(`unsupported IR version: ${String(ir.irVersion)}`);
  if (!Array.isArray(ir.nodes)) return [...problems, 'nodes is not an array'];

  const types = [];
  for (let index = 0; index < ir.nodes.length; index++) {
    const node = ir.nodes[index];
    if (!node || typeof node !== 'object') {
      problems.push(`node ${index} is not an object`);
      continue;
    }
    if (node.id !== index) problems.push(`node ${index} has non-canonical id ${String(node.id)}`);
    if (typeof node.op !== 'string') problems.push(`node ${index} has no op`);
    if (!['scalar', 'lattice-u32'].includes(node.valueType)) {
      problems.push(`node ${index} has invalid valueType ${String(node.valueType)}`);
    }
    types[index] = node.valueType;
    const args = node.args ?? [];
    if (!Array.isArray(args)) {
      problems.push(`node ${index} args is not an array`);
      continue;
    }
    if (Object.hasOwn(OP_ARITY, node.op) && args.length !== OP_ARITY[node.op]) {
      problems.push(`node ${index} ${node.op} has arity ${args.length}, expected ${OP_ARITY[node.op]}`);
    }
    for (const arg of args) {
      if (!Number.isSafeInteger(arg) || arg < 0 || arg >= index) {
        problems.push(`node ${index} has non-prior argument ${String(arg)}`);
      }
    }
    if (node.op === 'const') {
      try {
        const value = decodeF64(node.f64);
        if (!Number.isFinite(value)) problems.push(`node ${index} has non-finite constant`);
      } catch (error) {
        problems.push(`node ${index} has invalid constant: ${error.message}`);
      }
    }
    if (node.op === 'latt') {
      if (node.args?.length !== 1 || types[node.args?.[0]] !== 'scalar') {
        problems.push(`node ${index} has invalid lattice input`);
      } else if (!isFloorDerivedNode(ir.nodes, node.args[0])) {
        problems.push(`node ${index} lattice input is not floor-derived through cache nodes`);
      }
    }
    if (node.op === 'hash01') {
      if (node.args?.length !== 2 || node.args.some((arg) => types[arg] !== 'lattice-u32')) {
        problems.push(`node ${index} has invalid hash lattice inputs`);
      }
      for (const [label, bits] of [['x', node.offsetXF64], ['z', node.offsetZF64]]) {
        try {
          if (!Number.isSafeInteger(decodeF64(bits))) problems.push(`node ${index} has non-integer hash ${label} offset`);
        } catch (error) {
          problems.push(`node ${index} has invalid hash ${label} offset: ${error.message}`);
        }
      }
    }
    if (!['input', 'const', 'latt', ...SCALAR_OPS].includes(node.op)) {
      problems.push(`node ${index} has unsupported op ${String(node.op)}`);
    } else if (SCALAR_OPS.has(node.op) && node.op !== 'hash01') {
      for (const arg of args) {
        if (types[arg] !== 'scalar') problems.push(`node ${index} ${node.op} has non-scalar argument ${arg}`);
      }
    }
  }

  const result = ir.field?.resultNode;
  if (!Number.isSafeInteger(result) || result < 0 || result >= ir.nodes.length) {
    problems.push(`invalid result node ${String(result)}`);
  } else if (types[result] !== 'scalar') {
    problems.push('result node is not scalar');
  }
  if (!Array.isArray(ir.field?.parameters)) problems.push('field parameters are missing');
  return problems;
}

function isFloorDerivedNode(nodes, id) {
  const node = nodes[id];
  if (!node) return false;
  if (node.op === 'floor') return true;
  return node.op === 'cache' && isFloorDerivedNode(nodes, node.args?.[0]);
}

function stableValue(value, path) {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`non-finite number at ${path}`);
    return Object.is(value, -0) ? '-0' : JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item, index) => stableValue(item, `${path}[${index}]`)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableValue(value[key], `${path}.${key}`)}`).join(',')}}`;
  }
  throw new TypeError(`unsupported canonical value at ${path}: ${typeof value}`);
}

/** Stable JSON serialization with recursively sorted object keys. */
export function serializeCanonicalIr(ir) {
  const problems = canonicalIrProblems(ir);
  if (problems.length > 0) throw new Error(`cannot serialize invalid canonical IR:\n${problems.join('\n')}`);
  return stableValue(ir, '$');
}

/** SHA-256 over the canonical serialization. */
export function canonicalIrSha256(ir) {
  return createHash('sha256').update(serializeCanonicalIr(ir), 'utf8').digest('hex');
}

function evaluateCanonicalIrMode(ir, bindings, mode) {
  const problems = canonicalIrProblems(ir);
  if (problems.length > 0) throw new Error(`cannot evaluate invalid canonical IR:\n${problems.join('\n')}`);
  const useF32 = mode === 'f32';
  const round = useF32 ? Math.fround : (value) => value;
  const values = new Array(ir.nodes.length);
  for (const node of ir.nodes) {
    const args = (node.args ?? []).map((id) => values[id]);
    switch (node.op) {
      case 'input': {
        const value = bindings?.[node.name];
        assertPlainFinite(value, `input ${node.name}`);
        values[node.id] = value;
        break;
      }
      case 'const': values[node.id] = round(decodeF64(node.f64)); break;
      case 'add': values[node.id] = round(args[0] + args[1]); break;
      case 'sub': values[node.id] = round(args[0] - args[1]); break;
      case 'mul': values[node.id] = round(args[0] * args[1]); break;
      case 'abs': values[node.id] = round(Math.abs(args[0])); break;
      case 'floor': values[node.id] = round(Math.floor(args[0])); break;
      case 'sqrt': values[node.id] = round(Math.sqrt(args[0])); break;
      case 'min': values[node.id] = round(Math.min(args[0], args[1])); break;
      case 'max': values[node.id] = round(Math.max(args[0], args[1])); break;
      case 'mix': values[node.id] = useF32
        ? Math.fround(args[0] + Math.fround(Math.fround(args[1] - args[0]) * args[2]))
        : args[0] + (args[1] - args[0]) * args[2];
        break;
      case 'clamp01': values[node.id] = round(Math.max(0, Math.min(1, args[0]))); break;
      case 'smooth': {
        if (useF32) {
          const t = Math.fround(
            Math.fround(args[2] - Math.fround(args[0]))
            / Math.fround(args[1] - Math.fround(args[0])),
          );
          const c = Math.fround(Math.max(0, Math.min(1, t)));
          values[node.id] = Math.fround(
            Math.fround(c * c) * Math.fround(3 - Math.fround(2 * c)),
          );
        } else {
          const t = (args[2] - args[0]) / (args[1] - args[0]);
          const c = t < 0 ? 0 : t > 1 ? 1 : t;
          values[node.id] = c * c * (3 - 2 * c);
        }
        break;
      }
      case 'latt': values[node.id] = (args[0] + decodeF64(node.offsetF64)) | 0; break;
      case 'hash01': {
        const hash = useF32 ? hash01f32 : hash01;
        values[node.id] = hash(
          args[0],
          args[1],
          decodeF64(node.offsetXF64),
          decodeF64(node.offsetZF64),
        );
        break;
      }
      case 'cache': values[node.id] = args[0]; break;
      default: throw new Error(`unhandled canonical op ${node.op}`);
    }
  }
  return values[ir.field.resultNode];
}

/** Evaluate the ordered tape with authoritative JavaScript f64 semantics. */
export function evaluateCanonicalIr(ir, bindings) {
  return evaluateCanonicalIrMode(ir, bindings, 'f64');
}

/** Evaluate the tape with the same operation-wise rounding as makeF32Adapter. */
export function evaluateCanonicalIrF32(ir, bindings) {
  return evaluateCanonicalIrMode(ir, bindings, 'f32');
}

/** Compact deterministic operation histogram for review/tests. */
export function canonicalIrOpCounts(ir) {
  const problems = canonicalIrProblems(ir);
  if (problems.length > 0) throw new Error(`cannot summarize invalid canonical IR:\n${problems.join('\n')}`);
  const counts = {};
  for (const node of ir.nodes) counts[node.op] = (counts[node.op] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}
