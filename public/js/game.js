import * as THREE from './three.module.min.js';
import { patchPSX, rng } from './psx.js';
import { makeHuman, animHuman, setGun, makeHorse, animHorse, CAST, goonLook, mat, box } from './chars.js';
import { World } from './world.js';
import { LEVELS, WEAPONS, WEAPON_ORDER, ENEMY, BOSSES, DUELS, bountyFor } from './levels.js';
import { initAudio, sfx, music, setSlow, vol, setVolumes } from './audio.js';

patchPSX();
const $ = (s) => document.querySelector(s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };

// =====================================================================
//  opslag
// =====================================================================
const SAVE_KEY = 'shanedeadredemption';
const save = (() => {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch { /* geen opslag */ }
  s = s || {};
  s.unlocked = s.unlocked || 0;
  s.best = s.best || {};
  s.set = Object.assign({ sens: 1, invert: false, sfx: 0.8, music: 0.5, diff: 1, res: 240 }, s.set || {});
  if (/[?&]alles/.test(location.search)) s.unlocked = LEVELS.length - 1;
  return s;
})();
function store() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* geen opslag */ } }
vol.sfx = save.set.sfx; vol.music = save.set.music;

// =====================================================================
//  renderer
// =====================================================================
const canvas = $('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 160);
const hud = $('#hud'), hx = hud.getContext('2d');
function resize() {
  const w = innerWidth, h = innerHeight;
  const k = save.set.res / h;
  renderer.setSize(Math.round(w * k), Math.round(h * k), false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  hud.width = w * Math.min(2, devicePixelRatio); hud.height = h * Math.min(2, devicePixelRatio);
  hx.setTransform(Math.min(2, devicePixelRatio), 0, 0, Math.min(2, devicePixelRatio), 0, 0);
}
addEventListener('resize', resize);
resize();
const muzzleLight = new THREE.PointLight('#ffcc66', 0, 9, 1.5);
scene.add(muzzleLight);
const lantern = new THREE.PointLight('#ffd9a0', 0, 14, 1.2);
scene.add(lantern);
const boomLight = new THREE.PointLight('#ff9a40', 0, 22, 1.2);
scene.add(boomLight);

// =====================================================================
//  invoer
// =====================================================================
const keys = {};
const mouse = { dx: 0, dy: 0, l: false, r: false, lPressed: false, rPressed: false, wheel: 0 };
let locked = false;
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  keys[e.code] = true;
  onKey(e.code, e);
  if (['Space', 'Tab', 'ControlLeft'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('mousemove', (e) => { if (locked || G.freeMouse) { mouse.dx += e.movementX; mouse.dy += e.movementY; } });
canvas.addEventListener('mousedown', (e) => {
  initAudio();
  if (!locked && (G.mode === 'play' || G.mode === 'duel' || G.mode === 'cut')) {
    canvas.requestPointerLock?.();
    // deze klik vangt alleen de muis, het is geen schot (anders trek je in het duel 'te vroeg')
    if (G.mode !== 'cut') return;
  }
  if (e.button === 0) { mouse.l = true; mouse.lPressed = true; }
  if (e.button === 2) { mouse.r = true; mouse.rPressed = true; }
});
addEventListener('mouseup', (e) => { if (e.button === 0) mouse.l = false; if (e.button === 2) mouse.r = false; });
addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('wheel', (e) => { mouse.wheel += Math.sign(e.deltaY); }, { passive: true });
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  if (!locked && (G.mode === 'play' || G.mode === 'duel') && !G.noPause) pause(true);
});

// =====================================================================
//  spelstatus
// =====================================================================
const G = {
  mode: 'menu', li: 0, level: null, world: null, t: 0, timeScale: 1,
  enemies: [], pickups: [], projectiles: [], corpses: [],
  secIdx: -1, sec: null, cp: null, waiters: [], skip: false,
  stats: null, bounty: 0, shake: 0, flash: 0, hurtDir: [], hitMark: 0, toasts: [],
  boss: null, ride: null, duel: null, de: null, freeMouse: false, noPause: false, god: false,
};
window.__sdr = G;

// =====================================================================
//  effecten: deeltjes, sporen, mondingsvuur
// =====================================================================
const PART_N = 700;
function partSystem(size) {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(PART_N * 3), col = new Float32Array(PART_N * 3);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.PointsMaterial({ size, vertexColors: true, sizeAttenuation: true, fog: true });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  scene.add(pts);
  const data = Array.from({ length: PART_N }, () => ({ life: 0, x: 0, y: -99, z: 0, vx: 0, vy: 0, vz: 0, g: 0, r: 0, gg: 0, b: 0, drag: 0 }));
  let next = 0;
  return {
    emit(x, y, z, vx, vy, vz, life, color, grav = -9, drag = 0) {
      const p = data[next]; next = (next + 1) % PART_N;
      p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz; p.life = life; p.g = grav; p.drag = drag;
      p.r = color.r; p.gg = color.g; p.b = color.b;
    },
    update(dt) {
      for (let i = 0; i < PART_N; i++) {
        const p = data[i];
        if (p.life > 0) {
          p.life -= dt;
          p.vy += p.g * dt;
          const dr = 1 - p.drag * dt;
          p.vx *= dr; p.vy *= dr; p.vz *= dr;
          p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
          if (p.y < 0.02) { p.y = 0.02; p.vy *= -0.2; p.vx *= 0.6; p.vz *= 0.6; }
          if (p.life <= 0) p.y = -99;
        }
        pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
        col[i * 3] = p.r; col[i * 3 + 1] = p.gg; col[i * 3 + 2] = p.b;
      }
      g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true;
    },
    clear() { data.forEach((p) => { p.life = 0; p.y = -99; }); },
  };
}
const fxSmall = partSystem(0.09), fxBig = partSystem(0.55);
const C = (h) => new THREE.Color(h);
const COL = { blood: C('#7a0a0a'), blood2: C('#a01818'), dust: C('#b89a70'), spark: C('#ffd060'), smoke: C('#6a6460'), fire: C('#ff8a20'), fire2: C('#ffd040'), wood: C('#6a4426'), water: C('#c0d8e0'), snow: C('#f0f4f8'), rain: C('#9ab0c8') };
function blood(p, dir, n = 10) {
  for (let i = 0; i < n; i++) fxSmall.emit(p.x, p.y, p.z, dir.x * 2 + rand(-1.5, 1.5), rand(0, 2.5), dir.z * 2 + rand(-1.5, 1.5), rand(0.4, 0.9), Math.random() < 0.5 ? COL.blood : COL.blood2);
}
function dust(p, n = 6, c = COL.dust) {
  for (let i = 0; i < n; i++) fxSmall.emit(p.x, p.y, p.z, rand(-1.5, 1.5), rand(0.5, 3), rand(-1.5, 1.5), rand(0.3, 0.7), c);
  fxBig.emit(p.x, p.y, p.z, rand(-0.3, 0.3), rand(0.3, 0.8), rand(-0.3, 0.3), 0.6, c, 0, 1);
}
function smokePuff(p, n = 2) { for (let i = 0; i < n; i++) fxBig.emit(p.x, p.y, p.z, rand(-0.4, 0.4), rand(0.4, 1), rand(-0.4, 0.4), rand(0.4, 0.8), COL.smoke, 0.5, 1.5); }

const TRACER_N = 32;
const tracers = [];
{
  const m = new THREE.LineBasicMaterial({ color: '#ffe8a8', fog: false });
  for (let i = 0; i < TRACER_N; i++) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const l = new THREE.Line(g, m); l.visible = false; l.frustumCulled = false; scene.add(l);
    tracers.push({ l, life: 0 });
  }
}
let tracerI = 0;
function tracer(a, b) {
  const t = tracers[tracerI]; tracerI = (tracerI + 1) % TRACER_N;
  // spoor begint een stukje voor de loop en is kort: een kogel, geen laser
  const d = V3().subVectors(b, a); const L = d.length();
  const s = V3().copy(a).addScaledVector(d, Math.min(0.3, 1.2 / L));
  const p = t.l.geometry.attributes.position.array;
  p[0] = s.x; p[1] = s.y; p[2] = s.z; p[3] = b.x; p[4] = b.y; p[5] = b.z;
  t.l.geometry.attributes.position.needsUpdate = true;
  t.l.visible = true; t.life = 0.06;
}
const flashTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 16;
  const x = c.getContext('2d');
  x.fillStyle = '#fff2a0';
  x.beginPath(); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, r = i % 2 ? 3 : 8; x.lineTo(8 + Math.cos(a) * r, 8 + Math.sin(a) * r); } x.fill();
  x.fillStyle = '#ffffff'; x.fillRect(6, 6, 4, 4);
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; return t;
})();
const flashes = [];
for (let i = 0; i < 10; i++) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, transparent: true, depthWrite: false, fog: false }));
  s.visible = false; scene.add(s); flashes.push({ s, life: 0 });
}
let flashI = 0;
function muzzleFlash(p, size = 0.5) {
  const f = flashes[flashI]; flashI = (flashI + 1) % flashes.length;
  f.s.position.copy(p); f.s.scale.setScalar(size); f.s.material.rotation = Math.random() * 6; f.s.visible = true; f.life = 0.05;
}
function updateFx(dt, dtr) {
  fxSmall.update(dt); fxBig.update(dt);
  for (const t of tracers) if (t.life > 0) { t.life -= dt; if (t.life <= 0) t.l.visible = false; }
  for (const f of flashes) if (f.life > 0) { f.life -= dt; if (f.life <= 0) f.s.visible = false; }
  muzzleLight.intensity = Math.max(0, muzzleLight.intensity - dt * 120);
  boomLight.intensity = Math.max(0, boomLight.intensity - dt * 60);
  G.shake = Math.max(0, G.shake - dtr * 2.5);
  G.hitMark = Math.max(0, G.hitMark - dtr);
  G.hurtDir = G.hurtDir.filter((h) => (h.t -= dtr) > 0);
}

// regen
let rain = null;
function makeRain() {
  const n = 900;
  const g = new THREE.BufferGeometry();
  const p = new Float32Array(n * 6);
  for (let i = 0; i < n; i++) { const x = rand(-25, 25), y = rand(0, 18), z = rand(-25, 25); p.set([x, y, z, x + 0.05, y - 0.7, z], i * 6); }
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#a8b8c8', transparent: true, opacity: 0.55 }));
  l.frustumCulled = false;
  return l;
}

// =====================================================================
//  speler
// =====================================================================
const P = {
  pos: V3(), vel: V3(), yaw: 0, pitch: 0, hp: 100, dmgT: 99, crouch: 0, crouchOn: false, aim: 0, weapon: 'revolver',
  ammo: {}, owned: [], cool: 0, reload: 0, model: null, de: 100, shotT: 99, melee: 0, throwA: 0, shoulder: 1, face: 0,
  y: 0, dead: false, deadT: 0, sprint: false, stepT: 0,
};
function makePlayer() {
  if (P.model) scene.remove(P.model);
  P.model = makeHuman(CAST.shane);
  scene.add(P.model);
  setGun(P.model, gunFor(P.weapon));
}
function gunFor(w) { return { revolver: 'revolver', lever: 'lever', shotgun: 'shotgun', dynamite: 'dynamite', knife: 'knife', rifle: 'lever' }[w] || null; }
function giveWeapon(w, quiet) {
  if (!P.owned.includes(w)) P.owned.push(w);
  P.owned.sort((a, b) => WEAPON_ORDER.indexOf(a) - WEAPON_ORDER.indexOf(b));
  const W = WEAPONS[w];
  if (!P.ammo[w]) P.ammo[w] = { mag: W.mag || 0, res: W.reserve || 0 };
  if (!quiet) { switchWeapon(w); sfx('weapon'); toast(`Nieuw wapen: ${W.name}`, `Druk ${W.key} om te kiezen`); }
}
function switchWeapon(w) {
  if (!P.owned.includes(w) || P.weapon === w) return;
  P.weapon = w; P.reload = 0; P.cool = 0.25;
  setGun(P.model, gunFor(w));
  sfx('cock', 0.6);
}
function cycleWeapon(d) {
  const i = P.owned.indexOf(P.weapon);
  switchWeapon(P.owned[(i + d + P.owned.length) % P.owned.length]);
}
function startReload() {
  const W = WEAPONS[P.weapon], a = P.ammo[P.weapon];
  if (!W.mag || W.throwable || P.reload > 0 || a.mag >= W.mag || a.res <= 0) return;
  P.reload = W.reload;
  sfx('reload', 0.7);
}
function camDirs() {
  const cy = Math.cos(P.yaw), sy = Math.sin(P.yaw), cp = Math.cos(P.pitch), spp = Math.sin(P.pitch);
  return { f: V3(-sy * cp, spp, -cy * cp), r: V3(cy, 0, -sy), flat: V3(-sy, 0, -cy) };
}
// camera zo draaien dat het vizier op een punt staat (de camera hangt naast Shane, dus twee keer bijstellen)
function aimAt(p) {
  for (let i = 0; i < 3; i++) {
    const { f, r } = camDirs();
    const feet = playerFeetY() + (G.ride?.horse ? 0.3 : 0);
    const c = V3(P.pos.x, feet + 1.58 - P.crouch * 0.45, P.pos.z).addScaledVector(f, -1.7).addScaledVector(r, P.shoulder * 0.66);
    c.y += 0.14;
    const d = V3().subVectors(p, c).normalize();
    P.yaw = Math.atan2(-d.x, -d.z); P.pitch = Math.asin(clamp(d.y, -1, 1));
  }
}
function playerFeetY() { return G.ride ? G.ride.deckY : 0; }

