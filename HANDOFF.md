# Handoff

**2026-09-22 battle pass:** see [Battle pass](docs/BATTLE.md). `game/combat.ts`
owns the riposte (burst into a volley arm to throw it back) and each king
form's telegraphed gambit (charge, shock, echo) from the second world on.
`game/allies.ts` makes the active companion a body that holds hunters, plus
its R3 call. `game/evolution.ts` deals three trait cards at every birth.
Mitochondria now mend integrity in a lull. The numbers were set from headless
measurements against the aeon-6 report's king, recorded in that file. None of
this touches `src/`.

**2026-09-21 gameplay extension:** see [Living worlds](docs/LIVING_WORLDS.md)
for the user's requested mitochondria, useful limb tips, visual variety and
tameable bosses. `game/ecology.ts` owns companion/limb support and
`game/organelles.ts` owns energy reserves. Boss death is now one route forward;
bonding with a weakened living boss is the other. Mitochondrion hosts become
utility structures and are excluded from automatic discharge and gun estimates.
The farming aura rejected below has not been reintroduced. X places on release
so holding it can grow an organelle; Y in combat offers a bond. These additions
supersede the older statements below that limbs have no reward and every
sovereign must die. Gameplay adaptations stay out of the instrument library.

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
branch   main   (pushed to origin/main 2026-09-02, through eleven play reports,
                an aeon-6 run and a killed 432; the repo is PRIVATE, which is what
                config/subject.ts assumes — check before that ever changes)
tests    311, all passing  (was written as 305 while it was 306; counted
         from the runner on 2026-09-07)
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
| `game/beasts.ts` | six creatures, with physical contrast and telegraphed hunting, circling and ambush behaviours |
| `game/lattice.ts` | the 11 chiral cells, the recipes, `optionsFor()` |
| `game/shape.ts` | what a point group looks like from above — firing arcs and king volleys, which stand on nothing and keep the full orbit |
| `game/world.ts` | worlds, sovereigns, what is born from a body |
| `game/bound.ts` | the other field: a mode trapped in a band gap. `workableSpacing()` inverts the objective into microns |
| `game/body.ts` | the lattice, what is joined to what, its space group, limbs, legs, gait — and `seatedGroup`/`growable`, the part of a cell's symmetry a square net will carry, which is what decides growth and walking |
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
   group has — AND THE LATTICE GETS A SAY IN TWO OF THE THREE.** Growth and
   walking put a cell on a SITE, so they go through `body.growable()`, which is
   the group the square trap lattice will actually seat. Firing does not stand
   on anything, so it keeps the cell's full orbit and goes through
   `shape.lobes()`. A 622 fires six arms and grows two.
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
20. **The SURFACE is subject to every rule above, and was the last to learn it.**
   `drawBodies` compared every cell to every other cell and allocated a Path2D
   per segment, `drawStructures` was not culled at all and built a radial
   gradient per lobe, and `limbsOf` ran twice per body per frame. That is the
   same O(n^2)-written-for-a-dozen shape as `mergePass`, the structure lookups
   and `limbsOf` itself — **four times in the simulation and three more in the
   renderer.** If you add a loop over bodies, cells, structures or entities in
   `app/`, cull it to the camera and grid it, or it will be found by a player
   with three hundred buildings rather than by you.
21. **`retuneChannel` must `reshape`.** It moves every structure between planes
   IN PLACE. That changes what is joined to what — `joined` refuses a step of
   more than one layer — so bodies, limbs and `c.serves` all have to be rebuilt.
   For a long time they were not, and `underStructure` and `drift` both test
   `serves`: a building went on holding the plane it used to be on until the
   next place or lift, 19 to 26 times a run.
