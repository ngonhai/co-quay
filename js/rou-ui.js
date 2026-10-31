// rou-ui.js — screens, table, drum, animations, bot driver. Rules live in rou-engine.js, storage in rou-net.js.
// The UI keeps a `view` (what is on screen) and a queue of newer states: each new state first plays its events (aim, suspense, reveal...)
// on top of the old view, then becomes the view. Input is locked while that plays.
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const SEATCOL = ['#ff6a4d', '#5eead4'];
  const U = { screen: null, view: null, queue: [], busy: false, pending: false, sel: null, me: 0, shown: new Set(), botT: null, extra: 0, prev: null, off: null, overFor: null, tab: 'offline', expr: [null, null], exT: [0, 0], lastEmote: undefined, emoKey: '', emoCd: 0 };
  const reduce = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  const nm = (g, i) => esc(g.names[i]);

  // ---------------------------------------------------------------- generic helpers ----
  function show(name) {
    U.screen = name;
    document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === 'screen-' + name));
    document.body.dataset.screen = name;
    if (name !== 'game') { document.body.classList.remove('tense'); Snd.heart(false); Snd.musicStop(); } else Snd.musicStart();
  }
  function toast(msg) { const el = $('toast'); el.textContent = msg; el.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('on'), 2200); }
  function closeModal() { $('modal').innerHTML = ''; U.overFor = null; }
  function modal(html, wide) { $('modal').innerHTML = '<div class="modal-back"><div class="modal-card poly' + (wide ? ' wide' : '') + '">' + html + '</div></div>'; }
  const myName = () => { const v = $('input-name').value.trim(); return v; };
  const saveName = () => { try { localStorage.setItem('rou_name', $('input-name').value.trim()); } catch (e) {} };

  // ---------------------------------------------------------------- static texts ----
  function langSelects() {
    document.querySelectorAll('.lang-select').forEach(s => { s.innerHTML = Object.keys(I18N).map(l => '<option value="' + l + '"' + (l === LANG ? ' selected' : '') + '>' + l.toUpperCase() + '</option>').join(''); });
  }
  function applyLang() {
    document.documentElement.lang = LANG;
    $('lobby-title').textContent = t('title'); $('lobby-sub').textContent = t('sub'); $('lbl-name').textContent = t('name'); $('input-name').placeholder = t('namePh');
    $('tab-btn-create').textContent = t('create'); $('tab-btn-join').textContent = t('join'); $('tab-btn-offline').textContent = t('offline');
    $('btn-create-room').textContent = t('createBtn'); $('lbl-code').textContent = t('code'); $('btn-join-room').textContent = t('joinBtn');
    $('offline-hint').textContent = t('offHint'); $('btn-start-offline').textContent = t('startOff'); $('online-off-note').textContent = t('onlineOff');
    $('online-off-note').style.display = Net.ONLINE_OK ? 'none' : 'block';
    $('resume-title').textContent = t('resumeT'); $('resume-body').textContent = t('resumeB'); $('btn-resume').textContent = t('resume');
    $('room-code-label').textContent = t('roomCode'); $('seats-title').textContent = t('seats'); $('rules-title').textContent = t('rules'); $('rules-readonly-hint').textContent = t('onlyHost');
    $('btn-start-game').textContent = t('start'); $('btn-leave-waiting').textContent = t('leave');
    $('game-title').textContent = t('title'); $('btn-rules').textContent = '?'; $('btn-rules').title = t('help'); $('btn-leave-game').textContent = '✕'; $('btn-leave-game').title = t('exit'); $('btn-sound').textContent = Snd.isMuted() ? '🔇' : '🔊'; $('btn-sound').title = 'SFX'; $('btn-music').textContent = Snd.musicOn() ? '🎵' : '🔕'; $('btn-music').title = t('music');
    $('table-title').textContent = '🍸 ' + (LANG === 'vi' ? 'Bàn chung' : 'Shared table');
    $('off-rules').innerHTML = rulesHTML(U.off, true, true);
    langSelects();
    if (U.screen === 'waiting') renderWaiting(Net.room());
    if (U.screen === 'game' && U.view) renderGame(U.view);
  }
  function rulesHTML(s, edit, bot) {
    const row = (k, label, desc, opts) => '<div class="rule-row"><div><b>' + label + '</b>' + (desc ? '<p class="muted">' + desc + '</p>' : '') + '</div><div class="seg" data-k="' + k + '">' +
      opts.map(o => '<button type="button" class="seg-btn' + (String(s[k]) === String(o[0]) ? ' on' : '') + '" data-v="' + o[0] + '"' + (edit ? '' : ' disabled') + '>' + o[1] + '</button>').join('') + '</div></div>';
    return row('target', t('rTarget'), t('rTargetD'), [[1, '1'], [2, '2'], [3, '3']]) + row('perTurn', t('rPer'), t('rPerD'), [[1, '1'], [2, '2'], [3, '3']]) +
      (bot ? row('bot', t('rBot'), '', [['easy', t('easy')], ['normal', t('normal')], ['hard', t('hard')]]) : '');
  }
  function segClick(e, apply) {
    const b = e.target.closest('.seg-btn'); if (!b || b.disabled) return;
    const k = b.parentNode.dataset.k; let v = b.dataset.v; if (k !== 'bot') v = parseInt(v, 10);
    Snd.play('click'); apply(k, v);
  }

  // ---------------------------------------------------------------- lobby ----
  function renderLobbyTabs() {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === U.tab));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + U.tab));
  }
  function showLobby() {
    closeModal(); show('lobby'); applyLang();
    const has = Net.hasLocal() || !!Net.lastRoom();
    $('resume-card').style.display = has ? 'flex' : 'none';
  }
  function needName() { const n = myName(); if (!n) { toast(t('needName')); $('input-name').focus(); return null; } saveName(); return n; }

  // ---------------------------------------------------------------- waiting room ----
  function renderWaiting(room) {
    if (!room) return;
    $('room-code-display').textContent = Net.code() || '-----';
    const mine = Net.mySeat(room), host = Net.isHost(room);
    $('seat-grid').innerHTML = ['s0', 's1'].map((k, i) => {
      const s = room.seats[k];
      if (!s) return '<div class="seat free" style="--sc:' + SEATCOL[i] + '"><div class="seat-av"></div><div class="seat-body"><div class="seat-name muted">' + t('seatFree') + '</div></div></div>';
      return '<div class="seat' + (mine === k ? ' mine' : '') + '" style="--sc:' + SEATCOL[i] + '"><div class="seat-av">' + Art.avatar(SEATCOL[i], false) + '</div><div class="seat-body"><div class="seat-name">' + esc(s.name) + '</div><div class="seat-tags">' +
        (mine === k ? '<span class="tag you">' + t('you') + '</span>' : '') + (room.hostUid === s.uid ? '<span class="tag">' + t('host') + '</span>' : '') + (s.connected === false ? '<span class="tag off">' + t('off') + '</span>' : '') + '</div></div></div>';
    }).join('');
    $('rules-list').innerHTML = rulesHTML(room.settings, host, false);
    $('rules-readonly-hint').style.display = host ? 'none' : 'block';
    const two = room.seats.s0 && room.seats.s1;
    $('btn-start-game').style.display = host ? 'block' : 'none'; $('btn-start-game').disabled = !two;
    $('waiting-hint').textContent = host ? (two ? '' : t('needTwo')) : t('waitHost');
  }

  // ---------------------------------------------------------------- room callback ----
  function onRoom(room) {
    if (!room) { if (U.screen === 'game' || U.screen === 'waiting') { showLobby(); toast(t('noRoom')); } return; }
    if (room.status === 'lobby') { if (U.screen !== 'waiting') { show('waiting'); applyLang(); } renderWaiting(room); return; }
    const g = Net.getG(room); if (!g) return;
    if (U.screen !== 'game') { show('game'); applyLang(); }
    pushState(g, room);
    if (room.emote) { if (U.lastEmote === undefined) U.lastEmote = room.emote.ts; else if (room.emote.ts !== U.lastEmote) { U.lastEmote = room.emote.ts; if (room.emote.s !== (Net.mySeat() === 's1' ? 1 : 0)) showEmote(room.emote.s, room.emote.k); } } else if (U.lastEmote === undefined) U.lastEmote = null;
  }
  function pushState(g, room) {
    U.room = room;
    if (!U.view || U.view.id !== g.id) {                       // first state of a game (or a rematch): no animation
      U.view = g; U.queue = []; U.busy = false; U.shown = new Set(); U.prev = null; U.extra = 0; U.pending = false; closeModal();
      renderGame(g, true); afterIdle(); return;
    }
    if (g.seq > U.view.seq) { U.queue.push(g); U.pending = false; runQueue(); return; }
    if (!U.busy) { U.view = g; renderGame(g); }
  }
  async function runQueue() {
    if (U.busy) return;
    U.busy = true; renderControls(U.view);
    while (U.queue.length) {
      const g = U.queue.shift(), before = U.view;
      if (g.seq <= before.seq) continue;
      closeModal();
      try { await animate(g, before); } catch (e) { console.error(e); }
      U.view = g; renderGame(g);
    }
    U.busy = false; renderControls(U.view); afterIdle();
  }

  // ---------------------------------------------------------------- rendering the table ----
  const heartSvg = on => '<svg class="heart' + (on ? '' : ' lost') + '" viewBox="0 0 64 64"><use href="#ic-heart"/></svg>';
  function playerHTML(g, i) {
    const you = i === U.me, bot = Net.mode() === 'local' && i === 1;
    let hearts = ''; for (let h = 0; h < g.maxHp; h++) hearts += heartSvg(h < g.hp[i]);
    let badges = '';
    if (g.shield[i]) badges += '<span class="badge" title="' + esc(t('items').tray[0]) + '">' + Art.icon('shield') + '</span>';
    if (g.skip[i]) badges += '<span class="badge bad" title="' + esc(t('items').bell[0]) + '">' + Art.icon('skip') + '</span>';
    if (g.dbl && g.turn === i && g.phase === 'play') badges += '<span class="badge hot" title="' + esc(t('items').whisky[0]) + '">' + Art.icon('dbl') + '<b>x2</b></span>';
    let pips = ''; for (let w = 0; w < g.opts.target; w++) pips += '<i class="pip' + (w < g.wins[i] ? ' on' : '') + '"></i>';
    const off = Net.mode() === 'online' && U.room && U.room.seats['s' + i] && U.room.seats['s' + i].connected === false;
    return '<div class="p-av">' + Art.avatar(SEATCOL[i], bot, U.expr[i]) + '</div><div class="p-body"><div class="p-name">' + esc(g.names[i]) + (you ? ' <span class="tag you">' + t('you') + '</span>' : '') + (off ? ' <span class="tag off">' + t('off') + '</span>' : '') + '</div>' +
      '<div class="p-hp">' + hearts + '</div><div class="p-badges">' + badges + '</div></div><div class="p-wins" title="' + t('wins', { a: g.wins[0], b: g.wins[1] }) + '">' + pips + '</div>';
  }
  function renderDrum(g, instant) {
    const d = $('drum'), n = g.n, step = 360 / n, spent = g.spent.length;
    d.innerHTML = Art.drumSlots(g, U.me);
    const p = U.prev, reset = !p || p.round !== g.round || spent < p.spent || p.n !== n;
    const ang = -spent * step + U.extra;
    if (reset && !(p && p.keepAnim)) { d.style.transition = 'none'; d.style.transform = 'rotate(' + ang + 'deg)'; void d.getBoundingClientRect(); d.style.transition = ''; }
    else d.style.transform = 'rotate(' + ang + 'deg)';
    U.prev = { round: g.round, spent, n };
  }
  function renderCounter(g) {
    $('counter').innerHTML = '<span class="c-lbl">' + t('counter') + '</span><span class="chip live">● ' + g.pub.l + ' ' + t('liveS') + '</span><span class="chip blank">○ ' + g.pub.b + ' ' + t('blankS') + '</span>';
  }
  function itemTile(g, it) {
    const [name] = t('items')[it.k], can = Rou.canUse(g, U.me, it), isNew = !U.shown.has(it.id);
    return '<button type="button" class="item' + (U.sel === it.id ? ' sel' : '') + (can && !U.busy ? ' can' : '') + (isNew ? ' new' : '') + '" data-id="' + it.id + '" data-k="' + it.k + '">' + Art.icon(it.k) + '<span class="nm">' + esc(name) + '</span></button>';
  }
  function renderItems(g) {
    if (U.sel != null && !g.table.some(i => i.id === U.sel)) U.sel = null;
    $('items').innerHTML = g.table.length ? g.table.map(it => itemTile(g, it)).join('') : '<p class="muted small empty">' + t('tableEmpty') + '</p>';
    g.table.forEach(i => U.shown.add(i.id));
    $('used-chip').textContent = t('itemsLeft', { n: g.used, m: g.opts.perTurn });
    renderInfo(g);
  }
  function renderInfo(g) {
    const it = g.table.find(i => i.id === U.sel), box = $('item-info');
    if (!it) { box.innerHTML = '<span class="muted">' + t('pick') + '</span>'; return; }
    const [name, desc] = t('items')[it.k], can = Rou.canUse(g, U.me, it) && !U.busy && !U.pending;
    box.innerHTML = '<div class="ii-ic">' + Art.icon(it.k) + '</div><div class="ii-tx"><b>' + esc(name) + '</b><span>' + esc(desc) + '</span></div><button type="button" class="btn btn-alt" id="btn-use"' + (can ? '' : ' disabled') + '>' + t('useItem') + '</button>';
  }
  function renderControls(g) {
    if (!g) return;
    const mine = g.phase === 'play' && g.turn === U.me && !U.busy && !U.pending;
    $('btn-opp').disabled = !mine; $('btn-self').disabled = !mine;
    $('btn-opp').innerHTML = t('fireOpp') + '<small>' + t('fireOppD') + '</small>'; $('btn-self').innerHTML = t('fireSelf') + '<small>' + t('fireSelfD') + '</small>';
    document.querySelectorAll('#items .item').forEach(el => { const it = g.table.find(i => i.id === +el.dataset.id); el.classList.toggle('can', !!it && Rou.canUse(g, U.me, it) && !U.busy && !U.pending); });
    renderInfo(g);
    $('me').classList.toggle('turn', g.phase === 'play' && g.turn === U.me); $('opp').classList.toggle('turn', g.phase === 'play' && g.turn !== U.me);
  }
  function turnText(g) {
    if (g.phase !== 'play') return '';
    return g.turn === U.me ? t('yourTurn') : t('theirTurn', { n: esc(g.names[g.turn]) });
  }
  function logHTML(g) {
    const items = t('items'); const k = e => e === 'L' ? t('live') : t('blank');
    return g.log.slice().reverse().map(e => {
      let s = '', c = '';
      switch (e.t) {
        case 'shot': { const d = e.k === 'L' ? (e.blocked ? t('logBlocked') : t('logDmg', { n: e.dmg })) : ''; c = e.k; s = e.by === e.at ? t('logSelf', { a: nm(g, e.by), k: k(e.k), d }) : t('logShot', { a: nm(g, e.by), b: nm(g, e.at), k: k(e.k), d }); break; }
        case 'item': s = t('logItem', { a: nm(g, e.by), i: items[e.k][0] }) + (e.k === 'beer' ? ' → ' + k(e.kind) : ''); c = 'logitem'; break;
        case 'load': s = t('logLoad', { l: e.l, b: e.b }); c = 'sys'; break;
        case 'round': s = t('logRound', { n: e.n }); c = 'sys'; break;
        case 'roundEnd': s = t('logEnd', { n: nm(g, e.w) }); c = 'sys'; break;
        case 'skipped': s = t('logSkip', { n: nm(g, e.p) }); c = 'sys'; break;
        case 'again': s = t('logAgain', { n: nm(g, e.p) }); c = 'sys'; break;
        default: return '';
      }
      return '<div class="log-line ' + c + '">' + s + '</div>';
    }).join('');
  }
  function renderGame(g, first) {
    U.me = Net.mySeat() === 's1' ? 1 : 0; const o = 1 - U.me;
    $('opp').innerHTML = playerHTML(g, o); $('me').innerHTML = playerHTML(g, U.me);
    $('game-room-code-label').textContent = Net.mode() === 'online' ? Net.code() : '';
    $('game-room-code-label').style.display = Net.mode() === 'online' ? '' : 'none';
    $('round-chip').textContent = t('round', { n: g.round }) + ' · ' + t('wins', { a: g.wins[U.me], b: g.wins[o] });
    buildEmotes(); renderDrum(g); renderCounter(g); renderItems(g); renderControls(g);
    if (!U.busy) setBanner(turnText(g), g.turn === U.me ? 'mine' : '');
    $('log-panel').innerHTML = logHTML(g);
    tension(g);
  }
  function setBanner(txt, cls) { const b = $('banner'); b.className = 'banner' + (cls ? ' ' + cls : ''); b.innerHTML = txt ? '<span>' + txt + '</span>' : ''; }
  function tension(g) {
    const low = g.phase === 'play' && (g.hp[0] <= 1 || g.hp[1] <= 1), last = g.phase === 'play' && g.ch.length === 1 && g.pub.l > 0;
    document.body.classList.toggle('tense', low || last);
    Snd.setTension(g.phase === 'play' ? Math.min(1, (low ? .5 : 0) + (last ? .35 : 0) + (g.hp[0] + g.hp[1] <= 3 ? .2 : 0)) : 0);
    Snd.heart(g.phase === 'play' && g.hp[U.me] <= 1, g.hp[U.me] <= 1 && g.pub.l >= g.pub.b ? 900 : 1300);
  }

  // ---------------------------------------------------------------- animations ----
  function say(txt, cls) { const b = $('banner'); b.className = 'banner big ' + (cls || ''); b.innerHTML = '<span>' + txt + '</span>'; }
  function popIcon(k, label) {
    const el = document.createElement('div'); el.className = 'pop'; el.innerHTML = Art.icon(k) + '<div>' + label + '</div>'; $('stage').appendChild(el); setTimeout(() => el.remove(), 1300);
  }
  function floatAt(el, txt, cls) {
    if (!el) return; const r = el.getBoundingClientRect(), f = document.createElement('div');
    f.className = 'float ' + (cls || ''); f.textContent = txt; f.style.left = (r.left + r.width / 2) + 'px'; f.style.top = (r.top + r.height / 2) + 'px'; $('fx').appendChild(f); setTimeout(() => f.remove(), 1300);
  }
  function setAim(deg) { const g = $('gun'); g.style.transform = 'rotate(' + deg + 'deg)'; }
  function shake() { document.body.classList.remove('shake'); void document.body.offsetWidth; document.body.classList.add('shake'); setTimeout(() => document.body.classList.remove('shake'), 520); }
  function flashScreen(col) { const f = $('flash-screen'); f.style.background = col; if (reduce()) return; f.animate([{ opacity: .75 }, { opacity: 0 }], { duration: 480, easing: 'ease-out' }); }
  function muzzle() { if (reduce()) return; $('flash').animate([{ opacity: 1, transform: 'scale(.6)' }, { opacity: 1, transform: 'scale(1.1)', offset: .25 }, { opacity: 0, transform: 'scale(1.3)' }], { duration: 480, easing: 'ease-out' }); }
  const kindTxt = k => k === 'L' ? t('live') : t('blank');

  async function animate(g, before) {
    for (const e of g.ev) await playEv(e, g, before);
    setAim(0);
  }
  async function playEv(e, g, before) {
    const me = U.me, who = i => esc(g.names[i]);
    switch (e.t) {
      case 'round': say(t('roundN', { n: e.n, h: e.hp }), 'sys'); Snd.play('round'); await sleep(1000); break;
      case 'load': {
        Snd.play('load'); say(t('loading', { l: e.l, b: e.b }) + (e.items ? '<small>' + t('newItems', { n: e.items }) + '</small>' : ''), 'sys');
        U.extra += reduce() ? 0 : 720; U.prev = Object.assign({}, U.prev || {}, { keepAnim: false }); renderDrum(g); renderCounter(g);
        await sleep(300); Snd.play('spin'); await sleep(1300); break;
      }
      case 'shot': {
        const toMe = e.at === me; setAim(toMe ? 180 : 0);
        say(e.by === e.at ? t('aimSelf', { n: who(e.by) }) : t('aimOpp', { n: who(e.by), m: who(e.at) }), 'aim'); Snd.play('aim'); setExpr(e.at, 'scared', 2300); await sleep(650);
        const pl = before.pub.l + before.pub.b ? before.pub.l / (before.pub.l + before.pub.b) : .5, beats = pl > .5 ? 3 : 2;
        for (let i = 0; i < beats; i++) { Snd.play('beat'); await sleep(430 + (i ? 120 : 0)); }
        const panel = $(toMe ? 'me' : 'opp');
        if (e.k === 'L') {
          muzzle(); flashScreen(e.blocked ? '#6cc4f5' : '#ff4d6d'); shake(); Snd.play('live'); Snd.duck(1600); say(t('live'), 'live'); const avEl = panel.querySelector('.p-av');
          if (e.blocked) { floatAt(panel, t('blockedT'), 'blue'); Snd.play('shield'); Fx.spark(avEl); } else { Fx.blood(avEl); setExpr(e.at, 'hurt', 1700); if (e.by !== e.at) setExpr(e.by, 'smug', 1700); if (Net.mode() === 'local') { if (e.at === 1 && Math.random() < .5) setTimeout(() => showEmote(1, 'angry'), 900); else if (e.at === 0 && e.by === 1 && Math.random() < .5) setTimeout(() => showEmote(1, 'laugh'), 900); } floatAt(panel, t('dmg', { n: e.dmg }), 'red'); setTimeout(() => Snd.play('hurt'), 120); panel.classList.add('hit'); setTimeout(() => panel.classList.remove('hit'), 600); }
          await sleep(1300);
        } else { Snd.play('blank'); Fx.smoke($('gun-svg')); setExpr(e.at, 'laugh', 1200); say(t('blank'), 'blank'); floatAt(panel, t('miss'), 'gray'); await sleep(1000); }
        break;
      }
      case 'again': say(t('again'), 'good'); await sleep(750); break;
      case 'skipped': say(t('skipped', { n: who(e.p) }), 'sys'); Snd.play('bell'); await sleep(950); break;
      case 'item': await playItem(e, g); break;
      case 'roundEnd': Snd.play(e.w === me ? 'win' : 'lose'); say(t('roundWin', { n: who(e.w) }), e.w === me ? 'good' : 'live'); await sleep(1100); break;
    }
  }
  async function playItem(e, g) {
    const me = U.me, name = t('items')[e.k][0], who = esc(g.names[e.by]);
    const snd = { loupe: 'peek', phone: 'peek', beer: 'glass', lemon: 'heal', bell: 'bell', spin: 'spin', coin: 'coin', whisky: 'glass', tray: 'shield' }[e.k];
    Snd.play(snd); if (e.k === 'lemon') Fx.heal(panelOf(e.by).querySelector('.p-hp')); if (e.k === 'tray') Fx.spark(panelOf(e.by).querySelector('.p-av'), '#6cc4f5'); popIcon(e.k, t('usedBy', { n: who, i: esc(name) })); let wait = 1000;
    if (e.k === 'loupe' && e.by === me) { setTimeout(() => say(t('peekYou', { k: kindTxt(e.peek) }), e.peek === 'L' ? 'live' : 'blank'), 450); wait = 1700; }
    else if (e.k === 'phone' && e.by === me) { setTimeout(() => say(t('peekPhone', { i: e.pos + 1, k: kindTxt(e.peek) }), e.peek === 'L' ? 'live' : 'blank'), 450); wait = 1900; }
    else if ((e.k === 'loupe' || e.k === 'phone')) { setTimeout(() => say(t('peekThem', { n: who }), 'sys'), 450); wait = 1300; }
    else if (e.k === 'beer') { setTimeout(() => say(t('ejected', { k: kindTxt(e.kind) }), e.kind === 'L' ? 'live' : 'blank'), 450); wait = 1600; }
    else if (e.k === 'coin') { setTimeout(() => say(e.by === me && e.peek ? t('flipYou', { k: kindTxt(e.peek) }) : t('flipped'), 'sys'), 450); wait = 1500; }
    else if (e.k === 'spin') { U.extra += reduce() ? 0 : 720; renderDrum(g); wait = 1400; }
    await sleep(wait);
  }

  // ---------------------------------------------------------------- expressions + emotes ----
  const panelOf = seat => $(seat === U.me ? 'me' : 'opp');
  const isBot = seat => Net.mode() === 'local' && seat === 1;
  function setExpr(seat, ex, ms) {
    U.expr[seat] = ex; const p = panelOf(seat), av = p && p.querySelector('.p-av');
    if (av) av.innerHTML = Art.avatar(SEATCOL[seat], isBot(seat), ex);
    clearTimeout(U.exT[seat]); if (ms) U.exT[seat] = setTimeout(() => setExpr(seat, null), ms);
  }
  function showEmote(seat, kind) {
    setExpr(seat, kind, 1900); const p = panelOf(seat); if (!p) return;
    const b = document.createElement('div'); b.className = 'bubble'; b.innerHTML = Art.avatar(SEATCOL[seat], isBot(seat), kind); p.appendChild(b); setTimeout(() => b.remove(), 1950); Snd.play('select');
  }
  function buildEmotes() {
    const key = U.me + LANG; if (U.emoKey === key) return; U.emoKey = key;
    $('btn-emote').innerHTML = Art.avatar(SEATCOL[U.me], false, 'smug'); $('btn-emote').title = t('emote');
    $('emote-pop').innerHTML = Art.EXPR.map(k => '<button type="button" data-e="' + k + '" title="' + esc(t('emotes')[k]) + '">' + Art.avatar(SEATCOL[U.me], false, k) + '</button>').join('');
  }
  function doEmote(kind) {
    $('emote-pop').classList.remove('on'); if (Date.now() < U.emoCd) return; U.emoCd = Date.now() + 1500;
    showEmote(U.me, kind); Net.emote(kind);
    if (Net.mode() === 'local' && Math.random() < .6) setTimeout(() => showEmote(1, ({ smug: 'angry', laugh: 'smug', scared: 'laugh', angry: 'scared', hurt: 'smug' })[kind] || 'smug'), 700);
  }

  // ---------------------------------------------------------------- input ----
  async function doFire(at) {
    const g = U.view; if (!g || U.busy || U.pending || g.phase !== 'play' || g.turn !== U.me) return;
    Snd.unlock(); Snd.play('click'); U.pending = true; renderControls(g);
    const ok = await Net.act({ t: 'fire', at }); if (!ok) { U.pending = false; renderControls(g); Snd.play('error'); }
  }
  async function doItem(id) {
    const g = U.view; if (!g || U.busy || U.pending) return; const it = g.table.find(i => i.id === id);
    if (!it || !Rou.canUse(g, U.me, it)) { Snd.play('error'); return; }
    Snd.unlock(); U.pending = true; U.sel = null; renderControls(g);
    const ok = await Net.act({ t: 'item', id }); if (!ok) { U.pending = false; renderControls(g); Snd.play('error'); }
  }
  function afterIdle() {
    clearTimeout(U.botT); const g = U.view; if (!g) return;
    if (g.phase === 'between' || g.phase === 'over') { showOver(g); return; }
    if (Net.mode() === 'local' && g.phase === 'play' && g.turn === 1) U.botT = setTimeout(botMove, 800 + Math.random() * 700);
  }
  function botMove() {
    if (U.busy || U.queue.length || !U.view || Net.mode() !== 'local') return; const g = U.view;
    if (g.phase !== 'play' || g.turn !== 1) return;
    const a = Rou.bot(g, 1); if (a) Net.botAct(a);
  }
  function showOver(g) {
    if (U.overFor === g.seq) return; U.overFor = g.seq; const me = U.me, w = g.lw, host = Net.isHost(U.room || Net.room());
    if (g.phase === 'between') {
      modal('<h2 class="center">' + t('roundWin', { n: esc(g.names[w]) }) + '</h2><p class="center score">' + g.wins[me] + ' – ' + g.wins[1 - me] + '</p><p class="muted center">' + t('loserStarts') + '</p><button type="button" class="btn btn-block" id="btn-next">' + t('nextRound') + '</button>');
      Snd.play(w === me ? 'win' : 'lose');
    } else {
      const won = g.winner === me; Snd.play(won ? 'win' : 'lose'); if (won) Fx.confetti();
      modal('<h2 class="center ' + (won ? 'good' : 'bad') + '">' + (won ? t('youWin') : t('youLose')) + '</h2><p class="center">' + t('matchWin', { n: esc(g.names[g.winner]) }) + '</p><p class="center score">' + g.wins[me] + ' – ' + g.wins[1 - me] + '</p>' +
        (host ? '<button type="button" class="btn btn-block" id="btn-rematch">' + t('again2') + '</button>' : '<p class="muted center">' + t('waitHost') + '</p>') + '<button type="button" class="btn btn-secondary btn-block" id="btn-lobby">' + t('toLobby') + '</button>');
    }
  }
  function helpModal() {
    modal('<h2>' + t('helpT') + '</h2><ul class="help">' + t('helpBody').map(x => '<li>' + x + '</li>').join('') + '</ul><div class="help-items">' +
      Art.ITEMS.map(k => '<div class="hi">' + Art.icon(k) + '<div><b>' + esc(t('items')[k][0]) + '</b><span>' + esc(t('items')[k][1]) + '</span></div></div>').join('') + '</div><button type="button" class="btn btn-block" id="btn-close">OK</button>', true);
  }

  // ---------------------------------------------------------------- wiring ----
  async function leaveToLobby() { U.lastEmote = undefined; clearTimeout(U.botT); U.view = null; U.queue = []; U.busy = false; await Net.leave(); showLobby(); }
  function wire() {
    document.addEventListener('click', e => {
      if (e.target.closest('button,select,.item,.room-code-box')) { Snd.unlock(); if (U.screen === 'game') Snd.musicStart(); }
      if (!e.target.closest('.emote-pop,.emote-btn')) $('emote-pop').classList.remove('on');
      const eb = e.target.closest('.emote-pop button'); if (eb) { doEmote(eb.dataset.e); return; }
      if (e.target.closest('#btn-emote')) { $('emote-pop').classList.toggle('on'); Snd.play('click'); return; }
      const tb = e.target.closest('.tab-btn'); if (tb) { U.tab = tb.dataset.tab; renderLobbyTabs(); Snd.play('click'); return; }
      if (e.target.closest('#btn-next')) { closeModal(); U.overFor = null; Net.act({ t: 'next' }); return; }
      if (e.target.closest('#btn-rematch')) { closeModal(); Net.rematch(); return; }
      if (e.target.closest('#btn-lobby')) { closeModal(); leaveToLobby(); return; }
      if (e.target.closest('#btn-close')) { closeModal(); return; }
      if (e.target.closest('#btn-use')) { if (U.sel != null) doItem(U.sel); return; }
      const it = e.target.closest('#items .item');
      if (it) { const id = +it.dataset.id; U.sel = U.sel === id ? null : id; Snd.play('select'); renderItems(U.view); return; }
    });
    $('items').addEventListener('dblclick', e => { const it = e.target.closest('.item'); if (it) doItem(+it.dataset.id); });
    document.addEventListener('change', e => { if (e.target.classList.contains('lang-select')) { setLang(e.target.value); applyLang(); } });
    $('off-rules').addEventListener('click', e => segClick(e, (k, v) => { U.off[k] = v; try { localStorage.setItem('rou_rules', JSON.stringify(U.off)); } catch (x) {} $('off-rules').innerHTML = rulesHTML(U.off, true, true); }));
    $('rules-list').addEventListener('click', e => segClick(e, (k, v) => { if (Net.isHost(Net.room())) Net.setSetting(k, v); }));
    $('btn-start-offline').onclick = () => { const n = needName(); if (!n) return; Snd.unlock(); Net.startLocal(n, U.off); };
    $('btn-create-room').onclick = async () => {
      const n = needName(); if (!n) return; if (!Net.ONLINE_OK) { toast(t('onlineOff')); return; }
      try { await Net.createOnline(n); location.hash = Net.code(); } catch (e) { toast(t('onlineOff')); }
    };
    $('btn-join-room').onclick = async () => {
      const n = needName(); if (!n) return; const c = $('input-room-code').value.trim(); if (c.length < 5) return;
      if (!Net.ONLINE_OK) { toast(t('onlineOff')); return; }
      try { const r = await Net.joinOnline(c, n); if (!r.ok) toast(t(r.reason)); else location.hash = Net.code(); } catch (e) { toast(t('onlineOff')); }
    };
    $('btn-resume').onclick = async () => {
      if (Net.hasLocal() && Net.restoreLocal()) return;
      const c = Net.lastRoom(); if (c && (await Net.tryRejoin(c))) return; toast(t('noRoom')); $('resume-card').style.display = 'none';
    };
    $('btn-start-game').onclick = () => Net.startOnline();
    $('btn-leave-waiting').onclick = leaveToLobby;
    $('btn-leave-game').onclick = () => { if (confirm(t('confirmLeave'))) leaveToLobby(); };
    $('btn-rules').onclick = helpModal;
    $('btn-music').onclick = () => { Snd.musicToggle(); applyLang(); };
    $('btn-sound').onclick = () => { Snd.toggle(); applyLang(); if (U.view) tension(U.view); };
    $('btn-opp').onclick = () => doFire('opp'); $('btn-self').onclick = () => doFire('self');
    $('room-code-box').onclick = () => { const c = Net.code(); if (!c || Net.mode() !== 'online') return; const url = location.href.split('#')[0] + '#' + c; (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => toast(t('copied')), () => toast(url)); };
    document.addEventListener('keydown', e => {
      if (U.screen !== 'game' || /INPUT|SELECT|TEXTAREA/.test((e.target.tagName || ''))) return;
      if (e.key === '1') doFire('opp'); else if (e.key === '2') doFire('self'); else if (e.key === 'Escape') { U.sel = null; if (U.view) renderItems(U.view); }
    });
    $('input-name').addEventListener('change', saveName);
    $('input-room-code').addEventListener('input', e => { e.target.value = e.target.value.toUpperCase(); });
  }

  // ---------------------------------------------------------------- boot ----
  async function boot() {
    $('bg').innerHTML = Art.scene(); document.body.insertAdjacentHTML('afterbegin', Art.sprite());
    $('lobby-logo').innerHTML = Art.logo();
    $('gun-art').innerHTML = Art.drumFrame() + Art.BARREL; $('flash').innerHTML = Art.FLASH;
    $('hub').innerHTML = '<polygon points="180,184 191.3,188.7 196,200 191.3,211.3 180,216 168.7,211.3 164,200 168.7,188.7" fill="#e0b04a"/><polygon points="180,184 191.3,188.7 196,200 180,200" fill="rgba(255,255,255,.3)"/>';
    try { U.off = Rou.normSettings(JSON.parse(localStorage.getItem('rou_rules') || 'null')); } catch (e) { U.off = Rou.normSettings(); }
    try { $('input-name').value = localStorage.getItem('rou_name') || ''; } catch (e) {}
    Fx.init(); Net.onChange(onRoom); wire(); Snd.probe(); renderLobbyTabs();
    const hash = (location.hash || '').replace('#', '').toUpperCase();
    if (hash.length === 5) { U.tab = 'join'; $('input-room-code').value = hash; renderLobbyTabs(); }
    let back = false;
    try {
      const c = Net.lastRoom() || (hash.length === 5 ? hash : null);
      if (c && Net.ONLINE_OK) back = !!(await Promise.race([Net.tryRejoin(c), sleep(4000)]));
    } catch (e) {}
    if (!back && Net.hasLocal()) back = Net.restoreLocal();
    if (!back) showLobby();
  }
  window.addEventListener('DOMContentLoaded', boot);
})();
