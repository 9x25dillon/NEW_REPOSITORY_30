# Handoff

Written at the end of the session of 2026-08-31, extended 2026-09-02, and
extended again at the end of 2026-09-02 (the chip session), for whoever picks
this up next.
Everything here is checkable — if a claim in this file disagrees with the code,
the code is right and this file is stale.

---

## What this repository is

Two things over one library, kept apart on purpose.

**`src/` is an instrument.** Point groups, the Gor'kov radiation potential, BAW
and SSAW field solvers, overdamped trajectories, Neumann's principle, band
structure over the Brillouin-zone torus, the 65 Sohncke space groups. Every
result in it is answerable by an experiment, and that is the whole of its value.

**`game/` + `app/drifter.ts` is SONIC DRIFTER**, a game whose rules *are* that
physics. Nothing in it is a stat block. Where a game would normally hold a
tuning constant, this one calls the library and uses what comes back.

`personal/` is a separate tonal layer (a chart played as a chord) that must
never touch `src/`. `config/` holds one subject record.

### The rules that hold it together

`test/boundary.test.ts` reads actual import statements and fails if any of these
is violated. **If it starts failing, the question is not how to make it pass —
it is which claim just leaked into which.**

- `src/` never imports `personal/` or `config/`.
- `personal/` never imports `src/`.
- `game/` may import `src/` (that is the point) but never `personal/` or `config/`.
- **`src/` never imports `game/`.** One-way. The moment a library constant is
  tuned for playability it stops being a measurement.
- The bench app (`app/main.ts`, `field.ts`, `listen.ts`) and the game surface
  (`app/drifter.ts`, `pad.ts`, `sfx.ts`) never import each other.

---

## State

```
branch   main   (pushed to origin/main 2026-09-02, through six play reports and
                the first aeon-6 run; the repo is PRIVATE, which is what
                config/subject.ts assumes — check before that ever changes)
tests    301, all passing
serve    python3 -m http.server on app/ WITH no-store headers — a plain
         http.server let a browser cache a build and cost a whole play session
         debugging code that had already been fixed
build    npm test | npm run typecheck | npm run drifter
play     app/sonic-drifter.html — one file, no build step, no network
```

`npm run typecheck` runs *both* tsconfigs. The main one deliberately excludes the
DOM so `src/` cannot reach for a browser; `tsconfig.build.json` covers `app/`.
`test/pad.test.ts` is excluded from the first because it pulls in a DOM module.

---

## The game, module by module

| | |
| --- | --- |
| `game/wave.ts` | the field: crossed standing waves, apodisation, stamina, and `advance()` — substepped integration sized by the **relaxation rate**, not by displacement |
| `game/pilot.ts` | you: a 9 µm lipid particle. The stick is a trap *offset*, not a velocity. Grip is apodisation. The dash is the amplifier's peak rating |
| `game/beasts.ts` | four bodies, told apart only by contrast factor |
| `game/lattice.ts` | the 11 chiral cells, the recipes, `optionsFor()` |
| `game/shape.ts` | what a point group looks like from above — used for firing arcs, king volleys, *and* which way a limb may grow |
| `game/world.ts` | worlds, sovereigns, what is born from a body |
| `game/bound.ts` | the other field: a mode trapped in a band gap. `workableSpacing()` inverts the objective into microns |
| `game/body.ts` | the lattice, what is joined to what, its space group, limbs, legs, gait |
| `game/depth.ts` | the channel's harmonics. Mode *n* puts *n* node planes in the fluid |
| `game/streams.ts` | laminar co-flow: the channel carries three waters, not one |
| `game/chip.ts` | what is etched into the glass — sharp edges, bubble cavities — and the streaming that comes off it. The only thing in the game older than the current world. A cavity collects, an edge pumps, and both have a job |
| `game/thermal.ts` | the water's temperature, and what your own drive does to it. Standard fits for water — Marczak, Kell, Vogel — which land on the three constants `src/` had already pinned. Viscosity halves by 65 C, so **hot water is thin water and the whole game runs faster** |
| `game/run.ts` | the aeon: settle, crown, reign, birth |
| `app/pad.ts` | controller and keyboard, one intent shape |
| `app/drifter.ts` | the surface. Renders only what is true |

