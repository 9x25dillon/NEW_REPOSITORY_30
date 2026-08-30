// app/field.ts — the quasicrystal, sounded.
//
// Four layers over one structure:
//
//   THE BED       up to sixty voices, one per lattice point, pitched by radius
//                 in physical space. A slow phason drifts the cut through
//                 internal space, so points enter and leave while every voice
//                 that stays keeps its frequency. The field reorganises without
//                 the chord transposing.
//   SIX SWEEPS    three pairs, each pair crossing — one climbing while the other
//                 falls. Where they cross, the beat between them nulls.
//   BINAURAL      up to eight pairs, hard left and hard right, offset by a few
//                 hertz. This beat is not in the air; it is made in the head
//                 from two signals that never meet, which is why it needs
//                 headphones and why it survives a bed that would drown an
//                 acoustic beat.
//   TWO TONES     free, to 8 kHz, on their own faders.
//
// SUMMING. Sixty incoherent voices do not add like sixty coherent ones: power
// adds, not amplitude, so per-voice gain scales as 1/sqrt(n) rather than 1/n.
// At 1/n the field would vanish as voices were added; at 1/1 it would clip
// immediately. A limiter sits before the output for the peaks that get through
// anyway — it is a guard against clipping, not a substitute for turning it down.

import {
  accepted, cutAndProject, frequencies, phason, type QuasiPoint,
} from "../personal/quasicrystal.js";

// ── state ───────────────────────────────────────────────────────────────────

const S = {
  voices: 48, drift: 0.6, ceiling: 8000,
  sweeps: true, period: 70,
  pairs: 6, beat: 6.0, spread: 2.4,
  toneA: 220, toneAOn: true, toneB: 3400, toneBOn: true,
  gain: 0.35,
};

const LATTICE = cutAndProject(3, 2.8);
const WINDOW = 1.5;
let drift = { u: 0, v: 0 };
let field: QuasiPoint[] = [];
let fieldHz: number[] = [];

function rebuildField(): void {
  const live = accepted(phason(LATTICE, drift.u, drift.v), WINDOW);
  // Sample EVENLY across the accepted set by radius, rather than taking the
  // innermost n. Taking the innermost is the obvious slice and it packs every
  // sounding voice into a knot at the centre: the frequencies still span the
  // range, because they are normalised against the selection, but the structure
  // is invisible and the field looks like a dot. Spreading the selection makes
  // the point cloud show the quasicrystal it is drawn from, and gives the same
  // span with the pitches distributed over real geometry.
  if (live.length === 0 || S.voices === 0) { field = []; fieldHz = []; return; }
  const stride = Math.max(1, live.length / S.voices);
  field = [];
  for (let i = 0; field.length < S.voices && Math.floor(i * stride) < live.length; i++) {
    field.push(live[Math.floor(i * stride)]);
  }
  fieldHz = frequencies(field, 40, S.ceiling);
}

// ── audio ───────────────────────────────────────────────────────────────────

interface Rig {
  ctx: AudioContext;
  master: GainNode;
  bed: Array<{ osc: OscillatorNode; g: GainNode }>;
  sweeps: OscillatorNode[];
  binaural: Array<{ l: OscillatorNode; r: OscillatorNode }>;
  tones: Array<{ osc: OscillatorNode; g: GainNode }>;
  startedAt: number;
}
let rig: Rig | null = null;

/** Equal-power gain for n incoherent voices. */
const perVoice = (n: number) => (n > 0 ? 1 / Math.sqrt(n) : 1);

