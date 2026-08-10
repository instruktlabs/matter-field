export type Adapter<V, L> = Readonly<{
    f: (x: number) => V;
    add: (a: V, b: V) => V;
    sub: (a: V, b: V) => V;
    mul: (a: V, b: V) => V;
    abs: (a: V) => V;
    floor: (a: V) => V;
    sqrt: (a: V) => V;
    min: (a: V, b: V) => V;
    max: (a: V, b: V) => V;
    mix: (a: V, b: V, t: V) => V;
    clamp01: (a: V) => V;
    smooth: (e0: number, e1: number, x: V) => V;
    latt: (flooredValue: V) => L;
    hash01: (ix: L, iz: L, ox: number, oz: number) => V;
    cache: (value: V) => V;
}>;
export type Field<V, L, Args extends readonly unknown[]> = (adapter: Adapter<V, L>, ...args: Args) => V;
export type AdapterOp = 'f' | 'add' | 'sub' | 'mul' | 'abs' | 'floor' | 'sqrt' | 'min' | 'max' | 'mix' | 'clamp01' | 'smooth' | 'latt' | 'hash01' | 'cache';
/**
 * A backend for Matter Field's restricted expression vocabulary.
 *
 * `V` is the backend value (number, dual, or shader node). `L` is the
 * backend's lattice-integer representation. Keeping both generic prevents a
 * field from accidentally escaping into native JavaScript arithmetic.
 *
 * @template V
 * @template L
 * @typedef {Readonly<{
 *   f: (x: number) => V,
 *   add: (a: V, b: V) => V,
 *   sub: (a: V, b: V) => V,
 *   mul: (a: V, b: V) => V,
 *   abs: (a: V) => V,
 *   floor: (a: V) => V,
 *   sqrt: (a: V) => V,
 *   min: (a: V, b: V) => V,
 *   max: (a: V, b: V) => V,
 *   mix: (a: V, b: V, t: V) => V,
 *   clamp01: (a: V) => V,
 *   smooth: (e0: number, e1: number, x: V) => V,
 *   latt: (flooredValue: V) => L,
 *   hash01: (ix: L, iz: L, ox: number, oz: number) => V,
 *   cache: (value: V) => V,
 * }>} Adapter
 */
/**
 * A field specialized to one adapter value/lattice pair and input tuple.
 * Adapter-authored field functions can themselves be generic and therefore
 * satisfy several specializations of this type.
 *
 * @template V
 * @template L
 * @template {readonly unknown[]} Args
 * @typedef {(adapter: Adapter<V, L>, ...args: Args) => V} Field
 */
/** @typedef {'f'|'add'|'sub'|'mul'|'abs'|'floor'|'sqrt'|'min'|'max'|'mix'|'clamp01'|'smooth'|'latt'|'hash01'|'cache'} AdapterOp */
/** Op names every adapter must provide. */
/** @type {readonly AdapterOp[]} */
export declare const ADAPTER_OPS: readonly AdapterOp[];
export declare function adapterProblems(A: unknown): string[];
export declare function numericAdapterProblems(A: Adapter<number, number>, read?: (v: number) => number, tol?: number): string[];
export declare function numericAdapterProblems<V, L>(A: Adapter<V, L>, read: (v: V) => number, tol?: number): string[];
//# sourceMappingURL=adapter.d.ts.map