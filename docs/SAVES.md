# Sonic Drifter — saved runs

Runs last twenty to fifty minutes. Until this change a reload threw one away:
the run lived in page memory and nowhere else. Now a run is kept in the browser
while you play, picked up again on the title screen, and can be exported to a
file and imported back.

## The contract

`game/save.ts` is pure: no DOM, no clock, no storage. The tests in
`test/save.test.ts` hold it to four promises.

1. **A restored run has the same future as the original.** If you run
   `restore(snapshot(run))` and the original for N frames with the same input,
   they reach the same state and emit the same events in the same order. That
   holds on the same build. The random stream is part of the state
   (`Rng.state` in `game/wave.ts`), so a restored run draws the same numbers the
   original would have. The test forks a lived-in run (walking organism,
   mitochondrion, crowned king, fifteen seconds of fight) and compares both
   branches after another fifteen seconds, for an ordinary run, an expedition
   and a run saved between worlds.
2. **Anything that cannot be written down is refused at save time, by path.**
   That means a function, a `Set` or a class instance: `run.fray.marks is a
   Set, which a save cannot carry`. A save that silently dropped a field would
   load into a different run, and nothing on screen would show it.
3. **Anything that cannot be trusted is refused at load time.** A save file is
   outside input. Load checks:
   - the schema and version
   - every point group, species and motif the file names
   - every position the renderer will use, which must be finite
   - body-to-structure indices
   - one trial frame on a separate copy, because the only proof that a state
     can be played is to play it.
   Each refusal gives its reason.
4. **Across builds the guarantee is weaker, and the file says so.** A save
   carries the build that wrote it: a content hash of the bundle, injected by
   `app/build-drifter.mjs`. On a different build it loads under that build's
   rules and does not promise the same future. Migrations go one version at a
   time (`MIGRATIONS` in `save.ts`). A file from a newer save version is
   refused rather than guessed at.

## What JSON gets wrong, and how the codec handles it

| Value | Where in a run | Plain JSON gives | Codec |
| --- | --- | --- | --- |
| `-Infinity` | `fray.lastHit` and `fray.turned` ("never") | `null`, which reads as time zero | `{"$n":"-Infinity"}` |
| `Map` | `bond.limbReadyAt` | `{}` with no `.get` | `{"$map":[[k,v],…]}` |
| `-0` | any drift velocity | `0` (`atan2(0,-0)` is π) | `{"$n":"-0"}` |
| `NaN` | never, legitimately | `null` | carried, so the load checks can find it |

No plain object in a run may have a key that begins with `$`. The codec checks
this, so its tags cannot collide with data.

Four `Run` fields are written differently:

- **`rand`** is saved as its uint32 state.
- **`events`** are not saved. They belong to the current frame and the surface
  has already drained them.
- **`bodies`** are saved as indices into `structures`. A body's cells are the
  same objects as the buildings, which is how a walking body moves them. Saved
  as copies, a restored body would walk away and leave its buildings behind.
- **`cells`** are saved as point-group symbols and rebuilt with `cellFor`.

## Shared objects

A save writes each route to an object as its own copy, so two routes to one
object come back as two objects. That is harmless for a value nobody mutates in
place, and a silent fork for anything else. The test *everything a run shares
between two places is something a save knows about* walks a live run and lists
every object reached twice. The only allowed ones are `structures[*].serves`
(one array per body, reassigned whole) and `structures[*].lobes` (the shape
cache). **If you add a field to `Run` and that test fails, it names the path.**
Either stop sharing the object, or teach `save.ts` to write it by reference,
the way `bodies` is written.

## On the page

| When | What happens |
| --- | --- |
| You pause, a king dies (birth), you enter a new world, the tab is hidden or closed, and every 60 s of unpaused play | the run is saved to `localStorage["sonic-drifter.run"]` |
| The title screen, with a saved run | **START / Space / click** goes on with it, paused. **Hold Y / C for 1.5 s** abandons it and begins again |
| You die | the save is cleared (a save would only bring back a death). Best score and deepest aeon are kept in `sonic-drifter.profile` |
| **Export run** (page button) or `drifter.exportRun()` | downloads the current run, including a dead one, or the stored run from the title |
| **Import run** (page button) | from the title or death screen, never over a stored run. A dead run opens as its death screen, and `drifter.report()` works on it |

Only one run is kept. A second slot would let you keep a run you are losing and
start another, and the title screen deliberately has no such escape hatch.
Starting a Resonant Expedition is refused while a saved run is waiting, for the
same reason.

The pause screen shows when the run was last saved, or in red why it was not.
The `save:` line in `drifter.report()` gives the same information plus the
build.

## Why a save file matters for development

A `drifter.report()` says what happened. A save file is the state itself, and
it loads headless:

```ts
import { readFileSync } from "node:fs";
import { restore } from "./game/save.js";
const { run } = restore(readFileSync("sonic-drifter-aeon6-18m22s.json", "utf8"));
// run is the player's run, on the frame they saved it. Probe it.
```

When someone reports a problem, ask for the report and the exported run.

## Measured

| State | Save size | `snapshot` + `serialise` | `restore` (with trial frame) |
| --- | --- | --- | --- |
| whole channel open, full suspension, no buildings | 0.45 M chars | 14.5 ms | 32 ms |
| … 100 buildings, 300-cell rack | 0.48 M | 11.8 ms | 23 ms |
| … 400 buildings, 300-cell rack | 0.55 M | 7.6 ms | 20 ms |
| two seconds into a first world | 0.02 M | — | — |

These are Node timings on the build container. Browsers allow about 5 M
characters of `localStorage` per origin, so the largest report on file
fits about nine times over. The test *a late run fits in browser storage*
asserts less than 2.5 M.

Every bug the tests exist to catch was planted and caught:

| Planted bug | Caught by |
| --- | --- |
| bodies restored as copies | both determinism tests, and the identity test |
| the random stream restarted | both determinism tests, and the between-worlds test |
| `-Infinity` written as `null` | *what JSON cannot say* only |
| `Map` written empty | *what JSON cannot say* only |

The last two are not caught by a fifteen-second determinism window, which is
why they have their own test.

The alias audit found one shared object nobody had written down:
`crystal.matrix` is `world.medium`. It is harmless, because a medium is never
written into, and it is now on the allowed list with that reason.

Not measured: the frame time of a save in a phone's browser. Saves happen at
pauses, births, tab changes and once a minute. If a report shows a hitch every
minute, the periodic save is the first suspect (`AUTOSAVE_EVERY` in
`app/drifter.ts`).