function build(): void {
  const Ctor = window.AudioContext
    ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return;
  const ctx = new Ctor();

  // A limiter, not a compressor used as tone. Ratio 20 with a fast attack and a
  // high threshold catches the peaks when a sweep crosses the bed in phase and
  // does nothing at all the rest of the time.
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, ctx.currentTime);
  master.gain.exponentialRampToValueAtTime(Math.max(S.gain, 0.001), ctx.currentTime + 2.5);
  master.connect(limiter).connect(ctx.destination);

  const t0 = ctx.currentTime;
  const bedGain = perVoice(Math.max(1, fieldHz.length)) * 0.55;

  const bed = fieldHz.map((hz) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(hz, t0);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(bedGain, t0 + 1.5 + Math.random() * 2.5);
    osc.connect(g).connect(master);
    osc.start();
    return { osc, g };
  });

  // Six sweeps as three crossing pairs, each pair over its own band so the
  // crossings land at three different pitches rather than all at once.
  const sweeps: OscillatorNode[] = [];
  if (S.sweeps) {
    const bands: Array<[number, number]> = [[60, 900], [200, 2600], [700, 6000]];
    const sg = perVoice(6) * 0.30;
    for (const [lo, hi] of bands) {
      for (const up of [true, false]) {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        const a = up ? lo : hi;
        const b = up ? hi : lo;
        osc.frequency.setValueAtTime(a, t0);
        // There and back, so the pair keeps crossing rather than sweeping once
        // and ending. Four legs is long enough to lose track of, which is the
        // point of a field you stop having to follow.
        for (let leg = 1; leg <= 4; leg++) {
          osc.frequency.linearRampToValueAtTime(leg % 2 ? b : a, t0 + leg * S.period);
        }
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(sg, t0 + 3);
        osc.connect(g).connect(master);
        osc.start();
        sweeps.push(osc);
      }
    }
  }

  // Binaural pairs: hard left and hard right, offset by the beat. The two
  // signals never mix in the air, so the difference is constructed downstream
  // of the ears — which is why the bed cannot mask it.
  const binaural: Array<{ l: OscillatorNode; r: OscillatorNode }> = [];
  if (S.pairs > 0) {
    const bg = perVoice(S.pairs * 2) * 0.42;
    for (let i = 0; i < S.pairs; i++) {
      // Carriers spread across the low-mid, where binaural beating works best;
      // above roughly 1 kHz the effect falls away because the ear stops using
      // phase to localise.
      const carrier = 110 * Math.pow(2, (i * 7) / 12);
      const offset = S.beat + (i - (S.pairs - 1) / 2) * (S.spread / Math.max(1, S.pairs - 1));
      const pair = (hz: number, pan: number) => {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(hz, t0);
        const p = ctx.createStereoPanner();
        p.pan.value = pan;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(bg, t0 + 2 + Math.random());
        osc.connect(g).connect(p).connect(master);
        osc.start();
        return osc;
      };
      binaural.push({
        l: pair(carrier - offset / 2, -1),
        r: pair(carrier + offset / 2, 1),
      });
    }
  }

  const tones = ([[S.toneA, S.toneAOn], [S.toneB, S.toneBOn]] as const).map(([hz, on]) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(hz, t0);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(on ? 0.18 : 0.0001, t0 + 2);
    osc.connect(g).connect(master);
    osc.start();
    return { osc, g };
  });

  rig = { ctx, master, bed, sweeps, binaural, tones, startedAt: performance.now() };
}

function teardown(): void {
  if (!rig) return;
  const { ctx, master } = rig;
  const all = [
    ...rig.bed.map((b) => b.osc), ...rig.sweeps,
    ...rig.binaural.flatMap((p) => [p.l, p.r]), ...rig.tones.map((t) => t.osc),
  ];
  rig = null;
  master.gain.cancelScheduledValues(ctx.currentTime);
  master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), ctx.currentTime);
  master.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.6);
  window.setTimeout(() => {
    for (const o of all) { try { o.stop(); } catch { /* already stopped */ } }
    void ctx.close();
  }, 1900);
}

/** Live parameter changes that do not need the rig rebuilt. */
function retune(): void {
  if (!rig) return;
  const t = rig.ctx.currentTime;
  rig.master.gain.setTargetAtTime(Math.max(S.gain, 0.0001), t, 0.2);
  rig.tones.forEach((v, i) => {
    const hz = i === 0 ? S.toneA : S.toneB;
    const on = i === 0 ? S.toneAOn : S.toneBOn;
    v.osc.frequency.setTargetAtTime(hz, t, 0.08);
    v.g.gain.setTargetAtTime(on ? 0.18 : 0.0001, t, 0.15);
  });
  rig.binaural.forEach((p, i) => {
    const carrier = 110 * Math.pow(2, (i * 7) / 12);
    const offset = S.beat + (i - (S.pairs - 1) / 2) * (S.spread / Math.max(1, S.pairs - 1));
    p.l.frequency.setTargetAtTime(carrier - offset / 2, t, 0.3);
    p.r.frequency.setTargetAtTime(carrier + offset / 2, t, 0.3);
  });
}

// ── drawing ─────────────────────────────────────────────────────────────────

const cv = document.getElementById("c") as HTMLCanvasElement;
const cx2 = cv.getContext("2d")!;
const strip = document.getElementById("strip") as HTMLCanvasElement;
const sx2 = strip.getContext("2d")!;
const readout = document.getElementById("readout")!;

const reduced = typeof matchMedia === "function"
  && matchMedia("(prefers-reduced-motion: reduce)").matches;

function sweepFreqAt(elapsed: number, lo: number, hi: number, up: boolean): number {
  const leg = elapsed / S.period;
  const phase = leg % 2;
  const t = phase < 1 ? phase : 2 - phase;
  return up ? lo + (hi - lo) * t : hi - (hi - lo) * t;
}
const BANDS: Array<[number, number]> = [[60, 900], [200, 2600], [700, 6000]];

