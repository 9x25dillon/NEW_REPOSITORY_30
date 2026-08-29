import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  POINT_GROUPS, SUBSTRATES, allowsSHG, isEnantiomorphic, isPiezoelectric,
  isPolar, isSHGEdgeCase, pointGroup, substrateIsViable,
} from "../src/pointgroups.ts";

test("the census: 32 groups, 11 centrosymmetric, 21 not", () => {
  assert.equal(POINT_GROUPS.length, 32);
  assert.equal(POINT_GROUPS.filter((g) => g.inversion).length, 11);
  assert.equal(POINT_GROUPS.filter((g) => !g.inversion).length, 21);
  assert.equal(new Set(POINT_GROUPS.map((g) => g.hm)).size, 32);
});

test("piezoelectric is 20, not 21 — and 432 is the one that is missing", () => {
  const piezo = POINT_GROUPS.filter(isPiezoelectric);
  assert.equal(piezo.length, 20);
  const acentric = POINT_GROUPS.filter((g) => !g.inversion);
  const missing = acentric.filter((g) => !isPiezoelectric(g)).map((g) => g.hm);
  assert.deepEqual(missing, ["432"]);
  // conflating the two would offer 432 as a substrate, and it cannot work
  assert.equal(isPiezoelectric(pointGroup("432")), false);
  assert.equal(allowsSHG(pointGroup("432")), true);
  assert.equal(isSHGEdgeCase(pointGroup("432")), true);
});

test("polar is 10, enantiomorphic is 11", () => {
  assert.equal(POINT_GROUPS.filter(isPolar).length, 10);
  assert.equal(POINT_GROUPS.filter(isEnantiomorphic).length, 11);

  // The trap: deriving chirality from the two columns this table HAS gives 12,
  // because -4 (S4) carries a 4-fold rotoinversion that neither `inversion` nor
  // `mirrors` records. Asserted so the shortcut cannot be reintroduced.
  const naive = POINT_GROUPS.filter((g) => !g.inversion && g.mirrors === 0);
  assert.equal(naive.length, 12);
  const wrong = naive.filter((g) => !isEnantiomorphic(g)).map((g) => g.hm);
  assert.deepEqual(wrong, ["-4"]);
  assert.equal(isEnantiomorphic(pointGroup("-4")), false);
  // every polar group is piezoelectric, but not the reverse
  for (const g of POINT_GROUPS.filter(isPolar)) assert.ok(isPiezoelectric(g), g.hm);
  assert.ok(isPiezoelectric(pointGroup("32")) && !isPolar(pointGroup("32")));
});

test("no centrosymmetric group is piezoelectric, polar, or SHG-active", () => {
  for (const g of POINT_GROUPS.filter((x) => x.inversion)) {
    assert.equal(isPiezoelectric(g), false, g.hm);
    assert.equal(isPolar(g), false, g.hm);
    assert.equal(allowsSHG(g), false, g.hm);
    assert.equal(isEnantiomorphic(g), false, g.hm);
  }
});

test("every substrate in the table can actually carry a wave", () => {
  assert.ok(SUBSTRATES.length >= 6);
  for (const s of SUBSTRATES) {
    assert.ok(substrateIsViable(s), `${s.name} (${s.hm}) is not piezoelectric`);
  }
  // the ones a SAW device is actually built on
  assert.equal(SUBSTRATES.find((s) => s.formula === "LiNbO3")!.hm, "3m");
  assert.equal(SUBSTRATES.find((s) => s.formula.startsWith("SiO2"))!.hm, "32");
  assert.equal(SUBSTRATES.find((s) => s.formula === "AlN")!.hm, "6mm");
  // quartz is chiral, which is why it is optically active
  assert.ok(isEnantiomorphic(pointGroup("32")));
});
