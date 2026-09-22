# Battle pass: fighting back, allies, and evolving

This pass follows [Living worlds](LIVING_WORLDS.md) and answers the aeon-6
play report of 2026-09-21 (`drifter.report().txt`). That run lasted 1102 s and
died with the king at 772 of 2310 hp, just above the 30% taming line. All 17
hits were volley arms, out of 175 volleys thrown. The player had 22
mitochondria holding 1298 energy, died at full stamina, carried 100 cells in
the rack, and never tamed a king. Dodging was the only answer to the main
attack, the stations had nothing to give when integrity ran out, the rack could
not display most of what it held, and the late worlds offered nothing new.

Everything below is a gameplay rule in `game/`. None of it is in `src/` and none
of it claims to be acoustics. The standing rules still hold: nothing moves you
but the field, every attack on you is telegraphed, and what is drawn is what
happens.

## Controls added

| Xbox | Keyboard | What |
| --- | --- | --- |
| **A** into an arm | K / right-click | **Riposte.** Burst into a volley arm to catch it and throw it back |
| **R3** (right stick click) | R | **Call** your active companion's special |
| **D-pad ← / →** | Q (back) | Step the rack both ways; B still steps forward |
| **B / D-pad / stick**, **Start** | Q / A-D / 1–3 / click, Space | Choose an evolution card at a birth, then enter |

No existing binding moved.

## Fighting back: the riposte

A burst gives you i-frames. An arm that reaches you during a burst, while the
burst is heading **into** it (within 60° of head-on), is caught and thrown back
at the king. A sideways dodge stays a dodge.

- One arm per burst. Without that limit, standing on the king and bursting on
  the throw caught its whole volley.
- A catch refunds 8 of the burst's 14 stamina.
- A thrown arm does a third of the king's mass per arm: about 1/180 of the bar
  for a six-armed king, 1/60 for a two-armed one. It also kills hunters on your
  plane that it passes through.
- While you hold Y to offer a bond, catches are absorbed rather than thrown,
  and arms already in flight do no harm.
- The catch is swept over the frame. A burst carries you about 32 µm per frame,
  more than the 24 µm catch reach, so a point test let you pass through an arm
  you burst straight into.
- An arm closing on you while a burst is available gets a gold ring. A dashed
  ring around you shows the catch window while it is open.

## The kings' gambits

From the second world, the first wind-up at least 7 s after the last gambit is
the king's signature move instead of a volley. The first world has none. Each
gambit is drawn for its whole wind-up.

| Form | Gambit | Telegraph | Answer |
| --- | --- | --- | --- |
| Strider (4, 7, …) | **Charge** | A lane, locked toward you when the wind-up starts | Step off it. The king is dazed for 1.1 s afterwards |
| Warden (2, 5, …) | **Shock** | A dashed ring 220 µm past the king's edge | Be outside the ring, or burst as the front passes |
| Weaver (3, 6, …) | **Echo** | The volley, plus violet dashed arms half a gap over | The second set flies 0.42 s after the first |

The charge hurts with the king's 36 µm core, not its whole body. The report's
king was 142 µm in radius, and a charge that hit with the whole body landed on
everyone fighting it.

## Allies: companions fight

The active companion is now a body in the water. It kills hunters by holding
them, and a held hunter cannot coil or strike.

- **Strider** darts at the nearest hunter within 170 µm.
- **Warden** goes for whatever is winding up at you within 95 µm. It keeps its
  passive bolt block.
- **Weaver** tethers a hunter within 140 µm from your side.

Rank and PACK raise hold rates and shorten cooldowns.

**R3 calls** the companion's special. The base cooldown is 22 s, minus 3 per
rank.

- **Rush** (Strider): 4 s of free bursts, and catches reach 1.5× further.
- **Aegis** (Warden): clears enemy arms within 170 µm and any shock front, then
  turns hits for 1.5 s.
- **Snare** (Weaver): holds the king for 2.5 s or more. It stops dragging,
  spinning, eating buildings and counting down to its next volley, but your
  field still moves it, so you can walk it into an arm. A snare with no king
  awake is refused without spending the cooldown.

## Mitochondria mend

At full stamina (95+) and 3 s after your last hit, stations you stand at spend
their store on your integrity: 40 energy per point. Stamina is always served
first. All stations share one transfer limit, so twenty mend no faster than one;
they only last longer. The king still eats buildings within 150 µm, stations
included.

## Evolution at every birth

Ending a king, by killing or bonding, deals three different trait cards. Take
one before entering the next world. The cards come from their own seed, so
choosing never shifts the world's random sequence.

| Trait | Per rank | Max |
| --- | --- | --- |
| MEMBRANE | +1 max integrity, and one mended now | 3 |
| REFLEX | catches 35% wider, thrown arms 40% harder | 2 |
| CRISTAE | mitochondria hold and recharge 50% more; repair costs 25% less | 2 |
| CAPACITOR | buildings charge 25% faster | 2 |
| EMPATHY | bond 8 points higher on the bar, 0.5 s quicker | 2 |
| PACK | companion holds 25% harder, calls return 25% sooner (offered once you have one) | 2 |
| CHITIN | +0.6 s of mercy after every hit | 2 |
| PHAGOCYTE | every 8 hunters killed mends one (5 at rank 2) | 2 |
| SURGE | bursts cost 30% less | 2 |

## Readability

- The rack shows 13 slots around the selection, with overflow counts and a
  tally such as `RACK 100: 622x85 6x15`.
- The king's health bar has a jade tick at the taming line, which moves with
  EMPATHY.
- The companion panel shows the call and its cooldown.
- The death screen has a FOUGHT BACK row, and the diagnosis points volley
  deaths at the riposte.
- `drifter.report()` adds a `battle:` line (catches, thrown-home damage,
  gambits, companion holds, calls, mends) and an `evolution:` line.

## How the numbers were set

The first draft was measured headless against the report's king (18 × 622 and
2 × 6, 2310 hp) with four seeds and two minutes per policy. Three problems came
out, each fixed at its cause:

| Measured | Cause | Fix |
| --- | --- | --- |
| A bot that only dodged sideways caught 26–40 arms/min for up to about 3000 damage/min | The swept catch crossed neighbouring arm lines | Catches need a burst into the arm |
| A bot catching every arm it could did 5000 damage/min | Twice the mass per arm was too much at about one catch per volley | A third of the mass per arm: about 860/min for perfect catching, so about 2.7 min to kill that king on catches alone |
| Charges hit on almost every use | Whole-body contact on a 142 µm king, and every third wind-up meant 17 charges/min | A 36 µm core, and a 7 s gap between gambits |

After the fixes, a bot that reads the telegraphs takes about 0.5 charge hits and
1 shock hit per minute, and a bot that ignores them takes about 4 and 2. A rank-1
companion cut landed strikes on a passive player from 4.7/min to about 1/min.

These bot numbers are bounds, not feel. Physical-controller play has not been
tested, and neither has whether the late worlds now hold interest.

## Verification

- `test/combat.test.ts`: 22 tests, covering every rule above and its failure
  side (the dodge, standing off the lane, outside the ring, the ceasefire,
  cooldowns, one catch per burst). The swept-catch test was confirmed to fail
  against the old point test.
- `test/pad.test.ts` adds the R3 call and D-pad rack stepping.
- `node test/browser-upgrades.mjs --interactions --battle`: 29 simulated
  standard-Xbox checks in Chromium. They cover the rack window, D-pad stepping,
  a riposte through the real input path, R3, and choosing a card on the birth
  screen. `--battle-scene` writes staged screenshots (`SHOT_DIR` sets where).
