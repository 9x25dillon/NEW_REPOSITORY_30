import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  STREAMS, STREAM_C, STREAM_RHO,
  mediumAt, streamAt, streamBand, streamName, streamOffset,
} from "../game/streams.js";
import { CHANNEL_H, START, ARENA_H, startRun, waterAt } from "../game/run.js";
import { BUILDABLE, cellFor } from "../game/lattice.js";
import { emptyThrone, feed, firstWorld, worldFrom } from "../game/world.js";
import { YOU } from "../game/pilot.js";
import { BEASTS } from "../game/beasts.js";
import { contrastFactor } from "../src/gorkov.js";

const mid = (i: number) => (streamBand(i, CHANNEL_H).lo + streamBand(i, CHANNEL_H).hi) / 2;

// ── the channel does not hold one water ─────────────────────────────────────

test("the streams run along the channel and do not move when it opens", () => {
  // Laminar co-flow: at these scales the Reynolds number is of order 10^-3, so
  // two fluids introduced together run down the channel in parallel and swap
  // nothing but diffusion. The boundary stays where it is — and it is fixed in
  // the CHANNEL rather than in the water you have opened, so somewhere you
  // learned is somewhere that stays learned.
  assert.equal(streamAt(0, CHANNEL_H), 0);
  assert.equal(streamAt(CHANNEL_H - 1e-9, CHANNEL_H), STREAMS - 1);
  for (let i = 0; i < STREAMS; i++) {
    const { lo, hi } = streamBand(i, CHANNEL_H);
    assert.equal(streamAt((lo + hi) / 2, CHANNEL_H), i);
    assert.ok(hi > lo);
  }
  assert.equal(streamOffset(0), -1);
  assert.equal(streamOffset(STREAMS - 1), 1);
});

test("you start in the middle stream, which is the water the world was born as", () => {
  // The pool opens outward from where you start, so the whole balance of a
  // world — which wildlife can reach you, what frees its bound field — is
  // derived from the water you are actually standing in.
  const run = startRun(3);
  assert.equal(streamAt(run.you.y, CHANNEL_H), 1, "the middle of three");
  assert.equal(streamAt(START.y, CHANNEL_H), 1);
  assert.equal(streamAt(START.y + ARENA_H, CHANNEL_H), 1, "and all of the starting pool");

  const here = waterAt(run, run.you.y);
  assert.ok(Math.abs(here.rho - run.world.medium.rho) < 1e-9, "and it is the world's own water");
});

// ── which is why the far water is worth crossing ────────────────────────────

test("crossing a stream boundary turns bodies over", () => {
  const base = firstWorld().medium;
  const phi = (p: { radius: number; rho: number; c: number }, i: number) =>
    contrastFactor(p, mediumAt(base, mid(i), CHANNEL_H));

  // You ride antinodes in the middle and nodes in the light stream.
  assert.ok(phi(YOU, 1) < 0);
  assert.ok(phi(YOU, 0) > 0, "the light water carries you the other way up");

  // And the husk — which cannot reach you in the middle, because it does not
  // share your sign — shares it in the heavy stream, where both are negative.
  const husk = BEASTS.husk.particle;
  assert.ok(phi(husk, 1) * phi(YOU, 1) < 0, "in the middle it is held off you");
  assert.ok(phi(husk, 2) * phi(YOU, 2) > 0, "in the heavy stream it is in your lap");
});

test("the offsets move both density and sound speed, because a contrast is both", () => {
  assert.ok(STREAM_RHO > 0 && STREAM_C > 0);
  const base = firstWorld().medium;
  const light = mediumAt(base, mid(0), CHANNEL_H);
  const heavy = mediumAt(base, mid(2), CHANNEL_H);
  assert.ok(heavy.rho > light.rho);
  assert.ok(heavy.c > light.c);
  assert.match(streamName(0), /LIGHT/);
  assert.match(streamName(2), /HEAVY/);
});

// ── and none of them may strand you ─────────────────────────────────────────

test("no stream of any reachable water leaves you unable to move", () => {
  // A water on the player's own iso-acoustic point moves them at one per cent
  // of normal speed and grip does not help, because grip multiplies a number
  // that is already zero. world.carriable exists for that, and it has to cover
  // every water a player can stand in rather than only the one a world was born
  // as: over the reachable waters there is no fixed pair of stream offsets that
  // avoids the problem, so it is checked rather than assumed.
  const bases = [firstWorld().medium];
  for (const a of BUILDABLE) {
    for (const b of ["", ...BUILDABLE]) {
      const k = emptyThrone(0, 0);
      feed(k, cellFor(a));
      if (b) feed(k, cellFor(b));
      for (const aeon of [2, 5]) bases.push(worldFrom(k, aeon).medium);
    }
  }

  let worst = Infinity;
  let where = "";
  for (const base of bases) {
    for (let i = 0; i < STREAMS; i++) {
      const phi = Math.abs(contrastFactor(YOU, mediumAt(base, mid(i), CHANNEL_H)));
      if (phi < worst) { worst = phi; where = `${streamName(i)} of rho${base.rho} c${base.c}`; }
    }
  }
  assert.ok(worst >= 0.02, `${where} strands you at phi ${worst.toFixed(4)}`);
  assert.ok(bases.length > 200, "and that is over two hundred waters, not a spot check");
});
