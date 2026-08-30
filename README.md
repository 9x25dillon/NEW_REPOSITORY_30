# NEW_REPOSITORY_30

**Symmetry-first design tools for acoustic cell manipulation** — BAW in closed
microfluidic channels, SAW on open piezoelectric substrate.

Private. Under development against a single subject.

---

## Two halves, and the boundary between them

This repository holds two things that must not be confused, so they are kept in
separate directories with an **enforced** import boundary (`test/boundary.test.ts`
reads the actual import statements and fails if either half reaches for the
other).

| | `src/` — the instrument | `personal/` — the tonal layer |
|---|---|---|
| For | study, research, device design | listening |
| Frequency | 1–200 MHz | 110–440 Hz |
| Wavelength in water | under a millimetre | metres |
| What it claims | acoustic radiation force on suspended cells | a chart, drawn and played |
| Checkable by | an experiment | listening to it |

**The distinction is physical, not editorial.** A 10 µm cell sits deep in the
long-wavelength regime the Gor'kov potential is derived for at 1 MHz, where the
wavelength is 1.5 mm. At 440 Hz the wavelength is 3.4 metres, the wavenumber is
smaller by three orders of magnitude, and the radiation force on a cell from
music at listening levels is not small — it is irrelevant. The device physics
also needs a resonant channel or a piezoelectric substrate coupled into a
fluid; headphones are neither.

So the tonal layer is **music**. It may well be pleasant and relaxing, which is
a real thing for music to be and needs no mechanism beyond the ordinary one.
It is not a dose, a treatment, or the process `src/` models. If this ships to
other people, that distinction has to survive the trip — which is what the
boundary test is for.

The tonal map is exact and makes one genuinely interesting claim: at one octave
per half-circle, every classical aspect lands on a whole multiple of 200 cents,
so **the major-aspect family is the whole-tone scale**. That is a statement
about the map, and it is tested.

## What this is

An instrument for answering two questions before anything is fabricated:

1. **Can this substrate carry the wave?** — a point-group classifier over the
   32 crystallographic point groups (`src/pointgroups.ts`).
2. **Where will the cells go?** — the Gor'kov radiation potential and the
   acoustic contrast factor (`src/gorkov.ts`).

Both are exact. Neither needs a mesh, a solver, or a licence.

## Where it came from, and what survived the move

This began as the geometry engine behind an astrology visualiser. Most of that
did not transfer, and the parts that did, transferred because they were never
astrology in the first place.

### Transfers, rigorously

**The 32 point groups.** Of the 32, exactly 11 are centrosymmetric, so 21 are
not. Neumann's principle says a property tensor must be invariant under every
symmetry operation of the group; piezoelectricity is a rank-3 tensor, rank-3
tensors are odd under inversion, so in a centrosymmetric group every component
equals its own negative and the tensor vanishes. **No piezoelectricity, no
interdigital transducer, no surface acoustic wave.** The substrate question is a
symmetry question, and this table answers it. Every substrate you would actually
use is in it: LiNbO₃ and LiTaO₃ are `3m`, quartz is `32`, ZnO and AlN are `6mm`.

**The torus, as a Brillouin zone.** The Brillouin zone of a 2D periodic lattice
is topologically T² = S¹×S¹ — the same object the old engine embedded, for
unrelated reasons. Band structure and Chern numbers live on that torus. This is
real vocabulary, not a metaphor, and it is the honest route to any topological
claim this repo eventually makes.

**Neumann's principle generally.** Point group → which components of ε (rank 2),
d (rank 3) and c (rank 4) are independent and non-zero. Well-defined, exactly
computable, and genuinely useful. Not yet implemented; see the ladder below.

### Does not transfer

**The 22 letters as topological edge modes.** Edge-mode count is set by bulk
topological invariants, not by the size of an alphabet, and there is no
mechanism that would make it 22. The letters were a naming scheme — useful for
labelling a finite set of configurations, and nothing more. Stated plainly here
because presenting it as physics would sink a paper.

