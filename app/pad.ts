// app/pad.ts — a controller, and the keyboard standing in for one.
//
// The game is built for a stick. Everything below exists to turn a physical
// hand into the four things game/run.ts will accept — a direction with a
// magnitude, a grip, a burst, and a handful of one-shot presses — and to make a
// keyboard produce the same shape so nobody is locked out.
//
// WHY THE DEADZONE IS RADIAL. Treating the axes separately squares off the
// diagonals: a stick pushed to its corner reads 1.0 on both, which is a
// magnitude of 1.41, and since the magnitude here IS the trap offset, a player
// would get forty percent more reach on the diagonals than on the cardinals.
// The magnitude is taken from the vector, rescaled from the edge of the
// deadzone, and clamped once.
//
// WHY THERE IS A CURVE ON IT. The stick sets a distance, not a speed, and the
// interesting part of that distance is the first third — a small offset is a
// slow, precise approach to something you are trying not to shove. A mild
// exponential gives that back without costing anything at full deflection.
//
// Xbox / XInput button order, which is what the Gamepad API's "standard"
// mapping reports: A B X Y, LB RB, LT RT, Back Start.

const DEADZONE = 0.22;
const CURVE = 1.35;
/** A trigger past this counts as pulled. */
const TRIGGER = 0.35;

export interface Intent {
  /** Direction and magnitude, 0..1. The trap offset, not a velocity. */
  move: { x: number; y: number };
  grip: boolean;
  /** One-shot: true only on the frame the button went down. */
  dash: boolean;
  place: boolean;
  crown: boolean;
  /** The throne button, HELD rather than tapped. Tap it to feed, hold it to
   *  crown: an act you cannot undo should not be the same gesture as one you
   *  make sixty times a run. */
  crownDown: boolean;
  /** -1, 0 or +1: step the selected cell. One-shot. */
  cycle: number;
  /** Start / A / Space on a menu. One-shot. */
  confirm: boolean;
  /** Stop the world. One-shot. */
  pause: boolean;
  mute: boolean;
}

const NOTHING: Intent = {
  move: { x: 0, y: 0 }, grip: false, dash: false, place: false,
  crown: false, crownDown: false, cycle: 0, confirm: false, pause: false,
  mute: false,
};

/** Buttons in the standard mapping, by the name written on an Xbox pad. */
const A = 0, B = 1, X = 2, Y = 3, LB = 4, RB = 5, LT = 6, RT = 7, BACK = 8, START = 9;

interface Layout {
  grip: number[]; dash: number[]; place: number[]; crown: number[];
  prev: number[]; next: number[]; confirm: number[]; pause: number[]; mute: number[];
}

const STANDARD: Layout = {
  grip: [RT, RB], dash: [A, LT], place: [X], crown: [Y],
  prev: [LB], next: [B], confirm: [START, A], pause: [START], mute: [BACK],
};

/**
 * For a pad the browser did not recognise.
 *
 * The spec only promises the order above for pads it has a mapping for;
 * everything else arrives as mapping "" with the axes and buttons in whatever
 * order the driver felt like, and then index 9 is not Start and index 0 is not
 * A. The page does not throw, does not log, and simply ignores you.
 *
 * So the fallback is deliberately forgiving rather than another guess at one
 * layout: every shoulder and trigger grips, either of the first two buttons
 * bursts, and any face or menu button gets you off the title screen. It will
 * not be comfortable, but nobody is locked out of their own game while we work
 * out what their controller actually is — and the title screen prints the id
 * and the live axes so that can be worked out at all.
 */
const LOOSE: Layout = {
  grip: [4, 5, 6, 7], dash: [0, 1], place: [2], crown: [3],
  prev: [4], next: [5], confirm: [0, 1, 2, 3, 8, 9], pause: [9, 8], mute: [8],
};

export class Pad {
  /** True while a gamepad is actually reporting. Drives which glyphs the HUD
   *  prints — telling somebody to press A when they are on a keyboard is worse
   *  than saying nothing. */
  connected = false;