### Design rules that are load-bearing

These are not preferences. Breaking one breaks something else two modules away.

1. **Nothing moves the player but the field.** No velocity term exists in
   `game/`. If you want to move something, put a trap where you want it.
2. **A standing wave is a fence.** Any always-on lattice pins every body to its
   nearest node. This is why `CRUISE_AMPLITUDE` is low and its aperture narrow:
   at half amplitude and a wide aperture, nothing in the water can reach the
   player and the game has no threats in it.
3. **All damage is telegraphed.** A hunter hurts you only during its strike.
   Being caught in your grip removes the strike before it happens.
4. **Everything dies by being held** — including the sovereign, which is worked
   on rather than trapped because it is 38 µm across against a 44 µm lattice.
5. **A body can only grow, fire, or walk along the directions its own point
   group has.** `shape.lobes()` decides all three.
6. **The chip is not run state.** `CHIP` is a module constant in `run.ts`, not a
   field on `Run`. Everything on `Run` is born with a world and dies with it;
   the channel is the glass all of them happen inside. Put the chip on the run
   and you have said the next aeon gets a different one — and there is then no
   landmark in this game, because a landmark has to outlive the level.
7. **Streaming is powered by your own drive**, so gripping makes every jet on
   the chip fiercer. The way out of a whirlpool is to let go. This inverts the
   game's central habit on purpose; do not "fix" it.
8. **The instrument may refuse.** `bands.completeGap` throws when its plane-wave
   expansion stops being trustworthy; `game/bound.ts` catches that and reads it
   as "no gap". Do not "fix" the library to stop it refusing.
9. **`world.density` is a CONCENTRATION, not a count.** `suspension(run)` scales
   it by the water you have opened. It was spent as an absolute count for most
   of this project's life and the consequence was invisible: the channel is 21.2
   times the starting pool, the whole population lived in the middle five per
   cent of it, and every landmark on the chip was a collector standing in
   distilled water. If you ever see `run.world.density` used directly as a
   population, that is the bug coming back.
10. **The throne stands at a landmark, and it is sited AFTER `retune`.** From
   the second aeon it goes to the chip feature nearest to where the last king
   fell. It must be chosen against the pool you *inherit*, not the one you just
   fought in — those differ by `world.inheritance`, and getting it wrong puts
   the throne outside the water where it can never be fed. There is a test that
   plants exactly that.
11. **Nothing on the chip goes off by itself.** A building standing in fast
   water holds a charge, but discharging is `driving && near` and only that. A
   structure that fired because it was in a current would be spending itself at
   whatever happened to be in front of it, which is nothing the player decided.
12. **The water is not a spring.** Arrivals are a RATE — `arrivalRate`, derived
   from how fast the co-flow and bulk streaming carry water across your pool —
   and what you gather out comes back only that fast. It used to be
   `motifs < suspension`, one pushed per frame, which is sixty a second and
   never runs dry; the first play report came back with 3440 cells and an unfed
   throne because of it. Opening new water is a SEPARATE and instant thing
   (`delivered`), because reaching further reaches water that already had cells
   in it. Do not merge those two back together.
13. **Standing water breeds, and the first two minutes do not.** `settleCap`
   grows by one hunter every `STANDING` seconds in the same world, capped at a
   reign's crowd. Settling is meant to be quiet — it is the phase people learn
   the game in — so the fix for "settling never ends" must never become
   "settling is a fight". There is a test on each side of that.
