// game/run.ts — an aeon, and the one after it.
//
// SETTLE, CROWN, REIGN, BIRTH. You gather, you build, you crown something out
// of what you built, it turns on you, and its body is the next world.
//
// WHAT STAYS. A placed cell is a Structure and it does not go away. It projects
// holding points along its own group's in-plane directions — six for a 622,
// two for a 222 — and things collect at them whether or not you are there. Two
// motifs that collect at the same point MERGE without you, so a structure you
// left behind is quietly crafting while you are elsewhere, and you come back to
// find a cluster ready. That is the whole reason to build: the world works for
// you once you have made some of it.
//
// WHAT YOU CROWN. The throne takes cells. What you feed it is what it becomes —
// its group is the most symmetric thing you gave it, and its volley pattern is
// that group's symmetry seen from above, so a sixfold king throws six arms and
// you live in the gaps between them. Feeding it more makes it harder AND makes
// the world born from it richer. That trade is the only real decision here.
//
// HOW IT DIES. Your structures. Drive one and it charges, then discharges along
// its own lobes and is consumed. You take the world apart to kill the thing you
// crowned out of it, and what is left standing is what the next world inherits.
//
// No DOM. A pure function of (state, input, dt), so a bot can play whole aeons
// headlessly and the tests can tell whether any of this is actually a game.

import { beast } from "./beasts.js";
import {
  type Body, autonomous, bodiesOf, gaitDirection, reaches, snap, walkSpeed,
} from "./body.js";
import { MAX_MODE, planes, reseat, together } from "./depth.js";
import { type Feature, EDGE_GAIN, features, flowAt } from "./chip.js";
import { mediumAt, streamAt } from "./streams.js";
import {
  type Bound, RELEASE_TIME, catches, crystalOf, gapOf, newBound, workableSpacing,
} from "./bound.js";
import {
  type Cell, BUILDABLE, assemble, cellFor, motif,
} from "./lattice.js";
import {
  type Wave, advance, axisX, axisY, grip, localAmplitude, newWave, rng,
  streamingSpeed,
} from "./wave.js";
import {
  type Pilot, aimFor, beginDash, carry, concentrate, handed, newPilot,
} from "./pilot.js";
import {
  type Sovereign, type Structure, type World,
  cadence, emptyThrone, feed, firstWorld, reachOf, sovereignInertia,
  sovereignParticle, sovereignSpeed, structureFrom, volley, worldFrom,
} from "./world.js";
import { type Medium, type Particle, WATER, contrastFactor } from "../src/gorkov.js";
import { trapPositions } from "../src/fields.js";

// ── the space ───────────────────────────────────────────────────────────────

/**
 * The water you start in, m.
 *
 * Not the channel — the part of it your drive covers. A device is as wide as
 * its transducer, and yours grows: see `boundsFor`.
 */
export const ARENA_W = 900e-6;
export const ARENA_H = 660e-6;

/**
 * The whole channel, m. Two and a half millimetres by nearly two.
 *
 * This is a real chip rather than a big one — acoustofluidic devices are
 * centimetres of glass with channels a millimetre or two across — and at one
 * pixel to the micron it is about three screens wide and three deep.
 */
export const CHANNEL_W = 4200e-6;
export const CHANNEL_H = 3000e-6;

/**
 * What is etched into it, and the flow that comes off it.
 *
 * A MODULE CONSTANT, NOT RUN STATE, and that is the claim. Everything on `Run`
 * is born with a world and dies with it; the channel is the piece of glass all
 * of them happen inside. Putting the chip on the run would say the next aeon
 * gets a different one, and it does not — which is the entire reason there can
 * be a landmark here at all.
 */
export const CHIP: readonly Feature[] = features(CHANNEL_W, CHANNEL_H);

export {
  type Feature, EDGE_STANDOFF_FRAC, featureName, flowAt, nearestFeature,
} from "./chip.js";

/** What the glass is doing to the water at a point, m/s. */
export function chipFlow(run: Run, x: number, y: number): { x: number; y: number } {
  return flowAt(CHIP, x, y, run.wave.amplitude);
}

/**
 * How much of the channel you can work in, given what you have built.
 *
 * IT OPENS AS THE ORGANISM DOES. A crystal of silica skeletons is a phononic
 * structure: it is what guides and confines a wave, which is the whole of the
 * bound field's story, and the region you can drive is the region your crystal
 * reaches into. So the water you can move in is a function of the largest body
 * you have made, and a player who has built nothing is in a pool the size of the
 * game as it has always been.
 *
 * Squared off rather than round because the lattice is, and clamped at the walls
 * of the actual channel because glass is glass.
 */
export interface Bounds { x: number; y: number; w: number; h: number }

/** The corner of the pool everything starts in. */
export const START = {
  x: (CHANNEL_W - ARENA_W) / 2,
  y: (CHANNEL_H - ARENA_H) / 2,
};

export function boundsFor(cells: number): Bounds {
  const grow = 1 + Math.max(0, cells - 2) * 0.16;
  const w = Math.min(CHANNEL_W, ARENA_W * grow);
  const h = Math.min(CHANNEL_H, ARENA_H * grow);
  // CENTRED IN THE CHANNEL, opening outward from where you started. Anchored at
  // a corner instead, the pool you begin in would sit against the glass and in
  // the wrong stream, so the water the world's whole balance was derived from
  // would not be the water you were standing in.
  return { x: (CHANNEL_W - w) / 2, y: (CHANNEL_H - h) / 2, w, h };
}
/**
 * How many motifs the water you have opened is carrying.
 *
 * `world.density` is a CONCENTRATION — its own doc says so, "it is a
 * suspension, how much is in it is a property of the water" — but it was being
 * spent as an absolute count, seeded once into the starting pool and then held
 * there by `motifs < density`. The channel is twenty-one times that pool's
 * area, so every motif in the game lived in the middle five per cent of it and
 * the rest was distilled water.
 *
 * That made `chip.ts`'s central claim false. It says a cavity "has been
 * gathering while you were elsewhere, and going to look is the reward for
 * going". Going was worth nothing — and NOT because the cavity was wrong: a
 * mote dropped at its rim is at the core in fifteen seconds at cruise and four
 * and a half at grip. There was simply never anything out there to gather.
 *
 * So: the same concentration, over the water you have actually opened. The
 * density figures tuned in world.ts stay exactly as valid, because the count
 * NEAR YOU does not change — what changes is that the outer channel now has
 * something in it, and a landmark can pay for the walk.
 *
 * THE CAP IS A BACKSTOP AND NOT A TUNING KNOB, and in the worlds this game
 * actually makes it never binds: the richest water is density 40, the whole
 * channel is 21.2 pools, and 848 is under it.
 *
 * It was briefly a real frame budget of 400. That was when `mergePass` compared
 * every pair — 636 motifs cost 8.5 ms a frame against a budget of 16.7, and the
 * outer water had to run at two thirds concentration to pay for it. The merge
 * pass is O(n) now (see `neighbourhood`), which measures at 1.4 ms for the same
 * 636 and 2.0 ms for a thousand, so the physical answer and the affordable one
 * stopped disagreeing and the cap stopped having anything to decide.
 *
 * The renderer needed the other half of that: it draws a trail as eight
 * separate strokes per motif, so `drifter.onCamera` culls to the view.
 */
export const MAX_SUSPENSION = 900;

/**
 * How fast the water carries more in, motifs per second.
 *
 * Derived, not chosen. The pool is `bounds.w` across and the water crosses it at
 * `world.current`, so its entire content is replaced every `bounds.w / current`
 * seconds — 90 s for the opening pool, 420 s for the whole channel. Carrying
 * `suspension` motifs, that is the rate they arrive at.
 *
 * WHAT IT REPLACED, and why. This used to be `motifs < suspension`, one motif
 * pushed per frame, which is sixty a second and never runs dry. It meant an
 * aeon's economy had no ceiling at all: the only limit was how many catchments
 * you owned. A 909 s report came back with 3440 cells built, 410 buildings
 * standing, and a throne that had never once been fed, because there was no
 * point at which gathering stopped paying better than the objective.
 *
 * TWO THINGS MOVE THE WATER PAST YOU and the first draft only counted one.
 * `world.current` is the co-flow; bulk acoustic streaming is the same order
 * (4.3 um/s at cruise, 14.4 gripping) and is driven by your own field. Both are
 * large-scale circulations rather than a pipe, but that does not matter here:
 * a circulation of scale L still exchanges the contents of a window smaller
 * than L, and your pool is that window.
 *
 * Leaving streaming out cost the opening its tail. Measured over ten seeds,
 * time to the first cell: with the old unbounded spring, worst 32 s and median
 * 25. Co-flow alone, worst 77 s and median 26 — the typical run was untouched
 * and the unlucky one doubled, which is the shape of fault that gets reported
 * as "I suck at this game" and never as a bug. With both terms, below.
 *
 * It also means gripping brings you more water, which is the same bargain the
 * chip already makes: drive harder and the glass does more.
 */
export function arrivalRate(run: Run): number {
  const past = run.world.current + streamingSpeed(run.wave.amplitude);
  return (suspension(run) * past) / run.bounds.w;
}

/** The motif population the current pool should hold. */
export function suspension(run: Run): number {
  const area = run.bounds.w * run.bounds.h;
  return Math.min(
    MAX_SUSPENSION,
    Math.round(run.world.density * (area / (ARENA_W * ARENA_H))),
  );
}

export const MAX_AMPLITUDE = 2.0e5;

/** Focus must stay well under the trap pitch or your hand is not one trap. */
export function focusFor(pitch: number): number { return pitch * 0.62; }

/**
 * The pressure a trap needs before it holds anything, Pa.
 *
 * Absolute, not a fraction of the envelope. What a body feels is the local
 * amplitude, and a wide weak lattice must not hold things three hundred
 * microns away merely because its envelope is flat out there. At cruise the
 * drive reaches this nowhere, so letting go of the grip really does let go of
 * everything — which is what makes gripping a decision.
 */
export const HOLD_PRESSURE = 1.3e5;
/**
 * How close to its trap a body has to be before your hand owns it.
 *
 * A quarter of the trap pitch, which is not a tolerance — it is the half-width
 * of the well and the offset where the pull is at its strongest. Inside it the
 * body is going one place and has no say in the matter, so that is what being
 * caught means.
 *
 * It was nine microns flat, and that left a ten-micron ring where a hunter was
 * deep inside your grip, on its way to your node, and still counted as free to
 * bite you — because touching starts at twenty-two. Every run died in it. The
 * old number was a snap tolerance from when the player was a cursor that could
 * simply be somewhere else.
 */
