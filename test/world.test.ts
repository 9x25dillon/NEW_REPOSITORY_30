import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  INHERITANCE_CAP, PRIME_KEEP, cadence, emptyThrone, epitaphFor, feed, firstWorld, holdPoints,
  inheritanceOf, isPrime, nextHelpingBuys, poolFor, primeHelpings, reachOf, sovereignInertia,
  sovereignParticle, structureFrom, throneLedger, volley, worldFrom,
} from "../game/world.js";
import { BUILDABLE, cellFor, motif, recipesFrom } from "../game/lattice.js";
import { YOU } from "../game/pilot.js";
import { contrastFactor } from "../src/gorkov.js";
import { lobeCount } from "../game/shape.js";

function king(fed: string[]) {
  const k = emptyThrone(0, 0);
  for (const hm of fed) feed(k, cellFor(hm));
  return k;
}

test("a king is the most symmetric thing it was fed", () => {
  const k = king(["2", "422", "222"]);
  assert.equal(k.hm, "422", "order 8 beats order 4 and order 2");
  assert.equal(k.mass, 2 + 8 + 4);
  assert.equal(k.freedom, 8 + 1 + 3);
  assert.ok(k.maxHp > 0 && k.hp === k.maxHp);
});

test("feeding it a 432 leaves it with no handle at all", () => {
  // The one group that is non-centrosymmetric and still not piezoelectric: no
  // drivable coefficient, so no way for the field to touch what you made.
  assert.ok(king(["432"]).anchored);
  assert.ok(!king(["622", "422", "23"]).anchored, "everything else can be pushed");
});

test("a king's volley is its own group's symmetry", () => {
  for (const hm of ["2", "3", "6", "422", "23"]) {
    assert.equal(volley(king([hm])).length, lobeCount(hm), `${hm} should throw its own arms`);
  }
  // and it turns, so the gaps between arms cannot be camped
  const k = king(["6"]);
  const a = volley(k).map(([x, y]) => Math.atan2(y, x));
  k.spin = 0.4;
  const b = volley(k).map(([x, y]) => Math.atan2(y, x));
  assert.ok(a.some((v, i) => Math.abs(v - b[i]) > 0.3));
});

test("a heavier king is slower but harder to be near", () => {
  assert.ok(cadence(king(["2"])) > cadence(king(["622", "422", "23"])));
  assert.ok(cadence(king(["622", "422", "23", "432"])) >= 1.15, "never faster than readable");
  assert.ok(sovereignInertia(king(["622"])) > sovereignInertia(king(["2"])));
});

test("the king is a body in the water: your node reels it in", () => {
  const p = sovereignParticle(king(["422"]));
  assert.ok(contrastFactor(p, { rho: 997, c: 1497 }) > 0, "positive in a normal water");
  assert.ok(contrastFactor(p, { rho: 1010, c: 1720 }) > 0, "and in the stiffest one it can make");
});

test("different kings leave genuinely different worlds", () => {
  const thin = worldFrom(king(["2", "2"]), 2);
  const closed = worldFrom(king(["432", "622", "23", "422"]), 2);

  assert.notEqual(thin.name, closed.name, "the name is its crystal system");
  assert.ok(closed.medium.c > thin.medium.c + 200, "a heavier body leaves a stiffer water");
  assert.ok(closed.pitch < thin.pitch * 0.7, "and a finer lattice");
  assert.ok(closed.inheritance > thin.inheritance, "and more of what you built standing");
  assert.notDeepEqual(thin.pool, closed.pool, "and different matter dissolved in it");
});

test("the pool is not a fixed point", () => {
  // The bug this test exists for: deriving the water from the PARTS of what was
  // fed reproduces itself forever. Feed the throne 222s, whose parts are a
  // dimer and a girdle, and you get back dimers and girdles, which build 222s.
  // Eight aeons of headless play produced eight identical worlds.
  const w = worldFrom(king(["222", "222"]), 2);
  assert.ok(!w.pool.includes("a2"), "a squared king must not leave the water it came from");
  assert.ok(w.pool.includes("a3"), "its body opens the next axis up");

  // and it keeps climbing with mass
  assert.ok(poolFor(king(["2"]), 2).includes("a2"));
  assert.ok(poolFor(king(["422", "422"]), 2).includes("a4"));
  assert.ok(poolFor(king(["622", "622", "422", "432"]), 2).includes("a6"));
});

