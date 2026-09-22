// game/beasts.ts — the eight ways a body can be in the water with you.
//
// A beast is not a stat block with a colour. It is a Particle, and the only
// thing that decides how it behaves toward you is the sign of its contrast
// factor against the water it is in — which is why this table has densities and
// sound speeds in it and no faction, no tint, and no "type advantage".
//
// SIGN IS RANGE. Both lattices are a quarter wavelength apart and you are
// standing in one of them. A body that shares your sign answers to the same
// lattice, so your drive REELS IT INTO YOUR LAP; a body of the opposite sign is
// driven off your node and held in the ring a quarter pitch out, where it can
// be killed at leisure and cannot touch you. Nothing here is asymmetric on
// purpose — it is one subtraction, done per world, in world.wildlifeFor.
//
// It lives apart from run.ts because worlds need it too: which of these a water
// carries is derived from what a body of YOUR density does in that water, and
// world.ts cannot import the run to find out.

import { type Particle } from "../src/gorkov.js";

export type Behaviour = "hunt" | "drift" | "split" | "orbit" | "ambush" | "tend" | "graze";

export interface Beast {
  id: string;
  label: string;
  particle: Particle;
  hold: number;
  speed: number;
  behaviour: Behaviour;
  damage: number;
  drain: number;
  score: number;
  /**
   * The coil, the strike, and how much faster it swims during it.
   *
   * A hunter that only walks at you is not something you can be good at
   * avoiding — it is weather, and the only answer to it is to have gripped
   * earlier. The wind-up is the whole difference: it stops, it gathers, and for
   * that fifth of a second the strike it is about to make is a fact you can
   * read off the screen and step out of. Getting hit becomes something you did.
   *
   * A body in your hand cannot do any of it, which is the other half: the grip
   * is not just damage, it is the thing that takes the strike away.
   */
  wind: number;
  strike: number;
  surge: number;
}

const LIPID = { rho: 915, c: 1450 };
const FLESH = { rho: 1100, c: 1570 };
const FAINT = { rho: 1050, c: 1520 };

/**
 * Swim speeds are set against the idle lattice, not against each other.
 *
 * A body's trap velocity goes as its radius squared, so the big ones are held
 * hardest — and any hunter slower than the idle drive's pull on IT is a hunter
 * that never arrives, no matter what its stat line says. Each speed below is
 * comfortably above that body's own trap velocity at pilot.CRUISE_AMPLITUDE and
 * far below it at full grip, which is the window the whole fight lives in: they
 * walk through your idle field and they do not walk through your grip.
 */
export const BEASTS: Readonly<Record<string, Beast>> = {
  /**
   * It does not come for you at all.
   *
   * A TENDER swims to whatever you crowned and mends it, and it is the first
   * body in this water that makes you choose a target other than the thing in
   * front of you. It carries no strike, so it cannot be answered by dodging:
   * it is answered by holding it, like everything else here, or by ignoring it
   * and watching the bar you are working on go back up.
   */
  tender: {
    // Lipid, so it shares YOUR sign: your own drive reels it into your lap,
    // and the body that mends a king is the one you can snatch by standing
    // still. The leech is flesh and has to be gone to.
    id: "tender", label: "TENDER", particle: { radius: 7e-6, ...LIPID },
    hold: 1.3, speed: 7e-5, behaviour: "tend", damage: 0, drain: 0, score: 7,
    wind: 0, strike: 0, surge: 0,
  },
  /**
   * It comes for what you BUILT.
   *
   * A LEECH fastens onto the nearest building and gnaws, and a building is
   * both your arsenal and the crystal the pool opens with — so ignoring one is
   * a discharge and a stretch of water. It does nothing to you directly.
   */
  leech: {
    id: "leech", label: "LEECH", particle: { radius: 8e-6, ...FLESH },
    hold: 1.5, speed: 8e-5, behaviour: "graze", damage: 0, drain: 0, score: 6,
    wind: 0, strike: 0, surge: 0,
  },
  ribbon: {
    id: "ribbon", label: "RIBBON", particle: { radius: 4.5e-6, ...LIPID },
    hold: 1.1, speed: 6e-5, behaviour: "orbit", damage: 1, drain: 0, score: 5,
    wind: 0.65, strike: 0.28, surge: 6,
  },
  sentinel: {
    id: "sentinel", label: "SENTINEL", particle: { radius: 10e-6, ...FLESH },
    hold: 1.8, speed: 4e-5, behaviour: "ambush", damage: 1, drain: 0, score: 6,
    wind: 0.85, strike: 0.45, surge: 7,
  },
  vesicle: {
    id: "vesicle", label: "VESICLE", particle: { radius: 5.5e-6, ...LIPID },
    hold: 1.05, speed: 5.0e-5, behaviour: "hunt", damage: 1, drain: 0, score: 2,
    wind: 0.42, strike: 0.3, surge: 5,
  },
  mote: {
    id: "mote", label: "MOTE", particle: { radius: 0.9e-6, ...FAINT },
    hold: 0.9, speed: 0, behaviour: "drift", damage: 0, drain: 24, score: 1,
    // Too small for any lattice to hold and too small to aim: it drifts, and
    // that is the whole of it.
    wind: 0, strike: 0, surge: 0,
  },
  husk: {
    id: "husk", label: "HUSK", particle: { radius: 12e-6, ...FLESH },
    hold: 2.1, speed: 6.0e-5, behaviour: "hunt", damage: 1, drain: 0, score: 4,
    // Heavy: it takes a long moment to gather, and it commits hard.
    wind: 0.62, strike: 0.34, surge: 4.5,
  },
  splitter: {
    id: "splitter", label: "SPLITTER", particle: { radius: 6.5e-6, ...LIPID },
    hold: 0.95, speed: 7.0e-5, behaviour: "split", damage: 1, drain: 0, score: 3,
    // Twitchy. Barely warns you, and crosses the gap before you have finished
    // reading it.
    wind: 0.26, strike: 0.22, surge: 6.5,
  },
};

export function beast(id: string): Beast {
  const b = BEASTS[id];
  if (!b) throw new Error(`no beast ${id}`);
  return b;
}
