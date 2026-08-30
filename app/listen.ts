// app/listen.ts — the listening surface.
//
// Imports personal/ and NOTHING from src/. That is not tidiness: the boundary
// test reads these import statements, and the moment this file reaches for a
// Gor'kov potential it has started implying that listening does what a channel
// does. Its own page rather than a tab on the bench, for the same reason — a tab
// would present the two as views of one thing.
//
// The sound is six to fourteen sine voices, one per body, tuned by longitude.
// Bodies close in longitude are close in pitch and beat against each other
// slowly, which is the whole texture: a chart with a tight conjunction hums, and
// one with everything spread out sits still.
//
// AUDIO STARTS ON A BUTTON PRESS AND NOWHERE ELSE. The AudioContext is
// constructed inside the click handler, so there is no path to sound that a
// reader did not ask for. That is browser autoplay policy and also just correct.

import {
  ASPECT_INTERVALS, chord, droneHz, pairBodies, slowestBeat, type Placement,
} from "../personal/tonal.js";
import {
  aspectCircle, cliffordPoint, pairRotation, separation, stereo3, type Vec3,
} from "../personal/torus.js";
import {
  DEFAULT_TRANSITS, isStation, lockCents, parseTransits, reverses,
  upcoming, type TransitEvent,
} from "../personal/transits.js";

const GLYPHS: Record<string, string> = {
  Sun: "☉", Moon: "☽", Mercury: "☿", Venus: "♀", Mars: "♂", Jupiter: "♃",
  Saturn: "♄", Uranus: "♅", Neptune: "♆", Pluto: "♇",
  "North Node": "☊", "South Node": "☋", Chiron: "⚷", Lilith: "⚸",
};

/**
 * The chart this page opens with — the operator's own, computed from confirmed
 * birth data (1987-11-11, 13:09, UTC−8) against the Swiss ephemeris.
 *
 * THE ANGLES ARE DELIBERATELY ABSENT. A body's ecliptic longitude depends only
 * on the instant, so these fourteen are exact without knowing where the birth
 * happened — measured, not assumed: recomputing at latitudes from the equator to
 * 64° north moves every one of them by 0.00e+0 degrees. The Ascendant moves by
 * 55°, the Part of Fortune with it, and the Midheaven by 17°, so those three are
 * not here. Adding them would need a birthplace from a document, and a guessed
 * coordinate would put three voices in the chord that are simply wrong.
 *
 * The South Node is included, and it is worth knowing what it does: it sits
 * exactly 180° from the North, which under this map is exactly an octave. So the
 * nodal axis is not two voices but one voice doubled at the octave — a real
 * octave, not a rounding. It also makes the count fourteen, which folds evenly
 * into the seven dyads the sweep is built on.
 *
 * Replace any of this in the panel. The page sounds a chart; it does not cast
 * one.
 */
const DEFAULT_CHART = `Sun 228.94
Moon 120.20
Mercury 209.97
Venus 249.86
Mars 202.01
Jupiter 21.64
Saturn 259.67
Uranus 264.74
Neptune 276.05
Pluto 220.27
North Node 1.14
South Node 181.14
Chiron 88.04
Lilith 129.55`;

function parseChart(text: string): Placement[] {
  const out: Placement[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^(.+?)[\s,]+(-?[\d.]+)\s*$/);
    if (!m) continue;
    const lon = Number(m[2]);
    if (!Number.isFinite(lon)) continue;
    out.push({ id: m[1].trim(), longitude: lon });
  }
  return out;
}

// ── state ───────────────────────────────────────────────────────────────────

let placements = parseChart(DEFAULT_CHART);
const rot = { yaw: -26, pitch: 18, spin: 0 };
let dragging: { x: number; y: number } | null = null;

const reduced = typeof matchMedia === "function"
  && matchMedia("(prefers-reduced-motion: reduce)").matches;

// ── sound ───────────────────────────────────────────────────────────────────

