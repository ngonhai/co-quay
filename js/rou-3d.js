// rou-3d.js — first-person 3D table for Roulette (Three.js, vendored in js/lib). Exposes window.R3D; if WebGL/three is missing the 2D UI is used instead.
// Painted style shared with Sus Tavern: toon-shaded low-poly animals / props with a brush-streak texture and an ink outline hull, wobbly SVG faces as textures.
// The UI (rou-ui.js) owns the rules/timing; this file only draws and animates:
//   setup({names,chars,cols,view,sign,lang}) / sync(g)   static state: items on the table, drum chambers, shields, cuffs, who is down
//   gunAim / gunSuspense / gunFire / gunPut   the shot: the gun slides to the shooter, the hand wraps the grip, the muzzle goes to the head (self) or points across the table (opponent)
//   useItem(by, kind, id)   that player's hand takes the item from the table and uses it       die(seat) / revive(seat)   the loser of a round falls over
//   setView(seat|'side'), setSelected(id), setExpr(seat, expr), say(seat, text, name, color, ms)   (table talk: a flat board above the speaker's head), slam(seat), point(by, at)
import * as THREE from 'three';

const R = 1.15, TY = .78, CT = .004;      // seat distance from the table centre, table top height
const UP = new THREE.Vector3(0, 1, 0), V = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const eio = u => u < .5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2, eo = u => 1 - Math.pow(1 - u, 3), lin = u => u;
const ebo = u => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2); };
const SLOTS = [-.62, -.36, .36, .62].flatMap(x => [-.22, .22].map(z => V(x, TY, z)));   // 8 table slots (shared by both players)

