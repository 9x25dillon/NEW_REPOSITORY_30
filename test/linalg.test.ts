import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  asymmetry, cholesky, generalizedSymmetricEigen, identity, symmetricEigen, zeros,
} from "../src/linalg.ts";

const near = (a: number, b: number, eps: number, what = "") =>
  assert.ok(Math.abs(a - b) < eps, `${what} ${a} !~ ${b} (d=${Math.abs(a - b)})`);

test("Jacobi finds the eigenvalues of matrices with known spectra", () => {
  assert.deepEqual(symmetricEigen([[3, 0, 0], [0, 1, 0], [0, 0, 2]]).values, [1, 2, 3]);
  // [[2,1],[1,2]] has eigenvalues 1 and 3 exactly
  const two = symmetricEigen([[2, 1], [1, 2]]).values;
  near(two[0], 1, 1e-12);
  near(two[1], 3, 1e-12);
  // a tridiagonal with eigenvalues 3 and 3 +/- sqrt(3)
  const tri = symmetricEigen([[4, 1, 0], [1, 3, 1], [0, 1, 2]]).values;
  near(tri[0], 3 - Math.sqrt(3), 1e-12);
  near(tri[1], 3, 1e-12);
  near(tri[2], 3 + Math.sqrt(3), 1e-12);
});

test("eigenvectors are orthonormal and actually satisfy A x = lambda x", () => {
  const A = [[6, 2, 1], [2, 5, 1], [1, 1, 4]];
  const { values, vectors } = symmetricEigen(A);
  for (let k = 0; k < 3; k++) {
    for (let i = 0; i < 3; i++) {
      let ax = 0;
      for (let j = 0; j < 3; j++) ax += A[i][j] * vectors[j][k];
      near(ax, values[k] * vectors[i][k], 1e-10, `row ${i} of eigenvector ${k}`);
    }
  }
  for (let p = 0; p < 3; p++) {
    for (let q = 0; q < 3; q++) {
      let dot = 0;
      for (let i = 0; i < 3; i++) dot += vectors[i][p] * vectors[i][q];
      near(dot, p === q ? 1 : 0, 1e-10, `orthonormality ${p},${q}`);
    }
  }
});

test("Cholesky reproduces its input, and refuses a matrix that is not definite", () => {
  const B = [[4, 2, 1], [2, 5, 3], [1, 3, 6]];
  const L = cholesky(B);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      let s = 0;
      for (let k = 0; k < 3; k++) s += L[i][k] * L[j][k];
      near(s, B[i][j], 1e-12, `L Lt at ${i},${j}`);
    }
  }
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) assert.equal(L[i][j], 0);
  // indefinite input is a physical condition here, not a numerical one
  assert.throws(() => cholesky([[1, 2], [2, 1]]), /not positive definite/);
});

// ── The regression test for a bug two obvious checks could not see ──────────

test("the generalised solver is correct for NON-DIAGONAL B", () => {
  // A = [[4,1],[1,3]], B = [[2,1],[1,2]] gives 3L^2 - 12L + 11 = 0, so the
  // eigenvalues are 2 +/- sqrt(3)/3 exactly.
  //
  // This case exists because the Cholesky reduction had a transposed index that
  // is INVISIBLE whenever B is diagonal: L is then diagonal too, L^-1 A comes
  // out symmetric, and its rows and columns coincide. Both natural sanity
  // checks — B = I, and a uniform medium — have diagonal B and passed happily
  // while the solver was wrong. Only off-diagonal coupling shows it.
  const A = [[4, 1], [1, 3]];
  const B = [[2, 1], [1, 2]];
  const { values } = generalizedSymmetricEigen(A, B);
  near(values[0], 2 - Math.sqrt(3) / 3, 1e-12);
  near(values[1], 2 + Math.sqrt(3) / 3, 1e-12);
});

test("generalised eigenvectors satisfy A x = lambda B x, not the reduced problem", () => {
  // The stronger form of the check above: the reduction solves C y = lambda y
  // for y = Lt x, so returning y unchanged would pass every eigenvalue test and
  // fail this one. Non-diagonal B throughout, deliberately.
  const A = [[6, 2, 1], [2, 5, 1], [1, 1, 4]];
  const B = [[3, 1, 0], [1, 4, 1], [0, 1, 2]];
  const { values, vectors } = generalizedSymmetricEigen(A, B);
  for (let k = 0; k < 3; k++) {
    for (let i = 0; i < 3; i++) {
      let ax = 0;
      let bx = 0;
      for (let j = 0; j < 3; j++) {
        ax += A[i][j] * vectors[j][k];
        bx += B[i][j] * vectors[j][k];
      }
      near(ax, values[k] * bx, 1e-9, `row ${i}, mode ${k}`);
    }
  }
});

test("B = I reduces to the standard problem", () => {
  const A = [[4, 1, 0], [1, 3, 1], [0, 1, 2]];
  const std = symmetricEigen(A).values;
  const gen = generalizedSymmetricEigen(A, identity(3)).values;
  for (let i = 0; i < 3; i++) near(gen[i], std[i], 1e-12, `mode ${i}`);
});

test("asymmetry measures what it says, on a matrix that has some", () => {
  assert.equal(asymmetry([[1, 2], [2, 1]]), 0);
  near(asymmetry([[1, 2], [2.5, 1]]), 0.5, 1e-15);
  assert.equal(asymmetry(identity(4)), 0);
  assert.equal(zeros(2, 3).length, 2);
  assert.equal(zeros(2, 3)[0].length, 3);
});
