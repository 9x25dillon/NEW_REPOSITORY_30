// app/drifter.ts — SONIC DRIFTER
//
// The surface. It draws game/run.ts and hands it a pointer; it decides nothing.
//
// THE COLOUR LANGUAGE IS THE PHYSICS. Every body on screen is coloured by the
// sign of gorkov.contrastFactor computed on its own particle in THIS world's
// medium:
//
//     COOL   contrast positive — it answers to your NODES
//     WARM   contrast negative — it answers to your ANTINODES
//
// Nothing is tinted by faction, so a husk is cool (your pull reels it in) and
// the same motif can change colour between one world and the next, because the
// water it is in has a different density and sound speed. That is not a
// lighting effect; it is the contrast factor being recomputed.
//
// SCALE. One screen pixel is one micron.

import {
  type Entity, type Run,
  ARENA_H, ARENA_W, MAX_INTEGRITY, THRONE_RADIUS,
  LOBE_ARC, LOBE_RANGE, STRIKE_RANGE, VOLLEY_WIND, bearsOn,
  beast, crown, enterWorld, particleOf, placeCell, readoutFor,
  startRun, step,
} from "../game/run.js";
import { envelopeAt, frequency, trapsX, trapsY, STAMINA_MAX } from "../game/wave.js";
import {
  epitaphFor, sovereignParticle, volley,
} from "../game/world.js";
import { lobes } from "../game/shape.js";
import { contrastFactor } from "../src/gorkov.js";
import { DASH_COOL, DASH_TIME, selfContrast } from "../game/pilot.js";
import { GLYPH, Pad, type Intent } from "./pad.js";
import { Sfx } from "./sfx.js";

// ── scale ───────────────────────────────────────────────────────────────────

const PX = 1e6;
const VIEW_W = 900;
const VIEW_H = 660;
const px = (m: number): number => m * PX;
const mx = (p: number): number => p / PX;
const WASH_W = 100;
const WASH_H = 74;

// ── palette ─────────────────────────────────────────────────────────────────

const INK = "#cfe9f5";
const DIM = "#4a6076";
const FAINT = "#2b3e50";
const NODE = "120,225,245";
const ANTI = "255,140,190";
const GOLD = "#ffc94a";
const JADE = "160,255,214";
const RED = "#ff4d6d";
const MONO = '"IBM Plex Mono", ui-monospace, Menlo, monospace';

interface Spark { x: number; y: number; vx: number; vy: number; life: number; max: number; rgb: string }
interface Popup { x: number; y: number; text: string; life: number; colour: string; big: boolean }
interface Ring { x: number; y: number; r: number; max: number; life: number; born: number; rgb: string }

interface Lesson { id: string; title: string; body: string }

const LESSONS: Readonly<Record<string, Lesson>> = {
  node: {
    id: "node", title: "CONTRAST FACTOR",
    body: "PHI = f1/3 + f2/2. COOL BODIES ARE DENSER AND STIFFER THAN THE WATER, SO PHI IS "
      + "POSITIVE AND THEY FALL INTO NODES. WARM ONES GO THE OTHER WAY. CHANGE THE WATER "
      + "AND YOU CHANGE WHICH IS WHICH.",
  },
  sign: {
    id: "sign", title: "IT SHARES YOUR SIGN",
    body: "BOTH LATTICES ARE ONE FIELD A QUARTER WAVELENGTH APART, AND YOUR OWN CONTRAST "
      + "PICKS WHICH ONE HOLDS YOU UP. ANYTHING WITH THE SAME SIGN ANSWERS TO THE SAME "
      + "LATTICE, SO YOUR OWN DRIVE REELS IT INTO YOUR LAP. THE REST IS PINNED IN THE RING "
      + "A QUARTER PITCH OUT, WHERE IT CANNOT TOUCH YOU. CHANGE THE WATER AND THAT SWAPS.",
  },
  aim: {
    id: "aim", title: "YOU CANNOT AIM A BUILDING",
    body: "A STRUCTURE FIRES ALONG ITS OWN GROUP'S DIRECTIONS AND THEY WERE FIXED WHEN YOU "
      + "PLACED IT. THE CONES ARE WHERE IT REACHES. THE KING IS DENSE AND YOU ARE NOT, SO "
      + "IT ANSWERS TO THE OTHER LATTICE AND YOUR OWN NODE SHOVES IT - ABOUT EIGHT TIMES "
      + "FASTER THAN IT WALKS. YOU DO NOT AIM THE GUN. YOU AIM THE KING.",
  },
  coil: {
    id: "coil", title: "IT IS TELLING YOU",
    body: "A HUNTER STOPS AND GATHERS BEFORE IT COMMITS, AND WHEN IT GOES IT GOES WHERE IT "
      + "WAS POINTING - NOT WHERE YOU ARE NOW. BURST OFF THE LINE, OR CLOSE YOUR HAND ON IT: "
      + "A BODY IN YOUR GRIP CANNOT STRIKE AT ALL.",
  },
  burst: {
    id: "burst", title: "PEAK RATING, NOT CONTINUOUS",
    body: "AN AMPLIFIER WILL GIVE YOU MORE THAN IT CAN SUSTAIN, FOR A MOMENT. FORCE GOES AS "
      + "PRESSURE SQUARED, SO TWICE THE DRIVE IS FOUR TIMES THE SPEED - AND EVERY OTHER "
      + "BODY IN THE WATER LURCHES WITH YOU, BECAUSE IT IS THE SAME FIELD.",
  },
  fence: {
    id: "fence", title: "A LATTICE IS A FENCE",
    body: "WHILE YOU GRIP, WHAT ANSWERS TO THE OTHER LATTICE IS PINNED WHERE IT STANDS AND "
      + "CANNOT REACH YOU. THAT IS WHAT A TWEEZER IS FOR. LET GO AND THE FENCE GOES WITH "
      + "IT - WHICH IS WHY RUNNING OUT OF STAMINA IS HOW THIS KILLS YOU.",
  },
  build: {
    id: "build", title: "WHAT YOU PUT DOWN STAYS",
    body: "A PLACED CELL HOLDS ALONG ITS OWN GROUP'S DIRECTIONS - SIX FOR A 622, TWO FOR A "
      + "222 - AND THINGS COLLECT THERE WHETHER OR NOT YOU ARE WATCHING. TWO THAT MEET AT "
      + "THE SAME POINT MERGE WITHOUT YOU. BUILD, AND THE WORLD WORKS FOR YOU.",
  },
  crystal: {
    id: "crystal", title: "ELEVEN, AND NEVER A TWELFTH",
    body: "A PROTEIN IS BUILT FROM L-AMINO ACIDS, SO IT IS CHIRAL, SO IT CANNOT SIT IN ANY "
      + "OPERATION THAT WOULD MIRROR IT. OF THE 32 POINT GROUPS EXACTLY 11 SURVIVE. THOSE "
      + "ELEVEN ARE EVERY CELL THERE IS.",
  },
  fivefold: {
    id: "fivefold", title: "FIVE-FOLD TILES NOTHING",
    body: "THE CRYSTALLOGRAPHIC RESTRICTION THEOREM. A FIVE-FOLD AXIS GENERATES NO LATTICE, "
      + "SO A PENTAMER JOINS NOTHING, EVER. SOME OF WHAT IS DISSOLVED IN A WATER IS SIMPLY "
      + "NOT GOING TO WORK.",
  },
  crown: {
    id: "crown", title: "IT IS WHAT YOU FED IT",
    body: "ITS GROUP IS THE MOST SYMMETRIC CELL YOU GAVE IT, AND ITS VOLLEY IS THAT GROUP'S "
      + "SYMMETRY SEEN FROM ABOVE. FEED IT MORE AND IT THROWS MORE ARMS - AND THE WORLD BORN "
      + "OUT OF ITS BODY IS RICHER. THAT TRADE IS THE GAME.",
  },
  anchored: {
    id: "anchored", title: "YOU GAVE IT NO HANDLE",
    body: "YOU FED IT A 432: ORDER 24, AND NOT ONE DRIVABLE PIEZOELECTRIC COMPONENT. THE "
      + "FIELD CANNOT TOUCH IT. YOU CANNOT PUSH IT OFF YOU. ONLY YOUR BUILDINGS CAN REACH IT NOW.",
  },
  devour: {
    id: "devour", title: "IT EATS WHAT YOU MADE",
    body: "EVERY STRUCTURE IT TAKES IS BOTH ITS MEAL AND YOUR ARSENAL. KEEP BUILDING WHILE "
      + "IT FEEDS - THE FIGHT IS A RACE BETWEEN WHAT IT CAN DEVOUR AND WHAT YOU CAN PUT UP.",
  },
  spent: {
    id: "spent", title: "ENERGY DENSITY GOES AS PRESSURE SQUARED",
    body: "E = p^2 / 4 rho c^2. DOUBLE THE GRIP AND IT COSTS FOUR TIMES AS MUCH.",
  },
  mote: {
    id: "mote", title: "BELOW THE CROSSOVER",
    body: "RADIATION FORCE GOES AS RADIUS CUBED, STREAMING DRAG AS RADIUS. UNDER ABOUT 1.5 "
      + "MICRONS STREAMING WINS AND NO TRAP HOLDS. MORE POWER DRIVES BOTH.",
  },
};

