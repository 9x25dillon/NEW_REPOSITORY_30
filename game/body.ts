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
// AND IT HAS A NAME — BUT NOT THE ONE IT WAS CLAIMING. src/sohncke.ts has known
// the 65 space groups a chiral world permits since before this game existed. A
// body's point group is the most symmetric cell in it, exactly as a sovereign's
// is, and on a primitive lattice a point group names a space group. What was
// missing is that a point group has to leave the LATTICE where it was, and a
// six-fold axis does not map a square net onto itself. So a body of 622 cells
// was being called P622 — a hexagonal space group, on a lattice that cannot
// hold one, drawn on the surface as if it were an answer. `seatedGroup` is the
// correction and P222 is the name; see it for what the square net keeps.
//
// The lattice pitch is the spacing this water's bound field needs, so building a
// properly-made body and freeing the trapped field stop being two problems. They
// were only ever two problems because the placements were freehand.

import { type Structure } from "./world.js";
import { SKELETON } from "./bound.js";
import { cellFor } from "./lattice.js";
import { type Dir, lobes } from "./shape.js";
import { type Wave, axisX } from "./wave.js";
import { type Particle } from "../src/gorkov.js";
import { maxSweepSpeed } from "../src/trajectory.js";
import { viscosity } from "./thermal.js";
import { pointGroup } from "../src/pointgroups.js";
import { type Mat3, operations } from "../src/symmetry.js";
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

// ── what the lattice will carry ─────────────────────────────────────────────

/**
 * Does this operation of a point group map the TRAP LATTICE onto itself?
 *
 * A crystal's point group is not whatever you would like it to be. It is the
 * subgroup of the motif's symmetry that also leaves the lattice where it was —
 * that is what makes a lattice-plus-motif a crystal rather than two claims
 * side by side. So the question has an answer, and `src/symmetry.ts` has been
 * holding the matrices to compute it since before the game existed.
 *
 * THE LATTICE IS SQUARE AND IT COULD NOT BE ANYTHING ELSE. `wave.ts` crosses
 * two orthogonal SSAWs, which gives a separable potential U(x,y) = U_x(x) +
 * U_y(y), and a square grid of pressure nodes falls out of that. It is the
 * device, not a level layout: you cannot tilt it, and there is no third wave.
 *
 * So an operation survives on two counts. It must keep z to +-z and not trade a
 * layer for an in-plane step — the layers are the channel's harmonics and their
 * spacing is nothing like the in-plane pitch — and its in-plane block must send
 * both basis vectors onto lattice vectors, which for a square net means the
 * entries are whole numbers.
 */
function seats(m: Mat3): boolean {
  const whole = (v: number) => Math.abs(v - Math.round(v)) < 1e-9;
  if (Math.abs(Math.abs(m[2][2]) - 1) > 1e-9) return false;
  if (Math.abs(m[0][2]) > 1e-9 || Math.abs(m[1][2]) > 1e-9) return false;
  if (Math.abs(m[2][0]) > 1e-9 || Math.abs(m[2][1]) > 1e-9) return false;
  return whole(m[0][0]) && whole(m[0][1]) && whole(m[1][0]) && whole(m[1][1]);
}

/** The highest proper rotation about the view axis in a set of operations. */
function zOrder(ops: readonly Mat3[]): number {
  let best = 1;
  for (const m of ops) {
    if (m[2][2] < 0) continue;                 // a 2-fold lying IN the plane
    const ang = Math.abs(Math.atan2(m[1][0], m[0][0]));
    const n = ang < 1e-9 ? 1 : Math.round((Math.PI * 2) / ang);
    if (Number.isFinite(n) && n <= 6) best = Math.max(best, n);
  }
  return best;
}

const SEAT_CACHE = new Map<string, string>();

/**
 * The group a cell is SEATED as once it stands on the trap lattice.
 *
 * This is the crystallographic restriction theorem, which this repository
 * already knows in its other form — a five-fold motif joins nothing, ever — and
 * had never once applied to a BODY. A three- or six-fold axis does not map a
 * square net onto itself, so a 622 standing on this lattice is not a 622: the
 * operations that survive are the identity and three 2-folds, and the honest
 * name for what you built is 222.
 *
 * Every seated group is a subgroup of the square net's own chiral symmetry, so
 * the answer is always one of five — 1, 2, 222, 4, 422 — and each of those is a
 * primitive Sohncke group the library can name. What you FED it is unchanged
 * and still decides its mass; what the lattice lets it BE is this.
 *
 * The pay-off is a rule that is both true and the opposite of what a player
 * will assume. A 622 is the most symmetric thing you can build and seats as a
 * 222; a plain 4 keeps all four of its arms. Order is not the only axis of
 * worth any more, and nobody chose that — the lattice did.
 *
 * Setting: `symmetry.ts` puts the unique axis on z throughout, so a group that
 * seats onto a single in-plane 2-fold (a 32 does) is named "2" here, which is
 * that group in a different setting. Its header says at length why comparing
 * across settings is safe for counts and not for patterns; this is a count.
 */
