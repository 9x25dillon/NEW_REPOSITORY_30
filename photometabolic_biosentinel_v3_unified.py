#!/usr/bin/env python3
"""Photometabolic Biosentinel — Resonarium Emergence model.

Fibonacci symbols -> equal-fluence pulses -> hypothetical Kuramoto transduction
-> observable trajectory -> listening/visual projection. Not measured physiology.
Seed: BLAKE2b(digest_size=8), unsigned big-endian uint64.
The differential decoder is a heuristic, not proven composition-invariant.
Surrogates preserve symbol composition, but only approximate spectral structure.
See docs/RESONARIUM_EMERGENCE.md for units, replay, and statistical limitations.
"""

from __future__ import annotations
import json
import hashlib
import time
import argparse
import math
import wave
from pathlib import Path
from dataclasses import dataclass, field
from typing import List, Tuple, Dict, Optional, Iterator
from collections import Counter
import numpy as np

PHI = 1.618033988749895

# Optional audio (graceful if missing)
try:
    import soundfile as sf
    HAS_SOUNDFILE = True
except ImportError:
    HAS_SOUNDFILE = False

# ============================================================================
# 0. NATAL / INTENTION SEED  (bridge to Resonarium)
# ============================================================================

def derive_seed(text: str = "") -> int:
    """BLAKE2b digest_size=8, UTF-8 input, unsigned big-endian uint64."""
    h = hashlib.blake2b(text.encode("utf-8"), digest_size=8).digest()
    return int.from_bytes(h, "big")


class PortableRandom:
    """mulberry32 with xor-folded uint64 seed; matches photometabolic.js v1."""
    def __init__(self, seed):
        if not isinstance(seed, int) or not 0 <= seed < 2**64:
            raise ValueError("seed must be an unsigned 64-bit integer")
        self.a = (seed ^ (seed >> 32)) & 0xffffffff

    def random(self):
        self.a = (self.a + 0x6d2b79f5) & 0xffffffff
        t = ((self.a ^ (self.a >> 15)) * (self.a | 1)) & 0xffffffff
        t ^= (t + (((t ^ (t >> 7)) * (t | 61)) & 0xffffffff)) & 0xffffffff
        return ((t ^ (t >> 14)) & 0xffffffff) / 4294967296

    def normal(self):
        return math.sqrt(-2 * math.log(max(self.random(), 1 / 4294967296))) * math.cos(2 * math.pi * self.random())


# ============================================================================
# 1. FIBONACCI SYMBOL ENGINE  [L0]  (enhanced with seedable start)
# ============================================================================

@dataclass
class FibonacciEngine:
    """
    Unitless combinatorial layer.
    L → LS, S → L.  Substitution matrix [[1,1],[1,0]].
    Eigenvalues τ ≈ 1.618, −1/τ.  Pisot.  Pure-point diffraction.
    """
    start: str = "L"
    seed: int = 0

    def __post_init__(self):
        if self.start not in ("L", "S"):
            raise ValueError("start must be L or S")
        if self.seed:
            # Seed influences the start deterministically.
            rng = PortableRandom(self.seed)
            self.start = "L" if rng.random() < 0.7 else "S"

    def generate(self, depth: int) -> str:
        if not isinstance(depth, int) or not 0 <= depth <= 12:
            raise ValueError("depth must be an integer from 0 to 12")
        seq = self.start
        for _ in range(depth):
            seq = "".join("LS" if ch == "L" else "L" for ch in seq)
        return seq

    def stream(self, depth: int) -> Iterator[str]:
        for ch in self.generate(depth):
            yield ch

    def length(self, depth: int) -> int:
        return len(self.generate(depth))


# ============================================================================
# 2. ISODOSE MAPPER  [L1]  (strict fluence invariant)
# ============================================================================

