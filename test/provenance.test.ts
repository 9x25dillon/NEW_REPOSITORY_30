import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  GLYPH, assumed, blame, derive, isWeakerThan, measured, sources, verdict,
  weakest, surrogate, hasSurrogate, assertNoSurrogate, type Provenance,
} from "../src/provenance.js";

test("weakest picks the weakest, and assumed beats everything to the bottom", () => {
  assert.equal(weakest("measured", "derived"), "derived");
  assert.equal(weakest("measured", "measured"), "measured");
  assert.equal(weakest("derived", "assumed"), "assumed");
  assert.equal(weakest("measured", "derived", "assumed"), "assumed");
  assert.equal(weakest(), "assumed", "nothing known is not a strong position");
  assert.ok(isWeakerThan("assumed", "derived"));
  assert.ok(isWeakerThan("derived", "measured"));
  assert.ok(!isWeakerThan("measured", "assumed"));
});

test("a computed value is never measured, even from wholly measured inputs", () => {
  // Nobody measured the result. That is the difference between "we observed
  // this cell focus in 42 ms" and "we calculate that it should".
  const a = measured("density", 1068, "centrifugation, 2026-08-29");
  const b = measured("radius", 8.2e-6, "microscopy, n=40");
  const r = derive("focus time", 0.042, "from the closed form", [a, b]);
  assert.equal(r.provenance, "derived");
  assert.notEqual(r.provenance, "measured");
});

test("one assumed input anywhere upstream turns the whole chain assumed", () => {
  const width = measured("channel width", 375e-6, "profilometer");
  const medium = measured("medium density", 997, "densitometer");
  const phi = assumed("contrast factor", 0.091, "literature default, generic cell");

  const resonance = derive("resonance", 1.996e6, "c / 2w", [width, medium]);
  assert.equal(resonance.provenance, "derived", "a clean branch stays derived");

  const focus = derive("focus time", 1.87, "from the rate constant", [resonance, phi]);
  assert.equal(focus.provenance, "assumed", "the amber input must dominate");

  // and it survives any depth of exact arithmetic after the fact
  const deeper = derive("throughput", 12, "cells per second", [focus, width]);
  assert.equal(deeper.provenance, "assumed");
});

test("blame names the leaf to go and measure, not the chain it passed through", () => {
  const width = measured("channel width", 375e-6, "profilometer");
  const phi = assumed("contrast factor", 0.091, "literature default");
  const kappa = assumed("compressibility", 4.1e-10, "literature default");
  const resonance = derive("resonance", 1.996e6, "c / 2w", [width]);
  const focus = derive("focus time", 1.87, "closed form", [resonance, phi, kappa]);

  assert.deepEqual(blame(focus), ["contrast factor", "compressibility"]);
  // the intermediate is not blamed — you cannot go and measure a resonance you
  // computed, you go and measure the thing that made it amber
  assert.ok(!blame(focus).includes("resonance"));
  // a clean chain blames the measured leaves, which is the same list as its
  // sources and is what "derived" means
  assert.deepEqual(blame(resonance), []);
  assert.deepEqual(sources(focus).map((s) => s.label),
    ["channel width", "contrast factor", "compressibility"]);
});

test("blame reports each label once, in the order first met", () => {
  const phi = assumed("contrast factor", 0.09, "default");
  const one = derive("a", 1, "", [phi]);
  const two = derive("b", 2, "", [phi]);
  const both = derive("c", 3, "", [one, two]);
  assert.deepEqual(blame(both), ["contrast factor"], "no duplicates");
});

test("an assumed verdict always names a cause and an action", () => {
  const phi = assumed("contrast factor", 0.091, "literature default");
  const width = measured("channel width", 375e-6, "profilometer");
  const focus = derive("focus time", 1.87, "closed form", [width, phi]);
  const text = verdict(focus);
  assert.ok(text.includes("contrast factor"), `must name the cause: ${text}`);
  assert.ok(/measure/i.test(text), `must name the action: ${text}`);

  // a result the reader cannot act on is the failure this function prevents
  for (const p of ["measured", "derived", "assumed"] as Provenance[]) {
    const t = p === "assumed"
      ? focus
      : p === "measured" ? width : derive("clean", 1, "", [width]);
    assert.ok(verdict(t).length > 10, p);
  }
  assert.equal(new Set(Object.values(GLYPH)).size, 4, "four distinct glyphs");
});

test("surrogate uncertainty and identity survive; exact arithmetic cannot promote the estimate", () => {
  const source = derive("training output", 10, "physics solver", [measured("drive", 1, "calibrated")]);
  const estimate = surrogate("predicted force", 12, "test regression", {
    modelId: "fixture-v1", predictiveVariance: 0.04, inDomain: true,
  }, [source]);
  const result = derive("predicted trajectory", 2, "arithmetic on prediction", [estimate]);
  assert.equal(estimate.provenance, "surrogate");
  assert.equal(result.provenance, "surrogate");
  assert.ok(isWeakerThan("surrogate", "derived"));
  assert.equal(weakest("surrogate", "measured"), "surrogate");
  assert.equal(estimate.surrogate!.predictiveVariance, 0.04);
  assert.deepEqual(blame(result), ["predicted force"]);
  assert.match(verdict(result), /Re-evaluate/);
  assert.throws(() => assertNoSurrogate(result), /physics solver/);
});

test("assumed inputs remain weakest without concealing surrogate lineage", () => {
  const estimate = surrogate("surrogate force", 1, "fixture", {
    modelId: "fixture-v1", predictiveVariance: 1, inDomain: false,
  }, [assumed("particle properties", 2, "not measured")]);
  const result = derive("trajectory", 3, "computed", [estimate]);
  assert.equal(result.provenance, "assumed");
  assert.ok(hasSurrogate(result));
  assert.match(verdict(result), /Surrogate/);
  assert.deepEqual(blame(result), ["particle properties"]);
  assert.throws(() => assertNoSurrogate(result), /surrogate/);
});

test("final-result gate accepts new solver results and never relabels a prediction", () => {
  const design = measured("candidate dimensions", 1, "fixture");
  const estimated = surrogate("scout prediction", 3, "fixture", {
    modelId: "fixture-v1", predictiveVariance: 0.1, inDomain: true,
  }, [derive("training output", 2, "solver", [design])]);
  const solverResult = derive("re-evaluated force", 2.8, "new physics solver evaluation", [design]);
  assert.doesNotThrow(() => assertNoSurrogate(solverResult));
  assert.throws(() => assertNoSurrogate(estimated), /re-evaluate/);
  assert.equal(estimated.provenance, "surrogate");
});

test("surrogate constructor refuses missing uncertainty, identity, or source lineage", () => {
  const metadata = { modelId: "fixture", predictiveVariance: 0, inDomain: true };
  const source = [measured("input", 1, "fixture")];
  assert.throws(() => surrogate("x", NaN, "", metadata, source));
  assert.throws(() => surrogate("x", 1, "", { ...metadata, predictiveVariance: -1 }, source));
  assert.throws(() => surrogate("x", 1, "", { ...metadata, predictiveVariance: Infinity }, source));
  assert.throws(() => surrogate("x", 1, "", { ...metadata, modelId: "" }, source));
  assert.throws(() => surrogate("x", 1, "", metadata, []));
});
