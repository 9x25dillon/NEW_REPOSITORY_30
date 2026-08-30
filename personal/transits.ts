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
 * The operator's own upcoming year, computed 2026-08-29 for the confirmed natal
 * chart and pasted in. Replace it by pasting a new block — this file sounds a
 * forecast, it does not generate one.
 */
export const DEFAULT_TRANSITS = `# date | kind | body | natal target | its longitude | direction | 9 weekly longitudes, event at the middle
2026-09-09|Trine|Mars|Sun|228.94|-|90.76 95.35 99.88 104.34 108.73 113.04 117.26 121.40 125.43
2026-09-10|station|Uranus|-|-|retrograde|65.36 65.50 65.61 65.67 65.70 65.68 65.62 65.52 65.38
2026-09-12|Square|Chiron|Moon|120.2|-|30.81 30.71 30.58 30.40 30.19 29.95 29.68 29.38 29.07
2026-09-18|Opposition|Chiron|Mercury|209.97|-|30.73 30.60 30.43 30.22 29.98 29.72 29.43 29.12 28.79
2026-09-27|Square|Jupiter|Sun|228.94|-|133.38 134.84 136.27 137.64 138.96 140.21 141.39 142.48 143.49
2026-09-28|Conjunction|Mars|Moon|120.2|-|103.08 107.49 111.82 116.07 120.23 124.29 128.25 132.09 135.80
2026-10-01|Trine|Jupiter|Saturn|259.67|-|134.22 135.66 137.06 138.40 139.68 140.89 142.03 143.07 144.01
2026-10-13|Trine|Jupiter|Jupiter|21.64|-|136.66 138.02 139.32 140.55 141.71 142.78 143.75 144.62 145.37
2026-10-15|Sextile|Jupiter|Mars|202.01|-|137.06 138.40 139.68 140.89 142.03 143.07 144.01 144.85 145.56
2026-10-16|station|Pluto|-|-|direct|303.24 303.17 303.11 303.08 303.07 303.08 303.12 303.18 303.26
2026-10-23|Trine|Saturn|Venus|249.86|-|12.01 11.46 10.91 10.37 9.86 9.38 8.96 8.60 8.31
2026-10-27|Trine|Saturn|Lilith|129.55|-|11.70 11.15 10.60 10.07 9.58 9.13 8.74 8.42 8.18
2026-11-01|Square|Mars|Sun|228.94|-|123.72 127.69 131.55 135.28 138.87 142.30 145.55 148.58 151.37
2026-11-01|Sextile|Chiron|Chiron|88.04|-|29.34 29.03 28.70 28.38 28.05 27.74 27.44 27.17 26.92
2026-11-04|Trine|Jupiter|Uranus|264.74|-|140.72 141.87 142.93 143.88 144.73 145.47 146.07 146.53 146.84
2026-12-10|station|Saturn|-|-|direct|8.64 8.34 8.12 7.98 7.93 7.97 8.10 8.31 8.61
2026-12-12|station|Neptune|-|-|direct|1.84 1.74 1.67 1.63 1.61 1.63 1.67 1.74 1.83
2026-12-12|Trine|Neptune|Moon|120.2|-|1.84 1.74 1.67 1.63 1.61 1.63 1.67 1.74 1.83
2026-12-12|Conjunction|Neptune|North Node|1.14|-|1.84 1.74 1.67 1.63 1.61 1.63 1.67 1.74 1.83
2026-12-13|station|Jupiter|-|-|retrograde|145.83 146.35 146.73 146.95 147.02 146.93 146.68 146.28 145.73
2026-12-13|Sextile|Jupiter|Chiron|88.04|-|145.83 146.35 146.73 146.95 147.02 146.93 146.68 146.28 145.73
2027-01-06|station|Chiron|-|-|direct|26.63 26.47 26.36 26.29 26.26 26.29 26.36 26.47 26.63
2027-01-10|station|Mars|-|-|retrograde|156.07 157.87 159.25 160.12 160.43 160.12 159.16 157.56 155.39
2027-01-20|Trine|Jupiter|Uranus|264.74|-|146.85 146.53 146.06 145.46 144.74 143.92 143.03 142.11 141.19
2027-01-22|Trine|Saturn|Lilith|129.55|-|8.12 8.35 8.66 9.06 9.53 10.06 10.67 11.33 12.04
2027-01-26|Trine|Saturn|Venus|249.86|-|8.24 8.52 8.88 9.32 9.83 10.40 11.04 11.73 12.47
2027-02-08|station|Uranus|-|-|direct|62.02 61.87 61.77 61.70 61.68 61.70 61.77 61.88 62.03
2027-02-08|Sextile|Uranus|Moon|120.2|-|62.02 61.87 61.77 61.70 61.68 61.70 61.77 61.88 62.03
2027-02-08|Sextile|Uranus|North Node|1.14|-|62.02 61.87 61.77 61.70 61.68 61.70 61.77 61.88 62.03
2027-02-11|Sextile|Jupiter|Mars|202.01|-|145.36 144.62 143.79 142.90 141.98 141.05 140.17 139.35 138.62
2027-02-14|Trine|Jupiter|Jupiter|21.64|-|145.06 144.28 143.42 142.51 141.58 140.67 139.81 139.03 138.35
2027-03-01|Trine|Jupiter|Saturn|259.67|-|143.29 142.37 141.45 140.54 139.69 138.92 138.26 137.73 137.33
2027-03-08|Square|Jupiter|Sun|228.94|-|142.37 141.45 140.54 139.69 138.92 138.26 137.73 137.33 137.09
2027-03-11|Sextile|Chiron|Chiron|88.04|-|26.87 27.12 27.40 27.71 28.06 28.42 28.81 29.21 29.63
2027-04-01|station|Mars|-|-|direct|145.91 143.76 142.19 141.24 140.93 141.21 142.05 143.36 145.09
2027-04-13|station|Jupiter|-|-|direct|138.18 137.66 137.29 137.06 137.00 137.08 137.32 137.69 138.21
2027-04-14|Opposition|Chiron|Mercury|209.97|-|28.37 28.75 29.16 29.57 29.99 30.42 30.84 31.27 31.68
2027-04-17|Square|Chiron|Moon|120.2|-|28.53 28.92 29.33 29.75 30.17 30.60 31.03 31.44 31.85
2027-04-23|Trine|Saturn|Saturn|259.67|-|16.13 17.01 17.89 18.77 19.65 20.51 21.35 22.16 22.94
2027-05-08|station|Pluto|-|-|retrograde|307.00 307.08 307.13 307.17 307.18 307.17 307.13 307.08 307.00
2027-05-09|Conjunction|Saturn|Jupiter|21.64|-|18.14 19.02 19.89 20.75 21.58 22.39 23.16 23.89 24.58
2027-05-13|Opposition|Saturn|Mars|202.01|-|18.65 19.52 20.39 21.23 22.05 22.83 23.58 24.29 24.95
2027-05-19|Square|Jupiter|Sun|228.94|-|137.11 137.36 137.76 138.29 138.95 139.73 140.61 141.60 142.67
2027-05-23|Square|Neptune|Neptune|276.05|-|5.24 5.47 5.68 5.88 6.06 6.22 6.36 6.47 6.56
2027-05-25|Trine|Jupiter|Saturn|259.67|-|137.32 137.69 138.21 138.85 139.61 140.48 141.45 142.51 143.65
2027-06-08|Trine|Saturn|Uranus|264.74|-|21.82 22.61 23.37 24.09 24.77 25.39 25.95 26.45 26.89
2027-06-09|Trine|Jupiter|Jupiter|21.64|-|138.29 138.95 139.73 140.61 141.60 142.67 143.82 145.04 146.32
2027-06-12|Sextile|Jupiter|Mars|202.01|-|138.56 139.27 140.10 141.02 142.04 143.15 144.33 145.58 146.89
2027-06-25|Sextile|Mars|Sun|228.94|-|155.61 158.75 162.07 165.55 169.16 172.90 176.76 180.72 184.78
2027-06-28|Trine|Jupiter|Uranus|264.74|-|140.35 141.31 142.35 143.48 144.68 145.95 147.27 148.65 150.06
2027-07-09|station|Neptune|-|-|retrograde|6.44 6.53 6.60 6.64 6.66 6.65 6.61 6.55 6.46
2027-07-15|Sextile|Mars|Moon|120.2|-|165.04 168.64 172.36 176.20 180.15 184.20 188.34 192.57 196.88
2027-07-16|Sextile|Jupiter|Chiron|88.04|-|142.99 144.16 145.40 146.70 148.05 149.45 150.89 152.35 153.84
2027-07-26|Sextile|Jupiter|Mercury|209.97|-|144.68 145.95 147.27 148.65 150.06 151.51 152.99 154.49 156.00
2027-08-08|station|Chiron|-|-|retrograde|34.33 34.48 34.58 34.65 34.67 34.64 34.57 34.46 34.31
2027-08-08|Trine|Chiron|Neptune|276.05|-|34.33 34.48 34.58 34.65 34.67 34.64 34.57 34.46 34.31
2027-08-09|station|Saturn|-|-|retrograde|27.20 27.49 27.70 27.83 27.88 27.84 27.72 27.51 27.23
2027-08-09|Sextile|Saturn|Chiron|88.04|-|27.20 27.49 27.70 27.83 27.88 27.84 27.72 27.51 27.23
2027-08-15|Sextile|Uranus|Lilith|129.55|-|68.57 68.86 69.12 69.36 69.55 69.71 69.83 69.91 69.95
2027-08-23|Trine|Jupiter|Neptune|276.05|-|150.06 151.51 152.99 154.49 156.00 157.52 159.04 160.55 162.05
2027-08-28|Opposition|Uranus|Venus|249.86|-|69.09 69.33 69.53 69.69 69.82 69.90 69.95 69.95 69.91
`;
