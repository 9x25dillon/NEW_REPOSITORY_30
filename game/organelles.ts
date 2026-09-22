import { type Run, maxIntegrity } from "./run.js";
import { type Structure } from "./world.js";
import { rankOf } from "./evolution.js";

export interface Mitochondrion {
  hostId: number;
  energy: number;
  supplying: boolean;
  /** Spending itself on your integrity rather than your stamina, this frame. */
  mending?: boolean;
}
export const MITO_COST = 2;
export const MITO_CAPACITY = 60;
export const MITO_REACH = 85e-6;
export const MITO_GROW_REACH = 46e-6;
/** Stored energy a point of integrity costs, before CRISTAE. */
export const REPAIR_COST = 40;
/** Seconds without a hit before a station will mend you. */
export const REPAIR_CALM = 3;

/** How much one organelle holds in this run. */
export function mitoCapacity(run: Run): number {
  return MITO_CAPACITY * (1 + 0.5 * rankOf(run, "cristae"));
}
export function repairCost(run: Run): number {
  return REPAIR_COST * (1 - 0.25 * rankOf(run, "cristae"));
}
/**
 * Would a station mend you right now, if you stood at one?
 *
 * Only once the stamina is topped up, and only in a lull: a station you can
 * heal at mid-volley would make standing still the answer to every fight.
 */
export function mending(run: Run): boolean {
  return run.integrity < maxIntegrity(run) && run.wave.stamina >= 95
    && run.t - run.fray.lastHit >= REPAIR_CALM;
}

export function organelleHost(run: Run): Structure | undefined {
  let host: Structure | undefined;
  let distance = MITO_GROW_REACH;
  for (const s of run.structures) {
    if (s.layer !== run.layer) continue;
    const r = Math.hypot(s.x - run.you.x, s.y - run.you.y);
    if (r <= distance) { host = s; distance = r; }
  }
  return host;
}
export type GrowResult = "grown" | "need-cells" | "need-host" | "already-grown" | "wrong-phase";
export function growMitochondrion(run: Run, selected = 0): GrowResult {
  if (run.phase !== "settle" && run.phase !== "reign") return "wrong-phase";
  const host = organelleHost(run);
  if (!host) return "need-host";
  if (run.organelles.some((o) => o.hostId === host.id)) return "already-grown";
  if (run.cells.length < MITO_COST) return "need-cells";
  const first = Math.max(0, Math.min(run.cells.length - 1, selected));
  const second = (first + 1) % run.cells.length;
  for (const index of [first, second].sort((a, b) => b - a)) run.cells.splice(index, 1);
  run.organelles.push({ hostId: host.id, energy: 0, supplying: false });
  run.events.push({ kind: "organelle", x: host.x, y: host.y });
  return "grown";
}

/**
 * A bounded gameplay energy reserve. It is not a mitochondrial physics model.
 *
 * Stamina first, then integrity: once you are topped up and have not been hit
 * for REPAIR_CALM seconds, a station you stand at spends itself mending you,
 * REPAIR_COST energy a point. The rate is the same shared transfer limit, so
 * twenty stations mend no faster than one — they only last longer.
 */
export function metabolise(run: Run, dt: number): void {
  const hosts = new Map(run.structures.map((s) => [s.id, s]));
  run.organelles = run.organelles.filter((o) => hosts.has(o.hostId));
  const capacity = mitoCapacity(run);
  const recharge = 3 * (1 + 0.5 * rankOf(run, "cristae"));
  const mend = mending(run);
  // Multiple organelles store more, but cannot multiply the transfer rate.
  let transfer = 14 * dt;
  let spentOnRepair = false;
  for (const o of run.organelles) {
    const host = hosts.get(o.hostId)!;
    o.supplying = false;
    o.mending = false;
    const near = host.serves.includes(run.layer)
      && Math.hypot(host.x - run.you.x, host.y - run.you.y) <= MITO_REACH;
    if (near && run.wave.stamina < 95 && o.energy > 0 && transfer > 0) {
      const amount = Math.min(o.energy, transfer, 100 - run.wave.stamina);
      run.wave.stamina += amount;
      o.energy -= amount;
      transfer -= amount;
      o.supplying = amount > 0;
      if (run.wave.stamina > 25) run.wave.spent = false;
    } else if (near && mend && o.energy > 0 && transfer > 0) {
      const amount = Math.min(o.energy, transfer);
      run.fray.repair += amount;
      o.energy -= amount;
      transfer -= amount;
      o.mending = o.supplying = amount > 0;
      spentOnRepair = true;
    } else if (!near || run.wave.stamina >= 95) {
      o.energy = Math.min(capacity, o.energy + recharge * dt);
    }
  }
  const cost = repairCost(run);
  if (spentOnRepair && run.fray.repair >= cost && run.integrity < maxIntegrity(run)) {
    run.fray.repair -= cost;
    run.integrity += 1;
    run.fray.stats.repairs++;
    run.events.push({ kind: "repair", x: run.you.x, y: run.you.y });
  }
  if (run.integrity >= maxIntegrity(run)) run.fray.repair = 0;
}
