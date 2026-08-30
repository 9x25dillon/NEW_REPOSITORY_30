// app/main.ts — the three screens, on top of the library and nothing else.
//
// No framework and no build step beyond `tsc`. The app imports the same modules
// the tests import, so a number on screen and a number in a test come from one
// implementation — which is the only way the provenance tags can mean anything.
//
// Screen order is the workflow: choose a wafer, design a device, measure the
// cells that turn its assumptions into claims.

import {
  POINT_GROUPS, SUBSTRATES, isEnantiomorphic, isPiezoelectric, isPolar, pointGroup,
} from "../src/pointgroups.js";
import { drivableCoefficients, independentComponents } from "../src/neumann.js";
import {
  SAW_SUBSTRATES, bawField, bawResonance, energyDensity, rayleighAngle,
  ssawField, ssawFrequency, ssawWavelength, trapPositions, type StandingWave1D,
} from "../src/fields.js";
import {
  CROSSOVER_RADIUS_ORDER, WATER, contrastFactor, type Medium, type Particle,
} from "../src/gorkov.js";
import { focusTime, maxSweepSpeed } from "../src/trajectory.js";
import {
  contrastFromTrack, propertiesFromContrasts, type ContrastMeasurement, type Track,
} from "../src/inversion.js";
import {
  GLYPH, assumed, blame, derive, measured, verdict, type Tagged,
} from "../src/provenance.js";
import {
  SOHNCKE_GROUPS, axialPattern, candidates, groupsOfPointGroup,
  type Reflection,
} from "../src/sohncke.js";
import { BIOLOGY, MEASURED } from "../config/subject.js";

// ── state ───────────────────────────────────────────────────────────────────

type View = "substrates" | "device" | "measure" | "crystals";

interface State {
  view: View;
  /** BAW or SAW. */
  mode: "baw" | "saw";
  widthUm: number;
  harmonic: number;
  pitchUm: number;
  substrateIdx: number;
  mediumRho: number;
  mediumC: number;
  amplitudeKPa: number;
  radiusUm: number;
  /** Null until a measurement is taken on the Measure screen. */
  cell: { rho: number; c: number; source: string } | null;
}

const state: State = {
  view: "substrates",
  mode: "baw",
  widthUm: 375,
  harmonic: 1,
  pitchUm: 50,
  substrateIdx: 0,
  mediumRho: WATER.rho,
  mediumC: WATER.c,
  amplitudeKPa: 100,
  radiusUm: BIOLOGY.radius * 1e6,
  cell: MEASURED
    ? { rho: MEASURED.rho, c: MEASURED.c, source: `measured ${MEASURED.date}` }
    : null,
};

// ── helpers ─────────────────────────────────────────────────────────────────

const $ = (sel: string) => document.querySelector(sel) as HTMLElement;
const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

/** Significant-figure formatting that keeps small and large numbers readable. */
function fmt(x: number, sig = 4): string {
  if (!Number.isFinite(x)) return "—";
  if (x === 0) return "0";
  const a = Math.abs(x);
  if (a >= 1e5 || a < 1e-3) return x.toExponential(2);
  return Number(x.toPrecision(sig)).toString();
}

function tile(t: Tagged<number>, unit: string, scale = 1, sig = 4): string {
  return `<div class="tile ${t.provenance}">
    <span class="k">${esc(t.label)}</span>
    <span class="n">${fmt(t.value * scale, sig)}${unit ? `<span class="u">${esc(unit)}</span>` : ""}</span>
    <span class="chip ${t.provenance}">${GLYPH[t.provenance]} ${t.provenance}</span>
  </div>`;
}

function field(label: string, id: string, value: number | string, step = "any"): string {
  return `<label class="f"><span>${esc(label)}</span>
    <input id="${id}" type="number" step="${step}" value="${value}"></label>`;
}

const LEGEND = `<div class="legend">
  <span><b style="color:var(--measured)">${GLYPH.measured} measured</b> — on an instrument</span>
  <span><b style="color:var(--derived)">${GLYPH.derived} derived</b> — computed exactly</span>
  <span><b style="color:var(--assumed)">${GLYPH.assumed} assumed</b> — literature stand-in</span>
</div>`;

// ── screen 1 · substrates ───────────────────────────────────────────────────

