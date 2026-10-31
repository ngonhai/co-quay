// node tests/engine.test.js
const Rou = require('../js/rou-engine.js');
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.error('FAIL', m); } };

// 1) bot vs bot: every game ends, invariants hold
for (let i = 0; i < 600; i++) {
  const g = Rou.newGame(['A', 'B'], { target: 1 + (i % 3), perTurn: 1 + (i % 3), bot: ['easy', 'normal', 'hard'][i % 3] }, 1000 + i);
  let steps = 0;
  while (g.phase !== 'over' && steps++ < 4000) {
    if (g.phase === 'between') { ok(Rou.apply(g, 0, { t: 'next' }), 'next'); continue; }
    const a = Rou.bot(g, g.turn); ok(a, 'bot gave an action');
    ok(Rou.apply(g, g.turn, a), 'bot action legal ' + JSON.stringify(a));
    ok(g.n === g.ch.length + g.spent.length, 'shell conservation');
    ok(g.table.length <= Rou.TABLE_MAX, 'table cap');
    ok(g.hp.every(h => h >= 0 && h <= g.maxHp), 'hp bounds');
    ok(g.ch.length >= 1 || g.phase !== 'play', 'never an empty cylinder during play');
    if (g.phase === 'play') { const c = Rou.counts(g); ok(c.l + c.b === g.ch.length, 'counts'); }
  }
  ok(g.phase === 'over', 'game ' + i + ' terminates');
  ok(g.wins[g.winner] === g.opts.target, 'winner has target wins');
}

// 2) illegal actions are refused
{
  const g = Rou.newGame(['A', 'B'], {}, 5);
  const other = 1 - g.turn;
  ok(!Rou.apply(g, other, { t: 'fire', at: 'opp' }), 'not your turn');
  ok(!Rou.apply(g, g.turn, { t: 'fire', at: 'xx' }), 'bad target');
  ok(!Rou.apply(g, g.turn, { t: 'item', id: 9999 }), 'no such item');
  ok(!Rou.apply(g, g.turn, { t: 'next' }), 'next only between rounds');
}

// 3) rules by construction
function mk(chs, items, o) {
  const g = Rou.newGame(['A', 'B'], Object.assign({ perTurn: 3 }, o || {}), 7);
  g.turn = 0; g.used = 0; g.hp = [3, 3]; g.maxHp = 3; g.shield = [false, false]; g.skip = [false, false]; g.dbl = false;
  g.n = chs.length; g.ch = chs.map(k => ({ k, s: [false, false] })); g.spent = [];
  g.pub = { l: chs.filter(k => k === 'L').length, b: chs.filter(k => k === 'B').length };
  g.table = items.map((k, i) => ({ id: 100 + i, k })); return g;
}
{ // self blank = shoot again; self live = damage + pass
  let g = mk(['B', 'L', 'B'], []);
  Rou.apply(g, 0, { t: 'fire', at: 'self' }); ok(g.turn === 0 && g.hp[0] === 3, 'blank on self keeps turn');
  Rou.apply(g, 0, { t: 'fire', at: 'self' }); ok(g.turn === 1 && g.hp[0] === 2, 'live on self hurts and passes');
}
{ // whisky doubles, tray blocks, cuffs skip
  let g = mk(['L', 'L', 'B', 'B'], ['whisky', 'tray', 'cuffs']);
  ok(Rou.apply(g, 0, { t: 'item', id: 100 }), 'whisky'); Rou.apply(g, 0, { t: 'fire', at: 'opp' });
  ok(g.hp[1] === 1 && !g.dbl, 'double damage, flag cleared'); ok(g.turn === 1, 'turn passed');
  g = mk(['L', 'B'], ['tray']); g.turn = 1; g.table = [{ id: 1, k: 'tray' }];
  Rou.apply(g, 1, { t: 'item', id: 1 }); g.turn = 0; Rou.apply(g, 0, { t: 'fire', at: 'opp' });
  ok(g.hp[1] === 3 && !g.shield[1], 'tray absorbs one live shell');
  g = mk(['B', 'B', 'L'], ['cuffs']); Rou.apply(g, 0, { t: 'item', id: 100 }); Rou.apply(g, 0, { t: 'fire', at: 'opp' });
  ok(g.turn === 0 && !g.skip[1], 'cuffs: opponent loses their turn');
}
{ // loupe is private, coin flips and keeps the public counters, beer ejects, lemon caps at max
  let g = mk(['L', 'B'], ['loupe', 'coin', 'beer', 'lemon']);
  Rou.apply(g, 0, { t: 'item', id: 100 }); ok(g.ch[0].s[0] && !g.ch[0].s[1], 'loupe private');
  Rou.apply(g, 0, { t: 'item', id: 101 }); ok(g.ch[0].k === 'B' && g.ch[0].s[0] && !g.ch[0].s[1] && g.pub.l === 1, 'coin flips, bluff counters');
  ok(!Rou.apply(g, 0, { t: 'item', id: 103 }), 'lemon refused at full HP');
  g = mk(['L', 'B', 'B'], ['beer']); Rou.apply(g, 0, { t: 'item', id: 100 }); ok(g.ch.length === 2 && g.spent[0] === 'L' && g.pub.l === 0, 'beer ejects');
}
{ // reload when empty; round end; match end
  let g = mk(['L'], []); g.hp = [3, 1];
  Rou.apply(g, 0, { t: 'fire', at: 'opp' }); ok(g.phase === 'between' && g.wins[0] === 1, 'round won');
  Rou.apply(g, 0, { t: 'next' }); ok(g.phase === 'play' && g.round >= 2 && g.turn === 1, 'loser starts next round');
  g = mk(['B'], []); Rou.apply(g, 0, { t: 'fire', at: 'opp' }); ok(g.ch.length >= 4 && g.turn === 1, 'reload after the last shell');
}
console.log(fails ? fails + ' FAILED' : 'engine tests passed');
process.exit(fails ? 1 : 0);
