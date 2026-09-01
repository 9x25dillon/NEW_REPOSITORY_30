import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  ARENA_H, ARENA_W, BEASTS, MAX_INTEGRITY, START,
  beast, clusterParticle, crown, discharge, enterWorld, labelOf, newBeast,
  DISCHARGE_GAIN, LOBE_RANGE, VOLLEY_WIND, bearsOn, dischargesToKill, feedThrone,
  latticePitch, placeCell, readoutFor, wearRate,
  startRun, step,
  type Entity, type Input, type Run,
} from "../game/run.js";
import { assemble, cellFor, motif } from "../game/lattice.js";
import { lobes } from "../game/shape.js";
import { snap } from "../game/body.js";
import { cadence, emptyThrone, feed, structureFrom, volley } from "../game/world.js";
import { CROSSOVER_RADIUS_ORDER, WATER, contrastFactor } from "../src/gorkov.js";

const DT = 1 / 60;
const CENTRE = { x: START.x + ARENA_W / 2, y: START.y + ARENA_H / 2 };

const IDLE: Input = { move: { x: 0, y: 0 }, grip: false, dash: false };

/** Put the body somewhere, for a test that is about what happens after. */
function stand(run: Run, x: number, y: number): void {
  run.you.x = x;
  run.you.y = y;
}

/**
 * Drive toward a point.
 *
 * Nothing in the game can teleport any more, the bot included: it has a body,
 * so every intention has to be spelt as a stick deflection and then WAITED
 * for. That is the point of writing it this way. If a policy expressed as
 * "lean toward the thing and close your hand" cannot play this, then what is
 * shipping is not playable either, and no unit test would have said so.
 */
function seek(
  run: Run, tx: number, ty: number, grip = false, dash = false,
): Input {
  const dx = tx - run.you.x;
  const dy = ty - run.you.y;
  const r = Math.hypot(dx, dy);
  if (r < 4e-6) return { move: { x: 0, y: 0 }, grip, dash };
  const m = Math.min(1, r / 26e-6);
  // Moving IS driving. The idle lattice is a crawl, so any policy that wants to
  // be somewhere else has to pay the stamina to get there, and a bot that
  // forgot to spent four hundred seconds shuffling and never crowned anything.
  return { move: { x: (dx / r) * m, y: (dy / r) * m }, grip: grip || r > 22e-6, dash };
}

/** How far the body is from a point. */
function distTo(run: Run, x: number, y: number): number {
  return Math.hypot(run.you.x - x, run.you.y - y);
}

function seedBeast(run: Run, species: string, x: number, y: number): Entity {
  const e = newBeast(run, species, { x, y });
  run.entities.push(e);
  return e;
}

function seedMotif(run: Run, parts: string[], x: number, y: number): Entity {
  const e: Entity = {
    id: run.nextId++, faction: "motif", species: "", parts,
    x, y, ang: 0, held: 0, dwell: 0, partner: -1, flash: 0, spin: 0, trail: [],
    wind: 0, strike: 0, sx: 0, sy: 0, cool: 0, layer: 0,
  };
  run.entities.push(e);
  return e;
}

/** Give the run some cells without having to gather them. */
function grant(run: Run, groups: string[]): void {
  for (const hm of groups) run.cells.push(cellFor(hm));
}

// ── the wildlife is still physics ───────────────────────────────────────────

test("each beast differs by its contrast factor, not by a stat block", () => {
  const phi = (id: string) => contrastFactor(beast(id).particle, WATER);
  assert.ok(phi("vesicle") < 0, "lipid: your node pushes it away");
  assert.ok(phi("splitter") < 0);
  assert.ok(phi("husk") > 0, "denser than water: your node REELS IT IN");
  assert.ok(beast("mote").particle.radius < CROSSOVER_RADIUS_ORDER, "under the crossover");
  assert.equal(Object.keys(BEASTS).length, 4);
});

test("only a strike hurts you, and a body in your hand cannot strike", () => {
  // ALL DAMAGE IS TELEGRAPHED. A hunter used to hurt you by being near you,
  // which is not something you can read or answer — and because anything
  // sharing your contrast is drawn into your node by your own drive, gathering
  // filled your lap with things that damaged you for existing. The first real
  // run of the shipped build took six of its seven hits that way, and one from
  // an actual strike.
  const run = startRun(3);
  run.entities = [];
  stand(run, CENTRE.x, CENTRE.y);

  // Sitting on you, not striking: a body in the water and nothing more.
  const idle = seedBeast(run, "vesicle", CENTRE.x, CENTRE.y);
  for (let i = 0; i < 30; i++) {
    idle.x = CENTRE.x; idle.y = CENTRE.y; idle.wind = 0; idle.strike = 0;
    step(run, IDLE, DT);
    run.events.length = 0;
  }
  assert.equal(run.integrity, MAX_INTEGRITY, "drifting into you is not an attack");

  // Mid-strike, it is.
  const striking = [idle, seedBeast(run, "vesicle", CENTRE.x, CENTRE.y),
    seedBeast(run, "vesicle", CENTRE.x, CENTRE.y)];
  for (const e of striking) { e.x = CENTRE.x; e.y = CENTRE.y; e.strike = 0.2; e.held = 0; }
  step(run, IDLE, DT);
  assert.equal(run.integrity, MAX_INTEGRITY - 1, "three at once is still one hit");
  for (const e of striking) { e.x = CENTRE.x; e.y = CENTRE.y; e.strike = 0.2; }
  step(run, IDLE, DT);
  assert.equal(run.integrity, MAX_INTEGRITY - 1, "mercy holds");

  // And being caught takes the strike away before it happens.
  const caught = seedBeast(run, "vesicle", CENTRE.x + 60e-6, CENTRE.y);
  run.wave.amplitude = run.wave.maxAmplitude;
  run.you.grip = 1;
  step(run, { move: { x: 0, y: 0 }, grip: true, dash: false }, DT);
  assert.ok(caught.wind > 0, "it gathers itself");
  caught.held = 0.2;
  step(run, { move: { x: 0, y: 0 }, grip: true, dash: false }, DT);
  assert.equal(caught.wind, 0);
  assert.equal(caught.strike, 0, "in your hand it can do nothing at all");
});

