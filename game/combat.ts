// game/combat.ts — the fight, past standing in the gaps.
//
// GAMEPLAY ADAPTATIONS, like ecology.ts: none of this is in src/ and none of it
// claims to be a measurement. What it keeps is the rules the fight already
// lives by — ALL DAMAGE IS TELEGRAPHED, NOTHING MOVES YOU BUT THE FIELD — and it
// is written against the play report that asked for it: an aeon-6 run that took
// seventeen hits, every one of them a volley arm, out of 175 volleys thrown.
// Dodging was the only answer the game had to its main attack, so a long fight
// was attrition with a fixed exchange rate.
//
// THE RIPOSTE. A burst is the amplifier's peak rating, and for its i-frames you
// are untouchable. An arm that reaches you inside that window is caught rather
// than merely survived: it goes back at the king that threw it. Reading the
// telegraph now pays twice — once for standing in the gap, once for stepping
// into the arm on purpose.
//
// THE GAMBITS. From the second world, the first wind-up seven seconds after the
// last gambit is the king's own signature move instead of a plain volley,
// chosen by its form. Each one is drawn in full for the whole wind-up, and
// what is drawn is what happens:
//
//     STRIDER  CHARGE  a lane, locked the moment it starts to wind; step off it
//     WARDEN   SHOCK   a ring that sweeps out to a drawn radius; be outside it,
//                      or burst through it as it passes
//     WEAVER   ECHO    the volley, then the same arms turned half a gap, thrown
//                      a beat later; both sets are drawn before either flies
//
// The first world has no gambits, so the phase people learn the game in is the
// game it has always been.

import {
  type Bolt, type Run, BOLT_LIFE, BOLT_SPEED, birth, kill, prey,
} from "./run.js";
import { beast } from "./beasts.js";
import { together } from "./depth.js";
import { formFor, tameHealth } from "./ecology.js";
import { rankOf } from "./evolution.js";
import { type Dir } from "./shape.js";
import { type Sovereign, sovereignParticle, volley } from "./world.js";

export type Gambit = "charge" | "shock" | "echo";

export interface ShockRing {
  x: number;
  y: number;
  /** Radius of the front now, and a frame ago: a hit is the front CROSSING you. */
  r: number;
  prev: number;
  /** Where it stops. Drawn from the start of the wind-up. */
  max: number;
}

export interface FrayStats {
  /** Arms caught in a burst. */
  caught: number;
  /** Arms thrown back that found the king. */
  landed: number;
  /** Damage those did. */
  damage: number;
  /** Signature moves the kings began. */
  gambits: number;
  /** Hunters your companion held until they came apart. */
  held: number;
  /** Calls made to a companion. */
  calls: number;
  /** Integrity mended by mitochondria. */
  repairs: number;
}

export interface Fray {
  /** Wind-ups begun this reign. */
  beats: number;
  /** When the last gambit began, in run seconds. The next waits GAMBIT_GAP. */
  lastGambit: number;
  /** What the wind-up in progress will become. Null is a plain volley. */
  next: Gambit | null;
  /** The line a charge committed to when its wind began. */
  lane: { dx: number; dy: number } | null;
  /** Seconds of charge left, then of the daze after it. */
  charge: number;
  daze: number;
  rings: ShockRing[];
  /** The second set of a Weaver's echo, already fixed, waiting to fly. */
  echo: { at: number; arms: Dir[]; speed: number } | null;
  /** Seconds a Weaver's snare still holds the king. */
  snare: number;
  /** Seconds this king is faltering at its bond line, and whether it already has. */
  falter: number;
  faltered: boolean;
  /** Energy put toward the next point of integrity, by mitochondria. */
  repair: number;
  /** When you were last hit, in run seconds. Repair waits for calm. */
  lastHit: number;
  /** This burst has already caught its arm. A new burst clears it. */
  burstCaught: boolean;
  /** When an aegis last turned a hit, so a strike held against it is said once. */
  turned: number;
  stats: FrayStats;
}

export function newFray(): Fray {
  return {
    beats: 0, lastGambit: 0, next: null, lane: null, charge: 0, daze: 0, rings: [], echo: null,
    snare: 0, falter: 0, faltered: false, repair: 0, lastHit: -Infinity,
    burstCaught: false, turned: -Infinity,
    stats: { caught: 0, landed: 0, damage: 0, gambits: 0, held: 0, calls: 0, repairs: 0 },
  };
}

