// personal/tonal.ts — the natal chart as audible sound.
//
// THIS IS NOT PHYSICS AND IT DOES NOT CLAIM TO BE. Read the boundary note
// below before adding anything to this directory or importing from it.
//
// The map itself is one line and is exact:
//
//     f(lambda) = 110 * 2^(lambda / 180)  Hz      lambda in [0,360) -> [110,440)
//
// One octave per half-circle, so exactly 20/3 cents per degree. Every classical
// aspect therefore lands on a whole multiple of 200 cents — the sextile is a
// major third, the square a tritone, the trine a minor sixth, the opposition an
// octave — which means the major-aspect family IS the whole-tone scale under
// this map. That is a real and checkable statement ABOUT THE MAP, and the tests
// check it. It is not a statement about anyone's body.
//
// ── THE BOUNDARY ──────────────────────────────────────────────────────────
//
// This directory produces sound in the AUDIBLE range, roughly 10^2 to 10^4 Hz,
// to be listened to. src/ computes acoustic radiation forces at 10^6 to 10^8 Hz
// inside a microfluidic channel, to move cells. Those are four to six orders of
// magnitude apart and they are not the same phenomenon:
//
//   · Radiation force scales with the acoustic energy density and the square of
//     the wavenumber. At 1 MHz in water the wavelength is 1.5 mm and a 10 um
//     cell sits deep in the long-wavelength regime the Gor'kov potential is
//     derived for. At 440 Hz the wavelength is 3.4 metres, the wavenumber is
//     smaller by more than three orders of magnitude, and the force on a cell
//     from music at listening levels is not small — it is irrelevant.
//   · The device physics also requires a resonant channel or a piezoelectric
//     substrate coupling into a fluid. Headphones are neither.
//
// So: listening to this is listening to music. It may well be pleasant and
// relaxing, which is a genuine thing for music to be and needs no mechanism
// beyond the ordinary one. What it is NOT is a dose of anything, a treatment,
// or the same process src/ models. If this ever ships to other people, that
// distinction has to survive the trip — which is why the two live in separate
// directories with an enforced import boundary (see test/boundary.test.ts)
// rather than merely a comment saying they are different.

/** Base pitch at longitude 0. */
export const BASE_HZ = 110;
/** One octave per half-circle. */
export const DEGREES_PER_OCTAVE = 180;
/** Exactly 20/3 — the whole map in one number. */
export const CENTS_PER_DEGREE = 1200 / DEGREES_PER_OCTAVE;

/** Audible-range clamp. Present because anything that reaches a speaker should
 *  have a stated range, not because a longitude can escape [110, 440). */
export const AUDIBLE_MIN_HZ = 20;
export const AUDIBLE_MAX_HZ = 18000;

/** Non-negative remainder, the exact form: a value already in range is returned
 *  bit-identical rather than round-tripped through +360, which costs a ulp. */
export function norm360(deg: number): number {
  const r = deg % 360;
  return r < 0 ? r + 360 : r;
}

/** The drone for a longitude, Hz. */
export function droneHz(longitudeDeg: number): number {
  const f = BASE_HZ * 2 ** (norm360(longitudeDeg) / DEGREES_PER_OCTAVE);
  return Math.min(Math.max(f, AUDIBLE_MIN_HZ), AUDIBLE_MAX_HZ);
}

/** Interval between two longitudes, in cents. Signed, and exactly 20/3 per
 *  degree of separation. */
export function centsBetween(aDeg: number, bDeg: number): number {
  return 1200 * Math.log2(droneHz(aDeg) / droneHz(bDeg));
}

/** Beat rate between two drones, Hz — zero exactly when the longitudes meet.
 *  This is an ACOUSTIC BEAT, the slow amplitude pulsing two close pitches make
 *  in the air and in the ear. It is not the acoustic contrast of src/gorkov. */
export function beatHz(f1: number, f2: number): number {
  return Math.abs(f1 - f2);
}

/** A body placed on the wheel, as this module needs it. */
export interface Placement {
  id: string;
  longitude: number;
}

export interface Voice {
  id: string;
  hz: number;
  /** Cents above the lowest voice in the chord — the interval a listener hears. */
  centsAboveRoot: number;
}

/**
 * A chart as a chord: one sustained voice per body, tuned by longitude.
 *
 * Sorted by pitch so the returned list reads as a chord from the bottom up, and
 * intervals are quoted against the lowest voice because that is the one the ear
 * takes as the root.
 */
export function chord(placements: readonly Placement[]): Voice[] {
  const voices = placements
    .map((p) => ({ id: p.id, hz: droneHz(p.longitude), centsAboveRoot: 0 }))
    .sort((a, b) => a.hz - b.hz);
  if (voices.length === 0) return voices;
  const root = voices[0].hz;
  for (const v of voices) v.centsAboveRoot = 1200 * Math.log2(v.hz / root);
  return voices;
}

/**
 * The slowest beat anywhere in a chord, Hz, and which pair makes it.
 *
 * The pair closest in longitude is the pair closest in pitch, and a slow beat
 * is the pulsing a listener actually notices — so this is the number that says
 * what a chord will sound like before it is played. Null for fewer than two
 * voices, since a beat needs two things to beat against.
 */
export function slowestBeat(
  placements: readonly Placement[],
): { a: string; b: string; hz: number } | null {
  if (placements.length < 2) return null;
  let best: { a: string; b: string; hz: number } | null = null;
  for (let i = 0; i < placements.length; i++) {
    for (let j = i + 1; j < placements.length; j++) {
      const hz = beatHz(droneHz(placements[i].longitude), droneHz(placements[j].longitude));
      if (!best || hz < best.hz) best = { a: placements[i].id, b: placements[j].id, hz };
    }
  }
  return best;
}

/**
 * The classical aspects and the interval each becomes under the map. Exported
 * because the correspondence is the interesting part and should be inspectable
 * rather than buried in a test.
 *
 * `article` is carried as data rather than inferred, because the English rule
 * is about SOUND and not spelling: "unison" begins with a vowel letter and a
 * consonant sound, so it takes "a" and not "an". A first-letter test produced
 * "an unison" on screen. The set is closed and seven long; it can just say.
 */
export const ASPECT_INTERVALS: ReadonlyArray<{
  name: string; degrees: number; cents: number; interval: string; article: "a" | "an";
}> = [
  { name: "conjunction", degrees: 0, cents: 0, interval: "unison", article: "a" },
  { name: "semisextile", degrees: 30, cents: 200, interval: "whole tone", article: "a" },
  { name: "sextile", degrees: 60, cents: 400, interval: "major third", article: "a" },
  { name: "square", degrees: 90, cents: 600, interval: "tritone", article: "a" },
  { name: "trine", degrees: 120, cents: 800, interval: "minor sixth", article: "a" },
  { name: "quincunx", degrees: 150, cents: 1000, interval: "minor seventh", article: "a" },
  { name: "opposition", degrees: 180, cents: 1200, interval: "octave", article: "an" },
];