14. **Anything asking "which buildings reach this point" goes through
   `indexStructures`.** `drift` and `underStructure` run per entity per frame;
   at 410 buildings and 636 motifs the direct loops cost 53.5 ms a frame. Do not
   reintroduce `holdPoints()` into either — it allocates an array per structure
   per entity.
15. **A flow has two ends.** Arrivals are a rate (`arrivalRate`) and departures
   are the same figure used the other way round (`washOut`), so what comes in
   and what goes out cannot drift apart. Without the second one a late water
   silts up with pentamers — which by the crystallographic restriction theorem
   join nothing, ever, while everything else is consumed into cells: measured at
   80 per cent of the standing population after fifteen minutes. **What is held
   does not wash out**, and that is what makes it part of the game rather than a
   tax on it.
16. **`currentAt` is the only place the world's circulation is computed.** It
   was computed twice, from two different origins — `pilot.carry` from the
   pool's corner and `run.drift` from the channel's — so the player and every
   other body were in different current fields whenever the pool was smaller
   than the channel. In a 2000 um pool they point OPPOSITE WAYS at the centre.
   The player's report was "being drawn in a direction i couldnt figure out".
17. **A discharge's falloff and `DEVOUR_REACH` are a pair.** Damage falls off
   across an arm; the king eats buildings within 150 um. If the falloff is steep
   enough that the worthwhile damage lies inside that radius, then good damage
   and a surviving building are mutually exclusive — which is not a decision, it
   is a vice, and a squared curve shipped that way for one commit. There is a
   test holding the two to each other.
18. **Nothing fires without a target.** A fully charged building holds until the
   king is in its arm. Measured on a real layout: four of 81 buildings bear at
   any moment and at 44 per cent of the positions the king can stand in, none
   do. Firing on a timer was a coin toss with a building as the stake.
19. **Every animation phase must be wrapped, not left to `%`.** JavaScript's
   modulo is signed. One negative frame time made `this.t` negative, every
   `(t * k) % 1` went negative with it, and `drawBound` turned one into a
   circle with a radius of minus twenty-two — which the canvas refuses, killing
   the render loop. `dt` is clamped to [0, 0.05] now; a negative dt was also
   stepping the simulation backwards, with no symptom at all.
20. **`mergePass` is a grid of exactly `BIND_RADIUS`.** That pitch is what makes
   the nine-square lookup complete — every possible partner is in it and nothing
   else can be. If you change `BIND_RADIUS`, the grid follows it automatically;
   if you change the grid's pitch independently, motes stop finding each other
   across square boundaries and nothing will look wrong.

---

## The feedback loop that actually works

The player runs `drifter.report()` in the browser console and pastes the result.
It gives phase, rack, throne, bodies, the crystal and its gap, every event
counted, and a one-line diagnosis. **Nearly every real bug this session was found
that way and not by reasoning.** Examples, all from single reports:

- `hit:touched=6 hit:struck=1` → ambient contact was doing full damage, which is
  unreadable and unanswerable.
- `fed 51 cells -> 3810 hp` → feeding shared a button with building, and the
  throne sits where people build.
- `step=3` (after a run with `step=620`) → a fix for one complaint had created
  another.

The same discipline works without a player, and did all of the 2026-09-02 chip
session. Every change below started as a probe that printed its own reasons:

- "0 motifs within 200 um of a wall, median 303 um from the player" → the outer
  channel was empty, which is why going to a landmark paid nothing. That one
  measurement redirected the entire session away from what was planned.
- "radiation 0.0 um/s vs chip flow 94.2 um/s → the chip wins" → the cavity was
  never the problem, so no time was spent on it.
- "nearest tip to core 53 um (catch 20 um) → merges=0" against "nearest tip to
  core 0 um → merges=22" → the difference between the two probes WAS the design.

**The first play report of the chip work, and what one paste was worth.** It
read: 909 s, aeon 1, 3440 cells built, 410 buildings standing, bound field
FREED, one hit taken, throne EMPTY. Each of those was a separate finding and
none had been reached by a day of measuring:

