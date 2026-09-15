# External benchmark requirements

**These are the reference problems and data against which future accuracy claims
must be assessed. This release makes no physical-accuracy claim for real cells,
thermoviscous or elastic spheres, or wall-corrected devices.**

Numerical verification asks whether the implementation solves its stated
equations. Agreement with an independently published theoretical solution is
stronger verification than agreement between two implementations sharing the
same mistake. Physical validation additionally requires experiments with
calibrated inputs, uncertainties, and matching boundary conditions. A test count
does not establish either the applicable physical regime or experimental accuracy.

The references below are a benchmark plan, not a list of reproduced datasets.
Published numerical fixtures have **not yet been extracted** for these additions.
Do not label a reference reproduced until its specific equations/figure/table,
inputs, conventions, expected values, tolerances, and executable test are recorded.

## 1. Radiation on spheres and near walls

| Anchor | Required comparison | Boundary of the claim |
|---|---|---|
| King (1934), *On the acoustic radiation pressure on spheres*, [DOI](https://doi.org/10.1098/rspa.1934.0215) | Incompressible-sphere Rayleigh coefficient, matched pressure and energy conventions | A limiting theoretical benchmark, not a thermoviscous or cell model |
| Yosioka & Kawasima (1955), *Acoustic radiation pressure on a compressible sphere*, Acustica 5, 167–173 | Compressibility and density dependence of the small-sphere standing-wave force | Record the original equation and normalization before adding fixtures |
| Hasegawa & Yosioka (1969), *Acoustic-radiation force on a solid elastic sphere*, [DOI](https://doi.org/10.1121/1.1911832) | Partial-wave elastic-sphere force curves and appropriate material limits | Requires elastic material parameters, including shear response; the present fluid-sphere solver is not this model |
| Settnes & Bruus (2012), [viscous small-particle theory](https://arxiv.org/abs/1110.6037) | Viscous dipole coefficient, inviscid recovery, density-match limit, and dependence on viscous penetration depth | This is a **viscous**, not complete thermal, correction; its small-acoustic-size condition must not be confused with requiring a thin layer relative to particle radius |
| Karlsen & Bruus (2015), [thermoviscous small-particle theory](https://arxiv.org/abs/1507.01043) | Droplet/solid benchmarks with both thermal and viscous penetration depths | Allows layers comparable to or larger than particle radius within its perturbative small-particle assumptions |
| Doinikov (1997), *Acoustic radiation force on a spherical particle in a viscous heat-conducting fluid. I. General formula*, [DOI](https://doi.org/10.1121/1.418035) | The applicable thermoviscous partial-wave solution and its asymptotic overlaps | Match particle type and boundary conditions; do not implement one universal multiplicative correction |

For every fixture, record peak versus RMS pressure, standing versus traveling
wave, phase/time convention, radius versus diameter, material parameters, and
dimensionless normalization. Record numerical uncertainty separately from
experimental or figure-digitization uncertainty. The existing small-size and
momentum-flux tests remain numerical verification, not experimental validation.

**Wall corrections are two separate extensions:** hydrodynamic mobility/drag and
acoustic scattering/force. Specify wall type, particle-wall separation,
orientation, and confinement. It would be too broad to call all sphere-near-wall
problems unsolved: classical mobility problems have solutions, while an arbitrary
wall-loaded acoustic device has no universal correction. One acoustic reference
to reproduce for its stated rigid-tube geometry is
[*Exploring the underlying mechanism of acoustic radiation force on a sphere in a fluid-filled rigid tube*](https://doi.org/10.1063/5.0054473).
Do not transfer that result to arbitrary wall impedances or to drag.

## 2. Streaming boundary-value problems

Keep these models separate even if they eventually return the same velocity-field
interface:

- **Rayleigh/Schlichting:** resolve or match the oscillatory inner layer to the
  outer flow. With `delta=sqrt(2 nu/omega)`, the repository's water constants give
  about **169 nm at 10 MHz**. A straight parallel-plate problem is tractable; a
  claimed finite rectangular-channel solution must also enforce its side walls.
  The present `rayleighStreaming` solves the outer slip problem only. Use the
  [parallel-plate benchmark](https://bme.lth.se/fileadmin/user_upload/Publications/12_PhysRevE_Barnkob.pdf)
  for its stated assumptions, then add matching and resolved-layer comparisons.
- **Eckart:** attenuation supplies a body force. Solve continuity, momentum, and
  pressure with no-slip walls **and** the axial pressure/flux or inlet/outlet
  constraint. Four wall conditions alone do not specify the global flow. An
  irrotational forcing may be balanced by pressure rather than create streaming.
  The present body-force function is not an Eckart velocity solver.
- **Sharp edges:** create a separate geometry-specific module and fixtures for
  tip radius, angle, displacement, frequency, and viscosity. A concrete starting
  reference is [Nama, Huang, Huang & Costanzo (2014)](https://arxiv.org/abs/1402.4152).
  Convergence must resolve or model the tip and boundary layer; a singular ideal
  corner must not yield a supposedly universal jet speed.
- **Bubbles:** select a specific oscillation and confinement problem before
  implementation. Breathing, translation, and mode coupling are distinct inputs;
  an isolated spherical breathing mode cannot simply be assigned a vortex field.
  The Elder/Kolb/Doinikov and later bubble-streaming literature are candidate
  anchors; the exact paper and numerical case remain to be selected.

`game/wave.ts` explicitly contains a calibrated-for-gameplay streaming scale and
randomized heading. It is not a resolved Rayleigh solver and is not an external
benchmark. Replacing that behavior requires a separately specified game design;
instrument modules must not inherit its constants.

## 3. Holography

Acceptance requirements before a trapping claim:

- For each sampled pupil axis, enforce `|k_transverse|max < pi/delta_x` for the
  represented spectrum. Specify aperture, grid extent, padding, propagation
  distance and evanescent treatment. Nyquist sampling is necessary but does not
  alone prevent FFT wraparound or undersampling of the propagation transfer
  function. Test plane waves, grid refinement and propagation/reconstruction
  against independent analytic fields.
- Return pressure **and** velocity, with one declared time convention. This
  repository's Mie convention is `exp(-i omega t)`, for which linear momentum
  gives `v = grad(p)/(i omega rho)`. With `exp(+i omega t)`, the sign is negative.
  Test the momentum-equation residual; do not copy a formula without its convention.
- Gerchberg–Saxton is non-convex. Record iteration count, amplitude residual,
  power normalization and power outside the target region. Test reproducibility
  and successful specified targets, and expose stagnation/failure. Do not promise
  convergence for arbitrary requested patterns.
- A pressure minimum alone is not a 3D particle trap. Evaluate the particle's
  radiation force and restoring stability using the full pressure/velocity field.

## 4. Topology

Start with complex **Hermitian** generalized eigenproblems with positive-definite
mass matrices, correctly normalized eigenvectors, and residual tests. A complex
matrix does not automatically imply a lossy/non-Hermitian model.

Calibration sequence:

1. SSH: 1D winding/Zak phase and boundary modes under its protecting symmetry.
   A 2D first Chern number is not the invariant of a purely 1D SSH model; reporting
   "Chern=0" is not a substitute for testing the winding.
2. Haldane: trivial and nontrivial Chern sectors, phase transitions and gap closure;
   FHS against Wilson-loop winding, mesh refinement, and random gauge changes.
3. Kane–Mele: time-reversal symmetry and the **Z2** invariant of the occupied
   subspace. This needs its own implementation, not an individual-band Chern
   calculation relabeled Z2.
4. Ribbons: net right-moving minus left-moving crossings at a specified gap
   reference, assigned to a **particular edge/interface**. Summing the opposite
   edges of a finite strip can cancel the chiral count. Test localization and
   exclude additional trivial counterpropagating surface states.

An integer result is necessary in the appropriate gapped Chern problem but is
not a correctness certificate. The [FHS construction](https://arxiv.org/abs/cond-mat/0503172)
can yield an integer for an inadequately resolved mesh or wrongly supplied
eigenvectors. Test gap isolation, overlaps, refinement, known models, and a second
method as well.

Non-Hermitian phononics is a separate milestone. Specify its gap notion and
left/right generalized eigenvectors, test their biorthogonal normalization and
eigenpair residuals, and identify exceptional points. Ordinary Bloch invariants
and ordinary bulk-boundary correspondence can fail with the skin effect;
[biorthogonal/non-Bloch treatments](https://arxiv.org/abs/1805.06492) must match the
actual model. A non-integer output is not a universal detector of these mistakes.

## 5. Constitutive and nonlinear streaming

Reproduce the selected material parameters, geometry, forcing and reversal
observable from the [2026 viscoelastic-streaming preprint](https://arxiv.org/abs/2602.17081)
before adding a correction. Treat its attenuation/shear-wave criterion as a
benchmark-specific prediction, not a universal biological-fluid threshold.

[Dubrovski–Friend–Manor (2023)](https://www.cambridge.org/core/journals/journal-of-fluid-mechanics/article/theory-of-acoustic-streaming-for-arbitrary-reynolds-number-flow/99E10DEB55A6FD78591C928A06CE771D)
includes an **axisymmetric acoustic-horn** case study, not a sharp-edge benchmark.
Reproduce its coupled wave/streaming problem before assigning its name to a fast
streaming solver. Identify any proposed Michelin/Rallabandi benchmark by exact
paper and case; author names alone do not establish equivalent equations.
Matching low- and high-Reynolds-number exponents does not validate an interpolation.

## 6. Crystallography

Use all **122** magnetic point-group types: 32 ordinary, 32 grey, and 58
black-and-white. Time reversal belongs to grey groups independently; in type III
it appears only together with selected spatial operations. Tensor transformation
must specify polar/axial character and **time parity**, not infer them from rank.
See [IUCr Magnetic Group Tables](https://www.iucr.org/publications/iucr/magnetic-group-tables).

The 65 Sohncke groups contain only orientation-preserving rotations, screw
rotations and translations; **no mirrors, glides, inversion or rotoinversion**.
See the [IUCr hierarchy](https://journals.iucr.org/j/issues/2018/05/00/in5013/index.html/in5013fig1.html).
The existing centring/axis table is not yet a full operation-based absence solver.
Require independently sourced fixtures for all 65 groups in explicit settings,
including equivalent cubic directions, negative indices, and enantiomorphic
absence equivalence. Do not add glide rules to Sohncke groups. `P212121` has
axial screw absences; testing those alone does not establish all-group completeness.

## 7. Surrogate reporting

`src/provenance.ts` now orders evidence as
`assumed < surrogate < derived < measured`. A surrogate prediction records its
model identity, predictive variance, domain flag, and input lineage. If assumed
inputs weaken its headline, its surrogate metadata still survives. Derived
arithmetic cannot promote it. JSON parsing rejects concealed weaker provenance.

`assertNoSurrogate` rejects surrogate-dependent final results. The workbench can
inspect such exploratory runs but disables final-result export. This guard does
not prove that any function was an exact solver, or that uncertainty is
calibrated: it enforces the narrower, testable absence of surrogate lineage.

Before a regression module is added, require solver-generated training outputs,
held-out uncertainty calibration, explicit domain/uncertainty fallback tests,
and a final independent evaluation of the selected design with the physics
solver. Attach actual solver inputs to that new result, not the scout prediction
as if it were an input parameter. No helper may "promote" an estimate in place.

## Fixture admission checklist

Each external fixture needs:

1. Full citation and exact equation, table, figure, or archived dataset locator.
2. Geometry, units, material laws, amplitudes, phasor conventions and boundaries.
3. Independently obtained expected values and their extraction uncertainty.
4. A tolerance justified before comparing this implementation's output.
5. A test naming the verified limit, conservation law, or observable.
6. Separate status for theoretical reproduction and experimental validation.

Missing expected values mean **pending fixture**, not a zero-error benchmark.
None of the outstanding physical models or validation claims are included in
this release merely because their references appear here.
