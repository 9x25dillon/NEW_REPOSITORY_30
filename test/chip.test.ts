import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  type Feature,
  CAVITY_REACH, EDGE_GAIN, EDGE_REACH, EDGE_STANDOFF_FRAC,
  features, flowAt, nearestFeature,
} from "../game/chip.js";
import {
  ARENA_H, ARENA_W, BIND_RADIUS, CHANNEL_H, CHANNEL_W, CHIP, HOLD_CATCH,
  MAX_AMPLITUDE, MAX_SUSPENSION, START,
  boundsFor, chipFlow, newMotif, retune, startRun, step, suspension,
} from "../game/run.js";
import { BUILDABLE } from "../game/lattice.js";
import { reachOf, structureFrom } from "../game/world.js";
import { lobes } from "../game/shape.js";
import { CRUISE_AMPLITUDE, YOU, speed } from "../game/pilot.js";
import { advance, aimAt, newWave, streamingSpeed } from "../game/wave.js";
import { MAMMALIAN_CELL } from "../src/gorkov.js";

const CRUISE = MAX_AMPLITUDE * CRUISE_AMPLITUDE;
const at = (x: number, y: number, a = MAX_AMPLITUDE) => {
  const f = flowAt(CHIP, x, y, a);
  return Math.hypot(f.x, f.y);
};
const edges = CHIP.filter((f) => f.kind === "edge");
const cavities = CHIP.filter((f) => f.kind === "cavity");

// ── the chip is the thing that does not change ──────────────────────────────

test("the same mask prints the same chip, every time and in every aeon", () => {
  // This is the whole claim the module rests on. A world is a consequence of
  // the last sovereign and nothing in it can be relied on twice; the glass was
  // etched once. If this ever takes a seed, there is no landmark in this game.
  assert.deepEqual(features(CHANNEL_W, CHANNEL_H), features(CHANNEL_W, CHANNEL_H));
  assert.ok(edges.length > 0 && cavities.length > 0, "both kinds are etched");
  for (const f of CHIP) {
    assert.ok(f.x >= 0 && f.x <= CHANNEL_W, "inside the glass");
    assert.ok(f.y >= 0 && f.y <= CHANNEL_H, "inside the glass");
  }
});

test("nothing on the chip is a stat block: every speed comes out of the drive", () => {
  // The flow is streamingSpeed times a declared ratio and nothing else, so at
  // zero drive there is no chip at all, and it goes as pressure SQUARED because
  // that is what second-order streaming does.
  for (const f of CHIP) assert.equal(at(f.x, f.y, 0), 0, "dead glass with no field");

  const e = edges[0];
  const one = at(e.x, e.y, 1e5);
  const two = at(e.x, e.y, 2e5);
  assert.ok(two / one > 3.8 && two / one < 4.2, `doubling pressure quadruples it: ${two / one}`);
  assert.ok(
    Math.abs(at(e.x, e.y) - streamingSpeed(MAX_AMPLITUDE) * EDGE_GAIN) < 1e-9,
    "a tip is exactly bulk streaming times the declared ratio",
  );
});

// ── the opening minute is not weather ───────────────────────────────────────

test("no plume reaches the starting pool at all", () => {
  // THE HARD VERSION OF THE RULE BELOW, and the reason it is here: the
  // magnitude test underneath passed with an edge planted in the dead centre of
  // the channel, throwing 17 um/s straight into the pool, because any threshold
  // loose enough to pass the real layout was loose enough to pass that too. A
  // clearance in microns has no such slack. It is also what set the stations:
  // at a third of the channel a tip is 593 um from the corner of the pool
  // against a 720 um plume, and no amount of arguing about how weak that is
  // makes it absent.
  const gap = (f: Feature) => {
    const cx = Math.max(START.x, Math.min(START.x + ARENA_W, f.x));
    const cy = Math.max(START.y, Math.min(START.y + ARENA_H, f.y));
    return Math.hypot(f.x - cx, f.y - cy) - f.reach;
  };
  for (const f of CHIP) {
    assert.ok(gap(f) > 0,
      `${f.kind} #${f.id} reaches ${(-gap(f) * 1e6).toFixed(0)} um into the starting pool`);
  }
  const tightest = Math.min(...CHIP.map(gap));
  assert.ok(tightest < 400e-6,
    `and the chip still comes close (${(tightest * 1e6).toFixed(0)} um): pushed further out `
    + "than it needs to be, the far water stops being somewhere you can nearly see");
});

