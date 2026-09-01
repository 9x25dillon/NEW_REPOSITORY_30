// game/bound.ts — the other field, and why it cannot leave.
//
// You are a field. So is it. The difference is that it is INSIDE THE MATTER: a
// mode at one frequency, sitting in a world whose own lattice will not carry it
// anywhere. A wave that has no propagating solution at its frequency does not
// travel, does not radiate, and does not leave. It is not imprisoned by anybody.
// It is imprisoned by a dispersion relation.
//
// AND THAT IS WHY YOU BUILD. A trapped mode gets out along a WAVEGUIDE, and a
// waveguide in a periodic medium is a line of missing crystal with a BAND GAP
// on either side of it: the gap is what stops the mode leaking sideways into
// the bulk, so a channel only guides at frequencies the surrounding crystal
// forbids. src/bands.ts says it in one line of its own header — a leakage-free
// channel wall is made of a band gap at the drive frequency.
//
// So the objective is not to avoid anything. It is to build a crystal whose
// complete gap CONTAINS the bound frequency, and the two things you control are
// exactly the two things that decide it:
//
//     HOW MUCH you build   -> the filling fraction -> whether a gap exists at
//                             all, and how wide. Under about 0.45 of the area
//                             there is no complete gap in this contrast, at any
//                             spacing, and nothing you do will hold anything.
//
//     HOW FAR APART        -> the lattice constant -> WHERE the gap sits. It
//                             goes as 1/a: eighty microns puts it at 12 MHz and
//                             two hundred and sixty puts it at 3.8.
//
// Neither of those is a difficulty setting and neither was tuned. They are what
// bands.completeGap returns for the crystal your buildings happen to make, and
// the whole objective is one comparison against it.
//
// WHAT A BUILDING IS MADE OF. A complete two-dimensional gap needs about a
// tenfold impedance contrast against the water, and a protein lattice has 1.7 —
// so a crystallised cell alone could never hold anything. It is a TEMPLATE. A
// diatom grows a silica skeleton on an organic lattice, which is a thing
// organisms actually do, and silica against water is 10.6. The cell decides the
// symmetry; the skeleton it templates is what the wave sees.

import { type Structure } from "./world.js";
import { type Medium } from "../src/gorkov.js";
import { type Crystal2D, completeGap } from "../src/bands.js";

/** Silica on a chiral template, as a diatom builds it. */
export const SKELETON = { rho: 2650, c: 5960 };

/**
 * The skeleton's radius, as a multiple of the building's holding radius.
 *
 * The two are not the same thing and this one is what the WAVE sees: the
 * holding radius is where the structure's own trapping falls off, and the
 * frustule around it is the solid the sound has to get past. It also decides
 * what the objective can ask for, and that is worth being explicit about,
 * because a complete gap needs a filling fraction of about 0.45 and the fill of
 * a square array is pi r^2 / a^2 — so the widest spacing that still has a gap
 * is 2.64 r, and the LOWEST frequency any crystal you can build will hold is
 * the one at that spacing. Too small a skeleton and the bound mode of the first
 * water sits below everything reachable, and the level is impossible with no
 * way to see why.
 */
export const SKELETON_REACH = 1.15;

/** The largest fill the expansion is trustworthy at. Past this it refuses. */
export const MAX_FILL = 0.62;

/**
 * How finely the gap is resolved.
 *
 * A plane-wave expansion at order two over a coarse wedge, which costs about
 * sixty milliseconds — fine when a building is placed and hopeless every frame,
 * so it is computed only when what you have built has actually changed. Order
 * three is four times slower and moves the edges by under a per cent.
 */
export const GAP_ORDER = 2;
export const GAP_SAMPLES = 4;

export interface Bound {
  /** The frequency it is stuck at, rad/s. */
  omega: number;
  x: number;
  y: number;
  /** True once a crystal you built has caught it. */
  free: boolean;
  /** Seconds it has been inside a live gap — it does not leave instantly. */
  held: number;
}

/** How long the gap has to hold it before it can leave, s. */
export const RELEASE_TIME = 3.0;

