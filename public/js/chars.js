import * as THREE from './three.module.min.js';
import { canvasTex, psxTex, tex } from './psx.js';

const boxG = new Map();
export function box(w, h, d) {
  const k = `${w},${h},${d}`;
  if (!boxG.has(k)) boxG.set(k, new THREE.BoxGeometry(w, h, d));
  return boxG.get(k);
}
const matC = new Map();
export function mat(color, map, extra) {
  const k = color + (map ? map.uuid : '') + (extra ? JSON.stringify(extra) : '');
  if (!matC.has(k)) matC.set(k, new THREE.MeshLambertMaterial({ color, map: map || null, ...extra }));
  return matC.get(k);
}
function part(w, h, d, m, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(box(w, h, d), m);
  o.position.set(x, y, z);
  return o;
}

// gezichten: Shane heeft zijn eigen foto, de rest wordt getekend
let shaneFace = null;
function faceTex(o) {
  if (o.photo) {
    if (!shaneFace) shaneFace = psxTex(new THREE.TextureLoader().load(o.photo));
    return shaneFace;
  }
  const key = JSON.stringify([o.skin, o.beard, o.beardColor, o.brow, o.hairColor, o.scar, o.stache]);
  faceTex.c = faceTex.c || {};
  if (faceTex.c[key]) return faceTex.c[key];
  const t = canvasTex(32, 32, (x) => {
    x.fillStyle = o.skin; x.fillRect(0, 0, 32, 32);
    x.fillStyle = 'rgba(0,0,0,0.12)'; x.fillRect(0, 26, 32, 6);
    // ogen
    x.fillStyle = '#f2efe6'; x.fillRect(7, 12, 6, 3); x.fillRect(19, 12, 6, 3);
    x.fillStyle = '#2a1a10'; x.fillRect(9, 12, 3, 3); x.fillRect(21, 12, 3, 3);
    // wenkbrauwen
    x.fillStyle = o.brow || o.hairColor || '#2a1a10';
    x.fillRect(6, 9, 8, o.thickBrow ? 3 : 2); x.fillRect(18, 9, 8, o.thickBrow ? 3 : 2);
    // neus
    x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(15, 14, 3, 7);
    // mond
    x.fillStyle = '#6a2c22'; x.fillRect(11, 23, 10, 2);
    if (o.beard) {
      x.fillStyle = o.beardColor || '#2a1a10';
      x.fillRect(0, 20, 32, 12); x.fillRect(0, 14, 4, 8); x.fillRect(28, 14, 4, 8);
      x.fillStyle = '#4a2018'; x.fillRect(12, 23, 8, 2);
    }
    if (o.stache) { x.fillStyle = o.beardColor || '#2a1a10'; x.fillRect(9, 20, 14, 3); }
    if (o.scar) { x.fillStyle = '#c66'; x.fillRect(22, 6, 1, 14); }
  }, false);
  faceTex.c[key] = t;
  return t;
}