interface Voice { osc: OscillatorNode; filter: BiquadFilterNode; }
interface Playing {
  ctx: AudioContext;
  master: GainNode;
  voices: Voice[];
}
let playing: Playing | null = null;

/**
 * One drone voice: sawtooth into a lowpass that TRACKS the pitch at 3.5x.
 *
 * Not sine, and the difference matters more than it sounds like it should.
 * Thirteen bare sines inside an octave and a half beat against each other in
 * the five-to-fifteen hertz band, which is exactly where two tones stop sounding
 * like two tones and start sounding rough. A filtered sawtooth has more
 * harmonics, not fewer — but because the corner follows the fundamental, the low
 * voices come out dark and the high ones bright, and the ear separates them by
 * timbre instead of trying to fuse them. It is the same voice the torus panel in
 * the other application uses, which is the sound this page exists to reproduce.
 */
function makeVoice(ctx: AudioContext, hz: number, gain: number, dest: AudioNode): Voice {
  const osc = ctx.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(hz, ctx.currentTime);

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = hz * 3.5;
  filter.Q.value = 0.7;

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, ctx.currentTime);
  // Staggered so thirteen voices do not all arrive on one sample.
  g.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + 2 + Math.random() * 2);

  osc.connect(filter).connect(g).connect(dest);
  osc.start();
  return { osc, filter };
}

function start(withSweep = false): void {
  const Ctor = window.AudioContext
    ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return;
  const ctx = new Ctor();

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, ctx.currentTime);
  // A slow swell rather than a switch, and quieter than a sine chord would need:
  // a sawtooth carries far more energy for the same amplitude.
  master.gain.exponentialRampToValueAtTime(0.09, ctx.currentTime + 3);
  master.connect(ctx.destination);

  const n = Math.max(1, placements.length);
  // Under a sweep the drones step back: they are the bed the sweeps are heard
  // AGAINST, and at equal level the beats get lost inside the chord.
  const bed = withSweep ? 0.55 / n : 1 / n;
  const voices = placements.map((p) => makeVoice(ctx, droneHz(p.longitude), bed, master));
  playing = { ctx, master, voices };

  if (withSweep) {
    makeSweep(ctx, SWEEP_LO, SWEEP_HI, master);
    makeSweep(ctx, SWEEP_HI, SWEEP_LO, master);
    sweepStartedAt = performance.now();
    // The sweeps end on their own; stop the drones with them so the piece has a
    // shape rather than trailing on after the sweeps have gone.
    window.setTimeout(() => { if (playing) { stop(); resetButtons(); } },
      (SWEEP_SECONDS + 1) * 1000);
  }
}

function resetButtons(): void {
  playBtn.textContent = "\u25B6\u2003Sound the chart";
  sweepBtn.textContent = "\u25B6\u2003Sweep";
  sweepStartedAt = null;
  soundingEvent = null;
  readout.innerHTML = "";
  renderEvents();
}

function stop(): void {
  if (!playing) return;
  const { ctx, master, voices } = playing;
  playing = null;
  // Fade before tearing down, or the chord ends in a click.
  master.gain.cancelScheduledValues(ctx.currentTime);
  master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), ctx.currentTime);
  master.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.4);
  window.setTimeout(() => {
    for (const v of voices) { try { v.osc.stop(); } catch { /* already stopped */ } }
    void ctx.close();
  }, 1600);
}

// ── the sweep ───────────────────────────────────────────────────────────────
//
// Two signals crossing over the drones: one climbing 1 Hz to 300, one falling
// 300 back to 1. Each time a sweep passes a body's drone the beat between them
// slows, stops, and opens out the other side — so the chart is heard as a
// SEQUENCE of zero-beats rather than as a chord, once going up and once coming
// down, with the two sweeps also nulling against each other where they cross.
//
// LINEAR IN TIME, not exponential. An exponential sweep is the musical default
// and would be wrong here: 1 to 300 Hz is 8.2 octaves, and the fourteen drones
// occupy 1.5 of them, so an exponential sweep would rush every crossing into a
// few seconds near the top. Linear spreads them out evenly, and it also makes
// the beat against a fixed drone change at a constant rate, which is the thing
// being listened to.

