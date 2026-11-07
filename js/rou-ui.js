// rou-ui.js — screens, table, drum, animations, bot driver. Rules live in rou-engine.js, storage in rou-net.js.
// The UI keeps a `view` (what is on screen) and a queue of newer states: each new state first plays its events (aim, suspense, reveal...)
// on top of the old view, then becomes the view. Input is locked while that plays.
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const SEATCOL = ['#ff6a4d', '#5eead4'];
  const U = { screen: null, view: null, queue: [], busy: false, pending: false, sel: null, me: 0, shown: new Set(), botT: null, extra: 0, prev: null, off: null, overFor: null, tab: 'offline', d3: false, spec: false, cam: 'side', camSeat: 0, aim: false, expr: [null, null], exT: [0, 0], lastEmote: undefined, emoKey: '', emoCd: 0, say: [null, null], sayT: [0, 0], lastTap: 0, talkSeq: '', talkT: null, room: null,
    myChar: (function () { try { const c = localStorage.getItem('rou_char'); if (c && Rou.CHARS.includes(c)) return c; } catch (e) {} return Rou.CHARS[Math.floor(Math.random() * Rou.CHARS.length)]; })() };
  const charOf = i => (U.view && U.view.chars && U.view.chars[i]) || (U.room && U.room.seats['s' + i] && U.room.seats['s' + i].char) || 'fox';
  const avatarOf = (i, ex) => Art.avatar(charOf(i), ex, null, SEATCOL[i]);
  const reduce = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  const nm = (g, i) => esc(g.names[i]);

  // ---------------------------------------------------------------- generic helpers ----
  function show(name) {
    U.screen = name;
    document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === 'screen-' + name));
    document.body.dataset.screen = name; setTimeout(refreshLeave, 0);
    document.body.classList.toggle('mode3d', U.d3 && name === 'game');
    if (U.d3) { if (name === 'game') R3D.start(); else R3D.stop(); }
    if (name !== 'game') { document.body.classList.remove('tense', 'cine'); Snd.heart(false); Snd.musicStop(); } else Snd.musicStart();
  }
  function toast(msg) { const el = $('toast'); el.textContent = msg; el.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('on'), 2200); }
  function closeModal() { $('modal').innerHTML = ''; U.overFor = null; }
  const leaveOpen = () => !!$('m-stay');                                   // the "leave or stay?" popup must survive game events (new turn, new round, rematch...)
  const closeModalSoft = () => { if (!leaveOpen()) closeModal(); };
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
    $('game-title').textContent = t('title'); $('btn-rules').textContent = '?'; $('btn-rules').title = t('help'); $('btn-leave-game').textContent = '✕'; $('btn-leave-game').title = t('exit'); $('btn-sound').textContent = Snd.isMuted() ? '🔇' : '🔊'; $('btn-sound').title = 'SFX'; $('btn-3d').textContent = U.d3 ? '3D ✓' : (U.can3d ? '2D' : '3D ✕'); $('btn-3d').title = U.d3 ? '→ 2D' : (U.can3d ? '→ 3D' : no3dReason()); $('btn-music').textContent = Snd.musicOn() ? '🎵' : '🔕'; $('btn-music').title = t('music');
    $('table-title').textContent = '🍸 ' + (LANG === 'vi' ? 'Bàn chung' : 'Shared table');
    $('chat-input').placeholder = t('chatPh'); $('chat-send').textContent = '➤'; $('chat-send').title = t('chatSend'); C.sugKey = '';
    offRules(); offChars();
    langSelects();
    if (U.screen === 'waiting') renderWaiting(Net.room());
    if (U.screen === 'game' && U.view) renderGame(U.view);
  }
  // small icon per rule (48x48 inline SVG, drawn in the same ink style as the animals)
  const IC = body => '<svg viewBox="0 0 48 48" aria-hidden="true"><g stroke="#2a1a14" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round">' + body + '</g></svg>';
  const RULE_IC = {
    target: IC('<path d="M14 6 H34 V18 Q34 29 24 30 Q14 29 14 18 Z" fill="#f0b43c"/><path d="M14 10 H8 Q8 21 15 22 M34 10 H40 Q40 21 33 22" fill="none"/><path d="M24 30 V38 M16 42 H32" fill="none" stroke-width="3"/><path d="M19 11 V19" fill="none" stroke="#fff3b0" stroke-width="2"/>'),
    perTurn: IC('<path d="M9 14 H25 L23 40 H11 Z" fill="#ffb547"/><path d="M8 14 L10 7 L16 9 L20 5 L25 9 L27 14 Z" fill="#fff7e6"/><circle cx="36" cy="29" r="9" fill="#bfeaf4"/><circle cx="36" cy="29" r="5.5" fill="#e9fbff"/><path d="M42 36 L47 42" fill="none" stroke-width="3.2"/>'),
    bot: IC('<path d="M24 12 V6" fill="none"/><circle cx="24" cy="5" r="2.4" fill="#ffb547"/><rect x="10" y="12" width="28" height="24" rx="6" fill="#9ec5d0"/><circle cx="18" cy="23" r="3.8" fill="#fff"/><circle cx="30" cy="23" r="3.8" fill="#fff"/><path d="M17 31 H31" fill="none" stroke-width="2.4"/><path d="M5 40 H43" fill="none" stroke-width="2.6" opacity=".55"/>'),
    talk: IC('<path d="M9 8 H39 Q44 8 44 13 V27 Q44 32 39 32 H25 L15 41 V32 H9 Q4 32 4 27 V13 Q4 8 9 8 Z" fill="#f6f0e2"/><circle cx="15" cy="20" r="2.6" fill="#2a1a14" stroke="none"/><circle cx="24" cy="20" r="2.6" fill="#2a1a14" stroke="none"/><circle cx="33" cy="20" r="2.6" fill="#2a1a14" stroke="none"/>')
  };
  const seg = (key, opts, cur, edit) => '<div class="seg">' + opts.map(o => '<button type="button" class="seg-btn' + (String(cur) === String(o[0]) ? ' on' : '') + '" data-k="' + key + '" data-v="' + o[0] + '"' + (edit ? '' : ' disabled') + '>' + o[1] + '</button>').join('') + '</div>';
  const ruleRow = (ic, ttl, desc, ctl) => '<div class="rule-row"><div class="rule-main"><span class="rule-ic">' + RULE_IC[ic] + '</span><div><b>' + t(ttl) + '</b>' + (desc ? '<p class="muted">' + t(desc) + '</p>' : '') + '</div></div>' + ctl + '</div>';
  function rulesHTML(s, edit) {
    return ruleRow('target', 'rTarget', 'rTargetD', seg('target', [[1, '1'], [2, '2'], [3, '3']], s.target, edit)) + ruleRow('perTurn', 'rPer', 'rPerD', seg('perTurn', [[1, '1'], [2, '2'], [3, '3']], s.perTurn, edit)) +
      ruleRow('bot', 'rBot', '', seg('bot', [['easy', t('easy')], ['normal', t('normal')], ['hard', t('hard')]], s.bot, edit)) + ruleRow('talk', 'rTalk', 'rTalkD', seg('talk', [[0, t('offS')], [1, t('on')]], s.talk ? 1 : 0, edit));
  }
  function wireRules(root, apply) { root.querySelectorAll('.seg-btn').forEach(b => { b.onclick = () => { if (b.disabled) return; Snd.play('click'); const k = b.dataset.k; let v = b.dataset.v; v = k === 'bot' ? v : k === 'talk' ? v === '1' : parseInt(v, 10); apply(k, v); }; }); }
  function offRules() { $('off-rules').innerHTML = rulesHTML(U.off, true); wireRules($('off-rules'), (k, v) => { U.off[k] = v; U.off = Rou.normSettings(U.off); try { localStorage.setItem('rou_rules', JSON.stringify(U.off)); } catch (x) {} offRules(); }); }
  const charRow = (cur, taken) => '<div class="char-row">' + Rou.CHARS.map(c => '<button type="button" class="char-btn' + (c === cur ? ' on' : '') + '" data-c="' + c + '"' + (taken && taken.has(c) ? ' disabled' : '') + ' title="' + esc(t('chars')[c]) + '"><span class="ca">' + Art.avatar(c, 'neutral') + '</span><small>' + esc(t('chars')[c]) + '</small></button>').join('') + '</div>';
  function wireChars(root, fn) { root.querySelectorAll('.char-btn').forEach(b => { b.onclick = () => { if (b.disabled) return; Snd.play('select'); fn(b.dataset.c); }; }); }
  const saveChar = c => { U.myChar = c; try { localStorage.setItem('rou_char', c); } catch (e) {} };
  function offChars() { $('off-chars').innerHTML = '<label>' + t('pickChar') + '</label>' + charRow(U.myChar); wireChars($('off-chars'), c => { saveChar(c); offChars(); }); }

  // ---------------------------------------------------------------- lobby ----
  function renderLobbyTabs() {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === U.tab));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + U.tab));
  }
  function showLobby() {
    closeModal(); show('lobby'); applyLang(); $('lobby-logo').innerHTML = Art.logo(); try { $('input-name').value = localStorage.getItem('rou_name') || $('input-name').value; } catch (e) {}
    ['create', 'join'].forEach(k => { $('tab-btn-' + k).disabled = !Net.ONLINE_OK; $('tab-btn-' + k).style.opacity = Net.ONLINE_OK ? 1 : .4; });
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
      return '<div class="seat' + (mine === k ? ' mine' : '') + '" style="--sc:' + SEATCOL[i] + '"><div class="seat-av">' + Art.avatar(s.char || 'fox', 'neutral', null, SEATCOL[i]) + '</div><div class="seat-body"><div class="seat-name">' + esc(s.name) + '</div><div class="seat-tags">' +
        (mine === k ? '<span class="tag you">' + t('you') + '</span>' : '') + (room.hostUid === s.uid ? '<span class="tag">' + t('host') + '</span>' : '') + (s.bot ? '<span class="tag">' + t('botTag') + '</span>' : '') + (s.connected === false ? '<span class="tag off">' + t('off') + '</span>' : '') + '</div></div>' + (s.bot && host ? '<button type="button" class="mini-x" data-rm="' + k + '" title="' + t('rmBot') + '">✕</button>' : '') + '</div>';
    }).join('');
    $('seat-grid').querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { Snd.play('click'); Net.removeBot(b.dataset.rm); });
    $('rules-list').innerHTML = rulesHTML(room.settings, host); wireRules($('rules-list'), (k, v) => { if (Net.isHost(Net.room())) Net.setSetting(k, v); });
    $('rules-readonly-hint').style.display = host ? 'none' : 'block';
    const two = room.seats.s0 && room.seats.s1, ab = $('btn-add-bot'); ab.style.display = host ? '' : 'none'; ab.textContent = t('addBot'); ab.disabled = !!two; ab.onclick = () => { Snd.play('click'); Net.addBot(); };
    const cur = mine && room.seats[mine] ? room.seats[mine].char : null, other = ['s0', 's1'].find(k => k !== mine && room.seats[k]);
    $('wait-chars').innerHTML = mine ? '<label>' + t('pickChar') + '</label>' + charRow(cur, new Set(other ? [room.seats[other].char] : [])) : ''; wireChars($('wait-chars'), c => { saveChar(c); Net.setChar(c); });
    $('btn-start-game').style.display = host ? 'block' : 'none'; $('btn-start-game').disabled = !two;
    $('waiting-hint').textContent = (host ? (two ? '' : t('needTwo')) : t('waitHost')) + (Net.mode() === 'online' ? (room.secure ? ' ' + t('sealedOn') : ' ' + t('sealedOff')) : '');
  }

  // ---------------------------------------------------------------- room callback ----
  function onRoom(room) {
    U.room = room; chatSync();
    if (!room) { if (U.screen === 'game' || U.screen === 'waiting') { showLobby(); toast(t('noRoom')); } return; }
    if (room.status === 'lobby') { if (U.screen !== 'waiting') { show('waiting'); applyLang(); } renderWaiting(room); return; }
    const g = Net.getG(room); if (!g) return;
    if (U.screen !== 'game') { show('game'); applyLang(); }
    pushState(g, room);
    if (room.emote) { if (U.lastEmote === undefined) U.lastEmote = room.emote.ts; else if (room.emote.ts !== U.lastEmote) { U.lastEmote = room.emote.ts; if (room.emote.s !== (Net.mySeat() === 's1' ? 1 : 0) || Net.isSpec()) showEmote(room.emote.s, room.emote.k); } } else if (U.lastEmote === undefined) U.lastEmote = null;
  }
  function pushState(g, room) {
    U.room = room;
    U.spec = Net.mode() === 'online' && Net.isSpec(); U.me = U.spec ? (U.camSeat === 1 ? 1 : 0) : (Net.mySeat() === 's1' ? 1 : 0);
    if (!U.view || U.view.id !== g.id) {
      U.view = g; if (U.d3) R3D.setup({ names: g.names, chars: g.chars, cols: SEATCOL, view: (U.spec && U.cam === 'side') ? 'side' : U.me, sign: g.sign, lang: g.lang });                       // first state of a game (or a rematch): no animation
      U.queue = []; U.busy = false; U.shown = new Set(); U.prev = null; U.extra = 0; U.pending = false; U.say = [null, null]; U.talkSeq = ''; closeModalSoft();
      renderGame(g, true); afterIdle(); return;
    }
    if (g.seq > U.view.seq) {
      if (!U.busy && !U.queue.length && g.seq === U.view.seq + 1 && g.ev.length && g.ev.every(e => e.t === 'talk')) { g.ev.forEach(e => showTalk(e, g)); U.view = g; renderGame(g); afterIdle(); return; }      // a comment never blocks anything: it is shown outside the animation queue
      U.queue.push(g); U.pending = false; runQueue(); return;
    }
    if (!U.busy) { U.view = g; renderGame(g); }
  }
  async function runQueue() {
    if (U.busy) return;
    U.busy = true; renderControls(U.view);
    while (U.queue.length) {
      const g = U.queue.shift(), before = U.view;
      if (g.seq <= before.seq) continue;
      closeModalSoft();
      try { await animate(g, before); } catch (e) { console.error(e); }
      U.view = g; renderGame(g);
    }
    U.busy = false; renderControls(U.view); afterIdle();
  }

  // ---------------------------------------------------------------- rendering the table ----
  const heartSvg = on => '<svg class="heart' + (on ? '' : ' lost') + '" viewBox="0 0 64 64"><use href="#ic-heart"/></svg>';
  function playerHTML(g, i) {
    const you = i === U.me, bot = Net.mode() === 'local' && i === 1;
    let hearts = ''; for (let h = 0; h < g.hp[i]; h++) hearts += heartSvg(true);
    if (U.shatter && U.shatter.seat === i) for (let h = 0; h < U.shatter.n; h++) hearts += '<svg class="heart brk" style="animation-delay:' + h * 90 + 'ms" viewBox="0 0 64 64"><use href="#ic-heart"/></svg>';
    let badges = '';
    if (g.shield[i]) badges += '<span class="badge" title="' + esc(t('items').tray[0]) + '">' + Art.icon('shield') + '</span>';
    if (g.skip[i]) badges += '<span class="badge bad" title="' + esc(t('items').cuffs[0]) + '">' + Art.icon('skip') + '</span>';
    if (g.dbl && g.turn === i && g.phase === 'play') badges += '<span class="badge hot" title="' + esc(t('items').whisky[0]) + '">' + Art.icon('dbl') + '<b>x2</b></span>';
    let pips = ''; for (let w = 0; w < g.opts.target; w++) pips += '<i class="pip' + (w < g.wins[i] ? ' on' : '') + '"></i>';
    const off = Net.mode() === 'online' && U.room && U.room.seats['s' + i] && U.room.seats['s' + i].connected === false;
    return '<div class="say' + (U.say[i] ? ' on' : '') + '" id="say-' + i + '">' + (U.say[i] ? esc(U.say[i]) : '') + '</div><div class="p-av">' + avatarOf(i, U.expr[i]) + '</div><div class="p-body"><div class="p-name">' + esc(g.names[i]) + (you ? ' <span class="tag you">' + t('you') + '</span>' : '') + (off ? ' <span class="tag off">' + t('off') + '</span>' : '') + '</div>' +
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
    g.table.forEach(i => U.shown.add(i.id)); if (U.d3) R3D.setSelected(U.sel);
    $('used-chip').textContent = t('itemsLeft', { n: g.used, m: g.opts.perTurn });
    renderInfo(g);
  }
  function renderInfo(g) {
    const hv = U.hov != null && U.hov !== U.sel ? g.table.find(i => i.id === U.hov) : null;
    const it = hv || g.table.find(i => i.id === U.sel), box = $('item-info');
    if (!it) { box.innerHTML = '<span class="muted">' + t('pick') + '</span>'; return; }
    const [name, desc] = t('items')[it.k], can = !hv && Rou.canUse(g, U.me, it) && !U.busy && !U.pending;
    if (hv) { box.innerHTML = '<div class="ii-ic">' + Art.icon(it.k) + '</div><div class="ii-tx"><b>' + esc(name) + '</b><span>' + esc(desc) + '</span></div>'; return; }
    box.innerHTML = '<div class="ii-ic">' + Art.icon(it.k) + '</div><div class="ii-tx"><b>' + esc(name) + '</b><span>' + esc(desc) + '</span></div><button type="button" class="btn btn-alt" id="btn-use"' + (can ? '' : ' disabled') + '>' + t('useItem') + '</button>';
  }
  function renderControls(g) {
    if (!g) return;
    const mine = g.phase === 'play' && g.turn === U.me && !U.busy && !U.pending && !U.spec;
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
        case 'talk': s = '<b>' + nm(g, e.by) + ':</b> ' + esc(t('talk')[e.c][e.v % t('talk')[e.c].length]); c = 'sys talk'; break;
        case 'again': s = t('logAgain', { n: nm(g, e.p) }); c = 'sys'; break;
        default: return '';
      }
      return '<div class="log-line ' + c + '">' + s + '</div>';
    }).join('');
  }
  function renderGame(g, first) {
    U.spec = Net.mode() === 'online' && Net.isSpec(); U.me = U.spec ? (U.camSeat === 1 ? 1 : 0) : (Net.mySeat() === 's1' ? 1 : 0); const o = 1 - U.me;
    document.body.classList.toggle('spec', U.spec); $('cam-bar').style.display = U.spec ? 'flex' : 'none';
    document.querySelectorAll('#cam-bar button').forEach(b => { const c = b.dataset.cam; b.textContent = c === 'side' ? t('camSide') : t('camP', { n: esc(g.names[+c]) }); b.classList.toggle('on', String(U.cam === 'side' ? 'side' : U.camSeat) === c); });
    if (U.d3) { R3D.setView(U.spec && U.cam === 'side' ? 'side' : U.me); R3D.sync(g); }
    $('opp').innerHTML = playerHTML(g, o); $('me').innerHTML = playerHTML(g, U.me);
    $('game-room-code-label').textContent = Net.mode() === 'online' ? Net.code() + (U.spec ? ' · ' + t('spec') : (Net.specCount() ? ' · 👁' + Net.specCount() : '')) : '';
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
    U.mid = null;
    try { for (const e of g.ev) await playEv(e, g, before); } finally { U.mid = null; U.shatter = null; }
    setAim(0);
  }
  // At the moment of reveal: apply the shot to what is on screen right away (hearts, shield, live/blank counter).
  function liveUpdate(e, base) {
    const m = Object.assign({}, base, { hp: base.hp.slice(), shield: base.shield.slice(), pub: Object.assign({}, base.pub), dbl: false });
    m.pub[e.k === 'L' ? 'l' : 'b'] = Math.max(0, m.pub[e.k === 'L' ? 'l' : 'b'] - 1);
    U.shatter = null;
    if (e.k === 'L') { if (e.blocked) m.shield[e.at] = false; else { m.hp[e.at] = Math.max(0, m.hp[e.at] - e.dmg); U.shatter = { seat: e.at, n: Math.min(e.dmg, base.hp[e.at]) }; } }
    U.mid = m; const o = 1 - U.me;
    $('opp').innerHTML = playerHTML(m, o); $('me').innerHTML = playerHTML(m, U.me); renderCounter(m);
    if (U.d3) R3D.live(m, e);
    return m;
  }
  async function playEv(e, g, before) {
    const me = U.me, who = i => esc(g.names[i]);
    switch (e.t) {
      case 'round': if (U.d3) { R3D.revive(0); R3D.revive(1); } say(t('roundN', { n: e.n, h: e.hp }), 'sys'); Snd.play('round'); await sleep(1000); break;
      case 'load': {
        Snd.play('load'); say(t('loading', { l: e.l, b: e.b }) + (e.items ? '<small>' + t('newItems', { n: e.items }) + '</small>' : ''), 'sys');
        U.extra += reduce() ? 0 : 720; U.prev = Object.assign({}, U.prev || {}, { keepAnim: false }); renderDrum(g); renderCounter(g); if (U.d3) { R3D.sync(g, { keepSel: true }); R3D.spinDrum(1000); }
        await sleep(300); Snd.play('spin'); await sleep(1300); break;
      }
      case 'shot': {
        const toMe = e.at === me; setAim(toMe ? 180 : 0);
        say(e.by === e.at ? t('aimSelf', { n: who(e.by) }) : t('aimOpp', { n: who(e.by), m: who(e.at) }), 'aim'); Snd.play('aim'); setExpr(e.at, 'scared', 2300); await (U.d3 ? R3D.gunAim(e.by, e.at) : sleep(650));
        before = U.mid || before; const pl = before.pub.l + before.pub.b ? before.pub.l / (before.pub.l + before.pub.b) : .5, beats = pl > .5 ? 3 : 2;
        for (let i = 0; i < beats; i++) { Snd.play('beat'); await (U.d3 ? R3D.gunSuspense(430 + (i ? 120 : 0)) : sleep(430 + (i ? 120 : 0))); }
        if (U.d3) R3D.gunFire(e.by, e.at, e.k, e.blocked); liveUpdate(e, before); const panel = $(toMe ? 'me' : 'opp');
        if (e.k === 'L') {
          muzzle(); flashScreen(e.blocked ? '#6cc4f5' : '#ff4d6d'); shake(); Snd.play('live'); Snd.duck(1600); say(t('live'), 'live'); const avEl = panel.querySelector('.p-av');
          if (e.blocked) { floatAt(panel, t('blockedT'), 'blue'); Snd.play('shield'); Fx.spark(avEl); } else { Fx.blood(avEl); setExpr(e.at, 'hurt', 1700); if (e.by !== e.at) setExpr(e.by, 'smug', 1700); if (isBot(1)) { if (e.at === 1 && Math.random() < .5) setTimeout(() => showEmote(1, 'angry'), 900); else if (e.at === 0 && e.by === 1 && Math.random() < .5) setTimeout(() => showEmote(1, 'laugh'), 900); } floatAt(panel, t('dmg', { n: e.dmg }), 'red'); setTimeout(() => Snd.play('hurt'), 120); panel.classList.add('hit'); setTimeout(() => panel.classList.remove('hit'), 600); }
          await sleep(1300);
        } else { Snd.play('blank'); Fx.smoke($('gun-svg')); setExpr(e.at, 'laugh', 1200); say(t('blank'), 'blank'); floatAt(panel, t('miss'), 'gray'); await sleep(1000); }
        if (U.d3) await R3D.gunPut(e.by);
        break;
      }
      case 'again': say(t('again'), 'good'); await sleep(750); break;
      case 'skipped': say(t('skipped', { n: who(e.p) }), 'sys'); Snd.play('cuff'); await sleep(950); break;
      case 'item': await playItem(e, g); break;
      case 'talk': showTalk(e, g); break;
      case 'roundEnd': if (U.d3) R3D.die(1 - e.w); Snd.play(e.w === me ? 'win' : 'lose'); say(t('roundWin', { n: who(e.w) }), e.w === me ? 'good' : 'live'); await sleep(1100); break;
    }
  }
  function patchMid(e, g) {   // keep the live view consistent with items used earlier in the same turn
    const b = U.mid || U.view; if (!b || !['tray', 'lemon', 'whisky', 'beer', 'cuffs'].includes(e.k)) return;
    const m = Object.assign({}, b, { hp: b.hp.slice(), shield: b.shield.slice(), skip: b.skip.slice(), pub: Object.assign({}, b.pub) });
    if (e.k === 'tray') m.shield[e.by] = true; else if (e.k === 'lemon') m.hp[e.by] = Math.min(g.maxHp, m.hp[e.by] + 1); else if (e.k === 'whisky') m.dbl = true; else if (e.k === 'cuffs') m.skip[1 - e.by] = true; else if (e.k === 'beer') m.pub[e.kind === 'L' ? 'l' : 'b'] = Math.max(0, m.pub[e.kind === 'L' ? 'l' : 'b'] - 1);
    U.mid = m;
  }
  async function playItem(e, g) {
    patchMid(e, g);
    const me = U.me, name = t('items')[e.k][0], who = esc(g.names[e.by]);
    const snd = { loupe: 'peek', phone: 'peek', beer: 'glass', lemon: 'heal', cuffs: 'cuff', spin: 'spin', coin: 'coin', whisky: 'glass', tray: 'shield' }[e.k];
    Snd.play(snd); const p3 = U.d3 ? R3D.useItem(e.by, e.k, e.id) : null; if (e.k === 'lemon') Fx.heal(panelOf(e.by).querySelector('.p-hp')); if (e.k === 'tray') Fx.spark(panelOf(e.by).querySelector('.p-av'), '#6cc4f5'); popIcon(e.k, t('usedBy', { n: who, i: esc(name) })); let wait = 1000;
    if (e.k === 'loupe' && e.by === me) { setTimeout(() => say(t('peekYou', { k: kindTxt(e.peek) }), e.peek === 'L' ? 'live' : 'blank'), 450); wait = 1700; }
    else if (e.k === 'phone' && e.by === me) { setTimeout(() => say(t('peekPhone', { i: e.pos + 1, k: kindTxt(e.peek) }), e.peek === 'L' ? 'live' : 'blank'), 450); wait = 1900; }
    else if ((e.k === 'loupe' || e.k === 'phone')) { setTimeout(() => say(t('peekThem', { n: who }), 'sys'), 450); wait = 1300; }
    else if (e.k === 'beer') { setTimeout(() => say(t('ejected', { k: kindTxt(e.kind) }), e.kind === 'L' ? 'live' : 'blank'), 450); wait = 1600; }
    else if (e.k === 'coin') { setTimeout(() => say(e.by === me && e.peek ? t('flipYou', { k: kindTxt(e.peek) }) : t('flipped'), 'sys'), 450); wait = 1500; }
    else if (e.k === 'spin') { U.extra += reduce() ? 0 : 720; renderDrum(g); wait = 1400; if (U.d3) setTimeout(() => { R3D.sync(g, { keepSel: true }); R3D.spinDrum(1000); }, 1500); }
    await Promise.all([sleep(wait), p3]);
  }

  // ---------------------------------------------------------------- expressions + emotes ----
  const panelOf = seat => $(seat === U.me ? 'me' : 'opp');
  const botSeat = () => { const r = U.room || Net.room(); if (!r) return -1; const k = ['s0', 's1'].find(x => r.seats[x] && r.seats[x].bot); return k ? (k === 's1' ? 1 : 0) : -1; };
  const isBot = seat => botSeat() === seat;
  const canDriveBot = () => Net.mode() === 'local' || (Net.mode() === 'online' && Net.isHost(U.room || Net.room()));
  function setExpr(seat, ex, ms) {
    U.expr[seat] = ex; if (U.d3) R3D.setExpr(seat, ex || 'neutral'); const p = panelOf(seat), av = p && p.querySelector('.p-av');
    if (av) av.innerHTML = avatarOf(seat, ex);
    clearTimeout(U.exT[seat]); if (ms) U.exT[seat] = setTimeout(() => setExpr(seat, null), ms);
  }
  // a comment (bot table talk or a chat line of a seated player): 2D a bubble over the avatar, 3D a small board over the head
  function bubble(i, txt, ms) {
    U.say[i] = txt; const el = $('say-' + i); if (el) { el.textContent = txt; el.classList.add('on'); }
    clearTimeout(U.sayT[i]); U.sayT[i] = setTimeout(() => { U.say[i] = null; const e = $('say-' + i); if (e) { e.classList.remove('on'); e.textContent = ''; } }, ms);
  }
  function say3(i, txt, ms, g) { if (U.d3) R3D.say(i, txt, (g || U.view).names[i], SEATCOL[i], ms); else bubble(i, txt, ms); }
  function showTalk(e, g) {
    const arr = t('talk')[e.c], text = arr[e.v % arr.length], ms = reduce() ? 3000 : 3600 + text.length * 25;
    say3(e.by, text, ms, g); setExpr(e.by, 'smug', 1800); Snd.play('select');
  }
  function showEmote(seat, kind) {
    if (seat == null || seat < 0) return;
    if (kind === 'slam') { if (U.d3 && !U.busy) R3D.slam(seat); return; }
    if (kind === 'point') { if (U.d3 && !U.busy) R3D.point(seat, 1 - seat); return; }
    if (!Art.EXPR.includes(kind)) return;
    setExpr(seat, kind, 1900); const p = panelOf(seat); if (!p) return;
    const b = document.createElement('div'); b.className = 'bubble'; b.innerHTML = avatarOf(seat, kind); p.appendChild(b); setTimeout(() => b.remove(), 1950); Snd.play('select');
  }
  function buildEmotes() {
    const key = U.me + LANG + charOf(U.me); if (U.emoKey === key) return; U.emoKey = key;
    $('btn-emote').innerHTML = avatarOf(U.me, 'smug'); $('btn-emote').title = t('emote');
    $('emote-pop').innerHTML = Art.EXPR.map(k => '<button type="button" data-e="' + k + '" title="' + esc(t('emotes')[k]) + '">' + avatarOf(U.me, k) + '</button>').join('');
  }
  function doEmote(kind) {
    $('emote-pop').classList.remove('on'); if (Date.now() < U.emoCd) return; U.emoCd = Date.now() + 1500;
    showEmote(U.me, kind); Net.emote(kind);
    if (isBot(1) && Net.mode() === 'local' && Math.random() < .6) setTimeout(() => showEmote(1, ({ smug: 'angry', laugh: 'smug', scared: 'laugh', angry: 'scared', hurt: 'smug' })[kind] || 'smug'), 700);
  }
  async function doSlam() { if (!U.d3 || U.busy || U.pending || U.spec) return; const ok = await R3D.slam(U.me); if (ok) Net.emote('slam'); }
  async function doPoint() { if (!U.d3 || U.busy || U.pending || U.spec) return; const ok = await R3D.point(U.me, 1 - U.me); if (ok) Net.emote('point'); }

  // ---------------------------------------------------------------- input ----
  async function doFire(at) {
    const g = U.view; if (!g || U.busy || U.pending || g.phase !== 'play' || g.turn !== U.me) return;
    Snd.unlock(); Snd.play('click'); U.pending = true; U.aim = false; if (U.d3) R3D.setAimMode(false); renderControls(g);
    const ok = await Net.act({ t: 'fire', at }); if (!ok) { U.pending = false; renderControls(g); Snd.play('error'); }
  }
  async function doItem(id) {
    const g = U.view; if (!g || U.busy || U.pending) return; const it = g.table.find(i => i.id === id);
    if (!it || !Rou.canUse(g, U.me, it)) { Snd.play('error'); return; }
    Snd.unlock(); U.pending = true; U.sel = null; renderControls(g);
    const ok = await Net.act({ t: 'item', id }); if (!ok) { U.pending = false; renderControls(g); Snd.play('error'); }
  }
  // click on a 3D object: items are selected (click again = use), the revolver arms the shot (click the opponent = shoot them, click it again = shoot yourself)
  function onPick3(p) {
    const g = U.view; if (!g || U.spec || U.busy || U.pending) return; Snd.unlock();
    if (p.type === 'item') { if (U.sel === p.id) { doItem(p.id); } else { U.sel = p.id; Snd.play('select'); renderInfo(g); R3D.setSelected(p.id); } return; }
    if (p.type === 'gun') {
      if (g.phase !== 'play' || g.turn !== U.me) { toast(t('notTurn')); return; }
      if (!U.aim) { U.aim = true; R3D.setAimMode(true); toast(t('aimHint')); Snd.play('select'); } else doFire('self'); return;
    }
    if (p.type === 'player' && p.seat !== U.me) { if (U.aim) doFire('opp'); else doPoint(); return; }
    if (p.type === 'table') { const now = Date.now(); if (now - U.lastTap < 380) { U.lastTap = 0; doSlam(); return; } U.lastTap = now; }
    U.sel = null; U.aim = false; R3D.setAimMode(false); R3D.setSelected(null); renderInfo(g);
  }
  function afterIdle() {
    clearTimeout(U.botT); clearTimeout(U.talkT); const g = U.view; if (!g) return;
    if (g.phase === 'between' || g.phase === 'over') { showOver(g); return; }
    const bs = botSeat(); if (bs < 0 || !canDriveBot() || g.phase !== 'play') return;
    if (g.turn === bs) U.botT = setTimeout(botMove, 800 + Math.random() * 700);
    else if (g.opts.talk && !g.talked && U.talkSeq !== g.id + ':' + g.seq) { U.talkSeq = g.id + ':' + g.seq; U.talkT = setTimeout(botChat, 900 + Math.random() * 1500); }      // the bot speaks while the human decides
  }
  const botView = () => Net.authG() || U.view;      // sealed room: the host's bot plays from the full state, nobody else has it
  function botMove() {
    const bs = botSeat(); if (bs < 0 || U.busy || U.queue.length || !U.view || !canDriveBot()) return; const g = botView();
    if (!g || g.phase !== 'play' || g.turn !== bs || g.seq !== U.view.seq) return;
    const a = Rou.bot(g, bs); if (a) Net.act(a, bs);
  }
  function botChat() {
    const bs = botSeat(); if (bs < 0 || U.busy || U.queue.length || !U.view || !canDriveBot()) return; const g = botView();
    if (!g || g.seq !== U.view.seq) return; const a = Rou.botTalk(g, bs); if (a) Net.act(a, bs);
  }
  function showOver(g) {
    if (U.overFor === g.seq || leaveOpen()) return; U.overFor = g.seq; const me = U.me, w = g.lw, host = Net.isHost(U.room || Net.room());
    if (g.phase === 'between') {
      modal('<h2 class="center">' + t('roundWin', { n: esc(g.names[w]) }) + '</h2><p class="center score">' + g.wins[me] + ' – ' + g.wins[1 - me] + '</p><p class="muted center">' + t('loserStarts') + '</p>' + (U.spec ? '' : '<button type="button" class="btn btn-block" id="btn-next">' + t('nextRound') + '</button>'));
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
  async function leaveToLobby() { U.lastEmote = undefined; clearTimeout(U.botT); clearTimeout(U.talkT); closeModal(); document.body.classList.remove('cine'); U.view = null; U.queue = []; U.busy = false; await Net.leave(); showLobby(); }
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
    $('btn-start-offline').onclick = () => { const n = needName(); if (!n) return; Snd.unlock(); Net.startLocal(n, U.off, U.myChar); };
    $('btn-create-room').onclick = async () => {
      const n = needName(); if (!n) return; if (!Net.ONLINE_OK) { toast(t('onlineOff')); return; }
      try { await Net.createOnline(n, U.myChar); } catch (e) { toast(t('onlineOff')); }
    };
    $('btn-join-room').onclick = async () => {
      const n = needName(); if (!n) return; const c = $('input-room-code').value.trim(); if (c.length < 5) return;
      if (!Net.ONLINE_OK) { toast(t('onlineOff')); return; }
      try { const r = await Net.joinOnline(c, n, U.myChar); if (!r.ok) toast(t(r.reason)); else if (r.spectator) toast(t('specNote')); } catch (e) { toast(t('onlineOff')); }
    };
    $('btn-resume').onclick = async () => {
      if (Net.hasLocal() && Net.restoreLocal()) return;
      const c = Net.lastRoom(); if (c && (await Net.tryRejoin(c))) return; toast(t('noRoom')); $('resume-card').style.display = 'none';
    };
    $('btn-start-game').onclick = () => Net.startOnline();
    $('btn-leave-waiting').onclick = askLeave;
    $('btn-leave-game').onclick = askLeave;
    $('btn-rules').onclick = helpModal;
    $('btn-3d').onclick = () => { if (!U.d3 && !U.can3d) { toast(no3dReason()); return; } try { localStorage.setItem('rou_3d', U.d3 ? '0' : '1'); } catch (e) {} location.reload(); };
    document.querySelectorAll('#cam-bar button').forEach(b => { b.onclick = () => { const c = b.dataset.cam; U.cam = c === 'side' ? 'side' : 'pov'; if (c !== 'side') U.camSeat = +c; Snd.play('click'); if (U.view) renderGame(U.view); }; });
    $('btn-music').onclick = () => { Snd.musicToggle(); applyLang(); };
    $('btn-sound').onclick = () => { Snd.toggle(); applyLang(); if (U.view) tension(U.view); };
    $('btn-opp').onclick = () => doFire('opp'); $('btn-self').onclick = () => doFire('self');
    $('room-code-box').onclick = () => { const c = Net.code(); if (!c || Net.mode() !== 'online') return; const url = Net.roomLink(c); (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => toast(t('copied')), () => toast(url)); };
    document.addEventListener('keydown', e => {
      if ($('modal').firstChild) { if (e.key === 'Escape' && $('m-stay')) closeModal(); return; }
      if (U.screen !== 'game' || /INPUT|SELECT|TEXTAREA/.test((e.target.tagName || ''))) return;
      if (e.key === '1') doFire('opp'); else if (e.key === '2') doFire('self'); else if (e.key === 'Escape') { U.sel = null; if (U.view) renderItems(U.view); }
    });
    $('input-name').addEventListener('change', saveName);
    $('input-room-code').addEventListener('input', e => { e.target.value = e.target.value.toUpperCase(); });
  }


  // ---------------------------------------------------------------- leaving: ask first (skipped when the match is over) ----
  const leaveText = () => t(U.screen === 'game' && U.view && U.view.phase !== 'over' ? 'leaveQPlaying' : 'leaveQWaiting');
  function refreshLeave() { const x = $('m-leave-txt'); if (x) x.textContent = leaveText(); }
  function askLeave() {
    if (U.screen === 'game' && U.view && U.view.phase === 'over') return leaveToLobby();
    if (leaveOpen()) return;
    modal('<h3>' + t('leaveQ') + '</h3><p class="muted center" id="m-leave-txt">' + leaveText() + '</p><button type="button" class="btn btn-block" id="m-stay">' + t('leaveStay') + '</button><button type="button" class="btn btn-secondary btn-block" id="m-leave-yes">' + t('leaveYes') + '</button>');
    const st = $('m-stay'), ye = $('m-leave-yes'); if (st) { st.onclick = closeModal; st.focus(); } if (ye) ye.onclick = leaveToLobby;
  }
  // ---------------------------------------------------------------- table chat (online rooms) ----
  // Messages live in roomChats/<room> (rou-net.js). Every message goes into the chat list; a seated sender's line also pops up over their head (2D bubble / 3D board), like the bot's table talk.
  // While you type, the box suggests lines: the bot's own claims (so you can bluff too) plus a few short chat lines.
  const C = { code: null, seen: new Set(), t0: 0, sugKey: '', sug: [], last: 0 };
  const plain = x => String(x).toLowerCase().replace(/đ/g, 'd').normalize('NFD').replace(/[̀-ͯ]/g, '');
  function chatReset() { C.code = Net.code(); C.seen = new Set(); C.t0 = Date.now(); $('chat-log').innerHTML = ''; }
  function chatSync() { const on = Net.mode() === 'online'; document.body.classList.toggle('has-chat', on); if (!on) C.code = null; else if (C.code !== Net.code()) chatReset(); }
  function onChatMsg(m, key) {
    if (C.code !== Net.code()) chatReset(); if (C.seen.has(key)) return; C.seen.add(key);
    const si = m.k === 's1' ? 1 : m.k === 's0' ? 0 : -1, col = si >= 0 ? SEATCOL[si] : '#a9ccd3', text = String(m.x).slice(0, 120);
    const log = $('chat-log'), stick = log.scrollHeight - log.scrollTop - log.clientHeight < 40, el = document.createElement('div');
    el.className = 'chat-line' + (m.u === Net.MY_UID ? ' mine' : ''); el.innerHTML = '<b style="color:' + col + '">' + esc(String(m.n || '?').slice(0, 16)) + (m.k ? '' : ' <small>' + t('chatSpec') + '</small>') + '</b> ' + esc(text);
    log.appendChild(el); while (log.children.length > 80) log.firstChild.remove(); if (stick) log.scrollTop = log.scrollHeight;
    if (si >= 0 && U.screen === 'game' && U.view && Date.now() - C.t0 > 1500) {          // history that arrives while joining is not shown as bubbles
      say3(si, text, reduce() ? 3000 : 3500 + text.length * 40); if (m.u !== Net.MY_UID) Snd.play('select');
    }
  }
  function chatSend() { const inp = $('chat-input'), v = inp.value.trim(); if (!v || Date.now() - C.last < 600) return; C.last = Date.now(); inp.value = ''; C.sugKey = ''; Net.chatSend(v); chatSuggest(); }
  function chatSuggest() {
    const g = U.view, box = $('chat-sug'), q = plain($('chat-input').value).replace(/\s+/g, ' ').trim(); if (!g || Net.mode() !== 'online') { box.innerHTML = ''; C.sug = []; return; }
    const key = g.id + ':' + g.seq + ':' + LANG + ':' + q; if (key === C.sugKey) return; C.sugKey = key;
    const pool = [...new Set([...t('talk').L, ...t('talk').B, ...t('chatSug')])], words = q.split(' ').filter(Boolean);
    const res = words.length ? pool.filter(x => { const p = plain(x); return p !== q && words.every(w => p.includes(w)); }).sort((a, b) => plain(a).indexOf(words[0]) - plain(b).indexOf(words[0])) : pool.sort(() => Math.random() - .5);
    C.sug = res.slice(0, 4); box.innerHTML = C.sug.map((x, k) => '<button type="button" data-k="' + k + '">' + esc(x) + '</button>').join('');
  }
  function wireChat() {
    const inp = $('chat-input'), box = $('chat'); Net.onChat(onChatMsg);
    $('chat-form').onsubmit = e => { e.preventDefault(); chatSend(); };
    inp.addEventListener('input', chatSuggest);
    inp.addEventListener('focus', () => { box.classList.add('typing'); chatSuggest(); });
    inp.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== inp) box.classList.remove('typing'); }, 250));      // the delay lets a tap on a suggestion land first
    inp.addEventListener('keydown', e => { if (e.key === 'Tab' && !e.shiftKey && C.sug.length) { e.preventDefault(); inp.value = C.sug[0]; C.sugKey = ''; chatSuggest(); } else if (e.key === 'Escape') inp.blur(); });
    $('chat-sug').addEventListener('mousedown', e => e.preventDefault());
    $('chat-sug').onclick = e => { const b = e.target.closest('button'); if (!b) return; inp.value = C.sug[+b.dataset.k] || ''; C.sugKey = ''; inp.focus(); chatSuggest(); };
  }

  // ---------------------------------------------------------------- boot ----
  const no3dReason = () => location.protocol === 'file:' ? t('no3dFile') : (!window.R3D ? t('no3dLoad') : t('no3dGL') + (R3D.err() || '?'));
  async function boot() {
    $('bg').innerHTML = Art.scene(); document.body.insertAdjacentHTML('afterbegin', Art.sprite());
    $('lobby-logo').innerHTML = Art.logo();
    $('gun-art').innerHTML = Art.drumFrame() + Art.BARREL; $('flash').innerHTML = Art.FLASH;
    $('hub').innerHTML = '<polygon points="180,184 191.3,188.7 196,200 191.3,211.3 180,216 168.7,211.3 164,200 168.7,188.7" fill="#e0b04a"/><polygon points="180,184 191.3,188.7 196,200 180,200" fill="rgba(255,255,255,.3)"/>';
    try { U.off = Rou.normSettings(JSON.parse(localStorage.getItem('rou_rules') || 'null')); } catch (e) { U.off = Rou.normSettings(); }
    try { $('input-name').value = localStorage.getItem('rou_name') || ''; } catch (e) {}
    try { U.d3 = localStorage.getItem('rou_3d') !== '0' && !!window.R3D && R3D.init($('r3d-wrap')); } catch (e) { U.d3 = false; }
    U.can3d = !!window.R3D && (U.d3 || R3D.init($('r3d-wrap')));
    if (U.d3) { R3D.onPick(onPick3); R3D.onHover(id => { U.hov = id; if (U.view) renderInfo(U.view); }); }
    $('items').addEventListener('mouseover', e => { const it = e.target.closest && e.target.closest('.item'); const id = it ? +it.dataset.id : null; if (id !== U.hov) { U.hov = id; if (U.view) renderInfo(U.view); } });
    $('items').addEventListener('mouseleave', () => { if (U.hov != null) { U.hov = null; if (U.view) renderInfo(U.view); } });
    Fx.init(); Net.onChange(onRoom); wire(); wireChat(); Snd.probe(); renderLobbyTabs();
    // a shared link is <page>?room=CODE (an old #CODE link still works): open the join tab with the code filled in; if I already sit/watch there the table comes back
    let linkCode = ''; try { linkCode = (new URL(location.href).searchParams.get('room') || (location.hash || '').replace('#', '')).toUpperCase(); } catch (e) {}
    if (!/^[A-Z0-9]{5}$/.test(linkCode)) linkCode = '';
    if (linkCode) { U.tab = 'join'; $('input-room-code').value = linkCode; renderLobbyTabs(); }
    let back = false;
    try {
      const c = linkCode || Net.lastRoom();
      if (c && Net.ONLINE_OK) back = !!(await Promise.race([Net.tryRejoin(c, !!linkCode), sleep(4000)]));
    } catch (e) {}
    if (!back && Net.hasLocal()) back = Net.restoreLocal();
    if (!back) showLobby();
  }
  window.addEventListener('DOMContentLoaded', boot);
})();
