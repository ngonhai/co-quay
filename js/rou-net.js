// rou-net.js — room storage + room-level actions. Two backends behind one interface:
//   online : Firebase Realtime Database, room at rooms/roulette_<CODE>
//   local  : in-memory (you vs the bot), mirrored into localStorage so a refresh restores it
// The game state is stored as ONE JSON string (room.gs): Firebase drops empty arrays/nulls, a string keeps the state exactly as the engine made it.
// Every write is a pure function room -> room run inside a transaction online, so two clients can't clobber each other.
// SEALED ROOMS (room.secure, needs Firebase anonymous sign-in + database.rules.json): the room only carries the PUBLIC state (Rou.pub: no shell kinds, no seed, no peeks).
//   secure/<room>/sec        the full state, readable by the host only (the host's browser is the table's referee)
//   secure/<room>/priv/<uid> what that player alone knows (their own peeks), readable by that player only
//   secure/<room>/acts/<uid> a player's move waiting for the host (fire / item / next), writable by that player only
// TABLE CHAT (online only): roomChats/<room>/<time-ordered key> = { u: uid, k: seat key ('' = spectator), n: name, x: text, ts }; the path is open in database.rules.json.
// Without sign-in or without the published rules rooms stay open (the old behaviour: the whole state, shells included, is in the room).
// With two players the referee IS one of them: the host's browser can see the cylinder. Sealing protects the guest's browser (and spectators), not the host's.
const Net = (function () {
  let MY_UID = (function () {
    try { let id = localStorage.getItem('rou_uid'); if (!id) { id = 'u_' + Math.random().toString(36).slice(2, 10); localStorage.setItem('rou_uid', id); } return id; }
    catch (e) { return 'u_' + Math.random().toString(36).slice(2, 10); }
  })();
  const ONLINE_OK = typeof db !== 'undefined' && db !== null;
  let AUTH_OK = false;         // MY_UID is replaced by the Firebase anonymous uid, which is what the database rules see as auth.uid
  const ready = (async function () {
    try { if (typeof auth === 'undefined' || !auth) return; const u = (await new Promise(r => { const off = auth.onAuthStateChanged(x => { off(); r(x); }); })) || (await auth.signInAnonymously()).user; MY_UID = u.uid; AUTH_OK = true; }
    catch (e) { console.warn('Anonymous sign-in failed (enable Authentication > Anonymous in Firebase): rooms are not cheat-proof.', e); }
  })();
  const S = { mode: null, code: null, room: null, onChange: null, ref: null, connRef: null, gKey: null, g: null, pubG: null, priv: null, full: null, offs: [], waiters: [], why: '' };
  const SEATK = ['s0', 's1'], seatIdx = k => k === 's1' ? 1 : 0;
  const freeChar = (r, want) => { const used = new Set(SEATK.filter(k => r.seats[k] && r.seats[k].char).map(k => r.seats[k].char)); if (want && Rou.CHARS.includes(want) && !used.has(want)) return want; const f = Rou.CHARS.filter(c => !used.has(c)); return f[Math.floor(Math.random() * f.length)] || Rou.CHARS[0]; };
  const keyOf = c => 'roulette_' + c;
  const codeGen = () => { const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < 5; i++) s += c[Math.floor(Math.random() * c.length)]; return s; };
  const LOCAL_KEY = 'rou_local_room', LAST_KEY = 'rou_last_room', TTL = 12 * 36e5, ROOM_TTL = 24 * 36e5;   // ROOM_TTL: a room nobody has written to for 24 h is gone (its code works no more and can be handed out again)

  function normalize(r) { if (!r) return r; if (r.sign == null) r.sign = Math.floor(Math.random() * 1000); r.seats = r.seats || {}; r.specs = r.specs || {}; r.settings = Rou.normSettings(r.settings); return r; }
  // the state the UI works with. Local / open rooms: the whole state. Sealed rooms: the public state with MY peeks put back (null until they have arrived with this very state).
  function getG(room) {
    room = room || S.room; if (!room || !room.gs) return null;
    if (room.gs !== S.gKey) { try { S.pubG = JSON.parse(room.gs); S.gKey = room.gs; S.g = null; } catch (e) { return null; } }
    if (!room.secure || S.mode !== 'online') return S.pubG;
    const g = S.pubG, key = mySeatOf(room); if (!key) return S.g || (S.g = Rou.merge(g, null, 0));        // a spectator sees the public table only
    const i = seatIdx(key), src = room.hostUid === MY_UID ? (S.full && S.full.id === g.id && S.full.seq === g.seq ? Rou.mine(S.full, i) : null) : (S.priv && S.priv.id === g.id && S.priv.seq === g.seq ? S.priv : null);
    if (!src) return null;
    return S.g || (S.g = Rou.merge(g, src, i));
  }
  function saveLocal() { try { if (S.mode === 'local' && S.room) localStorage.setItem(LOCAL_KEY, JSON.stringify({ ts: Date.now(), room: S.room })); } catch (e) {} }
  const clearLocal = () => { try { localStorage.removeItem(LOCAL_KEY); } catch (e) {} };
  const rememberRoom = c => { try { if (c) localStorage.setItem(LAST_KEY, JSON.stringify({ code: c, ts: Date.now() })); else localStorage.removeItem(LAST_KEY); } catch (e) {} };
  const lastRoom = () => { try { const v = JSON.parse(localStorage.getItem(LAST_KEY) || 'null'); return v && Date.now() - v.ts < TTL ? v.code : null; } catch (e) { return null; } };
  function hasLocal() { try { const v = JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null'); return !!(v && v.room && v.room.gs && Date.now() - v.ts < TTL); } catch (e) { return false; } }
  function restoreLocal() {
    try {
      const v = JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null');
      if (!v || !v.room || Date.now() - v.ts > TTL) return false;
      S.mode = 'local'; S.code = 'LOCAL'; S.room = normalize(v.room); emit(null); return true;
    } catch (e) { clearLocal(); return false; }
  }
  function settle() { getG(S.room); const sq = S.pubG ? S.pubG.seq : -1; S.waiters = S.waiters.filter(w => { if (sq > w.base) { clearTimeout(w.t); w.res(true); return false; } return true; }); }
  function emit(prev) { saveLocal(); if (S.waiters.length) settle(); if (S.onChange) S.onChange(S.room, prev); }

  async function mutate(fn) {
    if (S.mode === 'local') {
      const prev = S.room, next = fn(JSON.parse(JSON.stringify(S.room)));
      if (!next) return false;
      S.room = normalize(next); emit(prev); return true;
    }
    if (S.mode === 'online') {
      const res = await S.ref.transaction(cur => {
        if (cur === null) return cur;
        const out = fn(normalize(JSON.parse(JSON.stringify(cur))));
        if (out) out.updatedAt = Date.now();
        return out ? out : undefined;
      }, undefined, false);
      return !!(res && res.committed);
    }
    return false;
  }

  function attach(code) {
    S.mode = 'online'; S.code = code; S.ref = db.ref('rooms/' + keyOf(code)); rememberRoom(code); setUrl(code);
    S.ref.on('value', snap => { const prev = S.room, v = snap.val(); S.room = v ? normalize(v) : null; wireSecure(); emit(prev); });
    S.connRef = db.ref('.info/connected');
    S.connRef.on('value', snap => { if (snap.val() === true && S.room) armPresence(); });
    wireChat(code);
  }
  // the last 60 messages arrive first (oldest first), then every new one; the UI dedupes by key
  function wireChat(code) {
    const base = db.ref('roomChats/' + keyOf(code)), q = base.limitToLast ? base.limitToLast(60) : base; S.chatRef = base; S.offs.push(q);
    q.on('child_added', snap => { const m = snap.val(); if (m && typeof m.x === 'string' && S.onChat) S.onChat(m, snap.key); });
  }
  const CHAT_MAX = 120;
  function chatSend(text) {
    text = String(text || '').replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX); const r = S.room, k = r && mySeat(), me = r && (k ? r.seats[k] : r.specs[MY_UID]);
    if (!text || S.mode !== 'online' || !S.chatRef || !me) return Promise.resolve(false);
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);          // keys sort by time, which is the order the messages are shown in
    return S.chatRef.child(id).set({ u: MY_UID, k: k || '', n: me.name, x: text, ts: Date.now() }).then(() => true, () => false);
  }
  // The address bar always carries the room link (<this page>?room=CODE) while you are in an online room: share it, bookmark it, refresh it.
  function setUrl(code) { try { const u = new URL(location.href); if (code) u.searchParams.set('room', code); else u.searchParams.delete('room'); if (u.hash && /^#[A-Z0-9]{5}$/.test(u.hash)) u.hash = ''; const nu = u.pathname + u.search + u.hash; if (nu !== location.pathname + location.search + location.hash) history.replaceState(null, '', nu); } catch (e) {} }
  const roomLink = code => { try { const u = new URL(location.href); u.search = ''; u.hash = ''; u.searchParams.set('room', code || S.code); return u.href; } catch (e) { return String(code || S.code); } };
  const isStale = r => !!r && Date.now() - (r.updatedAt || r.createdAt || 0) > ROOM_TTL;
  async function purge(code) {       // delete an expired room; the 'secure' part may only go if the published rules know about expiry, so fall back to the public part alone
    const id = keyOf(code); try { await db.ref().update({ ['rooms/' + id]: null, ['secure/' + id]: null, ['roomChats/' + id]: null }); } catch (e) { try { await db.ref('rooms/' + id).remove(); await db.ref('roomChats/' + id).remove(); } catch (e2) {} }
  }
  function mySeat(room) {
    room = room || S.room; if (!room) return null;
    if (S.mode === 'local') return 's0';
    return SEATK.find(k => room.seats[k] && room.seats[k].uid === MY_UID) || null;
  }
  function armPresence() {
    if (S.mode !== 'online') return; const k = mySeat();
    if (!k) { const sp = S.ref.child('specs/' + MY_UID); sp.onDisconnect().remove(); if (S.room && S.room.specs[MY_UID]) return; sp.set({ name: specName(), t: Date.now() }); return; }
    const r = S.ref.child('seats/' + k);
    r.child('connected').onDisconnect().set(false); r.child('connected').set(true);
  }
  function detach() {
    if (S.ref) { S.ref.off(); S.ref = null; }
    if (S.connRef) { S.connRef.off(); S.connRef = null; }
    if (S.mode === 'local') clearLocal();
    S.offs.forEach(r => r.off()); S.offs = []; S.waiters.forEach(w => { clearTimeout(w.t); w.res(false); }); S.waiters = []; S.priv = S.full = S.pubG = null; S.wPriv = S.wActs = S.loading = false; S.chain = null; S.chatRef = null;
    S.mode = null; S.code = null; S.room = null; S.g = null; S.gKey = null; setUrl(null);
  }

  const baseRoom = host => ({ game: 'roulette', hostUid: host, status: 'lobby', settings: Object.assign({}, Rou.DEFAULTS), seats: {}, gs: '', createdAt: Date.now(), updatedAt: Date.now(), sign: Math.floor(Math.random() * 1000), lang: LANG });   // sign = which tavern sign hangs on the wall for the whole life of the room
  // random name from the list that nobody at the table has (humans or bots, case-insensitive); only when the list is used up: 'Bot N'
  const pickBotName = (used, n) => { const low = new Set(used.map(x => String(x).toLowerCase())), pool = (t('botNames') || []).filter(x => !low.has(x.toLowerCase())); return pool.length ? pool[Math.floor(Math.random() * pool.length)] : 'Bot ' + n; };

  const specName = () => { try { return localStorage.getItem('rou_name') || 'Guest'; } catch (e) { return 'Guest'; } };
  const isSpec = room => !!(room && !mySeatOf(room) && room.specs && room.specs[MY_UID]);
  const mySeatOf = room => SEATK.find(k => room.seats[k] && room.seats[k].uid === MY_UID) || null;
  async function createOnline(name, char) {
    if (!ONLINE_OK) throw new Error('offline'); await ready;
    let code = codeGen(); for (let i = 0; ; i++) { const ex = await db.ref('rooms/' + keyOf(code)).get(); if (!ex.exists()) break; if (isStale(ex.val())) { await purge(code); break; } if (i > 8) throw new Error('busy'); code = codeGen(); }
    const room = baseRoom(MY_UID);
    room.seats.s0 = { uid: MY_UID, name, connected: true, char: freeChar(room, char) };
    S.why = AUTH_OK ? '' : 'auth';
    if (AUTH_OK) {      // a sealed room only if sign-in works AND the published rules really keep other people's private data unreadable (with open rules sealing would protect nothing)
      try { await db.ref('secure/' + keyOf(code) + '/host').set(MY_UID); const open = await db.ref('secure/' + keyOf(code) + '/priv/probe').get().then(() => true, () => false); if (open) S.why = 'rules'; else room.secure = true; }
      catch (e) { S.why = 'rules'; }
    }
    await db.ref('roomChats/' + keyOf(code)).remove().catch(() => {});      // a brand new room never inherits old messages
    await db.ref('rooms/' + keyOf(code)).set(room);
    attach(code); return code;
  }
  async function joinOnline(code, name, char) {
    if (!ONLINE_OK) throw new Error('offline'); await ready;
    code = code.toUpperCase().trim();
    const snap = await db.ref('rooms/' + keyOf(code)).get();
    if (!snap.exists()) return { ok: false, reason: 'noRoom' };
    if (isStale(snap.val())) { await purge(code); return { ok: false, reason: 'noRoom' }; }
    attach(code);
    await new Promise(res => { const t0 = Date.now(); (function w() { if (S.room || Date.now() - t0 > 4000) res(); else setTimeout(w, 30); })(); });
    if (!S.room) { detach(); return { ok: false, reason: 'noRoom' }; }
    if (mySeat()) return { ok: true, resumed: true };
    if (S.room.specs[MY_UID]) return { ok: true, spectator: true, resumed: true };
    // a free seat in a lobby is taken; anything else (table full / game running) = spectator standing beside the table
    const ok = await mutate(r => {
      if (mySeatOf(r)) return r;
      if (r.status === 'lobby') { const k = SEATK.find(x => !r.seats[x]); if (k) { r.seats[k] = { uid: MY_UID, name, connected: true, char: freeChar(r, char) }; return r; } }
      r.specs[MY_UID] = { name, t: Date.now() }; return r;
    });
    if (!ok) { detach(); return { ok: false, reason: 'noRoom' }; }
    return { ok: true, spectator: !mySeat() };
  }
  async function tryRejoin(code, seatedOnly) {      // seatedOnly (a shared ?room= link): only take the table back if I already sit / watch there
    if (!ONLINE_OK || !code) return null; await ready;
    code = code.toUpperCase();
    const snap = await db.ref('rooms/' + keyOf(code)).get();
    if (!snap.exists()) return null;
    if (isStale(snap.val())) { await purge(code); return null; }
    const r = normalize(snap.val());
    if (mySeatOf(r) || (r.specs && r.specs[MY_UID]) || (!seatedOnly && r.status === 'play')) { attach(code); return code; }
    return null;
  }

  const seatEntries = r => SEATK.map(k => r.seats[k] || { name: '?', char: undefined });
  function makeGame(r) { const e = seatEntries(r), g = Rou.newGame(e.map(x => x.name), r.settings, null, e.map(x => x.char)); g.sign = r.sign; if (r.lang) g.lang = r.lang; return g; }
  function startLocal(name, settings, char) {
    setUrl(null); S.mode = 'local'; S.code = 'LOCAL'; rememberRoom(null);
    const room = baseRoom('local'); room.settings = Rou.normSettings(settings);
    room.seats.s0 = { uid: 'local', name, local: true, connected: true, char: Rou.CHARS.includes(char) ? char : undefined }; if (!room.seats.s0.char) room.seats.s0.char = freeChar(room);
    room.seats.s1 = { uid: 'bot', name: pickBotName([name], 1), bot: true, connected: true, char: freeChar(room) };
    room.status = 'play'; room.gs = JSON.stringify(makeGame(room));
    S.room = normalize(room); emit(null); return 'LOCAL';
  }
  const isHost = room => S.mode === 'local' || (!!room && room.hostUid === MY_UID);

  const setSetting = (k, v) => mutate(r => { if (r.status !== 'lobby') return undefined; r.settings[k] = v; r.settings = Rou.normSettings(r.settings); return r; });
  const startOpen = () => mutate(r => {
    if (r.status !== 'lobby' || !r.seats.s0 || !r.seats.s1 || r.hostUid !== MY_UID) return undefined;
    r.status = 'play'; r.gs = JSON.stringify(makeGame(r)); return r;
  });
  // lobby: host adds/removes a bot on the free seat; everyone picks their own animal
  const addBot = () => mutate(r => { if (r.status !== 'lobby' || r.hostUid !== MY_UID) return undefined; const k = SEATK.find(x => !r.seats[x]); if (!k) return undefined; const nm = pickBotName(SEATK.filter(x => r.seats[x]).map(x => r.seats[x].name), k[1]); r.seats[k] = { uid: 'bot_' + Math.random().toString(36).slice(2, 7), name: nm, bot: true, connected: true, char: freeChar(r) }; return r; });
  const removeBot = key => mutate(r => { if (r.status !== 'lobby' || r.hostUid !== MY_UID || !r.seats[key] || !r.seats[key].bot) return undefined; delete r.seats[key]; return r; });
  const setChar = c => mutate(r => { const k = S.mode === 'local' ? 's0' : SEATK.find(x => r.seats[x] && r.seats[x].uid === MY_UID); if (!k || r.status !== 'lobby') return undefined; if (SEATK.some(x => x !== k && r.seats[x] && r.seats[x].char === c)) return undefined; r.seats[k].char = c; return r; });
  // one action by me; the engine decides if it is legal. `as` = seat index to act for (the local / hosted bot).
  const actOpen = (a, as) => mutate(r => {
    if (r.status !== 'play' || !r.gs) return undefined;
    const g = JSON.parse(r.gs); let seat;
    if (as != null) { if (S.mode === 'online' && r.hostUid !== MY_UID) return undefined; seat = as; }
    else { const me = S.mode === 'local' ? 's0' : SEATK.find(k => r.seats[k] && r.seats[k].uid === MY_UID); seat = me ? seatIdx(me) : -1; }
    if (seat < 0) return undefined;
    if (!Rou.apply(g, seat, a)) return undefined;
    r.gs = JSON.stringify(g); return r;
  });
  const rematchOpen = () => mutate(r => {
    if (r.status !== 'play' || (S.mode === 'online' && r.hostUid !== MY_UID)) return undefined;
    r.gs = JSON.stringify(makeGame(r)); return r;
  });
  // ---- sealed rooms: the host's browser is the referee ----
  const sref = () => db.ref('secure/' + keyOf(S.code));
  const sealed = () => S.mode === 'online' && !!S.room && !!S.room.secure;
  const amHost = () => !!S.room && S.room.hostUid === MY_UID;
  const authG = () => sealed() && amHost() ? S.full : null;                       // the full state, host only: the hosted bot decides on it
  const run = fn => { const p = (S.chain || Promise.resolve()).then(fn); S.chain = p.catch(() => {}); return p; };           // host work happens one step at a time
  function publish(g) {                // ONE atomic write: the public state, the other human's own knowledge, and the full copy for the host
    const key = keyOf(S.code), u = {}; u['rooms/' + key + '/gs'] = JSON.stringify(Rou.pub(g)); u['rooms/' + key + '/updatedAt'] = Date.now(); u['secure/' + key + '/sec'] = JSON.stringify(g);
    SEATK.forEach((k, i) => { const x = S.room.seats[k]; if (x && !x.bot && x.uid && x.uid !== MY_UID) u['secure/' + key + '/priv/' + x.uid] = JSON.stringify(Rou.mine(g, i)); });
    return db.ref().update(u);
  }
  async function applyNow(seat, a) { const F = S.full; if (!F) return false; const g = JSON.parse(JSON.stringify(F)); if (!Rou.apply(g, seat, a)) return false; S.full = g; await publish(g); return true; }
  function onAct(snap) {               // a player's move arrives in the host's inbox; it only counts if it was made on the current state
    const uid = snap.key, v = snap.val(); if (!v || !v.a) return; snap.ref.remove().catch(() => {});
    run(async () => {
      const r = S.room, F = S.full; if (!r || !F || r.status !== 'play') return false;
      const k = SEATK.find(x => r.seats[x] && r.seats[x].uid === uid), seat = k ? seatIdx(k) : -1;
      if (seat < 0 || v.base !== F.seq || !['fire', 'item', 'next'].includes(v.a.t)) return false; return applyNow(seat, v.a);
    });
  }
  function wireSecure() {
    const r = S.room; if (S.mode !== 'online' || !r || !r.secure || !S.ref) return; const b = sref();
    if (!S.wPriv) { S.wPriv = true; const q = b.child('priv/' + MY_UID); S.offs.push(q); q.on('value', snap => { try { S.priv = snap.val() ? JSON.parse(snap.val()) : null; } catch (e) { S.priv = null; } S.g = null; if (S.room) emit(S.room); }); }
    if (r.hostUid !== MY_UID) return;
    if (!S.wActs) { S.wActs = true; const q = b.child('acts'); S.offs.push(q); q.on('child_added', onAct); q.on('child_changed', onAct); }
    if (r.status === 'play' && !S.full && !S.loading) { S.loading = true; b.child('sec').get().then(sn => { if (sn.val()) S.full = JSON.parse(sn.val()); }).catch(() => {}).then(() => { S.loading = false; if (S.room) emit(S.room); }); }   // the host reloaded the page: take the table back
  }
  async function actSealed(a, as) {
    const r = S.room; if (!r) return false;
    if (amHost()) { const seat = as != null ? as : (mySeatOf(r) ? seatIdx(mySeatOf(r)) : -1); return seat >= 0 ? run(() => applyNow(seat, a)) : false; }
    getG(r); if (as != null || !S.pubG || !['fire', 'item', 'next'].includes(a.t)) return false;
    const msg = { base: S.pubG.seq, a: { t: a.t } }; if (a.at) msg.a.at = a.at; if (a.id != null) msg.a.id = a.id;
    try { await sref().child('acts/' + MY_UID).set(msg); } catch (e) { return false; }
    return new Promise(res => { const w = { base: msg.base, res, t: setTimeout(() => { S.waiters = S.waiters.filter(x => x !== w); res(false); }, 4000) }; S.waiters.push(w); settle(); });      // true as soon as the host has moved the table on
  }
  async function startSealed() {
    const r0 = S.room; if (!r0 || r0.status !== 'lobby' || r0.hostUid !== MY_UID || !r0.seats.s0 || !r0.seats.s1) return false;
    const F = makeGame(r0);
    const ok = await mutate(r => { if (r.status !== 'lobby' || r.hostUid !== MY_UID || !r.seats.s0 || !r.seats.s1) return undefined; r.status = 'play'; r.gs = JSON.stringify(Rou.pub(F)); return r; });
    if (!ok) return false; S.full = F; await run(() => publish(F)); emit(S.room); return true;
  }
  async function rematchSealed() {
    const r = S.room; if (!r || r.status !== 'play' || !amHost()) return false;
    S.full = makeGame(r); await run(() => publish(S.full)); emit(S.room); return true;
  }
  const startOnline = () => sealed() ? startSealed() : startOpen();
  const act = (a, as) => sealed() ? actSealed(a, as) : actOpen(a, as);
  const botAct = a => act(a, 1);
  const rematch = () => sealed() ? rematchSealed() : rematchOpen();
  const protection = () => S.mode !== 'online' ? null : sealed() ? 'on' : (S.why || 'off');          // 'on' | 'auth' (sign-in failed) | 'rules' (rules not published) | 'off' (room made by an older version)
  function emote(kind) { if (S.mode === 'online' && S.ref && mySeat()) S.ref.child('emote').set({ s: seatIdx(mySeat()), k: kind, ts: Date.now() + Math.random() }).catch(() => {}); }
  function leave() {
    if (S.mode === 'online' && S.room) {
      const k = mySeat(), hostLobby = sealed() && amHost() && S.room.status === 'lobby';
      return mutate(r => {
        if (!k) { delete r.specs[MY_UID]; return r; }
        if (r.status === 'lobby' && k) { delete r.seats[k]; const other = SEATK.find(x => r.seats[x] && !r.seats[x].bot); if (r.hostUid === MY_UID && other) r.hostUid = r.seats[other].uid; return r; }
        if (k) r.seats[k].connected = false; return r;
      }).then(async () => { const nh = S.room && S.room.hostUid; if (hostLobby && nh && nh !== MY_UID) await sref().child('host').set(nh); }).catch(() => {}).then(() => { rememberRoom(null); detach(); });
    }
    rememberRoom(null); detach(); return Promise.resolve();
  }

  return {
    get MY_UID() { return MY_UID; }, ONLINE_OK, S, ready, authG, protection, getG, mySeat, isSpec: () => isSpec(S.room), specCount: () => S.room ? Object.keys(S.room.specs || {}).length : 0, isHost, createOnline, joinOnline, tryRejoin, startLocal, addBot, removeBot, setChar, restoreLocal, hasLocal, lastRoom, setSetting, startOnline, emote, chatSend, onChat: f => { S.onChat = f; }, act, botAct, rematch, leave, SEATK, roomLink,
    room: () => S.room, mode: () => S.mode, code: () => S.code, onChange: f => { S.onChange = f; }
  };
})();
