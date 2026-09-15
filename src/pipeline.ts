// Serializable, versioned assembly of the supported 1D physical models.
// Provenance answers "where did the inputs come from?". Diagnostics answer
// "which equations were solved, within which assumptions and tolerances?".
import { type Medium, type Particle } from "./gorkov.js";
import { type StandingWave1D } from "./fields.js";
import { derive, hasSurrogate, weakest, type Tagged } from "./provenance.js";
import { integrate, type Step } from "./trajectory.js";
import { mieForceAmplitude, rayleighLimit, type MieResult } from "./mie.js";
import { rayleighSlipAmplitude, rayleighStreaming, stokesLayerThickness, streamingReynolds } from "./streaming.js";
import { finite, integer, nonnegative, positive } from "./validation.js";
import { rayleighSizeAssessment } from "./modelValidity.js";

export const PIPELINE_VERSION = "standing-wave-1.0.0";
export interface PlaneWaveInput {
  frequency: number;
  pressure: number;
  phase: number;
  /** Envelope phase ramp, rad/s. Zero means a stationary standing wave. */
  phaseRate: number;
}
export interface IntegrationInput {
  initialPosition: number;
  duration: number;
  steps: number;
  /** Acceptance tolerance for the RK4 step-halving estimate, m. */
  toleranceMetres: number;
}
export type StreamingSpec =
  | { kind: "none" }
  | { kind: "uniform"; velocity: Tagged<number> }
  | { kind: "rayleigh-midplane"; halfHeight: Tagged<number> };
export interface SimulationSpec {
  schemaVersion: 1;
  engineVersion: typeof PIPELINE_VERSION;
  medium: Tagged<Medium>;
  particle: Tagged<Particle>;
  field: Tagged<PlaneWaveInput>;
  viscosity: Tagged<number>;
  radiation: { kind: "gorkov" | "mie" };
  streaming: StreamingSpec;
  integration: Tagged<IntegrationInput>;
}
export interface ModelDiagnostic {
  model: string;
  assumptions: string[];
  warnings: string[];
  /** Null means not quantified; zero must never stand in for unknown error. */
  modelErrorBound: number | null;
}
export interface SimulationResult {
  engineVersion: typeof PIPELINE_VERSION;
  /** Validated snapshot, so later edits to the caller's inputs cannot alter it. */
  description: SimulationSpec;
  field: Tagged<StandingWave1D>;
  forceAmplitude: Tagged<number>;
  dragCoefficient: Tagged<number>;
  streaming: Tagged<{ kind: StreamingSpec["kind"]; velocityScale: number }>;
  trajectory: Tagged<Step[]>;
  diagnostics: {
    radiation: ModelDiagnostic & { ka: number; mie: MieResult | null };
    streaming: ModelDiagnostic & { layerToHalfHeight: number | null; reynolds: number | null };
    drag: ModelDiagnostic & { reynoldsScale: number; relaxationTimeSeconds: number };
    integration: {
      method: "RK4";
      steps: number;
      maxStepHalvingDifferenceMetres: number;
      estimatedErrorMetres: number;
      toleranceMetres: number;
      toleranceMet: boolean;
      resolutionScreenPassed: boolean;
      note: string;
    };
  };
}