/*
 opties: skin, shirt, pants, coat (kleur of null), long (lange jas), hat (null|'cowboy'|'bowler'|'stetson'|'cap'),
 hatColor, hair ('bun'|'short'|'curly'|'long'|'bald'), hairColor, beard, beardColor, scale, belly, bandana, vest, photo
*/
export function makeHuman(o) {
  const root = new THREE.Group();
  const s = o.scale || 1;
  const skin = mat(o.skin || '#d9a57e');
  const shirt = mat(o.shirt || '#8a6a4a');
  const pants = mat(o.pants || '#3b3226');
  const boots = mat(o.boots || '#2a1c12');
  const body = new THREE.Group(); body.scale.setScalar(s); root.add(body);
  const hips = new THREE.Group(); hips.position.y = 0.95; body.add(hips);
  const mkLeg = (x) => {
    const g = new THREE.Group(); g.position.set(x, 0, 0);
    g.add(part(0.17, 0.5, 0.18, pants, 0, -0.25, 0));
    const knee = new THREE.Group(); knee.position.y = -0.48; g.add(knee);
    knee.add(part(0.16, 0.42, 0.17, pants, 0, -0.2, 0));
    knee.add(part(0.18, 0.12, 0.28, boots, 0, -0.42, 0.04));
    g.userData.knee = knee;
    hips.add(g); return g;
  };
  const legL = mkLeg(0.11), legR = mkLeg(-0.11);
  const torso = new THREE.Group(); hips.add(torso);
  const bw = o.belly ? 0.5 : 0.42;
  torso.add(part(bw, 0.62, o.belly ? 0.34 : 0.24, shirt, 0, 0.31, o.belly ? 0.03 : 0));
  if (o.vest) torso.add(part(bw + 0.02, 0.4, (o.belly ? 0.34 : 0.24) + 0.02, mat(o.vest), 0, 0.36, o.belly ? 0.03 : 0));
  if (o.coat) {
    const cm = mat(o.coat);
    torso.add(part(bw + 0.04, 0.64, 0.08, cm, 0, 0.31, -0.13));
    torso.add(part(0.09, 0.64, 0.24, cm, bw / 2, 0.31, 0));
    torso.add(part(0.09, 0.64, 0.24, cm, -bw / 2, 0.31, 0));
    if (o.long) {
      const tail = new THREE.Group(); tail.position.y = 0.02; hips.add(tail);
      tail.add(part(0.48, 0.62, 0.06, cm, 0, -0.31, -0.13));
      tail.add(part(0.06, 0.62, 0.22, cm, 0.24, -0.31, -0.02));
      tail.add(part(0.06, 0.62, 0.22, cm, -0.24, -0.31, -0.02));
    }
  }
  hips.add(part(0.46, 0.08, 0.27, mat('#3a2616'), 0, 0.02, 0)); // riem
  if (o.bandana) torso.add(part(0.28, 0.08, 0.26, mat(o.bandana), 0, 0.6, 0.02));
  if (o.chain) torso.add(part(0.2, 0.03, 0.02, mat('#e8c040'), 0, 0.52, 0.13));
  const neck = new THREE.Group(); neck.position.y = 0.64; torso.add(neck);
  const head = new THREE.Group(); neck.add(head);
  const hm = [skin, skin, skin, skin, mat('#ffffff', faceTex(o)), skin];
  const hd = new THREE.Mesh(box(0.26, 0.3, 0.27), hm); hd.position.y = 0.17; head.add(hd);
  const hc = mat(o.hairColor || '#3a2414');
  const hair = o.hair || 'short';
  if (hair !== 'bald') {
    head.add(part(0.28, 0.07, 0.29, hc, 0, 0.33, -0.005));
    head.add(part(0.28, 0.16, 0.06, hc, 0, 0.24, -0.12));
    if (hair === 'curly' || hair === 'bun') { head.add(part(0.3, 0.06, 0.26, hc, 0, 0.36, -0.01)); }
    if (hair === 'long') head.add(part(0.28, 0.32, 0.06, hc, 0, 0.12, -0.13));
    if (hair === 'bun') {
      // man bun met krullen, zoals op de foto
      head.add(part(0.15, 0.13, 0.15, hc, 0, 0.44, -0.04));
      head.add(part(0.1, 0.07, 0.11, hc, 0.04, 0.52, -0.02));
      head.add(part(0.08, 0.06, 0.08, hc, -0.05, 0.5, -0.07));
    }
  }
  if (o.beard) head.add(part(0.27, 0.12, 0.08, mat(o.beardColor || '#2a1a10'), 0, 0.04, 0.12));
  if (o.bigBeard) head.add(part(0.3, 0.24, 0.14, mat(o.beardColor || '#2a1a10'), 0, -0.02, 0.1));
  if (o.hat) {
    const hm2 = mat(o.hatColor || '#5a4030');
    const brim = o.hat === 'stetson' ? 0.6 : o.hat === 'bowler' ? 0.36 : 0.46;
    head.add(part(brim, 0.03, brim * 0.92, hm2, 0, 0.35, 0));
    const crownH = o.hat === 'stetson' ? 0.2 : 0.15;
    head.add(part(0.28, crownH, 0.28, hm2, 0, 0.35 + crownH / 2, 0));
    if (o.hat !== 'bowler') head.add(part(0.29, 0.04, 0.29, mat('#2a1a10'), 0, 0.39, 0));
  }
  const mkArm = (x) => {
    const g = new THREE.Group(); g.position.set(x, 0.58, 0);
    const sm = o.coat ? mat(o.coat) : shirt;
    g.add(part(0.13, 0.32, 0.14, sm, 0, -0.15, 0));
    const el = new THREE.Group(); el.position.y = -0.3; g.add(el);
    el.add(part(0.12, 0.28, 0.13, sm, 0, -0.13, 0));
    el.add(part(0.1, 0.1, 0.1, skin, 0, -0.31, 0));
    const hand = new THREE.Group(); hand.position.y = -0.32; el.add(hand);
    g.userData.el = el; g.userData.hand = hand;
    torso.add(g); return g;
  };
  const armL = mkArm(bw / 2 + 0.08), armR = mkArm(-bw / 2 - 0.08);
  root.userData = { body, hips, torso, head, neck, legL, legR, armL, armR, scale: s, gun: null, phase: Math.random() * 6 };
  root.traverse((m) => { if (m.isMesh) m.userData.actor = root; });
  return root;
}