test("only one principal axis is ever dissolved at a time", () => {
  // Two different axials refuse to bind, so a water holding both is not richer,
  // it is unusable.
  for (const fed of [["2"], ["222", "222"], ["422", "422"], ["622", "432", "23"]]) {
    const pool = poolFor(king(fed), 3);
    const axials = new Set(pool.filter((m) => m.startsWith("a") && m !== "a5"));
    assert.equal(axials.size, 1, `[${pool}] carries ${axials.size} principal axes`);
  }
});

test("from the third aeon some of the water is simply useless", () => {
  assert.ok(!poolFor(king(["2"]), 2).includes("a5"));
  assert.ok(poolFor(king(["2"]), 3).includes("a5"), "pentamers, which build nothing ever");
});

test("a structure holds along its own group's directions", () => {
  const s = structureFrom(1, "622", 400e-6, 300e-6);
  assert.equal(holdPoints(s).length, 6);
  assert.equal(structureFrom(2, "222", 0, 0).lobes.length, 2);
  assert.ok(reachOf("622") > reachOf("2"), "more order reaches further");
  for (const [x, y] of holdPoints(s)) {
    assert.ok(Math.abs(Math.hypot(x - s.x, y - s.y) - s.reach) < 1e-12);
  }
});

test("the epitaph reports the world it is about to make", () => {
  const k = king(["422", "222"]);
  const w = worldFrom(k, 3);
  const e = epitaphFor(k, w);
  assert.equal(e.name, w.name);
  assert.ok(e.lines.some(([label]) => label === "BORN OF"));
  assert.ok(e.lines.some(([, v]) => v.includes(`${w.medium.c.toFixed(0)}`)));
});

test("the first water is nobody's", () => {
  const w = firstWorld();
  assert.equal(w.aeon, 1);
  assert.equal(w.inheritance, 0);
  assert.deepEqual(w.wildlife, ["vesicle"]);
});

test("no king can leave behind a water that will not carry you", () => {
  // The medium is derived from the sovereign, and the derivation used to be
  // able to land on the player's own iso-acoustic point: fed a 1, a 1 and a 2
  // it produced rho 940 / c 1410, where a body of your density has a contrast
  // factor of 0.0005 and the field moves you at one per cent of normal speed.
  // Grip does not help — it multiplies a number that is already zero — so the
  // run was over and nothing said so. Every reachable water is checked.
  let worst = Infinity;
  let via = "";
  for (const a of BUILDABLE) {
    for (const b of BUILDABLE) {
      for (const c of ["", ...BUILDABLE]) {
        const k = emptyThrone(0, 0);
        feed(k, cellFor(a));
        feed(k, cellFor(b));
        if (c) feed(k, cellFor(c));
        for (const aeon of [2, 5]) {
          const phi = Math.abs(contrastFactor(YOU, worldFrom(k, aeon).medium));
          if (phi < worst) { worst = phi; via = `${a}+${b}${c ? `+${c}` : ""} at aeon ${aeon}`; }
        }
      }
    }
  }
  assert.ok(worst >= 0.02,
    `a king can strand you: phi ${worst.toFixed(4)} via ${via}`);
});

// ── the opening ─────────────────────────────────────────────────────────────

test("the first water is a choice, and one of them is cubic", () => {
  // It used to hold a dimer and a girdle, which make a 222 and nothing else, so
  // the opening had no decision in it at all: you gathered what drifted past and
  // got the one cell there was. A single diagonal opens three off one axis.
  const w = firstWorld();
  const offered = recipesFrom(w.pool);
  assert.ok(offered.length >= 3, `the opening offers ${offered}`);
  assert.deepEqual(offered, ["2", "222", "23"]);

  // And they are genuinely different things, not three names for one cell.
  const orders = offered.map((hm) => cellFor(hm).structure);
  assert.equal(new Set(orders).size, 3, "three distinct orders");
  assert.ok(cellFor("23").structure > cellFor("222").structure * 2,
    "the cubic one is worth chasing");

  // The harder cell is harder because its second part is harder to hold: a
  // girdle is five and a half microns and a diagonal is 1.6, barely over the
  // streaming crossover. Nobody set a difficulty on it.
  assert.ok(motif("d").particle.radius < motif("g").particle.radius / 3);

  // Still exactly one principal axis. Two would refuse to bind and the water
  // would be full of matter that cannot be used together.
  const axials = new Set(w.pool.filter((m) => m.startsWith("a")));
  assert.equal(axials.size, 1);
});

