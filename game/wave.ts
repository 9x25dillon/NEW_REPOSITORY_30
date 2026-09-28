// game/wave.ts — you.
//
// The player is not an operator with a slider. The player is the field: a pair
// of crossed standing waves, which is what an acoustic tweezer physically is.
// Two orthogonal SSAWs give a separable potential U(x,y) = U_x(x) + U_y(y), so
// the force is a pair of independent one-dimensional forces and both of them
// are fields.forceAt out of src/, unmodified. A grid of pressure nodes falls
// out, and dragging a finger slides that grid — because sliding it is the only
// thing an IDT phase can do, and it is enough.
//
// Separable ONLY because the two pairs are driven a quarter period apart in
// time. That was always so and never said; it has a name now, QUADRATURE, and
// the Resonant Expedition can drive them otherwise. See "cross-phase" below.
//
// WHAT YOU ARE MADE OF, AND WHAT IT COSTS. Amplitude is grip. It ramps rather
// than steps, because an amplifier does and because an instant step would let
// the cost be feathered frame by frame. The cost is stamina and it goes as
// amplitude squared, because acoustic energy density does. Nothing else in the
// game spends stamina; nothing else needs to.
//
// THE ONE FABRICATED NUMBER, DECLARED. gorkov.ts refuses to encode a
// radiation/streaming crossover, because it depends on channel geometry the
// library cannot see, and "a fabricated prefactor here would be trusted, and
// that is worse than an absent one." A game cannot refuse: something has to
// happen on screen to a motif too small to hold. So STREAMING_COEFF is pinned
// at one point — a particle of radius CROSSOVER_RADIUS_ORDER is exactly on the
// fence in a reference device — and every other radius follows by
// gorkov.streamingRatioScaling's a^2 law, which is the part the library does
// vouch for. It is a game constant, it is not a measurement, and nothing in
// src/ imports it.
//
// No DOM here. A pure function of (state, input, seed), so the tests can play
// the whole game headlessly.

import {
  type Medium, type Particle,
  CROSSOVER_RADIUS_ORDER, MAMMALIAN_CELL, WATER,
  compressibility, contrastFactor, f1, streamingRatioScaling,
} from "../src/gorkov.js";
import {
  type SawSubstrate, type StandingWave1D,
  SAW_SUBSTRATES, forceAt, ssawField, ssawFrequency, ssawWavelength, trapPositions,
} from "../src/fields.js";
import { AMBIENT_C, viscosity } from "./thermal.js";
import { rateConstant } from "../src/trajectory.js";

// ── constants ───────────────────────────────────────────────────────────────

/**
 * Dynamic viscosity of water at 25 C, Pa s.
 *
 * It is here and not on src/gorkov.ts's Medium for the reason that module's
 * header gives at length: the radiation potential has no viscosity term, and
 * hanging one on the medium invites multiplying it in. Viscosity enters exactly
 * once, in Stokes drag — a different force at a different stage.
 */
export const WATER_VISCOSITY = 0.89e-3;

export const SUBSTRATE: SawSubstrate = SAW_SUBSTRATES[0];

/** How fast grip rises while held and falls when released, Pa/s. */
export const GRIP_RISE = 9e5;
export const GRIP_FALL = 7e5;

/**
 * Stamina. Drain goes as amplitude squared, because energy density does.
 *
 * The ratio of these two is the game's most load-bearing number, and it is not
 * a difficulty knob — it is the duty cycle. Grip is simultaneously the only
 * offence AND the only defence: a node under your hand PUSHES every warm hunter
 * away from you, because their contrast is negative. So time spent recovering
 * is time spent undefended. At 26 down and 13 up that was five and a half
 * seconds of exposure for every four of cover, no cell could ever be built
 * under fire, and a bot playing the game's own strategy died on the first
 * depth every seed. Roughly even is the setting where the loop exists.
 */
export const STAMINA_MAX = 100;
export const STAMINA_REGEN = 21;
export const STAMINA_DRAIN = 17;

/** How fast a sub-crossover motif's streaming drift turns, rad/s. Streaming
 *  rolls are steady in space and structured mostly in the depth direction this
 *  top view cannot show, so a slow random heading is the honest caricature. */
