import { strict as assert } from "node:assert";
import { test } from "node:test";
import { WATER, MAMMALIAN_CELL } from "../src/gorkov.js";
import { assumed, measured, blame, surrogate, derive, assertNoSurrogate } from "../src/provenance.js";
import { positionAt } from "../src/trajectory.js";
import { PIPELINE_VERSION, runSimulation, parseSimulation, serializeSimulation, type SimulationSpec } from "../src/pipeline.js";
import { rayleighSizeAssessment } from "../src/modelValidity.js";

function example(): SimulationSpec {
  return {
    schemaVersion: 1, engineVersion: PIPELINE_VERSION,
    medium: measured("fluid", { ...WATER }, "test fixture"),
    particle: measured("particle", { ...MAMMALIAN_CELL }, "test fixture"),
    field: measured("drive", { frequency: 2e6, pressure: 1e5, phase: 0, phaseRate: 0 }, "test fixture"),
    viscosity: measured("viscosity", 8.9e-4, "test fixture"),
    radiation: { kind: "gorkov" }, streaming: { kind: "none" },
    integration: measured("initial condition and time window", { initialPosition: 25e-6, duration: 2, steps: 100, toleranceMetres: 1e-10 }, "test fixture"),
  };
}

test("serialized model reproduces every stage, diagnostic and trajectory", () => {
  for (const kind of ["gorkov", "mie"] as const) {
    for (const streaming of [
      { kind: "none" } as const,
      { kind: "uniform", velocity: assumed("flow", 2e-5, "prescribed") } as const,
      { kind: "rayleigh-midplane", halfHeight: assumed("half-gap", 50e-6, "drawing") } as const,
    ]) {
      const spec = { ...example(), radiation: { kind }, streaming };
      const before = JSON.stringify(spec);
      const direct = runSimulation(spec);
      const restored = runSimulation(parseSimulation(serializeSimulation(spec)));
      assert.deepEqual(restored, direct);
      assert.equal(JSON.stringify(spec), before, "solver must not mutate input");
      assert.ok(direct.diagnostics.integration.toleranceMet);
      assert.equal(direct.diagnostics.radiation.modelErrorBound, null);
    }
  }
});

test("zero-streaming pipeline has the independent Gor'kov closed form", () => {
  const spec = example(), result = runSimulation(spec);
  const expected = positionAt(result.field.value, spec.integration.value.initialPosition,
    spec.integration.value.duration, spec.particle.value, spec.viscosity.value);
  assert.ok(Math.abs(result.trajectory.value.at(-1)!.u - expected) < 1e-13);
  assert.equal(result.trajectory.provenance, "derived");
  assert.equal(result.forceAmplitude.provenance, "derived");
});

test("advection provenance propagates without changing the radiation stage", () => {
  const spec = example(), baseline = runSimulation(spec);
  spec.streaming = { kind: "uniform", velocity: assumed("unmeasured flow", 2e-5, "guess") };
  const result = runSimulation(spec);
  assert.deepEqual(result.forceAmplitude, baseline.forceAmplitude);
  assert.equal(result.trajectory.provenance, "assumed");
  assert.deepEqual(blame(result.trajectory), ["unmeasured flow"]);
  spec.particle.value.radius *= 2;
  assert.equal(result.description.particle.value.radius, MAMMALIAN_CELL.radius, "result must retain original inputs");
});

test("finite-size screening uses the fluid and internal wavelengths", () => {
  const size = rayleighSizeAssessment(200e6, MAMMALIAN_CELL, WATER);
  assert.ok(size.externalKa > 6); assert.equal(size.smallParticle, false);
  const spec = example(); spec.field.value.frequency = 200e6;
  assert.match(runSimulation(spec).diagnostics.radiation.warnings.join(" "), /Rayleigh/);
  spec.radiation.kind = "mie";
  assert.ok(runSimulation(spec).diagnostics.radiation.mie);
});

test("coarse unresolved integration is not reported as meeting tolerance", () => {
  const spec = example(); spec.integration.value.steps = 1;
  const r = runSimulation(spec);
  assert.equal(r.diagnostics.integration.resolutionScreenPassed, false);
  assert.equal(r.diagnostics.integration.toleranceMet, false);
});

test("invalid, unsupported, or nonserializable descriptions cannot run silently", () => {
  const invalid = (mutate: (s: any) => void, pattern: RegExp) => {
    const spec = example(); mutate(spec);
    assert.throws(() => runSimulation(spec), pattern);
  };
  invalid(s => { s.schemaVersion = 2; }, /version/);
  invalid(s => { s.engineVersion = "future"; }, /version/);
  invalid(s => { s.radiation.kind = "surrogate"; }, /radiation/);
  invalid(s => { s.streaming.kind = "eckart"; }, /streaming/);
  invalid(s => { s.particle.value.radius = 0; }, /positive/);
  invalid(s => { s.field.value.pressure = NaN; }, /finite/);
  invalid(s => { s.field.value.phaseRate = () => 0; }, /object/);
  invalid(s => { s.integration.value.steps = 2.5; }, /integer/);
  invalid(s => { s.integration.value.steps = 1e9; }, /integer/);
  invalid(s => { s.field.value.typo = 1; }, /unsupported/);
  invalid(s => { s.field.provenance = "exact"; }, /provenance/);
  invalid(s => { s.field.inputs = [assumed("unknown", 1, "guess")]; }, /computed/);
  invalid(s => { s.field.provenance = "derived"; s.field.inputs = [assumed("unknown", 1, "guess")]; }, /conceal/);
  invalid(s => { s.streaming = { kind: "rayleigh-midplane", halfHeight: assumed("half-gap", 1e-4, "drawing") }; s.field.value.phaseRate = 1; }, /stationary/);
  assert.throws(() => parseSimulation('{"schemaVersion":1}'), /missing/);
});

test("JSON round trip preserves surrogate lineage and rejects provenance promotion", () => {
  const spec = example();
  spec.viscosity = surrogate("predicted viscosity", 8.9e-4, "fixture", {
    modelId: "viscosity-gp-v1", predictiveVariance: 1e-10, inDomain: true,
  }, [derive("solver training output", 8.8e-4, "fixture", [measured("temperature", 298, "fixture")])]);
  const result = runSimulation(parseSimulation(serializeSimulation(spec)));
  assert.equal(result.trajectory.provenance, "surrogate");
  assert.throws(() => assertNoSurrogate(result.trajectory), /surrogate/);
  assert.equal(result.forceAmplitude.provenance, "derived", "radiation must not depend on viscosity");
  spec.viscosity.provenance = "derived";
  assert.throws(() => serializeSimulation(spec), /promoted/);
  spec.viscosity.provenance = "surrogate";
  spec.viscosity.surrogate!.predictiveVariance = -1;
  assert.throws(() => serializeSimulation(spec), /variance/);
});
