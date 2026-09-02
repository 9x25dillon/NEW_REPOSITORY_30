// game/chip.ts — the glass, which is older than any of your worlds.
//
// Everything else in this game is born and dies. The medium, the pitch, what
// lives in the water and what your buildings are made of all come out of the
// last sovereign's body, so a world is a consequence and nothing in it is
// placed. THE CHANNEL IS NOT. It is etched silicon and glass, it was etched
// once, and it is the same channel in the tenth aeon as in the first. So it is
// the only thing here a player can LEARN — a map that stays a map — and the
// only place a landmark can honestly be put.
//
// WHAT IS ETCHED INTO IT. Two features, both of them ordinary microfluidics
// rather than inventions:
//
//   A SHARP EDGE. A tip protruding from the sidewall. In an oscillating field
//   the enormous velocity gradient around a sharp tip rectifies into a steady
//   jet leaving along the tip's bisector — this is sharp-edge acoustofluidics,
//   and it is used to mix, to pump, and to sort. The jets here are tilted, one
//   way on one wall and the other way on the other, which is how a sharp-edge
//   array is oriented when it is meant to pump: the chip has a circulation
//   designed into it, and it is a fast way around the channel if you can find
//   the tips.
//
//   A BUBBLE CAVITY. A dead-end side channel that traps an air bubble at its
//   mouth. Driven, the bubble surface oscillates and throws off a streaming
//   vortex strong enough to capture particles out of the passing flow. This is
//   what a lateral cavity acoustic transducer does and what it is FOR: it
//   concentrates cells. So a cavity is a place that has been gathering while
//   you were elsewhere, and going to look is the reward for going.
//
// WHY IT IS NOT A VELOCITY TERM. game/ has a rule — nothing moves the player
// but the field — and it exists to stop authored motion: a dash vector, an
// impulse chosen because it felt good. None of this is authored. It is the
// SECOND-ORDER flow of the very same drive, its magnitude is
// wave.streamingSpeed (pinned in src/gorkov.ts's a^2 law) times one declared
// literature ratio, and its direction is a property of glass. The player cannot
// aim it. It moves the water; you are standing in the water.
//
// AND THE PART THAT MAKES IT A GAME. All of it is powered by YOUR drive. The
// chip is dead until someone brings a field to it, and it gets fiercer the
// harder you grip — so the way out of a whirlpool is to STOP DRIVING and walk
// out of a weak one, which is the exact inverse of every other habit this game
// teaches. Nobody had to write that rule either.

import { streamingSpeed } from "./wave.js";

// ── how hard ────────────────────────────────────────────────────────────────

/**
 * Sharp-edge streaming, as a multiple of bulk streaming. DECLARED GAME CONSTANT.
 *
 * The library refuses to encode a streaming prefactor and says why
 * (src/gorkov.ts: "a fabricated prefactor here would be trusted, and that is
 * worse than an absent one"). This is not that number — bulk streaming is
 * already pinned in wave.ts — it is the RATIO between two streaming mechanisms,
 * which is the better-behaved quantity and the one the literature actually
 * reports. Bulk streaming in a MHz microchannel runs at microns per second;
 * measured sharp-edge jets run at hundreds of microns to millimetres per
 * second. That is one to two orders, and this sits at the geometric middle of
 * it rather than at either flattering end.
 *
 * What it lands at, which is worth writing down because it was not chosen:
 * bulk streaming at full grip is 14 um/s, so a tip jet is about 460 um/s. You
 * make 565 um/s gripping and about 225 um/s at cruise. A jet is therefore
 * something you can ride, and something you cannot simply walk out of — and
 * neither of those was arranged.
 */
export const EDGE_GAIN = 32;

/**
 * Cavity streaming, same units, same source.
 *
 * The same figure, because it is the same mechanism — a steady flow rectified
 * out of an oscillating boundary — and inventing a second constant would be
 * pretending to know a difference nobody measured here. A cavity feels weaker
 * anyway, and for a reason rather than by fiat: a jet spends all of it in one
 * direction while a vortex spreads the same speed around a circle, and the
 * profile below is zero at the core and zero at the rim.
 */
export const CAVITY_GAIN = EDGE_GAIN;

