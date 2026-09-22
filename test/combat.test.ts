import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  type Input, type Run, DISCHARGE_GAIN, DRIVE_RADIUS, IFRAME, MAX_INTEGRITY, VOLLEY_WIND, birth,
  GNAW_TIME, LURE_TIME, arrivalRate, beast, chargeTime, crown, discharge, dischargeFalloff,
  dischargesToKill, dropLure, enterWorld, feedThrone, kill, latticePitch, liftCell, maxIntegrity,
  newBeast, reshape, startRun, step,
} from "../game/run.js";
import {
  CHARGE_CORE, CHARGE_TIME, ECHO_DELAY, FALTER_TIME, GAMBIT_GAP, GAMBIT_WIND, RIPOSTE_COOL,
  RIPOSTE_REFUND, RIPOSTE_STAGGER, catchReach, chargeLength, chargeReach, hurtSovereign,
  echoArms, riposte, riposteDamage, shockReach,
} from "../game/combat.js";
import { AEGIS_REACH, allies, callAlly } from "../game/allies.js";
import {
  TAME_REACH, activeLimbs, recruit, support, tameHealth, tameTime, vulnerable,
} from "../game/ecology.js";
import { REPAIR_COST, growMitochondrion, metabolise, mitoCapacity } from "../game/organelles.js";
import {
  BUY_BASE, TRAITS, TRAIT_ORDER, type Trait, cardCost, eligible, evolve, offerFor, primeCards,
  rankOf,
} from "../game/evolution.js";
import { DASH_COST } from "../game/pilot.js";
import { cellFor } from "../game/lattice.js";

/** Cells straight into the rack, without gathering them. */
function grant(run: Run, groups: string[]): void {
  for (const hm of groups) run.cells.push(cellFor(hm));
}
import {
  type Structure, feed, inheritanceOf, isPrime, nextHelpingBuys, structureFrom, volley,
  wildlifeFor,
} from "../game/world.js";
import { WATER } from "../src/gorkov.js";

const DT = 1 / 60;
const IDLE: Input = { move: { x: 0, y: 0 }, grip: false, dash: false };

function quiet(): Run {
  const run = startRun(43);
  run.entities = [];
  run.spawnIn = 1e6;
  run.world.calm = 1e6;
  run.rand = () => 0.99;
  return run;
}

/** A king awake beside you, holding its volleys, with no handle for the field to move it by. */
function fight(aeon = 1, dx = 60e-6, share = 1): Run {
  const run = quiet();
  feed(run.throne, cellFor("222"));
  crown(run);
  run.world.aeon = aeon;
  run.throne.x = run.you.x + dx;
  run.throne.y = run.you.y;
  run.throne.hp = run.throne.maxHp * share;
  run.throne.beat = 100;
  run.throne.anchored = true;
  return run;
}

/** An arm on its way to you from `from` metres north. */
function incoming(run: Run, from = 18e-6) {
  return { x: run.you.x, y: run.you.y - from, vx: 0, vy: 2.4e-4, life: 3, born: run.t };
}

/** Mid-burst, heading north: into an arm coming south. */
function bursting(run: Run): void {
  run.you.iframe = 0.1;
  run.you.dashX = 0;
  run.you.dashY = -1;
}

/** Put the next wind-up one frame away, long enough after the last gambit to be one. */
function nextIsGambit(run: Run): void {
  run.fray.lastGambit = -Infinity;
  // A gambit is decided a GAMBIT_WIND ahead, not a VOLLEY_WIND: that is the
  // whole of the fix for a shock nobody could get out of.
  run.throne.beat = GAMBIT_WIND + 0.005;
}

function kinds(run: Run): string[] { return run.events.map((e) => e.kind); }

// ── the riposte ─────────────────────────────────────────────────────────────

test("an arm that reaches you inside a burst is caught and thrown home", () => {
  const run = fight();
  run.wave.stamina = 40;
  bursting(run);
  run.bolts = [incoming(run)];
  riposte(run, false);
  const b = run.bolts[0];
  assert.ok(b.thrown, "caught, not merely survived");
  assert.ok(b.vx > 0 && Math.abs(b.vy) < 1e-12, "and it goes back at the king, which is due east");
  assert.equal(run.wave.stamina, 40 + RIPOSTE_REFUND, "a catch pays most of the burst back");
  assert.equal(run.fray.stats.caught, 1);

  const before = run.throne.hp;
  const worth = riposteDamage(run);
  for (let i = 0; i < 30 && run.bolts.length; i++) step(run, IDLE, DT);
  assert.equal(run.throne.hp, before - worth, "and it lands for its share of the king's mass");
  assert.equal(run.fray.stats.landed, 1);
  assert.equal(worth, Math.max(3, Math.round(run.throne.mass / 3 / volley(run.throne).length)));
});

test("a burst past an arm is a dodge, not a catch", () => {
  const run = fight();
  run.you.iframe = 0.1;
  run.you.dashX = 1;
  run.you.dashY = 0;
  run.bolts = [incoming(run)];
  riposte(run, false);
  assert.equal(run.fray.stats.caught, 0, "sideways across it");
  run.you.dashX = Math.cos(-Math.PI / 2 + 0.9);
  run.you.dashY = Math.sin(-Math.PI / 2 + 0.9);
  riposte(run, false);
  assert.equal(run.fray.stats.caught, 1, "fifty degrees off head-on still counts as into it");
});

test("outside a burst the same arm is a hit, and a thrown arm never is", () => {
  const hit = fight();
  hit.bolts = [incoming(hit, 4e-6)];
  step(hit, IDLE, DT);
  assert.equal(hit.integrity, MAX_INTEGRITY - 1, "no burst, no catch");

  const safe = fight();
  safe.bolts = [{ ...incoming(safe, 0), thrown: true }];
  step(safe, IDLE, DT);
  assert.equal(safe.integrity, MAX_INTEGRITY, "your own thrown arm passes through you");
});