function substratesView(): string {
  const rows = POINT_GROUPS.map((g) => {
    const piezo = isPiezoelectric(g);
    const d = piezo ? drivableCoefficients(g.hm) : [];
    return `<tr class="${piezo ? "" : "no"}">
      <td class="mono">${esc(g.hm)}</td>
      <td class="mono">${esc(g.schoenflies)}</td>
      <td>${esc(g.system)}</td>
      <td class="mono">${g.order}</td>
      <td>${piezo ? '<span class="yes">yes</span>' : '<span class="nope">no</span>'}</td>
      <td>${isPolar(g) ? '<span class="yes">yes</span>' : '<span class="nope">·</span>'}</td>
      <td>${isEnantiomorphic(g) ? '<span class="yes">yes</span>' : '<span class="nope">·</span>'}</td>
      <td class="mono">${independentComponents(g.hm, "piezoelectric")}</td>
      <td class="mono" style="white-space:normal">${d.length ? esc(d.join(" ")) : "—"}</td>
    </tr>`;
  }).join("");

  const wafers = SAW_SUBSTRATES.map((s) => {
    const d = drivableCoefficients(s.hm);
    return `<tr>
      <td>${esc(s.name)}</td>
      <td class="mono">${esc(s.hm)}</td>
      <td style="white-space:normal">${esc(s.cut)}</td>
      <td class="mono">${s.velocity} m/s</td>
      <td class="mono" style="white-space:normal">${esc(d.join(" "))}</td>
    </tr>`;
  }).join("");

  const named = SUBSTRATES.map((s) => `<tr>
      <td>${esc(s.name)}</td><td class="mono">${esc(s.formula)}</td>
      <td class="mono">${esc(s.hm)}</td>
      <td style="white-space:normal;font-size:12px;color:var(--ink-2)">${esc(s.note)}</td>
    </tr>`).join("");

  const piezoCount = POINT_GROUPS.filter(isPiezoelectric).length;
  const acentric = POINT_GROUPS.filter((g) => !g.inversion).length;

  return `
  <h2>Substrates</h2>
  <p class="sub">Which crystals can carry a wave, and on which coefficient</p>

  <div class="panel">
    <p style="margin:0 0 4px">
      A rank-3 tensor is odd under inversion, so in a centrosymmetric group every
      piezoelectric component equals its own negative and the whole tensor
      vanishes. <b>No piezoelectricity, no interdigital transducer, no surface
      wave.</b> Choosing a substrate is a symmetry question before it is a
      materials question.
    </p>
    <p class="note">
      ${acentric} of the 32 groups are non-centrosymmetric; <b>${piezoCount}</b>
      are piezoelectric. The one that is neither is <code>432</code>, where the
      remaining rotations cancel the tensor anyway — computed here from
      characters, not looked up.
    </p>
  </div>

  <div class="panel">
    <h2 style="font-size:1rem">Wafers you would actually use</h2>
    <p class="sub" style="margin-bottom:12px">Velocity is cut-dependent; symmetry is not</p>
    <div class="scroll"><table>
      <tr><th>Material</th><th>Group</th><th>Cut</th><th class="mono">SAW velocity</th><th>Drivable</th></tr>
      ${wafers}
    </table></div>
  </div>

  <div class="panel">
    <div class="scroll"><table>
      <tr><th>Material</th><th>Formula</th><th>Group</th><th>Note</th></tr>
      ${named}
    </table></div>
  </div>

  <div class="panel">
    <h2 style="font-size:1rem">All 32 point groups</h2>
    <p class="sub" style="margin-bottom:12px">Greyed rows cannot be driven at all</p>
    <div class="scroll"><table>
      <tr><th>HM</th><th>Schoenflies</th><th>System</th><th class="mono">Order</th>
          <th>Piezo</th><th>Polar</th><th>Chiral</th><th class="mono">d free</th><th>Coefficients</th></tr>
      ${rows}
    </table></div>
  </div>`;
}

// ── screen 2 · device ───────────────────────────────────────────────────────

