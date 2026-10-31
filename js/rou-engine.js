// rou-engine.js — pure rules + bot for Roulette. No DOM, no network. Every state is plain JSON (it is stored as one string online).
//
// Two players share ONE cylinder (live + blank shells, order hidden) and ONE table of items that either player may use on their turn.
//   fire at the opponent : live = -1 HP (or -2 with Whisky), turn passes.
//   fire at yourself     : blank = you shoot again, live = -1 HP and the turn passes.
// When the cylinder is empty it is reloaded (new live/blank mix, new items on the table). 0 HP loses the round; first to `target` rounds wins.
const Rou = (function () {
  'use strict';
  const ITEMS = ['loupe', 'phone', 'beer', 'lemon', 'bell', 'spin', 'coin', 'whisky', 'tray'];
  const WEIGHT = { loupe: 5, phone: 3, beer: 4, lemon: 3, bell: 3, spin: 3, coin: 3, whisky: 4, tray: 3 };
  const TABLE_MAX = 8;
  const DEFAULTS = { target: 2, perTurn: 2, bot: 'normal' };
  const BOT_LEVELS = ['easy', 'normal', 'hard'];

  const clampI = (v, a, b, d) => { v = parseInt(v, 10); return isFinite(v) ? Math.min(b, Math.max(a, v)) : d; };
  function normSettings(s) {
    s = Object.assign({}, DEFAULTS, s || {});
    s.target = clampI(s.target, 1, 3, 2); s.perTurn = clampI(s.perTurn, 1, 3, 2);
    if (BOT_LEVELS.indexOf(s.bot) < 0) s.bot = 'normal';
    return s;
  }

  // seeded PRNG kept inside the state (g.rs) so a game is fully reproducible and travels with the state
  function rnd(g) {
    let t = (g.rs = (g.rs + 0x6D2B79F5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const ri = (g, n) => Math.floor(rnd(g) * n);
  function shuffle(g, a) { for (let i = a.length - 1; i > 0; i--) { const j = ri(g, i + 1); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  function emit(g, e) { g.ev.push(e); g.log.push(e); if (g.log.length > 60) g.log.shift(); }

  function newGame(names, settings, seed) {
    const g = {
      v: 1, id: Math.random().toString(36).slice(2, 9), seq: 0, rs: ((seed == null ? Math.random() * 4294967296 : seed) >>> 0) || 1, opts: normSettings(settings), names: [names[0] || 'A', names[1] || 'B'],
      phase: 'play', round: 0, wins: [0, 0], lw: 0, turn: 0, hp: [0, 0], maxHp: 0, shield: [false, false], skip: [false, false], dbl: false, used: 0,
      n: 0, ch: [], spent: [], pub: { l: 0, b: 0 }, table: [], nid: 1, ev: [], log: [], winner: null
    };
    g.turn = ri(g, 2);
    startRound(g, g.turn);
    g.ev = []; g.log = g.log.slice(-1);
    return g;
  }

  function startRound(g, first) {
    g.round++; g.maxHp = 2 + ri(g, 3); g.hp = [g.maxHp, g.maxHp]; g.shield = [false, false]; g.skip = [false, false]; g.dbl = false;
    g.table = []; g.turn = first; g.used = 0; g.phase = 'play';
    emit(g, { t: 'round', n: g.round, hp: g.maxHp });
    loadCyl(g); addItems(g, 4);
  }
  function loadCyl(g) {
    const n = 4 + ri(g, 5), live = 1 + ri(g, n - 1);   // 4..8 shells, at least one live and one blank
    const kinds = []; for (let i = 0; i < n; i++) kinds.push(i < live ? 'L' : 'B');
    shuffle(g, kinds);
    g.n = n; g.ch = kinds.map(k => ({ k, s: [false, false] })); g.spent = []; g.pub = { l: live, b: n - live };
    emit(g, { t: 'load', l: live, b: n - live });
  }
  function addItems(g, k) {
    let added = 0;
    for (let i = 0; i < k && g.table.length < TABLE_MAX; i++) {
      let tot = 0; ITEMS.forEach(x => tot += WEIGHT[x]);
      let r = rnd(g) * tot, pick = ITEMS[0];
      for (const x of ITEMS) { r -= WEIGHT[x]; if (r < 0) { pick = x; break; } }
      g.table.push({ id: g.nid++, k: pick }); added++;
    }
    return added;
  }
  function reloadIfEmpty(g) {
    if (g.phase !== 'play' || g.ch.length) return;
    loadCyl(g); const a = addItems(g, 2 + ri(g, 2));
    g.ev[g.ev.length - 1].items = a;
  }

  const counts = g => { let l = 0, b = 0; g.ch.forEach(c => c.k === 'L' ? l++ : b++); return { l, b }; };

  function canUse(g, p, it) {
    if (!it || g.phase !== 'play' || g.turn !== p || g.used >= g.opts.perTurn || !g.ch.length) return false;
    switch (it.k) {
      case 'loupe': return !g.ch[0].s[p];
      case 'phone': case 'spin': return g.ch.length >= 2;
      case 'lemon': return g.hp[p] < g.maxHp;
      case 'bell': return !g.skip[1 - p];
      case 'whisky': return !g.dbl;
      case 'tray': return !g.shield[p];
      default: return true;
    }
  }

  function passTurn(g) {
    g.used = 0; const o = 1 - g.turn;
    if (g.skip[o]) { g.skip[o] = false; emit(g, { t: 'skipped', p: o }); } else g.turn = o;
  }
  function endRound(g, w) {
    g.wins[w]++; g.lw = w; emit(g, { t: 'roundEnd', w, wins: g.wins.slice() });
    if (g.wins[w] >= g.opts.target) { g.phase = 'over'; g.winner = w; emit(g, { t: 'over', w }); } else g.phase = 'between';
  }

  function fire(g, p, at) {
    const tgt = at === 'self' ? p : 1 - p, c = g.ch.shift(), k = c.k;
    g.spent.push(k); g.pub[k === 'L' ? 'l' : 'b'] = Math.max(0, g.pub[k === 'L' ? 'l' : 'b'] - 1);
    let dmg = 0, blocked = false; const dbl = g.dbl;
    if (k === 'L') {
      if (g.shield[tgt]) { g.shield[tgt] = false; blocked = true; } else { dmg = dbl ? 2 : 1; g.hp[tgt] = Math.max(0, g.hp[tgt] - dmg); }
    }
    g.dbl = false;
    emit(g, { t: 'shot', by: p, at: tgt, k, dmg, blocked, dbl, left: g.ch.length });
    if (g.hp[tgt] === 0) { endRound(g, 1 - tgt); return; }
    if (at === 'self' && k === 'B') { g.used = 0; emit(g, { t: 'again', p }); } else passTurn(g);
    reloadIfEmpty(g);
  }

  function useItem(g, p, it) {
    const e = { t: 'item', by: p, k: it.k, id: it.id };
    g.table = g.table.filter(x => x.id !== it.id); g.used++;
    switch (it.k) {
      case 'loupe': g.ch[0].s[p] = true; e.peek = g.ch[0].k; break;
      case 'phone': { const i = 1 + ri(g, g.ch.length - 1); g.ch[i].s[p] = true; e.pos = i; e.peek = g.ch[i].k; break; }
      case 'beer': { const c = g.ch.shift(); g.spent.push(c.k); g.pub[c.k === 'L' ? 'l' : 'b'] = Math.max(0, g.pub[c.k === 'L' ? 'l' : 'b'] - 1); e.kind = c.k; break; }
      case 'lemon': g.hp[p] = Math.min(g.maxHp, g.hp[p] + 1); break;
      case 'bell': g.skip[1 - p] = true; break;
      case 'spin': shuffle(g, g.ch); g.ch.forEach(c => c.s = [false, false]); break;
      case 'coin': { const c = g.ch[0], seen = c.s[p]; c.k = c.k === 'L' ? 'B' : 'L'; c.s = [false, false]; if (seen) { c.s[p] = true; e.peek = c.k; } break; }   // public counters are NOT updated: a bluff tool
      case 'whisky': g.dbl = true; break;
      case 'tray': g.shield[p] = true; break;
    }
    emit(g, e);
    reloadIfEmpty(g);
  }

  // returns true if the action was legal and has been applied (mutates g)
  function apply(g, p, a) {
    if (!g || !a) return false;
    if (a.t === 'next') { if (g.phase !== 'between') return false; g.ev = []; g.seq++; startRound(g, 1 - g.lw); return true; }
    if (g.phase !== 'play' || g.turn !== p) return false;
    if (a.t === 'fire') {
      if (a.at !== 'self' && a.at !== 'opp') return false;
      g.ev = []; g.seq++; fire(g, p, a.at); return true;
    }
    if (a.t === 'item') {
      const it = g.table.find(x => x.id === a.id); if (!canUse(g, p, it)) return false;
      g.ev = []; g.seq++; useItem(g, p, it); return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- bot (uses only public information + what it peeked) ----
  function pLive(g, p) {
    const c0 = g.ch[0];
    if (c0 && c0.s[p]) return c0.k === 'L' ? 1 : 0;
    const t = g.pub.l + g.pub.b;
    if (t <= 0) return .5;
    return g.pub.l / t;
  }
  function bot(g, p, level) {
    if (!g || g.phase !== 'play' || g.turn !== p || !g.ch.length) return null;
    level = level || g.opts.bot; const op = 1 - p;
    const noise = level === 'easy' ? .35 : level === 'normal' ? .1 : 0;
    const pl = pLive(g, p), known = g.ch[0].s[p] ? g.ch[0].k : null;
    const has = k => g.table.find(i => i.k === k && canUse(g, p, i));
    const use = i => i ? { t: 'item', id: i.id } : null;
    const r = Math.random();
    if (g.used < g.opts.perTurn && r > noise) {
      let it;
      if (g.hp[p] < g.maxHp && (it = has('lemon')) && (g.hp[p] <= 2 || r > .5)) return use(it);
      if (!g.shield[p] && (it = has('tray')) && (g.hp[p] <= 2 || r > .6)) return use(it);
      if (known === null) {
        if ((it = has('loupe'))) return use(it);
        if ((it = has('phone')) && r > .4) return use(it);
        if (g.ch[0].s[op] && (it = has('spin'))) return use(it);       // the opponent peeked at this one: scramble it
      }
      if (known === 'B' && (it = has('coin'))) return use(it);          // blank -> live, then hit them
      if (known === 'L') {
        if (g.shield[op] && (it = has('beer'))) return use(it);          // don't waste a live shell on a tray
        if ((it = has('whisky'))) return use(it);
        if ((it = has('bell'))) return use(it);                          // double tap
      } else if (pl >= .6 && (it = has('bell')) && r > .5) return use(it);
    }
    let at;
    if (known === 'L') at = 'opp'; else if (known === 'B') at = 'self';
    else at = (pl < .5 && (g.hp[p] > 1 || pl === 0)) ? 'self' : 'opp';
    if (r < noise * .5 && known === null) at = at === 'self' ? 'opp' : 'self';
    return { t: 'fire', at };
  }

  return { ITEMS, TABLE_MAX, DEFAULTS, BOT_LEVELS, normSettings, newGame, apply, canUse, counts, bot, pLive };
})();
if (typeof module !== 'undefined') module.exports = Rou;
