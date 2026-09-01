// game/pilot.ts — you, as a body in the water.
//
// wave.ts is the field. This is the thing standing in it. You are a Particle
// with a radius, a density and a sound speed, and NOTHING moves you except
// fields.forceAt through Stokes drag — the same call, unmodified, that moves
// every motif and every hunter. There is no player velocity term, no thrust,
// no "speed" stat. If you want to go somewhere you put a trap there and fall
// into it, which is what an acoustic tweezer does and the only thing it does.
//
// HOW STEERING WORKS, AND WHY THE STICK HAS A SWEET SPOT. Force in a standing
// wave goes as sin(2k·u) from the node: zero at the node, zero at the antinode,
// maximum exactly a quarter of the trap pitch away — one eighth of a
// wavelength. So the stick does not set a velocity, it sets an OFFSET: full
// deflection puts the node a quarter-pitch ahead of you, where the water pulls
// hardest, and you spend the rest of your life falling toward a node that keeps
// stepping away. Push the offset further and you would get LESS force, not
// more, so the deflection is capped where the physics caps it.
//
// There is no momentum, and that is not a simplification. A body this size in
// water reaches terminal velocity in well under a microsecond — the Reynolds
// number is around 10^-5 — so force IS velocity here. The weight you feel when
// you start and stop is real all the same: the drive amplitude ramps, the
// apodisation ramps, and letting go drops the node onto you, where the force
// falls to zero smoothly as you settle into it.
//
// WHAT GRIP ACTUALLY IS. It is apodisation, not power. A transducer driven
// across its whole aperture puts a weak lattice everywhere — many traps live at
// once, bodies collect at whichever node is nearest THEM, and nothing ever
// meets. Concentrating the drive into a spot narrower than the trap pitch is
// what turns a weather system into a hand. That failure was found the hard way
// once already and is written up in the README; here it is the difference
// between the two states you play in.
//
// THE DASH IS THE AMPLIFIER'S PEAK RATING. An amplifier's continuous rating and
// its burst rating are different numbers, which is why a reservoir capacitor
// exists. A dash empties it: the drive goes to twice its sustained amplitude
// for seventy milliseconds, and because force goes as pressure squared that is
// four times the force and four times the speed, about two hundred microns of
// travel. It is not a teleport and it is not an animation — the burst is on the
// GLOBAL amplitude, so every other body in the water lurches with you.
//
// The three numbers that are game constants and not measurements are declared
// where they are defined: CRUISE_AMPLITUDE, DASH_GAIN, DASH_COST. Nothing in
// src/ imports this file.

import { type Particle, contrastFactor } from "../src/gorkov.js";
import { type Wave, advance, aimAt } from "./wave.js";

/**
 * The body you are.
 *
 * Lipid, and a vesicle among vesicles: lighter and softer than the water, which
 * puts your contrast factor at -0.083 in the first water, so you are an
 * ANTINODE-seeker and the lattice that carries you is the second one. Two
 * things fall out of that and neither was designed:
 *
 *   the wildlife that can reach you is the lipid wildlife, because it shares
 *   your sign — so the first water is stocked with vesicles and the dense husk
 *   is the one held out at arm's length, which is the curve you want;
 *
 *   a sovereign is dense (+0.11), so it does NOT share your sign, and your own
 *   node shoves it off you. What you fed it decides whether it has anything for
 *   the field to hold, and a 432 has nothing. That is Neumann's principle
 *   deciding whether you are allowed to keep a king at a distance.
 *
 * The medium belongs to the world, though, so a later water can put you on the
 * other side of zero and hand the whole arrangement to somebody else.
 *
 * The radius is the game constant that sets the pace: drift speed goes as a^2,
 * so nine microns is about 700 um/s at full drive — the arena in a second and a
 * bit — where five would be a crawl and twenty would be uncontrollable.
 */
export const YOU: Particle = { radius: 9e-6, rho: 915, c: 1450 };

/** Stick offset at full deflection, in trap pitches. A quarter pitch is
 *  lambda/8, where sin(2ku) peaks. Nothing is gained by going further. */
export const LEAD = 0.25;

/**
 * How far ahead a BURST puts the node, in trap pitches.
 *
 * The lead is also a speed limit, and that is not obvious: you fall toward the
 * node and stop when you reach it, so the furthest you can travel between two
 * frames is the lead itself. At a quarter pitch and sixty frames a second that
 * caps you at about 1300 um/s no matter how hard the water is driven — the
 * frame rate silently becomes a game constant, and a burst that is four times
 * the force gets nothing for it.
 *
 * So a burst reaches instead for the far side of the well. Just under half a
 * pitch is as far as the node can go and still be the one you fall INTO: past
 * that the next node is nearer and it would throw you backwards. The pull out
 * there is weaker, which a burst can afford and ordinary steering cannot.
 */