/**
 * The frequency a given world's own lattice traps things at.
 *
 * Its Bragg condition: the wave whose half wavelength is the world's trap
 * pitch, which is precisely the wave that world's own periodicity reflects
 * rather than carries. It is not a number anybody chose per level — it falls
 * out of the pitch and the sound speed, both of which are the last king's body,
 * so every aeon strands its field somewhere else.
 */
export function boundFrequency(pitch: number, medium: Medium): number {
  return (2 * Math.PI * medium.c) / (2 * pitch);
}

export function newBound(pitch: number, medium: Medium, x: number, y: number): Bound {
  return { omega: boundFrequency(pitch, medium), x, y, free: false, held: 0 };
}

/**
 * The crystal your buildings make.
 *
 * The lattice constant is their mean nearest-neighbour spacing, because that is
 * what a periodic array of them HAS, and the filling fraction is the area their
 * skeletons take out of one cell of that lattice. Fewer than two buildings is
 * not a crystal and has no dispersion relation to ask about.
 */
export function crystalOf(
  structures: readonly Structure[], medium: Medium,
): Crystal2D | null {
  if (structures.length < 2) return null;

  let total = 0;
  let radius = 0;
  for (const s of structures) {
    let nearest = Infinity;
    for (const t of structures) {
      if (t === s) continue;
      const d = Math.hypot(t.x - s.x, t.y - s.y);
      if (d < nearest) nearest = d;
    }
    total += nearest;
    radius += s.reach * SKELETON_REACH;
  }
  const a = total / structures.length;
  const r = radius / structures.length;
  if (!(a > 0)) return null;

  return {
    a,
    geometry: "circle",
    fill: Math.min(MAX_FILL, (Math.PI * r * r) / (a * a)),
    inclusion: SKELETON,
    matrix: medium,
  };
}

/**
 * The complete gap that crystal has, if it has one.
 *
 * bands.completeGap can REFUSE. A plane-wave expansion truncated at a finite
 * order stops being trustworthy when the filling fraction and the contrast are
 * both extreme — the effective density it reconstructs goes negative and the
 * Cholesky step throws rather than return a number nobody should believe. That
 * is the library being honest, and the game has to be able to take it: packing
 * buildings on top of each other is a thing a player will do in the first
 * minute, and it must read as "no gap here", not as a black screen.
 */
export function gapOf(crystal: Crystal2D | null): { lo: number; hi: number } | null {
  if (!crystal) return null;
  try {
    return completeGap(crystal, 1, GAP_ORDER, GAP_SAMPLES);
  } catch {
    return null;
  }
}

/** Does this gap catch that frequency? */
export function catches(gap: { lo: number; hi: number } | null, omega: number): boolean {
  return gap !== null && omega > gap.lo && omega < gap.hi;
}

/**
 * How wrong you are, as something a bar can show.
 *
 * Zero when the gap has it. Otherwise the fractional distance from the nearer
 * edge, so a player watching it while they build can see whether the last thing
 * they put down helped — which is the difference between a puzzle and a
 * guessing game.
 */
export function detune(gap: { lo: number; hi: number } | null, omega: number): number {
  if (!gap) return 1;
  if (omega > gap.lo && omega < gap.hi) return 0;
  const edge = omega <= gap.lo ? gap.lo : gap.hi;
  return Math.min(1, Math.abs(omega - edge) / omega);
}

/** Which way to go, in words, because a number alone teaches nothing. */
export function advice(
  crystal: Crystal2D | null, gap: { lo: number; hi: number } | null, omega: number,
): string {
  if (!crystal) return "BUILD. TWO IS NOT A CRYSTAL";
  if (!gap) {
    return crystal.fill < 0.45
      ? "NO GAP AT ALL - BUILD MORE, AND CLOSER TOGETHER"
      : "NO GAP AT ALL - THE SPACING IS TOO UNEVEN";
  }
  if (omega > gap.lo && omega < gap.hi) return "THE GAP HAS IT";
  return omega > gap.hi
    ? "THE GAP IS TOO LOW - BUILD TIGHTER"
    : "THE GAP IS TOO HIGH - SPREAD OUT";
}