const R3D = (function () {
  let renderer, scene, cam, wrap, canvas, running = false, ok = false, lastT = 0, raf = 0, hidT = 0, lastErr = '';
  const SEAT = [];       // { phi, pos, dir, right, q }
  let n = 0, game = null, me = 0;
  const view = { mode: 'pov', seat: 0, parX: 0, parY: 0 }, camPos = V(0, 1.3, 1.2), camLook = V(0, .8, 0), cine = { dolly: 0, fov: 0, shake: 0, pitch: 0, roll: 0, k: 0, focus: V(0, 1, 0) };
  const players = [null, null], items = new Map(); let lampSpot, flashLight, tableMesh, glow, glowA = 0, fxs = [], setSign = () => {}, lampBase = 20, selRing, hoverRing, selId = null, hoverId = null, aimMode = false, drumSig = '', gunObj = null, curShot = null;
  const shieldMeshes = [null, null], cuffMeshes = [null, null], cb = { pick: () => {}, hover: () => {} };

  // ---------------------------------------------------------------- tweens ----
  const tws = [];
  const tween = (ms, fn, ease) => new Promise(res => { tws.push({ t: 0, ms: Math.max(1, ms), fn, ease: ease || eio, res }); });
  const wait = ms => tween(ms, () => {});
  function stepTweens(dt) { for (let i = tws.length - 1; i >= 0; i--) { const w = tws[i]; w.t += dt * 1000; const u = Math.min(1, w.t / w.ms); w.fn(w.ease(u)); if (u >= 1) { tws.splice(i, 1); w.res(); } } }
  const cineTo = (prop, val, ms) => { const a = cine[prop]; return tween(ms, u => { cine[prop] = a + (val - a) * u; }); };

  // ---------------------------------------------------------------- painted materials ----
  const brushTex = (() => { let tx; return () => { if (tx) return tx; const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); g.fillStyle = '#f2f2f2'; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 160; i++) { const v = 200 + Math.random() * 55 | 0; g.fillStyle = 'rgba(' + (v - 60) + ',' + (v - 60) + ',' + (v - 60) + ',' + (.12 + Math.random() * .25) + ')'; g.fillRect(Math.random() * 128, Math.random() * 128, 20 + Math.random() * 70, 1 + Math.random() * 3); }
    for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(255,255,255,' + (.2 + Math.random() * .3) + ')'; g.fillRect(Math.random() * 128, Math.random() * 128, 20 + Math.random() * 60, 1 + Math.random() * 2); }
    tx = new THREE.CanvasTexture(c); tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.colorSpace = THREE.SRGBColorSpace; return tx; }; })();
  const gradMap = (() => { let t; return () => { if (t) return t; const d = new Uint8Array([70, 70, 70, 255, 150, 150, 150, 255, 215, 215, 215, 255, 255, 255, 255, 255]); t = new THREE.DataTexture(d, 4, 1, THREE.RGBAFormat); t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t; }; })();
  const clean = o => { if (!o) return {}; const r = Object.assign({}, o); delete r.metalness; delete r.roughness; return r; };
  const mats = {}; const M = (c, o) => { const k = c + JSON.stringify(o || {}); return mats[k] || (mats[k] = new THREE.MeshToonMaterial(Object.assign({ color: c, gradientMap: gradMap(), map: brushTex() }, clean(o)))); };
  const inkM = new THREE.MeshBasicMaterial({ color: 0x1a0f0a, side: THREE.BackSide });
  const inked = (m, k) => { const o = new THREE.Mesh(m.geometry, inkM); o.scale.setScalar(k || 1.07); o.userData.ink = true; m.add(o); return m; };
  const mk = (geo, mat, x, y, z, parent, ink) => { const m = new THREE.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0); m.castShadow = true; m.receiveShadow = true; if (ink !== false && !mat.transparent) inked(m); if (parent) parent.add(m); return m; };
  const box = (w, h, d, mat, x, y, z, p, ink) => mk(new THREE.BoxGeometry(w, h, d), mat, x, y, z, p, ink);
  const cyl = (rt, rb, h, seg, mat, x, y, z, p, ink) => mk(new THREE.CylinderGeometry(rt, rb, h, Math.max(seg, 14)), mat, x, y, z, p, ink);
  // capsule: rounded limb / finger segment, axis = +Y, total length = len (caps included)
  const cap = (r, len, mat, x, y, z, p, ink) => mk(new THREE.CapsuleGeometry(r, Math.max(.001, len - 2 * r), 6, 14), mat, x, y, z, p, ink);
  const sph = (r, mat, x, y, z, p, sx, sy, sz) => { const m = mk(new THREE.SphereGeometry(r, 20, 14), mat, x, y, z, p); m.scale.set(sx || 1, sy || 1, sz || 1); return m; };
  const cone = (r, h, seg, mat, x, y, z, p) => mk(new THREE.ConeGeometry(r, h, Math.max(seg, 12)), mat, x, y, z, p);

  const inkAll = (grp, k) => { const ms = []; grp.traverse(o => { if (o.isMesh && !o.userData.ink && o.material && !o.material.transparent && o.material.type !== 'MeshBasicMaterial' && !o.children.some(c => c.userData.ink)) ms.push(o); }); ms.forEach(o => inked(o, k || 1.09)); return grp; };
  // ---------------------------------------------------------------- seats ----
  function layout(count) {
    n = count; SEAT.length = 0;
    for (let i = 0; i < n; i++) { const phi = i * Math.PI * 2 / n; SEAT.push({ phi, pos: V(-Math.sin(phi) * R, 0, Math.cos(phi) * R), dir: V(Math.sin(phi), 0, -Math.cos(phi)), right: V(Math.cos(phi), 0, Math.sin(phi)), q: new THREE.Quaternion().setFromAxisAngle(UP, -phi) }); }
  }
  const sw = (s, r, y, f) => { const S = SEAT[s]; return V(S.pos.x + S.dir.x * f + S.right.x * r, y, S.pos.z + S.dir.z * f + S.right.z * r); };
  const poseQ = (s, rx, ry, rz) => SEAT[s].q.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0)));
  // ---------------------------------------------------------------- room ----
  const LABEL = (txt, w, h, col, bg) => { const c = document.createElement('canvas'); c.width = 512; c.height = Math.round(512 * h / w); const g = c.getContext('2d'); if (bg) { g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height); }
    // multi-line: "\n" in the text starts a new line; the font shrinks until every line fits the width and all lines fit the height
    const lines = String(txt).split('\n'), FONT = fs => '800 ' + fs + 'px "Sedgwick Ave Display","Permanent Marker",Impact,sans-serif';
    let fs = Math.min(c.height * .62, c.height * .9 / (lines.length * 1.12)) | 0;
    for (; fs > 12; fs -= 3) { g.font = FONT(fs); if (Math.max(...lines.map(l => g.measureText(l).width)) <= c.width * .94) break; }
    g.font = FONT(fs); g.fillStyle = col; g.textAlign = 'center'; g.textBaseline = 'middle'; lines.forEach((l, i) => g.fillText(l, c.width / 2, c.height / 2 + (i - (lines.length - 1) / 2) * fs * 1.12));
    g.globalCompositeOperation = 'destination-out'; for (let i = 0; i < 70; i++) { g.lineWidth = .6 + Math.random() * 2; g.strokeStyle = 'rgba(0,0,0,' + (.4 + Math.random() * .6) + ')'; const x = Math.random() * c.width, y = Math.random() * c.height, l = 30 + Math.random() * 160; g.beginPath(); g.moveTo(x, y); g.lineTo(x + l, y + (Math.random() - .5) * 6); g.stroke(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
  function buildRoom() {
    scene.background = new THREE.Color('#0a2530'); scene.fog = new THREE.Fog('#0a2530', 5, 12);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(7, 32), M('#6b3a1f')); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(6.2, 6.2, 4, 28, 1, true), new THREE.MeshToonMaterial({ color: '#12495a', gradientMap: gradMap(), map: brushTex(), side: THREE.BackSide })); wall.position.y = 2; scene.add(wall);
    // shelves of bottles around the wall
    const COL = ['#ffb547', '#5eead4', '#ff8a6a', '#6cc4f5', '#f6f0e2', '#b39bff', '#7bd88f'];
    for (let ring = 0; ring < 2; ring++) for (let k = 0; k < 44; k++) { const a = k / 44 * Math.PI * 2, rr = 5.9, h = .22 + Math.random() * .16, b = cyl(.04, .05, h, 6, M(COL[(k * 3 + ring) % COL.length]), Math.sin(a) * rr, 1.55 + ring * .85 + h / 2, Math.cos(a) * rr, scene, false); b.rotation.y = a; }
    for (let ring = 0; ring < 2; ring++) { const sh = new THREE.Mesh(new THREE.TorusGeometry(5.9, .04, 4, 40), M('#7e4526')); sh.rotation.x = Math.PI / 2; sh.position.y = 1.53 + ring * .85; scene.add(sh); }
    // The tavern sign on the wall: every game picks one of the I18N[lang].signs (g.sign is random per room/game, g.lang is the language of whoever created the room, so all players in a room see the same sign). Edit the names in i18n.js.
    const signsOf = lang => (I18N[lang] || I18N[LANG] || I18N.vi).signs || I18N.vi.signs;
    const signMat = new THREE.MeshBasicMaterial({ map: LABEL(signsOf()[0][0], 2.6, .7, signsOf()[0][1]), transparent: true });
    const signMeshes = [];
    setSign = (n, lang) => { const SIGNS = signsOf(lang), d = SIGNS[((n | 0) % SIGNS.length + SIGNS.length) % SIGNS.length], k = 1 + .75 * (d[0].split('\n').length - 1); if (signMat.map) signMat.map.dispose(); signMat.map = LABEL(d[0], 2.6, .7 * k, d[1]); signMat.needsUpdate = true; signMeshes.forEach(m => m.scale.y = k); };
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, .7), signMat); sign.position.set(0, 3.1, -5.9); scene.add(sign);
    const sign2 = sign.clone(); sign2.position.set(0, 3.1, 5.9); sign2.rotation.y = Math.PI; scene.add(sign2); signMeshes.push(sign, sign2);
    // lights
    scene.add(new THREE.HemisphereLight(0x5b8fa0, 0x2a1a10, .5)); scene.add(new THREE.AmbientLight(0x40606a, .35));
    lampSpot = new THREE.SpotLight(0xffc27a, 20, 8, .95, .7, 1.4); lampSpot.position.set(0, 2.6, 0); lampSpot.target.position.set(0, TY, 0); lampSpot.castShadow = true; lampSpot.shadow.mapSize.set(1024, 1024); scene.add(lampSpot, lampSpot.target);
    flashLight = new THREE.PointLight(0xffd27a, 0, 4, 2); scene.add(flashLight);
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + .7, l = new THREE.PointLight(0xffa860, 1.2, 6, 2); l.position.set(Math.sin(a) * 3.2, 1.8, Math.cos(a) * 3.2); scene.add(l); }
    const lamp = new THREE.Group(); cyl(.012, .012, 1.2, 4, M('#2a4350'), 0, .7, 0, lamp, false); cyl(.1, .42, .26, 9, M('#ffb547', { emissive: '#ffb547', emissiveIntensity: .8 }), 0, 0, 0, lamp, false); lamp.position.set(0, 2.55, 0); scene.add(lamp);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(.3, 1.2, 1.8, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0xffc070, transparent: true, opacity: .05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); shaft.position.set(0, 1.65, 0); scene.add(shaft);
    // table: a plain rectangular bar table with a green felt, shared by both players
    tableMesh = new THREE.Group(); scene.add(tableMesh);
    const top = box(1.75, .07, 1.1, M('#85502d'), 0, TY - .035, 0, tableMesh); top.userData.table = true;
    const felt = box(1.55, .006, .94, M('#1c6a56'), 0, TY + .002, 0, tableMesh, false); felt.userData.table = true;
    [[-.8, -.5], [.8, -.5], [-.8, .5], [.8, .5]].forEach(p => box(.08, TY - .07, .08, M('#5c311a'), p[0], (TY - .07) / 2, p[1], tableMesh));
    [[0, .475, 1.55, .008], [0, -.475, 1.55, .008]].forEach(a => { const l = box(a[2], .004, a[3], M('#e0b04a'), a[0], TY + .006, a[1], tableMesh, false); l.castShadow = false; });
    selRing = new THREE.Mesh(new THREE.RingGeometry(.062, .08, 18), new THREE.MeshBasicMaterial({ color: 0xffb547, transparent: true, opacity: .9, side: THREE.DoubleSide, depthWrite: false })); selRing.rotation.x = -Math.PI / 2; selRing.visible = false; scene.add(selRing);
    hoverRing = new THREE.Mesh(new THREE.RingGeometry(.062, .075, 14), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .55, side: THREE.DoubleSide, depthWrite: false })); hoverRing.visible = false; scene.add(hoverRing);
    const gc = document.createElement('canvas'); gc.width = gc.height = 128; const gg = gc.getContext('2d'), gr = gg.createRadialGradient(64, 64, 10, 64, 64, 62); gr.addColorStop(0, 'rgba(255,244,170,0)'); gr.addColorStop(.55, 'rgba(255,240,150,.5)'); gr.addColorStop(.8, 'rgba(255,236,140,.18)'); gr.addColorStop(1, 'rgba(255,236,140,0)'); gg.fillStyle = gr; gg.fillRect(0, 0, 128, 128);
    glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(gc), transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending })); glow.scale.set(.2, .2, 1); glow.renderOrder = 5; glow.visible = false; scene.add(glow);
  }

  // ---------------------------------------------------------------- animals ----
  const SKIN = { pig: '#f4a6b8', fox: '#f08a3c', dog: '#c99a62', goat: '#efe8d8', octo: '#9a6bd6', penguin: '#34415c', hawk: '#8a5a32', turtle: '#6fbf73' }, DARK = { pig: '#d9788f', fox: '#b85a1c', dog: '#7b4b26', goat: '#b9ab86', octo: '#6a3fa8', penguin: '#1f2a40', hawk: '#5c3a1e', turtle: '#3f8a4a' };
  // body silhouettes: width / height / depth of the torso, head scale (heads are big and cartoony)
  const SP = { pig: { tw: .8, th: .6, td: .46, head: 1.4 }, fox: { tw: .5, th: .68, td: .28, head: 1.45 }, dog: { tw: .64, th: .64, td: .34, head: 1.4 }, goat: { tw: .48, th: .78, td: .26, head: 1.35 }, octo: { tw: .6, th: .6, td: .4, head: 1.2 }, penguin: { tw: .66, th: .78, td: .5, head: 1.35 }, hawk: { tw: .56, th: .72, td: .3, head: 1.35 }, turtle: { tw: .68, th: .58, td: .42, head: 1.3 } };
  const faceCache = {}, headR = { pig: .2, fox: .18, dog: .19, goat: .17, octo: .24, penguin: .19, hawk: .18, turtle: .18 };
  function setFaceTex(p, expr) {
    const key = p.char + (expr || 'neutral'); p.expr = expr || 'neutral';
    const draw = img => { const g = p.fctx; g.clearRect(0, 0, 256, 256); g.drawImage(img, 0, 0, 256, 256); p.ftex.needsUpdate = true; };
    if (faceCache[key] && faceCache[key].complete && faceCache[key].naturalWidth) { draw(faceCache[key]); return; }
    const img = faceCache[key] || new Image(); faceCache[key] = img; img.onload = () => { if (p.expr === (expr || 'neutral')) draw(img); };
    if (!img.src) img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(Art.faceOnly(p.char, expr).replace('<svg ', '<svg width="256" height="256" '));
  }
  function makeHead(char, S, D) {
    const h = new THREE.Group(), sk = M(S), dk = M(D), R0 = headR[char], white = M('#fff3e0'), ink = M('#2a1a14');
    switch (char) {
      case 'pig': sph(R0, sk, 0, 0, 0, h); cyl(.075, .08, .06, 9, dk, 0, -.05, -R0 - .03, h).rotation.x = Math.PI / 2; [[-1], [1]].forEach(([s]) => { const e = cone(.075, .13, 4, dk, s * .15, .16, -.02, h); e.rotation.z = -s * .9; e.rotation.x = .5; }); break;
      case 'fox': sph(R0, sk, 0, 0, 0, h, 1.08, .92, 1); cone(.075, .2, 6, white, 0, -.05, -R0 - .06, h).rotation.x = -Math.PI / 2; [-1, 1].forEach(s => { cone(.075, .22, 4, sk, s * .12, .2, 0, h).rotation.z = -s * .15; cone(.04, .1, 4, ink, s * .12, .27, 0, h); sph(.055, white, s * .15, -.065, -.09, h, 1, .8, .85); }); break;
      case 'dog': sph(R0, sk, 0, 0, 0, h); sph(.075, M('#f1dcb8'), 0, -.06, -R0 + .0, h, 1.05, .8, 1.25); sph(.032, ink, 0, -.035, -R0 - .115, h, 1.1, .8, .9); [-1, 1].forEach(s => sph(.1, dk, s * .2, -.02, .0, h, .42, 1.05, .62).rotation.z = s * .25); break;
      case 'goat': sph(.15, sk, 0, 0, 0, h, .9, 1.2, .95); sph(.11, sk, 0, -.12, -.03, h, .85, 1, 1); cone(.05, .12, 4, M('#d8cba8'), 0, -.14, -.07, h); [-1, 1].forEach(s => { const hr = cone(.04, .24, 5, M('#c9b27a'), s * .09, .27, .02, h); hr.rotation.z = -s * .45; hr.rotation.x = -.45; sph(.075, sk, s * .19, .06, 0, h, 1.5, .42, .6).rotation.z = s * .4; }); break;
      case 'penguin': sph(R0, sk, 0, 0, 0, h); sph(.15, white, 0, -.03, -.06, h, 1, 1.05, .8); cone(.045, .11, 5, M('#ff9a2e'), 0, -.05, -R0 - .05, h).rotation.x = -Math.PI / 2; break;
      case 'hawk': sph(R0, sk, 0, 0, 0, h); sph(.14, M('#efe0c0'), 0, -.02, -.05, h, 1, 1, .8); const bk = cone(.05, .13, 5, M('#f2c23a'), 0, -.06, -R0 - .05, h); bk.rotation.x = -Math.PI / 2 - .35; [-1, 1].forEach(s => sph(.055, dk, s * .075, .075, -R0 + .03, h, 1.2, .4, .8).rotation.z = -s * .35); [-1, 1].forEach(s => cone(.04, .12, 4, dk, s * .1, .19, .02, h)); break;
      case 'turtle': sph(R0, sk, 0, 0, 0, h, .95, 1, 1.1); sph(.045, dk, 0, -.085, -R0 + .0, h, 1.2, .3, .7); break;
      case 'octo': sph(R0, sk, 0, .02, 0, h, 1, 1.15, 1); [[0, .22, -.1], [-.1, .16, .1], [.11, .12, .08]].forEach(p => sph(.035, M('#c3a1f0'), p[0], p[1], p[2], h)); break;
    }
    return h;
  }
  function makePerson(s, char, col) {
    const root = new THREE.Group(), S = SKIN[char], D = DARK[char], fur = M(S), cloth = M('#f6f0e2'), vest = M(col);
    root.position.copy(SEAT[s].pos); root.quaternion.copy(SEAT[s].q);
    const chair = new THREE.Group(); box(.52, .05, .48, M('#7e4526'), 0, .45, .02, chair); box(.52, .6, .05, M('#7e4526'), 0, .78, .27, chair); [[-.2, -.2], [.2, -.2], [-.2, .24], [.2, .24]].forEach(p => box(.05, .45, .05, M('#7e4526'), p[0], .22, p[1], chair, false)); root.add(chair);
    const body = new THREE.Group(); body.position.y = .7; root.add(body);     // pivot for falling over
    const torso = new THREE.Group(); body.add(torso);
    const sp = SP[char], vestM = vest, dk = M(D);
    if (char === 'octo') { for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2, t = cyl(.055, .03, .6, 6, dk, Math.sin(a) * .22, .1, Math.cos(a) * .15 - .1, torso); t.rotation.z = Math.sin(a) * .35; } sph(.3, fur, 0, .5, 0, torso, 1.1, 1, .85); }
    else {
      const tw = sp.tw, th = sp.th, td = sp.td;
      if (char === 'penguin') { sph(.5, fur, 0, th / 2, 0, torso, tw, th, td); sph(.5, M('#f6f0e2'), 0, th / 2 - .02, -.05, torso, tw * .78, th * .86, td * .85); }
      else if (char === 'pig') { sph(.5, cloth, 0, th / 2, 0, torso, tw, th, td); sph(.5, vestM, 0, th / 2 - .02, -.04, torso, tw * .96, th * .82, td * .9); }
      else { sph(.5, cloth, 0, th / 2, 0, torso, tw, th, td); sph(.5, vestM, 0, th / 2 - .02, -.04, torso, tw * .93, th * .8, td * .9); { const zf = -.04 - .45 * td - .02, tc = M('#d9483b'), tie = cone(.055, .22, 12, tc, 0, th * .6, zf, torso); tie.rotation.x = Math.PI; tie.scale.z = .3; sph(.032, tc, 0, th * .6 + .105, zf, torso, 1.15, .8, .7); } }
      if (char === 'hawk') [1, -1].forEach(sd => { const w = cone(.1, .5, 4, dk, sd * (tw / 2 + .07), th * .45, .05, torso); w.rotation.z = sd * .12; w.scale.z = .4; w.rotation.x = Math.PI; });
      if (char === 'turtle') { const sh = sph(.5, M('#4f9a55'), 0, th / 2 + .04, td / 2 - .02, torso, tw * .95, th * 1.0, .55); [[-.15, .2], [.15, .2], [0, .0], [-.2, -.12], [.2, -.12]].forEach(q => sph(.12, M('#3f8a4a'), q[0], th / 2 + q[1] * .6, td / 2 + .2, torso, 1.3, 1, .35)); }
      if (char === 'fox') { const tl = cone(.1, .5, 6, fur, 0, .1, td / 2 + .22, torso); tl.rotation.x = Math.PI / 2 + .5; cone(.06, .15, 6, M('#fff3e0'), 0, .0, td / 2 + .45, torso).rotation.x = Math.PI / 2 + .5; }
      cyl(.1, .13, .1, 14, fur, 0, th - .01, 0, torso);
      [1, -1].forEach(sd => sph(.13, char === 'penguin' ? M(D) : fur, sd * (tw / 2 + .02), th * .82, 0, torso, 1.1, .9, 1.1));
    }
    const head = makeHead(char, S, D); head.scale.setScalar(sp.head); head.position.set(0, char === 'octo' ? 1.0 : sp.th + headR[char] * sp.head * .78, 0); body.add(head);
    const c = document.createElement('canvas'); c.width = c.height = 256; const ftex = new THREE.CanvasTexture(c); ftex.colorSpace = THREE.SRGBColorSpace; const fs = headR[char] * 2.1;
    const snout = { pig: .1, fox: .22, dog: .13, goat: .04, octo: 0, penguin: .1, hawk: .1, turtle: .02 }[char];
    const face = new THREE.Mesh(new THREE.PlaneGeometry(fs, fs), new THREE.MeshBasicMaterial({ map: ftex, transparent: true, depthWrite: false })); face.position.set(0, -.01, -(headR[char] * .98 + snout * .5 + .004)); face.rotation.y = Math.PI; head.add(face);
    const hmeshes = []; head.traverse(o => { if (o.isMesh && !o.userData.ink && o !== face) hmeshes.push(o); });
    const p = { s, char, root, body, torso, head, face, hmeshes, ftex, fctx: c.getContext('2d'), expr: 'neutral', hit: 0, dead: false, fall: 0, lean: 0, look: null, arms: [], col, chair };
    root.userData.pseat = s; scene.add(root); [1, -1].forEach(side => { const a = makeArm(s, side, char === 'penguin' ? M(D) : fur, char === 'penguin' ? D : S, (char === 'octo' ? .6 : sp.tw) / 2 + .04, sp.th, char === 'penguin' || char === 'octo' ? null : cloth); p.arms.push(a); scene.add(a.root); });
    setFaceTex(p, 'neutral'); return p;
  }

  // ---------------------------------------------------------------- hands (round palm, 4 jointed fingers, 2-piece thumb) ----
  // Hand space: origin = wrist, fingers point to -Z, palm faces -Y, the thumb sits on -X for a right hand (side = +1).
  const PALM = .1;                                                    // wrist -> finger bases
  const FINGERS = [{ x: -.036, r: .0152, L: [.044, .032, .026] }, { x: -.012, r: .016, L: [.049, .036, .028] }, { x: .012, r: .0152, L: [.045, .033, .026] }, { x: .034, r: .0136, L: [.037, .026, .022] }];
  const limb = (r, len, mat) => { const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(.002, len - 2 * r), 5, 12), mat); m.rotation.x = -Math.PI / 2; m.position.z = -len / 2; m.receiveShadow = true; inked(m, 1 + .0042 / r); return m; };
  function makeHand(S, side) {
    const g = new THREE.Group(), m = M(S);
    sph(.05, m, 0, 0, -PALM / 2, g, 1.12, .6, 1.0);                   // palm
    sph(.05, m, 0, -.002, -PALM + .016, g, 1.0, .52, .5);             // knuckle row
    sph(.032, m, -side * .036, -.01, -.036, g, 1, .75, 1.25);         // thumb pad
    const fingers = FINGERS.map(f => {
      const root = new THREE.Group(); root.position.set(f.x * side, -.012, -PALM + .006); g.add(root);
      const js = []; let par = root;
      f.L.forEach((len, i) => { const j = new THREE.Group(); if (i) j.position.z = -f.L[i - 1]; par.add(j); j.add(limb(f.r * (1 - i * .07), len + .003, m)); js.push(j); par = j; });
      js.root = root; return js;
    });
    const t0 = new THREE.Group(); t0.position.set(-side * .046, -.012, -.03); g.add(t0);
    const t1 = new THREE.Group(); t0.add(t1); t1.add(limb(.0182, .046, m));
    const t2 = new THREE.Group(); t2.position.z = -.046; t1.add(t2); t2.add(limb(.0158, .038, m));
    g.userData = { fingers, thumb: [t0, t1, t2], side };
    g.traverse(o => { if (o.isMesh) o.castShadow = false; });
    return g;
  }
  const FIST = [-1.28, -1.5, -.95], GUNC = [-1.3, -.72, -.5], KC = [.92, 1, 1.04, 1.12];
  // v: 0 = relaxed, 1 = closed; point = index finger stays straight; gun = fingers wrap a revolver grip
  function setGrip(h, v, point, gun) {
    const d = h.userData, side = d.side, B = gun ? GUNC : FIST;
    d.fingers.forEach((js, i) => {
      const m = point && i === 0 ? 0 : (.16 + .84 * v) * KC[i];
      js.forEach((j, n) => { j.rotation.x = B[n] * m; });
      js.root.rotation.y = side * (1.5 - i) * .055 * (1 - v);
    });
    const th = d.thumb;
    if (gun) { th[0].rotation.set(-.2, side * .12, 0); th[1].rotation.x = -.3 * v; th[2].rotation.x = -.35 * v; }
    else if (point) { th[0].rotation.set(-.15, side * .45, 0); th[1].rotation.x = -.05; th[2].rotation.x = -.05; }
    else { th[0].rotation.set(-.25 - .35 * v, side * (.62 - .36 * v), 0); th[1].rotation.x = -.3 - .35 * v; th[2].rotation.x = -.25 - .5 * v; }
  }
  // default hand orientation: fingers follow the forearm but stay mostly level, palm down
  const _bm = new THREE.Matrix4();
  function handQFromDir(d) {
    const f = d.clone(); f.y *= .4; f.normalize(); const zh = f.clone().negate(), yh = UP.clone().addScaledVector(zh, -UP.dot(zh));
    if (yh.lengthSq() < 1e-4) yh.set(0, 0, 1); yh.normalize(); const xh = yh.clone().cross(zh); _bm.makeBasis(xh, yh, zh); return new THREE.Quaternion().setFromRotationMatrix(_bm);
  }

  // ---------------------------------------------------------------- arms (2-bone IK, long cartoon arms) ----
  function makeArm(s, side, fur, S, sx, th, sleeve) {
    const root = new THREE.Group(), hand = makeHand(S, side);
    const up = cyl(.054, .048, 1, 14, sleeve || fur, 0, 0, 0, root), fo = cyl(.04, .03, 1, 14, fur, 0, 0, 0, root);
    const elbow = sph(sleeve ? .05 : .044, fur, 0, 0, 0, root), ring = sleeve ? cyl(.062, .062, 1, 18, sleeve, 0, 0, 0, root) : null; root.add(hand);
    const a = { root, up, fo, elbow, ring, hand, s, side, pos: V(0, 0, 0), grip: 0, lockQ: null, lockW: 1, gun: false, rest: sw(s, side * .24, TY + .07, .5), shoulder: sw(s, side * (sx || .37), .7 + (th || .6) * .82, 0) };
    a.pos.copy(a.rest); a.pole = SEAT[s].right.clone().multiplyScalar(side * .8).add(V(0, -.9, 0)); return a;
  }
  function seg(mesh, A, B) { const d = B.clone().sub(A), l = d.length(); mesh.position.copy(A).addScaledVector(d, .5); mesh.quaternion.setFromUnitVectors(UP, d.normalize()); mesh.scale.set(1, Math.max(.001, l), 1); }
  function solveArm(a) {
    const L1 = .6, L2 = .6, Sh = a.shoulder, T = a.pos, dv = T.clone().sub(Sh), d = clamp(dv.length(), .05, L1 + L2 - .01), dir = dv.normalize();
    const al = (L1 * L1 - L2 * L2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, L1 * L1 - al * al)), perp = a.pole.clone().sub(dir.clone().multiplyScalar(a.pole.dot(dir))).normalize();
    const E = Sh.clone().addScaledVector(dir, al).addScaledVector(perp, h), Tc = Sh.clone().addScaledVector(dir, d); seg(a.up, Sh, E); seg(a.fo, E, Tc); a.elbow.position.copy(E);
    if (a.ring) { const ud = E.clone().sub(Sh).normalize(); seg(a.ring, E.clone().addScaledVector(ud, -.075), E.clone().addScaledVector(ud, .004)); }
    a.hand.position.copy(Tc); const q = handQFromDir(Tc.clone().sub(E).normalize()); if (a.lockQ) q.slerp(a.lockQ, a.lockW); a.hand.quaternion.copy(q);
    setGrip(a.hand, a.grip, a.point, a.gun);
  }
  const moveHand = (arm, dest, ms, ease) => { const a = arm.pos.clone(), b = dest.clone(); return tween(ms, u => arm.pos.lerpVectors(a, b, u), ease); };
  const gripTo = (arm, v, ms) => { const a = arm.grip; return tween(ms, u => { arm.grip = a + (v - a) * u; }, lin); };
  // the bartender's hat in the seat colour, riding on the animal's head (head space: radius headR, scaled with the head)
  function addHat(p, col) {
    const h = p.head, R0 = headR[p.char], m = M(col), band = M('#2a1a14');
    mk(new THREE.SphereGeometry(R0 * 1.0, 22, 10, 0, Math.PI * 2, 0, Math.PI / 2), m, 0, R0 * .4, -R0 * .04, h);
    const brim = cyl(R0 * 1.85, R0 * 1.85, .014, 28, m, 0, R0 * .5, -R0 * .1, h); brim.rotation.x = -.14;
    cyl(R0 * 1.02, R0 * 1.02, R0 * .2, 24, band, 0, R0 * .5, -R0 * .04, h, false);
  }

  // ---------------------------------------------------------------- the revolver ----
  // It lies on its side. To shoot, it slides to the shooter, the right hand wraps the grip, the gun swings up: the muzzle goes against the shooter's own head (self) or the gun points across the table at the opponent.
  const GS = 1.3, MUZ = V(0, .03, .235), GRIPC = V(0, -.075, -.085), HOLD_OFF = V(-.0505, 0, -.071);
  const GTILT = new THREE.Quaternion().setFromEuler(new THREE.Euler(-.35, 0, 0));
  const HOLD_Q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(V(0, -1, 0), V(-1, 0, 0), V(0, 0, -1)));
  const rotQ = (ax, a) => new THREE.Quaternion().setFromAxisAngle(ax, a);
  function makeGun() {
    const g = new THREE.Group(), steel = M('#b9c8ce'), dark = M('#4a5f6a');
    box(.034, .06, .17, steel, 0, -.01, -.01, g); const bar = cyl(.014, .014, .22, 14, steel, 0, .03, .12, g); bar.rotation.x = Math.PI / 2; box(.01, .016, .012, M('#ff6a4d'), 0, .05, .22, g, false);
    const drum = new THREE.Group(); g.add(drum); const dr = cyl(.047, .047, .075, 18, dark, 0, 0, 0, drum); dr.rotation.x = Math.PI / 2; const marks = new THREE.Group(); drum.add(marks);
    const gp = box(.03, .095, .045, M('#8a4f2a'), 0, -.075, -.085, g); gp.rotation.x = -.35; const hm = box(.012, .034, .016, steel, 0, .04, -.09, g); hm.rotation.x = .5;
    const flash = new THREE.Mesh(new THREE.SphereGeometry(.075, 12, 9), new THREE.MeshBasicMaterial({ color: 0xffd36a, transparent: true, opacity: .95, depthWrite: false })); flash.position.set(0, MUZ.y, MUZ.z + .01); flash.visible = false; g.add(flash);
    g.userData = { flash, drum, marks, held: null, kick: 0, n: 0, rest: { pos: V(0, 0, 0), q: new THREE.Quaternion() } }; g.scale.setScalar(GS); return g;
  }
  const restPose = s => ({ pos: sw(s, .3, TY + .066, .66), q: poseQ(s, 0, Math.PI, 0).multiply(rotQ(V(0, 0, 1), -Math.PI / 2)) });
  function gunRest(s, center) { const u = gunObj.userData, r = restPose(s || 0); if (center) { r.pos.set(0, TY + .066, .02); r.q.premultiply(rotQ(UP, Math.PI / 2 + .25)); } u.rest.pos.copy(r.pos); u.rest.q.copy(r.q); gunObj.position.copy(u.rest.pos); gunObj.quaternion.copy(u.rest.q); u.held = null; if (aimMode) gunObj.position.y += .05; }
  // where the wrist and the hand's orientation must be for a gun at (pos, q)
  function holdPose(pos, q) { const off = GRIPC.clone().multiplyScalar(GS).add(HOLD_OFF.clone().applyQuaternion(GTILT)).applyQuaternion(q); return { w: pos.clone().add(off), q: q.clone().multiply(GTILT).multiply(HOLD_Q) }; }
  const AIM = { def: [.82, .06, .5], dog: [.55, .06, .8], fox: [.76, .06, .62], hawk: [.72, .05, .68], goat: [.72, .06, .66] }, aray = new THREE.Raycaster(), _lm = new THREE.Matrix4();
  function aimPose(p) {
    const P = players[p], S = SEAT[p], t = AIM[P.char] || AIM.def; P.head.updateWorldMatrix(true, true); const C = P.head.getWorldPosition(V(0, 0, 0)); C.y += headR[P.char] * SP[P.char].head * .32;   // aim at forehead height
    const D = S.right.clone().multiplyScalar(t[0]).addScaledVector(UP, t[1]).addScaledVector(S.dir, t[2]).normalize();
    aray.set(C.clone().addScaledVector(D, 1.4), D.clone().negate()); aray.far = 2.2; const hit = aray.intersectObjects(P.hmeshes, false)[0];
    const H = hit ? hit.point.clone() : C.clone().addScaledVector(D, headR[P.char] * SP[P.char].head), M0 = H.addScaledVector(D, .012), f = D.clone().negate();
    _lm.lookAt(f, V(0, 0, 0), UP); const q = new THREE.Quaternion().setFromRotationMatrix(_lm), pos = M0.sub(MUZ.clone().multiplyScalar(GS).applyQuaternion(q));
    return { pos, q, dir: f };
  }
  // pointing at the other player: the gun is held in front of the shooter's shoulder and aimed at the target's head
  function oppPose(by, at) {
    const arm = players[by].arms[0], P = players[at], S = SEAT[by]; P.head.updateWorldMatrix(true, true); const C = P.head.getWorldPosition(V(0, 0, 0));
    const gp = arm.shoulder.clone().addScaledVector(S.dir, .62).addScaledVector(S.right, -.14); gp.y = arm.shoulder.y - .03; const f = C.clone().sub(gp).normalize();
    _lm.lookAt(f, V(0, 0, 0), UP); return { pos: gp, q: new THREE.Quaternion().setFromRotationMatrix(_lm), dir: f };
  }
  function placeGun() {
    const g = gunObj, u = g.userData, h = u.held; if (!h) return; const ap = h.frozen || h.pose(), k = eio(clamp(h.k, 0, 1)), arc = Math.sin(Math.PI * k), S = SEAT[h.by];
    g.position.lerpVectors(u.rest.pos, ap.pos, k).addScaledVector(S.right, arc * .1).addScaledVector(UP, arc * .12); g.quaternion.slerpQuaternions(u.rest.q, ap.q, k);
    if (h.kick) { g.position.addScaledVector(ap.dir, -h.kick * .05); g.quaternion.multiply(rotQ(V(1, 0, 0), -h.kick * .4)); }
    const hp = holdPose(g.position, g.quaternion); h.hand.pos.copy(hp.w); h.hand.lockQ = hp.q;
  }
  async function passGun1(p) {      // slide the gun across the table to whoever has to shoot
    if (!ok || !gunObj || gunObj.userData.held) return; const g = gunObj, t = restPose(p), a0 = g.position.clone(), q0 = g.quaternion.clone();
    if (a0.distanceTo(t.pos) > .05) { Snd.play('card'); await tween(650, e => { g.position.lerpVectors(a0, t.pos, e); g.position.y += Math.sin(Math.PI * e) * .09; g.quaternion.slerpQuaternions(q0, t.q, e); }, eio); }
    gunRest(p);
  }

  // ---- on-table live/blank sign, cuffs on the table edge, blood on the table ----
  let cntSig = '', cntCtx, cntTex, cntGroup;
  function makeCounter() {
    const c = document.createElement('canvas'); c.width = 512; c.height = 256; cntCtx = c.getContext('2d'); cntTex = new THREE.CanvasTexture(c); cntTex.colorSpace = THREE.SRGBColorSpace; cntTex.anisotropy = 4;
    const mat = new THREE.MeshBasicMaterial({ map: cntTex, transparent: true, opacity: .93, depthWrite: false }); cntGroup = new THREE.Group(); cntGroup.position.set(-.3, TY + .007, 0);
    [0, 1].forEach(d => { const gr = new THREE.Group(); gr.rotation.y = d ? Math.PI : 0; const pl = new THREE.Mesh(new THREE.PlaneGeometry(.3, .15), mat); pl.rotation.x = -Math.PI / 2; pl.position.set(0, 0, .39); pl.renderOrder = 2; gr.add(pl); cntGroup.add(gr); });
    scene.add(cntGroup); setCounter(0, 0, true);
  }
  function setCounter(l, b, force) {
    const sig = l + '|' + b; if (!cntCtx || (sig === cntSig && !force)) return; cntSig = sig; const g = cntCtx;
    g.clearRect(0, 0, 512, 256); g.fillStyle = '#0c2630'; g.fillRect(0, 0, 512, 256); g.strokeStyle = '#e0b04a'; g.lineWidth = 8; g.strokeRect(8, 8, 496, 240);
    g.font = '900 96px Impact, "Arial Black", sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'left';
    g.fillStyle = '#ff4d6d'; g.fillText(l + ' LIVE', 36, 92); g.fillStyle = '#6cc4f5'; g.fillText(b + ' BLANK', 36, 188);
    cntTex.needsUpdate = true; if (cntGroup && !force) { tween(260, u => { cntGroup.scale.setScalar(1 + Math.sin(u * Math.PI) * .12); }, lin); }
  }
  const cuffSpot = t => sw(t, .2, TY + .018, .56);
  function placeCuffs(t, anim) {
    if (cuffMeshes[t]) return; const m = inkAll(ITEMB.cuffs(), 1.12); m.scale.setScalar(1.7); m.position.copy(cuffSpot(t)); m.rotation.y = t ? Math.PI : 0; scene.add(m); cuffMeshes[t] = m;
    if (anim) { m.scale.setScalar(2.4); tween(160, u => { m.scale.setScalar(2.4 - .7 * u); }, eo); cine.shake = Math.max(cine.shake, .5); cineTo('shake', 0, 260); }
  }
  function dropCuffs(t) { const m = cuffMeshes[t]; if (!m) return; cuffMeshes[t] = null; const y0 = m.position.y; tween(380, u => { m.position.y = y0 - u * .35; m.rotation.z = u * 1.2; m.scale.setScalar(1.7 * (1 - u * .6)); }, eio).then(() => scene.remove(m)); }
  async function slideCuffs(by, r, arm) {
    const t = 1 - by, g = r.group; await moveHand(arm, wristFor(by, sw(by, 0, TY + .14, .7)), 380); await gripTo(arm, 0, 90); r.attached = null;
    const a = g.position.clone(), b = cuffSpot(t).clone(); await tween(520, u => { g.position.lerpVectors(a, b, u); g.position.y = TY + .012 + Math.sin(u * Math.PI) * .05; g.rotation.y += .2 * (1 - u); }, eio);
    removeItem(r.id); placeCuffs(t, true); await wait(180);
  }
  // ---- items ----
  const AMB = '#ffb547', GOLD = '#f0b43c', STEEL = '#8aa0aa';
  const lathe = (pts, m, seg) => { const o = new THREE.Mesh(new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), seg || 8), m); o.castShadow = true; return o; };
  const glassM = () => M('#dff6fa', { transparent: true, opacity: .38 });
  const ITEMB = {
    loupe() { const g = new THREE.Group(); const r = new THREE.Mesh(new THREE.TorusGeometry(.035, .007, 5, 12), M(GOLD, { metalness: .5 })); r.position.y = .02; r.rotation.x = Math.PI / 2; r.castShadow = true; g.add(r); const l = cyl(.032, .032, .004, 12, glassM(), 0, .02, 0, g); const h = cyl(.008, .009, .075, 6, M('#8a4b2a'), 0, .012, .085, g); h.rotation.x = Math.PI / 2; g.position.y = 0; return g; },
    phone() { const g = new THREE.Group(); box(.12, .034, .09, M('#2f9e8f'), 0, .017, 0, g); box(.13, .022, .03, M('#ff6a4d'), 0, .05, 0, g); box(.03, .03, .035, M('#c9432b'), -.055, .04, 0, g); box(.03, .03, .035, M('#c9432b'), .055, .04, 0, g); cyl(.022, .022, .006, 10, M('#eaf7f8'), 0, .037, .026, g); return g; },
    beer() { const g = new THREE.Group(); cyl(.036, .032, .085, 9, M(AMB, { emissive: AMB, emissiveIntensity: .15 }), 0, .045, 0, g); cyl(.039, .037, .022, 9, M('#fff7e6'), 0, .097, 0, g); const h = new THREE.Mesh(new THREE.TorusGeometry(.022, .006, 5, 8), M('#e8d8b0')); h.position.set(.045, .045, 0); h.castShadow = true; g.add(h); return g; },
    lemon() { const g = new THREE.Group(); const l = new THREE.Mesh(new THREE.SphereGeometry(.04, 7, 5), M('#ffd84a')); l.scale.set(1.25, .9, 1); l.position.y = .036; l.castShadow = true; g.add(l); cyl(.006, .01, .014, 5, M('#7bd88f'), .05, .04, 0, g).rotation.z = 1.2; return g; },
    cuffs() { const g = new THREE.Group(), st = M('#c8d0d6', { metalness: .6, roughness: .35 }); [-1, 1].forEach(d => { const r = new THREE.Mesh(new THREE.TorusGeometry(.027, .0075, 5, 10), st); r.rotation.x = Math.PI / 2; r.position.set(d * .042, .012, 0); r.castShadow = true; g.add(r); box(.018, .02, .014, M('#8a949c'), d * .042, .014, .03, g); }); for (let k = -1; k <= 1; k++) box(.014, .006, .008, st, k * .012, .008, 0, g); return g; },
    spin() { const g = new THREE.Group(); cyl(.042, .042, .02, 9, M(STEEL, { metalness: .5 }), 0, .01, 0, g); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; cyl(.008, .008, .012, 6, M(GOLD), Math.sin(a) * .026, .024, Math.cos(a) * .026, g); } cyl(.01, .01, .02, 6, M('#ff6a4d'), 0, .028, 0, g); return g; },
    coin() { const g = new THREE.Group(); cyl(.036, .036, .007, 10, M(GOLD, { metalness: .7, roughness: .3 }), 0, .005, 0, g); cyl(.026, .026, .009, 10, M('#ffd36a', { metalness: .6 }), 0, .005, 0, g); return g; },
    whisky() { const g = new THREE.Group(); g.add(lathe([[.028, 0], [.03, .01], [.037, .09]], glassM(), 9)); cyl(.03, .027, .05, 9, M('#e8902a', { emissive: '#e8902a', emissiveIntensity: .25 }), 0, .03, 0, g); box(.022, .022, .022, M('#fff', { transparent: true, opacity: .7 }), .006, .06, 0, g).rotation.y = .6; return g; },
    tray() { const g = new THREE.Group(); cyl(.062, .062, .012, 8, M('#7e4526'), 0, .006, 0, g); cyl(.05, .05, .006, 8, M('#b87142'), 0, .013, 0, g); return g; }
  };
  function addItem(it, slotIdx, drop) {
    const g = inkAll(ITEMB[it.k](), 1.12); g.userData = { itemId: it.id, kind: it.k }; g.traverse(o => { o.userData.itemId = it.id; });
    const p = SLOTS[slotIdx].clone(); g.position.copy(p); g.rotation.y = (it.id * 1.7) % 6.28; scene.add(g);
    const rec = { id: it.id, kind: it.k, group: g, slot: slotIdx, base: p, attached: null, loff: V(0, -.05, -.05), lift: 0, alive: true };
    items.set(it.id, rec);
    if (drop) { g.position.y = p.y + .6; g.scale.setScalar(.7); tween(520, u => { g.position.y = p.y + .6 * (1 - u); g.scale.setScalar(.7 + .3 * u); }, ebo); }
    return rec;
  }
  function removeItem(id) { const r = items.get(id); if (!r) return; r.alive = false; scene.remove(r.group); items.delete(id); if (selId === id) { selId = null; selRing.visible = false; } }

  // blood: droplets spray from the head onto the table and linger as stains
  const splatTex = (() => { let tx; return () => { if (tx) return tx; const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#9b1530'; for (let i = 0; i < 9; i++) { const a = Math.random() * 6.28, d = 6 + Math.random() * 14, r = 3 + Math.random() * 7; g.beginPath(); g.arc(32 + Math.cos(a) * d, 32 + Math.sin(a) * d, r, 0, 6.28); g.fill(); } g.beginPath(); g.arc(32, 32, 11, 0, 6.28); g.fill(); tx = new THREE.CanvasTexture(c); return tx; }; })();
  function bloodTable(at) {
    if (!ok || !players[at]) return; const head = players[at].head.getWorldPosition(V(0, 0, 0)), S = SEAT[at];
    for (let i = 0; i < 16; i++) {
      const r = (Math.random() - .5) * 1.4, up = .4 + Math.random() * 1.1, f = .9 + Math.random() * 1.6;
      const d = new THREE.Mesh(new THREE.BoxGeometry(.012, .012, .012), new THREE.MeshBasicMaterial({ color: 0xa01632 })); d.position.copy(head).add(V(0, -.05, 0)); scene.add(d);
      fxs.push({ k: 'drop', m: d, v: S.right.clone().multiplyScalar(r).addScaledVector(S.dir, f).add(V(0, up, 0)), big: Math.random() });
    }
  }
  function stainAt(x, z, big) {
    const sz = .05 + big * .13, m = new THREE.Mesh(new THREE.PlaneGeometry(sz, sz), new THREE.MeshBasicMaterial({ map: splatTex(), transparent: true, depthWrite: false, opacity: .92, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.rotation.x = -Math.PI / 2; m.rotation.z = Math.random() * 6.28; m.position.set(x, TY + .007 + Math.random() * .002, z); m.scale.setScalar(.3); scene.add(m); fxs.push({ k: 'stain', m, t: 0, life: 5.5 + Math.random() * 2.5 });
  }
  function stepFx(dt) {
    for (let i = fxs.length - 1; i >= 0; i--) {
      const f = fxs[i];
      if (f.k === 'drop') { f.v.y -= 6.5 * dt; f.m.position.addScaledVector(f.v, dt); const p = f.m.position; if (p.y <= TY + .008) { scene.remove(f.m); if (Math.abs(p.x) < .83 && Math.abs(p.z) < .5) stainAt(p.x, p.z, f.big); fxs.splice(i, 1); } else if (p.y < 0) { scene.remove(f.m); fxs.splice(i, 1); } }
      else { f.t += dt; const m = f.m; m.scale.setScalar(f.t < .15 ? .3 + f.t / .15 * .7 : 1); const fade = f.life - 2.4; if (f.t > fade) m.material.opacity = Math.max(0, .92 * (1 - (f.t - fade) / 2.4)); if (f.t >= f.life) { scene.remove(m); m.material.dispose(); fxs.splice(i, 1); } }
    }
  }
  function live(m, e) {
    if (!ok) return; setCounter(m.pub.l, m.pub.b);
    if (e && e.blocked && shieldMeshes[e.at]) { const sm = shieldMeshes[e.at]; shieldMeshes[e.at] = null; tween(320, u => { sm.scale.setScalar(2.2 * (1 + u * .5)); sm.position.y += .004; sm.rotation.z += .2; }, lin).then(() => scene.remove(sm)); }
    if (e && e.k === 'L' && !e.blocked) bloodTable(e.at);
  }

  // ---------------------------------------------------------------- sync with a game state ----
  function drumMarks(g, viewSeat) {
    const u = gunObj.userData, nn = g.n, spent = g.spent.length, sig = nn + '|' + g.spent.join('') + '|' + g.ch.map(c => c.s[viewSeat] ? c.k : '-').join('') + '|' + viewSeat;
    if (sig === drumSig) return; drumSig = sig;
    while (u.marks.children.length) { const c = u.marks.children.pop(); c.geometry.dispose(); }
    for (let j = 0; j < nn; j++) {
      const a = j * Math.PI * 2 / nn; let col = '#e0b04a', em = 0, sc = 1;
      if (j < spent) { col = g.spent[j] === 'L' ? '#7a2b3a' : '#2f6f88'; sc = .6; } else { const c = g.ch[j - spent]; if (c && c.s[viewSeat]) { col = c.k === 'L' ? '#ff4d6d' : '#6cc4f5'; em = .9; } }
      const m = cyl(.0125 * sc, .0125 * sc, .01, 8, M(col, em ? { emissive: col, emissiveIntensity: em } : {}), Math.sin(a) * .028, Math.cos(a) * .028, -.04, u.marks, false); m.rotation.x = Math.PI / 2;
    }
  }
  function sync(g, opt) {
    if (!ok || !gunObj) return; game = g; const vs = (opt && opt.seat != null) ? opt.seat : view.seat; const instant = !!(opt && opt.instant);
    const ids = new Set(g.table.map(i => i.id));
    [...items.keys()].forEach(id => { if (!ids.has(id) && !(items.get(id).attached)) removeItem(id); });
    g.table.forEach(it => { if (!items.has(it.id)) { const used = new Set([...items.values()].map(r => r.slot)); let k = 0; while (used.has(k)) k++; addItem(it, Math.min(k, 7), !instant); } });
    drumMarks(g, vs); const step = Math.PI * 2 / g.n, target = g.spent.length * step, d = gunObj.userData.drum;
    if (gunObj.userData.n !== g.n || instant) { d.rotation.z = target; } else if (Math.abs(d.rotation.z - target) > .001) { const a = d.rotation.z; tween(420, u => { d.rotation.z = a + (target - a) * u; }, ebo); }
    gunObj.userData.n = g.n;
    [0, 1].forEach(s => { const has = g.shield[s]; if (has && !shieldMeshes[s]) { const m = inkAll(ITEMB.tray(), 1.1); m.scale.setScalar(2.2); m.position.copy(sw(s, 0, TY + .14, .72)); m.rotation.x = Math.PI / 2; m.rotation.y = s ? Math.PI : 0; scene.add(m); shieldMeshes[s] = m; } else if (!has && shieldMeshes[s]) { scene.remove(shieldMeshes[s]); shieldMeshes[s] = null; } });
    setCounter(g.pub.l, g.pub.b); [0, 1].forEach(t => { if (g.skip[t] && !cuffMeshes[t]) placeCuffs(t, false); else if (!g.skip[t] && cuffMeshes[t]) dropCuffs(t); });
    [0, 1].forEach(s => { const P = players[s]; if (P && P.dead && g.hp[s] > 0 && g.phase !== 'between') revive(s, true); });
    if (!(opt && opt.keepSel)) { if (selId != null && !items.has(selId)) setSelected(null); }
  }

  // ---------------------------------------------------------------- views + cinematic camera ----
  function setView(v) {
    if (v === 'side') { view.mode = 'side'; } else { view.mode = 'pov'; view.seat = v; }
    players.forEach((p, i) => { if (!p) return; const hide = view.mode === 'pov' && i === view.seat; p.body.visible = !hide; });
  }
  const setExpr = (s, e) => { if (ok && players[s]) { players[s].expr = e; setFaceTex(players[s], e); } };
  function camTarget() {
    if (view.mode === 'side') { const t = performance.now() / 1000; return { pos: V(2.35 + Math.sin(t * .15) * .06, 1.75, .45), look: V(0, .98, -.05), fov: 46 }; }
    const s = view.seat, p = sw(s, 0, 1.5, .04), l = sw(s, 0, 1.3, 1.15); return { pos: p, look: l, fov: 68 };
  }
  function updateCamera(dt, t) {
    const T = camTarget(), k = 1 - Math.exp(-dt * 3.2);
    const pos = T.pos.clone(), look = T.look.clone();
    if (view.mode === 'pov') {                                   // breathing + mouse parallax + cinematic dolly
      const s = view.seat, fw = look.clone().sub(pos).normalize(); pos.addScaledVector(fw, cine.dolly); pos.y += Math.sin(t * 1.3) * .004 - cine.pitch * .1;
      look.addScaledVector(SEAT[s].right, view.parX * .22).add(V(0, view.parY * .12 + Math.sin(t * .9) * .004, 0));
    }
    if (cine.k > .001) look.lerp(cine.focus, cine.k);
    camPos.lerp(pos, k); camLook.lerp(look, k); cam.position.copy(camPos);
    if (cine.shake > .001) { const a = cine.shake * .035; cam.position.add(V((Math.random() - .5) * a, (Math.random() - .5) * a, (Math.random() - .5) * a)); }
    cam.lookAt(camLook); if (cine.roll) cam.rotateZ(cine.roll);
    const f = T.fov + cine.fov; if (Math.abs(cam.fov - f) > .01) { cam.fov += (f - cam.fov) * k; cam.updateProjectionMatrix(); }
  }
  function focusOn(pt, k, fov, dolly) { cine.focus.copy(pt); cineTo('k', k, 500); cineTo('fov', -fov, 600); cineTo('dolly', dolly || 0, 600); document.body.classList.add('cine'); }
  function unfocus() { cineTo('k', 0, 700); cineTo('fov', 0, 700); cineTo('dolly', 0, 700); document.body.classList.remove('cine'); }

  // ---------------------------------------------------------------- the shot ----
  const headPos = s => { players[s].head.updateWorldMatrix(true, true); return players[s].head.getWorldPosition(V(0, 0, 0)); };
  async function gunAim(by, at) {
    if (!ok || !players[by] || !players[at]) return; const P = players[by], arm = P.arms[0], u = gunObj.userData, self = by === at; curShot = { by, at };
    await passGun1(by);
    const hp = holdPose(u.rest.pos, u.rest.q); arm.lockQ = hp.q; arm.lockW = 0; arm.gun = true;
    await Promise.all([moveHand(arm, hp.w.clone().add(V(0, .15, 0)), 380), tween(380, e => { arm.lockW = e; }, lin)]);
    await moveHand(arm, hp.w, 140); await gripTo(arm, 1, 150);
    u.held = { hand: arm, by, at, k: 0, kick: 0, frozen: null, pose: () => self ? aimPose(by) : oppPose(by, at) }; Snd.play('select');
    if (self) focusOn(headPos(by).add(V(0, .05, 0)), view.mode === 'pov' && view.seat === by ? .35 : .6, 12, .25);
    else if (view.mode === 'pov' && view.seat === at) focusOn(gunObj.position.clone().add(V(0, .08, 0)), .55, 8, .15);
    else focusOn(headPos(at).add(V(0, .05, 0)), .5, 10, .2);
    if (!self) players[at].look = sw(by, 0, 1.3, .1);
    await tween(760, e => { u.held.k = e; }, lin);                    // swing the gun up; the muzzle ends on the head's surface / points at the target
  }
  async function gunSuspense(ms) { if (!ok) return; const a = lampSpot.intensity; await tween(ms, u => { lampSpot.intensity = a * (1 - .3 * Math.sin(u * Math.PI)); cine.shake = .12 * Math.sin(u * Math.PI); }, lin); cine.shake = 0; lampSpot.intensity = lampBase; }
  async function gunFire(by, at, kind, blocked) {
    if (!ok) return; const u = gunObj.userData, h = u.held; if (!h) return; h.frozen = h.pose();
    if (kind === 'L') {
      u.flash.visible = true; flashLight.position.copy(gunObj.position).addScaledVector(h.frozen.dir, .25); flashLight.intensity = 60; cine.shake = 1.2; cineTo('shake', 0, 600);
      if (view.mode === 'pov' && view.seat === at && !blocked && at !== by) { cine.pitch = .6; cineTo('pitch', 0, 1200); cine.roll = .05; cineTo('roll', 0, 1100); }
      tween(120, e => { h.kick = e; }, eo).then(() => tween(300, e => { h.kick = 1 - e; }, eo)); tween(160, e => { flashLight.intensity = 60 * (1 - e); }, lin).then(() => { u.flash.visible = false; flashLight.intensity = 0; });
      if (!blocked) { bloodTable(at); reactHit(at); }
      await wait(520);
    } else { tween(90, e => { h.kick = e * .15; }, lin).then(() => tween(200, e => { h.kick = .15 * (1 - e); }, eo)); await wait(300); }
  }
  async function reactHit(s) { const p = players[s]; if (!p || p.dead) return; await tween(150, u => { p.hit = u; }, eo); await tween(900, u => { p.hit = 1 - u; }, eio); }
  async function gunPut(by) {
    if (!ok) return; const u = gunObj.userData, h = u.held; if (!h) { unfocus(); return; } const arm = h.hand;
    await tween(650, e => { h.k = 1 - e; }, lin);
    await gripTo(arm, 0, 140); u.held = null; gunRest(by);
    await Promise.all([moveHand(arm, arm.rest, 420), tween(420, e => { arm.lockW = 1 - e; }, lin)]); arm.lockQ = null; arm.gun = false;
    unfocus(); if (curShot && players[curShot.at]) players[curShot.at].look = null; curShot = null;
  }
  // the loser of a round falls back off the chair; the next round everybody sits up again
  async function die(s) {
    if (!ok || !players[s] || players[s].dead) return; const P = players[s]; P.busy = true; setExpr(s, 'dead');
    await tween(900, e => { P.body.rotation.x = -1.25 * e; P.body.position.y = .7 - .25 * e; }, eio); P.dead = true; P.busy = false; P.arms.forEach(a => { a.root.visible = false; });
  }
  async function revive(s, instant) {
    if (!ok || !players[s]) return; const P = players[s]; if (!P.dead) return; P.dead = false; P.arms.forEach(a => { a.root.visible = true; }); setExpr(s, 'neutral');
    if (instant) { P.body.rotation.x = 0; P.body.position.y = .7; return; }
    P.busy = true; await tween(500, e => { P.body.rotation.x = -1.25 * (1 - e); P.body.position.y = .45 + .25 * e; }, eio); P.busy = false;
  }

  // ---------------------------------------------------------------- items in hand ----
  const wristFor = (by, palm) => palm.clone().addScaledVector(SEAT[by].dir, -.05);       // the wrist sits a little behind the palm
  async function useItem(by, kind, id) {
    if (!ok) return; const r = items.get(id); const P = players[by]; if (!r || !P) { await wait(500); return; }
    const side = (r.group.position.clone().sub(SEAT[by].pos).dot(SEAT[by].right)) >= 0 ? 0 : 1, arm = P.arms[side], ip = r.group.position.clone();
    await moveHand(arm, wristFor(by, ip.clone().add(V(0, .12, 0))), 400); await moveHand(arm, wristFor(by, ip.clone().add(V(0, .06, 0))), 150); await gripTo(arm, .8, 110);
    r.attached = arm; r.lift = 0;
    const hold = { loupe: sw(by, .06, 1.26, .42), phone: sw(by, side ? -.2 : .2, 1.28, .16), beer: sw(by, 0, 1.18, .3), whisky: sw(by, 0, 1.18, .3), lemon: sw(by, 0, 1.12, .38), cuffs: sw(by, 0, 1.0, .6), coin: sw(by, 0, 1.0, .5), spin: sw(by, 0, .96, .6), tray: sw(by, 0, .92, .68) }[kind] || sw(by, 0, 1.05, .5);
    await moveHand(arm, hold, 520); const g = r.group, fz = by ? 1 : -1;
    if (kind === 'beer' || kind === 'whisky') { await tween(520, u => { g.rotation.x = 1.1 * u * fz; }); await wait(240); await tween(300, u => { g.rotation.x = 1.1 * (1 - u) * fz; }); }
    else if (kind === 'cuffs') { await tween(420, u => { g.rotation.z = Math.sin(u * 40) * .5 * (1 - u); }, lin); g.rotation.z = 0; await slideCuffs(by, r, arm); await gripTo(arm, 0, 120); await moveHand(arm, arm.rest, 420); return; }
    else if (kind === 'coin') { await tween(750, u => { r.lift = Math.sin(u * Math.PI) * .32; g.rotation.x = u * Math.PI * 6; }, lin); g.rotation.x = 0; r.lift = 0; }
    else if (kind === 'loupe' || kind === 'phone') { await tween(600, u => { g.rotation.y += .01; r.lift = Math.sin(u * Math.PI) * .02; }, lin); }
    else if (kind === 'spin') { await tween(600, u => { g.rotation.y += .5 * (1 - u); }, lin); }
    else { await tween(450, u => { g.rotation.y += .05; }, lin); }
    const sc = g.scale.x; await tween(260, u => { g.scale.setScalar(sc * (1 - u)); }, eo); r.attached = null; removeItem(id);
    await gripTo(arm, 0, 120); await moveHand(arm, arm.rest, 420);
  }
  const spinDrum = ms => { if (!ok) return Promise.resolve(); const d = gunObj.userData.drum, a = d.rotation.z; return tween(ms || 900, u => { d.rotation.z = a + u * Math.PI * 6; }, eo); };

  // ---------------------------------------------------------------- gestures: slam the table with both fists / point at someone ----
  async function slam(sidx) {
    if (!ok || !players[sidx]) return false; const P = players[sidx]; if (P.armLock || P.dead) return false; P.armLock = true;
    const pose = (arm, y, f) => sw(sidx, arm.side * .3, y, f);
    await Promise.all(P.arms.map(a => Promise.all([gripTo(a, 1, 160), moveHand(a, pose(a, TY + .62, .5), 280, eo)])));
    await Promise.all(P.arms.map(a => moveHand(a, pose(a, TY + .04, .62), 110, lin)));
    Snd.play('slam'); cine.shake = Math.max(cine.shake, .9); cineTo('shake', 0, 380);
    const hop = []; items.forEach(r => { if (!r.attached) hop.push([r.group, r.group.position.y]); }); tween(300, u => { hop.forEach(h => { h[0].position.y = h[1] + Math.sin(u * Math.PI) * .03; }); }, lin);
    if (!gunObj.userData.held) { const y0 = gunObj.position.y; tween(300, u => { if (!gunObj.userData.held) gunObj.position.y = y0 + Math.sin(u * Math.PI) * .025; }, lin); }
    await wait(200); await Promise.all(P.arms.map(a => Promise.all([gripTo(a, 0, 250), moveHand(a, a.rest, 340)]))); P.armLock = false; return true;
  }
  async function point(by, at) {
    if (!ok || !players[by] || !players[at] || by === at) return false; const P = players[by]; if (P.armLock || P.dead) return false; P.armLock = true; const arm = P.arms[0];
    const tgt = sw(at, 0, 1.2, 0), d = tgt.clone().sub(arm.shoulder).normalize(), dest = arm.shoulder.clone().addScaledVector(d, 1.0); dest.y = Math.max(dest.y, TY + .3);
    P.lookTo = at; arm.point = true; setExpr(by, 'smug'); await Promise.all([gripTo(arm, .85, 150), moveHand(arm, dest, 320, eo)]); const pe = players[at].expr; if (!players[at].dead) setExpr(at, 'scared');
    await wait(1100); if (!players[at].dead) setExpr(at, pe === 'scared' ? 'neutral' : pe); setExpr(by, 'neutral'); await Promise.all([gripTo(arm, 0, 200), moveHand(arm, arm.rest, 340)]); arm.point = false; P.lookTo = null; P.armLock = false; return true;
  }
  // ---------------------------------------------------------------- speech boards ----
  // A flat 2D board above the speaker's head. It follows the player's camera (so it always reads) but is blended with the way the speaker faces the table, so it keeps a slight
  // angle and sways as the camera moves. Its size follows the distance (about a quarter of the screen wide wherever the speaker sits), and it is kept inside the view:
  // an animal sitting high on the screen would push it off the top, so then it drops down and steps to the side of the head, toward the middle of the view.
  const boards = [];
  const lerpA = (a, b, k) => { const d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * k; };
  function say(s, text, name, col, ms) {
    const P = players[s]; if (!ok || !P || P.dead) return;
    for (let i = boards.length - 1; i >= 0; i--) if (boards[i].s === s) dropBoard(i);
    const W = 560, pad = 26, fs = 40, lh = 50, nf = 30, font = '"Be Vietnam Pro", system-ui, sans-serif', c = document.createElement('canvas'), x = c.getContext('2d');
    x.font = '700 ' + fs + 'px ' + font; const lines = []; let ln = '';
    String(text).split(' ').forEach(w => { const t = ln ? ln + ' ' + w : w; if (ln && x.measureText(t).width > W - pad * 2) { lines.push(ln); ln = w; } else ln = t; }); if (ln) lines.push(ln);
    const bodyH = pad + nf + 10 + lines.length * lh + pad * .5, H = Math.ceil(bodyH + 32); c.width = W; c.height = H;                  // resizing resets the context
    const rr = (a, b, w, h, r) => { x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); };
    x.lineWidth = 6; x.strokeStyle = '#2a1a14'; x.fillStyle = '#f6ead2'; rr(6, 6, W - 12, bodyH - 6, 24); x.fill(); x.stroke();
    x.beginPath(); x.moveTo(W / 2 - 24, bodyH - 2); x.lineTo(W / 2, H - 4); x.lineTo(W / 2 + 24, bodyH - 2); x.closePath(); x.fill(); x.stroke(); x.fillRect(W / 2 - 20, bodyH - 9, 40, 10);   // tail toward the head
    x.textAlign = 'left'; x.textBaseline = 'top'; x.font = '800 ' + nf + 'px ' + font; x.fillStyle = col || '#ffb547'; x.strokeStyle = '#2a1a14'; x.lineWidth = 5; x.strokeText(name || '', pad, pad - 2); x.fillText(name || '', pad, pad - 2);
    x.font = '700 ' + fs + 'px ' + font; x.fillStyle = '#2a1a14'; lines.forEach((l, i) => x.fillText(l, pad, pad + nf + 10 + i * lh));
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const ww = .5, wh = ww * H / W, mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(ww, wh), mat); mesh.position.y = wh / 2; mesh.renderOrder = 20;
    const grp = new THREE.Group(); grp.rotation.order = 'YXZ'; grp.add(mesh); scene.add(grp); boards.push({ s, grp, mesh, mat, tex, ww, wh, cur: null, t0: performance.now(), last: performance.now(), ms: ms || 3500 });
  }
  function dropBoard(i) { const b = boards[i]; scene.remove(b.grp); b.mesh.geometry.dispose(); b.mat.dispose(); b.tex.dispose(); boards.splice(i, 1); }
  function stepBoards(now) {
    if (!boards.length) return; cam.updateMatrixWorld(true);
    const fw = cam.getWorldDirection(V(0, 0, 0)), rt = V(1, 0, 0).applyQuaternion(cam.quaternion), upv = V(0, 1, 0).applyQuaternion(cam.quaternion), asp = cam.aspect || 1.6, th = Math.tan(cam.fov * Math.PI / 360);
    for (let i = boards.length - 1; i >= 0; i--) {
      const b = boards[i], P = players[b.s], age = now - b.t0, dt = Math.min(.1, Math.max(0, (now - b.last) / 1000)); b.last = now; if (!P || P.dead || age > b.ms) { dropBoard(i); continue; }
      const hd = P.head.getWorldPosition(V(0, 0, 0)), hr = headR[P.char] * SP[P.char].head, base = V(hd.x, hd.y + hr + .08, hd.z);
      const dep = Math.max(.5, base.clone().sub(cam.position).dot(fw)), hh = th * dep, hw = hh * asp;
      const want = Math.min(.8, .34 * Math.max(1, 1.5 / asp)), sc0 = Math.max(.35, Math.min(3, want * hw / b.ww));        // small: about a sixth of the screen width (wider on a portrait phone)
      // the board belongs to the speaker's head: it is visible only while the head is in front of the camera and on screen, otherwise it fades out and hides (it must never drift to the screen edge)
      const front = base.clone().sub(cam.position).dot(fw) > .3, ha = front ? hd.clone().project(cam) : null, seen = !!ha && Math.abs(ha.x) < 1.03 && ha.y > -1.03 && ha.y < 1.03;
      b.vis = (b.vis || 0) + ((seen ? 1 : 0) - (b.vis || 0)) * Math.min(1, dt * 9);
      if (!front) { b.cur = base.clone(); b.grp.position.copy(base); b.mat.opacity = 0; b.grp.visible = false; continue; }
      const a = base.clone().project(cam), room = .86 - a.y; let sc = sc0, bh = sc * b.wh / hh;
      if (bh > room) { sc = Math.max(.85 * sc0, sc0 * room / bh); bh = sc * b.wh / hh; }                           // little space above the head: shrink a bit, but stay right on top of the head
      const bw = sc * b.ww / hw / 2; let nx = Math.max(-.97 + bw, Math.min(.97 - bw, a.x)), ny = Math.min(a.y, .86 - bh);
      nx = a.x + Math.max(-bw * .8, Math.min(bw * .8, nx - a.x)); ny = Math.max(a.y - bh * .9, ny);                // a head near the edge may nudge it a little, never more: it stays on top of that head
      const tgt = base.clone().addScaledVector(rt, (nx - a.x) * hw).addScaledVector(upv, (ny - a.y) * hh);
      if (!b.cur || b.vis < .05) b.cur = tgt.clone(); else b.cur.lerp(tgt, 1 - Math.exp(-dt * 12)); b.grp.position.copy(b.cur);
      const toCam = Math.atan2(cam.position.x - b.cur.x, cam.position.z - b.cur.z), toMid = Math.atan2(-base.x, -base.z);
      b.grp.rotation.y = lerpA(toCam, toMid, .3); b.grp.rotation.x = -Math.min(.3, Math.max(0, (cam.position.y - b.cur.y) * .12));
      const pop = Math.min(1, age / 200), out = Math.min(1, (b.ms - age) / 350); b.mat.opacity = Math.min(pop, out) * b.vis; b.grp.visible = b.mat.opacity > .01; b.grp.scale.setScalar(sc * (.75 + .25 * pop));
    }
  }

  // ---------------------------------------------------------------- picking ----
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
  function pickAt(ev) {
    const r = canvas.getBoundingClientRect(); ptr.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ptr, cam);
    const targets = [gunObj, tableMesh, ...[...items.values()].map(i => i.group)]; players.forEach(p => { if (p && p.body.visible) targets.push(p.body); });
    const hits = ray.intersectObjects(targets, true); if (!hits.length) return { type: 'none' };
    let o = hits[0].object; while (o) { if (o.userData.itemId != null) return { type: 'item', id: o.userData.itemId }; if (o === gunObj) return { type: 'gun' }; if (o.userData.pseat != null) return { type: 'player', seat: o.userData.pseat }; if (o.userData.table) return { type: 'table' }; o = o.parent; }
    return { type: 'none' };
  }
  function setSelected(id) { selId = id; const r = items.get(id); selRing.visible = !!r; if (r) { selRing.rotation.set(-Math.PI / 2, 0, 0); selRing.position.set(r.base.x, TY + .006, r.base.z); } }
  function onMove(ev) { const r = canvas.getBoundingClientRect(); view.parX = ((ev.clientX - r.left) / r.width - .5) * 2; view.parY = -((ev.clientY - r.top) / r.height - .5) * 2; const p = pickAt(ev); canvas.style.cursor = p.type === 'item' || p.type === 'gun' || p.type === 'player' ? 'pointer' : 'default'; const nh = p.type === 'item' && !(items.get(p.id) && items.get(p.id).attached) ? p.id : null; if (nh !== hoverId) { hoverId = nh; cb.hover(nh); } hoverRing.visible = false; }
  const setAimMode = on => { aimMode = !!on; if (gunObj && !gunObj.userData.held) gunObj.position.y = gunObj.userData.rest.pos.y + (on ? .05 : 0); };

  // ---------------------------------------------------------------- frame loop ----
  function frame(now) {
    raf = requestAnimationFrame(frame); const dt = Math.min(.05, (now - lastT) / 1000 || .016); lastT = now; const t = now / 1000; stepTweens(dt); stepFx(dt);
    { const hr = hoverId != null ? items.get(hoverId) : null; if (hr) { glow.position.copy(hr.group.position).add(V(0, .035, 0)); glow.visible = true; } glowA += ((hr ? .3 + Math.sin(t * 3) * .05 : 0) - glowA) * Math.min(1, dt * 10); glow.material.opacity = glowA; if (glowA < .01 && !hr) glow.visible = false; }
    items.forEach(r => { if (r.attached) { r.attached.hand.updateWorldMatrix(true, false); r.group.position.copy(r.attached.hand.localToWorld(r.loff.clone())); r.group.position.y += r.lift; } });
    players.forEach((p, s) => { if (!p) return; const idle = Math.sin(t * 1.2 + s) * .004;
      if (!p.dead && !p.busy) { p.body.position.y = .7 + idle; p.body.rotation.x = 0; } else if (p.dead && !p.busy) { p.body.position.y = .45; p.body.rotation.x = -1.25; }
      p.torso.rotation.x = -p.hit * .18; p.head.rotation.x = -p.hit * .45 + Math.sin(t * .7 + s) * .02;
      const lk = p.lookTo != null && SEAT[p.lookTo] ? sw(p.lookTo, 0, 1.4, 0) : (p.look && p.look.lengthSq() > 0 ? p.look : sw(1 - s, 0, 1.4, 0));
      if (!p.dead) { const lp = p.head.getWorldPosition(V(0, 0, 0)), dir = lk.clone().sub(lp).applyAxisAngle(UP, SEAT[s].phi); p.head.rotation.y += (clamp(Math.atan2(-dir.x, -dir.z) * .5, -.7, .7) - p.head.rotation.y) * .05; }
    });
    if (gunObj.userData.held) placeGun();
    players.forEach(p => { if (p) p.arms.forEach((a, i) => { if (a.pos.equals(a.rest) && !a.lockQ) a.pos.y = a.rest.y + Math.sin(t * 1.2 + i) * .002; solveArm(a); }); });
    if (selRing.visible) selRing.material.opacity = .6 + Math.sin(t * 5) * .3;
    updateCamera(dt, t); stepBoards(now); renderer.render(scene, cam);
  }
  function resize() { if (!renderer) return; const w = wrap.clientWidth || innerWidth, h = wrap.clientHeight || innerHeight; renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5)); renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }

  function init(container) {
    try {
      wrap = container; canvas = document.createElement('canvas'); canvas.id = 'r3d-canvas'; wrap.appendChild(canvas);
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .95;
      scene = new THREE.Scene(); cam = new THREE.PerspectiveCamera(66, 1, .05, 30); layout(2); buildRoom();
      gunObj = makeGun(); inkAll(gunObj, 1.1); gunRest(0, true); scene.add(gunObj); makeCounter();
      canvas.addEventListener('pointermove', onMove); canvas.addEventListener('pointerleave', () => { if (hoverId != null) { hoverId = null; cb.hover(null); } }); canvas.addEventListener('pointerdown', ev => { if (ev.button !== 0) return; cb.pick(pickAt(ev), ev); });
      addEventListener('resize', resize); resize();
      document.addEventListener('visibilitychange', () => { clearInterval(hidT); if (document.hidden && running) { let l = performance.now(); hidT = setInterval(() => { const nn = performance.now(); stepTweens(Math.min(.1, (nn - l) / 1000)); l = nn; }, 50); } });
      ok = true;
    } catch (e) { console.warn('3D unavailable, using 2D', e); ok = false; lastErr = String(e && e.message || e); }
    return ok;
  }
  function setup(opts) {
    if (!ok) return; const chars = opts.chars || ['fox', 'pig'], cols = opts.cols || ['#ff6a4d', '#5eead4'];
    [0, 1].forEach(s => { if (players[s]) { scene.remove(players[s].root); players[s].arms.forEach(a => scene.remove(a.root)); } const p = makePerson(s, chars[s], cols[s]); addHat(p, cols[s]); p.body.userData.pseat = s; players[s] = p; });
    [...items.keys()].forEach(removeItem); shieldMeshes.forEach((m, i) => { if (m) scene.remove(m); shieldMeshes[i] = null; }); drumSig = ''; cntSig = ''; cuffMeshes.forEach((m, i) => { if (m) scene.remove(m); cuffMeshes[i] = null; }); fxs.forEach(f => scene.remove(f.m)); fxs = [];
    while (boards.length) dropBoard(0); gunRest(0, true); tws.length = 0; cine.dolly = cine.fov = cine.shake = cine.pitch = cine.roll = cine.k = 0; document.body.classList.remove('cine'); curShot = null; aimMode = false;
    setSign(opts.sign, opts.lang); camPos.copy(camTarget().pos); setView(opts.view);
  }
  function start() { if (!ok || running) return; running = true; resize(); lastT = performance.now(); raf = requestAnimationFrame(frame); }
  function stop() { running = false; cancelAnimationFrame(raf); clearInterval(hidT); }
  return {
    err: () => lastErr, init, setup, sync, live, start, stop, resize, setView, setSelected, setAimMode, gunAim, gunSuspense, gunFire, gunPut, useItem, spinDrum, die, revive, say, slam, point, setExpr, passGun: p => passGun1(p),
    onPick: f => { cb.pick = f; }, onHover: f => { cb.hover = f; }, isOk: () => ok,
    boardDbg: () => boards.map(b => ({ s: b.s, op: +b.mat.opacity.toFixed(3), vis: b.grp.visible })),
    itemIds: () => [...items.keys()], dbg: () => ({ gun: gunObj.position.toArray(), held: !!gunObj.userData.held, players: players.map(p => p && { dead: p.dead, char: p.char }) })
  };
})();
window.R3D = R3D;
