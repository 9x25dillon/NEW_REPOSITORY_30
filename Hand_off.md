# Next-session handoff — 2026-09-22 (battle pass), over 2026-09-21

Start here. This file is current session context; `HANDOFF.md` is the older
standing architecture and design record. The previous version of this file is
preserved verbatim as `SESSION-2026-09-05.md`, including historical machine
troubleshooting. Do not treat those old machine settings as newly verified.

## 2026-09-22: the battle pass

The user asked for improvements to the 2026-09-21 additions, with battle
mechanics, tools and allies. The work was aimed at the aeon-6 report in
`drifter.report().txt`: all 17 hits were volleys, 22 mitochondria held 1298
energy at death, the rack held 100 cells, no king was ever tamed, and the king
died at 33%. [docs/BATTLE.md](docs/BATTLE.md) is the play guide and the record
of how the numbers were set.

| What | Where | Control |
| --- | --- | --- |
| Riposte: a burst into a volley arm (±60°) catches it and throws it home. One per burst, swept over the frame | `game/combat.ts` | A |
| Gambits from aeon 2, at most one per 7 s: Strider charge lane (36 µm core), Warden shock ring (220 µm past its edge), Weaver echo volley | `game/combat.ts`, `reign()` in run.ts | — |
| Companions as bodies that hold hunters (a held hunter cannot strike). Calls: rush / aegis / snare | `game/allies.ts`, Bond fields in ecology.ts | R3 / R |
| Mitochondria mend integrity at full stamina, 3 s after a hit, 40 energy a point | `game/organelles.ts` | — |
| Evolution: three trait cards at every birth; nine traits with rank caps | `game/evolution.ts`, birth screen | B / D-pad / stick, Start |
| Rack window (13 slots, overflow counts, group tally), D-pad ←/→ steps the rack | `app/drifter.ts`, `app/pad.ts` | D-pad |
| **Falter**: the first time a king reaches its bond line it stops for 2.5 s and cannot be taken below 1 hp | `hurtSovereign` in `game/combat.ts` | — |
| **Prime helpings**: a helping landing on a prime count buys +2 points of inheritance past the old ceiling, a card, and score | `isPrime`/`inheritanceOf` in `game/world.ts` | — |
| **Cards cost cells** after the first at each birth (5, 10, 20…), and **REFINE** is the deck's uncapped fallback | `game/evolution.ts` | X takes, Start enters |
| **Lure**: a cell left singing; hunters and the king's drag follow it | `prey`/`dropLure` in `game/run.ts` | LB held |
| **Tender** mends the king, **leech** eats buildings; neither strikes | `tend`/`graze` in `game/run.ts` | — |

Keep these rules:

- **A catch must be head-on.** Sideways catches made dodging deal about 3000
  damage/min.
- **One catch per burst.** Standing on the king otherwise catches whole volleys.
- **Gambits run on a time gap, not every Nth wind-up.** Heavy kings wind up
  every 1.15 s.
- **A charge hits with a capped core.** Huge kings are 142 µm in radius.
- **The riposte catch stays swept.** A burst moves about 32 µm a frame, more
  than the 24 µm reach.
- **The birth footer says the cards are game rules.** Only the world above
  them is computed from the throne.
- **Holding Y ceases fire.** Caught arms are absorbed and thrown arms do no
  harm.
- **The first world has no gambits.**
- **Every source of damage to the king goes through `hurtSovereign`.** The
  falter's floor and the line-crossing must not be true of a discharge and
  false of your hand or a thrown arm.
- **Everything asking what the water is coming for goes through `prey`.** A
  lure some callers believed in would pull a hunter off you and walk a king
  onto you at the same time.
- **`held` comes before the tend/graze dispatch in `hunt`.** A tender that went
  on mending inside your closed hand is the one body outside the rule the whole
  bestiary runs on. There is a test.
- **The prime term is added PAST the mass ceiling, not into it.** Folded in it
  buys nothing, because a sixfold throne is at that ceiling by its fourth
  helping — which is the whole reason the boon exists.
- **`throneLedger` counts, it does not index.** Primes fall wherever they fall,
  so "the helpings that bought something" is no longer a prefix.
- **A leech cannot fasten onto a building you are standing over.** That is the
  idle lattice out-pulling its swim, not a rule anybody wrote; keep the test.

