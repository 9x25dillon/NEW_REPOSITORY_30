// game/world.ts — worlds, the things that rule them, and what is born from a body.
//
// The cycle this file exists for:
//
//   SETTLE   you gather motifs, crystallise cells, and PLACE them. A placed
//            cell is a structure and it stays. It projects holding points along
//            its own group's in-plane directions, so it gathers for you while
//            you are elsewhere. This is the part that persists.
//
//   CROWN    you carry cells to the throne and feed them. What you feed is what
//            the sovereign IS: its group is the highest you gave it, its size is
//            the sum of their orders, and its attack pattern is that group's
//            symmetry seen from above. Feeding it more makes a harder king AND
//            a richer world after it, which is the only real decision in the
//            game.
//
//   REIGN    it wakes, and it eats the world you built. Your structures are the
//            only thing that hurts it: charge one and it discharges along its
//            own lobes and is consumed. You take your world apart to kill the
//            thing you crowned out of it.
//
//   BIRTH    its body is the next world. The medium's sound speed and density,
//            the lattice pitch, which motifs are in the water and what lives in
//            it are all derived from the sovereign's group and what it was fed.
//            Nothing here is authored per-level; the next place is a function of
//            the last king.
//
// Pure. No DOM, no simulation state — just what a world IS and what a body
// becomes.

import { BEASTS } from "./beasts.js";
import { modeFor } from "./depth.js";
import { type Cell, cellFor, motif } from "./lattice.js";
import { YOU } from "./pilot.js";
import { type Dir, lobes } from "./shape.js";
import { type Medium, type Particle, contrastFactor } from "../src/gorkov.js";
import { pointGroup } from "../src/pointgroups.js";

// ── structures: the part that stays ─────────────────────────────────────────

export interface Structure {
  /** Which node plane it is built on. */
  layer: number;
  /**
   * Every plane this cell's whole body can work on.
   *
   * Its own, and any a LEG of the body it belongs to reaches. This is what an
   * appendage is for: an organism standing on one plane and hanging a limb onto
   * another gathers on both, which is the first thing in this game that a body
   * can do and a heap of separate buildings cannot.
   */
  serves: number[];
  id: number;
  /** The group of the cell that was placed. */
  hm: string;
  x: number;
  y: number;
  /** In-plane directions of its group. Holding points sit along these. */
  lobes: Dir[];
  /** How far out its holding points sit, m. */
  reach: number;
  /** Group order. Sets how hard it holds and how hard it hits. */
  strength: number;
  /** 0..1 while you drive it. At one it discharges and is gone. */
  charge: number;
  /** Survived from an earlier aeon: weaker, and already half taken. */
  ruin: boolean;
}

/** How far a structure's holding points sit from it, m. Higher-order groups
 *  reach further because they have more of the field to organise. */
export function reachOf(hm: string): number {
  return 34e-6 + pointGroup(hm).order * 2.2e-6;
}

export function structureFrom(
  id: number, hm: string, x: number, y: number, layer = 0,
): Structure {
  return {
    id, hm, x, y, layer, serves: [layer],
    lobes: lobes(hm),
    reach: reachOf(hm),
    strength: pointGroup(hm).order,
    charge: 0,
    ruin: false,
  };
}

/** The points a structure holds things at, in world metres. */
export function holdPoints(s: Structure): Array<[number, number]> {
  return s.lobes.map(([dx, dy]) => [s.x + dx * s.reach, s.y + dy * s.reach]);
}

// ── the sovereign ───────────────────────────────────────────────────────────

export interface Sovereign {
  /** Its group: the highest-order cell it was fed. */
  hm: string;
  /** Every cell fed to it, by group. */
  fed: string[];
  /** Sum of the orders it was fed. Its mass, and the next world's richness. */
  mass: number;
  /** Sum of independent piezoelectric components. How lively the next world is. */
  freedom: number;
  /** Fed a 432, which has no drivable component at all, so neither has it:
   *  it cannot be held in a trap and must be brought down another way. */
  anchored: boolean;
  hp: number;
  maxHp: number;
  x: number;
  y: number;
  awake: boolean;
  /** Seconds until its next volley. */
  beat: number;
  /** Its volleys turn, so the gaps between lobes move and cannot be camped. */
  spin: number;
}

