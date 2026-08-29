// neumann.ts — which tensor components a crystal is allowed to have.
//
// Neumann's principle: every physical property tensor of a crystal must be
// invariant under every symmetry operation of its point group. That single
// sentence decides whether a substrate can be driven at all, and it is worth
// computing rather than looking up — a hand-copied table of tensor patterns has
// hundreds of cells, no way to check itself, and one transposed entry sends a
// designer to a coefficient that does not exist.
//
// So this file computes it TWICE, by methods with nothing in common, and the
// test suite asserts the two agree for all 32 groups and all three tensors.
//
//   1. CHARACTER THEORY, which gives the count exactly and with no tolerance.
//      The dimension of the invariant subspace is the average of the
//      representation's character over the group. For the full rank-n tensor
//      space the character at R is tr(R)^n; the symmetrised subspaces the
//      physics actually lives in have the characters built below. This is
//      integer arithmetic dressed in floating point — the answers come out
//      within 1e-9 of whole numbers and are rounded.
//
//   2. AN EXPLICIT PROJECTOR, which gives the pattern. Averaging the
//      representation matrices over the group projects onto the invariant
//      subspace; composing with the intrinsic index symmetries lands on the
//      space of physically admissible tensors. Its trace must equal (1) and its
//      non-zero rows are the components that survive.
//
// Getting the same integer from a trace of averaged characters and from the
// rank of an averaged matrix is not a formality. Method 1 is blind to which
// components survive and method 2 is vulnerable to a mis-built representation;
// an error in either shows up as a disagreement rather than as a plausible
// table.
//
// SETTING: unique axis z — see symmetry.ts. Counts are setting-independent,
// patterns are not.

import { type Mat3, multiply, operations, trace } from "./symmetry.ts";

export type TensorKind = "permittivity" | "piezoelectric" | "elastic";

/** Rank of each property tensor. */
export const RANK: Readonly<Record<TensorKind, number>> = {
  permittivity: 2,  // eps_ij, symmetric
  piezoelectric: 3, // d_ijk, symmetric in the last two
  elastic: 4,       // c_ijkl, with the full Voigt symmetries
};

/**
 * Collapse negative zero.
 *
 * The character sum for a centrosymmetric group cancels to something like
 * -1.8e-16, and Math.round of a small negative is -0. That is a real defect in
 * a function returning a CARDINALITY: a count of components has no sign, and
 * while -0 === 0 is true, Object.is(-0, 0) is false — so it compares equal in a
 * loose check and unequal in a strict one, passes as a Map key of its own, and
 * prints as "-0". Caught by a strict assertion after a loose ad-hoc check had
 * already declared the same numbers correct.
 */
function normalizeZero(n: number): number {
  return n === 0 ? 0 : n;
}

// ---------------------------------------------------------------------------
// 1 · Character theory — the count
// ---------------------------------------------------------------------------

/** Character of Sym^2(V) at R: (tr(R)^2 + tr(R^2)) / 2. */
function symSquareChar(r: Mat3): number {
  const t = trace(r);
  return (t * t + trace(multiply(r, r))) / 2;
}

/**
 * The number of independent components a tensor may have in a point group.
 *
 * Exact. The averaged character of a representation over a finite group is the
 * multiplicity of the trivial representation in it, which is precisely the
 * dimension of the invariant subspace — so this is a theorem evaluated, not a
 * measurement taken, and it needs no tolerance beyond rounding away the
 * accumulated sqrt(3)/2 noise.
 */
export function independentComponents(hm: string, kind: TensorKind): number {
  const ops = operations(hm);
  let sum = 0;
  for (const r of ops) {
    const chi = trace(r);
    const sym2 = symSquareChar(r);
    if (kind === "permittivity") {
      sum += sym2;
    } else if (kind === "piezoelectric") {
      // V (x) Sym^2(V): one free index times a symmetric pair
      sum += chi * sym2;
    } else {
      // Sym^2(Sym^2(V)): c_ijkl = c_jikl = c_ijlk = c_klij
      const w = sym2;
      const wOfSquare = symSquareChar(multiply(r, r));
      sum += (w * w + wOfSquare) / 2;
    }
  }
  const dim = sum / ops.length;
  const rounded = Math.round(dim);
  if (Math.abs(dim - rounded) > 1e-9) {
    throw new Error(`${hm}/${kind}: character average ${dim} is not an integer`);
  }
  return normalizeZero(rounded);
}

// ---------------------------------------------------------------------------
// 2 · The projector — the pattern
// ---------------------------------------------------------------------------

/** Index permutations a tensor of each kind is intrinsically symmetric under. */
function intrinsicPermutations(rank: number): number[][] {
  if (rank === 2) return [[0, 1], [1, 0]];
  // d_ijk = d_ikj — the last two indices come from a symmetric strain
  if (rank === 3) return [[0, 1, 2], [0, 2, 1]];
  // c_ijkl: i<->j, k<->l, and (ij)<->(kl)
  return [
    [0, 1, 2, 3], [1, 0, 2, 3], [0, 1, 3, 2], [1, 0, 3, 2],
    [2, 3, 0, 1], [3, 2, 0, 1], [2, 3, 1, 0], [3, 2, 1, 0],
  ];
}

const decode = (index: number, rank: number): number[] => {
  const out: number[] = [];
  let x = index;
  for (let k = rank - 1; k >= 0; k--) {
    out[k] = x % 3;
    x = Math.floor(x / 3);
  }
  return out;
};