test("no water a king can leave is narrower than the one it was born in", () => {
  // The girdle used to arrive at mass six and the diagonal at eighteen, so a
  // king fed a single 222 left a water of pure dimers with ONE recipe in it — a
  // world that got narrower the longer you survived.
  for (const a of BUILDABLE) {
    for (const b of ["", ...BUILDABLE]) {
      const k = emptyThrone(0, 0);
      feed(k, cellFor(a));
      if (b) feed(k, cellFor(b));
      for (const aeon of [2, 3, 6]) {
        const pool = poolFor(k, aeon);
        const offered = recipesFrom(pool);
        assert.ok(offered.length >= 2,
          `${a}${b ? `+${b}` : ""} at aeon ${aeon} leaves ${offered.length} recipes: [${pool}]`);
      }
    }
  }
});

test("a diagonal is only dissolved where the axis can use it", () => {
  // Of the eleven chiral groups exactly two are cubic — 23 off a two-fold and
  // 432 off a four-fold — so a diagonal in a threefold water builds nothing and
  // is only something to gather by mistake.
  for (const fed of [["2"], ["222"], ["23"], ["422", "422"], ["622", "622", "432"]]) {
    const k = emptyThrone(0, 0);
    for (const hm of fed) feed(k, cellFor(hm));
    const pool = poolFor(k, 2);
    const axis = pool.find((m) => m.startsWith("a") && m !== "a5");
    const usable = axis === "a2" || axis === "a4";
    assert.equal(pool.includes("d"), usable,
      `[${pool}] carries a diagonal its ${axis} cannot build with`);
  }
});

// ── what feeding it actually buys ───────────────────────────────────────────

test("a throne is sated long before it is full", () => {
  // THE MEASUREMENT THIS EXISTS FOR, from the play report of 2026-09-06: a
  // sixfold throne fed FIFTY helpings, 5850 hit points woken, 98 discharges
  // landed on the king and the run lost to it anyway.
  //
  // Every benefit of feeding is clamped — inheritance at mass 30, the lattice
  // pitch, the sound speed, the suspension, the depth mode and the volley
  // cadence all between 42 and 46 — and `maxHp` is clamped by nothing. So past
  // a point a helping is a straight exchange of health for nothing, it looks
  // exactly like progress, and the one benefit the throne panel ever showed
  // reads 60% before and 60% after.
  const c = cellFor("622");
  const k = emptyThrone(0, 0);
  const bought: number[] = [];
  for (let n = 1; n <= 12; n++) {
    if (nextHelpingBuys(k, c, 6).length > 0) bought.push(n);
    feed(k, c);
  }

  assert.ok(bought.length > 0, "the first helpings must buy something or feeding is pointless");
  assert.equal(bought[0], 1, "the first one always does");
  // WHAT MASS BUYS still runs out once and early — that is the finding this
  // test was written for. The counts that keep buying past it are the PRIME
  // ones, and they are a deliberate exception: see `isPrime` in world.ts.
  const plain = [];
  for (let n = 1; n <= 12; n++) if (!isPrime(n)) plain.push(n);
  const fromMass = bought.filter((n) => !isPrime(n));
  assert.deepEqual(fromMass, plain.slice(0, fromMass.length),
    `what mass buys must run out ONCE, not flicker (${fromMass.join(",")})`);
  assert.ok(fromMass[fromMass.length - 1] <= 6,
    `and it runs out early — this is the whole finding (${fromMass[fromMass.length - 1]})`);

  // Past that, only a prime count buys anything, and the health rises whatever
  // the count is: that exchange is the decision the panel has to show.
  const before = k.maxHp;
  feed(k, c);                                    // 13 fed, so the next makes 14
  assert.ok(k.maxHp > before, "the health keeps rising");
  assert.ok(!isPrime(14));
  assert.equal(nextHelpingBuys(k, c, 6).length, 0, "and a plain count now buys nothing");
  feed(k, c);                                    // 14 fed, so the next makes 15
  feed(k, c);                                    // 15 fed, so the next makes 16
  feed(k, c);                                    // 16 fed, so the next makes 17, which is prime
  assert.ok(isPrime(17));
  assert.deepEqual(nextHelpingBuys(k, c, 6), ["WHAT THE NEXT WORLD KEEPS"],
    "a prime helping buys the one thing that was clamped");
});