// ── it tells you before it does it ──────────────────────────────────────────

test("a hunter gathers itself before it commits, and stands still to do it", () => {
  const run = startRun(3);
  run.entities = [];
  stand(run, CENTRE.x, CENTRE.y);
  const v = seedBeast(run, "vesicle", CENTRE.x + 70e-6, CENTRE.y);
  const x0 = v.x;

  step(run, IDLE, DT);
  assert.ok(v.wind > 0, "inside strike range it should coil");
  assert.ok(run.events.some((e) => e.kind === "coil"), "and say so");

  // While it gathers it does not CLOSE. Its own swimming stops; the water is
  // still the water, and here the water is pushing it out — it shares your sign
  // and it is seventy microns off your node, so the nearest trap it answers to
  // is the next one out, not the one you are standing in.
  const before = Math.hypot(v.x - run.you.x, v.y - run.you.y);
  for (let i = 0; i < 6; i++) { step(run, IDLE, DT); run.events.length = 0; }
  const after = Math.hypot(v.x - run.you.x, v.y - run.you.y);
  assert.ok(after >= before - 1e-9,
    `a gathering body does not close (${(before * 1e6).toFixed(1)} -> ${(after * 1e6).toFixed(1)} um)`);
  assert.ok(v.x > x0 - 1e-9, "and it certainly does not swim at you");

  for (let i = 0; i < 200 && v.wind > 0; i++) { step(run, IDLE, DT); run.events.length = 0; }
  assert.ok(v.strike > 0, "then it goes");
});

test("a strike goes where it was pointed, not where you went", () => {
  // The whole reason stepping out of one works. It locks its direction at the
  // moment it commits, so the line drawn during the coil is the line it takes.
  const run = startRun(5);
  run.entities = [];
  stand(run, CENTRE.x, CENTRE.y);
  const v = seedBeast(run, "vesicle", CENTRE.x + 70e-6, CENTRE.y);

  for (let i = 0; i < 200 && v.strike === 0; i++) { step(run, IDLE, DT); run.events.length = 0; }
  assert.ok(v.strike > 0, "it should have committed by now");
  assert.ok(v.sx < -0.9 && Math.abs(v.sy) < 0.3,
    `it committed at where you were (${v.sx.toFixed(2)}, ${v.sy.toFixed(2)})`);

  // Now leave. It is already going, and it goes past.
  stand(run, CENTRE.x, CENTRE.y - 200e-6);
  const y0 = v.y;
  const x1 = v.x;
  for (let i = 0; i < 200 && v.strike > 0; i++) { step(run, IDLE, DT); run.events.length = 0; }
  assert.ok(Math.abs(v.y - y0) < 8e-6, "a strike does not steer");
  assert.ok(v.x < x1 - 40e-6,
    `it should carry on west regardless (${(x1 * 1e6).toFixed(0)} -> ${(v.x * 1e6).toFixed(0)} um)`);
});

test("a body in your hand cannot strike at all", () => {
  const run = startRun(7);
  run.entities = [];
  stand(run, CENTRE.x, CENTRE.y);
  const v = seedBeast(run, "vesicle", CENTRE.x + 70e-6, CENTRE.y);
  run.wave.amplitude = run.wave.maxAmplitude;
  run.you.grip = 1;

  step(run, IDLE, DT);
  assert.ok(v.wind > 0, "it starts to gather");

  // Close on it. Being caught is not a damage state — it is the removal of
  // everything the thing was about to do.
  v.held = 0.2;
  step(run, { move: { x: 0, y: 0 }, grip: true, dash: false }, DT);
  assert.equal(v.wind, 0, "the coil is gone");
  assert.equal(v.strike, 0);
});

