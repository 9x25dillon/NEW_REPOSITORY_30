import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  BUILDABLE, RECIPES, SEED_MASS, assemble, cellFor, motif, optionsFor,
} from "../game/lattice.js";
import { POINT_GROUPS, isEnantiomorphic, isPolar, isPiezoelectric } from "../src/pointgroups.js";
import { allowsChiral } from "../src/sohncke.js";

test("the recipes build exactly the eleven groups a chiral world permits", () => {
  // This is the whole crafting system's licence. The buildable list is not a
  // design decision anyone made — it is the enantiomorphic point groups, which
  // is what a molecule built from L-amino acids is restricted to, and if the
  // two sets ever diverge one of them is wrong.
  const chiral = POINT_GROUPS.filter(isEnantiomorphic).map((g) => g.hm).sort();
  assert.deepEqual([...BUILDABLE].sort(), chiral);
  assert.equal(BUILDABLE.length, 11);
  assert.equal(new Set(BUILDABLE).size, 11, "no group is buildable two ways");
});

test("every buildable group actually admits a chiral molecule", () => {
  for (const hm of BUILDABLE) {
    assert.ok(allowsChiral(hm), `${hm} should admit a protein`);
  }
});

test("each recipe is a generation, not a lookup", () => {
  // Every recipe is one principal axis, optionally joined by a two-fold across
  // it or a three-fold down a body diagonal. Nothing else generates a chiral
  // group, so nothing else is a recipe.
  for (const r of RECIPES) {
    const roles = r.parts.map((p) => motif(p).role);
    assert.equal(roles.filter((x) => x === "axial").length, 1,
      `${r.group}: exactly one principal axis`);
    assert.ok(r.parts.length <= 2, `${r.group}: at most one companion`);
  }
});

test("a five-fold axis crystallises with nothing, ever", () => {
  // The crystallographic restriction theorem, as a game rule. There is no
  // combination hidden behind it and the test is exhaustive over the motifs.
  const ids = ["a1", "a2", "a3", "a4", "a5", "a6", "g", "d"];
  for (const other of ids) {
    const a = assemble(["a5", other, "a5", "a5", "a5", other]);
    assert.equal(a.group, null, `a5 + ${other} must not crystallise`);
    assert.equal(a.crystallises, false);
    assert.equal(a.partial, false, "and it is never worth carrying on with");
  }
  assert.equal(assemble(["a5", "a5", "a5", "a5"]).refusal, "five-fold");
});

test("two different principal axes are refused, and say why", () => {
  const a = assemble(["a2", "a4"]);
  assert.equal(a.group, null);
  assert.equal(a.refusal, "two-axes");
  // but repeats of the SAME axis are just mass
  assert.equal(assemble(["a2", "a2", "a2", "a2"]).group, "2");
});

test("a companion alone is incomplete, but two companions are refused", () => {
  // A lone girdle is not wrong, it is unfinished: bring it an axis and it is a
  // 222. Two companions and no axis is the refusal, because there is then
  // nothing for either of them to be across.
  const lone = assemble(["g", "g", "g", "g"]);
  assert.equal(lone.group, null);
  assert.equal(lone.refusal, null, "not refused - just waiting for an axis");
  assert.equal(lone.partial, true);

  const both = assemble(["g", "d", "g", "d"]);
  assert.equal(both.group, null);
  assert.equal(both.refusal, "no-axis");
  assert.equal(both.partial, false);
});

test("variety picks the group; mass decides whether it is a crystal", () => {
  const three = assemble(["a2", "a2", "a2"]);
  assert.equal(three.group, "2", "three dimers already generate the group");
  assert.equal(three.crystallises, false, "but a unit cell is not a crystal");
  assert.equal(three.partial, true);

  const four = assemble(["a2", "a2", "a2", "a2"]);
  assert.equal(four.mass, SEED_MASS);
  assert.ok(four.crystallises);

  // adding a fifth changes the mass and not the group
  assert.equal(assemble(["a2", "a2", "a2", "a2", "a2"]).group, "2");
  // adding a girdle changes the group and not the mass rule
  assert.equal(assemble(["a2", "a2", "a2", "g"]).group, "222");
});