function drawField(): void {
  const w = cv.width;
  const h = cv.height;
  cx2.clearRect(0, 0, w, h);
  const px = w / 1600;
  const scale = Math.min(w, h) / 22;
  const cxc = w / 2;
  const cyc = h / 2;

  // the whole lattice, faint — the structure the cut is taking from
  cx2.fillStyle = "#9d7bd8";
  for (const p of LATTICE) {
    if (Math.abs(p.x) > 11 || Math.abs(p.y) > 11) continue;
    cx2.globalAlpha = 0.06;
    cx2.beginPath();
    cx2.arc(cxc + p.x * scale, cyc + p.y * scale, 1.4 * px, 0, Math.PI * 2);
    cx2.fill();
  }

  // the sounding voices, lit and sized by pitch
  field.forEach((p, i) => {
    const hz = fieldHz[i] ?? 40;
    const t = Math.log(hz / 40) / Math.log(S.ceiling / 40);
    const x = cxc + p.x * scale;
    const y = cyc + p.y * scale;
    cx2.globalAlpha = 0.18;
    cx2.fillStyle = "#4fd0d8";
    cx2.beginPath();
    cx2.arc(x, y, (10 - 5 * t) * px, 0, Math.PI * 2);
    cx2.fill();
    cx2.globalAlpha = 0.9;
    cx2.fillStyle = t > 0.55 ? "#4fd0d8" : "#c8a8f0";
    cx2.beginPath();
    cx2.arc(x, y, (3.4 - 1.4 * t) * px, 0, Math.PI * 2);
    cx2.fill();
  });
  cx2.globalAlpha = 1;
}

const stripX = (hz: number, w: number) =>
  (Math.log(Math.max(hz, 20)) - Math.log(20)) / (Math.log(9000) - Math.log(20)) * w;

function drawStrip(): void {
  const w = strip.width;
  const h = strip.height;
  const px = w / 1600;
  sx2.clearRect(0, 0, w, h);

  sx2.strokeStyle = "#2a2244";
  sx2.lineWidth = 1 * px;
  sx2.beginPath(); sx2.moveTo(0, h * 0.62); sx2.lineTo(w, h * 0.62); sx2.stroke();

  sx2.font = `${Math.round(15 * px)}px "IBM Plex Mono", monospace`;
  sx2.fillStyle = "#726592";
  for (const hz of [100, 500, 1000, 4000, 8000]) {
    const x = stripX(hz, w);
    sx2.globalAlpha = 0.5;
    sx2.beginPath(); sx2.moveTo(x, h * 0.58); sx2.lineTo(x, h * 0.66); sx2.stroke();
    sx2.fillText(hz >= 1000 ? `${hz / 1000}k` : String(hz), x + 4 * px, h * 0.92);
  }

  sx2.globalAlpha = 0.75;
  sx2.strokeStyle = "#c8a8f0";
  sx2.lineWidth = 1.6 * px;
  for (const hz of fieldHz) {
    const x = stripX(hz, w);
    sx2.beginPath(); sx2.moveTo(x, h * 0.42); sx2.lineTo(x, h * 0.62); sx2.stroke();
  }

  const elapsed = rig ? (performance.now() - rig.startedAt) / 1000 : 0;
  if (rig && S.sweeps) {
    sx2.strokeStyle = "#4fd0d8";
    sx2.lineWidth = 2 * px;
    for (const [lo, hi] of BANDS) {
      for (const up of [true, false]) {
        const x = stripX(sweepFreqAt(elapsed, lo, hi, up), w);
        sx2.globalAlpha = 0.9;
        sx2.beginPath(); sx2.moveTo(x, h * 0.1); sx2.lineTo(x, h * 0.62); sx2.stroke();
      }
    }
  }

  sx2.strokeStyle = "#e0a355";
  sx2.lineWidth = 2.5 * px;
  for (const [hz, on] of [[S.toneA, S.toneAOn], [S.toneB, S.toneBOn]] as const) {
    if (!on) continue;
    const x = stripX(hz, w);
    sx2.globalAlpha = 0.95;
    sx2.beginPath(); sx2.moveTo(x, h * 0.1); sx2.lineTo(x, h * 0.75); sx2.stroke();
  }
  sx2.globalAlpha = 1;
}

