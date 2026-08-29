// inversion.ts — gorkov.ts run backwards: from what a cell DID to what it IS.
//
// Every number this repository computes about a cell depends on two properties
// of that cell, its density and its compressibility, and neither can be looked
// up. Cell lines differ, passage number matters, and the literature values in
// config/subject.ts are a generic mammalian cell rather than anyone's. This
// file is how those two numbers get measured, using the same acoustic field the
// device already produces.
//
// THE MEASUREMENT IS THE FORWARD MODEL, INVERTED. A cell in a standing wave
// follows tan(k u) = tan(k u_0) exp(2 k A t) exactly, so taking logs gives
//
//     ln |tan(k u(t))| = ln |tan(k u_0)| + 2 k A t
//
// a STRAIGHT LINE in t. Its slope is 2kA, and A carries the acoustic contrast
// factor. So tracking one cell through one focusing event and fitting a line
// yields Phi — no iteration, no initial guess, and a residual that says
// immediately whether the cell was doing what the model says it should.
//
// ONE MEASUREMENT IS NOT ENOUGH, and that is the part worth understanding
// before running the experiment. Phi is a single number combining two unknowns:
//
//     Phi = (1/3)(1 - kappa_p/kappa_f) + (rho_p - rho_f)/(2 rho_p + rho_f)
//
// One equation, two unknowns. Measuring Phi in a single medium constrains a
// CURVE in the (rho, kappa) plane and pins nothing. The standard resolution is
// to repeat in media of different density — iodixanol or Percoll, which change
// rho_f substantially while barely touching kappa_f — and intersect the curves.
// Two media is the minimum and three or more lets the fit report a residual.
// propertiesFromContrasts does that intersection; it will not accept fewer.

import { type Medium, type Particle, compressibility, contrastFactor } from "./gorkov.ts";
import { type StandingWave1D } from "./fields.ts";
import { WATER_VISCOSITY } from "./trajectory.ts";

/** One tracked position of one cell, from a video frame. */
export interface Track {
  /** Seconds since the field was switched on. */
  t: number;
  /** Position along the wave's axis, m, measured from a pressure ANTINODE —
   *  for a BAW channel, from a wall. */
  u: number;
}

export interface ContrastFit {
  /** The acoustic contrast factor this cell displayed. */
  phi: number;
  /** Rate constant of the fit, s^-1 — the slope over 2k. */
  A: number;
  /** Coefficient of determination of the straight-line fit. Below about 0.98,
   *  the cell was not following the model and the number should not be used. */
  r2: number;
  /** How many points survived the domain filter below. */
  used: number;
}

/**
 * Acoustic contrast factor from a tracked focusing event.
 *
 * Points too near either equilibrium are DISCARDED rather than fitted. At an
 * antinode tan(k u) is zero and its log diverges; at a node tan diverges
 * outright. Both are real features of the coordinate rather than noise, and
 * including them would let one frame at the end of the run — where every cell
 * spends most of its time — dominate a fit that is supposed to be about the
 * approach. `margin` is the fraction of the quarter-wavelength excluded at each
 * end; 0.05 keeps the middle 90 per cent.
 */
export function contrastFromTrack(
  track: readonly Track[],
  wave: StandingWave1D,
  radius: number,
  viscosity = WATER_VISCOSITY,
  margin = 0.05,
): ContrastFit {
  const k = wave.k;
  const quarter = Math.PI / (2 * k);
  const usable = track.filter((p) => {
    const frac = p.u / quarter;
    return frac > margin && frac < 1 - margin;
  });
  if (usable.length < 3) {
    throw new Error(
      `only ${usable.length} of ${track.length} points lie between the antinode ` +
      `and the node; a fit needs at least 3. Check that u is measured from a ` +
      `pressure antinode and that the cell was actually moving.`,
    );
  }

  const xs = usable.map((p) => p.t);
  const ys = usable.map((p) => Math.log(Math.abs(Math.tan(k * p.u))));
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
  }
  if (sxx === 0) throw new Error("all samples are at the same time");
  const slope = sxy / sxx;

  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    const pred = my + slope * (xs[i] - mx);
    ssRes += (ys[i] - pred) ** 2;
    ssTot += (ys[i] - my) ** 2;
  }
  const r2 = ssTot === 0 ? 1 : 1 - ssRes / ssTot;

  const A = slope / (2 * k);
  // A = Phi k a^2 kappa_f p_a^2 / (6 mu), so Phi is A with the rest divided out.
  const kappaF = compressibility(wave.medium);
  const phi = (A * 6 * viscosity) / (k * radius * radius * kappaF * wave.amplitude ** 2);
  return { phi, A, r2, used: n };
}

