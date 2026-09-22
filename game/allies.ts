// game/allies.ts — a companion is a body in the water, and it fights.
//
// GAMEPLAY, like the rest of the companion system in ecology.ts. A bonded
// sovereign used to be a passive number and a drawing that orbited you on a
// timer; nothing it did was in the simulation. Here it swims, it picks
// targets, and it kills them the only way anything in this game dies — by
// holding them. A hunter your companion has hold of cannot coil or strike, for
// the same reason one in your own hand cannot.
//
//     STRIDER  hunts: darts at the nearest hunter and pins it
//     WARDEN   guards: goes for whatever is winding up to strike you
//     WEAVER   binds: tethers a hunter from beside you, slower but at range
//
// THE CALL is the other half: one active per form, on its own button, on a
// cooldown that rank and PACK shorten.
//
//     STRIDER  RUSH   free bursts for a few seconds, and catches reach further
//     WARDEN   AEGIS  clears the arms around you and shrugs off the next hits
//     WEAVER   SNARE  holds the king still: no drag, no spin, no volley clock
//
// Nothing here moves the player. The companion's own swimming is a velocity on
// the companion, which is what a hunter's swimming already was.

import { type Entity, type Run, kill } from "./run.js";
import { beast } from "./beasts.js";
import { together } from "./depth.js";
import { type Form, companion } from "./ecology.js";
import { rankOf } from "./evolution.js";

export interface Ally {
  x: number;
  y: number;
  /** The entity it is working on, or -1. */
  target: number;
  /** Seconds before it picks another. */
  cool: number;
  /** True once it has hold of the target; before that it is on its way. */
  holding: boolean;
}

/** How far out from you it will go looking, per form, m. */
export const ALLY_SCAN: Readonly<Record<Form, number>> = {
  strider: 170e-6, warden: 95e-6, weaver: 140e-6,
};
/** And how far it follows a target before giving it up. */
export const ALLY_LEASH = 240e-6;
/** How near it must be to take hold, m; a Weaver's tether is its scan. */
export const ALLY_GRAB = 16e-6;
/** How fast it darts at a target, m/s. The player grips at about 7e-4. */
export const ALLY_DART = 1.1e-3;

const BASE_RATE: Readonly<Record<Form, number>> = { strider: 1.1, warden: 0.9, weaver: 0.6 };
const BASE_COOL: Readonly<Record<Form, number>> = { strider: 2.2, warden: 2.6, weaver: 1.2 };

/** Hold-seconds a second the companion puts on its target. */
export function holdRate(run: Run, form: Form, rank: number): number {
  return (BASE_RATE[form] + 0.4 * rank) * (1 + 0.25 * rankOf(run, "pack"));
}

export function allyCooldown(run: Run, form: Form, rank: number): number {
  return Math.max(0.4, BASE_COOL[form] - 0.3 * rank) * (1 - 0.25 * rankOf(run, "pack"));
}

function hunter(run: Run, e: Entity): boolean {
  return e.faction === "beast" && beast(e.species).behaviour !== "drift"
    && together(e.layer, run.layer);
}

function pick(run: Run, form: Form): Entity | null {
  const you = run.you;
  const scan = ALLY_SCAN[form];
  let best: Entity | null = null;
  let bestScore = Infinity;
  for (const e of run.entities) {
    if (!hunter(run, e)) continue;
    const r = Math.hypot(e.x - you.x, e.y - you.y);
    if (r > scan) continue;
    // The Warden answers a threat before it answers a body.
    const score = form === "warden" && (e.wind > 0 || e.strike > 0) ? r - 1 : r;
    if (score < bestScore) { bestScore = score; best = e; }
  }
  return best;
}

function letGo(run: Run, a: Ally): void {
  const t = run.entities.find((e) => e.id === a.target);
  if (t) t.seized = 0;
  a.target = -1;
  a.holding = false;
}

