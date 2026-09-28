// test/drifter-phone.browser.mjs — the game on a phone, in a real browser.
//
// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs CHROMIUM_PATH=/path/to/chrome \
//   node test/drifter-phone.browser.mjs
//
// Drives app/sonic-drifter.html the way a phone would: touch only, landscape,
// no keyboard, no mouse. It asserts that things HAPPENED — the pilot moved
// under the thumb, the run was kept, a reload went on with the same run — not
// merely that nothing threw. Then it does the same with the Android app's
// bridge object present, and checks a desktop still gets no on-screen buttons.

import { strict as assert } from "node:assert";
import { pathToFileURL } from "node:url";
import { join, dirname } from "node:path";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const root = join(dirname(new URL(import.meta.url).pathname), "..");
const page_url = pathToFileURL(join(root, "app/sonic-drifter.html")).href;
const shots = process.env.SHOTS ?? root;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
let checks = 0;
const check = (ok, what) => { assert.ok(ok, what); checks++; console.log(`ok ${checks} - ${what}`); };

const phone = { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const state = (page, f) => page.evaluate(f);

async function touchDrag(page, from, to, holdMs) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: from.x, y: from.y }] });
  for (let i = 1; i <= 6; i++) {
    const x = from.x + ((to.x - from.x) * i) / 6, y = from.y + ((to.y - from.y) * i) / 6;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y }] });
    await page.waitForTimeout(16);
  }
  await page.waitForTimeout(holdMs);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

async function tapCanvasTop(page) {
  const box = await page.locator("#game").boundingBox();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height * 0.18);
}

// ── a phone, in a browser ───────────────────────────────────────────────────
{
  const context = await browser.newContext(phone);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(page_url);
  await page.waitForTimeout(300);

  check(await page.locator("#touch").isVisible(), "the on-screen controls are there on a touch device");
  check(await page.locator("#touch .grip").isVisible() && await page.locator("#touch .face .a").isVisible(),
    "with a grip and the four face buttons");
  check(await state(page, () => !window.drifter.hasSaved()), "a fresh phone has no saved run");

  await tapCanvasTop(page);
  await page.waitForTimeout(200);
  check(await state(page, () => window.drifter.screen === "play"), "tapping the water begins a run");
  await page.screenshot({ path: join(shots, "phone-play.png") });

  const before = await state(page, () => ({ x: window.drifter.state.you.x, y: window.drifter.state.you.y }));
  const zone = await page.locator("#touch .zone").boundingBox();
  const at = { x: zone.x + zone.width * 0.4, y: zone.y + zone.height * 0.6 };
  await touchDrag(page, at, { x: at.x + 70, y: at.y }, 1200);
  const after = await state(page, () => ({ x: window.drifter.state.you.x, y: window.drifter.state.you.y }));
  check(after.x - before.x > 40e-6, `the stick moved the pilot right (${((after.x - before.x) * 1e6).toFixed(0)} um)`);

  await page.locator("#touch .menu .pause").tap();
  await page.waitForTimeout(100);
  check(await state(page, () => window.drifter.paused), "II stops the world");
  const kept = await state(page, () => ({ t: window.drifter.state.t, text: localStorage.getItem("sonic-drifter.run") }));
  check(typeof kept.text === "string" && kept.text.length > 10000, `stopping kept the run (${kept.text?.length} characters)`);
  await page.screenshot({ path: join(shots, "phone-paused.png") });

  await page.reload();
  await page.waitForTimeout(300);
  check(await state(page, () => window.drifter.hasSaved() && window.drifter.screen === "title"),
    "after a reload the title has the run waiting");
  await page.screenshot({ path: join(shots, "phone-continue.png") });
  await tapCanvasTop(page);
  await page.waitForTimeout(150);
  const back = await state(page, () => ({
    screen: window.drifter.screen, paused: window.drifter.paused, t: window.drifter.state.t,
  }));
  check(back.screen === "play" && back.paused, "tapping goes on with it, stopped");
  check(Math.abs(back.t - kept.t) < 1e-9, `at the same moment it was kept (${back.t.toFixed(3)} s)`);
  check(errors.length === 0, `no page errors (${errors.join("; ")})`);
  await context.close();
}

// ── inside the Android app ──────────────────────────────────────────────────
{
  const context = await browser.newContext(phone);
  await context.addInitScript(() => {
    window.SonicDrifterAndroid = {
      saveFile(name, text) { window.__exported = { name, length: text.length }; return `SAVED TO DOWNLOADS: ${name}`; },
    };
  });
  const page = await context.newPage();
  await page.goto(page_url);
  await page.waitForTimeout(200);
  check(await page.locator("#touch").isVisible(), "the app always shows the controls");
  await tapCanvasTop(page);
  await page.waitForTimeout(200);
  const said = await state(page, () => window.drifter.exportRun());
  const exported = await state(page, () => window.__exported);
  check(said.startsWith("SAVED TO DOWNLOADS") && exported.length > 10000,
    `export goes through the app's bridge (${exported?.name})`);
  check(await state(page, () => window.drifter.back() && window.drifter.paused), "the back gesture pauses a run");
  check(await state(page, () => window.drifter.back() && !window.drifter.paused), "and again resumes it");
  await context.close();
}

// ── a desktop is untouched ──────────────────────────────────────────────────
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.goto(page_url);
  await page.waitForTimeout(200);
  check(await page.locator("#touch").count() === 0, "a mouse-and-keyboard desktop gets no on-screen buttons");
  await context.close();
}

await browser.close();
console.log(`# ${checks} phone checks passed`);
