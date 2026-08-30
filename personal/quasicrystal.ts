// personal/quasicrystal.ts — a five-dimensional structure you can hear.
//
// The crystallographic restriction theorem (src/neumann, tier 4) says a lattice
// may carry rotation axes of order 1, 2, 3, 4 and 6 and no others. FIVE-FOLD IS
// FORBIDDEN. Not rare — forbidden: no periodic arrangement of matter in any
// number of dimensions can have a 5-fold axis in three.
//
// What exists instead is a QUASICRYSTAL, and the way one is built is the reason
// this file is here. Take a periodic lattice in FIVE dimensions, where 5-fold
// symmetry is perfectly ordinary. Slice it along a plane oriented at an
// irrational angle to the lattice directions, keep the points that fall near
// that plane, and project them onto it. The result is aperiodic — it never
// repeats, at any scale — and yet entirely determined and perfectly ordered.
// Penrose tilings are exactly this: Z^5 cut and projected.
//
// So a five-dimensional structure is not a figure of speech. It is a lattice
// with five integer coordinates, and everything visible or audible is a shadow
// of it:
//
//   PHYSICAL SPACE   the 2D projection you see. Points here are Penrose
//                    vertices; their radius becomes pitch.
//   INTERNAL SPACE   the other 2D projection, the one the cut discards. Every
//                    point has a position here too, and turning THIS space
//                    moves the points on screen without altering a single
//                    frequency — the same structure, seen from a different
//                    angle in five dimensions.
//
// "Liquid crystal" is exact as well. A liquid crystal has orientational order
// without positional order: the parts agree on direction and not on spacing.
// A quasiperiodic tone field is the acoustic case — fixed interval
// relationships, no repeating period, so it never settles into a rhythm the ear
// can predict and stop hearing.
//
// Pure geometry. No audio, no DOM, no imports.

/** A point of the 5-dimensional lattice, with both its shadows. */
export interface QuasiPoint {
  /** The five integer coordinates. This is the point; the rest are views. */
  n: [number, number, number, number, number];
  /** Projection into physical space — what is drawn, and what sets pitch. */
  x: number;
  y: number;
  /** Projection into internal space — the coordinates the cut throws away. */
  u: number;
  v: number;
  /** Radius in physical space. */
  r: number;
}

const TAU = Math.PI * 2;

/**
 * The five projection directions, at 72° to each other.
 *
 * Physical space uses the fifth roots of unity; internal space uses their
 * SQUARES, which is what makes the two projections independent. Taking the same
 * angles for both would collapse the construction into a plain periodic lattice
 * — the irrationality that makes a quasicrystal quasi lives in the mismatch
 * between these two stars.
 */
export const PHYSICAL_STAR: Array<[number, number]> =
  [0, 1, 2, 3, 4].map((k) => [Math.cos((TAU * k) / 5), Math.sin((TAU * k) / 5)]);
export const INTERNAL_STAR: Array<[number, number]> =
  [0, 1, 2, 3, 4].map((k) => [Math.cos((2 * TAU * k) / 5), Math.sin((2 * TAU * k) / 5)]);

/** The golden ratio, which the spacings of any such set are built from. */
export const PHI = (1 + Math.sqrt(5)) / 2;

/**
 * Cut and project: every lattice point whose internal shadow lands inside the
 * window, projected into physical space.
 *
 * `depth` bounds each integer coordinate, so the search is over
 * (2*depth+1)^5 lattice points — 3125 at depth 2, 161051 at depth 5. `window`
 * is the acceptance radius in internal space and is the knob that sets density:
 * a wider window keeps more points and the set gets denser without ever
 * becoming periodic.
 *
 * Sorted by physical radius so callers can take the innermost N and get a
 * centred patch rather than a corner of one.
 */
export function cutAndProject(depth = 3, window = 1.6): QuasiPoint[] {
  const out: QuasiPoint[] = [];
  const n = [0, 0, 0, 0, 0];
  const walk = (i: number): void => {
    if (i === 5) {
      let u = 0;
      let v = 0;
      for (let k = 0; k < 5; k++) {
        u += n[k] * INTERNAL_STAR[k][0];
        v += n[k] * INTERNAL_STAR[k][1];
      }
      if (Math.hypot(u, v) > window) return;
      let x = 0;
      let y = 0;
      for (let k = 0; k < 5; k++) {
        x += n[k] * PHYSICAL_STAR[k][0];
        y += n[k] * PHYSICAL_STAR[k][1];
      }
      out.push({ n: [...n] as QuasiPoint["n"], x, y, u, v, r: Math.hypot(x, y) });
      return;
    }
    for (let d = -depth; d <= depth; d++) { n[i] = d; walk(i + 1); }
    n[i] = 0;
  };
  walk(0);
  out.sort((a, b) => a.r - b.r);
  return out;
}

