// Quadrature: the cross-phase between the two SSAW pairs, the metal that
// writes it across the expedition chip, and what the expedition does with it.
import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  type Particle, LIPID_DROPLET, MAMMALIAN_CELL, WATER, compressibility, f1, f2,
} from "../src/gorkov.js";
import {
  QUADRATURE, aimAt, axisX, axisY, crossCoupling, crossForce, newWave, softDiagonal, velocityAt, wellDepth,
  wavelength,
} from "../game/wave.js";
import { YOU, aimFor, newPilot } from "../game/pilot.js";
import { forceAt } from "../src/fields.js";
import {
  METAL_SLOWING, colMetal, metalPhase, nativeCross, plates, rowMetal, tartan,
} from "../game/plates.js";
import {
  type Run, ARENA_H, ARENA_W, CHANNEL_H, CHANNEL_W, PLATES, START, newBeast, startRun, step,
} from "../game/run.js";
import { beast } from "../game/beasts.js";
import { cellFor } from "../game/lattice.js";
import {
  CONSTRUCT_MAX, LOCK_WIDTH, TAP_YIELD, TRIM_DRAW, TRIM_RANGE, bank, craft, crossPhase,
  newResonance, resonanceStep,
} from "../game/resonance.js";

const PITCH = 88e-6;
const AMP = 2e5;

function wave(cross: number) {
  const w = newWave(PITCH, AMP);
  w.amplitude = AMP;
  w.cross = cross;
  aimAt(w, 1000e-6, 800e-6);
  return w;
}

/**
 * Gor'kov over the whole 2D field, written out from its definition rather than
 * from any function under test: <p^2> and rho<v^2> for two orthogonal standing
 * waves at one frequency, phi apart in time.
 */
function gorkov2D(w: ReturnType<typeof wave>, x: number, y: number, p: Particle): number {
  const sx = axisX(w), sy = axisY(w);
  const cx = Math.cos(sx.k * x + sx.phase), cy = Math.cos(sy.k * y + sy.phase);
  const snx = Math.sin(sx.k * x + sx.phase), sny = Math.sin(sy.k * y + sy.phase);
  const kf = compressibility(WATER);
  const A = w.amplitude;
  const p2 = (A * A / 2) * (cx * cx + cy * cy + 2 * Math.cos(w.cross) * cx * cy);
  const rv2 = (kf * A * A / 2) * (snx * snx + sny * sny);
  const V = (4 / 3) * Math.PI * p.radius ** 3;
  return V * (f1(p, WATER) * kf * p2 / 2 - 0.75 * f2(p, WATER) * rv2);
}

test("the separable field plus the cross term is minus the gradient of the full 2D Gor'kov potential", () => {
  for (const cross of [0, 0.6, QUADRATURE, 2.2, Math.PI]) {
    const w = wave(cross);
    for (const p of [MAMMALIAN_CELL, LIPID_DROPLET, YOU]) {
      for (const [x, y] of [[1013e-6, 790e-6], [1041e-6, 822e-6], [977e-6, 861e-6]]) {
        const sx = axisX(w), sy = axisY(w), h = 1e-9;
        const c = crossCoupling(w);
        const extra = c === 0 ? { x: 0, y: 0 } : crossForce(sx, sy, x, y, p, c);
        const fx = forceAt(sx, x, p) + extra.x;
        const fy = forceAt(sy, y, p) + extra.y;
        const gx = -(gorkov2D(w, x + h, y, p) - gorkov2D(w, x - h, y, p)) / (2 * h);
        const gy = -(gorkov2D(w, x, y + h, p) - gorkov2D(w, x, y - h, p)) / (2 * h);
        const scale = Math.max(Math.abs(gx), Math.abs(gy), 1e-18);
        assert.ok(Math.abs(fx - gx) / scale < 1e-5, `x at cross ${cross}`);
        assert.ok(Math.abs(fy - gy) / scale < 1e-5, `y at cross ${cross}`);
      }
    }
  }
});

test("quadrature is exactly the field the game always had", () => {
  const w = wave(QUADRATURE);
  assert.equal(crossCoupling(w), 0);
  const v = velocityAt(w, 1013e-6, 790e-6, MAMMALIAN_CELL);
  const w2 = wave(QUADRATURE + 1e-9);
  const v2 = velocityAt(w2, 1013e-6, 790e-6, MAMMALIAN_CELL);
  // Next to quadrature is next to the same answer, and quadrature itself took
  // the separable path: the cross force is zero there and not merely small.
  assert.ok(Math.abs(v.vx - v2.vx) < 1e-9 * Math.abs(v.vx) + 1e-15);
  assert.equal(wellDepth(w, 1000e-6, 800e-6, YOU), 1);
});

