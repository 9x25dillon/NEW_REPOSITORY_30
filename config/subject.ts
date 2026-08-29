// config/subject.ts — the single subject this instrument is being developed against.
//
// One subject, one file. Everything personal lives here and nowhere else, so
// that the physics modules stay pure functions of their arguments and can be
// tested, published or handed to someone else without carrying anyone's data
// with them.
//
// TWO THINGS ARE KEPT HERE AND THEY ARE NOT THE SAME KIND OF THING.
//
// `biology` is a set of measured or assumed physical parameters, and every
// acoustic result in this repo is a function of it. Change the cell radius and
// the trap changes, in a way that is checkable against a microscope.
//
// `natal` is the operator's own chart, kept because this began as an astrology
// engine and because the operator wants the instrument developed against their
// own data. NOTHING IN src/ READS IT, and that separation is deliberate rather
// than incidental: an acoustic prediction that took a birth time as an input
// would stop being falsifiable, and the whole value of the physics here is that
// it can be wrong in a way an experiment would show. Keep it a label on the
// work, not a term in it. If that changes, it should change loudly.
//
// PRIVACY: this repository is private. Note that a commit is permanent even so
// — scrubbing this file later does not remove it from git history, which would
// need a history rewrite. If the repo is ever opened up, that is the step.

export interface Natal {
  /** ISO date of birth. */
  date: string;
  /** Local wall-clock time of birth, 24h. */
  time: string;
  /** UTC offset in effect at that place and moment, in hours. */
  tzOffsetHours: number;
  /** Birthplace. Latitude/longitude are not filled in: the offset is the part
   *  that has been confirmed, and a guessed coordinate would silently move the
   *  houses and the angles. Fill from a birth certificate, not from memory. */
  place?: { name: string; lat: number; lon: number };
  notes: string;
}

export interface Biology {
  /** Cell radius, m. The single most consequential number in the model: the
   *  radiation force goes as its cube. */
  radius: number;
  /** Density, kg/m^3. */
  rho: number;
  /** Speed of sound through the cell, m/s. */
  c: number;
  /** What this describes, and where the numbers came from. */
  provenance: string;
}

/**
 * The operator's chart. Confirmed to the minute; the older readings in the
 * Downloads folder disagree with this and describe a different sky, so they
 * should not be used to cross-check it.
 */
export const NATAL: Natal = {
  date: "1987-11-11",
  time: "13:09",
  tzOffsetHours: -8,
  notes:
    "Confirmed date, time and offset. Birthplace coordinates deliberately absent " +
    "until sourced from a document — the offset alone fixes the planets, but the " +
    "houses and the angles need the latitude and would be quietly wrong without it.",
};

/**
 * The operator's own cells, as parameters.
 *
 * These are LITERATURE DEFAULTS for a generic mammalian cell, not measurements
 * of this subject, and they are marked as such because the difference decides
 * whether a prediction from this repo means anything. A real acoustic contrast
 * factor for a specific cell line wants a measured density (density-gradient
 * centrifugation) and a measured compressibility (acoustic itself, by
 * calibrating against particles of known contrast).
 *
 * Until then every result computed from this is an order-of-magnitude sketch.
 */
export const BIOLOGY: Biology = {
  radius: 7.5e-6,
  rho: 1100,
  c: 1570,
  provenance:
    "Literature defaults for a generic mammalian cell — NOT measured for this " +
    "subject. Replace with measured values before trusting any trap position.",
};
