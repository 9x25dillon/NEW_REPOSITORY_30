import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  ASPECT_INTERVALS, BASE_HZ, CENTS_PER_DEGREE, beatHz, centsBetween, chord,
  droneHz, slowestBeat,
} from "../personal/tonal.js";
import {
  aspectCircle, cliffordPoint, embedDonut, pairRotation, separation, stereo3,
  wrap180, type Vec3,
} from "../personal/torus.js";

const near = (a: number, b: number, eps: number, what = "") =>
  assert.ok(Math.abs(a - b) < eps, `${what} ${a} !~ ${b} (d=${Math.abs(a - b)})`);

// ── The map, and the one claim it makes ─────────────────────────────────────

test("the bedrock map is one octave per half circle, exactly", () => {
  near(droneHz(0), BASE_HZ, 1e-12);
  near(droneHz(180), 2 * BASE_HZ, 1e-12, "half circle is an octave");
  near(droneHz(90), BASE_HZ * Math.SQRT2, 1e-12, "quarter circle is a tritone");
  near(CENTS_PER_DEGREE, 20 / 3, 1e-15, "exactly twenty thirds");
  // 360 wraps home rather than reaching two octaves
  near(droneHz(360), droneHz(0), 1e-12);
  near(droneHz(-90), droneHz(270), 1e-12);
});

test("every classical aspect is an exact multiple of 200 cents", () => {
  // The headline: under this map the major-aspect family IS the whole-tone
  // scale. A statement about the map, checkable, and checked.
  // Distance to the NEAREST multiple, not the remainder. `cents % 200` is the
  // obvious form and it is wrong: 399.99999999999994 is a hair below a multiple
  // of 200, so its remainder is 199.9999... rather than ~0, and the assertion
  // fails on arithmetic that is behaving perfectly. Testing "x % m is near 0"
  // only ever works when the float error happens to fall on the high side.
  const offWholeTone = (x: number) => Math.abs(x - 200 * Math.round(x / 200));
  for (const a of ASPECT_INTERVALS) {
    const cents = Math.abs(centsBetween(a.degrees, 0));
    near(cents, a.cents, 1e-9, `${a.name} (${a.degrees} deg)`);
    near(offWholeTone(cents), 0, 1e-9, `${a.name} must land on a whole tone`);
  }
  // and the claim is specific: something that is NOT an aspect misses
  assert.ok(offWholeTone(Math.abs(centsBetween(37, 0))) > 1,
    "an arbitrary separation should not land on a whole tone");

  // Articles are data because English decides them by sound, not spelling:
  // "unison" opens with a vowel LETTER and a consonant SOUND, so a first-letter
  // test writes "an unison" — which it did, on screen, before this existed.
  for (const a of ASPECT_INTERVALS) {
    assert.ok(a.article === "a" || a.article === "an", a.interval);
  }
  assert.equal(ASPECT_INTERVALS.find((a) => a.interval === "unison")!.article, "a");
  assert.equal(ASPECT_INTERVALS.find((a) => a.interval === "octave")!.article, "an");
  // spot-check the named intervals against their ratios
  near(centsBetween(60, 0), 400, 1e-9, "sextile is a major third");
  near(centsBetween(90, 0), 600, 1e-9, "square is a tritone");
  near(centsBetween(180, 0), 1200, 1e-9, "opposition is an octave");
});

test("a chord reads from the bottom up and beats to zero at a conjunction", () => {
  const voices = chord([
    { id: "Mars", longitude: 200 },
    { id: "Sun", longitude: 10 },
    { id: "Moon", longitude: 95 },
  ]);
  assert.deepEqual(voices.map((v) => v.id), ["Sun", "Moon", "Mars"]);
  for (let i = 1; i < voices.length; i++) assert.ok(voices[i].hz > voices[i - 1].hz);
  near(voices[0].centsAboveRoot, 0, 1e-12, "the lowest voice is the root");
  near(voices[1].centsAboveRoot, (95 - 10) * CENTS_PER_DEGREE, 1e-9);

  // two bodies in the same degree beat at zero — the audible unison
  near(beatHz(droneHz(47), droneHz(47)), 0, 1e-15);
  const pair = slowestBeat([
    { id: "a", longitude: 100 }, { id: "b", longitude: 100.01 }, { id: "c", longitude: 250 },
  ])!;
  assert.deepEqual([pair.a, pair.b].sort(), ["a", "b"]);
  assert.ok(pair.hz < 0.02, `the closest pair should beat slowly, got ${pair.hz}`);
  assert.equal(slowestBeat([{ id: "only", longitude: 0 }]), null);
});

test("the chord stays inside the audible range it declares", () => {
  for (let lon = 0; lon < 360; lon += 0.5) {
    const f = droneHz(lon);
    assert.ok(f >= 110 && f < 440, `${lon} deg gave ${f} Hz`);
  }
});

// ── The geometry ────────────────────────────────────────────────────────────

