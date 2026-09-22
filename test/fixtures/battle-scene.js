// Staged scenes for looking at the battle pass. NOT a playthrough: every body
// here is placed by hand so one screenshot can hold a charge lane, a tether, a
// thrown arm and a catch cue at once. Used by browser-upgrades.mjs --battle-scene.
window.stageBattle = (kind) => {
  const g = window.drifter, r = g.run;
  const still = () => ({ move: { x: 0, y: 0 }, grip: false, dash: false, place: false, placeDown: false,
    lift: false, crown: false, crownDown: false, cycle: 0, confirm: false, pause: false, depth: 0,
    call: false, mute: false });
  g.pad.read = still;
  g.pad.connected = true;
  g.card = null; g.queued = []; g.toastT = 0; g.flash = 0; g.shake = 0; g.paused = false;
  r.world.aeon = kind === 'shock' ? 5 : 4;
  r.phase = 'reign'; g.screen = 'play';
  r.you.x = r.bounds.x + r.bounds.w / 2; r.you.y = r.bounds.y + r.bounds.h / 2;
  r.you.iframe = 0; r.iframe = 0; r.you.dash = 0; r.you.dashCool = 0;
  const x = r.you.x, y = r.you.y;
  r.throne = { hm: '622', fed: ['622', '622', '6'], mass: 30, freedom: 3, anchored: false, hp: 150,
    maxHp: 330, x: x + 150e-6, y: y - 40e-6, awake: true, beat: 0.22, spin: 0.3 };
  r.fray.stats.caught = 3; r.fray.stats.landed = 2;
  const proto = { id: 0, faction: 'beast', species: 'husk', parts: [], x, y, ang: 0, held: 0, dwell: 0,
    partner: -1, flash: 0, spin: 0, trail: [], wind: 0, strike: 0, sx: 0, sy: 0, cool: 0, layer: 0 };
  const husk = { ...proto, id: 501, x: x - 110e-6, y: y + 60e-6, seized: 1.0 };
  const ribbon = { ...proto, id: 502, species: 'ribbon', x: x - 40e-6, y: y - 150e-6, wind: 0.3 };
  r.entities = [husk, ribbon];
  r.bond.companions = [{ form: 'weaver', hm: '23', rank: 2 }, { form: 'strider', hm: '222', rank: 1 }];
  r.bond.active = 0;
  r.bond.ally = { x: x + 26e-6, y: y + 18e-6, target: 501, cool: 0, holding: true };
  r.bond.readyAt = r.t + 7;
  r.bolts = [
    { x: x - 6e-6, y: y - 48e-6, vx: 0, vy: 2.6e-4, life: 2, born: r.t },
    { x: x + 60e-6, y: y - 16e-6, vx: 3.6e-4, vy: -1.0e-4, life: 2, born: r.t, thrown: true },
  ];
  const p = r.spacing ? (r.spacing.lo + r.spacing.hi) / 2 : r.world.pitch * 1.3;
  const mk = (id, hx, hy) => ({ id, hm: '622', x: hx, y: hy, layer: 0, serves: [0], gait: 0,
    lobes: [[1, 0], [0.5, 0.866], [-0.5, 0.866], [-1, 0], [-0.5, -0.866], [0.5, -0.866]],
    reach: 60.4e-6, strength: 12, charge: 0, ruin: false });
  r.structures = [mk(900, x - 180e-6, y - 120e-6), mk(901, x - 180e-6 + p, y - 120e-6)];
  r.organelles = [{ hostId: 900, energy: 44, supplying: true, mending: true }];
  r.fray.repair = 22;
  r.integrity = 4;
  r.cells = Array.from({ length: 100 }, (_, i) => ({ group: { hm: i % 7 ? '622' : '6', order: i % 7 ? 12 : 6 },
    structure: i % 7 ? 12 : 6, freedom: 1, variants: 1, ability: 'weave', blurb: '' }));
  g.selected = 40;
  r.fray.rings = []; r.fray.echo = null; r.fray.snare = 0; r.fray.daze = 0; r.fray.charge = 0;
  if (kind === 'charge') {
    r.fray.next = 'charge';
    r.fray.lane = { dx: -0.93, dy: 0.37 };
  } else {
    r.fray.next = 'echo';
    r.throne.hm = '6'; r.throne.fed = ['6', '6'];
    r.fray.rings = [{ x: r.throne.x, y: r.throne.y, r: 170e-6, prev: 168e-6 }];
    r.bond.active = 0; r.bond.companions[0].form = 'weaver';
    r.fray.snare = 1.6;
  }
  g.cam.x = x * 1e6 - 450; g.cam.y = y * 1e6 - 330;
  g.update = () => {};
  g.draw();
};

window.stageBirth = () => {
  const g = window.drifter, r = g.run;
  delete g.update;   // the real update again: a thrown arm ends the reign
  r.phase = 'reign'; g.screen = 'play'; r.world.aeon = 1;
  r.throne = { hm: '222', fed: ['222', '2'], mass: 6, freedom: 4, anchored: true, hp: 1, maxHp: 90,
    x: r.you.x + 60e-6, y: r.you.y, awake: true, beat: 3, spin: 0 };
  r.bond.companions = [{ form: 'strider', hm: '222', rank: 1 }];
  r.evolution.ranks = { reflex: 1 };
  r.bolts = [{ x: r.throne.x, y: r.throne.y, vx: 0, vy: 0, life: 1, born: r.t, thrown: true }];
  g.update(1 / 60);
  g.pick = 1; g.card = null; g.queued = []; g.flash = 0; g.shake = 0;
  g.draw();
  return { screen: g.screen, offer: r.evolution.offer };
};

window.stagePaused = () => {
  const g = window.drifter;
  g.screen = 'play'; g.paused = true; g.card = null; g.flash = 0;
  g.run.phase = 'settle';
  g.draw();
};

window.stageDead = () => {
  const g = window.drifter, r = g.run;
  g.paused = false; g.card = null; g.flash = 0; g.shake = 0; g.verdict = null;
  r.phase = 'dead'; g.screen = 'dead';
  g.tally = { merge: 300, place: 120, 'hit:volley': 5, 'hit:charge': 1, 'hit:struck': 2, dash: 90, strike: 40, discharge: 12, 'sovereign-hit': 12 };
  r.fray.stats.caught = 14; r.fray.stats.landed = 11; r.fray.stats.held = 9; r.fray.stats.repairs = 3;
  g.draw();
};
window.stageTitle = () => {
  const g = window.drifter;
  g.screen = 'title'; g.paused = false; g.card = null;
  g.draw();
};