export const STREAMING_TURN = 5.0;

// ── deterministic randomness ────────────────────────────────────────────────

/** mulberry32 — seeded, so a run replays and a test can assert on it. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── the field ───────────────────────────────────────────────────────────────

export interface Wave {
  /** Trap spacing, m — half a wavelength, the same on both axes. */
  pitch: number;
  /** IDT phase per axis, rad. The only steering an SSAW device has. */
  phaseX: number;
  phaseY: number;
  /** Drive pressure amplitude, Pa. Zero is released. */
  amplitude: number;
  maxAmplitude: number;
  stamina: number;
  /** True once stamina ran out; grip is refused until it recovers. */
  spent: boolean;
  medium: Medium;
  /**
   * The water's temperature, degrees C.
   *
   * It lives on the wave because the wave is the drive and the drive is what
   * raises it, and because everything that needs the viscosity it implies —
   * `velocityAt`, `advance`, `body.walkSpeed` — already has a wave in hand.
   * At AMBIENT_C every number here is exactly what it was before temperature
   * was tracked at all.
   */
  tC: number;
  /** Where the grid is currently pointed, m. Kept because the focus envelope
   *  needs a centre and the phases only imply one. */
  aimX: number;
  aimY: number;
  /**
   * Focus radius, m — the 1/e width of the drive envelope about the aim.
   *
   * A real transducer is apodised: the drive is not uniform across the whole
   * device, it is concentrated. Without that the lattice grips equally hard
   * everywhere at once, which is not a hand, it is a weather system — and a
   * player steering it has no reason to go anywhere. Zero disables the
   * envelope and restores the uniform field.
   */
  focus: number;
  /** True while the grid is set so that your cursor is an ANTINODE. */
  inverted: boolean;
  /**
   * CROSS-PHASE, rad: how far apart in TIME the X pair and the Y pair are
   * driven. See `crossForce`. QUADRATURE is the field this game was written
   * in, and at exactly that value every function here is what it always was.
   */
  cross: number;
  /** True while the Y pair was stepped one pitch so that the well under the
   *  aim is the deep half of the checkerboard. Derived by `aimAt`. */
  flipped: boolean;
}

/**
 * The two pairs driven a quarter period apart. The ONLY cross-phase at which
 * the potential separates into U_x(x) + U_y(y) — which the header of this file
 * assumed without saying so for as long as the game has existed.
 */
export const QUADRATURE = Math.PI / 2;

export function newWave(
  pitch: number, maxAmplitude: number, focus = 0, medium: Medium = WATER,
): Wave {
  return {
    pitch, phaseX: 0, phaseY: 0,
    amplitude: 0, maxAmplitude,
    stamina: STAMINA_MAX, spent: false, medium, tC: AMBIENT_C,
    aimX: 0, aimY: 0, focus, inverted: false, cross: QUADRATURE, flipped: false,
  };
}

/** One axis of the pair. Finger pitch is half the wavelength, and the traps —
 *  which repeat every half wavelength — therefore land one per `pitch`. */
function axis(w: Wave, phase: number, amplitude: number): StandingWave1D {
  return ssawField(
    { fingerPitch: w.pitch, substrate: SUBSTRATE, medium: w.medium, idtPhase: phase },
    amplitude,
  );
}

export function axisX(w: Wave, amplitude = w.amplitude): StandingWave1D {
  return axis(w, w.phaseX, amplitude);
}
export function axisY(w: Wave, amplitude = w.amplitude): StandingWave1D {
  return axis(w, w.phaseY, amplitude);
}

/**
 * The drive envelope at a point, 0..1.
 *
 * Gaussian about the aim. It multiplies the PRESSURE amplitude, so the force —
 * which goes as pressure squared — falls off as its square. That is why the
 * grip has an edge you can feel: a particle one focus radius away already feels
 * roughly a tenth of the force one under the cursor does.
 */
export function envelopeAt(w: Wave, x: number, y: number): number {
  if (w.focus <= 0) return 1;
  const dx = x - w.aimX, dy = y - w.aimY;
  return Math.exp(-(dx * dx + dy * dy) / (2 * w.focus * w.focus));
}