22. **A square net will not seat a three- or six-fold axis.** The trap lattice
   is square because `wave.ts` crosses two orthogonal SSAWs and a separable
   potential U(x,y) = U_x(x) + U_y(y) has a square grid of nodes. It is the
   device: there is no third wave and no way to tilt it. So a crystal's point
   group is the part of the cell's symmetry that also leaves the LATTICE where
   it was — `seatedGroup` computes it from `src/symmetry.ts`'s matrices — and
   the answer is always one of five: 1, 2, 222, 4, 422. This is the
   crystallographic restriction theorem, which the game already spent on motifs
   (a pentamer joins nothing, ever), applied one level up to a BODY. The rule it
   buys is true and the opposite of what a player assumes: **a 622 seats as a
   222 and grows two arms; a plain 4 keeps all four.** Order stops being the
   only axis of worth, and the tetragonal cells finally have a job.
23. **`mergePass` is a grid of exactly `BIND_RADIUS`.** That pitch is what makes
   the nine-square lookup complete — every possible partner is in it and nothing
   else can be. If you change `BIND_RADIUS`, the grid follows it automatically;
   if you change the grid's pitch independently, motes stop finding each other
   across square boundaries and nothing will look wrong.
24. **A REFUSAL IS ABOUT THE PAIR, NOT THE NEIGHBOURHOOD.** `mergePass` takes
   the nearest partner inside `BIND_RADIUS`, and when that one will not join it
   looks at the rest of the same nine squares before calling it a refusal. It
   used to give up for the frame — which quietly turned "a pentamer joins
   nothing, ever", which is true and is the crystallographic restriction
   theorem, into "a pentamer standing one micron nearer stops everything else
   joining too", which is in no rule and which nobody wrote down. **The
   shadowing is real: 2.9 per cent of binding opportunities in the first water
   and 8 per cent from the third on, three seeds at a settled pool of 848, with
   a quarter of every refusal holding a partner in reach that was never asked.**
   **And it is worth no cells.** A/B over four seeds and three waters, 240 s
   each: 1106 -> 1096, 826 -> 829, 1178 -> 1183. That is noise, and it is
   written down so nobody spends a session expecting this to be the thing that
   makes a late water gather — a merge also needs `BIND_DWELL` of continuous
   partnership under a hand or a building, and most of what was shadowed was
   never going to survive that. It is kept because the code was saying
   something the rules do not, and because it costs nothing: it runs only on a
   refusal and allocates nothing (rule 14), and frame time was 1.104 -> 1.078 ms
   at the sixfold water.
25. **EVERY BENEFIT OF FEEDING THE THRONE IS CLAMPED. THE HEALTH IS NOT.**
   `worldFrom` pins the sound speed at mass 45, the lattice pitch at 42, the
   suspension at 42 and the depth mode at 42; `cadence` pins at 43,
   `inheritanceOf` at 30, `poolFor`'s axis at 26 and `wildlifeFor`'s at 10.
   `maxHp` is `30 + mass * 10` and has no clamp at all. So **a sixfold throne
   has bought everything there is to buy by its FOURTH helping**, and every
   helping after that is a straight exchange of hit points for nothing — which
   looks exactly like progress, because the one benefit the throne ever showed
   was a percentage that had already stopped moving. `nextHelpingBuys` asks the
   world's own functions what would actually change rather than restating those
   ceilings, so it moves when one of them is retuned instead of going stale.
   **Do not buy a new benefit by lifting a clamp without asking what the clamp
   was for:** the two on the medium are the regime `src/` is honest inside, and
   `MAX_MODE` is where the node planes get closer than the bodies standing on
   them.

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

Nine reports, and between them they found more real defects than a day of
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
- **"It starts to lag when the screen is full."** Three uncmiled render loops at
  353 buildings, none of which the simulation's own performance work had
  touched, because nobody had looked at `app/` with the same eye.
- **The controller, over USB.** Closed at last, and not by any of the four
  commits of browser code written for it. See *Open, known, not fixed*.
- **Fifty helpings, ninety-eight landed discharges, and a king on 70 per cent.**
  Every benefit of feeding is clamped and the health is not, so the throne had
  been sated forty-six helpings earlier and nothing had ever said so. Rule 25,
  and the answered item below.