test("the king's arms stop turning while it is winding up", () => {
  // A telegraph that is still rotating is a rumour. What is drawn during the
  // wind has to be what gets thrown.
  const run = startRun(11);
  grant(run, ["622"]);
  stand(run, run.throne.x, run.throne.y);
  feedThrone(run, 0);
  crown(run);
  stand(run, run.throne.x + 220e-6, run.throne.y);

  const dirs = () => volley(run.throne).map(([x, y]) => `${x.toFixed(6)},${y.toFixed(6)}`);

  // Up to the edge of the warning window. Bounded and kept alive: the beat only
  // advances while it is reigning, so a death here would stop the clock.
  let announced = false;
  for (let i = 0; i < 900 && run.throne.beat > VOLLEY_WIND; i++) {
    run.integrity = MAX_INTEGRITY;
    step(run, IDLE, DT);
    announced ||= run.events.some((e) => e.kind === "aiming");
    run.events.length = 0;
  }
  assert.ok(run.throne.beat <= VOLLEY_WIND, "it should reach the warning window");
  assert.ok(announced, "and announce it");
  const shown = dirs();

  // Now step until it actually throws, and compare against the arms it was
  // holding on the frame it let go — NOT afterwards, because the beat resets and
  // the spin starts again the moment the volley is away.
  let thrown: string[] = [];
  for (let i = 0; i < 900 && thrown.length === 0; i++) {
    run.integrity = MAX_INTEGRITY;
    const holding = dirs();
    step(run, IDLE, DT);
    if (run.events.some((e) => e.kind === "volley")) thrown = holding;
    run.events.length = 0;
  }
  assert.ok(thrown.length > 0, "it should throw");
  assert.deepEqual(thrown, shown, "the arms it showed are the arms it throws");
});

// ── what stays, and what it does while you are away ─────────────────────────

test("a structure gathers and merges without you touching it", () => {
  // The whole reason to build. Two motifs left inside a structure's holding
  // field come together and bind with no grip from the player at all, so what
  // you put up keeps working while you are somewhere else.
  const run = startRun(5);
  run.entities = [];
  const s = structureFrom(999, "622", CENTRE.x, CENTRE.y);
  run.structures.push(s);

  const [hx, hy] = s.lobes.map(([dx, dy]) => [s.x + dx * s.reach, s.y + dy * s.reach])[0];
  seedMotif(run, ["a2"], hx - 6e-6, hy);
  seedMotif(run, ["a2"], hx + 6e-6, hy);

  stand(run, START.x + 40e-6, START.y + 40e-6);
  for (let i = 0; i < 90; i++) { step(run, IDLE, DT); run.events.length = 0; }

  // (the world keeps restocking loose motifs, so count parts, not bodies)
  const merged = run.entities.filter((e) => e.faction === "motif" && e.parts.length >= 2);
  assert.equal(merged.length, 1, "the pair should have become one body");
  assert.deepEqual(merged[0].parts, ["a2", "a2"]);
});

test("placing puts a cell on a lattice site and it stays", () => {
  // It lands on the lattice, not where you were standing. A crystal is a
  // lattice plus a motif; freehand placements are a heap, and nothing can be
  // asked of a heap — not which cells are joined, not what symmetry it has, and
  // not what its band structure does, which the bound field depends on.
  const run = startRun(7);
  grant(run, ["222"]);
  stand(run, START.x + 200e-6, START.y + 200e-6);
  assert.equal(placeCell(run, 0), "placed");
  assert.equal(run.cells.length, 0);
  assert.equal(run.structures.length, 1);
  assert.equal(run.structures[0].hm, "222");

  const pitch = latticePitch(run);
  const site = snap(START.x + 200e-6, START.y + 200e-6, pitch);
  assert.ok(Math.abs(run.structures[0].x - site.x) < 1e-9, "on the site, not on you");
  assert.ok(Math.abs(run.structures[0].y - site.y) < 1e-9);

  // The same site cannot take two.
  grant(run, ["222"]);
  assert.equal(placeCell(run, 0), "occupied");

  // One step over, it can — and the two are one body.
  stand(run, site.x + pitch, site.y);
  assert.equal(placeCell(run, 0), "placed");
  assert.equal(run.bodies.length, 1, "adjacent cells are one thing");
  assert.equal(run.bodies[0].cells.length, 2);
});

test("feeding the throne is its own verb, and cannot happen by accident", () => {
  // It used to be the same call as building, told apart by where you were
  // standing — and the throne is at the centre of the arena, which is where a
  // player builds. The first run to reach it fed fifty-one cells and placed
  // twenty-five, then crowned something with three thousand eight hundred hit
  // points that no arsenal in the game could bring down.
  const run = startRun(11);
  grant(run, ["422", "2"]);

  // On the throne, BUILDING is refused rather than silently becoming a meal.
  stand(run, run.throne.x, run.throne.y);
  assert.equal(placeCell(run, 0), "too-close");
  assert.equal(run.throne.fed.length, 0, "and it ate nothing");
  assert.equal(run.structures.length, 0);

  // Feeding is a different call, and only works where the throne is.
  assert.equal(feedThrone(run, 0), "fed");
  assert.equal(run.throne.hm, "422");
  stand(run, START.x + 200e-6, START.y + 200e-6);
  assert.equal(feedThrone(run, 0), "off-throne", "and nowhere else");
  assert.equal(placeCell(run, 0), "placed", "which is where building works");
});

test("it says what you are making before you wake it", () => {
  // The number that was missing. A player fed fifty-one cells because nothing
  // ever put the consequence in the terms that decide the fight.
  const run = startRun(12);
  stand(run, run.throne.x, run.throne.y);

  grant(run, ["222", "222"]);      // one to feed, one still in hand to fight with
  feedThrone(run, 0);
  const modest = dischargesToKill(run);
  assert.ok(modest > 0 && modest < 6, `one helping should be a few discharges (${modest})`);

  for (let i = 0; i < 20; i++) { grant(run, ["23"]); feedThrone(run, 0); }
  const glutted = dischargesToKill(run);
  assert.ok(glutted > modest * 5,
    `twenty more should be visibly hopeless (${modest} -> ${glutted} discharges)`);
});