function deviceView(): string {
  const medium: Medium = { rho: state.mediumRho, c: state.mediumC };
  const amplitude = state.amplitudeKPa * 1000;
  const radius = state.radiusUm * 1e-6;

  // ── the particle, and where its numbers come from ──
  const cellRho = state.cell
    ? measured("cell density", state.cell.rho, state.cell.source)
    : assumed("cell density", BIOLOGY.rho, BIOLOGY.provenance);
  const cellC = state.cell
    ? measured("cell sound speed", state.cell.c, state.cell.source)
    : assumed("cell sound speed", BIOLOGY.c, BIOLOGY.provenance);
  const rTag = measured("cell radius", radius, "entered from microscopy");

  const particle: Particle = { radius, rho: cellRho.value, c: cellC.value };
  const phi = derive("contrast factor", contrastFactor(particle, medium),
    "from the density and compressibility contrasts", [cellRho, cellC]);

  // ── the field ──
  let wave: StandingWave1D;
  let inputs: Tagged<unknown>[];
  let freqTag: Tagged<number>;
  let extra = "";
  const guards: string[] = [];

  if (state.mode === "baw") {
    const w = measured("channel width", state.widthUm * 1e-6, "entered from the chip drawing");
    const ch = { width: w.value, mode: state.harmonic, medium };
    wave = bawField(ch, amplitude);
    freqTag = derive("resonance", bawResonance(ch), "c / 2w for the half-wavelength mode", [w]);
    inputs = [w, freqTag];
    extra = `<p class="note">Ideal-hard-wall result. A real chip sits close but not
      on it — tune to the measured peak and use this to know which peak.</p>`;
  } else {
    const sub = SAW_SUBSTRATES[state.substrateIdx];
    const p = measured("finger pitch", state.pitchUm * 1e-6, "entered from the mask");
    const dev = { fingerPitch: p.value, substrate: sub, medium };
    wave = ssawField(dev, amplitude);
    freqTag = derive("drive frequency", ssawFrequency(dev),
      "substrate velocity over wavelength", [p]);
    inputs = [p, freqTag];
    try {
      const ang = (rayleighAngle(dev) * 180) / Math.PI;
      extra = `<p class="note">Rayleigh angle <b>${fmt(ang, 3)}°</b> — the wave
        leaks into the fluid at Snell's angle. Node spacing is half the acoustic
        wavelength, ${fmt(ssawWavelength(dev) * 5e5, 3)} µm.</p>`;
    } catch (e) {
      guards.push(`<div class="guard"><b>This device cannot couple</b>
        ${esc((e as Error).message)}</div>`);
    }
    if (!isPiezoelectric(pointGroup(sub.hm))) {
      guards.push(`<div class="guard"><b>Not piezoelectric</b>
        ${esc(sub.hm)} is centrosymmetric — no IDT can launch a wave on it.</div>`);
    }
  }

  // Span matters. A BAW channel is BOUNDED by its walls, so traps are counted
  // across the width; passing the wavelength instead reported two traps in a
  // 375 um channel that has exactly one, the second sitting outside the chip.
  // An SSAW field is periodic and unbounded along the substrate, so there one
  // wavelength is the right window and the pattern simply repeats.
  const span = state.mode === "baw" ? state.widthUm * 1e-6 : wave.wavelength;
  const traps = trapPositions(wave, particle, span);
  const trapTag = derive("first trap", traps.length ? traps[0] : NaN,
    phi.value > 0 ? "pressure node" : "pressure antinode", [...inputs, phi]);
  const eac = derive("energy density", energyDensity(wave), "from the amplitude", inputs);
  const u0 = (Math.PI / (2 * wave.k)) * 0.1;
  const tFocus = derive("focus time (95%)", focusTime(wave, u0, particle),
    "from the closed-form trajectory", [...inputs, phi, rTag]);

  // ── guards ──
  if (radius < CROSSOVER_RADIUS_ORDER * 1.5) {
    guards.push(`<div class="guard"><b>Below the streaming crossover</b>
      Radiation force goes as a³ and streaming drag as a, so their ratio goes as
      a². Around ${fmt(CROSSOVER_RADIUS_ORDER * 1e6, 2)} µm streaming wins and the
      trap stops holding. This particle is ${fmt(state.radiusUm, 2)} µm.</div>`);
  }
  if (Math.abs(phi.value) < 0.005) {
    guards.push(`<div class="guard"><b>Near the iso-acoustic point</b>
      Contrast is ${fmt(phi.value, 2)} — this particle barely feels the field in
      this medium. Change the medium density or expect no focusing.</div>`);
  }
  if (state.mode === "saw") {
    const v = maxSweepSpeed(wave, particle);
    extra += `<p class="note">Maximum sweep speed before cells slip a node:
      <b>${fmt(v * 1e6, 3)} µm/s</b>. Faster and they are left behind, which looks
      exactly like cells that did not move.</p>`;
  }

  const headline = tFocus;
  const cause = blame(headline);

  return `
  <h2>Device</h2>
  <p class="sub">Geometry in, trap positions out — every figure tagged</p>
  ${LEGEND}
  <div class="grid2">
    <div class="panel">
      <label class="f"><span>Device class</span>
        <select id="mode">
          <option value="baw"${state.mode === "baw" ? " selected" : ""}>BAW — resonant channel</option>
          <option value="saw"${state.mode === "saw" ? " selected" : ""}>SSAW — surface wave</option>
        </select></label>
      ${state.mode === "baw"
        ? field("Channel width (µm)", "widthUm", state.widthUm, "1") +
          field("Harmonic n", "harmonic", state.harmonic, "1")
        : `${field("IDT finger pitch (µm)", "pitchUm", state.pitchUm, "1")}
           <label class="f"><span>Substrate</span><select id="substrateIdx">
             ${SAW_SUBSTRATES.map((s, i) =>
               `<option value="${i}"${i === state.substrateIdx ? " selected" : ""}>${esc(s.name)} · ${esc(s.hm)}</option>`).join("")}
           </select></label>`}
      <div class="row">
        ${field("Medium ρ (kg/m³)", "mediumRho", state.mediumRho, "1")}
        ${field("Medium c (m/s)", "mediumC", state.mediumC, "1")}
      </div>
      ${field("Pressure amplitude (kPa)", "amplitudeKPa", state.amplitudeKPa, "1")}
      ${field("Cell radius (µm)", "radiusUm", state.radiusUm, "0.1")}
      <p class="note">${state.cell
        ? `Cell properties are <b style="color:var(--measured)">measured</b> (${esc(state.cell.source)}).`
        : `Cell properties are <b style="color:var(--assumed)">assumed</b>. Take a measurement to change that.`}</p>
    </div>

    <div>
      <div class="tiles">
        ${tile(freqTag, "MHz", 1e-6)}
        ${tile(phi, "")}
        ${tile(trapTag, "µm", 1e6)}
        ${tile(tFocus, "s", 1)}
        ${tile(eac, "J/m³", 1)}
      </div>
      ${guards.join("")}
      <div class="verdict ${headline.provenance}">
        <div class="lead">${traps.length
          ? `Cells collect at ${traps.length} ${traps.length === 1 ? "position" : "positions"}, first at ${fmt(traps[0] * 1e6, 4)} µm.`
          : "No trap — this particle has no contrast in this medium."}</div>
        <div class="why">${esc(verdict(headline))}${
          cause.length ? "" : ""}</div>
      </div>
      ${extra}
      ${wavePlot(wave, traps, span)}
    </div>
  </div>`;
}