const SWEEP_LO = 1;
const SWEEP_HI = 300;
const SWEEP_SECONDS = 90;
/** When a linear sweep reaches a given frequency, in seconds from its start. */
function timeAt(hz: number, from: number, to: number): number {
  return (SWEEP_SECONDS * (hz - from)) / (to - from);
}

/**
 * One sweeping voice, with its gain scheduled around the audible floor.
 *
 * The ducking is not cosmetic. A sine at 1-20 Hz is inaudible and still drives
 * the speaker cone at full excursion, which is how you damage a woofer playing
 * something nobody can hear. Because the sweep is linear in time the crossing
 * points are known in advance, so the whole envelope can be scheduled up front
 * rather than tracked with a script processor.
 */
function makeSweep(ctx: AudioContext, from: number, to: number, dest: AudioNode): OscillatorNode {
  const t0 = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(from, t0);
  osc.frequency.linearRampToValueAtTime(to, t0 + SWEEP_SECONDS);

  const g = ctx.createGain();
  const rising = to > from;
  // Fade across the band where the sweep becomes audible: 14 Hz to 34 Hz.
  const tIn = timeAt(rising ? 14 : 34, from, to);
  const tFull = timeAt(rising ? 34 : 14, from, to);
  const EPS = 0.0001;
  const LEVEL = 0.5;
  if (rising) {
    g.gain.setValueAtTime(EPS, t0);
    g.gain.setValueAtTime(EPS, t0 + tIn);
    g.gain.exponentialRampToValueAtTime(LEVEL, t0 + tFull);
    g.gain.setValueAtTime(LEVEL, t0 + SWEEP_SECONDS);
  } else {
    g.gain.setValueAtTime(LEVEL, t0);
    g.gain.setValueAtTime(LEVEL, t0 + tIn);
    g.gain.exponentialRampToValueAtTime(EPS, t0 + tFull);
  }

  osc.connect(g).connect(dest);
  osc.start();
  osc.stop(t0 + SWEEP_SECONDS + 0.2);
  return osc;
}

/** Where the sweeps are now, given how long they have been running. */
function sweepNow(elapsed: number): { up: number; down: number } {
  const t = Math.max(0, Math.min(1, elapsed / SWEEP_SECONDS));
  return {
    up: SWEEP_LO + (SWEEP_HI - SWEEP_LO) * t,
    down: SWEEP_HI - (SWEEP_HI - SWEEP_LO) * t,
  };
}

let sweepStartedAt: number | null = null;

// ── the voice list ──────────────────────────────────────────────────────────