/** A new reign starts its rhythm from the beginning; the run's tallies stay. */
export function resetFray(run: Run): void {
  const f = run.fray;
  f.beats = 0; f.lastGambit = run.t; f.next = null; f.lane = null; f.charge = 0; f.daze = 0;
  f.rings = []; f.echo = null; f.snare = 0; f.falter = 0; f.faltered = false;
}

/**
 * How long a king stands open at its bond line, seconds.
 *
 * THE TAMING WINDOW WAS ONE DISCHARGE WIDE, and four play reports across
 * fourteen aeons never once used it. A 622 building takes 124 off a king at the
 * edge of safety and 192 at its muzzle, and the kings in those runs woke with
 * about 410 — so a single shot crossed the whole window between the bond line
 * and zero. Bonding, companions, their calls and PACK were all unreachable in
 * practice, not because the player did not want them but because there was no
 * moment at which they were offered.
 *
 * So the first time a king drops to its line it FALTERS: it stops where it is,
 * throws nothing, eats nothing, and cannot be taken below one hit point until
 * the moment passes. It is shorter than a bond takes, so it is an invitation
 * rather than a free companion — you still have to cross to it and hold. Once
 * it is over the fight is exactly as it was, and killing it is only a matter of
 * waiting the moment out.
 */
export const FALTER_TIME = 2.5;

/**
 * Take health off the king, with the falter's floor, and answer with how much
 * actually landed.
 *
 * ONE DOOR. Every source of damage — a discharge, your bare hand, an arm thrown
 * home — goes through here, so the floor and the crossing cannot be true of one
 * of them and false of another.
 */
export function hurtSovereign(run: Run, raw: number): number {
  const k = run.throne;
  const f = run.fray;
  // REFINE rides here because this is the one door: it is worth the same 3% a
  // rank whether the wound came from a building, your hand or a thrown arm.
  const damage = raw * (1 + 0.03 * rankOf(run, "refine"));
  if (!(damage > 0) || k.hp <= 0) return 0;
  const line = k.maxHp * tameHealth(run);
  const crossing = !f.faltered && k.hp > line && k.hp - damage <= line;
  const floor = f.falter > 0 || crossing ? 1 : 0;
  const applied = Math.min(damage, Math.max(0, k.hp - floor));
  k.hp -= applied;
  if (crossing) {
    f.faltered = true;
    f.falter = FALTER_TIME;
    run.events.push({ kind: "falters", x: k.x, y: k.y });
  }
  return applied;
}

/** Is the king standing open at its bond line right now? */
export function faltering(run: Run): boolean { return run.fray.falter > 0; }

// ── the riposte ─────────────────────────────────────────────────────────────

/** How close an arm must be, during a burst, to be caught, m. BOLT_TOUCH is 13. */
export const RIPOSTE_REACH = 24e-6;
/** A caught arm goes back faster than it came. */
export const RIPOSTE_GAIN = 1.6;
export const RIPOSTE_LIFE = 2.2;
/** Stamina a catch gives back, so a good read can chain. The burst cost 14. */
export const RIPOSTE_REFUND = 8;
/**
 * How head-on a burst has to be to catch, as the cosine of the widest angle
 * between the burst and the arm coming the other way. Half is sixty degrees.
 *
 * INTO, NOT PAST. Measured headless against the aeon-6 report's king, a bot
 * that only ever burst SIDEWAYS out of arms was catching 26 to 40 a minute,
 * because a swept burst crosses the lines of the arms either side of the one
 * it is dodging — about 3000 damage a minute of catches nobody meant to make,
 * which kills a 2310 hp king in under a minute of dodging. A dodge is a dodge
 * now; a catch is something you aim.
 */
export const RIPOSTE_INTO = 0.5;
/** A thrown arm's share of the king's mass per arm. See `riposteDamage`. */
export const RIPOSTE_SHARE = 1 / 3;
/*
 * ONE ARM A BURST. Without it the best place to stand was ON the king: every
 * arm of a volley is born at its centre, so a burst timed to the throw caught
 * all of them at once — six arms of an aeon-6 sixfold king is 456 damage a
 * volley, which is not a skill, it is a spot.
 */

