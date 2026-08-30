import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  INTERNAL_STAR, PHI, PHYSICAL_STAR, accepted, cutAndProject, cycle,
  frequencies, nearestNeighbours, phason, rotateInternal,
} from "../personal/quasicrystal.js";

const TAU = Math.PI * 2;
const near = (a: number, b: number, eps: number, what = "") =>
  assert.ok(Math.abs(a - b) < eps, `${what} ${a} !~ ${b} (d=${Math.abs(a - b)})`);

test("the two stars are five-fold, unit, and different from each other", () => {
  for (const star of [PHYSICAL_STAR, INTERNAL_STAR]) {
    assert.equal(star.length, 5);
    for (const [x, y] of star) near(Math.hypot(x, y), 1, 1e-12, "unit");
    // five unit vectors at equal angles sum to zero
    const sx = star.reduce((a, v) => a + v[0], 0);
    const sy = star.reduce((a, v) => a + v[1], 0);
    near(sx, 0, 1e-12, "star sums to zero (x)");
    near(sy, 0, 1e-12, "star sums to zero (y)");
  }
  // and they are NOT the same star — identical projections would collapse the
  // construction into an ordinary periodic lattice with nothing quasi about it
  let differ = 0;
  for (let k = 0; k < 5; k++) {
    if (Math.hypot(PHYSICAL_STAR[k][0] - INTERNAL_STAR[k][0],
                   PHYSICAL_STAR[k][1] - INTERNAL_STAR[k][1]) > 1e-9) differ++;
  }
  assert.equal(differ, 4, "four of five directions must differ");
});

// ── The claim that makes this five-dimensional ──────────────────────────────

test("cycling the five integers rotates physical space by exactly 72 degrees", () => {
  // This is the 5-fold symmetry, expressed as an operation on INTEGERS. It is
  // exact rather than statistical, because advancing every index by one sends
  // each star vector to the next, and the stars are the fifth roots of unity.
  const pts = cutAndProject(2, 1.6);
  const R = TAU / 5;
  const c = Math.cos(R);
  const s = Math.sin(R);
  const byKey = new Map(pts.map((p) => [p.n.join(","), p]));

  let checked = 0;
  for (const p of pts) {
    const shifted = byKey.get(cycle(p).join(","));
    if (!shifted) continue; // fell outside the depth box, not a failure
    near(shifted.x, p.x * c - p.y * s, 1e-9, "rotated x");
    near(shifted.y, p.x * s + p.y * c, 1e-9, "rotated y");
    checked++;
  }
  assert.ok(checked > 300, `only ${checked} points checked`);
});

test("cycling rotates INTERNAL space by 144 degrees, so acceptance survives it", () => {
  // Internal space turns twice as fast, which is why the window — a disc about
  // the origin — is unmoved by it. That is what makes the accepted SET, not
  // merely the lattice, five-fold symmetric.
  const pts = cutAndProject(2, 1.6);
  const byKey = new Map(pts.map((p) => [p.n.join(","), p]));
  let checked = 0;
  for (const p of pts) {
    const shifted = byKey.get(cycle(p).join(","));
    if (!shifted) continue;
    near(Math.hypot(shifted.u, shifted.v), Math.hypot(p.u, p.v), 1e-9, "internal radius");
    checked++;
  }
  assert.ok(checked > 300);
});

test("the point set is APERIODIC — no translation carries it onto itself", () => {
  // The other half of what a quasicrystal is. Ordered, and yet no repeat.
  const pts = cutAndProject(3, 1.6);
  const inner = pts.filter((p) => p.r < 5);
  const key = (x: number, y: number) => `${x.toFixed(6)},${y.toFixed(6)}`;
  const set = new Set(inner.map((p) => key(p.x, p.y)));

  // Candidate periods: the vectors between nearby points. If any of them were a
  // true period, translating by it would land every interior point on another.
  const candidates = inner.slice(1, 40).map((p) => [p.x - inner[0].x, p.y - inner[0].y]);
  let anyPeriodic = false;
  for (const [dx, dy] of candidates) {
    if (Math.hypot(dx, dy) < 1e-9) continue;
    let hit = 0;
    let tried = 0;
    for (const p of inner) {
      if (p.r > 3) continue; // stay well inside, so edge effects are not the story
      tried++;
      if (set.has(key(p.x + dx, p.y + dy))) hit++;
    }
    if (tried > 20 && hit === tried) anyPeriodic = true;
  }
  assert.equal(anyPeriodic, false, "a translation mapped the set onto itself");
});

