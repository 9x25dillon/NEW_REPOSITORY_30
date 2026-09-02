// game/thermal.ts — the water has a temperature, and your drive is what raises it.
//
// EVERY NUMBER IN THIS GAME WAS DERIVED AT 25 C. src/gorkov.ts says so in the
// definition of a medium — "Water at 25 C: 997, 1497" — and src/trajectory.ts
// pins a viscosity there and then takes it as a PARAMETER it was never once
// given anything but the default. The instrument has been ready for this the
// whole time; nothing here is a new mechanism, it is the temperature that was
// always being assumed and never tracked.
//
// WHY A DEVICE HEATS. Acoustofluidic chips warm up. It is a well-known nuisance
// rather than an exotic effect: the transducer dissipates most of what it is
// fed, the fluid absorbs a little more, and a channel run continuously climbs
// tens of degrees in tens of seconds unless somebody actively cools it. Papers
// on this exist because it ruins experiments — the resonance drifts and the
// trapping degrades while you watch.
//
// AND WHAT THAT DOES, ALL OF IT ALREADY WIRED SOMEWHERE:
//
//   VISCOSITY HALVES between 25 C and 65 C. That is the big one and it is not
//   close. Drag is what every trap in this game is fighting: sweep speed goes
//   as 1/mu, so hot water is THIN water and everything standing in it moves
//   faster — you, the things hunting you, the streaming off the chip. Heating
//   the water does not slow the game down. It speeds it up, which is the
//   opposite of what you would guess and is why it is worth having.
//
//   SOUND SPEED RISES about 58 m/s over that range. The three co-flowing waters
//   in streams.ts are 230 m/s apart, so heating carries you a quarter of the
//   way into the next water along exactly the axis that already separates them.
//   A contrast factor is made of rho and c, so what you can hold shifts with it.
//
//   THE RAYLEIGH ANGLE OPENS. src/fields.ts: sin(theta) = c_fluid / c_SAW, and
//   it throws when there is no real angle left because the device would simply
//   not couple. Water tops out near 1555 m/s against 3990 for the substrate, so
//   that refusal is not reachable by heating alone — but the angle moves, and
//   the instrument was already written to say when it stops making sense.
//
// The relations below are the standard fits for pure water, not curves shaped
// to feel good. Only the heating rate is a declared game constant, and it says
// so where it is defined.

import { type Medium } from "../src/gorkov.js";

/** The temperature everything in this repository was derived at, degrees C. */
export const AMBIENT_C = 25;

/**
 * Speed of sound in pure water, m/s, against temperature in degrees C.
 *
 * Marczak (1997), the standard fifth-order fit over 0-95 C. At 25 it returns
 * 1496.7, which is the 1497 gorkov.ts quotes; that agreement is the check that
 * this is the same water the rest of the repository is talking about.
 */
export function soundSpeed(tC: number): number {
  const t = tC;
  return 1.402385e3
    + 5.038813 * t
    - 5.799136e-2 * t * t
    + 3.287156e-4 * t * t * t
    - 1.398845e-6 * t * t * t * t
    + 2.787860e-9 * t * t * t * t * t;
}

/**
 * Density of pure water, kg/m^3, against temperature in degrees C.
 *
 * Kell's fit. At 25 it returns 997.0, which is gorkov.ts's 997.
 */
export function density(tC: number): number {
  const t = tC;
  const num = 999.83952
    + 16.945176 * t
    - 7.9870401e-3 * t * t
    - 46.170461e-6 * t * t * t
    + 105.56302e-9 * t * t * t * t
    - 280.54253e-12 * t * t * t * t * t;
  return num / (1 + 16.87985e-3 * t);
}

/**
 * Dynamic viscosity of pure water, Pa·s, against temperature in degrees C.
 *
 * The Vogel form, mu = 2.414e-5 * 10^(247.8/(T-140)) with T in kelvin. At 25 it
 * returns 8.9e-4, which is src/trajectory.ts's WATER_VISCOSITY.
 *
 * THIS IS THE ONE THAT MATTERS. It falls by half from 25 C to 65 C, and every
 * speed in this game is a force divided by a drag.
 */