test("guards do not stop your own thrown arms", () => {
  const run = quiet();
  const pitch = latticePitch(run);
  const x = run.you.x, y = run.you.y;
  run.structures = [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0], [3, 0], [4, 0]]
    .map(([i, j], id) => structureFrom(id, "432", x + i * pitch, y + j * pitch));
  reshape(run);
  const tip = activeLimbs(run)[0].cells[0];
  run.you.x = tip.x; run.you.y = tip.y;
  run.bolts = [{ x: tip.x, y: tip.y, vx: 0, vy: 0, life: 2, born: 0, thrown: true }];
  support(run, DT);
  assert.equal(run.bolts.length, 1, "a guard tip only answers the king's arms");
});

test("while you offer a bond, a caught arm is absorbed and nothing you threw does harm", () => {
  const run = fight(1, 60e-6, 0.25);
  const hp = run.throne.hp;
  bursting(run);
  run.bolts = [incoming(run)];
  riposte(run, true);
  assert.equal(run.bolts.length, 0, "absorbed");
  assert.ok(run.events.some((e) => e.kind === "riposte" && !e.thrown));

  run.bolts = [{ x: run.throne.x, y: run.throne.y, vx: 0, vy: 0, life: 1, born: 0, thrown: true }];
  riposte(run, true);
  assert.equal(run.throne.hp, hp, "the ceasefire covers what is already in flight");
  assert.equal(run.bolts.length, 0, "and it dissipates on the king");
});

test("a thrown arm can finish a king, and that is a birth", () => {
  const run = fight();
  run.throne.hp = 1;
  run.bolts = [{ x: run.throne.x, y: run.throne.y, vx: 0, vy: 0, life: 1, born: 0, thrown: true }];
  riposte(run, false);
  assert.equal(run.throne.hp, 0);
  assert.equal(run.phase, "birth");
});

test("a thrown arm scours the hunters on your plane that it passes through", () => {
  const run = fight(1, 200e-6);
  const e = newBeast(run, "vesicle", { x: run.you.x + 100e-6, y: run.you.y });
  e.layer = run.layer;
  run.entities = [e];
  run.bolts = [{ x: e.x, y: e.y, vx: 3e-4, vy: 0, life: 1, born: 0, thrown: true }];
  riposte(run, false);
  assert.equal(run.entities.length, 0);
  assert.ok(kinds(run).includes("kill"));
});

// ── the gambits ─────────────────────────────────────────────────────────────

/** When each gambit began, over `seconds` of a fight you stand well back from. */
function gambitTimes(aeon: number, seconds: number, helpings = 1): { winds: number; at: number[] } {
  const run = fight(aeon, 400e-6);
  // More helpings is a heavier king, and a heavier king winds up faster.
  for (let i = 1; i < helpings; i++) feed(run.throne, cellFor("622"));
  run.throne.hp = run.throne.maxHp;
  run.throne.beat = 2;
  const at: number[] = [];
  for (let i = 0; i < seconds * 60; i++) {
    run.integrity = MAX_INTEGRITY;
    run.bolts = [];
    run.fray.rings = [];
    run.throne.x = run.you.x + 400e-6; run.throne.y = run.you.y;
    step(run, IDLE, DT);
    for (const ev of run.events) if (ev.kind === "gambit") at.push(run.t);
    run.events.length = 0;
  }
  return { winds: run.fray.beats, at };
}

test("the first world has no gambits; later ones play one every GAMBIT_GAP, whatever the cadence", () => {
  assert.equal(gambitTimes(1, 40).at.length, 0, "the water people learn in is unchanged");
  // The last is the aeon-6 report's king: nineteen helpings, a wind-up every 1.15 s.
  for (const [aeon, helpings] of [[2, 1], [3, 1], [4, 1], [6, 19]] as const) {
    const { winds, at } = gambitTimes(aeon, 40, helpings);
    assert.ok(at.length >= 4, `aeon ${aeon} played ${at.length} gambits in ${winds} wind-ups`);
    assert.ok(at[0] >= GAMBIT_GAP - 1e-9, "a reign opens with plain volleys");
    for (let i = 1; i < at.length; i++) {
      assert.ok(at[i] - at[i - 1] >= GAMBIT_GAP - 1e-9, `aeon ${aeon}: ${at[i] - at[i - 1]} s apart`);
      assert.ok(at[i] - at[i - 1] < GAMBIT_GAP + 3.7, "and the first wind-up after the gap is one");
    }
  }
});

test("a charge runs down the lane it showed at the start of its wind, and stepping off is enough", () => {
  const run = fight(4);
  nextIsGambit(run);
  step(run, IDLE, DT);
  assert.equal(run.fray.next, "charge");
  assert.ok(run.events.some((e) => e.kind === "gambit" && e.gambit === "charge"));
  const lane = { ...run.fray.lane! };
  assert.ok(lane.dx < -0.999, "locked toward where you stood: due west");

  // Step north, off the lane. The lane does not follow.
  run.you.y -= 100e-6;
  const start = { x: run.throne.x, y: run.throne.y };
  for (let i = 0; i < 60 * 1.6; i++) {
    step(run, IDLE, DT);
    assert.deepEqual(run.fray.lane ?? lane, lane, "the telegraph never turns");
  }
  assert.equal(run.integrity, MAX_INTEGRITY, "off the lane, it misses");
  assert.ok(start.x - run.throne.x > chargeLength() * 0.9, "it ran the lane's length");
  assert.ok(Math.abs(run.throne.y - start.y) < 5e-6, "and only down the lane");
  assert.ok(run.fray.daze > 0 || run.fray.charge === 0, "and it is left dazed or spent");

  const stood = fight(4);
  nextIsGambit(stood);
  let cause = "";
  for (let i = 0; i < 60 * (GAMBIT_WIND + CHARGE_TIME + 0.2); i++) {
    step(stood, IDLE, DT);
    for (const ev of stood.events) if (ev.kind === "hit") cause = ev.cause;
  }
  assert.equal(cause, "charge", "standing in the lane is a hit");
});