type Screen = "title" | "play" | "birth" | "dead";

export class Game {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly sfx = new Sfx();
  private run: Run;
  private screen: Screen = "title";

  private readonly pad = new Pad();
  /** Where the body has been, for the streak. Flat pairs. */
  private youTrail: number[] = [];
  /** Which cell in the rack a bare press will spend. */
  private selected = 0;
  private wasGrip = false;
  /** Frames of held time after a heavy landing. Sold as impact; it is really
   *  just the update being withheld for a moment while the draw keeps going. */
  private hitstop = 0;
  private seed = 20260830;

  private sparks: Spark[] = [];
  private popups: Popup[] = [];
  private rings: Ring[] = [];
  private flash = 0;
  private flashRed = false;
  private shake = 0;
  private t = 0;
  private best = 0;
  private deepest = 1;

  private seen = new Set<string>();
  private card: Lesson | null = null;
  private cardT = 0;
  private toast = "";
  private toastT = 0;

  private last = 0;
  private running = false;

  private readonly washCanvas: HTMLCanvasElement;
  private readonly washCtx: CanvasRenderingContext2D;
  private readonly wash: ImageData;
  private readonly cosX = new Float32Array(WASH_W);
  private readonly cosY = new Float32Array(WASH_H);
  private readonly envX = new Float32Array(WASH_W);
  private readonly envY = new Float32Array(WASH_H);
  private readonly vignette: CanvasGradient;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    this.ctx = ctx;
    canvas.width = VIEW_W;
    canvas.height = VIEW_H;
    this.run = startRun(this.seed);

    this.washCanvas = document.createElement("canvas");
    this.washCanvas.width = WASH_W;
    this.washCanvas.height = WASH_H;
    const wc = this.washCanvas.getContext("2d");
    if (!wc) throw new Error("no 2d context for the field buffer");
    this.washCtx = wc;
    this.wash = wc.createImageData(WASH_W, WASH_H);

    const v = ctx.createRadialGradient(
      VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.34, VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.86);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(0,0,0,0.66)");
    this.vignette = v;

