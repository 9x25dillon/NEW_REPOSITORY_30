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
  arrivalRate, settleCap, suspension,
  HOLD_CATCH, LOBE_ARC, LOBE_RANGE, STRIKE_RANGE, VOLLEY_WIND, bearsOn, wearing,
  CHANNEL_H, beast, crown, dischargesToKill, enterWorld, feedThrone, latticePitch,
  liftCell,
  particleOf, placeCell, readoutFor, retuneChannel, streamOf, waterAt,
  startRun, step,
} from "../game/run.js";
import { envelopeAt, frequency, trapsX, trapsY, STAMINA_MAX } from "../game/wave.js";
import {
  epitaphFor, sovereignParticle, volley,
} from "../game/world.js";
import { lobes } from "../game/shape.js";
import { SEED_MASS, assemble, motif, optionsFor } from "../game/lattice.js";
import { RELEASE_TIME, advice, catches, detune } from "../game/bound.js";
import { autonomous, limbsOf, snap, symbolOf, walkSpeed } from "../game/body.js";
import { CHANNEL_HEIGHT, MAX_MODE, modeFrequency, planes, together } from "../game/depth.js";
import { STREAMS, mediumAt, streamBand, streamName } from "../game/streams.js";
import {
  type Feature, CHIP, CHANNEL_W, EDGE_STANDOFF_FRAC, chipFlow, featureName,
  flowAt, nearestFeature,
} from "../game/run.js";
import { YOU } from "../game/pilot.js";
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
interface Tracer { x: number; y: number; px: number; py: number; life: number; f: Feature }

interface Lesson { id: string; title: string; body: string }

