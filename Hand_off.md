# Next-session handoff — 2026-09-27

Read this first. It supersedes the previous dated entry point; prior versions
remain in git history. Preserve the standing rules in `HANDOFF.md` and the battle
rules in `docs/BATTLE.md`. When prose and code disagree, investigate the code and
update the stale claim rather than silently trusting either.

## Read only what the task needs

1. `SESSION-2026-09-27.md`: decisions, open assumptions, process review and prompt examples.
2. `docs/RESONANT_EXPEDITION.md`: game mechanics, controls, data boundary and limits.
3. `docs/RESONARIUM_EMERGENCE.md`: simulation, anchoring, replay and validation.
4. `HANDOFF.md`, especially numbered architecture/design rules before game edits.
5. `docs/BATTLE.md` and `docs/LIVING_WORLDS.md` for existing combat and world behavior.

## User context and intent

The user wants a usable system and plays on an Xbox Elite Series 2. They asked
for the actual Resonarium from `/home/kill/astro-aae`, usable natal/chart anchoring,
and integration into Sonic Drifter with survival crafting, geometry, stages and
enemies. Those explicit requests authorized the new mode despite older handoff
advice to defer additional systems. They subsequently authorized commit, push
and merge. That is authorization for this delivery, not every future publication.

Treat new messages as steering or additions unless clearly replacing the task.
Act on routine reversible work; avoid repeated permission questions. Explain any
real environment approval requirement. Open the usable result when asked, and
verify the input path the user will actually follow.

## Where the implementation lives

- `app/resonarium/index.html`: integrated real Resonarium UI. Its `natal_seed.js`
  comes from the sibling source; attribution/license in `docs/resonarium/`.
- `app/resonarium/photometabolic.js`: portable seed/model, experiment validation,
  legacy tonal-state parsing, replay, surrogate comparison and projection.
- `photometabolic_biosentinel_v3_unified.py`: Python reference/CLI, exact pulse
  timing, physical units, portable RNG, seeded AAFT, audio/JSON exports.
- `game/resonance.ts`: seed/trajectory import boundary, lightweight oscillator,
  encounter stages, blueprints, charge/ward/loom economy.
- `game/run.ts`, `game/beasts.ts`: integration with existing movement, combat,
  birth, destruction and wildlife. Instrument library `src/` was not modified.
- `app/drifter.ts`, `app/pad.ts`, `app/build-drifter.mjs`: UI, forge/controller,
  import/launch controls and generated standalone game pages.

## Open and use

Open `app/resonarium/index.html`. Demo chart or pasted/imported legacy
`resonarium.state.v2` can be anchored with **Anchor chart or tones**. Legacy seeds
are supplied identifiers, not recomputed hashes. New derived seeds use BLAKE2b
with digest_size=8, unsigned big-endian. Preserve uint64 as decimal strings;
accept numeric seeds only when safe integers. An experiment export adds K/R/ψ
observations; a tonal export alone supplies the game's seed.

Open `app/sonic-drifter.html`, choose **Import Resonarium JSON**, then **Start
Resonant Expedition**. V/L3 opens the forge; Q/B/D-pad or 1–4 selects; C/Y rotates;
Enter/Space/X/A assembles; V/L3/LB/Escape closes. Forge pauses the simulation.
Starter materials are explicit; ordinary title-screen start remains normal mode.

The user's local raw JSON is `resonarium-state-a52ef6dcd1e7fe2c.json`. It is not
part of the publication set: do not stage it by accident. Their ignored private
launch page is `artifacts/resonarium/your-chart.html`; it prefills their tones and
anchors on entry. Recreate/update that generated page if needed after changing
Resonarium; it is a copy, not the canonical source. Do not publish personal chart
payloads unless explicitly asked. Source sibling repo was not edited.

## Invariants and traps

- Bedrock → optional overlay → observable trajectory → projection; overlay OFF
  must preserve bedrock. A visual pattern is not a biological measurement.
- Fluence J/cm² = intensity mW/cm² × duration ms / 1,000,000. Do not reintroduce
  the original factor-of-1000 mistake or floor away pulse residual time.
