// rou-3d.js — first-person 3D table for Roulette (Three.js, vendored in js/lib). Exposes window.R3D; if WebGL/three is missing the 2D UI is used instead.
// Low-poly, flat-shaded, same palette as the 2D art. The UI (rou-ui.js) owns the rules/timing; this file only draws and animates:
//   sync(g)                 static state: items on the table, drum chambers, shields
//   gunAim / gunSuspense / gunFire / gunPut   the shot, played by whoever shoots (hand grabs the revolver, aims, fires, puts it back)
//   useItem(by, kind, id)   that player's hand takes the item from the table and uses it
//   setView(seat|'side')    first person of a seat (only YOUR hands are visible) or a spectator camera beside the table
import * as THREE from 'three';

const SEAT = [{ base: 1.15, sx: 1, fz: -1 }, { base: -1.15, sx: -1, fz: 1 }];
const TY = 0.78;
const UP = new THREE.Vector3(0, 1, 0);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const sw = (s, r, y, f) => V(r * SEAT[s].sx, y, SEAT[s].base + f * SEAT[s].fz);     // seat-local (right, up, forward) -> world
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const eio = u => u < .5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2, eo = u => 1 - Math.pow(1 - u, 3), lin = u => u;
const ebo = u => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2); };
const SLOTS = [-.62, -.36, .36, .62].flatMap(x => [-.22, .22].map(z => V(x, TY, z)));   // 8 table slots (shared by both players)

