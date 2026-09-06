import { strict as assert } from "node:assert";
import { test } from "node:test";

import { bodiesOf, growable, joined, limbsOf, reaches } from "../game/body.js";
import { structureFrom } from "../game/world.js";
import { lobes } from "../game/shape.js";

const PITCH = 115e-6;
let id = 0;
function at(hm: string, i: number, j: number, layer = 0) {
  return structureFrom(id++, hm, 300e-6 + i * PITCH, 300e-6 + j * PITCH, layer);
}

// ── what an organism is allowed to grow ─────────────────────────────────────

test("a limb runs along a direction the body's own symmetry has", () => {
  // Not a design decision. shape.lobes is the orbit of a horizontal vector
  // under the group's operations, and `growable` is the part of that orbit the
  // square trap lattice will actually seat — the same rule that decides which
  // way a body may walk, spent a second time. (A building's own firing arms are
  // the full orbit: a released field is not standing on a site.)
  const east = lobes("222").some(([x, y]) => x > 0.9 && Math.abs(y) < 0.1);
  assert.ok(east, "a 222 distinguishes east, which is what this test grows in");

  // a blob with an arm running east out of it
  const body = bodiesOf([
    at("222", 0, 0), at("222", 0, 1), at("222", 1, 0), at("222", 1, 1),
    at("222", 2, 0), at("222", 3, 0), at("222", 4, 0),
  ], PITCH)[0];

  const limbs = limbsOf(body, PITCH);
  assert.ok(limbs.length >= 1, "that arm is an appendage");
  const arm = limbs[0];
  assert.ok(arm.length >= 2, `it is only ${arm.length} cells long`);
  assert.ok(arm.dir[0] > 0.9 && Math.abs(arm.dir[1]) < 0.1, "and it points east");
  assert.ok(!arm.leg, "it never leaves its plane");
});

test("a chain running where the symmetry has no direction is a lump", () => {
  // A 222 shows two lobes, east and west. A run going north is not an arm.
  const body = bodiesOf([
    at("222", 0, 0), at("222", 1, 0), at("222", 0, 1), at("222", 1, 1),
    at("222", 0, 2), at("222", 0, 3), at("222", 0, 4),
  ], PITCH)[0];

  const northward = limbsOf(body, PITCH).filter((l) => l.dir[1] !== 0 || l.dir[0] !== 0);
  for (const l of northward) {
    assert.ok(Math.abs(l.dir[0]) > 0.5,
      `a 222 grew an arm pointing (${l.dir[0].toFixed(2)}, ${l.dir[1].toFixed(2)})`);
  }
});

test("a sixfold CELL throws more lobes — and a sixfold BODY does not", () => {
  // These are two different questions and this test asked only the first for
  // two months, under a title that answered the second. A cell's lobes are the
  // field it fires, which stands on nothing and keeps all six. A body's growth
  // lands on a site, and a six-fold axis does not map a square net onto itself.
  assert.ok(lobes("622").length > lobes("222").length * 2,
    "the cell's own field throws six where a 222 throws two");
  assert.equal(growable("622").length, growable("222").length,
    "but on this lattice both bodies grow in two directions");
  assert.ok(growable("422").length > growable("622").length,
    "and the tetragonal cell, seated whole, beats it");
});

// ── legs ────────────────────────────────────────────────────────────────────

test("cells join across planes only straight above, so a leg is deliberate", () => {
  const floor = at("222", 0, 0, 0);
  const above = at("222", 0, 0, 1);
  const askew = at("222", 1, 0, 1);
  const far = at("222", 0, 0, 3);

  assert.ok(joined(floor, above, PITCH), "the same site one plane up is a joint");
  assert.ok(!joined(floor, askew, PITCH), "a step across AND up is not");
  assert.ok(!joined(floor, far, PITCH), "and two planes is nothing at all");
});

test("a limb that changes plane is a leg, and it takes the body with it", () => {
  // Nothing swims. A body reaches another height by having something standing
  // on it, which is why building a leg costs a retune: drive the channel to
  // another harmonic, place the cell under the one you mean to hang it from,
  // and drive back.
  const body = bodiesOf([
    at("222", 0, 0, 1), at("222", 1, 0, 1), at("222", 0, 1, 1), at("222", 1, 1, 1),
    at("222", 2, 0, 1),                       // an arm east, on the upper plane
    at("222", 2, 0, 0),                       // and it steps down
  ], PITCH)[0];

  assert.equal(body.cells.length, 6, "the column is part of the same body");
  const legs = limbsOf(body, PITCH).filter((l) => l.leg);
  assert.ok(legs.length >= 1, "and that descent is a leg");
  assert.deepEqual(legs[0].layers, [0, 1], "touching both planes");

  // Which is what a leg is FOR: the organism can work on a plane it does not
  // stand on.
  assert.deepEqual(reaches(body, PITCH), [0, 1]);
});

test("a body with no leg reaches only its own plane", () => {
  const flat = bodiesOf(
    [at("222", 0, 0, 2), at("222", 1, 0, 2), at("222", 2, 0, 2)], PITCH)[0];
  assert.deepEqual(reaches(flat, PITCH), [2]);
});

test("a tardigrade: a trunk on one plane and legs down onto another", () => {
  // A water bear is a trunk with legs hanging off it in PAIRS, spaced along its
  // length. That spacing is not decoration and the code found it before the
  // test did: a cell hung under every segment touches its neighbours and the
  // whole lot is a second storey, not a set of legs. Legs have to be separated
  // or they are a floor.
  const cells = [];
  for (let i = 0; i < 5; i++) cells.push(at("222", i, 0, 1));   // the trunk, east-west
  for (const i of [0, 2, 4]) cells.push(at("222", i, 0, 0));    // and it stands on three

  const body = bodiesOf(cells, PITCH)[0];
  assert.equal(body.cells.length, 8, "one animal");

  const legs = limbsOf(body, PITCH).filter((l) => l.leg);
  assert.equal(legs.length, 3, `it should stand on three legs (${legs.length})`);
  for (const l of legs) {
    assert.deepEqual(l.layers, [0, 1], "each reaching from the trunk to the floor");
  }
  // The middle one is a clean single cell. The two at the ends run on into the
  // tip of the trunk, and that is not a bug to be routed around: a walk inward
  // from a tip cannot tell the end of a trunk from the limb hanging off it,
  // because at the end of a trunk they are the same cells.
  assert.ok(legs.some((l) => l.cells.length === 1), "the middle leg is unambiguous");

  // Which is what legs are FOR: it works on a plane it does not stand on.
  assert.deepEqual(reaches(body, PITCH), [0, 1]);
});

test("legs under every segment are not legs, they are a floor", () => {
  const cells = [];
  for (let i = 0; i < 4; i++) { cells.push(at("222", i, 0, 1)); cells.push(at("222", i, 0, 0)); }
  const body = bodiesOf(cells, PITCH)[0];
  assert.equal(limbsOf(body, PITCH).filter((l) => l.leg).length, 0,
    "a slab under a slab has nothing hanging off it");
});
