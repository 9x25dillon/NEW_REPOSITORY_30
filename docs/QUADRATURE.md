# Sonic Drifter — Quadrature

An addition to the [Resonant Expedition](RESONANT_EXPEDITION.md). An ordinary run
is unchanged: it stays on bare glass at quadrature, and the trim input is ignored.

## The physics: cross-phase

The game has always crossed two orthogonal standing waves and treated the result
as separable, U(x, y) = U_x(x) + U_y(y). That is only true when the X pair and the
Y pair are driven a quarter period apart in time. `game/wave.ts` now names that
case `QUADRATURE` and lets the two pairs be driven `phi` apart.

Averaged over time, the pressure squared gains a cross term, 2 cos(phi) cos tx cos ty.
The velocity gains none, because the two waves move the water along perpendicular
axes. Substituting into Gor'kov leaves one extra term, built from the monopole
coefficient alone:

    U_cross = (2/3) pi a^3 kappa_f A^2 f1 cos(phi) cos tx cos ty

At `phi = pi/2` this term is exactly zero and the game takes the old code path. Away
from quadrature:

- **Node-seekers** (cells, motifs, the sovereign) find their dots joined into a
  **diamond mesh** along both diagonals. For a mammalian cell a well is 0.35 as deep
  along its soft diagonal as it was at quadrature, and 1.65 as deep across it.
- **Antinode-seekers** (you, and the vesicles) find their wells split into a
  **checkerboard**: half are 1.65 as deep and half are 0.35 as deep.
- Both ratios are `1 ± |f1 cos phi| / (3 |Phi|)`. None of them was chosen.

The pilot's aim steps the Y pair by one pitch whenever that puts the deep well
under your hand, so you always ride the deep half. A hunter you hold in a deep
well comes apart faster, in proportion to that well's depth. The held clock is
floored at a tenth of real time, so a held body is never free to strike.

`test/quadrature.test.ts` checks the derivation against an independently written
2D Gor'kov potential at five cross-phases and three particles. It also checks the
curvature ratios, the soft diagonal the renderer draws, and that the pilot always
takes the deep half.

## The map: metal on the expedition chip

The expedition chip is the same etch with metal strips added under the channel
(`game/plates.ts`). Metal on a piezoelectric substrate shorts the surface and slows
the Rayleigh wave by about K²/2. For 128° Y-X lithium niobate that is roughly 2.7%.
This is the module's one declared literature figure.

A standing wave is two travelling waves, and between them they cross every strip
in a row exactly once. So the X pair's standing wave is uniformly late along each
row, and the Y pair's along each column. Where you stand:

    phi(x, y) = pi/2 + (pi / lambda) * 0.027 * (metal along row y - metal down column x)

A term for the row plus a term for the column makes a **tartan**. That is the shape
of the map. The shift in node position that the same metal causes is absorbed by
the aim every frame. The temporal offset between the two pairs is the part aiming
cannot remove, and only a trim changes it.

Phase per metre scales as 1/λ, so **the same glass writes a different map into
every world**. At the first world's pitch, about 60% of the channel stays within
|cos phi| < 0.25 and about a quarter is a strong mesh. The opening pool sits near
quadrature, so the first minutes play as they always have.

| Where | Metal | What the first world does there |
| --- | --- | --- |
| North band | a row almost the full width | a full mesh (\|cos phi\| ≈ 0.98) |
| East column | a column almost the full height | a full mesh |
| Where they cross | both | they largely cancel into a quadrature island |
| West column, south-west reed, south-east shelf | partial | intermediate, and they shift with each world |

On screen the strips are engraved in brass, and the clay wash over them is
|cos phi| at this world's wavelength.

## The resources

