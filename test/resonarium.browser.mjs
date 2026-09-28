// Optional end-to-end check: PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node test/resonarium.browser.mjs
// Playwright is a test tool only; Resonarium has no runtime dependency on it.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'resonarium-e2e-'));
const browser = await chromium.launch({ headless: true,
  ...(process.env.CHROMIUM_PATH ? {executablePath: process.env.CHROMIUM_PATH} : {}),
  args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({viewport:{width:1440,height:1100}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const network=[];page.on('request',r=>{if(/^https?:/.test(r.url()))network.push(r.url());});
  await page.addInitScript(()=>{
    window.testOscillators=[];
    const create=AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator=function(){
      const osc=create.call(this), state={osc,stopped:false};window.testOscillators.push(state);
      const stop=osc.stop.bind(osc);osc.stop=(...args)=>{state.stopped=true;return stop(...args);};
      return osc;
    };
  });
  await page.goto(new URL('../app/resonarium/index.html',import.meta.url).href);
  await page.click('#gate-accept');await page.click('#btn-demo');await page.click('#btn-anchor');
  assert.match(await page.locator('#seed-status').textContent(),/17468934514447348100/);
  const initial=await page.locator('#experiment-status').textContent();
  await page.check('#sentinel-active');await page.click('#btn-audio');
  const baseline=await page.evaluate(()=>window.testOscillators.slice(0,6).map(s=>s.osc.frequency.value));
  assert.equal(baseline.length,6); // Four natal oscillators plus two binaural carriers.
  await page.click('#btn-replay');await page.waitForTimeout(1600);
  assert.notEqual(await page.locator('#experiment-status').textContent(),initial);
  await page.uncheck('#sentinel-active');
  assert.equal(await page.locator('#btn-replay').textContent(),'Replay trajectory');
  assert.deepEqual(await page.evaluate(()=>window.testOscillators.slice(0,6).map(s=>s.osc.frequency.value)),baseline);
  assert.equal(await page.evaluate(()=>window.testOscillators.slice(6).every(s=>s.stopped)),true);
  assert.equal(await page.evaluate(()=>window.testOscillators.slice(0,6).every(s=>!s.stopped)),true);
  await page.click('#btn-audio');
  await page.click('#btn-falsify');
  await page.waitForFunction(()=>!document.getElementById('btn-falsify').disabled,{},{timeout:120000});
  assert.match(await page.locator('#falsification-result').textContent(),/p=/);
  const event=page.waitForEvent('download');await page.click('#btn-export');const download=await event;
  const exported=path.join(temporary,'state.json');await download.saveAs(exported);
  const state=JSON.parse(await fs.readFile(exported,'utf8'));
  assert.equal(state.natal_chart,undefined);assert.equal(state.natal_seed_intention,'');
  assert.equal(state.experiment.seed,'17468934514447348100');
  await page.setInputFiles('#import-file',exported);
  await page.waitForFunction(()=>document.getElementById('engine-status').textContent.includes('Trajectory loaded'));
  await page.setInputFiles('#import-file',path.join(root,'examples/resonarium/experiment.json'));
  await page.waitForFunction(()=>document.getElementById('experiment-status').textContent.startsWith('1/21'));
  assert.match(await page.locator('#falsification-result').textContent(),/not trusted/);
  await page.check('#sentinel-active');await page.click('#btn-replay');await page.waitForTimeout(100);
  await page.screenshot({path:path.join(temporary,'desktop.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:path.join(temporary,'mobile.png'),fullPage:true});
  // A malformed import must preserve the current session.
  const corrupted=structuredClone(state);corrupted.experiment.trajectory[0].fluence=900;
  const before=await page.locator('#seed-status').textContent();
  await page.setInputFiles('#import-file',{name:'bad.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(corrupted))});
  await page.waitForFunction(()=>document.getElementById('engine-status').textContent.startsWith('Import failed'));
  assert.equal(await page.locator('#seed-status').textContent(),before);
  // A supplied tonal state anchors through both paste and file import.
  const tones={schema:'resonarium.state.v2',natalSeed:1234567890,
    singles:[{on:true,f:220.0,lvl:.7071},{on:true,f:330.0,lvl:1}],
    bins:[{on:true,carrier:290.6684896666667,beat:7.930000000000746,lvl:.3}],sweeps:[]};
  await page.fill('#chart-json',JSON.stringify(tones));await page.click('#btn-anchor');
  assert.match(await page.locator('#seed-status').textContent(),/supplied seed 1234567890/);
  await page.click('#btn-audio');
  const active=await page.evaluate(()=>window.testOscillators.filter(s=>!s.stopped).map(s=>s.osc.frequency.value));
  // Web Audio AudioParam stores single-precision values; imported state keeps full precision.
  assert.ok(Math.abs(active[0]-tones.singles[0].f)<.0001);
  assert.ok(Math.abs(active[1]-tones.singles[1].f)<.0001);
  assert.ok(Math.abs(active[2]-(tones.bins[0].carrier-tones.bins[0].beat/2))<.0001);
  await page.click('#btn-audio');
  await page.setInputFiles('#import-file',{name:'tones.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(tones))});
  await page.waitForFunction(()=>document.getElementById('engine-status').textContent.includes('chart tones are ready'));
  const tonalEvent=page.waitForEvent('download');await page.click('#btn-export');const tonalDownload=await tonalEvent;
  const tonalExport=path.join(temporary,'tonal-state.json');await tonalDownload.saveAs(tonalExport);
  const tonalState=JSON.parse(await fs.readFile(tonalExport,'utf8'));
  assert.equal(tonalState.experiment.seed,'1234567890');
  assert.equal(tonalState.experiment.seedAlgorithm,'provided-uint64');
  assert.equal(tonalState.natal_tones,undefined);
  assert.deepEqual(errors,[]);assert.deepEqual(network,[]);
  console.log(`Browser checks passed; screenshots and round-trip JSON: ${temporary}`);
} finally { await browser.close(); }
