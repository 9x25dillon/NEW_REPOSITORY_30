// bands.ts — dispersion in a periodic medium, and the torus it lives on.
//
// A phononic crystal is an elastic medium periodic in space, and the useful
// fact about one is that some frequency ranges have no propagating solution at
// all. Those are BAND GAPS, and they are what an acoustic mirror, a confined
// resonator, or a leakage-free channel wall is made of. For an acoustofluidic
// device the practical question is whether the structure around the channel can
// be made to reflect at the drive frequency instead of radiating away.
//
// THE BRILLOUIN ZONE IS A TORUS, and that is the honest connection to the
// geometry engine this repository grew out of. A Bloch wavevector is only
// defined modulo a reciprocal lattice vector, so the zone's opposite faces are
// identified and the parameter space of a 2-D crystal is S1 x S1 — the same T2
// the old engine embedded, for entirely unrelated reasons. omega(k + G) =
// omega(k) is not an approximation or an analogy; it is the periodicity that
// makes the zone a torus, and it is asserted as a test.
//
// TWO METHODS, AND THEY CHECK EACH OTHER. The 1-D layered stack has an exact
// closed-form dispersion relation via transfer matrices. The 2-D plane-wave
// expansion is a numerical eigenproblem. Given a 2-D crystal made of stripes —
// periodic in x, uniform in y — the two must agree along the Gamma-X direction,
// and the test suite asserts they do. That is the same discipline as the
// trajectory integrator being refereed by its closed form: a numerical method
// checked against a finer copy of itself only proves self-consistency.
//
// SCOPE. Scalar (fluid-like) waves, and centrosymmetric unit cells so the
// Fourier coefficients are real and the eigenproblem stays real symmetric. Full
// vector elasticity in a solid needs the rank-4 stiffness tensor from
// neumann.ts contracted into a 3x3 block problem with complex coefficients;
// that is a real extension, not a refinement, and it is not here.

import { generalizedSymmetricEigen, zeros, type Matrix } from "./linalg.js";

export interface Layer {
  /** Thickness, m. */
  d: number;
  /** Density, kg/m^3. */
  rho: number;
  /** Speed of sound, m/s. */
  c: number;
}

/** Acoustic impedance, kg/(m^2 s) — the quantity a reflection actually sees. */
export function impedance(l: Layer): number {
  return l.rho * l.c;
}

// ---------------------------------------------------------------------------
// 1-D: the exact answer
// ---------------------------------------------------------------------------

/**
 * The right-hand side of the layered dispersion relation, cos(K*Lambda) = f(w).
 *
 *   f = cos(kA dA) cos(kB dB) - (1/2)(ZA/ZB + ZB/ZA) sin(kA dA) sin(kB dB)
 *
 * Exact for a binary stack — it is the trace of the transfer matrix over one
 * period, so no truncation and no discretisation enter. Where |f| <= 1 there is
 * a real Bloch wavenumber and the wave propagates; where |f| > 1 there is not,
 * and that is a band gap.
 *
 * The impedance term is the whole physics. Set ZA = ZB and it collapses to
 * cos(k*Lambda) whatever the sound speeds are, so a stack with matched
 * impedances has no gaps at all however strong its velocity contrast — which is
 * why an acoustic mirror is designed on impedance ratio and not on material
 * contrast in the loose sense.
 */
export function layeredTrace(a: Layer, b: Layer, omega: number): number {
  const ka = omega / a.c;
  const kb = omega / b.c;
  const za = impedance(a);
  const zb = impedance(b);
  const mismatch = 0.5 * (za / zb + zb / za);
  return Math.cos(ka * a.d) * Math.cos(kb * b.d)
    - mismatch * Math.sin(ka * a.d) * Math.sin(kb * b.d);
}

/**
 * Bloch wavenumber at a frequency, rad/m — or null inside a band gap, where no
 * real solution exists and the wave decays instead of propagating.
 *
 * REDUCED to the first Brillouin zone, [0, pi/Lambda]. That is the standard
 * convention and it is not a detail: a Bloch wavenumber is only defined modulo
 * 2*pi/Lambda, so above the zone boundary this returns the folded value and NOT
 * omega/c. In a uniform medium at omega = 5e6 rad/s with Lambda = 1 mm the
 * unfolded answer would be 3333 rad/m and this correctly returns 2950, its
 * reflection about the boundary at pi/Lambda. Compare against omega/c only
 * below the first zone edge.
 */
export function blochWavenumber(a: Layer, b: Layer, omega: number): number | null {
  const f = layeredTrace(a, b, omega);
  if (Math.abs(f) > 1) return null;
  return Math.acos(f) / (a.d + b.d);
}

export interface BandGap {
  /** Angular frequency bounds of the gap, rad/s. */
  lo: number;
  hi: number;
  /** Midgap frequency in Hz, the number a device is designed around. */
  centreHz: number;
  /** Gap width over midgap — the figure of merit; above ~0.1 is a strong gap. */
  relativeWidth: number;
}