test("the water you start in is still", () => {
  // The middle column of the channel is left clear on purpose. The first minute
  // of this game is about learning that a node holds things, and a current
  // running through it would teach something else. Asserted at FULL grip, which
  // is the strongest the chip ever gets short of a dash.
  let worst = 0;
  for (let x = START.x; x <= START.x + ARENA_W; x += 15e-6) {
    for (let y = START.y; y <= START.y + ARENA_H; y += 15e-6) {
      worst = Math.max(worst, at(x, y));
    }
  }
  assert.ok(worst < 25e-6, `${(worst * 1e6).toFixed(0)} um/s in the starting pool`);

  const run = startRun(4);
  const f = chipFlow(run, run.you.x, run.you.y);
  assert.ok(Math.hypot(f.x, f.y) < 25e-6, "and none of it is on you when you begin");
});

test("you have to grow into the chip before it will touch you", () => {
  // The workable water opens with the largest body you have built, so the chip
  // is a thing you earn your way out to rather than a thing you are handed.
  const touchable = (cells: number) => {
    const b = boundsFor(cells);
    return CHIP.filter((f) =>
      f.x >= b.x && f.x <= b.x + b.w && f.y >= b.y && f.y <= b.y + b.h).length;
  };
  assert.equal(touchable(0), 0, "nothing is in reach when you have built nothing");
  assert.ok(touchable(14) > 0, "the first tips come into reach as the organism grows");
  assert.ok(touchable(14) < CHIP.length, "and the far ones are still out there");
  assert.equal(touchable(30), CHIP.length, "a grown organism has the whole chip");

  // and the growth really is monotone, so nothing is ever taken back
  let last = -1;
  for (let c = 0; c <= 30; c++) {
    const n = touchable(c);
    assert.ok(n >= last, `reach must not shrink at ${c} cells`);
    last = n;
  }
});

// ── a sharp edge ────────────────────────────────────────────────────────────

test("a tip throws water away from itself, and behind it is shelter", () => {
  // A jet off a sharp tip is a lobe, not a sphere. That is what makes an edge a
  // piece of terrain rather than a hazard radius: there is a side of it to be on.
  for (const e of edges) {
    const ahead = flowAt(CHIP, e.x + e.jx * 120e-6, e.y + e.jy * 120e-6, MAX_AMPLITUDE);
    assert.ok(ahead.x * e.jx + ahead.y * e.jy > 0, "the jet leaves along the bisector");
    assert.ok(Math.hypot(ahead.x, ahead.y) > 200e-6, "and it is worth being pushed by");

    const behind = at(e.x - e.jx * 150e-6, e.y - e.jy * 150e-6);
    assert.ok(behind < 1e-6, `standing behind a tip is standing out of its way: ${behind}`);
  }
  // Asked of one tip alone: at 1.01 reach from this tip you are already inside
  // the next one's plume, which is the array doing its job rather than a leak.
  const lone = edges[0];
  assert.equal(
    Math.hypot(...Object.values(flowAt(
      [lone], lone.x + lone.jx * EDGE_REACH * 1.01, lone.y + lone.jy * EDGE_REACH * 1.01,
      MAX_AMPLITUDE,
    )) as [number, number]),
    0, "and a plume ends",
  );
});