const encode = (idx: readonly number[]): number => idx.reduce((a, v) => a * 3 + v, 0);

/**
 * The projector onto physically admissible invariant tensors, as a dense
 * matrix over the full 3^rank component space.
 *
 * P averages the representation over the group; S averages over the intrinsic
 * index symmetries. They commute — a simultaneous rotation of every index does
 * not care in which order the indices are named — so the product is itself a
 * projector, onto exactly the intersection of the two subspaces.
 */
export function projector(hm: string, kind: TensorKind): number[][] {
  const rank = RANK[kind];
  const n = 3 ** rank;
  const ops = operations(hm);

  // P = average of R (x) R (x) ... over the group
  const P: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (const r of ops) {
    for (let I = 0; I < n; I++) {
      const ii = decode(I, rank);
      for (let J = 0; J < n; J++) {
        const jj = decode(J, rank);
        let prod = 1;
        for (let k = 0; k < rank; k++) prod *= r[ii[k]][jj[k]];
        P[I][J] += prod / ops.length;
      }
    }
  }

  // S = average over the intrinsic index permutations
  const perms = intrinsicPermutations(rank);
  const S: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let I = 0; I < n; I++) {
    const ii = decode(I, rank);
    for (const p of perms) {
      S[I][encode(p.map((slot) => ii[slot]))] += 1 / perms.length;
    }
  }

  // PS
  const out: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < n; k++) {
      const v = P[i][k];
      if (v === 0) continue;
      for (let j = 0; j < n; j++) out[i][j] += v * S[k][j];
    }
  }
  return out;
}

/** Trace of the projector — the dimension of the admissible space, computed
 *  the long way round as a cross-check on independentComponents. */
export function projectorRank(hm: string, kind: TensorKind, tol = 1e-9): number {
  const P = projector(hm, kind);
  let t = 0;
  for (let i = 0; i < P.length; i++) t += P[i][i];
  const rounded = Math.round(t);
  if (Math.abs(t - rounded) > 1e-6) {
    throw new Error(`${hm}/${kind}: projector trace ${t} is not an integer`);
  }
  void tol;
  return normalizeZero(rounded);
}

// ---------------------------------------------------------------------------
// Voigt labels
// ---------------------------------------------------------------------------

/** Voigt index for a pair: 11->1, 22->2, 33->3, 23->4, 13->5, 12->6. */
export function voigt(i: number, j: number): number {
  if (i === j) return i + 1;
  const s = i + j;
  if (s === 3) return 4; // 1,2 (zero-based) = yz
  if (s === 2) return 5; // 0,2 = xz
  return 6;              // 0,1 = xy
}

/**
 * Which components can be non-zero, as Voigt labels.
 *
 * A component survives when its row of the projector is not identically zero:
 * the projector's image is the admissible space, so a component that no
 * admissible tensor can reach has nothing in its row.
 *
 * NOTE ON THE VOIGT FACTOR OF TWO. The engineering convention writes
 * d_i4 = 2 d_i23 for the shear columns, and the same trap exists in the elastic
 * compliances. Everything here is computed on FULL tensor components and only
 * labelled in Voigt, so the factor never enters — which is safe for a zero/
 * non-zero pattern, and is exactly why this function reports a pattern and not
 * a magnitude.
 */
export function nonZeroComponents(hm: string, kind: TensorKind, tol = 1e-9): string[] {
  const rank = RANK[kind];
  const P = projector(hm, kind);
  const n = P.length;
  const labels = new Set<string>();

  for (let I = 0; I < n; I++) {
    let alive = false;
    for (let J = 0; J < n; J++) {
      if (Math.abs(P[I][J]) > tol) { alive = true; break; }
    }
    if (!alive) continue;
    const ii = decode(I, rank);
    if (kind === "permittivity") {
      const a = Math.min(ii[0], ii[1]) + 1;
      const b = Math.max(ii[0], ii[1]) + 1;
      labels.add(`e${a}${b}`);
    } else if (kind === "piezoelectric") {
      labels.add(`d${ii[0] + 1}${voigt(ii[1], ii[2])}`);
    } else {
      const a = voigt(ii[0], ii[1]);
      const b = voigt(ii[2], ii[3]);
      labels.add(`c${Math.min(a, b)}${Math.max(a, b)}`);
    }
  }
  return [...labels].sort();
}

// ---------------------------------------------------------------------------
// The design question
// ---------------------------------------------------------------------------

export interface TensorReport {
  hm: string;
  kind: TensorKind;
  /** Independent components — from character theory. */
  independent: number;
  /** Voigt labels that may be non-zero — from the projector. */
  nonZero: string[];
}

export function tensorReport(hm: string, kind: TensorKind): TensorReport {
  return {
    hm, kind,
    independent: independentComponents(hm, kind),
    nonZero: nonZeroComponents(hm, kind),
  };
}

/**
 * What a substrate can actually be driven with.
 *
 * This is the point of the whole file. pointgroups.isPiezoelectric answers yes
 * or no; this answers WHICH — and the difference is the difference between
 * knowing lithium niobate works and knowing that its d15 shear coefficient is
 * the large one a Rayleigh-wave IDT is built to exploit. A designer choosing a
 * cut needs the second answer.
 *
 * Returns an empty list for the 11 centrosymmetric groups and for 432, which is
 * the arithmetic re-deriving, from characters, the census fact that 20 of the
 * 21 non-centrosymmetric groups are piezoelectric.
 */
export function drivableCoefficients(hm: string): string[] {
  return nonZeroComponents(hm, "piezoelectric");
}
