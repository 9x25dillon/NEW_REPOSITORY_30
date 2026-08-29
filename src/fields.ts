// fields.ts — the two device classes, which are the same standing wave twice.
//
// A BAW chip and an SSAW chip look nothing alike on a bench and produce the
// same object in the fluid: a one-dimensional standing pressure wave. What
// differs is only what sets the wavenumber.
//
//   BAW   the channel width sets it. Hard walls (silicon, glass) are pressure
//         ANTINODES, so a resonance needs an integer number of half-wavelengths
//         across the channel: w = n·lambda/2, hence f_n = n·c_f / (2w). The
//         frequency is a consequence of the geometry you etched.
//
//   SSAW  the IDT finger pitch sets it. Two counter-propagating Rayleigh waves
//         interfere along the substrate with period lambda_SAW, and the fluid
//         sees that period. The frequency is a consequence of the mask you drew
//         and the substrate you drew it on.
//
// So one core carries both, and the device modules are thin. That is not a
// convenience — it is why a result checked on one class transfers to the other.
//
// THE POTENTIAL, DERIVED ONCE. For p = p_a cos(k u) the time averages are
// <p^2> = p_a^2 cos^2(ku)/2 and <v^2> = (p_a/(rho c))^2 sin^2(ku)/2. Substituting
// into Gor'kov and dropping the constant term leaves
//
//     U(u) = (1/2) pi a^3 kappa_f p_a^2 Phi cos(2 k u)
//     F(u) = -dU/du = pi a^3 kappa_f p_a^2 Phi k sin(2 k u)
//
// which is the textbook F = 4 pi Phi k a^3 E_ac sin(2ku) once E_ac = kappa_f
// p_a^2 / 4 is substituted — a check the test suite performs against
// gorkov.radiationForce1D rather than leaving to this comment.
//
// For Phi > 0, U is least where cos(2ku) = -1, i.e. at ku = pi/2: the pressure
// NODE. Cells go to nodes. Everything downstream is that sentence.

import {
  type Medium, type Particle, compressibility, contrastFactor,
} from "./gorkov.js";

/**
 * A one-dimensional standing pressure wave.
 *
 * `u` is measured along the wave's axis from a pressure ANTINODE when phase is
 * zero — for a BAW channel that is a wall, for an SSAW it is wherever the two
 * IDTs happen to put one. `phase` slides the whole pattern, which is the only
 * way an SSAW device moves anything.
 */
export interface StandingWave1D {
  /** Wavenumber, rad/m. */
  k: number;
  /** Wavelength, m. */
  wavelength: number;
  /** Drive frequency, Hz. */
  frequency: number;
  /** Pressure amplitude, Pa. */
  amplitude: number;
  /**
   * ENVELOPE phase, rad — nodes sit at (pi/2 + n·pi - phase)/k.
   *
   * NOT the same quantity as an SSAW device's IDT phase difference, and the two
   * differ by a factor of MINUS TWO: superposing the counter-propagating pair
   * gives cos(kx - p/2), so envelope = -idtPhase/2. Sweeping one while thinking
   * in the other moves the pattern twice as far in the wrong direction. Use
   * envelopePhaseForIdt rather than converting by hand.
   */
  phase: number;
  medium: Medium;
}

/** Pressure amplitude at a point, Pa. */
export function pressureAt(w: StandingWave1D, u: number): number {
  return w.amplitude * Math.cos(w.k * u + w.phase);
}

/** Acoustic energy density of the wave, J/m^3. */
export function energyDensity(w: StandingWave1D): number {
  return (w.amplitude * w.amplitude) / (4 * w.medium.rho * w.medium.c * w.medium.c);
}

/** Gor'kov potential at a point, J. The constant term is dropped: only its
 *  gradient is ever used, and carrying it invites comparing two fields' absolute
 *  potentials, which is meaningless. */
export function potentialAt(w: StandingWave1D, u: number, p: Particle): number {
  const phi = contrastFactor(p, w.medium);
  const kappa = compressibility(w.medium);
  return 0.5 * Math.PI * Math.pow(p.radius, 3) * kappa * w.amplitude * w.amplitude
    * phi * Math.cos(2 * (w.k * u + w.phase));
}