- 3440 cells against a table that calls 16–35 per three minutes normal — the
  suspension change had removed the ceiling on an aeon's economy, and the commit
  that shipped it contained the false claim that did it ("the count near you
  does not change": true of a player standing still, false of one whose
  buildings cover the channel).
- 410 buildings — a number nobody had simulated, and enough to cost 53.5 ms a
  frame in two O(entities × structures) loops. The player was in slow motion and
  nothing on the screen said so.
- throne empty at 909 s — settling had no end, and the diagnosis line answered
  that run with a combat tip.

If the user reports a problem in prose, **ask for a report before building
anything.**

---

## Open, known, not fixed

1. ~~**The controller does not deliver input on the user's machine.**~~ SOLVED
   2026-09-02, and not by any of the code written for it. **It works over USB.**
   The player plugged the pad in with a cable and reported it "way better with
   controller".

   The whole saga is worth keeping because of how it ended. Four commits of
   browser-side work went in on hypotheses across earlier sessions. Then two
   read-only shell commands killed three theories at once:

   - `flatpak list --app` and `snap list` were both empty, so the browser was
     never sandboxed — which had been the leading theory AND the one that also
     explained a broken `file://` link.
   - `pad.gamepad()` re-calls `navigator.getGamepads()` every poll and holds no
     reference, so the classic stale-snapshot bug was not it either. `app/pad.ts`
     was never at fault.
   - `/proc/bus/input/devices` had **no gamepad in it at all**. joydev loaded,
     usage count 0, no `/dev/input/js*`, and the only HID present was a Compx
     (vendor 3554) 2.4G keyboard/mouse dongle.

   That last one was the answer: the pad was on its wireless dongle, in a mode
   that enumerates as a keyboard and a mouse rather than as a gamepad. The
   browser was right, the code was right, and no amount of either could reach a
   device the kernel was not being shown one of. A cable bypasses the dongle.

   **The lesson, which is the reason this stays in the file:** the bug was never
   in the layer it was reported from. Before writing a fourth commit against a
   symptom, ask what the OS can see — `ls /dev/input/js*` and
   `grep '^N: ' /proc/bus/input/devices` cost nothing and would have ended it at
   the first session.

2. **Both paths work now.** Pad over USB is what the player prefers. Mouse and
   keyboard remain fully supported: point to steer (the offset grows over
   ~130 µm), left button grips, right bursts, WASD overrides. `GLYPH` switches
   every prompt in the game between the two, driven by `pad.connected`, so
   anything new that names a control must go through it — and the title
   screen's difficulty toggle is bound to both `E` and the pad's cycle button
   for that reason.
3. `personal/` and the bench app have not been touched this session.

---

## Where to go next

The user's stated direction, in their words: *"a new dimension of space and
movement that gives way to the creation of things like the water bear"*, then
appendages, tools, armour, and an open world. Most of that now exists.

### Done 2026-09-02 (the chip session)

- ~~**Somewhere to walk to.**~~ Eight sharp edges and four bubble cavities,
  the same in every aeon, coming into reach as the organism grows.
- ~~**Something to build on the chip.**~~ A building at a cavity binds what the
  vortex brings it and makes cells while you are on the other side of the
  channel — and *where* you put it is the decision: a lobe tip on the core
  farms, a tip 50 µm off farms nothing. `HOLD_CATCH` is exported and the
  surface draws the catchment so that decision is visible.
- ~~**The throne is always in the middle.**~~ It stands at the landmark nearest
  to where the last king fell, from the second aeon on.
- ~~**The sharp edges have no job.**~~ A building standing in a tip jet holds a
  charge from water you drove; the lee holds none.
- ~~**The outer channel is empty water.**~~ `world.density` is a concentration
  now. This was the unlock — none of the above is worth anything without it.

### What the play reports fixed, in order