/**
 * How much of a cavity's circulation shows up as particles moving inward.
 *
 * NOT fluid inflow — a streaming vortex is closed circulation and carries no
 * net flux. Particles still migrate to its core, because drag and the radiation
 * force balance at different places for different sizes, and that migration is
 * the whole reason a lateral cavity is used to concentrate cells rather than
 * merely to stir. Modelling the outcome and naming it as the outcome is honest;
 * modelling it as suction would not be.
 */
export const CAVITY_DRAW = 0.35;

// ── what is etched ──────────────────────────────────────────────────────────

export type FeatureKind = "edge" | "cavity";

export interface Feature {
  id: number;
  kind: FeatureKind;
  /** The tip, or the cavity mouth. Metres, in channel coordinates. */
  x: number;
  y: number;
  /** How far its flow reaches, m. */
  reach: number;
  /** edge: the unit vector the jet leaves along. cavity: unused. */
  jx: number;
  jy: number;
  /** cavity: +1 or -1, which way it turns. edge: unused. */
  spin: number;
}

/**
 * How far a sharp edge stands off its wall, as a fraction of the channel.
 *
 * A fifth of it. Sharp-edge mixers routinely protrude a comparable fraction —
 * the tip has to reach the flow it is meant to act on — and this one has a
 * second job: it decides when in a run the chip is discoverable. The workable
 * water opens with the largest body you have built, and it reaches y = 642 um
 * at about twelve joined cells, which is where a tip at 600 first comes into
 * reach. The first thing you can touch out here arrives at the same size as the
 * first stream boundary. That is one discovery, not two.
 */
export const EDGE_STANDOFF_FRAC = 0.2;

/** How far a tip jet carries, m. Conservative against the edge's own height. */
export const EDGE_REACH = 720e-6;

/** How far a cavity's vortex reaches out of its mouth, m. */
export const CAVITY_REACH = 460e-6;

/**
 * How far off the wall normal a tip is cut, radians.
 *
 * The tilt is the whole point of an array like this. Cut straight, the jets
 * fight across the channel and cancel; cut over, they add along it and the
 * chip pumps. Thirty degrees is a mild cut that still leaves most of the jet
 * pointed into the water where things are.
 */
export const EDGE_TILT = Math.PI / 6;

/**
 * Where along each wall the tips are cut, as fractions of the channel's length.
 *
 * Two pairs to a wall rather than four spread evenly, which is what the
 * clearance above leaves room for and is the better shape anyway: a pair sits
 * closer together than one plume is long, so their jets join into a single
 * stretch of moving water you can get into and be carried along. Four lonely
 * kicks would be four hazards. Two lanes at each end of each wall is somewhere
 * to go.
 */
export const EDGE_STATIONS = [0.14, 0.26, 0.74, 0.86] as const;

/**
 * Everything etched into a channel of this size.
 *
 * Deterministic — no seed, no randomness. A chip is a mask, and the same mask
 * printed twice gives the same chip. This is the function that makes the
 * channel learnable.
 *
 * THE MIDDLE COLUMN IS LEFT CLEAR, and it is a hard clearance rather than a
 * quiet one. The water you start in sits at the centre of the channel, and a
 * tip jet reaching into it would be weather in the opening minute of a game
 * whose opening minute is about learning that a node holds things. So no
 * feature's plume is allowed to REACH the starting pool at all — not "arrives
 * weak", which is a threshold somebody has to keep choosing, but does not
 * arrive. test/chip.test.ts measures the clearance in microns, and it is what
 * fixes the stations below at 0.26 rather than the third they started at: at a
 * third, a tip is 593 um from the corner of the pool against a 720 um plume,
 * and the opening minute has a current running through it that no threshold
 * loose enough to pass the real layout would ever have caught.
 */
export function features(channelW: number, channelH: number): Feature[] {
  const out: Feature[] = [];
  const standoff = channelH * EDGE_STANDOFF_FRAC;
  let id = 0;

  // Sharp edges: four to a long wall, tilted to drive the chip's circulation
  // one way along the bottom and the other way along the top.
  for (const wall of [-1, 1] as const) {
    const y = wall < 0 ? standoff : channelH - standoff;
    // Into the channel, away from the wall the tip grew out of.
    const inward = wall < 0 ? 1 : -1;
    // Bottom wall pumps toward +x, top wall toward -x, so the chip circulates.
    const along = wall < 0 ? 1 : -1;
    for (const f of EDGE_STATIONS) {
      out.push({
        id: id++,
        kind: "edge",
        x: channelW * f,
        y,
        reach: EDGE_REACH,
        jx: along * Math.sin(EDGE_TILT),
        jy: inward * Math.cos(EDGE_TILT),
        spin: 0,
      });
    }
  }

  // Bubble cavities: one at the middle of each wall. Four landmarks, one per
  // side, each of them deep in a different water — the two on the long walls
  // are out in the light and the heavy stream, and the two on the ends sit in
  // the middle stream where it is fed in.
  const cav: Array<[number, number, number]> = [
    [channelW * 0.5, 0, +1],
    [channelW * 0.5, channelH, -1],
    [0, channelH * 0.5, -1],
    [channelW, channelH * 0.5, +1],
  ];
  for (const [x, y, spin] of cav) {
    out.push({ id: id++, kind: "cavity", x, y, reach: CAVITY_REACH, jx: 0, jy: 0, spin });
  }

  return out;
}

