// game/save.ts — a run, written down so it can be picked up again.
//
// Runs are twenty to fifty minutes now, and until this file a reload threw the
// whole of one away: the run lived in page memory and nowhere else. The other
// thing a save is FOR matters as much to whoever works on this game: a
// `drifter.report()` says what happened, and a save file IS what happened. A
// player's saved run can be loaded headless and measured, which is the only
// kind of evidence the handoff has ever trusted.
//
// THE CONTRACT, which the tests hold this module to:
//
//   1. restore(snapshot(run)) followed by N identical frames reaches exactly the
//      state `run` reaches after the same N frames. Not "close": equal, on the
//      same build. The randomness is part of the state (`Rng.state`), so a
//      restored run draws the same numbers the original would have.
//   2. What cannot be written down is refused at SAVE time, by path — a
//      function, a Set, a class instance. A save that silently dropped a field
//      would load into a run that differs in a way nothing on screen shows.
//   3. What cannot be trusted is refused at LOAD time. A file is outside input:
//      its schema, its version, every group and species it names, and whether
//      one frame of it actually runs, are all checked before a run is returned.
//   4. Across builds the guarantee is weaker and says so: a save carries the
//      build that wrote it, loads into a newer build as that build's rules, and
//      does not promise the same future. Migrations are explicit, one version
//      at a time, and a file from a NEWER build than this one is refused rather
//      than guessed at.
//
// Pure. No DOM, no clock, no storage — the caller supplies the time and decides
// where the text goes. The same function writes an autosave, an export and a
// test fixture.

import { type Run, step } from "./run.js";
import { type Structure } from "./world.js";
import { type Body } from "./body.js";
import { type Cell, cellFor, motif } from "./lattice.js";
import { beast } from "./beasts.js";
import { rng } from "./wave.js";
import { pointGroup } from "../src/pointgroups.js";

export const SAVE_SCHEMA = "sonic-drifter.save";
export const SAVE_VERSION = 1;

/** Refused, with the path that was refused and why. */
export class SaveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SaveError";
  }
}

/** JSON, as a type. Everything in a save file is one of these. */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** What the caller knows and the game does not: which build, and when. */
export interface SaveStamp {
  /** Whatever identifies the code that wrote it — a content hash, a commit. */
  build: string;
  /** ISO 8601. The game has no clock of its own and should not grow one. */
  savedAt: string;
}

/**
 * Enough to put a run on a title screen without decoding it: a save of a late
 * run is a megabyte, and "CONTINUE · AEON 6 · 18:22" should not cost one.
 */
export interface SaveHeader extends SaveStamp {
  aeon: number;
  name: string;
  phase: Run["phase"];
  /** Run seconds. */
  t: number;
  score: number;
  /** A Resonant Expedition, rather than an ordinary run. */
  expedition: boolean;
}

export interface SaveFile {
  schema: typeof SAVE_SCHEMA;
  version: number;
  header: SaveHeader;
  /** The random stream's state. `rng(this)` continues it exactly. */
  rng: number;
  run: Json;
  /** Opaque to the game: whatever the surface wants back (tallies, lessons). */
  surface: Json;
}

// ── the codec ───────────────────────────────────────────────────────────────
//
// JSON cannot say four things a run holds, and three of them are in it today:
//
//   -Infinity   `fray.lastHit` and `fray.turned` start there, meaning "never".
//               JSON writes null, and `run.t - null` is `run.t`: a restored run
//               would believe you were hit at time zero.
//   Map         `bond.limbReadyAt`. JSON writes `{}` and a Map with no entries
//               comes back as an object with no `.get`.
//   -0          harmless almost everywhere, and `Math.atan2(0, -0)` is pi.
//   NaN         should never be in a run. Carried rather than hidden, so the
//               load-time checks can name where it is.
//
// Each is written as a one-key object whose key starts with `$`, and no plain
// object in a run may have such a key — checked, so the tags cannot collide.

function tagged(v: object): string | null {
  const keys = Object.keys(v);
  return keys.length === 1 && keys[0].startsWith("$") ? keys[0] : null;
}

