# Resonarium Emergence

Open **`app/resonarium/index.html`**. This extends the actual natal-bedrock /
Biosentinel / Temporal Trace implementation from `astro-aae`, rather than building
another viewer with similar names. It works directly from disk or the repo's
static server; it has no build step, CDN or runtime package dependency.

Choose **Start with demo chart → Sentinel Mode → Replay trajectory**.
The demo button generates and anchors the seed immediately. For a personal seed,
enter chart longitudes and choose **Generate & anchor seed**.
Start audio separately when desired. The trajectory runs visually without audio.
Scrub to inspect an individual pulse; **Rebuild experiment** resets the simulation.
Changes to Sentinel controls rebuild with the current n/k settings. OFF pauses
transport and removes the ghost bank; the bedrock frequencies and gains stay fixed.

This is a feed-forward computational and audiovisual instrument. It does not
measure or control physiology. Coherence R is an order parameter, not physical
energy. The spherical point projection is an artistic encoding of R/ψ; its points
are not measured cells or individual oscillator phase snapshots.

## Use existing chart tones

Paste a `resonarium.state.v2` export into the chart box and click **Anchor chart
or tones**, or select the JSON through **Import state**. Enabled `singles` become
immutable bedrock frequencies with their relative `lvl` values; one enabled
`bins` entry supplies the binaural carrier, beat and relative level. No chart
longitudes need to be reconstructed. Enabled sweeps and multiple binaural pairs
are rejected explicitly rather than silently dropped.

The supplied `natalSeed` is preserved and tagged `provided-uint64`; it is not
claimed to have been derived by BLAKE2b. Safe integer seeds in legacy JSON are
accepted, and larger uint64 values must be decimal strings. Intention text does
not rehash an imported seed. Imported tones remain in memory and are omitted
from export unless the chart/tones export checkbox is selected.

## Integrated layers

- **Bedrock:** the copied Resonarium chart validation, frequency map, binaural
  carrier and immutable natal frequency array.
- **Simulation:** Fibonacci L→LS, S→L; equal-fluence pulse mapping; a single-band
  Kuramoto model; time-weighted pulse-window R and circular mean phase.
- **Overlay:** existing Fibonacci ghost placement, with instantaneous frequency
  displacement driven by ψ and gains driven by R. n selects ghost count and
  model active fraction (at least one model oscillator); k affects model coherence
  and reduces ghost displacement. perturb and spread act on projection only.
- **Observation:** scrubbed K/R/ψ, trajectory chart, spherical point projection,
  Temporal Trace and user-initiated audio.
- **Comparison:** seeded AAFT ensemble, the same oscillator initialization for
  each input, mutual information and a finite-ensemble empirical p-value.

`src/` remains the independent device-physics library. No natal or listening
parameters enter acoustofluidic calculations.

## Units and numerical repairs

Intensity I is **mW/cm²**, time t is **ms**, fluence J₀ is **J/cm²**:

```
I_L = I_ref sqrt(r), I_S = I_ref / sqrt(r)
t_ms = 1,000,000 J0 / I
fluence = I t_ms / 1,000,000
K = min(K_max, kappa I / 1000)
```

The geometric-mean intensity defaults to 1,000 mW/cm². κ acts on W/cm² and is a
hypothetical model parameter. These defaults preserve the old model's approximate
pulse durations and coupling while fixing its mislabeled units. They are not an
exposure prescription. Varying J₀ now changes duration correctly.

The integrator uses a fractional last step instead of dropping residual time.
R is sampled after each step and integrated with time weights. Phase means are
circular; audio interpolation unwraps phase. Small oscillator banks no longer
attempt to activate 32 elements from a smaller population. Mode indices satisfy
|m|≤l; projected frequencies are Hz, not mislabeled light intensities.

## Seed and replay contract

The new seed identifier is **`blake2b-64-be`**:

```
BLAKE2b(UTF8(input), digest_size=8) → unsigned big-endian uint64
```

The browser uses Resonarium's existing canonical chart string plus sanitized
`|intention:...` suffix as the input. The Python CLI hashes its `--intention`
argument verbatim. Use `--seed DECIMAL` with the displayed browser seed for the
same run; a plain intention phrase alone is not the chart's canonical input.
Empty input is also hashed. Every seed in the new JSON contract is a decimal
string, including zero; unsafe numeric seeds are rejected.