test("what a cell can do is read off its group, never assigned", () => {
  for (const hm of BUILDABLE) {
    const c = cellFor(hm);
    const g = c.group;
    if (isPolar(g)) assert.equal(c.ability, "thrust", `${hm} is polar`);
    else if (isPiezoelectric(g)) assert.equal(c.ability, "weave", `${hm} is piezo, not polar`);
    else assert.equal(c.ability, "anchor", `${hm} is neither`);
    assert.equal(c.structure, g.order);
    assert.ok(c.variants >= 1, `${hm} must be realisable as some space group`);
  }
});

test("432 is the one cell that cannot be driven at all", () => {
  // The famous edge case, load-bearing here: non-centrosymmetric and still not
  // piezoelectric, so its rank-3 tensor vanishes outright and there is no
  // coefficient left to drive it with. It is the strongest thing buildable and
  // the only one with no active use.
  const k = cellFor("432");
  assert.equal(k.ability, "anchor");
  assert.equal(k.freedom, 0);
  assert.equal(k.structure, 24);
  const others = BUILDABLE.filter((h) => h !== "432").map(cellFor);
  assert.ok(others.every((c) => c.freedom > 0), "everything else has some handle");
  assert.ok(others.every((c) => c.structure < 24), "and nothing else is as strong");
});

test("structure and freedom pull against each other", () => {
  // Neumann's principle sets this rate, and it is the game's whole economy: the
  // more symmetry holds a cell together, the fewer independent components
  // survive to drive it by. Nothing here is a balance decision.
  const cells = BUILDABLE.map(cellFor);
  const one = cellFor("1");
  assert.equal(one.structure, 1);
  assert.equal(one.freedom, 18, "the group with no symmetry keeps every component");

  for (const c of cells) {
    assert.ok(!(c.structure >= 8 && c.freedom >= 3),
      `${c.group.hm} would be both strong and free`);
  }

  // rank correlation, computed rather than asserted by eye
  let concordant = 0, discordant = 0;
  for (let i = 0; i < cells.length; i++) {
    for (let j = i + 1; j < cells.length; j++) {
      const ds = Math.sign(cells[i].structure - cells[j].structure);
      const df = Math.sign(cells[i].freedom - cells[j].freedom);
      if (ds * df > 0) concordant++;
      else if (ds * df < 0) discordant++;
    }
  }
  assert.ok(discordant > concordant * 4,
    `expected a strongly negative relation, got ${concordant} vs ${discordant}`);
});

test("a cluster knows what it could still become", () => {
  // The line the player never had. Three dimers are one girdle from a 222, one
  // diagonal from a cubic 23, and one more dimer from a plain 2 — three
  // different futures, and the game used to show a row of pips counting mass,
  // which says how far along you are and nothing about what you are choosing.
  const pool = ["a2", "a2", "a2", "g", "d"];
  const groups = (parts: string[]) => optionsFor(parts, pool).map((o) => o.group);

  assert.deepEqual(groups(["a2", "a2"]), ["2", "222", "23"]);
  assert.deepEqual(optionsFor(["a2"], pool).map((o) => o.needs), [null, "g", "d"]);

  // Committed: once a girdle is in, the cubic road is shut.
  assert.deepEqual(groups(["a2", "g"]), ["222"]);
  assert.deepEqual(groups(["a2", "d"]), ["23"]);

  // And a cluster holding all three is going nowhere, which is the trap.
  assert.deepEqual(groups(["a2", "g", "d"]), []);

  // It never offers what this water cannot supply: a girdle alone could be a
  // 222, but only where there are dimers to find.
  assert.deepEqual(groups(["g"]), ["222"]);
  assert.deepEqual(optionsFor(["g"], ["g"]).map((o) => o.group), []);
});
