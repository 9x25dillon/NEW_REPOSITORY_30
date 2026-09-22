import { strict as assert } from "node:assert";
import { test } from "node:test";

// app/pad.ts reads the browser directly, so the browser is supplied here. It is
// a dozen lines and it buys the one thing that otherwise ships untested: that a
// physical stick becomes the intent game/run.ts actually consumes. A controller
// that maps its axes wrong is not a subtle bug, but it is an invisible one —
// nothing else in the suite would ever touch it.

interface FakeButton { pressed: boolean; value: number }
interface FakePad {
  index: number; connected: boolean; mapping: string;
  id: string; axes: number[]; buttons: FakeButton[];
}

let pads: FakePad[] = [];
const listeners = new Map<string, (e: unknown) => void>();

Object.defineProperty(globalThis, "window", {
  value: { addEventListener(t: string, f: (e: unknown) => void) { listeners.set(t, f); } },
  configurable: true,
});
Object.defineProperty(globalThis, "navigator", {
  value: { getGamepads: () => pads },
  configurable: true,
});

const { GLYPH, Pad } = await import("../app/pad.js");

function pad(axes: [number, number] = [0, 0], mapping = "standard"): FakePad {
  return {
    index: 0, connected: true, mapping, id: "Xbox Wireless Controller", axes,
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
  };
}
const A = 0, B = 1, X = 2, Y = 3, LB = 4, RT = 7;
function press(p: FakePad, i: number, on = true): void {
  p.buttons[i] = { pressed: on, value: on ? 1 : 0 };
}
function key(code: string, up = false): void {
  listeners.get(up ? "keyup" : "keydown")?.({ code, preventDefault() {} });
}

test("a stick becomes an offset, and the deadzone is radial", () => {
  const p = new Pad();
  pads = [pad([0.1, 0.1])];
  assert.deepEqual(p.read().move, { x: 0, y: 0 }, "inside the deadzone is nothing");

  pads = [pad([1, 0])];
  const east = p.read().move;
  assert.ok(Math.abs(east.x - 1) < 1e-9 && east.y === 0);

  // The corner is the case that matters. Per-axis deadzones report 1.0 on both
  // and hand the diagonals a magnitude of 1.41 — forty per cent more reach than
  // a cardinal, because the magnitude here IS the trap offset.
  pads = [pad([Math.SQRT1_2, Math.SQRT1_2])];
  const corner = p.read().move;
  assert.ok(Math.abs(Math.hypot(corner.x, corner.y) - 1) < 1e-9,
    `a diagonal must not reach further than a cardinal (${Math.hypot(corner.x, corner.y)})`);
});

test("the trigger grips and the face button bursts, once per press", () => {
  const p = new Pad();
  const gp = pad();
  pads = [gp];

  press(gp, RT);
  assert.ok(p.read().grip);
  assert.ok(p.read().grip, "grip is a hold, not an edge");

  press(gp, A);
  assert.ok(p.read().dash, "the burst fires on the press");
  assert.ok(!p.read().dash, "and not again while it is still down");
  // The release has to be SEEN. A pad is polled once a frame, so a press and a
  // release inside the same frame is not an event that reaches anyone — true of
  // every poll-based gamepad and not worth engineering around at sixty hertz.
  press(gp, A, false);
  p.read();
  press(gp, A);
  assert.ok(p.read().dash, "released, observed, and pressed again is a second burst");
});

test("place, crown and the rack are one-shots", () => {
  const p = new Pad();
  const gp = pad();
  pads = [gp];
  p.read();

  press(gp, X);
  assert.ok(p.read().place);
  press(gp, X, false);

  press(gp, Y);
  assert.ok(p.read().crown);
  press(gp, Y, false);

  // LB takes a building back into your hand rather than stepping the rack —
  // an organism that follows you stands on every site you would build on, so
  // being able to undo a placement matters more than a second way to cycle.
  press(gp, LB);
  assert.ok(p.read().lift);
  press(gp, LB, false);
  press(gp, B);
  assert.equal(p.read().cycle, 1);
});

