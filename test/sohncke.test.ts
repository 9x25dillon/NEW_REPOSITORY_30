import { strict as assert } from "node:assert";
import { test } from "node:test";
import { POINT_GROUPS, isEnantiomorphic } from "../src/pointgroups.js";
import {
  SOHNCKE_GROUPS, allowsChiral, axialPattern, candidates, groupsOfPointGroup,
  latticeAllows, reflectionAllowed, screwAllows, spaceGroup,
} from "../src/sohncke.js";

test("there are exactly 65, numbered inside 1..230 and all distinct", () => {
  assert.equal(SOHNCKE_GROUPS.length, 65);
  assert.equal(new Set(SOHNCKE_GROUPS.map((s) => s.symbol)).size, 65);
  assert.equal(new Set(SOHNCKE_GROUPS.map((s) => s.number)).size, 65);
  for (const s of SOHNCKE_GROUPS) {
    assert.ok(s.number >= 1 && s.number <= 230, `${s.symbol} = ${s.number}`);
  }
  // International Tables order
  for (let i = 1; i < SOHNCKE_GROUPS.length; i++) {
    assert.ok(SOHNCKE_GROUPS[i].number > SOHNCKE_GROUPS[i - 1].number,
      `${SOHNCKE_GROUPS[i].symbol} is out of order`);
  }
});

test("their point groups are EXACTLY the 11 chiral ones", () => {
  // The claim that ties this file to neumann.ts and the restriction theorem: a
  // protein is chiral, so it can only sit in a group with no mirror, no
  // inversion and no rotoinversion — and those are precisely the 11 that
  // pointgroups.isEnantiomorphic already computes, from a module that knows
  // nothing about proteins.
  const used = new Set(SOHNCKE_GROUPS.map((s) => s.pointGroup));
  const chiral = new Set(POINT_GROUPS.filter(isEnantiomorphic).map((g) => g.hm));
  assert.equal(chiral.size, 11);
  assert.deepEqual(used, chiral);

  // and every one of the 11 is actually populated — none is chiral in theory
  // and empty in practice
  for (const hm of chiral) {
    assert.ok(groupsOfPointGroup(hm).length > 0, `${hm} has no space groups`);
    assert.ok(allowsChiral(hm), hm);
  }
  // the other 21 are closed to protein crystallography outright
  for (const g of POINT_GROUPS.filter((x) => !isEnantiomorphic(x))) {
    assert.equal(allowsChiral(g.hm), false, g.hm);
    assert.equal(groupsOfPointGroup(g.hm).length, 0, g.hm);
  }
});

test("the census by point group adds to 65", () => {
  const expect: Record<string, number> = {
    "1": 1, "2": 3, "222": 9, "4": 6, "422": 10,
    "3": 4, "32": 7, "6": 6, "622": 6, "23": 5, "432": 8,
  };
  let total = 0;
  for (const [hm, n] of Object.entries(expect)) {
    assert.equal(groupsOfPointGroup(hm).length, n, hm);
    total += n;
  }
  assert.equal(total, 65);
});

test("the 11 enantiomorphic pairs are mutual, and nothing is its own partner", () => {
  // Screw axes of opposite hand: P41 and P43 are the same group built
  // left-handed and right-handed, and no diffraction experiment without
  // anomalous signal can tell them apart.
  const paired = SOHNCKE_GROUPS.filter((s) => s.enantiomorph);
  assert.equal(paired.length, 22, "eleven pairs is twenty-two groups");
  for (const s of paired) {
    const other = spaceGroup(s.enantiomorph!);
    assert.equal(other.enantiomorph, s.symbol, `${s.symbol} <-> ${other.symbol} is not mutual`);
    assert.notEqual(other.symbol, s.symbol, "a group cannot be its own opposite hand");
    assert.equal(other.pointGroup, s.pointGroup, "a pair shares a point group");
    assert.equal(other.lattice, s.lattice);
  }
  assert.equal(new Set(paired.map((s) => [s.symbol, s.enantiomorph].sort().join("/"))).size, 11);
});

// ── Systematic absences ─────────────────────────────────────────────────────

test("lattice centring extinguishes the classes it should", () => {
  assert.ok(latticeAllows("P", 1, 2, 3));
  // C: h+k even
  assert.ok(latticeAllows("C", 1, 1, 5));
  assert.ok(!latticeAllows("C", 1, 2, 5));
  // I: h+k+l even
  assert.ok(latticeAllows("I", 1, 2, 3));
  assert.ok(!latticeAllows("I", 1, 1, 1));
  // F: all even or all odd
  assert.ok(latticeAllows("F", 2, 4, 6));
  assert.ok(latticeAllows("F", 1, 3, 5));
  assert.ok(!latticeAllows("F", 1, 2, 3));
  // R obverse: -h+k+l divisible by 3
  assert.ok(latticeAllows("R", 0, 0, 3));
  assert.ok(!latticeAllows("R", 0, 0, 1));
});