/** The companion's turn. Settling and reigning only, like everything that fights. */
export function allies(run: Run, dt: number): void {
  const c = companion(run);
  const bond = run.bond;
  if (!c) { bond.ally = null; return; }
  const you = run.you;
  const a = bond.ally ??= { x: you.x + 30e-6, y: you.y, target: -1, cool: 0.5, holding: false };
  a.cool = Math.max(0, a.cool - dt);

  let t = a.target >= 0 ? run.entities.find((e) => e.id === a.target) ?? null : null;
  if (t && (!hunter(run, t) || Math.hypot(t.x - you.x, t.y - you.y) > ALLY_LEASH)) {
    letGo(run, a);
    t = null;
  }
  if (!t && a.target >= 0) { a.target = -1; a.holding = false; }
  if (!t && a.cool <= 0) {
    t = pick(run, c.form);
    if (t) { a.target = t.id; a.holding = false; }
  }

  if (t) {
    if (c.form === "weaver") {
      // A tether from beside you: it never leaves your side.
      follow(run, a, dt);
      a.holding = Math.hypot(t.x - you.x, t.y - you.y) <= ALLY_SCAN.weaver;
    } else {
      const dx = t.x - a.x, dy = t.y - a.y;
      const r = Math.hypot(dx, dy);
      if (r > ALLY_GRAB) {
        const stepLen = Math.min(r, ALLY_DART * dt);
        a.x += (dx / (r || 1e-12)) * stepLen;
        a.y += (dy / (r || 1e-12)) * stepLen;
      }
      a.holding = Math.hypot(t.x - a.x, t.y - a.y) <= ALLY_GRAB;
      if (a.holding) { a.x = t.x; a.y = t.y; }
    }
    if (a.holding) {
      t.seized = (t.seized ?? 0) + holdRate(run, c.form, c.rank) * dt;
      t.wind = 0;
      t.strike = 0;
      if (t.seized >= beast(t.species).hold) {
        run.fray.stats.held++;
        run.events.push({ kind: "ally", x: t.x, y: t.y, species: t.species, form: c.form });
        kill(run, t);
        a.target = -1;
        a.holding = false;
        a.cool = allyCooldown(run, c.form, c.rank);
      }
    }
  } else {
    follow(run, a, dt);
  }
}

/** Keep station beside you, a little way off, turning slowly. */
function follow(run: Run, a: Ally, dt: number): void {
  const ang = run.t * 0.5;
  const tx = run.you.x + Math.cos(ang) * 34e-6;
  const ty = run.you.y + Math.sin(ang) * 26e-6;
  const k = Math.min(1, dt * 5);
  a.x += (tx - a.x) * k;
  a.y += (ty - a.y) * k;
}

// ── the call ────────────────────────────────────────────────────────────────

export const CALL_COOLDOWN = 22;
export const RUSH_TIME = 4;
export const AEGIS_TIME = 1.5;
export const AEGIS_REACH = 170e-6;
export const SNARE_TIME = 2.5;

export const CALLS: Readonly<Record<Form, { name: string; says: string }>> = {
  strider: { name: "RUSH", says: "FREE BURSTS, AND EVERY CATCH REACHES FURTHER" },
  warden: { name: "AEGIS", says: "CLEARS THE ARMS AROUND YOU AND TURNS THE NEXT HITS" },
  weaver: { name: "SNARE", says: "HOLDS THE KING STILL: NO DRAG, NO SPIN, NO VOLLEYS" },
};

export function callCooldown(run: Run, rank: number): number {
  return (CALL_COOLDOWN - 3 * rank) * (1 - 0.25 * rankOf(run, "pack"));
}

/** Seconds until the active companion can be called, or 0. */
export function callWait(run: Run): number {
  return Math.max(0, run.bond.readyAt - run.t);
}

export type CallResult = "called" | "no-companion" | "cooling" | "no-king" | "wrong-phase";

export function callAlly(run: Run): CallResult {
  if (run.phase !== "settle" && run.phase !== "reign") return "wrong-phase";
  const c = companion(run);
  if (!c) return "no-companion";
  if (run.t < run.bond.readyAt) return "cooling";
  const k = run.throne;
  if (c.form === "weaver") {
    if (run.phase !== "reign" || !k.awake || k.hp <= 0) return "no-king";
    run.fray.snare = SNARE_TIME + 0.5 * c.rank;
    run.fray.charge = 0;
    run.fray.lane = null;
  } else if (c.form === "warden") {
    const you = run.you;
    run.bolts = run.bolts.filter((b) => b.thrown
      || Math.hypot(b.x - you.x, b.y - you.y) > AEGIS_REACH);
    run.fray.rings = [];
    run.bond.aegisUntil = run.t + AEGIS_TIME + 0.25 * c.rank;
  } else {
    run.bond.rushUntil = run.t + RUSH_TIME + 0.5 * c.rank;
    run.you.dashCool = 0;
  }
  run.bond.readyAt = run.t + callCooldown(run, c.rank);
  run.fray.stats.calls++;
  run.events.push({ kind: "call", form: c.form, x: run.you.x, y: run.you.y });
  return "called";
}

export function rushing(run: Run): boolean { return run.t < run.bond.rushUntil; }
export function shielded(run: Run): boolean { return run.t < run.bond.aegisUntil; }
