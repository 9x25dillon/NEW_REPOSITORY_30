// linalg.ts — enough linear algebra to diagonalise a band problem, and no more.
//
// The plane-wave expansion in bands.ts produces a generalised symmetric
// eigenproblem A x = lambda B x with B positive definite, and nothing else in
// this repository needs a matrix at all. So this is a Jacobi rotation solver
// and a Cholesky factorisation, written out, rather than a dependency.
//
// That is a deliberate call and it was cheap. The alternative was a numerical
// package whose eigensolver is a wrapper around LAPACK that will not run in a
// browser, for a problem whose matrices are a few tens of rows and symmetric.
// Cyclic Jacobi is about sixty lines, converges unconditionally for real
// symmetric input, and gives eigenvalues accurate to machine precision without
// any of the shift heuristics a QR implementation would need to get right.
//
// It is O(n^3) per sweep and would be the wrong choice at n = 1000. At n = 49 —
// a 7x7 grid of reciprocal lattice vectors, which resolves the low bands of a
// phononic crystal perfectly well — it is instant.

export type Matrix = number[][];

export function zeros(n: number, m = n): Matrix {
  return Array.from({ length: n }, () => new Array(m).fill(0));
}

export function identity(n: number): Matrix {
  const I = zeros(n);
  for (let i = 0; i < n; i++) I[i][i] = 1;
  return I;
}

/** Largest absolute deviation from symmetry — the input contract, checked. */
export function asymmetry(A: Matrix): number {
  let worst = 0;
  for (let i = 0; i < A.length; i++) {
    for (let j = i + 1; j < A.length; j++) {
      worst = Math.max(worst, Math.abs(A[i][j] - A[j][i]));
    }
  }
  return worst;
}

export interface Eigen {
  /** Ascending. */
  values: number[];
  /** Column k of `vectors` is the eigenvector for `values[k]`. */
  vectors: Matrix;
  sweeps: number;
}

/**
 * Eigenvalues and eigenvectors of a real symmetric matrix, by cyclic Jacobi.
 *
 * Each rotation zeroes one off-diagonal pair and can only decrease the sum of
 * squares of the off-diagonal entries, which is why the method cannot diverge
 * and needs no shifts. Sweeps run until that sum is negligible against the
 * matrix norm — a RELATIVE test, because a stiffness matrix in SI units has
 * entries around 1e10 and an absolute tolerance would either never trigger or
 * trigger immediately depending on the units the caller happened to use.
 */
export function symmetricEigen(input: Matrix, maxSweeps = 100): Eigen {
  const n = input.length;
  const a = input.map((r) => [...r]);
  const v = identity(n);

  let scale = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) scale += a[i][j] * a[i][j];
  scale = Math.sqrt(scale);
  const tol = (scale || 1) * 1e-14;

  let sweeps = 0;
  for (; sweeps < maxSweeps; sweeps++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += a[i][j] * a[i][j];
    if (Math.sqrt(off) <= tol) break;

    for (let p = 0; p < n - 1; p++) {
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(a[p][q]) <= tol / n) continue;
        // The rotation angle that annihilates a[p][q]. Written via theta and t
        // rather than atan2 so the smaller root is taken, which keeps the
        // rotation close to the identity and stops rounding accumulating.
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;

        for (let k = 0; k < n; k++) {
          const akp = a[k][p];
          const akq = a[k][q];
          a[k][p] = c * akp - s * akq;
          a[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p][k];
          const aqk = a[q][k];
          a[p][k] = c * apk - s * aqk;
          a[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = v[k][p];
          const vkq = v[k][q];
          v[k][p] = c * vkp - s * vkq;
          v[k][q] = s * vkp + c * vkq;
        }
      }
    }
  }

  const pairs = Array.from({ length: n }, (_, i) => ({ value: a[i][i], col: i }))
    .sort((x, y) => x.value - y.value);
  const values = pairs.map((p) => p.value);
  const vectors = zeros(n);
  pairs.forEach((p, k) => { for (let i = 0; i < n; i++) vectors[i][k] = v[i][p.col]; });
  return { values, vectors, sweeps };
}

/**
 * Cholesky factor L with B = L Lt, for symmetric positive definite B.
 *
 * Throws rather than returning NaN when B is not positive definite. In this
 * repository that condition is physical: B is built from the inverse-density
 * Fourier coefficients, and losing positive definiteness means the expansion
 * has been truncated so hard that the reconstructed medium has negative
 * density somewhere. A NaN band structure would look like a hard problem; the
 * message says which it is.
 */