export const DASH_LEAD = 0.45;

/**
 * The drive that is always on, as a fraction of the sustained maximum.
 *
 * GAME CONSTANT, and the one that decides whether this is playable at all,
 * because a STANDING WAVE IS A FENCE. A lattice that is always on pins every
 * body to its nearest node — that is what a tweezer is for — and a pinned
 * hunter cannot cross the cell it is pinned in. At half amplitude and a wide
 * aperture nothing in the water could reach the player: the whole bestiary
 * parked itself one node out, about eighty microns away, and stood there.
 *
 * The first fix for that was to make the idle drive very weak, and it was the
 * wrong one. It cost 26 um/s of cruising speed — twenty-six pixels a second, on
 * an eight-hundred-pixel arena — which does not read as a slow walk, it reads
 * as a control that is not connected to anything. The first person to pick up a
 * pad said they could not control it, and they were right.
 *
 * SPEED AND FENCING ARE ONLY THE SAME KNOB IF THE APERTURE IS WIDE. What made a
 * fence was reach, not strength: the drive was spread over nearly two trap
 * pitches, so it still owned bodies hundreds of microns away. Concentrated to
 * under one pitch it can be three times stronger and still lose to a vesicle's
 * own swimming past about fifty microns — so you walk at 225 um/s, and beyond
 * arm's length the water is nobody's.
 *
 * Which leaves the shape of the game intact:
 *
 *   THE FIELD IS THE SHIELD, AND STAMINA IS ITS CLOCK. Gripping concentrates it
 *   into one trap, fences off what answers to the other lattice, and triples
 *   your speed again; releasing drops all three while you get it back.
 */
export const CRUISE_AMPLITUDE = 0.55;

/** Apodisation, in trap pitches: released, and gripping. Wider than the pitch
 *  is many traps at once; narrower is one trap, which is a hand. */
export const CRUISE_FOCUS = 0.9;
export const HAND_FOCUS = 0.62;

/** Time constant of the apodisation ramp, s. It is a physical aperture being
 *  re-weighted, not a state flag, so it takes a moment. */
export const FOCUS_TIME = 0.085;

/** Burst amplitude as a multiple of the sustained maximum. GAME CONSTANT: the
 *  ratio of an amplifier's peak rating to its continuous one. */
export const DASH_GAIN = 2.0;
export const DASH_TIME = 0.12;
export const DASH_COOL = 0.3;
/** Stamina emptied into one burst. GAME CONSTANT. */
export const DASH_COST = 14;
/** How long the burst leaves you untouchable. You are crossing at four times
 *  cruise speed and nothing else in the water moves at a tenth of it. */
export const DASH_IFRAME = 0.16;

export interface Pilot {
  x: number;
  y: number;
  /** Last frame's drift velocity, m/s. For the renderer, and for a dash with no
   *  stick behind it. */
  vx: number;
  vy: number;
  particle: Particle;
  /** The direction you last drove in, rad. */
  heading: number;
  /** How concentrated the drive is, 0..1. One is a hand. */
  grip: number;
  /** Seconds of burst left. */
  dash: number;
  dashCool: number;
  /** The direction a burst was committed in — a dash does not steer. */
  dashX: number;
  dashY: number;
  /** Seconds of not being touchable. */
  iframe: number;
}

export function newPilot(x: number, y: number): Pilot {
  return {
    x, y, vx: 0, vy: 0, particle: YOU, heading: 0,
    grip: 0, dash: 0, dashCool: 0, dashX: 1, dashY: 0, iframe: 0,
  };
}

/**
 * Which lattice carries you, in this water.
 *
 * Your own contrast factor, computed against the world's medium exactly as it
 * is for everything else. Negative and you are an antinode-seeker, so the trap
 * you ride is the other one. You do not get told this by a flag; it is one call
 * to gorkov.contrastFactor on your own body.
 *
 * THIS IS WHY THERE IS NO INVERT BUTTON. Both lattices are rigidly a quarter
 * wavelength apart, and the trap re-centres on you every frame, so there is
 * nothing a player could press that would change which of them holds them up.
 * What the button used to fake now falls out of the arithmetic: a body whose
 * contrast has the same sign as yours comes to the node you are standing in,
 * and a body of the opposite sign is held in the ring a quarter pitch out. Near
 * or far is decided by a subtraction, and a later world that puts YOUR contrast
 * on the other side of zero turns the whole bestiary over with it.
 */
export function ridesAntinodes(p: Pilot, w: Wave): boolean {
  return contrastFactor(p.particle, w.medium) < 0;
}

