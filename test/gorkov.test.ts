import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  LIPID_DROPLET, MAMMALIAN_CELL, WATER, collectsAt, contrastFactor,
  energyDensity, f1, f2, radiationForce1D, stokesDrag, wavenumber,
} from "../src/gorkov.js";

test("a mammalian cell has POSITIVE contrast and collects at pressure nodes", () => {
  const phi = contrastFactor(MAMMALIAN_CELL, WATER);
  assert.ok(phi > 0, `cells must have positive contrast, got ${phi}`);
  assert.equal(collectsAt(MAMMALIAN_CELL, WATER), "node");
  // both contributions point the same way for a cell: denser AND stiffer
  assert.ok(f1(MAMMALIAN_CELL, WATER) > 0);
  assert.ok(f2(MAMMALIAN_CELL, WATER) > 0);
});

test("a lipid droplet has NEGATIVE contrast and goes the other way", () => {
  assert.ok(contrastFactor(LIPID_DROPLET, WATER) < 0);
  assert.equal(collectsAt(LIPID_DROPLET, WATER), "antinode");
  // the sign difference between these two is what makes separation possible
  assert.notEqual(collectsAt(LIPID_DROPLET, WATER), collectsAt(MAMMALIAN_CELL, WATER));
});

test("f2 is bounded in (-2, 1) — and the asymmetry is real, not a typo", () => {
  // f2 = 2(rho_p - rho_f) / (2 rho_p + rho_f). As rho_p -> infinity it tends to
  // +1; as rho_p -> 0 it tends to 2(-rho_f)/rho_f = -2. The bound is therefore
  // (-2, 1) and NOT symmetric, which is easy to assume and wrong: a bubble can
  // pull twice as hard toward the antinode as an infinitely dense particle can
  // pull toward the node. This test was written asserting (-1, 1) and failed.
  for (const rho of [1, 10, 100, 1000, 1e5, 1e7]) {
    const v = f2({ radius: 1e-6, rho, c: 1500 }, WATER);
    assert.ok(v > -2 && v < 1, `f2 = ${v} escaped its bound at rho = ${rho}`);
  }
  assert.ok(f2({ radius: 1e-6, rho: 1e-9, c: 1500 }, WATER) < -1.99);
  assert.ok(f2({ radius: 1e-6, rho: 1e12, c: 1500 }, WATER) > 0.999);
  // a particle identical to the medium has no contrast at all
  const same = { radius: 1e-6, rho: WATER.rho, c: WATER.c };
  assert.ok(Math.abs(contrastFactor(same, WATER)) < 1e-12);
  assert.equal(collectsAt(same, WATER), "neutral");
});

test("the force vanishes at nodes and antinodes, and reverses between them", () => {
  const f = 2e6; // 2 MHz
  const k = wavenumber(f, WATER);
  const halfLambda = Math.PI / k;
  const F = (x: number) => radiationForce1D(x, f, 1e5, MAMMALIAN_CELL, WATER);

  // x is measured from an antinode; the node is a quarter wavelength along
  assert.ok(Math.abs(F(0)) < 1e-18, "antinode is an equilibrium");
  assert.ok(Math.abs(F(halfLambda / 2)) < 1e-18, "node is an equilibrium");
  // The zeros of sin(2kx) fall every QUARTER wavelength, so within one
  // half-wavelength the sign flips at the midpoint. Between the antinode and
  // the node the force is positive and drives a positive-contrast particle
  // toward the node; past the node it reverses and drives it back.
  assert.ok(F(halfLambda / 4) > 0, "should push toward the node");
  assert.ok(F((3 * halfLambda) / 4) < 0, "should push back toward the node");
  // The trap is stable: the force always points at the node from either side.
  for (const frac of [0.05, 0.2, 0.45]) assert.ok(F(halfLambda * frac) > 0);
  for (const frac of [0.55, 0.8, 0.95]) assert.ok(F(halfLambda * frac) < 0);
});

test("force scales as radius cubed and energy density as amplitude squared", () => {
  const args = [1e-5, 2e6, 1e5] as const;
  const small = radiationForce1D(args[0], args[1], args[2],
    { ...MAMMALIAN_CELL, radius: 5e-6 }, WATER);
  const big = radiationForce1D(args[0], args[1], args[2],
    { ...MAMMALIAN_CELL, radius: 1e-5 }, WATER);
  assert.ok(Math.abs(big / small - 8) < 1e-9, "doubling the radius must be 8x");

  assert.ok(Math.abs(energyDensity(2e5, WATER) / energyDensity(1e5, WATER) - 4) < 1e-9);
});

test("viscosity appears in drag and nowhere else", () => {
  // Stokes drag is linear in all three of its arguments
  assert.ok(Math.abs(stokesDrag(2e-3, 5e-6, 8.9e-4) / stokesDrag(1e-3, 5e-6, 8.9e-4) - 2) < 1e-9);
  // and the radiation potential does not take a viscosity at all — this test
  // exists because multiplying Gor'kov by viscosity is the standard error
  assert.equal(radiationForce1D.length, 5);
  assert.equal(contrastFactor.length, 2);
});
