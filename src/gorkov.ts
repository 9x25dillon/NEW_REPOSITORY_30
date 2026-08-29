// gorkov.ts — where a cell goes in an acoustic standing wave.
//
// This is the core of the whole instrument, and it is one function with one
// sign in it that decides everything downstream.
//
// A small compressible sphere in an acoustic standing wave feels a time-averaged
// force derived from the Gor'kov potential (Gor'kov 1962). For a particle much
// smaller than the wavelength — a 15 um cell against a 750 um half-wavelength at
// 1 MHz in water, comfortably true — the potential is
//
//     U = (4/3) pi a^3 [ f1 * (1/2) * kappa_f * <p^2>  -  f2 * (3/4) * rho_f * <v^2> ]
//
// with the monopole and dipole scattering coefficients
//
//     f1 = 1 - kappa_p / kappa_f                     (compressibility contrast)
//     f2 = 2 (rho_p - rho_f) / (2 rho_p + rho_f)     (density contrast)
//
// and the particle moves down the gradient of U.
//
// THERE IS NO VISCOSITY TERM. This is worth stating flatly because it is the
// single most common error in acoustofluidic pseudocode. Viscosity is real and
// it matters enormously — it governs Stokes drag on the particle and it drives
// acoustic streaming in the bulk — but neither of those is the radiation
// potential, and multiplying U by a viscosity produces a field that is wrong in
// its units before it is wrong in its physics. Drag and streaming enter as
// separate forces, at a separate stage, and the ratio between them and the
// radiation force is what sets the size limit below.
//
// Pure functions. SI units throughout: Pa, kg/m^3, m, Hz, N.

export interface Medium {
  /** Density, kg/m^3. Water at 25 C: 997. */
  rho: number;
  /** Speed of sound, m/s. Water at 25 C: 1497. */
  c: number;
}

export interface Particle {
  /** Radius, m. A mammalian cell is typically 5e-6 to 1e-5. */
  radius: number;
  rho: number;
  c: number;
}

/** Adiabatic compressibility, 1/Pa — the reciprocal of the bulk modulus. */
export function compressibility(m: Medium | Particle): number {
  return 1 / (m.rho * m.c * m.c);
}

/** Monopole scattering coefficient: how much more compressible the particle is
 *  than the fluid around it. */
export function f1(p: Particle, med: Medium): number {
  return 1 - compressibility(p) / compressibility(med);
}

/** Dipole scattering coefficient: the density contrast, bounded in (-1, 1). */
export function f2(p: Particle, med: Medium): number {
  return (2 * (p.rho - med.rho)) / (2 * p.rho + med.rho);
}

/**
 * The acoustic contrast factor, Phi = f1/3 + f2/2.
 *
 * ITS SIGN IS THE DESIGN. Phi > 0 sends the particle to the pressure NODES;
 * Phi < 0 sends it to the antinodes. Essentially every mammalian cell is denser
 * and less compressible than its medium, so Phi is positive and cells collect at
 * nodes — which is why a half-wavelength channel focuses cells into a single
 * central band, and why lipid droplets and most microbubbles, being negative,
 * go the other way and can be separated from them in the same field.
 *
 * A tool that gets this sign backwards will confidently design a device that
 * pushes cells into the walls.
 */
export function contrastFactor(p: Particle, med: Medium): number {
  return f1(p, med) / 3 + f2(p, med) / 2;
}

/** Which side of the field a particle collects on. */
export type Collects = "node" | "antinode" | "neutral";

export function collectsAt(p: Particle, med: Medium, eps = 1e-9): Collects {
  const phi = contrastFactor(p, med);
  if (Math.abs(phi) < eps) return "neutral";
  return phi > 0 ? "node" : "antinode";
}

export const TAU = Math.PI * 2;

/** Wavenumber for a frequency in a medium, rad/m. */
export function wavenumber(freqHz: number, med: Medium): number {
  return (TAU * freqHz) / med.c;
}

/** Acoustic energy density of a 1-D standing wave of pressure amplitude pa. */
export function energyDensity(pressureAmplitudePa: number, med: Medium): number {
  return (pressureAmplitudePa * pressureAmplitudePa) / (4 * med.rho * med.c * med.c);
}

/**
 * Radiation force along a 1-D standing wave, N.
 *
 *     F(x) = 4 pi Phi k a^3 E_ac sin(2 k x)
 *
 * x is measured from a pressure ANTINODE, so F is zero at antinodes and at
 * nodes alike — both are equilibria — and the sign of Phi decides which of the
 * two is the stable one. The sin(2kx) is why the force repeats every half
 * wavelength and why a channel one half-wavelength wide has exactly one trap.
 */
export function radiationForce1D(
  xMetres: number, freqHz: number, pressureAmplitudePa: number,
  p: Particle, med: Medium,
): number {
  const k = wavenumber(freqHz, med);
  const phi = contrastFactor(p, med);
  const E = energyDensity(pressureAmplitudePa, med);
  return 4 * Math.PI * phi * k * Math.pow(p.radius, 3) * E * Math.sin(2 * k * xMetres);
}

/** Stokes drag on a sphere moving at `velocity` through a fluid, N. This is
 *  where viscosity actually enters — opposing motion, not creating it. */
export function stokesDrag(velocityMps: number, radiusM: number, viscosityPaS: number): number {
  return 6 * Math.PI * viscosityPaS * radiusM * velocityMps;
}

/**
 * How far the radiation force beats the drag from acoustic streaming.
 *
 * The SCALING is exact and portable, and it is the part worth encoding:
 * radiation force grows as a^3 while Stokes drag from a streaming flow grows as
 * a^1, so their ratio goes as a^2. There is always a size below which streaming
 * wins and the trap stops holding — which is why bacteria and sub-micron
 * vesicles are hard in a plain BAW device and 5-10 um mammalian cells are easy.
 *
 * The CROSSOVER is not encoded, deliberately. It depends on the streaming
 * pattern, which depends on the channel geometry and the boundary layer, none
 * of which this function can see. The literature figure for water at MHz
 * frequencies is around 1-2 um (Barnkob/Bruus and successors); treat it as an
 * order of magnitude and measure your own device. A fabricated prefactor here
 * would be trusted, and that is worse than an absent one.
 *
 * Returns the ratio at radius `a` relative to the ratio at `aRef`.
 */
export function streamingRatioScaling(aMetres: number, aRefMetres: number): number {
  return (aMetres / aRefMetres) ** 2;
}

/** Literature order-of-magnitude for the radiation/streaming crossover in water
 *  at MHz drive, in metres. Geometry-dependent — see streamingRatioScaling. */
export const CROSSOVER_RADIUS_ORDER = 1.5e-6;

/** Water at 25 C. */
export const WATER: Medium = { rho: 997, c: 1497 };

/** A generic mammalian cell — the numbers most acoustofluidics papers assume
 *  when they do not measure their own. Denser and stiffer than water, so its
 *  contrast factor is comfortably positive. */
export const MAMMALIAN_CELL: Particle = { radius: 7.5e-6, rho: 1100, c: 1570 };

/** A lipid droplet: less dense than water, so it goes the OTHER way. Included
 *  because the sign difference is what makes acoustic separation possible. */
export const LIPID_DROPLET: Particle = { radius: 5e-6, rho: 915, c: 1450 };
