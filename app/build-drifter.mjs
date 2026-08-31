// app/build-drifter.mjs — bundle SONIC DRIFTER into one self-contained file.
//
// The physics is NOT copy-pasted into the HTML. esbuild follows the real
// imports — app/drifter.ts -> game/wave.ts -> src/fields.ts -> src/gorkov.ts —
// so the shipped page contains the same Gor'kov potential the test suite runs
// against, and editing src/ changes the game. A pasted copy would drift from
// the library the first time either was touched.
//
//   node app/build-drifter.mjs          -> app/sonic-drifter.html (standalone)
//   node app/build-drifter.mjs --body   -> also writes the body-only variant
//                                          for hosts that supply their own
//                                          <head>, e.g. a published artifact.

import { build } from "esbuild";
import { writeFileSync } from "node:fs";

const result = await build({
  entryPoints: ["app/drifter.ts"],
  bundle: true,
  format: "iife",
  target: "es2020",
  platform: "browser",
  write: false,
  legalComments: "none",
});

const js = result.outputFiles[0].text;

const FONT = '<link rel="preconnect" href="https://fonts.googleapis.com">'
  + '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
  + '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&display=swap">';

// The page is an instrument panel, not a landing page: IBM Plex Mono is the
// face the rest of app/ already uses, the ground is a blue-black biased toward
// the field's own cyan rather than a neutral grey, and the canvas is the hero
// because a live field is the most characteristic thing this subject has.
// Deliberately single-theme - it is a lit screen in a dark room - so every
// colour is painted explicitly and nothing is inherited from the host.
const STYLE = `
  :root {
    --ground:#05070e; --panel:#0b1220; --rule:#16243a;
    --node:#78e1f5; --anti:#ff8cbe; --gold:#ffc94a;
    --ink:#cfe9f5; --muted:#4a6076; --faint:#2b3e50;
    --mono:"IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace;
  }
  * { box-sizing: border-box; }
  html, body { margin:0; padding:0; min-height:100%; background:var(--ground); }
  html, body, #stage, canvas { touch-action:none; -webkit-user-select:none; user-select:none; }
  body {
    display:flex; flex-direction:column; align-items:center; justify-content:center;
    gap:18px; padding:22px 16px 26px;
    font-family:var(--mono); color:var(--ink);
    -webkit-tap-highlight-color:transparent;
  }

  header { text-align:center; display:flex; flex-direction:column; gap:7px; }
  .mark {
    font-size:13px; font-weight:600; letter-spacing:0.42em;
    color:var(--node); text-indent:0.42em;
  }
  .sub {
    margin:0; max-width:56ch; font-size:11.5px; line-height:1.6;
    color:var(--muted); text-wrap:balance;
  }

  #stage { position:relative; line-height:0; }
  canvas {
    display:block; cursor:none; background:var(--ground);
    border:1px solid var(--rule); border-radius:2px;
    /* the bloom is the whole look: a cool halo off the field, and depth under it */
    box-shadow:
      0 0 0 1px rgba(120,225,245,0.07),
      0 0 70px rgba(60,150,200,0.16),
      0 26px 90px rgba(0,0,0,0.9);
  }
  canvas:focus-visible { outline:2px solid var(--node); outline-offset:4px; }

  /* Three chips, and they are not decoration: they are the three facts the
     simulation runs on - the two lattices, and the size below which neither
     of them can help you. */
  .legend {
    list-style:none; margin:0; padding:0;
    display:flex; flex-wrap:wrap; justify-content:center; gap:8px 22px;
    font-size:10.5px; color:var(--muted);
  }
  .legend li { display:flex; align-items:center; gap:8px; }
  .legend b { color:var(--ink); font-weight:600; letter-spacing:0.08em; }
  .dot { width:8px; height:8px; border-radius:50%; flex:none; }
  .dot.node { background:var(--node); box-shadow:0 0 9px rgba(120,225,245,0.75); }
  .dot.anti { background:var(--anti); box-shadow:0 0 9px rgba(255,140,190,0.6); }
  .dot.small { width:3px; height:3px; background:var(--gold); }

  .controls {
    margin:0; font-size:10px; letter-spacing:0.16em; color:var(--faint);
    text-align:center;
  }
  .controls kbd {
    font:inherit; color:var(--muted); border:1px solid var(--rule);
    border-radius:2px; padding:1px 5px;
  }

  @media (max-width: 880px) { .sub { font-size:11px; } }
  @media (prefers-reduced-motion: reduce) { * { animation:none !important; } }
`;

const BODY = `<header>
  <div class="mark">SONIC DRIFTER</div>
  <p class="sub">
    You are the field &mdash; a pair of crossed standing waves at 10&nbsp;MHz in water.
    One screen pixel is one micron. Every force here is the Gor&rsquo;kov radiation
    potential, computed live.
  </p>
</header>

<div id="stage">
  <canvas id="game" width="800" height="600" tabindex="0"
          aria-label="Sonic Drifter - an acoustic tweezer you play with one hand"></canvas>
</div>

<ul class="legend">
  <li><span class="dot node"></span><b>NODE</b> &Phi;&nbsp;&gt;&nbsp;0 &middot; denser than water &middot; falls in</li>
  <li><span class="dot anti"></span><b>ANTINODE</b> &Phi;&nbsp;&lt;&nbsp;0 &middot; lighter &middot; climbs out</li>
  <li><span class="dot small"></span><b>1.5&nbsp;&micro;m</b> below this, streaming wins</li>
</ul>

<p class="controls">
  <kbd>HOLD</kbd> pull &nbsp; <kbd>SHIFT</kbd> push &nbsp; <kbd>R</kbd> restart &nbsp; <kbd>M</kbd> mute
</p>

<script>${js}</script>`;

const standalone = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<meta name="theme-color" content="#05070e">
<meta name="robots" content="noindex">
<title>Sonic Drifter</title>
${FONT}
<style>${STYLE}</style>
</head>
<body>
${BODY}
</body>
</html>
`;

writeFileSync("app/sonic-drifter.html", standalone);
console.log(`app/sonic-drifter.html  ${(standalone.length / 1024).toFixed(1)} KiB`);

if (process.argv.includes("--body")) {
  writeFileSync(
    "app/sonic-drifter.body.html",
    `<title>Sonic Drifter</title>\n${FONT}\n<style>${STYLE}</style>\n${BODY}\n`,
  );
  console.log("app/sonic-drifter.body.html written");
}