export function cholesky(B: Matrix): Matrix {
  const n = B.length;
  const L = zeros(n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = B[i][j];
      for (let k = 0; k < j; k++) sum -= L[i][k] * L[j][k];
      if (i === j) {
        if (sum <= 0) {
          throw new Error(
            `matrix is not positive definite at row ${i} (pivot ${sum}) — the ` +
            `plane-wave truncation may have produced a negative effective density`,
          );
        }
        L[i][i] = Math.sqrt(sum);
      } else {
        L[i][j] = sum / L[j][j];
      }
    }
  }
  return L;
}

/** Solve L y = b in place for lower-triangular L. */
function forwardSolve(L: Matrix, b: number[]): number[] {
  const n = L.length;
  const y = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let s = b[i];
    for (let k = 0; k < i; k++) s -= L[i][k] * y[k];
    y[i] = s / L[i][i];
  }
  return y;
}

/**
 * The generalised symmetric eigenproblem A x = lambda B x, B positive definite.
 *
 * Reduced to standard form rather than solved directly: with B = L Lt the
 * problem becomes C y = lambda y for C = L^-1 A L^-t and y = Lt x, which is
 * still symmetric and so still Jacobi's. The reduction is the reason B must be
 * positive definite and the reason cholesky throws when it is not.
 *
 * C is explicitly symmetrised before diagonalising. It is symmetric in exact
 * arithmetic, and the halves differ by rounding after two triangular solves;
 * feeding a slightly asymmetric matrix to Jacobi does not fail loudly, it just
 * returns eigenvalues that are quietly a little wrong.
 */
export function generalizedSymmetricEigen(A: Matrix, B: Matrix): Eigen {
  const n = A.length;
  const L = cholesky(B);

  // Y = L^-1 A, column by column
  const Y = zeros(n);
  for (let c = 0; c < n; c++) {
    const col = forwardSolve(L, A.map((r) => r[c]));
    for (let i = 0; i < n; i++) Y[i][c] = col[i];
  }
  // C = L^-1 Y^t. Column c of C is L^-1 applied to column c of Y-transpose,
  // which is ROW c of Y — Y[c], not Y.map(r => r[c]).
  //
  // That distinction is the whole of a bug this file shipped with until a
  // cross-check caught it. Y = L^-1 A is not symmetric, so its rows and columns
  // differ; but whenever B is DIAGONAL, L is diagonal too, Y comes out
  // symmetric, and the two are identical. Both of the obvious sanity checks —
  // B = I, and a uniform medium whose B is a multiple of the identity — have
  // diagonal B, so neither could see it. It surfaced only against a problem
  // with genuine off-diagonal coupling, where it returned a spurious zero
  // eigenvalue. The symmetrisation below then made the result look plausible
  // rather than obviously broken, which is the part worth remembering.
  const C = zeros(n);
  for (let c = 0; c < n; c++) {
    const col = forwardSolve(L, Y[c]);
    for (let i = 0; i < n; i++) C[i][c] = col[i];
  }
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const m = (C[i][j] + C[j][i]) / 2;
      C[i][j] = m;
      C[j][i] = m;
    }
  }

  const reduced = symmetricEigen(C);

  // Back-transform. The reduction solves C y = lambda y for y = Lt x, so the
  // eigenvectors of the ORIGINAL problem are x = L-transpose-inverse y.
  // Returning y and calling it x would satisfy every eigenvalue test and fail
  // the only one that matters — that A x = lambda B x actually holds.
  const vectors = zeros(n);
  for (let k = 0; k < n; k++) {
    const y = reduced.vectors.map((r) => r[k]);
    const x = backSolveTranspose(L, y);
    let norm = 0;
    for (const v of x) norm += v * v;
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < n; i++) vectors[i][k] = x[i] / norm;
  }
  return { values: reduced.values, vectors, sweeps: reduced.sweeps };
}

/** Solve L-transpose x = y for lower-triangular L, by back substitution. */
function backSolveTranspose(L: Matrix, y: number[]): number[] {
  const n = L.length;
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i];
    for (let k = i + 1; k < n; k++) s -= L[k][i] * x[k];
    x[i] = s / L[i][i];
  }
  return x;
}
