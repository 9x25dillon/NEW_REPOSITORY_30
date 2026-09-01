import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  CRUISE_AMPLITUDE, DASH_COST, DASH_TIME, HAND_FOCUS, LEAD, YOU,
  aimFor, beginDash, carry, concentrate, handed, newPilot, ridesAntinodes,
  selfContrast, speed,
} from "../game/pilot.js";
import { advance, aimAt, grip, newWave, velocityAt } from "../game/wave.js";
import { HOLD_PRESSURE } from "../game/run.js";
import { WATER, contrastFactor } from "../src/gorkov.js";

const DT = 1 / 60;
const PITCH = 88e-6;
const MAX = 2.0e5;
const W = 900e-6;
const H = 660e-6;

function rig() {
  const w = newWave(PITCH, MAX, PITCH * HAND_FOCUS, WATER);
  const p = newPilot(W / 2, H / 2);
  return { w, p };
}

/** Drive for a while and report how far the body actually got. */
function run(
  seconds: number, mx: number, my: number, gripping: boolean,
): { travelled: number; stamina: number } {
  const { w, p } = rig();
  const x0 = p.x;
  const y0 = p.y;
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    grip(w, gripping, DT);
    concentrate(p, w, gripping, DT);
    aimFor(p, w, mx, my);
    carry(p, w, DT, 0, W, H);
  }
  return { travelled: Math.hypot(p.x - x0, p.y - y0), stamina: w.stamina };
}

// ── you are a body ──────────────────────────────────────────────────────────

test("nothing moves you but the field", () => {
  // The whole conceit, asserted directly: with the drive at zero, a full stick
  // deflection for a second does not move the player one micron. There is no
  // velocity term anywhere to fall back on.
  const { w, p } = rig();
  w.amplitude = 0;
  const x0 = p.x;
  for (let i = 0; i < 60; i++) {
    aimFor(p, w, 1, 0);
    w.amplitude = 0;
    carry(p, w, DT, 0, W, H);
  }
  assert.equal(p.x, x0, "no drive, no motion");
});

test("the stick is an offset, and it is capped where sin(2ku) peaks", () => {
  const { w, p } = rig();
  const at = aimFor(p, w, 1, 0);
  assert.ok(Math.abs(at.x - p.x - PITCH * LEAD) < 1e-12, "full deflection is a quarter pitch");
  assert.equal(at.y, p.y);

  // Half deflection is half the offset — the stick is a distance, not a speed.
  const half = aimFor(p, w, 0.5, 0);
  assert.ok(Math.abs(half.x - p.x - PITCH * LEAD * 0.5) < 1e-12);

  // And a quarter pitch really is where the force is largest, which is why
  // pushing the stick further would be worth nothing.
  w.amplitude = MAX;
  let best = 0;
  let bestOff = 0;
  for (let i = 1; i <= 80; i++) {
    const off = (i / 80) * (PITCH / 2);
    aimAt(w, p.x + off, p.y, ridesAntinodes(p, w));
    const v = Math.abs(velocityAt(w, p.x, p.y, p.particle).vx);
    if (v > best) { best = v; bestOff = off; }
  }
  assert.ok(Math.abs(bestOff - PITCH * LEAD) < PITCH * 0.04,
    `the pull peaks at ${(bestOff * 1e6).toFixed(1)} um, not ${(PITCH * LEAD * 1e6).toFixed(1)}`);
});

test("letting go of the stick drops the node onto you and you settle", () => {
  const { w, p } = rig();
  w.amplitude = MAX;
  for (let i = 0; i < 40; i++) { aimFor(p, w, 1, 0); carry(p, w, DT, 0, W, H); }
  assert.ok(speed(p) > 300e-6, "moving under full stick");

  for (let i = 0; i < 40; i++) { aimFor(p, w, 0, 0); carry(p, w, DT, 0, W, H); }
  assert.ok(speed(p) < 5e-6, `released, you should sit in your own node (${speed(p) * 1e6} um/s)`);
});

// ── grip is apodisation ─────────────────────────────────────────────────────

test("gripping concentrates the drive rather than merely raising it", () => {
  const { w, p } = rig();
  for (let i = 0; i < 60; i++) concentrate(p, w, false, DT);
  const loose = w.focus;
  assert.ok(!handed(p), "a spread drive is not a hand");

  for (let i = 0; i < 60; i++) concentrate(p, w, true, DT);
  assert.ok(handed(p));
  assert.ok(w.focus < loose, "closing your hand narrows the aperture");
  assert.ok(Math.abs(w.focus - PITCH * HAND_FOCUS) < 1e-9, "down to under one trap pitch");
  assert.ok(loose < PITCH, "and the idle aperture is under a pitch too — it has to be, or it fences");
});