export function catchReach(run: Run): number {
  const rush = run.t < run.bond.rushUntil ? 1.5 : 1;
  return RIPOSTE_REACH * (1 + 0.35 * rankOf(run, "reflex")) * rush;
}

/**
 * What one thrown-back arm does to the king.
 *
 * A third of the king's mass per arm, so a sixfold king's arms are each worth
 * less than a twofold king's and there are three times as many of them to
 * catch. Against the health a king wakes with (30 + 10 x mass) that is about
 * a hundred-and-eightieth of the bar for six arms and a sixtieth for two.
 *
 * SET FROM A MEASUREMENT, and a game number rather than a physical one. A bot
 * that bursts into every arm it can reach catches about one a volley — the
 * aeon-6 king throws 58 a minute — so at twice the mass per arm it killed that
 * king in half a minute on catches alone. At a third, perfect catching takes
 * about three minutes, and a person catching one volley in four is adding to
 * what their buildings do rather than replacing it.
 */
export function riposteDamage(run: Run): number {
  const k = run.throne;
  const arms = Math.max(1, volley(k).length);
  return Math.max(3, Math.round((RIPOSTE_SHARE * k.mass / arms) * (1 + 0.4 * rankOf(run, "reflex"))));
}

function fighting(run: Run): boolean {
  return run.phase === "reign" && run.throne.awake && run.throne.hp > 0;
}

/**
 * Catch what reaches you in a burst, and fly what you threw.
 *
 * `taming` is the ceasefire: while you are offering a bond your weapons rest,
 * so a caught arm is absorbed instead of thrown, and anything already thrown
 * dissipates on the king without harming it.
 */
export function riposte(
  run: Run, taming: boolean, dt = 0, from: { x: number; y: number } = run.you,
): void {
  const you = run.you;
  const k = run.throne;
  const f = run.fray;
  const live = fighting(run);

  if (you.iframe > 0 && !f.burstCaught && run.bolts.length > 0) {
    const reach = catchReach(run);
    for (const b of run.bolts) {
      if (b.thrown || b.life <= 0) continue;
      // SWEPT, NOT SAMPLED. A burst carries you thirty-odd microns in a frame,
      // which is more than the catch reach, so testing only where you ended up
      // let you pass clean through an arm you burst straight into. The miss
      // is measured over the frame, relative to the arm's own motion.
      const ax = (b.x - b.vx * dt) - from.x, ay = (b.y - b.vy * dt) - from.y;
      const bx = b.x - you.x, by = b.y - you.y;
      if (closestApproach(ax, ay, bx, by) > reach) continue;
      const speed0 = Math.hypot(b.vx, b.vy) || 1e-12;
      if (-(you.dashX * b.vx + you.dashY * b.vy) / speed0 < RIPOSTE_INTO) continue;
      f.stats.caught++;
      f.burstCaught = true;
      run.wave.stamina = Math.min(100, run.wave.stamina + RIPOSTE_REFUND);
      if (run.wave.stamina > 25) run.wave.spent = false;
      if (!live || taming) {
        b.life = 0;
        run.events.push({ kind: "riposte", x: b.x, y: b.y, thrown: false });
        break;
      }
      const dx = k.x - you.x, dy = k.y - you.y;
      const r = Math.hypot(dx, dy) || 1e-12;
      const speed = Math.hypot(b.vx, b.vy) * RIPOSTE_GAIN || BOLT_SPEED * RIPOSTE_GAIN;
      b.x = you.x; b.y = you.y;
      b.vx = (dx / r) * speed; b.vy = (dy / r) * speed;
      b.life = RIPOSTE_LIFE; b.thrown = true; b.born = run.t;
      run.events.push({ kind: "riposte", x: you.x, y: you.y, thrown: true });
      break;
    }
    run.bolts = run.bolts.filter((b) => b.life > 0);
  }

  // What you threw. It is still your field's packet, so it scours what it
  // passes through on your own plane — and it answers to the ceasefire.
  let any = false;
  for (const b of run.bolts) if (b.thrown && b.life > 0) { any = true; break; }
  if (!any) return;
  const hitR = sovereignParticle(k).radius + 6e-6;
  const gone = new Set<number>();
  for (const b of run.bolts) {
    if (!b.thrown || b.life <= 0) continue;
    for (const e of [...run.entities]) {
      if (e.faction !== "beast" || gone.has(e.id)) continue;
      if (beast(e.species).behaviour === "drift" || !together(e.layer, run.layer)) continue;
      if (Math.hypot(e.x - b.x, e.y - b.y) > 12e-6 + beast(e.species).particle.radius) continue;
      gone.add(e.id);
      kill(run, e);
    }
    if (!live || Math.hypot(b.x - k.x, b.y - k.y) > hitR) continue;
    b.life = 0;
    if (taming) continue;
    const damage = hurtSovereign(run, riposteDamage(run));
    if (damage <= 0) continue;
    f.stats.landed++;
    f.stats.damage += damage;
    run.events.push({ kind: "riposte-hit", x: k.x, y: k.y, damage });
    if (k.hp <= 0) { birth(run); break; }
  }
  run.bolts = run.bolts.filter((b) => b.life > 0);
}