export function captureRadius(pitch: number): number { return pitch / 4; }
export const BIND_RADIUS = 24e-6;
export const BIND_DWELL = 0.26;

/**
 * How many touches you survive, and the mercy after one.
 *
 * Four was the number when the player was a cursor that could be somewhere else
 * the instant the mouse moved. A body cannot side-step: breaking contact means
 * gripping and outrunning the thing's own trap, which costs stamina and takes
 * about a second, so every mistake is longer and there have to be more of them
 * in the budget. The knockback below is part of the same accounting — a hit has
 * to buy back enough room to get the field up again, or the mercy simply ends
 * with the same body still standing on you.
 */
export const MAX_INTEGRITY = 6;
export const IFRAME = 1.8;
/** How far a touch throws everything off you, m. */
export const KNOCKBACK = 150e-6;
export const AMBIENT = 1.0e-5;

/** How close your hand must be to drive a structure, m. */
export const DRIVE_RADIUS = 34e-6;
/** Stamina returned for taking something apart. */
export const KILL_REFUND = 22;

// ── wildlife ────────────────────────────────────────────────────────────────

export {
  type Beast, type Behaviour, BEASTS, beast,
} from "./beasts.js";

// ── entities ────────────────────────────────────────────────────────────────

export type Faction = "motif" | "beast";

export interface Entity {
  id: number;
  faction: Faction;
  species: string;
  parts: string[];
  x: number;
  y: number;
  ang: number;
  held: number;
  dwell: number;
  partner: number;
  flash: number;
  spin: number;
  trail: number[];
  /** Seconds of coil left before it commits. */
  wind: number;
  /** Seconds of strike left. */
  strike: number;
  /** The direction it committed to. A strike does not steer, which is the
   *  entire reason stepping out of one works. */
  sx: number;
  sy: number;
  /** Seconds before it may gather again. */
  cool: number;
  /** Which node plane is holding it up. The third dimension is an integer. */
  layer: number;
}

/** A volley arm in flight. */
export interface Bolt {
  x: number; y: number; vx: number; vy: number; life: number; born: number;
}

// ── the run ─────────────────────────────────────────────────────────────────

export type Phase = "settle" | "reign" | "birth" | "dead";

export type Ev =
  /** What reached you. A post-mortem that cannot say WHY you died teaches
   *  nothing, and "you were hit six times" is not a reason. */
  | { kind: "hit"; x: number; y: number; cause: "struck" | "touched" | "volley" }
  | { kind: "kill"; x: number; y: number; species: string; score: number }
  | { kind: "merge"; x: number; y: number }
  | { kind: "refuse"; x: number; y: number; text: string }
  | { kind: "crystal"; x: number; y: number; group: string }
  | { kind: "place"; x: number; y: number; group: string }
  | { kind: "fed"; group: string }
  | { kind: "crown"; group: string; mass: number }
  | { kind: "discharge"; x: number; y: number; group: string; damage: number }
  | { kind: "devour"; x: number; y: number; heal: number }
  | { kind: "volley"; x: number; y: number; arms: number }
  | { kind: "sovereign-hit"; x: number; y: number }
  | { kind: "wearing"; x: number; y: number }
  | { kind: "birth"; aeon: number; name: string }
  | { kind: "tuned"; caught: boolean }
  | { kind: "retune"; mode: number; layer: number }
  | { kind: "step"; x: number; y: number; cells: number }
  | { kind: "lift"; x: number; y: number; group: string }
  | { kind: "freed"; x: number; y: number }
  | { kind: "dash"; x: number; y: number }
  | { kind: "coil"; x: number; y: number; species: string }
  | { kind: "strike"; x: number; y: number; species: string }
  | { kind: "aiming"; x: number; y: number; arms: number }
  | { kind: "spent" }
  | { kind: "death" };

export interface Run {
  world: World;
  wave: Wave;
  /** You. A particle in the water, moved by nothing but the field. */
  you: Pilot;
  /** The other field: a mode this world's own lattice will not carry. */
  bound: Bound;
  /** The crystal your buildings make, and its complete gap. Recomputed when
   *  what you have built changes, because it costs sixty milliseconds. */
  crystal: ReturnType<typeof crystalOf>;
  gap: ReturnType<typeof gapOf>;
  /**
   * How far apart the buildings of THIS water have to be, in metres.
   *
   * The objective is a frequency and the lever is a distance. Nobody can act on
   * megaradians per second, so it is inverted once when the world begins — it
   * costs about half a second and the answer cannot change inside a world.
   */
  spacing: { lo: number; hi: number } | null;
  /** What your buildings have joined into. Recomputed with the dispersion,
   *  because they are the same event: a body IS the crystal. */
  bodies: Body[];
  /** How much of the channel you can work in. It opens as the organism grows. */
  bounds: Bounds;
  phase: Phase;
  entities: Entity[];
  structures: Structure[];
  /**
   * How much of this world's water has been handed over.
   *
   * A suspension is a BATCH. It was being spent as a spring: the population was
   * topped back up to `suspension(run)` every frame a motif went missing, at up
   * to sixty a second, so gathering could never run the water dry and the only
   * limit on an aeon's economy was how fast you could pick things up. A report
   * came back at 909 s with 3440 cells built, 410 buildings standing, and a
   * throne that had never been fed — because there was no reason to ever stop.
   *
   * So this counts what the water has already given you, and it only rises when
   * the POOL DOES. Opening more water hands you the cells that were already
   * suspended in it; it does not conjure new ones into water you have already
   * been through.
   */
  delivered: number;
  /**
   * When this world began, in run seconds.
   *
   * Not `run.t`, which counts the whole run across aeons. Everything that asks
   * "how long have you refused to leave this water" needs the age of the WORLD.
   */
  bornAt: number;
  /**
   * The largest body this world has ever seen, in cells.
   *
   * The pool opens with your crystal — that is the phononic argument in
   * `boundsFor` — but it must not CLOSE when you spend it, and closing is
   * exactly what it did. Killing a king means discharging buildings, each
   * discharge deletes a structure, and `boundsFor` read the body live: a player
   * who fought their way from forty buildings down to two watched the pool go
   * from the whole channel to the opening arena, the chip from twelve features
   * in reach to none, and the water from 636 motifs to 30 — while a king with
   * 82 hp left stood in front of them.
   *
   * So the fight cannot defund you. You drove that water and it stays driven
   * for as long as this world lasts; a new world gets a new high-water mark
   * from what it inherits.
   */
  opened: number;
  /**
   * Whether the water you opened EBBS back when you spend the crystal.
   *
   * A difficulty, chosen before the run and never during it. False is the
   * forgiving reading and the default: you drove that water open and it stays
   * open while this world lasts. True is the strict one, and it is the older
   * behaviour — the pool is exactly what your standing crystal reaches into, so
   * every building you discharge closes the channel a little, the chip goes out
   * of reach, and the water thins while the fight is still going on.
   *
   * It is a real difference and not a modifier: on the strict setting, killing
   * a king costs you the world you would have inherited it in.
   */
  ebb: boolean;
  /**
   * Fractional motifs owed by the co-flow, carried between frames.
   *
   * The other half of the same correction, and the half a pure batch got wrong.
   * The pool is not a sealed jar — it is a region of a channel with three waters
   * flowing through it, so what you gather out IS replaced. Just not instantly.
   * See `arrivalRate`.
   */
  arriving: number;
  bolts: Bolt[];
  throne: Sovereign;
  /** Cells in hand, not yet placed or fed. */
  cells: Cell[];
  integrity: number;
  iframe: number;
  score: number;
  built: number;
  aeonsSurvived: number;
  t: number;
  spawnIn: number;
  events: Ev[];
  /** Which plane you are standing on. */
  layer: number;
  /** Where the lattice is currently pointed — a quarter pitch off your body,
   *  in the direction you are driving. Derived, never set from outside. */
  aim: { x: number; y: number };
  rand: () => number;
  nextId: number;
}

export function startRun(seed = 1, ebb = false): Run {
  const world = firstWorld();
  const run: Run = {
    world,
    wave: newWave(world.pitch, MAX_AMPLITUDE, focusFor(world.pitch), world.medium),
    you: newPilot(START.x + ARENA_W * 0.3, START.y + ARENA_H * 0.3),
    bound: newBound(world.pitch, world.medium,
      START.x + ARENA_W * 0.72, START.y + ARENA_H * 0.28),
    crystal: null,
    gap: null,
    spacing: null,
    bodies: [],
    bounds: boundsFor(0),
    phase: "settle",
    entities: [],
    structures: [],
    delivered: 0,
    arriving: 0,
    bornAt: 0,
    opened: 0,
    ebb: false,
    bolts: [],
    throne: emptyThrone(START.x + ARENA_W / 2, START.y + ARENA_H / 2),
    cells: [],
    integrity: MAX_INTEGRITY,
    iframe: 0,
    score: 0,
    built: 0,
    aeonsSurvived: 0,
    t: 0,
    spawnIn: 3,
    layer: 0,
    events: [],
    aim: { x: START.x + ARENA_W * 0.3, y: START.y + ARENA_H * 0.3 },
    rand: rng(seed),
    nextId: 0,
  };
  for (let i = 0; i < suspension(run); i++) run.entities.push(newMotif(run, true));
  run.delivered = suspension(run);
  run.spacing = workableSpacing(run.bound.omega, world.medium, reachOf(BUILDABLE[0]));
  run.ebb = ebb;
  return run;
}

// ── bodies ──────────────────────────────────────────────────────────────────

/**
 * A cluster is one particle.
 *
 * Volumes add; density and sound speed average by volume. A dimer is strongly
 * node-seeking and a girdle strongly antinode-seeking, so the 222 made of them
 * has a contrast near zero and barely answers the field at all. Building
 * something makes it harder to carry, and nobody wrote that rule.
 */
export function clusterParticle(parts: readonly string[]): Particle {
  let v = 0, mr = 0, mc = 0;
  for (const id of parts) {
    const p = motif(id).particle;
    const vi = p.radius ** 3;
    v += vi; mr += p.rho * vi; mc += p.c * vi;
  }
  if (v === 0) return { radius: 1e-6, rho: WATER.rho, c: WATER.c };
  return { radius: Math.cbrt(v), rho: mr / v, c: mc / v };
}

