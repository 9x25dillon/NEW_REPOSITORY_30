// personal/transits.ts — the chart's upcoming weather, as sound.
//
// A transit is a SWEEP AT THE SPEED THE SKY MOVES. The synthetic sweep on the
// listening surface crosses fourteen drones in ninety seconds; a transiting
// planet crosses the same drones over months, and when it arrives the interval
// between the two locks. That is the same event, and this file is the real one.
//
// So the two things asked for here are one thing:
//
//   TRANSIT TO NATAL   the transiting body's drone glides toward a fixed natal
//                      drone. At a conjunction the two converge and the beat
//                      falls to zero; at a trine they lock 800 cents apart, at
//                      a square 600, because the map puts every classical
//                      aspect on a whole multiple of 200 cents.
//   STATION            the drone glides, slows, stops and reverses. Nothing
//                      arrives; the motion itself is the event, and it is the
//                      only one you can hear without a second voice to hear it
//                      against.
//
// THIS FILE HOLDS NO EPHEMERIS AND SHOULD NOT GROW ONE. The positions below are
// computed elsewhere — by an engine that is parity-locked against a Python
// implementation and validated against Swiss — and pasted in. Nine weekly
// samples span the four weeks either side of each event, which is why a
// station's reversal is present as DATA rather than reconstructed from a speed:
// at a station the speed is zero and a linear extrapolation would draw a
// straight line through the one moment that is entirely curvature.

/** One upcoming event, with the transiting body's path around it. */
export interface TransitEvent {
  /** ISO date of exactness. */
  date: string;
  /** An aspect name, or "station". */
  kind: string;
  /** The transiting body. */
  body: string;
  /** The natal body aspected, or null for a station. */
  target: string | null;
  /** That natal body's longitude, or null. */
  targetLongitude: number | null;
  /** "retrograde" or "direct" for a station, else null. */
  direction: string | null;
  /** Nine weekly longitudes spanning ±28 days. Index 4 is the event. */
  track: number[];
}

/** The sample index at which the event is exact. */
export const EVENT_INDEX = 4;

/**
 * Parse the pasted block: date | kind | body | target | targetLon | direction | track
 *
 * Lines that do not parse are SKIPPED rather than throwing. A pasted block is
 * hand-edited by definition, and one malformed row should cost that row rather
 * than the whole year.
 */
export function parseTransits(text: string): TransitEvent[] {
  const out: TransitEvent[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const f = line.split("|").map((x) => x.trim());
    if (f.length < 7) continue;
    const track = f[6].split(/\s+/).map(Number);
    if (track.length < 3 || track.some((n) => !Number.isFinite(n))) continue;
    const lon = Number(f[4]);
    out.push({
      date: f[0], kind: f[1], body: f[2],
      target: f[3] === "-" ? null : f[3],
      targetLongitude: Number.isFinite(lon) ? lon : null,
      direction: f[5] === "-" ? null : f[5],
      track,
    });
  }
  return out;
}

export function isStation(e: TransitEvent): boolean {
  return e.kind === "station";
}

/**
 * Whether the track actually turns around inside the window.
 *
 * Checked rather than trusted. A row labelled "station" whose longitudes only
 * increase is a row where the label and the numbers disagree, and the sound
 * would be a steady glide over a caption promising a reversal.
 */
export function reverses(e: TransitEvent): boolean {
  let up = false;
  let down = false;
  for (let i = 1; i < e.track.length; i++) {
    const d = e.track[i] - e.track[i - 1];
    if (d > 0.0005) up = true;
    if (d < -0.0005) down = true;
  }
  return up && down;
}

/** Total ground covered, in degrees — how far the drone will actually move. */
export function travel(e: TransitEvent): number {
  return Math.abs(e.track[e.track.length - 1] - e.track[0]);
}

/**
 * The interval an aspect locks to, in cents — 200 per 30 degrees.
 *
 * Null for a station, which has nothing to lock against. Note this is the
 * interval at EXACTNESS: the whole point of sounding a transit is the approach
 * to it, not the arrival.
 */
export function lockCents(e: TransitEvent): number | null {
  if (isStation(e) || e.targetLongitude === null) return null;
  const d = Math.abs(e.track[EVENT_INDEX] - e.targetLongitude) % 360;
  const sep = d > 180 ? 360 - d : d;
  return (sep * 1200) / 180;
}

