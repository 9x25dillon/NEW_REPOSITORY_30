import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  type Input, type Run, DRIVE_RADIUS, IFRAME, MAX_INTEGRITY, VOLLEY_WIND, birth, chargeTime, crown,
  kill, latticePitch, maxIntegrity, newBeast, reshape, startRun, step,
} from "../game/run.js";
import {
  CHARGE_CORE, CHARGE_TIME, ECHO_DELAY, GAMBIT_GAP, RIPOSTE_REFUND, catchReach, chargeLength,
  chargeReach,
  echoArms, riposte, riposteDamage, shockReach,
} from "../game/combat.js";
import { AEGIS_REACH, allies, callAlly } from "../game/allies.js";
import { activeLimbs, recruit, support, tameHealth, tameTime } from "../game/ecology.js";
import { REPAIR_COST, growMitochondrion, metabolise, mitoCapacity } from "../game/organelles.js";
import {
  TRAITS, TRAIT_ORDER, eligible, evolve, offerFor, rankOf,
} from "../game/evolution.js";
import { DASH_COST } from "../game/pilot.js";
import { cellFor } from "../game/lattice.js";
import { feed, structureFrom, volley } from "../game/world.js";

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
  run.throne.beat = VOLLEY_WIND + 0.005;
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
  for (let i = 0; i < 60 * 1.2; i++) {
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
  for (let i = 0; i < 60 * (VOLLEY_WIND + CHARGE_TIME + 0.2); i++) {
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
    for (let i = 0; i < 60 * 2.2; i++) {
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
  for (let i = 0; i < 60 * 1.2; i++) {
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
  while (run.bolts.length === 0 && t < 2) { step(run, IDLE, DT); t += DT; }
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
  step(run, { move: { x: 0, y: -1 }, grip: false, dash: true }, DT);
  assert.equal(run.fray.stats.caught, 2, "a new burst may");
});