export function particleOf(e: Entity): Particle {
  return e.faction === "motif" ? clusterParticle(e.parts) : beast(e.species).particle;
}

export function labelOf(e: Entity): string {
  if (e.faction === "beast") return beast(e.species).label;
  const a = assemble(e.parts);
  if (e.parts.length === 1) return motif(e.parts[0]).label;
  return a.group ? `${a.group}  x${a.mass}` : `CLUSTER x${a.mass}`;
}

// ── spawning ────────────────────────────────────────────────────────────────

function edge(run: Run): { x: number; y: number } {
  if (run.rand() < 0.5) {
    return { x: run.bounds.x + (run.rand() < 0.5 ? 4e-6 : run.bounds.w - 4e-6),
      y: run.bounds.y + run.rand() * run.bounds.h };
  }
  return { x: run.bounds.x + run.rand() * run.bounds.w,
    y: run.bounds.y + (run.rand() < 0.5 ? 4e-6 : run.bounds.h - 4e-6) };
}

function blank(run: Run, faction: Faction, at: { x: number; y: number }): Entity {
  return {
    id: run.nextId++, faction, species: "", parts: [],
    x: at.x, y: at.y, ang: run.rand() * Math.PI * 2,
    held: 0, dwell: 0, partner: -1, flash: 0, spin: run.rand() * 6.28, trail: [],
    wind: 0, strike: 0, sx: 0, sy: 0, cool: 0,
    layer: Math.floor(run.rand() * Math.max(1, run.world.mode)),
  };
}

export function newMotif(run: Run, anywhere = false): Entity {
  const at = anywhere
    ? { x: run.bounds.x + 0.08 * run.bounds.w + run.rand() * 0.84 * run.bounds.w,
        y: run.bounds.y + 0.08 * run.bounds.h + run.rand() * 0.84 * run.bounds.h }
    : edge(run);
  const e = blank(run, "motif", at);
  e.parts = [run.world.pool[Math.floor(run.rand() * run.world.pool.length)]];
  return e;
}

export function newBeast(run: Run, species: string, at?: { x: number; y: number }): Entity {
  const e = blank(run, "beast", at ?? edge(run));
  e.species = species;
  return e;
}

/**
 * Seconds between arrivals.
 *
 * Settling is the phase you are meant to BUILD in, so the water is nearly
 * empty: a beast now and then, something to watch for, not a siege. All the
 * pressure belongs to the reign, where it is a thing you crowned rather than
 * weather. A headless bot that tried to lay out a world under the old rate died
 * mid-construction on every seed and never crowned anything at all.
 */
/** How long a world can be gathered in before it starts filling up, seconds. */
export const STANDING = 150;

/**
 * How many hunters a world you will not leave is allowed to hold.
 *
 * Settling is deliberately quiet — see `spawnGap` — because it is the phase you
 * are meant to BUILD in, and that is right. What was missing is that it had no
 * END. A report came back at 909 s still in aeon 1: 3440 cells, 410 buildings,
 * the bound field freed, ONE hit taken, and a throne that had never been fed.
 * Nothing in the water ever asked the player to stop.
 *
 * So a water you refuse to leave fills up with what lives in it, one more every
 * STANDING seconds. That is not a difficulty curve bolted on; it is the only
 * thing standing water does. The first two minutes are exactly as calm as they
 * have always been, so the phase this protects is untouched — and it is capped
 * at a reign's own crowd, because settling must never be worse than the fight
 * it is preparing you for.
 */
export function settleCap(run: Run): number {
  const base = 1 + Math.floor(run.world.aeon / 3);
  const age = Math.max(0, run.t - run.bornAt);
  return Math.min(4 + Math.floor(run.world.aeon / 2), base + Math.floor(age / STANDING));
}

export function spawnGap(run: Run): number {
  const base = run.phase === "reign" ? 3.2 : 9.0;
  return Math.max(1.3, base - run.world.aeon * 0.3);
}

// ── stepping ────────────────────────────────────────────────────────────────

/**
 * A frame of intent, and nothing more.
 *
 * `move` is a stick: a direction with a magnitude in 0..1, which becomes the
 * offset of the trap from your body. It is not a velocity — there is no way to
 * ask this game to move you, only to ask it where to put the node.
 */
export interface Input {
  move: { x: number; y: number };
  grip: boolean;
  /** Edge-triggered: true on the frame the burst was asked for. */
  dash: boolean;
}

export function step(run: Run, input: Input, dt: number): void {
  run.t += dt;
  const w = run.wave;
  const you = run.you;
  const alive = run.phase !== "dead" && run.phase !== "birth";

  // You are a body before you are a player. The drive is set, the trap is put
  // where the stick asked, and then the water moves you along with everything
  // else standing in it.
  // The drive is computed for the water YOU are in, because that is the fluid
  // it is coupling into.
  w.medium = waterAt(run, you.y);

  const wasSpent = w.spent;
  grip(w, input.grip && alive, dt);
  if (w.spent && !wasSpent) run.events.push({ kind: "spent" });

  if (alive && input.dash && beginDash(you, w, input.move.x, input.move.y)) {
    run.events.push({ kind: "dash", x: you.x, y: you.y });
  }
  concentrate(you, w, input.grip && alive && !w.spent, dt);
  const trap = alive
    ? aimFor(you, w, input.move.x, input.move.y)
    : aimFor(you, w, 0, 0);
  run.aim.x = trap.x;
  run.aim.y = trap.y;
  // The glass moves the water, and you are standing in the water. It is
  // powered by the drive, so gripping makes every jet on the chip fiercer —
  // including the one you are trying to get out of.
  carry(you, w, dt, run.world.current, run.bounds, chipFlow(run, you.x, you.y));

  if (run.iframe > 0) run.iframe -= dt;
  if (!alive) { drift(run, dt); return; }

  // arrivals
  run.spawnIn -= dt;
  if (run.spawnIn <= 0 && run.t >= run.world.calm) {
    run.spawnIn = spawnGap(run) * (0.7 + run.rand() * 0.6);
    const live = run.entities.filter((e) => e.faction === "beast").length;
    const cap = run.phase === "reign"
      ? 4 + Math.floor(run.world.aeon / 2)
      : settleCap(run);
    if (live < cap) {
      const table = run.world.wildlife;
      run.entities.push(newBeast(run, table[Math.floor(run.rand() * table.length)]));
    }
  }
  // TWO DIFFERENT THINGS, and conflating them is what made the water a spring.
  // Opening the pool reaches water that ALREADY HAS CELLS IN IT, so that share
  // arrives at once. Replacing what you gathered out is the co-flow's job, and
  // the co-flow is slow.
  if (run.delivered < suspension(run)) {
    run.entities.push(newMotif(run));
    run.delivered++;
  } else {
    run.arriving += arrivalRate(run) * dt;
    if (run.arriving >= 1) {
      const standing = run.entities.filter((e) => e.faction === "motif").length;
      if (standing < suspension(run)) run.entities.push(newMotif(run));
      run.arriving -= 1;
    }
  }

  release(run, dt);
  walkBodies(run, dt);
  drift(run, dt);
  settle(run, dt);
  mergePass(run, dt);
  crystallise(run);
  driveStructures(run, dt);
  if (run.phase === "reign") reign(run, dt);
  contact(run, dt);
}

/**
 * The other field, getting out.
 *
 * It does not leave the instant the gap catches it. A mode has to build up in
 * the channel, and the seconds it takes are seconds you have to keep the
 * crystal standing — which is the whole of the tension, because the thing you
 * crowned eats buildings and every one it takes retunes the gap out from under
 * you.
 */
function release(run: Run, dt: number): void {
  const b = run.bound;
  if (b.free) return;

  if (catches(run.gap, b.omega)) {
    b.held += dt;
    if (b.held >= RELEASE_TIME) {
      b.free = true;
      run.score += 80;
      run.integrity = Math.min(MAX_INTEGRITY, run.integrity + 1);
      run.events.push({ kind: "freed", x: b.x, y: b.y });
    }
  } else if (b.held > 0) {
    b.held = Math.max(0, b.held - dt * 0.6);
  }
}

// ── motion ──────────────────────────────────────────────────────────────────

function drift(run: Run, dt: number): void {
  const w = run.wave;
  const uStream = streamingSpeed(w.amplitude);
  const ix = indexStructures(run.structures);
  const scratch: Structure[] = [];

  for (const e of run.entities) {
    const p = particleOf(e);
    // Every body answers to the water IT is in, not the water you are in.
    const water = waterAt(run, e.y);
    const lw = inWater(w, water);
    // The radiation part is stiff and is integrated as such; everything below
    // is a slow drift laid over the top of it.
    const moved = advance(lw, e.x, e.y, p, dt);
    let dx = 0, dy = 0;

    if (uStream > 0) {
      e.ang += (run.rand() * 2 - 1) * 5 * dt;
      dx += uStream * Math.cos(e.ang);
      dy += uStream * Math.sin(e.ang);
    }

    const ca = (Math.PI * e.x) / run.bounds.w;
    const cb = (Math.PI * e.y) / run.bounds.h;
    dx += run.world.current * Math.sin(ca) * Math.cos(cb);
    dy += -run.world.current * Math.cos(ca) * Math.sin(cb);

    // And the glass. Nothing here asks how big the thing is: a flow carries
    // whatever is in it. The size dependence is already in the room — `advance`
    // above put the radiation force on the same body this frame, and that force
    // goes as radius cubed while this drag goes as radius. A cell holds its node
    // against a jet and a mote does not, and neither of them was told to.
    const flow = flowAt(CHIP, e.x, e.y, w.amplitude);
    dx += flow.x;
    dy += flow.y;

    if (e.faction === "beast" && run.phase !== "birth") {
      const swim = together(e.layer, run.layer) ? hunt(run, e, dt) : { x: 0, y: 0 };
      dx += swim.x;
      dy += swim.y;
    }

    // What you built pulls on what answers to it, whether or not you are here —
    // on every plane the body it belongs to can reach.
    if (contrastFactor(p, water) > 0) {
      for (const s of nearStructures(ix, e.x, e.y, scratch)) {
        if (!s.serves.includes(e.layer)) continue;
        const grab = s.reach * 1.1;
        for (const [lx, ly] of s.lobes) {
          const qx = s.x + lx * s.reach - e.x;
          const qy = s.y + ly * s.reach - e.y;
          const r = Math.hypot(qx, qy);
          if (r > 1e-9 && r < grab) {
            const pull = (s.ruin ? 2.2e-5 : 4.4e-5) * (1 - r / grab);
            dx += (qx / r) * pull;
            dy += (qy / r) * pull;
          }
        }
      }
    }

    e.x = moved.x + dx * dt;
    e.y = moved.y + dy * dt;
    e.spin += dt * 1.5;

    const rad = p.radius;
    const b = run.bounds;
    if (e.x < b.x + rad) { e.x = b.x + rad; e.ang = Math.PI - e.ang; }
    if (e.x > b.x + b.w - rad) { e.x = b.x + b.w - rad; e.ang = Math.PI - e.ang; }
    if (e.y < b.y + rad) { e.y = b.y + rad; e.ang = -e.ang; }
    if (e.y > b.y + b.h - rad) { e.y = b.y + b.h - rad; e.ang = -e.ang; }

    e.trail.push(e.x, e.y);
    while (e.trail.length > 18) e.trail.shift();
    if (e.flash > 0) e.flash -= dt;
  }
}

