import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { startRun, latticePitch, kill, newBeast, step, reshape, enterWorld, type Run } from '../game/run.js';
import { cellFor } from '../game/lattice.js';
import { seatedGroup } from '../game/body.js';
import { beast } from '../game/beasts.js';
import { BLUEPRINTS, craft, newResonance, advanceResonance, resonanceSource, resonanceStep,
  seed32, wardHit, weave, realm, resonanceBirth, constructIds } from '../game/resonance.js';

const idle={move:{x:0,y:0},grip:false,dash:false};
function expedition():Run {
  const run=startRun(123);run.resonance=newResonance({seed:'123',trajectory:[]});
  run.cells=Array.from({length:12},()=>cellFor('4'));run.resonance.fragments=30;
  run.spawnIn=1e6;run.world.calm=1e6;return run;
}

test('data import preserves full seeds, ignores chart fields and bounds imported observations',()=>{
  const src=resonanceSource({schema:'resonarium.state.v2',natalSeed:1234567890,singles:[{f:220}],chart:{private:true}});
  assert.deepEqual(src,{seed:'1234567890',trajectory:[]});
  assert.equal(seed32('18446744073709551615'),0);
  assert.throws(()=>resonanceSource({schema:'resonarium.state.v2',natalSeed:2**60}));
  assert.throws(()=>resonanceSource({schema:'ResonariumBiosentinelExperiment',version:1,seed:'2',trajectory:[{t:1,K:2,R_mean:2,psi:0}]}));
  const s=newResonance(resonanceSource({schema:'ResonariumBiosentinelExperiment',version:1,seed:'2',trajectory:[{t:1,K:.02,R_mean:.42,psi:.7},{t:2,K:.01,R_mean:.2,psi:.1}]}));
  advanceResonance(s,.5);assert.equal(s.R,.42);advanceResonance(s,.7);assert.equal(s.R,.2);
});

test('coherence driver replays and its fixed steps are independent of frame partition',()=>{
  const a=newResonance({seed:'91234',trajectory:[]}),b=newResonance({seed:'91234',trajectory:[]});
  for(let i=0;i<120;i++)advanceResonance(a,1/120);
  for(let i=0;i<20;i++)advanceResonance(b,1/20);
  assert.deepEqual(a.theta,b.theta);assert.equal(a.R,b.R);assert.ok(a.R>=0&&a.R<=1);
});

test('forge places a real square crystal and charges exact cell and fragment costs',()=>{
  const run=expedition(),pitch=latticePitch(run),before=run.cells.length,resources=run.resonance!.fragments;
  assert.equal(craft(run,'ward'),'crafted');
  assert.equal(run.cells.length,before-4);assert.equal(run.resonance!.fragments,resources-3);
  assert.equal(run.structures.length,4);assert.equal(run.resonance!.constructs.length,1);
  for(const h of run.structures){assert.ok(Math.abs(h.x/pitch-Math.round(h.x/pitch))<1e-8);assert.equal(seatedGroup(h.hm),'4');}
  assert.equal(run.bodies[0].cells.length,4);
  const snapshot=JSON.stringify([run.structures,run.cells,run.nextId,run.resonance!.fragments]);
  assert.equal(craft(run,'condenser'),'occupied');assert.equal(JSON.stringify([run.structures,run.cells,run.nextId,run.resonance!.fragments]),snapshot);
});

test('sixfold motifs cannot counterfeit a tetragonal ward; off and invalid phases cost nothing',()=>{
  const run=expedition();run.cells=Array.from({length:6},()=>cellFor('622'));
  assert.equal(craft(run,'ward'),'need-tetragonal');assert.equal(run.cells.length,6);
  run.phase='birth';assert.equal(craft(run,'condenser'),'wrong-phase');
  run.phase='settle';run.resonance=null;assert.equal(craft(run,'loom'),'wrong-phase');
});

test('outside and unaffordable blueprints refuse before consuming resources',()=>{
  const run=expedition();run.you.x=run.bounds.x+run.bounds.w;
  assert.equal(craft(run,'condenser'),'outside');assert.equal(run.structures.length,0);
  run.resonance!.fragments=0;assert.equal(craft(run,'ward'),'need-fragments');
  assert.equal(run.cells.length,12);
});

