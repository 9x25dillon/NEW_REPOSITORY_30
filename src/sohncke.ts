// sohncke.ts — the space groups a protein is allowed to crystallise in.
//
// Proteins are built from L-amino acids and are therefore CHIRAL, and a chiral
// molecule cannot sit in a symmetry operation that would turn it into its
// mirror image. So of the 230 space groups, a protein crystal is restricted to
// the 65 that contain only PROPER operations — rotations, screw axes and
// translations, and no mirrors, glides, inversions or rotoinversions. Those are
// the Sohncke groups.
//
// This is the same restriction-theorem machinery as neumann.ts, one floor up.
// pointgroups.isEnantiomorphic already returns the 11 chiral point groups —
// 1, 2, 222, 4, 422, 3, 32, 6, 622, 23, 432 — and those 11 are exactly the
// point groups of these 65, which a test asserts rather than assumes. The other
// 21 point groups are closed to protein crystallography entirely.
//
// WHY THIS IS USEFUL RATHER THAN MERELY TRUE. Screw axes and centred lattices
// extinguish specific reflections, so a diffraction pattern announces its own
// space group through the reflections that are MISSING. Systematic absences are
// how the group is assigned before any structure is solved, and they are
// computable from the symbol — which is what the second half of this file does.
//
// Setting: standard settings throughout, monoclinic unique axis b. Screw axes
// are recorded on the axis they act along in that setting; a different setting
// permutes which axial reflections go absent without changing the group.

import { isEnantiomorphic, pointGroup } from "./pointgroups.js";

export type Lattice = "P" | "C" | "I" | "F" | "R";

export interface Screw {
  /** The axis the screw runs along, in the standard setting. */
  dir: "a" | "b" | "c";
  /** Rotation order: 2, 3, 4 or 6. */
  order: 2 | 3 | 4 | 6;
  /** Translation numerator: n in n/order of a lattice repeat. */
  sub: number;
}

export interface SpaceGroup {
  /** International Tables number, 1..230. */
  number: number;
  /** Hermann-Mauguin symbol in the shorthand crystallographers type. */
  symbol: string;
  /** Its point group, always one of the 11 chiral ones. */
  pointGroup: string;
  lattice: Lattice;
  screws: Screw[];
  /** Symbol of the opposite hand, for the 11 enantiomorphic pairs. */
  enantiomorph?: string;
  /** Frequently seen in deposited protein structures. Qualitative on purpose —
   *  exact proportions move with every release and belong in a live query, not
   *  a constant. */
  common?: boolean;
}

const g = (
  number: number, symbol: string, pointGroup: string, lattice: Lattice,
  screws: Screw[] = [], enantiomorph?: string, common?: boolean,
): SpaceGroup => ({ number, symbol, pointGroup, lattice, screws, enantiomorph, common });

const S = (dir: Screw["dir"], order: Screw["order"], sub: number): Screw => ({ dir, order, sub });