- Keep phase circular; unwrap for audio interpolation. Never swap a hash
  algorithm while claiming identical seeds. Preserve algorithm/version provenance.
- The game folds uint64 to uint32 and uses a separate 24-oscillator driver unless
  observations are imported. Do not claim full experiment parity for that model.
- Player movement remains field-driven. Damage remains telegraphed. Check held
  before enemy special behavior; all king wounds go through `hurtSovereign`.
- Never gate the throne. Stage completion rewards progression at the next birth.
- Crafting uses actual snapped sites and seated symmetry. A square net seats 622
  as 222. Wards require seated 4/422; looms copy seated host group.
- Charge/transfer have shared budgets. Invalid placement spends nothing. Broken
  constructions lose benefits; mixed-plane assemblies are inactive. Utility
  structures stay excluded from ordinary gun discharge and damage estimates.
- Use `retune`/`reshape` when construction topology/planes change. Existing
  module cycles may call imported run functions only inside functions, never at
  module initialization. Preserve culling and avoid entity×structure hot loops.
- Legacy combat rules still apply: prey centralizes lure targeting; prime rewards
  sit beyond the mass ceiling; throneLedger counts rather than indexes; gambit
  rendering uses windLength. See the prior handoff in history for rationale.
- Generated HTML is a build artifact. Edit TypeScript/build template, then rebuild
  both pages. Serve changing builds with Cache-Control: no-store if using HTTP.

## Verified baseline and commands

At delivery: 404 TypeScript tests pass, six Python tests pass, typecheck/build
pass. Browser tests cover Resonarium import/replay/audio/OFF and game interaction
fixtures (14 upgrade + 22 battle + 14 expedition checks). These establish working
mechanics, not long-session balance or physiological validity.

```sh
npm test
npm run typecheck
npm run build
npm run test:biosentinel
node app/build-drifter.mjs --body
PLAYWRIGHT_MODULE=/home/kill/astro-aae/frontend/node_modules/playwright/index.mjs CHROMIUM_PATH=/usr/bin/chromium node test/resonarium.browser.mjs
PLAYWRIGHT_MODULE=/home/kill/astro-aae/frontend/node_modules/playwright/index.mjs CHROMIUM_PATH=/usr/bin/chromium node test/drifter-resonance.browser.mjs
```

The Playwright path is this machine's existing installation; discover a local
installation if it moves. Full npm tests take about 2–3 minutes. Restricted
sandboxes may require escalation for test-runner IPC, Chromium, git metadata
writes/network and xdg-open. Do not bypass approval controls.

Search registry users/count assertions when adding a species. The prior eight-
species assertion was updated to eleven with new contrast-sign coverage. Reset
camera/scene explicitly in visual fixtures; previous interaction fixtures can
leave off-center screenshot state. Run targeted checks first, then the full suite
for run-loop/combat changes. Repeat broad checks only for a new change or concern.

## Next useful work

1. Get one real expedition report via `drifter.report()` and ask whether importing,
   forge discovery, charging and stage progression were understandable. Check
   late-run performance and whether wards/looms justify their costs. Do not tune
   economy on automated checks alone.
2. Prioritize versioned cross-session saves if requested: runs and selected input
   currently disappear on reload. Define restore/migration and replay guarantees
   before implementing persistence.
3. Revisit statistical diagnostics if scientific comparisons are the goal: binary
   ties and spectral deviations need measurement; empirical p-values do not prove
   biological structure, and non-rejection is not proof of absence.
4. Preserve existing unresolved play questions: riposte value, gambit readability,
   lure discovery, companion pressure and long-run progression. New content does
   not resolve those by itself.

## Git delivery

Remote: `origin`, `9x25dillon/NEW_REPOSITORY_30`; integration target `main`.
This session uses a feature branch and merge commit for a visible integration
record. Inspect `git log`, `git status` and the remote before continuing; do not
infer successful publication solely from this document. User-owned raw tonal
JSON intentionally remains local and untracked. Never use blanket git add on it.
