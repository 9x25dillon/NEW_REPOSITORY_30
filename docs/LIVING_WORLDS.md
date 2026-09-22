# Living worlds: playtest build

> Followed by the [battle pass](BATTLE.md) (2026-09-22): riposte, king gambits,
> companions that fight, R3 calls, mitochondrial repair and evolution cards.

This pass adds decisions beyond gathering, building and killing the next king.
The acoustic library is unchanged; organelle metabolism, bonding and creature
adaptations are gameplay systems in `game/`.

Open `app/sonic-drifter.html`. Both standalone HTML variants are rebuilt from
source. An Xbox Elite Series 2 uses the existing standard Xbox mapping; its
paddles can mirror the normal buttons through your controller's own profile.

## Things to try

1. **Grow an energy station.** Tap **X** to place a cell, then stand on that
   structure with two more cells in hand and hold **X** for 0.85 seconds. This
   grows a mitochondrion using the selected cell and the next one in the rack.
   The panel previews that cost. A short X press places on release.
2. **Build a route worth revisiting.** A mitochondrion stores up to 60 energy
   while you are away or fully supplied. Come within 85 microns to refill
   stamina, up to 14 per second across all nearby mitochondria. Empty stations
   need time away to recharge. Their host becomes a utility structure and will
   not discharge when you grip. Lifting, losing or consuming the host also
   loses its organelle; inherited hosts carry their organelles into the next
   world.
3. **Give a limb a job.** The tip cell determines its role. Polar tips are
   sails that improve dash recovery within 90 microns. Non-polar piezoelectric
   tips are resonators that make bonding 1.75 times faster at that distance.
   Anchor tips guard against a bolt within 32 microns, then recharge for two
   seconds. Depth matters: support works only on planes the limb reaches.
   The inventory identifies the selected cell's prospective tip role.
4. **Tame a sovereign.** Lower its health to 30% or less, approach within 120
   microns and hold **Y** for three uninterrupted seconds. Your weapons rest
   while Y is held, but the boss keeps fighting. Leaving reach, releasing Y,
   healing above the threshold, or taking damage breaks the attempt; after a
   hit, wait for the damage grace period to end. You can still kill it instead.
5. **Choose a companion.** Taming opens the next world and recruits the living
   sovereign. **Start**, then **B**, switches companions; Start resumes play.
   The active companion changes your swimmer's appearance and grants its
   ability. Repeat bonds with the same form improve it up to rank three.
   The collection persists between worlds within the current run, not across
   restarting or reloading the page.

## Creature variety

| Boss cycle | Encounter | Companion ability |
| --- | --- | --- |
| Strider: worlds 1, 4, 7… | Pursues with the original volley rhythm | Faster dash recovery |
| Warden: worlds 2, 5, 8… | Slower pursuit and slower, less frequent volleys | Intercepts one nearby bolt, then recharges |
| Weaver: worlds 3, 6, 9… | Circles between casts and fires faster volleys | Extra stamina recovery while not gripping |

Feeding still determines the sovereign's symmetry, health and resulting world.
Its telegraphed firing directions still match that symmetry.

Ribbons arrive from world three: they circle before committing to a strike.
Sentinels arrive from world four: they wait at a distance and attack approaching
players after a longer wind-up. All damaging strikes retain their warnings and
can be interrupted by capture. Creatures have segmented, plated or tentacled
silhouettes; their colours continue to indicate acoustic contrast.

## Controls and verification

The on-page control legend follows the active input device. Keyboard equivalents
are E for building/growing, C for feeding/crowning/taming, Esc for pause, and Q
for switching companions while paused. RT grips, A dashes, LB lifts and the
D-pad changes depth, as before.

`npm run typecheck`, `npm test`, and `node app/build-drifter.mjs --body` verify and
rebuild the game. `test/ecology.test.ts` covers bonding and interruption,
companion persistence and limits, depth-aware limb support, energy accounting,
utility hosts and later-world unlocks. `test/pad.test.ts` covers held X input.
`drifter.report()` includes companion ranks and stored organelle energy.

The browser interaction checks are also kept in the repo. With Chromium's
remote debugging endpoint running on localhost:9222, run
`node test/browser-upgrades.mjs --interactions`. The script loads the standalone
game and exercises X tap/hold, pause and companion selection, Y bonding, and
world transition through simulated standard gamepad input. Use `CDP_URL` for a
different local debugging endpoint. Optional `--scene` creates a staged visual
check at `/tmp/sonic-upgrades.png`.

The first pass needs playtesting for how often each support role is useful and
whether three seconds of bonding is comfortable under later-world volleys.
The Elite controller mapping has been exercised through simulated standard
gamepad input in Chromium; physical controller feel still needs a play session.
