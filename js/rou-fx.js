// rou-fx.js — one small canvas for particles (blood drops, splats, drips, smoke, sparks, confetti).
// Cheap on purpose: flat polygons only (no blur / shadows), hard cap on live particles, the loop only runs while something is alive, DPR capped at 1.5,
// and nothing is drawn at all with prefers-reduced-motion.
const Fx = (function () {
  'use strict';
  let cv, ctx, W = 0, H = 0, dpr = 1, parts = [], raf = 0, last = 0;
  const CAP = 90, rnd = (a, b) => a + Math.random() * (b - a);
  const reduce = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  function init() {
    cv = document.createElement('canvas'); cv.id = 'fx-canvas'; document.body.appendChild(cv); ctx = cv.getContext('2d'); resize(); addEventListener('resize', resize);
  }
  function resize() { dpr = Math.min(window.devicePixelRatio || 1, 1.5); W = innerWidth; H = innerHeight; cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px'; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
  function add(p) { parts.push(p); if (parts.length > CAP) parts.splice(0, parts.length - CAP); if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); } }
  const center = el => { if (!el) return { x: W / 2, y: H / 2 }; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };

  const BLOOD = ['#d81f3f', '#ff4d6d', '#a3122c'];
  function blood(el) {
    if (reduce() || !cv) return; const c = center(el);
    for (let i = 0; i < 20; i++) { const a = rnd(0, 6.283), sp = rnd(120, 340); add({ k: 'd', x: c.x, y: c.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 140, t: 0, max: rnd(650, 1150), s: rnd(2.5, 6), c: BLOOD[i % 3] }); }
    for (let i = 0; i < 3; i++) { const pts = []; for (let j = 0; j < 8; j++) pts.push(rnd(.55, 1)); add({ k: 's', x: c.x + rnd(-34, 34), y: c.y + rnd(-22, 26), t: 0, max: 1700, s: rnd(14, 30), pts, c: BLOOD[i % 3] }); }
    for (let i = 0; i < 3; i++) add({ k: 'v', x: c.x + rnd(-26, 26), y: c.y + 8, t: 0, max: 1500, len: rnd(26, 60), c: '#a3122c' });
  }
  function spark(el, col) { if (reduce() || !cv) return; const c = center(el); for (let i = 0; i < 14; i++) { const a = rnd(0, 6.283), sp = rnd(80, 220); add({ k: 'q', x: c.x, y: c.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0, max: rnd(400, 700), s: rnd(2, 4.5), c: col || '#6cc4f5' }); } }
  function smoke(el) { if (reduce() || !cv) return; const c = center(el); for (let i = 0; i < 7; i++) add({ k: 'm', x: c.x + rnd(-14, 14), y: c.y + rnd(-10, 10), vx: rnd(-18, 18), vy: rnd(-60, -25), t: 0, max: rnd(800, 1200), s: rnd(8, 16) }); }
  function heal(el) { if (reduce() || !cv) return; const c = center(el); for (let i = 0; i < 10; i++) add({ k: 'q', x: c.x + rnd(-30, 30), y: c.y + rnd(-6, 10), vx: rnd(-20, 20), vy: rnd(-90, -40), t: 0, max: rnd(700, 1000), s: rnd(3, 5), c: i % 2 ? '#7bd88f' : '#ff8fc0', g: -1 }); }
  function confetti() { if (reduce() || !cv) return; const C = ['#ff6a4d', '#5eead4', '#ffb547', '#6cc4f5', '#f6f0e2']; for (let i = 0; i < 44; i++) add({ k: 'f', x: rnd(0, W), y: rnd(-40, 0), vx: rnd(-40, 40), vy: rnd(120, 260), t: 0, max: rnd(1800, 2800), s: rnd(4, 8), r: rnd(0, 6), vr: rnd(-6, 6), c: C[i % 5] }); }

  function poly(pts, c, a) { ctx.globalAlpha = a; ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]); ctx.closePath(); ctx.fill(); }
  function tick(now) {
    const dt = Math.min(.05, (now - last) / 1000); last = now; ctx.clearRect(0, 0, W, H);
    parts = parts.filter(p => { p.t += dt * 1000; return p.t < p.max; });
    for (const p of parts) {
      const u = p.t / p.max, fade = u < .6 ? 1 : 1 - (u - .6) / .4;
      switch (p.k) {
        case 'd': p.vy += 900 * dt; p.x += p.vx * dt; p.y += p.vy * dt; { const a = Math.atan2(p.vy, p.vx), ca = Math.cos(a), sa = Math.sin(a), l = p.s * 1.9, w = p.s * .7;
          poly([p.x + ca * l, p.y + sa * l, p.x - sa * w, p.y + ca * w, p.x - ca * l * .6, p.y - sa * l * .6, p.x + sa * w, p.y - ca * w], p.c, fade); } break;
        case 's': { const sc = Math.min(1, p.t / 120) * .6 + .4, n = p.pts.length, pts = []; for (let i = 0; i < n; i++) { const a = i / n * 6.283; pts.push(p.x + Math.cos(a) * p.s * p.pts[i] * sc, p.y + Math.sin(a) * p.s * p.pts[i] * sc * .8); } poly(pts, p.c, .85 * fade); } break;
        case 'v': { const l = Math.min(p.len, p.t * .06); poly([p.x - 2, p.y, p.x + 2, p.y, p.x + 2, p.y + l, p.x, p.y + l + 4, p.x - 2, p.y + l], p.c, .9 * fade); } break;
        case 'q': p.vy += (p.g || 300) * dt; p.x += p.vx * dt; p.y += p.vy * dt; poly([p.x, p.y - p.s, p.x + p.s, p.y, p.x, p.y + p.s, p.x - p.s, p.y], p.c, fade); break;
        case 'm': p.x += p.vx * dt; p.y += p.vy * dt; { const s = p.s * (1 + u); poly([p.x - s, p.y, p.x - s * .5, p.y - s * .9, p.x + s * .5, p.y - s * .9, p.x + s, p.y, p.x + s * .5, p.y + s * .9, p.x - s * .5, p.y + s * .9], '#c9d6da', .45 * (1 - u)); } break;
        case 'f': p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt; { const ca = Math.cos(p.r) * p.s, sa = Math.sin(p.r) * p.s; poly([p.x - ca, p.y - sa, p.x + sa, p.y - ca, p.x + ca, p.y + sa, p.x - sa, p.y + ca], p.c, fade); } break;
      }
    }
    ctx.globalAlpha = 1;
    if (parts.length && !document.hidden) raf = requestAnimationFrame(tick); else { raf = 0; parts = []; ctx.clearRect(0, 0, W, H); }
  }
  return { init, blood, spark, smoke, heal, confetti };
})();
