// Drives the real Game update with a simulated standard Xbox pad, for the
// battle pass: the riposte, the companion call, the rack window, and choosing
// an evolution on the birth screen. Run by test/browser-upgrades.mjs --battle.
(() => {
  const g = window.drifter;
  const checks = [];
  const check = (condition, message) => { if (!condition) throw new Error(message); checks.push(message); };
  const gp = { index: 0, connected: true, mapping: 'standard', id: 'Xbox Elite Wireless Controller Series 2',
    axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
  Object.defineProperty(navigator, 'getGamepads', { value: () => [gp], configurable: true });
  const button = (i, on) => { gp.buttons[i] = { pressed: on, value: on ? 1 : 0 }; };
  const tap = (i) => { button(i, true); g.update(1 / 60); button(i, false); g.update(1 / 60); };
  const cell = (hm, order) => ({ group: { hm, order }, structure: order, freedom: 1, variants: 1,
    ability: 'weave', blurb: 'test cell' });

  g.begin(); g.run.spawnIn = 1e6; g.run.world.calm = 1e6;
  let r = g.run; r.entities = [];

  // THE RACK WINDOW. A hundred cells, as the aeon-6 report carried.
  r.cells = Array.from({ length: 100 }, (_, i) => cell(i % 7 ? '622' : '6', i % 7 ? 12 : 6));
  for (let i = 0; i < 50; i++) { button(15, true); g.update(1 / 60); button(15, false); g.update(1 / 60); }
  check(g.selected === 50, 'D-pad right steps the rack forward');
  button(14, true); g.update(1 / 60); button(14, false); g.update(1 / 60);
  check(g.selected === 49, 'D-pad left steps it back');
  const win = g.rackWindow();
  check(win.count === 13 && win.first <= 49 && win.first + win.count > 49, 'the rack shows a window around the selection');
  const right = g.slotRect(0);
  check(g.slotAt(right.x + 5, right.y + 5) === win.first, 'the rightmost visible slot is the window start');
  g.draw();

  // THE RIPOSTE, through the real input path: stick up, A, into an arm.
  r.cells = [];
  r.phase = 'reign';
  r.throne = { hm: '222', fed: ['222'], mass: 4, freedom: 3, anchored: true, hp: 70, maxHp: 70,
    x: r.you.x + 80e-6, y: r.you.y, awake: true, beat: 100, spin: 0 };
  r.bolts = [{ x: r.you.x, y: r.you.y - 6e-6, vx: 0, vy: 2.4e-4, life: 3, born: r.t }];
  r.wave.stamina = 60;
  gp.axes = [0, -1, 0, 0];
  tap(0);
  gp.axes = [0, 0, 0, 0];
  check(r.fray.stats.caught === 1, 'bursting into an arm catches it');
  check(r.bolts.some((b) => b.thrown) || r.fray.stats.landed === 1, 'and throws it back');
  for (let i = 0; i < 40 && r.bolts.length; i++) g.update(1 / 60);
  check(r.fray.stats.landed === 1 && r.throne.hp < 70, 'the thrown arm lands on the king');
  g.draw();

  // THE CALL, on R3.
  r.bond.companions = [{ form: 'strider', hm: '222', rank: 1 }];
  r.bond.active = 0;
  tap(11);
  check(r.t < r.bond.rushUntil, 'R3 calls the companion: a Strider rushes');
  tap(11);
  check(r.fray.stats.calls === 1, 'and a second press while it cools does nothing');
  g.draw();

  // THE LURE, on a held LB: a tap still lifts, a hold leaves a cell standing.
  r.cells = [cell('2', 2), cell('2', 2)];
  r.lure = null;
  button(4, true);
  for (let i = 0; i < 40; i++) g.update(1 / 60);
  check(!!r.lure, 'holding LB leaves a lure');
  check(r.cells.length === 1, 'and it costs one cell');
  button(4, false); g.update(1 / 60);
  check(r.structures.length === 0, 'releasing after a lure does not also lift');
  g.draw();

  // EVOLVE on the birth screen: B steps the cards, Start takes one and enters.
  r.throne.hp = 1;
  r.bolts = [{ x: r.throne.x, y: r.throne.y, vx: 0, vy: 0, life: 1, born: r.t, thrown: true }];
  g.update(1 / 60);
  check(r.phase === 'birth' && g.screen === 'birth', 'a thrown arm ends the reign');
  const offer = [...r.evolution.offer];
  check(offer.length === 3, 'three cards are dealt');
  g.draw();
  tap(1);
  check(g.pick === 1, 'B moves to the second card');
  const rack = 40;
  r.cells = Array.from({ length: rack }, () => cell('622', 12));
  tap(2);
  check((r.evolution.ranks[offer[1]] ?? 0) === 1, `X takes the highlighted card (${offer[1]})`);
  check(r.cells.length === rack, 'and the first one at a birth is free');
  const second = r.evolution.offer[g.pick];
  tap(2);
  check((r.evolution.ranks[second] ?? 0) === 1, `a second card (${second}) can be bought`);
  check(r.cells.length === rack - 5, 'which is paid for out of the rack');
  tap(9);
  check(g.screen === 'play' && r.world.aeon === 2, 'Start enters with what was taken');
  g.draw();
  check(document.body.scrollHeight <= innerHeight + 2, 'game and controls still fit the viewport');
  return checks;
})()