/**
 * Pressure amplitude, from a particle whose contrast is already known.
 *
 * The step that makes the rest of this file executable. Phi is extracted from a
 * rate constant that also contains p_a, and the pressure amplitude inside a
 * resonating channel is not something a bench can read off a signal generator —
 * it depends on the coupling, the chip, the temperature and the exact drive
 * frequency. So it is CALIBRATED: run polystyrene beads, whose density and
 * sound speed are well characterised, fit their rate constant, and invert for
 * the amplitude that must have produced it. Then use that amplitude for the
 * cells, in the same chip, in the same session, without touching the drive.
 *
 * `wave.amplitude` is ignored — this computes it. Pass the field you will
 * actually use with any placeholder amplitude.
 */
export function amplitudeFromTrack(
  track: readonly Track[],
  wave: StandingWave1D,
  reference: Particle,
  viscosity = WATER_VISCOSITY,
  margin = 0.05,
  /** Smallest reference contrast the calibration will accept. */
  minContrast = 0.01,
): { amplitude: number; r2: number } {
  // Fit with a unit amplitude, then rescale: A is proportional to p_a squared,
  // so the amplitude that reproduces the observed rate is the square root of
  // the ratio between what was seen and what a unit drive would give.
  const unit: StandingWave1D = { ...wave, amplitude: 1 };
  const fit = contrastFromTrack(track, unit, reference.radius, viscosity, margin);
  const knownPhi = contrastFactor(reference, wave.medium);
  // A THRESHOLD, not an equality. The guard exists because a reference near its
  // iso-acoustic point barely moves and calibrates nothing, and the amplitude
  // it implies amplifies the tracking error by 1/Phi — so the condition to
  // catch is "negligibly small", which is what a bad reference actually
  // produces. Testing knownPhi === 0 catches nothing: a bisected iso-acoustic
  // density leaves Phi at about 1e-17, which is not zero, sails through an
  // equality check, and yields an amplitude inflated by sixteen orders of
  // magnitude. Below 0.01 the calibration is ten times noisier than a
  // polystyrene bead at 0.3 and should be refused.
  if (Math.abs(knownPhi) < minContrast) {
    throw new Error(
      `the reference has contrast ${knownPhi.toExponential(2)} in this medium, ` +
      `below the usable minimum of ${minContrast}: it barely moves, and any ` +
      `amplitude inferred from it is dominated by tracking error. Choose a ` +
      `reference further from its iso-acoustic point.`,
    );
  }
  const ratio = fit.phi / knownPhi;
  if (ratio <= 0) {
    throw new Error(
      `the reference moved the wrong way (implied amplitude squared ${ratio}); ` +
      `check that u is measured from a pressure antinode and that the reference ` +
      `properties are right for this medium`,
    );
  }
  return { amplitude: Math.sqrt(ratio), r2: fit.r2 };
}

/** Polystyrene, the standard calibration bead: well characterised, positive
 *  contrast in every aqueous medium, and available in narrow size ranges. */
export const POLYSTYRENE: Omit<Particle, "radius"> = { rho: 1050, c: 2350 };

/** One contrast measurement, in a medium whose properties are known. */
export interface ContrastMeasurement {
  medium: Medium;
  phi: number;
  /** Optional label, carried through to the residual report. */
  label?: string;
}

export interface Properties {
  /** Density, kg/m^3. */
  rho: number;
  /** Compressibility, 1/Pa. */
  kappa: number;
  /** Speed of sound implied by the two above, m/s. */
  c: number;
  /** RMS disagreement between the media, in units of Phi. Zero for a perfect
   *  fit; compare it against the scatter of your own repeats. */
  residual: number;
}

/** Phi predicted for a candidate particle in a medium. Inlined here rather than
 *  routed through gorkov.contrastFactor so the inversion can work in (rho,
 *  kappa) directly, which is what it is solving for. */
function phiOf(rhoP: number, kappaP: number, med: Medium): number {
  const kappaF = compressibility(med);
  const f1 = 1 - kappaP / kappaF;
  const f2 = (2 * (rhoP - med.rho)) / (2 * rhoP + med.rho);
  return f1 / 3 + f2 / 2;
}