function object(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${name} must be an object`);
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, required: string[], optional: string[] = []): void {
  for (const key of required) if (!(key in value)) throw new Error(`missing field ${key}`);
  for (const key of Object.keys(value)) if (![...required, ...optional].includes(key)) throw new Error(`unsupported field ${key}`);
}
function numericObject(value: unknown, names: string[]): Record<string, number> {
  const o = object(value, "numeric inputs"); keys(o, names);
  for (const name of names) finite(name, o[name] as number);
  return o as Record<string, number>;
}

/** Reject non-JSON values BEFORE stringify can discard them or turn NaN into null. */
function jsonValue(value: unknown, depth = 0): void {
  if (depth > 40) throw new Error("description is too deeply nested or cyclic");
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") { finite("JSON number", value); return; }
  if (Array.isArray(value)) { for (const v of value) jsonValue(v, depth + 1); return; }
  const o = object(value, "JSON value");
  if (Object.getPrototypeOf(o) !== Object.prototype && Object.getPrototypeOf(o) !== null) {
    throw new Error("description must contain plain JSON objects");
  }
  for (const v of Object.values(o)) jsonValue(v, depth + 1);
}
function tag(value: unknown, depth = 0): Tagged<unknown> {
  if (depth > 30) throw new Error("provenance tree is too deeply nested");
  const o = object(value, "tagged input"); keys(o, ["label", "value", "provenance", "note"], ["inputs", "surrogate"]);
  if (typeof o.label !== "string" || !o.label || typeof o.note !== "string") throw new Error("input needs a label and note");
  if (!["assumed", "surrogate", "derived", "measured"].includes(o.provenance as string)) throw new Error("invalid provenance");
  if (o.surrogate !== undefined) {
    const metadata = object(o.surrogate, "surrogate metadata");
    keys(metadata, ["modelId", "predictiveVariance", "inDomain"]);
    if (typeof metadata.modelId !== "string" || !metadata.modelId.trim() || typeof metadata.inDomain !== "boolean") {
      throw new Error("surrogate needs model identity and domain flag");
    }
    nonnegative("predictive variance", metadata.predictiveVariance as number);
    finite("surrogate value", o.value as number);
    if (o.provenance !== "surrogate" && o.provenance !== "assumed") throw new Error("surrogate cannot be promoted to derived or measured");
  }
  let children: Tagged<unknown>[] = [];
  if (o.inputs !== undefined) {
    if (!Array.isArray(o.inputs)) throw new Error("provenance inputs must be an array");
    children = o.inputs.map(v => tag(v, depth + 1));
    if (o.provenance === "measured") throw new Error("a computed input cannot be measured");
    if (weakest(o.provenance as Tagged["provenance"], ...children.map(v => v.provenance)) !== o.provenance) {
      throw new Error("input cannot conceal weaker provenance");
    }
  }
  if (o.surrogate !== undefined && children.length === 0) throw new Error("surrogate requires input lineage");
  if (o.provenance === "surrogate" && o.surrogate === undefined && !children.some(hasSurrogate)) {
    throw new Error("surrogate provenance requires prediction metadata or surrogate input lineage");
  }
  return o as unknown as Tagged<unknown>;
}

/** Strict schema parsing: unknown model kinds, versions, fields and invalid SI
 * values fail, rather than silently falling back to a different simulation. */
export function parseSimulation(text: string): SimulationSpec {
  const raw: unknown = JSON.parse(text);
  jsonValue(raw);
  const o = object(raw, "simulation");
  keys(o, ["schemaVersion", "engineVersion", "medium", "particle", "field", "viscosity", "radiation", "streaming", "integration"]);
  if (o.schemaVersion !== 1 || o.engineVersion !== PIPELINE_VERSION) throw new Error("unsupported simulation version");
  const m = numericObject(tag(o.medium).value, ["rho", "c"]);
  const p = numericObject(tag(o.particle).value, ["rho", "c", "radius"]);
  const f = numericObject(tag(o.field).value, ["frequency", "pressure", "phase", "phaseRate"]);
  const i = numericObject(tag(o.integration).value, ["initialPosition", "duration", "steps", "toleranceMetres"]);
  for (const [name, v] of Object.entries(m)) positive(`medium ${name}`, v);
  for (const [name, v] of Object.entries(p)) positive(`particle ${name}`, v);
  positive("frequency", f.frequency); nonnegative("pressure", f.pressure);
  positive("viscosity", tag(o.viscosity).value as number);
  nonnegative("duration", i.duration); integer("steps", i.steps, 1, 250_000); positive("tolerance", i.toleranceMetres);
  const radiation = object(o.radiation, "radiation"); keys(radiation, ["kind"]);
  if (radiation.kind !== "gorkov" && radiation.kind !== "mie") throw new Error("unsupported radiation model");
  const streaming = object(o.streaming, "streaming");
  if (streaming.kind === "none") keys(streaming, ["kind"]);
  else if (streaming.kind === "uniform") {
    keys(streaming, ["kind", "velocity"]); finite("streaming velocity", tag(streaming.velocity).value as number);
  } else if (streaming.kind === "rayleigh-midplane") {
    keys(streaming, ["kind", "halfHeight"]); positive("half height", tag(streaming.halfHeight).value as number);
    if (f.phaseRate !== 0) throw new Error("Rayleigh streaming requires a stationary field");
  } else throw new Error("unsupported streaming model");
  return raw as SimulationSpec;
}

export function serializeSimulation(spec: SimulationSpec): string {
  jsonValue(spec);
  const text = JSON.stringify(spec, null, 2);
  parseSimulation(text);
  return text;
}

export function runSimulation(input: SimulationSpec): SimulationResult {
  const spec = parseSimulation(serializeSimulation(input));
  const medium = spec.medium.value, p = spec.particle.value, f = spec.field.value;
  const mu = spec.viscosity.value, k = 2 * Math.PI * f.frequency / medium.c;
  const field = derive("plane standing wave", {
    k, wavelength: 2 * Math.PI / k, frequency: f.frequency,
    amplitude: f.pressure, phase: f.phase, medium,
  }, "prescribed plane standing wave in an unbounded host", [spec.medium, spec.field]);
  const mie = spec.radiation.kind === "mie" ? mieForceAmplitude(p, medium, k, f.pressure) : null;
  const amplitude = mie?.amplitude ?? rayleighLimit(p, medium, k, f.pressure);
  const forceAmplitude = derive("radiation force amplitude", amplitude,
    `${spec.radiation.kind} standing-wave force in N`, [field, spec.particle]);
  const dragCoefficient = derive("Stokes drag coefficient", positive("drag coefficient", 6 * Math.PI * mu * p.radius),
    "6 pi mu a, N s/m; no wall correction", [spec.viscosity, spec.particle]);
  const streamInputs: Tagged<unknown>[] = [];
  let velocityScale = 0, layerRatio: number | null = null, re: number | null = null;
  let advection = (_t: number, _x: number) => 0;
  const streamWarnings: string[] = [];
  if (spec.streaming.kind === "uniform") {
    velocityScale = spec.streaming.velocity.value;
    streamInputs.push(spec.streaming.velocity);
    advection = () => velocityScale;
  } else if (spec.streaming.kind === "rayleigh-midplane") {
    const h = spec.streaming.halfHeight.value;
    const channel = { halfHeight: h, k, pressure: f.pressure, phase: f.phase, medium, viscosity: mu, frequency: f.frequency };
    velocityScale = rayleighSlipAmplitude(f.pressure, medium);
    layerRatio = stokesLayerThickness(f.frequency, mu, medium.rho) / h;
    re = streamingReynolds(velocityScale, h, mu, medium.rho);
    advection = (_t, x) => rayleighStreaming(channel, x, 0).x;
    streamInputs.push(field, spec.streaming.halfHeight, spec.viscosity);
    if (layerRatio > 0.1) streamWarnings.push("Stokes layer is not thin relative to the half-gap; slip approximation is questionable.");
    if (re > 0.1) streamWarnings.push("Streaming Reynolds number is not small; convective acceleration is omitted.");
    if (p.radius / h > 0.1) streamWarnings.push("Particle radius is not small relative to the half-gap; wall drag and scattering are omitted.");
  }
  const streaming = derive("fluid advection", { kind: spec.streaming.kind, velocityScale },
    "separate from radiation force; Rayleigh trajectories follow the symmetry midplane only", streamInputs.length ? streamInputs : [spec.field]);
  const opts = spec.integration.value;
  const calculate = (steps: number) => integrate(field.value, opts.initialPosition, p, {
    duration: opts.duration, steps, viscosity: mu,
    phaseOfTime: t => f.phase + f.phaseRate * t,
    streamingVelocity: advection,
    radiationForce: (wave, x) => amplitude * Math.sin(2 * (k * x + wave.phase)),
  });
  const coarse = calculate(opts.steps), fine = calculate(2 * opts.steps);
  let difference = 0;
  for (let j = 0; j < coarse.length; j++) difference = Math.max(difference, Math.abs(coarse[j].u - fine[2 * j].u));
  const warnings: string[] = [];
  const size = rayleighSizeAssessment(f.frequency, p, medium), ka = size.externalKa;
  if (!mie && !size.smallParticle) warnings.push(size.message);
  if (f.pressure / (medium.rho * medium.c ** 2) > 0.01) warnings.push("Acoustic Mach number exceeds 0.01; linear acoustics may be inadequate.");
  const drift = Math.abs(amplitude / dragCoefficient.value);
  const particleRe = streamingReynolds(drift, 2 * p.radius, mu, medium.rho);
  const relaxation = 2 * p.rho * p.radius ** 2 / (9 * mu);
  const rateScale = 2 * k * (drift + Math.abs(velocityScale)) + 2 * Math.abs(f.phaseRate);
  const resolutionScreenPassed = rateScale * opts.duration / (2 * opts.steps) <= 0.25;
  const dragWarnings: string[] = [];
  if (particleRe > 0.1) dragWarnings.push("Particle Reynolds number exceeds 0.1; Stokes drag may be inadequate.");
  if (relaxation * rateScale > 0.1) dragWarnings.push("Momentum relaxation is not fast relative to the trajectory; overdamped motion may be inadequate.");
  return {
    engineVersion: PIPELINE_VERSION, description: spec, field, forceAmplitude, dragCoefficient, streaming,
    trajectory: derive("particle trajectory", fine, "overdamped RK4 with independent fluid advection", [field, forceAmplitude, dragCoefficient, streaming, spec.integration]),
    diagnostics: {
      radiation: {
        model: spec.radiation.kind, ka, mie, modelErrorBound: null, warnings,
        assumptions: ["isolated spherical particle", "inviscid acoustic scattering", "linear prescribed plane standing wave", "no boundaries, absorption, elasticity or multiple scattering"],
      },
      streaming: {
        model: spec.streaming.kind, layerToHalfHeight: layerRatio, reynolds: re,
        modelErrorBound: null,
        warnings: streamWarnings,
        assumptions: spec.streaming.kind === "rayleigh-midplane"
          ? ["infinite parallel plates", "thin Stokes layers", "stationary Newtonian Stokes flow", "Rayleigh outer slip", "particle remains on symmetry midplane"]
          : [spec.streaming.kind === "none" ? "fluid advection omitted by choice" : "prescribed uniform fluid velocity"],
      },
      drag: {
        model: "overdamped Stokes", reynoldsScale: particleRe, relaxationTimeSeconds: relaxation,
        modelErrorBound: null, warnings: dragWarnings,
        assumptions: ["Newtonian fluid", "low particle Reynolds number", "negligible particle inertia", "no wall or Faxen correction"],
      },
      integration: {
        method: "RK4", steps: 2 * opts.steps, maxStepHalvingDifferenceMetres: difference,
        estimatedErrorMetres: difference / 15, toleranceMetres: opts.toleranceMetres,
        toleranceMet: resolutionScreenPassed && difference / 15 <= opts.toleranceMetres,
        resolutionScreenPassed,
        note: "Step-halving /15 estimates fine-grid error only in the fourth-order convergence regime; it is not a bound or a model-validity test.",
      },
    },
  };
}