test("the edges are cut to pump, so the chip circulates", () => {
  // An array of sharp edges cut straight fights across the channel and cancels.
  // Cut over, it adds along the channel — which is what a sharp-edge pump IS,
  // and here it means the two long walls are a way around the map.
  const bottom = edges.filter((e) => e.y < CHANNEL_H / 2);
  const top = edges.filter((e) => e.y > CHANNEL_H / 2);
  assert.equal(bottom.length, top.length, "both walls are etched");

  for (const e of bottom) {
    assert.ok(e.jy > 0, "a bottom tip throws into the channel");
    assert.ok(e.jx > 0, "and along it one way");
  }
  for (const e of top) {
    assert.ok(e.jy < 0, "a top tip throws into the channel");
    assert.ok(e.jx < 0, "and along it the other way");
  }

  // which is a circulation, not two currents: net flow along the walls opposes
  const sample = (ys: number) => {
    let sum = 0;
    for (let x = 0; x <= CHANNEL_W; x += 25e-6) sum += flowAt(CHIP, x, ys, MAX_AMPLITUDE).x;
    return sum;
  };
  assert.ok(sample(CHANNEL_H * EDGE_STANDOFF_FRAC) > 0, "the bottom wall carries you one way");
  assert.ok(sample(CHANNEL_H * (1 - EDGE_STANDOFF_FRAC)) < 0, "the top wall carries you back");
});

// ── a bubble cavity ─────────────────────────────────────────────────────────

test("a cavity turns, and its core and its rim are both still", () => {
  // A closed streaming vortex has a rotational core that turns as a solid body
  // and a decaying outside, so the fastest water is between the two. There is
  // no wall of current at the edge of it and no singularity at the middle.
  const c = cavities[0];
  const along = (r: number) => at(c.x, c.y + r);

  assert.ok(along(CAVITY_REACH * 0.5) > along(CAVITY_REACH * 0.05), "still at the core");
  assert.ok(along(CAVITY_REACH * 0.5) > along(CAVITY_REACH * 0.95), "still at the rim");
  const solo = (r: number) => {
    const f = flowAt([c], c.x, c.y + r, MAX_AMPLITUDE);
    return Math.hypot(f.x, f.y);
  };
  assert.equal(solo(CAVITY_REACH * 1.01), 0, "and it ends");

  // it really turns rather than merely pulling
  const f = flowAt(CHIP, c.x, c.y + CAVITY_REACH * 0.5, MAX_AMPLITUDE);
  assert.ok(Math.abs(f.x) > Math.abs(f.y), "tangential dominates the migration");
});

test("the way out of a whirlpool is to stop driving", () => {
  // THE INVERSION, and it is the reason this module is interesting. Every other
  // habit the game teaches is grip-to-survive: a node under your hand fences
  // off everything that answers to the other lattice. But the chip is powered
  // by the drive, so gripping is what makes the vortex strong — and the escape
  // is the one thing the game has never asked for.
  const c = cavities[0];
  const worst = (a: number) => {
    let m = 0;
    for (let r = 10e-6; r < CAVITY_REACH; r += 5e-6) m = Math.max(m, at(c.x, c.y + r, a));
    return m;
  };

  const gripping = worst(MAX_AMPLITUDE);
  const released = worst(CRUISE);
  assert.ok(gripping > released * 2.5, "gripping makes it very much worse");

  // measured against what you can actually do about it, rather than against a
  // number someone liked: how fast the pilot walks at cruise, in this water.
  const run = startRun(11);
  let cruiseSpeed = 0;
  for (let i = 0; i < 240; i++) {
    step(run, { move: { x: 1, y: 0 }, grip: false, dash: false }, 1 / 60);
    if (i > 120) cruiseSpeed = Math.max(cruiseSpeed, speed(run.you));
  }
  assert.ok(released < cruiseSpeed,
    `a released vortex (${(released * 1e6).toFixed(0)} um/s) must be walkable `
    + `against (${(cruiseSpeed * 1e6).toFixed(0)} um/s)`);
  assert.ok(gripping > cruiseSpeed,
    "and a driven one must not be, or there is no decision here");
});

// ── the size law, which nobody wrote ────────────────────────────────────────