@dataclass
class IsodoseMapper:
    """
    Maps symbol → (intensity mW/cm², duration ms) with fixed total fluence J0.
    L and S differ only in the TIME–INTENSITY trade-off.
    """
    J0: float = 1.0          # J/cm² per symbol (isodose invariant)
    ratio: float = 2.0       # I_L / I_S, model range 1–5
    intensity_mw: float = 1000.0  # geometric mean intensity, mW/cm²

    def __post_init__(self):
        if not all(np.isfinite(v) and v > 0 for v in (self.J0, self.intensity_mw, self.ratio)):
            raise ValueError("pulse parameters must be finite and positive")
        if self.ratio <= 1.0:
            raise ValueError("ratio must be > 1 for distinguishable symbols")
        if self.ratio > 5.0:
            raise ValueError("ratio must be <= 5")

    def symbol_to_pulse(self, ch: str) -> Tuple[float, float]:
        """Return (intensity mW/cm², duration ms). Enforces I[mW/cm²] * t[ms] / 1e6 = J0[J/cm²]."""
        if ch == "L":
            I = self.intensity_mw * np.sqrt(self.ratio)
            t = 1e6 * self.J0 / I
        elif ch == "S":
            I = self.intensity_mw / np.sqrt(self.ratio)
            t = 1e6 * self.J0 / I
        else:
            raise ValueError(f"unknown symbol {ch}")
        # Exact isodose
        fluence = I * t / 1e6
        assert np.isclose(fluence, self.J0, rtol=1e-6), "isodose violation"
        return float(I), float(t)


# ============================================================================
# 3. KURAMOTO MODEL FIELD [L2]
# ============================================================================

@dataclass
class KuramotoField:
    """
    Enhanced Kuramoto oscillator bank.
    - Mean-field reduction for speed
    - Fixed hypothetical transduction κ; n selects active count and k adds phase pull
    - One seeded intrinsic-frequency distribution, not measured metabolic bands
    - Order parameter R, ψ exported for Resonarium visual/audio
    """
    N: int = 256
    kappa: float = 0.012          # transduction per W/cm² [L2]
    K_max: float = 12.0
    omega_std: float = 0.45
    dt: float = 0.008
    seed: int = 0
    n_entropy: float = 12.0       # Biosentinel n → density of active oscillators
    k_lock: float = 0.65          # Biosentinel k → pull toward coherence

    theta: np.ndarray = field(init=False)
    omega: np.ndarray = field(init=False)
    t: float = field(init=False, default=0.0)
    t_history: List[float] = field(init=False, default_factory=list)
    R_history: List[float] = field(init=False, default_factory=list)
    psi_history: List[float] = field(init=False, default_factory=list)

    def __post_init__(self):
        if not isinstance(self.N, int) or not 2 <= self.N <= 256:
            raise ValueError("N must be an integer from 2 to 256")
        for value, low, high in ((self.dt, .001, .05), (self.kappa, 0, 10),
                                (self.K_max, 0, 12), (self.omega_std, 0, 3),
                                (self.n_entropy, 0, 64), (self.k_lock, 0, 1)):
            if not np.isfinite(value) or not low <= value <= high:
                raise ValueError("invalid field parameter")
        rng = PortableRandom(self.seed)
        base = 0.35 + 0.15 * (self.seed % 7) / 7.0
        self.omega = np.array([base + self.omega_std * rng.normal() for _ in range(self.N)])
        self.theta = np.array([rng.random() * 2 * np.pi - np.pi for _ in range(self.N)])
        indices = list(range(self.N))
        for i in range(self.N - 1, 0, -1):
            j = int(rng.random() * (i + 1))
            indices[i], indices[j] = indices[j], indices[i]
        count = min(self.N, max(1, int(self.N * min(1, self.n_entropy / 25))))
        self.active_indices = indices[:count]
        self.active_mask = np.zeros(self.N, dtype=bool)
        self.active_mask[self.active_indices] = True

    def step(self, K: float, dt: Optional[float] = None) -> Tuple[float, float]:
        """Euler step, including fractional final steps; report the updated state."""
        dt = self.dt if dt is None else dt
        if not np.isfinite(dt) or not 0 < dt <= self.dt or not np.isfinite(K) or K < 0:
            raise ValueError("invalid integration step")
        K_eff = min(K * (0.7 + 0.3 * self.k_lock), self.K_max)
        R, psi = self.order_parameter()
        self.theta += dt * (self.omega + (K_eff * R + .15 * self.k_lock) * np.sin(psi - self.theta))
        self.theta = np.arctan2(np.sin(self.theta), np.cos(self.theta))
        self.t += dt
        R, psi = self.order_parameter()
        self.t_history.append(self.t)
        self.R_history.append(R)
        self.psi_history.append(psi)
        return R, psi

    def order_parameter(self) -> Tuple[float, float]:
        z = np.mean(np.exp(1j * self.theta[self.active_indices]))
        return float(np.abs(z)), float(np.angle(z))

    def phase_snapshot(self) -> np.ndarray:
        return self.theta.copy()


