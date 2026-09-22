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
import { primeHelpings } from "./world.js";
import { rng } from "./wave.js";

export type Trait =
  | "membrane" | "reflex" | "cristae" | "capacitor" | "empathy"
  | "pack" | "chitin" | "phagocyte" | "surge"
  | "arsenal" | "cilia" | "anneal" | "prospect" | "gills"
  | "refine";

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
  arsenal: {
    name: "ARSENAL", max: 2,
    says: () => "EVERY DISCHARGE LANDS 15% HARDER",
  },
  cilia: {
    name: "CILIA", max: 2,
    says: () => "WHAT YOU HOLD COMES APART 20% SOONER",
  },
  anneal: {
    name: "ANNEAL", max: 2,
    says: () => "THE KING TAKES YOUR BUILDINGS 30% LESS OFTEN",
  },
  prospect: {
    name: "PROSPECT", max: 2,
    says: () => "THE WATER BRINGS YOU 25% MORE",
  },
  gills: {
    name: "GILLS", max: 2,
    says: () => "STAMINA COMES BACK 25% FASTER",
  },
  // THE ONE THAT NEVER RUNS OUT. A play report of 2026-09-22 reached aeon 29
  // and had every other trait at its cap by about the nineteenth birth, so
  // nine births offered nothing at all. This is what the deck falls back on,
  // and it is deliberately small: a run that takes it ten times is 30% harder
  // on a king, not a different game.
  refine: {
    name: "REFINE", max: Infinity,
    says: (r) => `EVERYTHING YOU DO TO A KING LANDS 3% HARDER (NOW ${3 * (r + 1)}%)`,
  },
};

export const TRAIT_ORDER: readonly Trait[] = Object.keys(TRAITS) as Trait[];

/** Cards offered at each birth, and the most a throne's primes can add. */
export const OFFER_SIZE = 3;
export const PRIME_CARDS = 3;

/** How many cards this king's helpings earned beyond the three. */
export function primeCards(run: Run): number {
  return Math.min(PRIME_CARDS, primeHelpings(run.throne.fed.length));
}

export interface Evolution {
  ranks: Partial<Record<Trait, number>>;
  /** The cards on the table between two worlds. Empty the rest of the time. */
  offer: Trait[];
  /** How many have been taken at THIS birth. The first is free; see `cardCost`. */
  taken: number;
  /** Hunters killed since PHAGOCYTE last mended you. */
  kills: number;
}

export function newEvolution(): Evolution {
  return { ranks: {}, offer: [], taken: 0, kills: 0 };
}

export function rankOf(run: Run, t: Trait): number {
  return run.evolution.ranks[t] ?? 0;
}

/** Kills per mend at a PHAGOCYTE rank; zero rank never mends. */
export function phagocyteEvery(rank: number): number {
  return rank <= 0 ? Infinity : rank === 1 ? 8 : 5;
}

/**
 * Traits that can still rank up and mean something in this run.
 *
 * REFINE is not in here: it is what the deck falls back on when this list is
 * shorter than the offer, so that a long run is never dealt an empty table.
 */
export function eligible(run: Run): Trait[] {
  return TRAIT_ORDER.filter((t) => t !== "refine" && rankOf(run, t) < TRAITS[t].max
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
  const size = OFFER_SIZE + primeCards(run);
  while (out.length < size && pool.length > 0) {
    out.push(pool.splice(Math.floor(draw() * pool.length), 1)[0]);
  }
  // A table is never empty, and never short: REFINE fills what is left.
  while (out.length < size) out.push("refine");
  return out;
}

/**
 * Cells the next card costs at this birth.
 *
 * The first is free and each one after doubles, because a rack that ends a run
 * holding a hundred and forty cells has nothing else to be spent on — the
 * throne is clamped, the crystal is built, and gathering stops paying. This is
 * where the surplus goes.
 */
export const BUY_BASE = 5;
export function cardCost(run: Run): number {
  const taken = run.evolution.taken;
  return taken <= 0 ? 0 : BUY_BASE * 2 ** (taken - 1);
}
export function canBuyCard(run: Run): boolean {
  return run.evolution.offer.length > 0 && run.cells.length >= cardCost(run);
}

/**
 * Take one of the offered cards.
 *
 * The first at each birth is free; every one after it is paid for in cells,
 * taken from the end of the rack. False if it was not on the table, if it is
 * already at its cap, or if the rack cannot cover it.
 */
export function evolve(run: Run, t: Trait): boolean {
  const at = run.evolution.offer.indexOf(t);
  if (at < 0) return false;
  if (rankOf(run, t) >= TRAITS[t].max) return false;
  const cost = cardCost(run);
  if (run.cells.length < cost) return false;
  if (cost > 0) run.cells.splice(run.cells.length - cost, cost);
  run.evolution.ranks[t] = rankOf(run, t) + 1;
  run.evolution.offer.splice(at, 1);
  run.evolution.taken++;
  if (t === "membrane") run.integrity = Math.min(maxIntegrity(run), run.integrity + 1);
  run.events.push({ kind: "evolved", trait: t, rank: rankOf(run, t), cost });
  return true;
}

/** Every trait held, for the pause screen and the report. */
export function held(run: Run): Array<[Trait, number]> {
  return TRAIT_ORDER.filter((t) => rankOf(run, t) > 0).map((t) => [t, rankOf(run, t)]);
}