function renderVoices(): void {
  const el = document.getElementById("voices")!;
  const voices = chord(placements);
  const beat = slowestBeat(placements);

  // Name the interval when a pair sits on one, because that is the map's one
  // real claim and it is nice to see it land.
  let named = "";
  if (beat) {
    const a = placements.find((p) => p.id === beat.a)!;
    const b = placements.find((p) => p.id === beat.b)!;
    const sep = separation(a.longitude, b.longitude);
    const hit = ASPECT_INTERVALS.find((x) => Math.abs(x.degrees - sep) < 3);
    // "the" for the aspect, an article from the table for the interval.
    //
    // Two article bugs in one sentence, found one after the other on screen: a
    // first-letter test wrote "an unison" (vowel letter, consonant sound), and
    // fixing that left "near a opposition" beside it. The interval's article is
    // data because the set is closed and English decides by sound; the aspect
    // takes "the", which never varies and reads better than tabulating a second
    // column to say the same thing.
    if (hit) named = ` — near the ${hit.name}, ${hit.article} ${hit.interval}`;
  }

  // Fourteen bodies folded into seven dyads, tightest first. Each pair's own
  // beat is the slow pulse it contributes; the sweep then crosses all fourteen
  // drones in turn, so the pairing organises what you are listening to rather
  // than changing which frequencies sound.
  const { pairs, unpaired } = pairBodies(placements);

  el.innerHTML = `<div class="cap">Voices</div>` +
    voices.map((v) => `<div class="voice">
        <span class="g">${GLYPHS[v.id] ?? "·"}&#8202;<span style="font-family:var(--mono);font-size:11px;color:var(--ink-3)">${v.id}</span></span>
        <span class="hz">${v.hz.toFixed(1)} Hz</span>
      </div>`).join("") +
    (pairs.length
      ? `<div class="cap" style="margin-top:16px">${pairs.length} ${pairs.length === 1 ? "dyad" : "dyads"}</div>` +
        pairs.map((d) => `<div class="voice">
          <span class="g" style="font-size:13px">${GLYPHS[d.a.id] ?? "·"}${GLYPHS[d.b.id] ?? "·"}</span>
          <span class="hz">${d.beatHz.toFixed(2)} Hz</span>
        </div>`).join("") +
        (unpaired.length
          ? `<div class="voice"><span class="g" style="font-size:13px">${unpaired.map((u) => GLYPHS[u.id] ?? "·").join("")}</span><span class="hz">unpaired</span></div>`
          : "")
      : "") +
    (beat ? `<div class="beat">slowest beat · ${beat.a}&#8202;–&#8202;${beat.b}
       at ${beat.hz.toFixed(2)} Hz${named}</div>` : "");
}

// ── transits: the sweep the sky is already running ──────────────────────────
//
// Same machinery as the synthetic sweep, at the rate things actually move. The
// natal drone holds; the transiting one follows nine real weekly positions
// across the four weeks either side of exactness. A station has no second voice
// to lock against, so what you hear is the glide decelerating, stopping and
// reversing — which is in the data rather than reconstructed, because at a
// station the speed is zero and a straight line through it would erase the only
// thing happening.

const TRANSIT_SECONDS = 22;
const transits = parseTransits(DEFAULT_TRANSITS);
let soundingEvent: string | null = null;

function startTransit(e: TransitEvent): void {
  const Ctor = window.AudioContext
    ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return;
  const ctx = new Ctor();
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, ctx.currentTime);
  master.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 2);
  master.connect(ctx.destination);

  const voices: Array<{ osc: OscillatorNode; filter: BiquadFilterNode }> = [];

  // the natal drone, fixed — the thing being arrived at
  if (e.targetLongitude !== null) {
    voices.push(makeVoice(ctx, droneHz(e.targetLongitude), 0.55, master));
  }

  // the transiting drone, following its real track
  const path = e.track.map(droneHz);
  const moving = makeVoice(ctx, path[0], 0.55, master);
  const step = TRANSIT_SECONDS / (path.length - 1);
  path.forEach((hz, i) => {
    const at = ctx.currentTime + i * step;
    moving.osc.frequency.linearRampToValueAtTime(hz, at);
    moving.filter.frequency.linearRampToValueAtTime(hz * 3.5, at);
  });
  voices.push(moving);

  playing = { ctx, master, voices };
  soundingEvent = e.date + e.body;
  window.setTimeout(() => {
    if (playing && soundingEvent === e.date + e.body) { stop(); resetButtons(); }
  }, (TRANSIT_SECONDS + 2) * 1000);
}

