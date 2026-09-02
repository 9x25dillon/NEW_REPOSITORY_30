import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  AMBIENT_C, COOLING, HEATING, MAX_C,
  atTemperature, density, soundSpeed, step as warm, viscosity,
} from "../game/thermal.js";
import { WATER } from "../src/gorkov.js";
import { WATER_VISCOSITY } from "../src/trajectory.js";
import { STREAM_C } from "../game/streams.js";
import { MAX_AMPLITUDE, startRun, step, waterAt } from "../game/run.js";
import { CRUISE_AMPLITUDE } from "../game/pilot.js";

const DT = 1 / 60;
const IDLE = { move: { x: 0, y: 0 }, grip: false, dash: false };
const GRIP = { move: { x: 0, y: 0 }, grip: true, dash: false };

// ── it is the same water the rest of the repository is talking about ────────

test("the standard fits land on the constants this repo already pinned", () => {
  // THE CHECK THAT MAKES THIS PHYSICS RATHER THAN CURVES. Marczak for sound
  // speed, Kell for density and Vogel for viscosity were fitted to water by
  // other people for other reasons. src/gorkov.ts and src/trajectory.ts pinned
  // their three numbers independently and long before this file existed. They
  // agree, and if they ever stop agreeing then one of the two is wrong about
  // what fluid this game happens in.
  assert.ok(Math.abs(soundSpeed(AMBIENT_C) - WATER.c) < 1,
    `c(25) = ${soundSpeed(AMBIENT_C).toFixed(1)} against gorkov's ${WATER.c}`);
  assert.ok(Math.abs(density(AMBIENT_C) - WATER.rho) < 1,
    `rho(25) = ${density(AMBIENT_C).toFixed(1)} against gorkov's ${WATER.rho}`);
  assert.ok(Math.abs(viscosity(AMBIENT_C) - WATER_VISCOSITY) / WATER_VISCOSITY < 0.01,
    `mu(25) = ${viscosity(AMBIENT_C).toExponential(3)} against trajectory's `
    + `${WATER_VISCOSITY.toExponential(3)}`);
});

test("hot water is thin water, and that is the effect that matters", () => {
  // Viscosity roughly halves over the range, and every speed in this game is a
  // force divided by a drag — so heating the water SPEEDS THE GAME UP. That is
  // the opposite of what anyone guesses and it is why it is worth having.
  assert.ok(viscosity(65) < viscosity(25) / 1.9,
    `viscosity should roughly halve by 65 C (x${(viscosity(65) / viscosity(25)).toFixed(2)})`);
  for (let t = AMBIENT_C; t < MAX_C; t += 5) {
    assert.ok(viscosity(t + 5) < viscosity(t), "and it falls the whole way, monotonically");
  }

  // Sound speed rises, on the same axis that separates the three co-flowing
  // waters — so heating carries you a fraction of the way into the next one.
  const rise = soundSpeed(MAX_C) - soundSpeed(AMBIENT_C);
  assert.ok(rise > 0, "sound speed rises with temperature");
  assert.ok(rise > STREAM_C * 0.15 && rise < STREAM_C * 0.5,
    `and it is a real fraction of a stream, but not a whole one `
    + `(${rise.toFixed(0)} m/s against ${STREAM_C})`);
});

test("it stops at the turnover rather than running past it", () => {
  // Water's sound speed peaks near 74 C and falls after. Past there, heating
  // would start SLOWING sound down and the whole story would reverse for a
  // reason that is an artefact of the fit's range rather than anything a player
  // could reason about.
  assert.ok(soundSpeed(MAX_C) > soundSpeed(MAX_C - 5), "still rising at the cap");
  assert.ok(soundSpeed(MAX_C + 8) < soundSpeed(MAX_C), "and turning over just past it");
  let t = AMBIENT_C;
  for (let i = 0; i < 60 * 600; i++) t = warm(t, MAX_AMPLITUDE, MAX_AMPLITUDE, CRUISE_AMPLITUDE, DT);
  assert.ok(t <= MAX_C + 1e-9, `ten minutes of full drive cannot pass it (${t.toFixed(1)} C)`);
});

// ── and the drive is what raises it ─────────────────────────────────────────

