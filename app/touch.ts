// app/touch.ts — two thumbs, for a phone with neither a pad nor a keyboard.
//
// NOTHING HERE IS A NEW CONTROL SCHEME. Every button holds a virtual key in
// app/pad.ts exactly as a keyboard would, and the stick feeds the same radial
// deadzone and curve a real stick does, so a verb reached by touch obeys every
// hold-and-tap rule the game already has: tap BUILD to place, hold it to grow a
// mitochondrion; tap THRONE to feed, hold it to crown. A second path through
// the rules would be a second set of rules.
//
// The layout is a pad's. A floating stick under the left thumb — it centres
// wherever the thumb lands, because a fixed stick on glass is always somewhere
// other than where the thumb is — and the four face buttons in the diamond an
// Xbox pad has them in, under the right. GRIP is the one verb that has to be
// held WHILE another is pressed (you burst with your hand closed), and on a pad
// that is a trigger under a different finger. A phone has two thumbs, so GRIP
// is a hold and a double-tap LATCHES it: locked, it stays closed until tapped
// again, and the right thumb is free for BURST.
//
// Hidden while a real controller is reporting: a player who has paired a pad
// to their phone should not be looking at buttons they are not using.

import { type Pad } from "./pad.js";

interface Spec { label: string; code: string; cls: string; hint: string }

/** The diamond, as on the pad: Y top, X left, B right, A bottom. */
const FACE: readonly Spec[] = [
  { label: "THRONE", code: "KeyC", cls: "y", hint: "Tap to feed the throne, hold to crown" },
  { label: "BUILD", code: "KeyE", cls: "x", hint: "Tap to build, hold to grow a mitochondrion" },
  { label: "NEXT", code: "KeyQ", cls: "b", hint: "Choose the next cell in your rack" },
  { label: "BURST", code: "KeyK", cls: "a", hint: "Burst; into an arm, it throws it back" },
];

/** Shoulder row and the menu row. */
const EXTRA: readonly Spec[] = [
  { label: "LIFT", code: "KeyF", cls: "lb", hint: "Tap to lift a building, hold to leave a lure" },
  { label: "CALL", code: "KeyR", cls: "r3", hint: "Call your companion" },
];
/** Top corners: the channel's harmonic on the left, stopping and the forge on the right. */
const MENU_LEFT: readonly Spec[] = [
  { label: "▲", code: "TouchDepthUp", cls: "depth", hint: "Retune the channel up a harmonic" },
  { label: "▼", code: "TouchDepthDown", cls: "depth", hint: "Retune the channel down a harmonic" },
];
const MENU_RIGHT: readonly Spec[] = [
  { label: "FORGE", code: "KeyV", cls: "forge", hint: "Crystal forge (expeditions)" },
  { label: "II", code: "Escape", cls: "pause", hint: "Stop" },
];

/** How far the thumb travels for full deflection, CSS px. */
const REACH = 58;
/** Two taps on GRIP inside this many ms latch it. */
const LATCH_MS = 320;