test("a jet takes the small and leaves the large, and no code says so", () => {
  // Radiation force goes as radius cubed; drag from a flow goes as radius. The
  // flow field is size-blind on purpose — flowAt is never told how big anything
  // is — so the whole of the difference has to fall out of the trap fighting the
  // drag. If this test fails, something grew a size term it should not have.
  //
  // THE TRAP HAS TO BE AIMED AT THE BODY for this to mean anything, and finding
  // that out was the useful part. The drive is apodised around your hand: four
  // hundred microns away the local amplitude is 0.1 kPa out of 200, so a body
  // out in the channel with nobody near it has NO trap to hold and the jet
  // simply takes it, whatever its size. That is not a flaw in the measurement,
  // it is the rule the far water runs on — and it is why a cavity out there
  // collects rather than merely stirs.
  const w = newWave(160e-6, MAX_AMPLITUDE, 160e-6 * 0.62, { rho: 997, c: 1497 });
  w.amplitude = MAX_AMPLITUDE;  // newWave hands back an undriven wave
  const e = edges[0];
  const x0 = e.x + e.jx * 90e-6;
  const y0 = e.y + e.jy * 90e-6;
  aimAt(w, x0, y0, false);

  const swept = (radius: number) => {
    const p = { ...MAMMALIAN_CELL, radius };
    let x = x0, y = y0, far = 0;
    for (let i = 0; i < 8 * 60; i++) {
      const moved = advance(w, x, y, p, 1 / 60);
      const f = flowAt(CHIP, x, y, w.amplitude);
      x = moved.x + f.x / 60;
      y = moved.y + f.y / 60;
      far = Math.max(far, Math.hypot(x - x0, y - y0));
    }
    return far;
  };

  const mote = swept(0.5e-6);
  const cell = swept(YOU.radius);
  assert.ok(mote > 300e-6, `a mote is carried clear out of the plume: ${(mote * 1e6).toFixed(0)} um`);
  assert.ok(cell < 60e-6, `a body keeps its node: ${(cell * 1e6).toFixed(0)} um`);
  assert.ok(mote > cell * 10, "and the gap between them is not marginal");

  // the crossover really is a crossover, and it sits where gorkov says: between
  // a couple of microns and a cell, not at some radius picked to make a point
  const three = swept(3e-6);
  assert.ok(three > cell * 5, "three microns still loses to a jet this strong");
  assert.ok(swept(19e-6) < cell, "and a sovereign barely notices it");
});

// ── the reason to go out there ──────────────────────────────────────────────

test("a cavity gathers while you are on the other side of the channel", () => {
  // WHAT A LATERAL CAVITY IS FOR. It is not decoration in a corner: an
  // oscillating bubble concentrating particles out of a passing flow is what
  // the device does in the literature and why anyone etches one. Here it means
  // the far water has been working while you were not in it, so going to look
  // is the reward for going — and it costs the game nothing to run, because it
  // is the same flowAt every other body is already being moved by.
  //
  // It works out there precisely BECAUSE you are not there: the drive is
  // apodised around your hand, so a cavity across the channel has no trap
  // fighting it and nothing it catches can hold a node.
  const run = startRun(23);
  run.bounds = boundsFor(30);           // an organism grown into the whole chip
  const c = cavities[0];

  const marked: number[] = [];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI;       // an arc of water outside the cavity
    const r = CAVITY_REACH * 0.85;
    const put = newMotif(run, true);
    put.x = c.x + Math.cos(a) * r;
    put.y = c.y + Math.abs(Math.sin(a)) * r;
    marked.push(put.id);
    run.entities.push(put);
  }
  const spread = () => {
    const live = run.entities.filter((e) => marked.includes(e.id));
    return live.length
      ? live.reduce((m, e) => m + Math.hypot(e.x - c.x, e.y - c.y), 0) / live.length
      : Infinity;
  };

  const before = spread();
  for (let i = 0; i < 25 * 60; i++) {
    step(run, { move: { x: 0, y: 0 }, grip: false, dash: false }, 1 / 60);
  }
  const after = spread();

  assert.ok(after < before * 0.7,
    `the cavity drew them in: ${(before * 1e6).toFixed(0)} um -> ${(after * 1e6).toFixed(0)} um`);
  assert.ok(run.you.y > CHANNEL_H / 3,
    "and it did it with nobody near it — you never left the middle of the channel");
});