// ── crown ───────────────────────────────────────────────────────────────────

test("nothing wakes until you have fed it something", () => {
  const run = startRun(13);
  assert.equal(crown(run), "nothing-fed");
  assert.equal(run.phase, "settle");

  grant(run, ["222"]);
  stand(run, run.throne.x, run.throne.y);
  feedThrone(run, 0);
  assert.equal(crown(run), "crowned");
  assert.equal(run.phase, "reign");
  assert.ok(run.throne.awake && run.throne.hp > 0);
});

test("once it is awake the bargain is closed, but you can still build", () => {
  const run = startRun(17);
  grant(run, ["222", "222", "2"]);
  stand(run, run.throne.x, run.throne.y);
  feedThrone(run, 0);
  crown(run);

  // feeding is refused once it is awake
  stand(run, run.throne.x, run.throne.y);
  assert.equal(feedThrone(run, 0), "wrong-phase");
  assert.equal(run.throne.fed.length, 1, "no second helping");

  // but building elsewhere works, and has to: it eats what you made
  stand(run, START.x + 150e-6, START.y + 150e-6);
  assert.equal(placeCell(run, 0), "placed");
});

// ── the fight ───────────────────────────────────────────────────────────────

test("a structure only hurts the king if one of its arms points at it", () => {
  const run = startRun(19);
  grant(run, ["222"]);
  stand(run, run.throne.x, run.throne.y);
  feedThrone(run, 0);
  crown(run);
  const hp0 = run.throne.hp;

  // 222 shows two arms, along +x and -x. Due east of the king: an arm connects.
  const east = structureFrom(1, "222", run.throne.x - 120e-6, run.throne.y);
  run.structures = [east];
  const hit = discharge(run, east);
  assert.ok(hit > 0, "an arm pointing at it should land");
  assert.ok(run.throne.hp < hp0);
  assert.equal(run.structures.length, 0, "and the structure is spent");

  // directly north, where a two-lobed pattern has nothing pointing
  run.throne.hp = hp0;
  const north = structureFrom(2, "222", run.throne.x, run.throne.y - 120e-6);
  run.structures = [north];
  assert.equal(discharge(run, north), 0, "a line has to be lined up");
  assert.equal(run.throne.hp, hp0);
});

test("a sixfold structure covers the compass and a twofold does not", () => {
  const run = startRun(23);
  grant(run, ["222"]);
  stand(run, run.throne.x, run.throne.y);
  feedThrone(run, 0);
  crown(run);

  const hits = (hm: string): number => {
    let n = 0;
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 12) {
      run.throne.hp = run.throne.maxHp;
      const s = structureFrom(1, hm, run.throne.x + Math.cos(a) * 120e-6,
        run.throne.y + Math.sin(a) * 120e-6);
      run.structures = [s];
      if (discharge(run, s) > 0) n++;
    }
    return n;
  };
  assert.ok(hits("622") > hits("222") * 2,
    "six arms should connect from far more places than two");
});

test("your own node shoves a king off you, unless you gave it no handle", () => {
  const loose = startRun(29);
  grant(loose, ["222"]);
  stand(loose, loose.throne.x, loose.throne.y);
  feedThrone(loose, 0);
  crown(loose);
  loose.throne.x = CENTRE.x; loose.throne.y = CENTRE.y;

  const anchored = startRun(29);
  grant(anchored, ["432"]);
  stand(anchored, anchored.throne.x, anchored.throne.y);
  feedThrone(anchored, 0);
  crown(anchored);
  anchored.throne.x = CENTRE.x; anchored.throne.y = CENTRE.y;

  // A sovereign is dense and you are lipid, so it does not share your sign: the
  // node you are standing in is a place it cannot be, and it is driven off you.
  // Whether the water has anything to push against is Neumann's principle and
  // nothing else — a 432 is order 24 with not one independent piezoelectric
  // component, so it simply walks in on its own schedule, whatever you do.
  //
  // Started well inside the same trap, with the drive already up, because the
  // grip ramp is a fifth of a second and this is measuring the field, not the
  // amplifier.
  const start = 26e-6;
  for (const r of [loose, anchored]) {
    r.throne.x = CENTRE.x + start;
    r.throne.y = CENTRE.y;
    r.wave.amplitude = r.wave.maxAmplitude;
    r.you.grip = 1;
  }

  for (let i = 0; i < 30; i++) {
    stand(loose, CENTRE.x, CENTRE.y);
    stand(anchored, CENTRE.x, CENTRE.y);
    step(loose, { move: { x: 0, y: 0 }, grip: true, dash: false }, DT);
    step(anchored, { move: { x: 0, y: 0 }, grip: true, dash: false }, DT);
    loose.events.length = 0;
    anchored.events.length = 0;
  }
  const heldOff = Math.hypot(loose.throne.x - CENTRE.x, loose.throne.y - CENTRE.y);
  const arrived = Math.hypot(anchored.throne.x - CENTRE.x, anchored.throne.y - CENTRE.y);
  assert.ok(heldOff > arrived * 2,
    `a handle should keep it off you (${(heldOff * 1e6).toFixed(1)} vs `
    + `${(arrived * 1e6).toFixed(1)} um away)`);
});

