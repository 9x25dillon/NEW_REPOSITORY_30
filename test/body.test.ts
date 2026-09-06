import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  AUTONOMY, aura, autonomous, bodiesOf, growable, largest, limbsOf, seatedGroup,
  snap, symbolOf,
} from "../game/body.js";
import { structureFrom } from "../game/world.js";
import { lobes } from "../game/shape.js";
import { isEnantiomorphic, pointGroup } from "../src/pointgroups.js";
import { SOHNCKE_GROUPS } from "../src/sohncke.js";

const PITCH = 115e-6;

function at(hm: string, i: number, j: number, id = i * 100 + j) {
  return structureFrom(id, hm, 300e-6 + i * PITCH, 300e-6 + j * PITCH);
}

// ── a lattice, and a motif ──────────────────────────────────────────────────

test("a placement lands on a site, not where you were standing", () => {
  // A crystal is a lattice plus a motif. Freehand placements are a heap, and
  // nothing can be asked about a heap: not which cells are joined, not how big
  // it is, not what symmetry it has, not what its band structure does.
  const site = snap(300e-6, 300e-6, PITCH);          // an actual site to reason from
  const a = snap(site.x + PITCH * 0.02, site.y - PITCH * 0.02, PITCH);
  const b = snap(site.x + PITCH * 0.49, site.y, PITCH);
  const c = snap(site.x + PITCH * 0.51, site.y, PITCH);
  assert.deepEqual(a, site, "anything under half a step lands on the same site");
  assert.deepEqual(b, site);
  assert.notDeepEqual(b, c, "and over half a step lands on the next one");
  assert.ok(Math.abs(c.x - b.x - PITCH) < 1e-9, "which is exactly one step away");

  // Snapping is idempotent, or a body would creep every time it was rebuilt.
  assert.deepEqual(snap(a.x, a.y, PITCH), a);
  assert.deepEqual(snap(c.x, c.y, PITCH), c);
});

// ── joined, or merely nearby ────────────────────────────────────────────────

test("cells on adjacent sites are one body, and a gap makes two", () => {
  const joined = bodiesOf([at("222", 0, 0), at("222", 1, 0), at("222", 1, 1)], PITCH);
  assert.equal(joined.length, 1);
  assert.equal(joined[0].cells.length, 3);

  const split = bodiesOf([at("222", 0, 0), at("222", 1, 0), at("222", 5, 5)], PITCH);
  assert.equal(split.length, 2, "a cell three steps away is its own thing");
  assert.equal(largest(split)?.cells.length, 2, "and the bigger one is reported first");
});

test("a body may grow diagonally, or it could only ever be a plus sign", () => {
  const diagonal = bodiesOf([at("222", 0, 0), at("222", 1, 1)], PITCH);
  assert.equal(diagonal.length, 1, "one step across the diagonal is still one step");

  const knight = bodiesOf([at("222", 0, 0), at("222", 2, 1)], PITCH);
  assert.equal(knight.length, 2, "two steps is not");
});

test("a body is limited by its most symmetric cell, as a sovereign is", () => {
  const mixed = bodiesOf(
    [at("2", 0, 0), at("622", 1, 0), at("222", 0, 1)], PITCH);
  assert.equal(mixed[0].hm, "622");
  assert.equal(mixed[0].mass, 2 + 12 + 4, "and its mass is all of them");
});

// ── and it has a name ───────────────────────────────────────────────────────

test("what you have built is one of the 65 a chiral world permits", () => {
  // sohncke.ts has known these since before the game existed and had never once
  // been asked. A lattice with a point group on it IS a space group; of the 230,
  // a chiral world is restricted to 65, and a body assembled by hand on a square
  // grid has no centring in it, so the honest answer is the primitive one.
  //
  // AND THE POINT GROUP IS THE SEATED ONE. This test asserted 622 for two
  // months. A six-fold axis does not map a square net onto itself, so P622 —
  // a hexagonal space group — was being drawn on the surface for a body that
  // could not possibly be one. The cells are still 622; what they add up to on
  // this lattice is 222.
  const body = bodiesOf(
    [at("622", 0, 0), at("622", 1, 0), at("622", 1, 1), at("622", 0, 1)], PITCH)[0];
  const sym = symbolOf(body);

  assert.ok(sym, "four joined cells is a crystal");
  assert.equal(body.hm, "622", "it is still made of what you fed it");
  assert.equal(sym.pointGroup, "222", "but the square net will only seat a 222");
  assert.equal(sym.symbol, "P222");
  assert.equal(sym.lattice, "P", "assembled by hand, so primitive");
  assert.ok(SOHNCKE_GROUPS.includes(sym), "and it is one of the sixty-five");
  assert.ok(isEnantiomorphic(pointGroup(sym.pointGroup)), "which are all chiral");

  // Nothing smaller gets a symbol. Two cells is not a crystal.
  assert.equal(symbolOf(bodiesOf([at("622", 0, 0), at("622", 1, 0)], PITCH)[0]), null);
});

