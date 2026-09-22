import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  bondWithSovereign, crown, dischargesToKill, enterWorld, latticePitch, reshape, startRun, step,
} from "../game/run.js";
import {
  ADAPTATIONS, FORMS, TAME_TIME, activeLimbs, canBond, companion, cycleCompanion,
  formFor, limbRole, recruit, support, supported,
} from "../game/ecology.js";
import { MITO_CAPACITY, growMitochondrion, metabolise } from "../game/organelles.js";
import { cellFor } from "../game/lattice.js";
import { feed, structureFrom, wildlifeFor } from "../game/world.js";
import { WATER } from "../src/gorkov.js";

function quiet() {
  const run = startRun(43);
  run.entities = [];
  run.spawnIn = 1e6;
  run.world.calm = 1e6;
  run.rand = () => 0.99;
  return run;
}
function fight() {
  const run = quiet();
  feed(run.throne, cellFor("222"));
  crown(run);
  run.throne.x = run.you.x + 60e-6;
  run.throne.y = run.you.y;
  run.throne.hp = run.throne.maxHp * 0.25;
  run.throne.beat = 100;
  return run;
}
function armed(hm: string) {
  const run = quiet();
  const pitch = latticePitch(run);
  const x = run.you.x, y = run.you.y;
  run.structures = [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0], [3, 0], [4, 0]]
    .map(([i, j], id) => structureFrom(id, hm, x + i * pitch, y + j * pitch));
  reshape(run);
  const limbs = activeLimbs(run);
  assert.ok(limbs.length > 0, "fixture must actually grow a limb");
  const tip = limbs[0].cells[0];
  run.you.x = tip.x; run.you.y = tip.y;
  return { run, tip, limb: limbs[0] };
}

test("bond requires a weakened, nearby living sovereign and uninterrupted time", () => {
  const run = fight();
  run.throne.hp = run.throne.maxHp;
  assert.equal(canBond(run), false);
  assert.equal(bondWithSovereign(run, TAME_TIME), false);
  run.throne.hp *= 0.25;
  run.you.x -= 200e-6;
  assert.equal(canBond(run), false);
  run.you.x += 200e-6;
  assert.equal(bondWithSovereign(run, 1), false);
  assert.equal(run.bond.progress, 1);
  run.iframe = 1;
  assert.equal(bondWithSovereign(run, 1), false);
  assert.equal(run.bond.progress, 0, "being hit breaks the bond attempt");
  run.iframe = 0;
  assert.equal(bondWithSovereign(run, TAME_TIME), true);
  assert.equal(run.phase, "birth");
  assert.ok(run.throne.hp > 0, "the tamed sovereign lives");
  assert.equal(companion(run)?.form, "strider");
  assert.equal(run.world.aeon, 2);
  assert.equal(bondWithSovereign(run, TAME_TIME), false, "no duplicate rewards");
  assert.equal(run.aeonsSurvived, 1);
  enterWorld(run);
  assert.equal(companion(run)?.form, "strider", "companion survives the transition");
  assert.equal(run.bond.progress, 0);
});

test("holding Y is a ceasefire; releasing it discards partial bonding", () => {
  const run = fight();
  const before = run.throne.hp;
  step(run, { move: { x: 0, y: 0 }, grip: true, dash: false, tame: true }, 1 / 60);
  assert.equal(run.throne.hp, before);
  assert.ok(run.bond.progress > 0);
  step(run, { move: { x: 0, y: 0 }, grip: false, dash: false }, 1 / 60);
  assert.equal(run.bond.progress, 0);
});

test("companions can be selected and grow to three ranks without an unbounded power stack", () => {
  const run = fight();
  for (let aeon = 1; aeon <= 15; aeon++) { run.world.aeon = aeon; recruit(run); }
  assert.equal(run.bond.companions.length, 3);
  assert.ok(run.bond.companions.every((c) => c.rank === 3));
  assert.deepEqual(run.bond.companions.map((c) => c.form), FORMS);
  const before = companion(run)?.form;
  cycleCompanion(run);
  assert.notEqual(companion(run)?.form, before);
  run.bond.active = 0;
  run.you.dashCool = 2;
  support(run, 1);
  assert.ok(run.you.dashCool < 2);
  run.bond.active = 2;
  run.you.grip = 0;
  run.wave.stamina = 40;
  support(run, 1);
  assert.ok(run.wave.stamina > 40);
});

test("warden blocks one incoming bolt, then waits for its cooldown", () => {
  const run = fight();
  run.world.aeon = 2; recruit(run);
  const bolt = () => ({ x: run.you.x, y: run.you.y, vx: 0, vy: 0, life: 2, born: 0 });
  run.bolts = [bolt(), bolt()];
  support(run, 1 / 60);
  assert.equal(run.bolts.length, 1);
  assert.equal(run.events.filter((e) => e.kind === "guard").length, 1);
  run.t = run.bond.shieldReadyAt;
  support(run, 1 / 60);
  assert.equal(run.bolts.length, 0);
});