test("a shock hits only as its front crosses you, stops at its ring, and a burst passes through", () => {
  const shocked = (dx: number, burst: boolean): string => {
    const run = fight(2, dx);
    nextIsGambit(run);
    let cause = "";
    for (let i = 0; i < 60 * 3.2; i++) {
      if (burst) run.you.iframe = 0.2;
      step(run, IDLE, DT);
      for (const ev of run.events) if (ev.kind === "hit") cause = ev.cause;
      if (i === 0) assert.equal(run.fray.next, "shock");
    }
    return cause;
  };
  const reach = shockReach(fight(2).throne);
  assert.equal(shocked(150e-6, false), "shock", "inside the ring, the front reaches you");
  assert.equal(shocked(reach + 40e-6, false), "", "outside the drawn ring, nothing");
  assert.equal(shocked(150e-6, true), "", "a burst as it passes goes through it");
});

test("a king fed twenty helpings charges with its core, not its whole body", () => {
  const run = fight(4, 60e-6);
  for (let i = 0; i < 19; i++) feed(run.throne, cellFor("622"));
  run.throne.awake = true;
  run.throne.hp = run.throne.maxHp;
  run.throne.anchored = true;
  assert.ok(chargeReach(run.throne) <= CHARGE_CORE + 12e-6);
  nextIsGambit(run);
  step(run, IDLE, DT);
  assert.equal(run.fray.next, "charge");
  // Inside its body, beside the lane: a body that size is where you fight it.
  run.you.y -= chargeReach(run.throne) + 30e-6;
  let hit = false;
  for (let i = 0; i < 60 * 1.6; i++) {
    step(run, IDLE, DT);
    if (run.events.some((e) => e.kind === "hit")) hit = true;
  }
  assert.equal(hit, false, "off the drawn lane is off the lane, however big the king");
});

test("an echo throws the arms it drew, turned half a gap, a beat after the volley", () => {
  const run = fight(3, 400e-6);
  nextIsGambit(run);
  step(run, IDLE, DT);
  assert.equal(run.fray.next, "echo");
  const shown = echoArms(run);
  const first = volley(run.throne).length;
  let t = 0;
  while (run.bolts.length === 0 && t < 3) { step(run, IDLE, DT); t += DT; }
  assert.equal(run.bolts.length, first, "the volley first");
  const thrownAt = run.t;
  while (run.bolts.length === first && run.t - thrownAt < ECHO_DELAY + 0.2) step(run, IDLE, DT);
  assert.ok(run.t - thrownAt >= ECHO_DELAY - 1e-9, "not before its delay");
  const second = run.bolts.slice(first);
  assert.equal(second.length, shown.length);
  second.forEach((b, i) => {
    const s = Math.hypot(b.vx, b.vy);
    assert.ok(Math.abs(b.vx / s - shown[i][0]) < 1e-9 && Math.abs(b.vy / s - shown[i][1]) < 1e-9,
      "every arm of the echo is one that was drawn");
  });
});

// ── companions, in the water ────────────────────────────────────────────────

function withCompanion(run: Run, aeon: number): void {
  const was = run.world.aeon;
  run.world.aeon = aeon;
  recruit(run);
  run.world.aeon = was;
  run.bond.ally = { x: run.you.x, y: run.you.y, target: -1, cool: 0, holding: false };
}

test("a Strider darts at a hunter, holds it until it comes apart, and it cannot strike you", () => {
  const run = quiet();
  withCompanion(run, 1);
  const e = newBeast(run, "vesicle", { x: run.you.x + 80e-6, y: run.you.y });
  e.layer = run.layer;
  run.entities = [e];
  let held = false;
  for (let i = 0; i < 60 * 3 && run.entities.length; i++) {
    step(run, IDLE, DT);
    if ((e.seized ?? 0) > 0) {
      held = true;
      assert.equal(e.strike, 0, "a hunter your companion has hold of cannot strike");
    }
  }
  assert.ok(held, "it took hold");
  assert.equal(run.entities.length, 0, "and it came apart");
  assert.equal(run.fray.stats.held, 1);
  assert.equal(run.integrity, MAX_INTEGRITY, "the strike it was winding never landed");
});

test("a Weaver tethers from your side; a Warden answers the hunter that is winding up", () => {
  const run = quiet();
  withCompanion(run, 3);
  const e = newBeast(run, "husk", { x: run.you.x + 110e-6, y: run.you.y });
  e.layer = run.layer;
  run.entities = [e];
  allies(run, DT);
  allies(run, DT);
  const a = run.bond.ally!;
  assert.equal(a.target, e.id);
  assert.ok(a.holding, "held at range");
  assert.ok(Math.hypot(a.x - run.you.x, a.y - run.you.y) < 50e-6, "without leaving you");

  const guard = quiet();
  withCompanion(guard, 2);
  const idle = newBeast(guard, "husk", { x: guard.you.x + 30e-6, y: guard.you.y });
  const winding = newBeast(guard, "husk", { x: guard.you.x - 70e-6, y: guard.you.y });
  idle.layer = winding.layer = guard.layer;
  winding.wind = 0.3;
  guard.entities = [idle, winding];
  allies(guard, DT);
  assert.equal(guard.bond.ally!.target, winding.id, "the threat before the body");
});

