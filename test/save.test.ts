import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  type Input, type Run, birth, crown, enterWorld, feedThrone, latticePitch, placeCell, startRun,
  step, suspension, newMotif, boundsFor, retune, START, ARENA_W, ARENA_H,
} from "../game/run.js";
import {
  SAVE_SCHEMA, SAVE_VERSION, SaveError, type SaveFile, pack, restore, serialise, snapshot, unpack,
} from "../game/save.js";
import { autonomous } from "../game/body.js";
import { cellFor } from "../game/lattice.js";
import { growMitochondrion } from "../game/organelles.js";
import { craft, newResonance } from "../game/resonance.js";
import { structureFrom } from "../game/world.js";
import { rng } from "../game/wave.js";

// A save is a promise about the FUTURE, not a picture of the present: a run
// written down and read back has to go on to do exactly what the original would
// have done. So the central test here forks a lived-in run, restores one branch
// from text, drives both with the same hands, and asks for the same world at
// the end — every body, every random draw, every event, in order.

const DT = 1 / 60;
const STAMP = { build: "test", savedAt: "2026-09-28T00:00:00.000Z" };

/** The same hands, every time: a slow figure, a grip that comes and goes, a
 *  burst now and then, a trim on an expedition. A function of the frame alone. */
function hands(i: number): Input {
  return {
    move: { x: Math.sin(i * 0.031), y: Math.cos(i * 0.023) },
    grip: i % 170 < 110,
    dash: i % 211 === 0,
    trim: Math.sin(i * 0.013),
  };
}

/**
 * A run that has been somewhere: an organism big enough to walk, a
 * mitochondrion, a throne fed and crowned, and fifteen seconds of a fight — so
 * the state a save has to carry is the state a player's save WILL carry, not a
 * fresh pool with nothing in it.
 */
function lived(seed: number, expedition = false): Run {
  const run = startRun(seed);
  if (expedition) {
    run.resonance = newResonance({ seed: String(seed), trajectory: [] });
    run.resonance.fragments = 30;
  }
  const pitch = latticePitch(run);
  const home = { x: START.x + ARENA_W * 0.3, y: START.y + ARENA_H * 0.62 };
  for (let i = 0; i < 8; i++) {
    run.cells.push(cellFor(i % 2 ? "222" : "4"));
    run.you.x = home.x + (i % 4) * pitch;
    run.you.y = home.y + Math.floor(i / 4) * pitch;
    assert.equal(placeCell(run, run.cells.length - 1), "placed", `fixture cell ${i}`);
  }
  run.cells.push(cellFor("2"), cellFor("2"));
  run.you.x = run.structures[0].x;
  run.you.y = run.structures[0].y;
  assert.equal(growMitochondrion(run, 0), "grown", "fixture mitochondrion");
  if (expedition) {
    run.cells.push(cellFor("4"), cellFor("4"), cellFor("4"));
    run.you.x = START.x + ARENA_W * 0.2;
    run.you.y = START.y + ARENA_H * 0.2;
    assert.equal(craft(run, "condenser"), "crafted", "fixture condenser");
  }

  run.cells.push(cellFor("222"), cellFor("4"), cellFor("23"));
  run.you.x = run.throne.x;
  run.you.y = run.throne.y;
  assert.equal(feedThrone(run, run.cells.length - 1), "fed");
  assert.equal(feedThrone(run, run.cells.length - 1), "fed");
  assert.equal(crown(run), "crowned");
  run.you.x = home.x + pitch * 1.5;
  run.you.y = home.y - pitch;
  // A fixture, not a player: both of them have to live long enough to be saved.
  run.integrity = 99;
  run.throne.hp = run.throne.maxHp = 1e6;

  for (let i = 0; i < 900; i++) step(run, hands(i), DT);
  run.events.length = 0;
  return run;
}

/** Everything a run is, as comparable data. */
function stateOf(run: Run): unknown {
  const f = snapshot(run, STAMP);
  return { run: unpack(f.run), rng: f.rng };
}