/** Pressure amplitude actually delivered at a point, Pa. */
export function localAmplitude(w: Wave, x: number, y: number): number {
  return w.amplitude * envelopeAt(w, x, y);
}

/** Drive frequency, Hz — set by the mask and the wafer, not by the fluid. */
export function frequency(w: Wave): number {
  return ssawFrequency({ fingerPitch: w.pitch, substrate: SUBSTRATE, medium: w.medium });
}

export function wavelength(w: Wave): number {
  return ssawWavelength({ fingerPitch: w.pitch, substrate: SUBSTRATE, medium: w.medium });
}

/**
 * The IDT phase that puts a trap exactly at coordinate `u`.
 *
 * Nodes sit where k*u + envelope = pi/2 + n*pi, so the envelope wanted is
 * pi/2 - k*u, and the device setting is that run back through the factor of
 * minus two in fields.envelopePhaseForIdt. Doing that conversion by hand is the
 * error that module warns about, so it is done once, here.
 */
export function phaseForNodeAt(w: Wave, u: number): number {
  const k = Math.PI / w.pitch;
  return -2 * (Math.PI / 2 - k * u);
}

/**
 * Point the grid at (x, y). This is the entire control scheme.
 *
 * BOTH LATTICES ARE YOURS. Nodes and antinodes are not two systems, they are
 * one field a quarter wavelength apart, and which of them sits under your hand
 * is a phase offset and nothing else. Aim half a trap spacing past the cursor
 * and the cursor becomes an antinode: the same grip that gathered the
 * node-seekers now scatters them, and the antinode-seekers it was pushing away
 * come to your hand instead.
 *
 * The envelope centre does NOT move with the offset — you still focus on where
 * you are pointing. Only which lattice lands there changes.
 */
export function aimAt(
  w: Wave, x: number, y: number, invert = false, flip = false,
): void {
  const off = invert ? w.pitch / 2 : 0;
  w.phaseX = phaseForNodeAt(w, x + off);
  // A FLIP steps the Y pair by one trap pitch. The cursor stays a trap of the
  // same kind — a node is still a node — but cos(k y) changes sign under it,
  // and out of quadrature that sign decides whether this is the deep half of
  // the checkerboard or the shallow one. See `wellDepth`.
  w.phaseY = phaseForNodeAt(w, y + off + (flip ? w.pitch : 0));
  w.aimX = x;
  w.aimY = y;
  w.inverted = invert;
  w.flipped = flip;
}

/** Trap coordinates on one axis, within [0, span). Positive contrast traps at
 *  nodes, negative at antinodes — trapPositions already knows which. */
export function trapsX(w: Wave, p: Particle, span: number): number[] {
  return trapPositions(axisX(w), p, span);
}
export function trapsY(w: Wave, p: Particle, span: number): number[] {
  return trapPositions(axisY(w), p, span);
}

// ── forces ──────────────────────────────────────────────────────────────────

/**
 * Terminal speed of a particle driven by force F, m/s.
 *
 * A cell in a microchannel reaches terminal velocity in well under a
 * microsecond, so there is no inertia in this game and none in the device
 * either. Force over drag coefficient is the velocity, every frame.
 */
export function driftVelocity(forceN: number, radiusM: number, viscosityPaS: number): number {
  return forceN / (6 * Math.PI * viscosityPaS * radiusM);
}

/** Radiation velocity of a particle at (x, y), m/s per axis. Separable, which
 *  is the whole reason crossed waves give a point trap rather than a smear. */
export function velocityAt(
  w: Wave, x: number, y: number, p: Particle,
): { vx: number; vy: number } {
  if (w.amplitude <= 0) return { vx: 0, vy: 0 };
  const amp = localAmplitude(w, x, y);
  if (amp <= 0) return { vx: 0, vy: 0 };
  const mu = viscosity(w.tC);
  const sx = axisX(w, amp), sy = axisY(w, amp);
  let fx = forceAt(sx, x, p), fy = forceAt(sy, y, p);
  const c = crossCoupling(w);
  if (c !== 0) {
    const f = crossForce(sx, sy, x, y, p, c);
    fx += f.x;
    fy += f.y;
  }
  return {
    vx: driftVelocity(fx, p.radius, mu),
    vy: driftVelocity(fy, p.radius, mu),
  };
}

