// matter-field: the adapter contract.
//
// A field function is a pure, branchless expression tree written once against
// an abstract math adapter `A` and executed by interchangeable backends. A
// value V is whatever the backend says it is: a number, a {v,dx,dz} dual, a
// shader graph node.
//
// The contract (V = backend value, "plain" = ordinary JS number known at
// graph-build time):
//
//   A.f(x)            plain -> V     lift a constant (may be identity)
//   A.add(a, b)       V,V -> V
//   A.sub(a, b)       V,V -> V
//   A.mul(a, b)       V,V -> V
//   A.abs(a)          V -> V
//   A.floor(a)        V -> V
//   A.sqrt(a)         V -> V
//   A.min(a, b)       V,V -> V
//   A.max(a, b)       V,V -> V
//   A.mix(a, b, t)    V,V,V -> V     a + (b - a) * t, in that order
//   A.clamp01(a)      V -> V
//   A.smooth(e0,e1,x) plain,plain,V -> V   smoothstep; edges are plain
//   A.latt(fv)        V -> L         lattice int from FLOORED value (+OFFSET)
//   A.hash01(ix,iz,ox,oz)  L,L,plain,plain -> V   u32 lattice hash, [0,1)
//   A.cache(v)        V -> V         materialization hint (toVar / identity)
//
// DESIGN RULES - these are the contract as much as the signatures are.
// Breaking one silently voids the parity guarantee:
//
//   1. No data-dependent branching. No `if` on a V, ever. Selection is
//      mix/smoothstep/min/max so the same source structure can become a
//      straight-line shader graph. GPU compilers may still reassociate or
//      fuse eligible float operations within their specifications.
//   2. No transcendentals inside the tree. sin/cos/pow/exp have no
//      cross-vendor precision contract on GPUs (and JS Math.sin is not
//      correctly rounded either). Fold trig of plain constants on the host
//      before lifting; approximate pow with polynomials/mix if needed.
//   3. Floats reach the hash ONLY through floor -> latt. The raw u32 hash is
//      exact only when the backends arrive at the same lattice integers; a
//      float-tree difference near a cell boundary can still change the cell.
//   4. Parenthesization is part of the recorded source identity. Authors must
//      not "simplify" a+(b+c) into (a+b)+c and expect the same goldens. This
//      preserves source intent, not a promise that GPU compilers never
//      reassociate eligible operations.
//   5. Constants are shared f64 literals. Both backends must consume the
//      same JS number; f32 rounding of the same f64 literal is deterministic.
//   6. Keep intermediates finite and normal. Specs allow denormal flushing
//      and assume no overflow/inf/NaN; scale your field accordingly.
//   7. Every V-producing op comes from the adapter. One naked `+` on a
//      number backend works fine and silently breaks every other backend -
//      the type discipline is the only fence (use the dual backend in tests
//      to catch this: naked arithmetic on a dual object yields NaN).

/** Op names every adapter must provide. */
export const ADAPTER_OPS = Object.freeze([
  'f', 'add', 'sub', 'mul', 'abs', 'floor', 'sqrt', 'min', 'max',
  'mix', 'clamp01', 'smooth', 'latt', 'hash01', 'cache',
]);

/**
 * Structural check: does this object claim the full contract?
 * Works for any backend including graph builders (no evaluation).
 * @param {object} A candidate adapter
 * @returns {string[]} list of problems, empty when structurally conformant
 */
export function adapterProblems(A) {
  const problems = [];
  if (!A || typeof A !== 'object') return ['adapter is not an object'];
  for (const op of ADAPTER_OPS) {
    if (typeof A[op] !== 'function') problems.push(`missing op: ${op}`);
  }
  return problems;
}

/**
 * Numeric check for backends whose V is evaluable to a number via `read`.
 * Verifies the algebra on a handful of identities so a mis-wired backend
 * fails fast instead of producing a subtly wrong world.
 *
 * @param {object} A adapter
 * @param {(v: any) => number} read  V -> number (identity for number backends)
 * @param {number} [tol] absolute tolerance (default 1e-12; use ~1e-6 for f32)
 * @returns {string[]} list of failed identities, empty when conformant
 */
export function numericAdapterProblems(A, read = (v) => v, tol = 1e-12) {
  const problems = adapterProblems(A);
  if (problems.length) return problems;
  const near = (got, want, label) => {
    if (!(Math.abs(read(got) - want) <= tol)) {
      problems.push(`${label}: got ${read(got)}, want ${want}`);
    }
  };
  const two = A.f(2), three = A.f(3), half = A.f(0.5);
  near(A.add(two, three), 5, 'add(2,3)');
  near(A.sub(two, three), -1, 'sub(2,3)');
  near(A.mul(two, three), 6, 'mul(2,3)');
  near(A.abs(A.f(-4)), 4, 'abs(-4)');
  near(A.floor(A.f(2.75)), 2, 'floor(2.75)');
  near(A.floor(A.f(-2.25)), -3, 'floor(-2.25)');
  near(A.sqrt(A.f(9)), 3, 'sqrt(9)');
  near(A.min(two, three), 2, 'min(2,3)');
  near(A.max(two, three), 3, 'max(2,3)');
  near(A.mix(two, A.f(4), half), 3, 'mix(2,4,0.5)');
  near(A.clamp01(A.f(1.5)), 1, 'clamp01(1.5)');
  near(A.clamp01(A.f(-0.5)), 0, 'clamp01(-0.5)');
  near(A.smooth(0, 1, half), 0.5, 'smooth(0,1,0.5)');
  near(A.smooth(0, 1, A.f(2)), 1, 'smooth clamp high');
  near(A.smooth(0, 1, A.f(-1)), 0, 'smooth clamp low');
  // hash01 through the sanctioned path: floor -> latt.
  const ix = A.latt(A.floor(A.f(3.9)));
  const iz = A.latt(A.floor(A.f(-2.1)));
  const h = read(A.hash01(ix, iz, 0, 0));
  if (!(h >= 0 && h < 1)) problems.push(`hash01 out of [0,1): ${h}`);
  near(A.cache(A.f(7)), 7, 'cache(7)');
  return problems;
}
