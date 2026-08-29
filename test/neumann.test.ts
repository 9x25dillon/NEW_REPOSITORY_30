import { strict as assert } from "node:assert";
import { test } from "node:test";
import { POINT_GROUPS, isPiezoelectric, pointGroup } from "../src/pointgroups.ts";
import { SAW_SUBSTRATES } from "../src/fields.ts";
import { GENERATORS, closeGroup, isProper, operations } from "../src/symmetry.ts";
import {
  drivableCoefficients, independentComponents, nonZeroComponents,
  projectorRank, tensorReport, voigt, type TensorKind,
} from "../src/neumann.ts";

// ── The groups themselves ───────────────────────────────────────────────────

test("every group closes from its generators to exactly its tabulated order", () => {
  // Two independently written facts: the generators here, and the order column
  // in pointgroups.ts. A group listed by hand can be silently short an element,
  // which would impose too few constraints and report too many independent
  // tensor components; a group CLOSED from generators cannot be.
  assert.equal(Object.keys(GENERATORS).length, 32);
  for (const g of POINT_GROUPS) {
    assert.equal(operations(g.hm).length, g.order, g.hm);
  }
});

test("the proper rotations are exactly half of every group that has an improper one", () => {
  for (const g of POINT_GROUPS) {
    const ops = operations(g.hm);
    const proper = ops.filter(isProper).length;
    // A group either is all proper rotations, or splits exactly in half —
    // improper operations form a coset of the rotation subgroup.
    assert.ok(proper === ops.length || proper * 2 === ops.length,
      `${g.hm}: ${proper} proper of ${ops.length}`);
  }
  // the 11 enantiomorphic groups are the all-proper ones
  const allProper = POINT_GROUPS.filter((g) => operations(g.hm).every(isProper));
  assert.equal(allProper.length, 11);
});

test("a generator that does not close is reported, not spun on forever", () => {
  // A 5-fold rotation is not crystallographic and generates no finite group
  // with a 4-fold; the cap turns an infinite loop into a message.
  const c5 = [
    [Math.cos(1.2), -Math.sin(1.2), 0],
    [Math.sin(1.2), Math.cos(1.2), 0],
    [0, 0, 1],
  ] as const;
  assert.throws(() => closeGroup([c5 as never], 50), /did not close/);
});

// ── The two methods must agree, 96 times ────────────────────────────────────

const KINDS: TensorKind[] = ["permittivity", "piezoelectric", "elastic"];

test("character theory and the explicit projector agree for all 32 x 3", () => {
  // The point of computing it twice. Method 1 is blind to WHICH components
  // survive; method 2 is vulnerable to a mis-built representation. An error in
  // either shows up here as a disagreement rather than as a plausible table.
  for (const g of POINT_GROUPS) {
    for (const kind of KINDS) {
      assert.equal(
        projectorRank(g.hm, kind), independentComponents(g.hm, kind),
        `${g.hm} / ${kind}`,
      );
    }
  }
});

// ── Against the published tables ────────────────────────────────────────────

test("the piezoelectric counts are the standard table, group for group", () => {
  const expected: Record<string, number> = {
    "1": 18, "-1": 0, "2": 8, "m": 10, "2/m": 0,
    "222": 3, "mm2": 5, "mmm": 0,
    "4": 4, "-4": 4, "4/m": 0, "422": 1, "4mm": 3, "-42m": 2, "4/mmm": 0,
    "3": 6, "-3": 0, "32": 2, "3m": 4, "-3m": 0,
    "6": 4, "-6": 2, "6/m": 0, "622": 1, "6mm": 3, "-6m2": 1, "6/mmm": 0,
    "23": 1, "m-3": 0, "432": 0, "-43m": 1, "m-3m": 0,
  };
  for (const g of POINT_GROUPS) {
    assert.equal(independentComponents(g.hm, "piezoelectric"), expected[g.hm], g.hm);
  }
});

test("the elastic counts are the standard table: 21, 13, 9, 7/6, 5, 3", () => {
  const expected: Record<string, number> = {
    "1": 21, "-1": 21, "2": 13, "m": 13, "2/m": 13,
    "222": 9, "mm2": 9, "mmm": 9,
    "4": 7, "-4": 7, "4/m": 7, "422": 6, "4mm": 6, "-42m": 6, "4/mmm": 6,
    "3": 7, "-3": 7, "32": 6, "3m": 6, "-3m": 6,
    "6": 5, "-6": 5, "6/m": 5, "622": 5, "6mm": 5, "-6m2": 5, "6/mmm": 5,
    "23": 3, "m-3": 3, "432": 3, "-43m": 3, "m-3m": 3,
  };
  for (const g of POINT_GROUPS) {
    assert.equal(independentComponents(g.hm, "elastic"), expected[g.hm], g.hm);
  }
});

test("permittivity is 6 / 4 / 3 / 2 / 1 down the systems", () => {
  const bySystem: Record<string, number> = {
    triclinic: 6, monoclinic: 4, orthorhombic: 3,
    tetragonal: 2, trigonal: 2, hexagonal: 2, cubic: 1,
  };
  for (const g of POINT_GROUPS) {
    assert.equal(independentComponents(g.hm, "permittivity"), bySystem[g.system], g.hm);
  }
});