`maxIntegrity(run)` replaces bare `MAX_INTEGRITY` wherever the cap is applied.
`vulnerable(k, tameHealth(run))` and `tameTime(run)` carry EMPATHY.

**Module cycle.** `combat.ts`, `allies.ts`, `evolution.ts` and `organelles.ts`
import functions and constants from `run.ts`, which imports them back. This is
the same cycle `ecology.ts` already had. It is safe only because those imports
are used inside functions. Top-level code in these modules must not read a
`run.ts` binding, or the bundle will see it uninitialised.

Verification this session, all from the runner:

- Baseline was 344/344. After the battle pass, 367/367; after the falter,
  371/371; after the prime/evolution/lure/creature work, **382/382** (about
  137 s). Both typechecks pass. Chromium is at 35 simulated-pad checks.
- The suite caught two real defects in this batch that review had not: a CILIA
  hook asking `beast()` for a motif's species (which broke every bot run), and
  a tender that went on mending while held. Run it before trusting a change
  to `hunt` or `settle`.
- `test/combat.test.ts`: 22 tests. The swept-catch test was mutation-checked:
  it fails against the old point test.
- Chromium: `node test/browser-upgrades.mjs --interactions --battle` gives 29
  checks (the 14 earlier ones plus 15 new) with no exceptions. `--battle-scene`
  wrote staged screenshots of combat, the birth cards, pause and death, and each
  was inspected. Use `SHOT_DIR` for the output folder.
- Headless measurements, with the bot scripts kept outside the repo, are
  summarised in BATTLE.md. They bound behaviour; they are not feel.

**Four play reports, 2026-09-22** (`drifter.report()/`), which is what the
falter came from. Deepest aeon went 6 to 14 and score 18k to 78k. Ripostes were
used and mattered: 57 catches for 1856 damage in the last run, against a king
that lost 1926 net. Gambits hit 8 times in 79. Mitochondria mended 23. But
**no king was tamed in fourteen aeons**, so companions, calls and PACK never
ran once — one discharge crossed the whole bond window. Hence the falter, which
measured 25 of 25 bonds afterwards.

**A fifth report, 2026-09-22 (aeon 29, 1932 s).** The falter worked: 28 kings
faltered, 13 were bonded, all three companions reached rank 3, and landed
hunter strikes fell to one in 32 minutes. It also showed the three things this
batch answers — every trait capped by the nineteenth of 28 births, 140 cells
with nothing to spend them on, and 31 helpings fed deliberately because the
throne was the only thing left to do. **The user said the overfeeding was on
purpose**, so it is rewarded now rather than gated.

Still open, in the order I would take them:

1. **Volleys are 89% of what kills this player** (41 of 46 hits), and catches
   dropped to 12 in that run from 57 in the one before. Ask whether the riposte
   is awkward on the pad or just easy to forget before tuning it.
2. **Runs are 32-50 minutes.** Worth asking whether that is the session length
   wanted before tuning anything else.
3. **Mitochondria mended once** in that run while holding 840 energy, because
   mending wants 3 s without a hit and the player never goes home. A bearing on
   the HUD to the nearest charged station when hurt is the cheap next step.

Not verified: physical Elite 2 feel for R3 and head-on bursts; whether a person
can read the charge lane and shock ring at speed; whether catching is fun or
fiddly at 24 µm; whether companions now make hunters trivial in the late game
(measured about 75% fewer landed strikes on a passive player); and whether
evolution cards change how later worlds feel. A real play report is the next
input. The new `battle:` and `evolution:` report lines exist to answer these.

Git: at the user's request, this session's work and the uncommitted 2026-09-21
work were committed together as one commit, `591e943`. They are interleaved in
the same files and were not split. It was made on a `battle-pass` branch, then
fast-forwarded onto `main` and pushed to `origin/main`, which is private. The
branch was deleted afterwards. Check with `git log --oneline -3` and
`git ls-remote origin refs/heads/main`.

---

# The 2026-09-21 handoff, as it was

## User intent and preferences

The user usually plays SONIC DRIFTER with an **Xbox Elite Series 2**. Their
problem is loss of interest in later levels. They asked for visual improvement,
useful limbs, more enemy/boss/player variety, bosses that can be tamed and used,
and more activities such as building mitochondria.