function updatePlayer(dt, dtr) {
  const W = WEAPONS[P.weapon];
  if (P.dead) {
    P.deadT += dtr;
    animHuman(P.model, { dead: Math.min(1, P.deadT * 2), deadDir: 1 }, dt);
    return;
  }
  const canAct = G.mode === 'play';
  // richten
  const aiming = canAct && (mouse.r || (G.de && G.de.active));
  P.aim = lerp(P.aim, aiming ? 1 : 0, 1 - Math.exp(-dtr * 14));
  P.crouch = lerp(P.crouch, P.crouchOn && !G.ride?.horse ? 1 : 0, 1 - Math.exp(-dt * 10));
  // lopen
  const { flat, r } = camDirs();
  const wish = V3();
  if (canAct) {
    if (keys.KeyW) wish.add(flat); if (keys.KeyS) wish.sub(flat);
    if (keys.KeyD) wish.add(r); if (keys.KeyA) wish.sub(r);
  }
  if (wish.lengthSq() > 0) wish.normalize();
  P.sprint = canAct && keys.ShiftLeft && !aiming && wish.lengthSq() > 0 && P.crouch < 0.5;
  if (P.sprint) P.crouchOn = false;
  const sp = aiming ? 2.6 : P.crouch > 0.5 ? 2.2 : P.sprint ? 6.8 : 4.3;
  if (G.ride) { rideControl(dt, wish, sp); }
  else {
    const k = 1 - Math.exp(-dt * 12);
    P.vel.x = lerp(P.vel.x, wish.x * sp, k); P.vel.z = lerp(P.vel.z, wish.z * sp, k);
    P.pos.x += P.vel.x * dt; P.pos.z += P.vel.z * dt;
    G.world.pushOut(P.pos, 0.35, 0, 1.7);
    G.world.pushOut(P.pos, 0.35, 0, 1.7);
    // niet achter de start of voorbij het einde
    P.pos.z = clamp(P.pos.z, G.world.endZ - 4, 10);
  }
  const speed = Math.hypot(P.vel.x, P.vel.z);
  if (speed > 1 && !G.ride) { P.stepT -= dt * speed; if (P.stepT < 0) { P.stepT = 1.6; sfx('step', 0.5); } }
  // kijkrichting van het model
  const faceCam = P.aim > 0.3 || P.shotT < 1.2 || P.melee > 0 || P.throwA > 0;
  if (faceCam) P.face = P.yaw + Math.PI;
  else if (speed > 0.5) P.face += angDiff(P.face, Math.atan2(P.vel.x, P.vel.z)) * (1 - Math.exp(-dt * 10));
  if (G.ride?.horse) P.face = Math.PI + (faceCam ? P.yaw - Math.PI + Math.PI : 0) * 0;
  P.model.rotation.y = faceCam ? P.yaw + Math.PI : P.face;
  P.model.position.set(P.pos.x, playerFeetY(), P.pos.z);
  // wapens
  P.cool -= dt; P.shotT += dt; P.dmgT += dt;
  P.melee = Math.max(0, P.melee - dt * 3.2); P.throwA = Math.max(0, P.throwA - dt * 3);
  if (P.reload > 0) {
    P.reload -= dt;
    if (P.reload <= 0) {
      const a = P.ammo[P.weapon];
      if (P.weapon === 'shotgun' || P.weapon === 'lever') {
        // patroon voor patroon zou mooier zijn; we vullen alles in één keer
      }
      const n = Math.min(W.mag - a.mag, a.res);
      a.mag += n; a.res -= n;
    }
  }
  if (canAct && !(G.de && G.de.active)) {
    if (mouse.wheel) { cycleWeapon(mouse.wheel > 0 ? 1 : -1); mouse.wheel = 0; }
    const auto = false;
    if ((mouse.lPressed || (auto && mouse.l)) && P.cool <= 0) fire();
  }
  mouse.wheel = 0;
  // genezen
  if (P.dmgT > 4 && P.hp < 100) P.hp = Math.min(100, P.hp + dt * 16);
  animHuman(P.model, {
    speed: G.ride ? 0 : speed, aim: Math.max(P.aim, P.shotT < 1.2 ? 1 : 0) * (W.melee || W.throwable ? 0 : 1), pitch: P.pitch,
    crouch: P.crouch, ride: !!G.ride?.horse, melee: P.melee, throwing: P.throwA ? 1 - P.throwA : 0,
  }, dt);
  if (lantern.intensity > 0) lantern.position.set(P.pos.x, playerFeetY() + 2.2, P.pos.z);
}

function muzzlePos() {
  const g = P.model.userData.gun;
  const p = V3();
  if (g) { g.updateWorldMatrix(true, false); p.set(0, P.weapon === 'revolver' ? -0.22 : -0.65, 0.06).applyMatrix4(g.matrixWorld); }
  else p.copy(P.pos).setY(1.4);
  return p;
}

function fire() {
  const W = WEAPONS[P.weapon];
  if (W.melee) { knifeAttack(); return; }
  if (W.throwable) { throwDynamite(); return; }
  if (P.reload > 0) return;
  const a = P.ammo[P.weapon];
  if (a.mag <= 0) { sfx('click'); P.cool = 0.25; startReload(); return; }
  a.mag--;
  P.cool = W.rate;
  P.shotT = 0;
  G.stats.shots++;
  const { f } = camDirs();
  const moving = Math.hypot(P.vel.x, P.vel.z) > 1;
  const spread = lerp(W.spread, W.aimSpread, P.aim) * (moving ? 1.7 : 1) * (P.crouch > 0.5 ? 0.8 : 1);
  const mp = muzzlePos();
  let hitAny = false;
  for (let i = 0; i < (W.pellets || 1); i++) {
    const d = f.clone();
    const ang = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * spread;
    const { r } = camDirs(); const u = V3().crossVectors(r, f).normalize();
    d.addScaledVector(r, Math.cos(ang) * rr).addScaledVector(u, Math.sin(ang) * rr).normalize();
    const res = shootRay(camera.position, d, W, mp, i === 0 || i % 3 === 0);
    if (res) hitAny = true;
  }
  if (hitAny) G.stats.hits++;
  sfx(W.sound, 1);
  muzzleFlash(mp, W.pellets ? 0.8 : 0.55);
  muzzleLight.position.copy(mp); muzzleLight.intensity = 6;
  smokePuff(mp, 1);
  P.pitch = Math.min(1.2, P.pitch + (W.pellets ? 0.05 : P.weapon === 'lever' ? 0.04 : 0.025));
  G.shake = Math.max(G.shake, W.pellets ? 0.35 : 0.15);
  if (P.weapon === 'lever') setTimeout(() => sfx('lever', 0.7), 320);
  if (a.mag === 0) setTimeout(startReload, 250);
}

// straal van de camera: raakt eerst een vijand of eerst de wereld?
function rayEnemies(o, d, maxT) {
  let best = maxT, hit = null, head = false;
  for (const e of G.enemies) {
    if (!e.alive) continue;
    const s = e.scale, y0 = e.y0 + (e.rider ? 0.62 : 0);
    const crouch = e.crouch > 0.5;
    // hoofd: bol
    const hc = V3(e.pos.x, y0 + (crouch ? 1.3 : 1.74) * s, e.pos.z);
    const oc = V3().subVectors(o, hc);
    const b = oc.dot(d), c = oc.lengthSq() - (0.19 * s) ** 2;
    const disc = b * b - c;
    if (disc > 0) { const t = -b - Math.sqrt(disc); if (t > 0 && t < best) { best = t; hit = e; head = true; } }
    // lijf: staande cilinder
    const rad = 0.3 * s * (e.boss ? 1.1 : 1);
    const ox = o.x - e.pos.x, oz = o.z - e.pos.z;
    const A = d.x * d.x + d.z * d.z, B = 2 * (ox * d.x + oz * d.z), Cc = ox * ox + oz * oz - rad * rad;
    const D = B * B - 4 * A * Cc;
    if (D > 0 && A > 1e-8) {
      const t = (-B - Math.sqrt(D)) / (2 * A);
      if (t > 0 && t < best) {
        const y = o.y + d.y * t;
        if (y > y0 + 0.05 && y < y0 + (crouch ? 1.15 : 1.56) * s) { best = t; hit = e; head = false; }
      }
    }
  }
  return { t: best, e: hit, head };
}

function shootRay(o, d, W, from, showTracer = true, forced) {
  const range = W.range || 80;
  const wr = G.world.ray(o, d, range);
  const er = forced || rayEnemies(o, d, wr.t);
  const t = er.e ? er.t : wr.t;
  const p = V3().copy(o).addScaledVector(d, Math.min(t, range));
  if (showTracer) tracer(from, p);
  if (er.e) {
    const dist = from.distanceTo(p);
    const fall = clamp(1 - Math.max(0, dist - (W.falloff || 999)) / (W.pellets ? 15 : 40), 0.2, 1);
    let dmg = W.dmg * fall * (er.head ? W.head : 1);
    damageEnemy(er.e, dmg, d, er.head, p);
    return true;
  }
  if (t < range) {
    if (wr.hit === 'ground') dust(p, 4, G.level.theme === 'snow' ? COL.snow : G.level.theme === 'river' ? COL.water : COL.dust);
    else { dust(p, 3, COL.wood); if (Math.random() < 0.25) sfx('ricochet', 0.4); else sfx('impact', 0.3); }
  }
  return false;
}

function knifeAttack() {
  P.cool = WEAPONS.knife.rate; P.melee = 1; P.shotT = 0;
  sfx('knife', 0.8);
  const { flat } = camDirs();
  let best = null, bd = 9;
  for (const e of G.enemies) {
    if (!e.alive || e.rider || e.y0 > 0.5) continue;
    const dx = e.pos.x - P.pos.x, dz = e.pos.z - P.pos.z, d = Math.hypot(dx, dz);
    if (d > WEAPONS.knife.range + 0.6) continue;
    const dot = (dx * flat.x + dz * flat.z) / (d || 1);
    if (dot < 0.45) continue;
    if (d < bd) { bd = d; best = e; }
  }
  if (best) {
    // even naar voren springen
    const dx = best.pos.x - P.pos.x, dz = best.pos.z - P.pos.z, d = Math.hypot(dx, dz);
    if (d > 1.1) { P.pos.x += dx / d * (d - 1.0); P.pos.z += dz / d * (d - 1.0); }
    setTimeout(() => {
      if (!best.alive) return;
      sfx('stab', 1);
      damageEnemy(best, WEAPONS.knife.dmg, V3(dx / d, 0, dz / d), false, V3(best.pos.x, best.y0 + 1.2, best.pos.z), true);
    }, 90);
  }
}

function throwDynamite() {
  const a = P.ammo.dynamite;
  if (!a || a.res + a.mag <= 0) { sfx('click'); P.cool = 0.4; return; }
  if (a.mag > 0) a.mag--; else a.res--;
  P.cool = WEAPONS.dynamite.rate; P.throwA = 1; P.shotT = 0;
  sfx('throw');
  const v = throwVel();
  const p = V3(P.pos.x, playerFeetY() + 1.7, P.pos.z);
  spawnDynamite(p, v, null);
  // automatisch de volgende pakken
  if (a.mag <= 0 && a.res > 0) { a.mag = 1; a.res--; }
}
function throwVel() {
  const { f } = camDirs();
  const v = f.clone().multiplyScalar(15);
  v.y += 4.5;
  if (G.ride) v.z -= G.ride.speed;
  return v;
}

// =====================================================================
//  dynamiet
// =====================================================================
const dynG = new THREE.BoxGeometry(0.08, 0.08, 0.26);
function spawnDynamite(p, v, owner) {
  const m = new THREE.Mesh(dynG, mat('#b8322a'));
  m.position.copy(p);
  scene.add(m);
  G.projectiles.push({ m, v, fuse: WEAPONS.dynamite.fuse + (owner ? 0.4 : 0), owner, spin: rand(4, 9) });
  sfx('fuse', 0.6);
}
function updateProjectiles(dt) {
  for (const pr of G.projectiles) {
    pr.fuse -= dt;
    pr.v.y -= 16 * dt;
    const np = pr.m.position.clone().addScaledVector(pr.v, dt);
    // stuiteren op de grond en tegen dozen
    if (np.y < 0.06) { np.y = 0.06; pr.v.y *= -0.3; pr.v.x *= 0.6; pr.v.z *= 0.6; }
    const before = { x: np.x, z: np.z };
    const pp = { x: np.x, z: np.z };
    G.world.pushOut(pp, 0.05, np.y - 0.05, 0.1);
    if (pp.x !== before.x) pr.v.x *= -0.4;
    if (pp.z !== before.z) pr.v.z *= -0.4;
    np.x = pp.x; np.z = pp.z;
    pr.m.position.copy(np);
    pr.m.rotation.x += pr.spin * dt; pr.m.rotation.y += pr.spin * 0.7 * dt;
    if (Math.random() < 0.6) fxSmall.emit(np.x, np.y + 0.1, np.z, rand(-0.5, 0.5), rand(0.5, 1.5), rand(-0.5, 0.5), 0.25, COL.spark, -2);
    if (pr.fuse <= 0) { explode(np, pr.owner); pr.dead = true; scene.remove(pr.m); }
  }
  G.projectiles = G.projectiles.filter((p) => !p.dead);
}
function explode(p, owner) {
  const R = WEAPONS.dynamite.radius;
  const dpl = Math.hypot(p.x - P.pos.x, p.z - P.pos.z, (p.y - playerFeetY() - 1));
  sfx('explosion', clamp(1.3 - dpl / 60, 0.2, 1), clamp((p.x - P.pos.x) / 20, -1, 1));
  G.shake = Math.max(G.shake, clamp(1.4 - dpl / 25, 0, 1.2));
  boomLight.position.set(p.x, p.y + 1.5, p.z); boomLight.intensity = 14;
  for (let i = 0; i < 26; i++) fxBig.emit(p.x, p.y + 0.4, p.z, rand(-4, 4), rand(1, 6), rand(-4, 4), rand(0.25, 0.6), Math.random() < 0.5 ? COL.fire : COL.fire2, -2, 3);
  for (let i = 0; i < 18; i++) fxBig.emit(p.x, p.y + 0.6, p.z, rand(-2, 2), rand(1, 3), rand(-2, 2), rand(1, 2.2), COL.smoke, 0.6, 1.2);
  for (let i = 0; i < 40; i++) fxSmall.emit(p.x, p.y + 0.3, p.z, rand(-8, 8), rand(3, 10), rand(-8, 8), rand(0.6, 1.4), Math.random() < 0.5 ? COL.dust : COL.wood);
  for (const e of G.enemies) {
    if (!e.alive) continue;
    const d = Math.hypot(e.pos.x - p.x, e.pos.z - p.z, (e.y0 + 1) - p.y);
    if (d < R) {
      const dir = V3(e.pos.x - p.x, 0, e.pos.z - p.z).normalize();
      damageEnemy(e, WEAPONS.dynamite.dmg * (1 - d / R * 0.75) * (owner ? 0.5 : 1), dir, false, V3(e.pos.x, e.y0 + 1, e.pos.z), false, true);
    }
  }
  if (dpl < R * 0.95 && !P.dead) hurtPlayer((owner ? 75 : 55) * (1 - dpl / R * 0.8), p);
}

// =====================================================================
//  pickups
// =====================================================================
function spawnPickup(kind, x, z) {
  const g = new THREE.Group();
  if (kind === 'ammo') { g.add(new THREE.Mesh(box(0.35, 0.22, 0.25), mat('#6a4a2a'))); const l = new THREE.Mesh(box(0.36, 0.08, 0.26), mat('#c8a040')); l.position.y = 0.05; g.add(l); }
  else if (kind === 'tonic') { const b = new THREE.Mesh(box(0.14, 0.3, 0.14), mat('#a82a2a')); b.position.y = 0.05; g.add(b); const n = new THREE.Mesh(box(0.06, 0.1, 0.06), mat('#e8e0c0')); n.position.y = 0.25; g.add(n); }
  else if (kind === 'dyn') { for (let i = 0; i < 3; i++) { const s = new THREE.Mesh(box(0.08, 0.28, 0.08), mat('#b8322a')); s.position.x = (i - 1) * 0.09; g.add(s); } }
  g.position.set(x, 0.25, z);
  scene.add(g);
  G.pickups.push({ kind, g, t: 0 });
}
function updatePickups(dt) {
  for (const k of G.pickups) {
    k.t += dt;
    k.g.rotation.y += dt * 2;
    k.g.position.y = 0.3 + Math.sin(k.t * 3) * 0.06 + (G.ride ? 0 : 0);
    const d = Math.hypot(k.g.position.x - P.pos.x, k.g.position.z - P.pos.z);
    if (d < 1.5 && !P.dead && !G.ride) {
      k.dead = true; scene.remove(k.g); sfx('pickup', 0.7);
      if (k.kind === 'ammo') {
        for (const w of P.owned) {
          const W = WEAPONS[w], a = P.ammo[w];
          if (!W.mag || W.throwable) continue;
          a.res = Math.min(W.maxReserve, a.res + Math.ceil(W.mag * (w === 'shotgun' ? 2 : 1.5)));
        }
        if (P.owned.includes('dynamite') && Math.random() < 0.3) P.ammo.dynamite.res = Math.min(6, P.ammo.dynamite.res + 1);
        toast('Munitie', '', 0.9);
      } else if (k.kind === 'tonic') {
        P.hp = Math.min(100, P.hp + 60); P.de = Math.min(100, P.de + 35);
        toast('Health Tonic', '+ leven, + Dead Eye', 1.2);
      } else if (k.kind === 'dyn') {
        if (P.ammo.dynamite) P.ammo.dynamite.res = Math.min(6, P.ammo.dynamite.res + 2);
        toast('Dynamiet', '+2', 0.9);
      }
    }
    if (k.t > 60) { k.dead = true; scene.remove(k.g); }
  }
  G.pickups = G.pickups.filter((k) => !k.dead);
}