/** The 65, in International Tables order. */
export const SOHNCKE_GROUPS: readonly SpaceGroup[] = [
  // triclinic · 1
  g(1, "P1", "1", "P", [], undefined, true),

  // monoclinic · 2 (unique axis b)
  g(3, "P2", "2", "P"),
  g(4, "P21", "2", "P", [S("b", 2, 1)], undefined, true),
  g(5, "C2", "2", "C", [], undefined, true),

  // orthorhombic · 222
  g(16, "P222", "222", "P"),
  g(17, "P2221", "222", "P", [S("c", 2, 1)]),
  g(18, "P21212", "222", "P", [S("a", 2, 1), S("b", 2, 1)], undefined, true),
  g(19, "P212121", "222", "P", [S("a", 2, 1), S("b", 2, 1), S("c", 2, 1)], undefined, true),
  g(20, "C2221", "222", "C", [S("c", 2, 1)], undefined, true),
  g(21, "C222", "222", "C"),
  g(22, "F222", "222", "F"),
  g(23, "I222", "222", "I"),
  g(24, "I212121", "222", "I", [S("a", 2, 1), S("b", 2, 1), S("c", 2, 1)]),

  // tetragonal · 4
  g(75, "P4", "4", "P"),
  g(76, "P41", "4", "P", [S("c", 4, 1)], "P43"),
  g(77, "P42", "4", "P", [S("c", 4, 2)]),
  g(78, "P43", "4", "P", [S("c", 4, 3)], "P41"),
  g(79, "I4", "4", "I"),
  g(80, "I41", "4", "I", [S("c", 4, 1)]),

  // tetragonal · 422
  g(89, "P422", "422", "P"),
  g(90, "P4212", "422", "P", [S("a", 2, 1), S("b", 2, 1)]),
  g(91, "P4122", "422", "P", [S("c", 4, 1)], "P4322"),
  g(92, "P41212", "422", "P", [S("c", 4, 1), S("a", 2, 1), S("b", 2, 1)], "P43212", true),
  g(93, "P4222", "422", "P", [S("c", 4, 2)]),
  g(94, "P42212", "422", "P", [S("c", 4, 2), S("a", 2, 1), S("b", 2, 1)]),
  g(95, "P4322", "422", "P", [S("c", 4, 3)], "P4122"),
  g(96, "P43212", "422", "P", [S("c", 4, 3), S("a", 2, 1), S("b", 2, 1)], "P41212", true),
  g(97, "I422", "422", "I"),
  g(98, "I4122", "422", "I", [S("c", 4, 1)]),

  // trigonal · 3
  g(143, "P3", "3", "P"),
  g(144, "P31", "3", "P", [S("c", 3, 1)], "P32"),
  g(145, "P32", "3", "P", [S("c", 3, 2)], "P31"),
  g(146, "R3", "3", "R"),

  // trigonal · 32
  g(149, "P312", "32", "P"),
  g(150, "P321", "32", "P"),
  g(151, "P3112", "32", "P", [S("c", 3, 1)], "P3212"),
  g(152, "P3121", "32", "P", [S("c", 3, 1)], "P3221", true),
  g(153, "P3212", "32", "P", [S("c", 3, 2)], "P3112"),
  g(154, "P3221", "32", "P", [S("c", 3, 2)], "P3121", true),
  g(155, "R32", "32", "R", [], undefined, true),

  // hexagonal · 6
  g(168, "P6", "6", "P"),
  g(169, "P61", "6", "P", [S("c", 6, 1)], "P65", true),
  g(170, "P65", "6", "P", [S("c", 6, 5)], "P61"),
  g(171, "P62", "6", "P", [S("c", 6, 2)], "P64"),
  g(172, "P64", "6", "P", [S("c", 6, 4)], "P62"),
  g(173, "P63", "6", "P", [S("c", 6, 3)]),

  // hexagonal · 622
  g(177, "P622", "622", "P"),
  g(178, "P6122", "622", "P", [S("c", 6, 1)], "P6522", true),
  g(179, "P6522", "622", "P", [S("c", 6, 5)], "P6122"),
  g(180, "P6222", "622", "P", [S("c", 6, 2)], "P6422"),
  g(181, "P6422", "622", "P", [S("c", 6, 4)], "P6222"),
  g(182, "P6322", "622", "P", [S("c", 6, 3)]),

  // cubic · 23
  g(195, "P23", "23", "P"),
  g(196, "F23", "23", "F"),
  g(197, "I23", "23", "I"),
  g(198, "P213", "23", "P", [S("a", 2, 1), S("b", 2, 1), S("c", 2, 1)]),
  g(199, "I213", "23", "I", [S("a", 2, 1), S("b", 2, 1), S("c", 2, 1)]),

  // cubic · 432
  g(207, "P432", "432", "P"),
  g(208, "P4232", "432", "P", [S("c", 4, 2)]),
  g(209, "F432", "432", "F"),
  g(210, "F4132", "432", "F", [S("c", 4, 1)]),
  g(211, "I432", "432", "I"),
  g(212, "P4332", "432", "P", [S("c", 4, 3)], "P4132"),
  g(213, "P4132", "432", "P", [S("c", 4, 1)], "P4332"),
  g(214, "I4132", "432", "I", [S("c", 4, 1)]),
];

const BY_SYMBOL = new Map(SOHNCKE_GROUPS.map((s) => [s.symbol, s]));