- **A `wearing` count read as though it were a duration.** The diagnosis tested
  `wearing < 6` for "they never used the hand"; `wearing` is a tick at
  `WEAR_TICKS_PER_SECOND`, so the threshold meant "less than one second". Two
  of the three reports came in at 10 and 8 ticks — a second and a third of
  grip, out of five and twenty-three minutes — and both were scored as knowing
  about the hand and routed past the advice.
- **Every pasted report accused its author of not clicking the game.**
  `pad.describe()` asked about focus FIRST, and `report()` is only ever reached
  by typing into the browser console, which is exactly when the page has no
  focus. All three reports carried the line, from a player using the pad. A pad
  that has ever delivered input has answered the focus question by
  demonstration; the line says what it IS now, and marks the axes stale.
- **`doFeed`'s message had never been on screen either.** Found while fixing
  the first one. `act()` runs before `step()` and `drain()`, so the toast
  `doFeed` wrote — `FED n · 622 · 5 DISCHARGES TO KILL`, the one actionable
  number at the moment of the decision — was overwritten by `drain`'s
  `THE THRONE TAKES 622` in the same frame, every time. The same shape as the
  `aim` lesson above, in a different mechanism. **A toast written before
  `drain` is a toast that was never shown**, and everything the feed says lives
  in the `fed` event handler now.

### What is still open

- ~~**The king could not be killed.**~~ MEASURED AND ANSWERED 2026-09-05, from a
  play report: 330 s, aeon 1, three discharges, **all three landed**
  (`sovereign-hit 3`), king finished on 251 of 510, player dead. Their words:
  "it wouldnt die".

  It dies. A bot that cannot be killed kills it every seed in 97-129 s on 7-8
  discharges, and a mortal bot that dodges the telegraph got it to 38, 40 and
  126 of 510 before dying. What was wrong was the only number the game had ever
  shown them. **`dischargesToKill` quoted the MUZZLE**, and defended it in a
  comment as "the one you can achieve" — but the muzzle lies inside
  `DEVOUR_REACH`, so collecting it means standing the building inside the radius
  the king eats buildings from. It was quoting a price payable only by losing
  the gun. It counts at the edge of safety now: **the player was told 3 for a
  full bar that needed 5**, and told 2 at the end when the true answer was 3.

  Two things worth keeping from the measurement:

  - **Every death is a volley.** Nine bot runs, every configuration, 100 per
    cent `hit:volley` — no beast, no contact. The report agrees (4 volley, 2
    struck). The open item below is now answered: the volley IS the fight.
  - **The obvious knobs are not the lever, and the sweep says so.** Capping
    `chargeTime` under the cadence floor made it WORSE (king finished on
    147/95/246 against a baseline of 38/40/126); raising the cadence floor
    1.15 -> 1.9 s did nothing (47/108/243). The bot takes exactly six volleys
    and dies whatever the rates are. Do not rebalance those two on a hunch —
    they have been tried.

  Still unspent, and the biggest thing the report shows: **the player never used
  the hand.** `wearing` fired twice in 330 s, which is a third of a second, and
  a bare hand takes `2 * freedom` hp/s off a king — for the 23 they crowned that
  is 2 hp/s, so there was more health in the hand they never closed than in the
  whole king. About a third of the bot's kill was wear. The diagnosis line says
  so now.

  **AND IT STILL DID NOT REACH THEM, for a reason that was in the gate rather
  than in the advice.** The three reports of 2026-09-06 read `wearing` 10, 9 and
  8 — a second and a half of contact each, across 5, 11 and 23 minutes — and the
  gate was `n("wearing") < 6`. `wearing` is a tick at `WEAR_TICKS_PER_SECOND`,
  so that threshold was asking "did you hold it for less than one second", and
  a player who brushed it twice passed. Both runs were routed into the
  discharge advice instead. The gate is now what the hand actually took off the
  bar — `ticks / WEAR_TICKS_PER_SECOND * wearRate` against a tenth of `maxHp` —
  which is the figure that means something. **A threshold on an event count is
  a threshold on a sample rate; say which in the name.**