test("a Weaver's snare holds the king: no drag, no spin, no volley clock", () => {
  const run = fight(1, 90e-6);
  withCompanion(run, 3);
  run.throne.beat = 1;
  const at = { x: run.throne.x, y: run.throne.y, beat: run.throne.beat, spin: run.throne.spin };
  assert.equal(callAlly(run), "called");
  for (let i = 0; i < 60; i++) step(run, IDLE, DT);
  assert.equal(run.throne.x, at.x);
  assert.equal(run.throne.y, at.y);
  assert.equal(run.throne.beat, at.beat);
  assert.equal(run.throne.spin, at.spin);
  assert.equal(callAlly(run), "cooling", "and it is a cooldown, not a toggle");

  const settling = quiet();
  withCompanion(settling, 3);
  assert.equal(callAlly(settling), "no-king");
  assert.equal(settling.bond.readyAt, 0, "a refused call costs nothing");
});

test("a Warden's aegis clears the arms around you and turns what reaches you", () => {
  const run = fight(1, 300e-6);
  withCompanion(run, 2);
  run.bond.shieldReadyAt = Infinity;   // measure the call, not the passive block
  run.bolts = [incoming(run, 60e-6), incoming(run, AEGIS_REACH * 0.9)];
  assert.equal(callAlly(run), "called");
  assert.equal(run.bolts.length, 0);
  run.bolts = [incoming(run, 2e-6)];
  step(run, IDLE, DT);
  assert.equal(run.integrity, MAX_INTEGRITY);
  assert.ok(kinds(run).includes("guard"));
});

test("a Strider's rush makes bursts free and catches reach further", () => {
  const dashFrom = (rush: boolean): number => {
    const run = quiet();
    withCompanion(run, 1);
    if (rush) assert.equal(callAlly(run), "called");
    run.wave.stamina = 50;
    step(run, { move: { x: 1, y: 0 }, grip: false, dash: true }, DT);
    assert.ok(kinds(run).includes("dash"));
    return run.wave.stamina;
  };
  assert.ok(dashFrom(true) >= 50, "a burst in a rush costs nothing");
  assert.ok(dashFrom(false) < 50 - DASH_COST + 1, "outside one it costs what it always did");
  const run = quiet();
  withCompanion(run, 1);
  const plain = catchReach(run);
  callAlly(run);
  assert.equal(catchReach(run), plain * 1.5);
});

// ── mitochondria mend ───────────────────────────────────────────────────────

test("a station mends integrity in a lull at full stamina, and a hit or a thirst comes first", () => {
  const mended = (setup: (run: Run) => void): Run => {
    const run = quiet();
    run.structures = [structureFrom(7, "2", run.you.x, run.you.y)];
    run.cells = [cellFor("2"), cellFor("2")];
    growMitochondrion(run);
    run.organelles[0].energy = 60;
    run.integrity = 4;
    run.wave.stamina = 100;
    setup(run);
    for (let i = 0; i < 4 * 60; i++) { run.t += DT; metabolise(run, DT); }
    return run;
  };
  const calm = mended(() => {});
  assert.equal(calm.integrity, 5, "40 of stored energy is one point");
  assert.ok(calm.organelles[0].energy < 60 - REPAIR_COST + 1);
  assert.ok(calm.events.some((e) => e.kind === "repair"));

  const struck = mended((run) => { run.fray.lastHit = run.t + 3; });
  assert.equal(struck.integrity, 4, "not while you are still being hit");

  const thirsty = mended((run) => { run.wave.stamina = 20; run.organelles[0].energy = 30; });
  assert.equal(thirsty.integrity, 4, "stamina first, and a small store is spent on it");
});

// ── evolution ───────────────────────────────────────────────────────────────

test("a birth deals three different cards, from its own seed, and only cards that can rank up", () => {
  const run = fight(1, 60e-6);
  const probe = run.rand;
  run.rand = (() => { let n = 0; return () => { n++; return probe(); }; })();
  birth(run);
  const offer = run.evolution.offer;
  assert.equal(offer.length, 3);
  assert.equal(new Set(offer).size, 3);
  assert.deepEqual(offerFor(run), offer, "the same birth deals the same cards");
  assert.ok(!offer.includes("pack"), "no companion, no PACK");

  for (const t of TRAIT_ORDER) run.evolution.ranks[t] = TRAITS[t].max;
  assert.deepEqual(eligible(run), [], "nothing at its cap is offered");
  assert.equal(evolve(run, "membrane"), false, "and a card not on the table cannot be taken");
});

