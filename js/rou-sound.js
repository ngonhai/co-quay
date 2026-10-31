// rou-sound.js — tiny WebAudio synth, no files needed. Drop a file in /sounds/ named <key>.mp3|wav|ogg to override a key (see sounds/README.txt).
// playSound('key') never throws: blocked autoplay / no WebAudio just does nothing.
const Snd = (function () {
  'use strict';
  let ctx = null, muted = false, master = null; const files = {};
  try { muted = localStorage.getItem('rou_mute') === '1'; } catch (e) {}
  const SYN = {
    click: [{ f: 520, f2: 760, d: .06, t: 'triangle', v: .45 }],
    select: [{ f: 440, f2: 620, d: .07, t: 'triangle', v: .4 }],
    error: [{ f: 200, f2: 150, d: .15, t: 'square', v: .25 }],
    aim: [{ n: 1, d: .1, v: .3, lp: 1800 }, { f: 90, f2: 70, d: .3, t: 'sine', v: .5 }],
    live: [{ n: 1, d: .6, v: 1, lp: 2200 }, { f: 130, f2: 30, d: .55, t: 'sawtooth', v: .8 }, { f: 60, f2: 30, d: .6, t: 'sine', v: .9 }],
    blank: [{ n: 1, d: .03, v: .6, lp: 5000 }, { f: 1600, f2: 900, d: .04, t: 'square', v: .25, at: .01 }, { n: 1, d: .25, v: .12, lp: 900, at: .05 }],
    hurt: [{ f: 300, f2: 110, d: .5, t: 'sawtooth', v: .4 }],
    spin: [0, .05, .1, .15, .2, .26, .33, .41, .5].map(a => ({ n: 1, d: .03, v: .35, lp: 4200, at: a })).concat([{ f: 300, f2: 900, d: .55, t: 'sine', v: .12 }]),
    load: [0, .09, .18, .27].map((a, i) => ({ f: 700 + i * 60, f2: 400, d: .05, t: 'square', v: .3, at: a })),
    item: [{ f: 660, d: .08, t: 'triangle', v: .45 }, { f: 880, d: .12, t: 'triangle', v: .4, at: .08 }],
    peek: [{ f: 1000, f2: 1500, d: .35, t: 'sine', v: .25 }, { f: 1500, f2: 2000, d: .35, t: 'sine', v: .15, at: .05 }],
    heal: [{ f: 520, d: .1, t: 'sine', v: .5 }, { f: 660, d: .1, t: 'sine', v: .5, at: .1 }, { f: 784, d: .2, t: 'sine', v: .5, at: .2 }],
    shield: [{ f: 300, f2: 500, d: .15, t: 'triangle', v: .5 }, { n: 1, d: .08, v: .4, lp: 3000, at: .12 }],
    bell: [{ f: 1320, d: .9, t: 'sine', v: .4 }, { f: 1980, d: .6, t: 'sine', v: .2 }],
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
  function stepAt(c, s, t) {
    const T = B.tension, d = B.bus;
    const n = BASS[s]; if (n !== null) tone(c, 55 * Math.pow(2, n / 12), 'sawtooth', t, .55, .5, 220 + T * 260, d);
    if (s === 0 || s === 16) tone(c, 60, 'sine', t, .5, .55, 200, d);                                   // slow low thump
    if (T > .25 && (s === 0 || s === 3 || s === 16 || s === 19)) tone(c, 48, 'sine', t, .22, .35 + T * .3, 160, d);   // heartbeat lub-dub
    if (s % 2 === 1 && T > .15) hit(c, t, .035, .03 + T * .1, 6500, d);                                  // hats
    if (T > .6 && s % 2 === 0) hit(c, t, .03, .05, 7500, d);
    if (s % 4 === 2) tone(c, 1500, 'square', t, .03, .022 + T * .03, 2600, d);                          // wall-clock tick
    if (s === 0 && B.loop % 4 === 3 && Math.random() < .6) { tone(c, 466, 'sine', t, 3.4, .05, 1200, d); tone(c, 440, 'sine', t, 3.4, .05, 1200, d); }   // minor-second unease
  }
  function sched() {
    const c = ctx; if (!c || !B.bus) return;
    B.tension += (B.target - B.tension) * .08; if (B.lp) B.lp.frequency.setTargetAtTime(170 + B.tension * 240, c.currentTime, .4);
    const dur = 60 / (62 + B.tension * 34) / 2;
    while (B.next < c.currentTime + .35) { stepAt(c, B.step, B.next); B.next += dur; B.step = (B.step + 1) % 32; if (B.step === 0) B.loop++; }
  }
  function musicStart() {
    if (!B.on || B.timer) return; const c = ac(); if (!c) return;
    B.bus = c.createGain(); B.bus.gain.value = .0001; B.bus.connect(master); B.bus.gain.setTargetAtTime(.5, c.currentTime, 1.2);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 180; lp.connect(B.bus); B.lp = lp;
    B.nodes = [[55, 'sawtooth', .07], [55.4, 'sawtooth', .07], [27.5, 'sine', .22], [110.3, 'triangle', .04]].map(a => { const o = c.createOscillator(), g = c.createGain(); o.type = a[1]; o.frequency.value = a[0]; g.gain.value = a[2]; o.connect(g); g.connect(lp); o.start(); return o; });
    const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = .08; lg.gain.value = 50; lfo.connect(lg); lg.connect(lp.frequency); lfo.start(); B.nodes.push(lfo);
    B.next = c.currentTime + .15; B.step = 0; B.timer = setInterval(sched, 100);
  }
  function musicStop() {
    clearInterval(B.timer); B.timer = null;
    if (ctx && B.bus) { const bus = B.bus, nodes = B.nodes; bus.gain.setTargetAtTime(.0001, ctx.currentTime, .15); setTimeout(() => { nodes.forEach(o => { try { o.stop(); } catch (e) {} }); try { bus.disconnect(); } catch (e) {} }, 700); }
    B.bus = null; B.nodes = [];
  }
  function duck(ms) { if (!ctx || !B.bus) return; const t = ctx.currentTime; B.bus.gain.cancelScheduledValues(t); B.bus.gain.setTargetAtTime(.12, t, .05); B.bus.gain.setTargetAtTime(.5, t + (ms || 1200) / 1000, .5); }
  function musicToggle() { B.on = !B.on; try { localStorage.setItem('rou_music', B.on ? '1' : '0'); } catch (e) {} if (B.on) musicStart(); else musicStop(); return B.on; }
  let hb = null;
  function heart(on, ms) { clearInterval(hb); hb = null; if (on) hb = setInterval(() => play('beat'), ms || 1300); }
  return { musicStart, musicStop, musicToggle, duck, musicOn: () => B.on, setTension: v => { B.target = Math.max(0, Math.min(1, v)); }, play, probe, heart, unlock: ac, isMuted: () => muted, toggle() { muted = !muted; try { localStorage.setItem('rou_mute', muted ? '1' : '0'); } catch (e) {} if (muted) heart(false); return muted; } };
})();
const playSound = k => Snd.play(k);
