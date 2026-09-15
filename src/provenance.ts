// provenance.ts — where a number came from, carried with the number.
//
// Every acoustofluidic calculator takes numbers and returns numbers. The thing
// none of them do, and the thing that decides whether a result means anything,
// is say where each number CAME FROM. A trap position computed from a measured
// density and one computed from a literature default look identical on screen
// and are not the same kind of statement at all.
//
// There are four kinds, ordered by evidential strength:
//
//   MEASURED  someone put it on an instrument. Carries a date and a residual.
//             The only tag that makes a downstream result a claim about the
//             actual cells in the actual chip.
//   DERIVED   computed from other values by an exact relation — a resonance
//             from a channel width, a Rayleigh angle from two sound speeds.
//             Traceable, and only ever as good as its inputs.
//   SURROGATE an interpolated/predicted solver output, with model identity and
//             predictive variance. Never promoted by downstream arithmetic.
//   ASSUMED   a literature default standing in for something unmeasured.
//             Useful for a first pass and load-bearing: it is the thing that
//             turns a result into a sketch.
//
// THE RULE IS ONE LINE: a derived value inherits the WEAKEST provenance among
// its inputs. One assumed number anywhere upstream and the headline is assumed,
// however exact every step after it was. That is what stops the instrument
// quietly presenting a guess as a measurement, and it is why `blame` exists —
// the fastest way to turn a result green is to know which input is amber.
//
// Note that `derive` can never return "measured". A computed value is at best
// derived even when every input was measured, because nobody measured IT. That
// is not pedantry: it is the difference between "we observed this cell focus in
// 42 ms" and "we calculate that it should".

export type Provenance = "measured" | "derived" | "surrogate" | "assumed";

/** Weakest first. Comparisons and the inheritance rule both read this order. */
const STRENGTH: Record<Provenance, number> = { assumed: 0, surrogate: 1, derived: 2, measured: 3 };

export function weakest(...ps: readonly Provenance[]): Provenance {
  if (ps.length === 0) return "assumed";
  return ps.reduce((a, b) => (STRENGTH[b] < STRENGTH[a] ? b : a));
}

export function isWeakerThan(a: Provenance, b: Provenance): boolean {
  return STRENGTH[a] < STRENGTH[b];
}

export interface Tagged<T = number> {
  /** Short human name, used by `blame` to say what to go and measure. */
  label: string;
  value: T;
  provenance: Provenance;
  /** One sentence a reader can act on. */
  note: string;
  /** Present on derived values. */
  inputs?: ReadonlyArray<Tagged<unknown>>;
  /** Present on a surrogate prediction even when assumed inputs weaken its tag.
   * Variance is in value-units squared; it is not automatically calibrated. */
  surrogate?: { modelId: string; predictiveVariance: number; inDomain: boolean };
}

/** A value somebody measured. */
export function measured<T>(label: string, value: T, note: string): Tagged<T> {
  return { label, value, provenance: "measured", note };
}

/** A literature default, or anything else standing in for a measurement. */
export function assumed<T>(label: string, value: T, note: string): Tagged<T> {
  return { label, value, provenance: "assumed", note };
}

/** Label a numerical prediction, not a surrogate implementation. Training,
 * calibration and final solver re-evaluation remain the caller's obligations. */
export function surrogate(
  label: string, value: number, note: string,
  metadata: NonNullable<Tagged["surrogate"]>, inputs: ReadonlyArray<Tagged<unknown>>,
): Tagged<number> {
  if (!Number.isFinite(value) || !Number.isFinite(metadata.predictiveVariance)
    || metadata.predictiveVariance < 0 || typeof metadata.modelId !== "string"
    || !metadata.modelId.trim() || typeof metadata.inDomain !== "boolean" || inputs.length === 0) {
    throw new Error("surrogate requires finite value, nonnegative variance, model identity, domain flag and inputs");
  }
  return {
    label, value, note, inputs, surrogate: { ...metadata },
    provenance: weakest("surrogate", ...inputs.map(i => i.provenance)),
  };
}

