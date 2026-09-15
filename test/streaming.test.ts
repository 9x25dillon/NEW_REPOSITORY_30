import { strict as assert } from "node:assert";
import { test } from "node:test";
import { WATER, MAMMALIAN_CELL } from "../src/gorkov.js";
import { bawField } from "../src/fields.js";
import { integrate, positionAt, WATER_VISCOSITY } from "../src/trajectory.js";
import { eckartBodyForce, rayleighSlipAmplitude, rayleighStreaming, stokesLayerThickness, type RayleighChannel } from "../src/streaming.js";

const channel: RayleighChannel = {
  halfHeight: 50e-6, k: 2 * Math.PI / 750e-6, pressure: 1e5, phase: 0,
  medium: WATER, frequency: WATER.c / 750e-6, viscosity: WATER_VISCOSITY,
};
const near = (a: number, b: number, eps: number) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);

test("parallel-plate outer flow obeys slip, impermeability, symmetry and zero net flux", () => {
  const c = channel, x = 0.23 / c.k, h = c.halfHeight;
  const slip = rayleighSlipAmplitude(c.pressure, c.medium) * Math.sin(2 * c.k * x);
  near(rayleighStreaming(c, x, h).x, slip, 1e-18);
  near(rayleighStreaming(c, x, -h).x, slip, 1e-18);
  near(rayleighStreaming(c, x, h).y, 0, 1e-18);
  near(rayleighStreaming(c, x, 0).y, 0, 1e-18);
  const a = rayleighStreaming(c, x, 0.4 * h), b = rayleighStreaming(c, x, -0.4 * h);
  near(a.x, b.x, 1e-18); near(a.y, -b.y, 1e-18);
  // Simpson integration across the gap: recirculation, not a pump.
  let flux = 0;
  for (let i = 0; i <= 200; i++) flux += (i === 0 || i === 200 ? 1 : i % 2 ? 4 : 2)
    * rayleighStreaming(c, x, -h + 2 * h * i / 200).x;
  near(flux * 2 * h / 600, 0, 1e-17);
});

test("independent finite-difference checks enforce incompressibility and Stokes vorticity equation", () => {
  const c = channel, h = c.halfHeight;
  const velocity = (x: number, y: number) => rayleighStreaming(c, x, y);
  const d = h * 0.002;
  const curl = (x: number, y: number) => (velocity(x + d, y).y - velocity(x - d, y).y
    - velocity(x, y + d).x + velocity(x, y - d).x) / (2 * d);
  const x = 0.31 / c.k, y = h * 0.3;
  const div = (velocity(x + d, y).x - velocity(x - d, y).x
    + velocity(x, y + d).y - velocity(x, y - d).y) / (2 * d);
  near(div, 0, 2e-7);
  const lapCurl = (curl(x + d, y) + curl(x - d, y) + curl(x, y + d) + curl(x, y - d) - 4 * curl(x, y)) / d ** 2;
  assert.ok(Math.abs(lapCurl) * h ** 3 / Math.abs(rayleighSlipAmplitude(c.pressure, c.medium)) < 0.0001);
});

test("thin-channel limit recovers Rayleigh's parabolic return flow", () => {
  const c = { ...channel, k: 1 }, x = Math.PI / 4;
  const S = rayleighSlipAmplitude(c.pressure, c.medium);
  for (const t of [-1, -0.5, 0, 0.5, 1]) {
    near(rayleighStreaming(c, x, t * c.halfHeight).x / S, (3 * t * t - 1) / 2, 1e-8);
  }
  // Continuity across the cancellation-safe series branch.
  const low = { ...channel, k: 0.009999 / (2 * channel.halfHeight) };
  const high = { ...channel, k: 0.010001 / (2 * channel.halfHeight) };
  near(rayleighStreaming(low, Math.PI / (4 * low.k), 0).x / S,
    rayleighStreaming(high, Math.PI / (4 * high.k), 0).x / S, 1e-8);
});

test("Eckart forcing is the loss of progressive-wave momentum flux", () => {
  const alpha = 200, x = 0.001, d = 1e-8, p = 1e5;
  const flux = (z: number) => p ** 2 * Math.exp(-2 * alpha * z) / (2 * WATER.rho * WATER.c ** 2);
  const numerical = -(flux(x + d) - flux(x - d)) / (2 * d);
  near(eckartBodyForce(x, p, alpha, WATER) / numerical, 1, 1e-9);
  assert.equal(eckartBodyForce(x, p, 0, WATER), 0);
  near(stokesLayerThickness(channel.frequency * 4, WATER_VISCOSITY, WATER.rho),
    stokesLayerThickness(channel.frequency, WATER_VISCOSITY, WATER.rho) / 2, 1e-20);
});

test("advection is independent: zero flow recovers analytic trajectory, zero force follows fluid", () => {
  const field = bawField({ width: 375e-6, mode: 1, medium: WATER }, 1e5);
  const u0 = 25e-6;
  const path = integrate(field, u0, MAMMALIAN_CELL, { duration: 2, steps: 200, streamingVelocity: () => 0 });
  near(path.at(-1)!.u, positionAt(field, u0, 2, MAMMALIAN_CELL), 1e-13);
  const advected = integrate({ ...field, amplitude: 0 }, u0, MAMMALIAN_CELL,
    { duration: 2, steps: 100, streamingVelocity: t => 1e-5 * t });
  near(advected.at(-1)!.u, u0 + 2e-5, 1e-16);
});