export function spaceGroup(symbol: string): SpaceGroup {
  const s = BY_SYMBOL.get(symbol);
  if (!s) throw new Error(`${symbol} is not a Sohncke group — a chiral molecule cannot crystallise in it`);
  return s;
}

/** Every Sohncke group with a given point group. */
export function groupsOfPointGroup(hm: string): SpaceGroup[] {
  return SOHNCKE_GROUPS.filter((s) => s.pointGroup === hm);
}

/** True when a chiral molecule could crystallise in this point group at all. */
export function allowsChiral(hm: string): boolean {
  return isEnantiomorphic(pointGroup(hm));
}

// ---------------------------------------------------------------------------
// Systematic absences
// ---------------------------------------------------------------------------

/**
 * Whether a reflection is allowed by the lattice centring.
 *
 * Centring is a translation, so it extinguishes whole classes of reflection at
 * once — every hkl, not just the axial ones. This is the first cut in assigning
 * a space group, and it is visible in a diffraction image before anything is
 * indexed carefully.
 */
export function latticeAllows(lattice: Lattice, h: number, k: number, l: number): boolean {
  switch (lattice) {
    case "P": return true;
    case "C": return (h + k) % 2 === 0;
    case "I": return (h + k + l) % 2 === 0;
    case "F": return (h % 2 === 0 && k % 2 === 0 && l % 2 === 0)
      || (Math.abs(h % 2) === 1 && Math.abs(k % 2) === 1 && Math.abs(l % 2) === 1);
    // obverse setting, the standard one
    case "R": return ((-h + k + l) % 3 + 3) % 3 === 0;
  }
}

/**
 * Whether a reflection survives the screw axes.
 *
 * A screw axis is a rotation with a translation along it, and it extinguishes
 * reflections on that axis alone: an n-sub-m screw along c kills 00l unless l is
 * a multiple of n/gcd(n,m). So a 2-1 screw halves the axial reflections, a 4-1
 * quarters them, and the surviving pattern along each axis names the screw.
 *
 * Only AXIAL reflections are affected — a screw along c says nothing about hk0.
 * Checking a general reflection against a screw would extinguish most of the
 * pattern and is the classic way to get this wrong.
 */
export function screwAllows(screws: readonly Screw[], h: number, k: number, l: number): boolean {
  for (const s of screws) {
    const onAxis = s.dir === "a" ? (k === 0 && l === 0)
      : s.dir === "b" ? (h === 0 && l === 0)
      : (h === 0 && k === 0);
    if (!onAxis) continue;
    const index = s.dir === "a" ? h : s.dir === "b" ? k : l;
    if (index === 0) continue;
    const period = s.order / gcd(s.order, s.sub);
    if (index % period !== 0) return false;
  }
  return true;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** Whether a reflection is present at all for a group. */
export function reflectionAllowed(
  group: SpaceGroup, h: number, k: number, l: number,
): boolean {
  return latticeAllows(group.lattice, h, k, l) && screwAllows(group.screws, h, k, l);
}

export interface Reflection { h: number; k: number; l: number; }

/**
 * Narrow the candidate space groups from a list of observed reflections.
 *
 * Given reflections you SAW, discard every group that forbids one of them. This
 * is the assignment as it is actually made at a beamline, and it is one-sided on
 * purpose: an observed reflection is hard evidence that a group is wrong, while
 * an unobserved one might merely be weak, mis-indexed, or outside the collected
 * resolution. So this rules groups out and never rules one in.
 */
export function candidates(observed: readonly Reflection[]): SpaceGroup[] {
  return SOHNCKE_GROUPS.filter((sg) =>
    observed.every((r) => reflectionAllowed(sg, r.h, r.k, r.l)));
}

/** The axial reflections a group keeps along one axis, up to `max`. */
export function axialPattern(
  group: SpaceGroup, dir: "a" | "b" | "c", max = 12,
): number[] {
  const out: number[] = [];
  for (let i = 1; i <= max; i++) {
    const [h, k, l] = dir === "a" ? [i, 0, 0] : dir === "b" ? [0, i, 0] : [0, 0, i];
    if (reflectionAllowed(group, h, k, l)) out.push(i);
  }
  return out;
}