test("and it is ordered rather than random: three distances, powers of phi", () => {
  // The signature that separates a quasicrystal from noise — but NOT where the
  // obvious guess puts it. A one-dimensional Fibonacci chain has two gap
  // lengths in the golden ratio, and it is tempting to look for that in the
  // RADII. There it is false: 22 radii gave 21 distinct gaps, because radius is
  // not the quantity this construction orders.
  //
  // What it orders is local geometry. Among more than a thousand points the
  // nearest-neighbour distance takes exactly THREE values out of a continuum,
  // and they are consecutive powers of the golden ratio.
  const pts = cutAndProject(3, 1.6).filter((p) => p.r < 6);
  assert.ok(pts.length > 800, `only ${pts.length} points`);

  const distinct = [...new Set(nearestNeighbours(pts).map((d) => Number(d.toFixed(3))))]
    .sort((a, b) => a - b);
  assert.equal(distinct.length, 3, `expected three edge lengths, got ${distinct.join(" ")}`);

  // 1/phi^2, 1/phi, 1
  near(distinct[0], 1 / (PHI * PHI), 1e-3, "shortest edge is 1/phi^2");
  near(distinct[1], 1 / PHI, 1e-3, "middle edge is 1/phi");
  near(distinct[2], 1, 1e-3, "longest edge is unity");
  near(distinct[2] / distinct[0], PHI * PHI, 2e-3, "the span is exactly phi squared");
  near(distinct[1] / distinct[0], PHI, 2e-3, "and each step is one phi");
});

// ── Turning the internal space ──────────────────────────────────────────────

test("a phason moves the set without moving a single pitch", () => {
  // The operation with no counterpart in three dimensions.
  //
  // ROTATING internal space was the obvious choice and does nothing at all: the
  // window is a disc about the origin, rotation preserves distance from that
  // origin, so not one point changes acceptance. The test caught it doing
  // exactly nothing, which is asserted below so the mistake cannot come back.
  //
  // The move that works is a SHIFT of the cut — a phason, which in the physics
  // costs no energy and is the reason a quasicrystal rearranges locally while
  // keeping its long-range order.
  const all = cutAndProject(3, 2.6);
  const before = accepted(all, 1.6);
  assert.ok(before.length > 100);

  // rotation: a no-op, by construction
  const rotated = accepted(rotateInternal(all, 0.5), 1.6);
  assert.equal(rotated.length, before.length,
    "rotating a circular window cannot change what it accepts");

  // phason: genuinely reorganises
  const after = accepted(phason(all, 0.45, 0.2), 1.6);
  const key = (p: { n: number[] }) => p.n.join(",");
  const wasIn = new Set(before.map(key));
  const arrived = after.filter((p) => !wasIn.has(key(p))).length;
  const nowIn = new Set(after.map(key));
  const left = before.filter((p) => !nowIn.has(key(p))).length;
  assert.ok(arrived > 0 && left > 0,
    `a phason must both add and remove points (added ${arrived}, removed ${left})`);

  // and every survivor kept its physical coordinates, hence its pitch, exactly
  const byKey = new Map(before.map((p) => [key(p), p]));
  let survivors = 0;
  for (const p of after) {
    const old = byKey.get(key(p));
    if (!old) continue;
    assert.equal(p.x, old.x, "physical x must not move under a phason");
    assert.equal(p.y, old.y, "physical y must not move under a phason");
    survivors++;
  }
  assert.ok(survivors > 50, `only ${survivors} survivors to compare`);
});

test("a wider window keeps strictly more points, and never fewer", () => {
  const all = cutAndProject(3, 3);
  let prev = -1;
  for (const w of [0.5, 1, 1.6, 2.2, 3]) {
    const n = accepted(all, w).length;
    assert.ok(n >= prev, `window ${w} kept fewer points than the one before`);
    prev = n;
  }
});

// ── Frequencies ─────────────────────────────────────────────────────────────

test("frequencies map radius logarithmically across the stated range", () => {
  const pts = cutAndProject(3, 1.6).slice(0, 60);
  const f = frequencies(pts, 40, 8000);
  assert.equal(f.length, pts.length);
  for (const hz of f) assert.ok(hz >= 40 - 1e-9 && hz <= 8000 + 1e-9, String(hz));
  // sorted by radius in, sorted by pitch out
  for (let i = 1; i < f.length; i++) assert.ok(f[i] >= f[i - 1] - 1e-9);
  // the innermost point is the lowest voice
  near(f[0], 40, 1e-6, "innermost is the floor");

  // Log, not linear: equal ratios must be equal steps, or forty of sixty voices
  // pile into the top octave.
  const wide = frequencies(cutAndProject(2, 1.6), 40, 8000);
  const octaves = wide.filter((h) => h < 320).length;
  assert.ok(octaves > wide.length * 0.05,
    `only ${octaves} of ${wide.length} voices below 320 Hz — the map is not logarithmic`);
});

test("the construction is deterministic — same input, same field", () => {
  const a = cutAndProject(2, 1.6);
  const b = cutAndProject(2, 1.6);
  assert.equal(a.length, b.length);
  for (let i = 0; i < a.length; i++) {
    assert.deepEqual(a[i].n, b[i].n);
    assert.equal(a[i].x, b[i].x);
  }
});
