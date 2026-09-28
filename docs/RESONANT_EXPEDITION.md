# Sonic Drifter — Resonant Expedition

Open `app/sonic-drifter.html` and click **Start Resonant Expedition**. This is an
optional survival/crafting mode; the normal title-screen start keeps the original
rules and economy. Starting an expedition never replaces a run already in progress.

To use your Resonarium state, select **Import Resonarium JSON** before starting.
The importer accepts `resonarium.state.v2`, `ResonariumBiosentinelExperiment`, or
an Emergence export containing an experiment. A tonal export supplies its seed;
an experiment also supplies its saved K/R/ψ observations. No chart or audible
frequency is passed to the device-physics library. The imported selection is held
in page memory; nothing is sent to a server or stored automatically.

## Play loop

1. Start with six twofold cells, four tetragonal cells and six phase fragments.
2. Open the forge with **V / left-stick click (L3)** or the **Crystal forge** button.
3. Choose with **Q / B / D-pad left/right**, or keyboard **1–5**. Rotate with
   **C / Y**. Assemble with **Enter / Space / X / A**, or click the assembly button.
4. Close with **V / L3 / LB / Escape**. The forge pauses the simulation, including
   enemy wind-ups; opening it does not leave a held build/lift action queued.
5. Grip within 110 µm of an assembly to charge it. Release near a condenser to
   spend its stored charge on stamina. Keep hunting, gathering and building.
6. Complete the current encounter objective and survive the normal throne/birth
   loop to advance to the next stage. The throne is never gated by these goals.

The forge shows the material costs, an orientation preview and actual band-gap
alignment. It refuses an overlapping layout, a layout outside the current pool,
a layout over the throne, missing material, or more than 24 active assemblies.
A refusal spends nothing. Rotation is limited to square-lattice quarter turns.
Structures still participate in real body assembly, lattice spacing, band-gap
calculation, pool expansion, inheritance and destruction.

| Assembly | Material | Survival use |
| --- | --- | --- |
| Phase condenser | 3 cells + 2 fragments; straight rail | Stores charge while gripped, then returns it to stamina while released nearby. |
| Bragg ward | 4 tetragonal cells + 3 fragments; square | Spends 12 charge to absorb a hit nearby on the same plane; costs 6 when the existing band solver finds a gap containing the bound mode. |
| Lattice loom | 3 cells + 3 fragments; L shape | With the forge's **Weave cell** action, spends 15 charge and 1 fragment to copy its seated host group into the rack. |
| Quadrature tap | 3 cells + 2 fragments; diagonal | While your hand is a mesh, drinks nearby motifs as charge. See [Quadrature](QUADRATURE.md). |

The expedition chip also carries metal strips that set the cross-phase between the
two transducer pairs, and the right stick (or Z / X) trims it using stored charge.
[QUADRATURE.md](QUADRATURE.md) covers the physics, the map and the resource rules.

A ward accepts cells seating as **4 or 422**. A sixfold `622` seats as `222` on
this game's square trap net and cannot masquerade as tetragonal material. The
loom follows the same rule: a `622` host produces `222`. These choices call the
existing `seatedGroup` implementation backed by the symmetry library. Existing
body rendering continues to show the resulting crystallographic classification.

Each assembly stores at most 40 gameplay energy units. All nearby assemblies
share a charging limit of `8 × (0.25 + 0.75R)` units/s. Condensers share a transfer
limit of 10 units/s. Charge is accumulated only during an active, unspent grip.
Construction cells are utility structures and cannot discharge as ordinary guns.
Destroying or lifting any constituent removes the assembly benefit immediately;
remaining cells are ordinary salvage. Surviving complete assemblies can be inherited.
These are game rules over crystal geometry, not a photometabolic energy model.

## Encounter stages and enemies

| Stage | Added enemy | Clear objective | Reward |
| --- | --- | --- | --- |
| Nucleation Garden | Faceter: a plated ambusher with a long visible wind-up | 2 kills and 1 assembly | 3 fragments |
| Bragg Reef | Dislocator: preferentially gnaws resonant construction at its lobe tips | 4 kills and 2 new assemblies | 5 fragments |
| Phason Deep | Phason: an orbiting hunter whose orbit reverses with the coherence phase | 6 kills and 3 new assemblies | 8 fragments |

Every hunter gives one fragment; these three species give two. The existing
spawn calm, crowd cap, hold-to-kill rules, contrast-dependent forces and strike
telegraphs still apply. The new enemies augment the current world's wildlife;
they do not flood a quiet opening. A stage reward is paid once. A cleared stage
advances at the next birth, resetting its objective counters; the three stages
then cycle. Crowning before clearing a stage still works and preserves progress.
The stages are encounter layers over the existing aeon/world progression, not
three separate fabricated microfluidic device models.

## What connects Resonarium to the game

`game/resonance.ts` is a data boundary and gameplay model. It imports no personal
or app code. It reads only a seed and, optionally, bounded finite trajectory rows.
The full uint64 seed stays a decimal string; the game folds its two words to the
uint32 seed used by its existing PRNG. This permits collisions and is not an
identity guarantee.

Without a saved trajectory, a fixed-step 24-oscillator Kuramoto model follows a
Fibonacci sequence of reciprocal duration/intensity pulses in model units. It is
a separate lightweight game driver, not claimed to reproduce the full Python
experiment. With a saved trajectory, its per-pulse K/R/ψ observations loop as
stored. Coherence controls stored-charge efficiency; phase controls the Phason's
orbit and visual orientation. Neither sets the MHz carrier, particle properties,
water constants or other physics predictions.

The forge's band-gap indicator and ward discount use the existing solver. It can
honestly report no aligned gap; no resonance value forces the solver to succeed.
Player motion stays field-driven. No extra movement velocity was added.

## Verification and limits

```sh
npm test
npm run typecheck
npm run build
node app/build-drifter.mjs --body
```

`test/resonance-game.test.ts` checks seed/trajectory import, deterministic stepping,
atomic lattice placement, material restrictions, charge conservation, ward reach,
loom costs and group seating, one-time rewards, utility/gun separation and OFF
behavior. `test/drifter-resonance.browser.mjs` runs the previous upgrade/battle
fixtures plus the real Xbox-style forge path, assembly, charging, JSON import,
exported reporting and mobile layout. It uses an installed Playwright module via
`PLAYWRIGHT_MODULE`, with optional `CHROMIUM_PATH`.

`drifter.report()` now includes seed, encounter stage, coherence, fragments,
assemblies, kills, ward blocks and woven cells. These numbers make a play report
useful for balancing. Automated checks establish functioning mechanics; they do
not establish long-session balance. Run state still resets on page reload.

Rebuild the standalone pages from TypeScript; do not edit their embedded bundles.
Use no-store headers when serving a changing build during playtesting.