function renderEvents(): void {
  const host = document.getElementById("events");
  if (!host) return;
  const today = new Date().toISOString().slice(0, 10);
  const list = upcoming(transits, today).slice(0, 24);
  host.innerHTML = list.map((e) => {
    const key = e.date + e.body;
    const what = isStation(e)
      ? `${GLYPHS[e.body] ?? ""} ${e.body} turns ${e.direction}`
      : `${GLYPHS[e.body] ?? ""} ${e.body} ${e.kind.toLowerCase()} natal ${GLYPHS[e.target ?? ""] ?? ""} ${e.target}`;
    const c = lockCents(e);
    const right = isStation(e)
      ? (reverses(e) ? "reverses" : "—")
      : `${Math.round(c ?? 0)}\u00A2`;
    return `<button class="ev" data-key="${key}" aria-pressed="${soundingEvent === key}">
      <span class="d">${e.date}</span><span class="w">${what}</span><span class="i">${right}</span>
    </button>`;
  }).join("");

  host.querySelectorAll(".ev").forEach((b) => {
    b.addEventListener("click", () => {
      const key = (b as HTMLElement).dataset.key!;
      const hit = list.find((x) => x.date + x.body === key);
      if (!hit) return;
      // Read the toggle state BEFORE stopping. resetButtons clears
      // soundingEvent, so checking it afterwards always found null and the
      // event restarted instead of stopping — a click that looked like it did
      // nothing except make the sound begin again.
      const wasSounding = soundingEvent === key;
      if (playing) { stop(); resetButtons(); }
      if (wasSounding) { renderEvents(); return; }
      startTransit(hit);
      renderEvents();
    });
  });
}

// ── the sweep readout and strip ─────────────────────────────────────────────

const strip = document.getElementById("strip") as HTMLCanvasElement;
const stripCtx = strip.getContext("2d")!;
const readout = document.getElementById("readout")!;

/** Log position of a frequency on the strip, 0..1. Log rather than linear
 *  because the drones cluster in the top third and would otherwise pile up. */
const stripX = (hz: number) => Math.log(Math.max(hz, 1)) / Math.log(340);

function drawStrip(): void {
  const w = strip.width;
  const h = strip.height;
  const px = w / 1320;
  stripCtx.clearRect(0, 0, w, h);
  const col = getComputedStyle(document.body).getPropertyValue("--chord").trim() || "#6a4a92";
  stripCtx.strokeStyle = col;
  stripCtx.fillStyle = col;

  stripCtx.globalAlpha = 0.18;
  stripCtx.lineWidth = 1 * px;
  stripCtx.beginPath();
  stripCtx.moveTo(0, h / 2);
  stripCtx.lineTo(w, h / 2);
  stripCtx.stroke();

  stripCtx.globalAlpha = 0.34;
  stripCtx.lineWidth = 1.6 * px;
  for (const p of placements) {
    const x = stripX(droneHz(p.longitude)) * w;
    stripCtx.beginPath();
    stripCtx.moveTo(x, h * 0.28);
    stripCtx.lineTo(x, h * 0.72);
    stripCtx.stroke();
  }

  if (sweepStartedAt === null) { stripCtx.globalAlpha = 1; return; }
  const { up, down } = sweepNow((performance.now() - sweepStartedAt) / 1000);
  for (const [hz, dir] of [[up, 1], [down, -1]] as const) {
    const x = stripX(hz) * w;
    stripCtx.globalAlpha = 0.95;
    stripCtx.beginPath();
    stripCtx.moveTo(x, h / 2 - 16 * px * dir);
    stripCtx.lineTo(x - 7 * px, h / 2 - 30 * px * dir);
    stripCtx.lineTo(x + 7 * px, h / 2 - 30 * px * dir);
    stripCtx.closePath();
    stripCtx.fill();
    stripCtx.globalAlpha = 0.45;
    stripCtx.beginPath();
    stripCtx.moveTo(x, h * 0.14);
    stripCtx.lineTo(x, h * 0.86);
    stripCtx.stroke();
  }
  stripCtx.globalAlpha = 1;
}

/** The nearest drone to a frequency, and how fast it is beating against it. */
function nearestDrone(hz: number): { id: string; beat: number } | null {
  let best: { id: string; beat: number } | null = null;
  for (const p of placements) {
    const beat = Math.abs(droneHz(p.longitude) - hz);
    if (!best || beat < best.beat) best = { id: p.id, beat };
  }
  return best;
}

