// trajectory.ts — how a cell actually gets to the node, and how long it takes.
//
// NO MASS TERM. A 10 um cell in water at MHz drive has a particle Reynolds
// number around 1e-4 and a momentum relaxation time under a microsecond, so
// inertia is gone before anything has moved. The motion is overdamped: the
// radiation force is balanced by Stokes drag at every instant, and the
// trajectory is first-order.
//
//     6 pi mu a (du/dt) = F_rad(u)      =>      du/dt = F_rad(u) / (6 pi mu a)
//
// Writing this second-order with a mass and an acceleration would not be more
// accurate; it would be a stiff integrator solving for a transient that lasts
// a microsecond and then reproducing this equation anyway.
//
// AND IT HAS A CLOSED FORM. For the 1-D standing wave, du/dt = A sin(2ku) with
// A = Phi k a^2 kappa_f p_a^2 / (6 mu), and substituting T = tan(ku) gives
// dT/dt = 2kAT, so
//
//     tan(k u(t)) = tan(k u_0) * exp(2 k A t)
//
// exactly. That is worth more than it looks: the integrator below can be
// checked against a formula rather than against a finer version of itself, and
// the test suite does exactly that. Convergence to a self-consistent wrong
// answer is the failure mode a step-halving check cannot see.
//
// The closed form also says two things directly. The approach is exponential,
// so a cell never formally arrives and "focusing time" must be quoted to a
// tolerance. And u_0 = 0 gives T = 0 for all t: a particle placed exactly on the
// antinode stays there forever, because that is an equilibrium — an unstable
// one, which is why real devices do not care.

import { type Medium, type Particle, compressibility, contrastFactor } from "./gorkov.js";
import { type StandingWave1D, forceAt } from "./fields.js";
import { finite, integer, nonnegative, positive } from "./validation.js";

/** Dynamic viscosity of water at 25 C, Pa·s. */
export const WATER_VISCOSITY = 8.9e-4;

/** Drift velocity at a point, m/s — force over drag coefficient. */
export function velocityAt(
  w: StandingWave1D, u: number, p: Particle, viscosity = WATER_VISCOSITY,
): number {
  return forceAt(w, u, p) / (6 * Math.PI * viscosity * p.radius);
}

/**
 * The velocity coefficient A in du/dt = A sin(2ku), m/s.
 *
 * Its sign is the contrast factor's sign, so it already carries the whole
 * node/antinode decision; its magnitude scales as a^2, which is the same a^2
 * that decides whether streaming wins (see gorkov.streamingRatioScaling).
 * Small particles are slow AND lose to streaming, for related reasons.
 */
export function rateConstant(
  w: StandingWave1D, p: Particle, viscosity = WATER_VISCOSITY,
): number {
  const phi = contrastFactor(p, w.medium);
  const kappa = compressibility(w.medium);
  return (phi * w.k * p.radius * p.radius * kappa * w.amplitude * w.amplitude)
    / (6 * viscosity);
}

/**
 * The exact position at time t, m — the closed-form solution above.
 *
 * `u0` is measured from a pressure antinode of the wave (i.e. with the wave's
 * own phase already folded in). Returns a value in the same half-period as u0,
 * approaching the stable trap.
 */
export function positionAt(
  w: StandingWave1D, u0: number, tSeconds: number, p: Particle,
  viscosity = WATER_VISCOSITY,
): number {
  const A = rateConstant(w, p, viscosity);
  const k = w.k;
  const T0 = Math.tan(k * u0);
  // exp() overflows to Infinity for a long enough time; atan(Infinity) is pi/2,
  // which is the correct limit, so the overflow lands on the right answer. Guard
  // the 0 * Infinity case, which is NaN and would not.
  const growth = Math.exp(2 * k * A * tSeconds);
  if (T0 === 0) return u0;
  const T = T0 * growth;
  if (!Number.isFinite(T)) return Math.sign(T0) * (Math.PI / 2) / k;
  return Math.atan(T) / k;
}

/**
 * Time to travel from u0 to u1 along the closed-form trajectory, s.
 *
 * Infinite when the target is the trap itself — the approach is exponential and
 * a cell never formally arrives. Ask for 95% of the way, not for the node.
 */
export function timeBetween(
  w: StandingWave1D, u0: number, u1: number, p: Particle,
  viscosity = WATER_VISCOSITY,
): number {
  const A = rateConstant(w, p, viscosity);
  if (A === 0) return Infinity;
  const k = w.k;
  // Both equilibria have to be caught explicitly, and neither is caught by the
  // arithmetic. tan(k*u) is zero at an antinode — that one is exact — but at a
  // node it should be infinite and is not: pi/2 is not representable, so
  // tan(k*u) comes back as ~1.6e16, log() of it is a perfectly ordinary number,
  // and asking "how long to reach the node" returned a plausible finite answer
  // for a journey that never ends. Test caught it; the guard is physical rather
  // than numerical so it cannot drift with the floating-point noise.
  if (isEquilibrium(w, u0) || isEquilibrium(w, u1)) return Infinity;
  const T0 = Math.tan(k * u0);
  const T1 = Math.tan(k * u1);
  if (T0 === 0 || T1 === 0) return Infinity;
  return Math.log(T1 / T0) / (2 * k * A);
}