// Sized from the screen's HEIGHT, which is what a landscape phone is short of:
// the water is 900 x 660, so at full height it leaves two side margins, and
// the controls live in those margins rather than over the water.
const STYLE = `
  #touch { --b: clamp(40px, 13vh, 62px); position:fixed; inset:0; pointer-events:none; z-index:10;
    font-family:"IBM Plex Mono", ui-monospace, Menlo, monospace; user-select:none; -webkit-user-select:none; }
  #touch[hidden] { display:none; }
  #touch .zone { position:absolute; left:0; bottom:0; width:38vw; height:72vh; pointer-events:auto; touch-action:none; }
  #touch .base, #touch .knob { position:absolute; border-radius:50%; pointer-events:none; transform:translate(-50%,-50%); }
  #touch .base { width:${REACH * 2}px; height:${REACH * 2}px; border:1px solid rgba(120,225,245,0.35);
    background:rgba(120,225,245,0.06); }
  #touch .knob { width:46px; height:46px; background:rgba(120,225,245,0.35); border:1px solid rgba(120,225,245,0.8); }
  #touch button { pointer-events:auto; touch-action:none; position:absolute; font:inherit; font-weight:700;
    letter-spacing:0.06em; color:#cfe9f5; background:rgba(11,18,32,0.62); border:1px solid rgba(120,225,245,0.45);
    border-radius:50%; width:var(--b); height:var(--b); font-size:calc(var(--b) * 0.15); padding:0;
    -webkit-tap-highlight-color:transparent; }
  #touch button.on { background:rgba(120,225,245,0.42); color:#05070e; }
  #touch .face { position:absolute; right:8px; bottom:8px; width:calc(var(--b) * 2.6); height:calc(var(--b) * 2.6); }
  #touch .face .y { left:calc(var(--b) * 0.8); top:0; border-color:rgba(255,201,74,0.75); }
  #touch .face .x { left:0; top:calc(var(--b) * 0.8); border-color:rgba(120,190,255,0.75); }
  #touch .face .b { right:0; top:calc(var(--b) * 0.8); border-color:rgba(255,120,140,0.75); }
  #touch .face .a { left:calc(var(--b) * 0.8); bottom:0; border-color:rgba(160,255,214,0.75); }
  #touch .grip { right:calc(var(--b) * 0.7); bottom:calc(var(--b) * 2.6 + 18px);
    width:calc(var(--b) * 1.2); height:calc(var(--b) * 1.2); border-color:rgba(255,140,190,0.85); }
  #touch .grip.latched { background:rgba(255,140,190,0.5); color:#05070e; }
  #touch .lb { left:8px; top:calc(var(--b) * 0.75 + 16px); height:calc(var(--b) * 0.7); border-radius:10px; }
  #touch .r3 { right:8px; top:calc(var(--b) * 0.75 + 16px); height:calc(var(--b) * 0.7); border-radius:10px; }
  #touch .menu { position:absolute; top:8px; display:flex; gap:6px; }
  #touch .menu.left { left:8px; }
  #touch .menu.right { right:8px; }
  #touch .menu button { position:static; width:calc(var(--b) * 0.8); height:calc(var(--b) * 0.7); border-radius:8px; }
  #touch .menu .forge { width:calc(var(--b) * 1.05); }
  @media (pointer: coarse) {
    .sub, .legend, .controls { display:none !important; }
    body { gap:4px !important; padding:4px !important; }
    body.playing header { display:none; }
  }
`;

function make(parent: HTMLElement, s: Spec, pad: Pad): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = s.label;
  b.className = s.cls;
  b.setAttribute("aria-label", s.hint);
  const down = (e: PointerEvent) => {
    e.preventDefault();
    b.setPointerCapture(e.pointerId);
    pad.press(s.code);
    b.classList.add("on");
    navigator.vibrate?.(8);
  };
  const up = () => { pad.release(s.code); b.classList.remove("on"); };
  b.addEventListener("pointerdown", down);
  b.addEventListener("pointerup", up);
  b.addEventListener("pointercancel", up);
  b.addEventListener("contextmenu", (e) => e.preventDefault());
  parent.appendChild(b);
  return b;
}

/** GRIP: held while pressed, latched by a double tap, released by a tap. */
function grip(parent: HTMLElement, pad: Pad): void {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = "GRIP";
  b.className = "grip";
  b.setAttribute("aria-label", "Grip: hold, or double-tap to lock");
  let latched = false;
  let lastTap = -1e9;
  const code = "ShiftLeft";   // grips, and unlike Space it is never "confirm"
  b.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    b.setPointerCapture(e.pointerId);
    navigator.vibrate?.(8);
    if (latched) {
      latched = false;
      b.classList.remove("latched");
      b.textContent = "GRIP";
      pad.release(code);
      return;
    }
    const now = performance.now();
    if (now - lastTap < LATCH_MS) {
      latched = true;
      b.classList.add("latched");
      b.textContent = "LOCKED";
    }
    lastTap = now;
    pad.press(code);
    b.classList.add("on");
  });
  const up = () => {
    b.classList.remove("on");
    if (!latched) { pad.release(code); b.textContent = "GRIP"; }
  };
  b.addEventListener("pointerup", up);
  b.addEventListener("pointercancel", up);
  b.addEventListener("contextmenu", (e) => e.preventDefault());
  parent.appendChild(b);
}

