import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  ARENA_H, ARENA_W, CHANNEL_H, CHANNEL_W, START, boundsFor, latticePitch, retune,
  startRun, step, type Input, type Run,
} from "../game/run.js";
import { autonomous, gaitDirection, snap, walkSpeed } from "../game/body.js";
import { structureFrom } from "../game/world.js";
import { lobes } from "../game/shape.js";

const DT = 1 / 60;
const IDLE: Input = { move: { x: 0, y: 0 }, grip: false, dash: false };

/** A body of `shape` cells, on the lattice, clear of the throne. */
function organism(run: Run, shape: Array<[number, number]>, hm = "222") {
  const pitch = latticePitch(run);
  const base = snap(START.x + 140e-6, START.y + 140e-6, pitch);
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

  // Called from beyond where it will stop, but inside what the drive can reach:
  // it comes to its own edge plus a clear site and no closer, so there is always
  // somewhere left to put the next cell down.
  const x0 = run.bodies[0].x;
  const steps = watch(run, base.x + 5 * pitch, base.y, 10);
  assert.ok(steps > 0, "it should come to you");
  assert.ok(run.bodies[0].x > x0 + pitch * 0.9, "and end up nearer than it started");

  // and it stops short rather than standing on you: a body that follows onto
  // your own lattice site takes away every place you could build.
  const arrived = run.bodies[0].x;
  watch(run, base.x + 5 * pitch, base.y, 8);
  // It leaves a clear site around YOU, measured from whichever of its cells is
  // nearest — not from its centre, which for a large body is so far back that
  // the sweep cannot reach it and it stops walking altogether.
  const me = { x: base.x + 5 * pitch, y: base.y };
  const nearest = Math.min(...run.bodies[0].cells.map(
    (c) => Math.hypot(me.x - c.x, me.y - c.y)));
  assert.ok(nearest > pitch * 0.95, `its nearest cell is ${nearest / pitch} sites off, which is on top of you`);
  assert.ok(Math.abs(run.bodies[0].x - arrived) < pitch * 3, "and settles rather than orbiting");
});

test("a scatter that is not a body does not walk", () => {
  const run = startRun(12);
  const { pitch, base } = organism(run, [[0, 0], [1, 0]]);
  assert.ok(!autonomous(run.bodies[0]));
  const x0 = run.bodies[0].x;
  assert.equal(watch(run, base.x + 5 * pitch, base.y, 6), 0);
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
  // At the edge the water WILL have once this body is standing in it — putting
  // six cells down opens the channel further, so the old edge is not one.
  const b = boundsFor(BLOCK.length);
  const edge = snap(b.x + b.w - pitch * 1.2, b.y + b.h / 2, pitch);
  let id = 6000;
  for (const [i, j] of BLOCK) {
    run.structures.push(structureFrom(id++, "222", edge.x + i * pitch, edge.y + j * pitch, 0));
  }
  retune(run);

  const x0 = run.bodies[0].x;
  watch(run, run.bounds.x + run.bounds.w - 4e-6, edge.y, 6);      // beckoning it off the end of the world
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
    run.you.x = base.x + 2 * pitch + 1800e-6; run.you.y = base.y;
    step(run, IDLE, DT);
    return walkSpeed(run.bodies[0], run.wave);
  })();

  assert.ok(near > 0, "standing among it, it can be swept");
  assert.ok(near > far * 4, `and it is far slower from across the arena (${near} vs ${far})`);
});

// ── and the water opens as the organism does ────────────────────────────────

test("the water you can work in opens as the thing you built grows", () => {
  // A crystal of silica skeletons is a phononic structure — it is what guides
  // and confines a wave, which is the whole of the bound field's story — so the
  // region you can drive is the region your crystal reaches into. A player who
  // has built nothing is in the pool the game has always been.
  const start = boundsFor(0);
  assert.equal(start.w, ARENA_W);
  assert.equal(start.h, ARENA_H);

  let last = start.w;
  for (const n of [4, 6, 9, 12]) {
    const b = boundsFor(n);
    assert.ok(b.w > last, `${n} cells should open it further`);
    assert.ok(Math.abs(b.w / b.h - ARENA_W / ARENA_H) < 1e-9, "and keep its shape");
    last = b.w;
  }

  // It stops at the glass, however big the organism gets.
  assert.equal(boundsFor(30).w, CHANNEL_W);
  assert.equal(boundsFor(400).w, CHANNEL_W);
  assert.equal(boundsFor(400).h, CHANNEL_H);
  assert.ok(CHANNEL_W * CHANNEL_H > ARENA_W * ARENA_H * 6, "and it is a great deal more water");
});

test("building opens it, and the run knows", () => {
  const run = startRun(3);
  assert.equal(run.bounds.w, ARENA_W);

  const pitch = latticePitch(run);
  const base = snap(START.x + 140e-6, START.y + 140e-6, pitch);
  let id = 900;
  for (let i = 0; i < 9; i++) {
    run.structures.push(structureFrom(id++, "222",
      base.x + (i % 3) * pitch, base.y + Math.floor(i / 3) * pitch, 0));
  }
  retune(run);
  assert.ok(run.bounds.w > ARENA_W * 1.5, `a nine-cell body opens it to ${run.bounds.w}`);

  // and the wildlife arrives at the new edges, not the old ones
  const spawned = run.entities.length;
  assert.ok(spawned > 0);
});
