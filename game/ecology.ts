// Gameplay adaptations live here, never in the acoustic instrument.
import { type Run, latticePitch } from "./run.js";
import { type Limb, limbsOf } from "./body.js";
import { cellFor } from "./lattice.js";
import { type Sovereign } from "./world.js";
import { type Ally } from "./allies.js";
import { rankOf } from "./evolution.js";

export type Form = "strider" | "warden" | "weaver";
export const FORMS: readonly Form[] = ["strider", "warden", "weaver"];
export const ADAPTATIONS = {
  strider: { name: "STRIDER", gift: "FASTER DASH RECOVERY", speed: 1, boltSpeed: 1, cadence: 1 },
  warden: { name: "WARDEN", gift: "BLOCKS A VOLLEY HIT", speed: 0.55, boltSpeed: 0.7, cadence: 1.25 },
  weaver: { name: "WEAVER", gift: "RESTORES STAMINA AT REST", speed: 0.9, boltSpeed: 1.2, cadence: 0.9 },
} as const;

export function formFor(aeon: number): Form { return FORMS[(Math.max(1, aeon) - 1) % FORMS.length]; }
export interface Companion { form: Form; hm: string; rank: number }
export interface Bond {
  progress: number;
  companions: Companion[];
  active: number;
  shieldReadyAt: number;
  limbReadyAt: Map<number, number>;
  /** The previous world ended by bonding rather than killing. */
  tamed: boolean;
  /** The active companion as a body in the water. See allies.ts. */
  ally: Ally | null;
  /** When the active companion can next be called, and what its call is doing. */
  readyAt: number;
  rushUntil: number;
  aegisUntil: number;
}
export function newBond(): Bond {
  return {
    progress: 0, companions: [], active: 0, shieldReadyAt: 0, limbReadyAt: new Map(), tamed: false,
    ally: null, readyAt: 0, rushUntil: 0, aegisUntil: 0,
  };
}
export function companion(run: Run): Companion | undefined { return run.bond.companions[run.bond.active]; }
export function cycleCompanion(run: Run): void {
  if (run.bond.companions.length) {
    run.bond.active = (run.bond.active + 1) % run.bond.companions.length;
    // A different companion is a different body; the old one's hold is let go.
    const a = run.bond.ally;
    if (a && a.target >= 0) {
      const t = run.entities.find((e) => e.id === a.target);
      if (t) t.seized = 0;
    }
    run.bond.ally = null;
  }
}
export const TAME_HEALTH = 0.3;
export const TAME_REACH = 120e-6;
export const TAME_TIME = 3;
/** The share of its bar below which this run can bond with a king. EMPATHY raises it. */
export function tameHealth(run: Run): number {
  return TAME_HEALTH + 0.08 * rankOf(run, "empathy");
}
/** Seconds of uninterrupted offering a bond takes in this run. */
export function tameTime(run: Run): number {
  return TAME_TIME - 0.5 * rankOf(run, "empathy");
}
export function vulnerable(k: Sovereign, share = TAME_HEALTH): boolean {
  return k.awake && k.hp > 0 && k.hp <= k.maxHp * share;
}
export function canBond(run: Run): boolean {
  return run.phase === "reign" && vulnerable(run.throne, tameHealth(run))
    && Math.hypot(run.you.x - run.throne.x, run.you.y - run.throne.y) <= TAME_REACH;
}
export function recruit(run: Run): void {
  const form = formFor(run.world.aeon);
  const found = run.bond.companions.findIndex((c) => c.form === form);
  if (found >= 0) {
    const c = run.bond.companions[found];
    c.rank = Math.min(3, c.rank + 1);
    c.hm = run.throne.hm;
    run.bond.active = found;
  } else {
    run.bond.companions.push({ form, hm: run.throne.hm, rank: 1 });
    run.bond.active = run.bond.companions.length - 1;
  }
  run.bond.tamed = true;
}

export type LimbRole = "guard" | "resonator" | "sail";
const ROLES = new Map<string, LimbRole>();
export function limbRole(limb: Limb): LimbRole {
  const hm = limb.cells[0].hm;
  let role = ROLES.get(hm);
  if (!role) {
    const ability = cellFor(hm).ability;
    role = ability === "anchor" ? "guard" : ability === "thrust" ? "sail" : "resonator";
    ROLES.set(hm, role);
  }
  return role;
}
export const SUPPORT_REACH = 90e-6;
export const GUARD_REACH = 32e-6;
export const GUARD_COOLDOWN = 2;
export function activeLimbs(run: Run): Limb[] {
  return run.bodies.flatMap((body) => limbsOf(body, latticePitch(run)));
}
export function supported(run: Run, role: LimbRole): boolean {
  return activeLimbs(run).some((l) => limbRole(l) === role && l.layers.includes(run.layer)
    && Math.hypot(l.cells[0].x - run.you.x, l.cells[0].y - run.you.y) <= SUPPORT_REACH);
}

/** Benefits never add a velocity to the player; movement still comes from traps. */
export function support(run: Run, dt: number): void {
  const c = companion(run);
  const sail = supported(run, "sail");
  const recovery = (c?.form === "strider" ? 0.25 + c.rank * 0.1 : 0) + (sail ? 0.6 : 0);
  run.you.dashCool = Math.max(0, run.you.dashCool - recovery * dt);
  if (c?.form === "weaver" && run.you.grip < 0.1) {
    run.wave.stamina = Math.min(100, run.wave.stamina + (2 + c.rank) * dt);
  }

  // Spatial buckets keep this O(limbs + bolts), even in a large organism.
  const guards = new Map<string, Limb[]>();
  for (const l of activeLimbs(run)) {
    if (limbRole(l) !== "guard" || !l.layers.includes(run.layer)) continue;
    const tip = l.cells[0];
    const key = `${Math.floor(tip.x / GUARD_REACH)},${Math.floor(tip.y / GUARD_REACH)}`;
    const bucket = guards.get(key);
    if (bucket) bucket.push(l); else guards.set(key, [l]);
  }
  for (const b of run.bolts) {
    if (b.life <= 0 || b.thrown) continue;
    const gx = Math.floor(b.x / GUARD_REACH), gy = Math.floor(b.y / GUARD_REACH);
    for (let ox = -1; ox <= 1 && b.life > 0; ox++) {
      for (let oy = -1; oy <= 1 && b.life > 0; oy++) {
        for (const l of guards.get(`${gx + ox},${gy + oy}`) ?? []) {
          const tip = l.cells[0];
          if ((run.bond.limbReadyAt.get(tip.id) ?? 0) > run.t) continue;
          if (Math.hypot(b.x - tip.x, b.y - tip.y) > GUARD_REACH) continue;
          b.life = 0;
          run.bond.limbReadyAt.set(tip.id, run.t + GUARD_COOLDOWN);
          run.events.push({ kind: "guard", x: tip.x, y: tip.y });
          break;
        }
      }
    }
    if (b.life > 0 && c?.form === "warden" && run.t >= run.bond.shieldReadyAt
      && Math.hypot(b.x - run.you.x, b.y - run.you.y) < 28e-6) {
      b.life = 0;
      run.bond.shieldReadyAt = run.t + 8 - c.rank;
      run.events.push({ kind: "guard", x: run.you.x, y: run.you.y });
    }
  }
  run.bolts = run.bolts.filter((b) => b.life > 0);
}
