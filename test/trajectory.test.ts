import { strict as assert } from "node:assert";
import { test } from "node:test";
import { LIPID_DROPLET, MAMMALIAN_CELL, WATER } from "../src/gorkov.ts";
import {
  SAW_SUBSTRATES, bawField, energyDensity as energyDensityOf,
  envelopePhaseForIdt, ssawField, ssawNodeShift, trapPositions,
} from "../src/fields.ts";
import {
  WATER_VISCOSITY, focusTime, integrate, maxSweepSpeed, positionAt,
  rateConstant, timeBetween, velocityAt,
} from "../src/trajectory.ts";

const near = (a: number, b: number, eps: number, what = "") =>
  assert.ok(Math.abs(a - b) < eps, `${what} ${a} !~ ${b} (d=${Math.abs(a - b)})`);

const CHANNEL = { width: 375e-6, mode: 1, medium: WATER };
const FIELD = bawField(CHANNEL, 1e5);
const QUARTER = Math.PI / (2 * FIELD.k); // the node, measured from a wall

// ── The closed form is the referee ──────────────────────────────────────────

test("RK4 agrees with the analytic solution, and converges at fourth order", () => {
  // Checking an integrator against a finer version of itself only proves it is
  // self-consistent. tan(k u) = tan(k u0) exp(2kAt) is exact, so it can catch a
  // scheme that converges smoothly to the wrong answer.
  const u0 = QUARTER * 0.2;
  // The window has to be comparable to the dynamics or this measures nothing.
  // At 1 bar the rate 2kA is 0.60/s, a 1.7 s timescale; the first version of
  // this test integrated 0.05 s, both step counts converged to machine
  // precision, and the "error ratio" was pure floating-point noise — a test
  // that would have passed an integrator with the wrong coefficients.
  const T = 2;
  const exact = positionAt(FIELD, u0, T, MAMMALIAN_CELL);

  const errAt = (steps: number) => {
    const path = integrate(FIELD, u0, MAMMALIAN_CELL, { duration: T, steps });
    return Math.abs(path[path.length - 1].u - exact);
  };
  const coarse = errAt(20);
  const fine = errAt(40);
  assert.ok(fine < coarse, `halving the step must reduce the error (${coarse} -> ${fine})`);
  // fourth order: halving the step should cut the error by about sixteen
  const ratio = coarse / fine;
  assert.ok(ratio > 8, `convergence ratio ${ratio} is below fourth order`);
  assert.ok(errAt(2000) < QUARTER * 1e-6, "should land well inside a part per million");
});

test("the analytic trajectory lands on the node and never overshoots it", () => {
  const u0 = QUARTER * 0.1;
  let prev = u0;
  for (const t of [1e-3, 1e-2, 0.1, 1, 10, 100]) {
    const u = positionAt(FIELD, u0, t, MAMMALIAN_CELL);
    assert.ok(u > prev - 1e-15, `must move monotonically toward the node at t=${t}`);
    assert.ok(u <= QUARTER + 1e-15, `overshot the node at t=${t}: ${u}`);
    prev = u;
  }
  near(positionAt(FIELD, u0, 1e6, MAMMALIAN_CELL), QUARTER, 1e-12, "limit");
  // and the node the trajectory finds is the one the field advertises
  near(trapPositions(FIELD, MAMMALIAN_CELL, CHANNEL.width)[0], QUARTER, 1e-12);
});

test("the antinode is an equilibrium — unstable, but exactly stationary", () => {
  // u0 = 0 gives tan(k u0) = 0, so the closed form is stationary for all time.
  for (const t of [0, 1e-3, 1, 1e6]) {
    assert.equal(positionAt(FIELD, 0, t, MAMMALIAN_CELL), 0, `t=${t}`);
  }
  near(velocityAt(FIELD, 0, MAMMALIAN_CELL), 0, 1e-24);
  // but a hair off it, the cell leaves and does not come back
  const nudged = positionAt(FIELD, QUARTER * 1e-4, 0.5, MAMMALIAN_CELL);
  assert.ok(nudged > QUARTER * 1e-4, "an unstable equilibrium must shed a perturbation");
});

test("a lipid droplet runs the trajectory backwards, to the antinode", () => {
  assert.ok(rateConstant(FIELD, MAMMALIAN_CELL) > 0);
  assert.ok(rateConstant(FIELD, LIPID_DROPLET) < 0, "negative contrast reverses the flow");
  const u0 = QUARTER * 0.8;
  assert.ok(positionAt(FIELD, u0, 0.5, LIPID_DROPLET) < u0, "should fall toward the wall");
  assert.ok(positionAt(FIELD, u0, 0.5, MAMMALIAN_CELL) > u0, "should rise toward the node");
  near(positionAt(FIELD, u0, 1e6, LIPID_DROPLET), 0, 1e-12, "antinode limit");
});

// ── Focusing time ───────────────────────────────────────────────────────────

