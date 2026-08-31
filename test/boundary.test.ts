import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// The boundary between the two halves of this repository, enforced.
//
// src/ computes acoustic radiation forces at 10^6 to 10^8 Hz inside a
// microfluidic channel, to move cells. personal/ produces audible sound, 10^2
// to 10^4 Hz, to be listened to. Four to six orders of magnitude apart, with
// different mechanisms and different claims, and the whole value of the physics
// half is that it can be wrong in a way an experiment would show.
//
// A comment saying they are separate is a hope. These tests are the separation:
// they read the actual import statements and fail if the two halves ever reach
// for each other. If this file starts failing, the question is not how to make
// it pass — it is which claim just leaked into which.

const root = new URL("..", import.meta.url).pathname;

function sourcesIn(dir: string): Array<{ file: string; text: string }> {
  const full = join(root, dir);
  return readdirSync(full)
    .filter((f) => f.endsWith(".ts"))
    .map((f) => ({ file: `${dir}/${f}`, text: readFileSync(join(full, f), "utf8") }));
}

/** Every module path this file imports from. */
function importsOf(text: string): string[] {
  const out: string[] = [];
  const re = /(?:from|import)\s+["']([^"']+)["']/g;
  let m = re.exec(text);
  while (m) { out.push(m[1]); m = re.exec(text); }
  return out;
}

test("the physics half never imports the personal half, or the subject", () => {
  // This is the one that matters. A radiation force that took a birth time as
  // an input would stop being falsifiable, and an acoustic prediction that
  // depended on which tones someone finds pleasant would not be a prediction.
  for (const { file, text } of sourcesIn("src")) {
    for (const spec of importsOf(text)) {
      assert.ok(!spec.includes("personal/"),
        `${file} imports ${spec}: the physics must not depend on the tonal layer`);
      assert.ok(!spec.includes("config/"),
        `${file} imports ${spec}: the physics must stay a pure function of its arguments`);
    }
  }
});

test("the personal half never imports the physics half either", () => {
  // Independence in both directions. The tonal layer borrowing a Gor'kov
  // potential would be the beginning of a claim that listening does what a
  // channel does — the exact confusion the separation exists to prevent.
  for (const { file, text } of sourcesIn("personal")) {
    for (const spec of importsOf(text)) {
      assert.ok(!spec.includes("src/"),
        `${file} imports ${spec}: the tonal layer must not borrow device physics`);
    }
  }
});

test("the two app entry points are as separate as the two libraries", () => {
  // The bench and the listening surface are different PAGES, not tabs on one.
  // A tab would present them as two views of one thing, and the import graph
  // says the same: app/main.ts knows nothing of personal/, app/listen.ts
  // nothing of src/. If either ever needed the other, that would be the moment
  // to stop and ask which claim was about to leak into which.
  const main = readFileSync(join(root, "app/main.ts"), "utf8");
  for (const spec of importsOf(main)) {
    assert.ok(!spec.includes("personal/"),
      `app/main.ts imports ${spec}: the bench must not reach for the tonal layer`);
  }

  const listen = readFileSync(join(root, "app/listen.ts"), "utf8");
  for (const spec of importsOf(listen)) {
    assert.ok(!spec.includes("src/"),
      `app/listen.ts imports ${spec}: the listening surface must not borrow device physics`);
    assert.ok(!spec.includes("config/"),
      `app/listen.ts imports ${spec}: a chart is pasted in, not read from the subject file`);
  }

  // and each really does use its own half, rather than being separate by
  // virtue of importing nothing
  assert.ok(importsOf(main).some((s) => s.includes("src/")), "main must use src/");
  assert.ok(importsOf(listen).some((s) => s.includes("personal/")),
    "listen must use personal/");
});

test("the game builds on the physics half and never on the personal half", () => {
  // game/ is a third thing: it is allowed to depend on src/, because a game
  // whose rules are the library's physics is the point of it. It is not allowed
  // to reach for personal/ or for the subject. A radiation force does not stop
  // being falsifiable because something scores points off it, but it would stop
  // being falsifiable the moment it took a birth time as an input.
  const game = sourcesIn("game");
  assert.ok(game.length > 0, "there should be a game to check");
  for (const { file, text } of game) {
    for (const spec of importsOf(text)) {
      assert.ok(!spec.includes("personal/"),
        `${file} imports ${spec}: the game must not reach for the tonal layer`);
      assert.ok(!spec.includes("config/"),
        `${file} imports ${spec}: the game must not read the subject file`);
    }
  }
  assert.ok(game.some(({ text }) => importsOf(text).some((s) => s.includes("src/"))),
    "and it really must use the physics, rather than be separate by using nothing");
});

test("the game's surface is as separate as the other two", () => {
  // app/drifter.ts draws the game; app/sfx.ts makes its noises. Those noises
  // are UI sound at a few hundred hertz and the field is at ten megahertz —
  // four orders apart and unrelated — which is exactly the confusion this file
  // exists to keep from setting in.
  for (const entry of ["app/drifter.ts", "app/pad.ts", "app/sfx.ts"]) {
    const text = readFileSync(join(root, entry), "utf8");
    for (const spec of importsOf(text)) {
      assert.ok(!spec.includes("personal/"),
        `${entry} imports ${spec}: the game must not reach for the tonal layer`);
      assert.ok(!spec.includes("config/"),
        `${entry} imports ${spec}: the game must not read the subject file`);
    }
  }
});

test("all three halves are self-contained: no dependencies at all", () => {
  for (const dir of ["src", "personal", "game"]) {
    for (const { file, text } of sourcesIn(dir)) {
      for (const spec of importsOf(text)) {
        assert.ok(spec.startsWith("./") || spec.startsWith("../") || spec.startsWith("node:"),
          `${file} imports ${spec}: this repository has no runtime dependencies`);
      }
    }
  }
});

test("the two halves really do occupy different frequency regimes", () => {
  // Stated as an assertion rather than a comment, because it is the physical
  // fact the whole separation rests on and it should break loudly if edited.
  const audible = { min: 20, max: 18_000 };          // personal/tonal
  const device = { min: 1_000_000, max: 200_000_000 }; // BAW 1-10 MHz, SAW 10-200
  assert.ok(audible.max * 50 < device.min,
    "the two regimes must stay orders of magnitude apart");
  // and the wavelengths that follow, in water at 1500 m/s
  const lambda = (hz: number) => 1500 / hz;
  assert.ok(lambda(440) > 3, "a musical tone's wavelength in water is metres");
  assert.ok(lambda(2e6) < 1e-3, "a device wavelength is under a millimetre");
  // a 10 um cell against each
  assert.ok(10e-6 / lambda(2e6) > 0.005, "a cell is a real fraction of a device wavelength");
  assert.ok(10e-6 / lambda(440) < 1e-5, "a cell is nothing against a musical wavelength");
});