/** The standing wave across the device, with the traps marked. */
function wavePlot(wave: StandingWave1D, traps: number[], span: number): string {
  const W = 620;
  const H = 120;
  const pad = 14;
  const pts: string[] = [];
  const N = 200;
  for (let i = 0; i <= N; i++) {
    const u = (i / N) * span;
    const p = Math.cos(wave.k * u + wave.phase);
    const x = pad + (i / N) * (W - 2 * pad);
    const y = H / 2 - p * (H / 2 - 12);
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  const marks = traps.map((t) => {
    const x = pad + (t / span) * (W - 2 * pad);
    return `<line x1="${x.toFixed(1)}" y1="6" x2="${x.toFixed(1)}" y2="${H - 6}"
      stroke="var(--measured)" stroke-width="1.2" stroke-dasharray="2 3" opacity="0.85"/>
      <circle cx="${x.toFixed(1)}" cy="${H / 2}" r="4" fill="var(--measured)"/>`;
  }).join("");
  return `<div class="panel" style="margin-top:14px">
    <p class="sub" style="margin-bottom:8px">Pressure across the device · traps marked</p>
    <svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img"
      aria-label="Standing pressure wave with trap positions marked">
      <line x1="${pad}" y1="${H / 2}" x2="${W - pad}" y2="${H / 2}" stroke="var(--rule)"/>
      <polyline points="${pts.join(" ")}" fill="none" stroke="var(--accent)" stroke-width="2"/>
      ${marks}
    </svg>
    <p class="note">Span ${fmt(span * 1e6, 4)} µm. Cells with positive contrast
      collect at the pressure nodes; negative contrast sends them to the antinodes.</p>
  </div>`;
}

// ── screen 3 · measure ──────────────────────────────────────────────────────

const SAMPLE_TRACK = `# t (s), u (um from the wall)
# Generated from the forward model for the literature-default cell in water at
# 100 kPa, so fitting it should return that cell's contrast factor and an r2 of
# 1. Replace with your own tracking output.
0.0, 18.75
0.4, 23.73
0.8, 29.94
1.2, 37.61
1.6, 46.91
2.0, 57.92
2.4, 70.52
2.8, 84.31
3.2, 98.62
3.6, 112.66`;

function parseTrack(text: string): Track[] {
  return text.split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const [a, b] = l.split(/[,\s]+/).map(Number);
      if (!Number.isFinite(a) || !Number.isFinite(b)) {
        throw new Error(`cannot read "${l}" as "time, position"`);
      }
      return { t: a, u: b * 1e-6 };
    });
}

