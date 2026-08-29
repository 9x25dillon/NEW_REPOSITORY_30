import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  MAMMALIAN_CELL, WATER, compressibility, contrastFactor, type Medium, type Particle,
} from "../src/gorkov.js";
import { bawField } from "../src/fields.js";
import { WATER_VISCOSITY, positionAt } from "../src/trajectory.js";
import {
  POLYSTYRENE, amplitudeFromTrack, contrastFromTrack, isoAcousticDensity,
  propertiesFromContrasts, type ContrastMeasurement, type Track,
} from "../src/inversion.js";

const near = (a: number, b: number, eps: number, what = "") =>
  assert.ok(Math.abs(a - b) < eps, `${what} ${a} !~ ${b} (rel ${Math.abs((a - b) / b)})`);

const FIELD = bawField({ width: 375e-6, mode: 1, medium: WATER }, 1e5);
const QUARTER = Math.PI / (2 * FIELD.k);

// ── The round trip: forward model in, same numbers out ──────────────────────

test("a tracked focusing event recovers the contrast factor it was generated from", () => {
  // Synthesise the exact trajectory of a cell whose Phi we know, then fit it
  // back. Anything other than an exact recovery means the fit and the forward
  // model disagree about the same physics.
  const truth = contrastFactor(MAMMALIAN_CELL, WATER);
  const u0 = QUARTER * 0.12;
  const track: Track[] = [];
  for (let i = 0; i <= 40; i++) {
    const t = (i / 40) * 4;
    track.push({ t, u: positionAt(FIELD, u0, t, MAMMALIAN_CELL) });
  }
  const fit = contrastFromTrack(track, FIELD, MAMMALIAN_CELL.radius);
  near(fit.phi, truth, Math.abs(truth) * 1e-9, "recovered Phi");
  near(fit.r2, 1, 1e-12, "a noiseless track must fit perfectly");
  assert.ok(fit.used >= 3);
});

test("the fit survives noise and reports it honestly in r-squared", () => {
  const truth = contrastFactor(MAMMALIAN_CELL, WATER);
  const u0 = QUARTER * 0.12;
  // Deterministic pseudo-noise: half a micron of tracking jitter, which is
  // about what a microscope gives on a 15 um cell.
  let seed = 7;
  const jitter = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return ((seed / 2147483648) - 0.5) * 1e-6;
  };
  const track: Track[] = [];
  for (let i = 0; i <= 60; i++) {
    const t = (i / 60) * 4;
    track.push({ t, u: positionAt(FIELD, u0, t, MAMMALIAN_CELL) + jitter() });
  }
  const fit = contrastFromTrack(track, FIELD, MAMMALIAN_CELL.radius);
  near(fit.phi, truth, Math.abs(truth) * 0.05, "Phi under noise");
  assert.ok(fit.r2 > 0.98 && fit.r2 < 1, `r2 ${fit.r2} should be high but not perfect`);
});

test("points at the equilibria are dropped, not fitted", () => {
  // tan is zero at the antinode and divergent at the node; both are features of
  // the coordinate, not data. A run that is ENTIRELY parked at the node has
  // nothing to fit and must say so rather than returning a number.
  const parked: Track[] = Array.from({ length: 20 }, (_, i) => ({
    t: i * 0.1, u: QUARTER * 0.999,
  }));
  assert.throws(() => contrastFromTrack(parked, FIELD, 7.5e-6), /at least 3/);
  const atWall: Track[] = Array.from({ length: 20 }, (_, i) => ({ t: i * 0.1, u: 0 }));
  assert.throws(() => contrastFromTrack(atWall, FIELD, 7.5e-6), /antinode/);
});

// ── Two unknowns need two media ─────────────────────────────────────────────

const media = (rho: number): Medium => ({ rho, c: 1500 });

/** Contrast this cell would actually show in a given medium — the forward model
 *  used to generate synthetic measurements with a known answer. */
const measure = (p: Particle, m: Medium, label: string): ContrastMeasurement =>
  ({ medium: m, phi: contrastFactor(p, m), label });

test("density and compressibility come back exactly from three media", () => {
  const truth: Particle = { radius: 7.5e-6, rho: 1068, c: 1544 };
  const found = propertiesFromContrasts([
    measure(truth, media(1000), "PBS"),
    measure(truth, media(1060), "iodixanol 12%"),
    measure(truth, media(1120), "iodixanol 24%"),
  ]);
  near(found.rho, truth.rho, 0.5, "density");
  near(found.kappa, compressibility(truth), compressibility(truth) * 1e-4, "compressibility");
  near(found.c, truth.c, 1, "implied sound speed");
  assert.ok(found.residual < 1e-9, `residual ${found.residual} should vanish for exact input`);
});

test("two media are enough; one is refused rather than guessed at", () => {
  const truth: Particle = { radius: 7.5e-6, rho: 1090, c: 1520 };
  const two = propertiesFromContrasts([
    measure(truth, media(1000), "a"),
    measure(truth, media(1100), "b"),
  ]);
  near(two.rho, truth.rho, 0.5);
  near(two.c, truth.c, 1);

  // One measurement constrains a curve and pins neither coordinate.
  assert.throws(
    () => propertiesFromContrasts([measure(truth, media(1000), "a")]),
    /at least two media/,
  );
  // and two media of the SAME density are the same equation twice
  assert.throws(
    () => propertiesFromContrasts([
      measure(truth, { rho: 1000, c: 1500 }, "a"),
      measure(truth, { rho: 1000, c: 1502 }, "b"),
    ]),
    /differ in DENSITY/,
  );
});

