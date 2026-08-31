// game/shape.ts — what a group looks like from above.
//
// A cell's ability should not be a stat block hung off its name. It should have
// the SHAPE of the group it is, and that shape is computable: src/symmetry.ts
// closes each point group from its generators into the actual set of orthogonal
// 3x3 operations, so the directions a group distinguishes are just the orbit of
// a vector under those operations.
//
// THE SETTING DOES THE WORK. symmetry.ts puts the unique axis on z throughout.
// The game is seen from above, looking down that axis — so the principal
// rotation of every group acts IN THE PLANE OF THE SCREEN, and the orbit of a
// horizontal vector is exactly the set of directions the player sees. A 6-fold
// cell throws six lobes because its group has six of them. A 222 throws two,
// because applying its three perpendicular 2-folds to a horizontal vector gives
// back two directions and no more. Nobody chose those numbers.
//
// The cubic groups are the interesting case and they come out right for free:
// 23 cycles x to y to z, and the operation that sends a horizontal vector onto
// the vertical axis projects to nothing in a top view. So it contributes no
// direction, and 23 shows four rather than six. That is not a special case in
// the code — it is what projecting a 3-D orbit onto a plane does.

import { type Mat3, operations } from "../src/symmetry.js";

/** A unit direction in the plane of the screen. */
export type Dir = readonly [number, number];

/** Two directions closer than this are the same one. */
const TOL = 1e-6;

function apply(m: Mat3, v: readonly [number, number, number]): [number, number, number] {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ];
}

/**
 * The distinct in-plane directions a point group has.
 *
 * The orbit of x-hat under every operation of the group, projected onto the
 * screen plane, deduplicated, and sorted by angle so the lobes come out in
 * drawing order. Operations that carry the seed onto the view axis project to
 * nothing and drop out, which is the honest thing for a top-down picture to do.
 *
 * Improper operations are kept. A mirror or an inversion is still a direction
 * the crystal distinguishes, and every group the game can build is
 * enantiomorphic anyway — there are no improper operations in any of them.
 */
export function inPlaneOrbit(hm: string): Dir[] {
  const out: Dir[] = [];
  for (const m of operations(hm)) {
    const [x, y] = apply(m, [1, 0, 0]);
    const r = Math.hypot(x, y);
    if (r < 1e-9) continue;
    const d: Dir = [x / r, y / r];
    if (!out.some((e) => Math.abs(e[0] - d[0]) < TOL && Math.abs(e[1] - d[1]) < TOL)) {
      out.push(d);
    }
  }
  out.sort((a, b) => Math.atan2(a[1], a[0]) - Math.atan2(b[1], b[0]));
  return out;
}

const CACHE = new Map<string, Dir[]>();

/** Cached, because it is asked for every frame a cell is drawn. */
export function lobes(hm: string): Dir[] {
  let hit = CACHE.get(hm);
  if (!hit) { hit = inPlaneOrbit(hm); CACHE.set(hm, hit); }
  return hit;
}

/** How many directions the group shows from above. The cell's fan-out. */
export function lobeCount(hm: string): number {
  return lobes(hm).length;
}

/**
 * The lobe directions, turned so that the first points along `heading`.
 *
 * A polar cell has a direction — that is what polar means — so the player aims
 * it. A cell with one lobe is a lance you point; a cell with six is a burst
 * that barely needs aiming. Both are the same call.
 */
export function orientedLobes(hm: string, heading: number): Dir[] {
  const base = lobes(hm);
  if (base.length === 0) return [];
  const turn = heading - Math.atan2(base[0][1], base[0][0]);
  const c = Math.cos(turn), s = Math.sin(turn);
  return base.map(([x, y]) => [x * c - y * s, x * s + y * c] as Dir);
}