### Corrected on the way in

- **The triclinic matrix is a coordinate transform**, fractional → Cartesian.
  It is not a dielectric tensor, a stiffness tensor, or a piezoelectric tensor.
  Tying it to ε̄̄ is a category error.
- **Gor'kov has no viscosity term.** Viscosity governs Stokes drag and acoustic
  streaming, which are separate forces entering at a separate stage. The
  potential depends on the density and compressibility contrasts only.
- **Φ > 0 for mammalian cells, so they collect at pressure NODES.** That sign is
  the entire design. Getting it backwards produces a device that pushes cells
  into the walls.

## The sign that decides everything

```
Φ = f₁/3 + f₂/2        f₁ = 1 − κ_p/κ_f        f₂ = 2(ρ_p − ρ_f)/(2ρ_p + ρ_f)
```

`Φ > 0` → pressure nodes. `Φ < 0` → antinodes. Mammalian cells are denser *and*
stiffer than their medium, so both terms are positive and cells go to nodes.
Lipid droplets and microbubbles go the other way — which is exactly what makes
acoustic separation possible in a single field.

Note `f₂ ∈ (−2, 1)`, not `(−1, 1)`. The bound is genuinely asymmetric: a bubble
can pull twice as hard toward an antinode as an infinitely dense particle can
pull toward a node.

## Build ladder

Ordered because each tier needs the one before it.

**1 · Symmetry** — *done.* Point groups, piezoelectric/polar/chiral predicates,
substrate table.

**2 · Single-particle acoustics** — *done.* Gor'kov potential, contrast factor,
1D radiation force, Stokes drag.

**3 · Fields and motion** — *done.* `src/fields.ts`, `src/trajectory.ts`.
Half-wavelength BAW channel resonance, SSAW from counter-propagating Rayleigh
waves, and overdamped trajectory integration under radiation force plus drag.

**4 · Tensors** — *done.* `src/symmetry.ts`, `src/neumann.ts`. Neumann's
principle, computed rather than tabulated: point group → independent components
and non-zero pattern for permittivity, piezoelectric and elastic tensors.

**5 · Bands** — *done.* `src/linalg.ts`, `src/bands.ts`. 1-D layered stacks
exactly, 2-D phononic crystals by plane-wave expansion over the Brillouin-zone
torus. It needed an eigensolver but **not** a dependency: cyclic Jacobi plus a
Cholesky reduction is about a hundred lines and converges unconditionally for
real symmetric input. The repo is still dependency-free.

## Neumann's principle, computed twice

A hand-copied table of tensor patterns has hundreds of cells, no way to check
itself, and one transposed entry sends a designer to a coefficient that does not
exist. So this is computed, by two methods with nothing in common, and the two
are asserted equal for all 32 groups × 3 tensors:

- **Character theory** gives the count exactly. The dimension of the invariant
  subspace is the group-average of the representation's character — a theorem
  evaluated, not a measurement taken.
- **An explicit projector** gives the pattern. Averaging the representation over
  the group and composing with the intrinsic index symmetries lands on the space
  of admissible tensors; its trace must equal the character count, and its
  non-zero rows are the surviving components.

Method 1 is blind to *which* components survive; method 2 is vulnerable to a
mis-built representation. An error in either shows up as a disagreement rather
than as a plausible table. Every count reproduces the published tables — 18, 8,
10, 3, 5 … down the piezoelectric column; 21, 13, 9, 7, 6, 5, 3 for elastic.

The groups themselves are **closed from generators**, not listed, and each
group's final size is checked against the order column in `pointgroups.ts` — two
independently written facts that have to agree, thirty-two times. A group listed
by hand can be silently short an element, which would impose too few constraints
and quietly report too many free components.

