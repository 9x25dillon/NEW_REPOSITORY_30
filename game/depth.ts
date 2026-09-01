// game/depth.ts — the third dimension, which was in the library all along.
//
// The game has only ever used half of src/fields.ts. The SSAW half puts a
// lattice across the FLOOR of the channel, which is the plane you play on. The
// BAW half puts a standing wave across its HEIGHT, and that is a dimension
// nobody has been allowed to move in.
//
// A BAW resonance is a consequence of geometry rather than a setting. Hard
// walls — silicon, glass — are pressure ANTINODES, so a resonance needs an
// integer number of half wavelengths across the channel: h = n·lambda/2, and
// therefore f_n = n·c / 2h. That is fields.bawResonance, and it has never been
// called by anything that ships.
//
// WHAT IT MEANS HERE. For p ∝ cos(kz) with k = n·pi/h, the pressure nodes sit at
//
//     z_i = h (2i + 1) / 2n        i = 0 .. n-1
//
// which is EXACTLY n planes, evenly spaced, the outermost half a spacing from
// each wall. A body with positive contrast is driven onto the nearest of them
// and stays there. So the number of layers in a world is not a level-design
// decision; it is which harmonic the channel is being driven at, and the whole
// of the third dimension is the integer n.
//
// AND CHANGING IT IS THE MOVEMENT. There is no swimming up. The only thing that
// moves a trapped body in z is retuning the drive: step the channel from its
// second harmonic to its third and every plane in the fluid moves, and every
// body on one is handed to whichever new plane is nearest. That is a real
// manoeuvre on a real device, it costs nothing but the drive, and it moves
// EVERYTHING — which is what makes it a decision rather than a jump button.
//
// The floor and the ceiling are walls. Nothing is ever on one, because a wall is
// an antinode and an antinode is where a cell will not go.

import { type Medium } from "../src/gorkov.js";
import { bawResonance } from "../src/fields.js";

/**
 * Channel height, m.
 *
 * Two hundred microns: a real acoustofluidic channel, deep enough that its
 * first three harmonics land at 3.7, 7.5 and 11.2 MHz in water — the band this
 * whole repository works in — and shallow enough that the planes are tens of
 * microns apart rather than hundreds.
 */
export const CHANNEL_HEIGHT = 200e-6;

/** The most harmonics a channel will hold before the planes are closer than the
 *  bodies standing on them. Three planes, forty microns apart, is the wall. */
export const MAX_MODE = 4;

/** The drive frequency of a mode, Hz. Geometry, not a knob. */
export function modeFrequency(mode: number, medium: Medium): number {
  return bawResonance({ width: CHANNEL_HEIGHT, medium, mode });
}

/**
 * The planes a mode puts in the fluid, in metres from the floor.
 *
 * n of them, evenly spaced, the outermost half a spacing from each wall —
 * because the walls are antinodes and the nodes fall between them.
 */
export function planes(mode: number): number[] {
  const n = Math.max(1, Math.min(MAX_MODE, Math.round(mode)));
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push((CHANNEL_HEIGHT * (2 * i + 1)) / (2 * n));
  return out;
}

/** How far apart they are, m. */
export function planeGap(mode: number): number {
  return CHANNEL_HEIGHT / Math.max(1, Math.min(MAX_MODE, Math.round(mode)));
}

/** The height of one layer, m. */
export function heightOf(layer: number, mode: number): number {
  const p = planes(mode);
  return p[Math.max(0, Math.min(p.length - 1, layer))];
}

/**
 * Where a body at height z ends up when the channel is driven at `mode`.
 *
 * It does not choose. A positive-contrast body goes to the nearest node and
 * stays, so retuning the drive re-sorts the entire fluid at once — which is the
 * only way anything moves in this dimension and the reason it is a decision.
 */
export function reseat(z: number, mode: number): number {
  const p = planes(mode);
  let best = 0;
  for (let i = 1; i < p.length; i++) {
    if (Math.abs(p[i] - z) < Math.abs(p[best] - z)) best = i;
  }
  return best;
}

/**
 * Retune from one harmonic to another, and say where everything went.
 *
 * Returns a map from old layer index to new. Stepping UP a harmonic adds a
 * plane and pushes the outer layers apart; stepping DOWN merges them, which is
 * how two things that were on separate levels end up sharing one.
 */
export function retuneLayers(from: number, to: number): number[] {
  const old = planes(from);
  return old.map((z) => reseat(z, to));
}

/** Two bodies interact only if the same plane is holding them up. */
export function together(a: number, b: number): boolean {
  return a === b;
}

/**
 * How many harmonics a world's channel is driven at.
 *
 * The first water is driven at its fundamental and is therefore flat: one
 * plane, and the game as it has always been. A sovereign's body sets the
 * harmonic of the world born out of it, so depth arrives the way everything
 * else here does — as a consequence of what somebody crowned.
 */
export function modeFor(mass: number, aeon: number): number {
  if (aeon <= 1) return 1;
  return Math.max(1, Math.min(MAX_MODE, 1 + Math.floor(mass / 14) + Math.floor(aeon / 3)));
}