function updateReadout(): void {
  if (sweepStartedAt === null) return;
  const elapsed = (performance.now() - sweepStartedAt) / 1000;
  const { up, down } = sweepNow(elapsed);
  const line = (label: string, hz: number) => {
    const n = nearestDrone(hz);
    if (!n) return "";
    // Under a hertz the beat has stopped being a beat and become a unison. That
    // moment is the entire point of the sweep, so it gets named rather than
    // being left as a number approaching zero.
    const at = n.beat < 1
      ? `<span class="null">nulling on ${n.id}</span>`
      : `${n.beat.toFixed(1)} Hz against ${n.id}`;
    return `${label} <b>${hz.toFixed(1)} Hz</b> — ${at}`;
  };
  const cross = Math.abs(up - down);
  readout.innerHTML = `${line("rising", up)}<br>${line("falling", down)}<br>` +
    (cross < 1
      ? `<span class="null">the two sweeps are crossing</span>`
      : `sweeps ${cross.toFixed(1)} Hz apart · ${Math.max(0, SWEEP_SECONDS - elapsed).toFixed(0)}s left`);
}

// ── the torus ───────────────────────────────────────────────────────────────

const canvas = document.getElementById("c") as HTMLCanvasElement;
const ctx2d = canvas.getContext("2d")!;

/** Project a point of R4 to the screen: turn it, flatten it, then a plain
 *  camera. Kept here rather than in personal/torus so the library stays a pure
 *  description of the geometry and this file owns the viewing. */
function project(theta: number, phi: number): { x: number; y: number; d: number } {
  const turned = pairRotation(cliffordPoint(theta, phi), "first", rot.spin, rot.spin);
  const v: Vec3 = stereo3(turned);
  const ry = (rot.yaw * Math.PI) / 180;
  const rx = (rot.pitch * Math.PI) / 180;
  const x1 = v.x * Math.cos(ry) + v.z * Math.sin(ry);
  const z1 = -v.x * Math.sin(ry) + v.z * Math.cos(ry);
  const y2 = v.y * Math.cos(rx) - z1 * Math.sin(rx);
  const z2 = v.y * Math.sin(rx) + z1 * Math.cos(rx);
  const f = 7 / (7 - z2);
  const s = Math.min(canvas.width, canvas.height) / 3.5;
  return { x: canvas.width / 2 + x1 * f * s, y: canvas.height / 2 - y2 * f * s, d: z2 };
}

function ink(): { line: string; dim: string; mark: string } {
  const cs = getComputedStyle(document.body);
  const chordCol = cs.getPropertyValue("--chord").trim() || "#6a4a92";
  return { line: chordCol, dim: chordCol, mark: chordCol };
}

function draw(): void {
  const { line, mark } = ink();
  ctx2d.clearRect(0, 0, canvas.width, canvas.height);
  const px = canvas.width / 1320;

  // The surface, as its own aspect circles. Every one of these is a true round
  // circle in space under this projection, and any two of them are linked once.
  ctx2d.lineWidth = 1.1 * px;
  for (const a of [0, 60, 90, 120, 180]) {
    const pts = aspectCircle(a, 120);
    ctx2d.beginPath();
    pts.forEach(([t, p], i) => {
      const q = project(t, p);
      if (i === 0) ctx2d.moveTo(q.x, q.y); else ctx2d.lineTo(q.x, q.y);
    });
    ctx2d.globalAlpha = a === 0 ? 0.55 : 0.20;
    ctx2d.strokeStyle = line;
    ctx2d.stroke();
  }

  // Each body twice: once on each circle of the torus, which is what it means
  // for a longitude to be a whole circle on a product of two circles.
  // One circle per body rather than two. A longitude is a whole circle on each
  // axis and both are true, but drawing twenty of them over the aspect family
  // made a thicket you had to see past — measured on a screenshot. The meridian
  // is the one the body's own mark sits on, so it is the one that reads.
  ctx2d.globalAlpha = 0.14;
  ctx2d.lineWidth = 0.9 * px;
  ctx2d.strokeStyle = line;
  for (const p of placements) {
    ctx2d.beginPath();
    for (let i = 0; i <= 96; i++) {
      const u = (i / 96) * 360;
      const q = project(p.longitude, u);
      if (i === 0) ctx2d.moveTo(q.x, q.y); else ctx2d.lineTo(q.x, q.y);
    }
    ctx2d.stroke();
  }

  // The bodies themselves, where their two circles cross.
  const marks = placements.map((p) => ({ p, q: project(p.longitude, p.longitude) }))
    .sort((a, b) => a.q.d - b.q.d);
  for (const { p, q } of marks) {
    const near = Math.max(0, Math.min(1, (q.d + 2.6) / 5.2));
    ctx2d.globalAlpha = (0.12 + 0.16 * near);
    ctx2d.fillStyle = mark;
    ctx2d.beginPath();
    ctx2d.arc(q.x, q.y, (14 + 9 * near) * px, 0, Math.PI * 2);
    ctx2d.fill();
    ctx2d.globalAlpha = 0.55 + 0.45 * near;
    ctx2d.beginPath();
    ctx2d.arc(q.x, q.y, (5 + 3.5 * near) * px, 0, Math.PI * 2);
    ctx2d.fill();
    ctx2d.globalAlpha = 0.55 + 0.45 * near;
    ctx2d.font = `${Math.round(21 * px)}px system-ui, sans-serif`;
    ctx2d.textAlign = "center";
    ctx2d.fillText(GLYPHS[p.id] ?? "·", q.x, q.y - 18 * px);
  }
  ctx2d.globalAlpha = 1;
}