/** Whether a point is a node or an antinode — the two places the force
 *  vanishes, and so the two a trajectory takes infinite time to reach. */
export function isEquilibrium(w: StandingWave1D, u: number, tol = 1e-9): boolean {
  const theta = w.k * u + w.phase;
  return Math.abs(Math.cos(theta)) < tol || Math.abs(Math.sin(theta)) < tol;
}

/**
 * Time for a particle to close a given fraction of its distance to the trap, s.
 *
 * The honest form of "focusing time": a fraction and a starting point, not a
 * single number. 0.95 is the usual convention in the literature and is what a
 * microscope can actually resolve against a 10 um cell.
 */
export function focusTime(
  w: StandingWave1D, u0: number, p: Particle, fraction = 0.95,
  viscosity = WATER_VISCOSITY,
): number {
  const k = w.k;
  const quarter = Math.PI / (2 * k); // antinode at 0, trap at a quarter wavelength
  const target = u0 + (quarter - u0) * fraction;
  return timeBetween(w, u0, target, p, viscosity);
}

// ---------------------------------------------------------------------------
// Numerical integration — for the fields that have no closed form
// ---------------------------------------------------------------------------

export interface Step {
  t: number;
  u: number;
}

/**
 * Classical RK4 on du/dt = v(u).
 *
 * Present because the closed form only covers a single unmodulated standing
 * wave, and the moment an SSAW phase is swept in time — which is the whole
 * point of acoustic tweezing — the field becomes time-dependent and the
 * analytic solution stops applying. `phaseOfTime` is how that enters.
 *
 * Fourth-order, so halving the step should cut the error by sixteen; the test
 * suite checks that against the closed form rather than against itself.
 */
export function integrate(
  w: StandingWave1D,
  u0: number,
  p: Particle,
  opts: {
    duration: number;
    steps: number;
    viscosity?: number;
    /** Envelope phase as a function of time, for a swept SSAW. Defaults to the
     *  wave's own fixed phase. */
    phaseOfTime?: (t: number) => number;
    /** Independent fluid advection, m/s. Radiation force is unchanged. */
    streamingVelocity?: (t: number, u: number) => number;
    /** Alternative radiation law, N, evaluated with the instantaneous field. */
    radiationForce?: (field: StandingWave1D, u: number, particle: Particle) => number;
  },
): Step[] {
  const mu = opts.viscosity ?? WATER_VISCOSITY;
  positive("viscosity", mu); positive("particle radius", p.radius);
  nonnegative("duration", opts.duration); integer("steps", opts.steps, 1, 1_000_000);
  finite("initial position", u0);
  const dt = opts.duration / opts.steps;
  const out: Step[] = [{ t: 0, u: u0 }];
  let u = u0;

  const v = (t: number, x: number) => {
    const field = opts.phaseOfTime
      ? { ...w, phase: opts.phaseOfTime(t) }
      : w;
    const radiation = opts.radiationForce
      ? opts.radiationForce(field, x, p) / (6 * Math.PI * mu * p.radius)
      : velocityAt(field, x, p, mu);
    return finite("trajectory velocity", radiation + (opts.streamingVelocity?.(t, x) ?? 0));
  };

  for (let i = 0; i < opts.steps; i++) {
    const t = i * dt;
    const k1 = v(t, u);
    const k2 = v(t + dt / 2, u + (dt / 2) * k1);
    const k3 = v(t + dt / 2, u + (dt / 2) * k2);
    const k4 = v(t + dt, u + dt * k3);
    u += (dt / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
    finite("trajectory position", u);
    out.push({ t: t + dt, u });
  }
  return out;
}

/**
 * Whether a swept SSAW will actually carry a cell along with it, rather than
 * letting it slip a node.
 *
 * The trap can only pull as hard as its steepest force, |F|max = pi a^3 kappa
 * p_a^2 |Phi| k, and dragging a cell at the sweep speed costs 6 pi mu a v. Sweep
 * faster than the ratio of those and the cell falls out of its node and is left
 * behind — the standard failure of an acoustic conveyor, and it fails silently,
 * looking like a cell that simply did not move.
 */
export function maxSweepSpeed(
  w: StandingWave1D, p: Particle, viscosity = WATER_VISCOSITY,
): number {
  const phi = Math.abs(contrastFactor(p, w.medium));
  const kappa = compressibility(w.medium);
  const fMax = Math.PI * Math.pow(p.radius, 3) * kappa * w.amplitude * w.amplitude
    * phi * w.k;
  return fMax / (6 * Math.PI * viscosity * p.radius);
}

/** Convenience: the medium's viscosity is not carried on Medium, because it
 *  plays no part in the radiation potential and putting it there would invite
 *  exactly the error this repository was started to avoid. */
export function viscosityFor(_m: Medium): number {
  return WATER_VISCOSITY;
}