test("with no pad the keyboard produces the same intent", () => {
  const p = new Pad();
  pads = [];
  p.read();
  assert.ok(!p.connected);

  key("KeyD");
  key("KeyS");
  const diag = p.read().move;
  assert.ok(Math.abs(Math.hypot(diag.x, diag.y) - 1) < 1e-9, "and its diagonals are normalised too");
  assert.ok(diag.x > 0 && diag.y > 0, "D and S is down-right");
  key("KeyD", true);
  key("KeyS", true);

  key("Space");
  assert.ok(p.read().grip);

  key("KeyK");
  assert.ok(p.read().dash, "K bursts");
  assert.ok(!p.read().dash, "and holding it does not burst again");
});

test("stopping the world is its own button, and not the one that confirms", () => {
  // Start pauses in play; A is what gets you off a menu. Sharing one button
  // between them means either the pause screen eats your first press or the
  // title screen pauses a game that has not started.
  const p = new Pad();
  const gp = pad();
  pads = [gp];
  p.read();

  press(gp, 9);                       // START
  const it = p.read();
  assert.ok(it.pause, "START stops it");
  press(gp, 9, false);
  p.read();

  press(gp, 0);                       // A
  const face = p.read();
  assert.ok(face.confirm, "A confirms");
  assert.ok(!face.pause, "and does not stop it");

  pads = [];
  p.read();
  key("Escape");
  assert.ok(p.read().pause, "ESC on a keyboard");
  key("Escape", true);
  p.read();
  key("KeyP");
  assert.ok(p.read().pause, "and P");
});

test("a number key names a rack slot directly", () => {
  const p = new Pad();
  pads = [];
  assert.equal(p.slotKey(), 0);
  key("Digit3");
  assert.equal(p.slotKey(), 3);
  key("Digit3", true);
  assert.equal(p.slotKey(), 0);
});

test("the prompts follow the hardware that is actually plugged in", () => {
  const p = new Pad();
  pads = [];
  p.read();
  assert.ok(!p.connected, "telling somebody to press A when they are on a keyboard is worse than silence");

  pads = [pad()];
  p.read();
  assert.ok(p.connected);
  assert.equal(GLYPH.pad.dash, "A");
  assert.equal(GLYPH.keys.dash, "R-CLICK");
});

test("a pad the browser does not recognise still gets you into the game", () => {
  // The failure this exists for is silent: mapping "" means the indices are
  // whatever the driver felt like, so Start is not button nine, nothing throws,
  // nothing logs, and the page simply ignores you. The fallback is forgiving on
  // purpose — it will not be comfortable, but nobody is locked out.
  const p = new Pad();
  const gp = pad([0, 0], "");
  pads = [gp];
  p.read();

  for (const face of [0, 1, 2, 3, 8, 9]) {
    press(gp, face);
    assert.ok(p.read().confirm, `button ${face} should get past a title screen`);
    press(gp, face, false);
    p.read();
  }

  for (const shoulder of [4, 5, 6, 7]) {
    press(gp, shoulder);
    assert.ok(p.read().grip, `button ${shoulder} should grip`);
    press(gp, shoulder, false);
    p.read();
  }

  // And the stick is still the stick: axes 0 and 1 are the one thing every
  // driver agrees on.
  pads = [pad([0, -1], "")];
  const m = p.read().move;
  assert.ok(Math.abs(m.y + 1) < 1e-9 && Math.abs(m.x) < 1e-9);
});

test("it says out loud what the browser is reporting", () => {
  const p = new Pad();
  pads = [];
  assert.match(p.describe(), /NO CONTROLLER/);

  const gp = pad([0.5, -0.25], "");
  press(gp, 7);
  pads = [gp];

  // Before any input has arrived it says so, rather than printing zeroes that
  // look like a working pad reporting nothing.
  assert.match(p.describe(), /NOTHING RECEIVED YET/);
  p.read();
  const line = p.describe();
  assert.match(line, /Xbox Wireless Controller/);
  assert.match(line, /\(none\)/, "an unrecognised mapping must be visible");
  assert.match(line, /0\.50/);
  assert.match(line, /DOWN 7/);
});

