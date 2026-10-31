// rou-net.js — room storage + room-level actions. Two backends behind one interface:
//   online : Firebase Realtime Database, room at rooms/roulette_<CODE>
//   local  : in-memory (you vs the Barkeep bot), mirrored into localStorage so a refresh restores it
// The game state is stored as ONE JSON string (room.gs): Firebase drops empty arrays/nulls, a string keeps the state exactly as the engine made it.
// Every write is a pure function room -> room run inside a transaction online, so two clients can't clobber each other.
const Net = (function () {
  const MY_UID = (function () {
    try { let id = localStorage.getItem('rou_uid'); if (!id) { id = 'u_' + Math.random().toString(36).slice(2, 10); localStorage.setItem('rou_uid', id); } return id; }
    catch (e) { return 'u_' + Math.random().toString(36).slice(2, 10); }
  })();
  const ONLINE_OK = typeof db !== 'undefined' && db !== null;
  const S = { mode: null, code: null, room: null, onChange: null, ref: null, connRef: null, gKey: null, g: null };
  const keyOf = c => 'roulette_' + c;
  const codeGen = () => { const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < 5; i++) s += c[Math.floor(Math.random() * c.length)]; return s; };
  const LOCAL_KEY = 'rou_local_room', LAST_KEY = 'rou_last_room', TTL = 12 * 36e5;

  function normalize(r) { if (!r) return r; r.seats = r.seats || {}; r.settings = Rou.normSettings(r.settings); return r; }
  function getG(room) {
    room = room || S.room; if (!room || !room.gs) return null;
    if (room.gs !== S.gKey) { try { S.g = JSON.parse(room.gs); S.gKey = room.gs; } catch (e) { return null; } }
    return S.g;
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
  function emit(prev) { saveLocal(); if (S.onChange) S.onChange(S.room, prev); }

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
        return out ? out : undefined;
      }, undefined, false);
      return !!(res && res.committed);
    }
    return false;
  }

  function attach(code) {
    S.mode = 'online'; S.code = code; S.ref = db.ref('rooms/' + keyOf(code)); rememberRoom(code);
    S.ref.on('value', snap => { const prev = S.room, v = snap.val(); S.room = v ? normalize(v) : null; emit(prev); });
    S.connRef = db.ref('.info/connected');
    S.connRef.on('value', snap => { if (snap.val() === true && S.room) armPresence(); });
  }
  function mySeat(room) {
    room = room || S.room; if (!room) return null;
    if (S.mode === 'local') return 's0';
    return ['s0', 's1'].find(k => room.seats[k] && room.seats[k].uid === MY_UID) || null;
  }
  function armPresence() {
    const k = mySeat(); if (!k || S.mode !== 'online') return;
    const r = S.ref.child('seats/' + k);
    r.child('connected').onDisconnect().set(false); r.child('connected').set(true);
  }
  function detach() {
    if (S.ref) { S.ref.off(); S.ref = null; }
    if (S.connRef) { S.connRef.off(); S.connRef = null; }
    if (S.mode === 'local') clearLocal();
    S.mode = null; S.code = null; S.room = null; S.g = null; S.gKey = null;
  }

  const baseRoom = host => ({ game: 'roulette', hostUid: host, status: 'lobby', settings: Object.assign({}, Rou.DEFAULTS), seats: {}, gs: '', createdAt: Date.now() });
  const botName = () => t('bot');

  async function createOnline(name) {
    if (!ONLINE_OK) throw new Error('offline');
    const code = codeGen(), room = baseRoom(MY_UID);
    room.seats.s0 = { uid: MY_UID, name, connected: true };
    await db.ref('rooms/' + keyOf(code)).set(room);
    attach(code); return code;
  }
  async function joinOnline(code, name) {
    if (!ONLINE_OK) throw new Error('offline');
    code = code.toUpperCase().trim();
    const snap = await db.ref('rooms/' + keyOf(code)).get();
    if (!snap.exists()) return { ok: false, reason: 'noRoom' };
    attach(code);
    await new Promise(res => { const t0 = Date.now(); (function w() { if (S.room || Date.now() - t0 > 4000) res(); else setTimeout(w, 30); })(); });
    if (!S.room) { detach(); return { ok: false, reason: 'noRoom' }; }
    if (mySeat()) return { ok: true, resumed: true };
    if (S.room.status !== 'lobby') { detach(); return { ok: false, reason: 'started' }; }
    const ok = await mutate(r => {
      if (r.status !== 'lobby') return undefined;
      if (['s0', 's1'].some(k => r.seats[k] && r.seats[k].uid === MY_UID)) return r;
      const k = ['s0', 's1'].find(x => !r.seats[x]); if (!k) return undefined;
      r.seats[k] = { uid: MY_UID, name, connected: true }; return r;
    });
    if (!ok) { detach(); return { ok: false, reason: 'roomFull' }; }
    return { ok: true };
  }
  async function tryRejoin(code) {
    if (!ONLINE_OK || !code) return null;
    code = code.toUpperCase();
    const snap = await db.ref('rooms/' + keyOf(code)).get();
    if (!snap.exists()) return null;
    const r = normalize(snap.val());
    if (['s0', 's1'].some(k => r.seats[k] && r.seats[k].uid === MY_UID)) { attach(code); return code; }
    return null;
  }

  function startLocal(name, settings) {
    S.mode = 'local'; S.code = 'LOCAL'; rememberRoom(null);
    const room = baseRoom('local'); room.settings = Rou.normSettings(settings);
    room.seats.s0 = { uid: 'local', name, local: true, connected: true };
    room.seats.s1 = { uid: 'bot', name: botName(), bot: true, connected: true };
    room.status = 'play'; room.gs = JSON.stringify(Rou.newGame([name, botName()], room.settings));
    S.room = normalize(room); emit(null); return 'LOCAL';
  }
  const isHost = room => S.mode === 'local' || (!!room && room.hostUid === MY_UID);

  const setSetting = (k, v) => mutate(r => { if (r.status !== 'lobby') return undefined; r.settings[k] = v; r.settings = Rou.normSettings(r.settings); return r; });
  const startOnline = () => mutate(r => {
    if (r.status !== 'lobby' || !r.seats.s0 || !r.seats.s1 || r.hostUid !== MY_UID) return undefined;
    r.status = 'play'; r.gs = JSON.stringify(Rou.newGame([r.seats.s0.name, r.seats.s1.name], r.settings)); return r;
  });
  // one action by me; the engine decides if it is legal. Returns true if applied.
  const act = a => mutate(r => {
    if (r.status !== 'play' || !r.gs) return undefined;
    const seat = S.mode === 'local' ? (a._seat != null ? a._seat : 0) : (r.seats.s0 && r.seats.s0.uid === MY_UID ? 0 : 1);
    const g = JSON.parse(r.gs); const ac = Object.assign({}, a); delete ac._seat;
    if (!Rou.apply(g, seat, ac)) return undefined;
    r.gs = JSON.stringify(g); return r;
  });
  const botAct = a => { a._seat = 1; return act(a); };
  const rematch = () => mutate(r => {
    if (r.status !== 'play' || (S.mode === 'online' && r.hostUid !== MY_UID)) return undefined;
    r.gs = JSON.stringify(Rou.newGame([r.seats.s0.name, r.seats.s1.name], r.settings)); return r;
  });
  function emote(kind) { if (S.mode === 'online' && S.ref && mySeat()) S.ref.child('emote').set({ s: mySeat() === 's1' ? 1 : 0, k: kind, ts: Date.now() + Math.random() }).catch(() => {}); }
  function leave() {
    if (S.mode === 'online' && S.room) {
      const k = mySeat();
      return mutate(r => {
        if (r.status === 'lobby' && k) { delete r.seats[k]; const other = ['s0', 's1'].find(x => r.seats[x]); if (r.hostUid === MY_UID && other) r.hostUid = r.seats[other].uid; return r; }
        if (k) r.seats[k].connected = false; return r;
      }).catch(() => {}).then(() => { rememberRoom(null); detach(); });
    }
    rememberRoom(null); detach(); return Promise.resolve();
  }

  return {
    MY_UID, ONLINE_OK, S, getG, mySeat, isHost, createOnline, joinOnline, tryRejoin, startLocal, restoreLocal, hasLocal, lastRoom, setSetting, startOnline, emote, act, botAct, rematch, leave,
    room: () => S.room, mode: () => S.mode, code: () => S.code, onChange: f => { S.onChange = f; }
  };
})();