The upstream `natal_seed.js` is retained unchanged, including its **legacy SHA-256**
helper. Emergence explicitly calls `Photometabolic.deriveSeed` instead. Legacy
Resonarium state files import parameters only and never reinterpret the old seed.

Both engines implement `portable-mulberry32-boxmuller-v1`, folding the high and
low uint32 seed words with XOR, using mulberry32 uniforms, Box–Muller normals and
Fisher–Yates active-index selection. Folding necessarily permits seed collisions;
the seed is not an identity or security guarantee. Browser/Python seed bytes are
exactly equal. Floating-point trajectories are checked to numerical tolerance,
not claimed bit-identical across JS and NumPy. A saved trajectory is replayed as
stored, so import does not depend on re-simulating it.

Exports contain config, symbols, per-pulse observations, mode projection and
playback position. Raw natal chart/intention are excluded by default, as in the
source viewer. A redacted export cannot reconstruct natal audio on its own:
anchor the matching chart first, or replay its trajectory visually. Optional
chart export does not silently restore chart data on import. Import validates
finite values, pulse invariants, timing, uint64 seeds and work limits before
replacing the session. Export is an exact trajectory/config snapshot; it is not
a record of every prior slider edit or a sample-accurate Web Audio recording.

## Python CLI and interchange

Requires Python 3 and NumPy. `soundfile` is optional; the stdlib WAV fallback works.

```sh
python3 photometabolic_biosentinel_v3_unified.py \
  --seed 7309112606740490464 --depth 9 --surrogates 39 --audio \
  --output artifacts/resonarium
```

- `experiment.json`: import into Emergence for trajectory replay.
- `hologram.json`: legacy `ResonariumHologramState` modes and globals for the
  separate cymatic/spherical viewers. Those viewers' older numeric-seed readers
  may lose precision; use Emergence's experiment contract for seed-safe replay.
- `drone.wav`: optional compressed-time sonification, distinct from the browser's
  natal bedrock + ghost audio. Phase history is unwrapped before interpolation.

`examples/resonarium/experiment.json` is a Python-generated fixture for the public
Resonarium demo chart plus “clarity”, at depth 7. Load it through **Import state**.
Its browser reconstruction is checked in the test suite.
The JSON Schema is `docs/resonarium/experiment.schema.json`. Runtime validation
also checks relational constraints (fluence and time) that JSON Schema cannot.

## What the comparison means

AAFT first rank-maps the binary input to Gaussian samples, breaks symbol ties
using the seeded PRNG, randomizes conjugate Fourier phases and rank-maps back to
the original binary amplitude distribution. Symbol counts are exact; the spectrum
after the final mapping is only approximate, especially for binary inputs.

The decoder marks relative R increases above 1.015; it is not proven
composition-invariant. MI compares that output with the corresponding symbols.
Each surrogate starts with the same oscillator phases, frequencies, active set
and model settings as the original input. The comparison is conditional on that
initialization and does not establish general behavior across seeds.

The one-sided Monte Carlo p-value is `(1 + count(surrogate MI >= true MI))/(B+1)`.
Comparisons treat differences within 1e-12 bits as ties to avoid ranking numerical
roundoff as evidence. 39 surrogates resolve no smaller than 0.025. A zero ensemble standard deviation
produces a null σ-gap rather than an artificial huge score. No PASS/FAIL claim
of “structural information present” or “no information beyond spectral content”
is made. Multiple tested settings/seeds require their own statistical treatment.
The browser comparison caps depth at 9 and reports the actual comparison config.

## Verification

```sh
npm test
npm run typecheck
npm run build
python3 -m unittest discover -s test/python
```

Tests cover BLAKE2b vectors (including UTF-8 and multi-block inputs), browser/Python
trajectory parity, non-unit doses, residual integration time, surrogate replay and
composition, mode indices, import rejection, OFF identity and fallback WAV export.

The optional `test/resonarium.browser.mjs` end-to-end check uses an installed
Playwright module (set `PLAYWRIGHT_MODULE` to its `index.mjs`, and optionally
`CHROMIUM_PATH`). It exercises audio OFF identity, replay, redacted export/import,
malformed input rejection, offline loading and mobile width. Browser screenshots
and the exported round-trip fixture are saved to a temporary directory.

See [source attribution](resonarium/SOURCE.md) for the imported files and license.