test("in phase, antinode wells split 1 +- |f1|/(3|Phi|) and the curvature of the full potential agrees", () => {
  const w = wave(0);
  const g = Math.abs(f1(YOU, WATER)) / (3 * Math.abs(f1(YOU, WATER) / 3 + f2(YOU, WATER) / 2));
  // Find two antinodes, one of each sign of cos tx cos ty, and measure the
  // curvature of the full 2D potential there against quadrature's.
  const sx = axisX(w), sy = axisY(w);
  const ax = -sx.phase / sx.k; // cos = 1 here
  const ay = -sy.phase / sy.k;
  const curv = (ww: ReturnType<typeof wave>, x: number, y: number) => {
    const h = 1e-7;
    return gorkov2D(ww, x + h, y, YOU) - 2 * gorkov2D(ww, x, y, YOU) + gorkov2D(ww, x - h, y, YOU);
  };
  const q = wave(QUADRATURE);
  const same = curv(w, ax, ay) / curv(q, ax, ay);
  const other = curv(w, ax + PITCH, ay) / curv(q, ax + PITCH, ay);
  const deep = Math.max(same, other), shallow = Math.min(same, other);
  assert.ok(Math.abs(deep - (1 + g)) < 1e-3, `deep ${deep} vs ${1 + g}`);
  assert.ok(Math.abs(shallow - (1 - g)) < 1e-3, `shallow ${shallow} vs ${1 - g}`);
  assert.ok(Math.abs(wellDepth(w, ax, ay, YOU) - same) < 1e-3);
  assert.ok(Math.abs(wellDepth(w, ax + PITCH, ay, YOU) - other) < 1e-3);
  // The number the docs quote.
  assert.ok(Math.abs(1 + g - 1.65) < 0.02);
});

test("in phase, a cell's node is soft along one diagonal and stiff along the other: the mesh", () => {
  const w = wave(0);
  const sx = axisX(w), sy = axisY(w);
  const nx = (Math.PI / 2 - sx.phase) / sx.k, ny = (Math.PI / 2 - sy.phase) / sy.k;
  const h = 2e-6;
  const U = (dx: number, dy: number) => gorkov2D(w, nx + dx, ny + dy, MAMMALIAN_CELL);
  const along = [U(h, h) - U(0, 0), U(h, -h) - U(0, 0)];
  const soft = Math.min(...along), stiff = Math.max(...along);
  const q = wave(QUADRATURE);
  const flat = gorkov2D(q, nx + h, ny + h, MAMMALIAN_CELL) - gorkov2D(q, nx, ny, MAMMALIAN_CELL);
  assert.ok(soft > 0, "the node is still a trap");
  // The diagonal the surface draws is the soft one: (1, -sigma).
  const sigma = softDiagonal(w, nx, ny, MAMMALIAN_CELL);
  assert.equal(U(h, -sigma * h) - U(0, 0), soft);
  // And the next node along an axis is soft the other way — the mesh, not rails.
  assert.equal(softDiagonal(w, nx + PITCH, ny, MAMMALIAN_CELL), -sigma);
  assert.ok(stiff / soft > 4, `anisotropy ${stiff / soft}`);
  assert.ok(Math.abs(soft / flat - wellDepth(w, nx, ny, MAMMALIAN_CELL)) < 0.02);
});

test("the pilot always takes the deep half of the checkerboard", () => {
  for (const cross of [0, 0.4, QUADRATURE, 2.5, Math.PI]) {
    const w = newWave(PITCH, AMP);
    w.amplitude = AMP;
    w.cross = cross;
    const p = newPilot(1200e-6, 900e-6);
    const at = aimFor(p, w, 0, 0);
    assert.ok(wellDepth(w, at.x, at.y, YOU) >= 1 - 1e-12, `cross ${cross}`);
  }
});

test("plates: bare glass is quadrature, and the map is a row term minus a column term", () => {
  assert.equal(nativeCross([], 1e-3, 1e-3, 176e-6), QUADRATURE);
  const ps = plates(CHANNEL_W, CHANNEL_H);
  const lam = 176e-6;
  const d = (x: number, y: number) => nativeCross(ps, x, y, lam) - QUADRATURE;
  // A tartan: the change between two columns is the same on every row.
  const xa = 0.2 * CHANNEL_W, xb = 0.84 * CHANNEL_W;
  for (const y of [0.05, 0.15, 0.5, 0.8].map((f) => f * CHANNEL_H)) {
    assert.ok(Math.abs((d(xb, y) - d(xa, y)) - (d(xb, 0.5 * CHANNEL_H) - d(xa, 0.5 * CHANNEL_H))) < 1e-12);
  }
  const y = 0.15 * CHANNEL_H, x = 0.5 * CHANNEL_W;
  assert.ok(Math.abs(d(x, y) - metalPhase(rowMetal(ps, y) - colMetal(ps, x), lam)) < 1e-12);
  // Phase per metre goes as 1/lambda: the same glass is a different map in every water.
  assert.ok(Math.abs(metalPhase(1e-3, lam) / metalPhase(1e-3, 2 * lam) - 2) < 1e-12);
  assert.equal(METAL_SLOWING, 0.027);
  // The tartan's rectangles tile the channel and agree with the point function.
  const cells = tartan(ps, CHANNEL_W, CHANNEL_H, lam);
  const area = cells.reduce((v, c) => v + c.w * c.h, 0);
  assert.ok(Math.abs(area - CHANNEL_W * CHANNEL_H) / (CHANNEL_W * CHANNEL_H) < 1e-9);
});