- **Feeding a 23 is worse than it looks, and nothing says so.** Its freedom is
  1, so the hand does 2 hp/s against it — the second-worst handle in the game,
  with only 432 (no handle at all) below it. It also throws four arms, and mass
  48 puts the volley at the 1.15 s floor. The `anchored` lesson warns about 432.
  Nothing warns about this.

- **Volleys are still most of what lands.** Latest reports: `hit:struck` 1 to 4
  against `hit:volley` 6 to 16. With a pad the player dodges beasts almost
  perfectly and the king's arms are nearly the only thing reaching them. Whether
  that is the right shape for the fight is unmeasured.
- ~~**Feeding is now a real decision and nobody has explored the top of it.**~~
  MEASURED AND ANSWERED 2026-09-06, from a play report, and the answer is
  short: **the top of it is the fourth helping.** See rule 25.

  The report: 1369 s, aeon 6, a sixfold throne fed **fifty** helpings for mass
  582 and 5850 hit points, **one hundred discharges of which 98 landed**, the
  king finished on 4113, the player dead. Nothing they did in that fight was
  wrong — they dodged 407 volleys out of 421. Read back through `throneLedger`:
  **4 of those 50 helpings bought anything. The other 46 bought 5340 hit points
  and nothing else.** A throne stopped where it was sated would have woken 510.

  Three things worth keeping:

  - **The trap is that overfeeding looks like progress.** The panel showed the
    cost honestly — hit points, discharges to kill — and exactly one benefit,
    `NEXT WORLD KEEPS 60%`, which is a clamped number that reads the same on
    both sides of its clamp. Nothing on screen ever changed when feeding
    stopped being worth anything.
  - **It was not the fight.** `dischargesToKill` was right, the falloff was
    right, and the diagnosis answered that run with a tip about where to stand.
    The run was decided at the throne, four helpings in.
  - **The same three reports carry the control.** The aeon-1 throne was fed
    seven helpings of which SIX bought something. That player was not
    overfeeding, and the new diagnosis line is gated so it does not accuse them
    of it — see the gate, which is "you have already landed enough damage to
    have killed the throne you would have woken by stopping".

  Still unmeasured: feeding past the ceiling does buy SCORE, since birth pays
  `40 + mass * 8`, so it is a gamble rather than a strict mistake. Nobody has
  played it as one and nothing on screen frames it that way.