/** Nothing has been fed yet. The throne is where it will wake. */
export function emptyThrone(x: number, y: number): Sovereign {
  return {
    hm: "", fed: [], mass: 0, freedom: 0, anchored: false,
    hp: 0, maxHp: 0, x, y, awake: false, beat: 2.4, spin: 0,
  };
}

/**
 * Feed a cell to the throne.
 *
 * The sovereign becomes the highest-order thing it has eaten — a king is the
 * most symmetric part of what it was made from — while its mass and freedom
 * accumulate from everything. Feeding a 432 makes it unholdable, because 432 is
 * the one group with no drivable coefficient at all: there is no handle on it,
 * which is exactly what it is worth.
 */
export function feed(s: Sovereign, c: Cell): void {
  s.fed.push(c.group.hm);
  s.mass += c.structure;
  s.freedom += c.freedom;
  if (c.ability === "anchor") s.anchored = true;
  if (s.hm === "" || c.structure > pointGroup(s.hm).order) s.hm = c.group.hm;
  // Balanced against the arsenal, not against a curve: what you can build in
  // one settle has to be able to bring down what you fed the throne, with
  // enough margin that the king eating two of your structures is a setback
  // rather than a lost run.
  s.maxHp = 30 + s.mass * 10;
  s.hp = s.maxHp;
}

/** Its volley, as directions. The pattern IS the group, turned by its spin. */
export function volley(s: Sovereign): Dir[] {
  if (s.hm === "") return [];
  const base = lobes(s.hm);
  const c = Math.cos(s.spin), sn = Math.sin(s.spin);
  return base.map(([x, y]) => [x * c - y * sn, x * sn + y * c] as Dir);
}

/** Seconds between volleys. A bigger king is slower but hits with more arms. */
export function cadence(s: Sovereign): number {
  return Math.max(1.15, 3.1 - s.mass * 0.045);
}

/**
 * The king is a body in the water like everything else.
 *
 * Denser and stiffer than any medium it can be born into, so its contrast is
 * positive and it answers to your NODES — which means your pull drags it onto
 * you and your push holds it off. Fighting it uses the same one handle as
 * everything else in the game, and push mode finally has a job during a boss.
 *
 * Unless it is ANCHORED. Feed the throne a 432 and the thing you crowned has no
 * drivable coefficient at all, exactly as the group does not, and the field
 * stops touching it. That is a decision you make two phases before you find out
 * what it cost.
 */
export function sovereignParticle(s: Sovereign): Particle {
  return { radius: 17e-6 + s.mass * 0.55e-6, rho: 1120, c: 1600 };
}

/** How much a king of this mass resists being moved. */
export function sovereignInertia(s: Sovereign): number {
  return 1 + s.mass / 6;
}

/** How fast it drags itself toward you, m/s. */
export function sovereignSpeed(s: Sovereign): number {
  return 2.4e-5 + s.freedom * 8e-7;
}

// ── worlds ──────────────────────────────────────────────────────────────────

export interface World {
  aeon: number;
  name: string;
  medium: Medium;
  /** Trap pitch, m. */
  pitch: number;
  /** Motif ids in the water here. */
  pool: string[];
  /** Which wildlife the medium carries. */
  wildlife: string[];
  /**
   * How much matter is suspended in it.
   *
   * THE NUMBER THAT DECIDED WHETHER THE GAME COULD BE PLAYED. At fourteen
   * motifs in an arena of six tenths of a square millimetre the nearest thing
   * you could bind with was consistently a hundred and thirty to two hundred
   * and thirty microns away — against a hand fifty-five microns across, which
   * carries one body at a time and only below the speed its trap can drag it.
   * Every merge was a fetch across three hand-widths. A policy that played
   * perfectly and could not be killed built one cell a minute; five runs in six
   * built NONE in four minutes.
   *
   *     14 motifs   first cell at 19-132 s      1-3 cells in three minutes
   *     24          first cell at  3- 40 s      5-14
   *     34          first cell at  2- 24 s     16-35
   *     48          first cell at  2- 13 s     58-71, which is soup
   *
   * It is a suspension. How much is in it is a property of the water, and it is
   * the first thing to reach for when the game feels like work.
   */
  density: number;
  /**
   * Seconds before anything in it starts hunting you.
   *
   * The first water gives you long enough to find out what gathering IS before
   * something that shares your contrast arrives in your lap. Every later world
   * is somebody's corpse and grants almost none.
   */
  calm: number;
  /**
   * Which harmonic the channel is driven at, and therefore HOW MANY PLANES
   * there are to stand on.
   *
   * Hard walls are pressure antinodes, so a resonance needs a whole number of
   * half wavelengths across the channel height, and mode n puts exactly n node
   * planes in the fluid. The third dimension of this game is that integer. The
   * first water is driven at its fundamental and is flat.
   */
  mode: number;
  /** Circulation, m/s. */
  current: number;
  /** How much of the previous world's building survived, 0..1. */
  inheritance: number;
}

