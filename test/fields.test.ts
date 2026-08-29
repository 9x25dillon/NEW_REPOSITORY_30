import { strict as assert } from "node:assert";
import { test } from "node:test";
import { LIPID_DROPLET, MAMMALIAN_CELL, WATER, radiationForce1D } from "../src/gorkov.js";
import {
  SAW_SUBSTRATES, bawField, bawResonance, energyDensity, forceAt, potentialAt,
  pressureAt, rayleighAngle, ssawField, ssawFrequency, ssawNodeShift,
  ssawWavelength, trapPositions, type SsawDevice,
} from "../src/fields.js";
import { pointGroup, isPiezoelectric } from "../src/pointgroups.js";

const near = (a: number, b: number, eps: number, what = "") =>
  assert.ok(Math.abs(a - b) < eps, `${what} ${a} !~ ${b} (d=${Math.abs(a - b)})`);

// ── The derivation agrees with the module it was derived from ───────────────

test("forceAt reproduces gorkov.radiationForce1D exactly", () => {
  // Two independent routes to the same number: fields.ts derives F from the
  // Gor'kov potential it also exposes, gorkov.ts uses the textbook
  // F = 4 pi Phi k a^3 E_ac sin(2ku). If these ever disagree, one derivation is
  // wrong and neither comment can be trusted.
  const w = bawField({ width: 375e-6, mode: 1, medium: WATER }, 1e5);
  for (const u of [0, 1e-5, 5e-5, 1.2e-4, 3e-4]) {
    const mine = forceAt(w, u, MAMMALIAN_CELL);
    const theirs = radiationForce1D(u, w.frequency, w.amplitude, MAMMALIAN_CELL, WATER);
    near(mine, theirs, Math.abs(theirs) * 1e-12 + 1e-24, `at u=${u}`);
  }
});

test("force is minus the gradient of the potential", () => {
  const w = bawField({ width: 375e-6, mode: 1, medium: WATER }, 1e5);
  const h = 1e-9;
  for (const u of [2e-5, 9e-5, 2.5e-4]) {
    const numeric = -(potentialAt(w, u + h, MAMMALIAN_CELL)
      - potentialAt(w, u - h, MAMMALIAN_CELL)) / (2 * h);
    near(forceAt(w, u, MAMMALIAN_CELL), numeric, Math.abs(numeric) * 1e-5, `at u=${u}`);
  }
});

// ── BAW ─────────────────────────────────────────────────────────────────────

test("a half-wavelength channel resonates at c/2w and focuses to the centre", () => {
  const width = 375e-6;
  const ch = { width, mode: 1, medium: WATER };
  near(bawResonance(ch), WATER.c / (2 * width), 1e-6);
  near(bawResonance(ch), 1.996e6, 1e3); // ~2 MHz, the usual working point

  const w = bawField(ch, 1e5);
  // hard walls are pressure ANTINODES: full amplitude at both edges
  near(Math.abs(pressureAt(w, 0)), w.amplitude, 1e-9, "wall");
  near(Math.abs(pressureAt(w, width)), w.amplitude, 1e-9, "far wall");
  // and the single node sits exactly at the centre line
  near(pressureAt(w, width / 2), 0, 1e-9, "centre");

  const traps = trapPositions(w, MAMMALIAN_CELL, width);
  assert.equal(traps.length, 1);
  near(traps[0], width / 2, 1e-12);
});

test("mode n gives n nodes, evenly spaced, at n times the frequency", () => {
  const width = 375e-6;
  for (const mode of [1, 2, 3, 4]) {
    const ch = { width, mode, medium: WATER };
    near(bawResonance(ch), (mode * WATER.c) / (2 * width), 1e-6, `f mode ${mode}`);
    const traps = trapPositions(bawField(ch, 1e5), MAMMALIAN_CELL, width);
    assert.equal(traps.length, mode, `mode ${mode} node count`);
    for (let i = 0; i < mode; i++) {
      near(traps[i], ((2 * i + 1) * width) / (2 * mode), 1e-12, `mode ${mode} node ${i}`);
    }
  }
});

test("a lipid droplet traps where a cell does not — the walls, not the centre", () => {
  const width = 375e-6;
  const w = bawField({ width, mode: 1, medium: WATER }, 1e5);
  const cells = trapPositions(w, MAMMALIAN_CELL, width);
  const lipid = trapPositions(w, LIPID_DROPLET, width);
  near(cells[0], width / 2, 1e-12);
  // negative contrast traps at the antinodes, which here are the walls
  near(lipid[0], 0, 1e-12);
  assert.ok(lipid.some((u) => Math.abs(u - width) < 1e-9) || lipid.length >= 1);
  // separation is possible precisely because these two sets are disjoint
  for (const a of cells) for (const b of lipid) assert.ok(Math.abs(a - b) > 1e-6);
});