let measureResults: { html: string } = { html: "" };

function measureView(): string {
  return `
  <h2>Measure</h2>
  <p class="sub">Tracked positions in, contrast factor out — the step that turns amber green</p>

  <div class="panel">
    <p style="margin:0 0 4px">
      A cell in a standing wave follows <code>tan(k·u) = tan(k·u₀)·exp(2kAt)</code>
      exactly, so <b>ln|tan(k·u)| is a straight line in t</b>. Its slope gives the
      rate constant, and the rate constant gives the contrast factor. No initial
      guess, and an r² that says whether the cell was following the model.
    </p>
    <p class="note">Φ is one number containing two unknowns, so a single medium
      constrains a curve and pins neither. Repeat in media of different density
      and the fit intersects them.</p>
  </div>

  <div class="grid2">
    <div class="panel">
      ${field("Channel width (µm)", "m_width", state.widthUm, "1")}
      ${field("Pressure amplitude (kPa)", "m_amp", state.amplitudeKPa, "1")}
      ${field("Cell radius (µm)", "m_radius", state.radiusUm, "0.1")}
      <div class="row">
        ${field("Medium ρ (kg/m³)", "m_rho", state.mediumRho, "1")}
        ${field("Medium c (m/s)", "m_c", state.mediumC, "1")}
      </div>
      <label class="f"><span>Tracked positions — one "t, u" per line</span>
        <textarea id="m_track" rows="11">${esc(SAMPLE_TRACK)}</textarea></label>
      <button class="btn" id="m_fit">Fit this run</button>
      <p class="note">Points within 5% of the wall or the centre line are dropped:
        tan is zero at one and divergent at the other.</p>
    </div>
    <div id="m_out">${measureResults.html || `<div class="panel">
      <p style="margin:0;color:var(--ink-3)">Fit a run to see the contrast factor.
      Add runs in at least two media of different density to solve for density and
      compressibility.</p></div>`}</div>
  </div>`;
}

const collected: ContrastMeasurement[] = [];