test("the guns cannot turn, so the king is what you aim", () => {
  // The whole verb of the reign. A structure fires along its own group's
  // directions and they were fixed when you placed it — a 222 shows two lobes,
  // due east and due west, and nothing will ever change that. But a sovereign
  // is dense and you are lipid, so it does not share your sign, and the node you
  // are standing in shoves it at about eight times its own walking speed.
  const run = startRun(41);
  grant(run, ["222"]);
  stand(run, run.throne.x, run.throne.y);
  feedThrone(run, 0);
  crown(run);

  const gun = structureFrom(900, "222", START.x + 300e-6, START.y + 330e-6);
  run.structures = [gun];
  run.entities = [];

  // Park it due north of the gun, which is the one place a two-lobed pattern
  // can never reach.
  run.throne.x = START.x + 300e-6;
  run.throne.y = START.y + 150e-6;
  assert.ok(!bearsOn(gun, run.throne.x, run.throne.y), "nothing points at it yet");

  // Lean on it toward the eastern arm.
  const target = { x: gun.x + gun.reach * 3, y: gun.y };
  for (let i = 0; i < 60 * 5; i++) {
    const k = run.throne;
    if (bearsOn(gun, k.x, k.y)) break;
    const ax = k.x - target.x, ay = k.y - target.y;
    const ar = Math.hypot(ax, ay) || 1e-12;
    stand(run, k.x + (ax / ar) * 30e-6, k.y + (ay / ar) * 30e-6);
    run.integrity = MAX_INTEGRITY;
    step(run, { move: { x: 0, y: 0 }, grip: true, dash: false }, DT);
    run.events.length = 0;
  }
  assert.ok(bearsOn(gun, run.throne.x, run.throne.y),
    `it should be herdable into the line (${(run.throne.x * 1e6).toFixed(0)}, `
    + `${(run.throne.y * 1e6).toFixed(0)} um)`);

  // And now the building that could not be aimed lands.
  assert.ok(discharge(run, gun) > 0, "and then the gun connects");
});

test("with nothing left to fire, your bare hand still kills it — unless it has no handle", () => {
  // There must be no live state with no path out of it. Discharging a building
  // was the ONLY thing that took a king's health, and a king eats buildings, so
  // a player who ran out was not in a hard fight, they were in an unwinnable one
  // while still alive.
  const wear = (fed: string): Run => {
    const run = startRun(43);
    grant(run, [fed]);
    stand(run, run.throne.x, run.throne.y);
    feedThrone(run, 0);
    crown(run);
    run.structures = [];      // everything you built is gone
    run.entities = [];
    run.bolts = [];

    const k = run.throne;
    for (let i = 0; i < 60 * 40 && k.hp > 0; i++) {
      run.integrity = MAX_INTEGRITY;   // measuring the wear, not the survival
      run.bolts.length = 0;
      step(run, seek(run, k.x, k.y, true), DT);
      run.events.length = 0;
    }
    return run;
  };

  const loose = wear("222");
  assert.equal(loose.throne.hp, 0, "a king with a handle comes apart in your hand");
  assert.ok(loose.aeonsSurvived === 1, "and that is a real kill: the next world is born");

  // Neumann's principle, spent a second time. Order 24 and not one independent
  // piezoelectric component: the field could not push it, and it cannot hold it
  // either. Feeding the throne a 432 takes your last resort away with it.
  const anchored = wear("432");
  assert.ok(anchored.throne.anchored);
  assert.equal(anchored.throne.hp, anchored.throne.maxHp, "no handle, no purchase, no damage");
});

test("the hand is far worse than a building, which is why you build", () => {
  const run = startRun(45);
  grant(run, ["222"]);
  stand(run, run.throne.x, run.throne.y);
  feedThrone(run, 0);
  crown(run);

  const gun = structureFrom(901, "222", run.throne.x - 120e-6, run.throne.y);
  run.structures = [gun];
  const instant = discharge(run, gun);
  assert.ok(instant > 0);

  // Seconds of holding it, for what one building did in a frame.
  const rate = wearRate(run.throne);
  assert.ok(rate > 0);
  assert.ok(instant / rate > 4,
    `a discharge should be worth several seconds of hand (${(instant / rate).toFixed(1)}s)`);
});

