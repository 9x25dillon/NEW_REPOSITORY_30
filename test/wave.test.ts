import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  STAMINA_MAX, WATER_VISCOSITY,
  aimAt, authority, driftVelocity, envelopeAt, grip, localAmplitude, newWave,
  peakForce, streamingSpeed, trapsX, trapsY, velocityAt, wavelength,
} from "../game/wave.js";
import {
  CROSSOVER_RADIUS_ORDER, MAMMALIAN_CELL, LIPID_DROPLET, WATER,
  contrastFactor, stokesDrag,
} from "../src/gorkov.js";
import { axisX } from "../game/wave.js";

const PITCH = 80e-6;
const SPAN = 800e-6;
const CELL = MAMMALIAN_CELL;

function lit(pitch = PITCH, focus = 0) {
  const w = newWave(pitch, 2e5, focus);
  w.amplitude = w.maxAmplitude;
  return w;
}

const nearestTo = (xs: number[], v: number): number =>
  xs.reduce((b, x) => (Math.abs(x - v) < Math.abs(b - v) ? x : b), xs[0]);

test("aiming puts a node exactly under the cursor, on both axes", () => {
  // The single claim the control scheme rests on. If this drifts, every trap
  // in the game sits somewhere other than where the player pointed.
  const w = lit();
  for (const [x, y] of [[400e-6, 300e-6], [123e-6, 57e-6], [777e-6, 599e-6]]) {
    aimAt(w, x, y);
    assert.ok(Math.abs(nearestTo(trapsX(w, CELL, SPAN), x) - x) < 1e-12,
      `x node missed by ${nearestTo(trapsX(w, CELL, SPAN), x) - x}`);
    assert.ok(Math.abs(nearestTo(trapsY(w, CELL, SPAN), y) - y) < 1e-12);
  }
});

test("inverting puts an ANTINODE under the cursor instead", () => {
  // Both lattices are the same field a quarter wavelength apart, and the
  // inversion is a phase offset rather than a second mechanism. A negative
  // contrast particle traps at antinodes, so asking IT where its traps are is
  // how we check the antinode landed on the cursor.
  const w = lit();
  const x = 310e-6, y = 240e-6;
  assert.ok(contrastFactor(LIPID_DROPLET, WATER) < 0, "the probe must be antinode-seeking");

  aimAt(w, x, y, true);
  assert.ok(Math.abs(nearestTo(trapsX(w, LIPID_DROPLET, SPAN), x) - x) < 1e-12);
  assert.ok(Math.abs(nearestTo(trapsY(w, LIPID_DROPLET, SPAN), y) - y) < 1e-12);

  // and the node-seekers are now half a trap spacing away — pushed, not pulled
  const gap = Math.abs(nearestTo(trapsX(w, CELL, SPAN), x) - x);
  assert.ok(Math.abs(gap - PITCH / 2) < 1e-9, `node sits ${gap} from the cursor`);
});

test("the two lattices are one quarter wavelength apart", () => {
  const w = lit();
  aimAt(w, 400e-6, 300e-6);
  const node = nearestTo(trapsX(w, CELL, SPAN), 400e-6);
  const anti = nearestTo(trapsX(w, LIPID_DROPLET, SPAN), 400e-6);
  assert.ok(Math.abs(Math.abs(node - anti) - wavelength(w) / 4) < 1e-9);
});

test("no grip is no force", () => {
  const w = newWave(PITCH, 2e5);
  aimAt(w, 400e-6, 300e-6);
  const v = velocityAt(w, 430e-6, 300e-6, CELL);
  assert.equal(v.vx, 0);
  assert.equal(v.vy, 0);
});

test("drift velocity is the exact inverse of Stokes drag", () => {
  // Not a re-derivation: the game's velocity is asserted against the library's
  // own drag law, so if either moves the other has to.
  const w = lit();
  aimAt(w, 400e-6, 300e-6);
  const x = 430e-6;
  const f = peakForce(axisX(w), CELL);
  const v = driftVelocity(f, CELL.radius, WATER_VISCOSITY);
  assert.ok(Math.abs(stokesDrag(v, CELL.radius, WATER_VISCOSITY) - f) < 1e-18);
  assert.ok(Number.isFinite(velocityAt(w, x, 300e-6, CELL).vx));
});

test("a cell is pulled toward the node and a droplet away from it", () => {
  // The sign of the contrast factor, which is the whole game, asserted as
  // motion rather than as a number.
  const w = lit();
  const cx = 400e-6;
  aimAt(w, cx, 300e-6);
  const probe = cx + 20e-6;   // just to the right of the cursor
  assert.ok(velocityAt(w, probe, 300e-6, CELL).vx < 0, "cell should move back to the node");
  assert.ok(velocityAt(w, probe, 300e-6, LIPID_DROPLET).vx > 0, "droplet should flee it");
});