| Rule | Numbers | Where |
| --- | --- | --- |
| **Trim**: a phase shifter on the Y pair's feed | ±90°, slews at 2.4 rad/s, costs 3 charge/s at full trim (proportionally less below) and draws from your fullest assemblies first | `crossPhase` |
| An empty bank refuses the trim | the shifter slews back to what the glass writes | `crossPhase` |
| **Lock**: match your lattice's \|cos phi\| to your coherence phase's \|cos psi\| | within 0.3; a perfect lock doubles the shared charging budget | `resonanceStep` |
| **Quadrature Tap**: 3 cells on a diagonal + 2 fragments | while your hand is a mesh (\|cos phi\| ≥ 0.5) and you are within 110 µm of a tap cell, it drinks motifs within 24 µm for 4 charge each | `drinkTaps` |

The trim, lock and tap values are game constants, declared as such. The mesh, the
checkerboard and the tartan are consequences of the physics.

ψ keeps moving. The built-in driver rotates it at roughly the mean oscillator
frequency, and an imported experiment trajectory plays back the recorded ψ. Holding
a lock means tracking it with the stick. Sometimes the glass already agrees with
you, and then the lock costs nothing.

## Controls

| Action | Xbox | Keyboard |
| --- | --- | --- |
| Trim cross-phase | right stick, horizontal (standard mapping only) | Z / X, held |
| Quadrature Tap | forge option 4 (D-pad / Q / B, or key 4) | V, then 4 |
| Weave cell | forge option 5 | V, then 5 |

A pad without the standard mapping never trims. On such pads axis 2 is often a
trigger resting at −1, which would hold a full trim with nobody touching anything.

## Look and sound

Everything added is drawn from a real quantity:

- **The field wash** swells on one half of its checkerboard and drains on the other
  by exactly 1 ± cos phi, the sign of the new pressure term.
- **The mesh**: a clay segment through each node in your hand, along that node's
  soft diagonal (`softDiagonal`).
- **The wells**: antinode dots are sized by `wellDepth`, so the deep half visibly
  swells.
- **The sigil** (right of the HUD) is a Lissajous figure of the two drives, the X
  pair across and the Y pair up. At quadrature it is a circle, in step it is the
  mesh's diagonal, and between them an ellipse. The travelling bead is the drive
  slowed about seven orders of magnitude; its shape is exact. The ring marks the
  glass's phase in brass and your trimmed phase in clay. The dotted figure is the
  |cos psi| target, and the inner gold arc is the lock.
- **The drone** puts the X pair in the left ear and the Y pair in the right, at a
  low G and its double octave, with the right delayed by exactly phi. At quadrature
  the image is wide, in step it folds to the centre, and in anti-phase it goes
  hollow. The pitch is a stand-in; the phase between the ears is true. There is
  also a glass ping when a tap drinks and a rising fifth when you lock.

Also fixed along the way: the hand's node and antinode dots were requested over
`[0, ARENA_W)`, which is the opening pool's size used as a position. The lattice
was therefore only ever drawn in the channel's far-left corner. It is now drawn
wherever the camera is.

## Verification

```sh
npx tsx --test test/quadrature.test.ts
PLAYWRIGHT_MODULE=… CHROMIUM_PATH=/usr/bin/chromium node test/drifter-resonance.browser.mjs
```

The browser script now finishes with 11 quadrature checks on the real pad path:
walking onto the metal, trimming with the right stick, the bank draining and the
trim slewing back, reaching option 4 on the D-pad, and assembling a tap. It saves
`quadrature.png` and `quadrature-trim.png`.

`drifter.report()` adds `crossDeg`, `nativeDeg`, `trimDeg`, `lock`, `bank`,
`meshSeconds`, `lockSeconds`, `trimSpent` and `tapped`.

## What is not known yet

- Whether trim at 3 charge/s, a 0.3 lock width and 4 charge per motif feel right.
  These need a real play report, not an automated check.
- Whether the tap's trade, motifs in exchange for charge, is worth it against
  simply building cells.
- Attenuation of a water-loaded SAW is ignored here, as it is everywhere else in
  the game. A real channel this long would show it.