test("the idle drive owns your arm's length and nothing beyond it", () => {
  // A standing wave pins whatever it can hold, and a pinned hunter never
  // arrives — so an idle drive that reaches across the arena is a game in which
  // nothing can happen. What made that fence was REACH, not strength: the
  // aperture was spread over nearly two trap pitches and still owned bodies
  // hundreds of microns out. Concentrated under one pitch it can be three times
  // stronger, walk you at a useful speed, and still lose to a vesicle's own
  // swimming past about fifty microns.
  const { w, p } = rig();
  grip(w, false, 1);
  concentrate(p, w, false, DT);
  assert.ok(w.amplitude <= MAX * CRUISE_AMPLITUDE + 1e-9);
  assert.ok(w.amplitude < HOLD_PRESSURE, "and it still cannot HOLD anything at all");

  const vesicle = { radius: 5.5e-6, rho: 915, c: 1450 };
  const swim = 5.0e-5;
  aimAt(w, 0, 0, contrastFactor(vesicle, WATER) < 0);

  const pullAt = (from: number): number => {
    let worst = 0;
    for (let i = 0; i <= 30; i++) {
      const v = Math.abs(velocityAt(w, from + (i / 30) * (PITCH / 2), 0, vesicle).vx);
      if (v > worst) worst = v;
    }
    return worst;
  };

  assert.ok(pullAt(0) > swim, "close in, the water is yours");
  for (let r = 100e-6; r < 500e-6; r += 50e-6) {
    assert.ok(pullAt(r) < swim,
      `at ${(r * 1e6).toFixed(0)} um the idle drive still pins a vesicle `
      + `(${(pullAt(r) * 1e6).toFixed(0)} um/s against a ${(swim * 1e6).toFixed(0)} um/s swim)`);
  }
});

// ── the dash ────────────────────────────────────────────────────────────────

test("a dash is a burst, and it is paid for once", () => {
  const { w, p } = rig();
  const before = w.stamina;
  assert.ok(beginDash(p, w, 1, 0));
  assert.equal(w.stamina, before - DASH_COST);
  assert.ok(p.iframe > 0, "and it is untouchable while it lasts");
  assert.ok(Math.abs(p.dash - DASH_TIME) < 1e-12);

  assert.ok(!beginDash(p, w, 1, 0), "not twice");
  concentrate(p, w, false, DT);
  assert.ok(w.amplitude > MAX, "the burst is above the sustained rating");
});

test("a dash is refused when there is nothing left to spend", () => {
  const { w, p } = rig();
  w.stamina = DASH_COST - 1;
  assert.ok(!beginDash(p, w, 1, 0));
  w.stamina = 100;
  w.spent = true;
  assert.ok(!beginDash(p, w, 1, 0));
});

test("a dash covers ground no amount of grip does", () => {
  const { w, p } = rig();
  const x0 = p.x;
  beginDash(p, w, 1, 0);
  let frames = 0;
  while (p.dash > 0) {
    grip(w, false, DT);
    concentrate(p, w, false, DT);
    aimFor(p, w, 0, 0);   // a dash does not steer: it goes where it committed
    carry(p, w, DT, 0, W, H);
    frames++;
  }
  const burst = p.x - x0;
  assert.ok(burst > 150e-6, `a dash should cross real ground (${(burst * 1e6).toFixed(0)} um)`);

  const gripped = run(frames * DT, 1, 0, true).travelled;
  assert.ok(burst > gripped * 2,
    `and beat a full grip over the same time (${(burst * 1e6).toFixed(0)} vs `
    + `${(gripped * 1e6).toFixed(0)} um)`);
});

// ── the water decides which way up you are ──────────────────────────────────

test("your own contrast picks the lattice that carries you", () => {
  const { w, p } = rig();
  assert.ok(selfContrast(p, w) < 0, "lipid in the first water: an antinode-seeker");
  assert.ok(ridesAntinodes(p, w));

  aimFor(p, w, 1, 0);
  assert.ok(w.inverted, "so the trap put under you is the other one");

  // A water on the far side of your iso-acoustic point turns it over, and
  // nothing had to be told: it is one contrast factor against a new medium.
  const dense = newWave(PITCH, MAX, PITCH * HAND_FOCUS, { rho: 940, c: 1380 });
  const q = newPilot(0, 0);
  assert.ok(selfContrast(q, dense) > 0, "a light slow water carries you the other way");
  assert.ok(!ridesAntinodes(q, dense));
  aimFor(q, dense, 1, 0);
  assert.ok(!dense.inverted);
});

// ── the integrator ──────────────────────────────────────────────────────────

test("a big body settles into its trap instead of ringing around it", () => {
  // Regression, and it was visible: du/dt = A sin(2ku) relaxes at 2k|A|, and A
  // goes as a^2, so at sixty frames a second a nineteen-micron body stepped
  // clean over its own well and was thrown back harder every frame. It looked
  // like a sovereign vibrating in place. Substepping is the fix, and this is
  // the shape of the failure it prevents.
  const w = newWave(PITCH, MAX, 0, WATER);
  w.amplitude = MAX;
  aimAt(w, 0, 0, false);
  const king = { radius: 19.2e-6, rho: 1120, c: 1600 };

  let x = 30e-6;
  const seen: number[] = [];
  for (let i = 0; i < 40; i++) {
    x = advance(w, x, 0, king, DT).x;
    seen.push(x);
  }
  assert.ok(Math.abs(x) < 2e-6, `it should end up in the node (${(x * 1e6).toFixed(1)} um)`);

  // It must never appear on the far side of the node. The old failure threw it
  // to minus fifteen microns on the second frame and back again forever; a
  // correctly stepped approach is one-sided all the way in.
  assert.ok(seen.every((u) => u > -2e-6),
    `it crossed the node to ${(Math.min(...seen) * 1e6).toFixed(1)} um`);
  assert.ok(seen[0] < 30e-6, "and it started closing immediately");
});

test("the body you are is the body the physics sees", () => {
  const { p } = rig();
  assert.equal(p.particle, YOU);
  assert.ok(YOU.radius > 1.5e-6, "well above the streaming crossover: the field owns you");
});
