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
  ASPECT_INTERVALS, chord, droneHz, slowestBeat, type Placement,
} from "../personal/tonal.js";
import {
  aspectCircle, cliffordPoint, pairRotation, separation, stereo3, type Vec3,
} from "../personal/torus.js";

const GLYPHS: Record<string, string> = {
  Sun: "☉", Moon: "☽", Mercury: "☿", Venus: "♀", Mars: "♂", Jupiter: "♃",
  Saturn: "♄", Uranus: "♅", Neptune: "♆", Pluto: "♇", Node: "☊", Chiron: "⚷",
};

/** A chart to open with, so the page makes a sound on first visit. Replace it
 *  in the panel — this page sounds a chart, it does not cast one. */
const DEFAULT_CHART = `Sun 228.6
Moon 41.2
Mercury 245.9
Venus 262.4
Mars 199.1
Jupiter 15.7
Saturn 258.3
Uranus 263.8
Neptune 276.5
Pluto 191.4`;

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

interface Playing {
  ctx: AudioContext;
  master: GainNode;
  voices: OscillatorNode[];
}
let playing: Playing | null = null;

function start(): void {
  const Ctor = window.AudioContext
    ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return;
  const ctx = new Ctor();

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, ctx.currentTime);
  // A slow swell rather than a switch. Sine voices starting at full gain click,
  // and a chord that arrives over three seconds is the difference between an
  // instrument and an alarm.
  master.gain.exponentialRampToValueAtTime(0.16, ctx.currentTime + 3);

  // One gentle lowpass across the whole chord. The map tops out at 440 Hz so
  // nothing here is bright, but the corner takes the edge off the higher
  // voices and lets the beating sit forward.
  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 1200;
  tone.Q.value = 0.4;

  const voices: OscillatorNode[] = [];
  const n = Math.max(1, placements.length);
  for (const p of placements) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(droneHz(p.longitude), ctx.currentTime);
    const g = ctx.createGain();
    // Divided by the count so a fourteen-body chart is not fourteen times as
    // loud as a six-body one, and slightly staggered so they do not all arrive
    // on the same sample.
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(1 / n, ctx.currentTime + 2 + Math.random() * 2);
    osc.connect(g).connect(tone);
    osc.start();
    voices.push(osc);
  }
  tone.connect(master).connect(ctx.destination);
  playing = { ctx, master, voices };
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
    for (const v of voices) { try { v.stop(); } catch { /* already stopped */ } }
    void ctx.close();
  }, 1600);
}

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

  el.innerHTML = `<div class="cap">Voices</div>` +
    voices.map((v) => `<div class="voice">
        <span class="g">${GLYPHS[v.id] ?? "·"}&#8202;<span style="font-family:var(--mono);font-size:11px;color:var(--ink-3)">${v.id}</span></span>
        <span class="hz">${v.hz.toFixed(1)} Hz</span>
      </div>`).join("") +
    (beat ? `<div class="beat">slowest beat · ${beat.a}&#8202;–&#8202;${beat.b}
       at ${beat.hz.toFixed(2)} Hz${named}</div>` : "");
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
playBtn.addEventListener("click", () => {
  if (playing) { stop(); playBtn.textContent = "▶ Sound the chart"; }
  else { start(); playBtn.textContent = "◼ Stop"; }
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
    playing.voices.forEach((osc, i) => {
      const p = placements[i];
      if (p) osc.frequency.linearRampToValueAtTime(droneHz(p.longitude), playing!.ctx.currentTime + 1.5);
    });
  }
});

renderVoices();
requestAnimationFrame(frame);