test("every cell the game can build names a real space group", () => {
  // If any buildable group had no Sohncke entry, a player could assemble
  // something the vocabulary cannot describe. Every seated group is a subgroup
  // of the square net's own chiral symmetry, so there are only ever five
  // answers and all five are primitive Sohncke groups.
  const SEATED: Record<string, string> = {
    "1": "1", "2": "2", "3": "1", "4": "4", "6": "2",
    "222": "222", "32": "2", "422": "422", "622": "222", "23": "222", "432": "422",
  };
  for (const [hm, want] of Object.entries(SEATED)) {
    const body = bodiesOf(
      [at(hm, 0, 0), at(hm, 1, 0), at(hm, 1, 1)], PITCH)[0];
    const sym = symbolOf(body);
    assert.ok(sym, `${hm} built a body with no name`);
    assert.equal(seatedGroup(hm), want, `${hm} seats as ${want} on a square net`);
    assert.equal(sym.pointGroup, want);
    assert.equal(sym.lattice, "P");
  }
});

// ── the crystallographic restriction, applied to a BODY ─────────────────────

test("a square net will not seat a three- or six-fold axis", () => {
  // The same theorem this game already spends on motifs — a pentamer joins
  // nothing, ever — one level up. The trap lattice is square because wave.ts
  // crosses two orthogonal SSAWs and a separable potential has a square grid of
  // nodes; there is no third wave and no way to tilt it. So a 3 or a 6 is not
  // something you can be here, however good the cell was.
  assert.equal(seatedGroup("3"), "1", "a three-fold survives as nothing but identity");
  assert.equal(seatedGroup("6"), "2", "a six-fold keeps only the two-fold inside it");
  assert.equal(seatedGroup("32"), "2");
  assert.equal(seatedGroup("622"), "222");

  // and the tetragonal ones are seated whole, because a square net IS their net
  assert.equal(seatedGroup("4"), "4");
  assert.equal(seatedGroup("422"), "422");
  assert.equal(seatedGroup("222"), "222");

  // THE RULE THIS BUYS, and it is the opposite of what a player will assume.
  // A 622 is the most symmetric thing in the game and seats as a 222; a plain 4
  // keeps every one of its arms. Order stops being the only axis of worth, and
  // nobody chose that — the lattice did.
  assert.ok(growable("4").length > growable("622").length,
    `a 4 grows ${growable("4").length} arms and a 622 grows ${growable("622").length}`);
  assert.equal(growable("622").length, 2, "two, not the six its lobes advertise");
  assert.equal(lobes("622").length, 6, "which is still what the cell's own field throws");
});

test("what the lattice seats is what a body can grow, in all eleven", () => {
  // The pair rule: `growable` and what `limbsOf` can actually see are two
  // constants that constrain each other, so this names both. A chain toward a
  // 60-degree lobe has to zigzag; every corner of a zigzag is diagonally
  // adjacent to the cell two back, `joined` counts that, and the tip comes out
  // with degree 2 — invisible as a limb. That was enforcing the seating already
  // and by accident. Here it is on purpose.
  for (const hm of ["1", "2", "3", "4", "6", "222", "32", "422", "622", "23", "432"]) {
    const dirs = growable(hm);
    let grown = 0;
    for (const [lx, ly] of dirs) {
      // a 2x2 core with one arm running out along this direction
      const sites = new Map<string, [number, number]>();
      for (const [i, j] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) sites.set(`${i},${j}`, [i, j]);
      let ci = lx > 0.3 ? 1 : 0, cj = ly > 0.3 ? 1 : 0;
      for (let k = 1; k <= 4; k++) {
        ci += Math.round(lx); cj += Math.round(ly);
        sites.set(`${ci},${cj}`, [ci, cj]);
      }
      const cells = [...sites.values()].map(([i, j], n) => at(hm, i, j, 500 + n));
      const body = bodiesOf(cells, PITCH)[0];
      if (limbsOf(body, PITCH).some((l) => !l.leg)) grown++;
    }
    assert.equal(grown, dirs.length,
      `${hm} seats as ${seatedGroup(hm)} with ${dirs.length} directions`
      + ` and grew ${grown} of them`);
  }
});

// ── and at some size it stops needing you ───────────────────────────────────

test("a big enough body works on its own", () => {
  const small = bodiesOf([at("222", 0, 0), at("222", 1, 0)], PITCH)[0];
  assert.ok(!autonomous(small));

  const cells = [];
  for (let i = 0; i < AUTONOMY; i++) cells.push(at("222", i, 0, i));
  const grown = bodiesOf(cells, PITCH)[0];
  assert.ok(autonomous(grown), "six joined cells is an organ, not a row of traps");
  assert.ok(aura(grown) > grown.extent, "and it reaches past its own edge");
});
