// Resonarium -> game boundary: data only. No natal data enters src/ physics.
// Coherence, charge, recipes and encounter rewards are explicit gameplay models.
import { type Run, latticePitch, retune, THRONE_RADIUS } from './run.js';
import { snap, seatedGroup } from './body.js';
import { cellFor } from './lattice.js';
import { structureFrom } from './world.js';
import { catches } from './bound.js';
import { rng } from './wave.js';

export interface ResonanceFrame { t: number; K: number; R_mean: number; psi: number }
export interface ResonanceSource { seed: string; trajectory: ResonanceFrame[] }
export type Blueprint = 'condenser' | 'ward' | 'loom';
export interface Construct {
  kind: Blueprint; ids: number[]; energy: number; x: number; y: number; layer: number;
}
export interface Resonance {
  source: ResonanceSource; time: number; remainder: number; theta: number[]; omega: number[];
  K: number; R: number; psi: number; symbol: 'L' | 'S'; pulse: number; pulseTime: number;
  fragments: number; constructs: Construct[]; crafted: number; kills: number; blocks: number; woven: number;
  stage: number; stageKills: number; stageCrafts: number; cleared: boolean;
}
export const REALMS = [
  { name: 'NUCLEATION GARDEN', enemy: 'faceter', kills: 2, crafts: 1, reward: 3 },
  { name: 'BRAGG REEF', enemy: 'dislocator', kills: 4, crafts: 2, reward: 5 },
  { name: 'PHASON DEEP', enemy: 'phason', kills: 6, crafts: 3, reward: 8 },
] as const;
export const BLUEPRINTS: ReadonlyArray<{kind:Blueprint;name:string;cost:number;sites:readonly (readonly [number,number])[];description:string}> = [
  {kind:'condenser',name:'PHASE CONDENSER',cost:2,sites:[[0,0],[1,0],[2,0]],description:'3 cells in a rail. Grip nearby to store coherence charge; release to recover stamina.'},
  {kind:'ward',name:'BRAGG WARD',cost:3,sites:[[0,0],[1,0],[1,1],[0,1]],description:'4 tetragonal cells (4 or 422) in a square. 12 charge blocks a hit nearby (6 when the real band gap aligns).'},
  {kind:'loom',name:'LATTICE LOOM',cost:3,sites:[[0,0],[1,0],[0,1]],description:'3 cells in an L. Store charge, then weave a cell for 1 fragment and 15 charge. Output follows the seated host group.'},
];
export const FORGE_REACH = 110e-6;
export const MAX_CONSTRUCTS = 24;
export function seed32(seed:string):number {
  if(!/^(0|[1-9][0-9]{0,19})$/.test(seed))throw Error('Expected a decimal uint64 seed');
  const n=BigInt(seed);if(n>18446744073709551615n)throw Error('Seed exceeds uint64');
  return Number((n^(n>>32n))&0xffffffffn);
}
/** Accept only bounded model observations; never import chart, tone or device parameters. */
export function resonanceSource(raw: unknown): ResonanceSource {
  if(!raw || typeof raw!=='object')throw Error('Expected a Resonarium JSON object');
  const root=raw as Record<string,unknown>;
  const obj=(root.schema==='ResonariumEmergenceState'?root.experiment:root) as Record<string,unknown>;
  if(!obj||!['resonarium.state.v2','ResonariumBiosentinelExperiment'].includes(String(obj.schema)))throw Error('Use a Resonarium tonal state or experiment export');
  const value=obj.schema==='resonarium.state.v2'?obj.natalSeed:obj.seed;
  if(typeof value!=='string' && (typeof value!=='number'||!Number.isSafeInteger(value)||value<0))throw Error('Unsafe seed; use a decimal string');
  const seed=String(value);seed32(seed);
  const trajectory:ResonanceFrame[]=[];
  if(obj.schema==='ResonariumBiosentinelExperiment') {
    if(obj.version!==1||!Array.isArray(obj.trajectory)||!obj.trajectory.length||obj.trajectory.length>377)throw Error('Unsupported experiment trajectory');
    let last=0;
    for(const value of obj.trajectory) {
      const r=value as ResonanceFrame;
      if(!r||![r.t,r.K,r.R_mean,r.psi].every(v=>typeof v==='number'&&Number.isFinite(v))||r.t<=last||r.t>10000||r.K<0||r.K>12||r.R_mean<0||r.R_mean>1+1e-12||Math.abs(r.psi)>Math.PI+1e-12)throw Error('Invalid trajectory observation');
      trajectory.push({t:r.t,K:r.K,R_mean:Math.min(1,r.R_mean),psi:r.psi});last=r.t;
    }
  }
  return {seed,trajectory};
}
export function newResonance(source:ResonanceSource):Resonance {
  const random=rng(seed32(source.seed));
  return {source:{seed:source.seed,trajectory:source.trajectory.map(r=>({...r}))},time:0,remainder:0,
    theta:Array.from({length:24},()=>random()*Math.PI*2),omega:Array.from({length:24},()=>.35+(random()-.5)*.9),
    K:0,R:0,psi:0,symbol:'L',pulse:0,pulseTime:0,fragments:6,constructs:[],crafted:0,kills:0,blocks:0,woven:0,
    stage:0,stageKills:0,stageCrafts:0,cleared:false};
}
let word='L';for(let i=0;i<10;i++)word=[...word].map(c=>c==='L'?'LS':'L').join('');
/** Fixed-step toy coherence driver, or direct playback of imported observations. */
export function advanceResonance(s:Resonance,dt:number):void {
  if(!Number.isFinite(dt)||dt<=0)return;
  s.time+=dt;
  if(s.source.trajectory.length) {
    const rows=s.source.trajectory, t=s.time%rows[rows.length-1].t;
    const row=rows.find(r=>r.t>t)??rows[rows.length-1];
    s.K=row.K;s.R=row.R_mean;s.psi=row.psi;return;
  }
  const h=1/120;s.remainder+=dt;
  while(s.remainder+1e-12>=h) {
    s.remainder=Math.max(0,s.remainder-h);s.symbol=word[s.pulse%word.length] as 'L'|'S';
    const intensity=s.symbol==='L'?Math.sqrt(2.2):1/Math.sqrt(2.2);
    s.K=.8*intensity;s.pulseTime+=h;
    if(s.pulseTime>=1/intensity){s.pulseTime-=1/intensity;s.pulse++;}
    let x=0,y=0;for(const v of s.theta){x+=Math.cos(v);y+=Math.sin(v);}
    const R=Math.hypot(x,y)/s.theta.length,psi=Math.atan2(y,x);
    s.theta=s.theta.map((v,i)=>{const a=v+h*(s.omega[i]+s.K*R*Math.sin(psi-v));return Math.atan2(Math.sin(a),Math.cos(a));});
    x=0;y=0;for(const v of s.theta){x+=Math.cos(v);y+=Math.sin(v);}s.R=Math.hypot(x,y)/s.theta.length;s.psi=Math.atan2(y,x);
  }
}
export function realm(s:Resonance) {return REALMS[Math.min(s.stage,REALMS.length-1)];}
export function blueprintSites(run:Run,kind:Blueprint,rotation=0):Array<{x:number;y:number}> {
  const recipe=BLUEPRINTS.find(b=>b.kind===kind)!;const pitch=latticePitch(run),at=snap(run.you.x,run.you.y,pitch);
  return recipe.sites.map(([a,b])=>{let x=a,y=b;for(let i=0;i<rotation;i++){const old=x;x=-y;y=old;}return {x:at.x+x*pitch,y:at.y+y*pitch};});
}
export type ForgeResult='crafted'|'need-cells'|'need-fragments'|'need-tetragonal'|'occupied'|'outside'|'wrong-phase'|'limit'|'need-loom'|'need-charge'|'woven';
export function craft(run:Run,kind:Blueprint,rotation=0):ForgeResult {
  if(!Number.isInteger(rotation)||rotation<0||rotation>3)return 'wrong-phase';
  const s=run.resonance;if(!s||!['settle','reign'].includes(run.phase))return 'wrong-phase';
  if(s.constructs.length>=MAX_CONSTRUCTS)return 'limit';
  const recipe=BLUEPRINTS.find(b=>b.kind===kind);if(!recipe)return 'wrong-phase';
  if(s.fragments<recipe.cost)return 'need-fragments';
  const eligible=run.cells.map((c,i)=>({c,i})).filter(({c})=>kind!=='ward'||['4','422'].includes(seatedGroup(c.group.hm)));
  if(eligible.length<recipe.sites.length)return kind==='ward'&&run.cells.length>=4?'need-tetragonal':'need-cells';
  const sites=blueprintSites(run,kind,rotation),pitch=latticePitch(run),b=run.bounds;
  for(const at of sites) {
    if(at.x<b.x||at.y<b.y||at.x>b.x+b.w||at.y>b.y+b.h||Math.hypot(at.x-run.throne.x,at.y-run.throne.y)<THRONE_RADIUS)return 'outside';
    if(run.structures.some(host=>Math.hypot(host.x-at.x,host.y-at.y)<pitch*.5))return 'occupied';
  }
  const chosen=eligible.slice(0,sites.length);
  const hosts=sites.map((at,i)=>structureFrom(run.nextId++,chosen[i].c.group.hm,at.x,at.y,run.layer));
  run.structures.push(...hosts);
  for(const {i} of chosen.sort((a,b)=>b.i-a.i))run.cells.splice(i,1);
  s.fragments-=recipe.cost;s.crafted++;
  s.constructs.push({kind,ids:hosts.map(h=>h.id),energy:0,x:hosts.reduce((v,h)=>v+h.x,0)/hosts.length,
    y:hosts.reduce((v,h)=>v+h.y,0)/hosts.length,layer:run.layer});
  run.events.push({kind:'resonance',text:recipe.name+' ASSEMBLED'});retune(run);return 'crafted';
}
export function constructIds(run:Run):Set<number> {return new Set(run.resonance?.constructs.flatMap(c=>c.ids)??[]);}
export function weave(run:Run):ForgeResult {
  const s=run.resonance;if(!s||!['settle','reign'].includes(run.phase))return 'wrong-phase';
  const c=s.constructs.find(c=>c.kind==='loom'&&c.layer===run.layer&&Math.hypot(c.x-run.you.x,c.y-run.you.y)<=FORGE_REACH);
  if(!c||!c.ids.every(id=>run.structures.some(h=>h.id===id)))return 'need-loom';
  if(s.fragments<1)return 'need-fragments';if(c.energy<15)return 'need-charge';
  const host=run.structures.find(h=>h.id===c.ids[0])!;
  run.cells.push(cellFor(seatedGroup(host.hm)));s.fragments--;c.energy-=15;s.woven++;
  run.events.push({kind:'resonance',text:'LOOM WOVE '+seatedGroup(host.hm)});return 'woven';
}
/** Once per frame; bounded construct bank, one structure index, no entity/structure cross product. */
export function resonanceStep(run:Run,dt:number,gripping:boolean):void {
  const s=run.resonance;if(!s)return;advanceResonance(s,dt);
  const live=new Map(run.structures.map(h=>[h.id,h]));
  s.constructs=s.constructs.filter(c=>c.ids.every(id=>live.has(id)));
  let chargeBudget=8*(.25+.75*s.R)*dt,transferBudget=10*dt;
  for(const c of s.constructs) {
    const hosts=c.ids.map(id=>live.get(id)!);
    c.x=hosts.reduce((v,h)=>v+h.x,0)/hosts.length;c.y=hosts.reduce((v,h)=>v+h.y,0)/hosts.length;c.layer=hosts[0].layer;
    if(hosts.some(h=>h.layer!==c.layer)){c.layer=-1;continue;}
    const near=c.layer===run.layer&&Math.hypot(c.x-run.you.x,c.y-run.you.y)<=FORGE_REACH;
    if(near&&gripping&&!run.wave.spent) {
      const add=Math.min(40-c.energy,chargeBudget);c.energy+=add;chargeBudget-=add;
    } else if(near&&!gripping&&c.kind==='condenser') {
      const add=Math.min(c.energy,transferBudget,100-run.wave.stamina);
      run.wave.stamina+=add;c.energy-=add;transferBudget-=add;if(run.wave.stamina>25)run.wave.spent=false;
    }
  }
  const level=realm(s);
  if(!s.cleared&&s.kills-s.stageKills>=level.kills&&s.crafted-s.stageCrafts>=level.crafts) {
    s.fragments+=level.reward;s.cleared=true;
    run.events.push({kind:'resonance',text:level.name+' CLEARED · +'+level.reward+' FRAGMENTS · CROWN TO ADVANCE'});
  }
}
export function wardHit(run:Run):boolean {
  const s=run.resonance;if(!s)return false;
  const cost=gapAligned(run)?6:12;
  const c=s.constructs.find(c=>c.kind==='ward'&&c.energy>=cost&&c.layer===run.layer&&Math.hypot(c.x-run.you.x,c.y-run.you.y)<=FORGE_REACH);
  if(!c)return false;
  c.energy-=cost;s.blocks++;return true;
}
export function resonanceKill(run:Run,species:string):void {
  const s=run.resonance;if(!s)return;s.kills++;s.fragments=Math.min(999,s.fragments+(REALMS.some(r=>r.enemy===species)?2:1));
}
export function resonanceBirth(run:Run):void {
  const s=run.resonance;if(!s||!s.cleared)return;
  s.stage=(s.stage+1)%REALMS.length;s.stageKills=s.kills;s.stageCrafts=s.crafted;s.cleared=false;
}
/** Real band-gap calculation is displayed as a fabrication diagnostic, never fabricated by the overlay. */
export function gapAligned(run:Run):boolean {return catches(run.gap,run.bound.omega);}
