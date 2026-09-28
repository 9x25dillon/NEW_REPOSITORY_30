// game/plates.ts — the metal on the expedition chip, and the cross-phase it writes.
//
// The Resonant Expedition is played on the same etch as every other run, with
// one fabrication step more: strips of thin metal laid on the substrate under
// the channel. That is ordinary SAW practice — metal on a piezoelectric shorts
// the surface potential and slows the wave that runs beneath it, which is how
// delay lines are trimmed and how phase is steered — and here it is the map.
//
// WHY METAL MAKES A MAP. A standing wave is two counter-propagating waves, and
// its TEMPORAL phase is the mean of theirs. The one from the left has crossed
// the metal in [0, x]; the one from the right has crossed the metal in [x, W];
// between them they have crossed the whole row exactly once. So along any row
// the X pair's standing wave is late by
//
//     dx(y) = (pi / lambda) * SLOWING * (metal along row y)
//
// and uniformly so — while along any column the Y pair is late by the same
// expression in the metal down that column. Their difference is the local
// cross-phase (see wave.ts, "cross-phase"):
//
//     phi(x, y) = pi/2 + dx(y) - dy(x)
//
// A function of the row plus a function of the column is a TARTAN. That is the
// shape of this map, and it is not a style: nothing else can come out of strips.
//
// The same metal moves the SPATIAL phase too — the nodes kink where a strip
// begins — but that part is exactly what an IDT phase can take back, and the
// aim takes it back every frame. The temporal offset between two different
// pairs of transducers is the part no aiming touches. Only a trim does.
//
// AND IT CHANGES WITH THE WORLD. Phase per metre goes as 1/lambda, and the
// lambda is the world's pitch, so the same glass writes a different map into
// every water: a band that is a full diamond mesh at one pitch is half of one
// at the next. The metal is learnable. What it does this aeon has to be read.
//
// No DOM here, and nothing in src/ imports it.

import { QUADRATURE } from "./wave.js";

/**
 * Fractional slowing of a Rayleigh wave under metal, Delta v / v.
 *
 * DECLARED LITERATURE FIGURE for the substrate wave.ts drives, 128 deg Y-cut
 * X-propagating lithium niobate: shorting the surface slows the wave by half
 * the electromechanical coupling, K^2 / 2, and K^2 for that cut is about 5.4
 * per cent. It is the only number in this module that was not derived.
 */
export const METAL_SLOWING = 0.027;

/** One strip of metal, metres, channel coordinates. */
export interface Plate { x: number; y: number; w: number; h: number }

/**
 * What is laid on the expedition chip, as fractions of the channel.
 *
 * Two long row bands and three column bands. The pool you start in sits where
 * the rows and columns nearly cancel, so the opening is the game you know and
 * the metal is somewhere to go: the north band is a mesh in most waters, the
 * east column is a mesh the other way, and where they cross they undo each
 * other into a quadrature island a long way from home.
 */
const LAYOUT: ReadonlyArray<readonly [number, number, number, number]> = [
  [0.04, 0.10, 0.92, 0.10], // the north band, a row
  [0.50, 0.76, 0.46, 0.08], // the south-east shelf, a half row
  [0.80, 0.04, 0.08, 0.92], // the east column
  [0.10, 0.30, 0.06, 0.66], // the west column
  [0.30, 0.66, 0.04, 0.30], // the south-west reed, a thin column
];

export function plates(channelW: number, channelH: number): Plate[] {
  return LAYOUT.map(([x, y, w, h]) => ({
    x: x * channelW, y: y * channelH, w: w * channelW, h: h * channelH,
  }));
}

/** Metal a row crosses, m. */
export function rowMetal(ps: readonly Plate[], y: number): number {
  let m = 0;
  for (const p of ps) if (y >= p.y && y < p.y + p.h) m += p.w;
  return m;
}

/** Metal a column crosses, m. */
export function colMetal(ps: readonly Plate[], x: number): number {
  let m = 0;
  for (const p of ps) if (x >= p.x && x < p.x + p.w) m += p.h;
  return m;
}

/** The phase a length of metal costs one standing wave, rad. Half of what a
 *  single traveller loses crossing it, because the standing wave is the mean
 *  of two travellers and only one of them crossed any given strip. */
export function metalPhase(length: number, wavelength: number): number {
  return (Math.PI / wavelength) * METAL_SLOWING * length;
}

/**
 * The cross-phase the glass writes at a point, rad.
 *
 * EXACTLY QUADRATURE where rows and columns carry the same metal, including
 * wherever there is none — so the same function is safe to ask on bare glass.
 */
export function nativeCross(
  ps: readonly Plate[], x: number, y: number, wavelength: number,
): number {
  const d = rowMetal(ps, y) - colMetal(ps, x);
  return d === 0 ? QUADRATURE : QUADRATURE + metalPhase(d, wavelength);
}

/**
 * The tartan as rectangles of constant cross-phase, for drawing.
 *
 * Every strip edge is a place the phase can change and nowhere else is, so the
 * grid of edges is the whole map and it is exact. At five strips it is a few
 * dozen rectangles.
 */
export function tartan(
  ps: readonly Plate[], channelW: number, channelH: number, wavelength: number,
): Array<{ x: number; y: number; w: number; h: number; cross: number }> {
  const xs = [...new Set([0, channelW, ...ps.flatMap((p) => [p.x, p.x + p.w])])].sort((a, b) => a - b);
  const ys = [...new Set([0, channelH, ...ps.flatMap((p) => [p.y, p.y + p.h])])].sort((a, b) => a - b);
  const out: Array<{ x: number; y: number; w: number; h: number; cross: number }> = [];
  for (let j = 0; j + 1 < ys.length; j++) {
    for (let i = 0; i + 1 < xs.length; i++) {
      const x = xs[i], y = ys[j], w = xs[i + 1] - x, h = ys[j + 1] - y;
      out.push({ x, y, w, h, cross: nativeCross(ps, x + w / 2, y + h / 2, wavelength) });
    }
  }
  return out;
}