/** How near you have to be before a hunter gathers itself. */
export const STRIKE_RANGE = 120e-6;
/** And how long it must wait before doing it again. */
export const STRIKE_COOL = 1.5;

/**
 * A hunter's own swimming, which is the only part of it that is not physics.
 *
 * It walks at you until it is close enough to be worth committing, then it
 * STOPS and gathers, and then it goes — along the direction it had when it
 * committed, not the one you are at now. That last clause is the whole
 * mechanic: a strike is dodged by not being there any more, and a burst gets
 * you two hundred microns in seven frames.
 *
 * A body you have hold of does none of it. Being caught is not a damage state,
 * it is the removal of everything the thing was about to do.
 */
function hunt(run: Run, e: Entity, dt: number): { x: number; y: number } {
  const b = beast(e.species);
  if (b.behaviour === "drift") return { x: 0, y: 0 };

  if (e.held > 0) {
    e.wind = 0;
    e.strike = 0;
    return { x: 0, y: 0 };
  }

  if (e.strike > 0) {
    e.strike = Math.max(0, e.strike - dt);
    return { x: e.sx * b.speed * b.surge, y: e.sy * b.speed * b.surge };
  }

  const hx = run.you.x - e.x, hy = run.you.y - e.y;
  const r = Math.hypot(hx, hy) || 1e-12;

  if (e.wind > 0) {
    e.wind = Math.max(0, e.wind - dt);
    if (e.wind === 0) {
      e.strike = b.strike;
      e.sx = hx / r;
      e.sy = hy / r;
      e.cool = STRIKE_COOL;
      run.events.push({ kind: "strike", x: e.x, y: e.y, species: e.species });
    }
    return { x: 0, y: 0 };   // it gathers, and while it gathers it is standing still
  }

  if (e.cool > 0) e.cool = Math.max(0, e.cool - dt);
  else if (b.wind > 0 && r < STRIKE_RANGE) {
    e.wind = b.wind;
    run.events.push({ kind: "coil", x: e.x, y: e.y, species: e.species });
    return { x: 0, y: 0 };
  }

  return { x: (hx / r) * b.speed, y: (hy / r) * b.speed };
}

// ── being held ──────────────────────────────────────────────────────────────

/**
 * Is this body caught?
 *
 * Two conditions and they are different questions. The drive where it stands
 * has to be strong enough to own it at all, and it has to be inside the well
 * that leads to one of ITS OWN traps — nodes or antinodes according to the sign
 * of its contrast, which trapPositions already knows. Nothing here asks what
 * the body is, which is why the sovereign can be put through it.
 */
export function capturedAt(w: Wave, x: number, y: number, p: Particle): boolean {
  if (localAmplitude(w, x, y) < HOLD_PRESSURE) return false;
  const nx = nearest(trapPositions(axisX(w), p, CHANNEL_W), x);
  const ny = nearest(trapPositions(axisY(w), p, CHANNEL_H), y);
  if (nx === null || ny === null) return false;
  return Math.hypot(nx - x, ny - y) < captureRadius(w.pitch) + p.radius * 0.5;
}

function settle(run: Run, dt: number): void {
  const w = run.wave;
  const dead: Entity[] = [];

  for (const e of run.entities) {
    // Your hand is a spot in three dimensions and it is centred on your plane.
    if (!together(e.layer, run.layer)) { e.held = 0; continue; }
    if (!capturedAt(inWater(w, waterAt(run, e.y)), e.x, e.y, particleOf(e))) {
      e.held = 0;
      continue;
    }
    e.held += dt;
    if (e.faction === "beast" && e.held >= beast(e.species).hold) dead.push(e);
  }
  for (const e of dead) kill(run, e);
}

export function kill(run: Run, e: Entity): void {
  const b = beast(e.species);
  run.entities = run.entities.filter((x) => x !== e);
  run.score += b.score;
  // Killing pays for itself: grip is the only offence and the only defence, so
  // running dry has to be recoverable by fighting rather than only by waiting.
  run.wave.stamina = Math.min(100, run.wave.stamina + KILL_REFUND);
  if (run.wave.stamina > 25) run.wave.spent = false;
  run.events.push({ kind: "kill", x: e.x, y: e.y, species: e.species, score: b.score });

  if (b.behaviour === "split") {
    for (let i = 0; i < 2; i++) {
      run.entities.push(newBeast(run, "mote", {
        x: e.x + (run.rand() * 2 - 1) * 20e-6,
        y: e.y + (run.rand() * 2 - 1) * 20e-6,
      }));
    }
  }
}

// ── merging, and what your buildings do while you are away ──────────────────

/**
 * The buildings near a point, without asking about all of them.
 *
 * Two passes ask "which structures reach this spot?" for every entity in the
 * water — the pull in `drift` and the binding in `underStructure` — and both
 * were written when a player had twenty-six buildings. A report came back with
 * FOUR HUNDRED AND TEN of them and 636 motifs, which is a million distance
 * checks a frame in each pass: measured at 53.5 ms of simulation per frame,
 * so the game was running at nineteen frames a second before anything was
 * drawn, and the player was in slow motion without being told why.
 *
 * A building's influence stops at its arm tips plus their catch, so 2.1 reaches
 * from its centre bounds it. A grid of that pitch puts every structure that can
 * possibly matter in the nine squares around a point. It is rebuilt every frame
 * rather than cached because inserting 410 structures twice is nothing against
 * what it saves, and a cache would have to be invalidated by walking, lifting,
 * discharging and the king's appetite — four places to forget.
 */
interface Near {
  cell: number;
  grid: Map<number, Structure[]>;
}

function indexStructures(ss: readonly Structure[]): Near {
  let cell = 40e-6;
  for (const s of ss) cell = Math.max(cell, s.reach * 2.1);
  const grid = new Map<number, Structure[]>();
  for (const s of ss) {
    const key = (Math.floor(s.x / cell) + KEY_ORIGIN) * KEY_STRIDE
      + (Math.floor(s.y / cell) + KEY_ORIGIN);
    const at = grid.get(key);
    if (at) at.push(s);
    else grid.set(key, [s]);
  }
  return { cell, grid };
}

/** Fills `out` with the structures that could reach (x, y). Reuses the array,
 *  because this is called once per entity per pass per frame. */
function nearStructures(ix: Near, x: number, y: number, out: Structure[]): Structure[] {
  out.length = 0;
  const cx = Math.floor(x / ix.cell);
  const cy = Math.floor(y / ix.cell);
  for (let ox = -1; ox <= 1; ox++) {
    for (let oy = -1; oy <= 1; oy++) {
      const at = ix.grid.get((cx + ox + KEY_ORIGIN) * KEY_STRIDE + (cy + oy + KEY_ORIGIN));
      if (at) for (const s of at) out.push(s);
    }
  }
  return out;
}

/**
 * How wide a catch each of a building's arm tips has, as a fraction of its
 * holding radius.
 *
 * Exported for the reason LOBE_ARC and LOBE_RANGE were: the surface has to draw
 * the same region the rule is computed in. That comment says the player "was
 * shown a forty-micron stub and handed a three-hundred-micron gun"; this is the
 * same fault the other way round — an arm tip is drawn as a dot two pixels
 * across and binds anything inside twenty microns of it.
 *
 * It matters now in a way it did not before. A bubble cavity concentrates what
 * the water is carrying into a POINT, and a building holds along a RING of arm
 * tips, so whether a structure at a cavity farms or does nothing comes down to
 * whether one tip lands on the core. Measured, both at the same cavity with the
 * player idle on the far side of the channel for two minutes: a tip on the core
 * makes six cells, a tip fifty microns off makes none. That is a real decision
 * and it was invisible.
 */
export const HOLD_CATCH = 0.55;

/** True if this point is inside some structure's holding field. The hold points
 *  are computed inline rather than through `holdPoints`, which allocates an
 *  array per structure and was being called once per motif per frame. */
function underStructure(
  ix: Near, scratch: Structure[], x: number, y: number, layer: number,
): boolean {
  for (const s of nearStructures(ix, x, y, scratch)) {
    if (!s.serves.includes(layer)) continue;
    const catchR = s.reach * HOLD_CATCH;
    for (const [lx, ly] of s.lobes) {
      const hx = s.x + lx * s.reach - x;
      const hy = s.y + ly * s.reach - y;
      if (Math.hypot(hx, hy) < catchR) return true;
    }
  }
  return false;
}

/**
 * Everything within binding distance, without asking every pair.
 *
 * Two motifs can only bind inside BIND_RADIUS, so a grid of exactly that pitch
 * puts every possible partner in the nine cells around a mote and nowhere else.
 * The pairwise sweep this replaces was the whole reason the suspension had to
 * be capped: it was O(n^2), and at the 636 motifs a full channel asks for it
 * cost 8.5 ms a frame against a 16.7 ms budget. It is O(n) now and the cap is
 * gone, so the water carries the concentration it should.
 *
 * Order is preserved exactly — a mote still partners with the nearest candidate
 * of HIGHER index — because a merge consumes one of the pair and which one it
 * consumes decides where the survivor ends up. Same answer, less asking.
 */
function neighbourhood(ms: readonly Entity[]): Map<number, number[]> {
  const grid = new Map<number, number[]>();
  for (let i = 0; i < ms.length; i++) {
    const key = cellKey(ms[i].x, ms[i].y);
    const at = grid.get(key);
    if (at) at.push(i);
    else grid.set(key, [i]);
  }
  return grid;
}

