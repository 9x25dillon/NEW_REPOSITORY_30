// Resonarium -> game boundary: data only. No natal data enters src/ physics.
// Coherence, charge, recipes and encounter rewards are explicit gameplay models.
import { type Run, latticePitch, retune, PLATES, THRONE_RADIUS } from './run.js';
import { snap, seatedGroup } from './body.js';
import { cellFor } from './lattice.js';
import { structureFrom } from './world.js';
import { catches } from './bound.js';
import { QUADRATURE, crossCoupling, rng, wavelength } from './wave.js';
import { nativeCross } from './plates.js';
import { together } from './depth.js';

export interface ResonanceFrame { t: number; K: number; R_mean: number; psi: number }
export interface ResonanceSource { seed: string; trajectory: ResonanceFrame[] }
export type Blueprint = 'condenser' | 'ward' | 'loom' | 'tap';
export interface Construct {
  kind: Blueprint; ids: number[]; energy: number; x: number; y: number; layer: number;
}
export interface Resonance {
  source: ResonanceSource; time: number; remainder: number; theta: number[]; omega: number[];
  K: number; R: number; psi: number; symbol: 'L' | 'S'; pulse: number; pulseTime: number;
  fragments: number; constructs: Construct[]; crafted: number; kills: number; blocks: number; woven: number;
  stage: number; stageKills: number; stageCrafts: number; cleared: boolean;
  /** Cross-phase: what the glass writes where you stand, the trim you are
   *  paying for on top of it, and how well your lattice matches |cos psi|. */
  native: number; trim: number; lock: number;
  /** For the report: seconds in a mesh, seconds locked, charge spent on trim,
   *  and motifs a tap has caught. */
  meshTime: number; lockTime: number; trimSpent: number; tapped: number;
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
  {kind:'tap',name:'QUADRATURE TAP',cost:2,sites:[[0,0],[1,1],[2,2]],description:'3 cells on a diagonal, the way the mesh runs. While your hand is a mesh (|cos φ| ≥ 0.5) within reach, it drinks passing motifs as charge.'},
];

// ── cross-phase, as a resource ──────────────────────────────────────────────
//
// The glass decides the cross-phase where you stand (game/plates.ts). A trim
// is a phase shifter in the Y pair's feed, and it is the one thing here that is
// a GAME RULE rather than a consequence: it runs on stored construct charge,
// so overriding the map costs what you banked, and an empty bank lets the glass
// have its way. The shifter slews rather than jumps, as a real one does.

/** Most trim the shifter can hold, rad. A quarter period reaches any shape. */
export const TRIM_RANGE = Math.PI / 2;
/** How fast it slews, rad/s. */
export const TRIM_SLEW = 2.4;
/** Charge per second at full trim; proportional below it. GAME CONSTANT. */
export const TRIM_DRAW = 3;
/** How near |cos phi| must come to |cos psi| to count, and what a perfect
 *  lock multiplies the shared charging budget by. GAME CONSTANTS. */
export const LOCK_WIDTH = 0.3;
export const LOCK_GAIN = 1;
/** |cos phi| at which the hand is a mesh and a tap opens. */
export const MESH_OPEN = 0.5;
/** How near a tap cell a motif is caught, m, and what one is worth. */
export const TAP_CATCH = 24e-6;
export const TAP_YIELD = 4;
export const CONSTRUCT_MAX = 40;
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
    stage:0,stageKills:0,stageCrafts:0,cleared:false,
    native:QUADRATURE,trim:0,lock:0,meshTime:0,lockTime:0,trimSpent:0,tapped:0};
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
  // THE LOCK. Your lattice's shape is |cos phi|; the coherence phase's is
  // |cos psi|, and it keeps moving. Matching them multiplies the shared budget.
  const mesh=Math.abs(crossCoupling(run.wave));
  s.lock=Math.max(0,1-Math.abs(mesh-Math.abs(Math.cos(s.psi)))/LOCK_WIDTH);
  if(mesh>=MESH_OPEN)s.meshTime+=dt;
  if(s.lock>=.5&&gripping)s.lockTime+=dt;
  let chargeBudget=8*(.25+.75*s.R)*(1+LOCK_GAIN*s.lock)*dt,transferBudget=10*dt;
  for(const c of s.constructs) {
    const hosts=c.ids.map(id=>live.get(id)!);
    c.x=hosts.reduce((v,h)=>v+h.x,0)/hosts.length;c.y=hosts.reduce((v,h)=>v+h.y,0)/hosts.length;c.layer=hosts[0].layer;
    if(hosts.some(h=>h.layer!==c.layer)){c.layer=-1;continue;}
    const near=c.layer===run.layer&&Math.hypot(c.x-run.you.x,c.y-run.you.y)<=FORGE_REACH;
    if(near&&gripping&&!run.wave.spent) {
      const add=Math.min(CONSTRUCT_MAX-c.energy,chargeBudget);c.energy+=add;chargeBudget-=add;
    } else if(near&&!gripping&&c.kind==='condenser') {
      const add=Math.min(c.energy,transferBudget,100-run.wave.stamina);
      run.wave.stamina+=add;c.energy-=add;transferBudget-=add;if(run.wave.stamina>25)run.wave.spent=false;
    }
  }
  if(mesh>=MESH_OPEN)drinkTaps(run,s,live);
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