const SYSTEM_NAME: Readonly<Record<string, string>> = {
  triclinic: "THE UNRULED WATER",
  monoclinic: "THE LEANING WATER",
  orthorhombic: "THE SQUARED WATER",
  tetragonal: "THE FOURFOLD WATER",
  trigonal: "THE THREEFOLD WATER",
  hexagonal: "THE SIXFOLD WATER",
  cubic: "THE CLOSED WATER",
};

/**
 * The least contrast a water may leave you with.
 *
 * A WATER YOU CANNOT SWIM IN IS NOT A LEVEL. The medium is derived from the
 * king, and the derivation can land on your own iso-acoustic point: fed a 1, a
 * 1 and a 2 it returns rho 940 and c 1410, where a body of your density has a
 * contrast factor of 0.0005 and the field moves you at one per cent of your
 * usual speed. Nothing in the fiction gets you out of that, and no amount of
 * grip helps, because grip multiplies a number that is already zero.
 *
 * So the density is walked away from that point until the water can carry you.
 * It is the ONE place a world is edited after it has been derived, it moves rho
 * by a few kilograms per cubic metre, and the alternative is a king that ends
 * the run by existing.
 */
const CARRY_FLOOR = 0.02;

function carriable(medium: Medium): Medium {
  if (Math.abs(contrastFactor(YOU, medium)) >= CARRY_FLOOR) return medium;
  for (let step = 2; step <= 90; step += 2) {
    for (const s of [1, -1]) {
      const trial = { rho: medium.rho + s * step, c: medium.c };
      if (trial.rho < 905 || trial.rho > 1045) continue;
      if (Math.abs(contrastFactor(YOU, trial)) >= CARRY_FLOOR) return trial;
    }
  }
  return medium;
}

/**
 * What lives in a given water, in the order it turns up.
 *
 * NOT A DIFFICULTY TABLE. A body only ever reaches you if it answers to the
 * lattice you are standing in: share your sign and your own drive reels it into
 * your lap, and the whole time you are gathering, it is closing. Take the
 * opposite sign and it is driven off your node onto the ring a quarter pitch
 * out and pinned there by any drive at all — it can be killed at leisure and it
 * cannot touch you. A water stocked entirely with the opposite sign is
 * therefore not an easy level, it is a level where nothing can happen.
 *
 * So the roster is sorted by that subtraction. The medium decides every sign in
 * it, and the medium is the last king's body — which means a king you crowned
 * can hand you a world where the thing that was safe all game is suddenly the
 * thing in your lap. Nobody writes that transition; it falls out of where the
 * new water sits relative to a body of your density.
 */
const HUNTERS = ["vesicle", "splitter", "husk"] as const;

export function wildlifeFor(medium: Medium, aeon: number, mass: number): string[] {
  const mine = contrastFactor(YOU, medium);
  const sameSign = (id: string) => contrastFactor(BEASTS[id].particle, medium) * mine > 0;

  const reaches = HUNTERS.filter(sameSign);
  const rings = HUNTERS.filter((id) => !sameSign(id));

  // Whatever can actually get to you, and more kinds of it as the aeons run on.
  const out: string[] = (reaches.length > 0 ? reaches : [...HUNTERS])
    .slice(0, 1 + Math.floor(aeon / 2));

  // Motes are under the streaming crossover, so no lattice holds them and the
  // sign question does not arise: they are in every water from the second on.
  if (aeon >= 2) out.push("mote");
  if (aeon >= 2 && rings.length > 0) out.push(rings[0]);
  if (aeon >= 3 && mass >= 10 && rings.length > 1) out.push(rings[1]);

  return [...new Set(out)];
}

