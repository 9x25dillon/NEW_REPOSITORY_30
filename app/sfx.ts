// app/sfx.ts — procedural sound, no assets.
//
// Adapted from the audio in TAPBLADE (github.com/9x25dillon/Badnono), which is
// the operator's own work: two oscillator voices and a decaying noise buffer,
// which is all a game like this needs and weighs nothing.
//
// This is UI sound. It is not the tonal layer in personal/, it makes no claim
// about what listening does, and nothing in it is derived from a radiation
// force — the beeps are at a few hundred hertz and the field is at ten
// megahertz. They are four orders of magnitude apart and unrelated, which is
// exactly the distinction test/boundary.test.ts exists to keep.
//
// ONE EXCEPTION, AND IT CARRIES ONE NUMBER. The quadrature drone is the X pair
// in your left ear and the Y pair in your right, at the same low pitch, with the
// right delayed by exactly the cross-phase the field is running at. The pitch is
// a stand-in — nobody hears ten megahertz — but the relation between the ears is
// the true one: at quadrature the image is wide and turning, in step it folds
// into the middle of your head, and in anti-phase it goes hollow, because two
// speakers in anti-phase cancel. It is handed a phase and a level, nothing else.

/** The drone's two voices, Hz: a low G and the G two octaves over it. */
const DRONE = [98, 392] as const;

export class Sfx {
  private ac: AudioContext | null = null;
  muted = false;
  private drone: { level: GainNode; delays: DelayNode[] } | null = null;

  /** Must be called from inside a user gesture or the context stays suspended. */
  unlock(): void {
    if (!this.ac) {
      try {
        const Ctor = window.AudioContext
          ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        this.ac = Ctor ? new Ctor() : null;
      } catch { this.ac = null; }
    }
    if (this.ac && this.ac.state === "suspended") void this.ac.resume();
  }

