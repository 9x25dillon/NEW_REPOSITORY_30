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
  /** -1, 0 or +1: step the selected cell. One-shot. */
  cycle: number;
  /** Start / A / Space on a menu. One-shot. */
  confirm: boolean;
  mute: boolean;
  restart: boolean;
}

const NOTHING: Intent = {
  move: { x: 0, y: 0 }, grip: false, dash: false, place: false,
  crown: false, cycle: 0, confirm: false, mute: false, restart: false,
};

/** Buttons in the standard mapping, by the name written on an Xbox pad. */
const A = 0, B = 1, X = 2, Y = 3, LB = 4, RB = 5, LT = 6, RT = 7, BACK = 8, START = 9;

export class Pad {
  /** True while a gamepad is actually reporting. Drives which glyphs the HUD
   *  prints — telling somebody to press A when they are on a keyboard is worse
   *  than saying nothing. */
  connected = false;

  private readonly keys = new Set<string>();
  private prev: boolean[] = [];
  private prevKeys = new Set<string>();
  private index = -1;

  constructor() {
    window.addEventListener("keydown", (e) => {
      if (e.code === "Space" || e.code.startsWith("Arrow")) e.preventDefault();
      this.keys.add(e.code);
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => this.keys.clear());
    window.addEventListener("gamepadconnected", (e) => {
      this.index = (e as GamepadEvent).gamepad.index;
    });
    window.addEventListener("gamepaddisconnected", () => {
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
      const hit = (i: number): boolean => down(i) && !this.prev[i];

      out.move = this.stick(gp.axes[0] ?? 0, gp.axes[1] ?? 0);
      out.grip = down(RT) || down(RB);
      out.dash = hit(A) || hit(LT);
      out.place = hit(X);
      out.crown = hit(Y);
      out.cycle = (hit(RB) ? 0 : 0) + (hit(LB) ? -1 : 0) + (hit(B) ? 1 : 0);
      out.confirm = hit(START) || hit(A);
      out.mute = hit(BACK);

      this.prev = gp.buttons.map((_, i) => down(i));
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
    if (tap("KeyQ")) out.cycle = -1;
    if (tap("KeyR")) out.restart = true;
    if (tap("KeyM")) out.mute = true;
    if (tap("Space") || tap("Enter")) out.confirm = true;

    this.prevKeys = new Set(this.keys);
    return out;
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
    cycle: "LB / B", confirm: "START", mute: "BACK",
  },
  keys: {
    move: "WASD", grip: "SPACE", dash: "K", place: "E / 1-9", crown: "C",
    cycle: "Q", confirm: "SPACE", mute: "M",
  },
} as const;