/** Write a value as JSON-safe data, refusing anything that is not data. */
export function pack(v: unknown, path = "$"): Json {
  if (v === null) return null;
  switch (typeof v) {
    case "number":
      if (Number.isFinite(v)) return Object.is(v, -0) ? { $n: "-0" } : v;
      return { $n: String(v) };
    case "string":
    case "boolean":
      return v;
    case "object": {
      if (Array.isArray(v)) {
        return v.map((x, i) => {
          if (x === undefined) throw new SaveError(`${path}[${i}] is undefined`);
          return pack(x, `${path}[${i}]`);
        });
      }
      if (v instanceof Map) {
        return { $map: [...v].map(([k, x], i) => [pack(k, `${path}<key ${i}>`), pack(x, `${path}<${String(k)}>`)]) };
      }
      const proto = Object.getPrototypeOf(v);
      if (proto !== Object.prototype && proto !== null) {
        const name = (v as { constructor?: { name?: string } }).constructor?.name ?? "an object";
        throw new SaveError(`${path} is a ${name}, which a save cannot carry. Teach game/save.ts to write it.`);
      }
      const out: { [key: string]: Json } = {};
      for (const [k, x] of Object.entries(v)) {
        if (k.startsWith("$")) throw new SaveError(`${path}.${k}: a key beginning with $ would read back as a tag`);
        if (x === undefined) continue;   // an absent optional field, as JSON has it
        out[k] = pack(x, `${path}.${k}`);
      }
      return out;
    }
    default:
      throw new SaveError(`${path} is a ${typeof v}. A run is data; this is not.`);
  }
}

/** Read back what `pack` wrote. */
export function unpack(v: Json, path = "$"): unknown {
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map((x, i) => unpack(x, `${path}[${i}]`));
  const tag = tagged(v);
  if (tag === "$n") {
    const s = v.$n;
    if (s === "-0") return -0;
    if (s === "Infinity") return Infinity;
    if (s === "-Infinity") return -Infinity;
    if (s === "NaN") return NaN;
    throw new SaveError(`${path}: ${JSON.stringify(s)} is not a number`);
  }
  if (tag === "$map") {
    const pairs = v.$map;
    if (!Array.isArray(pairs)) throw new SaveError(`${path}: a map is written as pairs`);
    return new Map<unknown, unknown>(pairs.map((p, i): [unknown, unknown] => {
      if (!Array.isArray(p) || p.length !== 2) throw new SaveError(`${path}<${i}>: not a pair`);
      return [unpack(p[0], `${path}<key ${i}>`), unpack(p[1], `${path}<${i}>`)];
    }));
  }
  if (tag !== null) throw new SaveError(`${path}: unknown tag ${tag}`);
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v)) out[k] = unpack(x, `${path}.${k}`);
  return out;
}

// ── a run ───────────────────────────────────────────────────────────────────
//
// Four fields are not written as they stand:
//
//   rand      a closure. Its state is one word and is written as `rng`.
//   events    this frame's news, already drained by the surface. A restored
//             run starts with none, as every frame does.
//   bodies    each body's `cells` ARE members of `run.structures` — the same
//             objects, which is how a body that walks moves the buildings it is
//             made of. Written as copies, a restored body would walk and leave
//             every building where it was. So a body is written as INDICES into
//             `structures` and joined back to them on load.
//   cells     the rack. A cell is its point group and everything else about it
//             is computed from that (`cellFor`), including a reference into the
//             point-group table, so it is written as its symbol.

interface WrittenBody extends Omit<Body, "cells"> { cells: number[] }

/** The fields of a run that are written some other way, or not at all. */
const UNWRITTEN: readonly (keyof Run)[] = ["rand", "events", "bodies", "cells"];

/** The random stream's state, or a refusal if the run's randomness is not one. */
function streamOf(run: Run): number {
  const s = (run.rand as unknown as { state?: unknown }).state;
  if (typeof s !== "number" || !Number.isInteger(s) || s < 0 || s > 0xffffffff) {
    throw new SaveError("run.rand is not a seeded stream, so what it draws next cannot be written down");
  }
  return s;
}

export function headerOf(run: Run, stamp: SaveStamp): SaveHeader {
  return {
    ...stamp,
    aeon: run.world.aeon,
    name: run.world.name,
    phase: run.phase,
    t: run.t,
    score: run.score,
    expedition: run.resonance !== null,
  };
}

/**
 * Write a run down.
 *
 * Throws a `SaveError` naming the path of anything it cannot carry. It never
 * mutates the run and never returns a partial file.
 */