test("the cubic cell is the best gun there is and the worst thing to crown", () => {
  // The decision the opening exists to create, and both halves of it are exact.
  // A dimer plus a diagonal is a 23: order twelve, four in-plane directions, and
  // one lonely independent piezoelectric component.
  const king = (fed: string[]) => {
    const k = emptyThrone(0, 0);
    for (const hm of fed) feed(k, cellFor(hm));
    return k;
  };
  const cubic = king(["23"]);
  const plain = king(["222"]);

  // CROWN IT and it is worse for you in every direction at once.
  assert.ok(cubic.maxHp > plain.maxHp * 2, "twice the health");
  assert.ok(volley(cubic).length > volley(plain).length, "twice the arms");
  assert.ok(cadence(cubic) < cadence(plain), "and it throws them more often");
  assert.ok(wearRate(cubic) < wearRate(plain) / 2, "and your bare hand barely marks it");

  // BUILD WITH IT and it is the strongest thing you can put on the ground: it
  // kills the cubic king in two aligned arms where a 222 needs five, and it has
  // four directions to align rather than two.
  const shots = (gun: string, k: typeof cubic): number =>
    Math.ceil(k.maxHp / (structureFrom(1, gun, 0, 0).strength * DISCHARGE_GAIN));
  assert.equal(shots("23", cubic), 2);
  assert.equal(shots("222", cubic), 5);
  assert.ok(lobes("23").length > lobes("222").length);

  // So one cell cannot do both jobs, and the diagonal that makes it is 1.6
  // microns — barely over the streaming crossover, and the hardest thing in the
  // first water to hold on to. That is the whole opening.
  assert.ok(motif("d").particle.radius < CROSSOVER_RADIUS_ORDER * 1.2);
});

// ── birth ───────────────────────────────────────────────────────────────────

test("killing it births the world it was made of", () => {
  const run = startRun(31);
  grant(run, ["422", "222"]);
  stand(run, run.throne.x, run.throne.y);
  feedThrone(run, 0);
  feedThrone(run, 0);
  crown(run);

  const before = run.world;
  stand(run, START.x + 300e-6, START.y + 300e-6);
  placeCell(run, 0);
  run.throne.hp = 1;
  const s = structureFrom(1, "422", run.throne.x - 120e-6, run.throne.y);
  run.structures = [s];
  discharge(run, s);

  assert.equal(run.phase, "birth");
  assert.equal(run.aeonsSurvived, 1);
  assert.notEqual(run.world, before);
  assert.equal(run.world.aeon, 2);

  const built = run.structures.length;
  run.integrity = 1;
  enterWorld(run);
  assert.equal(run.phase, "settle");
  assert.equal(run.integrity, 3, "surviving a king gives you back some of yourself");
  assert.ok(run.structures.length <= built, "only some of it stands");
  assert.ok(run.structures.every((x) => x.ruin), "and what stands is a ruin");
  assert.equal(run.throne.fed.length, 0, "a new throne, empty");
  assert.ok(Math.abs(run.wave.pitch - run.world.pitch) < 1e-12, "the lattice is the new world's");
});

// ── readouts ────────────────────────────────────────────────────────────────

test("the readout tells the truth about what is under your hand", () => {
  const run = startRun(37);
  const husk = seedBeast(run, "husk", START.x + 100e-6, START.y + 100e-6);
  const d = readoutFor(run, husk);
  assert.equal(d.goesTo, "NODE");
  assert.match(d.hint, /REELS IT IN/);

  const mote = seedBeast(run, "mote", START.x + 100e-6, START.y + 100e-6);
  assert.ok(readoutFor(run, mote).authority < 1);

  const pair = seedMotif(run, ["a2", "g"], START.x + 200e-6, START.y + 200e-6);
  assert.match(readoutFor(run, pair).hint, /222 AT 2\/4/);
  assert.equal(labelOf(pair), "222  x2");
});

test("a cluster is one particle, and building makes it harder to carry", () => {
  const a = clusterParticle(["a2"]);
  assert.ok(Math.abs(clusterParticle(["a2", "a2"]).radius - a.radius * Math.cbrt(2)) < 1e-12);
  const dimer = contrastFactor(clusterParticle(["a2"]), WATER);
  const both = contrastFactor(clusterParticle(["a2", "g"]), WATER);
  assert.ok(Math.abs(both) < Math.abs(dimer) / 2, "the 222 barely answers the field");
});

// ── and it is playable ──────────────────────────────────────────────────────

/**
 * A bot that plays whole aeons: gather, build a ring, feed, crown, then take
 * its own world apart to kill what it crowned.
 *
 * This is the test that says whether any of this is a game. The last two
 * rounds of this build shipped something the author had never watched play
 * itself, and both times it turned out that nothing could actually happen.
 */
/**
 * The nearest point on any of your buildings' firing lines.
 *
 * Where the king has to be standing for something you own to be able to hit it.
 */
function herdTarget(run: Run): { x: number; y: number } | null {
  const k = run.throne;
  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  for (const s of run.structures) {
    const out = Math.min(s.reach * (LOBE_RANGE - 1),
      Math.max(s.reach * 2, Math.hypot(k.x - s.x, k.y - s.y)));
    for (const [lx, ly] of s.lobes) {
      const t = { x: s.x + lx * out, y: s.y + ly * out };
      const d = Math.hypot(t.x - k.x, t.y - k.y);
      if (d < bestD) { bestD = d; best = t; }
    }
  }
  return best;
}