test("plates: the opening pool is near quadrature and somewhere on the chip is a full mesh", () => {
  const run = startRun(5);
  const lam = wavelength(run.wave);
  const mid = nativeCross(PLATES, START.x + ARENA_W / 2, START.y + ARENA_H / 2, lam);
  assert.ok(Math.abs(Math.cos(mid)) < 0.25, `opening |cos| ${Math.abs(Math.cos(mid))}`);
  const strongest = Math.max(...tartan(PLATES, CHANNEL_W, CHANNEL_H, lam).map((c) => Math.abs(Math.cos(c.cross))));
  assert.ok(strongest > 0.95);
});

const idle = { move: { x: 0, y: 0 }, grip: false, dash: false };
function expedition(): Run {
  const run = startRun(321);
  run.resonance = newResonance({ seed: "321", trajectory: [] });
  run.cells = Array.from({ length: 12 }, () => cellFor("4"));
  run.resonance.fragments = 30;
  run.spawnIn = 1e6; run.world.calm = 1e6;
  return run;
}

test("trim is refused on an empty bank, then slews and is paid for in charge", () => {
  const run = expedition();
  crossPhase(run, 1, 0.1);
  assert.equal(run.resonance!.trim, 0, "nothing banked, nothing trimmed");
  assert.equal(run.wave.cross, run.resonance!.native);
  assert.equal(craft(run, "condenser"), "crafted");
  run.resonance!.constructs[0].energy = 20;
  crossPhase(run, 1, 0.1);
  assert.ok(Math.abs(run.resonance!.trim - 0.24) < 1e-12, "slews, not jumps");
  const before = bank(run);
  for (let i = 0; i < 20; i++) crossPhase(run, 1, 0.1);
  assert.equal(run.resonance!.trim, TRIM_RANGE);
  const spent = before - bank(run);
  assert.ok(spent > 0 && spent <= TRIM_DRAW * 2 + 1e-9, `spent ${spent}`);
  assert.ok(Math.abs(run.wave.cross - (run.resonance!.native + TRIM_RANGE)) < 1e-12);
  // Run the bank dry and the glass has its way again.
  run.resonance!.constructs[0].energy = 0;
  for (let i = 0; i < 20; i++) crossPhase(run, 1, 0.1);
  assert.equal(run.resonance!.trim, 0);
  assert.equal(run.wave.cross, run.resonance!.native);
});

test("matching |cos phi| to |cos psi| multiplies the charge you bank, and missing it does not", () => {
  const charge = (cross: number, psi: number): number => {
    const run = expedition();
    craft(run, "loom");
    const s = run.resonance!;
    s.source.trajectory = [{ t: 1, K: 1, R_mean: 0.5, psi }];
    run.wave.cross = cross;
    resonanceStep(run, 0.5, true);
    return s.constructs[0].energy;
  };
  const locked = charge(0, 0);            // mesh, and |cos psi| = 1
  const missed = charge(QUADRATURE, 0);   // dots, and |cos psi| = 1
  assert.ok(Math.abs(locked / missed - 2) < 1e-9, `${locked} vs ${missed}`);
  assert.ok(LOCK_WIDTH < 1);
});

test("a tap drinks a motif the mesh brings to it, and only while the hand is a mesh", () => {
  const drink = (cross: number): { caught: number; energy: number } => {
    const run = expedition();
    assert.equal(craft(run, "tap"), "crafted");
    const s = run.resonance!;
    const host = run.structures.find((h) => h.id === s.constructs[0].ids[1])!;
    run.entities = run.entities.filter((e) => e.faction !== "motif");
    run.entities.push({ ...newBeast(run, "vesicle"), faction: "motif", x: host.x + 5e-6, y: host.y, layer: run.layer } as never);
    run.wave.cross = cross;
    resonanceStep(run, 0.01, false);
    return { caught: s.tapped, energy: s.constructs[0].energy };
  };
  assert.deepEqual(drink(QUADRATURE), { caught: 0, energy: 0 });
  assert.deepEqual(drink(0), { caught: 1, energy: TAP_YIELD });
  assert.ok(TAP_YIELD < CONSTRUCT_MAX);
});

test("a vesicle held in the deep half comes apart faster than one held at quadrature", () => {
  const time = (trim: number): number => {
    const run = expedition();
    craft(run, "condenser");
    run.resonance!.constructs[0].energy = 40;
    const v = newBeast(run, "vesicle");
    run.entities.push(v);
    for (let t = 0; t < 8; t += 1 / 60) {
      step(run, { ...idle, grip: true, trim }, 1 / 60);
      run.resonance!.constructs[0].energy = 40;
      run.integrity = 99; run.wave.stamina = 100; run.wave.spent = false;
      v.x = run.aim.x; v.y = run.aim.y;
      if (!run.entities.includes(v)) return t;
    }
    return Infinity;
  };
  const q = time(0);
  const deep = time(1);
  assert.ok(Number.isFinite(q), "held at quadrature, it does die");
  assert.ok(deep < q * 0.85, `deep ${deep} vs quadrature ${q}`);
  assert.ok(beast("vesicle").hold > 0);
});