  /**
   * One voice.
   *
   * `delay` schedules the note forward on the AUDIO clock rather than through
   * setTimeout. A JS timer is jittery by tens of milliseconds under load, which
   * is audible as a limp arpeggio; the audio clock is sample-accurate and keeps
   * playing on time even while the main thread is busy drawing.
   */
  private tone(
    freq: number, dur: number, type: OscillatorType, vol: number,
    slide?: number, delay = 0,
  ): void {
    const ac = this.ac;
    if (!ac || this.muted) return;
    const t = ac.currentTime + delay;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, slide), t + dur);
    // exponential ramps cannot touch zero, hence the tiny floor at both ends
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(ac.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol: number): void {
    const ac = this.ac;
    if (!ac || this.muted) return;
    const n = Math.max(1, Math.floor(ac.sampleRate * dur));
    const buf = ac.createBuffer(1, n, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ac.createBufferSource();
    src.buffer = buf;
    const g = ac.createGain();
    g.gain.value = vol;
    src.connect(g); g.connect(ac.destination);
    src.start();
  }

  /** Rising interval, brighter with the streak. */
  capture(streak: number): void {
    // A rising fifth then the octave, transposed up a semitone per streak step:
    // the reward gets brighter without getting louder.
    const base = 440 * Math.pow(2, Math.min(streak - 1, 6) / 12);
    this.tone(base, 0.09, "square", 0.05, undefined, 0);
    this.tone(base * 1.5, 0.13, "square", 0.045, undefined, 0.07);
    this.tone(base * 2, 0.16, "triangle", 0.03, undefined, 0.145);
  }

  /** An enemy held until it comes apart. */
  dissolve(): void {
    this.tone(320, 0.26, "sawtooth", 0.04, 90);
    this.noise(0.18, 0.03);
  }

  /** The grip closing. Barely there on purpose — it happens constantly. */
  gripOn(): void { this.tone(180, 0.05, "sine", 0.022); }

  /** Stepping the phase over to the other lattice. A bare fifth, so the two
   *  modes are audibly the same thing at two settings. */
  invert(up: boolean): void {
    this.tone(up ? 392 : 261, 0.07, "triangle", 0.032, undefined, 0);
    this.tone(up ? 587 : 196, 0.09, "triangle", 0.026, undefined, 0.045);
  }

  /** The burst. A short fall with air behind it — the reservoir emptying. */
  dash(): void {
    this.tone(520, 0.13, "triangle", 0.036, 180);
    this.noise(0.09, 0.028);
  }

  /** Stepping through the rack. As small as it can be and still be heard. */
  tick(): void { this.tone(880, 0.025, "square", 0.015); }

  /** A hunter gathering itself. A rising pair, so it reads as a question. */
  coil(): void {
    this.tone(300, 0.16, "triangle", 0.022, 470);
  }

  /** And committing to it. */
  strike(): void {
    this.tone(700, 0.07, "sawtooth", 0.03, 240);
    this.noise(0.05, 0.02);
  }

  /** The king planting itself to throw. Low, and it does not resolve. */
  aiming(): void {
    this.tone(96, 0.45, "sawtooth", 0.03, 128);
  }

  hurt(): void { this.noise(0.09, 0.05); this.tone(120, 0.1, "sawtooth", 0.035, 60); }

  /** An arm caught in a burst: a bright rising pair, the opposite of `aiming`. */
  riposte(): void {
    this.tone(660, 0.06, "square", 0.035, 990);
    this.tone(1320, 0.1, "triangle", 0.025, undefined, 0.05);
  }

  /** And it landing: the king's own low note, answered an octave up. */
  riposteHit(): void {
    this.tone(196, 0.12, "sawtooth", 0.035, 392);
    this.noise(0.06, 0.025);
  }

  /** A gambit winding. Each form has its own figure so it can be heard coming. */
  gambit(kind: "charge" | "shock" | "echo"): void {
    if (kind === "charge") { this.tone(82, 0.5, "sawtooth", 0.04, 165); return; }
    if (kind === "shock") { this.tone(60, 0.55, "sine", 0.06, 45); this.noise(0.2, 0.02); return; }
    this.tone(330, 0.12, "triangle", 0.03, undefined, 0);
    this.tone(330, 0.12, "triangle", 0.03, undefined, 0.2);
  }

  /** The front going out. */
  thump(): void { this.tone(55, 0.3, "sine", 0.07, 35); this.noise(0.12, 0.03); }

  /** A king reaching its bond line and standing open. Falls, then holds. */
  falter(): void {
    this.tone(523, 0.22, "triangle", 0.045, 262);
    this.tone(392, 0.5, "sine", 0.035, undefined, 0.18);
  }

  /** A companion answering its call. */
  call(): void {
    this.tone(392, 0.09, "triangle", 0.035, undefined, 0);
    this.tone(523, 0.09, "triangle", 0.035, undefined, 0.07);
    this.tone(784, 0.16, "sine", 0.03, undefined, 0.14);
  }

  /** Integrity coming back. Soft, because it happens while you are resting. */
  mend(): void {
    this.tone(440, 0.18, "sine", 0.025, undefined, 0);
    this.tone(554, 0.22, "sine", 0.02, undefined, 0.09);
  }

  spent(): void { this.tone(300, 0.5, "sawtooth", 0.05, 55); this.noise(0.3, 0.035); }

  lesson(): void { this.tone(660, 0.08, "sine", 0.028); }

  /** A tap drinking a motif: a small glass ping, a fifth over the drone. */
  tap(): void {
    this.tone(1175, 0.12, "sine", 0.018, undefined, 0);
    this.tone(1760, 0.18, "sine", 0.01, undefined, 0.03);
  }

  /** Your lattice locking to the coherence phase: the drone's own G, rising
   *  through its fifth to the octave, soft enough to hear under a fight. */
  lock(): void {
    this.tone(392, 0.35, "sine", 0.026, undefined, 0);
    this.tone(587, 0.4, "sine", 0.022, undefined, 0.09);
    this.tone(784, 0.6, "triangle", 0.016, undefined, 0.18);
  }

  /**
   * The two pairs, one per ear, `cross` radians apart, at `level` 0..1.
   * Called every frame; built the first time it is asked for with a level.
   */
  quadrature(cross: number, level: number): void {
    const ac = this.ac;
    if (!ac) return;
    if (!this.drone) {
      if (level <= 0) return;
      const merge = ac.createChannelMerger(2);
      const out = ac.createGain();
      out.gain.value = 0;
      merge.connect(out); out.connect(ac.destination);
      const delays: DelayNode[] = [];
      for (const f of DRONE) {
        const o = ac.createOscillator();
        o.type = "sine";
        o.frequency.value = f;
        const left = ac.createGain(), right = ac.createGain();
        left.gain.value = right.gain.value = f === DRONE[0] ? 1 : 0.22;
        const d = ac.createDelay(1);
        o.connect(left); left.connect(merge, 0, 0);
        o.connect(d); d.connect(right); right.connect(merge, 0, 1);
        o.start();
        delays.push(d);
      }
      this.drone = { level: out, delays };
    }
    const t = ac.currentTime;
    const on = this.muted ? 0 : Math.max(0, Math.min(1, level));
    this.drone.level.gain.setTargetAtTime(0.03 * on, t, 0.12);
    // A phase is a delay of phase / (2 pi f) at that frequency; wrapped into
    // one period so a trim that walks past a full turn does not glide the long
    // way round.
    const phi = ((cross % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    this.drone.delays.forEach((d, i) => {
      d.delayTime.setTargetAtTime(phi / (2 * Math.PI * DRONE[i]), t, 0.05);
    });
  }
}