export function gunModel(kind) {
  const g = new THREE.Group();
  const metal = mat('#3c3c40'), wood = mat('#6a4022'), steel = mat('#8a8a90');
  // de loop wijst langs -y van de hand (arm hangt omlaag); als de arm vooruit gaat wijst hij vooruit
  if (kind === 'revolver') {
    g.add(part(0.04, 0.05, 0.12, wood, 0, 0, 0.02));
    g.add(part(0.05, 0.22, 0.06, metal, 0, -0.1, 0.06));
    g.add(part(0.06, 0.06, 0.07, steel, 0, -0.03, 0.06));
  } else if (kind === 'lever' || kind === 'rifle') {
    g.add(part(0.05, 0.3, 0.08, wood, 0, 0.12, 0.05));
    g.add(part(0.04, 0.7, 0.05, metal, 0, -0.35, 0.07));
    g.add(part(0.05, 0.35, 0.05, wood, 0, -0.25, 0.03));
    g.add(part(0.03, 0.08, 0.06, steel, 0, 0.0, 0.0));
  } else if (kind === 'shotgun') {
    g.add(part(0.06, 0.3, 0.09, wood, 0, 0.12, 0.05));
    g.add(part(0.09, 0.6, 0.05, metal, 0, -0.3, 0.07));
    g.add(part(0.07, 0.25, 0.06, wood, 0, -0.18, 0.03));
  } else if (kind === 'knife') {
    g.add(part(0.03, 0.1, 0.04, wood, 0, 0, 0.02));
    g.add(part(0.015, 0.22, 0.05, steel, 0, -0.15, 0.03));
  } else if (kind === 'dynamite') {
    g.add(part(0.06, 0.2, 0.06, mat('#b8322a'), 0, -0.05, 0.03));
    g.add(part(0.01, 0.06, 0.01, mat('#ddd'), 0, -0.18, 0.03));
  } else if (kind === 'mug') {
    g.add(part(0.09, 0.12, 0.09, mat('#e8e2d0'), 0, -0.02, 0.05));
    g.add(part(0.07, 0.01, 0.07, mat('#5a3418'), 0, 0.045, 0.05)); // chocomel
  }
  g.userData.kind = kind;
  return g;
}

export function setGun(h, kind) {
  const u = h.userData;
  if (u.gun) { u.gun.parent.remove(u.gun); u.gun = null; }
  if (!kind) return;
  u.gun = gunModel(kind);
  u.armR.userData.hand.add(u.gun);
  u.gun.traverse((m) => { if (m.isMesh) m.userData.actor = h; });
}

