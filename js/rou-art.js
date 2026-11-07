// rou-art.js — every picture is code (flat polygons, same idea as cat-art.js in Mèo Nổ):
// item icons + heart in one hidden SVG sprite, the bar scene behind the game, bartender avatars, the revolver drum.
const Art = (function () {
  'use strict';
  const ng = (cx, cy, r, n, rot) => Array.from({ length: n }, (_, i) => { const a = ((rot || 0) + i * 360 / n - 90) * Math.PI / 180; return (cx + r * Math.cos(a)).toFixed(1) + ',' + (cy + r * Math.sin(a)).toFixed(1); }).join(' ');
  const P = (pts, fill, ex) => '<polygon points="' + pts + '" fill="' + fill + '"' + (ex ? ' ' + ex : '') + '/>';
  const P0 = 0;
  const FILTERS = '<filter id="rough" x="-8%" y="-8%" width="116%" height="116%"><feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="2" seed="4" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="4"/></filter>' +
    '<filter id="scratch" x="-6%" y="-12%" width="112%" height="124%"><feTurbulence type="fractalNoise" baseFrequency="0.012 0.75" numOctaves="2" seed="3" result="s"/><feColorMatrix in="s" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -10 7.1" result="m"/><feComposite in="SourceGraphic" in2="m" operator="in" result="c"/><feTurbulence type="turbulence" baseFrequency="0.05" numOctaves="2" seed="8" result="d"/><feDisplacementMap in="c" in2="d" scale="3"/></filter>';
  const defs = () => '<defs>' + FILTERS + '</defs>';
  const HI = 'rgba(255,255,255,.28)', SH = 'rgba(0,0,0,.18)';

  const ICON = {
    loupe: P(ng(26, 26, 22, 10), '#f0b43c') + P(ng(26, 26, 16, 10), '#bfeaf4') + P('14,20 22,12 30,12 16,28', HI) + P('36,38 42,34 58,50 54,58 46,58', '#8a4b2a') + P('36,38 42,34 50,42 44,46', '#a85f35'),
    phone: P('8,50 56,50 52,38 12,38', '#2f9e8f') + P('12,38 52,38 50,32 14,32', '#4fd8c0') + P('6,22 18,14 46,14 58,22 54,28 44,22 20,22 10,28', '#ff6a4d') + P('6,22 18,14 20,18 10,24', HI) + P(ng(32, 44, 4, 6), '#eaf7f8') + P('10,50 54,50 52,56 12,56', SH),
    beer: P('14,22 44,22 42,56 16,56', '#ffb547') + P('14,22 28,22 24,56 16,56', 'rgba(255,255,255,.22)') + P('12,22 15,12 24,15 31,8 39,14 47,11 46,22', '#fff7e6') + P('44,28 56,30 56,46 43,48 44,42 50,41 50,35 44,34', '#e8d8b0') + P('18,34 40,34 40,36 18,36', 'rgba(255,255,255,.3)'),
    lemon: P(ng(32, 32, 24, 12, 15), '#ffd84a') + P(ng(32, 32, 19, 12, 15), '#fff3a8') + [0, 60, 120].map(a => '<polygon points="30,13 34,13 34,51 30,51" fill="#ffd84a" transform="rotate(' + a + ' 32 32)"/>').join('') + P(ng(32, 32, 4, 6), '#ffd84a') + P('10,22 20,12 28,14 14,28', HI),
    cuffs: '<circle cx="20" cy="34" r="12" fill="none" stroke="#c8ccd2" stroke-width="6"/><circle cx="44" cy="34" r="12" fill="none" stroke="#9aa0a8" stroke-width="6"/>' + P('30,30 34,30 34,38 30,38', '#6d737c') + P('14,16 26,16 26,22 14,22', '#e8ebef') + P('38,16 50,16 50,22 38,22', '#e8ebef'),
    spin: P(ng(32, 32, 24, 8), '#5d7480') + P(ng(32, 32, 20, 8), '#2a4350') + P(ng(32, 14, 5, 6), '#e0b04a') + P(ng(50, 32, 5, 6), '#e0b04a') + P(ng(32, 50, 5, 6), '#e0b04a') + P(ng(14, 32, 5, 6), '#e0b04a') + P('36,2 48,10 36,18', '#ff6a4d') + P('28,62 16,54 28,46', '#5eead4'),
    coin: P(ng(32, 32, 26, 12), '#c98e1e') + P(ng(32, 32, 22, 12), '#f0b43c') + P(ng(32, 32, 16, 12), '#ffd36a') + P('32,20 42,32 32,44 22,32', '#c98e1e') + P('12,18 22,8 30,10 14,26', HI),
    whisky: P('14,14 50,14 45,56 19,56', 'rgba(220,245,250,.55)') + P('16,26 48,26 45,56 19,56', '#e8902a') + P('16,26 30,26 26,56 19,56', 'rgba(255,255,255,.22)') + P('22,30 32,30 32,40 22,40', 'rgba(255,255,255,.7)') + P('34,40 44,40 44,49 34,49', 'rgba(255,255,255,.55)') + P('14,14 50,14 49,18 15,18', 'rgba(255,255,255,.5)'),
    tray: P('32,6 56,14 54,40 32,60 10,40 8,14', '#7e4526') + P('32,11 51,17 49,38 32,54 15,38 13,17', '#b87142') + P('32,11 51,17 49,38 32,54', 'rgba(0,0,0,.14)') + P('32,11 15,17 13,38 32,54', HI) + P('30,20 34,20 34,44 30,44', 'rgba(60,30,12,.45)'),
    heart: P('32,58 6,30 6,19 16,9 27,11 32,18 37,11 48,9 58,19 58,30', '#ff4d6d') + P('32,58 6,30 6,19 16,9 22,12 20,26', HI) + P('32,58 58,30 58,19 48,9 44,28', SH),
    shield: P('32,6 56,14 54,40 32,60 10,40 8,14', '#6cc4f5') + P('32,6 56,14 54,40 32,60', 'rgba(0,0,0,.16)') + P('32,6 8,14 10,40 32,26', HI),
    skip: P('18,46 20,28 26,16 38,16 44,28 46,46', '#8fb6bf') + P('12,46 52,46 56,52 8,52', '#5f8791') + P('6,6 58,58 52,62 2,12', '#ff4d6d'),
    dbl: P('14,14 50,14 45,56 19,56', '#e8902a') + P('20,6 44,6 48,12 16,12', '#ff4d6d')
  };
  const NAMES = Object.keys(ICON);
  function sprite() {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" aria-hidden="true"><defs>' +
      FILTERS +
      NAMES.map(k => '<symbol id="ic-' + k + '" viewBox="0 0 64 64">' + ICON[k] + '</symbol>').join('') + '</defs></svg>';
  }
  const icon = (k, cls) => '<svg class="ic ' + (cls || '') + '" viewBox="0 0 64 64"><use href="#ic-' + k + '"/></svg>';

  // ---------------------------------------------------------------- bar scene (background) ----
  function scene() {
    let s = 7; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    const COL = ['#ffb547', '#5eead4', '#ff8a6a', '#6cc4f5', '#f6f0e2', '#b39bff', '#7bd88f'];
    let o = '<svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">';
    o += P('0,0 1600,0 1600,620 0,620', '#0a2c38');
    o += P('0,0 700,0 420,620 0,620', 'rgba(255,255,255,.035)') + P('900,0 1600,0 1600,620 1180,620', 'rgba(94,234,212,.05)') + P('560,0 900,0 1060,620 640,620', 'rgba(0,0,0,.12)') + P('0,320 1600,180 1600,260 0,420', 'rgba(255,106,77,.045)');
    [[110, 320], [930, 320]].forEach(([x0, y0]) => {
      for (const row of [0, 1]) {
        const y = y0 + row * 150; let x = x0 + 14;
        while (x < x0 + 560) {
          const h = 46 + rnd() * 50, w = 20 + rnd() * 8, c = COL[Math.floor(rnd() * COL.length)], top = y - h, nk = w * .3, cx = x + w / 2;
          o += P(x + ',' + y + ' ' + x + ',' + (top + 20) + ' ' + (cx - nk) + ',' + (top + 8) + ' ' + (cx - nk) + ',' + top + ' ' + (cx + nk) + ',' + top + ' ' + (cx + nk) + ',' + (top + 8) + ' ' + (x + w) + ',' + (top + 20) + ' ' + (x + w) + ',' + y, c, 'opacity=".78"');
          o += P(x + ',' + y + ' ' + x + ',' + (top + 20) + ' ' + (cx - nk) + ',' + (top + 8) + ' ' + (cx - nk) + ',' + y, 'rgba(255,255,255,.22)');
          x += w + 8 + rnd() * 10;
        }
        o += P(x0 + ',' + y + ' ' + (x0 + 580) + ',' + y + ' ' + (x0 + 580) + ',' + (y + 14) + ' ' + x0 + ',' + (y + 14), '#7e4526') + P(x0 + ',' + (y + 14) + ' ' + (x0 + 580) + ',' + (y + 14) + ' ' + (x0 + 560) + ',' + (y + 26) + ' ' + (x0 + 20) + ',' + (y + 26), '#5c311a');
      }
    });
    [400, 800, 1200].forEach((x, i) => {
      o += '<g class="lamp l' + i + '">' + P((x - 3) + ',0 ' + (x + 3) + ',0 ' + (x + 3) + ',150 ' + (x - 3) + ',150', '#2a4350') +
        P((x - 56) + ',210 ' + (x - 24) + ',148 ' + (x + 24) + ',148 ' + (x + 56) + ',210', '#ffb547') + P((x - 56) + ',210 ' + (x - 24) + ',148 ' + x + ',148 ' + (x - 12) + ',210', 'rgba(255,255,255,.3)') +
        P((x - 56) + ',210 ' + (x + 56) + ',210 ' + (x + 40) + ',222 ' + (x - 40) + ',222', '#fff2c0') +
        P((x - 40) + ',222 ' + (x + 40) + ',222 ' + (x + 330) + ',900 ' + (x - 330) + ',900', 'rgba(255,200,90,.07)') + '</g>';
    });
    o += '<g>' + P('640,52 960,52 940,112 660,112', 'none', 'stroke="#ff6a4d" stroke-width="5" stroke-linejoin="round"') +
      '<text x="800" y="98" text-anchor="middle" font-family="Baloo 2, sans-serif" font-weight="800" font-size="48" letter-spacing="8" fill="#ff8a6a">ROULETTE</text></g>';
    o += P('0,620 1600,620 1600,900 0,900', '#8a4b2a') + P('0,620 1600,620 1600,646 0,646', '#c98250') + P('0,646 1600,646 1600,660 0,660', '#5c311a');
    for (let x = -100; x < 1700; x += 230) o += P(x + ',660 ' + (x + 8) + ',660 ' + (x - 70) + ',900 ' + (x - 78) + ',900', 'rgba(0,0,0,.18)');
    o += P('0,660 700,660 400,900 0,900', 'rgba(255,255,255,.04)') + '</svg>';
    return o;
  }

  const INK = '#2a1a14';
  // ---------------------------------------------------------------- animals ----
  const CH = {
    pig:  { name: 'pig',  skin: '#f4a6b8', dark: '#d9788f', ey: 48, ex: 15, my: 87, col: '#f4a6b8' },
    fox:  { name: 'fox',  skin: '#f08a3c', dark: '#b85a1c', ey: 46, ex: 16, my: 84, col: '#f08a3c' },
    dog:  { name: 'dog',  skin: '#c99a62', dark: '#7b4b26', ey: 46, ex: 16, my: 84, col: '#c99a62' },
    goat: { name: 'goat', skin: '#efe8d8', dark: '#b9ab86', ey: 44, ex: 17, my: 88, col: '#efe8d8' },
    octo: { name: 'octo', skin: '#9a6bd6', dark: '#6a3fa8', ey: 50, ex: 17, my: 68, col: '#9a6bd6' },
    penguin: { name: 'penguin', skin: '#34415c', dark: '#1f2a40', ey: 44, ex: 14, my: 86, col: '#34415c' },
    hawk: { name: 'hawk', skin: '#8a5a32', dark: '#5c3a1e', ey: 44, ex: 15, my: 86, col: '#8a5a32' },
    turtle: { name: 'turtle', skin: '#6fbf73', dark: '#3f8a4a', ey: 52, ex: 15, my: 82, col: '#6fbf73' }
  };
  function body(c) {
    const k = CH[c] || CH.pig, S = k.skin, D = k.dark;
    switch (c) {
      case 'fox': return P('10,6 38,30 16,46', S) + P('90,6 62,30 84,46', S) + P('14,12 32,30 20,40', D) + P('86,12 68,30 80,40', D) + P('12,40 50,26 88,40 80,72 50,92 20,72', S) + P('12,40 34,60 20,72', '#fff3e0') + P('88,40 66,60 80,72', '#fff3e0') + P('34,62 50,54 66,62 58,86 50,92 42,86', '#fff3e0') + P('44,78 56,78 50,86', INK);
      case 'dog': return P('6,24 30,22 34,66 12,70', D) + P('94,24 70,22 66,66 88,70', D) + P(ng(50, 52, 34, 10), S) + P('22,36 40,38 34,52 20,52', D, 'opacity=".7"') + P('36,58 64,58 68,76 50,86 32,76', '#f1dcb8') + P('43,64 57,64 50,73', INK);
      case 'goat': return P('28,28 14,4 30,8 42,26', '#c9b27a') + P('72,28 86,4 70,8 58,26', '#c9b27a') + P('4,40 28,36 26,50', S) + P('96,40 72,36 74,50', S) + P('28,24 72,24 78,62 64,90 36,90 22,62', S) + P('44,88 56,88 50,102', D) + P('36,66 64,66 62,86 38,86', '#d8cba8') + P('44,72 48,72 48,76 44,76', INK) + P('52,72 56,72 56,76 52,76', INK);
      case 'octo': return [14, 30, 46, 62, 78].map((x, i) => P(x + ',70 ' + (x + 14) + ',70 ' + (x + 16 + (i % 2 ? 6 : -4)) + ',96 ' + (x + 8) + ',100 ' + (x + (i % 2 ? -4 : 6)) + ',88', D)).join('') + P('10,58 18,26 50,8 82,26 90,58 80,78 20,78', S) + P(ng(34, 26, 5, 7), '#c3a1f0') + P(ng(66, 20, 4, 7), '#c3a1f0') + P(ng(52, 34, 3, 6), '#c3a1f0');
      case 'penguin': return P(ng(50, 52, 36, 10), S) + P('26,46 50,38 74,46 70,74 50,86 30,74', '#f6f0e2') + P('42,60 58,60 50,74', '#ff9a2e') + P('10,60 22,50 22,70', D) + P('90,60 78,50 78,70', D);
      case 'hawk': return P('18,26 40,40 20,52', D) + P('82,26 60,40 80,52', D) + P(ng(50, 52, 34, 10), S) + P('24,40 76,40 72,60 28,60', '#efe0c0') + P('18,30 48,42 46,47 22,38', D) + P('82,30 52,42 54,47 78,38', D) + P('42,58 58,58 56,72 50,82 46,72', '#f2c23a') + P('50,82 46,72 56,72', '#b88a10');
      case 'turtle': return P('10,44 18,12 50,2 82,12 90,44', D) + P('26,14 50,8 40,30', 'rgba(255,255,255,.18)') + P('60,10 74,18 62,34', 'rgba(255,255,255,.18)') + P(ng(50, 56, 32, 10), S) + P('30,74 70,74 66,86 34,86', D) + P(ng(30, 66, 4, 6), D) + P(ng(70, 66, 4, 6), D);
      default: return P('12,22 38,18 34,42', D) + P('88,22 62,18 66,42', D) + P(ng(50, 52, 35, 9), S) + P('34,58 66,58 70,70 62,80 38,80 30,70', D) + P(ng(42, 69, 4, 6), INK) + P(ng(58, 69, 4, 6), INK);
    }
  }
  const L = (pts, w) => '<polyline points="' + pts + '" fill="none" stroke="' + INK + '" stroke-width="' + (w || 3.6) + '" stroke-linecap="round" stroke-linejoin="round"/>';
  const eyeAt = (c, x, y, e, sg) => {
    const k = CH[c] || CH.pig, wr = c === 'octo' ? 9 : 7.6, pup = c === 'goat' ? P(x - 5 + ',' + (y - 1.5) + ' ' + (x + 5) + ',' + (y - 1.5) + ' ' + (x + 5) + ',' + (y + 1.5) + ' ' + (x - 5) + ',' + (y + 1.5), INK) : P(ng(x, y + 1, c === 'octo' ? 4.6 : 3.8, 8), INK);
    const wh = c === 'goat' ? '#f3e08a' : '#fffdf5';
    switch (e) {
      case 'scared': return P(ng(x, y, wr + 2.6, 10), '#fffdf5') + P(ng(x, y, 2.4, 6), INK);
      case 'hurt': return L((x - 6) + ',' + (y - 5) + ' ' + (x + 5) + ',' + y + ' ' + (x - 6) + ',' + (y + 5), 4);
      case 'laugh': return L((x - 7) + ',' + (y + 3) + ' ' + x + ',' + (y - 5) + ' ' + (x + 7) + ',' + (y + 3), 4);
      case 'dead': return L((x - 6) + ',' + (y - 6) + ' ' + (x + 6) + ',' + (y + 6), 4) + L((x + 6) + ',' + (y - 6) + ' ' + (x - 6) + ',' + (y + 6), 4);
      case 'smug': return P(ng(x, y, wr, 10), wh) + pup + P((x - wr - 1) + ',' + (y - wr - 1) + ' ' + (x + wr + 1) + ',' + (y - wr - 1) + ' ' + (x + wr + 1) + ',' + (y - 1) + ' ' + (x - wr - 1) + ',' + (y - 1), k.skin) + L((x - 8) + ',' + (y - 1) + ' ' + (x + 8) + ',' + (y - 1), 3);
      default: return P(ng(x, y, wr, 10), wh) + pup;
    }
  }
  // eyes + brows + mouth only (transparent) — the 3D heads wear this as a texture on their front plane
  function faceParts(c, e) {
    const k = CH[c] || CH.pig, ey = k.ey, ex = k.ex, my = k.my; e = e || 'neutral'; let o = '';
    o += eyeAt(c, 50 - ex, ey, e) + eyeAt(c, 50 + ex, ey, e);
    const by = ey - 12; // brows
    if (e === 'smug') o += L((50 - ex - 8) + ',' + (by + 1) + ' ' + (50 - ex + 7) + ',' + (by - 3)) + L((50 + ex - 7) + ',' + (by - 3) + ' ' + (50 + ex + 8) + ',' + (by + 1));
    else if (e === 'scared' || e === 'hurt') o += L((50 - ex - 7) + ',' + (by + 2) + ' ' + (50 - ex + 7) + ',' + (by - 3)) + L((50 + ex - 7) + ',' + (by - 3) + ' ' + (50 + ex + 7) + ',' + (by + 2));
    else o += L((50 - ex - 7) + ',' + by + ' ' + (50 - ex + 7) + ',' + (by - 1.5), 3) + L((50 + ex - 7) + ',' + (by - 1.5) + ' ' + (50 + ex + 7) + ',' + by, 3);
    if (e === 'laugh') o += P((50 - 9) + ',' + my + ' ' + (50 + 9) + ',' + my + ' ' + (50 + 6) + ',' + (my + 9) + ' ' + (50 - 6) + ',' + (my + 9), '#5a1220') + P(ng(50, my + 8, 3.4, 6), '#ff6a7d');
    else if (e === 'scared') o += P(ng(50, my + 3, 5, 8), '#5a1220');
    else if (e === 'hurt') o += L((50 - 8) + ',' + (my + 4) + ' ' + (50 - 3) + ',' + my + ' ' + (50 + 3) + ',' + (my + 4) + ' ' + (50 + 8) + ',' + my);
    else if (e === 'dead') o += L((50 - 8) + ',' + my + ' ' + (50 + 8) + ',' + my) + P((50 + 2) + ',' + my + ' ' + (50 + 9) + ',' + my + ' ' + (50 + 6) + ',' + (my + 10), '#ff6a7d');
    else if (e === 'smug') o += L((50 - 9) + ',' + (my + 2) + ' ' + (50 + 6) + ',' + (my + 2) + ' ' + (50 + 11) + ',' + (my - 3));
    else o += L((50 - 7) + ',' + my + ' ' + (50 + 7) + ',' + my);
    return o;
  }
  // brush strokes laid over a flat shape: a few translucent streaks following the same direction
  function strokes(seed, n) { let s = seed || 3; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; let o = ''; for (let i = 0; i < n; i++) { const x = 8 + r() * 70, y = 10 + r() * 80, l = 14 + r() * 30; o += '<polygon points="' + x + ',' + y + ' ' + (x + l) + ',' + (y - 3 - r() * 4) + ' ' + (x + l) + ',' + (y - 1) + ' ' + x + ',' + (y + 2.5) + '" fill="' + (r() > .5 ? 'rgba(255,255,255,.22)' : 'rgba(40,10,0,.14)') + '"/>'; } return o; }
  const face = (c, e) => '<svg viewBox="0 0 100 104" xmlns="http://www.w3.org/2000/svg">' + defs() + '<g filter="url(#rough)">' + body(c) + strokes((CH[c] || CH.pig).skin.length * 7 + c.length, 9) + '</g>' + faceParts(c, e) + '</svg>';
  const faceOnly = (c, e) => '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">' + defs() + faceParts(c, e) + '</svg>';

  const CHARS = Object.keys(CH), EXPR = ['smug', 'laugh', 'scared', 'angry', 'hurt'];
  // every player wears a bartender's hat in their seat colour (the same hat sits on the 3D animals)
  const hat = col => P('12,30 88,30 82,40 18,40', col) + P('12,30 88,30 86,33 14,33', 'rgba(255,255,255,.28)') + P('30,32 33,6 67,6 70,32', col) + P('30,32 33,6 44,6 41,32', 'rgba(255,255,255,.22)') + P('30,32 70,32 69,24 31,24', 'rgba(0,0,0,.28)');
  const avatar = (c, e, ring, col) => '<svg viewBox="0 0 100 104" xmlns="http://www.w3.org/2000/svg">' + defs() + (ring ? '<polygon points="' + ng(50, 52, 50, 10) + '" fill="' + ring + '" opacity=".35"/>' : '') + '<g filter="url(#rough)">' + body(c) + strokes((CH[c] || CH.pig).skin.length * 7 + c.length, 9) + (col ? hat(col) : '') + '</g>' + faceParts(c, e) + '</svg>';
  const faceUrl = (c, e) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(faceOnly(c, e).replace('<svg ', '<svg width="256" height="256" '));

  // ---------------------------------------------------------------- logo + drum ----
  function logo() {
    let o = '<svg viewBox="0 0 100 100">' + P(ng(50, 50, 46, 24), '#3b4f58') + P(ng(50, 50, 40, 24), '#6d8794') + P(ng(50, 50, 40, 24), 'none', '');
    for (let i = 0; i < 6; i++) { const a = (i * 60 - 90) * Math.PI / 180; o += P(ng(50 + 24 * Math.cos(a), 50 + 24 * Math.sin(a), 9, 8), i === 0 ? '#ff4d6d' : '#1c2b33'); }
    return o + P(ng(50, 50, 7, 6), '#e0b04a') + P('36,12 64,12 60,0 40,0', '#aebfc6') + '</svg>';
  }
  // slot status: kind 'L'|'B' + state: 'spent' | 'known' | 'hidden'
  function drumSlots(g, me) {
    const n = g.n, spent = g.spent.length, R = 62; let o = '';
    for (let j = 0; j < n; j++) {
      const a = j * 360 / n * Math.PI / 180, x = 180 + R * Math.sin(a), y = 200 - R * Math.cos(a);
      let cap, cls = '';
      if (j < spent) { cap = g.spent[j] === 'L' ? '#8a3a4c' : '#2f6f88'; cls = 'spent'; }
      else { const c = g.ch[j - spent]; if (c && c.s[me]) { cap = c.k === 'L' ? '#ff4d6d' : '#6cc4f5'; cls = 'known ' + c.k; } else cap = '#e0b04a'; }
      o += '<g class="slot ' + cls + '">' + P(ng(x, y, 24, 10, 18), '#141f25') + P(ng(x, y, 19, 10, 18), cap) + (j < spent ? P(ng(x, y, 8, 6), 'rgba(0,0,0,.35)') : P(ng(x - 3, y - 4, 6, 4), 'rgba(255,255,255,.35)')) + '</g>';
    }
    return o;
  }
  function drumFrame() {
    return P(ng(180, 200, 108, 24), '#33454e') + P(ng(180, 200, 98, 24), '#5d7480') + P('180,102 260,142 280,200 180,200', 'rgba(255,255,255,.06)') + P('180,200 100,258 80,200', 'rgba(0,0,0,.12)');
  }
  const BARREL = P('160,106 200,106 197,52 163,52', '#aebfc6') + P('180,106 200,106 197,52 180,52', 'rgba(0,0,0,.14)') + P('160,106 168,106 166,52 163,52', 'rgba(255,255,255,.3)') + P('157,52 203,52 201,38 159,38', '#3b4f58') + P('176,38 184,38 180,26', '#ff6a4d');
  const FLASH = '<g transform="translate(0,40)">' + P('180,-30 192,-2 222,-14 200,10 236,24 198,30 210,60 180,38 150,60 162,30 124,24 160,10 138,-14 168,-2', '#ffd36a') + P('180,-10 188,6 206,2 194,16 212,26 190,26 180,44 170,26 148,26 166,16 154,2 172,6', '#fff6d6') + '</g>';

  return { face, faceOnly, faceUrl, CH, CHARS, EXPR, hat, sprite, icon, scene, avatar, logo, drumSlots, drumFrame, BARREL, FLASH, ITEMS: ['loupe', 'phone', 'beer', 'lemon', 'cuffs', 'spin', 'coin', 'whisky', 'tray'] };
})();
