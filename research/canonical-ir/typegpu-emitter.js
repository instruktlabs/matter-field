// Research-only TypeGPU source emitter for the canonical expression tape.
// The output is intentionally expanded: each IR node receives a named local,
// which keeps operation order and parenthesization reviewable.

import {
  canonicalIrProblems,
  canonicalIrSha256,
  decodeF64,
  f64Literal,
} from './canonical-ir.js';

function identifier(value, label) {
  if (typeof value !== 'string' || !/^[A-Za-z_$][\w$]*$/.test(value)) {
    throw new TypeError(`invalid ${label}: ${String(value)}`);
  }
  return value;
}

function nodeName(id, width) {
  return `v${String(id).padStart(width, '0')}`;
}

/** Emit a standalone, precompile-ready TypeGPU module as readable source. */
export function emitTypeGpuSource(ir, options = {}) {
  const problems = canonicalIrProblems(ir);
  if (problems.length > 0) throw new Error(`cannot emit invalid canonical IR:\n${problems.join('\n')}`);

  const functionName = identifier(options.functionName ?? 'generatedDunes', 'function name');
  const kernelName = identifier(options.kernelName ?? 'generatedDunesKernel', 'kernel name');
  const gpuName = options.gpuName ?? 'matterGeneratedDunes';
  const primitiveImport = options.primitiveImport ?? '../../src/typegpu/primitives.js';
  const width = Math.max(4, String(ir.nodes.length - 1).length);
  const names = new Array(ir.nodes.length);
  const stdImports = new Set();
  const primitiveImports = new Set();
  let needsD = true;

  for (const node of ir.nodes) {
    if (['abs', 'floor', 'max', 'min', 'sqrt'].includes(node.op)) stdImports.add(node.op);
    if (node.op === 'smooth') primitiveImports.add('typegpuSmooth');
    if (node.op === 'hash01') primitiveImports.add('typegpuHash01');
    if (node.op === 'latt' || node.op === 'hash01') needsD = true;
  }

  const imports = [`import tgpu${needsD ? ", { d }" : ''} from 'typegpu';`];
  if (stdImports.size > 0) {
    imports.push(`import { ${[...stdImports].sort().join(', ')} } from 'typegpu/std';`);
  }
  if (primitiveImports.size > 0) {
    imports.push(`import { ${[...primitiveImports].sort().join(', ')} } from ${JSON.stringify(primitiveImport)};`);
  }

  const lines = [
    '// Generated research prototype. Not part of the Matter Field package exports.',
    `// canonical-ir-sha256: ${canonicalIrSha256(ir)}`,
    ...imports,
    '',
    `export function ${functionName}(${ir.field.parameters.map(({ name }) => identifier(name, 'parameter')).join(', ')}) {`,
    "  'use gpu';",
  ];

  for (const node of ir.nodes) {
    if (node.op === 'input') {
      names[node.id] = identifier(node.name, 'input');
      lines.push(`  // ${nodeName(node.id, width)}: input ${node.name}`);
      continue;
    }
    const name = nodeName(node.id, width);
    names[node.id] = name;
    const args = (node.args ?? []).map((id) => names[id]);
    let expression;
    let comment = node.op;
    switch (node.op) {
      case 'const':
        expression = f64Literal(node.f64);
        comment = `const f64=${node.f64}`;
        break;
      case 'add': expression = `(${args[0]} + ${args[1]})`; break;
      case 'sub': expression = `(${args[0]} - ${args[1]})`; break;
      case 'mul': expression = `(${args[0]} * ${args[1]})`; break;
      case 'abs': expression = `abs(${args[0]})`; break;
      case 'floor': expression = `floor(${args[0]})`; break;
      case 'sqrt': expression = `sqrt(${args[0]})`; break;
      case 'min': expression = `min(${args[0]}, ${args[1]})`; break;
      case 'max': expression = `max(${args[0]}, ${args[1]})`; break;
      case 'mix': expression = `(${args[0]} + (${args[1]} - ${args[0]}) * ${args[2]})`; break;
      case 'clamp01': expression = `max(0, min(1, ${args[0]}))`; break;
      case 'smooth': expression = `typegpuSmooth(${args[0]}, ${args[1]}, ${args[2]})`; break;
      case 'latt':
        expression = `d.u32(${args[0]} + ${f64Literal(node.offsetF64)})`;
        comment = 'latt: floor-derived + offset -> u32';
        break;
      case 'hash01':
        expression = `typegpuHash01(${args[0]}, ${args[1]}, d.u32(${f64Literal(node.offsetXF64)}), d.u32(${f64Literal(node.offsetZF64)}))`;
        comment = 'hash01: exact u32 sequence, then 2^-32';
        break;
      case 'cache':
        expression = args[0];
        comment = 'cache boundary (source-visible alias; compiler materialization is not guaranteed)';
        break;
      default: throw new Error(`unhandled TypeGPU emitter op ${node.op}`);
    }
    lines.push(`  const ${name} = ${expression}; // ${comment}`);
  }

  const resultName = names[ir.field.resultNode];
  lines.push(
    `  return ${resultName};`,
    '}',
    '',
    `export const ${kernelName} = tgpu`,
    `  .fn([${ir.field.parameters.map(() => 'd.f32').join(', ')}], d.f32)(${functionName})`,
    `  .$name(${JSON.stringify(gpuName)});`,
    '',
  );

  // Fail before returning source if an encoded plain hash offset would not be
  // a safe integer. The IR validator checks this too; this makes the emitter's
  // assumption local and explicit.
  for (const node of ir.nodes.filter(({ op }) => op === 'hash01')) {
    if (!Number.isSafeInteger(decodeF64(node.offsetXF64)) || !Number.isSafeInteger(decodeF64(node.offsetZF64))) {
      throw new Error(`hash node ${node.id} has an unsafe offset`);
    }
  }

  return lines.join('\n');
}