- **Limbs now DEPEND on something, and still BUY nothing.** Half of this closed
  2026-09-05 and the half that is left is the more interesting one.

  What closed: which limbs a body can grow was never the player's choice and
  never the group's either — it was an accident of the lattice. A chain toward a
  60-degree lobe has to zigzag, every corner of a zigzag is diagonally adjacent
  to the cell two back, `joined` counts that, so the tip came out degree-2 and
  `computeLimbs` never saw it. Measured across all eleven groups, the arms a
  body could actually grow were exactly the lobes lying on the square net's own
  directions — which is the seated group's. It says so on purpose now
  (`growable`), and building a 622 body versus a 422 body is a real decision:
  the same fifteen cells make a two-limbed creature or a four-limbed one.

  **The reward already exists, and it was never visible.** This was measured on
  2026-09-05 at a bubble cavity, same 23 cells built two ways, 7 seeds, 180 s,
  hands off, and it is the most useful number in this file:

  | trunk standoff | slab | arm |
  | --- | --- | --- |
  | 200 um — the trunk itself reaches the core | **58.4** merges / 16.9 cells | 48.4 / 13.3 |
  | 340 um — only the arm reaches | 49.9 / 14.0 | **55.1 / 15.1** |

  That is a real rule and a good one: **stand on the landmark if you can, and
  grow an arm to it when you cannot.** It has been in the game since the chip
  session and nothing has ever told the player, which is why reports show limbs
  with no consequence — the consequence was there and unlabelled. It is also
  WEAK: 5 of 7 seeds each way, with overlapping spreads. Strengthening it is a
  live option; a cavity that concentrates harder would do it.

  **AN AURA WAS BUILT FOR THIS AND THE MEASUREMENT THREW IT OUT. Do not build it
  again.** The idea was the obvious one — `aura()` has claimed since it was
  written to measure "how far its hold reaches beyond its own cells" and is read
  by nothing — so limb cells were given a longer pull, over the aura, in the
  annulus beyond the ordinary grab. It lost every single configuration:

  | | slab | arm, no aura | arm, with aura |
  | --- | --- | --- | --- |
  | 200 um | 58.4 | 48.4 | **39.9** |
  | 340 um | 49.9 | 55.1 | **38.4** |

  It cost the arm nearly two thirds of its cells at 340 um (15.1 -> 5.9). The
  reason is worth keeping because it rules out a whole family of ideas: **a
  merge needs two motifs within BIND_RADIUS OF EACH OTHER**, so what makes a
  farm is CONCENTRATION, and a long-range pull toward many scattered arm
  hold-points is the opposite of concentrating. More water at lower density
  makes fewer cells. Any reward of the form "an arm gathers over a wider area"
  is fighting the merge rule and will lose to a slab.

  So an arm should not be paid in farming at all — farming rewards being
  compact, for sound reasons already in the code. What is still unspent:
  `Cell.ability` is dropped by `structureFrom` the moment a cell becomes a
  building, so thrust / weave / anchor survive only into the throne;
  `Cell.blurb` says "shown in the inventory" and is shown nowhere; and `aura()`
  itself is still dead, with a comment that disagrees with its body (it returns
  `extent + ...`, a radius from the CENTRE, which is not "beyond its own
  cells").
- **P432 has been crowned and killed** — order 24, no drivable piezoelectric
  component, `wearing` nearly useless against it, only buildings can reach it.
  It works. Whether it is *good* has not been thought about.
- **Beauty is one pass deep.** The field draws its sign, the water has a
  temperature you can see, the co-flow interfaces refract and there is a bloom.
  Untouched: the depth planes, the chip reading as etched glass, and the motifs
  themselves — six hundred of them now glow in cavity cores and nobody has
  looked at whether that is the best thing on screen.
- **If lag returns**, the two remaining candidates are the bloom's full-canvas
  blur (`BLOOM_REST` / `BLOOM_DRIVE`, one place) and `drawTrails`, which issues
  eight separate strokes per visible motif.

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
- **A test that cannot fail is a comment with a longer runtime — and you only
  find out by planting the bug.** A test written this session retuned the
  channel 3 -> 1, which collapses every plane onto zero; nothing moved, the
  assertion held trivially, and putting the bug back did not fail it. It was
  caught because planting the violation is the routine, not because it looked
  wrong. Do it every time, on every new test.
- **Two constants that constrain each other need a test that names both.** The
  discharge falloff and `DEVOUR_REACH` were each defensible alone and together
  they made good damage and a surviving building mutually exclusive. Nothing
  catches that except an assertion that mentions the pair.
- **The surface has two clocks and one of them wins.** `act()` runs on the
  input, `drain()` runs on the events, and `act` is first — so anything `act`
  writes into a slot the event handler also writes is dead on arrival. This has
  now happened twice, to the `aim` lesson through `teach()` and to the feed
  toast through `say()`, and both times the symptom was that a message nobody
  had ever seen looked correct in the source. If you write to `this.say`,
  `this.card` or any other single-slot channel from `act`, check whether the
  event for the same action writes there too.
- **When you make something bigger, ask what the change breaks that was fine
  before.** Raising the population 13× made an O(n²) merge pass matter and made
  an unculled renderer matter. Moving the throne two millimetres away made a
  documented player failure — a throne that was never visited — worse. Each of
  those is a second job created by the first one, and each was cheap when caught
  in the same commit.