export function viscosity(tC: number): number {
  return 2.414e-5 * Math.pow(10, 247.8 / (tC + 273.15 - 140));
}

/**
 * How hot the water is allowed to get, degrees C.
 *
 * Not a safety rail — it is where water stops behaving like the thing these
 * fits describe. They are quoted to 95 C and the sound speed turns over near
 * 74; past that, heating the water would start SLOWING sound down and the whole
 * story here would reverse for a reason that is an artefact of the range rather
 * than anything a player could reason about. It stops at the turnover.
 */
export const MAX_C = 74;

/**
 * How fast the drive heats the water, degrees per second at full amplitude.
 *
 * DECLARED GAME CONSTANT, and the only one in this file. Bulk absorption in a
 * channel this size is worth well under a millikelvin a second — the heat in a
 * real device comes from the transducer, which is a property of a piece of
 * hardware nobody here has specified rather than of the water. Inventing an
 * absorption coefficient to launder that through would be dressing a choice up
 * as a measurement, which src/gorkov.ts explicitly refuses to do elsewhere.
 *
 * So this is chosen against an OBSERVABLE instead, and the observable is the
 * literature's: a continuously driven chip climbs tens of degrees in tens of
 * seconds. At full grip this gives about 2 K/s, so the 49 K to the turnover is
 * half a minute of holding on — far longer than the six seconds of stamina a
 * grip actually lasts. That is the point. Stamina is the fast meter and you
 * feel it every few seconds; this is the slow one, it accumulates across a
 * whole fight, and it is still climbing after you think you have stopped.
 *
 * It goes as amplitude SQUARED because deposited power does — the same p^2 the
 * stamina cost and the streaming speed already go as.
 *
 * ONLY WHAT YOU ASK FOR OVER THE CONTINUOUS RATING HEATS IT, which is the
 * distinction pilot.ts already makes: "AN AMPLIFIER WILL GIVE YOU MORE THAN IT
 * CAN SUSTAIN, FOR A MOMENT". A device is specified and cooled for its rated
 * duty, and cruise is that duty. Counting cruise as heat instead put the
 * equilibrium at 38 C, which would mean the game never once ran at the 25 C
 * every number in this repository was derived at — a silent twenty per cent
 * speed-up applied to everything, forever, as a side effect. At rest the water
 * is the water the tuning assumed. Heat is entirely a consequence of your own
 * aggression.
 */
export const HEATING = 2.9;

/**
 * How fast the glass takes it back, per second.
 *
 * A microchannel is a thin film of water in a large block of silicon and glass,
 * which is a heat sink with a couple of orders more mass and a far better
 * conductivity. It cools by conduction into the chip and it is quick — but not
 * as quick as you can stop driving, so the water stays hot for a while after
 * you let go and that lag is the whole of the tactical cost.
 */
export const COOLING = 0.045;

/**
 * Where the water settles after `dt` of driving at this amplitude.
 *
 * `rated` is the continuous duty as a fraction of the peak — cruise. It is
 * passed in rather than imported so that this module depends on nothing in
 * `game/` at all: it needs only `Medium`, and pulling `CRUISE_AMPLITUDE` in
 * from pilot.ts would close a cycle through wave.ts, which needs the viscosity
 * from here.
 */
export function step(
  tC: number, amplitudePa: number, maxAmplitude: number, rated: number, dt: number,
): number {
  const drive = maxAmplitude > 0 ? amplitudePa / maxAmplitude : 0;
  const over = Math.max(0, drive * drive - rated * rated);
  const up = HEATING * over;
  const down = COOLING * (tC - AMBIENT_C);
  return Math.min(MAX_C, Math.max(AMBIENT_C, tC + (up - down) * dt));
}

/**
 * The same water, at a different temperature.
 *
 * A SHIFT, not a replacement. A world's medium is derived from the body of the
 * king that made it and is not pure water; what temperature does to it is what
 * temperature does to water, added on top. Keeping it as a shift means a hot
 * cubic water is still recognisably the cubic water.
 */
export function atTemperature(m: Medium, tC: number): Medium {
  return {
    rho: m.rho + (density(tC) - density(AMBIENT_C)),
    c: m.c + (soundSpeed(tC) - soundSpeed(AMBIENT_C)),
  };
}