/**
 * Density and compressibility from contrast measured in two or more media.
 *
 * Phi is linear in kappa_p at fixed rho_p, so each measurement gives a closed
 * form for kappa_p as a function of an assumed rho_p. The true density is the
 * one at which those estimates AGREE, which reduces the whole problem to a
 * one-dimensional search for the minimum of their spread — no gradients, no
 * initial guess, and a residual that is directly interpretable as disagreement
 * between media rather than as an abstract cost.
 *
 * Refuses a single measurement. One Phi constrains a curve in the (rho, kappa)
 * plane and determines neither coordinate; returning a point from it would mean
 * silently inventing whichever one the caller did not think to question.
 */
export function propertiesFromContrasts(
  measurements: readonly ContrastMeasurement[],
  bracket: { lo: number; hi: number } = { lo: 900, hi: 1400 },
): Properties {
  if (measurements.length < 2) {
    throw new Error(
      "at least two media are required: one contrast measurement constrains a " +
      "curve in the density/compressibility plane and pins neither coordinate. " +
      "Repeat in media of different density (iodixanol or Percoll).",
    );
  }
  const densities = new Set(measurements.map((m) => m.medium.rho.toFixed(3)));
  if (densities.size < 2) {
    throw new Error(
      "the media must differ in DENSITY; measurements in media of the same " +
      "density are the same equation twice and cannot be intersected.",
    );
  }

  // kappa_p implied by one measurement, given an assumed rho_p
  const kappaFrom = (rhoP: number, m: ContrastMeasurement): number => {
    const kappaF = compressibility(m.medium);
    const f2 = (2 * (rhoP - m.medium.rho)) / (2 * rhoP + m.medium.rho);
    // Phi = (1 - kp/kf)/3 + f2/2  =>  kp = kf (1 - 3(Phi - f2/2))
    return kappaF * (1 - 3 * (m.phi - f2 / 2));
  };

  const spread = (rhoP: number): number => {
    const ks = measurements.map((m) => kappaFrom(rhoP, m));
    const mean = ks.reduce((a, b) => a + b, 0) / ks.length;
    return ks.reduce((a, b) => a + (b - mean) ** 2, 0) / ks.length;
  };

  // Golden-section on the spread. Unimodal in practice over any physically
  // sensible bracket, and a scan-then-refine would need a step size chosen
  // without knowing the scale of the answer.
  const phi = (Math.sqrt(5) - 1) / 2;
  let lo = bracket.lo;
  let hi = bracket.hi;
  let c1 = hi - phi * (hi - lo);
  let c2 = lo + phi * (hi - lo);
  for (let i = 0; i < 200; i++) {
    if (spread(c1) < spread(c2)) { hi = c2; c2 = c1; c1 = hi - phi * (hi - lo); }
    else { lo = c1; c1 = c2; c2 = lo + phi * (hi - lo); }
  }
  const rho = (lo + hi) / 2;
  const ks = measurements.map((m) => kappaFrom(rho, m));
  const kappa = ks.reduce((a, b) => a + b, 0) / ks.length;

  let ss = 0;
  for (const m of measurements) ss += (phiOf(rho, kappa, m.medium) - m.phi) ** 2;
  return {
    rho, kappa,
    c: 1 / Math.sqrt(rho * kappa),
    residual: Math.sqrt(ss / measurements.length),
  };
}

/**
 * The medium density at which this cell would feel no acoustic force at all.
 *
 * The iso-acoustic point: where Phi crosses zero, a cell neither focuses nor
 * anti-focuses and simply stays where the flow put it. It is the single most
 * useful number for designing a separation, because a medium tuned just to one
 * side of a population's iso-acoustic point sends that population one way and
 * everything denser the other.
 *
 * Returns null when no crossing exists in the bracket, which is a real answer:
 * a cell far denser than any usable medium cannot be brought to zero contrast
 * by density tuning alone.
 */
export function isoAcousticDensity(
  particle: Particle,
  mediumSoundSpeed: number,
  bracket: { lo: number; hi: number } = { lo: 950, hi: 1250 },
): number | null {
  const at = (rhoF: number) =>
    contrastFactor(particle, { rho: rhoF, c: mediumSoundSpeed });
  let lo = bracket.lo;
  let hi = bracket.hi;
  if (Math.sign(at(lo)) === Math.sign(at(hi))) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (Math.sign(at(mid)) === Math.sign(at(lo))) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}
