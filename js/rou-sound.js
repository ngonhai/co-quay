// rou-sound.js — tiny WebAudio synth, no files needed. Drop a file in /sounds/ named <key>.mp3|wav|ogg to override a key (see sounds/README.txt).
// playSound('key') never throws: blocked autoplay / no WebAudio just does nothing.
const Snd = (function () {
  'use strict';
  let ctx = null, muted = false, master = null; const files = {};
  try { muted = localStorage.getItem('rou_mute') === '1'; } catch (e) {}
  const SYN = {
    slam: [{ f: 90, f2: 40, d: .28, t: 'sine', v: .9 }, { n: 1, d: .12, v: .6, lp: 1800 }, { f: 180, f2: 90, d: .15, t: 'triangle', v: .4 }],
    card: [{ n: 1, d: .06, v: .45, lp: 3800 }, { f: 280, f2: 170, d: .07, t: 'triangle', v: .25 }],
    flip: [{ n: 1, d: .1, v: .4, lp: 5000 }, { f: 520, f2: 760, d: .08, t: 'triangle', v: .3, at: .06 }],
    liar: [{ f: 240, f2: 90, d: .55, t: 'sawtooth', v: .5 }, { n: 1, d: .18, v: .45, lp: 2500 }, { f: 880, f2: 660, d: .2, t: 'square', v: .18, at: .02 }],
    devil: [{ f: 70, f2: 38, d: 1.1, t: 'sawtooth', v: .7 }, { f: 140, f2: 60, d: .9, t: 'square', v: .3 }, { n: 1, d: .5, v: .4, lp: 1200 }],
    click: [{ f: 520, f2: 760, d: .06, t: 'triangle', v: .45 }],
    select: [{ f: 440, f2: 620, d: .07, t: 'triangle', v: .4 }],
    error: [{ f: 200, f2: 150, d: .15, t: 'square', v: .25 }],
    aim: [{ n: 1, d: .1, v: .3, lp: 1800 }, { f: 90, f2: 70, d: .3, t: 'sine', v: .5 }],
    live: [{ n: 1, d: .05, v: 1, lp: 9000 }, { f: 160, f2: 32, d: .4, t: 'sine', v: 1 }, { n: 1, d: .45, v: .75, lp: 2200, at: .008 }, { f: 420, f2: 60, d: .22, t: 'sawtooth', v: .5 }, { n: 1, d: 1.3, v: .22, lp: 700, at: .07 }, { n: 1, d: .5, v: .12, lp: 3000, at: .12 }],
    blank: [{ n: 1, d: .012, v: .55, lp: 7000 }, { f: 2600, f2: 1900, d: .02, t: 'square', v: .16 }, { f: 140, f2: 90, d: .05, t: 'sine', v: .3 }, { n: 1, d: .018, v: .7, lp: 4500, at: .09 }, { f: 1100, f2: 700, d: .035, t: 'triangle', v: .35, at: .09 }, { f: 3400, f2: 2800, d: .015, t: 'square', v: .1, at: .092 }, { f: 110, f2: 70, d: .08, t: 'sine', v: .4, at: .09 }, { n: 1, d: .12, v: .06, lp: 1500, at: .11 }],
    hurt: [{ f: 300, f2: 110, d: .5, t: 'sawtooth', v: .4 }],
    spin: [0, .05, .1, .15, .2, .26, .33, .41, .5].map(a => ({ n: 1, d: .03, v: .35, lp: 4200, at: a })).concat([{ f: 300, f2: 900, d: .55, t: 'sine', v: .12 }]),
    load: [0, .09, .18, .27].map((a, i) => ({ f: 700 + i * 60, f2: 400, d: .05, t: 'square', v: .3, at: a })),
    item: [{ f: 660, d: .08, t: 'triangle', v: .45 }, { f: 880, d: .12, t: 'triangle', v: .4, at: .08 }],
    peek: [{ f: 1000, f2: 1500, d: .35, t: 'sine', v: .25 }, { f: 1500, f2: 2000, d: .35, t: 'sine', v: .15, at: .05 }],
    heal: [{ f: 520, d: .1, t: 'sine', v: .5 }, { f: 660, d: .1, t: 'sine', v: .5, at: .1 }, { f: 784, d: .2, t: 'sine', v: .5, at: .2 }],
    shield: [{ f: 300, f2: 500, d: .15, t: 'triangle', v: .5 }, { n: 1, d: .08, v: .4, lp: 3000, at: .12 }],
    cuff: [{ f: 2400, d: .05, t: 'square', v: .3 }, { f: 1500, d: .12, t: 'square', v: .25 }, { f: 300, d: .3, t: 'triangle', v: .3 }],
    coin: [{ f: 2400, f2: 3000, d: .08, t: 'sine', v: .3 }, { f: 2600, d: .5, t: 'sine', v: .25, at: .08 }],
    glass: [{ f: 1800, d: .06, t: 'sine', v: .3 }, { n: 1, d: .05, v: .4, lp: 6000 }],
    turn: [{ f: 660, d: .1, t: 'triangle', v: .4 }, { f: 880, d: .16, t: 'triangle', v: .4, at: .1 }],
    beat: [{ f: 70, f2: 45, d: .16, t: 'sine', v: .8 }, { f: 62, f2: 40, d: .18, t: 'sine', v: .6, at: .2 }],
    win: [{ f: 523, d: .12, t: 'triangle', v: .5 }, { f: 659, d: .12, t: 'triangle', v: .5, at: .12 }, { f: 784, d: .12, t: 'triangle', v: .5, at: .24 }, { f: 1047, d: .35, t: 'triangle', v: .5, at: .36 }],
    lose: [{ f: 330, f2: 200, d: .4, t: 'sawtooth', v: .4 }, { f: 220, f2: 110, d: .6, t: 'triangle', v: .4, at: .25 }],
    round: [{ f: 440, d: .1, t: 'square', v: .25 }, { f: 330, d: .2, t: 'square', v: .25, at: .1 }]
  };
  function ac() {
    if (!ctx) { try { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; ctx = new C(); master = ctx.createGain(); master.gain.value = .8; master.connect(ctx.destination); } catch (e) { return null; } }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }
  function noiseBuf(c, d) { const n = Math.max(1, Math.floor(c.sampleRate * d)), b = c.createBuffer(1, n, c.sampleRate), a = b.getChannelData(0); for (let i = 0; i < n; i++) a[i] = Math.random() * 2 - 1; return b; }
  function synth(key) {
    const c = ac(); if (!c || !SYN[key]) return; const t0 = c.currentTime;
    SYN[key].forEach(s => {
      const at = t0 + (s.at || 0), g = c.createGain(); g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(Math.max(.0002, s.v || .4), at + .006); g.gain.exponentialRampToValueAtTime(.0001, at + s.d); g.connect(master);
      let src;
      if (s.n) { src = c.createBufferSource(); src.buffer = noiseBuf(c, s.d + .05); const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = s.lp || 3000; src.connect(f); f.connect(g); }
      else { src = c.createOscillator(); src.type = s.t || 'sine'; src.frequency.setValueAtTime(s.f, at); if (s.f2) src.frequency.exponentialRampToValueAtTime(s.f2, at + s.d); src.connect(g); }
      src.start(at); src.stop(at + s.d + .06);
    });
  }
  function play(key) {
    if (muted) return;
    try {
      const f = files[key];
      if (f && ac()) { const s = ctx.createBufferSource(); s.buffer = f; s.connect(master); s.start(); return; }
      synth(key);
    } catch (e) {}
  }
  // optional real files: loaded once, missing ones silently fall back to the synth
  function probe() {
    Object.keys(SYN).forEach(k => ['mp3', 'wav', 'ogg'].forEach(ext => {
      if (files[k]) return;
      fetch('sounds/' + k + '.' + ext).then(r => (r.ok && /audio|ogg|octet/.test(r.headers.get('content-type') || '')) ? r.arrayBuffer() : null)
        .then(buf => buf && ac() && ctx.decodeAudioData(buf, b => { files[k] = b; }, () => {})).catch(() => {});
    }));
  }

  // ---------------------------------------------------------------- BGM: a slow, low, generated loop (no files) ----
  // A-minor drone + sparse bass line + clock-like ticks. setTension(0..1) speeds it up, opens the filter and adds heartbeat kicks and hats.
  const B = { on: true, timer: null, step: 0, next: 0, loop: 0, tension: 0, target: 0, bus: null, lp: null, nodes: [], noise: null };
  try { B.on = localStorage.getItem('rou_music') !== '0'; } catch (e) {}
  const BASS = [0, null, null, null, 0, null, null, null, 3, null, null, null, 0, null, -2, null, 0, null, null, null, 0, null, null, null, 5, null, null, null, 3, null, 2, null];
  function tone(c, f, type, t, dur, vol, lpf, dest) {
    const o = c.createOscillator(), g = c.createGain(), fl = c.createBiquadFilter(); o.type = type; o.frequency.setValueAtTime(f, t); fl.type = 'lowpass'; fl.frequency.value = lpf || 400;
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + .02); g.gain.exponentialRampToValueAtTime(.0001, t + dur); o.connect(fl); fl.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + .05);
  }
  function hit(c, t, dur, vol, hp, dest) {
    if (!B.noise) { const n = c.sampleRate, b = c.createBuffer(1, n, c.sampleRate), a = b.getChannelData(0); for (let i = 0; i < n; i++) a[i] = Math.random() * 2 - 1; B.noise = b; }
    const src = c.createBufferSource(), g = c.createGain(), f = c.createBiquadFilter(); src.buffer = B.noise; f.type = 'highpass'; f.frequency.value = hp;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur); src.connect(f); f.connect(g); g.connect(dest); src.start(t, Math.random() * .5, dur + .02);
  }
  // Light jazz: swung ii–V–I–VI7 in C (Dm7 G7 Cmaj7 A7), walking bass, soft electric-piano comping, brushed ride, sparse vibes melody.
  // 12 steps per bar (triplet grid), 4 bars. setTension(0..1) only nudges tempo and melody density — it stays easy on the ears.
  const mf = m => 440 * Math.pow(2, (m - 69) / 12);
  const BARS = [
    { bass: [38, 41, 45, 47], chord: [53, 57, 60, 64], mel: [62, 65, 69, 72, 74, 76] },
    { bass: [43, 47, 50, 48], chord: [53, 59, 62, 67], mel: [67, 71, 74, 77, 72, 69] },
    { bass: [36, 40, 43, 45], chord: [52, 55, 59, 64], mel: [64, 67, 71, 72, 74, 76] },
    { bass: [45, 49, 52, 50], chord: [55, 61, 64, 69], mel: [69, 73, 76, 79, 71, 64] }
  ];
  function stepAt(c, s, t) {
    const T = B.tension, d = B.bus, bar = Math.floor(s / 12) % 4, k = s % 12, X = BARS[bar], q = 60 / (92 + T * 18);
    if (k % 3 === 0) { const n = X.bass[k / 3]; tone(c, mf(n), 'triangle', t, q * .95, .5, 700, d); tone(c, mf(n), 'sine', t, q * .9, .3, 500, d); }       // walking bass
    // ride cymbal (swung) + foot hat on 2 and 4
    if (k % 3 === 0) hit(c, t, .09, .03, 5200, d); if (k === 5 || k === 11) hit(c, t, .05, .02, 6200, d); if (k === 3 || k === 9) hit(c, t, .04, .035, 7800, d);
    // comping: a long chord on 1, a short stab on the "and" of 2 and of 4
    if (k === 0 || (k === 5 && (s + B.loop) % 2 === 0) || (k === 8 && bar % 2)) { const dur = k === 0 ? q * 1.6 : q * .6; X.chord.forEach((n, i) => { tone(c, mf(n), 'sine', t + i * .012, dur, .075, 1800, d); tone(c, mf(n) * 2, 'triangle', t + i * .012, dur * .6, .018, 2400, d); }); }
    // vibes melody
    if (k % 3 === 0 && Math.random() < .2 + T * .2) { const n = X.mel[Math.floor(Math.random() * X.mel.length)]; tone(c, mf(n), 'sine', t, q * 1.4, .07, 3000, d); tone(c, mf(n) * 4, 'sine', t, q * .4, .012, 5000, d); }
    if (s === 0 && B.loop % 4 === 3 && Math.random() < .7) tone(c, mf(76), 'sine', t, 2.4, .05, 3000, d);
  }
  function sched() {
    const c = ctx; if (!c || !B.bus) return;
    B.tension += (B.target - B.tension) * .05;
    const dur = 60 / (92 + B.tension * 18) / 3;                       // swing grid: a third of a beat
    while (B.next < c.currentTime + .35) { stepAt(c, B.step, B.next); B.next += dur; B.step = (B.step + 1) % 48; if (B.step === 0) B.loop++; }
  }
  function musicStart() {
    if (!B.on || B.timer) return; const c = ac(); if (!c) return;
    B.bus = c.createGain(); B.bus.gain.value = .0001; B.bus.connect(master); B.bus.gain.setTargetAtTime(.55, c.currentTime, 1.2);
    B.lp = null; B.nodes = []; B.next = c.currentTime + .15; B.step = 0; B.timer = setInterval(sched, 100);
  }
  function musicStop() {
    clearInterval(B.timer); B.timer = null;
    if (ctx && B.bus) { const bus = B.bus, nodes = B.nodes; bus.gain.setTargetAtTime(.0001, ctx.currentTime, .15); setTimeout(() => { nodes.forEach(o => { try { o.stop(); } catch (e) {} }); try { bus.disconnect(); } catch (e) {} }, 700); }
    B.bus = null; B.nodes = [];
  }
  function duck(ms) { if (!ctx || !B.bus) return; const t = ctx.currentTime; B.bus.gain.cancelScheduledValues(t); B.bus.gain.setTargetAtTime(.2, t, .05); B.bus.gain.setTargetAtTime(.5, t + (ms || 1200) / 1000, .5); }
  function musicToggle() { B.on = !B.on; try { localStorage.setItem('rou_music', B.on ? '1' : '0'); } catch (e) {} if (B.on) musicStart(); else musicStop(); return B.on; }

  // "LIAR!!" — a synthesized shout: sawtooth "voice" through three formant filters gliding l-a-i-er, with grit and a gang-shout double.
  function shout(pm) {
    if (muted) return; const c = ac(); if (!c) return; pm = pm || 1; const t0 = c.currentTime + .01, D = .8;
    const out = c.createGain(); out.gain.setValueAtTime(.0001, t0); out.gain.exponentialRampToValueAtTime(.9, t0 + .03); out.gain.setValueAtTime(.9, t0 + .45); out.gain.exponentialRampToValueAtTime(.0001, t0 + D);
    const ws = c.createWaveShaper(), cv = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = i / 128 - 1; cv[i] = Math.tanh(x * 9 + .15); } /* hard clipping = rough, torn voice */ ws.curve = cv; const am = c.createGain(); am.gain.value = .72; const amL = c.createOscillator(), amG = c.createGain(); amL.type = 'sawtooth'; amL.frequency.value = 58 + 10 * pm; amG.gain.value = .38; amL.connect(amG); amG.connect(am.gain); amL.start(t0); amL.stop(t0 + D + .05);   // vocal-fry / growl
    ws.connect(am); am.connect(out); out.connect(master);
    const F = [[[350, 1100], [800, 1250], [350, 2300], [500, 1350]], [[1100, 2400], [1250, 2500], [2300, 3000], [1350, 2400]]];
    const T = [0, .09, .36, .62];
    for (let k = 0; k < 2; k++) {                       // two voices a hair apart = a crowd-ish shout
      const o = c.createOscillator(); o.type = 'sawtooth'; const f0 = (k ? 1.018 : 1) * 128 * pm; o.frequency.setValueAtTime(f0 * 1.2, t0); o.frequency.linearRampToValueAtTime(f0 * 1.3, t0 + .08); o.frequency.setValueAtTime(f0 * 1.3, t0 + .36); o.frequency.linearRampToValueAtTime(f0 * .72, t0 + D);   // Li→  ar↘
      const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 6; lg.gain.value = 9 * pm; lfo.connect(lg); lg.connect(o.frequency); lfo.start(t0); lfo.stop(t0 + D + .05);
      for (let b = 0; b < 3; b++) {
        const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = b ? 9 : 6; const fr = b < 2 ? F[b] : [[2500, 2500], [2600, 2600], [3300, 3300], [2700, 2700]];
        bp.frequency.setValueAtTime(fr[0][b < 2 ? 0 : 0], t0); for (let i = 1; i < 4; i++) bp.frequency.linearRampToValueAtTime(b < 2 ? fr[i][0] : fr[i][0], t0 + T[i]);
        // F1 uses column 0, F2 column 1
        if (b === 1) { bp.frequency.cancelScheduledValues(t0); bp.frequency.setValueAtTime(F[0][0][1], t0); for (let i = 1; i < 4; i++) bp.frequency.linearRampToValueAtTime(F[0][i][1], t0 + T[i]); }
        const g = c.createGain(); g.gain.value = b === 0 ? 1.2 : b === 1 ? .8 : .25; o.connect(bp); bp.connect(g); g.connect(ws);
      }
      o.start(t0); o.stop(t0 + D + .05);
    }
    const nz = c.createBufferSource(), nb = c.createBuffer(1, c.sampleRate * .12, c.sampleRate), d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length); nz.buffer = nb;
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1800; const ng = c.createGain(); ng.gain.value = .25; nz.connect(hp); hp.connect(ng); ng.connect(master); nz.start(t0 + .02);
    // breathy rasp: a band of noise under the whole shout
    const rn = c.createBufferSource(), rb = c.createBuffer(1, Math.ceil(c.sampleRate * D), c.sampleRate), rd = rb.getChannelData(0); for (let i = 0; i < rd.length; i++) rd[i] = Math.random() * 2 - 1; rn.buffer = rb;
    const rf = c.createBiquadFilter(); rf.type = 'bandpass'; rf.frequency.value = 1700; rf.Q.value = .8; const rg = c.createGain(); rg.gain.setValueAtTime(.0001, t0); rg.gain.exponentialRampToValueAtTime(.32, t0 + .05); rg.gain.setValueAtTime(.32, t0 + .45); rg.gain.exponentialRampToValueAtTime(.0001, t0 + D); rn.connect(rf); rf.connect(rg); rg.connect(ws); rn.start(t0);
  }
  let hb = null;
  function heart(on, ms) { clearInterval(hb); hb = null; if (on) hb = setInterval(() => play('beat'), ms || 1300); }
  return { shout, musicStart, musicStop, musicToggle, duck, musicOn: () => B.on, setTension: v => { B.target = Math.max(0, Math.min(1, v)); }, play, probe, heart, unlock: ac, isMuted: () => muted, toggle() { muted = !muted; try { localStorage.setItem('rou_mute', muted ? '1' : '0'); } catch (e) {} if (muted) heart(false); return muted; } };
})();
const playSound = k => Snd.play(k);