test("every trait does what its card says", () => {
  const take = (run: Run, t: keyof typeof TRAITS) => {
    run.evolution.offer = [t];
    assert.ok(evolve(run, t));
    assert.equal(rankOf(run, t), 1);
  };

  const membrane = quiet();
  membrane.integrity = 4;
  take(membrane, "membrane");
  assert.equal(maxIntegrity(membrane), MAX_INTEGRITY + 1);
  assert.equal(membrane.integrity, 5, "and one mended now");

  const reflex = fight();
  const reach = catchReach(reflex), worth = riposteDamage(reflex);
  take(reflex, "reflex");
  assert.ok(catchReach(reflex) > reach * 1.3 && riposteDamage(reflex) >= worth);

  const cristae = quiet();
  take(cristae, "cristae");
  assert.equal(mitoCapacity(cristae), 90);

  const capacitor = fight(1, 400e-6);
  capacitor.throne.anchored = false;
  const s = structureFrom(90, "2", capacitor.you.x, capacitor.you.y);
  capacitor.structures = [s];
  take(capacitor, "capacitor");
  capacitor.you.grip = 1;
  for (let i = 0; i < Math.ceil(chargeTime(s) * 0.76 * 60); i++) {
    step(capacitor, { move: { x: 0, y: 0 }, grip: true, dash: false }, DT);
    capacitor.you.x = s.x; capacitor.you.y = s.y;
  }
  assert.ok(Math.hypot(capacitor.you.x - s.x, capacitor.you.y - s.y) < DRIVE_RADIUS);
  assert.equal(s.charge, 1, "charged in three quarters of the time");

  const empathy = quiet();
  take(empathy, "empathy");
  assert.ok(Math.abs(tameHealth(empathy) - 0.38) < 1e-12);
  assert.equal(tameTime(empathy), 2.5);

  const chitin = fight();
  take(chitin, "chitin");
  chitin.bolts = [incoming(chitin, 2e-6)];
  step(chitin, IDLE, DT);
  assert.ok(Math.abs(chitin.iframe - (IFRAME + 0.6)) < 1e-9);

  const surge = quiet();
  take(surge, "surge");
  surge.wave.stamina = 50;
  step(surge, { move: { x: 1, y: 0 }, grip: false, dash: true }, DT);
  assert.ok(surge.wave.stamina > 50 - DASH_COST + DASH_COST * 0.29, "a burst costs 30% less");

  const phago = quiet();
  take(phago, "phagocyte");
  phago.integrity = 3;
  for (let i = 0; i < 8; i++) {
    const e = newBeast(phago, "vesicle", { x: phago.you.x, y: phago.you.y });
    phago.entities.push(e);
    kill(phago, e);
  }
  assert.equal(phago.integrity, 4, "eight kills mend one");

  const pack = quiet();
  withCompanion(pack, 1);
  assert.ok(eligible(pack).includes("pack"), "with a companion, PACK can be dealt");
});

test("a burst that carries you clean through an arm in one frame still catches it", () => {
  // Measured in the browser: a burst moved the body 32 um in its first frame
  // against a 24 um catch, so an arm six microns ahead was passed through and
  // never tested. The catch is swept over the frame now.
  const run = fight(1, 80e-6);
  run.wave.stamina = 60;
  run.bolts = [{ x: run.you.x, y: run.you.y - 6e-6, vx: 0, vy: 2.4e-4, life: 3, born: run.t }];
  step(run, { move: { x: 0, y: -1 }, grip: false, dash: true }, DT);
  assert.ok(kinds(run).includes("dash"));
  assert.equal(run.fray.stats.caught, 1, "the arm it burst through is caught");
  assert.ok(run.bolts.every((b) => b.thrown));
});

test("one burst catches one arm, so standing on the king is not a farm", () => {
  const run = fight();
  bursting(run);
  run.bolts = [incoming(run, 4e-6), incoming(run, 8e-6), incoming(run, 12e-6)];
  riposte(run, false);
  assert.equal(run.bolts.filter((b) => b.thrown).length, 1);
  assert.equal(run.fray.stats.caught, 1);
  riposte(run, false);
  assert.equal(run.fray.stats.caught, 1, "the same burst does not catch again");

  run.you.iframe = 0;
  run.you.dashCool = 0;
  run.wave.stamina = 60;
  run.bolts = run.bolts.filter((b) => !b.thrown);
  run.t += RIPOSTE_COOL;                         // and the recovery has passed
  run.fray.catchReadyAt = run.t;
  step(run, { move: { x: 0, y: -1 }, grip: false, dash: true }, DT);
  assert.equal(run.fray.stats.caught, 2, "a new burst may");
});

// ── the falter ──────────────────────────────────────────────────────────────

/** A gun that can kill this king outright, standing where it bears on it. */
function gunOn(run: Run): Structure {
  const s = structureFrom(700, "622", run.throne.x - 120e-6, run.throne.y);
  run.structures = [s];
  return s;
}

test("a blow that would kill a king from above its bond line leaves it faltering at one", () => {
  // Measured from four play reports: a 622 building takes 124 off at the edge
  // of safety and the kings in those runs woke with about 410, so one shot
  // crossed the whole window and no king was ever tamed in fourteen aeons.
  const run = fight();
  run.throne.hp = run.throne.maxHp;
  const gun = gunOn(run);
  assert.ok(run.throne.hp <= dischargeFalloff(gun, run.throne.x, run.throne.y)
    * gun.strength * DISCHARGE_GAIN, "the fixture must be a one-shot kill");
  discharge(run, gun);
  assert.equal(run.throne.hp, 1, "it cannot be taken below one across that line");
  assert.equal(run.phase, "reign", "so it is not a kill");
  assert.ok(run.fray.falter > 0 && run.fray.faltered);
  assert.ok(run.events.some((e) => e.kind === "falters"));
  assert.ok(vulnerable(run.throne, tameHealth(run)), "and it is open to a bond");
});

test("a faltering king stops, and nothing takes it lower while it is open", () => {
  const run = fight(6);
  run.throne.hp = run.throne.maxHp;
  discharge(run, gunOn(run));
  const at = { x: run.throne.x, y: run.throne.y, beat: run.throne.beat, spin: run.throne.spin };
  run.structures = [];
  for (let i = 0; i < 60 * (FALTER_TIME - 0.2); i++) {
    step(run, { move: { x: 0, y: 0 }, grip: true, dash: false }, DT);
    assert.equal(run.throne.hp, 1, "your hand cannot finish it either");
  }
  assert.equal(run.throne.x, at.x);
  assert.equal(run.throne.y, at.y);
  assert.equal(run.throne.beat, at.beat, "no volley clock");
  assert.equal(run.throne.spin, at.spin);
  assert.equal(run.bolts.length, 0, "and it threw nothing");
  assert.equal(run.phase, "reign");
});