/** Radiation force at a point, N. Positive is toward increasing u. */
export function forceAt(w: StandingWave1D, u: number, p: Particle): number {
  const phi = contrastFactor(p, w.medium);
  const kappa = compressibility(w.medium);
  return Math.PI * Math.pow(p.radius, 3) * kappa * w.amplitude * w.amplitude
    * phi * w.k * Math.sin(2 * (w.k * u + w.phase));
}

/**
 * Where a particle of this contrast comes to rest, within [0, span).
 *
 * Nodes and antinodes are both equilibria — the force vanishes at each — and
 * which one is STABLE depends on the sign of the contrast factor. Returning the
 * stable set rather than "the nodes" is the difference between a tool that
 * works for cells and one that works for cells and lies about lipid droplets.
 *
 * RESULTS ARE WRAPPED INTO [0, span), so the index of a trap is NOT a stable
 * identity. Sweep the phase and a trap will leave the window at one end while
 * another enters at the other, and `positions[0]` will silently become a
 * different physical node — which reads as the pattern jumping backwards by one
 * spacing when it in fact moved forwards. To follow one node through a sweep,
 * integrate its position (see trajectory.integrate) rather than re-reading this
 * list; to compare two phases, compare the sets modulo the spacing.
 */
export function trapPositions(w: StandingWave1D, p: Particle, span: number): number[] {
  const phi = contrastFactor(p, w.medium);
  if (phi === 0) return [];
  // Phi > 0 traps at pressure nodes (cos = 0); Phi < 0 traps at antinodes.
  const offset = phi > 0 ? Math.PI / 2 : 0;
  const period = Math.PI / w.k; // traps repeat every half wavelength
  const out: number[] = [];
  const first = (offset - w.phase) / w.k;
  // walk back to the first trap at or above zero, then forward across the span
  let u = first - Math.ceil(first / period) * period;
  while (u < -1e-15) u += period;
  for (; u < span - 1e-15; u += period) out.push(u);
  return out;
}

// ---------------------------------------------------------------------------
// BAW — a resonant channel
// ---------------------------------------------------------------------------

export interface BawChannel {
  /** Channel width, m. */
  width: number;
  /** Harmonic: 1 is the half-wavelength mode, and the one that focuses to a
   *  single central line. */
  mode: number;
  medium: Medium;
}

/**
 * Resonance frequency of a channel, Hz: f_n = n·c_f / (2w).
 *
 * Ideal-hard-wall result. A real device sits close to it but not on it — the
 * silicon/water impedance ratio is large but finite, the wall is not rigid, and
 * the actual resonance shifts by a fraction of a percent and depends on
 * temperature through c_f. Tune to the measured peak; use this to know which
 * peak you are looking at.
 */
export function bawResonance(ch: BawChannel): number {
  return (ch.mode * ch.medium.c) / (2 * ch.width);
}

/**
 * The standing wave inside a resonant channel.
 *
 * Phase is zero because u is measured from a wall and a hard wall is a pressure
 * antinode. That single fact is why the fundamental mode focuses to the channel
 * CENTRE: with antinodes pinned at both walls, the one node of the n = 1 mode
 * has nowhere else to be.
 */
export function bawField(ch: BawChannel, amplitudePa: number): StandingWave1D {
  const frequency = bawResonance(ch);
  const wavelength = (2 * ch.width) / ch.mode;
  return {
    k: (2 * Math.PI) / wavelength,
    wavelength,
    frequency,
    amplitude: amplitudePa,
    phase: 0,
    medium: ch.medium,
  };
}

// ---------------------------------------------------------------------------
// SSAW — two counter-propagating surface waves
// ---------------------------------------------------------------------------

export interface SawSubstrate {
  name: string;
  /** Cut and propagation direction. The velocity below is meaningless without
   *  it — the same crystal cut differently is a different device. */
  cut: string;
  /** Rayleigh (or leaky) wave velocity, m/s. */
  velocity: number;
  /** Hermann–Mauguin point group, for cross-checking against pointgroups.ts. */
  hm: string;
}