test("polar limb tips speed recovery; piezoelectric tips speed bonding; support respects depth", () => {
  const sail = armed("2");
  assert.equal(limbRole(sail.limb), "sail");
  sail.run.you.dashCool = 2;
  support(sail.run, 1);
  assert.equal(sail.run.you.dashCool, 1.4);
  sail.run.layer = 1;
  assert.equal(supported(sail.run, "sail"), false);
  sail.run.you.dashCool = 2;
  support(sail.run, 1);
  assert.equal(sail.run.you.dashCool, 2);
  const resonator = armed("222");
  const run = resonator.run;
  feed(run.throne, cellFor("222")); crown(run);
  run.throne.x = run.you.x + 50e-6; run.throne.y = run.you.y;
  run.throne.hp = run.throne.maxHp * 0.2;
  assert.equal(limbRole(resonator.limb), "resonator");
  bondWithSovereign(run, 1);
  assert.equal(run.bond.progress, 1.75);
});

test("anchor limbs intercept bolts at their tips, with cooldown and depth limits", () => {
  const { run, tip, limb } = armed("432");
  assert.equal(limbRole(limb), "guard");
  const bolt = () => ({ x: tip.x, y: tip.y, vx: 0, vy: 0, life: 2, born: 0 });
  run.bolts = [bolt(), bolt()];
  support(run, 1 / 60);
  assert.equal(run.bolts.length, 1);
  run.t += 3;
  run.layer = 1;
  support(run, 1 / 60);
  assert.equal(run.bolts.length, 1);
  run.layer = 0;
  support(run, 1 / 60);
  assert.equal(run.bolts.length, 0);
});

test("mitochondria consume two cells only on a valid host and do not duplicate", () => {
  const run = quiet();
  run.cells = [cellFor("2"), cellFor("222")];
  assert.equal(growMitochondrion(run), "need-host");
  assert.equal(run.cells.length, 2);
  run.structures = [structureFrom(7, "2", run.you.x, run.you.y)];
  assert.equal(growMitochondrion(run), "grown");
  assert.equal(run.cells.length, 0);
  assert.equal(growMitochondrion(run), "already-grown");
  assert.equal(run.organelles.length, 1);
  run.phase = "dead";
  assert.equal(growMitochondrion(run), "wrong-phase");

  const selection = quiet();
  selection.structures = [structureFrom(8, "2", selection.you.x, selection.you.y)];
  selection.cells = [cellFor("2"), cellFor("222"), cellFor("432")];
  assert.equal(growMitochondrion(selection, 2), "grown");
  assert.deepEqual(selection.cells.map((c) => c.group.hm), ["222"],
    "cost follows selection and wraps to the first slot, preserving the other cell");
});

test("mitochondria charge away from the player, supply bounded energy, and disappear with their host", () => {
  const run = quiet();
  run.structures = [structureFrom(7, "2", run.you.x, run.you.y)];
  run.cells = [cellFor("2"), cellFor("2")]; growMitochondrion(run);
  run.you.x += 150e-6;
  metabolise(run, 30);
  assert.equal(run.organelles[0].energy, MITO_CAPACITY);
  run.wave.stamina = 20; run.wave.spent = true;
  metabolise(run, 1);
  assert.equal(run.wave.stamina, 20, "outside transfer reach");
  run.you.x -= 150e-6;
  run.layer = 1;
  metabolise(run, 1);
  assert.equal(run.wave.stamina, 20, "wrong node plane");
  run.layer = 0;
  metabolise(run, 1);
  assert.equal(run.wave.stamina, 34);
  assert.equal(run.organelles[0].energy, 46);
  assert.equal(run.wave.spent, false);
  run.structures = [];
  metabolise(run, 1);
  assert.equal(run.organelles.length, 0);
  assert.equal(run.wave.stamina, 34, "a destroyed organelle cannot keep supplying");
});

test("an energy organelle does not fire itself when its owner grips beside it", () => {
  const run = fight();
  run.throne.x = run.you.x + 200e-6;
  run.throne.anchored = true;
  run.structures = [structureFrom(7, "222", run.you.x, run.you.y)];
  run.structures[0].charge = 1;
  run.organelles = [{ hostId: 7, energy: 60, supplying: false }];
  assert.equal(dischargesToKill(run), Infinity, "utility host is not an available gun");
  for (let i = 0; i < 10; i++) step(run, { move: { x: 0, y: 0 }, grip: true, dash: false }, 1 / 60);
  assert.equal(run.structures.length, 1);
  assert.ok(!run.events.some((e) => e.kind === "discharge"));
});

test("later waters unlock distinct hunters and repeat a readable boss cycle", () => {
  assert.deepEqual([1, 2, 3, 4].map(formFor), ["strider", "warden", "weaver", "strider"]);
  assert.ok(!wildlifeFor(WATER, 1, 50).includes("ribbon"));
  assert.ok(wildlifeFor(WATER, 3, 50).includes("ribbon"));
  assert.ok(wildlifeFor(WATER, 4, 50).includes("sentinel"));
  const speeds: number[] = [];
  for (let i = 1; i <= 3; i++) {
    const run = fight();
    run.world.aeon = i;
    run.throne.hp = run.throne.maxHp;
    run.throne.anchored = true;
    run.throne.beat = 0.001;
    step(run, { move: { x: 0, y: 0 }, grip: false, dash: false }, 1 / 60);
    assert.ok(run.bolts.length > 0);
    speeds.push(Math.hypot(run.bolts[0].vx, run.bolts[0].vy));
  }
  assert.ok(speeds[1] < speeds[0] && speeds[2] > speeds[0]);
  assert.equal(speeds[1] / speeds[0], ADAPTATIONS.warden.boltSpeed);
});