**`432` falls out.** `pointgroups.ts` *names* it as the one non-centrosymmetric
group that is still not piezoelectric. `neumann.ts`, which was never told,
computes its piezoelectric tensor to zero dimensions from characters alone — and
finds it is the only such group. The census and the group theory close on each
other from opposite directions.

## The motion has a closed form, and that is the referee

The trajectory is overdamped — a 10 um cell in water has a momentum relaxation
time under a microsecond, so inertia is gone before anything moves:

```
6 pi mu a (du/dt) = F_rad(u)
```

Substituting T = tan(ku) turns this into dT/dt = 2kAT, so

```
tan(k u(t)) = tan(k u0) * exp(2 k A t)        A = Phi k a^2 kappa_f p_a^2 / (6 mu)
```

**exactly.** The RK4 integrator is checked against that formula rather than
against a finer copy of itself — convergence to a self-consistent wrong answer
is the failure a step-halving check cannot see.

Two consequences fall straight out. The approach is exponential, so a cell never
formally arrives and focusing time must be quoted to a tolerance, not to the
node. And `u0 = 0` gives `T = 0` forever: a particle placed exactly on an
antinode stays there, because that is an equilibrium — an unstable one.

## Measuring the cell, rather than assuming it

`src/inversion.ts` is `gorkov.ts` run backwards. A cell in a standing wave
follows `tan(k·u) = tan(k·u₀)·exp(2kAt)` exactly, so taking logs gives a
**straight line in t** whose slope is `2kA` — one tracked focusing event, a
linear fit, no initial guess, and an r² that says immediately whether the cell
was doing what the model claims.

Two things make this a protocol rather than a formula:

- **The pressure amplitude has to be calibrated**, not read off a signal
  generator. Run polystyrene beads of known contrast, invert for the amplitude
  that produced their rate constant, then use it for the cells in the same chip
  and session.
- **Φ is one number containing two unknowns.** A single medium constrains a
  curve in the (ρ, κ) plane and pins neither coordinate, so the run is repeated
  in media of different density and the curves intersected.
  `propertiesFromContrasts` refuses a single measurement rather than inventing
  whichever coordinate you did not think to question, and reports a residual so
  a bad medium shows up instead of being averaged away.

Validated by round trip: synthetic tracks in three media recover the cell that
generated them to 1 kg/m³ and 2 m/s.

## The Brillouin zone is the torus

A Bloch wavevector is defined only modulo a reciprocal lattice vector, so the
zone's opposite faces are identified and the parameter space of a 2-D crystal is
S¹ × S¹ — the same T² the old engine embedded, for entirely unrelated reasons.
`ω(k + G) = ω(k)` is not an analogy; it is the periodicity that makes the zone a
torus, and it is asserted as a test. The assertion is that the deviation
*shrinks as the basis grows*, not that it is below a fixed number: the
periodicity is exact for the untruncated problem and approximate once the
plane-wave basis is cut off, and that distinction is what separates a truncation
artefact from a broken symmetry.

Two methods, checking each other again. The 1-D layered stack has an exact
closed-form dispersion from the transfer-matrix trace; the 2-D expansion is a
numerical eigenproblem. A crystal made of **stripes** is periodic in x and
uniform in y, so along Γ–X it *is* a layered stack — and the two agree to 2×10⁻⁴
at reasonable truncation, with the expansion converging from **above**, as a
variational method must.

Two useful facts fall out of the 1-D relation. Set the impedances equal and the
trace collapses to `cos(kΛ)` whatever the velocity contrast: **an acoustic
mirror is designed on impedance ratio**, not on material contrast in the loose
sense. And `blochWavenumber` returns the wavenumber **reduced to the first
zone**, so above the zone edge it is not `ω/c` — it is the folded value.

## BAW and SAW

Shared core: pressure field → Gor'kov → where the cells go. What differs is how
the field is made.