/**
 * The substrates and cuts an SSAW device is actually built on.
 *
 * Velocities are the standard published figures for these specific cuts and are
 * the only empirical numbers in this repository. They are here rather than in
 * pointgroups.ts precisely because they are cut-dependent: symmetry belongs to
 * the crystal, velocity belongs to the wafer.
 */
export const SAW_SUBSTRATES: readonly SawSubstrate[] = [
  { name: "Lithium niobate", cut: "128 deg Y-cut, X-propagating", velocity: 3980, hm: "3m" },
  { name: "Lithium tantalate", cut: "36 deg Y-cut, X-propagating (leaky)", velocity: 4212, hm: "3m" },
  { name: "Quartz", cut: "ST-cut, X-propagating", velocity: 3158, hm: "32" },
];

export interface SsawDevice {
  /** Centre-to-centre spacing of adjacent opposite-polarity IDT fingers, m.
   *  The acoustic wavelength is twice this. */
  fingerPitch: number;
  substrate: SawSubstrate;
  medium: Medium;
  /** Phase difference between the two IDTs, rad. This is the steering handle:
   *  see ssawNodeShift. */
  idtPhase?: number;
}

/** Acoustic wavelength on the substrate, m — twice the finger pitch. */
export function ssawWavelength(d: SsawDevice): number {
  return 2 * d.fingerPitch;
}

/** Drive frequency, Hz. Set by the mask and the wafer, not by the fluid. */
export function ssawFrequency(d: SsawDevice): number {
  return d.substrate.velocity / ssawWavelength(d);
}

/**
 * The Rayleigh angle at which the surface wave leaks into the fluid, radians.
 *
 * Snell's law: sin(theta) = c_fluid / c_SAW. For water on 128 deg Y-X lithium
 * niobate this is about 22 degrees, the figure quoted throughout the SSAW
 * literature.
 *
 * Throws when c_SAW <= c_fluid, because then there is no real angle and no
 * leaky radiation into the fluid at all — the device would simply not couple.
 * A NaN returned quietly here would propagate into a trap position and look
 * like a physical result.
 */
export function rayleighAngle(d: SsawDevice): number {
  const ratio = d.medium.c / d.substrate.velocity;
  if (ratio >= 1) {
    throw new Error(
      `no leaky radiation: fluid sound speed ${d.medium.c} m/s is not below the ` +
      `${d.substrate.name} wave velocity ${d.substrate.velocity} m/s`,
    );
  }
  return Math.asin(ratio);
}

/**
 * The standing wave the two surface waves write into the fluid.
 *
 * The lateral period in the fluid is the SAW wavelength, so the traps repeat
 * every half of it — which is why an SSAW device gets finer node spacing than a
 * BAW device of the same footprint simply by drawing a finer mask.
 */
export function ssawField(d: SsawDevice, amplitudePa: number): StandingWave1D {
  const wavelength = ssawWavelength(d);
  return {
    k: (2 * Math.PI) / wavelength,
    wavelength,
    frequency: ssawFrequency(d),
    amplitude: amplitudePa,
    // Two waves of phase difference p sum to an envelope cos(kx - p/2).
    phase: envelopePhaseForIdt(d.idtPhase ?? 0),
    medium: d.medium,
  };
}

/**
 * How far the node pattern translates for a given IDT phase difference, m.
 *
 * Superposing cos(kx - wt) and cos(-kx - wt + p) gives an envelope
 * cos(kx - p/2), so the pattern slides by p/(2k) — and a full 2*pi of phase
 * moves it by exactly one node spacing, lambda/2. That identity is the entire
 * mechanism of acoustic tweezing: cells are carried by moving the field rather
 * than by pushing them, so there is no shear on the membrane beyond the drag of
 * the medium they are being walked through.
 */
export function envelopePhaseForIdt(idtPhaseRad: number): number {
  return -idtPhaseRad / 2;
}

/** The inverse, for reading a swept envelope back as a device setting. */
export function idtPhaseForEnvelope(envelopeRad: number): number {
  return -2 * envelopeRad;
}

export function ssawNodeShift(d: SsawDevice, phaseRad: number): number {
  return phaseRad / (2 * ((2 * Math.PI) / ssawWavelength(d)));
}