/** Drive a run with the scripted hands; return the kinds of event, in order. */
function play(run: Run, from: number, frames: number): string[] {
  const kinds: string[] = [];
  for (let i = from; i < from + frames; i++) {
    step(run, hands(i), DT);
    for (const e of run.events) kinds.push(e.kind);
    run.events.length = 0;
  }
  return kinds;
}

// ── the promise ─────────────────────────────────────────────────────────────

for (const expedition of [false, true]) {
  test(`a restored ${expedition ? "expedition" : "run"} plays out exactly as the run it was saved from`, () => {
    const original = lived(7, expedition);
    const text = serialise(snapshot(original, STAMP));
    const { run: copy } = restore(text);

    // The fixture has to have been somewhere, or equality proves nothing.
    assert.equal(original.phase, "reign", "the fight is on");
    assert.ok(original.bodies.some(autonomous), "an organism big enough to walk");
    assert.ok(original.organelles.length > 0, "a mitochondrion");
    if (expedition) assert.ok(original.resonance!.constructs.length > 0, "an assembly");

    const a = play(original, 900, 900);
    const b = play(copy, 900, 900);

    assert.ok(a.includes("volley"), "the king threw arms in the part that was compared");
    assert.ok(new Set(a).size >= 4, `and more than the king happened: ${[...new Set(a)].join(" ")}`);
    assert.deepEqual(b, a, "the same things happened, in the same order");
    assert.deepStrictEqual(stateOf(copy), stateOf(original), "and they ended in the same world");
  });
}

test("a run saved between worlds is born into the same one", () => {
  const original = lived(11);
  original.throne.hp = 0;
  birth(original);
  assert.equal(original.phase, "birth");
  // The surface drains a frame's events before it ever saves; so does this.
  original.events.length = 0;
  const { run: copy, header } = restore(serialise(snapshot(original, STAMP)));
  assert.equal(header.phase, "birth");
  assert.deepEqual(copy.evolution.offer, original.evolution.offer, "the same cards on the table");

  enterWorld(original);
  enterWorld(copy);
  const a = play(original, 0, 600);
  const b = play(copy, 0, 600);
  assert.deepEqual(b, a);
  assert.deepStrictEqual(stateOf(copy), stateOf(original));
});

test("a restored body is made of the buildings, not copies of them", () => {
  // Walking moves `body.cells` and expects to have moved `run.structures`. A
  // body restored as copies would walk and leave every building behind — and
  // nothing on screen would say why the organism had stopped gathering.
  const { run } = restore(serialise(snapshot(lived(5), STAMP)));
  const built = new Set(run.structures);
  for (const b of run.bodies) for (const c of b.cells) assert.ok(built.has(c));
  assert.equal(run.bodies.reduce((n, b) => n + b.cells.length, 0), run.structures.length);
});

test("what JSON cannot say survives: never, a map, and negative zero", () => {
  const run = lived(3);
  run.fray.lastHit = -Infinity;
  run.fray.turned = -Infinity;
  run.bond.limbReadyAt.set(run.structures[1].id, 12.5);
  run.you.vx = -0;

  // Planted first: this is what a plain JSON round trip does to the same run.
  const naive = JSON.parse(JSON.stringify({ fray: run.fray, bond: run.bond }));
  assert.equal(naive.fray.lastHit, null, "JSON writes 'never' as null, which reads as time zero");
  assert.deepEqual(naive.bond.limbReadyAt, {}, "and a map as an empty object with no .get");

  const { run: back } = restore(serialise(snapshot(run, STAMP)));
  assert.equal(back.fray.lastHit, -Infinity);
  assert.equal(back.fray.turned, -Infinity);
  assert.ok(back.bond.limbReadyAt instanceof Map);
  assert.equal(back.bond.limbReadyAt.get(run.structures[1].id), 12.5);
  assert.ok(Object.is(back.you.vx, -0));
});