export function seatedGroup(hm: string): string {
  let hit = SEAT_CACHE.get(hm);
  if (hit !== undefined) return hit;
  const kept = operations(hm).filter(seats);
  hit = kept.length >= 8 ? "422"
    : kept.length === 4 ? (zOrder(kept) === 4 ? "4" : "222")
    : kept.length >= 2 ? "2"
    : "1";
  SEAT_CACHE.set(hm, hit);
  return hit;
}

/**
 * The directions a body of this group can actually GROW along, and WALK along.
 *
 * `shape.lobes` answers for the cell's own symmetry, which is the right answer
 * for the one thing that does not touch the lattice: a building FIRES a
 * released field, and a released field is not standing on anything. Growth and
 * walking both put a cell on a SITE — `placeCell` snaps, and `walkBodies` steps
 * `Math.round(dir)` times the pitch, one lattice site at a time — so those two
 * are the lattice's business and this is what it will allow.
 *
 * It had that say already, silently and for the wrong reason. A chain toward a
 * 60-degree lobe has to zigzag, every corner of a zigzag is diagonally adjacent
 * to the cell two back, `joined` counts that as a neighbour, and so the tip
 * comes out with degree 2 and `computeLimbs` never sees it. Measured across all
 * eleven groups, the arms a body could actually grow were exactly the lobes
 * lying on the lattice's own directions — which is to say the seated group's —
 * in ten cases out of eleven. This says it on purpose instead, and the eleventh
 * (a 23, which was growing four arms where its seated 222 has two) now agrees.
 */