test("the Clifford point lies on the unit 3-sphere, both circles at 1/sqrt2", () => {
  for (const [t, p] of [[0, 0], [37, 111], [90, 270], [-45, 400]]) {
    const q = cliffordPoint(t, p);
    near(Math.hypot(q.x, q.y, q.z, q.w), 1, 1e-15, "on the sphere");
    near(Math.hypot(q.x, q.y), Math.SQRT1_2, 1e-15, "first circle");
    near(Math.hypot(q.z, q.w), Math.SQRT1_2, 1e-15, "second circle");
  }
});

/** Circumcentre of three points in space. */
function circumcentre(A: Vec3, B: Vec3, C: Vec3): Vec3 {
  const sub = (p: Vec3, q: Vec3): Vec3 => ({ x: p.x - q.x, y: p.y - q.y, z: p.z - q.z });
  const cross = (p: Vec3, q: Vec3): Vec3 => ({
    x: p.y * q.z - p.z * q.y, y: p.z * q.x - p.x * q.z, z: p.x * q.y - p.y * q.x,
  });
  const dot = (p: Vec3, q: Vec3) => p.x * q.x + p.y * q.y + p.z * q.z;
  const a = sub(A, C);
  const b = sub(B, C);
  const axb = cross(a, b);
  const n2 = dot(axb, axb);
  const scaled = {
    x: (dot(a, a) * b.x - dot(b, b) * a.x),
    y: (dot(a, a) * b.y - dot(b, b) * a.y),
    z: (dot(a, a) * b.z - dot(b, b) * a.z),
  };
  const num = cross(scaled, axb);
  return { x: C.x + num.x / (2 * n2), y: C.y + num.y / (2 * n2), z: C.z + num.z / (2 * n2) };
}

test("an aspect circle projects to a TRUE circle in space, not merely a loop", () => {
  // The Villarceau claim, and the reason the Clifford projection is worth
  // having at all. Take three points of the projected aspect circle, build the
  // circle through them, and every other point must lie on it exactly — which
  // a closed curve that merely looks round would fail.
  for (const target of [0, 60, 90, 120, 180, 137.5]) {
    const pts = aspectCircle(target, 96).map(([t, p]) => stereo3(cliffordPoint(t, p)));
    const centre = circumcentre(pts[0], pts[10], pts[30]);
    const r = Math.hypot(pts[0].x - centre.x, pts[0].y - centre.y, pts[0].z - centre.z);
    for (const q of pts) {
      const d = Math.hypot(q.x - centre.x, q.y - centre.y, q.z - centre.z);
      near(d, r, r * 1e-9, `aspect ${target} deg`);
    }
    assert.ok(r > 0.1 && Number.isFinite(r), `radius ${r} for aspect ${target}`);
  }
});

test("the first plane pair leaves the torus where it found it; the others do not", () => {
  const p = cliffordPoint(50, 200);
  const firstCircle = (q: typeof p) => Math.hypot(q.x, q.y);
  const secondCircle = (q: typeof p) => Math.hypot(q.z, q.w);

  // Turning both planes of the first pair at one rate just advances both
  // longitudes: the surface slides along its own aspect circles without tilting.
  const slid = pairRotation(p, "first", 63, 63);
  const shifted = cliffordPoint(50 + 63, 200 + 63);
  for (const k of ["x", "y", "z", "w"] as const) near(slid[k], shifted[k], 1e-12, k);
  near(firstCircle(slid), Math.SQRT1_2, 1e-15);
  near(secondCircle(slid), Math.SQRT1_2, 1e-15);

  // The other two mix the bodies' planes and leave that pose.
  for (const pair of ["second", "third"] as const) {
    const moved = pairRotation(p, pair, 63, 63);
    near(Math.hypot(moved.x, moved.y, moved.z, moved.w), 1, 1e-15, "still on the sphere");
    assert.ok(Math.abs(firstCircle(moved) - Math.SQRT1_2) > 1e-3, `${pair} should tilt it`);
  }
});

test("the projection stays finite even where the surface passes through the pole", () => {
  // The second and third pairs take the surface through w = 1, where the true
  // stereographic projection is infinite. Bounded, not NaN.
  for (const pair of ["first", "second", "third"] as const) {
    for (const alpha of [0, 45, 90, 135, 225]) {
      for (const [t, p] of [[0, 0], [90, 90], [237, 41]]) {
        const v = stereo3(pairRotation(cliffordPoint(t, p), pair, alpha, alpha));
        assert.ok(Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z),
          `${pair} at ${alpha} deg, point ${t},${p}`);
      }
    }
  }
});

test("the donut and the angle helpers behave", () => {
  const outer = embedDonut(0, 0);
  near(Math.hypot(outer.x, outer.y), 1.5 + 0.72, 1e-12, "outer equator");
  const inner = embedDonut(0, 180);
  near(Math.hypot(inner.x, inner.y), 1.5 - 0.72, 1e-12, "inner equator");
  near(embedDonut(0, 90).z, 0.72, 1e-12, "top of the tube");

  assert.equal(wrap180(180), 180);
  assert.equal(wrap180(-180), 180);
  assert.equal(wrap180(360), 0);
  near(separation(10, 350), 20, 1e-12, "separation crosses the seam");
  near(separation(0, 180), 180, 1e-12);
});
