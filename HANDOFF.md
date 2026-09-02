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
branch   main   (3 commits AHEAD of origin/main as of the end of 2026-09-02 —
                the chip session's work is committed but NOT PUSHED. The repo is
                PRIVATE, which is what config/subject.ts assumes — check before
                that ever changes)
tests    282, all passing
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
| `game/chip.ts` | what is etched into the glass — sharp edges, bubble cavities — and the streaming that comes off it. The only thing in the game older than the current world. **A cavity collects, an edge pumps, and both now have a job** |
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
12. **`mergePass` is a grid of exactly `BIND_RADIUS`.** That pitch is what makes
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

If the user reports a problem in prose, **ask for a report before building
anything.**

---

## Open, known, not fixed

1. **The controller does not deliver input on the user's machine.** The browser
   sees it (`mapping="standard"`, 4 axes, 17 buttons) and `getGamepads()` returns
   nothing but zeroes. The page says `CLICK THE GAME - A PAGE WITHOUT FOCUS GETS
   NO PAD INPUT` when unfocused, and logs `[pad] first input received` when
   anything arrives. Neither has been confirmed on their machine.

   **Three hypotheses have been killed, all on 2026-09-02, none of them by
   writing code.** Do not spend a fourth commit on any of these:

   - *Flatpak/Snap browser sandbox with no `/dev/input`.* Dead: `flatpak list
     --app` and `snap list` both return nothing. The browser is not sandboxed.
     This also removes the one theory that covered the broken `file://` link as
     the same cause, so that is now unexplained and separate.
   - *Our own polling caching a stale `Gamepad` object* — the classic version of
     this bug, since `getGamepads()` returns a snapshot. Dead: `pad.gamepad()`
     re-calls `navigator.getGamepads()` every poll and holds no reference.
     `app/pad.ts` is not at fault.
   - *A device-permission problem at `/dev/input`.* Dead in a more interesting
     way: **there was no gamepad attached to the machine at all.** `joydev` is
     loaded with usage count 0, no `/dev/input/js*` node exists, and nothing in
     `/proc/bus/input/devices` is a pad — the only HID there is a Compx (vendor
     3554) 2.4G keyboard/mouse dongle and an FDUCE audio interface.

   **So the next step is not a code change, it is one measurement with the pad
   actually connected.** Plug it in or pair it, then:

   ```
   ls /dev/input/js* ; grep -E "^N: " /proc/bus/input/devices
   ```

   If a joystick node and a pad name appear, the OS is fine and the fault is
   browser-side — which at this point means page focus, and `everMoved` /
   `[pad] first input received` are already there to prove it. If nothing
   appears, it is the controller's own mode (many 2.4G pads ship in a
   keyboard-emulation mode and need a button combo to switch to X-input) and no
   amount of browser code will ever reach it.
2. **Mouse and keyboard are the supported path.** Point to steer (the offset
   grows over ~130 µm), left button grips, right bursts, WASD overrides.
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

### What is still open, in the order the geometry argues for

- **The reward for going is a farm, and a farm has no ceiling.** Measured: one
  well-placed building at a cavity made 22 merges and 6 cells in 40 s with the
  player parked on the far side of the channel and never gripping. The tuning
  table in `world.ts` puts *active play* at 16–35 cells in three minutes, so an
  unattended cavity is in the same range as playing. The intended brake is that the
  throne now stands at a landmark, so a cavity farm is contested — the king eats
  buildings within 150 µm of itself. **That brake has been reasoned about and
  not measured.** It is the first thing to probe: play an aeon with a cavity
  farm and count what survives. If it is not contested enough, the honest lever
  is the king's appetite or its reach, not a cap on the farm.
- **Tools and armour.** `Cell.ability` (thrust / weave / anchor) exists and is
  barely used — `world.ts:143` (`anchor` sets `s.anchored`) is the only place it
  changes anything, and `drifter.ts` otherwise only tints a cell by it. The chip now gives
  `anchor` an obvious job it did not have before (hold station in a jet; the lee
  and the jet differ by 363 µm/s and nothing exploits that yet) and `thrust` an
  obvious place to matter. The 432 is literally armour: order 24, zero
  piezoelectric components, "the field cannot touch it".
- **Levels and rewards.** Still the thinnest part. Every world sets the same
  kind of objective at a different frequency, and freeing a bound field grants
  +1 integrity and 80 score. The chip gives a new handle that did not exist
  before: an aeon could ask for something *at a named place* rather than at a
  frequency, and the place is one the player has learned.
- **Beauty.** Explicitly asked for — *"distractingly beautiful as well as being
  shaped by its functions"* — and deferred twice now. The strongest thing to
  build on is still that everything drawn already *is* the physics. The chip
  session added two things worth looking at that nobody has looked at yet: 636
  motifs instead of 30, and four cavities visibly hoarding them.
- **Nobody has played any of this.** Three commits of mechanics went in on
  measurements and headless bots alone. The bot proves the cycle closes and that
  at least one reign happens at a landmark; it cannot tell you whether walking
  two millimetres to a fight is *good*. **Ask for a `drifter.report()` before
  building anything further on top of it.**

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
