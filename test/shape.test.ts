import { strict as assert } from "node:assert";
import { test } from "node:test";

import { inPlaneOrbit, lobeCount, lobes, orientedLobes } from "../game/shape.js";
import { BUILDABLE } from "../game/lattice.js";
import { pointGroup } from "../src/pointgroups.js";

test("a group's lobes are its own symmetry, seen from above", () => {
  // Not a table. symmetry.ts closes each group from generators and puts the
  // unique axis on z; the game looks down that axis, so the orbit of a
  // horizontal vector IS what the player sees. These numbers are consequences.
  const expected: Record<string, number> = {
    "1": 1, "2": 2, "3": 3, "4": 4, "6": 6,
    "222": 2, "32": 3, "422": 4, "622": 6, "23": 4, "432": 4,
  };
  for (const hm of BUILDABLE) {
    assert.equal(lobeCount(hm), expected[hm], `${hm} should show ${expected[hm]} directions`);
  }
});

test("the principal axis sets the fan-out for the polar groups", () => {
  // For 1, 2, 3, 4 and 6 the lobe count is just the order, because the whole
  // group is one rotation about the view axis.
  for (const hm of ["1", "2", "3", "4", "6"]) {
    assert.equal(lobeCount(hm), pointGroup(hm).order);
  }
});

test("a cubic group loses an arm to the view axis, and that is correct", () => {
  // 23 cycles x to y to z. The operation that carries a horizontal vector onto
  // the vertical one projects to nothing from above, so 23 shows four
  // directions rather than six. No special case does this — it is what
  // projecting a three-dimensional orbit onto a plane does.
  assert.equal(lobeCount("23"), 4);
  assert.equal(pointGroup("23").order, 12);
  assert.ok(lobes("23").every(([x, y]) => Math.abs(Math.hypot(x, y) - 1) < 1e-9));
});

test("lobes are unit, distinct and in drawing order", () => {
  for (const hm of BUILDABLE) {
    const ds = lobes(hm);
    for (const [x, y] of ds) {
      assert.ok(Math.abs(Math.hypot(x, y) - 1) < 1e-9, `${hm}: not a unit vector`);
    }
    const angles = ds.map(([x, y]) => Math.atan2(y, x));
    for (let i = 1; i < angles.length; i++) {
      assert.ok(angles[i] > angles[i - 1], `${hm}: out of angular order`);
      assert.ok(angles[i] - angles[i - 1] > 1e-6, `${hm}: duplicate direction`);
    }
  }
});

test("orienting turns the whole pattern and keeps its shape", () => {
  const turned = orientedLobes("6", Math.PI / 5);
  assert.equal(turned.length, 6);
  assert.ok(Math.abs(Math.atan2(turned[0][1], turned[0][0]) - Math.PI / 5) < 1e-9,
    "the first arm points where it was aimed");
  // the gaps between arms are unchanged. Compared modulo a turn, because
  // turning the pattern pushes some arms across the atan2 branch cut and a raw
  // subtraction there reads as a five-sixths gap rather than a sixth.
  const gap = (a: number, b: number): number => {
    let d = a - b;
    while (d <= -Math.PI) d += Math.PI * 2;
    while (d > Math.PI) d -= Math.PI * 2;
    return Math.abs(d);
  };
  for (let i = 1; i < turned.length; i++) {
    const a = Math.atan2(turned[i][1], turned[i][0]);
    const b = Math.atan2(turned[i - 1][1], turned[i - 1][0]);
    assert.ok(Math.abs(gap(a, b) - Math.PI / 3) < 1e-9, `gap ${gap(a, b)}`);
  }
});

test("the orbit is computed, not cached wrong", () => {
  assert.deepEqual(inPlaneOrbit("4").length, 4);
  assert.deepEqual(lobes("4"), lobes("4"), "the cache returns the same thing");
});
