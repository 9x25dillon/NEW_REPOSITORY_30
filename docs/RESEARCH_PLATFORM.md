# Research platform: first implementation

This release adds a reproducible standing-wave benchmark, finite-size scattering,
and independent fluid advection. It does **not** establish a validated device
model over the entire 1–200 MHz band. Input provenance, numerical convergence,
and physical model validity are separate outputs.

The [external benchmark requirements](BENCHMARK_REQUIREMENTS.md) specify the
reference problems, outstanding fixtures, and evidence needed for future claims.

## Run it

```sh
npm run build
python3 -m http.server 8099
```

Open `http://localhost:8099/app/simulation.html`. The workbench loads
[`examples/standing-wave.json`](../examples/standing-wave.json), runs the same
modules as the tests, plots the trajectory, and exports either the description
or the complete run with diagnostics. Open a **description** to reproduce a run;
the complete result includes that description under `description`.

The existing Device screen retains its BAW/SSAW Gor'kov model and now displays
a size assessment. It does not substitute a plane-wave Mie model for a leaky
SAW field. The size assessment uses frequency and fluid/particle sound speeds,
not the lateral IDT wavelength.

Programmatic use:

```ts
import { readFileSync } from "node:fs";
import { parseSimulation, runSimulation, serializeSimulation } from "../src/pipeline.js";

const spec = parseSimulation(readFileSync("examples/standing-wave.json", "utf8"));
const result = runSimulation(spec);
const portableDescription = serializeSimulation(result.description);
console.log(result.trajectory.provenance, result.diagnostics);
```

All lengths are metres, densities kg/m³, speeds m/s, frequencies Hz, pressures
Pa, viscosities Pa s, phases radians, and times seconds. `radius` is a radius.

## Radiation: `src/mie.ts`

Scope: a homogeneous, lossless **fluid sphere** in an unbounded inviscid fluid,
illuminated by a prescribed plane standing wave. It omits particle shear
elasticity, thermal/viscous scattering, absorption, walls, multiple scattering,
and deformation. A generic cell's density and sound speed do not validate these
assumptions for a real cell.

Conventions: pressure phasors use `exp(-i omega t)`; the incident pressure is
`p_a cos(kz + phase)`; scattered waves use outgoing spherical Hankel functions.
Pressure and normal velocity continuity give, with `x=ka`, `y=ka c_f/c_p`, and
`eta=rho_f c_f/(rho_p c_p)`:

```text
A_n = j_n'(x) j_n(y) - eta j_n(x) j_n'(y)
B_n = y_n'(x) j_n(y) - eta y_n(x) j_n'(y)
s_n = -A_n / (A_n + i B_n)
```

Here `y_n` is a spherical Neumann function, not the internal size parameter.
The standing-wave force is:

```text
F(z) = [pi p_a² / (rho_f c_f² k²)] sin(2(kz+phase))
       sum_n (-1)^(n+1) (n+1) Im[s_n - s_(n+1) + 2 s_n conj(s_(n+1))]
```

