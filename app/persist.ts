// app/persist.ts — where a run is kept between visits to the page.
//
// The browser half of game/save.ts. That module turns a run into text and back
// and knows nothing about where the text goes; this one knows only where it
// goes. One slot, because there is one run: a second slot would be a way to
// keep a run you are losing and start another, which is the escape hatch the
// title screen's rules exist to not have.
//
// Every call here survives a browser that refuses storage — a private window,
// a page opened from disk under a strict policy, a full quota — and says so in
// words instead of throwing. Losing the ability to save must never cost the run
// that is on the screen.

import { type SaveHeader, SaveError, migrate } from "../game/save.js";

/** The run. Versioned inside the text, not in the key: a key per version would
 *  strand an old save where a newer build cannot find it to refuse it. */
export const RUN_KEY = "sonic-drifter.run";
/** Best score and deepest aeon, which outlive every run. */
export const PROFILE_KEY = "sonic-drifter.profile";

export interface Profile { best: number; deepest: number }

function storage(): Storage | null {
  try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; }
}

function reason(err: unknown): string {
  if (err instanceof SaveError) return err.message.toUpperCase();
  const name = (err as { name?: string } | null)?.name ?? "";
  if (name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED") {
    return "THE BROWSER'S STORAGE FOR THIS PAGE IS FULL";
  }
  return err instanceof Error ? err.message.toUpperCase() : "THE BROWSER REFUSED";
}

/** The stored run's text, or null if there is none (or no storage at all). */
export function readRun(): string | null {
  try { return storage()?.getItem(RUN_KEY) ?? null; } catch { return null; }
}

/** Keep this text as the run. Null on success, or why it could not be kept. */
export function writeRun(text: string): string | null {
  const s = storage();
  if (!s) return "THIS BROWSER KEEPS NOTHING FOR A PAGE OPENED THIS WAY";
  try { s.setItem(RUN_KEY, text); return null; } catch (err) { return reason(err); }
}

export function clearRun(): void {
  try { storage()?.removeItem(RUN_KEY); } catch { /* nothing to clear */ }
}

/**
 * What a stored run is, without restoring it — or why it cannot be read.
 *
 * Only the envelope is checked here (schema, version, header). The deep checks
 * and the trial frame happen in `restore`, when somebody actually asks to go on.
 */
export function peek(text: string): { header: SaveHeader } | { error: string } {
  try {
    return { header: migrate(JSON.parse(text)).header };
  } catch (err) {
    return { error: err instanceof SyntaxError ? "THE SAVED RUN IS NOT READABLE TEXT" : reason(err) };
  }
}

export function readProfile(): Profile {
  try {
    const raw = storage()?.getItem(PROFILE_KEY);
    const p = raw ? JSON.parse(raw) as Partial<Profile> : {};
    const n = (v: unknown, floor: number) =>
      typeof v === "number" && Number.isFinite(v) ? Math.max(floor, v) : floor;
    return { best: n(p.best, 0), deepest: n(p.deepest, 1) };
  } catch {
    return { best: 0, deepest: 1 };
  }
}

export function writeProfile(p: Profile): void {
  try { storage()?.setItem(PROFILE_KEY, JSON.stringify(p)); } catch { /* the run matters more */ }
}

/** What the Android app puts on `window`; see packaging/android. */
interface AndroidBridge { saveFile(name: string, text: string): string }

/**
 * Hand the player a file. The only way a run leaves the browser.
 *
 * Inside the Android app a blob link goes nowhere — a WebView has no download
 * manager for `blob:` URLs — so the app's bridge writes it to Downloads and
 * says where. Returns what to tell the player.
 */
export function download(name: string, text: string): string {
  const bridge = (window as unknown as { SonicDrifterAndroid?: AndroidBridge }).SonicDrifterAndroid;
  if (bridge) return bridge.saveFile(name, text);
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return "EXPORTED";
}

export { reason as describeSaveError };
