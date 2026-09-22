# Next-session handoff — written 2026-09-22

Start here. Then read, in this order and only as far as you need:

| File | What it is |
| --- | --- |
| `docs/BATTLE.md` | every mechanic added on 2026-09-22, with the play evidence and the measurement each number came from |
| `docs/LIVING_WORLDS.md` | the 2026-09-21 pass: mitochondria, limb roles, tameable bosses, companions |
| `SESSION-2026-09-22.md` | today's review: decisions, open assumptions, process lessons |
| `SESSION-2026-09-21.md` | the previous session's review |
| `HANDOFF.md` | the standing architecture, and the design rules that are load-bearing. **Read its numbered rules before changing anything in `game/`** |
| `drifter.report()/` | seven play reports. Every number in BATTLE.md traces back to one |

The previous version of this file described the same work in progress; it is
superseded by the four files above and remains in git history. If a claim in
any of these disagrees with the code, the code is right and the file is stale.

## Who you are working for

The user plays on an **Xbox Elite Series 2**, in sessions that now run 25–50
minutes and reach aeon 10–29. They are a player of their own game, not a reader
of it: they will paste `drifter.report()` and expect the next change to come
from what it says.

Asked for, across two sessions: later worlds that stay interesting, useful
limbs, more creature and boss variety, bosses that can be tamed and used,
battle mechanics, allies, and more to do. Corrected me on one thing, and it
matters: **do not gate the throne — reward it.** They overfeed deliberately,
because nothing else is left to do, and the answer was prime helpings rather
than a warning. They steer mid-session and they mean it. Take the steer.

## The state of the game

Four rounds shipped on 2026-09-22, on top of the 2026-09-21 pass:

- **The riposte.** A burst into a volley arm (±60° of head-on) catches it and
  throws it back for ⅔ of the king's mass per arm. One per burst, one throw
  every 2.5 s; inside the recovery a burst still eats the arm. A landed arm
  knocks the next volley back 0.33 s, never one already drawn.
- **Gambits.** From world 2, at most one per 7 s, drawn for 0.9 s: a Strider's
  charge lane (36 µm core), a Warden's shock front (175 µm/s, stopping 220 µm
  past its edge), a Weaver's echo volley.
- **The falter.** The first time a king reaches its bond line it stops for
  2.5 s and cannot be taken below 1 hp. It is the only reason bonding,
  companions, calls and PACK are reachable at all: before it, four runs across
  fourteen aeons tamed nothing.
- **And:** companions that hold hunters, R3 calls (rush/aegis/snare),
  mitochondrial repair, fourteen evolution traits plus uncapped REFINE, cards
  bought with surplus cells, prime helpings, the lure, tenders and leeches.
  All of it is in `docs/BATTLE.md`.

`npm test` is 385 tests, about two minutes. `npm run typecheck` runs both
configs. `node app/build-drifter.mjs --body` regenerates both standalone pages
and **must be run before any play session** — the published page is built from
the TypeScript, never edited.

## Rules added this session, which are load-bearing

These join the numbered rules in `HANDOFF.md`. Each exists because breaking it
already cost something measurable:

1. **Every wound a king takes goes through `hurtSovereign`.** The falter's
   floor and the bond-line crossing cannot be true of a discharge and false of
   your hand or a thrown arm.
2. **Everything asking what the water is coming for goes through `prey`.** A
   lure half the callers believed in would pull a hunter off you and walk a
   king onto you at the same time.
3. **`held` is checked before the tend/graze dispatch in `hunt`.** A tender
   that kept mending inside a closed hand is the one body outside the rule the
   whole bestiary runs on.
4. **The prime term is added past the mass ceiling, not into it.** Folded in it
   buys nothing — a sixfold throne is at that ceiling by its fourth helping,
   which is the whole reason the boon exists.
5. **`throneLedger` counts, it does not index.** Primes buy wherever they fall,
   so "the helpings that bought something" is no longer a prefix, and any text
   saying "the first N bought all there was" is now false.
6. **A gambit's wind is `windLength(run)`, not `VOLLEY_WIND`.** The renderer
   and the reign must agree or the telegraph stops being the truth.
7. **Tuning numbers get checked at both ends:** the rate a bot can reach *and*
   the rate the reports say a person plays at. Ignoring the second shipped a
   riposte the user called "nerfed".
8. **A measurement harness must reproduce a number from a real report before
   its output is believed.** Three fixtures lied this session.

`combat.ts`, `allies.ts`, `evolution.ts` and `organelles.ts` import functions
back from `run.ts` — the same module cycle `ecology.ts` already had. It is safe
only because those imports are used inside functions. Top-level code in those
modules must not read a `run.ts` binding.

## What to do next

**Get a report first.** Four changes are unverified by play: the riposte
retune, the 0.9 s gambit wind, the birth-screen nudge, and the lure, which no
report predates. Ask for one run and four answers:

1. Does a catch feel worth making now?
2. Are the charge lane and shock ring readable mid-fight?
3. Did you buy a second card — and did you notice you could?
4. Did you use the lure? If not: the button, the cost, or forgetting?

Then, in the order I would take them:

- **The mitochondria bearing.** Eight stations and 480 stored energy, and
  mending happens only when the player is already near one. A HUD bearing to
  the nearest charged station when integrity is down is cheap, and it is the
  last obvious gap in a system they now use (14 mends last run, up from 1).
- **Whether companions trivialise hunters.** One landed strike in 32 minutes
  with a rank-3 Strider. That may have removed a threat rather than answered
  it. Measure before adding more hunters.
- **Cross-session save.** Runs are 25–50 minutes and a reload loses companions,
  traits, everything. It is the largest remaining structural gap.
- **Do not add another system until those are answered.** This project's
  failure mode is breadth: the aeon-29 report had every trait capped and still
  nothing to do at the throne.

## Working rules that keep paying

- Gameplay adaptations live in `game/`, never in `src/`; `test/boundary.test.ts`
  enforces it by reading imports.
- Movement stays field-driven. Damage to the player stays telegraphed. What is
  drawn is what happens.
- Cull and grid anything looping over bodies, cells, structures or entities in
  `app/`: a real run carries 700 buildings and 800 motifs.
- Run the full suite before trusting a change to `hunt` or `settle`. It caught
  a `beast()` call on a motif's species this session that broke every bot run.
- **Serve the game with no-store headers.** A plain `python3 -m http.server`
  will hand the browser a cached build and cost a play session. Five lines of
  `http.server` with `Cache-Control: no-store` over `app/` is enough.
- Browser checks: start Chromium with `--remote-debugging-port=9222`, then
  `node test/browser-upgrades.mjs --interactions --battle` (36 checks), and
  `--battle-scene` for staged screenshots (`SHOT_DIR` picks the folder). Kill it
  with a pattern that cannot match your own shell: `922[2]`, not `9222`.
- Ask for the intent behind a behaviour before designing against it. "I overfed
  on purpose" arrived three rounds late and reversed a whole design.

## Git

`main` on `9x25dillon/NEW_REPOSITORY_30` (private), pushed. Commits this
session: the battle pass, a handoff correction, the content pass, and this one.
The user asks for commit, push and merge explicitly. Do not publish without it.