test("inconsistent measurements raise the residual instead of being averaged away", () => {
  const truth: Particle = { radius: 7.5e-6, rho: 1068, c: 1544 };
  const good = [
    measure(truth, media(1000), "a"),
    measure(truth, media(1060), "b"),
    measure(truth, media(1120), "c"),
  ];
  const clean = propertiesFromContrasts(good);
  // corrupt one point by 10 per cent, as a mistracked cell would
  const dirty = propertiesFromContrasts([
    good[0], { ...good[1], phi: good[1].phi * 1.1 }, good[2],
  ]);
  assert.ok(dirty.residual > clean.residual * 100,
    `residual must react to a bad point: ${clean.residual} -> ${dirty.residual}`);
});

// ── The iso-acoustic point ──────────────────────────────────────────────────

test("a cell's iso-acoustic density is where its contrast crosses zero", () => {
  const iso = isoAcousticDensity(MAMMALIAN_CELL, 1500)!;
  assert.ok(iso !== null);
  // by construction, contrast vanishes there
  near(contrastFactor(MAMMALIAN_CELL, { rho: iso, c: 1500 }), 0, 1e-9, "contrast at iso point");
  // and it is above water, since the cell is denser and stiffer than water
  assert.ok(iso > WATER.rho, `iso point ${iso} should exceed water`);
  // either side of it the cell goes opposite ways — the whole basis of a
  // density-tuned separation
  assert.ok(contrastFactor(MAMMALIAN_CELL, { rho: iso - 20, c: 1500 }) > 0);
  assert.ok(contrastFactor(MAMMALIAN_CELL, { rho: iso + 20, c: 1500 }) < 0);
});

test("no crossing in range is reported as none, not as an edge of the bracket", () => {
  const dense: Particle = { radius: 5e-6, rho: 2500, c: 3000 };
  assert.equal(isoAcousticDensity(dense, 1500, { lo: 950, hi: 1250 }), null);
});

// ── End to end ──────────────────────────────────────────────────────────────

test("tracks in three media give back the cell that produced them", () => {
  // The whole protocol, simulated: focus the same cell in three media, track
  // each run, fit each contrast, intersect. This is what a bench session
  // produces and what the config file is waiting for.
  const truth: Particle = { radius: 8.2e-6, rho: 1075, c: 1535 };
  const measurements: ContrastMeasurement[] = [];
  for (const rho of [1000, 1055, 1115]) {
    const med = media(rho);
    const field = bawField({ width: 375e-6, mode: 1, medium: med }, 1e5);
    const q = Math.PI / (2 * field.k);
    const track: Track[] = [];
    for (let i = 0; i <= 50; i++) {
      const t = (i / 50) * 6;
      track.push({ t, u: positionAt(field, q * 0.15, t, truth, WATER_VISCOSITY) });
    }
    const fit = contrastFromTrack(track, field, truth.radius);
    measurements.push({ medium: med, phi: fit.phi, label: `rho=${rho}` });
  }
  const found = propertiesFromContrasts(measurements);
  near(found.rho, truth.rho, 1, "density from tracks");
  near(found.c, truth.c, 2, "sound speed from tracks");
  assert.ok(found.residual < 1e-6);
});

// ── Calibration ─────────────────────────────────────────────────────────────

test("beads of known contrast recover the pressure amplitude that drove them", () => {
  // The step that makes the protocol executable: p_a inside a resonating
  // channel cannot be read off a signal generator, so it is measured with a
  // particle whose properties are already known.
  const truthAmplitude = 4.2e5;
  const field = bawField({ width: 375e-6, mode: 1, medium: WATER }, truthAmplitude);
  const bead: Particle = { ...POLYSTYRENE, radius: 5e-6 };
  const q = Math.PI / (2 * field.k);
  const track: Track[] = [];
  for (let i = 0; i <= 40; i++) {
    const t = (i / 40) * 0.35;
    track.push({ t, u: positionAt(field, q * 0.12, t, bead) });
  }
  const { amplitude, r2 } = amplitudeFromTrack(track, field, bead);
  near(amplitude, truthAmplitude, truthAmplitude * 1e-6, "calibrated amplitude");
  near(r2, 1, 1e-12);

  // and the calibrated amplitude then yields the right contrast for a cell
  // measured in the same chip
  const cellField = { ...field, amplitude };
  const cellTrack: Track[] = [];
  for (let i = 0; i <= 40; i++) {
    const t = (i / 40) * 0.6;
    cellTrack.push({ t, u: positionAt(field, q * 0.12, t, MAMMALIAN_CELL) });
  }
  const fit = contrastFromTrack(cellTrack, cellField, MAMMALIAN_CELL.radius);
  near(fit.phi, contrastFactor(MAMMALIAN_CELL, WATER),
       Math.abs(contrastFactor(MAMMALIAN_CELL, WATER)) * 1e-6, "cell contrast");
});

test("a reference at its own iso-acoustic point cannot calibrate anything", () => {
  const iso = isoAcousticDensity(MAMMALIAN_CELL, 1500)!;
  const med: Medium = { rho: iso, c: 1500 };
  const field = bawField({ width: 375e-6, mode: 1, medium: med }, 1e5);
  const q = Math.PI / (2 * field.k);
  const track: Track[] = Array.from({ length: 20 }, (_, i) => ({
    t: i * 0.05, u: q * (0.2 + 0.01 * i),
  }));
  // The guard has to be a THRESHOLD: bisection leaves Phi at about 1e-17 here,
  // which is not zero, so an equality check would let it through and return an
  // amplitude inflated by sixteen orders of magnitude.
  assert.ok(Math.abs(contrastFactor(MAMMALIAN_CELL, med)) > 0,
    "the iso point is a bisected root, not an exact zero");
  assert.throws(() => amplitudeFromTrack(track, field, MAMMALIAN_CELL),
    /below the usable minimum/);
});