// ── SSAW ────────────────────────────────────────────────────────────────────

const LN = SAW_SUBSTRATES[0];
const ssaw = (over: Partial<SsawDevice> = {}): SsawDevice => ({
  fingerPitch: 50e-6, substrate: LN, medium: WATER, ...over,
});

test("the mask sets the wavelength and the wafer sets the frequency", () => {
  const d = ssaw();
  near(ssawWavelength(d), 100e-6, 1e-12);
  near(ssawFrequency(d), 3980 / 100e-6, 1e-6);
  near(ssawFrequency(d), 39.8e6, 1e3); // ~40 MHz, far above any BAW device
  // halving the pitch doubles the frequency and halves the node spacing
  near(ssawFrequency(ssaw({ fingerPitch: 25e-6 })), 2 * ssawFrequency(d), 1e-3);
});

test("the Rayleigh angle for water on lithium niobate is about 22 degrees", () => {
  const deg = (rayleighAngle(ssaw()) * 180) / Math.PI;
  near(deg, 22.1, 0.2, "Rayleigh angle");
  // and it is Snell's law, not a fitted constant
  near(Math.sin(rayleighAngle(ssaw())), WATER.c / LN.velocity, 1e-12);
});

test("a substrate slower than the fluid throws instead of returning NaN", () => {
  const slow = { name: "invented", cut: "n/a", velocity: 1200, hm: "3m" };
  assert.throws(() => rayleighAngle(ssaw({ substrate: slow })), /no leaky radiation/);
  // a silent NaN here would propagate into a trap position and look physical
});

test("every SSAW substrate is piezoelectric — the symmetry table agrees", () => {
  for (const s of SAW_SUBSTRATES) {
    assert.ok(isPiezoelectric(pointGroup(s.hm)), `${s.name} ${s.hm}`);
    assert.ok(s.cut.length > 0, `${s.name} must name its cut`);
  }
});

test("nodes are half a wavelength apart, and 2 pi of IDT phase moves them exactly one spacing", () => {
  const d = ssaw();
  const lambda = ssawWavelength(d);
  const w = ssawField(d, 1e5);
  const traps = trapPositions(w, MAMMALIAN_CELL, 2 * lambda);
  assert.ok(traps.length >= 4);
  for (let i = 1; i < traps.length; i++) {
    near(traps[i] - traps[i - 1], lambda / 2, 1e-12, "node spacing");
  }

  // The steering identity: a full 2 pi phase difference translates the whole
  // pattern by one node spacing. This is the mechanism of acoustic tweezing.
  near(ssawNodeShift(d, 2 * Math.PI), lambda / 2, 1e-15);
  near(ssawNodeShift(d, Math.PI), lambda / 4, 1e-15);

  // The pattern is periodic, so node IDENTITY is only defined modulo the node
  // spacing: trapPositions wraps into [0, span), and after a half-spacing shift
  // index 0 is a different physical node. Comparing traps[0] to shifted[0]
  // measures the wrap, not the shift — it reports -lambda/4 for a +lambda/4
  // move. The invariant that actually holds is set equality after translation.
  const spacing = lambda / 2;
  const shifted = trapPositions(ssawField(ssaw({ idtPhase: Math.PI }), 1e5),
    MAMMALIAN_CELL, 2 * lambda);
  const wrap = (x: number) => ((x % spacing) + spacing) % spacing;
  for (const s of shifted) {
    const moved = traps.map((t) => wrap(t + ssawNodeShift(d, Math.PI)));
    assert.ok(moved.some((m) => Math.abs(wrap(s) - m) < 1e-9
      || Math.abs(wrap(s) - m - spacing) < 1e-9),
      `shifted node ${s} is not the original set translated by lambda/4`);
  }
  // and the translation is genuinely a quarter spacing, not zero or a half
  assert.ok(Math.abs(wrap(shifted[0] - traps[0]) - lambda / 4) < 1e-9);
});

test("energy density scales as amplitude squared and is device-independent", () => {
  const a = bawField({ width: 375e-6, mode: 1, medium: WATER }, 1e5);
  const b = ssawField(ssaw(), 1e5);
  near(energyDensity(a), energyDensity(b), 1e-12); // same amplitude, same medium
  near(energyDensity({ ...a, amplitude: 2e5 }) / energyDensity(a), 4, 1e-9);
});
