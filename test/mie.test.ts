import { strict as assert } from "node:assert";
import { test } from "node:test";
import { WATER, MAMMALIAN_CELL, LIPID_DROPLET, radiationForce1D, type Particle, type Medium } from "../src/gorkov.js";
import { mieForce, mieForceAmplitude, scatteringCoefficients } from "../src/mie.js";

const relative = (a: number, b: number, tolerance: number) =>
  assert.ok(Math.abs(a - b) <= tolerance * Math.max(Math.abs(b), 1e-30), `${a} vs ${b}`);

test("Mie reduces to Gor'kov for positive and negative contrast, with quadratic relative correction", () => {
  for (const p of [MAMMALIAN_CELL, LIPID_DROPLET]) {
    const corrections: number[] = [];
    for (const ka of [0.04, 0.02, 0.01]) {
      const k = ka / p.radius, z = 0.31 / k;
      const actual = mieForce(z, p, WATER, k, 1e5);
      const rayleigh = radiationForce1D(z, k * WATER.c / (2 * Math.PI), 1e5, p, WATER);
      relative(actual, rayleigh, 0.002);
      corrections.push(Math.abs(actual / rayleigh - 1));
    }
    relative(corrections[0] / corrections[1], 4, 0.003);
    relative(corrections[1] / corrections[2], 4, 0.003);
  }
});

test("independent Taylor benchmark fixes the leading finite-size coefficient", () => {
  // rho_p=rho_f, c_p=2c_f: direct Taylor expansion of boundary conditions gives
  // Im(s0)=-x^3/4+x^5/8, Im(s1)=-x^5/60, s2=O(x^7).
  // Thus F/F_G = 1 - 7 x^2/10 + O(x^4), not merely an unspecified O(x^2).
  const p = { radius: 1e-5, rho: WATER.rho, c: 2 * WATER.c };
  for (const x of [0.01, 0.005, 0.002]) {
    const r = mieForceAmplitude(p, WATER, x / p.radius, 1e5);
    relative((r.amplitude / r.rayleighAmplitude - 1) / (x * x), -0.7, 0.0001);
  }
});

test("lossless partial waves obey optical theorem and zero contrast scatters nothing", () => {
  for (const x of [0.001, 0.1, 1, 8, 50]) {
    const k = x / MAMMALIAN_CELL.radius;
    for (const s of scatteringCoefficients(MAMMALIAN_CELL, WATER, k, 20)) {
      assert.ok(Math.abs(s.re + s.re ** 2 + s.im ** 2) < 1e-15);
    }
    const p = { ...WATER, radius: MAMMALIAN_CELL.radius };
    assert.equal(mieForceAmplitude(p, WATER, k, 1e5).amplitude, 0);
  }
});

test("Mie respects spatial symmetry, pressure squared, and zero drive", () => {
  const p = MAMMALIAN_CELL, k = 4 / p.radius, z = 0.3 / k;
  const f = mieForce(z, p, WATER, k, 1e5);
  relative(mieForce(-z, p, WATER, k, 1e5), -f, 1e-12);
  relative(mieForce(z + Math.PI / k, p, WATER, k, 1e5), f, 1e-12);
  relative(mieForce(z, p, WATER, k, 2e5), 4 * f, 1e-12);
  assert.equal(mieForce(z, p, WATER, k, 0), 0);
  assert.equal(mieForce(0, p, WATER, k, 1e5), 0);
});

/** Independent force calculation: integrate radiation stress over an enclosing
 * sphere. Shares boundary-matched s_n, but uses no adjacent-order force formula.
 * Incident field is evaluated directly as cos(theta+q mu), not in partial waves.
 * q>order keeps the independent UPWARD Bessel recurrence well conditioned. */
function stressForce(p: Particle, m: Medium, k: number, pressure: number, theta: number, q: number): number {
  const order = 32, s = scatteringCoefficients(p, m, k, order);
  const j = [Math.sin(q) / q, Math.sin(q) / q ** 2 - Math.cos(q) / q];
  const y = [-Math.cos(q) / q, -Math.cos(q) / q ** 2 - Math.sin(q) / q];
  for (let n = 1; n <= order; n++) {
    j.push((2 * n + 1) / q * j[n] - j[n - 1]);
    y.push((2 * n + 1) / q * y[n] - y[n - 1]);
  }
  const integrand = (mu: number) => {
    const sn = Math.sqrt(1 - mu * mu), incident = theta + q * mu;
    let pr = Math.cos(incident), pi = 0;
    let rr = -mu * Math.sin(incident), ri = 0;
    let tr = sn * Math.sin(incident), ti = 0;
    let prev = 1, poly = 1, dprev = 0, deriv = 0;
    for (let n = 0; n <= order; n++) {
      if (n === 1) { prev = poly; poly = mu; deriv = 1; }
      else if (n > 1) {
        const next = ((2 * n - 1) * mu * poly - (n - 1) * prev) / n;
        const dn = ((2 * n - 1) * (poly + mu * deriv) - (n - 1) * dprev) / n;
        prev = poly; poly = next; dprev = deriv; deriv = dn;
      }
      const a = (2 * n + 1) * Math.cos(theta + n * Math.PI / 2);
      const hr = s[n].re * j[n] - s[n].im * y[n];
      const hi = s[n].im * j[n] + s[n].re * y[n];
      const dj = n / q * j[n] - j[n + 1], dy = n / q * y[n] - y[n + 1];
      pr += a * poly * hr; pi += a * poly * hi;
      rr += a * poly * (s[n].re * dj - s[n].im * dy);
      ri += a * poly * (s[n].im * dj + s[n].re * dy);
      tr -= a * sn * deriv / q * hr; ti -= a * sn * deriv / q * hi;
    }
    return mu * (tr * tr + ti * ti - rr * rr - ri * ri - pr * pr - pi * pi)
      + 2 * sn * (rr * tr + ri * ti);
  };
  const N = 8192, step = 2 / N;
  let sum = integrand(-1) + integrand(1);
  for (let i = 1; i < N; i++) sum += (i % 2 ? 4 : 2) * integrand(-1 + i * step);
  return sum * step / 3 * Math.PI * (q / k) ** 2 * pressure ** 2 / (2 * m.rho * m.c ** 2);
}

test("partial-wave force agrees with surface stress and is independent of enclosing radius", () => {
  for (const p of [MAMMALIAN_CELL, LIPID_DROPLET]) {
    for (const ka of [0.5, 2, 8]) {
      const k = ka / p.radius, theta = 0.37;
      const f = mieForce(theta / k, p, WATER, k, 1e5);
      for (const q of [38, 47]) relative(stressForce(p, WATER, k, 1e5, theta, q), f, 2e-5);
    }
  }
});

test("unsupported numerical domains and insufficient partial-wave budgets fail explicitly", () => {
  assert.throws(() => mieForceAmplitude(MAMMALIAN_CELL, WATER, 0, 1e5), /positive/);
  assert.throws(() => mieForceAmplitude(MAMMALIAN_CELL, WATER, 1e10, 1e5), /size parameters/);
  assert.throws(() => mieForceAmplitude(MAMMALIAN_CELL, WATER, 1e5, NaN), /finite/);
  assert.throws(() => mieForceAmplitude(MAMMALIAN_CELL, WATER, 1e5, 1e5, { maxOrder: 8 }), /converge/);
});