function makeBot(feedTarget = 2): (r: Run) => Input {
  let resting = false;
  let placed = 0;
  return (run: Run): Input => {
    const w = run.wave;
    if (w.spent || w.stamina < 26) resting = true;
    if (resting && w.stamina > 62) resting = false;

    // An arm is coming. Burst sideways out of it — which is the only thing in
    // the game fast enough to leave, and the reason the dash exists.
    for (const b of run.bolts) {
      if (Math.hypot(run.you.x - b.x, run.you.y - b.y) < 60e-6) {
        const px = -b.vy, py = b.vx, pr = Math.hypot(px, py) || 1;
        return seek(
          run,
          Math.max(0, Math.min(ARENA_W, run.you.x + (px / pr) * 110e-6)),
          Math.max(0, Math.min(ARENA_H, run.you.y + (py / pr) * 110e-6)),
          false, true,
        );
      }
    }

    const beasts = run.entities.filter((e) => e.faction === "beast");
    let near: Entity | null = null;
    let nearR = Infinity;
    for (const e of beasts) {
      const r = Math.hypot(e.x - run.you.x, e.y - run.you.y);
      if (r < nearR) { nearR = r; near = e; }
    }
    // Go to it and close your hand. Where it ends up held — at your feet or in
    // the ring a quarter pitch out — is decided by the sign of its contrast
    // against yours, which is not something a policy gets to choose.
    const engage = (e: Entity): Input => seek(run, e.x, e.y, true);
    // Never rest with something on you. Holding a vesicle costs eighteen
    // stamina and killing it refunds twenty-two, so a kill PAYS — and the
    // alternative, standing still while it feeds, is how every early version of
    // this policy died at forty seconds without building anything.
    if (near && nearR < 90e-6 && !run.wave.spent) return engage(near);

    if (run.phase === "birth") { enterWorld(run); placed = 0; return IDLE; }

    if (run.cells.length > 0 && (run.phase === "settle" || run.phase === "reign")) {
      if (run.phase === "settle" && run.structures.length >= 4
        && run.throne.fed.length < feedTarget) {
        const t = { x: run.throne.x, y: run.throne.y };
        if (distTo(run, t.x, t.y) > 16e-6) return seek(run, t.x, t.y);
        feedThrone(run, 0);
        return seek(run, t.x, t.y);
      }
      // Put it where one of its OWN arms will point at the throne. A 222 shows
      // two lobes and a 622 shows six, so a blind ring wastes five placements
      // in six for the twofold — the structure fires along its group's
      // directions whether or not anything is standing in them.
      const arms = lobes(run.cells[0].group.hm);
      const [ax, ay] = arms[placed % arms.length];
      const ring = 110e-6 + Math.floor(placed / arms.length) * 55e-6;
      const spot = { x: run.throne.x - ax * ring, y: run.throne.y - ay * ring };
      if (distTo(run, spot.x, spot.y) < 12e-6) {
        placeCell(run, 0);
        placed++;
      }
      return seek(run, spot.x, spot.y);
    }
    if (run.phase === "settle" && run.throne.fed.length >= feedTarget && placed >= 4) crown(run);

    if (run.phase === "reign" && !resting) {
      const k = run.throne;

      // Something already bears on it: go and let it off.
      let ready: { x: number; y: number } | null = null;
      let readyStrength = -1;
      for (const s of run.structures) {
        if (bearsOn(s, k.x, k.y) && s.strength > readyStrength) {
          readyStrength = s.strength;
          ready = { x: s.x, y: s.y };
        }
      }
      if (ready) return seek(run, ready.x, ready.y, true);

      // Nothing left to fire. Close on it and hold: it is a bad way to kill
      // something and it is the only one you have.
      if (run.structures.length === 0) return seek(run, k.x, k.y, true);

      // Nothing bears yet. The guns cannot turn, so move the target: a sovereign is
      // dense and you are lipid, so it answers to the other lattice and your own
      // node shoves it — about eight times faster than it walks. Stand on the
      // far side of it from where you want it and lean.
      const aim = herdTarget(run);
      if (aim) {
        const ax = k.x - aim.x, ay = k.y - aim.y;
        const ar = Math.hypot(ax, ay) || 1e-12;
        return seek(run, k.x + (ax / ar) * 30e-6, k.y + (ay / ar) * 30e-6, true);
      }
    }

    if (!resting) {
      const motifs = run.entities.filter((e) => e.faction === "motif");
      let a: Entity | null = null;
      let b: Entity | null = null;
      let pair = Infinity;
      for (let i = 0; i < motifs.length; i++) {
        for (let j = i + 1; j < motifs.length; j++) {
          const r = Math.hypot(motifs[i].x - motifs[j].x, motifs[i].y - motifs[j].y);
          if (r < pair) { pair = r; a = motifs[i]; b = motifs[j]; }
        }
      }
      if (a && b && pair < 110e-6) {
        return seek(run, (a.x + b.x) / 2, (a.y + b.y) / 2, true);
      }
      if (near && nearR < 260e-6) return engage(near);
    }
    return IDLE;
  };
}

function playRun(seed: number, seconds: number, feedTarget = 2): Run {
  const run = startRun(seed);
  const bot = makeBot(feedTarget);
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) {
    if (run.phase === "dead") break;
    step(run, bot(run), DT);
    run.events.length = 0;
  }
  return run;
}

const SEEDS = [17, 42, 88, 5, 101, 7];

test("a bot can settle a world, crown it, and kill what it crowned", () => {
  let aeons = 0;
  for (const seed of SEEDS) {
    const run = playRun(seed, 700, 1);
    aeons += run.aeonsSurvived;
    assert.ok(run.built > 0, `seed ${seed} built no cells`);
  }
  assert.ok(aeons >= 2, `the cycle must close (${aeons} aeons over ${SEEDS.length} runs)`);
});