export function snapshot(run: Run, stamp: SaveStamp, surface: unknown = null): SaveFile {
  const index = new Map<Structure, number>();
  run.structures.forEach((s, i) => index.set(s, i));
  const bodies: WrittenBody[] = run.bodies.map((b, bi) => ({
    ...b,
    cells: b.cells.map((c, ci) => {
      const i = index.get(c);
      if (i === undefined) {
        throw new SaveError(`run.bodies[${bi}].cells[${ci}] (structure ${c.id}) is not in run.structures: `
          + "a body is out of date with what is built, which is a bug before it is a save problem");
      }
      return i;
    }),
  }));
  const rest: Record<string, unknown> = { ...run };
  for (const k of UNWRITTEN) delete rest[k];
  return {
    schema: SAVE_SCHEMA,
    version: SAVE_VERSION,
    header: headerOf(run, stamp),
    rng: streamOf(run),
    run: pack({ ...rest, bodies, cells: run.cells.map((c) => c.group.hm) }, "run"),
    surface: pack(surface, "surface"),
  };
}

// ── reading one back ────────────────────────────────────────────────────────

/**
 * One version forward, per entry: MIGRATIONS[v] turns a version-v file into a
 * version-(v+1) one. Empty today. When `Run` changes shape in a way an old file
 * cannot express — a renamed field, a new one with no sensible zero — the change
 * lands here with a test that loads a file written before it.
 */
const MIGRATIONS: Readonly<Record<number, (file: Record<string, unknown>) => Record<string, unknown>>> = {};

function object(v: unknown, what: string): Record<string, unknown> {
  if (v === null || typeof v !== "object" || Array.isArray(v)) throw new SaveError(`${what} is not an object`);
  return v as Record<string, unknown>;
}

function list(v: unknown, what: string): unknown[] {
  if (!Array.isArray(v)) throw new SaveError(`${what} is not a list`);
  return v;
}

function finite(v: unknown, what: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new SaveError(`${what} is not a finite number`);
  return v;
}

function group(hm: unknown, what: string): string {
  if (typeof hm !== "string") throw new SaveError(`${what} is not a point group symbol`);
  try { pointGroup(hm); } catch { throw new SaveError(`${what}: there is no point group ${JSON.stringify(hm)}`); }
  return hm;
}

/** Bring a parsed file up to this build's version, or refuse it. */
export function migrate(raw: unknown): SaveFile {
  let file = object(raw, "the file");
  if (file.schema !== SAVE_SCHEMA) {
    throw new SaveError(`not a Sonic Drifter save (schema ${JSON.stringify(file.schema)})`);
  }
  let v = file.version;
  if (typeof v !== "number" || !Number.isInteger(v) || v < 1) throw new SaveError("the save has no version");
  if (v > SAVE_VERSION) {
    throw new SaveError(`written by a newer build (save version ${v}, this build reads up to ${SAVE_VERSION})`);
  }
  while (v < SAVE_VERSION) {
    const up = MIGRATIONS[v];
    if (!up) throw new SaveError(`no migration from save version ${v}`);
    file = up(file);
    v += 1;
    file.version = v;
  }
  // The title screen prints the header without restoring anything, so it is
  // checked here rather than trusted there.
  const h = object(file.header, "header");
  for (const k of ["build", "savedAt", "name", "phase"] as const) {
    if (typeof h[k] !== "string") throw new SaveError(`header.${k} is not text`);
  }
  for (const k of ["aeon", "t", "score"] as const) finite(h[k], `header.${k}`);
  if (typeof h.expedition !== "boolean") throw new SaveError("header.expedition is not true or false");
  if (typeof file.rng !== "number" || !Number.isInteger(file.rng) || file.rng < 0 || file.rng > 0xffffffff) {
    throw new SaveError("the random stream's state is not a uint32");
  }
  object(file.run, "run");
  return file as unknown as SaveFile;
}

/**
 * The references a run makes into the game's own tables, checked, and every
 * position it would draw, checked finite. Anything this misses and that would
 * throw is caught by the trial frame in `restore`.
 */