test("focusing is exponential, so it is quoted to a fraction and never to the node", () => {
  const u0 = QUARTER * 0.05;
  assert.equal(timeBetween(FIELD, u0, QUARTER, MAMMALIAN_CELL), Infinity,
    "arriving AT the node takes forever — the approach is exponential");

  const t95 = focusTime(FIELD, u0, MAMMALIAN_CELL, 0.95);
  assert.ok(Number.isFinite(t95) && t95 > 0);
  // and each further 95% of the remaining gap costs about the same again
  const t99 = focusTime(FIELD, u0, MAMMALIAN_CELL, 0.99);
  assert.ok(t99 > t95, "a tighter tolerance must cost more time");

  // the closed form and the definition agree
  const landed = positionAt(FIELD, u0, t95, MAMMALIAN_CELL);
  near(landed, u0 + (QUARTER - u0) * 0.95, QUARTER * 1e-9, "95% of the way");
});

test("focusing time scales as 1/a^2 and 1/amplitude^2", () => {
  const u0 = QUARTER * 0.1;
  const base = focusTime(FIELD, u0, MAMMALIAN_CELL);
  const bigger = focusTime(FIELD, u0, { ...MAMMALIAN_CELL, radius: 15e-6 });
  near(base / bigger, 4, 1e-6, "doubling the radius should quarter the time");

  const louder = focusTime({ ...FIELD, amplitude: 2e5 }, u0, MAMMALIAN_CELL);
  near(base / louder, 4, 1e-6, "doubling the pressure should quarter the time");

  // Sanity against the literature, at a drive a real device actually runs.
  // FIELD is 1e5 Pa, which is only ~1.1 J/m3 of acoustic energy density; BAW
  // focusing papers report tens to hundreds. At 50 J/m3 a 15 um cell should
  // focus in tens of milliseconds, and that is the number to check — the first
  // version of this test asserted sub-second at 1 bar and failed on a correct
  // 1.9 s, which was the drive being weak rather than the physics being wrong.
  const loud = { ...FIELD, amplitude: 6.685e5 }; // ~50 J/m3 in water
  near(energyDensityOf(loud), 50, 0.5, "energy density");
  const fast = focusTime(loud, u0, { ...MAMMALIAN_CELL, radius: 15e-6 });
  assert.ok(fast < 0.1, `${fast} s is too slow for a 50 J/m3 device`);
  assert.ok(fast > 1e-3, `${fast} s is implausibly fast`);
});

// ── The swept SSAW: where the closed form stops applying ────────────────────

test("a swept SSAW carries a cell along with its node", () => {
  const d = { fingerPitch: 50e-6, substrate: SAW_SUBSTRATES[0], medium: WATER };
  const field = ssawField(d, 1.5e5);
  const spacing = field.wavelength / 2;
  const start = trapPositions(field, MAMMALIAN_CELL, field.wavelength)[0];

  // Sweep the IDT phase through a full turn, slowly enough that the trap holds.
  // Going through envelopePhaseForIdt rather than negating and halving by hand:
  // the two conventions differ by a factor of MINUS TWO, and the first version
  // of this test swept the envelope while reasoning about the IDT, predicting
  // half the distance it then correctly travelled.
  const duration = 2;
  const sweep = (t: number) => envelopePhaseForIdt(2 * Math.PI * (t / duration));
  const path = integrate(field, start, MAMMALIAN_CELL,
    { duration, steps: 4000, phaseOfTime: sweep });

  const travelled = path[path.length - 1].u - start;
  // A full 2*pi of IDT phase moves the pattern by exactly one node spacing.
  near(travelled, spacing, spacing * 0.02, "cell should ride the node");
  near(ssawNodeShift(d, 2 * Math.PI), spacing, 1e-15, "and the identity agrees");
  // and it went monotonically, without slipping backwards into the next trap
  for (let i = 1; i < path.length; i++) {
    assert.ok(path[i].u >= path[i - 1].u - 1e-12, `slipped back at step ${i}`);
  }
});

test("sweeping faster than the trap can pull leaves the cell behind", () => {
  const d = { fingerPitch: 50e-6, substrate: SAW_SUBSTRATES[0], medium: WATER };
  const field = ssawField(d, 1.5e5);
  const vMax = maxSweepSpeed(field, MAMMALIAN_CELL);
  assert.ok(vMax > 0 && Number.isFinite(vMax));

  const start = trapPositions(field, MAMMALIAN_CELL, field.wavelength)[0];
  const duration = 0.02;
  // Drive the pattern at fifty times the strongest pull the trap can manage.
  const tooFast = (t: number) =>
    -2 * field.k * (50 * vMax) * t;
  const path = integrate(field, start, MAMMALIAN_CELL,
    { duration, steps: 8000, phaseOfTime: tooFast });

  const patternMoved = 50 * vMax * duration;
  const cellMoved = Math.abs(path[path.length - 1].u - start);
  assert.ok(cellMoved < patternMoved * 0.1,
    `cell kept up (${cellMoved} of ${patternMoved}) — it should have slipped`);
});

test("the drag coefficient is the only place viscosity enters the motion", () => {
  const u = QUARTER * 0.3;
  const a = velocityAt(FIELD, u, MAMMALIAN_CELL, WATER_VISCOSITY);
  const b = velocityAt(FIELD, u, MAMMALIAN_CELL, 2 * WATER_VISCOSITY);
  near(a / b, 2, 1e-9, "twice the viscosity, half the speed — exactly");
  // and it does not touch where the cell ends up, only how long it takes
  near(positionAt(FIELD, u, 1e6, MAMMALIAN_CELL, WATER_VISCOSITY),
       positionAt(FIELD, u, 1e6, MAMMALIAN_CELL, 5 * WATER_VISCOSITY), 1e-12);
});
