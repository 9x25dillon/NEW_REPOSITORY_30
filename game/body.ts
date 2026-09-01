// game/body.ts — when what you have built stops being a scatter and becomes one thing.
//
// A placed cell already worked on its own: it projects holding points along its
// own group's directions and things collect and merge at them whether or not you
// are there. That is autonomy in seed form and it has been in the game since the
// beginning. What was missing was CONNECTION. Structures went down wherever the
// player happened to be standing, so what you built was a heap of separate
// objects that happened to be near each other, and nothing could be said about
// it as a whole.
//
// SO THEY SIT ON A LATTICE. A crystal is a lattice plus a motif — that is the
// definition, not a metaphor — and the moment placements snap to one, the thing
// you are building IS a crystal and every question about it becomes answerable.
// Which cells are joined. How big it is. What symmetry it has. What its band
// structure does, which the bound field already depended on and which was
// previously at the mercy of how steady your hand was.
//
// AND IT HAS A NAME. src/sohncke.ts has known the 65 space groups a chiral
// world permits since before this game existed, and has never once been used by
// it. A body's point group is the most symmetric cell in it, exactly as a
// sovereign's is; on a primitive lattice that point group names a space group,
// and that is what you have made. P622 is not decoration — it is the answer to
// "what did I just build", in the vocabulary the rest of the repository already
// speaks.
//
// The lattice pitch is the spacing this water's bound field needs, so building a
// properly-made body and freeing the trapped field stop being two problems. They
// were only ever two problems because the placements were freehand.

import { type Structure } from "./world.js";
import { cellFor } from "./lattice.js";
import { pointGroup } from "../src/pointgroups.js";
import { type SpaceGroup, groupsOfPointGroup } from "../src/sohncke.js";

/** Where the lattice of a world is pinned. Arbitrary, and the same all game. */
export const ORIGIN = { x: 0, y: 0 };

/** How near a site a placement has to be to count as on it. */
export const SNAP_TOLERANCE = 0.34;

/**
 * The nearest site of the world's lattice.
 *
 * Placements snap here rather than landing where the player's body happened to
 * be. It is not a convenience: an organism is a lattice plus a motif, and
 * without the lattice there is no organism, only twenty-six things in a heap.
 */
export function snap(x: number, y: number, pitch: number): { x: number; y: number } {
  return {
    x: ORIGIN.x + Math.round((x - ORIGIN.x) / pitch) * pitch,
    y: ORIGIN.y + Math.round((y - ORIGIN.y) / pitch) * pitch,
  };
}

export interface Body {
  cells: Structure[];
  /** Its most symmetric cell, which is what the whole is limited by. */
  hm: string;
  /** Sum of the orders in it — how much body there is. */
  mass: number;
  /** Centre of the cells, m. */
  x: number;
  y: number;
  /** Furthest cell from that centre, m. */
  extent: number;
}

/**
 * Which of your buildings are joined into one thing.
 *
 * Two cells are joined when they sit on ADJACENT SITES — a lattice step apart,
 * orthogonally or diagonally, since a body that may only grow along the axes is
 * a plus sign and not an organism. Everything else is flood fill.
 */
export function bodiesOf(structures: readonly Structure[], pitch: number): Body[] {
  const left = new Set(structures);
  const out: Body[] = [];
  const near = pitch * 1.5;   // one step, orthogonal or diagonal, with slack

  while (left.size > 0) {
    const seed = left.values().next().value as Structure;
    left.delete(seed);
    const cells = [seed];

    for (let i = 0; i < cells.length; i++) {
      for (const s of [...left]) {
        const d = Math.hypot(s.x - cells[i].x, s.y - cells[i].y);
        if (d <= near) { left.delete(s); cells.push(s); }
      }
    }

    let hm = cells[0].hm;
    let mass = 0;
    let cx = 0;
    let cy = 0;
    for (const c of cells) {
      mass += cellFor(c.hm).structure;
      cx += c.x;
      cy += c.y;
      if (pointGroup(c.hm).order > pointGroup(hm).order) hm = c.hm;
    }
    cx /= cells.length;
    cy /= cells.length;

    let extent = 0;
    for (const c of cells) extent = Math.max(extent, Math.hypot(c.x - cx, c.y - cy));

    out.push({ cells, hm, mass, x: cx, y: cy, extent });
  }

  return out.sort((a, b) => b.mass - a.mass);
}

/** The largest thing you have made, or nothing. */
export function largest(bodies: readonly Body[]): Body | null {
  return bodies.length > 0 ? bodies[0] : null;
}

/**
 * What you have built, named.
 *
 * A lattice with that point group on it IS a space group, and of the 230 a
 * chiral world is restricted to 65 — the ones sohncke.ts holds. The primitive
 * setting is the one reported, because a body assembled by hand on a square
 * grid has no centring in it: it is P, and P is the honest answer.
 *
 * A single cell is not a crystal and gets no symbol. Neither is a pair.
 */
export function symbolOf(body: Body): SpaceGroup | null {
  if (body.cells.length < 3) return null;
  const all = groupsOfPointGroup(body.hm);
  if (all.length === 0) return null;
  return all.find((g) => g.lattice === "P" && g.screws.length === 0) ?? all[0];
}

/**
 * How many cells before it does anything without you.
 *
 * Every cell already gathers on its own; what a BODY adds is that they do it
 * together, and the threshold is where a hand-built thing stops being a few
 * traps in a row and starts being an organ. It is a game constant.
 */
export const AUTONOMY = 6;

export function autonomous(body: Body): boolean {
  return body.cells.length >= AUTONOMY;
}

/** How far its hold reaches beyond its own cells, m. An organism has a field
 *  around it, and a bigger one has more of it. */
export function aura(body: Body): number {
  return body.extent + Math.sqrt(body.mass) * 6e-6;
}