Six reports, and between them they found more real defects than a day of
measuring did. Every one of these was invisible until somebody played:

- **3440 cells and an unfed throne at 909 s.** The suspension had no ceiling —
  `motifs < suspension` refilled sixty a second forever. Arrivals are a rate
  now. The same report exposed 53.5 ms/frame at 410 buildings.
- **A throne never visited, then a king at full health after nine minutes.**
  `drawThrone` printed the discharges-to-kill and returned early the moment the
  king woke, so the one actionable number vanished exactly when it mattered.
- **The `aim` lesson had never been shown to anybody, ever.** `teach()` clobbered
  instead of queueing and three lessons fired on the crown frame. The lesson
  explaining how the fight is won was set and overwritten every single game.
- **"The kings hp wouldnt go down."** It was going UP: seven landed discharges
  for 61 damage against 144 healed. A squared falloff had put the damage inside
  the radius the king eats buildings from.
- **"Drawn in a direction i couldnt figure out."** Two current fields, and the
  circulation had never been drawn at all.
- **A blank screen.** One negative frame time, and `%` is signed.

### What is still open

- **Volleys are most of what kills.** For several runs `hit:volley` was 100 per
  cent of the damage taken; it is now roughly half, since the bestiary started
  landing hits too. Whether that balance is right is unmeasured.
- **Limbs come and go and nothing depends on them.** Reports show 0, 1, 3, 6 and
  7 limbs with no apparent consequence. A limb needs a cell with exactly one
  neighbour, so building solid — which is what people do — grows none. `Cell.
  ability` (thrust / weave / anchor) is still read in exactly one place, and the
  chip gives `anchor` an obvious job it has never had.
- **P432 appeared in a real run** — order 24, zero piezoelectric components, the
  body "the field cannot touch". Nobody has checked what it is like to play.
- **Beauty**, still. It has been asked for once and deferred three times, and
  there is now more worth looking at than there was: 636 motifs where there were
  30, four cavities visibly hoarding them, the water's own circulation drawn,
  and a temperature that changes what everything does.
- **The deep aeons are unexplored past six.** Mode rises with the sovereign's
  mass, so the channel gets more node planes; nobody has been there.

## How to work on this

Things that worked, and are worth repeating:

- **Measure before building.** Every time a probe was written first, the design
  fell out of the numbers. Every time a fix was built on a hypothesis, it cost
  two or three commits — the controller took four.
- **Write the probe so it says *why*.** Three separate times a probe reported
  "nothing moved" and the refusal rule was correct: the test body was on the
  throne, off the arena, or walking into a wall. A probe that prints its own
  reason ends that in one run.
- **A test that cannot fail is a comment with a longer runtime.** The boundary
  tests were verified by planting the exact violations they exist to catch and
  confirming they broke first.
- **Assert that something *happened*, not that nothing threw.** The smoke
  harness passed 200 frames while the game was unplayable, because it only
  checked for exceptions.
- Commit messages here carry the *reasoning*, including what was wrong before
  and how it was found. `git log` is the design record.
- **Probe first, and make the probe print its own reasons.** The 2026-09-02 chip
  session was planned as "make cavities and edges do something" and the first
  probe redirected all of it inside ten minutes, by reporting that no motif was
  ever within 200 µm of a wall. A probe that had only said "the cavity does
  nothing" would have sent the session into the cavity, which was fine.
- **Two probes disagreeing is a finding, not a mistake.** The one that said a
  cavity farm makes nothing and the one that said it makes six cells differed
  only in where the building stood. Chasing that difference produced the actual
  design; picking the "right" probe and moving on would have lost it.
- **When you make something bigger, ask what the change breaks that was fine
  before.** Raising the population 13× made an O(n²) merge pass matter and made
  an unculled renderer matter. Moving the throne two millimetres away made a
  documented player failure — a throne that was never visited — worse. Each of
  those is a second job created by the first one, and each was cheap when caught
  in the same commit.