| | BAW | SAW |
|---|---|---|
| Where the wave lives | bulk of the fluid, in a resonant channel | surface of a piezoelectric substrate |
| Sets the wavelength | channel width (half-wavelength resonance) | IDT finger pitch |
| Typical drive | 1–10 MHz | 10–200 MHz |
| Channel material | must be hard — silicon/glass | PDMS is fine |
| Substrate symmetry | irrelevant to the resonance | **decides everything** — must be piezoelectric |
| Resolution | coarser, one trap per half-wavelength | finer, higher frequency |

The point-group table matters for SAW and is nearly irrelevant for BAW. That
asymmetry is worth keeping in mind when reading the rest of this repo.

## Limits worth stating up front

- **Particle size.** Radiation force goes as *a*³; drag from streaming goes as
  *a*. Their ratio goes as *a*², so below some size streaming wins and the trap
  stops holding. Literature puts the crossover near 1–2 µm in water at MHz —
  order of magnitude only, since it depends on the streaming pattern and hence
  the channel geometry. Cells at 5–10 µm are comfortably above it; bacteria are
  not.
- **The subject's numbers are literature defaults**, not measurements.
  `config/subject.ts` carries `MEASURED = null` as a structural slot for the
  real ones. Every trap position computed today is a sketch until the density
  and compressibility are measured — see
  [docs/MEASURING_A_CELL.md](docs/MEASURING_A_CELL.md), which `src/inversion.ts`
  implements.
- **PZT is not a crystallographic point group.** Poled ceramic has Curie-group
  symmetry (∞mm); `4mm` is a stand-in and the table says so.

## Running it

```bash
npm install
npm test          # 113 tests, no network, no fixtures
npm run typecheck

npm run build     # tsc emits browser ESM into app/dist
python3 -m http.server 8099   # then open localhost:8099/app/index.html
```

A static server is needed because the app is native ES modules, which browsers
will not load over `file://`. There is no bundler and no framework — `tsc` emits
the same modules the tests import, so a number on screen and a number in a test
come from one implementation. That is the only thing that makes the provenance
tags mean anything.

## The app

Three screens, in the order the work actually happens.

**Substrates.** All 32 point groups with piezoelectric, polar and chiral flags
and the drivable coefficients for each. Rows that cannot carry a wave are greyed
out — 12 of them, the 11 centrosymmetric groups plus `432`. Pure lookup, no
inputs, immediately useful to someone choosing a wafer.

**Device.** Channel width or IDT pitch in; resonance, trap positions, focusing
time out. Every figure carries a provenance tag, and the guards surface as
interface: below the streaming crossover, near the iso-acoustic point, substrate
slower than the fluid, substrate not piezoelectric. Each is a one-line message
that saves a fabrication run.

**Measure.** Paste tracked positions, get Φ with an r². Add a second medium of
different density and it solves for density and compressibility, which flows
straight back into the Device screen.

**Chord** — `app/listen.html`, a separate page rather than a fourth tab. One
sustained sine voice per body, tuned by longitude; bodies close in longitude are
close in pitch and beat against each other slowly, which is the whole texture. A
chart with a tight conjunction hums; one spread out sits still. Audio starts on a
button press and nowhere else — the AudioContext is constructed inside the click
handler, so there is no path to sound a reader did not ask for.

**Sweep** puts two signals over the drones — one climbing 1 Hz to 300, one
falling back — so the chart is heard as a *sequence* of zero-beats rather than
as a chord. Linear in time, not exponential: 1→300 Hz is 8.2 octaves and the
drones occupy 1.5 of them, so an exponential sweep would rush every crossing
into a few seconds near the top.

**Upcoming** is the same thing at the speed the sky moves. A transit *is* a
sweep: the natal drone holds still while the transiting one glides through four
weeks either side of exactness, and the interval locks as it passes — 800 cents
for a trine, 600 for a square, 0 for a conjunction, because the map puts every
classical aspect on a whole multiple of 200. A station has nothing to lock
against, so what you hear is the glide slowing, stopping and reversing.