// ── cross-phase ─────────────────────────────────────────────────────────────
//
// THE FIELD WAS NEVER SEPARABLE BY RIGHT; IT WAS SEPARABLE BY TIMING. Two
// orthogonal standing waves at one frequency, the Y pair lagging the X pair by
// phi in time:
//
//     p = A cos(tx) cos(wt) + A cos(ty) cos(wt + phi)
//
// The time averages are
//
//     <p^2>     = (A^2/2) (cos^2 tx + cos^2 ty + 2 cos(phi) cos tx cos ty)
//     rho <v^2> = (kappa A^2/2) (sin^2 tx + sin^2 ty)
//
// and the velocity has NO cross term, because the two waves move the water
// along perpendicular axes and a dot product of perpendicular vectors is zero.
// Substituted into Gor'kov, the separable part is exactly fields.potentialAt
// on each axis, and what is left over is
//
//     U_x(x, y) = (2/3) pi a^3 kappa_f A^2 f1 cos(phi) cos tx cos ty
//
// — the monopole coefficient alone, because only the pressure term crossed.
// At phi = pi/2 it vanishes and the game is exactly the game it was. Away from
// it, two things happen and neither is a tuning:
//
//   NODE-SEEKERS (f1 > 0 and Phi > 0: cells, motifs, the sovereign) find their
//   dots joined into a DIAMOND MESH. cos tx + cos ty = 0 on both diagonal
//   families, so in phase the pressure nodes are lines at 45 degrees and the
//   only thing still corrugating them is the dipole term, f2. For a mammalian
//   cell a well is 0.35 as deep along its diagonal as it was, and 1.65 across.
//
//   ANTINODE-SEEKERS (you, and the vesicles) find theirs split into a
//   checkerboard: half the antinodes deeper by the same 1.65, half shallower by
//   the same 0.35. Which half is under your hand is an IDT setting, so the
//   pilot always takes the deep one — see `aimAt`'s flip.
//
// Both ratios are 1 +- |f1 cos(phi)| / (3 |Phi|). Nothing in them was chosen.

/** cos(phi), and exactly zero at quadrature so the separable path is untouched. */
export function crossCoupling(w: Wave): number {
  return w.cross === QUADRATURE ? 0 : Math.cos(w.cross);
}

/**
 * The cross term's force, N, from the two axes that make it.
 *
 * `c` is cos(phi). The envelope phase convention is fields.ts's — pressure goes
 * as cos(k u + phase) — so the arguments here are the same ones forceAt uses.
 */
export function crossForce(
  sx: StandingWave1D, sy: StandingWave1D, x: number, y: number, p: Particle, c: number,
): { x: number; y: number } {
  const tx = sx.k * x + sx.phase;
  const ty = sy.k * y + sy.phase;
  const amp = sx.amplitude;
  const coef = (2 / 3) * Math.PI * Math.pow(p.radius, 3) * compressibility(sx.medium)
    * amp * amp * f1(p, sx.medium) * c;
  return {
    x: coef * sx.k * Math.sin(tx) * Math.cos(ty),
    y: coef * sy.k * Math.cos(tx) * Math.sin(ty),
  };
}

/** The cross potential, J — for the tests, which differentiate it. */
export function crossPotential(
  sx: StandingWave1D, sy: StandingWave1D, x: number, y: number, p: Particle, c: number,
): number {
  const amp = sx.amplitude;
  return (2 / 3) * Math.PI * Math.pow(p.radius, 3) * compressibility(sx.medium)
    * amp * amp * f1(p, sx.medium) * c
    * Math.cos(sx.k * x + sx.phase) * Math.cos(sy.k * y + sy.phase);
}

