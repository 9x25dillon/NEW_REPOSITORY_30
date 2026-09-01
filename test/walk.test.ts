import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  ARENA_H, ARENA_W, latticePitch, retune, startRun, step, type Input, type Run,
} from "../game/run.js";
import { autonomous, gaitDirection, snap, walkSpeed } from "../game/body.js";
import { structureFrom } from "../game/world.js";
import { lobes } from "../game/shape.js";

const DT = 1 / 60;
const IDLE: Input = { move: { x: 0, y: 0 }, grip: false, dash: false };

/** A body of `shape` cells, on the lattice, clear of the throne. */
function organism(run: Run, shape: Array<[number, number]>, hm = "222") {
  const pitch = latticePitch(run);
  const base = snap(140e-6, 140e-6, pitch);
  let id = 5000;
  for (const [i, j] of shape) {
    run.structures.push(structureFrom(id++, hm, base.x + i * pitch, base.y + j * pitch, 0));
  }
  retune(run);
  return { pitch, base };
}

/** Stand still somewhere and let the world run. */
function watch(run: Run, sx: number, sy: number, seconds: number): number {
  let steps = 0;
  for (let i = 0; i < seconds * 60; i++) {
    run.you.x = sx;
    run.you.y = sy;
    run.integrity = 6;
    step(run, IDLE, DT);
    steps += run.events.filter((e) => e.kind === "step").length;
    run.events.length = 0;
  }
  return steps;
}

const BLOCK: Array<[number, number]> = [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]];

// ── it walks ────────────────────────────────────────────────────────────────

test("an organism big enough to work alone follows you", () => {
  const run = startRun(11);
  const { pitch, base } = organism(run, BLOCK);
  assert.ok(autonomous(run.bodies[0]), "six joined cells is an organism");

  const x0 = run.bodies[0].x;
  const steps = watch(run, base.x + 4 * pitch, base.y, 8);
  assert.ok(steps > 0, "it should come to you");
  assert.ok(run.bodies[0].x > x0 + pitch * 0.9, "and end up nearer than it started");

  // and it stops when it arrives rather than walking through you
  const arrived = run.bodies[0].x;
  watch(run, base.x + 4 * pitch, base.y, 6);
  assert.ok(Math.abs(run.bodies[0].x - arrived) < pitch * 1.5, "it does not overshoot forever");
});

test("a scatter that is not a body does not walk", () => {
  const run = startRun(12);
  const { pitch, base } = organism(run, [[0, 0], [1, 0]]);
  assert.ok(!autonomous(run.bodies[0]));
  const x0 = run.bodies[0].x;
  assert.equal(watch(run, base.x + 4 * pitch, base.y, 6), 0);
  assert.equal(run.bodies[0].x, x0, "two cells stay where they were put");
});

// ── and only where its symmetry lets it ─────────────────────────────────────

test("it steps along a direction its own group has, and no other", () => {
  const run = startRun(13);
  organism(run, BLOCK);
  const body = run.bodies[0];

  // a 222 has two directions, east and west
  const dirs = lobes("222");
  assert.equal(dirs.length, 2);

  const east = gaitDirection(body, body.x + 400e-6, body.y);
  assert.ok(east && east[0] > 0.9, "asked to go east, it goes east");
  const west = gaitDirection(body, body.x - 400e-6, body.y);
  assert.ok(west && west[0] < -0.9);

  // asked to go due north, a twofold body has nothing pointing there
  assert.equal(gaitDirection(body, body.x, body.y - 400e-6), null,
    "it cannot walk where its symmetry has no direction");

  // a sixfold one can
  const six = startRun(14);
  organism(six, BLOCK, "622");
  assert.ok(gaitDirection(six.bodies[0], six.bodies[0].x, six.bodies[0].y - 400e-6));
});

// ── a step is all of it or none of it ───────────────────────────────────────

test("it will not step if any cell has nowhere to land", () => {
  // A body that leaves part of itself behind is not walking, it is coming
  // apart. So the whole step is refused rather than half taken.
  const run = startRun(15);
  const pitch = latticePitch(run);
  const edge = snap(ARENA_W - pitch * 1.2, ARENA_H / 2 + pitch * 3, pitch);
  let id = 6000;
  for (const [i, j] of BLOCK) {
    run.structures.push(structureFrom(id++, "222", edge.x + i * pitch, edge.y + j * pitch, 0));
  }
  retune(run);

  const x0 = run.bodies[0].x;
  watch(run, ARENA_W - 4e-6, edge.y, 6);      // beckoning it off the end of the world
  assert.equal(run.bodies[0].x, x0, "the wall refuses the whole step");
});

// ── and the pace is the physics ─────────────────────────────────────────────

test("the slowest cell sets the pace, so distance is what slows a body down", () => {
  // trajectory.maxSweepSpeed: a swept trap carries a cell only while it can
  // out-pull the drag, and past that the cell falls out of its node and is left
  // behind. The drive is apodised, so a cell far from your hand feels little of
  // it — and the whole body waits for that cell.
  const run = startRun(16);
  const { pitch, base } = organism(run, BLOCK);
  const near = (() => {
    run.you.x = base.x + 2 * pitch; run.you.y = base.y;
    step(run, IDLE, DT);
    return walkSpeed(run.bodies[0], run.wave);
  })();
  const far = (() => {
    run.you.x = base.x + 2 * pitch + 600e-6; run.you.y = base.y;
    step(run, IDLE, DT);
    return walkSpeed(run.bodies[0], run.wave);
  })();

  assert.ok(near > 0, "standing among it, it can be swept");
  assert.ok(near > far * 4, `and it is far slower from across the arena (${near} vs ${far})`);
});