test("a screw axis extinguishes ONLY its own axis, never the general pattern", () => {
  // The classic way to get this wrong is to apply an axial condition to a
  // general reflection, which extinguishes most of the pattern.
  const p212121 = spaceGroup("P212121");
  // 00l present only for even l
  assert.ok(reflectionAllowed(p212121, 0, 0, 2));
  assert.ok(!reflectionAllowed(p212121, 0, 0, 3));
  // same on the other two axes
  assert.ok(!reflectionAllowed(p212121, 1, 0, 0));
  assert.ok(reflectionAllowed(p212121, 2, 0, 0));
  assert.ok(!reflectionAllowed(p212121, 0, 1, 0));
  // but a general reflection with odd indices is untouched
  assert.ok(reflectionAllowed(p212121, 1, 1, 1), "a screw must not touch hkl");
  assert.ok(reflectionAllowed(p212121, 3, 5, 7));
  // and a reflection in a plane containing the axis is also untouched
  assert.ok(reflectionAllowed(p212121, 1, 0, 1));
});

test("the axial period names the screw: 2-fold halves, 4-fold quarters, 6-fold sixths", () => {
  assert.deepEqual(axialPattern(spaceGroup("P21"), "b", 8), [2, 4, 6, 8]);
  assert.deepEqual(axialPattern(spaceGroup("P41"), "c", 12), [4, 8, 12]);
  assert.deepEqual(axialPattern(spaceGroup("P43"), "c", 12), [4, 8, 12]);
  assert.deepEqual(axialPattern(spaceGroup("P61"), "c", 12), [6, 12]);
  assert.deepEqual(axialPattern(spaceGroup("P31"), "c", 9), [3, 6, 9]);
  // 42 is a HALF turn per step, so its period is 2 and not 4 — gcd(4,2) = 2.
  // Reading the subscript as the period would predict quarters and be wrong.
  assert.deepEqual(axialPattern(spaceGroup("P42"), "c", 8), [2, 4, 6, 8]);
  assert.deepEqual(axialPattern(spaceGroup("P63"), "c", 8), [2, 4, 6, 8]);
  // 62 gives thirds: gcd(6,2) = 2, period 3
  assert.deepEqual(axialPattern(spaceGroup("P62"), "c", 9), [3, 6, 9]);
  // no screw at all: everything present
  assert.deepEqual(axialPattern(spaceGroup("P1"), "c", 5), [1, 2, 3, 4, 5]);
});

test("observed reflections rule groups OUT, and an enantiomorphic pair is never split", () => {
  // 00l with odd l present rules out every c-axis screw of even period.
  const seen = [{ h: 0, k: 0, l: 3 }, { h: 1, k: 1, l: 1 }];
  const left = candidates(seen);
  assert.ok(left.length > 0);
  for (const sg of left) assert.ok(reflectionAllowed(sg, 0, 0, 3), sg.symbol);
  assert.ok(!left.some((s) => s.symbol === "P41"), "P41 forbids 003");
  assert.ok(!left.some((s) => s.symbol === "P212121"), "P212121 forbids 003");

  // A pair of opposite hand has identical absences, so absences can never
  // choose between them — which is exactly why the hand needs anomalous
  // scattering to settle and is a real limit on the method, not a gap here.
  for (const sg of SOHNCKE_GROUPS.filter((s) => s.enantiomorph)) {
    const other = spaceGroup(sg.enantiomorph!);
    for (let i = 1; i <= 12; i++) {
      assert.equal(reflectionAllowed(sg, 0, 0, i), reflectionAllowed(other, 0, 0, i),
        `${sg.symbol} and ${other.symbol} differ at 00${i}`);
    }
  }
});

test("the groups a protein is actually usually found in are all present", () => {
  // The workhorses of the PDB. Flagged qualitatively: exact proportions move
  // with every release and belong in a live query rather than a constant here.
  for (const s of ["P212121", "P21", "C2", "P21212", "C2221", "P3121", "P3221",
                   "P41212", "P43212", "P61", "P6122", "P1", "R32"]) {
    const sg = spaceGroup(s);
    assert.equal(sg.common, true, `${s} should be flagged common`);
  }
  assert.throws(() => spaceGroup("P21/c"), /not a Sohncke group/);
  assert.throws(() => spaceGroup("Pnma"), /not a Sohncke group/);
});