The positions are computed elsewhere and **pasted in**, nine real weekly samples
per event. `personal/transits.ts` holds no ephemeris and should not grow one: at
a station the speed is zero, and reconstructing the turn from a speed would draw
a straight line through the one moment that is entirely curvature.

**Field** — `app/field.html`. A five-dimensional lattice, cut at an irrational
angle and projected. Five-fold symmetry is *forbidden* to any periodic lattice
(the restriction theorem, tier 4), so what exists instead is a quasicrystal:
aperiodic, never repeating, entirely ordered. Each point is a voice — radius in
physical space sets its pitch, position in the *other* projection decides
whether it sounds at all.

Up to 60 field voices, six cross-sweeps in three crossing pairs, up to eight
binaural pairs (hard L/R, so the beat is built in the head and a bed cannot mask
it), and two free tones to 8 kHz. A slow **phason** — a shift of the cut, which
in quasicrystal physics costs no energy — reorganises the field continuously
while every surviving voice keeps its frequency. That is the "liquid" in liquid
crystal: orientational order without positional order.

Summing is `1/√n`, not `1/n`: incoherent voices add in power, so at `1/n` the
field would vanish as voices were added. A limiter catches peaks; it is not a
substitute for turning it down.

It is a separate page on purpose. A tab would present the two as views of one
thing, and the import graph says otherwise: `app/main.ts` knows nothing of
`personal/`, `app/listen.ts` nothing of `src/`, and `test/boundary.test.ts`
enforces both. The page sounds a chart; it does not cast one — paste longitudes
from wherever you compute them.

### Provenance is the interface

`src/provenance.ts` carries the rule: **a derived value inherits the weakest
provenance among its inputs.** One assumed number anywhere upstream and the
headline is assumed, however exact every step after it was. `blame()` names the
leaf responsible, so an amber result always says what to go and measure.

`derive()` can never return `measured`. A computed value is at best derived even
when every input was measured, because nobody measured *it* — the difference
between "we observed this cell focus in 42 ms" and "we calculate that it
should". Taking a measurement therefore turns the Device screen's tiles from
amber to **blue**, not green, and the app says so.

## Layout

```
src/pointgroups.ts   the 32 groups; piezoelectric / polar / chiral predicates
src/gorkov.ts        contrast factor, radiation force, drag
src/fields.ts        BAW channel resonance and SSAW; one standing wave, two devices
src/trajectory.ts    overdamped motion, closed form, RK4, sweep limits
src/symmetry.ts      the 32 groups as 3x3 matrices, closed from generators
src/neumann.ts       which tensor components a crystal is allowed to have
src/linalg.ts        Jacobi eigensolver and Cholesky reduction, no dependency
src/bands.ts         1-D stacks exactly, 2-D crystals over the zone torus
src/inversion.ts     measured tracks -> contrast factor -> density and kappa
src/provenance.ts    measured / derived / assumed, and the weakest-link rule
app/index.html       the bench: substrates, device, measure
app/listen.html      the chord: a separate page, sharing no code with the bench
personal/tonal.ts    the chart as a chord: 110 Hz * 2^(lambda/180), audible
personal/torus.ts    the natal 4D torus, Clifford projection, plane-pair turns
personal/transits.ts a year of upcoming events, pasted in; no ephemeris here
personal/quasicrystal.ts  Z^5 cut and projected: three edge lengths, powers of phi
config/subject.ts    the one subject — natal record and biological parameters
test/                113 tests: what the modules above are actually claiming
```

`src/` never reads `config/` or `personal/`, and `personal/` never reads `src/`.
The physics stays a pure function of its arguments; the subject record and the
tonal layer stay labels on the work rather than terms in it. Otherwise a
prediction would stop being falsifiable, which is the only thing making any of
this worth building — and the tonal layer would start implying something it
does not do. `test/boundary.test.ts` enforces all of it.
