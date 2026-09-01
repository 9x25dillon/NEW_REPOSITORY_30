import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  CHANNEL_HEIGHT, MAX_MODE,
  heightOf, modeFor, modeFrequency, planeGap, planes, reseat, retuneLayers, together,
} from "../game/depth.js";
import { bawResonance } from "../src/fields.js";
import { WATER } from "../src/gorkov.js";

// ── the dimension is an integer ─────────────────────────────────────────────

test("mode n puts exactly n planes in the fluid, and none on a wall", () => {
  // Hard walls are pressure ANTINODES, so a resonance needs a whole number of
  // half wavelengths across the channel and the nodes fall strictly between
  // them. The third dimension of this game is that integer; it is not a level
  // designer's choice about how many floors to have.
  for (let n = 1; n <= MAX_MODE; n++) {
    const p = planes(n);
    assert.equal(p.length, n);
    for (const z of p) {
      assert.ok(z > 0 && z < CHANNEL_HEIGHT, "nothing stands on a wall");
    }
    // evenly spaced, the outermost half a spacing in
    assert.ok(Math.abs(p[0] - CHANNEL_HEIGHT / (2 * n)) < 1e-12);
    for (let i = 1; i < n; i++) {
      assert.ok(Math.abs((p[i] - p[i - 1]) - planeGap(n)) < 1e-12);
    }
  }
});

test("the fundamental focuses to the centre, which is why it is flat", () => {
  const [only] = planes(1);
  assert.equal(planes(1).length, 1);
  assert.ok(Math.abs(only - CHANNEL_HEIGHT / 2) < 1e-12,
    "with antinodes pinned at both walls the one node has nowhere else to be");
});

test("the frequency of a mode is the channel's geometry, not a setting", () => {
  for (let n = 1; n <= MAX_MODE; n++) {
    assert.equal(
      modeFrequency(n, WATER),
      bawResonance({ width: CHANNEL_HEIGHT, medium: WATER, mode: n }),
      "it is fields.bawResonance and nothing else",
    );
  }
  // f_n = n c / 2h, so the harmonics are 3.7, 7.5, 11.2 MHz in water — the band
  // the rest of this repository works in.
  assert.ok(Math.abs(modeFrequency(1, WATER) - 3.74e6) < 0.05e6);
  assert.ok(Math.abs(modeFrequency(2, WATER) - 2 * modeFrequency(1, WATER)) < 1);
});

// ── and moving in it moves everything ───────────────────────────────────────

test("a body does not choose its height: the nearest node takes it", () => {
  assert.equal(reseat(CHANNEL_HEIGHT * 0.1, 1), 0, "one plane takes everything");
  assert.equal(reseat(CHANNEL_HEIGHT * 0.1, 2), 0);
  assert.equal(reseat(CHANNEL_HEIGHT * 0.9, 2), 1);
  assert.equal(reseat(heightOf(1, 3), 3), 1, "already on a plane, it stays");
});

test("retuning moves every plane, which is what makes it a decision", () => {
  // There is no swimming up. A trapped body sits on a node, so the only way to
  // another height is to put the node somewhere else — and that moves the whole
  // fluid at once, not just you.
  const up = retuneLayers(2, 3);
  assert.equal(up.length, 2, "two layers were in the water");
  assert.deepEqual(up, [0, 2], "and the third harmonic pushes them apart");

  const down = retuneLayers(3, 2);
  assert.deepEqual(down, [0, 0, 1],
    "stepping down MERGES planes — two things that were apart now share one");
});

test("things on different planes are not in the same water at all", () => {
  assert.ok(together(1, 1));
  assert.ok(!together(0, 1), "tens of microns apart in z cannot touch");
  assert.ok(planeGap(3) > 60e-6, "and it really is tens of microns");
});

// ── depth arrives the way everything else here does ─────────────────────────

test("the first water is flat, and a sovereign's body deepens the next", () => {
  assert.equal(modeFor(0, 1), 1, "the first water is driven at its fundamental");
  assert.equal(modeFor(40, 1), 1, "whatever else is true of it");

  assert.ok(modeFor(30, 4) > modeFor(4, 2), "a richer king leaves a deeper channel");
  for (const mass of [0, 8, 20, 60, 200]) {
    for (const aeon of [1, 3, 9, 30]) {
      const m = modeFor(mass, aeon);
      assert.ok(m >= 1 && m <= MAX_MODE, `mode ${m} is off the end of the channel`);
      assert.equal(m, Math.round(m));
    }
  }
});