/**
 * Which grid square a point is in, as one number.
 *
 * Multiplied rather than bit-shifted on purpose: a shift in JS is 32-bit
 * signed, and the offset that keeps negative coordinates in range would push
 * this past 2^31 and wrap. The channel is a couple of hundred squares across,
 * so the product stays small enough to be an exact integer in a double.
 */
const KEY_ORIGIN = 32768;
const KEY_STRIDE = 65536;
function cellKey(x: number, y: number): number {
  const cx = Math.floor(x / BIND_RADIUS) + KEY_ORIGIN;
  const cy = Math.floor(y / BIND_RADIUS) + KEY_ORIGIN;
  return cx * KEY_STRIDE + cy;
}

function mergePass(run: Run, dt: number): void {
  const ms = run.entities.filter((e) => e.faction === "motif");
  const gripping = handed(run.you);
  const gone = new Set<number>();
  const grid = neighbourhood(ms);
  const ix = indexStructures(run.structures);
  const scratch: Structure[] = [];

  for (let i = 0; i < ms.length; i++) {
    const a = ms[i];
    if (gone.has(a.id)) continue;
    let best: Entity | null = null;
    let bestR = BIND_RADIUS;
    const cx = Math.floor(a.x / BIND_RADIUS);
    const cy = Math.floor(a.y / BIND_RADIUS);
    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        const at = grid.get((cx + ox + KEY_ORIGIN) * KEY_STRIDE + (cy + oy + KEY_ORIGIN));
        if (!at) continue;
        for (const j of at) {
          if (j <= i) continue;                      // the same pair, once
          const b = ms[j];
          if (gone.has(b.id)) continue;
          if (!together(a.layer, b.layer)) continue; // not in the same trap at all
          const r = Math.hypot(a.x - b.x, a.y - b.y);
          if (r < bestR) { bestR = r; best = b; }
        }
      }
    }
    if (!best) { a.dwell = 0; a.partner = -1; continue; }

    // A structure holds them together as well as your hand does. This is why
    // building is worth anything: what you left standing keeps working.
    const bound = gripping || underStructure(ix, scratch, a.x, a.y, a.layer);
    if (!bound) { a.dwell = 0; a.partner = -1; continue; }

    const asm = assemble([...a.parts, ...best.parts]);
    if (!asm.group && !asm.partial) {
      if (a.flash <= 0) {
        a.flash = 0.45; best.flash = 0.45;
        run.events.push({
          kind: "refuse", x: (a.x + best.x) / 2, y: (a.y + best.y) / 2,
          text: asm.refusal ?? "unknown",
        });
      }
      const dx = a.x - best.x, dy = a.y - best.y, r = Math.hypot(dx, dy) || 1e-9;
      a.x += (dx / r) * 7e-6; a.y += (dy / r) * 7e-6;
      best.x -= (dx / r) * 7e-6; best.y -= (dy / r) * 7e-6;
      a.dwell = 0; a.partner = -1;
      continue;
    }

    if (a.partner === best.id) a.dwell += dt;
    else { a.partner = best.id; a.dwell = dt; }

    if (a.dwell >= BIND_DWELL) {
      a.parts = [...a.parts, ...best.parts];
      a.x = (a.x + best.x) / 2; a.y = (a.y + best.y) / 2;
      a.dwell = 0; a.partner = -1; a.flash = 0.4;
      gone.add(best.id);
      run.events.push({ kind: "merge", x: a.x, y: a.y });
    }
  }
  if (gone.size) run.entities = run.entities.filter((e) => !gone.has(e.id));
}

function crystallise(run: Run): void {
  const keep: Entity[] = [];
  for (const e of run.entities) {
    if (e.faction !== "motif") { keep.push(e); continue; }
    const asm = assemble(e.parts);
    if (asm.crystallises && asm.group) {
      run.cells.push(cellFor(asm.group));
      run.built++;
      run.score += 6;
      run.wave.stamina = 100;
      run.wave.spent = false;
      run.events.push({ kind: "crystal", x: e.x, y: e.y, group: asm.group });
    } else {
      keep.push(e);
    }
  }
  run.entities = keep;
}

// ── building ────────────────────────────────────────────────────────────────

/**
 * Recompute the dispersion of what you have built.
 *
 * Called whenever the set of structures changes and never otherwise: a
 * plane-wave expansion is sixty milliseconds, which is nothing on the frame you
 * place a building and impossible sixty times a second.
 */
/**
 * The lattice everything you build sits on, m.
 *
 * It is the spacing this water's bound field needs, so a properly made body and
 * a freed field stop being two problems. They were only ever two because the
 * placements were freehand and the player had to hit a twenty-micron band by
 * hand, twenty-six times, while being hunted.
 */
export function latticePitch(run: Run): number {
  return run.spacing ? (run.spacing.lo + run.spacing.hi) / 2 : run.world.pitch * 1.3;
}

/**
 * Recompute what is joined to what, without asking about dispersion.
 *
 * A body that WALKS keeps its spacing, so its band structure is unchanged and
 * there is no reason to spend sixty milliseconds finding that out again. Only a
 * change of shape needs the full retune.
 */
export function reshape(run: Run): void {
  const pitch = latticePitch(run);
  run.bodies = bodiesOf(run.structures, pitch);
  run.opened = Math.max(run.opened, run.bodies[0]?.cells.length ?? 0);
  run.bounds = boundsFor(run.ebb ? (run.bodies[0]?.cells.length ?? 0) : run.opened);
  for (const b of run.bodies) {
    const zs = reaches(b, pitch);
    for (const c of b.cells) c.serves = zs;
  }
}

/**
 * Organisms walking.
 *
 * A body big enough to work on its own follows you, one lattice site at a time,
 * along a direction its own symmetry has. It moves by having the lattice swept
 * under it, so its pace is set by trajectory.maxSweepSpeed at the drive its
 * furthest cell can actually feel — which means it only walks while you are
 * standing among it, and a big organism is slower than a small one because the
 * far end of a big one is always in weak field.
 *
 * A step is refused rather than half-taken. Every cell must have somewhere to
 * land: inside the arena, not on another body, not on the throne. A body that
 * cannot put all of itself down does not move, because a body that leaves part
 * of itself behind is not walking.
 */
function walkBodies(run: Run, dt: number): void {
  const pitch = latticePitch(run);
  let moved = false;

  for (const body of run.bodies) {
    if (!autonomous(body)) continue;

    const v = walkSpeed(body, run.wave);
    if (!(v > 0)) continue;

    const lead = body.cells[0];
    lead.gait += v * dt;
    if (lead.gait < pitch) continue;
    lead.gait = 0;

    const dir = gaitDirection(body, run.you.x, run.you.y);
    if (!dir) continue;

    // IT KEEPS A SITE CLEAR, MEASURED FROM ITS NEAREST CELL.
    //
    // Following to within one site of the player meant a large organism stood
    // on every lattice site around them and building stopped working. Measuring
    // the clearance from the body's CENTRE instead was worse and in the other
    // direction: a twelve-cell body has an extent of two hundred microns, so it
    // had to hang back four hundred and thirty — which is the far edge of what
    // the sweep can reach, and it stopped walking at all. Six hundred and twenty
    // steps in one run became three in the next.
    //
    // What has to stay clear is the ground around YOU, and that is one site
    // from whichever cell is nearest, whatever the size of the thing it belongs
    // to.
    // The rule is on the DESTINATION, not on where it is standing now: asked
    // before the step it walks from one and eight tenths of a site to nought
    // and eight, which is exactly the ground it was supposed to leave alone.

    const dx = Math.round(dir[0]) * pitch;
    const dy = Math.round(dir[1]) * pitch;
    if (dx === 0 && dy === 0) continue;

    const mine = new Set(body.cells);
    const ok = body.cells.every((c) => {
      const nx = c.x + dx, ny = c.y + dy;
      if (Math.hypot(nx - run.you.x, ny - run.you.y) < pitch * 1.2) return false;
      const b = run.bounds;
      if (nx < b.x || nx > b.x + b.w || ny < b.y || ny > b.y + b.h) return false;
      if (onThrone(run, nx, ny)) return false;
      return !run.structures.some(
        (o) => !mine.has(o) && o.layer === c.layer
          && Math.hypot(o.x - nx, o.y - ny) < pitch * 0.5);
    });
    if (!ok) continue;

    for (const c of body.cells) { c.x += dx; c.y += dy; }
    run.events.push({ kind: "step", x: body.x + dx, y: body.y + dy, cells: body.cells.length });
    moved = true;
  }

  if (moved) reshape(run);
}

export function retune(run: Run): void {
  const was = catches(run.gap, run.bound.omega);
  run.crystal = crystalOf(run.structures, run.world.medium);
  run.gap = gapOf(run.crystal);
  const pitch = latticePitch(run);
  run.bodies = bodiesOf(run.structures, pitch);
  run.opened = Math.max(run.opened, run.bodies[0]?.cells.length ?? 0);
  run.bounds = boundsFor(run.ebb ? (run.bodies[0]?.cells.length ?? 0) : run.opened);

  // WHAT A LEG IS FOR. A body that hangs a limb onto another plane can work
  // there, and every cell of it can — which is the first thing an organism does
  // that a heap of separate buildings cannot.
  for (const b of run.bodies) {
    const zs = reaches(b, pitch);
    for (const c of b.cells) c.serves = zs;
  }
  const now = catches(run.gap, run.bound.omega);
  if (now !== was) run.events.push({ kind: "tuned", caught: now });
}

/**
 * Step the channel to another harmonic.
 *
 * The only thing that moves a trapped body in z. There is no swimming up: a
 * positive-contrast body sits on a node and stays there, so the way to a
 * different height is to put the node somewhere else — which moves EVERY plane
 * in the fluid and hands every body on one to whichever new plane is nearest.
 * It is a real manoeuvre on a real device and it moves the whole world, which
 * is what makes it a decision rather than a jump button.
 */
export function retuneChannel(run: Run, mode: number): boolean {
  const want = Math.max(1, Math.min(MAX_MODE, Math.round(mode)));
  if (want === run.world.mode) return false;

  const zOf = (layer: number) => planes(run.world.mode)[
    Math.max(0, Math.min(planes(run.world.mode).length - 1, layer))];

  const move = (layer: number) => reseat(zOf(layer), want);
  run.layer = move(run.layer);
  for (const e of run.entities) e.layer = move(e.layer);
  for (const s of run.structures) s.layer = move(s.layer);

  run.world.mode = want;
  run.events.push({ kind: "retune", mode: want, layer: run.layer });
  return true;
}

