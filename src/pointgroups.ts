// pointgroups.ts — the 32 crystallographic point groups, as an acoustofluidic
// substrate selector.
//
// This file is a port, and the thing worth knowing about the port is that
// almost nothing had to change. It began as the symmetry table behind a
// visualiser for something else entirely, and the reason it transfers without
// strain is that crystallographic point groups are not a metaphor here — they
// are the actual, standard classification that decides whether a material can
// be a SAW substrate at all.
//
// The chain is short and exact:
//
//   · There are 32 point groups. 11 are centrosymmetric (they contain the
//     inversion operation), so 21 are not.
//   · Neumann's principle: any physical property tensor must be invariant
//     under every symmetry operation of the point group. A rank-3 tensor —
//     which is what piezoelectricity is — is odd under inversion, so in a
//     centrosymmetric group every component must equal its own negative, and
//     the whole tensor vanishes.
//   · Therefore piezoelectricity requires non-centrosymmetry. 20 of the 21
//     qualify; 432 is the exception, where the remaining symmetry operations
//     cancel the tensor anyway.
//   · No piezoelectricity, no interdigital transducer, no surface acoustic
//     wave. The substrate question is a symmetry question.
//
// Everything below is derivable from the `inversion` and `hm` columns; it is
// spelled out as named predicates because a lab tool should say `piezoelectric`
// rather than make the reader re-derive Neumann's principle at the call site.

export type CrystalSystem =
  | "triclinic" | "monoclinic" | "orthorhombic"
  | "tetragonal" | "trigonal" | "hexagonal" | "cubic";

export interface PointGroup {
  /** Hermann–Mauguin symbol — the crystallographer's name. */
  hm: string;
  /** Schoenflies symbol. */
  schoenflies: string;
  system: CrystalSystem;
  /** Number of symmetry operations. */
  order: number;
  /** Highest PROPER rotation axis. Note this is not always the digit in the
   *  symbol: -4 has a 4-fold rotoinversion but only a 2-fold proper rotation. */
  axis: 1 | 2 | 3 | 4 | 6;
  /** Contains the inversion operation. The single most consequential column
   *  in this table: it gates piezoelectricity, SHG, and electro-optic sampling. */
  inversion: boolean;
  /** Number of mirror planes. */
  mirrors: number;
}

/** The 32, in the standard crystallographic sequence. */
export const POINT_GROUPS: readonly PointGroup[] = ([
  ["1",     "C1",  "triclinic",    1,  1, false, 0],
  ["-1",    "Ci",  "triclinic",    2,  1, true,  0],
  ["2",     "C2",  "monoclinic",   2,  2, false, 0],
  ["m",     "Cs",  "monoclinic",   2,  1, false, 1],
  ["2/m",   "C2h", "monoclinic",   4,  2, true,  1],
  ["222",   "D2",  "orthorhombic", 4,  2, false, 0],
  ["mm2",   "C2v", "orthorhombic", 4,  2, false, 2],
  ["mmm",   "D2h", "orthorhombic", 8,  2, true,  3],
  ["4",     "C4",  "tetragonal",   4,  4, false, 0],
  ["-4",    "S4",  "tetragonal",   4,  2, false, 0],
  ["4/m",   "C4h", "tetragonal",   8,  4, true,  1],
  ["422",   "D4",  "tetragonal",   8,  4, false, 0],
  ["4mm",   "C4v", "tetragonal",   8,  4, false, 4],
  ["-42m",  "D2d", "tetragonal",   8,  2, false, 2],
  ["4/mmm", "D4h", "tetragonal",  16,  4, true,  5],
  ["3",     "C3",  "trigonal",     3,  3, false, 0],
  ["-3",    "S6",  "trigonal",     6,  3, true,  0],
  ["32",    "D3",  "trigonal",     6,  3, false, 0],
  ["3m",    "C3v", "trigonal",     6,  3, false, 3],
  ["-3m",   "D3d", "trigonal",    12,  3, true,  3],
  ["6",     "C6",  "hexagonal",    6,  6, false, 0],
  ["-6",    "C3h", "hexagonal",    6,  3, false, 1],
  ["6/m",   "C6h", "hexagonal",   12,  6, true,  1],
  ["622",   "D6",  "hexagonal",   12,  6, false, 0],
  ["6mm",   "C6v", "hexagonal",   12,  6, false, 6],
  ["-6m2",  "D3h", "hexagonal",   12,  3, false, 4],
  ["6/mmm", "D6h", "hexagonal",   24,  6, true,  7],
  ["23",    "T",   "cubic",       12,  3, false, 0],
  ["m-3",   "Th",  "cubic",       24,  3, true,  3],
  ["432",   "O",   "cubic",       24,  4, false, 0],
  ["-43m",  "Td",  "cubic",       24,  3, false, 6],
  ["m-3m",  "Oh",  "cubic",       48,  4, true,  9],
] as const).map(([hm, schoenflies, system, order, axis, inversion, mirrors]) => ({
  hm, schoenflies, system: system as CrystalSystem, order,
  axis: axis as PointGroup["axis"], inversion, mirrors,
}));

const BY_HM = new Map(POINT_GROUPS.map((g) => [g.hm, g]));

export function pointGroup(hm: string): PointGroup {
  const g = BY_HM.get(hm);
  if (!g) throw new Error(`no point group ${hm}`);
  return g;
}