// a: { speed (m/s), aim (0..1), pitch, crouch (0..1), t, sit, ride, dead (0..1), melee (0..1), draw (0..1) }
export function animHuman(h, a, dt) {
  const u = h.userData;
  u.phase += dt * (a.speed || 0) * 2.1;
  const sw = Math.min(1, (a.speed || 0) / 3) * 0.7;
  const p = u.phase;
  const crouch = a.crouch || 0;
  const two = u.gun && u.gun.userData.kind !== 'revolver' && u.gun.userData.kind !== 'knife' && u.gun.userData.kind !== 'dynamite' && u.gun.userData.kind !== 'mug';
  if (a.sit) {
    u.hips.position.y = 0.55; u.hips.rotation.x = 0;
    u.legL.rotation.x = u.legR.rotation.x = -1.5;
    u.legL.userData.knee.rotation.x = u.legR.userData.knee.rotation.x = 1.5;
  } else if (a.ride) {
    u.hips.position.y = 0.95; u.hips.rotation.x = 0;
    u.legL.rotation.set(-0.9, 0, 0.45); u.legR.rotation.set(-0.9, 0, -0.45);
    u.legL.userData.knee.rotation.x = u.legR.userData.knee.rotation.x = 1.2;
  } else {
    u.legL.rotation.z = u.legR.rotation.z = 0;
    u.hips.position.y = 0.95 - crouch * 0.38 + Math.abs(Math.sin(p)) * sw * 0.05;
    u.legL.rotation.x = Math.sin(p) * sw - crouch * 1.1;
    u.legR.rotation.x = -Math.sin(p) * sw - crouch * 0.4;
    u.legL.userData.knee.rotation.x = Math.max(0, -Math.sin(p)) * sw * 1.2 + crouch * 1.6;
    u.legR.userData.knee.rotation.x = Math.max(0, Math.sin(p)) * sw * 1.2 + crouch * 1.9;
  }
  u.torso.rotation.x = crouch * 0.35 + (a.speed > 5 ? 0.15 : 0);
  const aim = a.aim || 0, pitch = a.pitch || 0;
  // rechterarm: hangt of richt
  const swingR = -Math.sin(p) * sw * 0.8;
  const aimX = -Math.PI / 2 - pitch - u.torso.rotation.x;
  u.armR.rotation.x = swingR * (1 - aim) + aimX * aim;
  u.armR.rotation.z = 0;
  u.armR.rotation.y = 0;
  u.armR.userData.el.rotation.x = (1 - aim) * -0.25;
  if (two) {
    u.armL.rotation.x = Math.sin(p) * sw * 0.8 * (1 - aim) + (aimX + 0.15) * aim;
    u.armL.rotation.z = -0.55 * aim;
  } else {
    u.armL.rotation.x = Math.sin(p) * sw * 0.8;
    u.armL.rotation.z = 0;
  }
  u.armL.userData.el.rotation.x = -0.25;
  if (a.melee) { u.armR.rotation.x = -1.2 - Math.sin(a.melee * Math.PI) * 1.2; u.armR.rotation.y = 0.3; }
  if (a.throwing) { u.armR.rotation.x = -2.6 + a.throwing * 2.4; }
  if (a.drink) { u.armR.rotation.x = -1.6 - a.drink * 0.6; u.armR.userData.el.rotation.x = -1.4; }
  u.head.rotation.x = aim ? pitch * 0.5 : 0;
  // vallen
  if (a.dead) {
    const d = Math.min(1, a.dead);
    u.body.rotation.x = -d * Math.PI / 2 * (a.deadDir || 1);
    u.body.position.y = d * 0.15;
    u.hips.position.y = 0.95 - d * 0.5;
    u.armR.rotation.x = u.armL.rotation.x = -d * 2.5;
  } else { u.body.rotation.x = 0; u.body.position.y = 0; }
}