test("once the moment passes it dies as it always did, and it comes only once a king", () => {
  const run = fight();
  run.throne.hp = run.throne.maxHp;
  discharge(run, gunOn(run));
  for (let i = 0; i < 60 * (FALTER_TIME + 0.2); i++) step(run, IDLE, DT);
  assert.equal(run.fray.falter, 0, "the moment is over");
  assert.equal(run.phase, "reign");
  discharge(run, gunOn(run));
  assert.equal(run.throne.hp, 0, "and now it dies");
  assert.equal(run.phase, "birth");

  // The next king gets its own moment, and healing back over the line does not
  // buy a second one from the same king.
  const again = fight();
  again.throne.hp = again.throne.maxHp;
  discharge(again, gunOn(again));
  assert.ok(again.fray.faltered);
  again.fray.falter = 0;
  again.throne.hp = again.throne.maxHp;
  again.events.length = 0;
  discharge(again, gunOn(again));
  assert.equal(again.fray.falter, 0, "no second falter from one king");
  assert.ok(!again.events.some((e) => e.kind === "falters"));
  enterWorld(again);
  assert.equal(again.fray.faltered, false, "a new reign is a new king");
});

test("the falter offers the bond, it does not give it", () => {
  const run = fight();
  run.throne.hp = run.throne.maxHp;
  run.you.x = run.throne.x + TAME_REACH * 2;
  discharge(run, gunOn(run));
  for (let i = 0; i < 60 * FALTER_TIME; i++) {
    step(run, { move: { x: 0, y: 0 }, grip: false, dash: false, tame: true }, DT);
  }
  assert.equal(run.phase, "reign", "too far away to bond, however open it stands");
  assert.equal(run.bond.companions.length, 0);
  assert.ok(run.fray.falter < 1e-6, "and the moment ran out while you crossed");
  // Close enough, and held: the bond is still the thing that tames it.
  run.you.x = run.throne.x + TAME_REACH * 0.5;
  for (let i = 0; i < 60 * (tameTime(run) + 0.2); i++) {
    step(run, { move: { x: 0, y: 0 }, grip: false, dash: false, tame: true }, DT);
  }
  assert.equal(run.phase, "birth");
  assert.equal(run.bond.companions.length, 1);
});

// ── the throne, and what a prime helping is worth ───────────────────────────

test("a helping that lands on a prime says so, pays, and deals another card", () => {
  const run = quiet();
  run.you.x = run.throne.x; run.you.y = run.throne.y;
  grant(run, ["622", "622", "622", "622", "622"]);
  const before = run.score;
  assert.equal(feedThrone(run, 0), "fed");
  assert.ok(!run.events.some((e) => e.kind === "prime"), "one is not prime");
  run.events.length = 0;
  assert.equal(feedThrone(run, 0), "fed");
  const prime = run.events.find((e) => e.kind === "prime");
  assert.ok(prime && prime.n === 2, "two is");
  assert.ok(run.score > before);
  // Two helpings, two primes short of nothing: the birth deals four cards.
  run.phase = "reign";
  run.throne.awake = true;
  run.throne.hp = 0;
  birth(run);
  assert.equal(primeCards(run), 1);
  assert.equal(run.evolution.offer.length, 4);
});

test("a prime helping buys what mass no longer can, and the panel can say so first", () => {
  const run = quiet();
  run.you.x = run.throne.x; run.you.y = run.throne.y;
  grant(run, new Array(20).fill("622"));
  for (let i = 0; i < 16; i++) assert.equal(feedThrone(run, 0), "fed");
  assert.equal(run.throne.fed.length, 16);
  assert.ok(isPrime(17), "the next helping makes seventeen");
  assert.deepEqual(nextHelpingBuys(run.throne, cellFor("622"), run.world.aeon),
    ["WHAT THE NEXT WORLD KEEPS"], "which buys the one thing mass had stopped buying");
  const keep = inheritanceOf(run.throne);
  assert.equal(feedThrone(run, 0), "fed");
  assert.ok(inheritanceOf(run.throne) > keep);
});

// ── evolution: a deck that does not run out, and cells that go somewhere ────

test("the deck never deals an empty table, and REFINE is what it falls back on", () => {
  const run = fight();
  for (const t of TRAIT_ORDER) {
    if (t !== "refine") run.evolution.ranks[t] = TRAITS[t].max;
  }
  assert.deepEqual(eligible(run), [], "every finite trait is at its cap");
  const offer = offerFor(run);
  assert.equal(offer.length, 3);
  assert.ok(offer.every((t) => t === "refine"));
  run.evolution.offer = offer;
  assert.ok(evolve(run, "refine"));
  assert.equal(rankOf(run, "refine"), 1);
  run.evolution.offer = offerFor(run);
  run.evolution.taken = 0;                      // as the next birth does
  assert.ok(evolve(run, "refine"), "and it can be taken again, for ever");
  assert.equal(rankOf(run, "refine"), 2);
});

test("the first card at a birth is free and the rest are bought from the rack", () => {
  const run = fight();
  run.evolution.offer = ["membrane", "chitin", "surge", "gills"];
  run.cells = [];
  assert.equal(cardCost(run), 0);
  assert.ok(evolve(run, "membrane"), "the first is free with an empty rack");
  assert.equal(cardCost(run), BUY_BASE);
  assert.equal(evolve(run, "chitin"), false, "and the second is not");
  grant(run, new Array(BUY_BASE + 10).fill("2"));
  const had = run.cells.length;
  assert.ok(evolve(run, "chitin"));
  assert.equal(run.cells.length, had - BUY_BASE, "paid from the rack");
  assert.equal(cardCost(run), BUY_BASE * 2, "and the next one doubles");
  assert.deepEqual(run.evolution.offer, ["surge", "gills"], "what was taken leaves the table");
  assert.equal(run.evolution.taken, 2);
});