/**
 * |f1 cos(phi)| / (3 |Phi|): how far out of quadrature this body can feel.
 *
 * The factor by which the cross term deepens one half of the wells and
 * shallows the other. Infinity for a body with no net contrast and a monopole
 * one — it answers ONLY to the cross term, which is honest and rare.
 */
export function crossReach(w: Wave, p: Particle): number {
  const c = crossCoupling(w);
  if (c === 0) return 0;
  const phi = contrastFactor(p, w.medium);
  const m = Math.abs(f1(p, w.medium) * c);
  return phi === 0 ? (m === 0 ? 0 : Infinity) : m / (3 * Math.abs(phi));
}

/**
 * How deep the well a body is sitting in is, against the same well at
 * quadrature. 1 at quadrature, always.
 *
 * For an antinode-seeker it is the curvature at its own antinode, and which
 * half of the checkerboard it is in is the sign of cos tx cos ty there. For a
 * node-seeker every node is alike and what matters is the SOFT direction — the
 * diagonal it can now slide along — because that is the way it leaves.
 */
export function wellDepth(w: Wave, x: number, y: number, p: Particle): number {
  const c = crossCoupling(w);
  if (c === 0) return 1;
  const phi = contrastFactor(p, w.medium);
  if (phi === 0) return 1;
  const g = (f1(p, w.medium) * c) / (3 * phi);
  if (phi > 0) return Math.max(0, 1 - Math.abs(g));
  const sx = axisX(w), sy = axisY(w);
  const s = Math.cos(sx.k * x + sx.phase) * Math.cos(sy.k * y + sy.phase) < 0 ? -1 : 1;
  return Math.max(0, 1 + g * s);
}

/**
 * Whether the deep half of the checkerboard lies under a cos tx cos ty = +1
 * site, for this body. The pilot asks it to decide `aimAt`'s flip.
 */
export function deepWhereAligned(w: Wave, p: Particle): boolean {
  const c = crossCoupling(w);
  if (c === 0) return true;
  // U_x goes as f1 c cos tx cos ty; the deep sites are where that is NEGATIVE.
  return f1(p, w.medium) * c <= 0;
}

/**
 * How much of a trap's own relaxation time one substep may cover, and the most
 * substeps a single body is worth.
 *
 * The motion is du/dt = A sin(2ku), so near a trap it relaxes at 2k|A| and
 * explicit Euler on it is stable only while dt*2k|A| stays under two. Because A
 * goes as a^2 (trajectory.rateConstant), the bodies that break it are the big
 * ones: at full drive a nineteen-micron sovereign has a relaxation rate of 283
 * per second, so a sixtieth of a second is nearly five time constants in one
 * jump, and the error is multiplied by about four EVERY FRAME. On screen it is
 * a body vibrating in place instead of settling.
 *
 * The count has to come from that rate and not from how far the body is about
 * to travel. Sizing it by displacement looks equivalent and fails in the one
 * place that matters: a body sitting AT its node has no displacement, asks for
 * a single step, and is thrown out of the node it just reached — 0.005 microns
 * off, then 0.03, then 0.6, then ten, over and over.
 */
const SUBSTEP_RELAX = 0.5;
const SUBSTEP_CAP = 64;

/**
 * Move a body through the field for dt, subdividing to keep each step short
 * against the relaxation time of the trap it is falling into.
 *
 * Returns where it ended up and how fast it was going when it got there. A mote
 * costs one evaluation; only what would have rung pays for more.
 */
export function advance(
  w: Wave, x: number, y: number, p: Particle, dt: number,
): { x: number; y: number; vx: number; vy: number } {
  const amp = localAmplitude(w, x, y);
  if (amp <= 0) return { x, y, vx: 0, vy: 0 };

  // Out of quadrature the stiffest well is deeper by 1 + crossReach, and the
  // substep count has to follow the stiffest well, not the average one.
  const rate = 2 * (Math.PI / w.pitch)
    * Math.abs(rateConstant(axisX(w, amp), p, viscosity(w.tC)))
    * (1 + Math.min(8, crossReach(w, p)));
  const n = Math.min(SUBSTEP_CAP, Math.max(1, Math.ceil((rate * dt) / SUBSTEP_RELAX)));
  const h = dt / n;

  let v = velocityAt(w, x, y, p);
  let cx = x;
  let cy = y;
  for (let i = 0; i < n; i++) {
    if (i > 0) v = velocityAt(w, cx, cy, p);
    cx += v.vx * h;
    cy += v.vy * h;
  }
  return { x: cx, y: cy, vx: v.vx, vy: v.vy };
}