const R3D = (function () {
  let lastErr = '', renderer, scene, cam, wrap, canvas, running = false, ok = false, lastT = 0, raf = 0, hidT = 0;
  const mats = {}; const M = (c, o) => { const k = c + JSON.stringify(o || {}); return mats[k] || (mats[k] = new THREE.MeshStandardMaterial(Object.assign({ color: c, flatShading: true, roughness: .78, metalness: .04 }, o || {}))); };
  const box = (w, h, d, m, x, y, z, parent) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x || 0, y || 0, z || 0); o.castShadow = o.receiveShadow = true; if (parent) parent.add(o); return o; };
  const cyl = (rt, rb, h, seg, m, x, y, z, parent) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m); o.position.set(x || 0, y || 0, z || 0); o.castShadow = o.receiveShadow = true; if (parent) parent.add(o); return o; };

  // ---------------------------------------------------------------- tweens (also stepped by a timer while the tab is hidden, so awaited animations never hang) ----
  const tws = [];
  const tween = (ms, fn, ease) => new Promise(res => { tws.push({ t: 0, ms: Math.max(1, ms), fn, ease: ease || eio, res }); });
  const wait = ms => tween(ms, () => {});
  function stepTweens(dt) { for (let i = tws.length - 1; i >= 0; i--) { const w = tws[i]; w.t += dt * 1000; const u = Math.min(1, w.t / w.ms); w.fn(w.ease(u)); if (u >= 1) { tws.splice(i, 1); w.res(); } } }

  // ---------------------------------------------------------------- state ----
  const players = [null, null], items = new Map(), cine = { dolly: 0, fov: 0, shake: 0, pitch: 0, roll: 0 };
  const view = { mode: 'pov', seat: 0, parX: 0, parY: 0 }, camPos = V(0, 1.3, 1.2), camLook = V(0, .8, 0);
  let gunObj = null, tableGroup, lampSpot, flashLight, shieldMeshes = [null, null], selRing, hoverRing, selId = null, hoverId = null, aimMode = false, drumSig = '', lampBase = 17;
  const cb = { pick: () => {} }; let names = ['A', 'B'], cols = ['#ff6a4d', '#5eead4'], isBot = [false, true];

  // ---------------------------------------------------------------- builders ----
  const plank = () => {
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); g.fillStyle = '#6b3a20'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#7a4426' : '#5e3219'; g.fillRect(0, i * 32, 256, 30); g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, i * 32 + 30, 256, 2); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(5, 5); t.colorSpace = THREE.SRGBColorSpace; return t;
  };
  function neonTex() {
    const c = document.createElement('canvas'); c.width = 512; c.height = 128; const g = c.getContext('2d'); g.clearRect(0, 0, 512, 128);
    g.font = '800 78px "Sedgwick Ave Display","Baloo 2",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 6; g.strokeStyle = '#ff6a4d'; g.shadowColor = '#ff6a4d'; g.shadowBlur = 22; g.strokeText('ROULETTE', 256, 68); g.fillStyle = '#ffd2c4'; g.shadowBlur = 8; g.fillText('ROULETTE', 256, 68);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  const BOTTLE = ['#ffb547', '#5eead4', '#ff8a6a', '#6cc4f5', '#f6f0e2', '#b39bff', '#7bd88f'];
  function shelf(z, dir) {
    const g = new THREE.Group(); let s = 11 + Math.round(Math.abs(z) * 3); const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let row = 0; row < 2; row++) {
      const y = 1.05 + row * .85; box(3.6, .05, .32, M('#7e4526'), 0, y, 0, g);
      for (let i = 0; i < 17; i++) { const h = .22 + rnd() * .16, c = BOTTLE[Math.floor(rnd() * BOTTLE.length)], x = -1.7 + i * .21;
        const b = new THREE.Group(); const body = cyl(.045, .05, h, 6, M(c, { emissive: c, emissiveIntensity: .12, roughness: .4 }), 0, h / 2, 0, b); cyl(.016, .026, .1, 6, M(c, { emissive: c, emissiveIntensity: .12 }), 0, h + .04, 0, b); b.position.set(x, y + .025, 0); g.add(b); body.receiveShadow = false; }
    }
    box(3.8, 2.4, .08, M('#0f3c4a'), 0, 1.4, -.2, g); g.position.set(0, 0, z); g.rotation.y = dir > 0 ? 0 : Math.PI; return g;
  }
  function buildRoom() {
    scene.background = new THREE.Color('#071d26'); scene.fog = new THREE.Fog('#0a2530', 4.5, 11);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshStandardMaterial({ map: plank(), roughness: .9 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
    const wallM = M('#0f4352'); [[0, -4.6, 0], [0, 4.6, Math.PI], [-4.6, 0, Math.PI / 2], [4.6, 0, -Math.PI / 2]].forEach(a => { const w = new THREE.Mesh(new THREE.PlaneGeometry(10, 4), wallM); w.position.set(a[0], 2, a[1]); w.rotation.y = a[2]; if (a[0] === 0) { w.position.set(0, 2, a[1]); } else { w.position.set(a[0], 2, 0); } scene.add(w); });
    scene.add(shelf(-4.4, 1)); scene.add(shelf(4.4, -1));
    const neon = new THREE.Mesh(new THREE.PlaneGeometry(2.4, .6), new THREE.MeshBasicMaterial({ map: neonTex(), transparent: true })); neon.position.set(0, 3.3, -4.5); scene.add(neon);
    const neon2 = neon.clone(); neon2.position.set(0, 3.3, 4.5); neon2.rotation.y = Math.PI; scene.add(neon2);
    // wall facets
    [[-3.2, 1.6, -4.55, .6], [3.1, 2.4, -4.55, -.5], [-3.5, 2.6, 4.55, .5]].forEach(a => { const f = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.1), new THREE.MeshStandardMaterial({ color: '#17596b', roughness: 1, flatShading: true })); f.position.set(a[0], a[1], a[2]); f.rotation.z = a[3]; if (a[2] > 0) f.rotation.y = Math.PI; scene.add(f); });
    // lights
    scene.add(new THREE.HemisphereLight(0x5b8fa0, 0x2a1a10, .42)); scene.add(new THREE.AmbientLight(0x30505a, .3));
    lampSpot = new THREE.SpotLight(0xffc27a, lampBase, 9, .95, .7, 1.6); lampSpot.position.set(0, 2.7, 0); lampSpot.target.position.set(0, TY, 0); lampSpot.castShadow = true; lampSpot.shadow.mapSize.set(1024, 1024); lampSpot.shadow.bias = -.0004; scene.add(lampSpot, lampSpot.target);
    flashLight = new THREE.PointLight(0xffd27a, 0, 4, 2); scene.add(flashLight);
    [[-2.2, 1.6, -3.9], [2.2, 1.6, -3.9], [-2.2, 1.6, 3.9], [2.2, 1.6, 3.9]].forEach(p => { const l = new THREE.PointLight(0xffa860, 1.4, 5, 2); l.position.set(...p); scene.add(l); });
    // pendant lamp + fake light shaft
    const lamp = new THREE.Group(); cyl(.01, .01, 1.2, 4, M('#2a4350'), 0, .7, 0, lamp); const shade = cyl(.1, .38, .26, 8, M('#ffb547', { emissive: '#ffb547', emissiveIntensity: .8 }), 0, 0, 0, lamp); shade.castShadow = false; lamp.position.set(0, 2.9, 0); scene.add(lamp);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(.3, 1.05, 2.1, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0xffc070, transparent: true, opacity: .06, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); shaft.position.set(0, 1.85, 0); scene.add(shaft);
    // table + chairs
    tableGroup = new THREE.Group(); scene.add(tableGroup);
    box(1.75, .07, 1.1, M('#85502d'), 0, TY - .035, 0, tableGroup); box(1.78, .03, 1.13, M('#5c311a'), 0, TY - .085, 0, tableGroup);
    const mat = box(1.4, .004, .86, M('#14414f', { roughness: 1 }), 0, TY + .002, 0, tableGroup); mat.castShadow = false;
    [[-.8, -.5], [.8, -.5], [-.8, .5], [.8, .5]].forEach(p => box(.07, TY - .07, .07, M('#7e4526'), p[0], (TY - .07) / 2, p[1], tableGroup));
    [0, 1].forEach(s => { const c = new THREE.Group(); box(.5, .05, .46, M('#7e4526'), 0, .45, 0, c); box(.5, .55, .05, M('#7e4526'), 0, .75, .22, c); [[-.2, -.18], [.2, -.18], [-.2, .18], [.2, .18]].forEach(p => box(.04, .45, .04, M('#5c311a'), p[0], .22, p[1], c)); const w = sw(s, 0, 0, -.2); c.position.copy(w); c.rotation.y = s ? Math.PI : 0; scene.add(c); });
    selRing = new THREE.Mesh(new THREE.RingGeometry(.062, .08, 14), new THREE.MeshBasicMaterial({ color: 0xffb547, transparent: true, opacity: .9, side: THREE.DoubleSide, depthWrite: false })); selRing.rotation.x = -Math.PI / 2; selRing.visible = false; scene.add(selRing);
    hoverRing = new THREE.Mesh(new THREE.RingGeometry(.062, .075, 14), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .55, side: THREE.DoubleSide, depthWrite: false })); hoverRing.rotation.x = -Math.PI / 2; hoverRing.visible = false; scene.add(hoverRing);
  }

  // ---- hands / arms ----
  function makeHand(skin) {
    const g = new THREE.Group(), m = M(skin);
    box(.085, .03, .09, m, 0, 0, 0, g);
    const fingers = []; for (let i = 0; i < 4; i++) { const p = new THREE.Group(); p.position.set(-.03 + i * .02, 0, -.045); box(.017, .017, .06, m, 0, 0, -.03, p); g.add(p); fingers.push(p); }
    const th = new THREE.Group(); th.position.set(.045, 0, -.01); box(.02, .02, .05, m, 0, 0, -.025, th); th.rotation.y = .5; g.add(th);
    box(.095, .05, .035, M('#f6f0e2'), 0, 0, .06, g);
    g.userData.fingers = fingers; g.userData.thumb = th; return g;
  }
  const setGrip = (h, v) => { h.userData.fingers.forEach(f => { f.rotation.x = -1.35 * v; }); h.userData.thumb.rotation.y = .5 - .6 * v; };
  function makeArm(s, side, sleeveC) {
    const root = new THREE.Group(), sl = M(sleeveC), hand = makeHand('#f3c9a0');
    const up = cyl(.045, .04, 1, 6, sl, 0, 0, 0, root), fo = cyl(.04, .032, 1, 6, sl, 0, 0, 0, root); root.add(hand);
    const arm = { root, up, fo, hand, s, side, pos: V(0, 0, 0), grip: 0, rest: V(0, 0, 0), lockQ: null, shoulder: sw(s, side * .26, 1.22, 0) };
    arm.rest = sw(s, side * .2, TY + .07, .52); arm.pos.copy(arm.rest); arm.pole = V(side * SEAT[s].sx * .8, -.9, 0); return arm;
  }
  function seg(mesh, A, B) { const d = B.clone().sub(A), l = d.length(); mesh.position.copy(A).addScaledVector(d, .5); mesh.quaternion.setFromUnitVectors(UP, d.normalize()); mesh.scale.set(1, Math.max(.001, l), 1); }
  function solveArm(a) {
    const L1 = .42, L2 = .42, S = a.shoulder, T = a.pos; const dv = T.clone().sub(S), d = clamp(dv.length(), .05, L1 + L2 - .01), dir = dv.normalize();
    const al = (L1 * L1 - L2 * L2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, L1 * L1 - al * al));
    const perp = a.pole.clone().sub(dir.clone().multiplyScalar(a.pole.dot(dir))).normalize();
    const E = S.clone().addScaledVector(dir, al).addScaledVector(perp, h), Tc = S.clone().addScaledVector(dir, d);
    seg(a.up, S, E); seg(a.fo, E, Tc); a.hand.position.copy(Tc);
    if (a.lockQ) a.hand.quaternion.copy(a.lockQ); else a.hand.quaternion.setFromUnitVectors(V(0, 0, -1), Tc.clone().sub(E).normalize());
    setGrip(a.hand, a.grip);
  }
  const moveHand = (arm, dest, ms, ease) => { const a = arm.pos.clone(), b = dest.clone(); return tween(ms, u => arm.pos.lerpVectors(a, b, u), ease); };
  const gripTo = (arm, v, ms) => { const a = arm.grip; return tween(ms, u => { arm.grip = a + (v - a) * u; }, lin); };

  // ---- people ----
  const faceCache = {};
  function setFaceTex(p, expr) {
    const key = (p.bot ? 'b' : 'h') + (expr || 'neutral'); p.expr = expr || 'neutral';
    const draw = img => { const g = p.fctx; g.clearRect(0, 0, 256, 212); g.drawImage(img, 0, 0, 256, 212); p.ftex.needsUpdate = true; };
    if (faceCache[key] && faceCache[key].complete) { draw(faceCache[key]); return; }
    const img = faceCache[key] || new Image(); faceCache[key] = img; img.onload = () => { if (p.expr === (expr || 'neutral')) draw(img); };
    if (!img.src) img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(Art.face(p.bot, expr).replace('<svg ', '<svg width="256" height="212" '));
  }
  function makePerson(s, col, bot) {
    const root = new THREE.Group(), body = new THREE.Group(); root.add(body); const vest = col === '#ff6a4d' ? '#c9432b' : '#2f9e8f';
    // model faces -z (forward); seat 1 is rotated by PI
    const torso = new THREE.Group(); body.add(torso);
    box(.5, .6, .26, M('#f6f0e2'), 0, 1.0, 0, torso); box(.5, .46, .04, M(vest), 0, .98, -.135, torso); box(.1, .5, .03, M('#f6f0e2'), 0, .98, -.158, torso);
    box(.07, .05, .02, M('#ff6a4d'), 0, 1.22, -.16, torso); box(.045, .05, .02, M('#c9432b'), -.06, 1.22, -.16, torso).rotation.z = .5; box(.045, .05, .02, M('#c9432b'), .06, 1.22, -.16, torso).rotation.z = -.5;
    box(.2, .22, .2, M('#f3c9a0'), 0, 1.4, 0, torso);
    const head = new THREE.Group(); head.position.set(0, 1.58, 0); body.add(head);
    const hm = new THREE.Mesh(new THREE.IcosahedronGeometry(.16, 0), M('#f3c9a0')); hm.scale.set(1, 1.1, .95); hm.castShadow = true; head.add(hm);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(.15, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2), M(col)); dome.position.y = .1; dome.castShadow = true; head.add(dome); cyl(.215, .215, .018, 10, M(col), 0, .1, 0, head); cyl(.152, .152, .03, 10, M(vest), 0, .115, 0, head);
    box(.04, .06, .03, M('#d9a97c'), 0, -.02, -.16, head);
    const c = document.createElement('canvas'); c.width = 256; c.height = 212; const ftex = new THREE.CanvasTexture(c); ftex.colorSpace = THREE.SRGBColorSpace;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(.25, .205), new THREE.MeshBasicMaterial({ map: ftex, transparent: true })); face.position.set(0, -.015, -.152); face.rotation.y = Math.PI; head.add(face);
    const p = { s, root, body, torso, head, face, ftex, fctx: c.getContext('2d'), bot, expr: 'neutral', lean: 0, arms: [makeArm(s, 1, '#f6f0e2'), makeArm(s, -1, '#f6f0e2')], look: V(0, 0, 0), hit: 0 };
    root.position.copy(sw(s, 0, 0, 0)); root.rotation.y = s ? Math.PI : 0; scene.add(root); p.arms.forEach(a => scene.add(a.root));
    // the person is built facing -z at seat 0; flip the faces so textures read correctly
    setFaceTex(p, 'neutral'); return p;
  }

  // ---- revolver ----
  function makeGun() {
    const g = new THREE.Group(), steel = M('#aebfc6', { metalness: .55, roughness: .35 }), dark = M('#4a5f6a', { metalness: .5, roughness: .45 });
    box(.034, .06, .17, steel, 0, -.01, .01, g); const bar = cyl(.014, .014, .22, 8, steel, 0, .03, .15, g); bar.rotation.x = Math.PI / 2; box(.01, .016, .012, M('#ff6a4d'), 0, .05, .25, g);
    const drum = new THREE.Group(); drum.position.set(0, .0, 0); g.add(drum); const dc = cyl(.047, .047, .075, 12, dark, 0, 0, 0, drum); dc.rotation.x = Math.PI / 2;
    const marks = new THREE.Group(); drum.add(marks);
    const grip = box(.03, .095, .045, M('#7e4526'), 0, -.075, -.085, g); grip.rotation.x = .35; box(.012, .03, .02, steel, 0, .05, -.1, g);
    const flash = new THREE.Mesh(new THREE.ConeGeometry(.05, .16, 7), new THREE.MeshBasicMaterial({ color: 0xffd36a, transparent: true, opacity: .95, depthWrite: false })); flash.rotation.x = Math.PI / 2; flash.position.set(0, .03, .34); flash.visible = false; g.add(flash);
    g.userData = { grip: V(0, -.07, -.085), drum, marks, flash, held: null, kick: 0, n: 0 }; g.traverse(o => { o.userData.gun = true; });
    return g;
  }
  function placeGun(h) {
    const g = gunObj, hand = h.hand; g.position.copy(hand.pos); g.lookAt(h.aim); g.position.copy(hand.pos).sub(g.userData.grip.clone().applyQuaternion(g.quaternion));
    if (h.kick) { g.position.y += h.kick * .05; g.rotateX(-h.kick * .35); g.position.addScaledVector(V(0, 0, 1).applyQuaternion(g.quaternion), -h.kick * .04); }
    hand.lockQ = g.quaternion.clone().multiply(new THREE.Quaternion().setFromAxisAngle(UP, Math.PI));
  }
  function gunRest() { gunObj.position.set(0, TY + .05, 0); gunObj.lookAt(1, TY + .05, 0); }

  // ---- items ----
  const AMB = '#ffb547', GOLD = '#f0b43c', STEEL = '#8aa0aa';
  const lathe = (pts, m, seg) => { const o = new THREE.Mesh(new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), seg || 8), m); o.castShadow = true; return o; };
  const glassM = () => M('#dff6fa', { transparent: true, opacity: .38, roughness: .1, metalness: 0 });
  const ITEMB = {
    loupe() { const g = new THREE.Group(); const r = new THREE.Mesh(new THREE.TorusGeometry(.035, .007, 5, 12), M(GOLD, { metalness: .5 })); r.position.y = .02; r.rotation.x = Math.PI / 2; r.castShadow = true; g.add(r); const l = cyl(.032, .032, .004, 12, glassM(), 0, .02, 0, g); const h = cyl(.008, .009, .075, 6, M('#8a4b2a'), 0, .012, .085, g); h.rotation.x = Math.PI / 2; g.position.y = 0; return g; },
    phone() { const g = new THREE.Group(); box(.12, .034, .09, M('#2f9e8f'), 0, .017, 0, g); box(.13, .022, .03, M('#ff6a4d'), 0, .05, 0, g); box(.03, .03, .035, M('#c9432b'), -.055, .04, 0, g); box(.03, .03, .035, M('#c9432b'), .055, .04, 0, g); cyl(.022, .022, .006, 10, M('#eaf7f8'), 0, .037, .026, g); return g; },
    beer() { const g = new THREE.Group(); cyl(.036, .032, .085, 9, M(AMB, { emissive: AMB, emissiveIntensity: .15 }), 0, .045, 0, g); cyl(.039, .037, .022, 9, M('#fff7e6'), 0, .097, 0, g); const h = new THREE.Mesh(new THREE.TorusGeometry(.022, .006, 5, 8), M('#e8d8b0')); h.position.set(.045, .045, 0); h.castShadow = true; g.add(h); return g; },
    lemon() { const g = new THREE.Group(); const l = new THREE.Mesh(new THREE.SphereGeometry(.04, 7, 5), M('#ffd84a')); l.scale.set(1.25, .9, 1); l.position.y = .036; l.castShadow = true; g.add(l); cyl(.006, .01, .014, 5, M('#7bd88f'), .05, .04, 0, g).rotation.z = 1.2; return g; },
    bell() { const g = new THREE.Group(); g.add(lathe([[.001, 0], [.048, .0], [.045, .012], [.034, .045], [.018, .066], [.001, .07]], M(GOLD, { metalness: .6, roughness: .35 }), 9)); const k = new THREE.Mesh(new THREE.SphereGeometry(.009, 5, 4), M(GOLD)); k.position.y = .074; g.add(k); return g; },
    spin() { const g = new THREE.Group(); cyl(.042, .042, .02, 9, M(STEEL, { metalness: .5 }), 0, .01, 0, g); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; cyl(.008, .008, .012, 6, M(GOLD), Math.sin(a) * .026, .024, Math.cos(a) * .026, g); } cyl(.01, .01, .02, 6, M('#ff6a4d'), 0, .028, 0, g); return g; },
    coin() { const g = new THREE.Group(); cyl(.036, .036, .007, 10, M(GOLD, { metalness: .7, roughness: .3 }), 0, .005, 0, g); cyl(.026, .026, .009, 10, M('#ffd36a', { metalness: .6 }), 0, .005, 0, g); return g; },
    whisky() { const g = new THREE.Group(); g.add(lathe([[.028, 0], [.03, .01], [.037, .09]], glassM(), 9)); cyl(.03, .027, .05, 9, M('#e8902a', { emissive: '#e8902a', emissiveIntensity: .25 }), 0, .03, 0, g); box(.022, .022, .022, M('#fff', { transparent: true, opacity: .7 }), .006, .06, 0, g).rotation.y = .6; return g; },
    tray() { const g = new THREE.Group(); cyl(.062, .062, .012, 8, M('#7e4526'), 0, .006, 0, g); cyl(.05, .05, .006, 8, M('#b87142'), 0, .013, 0, g); return g; }
  };
  function addItem(it, slotIdx, drop) {
    const g = ITEMB[it.k](); g.userData = { itemId: it.id, kind: it.k }; g.traverse(o => { o.userData.itemId = it.id; });
    const p = SLOTS[slotIdx].clone(); g.position.copy(p); g.rotation.y = (it.id * 1.7) % 6.28; scene.add(g);
    const rec = { id: it.id, kind: it.k, group: g, slot: slotIdx, base: p, attached: null, off: V(0, -.05, 0), alive: true };
    items.set(it.id, rec);
    if (drop) { g.position.y = p.y + .6; g.scale.setScalar(.7); tween(520, u => { g.position.y = p.y + .6 * (1 - u); g.scale.setScalar(.7 + .3 * u); }, ebo); }
    return rec;
  }
  function removeItem(id) { const r = items.get(id); if (!r) return; r.alive = false; scene.remove(r.group); items.delete(id); if (selId === id) { selId = null; selRing.visible = false; } }

  // ---------------------------------------------------------------- sync with a game state ----
  function drumMarks(g, viewSeat) {
    const u = gunObj.userData, n = g.n, spent = g.spent.length, sig = n + '|' + g.spent.join('') + '|' + g.ch.map(c => c.s[viewSeat] ? c.k : '-').join('') + '|' + viewSeat;
    if (sig === drumSig) return; drumSig = sig;
    while (u.marks.children.length) { const c = u.marks.children.pop(); c.geometry.dispose(); }
    for (let j = 0; j < n; j++) {
      const a = j * Math.PI * 2 / n; let col = '#e0b04a', em = 0, sc = 1;
      if (j < spent) { col = g.spent[j] === 'L' ? '#7a2b3a' : '#2f6f88'; sc = .6; } else { const c = g.ch[j - spent]; if (c && c.s[viewSeat]) { col = c.k === 'L' ? '#ff4d6d' : '#6cc4f5'; em = .9; } }
      const m = cyl(.0125 * sc, .0125 * sc, .01, 7, M(col, em ? { emissive: col, emissiveIntensity: em } : {}), Math.sin(a) * .028, Math.cos(a) * .028, -.04, u.marks); m.rotation.x = Math.PI / 2;
    }
  }
  function sync(g, opt) {
    if (!ok || !gunObj) return; const vs = (opt && opt.seat != null) ? opt.seat : view.seat;
    // items
    const ids = new Set(g.table.map(i => i.id)); const instant = !!(opt && opt.instant);
    [...items.keys()].forEach(id => { if (!ids.has(id) && !(items.get(id).attached)) removeItem(id); });
    g.table.forEach(it => { if (!items.has(it.id)) { const used = new Set([...items.values()].map(r => r.slot)); let k = 0; while (used.has(k)) k++; addItem(it, Math.min(k, 7), !instant); } });
    // drum
    drumMarks(g, vs); const step = Math.PI * 2 / g.n, target = g.spent.length * step, d = gunObj.userData.drum;
    if (gunObj.userData.n !== g.n || instant) { d.rotation.z = target; } else if (Math.abs(d.rotation.z - target) > .001) { const a = d.rotation.z; tween(420, u => { d.rotation.z = a + (target - a) * u; }, ebo); }
    gunObj.userData.n = g.n;
    // shields: a wooden tray stands in front of a protected player
    [0, 1].forEach(s => { const has = g.shield[s]; if (has && !shieldMeshes[s]) { const m = ITEMB.tray(); m.scale.setScalar(2.2); m.position.copy(sw(s, 0, TY + .14, .72)); m.rotation.x = Math.PI / 2; scene.add(m); shieldMeshes[s] = m; } else if (!has && shieldMeshes[s]) { scene.remove(shieldMeshes[s]); shieldMeshes[s] = null; } });
    if (!(opt && opt.keepSel)) { if (selId != null && !items.has(selId)) setSelected(null); }
  }

  // ---------------------------------------------------------------- views + cinematic camera ----
  function setView(v) {
    if (v === 'side') { view.mode = 'side'; } else { view.mode = 'pov'; view.seat = v; }
    players.forEach((p, i) => { if (!p) return; const hide = view.mode === 'pov' && i === view.seat; p.body.visible = !hide; });
  }
  function camTarget() {
    if (view.mode === 'side') { const t = performance.now() / 1000; return { pos: V(2.35 + Math.sin(t * .15) * .06, 1.75, .45), look: V(0, .98, -.05), fov: 46 }; }
    const s = view.seat, p = sw(s, 0, 1.31, .04), l = sw(s, 0, 1.0, 1.15); return { pos: p, look: l, fov: 66 };
  }
  function updateCamera(dt, t) {
    const T = camTarget(), k = 1 - Math.exp(-dt * 3.2);
    const pos = T.pos.clone(), look = T.look.clone();
    if (view.mode === 'pov') {                                   // breathing + mouse parallax + cinematic dolly
      const s = view.seat, fw = look.clone().sub(pos).normalize(); pos.addScaledVector(fw, cine.dolly); pos.y += Math.sin(t * 1.3) * .004 - cine.pitch * .1;
      const right = V(SEAT[s].sx, 0, 0); look.addScaledVector(right, view.parX * .22).add(V(0, view.parY * .12 + Math.sin(t * .9) * .004, 0));
    }
    camPos.lerp(pos, k); camLook.lerp(look, k); cam.position.copy(camPos);
    if (cine.shake > .001) { const a = cine.shake * .035; cam.position.add(V((Math.random() - .5) * a, (Math.random() - .5) * a, (Math.random() - .5) * a)); }
    cam.lookAt(camLook); if (cine.roll) cam.rotateZ(cine.roll);
    const f = T.fov + cine.fov; if (Math.abs(cam.fov - f) > .01) { cam.fov += (f - cam.fov) * k; cam.updateProjectionMatrix(); }
  }
  const cineTo = (prop, val, ms) => { const a = cine[prop]; return tween(ms, u => { cine[prop] = a + (val - a) * u; }); };
  const bars = on => document.body.classList.toggle('cine', !!on);

  // ---------------------------------------------------------------- the shot ----
  const rArm = s => players[s].arms[0];
  let curShot = null;
  async function gunAim(by, at) {
    if (!ok) return; const arm = rArm(by), self = by === at, u = gunObj.userData; curShot = { by, at };
    const gp = gunObj.localToWorld(u.grip.clone());
    if (view.mode === 'pov') { if (view.seat === by) { cineTo('fov', self ? -9 : -5, 900); if (self) cineTo('dolly', .14, 900); } else if (view.seat === at) { cineTo('dolly', .12, 1500); cineTo('fov', -7, 1500); } }
    bars(true);
    await moveHand(arm, gp.clone().add(V(0, .09, 0)), 360); await moveHand(arm, gp, 170); await gripTo(arm, 1, 130);
    const fwd = V(0, 0, 1).applyQuaternion(gunObj.quaternion), h = { hand: arm, aim: gunObj.position.clone().addScaledVector(fwd, 1), kick: 0 }; u.held = h;
    const dest = self ? sw(by, .06, 1.2, .46) : sw(by, .1, 1.2, .62), aimTo = self ? sw(by, 0, 1.38, .02) : sw(at, 0, 1.3, .05);
    const a0 = h.aim.clone(); const p = moveHand(arm, dest, 650);
    await Promise.all([p, tween(650, e => h.aim.lerpVectors(a0, aimTo, e))]);
    if (players[at]) players[at].look.copy(sw(by, 0, 1.3, .1));
  }
  async function gunSuspense(ms) { if (!ok) return; const h = gunObj.userData.held; const a = lampSpot.intensity; await tween(ms, u => { if (h) h.hand.pos.y += Math.sin(u * 30) * .0004; lampSpot.intensity = a * (1 - .3 * Math.sin(u * Math.PI)); cine.shake = .12 * Math.sin(u * Math.PI); }, lin); cine.shake = 0; lampSpot.intensity = lampBase; }
  async function gunFire(by, at, kind, blocked) {
    if (!ok) return; const h = gunObj.userData.held, u = gunObj.userData; if (!h) return;
    if (kind === 'L') {
      u.flash.visible = true; u.flash.scale.setScalar(1); flashLight.position.copy(gunObj.localToWorld(V(0, .03, .3))); flashLight.intensity = 60;
      cine.shake = 1; cineTo('shake', 0, 520); if (view.mode === 'pov' && view.seat === at && !blocked) { cine.pitch = .6; cineTo('pitch', 0, 1200); cine.roll = .05; cineTo('roll', 0, 1100); }
      tween(120, e => { h.kick = e; }, eo).then(() => tween(380, e => { h.kick = 1 - e; }, eo)); tween(150, e => { flashLight.intensity = 60 * (1 - e); u.flash.scale.setScalar(1 + e * .6); }, lin).then(() => { u.flash.visible = false; flashLight.intensity = 0; });
      if (players[at] && !blocked) reactHit(at);
      await wait(520);
    } else { tween(90, e => { h.kick = e * .15; }, lin).then(() => tween(200, e => { h.kick = .15 * (1 - e); }, eo)); await wait(300); }
  }
  async function reactHit(s) { const p = players[s]; await tween(150, u => { p.hit = u; }, eo); await tween(900, u => { p.hit = 1 - u; }, eio); }
  async function gunPut(by) {
    if (!ok) return; const u = gunObj.userData, h = u.held; if (!h) { bars(false); return; } const arm = h.hand;
    cineTo('fov', 0, 800); cineTo('dolly', 0, 800); bars(false);
    const rest = V(0, TY + .05, 0), a0 = h.aim.clone(); const restAim = V(1, TY + .05, 0);
    await Promise.all([moveHand(arm, rest.clone().add(V(0, .16, 0)).add(gunObj.userData.grip.clone().multiplyScalar(0)), 520), tween(520, e => h.aim.lerpVectors(a0, restAim, e))]);
    await moveHand(arm, rest.clone().add(V(0, .03, 0)).add(V(0, 0, 0)), 200); u.held = null; arm.lockQ = null; gunRest(); await gripTo(arm, 0, 150); await moveHand(arm, arm.rest, 450);
    if (players[curShot ? curShot.at : 0]) players[curShot.at].look.set(0, 0, 0); curShot = null;
  }

  // ---------------------------------------------------------------- items in hand ----
  async function useItem(by, kind, id) {
    if (!ok) return; const r = items.get(id); const P = players[by]; if (!r) { await wait(500); return; }
    const side = (r.group.position.x * SEAT[by].sx) >= 0 ? 0 : 1, arm = P.arms[side], ip = r.group.position.clone();
    await moveHand(arm, ip.clone().add(V(0, .1, 0)), 400); await moveHand(arm, ip.clone().add(V(0, .06, 0)), 150); await gripTo(arm, .8, 110);
    r.attached = arm; r.off = V(0, -.055, 0);
    const hold = { loupe: sw(by, .06, 1.26, .42), phone: sw(by, side ? -.2 : .2, 1.28, .16), beer: sw(by, 0, 1.18, .24), whisky: sw(by, 0, 1.18, .24), lemon: sw(by, 0, 1.12, .38), bell: sw(by, 0, .98, .6), coin: sw(by, 0, 1.0, .5), spin: sw(by, 0, .9, .6), tray: sw(by, 0, .86, .68) }[kind] || sw(by, 0, 1.05, .5);
    await moveHand(arm, hold, 520); const g = r.group;
    if (kind === 'beer' || kind === 'whisky') { await tween(520, u => { g.rotation.x = -1.1 * u * SEAT[by].fz * -1; }); await wait(240); await tween(300, u => { g.rotation.x = -1.1 * (1 - u) * SEAT[by].fz * -1; }); }
    else if (kind === 'bell') { await tween(700, u => { g.rotation.z = Math.sin(u * 40) * .5 * (1 - u); }, lin); g.rotation.z = 0; }
    else if (kind === 'coin') { r.off.y = -.055; await tween(750, u => { r.off.y = -.055 + Math.sin(u * Math.PI) * .32; g.rotation.x = u * Math.PI * 6; }, lin); g.rotation.x = 0; }
    else if (kind === 'loupe' || kind === 'phone') { await tween(600, u => { g.rotation.y += .01; r.off.y = -.055 + Math.sin(u * Math.PI) * .02; }, lin); }
    else if (kind === 'spin') { await tween(600, u => { g.rotation.y += .5 * (1 - u); }, lin); }
    else { await tween(450, u => { g.rotation.y += .05; }, lin); }
    const sc = g.scale.x; await tween(260, u => { g.scale.setScalar(sc * (1 - u)); }, eo); r.attached = null; removeItem(id);
    await gripTo(arm, 0, 120); await moveHand(arm, arm.rest, 420);
  }
  const spinDrum = ms => { if (!ok) return Promise.resolve(); const d = gunObj.userData.drum, a = d.rotation.z; return tween(ms || 900, u => { d.rotation.z = a + u * Math.PI * 6; }, eo); };

  // ---------------------------------------------------------------- picking ----
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
  function pickAt(ev) {
    const r = canvas.getBoundingClientRect(); ptr.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ptr, cam);
    const targets = [gunObj, ...[...items.values()].map(i => i.group)]; players.forEach((p, i) => { if (p && p.body.visible) targets.push(p.body); });
    const hits = ray.intersectObjects(targets, true); if (!hits.length) return { type: 'none' };
    let o = hits[0].object; while (o) { if (o.userData.itemId != null) return { type: 'item', id: o.userData.itemId }; if (o === gunObj) return { type: 'gun' }; players.forEach((p, i) => { if (p && o === p.body) o.__seat = i; }); if (o.__seat != null) return { type: 'player', seat: o.__seat }; o = o.parent; }
    return { type: 'none' };
  }
  function setSelected(id) { selId = id; const r = items.get(id); selRing.visible = !!r; if (r) selRing.position.set(r.base.x, TY + .004, r.base.z); }
  function onMove(ev) { const r = canvas.getBoundingClientRect(); view.parX = ((ev.clientX - r.left) / r.width - .5) * 2; view.parY = -((ev.clientY - r.top) / r.height - .5) * 2; const p = pickAt(ev); canvas.style.cursor = p.type === 'item' || p.type === 'gun' || (p.type === 'player' && aimMode) ? 'pointer' : 'default'; hoverId = p.type === 'item' ? p.id : null; const hr = items.get(hoverId); hoverRing.visible = !!hr && hoverId !== selId; if (hr) hoverRing.position.set(hr.base.x, TY + .003, hr.base.z); }
  const setAimMode = on => { aimMode = !!on; if (gunObj && !gunObj.userData.held) { gunObj.position.y = TY + .05 + (on ? .05 : 0); } };

  // ---------------------------------------------------------------- frame loop ----
  function frame(now) {
    raf = requestAnimationFrame(frame); const dt = Math.min(.05, (now - lastT) / 1000 || .016); lastT = now; const t = now / 1000;
    stepTweens(dt);
    items.forEach(r => { if (r.attached) r.group.position.copy(r.attached.hand.position).add(r.off); });
    players.forEach((p, s) => {
      if (!p) return; const idle = Math.sin(t * 1.2 + s) * .004;
      p.body.position.y = idle; p.torso.rotation.x = -p.hit * .18; p.head.rotation.x = -p.hit * .45 + Math.sin(t * .7 + s) * .02;
      const lk = p.look.lengthSq() > 0 ? p.look : sw(1 - s, 0, 1.3, .1); const lp = p.head.getWorldPosition(V(0, 0, 0)), dir = lk.clone().sub(lp).applyAxisAngle(UP, -p.root.rotation.y);
      p.head.rotation.y += (clamp(Math.atan2(-dir.x, -dir.z), -.6, .6) - p.head.rotation.y) * .06;
      p.arms.forEach((a, i) => { if (a.pos.equals(a.rest) && !a.lockQ) { a.pos.y = a.rest.y + Math.sin(t * 1.2 + i) * .002; } solveArm(a); });
    });
    const u = gunObj.userData; if (u.held) placeGun(u.held);
    if (selRing.visible) selRing.material.opacity = .6 + Math.sin(t * 5) * .3;
    updateCamera(dt, t);
    renderer.render(scene, cam);
  }
  function resize() { if (!renderer) return; const w = wrap.clientWidth || innerWidth, h = wrap.clientHeight || innerHeight; renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5)); renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }

  function init(container) {
    try {
      wrap = container; canvas = document.createElement('canvas'); canvas.id = 'r3d-canvas'; wrap.appendChild(canvas);
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .9;
      scene = new THREE.Scene(); cam = new THREE.PerspectiveCamera(62, 1, .05, 30); buildRoom();
      gunObj = makeGun(); gunRest(); scene.add(gunObj);
      canvas.addEventListener('pointermove', onMove); canvas.addEventListener('pointerdown', ev => { if (ev.button !== 0) return; cb.pick(pickAt(ev)); });
      addEventListener('resize', resize); resize();
      document.addEventListener('visibilitychange', () => { clearInterval(hidT); if (document.hidden && running) { let l = performance.now(); hidT = setInterval(() => { const n = performance.now(); stepTweens(Math.min(.1, (n - l) / 1000)); l = n; }, 50); } });
      ok = true;
    } catch (e) { console.warn('3D unavailable, using 2D', e); ok = false; lastErr = String(e && e.message || e); }
    return ok;
  }
  function setup(opts) {
    if (!ok) return; names = opts.names; cols = opts.cols; isBot = opts.bots;
    [0, 1].forEach(s => { if (players[s]) { scene.remove(players[s].root); players[s].arms.forEach(a => scene.remove(a.root)); } players[s] = makePerson(s, cols[s], isBot[s]); });
    [...items.keys()].forEach(removeItem); shieldMeshes.forEach((m, i) => { if (m) scene.remove(m); shieldMeshes[i] = null; }); drumSig = ''; gunObj.userData.held = null; gunRest(); tws.length = 0; cine.dolly = cine.fov = cine.shake = cine.pitch = cine.roll = 0; bars(false);
    camPos.copy(camTarget().pos); setView(opts.view);
  }
  function start() { if (!ok || running) return; running = true; resize(); lastT = performance.now(); raf = requestAnimationFrame(frame); }
  function stop() { running = false; cancelAnimationFrame(raf); clearInterval(hidT); }
  const api = {
    err: () => lastErr, init, setup, sync, start, stop, resize, setView, setSelected, setAimMode, gunAim, gunSuspense, gunFire, gunPut, useItem, spinDrum,
    setExpr: (s, e) => { if (ok && players[s]) setFaceTex(players[s], e); }, onPick: f => { cb.pick = f; }, isOk: () => ok,
    screenOf: what => { const w = what === 'gun' ? gunObj.position.clone() : what === 'opp' ? players[1].head.getWorldPosition(V(0, 0, 0)) : (items.get(what) ? items.get(what).group.position.clone().add(V(0, .03, 0)) : null); if (!w) return null; w.project(cam); const r = canvas.getBoundingClientRect(); return { x: r.left + (w.x + 1) / 2 * r.width, y: r.top + (1 - w.y) / 2 * r.height }; },
    itemIds: () => [...items.keys()],
    lookAt: (s, v) => { if (players[s]) players[s].look.copy(v || V(0, 0, 0)); }
  };
  return api;
})();
window.R3D = R3D;