test("the focus envelope makes the grip local, and force falls off as its square", () => {
  const focus = 105e-6;
  const w = lit(PITCH, focus);
  aimAt(w, 400e-6, 300e-6);

  assert.ok(Math.abs(envelopeAt(w, 400e-6, 300e-6) - 1) < 1e-12, "unity at the cursor");
  const e1 = envelopeAt(w, 400e-6 + focus, 300e-6);
  assert.ok(Math.abs(e1 - Math.exp(-0.5)) < 1e-9, "1/e at one focus radius");

  // pressure is enveloped; force goes as pressure squared
  const near = localAmplitude(w, 400e-6, 300e-6);
  const far = localAmplitude(w, 400e-6 + 2 * focus, 300e-6);
  assert.ok(far / near < 0.15, "two focus radii out should be nearly released");

  const fNear = peakForce(axisX(w, near), CELL);
  const fFar = peakForce(axisX(w, far), CELL);
  assert.ok(Math.abs(fFar / fNear - (far / near) ** 2) < 1e-9);
});

test("authority follows the a-squared law and is unity at the crossover", () => {
  assert.ok(Math.abs(authority(CROSSOVER_RADIUS_ORDER) - 1) < 1e-12);
  assert.ok(Math.abs(authority(2 * CROSSOVER_RADIUS_ORDER) - 4) < 1e-12);
  assert.ok(Math.abs(authority(0.5 * CROSSOVER_RADIUS_ORDER) - 0.25) < 1e-12);
});

test("streaming wins below the crossover and loses above it", () => {
  // The game's one calibrated constant, checked at the place it was pinned and
  // on both sides of it. Everything away from that point follows from the a^2
  // law, which is the part gorkov.ts actually vouches for.
  const w = newWave(150e-6, 2e5);
  w.amplitude = 2e5;
  const stream = streamingSpeed(w.amplitude);

  const radial = (radius: number): number =>
    Math.abs(driftVelocity(
      peakForce(axisX(w), { ...MAMMALIAN_CELL, radius }), radius, WATER_VISCOSITY));

  assert.ok(Math.abs(radial(CROSSOVER_RADIUS_ORDER) / stream - 1) < 1e-9,
    "the crossover is where the two are equal, by construction");
  assert.ok(radial(0.5 * CROSSOVER_RADIUS_ORDER) < stream, "streaming owns the small ones");
  assert.ok(radial(4 * CROSSOVER_RADIUS_ORDER) > 10 * stream, "the field owns a cell outright");
});

test("grip ramps, drains as amplitude squared, and recovers when released", () => {
  const w = newWave(PITCH, 2e5);

  grip(w, true, 0.05);
  assert.ok(w.amplitude > 0 && w.amplitude < w.maxAmplitude, "it ramps rather than steps");

  // drain at half amplitude must be a quarter of the drain at full
  const at = (frac: number): number => {
    const t = newWave(PITCH, 2e5);
    t.amplitude = t.maxAmplitude * frac;
    const s0 = t.stamina;
    grip(t, true, 0.001);
    return s0 - t.stamina;
  };
  assert.ok(Math.abs(at(0.5) / at(1) - 0.25) < 0.02, "drain goes as amplitude squared");

  const idle = newWave(PITCH, 2e5);
  idle.stamina = 10;
  grip(idle, false, 1);
  assert.ok(idle.stamina > 10, "released, it recovers");
  assert.ok(idle.stamina <= STAMINA_MAX);
});

test("running out latches, and the latch holds until a quarter is back", () => {
  const w = newWave(PITCH, 2e5);
  for (let i = 0; i < 2000 && !w.spent; i++) grip(w, true, 0.01);
  assert.ok(w.spent, "holding forever must exhaust it");
  assert.equal(w.stamina, 0);

  // Refused while spent — but the drive DECAYS to zero at the amplifier's
  // ramp-down rate rather than snapping there, because an amplifier does. So
  // the assertion is that it only ever falls, and arrives.
  let prev = w.amplitude;
  for (let i = 0; i < 100 && w.amplitude > 0; i++) {
    grip(w, true, 0.01);
    assert.ok(w.amplitude <= prev, "a spent drive must never rise");
    prev = w.amplitude;
  }
  assert.equal(w.amplitude, 0, "and it must reach zero while still asked for");

  // and it stays refused until stamina is back over a quarter — a cooldown,
  // not a flicker to fight
  while (w.stamina <= STAMINA_MAX * 0.25) {
    grip(w, true, 0.01);
    assert.equal(w.amplitude, 0);
  }
  grip(w, true, 0.05);
  assert.ok(w.amplitude > 0, "past a quarter it answers again");
});