/** Events sorted by date, soonest first. */
export function upcoming(events: readonly TransitEvent[], fromISO: string): TransitEvent[] {
  return events.filter((e) => e.date >= fromISO).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Example data for a fictional chart, not a real person's forecast. Replace it by pasting a new block — this file sounds a
 * forecast, it does not generate one.
 */
export const DEFAULT_TRANSITS = `# date | kind | body | natal target | its longitude | direction | 9 weekly longitudes, event at the middle
2026-09-09|Trine|Mars|Sun|10.00|-|231.82 236.41 240.94 245.40 249.79 254.10 258.32 262.46 266.49
2026-09-10|station|Uranus|-|-|retrograde|78.36 78.50 78.61 78.67 78.70 78.68 78.62 78.52 78.38
2026-09-12|Square|Chiron|Moon|55.00|-|325.61 325.51 325.38 325.20 324.99 324.75 324.48 324.18 323.87
2026-09-18|Opposition|Chiron|Mercury|25.00|-|205.76 205.63 205.46 205.25 205.01 204.75 204.46 204.15 203.82
2026-09-27|Square|Jupiter|Sun|10.00|-|274.44 275.90 277.33 278.70 280.02 281.27 282.45 283.54 284.55
2026-09-28|Conjunction|Mars|Moon|55.00|-|37.88 42.29 46.62 50.87 55.03 59.09 63.05 66.89 70.60
2026-10-01|Trine|Jupiter|Saturn|275.00|-|149.55 150.99 152.39 153.73 155.01 156.22 157.36 158.40 159.34
2026-10-13|Trine|Jupiter|Jupiter|200.00|-|315.02 316.38 317.68 318.91 320.07 321.14 322.11 322.98 323.73
2026-10-15|Sextile|Jupiter|Mars|120.00|-|55.05 56.39 57.67 58.88 60.02 61.06 62.00 62.84 63.55
2026-10-16|station|Pluto|-|-|direct|316.24 316.17 316.11 316.08 316.07 316.08 316.12 316.18 316.26
2026-10-23|Trine|Saturn|Venus|340.00|-|102.15 101.60 101.05 100.51 100.00 99.52 99.10 98.74 98.45
2026-10-27|Trine|Saturn|Lilith|260.00|-|142.15 141.60 141.05 140.52 140.03 139.58 139.19 138.87 138.63
2026-11-01|Square|Mars|Sun|10.00|-|264.78 268.75 272.61 276.34 279.93 283.36 286.61 289.64 292.43
2026-11-01|Sextile|Chiron|Chiron|95.00|-|36.30 35.99 35.66 35.34 35.01 34.70 34.40 34.13 33.88
2026-11-04|Trine|Jupiter|Uranus|300.00|-|175.98 177.13 178.19 179.14 179.99 180.73 181.33 181.79 182.10
2026-12-10|station|Saturn|-|-|direct|21.64 21.34 21.12 20.98 20.93 20.97 21.10 21.31 21.61
2026-12-12|station|Neptune|-|-|direct|14.84 14.74 14.67 14.63 14.61 14.63 14.67 14.74 14.83
2026-12-12|Trine|Neptune|Moon|55.00|-|296.64 296.54 296.47 296.43 296.41 296.43 296.47 296.54 296.63
2026-12-12|Conjunction|Neptune|North Node|40.00|-|40.70 40.60 40.53 40.49 40.47 40.49 40.53 40.60 40.69
2026-12-13|station|Jupiter|-|-|retrograde|158.83 159.35 159.73 159.95 160.02 159.93 159.68 159.28 158.73
2026-12-13|Sextile|Jupiter|Chiron|95.00|-|152.79 153.31 153.69 153.91 153.98 153.89 153.64 153.24 152.69
2027-01-06|station|Chiron|-|-|direct|39.63 39.47 39.36 39.29 39.26 39.29 39.36 39.47 39.63
2027-01-10|station|Mars|-|-|retrograde|169.07 170.87 172.25 173.12 173.43 173.12 172.16 170.56 168.39
2027-01-20|Trine|Jupiter|Uranus|300.00|-|182.11 181.79 181.32 180.72 180.00 179.18 178.29 177.37 176.45
2027-01-22|Trine|Saturn|Lilith|260.00|-|138.57 138.80 139.11 139.51 139.98 140.51 141.12 141.78 142.49
2027-01-26|Trine|Saturn|Venus|340.00|-|98.38 98.66 99.02 99.46 99.97 100.54 101.18 101.87 102.61
2027-02-08|station|Uranus|-|-|direct|75.02 74.87 74.77 74.70 74.68 74.70 74.77 74.88 75.03
2027-02-08|Sextile|Uranus|Moon|55.00|-|356.82 356.67 356.57 356.50 356.48 356.50 356.57 356.68 356.83
2027-02-08|Sextile|Uranus|North Node|40.00|-|100.88 100.73 100.63 100.56 100.54 100.56 100.63 100.74 100.89
2027-02-11|Sextile|Jupiter|Mars|120.00|-|63.35 62.61 61.78 60.89 59.97 59.04 58.16 57.34 56.61
2027-02-14|Trine|Jupiter|Jupiter|200.00|-|323.42 322.64 321.78 320.87 319.94 319.03 318.17 317.39 316.71
2027-03-01|Trine|Jupiter|Saturn|275.00|-|158.62 157.70 156.78 155.87 155.02 154.25 153.59 153.06 152.66
2027-03-08|Square|Jupiter|Sun|10.00|-|283.43 282.51 281.60 280.75 279.98 279.32 278.79 278.39 278.15
2027-03-11|Sextile|Chiron|Chiron|95.00|-|33.83 34.08 34.36 34.67 35.02 35.38 35.77 36.17 36.59
2027-04-01|station|Mars|-|-|direct|158.91 156.76 155.19 154.24 153.93 154.21 155.05 156.36 158.09
2027-04-13|station|Jupiter|-|-|direct|151.18 150.66 150.29 150.06 150.00 150.08 150.32 150.69 151.21
2027-04-14|Opposition|Chiron|Mercury|25.00|-|203.40 203.78 204.19 204.60 205.02 205.45 205.87 206.30 206.71
2027-04-17|Square|Chiron|Moon|55.00|-|323.33 323.72 324.13 324.55 324.97 325.40 325.83 326.24 326.65
2027-04-23|Trine|Saturn|Saturn|275.00|-|31.46 32.34 33.22 34.10 34.98 35.84 36.68 37.49 38.27
2027-05-08|station|Pluto|-|-|retrograde|320.00 320.08 320.13 320.17 320.18 320.17 320.13 320.08 320.00
2027-05-09|Conjunction|Saturn|Jupiter|200.00|-|196.50 197.38 198.25 199.11 199.94 200.75 201.52 202.25 202.94
2027-05-13|Opposition|Saturn|Mars|120.00|-|296.64 297.51 298.38 299.22 300.04 300.82 301.57 302.28 302.94
2027-05-19|Square|Jupiter|Sun|10.00|-|278.17 278.42 278.82 279.35 280.01 280.79 281.67 282.66 283.73
2027-05-23|Square|Neptune|Neptune|150.00|-|239.19 239.42 239.63 239.83 240.01 240.17 240.31 240.42 240.51
2027-05-25|Trine|Jupiter|Saturn|275.00|-|152.65 153.02 153.54 154.18 154.94 155.81 156.78 157.84 158.98
2027-06-08|Trine|Saturn|Uranus|300.00|-|57.08 57.87 58.63 59.35 60.03 60.65 61.21 61.71 62.15
2027-06-09|Trine|Jupiter|Jupiter|200.00|-|316.65 317.31 318.09 318.97 319.96 321.03 322.18 323.40 324.68
2027-06-12|Sextile|Jupiter|Mars|120.00|-|56.55 57.26 58.09 59.01 60.03 61.14 62.32 63.57 64.88
2027-06-25|Sextile|Mars|Sun|10.00|-|296.67 299.81 303.13 306.61 310.22 313.96 317.82 321.78 325.84
2027-06-28|Trine|Jupiter|Uranus|300.00|-|175.61 176.57 177.61 178.74 179.94 181.21 182.53 183.91 185.32
2027-07-09|station|Neptune|-|-|retrograde|19.44 19.53 19.60 19.64 19.66 19.65 19.61 19.55 19.46
2027-07-15|Sextile|Mars|Moon|55.00|-|99.84 103.44 107.16 111.00 114.95 119.00 123.14 127.37 131.68
2027-07-16|Sextile|Jupiter|Chiron|95.00|-|149.95 151.12 152.36 153.66 155.01 156.41 157.85 159.31 160.80
2027-07-26|Sextile|Jupiter|Mercury|25.00|-|319.71 320.98 322.30 323.68 325.09 326.54 328.02 329.52 331.03
2027-08-08|station|Chiron|-|-|retrograde|47.33 47.48 47.58 47.65 47.67 47.64 47.57 47.46 47.31
2027-08-08|Trine|Chiron|Neptune|150.00|-|268.28 268.43 268.53 268.60 268.62 268.59 268.52 268.41 268.26
2027-08-09|station|Saturn|-|-|retrograde|40.20 40.49 40.70 40.83 40.88 40.84 40.72 40.51 40.23
2027-08-09|Sextile|Saturn|Chiron|95.00|-|34.16 34.45 34.66 34.79 34.84 34.80 34.68 34.47 34.19
2027-08-15|Sextile|Uranus|Lilith|260.00|-|199.02 199.31 199.57 199.81 200.00 200.16 200.28 200.36 200.40
2027-08-23|Trine|Jupiter|Neptune|150.00|-|24.01 25.46 26.94 28.44 29.95 31.47 32.99 34.50 36.00
2027-08-28|Opposition|Uranus|Venus|340.00|-|159.23 159.47 159.67 159.83 159.96 160.04 160.09 160.09 160.05`;