/**
 * The first place, which nobody made.
 *
 * A DIMER AND A GIRDLE MAKE A 222 AND NOTHING ELSE. That was the whole opening,
 * and it meant the first aeon had no decision in it — you gathered whatever
 * drifted past, you got the one cell there was, and the only thing left to
 * choose was how many of them to feed the throne, which buys mass and very
 * little else. It is why the trade this game is built on could not be measured
 * at the first aeon: there was nothing to trade.
 *
 * So the water carries a DIAGONAL as well, and one axial still, because two
 * principal axes refuse to bind and a water full of mutually incompatible
 * matter is not richer — see poolFor. That single addition opens three cells
 * off one axis:
 *
 *     four dimers                 ->  2     order 2, and eight free components
 *     dimers with a girdle        ->  222   order 4
 *     dimers with a DIAGONAL      ->  23    order 12, cubic, and one free
 *
 * and it is a real choice because the two second parts are not alike. A girdle
 * is five and a half microns of lipid and sits in your antinodes; a diagonal is
 * 1.6 microns, which is barely over the streaming crossover, so the field can
 * hardly hold it and it has to be chased. The better cell is the one that is
 * harder to gather, and one of them in a cluster of four is enough.
 *
 * A cluster holding all three refuses, which is the trap and is legible: no
 * chiral group is generated by that.
 *
 * THREE DIMERS TO ONE GIRDLE TO ONE DIAGONAL, and the ratio was measured rather
 * than picked. Over ten seeds against the same bot, weighting it two to one to
 * one lands a third part in enough clusters to cost real time — seven crowns
 * and sixty-one cells against three to one to one's eight and seventy-four —
 * and it builds fewer of the hard cell for the trouble. Against the old
 * two-motif water this one builds the same number of cells, refuses LESS often
 * than it did, and turns eleven cubic cells in ten runs into thirty-three: an
 * even split between the easy cell and the good one, where it used to be five
 * to one.
 */
export function firstWorld(): World {
  const medium = { rho: 997, c: 1497 };
  return {
    aeon: 1,
    name: "THE FIRST WATER",
    medium,
    pitch: 88e-6,
    pool: ["a2", "a2", "a2", "g", "d"],
    wildlife: wildlifeFor(medium, 1, 0),
    density: 30,
    calm: 40,
    mode: 1,
    current: 1.0e-5,
    inheritance: 0,
  };
}

/**
 * The world born out of a sovereign's body.
 *
 * Every property is derived, and derived from something the player chose:
 *
 *   THE MEDIUM takes its stiffness from the king's mass and its density from
 *   its freedom, so a heavy inert king leaves a fast hard water and a light
 *   lively one leaves a slow soft water. Sound speed and density are what the
 *   contrast factor is computed against, so this changes what everything in the
 *   new world DOES, not just what it looks like.
 *
 *   THE PITCH tightens with mass: a more ordered progenitor leaves a finer
 *   lattice, and a finer lattice is a higher drive frequency.
 *
 *   THE POOL is the motifs of every cell fed to it. You are furnished with what
 *   you gave away.
 *
 *   THE NAME is its crystal system, because that is what the place inherited.
 */
export function worldFrom(s: Sovereign, aeon: number): World {
  const g = pointGroup(s.hm === "" ? "1" : s.hm);

  // Stiffness rises with mass, density falls with freedom. Both are clamped to
  // stay inside the regime the library is honest about.
  const c = Math.min(1720, 1380 + s.mass * 7.5);
  const rho = Math.max(940, 1010 - s.freedom * 3.2);

  const pool = poolFor(s, aeon);
  const medium = carriable({ rho, c });

  return {
    aeon,
    name: SYSTEM_NAME[g.system] ?? "AN UNNAMED WATER",
    medium,
    pitch: Math.max(58e-6, 104e-6 - s.mass * 1.1e-6),
    pool: [...pool],
    wildlife: wildlifeFor(medium, aeon, s.mass),
    // A richer body leaves more of itself suspended, and less peace.
    density: Math.min(40, 26 + Math.round(s.mass / 3)),
    calm: Math.max(4, 14 - aeon * 2),
    mode: modeFor(s.mass, aeon),
    current: 0.9e-5 + aeon * 1.4e-6,
    // A richer king leaves more of the old world standing.
    inheritance: Math.min(0.6, 0.12 + s.mass * 0.016),
  };
}