/** Peak force in a wave, N — evaluated where sin(2(ku+phase)) = 1 rather than
 *  reimplementing the amplitude, so it tracks fields.forceAt for free. */
export function peakForce(s: StandingWave1D, p: Particle): number {
  return forceAt(s, (Math.PI / 4 - s.phase) / s.k, p);
}

// The reference the streaming constant is pinned against.
const REF_PITCH = 150e-6;
const REF_AMPLITUDE = 2e5;
const REF_WAVE = ssawField(
  { fingerPitch: REF_PITCH, substrate: SUBSTRATE, medium: WATER }, REF_AMPLITUDE,
);
const CROSSOVER_PARTICLE: Particle = { ...MAMMALIAN_CELL, radius: CROSSOVER_RADIUS_ORDER };

/** Streaming speed per squared pressure, (m/s)/Pa^2. See the header. */
const STREAMING_COEFF =
  driftVelocity(peakForce(REF_WAVE, CROSSOVER_PARTICLE), CROSSOVER_RADIUS_ORDER, WATER_VISCOSITY)
  / (REF_AMPLITUDE * REF_AMPLITUDE);

/** Speed of the streaming drift, m/s. Independent of radius: a particle small
 *  enough to be carried is carried at the fluid's own speed. */
export function streamingSpeed(amplitudePa: number): number {
  return STREAMING_COEFF * amplitudePa * amplitudePa;
}

/**
 * How firmly the field owns a particle of this radius, against streaming.
 *
 * One at the crossover, four at twice it, a quarter at half — the a^2 law out
 * of gorkov.streamingRatioScaling. Reported to the player as the number that
 * decides whether a motif is worth chasing at all.
 */
export function authority(radiusM: number): number {
  return streamingRatioScaling(radiusM, CROSSOVER_RADIUS_ORDER);
}

/** Contrast factor, for the HUD. Its sign is which lattice a motif answers to. */
export function contrast(p: Particle, med: Medium = WATER): number {
  return contrastFactor(p, med);
}

// ── grip ────────────────────────────────────────────────────────────────────

/**
 * Advance the drive and the stamina behind it by dt.
 *
 * Returns the amplitude actually reached. Grip is refused outright while spent,
 * and stays refused until stamina is back over a quarter — a cooldown rather
 * than a flicker, so running out is a mistake with a consequence you can feel
 * instead of a stutter you fight.
 */
export function grip(w: Wave, held: boolean, dt: number): number {
  if (w.spent && w.stamina > STAMINA_MAX * 0.25) w.spent = false;
  const want = held && !w.spent ? w.maxAmplitude : 0;

  if (w.amplitude < want) w.amplitude = Math.min(want, w.amplitude + GRIP_RISE * dt);
  else if (w.amplitude > want) w.amplitude = Math.max(want, w.amplitude - GRIP_FALL * dt);

  // Recovery follows INTENT, not the residual drive.
  //
  // Draining on `amplitude > 0` instead looks equivalent and is a starvation
  // trap: releasing leaves a third of a second of ramp-down still costing
  // stamina, so anything that lets go and grips again near its own threshold
  // spends its whole life in the decay tail and never recovers a point. A bot
  // playing at the edge of its stamina sat pinned at 22 of 100 until it was
  // eaten. The ramp is still real and still costs while you are holding; the
  // moment you stop asking, you start getting it back.
  const f = w.amplitude / w.maxAmplitude;
  if (want > 0) {
    w.stamina -= STAMINA_DRAIN * f * f * dt;
    if (w.stamina <= 0) { w.stamina = 0; w.spent = true; }
  } else {
    w.stamina = Math.min(STAMINA_MAX, w.stamina + STAMINA_REGEN * dt);
  }
  return w.amplitude;
}