test("the random stream picks up where it was", () => {
  const r = rng(20260928);
  for (let i = 0; i < 37; i++) r();
  const s = rng(r.state);
  for (let i = 0; i < 50; i++) assert.equal(s(), r());
  // and it is the same stream the game has always drawn
  const old = (seed: number) => {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  const was = old(99), now = rng(99);
  for (let i = 0; i < 100; i++) assert.equal(now(), was(), "a seed plays the same run it always did");
});

// ── what a save refuses to write ────────────────────────────────────────────

test("a save refuses what it cannot carry, and names where it is", () => {
  const run = lived(9);
  const stub = { ...run, rand: () => 0.5 } as Run;
  assert.throws(() => snapshot(stub, STAMP), (e: unknown) =>
    e instanceof SaveError && /run\.rand/.test(e.message));

  const withSet = lived(9);
  (withSet.fray as unknown as Record<string, unknown>).marks = new Set([1]);
  assert.throws(() => snapshot(withSet, STAMP), (e: unknown) =>
    e instanceof SaveError && /run\.fray\.marks is a Set/.test(e.message));

  const withFn = lived(9);
  (withFn.throne as unknown as Record<string, unknown>).plan = () => 1;
  assert.throws(() => snapshot(withFn, STAMP), (e: unknown) =>
    e instanceof SaveError && /run\.throne\.plan is a function/.test(e.message));

  assert.throws(() => pack({ $n: 1 }), SaveError, "a key that would read back as a tag");
});

test("a save never changes the run it is taken of", () => {
  const run = lived(13);
  const before = JSON.stringify(pack({ ...run, rand: null, bodies: null }));
  const state = (run.rand as unknown as { state: number }).state;
  snapshot(run, STAMP);
  assert.equal(JSON.stringify(pack({ ...run, rand: null, bodies: null })), before);
  assert.equal((run.rand as unknown as { state: number }).state, state, "and draws nothing from its stream");
});

// ── what a load refuses to trust ────────────────────────────────────────────

test("a file is outside input: each kind of bad one is refused with a reason", () => {
  const good = snapshot(lived(17), STAMP);
  const edit = (f: (x: Record<string, any>) => void): string => {
    const x = JSON.parse(serialise(good));
    f(x);
    return JSON.stringify(x);
  };
  const refused = (text: string, why: RegExp) =>
    assert.throws(() => restore(text), (e: unknown) => e instanceof SaveError && why.test(e.message),
      `expected a refusal matching ${why}`);

  refused(serialise(good).slice(0, 5000), /not JSON/);
  refused(edit((x) => { x.schema = "something-else"; }), /not a Sonic Drifter save/);
  refused(edit((x) => { x.version = SAVE_VERSION + 1; }), /newer build/);
  refused(edit((x) => { delete x.version; }), /no version/);
  refused(edit((x) => { x.rng = -1; }), /uint32/);
  refused(edit((x) => { x.run.structures[0].hm = "5"; }), /structures\[0\]\.hm.*no point group/);
  refused(edit((x) => { x.run.cells.push("10"); }), /no point group "10"/);
  refused(edit((x) => { x.run.entities[0].x = { $n: "NaN" }; }), /entities\[0\]\.x is not a finite/);
  refused(edit((x) => { x.run.entities.find((e: any) => e.faction === "motif").parts = ["zz"]; }), /no motif "zz"/);
  refused(edit((x) => { x.run.bodies[0].cells[0] = 9999; }), /points at no structure/);
  refused(edit((x) => { x.run.bond.limbReadyAt = {}; }), /limbReadyAt is not a map/);
  refused(edit((x) => { x.run.fray.lastHit = { $x: 1 }; }), /unknown tag/);
  // Passes every audit and still cannot run a frame: the trial frame catches it.
  refused(edit((x) => { x.run.wave = null; }), /does not survive a frame/);

  assert.doesNotThrow(() => restore(serialise(good)), "and the unedited file loads");
});

test("the header names the run without decoding it", () => {
  const run = lived(19, true);
  const f: SaveFile = snapshot(run, STAMP, { tally: { volley: 3 } });
  assert.equal(f.schema, SAVE_SCHEMA);
  assert.equal(f.version, SAVE_VERSION);
  assert.deepEqual(f.header, {
    ...STAMP, aeon: 1, name: run.world.name, phase: "reign", t: run.t, score: run.score, expedition: true,
  });
  const { surface } = restore(serialise(f));
  assert.deepEqual(surface, { tally: { volley: 3 } }, "and the surface gets back what it wrote");
});

// ── what the run shares ─────────────────────────────────────────────────────

/**
 * Every object a run reaches by two routes.
 *
 * A save writes each route as its own copy, so after a load two things that
 * were ONE are two. That is harmless for a value nobody mutates in place and a
 * silent fork for anything else — which is how `bodies` had to be handled. This
 * walks a live run and lists the shared objects by path, so the day somebody
 * adds a field that aliases another, this fails and says which.
 */
function aliases(run: Run): string[] {
  const seen = new Map<object, string>();
  const found = new Set<string>();
  const norm = (p: string) => p.replace(/\[\d+\]/g, "[*]").replace(/<[^>]*>/g, "<*>");
  const walk = (v: unknown, path: string): void => {
    if (v === null || typeof v !== "object") return;
    const prev = seen.get(v);
    if (prev !== undefined) { found.add(`${norm(prev)} = ${norm(path)}`); return; }
    seen.set(v, path);
    if (v instanceof Map) { for (const [k, x] of v) walk(x, `${path}<${String(k)}>`); return; }
    if (Array.isArray(v)) { v.forEach((x, i) => walk(x, `${path}[${i}]`)); return; }
    for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
  };
  // `bodies` and `cells` are written by reference and by symbol; see save.ts.
  const rest: Record<string, unknown> = { ...run };
  for (const k of ["rand", "events", "bodies", "cells"]) delete rest[k];
  walk(rest, "run");
  return [...found].sort();
}

/**
 * The shared objects a run is allowed, and why a copy of each is the same thing.
 * Each is assigned whole and never written into, so two copies of it cannot
 * drift apart.
 */
const SHARED_BY_DESIGN = new Set([
  // A body's cells all serve the same planes and are handed one array (reshape).
  "run.structures[*].serves = run.structures[*].serves",
  // `lobes(hm)` is cached per group in shape.ts: every 622 holds the same list.
  "run.structures[*].lobes = run.structures[*].lobes",
  // `crystalOf` takes the world's medium as the crystal's matrix. A medium is
  // replaced whole when the water changes and never written into.
  "run.world.medium = run.crystal.matrix",
]);

test("everything a run shares between two places is something a save knows about", () => {
  for (const run of [lived(23), lived(29, true)]) {
    const unknown = aliases(run).filter((a) => !SHARED_BY_DESIGN.has(a));
    assert.deepEqual(unknown, [], "shared objects a save would silently split in two");
  }
});

// ── what it costs ───────────────────────────────────────────────────────────

test("a late run fits in browser storage with room to spare", () => {
  // The shape of the largest report on file: the whole channel open, a full
  // suspension, four hundred buildings. Browsers give an origin about five
  // million characters of localStorage.
  const run = startRun(31);
  run.opened = 30;
  run.bounds = boundsFor(30);
  const pitch = latticePitch(run);
  let id = 1000;
  for (let i = 0; i < 400; i++) {
    const s = structureFrom(id++, i % 3 ? "622" : "222",
      run.bounds.x + 200e-6 + (i % 25) * pitch, run.bounds.y + 200e-6 + Math.floor(i / 25) * pitch);
    run.structures.push(s);
  }
  retune(run);
  for (let i = run.entities.length; i < suspension(run); i++) run.entities.push(newMotif(run, true));
  for (let i = 0; i < 30; i++) step(run, hands(i), DT);
  for (let i = 0; i < 300; i++) run.cells.push(cellFor("622"));

  const text = serialise(snapshot(run, STAMP));
  const chars = text.length;
  assert.ok(chars < 2_500_000,
    `${run.structures.length} buildings, ${run.entities.length} bodies in the water: ${(chars / 1e6).toFixed(2)} M characters`);
  const { run: back } = restore(text);
  assert.equal(back.structures.length, run.structures.length);
  assert.equal(back.entities.length, run.entities.length);
});