    this.bindInput();
    this.fit();
    window.addEventListener("resize", () => this.fit());
  }

  // ── input ─────────────────────────────────────────────────────────────────

  /**
   * The pointer is not the player any more.
   *
   * It survives for two jobs a pad does differently — clicking a cell in the
   * rack, and getting past a menu — and for nothing else. Where the body goes
   * is a stick, or WASD, and it is read once a frame in `update`.
   */
  private bindInput(): void {
    const wake = () => this.sfx.unlock();
    window.addEventListener("keydown", wake, { once: false });

    this.canvas.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      wake();
      if (this.screen === "title" || this.screen === "dead") { this.begin(); return; }
      if (this.screen === "birth") { enterWorld(this.run); this.screen = "play"; return; }

      const r = this.canvas.getBoundingClientRect();
      const sx = ((e.clientX - r.left) / r.width) * VIEW_W;
      const sy = ((e.clientY - r.top) / r.height) * VIEW_H;
      const slot = this.slotAt(sx, sy);
      if (slot >= 0) { this.selected = slot; this.spend(slot); }
    });
    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  /** Turn one frame of intent into everything that is not movement. */
  private act(it: Intent): void {
    const run = this.run;

    if (it.mute) this.sfx.muted = !this.sfx.muted;
    if (it.restart) { this.begin(); return; }

    if (this.screen === "title" || this.screen === "dead") {
      if (it.confirm) { this.sfx.unlock(); this.begin(); }
      return;
    }
    if (this.screen === "birth") {
      if (it.confirm) { enterWorld(run); this.screen = "play"; }
      return;
    }

    if (run.cells.length > 0) {
      this.selected = Math.max(0, Math.min(run.cells.length - 1, this.selected));
      if (it.cycle !== 0) {
        this.selected = (this.selected + it.cycle + run.cells.length) % run.cells.length;
        this.sfx.tick();
      }
    } else {
      this.selected = 0;
    }

    const key = this.pad.slotKey();
    if (key > 0 && run.cells[key - 1]) { this.selected = key - 1; this.spend(key - 1); }
    else if (it.place) this.spend(this.selected);

    if (it.crown) this.doCrown();
  }

  private fit(): void {
    const s = Math.min(window.innerWidth / (VIEW_W + 40), window.innerHeight / (VIEW_H + 96));
    this.canvas.style.width = `${Math.floor(VIEW_W * s)}px`;
    this.canvas.style.height = `${Math.floor(VIEW_H * s)}px`;
  }

  private begin(): void {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    this.run = startRun(this.seed);
    this.screen = "play";
    this.sparks = []; this.popups = []; this.rings = [];
    this.say("GATHER FOUR OF A KIND TO MAKE A CELL");
  }

  private spend(i: number): void {
    const run = this.run;
    if (!run.cells[i]) return;
    const r = placeCell(run, i);
    if (r === "too-close") this.say("TOO CLOSE TO SOMETHING ELSE");
    if (r === "wrong-phase") this.say("NOT NOW");
  }

  private doCrown(): void {
    const r = crown(this.run);
    if (r === "nothing-fed") this.say("FEED THE THRONE FIRST - STAND ON IT AND PLACE");
  }

  // ── loop ──────────────────────────────────────────────────────────────────

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const frame = (now: number) => {
      let dt = (now - this.last) / 1000;
      this.last = now;
      if (dt > 0.05) dt = 0.05;
      if (this.hitstop > 0) { this.hitstop -= dt; this.decay(dt); }
      else this.update(dt);
      this.draw();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  private update(dt: number): void {
    this.t += dt;
    const run = this.run;

    const it = this.pad.read();
    this.act(it);

    if (this.screen === "title") {
      // The attract loop plays itself, badly and on purpose: it drives in a
      // slow figure so the lattice moves and the water answers.
      step(run, {
        move: { x: Math.sin(this.t * 0.41), y: Math.sin(this.t * 0.63 + 1.1) },
        grip: Math.sin(this.t * 0.7) > -0.2,
        dash: false,
      }, dt);
      run.wave.stamina = STAMINA_MAX;
      run.integrity = MAX_INTEGRITY;
      run.events.length = 0;
      this.decay(dt);
      return;
    }

    const gripping = it.grip && !run.wave.spent;
    if (gripping && !this.wasGrip) this.sfx.gripOn();
    this.wasGrip = gripping;

    step(run, { move: it.move, grip: it.grip, dash: it.dash }, dt);
    this.drain();
    this.decay(dt);

    if (run.phase === "birth" && this.screen !== "birth") {
      this.screen = "birth";
      this.best = Math.max(this.best, run.score);
      this.deepest = Math.max(this.deepest, run.world.aeon);
    }
    if (run.phase === "dead" && this.screen !== "dead") {
      this.screen = "dead";
      this.best = Math.max(this.best, run.score);
    }
    // The first time something that shares your sign is drawn onto your feet,
    // say why — it is the rule the whole bestiary runs on.
    const mine = selfContrast(run.you, run.wave);
    if (run.entities.some((e) => e.faction === "beast"
      && contrastFactor(particleOf(e), run.world.medium) * mine > 0
      && Math.hypot(e.x - run.you.x, e.y - run.you.y) < 45e-6)) this.teach("sign");

    this.youTrail.push(run.you.x, run.you.y);
    while (this.youTrail.length > 26) this.youTrail.shift();

    if (run.structures.length > 0) this.teach("build");
    if (run.entities.some((e) => e.species === "mote"
      && Math.hypot(e.x - run.you.x, e.y - run.you.y) < 120e-6)) this.teach("mote");
  }

  private drain(): void {
    const run = this.run;
    for (const ev of run.events) {
      switch (ev.kind) {
        case "hit":
          this.flash = 1; this.flashRed = true; this.shake = 13;
          // Two frames of held time. It is the cheapest weight there is.
          this.hitstop = Math.max(this.hitstop, 0.055);
          this.sfx.hurt(); this.burst(ev.x, ev.y, 16, "255,77,109");
          this.say(`INTEGRITY ${run.integrity}`);
          break;
        case "kill":
          this.burst(ev.x, ev.y, 12, warmth(beastPhi(run, ev.species)));
          this.sfx.dissolve();
          break;
        case "merge": this.burst(ev.x, ev.y, 6, NODE); break;
        case "refuse":
          this.popups.push({ x: ev.x, y: ev.y, text: refusal(ev.text), life: 1.3, colour: "#ff9c6d", big: false });
          if (ev.text === "five-fold") this.teach("fivefold");
          break;
        case "crystal":
          this.flash = 0.5; this.flashRed = false;
          this.burst(ev.x, ev.y, 30, "255,201,74");
          this.ring(ev.x, ev.y, 8, 84, 0.7, "255,201,74");
          this.popups.push({ x: ev.x, y: ev.y, text: ev.group, life: 1.6, colour: GOLD, big: true });
          this.sfx.capture(3); this.say(`${ev.group}  ·  PRESS ITS NUMBER TO PLACE IT`);
          this.teach("crystal");
          break;
        case "place":
          this.ring(ev.x, ev.y, 6, 70, 0.6, JADE);
          this.sfx.capture(2); this.say(`${ev.group} STANDS`);
          break;
        case "fed":
          this.ring(run.throne.x, run.throne.y, 10, 60, 0.6, "255,201,74");
          this.sfx.capture(4);
          this.say(`THE THRONE TAKES ${ev.group}  ·  C TO CROWN`);
          break;
        case "crown":
          this.teach("aim");
          this.flash = 0.9; this.flashRed = false; this.shake = 10;
          this.sfx.spent();
          this.say(`${ev.group} WAKES  ·  MASS ${ev.mass}`);
          this.teach("crown");
          if (run.throne.anchored) this.teach("anchored");
          break;
        case "discharge":
          this.ring(ev.x, ev.y, 8, 150, 0.45, NODE);
          this.shake = Math.max(this.shake, 5);
          this.sfx.dissolve();
          if (ev.damage > 0) {
            this.popups.push({ x: ev.x, y: ev.y, text: `-${ev.damage}`, life: 1, colour: INK, big: false });
          }
          break;
        case "devour":
          this.burst(ev.x, ev.y, 14, "255,90,130");
          this.say("IT TOOK ONE OF YOURS");
          this.teach("devour");
          break;
        case "volley":
          this.ring(ev.x, ev.y, 10, 46, 0.3, ANTI);
          this.sfx.invert(false);
          break;
        case "sovereign-hit":
          this.burst(ev.x, ev.y, 10, "255,201,74");
          break;
        case "birth":
          this.flash = 1; this.flashRed = false; this.shake = 14;
          this.sfx.capture(5);
          break;
        case "coil":
          this.sfx.coil();
          this.teach("coil");
          break;
        case "strike":
          this.sfx.strike();
          this.burst(ev.x, ev.y, 5, "255,240,120");
          break;
        case "aiming":
          this.sfx.aiming();
          break;
        case "dash":
          this.teach("burst");
          this.sfx.dash();
          this.shake = Math.max(this.shake, 3);
          this.ring(ev.x, ev.y, 6, 46, 0.32, "255,255,255");
          break;
        case "spent":
          this.teach("fence");
          this.flash = 1; this.flashRed = true;
          this.sfx.spent(); this.say("SPENT"); this.teach("spent");
          break;
        case "death":
          this.flash = 1; this.flashRed = true; this.shake = 16;
          this.sfx.spent();
          break;
      }
    }
    run.events.length = 0;
  }

  private decay(dt: number): void {
    for (const s of this.sparks) {
      s.x += s.vx * dt; s.y += s.vy * dt;
      s.vx *= 1 - 2.6 * dt; s.vy *= 1 - 2.6 * dt;
      s.life -= dt;
    }
    this.sparks = this.sparks.filter((s) => s.life > 0);
    for (const p of this.popups) { p.y -= 24e-6 * dt; p.life -= dt; }
    this.popups = this.popups.filter((p) => p.life > 0);
    for (const r of this.rings) r.life -= dt;
    this.rings = this.rings.filter((r) => r.life > 0);
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 2);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 22);
    if (this.toastT > 0) this.toastT -= dt;
    if (this.cardT > 0) { this.cardT -= dt; if (this.cardT <= 0) this.card = null; }
  }

  private burst(x: number, y: number, n: number, rgb: string): void {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random();
      const s = (40 + Math.random() * 170) * 1e-6;
      const life = 0.3 + Math.random() * 0.55;
      this.sparks.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, max: life, rgb });
    }
    this.shake = Math.max(this.shake, 2.5);
  }

  private ring(x: number, y: number, r: number, max: number, life: number, rgb: string): void {
    this.rings.push({ x, y, r, max, life, born: life, rgb });
  }

  private say(text: string): void { this.toast = text; this.toastT = 2.2; }

  private teach(id: string): void {
    if (this.seen.has(id)) return;
    const l = LESSONS[id];
    if (!l) return;
    this.seen.add(id);
    this.card = l; this.cardT = 8;
    this.sfx.lesson();
  }

  // ── draw ──────────────────────────────────────────────────────────────────

  private draw(): void {
    const g = this.ctx;
    g.fillStyle = "#05070e";
    g.fillRect(0, 0, VIEW_W, VIEW_H);

    g.save();
    if (this.shake > 0) {
      g.translate((Math.random() * 2 - 1) * this.shake, (Math.random() * 2 - 1) * this.shake);
    }
    this.drawField();
    this.drawStructures();
    this.drawThrone();
    this.drawTrails();
    this.drawEntities();
    this.drawSovereign();
    this.drawBolts();
    this.drawSparks();
    this.drawRings();
    this.drawYou();
    g.restore();

    g.fillStyle = this.vignette;
    g.fillRect(0, 0, VIEW_W, VIEW_H);
    this.drawPopups();

    if (this.screen === "title") this.drawTitle();
    else {
      this.drawHud();
      if (this.screen === "birth") this.drawBirth();
      if (this.screen === "dead") this.drawDead();
    }
    this.drawCard();

    if (this.flash > 0) {
      g.fillStyle = this.flashRed
        ? `rgba(255,60,90,${(this.flash * 0.42).toFixed(3)})`
        : `rgba(200,240,255,${(this.flash * 0.2).toFixed(3)})`;
      g.fillRect(0, 0, VIEW_W, VIEW_H);
    }
  }

  /** Both the pressure of crossed standing waves and the Gaussian focus are
   *  separable, so the wash costs two rows of trigonometry, not a grid. */
  private drawField(): void {
    const g = this.ctx;
    const w = this.run.wave;
    const k = Math.PI / w.pitch;
    const lit = w.amplitude / w.maxAmplitude;
    const phx = -w.phaseX / 2;
    const phy = -w.phaseY / 2;
    const f2 = 2 * w.focus * w.focus;

    for (let i = 0; i < WASH_W; i++) {
      const u = mx(((i + 0.5) / WASH_W) * VIEW_W);
      this.cosX[i] = Math.cos(k * u + phx);
      const d = u - w.aimX;
      this.envX[i] = Math.exp(-(d * d) / f2);
    }
    for (let j = 0; j < WASH_H; j++) {
      const u = mx(((j + 0.5) / WASH_H) * VIEW_H);
      this.cosY[j] = Math.cos(k * u + phy);
      const d = u - w.aimY;
      this.envY[j] = Math.exp(-(d * d) / f2);
    }

    const data = this.wash.data;
    const gain = 0.05 + lit * 0.4;
    const cr = w.inverted ? 190 : 70;
    const cg = w.inverted ? 90 : 150;
    const cb = w.inverted ? 150 : 200;
    let o = 0;
    for (let j = 0; j < WASH_H; j++) {
      const cy = this.cosY[j];
      const ey = this.envY[j];
      for (let i = 0; i < WASH_W; i++) {
        const p = Math.abs(this.cosX[i] * cy);
        const v = 0.022 + p * gain * this.envX[i] * ey;
        data[o] = cr; data[o + 1] = cg; data[o + 2] = cb;
        data[o + 3] = (Math.min(1, v) * 255) | 0;
        o += 4;
      }
    }
    this.washCtx.putImageData(this.wash, 0, 0);
    g.imageSmoothingEnabled = true;
    g.drawImage(this.washCanvas, 0, 0, VIEW_W, VIEW_H);

    const med = this.run.world.medium;
    const cool = { radius: 6e-6, rho: med.rho + 110, c: med.c + 80 };
    const warm = { radius: 6e-6, rho: med.rho - 85, c: med.c - 50 };
    const lead = !w.inverted;
    this.lattice(trapsX(w, cool, ARENA_W), trapsY(w, cool, ARENA_H), NODE,
      lead ? 0.2 + lit * 0.62 : 0.09 + lit * 0.24, lead ? 2.1 + lit * 1.7 : 1.4 + lit * 0.7);
    this.lattice(trapsX(w, warm, ARENA_W), trapsY(w, warm, ARENA_H), ANTI,
      lead ? 0.09 + lit * 0.26 : 0.22 + lit * 0.64, lead ? 1.4 + lit * 0.8 : 2.1 + lit * 1.8);
  }

  private lattice(xs: number[], ys: number[], rgb: string, alpha: number, r: number): void {
    const g = this.ctx;
    const w = this.run.wave;
    for (const x of xs) {
      for (const y of ys) {
        const e = envelopeAt(w, x, y);
        const a = alpha * (0.2 + 0.8 * e);
        if (a < 0.02) continue;
        g.fillStyle = `rgba(${rgb},${a.toFixed(3)})`;
        g.beginPath();
        g.arc(px(x), px(y), r * (0.6 + 0.4 * e), 0, Math.PI * 2);
        g.fill();
      }
    }
  }

  /** What you built: a rosette with one arm per direction its group has, and
   *  a holding point at the end of each. */
  private drawStructures(): void {
    const g = this.ctx;
    const run = this.run;
    const k = run.throne;
    const fighting = run.phase === "reign" && k.awake && k.hp > 0;

    for (const s of run.structures) {
      const x = px(s.x), y = px(s.y);
      const R = px(s.reach);
      const rgb = s.ruin ? "110,140,160" : JADE;
      const a = s.ruin ? 0.4 : 0.85;

      // WHERE THIS BUILDING ACTUALLY REACHES. Its arms carry seven times its
      // holding radius, and until these were drawn the player was shown a
      // forty-micron stub and handed a three-hundred-micron gun — which makes
      // the only decision in the fight, where the king is standing, invisible.
      // A building cannot be aimed. The king can.
      if (fighting) {
        const live = bearsOn(s, k.x, k.y);
        const far = px(s.reach * LOBE_RANGE);
        for (const [dx, dy] of s.lobes) {
          const th = Math.atan2(dy, dx);
          const cone = g.createRadialGradient(x, y, R * 0.6, x, y, far);
          cone.addColorStop(0, `rgba(${rgb},${live ? 0.3 : 0.075})`);
          cone.addColorStop(1, "rgba(0,0,0,0)");
          g.fillStyle = cone;
          g.beginPath();
          g.moveTo(x, y);
          g.arc(x, y, far, th - LOBE_ARC, th + LOBE_ARC);
          g.closePath();
          g.fill();
        }
        if (live) {
          g.strokeStyle = `rgba(${rgb},0.75)`;
          g.lineWidth = 1.4;
          g.beginPath(); g.arc(x, y, R + 5, 0, Math.PI * 2); g.stroke();
        }
      }

      g.strokeStyle = `rgba(${rgb},${(a * 0.28).toFixed(3)})`;
      g.lineWidth = 1;
      g.beginPath(); g.arc(x, y, R, 0, Math.PI * 2); g.stroke();

      g.strokeStyle = `rgba(${rgb},${(a * 0.6).toFixed(3)})`;
      g.lineWidth = 1.4;
      for (const [dx, dy] of s.lobes) {
        g.beginPath();
        g.moveTo(x + dx * 6, y + dy * 6);
        g.lineTo(x + dx * R, y + dy * R);
        g.stroke();
        g.fillStyle = `rgba(${rgb},${a.toFixed(3)})`;
        g.beginPath(); g.arc(x + dx * R, y + dy * R, 2.6, 0, Math.PI * 2); g.fill();
      }

      g.fillStyle = `rgba(${rgb},${a.toFixed(3)})`;
      g.beginPath(); g.arc(x, y, 4.5, 0, Math.PI * 2); g.fill();
      g.fillStyle = s.ruin ? "#6e8a9c" : "#0b1a18";
      g.font = `700 8px ${MONO}`;
      g.textAlign = "center";
      g.fillText(s.hm, x, y + 12);
      g.textAlign = "left";

      if (s.charge > 0) {
        g.strokeStyle = `rgba(255,201,74,${(0.4 + s.charge * 0.6).toFixed(2)})`;
        g.lineWidth = 3;
        g.beginPath();
        g.arc(x, y, 10, -Math.PI / 2, -Math.PI / 2 + s.charge * Math.PI * 2);
        g.stroke();
      }
    }
  }

  private drawThrone(): void {
    const run = this.run;
    if (run.throne.awake) return;
    const g = this.ctx;
    const x = px(run.throne.x), y = px(run.throne.y);
    const R = px(THRONE_RADIUS);
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 2);

    g.strokeStyle = `rgba(255,201,74,${(0.25 + pulse * 0.3).toFixed(2)})`;
    g.lineWidth = 1.5;
    g.beginPath(); g.arc(x, y, R, 0, Math.PI * 2); g.stroke();
    g.setLineDash([3, 5]);
    g.beginPath(); g.arc(x, y, R + 9, 0, Math.PI * 2); g.stroke();
    g.setLineDash([]);

    // one pip per cell already given
    g.fillStyle = GOLD;
    run.throne.fed.forEach((_, i) => {
      const a = (i / Math.max(1, run.throne.fed.length)) * Math.PI * 2 - Math.PI / 2;
      g.beginPath(); g.arc(x + Math.cos(a) * (R - 8), y + Math.sin(a) * (R - 8), 2.5, 0, Math.PI * 2); g.fill();
    });

    g.fillStyle = `rgba(255,201,74,${(0.5 + pulse * 0.4).toFixed(2)})`;
    g.font = `700 9px ${MONO}`;
    g.textAlign = "center";
    g.fillText(run.throne.fed.length ? run.throne.hm : "THRONE", x, y - R - 14);
    g.textAlign = "left";
  }

  private drawTrails(): void {
    const g = this.ctx;
    g.lineCap = "round";
    for (const e of this.run.entities) {
      const n = e.trail.length / 2;
      if (n < 3) continue;
      const rgb = warmth(contrastFactor(particleOf(e), this.run.world.medium));
      const w = Math.max(1.2, px(particleOf(e).radius) * 0.55);
      for (let i = 1; i < n; i++) {
        const f = i / n;
        g.strokeStyle = `rgba(${rgb},${(f * 0.24).toFixed(3)})`;
        g.lineWidth = f * w;
        g.beginPath();
        g.moveTo(px(e.trail[(i - 1) * 2]), px(e.trail[(i - 1) * 2 + 1]));
        g.lineTo(px(e.trail[i * 2]), px(e.trail[i * 2 + 1]));
        g.stroke();
      }
    }
  }

  private drawEntities(): void {
    const g = this.ctx;
    for (const e of this.run.entities) {
      const p = particleOf(e);
      const x = px(e.x), y = px(e.y);
      const r = Math.max(2.4, px(p.radius));
      const rgb = warmth(contrastFactor(p, this.run.world.medium));
      const hot = e.held > 0 || e.flash > 0;

      const rad = r * (hot ? 5.5 : 3.4);
      const glow = g.createRadialGradient(x, y, 0, x, y, rad);
      glow.addColorStop(0, `rgba(${rgb},${hot ? 0.42 : 0.16})`);
      glow.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = glow;
      g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();

      g.fillStyle = `rgb(${rgb})`;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      g.fillStyle = "rgba(255,255,255,0.45)";
      g.beginPath(); g.arc(x - r * 0.3, y - r * 0.3, r * 0.3, 0, Math.PI * 2); g.fill();

      if (e.faction === "beast") {
        const b = beast(e.species);
        g.strokeStyle = `rgba(${rgb},${e.flash > 0 ? 0.95 : 0.5})`;
        g.lineWidth = 1.4;
        if (b.behaviour !== "drift") {
          const n = b.behaviour === "split" ? 3 : 6;
          for (let i = 0; i < n; i++) {
            const th = e.spin + (i * Math.PI * 2) / n;
            g.beginPath();
            g.moveTo(x + Math.cos(th) * (r + 2), y + Math.sin(th) * (r + 2));
            g.lineTo(x + Math.cos(th) * (r + 7), y + Math.sin(th) * (r + 7));
            g.stroke();
          }
        }
        // The coil. A ring collapsing onto it counts the wind-up down, and the
        // line says where it is going — it commits to a direction when it
        // fires, so the line is the truth and stepping off it is the answer.
        if (e.wind > 0) {
          const f = 1 - e.wind / b.wind;
          g.strokeStyle = `rgba(255,240,120,${(0.35 + f * 0.6).toFixed(3)})`;
          g.lineWidth = 1.6 + f * 1.6;
          g.beginPath(); g.arc(x, y, r + 4 + (1 - f) * 22, 0, Math.PI * 2); g.stroke();

          const you = this.run.you;
          const ax = you.x - e.x, ay = you.y - e.y;
          const ar = Math.hypot(ax, ay) || 1e-12;
          const reach = px(STRIKE_RANGE * 0.8) * f;
          g.strokeStyle = `rgba(255,240,120,${(0.14 + f * 0.4).toFixed(3)})`;
          g.lineWidth = 1;
          g.setLineDash([4, 4]);
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x + (ax / ar) * reach, y + (ay / ar) * reach);
          g.stroke();
          g.setLineDash([]);
        }
        if (e.strike > 0) {
          g.strokeStyle = "rgba(255,255,255,0.8)";
          g.lineWidth = 2.5;
          g.beginPath();
          g.moveTo(x - e.sx * 16, y - e.sy * 16);
          g.lineTo(x, y);
          g.stroke();
        }
        if (e.held > 0) {
          const f = Math.min(1, e.held / b.hold);
          g.strokeStyle = `rgb(${rgb})`;
          g.lineWidth = 2.4;
          g.beginPath();
          g.arc(x, y, r + 8, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2);
          g.stroke();
        }
      } else if (e.parts.length > 1) {
        // one gold pip per motif gathered, so the count is readable at a glance
        g.fillStyle = GOLD;
        const n = Math.min(6, e.parts.length);
        for (let i = 0; i < n; i++) {
          const th = (i / n) * Math.PI * 2 - Math.PI / 2;
          g.beginPath();
          g.arc(x + Math.cos(th) * (r + 5), y + Math.sin(th) * (r + 5), 1.5, 0, Math.PI * 2);
          g.fill();
        }
      }
    }
  }

  private drawSovereign(): void {
    const k = this.run.throne;
    if (!k.awake || k.hp <= 0) return;
    const g = this.ctx;
    const p = sovereignParticle(k);
    const x = px(k.x), y = px(k.y);
    const r = px(p.radius);
    const rgb = k.anchored ? "210,190,255" : "150,220,255";

    const glow = g.createRadialGradient(x, y, 0, x, y, r * 4);
    glow.addColorStop(0, `rgba(${rgb},0.34)`);
    glow.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = glow;
    g.beginPath(); g.arc(x, y, r * 4, 0, Math.PI * 2); g.fill();

    // The wind-up. Its spin stops while it gathers, so what is drawn here is
    // exactly what it throws — the arms grow out to their real reach and you
    // stand in the gaps between them.
    const wind = Math.max(0, (VOLLEY_WIND - k.beat) / VOLLEY_WIND);
    if (wind > 0) {
      const arms = volley(k);
      g.lineWidth = 1 + wind * 2.6;
      for (const [dx, dy] of arms) {
        const grad = g.createLinearGradient(x, y, x + dx * 260 * wind, y + dy * 260 * wind);
        grad.addColorStop(0, `rgba(255,120,150,${(0.5 * wind).toFixed(3)})`);
        grad.addColorStop(1, "rgba(255,120,150,0)");
        g.strokeStyle = grad;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + dx * 260 * wind, y + dy * 260 * wind);
        g.stroke();
      }
      g.strokeStyle = `rgba(255,120,150,${(0.25 + wind * 0.5).toFixed(3)})`;
      g.lineWidth = 2;
      g.beginPath(); g.arc(x, y, r + 6 + (1 - wind) * 26, 0, Math.PI * 2); g.stroke();
    }

    // its body carries its own group's arms, turning
    g.strokeStyle = `rgba(${rgb},0.85)`;
    g.lineWidth = 2.4;
    for (const [dx, dy] of volley(k)) {
      g.beginPath();
      g.moveTo(x + dx * r * 0.7, y + dy * r * 0.7);
      g.lineTo(x + dx * r * 2.05, y + dy * r * 2.05);
      g.stroke();
    }
    g.fillStyle = `rgb(${rgb})`;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#0a1420";
    g.font = `700 12px ${MONO}`;
    g.textAlign = "center";
    g.fillText(k.hm, x, y - 6);
    g.textAlign = "left";

    // health, over its head
    const w = 116;
    g.fillStyle = "rgba(255,255,255,0.1)";
    g.fillRect(x - w / 2, y - r - 22, w, 5);
    g.fillStyle = k.anchored ? "#d2beff" : "#8ce9ff";
    g.fillRect(x - w / 2, y - r - 22, w * (k.hp / k.maxHp), 5);
    if (k.anchored) {
      g.fillStyle = "#d2beff";
      g.font = `700 8px ${MONO}`;
      g.textAlign = "center";
      g.fillText("NO HANDLE", x, y - r - 34);
      g.textAlign = "left";
    }
  }

  private drawBolts(): void {
    const g = this.ctx;
    for (const b of this.run.bolts) {
      const x = px(b.x), y = px(b.y);
      const a = Math.min(1, b.life);
      g.strokeStyle = `rgba(255,140,190,${(a * 0.85).toFixed(2)})`;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x - b.vx * PX * 0.03, y - b.vy * PX * 0.03);
      g.lineTo(x, y);
      g.stroke();
      g.fillStyle = `rgba(255,200,225,${a.toFixed(2)})`;
      g.beginPath(); g.arc(x, y, 2.4, 0, Math.PI * 2); g.fill();
    }
  }

  private drawSparks(): void {
    const g = this.ctx;
    for (const s of this.sparks) {
      const f = s.life / s.max;
      g.fillStyle = `rgba(${s.rgb},${(f * 0.9).toFixed(3)})`;
      g.fillRect(px(s.x) - 1, px(s.y) - 1, 1 + f * 2, 1 + f * 2);
    }
  }

  private drawRings(): void {
    const g = this.ctx;
    for (const ring of this.rings) {
      const f = 1 - ring.life / ring.born;
      const r = ring.r + (ring.max - ring.r) * Math.min(1, f * 1.4);
      g.strokeStyle = `rgba(${ring.rgb},${Math.max(0, ring.life / ring.born * 0.9).toFixed(3)})`;
      g.lineWidth = 2;
      g.beginPath(); g.arc(px(ring.x), px(ring.y), r, 0, Math.PI * 2); g.stroke();
    }
  }

  /**
   * You.
   *
   * Drawn from the same two numbers everything else on screen is drawn from:
   * the sign of your own contrast factor picks the colour, and the drive
   * envelope picks the radius of the ring. The cross a quarter pitch ahead is
   * the node you are falling toward — the single most useful thing on the
   * screen, because it is what steering actually IS.
   */
  private drawYou(): void {
    const g = this.ctx;
    const run = this.run;
    const w = run.wave;
    const you = run.you;
    const x = px(you.x), y = px(you.y);
    const lit = Math.min(1.4, w.amplitude / w.maxAmplitude);
    const phi = selfContrast(you, w);
    const hurt = (run.iframe > 0 || you.iframe > 0) && Math.sin(this.t * 40) > 0;
    const rgb = w.spent ? "255,70,100" : hurt ? "255,255,255" : warmth(phi);

    // The streak. A burst covers two hundred microns in seven frames, which is
    // too fast to see as a body, so it is drawn as the distance it crossed.
    if (this.youTrail.length >= 4) {
      g.lineCap = "round";
      for (let i = 2; i < this.youTrail.length; i += 2) {
        const a = (i / this.youTrail.length) ** 2;
        g.strokeStyle = `rgba(${rgb},${(a * (you.dash > 0 ? 0.5 : 0.16)).toFixed(3)})`;
        g.lineWidth = 1 + a * (you.dash > 0 ? 7 : 3);
        g.beginPath();
        g.moveTo(px(this.youTrail[i - 2]), px(this.youTrail[i - 1]));
        g.lineTo(px(this.youTrail[i]), px(this.youTrail[i + 1]));
        g.stroke();
      }
      g.lineCap = "butt";
    }

    // Your hand: the 1/e width of the apodisation, which is the actual reach of
    // the grip and visibly closes when you pull the trigger.
    const reach = px(w.focus);
    g.strokeStyle = `rgba(${rgb},${(0.07 + you.grip * 0.3).toFixed(3)})`;
    g.lineWidth = 1;
    g.setLineDash([3, 5]);
    g.beginPath(); g.arc(x, y, reach, 0, Math.PI * 2); g.stroke();
    g.setLineDash([]);

    // The node you are falling into.
    if (run.aim.x !== you.x || run.aim.y !== you.y) {
      const ax = px(run.aim.x), ay = px(run.aim.y);
      g.strokeStyle = `rgba(${rgb},${(0.3 + lit * 0.4).toFixed(3)})`;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(ax - 4, ay); g.lineTo(ax + 4, ay);
      g.moveTo(ax, ay - 4); g.lineTo(ax, ay + 4);
      g.stroke();
      g.strokeStyle = `rgba(${rgb},0.18)`;
      g.beginPath(); g.moveTo(x, y); g.lineTo(ax, ay); g.stroke();
    }

    const r = px(you.particle.radius) + 2;
    const glow = g.createRadialGradient(x, y, 0, x, y, r * 4.5);
    glow.addColorStop(0, `rgba(${rgb},${(0.12 + lit * 0.26).toFixed(3)})`);
    glow.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = glow;
    g.beginPath(); g.arc(x, y, r * 4.5, 0, Math.PI * 2); g.fill();

    g.fillStyle = `rgba(${rgb},0.9)`;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "#eaffff";
    g.lineWidth = 1.4;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();

    // A ring for the burst, and one for the cooldown coming back.
    if (you.dash > 0) {
      g.strokeStyle = `rgba(255,255,255,${(you.dash / DASH_TIME * 0.8).toFixed(3)})`;
      g.lineWidth = 2;
      g.beginPath(); g.arc(x, y, r + 6 + (1 - you.dash / DASH_TIME) * 16, 0, Math.PI * 2);
      g.stroke();
    } else if (you.dashCool > 0) {
      g.strokeStyle = "rgba(120,225,245,0.3)";
      g.lineWidth = 2;
      g.beginPath();
      g.arc(x, y, r + 5, -Math.PI / 2,
        -Math.PI / 2 + Math.PI * 2 * (1 - you.dashCool / DASH_COOL));
      g.stroke();
    }
  }

  private drawPopups(): void {
    const g = this.ctx;
    g.textAlign = "center";
    for (const p of this.popups) {
      g.globalAlpha = Math.min(1, p.life * 1.6);
      g.fillStyle = p.colour;
      g.font = `700 ${p.big ? 22 : 13}px ${MONO}`;
      g.fillText(p.text, px(p.x), px(p.y) - 16);
    }
    g.globalAlpha = 1;
    g.textAlign = "left";
  }

  // ── hud ───────────────────────────────────────────────────────────────────

  private slotRect(i: number): { x: number; y: number; w: number; h: number } {
    return { x: VIEW_W - 18 - (i + 1) * 46 + 6, y: VIEW_H - 62, w: 40, h: 44 };
  }

  private slotAt(sx: number, sy: number): number {
    for (let i = 0; i < this.run.cells.length; i++) {
      const r = this.slotRect(i);
      if (sx >= r.x && sx <= r.x + r.w && sy >= r.y && sy <= r.y + r.h) return i;
    }
    return -1;
  }

  private drawHud(): void {
    const g = this.ctx;
    const run = this.run;
    const w = run.wave;
    g.textBaseline = "top";

    for (let i = 0; i < MAX_INTEGRITY; i++) {
      const on = i < run.integrity;
      g.fillStyle = on ? (run.integrity === 1 ? RED : "#5ef0c0") : "rgba(255,255,255,0.09)";
      g.beginPath(); g.arc(24 + i * 15, 22, on ? 5 : 3.5, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = DIM;
    g.font = `600 9px ${MONO}`;
    g.fillText("INTEGRITY", 18, 34);

    const sf = w.stamina / STAMINA_MAX;
    bar(g, 18, 52, 176, 7, sf, w.spent ? RED : sf < 0.3 ? "#ffa24a" : "#5ef0c0", "STAMINA");
    const af = w.amplitude / w.maxAmplitude;
    bar(g, 18, 76, 176, 7, af, w.inverted ? `rgb(${ANTI})` : `rgb(${NODE})`,
      w.inverted ? "GRIP · ANTINODE · PUSH" : "GRIP · NODE · PULL");

    // the world, honestly
    const world = run.world;
    g.font = `600 9px ${MONO}`;
    g.fillStyle = FAINT;
    g.fillText(`${(frequency(w) / 1e6).toFixed(1)} MHZ   ${world.medium.c.toFixed(0)} M/S`
      + `   ${world.medium.rho.toFixed(0)} KG/M3   PITCH ${(world.pitch * 1e6).toFixed(0)} UM`, 18, 100);

    g.textAlign = "center";
    g.fillStyle = INK;
    g.font = `700 13px ${MONO}`;
    g.fillText(`AEON ${world.aeon}  ·  ${world.name}`, VIEW_W / 2, 16);
    g.fillStyle = DIM;
    g.font = `600 9px ${MONO}`;
    g.fillText(run.phase === "reign" ? "IT IS AWAKE" : "SETTLING", VIEW_W / 2, 34);
    g.textAlign = "left";

    g.textAlign = "right";
    g.fillStyle = GOLD;
    g.font = `700 26px ${MONO}`;
    g.fillText(String(run.score), VIEW_W - 18, 14);
    g.fillStyle = DIM;
    g.font = `600 9px ${MONO}`;
    g.fillText("SCORE", VIEW_W - 18, 46);
    g.textAlign = "left";

    this.drawRack();
    this.drawReadout();

    if (this.toastT > 0) {
      g.textAlign = "center";
      g.globalAlpha = Math.min(1, this.toastT / 0.6);
      g.fillStyle = w.spent ? RED : INK;
      g.font = `700 13px ${MONO}`;
      g.fillText(this.toast, VIEW_W / 2, 54);
      g.globalAlpha = 1;
      g.textAlign = "left";
    }

    g.textAlign = "center";
    g.fillStyle = FAINT;
    g.font = `600 9px ${MONO}`;
    const G = this.pad.connected ? GLYPH.pad : GLYPH.keys;
    const hint = run.phase === "reign"
      ? `${G.grip} ON YOUR OWN BUILDINGS TO DISCHARGE THEM   ·   ${G.dash} TO BURST CLEAR`
      : run.throne.fed.length > 0
        ? `${G.crown} TO CROWN IT   ·   OR FEED IT MORE AND MAKE A RICHER WORLD`
        : `${G.grip} TO GATHER   ·   ${G.place} PLACES A CELL   ·   `
          + "STAND ON THE THRONE TO FEED IT";
    g.fillText(hint, VIEW_W / 2, VIEW_H - 16);
    g.textAlign = "left";
  }

  /** The cell rack. Structure and freedom are shown side by side because
   *  Neumann's principle puts them in tension and the rack is where you feel it. */
  private drawRack(): void {
    const g = this.ctx;
    const run = this.run;
    if (run.cells.length === 0) {
      g.textAlign = "right";
      g.fillStyle = FAINT;
      g.font = `600 9px ${MONO}`;
      g.fillText("NO CELLS IN HAND", VIEW_W - 18, VIEW_H - 36);
      g.textAlign = "left";
      return;
    }
    run.cells.forEach((c, i) => {
      const r = this.slotRect(i);
      const tint = c.ability === "thrust" ? NODE : c.ability === "weave" ? JADE : "255,201,74";
      const picked = i === this.selected;
      g.fillStyle = picked ? "rgba(26,44,62,0.92)" : "rgba(10,18,28,0.8)";
      g.fillRect(r.x, r.y, r.w, r.h);
      g.strokeStyle = `rgba(${tint},${picked ? 1 : 0.5})`;
      g.lineWidth = picked ? 2 : 1;
      g.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);

      g.textAlign = "center";
      g.fillStyle = `rgb(${tint})`;
      g.font = `700 12px ${MONO}`;
      g.fillText(c.group.hm, r.x + r.w / 2, r.y + 6);
      g.fillStyle = DIM;
      g.font = `600 8px ${MONO}`;
      g.fillText(`${c.structure}·${c.freedom}`, r.x + r.w / 2, r.y + 21);
      g.fillStyle = FAINT;
      g.fillText(`${lobes(c.group.hm).length} ARM`, r.x + r.w / 2, r.y + 32);
      g.textAlign = "left";
      g.fillStyle = FAINT;
      g.font = `600 8px ${MONO}`;
      g.fillText(String(i + 1), r.x + 3, r.y + 3);
    });
  }

  private drawReadout(): void {
    const g = this.ctx;
    const run = this.run;
    let near: Entity | null = null;
    let bestR = 100e-6;
    for (const e of run.entities) {
      const r = Math.hypot(e.x - run.you.x, e.y - run.you.y);
      if (r < bestR) { bestR = r; near = e; }
    }
    if (!near) return;
    const d = readoutFor(run, near);
    const rgb = warmth(d.contrast);
    const x = 18, y = VIEW_H - 96;

    g.fillStyle = "rgba(10,18,28,0.72)";
    g.fillRect(x, y, 232, 78);
    g.strokeStyle = `rgba(${rgb},0.35)`;
    g.lineWidth = 1;
    g.strokeRect(x + 0.5, y + 0.5, 231, 77);

    g.font = `700 11px ${MONO}`;
    g.fillStyle = `rgb(${rgb})`;
    g.fillText(d.label, x + 9, y + 9);
    g.font = `600 9px ${MONO}`;
    g.fillStyle = DIM;
    g.fillText(`PHI ${d.contrast >= 0 ? "+" : ""}${d.contrast.toFixed(3)}   ${d.goesTo}`, x + 9, y + 27);
    g.fillText(`RADIUS ${(d.radius * 1e6).toFixed(1)} UM`, x + 9, y + 41);
    g.fillStyle = d.authority >= 1 ? "#5ef0c0" : "#ffa24a";
    g.fillText(d.authority >= 1 ? `FIELD ${d.authority.toFixed(0)}x` : `STREAMING ${(1 / d.authority).toFixed(0)}x`,
      x + 138, y + 41);
    g.fillStyle = "#9fbdd0";
    g.fillText(d.hint, x + 9, y + 58);
  }

  // ── screens ───────────────────────────────────────────────────────────────

  private drawBirth(): void {
    const g = this.ctx;
    const run = this.run;
    g.fillStyle = "rgba(5,7,14,0.9)";
    g.fillRect(0, 0, VIEW_W, VIEW_H);
    g.textAlign = "center";

    g.fillStyle = GOLD;
    g.font = `700 13px ${MONO}`;
    g.fillText("OUT OF THE BODY", VIEW_W / 2, 118);

    g.fillStyle = INK;
    g.font = `700 38px ${MONO}`;
    g.fillText(run.world.name, VIEW_W / 2, 150);

    const e = epitaphFor(run.throne, run.world);
    e.lines.forEach(([k, v], i) => {
      const y = 236 + i * 30;
      g.textAlign = "right";
      g.fillStyle = DIM;
      g.font = `600 10px ${MONO}`;
      g.fillText(k, VIEW_W / 2 - 18, y + 3);
      g.textAlign = "left";
      g.fillStyle = i === 0 ? GOLD : INK;
      g.font = `600 12px ${MONO}`;
      g.fillText(v, VIEW_W / 2 + 18, y);
    });

    g.textAlign = "center";
    const pulse = 0.55 + 0.45 * Math.sin(this.t * 3);
    g.fillStyle = `rgba(255,201,74,${pulse.toFixed(2)})`;
    g.font = `700 14px ${MONO}`;
    g.fillText("ENTER IT", VIEW_W / 2, VIEW_H - 84);
    g.fillStyle = FAINT;
    g.font = `600 9px ${MONO}`;
    g.fillText("EVERYTHING ABOVE IS COMPUTED FROM WHAT YOU FED THE THRONE", VIEW_W / 2, VIEW_H - 58);
    g.textAlign = "left";
  }

  private drawDead(): void {
    const g = this.ctx;
    const run = this.run;
    g.fillStyle = "rgba(5,7,14,0.88)";
    g.fillRect(0, 0, VIEW_W, VIEW_H);
    g.textAlign = "center";

    g.fillStyle = RED;
    g.font = `700 34px ${MONO}`;
    g.fillText("THE FIELD COLLAPSED", VIEW_W / 2, 186);

    const rows: Array<[string, string]> = [
      ["WORLDS MADE", String(run.aeonsSurvived)],
      ["DIED IN", `AEON ${run.world.aeon}  ·  ${run.world.name}`],
      ["CELLS BUILT", String(run.built)],
      ["STILL STANDING", `${run.structures.length} STRUCTURES`],
      ["SCORE", String(run.score)],
    ];
    rows.forEach(([k, v], i) => {
      const y = 258 + i * 28;
      g.textAlign = "right";
      g.fillStyle = DIM;
      g.font = `600 10px ${MONO}`;
      g.fillText(k, VIEW_W / 2 - 16, y + 3);
      g.textAlign = "left";
      g.fillStyle = i === 4 ? GOLD : INK;
      g.font = `700 13px ${MONO}`;
      g.fillText(v, VIEW_W / 2 + 16, y);
    });

    g.textAlign = "center";
    g.fillStyle = DIM;
    g.font = `600 10px ${MONO}`;
    g.fillText(`BEST ${this.best}   ·   DEEPEST AEON ${this.deepest}`, VIEW_W / 2, 428);
    const pulse = 0.55 + 0.45 * Math.sin(this.t * 3);
    g.fillStyle = `rgba(255,201,74,${pulse.toFixed(2)})`;
    g.font = `700 14px ${MONO}`;
    g.fillText("BEGIN AGAIN", VIEW_W / 2, 470);
    g.textAlign = "left";
  }

  private drawCard(): void {
    if (!this.card) return;
    const g = this.ctx;
    const a = Math.min(1, this.cardT / 0.8) * Math.min(1, (8 - this.cardT) / 0.35);
    const h = 78;
    const y = VIEW_H - 182;
    g.globalAlpha = a;
    g.fillStyle = "rgba(8,16,26,0.93)";
    g.fillRect(262, y, 620, h);
    g.fillStyle = `rgb(${NODE})`;
    g.fillRect(262, y, 2, h);
    g.font = `700 11px ${MONO}`;
    g.fillStyle = `rgb(${NODE})`;
    g.fillText(this.card.title, 276, y + 12);
    g.font = `600 9.5px ${MONO}`;
    g.fillStyle = "#9fbdd0";
    wrap(g, this.card.body, 276, y + 31, 592, 13);
    g.globalAlpha = 1;
  }

  private drawTitle(): void {
    const g = this.ctx;
    g.textAlign = "center";
    g.fillStyle = "rgba(5,7,14,0.62)";
    g.fillRect(0, 0, VIEW_W, VIEW_H);

    g.font = `700 50px ${MONO}`;
    g.fillStyle = INK;
    g.fillText("SONIC DRIFTER", VIEW_W / 2, 118);
    g.font = `600 12px ${MONO}`;
    g.fillStyle = `rgb(${NODE})`;
    g.fillText("YOU ARE A BODY IN THE WATER, AND ONLY THE FIELD MOVES YOU.",
      VIEW_W / 2, 182);

    const on = this.pad.connected;
    const G = on ? GLYPH.pad : GLYPH.keys;
    g.fillStyle = DIM;
    g.font = `600 11px ${MONO}`;
    const pad = (t: string) => t.padEnd(13, " ");
    const lines = [
      `${pad(G.move)}PUT THE NODE A QUARTER PITCH AHEAD. YOU FALL INTO IT.`,
      `${pad(G.grip)}CLOSE YOUR HAND: ONE TRAP, AND SPEED. IT COSTS STAMINA.`,
      `${pad(G.dash)}BURST. THE AMPLIFIER'S PEAK RATING, AND YOU ARE UNTOUCHABLE.`,
      `${pad(G.place)}PLACE A CELL. STAND ON THE THRONE TO FEED IT INSTEAD.`,
      `${pad(G.crown)}CROWN WHAT YOU HAVE FED.`,
      "",
      "SETTLE   GATHER FOUR OF A KIND. A PLACED CELL STAYS, AND GATHERS FOR YOU.",
      "CROWN    WHAT YOU FEED THE THRONE IS WHAT IT BECOMES.",
      "REIGN    IT EATS WHAT YOU BUILT. GRIP YOUR OWN BUILDINGS TO FIRE THEM.",
      "BIRTH    ITS BODY IS THE NEXT WORLD - ITS WATER, ITS LATTICE, ITS MATTER.",
      "",
      "WHAT SHARES YOUR CONTRAST COMES TO YOUR FEET. THE REST RINGS YOU.",
    ];
    lines.forEach((l, i) => g.fillText(l, VIEW_W / 2, 214 + i * 17));

    const pulse = 0.55 + 0.45 * Math.sin(this.t * 3);
    g.font = `700 14px ${MONO}`;
    g.fillStyle = `rgba(255,201,74,${pulse.toFixed(2)})`;
    g.fillText(on ? "PRESS START" : "PRESS SPACE OR CLICK TO BEGIN", VIEW_W / 2, 462);
    if (on) {
      g.font = `600 9px ${MONO}`;
      g.fillStyle = `rgb(${JADE})`;
      g.fillText("CONTROLLER CONNECTED", VIEW_W / 2, 440);
    }
    if (this.best > 0) {
      g.fillStyle = DIM;
      g.font = `600 10px ${MONO}`;
      g.fillText(`BEST ${this.best}   ·   DEEPEST AEON ${this.deepest}`, VIEW_W / 2, 492);
    }
    g.font = `600 9px ${MONO}`;
    g.fillStyle = FAINT;
    g.fillText("EVERY FORCE HERE IS THE GOR'KOV RADIATION POTENTIAL, COMPUTED LIVE",
      VIEW_W / 2, VIEW_H - 26);
    g.textAlign = "left";
  }
}