test('condenser stores only while driven, then spends its reserve on stamina',()=>{
  const run=expedition();assert.equal(craft(run,'condenser'),'crafted');
  const c=run.resonance!.constructs[0];run.you.x=c.x;run.you.y=c.y;
  resonanceStep(run,1,false);assert.equal(c.energy,0);
  resonanceStep(run,1,true);assert.ok(c.energy>0&&c.energy<=8);
  const energy=c.energy;run.wave.stamina=50;resonanceStep(run,.1,false);
  assert.equal(run.wave.stamina,51);assert.ok(Math.abs(c.energy-(energy-1))<1e-12);
  run.wave.spent=true;const left=c.energy;resonanceStep(run,1,true);assert.equal(c.energy,left);
});

test('wards require charge, proximity and plane; removal cancels the benefit',()=>{
  const run=expedition();craft(run,'ward');const c=run.resonance!.constructs[0];
  run.you.x=c.x;run.you.y=c.y;run.gap=null;
  assert.equal(wardHit(run),false);c.energy=30;assert.equal(wardHit(run),true);assert.equal(c.energy,18);
  run.layer=1;assert.equal(wardHit(run),false);run.layer=0;
  run.structures.pop();reshape(run);assert.equal(run.resonance!.constructs.length,0);assert.equal(wardHit(run),false);
});

test('loom fabrication consumes fragments and stored charge, and obeys seated symmetry',()=>{
  const run=expedition();run.cells=Array.from({length:6},()=>cellFor('622'));
  assert.equal(craft(run,'loom'),'crafted');const c=run.resonance!.constructs[0];
  run.you.x=c.x;run.you.y=c.y;assert.equal(weave(run),'need-charge');
  c.energy=20;const n=run.cells.length,fragments=run.resonance!.fragments;
  assert.equal(weave(run),'woven');assert.equal(run.cells.length,n+1);assert.equal(run.cells.at(-1)!.group.hm,'222');
  assert.equal(c.energy,5);assert.equal(run.resonance!.fragments,fragments-1);
});

test('held predators pay fragments and encounter milestones reward once, advancing only at birth',()=>{
  const run=expedition(),s=run.resonance!;craft(run,'condenser');
  for(let i=0;i<2;i++){const e=newBeast(run,'faceter');run.entities.push(e);kill(run,e);}
  assert.equal(s.kills,2);const before=s.fragments;
  resonanceStep(run,.01,false);assert.equal(s.fragments,before+3);assert.equal(s.cleared,true);
  resonanceStep(run,.01,false);assert.equal(s.fragments,before+3);assert.equal(realm(s).name,'NUCLEATION GARDEN');
  resonanceBirth(run);assert.equal(realm(s).name,'BRAGG REEF');assert.equal(s.stageKills,2);assert.equal(s.cleared,false);
});

test('utility crystal cannot silently discharge in a reign and new enemies follow hold/strike rules',()=>{
  const run=expedition();craft(run,'ward');const ids=constructIds(run);
  run.phase='reign';run.throne.awake=true;run.throne.hp=100;run.throne.maxHp=100;run.throne.beat=1e6;
  run.throne.x=run.you.x+250e-6;run.throne.y=run.you.y;
  for(const h of run.structures)h.charge=1;
  step(run,{...idle,grip:true},.01);
  for(const id of ids)assert.ok(run.structures.some(h=>h.id===id));
  for(const species of ['faceter','dislocator','phason']) {
    const b=beast(species);assert.ok(b.hold>0);assert.ok(b.damage===0||b.wind>=.6);
    assert.ok(b.particle.radius>1.5e-6);
  }
});

test('disabled mode stays absent through normal simulation and ordinary births',()=>{
  const run=startRun(111);step(run,idle,.01);assert.equal(run.resonance,null);
  run.phase='birth';enterWorld(run);assert.equal(run.resonance,null);
  assert.equal(BLUEPRINTS.length,4);
  // Bare glass and no shifter: an ordinary run is at quadrature whatever the stick says.
  step(run,{...idle,trim:1},.01);assert.equal(run.wave.cross,Math.PI/2);
});