// ── saying where you are ────────────────────────────────────────────────────

test("the chip can tell you what you are standing in, and only when you are", () => {
  const c = cavities[0];
  assert.equal(nearestFeature(CHIP, START.x + ARENA_W / 2, START.y + ARENA_H / 2), null,
    "the starting pool is not near anything");

  const near = nearestFeature(CHIP, c.x, c.y + CAVITY_REACH * 0.3);
  assert.ok(near, "and standing in a cavity, you are told");
  assert.equal(near.feature.id, c.id);
  assert.ok(near.r < CAVITY_REACH);
});

// ── the water the chip stands in ────────────────────────────────────────────
//
// A collector is worth nothing in distilled water, and until the suspension
// became a concentration that is exactly what the outer channel was. Every
// motif in the game was seeded into the starting pool and held there by a count
// — the channel is 21.2 times that pool's area — so `chip.ts`'s central claim,
// that a cavity "has been gathering while you were elsewhere", was false. Not
// because the cavity was wrong: a mote at its rim is at the core in fifteen
// seconds. Because nothing was ever out there.

test("the water you open is carrying something: density is a concentration", () => {
  const run = startRun(4);
  const pool = suspension(run);
  assert.equal(pool, run.world.density, "in the starting pool it is the tuned figure exactly");

  // The same water, opened out. A suspension does not thin because you can
  // reach more of it.
  run.bounds = { x: 0, y: 0, w: CHANNEL_W, h: CHANNEL_H };
  const opened = suspension(run);
  const ratio = (CHANNEL_W * CHANNEL_H) / (ARENA_W * ARENA_H);
  assert.ok(opened > pool * 10, `the whole channel holds far more than the pool: ${opened} vs ${pool}`);
  assert.ok(
    Math.abs(opened - run.world.density * ratio) < 2,
    `and it holds exactly the concentration, not a capped guess: ${opened}`,
  );
  assert.ok(opened <= MAX_SUSPENSION, "the backstop is above what any real world asks for");
});

test("a bubble cavity gathers while you are somewhere else", () => {
  // THE REWARD FOR GOING. The player never moves and never grips; the drive is
  // floored at cruise, which is what makes the chip alive at all.
  const run = startRun(11);
  run.bounds = { x: 0, y: 0, w: CHANNEL_W, h: CHANNEL_H };
  run.you.x = CHANNEL_W / 2;
  run.you.y = CHANNEL_H / 2;
  const dt = 1 / 60;
  for (let i = 0; i < 90 / dt; i++) {
    step(run, { move: { x: 0, y: 0 }, grip: false, dash: false }, dt);
    run.bounds = { x: 0, y: 0, w: CHANNEL_W, h: CHANNEL_H };
  }
  const motifs = run.entities.filter((e) => e.faction === "motif");
  const inCore = (f: Feature) =>
    motifs.filter((e) => Math.hypot(e.x - f.x, e.y - f.y) < 80e-6).length;

  // A core is a 160 um circle in a 4200 x 3000 um channel: a thousandth of the
  // area. Anything above a couple of motifs is concentration, not chance.
  const piles = cavities.map(inCore);
  const byChance = motifs.length * (Math.PI * 80e-6 ** 2) / (CHANNEL_W * CHANNEL_H);
  for (const [i, n] of piles.entries()) {
    assert.ok(
      n > byChance * 8,
      `cavity ${i} holds ${n} motifs where an even scatter of ${motifs.length} would leave ` +
      `${byChance.toFixed(1)} there. That is concentration, which is what a cavity is for.`,
    );
  }

  // And a sharp edge does the opposite, which is the point of cutting it tilted:
  // it pumps rather than collects, so it strings its catch out along the jet.
  for (const f of edges) {
    assert.ok(inCore(f) <= 4, "a tip throws water away from itself, it does not hoard it");
  }
});

