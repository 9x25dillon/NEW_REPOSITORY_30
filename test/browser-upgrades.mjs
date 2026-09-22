// Start headless Chromium with --remote-debugging-port=9222, then run:
// node test/browser-upgrades.mjs --interactions [--scene]
import { writeFile, readFile } from 'node:fs/promises';
const tabs = await (await fetch(`${process.env.CDP_URL ?? 'http://127.0.0.1:9222'}/json`)).json();
const tab = tabs.find(t => t.type === 'page');
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let seq = 0;
const pending = new Map();
const errors = [];
ws.onmessage = e => {
  const msg = JSON.parse(e.data);
  if (msg.id) { const p = pending.get(msg.id); if (p) { pending.delete(msg.id); msg.error ? p.reject(msg.error) : p.resolve(msg.result); } }
  if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails);
};
function send(method, params = {}) {
  return new Promise((resolve, reject) => { const id = ++seq; pending.set(id, {resolve, reject}); ws.send(JSON.stringify({id, method, params})); });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true});
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', {width: 1200, height: 1000, deviceScaleFactor: 1, mobile: false});
await send('Page.addScriptToEvaluateOnNewDocument', {source:'window.requestAnimationFrame=()=>0;'});
await send('Page.navigate', {url: new URL('../app/sonic-drifter.html', import.meta.url).href});
for (let i = 0; i < 60; i++) {
  await new Promise(r => setTimeout(r, 250));
  if (await evaluate('!!window.drifter')) break;
}
const initial = await evaluate(`(() => { const g = window.drifter; g.begin(); g.paused = true; return {screen:g.screen,phase:g.run.phase}; })()`);
console.log('Loaded:', initial);
const OUT = process.env.SHOT_DIR ?? '/tmp';
if (process.argv.includes('--interactions')) console.log('Checks:', await evaluate(await readFile(new URL('./fixtures/upgrade-inputs.js', import.meta.url), 'utf8')));
if (process.argv.includes('--battle')) console.log('Battle checks:', await evaluate(await readFile(new URL('./fixtures/battle-inputs.js', import.meta.url), 'utf8')));
if (process.argv.includes('--battle-scene')) {
  await evaluate(await readFile(new URL('./fixtures/battle-scene.js', import.meta.url), 'utf8'));
  const shoot = async (name) => {
    await new Promise(r => setTimeout(r, 200));
    const shot = await send('Page.captureScreenshot', {format:'png'});
    await writeFile(`${OUT}/${name}.png`, Buffer.from(shot.data,'base64'));
    console.log(`Screenshot ${OUT}/${name}.png`);
  };
  await evaluate(`(() => { const g = window.drifter; g.begin(); g.run.spawnIn = 1e6; g.run.world.calm = 1e6; })()`);
  await evaluate(`window.stageBattle('charge')`); await shoot('battle-charge');
  await evaluate(`window.stageBattle('shock')`); await shoot('battle-shock');
  await evaluate(`window.stageBattle('falter')`); await shoot('battle-falter');
  console.log('Birth:', JSON.stringify(await evaluate(`window.stageBirth()`))); await shoot('battle-birth');
  await evaluate(`window.stagePaused()`); await shoot('battle-paused');
  await evaluate(`window.stageDead()`); await shoot('battle-dead');
  await evaluate(`window.stageTitle()`); await shoot('battle-title');
}
if (process.argv.includes('--scene')) {
  await evaluate(`(() => {
    const g=window.drifter,r=g.run;
    r.world.aeon=3; r.world.name='THE LIVING REEF'; r.phase='reign';
    r.you.x=r.bounds.x+r.bounds.w/2;r.you.y=r.bounds.y+r.bounds.h/2;r.you.iframe=0;r.iframe=0;
    const x=r.you.x,y=r.you.y;
    r.throne={hm:'222',fed:['222'],mass:4,freedom:3,anchored:false,hp:18,maxHp:70,x:x+100e-6,y:y+90e-6,awake:true,beat:0.25,spin:0.5};
    r.bond.companions=[{form:'warden',hm:'222',rank:2}];r.bond.active=0;r.bond.progress=1.4;
    const proto=r.entities[0];
    r.entities=['ribbon','sentinel','husk','splitter','vesicle'].map((species,i)=>({...proto,id:100+i,faction:'beast',species,parts:[],x:x+(-160+i*75)*1e-6,y:y+160e-6,held:0,wind:i===0?0.4:0,strike:0,spin:0,layer:0}));
    const mk=(id,hx,hy)=>({id,hm:'222',x:hx,y:hy,layer:0,serves:[0],gait:0,lobes:[[1,0],[-1,0]],reach:42.8e-6,strength:4,charge:0,ruin:false});
    const p=r.spacing?(r.spacing.lo+r.spacing.hi)/2:r.world.pitch*1.3;
    r.structures=[[0,0],[0,1],[1,0],[1,1],[2,0],[3,0],[4,0]].map(([i,j],id)=>mk(id,x+(-180e-6+i*p),y-100e-6+j*p));
    r.bodies=[{cells:r.structures,hm:'222',mass:28,x:x-60e-6,y:y-70e-6,extent:160e-6}];
    r.organelles=[{hostId:0,energy:45,supplying:false}];
    r.wave.stamina=55;g.paused=false;g.card=null;g.queued=[];g.screen='play';
    g.pad.read=()=>({move:{x:0,y:0},grip:false,dash:false,place:false,placeDown:false,lift:false,crown:false,crownDown:false,cycle:0,confirm:false,pause:false,depth:0,mute:false});
    g.pad.connected=true;g.cam.x=r.bounds.x*1e6;g.cam.y=r.bounds.y*1e6;g.toastT=0;g.flash=0;g.shake=0;g.update=()=>{};g.draw();
  })()`);
  await new Promise(r => setTimeout(r, 250));
  const shot = await send('Page.captureScreenshot', {format:'png'});
  await writeFile('/tmp/sonic-upgrades.png', Buffer.from(shot.data,'base64'));
  console.log('Screenshot /tmp/sonic-upgrades.png');
}
console.log('Errors:', JSON.stringify(errors));
await writeFile('/tmp/sonic-browser-errors.json', JSON.stringify(errors));
ws.close();
if (errors.length) process.exitCode=1;
