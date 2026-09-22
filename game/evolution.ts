// game/evolution.ts — what the organism becomes between worlds.
//
// GAMEPLAY, NOT PHYSICS, and named as such. Nothing here is a measurement and
// none of it touches src/. A trait is a rule change the player chooses when a
// world ends, so the organism that walks into the next water is one they
// decided on — which is the thing the later worlds were missing: every aeon
// after the third was the same verbs against a bigger bar.
//
// ONE CHOICE PER BIRTH, THREE OFFERED. The offer is drawn from its own seeded
// generator rather than from `run.rand`, so choosing a trait never shifts the
// random sequence the world itself runs on. Every trait has a rank cap, and
// the offer only holds traits that can still rank up, so the choice cannot be
// a dead card.

import { type Run, maxIntegrity } from "./run.js";
import { rng } from "./wave.js";

export type Trait =
  | "membrane" | "reflex" | "cristae" | "capacitor" | "empathy"
  | "pack" | "chitin" | "phagocyte" | "surge";

export interface TraitInfo {
  name: string;
  max: number;
  /** What the NEXT rank does, for the card. */
  says: (rank: number) => string;
}

export const TRAITS: Readonly<Record<Trait, TraitInfo>> = {
  membrane: {
    name: "MEMBRANE", max: 3,
    says: () => "+1 MAXIMUM INTEGRITY, AND ONE MENDED NOW",
  },
  reflex: {
    name: "REFLEX", max: 2,
    says: () => "BURSTS CATCH ARMS 35% WIDER AND THROW THEM 40% HARDER",
  },
  cristae: {
    name: "CRISTAE", max: 2,
    says: () => "MITOCHONDRIA HOLD AND RECHARGE 50% MORE; REPAIR COSTS 25% LESS",
  },
  capacitor: {
    name: "CAPACITOR", max: 2,
    says: () => "BUILDINGS CHARGE 25% FASTER UNDER YOUR HAND",
  },
  empathy: {
    name: "EMPATHY", max: 2,
    says: () => "A KING CAN BE BONDED 8% SOONER, AND THE BOND TAKES 0.5 S LESS",
  },
  pack: {
    name: "PACK", max: 2,
    says: () => "YOUR COMPANION HOLDS 25% HARDER; ITS CALL RETURNS 25% SOONER",
  },
  chitin: {
    name: "CHITIN", max: 2,
    says: () => "+0.6 S OF MERCY AFTER EVERY HIT",
  },
  phagocyte: {
    name: "PHAGOCYTE", max: 2,
    says: (r) => `EVERY ${phagocyteEvery(r + 1)} HUNTERS KILLED MENDS ONE INTEGRITY`,
  },
  surge: {
    name: "SURGE", max: 2,
    says: () => "BURSTS COST 30% LESS STAMINA",
  },
};

export const TRAIT_ORDER: readonly Trait[] = Object.keys(TRAITS) as Trait[];

/** Cards offered at each birth. */
export const OFFER_SIZE = 3;

export interface Evolution {
  ranks: Partial<Record<Trait, number>>;
  /** The cards on the table between two worlds. Empty the rest of the time. */
  offer: Trait[];
  /** Hunters killed since PHAGOCYTE last mended you. */
  kills: number;
}

export function newEvolution(): Evolution {
  return { ranks: {}, offer: [], kills: 0 };
}

export function rankOf(run: Run, t: Trait): number {
  return run.evolution.ranks[t] ?? 0;
}

/** Kills per mend at a PHAGOCYTE rank; zero rank never mends. */
export function phagocyteEvery(rank: number): number {
  return rank <= 0 ? Infinity : rank === 1 ? 8 : 5;
}

/** Traits that can still rank up and mean something in this run. */
export function eligible(run: Run): Trait[] {
  return TRAIT_ORDER.filter((t) => rankOf(run, t) < TRAITS[t].max
    && (t !== "pack" || run.bond.companions.length > 0));
}

/**
 * Three different traits, or fewer when fewer can still rank up.
 *
 * Seeded from the state of the run rather than drawn from `run.rand`, so the
 * same birth offers the same cards and the world's own sequence is untouched.
 */
export function offerFor(run: Run): Trait[] {
  const pool = eligible(run);
  const draw = rng((run.world.aeon * 2654435761 + run.built * 40503 + run.nextId * 97) >>> 0);
  const out: Trait[] = [];
  while (out.length < OFFER_SIZE && pool.length > 0) {
    out.push(pool.splice(Math.floor(draw() * pool.length), 1)[0]);
  }
  return out;
}

/** Take one of the offered cards. False if it was not on the table. */
export function evolve(run: Run, t: Trait): boolean {
  if (!run.evolution.offer.includes(t)) return false;
  if (rankOf(run, t) >= TRAITS[t].max) return false;
  run.evolution.ranks[t] = rankOf(run, t) + 1;
  run.evolution.offer = [];
  if (t === "membrane") run.integrity = Math.min(maxIntegrity(run), run.integrity + 1);
  run.events.push({ kind: "evolved", trait: t, rank: rankOf(run, t) });
  return true;
}

/** Every trait held, for the pause screen and the report. */
export function held(run: Run): Array<[Trait, number]> {
  return TRAIT_ORDER.filter((t) => rankOf(run, t) > 0).map((t) => [t, rankOf(run, t)]);
}