/**
 * What is dissolved in the new water, as a weighted list.
 *
 * EVERY WATER OFFERS AT LEAST TWO CELLS AND NEVER FEWER THAN THE OPENING. The
 * girdle used to arrive at mass six and the diagonal at eighteen, so a king fed
 * one 222 left a water of pure dimers with a single recipe in it — a world that
 * got narrower the longer you survived, which is the wrong direction for a game
 * whose whole cycle is supposed to open outward. Richness comes from the axis,
 * which is what mass buys; the other two parts are what make an axis into a
 * choice, and they are not rationed.
 *
 * This is the difference between crafting worlds and crafting the same world
 * forever. Deriving the pool from the parts of what was fed looks right and is
 * a FIXED POINT: feed the throne two 222s, whose parts are a dimer and a
 * girdle, and the next water holds dimers and girdles, which build 222s. Eight
 * aeons of headless play produced eight identical worlds with the same name.
 *
 * So the body opens new matter instead. A heavier king leaves a higher
 * principal axis in the water after it, which is a different set of cells, a
 * different king, and a different world again. And only ONE axial is ever
 * dissolved at a time, because two different principal axes refuse to bind and
 * a water full of mutually incompatible matter is not richer, it is unusable.
 *
 * From the third aeon the water also carries pentamers, which build nothing
 * ever. Some of what you gather is simply not going to work.
 */
export function poolFor(s: Sovereign, aeon: number): string[] {
  const axial = s.mass >= 26 ? "a6" : s.mass >= 16 ? "a4" : s.mass >= 8 ? "a3" : "a2";
  const out = [axial, axial, axial, "g", "g"];

  // A DIAGONAL IS ONLY DISSOLVED WHERE THE AXIS CAN USE IT. Of the eleven
  // chiral groups exactly two are cubic — 23 off a two-fold and 432 off a
  // four-fold — so a diagonal in a threefold or sixfold water builds nothing at
  // all and is just something to gather by mistake.
  if (axial === "a2" || axial === "a4") out.push("d");

  if (aeon >= 3) out.push("a5");
  return out;
}

/** The motifs a group is generated by — the recipes, read backwards. */
export function partsOf(hm: string): string[] {
  return RECIPE_PARTS.get(hm)?.slice() ?? [];
}

const RECIPE_PARTS = new Map<string, readonly string[]>([
  ["1", ["a1"]], ["2", ["a2"]], ["3", ["a3"]], ["4", ["a4"]], ["6", ["a6"]],
  ["222", ["a2", "g"]], ["32", ["a3", "g"]], ["422", ["a4", "g"]],
  ["622", ["a6", "g"]], ["23", ["a2", "d"]], ["432", ["a4", "d"]],
]);

/** What the player is told about the world they are about to enter. */
export interface Epitaph {
  name: string;
  lines: Array<[string, string]>;
}

export function epitaphFor(s: Sovereign, w: World): Epitaph {
  const g = pointGroup(s.hm === "" ? "1" : s.hm);
  const carry = contrastFactor(YOU, w.medium);
  return {
    name: w.name,
    lines: [
      ["BORN OF", `${s.hm}  ·  ${g.system.toUpperCase()}`],
      ["FED ON", s.fed.length ? s.fed.join("  ") : "NOTHING"],
      ["SOUND SPEED", `${w.medium.c.toFixed(0)} M/S`],
      ["DENSITY", `${w.medium.rho.toFixed(0)} KG/M3`],
      ["LATTICE", `${(w.pitch * 1e6).toFixed(0)} UM`],
      ["IN THE WATER", w.pool.map((m) => motif(m).label).join("  ")],
      ["INHERITED", `${(w.inheritance * 100).toFixed(0)}% OF WHAT YOU BUILT`],
      // The line that decides what the next place is like to stand in: your own
      // contrast against the new water, and therefore which lattice holds you
      // up and which half of the bestiary can reach you.
      ["IT CARRIES YOU BY", carry >= 0 ? "ITS NODES" : "ITS ANTINODES"],
      ["YOUR CONTRAST", `${carry >= 0 ? "+" : ""}${carry.toFixed(3)}`],
    ],
  };
}

/** Convenience for the surface: the cell a group would make. */
export function cellOf(hm: string): Cell { return cellFor(hm); }
