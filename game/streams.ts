// game/streams.ts — the channel does not hold one water.
//
// A microfluidic channel routinely carries several fluids at once, side by side,
// not mixing. At these scales the Reynolds number is of order 10^-3 and flow is
// laminar: two streams introduced together run down the channel in parallel and
// exchange nothing but diffusion across a boundary that stays put. It is not an
// exotic arrangement — it is how acoustofluidic separation is DONE, sample
// stream beside buffer stream, with the field pushing cells from one into the
// other.
//
// WHICH MEANS THE FAR WATER IS DIFFERENT WATER. Everything in this game is
// decided by one subtraction — the sign of a body's contrast factor against the
// medium it is in — so a channel with three streams in it is a channel where
// that sign is a function of WHERE YOU ARE. A vesicle that answers to your nodes
// in the middle of the channel answers to your antinodes at the edge. A hunter
// that could reach you cannot. Your own body rides the other lattice.
//
// Nothing about that is a reward placed in a corner. It is the same rule the
// whole game already runs on, asked at a position instead of asked once.
//
// The streams run ALONG the channel, because that is the direction the fluid
// goes and laminar boundaries do not turn corners. They are wider than the
// arena you start in, so the water you begin in is one stream and uniform, and
// the others are somewhere to travel to.

import { type Medium } from "../src/gorkov.js";
import { carriable } from "./world.js";

/** How many streams the channel carries. */
export const STREAMS = 3;

/**
 * How far the outer streams are pushed from the middle one.
 *
 * Density and sound speed both, because a contrast factor is made of both and
 * moving only one of them is a smaller idea. The numbers are within the range
 * worlds are already generated in, so nothing here reaches a water the rest of
 * the game has not already been asked to handle.
 */
export const STREAM_RHO = 60;
export const STREAM_C = 230;

/**
 * How much of the channel the middle stream takes.
 *
 * The three are NOT equal, and unequal is the ordinary case: the width of a
 * co-flowing stream is set by the relative flow rate of the inlet feeding it,
 * so a channel with a wide sample stream and two narrow sheath flows is a
 * completely standard arrangement.
 *
 * It is wide enough to contain the whole pool you start in. In equal thirds the
 * starting water is six hundred and sixty microns and a band is six hundred and
 * thirty-three, so the first world could not be one water at all — you would
 * begin astride a boundary, in two fluids, before being told there were any.
 */
export const MIDDLE_SPAN = 0.56;

/**
 * Which stream a point is in.
 *
 * Bands across the width of the channel, in the FULL channel's coordinates
 * rather than the opened water's, so a stream boundary does not move when your
 * crystal grows and opens more of the chip. Somewhere you learned is somewhere
 * that stays learned.
 */
export function streamAt(y: number, channelH: number): number {
  const mid = channelH * MIDDLE_SPAN;
  const edge = (channelH - mid) / 2;
  if (y < edge) return 0;
  if (y < edge + mid) return 1;
  return 2;
}

/** How far a stream sits from the middle one: -1, 0, +1. */
export function streamOffset(index: number): number {
  return index - (STREAMS - 1) / 2;
}

/**
 * The water at a point.
 *
 * The world's own medium is the middle stream; the others are lighter and
 * slower, or denser and faster, by a fixed step. A body's contrast factor
 * against THIS is what decides everything about it, so this is the function the
 * whole game is downstream of.
 */
export function mediumAt(base: Medium, y: number, channelH: number): Medium {
  const k = streamOffset(streamAt(y, channelH));

  // THROUGH THE SAME GUARANTEE THE WORLD ITSELF GETS. A water sitting on the
  // player's own iso-acoustic point moves them at one per cent of normal speed
  // and no amount of grip helps, because grip multiplies a number that is
  // already zero — world.carriable exists for exactly that and has to cover
  // every water a player can stand in, not only the one the world was born as.
  // Over the two hundred and sixty-five reachable waters there is no fixed pair
  // of offsets that avoids it; there is only checking.
  return carriable({ rho: base.rho + k * STREAM_RHO, c: base.c + k * STREAM_C });
}

/** Where a stream begins and ends, m. For drawing it, and for saying where it is. */
export function streamBand(index: number, channelH: number): { lo: number; hi: number } {
  const mid = channelH * MIDDLE_SPAN;
  const edge = (channelH - mid) / 2;
  if (index <= 0) return { lo: 0, hi: edge };
  if (index === 1) return { lo: edge, hi: edge + mid };
  return { lo: edge + mid, hi: channelH };
}

/** What to call it. The middle one is the water the world was born as. */
export function streamName(index: number): string {
  const k = streamOffset(index);
  if (k === 0) return "THE MIDDLE STREAM";
  return k < 0 ? "THE LIGHT STREAM" : "THE HEAVY STREAM";
}
