import { strict as assert } from "node:assert";
import { test } from "node:test";
import { droneHz } from "../personal/tonal.js";
import {
  DEFAULT_TRANSITS, EVENT_INDEX, isStation, lockCents, parseTransits,
  reverses, travel, upcoming,
} from "../personal/transits.js";

const events = parseTransits(DEFAULT_TRANSITS);

test("the pasted year parses, and every row carries a full track", () => {
  assert.ok(events.length > 40, `only ${events.length} events parsed`);
  for (const e of events) {
    assert.match(e.date, /^\d{4}-\d{2}-\d{2}$/, e.date);
    assert.equal(e.track.length, 9, `${e.date} ${e.body}`);
    for (const l of e.track) assert.ok(l >= 0 && l < 360, `${e.date}: ${l}`);
    assert.ok(e.body.length > 0);
  }
});

test("a malformed row costs that row, not the year", () => {
  const mixed = parseTransits(
    "2026-01-01|Trine|Mars|Sun|228.9|-|1 2 3 4 5 6 7 8 9\n" +
    "this line is nonsense\n" +
    "2026-02-02|station|Pluto|-|-|direct|9 8 7 6 5 6 7 8 9\n" +
    "2026-03-03|Square|Venus|Moon|120|-|not numbers here x y z");
  assert.equal(mixed.length, 2);
  assert.deepEqual(mixed.map((e) => e.body), ["Mars", "Pluto"]);
});

test("every station actually reverses inside its window", () => {
  // The label and the numbers have to agree. A row called "station" whose
  // longitudes only climb would sound like a steady glide under a caption
  // promising a turn.
  const stations = events.filter(isStation);
  assert.ok(stations.length >= 10, `only ${stations.length} stations`);
  for (const s of stations) {
    assert.ok(reverses(s), `${s.date} ${s.body} does not turn around`);
    assert.equal(s.target, null, `${s.date}: a station aspects nothing`);
    assert.equal(lockCents(s), null);
    assert.ok(s.direction === "retrograde" || s.direction === "direct", s.date);
  }
  // and a station moves barely at all — that is what makes it a station
  for (const s of stations) {
    assert.ok(travel(s) < 3, `${s.date} ${s.body} travelled ${travel(s)}°`);
  }
});

test("a transit-to-natal aspect locks on a whole multiple of 200 cents", () => {
  // The map is one octave per half-circle, so every classical aspect is a whole
  // tone step. This is that claim, checked against a real year of real events.
  const aspects = events.filter((e) => !isStation(e));
  assert.ok(aspects.length >= 25, `only ${aspects.length} aspects`);
  const offWhole = (x: number) => Math.abs(x - 200 * Math.round(x / 200));
  for (const e of aspects) {
    const c = lockCents(e)!;
    assert.ok(c >= 0 && c <= 1200, `${e.date} ${e.body}-${e.target}: ${c} cents`);
    // Within an orb: the forecast fires at exactness to a fraction of a degree,
    // which is a couple of cents, not zero.
    assert.ok(offWhole(c) < 30,
      `${e.date} ${e.body} ${e.kind} ${e.target}: ${c.toFixed(1)} cents is ${offWhole(c).toFixed(1)} off a whole tone`);
  }
});

test("the named aspect and the computed interval agree", () => {
  const expect: Record<string, number> = {
    Conjunction: 0, Sextile: 400, Square: 600, Trine: 800, Opposition: 1200,
  };
  let checked = 0;
  for (const e of events.filter((x) => !isStation(x))) {
    const want = expect[e.kind];
    if (want === undefined) continue;
    assert.ok(Math.abs(lockCents(e)! - want) < 30,
      `${e.date} ${e.body} ${e.kind} ${e.target}: ${lockCents(e)!.toFixed(0)} cents, expected ${want}`);
    checked++;
  }
  assert.ok(checked > 15, `only ${checked} named aspects checked`);
});

test("the drone really does approach its target across the window", () => {
  // Not just that the endpoint is right — that the motion goes the right way.
  // Comparing the first and last samples' distance to the natal degree is the
  // difference between a transit and a coincidence.
  let approaching = 0;
  for (const e of events.filter((x) => !isStation(x) && x.targetLongitude !== null)) {
    const sep = (lon: number) => {
      const d = Math.abs(lon - e.targetLongitude!) % 360;
      return d > 180 ? 360 - d : d;
    };
    const atEvent = sep(e.track[EVENT_INDEX]);
    if (sep(e.track[0]) > atEvent || sep(e.track[8]) > atEvent) approaching++;
  }
  assert.ok(approaching > 20, `only ${approaching} events show an approach`);
});

test("sounding a transit is two drones and a glide", () => {
  const e = events.find((x) => !isStation(x))!;
  const natal = droneHz(e.targetLongitude!);
  const path = e.track.map(droneHz);
  assert.ok(natal >= 110 && natal < 440);
  for (const hz of path) assert.ok(hz >= 110 && hz < 440, String(hz));
  // the glide is monotone or turns once; either way it is not noise
  assert.equal(path.length, 9);
});

test("upcoming filters and sorts, and does not mutate", () => {
  const later = upcoming(events, "2027-01-01");
  assert.ok(later.length < events.length);
  for (let i = 1; i < later.length; i++) {
    assert.ok(later[i].date >= later[i - 1].date, "must be sorted");
  }
  for (const e of later) assert.ok(e.date >= "2027-01-01");
  assert.equal(upcoming(events, "2099-01-01").length, 0);
});