/**
 * The water at a point.
 *
 * A channel carries several fluids at once, side by side, not mixing — laminar
 * co-flow, which is how acoustofluidic separation is actually done. So the
 * medium is a function of WHERE YOU ARE, and since every question in this game
 * is the sign of a contrast factor against the medium, so is every answer.
 */
export function waterAt(run: Run, y: number): Medium {
  return mediumAt(run.world.medium, y, CHANNEL_H);
}

/** Which stream, for the surface and for saying where you are. */
export function streamOf(y: number): number {
  return streamAt(y, CHANNEL_H);
}

/** The same field, computed for a different fluid. */
function inWater(w: Wave, medium: Medium): Wave {
  return w.medium === medium ? w : { ...w, medium };
}

export const THRONE_RADIUS = 30e-6;

/**
 * Where the next throne stands.
 *
 * NOT THE MIDDLE OF THE CHANNEL. It was the middle in every aeon — literally
 * `START + ARENA/2`, which is the channel's exact centre — so the one place the
 * whole game converges on was the one place with no name. The chip is the only
 * thing here that outlives a world, and it was somewhere you COULD go and never
 * had to. A landmark nobody is made to visit is scenery.
 *
 * So the throne stands at the landmark nearest to WHERE THE LAST KING FELL.
 * Nothing about that is seeded: you chose it two phases ago by where you
 * finished the fight, and it is checkable afterwards, which is the difference
 * between a decision and a surprise. The first aeon has no last king and starts
 * in the middle — which is also the only water a player who has built nothing
 * can reach, and the clearance in chip.ts exists to keep that opening minute
 * free of weather.
 *
 * WHAT THIS COSTS THE KING, deliberately. A throne at a bubble cavity puts the
 * sovereign in the vortex, standing in the one place the water gathers — so the
 * farm you left there is now inside the 150 um it eats buildings from, and a
 * cavity stops being free. A throne at a sharp edge puts the fight in 360 um/s
 * of moving water. Neither is a rule that had to be written; both are what
 * happens when the fight is moved somewhere that already had physics.
 *
 * Only features in water you have actually opened are eligible. The site is
 * then clamped a throne's radius inside the pool, because a cavity mouth is ON
 * the wall and a throne has to be stood on to be fed.
 */
export function throneSite(
  run: Run, fellX: number, fellY: number,
): { x: number; y: number } {
  const b = run.bounds;
  let best: Feature | null = null;
  let bestR = Infinity;
  for (const f of CHIP) {
    if (f.x < b.x || f.x > b.x + b.w || f.y < b.y || f.y > b.y + b.h) continue;
    const r = Math.hypot(f.x - fellX, f.y - fellY);
    if (r < bestR) { bestR = r; best = f; }
  }
  if (!best) return { x: CHANNEL_W / 2, y: CHANNEL_H / 2 };
  const m = THRONE_RADIUS;
  return {
    x: Math.min(Math.max(best.x, b.x + m), b.x + b.w - m),
    y: Math.min(Math.max(best.y, b.y + m), b.y + b.h - m),
  };
}

export function onThrone(run: Run, x: number, y: number): boolean {
  return Math.hypot(x - run.throne.x, y - run.throne.y) < THRONE_RADIUS;
}

export type PlaceResult = "placed" | "none" | "too-close" | "occupied" | "wrong-phase";
export type FeedResult = "fed" | "none" | "off-throne" | "wrong-phase";

/**
 * Put a cell into the throne. Irreversible, and the decision the game is about.
 *
 * IT USED TO BE THE SAME BUTTON AS BUILDING, told apart by where you happened
 * to be standing — and the throne sits at the centre of the arena, which is
 * exactly where a player builds. The first run to reach it fed fifty-one cells
 * and placed twenty-five, crowned a sovereign with three thousand eight hundred
 * hit points, and could not have killed it with a hundred and nineteen perfect
 * discharges. Two thirds of that player's work went into the throne by accident
 * and nothing said a word about it.
 *
 * An action you cannot undo does not share a button with the one you do sixty
 * times a run.
 */
export function feedThrone(run: Run, index: number): FeedResult {
  if (run.phase !== "settle") return "wrong-phase";
  const c = run.cells[index];
  if (!c) return "none";
  if (!onThrone(run, run.you.x, run.you.y)) return "off-throne";

  feed(run.throne, c);
  run.cells.splice(index, 1);
  run.events.push({ kind: "fed", group: c.group.hm });
  return "fed";
}

/**
 * How many aligned discharges of what you are holding and standing on would be
 * needed to bring down what you have fed the throne so far.
 *
 * The number the player needs BEFORE they crown it, in the only terms that
 * matter. Infinity when there is nothing to do it with.
 */
export function dischargesToKill(run: Run): number {
  const best = Math.max(
    0,
    ...run.structures.map((s) => s.strength),
    ...run.cells.map((c) => structureFrom(-1, c.group.hm, 0, 0).strength),
  );
  if (best <= 0) return Infinity;
  // HOW MANY MORE. While you are feeding the throne this is a forecast and the
  // full bar is the right question; once it is awake it is a fight, and the
  // right question is what is left. It used to answer with maxHp in both cases,
  // so a player who had ground a 270 hp king down to 82 — one discharge from
  // killing it — was still being told THREE, which is the difference between a
  // fight you are winning and one you cannot see the end of.
  const left = run.throne.awake ? Math.max(0, run.throne.hp) : run.throne.maxHp;
  // AT THE MUZZLE. Damage falls off across an arm, so this is the count if you
  // land them on top of the king rather than at the far edge of a cone — which
  // is the number worth showing, because it is the one you can achieve.
  return Math.ceil(left / (best * DISCHARGE_GAIN));
}

/** Put a cell on the ground. It never feeds — that is its own verb now. */
export function placeCell(run: Run, index: number): PlaceResult {
  if (run.phase !== "settle" && run.phase !== "reign") return "wrong-phase";
  const c = run.cells[index];
  if (!c) return "none";

  if (onThrone(run, run.you.x, run.you.y)) return "too-close";

  // ON THE LATTICE, not where you were standing. A crystal is a lattice and a
  // motif; freehand placements are a heap.
  const at = snap(run.you.x, run.you.y, latticePitch(run));
  const b = run.bounds;
  if (at.x < b.x || at.x > b.x + b.w || at.y < b.y || at.y > b.y + b.h) return "too-close";
  for (const s of run.structures) {
    if (Math.hypot(s.x - at.x, s.y - at.y) < latticePitch(run) * 0.5) return "occupied";
  }
  const s = structureFrom(run.nextId++, c.group.hm, at.x, at.y, run.layer);
  run.structures.push(s);
  run.cells.splice(index, 1);
  run.score += s.strength * 2;
  run.events.push({ kind: "place", x: s.x, y: s.y, group: s.hm });
  retune(run);
  return "placed";
}

export type LiftResult = "lifted" | "nothing-there" | "wrong-phase";

/** How near a building you must be to take it back up, m. */
export const LIFT_RADIUS = 46e-6;

/**
 * Take a building back into your hand.
 *
 * Your trap can hold a body — that is the whole game — and a placed cell is a
 * body. There was never a reason you could put one down and not pick it up
 * again, and without it a mistake was permanent: a cell on the wrong site
 * stayed on the wrong site, and a crystal at the wrong spacing could only be
 * fixed by discharging your own buildings at nothing.
 *
 * It comes back as the cell it was, so nothing is lost but the time. The
 * skeleton redissolves; the lattice does not care.
 */
export function liftCell(run: Run): LiftResult {
  if (run.phase !== "settle" && run.phase !== "reign") return "wrong-phase";

  let best: Structure | null = null;
  let bestD = LIFT_RADIUS;
  for (const s of run.structures) {
    if (!together(s.layer, run.layer)) continue;
    const d = Math.hypot(s.x - run.you.x, s.y - run.you.y);
    if (d < bestD) { bestD = d; best = s; }
  }
  if (!best) return "nothing-there";

  run.structures = run.structures.filter((s) => s !== best);
  run.cells.push(cellFor(best.hm));
  run.events.push({ kind: "lift", x: best.x, y: best.y, group: best.hm });
  retune(run);
  return "lifted";
}

export type CrownResult = "crowned" | "nothing-fed" | "wrong-phase";

/** Wake what you made. */
export function crown(run: Run): CrownResult {
  if (run.phase !== "settle") return "wrong-phase";
  if (run.throne.fed.length === 0) return "nothing-fed";
  run.throne.awake = true;
  run.phase = "reign";
  run.spawnIn = 2;
  run.events.push({ kind: "crown", group: run.throne.hm, mass: run.throne.mass });
  return "crowned";
}

/** How long a structure takes to charge, seconds. Bigger takes longer. */
/**
 * The fastest water this chip can make, m/s.
 *
 * Bulk streaming at the amplifier's ceiling times the sharp-edge ratio, which
 * is the flow right at a tip at full drive. Derived from the two figures that
 * already exist rather than measured off the geometry, so it cannot drift away
 * from them.
 */
const CHIP_FASTEST = streamingSpeed(MAX_AMPLITUDE) * EDGE_GAIN;

export function chargeTime(s: Structure): number {
  return 0.55 + s.strength * 0.075;
}

/**
 * Drive whatever structure your hand is on.
 *
 * Only while a king is awake — otherwise every pass over your own buildings
 * while gathering would burn them down. A full charge discharges along the
 * structure's own lobe directions and the structure is consumed.
 */
