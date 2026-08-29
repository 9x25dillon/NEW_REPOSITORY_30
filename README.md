# NEW_REPOSITORY_30

**Symmetry-first design tools for acoustic cell manipulation** — BAW in closed
microfluidic channels, SAW on open piezoelectric substrate.

Private. Under development against a single subject.

---

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

**3 · Fields.** Analytic pressure fields for the two device classes: a
half-wavelength BAW channel resonance, and an SSAW from two counter-propagating
Rayleigh waves. Then trajectory integration under radiation force plus drag.

**4 · Tensors.** Neumann's principle: point group → non-zero independent
components of d and c. This is what turns the substrate table from a filter into
a design tool.

**5 · Bands.** Phononic-crystal dispersion over the Brillouin-zone torus. Needs
an eigensolver; the only tier that adds a real dependency.

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
- **The subject's numbers are literature defaults**, not measurements. See
  `config/subject.ts`. Every trap position computed today is a sketch until the
  density and compressibility are measured.
- **PZT is not a crystallographic point group.** Poled ceramic has Curie-group
  symmetry (∞mm); `4mm` is a stand-in and the table says so.

## Running it

```bash
npm install
npm test          # 11 tests, no network, no fixtures
npm run typecheck
```

## Layout

```
src/pointgroups.ts   the 32 groups; piezoelectric / polar / chiral predicates
src/gorkov.ts        contrast factor, radiation force, drag
config/subject.ts    the one subject — natal record and biological parameters
test/                what the two modules above are actually claiming
```

`src/` never reads `config/`. The physics stays a pure function of its
arguments, and the subject record stays a label on the work rather than a term
in it — otherwise a prediction would stop being falsifiable, which is the only
thing making any of this worth building.
