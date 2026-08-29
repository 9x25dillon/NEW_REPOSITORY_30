import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  bandGaps, bandsAt, besselJ1, blochWavenumber, brillouinPath, completeGap,
  fourierCoefficient, impedance, layeredTrace, reciprocalVectors,
  type Crystal2D, type Layer,
} from "../src/bands.js";

const near = (a: number, b: number, eps: number, what = "") =>
  assert.ok(Math.abs(a - b) < eps, `${what} ${a} !~ ${b} (d=${Math.abs(a - b)})`);

const WATERISH = { rho: 1000, c: 1500 };

// ── Bessel ──────────────────────────────────────────────────────────────────

test("J1 matches published values and its first zero", () => {
  near(besselJ1(0), 0, 1e-15);
  near(besselJ1(1), 0.4400505857, 1e-7);
  near(besselJ1(2), 0.5767248078, 1e-7);
  near(besselJ1(5), -0.3275791376, 1e-7);
  near(besselJ1(3.8317059702), 0, 1e-7, "first zero");
  near(besselJ1(-2), -besselJ1(2), 1e-15, "odd function");
  // the small-argument limit 2 J1(x)/x -> 1 is what the disc transform needs
  near((2 * besselJ1(1e-4)) / 1e-4, 1, 1e-8);
});

// ── 1-D, where the answer is exact ──────────────────────────────────────────

test("a uniform stack has linear dispersion and no gaps at all", () => {
  const l: Layer = { d: 0.5e-3, rho: 1000, c: 1500 };
  const stack: [Layer, Layer] = [l, { ...l }];
  // the trace collapses to cos(k*Lambda) whatever the frequency
  for (const w of [1e5, 1e6, 5e6, 2e7]) {
    near(layeredTrace(stack[0], stack[1], w), Math.cos((w / 1500) * 1e-3), 1e-12, `w=${w}`);
  }
  // K = omega/c only BELOW the first zone edge. The first version of this test
  // checked 5e6 rad/s, where omega/c is 3333 rad/m against a boundary at
  // pi/Lambda = 3142, and read the correct folded answer as an error.
  const edge = (Math.PI / 1e-3) * 1500; // omega at the zone boundary
  for (const w of [1e5, 1e6, 4e6]) {
    assert.ok(w < edge, `${w} must be inside the first zone for this check`);
    near(blochWavenumber(stack[0], stack[1], w)!, w / 1500, 1e-6, `K at w=${w}`);
  }
  // and above it, the reduced wavenumber is the reflection about the boundary
  const above = 5e6;
  assert.ok(above > edge);
  near(blochWavenumber(stack[0], stack[1], above)!,
       (2 * Math.PI) / 1e-3 - above / 1500, 1e-6, "folded back into the zone");
  assert.deepEqual(bandGaps(stack[0], stack[1], 2e7), []);
});

test("matched impedance gives no gap however strong the velocity contrast", () => {
  // Z = rho*c equal, c differing by 3x. The mismatch factor becomes exactly 1
  // and the trace collapses — which is why an acoustic mirror is designed on
  // impedance ratio and not on material contrast in the loose sense.
  const a: Layer = { d: 0.4e-3, rho: 3000, c: 500 };
  const b: Layer = { d: 0.6e-3, rho: 1000, c: 1500 };
  near(impedance(a), impedance(b), 1e-9, "impedances must match for this test");
  assert.deepEqual(bandGaps(a, b, 3e7), []);
});

test("mismatched impedance opens gaps, and they are where Bragg says", () => {
  const a: Layer = { d: 0.5e-3, rho: 1000, c: 1500 };
  const b: Layer = { d: 0.5e-3, rho: 2700, c: 6400 }; // aluminium-like
  const gaps = bandGaps(a, b, 4e7);
  assert.ok(gaps.length >= 2, `expected several gaps, got ${gaps.length}`);
  for (const g of gaps) {
    assert.ok(g.hi > g.lo);
    assert.ok(g.relativeWidth > 0);
    // inside a gap there is no real Bloch wavenumber
    assert.equal(blochWavenumber(a, b, (g.lo + g.hi) / 2), null);
    // and just outside there is
    assert.notEqual(blochWavenumber(a, b, g.lo * 0.98), null);
  }
  // the first gap opens near the Bragg condition, where each layer is a
  // quarter wavelength: f = 1 / (2 * (dA/cA + dB/cB))
  const bragg = 1 / (2 * (a.d / a.c + b.d / b.c));
  near(gaps[0].centreHz / bragg, 1, 0.25, "first gap should sit near Bragg");
});

