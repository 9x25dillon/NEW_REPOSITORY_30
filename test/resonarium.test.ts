import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const context = vm.createContext({ TextEncoder, setTimeout });
vm.runInContext(readFileSync(new URL('../app/resonarium/photometabolic.js', import.meta.url), 'utf8'), context);
const PM = context.Photometabolic;
const plain = (v: unknown) => JSON.parse(JSON.stringify(v));
const fixture = JSON.parse(readFileSync(new URL('../examples/resonarium/experiment.json', import.meta.url), 'utf8'));

test('BLAKE2b-64 digest size, UTF-8, empty and multi-block vectors agree with Python hashlib', () => {
  const vectors = JSON.parse(readFileSync(new URL('../examples/resonarium/seed-vectors.json', import.meta.url), 'utf8'));
  for (const { text, seed } of vectors) assert.equal(PM.deriveSeed(text).toString(), seed);
});

test('portable browser model reproduces Python trajectory with a full-width seed', () => {
  const engine = new PM.Engine(fixture.seed, fixture.config);
  engine.run();
  assert.equal(engine.symbols, fixture.symbols);
  for (let i=0;i<engine.log.length;i++) {
    for (const key of ['intensity','duration_ms','fluence','K','R_mean','psi','t'])
      assert.ok(Math.abs(engine.log[i][key]-fixture.trajectory[i][key])<1e-10, `${key} row ${i}`);
  }
  assert.deepEqual(plain(PM.parseExperiment(fixture).trajectory), fixture.trajectory);
});

test('equal fluence has correct units for non-unit doses and exact integration time', () => {
  for (const J0 of [.01,.25,2]) {
    const c=PM.config({ J0, depth:3 }), e=new PM.Engine('0',c);e.run();
    for (const row of e.log) assert.ok(Math.abs(row.intensity*row.duration_ms/1e6-J0)<1e-14);
    assert.ok(Math.abs(e.t-e.log.reduce((t: number,r: {duration_ms:number})=>t+r.duration_ms/1000,0))<1e-12);
    assert.ok(e.log.every((r: {R_mean:number})=>r.R_mean>=0&&r.R_mean<=1));
  }
});

test('OFF is exact projection identity and enabling is independent of earlier calls', () => {
  const bedrock=Object.freeze([110,220,330]), before=[...bedrock];
  const params={n:8,k:.72,perturb:5,spread:1};
  const row=fixture.trajectory[4];
  const first=bedrock.map((f,i)=>PM.project(f,i,row,params,true));
  for(const f of bedrock)assert.deepEqual(plain(PM.project(f,0,row,params,false)),{frequency:f,gain:0,phase:0,deform:0});
  assert.deepEqual(bedrock,before);
  assert.deepEqual(plain(bedrock.map((f,i)=>PM.project(f,i,row,params,true))),plain(first));
});

test('untrusted experiment import rejects corrupt units, time, phases and lossy seeds', () => {
  for (const mutate of [
    (v: any)=>{v.seed=Number(v.seed);}, (v: any)=>{v.seed='18446744073709551616';},
    (v: any)=>{v.trajectory[1].fluence*=1000;}, (v: any)=>{v.trajectory[1].t=0;},
    (v: any)=>{v.trajectory[0].psi=Infinity;}, (v: any)=>{v.config.N=1;},
    (v: any)=>{delete v.config.kappa;}, (v: any)=>{v.trajectory[0].symbol='X';},
  ]) {const value=structuredClone(fixture);mutate(value);assert.throws(()=>PM.parseExperiment(value));}
  const value=structuredClone(fixture);value.chart={sun:123};value.trajectory[0].private='ignored';
  assert.equal(PM.parseExperiment(value).chart,undefined);
  assert.equal(PM.parseExperiment(value).trajectory[0].private,undefined);
});

test('AAFT ensemble is repeatable, composition preserving and uses a finite-sample p-value', async () => {
  const symbols=PM.fibonacci(8),rng=PM.random('123');
  for(let i=0;i<10;i++) {
    const s=PM.surrogate(symbols,rng);
    assert.equal(s.length,symbols.length);
    assert.equal([...s].filter(x=>x==='L').length,[...symbols].filter(x=>x==='L').length);
  }
  const a=await PM.falsify('123',{depth:4,N:16},3),b=await PM.falsify('123',{depth:4,N:16},3);
  assert.deepEqual(plain(a),plain(b));
  assert.ok(a.p_value>=.25&&a.p_value<=1);
  assert.equal(a.method,'aaft-randomized-ties');
  const tied=await PM.falsify('7309112606740490464',{depth:4},3);
  assert.equal(tied.gap_sigma,null);assert.equal(tied.p_value,1);
  assert.equal(PM.mutualInformation('LSLS','+-+-'),1);
  assert.equal(PM.mutualInformation('',''),0);
});

test('projected spherical indices are valid and new engine remains outside device physics', () => {
  for(const m of PM.modesFor(fixture.trajectory))assert.ok(Math.abs(m.m)<=m.l);
  for(const name of ['photometabolic.js','natal_seed.js','index.html']) {
    const text=readFileSync(new URL(`../app/resonarium/${name}`, import.meta.url),'utf8');
    assert.ok(!/from\s+["'][^"']*src\//.test(text));
    assert.ok(!/<script[^>]*src=["']https?:/.test(text));
  }
});

test('legacy tonal states preserve seed, frequencies, levels and binaural pair without rehashing', () => {
  const raw={schema:'resonarium.state.v2',natalSeed:1234567890,
    singles:[{on:true,f:220.0,lvl:.7071},{on:false,f:200,lvl:1},{on:true,f:330.0,lvl:1}],
    bins:[{on:true,carrier:290.6684896666667,beat:7.930000000000746,lvl:.3}],sweeps:[]};
  const result=PM.parseTonalState(raw);
  assert.equal(result.seed,'1234567890');assert.equal(result.seedAlgorithm,'provided-uint64');
  assert.deepEqual(plain(result.tones),[{frequency:raw.singles[0].f,level:.7071},{frequency:raw.singles[2].f,level:1}]);
  assert.deepEqual(plain(result.binaural),{carrier_hz:raw.bins[0].carrier,beat_hz:raw.bins[0].beat,level:.3});
  assert.ok(Object.isFrozen(result.tones));
  for(const mutate of [
    (v:any)=>{v.natalSeed=Number.MAX_SAFE_INTEGER+1;},(v:any)=>{v.singles[0].f=NaN;},
    (v:any)=>{v.singles[0].lvl=-1;},(v:any)=>{v.bins[0].beat=99999;},
    (v:any)=>{v.sweeps=[{on:true}];},
  ]) {const value=structuredClone(raw);mutate(value);assert.throws(()=>PM.parseTonalState(value));}
  const state=structuredClone(fixture);state.seedAlgorithm='provided-uint64';state.seed=result.seed;
  assert.equal(PM.parseExperiment(state).seedAlgorithm,'provided-uint64');
});