/**
 * Every band gap below a cutoff, found by scanning |trace| across 1.
 *
 * A scan rather than a root-find because the gaps are what is wanted, not the
 * band edges to high precision: `samples` sets the resolution and a gap
 * narrower than one step is missed. The default resolves anything worth
 * fabricating. Edges are refined by bisection once bracketed, so the reported
 * bounds are much sharper than the scan spacing.
 */
export function bandGaps(
  a: Layer, b: Layer, omegaMax: number, samples = 4000,
): BandGap[] {
  const inGap = (w: number) => Math.abs(layeredTrace(a, b, w)) > 1;
  const step = omegaMax / samples;
  const edge = (lo: number, hi: number, target: boolean) => {
    let l = lo;
    let h = hi;
    for (let i = 0; i < 60; i++) {
      const m = (l + h) / 2;
      if (inGap(m) === target) h = m; else l = m;
    }
    return (l + h) / 2;
  };

  const gaps: BandGap[] = [];
  let openedAt: number | null = null;
  let prev = inGap(step);
  for (let i = 2; i <= samples; i++) {
    const w = i * step;
    const now = inGap(w);
    if (now && !prev) openedAt = edge(w - step, w, true);
    if (!now && prev && openedAt !== null) {
      const hi = edge(w - step, w, false);
      const centre = (openedAt + hi) / 2;
      gaps.push({
        lo: openedAt, hi,
        centreHz: centre / (2 * Math.PI),
        relativeWidth: (hi - openedAt) / centre,
      });
      openedAt = null;
    }
    prev = now;
  }
  return gaps;
}

// ---------------------------------------------------------------------------
// Bessel J1, for the disc
// ---------------------------------------------------------------------------

/**
 * First-order Bessel function of the first kind.
 *
 * Abramowitz and Stegun 9.4.4 and 9.4.6, the standard rational approximations,
 * accurate to about 1.3e-8 below x = 3 and 1e-7 above. Present because the
 * Fourier transform of a disc is 2 J1(GR)/(GR) and there is no way around it.
 * A truncated series would be shorter and would quietly lose accuracy exactly
 * where the high-G coefficients matter.
 */
export function besselJ1(x: number): number {
  const ax = Math.abs(x);
  let y: number;
  if (ax < 3) {
    const t = x / 3;
    const t2 = t * t;
    y = x * (0.5 - 0.56249985 * t2 + 0.21093573 * t2 ** 2 - 0.03954289 * t2 ** 3
      + 0.00443319 * t2 ** 4 - 0.00031761 * t2 ** 5 + 0.00001109 * t2 ** 6);
    return y;
  }
  const t = 3 / ax;
  const f1 = 0.79788456 + 0.00000156 * t + 0.01659667 * t ** 2 + 0.00017105 * t ** 3
    - 0.00249511 * t ** 4 + 0.00113653 * t ** 5 - 0.00020033 * t ** 6;
  const th = ax - 2.35619449 + 0.12499612 * t + 0.0000565 * t ** 2 - 0.00637879 * t ** 3
    + 0.00074348 * t ** 4 + 0.00079824 * t ** 5 - 0.00029166 * t ** 6;
  y = (f1 * Math.cos(th)) / Math.sqrt(ax);
  return x < 0 ? -y : y;
}

// ---------------------------------------------------------------------------
// 2-D: the plane-wave expansion
// ---------------------------------------------------------------------------

export type Geometry = "circle" | "stripe";

export interface Crystal2D {
  /** Square lattice constant, m. */
  a: number;
  geometry: Geometry;
  /** Area fraction occupied by the inclusion, 0..1. */
  fill: number;
  inclusion: { rho: number; c: number };
  matrix: { rho: number; c: number };
}

/** Reciprocal lattice vectors out to |n|,|m| <= order. */
export function reciprocalVectors(a: number, order: number): Array<[number, number]> {
  const g = (2 * Math.PI) / a;
  const out: Array<[number, number]> = [];
  for (let n = -order; n <= order; n++) {
    for (let m = -order; m <= order; m++) out.push([n * g, m * g]);
  }
  return out;
}

/**
 * The Fourier coefficient of a two-valued periodic function at a lattice vector.
 *
 * Both geometries are centrosymmetric about the cell origin, so every
 * coefficient is REAL and the eigenproblem below stays real symmetric — which
 * is the entire reason linalg.ts needs no complex arithmetic. Move the
 * inclusion off centre and this returns the wrong thing silently, so it does
 * not take an offset to be moved by.
 */
export function fourierCoefficient(
  crystal: Crystal2D, inner: number, outer: number, gx: number, gy: number,
): number {
  const f = crystal.fill;
  const delta = inner - outer;
  const gMag = Math.hypot(gx, gy);
  if (gMag < 1e-12) return outer + delta * f;

  if (crystal.geometry === "circle") {
    const R = Math.sqrt((f * crystal.a * crystal.a) / Math.PI);
    const u = gMag * R;
    return delta * f * ((2 * besselJ1(u)) / u);
  }
  // stripes: periodic in x, uniform in y, so anything with a y component is flat
  if (Math.abs(gy) > 1e-12) return 0;
  const n = (gx * crystal.a) / (2 * Math.PI);
  const u = Math.PI * n * f;
  return delta * f * (Math.sin(u) / u);
}