// ---------------------------------------------------------------------------
// Neumann's principle, as predicates
// ---------------------------------------------------------------------------

/**
 * The one group that is non-centrosymmetric and still not piezoelectric.
 *
 * 432 (O) keeps only proper rotations, and its four 3-fold axes plus three
 * 4-fold axes between them force every independent component of the rank-3
 * piezoelectric tensor to zero. It is the standard exception and the reason
 * "non-centrosymmetric" and "piezoelectric" are 21 and 20 rather than the same
 * number — a tool that conflates them will offer a substrate that cannot work.
 */
export const NON_PIEZO_ACENTRIC = "432";

/** Piezoelectric: a rank-3 tensor survives. 20 groups. */
export function isPiezoelectric(g: PointGroup): boolean {
  return !g.inversion && g.hm !== NON_PIEZO_ACENTRIC;
}

/**
 * Polar (pyroelectric / ferroelectric candidate): the group leaves at least one
 * direction invariant, so a spontaneous polarisation vector can exist. 10 groups.
 *
 * These are the poling-capable ones — the reason a PZT or PMN-PT ceramic can be
 * given a permanent axis at all.
 */
const POLAR = new Set(["1", "2", "m", "mm2", "3", "3m", "4", "4mm", "6", "6mm"]);
export function isPolar(g: PointGroup): boolean {
  return POLAR.has(g.hm);
}

/**
 * Enantiomorphic (chiral): the group contains ONLY proper rotations. 11 groups.
 * These come in left- and right-handed forms and can show optical activity —
 * quartz being the canonical example.
 *
 * Enumerated rather than derived, and that is not laziness. The obvious
 * derivation — no inversion centre and no mirror plane — gives TWELVE, because
 * it admits -4 (S4). S4 = {E, S4, C2, S4^3} has no mirror and no inversion, yet
 * its 4-fold rotoinversion is an improper operation, so the group is achiral.
 * The `inversion` and `mirrors` columns simply do not record rotoinversions,
 * and any predicate built from those two alone will be wrong by exactly this
 * one group. A test pins the count and pins the trap.
 */
const ENANTIOMORPHIC = new Set([
  "1", "2", "222", "4", "422", "3", "32", "6", "622", "23", "432",
]);
export function isEnantiomorphic(g: PointGroup): boolean {
  return ENANTIOMORPHIC.has(g.hm);
}

/**
 * Second-harmonic generation and linear electro-optic sampling both need a
 * non-vanishing rank-3 susceptibility, so both need non-centrosymmetry: 21
 * groups.
 *
 * 432 is a genuine edge case rather than a clean member. Its piezoelectric
 * tensor vanishes outright, and its chi-2 components survive in general but
 * cancel under Kleinman symmetry — which holds in the far-from-resonance regime
 * most THz work operates in. Treated as allowed here and flagged, because the
 * honest answer is "check this one against your actual configuration".
 */
export function allowsSHG(g: PointGroup): boolean {
  return !g.inversion;
}
export function isSHGEdgeCase(g: PointGroup): boolean {
  return g.hm === NON_PIEZO_ACENTRIC;
}

// ---------------------------------------------------------------------------
// Substrates
// ---------------------------------------------------------------------------

export interface Substrate {
  name: string;
  formula: string;
  /** Hermann–Mauguin symbol of its point group. */
  hm: string;
  /** What it is actually used for in acoustofluidics. */
  note: string;
}

/**
 * The substrates an acoustofluidic device is actually built on.
 *
 * Deliberately carries no electromechanical coupling coefficients, phase
 * velocities or temperature coefficients. Those are all CUT-DEPENDENT — a
 * 128° Y-cut X-propagating lithium niobate and a Z-cut of the same crystal are
 * different devices — and a number copied into a table without its cut is worse
 * than no number, because it will be trusted. Symmetry is the part that is
 * exact and portable; the coefficients belong in a lookup keyed by cut, sourced
 * from measurement.
 */
export const SUBSTRATES: readonly Substrate[] = [
  { name: "Lithium niobate", formula: "LiNbO3", hm: "3m",
    note: "The SAW workhorse. Strong coupling; 128 deg Y-cut X-prop is the usual Rayleigh-wave choice for SSAW cell manipulation." },
  { name: "Lithium tantalate", formula: "LiTaO3", hm: "3m",
    note: "Lower coupling than LiNbO3, better temperature stability; 36 deg Y-cut is used for leaky-SAW devices." },
  { name: "Quartz", formula: "SiO2 (alpha)", hm: "32",
    note: "Weak coupling but near-zero temperature coefficient at ST-cut. Enantiomorphic, hence optically active." },
  { name: "Zinc oxide", formula: "ZnO", hm: "6mm",
    note: "Deposited as a thin film on silicon; makes a piezoelectric layer on a non-piezoelectric wafer." },
  { name: "Aluminium nitride", formula: "AlN", hm: "6mm",
    note: "CMOS-compatible, the standard FBAR/BAW-resonator film. Lower coupling than ZnO, far better power handling." },
  { name: "PZT", formula: "Pb(Zr,Ti)O3", hm: "4mm",
    note: "Poled ceramic. Its true symmetry is the Curie group inf-mm, NOT a crystallographic point group; 4mm is the closest crystallographic stand-in and the table should be read as an approximation here." },
];

/** Every substrate in the table must actually be able to work. */
export function substrateIsViable(s: Substrate): boolean {
  return isPiezoelectric(pointGroup(s.hm));
}
