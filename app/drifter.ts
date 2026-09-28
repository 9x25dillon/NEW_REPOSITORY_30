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
  ARENA_H, ARENA_W, LURE_TIME, THRONE_RADIUS, dropLure,
  arrivalRate, settleCap, suspension,
  DISCHARGE_GAIN, HOLD_CATCH, LOBE_ARC, LOBE_RANGE, STRIKE_RANGE,
  bearsOn, dischargeFalloff, wearRate, wearing, WEAR_TICKS_PER_SECOND,
  CHANNEL_H, beast, crown, currentAt, dischargesToKill, enterWorld, feedThrone,
  latticePitch,
  liftCell,
  particleOf, placeCell, readoutFor, retuneChannel, streamOf, waterAt,
  startRun, step, maxIntegrity,
} from "../game/run.js";
import { type ResonanceSource, BLUEPRINTS, FORGE_REACH, blueprintSites, constructIds,
  craft, gapAligned, newResonance, realm, resonanceSource, seed32, weave } from "../game/resonance.js";
import { cellFor } from "../game/lattice.js";
import { envelopeAt, frequency, trapsX, trapsY, STAMINA_MAX } from "../game/wave.js";
import {
  PRIME_KEEP, epitaphFor, helpingCosts, inheritanceOf, isPrime, nextHelpingBuys,
  primeHelpings, sovereignParticle, throneLedger, volley,
} from "../game/world.js";
import { lobes } from "../game/shape.js";
import { SEED_MASS, assemble, motif, optionsFor } from "../game/lattice.js";
import { RELEASE_TIME, advice, catches, detune } from "../game/bound.js";
import {
  autonomous, growable, limbsOf, seatedGroup, snap, symbolOf, walkSpeed,
} from "../game/body.js";
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
import { AMBIENT_C, MAX_C, viscosity } from "../game/thermal.js";
import { Sfx } from "./sfx.js";
import {
  ADAPTATIONS, TAME_REACH, GUARD_REACH, SUPPORT_REACH,
  canBond, companion, cycleCompanion, formFor, limbRole, tameHealth, tameTime, vulnerable,
} from "../game/ecology.js";
import {
  MITO_REACH, growMitochondrion, mending, mitoCapacity, organelleHost, repairCost,
} from "../game/organelles.js";
import {
  FALTER_TIME, RIPOSTE_COOL, catchReach, chargeLength, chargeReach, echoArms, faltering,
  riposteDamage, shockReach, windLength,
} from "../game/combat.js";
import { CALLS, callAlly, callCooldown, callWait, rushing, shielded } from "../game/allies.js";
import {
  type Trait, TRAITS, cardCost, evolve, held, primeCards, rankOf,
} from "../game/evolution.js";
import { DASH_COST } from "../game/pilot.js";

// ── scale ───────────────────────────────────────────────────────────────────

const PX = 1e6;
const VIEW_W = 900;
const VIEW_H = 660;
const px = (m: number): number => m * PX;
const mx = (p: number): number => p / PX;
/**
 * The glow buffer, at a third of the view.
 *
 * Bloom on a downscale is most of the point: the blur is cheaper AND wider in
 * screen terms, and the upscale does half the smoothing for free.
 */
const GLOW_W = 300;
const GLOW_H = 220;

/**
 * How much of the glow is added back, at rest and at full drive.
 *
 * One place, because it is the number most likely to want changing and it was
 * too strong on the first attempt — the player's word was "a little bit too
 * much". Halved. The glow still answers to the drive, which is the part that
 * carries meaning: gripping makes the water blaze, it just no longer blows the
 * frame out while doing it.
 */
const BLOOM_REST = 0.10;
const BLOOM_DRIVE = 0.12;

const WASH_W = 100;
const WASH_H = 74;

// ── palette ─────────────────────────────────────────────────────────────────