/** How long a lesson stays up, seconds. */
const CARD_TIME = 8;

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
  walk: {
    id: "walk", title: "IT IS FOLLOWING YOU",
    body: "A SWEPT LATTICE CARRIES WHAT IS SITTING IN IT, BUT ONLY WHILE THE TRAP CAN OUT-PULL "
      + "THE DRAG - PAST THAT A CELL FALLS OUT OF ITS NODE AND IS LEFT BEHIND. SO THE BODY "
      + "WALKS AT THE PACE OF ITS FURTHEST CELL, ALONG THE DIRECTIONS ITS OWN GROUP HAS, AND "
      + "ONLY WHILE YOU ARE NEAR ENOUGH FOR THE DRIVE TO REACH ALL OF IT.",
  },
  chip: {
    id: "chip", title: "THE GLASS IS OLDER THAN THE WORLD",
    body: "A SHARP TIP IN AN OSCILLATING FIELD RECTIFIES THE FLOW AROUND IT INTO A STEADY "
      + "JET - SHARP-EDGE ACOUSTOFLUIDICS, USED TO MIX AND TO PUMP. THESE ARE CUT OVER SO "
      + "THEY ADD ALONG THE WALL INSTEAD OF FIGHTING ACROSS IT, WHICH MAKES THE TWO LONG "
      + "WALLS A WAY AROUND THE CHANNEL. EVERY WORLD IS BORN FROM THE LAST KING. THE CHANNEL "
      + "IS NOT: IT WAS ETCHED ONCE AND IT IS THE SAME CHIP IN EVERY AEON, SO IT IS THE ONLY "
      + "THING HERE WORTH LEARNING THE SHAPE OF.",
  },
  whirl: {
    id: "whirl", title: "LET GO",
    body: "A BUBBLE TRAPPED IN A SIDE CAVITY OSCILLATES AND THROWS A STREAMING VORTEX. IT IS "
      + "DRIVEN BY YOUR FIELD AND STREAMING GOES AS PRESSURE SQUARED, SO GRIPPING IS WHAT "
      + "MAKES IT STRONG - RELEASE AND IT DROPS TO A THIRD AND YOU CAN WALK OUT. EVERYTHING "
      + "ELSE HERE IS ESCAPED BY GRIPPING. THIS IS NOT.",
  },
  bound: {
    id: "bound", title: "IT IS HELD BY A DISPERSION RELATION",
    body: "THE OTHER FIELD IS A MODE AT ONE FREQUENCY, IN A WORLD WHOSE LATTICE WILL NOT "
      + "CARRY IT. A TRAPPED MODE LEAVES ALONG A CHANNEL, AND A CHANNEL ONLY GUIDES WHERE "
      + "THE CRYSTAL AROUND IT FORBIDS - SO YOU MUST BUILD ONE WHOSE BAND GAP CATCHES ITS "
      + "FREQUENCY. HOW MUCH YOU BUILD DECIDES IF THERE IS A GAP. HOW FAR APART DECIDES WHERE.",
  },
  hand: {
    id: "hand", title: "EVERYTHING HERE DIES BY BEING HELD",
    body: "IT IS TOO BIG FOR ONE TRAP - THIRTY-EIGHT MICRONS ACROSS AGAINST A FORTY-FOUR "
      + "MICRON LATTICE - SO NO WELL CLOSES ON IT. BUT THE DRIVE IS STILL WORKING ON IT, AND "
      + "IT COMES APART. SLOWLY, AND ONLY IF YOU LEFT IT A HANDLE TO BE HELD BY: FEED THE "
      + "THRONE A 432 AND THIS DOES NOTHING AT ALL.",
  },
  aim: {
    id: "aim", title: "YOU CANNOT AIM A BUILDING",
    body: "STAND ON ONE OF YOUR OWN BUILDINGS AND CLOSE YOUR HAND: IT FIRES ALONG ITS "
      + "GROUP'S DIRECTIONS AND IS SPENT. THIS IS HOW THE KING DIES - YOUR BARE HAND LOSES "
      + "TO WHAT IT HEALS BY EATING THEM. THE ARMS WERE FIXED WHEN YOU PLACED IT, SO YOU DO "
      + "NOT AIM THE GUN: THE KING IS DENSE AND YOUR NODE SHOVES IT EIGHT TIMES FASTER THAN "
      + "IT WALKS. YOU AIM THE KING.",
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
    id: "devour", title: "IT EATS WHAT YOU MADE, AND HEALS",
    body: "EVERY STRUCTURE IT TAKES IS BOTH YOUR ARSENAL AND ITS MEAL: IT HEALS THREE TIMES "
      + "THAT BUILDING'S ORDER. IT CAN ONLY REACH WHAT IS WITHIN A HUNDRED AND FIFTY MICRONS "
      + "OF IT, SO BUILDING AROUND THE THRONE IS FEEDING IT. STAND YOUR ARMS BACK AND WALK "
      + "THE KING INTO THEM.",
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
  /** The run, for inspection. Read-only in spirit. */
  get state(): Run { return this.run; }
  /** What the controls did this frame, for inspection. */
  intent: Intent | null = null;
  /** Where the body has been, for the streak. Flat pairs. */
  private youTrail: number[] = [];
  /** Which cell in the rack a bare press will spend. */
  private selected = 0;
  private wasGrip = false;
  /**
   * What happened, counted.
   *
   * There are no logs — it is a static page and nothing writes anything — so
   * three times now the only account of a run has been somebody trying to
   * remember it. This is the account.
   */
  private tally: Record<string, number> = {};
  /** Stopped. Nothing in the water advances, and the surface keeps drawing. */
  private paused = false;
  /** Frames of held time after a heavy landing. Sold as impact; it is really
   *  just the update being withheld for a moment while the draw keeps going. */
  private hitstop = 0;
  private lastRefusal = -99;
  /**
   * Where the window is, in metres.
   *
   * The water is bigger than the screen now and opens further as the organism
   * grows, so the view follows you and stops at the glass. It lags a little on
   * purpose: a camera pinned exactly to a body that is being dragged about by a
   * standing wave is unreadable.
   */
  private cam = { x: 0, y: 0 };
  /**
   * The pointer, in metres, and whether it is steering.
   *
   * The movement this game wants is a DIRECTION WITH A MAGNITUDE — it is the
   * offset of the trap from your body — and a mouse gives both, continuously,
   * where WASD gives eight directions at full deflection. It is the better
   * analogue of a stick, and it was thrown away when the controller went in.
   */
  private pointer: { x: number; y: number } | null = null;
  private steering = false;
  private mouseGrip = false;
  private mouseDash = false;
  /** How long the throne button has been held, and whether it already fired. */
  private crownHeld = 0;
  private crowned = false;
  private seed = 20260830;

  private sparks: Spark[] = [];
  private popups: Popup[] = [];
  private rings: Ring[] = [];
  /**
   * Tracer beads in the water around the etched features.
   *
   * NOT a decoration laid over the flow — they are advected by chip.flowAt,
   * the same call the game moves everything else with, so what they draw is
   * what will happen to you. This is also just what a microfluidics video looks
   * like: you cannot see a streaming field, you seed it with beads and watch.
   * They are the cheapest honest thing on the screen.
   */
  private tracers: Tracer[] = [];
  private flash = 0;
  private flashRed = false;
  private shake = 0;
  private t = 0;
  private best = 0;
  private deepest = 1;

  private seen = new Set<string>();
  private card: Lesson | null = null;
  private cardT = 0;
  /** Lessons waiting behind the one on screen. See `teach`. */
  private queued: Lesson[] = [];
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

    const world = (e: { clientX: number; clientY: number }) => {
      const r = this.canvas.getBoundingClientRect();
      return {
        sx: ((e.clientX - r.left) / r.width) * VIEW_W,
        sy: ((e.clientY - r.top) / r.height) * VIEW_H,
      };
    };

    // THROUGH THE CAMERA. The window is not the water any more, so a pointer
    // in view pixels is not a place — it has to be put back through the camera
    // or steering would aim at wherever that point USED to be before the view
    // scrolled, which is a fault that only appears once you have built enough
    // to open the map.
    this.canvas.addEventListener("pointermove", (e) => {
      const { sx, sy } = world(e);
      this.pointer = { x: mx(this.cam.x + sx), y: mx(this.cam.y + sy) };
      this.steering = true;
    });
    this.canvas.addEventListener("pointerleave", () => { this.steering = false; });

    this.canvas.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      wake();
      this.canvas.focus();
      if (this.screen === "title" || this.screen === "dead") { this.begin(); return; }
      if (this.screen === "birth") { enterWorld(this.run); this.screen = "play"; return; }

      const { sx, sy } = world(e);
      const slot = this.slotAt(sx, sy);
      if (slot >= 0) { this.selected = slot; this.spend(slot); return; }

      this.pointer = { x: mx(this.cam.x + sx), y: mx(this.cam.y + sy) };
      this.steering = true;
      if (e.button === 0) this.mouseGrip = true;
      if (e.button === 2) this.mouseDash = true;
      this.canvas.setPointerCapture(e.pointerId);
    });

    const up = (e: PointerEvent) => {
      if (e.button === 0) this.mouseGrip = false;
      if (e.button === 2) this.mouseDash = false;
    };
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    // THE THIRD DIMENSION, ON THE WHEEL. There is no swimming up: a trapped
    // body sits on a node, so the only way to another height is to drive the
    // channel at a different harmonic — which moves every plane in the fluid
    // and hands every body on one to whichever new plane is nearest.
    this.canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      if (this.screen !== "play" || this.paused) return;
      this.retune(e.deltaY > 0 ? -1 : 1);
    }, { passive: false });
  }

  /** Turn one frame of intent into everything that is not movement. */
  /**
   * Steer by pointing.
   *
   * The keys win when they are held, because somebody reaching for WASD means
   * it; otherwise the offset is the vector from your body to the pointer, its
   * magnitude growing over about a hundred and thirty microns so that pointing
   * just ahead of yourself is the slow, precise approach and pointing across
   * the arena is full deflection. That is the same shape as a stick, and it is
   * a truer one than eight directions at maximum.
   */
  private mouse(it: Intent): void {
    if (this.mouseGrip) it.grip = true;
    if (this.mouseDash && !this.wasMouseDash) it.dash = true;
    this.wasMouseDash = this.mouseDash;

    if (!this.steering || !this.pointer) return;
    if (it.move.x !== 0 || it.move.y !== 0) return;   // the keys mean it

    const dx = this.pointer.x - this.run.you.x;
    const dy = this.pointer.y - this.run.you.y;
    const r = Math.hypot(dx, dy);
    if (r < 6e-6) return;
    const m = Math.min(1, r / 130e-6);
    it.move = { x: (dx / r) * m, y: (dy / r) * m };
  }

  private wasMouseDash = false;

  private static readonly CROWN_HOLD = 0.9;

  private act(it: Intent, dt: number): void {
    const run = this.run;

    if (it.mute) this.sfx.muted = !this.sfx.muted;

    if (this.screen === "title" || this.screen === "dead") {
      // Chosen before a run and never during one, so it cannot be reached for
      // as a way out of a fight that is going badly.
      if (this.pad.tapped("KeyE")) { this.ebb = !this.ebb; return; }
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

    // TAKE IT BACK UP. Your trap holds bodies and a placed cell is a body, so
    // there was never a reason a mistake had to be permanent.
    if (it.lift) {
      const r = liftCell(run);
      if (r === "nothing-there") this.say("NOTHING OF YOURS WITHIN REACH");
      if (r === "wrong-phase") this.say("NOT NOW");
    }

    // TAP TO FEED, HOLD TO CROWN. Feeding used to be the building button,
    // told apart by where you happened to be standing, and the throne is at
    // the centre of the arena where people build: the first run to reach it fed
    // fifty-one cells by accident and woke something with three thousand eight
    // hundred hit points.
    // The d-pad, for a pad that works. Buttons 12 and 13 in the standard
    // mapping are up and down.
    if (it.depth !== 0) this.retune(it.depth);

    if (it.crownDown) {
      this.crownHeld += dt;
      if (this.crownHeld >= Game.CROWN_HOLD && !this.crowned) {
        this.crowned = true;
        this.doCrown();
      }
    } else {
      if (this.crownHeld > 0 && !this.crowned) this.doFeed();
      this.crownHeld = 0;
      this.crowned = false;
    }
  }

  private retune(step: number): void {
    const run = this.run;
    const want = run.world.mode + step;
    if (want < 1 || want > MAX_MODE) {
      this.say(want < 1 ? "THE FUNDAMENTAL IS AS FLAT AS IT GETS"
        : "THE PLANES WOULD BE CLOSER THAN THE BODIES ON THEM");
      return;
    }
    if (retuneChannel(run, want)) {
      this.sfx.invert(step > 0);
      this.say(`CHANNEL AT ${run.world.mode}f  ·  `
        + `${(modeFrequency(run.world.mode, run.world.medium) / 1e6).toFixed(2)} MHZ  ·  `
        + `${planes(run.world.mode).length} PLANES`);
    }
  }

  private doFeed(): void {
    const run = this.run;
    const r = feedThrone(run, this.selected);
    if (r === "off-throne") this.say("STAND ON THE THRONE TO FEED IT");
    if (r === "none") this.say("NOTHING IN HAND");
    if (r === "wrong-phase") this.say("IT IS ALREADY AWAKE");
    if (r === "fed") {
      const need = dischargesToKill(run);
      this.say(Number.isFinite(need)
        ? `FED ${run.throne.fed.length}  ·  ${run.throne.hm}  ·  ${need} DISCHARGES TO KILL`
        : `FED ${run.throne.fed.length}  ·  ${run.throne.hm}  ·  NOTHING CAN KILL IT YET`);
    }
  }

  private fit(): void {
    const s = Math.min(window.innerWidth / (VIEW_W + 40), window.innerHeight / (VIEW_H + 96));
    this.canvas.style.width = `${Math.floor(VIEW_W * s)}px`;
    this.canvas.style.height = `${Math.floor(VIEW_H * s)}px`;
  }

  /** Whether the water ebbs back as you spend your crystal. See `Run.ebb`. */
  private ebb = false;

  private begin(): void {
    this.paused = false;
    this.tally = {};
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    this.run = startRun(this.seed, this.ebb);
    this.screen = "play";
    this.sparks = []; this.popups = []; this.rings = [];
    this.say("GATHER FOUR OF A KIND TO MAKE A CELL");
  }

  private spend(i: number): void {
    const run = this.run;
    if (!run.cells[i]) return;
    const r = placeCell(run, i);
    if (r === "too-close") this.say("NOT THERE");
    if (r === "occupied") this.say("THAT SITE IS TAKEN");
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
    this.mouse(it);
    this.intent = it;

    // Pause first, and only where there is something to pause. A menu is
    // already stopped.
    if (it.pause && this.screen === "play") {
      this.paused = !this.paused;
      this.sfx.tick();
    }
    if (this.paused && this.screen === "play") return;

    this.act(it, dt);

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

    // HOW THE KING DIES, said the first time it is actually true.
    //
    // This used to fire on the `crown` event, which is the worst frame in the
    // game to explain anything: the screen flashes, the view shakes, a banner
    // announces the group, and two other lessons fire on the same tick. Told
    // there, "you aim the king" is a sentence about nothing. Told the moment
    // one of your own arms covers it, it is the answer to the question you are
    // already asking — and by then you can see the cone lit up.
    if (run.phase === "reign" && run.throne.awake && run.throne.hp > 0
      && run.structures.some((st) => bearsOn(st, run.throne.x, run.throne.y))) {
      this.teach("aim");
    }
    if (run.entities.some((e) => e.species === "mote"
      && Math.hypot(e.x - run.you.x, e.y - run.you.y) < 120e-6)) this.teach("mote");

    // The chip explains itself the first time it is doing something to you, and
    // the whirlpool waits until the water is actually beating you — told before
    // that, "let go" is a fact; told while you are losing ground, it is the
    // answer to the question you already have.
    const on = nearestFeature(CHIP, run.you.x, run.you.y);
    if (on) {
      const f = chipFlow(run, run.you.x, run.you.y);
      const u = Math.hypot(f.x, f.y);
      if (u > 6e-5) this.teach("chip");
      if (on.feature.kind === "cavity" && u > 2.6e-4) this.teach("whirl");
    }
  }

  private drain(): void {
    const run = this.run;
    for (const ev of run.events) {
      this.tally[ev.kind] = (this.tally[ev.kind] ?? 0) + 1;
      if (ev.kind === "hit") this.tally[`hit:${ev.cause}`] = (this.tally[`hit:${ev.cause}`] ?? 0) + 1;
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
          // One run reported six hundred and eight of these. The rule is worth
          // saying; saying it every second and a half is not teaching, it is
          // weather. The bodies still flash and shove each other apart — that
          // part is the field and it stays.
          if (this.t - this.lastRefusal > 2.5) {
            this.lastRefusal = this.t;
            this.popups.push({
              x: ev.x, y: ev.y, text: refusal(ev.text), life: 1.3,
              colour: "#ff9c6d", big: false,
            });
          }
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
          // AND SAY WHAT THAT WAS WORTH TO IT. A discharge that lands prints
          // -96 on the spot; eating a building printed nothing at all, so the
          // health it bought back was invisible and the bar just refilled. A
          // report came back having landed 96 and been healed 144, reading it
          // as "my hit did nothing".
          if (ev.heal > 0) {
            this.popups.push({
              x: this.run.throne.x, y: this.run.throne.y,
              text: `+${ev.heal}`, life: 1.2, colour: "140,230,255", big: false,
            });
          }
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
        case "wearing":
          this.teach("hand");
          this.burst(ev.x, ev.y, 2, "255,255,255");
          break;
        case "tuned":
          this.sfx.invert(ev.caught);
          this.say(ev.caught ? "THE GAP HAS IT - KEEP IT STANDING" : "YOU LOST IT");
          this.teach("bound");
          break;
        case "freed":
          this.flash = 1; this.flashRed = false;
          this.shake = 10;
          this.burst(ev.x, ev.y, 40, JADE);
          this.ring(ev.x, ev.y, 8, 300, 1.1, JADE);
          this.sfx.capture(6);
          this.say("IT IS OUT");
          break;
        case "lift":
          this.sfx.invert(false);
          this.burst(ev.x, ev.y, 8, JADE);
          this.say(`TOOK BACK A ${ev.group}`);
          break;
        case "step":
          this.teach("walk");
          this.sfx.tick();
          this.ring(ev.x, ev.y, 4, 26, 0.28, JADE);
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
    if (this.cardT > 0) {
      this.cardT -= dt;
      if (this.cardT <= 0) {
        const next = this.queued.shift();
        if (next) { this.card = next; this.cardT = CARD_TIME; this.sfx.lesson(); }
        else this.card = null;
      }
    }
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

  /**
   * Show a lesson, once, ever.
   *
   * IT QUEUES. It used to assign `this.card = l`, which clobbers — and three
   * lessons fire on the single frame a king is crowned. `aim` was set and
   * overwritten by `crown` on that same frame, and `seen` had already recorded
   * it, so the lesson explaining HOW THE FIGHT IS WON has never been displayed
   * to anybody in any run since it was written.
   *
   * A player asked, after three runs and a hundred and fourteen buildings,
   * "what is that big blue 23 circle anyway, what am I supposed to do to it".
   * The answer had been written, queued, and thrown away every time.
   */
  private teach(id: string): void {
    if (this.seen.has(id)) return;
    const l = LESSONS[id];
    if (!l) return;
    this.seen.add(id);
    if (this.card) { this.queued.push(l); return; }
    this.card = l; this.cardT = CARD_TIME;
    this.sfx.lesson();
  }

  // ── draw ──────────────────────────────────────────────────────────────────

  private draw(): void {
    const g = this.ctx;
    g.fillStyle = "#05070e";
    g.fillRect(0, 0, VIEW_W, VIEW_H);

    // Follow, clamped to the water. When the water is smaller than the window
    // it is centred instead, which is the game as it has always looked.
    const b = this.run.bounds;
    const want = {
      x: px(b.w) <= VIEW_W ? px(b.x) + (px(b.w) - VIEW_W) / 2
        : Math.max(px(b.x), Math.min(px(b.x + b.w) - VIEW_W, px(this.run.you.x) - VIEW_W / 2)),
      y: px(b.h) <= VIEW_H ? px(b.y) + (px(b.h) - VIEW_H) / 2
        : Math.max(px(b.y), Math.min(px(b.y + b.h) - VIEW_H, px(this.run.you.y) - VIEW_H / 2)),
    };
    this.cam.x += (want.x - this.cam.x) * 0.12;
    this.cam.y += (want.y - this.cam.y) * 0.12;

    g.save();
    if (this.shake > 0) {
      g.translate((Math.random() * 2 - 1) * this.shake, (Math.random() * 2 - 1) * this.shake);
    }
    g.translate(-Math.round(this.cam.x), -Math.round(this.cam.y));
    this.drawWalls();
    this.drawChip();
    this.drawField();
    this.drawLattice();
    this.drawSites();
    this.drawBodies();
    this.drawStructures();
    this.drawBound();
    this.drawThrone();
    this.drawTrails();
    this.drawEntities();
    this.drawSovereign();
    this.drawBolts();
    this.drawSparks();
    this.drawRings();
    this.drawYou();
    this.drawPopups();
    g.restore();

    g.fillStyle = this.vignette;
    g.fillRect(0, 0, VIEW_W, VIEW_H);

    if (this.screen === "title") this.drawTitle();
    else {
      this.drawThroneBearing();
      this.drawHud();
      if (this.screen === "birth") this.drawBirth();
      if (this.screen === "dead") this.drawDead();
      if (this.paused) this.drawPaused();
    }
    this.drawCard();

    if (this.flash > 0) {
      g.fillStyle = this.flashRed
        ? `rgba(255,60,90,${(this.flash * 0.42).toFixed(3)})`
        : `rgba(200,240,255,${(this.flash * 0.2).toFixed(3)})`;
      g.fillRect(0, 0, VIEW_W, VIEW_H);
    }
  }

  /** The glass. The water you can drive stops here, and it opens as you build. */
  private drawWalls(): void {
    const g = this.ctx;
    const run = this.run;
    const b = run.bounds;

    // THE STREAMS. A channel carries several fluids at once, side by side, not
    // mixing — laminar co-flow, which is how acoustofluidic separation is
    // actually done. Each band is tinted by what a body of YOUR density does in
    // it, because that is the only thing about it that matters: warm where you
    // ride antinodes, cool where you ride nodes.
    for (let i = 0; i < STREAMS; i++) {
      const { lo, hi } = streamBand(i, CHANNEL_H);
      const mine = contrastFactor(YOU, mediumAt(run.world.medium, (lo + hi) / 2, CHANNEL_H));
      g.fillStyle = `rgba(${warmth(mine)},0.045)`;
      g.fillRect(px(b.x), px(Math.max(lo, b.y)),
        px(b.w), px(Math.min(hi, b.y + b.h) - Math.max(lo, b.y)));
      if (lo > b.y && lo < b.y + b.h) {
        g.strokeStyle = "rgba(200,235,255,0.09)";
        g.lineWidth = 1;
        g.setLineDash([9, 7]);
        g.beginPath(); g.moveTo(px(b.x), px(lo)); g.lineTo(px(b.x + b.w), px(lo)); g.stroke();
        g.setLineDash([]);
      }
    }

    g.strokeStyle = "rgba(120,225,245,0.16)";
    g.lineWidth = 2;
    g.strokeRect(px(b.x), px(b.y), px(b.w), px(b.h));
  }

  /**
   * What is etched into the glass, and what the water is doing about it.
   *
   * THE ONLY THING ON SCREEN OLDER THAN THIS WORLD. Everything else is a
   * consequence of the last sovereign and will be gone after the next one; the
   * channel was etched once and is the same in the tenth aeon as the first. It
   * is drawn like that on purpose — cut out of the wall in the wall's own
   * colour, structural rather than lit, with no warm/cool contrast tint,
   * because a contrast factor is a thing a BODY has in a medium and glass is
   * not in the medium. Nothing here answers to your lattice.
   */
  private drawChip(): void {
    const g = this.ctx;
    const run = this.run;
    const b = run.bounds;
    const amp = run.wave.amplitude;
    const lit = Math.min(1, amp / run.wave.maxAmplitude);
    const standoff = CHANNEL_H * EDGE_STANDOFF_FRAC;

    // Only what is on screen, in world metres, with a plume's worth of margin.
    const near = (f: Feature): boolean =>
      px(f.x) > this.cam.x - px(f.reach) && px(f.x) < this.cam.x + VIEW_W + px(f.reach)
      && px(f.y) > this.cam.y - px(f.reach) && px(f.y) < this.cam.y + VIEW_H + px(f.reach);
    const shown = CHIP.filter(near);
    if (shown.length === 0) { this.tracers.length = 0; return; }

    // ── the geometry ────────────────────────────────────────────────────────
    for (const f of shown) {
      if (f.kind === "edge") {
        // A tip standing off the wall, leaning the way it is cut. The two base
        // corners sit on the wall it grew out of, so it reads as glass rather
        // than as something floating in the water.
        const wall = f.y < CHANNEL_H / 2 ? 0 : CHANNEL_H;
        const lean = f.jx * standoff * 0.45;
        g.beginPath();
        g.moveTo(px(f.x - standoff * 0.34 - lean), px(wall));
        g.lineTo(px(f.x), px(f.y));
        g.lineTo(px(f.x + standoff * 0.34 - lean), px(wall));
        g.closePath();
        g.fillStyle = "rgba(18,30,44,0.92)";
        g.fill();
        g.strokeStyle = `rgba(150,205,235,${(0.16 + lit * 0.24).toFixed(3)})`;
        g.lineWidth = 1.5;
        g.stroke();
      } else {
        // A dead-end side cavity with a bubble held at its mouth. The bubble is
        // what oscillates and it is the only part that brightens with the
        // drive, because it is the only part that is doing anything.
        const r = f.reach * 0.24;
        const inx = f.x === 0 ? 1 : f.x >= CHANNEL_W ? -1 : 0;
        const iny = f.y === 0 ? 1 : f.y >= CHANNEL_H ? -1 : 0;
        g.beginPath();
        g.arc(px(f.x), px(f.y), px(r * 1.35), 0, Math.PI * 2);
        g.fillStyle = "rgba(18,30,44,0.92)";
        g.fill();
        g.strokeStyle = `rgba(150,205,235,${(0.14 + lit * 0.2).toFixed(3)})`;
        g.lineWidth = 1.5;
        g.stroke();

        const bob = Math.sin(this.t * 7 + f.id) * lit * px(r) * 0.12;
        g.beginPath();
        g.arc(px(f.x) + inx * bob, px(f.y) + iny * bob,
          px(r) * (1 + lit * 0.1), 0, Math.PI * 2);
        g.fillStyle = `rgba(200,240,255,${(0.05 + lit * 0.16).toFixed(3)})`;
        g.fill();
        g.strokeStyle = `rgba(200,240,255,${(0.2 + lit * 0.45).toFixed(3)})`;
        g.lineWidth = 1;
        g.stroke();
      }
    }

    // ── and the water ───────────────────────────────────────────────────────
    //
    // Seeded in the plumes and carried by the same flowAt the game uses. A bead
    // that leaves the water you can work in is retired, because a streak drawn
    // outside the glass is a promise the game will not keep.
    const want = Math.min(220, shown.length * 26);
    let guard = 0;
    while (this.tracers.length < want && guard++ < 40) {
      const f = shown[(Math.random() * shown.length) | 0];
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * f.reach;
      this.tracers.push({
        x: f.x + Math.cos(a) * r, y: f.y + Math.sin(a) * r,
        px: 0, py: 0, life: 0.6 + Math.random() * 2.2, f,
      });
    }

    const dt = 1 / 60;
    g.lineCap = "round";
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      const v = flowAt(CHIP, t.x, t.y, amp);
      t.px = t.x; t.py = t.y;
      t.x += v.x * dt;
      t.y += v.y * dt;
      t.life -= dt;

      const speed = Math.hypot(v.x, v.y);
      const gone = t.life <= 0 || speed < 2e-6
        || t.x < b.x || t.x > b.x + b.w || t.y < b.y || t.y > b.y + b.h;
      if (gone) { this.tracers.splice(i, 1); continue; }

      // Brightness is speed, so the picture IS the flow field: the fast water
      // off a tip and the fast ring inside a cavity light up and the still core
      // of the vortex stays dark. Nothing had to be authored to make the shape
      // of it legible.
      const k = Math.min(1, speed / 4.2e-4);
      const fade = Math.min(1, t.life * 1.6);
      g.strokeStyle = `rgba(150,225,255,${(0.06 + k * 0.4 * fade).toFixed(3)})`;
      g.lineWidth = 0.6 + k * 1.1;
      g.beginPath();
      g.moveTo(px(t.px), px(t.py));
      g.lineTo(px(t.x), px(t.y));
      g.stroke();
    }
    g.lineCap = "butt";
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
      const u = mx(this.cam.x + ((i + 0.5) / WASH_W) * VIEW_W);
      this.cosX[i] = Math.cos(k * u + phx);
      const d = u - w.aimX;
      this.envX[i] = Math.exp(-(d * d) / f2);
    }
    for (let j = 0; j < WASH_H; j++) {
      const u = mx(this.cam.y + ((j + 0.5) / WASH_H) * VIEW_H);
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
    // Sampled in WINDOW coordinates, so it is laid down where the window is —
    // the canvas is translated by the camera and the wash must not be.
    g.drawImage(this.washCanvas, Math.round(this.cam.x), Math.round(this.cam.y), VIEW_W, VIEW_H);

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
  /**
   * The spacing you have, drawn as spacing.
   *
   * The objective is a band gap and the lever is a distance, and for a while
   * the only thing on screen was the frequency. You cannot act on megaradians
   * per second. You can act on a line between two buildings that is the wrong
   * length, and on a ring that says put the next one here — and both of those
   * are pictures rather than numbers.
   */
  private drawLattice(): void {
    const run = this.run;
    const band = run.spacing;
    if (!band || run.bound.free || run.structures.length === 0) return;
    const g = this.ctx;

    // Every nearest-neighbour link, coloured by whether it is the right length.
    for (const a of run.structures) {
      let near: typeof a | null = null;
      let best = Infinity;
      for (const b of run.structures) {
        if (b === a) continue;
        const d = Math.hypot(b.x - a.x, b.y - a.y);
        if (d < best) { best = d; near = b; }
      }
      if (!near) continue;
      const right = best >= band.lo && best <= band.hi;
      g.strokeStyle = right ? `rgba(${JADE},0.5)` : "rgba(255,140,90,0.28)";
      g.lineWidth = right ? 1.6 : 1;
      g.setLineDash(right ? [] : [3, 4]);
      g.beginPath();
      g.moveTo(px(a.x), px(a.y));
      g.lineTo(px(near.x), px(near.y));
      g.stroke();
      g.setLineDash([]);
    }

    // And where the next one belongs: an annulus about whichever building you
    // are standing nearest, at the spacing this water needs.
    let host = run.structures[0];
    let hostD = Infinity;
    for (const s of run.structures) {
      const d = Math.hypot(s.x - run.you.x, s.y - run.you.y);
      if (d < hostD) { hostD = d; host = s; }
    }
    const hx = px(host.x), hy = px(host.y);
    g.strokeStyle = "rgba(255,201,74,0.30)";
    g.lineWidth = 1;
    g.setLineDash([5, 6]);
    for (const r of [band.lo, band.hi]) {
      g.beginPath(); g.arc(hx, hy, px(r), 0, Math.PI * 2); g.stroke();
    }
    g.setLineDash([]);
    g.fillStyle = "rgba(255,201,74,0.5)";
    g.font = `600 8px ${MONO}`;
    g.textAlign = "center";
    g.fillText("PUT THE NEXT ONE HERE", hx, hy - px(band.hi) - 5);
    g.textAlign = "left";
  }

  /**
   * The lattice, and the thing you are making on it.
   *
   * A crystal is a lattice plus a motif, so the lattice is drawn: faint sites
   * around you, and a bright one where the next cell will actually land. It
   * used to go down wherever you were standing, which is why what people built
   * was a heap.
   */
  private drawSites(): void {
    const run = this.run;
    if (run.cells.length === 0 || run.phase === "dead") return;
    const g = this.ctx;
    const pitch = latticePitch(run);
    const p = px(pitch);
    const here = snap(run.you.x, run.you.y, pitch);

    g.fillStyle = "rgba(120,225,245,0.13)";
    for (let i = -2; i <= 2; i++) {
      for (let j = -2; j <= 2; j++) {
        const sx = px(here.x + i * pitch), sy = px(here.y + j * pitch);
        if (sx < 0 || sy < 0 || sx > VIEW_W || sy > VIEW_H) continue;
        g.beginPath(); g.arc(sx, sy, 1.6, 0, Math.PI * 2); g.fill();
      }
    }

    // where it lands
    const taken = run.structures.some(
      (s) => Math.hypot(s.x - here.x, s.y - here.y) < pitch * 0.5);
    const hx = px(here.x), hy = px(here.y);
    g.strokeStyle = taken ? "rgba(255,80,110,0.6)" : `rgba(${JADE},0.75)`;
    g.lineWidth = 1.4;
    g.setLineDash([4, 4]);
    g.beginPath(); g.arc(hx, hy, p * 0.34, 0, Math.PI * 2); g.stroke();
    g.setLineDash([]);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as Array<[number, number]>) {
      g.beginPath();
      g.moveTo(hx + dx * p * 0.34, hy + dy * p * 0.34);
      g.lineTo(hx + dx * p * 0.44, hy + dy * p * 0.44);
      g.stroke();
    }
  }

  /**
   * A body: the cells that are joined, drawn as one thing.
   *
   * Two passes of the same path — a wide soft stroke that makes the silhouette
   * and a thin bright one that edges it — so adjacent cells read as connected
   * tissue rather than as separate objects that happen to be near each other.
   */
  private drawBodies(): void {
    const run = this.run;
    if (run.bodies.length === 0) return;
    const g = this.ctx;
    const pitch = latticePitch(run);
    const near = pitch * 1.5;

    for (const body of run.bodies) {
      if (body.cells.length < 2) continue;
      const live = autonomous(body);

      const path = new Path2D();
      for (const a of body.cells) {
        path.addPath(new Path2D(`M ${px(a.x)} ${px(a.y)} l 0.01 0`));
        for (const b of body.cells) {
          if (b === a) continue;
          if (Math.hypot(b.x - a.x, b.y - a.y) > near) continue;
          const seg = new Path2D();
          seg.moveTo(px(a.x), px(a.y));
          seg.lineTo(px(b.x), px(b.y));
          path.addPath(seg);
        }
      }

      g.lineCap = "round";
      g.lineJoin = "round";
      g.strokeStyle = live ? `rgba(${JADE},0.16)` : "rgba(120,225,245,0.09)";
      g.lineWidth = px(pitch) * 0.62;
      g.stroke(path);
      g.strokeStyle = live ? `rgba(${JADE},0.5)` : "rgba(120,225,245,0.26)";
      g.lineWidth = 1.6;
      g.stroke(path);
      g.lineCap = "butt";

      // Its limbs, which are the parts of it that are shaped rather than
      // filled in. A leg is drawn as what it is: a column going somewhere you
      // are not, so it is dashed and it is labelled with the plane it lands on.
      for (const limb of limbsOf(body, pitch)) {
        const tip = limb.cells[0];
        const tx = px(tip.x), ty = px(tip.y);
        if (limb.leg) {
          g.strokeStyle = "rgba(255,201,74,0.55)";
          g.lineWidth = 2;
          g.setLineDash([3, 3]);
          g.beginPath();
          g.moveTo(tx, ty);
          g.lineTo(tx, ty + (limb.layers[0] < tip.layer ? 12 : -12));
          g.stroke();
          g.setLineDash([]);
          g.fillStyle = "rgba(255,201,74,0.8)";
          g.font = `700 8px ${MONO}`;
          g.textAlign = "center";
          g.fillText(`${limb.layers.join("/")}`, tx, ty + 22);
          g.textAlign = "left";
        } else {
          g.fillStyle = `rgba(${JADE},0.55)`;
          g.beginPath();
          g.arc(tx + limb.dir[0] * 7, ty + limb.dir[1] * 7, 2.2, 0, Math.PI * 2);
          g.fill();
        }
      }

      // What it is, in the vocabulary the rest of the repository speaks.
      const sym = symbolOf(body);
      const run = this.run;
      if (sym) {
        g.textAlign = "center";
        g.font = `700 11px ${MONO}`;
        g.fillStyle = live ? `rgb(${JADE})` : "rgba(160,220,240,0.7)";
        g.fillText(sym.symbol, px(body.x), px(body.y - body.extent) - 16);
        g.font = `600 8px ${MONO}`;
        g.fillStyle = FAINT;
        const limbs = limbsOf(body, pitch);
        const legs = limbs.filter((l) => l.leg).length;
        g.fillText(
          `${sym.pointGroup}  ·  ${body.cells.length} CELLS`
          + `${limbs.length ? `  ·  ${limbs.length - legs} LIMBS` : ""}`
          + `${legs ? `  ·  ${legs} LEGS` : ""}`
          + `${live ? `  ·  ${walkSpeed(body, run.wave) > 0 ? "WALKING" : "IT WORKS ALONE"}` : ""}`,
          px(body.x), px(body.y - body.extent) - 5);
        g.textAlign = "left";
      }
    }
  }

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
          // ONLY FOUR OF EIGHTY-ONE BUILDINGS BEAR ON THE KING AT ONCE, measured,
          // and at 44% of the places it can stand none of them do. A ring around
          // one building in a crystal of eighty is not findable, so the ones that
          // can actually hit it are joined to it by a line.
          g.strokeStyle = `rgba(${rgb},${(0.18 + 0.22 * Math.sin(this.t * 5)).toFixed(2)})`;
          g.lineWidth = 1;
          g.setLineDash([2, 4]);
          g.beginPath(); g.moveTo(x, y); g.lineTo(px(k.x), px(k.y)); g.stroke();
          g.setLineDash([]);
        }
      }

      g.strokeStyle = `rgba(${rgb},${(a * 0.28).toFixed(3)})`;
      g.lineWidth = 1;
      g.beginPath(); g.arc(x, y, R, 0, Math.PI * 2); g.stroke();

      g.strokeStyle = `rgba(${rgb},${(a * 0.6).toFixed(3)})`;
      g.lineWidth = 1.4;
      // WHAT EACH ARM ACTUALLY CATCHES. The tip is where the building holds,
      // and it holds everything inside HOLD_CATCH of it — which is twenty
      // microns, not the two-pixel dot this used to be. It is the same fault
      // the cones above were drawn to fix, in the other direction.
      //
      // It became worth drawing when the chip did. A cavity gathers the water
      // into a point; a building holds on a ring; so building AT a cavity is
      // the act of landing one of these on that point, and a player cannot aim
      // at something they cannot see.
      for (const [dx, dy] of s.lobes) {
        g.beginPath();
        g.moveTo(x + dx * 6, y + dy * 6);
        g.lineTo(x + dx * R, y + dy * R);
        g.stroke();
        const cr = R * HOLD_CATCH;
        const catchment = g.createRadialGradient(
          x + dx * R, y + dy * R, 0, x + dx * R, y + dy * R, cr);
        catchment.addColorStop(0, `rgba(${rgb},${(a * 0.16).toFixed(3)})`);
        catchment.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = catchment;
        g.beginPath(); g.arc(x + dx * R, y + dy * R, cr, 0, Math.PI * 2); g.fill();
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
        const loaded = s.charge >= 1;
        // LOADED AND WAITING. A full charge no longer fires into empty water —
        // it holds until the king is in the arm — so the surface has to say
        // that, or a player stands there gripping a building that looks broken.
        g.strokeStyle = loaded
          ? `rgba(140,233,255,${(0.55 + 0.45 * Math.sin(this.t * 9)).toFixed(2)})`
          : `rgba(255,201,74,${(0.4 + s.charge * 0.6).toFixed(2)})`;
        g.lineWidth = loaded ? 4 : 3;
        g.beginPath();
        g.arc(x, y, 10, -Math.PI / 2, -Math.PI / 2 + s.charge * Math.PI * 2);
        g.stroke();
        if (loaded && fighting && !bearsOn(s, k.x, k.y)) {
          g.fillStyle = "rgba(140,233,255,0.8)";
          g.font = `700 8px ${MONO}`;
          g.textAlign = "center";
          g.fillText("LOADED - WALK IT IN", x, y - R - 8);
          g.textAlign = "left";
        }
      }
    }
  }

  /**
   * The other field: a mode this world's lattice will not carry.
   *
   * Drawn as what it is — a standing thing that cannot go anywhere. It has no
   * body and no position it chose; it is a frequency, so it is drawn as rings
   * at that frequency, and they beat faster the nearer your crystal is to
   * catching it.
   */
  private drawBound(): void {
    const run = this.run;
    const b = run.bound;
    if (b.free) return;
    const g = this.ctx;
    const x = px(b.x), y = px(b.y);
    const near = 1 - detune(run.gap, b.omega);
    const caught = catches(run.gap, b.omega);
    const rgb = caught ? "160,255,214" : "190,170,255";

    for (let i = 0; i < 4; i++) {
      const phase = (this.t * (1.1 + near * 3.4) + i * 0.25) % 1;
      g.strokeStyle = `rgba(${rgb},${((1 - phase) * (0.16 + near * 0.4)).toFixed(3)})`;
      g.lineWidth = 1.4;
      g.beginPath(); g.arc(x, y, 8 + phase * 34, 0, Math.PI * 2); g.stroke();
    }
    g.fillStyle = `rgba(${rgb},0.9)`;
    g.beginPath(); g.arc(x, y, 4.5, 0, Math.PI * 2); g.fill();

    if (caught) {
      const f = Math.min(1, b.held / RELEASE_TIME);
      g.strokeStyle = `rgb(${rgb})`;
      g.lineWidth = 3;
      g.beginPath(); g.arc(x, y, 15, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2); g.stroke();
    }
    g.fillStyle = `rgba(${rgb},0.75)`;
    g.font = `700 8px ${MONO}`;
    g.textAlign = "center";
    g.fillText(`${(b.omega / 2 / Math.PI / 1e6).toFixed(2)} MHz`, x, y + 26);
    g.textAlign = "left";
  }

  /**
   * The objective, as the only thing that decides it.
   *
   * A band of forbidden frequencies and a marker where the trapped mode sits.
   * Everything the player does to the world moves this bar, and it is the same
   * number the release is computed from — so there is no version of this where
   * the picture flatters what is happening.
   */
  private drawObjective(): void {
    const run = this.run;
    const b = run.bound;
    const g = this.ctx;
    const x = 18, y = 62, w = 232, h = 11;

    g.font = `600 9px ${MONO}`;
    g.fillStyle = DIM;
    g.fillText(b.free ? "IT IS OUT" : "HOW FAR APART TO BUILD", x, y - 12);

    // A RULER IN MICRONS, not a band diagram in megaradians. The lever is a
    // distance, so the picture is a distance.
    const SPAN = 240e-6;
    const at = (m: number) => x + Math.max(0, Math.min(1, m / SPAN)) * w;

    g.fillStyle = "rgba(10,18,28,0.85)";
    g.fillRect(x, y, w, h);

    if (run.spacing) {
      const lo = at(run.spacing.lo), hi = at(run.spacing.hi);
      g.fillStyle = `rgba(${JADE},0.45)`;
      g.fillRect(lo, y, Math.max(3, hi - lo), h);
    }

    if (run.crystal) {
      const inBand = run.spacing
        && run.crystal.a >= run.spacing.lo && run.crystal.a <= run.spacing.hi;
      const m = at(run.crystal.a);
      g.strokeStyle = inBand ? "#eaffff" : "#ff8c5a";
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(m, y - 4); g.lineTo(m, y + h + 4); g.stroke();
      g.fillStyle = inBand ? "#eaffff" : "#ff8c5a";
      g.font = `700 9px ${MONO}`;
      g.textAlign = "center";
      g.fillText(`${(run.crystal.a * 1e6).toFixed(0)}`, m, y - 6);
      g.textAlign = "left";
    }

    g.strokeStyle = "rgba(120,225,245,0.3)";
    g.lineWidth = 1;
    g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

    g.font = `600 8px ${MONO}`;
    g.fillStyle = FAINT;
    if (run.spacing) {
      g.fillText(`${(run.spacing.lo * 1e6).toFixed(0)}`, at(run.spacing.lo) - 6, y + h + 8);
      g.fillText(`${(run.spacing.hi * 1e6).toFixed(0)} UM`, at(run.spacing.hi) - 4, y + h + 8);
    }

    g.font = `700 9px ${MONO}`;
    g.fillStyle = b.free ? `rgb(${JADE})` : `rgb(${NODE})`;
    g.fillText(
      b.free ? "FREED - IT GOES WITH YOU" : advice(run.crystal, run.gap, b.omega),
      x, y + h + 20);
  }

  /**
   * WHICH WAY THE THRONE IS, when it is not on the screen.
   *
   * There was never a need for one. The throne stood at the exact centre of the
   * channel in every aeon and the pool you started in was one screen wide, so
   * it was always either in front of you or a short walk. It stands at a
   * landmark now, which from the far wall is two millimetres and three screens
   * away.
   *
   * There is a report in this file already — see the hint line below — about a
   * player who placed twenty-six buildings, fed nothing, and never visited a
   * throne that was in plain sight the whole time. Moving it further away
   * without saying which way it went would be making that exact report worse,
   * on purpose, which is worse than not having moved it.
   *
   * It NAMES the landmark rather than only pointing at it. The chip is the one
   * thing in this game that is the same in the tenth aeon as in the first, so
   * "A BUBBLE CAVITY - 1.4 MM" is a direction a player can learn once and use
   * for the rest of the run. An arrow is only ever good for this trip.
   */
  private drawThroneBearing(): void {
    const run = this.run;
    if (run.phase === "birth" || run.phase === "dead") return;
    const k = run.throne;
    const sx = px(k.x) - this.cam.x;
    const sy = px(k.y) - this.cam.y;
    const inset = 34;
    if (sx > inset && sx < VIEW_W - inset && sy > inset && sy < VIEW_H - inset) return;

    const g = this.ctx;
    const cx = VIEW_W / 2, cy = VIEW_H / 2;
    const a = Math.atan2(sy - cy, sx - cx);
    // Run out from the middle along the bearing until it meets the inset frame,
    // so the marker sits on the edge nearest the thing it is pointing at.
    const d = Math.min(
      Math.abs((VIEW_W / 2 - inset) / Math.cos(a)),
      Math.abs((VIEW_H / 2 - inset) / Math.sin(a)),
    );
    const mx = cx + Math.cos(a) * d, my = cy + Math.sin(a) * d;

    const awake = k.awake && k.hp > 0;
    const rgb = awake ? "255,90,90" : "255,201,74";
    const pulse = 0.55 + 0.45 * Math.sin(this.t * (awake ? 6 : 2.4));

    g.save();
    g.translate(mx, my);
    g.rotate(a);
    g.fillStyle = `rgba(${rgb},${pulse.toFixed(2)})`;
    g.beginPath();
    g.moveTo(11, 0); g.lineTo(-5, -7); g.lineTo(-5, 7);
    g.closePath();
    g.fill();
    g.restore();

    const r = Math.hypot(k.x - run.you.x, k.y - run.you.y);
    const near = nearestFeature(CHIP, k.x, k.y);
    const far = r >= 1e-3 ? `${(r * 1e3).toFixed(1)} MM` : `${(r * 1e6).toFixed(0)} UM`;
    g.font = `700 9px ${MONO}`;
    g.textAlign = "center";
    g.fillStyle = `rgba(${rgb},${(0.5 + pulse * 0.35).toFixed(2)})`;
    g.fillText(
      `${awake ? "THE KING" : "THE THRONE"}  ·  ${far}`
      + `${near ? `  ·  ${featureName(near.feature)}` : ""}`,
      Math.min(Math.max(cx + Math.cos(a) * (d - 22), 96), VIEW_W - 96),
      Math.min(Math.max(cy + Math.sin(a) * (d - 22), 16), VIEW_H - 10),
    );
    g.textAlign = "left";
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

    // WHAT YOU ARE MAKING, IN THE TERMS THAT DECIDE THE FIGHT. A player fed it
    // fifty-one cells and woke three thousand eight hundred hit points, which
    // no arsenal in the game could bring down — and every number on screen up
    // to that moment was a count of what they had given it, not a statement of
    // what it would take to kill.
    if (run.throne.fed.length > 0) {
      const need = dischargesToKill(run);
      const beyond = !Number.isFinite(need) || need > run.structures.length + run.cells.length;
      g.font = `700 9px ${MONO}`;
      g.fillStyle = beyond ? RED : GOLD;
      g.fillText(
        `FED ${run.throne.fed.length}  ·  ${run.throne.maxHp} HP  ·  `
        + `${Number.isFinite(need) ? `${need} DISCHARGES` : "NOTHING CAN KILL IT"}`,
        x, y - R - 26);
      if (beyond) {
        g.fillStyle = RED;
        g.font = `600 8px ${MONO}`;
        g.fillText(`YOU HAVE ${run.structures.length + run.cells.length}`, x, y - R - 37);
      }
    }

    // The hold that wakes it, drawn while it is being made.
    if (this.crownHeld > 0) {
      const f = Math.min(1, this.crownHeld / Game.CROWN_HOLD);
      g.strokeStyle = `rgba(255,201,74,${(0.4 + f * 0.6).toFixed(2)})`;
      g.lineWidth = 3;
      g.beginPath();
      g.arc(x, y, R + 8, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2);
      g.stroke();
      g.fillStyle = GOLD;
      g.font = `700 9px ${MONO}`;
      g.fillText(f >= 1 ? "AWAKE" : "HOLD TO CROWN", x, y + R + 16);
    }
    g.textAlign = "left";
  }

  /**
   * Is this near enough to the view to be worth drawing?
   *
   * This was not needed while the whole population lived in the starting pool,
   * which was one screen. The water now carries its real concentration over the
   * whole channel — six hundred-odd motifs instead of thirty — and only about a
   * fourteenth of them are ever on screen. Trails are the reason it matters:
   * each one is eight separate strokes, so an unculled frame asked the canvas
   * for five thousand paths to show a few dozen.
   *
   * The margin covers a trail's own length. A trail is nine points of motion
   * and nothing here moves faster than a jet, so tens of pixels is generous.
   */
  private onCamera(x: number, y: number, margin = 48): boolean {
    const sx = px(x) - this.cam.x;
    const sy = px(y) - this.cam.y;
    return sx > -margin && sx < VIEW_W + margin
      && sy > -margin && sy < VIEW_H + margin;
  }

  private drawTrails(): void {
    const g = this.ctx;
    g.lineCap = "round";
    for (const e of this.run.entities) {
      if (!this.onCamera(e.x, e.y)) continue;
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
    const here = this.run.layer;
    for (const e of this.run.entities) {
      if (!this.onCamera(e.x, e.y)) continue;
      const p = particleOf(e);
      const x = px(e.x), y = px(e.y);
      const rgb = warmth(contrastFactor(p, waterAt(this.run, e.y)));

      // ANOTHER PLANE IS ANOTHER PLACE. Tens of microns of water in z, which is
      // further than anything here can reach, so it is drawn as something seen
      // through the fluid rather than something you are standing next to.
      if (!together(e.layer, here)) {
        const d = Math.abs(e.layer - here);
        g.globalAlpha = Math.max(0.1, 0.3 - d * 0.07);
        g.fillStyle = `rgb(${rgb})`;
        g.beginPath();
        g.arc(x, y, Math.max(1.6, px(p.radius) * 0.55), 0, Math.PI * 2);
        g.fill();
        g.globalAlpha = 1;
        continue;
      }

      const r = Math.max(2.4, px(p.radius));
      const hot = e.held > 0 || e.flash > 0;

      const rad = r * (hot ? 5.5 : 3.4);
      const glow = g.createRadialGradient(x, y, 0, x, y, rad);
      glow.addColorStop(0, `rgba(${rgb},${hot ? 0.42 : 0.16})`);
      glow.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = glow;
      g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();

      if (e.faction === "motif") {
        drawMotif(g, x, y, r, e.parts[e.parts.length - 1], rgb, e.spin);
      } else {
        g.fillStyle = `rgb(${rgb})`;
        g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
        g.fillStyle = "rgba(255,255,255,0.45)";
        g.beginPath(); g.arc(x - r * 0.3, y - r * 0.3, r * 0.3, 0, Math.PI * 2); g.fill();
      }

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
        // WHAT IT IS BECOMING, ON THE THING ITSELF. A cluster used to carry a
        // row of gold pips counting its mass, which says how far along it is
        // and nothing about what it is going to be — so there was no moment
        // where you could decide to go and find the one part it still needs.
        const asm = assemble(e.parts);
        const label = asm.group
          ? `${asm.group} ${asm.mass}/${SEED_MASS}`
          : asm.partial ? `? ${asm.mass}/${SEED_MASS}` : "WILL NOT BIND";
        g.font = `700 9px ${MONO}`;
        g.textAlign = "center";
        g.fillStyle = asm.group ? GOLD : asm.partial ? DIM : RED;
        g.fillText(label, x, y - r - 11);
        g.textAlign = "left";

        // and the parts it is made of, so you can see what it still wants
        e.parts.slice(0, 4).forEach((id, i) => {
          const th = (i / 4) * Math.PI * 2 - Math.PI / 2;
          drawMotif(g, x + Math.cos(th) * (r + 6), y + Math.sin(th) * (r + 6),
            2.6, id, rgb, e.spin);
        });
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

    // Your bare hand on it. The same condition the damage is applied under, so
    // what is drawn is never a flattering account of what is happening.
    if (wearing(this.run)) {
      const beat = 0.6 + 0.4 * Math.sin(this.t * 22);
      g.strokeStyle = `rgba(255,255,255,${(0.3 * beat).toFixed(3)})`;
      g.lineWidth = 3;
      g.beginPath(); g.arc(x, y, r + 4, 0, Math.PI * 2); g.stroke();
      g.fillStyle = `rgba(255,255,255,${(0.5 * beat).toFixed(2)})`;
      g.font = `700 8px ${MONO}`;
      g.textAlign = "center";
      g.fillText("YOUR HAND IS ON IT", x, y + r + 16);
      g.textAlign = "left";
    }

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

    // WHAT WOULD ACTUALLY MOVE THAT BAR. `drawThrone` prints "N DISCHARGES TO
    // KILL" while you are feeding it and then returns early the moment it wakes
    // — so the one actionable number in the game vanished at exactly the point
    // it became actionable. A report came back with 306 buildings standing, a
    // king at 150/150, and not one discharge event in the whole run: that fight
    // needed TWO of them, and was instead fought by hand for nine minutes
    // against a thing that heals 0.9 hp/s off the buildings it eats.
    const need = dischargesToKill(this.run);
    const bearing = this.run.structures.filter((st) => bearsOn(st, k.x, k.y)).length;
    g.font = `700 9px ${MONO}`;
    g.textAlign = "center";
    g.fillStyle = bearing > 0 ? "#8ce9ff" : "rgba(255,255,255,0.45)";
    g.fillText(
      Number.isFinite(need)
        ? `${need} DISCHARGE${need === 1 ? "" : "S"} TO KILL`
        : "NOTHING YOU OWN CAN KILL IT",
      x, y - r - 30);
    g.fillStyle = bearing > 0 ? "#8ce9ff" : "#ff5a5a";
    g.font = `700 8px ${MONO}`;
    g.fillText(
      bearing > 0
        ? `${bearing} OF YOUR BUILDINGS BEAR ON IT  ·  ${GLYPH.keys.grip} ONE TO FIRE IT`
        : "NOTHING YOU OWN IS AIMED AT IT  ·  MOVE THE KING INTO AN ARM",
      x, y - r - 41);
    g.textAlign = "left";
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
    g.fillText(
      `${run.phase === "reign" ? "IT IS AWAKE" : "SETTLING"}  ·  ${streamName(streamOf(run.you.y))}`,
      VIEW_W / 2, 34);

    // WHERE ON THE CHIP YOU ARE, when you are anywhere on it. The channel is
    // the one thing that is the same in every aeon, so it is the only thing
    // here that can be a landmark — and a landmark you are not told the name of
    // is scenery. It says how fast the water is going too, because that is the
    // number the decision turns on: released it is walkable and gripping it is
    // not, and the player has to be able to see which one they are in.
    const here = nearestFeature(CHIP, run.you.x, run.you.y);
    if (here) {
      const f = chipFlow(run, run.you.x, run.you.y);
      const u = Math.hypot(f.x, f.y);
      g.fillStyle = u > 2.4e-4 ? GOLD : DIM;
      g.font = `700 9px ${MONO}`;
      g.fillText(`${featureName(here.feature)}  ·  ${(u * 1e6).toFixed(0)} UM/S`,
        VIEW_W / 2, 48);
    }
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
    this.drawChannel();
    this.drawObjective();
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
    // What to do next, and never more than one thing.
    // NOT the spacing advice — that has its own panel, and while it lived here
    // too it crowded out every other thing a player might do next. One report
    // came back with twenty-six buildings placed, nothing fed, and a throne that
    // had never been visited.
    // WHEN THE WATER IS SPENT, SAY SO. Arrivals are the co-flow's rate now, so a
    // world that has been gathered out stays gathered out — and a player with a
    // rack full of cells and an empty throne was previously told, forever, how
    // to build another one.
    const spent = run.delivered >= suspension(run)
      && run.entities.filter((e) => e.faction === "motif").length < suspension(run) * 0.4;
    const hint = run.phase === "reign"
      ? `${G.grip} ON YOUR OWN BUILDINGS TO DISCHARGE THEM   ·   ${G.dash} TO BURST CLEAR`
      : run.throne.fed.length === 0 && spent
        ? `THIS WATER IS GATHERED OUT   ·   ${G.crown} ON THE THRONE FEEDS IT   ·   `
          + "A NEW WORLD IS THE ONLY NEW WATER"
      : run.cells.length > 0
        ? `${G.place} BUILDS ON THE RING   ·   ${G.crown} ON THE THRONE FEEDS IT INSTEAD`
        : run.throne.fed.length > 0
          ? `HOLD ${G.crown} TO WAKE IT   ·   TAP IT ON THE THRONE TO FEED MORE`
          : `${G.dash} THROUGH THE DRIFTERS TO GATHER THEM   ·   FOUR MAKES A CELL`;
    g.fillText(hint, VIEW_W / 2, VIEW_H - 16);
    g.textAlign = "left";
  }

  /** The cell rack. Structure and freedom are shown side by side because
   *  Neumann's principle puts them in tension and the rack is where you feel it. */
  /**
   * The channel, side on.
   *
   * Which harmonic it is being driven at, where the node planes are, and which
   * one is holding you up. The walls are drawn because they are the reason the
   * planes are where they are: a hard wall is a pressure antinode, so the nodes
   * fall strictly between them and nothing ever stands on one.
   */
  private drawChannel(): void {
    const run = this.run;
    const g = this.ctx;
    const mode = run.world.mode;
    const x = VIEW_W - 34, y = 74, h = 92;

    g.fillStyle = "rgba(10,18,28,0.8)";
    g.fillRect(x - 12, y - 8, 30, h + 20);
    g.strokeStyle = "rgba(120,225,245,0.25)";
    g.lineWidth = 1;
    for (const wy of [y, y + h]) {                 // the walls
      g.beginPath(); g.moveTo(x - 9, wy); g.lineTo(x + 15, wy); g.stroke();
    }

    planes(mode).forEach((z, i) => {
      const py = y + h * (1 - z / CHANNEL_HEIGHT);
      const on = i === run.layer;
      g.strokeStyle = on ? `rgb(${JADE})` : "rgba(120,225,245,0.3)";
      g.lineWidth = on ? 2 : 1;
      g.beginPath(); g.moveTo(x - 7, py); g.lineTo(x + 13, py); g.stroke();
      if (on) {
        g.fillStyle = `rgb(${JADE})`;
        g.beginPath(); g.arc(x + 3, py, 2.6, 0, Math.PI * 2); g.fill();
      }
    });

    g.textAlign = "center";
    g.font = `700 9px ${MONO}`;
    g.fillStyle = DIM;
    g.fillText(`${mode}f`, x + 3, y - 12);
    g.font = `600 7px ${MONO}`;
    g.fillStyle = FAINT;
    g.fillText(`${(modeFrequency(mode, run.world.medium) / 1e6).toFixed(1)}`, x + 3, y + h + 10);
    g.textAlign = "left";
  }

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

    // WHAT IT COULD STILL BECOME. Three dimers are one girdle from a 222, one
    // diagonal from a cubic 23, and one dimer from a plain 2 — three futures,
    // and until this line existed the game showed you a count and left you to
    // find that out by accident.
    if (near.faction === "motif") {
      const opts = optionsFor(near.parts, run.world.pool);
      if (opts.length > 0) {
        g.font = `600 8px ${MONO}`;
        g.fillStyle = GOLD;
        g.fillText(
          opts.map((o) => (o.needs ? `+${motif(o.needs).label[0]}->${o.group}` : `x4->${o.group}`))
            .join("  "),
          x + 9, y + 69);
      }
    }
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

    const t = this.tally;
    const n = (k: string) => t[k] ?? 0;
    const rows: Array<[string, string]> = [
      ["LASTED", `${run.t.toFixed(0)} SECONDS  ·  AEON ${run.world.aeon}`],
      ["GATHERED", `${n("merge")} MERGES INTO ${run.built} CELLS`],
      ["BUILT", `${n("place")} CELLS PLACED, ${run.structures.length} STANDING`],
      ["YOUR BODY", (() => {
        const b = run.bodies[0];
        if (!b) return "NEVER JOINED ANYTHING UP";
        const sym = symbolOf(b);
        return `${b.cells.length} CELLS${sym ? `  ·  ${sym.symbol}` : ""}`
          + `${autonomous(b) ? "  ·  IT WORKED ALONE" : ""}`;
      })()],
      ["THE BOUND FIELD", run.bound.free ? "FREED" : n("tuned") > 0 ? "CAUGHT, THEN LOST" : "NEVER CAUGHT"],
      ["KILLED YOU", `${n("hit:struck")} STRIKES, ${n("hit:volley")} ARMS, ${n("hit:touched")} DRIFTED INTO`],
      ["SCORE", String(run.score)],
    ];
    rows.forEach(([k, v], i) => {
      const y = 244 + i * 26;
      g.textAlign = "right";
      g.fillStyle = DIM;
      g.font = `600 10px ${MONO}`;
      g.fillText(k, VIEW_W / 2 - 16, y + 3);
      g.textAlign = "left";
      g.fillStyle = i === rows.length - 1 ? GOLD : INK;
      g.font = `700 12px ${MONO}`;
      g.fillText(v, VIEW_W / 2 + 16, y);
    });

    // The one line that is worth reading: what to do differently.
    g.textAlign = "center";
    g.font = `700 11px ${MONO}`;
    g.fillStyle = `rgb(${NODE})`;
    g.fillText(this.diagnosis(), VIEW_W / 2, 412);

    g.fillStyle = DIM;
    g.font = `600 10px ${MONO}`;
    g.fillText(`BEST ${this.best}   ·   DEEPEST AEON ${this.deepest}`, VIEW_W / 2, 436);
    const pulse = 0.55 + 0.45 * Math.sin(this.t * 3);
    g.fillStyle = `rgba(255,201,74,${pulse.toFixed(2)})`;
    g.font = `700 14px ${MONO}`;
    g.fillText("BEGIN AGAIN", VIEW_W / 2, 470);
    g.textAlign = "left";
  }

  private drawCard(): void {
    if (!this.card) return;
    const g = this.ctx;
    const a = Math.min(1, this.cardT / 0.8) * Math.min(1, (CARD_TIME - this.cardT) / 0.35);
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

  /**
   * Stopped.
   *
   * It also carries the verbs, because this is the screen somebody opens when
   * they cannot remember what the game lets them do — and being unable to find
   * that out was, in the end, the same complaint as not wanting to keep
   * playing.
   */
  private drawPaused(): void {
    const g = this.ctx;
    const run = this.run;
    const G = this.pad.connected ? GLYPH.pad : GLYPH.keys;

    g.fillStyle = "rgba(5,7,14,0.82)";
    g.fillRect(0, 0, VIEW_W, VIEW_H);

    g.textAlign = "center";
    g.font = `700 34px ${MONO}`;
    g.fillStyle = INK;
    g.fillText("STOPPED", VIEW_W / 2, 118);

    g.font = `600 10px ${MONO}`;
    g.fillStyle = `rgb(${NODE})`;
    g.fillText(
      run.bound.free
        ? "THE FIELD OF THIS WATER IS OUT. THE WAY ON IS THROUGH WHAT YOU CROWN."
        : advice(run.crystal, run.gap, run.bound.omega),
      VIEW_W / 2, 156);

    g.font = `600 11px ${MONO}`;
    g.fillStyle = DIM;
    const pad = (t: string) => t.padEnd(13, " ");
    const lines = [
      `${pad(G.move)}POINT WHERE TO GO. THE NODE LEADS YOU, AND YOU FALL INTO IT.`,
      `${pad(G.grip)}ONE TRAP UNDER YOUR HAND. HOLDS, KILLS, AND TRIPLES YOUR SPEED.`,
      `${pad(G.dash)}BURST - FOUR TIMES THE FORCE. IT IS HOW YOU GATHER, AND HOW YOU DODGE.`,
      `${pad(G.place)}BUILD HERE. IT NEVER FEEDS THE THRONE - THAT IS ITS OWN VERB.`,
      `${pad(G.lift)}TAKE THE BUILDING YOU ARE STANDING ON BACK INTO YOUR HAND.`,
      `${pad(G.cycle)}CHOOSE WHICH CELL.`,
      `${pad(G.crown)}TAP ON THE THRONE TO FEED IT. HOLD IT TO CROWN WHAT YOU FED.`,
      `${pad(G.depth)}RETUNE THE CHANNEL. THE ONLY WAY ANYTHING MOVES IN DEPTH.`,
      `${pad(G.mute)}SOUND.`,
      "",
      "HARD WALLS ARE PRESSURE ANTINODES, SO A RESONANCE NEEDS A WHOLE NUMBER",
      "OF HALF WAVELENGTHS ACROSS THE CHANNEL: MODE N PUTS N PLANES IN THE",
      "WATER. NOTHING SWIMS UP. YOU MOVE EVERY PLANE, OR YOU MOVE NOTHING.",
      "",
      "THE OTHER FIELD IS A MODE THIS WATER WILL NOT CARRY. BUILD A CRYSTAL",
      "WHOSE BAND GAP CATCHES IT: HOW MUCH YOU BUILD DECIDES WHETHER THERE IS",
      "A GAP, AND HOW FAR APART DECIDES WHERE IT SITS.",
      "",
      "WHAT SHARES YOUR CONTRAST COMES TO YOUR FEET. THE REST IS HELD OFF.",
      "A HUNTER STOPS AND GATHERS BEFORE IT STRIKES, AND GOES WHERE IT POINTED.",
    ];
    lines.forEach((l, i) => g.fillText(l, VIEW_W / 2, 196 + i * 17));

    // THE DECISIVE TEST, on the screen somebody opens when a control is not
    // doing what they expect. Two lines: what the browser is handing over, and
    // what this game made of it. If the first moves and the second does not,
    // the fault is mine and the numbers say where. If neither moves, the
    // browser is not delivering — which on a desktop is very often nothing more
    // than the page having lost focus to a devtools window.
    const it = this.intent;
    g.font = `600 9px ${MONO}`;
    g.fillStyle = this.pad.connected ? `rgb(${JADE})` : GOLD;
    g.fillText(this.pad.describe(), VIEW_W / 2, VIEW_H - 76);
    g.fillStyle = DIM;
    g.fillText(
      it
        ? `READ AS  move ${it.move.x.toFixed(2)},${it.move.y.toFixed(2)}`
          + `   grip ${it.grip ? "YES" : "no"}   dash ${it.dash ? "YES" : "no"}`
          + `   place ${it.place ? "YES" : "no"}   throne ${it.crownDown ? "YES" : "no"}`
        : "READ AS  (nothing yet)",
      VIEW_W / 2, VIEW_H - 62);

    const pulse = 0.55 + 0.45 * Math.sin(this.t * 3);
    g.font = `700 13px ${MONO}`;
    g.fillStyle = `rgba(255,201,74,${pulse.toFixed(2)})`;
    g.fillText(`${G.pause} TO GO ON`, VIEW_W / 2, VIEW_H - 40);
    g.textAlign = "left";
  }

  /**
   * What to do differently, in one line.
   *
   * Ordered so the earliest thing that went wrong is the thing it says. Telling
   * somebody to dodge better when they never built anything is advice about the
   * wrong end of their run.
   */
  private diagnosis(): string {
    const run = this.run;
    const t = this.tally;
    const n = (k: string) => t[k] ?? 0;

    if (run.built === 0) {
      return "YOU NEVER MADE A CELL. FOUR OF A KIND - BURST THROUGH THEM TO GATHER";
    }
    if (n("place") === 0) return "YOU MADE CELLS AND NEVER PUT ONE DOWN. THEY DO NOTHING IN HAND";
    if (run.structures.length < 2 && n("place") < 2) {
      return "TWO BUILDINGS IS THE FEWEST THAT IS A CRYSTAL. THE FIELD NEEDS ONE";
    }
    if (run.bodies.length > 1 && !run.bodies.some((b) => b.cells.length >= 3)) {
      return "YOUR CELLS ARE SCATTERED. PUT THEM ON ADJACENT SITES AND THEY BECOME ONE";
    }
    // A report came back at 909 s: 3440 cells built, 410 buildings standing, the
    // bound field freed, and a throne that had never once been visited. This
    // function told them to close their hand on a hunter. Nothing about
    // gathering or fighting was the answer to that run, and the one thing that
    // was is the thing it never mentioned.
    // The second play report: crowned, 306 buildings standing, king finished at
    // 150/150, and not one discharge in 563 s. It needed two. This function
    // told them to close their hand on a hunter.
    if (run.throne.awake && run.structures.length > 4 && n("discharge") === 0) {
      return "YOU NEVER FIRED A BUILDING. GRIP ONE WHILE THE KING IS IN ITS ARMS - "
        + "YOUR HAND ALONE LOSES TO WHAT IT HEALS BY EATING THEM";
    }
    if (run.throne.fed.length === 0 && run.built > 20) {
      return "YOU NEVER FED THE THRONE. GATHERING IS NOT THE GAME - "
        + "IT IS HOW YOU PAY FOR THE ONE THING THAT ENDS THIS WATER";
    }
    if (!run.bound.free && n("tuned") === 0) {
      return `THE GAP NEVER CAUGHT IT - ${advice(run.crystal, run.gap, run.bound.omega)}`;
    }
    // Speak to what ACTUALLY killed them. This used to fire on struck > volley
    // without asking which cause dominated, so a run that took six hits by
    // drifting into things and one from a strike was told to dodge better.
    const causes: Array<[string, number]> = [
      ["struck", n("hit:struck")], ["volley", n("hit:volley")], ["touched", n("hit:touched")],
    ];
    const worst = causes.sort((a, b) => b[1] - a[1])[0];
    if (worst[1] > 0) {
      if (worst[0] === "struck") {
        return n("dash") < n("strike") / 4
          ? "THEY TELEGRAPH. WHEN ONE STOPS AND GATHERS, BURST OFF THE LINE IT SHOWS"
          : "CLOSE YOUR HAND ON ONE AND IT CANNOT STRIKE AT ALL";
      }
      if (worst[0] === "volley") return "ITS ARMS ARE DRAWN BEFORE THEY ARE THROWN. STAND IN THE GAPS";
      return "WHAT SHARES YOUR CONTRAST IS DRAWN INTO YOUR NODE. HOLD IT OR LEAVE";
    }
    if (n("spent") >= 3) return "YOU RAN THE DRIVE DRY. THE LATTICE IS YOUR COVER - LET IT BACK UP";
    return "THE THING YOU CROWNED IS MADE OF WHAT YOU FED IT. FEED IT LESS";
  }

  /**
   * The run, as something that can be pasted to somebody who was not there.
   *
   * Reachable from the console as `drifter.report()`, because a static page
   * writes no logs and "I died after a few minutes" is not enough to work from.
   */
  report(): string {
    const run = this.run;
    const t = this.tally;
    const keys = Object.keys(t).sort();
    return [
      `SONIC DRIFTER  ${run.t.toFixed(0)}s  aeon ${run.world.aeon} (${run.world.name})  phase ${run.phase}`,
      `you: integrity ${run.integrity}/${MAX_INTEGRITY} stamina ${run.wave.stamina.toFixed(0)} score ${run.score}`,
      `built ${run.built} cells; ${run.structures.length} standing; rack [${run.cells.map((c) => c.group.hm).join(" ")}]`,
      `throne: ${run.throne.fed.length ? `fed [${run.throne.fed.join(" ")}] -> ${run.throne.hm}` : "empty"}`
        + `${run.throne.awake ? ` awake ${run.throne.hp.toFixed(0)}/${run.throne.maxHp}` : ""}`
        // WHERE it is, not just what is in it. The throne stands at a landmark
        // from the second aeon on, so "empty" and "never went there" look
        // identical in a report unless the distance is in it.
        + `${(() => {
          const at = nearestFeature(CHIP, run.throne.x, run.throne.y);
          const r = Math.hypot(run.throne.x - run.you.x, run.throne.y - run.you.y);
          return `  at ${at ? `${featureName(at.feature).toLowerCase()} #${at.feature.id}` : "mid-channel"}`
            + `, ${(r * 1e6).toFixed(0)}um from you`;
        })()}`,
      `bodies: ${run.bodies.length}`
        + `${run.bodies[0] ? (() => {
          const l = limbsOf(run.bodies[0], latticePitch(run));
          const legs = l.filter((x) => x.leg).length;
          return ` limbs ${l.length - legs} legs ${legs}`;
        })() : ""}`
        + `${run.bodies[0] ? ` largest ${run.bodies[0].cells.length} cells`
          + ` ${symbolOf(run.bodies[0])?.symbol ?? "unnamed"}`
          + `${autonomous(run.bodies[0]) ? " AUTONOMOUS" : ""}` : ""}`
        + `  lattice ${(latticePitch(run) * 1e6).toFixed(0)}um`,
      `bound: ${(run.bound.omega / 2 / Math.PI / 1e6).toFixed(2)} MHz  ${run.bound.free ? "FREED" : "held"}`
        + `  crystal ${run.crystal ? `a=${(run.crystal.a * 1e6).toFixed(0)}um fill=${run.crystal.fill.toFixed(2)}` : "none"}`
        + `  gap ${run.gap ? `${(run.gap.lo / 1e6).toFixed(1)}-${(run.gap.hi / 1e6).toFixed(1)}` : "none"}`,
      `water: ${run.entities.filter((e) => e.faction === "motif").length} standing of `
        + `${suspension(run)}; delivered ${run.delivered}; arrivals `
        + `${arrivalRate(run).toFixed(2)}/s; hunters allowed ${
          run.phase === "reign" ? "reign" : settleCap(run)}`,
      `chip: ${(() => {
        const on = nearestFeature(CHIP, run.you.x, run.you.y);
        const f = chipFlow(run, run.you.x, run.you.y);
        const reach = CHIP.filter((c) => c.x >= run.bounds.x && c.x <= run.bounds.x + run.bounds.w
          && c.y >= run.bounds.y && c.y <= run.bounds.y + run.bounds.h).length;
        return `${reach}/${CHIP.length} in reach; flow on you ${(Math.hypot(f.x, f.y) * 1e6).toFixed(0)}um/s`
          + `${on ? ` (in ${featureName(on.feature).toLowerCase()} #${on.feature.id})` : ""}`;
      })()}`,
      `events: ${keys.map((k) => `${k}=${t[k]}`).join(" ")}`,
      `pad: ${this.pad.describe()}`,
      `diagnosis: ${this.diagnosis()}`,
    ].join("\n");
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
    g.fillText("YOU ARE A FIELD. SO IS THE OTHER ONE, AND IT IS INSIDE THE MATTER.",
      VIEW_W / 2, 172);
    g.font = `600 10px ${MONO}`;
    g.fillStyle = DIM;
    g.fillText("A WAVE WITH NO PROPAGATING SOLUTION DOES NOT TRAVEL AND CANNOT LEAVE.",
      VIEW_W / 2, 192);
    g.fillText("NOBODY IS HOLDING IT. A DISPERSION RELATION IS. BUILD THE CRYSTAL",
      VIEW_W / 2, 206);
    g.fillText("WHOSE BAND GAP CATCHES IT, AND IT GOES WITH YOU.", VIEW_W / 2, 220);

    const on = this.pad.connected;
    const G = on ? GLYPH.pad : GLYPH.keys;
    g.fillStyle = DIM;
    g.font = `600 11px ${MONO}`;
    const pad = (t: string) => t.padEnd(13, " ");
    const lines = [
      `${pad(G.move)}POINT WHERE TO GO - OR WASD. THE NODE LEADS YOU AND YOU FALL IN.`,
      `${pad(G.grip)}CLOSE YOUR HAND: ONE TRAP, AND SPEED. IT COSTS STAMINA.`,
      `${pad(G.dash)}BURST. THE AMPLIFIER'S PEAK RATING, AND YOU ARE UNTOUCHABLE.`,
      `${pad(G.place)}PLACE A CELL. IT NEVER FEEDS THE THRONE.`,
      `${pad(G.crown)}TAP ON THE THRONE TO FEED. HOLD TO CROWN - AND IT IS WHAT YOU FED.`,
      "",
      `${pad("E")}${this.ebb
        ? "THE WATER EBBS - SPENDING YOUR CRYSTAL CLOSES THE CHANNEL BACK. HARDER."
        : "THE WATER HOLDS - WHAT YOU DROVE OPEN STAYS OPEN FOR THIS WORLD."}`,
      "",
      "GATHER   BURST THROUGH THE DRIFTERS. AN N-FOLD MOTIF IS DRAWN AS AN N-GON.",
      "BUILD    HOW MUCH YOU BUILD IS WHETHER THERE IS A GAP. HOW FAR APART IS WHERE.",
      "CROWN    WHAT YOU FEED THE THRONE IS WHAT IT BECOMES, AND IT EATS YOUR CRYSTAL.",
      "BIRTH    ITS BODY IS THE NEXT WORLD - AND STRANDS ITS OWN FIELD SOMEWHERE ELSE.",
    ];
    lines.forEach((l, i) => g.fillText(l, VIEW_W / 2, 246 + i * 16));

    const pulse = 0.55 + 0.45 * Math.sin(this.t * 3);
    g.font = `700 14px ${MONO}`;
    g.fillStyle = `rgba(255,201,74,${pulse.toFixed(2)})`;
    g.fillText(on ? "PRESS START" : "PRESS SPACE OR CLICK TO BEGIN", VIEW_W / 2, 462);
    // What the browser is actually reporting, said loudly. A controller that
    // does not work is the least debuggable thing there is — nothing throws and
    // nothing logs — and this line was previously eight-point grey where nobody
    // would find it.
    g.font = on ? `600 9px ${MONO}` : `700 11px ${MONO}`;
    g.fillStyle = on ? `rgb(${JADE})` : GOLD;
    g.fillText(this.pad.describe(), VIEW_W / 2, 438);
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

/**
 * A motif drawn as the symmetry it IS.
 *
 * Every body in the water used to be a small coloured circle, so a dimer and a
 * diagonal were the same picture and the only way to tell them apart was a
 * readout naming whichever was nearest. That is why gathering felt like
 * combining dots by accident: you cannot choose what you cannot identify.
 *
 * An n-fold axial is drawn as an n-gon, turning. Nobody had to invent that —
 * the motif is a rotation axis of order n and an n-gon is what that looks like
 * from above, which is the same argument shape.ts makes for the cells. The
 * girdle is a ring, because it is a two-fold ACROSS the axis rather than along
 * it, and the diagonal is a three-armed star for the body diagonal it is.
 */
function drawMotif(
  g: CanvasRenderingContext2D,
  x: number, y: number, r: number, id: string, rgb: string, spin: number,
): void {
  const m = motif(id);
  g.strokeStyle = `rgb(${rgb})`;
  g.fillStyle = `rgba(${rgb},0.30)`;
  g.lineWidth = 1.6;

  if (m.role === "girdle") {
    g.beginPath(); g.ellipse(x, y, r * 1.35, r * 0.62, spin * 0.6, 0, Math.PI * 2);
    g.fill(); g.stroke();
    return;
  }
  if (m.role === "diagonal") {
    for (let i = 0; i < 3; i++) {
      const a = spin + (i * Math.PI * 2) / 3;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(a) * r * 1.8, y + Math.sin(a) * r * 1.8);
      g.stroke();
    }
    return;
  }
  if (m.order <= 1) {
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.stroke();
    return;
  }
  if (m.order === 2) {
    // A two-fold is a line, and drawing it as one is the point: it is the only
    // motif whose shape has no area to it.
    g.beginPath();
    g.ellipse(x, y, r * 1.5, r * 0.5, spin, 0, Math.PI * 2);
    g.fill(); g.stroke();
    return;
  }
  g.beginPath();
  for (let i = 0; i < m.order; i++) {
    const a = spin + (i / m.order) * Math.PI * 2 - Math.PI / 2;
    const px2 = x + Math.cos(a) * r * 1.25;
    const py2 = y + Math.sin(a) * r * 1.25;
    if (i === 0) g.moveTo(px2, py2); else g.lineTo(px2, py2);
  }
  g.closePath();
  g.fill();
  g.stroke();
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
if (canvas) {
  const game = new Game(canvas);
  // A handle on the running game, for the console and for the smoke test. The
  // test that shipped with the controller only ever asserted that two hundred
  // frames did not THROW, which is not the same as asserting that anything
  // moved — and the difference between those two was a build nobody could play.
  (window as unknown as { drifter?: Game }).drifter = game;
  game.start();
}