/** Your contrast factor in this water. */
export function selfContrast(p: Pilot, w: Wave): number {
  return contrastFactor(p.particle, w.medium);
}

/**
 * Concentrate or spread the drive, and lay the burst over the top.
 *
 * Called after wave.grip has done the stamina accounting, because it overrides
 * the amplitude and must not be allowed to change what that cost. Cruise is
 * free; the burst is paid for once, on the press.
 */
export function concentrate(p: Pilot, w: Wave, gripping: boolean, dt: number): void {
  const k = Math.min(1, dt / FOCUS_TIME);
  p.grip += ((gripping ? 1 : 0) - p.grip) * k;

  w.focus = w.pitch * (CRUISE_FOCUS + (HAND_FOCUS - CRUISE_FOCUS) * p.grip);

  const floor = w.maxAmplitude * CRUISE_AMPLITUDE;
  if (w.amplitude < floor) w.amplitude = floor;
  if (p.dash > 0) w.amplitude = w.maxAmplitude * DASH_GAIN;
}

/** True if the drive is concentrated enough to be one trap rather than weather. */
export function handed(p: Pilot): boolean {
  return p.grip > 0.6;
}

/**
 * Spend the reservoir. Returns false if it was refused.
 *
 * A dash commits to a direction: the stick if you are pushing one, otherwise
 * wherever you were already going. Refused while spent, on cooldown, or without
 * the stamina to pay for it — the burst is the one thing in the game that takes
 * stamina in a lump rather than over time.
 */
export function beginDash(p: Pilot, w: Wave, dx: number, dy: number): boolean {
  if (p.dash > 0 || p.dashCool > 0) return false;
  if (w.spent || w.stamina < DASH_COST) return false;

  const r = Math.hypot(dx, dy);
  if (r > 0.2) { p.dashX = dx / r; p.dashY = dy / r; }
  else { p.dashX = Math.cos(p.heading); p.dashY = Math.sin(p.heading); }

  p.dash = DASH_TIME;
  p.dashCool = DASH_COOL;
  p.iframe = Math.max(p.iframe, DASH_IFRAME);
  w.stamina = Math.max(0, w.stamina - DASH_COST);
  return true;
}

/**
 * Put the trap where the stick is asking for it.
 *
 * Returns the point the lattice was pointed at, which is also where the
 * apodisation is centred — so you are always a quarter pitch off the middle of
 * your own focus, which is where the force is.
 */
export function aimFor(
  p: Pilot, w: Wave, mx: number, my: number,
): { x: number; y: number } {
  let dx = mx, dy = my;
  if (p.dash > 0) { dx = p.dashX; dy = p.dashY; }

  let r = Math.hypot(dx, dy);
  if (r > 0.08) {
    dx /= r; dy /= r;
    r = Math.min(1, r);
    p.heading = Math.atan2(dy, dx);
  } else { dx = 0; dy = 0; r = 0; }

  const lead = w.pitch * (p.dash > 0 ? DASH_LEAD : LEAD) * r;
  const tx = p.x + dx * lead;
  const ty = p.y + dy * lead;

  // Your own sign decides which of the two lattices is put under you.
  aimAt(w, tx, ty, ridesAntinodes(p, w));
  return { x: tx, y: ty };
}

/**
 * Let the water move you.
 *
 * One call to wave.velocityAt on your own particle, plus the world's own
 * circulation, which is in the water whether you are gripping or not. There is
 * nothing else here on purpose: if this function ever grows a term that is not
 * a force on a body, the conceit is gone.
 */
export function carry(
  p: Pilot, w: Wave, dt: number, current: number, arenaW: number, arenaH: number,
): void {
  const moved = advance(w, p.x, p.y, p.particle, dt);

  const ca = (Math.PI * p.x) / arenaW;
  const cb = (Math.PI * p.y) / arenaH;
  const cx = current * Math.sin(ca) * Math.cos(cb);
  const cy = -current * Math.cos(ca) * Math.sin(cb);

  p.vx = moved.vx + cx;
  p.vy = moved.vy + cy;

  const rad = p.particle.radius;
  p.x = Math.max(rad, Math.min(arenaW - rad, moved.x + cx * dt));
  p.y = Math.max(rad, Math.min(arenaH - rad, moved.y + cy * dt));

  if (p.dash > 0) p.dash = Math.max(0, p.dash - dt);
  if (p.dashCool > 0) p.dashCool = Math.max(0, p.dashCool - dt);
  if (p.iframe > 0) p.iframe = Math.max(0, p.iframe - dt);
}

/** Speed you are actually making, m/s. For the HUD. */
export function speed(p: Pilot): number {
  return Math.hypot(p.vx, p.vy);
}