/** A stick that centres wherever the thumb lands. */
function stick(root: HTMLElement, pad: Pad): void {
  const zone = document.createElement("div");
  zone.className = "zone";
  const base = document.createElement("div");
  base.className = "base";
  const knob = document.createElement("div");
  knob.className = "knob";
  base.hidden = knob.hidden = true;
  zone.append(base, knob);
  root.appendChild(zone);

  let id = -1, cx = 0, cy = 0;
  const place = (el: HTMLElement, x: number, y: number) => { el.style.left = `${x}px`; el.style.top = `${y}px`; };
  zone.addEventListener("pointerdown", (e) => {
    if (id >= 0) return;
    e.preventDefault();
    zone.setPointerCapture(e.pointerId);
    id = e.pointerId;
    const r = zone.getBoundingClientRect();
    cx = e.clientX - r.left; cy = e.clientY - r.top;
    place(base, cx, cy); place(knob, cx, cy);
    base.hidden = knob.hidden = false;
    pad.setStick(0, 0);
  });
  zone.addEventListener("pointermove", (e) => {
    if (e.pointerId !== id) return;
    const r = zone.getBoundingClientRect();
    let dx = e.clientX - r.left - cx, dy = e.clientY - r.top - cy;
    const d = Math.hypot(dx, dy);
    if (d > REACH) { dx *= REACH / d; dy *= REACH / d; }
    place(knob, cx + dx, cy + dy);
    pad.setStick(dx / REACH, dy / REACH);
  });
  const end = (e: PointerEvent) => {
    if (e.pointerId !== id) return;
    id = -1;
    base.hidden = knob.hidden = true;
    pad.setStick(0, 0);
  };
  zone.addEventListener("pointerup", end);
  zone.addEventListener("pointercancel", end);
}

/** Whether this device is driven by a finger. */
export function isTouchDevice(): boolean {
  return (typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches)
    || (typeof navigator !== "undefined" && (navigator.maxTouchPoints ?? 0) > 0 && !matchMedia("(pointer: fine)").matches);
}

/**
 * Put the controls on the page. `force` shows them on any device (the Android
 * build does, since a phone always has a finger even if CSS is unsure).
 */
export function mountTouch(pad: Pad, force = false): void {
  if (!force && !isTouchDevice()) return;
  pad.touched = true;   // say the buttons' names from the first screen, not the keyboard's
  const style = document.createElement("style");
  style.textContent = STYLE;
  document.head.appendChild(style);

  const root = document.createElement("div");
  root.id = "touch";
  stick(root, pad);

  const face = document.createElement("div");
  face.className = "face";
  for (const s of FACE) make(face, s, pad);
  root.appendChild(face);
  grip(root, pad);
  for (const s of EXTRA) make(root, s, pad);

  for (const [side, specs] of [["left", MENU_LEFT], ["right", MENU_RIGHT]] as const) {
    const menu = document.createElement("div");
    menu.className = `menu ${side}`;
    for (const s of specs) make(menu, s, pad);
    root.appendChild(menu);
  }
  document.body.appendChild(root);

  // Out of the way while a real controller is reporting. Checked once a
  // frame, since that is how often the pad itself is read.
  const watch = () => {
    root.hidden = pad.connected;
    requestAnimationFrame(watch);
  };
  requestAnimationFrame(watch);
}