function driveStructures(run: Run, dt: number): void {
  if (run.phase !== "reign") {
    for (const s of run.structures) s.charge = Math.max(0, s.charge - dt * 0.6);
    return;
  }
  const driving = handed(run.you);
  const spent: Structure[] = [];

  const k = run.throne;
  const hunting = k.awake && k.hp > 0;

  for (const s of run.structures) {
    const near = Math.hypot(s.x - run.you.x, s.y - run.you.y) < DRIVE_RADIUS;
    if (driving && near) {
      s.charge = Math.min(1, s.charge + dt / chargeTime(s));
      // IT WAITS FOR A TARGET. This used to fire the instant the charge filled,
      // bearing or nothing — so a building you had held for a second and a half
      // was spent into empty water if the king stepped out of the arm while it
      // charged. A report came back with six discharges and two hits, 81
      // buildings standing, and a king at 549 of 830.
      //
      // Measured on that layout: only four of 81 buildings bear on the king at
      // any moment, and at 44 per cent of the positions it can stand in NOTHING
      // does. Against those odds, firing on a timer is not a skill test, it is
      // a coin toss that costs a building either way.
      //
      // This module already says what the rule was meant to be — "a building
      // cannot be aimed, so the only thing that can be aimed is the KING". A
      // loaded building holding until the king is in front of it IS that rule.
      // Letting go still drops the charge, so it cannot be banked.
      if (s.charge >= 1 && (!hunting || bearsOn(s, k.x, k.y))) spent.push(s);
    } else {
      // WHAT THE GLASS DOES TO IT. A building standing in a tip jet is being
      // worked on by water that YOU drove — chip.ts: "it is powered by your
      // drive", and streaming is the second-order flow of the same field — only
      // from somewhere you are not. So the water holds a charge in it, and a
      // building in the wall lanes is a rack that is already most of the way
      // there when you arrive.
      //
      // Normalised against the fastest water this chip can make, which is a
      // ratio of like to like rather than a new number: at a tip at full drive
      // it is one, eighty microns down the plume it is 0.79, and out at the end
      // of the reach it is nothing.
      //
      // IT NEVER FIRES ON ITS OWN. Discharging is still `driving && near` and
      // only that. A building that spent itself because it was standing in a
      // current would be spending it at whatever happened to be in front of it,
      // which is nothing you decided — and this game does not have anything
      // that goes off by itself.
      const f = chipFlow(run, s.x, s.y);
      const held = Math.min(1, Math.hypot(f.x, f.y) / CHIP_FASTEST);
      s.charge = Math.max(held, s.charge - dt * 0.35);
    }
  }
  for (const s of spent) discharge(run, s);
}

/**
 * The shape of what a building covers: half-angle of a lobe, and how far it
 * carries as a multiple of the structure's own holding radius.
 *
 * These were buried constants and the surface did not know them, so it drew
 * each building's arms out to its HOLDING radius — about forty microns — while
 * they actually reach seven times that. The player was shown a stub and given a
 * three-hundred-micron gun, which makes the one decision in the fight (where
 * the king is standing) unreadable. They are exported now because the renderer
 * has to draw the same cone the damage is computed in.
 */
export const LOBE_ARC = 0.55;
export const LOBE_RANGE = 7;
/** And how far the same discharge scours the wildlife. */
export const LOBE_SCOUR = 4;
/**
 * Damage per group-order, per arm that finds the king, AT THE BUILDING ITSELF.
 *
 * It used to be flat across the whole arm — the same 8 at three hundred microns
 * as at three — which made distance mean nothing and made "walk the king into
 * your arms" a binary rather than an aim. Now the arm falls off (see
 * `dischargeFalloff`) and this is what it is worth at the muzzle, so it is
 * doubled from the flat 8 it replaced: point blank is twice what it was, the
 * two are equal at 29 per cent of the arm's reach, and beyond that a shot is
 * worse than it used to be. Getting the king ONTO a building, rather than
 * merely somewhere in its cone, is now the difference.
 */
export const DISCHARGE_GAIN = 16;

/**
 * How much of a discharge survives the distance to the king, 0..1.
 *
 * The same shape `chip.ts` uses for a tip jet's plume — squared, so it reaches
 * the end of its arm with zero slope and there is no line in the water where
 * the damage switches off. Reusing that curve rather than inventing a second
 * one is the point: this repository has one falloff and it is that one.
 */
export function dischargeFalloff(s: Structure, x: number, y: number): number {
  const range = s.reach * LOBE_RANGE;
  const r = Math.hypot(x - s.x, y - s.y);
  if (r >= range) return 0;
  const k = 1 - r / range;
  return k * k;
}

/**
 * Does one of this building's arms point at (x, y) from where it stands?
 *
 * The same test `discharge` makes, exported so the surface can draw the cones
 * and light the one that is live. A building cannot be aimed — its arms are its
 * group's own directions and they were fixed when you placed it — so the only
 * thing that can be aimed is the KING, and this is the function that says
 * whether you have finished aiming it.
 */
export function bearsOn(s: Structure, x: number, y: number): boolean {
  const dx = x - s.x, dy = y - s.y;
  if (Math.hypot(dx, dy) > s.reach * LOBE_RANGE) return false;
  const toward = Math.atan2(dy, dx);
  for (const [lx, ly] of s.lobes) {
    let d = Math.abs(Math.atan2(ly, lx) - toward);
    while (d > Math.PI) d = Math.abs(d - Math.PI * 2);
    if (d < LOBE_ARC) return true;
  }
  return false;
}

/**
 * A structure spends itself.
 *
 * It fires along the in-plane directions of its own group, so where you built
 * decides what you can hit: a two-lobed 222 is a line and has to be lined up,
 * a sixfold 622 covers the compass and barely has to be aimed. Damage is the
 * group order per arm that finds the king.
 */
export function discharge(run: Run, s: Structure): number {
  run.structures = run.structures.filter((x) => x !== s);
  retune(run);
  const k = run.throne;
  let damage = 0;

  if (k.awake && k.hp > 0) {
    const toKing = Math.atan2(k.y - s.y, k.x - s.x);
    const range = s.reach * LOBE_RANGE;
    if (Math.hypot(k.x - s.x, k.y - s.y) < range) {
      const fall = dischargeFalloff(s, k.x, k.y);
      for (const [dx, dy] of s.lobes) {
        const a = Math.atan2(dy, dx);
        let d = Math.abs(a - toKing);
        while (d > Math.PI) d = Math.abs(d - Math.PI * 2);
        if (d < LOBE_ARC) damage += Math.round(s.strength * DISCHARGE_GAIN * fall);
      }
    }
  }

  // it also scours the beasts standing in its arms
  const reach = s.reach * LOBE_SCOUR;
  for (const e of [...run.entities]) {
    if (e.faction !== "beast") continue;
    const r = Math.hypot(e.x - s.x, e.y - s.y);
    if (r > reach) continue;
    const a = Math.atan2(e.y - s.y, e.x - s.x);
    for (const [dx, dy] of s.lobes) {
      let d = Math.abs(Math.atan2(dy, dx) - a);
      while (d > Math.PI) d = Math.abs(d - Math.PI * 2);
      if (d < LOBE_ARC) { kill(run, e); break; }
    }
  }

  if (damage > 0) {
    k.hp = Math.max(0, k.hp - damage);
    run.events.push({ kind: "sovereign-hit", x: k.x, y: k.y });
  }
  run.events.push({ kind: "discharge", x: s.x, y: s.y, group: s.hm, damage });
  if (k.awake && k.hp <= 0) birth(run);
  return damage;
}

// ── the reign ───────────────────────────────────────────────────────────────

const BOLT_SPEED = 2.4e-4;
const BOLT_LIFE = 3.4;

/** How long the king's arms are visible before they are thrown. */
export const VOLLEY_WIND = 0.55;

/**
 * Damage a second from holding the king in your bare hand.
 *
 * EVERYTHING IN THIS GAME DIES BY BEING HELD. That is the one rule the whole
 * bestiary runs on, and the sovereign was outside it for no better reason than
 * not being an Entity — which left a state with no path out of it at all: your
 * buildings are the only thing that hurt it, it EATS your buildings, and a
 * player who ran out was not in a hard fight, they were in an unwinnable one
 * while still alive. That is a worse thing to ship than a difficult boss.
 *
 * IT IS NOT TESTED THE WAY A VESICLE IS, AND THE REASON IS ITS SIZE. Being
 * caught means sitting inside one well, and a sovereign does not fit in one: it
 * is thirty-eight microns across against a node-to-antinode distance of
 * forty-four, so it spans very nearly the whole lattice and no single trap can
 * close on it. Put it through run.capturedAt and it is held three per cent of
 * the time by a player doing everything right, which is not a mechanic, it is a
 * coincidence. What can be said about a body bigger than the field's own
 * structure is only that the drive is working on it — so that is what is asked:
 * is it inside your concentrated hand at all.
 *
 * It is a poor way to kill something. It is done from inside the reach of its
 * own volley with nothing between you, and against anything but the smallest
 * king it is far slower than one building. A last resort that reads as one.
 *
 * HOW FAST IT IS, IS NEUMANN'S PRINCIPLE AGAIN. Two a second for each
 * independent piezoelectric component the king's own group is allowed — which
 * is the number of distinct ways a field can drive that symmetry at all. Order
 * and freedom pull against each other exactly, so a 222 has three components
 * and wears at six a second, a 622 has one and wears at two, and a 432 has none
 * and does not wear at all.
 *
 * The richer the thing you crowned, the less your hand can do to it. So the
 * trade the whole game is about survives its own last resort, and `anchored`
 * stops being an exception — it is this formula at zero. Nothing was balanced
 * to make either of those true.
 */
export const WEAR_PER_COMPONENT = 2;

/** Damage a second your hand does to this king, and it may well be none. */
export function wearRate(k: Sovereign): number {
  if (k.hm === "") return 0;
  return WEAR_PER_COMPONENT * cellFor(k.hm).freedom;
}

/** Is your hand on it right now? One source of truth, because the surface has
 *  to draw exactly the condition the damage is applied under. */
export function wearing(run: Run): boolean {
  const k = run.throne;
  return run.phase === "reign" && k.awake && k.hp > 0 && wearRate(k) > 0
    && localAmplitude(run.wave, k.x, k.y) >= HOLD_PRESSURE;
}