export function growable(hm: string): Dir[] {
  return lobes(seatedGroup(hm));
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
export function joined(a: Structure, b: Structure, pitch: number): boolean {
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  const dz = Math.abs(b.layer - a.layer);
  if (dz > 1) return false;

  // ACROSS, a step in any of the eight directions. UP, the same site and no
  // other: a leg is a column, so building one is a deliberate act — retune the
  // channel, place the cell directly under the one you mean to hang it from,
  // and retune back. Nothing about that can happen by accident.
  return dz === 0 ? d <= pitch * 1.5 : d <= pitch * 0.5;
}

export function bodiesOf(structures: readonly Structure[], pitch: number): Body[] {
  const left = new Set(structures);
  const out: Body[] = [];

  while (left.size > 0) {
    const seed = left.values().next().value as Structure;
    left.delete(seed);
    const cells = [seed];

    for (let i = 0; i < cells.length; i++) {
      for (const s of [...left]) {
        if (joined(cells[i], s, pitch)) { left.delete(s); cells.push(s); }
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

/**
 * A limb: a run of cells reaching out of the body along one of its own
 * directions.
 *
 * WHAT AN ORGANISM IS ALLOWED TO GROW is not a design decision. shape.lobes
 * gives the in-plane directions a point group actually distinguishes — the
 * orbit of a horizontal vector under its operations — and a chain running any
 * other way is not an appendage, it is a lump. A 222 has two directions to grow
 * in and a 622 has six, which is the same rule that decides where a building can
 * fire and how a king throws its arms, spent a third time.
 *
 * A LEG is a limb that changes plane. Nothing swims, so a body reaches another
 * height the way anything else does: by having something standing on it. That
 * is why it takes a retune to build one — you drive the channel to another
 * harmonic, place the cell, and drive back, and the limb is left spanning two
 * planes.
 */
export interface Limb {
  cells: Structure[];
  /** Where it points, as a unit vector in the plane. */
  dir: [number, number];
  /** How many cells long, not counting where it attaches. */
  length: number;
  /** True if it changes plane along its run. */
  leg: boolean;
  /** The layers it touches. */
  layers: number[];
}

/** How near a lobe direction a chain has to run to be an appendage. */
export const LIMB_ARC = 0.45;

/**
 * Memo, keyed on the body itself.
 *
 * `bodiesOf` builds new Body objects every time the set of structures changes,
 * so an entry here dies exactly when the answer it holds stops being true —
 * there is no invalidation to forget. Without it the surface recomputed this
 * TWICE PER BODY PER FRAME: at a 352-cell organism that is about two
 * milliseconds a frame spent re-deriving a shape that had not moved, and a
 * player reported the game lagging when the screen was full.
 */
const LIMB_MEMO = new WeakMap<Body, { pitch: number; limbs: Limb[] }>();

export function limbsOf(body: Body, pitch: number): Limb[] {
  const seen = LIMB_MEMO.get(body);
  if (seen && seen.pitch === pitch) return seen.limbs;
  const limbs = computeLimbs(body, pitch);
  LIMB_MEMO.set(body, { pitch, limbs });
  return limbs;
}

function computeLimbs(body: Body, pitch: number): Limb[] {
  const cells = body.cells;
  if (cells.length < 3) return [];

  // HOW MANY NEIGHBOURS EACH CELL HAS, without comparing every pair.
  //
  // `joined` reaches at most 1.5 pitches across, so a grid of that pitch puts
  // every possible neighbour in the nine squares around a cell. The all-pairs
  // sweep this replaces was written when a body was a dozen cells; a play
  // report came back with 306 in one organism, where it cost 3.9 ms and the
  // surface calls this twice a frame — 7.8 ms of a 16.7 ms budget to compute
  // limbs that a solid body does not have.
  const step = pitch * 1.5;
  const grid = new Map<number, Structure[]>();
  const key = (gx: number, gy: number) => (gx + 4096) * 8192 + (gy + 4096);
  for (const c of cells) {
    const k = key(Math.floor(c.x / step), Math.floor(c.y / step));
    const at = grid.get(k);
    if (at) at.push(c);
    else grid.set(k, [c]);
  }

  const degree = new Map<Structure, number>();
  for (const a of cells) {
    let n = 0;
    const gx = Math.floor(a.x / step), gy = Math.floor(a.y / step);
    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        const at = grid.get(key(gx + ox, gy + oy));
        if (!at) continue;
        for (const b of at) if (b !== a && joined(a, b, pitch)) n++;
      }
    }
    degree.set(a, n);
  }

  const dirs = growable(body.hm);
  const out: Limb[] = [];

  for (const tip of cells) {
    if ((degree.get(tip) ?? 0) !== 1) continue;

    // Walk inward while the chain stays a chain, and take ONE more cell as the
    // shoulder it hangs from. The shoulder belongs to the trunk, not the limb,
    // but the limb's direction and its span in z are both measured from it —
    // without it a single cell hanging off a body has no direction at all and
    // no way to be seen as a leg, which is exactly what a leg usually is.
    const run = [tip];
    let prev: Structure | null = null;
    let here = tip;
    let root: Structure | null = null;
    for (;;) {
      const next = cells.find((c) => c !== here && c !== prev && joined(here, c, pitch));
      if (!next) break;
      if ((degree.get(next) ?? 0) > 2) { root = next; break; }
      prev = here;
      here = next;
      run.push(here);
      if (run.length > cells.length) break;
    }

    const from = root ?? run[run.length - 1];
    const dx = tip.x - from.x;
    const dy = tip.y - from.y;
    const r = Math.hypot(dx, dy);

    // It must run along a direction this body's symmetry actually has. A chain
    // pointing anywhere else is a lump, not an appendage.
    let dir: [number, number] | null = null;
    if (r > 1e-12) {
      const th = Math.atan2(dy, dx);
      for (const [lx, ly] of dirs) {
        let d = Math.abs(Math.atan2(ly, lx) - th);
        while (d > Math.PI) d = Math.abs(d - Math.PI * 2);
        if (d < LIMB_ARC) { dir = [lx, ly]; break; }
      }
    }
    const layers = [...new Set([...run, from].map((c) => c.layer))].sort();
    const leg = layers.length > 1;
    if (!dir && !leg) continue;      // a purely vertical run IS a leg

    out.push({
      cells: run,
      dir: dir ?? [0, 0],
      length: run.length,
      leg,
      layers,
    });
  }

  return out.sort((a, b) => b.length - a.length);
}

/** Every plane this body can touch: the one it stands on, and any its legs
 *  reach. An organism with a leg on another plane can work there. */
export function reaches(body: Body, pitch: number): number[] {
  const out = new Set(body.cells.map((c) => c.layer));
  for (const l of limbsOf(body, pitch)) for (const z of l.layers) out.add(z);
  return [...out].sort();
}

/**
 * The body of one cell, as the water sees it: a silica frustule.
 *
 * What the drag acts on when the lattice is swept, which is a different
 * question from what its symmetry is.
 */
export function cellParticle(s: Structure): Particle {
  return { radius: s.reach * 0.5, ...SKELETON };
}

/** You do not sweep at the slipping point. Half of it is a walk. */
export const GAIT_MARGIN = 0.5;

/**
 * The aperture a SWEEP is driven through, in trap pitches.
 *
 * A sweep is not a grip. Gripping concentrates the drive into one trap and is
 * apodised hard to do it; sliding the lattice is a phase ramp across the whole
 * device, and there is no reason for it to be narrow. Computed at the hand's
 * own focus, a body could only walk while every cell of it sat inside a hundred
 * microns of the player — so leading one from in front, which is the only way
 * to lead anything, put its far end in dead field and froze it.
 *
 * Wide enough to walk an organism you are standing in front of, and still not
 * infinite: a sprawling thing several hundred microns across genuinely does
 * have an end the drive cannot reach, and that end is why it stays where it is.
 *
 * Widened again when the channel grew. At under four pitches a body could not
 * follow a player who was WALKING — the drive fell off faster than a person
 * moves, so it was left behind the instant you turned away, and a run that had
 * six hundred and twenty steps in it had three. Eight pitches follows to about
 * a millimetre and lags past that, which in a four-millimetre channel is a
 * companion rather than a piece of furniture.
 */
export const WALK_FOCUS = 8;

/**
 * How fast the whole body can be walked, m/s.
 *
 * A swept lattice carries a cell only while the trap can out-pull the drag on
 * it — past that "the cell falls out of its node and is left behind", which
 * trajectory.maxSweepSpeed has said since it was written and nothing has ever
 * asked. Sweeping is a device-wide act, but the drive is apodised, so a cell far
 * from your hand feels very little of it and can barely be dragged at all:
 *
 *     under your hand      7500 um/s        instant
 *     200 um out            168 um/s        a walk
 *     280 um out              4 um/s        a crawl
 *     380 um out                0           left behind
 *
 * THE SLOWEST CELL SETS THE PACE, because a body that leaves part of itself
 * behind is not walking, it is coming apart. So an organism only moves while
 * you are standing among it, and a big one is slower than a small one — not
 * because size was given a penalty, but because the far end of a big one is
 * always in weak field.
 */
export function walkSpeed(
  body: Body, wave: Wave,
): number {
  const focus = wave.pitch * WALK_FOCUS;
  let slowest = Infinity;
  for (const c of body.cells) {
    const dx = c.x - wave.aimX;
    const dy = c.y - wave.aimY;
    const amp = wave.amplitude * Math.exp(-(dx * dx + dy * dy) / (2 * focus * focus));
    if (amp <= 0) return 0;
    // AT THE WATER'S OWN VISCOSITY. `maxSweepSpeed` has taken this as a
    // parameter since it was written and had never once been given anything but
    // the 25 C default. A sweep speed is a force over a drag, so an organism in
    // hot water walks faster for nothing it did — which is the same bargain
    // every other body in the channel is now getting.
    const v = maxSweepSpeed(axisX(wave, amp), cellParticle(c), viscosity(wave.tC));
    if (v < slowest) slowest = v;
  }
  return Number.isFinite(slowest) ? slowest * GAIT_MARGIN : 0;
}

/**
 * Which way a body may step.
 *
 * Along the directions its own symmetry has, and no others. A 222 walks east
 * and west. Nothing walks diagonally unless its group says diagonals exist.
 *
 * THE SEATED DIRECTIONS, because a step lands on a SITE. `walkBodies` takes
 * `Math.round(dir)` and multiplies by the pitch — "one lattice site at a time"
 * — so a direction the square net does not have was never actually walked, it
 * was silently rounded onto one that it does. A 622 asked to follow along its
 * 60-degree lobe stepped 45; asked along its 120 it stepped due north. Both are
 * directions a 622 does not have, which is the exact thing this function exists
 * to refuse.
 *
 * So growth and walking are under the same rule for the same reason — both put
 * a cell on a site — and only FIRING is free of the lattice, because a released
 * field is not standing on anything. That is rule 5 with the lattice's half of
 * it filled in, and it gives the tetragonal cells the job they never had: a 4
 * or a 422 follows you in four directions where a 622, for all its order, seats
 * as a 222 and manages two.
 */
export function gaitDirection(body: Body, tx: number, ty: number): [number, number] | null {
  const dx = tx - body.x;
  const dy = ty - body.y;
  const r = Math.hypot(dx, dy);
  if (r < 1e-9) return null;

  let best: [number, number] | null = null;
  let bestDot = -Infinity;
  for (const [lx, ly] of growable(body.hm)) {
    const dot = (lx * dx + ly * dy) / r;
    if (dot > bestDot) { bestDot = dot; best = [lx, ly]; }
  }
  return bestDot > 0.2 ? best : null;
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
  // THE GROUP THE LATTICE WILL CARRY, not the one you fed it. A body of 622
  // cells on a square net was being called P622, which is a hexagonal space
  // group and cannot exist on this lattice — the standing rule here is that
  // everything drawn is already true, and that was drawn on the surface, in the
  // body panel and in the player's own report. It is P222, and `seatedGroup`
  // says why.
  const all = groupsOfPointGroup(seatedGroup(body.hm));
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
