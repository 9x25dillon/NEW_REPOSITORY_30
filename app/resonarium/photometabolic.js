// SPDX-License-Identifier: AGPL-3.0-only
/* Photometabolic model and replay contract. No DOM, audio, device physics or network.
 * The simulation is a hypothetical transduction model; projection is sonification.
 * Loaded as a classic script so the imported Resonarium still works on file://.
 */
(function (root) {
  'use strict';
  const MASK = (1n << 64n) - 1n;
  const IV = [0x6a09e667f3bcc908n,0xbb67ae8584caa73bn,0x3c6ef372fe94f82bn,0xa54ff53a5f1d36f1n,
    0x510e527fade682d1n,0x9b05688c2b3e6c1fn,0x1f83d9abfb41bd6bn,0x5be0cd19137e2179n];
  const SIGMA = [[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15],
    [14,10,4,8,9,15,13,6,1,12,0,2,11,7,5,3],[11,8,12,0,5,2,15,13,10,14,3,6,7,1,9,4],
    [7,9,3,1,13,12,11,14,2,6,5,10,4,0,15,8],[9,0,5,7,2,4,10,15,14,1,11,12,6,8,3,13],
    [2,12,6,10,0,11,8,3,4,13,7,5,15,14,1,9],[12,5,1,15,14,13,4,10,0,7,6,3,9,2,8,11],
    [13,11,7,14,12,1,3,9,5,0,15,4,8,6,2,10],[6,15,14,9,11,3,0,8,12,2,13,7,1,4,10,5],
    [10,2,8,4,7,6,1,5,15,11,9,14,3,12,13,0]];
  const rot = (x, n) => ((x >> BigInt(n)) | (x << BigInt(64-n))) & MASK;
  // BLAKE2b with digest_size=8 (not a truncation of the 64-byte digest).
  function deriveSeed(text) {
    const bytes = new TextEncoder().encode(text), h = IV.slice();
    h[0] ^= 0x01010008n;
    for (let off=0; off<Math.max(1,bytes.length); off+=128) {
      const size=Math.min(128,bytes.length-off), m=Array(16).fill(0n), v=h.concat(IV);
      for(let i=0;i<size;i++) m[i>>3] |= BigInt(bytes[off+i]) << BigInt(8*(i%8));
      v[12] ^= BigInt(off+size);
      if(off+size===bytes.length) v[14] ^= MASK;
      const g=(a,b,c,d,x,y)=>{
        v[a]=(v[a]+v[b]+x)&MASK; v[d]=rot(v[d]^v[a],32);
        v[c]=(v[c]+v[d])&MASK; v[b]=rot(v[b]^v[c],24);
        v[a]=(v[a]+v[b]+y)&MASK; v[d]=rot(v[d]^v[a],16);
        v[c]=(v[c]+v[d])&MASK; v[b]=rot(v[b]^v[c],63);
      };
      for(let r=0;r<12;r++) {
        const s=SIGMA[r%10];
        g(0,4,8,12,m[s[0]],m[s[1]]);g(1,5,9,13,m[s[2]],m[s[3]]);
        g(2,6,10,14,m[s[4]],m[s[5]]);g(3,7,11,15,m[s[6]],m[s[7]]);
        g(0,5,10,15,m[s[8]],m[s[9]]);g(1,6,11,12,m[s[10]],m[s[11]]);
        g(2,7,8,13,m[s[12]],m[s[13]]);g(3,4,9,14,m[s[14]],m[s[15]]);
      }
      for(let i=0;i<8;i++) h[i] ^= v[i]^v[i+8];
    }
    let seed=0n;
    for(let i=0;i<8;i++) seed=(seed<<8n)|((h[0]>>BigInt(8*i))&255n);
    return seed;
  }
  function seedValue(seed) {
    if(typeof seed==='number' || !/^(0|[1-9][0-9]{0,19})$/.test(String(seed))) throw Error('Seed must be a decimal uint64 string');
    const v=BigInt(seed); if(v>MASK) throw Error('Seed exceeds uint64'); return v;
  }
  function random(seed) {
    const b=seedValue(seed); let a=Number((b^(b>>32n))&0xffffffffn);
    return ()=>{ a=(a+0x6d2b79f5)|0; let t=Math.imul(a^(a>>>15),a|1);
      t^=t+Math.imul(t^(t>>>7),t|61); return ((t^(t>>>14))>>>0)/4294967296; };
  }
  const normal = rng => Math.sqrt(-2*Math.log(Math.max(rng(),1/4294967296)))*Math.cos(2*Math.PI*rng());
  const defaults=Object.freeze({N:64,depth:9,J0:1,ratio:2.2,intensity_mw:1000,kappa:0.011,K_max:12,dt:0.008,n:16,k:0.72,omega_std:0.45});
  function config(raw={}) {
    const c={...defaults,...raw};
    const ranges={N:[2,256],depth:[1,12],J0:[0.0001,10],ratio:[1.000001,5],intensity_mw:[100,10000],
      kappa:[0,10],K_max:[0,12],dt:[0.001,0.05],n:[0,64],k:[0,1],omega_std:[0,3]};
    for(const [key,[lo,hi]] of Object.entries(ranges))
      if(typeof c[key]!=='number'||!Number.isFinite(c[key])||c[key]<lo||c[key]>hi) throw Error('Invalid parameter: '+key);
    if(!Number.isInteger(c.N)||!Number.isInteger(c.depth)) throw Error('N and depth must be integers');
    const estimate = fibonacci(c.depth).length * 1e3*c.J0*Math.sqrt(c.ratio)/c.intensity_mw/c.dt*c.N;
    if(estimate>1e8) throw Error('Experiment exceeds interactive work budget; reduce dose, depth or oscillator count');
    return Object.freeze(Object.fromEntries(Object.keys(defaults).map(k=>[k,c[k]])));
  }
  function fibonacci(depth,start='L') { let s=start; for(let i=0;i<depth;i++)s=[...s].map(c=>c==='L'?'LS':'L').join(''); return s; }
  function pulse(symbol,c) {
    if(symbol!=='L'&&symbol!=='S') throw Error('Invalid symbol');
    const intensity=c.intensity_mw*(symbol==='L'?Math.sqrt(c.ratio):1/Math.sqrt(c.ratio));
    return {intensity,duration_ms:1e6*c.J0/intensity,fluence:c.J0,K:Math.min(c.K_max,c.kappa*intensity/1000)};
  }
  class Engine {
    constructor(seed,params={}) {
      this.seed=seedValue(seed).toString(); this.config=config(params); const c=this.config,rng=random(this.seed);
      this.symbols=fibonacci(c.depth,random(this.seed)()<0.7?'L':'S'); this.log=[];this.t=0;
      const base=0.35+0.15*Number(BigInt(this.seed)%7n)/7;
      this.omega=Array.from({length:c.N},()=>base+c.omega_std*normal(rng));
      this.theta=Array.from({length:c.N},()=>rng()*2*Math.PI-Math.PI);
      const indices=Array.from({length:c.N},(_,i)=>i);
      for(let i=indices.length-1;i>0;i--) {const j=Math.floor(rng()*(i+1));[indices[i],indices[j]]=[indices[j],indices[i]];}
      this.active=indices.slice(0,Math.min(c.N,Math.max(1,Math.floor(c.N*Math.min(1,c.n/25)))));
    }
    order() {let x=0,y=0;for(const i of this.active){x+=Math.cos(this.theta[i]);y+=Math.sin(this.theta[i]);}
      return {R:Math.hypot(x,y)/this.active.length,psi:Math.atan2(y,x)};}
    step(K,dt) {
      const c=this.config,{R,psi}=this.order(),eff=Math.min(K*(0.7+0.3*c.k),c.K_max);
      this.theta=this.theta.map((v,i)=>{const next=v+dt*(this.omega[i]+(eff*R+0.15*c.k)*Math.sin(psi-v));return Math.atan2(Math.sin(next),Math.cos(next));});
      this.t+=dt;return this.order();
    }
    next(symbol=this.symbols[this.log.length]) {
      if(!symbol)return null;
      const p=pulse(symbol,this.config),duration=p.duration_ms/1000,start=this.t;
      let remaining=duration,sum=0,x=0,y=0;
      while(remaining>1e-12) {const dt=Math.min(this.config.dt,remaining),o=this.step(p.K,dt);
        sum+=o.R*dt;x+=Math.cos(o.psi)*dt;y+=Math.sin(o.psi)*dt;remaining-=dt;}
      this.t=start+duration;
      const row={index:this.log.length,symbol,...p,R_mean:sum/duration,psi:Math.atan2(y,x),t:this.t};
      this.log.push(row);return row;
    }
    run(symbols=this.symbols) { for(const s of symbols)this.next(s);return this.log; }
  }
  function decode(log,eps=0.015) {return log.slice(1).map((r,i)=>r.R_mean/Math.max(log[i].R_mean,1e-9)>1+eps?'+':'-').join('');}
  function mutualInformation(a,b) {
    if(a.length!==b.length)throw Error('Length mismatch');if(!a.length)return 0;
    const x={},y={},xy={};for(let i=0;i<a.length;i++){x[a[i]]=(x[a[i]]||0)+1;y[b[i]]=(y[b[i]]||0)+1;const k=a[i]+b[i];xy[k]=(xy[k]||0)+1;}
    let mi=0;for(const [key,count] of Object.entries(xy))mi+=count/a.length*Math.log2(count*a.length/(x[key[0]]*y[key[1]]));return mi;
  }
  // AAFT: rank-Gaussianize (seeded tie breaking), randomize Fourier phases,
  // then restore the binary amplitude distribution. Spectrum is approximate.
  function surrogate(symbols,rng) {
    const n=symbols.length, re=[],im=[];
    if(n<4)return symbols;
    const gaussian=Array.from({length:n},()=>normal(rng)).sort((a,b)=>a-b);
    const order=[...symbols].map((s,i)=>({s,i,tie:rng()})).sort((a,b)=>(a.s==='L'?1:0)-(b.s==='L'?1:0)||a.tie-b.tie||a.i-b.i);
    const input=Array(n);order.forEach((item,rank)=>{input[item.i]=gaussian[rank];});
    for(let k=0;k<=Math.floor(n/2);k++) {let a=0,b=0;for(let j=0;j<n;j++){const t=2*Math.PI*k*j/n;a+=input[j]*Math.cos(t);b-=input[j]*Math.sin(t);}
      const phi=k===0||(n%2===0&&k===n/2)?Math.atan2(b,a):(rng()*2-1)*Math.PI;
      re[k]=Math.hypot(a,b)*Math.cos(phi);im[k]=Math.hypot(a,b)*Math.sin(phi);}
    const values=Array.from({length:n},(_,j)=>{let v=re[0];for(let k=1;k<=Math.floor(n/2);k++){const a=2*Math.PI*k*j/n;v+=(n%2===0&&k===n/2?1:2)*(re[k]*Math.cos(a)-im[k]*Math.sin(a));}return {j,v:v/n};});
    values.sort((a,b)=>a.v-b.v||a.j-b.j);const out=Array(n).fill('S'),count=[...symbols].filter(c=>c==='L').length;
    for(const {j} of values.slice(n-count))out[j]='L';return out.join('');
  }
  async function falsify(seed,params={},count=39,onProgress=()=>{}) {
    if(!Number.isInteger(count)||count<1||count>199)throw Error('Invalid surrogate count');
    const c=config({...params,depth:Math.min(params.depth||9,9)}),engine=new Engine(seed,c);engine.run();
    const mi=mutualInformation(engine.symbols.slice(1),decode(engine.log));
    const rng=random((seedValue(seed)^0xaa17f00dn).toString()),scores=[];
    for(let i=0;i<count;i++) {
      const symbols=surrogate(engine.symbols,rng),other=new Engine(seed,c);other.run(symbols);
      scores.push(mutualInformation(symbols.slice(1),decode(other.log)));onProgress(i+1,count);
      await new Promise(resolve=>setTimeout(resolve,0));
    }
    const mean=scores.reduce((a,b)=>a+b,0)/count,sd=Math.sqrt(scores.reduce((a,b)=>a+(b-mean)**2,0)/count);
    return {method:'aaft-randomized-ties',seed:String(seed),config:c,n_surrogates:count,true_MI:mi,surrogate_mean:mean,
      surrogate_std:sd,gap_sigma:sd>1e-12?(mi-mean)/sd:null,p_value:(1+scores.filter(x=>x>=mi-1e-12).length)/(count+1),
      surrogate_MIs:scores,interpretation:'Monte Carlo comparison under an approximate spectral null; not evidence of physiological effects or composition-invariant decoding.'};
  }
  function project(base,index,row,params,enabled) {
    if(!enabled||!row)return {frequency:base,gain:0,phase:0,deform:0};
    const displacement=Math.sin(row.psi+index*2.399963229728653)*(1-params.k)*params.perturb*(1+index/Math.max(1,params.n)*params.spread);
    return {frequency:Math.max(20,Math.min(18000,base+displacement)),gain:(0.15+0.85*row.R_mean**1.4)*0.12/Math.max(8,params.n),phase:row.psi,deform:0.22*row.R_mean};
  }
  function modesFor(log) {return log.slice(-12).map((r,i)=>{const l=1+i%7;return {freq:144+r.K*18+r.R_mean*90,l,m:i%(2*l+1)-l,
    amplitude:0.12+0.45*r.R_mean,phase:r.psi,family:'biosentinel',on:true,visualFreq:Math.min(2.5,0.4+r.K*0.08)};});}
  function exportExperiment(engine,result=null) {return {schema:'ResonariumBiosentinelExperiment',version:1,seed:engine.seed,
    seedAlgorithm:'blake2b-64-be',engine:'portable-mulberry32-boxmuller-v1',units:{intensity:'mW/cm2',duration_ms:'ms',fluence:'J/cm2',t:'s',K:'model units'},
    config:engine.config,symbols:engine.log.map(r=>r.symbol).join(''),trajectory:engine.log.map(r=>({...r})),modes:modesFor(engine.log),falsification:result};}
  // Existing Resonarium tonal exports already contain the bedrock pitches.
  // Preserve their seed as supplied: its original hash algorithm is unknown.
  function parseTonalState(raw) {
    if (!raw || raw.schema !== 'resonarium.state.v2') throw Error('Unsupported tonal state');
    let input = raw.natalSeed;
    if (typeof input === 'number') {
      if (!Number.isSafeInteger(input) || input < 0) throw Error('Numeric seed must be a safe unsigned integer; use a decimal string for uint64');
      input = String(input);
    }
    const seed = seedValue(input).toString();
    if (!Array.isArray(raw.singles) || raw.singles.length > 64) throw Error('Expected up to 64 single tones');
    const level = v => { if (v === undefined) return 1; if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1) throw Error('Tone levels must be between 0 and 1'); return v; };
    const frequency = f => { if (typeof f !== 'number' || !Number.isFinite(f) || f < 20 || f > 18000) throw Error('Tone frequencies must be between 20 and 18000 Hz'); return f; };
    const tones = raw.singles.filter(t => t && t.on !== false).map(t => Object.freeze({frequency: frequency(t.f), level: level(t.lvl)}));
    if (!tones.length) throw Error('At least one enabled single tone is required');
    if (raw.bins !== undefined && !Array.isArray(raw.bins)) throw Error('bins must be an array');
    const bins = (raw.bins || []).filter(b => b && b.on !== false);
    if (bins.length > 1) throw Error('This viewer supports one enabled binaural pair');
    let binaural = null;
    if (bins.length) {
      const b = bins[0]; frequency(b.carrier);
      if (typeof b.beat !== 'number' || !Number.isFinite(b.beat) || b.beat < 0) throw Error('Invalid binaural beat');
      frequency(b.carrier - b.beat / 2); frequency(b.carrier + b.beat / 2);
      binaural = Object.freeze({carrier_hz:b.carrier, beat_hz:b.beat, level:level(b.lvl)});
    }
    if (raw.sweeps !== undefined && (!Array.isArray(raw.sweeps) || raw.sweeps.some(s => s && s.on !== false))) throw Error('Enabled sweeps are not supported by this bedrock importer');
    return Object.freeze({seed,seedAlgorithm:'provided-uint64',tones:Object.freeze(tones),binaural});
  }
  function parseExperiment(raw) {
    if(!raw||raw.schema!=='ResonariumBiosentinelExperiment'||raw.version!==1||!['blake2b-64-be','provided-uint64'].includes(raw.seedAlgorithm)||raw.engine!=='portable-mulberry32-boxmuller-v1')throw Error('Unsupported experiment schema or engine');
    if(!raw.config||Object.keys(defaults).some(k=>!(k in raw.config)))throw Error('Missing experiment configuration');
    const seed=seedValue(raw.seed).toString(),c=config(raw.config);
    if(!Array.isArray(raw.trajectory)||!raw.trajectory.length||raw.trajectory.length>377||typeof raw.symbols!=='string'||raw.symbols.length!==raw.trajectory.length)throw Error('Invalid trajectory');
    let time=0;
    const trajectory=raw.trajectory.map((r,i)=>{
      const p=pulse(raw.symbols[i],c);
      for(const k of ['intensity','duration_ms','fluence','K','R_mean','psi','t'])if(typeof r[k]!=='number'||!Number.isFinite(r[k]))throw Error('Nonfinite trajectory');
      if(r.index!==i||r.symbol!==raw.symbols[i]||r.R_mean<0||r.R_mean>1+1e-12||Math.abs(r.psi)>Math.PI+1e-12)throw Error('Invalid trajectory row');
      for(const k of ['intensity','duration_ms','fluence','K'])if(Math.abs(r[k]-p[k])>1e-8*Math.max(1,p[k]))throw Error('Pulse invariant mismatch');
      time+=p.duration_ms/1000;if(Math.abs(r.t-time)>1e-7*Math.max(1,time))throw Error('Trajectory time mismatch');
      return {index:i,symbol:r.symbol,...p,R_mean:r.R_mean,psi:r.psi,t:r.t};
    });
    // Reconstruct known keys only; never retain imported private or executable metadata.
    return {schema:raw.schema,version:1,seed,seedAlgorithm:raw.seedAlgorithm,engine:raw.engine,config:c,symbols:raw.symbols,trajectory,modes:modesFor(trajectory)};
  }
  root.Photometabolic=Object.freeze({deriveSeed,random,config,defaults,fibonacci,pulse,Engine,decode,mutualInformation,surrogate,falsify,project,modesFor,exportExperiment,parseExperiment,parseTonalState});
})(globalThis);