function audit(o: Record<string, unknown>): void {
  const world = object(o.world, "run.world");
  finite(world.aeon, "run.world.aeon");
  for (const [i, id] of list(world.pool, "run.world.pool").entries()) {
    try { motif(String(id)); } catch { throw new SaveError(`run.world.pool[${i}]: no motif ${JSON.stringify(id)}`); }
  }
  for (const [i, id] of list(world.wildlife, "run.world.wildlife").entries()) {
    try { beast(String(id)); } catch { throw new SaveError(`run.world.wildlife[${i}]: no species ${JSON.stringify(id)}`); }
  }

  const you = object(o.you, "run.you");
  finite(you.x, "run.you.x");
  finite(you.y, "run.you.y");

  for (const [i, raw] of list(o.entities, "run.entities").entries()) {
    const e = object(raw, `run.entities[${i}]`);
    finite(e.x, `run.entities[${i}].x`);
    finite(e.y, `run.entities[${i}].y`);
    if (e.faction === "beast") {
      try { beast(String(e.species)); } catch {
        throw new SaveError(`run.entities[${i}]: no species ${JSON.stringify(e.species)}`);
      }
    } else if (e.faction === "motif") {
      for (const [j, id] of list(e.parts, `run.entities[${i}].parts`).entries()) {
        try { motif(String(id)); } catch {
          throw new SaveError(`run.entities[${i}].parts[${j}]: no motif ${JSON.stringify(id)}`);
        }
      }
    } else {
      throw new SaveError(`run.entities[${i}]: faction ${JSON.stringify(e.faction)}`);
    }
  }

  const structures = list(o.structures, "run.structures");
  for (const [i, raw] of structures.entries()) {
    const s = object(raw, `run.structures[${i}]`);
    group(s.hm, `run.structures[${i}].hm`);
    finite(s.x, `run.structures[${i}].x`);
    finite(s.y, `run.structures[${i}].y`);
  }
  for (const [i, raw] of list(o.bodies, "run.bodies").entries()) {
    const b = object(raw, `run.bodies[${i}]`);
    for (const [j, k] of list(b.cells, `run.bodies[${i}].cells`).entries()) {
      if (typeof k !== "number" || !Number.isInteger(k) || k < 0 || k >= structures.length) {
        throw new SaveError(`run.bodies[${i}].cells[${j}] points at no structure`);
      }
    }
  }
  for (const [i, hm] of list(o.cells, "run.cells").entries()) group(hm, `run.cells[${i}]`);

  const throne = object(o.throne, "run.throne");
  finite(throne.x, "run.throne.x");
  finite(throne.y, "run.throne.y");
  if (throne.hm !== "") group(throne.hm, "run.throne.hm");
  for (const [i, hm] of list(throne.fed, "run.throne.fed").entries()) group(hm, `run.throne.fed[${i}]`);

  const bond = object(o.bond, "run.bond");
  if (!(bond.limbReadyAt instanceof Map)) throw new SaveError("run.bond.limbReadyAt is not a map");
  for (const [i, raw] of list(bond.companions, "run.bond.companions").entries()) {
    group(object(raw, `run.bond.companions[${i}]`).hm, `run.bond.companions[${i}].hm`);
  }
}

/** Put the decoded tree back together as a run: bodies re-joined, the rack
 *  recomputed, the random stream resumed. */
function assemble(file: SaveFile): Run {
  const o = object(unpack(file.run, "run"), "run");
  audit(o);
  const structures = o.structures as Structure[];
  const bodies: Body[] = (o.bodies as WrittenBody[]).map((b) => ({
    ...b, cells: b.cells.map((i) => structures[i]),
  }));
  // cellFor walks Neumann's principle for its freedom count; a rack of three
  // hundred 622s should pay for that once, not three hundred times. Each slot
  // still gets its own object, as a freshly gathered cell would.
  const made = new Map<string, Cell>();
  const cells = (o.cells as string[]).map((hm) => {
    let c = made.get(hm);
    if (!c) { c = cellFor(hm); made.set(hm, c); }
    return { ...c };
  });
  return { ...o, structures, bodies, cells, events: [], rand: rng(file.rng) } as unknown as Run;
}

/**
 * Read a run back.
 *
 * Accepts a parsed file or its JSON text. Migrates it, audits every reference
 * it makes into the game's tables, and then plays ONE FRAME of a separate copy
 * with nobody at the controls — because the only proof that a state is playable
 * is playing it, and a file that throws on its first frame should be refused
 * here with a reason, not found by the render loop sixteen milliseconds later.
 */
export function restore(input: string | unknown): { run: Run; header: SaveHeader; surface: unknown } {
  let raw: unknown = input;
  if (typeof input === "string") {
    try { raw = JSON.parse(input); } catch { throw new SaveError("the save is not JSON (truncated, or not a save)"); }
  }
  const file = migrate(raw);
  const run = assemble(file);

  const trial = assemble(file);
  try {
    step(trial, { move: { x: 0, y: 0 }, grip: false, dash: false }, 1 / 60);
  } catch (err) {
    throw new SaveError(`the saved run does not survive a frame: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!Number.isFinite(trial.you.x) || !Number.isFinite(trial.you.y)) {
    throw new SaveError("the saved run loses you on its first frame");
  }
  return { run, header: file.header, surface: unpack(file.surface, "surface") };
}

/** Text for storage or a file. Compact: a late run is most of a megabyte. */
export function serialise(file: SaveFile): string {
  return JSON.stringify(file);
}