test("a page without focus is named as the reason, unless the pad has answered", () => {
  // A browser stops updating gamepad state for an unfocused page: getGamepads
  // keeps handing back the snapshot it had, so a controller that enumerated
  // perfectly delivers nothing but zeroes forever, with no error anywhere. It
  // is indistinguishable from a broken mapping unless the page says which.
  //
  // BUT IT IS THE SECOND QUESTION, and it used to be the first. `describe()` is
  // read in two places that are not alike: live on the title screen, where
  // focus IS the answer, and inside `report()` — which is only ever reached by
  // typing into the browser console, which is exactly when the page does not
  // have focus. So every pasted report accused its author of not clicking the
  // game. All three reports of 2026-09-06 carried that line, from a player who
  // was using the pad the whole time.
  const unfocused = (yes: boolean): void => {
    Object.defineProperty(globalThis, "document", {
      value: { hasFocus: () => !yes }, configurable: true,
    });
  };

  // A pad that has never delivered anything: focus is the likeliest answer and
  // the one worth printing.
  const fresh = new Pad();
  pads = [pad()];
  unfocused(true);
  assert.match(fresh.describe(), /CLICK THE GAME/);

  // One that HAS delivered input has answered the focus question by
  // demonstration. Say what it is, and mark the reading stale rather than
  // blaming the player for a console they had to open to file the report.
  const p = new Pad();
  const gp = pad();
  press(gp, 0);
  pads = [gp];
  unfocused(false);
  p.read();
  const live = p.describe();
  assert.doesNotMatch(live, /CLICK THE GAME/, "focused, so no complaint");
  assert.match(live, /Xbox Wireless Controller/);
  assert.doesNotMatch(live, /STALE/, "focused: the reading is current");

  unfocused(true);
  const off = p.describe();
  assert.doesNotMatch(off, /CLICK THE GAME/,
    "it has already proved it works — this is how every report is written");
  assert.match(off, /Xbox Wireless Controller/, "say what the pad IS");
  assert.match(off, /STALE/, "and that the axes in it are not live");

  unfocused(false);
  assert.doesNotMatch(p.describe(), /CLICK THE GAME/);
});

test("Xbox X distinguishes a tap from holding to grow an organelle", () => {
  const p = new Pad();
  const gp = pad();
  pads = [gp];
  press(gp, X);
  const first = p.read();
  assert.equal(first.place, true);
  assert.equal(first.placeDown, true);
  const held = p.read();
  assert.equal(held.place, false);
  assert.equal(held.placeDown, true);
  press(gp, X, false);
  assert.equal(p.read().placeDown, false);
  pads = [];
  key("KeyE");
  assert.equal(p.read().placeDown, true);
  key("KeyE", true);
  assert.equal(p.read().placeDown, false);
});

test("R3 calls the companion, and the d-pad's sideways pair steps the rack both ways", () => {
  // Nothing already bound moved: the call went on a button nothing used, and
  // B still steps forward. A rack that reaches a hundred cells needs a way back.
  const R3 = 11, LEFT = 14, RIGHT = 15;
  const p = new Pad();
  const gp = pad();
  pads = [gp];
  p.read();
  press(gp, R3);
  assert.equal(p.read().call, true);
  assert.equal(p.read().call, false, "once per press");
  press(gp, R3, false);
  press(gp, RIGHT);
  assert.equal(p.read().cycle, 1);
  press(gp, RIGHT, false);
  press(gp, LEFT);
  assert.equal(p.read().cycle, -1);
  press(gp, LEFT, false);
  press(gp, RT);
  assert.ok(p.read().grip && !p.read().call, "and the trigger still only grips");
  press(gp, RT, false);
  pads = [];
  key("KeyR");
  assert.equal(p.read().call, true, "R calls from the keyboard");
  key("KeyR", true);
  assert.equal(GLYPH.pad.call, "R3");
  assert.equal(GLYPH.keys.call, "R");
});