The important outcome is a richer set of meaningful things to do. An increased
feature count alone does not establish that outcome. Prefer play evidence when
choosing the next improvement. The user welcomes creative implementation and
mid-session steering; they do not need to specify every technical detail.

They explicitly authorized committing, pushing and integrating this session's
work. That authorization concerns this release, not unspecified future work.

## Where the work stands

A first playable “living worlds” pass is implemented. Read
`docs/LIVING_WORLDS.md` for precise mechanics and controls and
`SESSION-2026-09-21.md` for decisions, unresolved assumptions and the retrospective.

- Mitochondria: hold X for 0.85 s beside an owned structure. The selected cell
  and next rack cell are consumed; the preview shows the cost. Storage is 60,
  charge rate 3/s, supply rate at most 14/s across nearby organelles, reach
  85 microns. The host no longer fires automatically. Losing/lifting the host
  loses its organelle; retained hosts keep their organelles across worlds.
- Taming: boss health at or below 30%, within 120 microns, hold Y for 3 s.
  Releasing, leaving range, healing above the threshold or taking damage
  interrupts progress. The damage grace period prevents immediately resuming.
  Holding Y rests the player's weapons; enemies remain active. Bonding creates
  the next world while keeping the sovereign alive as a companion.
- Companions: Strider improves dash recovery; Warden intercepts a nearby bolt
  and recharges; Weaver adds stamina recovery while not gripping. One active
  companion, three forms, rank capped at three. Start pauses; B cycles the
  active companion. This collection persists within the run, not after reload.
- Limbs: polar tips support dash recovery; non-polar piezoelectric tips speed
  bonding by 1.75x; anchor tips block bolts with a 2 s cooldown. Support respects
  the limb's depth planes. No expanded farming aura was added.
- Boss forms cycle Strider/Warden/Weaver by aeon. Feeding still controls group
  symmetry and world inheritance. Ribbons unlock at aeon 3 and Sentinels at 4.
- Creature silhouettes and the player's companion-dependent appearance are
  procedural canvas drawings. Colours still communicate acoustic contrast.
  HUD overlap and viewport fit were corrected; control prompts follow input.

## Code map

| Location | Responsibility |
| --- | --- |
| `game/ecology.ts` | Boss forms, companion collection, bonding predicates, limb roles/support |
| `game/organelles.ts` | Host selection, construction cost, stored energy and transfer |
| `game/run.ts` | Simulation integration, ceasefire, bonding transition, utility-host exclusions |
| `game/beasts.ts`, `game/world.ts` | New hunters and later-world unlocks |
| `app/pad.ts` | `placeDown` alongside the existing one-shot place intent |
| `app/drifter.ts` | Tap/hold actions, visuals, HUD, controls, report fields |
| `app/build-drifter.mjs` | Generates both standalone pages from source |
| `test/ecology.test.ts`, `test/pad.test.ts` | Mechanics and input regression coverage |
| `test/browser-upgrades.mjs` | Chromium CDP interaction checks and optional staged screenshot |
| `test/fixtures/upgrade-inputs.js` | Simulated standard Xbox inputs driving the actual Game update |

The `run.ts`/`ecology.ts` relationship includes a runtime import of latticePitch
back into ecology. It currently works because that function is used after module
initialization. Avoid new eager initialization across that boundary. Refactor
shared geometry only if the next change warrants it.

## Verification already performed

- Baseline: 333 tests passed, about 507 s on this machine.
- Upgraded full suite: 344 tests passed, zero failures, about 427 s.
- Final small cost-selection/presentation refinements: focused ecology and pad
  tests passed; both TypeScript configurations passed; both HTML variants rebuilt.
- Chromium: 14 simulated-controller checks passed, including X tap/hold, exact
  resource use, pause/resume, switching companions, live bonding and entering
  the next world. No rendering exceptions were reported.
- Screenshots were inspected and the HUD corrected. Screenshots use a staged
  scene; do not describe them as a natural late-game playthrough.
- A resource-cost mutation was deliberately introduced, rejected by the ecology
  tests, restored, and followed by a passing focused run.

The physical Elite 2 and late-game enjoyment are **not verified**. No claim of
wireless/paddle compatibility beyond the existing standard mapping was made.

Commands, from the repository root:

```sh
npm run typecheck
node --import tsx --test test/ecology.test.ts test/pad.test.ts
npm test
node app/build-drifter.mjs --body
git diff --check
```

The focused Node runner displayed file-level summaries in this environment;
those two reported files are not a replacement count for the 344-test suite.
For browser checks, start Chromium with a local remote debugging endpoint on
port 9222, then run `node test/browser-upgrades.mjs --interactions`. CDP_URL can
change the endpoint; `--scene` writes `/tmp/sonic-upgrades.png`. Stop the browser
you launched when done. Temporary /tmp logs and screenshots are not durable
session evidence; the tests and this record are committed.

The sandbox blocked the tsx CLI's IPC socket, GitHub access, Chromium startup
and its localhost debugger connection. Approved runs outside the sandbox worked.
If this recurs, use the permission tool with the actual failure reason. Do not
interpret a blocked connection as a game failure or repeatedly retry it unchanged.

## Best next session

Unless the user chooses a different priority, evaluate the current build before
adding another major system:

1. Read this file and the short play guide. Inspect git status and the latest
   commit; preserve unrelated user edits. Do not rerun the whole suite merely
   to rediscover the documented baseline.
2. Get a real play observation: aeon, approximate elapsed time, controller
   connection, what became repetitive or confusing, and `drifter.report()`.
   Ask only for missing facts that affect the next decision; continue independent
   investigation while waiting. Current reports include companions and stored
   organelle energy, but not detailed bond-failure reasons or energy throughput.
3. Investigate the biggest observed problem. Good first measurements are bond
   successes/interruptions, useful limb activations, energy drawn per organelle,
   and meaningful choices after all companion forms have been collected.
4. Exercise one full loop: gather → build host → grow mitochondrion → explore
   → return for stamina → weaken boss → tame → select companion → enter world.
   Verify failure cases as well as success. Preserve the option to kill a boss.
5. Adjust the smallest supported cause, check the relevant mechanics and browser
   flow, rebuild both HTML variants, and state what remains a playtest hypothesis.

Still open: whether the two-cell cost is worth it; whether energy stations
encourage camping; whether the three-second bond survives late volleys; whether
high-damage builds skip the taming window; whether anchor guards arrive too late;
and whether the repeating three-form cycle becomes stale after rank caps.
These are questions, not confirmed defects. Do not retune them all on a hunch.

## Working rules that matter

- The user-requested gameplay adaptations belong in game/, not the instrument
  in src/. Never connect game/ to personal/ or config/.
- Keep movement field-driven. Damage must remain telegraphed. Volley directions
  shown during the warning must match those actually fired.
- Respect controller context. Use GLYPH rather than hardcoded keyboard prompts.
  Tap/hold release behavior must not place an extra cell or feed accidentally.
- Organelle hosts are utility structures: exclude them from automatic discharge,
  available-gun estimates and targeting prompts. Preserve depth and host lifetime.
- Keep late-world population/render loops culled and spatially indexed. Current
  support tests prove behavior, not a frame-time budget for hundreds of cells.
- Act runs before simulation events are drained. Do not write an action toast
  that the same frame's event handler will overwrite; durable feedback belongs
  in the event handler.
- The published page must come from the TypeScript source. Regenerate both
  `app/sonic-drifter.html` and `app/sonic-drifter.body.html` with `--body`.
- Search within the repo first. Avoid `find ..` through the user's home folder.
  Use meaningful wait intervals for long tests and do independent work meanwhile.
- Prefer a small, complete playable increment with an early screenshot and
  real input check. Tests passing does not prove the new activity is interesting.

## Git and publication context

At the start of release preparation, the active branch was main and both local
HEAD and the remote default branch were `f0d8f5a`. GitHub repository
`9x25dillon/NEW_REPOSITORY_30` was verified private. This session's changes were
already on main, so no separate feature-branch merge was required. Do not merge
`the-body-in-the-water` merely because that historical local branch exists.

This handoff is included in the release commit. Confirm the actual current
commit and remote relationship rather than relying on an embedded hash:

```sh
git status --short --branch
git log -2 --oneline
git rev-parse HEAD
git ls-remote origin refs/heads/main
```

The user's final request was to commit/push/integrate, produce the session
review, and replace Hand_off.md with useful instructions for the next session.