export function makeHorse(color = '#6b4228', mane = '#2a1a10') {
  const g = new THREE.Group();
  const m = mat(color), mm = mat(mane), hoof = mat('#222');
  const body = part(0.6, 0.6, 1.6, m, 0, 1.25, 0); g.add(body);
  const neck = new THREE.Group(); neck.position.set(0, 1.45, 0.7); neck.rotation.x = -0.6; g.add(neck);
  neck.add(part(0.3, 0.75, 0.35, m, 0, 0.35, 0));
  neck.add(part(0.08, 0.7, 0.2, mm, 0, 0.35, -0.15));
  const head = part(0.26, 0.26, 0.6, m, 0, 0.72, 0.2); neck.add(head);
  g.add(part(0.08, 0.6, 0.1, mm, 0, 1.1, -0.85)); // staart
  g.add(part(0.62, 0.12, 0.6, mat('#4a2c18'), 0, 1.58, -0.05)); // zadel
  const legs = [];
  for (const [x, z] of [[0.2, 0.62], [-0.2, 0.62], [0.2, -0.62], [-0.2, -0.62]]) {
    const l = new THREE.Group(); l.position.set(x, 1.0, z); g.add(l);
    l.add(part(0.13, 0.9, 0.15, m, 0, -0.45, 0));
    l.add(part(0.15, 0.1, 0.17, hoof, 0, -0.95, 0));
    legs.push(l);
  }
  g.userData = { legs, phase: 0 };
  return g;
}
export function animHorse(h, speed, dt) {
  const u = h.userData;
  u.phase += dt * speed * 1.4;
  const a = Math.min(0.7, speed * 0.08);
  u.legs.forEach((l, i) => { l.rotation.x = Math.sin(u.phase + (i === 0 || i === 3 ? 0 : Math.PI)) * a; });
}

// PERSONAGES
export const CAST = {
  shane: { photo: 'img/shane-face.png', skin: '#e2b59a', hair: 'bun', hairColor: '#4a2a16', shirt: '#1c1c1e', pants: '#2b2b30', coat: '#2a2320', long: true, bandana: '#7a1a1a', beard: false },
  tex: { skin: '#e8b08a', hair: 'short', hairColor: '#7a3a18', bigBeard: true, beardColor: '#8a4420', hat: 'stetson', hatColor: '#e8e0cc', shirt: '#b84a3a', pants: '#3a4a6a', vest: '#5a3a22', scale: 1.22, belly: true, thickBrow: true },
  mo: { skin: '#b07850', hair: 'curly', hairColor: '#120c08', beard: true, beardColor: '#120c08', thickBrow: true, brow: '#120c08', shirt: '#efe8dc', vest: '#7a1424', pants: '#1a1a1a', hat: 'cowboy', hatColor: '#151515', chain: true },
  bartender: { skin: '#e0b090', hair: 'bald', stache: true, beardColor: '#5a3a1a', shirt: '#f0ece0', vest: '#2a2a2a', pants: '#2a2a2a' },
};
const GOON_SHIRTS = ['#8a3a2a', '#5a6a3a', '#6a5a4a', '#3a4a6a', '#7a6a3a', '#5a3a5a', '#4a4a4a', '#9a7a5a'];
const SKINS = ['#e0b090', '#c8946a', '#a87050', '#e8c0a0', '#8a5a3a', '#d4a07a'];
export function goonLook(r, faction = 'gang', type = 'gunman') {
  const pick = (a) => a[Math.floor(r() * a.length)];
  const o = { skin: pick(SKINS), hair: pick(['short', 'curly', 'long', 'bald']), hairColor: pick(['#2a1a10', '#5a3a1a', '#8a5a2a', '#1a1a1a', '#a08050']),
    shirt: pick(GOON_SHIRTS), pants: pick(['#3b3226', '#2a2a30', '#4a3a2a', '#3a4a5a']), hat: pick(['cowboy', 'cowboy', 'bowler', 'stetson']),
    hatColor: pick(['#5a4030', '#2a2018', '#7a6a50', '#3a3030', '#8a7a60']), beard: r() < 0.4, beardColor: '#3a2414', stache: r() < 0.3 };
  if (faction === 'gang') { o.bandana = '#8a1a1a'; o.vest = r() < 0.5 ? '#1a1a1a' : null; }
  if (faction === 'hunter') { o.coat = pick(['#5a4a3a', '#3a3a2a', '#6a5a40']); o.long = true; }
  if (faction === 'plus') { o.shirt = '#d8d8d8'; o.vest = '#c8202a'; o.coat = '#1e2e5a'; o.hat = 'bowler'; o.hatColor = '#1a1a1a'; o.bandana = null; }
  if (faction === 'law') { o.vest = '#2a2a2a'; o.shirt = '#cfc4a8'; o.hat = 'cowboy'; o.hatColor = '#3a2a1a'; }
  if (type === 'brute') { o.scale = 1.18; o.belly = true; o.hat = null; o.hair = 'bald'; o.beard = true; }
  return o;
}