# ============================================================================
# 4. UNIFIED BIOSENTINEL ENGINE  (the integrated core)
# ============================================================================

@dataclass
class PhotometabolicBiosentinel:
    """
    Feed-forward simulated Photometabolic + Resonarium engine.

    This is a computational mapping/sonification model, not a validated medical
    or physiological control instrument.

    Flow:
      Fibonacci stream → isodose pulses → K(t) → Kuramoto → R(t), ψ(t)
      → differential transitions → acoustic synthesis → JSON export
        for spherical / cymatic / nodal visualization.
    """
    fib: FibonacciEngine
    mapper: IsodoseMapper
    field: KuramotoField
    log: List[Dict] = field(default_factory=list)
    audio_sr: int = 22050

    def run(self, depth: int = 9, verbose: bool = True) -> Dict:
        """Append one Fibonacci experiment. Construct a fresh engine to replay."""
        return self.run_symbols(self.fib.generate(depth), verbose)

    def run_symbols(self, symbols: str, verbose: bool = False) -> Dict:
        if not symbols or len(symbols) > 377 or set(symbols) - {"L", "S"}:
            raise ValueError("expected 1–377 L/S symbols")
        estimated_steps = sum(self.mapper.symbol_to_pulse(ch)[1] / 1000 / self.field.dt for ch in symbols)
        if estimated_steps * self.field.N > 1e8:
            raise ValueError("experiment exceeds work budget")
        for ch in symbols:
            I, t_ms = self.mapper.symbol_to_pulse(ch)
            # kappa is per W/cm²; intensity is exported in mW/cm².
            K = min(self.field.kappa * I / 1000, self.field.K_max)
            duration, start = t_ms / 1000, self.field.t
            remaining, integral, real, imag = duration, 0., 0., 0.
            while remaining > 1e-12:
                dt = min(self.field.dt, remaining)
                R, psi = self.field.step(K, dt)
                integral += R * dt
                real += np.cos(psi) * dt
                imag += np.sin(psi) * dt
                remaining -= dt
            self.field.t = start + duration
            self.log.append({"index": len(self.log), "symbol": ch, "intensity": I,
                "duration_ms": t_ms, "fluence": I * t_ms / 1e6, "K": K,
                "R_mean": integral / duration, "psi": float(np.arctan2(imag, real)), "t": self.field.t})
        if verbose:
            print(f"[Biosentinel] {len(symbols)} symbols; t={self.field.t:.3f} s")
        return self.to_arrays()

    def experiment_state(self, depth: int = 9, falsification=None) -> Dict:
        c = {"N": self.field.N, "depth": depth, "J0": self.mapper.J0,
             "ratio": self.mapper.ratio, "intensity_mw": self.mapper.intensity_mw,
             "kappa": self.field.kappa, "K_max": self.field.K_max, "dt": self.field.dt,
             "n": self.field.n_entropy, "k": self.field.k_lock, "omega_std": self.field.omega_std}
        return {"schema": "ResonariumBiosentinelExperiment", "version": 1,
                "seed": str(self.field.seed), "seedAlgorithm": "blake2b-64-be",
                "engine": "portable-mulberry32-boxmuller-v1", "config": c,
                "units": {"intensity": "mW/cm2", "duration_ms": "ms", "fluence": "J/cm2", "t": "s", "K": "model units"},
                "symbols": "".join(r["symbol"] for r in self.log), "trajectory": self.log,
                "modes": self.projection_modes(), "falsification": falsification}

    def projection_modes(self):
        return [{"freq": float(144 + r["K"]*18 + r["R_mean"]*90), "l": 1+i%7,
                 "m": i % (2*(1+i%7)+1) - (1+i%7), "amplitude": float(.12+.45*r["R_mean"]),
                 "phase": r["psi"], "family": "biosentinel", "on": True,
                 "visualFreq": min(2.5, float(.4+r["K"]*.08))} for i,r in enumerate(self.log[-12:])]

    def to_arrays(self) -> Dict[str, np.ndarray]:
        if not self.log:
            return {}
        # Only include keys that actually exist in the log entries
        sample = self.log[0]
        keys = [k for k in ["index", "intensity", "duration_ms", "fluence", "K", "R_mean", "psi", "t"] if k in sample]
        return {k: np.array([row.get(k, 0.0) for row in self.log]) for k in keys}

    # ------------------------------------------------------------------
    # Differential decoder (relative-change heuristic)
    # ------------------------------------------------------------------
    def differential_decode(self, eps: float = 0.015) -> str:
        R = self.to_arrays().get("R_mean", np.array([]))
        if len(R) < 2:
            return ""
        out = []
        for i in range(1, len(R)):
            ratio = R[i] / max(R[i - 1], 1e-9)
            out.append("+" if ratio > 1 + eps else "-")
        return "".join(out)

    # ------------------------------------------------------------------
    # Acoustic readout: phase-wrap → polyphonic drone
    # ------------------------------------------------------------------
    def synthesize_audio(self, duration_s: float = 8.0, filename: str = "biosentinel_drone.wav") -> Optional[str]:
        """
        Map ψ(t) and R(t) into a rich drone.
        Phase history becomes carrier modulation; R modulates amplitude and brightness.
        """
        if not np.isfinite(duration_s) or not 0 < duration_s <= 600:
            raise ValueError("audio duration must be in (0, 600] seconds")
        if not self.field.psi_history:
            print("No field history – run() first.")
            return None

        psi = np.unwrap(np.array(self.field.psi_history))
        R = np.array(self.field.R_history)
        t = np.linspace(0, duration_s, int(self.audio_sr * duration_s), endpoint=False)

        # Interpolate field history onto audio timeline
        source_time = np.array(self.field.t_history)
        source_time = (source_time - source_time[0]) / max(source_time[-1] - source_time[0], 1e-12) * duration_s
        psi_i = np.interp(t, source_time, psi)
        R_i = np.interp(t, source_time, R)

        # Multi-partial synthesis driven by order parameter
        audio = np.zeros_like(t)
        base_freq = 110.0 + 40.0 * (self.fib.seed % 5) / 5.0   # natal-influenced root

        for harm, amp_scale in [(1, 0.55), (2, 0.28), (3, 0.15), (PHI, 0.12), (PHI**2, 0.08)]:
            freq = base_freq * harm
            # Phase modulation from ψ + amplitude envelope from R
            phase = 2 * np.pi * freq * t + 1.8 * psi_i * harm
            env = 0.15 + 0.85 * (R_i ** 1.4)
            audio += amp_scale * env * np.sin(phase)

        # Soft saturation
        audio = np.tanh(audio * 1.4) * 0.65
        audio = audio.astype(np.float32)

        Path(filename).parent.mkdir(parents=True, exist_ok=True)
        if len(audio) > 2:
            fade = min(int(self.audio_sr * .03), len(audio) // 2)
            audio[:fade] *= np.linspace(0, 1, fade)
            audio[-fade:] *= np.linspace(1, 0, fade)
        if HAS_SOUNDFILE:
            sf.write(filename, audio, self.audio_sr)
            print(f"[Audio] Wrote {filename} ({duration_s:.1f}s)")
            return filename
        else:
            with wave.open(str(filename), "wb") as wav:
                wav.setnchannels(1)
                wav.setsampwidth(2)
                wav.setframerate(self.audio_sr)
                wav.writeframes((np.clip(audio, -1, 1) * 32767).astype("<i2").tobytes())
            return filename

    # ------------------------------------------------------------------
    # Resonarium-compatible JSON export
    # ------------------------------------------------------------------
    def export_resonarium_state(self, path: str = "biosentinel_resonarium_state.json") -> str:
        """
        Produce a JSON payload that the Cymatic Nodal 4D / Spherical Harmonic
        visualizer can ingest (schema compatible with earlier Resonarium exports).
        """
        arrs = self.to_arrays()
        symbols = "".join(row["symbol"] for row in self.log)
        modes = self.projection_modes()

        state = {
            "schema": "ResonariumHologramState",
            "version": "3.0.0-emergence",
            "created": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "natalSeed": str(self.fib.seed),
            "seedAlgorithm": "blake2b-64-be",
            "biosentinel": {
                "n": self.field.n_entropy,
                "k": self.field.k_lock,
                "perturb": 0.03,
                "kappa": self.field.kappa,
                "J0": self.mapper.J0,
                "ratio": self.mapper.ratio,
            },
            "globals": {
                "deform": 0.18 + 0.22 * float(np.mean(arrs["R_mean"])) if len(arrs.get("R_mean", [])) else 0.24,
                "timescale": 0.7,
                "rotation4d": 0.25 + 0.2 * float(np.std(arrs.get("K", [0]))),
                "threshold": 0.14,
                "persistence": 0.96,
                "links": 120,
            },
            "modes": modes,
            "cliFrequencies": [m["freq"] for m in modes[:9]],
            "summary": {
                "symbols": symbols[:64],
                "R_mean_final": float(arrs["R_mean"][-1]) if len(arrs.get("R_mean", [])) else 0,
                "K_range": [float(arrs["K"].min()), float(arrs["K"].max())] if len(arrs.get("K", [])) else [0, 0],
                "meanCoherence": float(np.mean(arrs.get("R_mean", [0]))),
            },
            "compat": {
                "resonarium_biosentinel_cli": True,
                "cymatic_nodal_4d": True,
                "spherical_harmonic": True,
                "imports": ["sweeps", "bins", "singles", "modes", "biosentinel"],
            },
        }

        Path(path).parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w") as f:
            json.dump(state, f, indent=2)
        print(f"[Export] Resonarium state written → {path}")
        return path


# ============================================================================
# 5. AAFT SURROGATE + FALSIFICATION  (retained & hardened)
# ============================================================================

def aaft_surrogate(symbols: str, rng: Optional[np.random.Generator] = None) -> str:
    """AAFT with seeded random tie breaking for the binary input.

    Rank-Gaussianize, randomize Fourier phases, then restore symbol counts.
    Final rank mapping perturbs the spectrum; the spectral null is approximate.
    """
    arr = np.array([1.0 if s == "L" else 0.0 for s in symbols])
    rng = rng or np.random.default_rng(0)
    n = len(arr)
    if n < 4:
        return symbols

    gaussian = np.sort([math.sqrt(-2*math.log(max(rng.random(), 1/4294967296))) *
                        math.cos(2*math.pi*rng.random()) for _ in range(n)])
    ties = [rng.random() for _ in range(n)]
    order = sorted(range(n), key=lambda i: (arr[i], ties[i], i))
    gaussianized = np.empty(n)
    gaussianized[order] = gaussian
    fft = np.fft.fft(gaussianized)
    mag = np.abs(fft)
    phases = np.angle(fft)

    new_phases = phases.copy()
    for i in range(1, (n + 1) // 2):
        new_phases[i] = (rng.random()*2-1)*np.pi
        new_phases[-i] = -new_phases[i]

    fft_surr = mag * np.exp(1j * new_phases)
    arr_surr = np.fft.ifft(fft_surr).real

    sorted_orig = np.sort(arr)
    ranks = np.argsort(np.argsort(arr_surr, kind="stable"), kind="stable")
    arr_final = sorted_orig[ranks]
    return "".join("L" if v > 0.5 else "S" for v in arr_final)


def mutual_information(a: str, b: str) -> float:
    if len(a) != len(b):
        raise ValueError("length mismatch")
    n = len(a)
    joint = Counter(zip(a, b))
    mx = Counter(a)
    my = Counter(b)
    mi = 0.0
    for (x, y), c in joint.items():
        pxy = c / n
        px = mx[x] / n
        py = my[y] / n
        if px > 0 and py > 0:
            mi += pxy * np.log2(pxy / (px * py))
    return mi


def run_falsification(
    depth: int = 9,
    n_surrogates: int = 40,
    seed: int = 42,
    n_entropy: float = 14.0,
    k_lock: float = 0.7,
    model_config: Optional[Dict] = None,
) -> Dict:
    """
    Conditional AAFT comparison, not a claim of detected physical structure.
    True MI vs AAFT-surrogate ensemble under identical isodose + Kuramoto channel.
    """
    if not isinstance(n_surrogates, int) or not 1 <= n_surrogates <= 199:
        raise ValueError("n_surrogates must be from 1 to 199")
    if not isinstance(depth, int) or not 1 <= depth <= 9:
        raise ValueError("falsification depth must be from 1 to 9")
    c = {"N": 64, "J0": 1, "ratio": 2.2, "intensity_mw": 1000, "kappa": .011,
         "K_max": 12, "dt": .008, "n": n_entropy, "k": k_lock, "omega_std": .45}
    if model_config:
        c.update(model_config)
    def fresh():
        return PhotometabolicBiosentinel(FibonacciEngine(seed=seed),
            IsodoseMapper(J0=c["J0"], ratio=c["ratio"], intensity_mw=c["intensity_mw"]),
            KuramotoField(N=c["N"], seed=seed, n_entropy=c["n"], k_lock=c["k"],
                kappa=c["kappa"], K_max=c["K_max"], dt=c["dt"], omega_std=c["omega_std"]))
    engine = fresh()
    engine.run(depth, verbose=False)
    symbols = engine.fib.generate(depth)
    true_MI = mutual_information(symbols[1:], engine.differential_decode())
    rng = PortableRandom(seed ^ 0xAA17F00D)
    scores = []
    for _ in range(n_surrogates):
        surrogate = aaft_surrogate(symbols, rng)
        other = fresh()  # identical oscillator state, frequencies and channel
        other.run_symbols(surrogate)
        scores.append(mutual_information(surrogate[1:], other.differential_decode()))
    mu, sigma = float(np.mean(scores)), float(np.std(scores))
    p = (1 + sum(score >= true_MI - 1e-12 for score in scores)) / (n_surrogates + 1)
    return {"method": "aaft-randomized-ties", "seed": str(seed),
            "config": engine.experiment_state(depth)["config"], "n_surrogates": n_surrogates,
            "true_MI": true_MI, "surrogate_mean": mu, "surrogate_std": sigma,
            "gap_sigma": (true_MI-mu)/sigma if sigma > 1e-12 else None,
            "p_value": p, "surrogate_MIs": scores,
            "interpretation": "Approximate spectral null; no physiological inference or proof of composition-invariant decoding."}


# ============================================================================
# 6. ENTRY POINT & DEMONSTRATION
# ============================================================================

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--intention", default="Resonarium Emergence")
    parser.add_argument("--seed", type=int, help="Decimal uint64 from the browser, bypasses text hashing")
    parser.add_argument("--depth", type=int, choices=range(1, 13), default=9)
    parser.add_argument("--output", type=Path, default=Path("artifacts/resonarium"))
    parser.add_argument("--surrogates", type=int, default=0)
    parser.add_argument("--audio", action="store_true")
    args = parser.parse_args()
    seed = derive_seed(args.intention) if args.seed is None else args.seed
    fib = FibonacciEngine(seed=seed)
    engine = PhotometabolicBiosentinel(fib, IsodoseMapper(ratio=2.2),
        KuramotoField(N=64, seed=seed, kappa=.011, n_entropy=16, k_lock=.72))
    engine.run(args.depth)
    args.output.mkdir(parents=True, exist_ok=True)
    fals = run_falsification(min(args.depth, 9), args.surrogates, seed, model_config=engine.experiment_state(args.depth)["config"]) if args.surrogates else None
    state = engine.experiment_state(args.depth, fals)
    (args.output / "experiment.json").write_text(json.dumps(state, indent=2, allow_nan=False))
    engine.export_resonarium_state(str(args.output / "hologram.json"))
    if args.audio:
        engine.synthesize_audio(filename=str(args.output / "drone.wav"))
    print(f"Seed {seed}; open app/resonarium/index.html and import {args.output / 'experiment.json'}")
    if fals:
        print(json.dumps(fals, indent=2))
    return engine, fals


if __name__ == "__main__":
    main()