// =====================================================================
//  schade aan de speler
// =====================================================================
function hurtPlayer(dmg, from) {
  if (P.dead || G.god || G.mode === 'cut' || G.mode === 'done') return;
  dmg *= [0.55, 1, 1.45][save.set.diff] ?? 1;
  P.hp -= dmg; P.dmgT = 0;
  G.stats.taken += dmg;
  sfx('hurt', clamp(dmg / 25, 0.3, 1));
  G.shake = Math.max(G.shake, 0.25);
  if (from) G.hurtDir.push({ a: Math.atan2(from.x - P.pos.x, from.z - P.pos.z), t: 1.2 });
  if (P.hp <= 0) playerDie();
}

// =====================================================================
//  vijanden
// =====================================================================
const GUNMAP = { revolver: 'revolver', rifle: 'lever', shotgun: 'shotgun', knife: 'knife', dynamite: 'dynamite' };
let lookR = rng(1234);
function spawnEnemy(code, x, z, o = {}) {
  const def = { ...(o.boss ? { kind: 'boss', burst: 2, range: [6, 20], speed: 3.8, ...o.boss } : ENEMY[code]) };
  const look = o.look || (o.boss ? o.boss.look : goonLook(lookR, G.level.faction, def.kind));
  const model = makeHuman(look);
  setGun(model, GUNMAP[def.gun]);
  scene.add(model);
  const lvl = G.li;
  const e = {
    code, def, model, alive: true, hp: def.hp * (o.boss ? 1 : 1 + lvl * 0.012), pos: V3(x, 0, z), y0: o.y || 0,
    yaw: Math.PI * 0, scale: look.scale || 1, state: 'move', goal: null, repath: rand(0.5, 2), shootT: rand(1.2, 2.6), aimT: 0, burst: 0,
    crouch: 0, crouchOn: false, coverT: 0, stagger: 0, deadT: 0, see: false, seeT: 0, speed: def.speed * rand(0.9, 1.1),
    name: o.name || null, boss: o.boss || null, lastPos: V3(x, 0, z), stuckT: 0, melee: 0, throwT: rand(2, 5),
    rider: null, flee: false, duel: !!o.duel, dmgMul: o.boss ? 1 : 0.8 + lvl * 0.025, acc: def.acc * (0.92 + lvl * 0.01), perch: !!def.perch || !!o.perch,
    vel: V3(), drawn: !o.duel, lineT: rand(4, 8), adds: 0,
  };
  e.maxHp = e.hp;
  if (def.rider || o.rider) {
    const horse = makeHorse(pick(['#6b4228', '#3a2a1a', '#8a6a4a', '#c8b8a0', '#2a2a2a']), '#1a1208');
    scene.add(horse);
    e.rider = { horse, slot: o.slot || null, side: o.side || (Math.random() < 0.5 ? -1 : 1), zOff: rand(-6, 10), weave: rand(0, 6) };
  }
  model.position.set(x, e.y0, z);
  G.enemies.push(e);
  return e;
}

function damageEnemy(e, dmg, dir, head, at, melee, boom) {
  if (!e.alive) return;
  if (e.boss && e.bossIntro) return;
  e.hp -= dmg;
  e.stagger = e.boss ? 0.1 : 0.35;
  G.hitMark = 0.18;
  blood(at, dir, head ? 18 : 10);
  if (head) sfx('headshot', 0.9); else sfx('flesh', 0.8);
  sfx('hitmark', 0.6);
  if (e.boss) G.bossHit = 0.15;
  if (e.hp <= 0) killEnemy(e, dir, head, melee, boom);
  else if (!e.boss) e.crouchOn = false;
}
function killEnemy(e, dir, head, melee, boom) {
  e.alive = false; e.deadT = 0;
  e.deadDir = (dir.x * Math.sin(e.model.rotation.y) + dir.z * Math.cos(e.model.rotation.y)) > 0 ? -1 : 1;
  e.fly = boom ? V3(dir.x * 6, 5, dir.z * 6) : V3(dir.x * (head ? 1.2 : 0.6), 0, dir.z * (head ? 1.2 : 0.6));
  sfx('death', 0.6, clamp((e.pos.x - P.pos.x) / 15, -1, 1));
  G.stats.kills++;
  if (head) G.stats.heads++;
  if (melee) G.stats.melee++;
  G.bounty += head ? 12 : 6;
  P.de = Math.min(100, P.de + (head ? 9 : 5));
  if (e.rider) {
    // paard rent door
    e.rider.loose = true;
    e.fly.y = 2;
  }
  if (!e.duel && !e.rider && Math.random() < (P.hp < 50 ? 0.6 : 0.45)) spawnPickup(Math.random() < 0.12 ? 'tonic' : Math.random() < 0.08 && P.owned.includes('dynamite') ? 'dyn' : 'ammo', e.pos.x, e.pos.z);
  G.corpses.push(e);
  if (G.corpses.length > 16) { const c = G.corpses.shift(); removeEnemy(c); }
}
function removeEnemy(e) {
  scene.remove(e.model);
  if (e.rider) scene.remove(e.rider.horse);
  e.removed = true; e.gone = true;
}

function enemyEye(e) { return V3(e.pos.x, e.y0 + (e.rider ? 0.62 : 0) + (e.crouch > 0.5 ? 1.25 : 1.65) * e.scale, e.pos.z); }
function playerChest() { return V3(P.pos.x, playerFeetY() + (P.crouch > 0.5 ? 0.85 : 1.3), P.pos.z); }

// zoek dekking: een doos tussen de vijand en de speler
function findCover(e) {
  let best = null, bs = 1e9;
  const px = P.pos.x, pz = P.pos.z;
  for (const c of G.world.colliders) {
    if (c.y1 < 0.85 || c.y1 > 2.6 || c.y0 > 0.1) continue;
    const cx = (c.x0 + c.x1) / 2, cz = (c.z0 + c.z1) / 2;
    const d = Math.hypot(cx - e.pos.x, cz - e.pos.z);
    if (d > 14) continue;
    const dp = Math.hypot(cx - px, cz - pz);
    if (dp < e.def.range[0] + 1 || dp > e.def.range[1] + 6) continue;
    // plek aan de andere kant dan de speler
    const ax = cx - px, az = cz - pz, al = Math.hypot(ax, az);
    const hw = (c.x1 - c.x0) / 2, hd = (c.z1 - c.z0) / 2;
    const off = Math.max(Math.abs(ax / al) * hw, Math.abs(az / al) * hd) + 0.55;
    const gx = cx + ax / al * off, gz = cz + az / al * off;
    if (Math.abs(gx) > G.world.hw - 0.7) continue;
    if (G.enemies.some((o) => o !== e && o.alive && o.goal && Math.hypot(o.goal.x - gx, o.goal.z - gz) < 1.2)) continue;
    const score = d + Math.random() * 4;
    if (score < bs) { bs = score; best = { x: gx, z: gz, cover: true }; }
  }
  return best;
}
function ringGoal(e) {
  const d = rand(e.def.range[0], e.def.range[1]);
  const base = Math.atan2(e.pos.x - P.pos.x, e.pos.z - P.pos.z);
  const a = base + rand(-0.9, 0.9);
  let x = P.pos.x + Math.sin(a) * d, z = P.pos.z + Math.cos(a) * d;
  x = clamp(x, -G.world.hw + 1, G.world.hw - 1);
  z = clamp(z, G.world.endZ + 2, 9);
  return { x, z, cover: false };
}

function updateEnemy(e, dt) {
  const m = e.model;
  if (!e.alive) {
    e.deadT += dt;
    if (e.fly) {
      e.pos.addScaledVector(e.fly, dt * Math.max(0, 1 - e.deadT * 1.5));
      if (e.fly.y) { e.y0 = Math.max(0, e.y0 + e.fly.y * dt); e.fly.y -= 14 * dt; }
    }
    if (e.y0 > 0 && !e.fly?.y) e.y0 = Math.max(0, e.y0 - dt * 6 * e.deadT);
    m.position.set(e.pos.x, Math.max(0, e.y0), e.pos.z);
    animHuman(m, { dead: Math.min(1, e.deadT * 2.2), deadDir: e.deadDir }, dt);
    if (e.rider) {
      const h = e.rider.horse;
      h.position.z -= (G.ride ? G.ride.speed * 0.6 : 7) * dt;
      h.position.x += e.rider.side * dt * 3;
      animHorse(h, 9, dt);
      if (e.deadT > 4) scene.remove(h);
    }
    return;
  }
  if (e.duel) { duelEnemyAnim(e, dt); return; }
  const dx = P.pos.x - e.pos.x, dz = P.pos.z - e.pos.z, dist = Math.hypot(dx, dz);
  e.seeT -= dt;
  if (e.seeT <= 0) { e.seeT = 0.3 + Math.random() * 0.2; e.see = !P.dead && G.world.los(enemyEye(e), playerChest()); }
  e.stagger -= dt; e.shootT -= dt; e.repath -= dt; e.melee = Math.max(0, e.melee - dt * 3);
  if (e.boss) bossThink(e, dt, dist);
  let moveX = 0, moveZ = 0, speed = 0;
  const def = e.def;
  if (e.flee) {
    moveX = e.pos.x > 0 ? 1 : -1; moveZ = (e.pos.z < P.pos.z ? -1 : 1) * 0.6;
    speed = 5;
    e.fleeT = (e.fleeT || 0) + dt;
    if (e.fleeT > 5 || dist > 45) { e.alive = false; removeEnemy(e); e.gone = true; return; }
  } else if (e.rider) {
    riderThink(e, dt);
  } else if (def.melee && !e.boss?.gun) {
    // brute: recht op je af
    speed = dist > 1.3 ? e.speed : 0;
    moveX = dx / (dist || 1); moveZ = dz / (dist || 1);
    if (dist < 1.8 && e.shootT <= 0 && !P.dead) {
      e.shootT = def.rate; e.melee = 1;
      setTimeout(() => {
        if (e.alive && Math.hypot(P.pos.x - e.pos.x, P.pos.z - e.pos.z) < 2.3) { sfx('stab', 1); hurtPlayer(def.dmg * e.dmgMul, e.pos); blood(playerChest(), V3(dx, 0, dz).normalize(), 8); }
      }, 260);
    }
  } else if (!e.perch) {
    // schutters: zoek dekking of een plek op afstand, duik weg en kom omhoog om te schieten
    const tooFar = dist > def.range[1] + 4 || !e.see && e.repath < -3;
    if (!e.goal || e.repath <= 0 || tooFar) {
      e.goal = (Math.random() < 0.65 ? findCover(e) : null) || ringGoal(e);
      e.repath = rand(4, 8);
      e.stuckT = 0;
    }
    const gx = e.goal.x - e.pos.x, gz = e.goal.z - e.pos.z, gd = Math.hypot(gx, gz);
    if (gd > 0.4) {
      speed = e.speed * (e.aimT > 0 ? 0.4 : 1);
      moveX = gx / gd; moveZ = gz / gd;
      e.crouchOn = false;
      e.stuckT += dt;
      if (e.stuckT > 1.2) {
        if (e.pos.distanceTo(e.lastPos) < 0.6) { e.goal = ringGoal(e); }
        e.lastPos.copy(e.pos); e.stuckT = 0;
      }
    } else if (e.goal.cover) {
      // in dekking: bukken tussen de salvo's
      e.coverT -= dt;
      if (e.coverT <= 0) { e.crouchOn = !e.crouchOn; e.coverT = e.crouchOn ? rand(1.2, 2.6) : rand(2, 3.5); }
    }
  } else {
    // op een dak: af en toe bukken
    e.coverT -= dt;
    if (e.coverT <= 0) { e.crouchOn = !e.crouchOn; e.coverT = e.crouchOn ? rand(1.5, 3) : rand(2.5, 4.5); }
  }
  // schieten
  if (!def.melee || e.boss?.gun) {
    const inRange = dist < (def.maxRange || def.range[1] * 1.8 + 8);
    if (e.aimT > 0) {
      e.aimT -= dt;
      e.crouchOn = false;
      if (e.aimT <= 0) {
        if (def.throws && !e.boss) { enemyThrow(e); e.shootT = def.rate * rand(0.8, 1.3); }
        else { e.burst = def.burst; e.burstT = 0; }
      }
    } else if (e.burst > 0) {
      e.burstT -= dt;
      if (e.burstT <= 0) { enemyShoot(e, dist); e.burst--; e.burstT = 0.22; if (e.burst <= 0) e.shootT = def.rate * rand(0.8, 1.35); }
    } else if (e.shootT <= 0 && e.see && inRange && e.stagger <= 0 && !P.dead && !e.flee && G.mode === 'play') {
      if (e.crouchOn && !e.perch && Math.random() < 0.5) { e.crouchOn = false; e.shootT = 0.4; }
      else e.aimT = def.throws ? 0.6 : 0.45;
    } else if (e.shootT <= 0 && !e.see) e.shootT = 0.4;
  }
  if (e.stagger > 0) speed *= 0.3;
  e.crouch = lerp(e.crouch, e.crouchOn ? 1 : 0, 1 - Math.exp(-dt * 8));
  if (!e.rider) {
    const k = 1 - Math.exp(-dt * 8);
    e.vel.x = lerp(e.vel.x, moveX * speed, k); e.vel.z = lerp(e.vel.z, moveZ * speed, k);
    e.pos.x += e.vel.x * dt; e.pos.z += e.vel.z * dt;
    if (!e.perch) {
      G.world.pushOut(e.pos, 0.35, 0, 1.7);
      // niet in elkaar lopen
      for (const o of G.enemies) {
        if (o === e || !o.alive || o.perch || o.rider) continue;
        const ox = e.pos.x - o.pos.x, oz = e.pos.z - o.pos.z, od = Math.hypot(ox, oz);
        if (od < 0.7 && od > 0.001) { e.pos.x += ox / od * (0.7 - od) * 0.5; e.pos.z += oz / od * (0.7 - od) * 0.5; }
      }
      e.pos.x = clamp(e.pos.x, -G.world.hw + 0.5, G.world.hw - 0.5);
    }
  }
  // draaien
  const aiming = e.aimT > 0 || e.burst > 0 || (e.see && dist < 30 && !e.flee);
  const tgt = aiming || e.rider ? Math.atan2(dx, dz) : Math.atan2(e.vel.x || dx, e.vel.z || dz);
  e.yaw += angDiff(e.yaw, tgt) * (1 - Math.exp(-dt * 8));
  m.rotation.y = e.yaw;
  m.position.set(e.pos.x, e.y0 + (e.rider ? 0.62 : 0), e.pos.z);
  const pitch = Math.atan2((playerFeetY() + 1.2) - (e.y0 + 1.5), dist) * (aiming ? 1 : 0);
  animHuman(m, { speed: e.rider ? 0 : Math.hypot(e.vel.x, e.vel.z), aim: e.def.melee && !e.boss?.gun ? 0 : aiming ? 1 : 0, pitch, crouch: e.crouch, ride: !!e.rider, melee: e.melee, throwing: e.aimT > 0 && def.throws ? 1 - e.aimT / 0.6 : 0 }, dt);
}

