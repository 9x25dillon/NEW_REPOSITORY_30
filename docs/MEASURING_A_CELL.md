# Measuring a cell

`config/subject.ts` holds literature defaults for a generic mammalian cell. This
is how they get replaced with numbers that are actually about your cells.

Nothing in this repository can perform the measurement. What it can do is turn
the video you record into density and compressibility, and tell you when the run
was no good.

---

## What you are measuring, and why one run is not enough

Every acoustic prediction here depends on the **acoustic contrast factor**:

```
Φ = f₁/3 + f₂/2      f₁ = 1 − κ_p/κ_f      f₂ = 2(ρ_p − ρ_f)/(2ρ_p + ρ_f)
```

Φ is one number containing two unknowns. Measuring it in a single medium
constrains a *curve* in the (ρ, κ) plane and pins neither coordinate. So the
measurement is repeated in media of different density — iodixanol or Percoll,
which move ρ_f substantially while barely touching κ_f — and the curves are
intersected.

**Two media is the minimum. Three or more lets the fit report a residual**, which
is the only thing that will tell you a run went wrong. `propertiesFromContrasts`
refuses a single measurement rather than inventing whichever coordinate you
didn't think to question.

## What you need

- A BAW chip with a known channel width, driven at its half-wavelength resonance
  (`bawResonance` gives the frequency; tune to the measured peak).
- A microscope with video at a known frame rate, and a way to convert pixels to
  metres.
- Polystyrene calibration beads, 5–10 µm, narrow size distribution.
- Your cells, in ≥ 3 media of different density. Measure each medium's density
  and sound speed — do not assume the supplier's.
- Cell radii from the same images. Φ does not depend on radius, but the rate
  constant does, as *a²*.

## The procedure

**1 · Calibrate the pressure amplitude.** You cannot read p_a off a signal
generator: it depends on the coupling, the chip, the temperature and the exact
drive frequency. So measure it with the beads, whose properties are known.

```ts
const { amplitude, r2 } = amplitudeFromTrack(beadTrack, field, {
  ...POLYSTYRENE, radius: measuredBeadRadius,
});
```

Do this **in the same chip, in the same session, without touching the drive**
between calibration and cells. If `r2` is below ~0.98 the beads were not
following the model — look for streaming, a wall collision, or a chip that is
off resonance.

**2 · Track cells focusing, in each medium.** Switch the field on and record
until the cells reach the centre line. Positions are measured **from a wall**,
which is a pressure antinode in a resonant channel.

```ts
const fit = contrastFromTrack(cellTrack, { ...field, amplitude }, cellRadius);
```

The fit is a straight line: `ln|tan(k·u)| = ln|tan(k·u₀)| + 2kA·t`. That is why
it needs no initial guess and why `r2` is meaningful — a cell that is not
following the model produces a visibly curved log-plot, not a slightly worse
number.

Points within 5% of either equilibrium are discarded automatically. At the wall
`tan(k·u)` is zero and its log diverges; at the centre line `tan` diverges
outright. Both are features of the coordinate, and a cell spends most of its
run parked at the centre, so including those frames would let the least
informative part of the video dominate the fit.

**3 · Intersect.**

```ts
const props = propertiesFromContrasts([
  { medium: pbs,        phi: phiInPbs },
  { medium: iodixanol12, phi: phiIn12 },
  { medium: iodixanol24, phi: phiIn24 },
]);
// → { rho, kappa, c, residual }
```

**Read the residual.** It is RMS disagreement between media in units of Φ.
Compare it against the scatter of your own repeats: a residual much larger than
your repeat scatter means one medium disagrees with the others, and averaging
would bury that rather than reveal it.

## Traps

- **Sub-micron particles.** Radiation force goes as *a³*, streaming drag as *a*,
  so their ratio goes as *a²* and below roughly 1–2 µm streaming wins and the
  trap stops holding. Cells at 5–10 µm are safely above it; debris is not, and
  will not follow the model.
- **A reference near its iso-acoustic point** calibrates nothing — it barely
  moves, and the amplitude inferred from it is dominated by tracking error.
  `amplitudeFromTrack` refuses below |Φ| = 0.01.
- **Temperature.** Both ρ_f and c_f drift with it, and the resonance moves with
  c_f. Record it; a degree matters more than it looks.
- **Cells are not spheres and not identical.** Φ from one cell is that cell.
  Measure a population and report a distribution, not a number. The config file
  takes one value because the model takes one value, and that flattening is
  itself an approximation worth stating in anything you publish.

## Then update the config

Replace `BIOLOGY` in `config/subject.ts` with the fitted values and rewrite
`provenance` to say what was measured, in which media, on what date, and with
what residual. The field exists to be a citation, not a label.

Until then, every trap position this repository computes is an order-of-magnitude
sketch — correct in its physics and unverified in its inputs.