// ── what the water does ─────────────────────────────────────────────────────

/**
 * How a tip jet falls off with distance. One at the tip, nothing at the reach.
 *
 * Squared, so it arrives at the edge of its plume with zero slope and there is
 * no line in the water where the current switches off.
 */
function fade(r: number, reach: number): number {
  if (r >= reach) return 0;
  const k = 1 - r / reach;
  return k * k;
}

/**
 * And how collimated it is.
 *
 * A jet off a sharp tip is a lobe, not a sphere: strongest straight ahead, gone
 * behind. Cubed cosine is a narrow-ish lobe and, usefully, it means standing
 * BEHIND an edge is standing out of its way — the tip is a thing you can take
 * cover from.
 */
function lobe(cos: number): number {
  return cos <= 0 ? 0 : cos * cos * cos;
}

/**
 * A cavity's tangential speed against radius. Zero at the core, zero at the
 * rim, fastest between.
 *
 * Not a fudge: a streaming vortex has a rotational core that turns as a solid
 * body and a decaying outside, so there is a radius of maximum speed in the
 * middle and it is the only shape a closed circulation can have.
 */
function ring(r: number, reach: number): number {
  if (r >= reach) return 0;
  const u = r / reach;
  return 4 * u * (1 - u);
}

/**
 * The flow at a point, m/s.
 *
 * `amplitudePa` is the drive, and the drive is never off — pilot.concentrate
 * floors it at cruise — so the chip always has some life in it and a cavity
 * gathers while you are on the other side of the channel. Grip multiplies it,
 * because streaming goes as pressure squared and gripping is more pressure.
 */
export function flowAt(
  fs: readonly Feature[], x: number, y: number, amplitudePa: number,
): { x: number; y: number } {
  const u = streamingSpeed(amplitudePa);
  let vx = 0, vy = 0;
  if (u <= 0) return { x: 0, y: 0 };

  for (const f of fs) {
    const dx = x - f.x, dy = y - f.y;
    const r = Math.hypot(dx, dy);
    if (r >= f.reach) continue;

    if (f.kind === "edge") {
      // Right on the tip there is no direction to be off by, so the jet is
      // simply the jet.
      const cos = r < 1e-9 ? 1 : (dx * f.jx + dy * f.jy) / r;
      const s = u * EDGE_GAIN * fade(r, f.reach) * lobe(cos);
      vx += f.jx * s;
      vy += f.jy * s;
    } else {
      if (r < 1e-9) continue;
      const s = u * CAVITY_GAIN * ring(r, f.reach);
      // Tangential, turning the way this one turns.
      vx += (-dy / r) * s * f.spin;
      vy += (dx / r) * s * f.spin;
      // And the migration that makes a cavity a collector rather than a stirrer.
      vx += (-dx / r) * s * CAVITY_DRAW;
      vy += (-dy / r) * s * CAVITY_DRAW;
    }
  }

  return { x: vx, y: vy };
}

/** The nearest feature and how far off it is, or null if none is within reach.
 *  For telling the player where they are. */
export function nearestFeature(
  fs: readonly Feature[], x: number, y: number,
): { feature: Feature; r: number } | null {
  let best: Feature | null = null;
  let bestR = Infinity;
  for (const f of fs) {
    const r = Math.hypot(x - f.x, y - f.y);
    if (r < f.reach && r < bestR) { best = f; bestR = r; }
  }
  return best ? { feature: best, r: bestR } : null;
}

/** What to call it. */
export function featureName(f: Feature): string {
  return f.kind === "edge" ? "A SHARP EDGE" : "A BUBBLE CAVITY";
}
