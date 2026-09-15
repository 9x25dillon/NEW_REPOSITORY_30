// Lossless fluid sphere, unbounded inviscid host, prescribed plane standing wave.
// Pressure phasor convention: exp(-i omega t), outgoing h_n^(1),
// p_inc = p_a cos(k z + phase). Radius is a RADIUS, not a diameter.
// See docs/RESEARCH_PLATFORM.md for derivation, references, and exclusions.
import { type Medium, type Particle, contrastFactor, energyDensity } from "./gorkov.js";
import { finite, integer, nonnegative, positive } from "./validation.js";

export interface Complex { re: number; im: number; }
export interface MieOptions {
  /** Relative change tolerance for successive partial-wave cutoffs. */
  relativeTolerance?: number;
  /** Absolute tolerance in dimensionless force sum, not newtons. */
  absoluteTolerance?: number;
  maxOrder?: number;
}
export interface MieResult {
  /** Signed coefficient of sin(2(kz+phase)), N. */
  amplitude: number;
  rayleighAmplitude: number;
  ka: number;
  order: number;
  /** Successive-cutoff difference; a convergence diagnostic, not a rigorous bound. */
  truncationChangeN: number;
  /** Signed difference / |Rayleigh|; null at zero Rayleigh contrast. */
  relativeCorrection: number | null;
}

function validate(p: Particle, m: Medium, k: number, pressure: number): void {
  positive("particle radius", p.radius); positive("particle density", p.rho);
  positive("particle sound speed", p.c); positive("fluid density", m.rho);
  positive("fluid sound speed", m.c); positive("wavenumber", k);
  nonnegative("pressure amplitude", pressure);
  // Explicit numerical domain, not a claim that every material is described here.
  const x = k * p.radius, y = x * m.c / p.c;
  if (x < 1e-4 || x > 100 || y < 1e-4 || y > 100) {
    throw new Error("Mie solver requires external and internal size parameters in [1e-4, 100]");
  }
}

/** Spherical Bessel functions: Miller downward recurrence for j, upward for y.
 * Normalize with BOTH j0 and j1 so zeros of either do not destabilize it. */
function bessel(x: number, order: number): { j: number[]; y: number[] } {
  const top = order + Math.ceil(x) + 50;
  const j = Array<number>(top + 2).fill(0);
  j[top] = 1;
  for (let n = top; n > 0; n--) {
    j[n - 1] = (2 * n + 1) / x * j[n] - j[n + 1];
    if (Math.abs(j[n - 1]) > 1e150) {
      for (let t = n - 1; t <= top + 1; t++) j[t] *= 1e-150;
    }
  }
  const j0 = Math.sin(x) / x;
  const j1 = x < 0.01
    ? x / 3 * (1 - x * x / 10 + x ** 4 / 280 - x ** 6 / 15120)
    : (j0 - Math.cos(x)) / x;
  const scale = Math.abs(j0) > Math.abs(j1) ? j0 / j[0] : j1 / j[1];
  for (let n = 0; n <= order + 1; n++) j[n] *= scale;
  const y = [-Math.cos(x) / x, -Math.cos(x) / (x * x) - Math.sin(x) / x];
  for (let n = 1; n <= order; n++) y.push((2 * n + 1) / x * y[n] - y[n - 1]);
  return { j: j.slice(0, order + 2), y };
}

/** Boundary-matched scattering coefficient s_n for j_n + s_n h_n^(1).
 * Losslessness implies Re(s_n) = -|s_n|^2. */
export function scatteringCoefficients(p: Particle, m: Medium, k: number, order: number): Complex[] {
  validate(p, m, k, 0);
  integer("partial-wave order", order, 1, 180);
  const x = k * p.radius, y = x * m.c / p.c;
  const external = bessel(x, order), internal = bessel(y, order);
  const eta = (m.rho * m.c) / (p.rho * p.c);
  return Array.from({ length: order + 1 }, (_, n) => {
    if (p.rho === m.rho && p.c === m.c) return { re: 0, im: 0 };
    const j = external.j[n], yn = external.y[n], jp = internal.j[n];
    const dj = n / x * j - external.j[n + 1];
    const dy = n / x * yn - external.y[n + 1];
    const dp = n / y * jp - internal.j[n + 1];
    const a = dj * jp - eta * j * dp;
    const b = dy * jp - eta * yn * dp;
    const norm = Math.hypot(a, b);
    if (!Number.isFinite(norm) || norm === 0) {
      throw new Error(`scattering coefficient ${n} is numerically unresolved`);
    }
    return { re: -((a / norm) ** 2), im: (a / norm) * (b / norm) };
  });
}

function forceSum(s: Complex[], cutoff: number): number {
  let sum = 0;
  for (let n = 0; n < cutoff; n++) {
    const a = s[n], b = s[n + 1];
    const term = a.im - b.im + 2 * (a.im * b.re - a.re * b.im);
    sum += (n % 2 === 0 ? -1 : 1) * (n + 1) * term;
  }
  return sum;
}

/** Gor'kov force amplitude for the same pressure convention and material model. */
export function rayleighLimit(p: Particle, m: Medium, k: number, pressure: number): number {
  positive("particle radius", p.radius); positive("particle density", p.rho);
  positive("particle sound speed", p.c); positive("fluid density", m.rho);
  positive("fluid sound speed", m.c); positive("wavenumber", k);
  nonnegative("pressure amplitude", pressure);
  return finite("Rayleigh force amplitude", 4 * Math.PI * p.radius ** 3 * k * energyDensity(pressure, m) * contrastFactor(p, m));
}

/** Partial-wave sum with two successive cutoff checks. Throws on nonconvergence. */
export function mieForceAmplitude(
  p: Particle, m: Medium, k: number, pressure: number, opts: MieOptions = {},
): MieResult {
  validate(p, m, k, pressure);
  const rtol = positive("relative tolerance", opts.relativeTolerance ?? 1e-9);
  const atol = positive("absolute tolerance", opts.absoluteTolerance ?? 1e-18);
  const max = integer("maximum order", opts.maxOrder ?? 180, 8, 180);
  const x = k * p.radius;
  let order = Math.max(4, Math.ceil(Math.max(x, x * m.c / p.c) + 4 * Math.cbrt(x)));
  const scale = Math.PI * pressure ** 2 / (m.rho * m.c ** 2 * k ** 2);
  const rayleighAmplitude = rayleighLimit(p, m, k, pressure);
  while (order + 8 <= max) {
    const s = scatteringCoefficients(p, m, k, order + 8);
    const a = forceSum(s, order), b = forceSum(s, order + 4), c = forceSum(s, order + 8);
    const change = Math.max(Math.abs(b - a), Math.abs(c - b));
    if (change <= atol + rtol * Math.abs(c)) {
      const amplitude = finite("Mie force amplitude", scale * c);
      return {
        amplitude, rayleighAmplitude, ka: x, order: order + 8,
        truncationChangeN: scale * change,
        relativeCorrection: rayleighAmplitude === 0 ? null : (amplitude - rayleighAmplitude) / Math.abs(rayleighAmplitude),
      };
    }
    order += 8;
  }
  throw new Error("Mie partial-wave sum did not converge within maximum order");
}

export function mieForce(
  z: number, p: Particle, m: Medium, k: number, pressure: number,
  phase = 0, opts: MieOptions = {},
): number {
  finite("position", z); finite("phase", phase);
  const force = finite("Mie force", mieForceAmplitude(p, m, k, pressure, opts).amplitude * Math.sin(2 * (k * z + phase)));
  return force === 0 ? 0 : force;
}