/**
 * Angular frequencies of the lowest bands at one Bloch wavevector, rad/s.
 *
 * The scalar wave equation div((1/rho) grad p) = -w^2 kappa p, expanded in
 * plane waves, gives the generalised symmetric problem
 *
 *     sum_G' eta_{G-G'} (k+G).(k+G') p_G'  =  w^2 sum_G' kappa_{G-G'} p_G'
 *
 * where eta is the Fourier series of 1/rho and kappa that of 1/(rho c^2). Both
 * matrices are real symmetric for a centrosymmetric cell, and the right-hand
 * one is positive definite, so linalg's Cholesky reduction applies directly.
 *
 * `order` sets the truncation: (2*order+1)^2 plane waves. Convergence is from
 * ABOVE and is slow for high contrast — a truncated basis is a restricted trial
 * space, so every computed frequency is an upper bound on the true one. Check
 * convergence by raising the order until the bands stop moving, rather than by
 * trusting a default.
 */
export function bandsAt(
  crystal: Crystal2D, kx: number, ky: number, order = 3, count = 6,
): number[] {
  const Gs = reciprocalVectors(crystal.a, order);
  const n = Gs.length;

  const etaIn = 1 / crystal.inclusion.rho;
  const etaOut = 1 / crystal.matrix.rho;
  const kapIn = 1 / (crystal.inclusion.rho * crystal.inclusion.c ** 2);
  const kapOut = 1 / (crystal.matrix.rho * crystal.matrix.c ** 2);

  const A: Matrix = zeros(n);
  const B: Matrix = zeros(n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const dx = Gs[i][0] - Gs[j][0];
      const dy = Gs[i][1] - Gs[j][1];
      const dot = (kx + Gs[i][0]) * (kx + Gs[j][0]) + (ky + Gs[i][1]) * (ky + Gs[j][1]);
      A[i][j] = fourierCoefficient(crystal, etaIn, etaOut, dx, dy) * dot;
      B[i][j] = fourierCoefficient(crystal, kapIn, kapOut, dx, dy);
    }
  }

  const { values } = generalizedSymmetricEigen(A, B);
  // w^2 can come out very slightly negative at Gamma for the acoustic band,
  // where the true value is exactly zero; clamping is correct rather than a
  // fudge, since a negative eigenvalue there is float noise about a known zero.
  return values.slice(0, count).map((v) => Math.sqrt(Math.max(v, 0)));
}

export interface PathPoint {
  kx: number;
  ky: number;
  /** Cumulative distance along the path, for plotting. */
  s: number;
  label?: string;
}

/**
 * The conventional Gamma - X - M - Gamma circuit of a square lattice's zone.
 *
 * Band extrema of a square lattice lie on the zone boundary, so this circuit is
 * where a gap will show itself if there is one — but a gap seen only along this
 * path is a claim about the path, not about the crystal. A complete gap has to
 * survive a sweep of the whole zone, which is what fullZoneSweep is for.
 */
export function brillouinPath(a: number, perSegment = 20): PathPoint[] {
  const g = Math.PI / a;
  const corners: Array<[number, number, string]> = [
    [0, 0, "Gamma"], [g, 0, "X"], [g, g, "M"], [0, 0, "Gamma"],
  ];
  const out: PathPoint[] = [];
  let s = 0;
  for (let seg = 0; seg < corners.length - 1; seg++) {
    const [x0, y0, l0] = corners[seg];
    const [x1, y1] = corners[seg + 1];
    const len = Math.hypot(x1 - x0, y1 - y0);
    for (let i = 0; i < perSegment; i++) {
      const t = i / perSegment;
      out.push({
        kx: x0 + (x1 - x0) * t, ky: y0 + (y1 - y0) * t,
        s: s + len * t, label: i === 0 ? l0 : undefined,
      });
    }
    s += len;
  }
  const last = corners[corners.length - 1];
  out.push({ kx: last[0], ky: last[1], s, label: last[2] });
  return out;
}

/**
 * A complete band gap: a frequency range no wavevector anywhere in the zone
 * reaches. Swept over the irreducible wedge of the square lattice rather than
 * the path, because a gap along Gamma-X-M-Gamma can be closed by a state in the
 * zone's interior and reporting it would be reporting an artefact.
 */
export function completeGap(
  crystal: Crystal2D, band: number, order = 3, samples = 12,
): { lo: number; hi: number } | null {
  const g = Math.PI / crystal.a;
  let maxLower = -Infinity;
  let minUpper = Infinity;
  for (let i = 0; i <= samples; i++) {
    for (let j = 0; j <= i; j++) { // irreducible wedge: 0 <= ky <= kx <= pi/a
      const w = bandsAt(crystal, (i / samples) * g, (j / samples) * g, order, band + 2);
      maxLower = Math.max(maxLower, w[band - 1]);
      minUpper = Math.min(minUpper, w[band]);
    }
  }
  return minUpper > maxLower ? { lo: maxLower, hi: minUpper } : null;
}