function enemyShoot(e, dist) {
  const gun = e.def.gun;
  const from = V3(e.pos.x, e.y0 + (e.rider ? 0.62 : 0) + (e.crouch > 0.5 ? 1.1 : 1.45) * e.scale, e.pos.z);
  const fwd = V3(Math.sin(e.yaw), 0, Math.cos(e.yaw));
  from.addScaledVector(fwd, 0.6);
  const tgt = playerChest();
  const pan = clamp((e.pos.x - P.pos.x) / 15, -1, 1);
  sfx(gun === 'shotgun' ? 'shotgun' : gun === 'rifle' ? 'rifle' : 'enemyShot', clamp(1.1 - dist / 70, 0.15, 0.75), pan);
  muzzleFlash(from, gun === 'shotgun' ? 0.7 : 0.45);
  // kans om te raken
  const moving = Math.hypot(P.vel.x, P.vel.z);
  let hit = e.acc * clamp(1.2 - dist / ((e.def.range[1] || 20) * 2.3), 0.22, 1);
  if (moving > 5) hit *= 0.55; else if (moving > 2) hit *= 0.72;
  if (P.crouch > 0.5) hit *= 0.85;
  if (G.de && G.de.active) hit *= 0.5;
  if (G.ride) hit *= 0.75;
  if (e.rider) hit *= 0.8;
  if (P.dmgT < 0.6) hit *= 0.7; // niet alles tegelijk
  const blocked = !G.world.los(from, tgt);
  if (!blocked && Math.random() < hit) {
    let dmg = e.def.dmg * e.dmgMul;
    if (gun === 'shotgun') dmg *= clamp(1.3 - dist / 14, 0.2, 1.2);
    tracer(from, tgt);
    hurtPlayer(dmg, e.pos);
    blood(tgt, V3().subVectors(tgt, from).normalize(), 6);
  } else {
    const miss = tgt.clone().add(V3(rand(-1.2, 1.2), rand(-0.5, 1.2), rand(-1.2, 1.2)));
    const d = V3().subVectors(miss, from).normalize();
    const r = G.world.ray(from, d, 120);
    const end = from.clone().addScaledVector(d, Math.min(r.t, from.distanceTo(miss) + 15));
    tracer(from, end);
    if (r.t < 120) dust(end, 3);
    if (from.distanceTo(tgt) > 4) sfx('whizz', 0.6, pan);
  }
}
function enemyThrow(e) {
  const from = V3(e.pos.x, e.y0 + 1.8, e.pos.z);
  const tgt = V3(P.pos.x + P.vel.x * 0.8, playerFeetY(), P.pos.z + P.vel.z * 0.8);
  const d = Math.hypot(tgt.x - from.x, tgt.z - from.z);
  const T = clamp(d / 11, 0.7, 1.8);
  const v = V3((tgt.x - from.x) / T + rand(-1, 1), (tgt.y - from.y + 0.5 * 16 * T * T) / T, (tgt.z - from.z) / T + rand(-1, 1));
  spawnDynamite(from, v, e);
  e.melee = 0;
  shout(e, pick(['Fire in the hole!', 'Catch, frikandel boy!', 'Eat this!']));
}

function shout(e, line) {
  if (G.lastShout > G.t - 3) return;
  G.lastShout = G.t;
  subtitle(e.name || (G.level.faction === 'plus' ? 'Pinkerton' : G.level.faction === 'gang' ? 'Hemmet Gang' : G.level.faction === 'law' ? 'Hulpsheriff' : 'Premiejager'), line, 2);
}

// ruiters: rijden naast je mee (op een rit) of cirkelen om je heen
function riderThink(e, dt) {
  const R = e.rider, h = R.horse;
  R.weave += dt;
  let tx, tz, sp;
  if (G.ride) {
    const bank = G.level.theme === 'river' ? G.world.hw + 4 : G.world.hw - 2.2;
    tx = R.side * (bank - Math.abs(Math.sin(R.weave * 0.4)) * (G.level.theme === 'river' ? 0 : 3));
    tz = G.ride.z + R.zOff + Math.sin(R.weave * 0.7) * 3;
    sp = G.ride.speed + 6;
  } else {
    const a = R.weave * 0.35 * R.side;
    tx = clamp(P.pos.x + Math.sin(a) * 13, -G.world.hw + 1.5, G.world.hw - 1.5);
    tz = P.pos.z + Math.cos(a) * 13;
    sp = 7.5;
  }
  const dx = tx - e.pos.x, dz = tz - e.pos.z, d = Math.hypot(dx, dz);
  const want = Math.min(sp, d * 1.5 + (G.ride ? G.ride.speed : 0));
  const k = 1 - Math.exp(-dt * 2);
  e.vel.x = lerp(e.vel.x, dx / (d || 1) * want, k); e.vel.z = lerp(e.vel.z, dz / (d || 1) * want, k);
  e.pos.x += e.vel.x * dt; e.pos.z += e.vel.z * dt;
  const hs = Math.hypot(e.vel.x, e.vel.z);
  h.position.set(e.pos.x, e.y0, e.pos.z);
  if (hs > 0.5) h.rotation.y += angDiff(h.rotation.y, Math.atan2(e.vel.x, e.vel.z)) * (1 - Math.exp(-dt * 6));
  animHorse(h, hs, dt);
  if (hs > 3 && Math.random() < dt * 2) sfx('gallop', clamp(0.5 - Math.hypot(e.pos.x - P.pos.x, e.pos.z - P.pos.z) / 40, 0, 0.4));
}

// =====================================================================
//  Dead Eye
// =====================================================================
function deadEyeToggle() {
  const W = WEAPONS[P.weapon];
  if (G.de && G.de.active) { deadEyeRelease(); return; }
  if (G.mode !== 'play' || P.dead) return;
  if (W.melee || W.throwable) { toast('Dead Eye', 'Alleen met een vuurwapen', 1); return; }
  if (P.de < 15) { toast('Dead Eye', 'Niet genoeg Dead Eye', 1); return; }
  if (P.ammo[P.weapon].mag <= 0) { startReload(); return; }
  G.de = { active: true, marks: [], firing: false, fireT: 0, beat: 0 };
  P.reload = 0;
  sfx('deadeyeOn'); setSlow(true);
  document.body.classList.add('deadeye');
}
function deadEyeMark() {
  const de = G.de;
  const maxMarks = P.ammo[P.weapon].mag;
  if (de.marks.length >= maxMarks) return;
  const { f } = camDirs();
  const wr = G.world.ray(camera.position, f, 150);
  const er = rayEnemies(camera.position, f, wr.t);
  if (!er.e) return;
  const p = camera.position.clone().addScaledVector(f, er.t);
  de.marks.push({ e: er.e, off: V3().subVectors(p, V3(er.e.pos.x, er.e.y0, er.e.pos.z)), head: er.head });
  sfx('mark');
  if (de.marks.length >= maxMarks) deadEyeRelease();
}
function deadEyeRelease() {
  const de = G.de;
  if (!de || de.firing) return;
  if (!de.marks.length) { deadEyeEnd(); return; }
  de.firing = true; de.fireT = 0.05;
}
function deadEyeEnd() {
  if (!G.de) return;
  G.de = null;
  sfx('deadeyeOff'); setSlow(false);
  document.body.classList.remove('deadeye');
}
function updateDeadEye(dtr) {
  const de = G.de;
  if (!de) return;
  if (!de.firing) {
    P.de -= dtr * 11;
    de.beat -= dtr;
    if (de.beat <= 0) { de.beat = 0.75; sfx('heart', 0.8); }
    if (mouse.lPressed) deadEyeMark();
    if (P.de <= 0) { P.de = 0; deadEyeRelease(); }
    return;
  }
  de.fireT -= dtr;
  if (de.fireT > 0) return;
  const mk = de.marks.shift();
  const W = WEAPONS[P.weapon], a = P.ammo[P.weapon];
  if (mk && a.mag > 0) {
    a.mag--; G.stats.shots++;
    P.shotT = 0;
    const tp = V3(mk.e.pos.x, mk.e.y0, mk.e.pos.z).add(mk.off);
    const mp = muzzlePos();
    sfx(W.sound, 1); muzzleFlash(mp, 0.6); muzzleLight.position.copy(mp); muzzleLight.intensity = 6;
    // richten op de markering
    const d = V3().subVectors(tp, camera.position).normalize();
    P.yaw = Math.atan2(-d.x, -d.z); P.pitch = Math.asin(clamp(d.y, -1, 1));
    if (mk.e.alive) {
      tracer(mp, tp);
      G.stats.hits++;
      const dist = mp.distanceTo(tp);
      const fall = clamp(1 - Math.max(0, dist - (W.falloff || 999)) / (W.pellets ? 15 : 40), 0.35, 1);
      const dmg = W.dmg * (W.pellets ? W.pellets * 0.85 : 1) * (mk.head ? W.head : 1.15) * fall;
      damageEnemy(mk.e, dmg, d, mk.head, tp);
    } else tracer(mp, tp);
    de.fireT = 0.14;
  }
  if (!de.marks.length || a.mag <= 0) { de.marks = []; setTimeout(deadEyeEnd, 150); de.fireT = 99; if (a.mag <= 0) setTimeout(startReload, 300); }
}

// =====================================================================
//  voertuigen voor ritten
// =====================================================================
function makeVehicle(kind) {
  const g = new THREE.Group();
  const V = { kind, mesh: g, z: 0, speed: 0, deckY: 0, bounds: [-0.4, 0.4, -0.4, 0.4], colls: [], horse: kind === 'horse' };
  const add = (w, h, d, c, x, y, z, coll) => {
    const m = new THREE.Mesh(box(w, h, d), mat(c)); m.position.set(x, y + h / 2, z); g.add(m);
    if (coll) V.colls.push({ lx: x, lz: z, w, d, y0: y, y1: y + h, c: G.world.solid(0, 0, w, d, y + h, y) });
    return m;
  };
  if (kind === 'horse') {
    const h = makeHorse('#c89050', '#f0e0c0');
    g.add(h); V.horseMesh = h;
    V.speed = 9.5; V.deckY = 0.62;
    V.bounds = [0, 0, 0, 0];
  } else if (kind === 'wagon') {
    add(2.4, 0.3, 4.4, '#7a5030', 0, 0.8, 0);
    add(0.12, 0.6, 4.4, '#6a4428', -1.15, 1.1, 0); add(0.12, 0.6, 4.4, '#6a4428', 1.15, 1.1, 0);
    add(0.9, 0.9, 0.9, '#9a6a3a', 0.6, 1.1, 1.2, true);
    add(0.8, 0.8, 0.8, '#9a6a3a', -0.6, 1.1, -0.8, true);
    for (const [x, z] of [[1.2, 1.5], [-1.2, 1.5], [1.2, -1.5], [-1.2, -1.5]]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.12, 8), mat('#4a2c18')); w.rotation.z = Math.PI / 2; w.position.set(x, 0.6, z); g.add(w); }
    for (const x of [-0.6, 0.6]) { const h = makeHorse(pick(['#6b4228', '#3a2a1a']), '#1a1208'); h.position.set(x, 0, -3.8); g.add(h); (V.pullers = V.pullers || []).push(h); }
    const jansje = makeHuman({ skin: '#e8c0a0', hair: 'long', hairColor: '#d8b060', shirt: '#7a4a6a', pants: '#3a2a3a', hat: 'cowboy', hatColor: '#c8a870' });
    jansje.position.set(0, 1.1, -1.9); g.add(jansje); V.driver = jansje;
    V.speed = 7.5; V.deckY = 1.1; V.bounds = [-0.9, 0.9, -1.4, 1.9];
  } else if (kind === 'train') {
    // platte wagon waar je op staat, locomotief ervoor, nog een wagon erachter
    add(2.8, 0.3, 10, '#4a3a2a', 0, 1.1, 0);
    add(1, 1, 1, '#9a6a3a', 0.7, 1.4, 2.5, true); add(1, 1, 1, '#9a6a3a', -0.8, 1.4, -1.5, true);
    add(2.4, 0.9, 0.5, '#7a6a4a', 0, 1.4, -4.6, true);
    add(2.6, 2.6, 7, '#2a2a2e', 0, 1.1, -9.5); add(2.2, 1.2, 2.5, '#1a1a1e', 0, 3.7, -7.5);
    const ch = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 1.6, 8), mat('#1a1a1e')); ch.position.set(0, 4.4, -11.5); g.add(ch); V.chimney = ch;
    add(2.8, 3, 9, '#8a2a1a', 0, 1.1, 10);
    for (let z = -12; z <= 13; z += 2.5) for (const x of [-1.1, 1.1]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.15, 8), mat('#333')); w.rotation.z = Math.PI / 2; w.position.set(x, 0.55, z); g.add(w); }
    V.speed = 11; V.deckY = 1.4; V.bounds = [-1.2, 1.2, -4.2, 4.6];
  } else if (kind === 'boat') {
    add(5, 1.2, 16, '#6a4a2a', 0, -0.3, 0);
    add(5.2, 0.15, 16.2, '#8a6a4a', 0, 0.9, 0);
    add(3.2, 2.4, 5, '#e8e0d0', 0, 1.05, -3.5);
    add(3.6, 0.2, 5.6, '#3a3a3a', 0, 3.45, -3.5);
    const ch = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 3, 8), mat('#1a1a1e')); ch.position.set(0, 5, -3.5); g.add(ch); V.chimney = ch;
    add(1, 0.9, 1, '#9a6a3a', 1.5, 1.05, 3, true); add(1, 0.9, 1, '#9a6a3a', -1.5, 1.05, 1.5, true); add(1, 0.9, 1, '#9a6a3a', 0.2, 1.05, 5.5, true);
    const wheel = new THREE.Group();
    for (let i = 0; i < 6; i++) { const p = new THREE.Mesh(box(4.4, 0.15, 0.9), mat('#8a2a1a')); const gg = new THREE.Group(); gg.rotation.x = i * Math.PI / 3; p.position.y = 1.1; gg.add(p); wheel.add(gg); }
    wheel.position.set(0, 0.6, 9); g.add(wheel); V.wheel = wheel;
    V.speed = 7; V.deckY = 1.05; V.bounds = [-2.2, 2.2, -0.8, 7.5];
  }
  scene.add(g);
  return V;
}
function startRide(S) {
  const kind = S.s.vehicle;
  if (G.ride && G.ride.kind === kind) return;
  endRide();
  const V = makeVehicle(kind);
  V.z = S.start;
  V.x = 0;
  G.ride = V;
  P.pos.set(0, 0, V.z + (kind === 'horse' ? 0 : kind === 'wagon' ? 0.5 : kind === 'boat' ? 4 : 2));
  P.yaw = 0; P.pitch = -0.05;
  if (kind === 'horse') sfx('horse', 0.8);
  updateRide(0);
}
function endRide() {
  if (!G.ride) return;
  scene.remove(G.ride.mesh);
  for (const c of G.ride.colls) G.world.colliders.splice(G.world.colliders.indexOf(c.c), 1);
  G.ride = null;
}
function rideControl(dt, wish, sp) {
  const V = G.ride;
  if (V.horse) {
    // paard: links/rechts sturen, W/S iets sneller/langzamer
    const { r } = camDirs();
    const side = wish.dot(r);
    V.x = clamp((V.x || 0) + side * 5 * dt, -G.world.hw + 2, G.world.hw - 2);
    P.pos.x = V.x; P.pos.z = V.z;
    P.vel.set(0, 0, -V.speed);
    return;
  }
  const k = 1 - Math.exp(-dt * 12);
  P.vel.x = lerp(P.vel.x, wish.x * Math.min(sp, 3.5), k); P.vel.z = lerp(P.vel.z, wish.z * Math.min(sp, 3.5), k);
  let lx = P.pos.x - V.x + P.vel.x * dt, lz = P.pos.z - V.z + P.vel.z * dt;
  lx = clamp(lx, V.bounds[0], V.bounds[1]); lz = clamp(lz, V.bounds[2], V.bounds[3]);
  P.pos.x = V.x + lx; P.pos.z = V.z + lz;
  G.world.pushOut(P.pos, 0.3, V.deckY, 1.7);
  lx = clamp(P.pos.x - V.x, V.bounds[0], V.bounds[1]); lz = clamp(P.pos.z - V.z, V.bounds[2], V.bounds[3]);
  P.pos.x = V.x + lx; P.pos.z = V.z + lz;
}
function updateRide(dt) {
  const V = G.ride;
  if (!V) return;
  const dz = -V.speed * dt;
  V.z += dz;
  if (!V.horse) P.pos.z += dz;
  V.mesh.position.set(V.horse ? V.x : V.x || 0, 0, V.z);
  if (V.horse) { V.mesh.rotation.y = Math.PI; animHorse(V.horseMesh, V.speed, dt); if (Math.random() < dt * 3) sfx('gallop', 0.35); }
  else V.mesh.rotation.y = 0;
  if (V.pullers) V.pullers.forEach((h) => { h.rotation.y = Math.PI; animHorse(h, V.speed, dt); });
  if (V.driver) animHuman(V.driver, { sit: true }, dt), V.driver.rotation.y = Math.PI;
  if (V.wheel) V.wheel.rotation.x -= dt * 3;
  if (V.chimney && Math.random() < dt * 12) { const p = V3(); V.chimney.getWorldPosition(p); fxBig.emit(p.x, p.y + 1, p.z, rand(-0.3, 0.3), 2, rand(0.5, 2) + V.speed * 0.6, 1.6, COL.smoke, 0.4, 0.5); }
  for (const c of V.colls) {
    const x = (V.x || 0) + c.lx, z = V.z + c.lz;
    c.c.x0 = x - c.w / 2; c.c.x1 = x + c.w / 2; c.c.z0 = z - c.d / 2; c.c.z1 = z + c.d / 2;
  }
}