// ── 2-D, checked against a closed form ──────────────────────────────────────

test("the empty lattice reproduces omega = c |k+G| exactly", () => {
  // No contrast at all, so every off-diagonal Fourier coefficient vanishes and
  // the eigenproblem must return the folded free-medium bands. This validates
  // the whole assembly — reciprocal vectors, matrix build, Cholesky, Jacobi —
  // against a formula, with nothing to fit.
  const c = 1500;
  const a = 1e-3;
  const empty: Crystal2D = {
    a, geometry: "circle", fill: 0.4,
    inclusion: { rho: 1000, c }, matrix: { rho: 1000, c },
  };
  const g = (2 * Math.PI) / a;
  const w = bandsAt(empty, 0, 0, 2, 5);
  near(w[0], 0, 1e-6, "acoustic band at Gamma");
  for (let i = 1; i <= 4; i++) near(w[i], c * g, c * g * 1e-9, `folded band ${i}`);

  // and away from Gamma, at an arbitrary point
  const kx = 0.37 * g;
  const ky = 0.11 * g;
  const at = bandsAt(empty, kx, ky, 2, 3);
  const expected = [
    Math.hypot(kx, ky),
    Math.hypot(kx - g, ky),
    Math.hypot(kx, ky - g),
  ].sort((p, q) => p - q).map((m) => c * m);
  for (let i = 0; i < 3; i++) near(at[i], expected[i], expected[i] * 1e-9, `band ${i}`);
});

test("the Brillouin zone is a torus: omega(k + G) = omega(k)", () => {
  // A Bloch wavevector is defined only modulo a reciprocal lattice vector, so
  // the zone's opposite faces are identified and its parameter space is
  // S1 x S1. This is that periodicity, asserted rather than described.
  const crystal: Crystal2D = {
    a: 1e-3, geometry: "circle", fill: 0.35,
    inclusion: { rho: 2700, c: 6400 }, matrix: WATERISH,
  };
  const g = (2 * Math.PI) / crystal.a;
  const deviation = (order: number) => {
    const base = bandsAt(crystal, 0.3 * g, 0.2 * g, order, 4);
    let worst = 0;
    for (const [nx, ny] of [[1, 0], [0, 1], [-1, 0], [1, -1]]) {
      const shifted = bandsAt(crystal, 0.3 * g + nx * g, 0.2 * g + ny * g, order, 4);
      for (let b = 0; b < base.length; b++) {
        worst = Math.max(worst, Math.abs(shifted[b] - base[b]) / (base[b] || 1));
      }
    }
    return worst;
  };

  // The periodicity is EXACT for the untruncated problem and only approximate
  // once the basis is cut off, because a finite G-grid centred on the origin is
  // not itself translation-invariant in G. So the meaningful assertion is not a
  // fixed tolerance — it is that the deviation shrinks as the basis grows,
  // which is what distinguishes a truncation artefact from a broken symmetry.
  const coarse = deviation(2);
  const fine = deviation(5);
  assert.ok(coarse < 1e-2, `even a coarse basis should nearly close: ${coarse}`);
  assert.ok(fine < coarse / 3, `periodicity must improve with order: ${coarse} -> ${fine}`);
});