test("every new trait does what its card says", () => {
  const take = (run: Run, t: Trait) => {
    run.evolution.offer = [t];
    run.evolution.taken = 0;
    assert.ok(evolve(run, t));
  };

  const arsenal = fight(1, 200e-6);
  arsenal.throne.hp = arsenal.throne.maxHp;
  const plain = dischargesToKill(arsenal);
  take(arsenal, "arsenal");
  assert.ok(dischargesToKill(arsenal) <= plain, "harder discharges need no more of them");

  // A bar big enough that a hundred is nowhere near its bond line, so what is
  // measured here is the trait and not the falter's floor.
  const refine = fight();
  refine.throne.maxHp = 4000;
  refine.throne.hp = 4000;
  take(refine, "refine");
  hurtSovereign(refine, 100);
  assert.equal(4000 - refine.throne.hp, 103, "three per cent, through the one door");

  const cilia = quiet();
  take(cilia, "cilia");
  const e = newBeast(cilia, "vesicle", { x: cilia.you.x, y: cilia.you.y });
  e.layer = cilia.layer;
  cilia.entities = [e];
  cilia.wave.amplitude = cilia.wave.maxAmplitude;
  cilia.you.grip = 1;
  let held = 0;
  for (let i = 0; i < 120 && cilia.entities.length; i++) {
    step(cilia, { move: { x: 0, y: 0 }, grip: true, dash: false }, DT);
    if (cilia.entities.length) held = e.held;
  }
  assert.ok(held < beast("vesicle").hold, `it came apart early (${held.toFixed(2)} s)`);

  const prospect = quiet();
  const rate = arrivalRate(prospect);
  take(prospect, "prospect");
  assert.ok(Math.abs(arrivalRate(prospect) - rate * 1.25) < 1e-12);

  const gills = quiet();
  gills.wave.stamina = 50;
  step(gills, IDLE, DT);
  const plainGain = gills.wave.stamina - 50;
  const fast = quiet();
  take(fast, "gills");
  fast.wave.stamina = 50;
  step(fast, IDLE, DT);
  assert.ok(fast.wave.stamina - 50 > plainGain * 1.2, "the reservoir fills faster");

  const anneal = fight(1, 60e-6);
  take(anneal, "anneal");
  anneal.rand = () => 0.0009;          // just inside the plain appetite, not the annealed one
  anneal.structures = [structureFrom(5, "2", anneal.throne.x + 40e-6, anneal.throne.y)];
  anneal.throne.hp = anneal.throne.maxHp;
  step(anneal, IDLE, DT);
  assert.equal(anneal.structures.length, 1, "it went hungry this frame");
});

// ── the lure, and the two that do not want you ──────────────────────────────

test("a lure takes a cell, sings for its time, and everything walks toward it instead", () => {
  const run = fight(1, 260e-6);
  grant(run, ["2"]);
  run.throne.hp = run.throne.maxHp;
  const e = newBeast(run, "vesicle", { x: run.you.x + 120e-6, y: run.you.y - 200e-6 });
  e.layer = run.layer;
  run.entities = [e];

  assert.equal(dropLure(run, 0), "placed");
  assert.equal(run.cells.length, 0, "it costs the cell");
  const at = { x: run.lure!.x, y: run.lure!.y };
  assert.ok(Math.hypot(at.x - run.you.x, at.y - run.you.y) < 1e-9, "left where you stood");

  // Walk away from it, and watch what follows the lure rather than you.
  run.you.y -= 320e-6;
  const kingWas = Math.hypot(run.throne.x - at.x, run.throne.y - at.y);
  const beastWas = Math.hypot(e.x - at.x, e.y - at.y);
  for (let i = 0; i < 90; i++) {
    run.integrity = MAX_INTEGRITY;
    step(run, IDLE, DT);
    run.events.length = 0;
  }
  assert.ok(Math.hypot(run.throne.x - at.x, run.throne.y - at.y) < kingWas,
    "the king drags itself toward the lure");
  assert.ok(Math.hypot(e.x - at.x, e.y - at.y) < beastWas, "and so does the hunter");

  for (let i = 0; i < 60 * LURE_TIME; i++) { step(run, IDLE, DT); run.events.length = 0; }
  assert.equal(run.lure, null, "and then it stops singing");
});

test("a tender mends what you crowned, and being held stops it", () => {
  const run = fight(5, 300e-6);
  run.throne.hp = run.throne.maxHp * 0.5;
  const t = newBeast(run, "tender", { x: run.throne.x + 60e-6, y: run.throne.y });
  t.layer = run.layer;
  run.entities = [t];
  const hurt = run.throne.hp;
  for (let i = 0; i < 120; i++) { step(run, IDLE, DT); run.events.length = 0; }
  assert.ok(run.throne.hp > hurt, "it puts health back");
  assert.ok(run.throne.hp <= run.throne.maxHp, "and never past the bar it woke with");

  const stopped = run.throne.hp;
  t.seized = 1;                                  // a companion has hold of it
  for (let i = 0; i < 60; i++) { step(run, IDLE, DT); run.events.length = 0; }
  assert.equal(run.throne.hp, stopped, "held, it mends nothing");
});

test("a leech eats a building, and lifting it out from under one answers it", () => {
  const run = quiet();
  const s = structureFrom(11, "2", run.you.x + 200e-6, run.you.y);
  run.structures = [s];
  reshape(run);
  const e = newBeast(run, "leech", { x: s.x + 40e-6, y: s.y });
  e.layer = run.layer;
  run.entities = [e];
  for (let i = 0; i < 60 * (GNAW_TIME + 2) && run.structures.length; i++) {
    step(run, IDLE, DT);
    run.events.length = 0;
  }
  assert.equal(run.structures.length, 0, "it finishes the building");

  const lifted = quiet();
  const s2 = structureFrom(12, "2", lifted.you.x + 220e-6, lifted.you.y);
  lifted.structures = [s2];
  reshape(lifted);
  const e2 = newBeast(lifted, "leech", { x: s2.x + 30e-6, y: s2.y });
  e2.layer = lifted.layer;
  lifted.entities = [e2];
  for (let i = 0; i < 60 * 2; i++) { step(lifted, IDLE, DT); lifted.events.length = 0; }
  assert.ok(e2.dwell > 0, "it has fastened on");
  lifted.you.x = s2.x; lifted.you.y = s2.y;      // walk over to it
  assert.equal(liftCell(lifted), "lifted");
  step(lifted, IDLE, DT);
  assert.equal(e2.dwell, 0, "and there is nothing left to gnaw");
  assert.equal(lifted.cells.length, 1, "the cell is back in your hand");
});