function runFit(): void {
  const num = (id: string) => Number((document.getElementById(id) as HTMLInputElement).value);
  const out = $("#m_out");
  try {
    const track = parseTrack((document.getElementById("m_track") as HTMLTextAreaElement).value);
    const medium: Medium = { rho: num("m_rho"), c: num("m_c") };
    const wave = bawField({ width: num("m_width") * 1e-6, mode: 1, medium }, num("m_amp") * 1000);
    const fit = contrastFromTrack(track, wave, num("m_radius") * 1e-6);

    collected.push({ medium, phi: fit.phi, label: `ρ = ${medium.rho}` });

    let solved = "";
    try {
      const props = propertiesFromContrasts(collected);
      state.cell = { rho: props.rho, c: props.c, source: `${collected.length} media, this session` };
      solved = `<div class="panel">
        <div class="tiles">
          <div class="tile measured"><span class="k">Cell density</span>
            <span class="n">${fmt(props.rho, 5)}<span class="u">kg/m³</span></span>
            <span class="chip measured">${GLYPH.measured} measured</span></div>
          <div class="tile measured"><span class="k">Sound speed</span>
            <span class="n">${fmt(props.c, 5)}<span class="u">m/s</span></span>
            <span class="chip measured">${GLYPH.measured} measured</span></div>
          <div class="tile measured"><span class="k">Compressibility</span>
            <span class="n">${fmt(props.kappa, 3)}<span class="u">1/Pa</span></span>
            <span class="chip measured">${GLYPH.measured} measured</span></div>
          <div class="tile derived"><span class="k">Residual</span>
            <span class="n">${fmt(props.residual, 2)}</span>
            <span class="chip derived">${GLYPH.derived} fit</span></div>
        </div>
        <p class="ok">✓ The Device screen now uses these. Its amber tiles have
          turned <b>derived</b> — not measured.</p>
        <p class="note">That distinction is the rule working, not a shortfall.
          Nobody measured a focus time; it is computed from things that were.
          "Derived" is the strongest tag a calculated number can carry, and it
          is the difference between "we observed this cell focus in 42 ms" and
          "we calculate that it should".</p>
        <p class="note">Residual is RMS disagreement between media in units of Φ.
          Compare it against the scatter of your own repeats — much larger means
          one medium disagrees, and averaging would bury that.</p>
      </div>`;
    } catch (e) {
      solved = `<div class="panel"><p class="note" style="margin:0">
        ${esc((e as Error).message)}</p></div>`;
    }

    out.innerHTML = `<div class="panel">
      <div class="tiles">
        <div class="tile measured"><span class="k">Contrast factor Φ</span>
          <span class="n">${fmt(fit.phi, 4)}</span>
          <span class="chip measured">${GLYPH.measured} measured</span></div>
        <div class="tile derived"><span class="k">r²</span>
          <span class="n">${fmt(fit.r2, 5)}</span>
          <span class="chip derived">${GLYPH.derived} fit quality</span></div>
        <div class="tile derived"><span class="k">Points used</span>
          <span class="n">${fit.used}</span>
          <span class="chip derived">${GLYPH.derived} after filtering</span></div>
      </div>
      ${fit.r2 < 0.98 ? `<div class="guard"><b>Poor fit</b>
        r² is ${fmt(fit.r2, 4)}. Below about 0.98 the cell was not following the
        model — look for streaming, a wall collision, or a chip off resonance.</div>` : ""}
      <p class="note">${collected.length} run${collected.length === 1 ? "" : "s"} collected
        in ${new Set(collected.map((c) => c.medium.rho)).size} distinct
        ${new Set(collected.map((c) => c.medium.rho)).size === 1 ? "medium" : "media"}.</p>
    </div>${solved}`;
    measureResults.html = out.innerHTML;
  } catch (e) {
    out.innerHTML = `<div class="panel"><p class="err">${esc((e as Error).message)}</p></div>`;
  }
}

// ── screen 4 · crystals ─────────────────────────────────────────────────────

let observed = "0 0 3\n1 1 1\n2 0 0";