/** Surrogate dependence survives even if an assumed input weakens the headline. */
export function hasSurrogate(t: Tagged<unknown>): boolean {
  return t.provenance === "surrogate" || t.surrogate !== undefined || (t.inputs?.some(hasSurrogate) ?? false);
}

/** Gate for final reporting. It never relabels a prediction as a solver result.
 * Passing this check establishes absence of surrogate lineage, not accuracy. */
export function assertNoSurrogate(t: Tagged<unknown>): void {
  if (hasSurrogate(t)) throw new Error("surrogate-dependent result: re-evaluate the candidate with the physics solver before final reporting");
}

/**
 * A value computed from others, tagged with the weakest provenance in its chain.
 *
 * "derived" is included in the fold on purpose, so the result can never come
 * back stronger than derived — see the note at the top.
 */
export function derive<T>(
  label: string, value: T, note: string, inputs: ReadonlyArray<Tagged<unknown>>,
): Tagged<T> {
  return {
    label, value, note, inputs,
    provenance: weakest("derived", ...inputs.map((i) => i.provenance)),
  };
}

/**
 * The source values responsible for a result's provenance.
 *
 * Walks to the leaves — the things somebody either measured or assumed — and
 * returns those matching the result's own tag. For an amber result that is
 * exactly the list of things to go and measure, which is the only action the
 * tag implies. Returns each label once, in the order first encountered, so the
 * message reads as a to-do rather than a stack trace.
 */
export function blame(t: Tagged<unknown>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const walk = (n: Tagged<unknown>) => {
    if (t.provenance === "surrogate" && n.surrogate) {
      if (!seen.has(n.label)) { seen.add(n.label); out.push(n.label); }
      return;
    }
    if (!n.inputs || n.inputs.length === 0) {
      if (n.provenance === t.provenance && !seen.has(n.label)) {
        seen.add(n.label);
        out.push(n.label);
      }
      return;
    }
    for (const child of n.inputs) walk(child);
  };
  walk(t);
  return out;
}

/** Every leaf under a value, whatever its tag — the full input list. */
export function sources(t: Tagged<unknown>): Array<Tagged<unknown>> {
  const out: Array<Tagged<unknown>> = [];
  const walk = (n: Tagged<unknown>) => {
    if (!n.inputs || n.inputs.length === 0) { out.push(n); return; }
    for (const c of n.inputs) walk(c);
  };
  walk(t);
  return out;
}

/** Display glyph, matching the tags used in the interface. */
export const GLYPH: Record<Provenance, string> = {
  measured: "◆", // filled diamond
  derived: "▲",  // triangle
  surrogate: "≈", // approximation
  assumed: "○",  // hollow circle
};

/**
 * The sentence a result should carry, given its tag and what is to blame.
 *
 * Written here rather than in the interface so the wording cannot drift between
 * screens, and so it can be tested: a result that says "assumed" without naming
 * a cause is a result the reader cannot act on.
 */
export function verdict(t: Tagged<unknown>): string {
  const cause = blame(t);
  if (t.provenance === "measured") return `${t.label} was measured directly.`;
  if (t.provenance === "derived") {
    return `${t.label} is computed from measured inputs.`;
  }
  if (t.provenance === "surrogate") {
    return `${t.label} depends on a surrogate estimate${cause.length ? ` (${cause.join(", ")})` : ""}. `
      + "Re-evaluate the candidate with the physics solver before final reporting.";
  }
  const list = cause.length
    ? cause.join(", ")
    : "an unmeasured input";
  const verb = cause.length === 1 ? "is" : "are";
  return `This result is assumed, not measured: ${list} ${verb} a stand-in. ` +
    `Measure ${cause.length === 1 ? "it" : "them"} to make this a claim about your cells.`
    + (hasSurrogate(t) ? " Surrogate estimates also require physics-solver re-evaluation before final reporting." : "");
}