const INK = "#cfe9f5";
const DIM = "#8299ae";
const FAINT = "#566d83";
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
  seated: {
    id: "seated", title: "THE SAME THEOREM, ONE LEVEL UP",
    body: "YOUR HAND IS TWO CROSSED STANDING WAVES, SO ITS NODES ARE A SQUARE GRID - AND A "
      + "THREE- OR SIX-FOLD AXIS DOES NOT MAP A SQUARE GRID ONTO ITSELF. THE CELL KEEPS "
      + "EVERY ARM IT FIRES. THE BODY DOES NOT: A 622 IS SEATED AS A 222 AND GROWS AND "
      + "WALKS IN TWO DIRECTIONS. A 4 OR A 422 IS SEATED WHOLE AND KEEPS FOUR. ORDER IS NOT "
      + "THE ONLY THING A CELL IS WORTH.",
  },
  crown: {
    id: "crown", title: "IT IS WHAT YOU FED IT",
    body: "ITS GROUP IS THE MOST SYMMETRIC CELL YOU GAVE IT, AND ITS VOLLEY IS THAT GROUP'S "
      + "SYMMETRY SEEN FROM ABOVE. FEED IT MORE AND IT THROWS MORE ARMS - AND THE WORLD BORN "
      + "OUT OF ITS BODY IS RICHER. THAT TRADE IS THE GAME, AND IT HAS A BOTTOM: EVERY PART "
      + "OF THAT RICHNESS RUNS INTO A CEILING WITHIN A FEW HELPINGS, AND ITS HEALTH DOES NOT.",
  },
  sated: {
    id: "sated", title: "IT IS FULL, AND YOU CAN KEEP FEEDING IT",
    body: "THE WATER A KING LEAVES IS BOUNDED BY THE PHYSICS IT IS MADE OF - THE MEDIUM ONLY "
      + "GOES SO FAST AND SO THIN BEFORE THE SOLVER STOPS BEING HONEST, THE CHANNEL ONLY "
      + "HOLDS FOUR NODE PLANES BEFORE THEY ARE CLOSER THAN THE BODIES STANDING ON THEM, AND "
      + "A LATTICE HAS A SHORTEST USABLE PITCH. ALL OF IT IS AT ITS LIMIT NOW. ITS HEALTH IS "
      + "NOT BOUNDED BY ANYTHING, SO EVERY HELPING FROM HERE IS HIT POINTS YOU WILL HAVE TO "
      + "TAKE BACK OFF ONE SPENT BUILDING AT A TIME.",
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
  heat: {
    id: "heat", title: "YOU ARE COOKING THE CHIP",
    body: "AN AMPLIFIER DISSIPATES MOST OF WHAT IT IS FED AND A DRIVEN CHANNEL CLIMBS TENS "
      + "OF DEGREES. WATER'S VISCOSITY HALVES BY SIXTY-FIVE, AND EVERY SPEED HERE IS A FORCE "
      + "OVER A DRAG - SO HOT WATER IS THIN WATER AND THE WHOLE GAME RUNS FASTER, INCLUDING "
      + "WHAT IS HUNTING YOU. THE GLASS TAKES IT BACK, BUT SLOWER THAN YOU CAN LET GO.",
  },
  spent: {
    id: "spent", title: "ENERGY DENSITY GOES AS PRESSURE SQUARED",
    body: "E = p^2 / 4 rho c^2. DOUBLE THE GRIP AND IT COSTS FOUR TIMES AS MUCH.",
  },
  riposte: {
    id: "riposte", title: "BURST INTO IT, AND IT GOES BACK",
    body: "A BURST LEAVES YOU UNTOUCHABLE FOR A MOMENT. AN ARM THAT REACHES YOU INSIDE THAT "
      + "MOMENT IS CAUGHT RATHER THAN SURVIVED, AND IT IS THROWN BACK AT THE KING THAT THREW "
      + "IT. BURST INTO IT, NOT PAST IT: A SIDEWAYS DODGE IS STILL A DODGE. ONE ARM A BURST, "
      + "AND A CATCH GIVES BACK MOST OF WHAT THE BURST COST. A GAME RULE, NOT ACOUSTICS.",
  },
  charge: {
    id: "charge", title: "THE LANE IS FIXED WHEN IT STARTS TO WIND",
    body: "A STRIDER KING CAN CHARGE. THE LANE IT WILL RUN DOWN IS DRAWN FOR THE WHOLE WIND-UP "
      + "AND DOES NOT FOLLOW YOU, SO STEP OFF IT - OR BURST THROUGH AS IT ARRIVES. AFTERWARDS "
      + "IT STANDS DAZED FOR A MOMENT, AND A DAZED KING IS EASY TO WALK INTO YOUR ARMS.",
  },
  shock: {
    id: "shock", title: "THE FRONT STOPS AT THE RING",
    body: "A WARDEN KING SENDS A SHOCK FRONT OUT TO THE DASHED RING. BE OUTSIDE THE RING WHEN "
      + "IT GOES, OR BURST AS THE FRONT REACHES YOU AND IT PASSES THROUGH.",
  },
  echo: {
    id: "echo", title: "IT THROWS TWICE",
    body: "A WEAVER KING'S ECHO THROWS ITS VOLLEY, THEN THE SAME ARMS TURNED HALF A GAP, A "
      + "BEAT LATER. BOTH SETS ARE DRAWN BEFORE EITHER FLIES: THE SAFE PLACE IS NOT THE GAP, "
      + "IT IS OUT OF REACH - OR A BURST INTO ONE OF THEM.",
  },
  lure: {
    id: "lure", title: "SOMETHING ELSE TO WALK TOWARD",
    body: "A CELL LEFT STANDING SINGS WHERE YOU WERE, AND EVERYTHING THAT WAS COMING FOR YOU "
      + "COMES FOR IT INSTEAD - HUNTERS, AND THE KING'S OWN DRAG. THAT IS HOW YOU PUT A KING IN "
      + "FRONT OF AN ARM WITHOUT SHOVING IT THERE: LEAVE ONE BEHIND A BUILDING AND STAND CLEAR. "
      + "IT COSTS THE CELL AND LASTS SIX SECONDS.",
  },
  tender: {
    id: "tender", title: "IT IS NOT COMING FOR YOU",
    body: "A TENDER SWIMS TO WHAT YOU CROWNED AND MENDS IT, AND A LEECH FASTENS ONTO WHAT YOU "
      + "BUILT AND EATS IT. NEITHER CARRIES A STRIKE, SO NEITHER IS ANSWERED BY DODGING: HOLD "
      + "THEM, OR LIFT THE BUILDING OUT FROM UNDER THE LEECH, OR WATCH THE BAR YOU ARE WORKING "
      + "ON GO BACK UP.",
  },
  prime: {
    id: "prime", title: "A PRIME WILL NOT SEAT",
    body: "EVERYTHING ELSE A HELPING BUYS IS CLAMPED WITHIN A FEW MOUTHFULS, AND ITS HEALTH IS "
      + "NOT - SO PAST THAT, FEEDING WAS BUYING HIT POINTS YOU WOULD HAVE TO TAKE BACK OFF. A "
      + "COUNT THAT IS PRIME IS A LINE AND NOTHING ELSE, SO THE THRONE CANNOT SEAT IT EVENLY "
      + "INTO ITS OWN BODY: IT COMES BACK TO YOU AS TWO POINTS MORE OF THE NEXT WORLD KEPT, PAST "
      + "THE OLD CEILING, AND ANOTHER CARD AT ITS BIRTH. A GAME RULE, NOT A THEOREM.",
  },
  falter: {
    id: "falter", title: "IT IS OPEN, AND ONLY FOR A MOMENT",
    body: "THE FIRST TIME A KING REACHES ITS BOND LINE IT FALTERS: IT STOPS, THROWS NOTHING, AND "
      + "CANNOT BE TAKEN BELOW ONE HIT POINT UNTIL THE MOMENT PASSES. THAT IS THE CHANCE TO GET "
      + "INSIDE 120 MICRONS AND HOLD THE THRONE BUTTON. LET IT PASS AND IT FIGHTS ON, AND KILLING "
      + "IT IS ONLY A MATTER OF WAITING THE MOMENT OUT.",
  },
  ally: {
    id: "ally", title: "IT FIGHTS WITH YOU",
    body: "YOUR COMPANION IS A BODY IN THE WATER. IT HOLDS HUNTERS UNTIL THEY COME APART, THE "
      + "SAME WAY YOUR HAND DOES, AND ONE IT HAS HOLD OF CANNOT STRIKE. A STRIDER HUNTS, A "
      + "WARDEN GOES FOR WHAT IS WINDING UP AT YOU, A WEAVER TETHERS FROM YOUR SIDE.",
  },
  call: {
    id: "call", title: "CALL IT",
    body: "EACH COMPANION HAS ONE CALL ON ITS OWN BUTTON. A STRIDER'S RUSH MAKES BURSTS FREE "
      + "AND CATCHES WIDER. A WARDEN'S AEGIS CLEARS THE ARMS AROUND YOU AND TURNS THE NEXT "
      + "HITS. A WEAVER'S SNARE HOLDS THE KING STILL, SO YOUR FIELD CAN WALK IT INTO AN ARM.",
  },
  repair: {
    id: "repair", title: "A STATION MENDS WHAT A HIT TOOK",
    body: "STAND AT YOUR MITOCHONDRIA WITH FULL STAMINA AND NO HIT FOR THREE SECONDS, AND "
      + "THEIR STORE GOES INTO YOUR INTEGRITY. TWENTY STATIONS MEND NO FASTER THAN ONE - "
      + "THEY LAST LONGER. THE KING EATS WHAT IS NEAR IT, INCLUDING THEM.",
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
  /**
   * The diagnosis, held from the frame the run ended.
   *
   * `drawDead` runs sixty times a second and `diagnosis()` is not a lookup: it
   * walks every building and every cell in the rack through `dischargesToKill`,
   * and `throneLedger` replays the whole fed list against `worldFrom` — 385
   * microseconds at the fifty helpings a real report carried. Rule 20 applies
   * to the death screen as much as to the arena, and nothing behind this line
   * can change once you are dead.
   */
  private verdict: string | null = null;
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
  private buildHeld = 0;
  private organelleGrown = false;
  /** How long the lift button has been held, and whether it already lured. */
  private liftHeld = 0;
  private lured = false;
  /** Which evolution card is highlighted on the birth screen. */
  private pick = 0;
  /** The stick has to come back to centre before it steps the cards again. */
  private stickLatched = false;
  /** Whether this birth has been told that a second card can be bought. */
  private nudged = false;
  private controlLegend = "";
  private crowned = false;
  private seed = 20260830;
  private expeditionSource: ResonanceSource | null = null;
  private forgeOpen = false;
  private forgePick = 0;
  private forgeRotation = 0;
  private forgeMessage = "";

  /** Explicit start action; never replaces an ongoing run. */
  startExpedition(source: ResonanceSource): boolean {
    if (this.screen !== "title" && this.screen !== "dead") return false;
    seed32(source.seed);
    this.expeditionSource = source;
    this.begin();
    return true;
  }
  toggleForge(): void {
    if (this.screen !== "play") return;
    if (!this.run.resonance) { this.say("START A RESONANT EXPEDITION TO USE THE FORGE"); return; }
    this.forgeOpen = !this.forgeOpen;
    this.mouseGrip = this.mouseDash = false;
    this.buildHeld = this.crownHeld = this.liftHeld = 0;
    this.organelleGrown = this.crowned = this.lured = false;
    this.forgeMessage = "";
  }
  private forgeAction(): void {
    const result = this.forgePick === 3 ? weave(this.run) : craft(this.run, BLUEPRINTS[this.forgePick].kind, this.forgeRotation);
    const messages = {
      crafted: "ASSEMBLED. CLOSE THE FORGE, THEN GRIP NEARBY TO CHARGE.",
      woven: "NEW CELL ADDED TO YOUR RACK.",
      "need-cells": "GATHER MORE CELLS FOR THIS GEOMETRY.",
      "need-fragments": "HOLD HUNTERS TO RECOVER MORE PHASE FRAGMENTS.",
      "need-tetragonal": "WARD NEEDS FOUR 4 OR 422 CELLS. A SIXFOLD MOTIF SEATS AS 222 HERE.",
      occupied: "SITES OCCUPIED. CLOSE THE FORGE AND MOVE TO CLEAR WATER.",
      outside: "GEOMETRY CROSSES THE POOL EDGE OR THRONE. MOVE INWARD.",
      "wrong-phase": "CRAFT WHILE SETTLING OR REIGNING.",
      limit: "24 ASSEMBLIES ACTIVE. RECLAIM AN OLD ONE FIRST.",
      "need-loom": "STAND WITHIN 110 MICRONS OF AN INTACT LOOM.",
      "need-charge": "LOOM NEEDS 15 CHARGE. CLOSE THE FORGE AND GRIP NEAR IT.",
    };
    this.forgeMessage = messages[result];
    this.sfx.tick();
  }


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

  private readonly glowCanvas: HTMLCanvasElement;
  private readonly glowCtx: CanvasRenderingContext2D;
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
    this.verdict = null;

    this.washCanvas = document.createElement("canvas");
    this.washCanvas.width = WASH_W;
    this.washCanvas.height = WASH_H;
    const wc = this.washCanvas.getContext("2d");
    if (!wc) throw new Error("no 2d context for the field buffer");
    this.washCtx = wc;
    this.wash = wc.createImageData(WASH_W, WASH_H);

    this.glowCanvas = document.createElement("canvas");
    this.glowCanvas.width = GLOW_W;
    this.glowCanvas.height = GLOW_H;
    const gc = this.glowCanvas.getContext("2d");
    if (!gc) throw new Error("no 2d context for the glow buffer");
    this.glowCtx = gc;

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
      if (this.screen === "birth") {
        const { sx, sy } = world(e);
        const card = this.cardAt(sx, sy);
        // Clicking a card takes it; clicking anywhere else goes in.
        if (card >= 0) { this.pick = card; this.take(); return; }
        if (this.run.evolution.taken === 0 && this.run.evolution.offer.length > 0) this.take();
        this.enter();
        return;
      }

      const { sx, sy } = world(e);
      if (this.forgeOpen) {
        const choice = Math.floor((sy - 155) / 50);
        if (sx >= 70 && sx <= VIEW_W - 70 && choice >= 0 && choice < 4) this.forgePick = choice;
        else if (sy >= 405 && sy <= 455) this.forgeAction();
        else if (sy > 460) this.toggleForge();
        return;
      }
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
      if (this.screen !== "play" || this.paused || this.forgeOpen) return;
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
  /** How long the lift button must be held before it leaves a lure instead. */
  private static readonly LURE_HOLD = 0.5;

  private act(it: Intent, dt: number): void {
    const run = this.run;

    if (it.mute) this.sfx.muted = !this.sfx.muted;

    if (this.screen === "title" || this.screen === "dead") {
      // Chosen before a run and never during one, so it cannot be reached for
      // as a way out of a fight that is going badly.
      // Reachable from the pad as well as the keyboard, now that a controller
      // actually works: cycle is the spare verb on a menu.
      if (this.pad.tapped("KeyE") || it.cycle !== 0) { this.ebb = !this.ebb; return; }
      if (it.confirm) { this.sfx.unlock(); this.begin(); }
      return;
    }
    if (this.screen === "birth") {
      // EVOLVE, THEN ENTER. The cards step with the rack's own buttons, the
      // stick, or 1-3; confirming takes the highlighted one and goes in.
      const offer = run.evolution.offer;
      if (offer.length > 0) {
        let stepBy = it.cycle;
        const sx = it.move.x;
        if (Math.abs(sx) < 0.3) this.stickLatched = false;
        else if (!this.stickLatched && Math.abs(sx) > 0.6) {
          this.stickLatched = true;
          stepBy = sx > 0 ? 1 : -1;
        }
        if (stepBy !== 0) {
          this.pick = (this.pick + stepBy + offer.length) % offer.length;
          this.sfx.tick();
        }
        const key = this.pad.slotKey();
        if (key > 0 && key <= offer.length) this.pick = key - 1;
      }
      // X TAKES, START ENTERS. The first card at a birth is free and the rest
      // are bought with rack cells, so taking and leaving cannot be the same
      // press — and entering still takes the free one for anybody who does not
      // know that yet.
      if (it.place && offer.length > 0) this.take();
      if (it.confirm) {
        if (run.evolution.taken === 0 && offer.length > 0) this.take();
        // ONCE PER BIRTH, AND ONLY WHEN IT IS AFFORDABLE. A report came back
        // with nine births, nine cards and two hundred and eighty cells left
        // in the rack: Start takes the free one and enters, so a player who
        // does not already know about buying never meets it.
        if (!this.nudged && run.evolution.offer.length > 0 && run.cells.length >= cardCost(run)) {
          const keys = this.pad.connected ? GLYPH.pad : GLYPH.keys;
          this.nudged = true;
          this.say(`ANOTHER CARD IS ${cardCost(run)} CELLS  ·  ${keys.place} TAKES IT  ·  `
            + `${keys.confirm} AGAIN TO ENTER`);
          return;
        }
        this.enter();
      }
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
    if (it.placeDown) {
      this.buildHeld += dt;
      if (this.buildHeld >= 0.85 && !this.organelleGrown) {
        this.organelleGrown = true;
        const result = growMitochondrion(run, this.selected);
        const messages = {
          "need-cells": "MITOCHONDRION NEEDS 2 CELLS IN HAND",
          "need-host": "STAND ON ONE OF YOUR STRUCTURES TO GROW A MITOCHONDRION",
          "already-grown": "THIS STRUCTURE ALREADY HAS A MITOCHONDRION",
          "wrong-phase": "NOT NOW",
          grown: "",
        };
        if (messages[result]) this.say(messages[result]);
      }
    } else {
      if (this.buildHeld > 0 && !this.organelleGrown) this.spend(this.selected);
      this.buildHeld = 0;
      this.organelleGrown = false;
    }

    // CALL THE COMPANION. Its success is said by the `call` event; only the
    // refusals are said here, for the reason `doFeed` gives.
    if (it.call) this.doCall();

    // TAKE IT BACK UP, or hold to leave a cell singing in your place. Tap and
    // hold on one button, the same shape as building and growing an organelle,
    // because the pad has no spare face buttons left.
    if (it.liftDown) {
      this.liftHeld += dt;
      if (this.liftHeld >= Game.LURE_HOLD && !this.lured) {
        this.lured = true;
        const r = dropLure(run, this.selected);
        if (r === "none") this.say("NOTHING IN HAND TO LEAVE");
        if (r === "wrong-phase") this.say("NOT NOW");
      }
    } else {
      if (this.liftHeld > 0 && !this.lured) {
        const r = liftCell(run);
        if (r === "nothing-there") this.say("NOTHING OF YOURS WITHIN REACH");
        if (r === "wrong-phase") this.say("NOT NOW");
      }
      this.liftHeld = 0;
      this.lured = false;
    }

    // TAP TO FEED, HOLD TO CROWN. Feeding used to be the building button,
    // told apart by where you happened to be standing, and the throne is at
    // the centre of the arena where people build: the first run to reach it fed
    // fifty-one cells by accident and woke something with three thousand eight
    // hundred hit points.
    // The d-pad, for a pad that works. Buttons 12 and 13 in the standard
    // mapping are up and down.
    if (it.depth !== 0) this.retune(it.depth);

    if (run.phase === "reign") { this.crownHeld = 0; this.crowned = false; return; }
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
    // ONLY THE REFUSALS. What a successful feed says belongs to the `fed`
    // event and is said there — because `act` runs BEFORE `step` and `drain`,
    // so anything set here is overwritten by the event handler in the same
    // frame. There WAS a success line here, carrying the discharges-to-kill,
    // and it has never been on screen for anybody: `drain`'s "THE THRONE TAKES
    // X" clobbered it every time, exactly the way `teach()` clobbered the `aim`
    // lesson for the whole life of that bug. A toast written before `drain` is
    // a toast that was never shown.
    const r = feedThrone(this.run, this.selected);
    if (r === "off-throne") this.say("STAND ON THE THRONE TO FEED IT");
    if (r === "none") this.say("NOTHING IN HAND");
    if (r === "wrong-phase") this.say("IT IS ALREADY AWAKE");
  }

  private fit(): void {
    const style = getComputedStyle(document.body);
    const chrome = ["header", ".legend", ".controls"].reduce((height, selector) =>
      height + (document.querySelector(selector)?.getBoundingClientRect().height ?? 0), 0)
      + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) + parseFloat(style.rowGap) * 3 + 4;
    const s = Math.max(0.2, Math.min((window.innerWidth - 36) / VIEW_W, (window.innerHeight - chrome) / VIEW_H));
    this.canvas.style.width = `${Math.floor(VIEW_W * s)}px`;
    this.canvas.style.height = `${Math.floor(VIEW_H * s)}px`;
  }

  /** Whether the water ebbs back as you spend your crystal. See `Run.ebb`. */
  private ebb = false;

  private begin(): void {
    this.paused = false;
    this.buildHeld = this.crownHeld = 0;
    this.organelleGrown = this.crowned = this.lured = false;
    this.liftHeld = 0;
    this.pick = 0;
    this.tally = {};
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    this.run = startRun(this.expeditionSource ? seed32(this.expeditionSource.seed) : this.seed, this.ebb);
    this.forgeOpen = false; this.forgePick = 0; this.forgeRotation = 0; this.forgeMessage = "";
    if (this.expeditionSource) {
      this.run.resonance = newResonance(this.expeditionSource);
      // An explicit expedition starter kit; normal runs retain their original economy.
      this.run.cells = [...Array.from({length:6},()=>cellFor("2")), ...Array.from({length:4},()=>cellFor("4"))];
    }
    this.verdict = null;
    this.screen = "play";
    this.sparks = []; this.popups = []; this.rings = [];
    this.say(this.run.resonance ? "RESONANT EXPEDITION · V / L3 OPENS THE CRYSTAL FORGE" : "GATHER FOUR OF A KIND TO MAKE A CELL");
  }

  private spend(i: number): void {
    const run = this.run;
    if (!run.cells[i]) return;
    const r = placeCell(run, i);
    if (r === "too-close") this.say("NOT THERE");
    if (r === "occupied") this.say("THAT SITE IS TAKEN");
    if (r === "wrong-phase") this.say("NOT NOW");
  }

  private doCall(): void {
    const run = this.run;
    const G = this.pad.connected ? GLYPH.pad : GLYPH.keys;
    const r = callAlly(run);
    const c = companion(run);
    if (r === "no-companion") {
      this.say(`NO COMPANION YET  ·  WEAKEN A KING AND HOLD ${G.crown} NEAR IT TO BOND`);
    }
    if (r === "cooling" && c) this.say(`${CALLS[c.form].name} RETURNS IN ${callWait(run).toFixed(0)} S`);
    if (r === "no-king") this.say("A SNARE NEEDS A KING AWAKE TO HOLD");
    if (r === "wrong-phase") this.say("NOT NOW");
  }

  /** Take the highlighted card. The first is free; the rest cost cells. */
  private take(): void {
    const run = this.run;
    const t = run.evolution.offer[this.pick];
    if (!t) return;
    const cost = cardCost(run);
    if (run.cells.length < cost) {
      this.say(`ANOTHER CARD IS ${cost} CELLS  ·  YOU HAVE ${run.cells.length}`);
      return;
    }
    if (evolve(run, t)) {
      this.drain();
      this.pick = Math.min(this.pick, Math.max(0, run.evolution.offer.length - 1));
    }
  }

  /** Step into the new world with whatever was taken. */
  private enter(): void {
    const run = this.run;
    this.drain();
    enterWorld(run);
    this.screen = "play";
    this.pick = 0;
  }

  private doCrown(): void {
    const r = crown(this.run);
    if (r === "nothing-fed") this.say(`FEED THE THRONE FIRST - TAP ${(this.pad.connected ? GLYPH.pad : GLYPH.keys).crown} NEAR IT`);
  }

  // ── loop ──────────────────────────────────────────────────────────────────

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const frame = (now: number) => {
      let dt = (now - this.last) / 1000;
      this.last = now;
      // CLAMPED AT BOTH ENDS. It was only clamped above. `this.last` is seeded
      // from performance.now() while `now` is the rAF timestamp, and those can
      // arrive out of order — one negative frame is enough to make `this.t`
      // negative, and a negative time is not a small error here: JavaScript's %
      // returns a NEGATIVE remainder for a negative operand, so every animation
      // phase written as `(t * k) % 1` goes negative with it. drawBound turns
      // one of those straight into a radius, and the canvas threw:
      //   DOMException: CanvasRenderingContext2D.arc: Negative radius
      // A negative dt would also have stepped the whole simulation backwards.
      if (!Number.isFinite(dt) || dt < 0) dt = 0;
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
    if (this.screen === "play") this.mouse(it);
    this.intent = it;
    if (this.screen === "play" && it.forge) { this.toggleForge(); return; }
    if (this.forgeOpen && this.screen === "play") {
      if (it.pause || it.lift) { this.toggleForge(); return; }
      if (it.crown) this.forgeRotation = (this.forgeRotation + 1) % 4;
      if (it.cycle) this.forgePick = (this.forgePick + it.cycle + 4) % 4;
      const number = this.pad.slotKey(); if (number >= 1 && number <= 4) this.forgePick = number - 1;
      if (it.place || it.confirm) this.forgeAction();
      return; // Design mode pauses the world, including enemy winds and model time.
    }

    // Pause first, and only where there is something to pause. A menu is
    // already stopped.
    if (it.pause && this.screen === "play") {
      this.paused = !this.paused;
      this.sfx.tick();
    }
    const G = this.pad.connected ? GLYPH.pad : GLYPH.keys;
    const legend = `${G.move} move · ${G.grip} grip · ${G.dash} dash / catch · ${G.place} build / hold: mitochondrion`
      + ` · ${G.lift} lift / hold: lure · ${G.crown} feed / crown / tame · ${G.call} call ally · ${G.pause} pause` + (run.resonance ? " · V / L3 forge" : "");
    if (legend !== this.controlLegend) {
      this.controlLegend = legend;
      const controls = document.getElementById("controls");
      if (controls) controls.textContent = legend;
      this.fit();
    }
    if (this.paused && this.screen === "play") {
      if (it.cycle) cycleCompanion(run);
      this.buildHeld = this.crownHeld = this.liftHeld = 0;
      this.organelleGrown = this.crowned = this.lured = false;
      return;
    }

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
      run.integrity = maxIntegrity(run);
      run.events.length = 0;
      this.decay(dt);
      return;
    }

    const gripping = it.grip && !run.wave.spent;
    if (gripping && !this.wasGrip) this.sfx.gripOn();
    this.wasGrip = gripping;

    step(run, { move: it.move, grip: it.grip, dash: it.dash, tame: it.crownDown }, dt);
    this.drain();
    this.decay(dt);

    if (run.phase === "birth" && this.screen !== "birth") {
      this.screen = "birth";
      this.nudged = false;
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
    if (companion(run) && run.phase !== "birth") this.teach("call");
    if (run.wave.tC > AMBIENT_C + 12) this.teach("heat");

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
        case "resonance": this.say(ev.text); break;
        case "hit":
          this.flash = 1; this.flashRed = true; this.shake = 13;
          // Two frames of held time. It is the cheapest weight there is.
          this.hitstop = Math.max(this.hitstop, 0.055);
          this.sfx.hurt(); this.burst(ev.x, ev.y, 16, "255,77,109");
          this.say(ev.cause === "charge" ? `IT RAN YOU DOWN  ·  INTEGRITY ${run.integrity}`
            : ev.cause === "shock" ? `THE FRONT CAUGHT YOU  ·  INTEGRITY ${run.integrity}`
              : `INTEGRITY ${run.integrity}`);
          if (ev.cause === "volley") this.teach("riposte");
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
          this.sfx.capture(3); this.say(`${ev.group}  ·  ${(this.pad.connected ? GLYPH.pad : GLYPH.keys).place} TO PLACE IT`);
          this.teach("crystal");
          break;
        case "place":
          this.ring(ev.x, ev.y, 6, 70, 0.6, JADE);
          this.sfx.capture(2); this.say(`${ev.group} STANDS`);
          // WHEN THE LATTICE TAKES SOMETHING OFF WHAT YOU BUILT. Told at the
          // moment it first costs the player something — a body standing, whose
          // group the square net will not seat whole — rather than in a menu
          // they read before it could mean anything.
          if (run.bodies.some((b) => seatedGroup(b.hm) !== b.hm && b.cells.length >= 3)) {
            this.teach("seated");
          }
          break;
        case "fed":
          this.ring(run.throne.x, run.throne.y, 10, 60, 0.6, "255,201,74");
          this.sfx.capture(4);
          // AND WHETHER IT BOUGHT ANYTHING, asked of THIS helping rather than
          // inferred from the ledger — prime helpings buy something wherever
          // they fall, so "some helping was wasted" is no longer the same
          // question as "the one just given was". Every other benefit of
          // feeding is clamped and the health is not, and this is the moment
          // the player is making the decision.
          if (!ev.bought) {
            this.say(`THE THRONE TAKES ${ev.group}  ·  ${run.throne.maxHp} HP  ·  `
              + "AND IT BOUGHT NOTHING ELSE");
            this.teach("sated");
          } else {
            const need = dischargesToKill(run);
            this.say(`THE THRONE TAKES ${ev.group}  ·  `
              + `${Number.isFinite(need) ? `${need} DISCHARGES TO KILL` : "NOTHING CAN KILL IT YET"}`
              + "  ·  C TO CROWN");
          }
          break;
        case "lure":
          this.teach("lure");
          this.sfx.invert(true);
          this.ring(ev.x, ev.y, 6, 80, 0.7, NODE);
          this.say(`A ${ev.group} SINGS WHERE YOU STOOD  ·  ${LURE_TIME} S`);
          break;
        case "gnawed":
          this.teach("tender");
          this.sfx.dissolve();
          this.burst(ev.x, ev.y, 12, "255,120,150");
          this.say(`A LEECH FINISHED YOUR ${ev.group}`);
          break;
        case "tended":
          this.teach("tender");
          this.popups.push({
            x: ev.x, y: ev.y, text: `+${ev.heal.toFixed(0)}`, life: 0.9,
            colour: "#8ce9ff", big: false,
          });
          break;
        case "prime":
          this.teach("prime");
          this.sfx.capture(5);
          this.ring(run.throne.x, run.throne.y, 12, 90, 0.8, GOLD);
          this.burst(run.throne.x, run.throne.y, 14, "255,201,74");
          this.say(`${ev.n} IS PRIME  ·  +${(PRIME_KEEP * 100).toFixed(0)}% KEPT  ·  `
            + `${primeCards(run) >= 3 ? "CARDS AT THEIR LIMIT" : "+1 CARD AT ITS BIRTH"}`);
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
        case "guard":
          this.ring(ev.x, ev.y, 8, 38, 0.4, "255,201,74");
          this.burst(ev.x, ev.y, 5, "255,201,74");
          break;
        case "riposte":
          this.teach("riposte");
          if (ev.thrown) {
            this.sfx.riposte();
            this.ring(ev.x, ev.y, 6, 44, 0.35, "255,201,74");
            this.burst(ev.x, ev.y, 10, "255,230,150");
            this.hitstop = Math.max(this.hitstop, 0.04);
            this.popups.push({ x: ev.x, y: ev.y, text: "CAUGHT", life: 0.8, colour: GOLD, big: false });
          } else {
            const cooling = run.t < run.fray.catchReadyAt;
            this.ring(ev.x, ev.y, 5, 30, 0.3, JADE);
            this.popups.push({
              x: ev.x, y: ev.y, text: cooling ? "EATEN" : "ABSORBED", life: 0.8,
              colour: `rgb(${JADE})`, big: false,
            });
          }
          break;
        case "riposte-hit":
          this.sfx.riposteHit();
          this.burst(ev.x, ev.y, 14, "255,201,74");
          this.shake = Math.max(this.shake, 4);
          this.popups.push({ x: ev.x, y: ev.y, text: `-${ev.damage}`, life: 1, colour: GOLD, big: false });
          break;
        case "falters":
          this.sfx.falter();
          this.teach("falter");
          this.flash = 0.6; this.flashRed = false;
          this.hitstop = Math.max(this.hitstop, 0.07);
          this.ring(ev.x, ev.y, 10, 190, 0.9, JADE);
          this.burst(ev.x, ev.y, 18, JADE);
          this.say(`IT FALTERS  ·  HOLD ${(this.pad.connected ? GLYPH.pad : GLYPH.keys).crown} NEAR IT TO BOND`);
          break;
        case "gambit": {
          this.sfx.gambit(ev.gambit);
          this.teach(ev.gambit);
          const name = ADAPTATIONS[formFor(run.world.aeon)].name;
          this.say(ev.gambit === "charge" ? `${name} WINDS A CHARGE  ·  STEP OFF THE LANE`
            : ev.gambit === "shock" ? `${name} GATHERS A SHOCK  ·  GET OUTSIDE THE RING`
              : `${name} WINDS AN ECHO  ·  TWO SETS OF ARMS`);
          break;
        }
        case "charge":
          this.shake = Math.max(this.shake, 6);
          this.sfx.strike();
          break;
        case "shock":
          this.shake = Math.max(this.shake, 7);
          this.sfx.thump();
          break;
        case "ally":
          this.teach("ally");
          this.ring(ev.x, ev.y, 6, 40, 0.4, JADE);
          break;
        case "call":
          this.sfx.call();
          this.ring(ev.x, ev.y, 10, 120, 0.6, ev.form === "warden" ? "255,201,74" : JADE);
          this.say(`${CALLS[ev.form].name}  ·  ${CALLS[ev.form].says}`);
          break;
        case "repair":
          this.teach("repair");
          this.sfx.mend();
          this.ring(ev.x, ev.y, 8, 50, 0.6, JADE);
          this.popups.push({ x: ev.x, y: ev.y, text: "+1", life: 1.2, colour: `rgb(${JADE})`, big: true });
          this.say(`MENDED  ·  INTEGRITY ${run.integrity}/${maxIntegrity(run)}`);
          break;
        case "mended":
          this.sfx.mend();
          this.popups.push({ x: ev.x, y: ev.y, text: "+1", life: 1.2, colour: `rgb(${JADE})`, big: true });
          this.say(`PHAGOCYTE  ·  INTEGRITY ${run.integrity}/${maxIntegrity(run)}`);
          break;
        case "evolved":
          this.sfx.capture(4);
          this.say(`EVOLVED  ·  ${TRAITS[ev.trait].name} ${ev.rank}`
            + `${Number.isFinite(TRAITS[ev.trait].max) ? `/${TRAITS[ev.trait].max}` : ""}`
            + `${ev.cost > 0 ? `  ·  ${ev.cost} CELLS` : ""}`);
          break;
        case "organelle":
          this.ring(ev.x, ev.y, 8, 60, 0.8, JADE);
          this.say("MITOCHONDRION GROWN · CHARGES WHILE YOU EXPLORE · RETURN FOR STAMINA");
          this.sfx.capture(3);
          break;
        case "tamed":
          this.burst(ev.x, ev.y, 28, JADE);
          this.say("BONDED · A SOVEREIGN WILL TRAVEL WITH YOU");
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
    this.drawCurrent();
    this.drawChip();
    this.drawField();
    this.drawLattice();
    this.drawSites();
    this.drawBodies();
    this.drawStructures();
    this.drawOrganelles();
    this.drawResonanceStructures();
    this.drawBound();
    this.drawThrone();
    this.drawTrails();
    this.drawEntities();
    this.drawSovereign();
    this.drawGambits();
    this.drawBolts();
    this.drawSparks();
    this.drawRings();
    this.drawCompanion();
    this.drawLure();
    this.drawYou();
    this.drawPopups();
    g.restore();

    this.bloom();

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
    if (this.forgeOpen && this.screen === "play") this.drawForge();

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
        // AN INTERFACE BETWEEN TWO FLUIDS, not a line on a map. The waters
        // either side have different densities and sound speeds — that is what
        // makes them different waters — so light crossing here is refracted,
        // and a co-flow boundary in a real channel is visible for exactly that
        // reason. Drawn as a thin band that breathes rather than a dashed rule,
        // brighter where the two waters differ more.
        const above = mediumAt(run.world.medium, lo - 6e-6, CHANNEL_H);
        const below = mediumAt(run.world.medium, lo + 6e-6, CHANNEL_H);
        const jump = Math.min(1, Math.abs(below.c - above.c) / 320);
        const y0 = px(lo);
        const band = g.createLinearGradient(0, y0 - 7, 0, y0 + 7);
        const a = (0.05 + jump * 0.16).toFixed(3);
        band.addColorStop(0, "rgba(200,235,255,0)");
        band.addColorStop(0.5, `rgba(210,240,255,${a})`);
        band.addColorStop(1, "rgba(200,235,255,0)");
        g.fillStyle = band;
        g.fillRect(px(b.x), y0 - 7, px(b.w), 14);

        // and the surface of it, rippling along its own length
        g.strokeStyle = `rgba(220,245,255,${(0.10 + jump * 0.14).toFixed(3)})`;
        g.lineWidth = 1;
        g.beginPath();
        const step = 14;
        for (let sx = px(b.x); sx <= px(b.x + b.w); sx += step) {
          const u = sx * 0.021 + this.t * 0.9;
          const yy = y0 + Math.sin(u) * 1.6 + Math.sin(u * 0.37 + 1.7) * 1.1;
          if (sx === px(b.x)) g.moveTo(sx, yy); else g.lineTo(sx, yy);
        }
        g.stroke();
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

    // THE FIELD HAS A SIGN AND THIS USED TO THROW IT AWAY. It drew
    // |cos(kx)cos(ky)|, so a pressure node and an antinode came out the same
    // colour — which is half of what a standing wave is, and precisely the half
    // that decides where anything ends up. This file has had two colours for
    // that distinction since it was written and the field used neither.
    //
    // Drawn signed, the checkerboard is the actual structure: the cells where
    // the two axes agree and the cells where they fight. A body with positive
    // contrast goes to one of them and a body with negative contrast to the
    // other, which is the whole bestiary in one picture.
    //
    // And it warms. The water's temperature is tracked now, so the field is
    // tinted by it — not a mood, the same number that halves the viscosity and
    // moves everything a third faster.
    const data = this.wash.data;
    const gain = 0.05 + lit * 0.4;
    const heat = Math.min(1, Math.max(0, (w.tC - AMBIENT_C) / (MAX_C - AMBIENT_C)));
    // node cyan and antinode rose, pulled toward ember as the water heats
    const nr = 70 + heat * 150, ng = 150 - heat * 40, nb = 200 - heat * 90;
    const ar = 200 + heat * 40, ag = 95 - heat * 20, ab = 150 - heat * 60;
    let o = 0;
    for (let j = 0; j < WASH_H; j++) {
      const cy = this.cosY[j];
      const ey = this.envY[j];
      for (let i = 0; i < WASH_W; i++) {
        const sgn = this.cosX[i] * cy;
        const p = Math.abs(sgn);
        const up = w.inverted ? sgn < 0 : sgn >= 0;
        const v = 0.022 + p * gain * this.envX[i] * ey;
        data[o] = up ? nr : ar;
        data[o + 1] = up ? ng : ag;
        data[o + 2] = up ? nb : ab;
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

      // ONE PATH, A GRID, AND ONLY WHAT IS ON SCREEN.
      //
      // This compared every cell to every other cell and allocated a Path2D per
      // cell AND per segment, every frame. A player's report — "it starts to
      // lag when the screen is full" — came from a 211-cell body: forty-four
      // thousand distance checks and about eighteen hundred objects a frame, to
      // draw a shape that had not changed.
      //
      // Cells sit on a lattice and `near` is one and a half pitches, so a grid
      // of that size puts every neighbour in the nine squares around a cell.
      // The fourth time this exact shape has turned up in this project: the
      // merge pass, the structure lookups, limbsOf, and now the thing that
      // draws them.
      const path = new Path2D();
      const cell = near;
      const grid = new Map<number, typeof body.cells>();
      for (const c of body.cells) {
        const key = (Math.floor(c.x / cell) + 4096) * 8192 + (Math.floor(c.y / cell) + 4096);
        const at = grid.get(key);
        if (at) at.push(c);
        else grid.set(key, [c]);
      }
      const margin = px(pitch) * 2;
      for (const a of body.cells) {
        if (!this.onCamera(a.x, a.y, margin)) continue;
        const ax = px(a.x), ay = px(a.y);
        path.moveTo(ax, ay);
        path.lineTo(ax + 0.01, ay);
        const gx = Math.floor(a.x / cell), gy = Math.floor(a.y / cell);
        for (let ox = -1; ox <= 1; ox++) {
          for (let oy = -1; oy <= 1; oy++) {
            const at = grid.get((gx + ox + 4096) * 8192 + (gy + oy + 4096));
            if (!at) continue;
            for (const b of at) {
              if (b === a) continue;
              if (Math.hypot(b.x - a.x, b.y - a.y) > near) continue;
              path.moveTo(ax, ay);
              path.lineTo(px(b.x), px(b.y));
            }
          }
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
        if (!this.onCamera(tip.x, tip.y, 100)) continue;
        const tx = px(tip.x), ty = px(tip.y);
        const role = limbRole(limb);
        const active = limb.layers.includes(run.layer);
        const nearTip = active && Math.hypot(tip.x - run.you.x, tip.y - run.you.y) <= SUPPORT_REACH;
        const ready = (run.bond.limbReadyAt.get(tip.id) ?? 0) <= run.t;
        g.strokeStyle = role === "guard" ? `rgba(255,201,74,${ready ? 0.8 : 0.2})` : `rgba(${JADE},0.7)`;
        g.lineWidth = 1.5;
        g.beginPath();
        if (role === "guard") g.arc(tx, ty, px(GUARD_REACH), 0, Math.PI * 2);
        else if (role === "sail") {
          g.moveTo(tx - 9, ty + 7); g.lineTo(tx, ty - 13); g.lineTo(tx + 9, ty + 7); g.closePath();
        } else {
          g.ellipse(tx, ty, 12, 6, this.t * 0.7, 0, Math.PI * 2);
        }
        g.stroke();
        if (nearTip) {
          g.font = `700 8px ${MONO}`; g.fillStyle = INK; g.textAlign = "center";
          g.fillText(role === "sail" ? "DASH RECOVERY" : role === "guard" ? "VOLLEY GUARD" : "FASTER BONDING", tx, ty - 21);
          g.textAlign = "left";
        }
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
      if (sym) {
        g.textAlign = "center";
        g.font = `700 11px ${MONO}`;
        g.fillStyle = live ? `rgb(${JADE})` : "rgba(160,220,240,0.7)";
        g.fillText(sym.symbol, px(body.x), px(body.y - body.extent) - 16);
        g.font = `600 8px ${MONO}`;
        g.fillStyle = FAINT;
        const limbs = limbsOf(body, pitch);
        const legs = limbs.filter((l) => l.leg).length;
        // WHAT YOU FED IT, AND WHAT THE LATTICE MADE OF IT. These differ for
        // seven of the eleven cells and the difference is the whole decision:
        // a 622 seats as a 222 and grows two arms where its own field throws
        // six. Drawn only when it actually differs, so the common case stays
        // quiet and the surprising one explains itself where it happens.
        const seated = seatedGroup(body.hm);
        const group = seated === body.hm ? body.hm : `${body.hm}→${seated}`;
        g.fillText(
          `${group}  ·  ${body.cells.length} CELLS`
          + `${limbs.length ? `  ·  ${limbs.length - legs} LIMBS` : ""}`
          + `${legs ? `  ·  ${legs} LEGS` : ""}`
          + `${live ? `  ·  ${walkSpeed(body, run.wave) > 0 ? "WALKING" : "IT WORKS ALONE"}` : ""}`,
          px(body.x), px(body.y - body.extent) - 5);
        g.textAlign = "left";
      }
    }
  }

  /** Small procedural silhouettes: shape carries role, colour still carries contrast. */
  private creature(x: number, y: number, r: number, form: string, rgb: string, angle: number, alpha = 1): void {
    const g = this.ctx;
    g.save();
    g.translate(x, y); g.rotate(angle);
    g.globalAlpha *= alpha;
    g.strokeStyle = `rgba(${rgb},0.85)`;
    g.fillStyle = `rgba(${rgb},0.16)`;
    g.lineWidth = 1.4;
    if (["faceter", "dislocator", "phason"].includes(form)) {
      const sides = form === "phason" ? 5 : form === "faceter" ? 4 : 6;
      const phase = form === "phason" ? this.run.resonance?.psi ?? 0 : 0;
      g.rotate(phase);
      g.beginPath();
      for (let i=0;i<sides;i++) { const a=i*Math.PI*2/sides; if(i)g.lineTo(Math.cos(a)*r,Math.sin(a)*r);else g.moveTo(Math.cos(a)*r,Math.sin(a)*r); }
      g.closePath();g.fill();g.stroke();
      if (form === "dislocator") { g.beginPath();g.moveTo(-r,0);g.lineTo(0,-r*.35);g.lineTo(r,r*.4);g.stroke(); }
    } else if (form === "warden" || form === "sentinel" || form === "husk") {
      // Articulated plates, open at the joints.
      for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3;
        g.beginPath();
        g.moveTo(Math.cos(a - 0.4) * r * 0.65, Math.sin(a - 0.4) * r * 0.65);
        g.lineTo(Math.cos(a - 0.28) * r, Math.sin(a - 0.28) * r);
        g.lineTo(Math.cos(a + 0.28) * r, Math.sin(a + 0.28) * r);
        g.lineTo(Math.cos(a + 0.4) * r * 0.65, Math.sin(a + 0.4) * r * 0.65);
        g.closePath(); g.fill(); g.stroke();
      }
    } else if (form === "weaver" || form === "ribbon" || form === "splitter") {
      // A bell and four independent, swimming tendrils.
      g.beginPath(); g.ellipse(0, -r * 0.15, r * 0.8, r * 0.52, 0, Math.PI, Math.PI * 2);
      g.quadraticCurveTo(r * 0.4, r * 0.45, -r * 0.8, -r * 0.15);
      g.fill(); g.stroke();
      for (let i = 0; i < 4; i++) {
        const tx = (i - 1.5) * r * 0.38;
        const sway = Math.sin(this.t * 3 + i * 1.7 + x * 0.01) * r * 0.3;
        g.beginPath(); g.moveTo(tx, 0);
        g.bezierCurveTo(tx + sway, r * 0.5, tx - sway, r, tx + sway * 0.5, r * 1.35);
        g.stroke();
      }
    } else {
      // Segmented swimmer, with four pairs of paddles.
      for (let i = 0; i < 4; i++) {
        const cy = (i - 1.5) * r * 0.43;
        const width = r * (0.65 - Math.abs(i - 1.5) * 0.1);
        g.beginPath(); g.ellipse(0, cy, width, r * 0.3, 0, 0, Math.PI * 2); g.fill(); g.stroke();
        for (const sign of [-1, 1]) {
          const kick = Math.sin(this.t * 5 + i) * r * 0.13;
          g.beginPath(); g.moveTo(sign * width * 0.8, cy);
          g.quadraticCurveTo(sign * r, cy + kick, sign * r * 0.9, cy + r * 0.27 + kick);
          g.stroke();
        }
      }
    }
    g.fillStyle = "rgba(240,255,255,0.9)";
    for (const sign of [-1, 1]) {
      g.beginPath(); g.arc(sign * r * 0.2, -r * 0.38, Math.max(1, r * 0.07), 0, Math.PI * 2); g.fill();
    }
    g.restore();
  }

  private drawOrganelles(): void {
    const run = this.run, g = this.ctx;
    const hosts = new Map(run.structures.map((s) => [s.id, s]));
    for (const o of run.organelles) {
      const host = hosts.get(o.hostId);
      if (!host || !this.onCamera(host.x, host.y, 100)) continue;
      const x = px(host.x), y = px(host.y);
      g.save();
      g.globalAlpha = host.serves.includes(run.layer) ? 1 : 0.25;
      const near = Math.hypot(host.x - run.you.x, host.y - run.you.y) < MITO_REACH;
      if (near) {
        g.setLineDash([3, 7]); g.strokeStyle = `rgba(${JADE},0.2)`;
        g.beginPath(); g.arc(x, y, px(MITO_REACH), 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
      }
      const cap = mitoCapacity(run);
      g.fillStyle = "#0a2628"; g.strokeStyle = `rgba(${JADE},${0.4 + Math.min(1, o.energy / cap) * 0.6})`;
      g.lineWidth = 2;
      g.beginPath(); g.ellipse(x, y, 21, 12, -0.35, 0, Math.PI * 2); g.fill(); g.stroke();
      g.lineWidth = 1;
      g.beginPath();
      for (let i = 0; i <= 8; i++) {
        const xx = x - 14 + i * 3.5;
        const yy = y + Math.sin(i * 2.2 + this.t * 0.6) * 6;
        if (i === 0) g.moveTo(xx, yy); else g.lineTo(xx, yy);
      }
      g.stroke();
      if (o.supplying) {
        g.strokeStyle = o.mending ? "rgba(255,201,74,0.7)" : `rgba(${JADE},0.65)`;
        g.setLineDash([2, 5]); g.lineDashOffset = -this.t * 16;
        g.beginPath(); g.moveTo(x, y); g.lineTo(px(run.you.x), px(run.you.y)); g.stroke();
        g.setLineDash([]); g.lineDashOffset = 0;
      }
      g.font = `700 8px ${MONO}`; g.textAlign = "center";
      g.fillStyle = o.mending ? GOLD : `rgb(${JADE})`;
      g.fillText(o.mending ? `ATP → MEND ${Math.round(run.fray.repair)}/${Math.round(repairCost(run))}`
        : o.supplying ? "ATP → STAMINA" : `MITO ${Math.round(o.energy)}/${Math.round(cap)}`, x, y + 19);
      g.restore();
    }
  }

  private drawCompanion(): void {
    const run = this.run, c = companion(run);
    if (!c) return;
    const g = this.ctx;
    const ally = run.bond.ally;
    const orbit = this.t * 0.5;
    const x = ally ? px(ally.x) : px(run.you.x) + Math.cos(orbit) * 36;
    const y = ally ? px(ally.y) : px(run.you.y) + Math.sin(orbit) * 27;
    const rgb = warmth(selfContrast(run.you, run.wave));
    const target = ally && ally.target >= 0
      ? run.entities.find((e) => e.id === ally.target) : undefined;
    let heading = Math.sin(orbit) * 0.2;
    if (target && ally) {
      // WHAT IT IS DOING, drawn on the thing it is doing it to: a dart line on
      // its way, a tether for a Weaver, and the hold filling like your own.
      const tx = px(target.x), ty = px(target.y);
      heading = Math.atan2(ty - y, tx - x) + Math.PI / 2;
      if (c.form === "weaver") {
        const dx = tx - x, dy = ty - y, len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len, ny = dx / len;
        g.strokeStyle = `rgba(${JADE},${ally.holding ? 0.8 : 0.3})`;
        g.lineWidth = ally.holding ? 1.6 : 1;
        g.beginPath();
        for (let i = 0; i <= 12; i++) {
          const f = i / 12;
          const wob = Math.sin(f * Math.PI) * Math.sin(this.t * 9 + f * 8) * (ally.holding ? 2 : 5);
          const qx = x + dx * f + nx * wob, qy = y + dy * f + ny * wob;
          if (i === 0) g.moveTo(qx, qy); else g.lineTo(qx, qy);
        }
        g.stroke();
      } else if (!ally.holding) {
        g.strokeStyle = `rgba(${JADE},0.4)`;
        g.setLineDash([3, 4]);
        g.beginPath(); g.moveTo(x, y); g.lineTo(tx, ty); g.stroke();
        g.setLineDash([]);
      }
      if (ally.holding) {
        const f = Math.min(1, (target.seized ?? 0) / beast(target.species).hold);
        g.strokeStyle = `rgb(${JADE})`;
        g.lineWidth = 2.2;
        g.beginPath();
        g.arc(tx, ty, Math.max(2.4, px(particleOf(target).radius)) + 11,
          -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2);
        g.stroke();
      }
    } else {
      g.strokeStyle = `rgba(${JADE},0.3)`;
      g.setLineDash([2, 4]); g.beginPath();
      g.moveTo(px(run.you.x), px(run.you.y)); g.lineTo(x, y); g.stroke(); g.setLineDash([]);
    }
    this.creature(x, y, 10 + c.rank, c.form, rgb, heading);
    if (c.form === "warden" && run.t >= run.bond.shieldReadyAt) {
      g.strokeStyle = "rgba(255,201,74,0.55)";
      g.beginPath(); g.arc(px(run.you.x), px(run.you.y), 28, 0, Math.PI * 2); g.stroke();
    }
  }

  private drawJourney(): void {
    const run = this.run, g = this.ctx;
    const G = this.pad.connected ? GLYPH.pad : GLYPH.keys;
    const c = companion(run);
    const x = VIEW_W - 286, y = 122;
    const tall = c ? 96 : 76;
    g.fillStyle = "rgba(6,17,28,0.86)"; g.fillRect(x, y, 230, tall);
    g.fillStyle = `rgb(${JADE})`; g.fillRect(x, y, 2, tall);
    g.textAlign = "left"; g.font = `700 9px ${MONO}`;
    g.fillText(c ? `${ADAPTATIONS[c.form].name} · BOND ${c.rank}/3` : "GROW · EXPLORE · BOND", x + 10, y + 10);
    g.fillStyle = INK; g.font = `600 8px ${MONO}`;
    if (run.phase === "reign") {
      g.fillText(`${ADAPTATIONS[formFor(run.world.aeon)].name} · WEAKEN TO ${Math.round(tameHealth(run) * 100)}%`, x + 10, y + 28);
      g.fillText(`THEN HOLD ${G.crown} NEARBY TO TAME`, x + 10, y + 43);
      g.fillText(`GIFT: ${ADAPTATIONS[formFor(run.world.aeon)].gift}`, x + 10, y + 58);
    } else {
      g.fillText(`${run.organelles.length} MITOCHONDRIA · ${run.bond.companions.length}/3 COMPANIONS`, x + 10, y + 28);
      g.fillText(`HOLD ${G.place} ON A STRUCTURE`, x + 10, y + 43);
      const costs = run.cells.length >= 2
        ? `${run.cells[this.selected]?.group.hm ?? run.cells[0].group.hm} + ${run.cells[(this.selected + 1) % run.cells.length].group.hm}`
        : "NEEDS 2 CELLS";
      g.fillText(`COST: ${costs} · SELECTED + NEXT`, x + 10, y + 58);
    }
    if (this.buildHeld > 0) {
      bar(g, x + 10, y + 68, 206, 3, Math.min(1, this.buildHeld / 0.85), `rgb(${JADE})`, "");
    }
    const host = organelleHost(run);
    if (host && !run.organelles.some((o) => o.hostId === host.id)) {
      g.fillStyle = DIM; g.fillText("HOST IN REACH", x + 130, y + 10);
    }
    // THE CALL, and when it is back. A cooldown with no readout is a button
    // that seems to work at random.
    if (c) {
      const wait = callWait(run);
      const full = callCooldown(run, c.rank);
      g.font = `700 8px ${MONO}`;
      g.fillStyle = wait > 0 ? DIM : GOLD;
      g.fillText(wait > 0
        ? `${G.call} ${CALLS[c.form].name} · ${wait.toFixed(0)} S`
        : `${G.call} ${CALLS[c.form].name} READY`, x + 10, y + 78);
      bar(g, x + 110, y + 80, 106, 3, 1 - wait / Math.max(1, full), wait > 0 ? DIM : GOLD, "");
    }
  }

  private drawStructures(): void {
    const g = this.ctx;
    const run = this.run;
    const k = run.throne;
    const fighting = run.phase === "reign" && k.awake && k.hp > 0;
    const organelleIds = new Set([...run.organelles.map((o) => o.hostId), ...constructIds(run)]);

    for (const s of run.structures) {
      if (organelleIds.has(s.id)) continue;
      // CULLED, which it never was. A player with 212 buildings was drawing
      // every one of them every frame, most of them off screen — and each one
      // built a radial gradient PER LOBE, so a six-lobed crystal came to about
      // two and a half thousand gradient objects a frame. The report was "it
      // starts to lag when the screen is full". The margin is a full arm, so a
      // building whose cone reaches into the view is still drawn.
      // IN PLAY, meaning its arm can actually reach the king from here. During
      // a fight EVERY building drew its cones, which at 353 of them is both a
      // gradient and four filled wedges apiece for buildings that could not
      // touch the king from where they stand — slow, and telling the player
      // nothing. The handful whose arms reach it is the actual information.
      const inPlay = fighting
        && Math.hypot(s.x - k.x, s.y - k.y) < s.reach * LOBE_RANGE;
      // and the wide margin is only needed by the ones drawing a cone
      const margin = inPlay ? px(s.reach * LOBE_RANGE) + 40 : px(s.reach) * 2 + 40;
      if (!this.onCamera(s.x, s.y, margin)) continue;
      const x = px(s.x), y = px(s.y);
      const R = px(s.reach);
      const rgb = s.ruin ? "110,140,160" : JADE;
      const a = s.ruin ? 0.4 : 0.85;

      // WHERE THIS BUILDING ACTUALLY REACHES. Its arms carry seven times its
      // holding radius, and until these were drawn the player was shown a
      // forty-micron stub and handed a three-hundred-micron gun — which makes
      // the only decision in the fight, where the king is standing, invisible.
      // A building cannot be aimed. The king can.
      if (inPlay) {
        const live = bearsOn(s, k.x, k.y);
        const far = px(s.reach * LOBE_RANGE);
        // ONE GRADIENT, NOT ONE PER ARM. It is centred on the building and
        // depends on nothing the loop below changes, so every arm of a
        // six-lobed crystal was building an identical object and throwing it
        // away.
        const cone = g.createRadialGradient(x, y, R * 0.6, x, y, far);
        cone.addColorStop(0, `rgba(${rgb},${live ? 0.3 : 0.075})`);
        cone.addColorStop(1, "rgba(0,0,0,0)");
        for (const [dx, dy] of s.lobes) {
          const th = Math.atan2(dy, dx);
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
        // A flat disc rather than a gradient per arm tip. At twenty microns
        // across the falloff was invisible and it was another gradient object
        // per lobe per building per frame.
        const cr = R * HOLD_CATCH;
        g.fillStyle = `rgba(${rgb},${(a * 0.07).toFixed(3)})`;
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
        // WHAT THIS SHOT IS ACTUALLY WORTH, before you spend it. Damage falls
        // off across the arm and the only feedback was the -9 that floated up
        // afterwards, by which time the building was gone. A player fired seven
        // and could not work out why the bar was not moving.
        if (loaded && inPlay && bearsOn(s, k.x, k.y)) {
          const worth = Math.round(s.strength * DISCHARGE_GAIN * dischargeFalloff(s, k.x, k.y));
          const best = s.strength * DISCHARGE_GAIN;
          g.fillStyle = worth > best * 0.5 ? "#8ce9ff" : "#ffa24a";
          g.font = `700 9px ${MONO}`;
          g.textAlign = "center";
          g.fillText(`-${worth}  OF ${best}`, x, y - R - 8);
          g.textAlign = "left";
        }
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
      // Wrapped into [0,1) rather than left to `%`, which is signed. This is
      // the arc that threw; the radius below is 8 + phase * 34 and a phase of
      // -0.3 is a circle with a negative radius, which the canvas refuses.
      const raw = (this.t * (1.1 + near * 3.4) + i * 0.25) % 1;
      const phase = raw < 0 ? raw + 1 : raw;
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
    const x = 18, y = 150, w = 232, h = 11;
    g.fillStyle = "rgba(6,17,28,0.86)";
    g.fillRect(x - 8, y - 23, w + 16, 90);

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
    wrap(g, b.free ? "FREED - IT GOES WITH YOU" : advice(run.crystal, run.gap, b.omega),
      x, y + h + 20, w, 11);
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
  /**
   * The water's own circulation, which was never drawn at all.
   *
   * `world.current` is a single cell spanning the pool — zero in the middle,
   * fastest at the walls, turning over — and it grows 1.4 um/s an aeon, so by
   * the fifth it is 16 um/s. That is a real fraction of what a player can do
   * about it, and there has never been a mark on screen for it. The wash behind
   * everything draws the acoustic FIELD; the chip draws its own jets; this was
   * simply absent, and a player reported being "drawn in a direction i couldnt
   * figure out".
   *
   * Drawn as what it is: short marks lying along the flow, brighter where it is
   * faster, sliding so that it reads as water rather than as hatching. Nothing
   * here is decoration — every mark is `currentAt` sampled at that spot, which
   * is the same function that moves you and everything else.
   */
  /**
   * What the water is doing to the light.
   *
   * NOT A FILTER OVER A GAME. Everything bright on this screen is bright
   * because energy is being put into it — the field where the drive is
   * strongest, a node holding a body, a building discharging, a king winding
   * up — and light spilling off those is what an intense field looks like
   * through a fluid. So the glow is taken from the frame that was just drawn
   * and added back, which means it can only ever say what was already there.
   *
   * It answers to the drive, because the energy density does: `w.amplitude`
   * over its maximum, the same p^2 quantity the stamina cost, the streaming
   * speed and the heating all go as. Gripping does not merely move you faster,
   * it makes the water blaze.
   *
   * Taken before the vignette and the HUD, so the interface stays crisp and
   * only the world blooms.
   */
  /**
   * Whether this browser can blur on a canvas.
   *
   * Checked rather than assumed, because the failure is not "no glow" — an
   * unsupported `filter` is silently ignored, and the bloom would then add a
   * sharp copy of the frame on top of itself and wash the whole screen out.
   * Worse than not having it.
   */
  private readonly canBlur: boolean = (() => {
    try {
      const c = document.createElement("canvas").getContext("2d");
      if (!c) return false;
      c.filter = "blur(2px)";
      return c.filter !== "none" && c.filter !== "";
    } catch { return false; }
  })();

  private bloom(): void {
    if (!this.canBlur) return;
    const g = this.ctx;
    const gc = this.glowCtx;
    const w = this.run.wave;
    const lit = w.maxAmplitude > 0 ? w.amplitude / w.maxAmplitude : 0;

    gc.globalCompositeOperation = "source-over";
    gc.clearRect(0, 0, GLOW_W, GLOW_H);
    // brightness first so the dark stays dark and only the lit smears; the blur
    // radius is in buffer pixels, so it is three times this on screen.
    gc.filter = "brightness(1.10) saturate(1.08) blur(4px)";
    gc.drawImage(this.canvas, 0, 0, VIEW_W, VIEW_H, 0, 0, GLOW_W, GLOW_H);
    gc.filter = "none";

    g.save();
    g.globalCompositeOperation = "lighter";
    g.globalAlpha = BLOOM_REST + lit * BLOOM_DRIVE;
    g.imageSmoothingEnabled = true;
    g.drawImage(this.glowCanvas, 0, 0, GLOW_W, GLOW_H, 0, 0, VIEW_W, VIEW_H);
    g.restore();
  }

  private drawCurrent(): void {
    const run = this.run;
    if (run.world.current <= 0) return;
    const g = this.ctx;
    const b = run.bounds;
    const gap = 58;
    const x0 = Math.floor(this.cam.x / gap) * gap;
    const y0 = Math.floor(this.cam.y / gap) * gap;

    g.lineCap = "round";
    for (let sx = x0; sx < this.cam.x + VIEW_W + gap; sx += gap) {
      for (let sy = y0; sy < this.cam.y + VIEW_H + gap; sy += gap) {
        const wx = mx(sx), wy = mx(sy);
        if (wx < b.x || wx > b.x + b.w || wy < b.y || wy > b.y + b.h) continue;
        const c = currentAt(run, wx, wy);
        const u = Math.hypot(c.x, c.y);
        const f = u / run.world.current;
        if (f < 0.06) continue;
        const ux = c.x / u, uy = c.y / u;
        // A mark that slides along its own direction and fades at both ends, so
        // the eye reads a flow rather than a grid.
        const rawPh = (this.t * 0.34 + (sx * 7 + sy * 13) * 0.0007) % 1;
        const ph = rawPh < 0 ? rawPh + 1 : rawPh;
        const travel = gap * 0.8;
        const cx = sx + ux * (ph - 0.5) * travel;
        const cy = sy + uy * (ph - 0.5) * travel;
        const len = 5 + 13 * f;
        const a = 0.30 * f * Math.sin(Math.PI * ph);
        if (a < 0.012) continue;
        g.strokeStyle = `rgba(120,170,205,${a.toFixed(3)})`;
        g.lineWidth = 1 + f;
        g.beginPath();
        g.moveTo(cx - ux * len * 0.5, cy - uy * len * 0.5);
        g.lineTo(cx + ux * len * 0.5, cy + uy * len * 0.5);
        g.stroke();
      }
    }
  }

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
    const markX = cx + Math.cos(a) * d, markY = cy + Math.sin(a) * d;

    const awake = k.awake && k.hp > 0;
    const rgb = awake ? "255,90,90" : "255,201,74";
    const pulse = 0.55 + 0.45 * Math.sin(this.t * (awake ? 6 : 2.4));

    g.save();
    g.translate(markX, markY);
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
      const weapons = run.structures.length - run.organelles.length + run.cells.length;
      const beyond = !Number.isFinite(need) || need > weapons;
      g.font = `700 9px ${MONO}`;
      g.fillStyle = beyond ? RED : GOLD;
      g.fillText(
        `FED ${run.throne.fed.length}  ·  ${run.throne.maxHp} HP  ·  `
        + `${Number.isFinite(need) ? `${need} DISCHARGES` : "NOTHING CAN KILL IT"}`,
        x, y - R - 26);
      if (beyond) {
        g.fillStyle = RED;
        g.font = `600 8px ${MONO}`;
        g.fillText(`YOU HAVE ${weapons}`, x, y - R - 37);
      }

      // AND WHAT THE FEEDING BOUGHT, which nothing said until the king was
      // already dead and the epitaph came up. Only the cost was ever on screen
      // — more hit points, more discharges — so feeding as little as possible
      // was the rational read, and it compounds: a player reached the fourth
      // aeon with a four-cell body and none of the chip in reach, every world
      // poorer than the last, with no line anywhere connecting the two.
      const keep = inheritanceOf(run.throne);
      let line = beyond ? 50 : 39;
      g.font = `700 9px ${MONO}`;
      g.fillStyle = keep < 0.2 ? "#ffa24a" : JADE;
      g.fillText(
        `NEXT WORLD KEEPS ${(keep * 100).toFixed(0)}% OF WHAT YOU BUILD`,
        x, y - R - line);
      line += 11;

      // AND WHETHER IT IS STILL MOVING, which the line above cannot say. It
      // reads 60% and goes on reading 60% forever — the inheritance is clamped
      // there from mass 30 — so the one benefit the throne has ever shown looks
      // identical whether the next helping buys it or not.
      //
      // `nextHelpingBuys` asks the world's own functions what would actually
      // change. Every answer is clamped and the clamps are near: a sixfold
      // throne has bought everything there is to buy by its FOURTH helping. The
      // hit points are the one thing with no clamp on them. A play report of
      // 2026-09-06 fed a sixfold throne fifty helpings, woke 5850 hit points,
      // landed ninety-eight discharges and died to it — forty-six of those
      // helpings bought nothing, and every number on this panel up to that
      // moment was either a cost or a percentage that had stopped moving.
      const hand = run.cells[this.selected] ?? run.cells[0];
      if (hand) {
        const buys = nextHelpingBuys(run.throne, hand, run.world.aeon);
        const cost = helpingCosts(run.throne, hand);
        // WHICH NUMBER THE NEXT ONE MAKES. The prime boon is decidable before
        // you commit or it is not a decision.
        const next = run.throne.fed.length + 1;
        if (isPrime(next)) {
          g.font = `700 9px ${MONO}`;
          g.fillStyle = GOLD;
          g.fillText(`THE NEXT MAKES ${next}  ·  PRIME  ·  +${(PRIME_KEEP * 100).toFixed(0)}% KEPT`
            + `${primeCards(run) < 3 ? "  ·  +1 CARD" : ""}`, x, y - R - line);
          line += 11;
        }
        g.font = `700 9px ${MONO}`;
        if (buys.length === 0) {
          g.fillStyle = RED;
          g.fillText(`SATED  ·  ANOTHER ${hand.group.hm} IS +${cost} HP AND NOTHING ELSE`,
            x, y - R - line);
        } else {
          g.fillStyle = JADE;
          g.fillText(
            `ONE MORE ${hand.group.hm}: +${cost} HP BUYS ${buys.slice(0, 2).join(" + ")}`
            + `${buys.length > 2 ? `  +${buys.length - 2} MORE` : ""}`,
            x, y - R - line);
        }
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
        this.creature(x, y, r * 1.8, e.species, rgb, Math.atan2(this.run.you.y - e.y, this.run.you.x - e.x) + Math.PI / 2);
        g.fillStyle = `rgb(${rgb})`;
        g.beginPath(); g.arc(x, y, r * 0.6, 0, Math.PI * 2); g.fill();
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
    if (!k.awake || k.hp <= 0 || this.run.phase !== "reign") return;
    const g = this.ctx;
    const p = sovereignParticle(k);
    const x = px(k.x), y = px(k.y);
    const r = px(p.radius);
    const form = formFor(this.run.world.aeon);
    const rgb = warmth(contrastFactor(p, waterAt(this.run, k.y)));
    this.creature(x, y, r * 1.8, form, rgb, k.spin, 0.65);
    const G = this.pad.connected ? GLYPH.pad : GLYPH.keys;
    g.font = `700 10px ${MONO}`;
    g.fillStyle = INK;
    g.textAlign = "center";
    g.fillText(ADAPTATIONS[form].name, x, y - r - 57);
    if (faltering(this.run)) {
      // IT IS OPEN. Said loudly, because it lasts two and a half seconds and it
      // is the only moment in a fight when bonding is actually on offer.
      const f = this.run.fray.falter / FALTER_TIME;
      g.strokeStyle = `rgb(${JADE})`;
      g.lineWidth = 3;
      g.beginPath();
      g.arc(x, y, r + 16, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2);
      g.stroke();
      g.strokeStyle = `rgba(${JADE},${(0.25 + 0.35 * Math.sin(this.t * 9)).toFixed(2)})`;
      g.lineWidth = 2;
      g.beginPath(); g.arc(x, y, r + 24, 0, Math.PI * 2); g.stroke();
      g.fillStyle = `rgb(${JADE})`;
      g.font = `700 12px ${MONO}`;
      g.textAlign = "center";
      g.fillText("IT FALTERS", x, y - r - 68);
      g.textAlign = "left";
    }
    if (vulnerable(k, tameHealth(this.run))) {
      g.strokeStyle = `rgba(${JADE},0.25)`;
      g.setLineDash([4, 6]);
      g.beginPath(); g.arc(x, y, px(TAME_REACH), 0, Math.PI * 2); g.stroke();
      g.setLineDash([]);
      g.fillStyle = `rgb(${JADE})`;
      g.fillText(canBond(this.run) ? `HOLD ${G.crown} TO BOND` : "WEAKENED · APPROACH TO BOND", x, y + r + 35);
      bar(g, x - 55, y + r + 50, 110, 5, this.run.bond.progress / tameTime(this.run), `rgb(${JADE})`, "");
    }
    g.textAlign = "left";

    const glow = g.createRadialGradient(x, y, 0, x, y, r * 4);
    glow.addColorStop(0, `rgba(${rgb},0.34)`);
    glow.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = glow;
    g.beginPath(); g.arc(x, y, r * 4, 0, Math.PI * 2); g.fill();

    // Your bare hand on it. The same condition the damage is applied under, so
    // what is drawn is never a flattering account of what is happening.
    if (wearing(this.run) && !this.intent?.crownDown) {
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
    // stand in the gaps between them. A charge or a shock throws no arms, so
    // it draws none: it draws the lane or the ring instead.
    const fray = this.run.fray;
    const windLen = windLength(this.run);
    const wind = Math.max(0, (windLen - k.beat) / windLen);
    const plain = fray.next !== "charge" && fray.next !== "shock";
    if (wind > 0 && !plain) this.drawGambitWind(x, y, r, wind);
    if (wind > 0 && fray.next === "echo") this.drawEcho(x, y, echoArms(this.run), wind, 0.5);
    if (fray.echo) this.drawEcho(x, y, fray.echo.arms, 1, 0.85);
    if (wind > 0 && plain) {
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

    // A charge leaves a wake; the daze after it and a snare are both a king
    // that is not moving itself, and both are drawn as such.
    if (fray.charge > 0 && fray.lane) {
      g.strokeStyle = `rgba(${rgb},0.35)`;
      g.lineWidth = r * 1.2;
      g.lineCap = "round";
      g.beginPath();
      g.moveTo(x - fray.lane.dx * 40, y - fray.lane.dy * 40); g.lineTo(x, y);
      g.stroke();
      g.lineCap = "butt";
    }
    if (fray.daze > 0) {
      g.fillStyle = "rgba(255,240,160,0.85)";
      for (let i = 0; i < 3; i++) {
        const a2 = this.t * 4 + (i * Math.PI * 2) / 3;
        g.beginPath(); g.arc(x + Math.cos(a2) * (r + 9), y - r - 4 + Math.sin(a2) * 4, 2, 0, Math.PI * 2); g.fill();
      }
      g.font = `700 8px ${MONO}`; g.textAlign = "center";
      g.fillText("DAZED", x, y + r + 26);
      g.textAlign = "left";
    }
    if (fray.snare > 0) {
      g.strokeStyle = `rgba(${JADE},0.55)`;
      g.lineWidth = 1;
      for (let i = 0; i < 8; i++) {
        const a2 = (i * Math.PI) / 4 + 0.2;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a2) * (r + 18), y + Math.sin(a2) * (r + 18)); g.stroke();
      }
      for (const rr of [r + 7, r + 13, r + 18]) {
        g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2); g.stroke();
      }
      g.fillStyle = `rgb(${JADE})`;
      g.font = `700 8px ${MONO}`; g.textAlign = "center";
      g.fillText(`SNARED ${fray.snare.toFixed(1)}S`, x, y + r + 26);
      g.textAlign = "left";
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
    // WHERE IT CAN BE TAMED, on the bar itself. A report came back at 772 of
    // 2310 — thirty-three per cent, three points above the line — with no mark
    // anywhere saying how close that was.
    const share = tameHealth(this.run);
    g.fillStyle = `rgb(${JADE})`;
    g.fillRect(x - w / 2 + w * share - 1, y - r - 25, 2, 11);

    // WHAT WOULD ACTUALLY MOVE THAT BAR. `drawThrone` prints "N DISCHARGES TO
    // KILL" while you are feeding it and then returns early the moment it wakes
    // — so the one actionable number in the game vanished at exactly the point
    // it became actionable. A report came back with 306 buildings standing, a
    // king at 150/150, and not one discharge event in the whole run: that fight
    // needed TWO of them, and was instead fought by hand for nine minutes
    // against a thing that heals 0.9 hp/s off the buildings it eats.
    const need = dischargesToKill(this.run);
    const organelleIds = new Set([...this.run.organelles.map((o) => o.hostId), ...constructIds(this.run)]);
    const bearing = this.run.structures.filter((st) => !organelleIds.has(st.id) && bearsOn(st, k.x, k.y)).length;
    g.font = `700 9px ${MONO}`;
    g.textAlign = "center";
    g.fillStyle = bearing > 0 ? "#8ce9ff" : "rgba(255,255,255,0.45)";
    g.fillText(
      Number.isFinite(need)
        ? `${need} DISCHARGE${need === 1 ? "" : "S"} TO KILL`
        : k.anchored ? "BUILD STRUCTURES TO WEAKEN IT" : "GRIP TO WEAKEN · BUILD TO DISCHARGE",
      x, y - r - 30);
    g.fillStyle = bearing > 0 ? "#8ce9ff" : "#ff5a5a";
    g.font = `700 8px ${MONO}`;
    g.fillText(
      bearing > 0
        ? `${bearing} OF YOUR BUILDINGS BEAR ON IT  ·  ${G.grip} ONE TO FIRE IT`
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
    const run = this.run;
    const you = run.you;
    // WHEN A BURST WOULD CATCH IT. Shown only while a burst is actually
    // available, on arms that are closing on you, brightest at the reach where
    // a catch happens — so the cue is never a promise the pilot cannot keep.
    const ready = you.dash <= 0 && you.dashCool <= 0 && !run.wave.spent
      && run.wave.stamina >= DASH_COST;
    const cue = 70e-6;
    for (const b of run.bolts) {
      if (!this.onCamera(b.x, b.y, 40)) continue;
      const x = px(b.x), y = px(b.y);
      const a = Math.min(1, b.life);
      if (b.thrown) {
        g.strokeStyle = `rgba(255,201,74,${(a * 0.9).toFixed(2)})`;
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(x - b.vx * PX * 0.05, y - b.vy * PX * 0.05);
        g.lineTo(x, y);
        g.stroke();
        g.fillStyle = `rgba(255,245,200,${a.toFixed(2)})`;
        g.beginPath(); g.arc(x, y, 3.2, 0, Math.PI * 2); g.fill();
        continue;
      }
      if (ready) {
        const dx = you.x - b.x, dy = you.y - b.y;
        const d = Math.hypot(dx, dy);
        if (d < cue && dx * b.vx + dy * b.vy > 0) {
          const f = 1 - Math.max(0, d - catchReach(run)) / (cue - catchReach(run));
          g.strokeStyle = `rgba(255,201,74,${(0.2 + 0.7 * f).toFixed(2)})`;
          g.lineWidth = 1.4;
          g.beginPath(); g.arc(x, y, 4 + (1 - f) * 9, 0, Math.PI * 2); g.stroke();
        }
      }
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

  /** A charge's lane or a shock's reach, for the whole of the wind-up. */
  private drawGambitWind(x: number, y: number, r: number, wind: number): void {
    const g = this.ctx;
    const fray = this.run.fray;
    if (fray.next === "charge" && fray.lane) {
      const len = px(chargeLength()) + r;
      const half = px(chargeReach(this.run.throne));
      g.save();
      g.translate(x, y);
      g.rotate(Math.atan2(fray.lane.dy, fray.lane.dx));
      g.fillStyle = `rgba(255,120,150,${(0.06 + wind * 0.2).toFixed(3)})`;
      g.fillRect(0, -half, len, half * 2);
      g.strokeStyle = `rgba(255,120,150,${(0.3 + wind * 0.5).toFixed(3)})`;
      g.lineWidth = 1.2;
      g.strokeRect(0, -half, len, half * 2);
      // chevrons marching down it, so it reads as a direction and not a wall
      g.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        const raw = (this.t * 1.6 + i / 4) % 1;
        const u = (raw < 0 ? raw + 1 : raw) * len;
        g.beginPath(); g.moveTo(u - 6, -half * 0.5); g.lineTo(u, 0); g.lineTo(u - 6, half * 0.5); g.stroke();
      }
      g.restore();
      g.fillStyle = `rgba(255,150,175,${(0.5 + wind * 0.5).toFixed(2)})`;
      g.font = `700 9px ${MONO}`; g.textAlign = "center";
      g.fillText("CHARGE  ·  STEP OFF THE LANE", x + fray.lane.dx * len * 0.6, y + fray.lane.dy * len * 0.6 - half - 6);
      g.textAlign = "left";
    }
    if (fray.next === "shock") {
      const R = px(shockReach(this.run.throne));
      g.strokeStyle = `rgba(255,120,150,${(0.3 + wind * 0.55).toFixed(3)})`;
      g.lineWidth = 1.5;
      g.setLineDash([6, 6]);
      g.beginPath(); g.arc(x, y, R, 0, Math.PI * 2); g.stroke();
      g.setLineDash([]);
      g.lineWidth = 3;
      g.beginPath(); g.arc(x, y, r + 4 + (1 - wind) * 30, 0, Math.PI * 2); g.stroke();
      g.fillStyle = `rgba(255,150,175,${(0.5 + wind * 0.5).toFixed(2)})`;
      g.font = `700 9px ${MONO}`; g.textAlign = "center";
      g.fillText("SHOCK  ·  GET OUTSIDE THE RING", x, y - R - 8);
      g.textAlign = "left";
    }
  }

  /** An echo's second set: dashed while it waits, and it waits in plain sight. */
  private drawEcho(x: number, y: number, arms: ReadonlyArray<readonly [number, number]>, wind: number, alpha: number): void {
    const g = this.ctx;
    g.strokeStyle = `rgba(200,160,255,${(alpha * (0.35 + 0.5 * wind)).toFixed(3)})`;
    g.lineWidth = 1.5;
    g.setLineDash([5, 5]);
    for (const [dx, dy] of arms) {
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + dx * 240 * wind, y + dy * 240 * wind);
      g.stroke();
    }
    g.setLineDash([]);
  }

  /** Shock fronts on their way out, and where they stop. */
  private drawGambits(): void {
    const fray = this.run.fray;
    if (fray.rings.length === 0) return;
    const g = this.ctx;
    for (const ring of fray.rings) {
      const x = px(ring.x), y = px(ring.y);
      const f = Math.min(1, ring.r / ring.max);
      g.strokeStyle = `rgba(255,120,150,${(0.9 - f * 0.5).toFixed(3)})`;
      g.lineWidth = 4;
      g.beginPath(); g.arc(x, y, px(ring.r), 0, Math.PI * 2); g.stroke();
      g.strokeStyle = "rgba(255,120,150,0.25)";
      g.lineWidth = 1;
      g.setLineDash([6, 6]);
      g.beginPath(); g.arc(x, y, px(ring.max), 0, Math.PI * 2); g.stroke();
      g.setLineDash([]);
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

    const form = companion(run)?.form ?? "strider";
    const heading = Math.atan2(run.aim.y - you.y, run.aim.x - you.x) + Math.PI / 2;
    this.creature(x, y, r * 1.65, form, rgb, heading);
    g.fillStyle = `rgba(${rgb},0.6)`;
    g.beginPath(); g.arc(x, y, r * 0.65, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "#eaffff";
    g.lineWidth = 1.4;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();

    // THE CATCH WINDOW, while it is open: anything inside this ring now goes back.
    if (you.iframe > 0) {
      const ready = run.t >= run.fray.catchReadyAt;
      g.strokeStyle = ready
        ? `rgba(255,201,74,${(0.35 + you.iframe * 3).toFixed(3)})`
        : `rgba(130,150,170,${(0.25 + you.iframe * 2).toFixed(3)})`;
      g.lineWidth = 1.4;
      g.setLineDash([2, 3]);
      g.beginPath(); g.arc(x, y, px(catchReach(run)), 0, Math.PI * 2); g.stroke();
      g.setLineDash([]);
    }
    // AND WHEN IT CAN THROW AGAIN. A catch inside the recovery still eats the
    // arm, so this says what was lost rather than what went wrong.
    const cool = run.fray.catchReadyAt - run.t;
    if (cool > 0 && run.phase === "reign") {
      g.strokeStyle = "rgba(255,201,74,0.5)";
      g.lineWidth = 2;
      g.beginPath();
      g.arc(x, y, r + 9, -Math.PI / 2, -Math.PI / 2 + (1 - cool / RIPOSTE_COOL) * Math.PI * 2);
      g.stroke();
    }
    if (rushing(run)) {
      g.strokeStyle = `rgba(255,201,74,${(0.35 + 0.25 * Math.sin(this.t * 14)).toFixed(3)})`;
      g.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        const a2 = this.t * 3 + (i * Math.PI) / 3;
        g.beginPath(); g.arc(x, y, r + 11, a2, a2 + 0.5); g.stroke();
      }
    }
    if (shielded(run)) {
      g.strokeStyle = "rgba(255,201,74,0.75)";
      g.fillStyle = "rgba(255,201,74,0.08)";
      g.lineWidth = 2;
      g.beginPath();
      for (let i = 0; i <= 6; i++) {
        const a2 = (i * Math.PI) / 3 + this.t;
        const hx = x + Math.cos(a2) * (r + 16), hy = y + Math.sin(a2) * (r + 16);
        if (i === 0) g.moveTo(hx, hy); else g.lineTo(hx, hy);
      }
      g.fill(); g.stroke();
    }

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

  /**
   * The cell you left standing, and how long it has left.
   *
   * Drawn as something that is singing rather than something that is there: a
   * ring at the pitch of the drive, a count, and a line to whatever is walking
   * toward it — because a decoy nothing answered would be a wasted cell and
   * the player has to be able to see that it worked.
   */
  private drawLure(): void {
    const run = this.run;
    const l = run.lure;
    if (!l) return;
    const g = this.ctx;
    const left = Math.max(0, l.until - run.t);
    const f = left / LURE_TIME;
    const x = px(l.x), y = px(l.y);
    for (let i = 0; i < 3; i++) {
      const raw = (this.t * 1.6 + i / 3) % 1;
      const phase = raw < 0 ? raw + 1 : raw;
      g.strokeStyle = `rgba(${NODE},${((1 - phase) * 0.5 * f).toFixed(3)})`;
      g.lineWidth = 1.4;
      g.beginPath(); g.arc(x, y, 5 + phase * 26, 0, Math.PI * 2); g.stroke();
    }
    g.fillStyle = `rgba(${NODE},${(0.5 + 0.4 * f).toFixed(2)})`;
    g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill();
    g.strokeStyle = `rgb(${NODE})`;
    g.lineWidth = 2;
    g.beginPath(); g.arc(x, y, 9, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2); g.stroke();
    g.font = `700 8px ${MONO}`;
    g.textAlign = "center";
    g.fillText(`LURE ${left.toFixed(1)}S`, x, y + 20);
    g.textAlign = "left";
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

  /**
   * How many rack slots fit between the readout panel and the right edge.
   *
   * THE RACK HAD NO WINDOW. It drew every cell in a row leftwards from the
   * corner, so the aeon-6 report's hundred cells ran four and a half thousand
   * pixels off the left of the screen, and the selected cell was usually one of
   * them. It now shows a window around the selection.
   */
  private static readonly RACK_SLOTS = 13;

  private rackWindow(): { first: number; count: number } {
    const n = this.run.cells.length;
    const count = Math.min(n, Game.RACK_SLOTS);
    const first = Math.max(0, Math.min(n - count, this.selected - Math.floor(count / 2)));
    return { first, count };
  }

  /** The rectangle of the j-th VISIBLE slot, counted from the right. */
  private slotRect(j: number): { x: number; y: number; w: number; h: number } {
    return { x: VIEW_W - 18 - (j + 1) * 46 + 6, y: VIEW_H - 62, w: 40, h: 44 };
  }

  private slotAt(sx: number, sy: number): number {
    if (this.screen !== "play") return -1;
    const { first, count } = this.rackWindow();
    for (let j = 0; j < count; j++) {
      const r = this.slotRect(j);
      if (sx >= r.x && sx <= r.x + r.w && sy >= r.y && sy <= r.y + r.h) return first + j;
    }
    return -1;
  }

  private drawResonanceStructures(): void {
    const s=this.run.resonance;if(!s)return;
    const g=this.ctx,hosts=new Map(this.run.structures.map(h=>[h.id,h]));
    for(const c of s.constructs) {
      if(c.layer!==this.run.layer||!this.onCamera(c.x,c.y,150))continue;
      g.strokeStyle=c.kind==="ward"?"#aeb4ff":c.kind==="loom"?"#ffcf78":"#78e1f5";
      g.lineWidth=1.5;g.beginPath();
      c.ids.forEach((id,i)=>{const h=hosts.get(id);if(!h)return;if(i)g.lineTo(px(h.x),px(h.y));else g.moveTo(px(h.x),px(h.y));});
      if(c.kind==="ward")g.closePath();g.stroke();
      g.globalAlpha=.15+.25*c.energy/40;g.beginPath();g.arc(px(c.x),px(c.y),px(FORGE_REACH),0,Math.PI*2);g.stroke();g.globalAlpha=1;
      g.font=`600 9px ${MONO}`;g.fillStyle=INK;g.textAlign="center";
      g.fillText(`${c.kind.toUpperCase()} ${c.energy.toFixed(0)}/40`,px(c.x),px(c.y)-14);g.textAlign="left";
    }
    if(this.forgeOpen && this.forgePick<3) {
      for(const at of blueprintSites(this.run,BLUEPRINTS[this.forgePick].kind,this.forgeRotation)) {
        if(!this.onCamera(at.x,at.y))continue;
        g.strokeStyle="#fff";g.setLineDash([3,3]);g.strokeRect(px(at.x)-9,px(at.y)-9,18,18);g.setLineDash([]);
      }
    }
  }
  private drawForge(): void {
    const g=this.ctx,s=this.run.resonance!;
    g.fillStyle="rgba(4,9,18,.94)";g.fillRect(45,75,VIEW_W-90,450);
    g.textAlign="left";g.textBaseline="top";g.fillStyle=GOLD;g.font=`700 18px ${MONO}`;
    g.fillText("CRYSTAL FORGE",70,95);
    g.font=`600 11px ${MONO}`;g.fillStyle=INK;
    g.fillText(`${s.fragments} FRAGMENTS · ${this.run.cells.length} CELLS · ${gapAligned(this.run)?"BAND GAP ALIGNED":"BAND GAP NOT ALIGNED"}`,70,127);
    const options=[...BLUEPRINTS.map(b=>`${b.name} · ${b.sites.length} cells + ${b.cost} fragments`),"WEAVE CELL · nearby loom + 15 charge + 1 fragment"];
    options.forEach((name,i)=>{
      g.fillStyle=i===this.forgePick?"#193b4c":"#0c1728";g.fillRect(65,155+i*50,VIEW_W-130,42);
      g.fillStyle=i===this.forgePick?"#fff":DIM;g.font=`600 11px ${MONO}`;g.fillText(`${i+1}. ${name}`,78,169+i*50);
    });
    g.fillStyle=INK;g.font=`500 11px ${MONO}`;
    const description=this.forgePick<3?BLUEPRINTS[this.forgePick].description:"The loom copies its seated host point group. Sixfold material on this square net produces 222, never a fictitious hexagonal crystal.";
    wrap(g,description,70,363,VIEW_W-250,17);
    if(this.forgePick<3) {
      const pitch=latticePitch(this.run);g.strokeStyle=GOLD;
      for(const at of blueprintSites(this.run,BLUEPRINTS[this.forgePick].kind,this.forgeRotation))
        g.strokeRect(VIEW_W-125+(at.x-this.run.you.x)/pitch*12,368+(at.y-this.run.you.y)/pitch*12,8,8);
      g.fillStyle=DIM;g.font=`500 9px ${MONO}`;g.fillText(`${this.forgeRotation*90}° · Y / C rotates`,VIEW_W-210,394);
    }
    g.fillStyle="#224d59";g.fillRect(65,410,VIEW_W-130,35);g.fillStyle="#fff";
    g.fillText("ASSEMBLE / WEAVE · A / X / ENTER / SPACE",80,421);
    g.fillStyle=GOLD;wrap(g,this.forgeMessage,70,451,VIEW_W-140,16);
    g.fillStyle=DIM;g.fillText("Q / B / D-PAD selects · V / L3 / LB / ESC closes · world paused",70,500);
  }

  private drawHud(): void {
    const g = this.ctx;
    const run = this.run;
    const w = run.wave;
    g.textBaseline = "top";

    for (let i = 0; i < maxIntegrity(run); i++) {
      const on = i < run.integrity;
      g.fillStyle = on ? (run.integrity === 1 ? RED : "#5ef0c0") : "rgba(255,255,255,0.09)";
      g.beginPath(); g.arc(24 + i * 15, 22, on ? 5 : 3.5, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = DIM;
    g.font = `600 9px ${MONO}`;
    g.fillText("INTEGRITY", 18, 34);

    const sf = w.stamina / STAMINA_MAX;
    bar(g, 18, 52, 176, 7, sf, w.spent ? RED : sf < 0.3 ? "#ffa24a" : "#5ef0c0", "STAMINA");

    // THE SLOW METER, under the fast one. Stamina you feel every few seconds;
    // this you feel across a fight. Everything in the water — you, the things
    // hunting you, the streaming off the chip — moves at the reciprocal of the
    // viscosity, so the number worth showing is not the temperature, it is what
    // the temperature is doing to the speed of the world.
    const hot = (w.tC - AMBIENT_C) / (MAX_C - AMBIENT_C);
    const rate = viscosity(AMBIENT_C) / viscosity(w.tC);
    bar(g, 18, 78, 176, 5, hot,
      hot > 0.66 ? "#ff5a5a" : hot > 0.33 ? "#ffa24a" : "#6ea8c8",
      `WATER ${w.tC.toFixed(0)}C`);
    if (hot > 0.08) {
      g.font = `700 8px ${MONO}`;
      g.fillStyle = hot > 0.66 ? "#ff5a5a" : "#8ce9ff";
      g.fillText(`THIN - EVERYTHING x${rate.toFixed(2)}`, 200, 86);
    }
    const af = w.amplitude / w.maxAmplitude;
    bar(g, 18, 103, 176, 4, af, w.inverted ? `rgb(${ANTI})` : `rgb(${NODE})`,
      w.inverted ? "GRIP · ANTINODE · PUSH" : "GRIP · NODE · PULL");

    // the world, honestly
    const world = run.world;
    g.font = `600 9px ${MONO}`;
    g.fillStyle = FAINT;
    g.fillText(`${(frequency(w) / 1e6).toFixed(1)} MHZ   ${world.medium.c.toFixed(0)} M/S`
      + `   ${world.medium.rho.toFixed(0)} KG/M3   PITCH ${(world.pitch * 1e6).toFixed(0)} UM`, 18, 222);

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
    this.drawJourney();
    this.drawChannel();
    this.drawObjective();
    this.drawReadout();
    if (run.resonance) {
      const s=run.resonance,l=realm(s);g.fillStyle="rgba(5,12,22,.88)";g.fillRect(210,72,VIEW_W-420,54);
      g.fillStyle=GOLD;g.font=`600 10px ${MONO}`;g.textAlign="center";
      g.fillText(`${l.name} · R ${s.R.toFixed(2)} · ${s.fragments} FRAGMENTS`,VIEW_W/2,78);
      g.fillStyle=INK;g.fillText(s.cleared?"CLEARED · NEXT BIRTH ADVANCES":`${s.kills-s.stageKills}/${l.kills} kills · ${s.crafted-s.stageCrafts}/${l.crafts} assemblies`,VIEW_W/2,94);
      g.fillStyle=DIM;g.fillText("V / L3 · CRYSTAL FORGE",VIEW_W/2,110);g.textAlign="left";
    }

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
      ? faltering(run)
        ? `IT FALTERS  ·  GET INSIDE ${(TAME_REACH * 1e6).toFixed(0)} UM AND HOLD ${G.crown}`
      : vulnerable(run.throne, tameHealth(run))
        ? `HOLD ${G.crown} NEAR THE BOSS TO BOND   ·   LET GO TO KEEP FIGHTING`
        : `${G.grip} ON YOUR BUILDINGS TO FIRE   ·   ${G.dash} INTO AN ARM THROWS IT BACK   ·   `
          + `TAME BELOW ${Math.round(tameHealth(run) * 100)}%`
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
    const selected = run.cells[this.selected] ?? run.cells[0];
    const role = selected.ability === "anchor" ? "VOLLEY GUARD" : selected.ability === "thrust" ? "DASH RECOVERY" : "FASTER BONDING";
    const { first, count } = this.rackWindow();
    let summary = "";
    if (run.cells.length > count) {
      const tally = new Map<string, number>();
      for (const c of run.cells) tally.set(c.group.hm, (tally.get(c.group.hm) ?? 0) + 1);
      summary = `  ·  RACK ${run.cells.length}: ` + [...tally].sort((a, b) => b[1] - a[1])
        .slice(0, 4).map(([hm, n]) => `${hm}x${n}`).join(" ");
    }
    g.font = `600 9px ${MONO}`; g.textAlign = "right"; g.fillStyle = INK;
    g.fillText(`LIMB TIP: ${role}${summary}`, VIEW_W - 18, VIEW_H - 98);
    if (first + count < run.cells.length) {
      g.fillStyle = DIM; g.textAlign = "left";
      g.fillText(`< +${run.cells.length - first - count}`, this.slotRect(count - 1).x, VIEW_H - 78);
    }
    if (first > 0) {
      g.fillStyle = DIM; g.textAlign = "right";
      g.fillText(`+${first} >`, VIEW_W - 18, VIEW_H - 78);
    }
    g.textAlign = "left";
    run.cells.slice(first, first + count).forEach((c, j) => {
      const i = first + j;
      const r = this.slotRect(j);
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
      g.fillText(`${lobes(c.group.hm).length} SHOT`, r.x + r.w / 2, r.y + 32);
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
    g.fillText(run.bond.tamed ? "A SOVEREIGN BECOMES A COMPANION" : "OUT OF THE BODY", VIEW_W / 2, 118);

    g.fillStyle = INK;
    g.font = `700 38px ${MONO}`;
    g.fillText(run.world.name, VIEW_W / 2, 150);

    const e = epitaphFor(run.throne, run.world);
    const offer = run.evolution.offer;
    const two = offer.length > Game.CARD_COLS;
    const top = offer.length ? (two ? 202 : 214) : 236;
    const rowH = offer.length ? (two ? 17 : 19) : 30;
    e.lines.forEach(([k, v], i) => {
      const y = top + i * rowH;
      g.textAlign = "right";
      g.fillStyle = DIM;
      g.font = `600 10px ${MONO}`;
      g.fillText(k, VIEW_W / 2 - 18, y + 3);
      g.textAlign = "left";
      g.fillStyle = i === 0 ? GOLD : INK;
      g.font = `600 12px ${MONO}`;
      g.fillText(v, VIEW_W / 2 + 18, y);
    });

    if (offer.length) this.drawOffer();

    g.textAlign = "center";
    const pulse = 0.55 + 0.45 * Math.sin(this.t * 3);
    g.fillStyle = `rgba(255,201,74,${pulse.toFixed(2)})`;
    g.font = `700 14px ${MONO}`;
    g.fillText(offer.length ? `${run.bond.tamed ? "EVOLVE AND ENTER TOGETHER" : "EVOLVE AND ENTER"}`
      : run.bond.tamed ? "ENTER TOGETHER" : "ENTER IT",
      VIEW_W / 2, Math.max(VIEW_H - 84, this.offerBottom(offer.length) + 40));
    const ally = companion(run);
    if (run.bond.tamed && ally) {
      g.fillStyle = `rgb(${JADE})`;
      g.font = `700 12px ${MONO}`;
      g.fillText(`${ADAPTATIONS[ally.form].name} · ${ADAPTATIONS[ally.form].gift} · BOND ${ally.rank}/3`, VIEW_W / 2, 192);
    }
    g.fillStyle = FAINT;
    g.font = `600 9px ${MONO}`;
    // The cards are game rules and the world is not, and the line says which.
    g.fillText(offer.length
      ? "THE WORLD ABOVE IS COMPUTED FROM WHAT YOU FED THE THRONE  ·  THE CARDS ARE GAME RULES"
      : "EVERYTHING ABOVE IS COMPUTED FROM WHAT YOU FED THE THRONE", VIEW_W / 2, VIEW_H - 58);
    g.textAlign = "left";
  }

  /**
   * Where the i-th of n evolution cards sits.
   *
   * Three to a row: a throne's prime helpings can deal six, and six across is
   * sixteen hundred pixels on a nine-hundred-pixel screen.
   */
  private static readonly CARD_COLS = 3;
  private cardRect(i: number, n: number): { x: number; y: number; w: number; h: number } {
    const rows = Math.ceil(n / Game.CARD_COLS);
    const w = 262, gap = 12;
    const h = rows > 1 ? 74 : 92;
    const row = Math.floor(i / Game.CARD_COLS);
    const inRow = Math.min(n - row * Game.CARD_COLS, Game.CARD_COLS);
    const total = inRow * w + (inRow - 1) * gap;
    const col = i % Game.CARD_COLS;
    return {
      x: VIEW_W / 2 - total / 2 + col * (w + gap),
      y: this.offerTop(n) + row * (h + gap),
      w, h,
    };
  }

  /** The top of the card block, which moves up when there are two rows. */
  private offerTop(n: number): number {
    return n > Game.CARD_COLS ? 372 : 420;
  }

  /** And the bottom of it, which the prompts below have to clear. */
  private offerBottom(n: number): number {
    if (n === 0) return 420;
    const last = this.cardRect(n - 1, n);
    return last.y + last.h;
  }

  private cardAt(sx: number, sy: number): number {
    const n = this.run.evolution.offer.length;
    for (let i = 0; i < n; i++) {
      const r = this.cardRect(i, n);
      if (sx >= r.x && sx <= r.x + r.w && sy >= r.y && sy <= r.y + r.h) return i;
    }
    return -1;
  }

  /** Three ways to change, one to take. */
  private drawOffer(): void {
    const g = this.ctx;
    const run = this.run;
    const offer = run.evolution.offer;
    const G = this.pad.connected ? GLYPH.pad : GLYPH.keys;
    g.textAlign = "center";
    g.font = `700 10px ${MONO}`;
    g.fillStyle = `rgb(${JADE})`;
    const label = this.offerTop(offer.length) - 18;
    const extra = offer.length - 3;
    g.fillText(`THE ORGANISM CHANGES  ·  CHOOSE ONE`
      + `${extra > 0 ? `  ·  ${extra} MORE FROM ${primeHelpings(run.throne.fed.length)} PRIME HELPINGS` : ""}`,
      VIEW_W / 2, label);
    const cost = cardCost(run);
    offer.forEach((t: Trait, i) => {
      const r = this.cardRect(i, offer.length);
      const on = i === this.pick;
      const info = TRAITS[t];
      const rank = rankOf(run, t);
      g.fillStyle = on ? "rgba(20,48,52,0.96)" : "rgba(8,18,28,0.9)";
      g.fillRect(r.x, r.y, r.w, r.h);
      g.strokeStyle = on ? `rgb(${JADE})` : "rgba(160,255,214,0.25)";
      g.lineWidth = on ? 2 : 1;
      g.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
      g.textAlign = "left";
      g.fillStyle = on ? `rgb(${JADE})` : INK;
      g.font = `700 12px ${MONO}`;
      g.fillText(info.name, r.x + 12, r.y + 10);
      g.textAlign = "right";
      g.fillStyle = DIM;
      g.font = `600 9px ${MONO}`;
      g.fillText(rank > 0 ? `RANK ${rank} → ${rank + 1} OF ${info.max}` : `NEW · ${info.max} RANKS`,
        r.x + r.w - 10, r.y + 12);
      g.textAlign = "left";
      g.fillStyle = "#9fbdd0";
      g.font = `600 9px ${MONO}`;
      wrap(g, info.says(rank), r.x + 12, r.y + 34, r.w - 24, 13);
      g.fillStyle = FAINT;
      g.font = `600 8px ${MONO}`;
      g.fillText(String(i + 1), r.x + 4, r.y + r.h - 12);
      if (on) {
        g.textAlign = "right";
        g.font = `700 9px ${MONO}`;
        g.fillStyle = cost === 0 ? `rgb(${JADE})` : run.cells.length >= cost ? GOLD : RED;
        g.fillText(cost === 0 ? `${G.place}  ·  FREE` : `${G.place}  ·  ${cost} CELLS`,
          r.x + r.w - 10, r.y + r.h - 14);
        g.textAlign = "left";
      }
    });
    g.textAlign = "center";
    g.fillStyle = FAINT;
    g.font = `600 9px ${MONO}`;
    g.fillText(`${this.pad.connected ? `${G.cycle} / D-PAD / STICK` : "Q / A-D / 1-3 / CLICK"} TO CHOOSE`
      + `  ·  ${G.place} TO TAKE  ·  ${G.confirm} TO ENTER`
      + `${run.evolution.taken > 0 ? `  ·  TAKEN ${run.evolution.taken}` : ""}`
      + `  ·  RACK ${run.cells.length}`, VIEW_W / 2, this.offerBottom(offer.length) + 12);
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
      ["KILLED YOU", `${n("hit:struck")} STRIKES, ${n("hit:volley")} ARMS, `
        + `${n("hit:charge") + n("hit:shock")} GAMBITS, ${n("hit:touched")} DRIFTED INTO`],
      // Short enough to stay on screen with every clause in it: it starts at the
      // centre line, so it has 430 pixels, which is about sixty characters.
      ["FOUGHT BACK", `${run.fray.stats.caught} CAUGHT, ${run.fray.stats.landed} THROWN HOME`
        + `${run.fray.stats.held ? `  ·  ALLY HELD ${run.fray.stats.held}` : ""}`
        + `${run.fray.stats.repairs ? `  ·  MENDED ${run.fray.stats.repairs}` : ""}`],
      ["SCORE", String(run.score)],
    ];
    rows.forEach(([k, v], i) => {
      const y = 236 + i * 24;
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
    this.verdict ??= this.diagnosis();
    wrap(g, this.verdict, VIEW_W / 2, 430, 820, 14, true);

    g.fillStyle = DIM;
    g.font = `600 10px ${MONO}`;
    g.fillText(`BEST ${this.best}   ·   DEEPEST AEON ${this.deepest}`, VIEW_W / 2, 470);
    const pulse = 0.55 + 0.45 * Math.sin(this.t * 3);
    g.fillStyle = `rgba(255,201,74,${pulse.toFixed(2)})`;
    g.font = `700 14px ${MONO}`;
    g.fillText("BEGIN AGAIN", VIEW_W / 2, 500);
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
    const ally = companion(run);
    if (ally) {
      g.font = `600 10px ${MONO}`;
      g.fillStyle = `rgb(${JADE})`;
      g.fillText(`${ADAPTATIONS[ally.form].name} ${ally.rank}/3 · ${ADAPTATIONS[ally.form].gift}`
        + `  ·  ${G.call} ${CALLS[ally.form].name}`, VIEW_W / 2, 92);
    }

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
      `${pad(G.dash)}BURST - HOW YOU GATHER AND DODGE. AN ARM THAT REACHES YOU IN ONE GOES BACK.`,
      `${pad(G.place)}TAP: BUILD. HOLD: GROW MITOCHONDRION ON A STRUCTURE (2 CELLS).`,
      `${pad(G.lift)}TAP: LIFT THE BUILDING YOU STAND ON. HOLD: LEAVE A CELL AS A LURE.`,
      `${pad(G.cycle)}CHOOSE WHICH CELL.`,
      `${pad(G.crown)}FEED / CROWN. IN COMBAT: HOLD NEAR A WEAKENED BOSS TO BOND.`,
      `${pad(G.depth)}RETUNE THE CHANNEL. THE ONLY WAY ANYTHING MOVES IN DEPTH.`,
      `${pad(G.call)}CALL YOUR COMPANION: RUSH, AEGIS OR SNARE, ON A COOLDOWN.`,
      `${pad(G.mute)}SOUND.`,
      "",
      "LIMB TIPS: POLAR = DASH RECOVERY, PIEZOELECTRIC = FASTER BONDING,",
      "ANCHOR = VOLLEY SHIELD. STAND NEAR A TIP TO USE ITS SUPPORT.",
      `MITOCHONDRIA STORE ENERGY. RETURN FOR STAMINA - AND IN A LULL, ${Math.round(repairCost(run))} OF IT MENDS ONE INTEGRITY.`,
      "",
      `BOND: BELOW ${Math.round(tameHealth(run) * 100)}% HEALTH, HOLD ${G.crown} NEAR THE BOSS FOR ${tameTime(run)} SECONDS.`,
      "HITS INTERRUPT YOU. YOUR WEAPONS REST WHILE YOU OFFER A BOND.",
      `THE FIRST TIME IT REACHES THAT LINE IT FALTERS FOR ${FALTER_TIME} S AND CANNOT BE KILLED. THAT IS THE CHANCE.`,
      `${G.cycle}: SWITCH COMPANION WHILE PAUSED. REPEATED BONDS GROW TO RANK 3.`,
      "FROM THE SECOND WORLD, EVERY SEVEN SECONDS OR SO THE KING PLAYS ITS GAMBIT. IT IS DRAWN FIRST.",
      "A LURE PULLS HUNTERS AND THE KING'S OWN DRAG ONTO IT. A TENDER MENDS THE KING; A LEECH EATS BUILDINGS.",
      "A HELPING THAT LANDS ON A PRIME COUNT BUYS WHAT MASS NO LONGER CAN, AND DEALS ANOTHER CARD.",
      "",
      "WHAT SHARES YOUR CONTRAST COMES TO YOUR FEET. THE REST IS HELD OFF.",
      "A HUNTER STOPS AND GATHERS BEFORE IT STRIKES, AND GOES WHERE IT POINTED.",
    ];
    const traits = held(run);
    if (traits.length) {
      lines.push("", `EVOLVED: ${traits.map(([t, r]) => `${TRAITS[t].name} ${r}`).join("  ·  ")}`);
    }
    lines.forEach((l, i) => g.fillText(l, VIEW_W / 2, 186 + i * 15));

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
    // THE POVERTY STATE, which reads as bad luck and is not. A report came back
    // at aeon 4 holding sixteen cells with a four-cell body standing: the pool
    // opens with the largest body you have BUILT, so cells in the rack open
    // nothing, and none of the chip was in reach. Being told to go feed the
    // throne there is true and useless — there is nothing to feed it with worth
    // crowning until the water is open again.
    if (run.phase === "settle" && run.cells.length > 6
      && (run.bodies[0]?.cells.length ?? 0) < 8) {
      return "YOUR BODY IS SMALLER THAN YOUR RACK. THE WATER YOU CAN DRIVE OPENS WITH "
        + "WHAT YOU HAVE PUT DOWN - CELLS IN HAND OPEN NOTHING";
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
    // THE FOURTH PLAY REPORT, 2026-09-06, and it is answered before the fight
    // starts. 1369 s, aeon 6, FIFTY helpings fed, 5850 hit points woken, ONE
    // HUNDRED discharges of which 98 landed, and the king finished on 4113.
    // Nothing they did in that fight was wrong — they dodged 407 volleys out of
    // 421 — and this function's answer to it was a tip about where to stand.
    //
    // The run was decided at the throne, four helpings in. `throneLedger`
    // replays what was fed and counts the helpings that changed the world at
    // all: 4 of 50. The other 46 bought 5340 hit points and nothing else — a
    // bar eleven times the one they would have woken by stopping when it was
    // sated, to be emptied one spent building at a time while it eats them.
    //
    // It goes ABOVE the discharge advice because it outranks it. Told to aim
    // better, a player who was already aiming well has nowhere to go; told what
    // the bar is made of, they have the whole next run.
    //
    // And it says so ONLY where it is the answer. The same three reports carry
    // a throne fed seven helpings of which six bought something — that player
    // was not overfeeding and telling them they were would be a lie. The gate
    // is what they have already put into the bar: enough landed damage to have
    // killed the throne they would have woken by stopping when it was sated,
    // and the thing in front of them still above four tenths.
    if (run.throne.awake && run.throne.hp > 0 && n("sovereign-hit") > 0) {
      const led = throneLedger(run.throne, run.world.aeon);
      const sated = run.throne.maxHp - led.health;
      const need = dischargesToKill(run);
      const perShot = Number.isFinite(need) ? run.throne.hp / Math.max(1, need) : 0;
      if (led.wasted >= 3 && perShot * n("sovereign-hit") > sated
        && run.throne.hp > run.throne.maxHp * 0.4) {
        // COUNTED, NOT A PREFIX. Prime helpings buy something wherever they
        // land, so "the first N bought all there was" stopped being true the
        // day primes went in — and a report came back saying exactly that
        // about a throne whose tenth, seventeenth and twenty-third helpings
        // had each bought something.
        return `${led.bought} OF YOUR ${run.throne.fed.length} HELPINGS BOUGHT SOMETHING - THE `
          + `OTHER ${led.wasted} WERE ${led.health} HIT POINTS OF NOTHING. YOU HAVE ALREADY `
          + `LANDED ENOUGH TO KILL A ${sated} HP KING`;
      }
    }
    // THE THIRD PLAY REPORT, and the one this whole chain was still missing.
    // 330 s, three discharges, all three landed (sovereign-hit 3), and the king
    // finished on 251 of 510. They were not doing it wrong. They were doing far
    // too little of it, and the only number the game had ever shown them —
    // `dischargesToKill` — was quoting the muzzle, which is inside the radius
    // the king eats buildings from. Told TWO, needed four or five.
    //
    // So say the count, and say the other bar. A 23 king has one independent
    // piezoelectric component and comes apart at 2 hp/s in your hand: over that
    // run there was more health in the hand they never closed than in the whole
    // king. `wearing` fired twice, which is a third of a second of it.
    if (run.throne.awake && run.throne.hp > 0 && n("discharge") > 0) {
      const need = dischargesToKill(run);
      const rate = wearRate(run.throne);
      // WHAT THE HAND ACTUALLY TOOK OFF, not how many times it was mentioned.
      // This tested `wearing < 6`, and `wearing` is a tick at
      // WEAR_TICKS_PER_SECOND — so the threshold read "less than one second of
      // contact", and two of the three reports of 2026-09-06 came in at 10 and
      // 8 ticks. A second and a third of grip across twenty-three minutes was
      // scored as knowing about the hand, and both runs were routed past the
      // advice they needed into a tip about where to stand.
      const took = (n("wearing") / WEAR_TICKS_PER_SECOND) * rate;
      if (rate > 0 && took < run.throne.maxHp * 0.1) {
        return `${n("discharge")} DISCHARGES IS NOT ENOUGH - IT NEEDS `
          + `${Number.isFinite(need) ? need : "MORE THAN YOU HAD"} MORE FROM WHERE YOU CAN `
          + `STAND. AND IT HAS A SECOND BAR: YOUR HAND TAKES ${rate}/S OFF IT`;
      }
      return `${n("discharge")} DISCHARGES LANDED AND IT LIVED. GET THE KING ONTO A `
        + `BUILDING - AN ARM IS WORTH DOUBLE AT ITS MUZZLE AND NOTHING AT ITS EDGE`;
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
      ["charge", n("hit:charge")], ["shock", n("hit:shock")],
    ];
    const worst = causes.sort((a, b) => b[1] - a[1])[0];
    if (worst[1] > 0) {
      if (worst[0] === "struck") {
        return n("dash") < n("strike") / 4
          ? "THEY TELEGRAPH. WHEN ONE STOPS AND GATHERS, BURST OFF THE LINE IT SHOWS"
          : "CLOSE YOUR HAND ON ONE AND IT CANNOT STRIKE AT ALL";
      }
      if (worst[0] === "volley") {
        return run.fray.stats.caught === 0
          ? "ITS ARMS ARE DRAWN BEFORE THEY ARE THROWN. STAND IN THE GAPS - OR BURST INTO ONE "
            + "AS IT ARRIVES AND IT GOES BACK AT THE KING"
          : "ITS ARMS ARE DRAWN BEFORE THEY ARE THROWN. STAND IN THE GAPS";
      }
      if (worst[0] === "charge") return "A CHARGE'S LANE IS LOCKED WHEN IT STARTS TO WIND. STEP OFF IT";
      if (worst[0] === "shock") {
        return "A SHOCK FRONT STOPS AT ITS DASHED RING. BE OUTSIDE IT, OR BURST AS IT PASSES";
      }
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
      `you: integrity ${run.integrity}/${maxIntegrity(run)} stamina ${run.wave.stamina.toFixed(0)} score ${run.score}`,
      `companions: ${run.bond.companions.map((c, i) => `${i === run.bond.active ? "*" : ""}${c.form}:${c.rank}`).join(" ") || "none"}; bond ${run.bond.progress.toFixed(2)}s`
        + `${companion(run) ? `; call ${callWait(run) > 0 ? `in ${callWait(run).toFixed(0)}s` : "ready"}` : ""}`,
      `resonance: ${run.resonance ? JSON.stringify({seed:run.resonance.source.seed,realm:realm(run.resonance).name,R:run.resonance.R,fragments:run.resonance.fragments,crafted:run.resonance.crafted,kills:run.resonance.kills,blocks:run.resonance.blocks,woven:run.resonance.woven}) : "off"}`,
      `mitochondria: ${run.organelles.length}; stored energy ${run.organelles.reduce((n, o) => n + o.energy, 0).toFixed(0)}`
        + `; mending ${mending(run) ? "possible" : "no"}; repair ${run.fray.repair.toFixed(0)}/${repairCost(run).toFixed(0)}`,
      // WHAT THE FIGHT WAS MADE OF, past the volleys. Counted in the game rather
      // than inferred from events, so damage is in it and not just a count.
      `battle: arms caught ${run.fray.stats.caught}, thrown home ${run.fray.stats.landed} for ${run.fray.stats.damage.toFixed(0)}`
        + ` (${run.throne.hm ? `${riposteDamage(run)} each now` : "no king"}); gambits ${run.fray.stats.gambits}`
        + `; companion held ${run.fray.stats.held}; calls ${run.fray.stats.calls}; mended ${run.fray.stats.repairs}`
        + `; falter ${run.fray.falter > 0 ? "open now" : run.fray.faltered ? "spent" : "not yet"}`,
      `evolution: ${held(run).map(([t, r]) => `${t}:${r}`).join(" ") || "none"}`
        + `${run.evolution.offer.length ? `; offered [${run.evolution.offer.join(" ")}]` : ""}`,
      `built ${run.built} cells; ${run.structures.length} standing; rack [${run.cells.map((c) => c.group.hm).join(" ")}]`,
      `throne: ${run.throne.fed.length ? `fed [${run.throne.fed.join(" ")}] -> ${run.throne.hm}` : "empty"}`
        + `${run.throne.awake ? ` awake ${run.throne.hp.toFixed(0)}/${run.throne.maxHp}` : ""}`
        // WHAT THAT LIST COST, which a reader cannot get from the list. The
        // aeon-6 report of 2026-09-06 printed fifty helpings and 5850 hit
        // points and it took a probe to find out that four of the fifty bought
        // anything. Every report carries the answer now.
        + `${run.throne.fed.length ? `  primes ${primeHelpings(run.throne.fed.length)}` : ""}`
        + `${run.throne.fed.length ? (() => {
          const led = throneLedger(run.throne, run.world.aeon);
          return led.wasted > 0
            ? `  (${led.bought} of ${run.throne.fed.length} bought anything; `
              + `${led.health} hp of nothing)`
            : `  (all ${led.bought} bought something)`;
        })() : ""}`
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
          // FED, AND SEATED. A body of 622 cells is a 222 on a square net and
          // grows two arms, not six. Without both halves in the report, "limbs
          // 2" out of a sixfold body reads as a bug rather than as the rule.
          + ` fed ${run.bodies[0].hm} seated ${seatedGroup(run.bodies[0].hm)}`
          + ` grows ${growable(run.bodies[0].hm).length}`
          + `${autonomous(run.bodies[0]) ? " AUTONOMOUS" : ""}` : ""}`
        + `  lattice ${(latticePitch(run) * 1e6).toFixed(0)}um`,
      `bound: ${(run.bound.omega / 2 / Math.PI / 1e6).toFixed(2)} MHz  ${run.bound.free ? "FREED" : "held"}`
        + `  crystal ${run.crystal ? `a=${(run.crystal.a * 1e6).toFixed(0)}um fill=${run.crystal.fill.toFixed(2)}` : "none"}`
        + `  gap ${run.gap ? `${(run.gap.lo / 1e6).toFixed(1)}-${(run.gap.hi / 1e6).toFixed(1)}` : "none"}`,
      `water: ${run.entities.filter((e) => e.faction === "motif").length} standing of `
        // During BIRTH the new world's density is already installed but its pool
        // has not been rebuilt yet, so these two are measured against different
        // worlds for one screen and `delivered` can read higher than the
        // capacity. Said, rather than left for a future reader to chase.
        + `${suspension(run)}${run.phase === "birth" ? " (next world's, pool not rebuilt)" : ""}`
        + `; delivered ${run.delivered}; arrivals `
        + `${arrivalRate(run).toFixed(2)}/s; hunters allowed ${
          run.phase === "reign" ? "reign" : settleCap(run)}`,
      `heat: ${run.wave.tC.toFixed(1)}C (ambient ${AMBIENT_C})`
        + `  viscosity x${(viscosity(run.wave.tC) / viscosity(AMBIENT_C)).toFixed(2)}`
        + `  everything moves x${(viscosity(AMBIENT_C) / viscosity(run.wave.tC)).toFixed(2)}`
        + `  water c=${waterAt(run, run.you.y).c.toFixed(0)}`,
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
      `${pad(on ? `E / ${G.cycle}` : "E")}${this.ebb
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
  x: number, y: number, maxW: number, lh: number, centred = false,
): void {
  // Centred text is measured from its middle, so the caller's x is the centre
  // and the width test is the same.
  const was = g.textAlign;
  if (centred) g.textAlign = "center";
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
  g.textAlign = was;
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
  let expedition: ResonanceSource = {seed:"20260927",trajectory:[]};
  const status=document.getElementById("expedition-status");
  document.getElementById("expedition-start")?.addEventListener("click",()=>{
    const started=game.startExpedition(expedition);
    if(status)status.textContent=started?`Expedition seed ${expedition.seed}. V / L3 opens the forge.`:"An existing run is active. Start an expedition from the title or death screen.";
    canvas.focus();
  });
  document.getElementById("forge-open")?.addEventListener("click",()=>{game.toggleForge();canvas.focus();});
  document.getElementById("expedition-import")?.addEventListener("change",async(event)=>{
    const input=event.target as HTMLInputElement,file=input.files?.[0];if(!file)return;
    try {
      if(file.size>2_000_000)throw Error("File exceeds 2 MB");
      expedition=resonanceSource(JSON.parse(await file.text()));
      if(status)status.textContent=`Seed ${expedition.seed} ready for the next expedition · ${expedition.trajectory.length?"saved trajectory":"generated coherence field"}`;
    } catch(error) {if(status)status.textContent=error instanceof Error?error.message:"Invalid Resonarium file";}
    input.value="";
  });
  game.start();
}