function updateReadout(): void {
  const n = fieldHz.length;
  const total = n + (S.sweeps ? 6 : 0) + S.pairs * 2
    + (S.toneAOn ? 1 : 0) + (S.toneBOn ? 1 : 0);
  const lo = n ? fieldHz[0] : 0;
  const hi = n ? fieldHz[n - 1] : 0;
  const beats = Array.from({ length: S.pairs }, (_, i) =>
    S.beat + (i - (S.pairs - 1) / 2) * (S.spread / Math.max(1, S.pairs - 1)));
  readout.innerHTML =
    `<b>${total}</b> voices sounding · field ${n} from ${lo.toFixed(0)} to ${hi.toFixed(0)} Hz · ` +
    `per-voice gain 1/√${n || 1} = ${(1 / Math.sqrt(Math.max(1, n))).toFixed(3)}<br>` +
    (S.pairs
      ? `binaural beats ${beats.map((b) => b.toFixed(1)).join(", ")} Hz — carriers 110 Hz up in fifths, hard L and R`
      : "binaural off") +
    (S.sweeps ? ` · six sweeps over 60–900, 200–2600, 700–6000 Hz, ${S.period}s a leg` : "");
}

let last = performance.now();
let lastRebuild = 0;
function frame(now: number): void {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  if (!reduced && S.drift > 0 && now - lastRebuild > 90) {
    // The phason walks a slow circle through internal space, so the field keeps
    // reorganising without ever returning to the same arrangement twice. The
    // second axis runs at an irrational-ish ratio to the first so the walk does
    // not close.
    //
    // Two numbers here were wrong at first. The rate was 0.05, which advanced
    // the cut by 0.075 radians in two and a half seconds — mathematically a
    // drift and visually a still image, and a browser check caught it as
    // "the field does not move". And the rebuild ran every frame, filtering
    // five thousand lattice points sixty times a second to produce a set that
    // had barely changed; throttling to ~11 Hz is well above what the eye reads
    // as continuous and a fifth of the work.
    const a = (now / 1000) * S.drift * 0.15;
    drift = { u: Math.cos(a) * 0.9, v: Math.sin(a * 0.7) * 0.9 };
    rebuildField();
    lastRebuild = now;
  }
  void dt;
  drawField();
  drawStrip();
  updateReadout();
  requestAnimationFrame(frame);
}

// ── controls ────────────────────────────────────────────────────────────────

const el = (id: string) => document.getElementById(id) as HTMLInputElement;
const txt = (id: string, v: string) => { document.getElementById(id)!.textContent = v; };

function bind(id: string, label: string, fmt: (n: number) => string, set: (n: number) => void,
              rebuild = false): void {
  const input = el(id);
  const apply = () => {
    const n = Number(input.value);
    set(n);
    txt(label, fmt(n));
    if (rebuild) rebuildField();
    retune();
  };
  input.addEventListener("input", apply);
  apply();
}

bind("voices", "vVoices", (n) => String(n), (n) => { S.voices = n; }, true);
bind("drift", "vDrift", (n) => (n / 10).toFixed(1), (n) => { S.drift = n / 10; });
bind("ceil", "vCeil", (n) => `${n} Hz`, (n) => { S.ceiling = n; }, true);
bind("period", "vPeriod", (n) => `${n} s`, (n) => { S.period = n; });
bind("pairs", "vPairs", (n) => String(n), (n) => { S.pairs = n; });
bind("beat", "vBeat", (n) => `${(n / 10).toFixed(1)} Hz`, (n) => { S.beat = n / 10; });
bind("spread", "vSpread", (n) => `${(n / 10).toFixed(1)} Hz`, (n) => { S.spread = n / 10; });
bind("toneA", "vA", (n) => `${n} Hz`, (n) => { S.toneA = n; });
bind("toneB", "vB", (n) => `${n} Hz`, (n) => { S.toneB = n; });
bind("gain", "vGain", (n) => (n / 100).toFixed(2), (n) => { S.gain = n / 100; });

function toggle(id: string, get: () => boolean, set: (v: boolean) => void): void {
  const b = document.getElementById(id)!;
  b.addEventListener("click", () => {
    set(!get());
    b.setAttribute("aria-pressed", String(get()));
    retune();
  });
}
toggle("tgSweep", () => S.sweeps, (v) => { S.sweeps = v; });
toggle("tgA", () => S.toneAOn, (v) => { S.toneAOn = v; });
toggle("tgB", () => S.toneBOn, (v) => { S.toneBOn = v; });

const go = document.getElementById("go")!;
go.addEventListener("click", () => {
  if (rig) { teardown(); go.textContent = "▶ Start"; }
  else {
    // Anything that changes the number of oscillators needs the rig rebuilt, so
    // those take effect on the next start rather than mid-flight. Frequencies,
    // levels and beat rates glide live.
    rebuildField();
    build();
    go.textContent = "◼ Stop";
  }
  document.getElementById("meta")!.textContent = rig
    ? "voice count and sweep on/off apply on restart"
    : "";
});

rebuildField();
requestAnimationFrame(frame);