test("only what you ask for over the continuous rating heats it", () => {
  // pilot.ts: "AN AMPLIFIER WILL GIVE YOU MORE THAN IT CAN SUSTAIN, FOR A
  // MOMENT". A device is specified and cooled for its rated duty and cruise is
  // that duty. Counting cruise as heat put the resting temperature at 38 C,
  // which would mean the game never once ran at the 25 C every number in this
  // repository was derived at — a silent twenty per cent speed-up applied to
  // everything, forever, as a side effect of adding a thermometer.
  let cruising = AMBIENT_C;
  for (let i = 0; i < 60 * 300; i++) {
    cruising = warm(cruising, MAX_AMPLITUDE * CRUISE_AMPLITUDE, MAX_AMPLITUDE, CRUISE_AMPLITUDE, DT);
  }
  assert.ok(Math.abs(cruising - AMBIENT_C) < 0.01,
    `five minutes of cruising leaves the water where the tuning assumed it `
    + `(${cruising.toFixed(2)} C)`);

  let gripping = AMBIENT_C;
  for (let i = 0; i < 60 * 10; i++) {
    gripping = warm(gripping, MAX_AMPLITUDE, MAX_AMPLITUDE, CRUISE_AMPLITUDE, DT);
  }
  assert.ok(gripping > AMBIENT_C + 10, `ten seconds of full grip is felt (${gripping.toFixed(1)} C)`);
});

test("the glass takes it back, but not as fast as you can let go", () => {
  // The lag IS the tactical cost. If it cooled the instant you opened your hand
  // there would be nothing to think about.
  let t = AMBIENT_C;
  for (let i = 0; i < 60 * 20; i++) t = warm(t, MAX_AMPLITUDE, MAX_AMPLITUDE, CRUISE_AMPLITUDE, DT);
  const hot = t;
  assert.ok(hot > 40, `twenty seconds of grip gets it properly hot (${hot.toFixed(1)} C)`);

  for (let i = 0; i < 60 * 5; i++) t = warm(t, 0, MAX_AMPLITUDE, CRUISE_AMPLITUDE, DT);
  assert.ok(t < hot, "it cools once you stop");
  assert.ok(t > AMBIENT_C + (hot - AMBIENT_C) * 0.5,
    `but five seconds of hands-open is nowhere near back (${t.toFixed(1)} C from ${hot.toFixed(1)})`);

  for (let i = 0; i < 60 * 200; i++) t = warm(t, 0, MAX_AMPLITUDE, CRUISE_AMPLITUDE, DT);
  assert.ok(t < AMBIENT_C + 0.5, `and it does get all the way back (${t.toFixed(2)} C)`);
  assert.ok(HEATING > 0 && COOLING > 0);
});

// ── everything downstream inherits it without being told ───────────────────

test("a warmed world is a different water, and nothing had to be wired for it", () => {
  // atTemperature is a SHIFT, so a hot cubic water is still recognisably the
  // cubic water — and `waterAt` is the one place it is applied, which is why
  // the contrast factor of every body, the trap, and the band gap all move
  // without any of them mentioning temperature.
  const run = startRun(4);
  const cold = waterAt(run, run.you.y);
  for (let i = 0; i < 60 * 20; i++) { step(run, GRIP, DT); run.events.length = 0; }

  assert.ok(run.wave.tC > AMBIENT_C + 5, `gripping warmed the water (${run.wave.tC.toFixed(1)} C)`);
  const hot = waterAt(run, run.you.y);
  assert.ok(hot.c > cold.c, "the water it is standing in is faster");
  assert.ok(hot.rho < cold.rho, "and thinner");

  // The world's own identity survives it: the shift is what temperature does to
  // water, not a replacement by water.
  const shifted = atTemperature(run.world.medium, 60);
  assert.ok(Math.abs((shifted.c - run.world.medium.c) - (soundSpeed(60) - soundSpeed(AMBIENT_C))) < 1e-9,
    "a world's medium moves by exactly what water moves by");

  for (let i = 0; i < 60 * 200; i++) { step(run, IDLE, DT); run.events.length = 0; }
  assert.ok(run.wave.tC < AMBIENT_C + 1, `and a run left alone comes back to ambient (${run.wave.tC.toFixed(1)} C)`);
});
