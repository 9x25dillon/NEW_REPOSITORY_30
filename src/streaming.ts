// Outer streaming only: steady incompressible Stokes flow between infinite
// parallel plates with sinusoidal Rayleigh slip. No side walls, inner layer,
// heating, elastic wall motion, or nonlinear streaming is modeled here.
import { type Medium } from "./gorkov.js";
import { finite, nonnegative, positive } from "./validation.js";

export interface RayleighChannel {
  /** Half-gap between plates, m; y=0 is the midplane. */
  halfHeight: number;
  k: number;
  pressure: number;
  phase: number;
  medium: Medium;
  viscosity: number;
  frequency: number;
}
export interface StreamingVelocity { x: number; y: number; }

export function stokesLayerThickness(frequency: number, viscosity: number, density: number): number {
  positive("frequency", frequency); positive("viscosity", viscosity); positive("density", density);
  return Math.sqrt(viscosity / (Math.PI * density * frequency));
}

export function streamingReynolds(speed: number, length: number, viscosity: number, density: number): number {
  finite("speed", speed); positive("length", length); positive("viscosity", viscosity); positive("density", density);
  return density * Math.abs(speed) * length / viscosity;
}

/** Slip coefficient for p=p_a cos(kx+phase), v_1 proportional to sin(kx+phase).
 * The sign depends on this convention: slip is toward pressure antinodes. */
export function rayleighSlipAmplitude(pressure: number, medium: Medium): number {
  nonnegative("pressure", pressure); positive("density", medium.rho); positive("sound speed", medium.c);
  return -3 * (pressure / (medium.rho * medium.c)) ** 2 / (8 * medium.c);
}

/** Exact biharmonic streamfunction for the stated slip boundary problem:
 * psi = S sin(2kx+2phase) f(y), (D_y^2-4k^2)^2 f=0,
 * f(+/-h)=0, f'(+/-h)=1. Velocity is (d_y psi, -d_x psi).
 * Accuracy of the acoustic slip approximation is a separate question. */
export function rayleighStreaming(channel: RayleighChannel, x: number, y: number): StreamingVelocity {
  const { halfHeight: h, k, medium, pressure, phase } = channel;
  positive("half height", h); positive("wavenumber", k); finite("phase", phase);
  positive("frequency", channel.frequency); positive("viscosity", channel.viscosity);
  finite("x", x); finite("y", y);
  if (Math.abs(y) > h) throw new Error("streaming position is outside the parallel plates");
  const Q = 2 * k * h, t = y / h;
  if (Q > 100) throw new Error("parallel-plate solver requires 2*k*halfHeight <= 100");
  let f: number, df: number;
  if (Q < 0.01) {
    // Taylor expansion through Q^4 avoids cancellation as Q -> 0.
    // The omitted term is O(Q^6); test against the full hyperbolic solution.
    const q2 = Q * Q;
    f = h * ((t ** 3 - t) / 2 + q2 * t * (t ** 4 - 2 * t * t + 1) / 20
      + q2 ** 2 * t * (15 * t ** 6 - 49 * t ** 4 + 53 * t * t - 19) / 8400);
    df = (3 * t * t - 1) / 2
      + q2 * (5 * t ** 4 - 6 * t * t + 1) / 20
      + q2 ** 2 * (105 * t ** 6 - 245 * t ** 4 + 159 * t * t - 19) / 8400;
  } else {
    const sh = Math.sinh(Q), ch = Math.cosh(Q), sy = Math.sinh(Q * t), cy = Math.cosh(Q * t);
    const den = sh * ch - Q;
    f = h * (sh * t * cy - ch * sy) / den;
    df = (sh * (cy + Q * t * sy) - Q * ch * cy) / den;
  }
  const S = rayleighSlipAmplitude(pressure, medium), theta = 2 * (k * x + phase);
  return { x: S * Math.sin(theta) * df, y: -2 * k * S * Math.cos(theta) * f };
}

/** Eckart momentum deposition, N/m^3, for a progressive plane wave.
 * alpha is PRESSURE attenuation (1/m); I(x)=I0 exp(-2 alpha x).
 * This is a body force, not a velocity: a flow solution also needs boundaries
 * and a pressure constraint. In a closed 1D domain it can balance pressure. */
export function eckartBodyForce(x: number, pressure: number, alpha: number, medium: Medium): number {
  nonnegative("distance", x); nonnegative("pressure", pressure); nonnegative("pressure attenuation", alpha);
  positive("density", medium.rho); positive("sound speed", medium.c);
  return alpha * pressure ** 2 * Math.exp(-2 * alpha * x) / (medium.rho * medium.c ** 2);
}