// =====================================================================
//  secties: golven, doelen, checkpoints
// =====================================================================
function objective(text, pos) { G.obj = { text, pos: pos || null }; $('#obj').textContent = text || ''; }
function aliveFoes() { return G.enemies.filter((e) => e.alive && !e.flee && !e.duel); }
function saveCheckpoint(i) {
  G.cp = {
    i, pos: P.pos.clone(), yaw: P.yaw, hp: 100, owned: [...P.owned], weapon: P.weapon, de: Math.max(P.de, 40),
    ammo: JSON.parse(JSON.stringify(P.ammo)), bounty: G.bounty,
  };
}
function activateSection(i, fromCp) {
  const W = G.world;
  const S = W.sections[i];
  G.secIdx = i;
  G.sec = { S, s: S.s, i, wave: 0, waveT: 0, t: 0, done: false, timer: S.s.time || 0, last: 0, talk: false };
  G.nextTrigger = null;
  if (!fromCp) saveCheckpoint(i);
  const s = S.s;
  if (s.say && !fromCp) queueSubs(s.say);
  switch (s.t) {
    case 'fight': objective(s.obj); spawnWave(s.waves[0]); G.sec.wave = 1; music('combat'); break;
    case 'escape': objective(s.obj, V3(0, 0, S.end)); spawnWave(s.waves[0]); G.sec.wave = 1; music('combat'); break;
    case 'defend': objective(s.obj, V3(S.center.x, 0, S.center.z)); music('combat'); break;
    case 'boss': {
      objective(s.obj);
      const B = BOSSES[s.boss];
      const e = spawnEnemy('boss', 0, Math.min(S.start - 14, P.pos.z - 16), { boss: B, name: B.name });
      e.waves = s.waves;
      G.boss = e;
      shout(e, B.lines[0]);
      music('combat');
      break;
    }
    case 'ride': objective(s.obj); fadeFlash(); startRide(S); G.sec.waveT = -2.5; music('combat'); break;
    case 'duel': startDuel(S); break;
  }
}
function spawnWave(str) {
  if (!str) return;
  for (const tok of str.split(' ')) {
    const code = tok[0], n = parseInt(tok.slice(1), 10) || 1;
    for (let k = 0; k < n; k++) {
      const sp = spawnPos(code);
      if (!sp) continue;
      const e = spawnEnemy(sp.code || code, sp.x, sp.z, { y: sp.y || 0, perch: sp.perch, side: sp.side });
      if (sp.perch) sp.pr.used = e;
    }
  }
}
function spawnPos(code) {
  const W = G.world, sec = G.sec, S = sec.S, t = sec.s.t, hw = W.hw;
  const ride = G.ride;
  const pz = ride ? ride.z : P.pos.z;
  if (code === 'R') {
    const lo = ride ? pz - 75 : pz - 45, hi = ride ? pz - 30 : pz - 8;
    const c = W.perches.filter((p) => p.z > lo && p.z < hi && !(p.used && p.used.alive));
    if (c.length) { const pr = pick(c); return { x: pr.x, y: pr.y, z: pr.z, perch: true, pr }; }
    code = 'r';
  }
  if (code === 'h') {
    if (ride) { const side = Math.random() < 0.5 ? -1 : 1; return { x: side * (G.level.theme === 'river' ? hw + 4 : hw - 2), z: pz + rand(22, 38), side }; }
    return { x: (Math.random() < 0.5 ? -1 : 1) * (hw - 2), z: pz - rand(22, 34) };
  }
  let x = rand(-hw + 1.5, hw - 1.5), z;
  if (ride) {
    // hinderlaag langs de weg (of op de oever)
    const side = Math.random() < 0.5 ? -1 : 1;
    x = side * (G.level.theme === 'river' ? hw + rand(2, 5) : hw - rand(1, 2.5));
    z = pz - rand(45, 70);
    if (G.level.theme === 'river') return { x, z, code };
  } else if (t === 'escape') {
    z = Math.random() < 0.5 ? Math.min(9, pz + rand(14, 22)) : Math.max(S.end - 10, pz - rand(16, 30));
  } else if (t === 'defend') {
    const c = S.center;
    z = c.z + (Math.random() < 0.5 ? -1 : 1) * rand(16, 24);
  } else {
    if (Math.random() < 0.15 && sec.wave > 0) z = Math.min(9, pz + rand(16, 22));
    else {
      const top = Math.min(S.start - 6, pz - 16), bot = Math.max(S.end - 8, top - 30);
      z = rand(Math.min(bot, top), top);
    }
  }
  z = clamp(z, W.endZ + 3, 9);
  const f = W.free(x, z, 0.5);
  if (Math.hypot(f.x - P.pos.x, f.z - P.pos.z) < 7) return null;
  return f;
}

function updateSection(dt) {
  const sec = G.sec;
  if (!sec) return;
  sec.t += dt; sec.waveT += dt;
  const s = sec.s, S = sec.S;
  const alive = aliveFoes().length;
  if (sec.done) {
    // wachten tot de speler naar de volgende sectie loopt
    if (G.nextTrigger !== null && P.pos.z < G.nextTrigger) { const n = G.secIdx + 1; G.nextTrigger = null; activateSection(n); }
    if (G.exitZ !== null && G.exitZ !== undefined && P.pos.z < G.exitZ) { G.exitZ = null; levelComplete(); }
    return;
  }
  switch (s.t) {
    case 'fight': {
      if (sec.talk) break;
      if (sec.wave < s.waves.length) {
        if (alive <= Math.max(1, Math.round(sec.last * 0.3)) || sec.waveT > 28) { sec.last = alive; spawnWave(s.waves[sec.wave]); sec.wave++; sec.waveT = 0; }
      } else if (alive === 0) {
        if (s.give) { sec.talk = true; objective(`Praat met ${npcName(s.give)}`, S.npc.position.clone()); music('calm'); }
        else completeSection();
      }
      $('#obj2').textContent = alive ? `Vijanden: ${alive}` : '';
      break;
    }
    case 'escape': {
      if (sec.wave < s.waves.length && (sec.waveT > 9 || alive < 2)) { spawnWave(s.waves[sec.wave]); sec.wave++; sec.waveT = 0; }
      $('#obj2').textContent = `Nog ${Math.max(0, Math.round(P.pos.z - S.end))} m`;
      if (P.pos.z < S.end + 2) {
        for (const e of aliveFoes()) if (Math.abs(e.pos.z - P.pos.z) > 22) { e.flee = true; }
        completeSection();
      }
      break;
    }
    case 'defend': {
      const c = S.center;
      const inside = Math.hypot(P.pos.x - c.x, P.pos.z - c.z) < 15;
      if (inside) sec.timer -= dt;
      const per = s.time / s.waves.length;
      const want = Math.min(s.waves.length, Math.floor((s.time - sec.timer) / per) + 1);
      while (sec.wave < want) { spawnWave(s.waves[sec.wave]); sec.wave++; }
      $('#obj2').textContent = inside ? `Houd vol: ${Math.ceil(Math.max(0, sec.timer))} s` : 'Ga terug naar de plek!';
      if (sec.timer <= 0) { for (const e of aliveFoes()) e.flee = true; completeSection(); }
      break;
    }
    case 'ride': {
      const V = G.ride;
      if (!V) break;
      const dur = s.len / V.speed;
      const want = Math.min(s.waves.length, Math.floor(sec.waveT / (dur / s.waves.length)) + 1);
      while (sec.wave < want && sec.waveT > 0) { spawnWave(s.waves[sec.wave]); sec.wave++; }
      $('#obj2').textContent = `Nog ${Math.max(0, Math.round(V.z - S.end))} m`;
      // ruiters die ver achter raken haken af
      for (const e of aliveFoes()) if (e.pos.z - V.z > 60 || e.pos.z - V.z < -90) { e.alive = false; removeEnemy(e); e.gone = true; }
      if (V.z < S.end) completeSection();
      break;
    }
    case 'boss': {
      const b = G.boss;
      $('#obj2').textContent = '';
      if (b && !b.alive) {
        G.boss = null;
        for (const e of aliveFoes()) e.flee = true;
        toast(`${b.name} verslagen!`, '', 2);
        completeSection();
      }
      break;
    }
  }
}
function npcName(w) { return { lever: 'Marshal Peters', shotgun: 'Ouwe Gerrit', dynamite: 'Dynamiet Dorus' }[w]; }
function tryInteract() {
  const sec = G.sec;
  if (!sec || !sec.talk || sec.done) return;
  const n = sec.S.npc;
  if (Math.hypot(n.position.x - P.pos.x, n.position.z - P.pos.z) > 3.2) return;
  runCut(async () => {
    const np = n.position;
    shot([P.pos.x + 2.5, 1.7, P.pos.z + 2.5], [np.x, 1.4, np.z]);
    n.rotation.y = Math.atan2(P.pos.x - np.x, P.pos.z - np.z);
    P.model.rotation.y = Math.atan2(np.x - P.pos.x, np.z - P.pos.z);
    for (const [a, b] of sec.s.giveSay) await say(a, b);
  }).then(() => {
    giveWeapon(sec.s.give);
    if (sec.s.give === 'dynamite') P.ammo.dynamite = { mag: 1, res: 4 };
    sec.talk = false;
    completeSection();
    G.mode = 'play';
  });
}
function completeSection() {
  const sec = G.sec;
  sec.done = true;
  $('#obj2').textContent = '';
  const W = G.world, i = G.secIdx, S = sec.S;
  const next = W.sections[i + 1];
  if (sec.s.t === 'ride' && !(next && next.s.t === 'ride' && next.s.vehicle === sec.s.vehicle)) {
    fadeFlash();
    for (const e of aliveFoes()) { e.alive = false; removeEnemy(e); e.gone = true; }
    const z = G.ride.z;
    endRide();
    P.pos.set(0, 0, z - 1);
    const f = W.free(0, z - 1); P.pos.x = f.x; P.pos.z = f.z;
  }
  if (!next) {
    music('calm');
    objective('Bereik de uitgang', V3(0, 0, W.endZ + 3));
    G.exitZ = W.endZ + 5;
    if (P.pos.z < G.exitZ) { G.exitZ = null; levelComplete(); }
    return;
  }
  // meteen door bij duels, ritten en na een duel
  if (sec.s.t === 'duel' || next.s.t === 'duel' || next.s.t === 'ride' || sec.s.t === 'ride' || P.pos.z < next.start + 4) {
    if (next.s.t === 'duel') { objective('Ga verder', V3(0, 0, next.start)); G.nextTrigger = next.start + 3; }
    else activateSection(i + 1);
    return;
  }
  if (sec.s.t !== 'escape') toast('Gebied veilig', '', 1.2);
  music('calm');
  objective('Ga verder', V3(0, 0, next.start));
  G.nextTrigger = next.start + 3;
}

// =====================================================================
//  baas
// =====================================================================
function bossThink(e, dt, dist) {
  const B = e.boss;
  e.lineT -= dt;
  if (e.lineT <= 0) { shout(e, pick(B.lines)); e.lineT = rand(8, 13); }
  if (B.dyn) {
    e.throwT -= dt;
    if (e.throwT <= 0 && dist > 6 && dist < 26 && e.see && e.aimT <= 0 && e.burst <= 0) { enemyThrow(e); e.throwT = rand(6, 9); }
  }
  if (B.melee) {
    e.meleeCD = (e.meleeCD || 0) - dt;
    if (dist < 2 && e.meleeCD <= 0 && !P.dead) {
      e.meleeCD = 1.4; e.melee = 1;
      setTimeout(() => { if (e.alive && Math.hypot(P.pos.x - e.pos.x, P.pos.z - e.pos.z) < 2.5) { sfx('stab'); hurtPlayer(30, e.pos); } }, 250);
    }
  }
  const waves = e.waves || [];
  const want = Math.floor((1 - e.hp / e.maxHp) * (waves.length + 1));
  while (e.adds < Math.min(want, waves.length)) { spawnWave(waves[e.adds]); e.adds++; shout(e, pick(['Boys! Get him!', 'Reinforcements!', 'Surround him!'])); }
}

