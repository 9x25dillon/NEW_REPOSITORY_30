// symmetry.ts — the 32 point groups as matrices, generated rather than listed.
//
// pointgroups.ts knows the NAMES and the census. This file knows the actual
// orthogonal 3x3 operations, because Neumann's principle needs matrices: a
// property tensor must be invariant under every symmetry operation of the
// crystal, and "every operation" cannot be checked against a symbol.
//
// Each group is given by two or three generators and closed by repeated
// multiplication. That is the whole design decision, and it is what makes this
// file trustworthy: a group listed by hand can be silently short an element and
// nothing downstream would notice — it would simply impose too few constraints
// and report too many independent tensor components. A group CLOSED from
// generators cannot be short, and its final size is checked against the order
// already tabulated in pointgroups.ts. Two independently written facts that
// have to agree, thirty-two times.
//
// SETTING. The unique axis is z throughout, including for monoclinic, where the
// crystallographic convention is more often unique axis b. This matters less
// than it looks: the NUMBER of independent tensor components is a property of
// the group and is identical in any setting, so every count this repo reports
// is setting-independent. Which specific components are non-zero is NOT — a
// pattern printed here will be a relabelling of the one in a textbook using
// unique axis b. Compare counts across settings; compare patterns only within.

const S3 = Math.sqrt(3) / 2;

/** A 3x3 matrix, row-major. */
export type Mat3 = readonly [
  readonly [number, number, number],
  readonly [number, number, number],
  readonly [number, number, number],
];

export function multiply(a: Mat3, b: Mat3): Mat3 {
  const out: number[][] = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      let s = 0;
      for (let k = 0; k < 3; k++) s += a[i][k] * b[k][j];
      out[i][j] = s;
    }
  }
  return out as unknown as Mat3;
}

export function trace(m: Mat3): number {
  return m[0][0] + m[1][1] + m[2][2];
}

export function determinant(m: Mat3): number {
  return (
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
  );
}

/** True for a proper rotation (det +1), false for an improper one (det -1). */
export function isProper(m: Mat3): boolean {
  return determinant(m) > 0;
}

// The elementary operations. Named for what they do rather than for their
// Schoenflies symbols, so a reader can check them by eye.
const E: Mat3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const INVERSION: Mat3 = [[-1, 0, 0], [0, -1, 0], [0, 0, -1]];
const C2Z: Mat3 = [[-1, 0, 0], [0, -1, 0], [0, 0, 1]];
const C2X: Mat3 = [[1, 0, 0], [0, -1, 0], [0, 0, -1]];
const C4Z: Mat3 = [[0, -1, 0], [1, 0, 0], [0, 0, 1]];
const C3Z: Mat3 = [[-0.5, -S3, 0], [S3, -0.5, 0], [0, 0, 1]];
const C6Z: Mat3 = [[0.5, -S3, 0], [S3, 0.5, 0], [0, 0, 1]];
/** Mirror in the plane z = 0 (the "horizontal" mirror). */
const MZ: Mat3 = [[1, 0, 0], [0, 1, 0], [0, 0, -1]];
/** Mirror in the plane x = 0 — contains z, so it is a "vertical" mirror. */
const MX: Mat3 = [[-1, 0, 0], [0, 1, 0], [0, 0, 1]];
/** 4-fold rotoinversion about z: a quarter turn followed by the z flip. */
const S4Z: Mat3 = multiply(MZ, C4Z);
/** 3-fold rotation about the [111] body diagonal — the operation that makes a
 *  group cubic, cycling x to y to z. */
const C3_111: Mat3 = [[0, 0, 1], [1, 0, 0], [0, 1, 0]];

/** Generators for each of the 32, keyed by Hermann-Mauguin symbol. */
export const GENERATORS: Readonly<Record<string, readonly Mat3[]>> = {
  "1": [E],
  "-1": [INVERSION],
  "2": [C2Z],
  "m": [MZ],
  "2/m": [C2Z, INVERSION],
  "222": [C2Z, C2X],
  "mm2": [C2Z, MX],
  "mmm": [C2Z, C2X, INVERSION],
  "4": [C4Z],
  "-4": [S4Z],
  "4/m": [C4Z, INVERSION],
  "422": [C4Z, C2X],
  "4mm": [C4Z, MX],
  "-42m": [S4Z, C2X],
  "4/mmm": [C4Z, C2X, INVERSION],
  "3": [C3Z],
  "-3": [C3Z, INVERSION],
  "32": [C3Z, C2X],
  "3m": [C3Z, MX],
  "-3m": [C3Z, C2X, INVERSION],
  "6": [C6Z],
  "-6": [C3Z, MZ],
  "6/m": [C6Z, INVERSION],
  "622": [C6Z, C2X],
  "6mm": [C6Z, MX],
  "-6m2": [C3Z, MZ, C2X],
  "6/mmm": [C6Z, C2X, INVERSION],
  "23": [C2Z, C3_111],
  "m-3": [C2Z, C3_111, INVERSION],
  "432": [C4Z, C3_111],
  "-43m": [S4Z, C3_111],
  "m-3m": [C4Z, C3_111, INVERSION],
};

/** Rounded signature for deduplication. The 3-fold matrices carry sqrt(3)/2,
 *  so products accumulate float noise and exact comparison would let the same
 *  operation into the group twice — inflating the order and, worse, silently
 *  reweighting the projector that averages over it. */
function key(m: Mat3): string {
  return m.map((r) => r.map((v) => (Math.abs(v) < 1e-12 ? 0 : v).toFixed(9)).join(",")).join(";");
}

/**
 * Close a set of generators into the full group.
 *
 * Straightforward orbit closure: multiply every pair, keep what is new, repeat.
 * The cap is a guard against a mistyped generator that fails to close — an
 * operation of irrational order would otherwise spin forever building an
 * infinite group, and the failure would look like a hang rather than a typo.
 */
export function closeGroup(generators: readonly Mat3[], cap = 200): Mat3[] {
  const seen = new Map<string, Mat3>();
  const add = (m: Mat3) => { const k = key(m); if (!seen.has(k)) seen.set(k, m); };
  add(E);
  for (const g of generators) add(g);

  let grew = true;
  while (grew) {
    grew = false;
    const current = [...seen.values()];
    for (const a of current) {
      for (const b of current) {
        const k = key(multiply(a, b));
        if (!seen.has(k)) {
          seen.set(k, multiply(a, b));
          grew = true;
          if (seen.size > cap) {
            throw new Error(`group did not close within ${cap} elements — check the generators`);
          }
        }
      }
    }
  }
  return [...seen.values()];
}

const CACHE = new Map<string, Mat3[]>();

/** Every symmetry operation of a point group. */
export function operations(hm: string): Mat3[] {
  const hit = CACHE.get(hm);
  if (hit) return hit;
  const gens = GENERATORS[hm];
  if (!gens) throw new Error(`no generators for point group ${hm}`);
  const ops = closeGroup(gens);
  CACHE.set(hm, ops);
  return ops;
}