/** How near the origin a point moving from (ax, ay) to (bx, by) comes. */
export function closestApproach(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const u = len2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
  return Math.hypot(ax + dx * u, ay + dy * u);
}

// ── the gambits ─────────────────────────────────────────────────────────────

export const GAMBIT_FROM_AEON = 2;
/**
 * Seconds from one gambit to the next, at least.
 *
 * TIME, NOT WIND-UPS. It was every third wind-up, and a king's cadence falls
 * with its mass, so the aeon-6 report's king — a volley every 1.15 s — was
 * charging seventeen times a minute where a first king would manage seven.
 * Measured headless, a bot that read every lane still took a charge every
 * thirteen seconds at that rate. A gambit is a set piece, and a set piece
 * keeps its own clock whatever the size of the thing performing it.
 */
export const GAMBIT_GAP = 7;
/** A charge: how fast, for how long, and the daze it leaves the king in. */
export const CHARGE_SPEED = 7.5e-4;
export const CHARGE_TIME = 0.36;
export const CHARGE_DAZE = 1.1;
/** How near the charging king's core you have to be to be hit, m. */
export const CHARGE_TOUCH = 12e-6;
/**
 * The part of a charging king that hurts, m.
 *
 * A king's radius grows with what it was fed — the aeon-6 report's is 142 um —
 * and measured headless, a charge that hit with the whole body landed on every
 * use, because anyone fighting a king that size is standing inside it. The lane
 * is the core's width, and it is drawn that wide.
 */
export const CHARGE_CORE = 36e-6;
export const SHOCK_SPEED = 2.1e-4;
/** How far past the king's own edge a shock front carries, m. */
export const SHOCK_REACH = 220e-6;

export function chargeReach(k: Sovereign): number {
  return Math.min(sovereignParticle(k).radius, CHARGE_CORE) + CHARGE_TOUCH;
}
/** Where a shock front from this king stops, from its centre, m. */
export function shockReach(k: Sovereign): number {
  return sovereignParticle(k).radius + SHOCK_REACH;
}
export const ECHO_DELAY = 0.42;

export function gambitFor(run: Run): Gambit {
  const form = formFor(run.world.aeon);
  return form === "strider" ? "charge" : form === "warden" ? "shock" : "echo";
}

/** How far a charge carries if nothing stops it, m. The lane is drawn this long. */
export function chargeLength(): number {
  return CHARGE_SPEED * CHARGE_TIME;
}

/**
 * A wind-up begins. Decide what it is, and lock anything the telegraph shows.
 *
 * The charge's direction is fixed HERE, at the start of the wind, so the lane
 * the player is shown for the whole wind-up is the lane it runs down.
 */
export function beginWind(run: Run): Gambit | null {
  const f = run.fray;
  const k = run.throne;
  f.beats++;
  f.next = run.world.aeon >= GAMBIT_FROM_AEON && run.t - f.lastGambit >= GAMBIT_GAP
    ? gambitFor(run) : null;
  if (f.next) f.lastGambit = run.t;
  f.lane = null;
  if (f.next === "charge") {
    const at = prey(run);
    const dx = at.x - k.x, dy = at.y - k.y;
    const r = Math.hypot(dx, dy) || 1e-12;
    f.lane = { dx: dx / r, dy: dy / r };
  }
  if (f.next) {
    f.stats.gambits++;
    run.events.push({ kind: "gambit", x: k.x, y: k.y, gambit: f.next });
  }
  return f.next;
}