// ── loop and input ──────────────────────────────────────────────────────────

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  if (!reduced && !dragging) {
    // Isoclinic, in the pair whose rotation slides the surface along its own
    // aspect circles rather than tilting it. Slow enough to read as breathing.
    rot.spin = (rot.spin + dt * 2.2) % 360;
    rot.yaw += dt * 1.6;
  }
  draw();
  drawStrip();
  updateReadout();
  requestAnimationFrame(frame);
}

canvas.addEventListener("pointerdown", (e) => {
  canvas.setPointerCapture(e.pointerId);
  dragging = { x: e.clientX, y: e.clientY };
});
canvas.addEventListener("pointermove", (e) => {
  if (!dragging) return;
  rot.yaw += (e.clientX - dragging.x) * 0.4;
  rot.pitch = Math.max(-88, Math.min(88, rot.pitch + (e.clientY - dragging.y) * 0.4));
  dragging = { x: e.clientX, y: e.clientY };
});
const release = () => { dragging = null; };
canvas.addEventListener("pointerup", release);
canvas.addEventListener("pointercancel", release);

const playBtn = document.getElementById("play") as HTMLButtonElement;
const sweepBtn = document.getElementById("sweep") as HTMLButtonElement;

playBtn.addEventListener("click", () => {
  if (playing) { stop(); resetButtons(); }
  else { start(false); playBtn.textContent = "\u25FC\u2003Stop"; }
});
sweepBtn.addEventListener("click", () => {
  if (playing) { stop(); resetButtons(); }
  else { start(true); sweepBtn.textContent = "\u25FC\u2003Stop"; }
});

const chartBox = document.getElementById("chart") as HTMLTextAreaElement;
chartBox.value = DEFAULT_CHART;
chartBox.addEventListener("change", () => {
  const next = parseChart(chartBox.value);
  if (!next.length) return;
  placements = next;
  renderVoices();
  // Retune a sounding chord in place rather than restarting it — the point of a
  // drone is that it does not stop.
  if (playing) {
    const { ctx, voices } = playing;
    voices.forEach((v, i) => {
      const p = placements[i];
      if (!p) return;
      const hz = droneHz(p.longitude);
      v.osc.frequency.linearRampToValueAtTime(hz, ctx.currentTime + 1.5);
      // The filter has to glide with the pitch or the timbre slides out from
      // under the note — the corner is a property of the voice, not of the room.
      v.filter.frequency.setTargetAtTime(hz * 3.5, ctx.currentTime, 0.5);
    });
  }
});

renderVoices();
renderEvents();
requestAnimationFrame(frame);