/**
 * SHIFT the internal space, leaving physical space alone — a phason.
 *
 * This is the operation with no counterpart in three dimensions, and getting it
 * wrong is instructive. The obvious move is to ROTATE internal space, and it
 * does nothing at all: the window here is a disc about the origin, rotation
 * preserves distance from that origin, so not one point changes its acceptance.
 * A test caught it doing exactly nothing.
 *
 * The degree of freedom that actually moves a quasicrystal is a translation of
 * the cut through internal space, which in the physics is called a PHASON. It
 * costs no energy and rearranges the structure locally without disturbing its
 * long-range order — which is precisely the "liquid" half of liquid crystal:
 * the parts keep agreeing about orientation while giving up on position.
 *
 * Physical coordinates are untouched, so every point that survives a phason
 * keeps the pitch it already had. The field reorganises; the chord does not
 * transpose.
 */
export function phason(
  points: readonly QuasiPoint[], du: number, dv: number,
): QuasiPoint[] {
  return points.map((p) => ({ ...p, u: p.u + du, v: p.v + dv }));
}

/**
 * Rotate internal space. Kept, and documented as what it is: a no-op for a
 * circular window, and meaningful only if the window is given a shape with
 * corners — a pentagon, which is what yields strict Penrose tilings rather than
 * the generalised set this file builds.
 */
export function rotateInternal(points: readonly QuasiPoint[], radians: number): QuasiPoint[] {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  return points.map((p) => ({ ...p, u: p.u * c - p.v * s, v: p.u * s + p.v * c }));
}

/** Which points survive a given window after the internal space has turned. */
export function accepted(points: readonly QuasiPoint[], window: number): QuasiPoint[] {
  return points.filter((p) => Math.hypot(p.u, p.v) <= window);
}

/**
 * The cyclic shift of the five coordinates.
 *
 * Advancing every index by one rotates PHYSICAL space by 72° and internal space
 * by 144°, because the two stars are the roots of unity and their squares. It is
 * the 5-fold symmetry of the whole construction expressed as an integer
 * operation, and it is what a test can check exactly rather than statistically.
 */
export function cycle(p: QuasiPoint): [number, number, number, number, number] {
  return [p.n[4], p.n[0], p.n[1], p.n[2], p.n[3]];
}

/**
 * Map a point set onto frequencies, logarithmically by physical radius.
 *
 * Log rather than linear because hearing is: equal ratios sound like equal
 * steps, so a linear map would pile forty of sixty voices into the top octave
 * and leave the bottom four bare. Radius outward means the structure grows
 * upward in pitch, and the innermost point is the lowest — so the field can be
 * read from the middle out, on screen and in the ear at once.
 */
export function frequencies(
  points: readonly QuasiPoint[], loHz = 40, hiHz = 8000,
): number[] {
  if (points.length === 0) return [];
  const rMax = Math.max(...points.map((p) => p.r), 1e-9);
  const span = Math.log(hiHz / loHz);
  return points.map((p) => loHz * Math.exp(span * (p.r / rMax)));
}

/** Successive differences of a sorted list. */
export function spacings(values: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < values.length; i++) out.push(values[i] - values[i - 1]);
  return out;
}

/**
 * Distance from each point to its nearest neighbour.
 *
 * This is where the order shows, and it is worth being precise about where it
 * does NOT. A one-dimensional cut-and-project — the Fibonacci chain — has
 * exactly two gap lengths in the golden ratio, and it is tempting to expect the
 * same of the RADII here. It is not true and a test said so: the radial
 * distribution of a two-dimensional point set has as many distinct gaps as it
 * has points, because radius is not the quantity the construction orders.
 *
 * What the construction orders is local geometry. Nearest-neighbour distances
 * take a handful of values — the edge lengths of the tiling — out of a
 * continuum of possibilities, and that is the signature that separates an
 * ordered aperiodic set from a random one.
 */
export function nearestNeighbours(points: readonly QuasiPoint[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < points.length; i++) {
    let best = Infinity;
    for (let j = 0; j < points.length; j++) {
      if (i === j) continue;
      const d = Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y);
      if (d > 1e-9 && d < best) best = d;
    }
    if (Number.isFinite(best)) out.push(best);
  }
  return out;
}
