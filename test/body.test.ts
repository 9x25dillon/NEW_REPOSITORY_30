import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  AUTONOMY, aura, autonomous, bodiesOf, largest, snap, symbolOf,
} from "../game/body.js";
import { structureFrom } from "../game/world.js";
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
  const body = bodiesOf(
    [at("622", 0, 0), at("622", 1, 0), at("622", 1, 1), at("622", 0, 1)], PITCH)[0];
  const sym = symbolOf(body);

  assert.ok(sym, "four joined cells is a crystal");
  assert.equal(sym.pointGroup, "622");
  assert.equal(sym.lattice, "P", "assembled by hand, so primitive");
  assert.ok(SOHNCKE_GROUPS.includes(sym), "and it is one of the sixty-five");
  assert.ok(isEnantiomorphic(pointGroup(sym.pointGroup)), "which are all chiral");

  // Nothing smaller gets a symbol. Two cells is not a crystal.
  assert.equal(symbolOf(bodiesOf([at("622", 0, 0), at("622", 1, 0)], PITCH)[0]), null);
});

test("every cell the game can build names a real space group", () => {
  // If any buildable group had no Sohncke entry, a player could assemble
  // something the vocabulary cannot describe.
  for (const hm of ["1", "2", "222", "3", "32", "4", "422", "6", "622", "23", "432"]) {
    const body = bodiesOf(
      [at(hm, 0, 0), at(hm, 1, 0), at(hm, 1, 1)], PITCH)[0];
    const sym = symbolOf(body);
    assert.ok(sym, `${hm} built a body with no name`);
    assert.equal(sym.pointGroup, hm);
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