function reign(run: Run, dt: number): void {
  const k = run.throne;

  // Its volleys turn, so the gaps cannot be camped — but the spin STOPS while
  // it is winding up. A telegraph that is still rotating is not a telegraph, it
  // is a rumour: the arms you were shown have to be the arms it throws.
  const winding = k.beat <= VOLLEY_WIND;
  if (!winding) k.spin += dt * 0.55;

  // it drags itself toward you, and plants itself to throw
  const hx = run.you.x - k.x, hy = run.you.y - k.y;
  const r = Math.hypot(hx, hy) || 1e-12;
  const sp = sovereignSpeed(k) * (winding ? 0.2 : 1);
  let dx = (hx / r) * sp;
  let dy = (hy / r) * sp;

  // And the field acts on it, because it is a body in water like anything else
  // — unless you fed it something with no handle on it.
  //
  // Inertia is applied as a SHORTER STEP rather than a scaled velocity. They
  // are the same number in the limit, but a king is nineteen microns across and
  // its drift is stiff enough to ring at sixty frames a second, so it has to go
  // through the same substepping every other body does or it vibrates in place
  // instead of being drawn in.
  if (!k.anchored) {
    const moved = advance(run.wave, k.x, k.y, sovereignParticle(k), dt / sovereignInertia(k));
    dx += (moved.x - k.x) / dt;
    dy += (moved.y - k.y) / dt;
  }
  const kb = run.bounds;
  k.x = Math.max(kb.x + 30e-6, Math.min(kb.x + kb.w - 30e-6, k.x + dx * dt));
  k.y = Math.max(kb.y + 30e-6, Math.min(kb.y + kb.h - 30e-6, k.y + dy * dt));

  // YOUR HAND, WHICH IS THE LAST THING YOU HAVE. Worked on by the drive like
  // anything else in the water, it comes apart — slowly, and only if you gave
  // it a handle to be held by.
  if (wearing(run)) {
    k.hp = Math.max(0, k.hp - wearRate(k) * dt);
    if (run.rand() < dt * 6) run.events.push({ kind: "wearing", x: k.x, y: k.y });
    if (k.hp <= 0) { birth(run); return; }
  }

  // it eats what you built
  if (run.structures.length > 0 && run.rand() < dt * 0.075) {
    let victim = run.structures[0];
    let vr = Infinity;
    for (const s of run.structures) {
      const d = Math.hypot(s.x - k.x, s.y - k.y);
      if (d < vr) { vr = d; victim = s; }
    }
    if (vr < 150e-6) {
      run.structures = run.structures.filter((s) => s !== victim);
      const before = k.hp;
      k.hp = Math.min(k.maxHp, k.hp + victim.strength * 3);
      // The heal goes on the event because the surface has to SAY it. A report
      // came back with one discharge landed for 96 and four buildings eaten for
      // 144, and the player watched their only good hit disappear off a bar
      // that refilled without comment.
      run.events.push({ kind: "devour", x: victim.x, y: victim.y, heal: k.hp - before });
      retune(run);
    }
  }

  // volleys, in the shape of its own group
  if (k.beat > VOLLEY_WIND && k.beat - dt <= VOLLEY_WIND) {
    run.events.push({ kind: "aiming", x: k.x, y: k.y, arms: volley(k).length });
  }
  k.beat -= dt;
  if (k.beat <= 0) {
    k.beat = cadence(k);
    const arms = volley(k);
    for (const [dx, dy] of arms) {
      run.bolts.push({
        x: k.x, y: k.y, vx: dx * BOLT_SPEED, vy: dy * BOLT_SPEED,
        life: BOLT_LIFE, born: run.t,
      });
    }
    run.events.push({ kind: "volley", x: k.x, y: k.y, arms: arms.length });
  }

  for (const b of run.bolts) {
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
  }
  run.bolts = run.bolts.filter(
    (bo) => bo.life > 0 && bo.x > run.bounds.x - 20e-6 && bo.x < run.bounds.x + run.bounds.w + 20e-6
      && bo.y > run.bounds.y - 20e-6 && bo.y < run.bounds.y + run.bounds.h + 20e-6);
}

// ── being hit ───────────────────────────────────────────────────────────────

const TOUCH = 17e-6;
const BOLT_TOUCH = 13e-6;

function contact(run: Run, dt: number): void {
  const w = run.wave;
  let bite = 0;
  let drain = 0;
  let struck = false;
  let volleyed = false;

  // AT YOUR BODY, NOT AT YOUR TRAP. This was still measuring from run.aim, which
  // is the node a quarter pitch ahead of you in whatever direction you are
  // driving — a leftover from when the player WAS the cursor. Everything in the
  // water hunts run.you and was landing its hits on somewhere you are not, up
  // to twenty-two microns off and moving with the stick. It is exactly the kind
  // of thing that makes dying feel arbitrary and unreportable.
  for (const e of run.entities) {
    if (e.faction !== "beast") continue;
    if (e.held > 0) continue;   // a body you have hold of is not free to reach you
    const b = beast(e.species);
    if (!together(e.layer, run.layer)) continue;   // tens of microns apart in z
    if (Math.hypot(e.x - run.you.x, e.y - run.you.y) < TOUCH + particleOf(e).radius) {
      e.flash = 0.3;
      // ALL DAMAGE IS TELEGRAPHED, and this is where that was still untrue. A
      // hunter hurt you by being NEAR you, which is not something you can read
      // or answer — and since anything sharing your contrast is drawn into your
      // node by your own drive, gathering quietly filled your lap with things
      // that damaged you for existing. The first real run reported six of seven
      // hits taken that way and one from an actual strike.
      //
      // The strike is the attack. Outside it a hunter is a body in the water
      // and it shoves you, which is what a body in the water does.
      if (b.damage > 0) {
        if (e.strike > 0) { bite += b.damage; struck = true; }
      } else drain += b.drain;
    }
  }

  for (const b of run.bolts) {
    if (Math.hypot(b.x - run.you.x, b.y - run.you.y) < BOLT_TOUCH) {
      bite += 1; b.life = 0; volleyed = true;
    }
  }
  run.bolts = run.bolts.filter((b) => b.life > 0);

  if (drain > 0) {
    w.stamina = Math.max(0, w.stamina - drain * dt);
    if (w.stamina <= 0) w.spent = true;
  }

  // The burst really is untouchable: you are crossing at four times cruise
  // speed and the thing reaching for you is not.
  if (bite > 0 && run.iframe <= 0 && run.you.iframe <= 0) {
    run.integrity -= 1;
    run.iframe = IFRAME;
    run.events.push({
      kind: "hit", x: run.you.x, y: run.you.y,
      cause: volleyed ? "volley" : struck ? "struck" : "touched",
    });
    for (const e of run.entities) {
      if (e.faction !== "beast") continue;
      const dx = e.x - run.you.x, dy = e.y - run.you.y;
      const r = Math.hypot(dx, dy);
      if (r < 140e-6 && r > 1e-9) {
        e.x += (dx / r) * KNOCKBACK; e.y += (dy / r) * KNOCKBACK; e.held = 0;
      }
    }
    if (run.integrity <= 0) {
      run.integrity = 0;
      run.phase = "dead";
      run.events.push({ kind: "death" });
    }
  }
}

// ── birth ───────────────────────────────────────────────────────────────────

/**
 * The king is down, and the next world is its body.
 *
 * Everything about the new place comes out of what you fed it, so the world you
 * are about to live in is one you assembled two phases ago without knowing it.
 * Some of what you built survives as ruins — weaker, half taken, but standing.
 */
export function birth(run: Run): void {
  const k = run.throne;
  const next = worldFrom(k, run.world.aeon + 1);
  run.phase = "birth";
  run.aeonsSurvived++;
  run.score += 40 + k.mass * 8;
  run.events.push({ kind: "birth", aeon: next.aeon, name: next.name });
  run.world = next;
}

/** Step into the world that was just born. */
export function enterWorld(run: Run): void {
  if (run.phase !== "birth") return;
  const w = run.world;

  run.wave = newWave(w.pitch, MAX_AMPLITUDE, focusFor(w.pitch), w.medium);
  run.wave.stamina = 100;

  // What survives is what you did not spend, weakened into ruins.
  const keep = Math.round(run.structures.length * w.inheritance);
  run.structures = run.structures.slice(0, keep).map((s) => ({
    ...s, ruin: true, charge: 0, strength: Math.max(1, Math.round(s.strength / 2)),
  }));

  // WHERE THE LAST ONE FELL. The old king is still on `run.throne` here, which
  // is the only record of it, so the position is taken before anything replaces
  // it — and the throne itself is not placed until after `retune` below, since
  // the pool the player actually inherits is smaller than the one they just
  // fought in and a throne sited against the old one could land outside the
  // water and be impossible to feed.
  const fell = { x: run.throne.x, y: run.throne.y };
  run.bound = newBound(w.pitch, w.medium,
    run.bounds.x + run.bounds.w * (0.2 + run.rand() * 0.6),
    run.bounds.y + run.bounds.h * (0.2 + run.rand() * 0.6));
  run.spacing = workableSpacing(run.bound.omega, w.medium, reachOf(BUILDABLE[0]));
  // A NEW WORLD IS NEW WATER, and the pool it opens with is whatever ruins came
  // through with you — not the high-water mark of the world you just left.
  run.opened = 0;
  retune(run);
  const site = throneSite(run, fell.x, fell.y);
  run.throne = emptyThrone(site.x, site.y);
  run.bolts = [];
  // NEW WORLD, NEW WATER. This is the only place the count resets, and that is
  // the whole of the pressure to crown: gather this world out and the only way
  // to more is through the throne.
  run.entities = run.entities.filter((e) => e.faction === "motif").slice(0, 6);
  for (let i = run.entities.length; i < suspension(run); i++) run.entities.push(newMotif(run, true));
  run.delivered = suspension(run);
  run.arriving = 0;
  run.bornAt = run.t;
  run.integrity = Math.min(MAX_INTEGRITY, run.integrity + 2);
  run.spawnIn = 4;
  run.phase = "settle";
}

// ── readouts ────────────────────────────────────────────────────────────────

export interface Readout {
  label: string;
  radius: number;
  contrast: number;
  goesTo: "NODE" | "ANTINODE";
  authority: number;
  hint: string;
}

export function readoutFor(run: Run, e: Entity): Readout {
  const p = particleOf(e);
  const phi = contrastFactor(p, waterAt(run, e.y));
  const isBeast = e.faction === "beast";
  const asm = isBeast ? null : assemble(e.parts);
  return {
    label: labelOf(e),
    radius: p.radius,
    contrast: phi,
    goesTo: phi > 0 ? "NODE" : "ANTINODE",
    authority: (p.radius / 1.5e-6) ** 2,
    hint: isBeast
      ? beast(e.species).behaviour === "drift"
        ? "TOO SMALL TO HOLD"
        : phi > 0 ? "YOUR NODE REELS IT IN" : "HOLD IT IN AN ANTINODE"
      : asm && asm.group
        ? `${asm.group} AT ${asm.mass}/4`
        : asm && asm.partial ? "NEEDS AN AXIS" : "WILL NOT BIND",
  };
}

function nearest(list: number[], v: number): number | null {
  if (list.length === 0) return null;
  let best = list[0];
  for (const u of list) if (Math.abs(u - v) < Math.abs(best - v)) best = u;
  return best;
}
