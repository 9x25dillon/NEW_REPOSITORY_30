# Handoff

Written at the end of the session of 2026-08-31 and extended 2026-09-02, for
whoever picks this up next.
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
branch   main   (pushed to origin/main 2026-09-02; the repo is PRIVATE, which is what
                config/subject.ts assumes — check before that ever changes)
tests    274, all passing
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
| `game/chip.ts` | what is etched into the glass — sharp edges, bubble cavities — and the streaming that comes off it. The only thing in the game older than the current world |
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

If the user reports a problem in prose, **ask for a report before building
anything.**

---

## Open, known, not fixed

1. **The controller does not deliver input on the user's machine.** The browser
   sees it (`mapping="standard"`, 4 axes, 17 buttons) and `getGamepads()` returns
   nothing but zeroes. The page now says `CLICK THE GAME - A PAGE WITHOUT FOCUS
   GETS NO PAD INPUT` when unfocused, and logs `[pad] first input received` when
   anything arrives. Neither has been confirmed on their machine. **Leading
   hypothesis: a Flatpak/Snap browser sandbox**, which needs explicit `/dev/input`
   permission — and which would *also* explain a `file://` link to
   `/home/kill/...` appearing broken. One cause, both symptoms. Worth testing
   before writing any more controller code.
2. **Mouse and keyboard are the supported path.** Point to steer (the offset
   grows over ~130 µm), left button grips, right bursts, WASD overrides.
3. `personal/` and the bench app have not been touched this session.

---

## Where to go next

The user's stated direction, in their words: *"a new dimension of space and
movement that gives way to the creation of things like the water bear"*, then
appendages, tools, armour, and an open world. Most of that now exists. What does
not:

- ~~**Somewhere to walk to.**~~ Done 2026-09-02: `game/chip.ts`. Eight sharp
  edges and four bubble cavities are etched into the channel, they are the same
  in every aeon, and they come into reach as the organism grows — you feel the
  first current at about eight joined cells, touch a tip at about thirteen, and
  have the whole chip at twenty-five. **What is still thin is what you DO with
  them.** Right now they are terrain: you can ride the wall lanes and a cavity
  gathers motifs for you. Nothing yet is built there, nothing is won there, and
  the throne is still always in the middle.
- **Tools and armour.** `Cell.ability` (thrust / weave / anchor) exists and is
  barely used. The 432 is literally armour: order 24, zero piezoelectric
  components, "the field cannot touch it". The chip gives `anchor` an obvious
  job it did not have before — something that holds station in a jet — and
  `thrust` an obvious place to matter.
- **Something to build on the chip.** The strongest unclaimed idea: a structure
  placed inside a cavity's vortex is standing in water that gathers, and one
  placed behind a sharp edge is in its lee. Both are already true of the flow
  field and neither is used. This is the cheapest route to the next real
  decision, because the geometry already argues for it.
- **Levels and rewards.** Every world sets the same kind of objective at a
  different frequency. Freeing a bound field grants +1 integrity and 80 score,
  which is thin.
- **Beauty.** Explicitly asked for — *"distractingly beautiful as well as being
  shaped by its functions"* — and deferred once. The strongest thing to build on
  is that everything drawn already *is* the physics.

---

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