// ── Parity: the whole reason piezoelectricity is special ────────────────────

test("odd rank dies under inversion; even rank does not even notice it", () => {
  // A rank-3 tensor is odd under inversion, so in a centrosymmetric group every
  // component equals its own negative. Rank 2 and rank 4 are even and survive —
  // which is why a centrosymmetric crystal still has a dielectric constant and
  // still rings elastically, but cannot be driven by a field.
  for (const g of POINT_GROUPS.filter((x) => x.inversion)) {
    assert.equal(independentComponents(g.hm, "piezoelectric"), 0, g.hm);
    assert.deepEqual(drivableCoefficients(g.hm), [], g.hm);
    assert.ok(independentComponents(g.hm, "permittivity") > 0, g.hm);
    assert.ok(independentComponents(g.hm, "elastic") > 0, g.hm);
  }
  // and adding inversion to a group leaves the even-rank counts untouched
  for (const [bare, withI] of [["1", "-1"], ["2", "2/m"], ["222", "mmm"],
                               ["4", "4/m"], ["3", "-3"], ["6", "6/m"],
                               ["23", "m-3"], ["432", "m-3m"]] as const) {
    for (const kind of ["permittivity", "elastic"] as TensorKind[]) {
      assert.equal(independentComponents(bare, kind), independentComponents(withI, kind),
        `${bare} vs ${withI} / ${kind}`);
    }
  }
});

test("432 has no piezoelectric tensor, derived from characters rather than asserted", () => {
  // pointgroups.ts NAMES 432 as the non-centrosymmetric group that is still not
  // piezoelectric. Here that fact falls out of the arithmetic, from a module
  // that was never told about it — the census and the group theory closing on
  // each other from opposite directions.
  const g = pointGroup("432");
  assert.equal(g.inversion, false);
  assert.equal(independentComponents("432", "piezoelectric"), 0);
  assert.equal(isPiezoelectric(g), false);

  // and it is the ONLY such group: everything else acentric has a tensor
  const acentricWithout = POINT_GROUPS
    .filter((x) => !x.inversion && independentComponents(x.hm, "piezoelectric") === 0)
    .map((x) => x.hm);
  assert.deepEqual(acentricWithout, ["432"]);
  // which reproduces the census exactly: 21 acentric, 20 piezoelectric
  assert.equal(POINT_GROUPS.filter((x) => !x.inversion).length, 21);
  assert.equal(
    POINT_GROUPS.filter((x) => independentComponents(x.hm, "piezoelectric") > 0).length, 20);
});

// ── Patterns, and the design question ───────────────────────────────────────

test("Voigt pairing is the standard 11 22 33 23 13 12 -> 1..6", () => {
  assert.equal(voigt(0, 0), 1);
  assert.equal(voigt(1, 1), 2);
  assert.equal(voigt(2, 2), 3);
  assert.equal(voigt(1, 2), 4);
  assert.equal(voigt(2, 1), 4);
  assert.equal(voigt(0, 2), 5);
  assert.equal(voigt(0, 1), 6);
});

test("the pattern never has fewer distinct labels than there are free components", () => {
  for (const g of POINT_GROUPS) {
    for (const kind of KINDS) {
      const r = tensorReport(g.hm, kind);
      assert.ok(r.nonZero.length >= r.independent,
        `${g.hm}/${kind}: ${r.nonZero.length} labels for ${r.independent} free components`);
      if (r.independent === 0) assert.equal(r.nonZero.length, 0, `${g.hm}/${kind}`);
    }
  }
});

test("lithium niobate can be driven on the shear coefficient an IDT uses", () => {
  const ln = SAW_SUBSTRATES.find((s) => s.name === "Lithium niobate")!;
  assert.equal(ln.hm, "3m");
  const d = drivableCoefficients("3m");
  // 3m keeps four independent moduli; d15 is the large shear one a Rayleigh
  // wave is launched on, and d33 the longitudinal one.
  assert.equal(independentComponents("3m", "piezoelectric"), 4);
  assert.ok(d.includes("d15"), `3m should allow d15, got ${d.join(" ")}`);
  assert.ok(d.includes("d33"), `3m should allow d33, got ${d.join(" ")}`);

  // every SSAW substrate has a non-empty set — the symmetry table, the velocity
  // table and the tensor computation all agreeing about the same wafers
  for (const s of SAW_SUBSTRATES) {
    assert.ok(drivableCoefficients(s.hm).length > 0, `${s.name} (${s.hm})`);
    assert.ok(isPiezoelectric(pointGroup(s.hm)), s.name);
  }
});

test("cubic crystals are elastically simple and dielectrically isotropic", () => {
  for (const g of POINT_GROUPS.filter((x) => x.system === "cubic")) {
    assert.equal(independentComponents(g.hm, "elastic"), 3, g.hm);
    assert.equal(independentComponents(g.hm, "permittivity"), 1, g.hm);
    // one dielectric constant means the labels are the three diagonal ones only
    assert.deepEqual(nonZeroComponents(g.hm, "permittivity"), ["e11", "e22", "e33"], g.hm);
  }
  // triclinic, by contrast, has everything
  assert.equal(nonZeroComponents("1", "permittivity").length, 6);
  assert.equal(independentComponents("1", "elastic"), 21);
});