  private readonly keys = new Set<string>();
  private prev: boolean[] = [];
  private prevKeys = new Set<string>();
  private index = -1;
  /**
   * Whether any pad input has EVER arrived.
   *
   * A browser will not update gamepad state for a page that does not have
   * focus: getGamepads keeps returning the snapshot it had, so a pad that
   * enumerated perfectly at connect time delivers nothing but zeroes forever,
   * with no error anywhere. It is indistinguishable from a broken mapping
   * unless you ask this question, and the answer changes the advice entirely.
   */
  private everMoved = false;

  constructor() {
    window.addEventListener("keydown", (e) => {
      if (e.code === "Space" || e.code.startsWith("Arrow")) e.preventDefault();
      this.keys.add(e.code);
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => this.keys.clear());
    // The console is the only place a controller problem can be seen from
    // somewhere else, and a pad that does not work is otherwise completely
    // silent: nothing throws, nothing logs, the page just ignores you.
    window.addEventListener("gamepadconnected", (e) => {
      const gp = (e as GamepadEvent).gamepad;
      this.index = gp.index;
      console.log(`[pad] connected: "${gp.id}" mapping="${gp.mapping}" `
        + `axes=${gp.axes.length} buttons=${gp.buttons.length}`);
    });
    window.addEventListener("gamepaddisconnected", () => {
      console.log("[pad] disconnected");
      this.index = -1;
      this.connected = false;
    });
  }

  private gamepad(): Gamepad | null {
    const pads = navigator.getGamepads?.() ?? [];
    if (this.index >= 0 && pads[this.index]) return pads[this.index];
    for (const p of pads) if (p && p.connected) { this.index = p.index; return p; }
    return null;
  }

  /**
   * Which axes are the left stick, and which button is which.
   *
   * The spec's "standard" mapping is a promise the browser only makes for pads
   * it recognises; everything else arrives as mapping "" with the axes and
   * buttons in whatever order the driver felt like. Rather than trust it, the
   * indices are read through here, so a pad that reports something else can be
   * corrected in one place.
   */
  private layout(gp: Gamepad): Layout {
    return gp.mapping === "standard" ? STANDARD : LOOSE;
  }

  /** Radial deadzone with a curve, applied to the vector rather than the axes. */
  private stick(ax: number, ay: number): { x: number; y: number } {
    const r = Math.hypot(ax, ay);
    if (r < DEADZONE) return { x: 0, y: 0 };
    const scaled = Math.min(1, (r - DEADZONE) / (1 - DEADZONE)) ** CURVE;
    return { x: (ax / r) * scaled, y: (ay / r) * scaled };
  }

  /** Read one frame of intent. Call exactly once per frame: it consumes edges. */
  read(): Intent {
    const out: Intent = { ...NOTHING, move: { x: 0, y: 0 } };
    const gp = this.gamepad();
    this.connected = gp !== null;

    if (gp) {
      const down = (i: number): boolean => {
        const b = gp.buttons[i];
        return b ? b.pressed || b.value > TRIGGER : false;
      };
      const anyDown = (list: number[]): boolean => list.some(down);
      const anyHit = (list: number[]): boolean =>
        list.some((i) => down(i) && !this.prev[i]);

      const m = this.layout(gp);
      out.move = this.stick(gp.axes[0] ?? 0, gp.axes[1] ?? 0);
      out.grip = anyDown(m.grip);
      out.dash = anyHit(m.dash);
      out.place = anyHit(m.place);
      out.crown = anyHit(m.crown);
      out.crownDown = anyDown(m.crown);
      out.cycle = (anyHit(m.prev) ? -1 : 0) + (anyHit(m.next) ? 1 : 0);
      out.confirm = anyHit(m.confirm);
      out.pause = anyHit(m.pause);
      out.mute = anyHit(m.mute);

      this.prev = [...gp.buttons].map((_, i) => down(i));
      if (!this.everMoved
        && (out.grip || out.dash || out.place || out.crownDown || out.confirm
          || Math.hypot(gp.axes[0] ?? 0, gp.axes[1] ?? 0) > DEADZONE)) {
        this.everMoved = true;
        console.log("[pad] first input received");
      }
    } else {
      this.prev = [];
    }

    // The keyboard is not a fallback that does less — it is the same intent,
    // and both are read every frame so a stick and a hand on the keys can be
    // used together without either taking a mode away from the other.
    const k = (code: string): boolean => this.keys.has(code);
    const tap = (code: string): boolean => this.keys.has(code) && !this.prevKeys.has(code);

    let kx = 0, ky = 0;
    if (k("KeyA") || k("ArrowLeft")) kx -= 1;
    if (k("KeyD") || k("ArrowRight")) kx += 1;
    if (k("KeyW") || k("ArrowUp")) ky -= 1;
    if (k("KeyS") || k("ArrowDown")) ky += 1;
    if (kx !== 0 || ky !== 0) {
      const r = Math.hypot(kx, ky);
      out.move = { x: kx / r, y: ky / r };
    }

    if (k("Space") || k("ShiftLeft") || k("ShiftRight")) out.grip = true;
    if (tap("KeyK") || tap("KeyJ") || tap("ControlLeft")) out.dash = true;
    if (tap("KeyE") || tap("Enter")) out.place = true;
    if (tap("KeyC")) out.crown = true;
    if (k("KeyC")) out.crownDown = true;
    if (tap("KeyQ")) out.cycle = -1;
    // NO RESTART KEY. It threw away a good long run on a single unconfirmed
    // keypress, in a game whose runs are ten minutes. Beginning again lives on
    // the screen you reach by dying, where it cannot be reached by accident.
    if (tap("KeyM")) out.mute = true;
    if (tap("Space") || tap("Enter")) out.confirm = true;
    if (tap("Escape") || tap("KeyP")) out.pause = true;

    this.prevKeys = new Set(this.keys);
    return out;
  }

  /**
   * What the browser is actually reporting, in one line.
   *
   * A controller that does not work is the least debuggable thing there is:
   * nothing throws, nothing logs, the page simply ignores you. The Gamepad API
   * only promises a "standard" button and axis order for pads it recognises,
   * and for anything it does not, index 9 is not Start and index 0 is not A.
   * This is printed on the title screen so the failure is a thing you can read
   * rather than a thing you have to bisect.
   */
  describe(): string {
    const raw = navigator.getGamepads?.() ?? [];
    const found = [...raw].filter((p) => p);
    if (found.length === 0) return "NO CONTROLLER SEEN - PRESS A BUTTON ON IT";

    const gp = found[0] as Gamepad;
    const focused = typeof document === "undefined" ? true : (document.hasFocus?.() ?? true);

    // THE QUESTION THAT DECIDES EVERYTHING. A pad that enumerated fine and
    // delivers nothing but zeroes is, nine times in ten, a page that does not
    // have focus — the browser simply stops updating gamepad state, silently
    // and forever. Saying "no mapping" or "press a button" at that point sends
    // somebody chasing the wrong thing.
    if (!focused) return "CLICK THE GAME - A PAGE WITHOUT FOCUS GETS NO PAD INPUT";
    if (!this.everMoved) {
      return `${gp.id.slice(0, 30)} SEEN, NOTHING RECEIVED YET - CLICK HERE, THEN PRESS A BUTTON`;
    }

    const ax = [...gp.axes].slice(0, 4).map((v) => v.toFixed(2)).join(" ");
    const pressed = [...gp.buttons]
      .map((b, i) => (b.pressed || b.value > TRIGGER ? i : -1))
      .filter((i) => i >= 0);
    return `${gp.id.slice(0, 30)} | ${gp.mapping || "(none)"} `
      + `| AXES ${ax} | DOWN ${pressed.length ? pressed.join(",") : "-"}`;
  }

  /** A number key held this frame, 1..9, or zero. Placing a specific cell is
   *  the one thing a keyboard does better than a pad. */
  slotKey(): number {
    for (let i = 1; i <= 9; i++) if (this.keys.has(`Digit${i}`)) return i;
    return 0;
  }
}

/** What to print on screen for each verb. */
export const GLYPH = {
  pad: {
    move: "L STICK", grip: "RT", dash: "A", place: "X", crown: "Y",
    cycle: "LB / B", confirm: "START", pause: "START", mute: "BACK",
  },
  keys: {
    move: "WASD", grip: "SPACE", dash: "K", place: "E / 1-9", crown: "C",
    cycle: "Q", confirm: "SPACE", pause: "ESC / P", mute: "M",
  },
} as const;