function crystalsView(): string {
  let refl: Reflection[] = [];
  let parseErr = "";
  try {
    refl = observed.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
      const [h, k, m] = l.split(/[\s,]+/).map(Number);
      if (![h, k, m].every(Number.isFinite)) throw new Error(`cannot read "${l}" as "h k l"`);
      return { h, k, l: m };
    });
  } catch (e) { parseErr = (e as Error).message; }
  const left = refl.length ? candidates(refl) : [...SOHNCKE_GROUPS];

  const rows = SOHNCKE_GROUPS.map((sg) => {
    const alive = left.some((x) => x.symbol === sg.symbol);
    const pat = (d: "a" | "b" | "c") => {
      const p = axialPattern(sg, d, 6);
      return p.length === 6 ? "all" : p.join(",");
    };
    return `<tr class="${alive ? "" : "no"}">
      <td class="mono">${sg.number}</td>
      <td class="mono"><b>${esc(sg.symbol)}</b></td>
      <td class="mono">${esc(sg.pointGroup)}</td>
      <td class="mono">${sg.lattice}</td>
      <td class="mono">${esc(pat("a"))}</td>
      <td class="mono">${esc(pat("b"))}</td>
      <td class="mono">${esc(pat("c"))}</td>
      <td class="mono">${sg.enantiomorph ? esc(sg.enantiomorph) : "·"}</td>
      <td>${sg.common ? '<span class="yes">common</span>' : ""}</td>
    </tr>`;
  }).join("");

  const byPG = ["1", "2", "222", "4", "422", "3", "32", "6", "622", "23", "432"]
    .map((hm) => `${hm}&nbsp;<b>${groupsOfPointGroup(hm).length}</b>`).join(" · ");

  return `
  <h2>Crystals</h2>
  <p class="sub">The 65 space groups a chiral molecule is allowed</p>

  <div class="panel">
    <p style="margin:0 0 6px">
      Proteins are built from L-amino acids, so they are <b>chiral</b>, and a
      chiral molecule cannot occupy a symmetry operation that would turn it into
      its mirror image. Of the 230 space groups, a protein crystal is restricted
      to the <b>65 Sohncke groups</b> — rotations, screw axes and translations,
      with no mirrors, glides, inversions or rotoinversions.
    </p>
    <p class="note">
      Their point groups are exactly the 11 chiral ones the Substrates screen
      already lists, from a module that knows nothing about proteins. The other
      21 are closed to protein crystallography outright. By point group: ${byPG}.
    </p>
  </div>

  <div class="grid2">
    <div class="panel">
      <h2 style="font-size:1rem">Observed reflections</h2>
      <p class="sub" style="margin-bottom:10px">One "h k l" per line</p>
      <label class="f"><span>Reflections you actually saw</span>
        <textarea id="obs" rows="8">${esc(observed)}</textarea></label>
      ${parseErr ? `<p class="err">${esc(parseErr)}</p>` : ""}
      <p class="ok" style="margin-top:4px"><b>${left.length}</b> of 65 groups survive</p>
      <p class="note">
        This rules groups <b>out</b> and never rules one in. An observed
        reflection is hard evidence a group is wrong; an absent one might only be
        weak, mis-indexed, or outside the resolution collected.
      </p>
      <p class="note">
        Enantiomorphic pairs have <b>identical</b> absences, so this can never
        choose between P4<sub>1</sub> and P4<sub>3</sub>. Settling the hand needs
        anomalous scattering — a limit of the method, not a gap here.
      </p>
    </div>
    <div class="panel">
      <div class="scroll"><table>
        <tr><th>№</th><th>Symbol</th><th>Point</th><th>Latt</th>
            <th>h00</th><th>0k0</th><th>00l</th><th>Other hand</th><th></th></tr>
        ${rows}
      </table></div>
      <p class="note">Axial columns list which reflections survive to index 6;
        "all" means no screw on that axis. Greyed rows are excluded by the
        reflections entered.</p>
    </div>
  </div>`;
}

// ── render ──────────────────────────────────────────────────────────────────

function render(): void {
  const root = $("#root");
  root.innerHTML = state.view === "substrates" ? substratesView()
    : state.view === "device" ? deviceView()
    : state.view === "crystals" ? crystalsView()
    : measureView();

  document.querySelectorAll("#nav button").forEach((b) => {
    const el = b as HTMLButtonElement;
    el.setAttribute("aria-current", String(el.dataset.view === state.view));
  });

  // Inputs write straight into state and re-render; the whole app is small
  // enough that a full redraw is cheaper than tracking what changed.
  for (const key of ["widthUm", "harmonic", "pitchUm", "mediumRho", "mediumC",
                     "amplitudeKPa", "radiusUm", "substrateIdx"] as const) {
    const el = document.getElementById(key) as HTMLInputElement | null;
    if (!el) continue;
    el.addEventListener("change", () => {
      (state[key] as number) = Number(el.value);
      render();
    });
  }
  const modeEl = document.getElementById("mode") as HTMLSelectElement | null;
  if (modeEl) modeEl.addEventListener("change", () => {
    state.mode = modeEl.value as "baw" | "saw";
    render();
  });
  const fitEl = document.getElementById("m_fit");
  if (fitEl) fitEl.addEventListener("click", runFit);
  const obsEl = document.getElementById("obs") as HTMLTextAreaElement | null;
  if (obsEl) obsEl.addEventListener("change", () => { observed = obsEl.value; render(); });
}

document.querySelectorAll("#nav button").forEach((b) => {
  b.addEventListener("click", () => {
    state.view = (b as HTMLButtonElement).dataset.view as View;
    render();
  });
});

render();