/** Constructs whose cells all still stand, on one plane. */
function intact(run:Run,s:Resonance):Construct[] {
  const live=new Set(run.structures.map(h=>h.id));
  return s.constructs.filter(c=>c.layer>=0&&c.ids.every(id=>live.has(id)));
}
/** Stored charge the shifter can draw on. */
export function bank(run:Run):number {
  const s=run.resonance;return s?intact(run,s).reduce((v,c)=>v+c.energy,0):0;
}
/**
 * Set the pairs' timing for this frame: the glass where you stand, plus the
 * trim, which slews toward what the stick asks and is paid for as it is held.
 * Exactly QUADRATURE on an ordinary run, whatever the stick says.
 */
export function crossPhase(run:Run,trim:number,dt:number):void {
  const w=run.wave,s=run.resonance;
  if(!s){w.cross=QUADRATURE;return;}
  const native=nativeCross(PLATES,run.you.x,run.you.y,wavelength(w));s.native=native;
  const pool=intact(run,s).sort((a,b)=>b.energy-a.energy);
  const stored=pool.reduce((v,c)=>v+c.energy,0);
  const ask=Number.isFinite(trim)?Math.max(-1,Math.min(1,trim)):0;
  const want=stored>0?TRIM_RANGE*ask:0;
  if(Number.isFinite(dt)&&dt>0) {
    const step=TRIM_SLEW*dt;s.trim+=Math.max(-step,Math.min(step,want-s.trim));
    let owe=TRIM_DRAW*Math.abs(s.trim)/TRIM_RANGE*dt;
    for(const c of pool){if(owe<=0)break;const take=Math.min(c.energy,owe);c.energy-=take;owe-=take;s.trimSpent+=take;}
  }
  w.cross=s.trim===0?native:native+s.trim;
}
/** Taps near your hand drink the motifs the mesh has carried to them. Only
 *  runs while the hand is a mesh, and only over taps within reach — never an
 *  entity-by-structure product over the whole channel. */
function drinkTaps(run:Run,s:Resonance,live:Map<number,{x:number;y:number;layer:number}>):void {
  // Reach is to the NEAREST tap cell: a diagonal is long, and its middle sits
  // a pitch and a half from where you stood to build it.
  const open=s.constructs.filter(c=>c.kind==='tap'&&c.layer===run.layer&&c.energy<CONSTRUCT_MAX
    &&c.ids.some(id=>{const h=live.get(id);return !!h&&Math.hypot(h.x-run.you.x,h.y-run.you.y)<=FORGE_REACH;}));
  if(!open.length)return;
  const cells=open.flatMap(c=>c.ids.map(id=>({c,h:live.get(id)!})));
  const reach=FORGE_REACH+TAP_CATCH*4;
  run.entities=run.entities.filter(e=>{
    if(e.faction!=='motif'||!together(e.layer,run.layer)||Math.abs(e.x-run.you.x)>reach||Math.abs(e.y-run.you.y)>reach)return true;
    for(const {c,h} of cells) {
      if(c.energy<CONSTRUCT_MAX&&Math.hypot(h.x-e.x,h.y-e.y)<=TAP_CATCH) {
        c.energy=Math.min(CONSTRUCT_MAX,c.energy+TAP_YIELD);s.tapped++;
        run.events.push({kind:'quadrature',what:'tap',x:e.x,y:e.y});return false;
      }
    }
    return true;
  });
}