test("a prime helping is worth what it says, and only up to the ceiling", () => {
  const c = cellFor("622");
  const k = emptyThrone(0, 0);
  const at = (n: number): number => {
    const t = emptyThrone(0, 0);
    for (let i = 0; i < n; i++) feed(t, c);
    return inheritanceOf(t);
  };
  assert.equal(primeHelpings(1), 0);
  assert.equal(primeHelpings(3), 2, "two and three");
  assert.equal(primeHelpings(31), 11);
  assert.ok(at(3) > at(1), "two primes and two helpings of mass");
  // Mass alone stops at 0.6 — a sixfold throne is there by its fourth helping —
  // and the prime term is added PAST that, up to its own cap.
  const four = emptyThrone(0, 0);
  for (let i = 0; i < 4; i++) feed(four, c);
  assert.ok(Math.min(0.6, 0.12 + four.mass * 0.016) === 0.6, "mass is at its ceiling by four");
  assert.ok(Math.abs(inheritanceOf(four) - (0.6 + PRIME_KEEP * primeHelpings(4))) < 1e-9,
    "so what it keeps past that is exactly what its primes bought");
  for (let i = 0; i < 60; i++) feed(k, c);
  assert.equal(inheritanceOf(k), INHERITANCE_CAP);
  assert.ok(INHERITANCE_CAP > 0.6, "which is further than mass alone could reach");
});

test("the throne reads back what its helpings bought", () => {
  // The report's own throne, replayed. It is the run in one line, and it
  // happened at the throne rather than in the fight.
  const fifty = king(new Array(50).fill("622"));
  const led = throneLedger(fifty, 6);
  assert.equal(led.bought + led.wasted, 50, "every helping is one or the other");
  // Fifty helpings of one cell: the first few buy what mass buys, the fifteen
  // prime counts buy what a prime buys, and the other thirty-odd buy health.
  assert.ok(led.wasted >= 30,
    `most of fifty helpings bought nothing (${led.bought} bought, ${led.wasted} did not)`);
  // What bought something is the early ones and then the primes, until the
  // prime term reaches its own ceiling. Counted, not indexed: primes fall
  // wherever they fall, so the ones that bought are no longer a prefix.
  assert.ok(led.bought >= 8 && led.bought <= 20,
    `the early helpings and the primes under the ceiling (${led.bought})`);
  const at17 = king(new Array(16).fill("622"));
  assert.deepEqual(nextHelpingBuys(at17, cellFor("622"), 6), ["WHAT THE NEXT WORLD KEEPS"],
    "the seventeenth helping still buys, because seventeen is prime");
  // Three quarters rather than four fifths: the prime helpings' own health is
  // no longer counted as wasted, because they bought something.
  assert.ok(led.health > fifty.maxHp * 0.75,
    `and most of the bar is health that bought nothing (${led.health} of ${fifty.maxHp})`);

  // A throne inside its ceiling has nothing to answer for, and an empty one is
  // not accused of anything either.
  assert.equal(throneLedger(king(["622"]), 6).wasted, 0);
  assert.equal(throneLedger(king(["622", "622"]), 6).wasted, 0);
  const empty = throneLedger(emptyThrone(0, 0), 6);
  assert.deepEqual([empty.bought, empty.wasted, empty.health], [0, 0, 0]);
});

test("what a helping buys is read off the world, not restated from its clamps", () => {
  // The two halves that must not drift apart. `nextHelpingBuys` names a
  // quantity only when `worldFrom` and its neighbours actually return something
  // different — so if one of those ceilings is ever retuned, this moves with it
  // instead of going quietly stale.
  const c = cellFor("222");
  const k = king(["222"]);
  const before = worldFrom(k, 4);
  const named = nextHelpingBuys(k, c, 4);
  feed(k, c);
  const after = worldFrom(k, 4);

  const changed = before.pitch !== after.pitch || before.medium.c !== after.medium.c
    || before.density !== after.density || before.mode !== after.mode
    || before.pool.join() !== after.pool.join()
    || before.wildlife.join() !== after.wildlife.join();
  assert.equal(named.length > 0, changed,
    "it must claim a purchase exactly when the world it would make is different");
});