test("what you feed the throne changes what it is, in every direction at once", () => {
  // This used to be asserted by PLAYING it — same policy, same seeds, one
  // helping against two — and the gap it reported was noise. Measured properly,
  // as reigns won out of reigns entered over ten seeds, one helping wins 58 per
  // cent and two wins 60. There is no gradient there to find.
  //
  // The reason is worth keeping: the first water's pool is a dimer and a girdle,
  // and a dimer plus a girdle is a 222 and nothing else, so at the first aeon a
  // second helping can only ever be MORE OF THE SAME CELL. It buys mass, which
  // buys health and a slightly quicker beat, and that is genuinely not much.
  //
  // What the trade actually turns on is SYMMETRY, not quantity, and every part
  // of that is exact and belongs here rather than in a bot run.
  const kings = [["222"], ["422", "222"], ["622", "422", "222"]].map((fed) => {
    const k = emptyThrone(0, 0);
    for (const hm of fed) feed(k, cellFor(hm));
    return k;
  });

  for (let i = 1; i < kings.length; i++) {
    const lo = kings[i - 1];
    const hi = kings[i];
    assert.ok(hi.maxHp > lo.maxHp, `${hi.hm} should be bigger than ${lo.hm}`);
    assert.ok(cadence(hi) < cadence(lo), `${hi.hm} should throw more often`);
    assert.ok(volley(hi).length >= volley(lo).length, `${hi.hm} should cover more of the compass`);
    // And Neumann's principle takes your last resort away as it goes: order and
    // freedom pull against each other, so the more symmetric the thing you
    // crowned, the fewer ways a field has of driving it at all.
    assert.ok(wearRate(hi) <= wearRate(lo),
      `${hi.hm} should be harder in the hand than ${lo.hm}`);
  }

  assert.equal(volley(kings[2]).length, 6, "a sixfold king throws six arms");
  assert.ok(wearRate(kings[0]) > wearRate(kings[2]) * 2,
    "and a 222 comes apart in your hand far faster than a 622");
});

test("the first minute produces a cell, which is the whole opening", () => {
  // THE TEST THAT WOULD HAVE CAUGHT IT. Every other playability test here runs
  // for seven hundred seconds and asks whether the cycle eventually closes, so
  // all of them passed while the opening was unplayable: a policy that played
  // perfectly and could not be killed built ONE cell a minute, and five runs in
  // six built none at all in four minutes. The water held fourteen motifs in
  // six tenths of a square millimetre, so the nearest thing you could bind with
  // was two hundred microns away from a hand fifty-five microns across.
  //
  // Nobody reported it as a bug. It arrives as "I suck at this game".
  // The policy is the one a person uses: pick the biggest thing you have going
  // and feed it whatever is nearest that will bind, rather than chasing whichever
  // pair in the whole arena happens to be closest this frame.
  for (const seed of [1, 2, 3, 5]) {
    const run = startRun(seed);
    let first = 0;
    let mine = -1;

    for (let i = 0; i < 60 * 90 && !first; i++) {
      const motifs = run.entities.filter((e) => e.faction === "motif");
      let me = motifs.find((e) => e.id === mine);
      if (!me) {
        me = motifs.slice().sort((a, b) => b.parts.length - a.parts.length)[0];
        mine = me?.id ?? -1;
      }

      let partner: Entity | null = null;
      let near = Infinity;
      if (me) {
        for (const o of motifs) {
          if (o === me) continue;
          const asm = assemble([...me.parts, ...o.parts]);
          if (!asm.group && !asm.partial) continue;
          const d = Math.hypot(o.x - me.x, o.y - me.y);
          if (d < near) { near = d; partner = o; }
        }
      }

      run.integrity = MAX_INTEGRITY;      // measuring the pace, not the survival
      step(run, me && partner
        ? seek(run, (me.x + partner.x) / 2, (me.y + partner.y) / 2, true)
        : IDLE, DT);
      if (run.events.some((e) => e.kind === "crystal")) first = run.t;
      run.events.length = 0;
    }
    assert.ok(first > 0 && first < 60,
      `seed ${seed}: first cell at ${first ? `${first.toFixed(0)}s` : "never"} — the opening is a wall`);
  }
});

test("the worlds it makes are not the same world", () => {
  // Guards the fixed point directly: play far enough to see a second water and
  // check it is actually a different place. Across seeds rather than on one,
  // because whether a particular run survives its first king is luck and this
  // is not a test about luck.
  const reached = SEEDS
    .map((seed) => playRun(seed, 900, 1))
    .filter((run) => run.world.aeon >= 2);

  assert.ok(reached.length > 0, "no seed lived to see a second water");
  const first = { c: 1497, pitch: 88e-6 };
  for (const run of reached) {
    assert.ok(
      Math.abs(run.world.medium.c - first.c) > 10 || Math.abs(run.world.pitch - first.pitch) > 2e-6,
      "the water it ended in should not be the water it started in",
    );
  }
});

test("standing still is still fatal", () => {
  const run = startRun(101);
  for (let i = 0; i < 60 * 240 && run.phase !== "dead"; i++) {
    step(run, IDLE, DT);
    run.events.length = 0;
  }
  assert.equal(run.phase, "dead");
});
