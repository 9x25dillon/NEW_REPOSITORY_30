import { parseSimulation, runSimulation, serializeSimulation, type SimulationResult } from "../src/pipeline.js";
import { assertNoSurrogate, hasSurrogate, verdict } from "../src/provenance.js";

const description = document.querySelector<HTMLTextAreaElement>("#description")!;
const runButton = document.querySelector<HTMLButtonElement>("#run")!;
const saveDescription = document.querySelector<HTMLButtonElement>("#save-description")!;
const saveResult = document.querySelector<HTMLButtonElement>("#save-result")!;
const status = document.querySelector<HTMLElement>("#status")!;
const resultElement = document.querySelector<HTMLElement>("#result")!;
const file = document.querySelector<HTMLInputElement>("#file")!;
let latest: SimulationResult | null = null;

function escape(text: string): string {
  return text.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
const number = (value: number) => value.toPrecision(5);

function draw(result: SimulationResult): void {
  const path = result.trajectory.value;
  let min = path[0].u, max = min;
  for (const p of path) { min = Math.min(min, p.u); max = Math.max(max, p.u); }
  const duration = path.at(-1)!.t, span = max - min || 1e-6;
  const points: string[] = [];
  // Bound SVG size while retaining the actual solver samples in the download.
  const stride = Math.max(1, Math.ceil(path.length / 800));
  for (let i = 0; i < path.length; i += stride) {
    const p = path[i]; points.push(`${60 + 480 * p.t / (duration || 1)},${220 - 180 * (p.u - min) / span}`);
  }
  const last = path.at(-1)!;
  points.push(`${60 + 480 * last.t / (duration || 1)},${220 - 180 * (last.u - min) / span}`);
  const diagnostics = result.diagnostics, mie = diagnostics.radiation.mie;
  const warnings = [...diagnostics.radiation.warnings, ...diagnostics.streaming.warnings, ...diagnostics.drag.warnings];
  if (hasSurrogate(result.trajectory)) warnings.push("This exploratory run depends on surrogate estimates. Final-result export is disabled until those estimates are re-evaluated with the physics solver.");
  if (!diagnostics.integration.toleranceMet) warnings.push("Integration tolerance was not met or the time step is too coarse. Increase steps before using this trajectory.");
  resultElement.innerHTML = `
    <p><strong>${escape(result.trajectory.provenance)}</strong> · ${escape(verdict(result.trajectory))}</p>
    ${warnings.map(w => `<p class="warning">${escape(w)}</p>`).join("")}
    <svg viewBox="0 0 570 275" role="img" aria-label="Particle position in micrometres versus time in seconds">
      <path d="M60 30V220H545" fill="none" stroke="currentColor"/>
      <polyline points="${points.join(" ")}" fill="none" stroke="var(--accent)" stroke-width="2"/>
      <g fill="currentColor" font-size="12"><text x="60" y="18">Position (µm)</text>
      <text x="5" y="45">${number(max * 1e6)}</text><text x="5" y="225">${number(min * 1e6)}</text>
      <text x="60" y="245">0</text><text x="470" y="245">${number(duration)} s</text></g>
    </svg>
    <dl>
      <dt>Radiation model</dt><dd>${escape(diagnostics.radiation.model)}</dd>
      <dt>Fluid ka</dt><dd>${number(diagnostics.radiation.ka)}</dd>
      <dt>Force amplitude</dt><dd>${number(result.forceAmplitude.value)} N</dd>
      <dt>Advection</dt><dd>${escape(result.streaming.value.kind)}</dd>
      <dt>Final position</dt><dd>${number(last.u * 1e6)} µm</dd>
      <dt>Estimated RK4 error</dt><dd>${number(diagnostics.integration.estimatedErrorMetres)} m</dd>
      <dt>Tolerance screen</dt><dd>${diagnostics.integration.toleranceMet ? "Passed" : "Failed"}</dd>
      ${mie ? `<dt>Mie − Gor’kov / |Gor’kov|</dt><dd>${mie.relativeCorrection === null ? "Undefined at zero contrast" : number(100 * mie.relativeCorrection) + "%"}</dd>
      <dt>Partial-wave cutoff change</dt><dd>${number(mie.truncationChangeN)} N</dd>` : ""}
    </dl>
    <p class="muted">Numerical error estimates do not bound the error of the physical model.</p>
    <details><summary>All assumptions and diagnostics</summary><pre>${escape(JSON.stringify(diagnostics, null, 2))}</pre></details>`;
}

function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const link = document.createElement("a"); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

description.addEventListener("input", () => {
  latest = null; saveResult.disabled = true;
  resultElement.textContent = "Description changed. Run again to update the results.";
  status.textContent = "Unsaved description; results will be computed on Run.";
});
runButton.addEventListener("click", () => {
  latest = null; saveResult.disabled = true;
  try {
    latest = runSimulation(parseSimulation(description.value));
    draw(latest); saveResult.disabled = hasSurrogate(latest.trajectory);
    status.textContent = `Completed ${latest.diagnostics.integration.steps} steps. ${latest.diagnostics.integration.toleranceMet ? "Numerical tolerance screen passed." : "Inspect the integration warning."}`;
  } catch (error) {
    resultElement.textContent = "No result: the description could not be simulated.";
    status.textContent = (error as Error).message;
  }
});
saveDescription.addEventListener("click", () => {
  try { download("standing-wave.json", serializeSimulation(parseSimulation(description.value))); }
  catch (error) { status.textContent = (error as Error).message; }
});
saveResult.addEventListener("click", () => {
  if (latest) {
    assertNoSurrogate(latest.trajectory);
    download("standing-wave-run.json", JSON.stringify(latest, null, 2));
  }
});
document.querySelector("#import")!.addEventListener("click", () => file.click());
file.addEventListener("change", async () => {
  const selected = file.files?.[0];
  if (!selected) return;
  try {
    description.value = serializeSimulation(parseSimulation(await selected.text()));
    description.dispatchEvent(new Event("input"));
    runButton.disabled = false; saveDescription.disabled = false;
    status.textContent = "Description loaded. Run to reproduce it.";
  } catch (error) { status.textContent = (error as Error).message; }
  file.value = "";
});

try {
  const response = await fetch("../examples/standing-wave.json");
  if (!response.ok) throw new Error(`Example could not load (${response.status}). Open a saved description instead.`);
  description.value = serializeSimulation(parseSimulation(await response.text()));
  runButton.disabled = false; saveDescription.disabled = false;
  status.textContent = "Example ready. All input values are assumed.";
} catch (error) { status.textContent = (error as Error).message; }
