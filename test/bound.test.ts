import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  MAX_FILL, SKELETON, SKELETON_REACH,
  advice, boundFrequency, catches, crystalOf, detune, gapOf, newBound,
  workableSpacing,
} from "../game/bound.js";
import { reachOf, structureFrom } from "../game/world.js";
import { firstWorld } from "../game/world.js";

const WATER = { rho: 997, c: 1497 };

/** A square array of buildings at spacing `a`. */
function array(a: number, n = 3, hm = "222") {
  const out = [];
  let id = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) out.push(structureFrom(id++, hm, 200e-6 + i * a, 200e-6 + j * a));
  }
  return out;
}

// ── what holds it ───────────────────────────────────────────────────────────

test("the frequency it is stuck at is the world's own Bragg condition", () => {
  // Not a number chosen per level: the wave whose half wavelength is the trap
  // pitch is exactly the one that world's periodicity reflects rather than
  // carries. Both inputs are the last king's body, so every aeon strands its
  // field somewhere else.
  const w = firstWorld();
  const omega = boundFrequency(w.pitch, w.medium);
  assert.ok(Math.abs(omega - (2 * Math.PI * w.medium.c) / (2 * w.pitch)) < 1e-6);

  const faster = boundFrequency(w.pitch, { rho: 997, c: 1700 });
  assert.ok(faster > omega, "a stiffer water strands it higher");
  const finer = boundFrequency(w.pitch / 2, w.medium);
  assert.ok(finer > omega, "and a finer lattice strands it higher still");
});

test("two of anything is not yet a crystal", () => {
  assert.equal(crystalOf([], WATER), null);
  assert.equal(crystalOf(array(120e-6, 1), WATER), null);
  assert.ok(crystalOf(array(120e-6, 2), WATER) !== null);
});

// ── the two levers ──────────────────────────────────────────────────────────

test("how far apart you build is where the gap sits", () => {
  // It goes as 1/a and nothing else does. This is the whole tuning knob.
  const at = (a: number) => gapOf(crystalOf(array(a), WATER));
  const tight = at(90e-6);
  const wide = at(130e-6);
  assert.ok(tight && wide, "both of those spacings should have a gap");
  assert.ok(tight.lo > wide.lo * 1.2, "packing them raises the gap a long way");
});

test("how much you build is whether there is a gap at all", () => {
  // Under about 0.45 of the area there is no complete gap in this contrast at
  // any spacing, so a thin scatter of buildings holds nothing whatever its
  // spacing — which is the first thing a player has to learn.
  const thin = crystalOf(array(220e-6), WATER);
  assert.ok(thin && thin.fill < 0.45);
  assert.equal(gapOf(thin), null, "too sparse to forbid anything");

  const dense = crystalOf(array(105e-6), WATER);
  assert.ok(dense && dense.fill > 0.45);
  assert.ok(gapOf(dense) !== null);
});

// ── and it can be done ──────────────────────────────────────────────────────

test("the first water's field can actually be freed by building", () => {
  // An objective nobody can reach is worse than no objective, and this one is
  // decided entirely by physics: the widest spacing that still has a gap is
  // 2.64 skeleton radii, and the gap frequency there is the LOWEST any
  // buildable crystal holds. If the world's bound mode sits below that, the
  // level is impossible and nothing on screen would say why.
  const w = firstWorld();
  const b = newBound(w.pitch, w.medium, 0, 0);

  const works: number[] = [];
  for (let a = 60e-6; a <= 200e-6; a += 5e-6) {
    if (catches(gapOf(crystalOf(array(a), w.medium)), b.omega)) works.push(a);
  }
  assert.ok(works.length >= 2,
    `no spacing frees the first water's field (${works.length} of 29 tried)`);
  assert.ok(works[0] > 90e-6 && works[works.length - 1] < 150e-6,
    "and it should be a band you have to find, not the whole range");
});

test("it tells you which way you are wrong", () => {
  const w = firstWorld();
  const omega = boundFrequency(w.pitch, w.medium);
  const say = (a: number) => {
    const c = crystalOf(array(a), w.medium);
    return advice(c, gapOf(c), omega);
  };
  assert.match(say(70e-6), /TIGHTER|SPREAD/);
  assert.match(say(115e-6), /HAS IT/);
  assert.match(say(230e-6), /NO GAP/);
  assert.match(advice(null, null, omega), /NOT A CRYSTAL/);

  // and the bar agrees with the words
  const good = crystalOf(array(115e-6), w.medium);
  assert.equal(detune(gapOf(good), omega), 0);
  assert.ok(detune(gapOf(crystalOf(array(70e-6), w.medium)), omega) > 0);
});

// ── the library is allowed to refuse ────────────────────────────────────────

test("a player packing buildings on top of each other does not crash the game", () => {
  // bands.completeGap THROWS when a truncated plane-wave expansion stops being
  // trustworthy — the effective density it reconstructs goes negative and the
  // Cholesky step refuses rather than returning a number nobody should believe.
  // That is the library being honest, and it is reached by stacking buildings,
  // which is a thing a player does in the first minute.
  const heap = [];
  for (let i = 0; i < 9; i++) heap.push(structureFrom(i, "622", 300e-6 + i * 1e-6, 300e-6));
  const c = crystalOf(heap, WATER);
  assert.ok(c);
  assert.ok(c.fill <= MAX_FILL, "the fill is clamped where the expansion is still honest");
  assert.doesNotThrow(() => gapOf(c));

  // and straight past the clamp, by hand
  assert.doesNotThrow(() => gapOf({
    a: 20e-6, geometry: "circle", fill: 0.95, inclusion: SKELETON, matrix: WATER,
  }));
  assert.equal(gapOf({
    a: 20e-6, geometry: "circle", fill: 0.95, inclusion: SKELETON, matrix: WATER,
  }), null, "a refusal reads as no gap, not as a crash");
});

test("the skeleton is what the wave sees, not the grip", () => {
  // A protein lattice is 1.7 times the water's impedance and could never hold
  // anything; silica on a chiral template is 10.6, which is what a diatom does.
  const z = (m: { rho: number; c: number }) => m.rho * m.c;
  assert.ok(z(SKELETON) / z(WATER) > 9, "a complete gap needs about tenfold");
  assert.ok(SKELETON_REACH > 1, "and the frustule is wider than the grip");
});

test("the objective is inverted into the thing the player has their hands on", () => {
  // The lever is a distance and the objective is a frequency, and for a while
  // the only thing on screen was the frequency. Nobody can act on megaradians
  // per second. A report came back reading "crystal a=87um, gap 67.2-87.6"
  // against a mode stuck at 53.4, having caught it twice and lost it twice.
  const w = firstWorld();
  const omega = boundFrequency(w.pitch, w.medium);
  const band = workableSpacing(omega, w.medium, reachOf("222"));

  assert.ok(band, "there must be a spacing that works, or the level is a lie");
  assert.ok(band.lo > 80e-6 && band.hi < 160e-6, `${band.lo}..${band.hi}`);
  assert.ok(band.hi - band.lo > 15e-6,
    `and wide enough to hit by hand (${((band.hi - band.lo) * 1e6).toFixed(0)} um)`);

  // Everything inside it really does catch the mode, which is the only reason
  // the picture is allowed to say so.
  const mid = (band.lo + band.hi) / 2;
  assert.ok(catches(gapOf(crystalOf(array(mid), w.medium)), omega),
    "the middle of the band must actually free it");
});