test("a building you are standing over cannot be fastened onto", () => {
  // Not a rule anybody wrote: your idle lattice pins a body of the leech's
  // contrast to the nearest node, and near you that out-pulls its swimming.
  const run = quiet();
  const s = structureFrom(13, "2", run.you.x, run.you.y);
  run.structures = [s];
  reshape(run);
  const e = newBeast(run, "leech", { x: s.x + 10e-6, y: s.y });
  e.layer = run.layer;
  run.entities = [e];
  let worst = 0;
  for (let i = 0; i < 60 * 4; i++) {
    step(run, IDLE, DT);
    run.events.length = 0;
    worst = Math.max(worst, e.dwell);
  }
  assert.equal(run.structures.length, 1, "it never finishes one at your feet");
  assert.ok(worst < GNAW_TIME * 0.5, `and never gets far into it (${worst.toFixed(2)} s)`);
});

test("later waters carry them, and the early ones do not", () => {
  assert.ok(!wildlifeFor(WATER, 3, 50).includes("leech"));
  assert.ok(wildlifeFor(WATER, 4, 50).includes("leech"));
  assert.ok(!wildlifeFor(WATER, 4, 50).includes("tender"));
  assert.ok(wildlifeFor(WATER, 5, 50).includes("tender"));
});

test("a gambit is drawn for longer than the volley it replaces", () => {
  // Twelve hits from thirty shocks in play, because a front that starts at a
  // two-hundred-micron king's edge with half a second of warning cannot be
  // walked out of. The warning is what changed.
  const run = fight(2, 200e-6);
  nextIsGambit(run);
  step(run, IDLE, DT);
  assert.equal(run.fray.next, "shock");
  assert.ok(run.throne.beat > VOLLEY_WIND,
    "it is announced while there is still more than a volley's warning left");
  let warned = 0;
  while (run.fray.next === "shock") { step(run, IDLE, DT); warned += DT; }
  assert.ok(warned > VOLLEY_WIND, `a shock warns for ${warned.toFixed(2)} s`);
  assert.ok(Math.abs(warned - GAMBIT_WIND) < 0.1);

  // A plain volley still draws its arms at the old half-second.
  const plain = fight(1, 200e-6);
  plain.throne.beat = GAMBIT_WIND + 0.005;
  let toArms = 0;
  while (!plain.events.some((e) => e.kind === "aiming")) {
    plain.events.length = 0;
    step(plain, IDLE, DT);
    toArms += DT;
  }
  assert.ok(Math.abs(plain.throne.beat - VOLLEY_WIND) < 0.02,
    "the arms come up with half a second to go, as they always did");
  assert.ok(toArms > 0.3);
});

test("a thrown arm is worth twice what it was, and only one every RIPOSTE_COOL", () => {
  const run = fight(1, 90e-6);
  run.throne.maxHp = 4000;
  run.throne.hp = 4000;
  const worth = riposteDamage(run);
  assert.equal(worth, Math.max(3, Math.round(2 / 3 * run.throne.mass / volley(run.throne).length)));

  bursting(run);
  run.bolts = [incoming(run)];
  riposte(run, false, DT, run.you);
  assert.equal(run.fray.stats.caught, 1);
  assert.ok(run.fray.catchReadyAt > run.t, "and the next one has to wait");

  // Inside the recovery a burst still eats the arm: your i-frames saved you
  // either way, and nothing is lost by trying.
  run.fray.burstCaught = false;
  const stamina = run.wave.stamina;
  run.bolts.push(incoming(run));
  riposte(run, false, DT, run.you);
  assert.equal(run.bolts.filter((b) => !b.thrown).length, 0, "the arm is gone");
  assert.equal(run.fray.stats.caught, 1, "but it was not thrown home");
  assert.equal(run.wave.stamina, stamina, "and it paid nothing back");

  run.t += RIPOSTE_COOL;
  run.fray.burstCaught = false;
  run.bolts = [incoming(run)];
  riposte(run, false, DT, run.you);
  assert.equal(run.fray.stats.caught, 2, "after the recovery it throws again");
});

test("an arm that lands knocks the next volley back, but never one already drawn", () => {
  const run = fight(1, 60e-6);
  run.throne.maxHp = 4000;
  run.throne.hp = 4000;
  run.throne.beat = 2;
  run.bolts = [{ x: run.throne.x, y: run.throne.y, vx: 0, vy: 0, life: 1, born: 0, thrown: true }];
  riposte(run, false, DT, run.you);
  assert.ok(Math.abs(run.throne.beat - (2 + RIPOSTE_STAGGER)) < 1e-9, "the next volley is later");

  const winding = fight(1, 60e-6);
  winding.throne.maxHp = 4000;
  winding.throne.hp = 4000;
  winding.throne.beat = 0.2;                     // arms already drawn
  winding.bolts = [{
    x: winding.throne.x, y: winding.throne.y, vx: 0, vy: 0, life: 1, born: 0, thrown: true,
  }];
  riposte(winding, false, DT, winding.you);
  assert.equal(winding.throne.beat, 0.2, "what it has shown you, it throws on time");
});