The coefficient convention and surface momentum-flux approach follow the
[arbitrary-beam radiation-force formulation](https://pmc.ncbi.nlm.nih.gov/articles/PMC3574112/).
The standing-wave specialization above follows by expanding the incident cosine.
The [fluid-sphere partial-wave treatment](https://arxiv.org/abs/1210.2116)
provides the broader scattering framework.

`mieForceAmplitude(particle, medium, k, pressure)` returns the signed amplitude,
Rayleigh amplitude, size parameter, cutoff, and successive-cutoff change.
`mieForce(z, particle, medium, k, pressure, phase)` returns force in newtons.
`rayleighLimit(...)` returns the same-convention Gor'kov amplitude.

Numerical domain: **both** internal and external size parameters must lie in
`[1e-4, 100]`. Miller downward recurrence computes spherical Bessel functions;
an upward recurrence computes Neumann functions. The solver checks two successive
cutoff extensions and throws if convergence or coefficient evaluation fails.
The cutoff difference is an estimate, not a certified tail bound. No tiny-size
fallback silently changes the solver to Gor'kov.

Validation includes:

- Positive and negative contrast Gor'kov limits, with quadratic relative error.
- An independent Taylor benchmark: for equal densities and `c_p=2c_f`,
  `F/F_G = 1 - 0.7(ka)² + O((ka)^4)`.
- Zero contrast, zero drive, pressure-squared scaling, periodicity, odd symmetry.
- Lossless identity `Re(s_n) = -|s_n|²` for every tested partial wave.
- Force agreement with direct surface-stress quadrature at two enclosing radii.
  That calculation shares scattering coefficients but not the force-sum formula;
  it is an independent force check, not an independent complete scattering solver.

Finite-size corrections can decrease, increase, or reverse force. The reported
comparison is `(F_Mie - F_G)/|F_G|`; it is null when the denominator vanishes.
It is a comparison between two models, not an experimental error estimate.

## Streaming: `src/streaming.ts`

`rayleighStreaming(channel, x, y)` solves the outer, incompressible Stokes
boundary-value problem between infinite parallel plates at `y=±h`, using slip
`S sin(2kx+2phase)`, with `S=-3[p_a/(rho c)]²/(8c)` for this pressure convention.
The streamfunction is `psi=S sin(2kx+2phase) f(y)`:

```text
q = 2k; Q = qh
f(y) = [sinh(Q) y cosh(qy) - h cosh(Q) sinh(qy)] / [sinh(Q) cosh(Q) - Q]
u_x = d_y psi; u_y = -d_x psi
```

This is exact for the specified **slip-driven Stokes problem**. The slip itself
is an acoustic boundary-layer approximation. It is not a resolved inner-layer
solution or a finite rectangular-channel solver with side walls. The underlying
parallel-plate acoustophoretic benchmark is described by
[Barnkob et al. (2012)](https://bme.lth.se/fileadmin/user_upload/Publications/12_PhysRevE_Barnkob.pdf).

For `Q<0.01`, a Taylor expansion through `Q^4` avoids cancellation, with omitted
terms of order `Q^6`; tests check continuity with the hyperbolic expression. The
large-argument implementation is restricted to `Q≤100`. Thin-layer and Reynolds
screens do not provide a quantified physical model-error bound.

Tests check slip, impermeability, parity, zero net flux, the thin-channel
parabolic limit, and independent finite-difference continuity and Stokes
vorticity residuals. The pipeline uses **midplane trajectories only**, where the
transverse flow is zero by symmetry. A phase ramp with Rayleigh streaming is
rejected; a quasi-steady moving streaming pattern has not been validated.

`eckartBodyForce(x, pressure, alpha, medium)` computes momentum deposition
`2 alpha I(x)/c`, with **pressure** attenuation coefficient `alpha` in 1/m.
It is tested against the derivative of the momentum flux. It returns N/m³,
not a flow velocity. Boundaries and pressure constraints are needed to turn it
into a streaming flow; a standalone "Eckart speed" is not implemented.

`trajectory.integrate` now accepts a separate `streamingVelocity(t,x)` callback
and an optional radiation-force callback. Existing callers keep their behavior.
Zero streaming recovers the independently tested closed form; zero radiation
follows prescribed fluid motion. Integration controls and nonfinite results
are checked at runtime.

## Reproducibility and diagnostics: `src/pipeline.ts`

The schema fixes a plane standing wave, sphere, fluid, viscosity, radiation
choice, streaming choice, and initial conditions. Supported streaming choices:
`none`, `uniform` with a tagged velocity, and `rayleigh-midplane` with a tagged
half-height. A uniform flow is prescribed input, not solver-generated streaming.

Every stage has tagged inputs and derived output: field, force amplitude, drag
coefficient, fluid advection, and trajectory. An assumed streaming input weakens
trajectory provenance without changing radiation provenance. Model assumptions
remain separate: even entirely measured inputs do not validate a model.

Surrogate predictions now have a distinct `surrogate` provenance below `derived`,
with model identity, predictive variance, domain flag, and retained input lineage.
Assumed inputs remain weaker; they do not erase the surrogate annotation.
`assertNoSurrogate` prevents final reporting of a result that still depends on an
estimate. The workbench disables final-result export for that case. No surrogate
regression model or uncertainty-calibration implementation is included yet.

The parser rejects unsupported schema/engine versions, unknown fields/model
kinds, nonfinite numbers, functions, invalid integration controls, and provenance
trees that promote assumed inputs or label computed values measured. The solver
snapshots inputs rather than retaining references to caller-owned objects.

RK4 runs with `steps` and `2*steps`; the finer trajectory is returned. The maximum
matching-time discrepancy divided by 15 estimates fine-grid error in the
fourth-order regime. A conservative time-resolution screen also gates the
reported tolerance result. Neither screen is a rigorous error bound. Failed
tolerance results remain inspectable and carry a visible workbench warning.

Reports also expose size parameters, acoustic amplitude warnings, boundary-layer
thickness ratio, streaming and particle Reynolds scales, and particle momentum
relaxation time. Unknown model error bounds are **null**, never zero.

Tests assert identical complete results after JSON round trip in the same
runtime. Preserve the source revision and runtime for archival reproducibility:
JSON and the engine version alone do not guarantee bitwise agreement across
different JavaScript math libraries or future implementations. Bump the engine
version when changing equations, defaults, or numerical algorithms.

## Next milestones

These are outstanding work, not capabilities hidden behind placeholder APIs:

1. Thermoviscous/elastic sphere benchmarks and wall corrections; calibrated data
   to test physical accuracy, beyond numerical verification.
2. Resolved inner streaming layers, side walls, and an Eckart flow boundary-value
   problem; then separately specified sharp-edge and bubble problems.
3. Angular-spectrum propagation with sampling tests and pressure/velocity fields;
   phase retrieval must report residuals and cannot promise arbitrary traps.
4. Complex generalized eigenvectors and a known topological model before phononic
   FHS/Wilson/ribbon claims. Count net chiral edge crossings, not all in-gap states.
5. Reproduce the published viscoelastic and nonlinear-streaming benchmark problems
   before introducing constitutive corrections or approximate interpolation.
6. Complete space-group operations and absence fixtures; magnetic tensor time
   parity and the full 122-group family. Sohncke groups have no glide planes.
7. Surrogate exploration only after expensive validated solvers justify it:
   calibrated uncertainty, out-of-domain checks, and final solver re-evaluation.

No universal streaming reversal, arbitrary-Reynolds-number blending law,
topological device protection, full crystallographic extension, or surrogate
model is claimed by this release.
