import type { Field } from '../src/adapter.js';
import type { Dual } from '../src/dual.js';
import type { GoldenPoint } from './golden.js';
export type AssayField = Field<number, number, [number, number]> & Field<Dual, number, [Dual, Dual]>;
export type DriftSample = GoldenPoint & {
    f64: number;
    f32: number;
    ulp: number;
    abs: number;
};
export type DualMismatch = GoldenPoint & {
    number: number;
    dual: number;
};
export type GradientSample = GoldenPoint & {
    dual: {
        v?: number;
        dx: number;
        dz: number;
    };
    fd: {
        dx: number;
        dz: number;
    };
    relErr?: number;
};
export type CpuAssayOptions = {
    points?: readonly GoldenPoint[];
    fdEps?: number;
    benchN?: number;
};
export type CpuAssayReport = {
    schema: 'matter-field-cpu-assay/v1';
    n: number;
    deterministic: boolean;
    f64VsF32: {
        maxUlp: number;
        maxAbs: number;
        maxUlpSample: DriftSample | null;
        maxAbsSample: DriftSample | null;
        worst: DriftSample | null;
        nonFiniteCount: number;
        firstNonFinite: (GoldenPoint & {
            f64: number;
            f32: number;
        }) | null;
    };
    dual: {
        bitExact: boolean;
        worst: DualMismatch | null;
    };
    gradient: {
        checked: number;
        mismatchFraction: number;
        worst: ({
            relErr: number;
        } & Partial<GradientSample>);
        fdEps: number;
        nonFiniteCount: number;
        firstNonFinite: GradientSample | null;
    };
    usPerSample: number;
};
export type AssayBudgets = {
    maxAbs?: number;
    maxUlp?: number | null;
    maxGradMismatch?: number;
};
export type AssayVerdict = {
    pass: boolean;
    fails: string[];
};
/** @import { Adapter, Field } from '../src/adapter.js' */
/** @import { Dual } from '../src/dual.js' */
/** @import { GoldenPoint } from './golden.js' */
/**
 * A field accepted by the CPU assay: the same function must support the
 * numeric and dual adapter specializations.
 * @typedef {Field<number, number, [number, number]> & Field<Dual, number, [Dual, Dual]>} AssayField
 */
/** @typedef {GoldenPoint & { f64: number, f32: number, ulp: number, abs: number }} DriftSample */
/** @typedef {GoldenPoint & { number: number, dual: number }} DualMismatch */
/** @typedef {GoldenPoint & { dual: { v?: number, dx: number, dz: number }, fd: { dx: number, dz: number }, relErr?: number }} GradientSample */
/**
 * @typedef {{
 *   points?: readonly GoldenPoint[],
 *   fdEps?: number,
 *   benchN?: number,
 * }} CpuAssayOptions
 */
/**
 * @typedef {{
 *   schema: 'matter-field-cpu-assay/v1',
 *   n: number,
 *   deterministic: boolean,
 *   f64VsF32: {
 *     maxUlp: number,
 *     maxAbs: number,
 *     maxUlpSample: DriftSample | null,
 *     maxAbsSample: DriftSample | null,
 *     worst: DriftSample | null,
 *     nonFiniteCount: number,
 *     firstNonFinite: (GoldenPoint & { f64: number, f32: number }) | null,
 *   },
 *   dual: { bitExact: boolean, worst: DualMismatch | null },
 *   gradient: {
 *     checked: number,
 *     mismatchFraction: number,
 *     worst: ({ relErr: number } & Partial<GradientSample>),
 *     fdEps: number,
 *     nonFiniteCount: number,
 *     firstNonFinite: GradientSample | null,
 *   },
 *   usPerSample: number,
 * }} CpuAssayReport
 */
/** @typedef {{ maxAbs?: number, maxUlp?: number | null, maxGradMismatch?: number }} AssayBudgets */
/** @typedef {{ pass: boolean, fails: string[] }} AssayVerdict */
/**
 * Run the full CPU assay on a field.
 *
 * @param {AssayField} field single-output field written against the contract
 * @param {CpuAssayOptions} [opts]
 *        points   - golden points (default: 500 generated, extent 20000)
 *        fdEps    - finite-difference epsilon in world units (default 0.01)
 *        benchN   - samples for the cost measurement (default 2000)
 * @returns {CpuAssayReport} plain serializable assay report
 */
export declare function runCpuAssay(field: AssayField, opts?: CpuAssayOptions): CpuAssayReport;
/**
 * One-line verdict for humans. Thresholds are the package's guarantee tiers:
 * determinism and dual bit-exactness must hold outright; f32 drift and
 * gradient mismatch have field-dependent budgets the caller sets.
 *
 * The float-drift budget is ABSOLUTE, in field units (`maxAbs`), because
 * consumers care whether sampled materialization drift exceeds their physical
 * tolerance. Geometry approximation is a separate budget. Ulp counts are
 * reported but
 * unbudgeted by default: near a zero crossing of the field, ulps shrink
 * toward zero, so a physically negligible absolute drift can measure as
 * thousands of ulps - budgeting ulps naively fails healthy fields at their
 * zero crossings. Pass `maxUlp` only when your field's range excludes zero.
 * @param {CpuAssayReport} report
 * @param {AssayBudgets} [budgets]
 * @returns {AssayVerdict}
 */
export declare function assayVerdict(report: CpuAssayReport, { maxAbs, maxUlp, maxGradMismatch }?: AssayBudgets): AssayVerdict;
//# sourceMappingURL=harness.d.ts.map