// ── helpers ─────────────────────────────────────────────────────────────────

/** Cool if it answers to nodes, warm if it answers to antinodes. One rule, and
 *  it is recomputed in each world's own medium. */
function warmth(phi: number): string {
  if (Math.abs(phi) < 0.015) return "190,200,215";
  return phi > 0 ? "127,216,232" : "232,120,165";
}

function beastPhi(run: Run, species: string): number {
  return contrastFactor(beast(species).particle, run.world.medium);
}

const REFUSALS: Readonly<Record<string, string>> = {
  "five-fold": "FIVE-FOLD", "two-axes": "TWO AXES",
  "no-axis": "NO AXIS", "unknown": "NO GROUP",
};
const refusal = (k: string): string => REFUSALS[k] ?? "NO GROUP";

function bar(
  g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number,
  f: number, colour: string, label: string,
): void {
  g.fillStyle = "rgba(255,255,255,0.06)";
  g.fillRect(x, y, w, h);
  g.fillStyle = colour;
  g.fillRect(x, y, Math.max(0, Math.min(1, f)) * w, h);
  g.strokeStyle = "rgba(255,255,255,0.1)";
  g.lineWidth = 1;
  g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  g.fillStyle = DIM;
  g.font = `600 9px ${MONO}`;
  g.fillText(label, x, y + h + 4);
}

function wrap(
  g: CanvasRenderingContext2D, text: string,
  x: number, y: number, maxW: number, lh: number,
): void {
  let line = "";
  let row = 0;
  for (const word of text.split(" ")) {
    const test = line ? `${line} ${word}` : word;
    if (g.measureText(test).width > maxW && line) {
      g.fillText(line, x, y + row * lh);
      line = word; row++;
    } else { line = test; }
  }
  if (line) g.fillText(line, x, y + row * lh);
}

// ── boot ────────────────────────────────────────────────────────────────────

const canvas = document.getElementById("game") as HTMLCanvasElement | null;
if (canvas) new Game(canvas).start();