// =====================================================================
//  duel
// =====================================================================
function lookFor(l) { return typeof l === 'string' ? (CAST[l] || BOSSES[l].look) : l; }
function startDuel(S) {
  const D = DUELS[S.s.duel];
  const bar = G.level.bar;
  const pp = bar ? V3(2, 0, 2) : V3(0, 0, S.start - 3);
  const op = bar ? V3(0, 0, -15) : V3(0, 0, S.start - 18);
  for (const e of G.enemies) if (e.duel) removeEnemy(e);
  G.enemies = G.enemies.filter((e) => !e.duel);
  P.pos.copy(pp); P.yaw = Math.atan2(-(op.x - pp.x), -(op.z - pp.z)); P.pitch = -0.02; P.face = P.yaw + Math.PI;
  switchWeapon('revolver');
  const opps = [];
  const main = spawnEnemy('g', op.x, op.z, { look: lookFor(D.look), name: D.name, duel: true });
  main.hp = 1; main.maxHp = 1; opps.push(main);
  for (let k = 0; k < (D.guards || 0); k++) {
    const side = k % 2 ? 1 : -1, off = Math.ceil((k + 1) / 2) * 3.5;
    const g = spawnEnemy('g', op.x + side * off, op.z + 1.5 + k, { duel: true, look: goonLook(lookR, G.level.faction) });
    g.hp = 1; opps.push(g);
  }
  if (D.extra === 'mo') {
    // Mo staat gewoon op straat naast Tex, je ziet hem vanaf het begin
    const mo = spawnEnemy('g', op.x + 3.2, op.z + 1.5, { look: CAST.mo, name: 'Mo Hemmet', duel: true });
    mo.hp = 1; opps.push(mo);
  }
  for (const e of opps) { e.drawn = false; e.drawP = 0; e.yaw = Math.atan2(P.pos.x - e.pos.x, P.pos.z - e.pos.z); }
  aimAt(V3(op.x, 1.2 * main.scale, op.z));
  G.duel = { D, opps, phase: 'intro', t: 0, marks: [], survive: !!D.survive };
  G.boss = null;
  music('duel');
  objective('Duel: ' + D.name);
  runCut(async () => {
    const m = main.pos;
    shot([m.x + 2.2, 1.6, m.z + 3], [m.x, 1.55 * main.scale, m.z]);
    await say(D.pre[0][0], D.pre[0][1]);
    shot([P.pos.x - 1.6, 1.6, P.pos.z - 2.4], [P.pos.x, 1.6, P.pos.z]);
    for (const l of D.pre.slice(1)) await say(l[0], l[1]);
    shot([P.pos.x + 6, 1.1, (P.pos.z + m.z) / 2], [(P.pos.x + m.x) / 2, 1.2, (P.pos.z + m.z) / 2]);
    await wait(1.4);
  }).then(() => {
    G.mode = 'duel';
    G.duel.phase = 'wait'; G.duel.t = rand(2.5, 4.8);
    duelText('Wacht op het signaal…', 'Niet te vroeg trekken');
  });
}
function duelText(a, b) { $('#duel').innerHTML = a ? `<b>${a}</b>${b ? `<small>${b}</small>` : ''}` : ''; }
function updateDuel(dtr) {
  const du = G.duel;
  if (!du) return;
  du.t -= dtr;
  if (du.phase === 'wait') {
    G.timeScale = 1;
    if (mouse.lPressed) { duelText('Nog niet!', 'Wacht op de bel'); sfx('click'); du.warned = 1.2; }
    if (du.warned > 0 && (du.warned -= dtr) <= 0) duelText('Wacht op het signaal…', 'Niet te vroeg trekken');
    if (du.t <= 0) {
      du.phase = 'draw'; du.t = Math.max(3, du.D.draw * 1.7) + (du.D.guards || 0) * 0.9 + (du.D.extra ? 1.2 : 0); du.win = du.t;
      sfx('bell', 1);
      duelText('DRAW!', 'Klik op elke tegenstander · daarna rechtermuis of spatie');
      document.body.classList.add('deadeye');
      setSlow(true);
      for (const e of du.opps) if (e.hidden) { e.model.visible = true; e.hidden = false; subtitle('', 'Mo Hemmet trekt zijn revolver op het balkon!', 2.5); }
    }
  } else if (du.phase === 'draw') {
    G.timeScale = 0.12;
    P.aim = 1;
    for (const e of du.opps) e.drawP = clamp(1 - du.t / du.win, 0, 1);
    if (mouse.lPressed && du.marks.length < 6) {
      const { f } = camDirs();
      const wr = G.world.ray(camera.position, f, 150);
      const er = rayEnemies(camera.position, f, wr.t);
      if (er.e) { const p = camera.position.clone().addScaledVector(f, er.t); du.marks.push({ e: er.e, off: V3().subVectors(p, V3(er.e.pos.x, er.e.y0, er.e.pos.z)), head: er.head }); sfx('mark'); }
      else {
        // niet precies raak? de dichtstbijzijnde tegenstander bij het vizier telt ook
        let best = null, bd = Math.min(innerWidth, innerHeight) * 0.16;
        for (const e of du.opps) {
          if (!e.alive || e.hidden) continue;
          const q = proj(V3(e.pos.x, e.y0 + 1.25 * e.scale, e.pos.z));
          const d = Math.hypot(q.x - innerWidth / 2, q.y - innerHeight / 2);
          if (q.ok && d < bd) { bd = d; best = e; }
        }
        if (best) { du.marks.push({ e: best, off: V3(0, 1.25 * best.scale, 0), head: false }); sfx('mark'); }
      }
    }
    if (mouse.rPressed || keys.Space || du.t <= 0 || du.marks.length >= 6) { du.phase = 'fire'; du.t = 0.05; }
  } else if (du.phase === 'fire') {
    if (du.t > 0) return;
    const mk = du.marks.shift();
    if (mk) {
      const tp = V3(mk.e.pos.x, mk.e.y0, mk.e.pos.z).add(mk.off);
      const mp = muzzlePos();
      sfx('revolver', 1); muzzleFlash(mp, 0.6); tracer(mp, tp); P.shotT = 0;
      const d = V3().subVectors(tp, camera.position).normalize();
      P.yaw = Math.atan2(-d.x, -d.z); P.pitch = Math.asin(clamp(d.y, -1, 1));
      if (mk.e.alive) {
        if (du.survive && mk.e === du.opps[0]) { mk.e.wounded = true; blood(tp, d, 14); sfx('flesh'); G.hitMark = 0.2; }
        else damageEnemy(mk.e, 999, d, mk.head, tp);
      }
      du.t = 0.16;
      return;
    }
    // klaar met schieten: wie staat er nog?
    const left = du.opps.filter((e) => e.alive && !e.wounded);
    if (left.length) { duelText('Te langzaam…', ''); duelLose(left); return; }
    du.phase = 'won'; du.t = 1.6;
    duelText(du.D.name.split(' ').pop() + ' is verslagen', '');
    G.stats.duels++;
    G.bounty += 100;
  } else if (du.phase === 'won') {
    G.timeScale = 0.35;
    if (du.t <= 0) {
      document.body.classList.remove('deadeye'); setSlow(false);
      G.timeScale = 1;
      duelText('', '');
      for (const e of du.opps) if (e.wounded) { e.duel = false; e.alive = false; removeEnemy(e); e.gone = true; }
      if (du.survive) subtitle(du.D.name, 'Argh! My hand! MEN! Kill him!', 3);
      G.duel = null;
      G.mode = 'play';
      completeSection();
    }
  }
}
function duelLose(left) {
  const du = G.duel;
  du.phase = 'lost';
  document.body.classList.remove('deadeye'); setSlow(false);
  G.timeScale = 1;
  const shooters = left || du.opps.filter((e) => e.alive);
  shooters.forEach((e, i) => setTimeout(() => {
    if (!e.alive) return;
    e.drawP = 1;
    const from = V3(e.pos.x, e.y0 + 1.45 * e.scale, e.pos.z);
    sfx('revolver', 0.9); muzzleFlash(from, 0.5); tracer(from, playerChest());
    blood(playerChest(), V3(0, 0, 1), 12);
    if (i === shooters.length - 1 || shooters.length === 1) { G.god = false; P.hp = 0; playerDie(); }
  }, 250 + i * 180));
}
function duelEnemyAnim(e, dt) {
  const m = e.model;
  e.yaw += angDiff(e.yaw, Math.atan2(P.pos.x - e.pos.x, P.pos.z - e.pos.z)) * (1 - Math.exp(-dt * 6));
  m.rotation.y = e.yaw;
  m.position.set(e.pos.x, e.y0, e.pos.z);
  if (e.wounded) { e.pos.z -= dt * 3; animHuman(m, { speed: 3 }, dt); return; }
  animHuman(m, { aim: e.drawP || 0, pitch: Math.atan2(1.2 - (e.y0 + 1.5), Math.hypot(P.pos.x - e.pos.x, P.pos.z - e.pos.z)) }, dt);
}

// =====================================================================
//  tussenfilmpjes
// =====================================================================
const cut = { cam: null };
function wait(s) { return new Promise((res) => { if (G.skip) return res(); G.waiters.push({ t: s, res }); }); }
function waitAdvance(s) { return new Promise((res) => { if (G.skip) return res(); G.waiters.push({ t: s, res, adv: true }); }); }
async function say(name, text) {
  if (G.skip) return;
  subtitle(name, text, 0);
  await waitAdvance(clamp(1.4 + text.length * 0.055, 2.2, 6.5));
  subtitle('', '', 0);
}
function shot(pos, look, smooth = false) { cut.cam = { pos: V3(...pos), look: V3(...look), smooth }; if (!smooth) cut.snap = true; }
function walk(model, x, z, speed = 1.8) {
  return new Promise((res) => {
    if (G.skip) { model.position.x = x; model.position.z = z; return res(); }
    G.walkers.push({ model, x, z, speed, res });
  });
}
G.walkers = [];
async function runCut(fn) {
  G.mode = 'cut'; G.skip = false;
  document.body.classList.add('letterbox');
  mouse.lPressed = false;
  try { await fn(); } catch (err) { console.error(err); }
  cut.cam = null; G.skip = false;
  subtitle('', '', 0);
  document.body.classList.remove('letterbox');
}
function skipCut() {
  if (G.mode !== 'cut') return;
  G.skip = true;
  for (const w of G.waiters) w.res(); G.waiters = [];
  for (const w of G.walkers) { w.model.position.x = w.x; w.model.position.z = w.z; w.res(); } G.walkers = [];
}
function updateCut(dtr) {
  for (const w of G.waiters) { w.t -= dtr; if (w.t <= 0 || (w.adv && G.advance)) { w.done = true; w.res(); } }
  G.waiters = G.waiters.filter((w) => !w.done);
  G.advance = false;
  for (const w of G.walkers) {
    const m = w.model, dx = w.x - m.position.x, dz = w.z - m.position.z, d = Math.hypot(dx, dz);
    if (d < 0.08) { w.done = true; animHuman(m, { speed: 0 }, dtr); w.res(); continue; }
    const st = Math.min(d, w.speed * dtr);
    m.position.x += dx / d * st; m.position.z += dz / d * st;
    m.rotation.y = Math.atan2(dx, dz);
    animHuman(m, { speed: w.speed }, dtr);
  }
  G.walkers = G.walkers.filter((w) => !w.done);
}

async function barIntro() {
  const W = G.world, bt = W.barTable, bi = W.barInfo;
  // Shane zit aan tafel met zijn chocomel
  P.pos.set(bt.x - 1.0, 0, bt.z);
  setGun(P.model, 'mug');
  P.model.position.set(bt.x - 1.0, 0, bt.z);
  P.model.rotation.y = Math.PI / 2;
  G.cutPose = { sit: true };
  const tex = makeHuman(CAST.tex);
  tex.position.set(bi.x1 + 4, 0, 1);
  tex.rotation.y = -Math.PI / 2;
  setGun(tex, 'revolver');
  scene.add(tex);
  const bartender = W.npcs.bartender;
  shot([bt.x + 2.2, 1.5, bt.z - 2.6], [bt.x - 1.0, 1.0, bt.z]);
  await wait(1.2);
  await say('Barkeep Frits', 'Another chocomel, Shane?');
  G.cutPose = { sit: true, drink: 1 };
  await say('Shane', 'Make it a large one, Frits. Long day.');
  G.cutPose = { sit: true };
  shot([bi.x0 + 3, 2.2, -4], [bi.x1, 1.3, 0]);
  sfx('step', 1);
  await wait(0.6);
  await walk(tex, bi.x1 - 1, 0, 1.6);
  await say('Big Tex Tolliver', 'Well, well, well. Shane. Wanted for two frikandelbroodjes from the Plus.');
  shot([bt.x + 1.5, 1.8, bt.z + 2.4], [bt.x + 1.6, 1.5, bt.z - 1.5]);
  await walk(tex, bt.x + 1.6, bt.z - 1.2, 1.4);
  tex.rotation.y = Math.atan2(P.model.position.x - tex.position.x, P.model.position.z - tex.position.z);
  await say('Big Tex Tolliver', 'Two dollars forty-nine on your head. And I aim to collect.');
  shot([bt.x - 3.2, 1.3, bt.z + 1.6], [bt.x - 0.6, 1.2, bt.z]);
  await say('Shane', 'It\'s a chocomel kinda day, big man. Can\'t it wait?');
  shot([bt.x - 1.2, 1.4, bt.z + 2.8], [bt.x + 1.6, 1.9, bt.z - 1.2]);
  await say('Big Tex Tolliver', 'Outside. Now. You and me.');
  if (bartender) bartender.rotation.y = Math.PI / 2;
  // Shane staat op
  G.cutPose = null;
  setGun(P.model, null);
  P.model.rotation.y = Math.PI / 2;
  shot([bt.x + 0.4, 1.6, bt.z + 1.6], [bt.x - 1.0, 1.6, bt.z]);
  await wait(0.5);
  await say('Shane', 'Simmer down, cowboy 🤠');
  shot([bi.x1 + 5, 2, 6], [bi.x1, 1.4, 0]);
  setGun(P.model, 'revolver');
  await walk(P.model, bi.x1 - 1.2, 0.5, 2.2);
  await walk(P.model, 2, 2, 2.2);
  tex.visible = false; scene.remove(tex);
  G.cutPose = null;
  P.pos.set(2, 0, 2);
}

async function genericIntro(lines) {
  // camera draait langzaam om Shane heen terwijl er gepraat wordt
  const start = G.t;
  G.orbit = { a: 0.6, r: 4.2, h: 1.9 };
  for (const [a, b] of lines) { await say(a, b); }
  await wait(0.2);
  G.orbit = null;
  void start;
}