test("building at a cavity is a decision: the arm tip has to land on the core", () => {
  // The measurement this exists to protect. A cavity concentrates into a POINT
  // and a building holds on a RING of arm tips, so the same building at the
  // same cavity either farms or does nothing depending on one placement. If
  // this ever stops being true, HOLD_CATCH and the catchment the surface draws
  // have drifted apart from each other.
  const hm = BUILDABLE[0];
  const cav = cavities.find((f) => f.y === 0)!;
  const r = reachOf(hm);
  const [lx, ly] = lobes(hm)[0];

  const farmed = (sx: number, sy: number) => {
    const run = startRun(11);
    run.bounds = { x: 0, y: 0, w: CHANNEL_W, h: CHANNEL_H };
    run.you.x = CHANNEL_W / 2;
    run.you.y = CHANNEL_H / 2;
    run.structures.push(structureFrom(run.nextId++, hm, sx, sy, 0));
    retune(run);
    run.bounds = { x: 0, y: 0, w: CHANNEL_W, h: CHANNEL_H };
    const dt = 1 / 60;
    let merges = 0;
    for (let i = 0; i < 60 / dt; i++) {
      run.events.length = 0;
      step(run, { move: { x: 0, y: 0 }, grip: false, dash: false }, dt);
      merges += run.events.filter((e) => e.kind === "merge").length;
      run.bounds = { x: 0, y: 0, w: CHANNEL_W, h: CHANNEL_H };
    }
    return merges;
  };

  // One reach back along a lobe, so that arm's tip sits exactly on the core.
  const onCore = farmed(cav.x - lx * r, cav.y - ly * r);
  // The same building, its tip a clear catchment-and-a-half off the core.
  const offBy = r * HOLD_CATCH * 2.5;
  const missed = farmed(cav.x - lx * r + offBy, cav.y - ly * r + offBy);

  assert.ok(onCore > 0, `a tip on the core binds what the cavity brings (${onCore} merges)`);
  assert.ok(
    onCore > missed * 2,
    `and placement is the whole of it: ${onCore} merges on the core against ${missed} off it`,
  );
});

test("the merge grid finds every pair the pairwise sweep did, and no others", () => {
  // mergePass went from comparing every pair to a grid of exactly BIND_RADIUS,
  // which is only correct if nothing can bind further away than one square.
  //
  // The evidence is that the two motifs NOTICED each other at all, not that
  // they joined: a pair that finds each other and is refused by the assembly
  // rules is still a pair the sweep found. Both outcomes are events, and a
  // neighbourhood that dropped the pair emits neither.
  const dt = 1 / 60;
  const planted = (gap: number) => {
    const run = startRun(2);
    // Nobody else in the water: the suspension tops itself up every frame, and
    // arrivals colliding elsewhere would answer this question for us.
    run.world = { ...run.world, density: 0 };
    run.entities = [];
    // Straddling a grid line on purpose: the pair's midpoint sits on a corner
    // of the hash, which is the placement a naive single-cell lookup loses.
    const gx = Math.ceil(run.you.x / BIND_RADIUS) * BIND_RADIUS;
    const gy = Math.ceil(run.you.y / BIND_RADIUS) * BIND_RADIUS;
    run.you.x = gx;
    run.you.y = gy;
    for (const sgn of [-1, 1]) {
      const e = newMotif(run, true);
      e.x = gx + (sgn * gap) / 2;
      e.y = gy + (sgn * gap) / 2;
      run.entities.push(e);
    }
    let noticed = false;
    for (let i = 0; i < 90; i++) {
      run.events.length = 0;
      step(run, { move: { x: 0, y: 0 }, grip: true, dash: false }, dt);
      if (run.events.some((e) => e.kind === "merge" || e.kind === "refuse")) noticed = true;
      if (run.entities.filter((e) => e.faction === "motif").length < 2) noticed = true;
    }
    return noticed;
  };

  assert.ok(
    planted((BIND_RADIUS * 0.5) / Math.SQRT2),
    "a pair inside BIND_RADIUS finds each other even across a grid line",
  );
  assert.ok(
    !planted((BIND_RADIUS * 3) / Math.SQRT2),
    "a pair outside it never does, so the grid is not introducing strangers",
  );
});