test("the plane-wave expansion agrees with the exact 1-D transfer matrix", () => {
  // Two methods with nothing in common. A stripe crystal is periodic in x and
  // uniform in y, so along Gamma-X it IS a layered stack, and the exact trace
  // relation must reproduce what the eigensolver computes.
  const a = 1e-3;
  const f = 0.5;
  const inc = { rho: 1200, c: 2400 };
  const mat = { rho: 1000, c: 1500 };
  const A: Layer = { d: f * a, rho: inc.rho, c: inc.c };
  const B: Layer = { d: (1 - f) * a, rho: mat.rho, c: mat.c };
  const crystal: Crystal2D = { a, geometry: "stripe", fill: f, inclusion: inc, matrix: mat };

  const exactOmega = (K: number): number => {
    const target = Math.cos(K * a);
    const hi = 2e7;
    const N = 200000;
    let prev = layeredTrace(A, B, hi / N) - target;
    for (let i = 2; i <= N; i++) {
      const w = (hi * i) / N;
      const cur = layeredTrace(A, B, w) - target;
      if ((prev <= 0 && cur > 0) || (prev >= 0 && cur < 0)) {
        let lo = w - hi / N;
        let up = w;
        for (let k = 0; k < 80; k++) {
          const m = (lo + up) / 2;
          if (Math.sign(layeredTrace(A, B, m) - target)
              === Math.sign(layeredTrace(A, B, lo) - target)) lo = m; else up = m;
        }
        return (lo + up) / 2;
      }
      prev = cur;
    }
    throw new Error("no root");
  };

  for (const frac of [0.2, 0.5, 0.8, 1.0]) {
    const K = (frac * Math.PI) / a;
    const exact = exactOmega(K);
    const pwe = bandsAt(crystal, K, 0, 8, 1)[0];
    const rel = (pwe - exact) / exact;
    assert.ok(Math.abs(rel) < 1e-3, `K=${frac}pi/a: PWE ${pwe} vs exact ${exact} (${rel})`);
    // A truncated basis is a restricted trial space, so the expansion is
    // variational and every computed frequency is an UPPER bound.
    assert.ok(rel > -1e-9, `K=${frac}pi/a: PWE fell below the exact value`);
  }
});

test("raising the truncation order lowers the bands toward the true answer", () => {
  const crystal: Crystal2D = {
    a: 1e-3, geometry: "stripe", fill: 0.5,
    inclusion: { rho: 1200, c: 2400 }, matrix: WATERISH,
  };
  const k = Math.PI / crystal.a;
  let prev = Infinity;
  for (const order of [2, 4, 6, 8]) {
    const w = bandsAt(crystal, k, 0, order, 1)[0];
    assert.ok(w <= prev + 1e-6, `order ${order} rose above order ${order - 2}`);
    prev = w;
  }
});

// ── Plumbing ────────────────────────────────────────────────────────────────

test("the reciprocal lattice and the zone path are what they claim", () => {
  const a = 1e-3;
  assert.equal(reciprocalVectors(a, 3).length, 49);
  assert.equal(reciprocalVectors(a, 1).length, 9);
  const path = brillouinPath(a, 10);
  assert.equal(path[0].label, "Gamma");
  assert.equal(path[path.length - 1].label, "Gamma");
  assert.ok(path.some((p) => p.label === "X"));
  assert.ok(path.some((p) => p.label === "M"));
  for (let i = 1; i < path.length; i++) assert.ok(path[i].s >= path[i - 1].s);
});

test("Fourier coefficients: the DC term is the volume average, both geometries", () => {
  for (const geometry of ["circle", "stripe"] as const) {
    const crystal: Crystal2D = {
      a: 1e-3, geometry, fill: 0.3,
      inclusion: { rho: 2000, c: 3000 }, matrix: WATERISH,
    };
    near(fourierCoefficient(crystal, 10, 20, 0, 0), 20 + (10 - 20) * 0.3, 1e-12, geometry);
    // no contrast, no harmonics
    near(fourierCoefficient(crystal, 7, 7, 6283, 0), 0, 1e-12, `${geometry} flat`);
  }
  // stripes are uniform in y, so anything with a y component is exactly zero
  const stripe: Crystal2D = {
    a: 1e-3, geometry: "stripe", fill: 0.3,
    inclusion: { rho: 2000, c: 3000 }, matrix: WATERISH,
  };
  assert.equal(fourierCoefficient(stripe, 10, 20, 0, 6283), 0);
});

test("a complete gap is reported only when the whole wedge agrees", () => {
  // Weak contrast cannot open a complete gap; the function must say so rather
  // than report the first spacing it finds along one path.
  const weak: Crystal2D = {
    a: 1e-3, geometry: "circle", fill: 0.3,
    inclusion: { rho: 1010, c: 1510 }, matrix: WATERISH,
  };
  assert.equal(completeGap(weak, 1, 2, 4), null);
});
