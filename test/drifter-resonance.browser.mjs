// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs CHROMIUM_PATH=/usr/bin/chromium node test/drifter-resonance.browser.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
const out=await fs.mkdtemp(path.join(os.tmpdir(),'drifter-resonance-'));
try {
  const page=await browser.newPage({viewport:{width:1200,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
  await page.goto(new URL('../app/sonic-drifter.html',import.meta.url).href);
  await page.waitForFunction(()=>!!window.drifter);
  for(const name of ['upgrade-inputs.js','battle-inputs.js']) {
    const checks=await page.evaluate(await fs.readFile(new URL('./fixtures/'+name,import.meta.url),'utf8'));
    console.log(name,checks.length,'checks');
  }
  await page.evaluate(()=>{window.drifter.screen='title';window.drifter.paused=false;});
  const source={schema:'resonarium.state.v2',natalSeed:1234567890,singles:[{on:true,f:220,lvl:1}],bins:[],sweeps:[]};
  await page.setInputFiles('#expedition-import',{name:'resonarium.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(source))});
  await page.waitForFunction(()=>document.getElementById('expedition-status').textContent.includes('1234567890'));
  await page.click('#expedition-start');
  const checks=await page.evaluate(()=>{
    const g=window.drifter,r=g.run,checks=[];
    const check=(ok,msg)=>{if(!ok)throw Error(msg);checks.push(msg);};
    check(r.resonance.source.seed==='1234567890','imported seed starts the actual run');
    check(r.cells.length===10&&r.resonance.fragments===6,'starter economy is explicit');
    check(!g.startExpedition({seed:'999',trajectory:[]}),'ongoing run cannot be replaced by the launch button');
    r.spawnIn=1e6;r.world.calm=1e6;r.entities=[];g.card=null;g.queued=[];
    const gp={index:0,connected:true,mapping:'standard',id:'Xbox Elite Series 2',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))};
    Object.defineProperty(navigator,'getGamepads',{value:()=>[gp],configurable:true});
    const press=(i,on)=>{gp.buttons[i]={pressed:on,value:on?1:0};g.update(1/60);};
    const tap=i=>{press(i,true);press(i,false);};g.update(1/60);
    tap(10);check(g.forgeOpen,'L3 opens the forge');
    const time=r.t;for(let i=0;i<20;i++)g.update(.05);check(r.t===time,'forge pauses the simulation');
    tap(3);check(g.forgeRotation===1,'Y rotates the blueprint by a lattice-compatible quarter turn');
    tap(2);check(r.resonance.constructs.length===1&&r.structures.length===3,'X assembles the preview geometry');
    check(r.cells.length===7&&r.resonance.fragments===4,'assembly consumes materials once');
    tap(2);check(r.cells.length===7&&r.resonance.fragments===4,'overlap rejection consumes nothing');
    g.draw();window.forgeShot=()=>g.draw();
    tap(10);check(!g.forgeOpen,'L3 closes without triggering build/lift');
    const c=r.resonance.constructs[0];r.you.x=c.x;r.you.y=c.y;g.steering=false;
    press(7,true);for(let i=0;i<80;i++)g.update(.05);press(7,false);
    check(c.energy>0,'actual grip charges the constructed condenser');
    r.wave.stamina=40;const energy=c.energy;for(let i=0;i<4;i++)g.update(.05);
    check(c.energy<energy&&r.wave.stamina>40,'release consumes stored energy for survival');
    // Stage progression still goes through birth; phase data does not teleport the player.
    r.resonance.kills=2;g.update(.01);check(r.resonance.cleared,'encounter objective detects kills plus construction');
    const proto={...r.entities[0],id:900,faction:'beast',parts:[],held:0,dwell:0,partner:-1,flash:0,spin:0,trail:[],wind:0,strike:0,sx:0,sy:0,cool:2,layer:r.layer,seized:0,ang:0};
    r.entities=['faceter','dislocator','phason'].map((species,i)=>({...proto,id:900+i,species,x:r.you.x+(i-1)*80e-6,y:r.you.y+120e-6}));
    g.card=null;g.queued=[];g.toastT=0;g.draw();
    check(g.report().includes('resonance:'),'report includes reproducible expedition state');
    window.resonanceTestPad={gp,tap};
    return checks;
  });
  console.log('Expedition:',checks.length,'checks');
  await page.screenshot({path:path.join(out,'expedition.png'),fullPage:true});
  await page.evaluate(()=>{window.resonanceTestPad.tap(10);window.drifter.draw();});
  await page.screenshot({path:path.join(out,'forge.png'),fullPage:true});
  // QUADRATURE: walk onto the metal, trim with the right stick, build a tap
  // through the real pad path, and look at the mesh and the sigil.
  const quad=await page.evaluate(()=>{
    const g=window.drifter,r=g.run,{gp,tap}=window.resonanceTestPad,checks=[];
    const check=(ok,msg)=>{if(!ok)throw Error(msg);checks.push(msg);};
    const frame=(n=1,dt=1/60)=>{for(let i=0;i<n;i++)g.update(dt);};
    if(g.forgeOpen)tap(10);
    r.entities=[];g.card=null;g.queued=[];
    frame(2);check(Math.abs(Math.cos(r.resonance.native))<.25,'the opening pool is near quadrature');
    r.bounds={x:0,y:0,w:4200e-6,h:3000e-6};
    r.you.x=2100e-6;r.you.y=450e-6;r.throne.x=3300e-6;r.throne.y=2400e-6;
    for(const c of r.resonance.constructs)c.energy=40;
    frame(3);check(Math.abs(Math.cos(r.resonance.native))>=.5,'the north band is metal: the glass writes a mesh');
    check(Math.abs(Math.cos(r.wave.cross))>=.5,'with no trim the hand runs at the native cross-phase');
    const bank0=r.resonance.constructs.reduce((v,c)=>v+c.energy,0);
    gp.axes=[0,0,1,0];frame(40);
    check(r.resonance.trim>1.5,'right stick trims the Y pair through the real pad path');
    check(r.resonance.constructs.reduce((v,c)=>v+c.energy,0)<bank0,'holding a trim spends banked charge');
    gp.axes=[0,0,0,0];frame(60);check(r.resonance.trim===0,'released, the shifter slews back to the glass');
    r.resonance.fragments=10;
    tap(10);check(g.forgeOpen,'forge reopens');
    for(let i=0;i<3;i++)tap(15);check(g.forgePick===3,'D-pad reaches the fourth blueprint');
    const before=r.resonance.constructs.length;tap(2);
    check(r.resonance.constructs.length===before+1&&r.resonance.constructs.at(-1).kind==='tap','the quadrature tap assembles on a diagonal');
    g.draw();tap(10);
    // Assembling retunes, and a retune re-derives the pool from the crystal;
    // this fixture opened the whole channel by hand, so it opens it again.
    r.bounds={x:0,y:0,w:4200e-6,h:3000e-6};r.you.x=2100e-6;r.you.y=450e-6;
    gp.buttons[7]={pressed:true,value:1};frame(30);
    check(Math.abs(Math.cos(r.wave.cross))>=.5&&r.wave.amplitude>0,'gripping in the band holds a mesh');
    check(g.report().includes('"tapped"')&&g.report().includes('"crossDeg"'),'report carries the cross-phase');
    for(let i=0;i<40;i++)g.draw();
    return checks;
  });
  console.log('Quadrature:',quad.length,'checks');
  await page.screenshot({path:path.join(out,'quadrature.png'),fullPage:true});
  await page.evaluate(()=>{const {gp}=window.resonanceTestPad;gp.axes=[0,0,.6,0];for(let i=0;i<30;i++)window.drifter.update(1/60);for(let i=0;i<5;i++)window.drifter.draw();});
  await page.screenshot({path:path.join(out,'quadrature-trim.png'),fullPage:true});
  await page.evaluate(()=>{const {gp}=window.resonanceTestPad;gp.axes=[0,0,0,0];gp.buttons[7]={pressed:false,value:0};window.drifter.update(1/60);});
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.drifter.draw());
  await page.screenshot({path:path.join(out,'mobile.png'),fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);
  console.log('Browser checks passed. Screenshots:',out);
} finally {await browser.close();}