/**
 * The wind-up is over. True if the gambit REPLACES the volley — a charge or a
 * shock throws no arms. An echo throws its arms and then its second set.
 */
export function unleash(run: Run, boltSpeed: number): boolean {
  const f = run.fray;
  const k = run.throne;
  const kind = f.next;
  f.next = null;
  if (kind === "charge" && f.lane) {
    f.charge = CHARGE_TIME;
    run.events.push({ kind: "charge", x: k.x, y: k.y });
    return true;
  }
  if (kind === "shock") {
    const r0 = sovereignParticle(k).radius;
    f.rings.push({ x: k.x, y: k.y, r: r0, prev: r0, max: shockReach(k) });
    run.events.push({ kind: "shock", x: k.x, y: k.y });
    return true;
  }
  if (kind === "echo") f.echo = { at: run.t + ECHO_DELAY, arms: echoArms(run), speed: boltSpeed };
  return false;
}

/** The second set of an echo: the volley turned by half the gap between arms. */
export function echoArms(run: Run): Dir[] {
  const arms = volley(run.throne);
  if (arms.length === 0) return [];
  const turn = Math.PI / arms.length;
  const c = Math.cos(turn), s = Math.sin(turn);
  return arms.map(([x, y]) => [x * c - y * s, x * s + y * c] as Dir);
}

/** Is the king under its own steam right now, or is something else deciding? */
export function charging(run: Run): boolean { return run.fray.charge > 0; }

/**
 * The king's own motion, when a gambit or a snare overrides it. Null means it
 * drags itself toward you as it always has. The field still acts on it unless
 * it is charging — a committed charge is not a body being herded.
 */
export function sovereignDrive(run: Run): { x: number; y: number } | null {
  const f = run.fray;
  if (f.snare > 0 || f.falter > 0) return { x: 0, y: 0 };
  if (f.charge > 0 && f.lane) return { x: f.lane.dx * CHARGE_SPEED, y: f.lane.dy * CHARGE_SPEED };
  if (f.daze > 0) return { x: 0, y: 0 };
  return null;
}

/** Everything a gambit does between frames. Called from the reign. */
export function frayStep(run: Run, dt: number): void {
  const f = run.fray;
  const k = run.throne;
  if (f.snare > 0) f.snare = Math.max(0, f.snare - dt);
  if (f.falter > 0) f.falter = Math.max(0, f.falter - dt);
  if (f.charge > 0) {
    f.charge = Math.max(0, f.charge - dt);
    if (f.charge === 0) { f.daze = CHARGE_DAZE; f.lane = null; }
  } else if (f.daze > 0) f.daze = Math.max(0, f.daze - dt);

  for (const ring of f.rings) { ring.prev = ring.r; ring.r += SHOCK_SPEED * dt; }
  f.rings = f.rings.filter((ring) => ring.prev < ring.max);

  if (f.echo && run.t >= f.echo.at) {
    for (const [dx, dy] of f.echo.arms) {
      const bolt: Bolt = {
        x: k.x, y: k.y, vx: dx * f.echo.speed, vy: dy * f.echo.speed, life: BOLT_LIFE, born: run.t,
      };
      run.bolts.push(bolt);
    }
    run.events.push({ kind: "volley", x: k.x, y: k.y, arms: f.echo.arms.length });
    f.echo = null;
  }
}

/** Did a gambit reach you this frame? The i-frames are applied by the caller. */
export function gambitContact(run: Run): "charge" | "shock" | null {
  const f = run.fray;
  const k = run.throne;
  const you = run.you;
  if (f.charge > 0) {
    if (Math.hypot(you.x - k.x, you.y - k.y) < chargeReach(k)) return "charge";
  }
  for (const ring of f.rings) {
    const d = Math.hypot(you.x - ring.x, you.y - ring.y);
    if (d > ring.prev && d <= Math.min(ring.r, ring.max)) return "shock";
  }
  return null;
}