// =====================================================================
//  ondertitels, meldingen
// =====================================================================
let subTimer = 0;
function subtitle(name, text, dur) {
  const el = $('#subs');
  if (!text) { el.innerHTML = ''; el.classList.remove('on'); return; }
  el.innerHTML = (name ? `<b>${name}</b>` : '') + text.replace(/</g, '&lt;');
  el.classList.add('on');
  subTimer = dur || 0;
}
function queueSubs(lines) { G.subQ = (G.subQ || []).concat(lines.map((l) => ({ name: l[0], text: l[1] }))); }
function updateSubs(dtr) {
  if (G.mode === 'cut') return;
  if (subTimer > 0) { subTimer -= dtr; if (subTimer <= 0) subtitle('', '', 0); return; }
  if (G.subQ && G.subQ.length) { const s = G.subQ.shift(); subtitle(s.name, s.text, clamp(1.5 + s.text.length * 0.05, 2.5, 5)); }
}
function toast(title, sub = '', dur = 2.2) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<b>${title}</b>${sub ? `<small>${sub}</small>` : ''}`;
  $('#toasts').appendChild(el);
  setTimeout(() => el.classList.add('out'), dur * 1000);
  setTimeout(() => el.remove(), dur * 1000 + 600);
}
function fadeFlash() { const f = $('#fade'); f.classList.add('on'); setTimeout(() => f.classList.remove('on'), 350); }
function titleCard(li) {
  const L = LEVELS[li];
  const act = li < 3 ? 'Akte I' : li < 10 ? 'Akte II' : li < 15 ? 'Akte III' : 'Akte IV';
  const el = $('#title-card');
  el.innerHTML = `<small>${act} · Hoofdstuk ${li + 1}</small><h2>${L.name}</h2><p>${L.place}</p><em>PREMIE: $${bountyFor(li).toLocaleString('en-US')}</em>`;
  el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
}

// =====================================================================
//  levels starten, doodgaan, afronden
// =====================================================================
function clearActors() {
  for (const e of G.enemies) removeEnemy(e);
  G.enemies = []; G.corpses = [];
  for (const p of G.projectiles) scene.remove(p.m);
  G.projectiles = [];
  for (const k of G.pickups) scene.remove(k.g);
  G.pickups = [];
  fxSmall.clear(); fxBig.clear();
  if (G.de) deadEyeEnd();
  document.body.classList.remove('deadeye');
  setSlow(false);
  G.duel = null; G.boss = null;
  duelText('', '');
}
function buildLevel(li) {
  clearActors();
  endRide();
  if (G.world) G.world.dispose();
  if (rain) { scene.remove(rain); rain = null; }
  G.li = li; G.level = LEVELS[li];
  lookR = rng(G.level.seed * 31 + 7);
  G.world = new World(scene, G.level, li);
  lantern.intensity = G.world.time.lantern ? 2.2 : 0;
  camera.far = G.world.fogFar + 10; camera.updateProjectionMatrix();
  if (G.world.time.rain) { rain = makeRain(); scene.add(rain); }
  if (!P.model) makePlayer();
}
async function startLevel(li) {
  initAudio();
  $('#menu').classList.add('hidden');
  hideScreens();
  document.body.classList.add('ingame');
  buildLevel(li);
  P.dead = false; P.deadT = 0; P.hp = 100; P.de = 100; P.reload = 0; P.cool = 0; P.crouchOn = false; P.crouch = 0; P.aim = 0;
  P.owned = []; P.ammo = {};
  for (const w of G.level.weapons) giveWeapon(w, true);
  P.weapon = 'revolver';
  makePlayer();
  P.pos.set(0, 0, -2); P.vel.set(0, 0, 0); P.yaw = 0; P.pitch = -0.05; P.face = Math.PI;
  G.stats = { kills: 0, heads: 0, shots: 0, hits: 0, melee: 0, taken: 0, duels: 0, t0: performance.now(), deaths: 0 };
  G.bounty = bountyFor(li);
  G.secIdx = -1; G.sec = null; G.exitZ = null; G.nextTrigger = null; G.subQ = [];
  objective('');
  $('#obj2').textContent = '';
  titleCard(li);
  music('calm');
  canvas.requestPointerLock?.();
  const L = G.level;
  await runCut(async () => {
    await wait(0.3);
    if (L.intro === 'bar') await barIntro();
    else { await wait(2.6); await genericIntro(L.intro || []); }
  });
  G.cutPose = null;
  setGun(P.model, gunFor(P.weapon));
  G.mode = 'play';
  activateSection(0);
}
function playerDie() {
  if (P.dead) return;
  P.dead = true; P.deadT = 0; P.hp = 0;
  G.stats.deaths++;
  if (G.de) deadEyeEnd();
  G.mode = 'dead';
  music(null);
  sfx('hurt', 1);
  setTimeout(() => {
    $('#dead').classList.remove('hidden');
    $('#dead-tip').textContent = pick([
      'Tip: bukken (C) achter kratten houdt je uit de kogels.',
      'Tip: Dead Eye (Q) laadt op door vijanden neer te schieten.',
      'Tip: headshots doen veel meer schade.',
      'Tip: Health Tonics vallen soms uit vijanden.',
      'Tip: blijf bewegen. Stilstaan is dood.',
      'Tip: de shotgun is dichtbij beest, op afstand niet.',
      'Tip: de lever-action is perfect voor sluipschutters op daken.',
      'Tip: rennen (Shift) maakt je moeilijker te raken.',
    ]);
    document.exitPointerLock?.();
  }, 1700);
}
function restartCheckpoint() {
  hideScreens();
  const cp = G.cp;
  clearActors();
  endRide();
  P.dead = false; P.deadT = 0; P.hp = 100; P.de = cp.de; P.reload = 0; P.cool = 0.3; P.vel.set(0, 0, 0);
  P.owned = [...cp.owned]; P.ammo = JSON.parse(JSON.stringify(cp.ammo));
  P.weapon = cp.weapon;
  makePlayer();
  P.pos.copy(cp.pos); P.yaw = cp.yaw;
  G.bounty = cp.bounty;
  G.exitZ = null; G.nextTrigger = null; G.subQ = [];
  G.mode = 'play';
  canvas.requestPointerLock?.();
  activateSection(cp.i, true);
}
async function levelComplete() {
  if (G.mode === 'done') return;
  const L = G.level;
  G.mode = 'cut';
  music('calm');
  objective('');
  for (const e of aliveFoes()) e.flee = true;
  if (L.outro === 'ending') { await ending(); return; }
  await runCut(async () => { G.orbit = { a: 0.2, r: 4.5, h: 1.8 }; for (const [a, b] of L.outro || []) await say(a, b); await wait(0.3); G.orbit = null; });
  showComplete();
}
function statsHtml() {
  const s = G.stats;
  const t = Math.round((performance.now() - s.t0) / 1000);
  const acc = s.shots ? Math.round(s.hits / s.shots * 100) : 0;
  return `<div class="stats">
    <div><span>Tijd</span><b>${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}</b></div>
    <div><span>Vijanden</span><b>${s.kills}</b></div>
    <div><span>Headshots</span><b>${s.heads}</b></div>
    <div><span>Nauwkeurigheid</span><b>${acc}%</b></div>
    <div><span>Keer dood</span><b>${s.deaths}</b></div>
    <div><span>Premie</span><b>$${Math.round(G.bounty).toLocaleString('en-US')}</b></div></div>`;
}
function showComplete() {
  G.mode = 'done';
  document.exitPointerLock?.();
  sfx('win');
  save.unlocked = Math.max(save.unlocked, Math.min(LEVELS.length - 1, G.li + 1));
  const t = Math.round((performance.now() - G.stats.t0) / 1000);
  const b = save.best[G.li];
  if (!b || t < b) save.best[G.li] = t;
  store();
  const el = $('#complete');
  el.querySelector('.body').innerHTML = `<small>Hoofdstuk ${G.li + 1} voltooid</small><h2>${G.level.name}</h2>${statsHtml()}`;
  $('#btn-next').style.display = G.li + 1 < LEVELS.length ? '' : 'none';
  el.classList.remove('hidden');
}
async function ending() {
  await runCut(async () => {
    const z = G.world.endZ;
    shot([4, 2, z + 10], [0, 1.4, z + 2]);
    P.model.position.set(P.pos.x, 0, P.pos.z);
    await walk(P.model, 0, z - 4, 1.6);
    shot([2.5, 1.6, z - 7], [0, 1.4, z - 4]);
    P.model.rotation.y = 0;
    await say('Shane', 'Germany. Huh. Smells the same.');
    await say('Shane', 'Twenty-five thousand dollars. Twenty chapters. Half the West shot to pieces.');
    G.cutPose = { drink: 1 };
    await say('Shane', '...and they\'re still warm.');
    await say('Shane', 'Simmer down, cowboy. You made it. 🤠');
    G.cutPose = null;
    shot([0, 6, z - 30], [0, 1, z - 4], true);
    await wait(3);
  });
  G.mode = 'done';
  save.unlocked = LEVELS.length - 1; save.done = true; store();
  document.exitPointerLock?.();
  const el = $('#complete');
  el.querySelector('.body').innerHTML = `<small>Het einde</small><h2>Shane Dead Redemption</h2>
    <p class="end">Shane stak de grens over met twee frikandelbroodjes in zijn jaszak.<br>De Plus heeft hem nooit meer gezien.</p>${statsHtml()}`;
  $('#btn-next').style.display = 'none';
  el.classList.remove('hidden');
  sfx('win');
}

// =====================================================================
//  menu's
// =====================================================================
function hideScreens() { for (const id of ['#dead', '#complete', '#pause', '#chapters', '#settings', '#controls']) $(id).classList.add('hidden'); }
function pause(on) {
  if (on) {
    if (G.mode !== 'play' && G.mode !== 'duel') return;
    G.paused = true;
    $('#pause').classList.remove('hidden');
    music(null);
  } else {
    G.paused = false;
    hideScreens();
    canvas.requestPointerLock?.();
    music(G.sec && !G.sec.done ? 'combat' : 'calm');
  }
}
function toMenu() {
  hideScreens();
  G.paused = false;
  G.mode = 'menu';
  document.body.classList.remove('ingame', 'deadeye', 'letterbox');
  clearActors(); endRide();
  objective(''); $('#obj2').textContent = ''; subtitle('', '', 0);
  buildLevel(Math.min(save.unlocked, LEVELS.length - 1));
  P.pos.set(0, 0, -6); P.dead = false; P.model.visible = true;
  $('#menu').classList.remove('hidden');
  refreshMenu();
  music('calm');
}
function refreshMenu() {
  const n = save.unlocked;
  $('#btn-continue').innerHTML = `Verder spelen <small>Hoofdstuk ${n + 1} · ${LEVELS[n].name}</small>`;
  const list = $('#chapter-list');
  list.innerHTML = '';
  const acts = [['Akte I – Hatert Town', 0, 3], ['Akte II – De Spoorlijn', 3, 10], ['Akte III – De Rivier', 10, 15], ['Akte IV – De Grens', 15, 20]];
  for (const [title, a, b] of acts) {
    const h = document.createElement('h4'); h.textContent = title; list.appendChild(h);
    for (let i = a; i < b; i++) {
      const L = LEVELS[i];
      const btn = document.createElement('button');
      const lockedL = i > save.unlocked;
      btn.className = 'chap' + (lockedL ? ' locked' : '');
      const best = save.best[i];
      btn.innerHTML = `<span>${i + 1}</span><div><b>${lockedL ? '???' : L.name}</b><small>${lockedL ? 'Nog niet vrijgespeeld' : L.place + (best ? ` · beste ${Math.floor(best / 60)}:${String(best % 60).padStart(2, '0')}` : '')}</small></div>`;
      if (!lockedL) btn.onclick = () => { sfx('ui'); startLevel(i); };
      list.appendChild(btn);
    }
  }
}
function bindUi() {
  const click = (id, fn) => $(id).addEventListener('click', () => { initAudio(); sfx('ui'); fn(); });
  click('#btn-continue', () => startLevel(save.unlocked));
  click('#btn-new', () => startLevel(0));
  click('#btn-chapters', () => { refreshMenu(); $('#chapters').classList.remove('hidden'); });
  click('#btn-settings', () => $('#settings').classList.remove('hidden'));
  click('#btn-controls', () => $('#controls').classList.remove('hidden'));
  document.querySelectorAll('.back').forEach((b) => b.addEventListener('click', () => { sfx('ui'); b.closest('.screen').classList.add('hidden'); }));
  click('#btn-resume', () => pause(false));
  click('#btn-retry-cp', () => { G.paused = false; restartCheckpoint(); });
  click('#btn-p-settings', () => $('#settings').classList.remove('hidden'));
  click('#btn-p-controls', () => $('#controls').classList.remove('hidden'));
  click('#btn-quit', () => toMenu());
  click('#btn-retry', () => restartCheckpoint());
  click('#btn-dead-menu', () => toMenu());
  click('#btn-next', () => startLevel(G.li + 1));
  click('#btn-done-menu', () => toMenu());
  // instellingen
  const S = save.set;
  const bind = (id, key, fmt, apply) => {
    const el = $(id), out = $(id + '-v');
    el.value = S[key];
    const upd = () => { S[key] = parseFloat(el.value); if (out) out.textContent = fmt(S[key]); apply?.(); store(); };
    el.addEventListener('input', upd); upd();
  };
  bind('#set-sens', 'sens', (v) => v.toFixed(2));
  bind('#set-sfx', 'sfx', (v) => Math.round(v * 100) + '%', () => { vol.sfx = S.sfx; setVolumes(); });
  bind('#set-music', 'music', (v) => Math.round(v * 100) + '%', () => { vol.music = S.music; setVolumes(); });
  bind('#set-diff', 'diff', (v) => ['Makkelijk', 'Normaal', 'Zwaar'][v]);
  bind('#set-res', 'res', (v) => ({ 240: 'PS1 (240p)', 360: 'Scherper (360p)', 480: 'Scherp (480p)' }[v] || v + 'p'), resize);
  const inv = $('#set-invert'); inv.checked = S.invert; inv.addEventListener('change', () => { S.invert = inv.checked; store(); });
}

function onKey(code) {
  if (G.mode === 'cut') {
    if (code === 'Enter' || code === 'Escape' || code === 'Backspace') skipCut();
    if (code === 'Space' || code === 'KeyE') G.advance = true;
    return;
  }
  if (G.mode === 'dead' && (code === 'Space' || code === 'Enter') && !$('#dead').classList.contains('hidden')) { restartCheckpoint(); return; }
  if (G.mode !== 'play') return;
  if (G.paused) return;
  if (code === 'KeyQ') deadEyeToggle();
  if (code === 'KeyR') startReload();
  if (code === 'KeyC' || code === 'ControlLeft') P.crouchOn = !P.crouchOn;
  if (code === 'KeyV') P.shoulder *= -1;
  if (code === 'KeyE') tryInteract();
  if (code === 'Tab') cycleWeapon(1);
  for (const w of WEAPON_ORDER) if (code === 'Digit' + WEAPONS[w].key) switchWeapon(w);
}
canvas.addEventListener('mousedown', () => { if (G.mode === 'cut') G.advance = true; });

// =====================================================================
//  camera
// =====================================================================
function updateCamera(dtr) {
  const sens = 0.0022 * save.set.sens;
  if ((G.mode === 'play' || G.mode === 'duel') && !G.paused && !P.dead) {
    const slow = P.aim > 0.5 ? 0.6 : 1;
    P.yaw -= mouse.dx * sens * slow;
    P.pitch = clamp(P.pitch - mouse.dy * sens * slow * (save.set.invert ? -1 : 1), -1.15, 1.1);
  }
  mouse.dx = 0; mouse.dy = 0;
  if (G.mode === 'menu') {
    const t = G.t * 0.05;
    camera.position.set(Math.sin(t) * 6, 2.2 + Math.sin(t * 0.7) * 0.4, -10 + Math.cos(t) * 4);
    camera.lookAt(0, 1.6, -22);
    camera.fov = 60; camera.updateProjectionMatrix();
    return;
  }
  if (G.mode === 'cut' && G.orbit) {
    const o = G.orbit;
    o.a += dtr * 0.18;
    const fy = P.model.position.y;
    const tgt = V3(P.model.position.x + Math.sin(o.a) * o.r, fy + o.h, P.model.position.z + Math.cos(o.a) * o.r);
    camera.position.lerp(tgt, cut.snapOrbit ? 1 : 1 - Math.exp(-dtr * 2));
    camera.lookAt(P.model.position.x, fy + 1.4, P.model.position.z);
    camera.fov = 55; camera.updateProjectionMatrix();
    return;
  }
  if (G.mode === 'cut' && cut.cam) {
    if (cut.snap) { camera.position.copy(cut.cam.pos); cut.snap = false; }
    else camera.position.lerp(cut.cam.pos, 1 - Math.exp(-dtr * (cut.cam.smooth ? 0.6 : 3)));
    camera.lookAt(cut.cam.look);
    camera.fov = 50; camera.updateProjectionMatrix();
    return;
  }
  const W = WEAPONS[P.weapon];
  const { f, r } = camDirs();
  const feet = playerFeetY() + (G.ride?.horse ? 0.3 : 0);
  const pivot = V3(P.pos.x, feet + 1.58 - P.crouch * 0.45, P.pos.z);
  if (P.dead) pivot.y = feet + 0.8;
  const aim = G.mode === 'duel' ? Math.max(P.aim, 0.7) : P.aim;
  const dist = lerp(G.ride?.horse ? 4.2 : 3.5, 1.7, aim);
  const side = P.shoulder * lerp(0.85, 0.66, aim);
  const desired = pivot.clone().addScaledVector(f, -dist).addScaledVector(r, side);
  desired.y += lerp(0.38, 0.14, aim);
  // camera niet door muren
  const start = pivot.clone().addScaledVector(r, side * 0.4);
  const d = V3().subVectors(desired, start); const L = d.length(); d.divideScalar(L);
  const hit = G.world.ray(start, d, L);
  const camPos = hit.t < L ? start.clone().addScaledVector(d, Math.max(0.2, hit.t - 0.25)) : desired;
  camPos.y = Math.max(0.3, camPos.y);
  camera.position.copy(camPos);
  if (G.shake > 0) camera.position.add(V3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(G.shake * 0.06));
  camera.lookAt(camPos.clone().add(f));
  const fov = lerp(62, W.zoom || 55, aim) + (P.sprint ? 4 : 0);
  if (Math.abs(camera.fov - fov) > 0.05) { camera.fov = lerp(camera.fov, fov, 1 - Math.exp(-dtr * 12)); camera.updateProjectionMatrix(); }
}

// =====================================================================
//  HUD
// =====================================================================
const proj = (p) => { const v = p.clone().project(camera); return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight, ok: v.z < 1 && v.z > -1 }; };
function drawHud() {
  const W = innerWidth, H = innerHeight;
  hx.clearRect(0, 0, W, H);
  if (G.mode === 'menu' || G.mode === 'cut' || G.mode === 'done') return;
  const cx = W / 2, cy = H / 2;
  const Wp = WEAPONS[P.weapon];
  // vizier
  if (!P.dead) {
    const { f } = camDirs();
    const wr = G.world.ray(camera.position, f, 150);
    const over = rayEnemies(camera.position, f, wr.t).e;
    hx.fillStyle = over ? '#e03020' : '#f4ead8';
    hx.strokeStyle = 'rgba(0,0,0,0.6)';
    const s = P.aim > 0.5 || G.mode === 'duel' ? 3 : 2;
    hx.fillRect(cx - s, cy - s, s * 2, s * 2); hx.strokeRect(cx - s - 0.5, cy - s - 0.5, s * 2 + 1, s * 2 + 1);
    if (P.aim > 0.5 && Wp.pellets) { hx.strokeStyle = 'rgba(244,234,216,0.5)'; hx.beginPath(); hx.arc(cx, cy, 26, 0, 7); hx.stroke(); }
    if (G.hitMark > 0) {
      hx.strokeStyle = '#ffffff'; hx.lineWidth = 2;
      for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { hx.beginPath(); hx.moveTo(cx + a * 6, cy + b * 6); hx.lineTo(cx + a * 12, cy + b * 12); hx.stroke(); }
      hx.lineWidth = 1;
    }
    // boog voor dynamiet
    if (Wp.throwable && P.aim > 0.3) {
      const p = V3(P.pos.x, playerFeetY() + 1.7, P.pos.z), v = throwVel();
      hx.fillStyle = '#ffd060';
      for (let i = 0; i < 40; i++) {
        p.addScaledVector(v, 0.05); v.y -= 16 * 0.05;
        if (p.y < 0) break;
        if (i % 2) continue;
        const q = proj(p); if (q.ok) hx.fillRect(q.x - 2, q.y - 2, 4, 4);
      }
    }
  }
  // duel: laat zien wie je nog moet raken (ook Mo op het balkon)
  if (G.duel && G.duel.phase === 'draw') {
    for (const e of G.duel.opps) {
      if (!e.alive || e.hidden || G.duel.marks.some((m) => m.e === e)) continue;
      const p = V3(e.pos.x, e.y0 + 1.25 * e.scale, e.pos.z);
      const q = proj(p);
      const on = q.ok && q.x > 20 && q.x < W - 20 && q.y > 20 && q.y < H - 20;
      hx.strokeStyle = '#ff3020'; hx.fillStyle = '#ff3020'; hx.lineWidth = 2;
      if (on) { hx.beginPath(); hx.arc(q.x, q.y, 16, 0, 7); hx.stroke(); }
      else {
        const v = p.clone().applyMatrix4(camera.matrixWorldInverse);
        const a = Math.atan2(-v.y, v.x);
        const ex = cx + Math.cos(a) * Math.min(W, H) * 0.38, ey = cy + Math.sin(a) * Math.min(W, H) * 0.38;
        hx.save(); hx.translate(ex, ey); hx.rotate(a);
        hx.beginPath(); hx.moveTo(14, 0); hx.lineTo(-8, -10); hx.lineTo(-8, 10); hx.fill(); hx.restore();
      }
      hx.lineWidth = 1;
    }
  }
  // Dead Eye markeringen
  const marks = G.de ? G.de.marks : G.duel ? G.duel.marks : [];
  for (const mk of marks) {
    const q = proj(V3(mk.e.pos.x, mk.e.y0, mk.e.pos.z).add(mk.off));
    if (!q.ok) continue;
    hx.strokeStyle = '#d01818'; hx.lineWidth = 3;
    hx.beginPath(); hx.moveTo(q.x - 7, q.y - 7); hx.lineTo(q.x + 7, q.y + 7); hx.moveTo(q.x + 7, q.y - 7); hx.lineTo(q.x - 7, q.y + 7); hx.stroke();
    hx.lineWidth = 1;
  }
  // dynamiet van vijanden
  for (const pr of G.projectiles) {
    if (!pr.owner) continue;
    const d = Math.hypot(pr.m.position.x - P.pos.x, pr.m.position.z - P.pos.z);
    if (d > 10) continue;
    const q = proj(pr.m.position);
    if (q.ok) { hx.fillStyle = '#e02020'; hx.font = 'bold 22px Rye, serif'; hx.textAlign = 'center'; hx.fillText('!', q.x, q.y - 14); }
  }
  // treffers uit een richting
  for (const h of G.hurtDir) {
    const dx = Math.sin(h.a), dz = Math.cos(h.a);
    const sx = dx * Math.cos(P.yaw) - dz * Math.sin(P.yaw), sy = -dx * Math.sin(P.yaw) - dz * Math.cos(P.yaw);
    const ang = Math.atan2(-sy, sx);
    hx.strokeStyle = `rgba(200,20,20,${Math.min(1, h.t)})`; hx.lineWidth = 8;
    hx.beginPath(); hx.arc(cx, cy, 90, ang - 0.3, ang + 0.3); hx.stroke(); hx.lineWidth = 1;
  }
  // radar linksonder
  const rx = 92, ry = H - 92, rr = 70;
  hx.save();
  hx.fillStyle = 'rgba(30,22,14,0.55)'; hx.beginPath(); hx.arc(rx, ry, rr, 0, 7); hx.fill();
  hx.strokeStyle = 'rgba(230,214,180,0.6)'; hx.lineWidth = 2; hx.stroke();
  hx.beginPath(); hx.arc(rx, ry, rr, 0, 7); hx.clip();
  const toR = (x, z) => {
    const dx = x - P.pos.x, dz = z - P.pos.z;
    const sx = dx * Math.cos(P.yaw) - dz * Math.sin(P.yaw), sy = -dx * Math.sin(P.yaw) - dz * Math.cos(P.yaw);
    return [rx + sx * 1.6, ry - sy * 1.6];
  };
  // wegrand
  hx.strokeStyle = 'rgba(230,214,180,0.25)'; hx.lineWidth = 1;
  for (const s of [-1, 1]) { const a = toR(s * G.world.hw, P.pos.z + 60), b = toR(s * G.world.hw, P.pos.z - 60); hx.beginPath(); hx.moveTo(a[0], a[1]); hx.lineTo(b[0], b[1]); hx.stroke(); }
  for (const k of G.pickups) { const [x, y] = toR(k.g.position.x, k.g.position.z); hx.fillStyle = '#e8e0d0'; hx.fillRect(x - 1.5, y - 1.5, 3, 3); }
  for (const e of G.enemies) {
    if (!e.alive || e.hidden) continue;
    const [x, y] = toR(e.pos.x, e.pos.z);
    hx.fillStyle = e.boss ? '#ff4020' : '#d01818';
    hx.beginPath(); hx.arc(x, y, e.boss ? 5 : 3.2, 0, 7); hx.fill();
  }
  if (G.obj?.pos) {
    let [x, y] = toR(G.obj.pos.x, G.obj.pos.z);
    const d = Math.hypot(x - rx, y - ry);
    if (d > rr - 8) { x = rx + (x - rx) / d * (rr - 8); y = ry + (y - ry) / d * (rr - 8); }
    hx.fillStyle = '#f0c040'; hx.beginPath(); hx.arc(x, y, 5, 0, 7); hx.fill();
    hx.strokeStyle = '#3a2a10'; hx.stroke();
  }
  hx.restore();
  // speler-pijl
  hx.fillStyle = '#f4ead8'; hx.beginPath(); hx.moveTo(rx, ry - 7); hx.lineTo(rx - 5, ry + 5); hx.lineTo(rx + 5, ry + 5); hx.fill();
  // leven en Dead Eye als bogen om de radar
  const arc = (v, r0, col, a0, a1) => {
    hx.lineWidth = 6; hx.strokeStyle = 'rgba(0,0,0,0.5)'; hx.beginPath(); hx.arc(rx, ry, r0, a0, a1); hx.stroke();
    hx.strokeStyle = col; hx.beginPath(); hx.arc(rx, ry, r0, a0, a0 + (a1 - a0) * clamp(v, 0, 1)); hx.stroke(); hx.lineWidth = 1;
  };
  arc(P.hp / 100, rr + 7, P.hp < 30 ? '#e03020' : '#e8dcc4', Math.PI * 0.55, Math.PI * 1.45);
  arc(P.de / 100, rr + 7, '#e8a830', Math.PI * 1.55, Math.PI * 2.45);
  hx.font = '11px "IM Fell English", serif'; hx.fillStyle = '#e8dcc4'; hx.textAlign = 'center';
  hx.fillText('LEVEN', rx - rr + 4, ry + rr + 18); hx.fillText('DEAD EYE', rx + rr - 8, ry + rr + 18);
  // wapen en munitie
  hx.textAlign = 'right';
  hx.font = '22px Rye, serif'; hx.fillStyle = '#f4ead8';
  const a = P.ammo[P.weapon];
  const ammoTxt = Wp.melee ? '∞' : Wp.throwable ? `${(a?.mag || 0) + (a?.res || 0)}` : `${a.mag} / ${a.res}`;
  hx.shadowColor = '#000'; hx.shadowBlur = 4;
  hx.fillText(ammoTxt, W - 28, H - 34);
  hx.font = '15px "IM Fell English", serif';
  hx.fillText(Wp.name + (P.reload > 0 ? ' — herladen…' : ''), W - 28, H - 62);
  // wapenlijst
  hx.font = '12px "IM Fell English", serif';
  let y0 = H - 92;
  for (const w of [...P.owned].reverse()) {
    hx.fillStyle = w === P.weapon ? '#f0c040' : 'rgba(244,234,216,0.6)';
    hx.fillText(`${WEAPONS[w].key}  ${WEAPONS[w].name}`, W - 28, y0); y0 -= 16;
  }
  // premie
  hx.textAlign = 'right'; hx.font = '14px "IM Fell English", serif'; hx.fillStyle = '#e8dcc4';
  hx.fillText(`PREMIE  $${Math.round(G.bounty).toLocaleString('en-US')}`, W - 24, 34);
  // baas
  const b = G.boss;
  if (b && b.alive) {
    const bw = Math.min(460, W * 0.5);
    hx.textAlign = 'center'; hx.font = '18px Rye, serif'; hx.fillStyle = '#f4ead8';
    hx.fillText(b.name, W / 2, 46);
    hx.fillStyle = 'rgba(0,0,0,0.6)'; hx.fillRect(W / 2 - bw / 2, 56, bw, 10);
    hx.fillStyle = G.bossHit > 0 ? '#ffffff' : '#b01818'; hx.fillRect(W / 2 - bw / 2, 56, bw * Math.max(0, b.hp / b.maxHp), 10);
  }
  // interactie
  if (G.sec?.talk && G.sec.S.npc && Math.hypot(G.sec.S.npc.position.x - P.pos.x, G.sec.S.npc.position.z - P.pos.z) < 3.2) {
    hx.textAlign = 'center'; hx.font = '18px "IM Fell English", serif'; hx.fillStyle = '#f4ead8';
    hx.fillText('[E]  Praten', cx, cy + 70);
  }
  hx.shadowBlur = 0;
  // pijl naar het doel op het scherm
  if (G.obj?.pos && G.mode === 'play') {
    const q = proj(V3(G.obj.pos.x, 2.2, G.obj.pos.z));
    const dist = Math.hypot(G.obj.pos.x - P.pos.x, G.obj.pos.z - P.pos.z);
    if (q.ok && dist > 4) {
      hx.fillStyle = '#f0c040'; hx.beginPath(); hx.moveTo(q.x, q.y + 8); hx.lineTo(q.x - 7, q.y - 4); hx.lineTo(q.x + 7, q.y - 4); hx.fill();
      hx.font = '12px "IM Fell English", serif'; hx.textAlign = 'center'; hx.fillText(Math.round(dist) + ' m', q.x, q.y - 10);
    }
  }
  // rode rand bij weinig leven
  $('#blood').style.opacity = clamp((60 - P.hp) / 60, 0, 0.85) + (P.dmgT < 0.25 ? 0.25 : 0);
}

// =====================================================================
//  hoofdlus
// =====================================================================
let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  let dtr = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (G.paused) dtr = 0;
  dtr *= G.speed || 1;
  G.t += dtr;
  // tijd vertragen in Dead Eye en tijdens het duel
  let ts = 1;
  if (G.de && G.de.active) ts = G.de.firing ? 0.45 : 0.28;
  if (G.mode === 'duel') ts = G.timeScale;
  if (G.mode === 'dead') ts = 0.4;
  const dt = dtr * ts;
  if (G.mode === 'cut' || G.mode === 'menu') updateCut(dtr);
  if (G.world) {
    if (G.mode === 'play' || G.mode === 'dead' || G.mode === 'duel' || G.mode === 'cut' || G.mode === 'done') {
      if (G.mode === 'cut') {
        // tijdens filmpjes: Shane speelt zijn eigen houding
        const cp = G.cutPose;
        if (!G.walkers.some((w) => w.model === P.model)) animHuman(P.model, { sit: cp?.sit, drink: cp?.drink ? (Math.sin(G.t * 2) * 0.5 + 0.5) : 0 }, dtr);
        for (const e of G.enemies) updateEnemy(e, dtr);
      } else {
        if (G.mode === 'duel') updateDuel(dtr);
        updatePlayer(dt, dtr);
        updateRide(dt);
        for (const e of G.enemies) updateEnemy(e, dt);
        G.enemies = G.enemies.filter((e) => !e.gone);
        updateProjectiles(dt);
        updatePickups(dt);
        if (G.mode === 'play') { updateDeadEye(dtr); updateSection(dt); }
      }
      updateFx(dt, dtr);
      updateSubs(dtr);
    }
    if (G.world.millWings) G.world.millWings.rotation.z += dtr * 0.6;
    if (G.world.waterTex) for (const t of G.world.waterTex) t.offset.y += dtr * (G.ride?.kind === 'boat' ? 0 : 0.05);
    if (G.world.water) G.world.water.offset.y += dtr * 0.08;
    for (const l of G.world.lamps) l.material.color.setScalar(0.85 + Math.sin(G.t * 9 + l.position.z) * 0.08).multiply(C('#ffd070'));
    if (rain) { rain.position.set(camera.position.x, 0, camera.position.z); rain.geometry.attributes.position.array; rain.position.y = -((G.t * 14) % 6); }
    if (G.world.time.rain && Math.random() < dtr * 0.08) { G.world.hemi.intensity = 6; setTimeout(() => sfx('thunder', 0.7), 600); }
    if (G.world.time.rain) G.world.hemi.intensity = lerp(G.world.hemi.intensity, G.world.time.hemi[2], 1 - Math.exp(-dtr * 6));
    G.world.sky.position.copy(camera.position);
  }
  G.bossHit = Math.max(0, (G.bossHit || 0) - dtr);
  updateCamera(dtr);
  renderer.render(scene, camera);
  drawHud();
  mouse.lPressed = false; mouse.rPressed = false;
}

// =====================================================================
//  start
// =====================================================================
bindUi();
buildLevel(Math.min(save.unlocked, LEVELS.length - 1));
P.pos.set(0, 0, -6);
refreshMenu();
requestAnimationFrame(loop);
$('#loading').classList.add('hidden');
document.addEventListener('click', () => initAudio(), { once: true });
// debug: #level=5 start meteen
const hm = location.hash.match(/level=(\d+)/);
if (hm) setTimeout(() => startLevel(clamp(parseInt(hm[1], 10) - 1, 0, LEVELS.length - 1)), 100);
Object.assign(G, { damageEnemy, tryInteract, aimAt, V3, startLevel, skipCut, restartCheckpoint, P, activateSection, completeSection, spawnEnemy, toMenu, keys, mouse, giveWeapon, deadEyeToggle });
