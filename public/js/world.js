import * as THREE from './three.module.min.js';
import { tex, canvasTex, rng } from './psx.js';
import { mat, makeHorse, makeHuman, CAST } from './chars.js';

// box met textures die per meter herhalen (anders rekt een lange muur de planken uit)
function tbox(w, h, d, t, s = 2) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
    const i = f * 4 + k;
    uv.setXY(i, uv.getX(i) * dims[f][0] / s, uv.getY(i) * dims[f][1] / s);
  }
  return g;
}

export const TIMES = {
  day: { bg: '#e8d4ac', top: '#7fb0d8', fog: [30, 130], hemi: ['#fff2dc', '#8a6a48', 2.1], sun: ['#fff0d0', 2.3] },
  dusk: { bg: '#e0905e', top: '#5a4a7a', fog: [25, 110], hemi: ['#ffc8a0', '#4a3028', 1.7], sun: ['#ffa060', 2.0] },
  night: { bg: '#1c2644', top: '#070a16', fog: [12, 65], hemi: ['#8090c8', '#2a2018', 2.6], sun: ['#9aaad8', 1.4], lantern: true },
  dawn: { bg: '#eab8a0', top: '#8aa0c8', fog: [25, 120], hemi: ['#ffd8d0', '#5a4a48', 1.8], sun: ['#ffc8a8', 1.8] },
  fog: { bg: '#a4aca2', top: '#8a948a', fog: [6, 42], hemi: ['#d0d8d0', '#5a5a48', 2.3], sun: ['#e0e8e0', 1.0] },
  storm: { bg: '#4e565e', top: '#262a30', fog: [12, 70], hemi: ['#9aaab8', '#3a3430', 2.2], sun: ['#b0c0d0', 1.0], rain: true },
  cave: { bg: '#0b0907', top: '#0b0907', fog: [6, 38], hemi: ['#8a7a64', '#2a2018', 2.0], sun: ['#ffd8a0', 0.5], lantern: true },
};

// ronde, onregelmatige klont (rotsen, bladeren) in plaats van een kale dodecaëder
const blobCache = [];
function blob(r, _d) {
  const k = blobCache.length < 12 ? blobCache.length : Math.floor(Math.random() * 12);
  if (!blobCache[k]) {
    const g = new THREE.IcosahedronGeometry(1, 2);
    const p = g.attributes.position, seen = new Map();
    for (let i = 0; i < p.count; i++) {
      const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
      if (!seen.has(key)) seen.set(key, 0.85 + Math.random() * 0.3);
      const f = seen.get(key);
      p.setXYZ(i, p.getX(i) * f, p.getY(i) * f, p.getZ(i) * f);
    }
    g.computeVertexNormals();
    blobCache[k] = g;
  }
  const g = blobCache[k].clone();
  g.scale(r, r, r);
  return g;
}

const THEMES = {
  town: { ground: 'road', edge: 'sand', hw: 8, side: 'buildings', style: 'wood', props: ['barrel', 'crate', 'wagon', 'trough', 'hay', 'crate', 'barrel'] },
  ghost: { ground: 'road', edge: 'sand', hw: 8, side: 'buildings', style: 'ghost', props: ['barrel', 'crate', 'wagon', 'coffin', 'crate', 'deadtree'] },
  city: { ground: 'cobble', edge: 'cobble', hw: 9, side: 'buildings', style: 'brick', props: ['crate', 'barrel', 'wagon', 'lamp', 'crate', 'sandbag'] },
  canyon: { ground: 'sand', edge: 'sand', hw: 11, side: 'rocks', rock: 'rock', props: ['boulder', 'deadtree', 'cactus', 'crate', 'barrel', 'boulder'] },
  snow: { ground: 'snow', edge: 'snow', hw: 11, side: 'rocks', rock: 'rockgrey', pines: true, props: ['boulder', 'pine', 'crate', 'log', 'sandbag', 'boulder'] },
  rail: { ground: 'sand', edge: 'sand', hw: 13, side: 'railyard', props: ['traincar', 'crate', 'barrel', 'crate', 'sandbag'] },
  prairie: { ground: 'grass', edge: 'grass', hw: 16, side: 'open', props: ['hay', 'fence', 'wagon', 'barrel', 'tree', 'boulder', 'hay'] },
  heath: { ground: 'heath', edge: 'heath', hw: 15, side: 'open', props: ['boulder', 'tree', 'tent', 'sandbag', 'boulder', 'hay'] },
  forest: { ground: 'forest', edge: 'forest', hw: 12, side: 'trees', props: ['log', 'tree', 'boulder', 'stump', 'tree'] },
  mine: { ground: 'cave', edge: 'cave', hw: 6, side: 'cave', props: ['cart', 'crate', 'barrel', 'boulder', 'beam'], time: 'cave' },
  fort: { ground: 'sand', edge: 'sand', hw: 13, side: 'palisade', props: ['crate', 'barrel', 'tent', 'sandbag', 'cannon', 'wagon', 'sandbag'] },
  border: { ground: 'grass', edge: 'grass', hw: 13, side: 'palisade', props: ['sandbag', 'crate', 'barrel', 'wagon', 'sandbag', 'tent'] },
  docks: { ground: 'planksGrey', edge: 'water', hw: 9, side: 'docks', props: ['crate', 'barrel', 'crate', 'crate', 'barrel', 'sandbag'] },
  marsh: { ground: 'swamp', edge: 'swamp', hw: 12, side: 'reeds', props: ['deadtree', 'boulder', 'log', 'stump', 'deadtree'] },
  river: { ground: 'water', edge: 'sand', hw: 14, side: 'river', props: [] },
};

export class World {
  constructor(scene, level, li) {
    this.scene = scene;
    this.level = level;
    this.th = THEMES[level.theme];
    this.hw = this.th.hw;
    this.r = rng(level.seed * 7919 + 13);
    this.group = new THREE.Group();
    this.dyn = new THREE.Group(); // niet samengevoegd (bewegende of losse dingen)
    scene.add(this.group); scene.add(this.dyn);
    this.colliders = [];
    this.perches = [];
    this.lamps = [];
    this.npcs = {};
    // secties uitleggen langs -z
    let z = 0;
    this.sections = level.sections.map((s) => {
      const o = { start: z, end: z - s.len, s };
      z -= s.len;
      return o;
    });
    this.length = -z;
    this.endZ = z;
    this.time = TIMES[this.th.time || level.time];
    this.build();
  }

  add(mesh, x, y, z, ry = 0, dyn = false) {
    mesh.position.set(x, y, z); mesh.rotation.y = ry;
    (dyn ? this.dyn : this.group).add(mesh);
    return mesh;
  }
  // botsvak (as-uitgelijnd)
  solid(cx, cz, w, d, y1, y0 = 0) {
    const c = { x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2, y0, y1 };
    this.colliders.push(c);
    return c;
  }
  boxAt(w, h, d, t, x, y, z, s = 2, coll = true, color = '#ffffff') {
    const m = new THREE.Mesh(tbox(w, h, d, t, s), mat(color, tex(t)));
    this.add(m, x, y + h / 2, z);
    if (coll) this.solid(x, z, w, d, y + h, y);
    return m;
  }
  inRide(z, pad = 0) {
    return this.sections.some((S) => (S.s.t === 'ride') && z < S.start + pad && z > S.end - pad);
  }
  inQuiet(z) {
    return this.sections.some((S) => (S.s.t === 'duel' || S.s.t === 'defend') && z < S.start + 2 && z > S.end - 2) || z > -8 && this.level.bar;
  }

  build() {
    const T = this.time, th = this.th;
    const sc = this.scene;
    sc.background = new THREE.Color(T.bg);
    sc.fog = new THREE.Fog(T.bg, T.fog[0], T.fog[1]);
    this.hemi = new THREE.HemisphereLight(T.hemi[0], T.hemi[1], T.hemi[2]);
    this.sun = new THREE.DirectionalLight(T.sun[0], T.sun[1]);
    this.sun.position.set(-6, 10, 4);
    sc.add(this.hemi, this.sun);
    this.fogFar = T.fog[1];
    // lucht
    const sky = new THREE.SphereGeometry(1, 12, 8);
    const col = [], c1 = new THREE.Color(T.top), c0 = new THREE.Color(T.bg);
    for (let i = 0; i < sky.attributes.position.count; i++) {
      const y = sky.attributes.position.getY(i);
      const c = c0.clone().lerp(c1, Math.max(0, y) ** 0.7);
      col.push(c.r, c.g, c.b);
    }
    sky.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    this.sky = new THREE.Mesh(sky, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    this.sky.renderOrder = -10;
    this.sky.scale.setScalar(T.fog[1] * 0.9);
    sc.add(this.sky);

    const L = this.length + 60;
    const cz = -this.length / 2;
    // grond
    const gt = tex(th.ground).clone(); gt.needsUpdate = true;
    gt.repeat.set(this.hw * 2 / 3, L / 3);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(this.hw * 2, L), new THREE.MeshLambertMaterial({ map: gt }));
    ground.material.defines = { PSX_PERSP: '' };
    ground.rotation.x = -Math.PI / 2;
    this.add(ground, 0, 0, cz, 0, true);
    const et = tex(th.edge).clone(); et.needsUpdate = true;
    et.repeat.set(30, L / 4);
    const edge = new THREE.Mesh(new THREE.PlaneGeometry(240, L + 200), new THREE.MeshLambertMaterial({ map: et }));
    edge.material.defines = { PSX_PERSP: '' };
    edge.rotation.x = -Math.PI / 2;
    this.add(edge, 0, -0.02, cz, 0, true);
    if (th.ground === 'water') { this.water = gt; }

    // zijkanten
    const S = this['side_' + th.side];
    S.call(this, 10, this.endZ - 25);
    // muur achter de start en grens bij het einde
    this.solid(0, 12, 60, 2, 10);
    if (th.side !== 'river') this.backdrop(12);
    // randen: alleen om niet weg te lopen, laag genoeg dat schutters op daken en richels eroverheen kunnen kijken
    if (th.side !== 'river') {
      this.solid(-this.hw - 0.5, cz, 1, L + 50, 2.2);
      this.solid(this.hw + 0.5, cz, 1, L + 50, 2.2);
    }

    // dekking
    if (th.props.length) this.scatterProps();
    // poort aan het eind
    this.endGate();
    if (this.level.bar) this.buildBar();
    if (this.level.mill) this.mill();
    // decor voor speciale secties
    this.sections.forEach((S, i) => {
      if (S.s.t === 'defend') this.defendProp(S, i);
      if (S.s.t === 'ride' && (S.s.vehicle === 'train')) this.rails(S);
      if (S.s.give) this.giveNpc(S);
    });
    this.wantedPosters();
    this.merge();
  }

  // ===== zijkanten per thema =====
  side_buildings(z0, z1) {
    const r = this.r, st = this.th.style;
    const ghost = st === 'ghost', brick = st === 'brick';
    const signs = brick ? ['BANK', 'HOTEL', 'COURTHOUSE', 'TELEGRAPH', 'SHERIFF', 'THEATRE', 'POST OFFICE', 'GRAND HOTEL', 'TAILOR', 'NEWSPAPER'] :
      ['SALOON', 'GENERAL STORE', 'BARBER', 'HOTEL', 'GUNSMITH', 'SHERIFF', 'BANK', 'UNDERTAKER', 'DOCTOR', 'BLACKSMITH', 'LIVERY', 'PLUS GENERAL STORE', 'POST OFFICE', 'ASSAY OFFICE'];
    const colors = ghost ? ['#8a8a88', '#7a7470', '#6a6866'] : brick ? ['#ffffff', '#e0d0c0', '#ffe8d0'] : ['#ffffff', '#e8c0a0', '#c8d8d0', '#f0e0c0', '#d8a890', '#b8c0d0'];
    for (const side of [-1, 1]) {
      let z = z0;
      while (z > z1) {
        const w = 6 + r() * 5;
        const zc = z - w / 2;
        if (this.level.bar && side === -1 && zc > -9 && zc < 9) { z = -9; continue; }
        const h = brick ? 6 + r() * 5 : 3.6 + r() * 2.8;
        const d = 8;
        const x = side * (this.hw + d / 2);
        const fac = this.facade(w, h, signs[Math.floor(r() * signs.length)], ghost, brick);
        const ct = brick ? 'brick' : ghost ? 'planksGrey' : 'planksH';
        const color = colors[Math.floor(r() * colors.length)];
        this.boxAt(d, h, w, ct, x, 0, zc, 2.5, false, color);
        const fp = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: fac }));
        fp.material.defines = { PSX_PERSP: '' };
        this.add(fp, side * (this.hw + 0.02), h / 2, zc, side < 0 ? Math.PI / 2 : -Math.PI / 2, true);
        // vals front boven het dak
        if (!brick && r() < 0.7) {
          const fh = 1 + r() * 1.2;
          this.boxAt(0.25, fh, w, ct, side * (this.hw + 0.15), h, zc, 2.5, false, color);
        }
        this.solid(x, zc, d, w, h);
        // veranda
        if (!brick) {
          const pd = 1.8;
          this.boxAt(pd, 0.2, w, 'floor', side * (this.hw - pd / 2 + 0.05), 0, zc, 2, false);
          this.boxAt(pd + 0.2, 0.12, w, 'planksDark', side * (this.hw - pd / 2 + 0.05), 2.9, zc, 2, false);
          for (const pz of [zc - w / 2 + 0.3, zc + w / 2 - 0.3]) this.boxAt(0.14, 2.9, 0.14, 'planksDark', side * (this.hw - pd + 0.1), 0, pz, 2, true);
          if (r() < 0.4) this.boxAt(0.12, 0.9, w - 0.8, 'planksDark', side * (this.hw - pd + 0.1), 0.2, zc, 2, false);
        }
        // dak als sluipschuttersplek
        if (r() < 0.75) this.perches.push({ x: side * (this.hw + 1.2), y: h, z: zc + (r() - 0.5) * w * 0.5 });
        if (this.time.lantern || this.level.time === 'dusk') this.lamp(side * (this.hw - 0.2), 2.4, zc);
        z -= w + (r() < 0.25 ? 2.5 : 0);
      }
    }
  }

  facade(w, h, sign, ghost, brick) {
    const k = 16; // pixels per meter
    return canvasTex(Math.min(256, Math.ceil(w * k)), Math.min(256, Math.ceil(h * k)), (x, W, H) => {
      const r = this.r;
      const base = brick ? '#8c4a33' : ghost ? '#8a8682' : ['#9a6a40', '#b08058', '#8a7050', '#a07a60'][Math.floor(r() * 4)];
      x.fillStyle = base; x.fillRect(0, 0, W, H);
      if (brick) { x.fillStyle = 'rgba(230,210,190,0.35)'; for (let y = 0; y < H; y += 4) { x.fillRect(0, y, W, 1); for (let xx = (y / 4) % 2 * 4; xx < W; xx += 8) x.fillRect(xx, y, 1, 4); } }
      else { x.fillStyle = 'rgba(0,0,0,0.25)'; for (let y = 0; y < H; y += 5) x.fillRect(0, y, W, 1); }
      // deur
      const dw = 1.3 * k, dh = 2.4 * k;
      x.fillStyle = '#2a1a10'; x.fillRect(W / 2 - dw / 2, H - dh, dw, dh);
      x.fillStyle = '#5a3a20'; x.fillRect(W / 2 - dw / 2 + 2, H - dh + 2, dw / 2 - 3, dh - 4); x.fillRect(W / 2 + 1, H - dh + 2, dw / 2 - 3, dh - 4);
      // ramen
      const win = (wx, wy) => {
        x.fillStyle = '#e8dcc0'; x.fillRect(wx - 1, wy - 1, 0.9 * k + 2, 1.3 * k + 2);
        x.fillStyle = ghost || r() < 0.2 ? '#101010' : '#2a3440'; x.fillRect(wx, wy, 0.9 * k, 1.3 * k);
        x.fillStyle = '#e8dcc0'; x.fillRect(wx + 0.45 * k - 0.5, wy, 1, 1.3 * k); x.fillRect(wx, wy + 0.65 * k, 0.9 * k, 1);
        if (ghost && r() < 0.5) { x.fillStyle = '#5a4a3a'; x.fillRect(wx - 2, wy + 4, 0.9 * k + 4, 3); x.fillRect(wx - 2, wy + 12, 0.9 * k + 4, 3); }
      };
      win(W / 2 - dw / 2 - 1.5 * k, H - 2.2 * k); win(W / 2 + dw / 2 + 0.6 * k, H - 2.2 * k);
      if (H > 4.4 * k) for (let i = 0; i < Math.floor(W / k / 2); i++) win(0.6 * k + i * 2 * k, H - 4.6 * k);
      // bord
      const sy = H - 3.3 * k;
      x.fillStyle = ghost ? '#4a4440' : '#e8d8b0'; x.fillRect(4, sy - 9, W - 8, 11);
      x.fillStyle = ghost ? '#8a8480' : '#3a1a10';
      x.font = 'bold 9px serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(sign, W / 2, sy - 3, W - 12);
    }, false);
  }

  side_rocks(z0, z1) {
    const r = this.r, rt = this.th.rock;
    for (const side of [-1, 1]) {
      let z = z0;
      while (z > z1) {
        const w = 5 + r() * 7, h = 6 + r() * 10, d = 6 + r() * 6;
        const g = blob(1, 0);
        const m = new THREE.Mesh(g, mat('#ffffff', tex(rt)));
        m.scale.set(d / 2, h / 2, w / 2);
        this.add(m, side * (this.hw + d / 2 - 0.5), h / 2 - 1, z - w / 2, r() * 3);
        this.solid(side * (this.hw + d / 2), z - w / 2, d, w, h);
        // richel voor scherpschutters
        if (r() < 0.45) {
          const ly = 2.5 + r() * 2;
          this.boxAt(2.2, 0.4, 2.6, rt, side * (this.hw + 0.4), ly - 0.4, z - w / 2, 2, true);
          this.perches.push({ x: side * (this.hw + 0.4), y: ly, z: z - w / 2 });
        }
        if (this.th.pines && r() < 0.6) this.pine(side * (this.hw + 6 + r() * 6), z - r() * w, 1 + r() * 0.6);
        z -= w * 0.7;
      }
    }
  }

  side_trees(z0, z1) {
    const r = this.r;
    for (const side of [-1, 1]) {
      for (let z = z0; z > z1; z -= 2 + r() * 2.5) {
        for (let k = 0; k < 3; k++) {
          const x = side * (this.hw + 0.5 + k * 3 + r() * 3);
          this.tree(x, z + r() * 2, 0.9 + r() * 0.6, k === 0);
        }
      }
      for (let z = z0; z > z1; z -= 14 + r() * 10) {
        this.boxAt(2, 0.3, 2, 'planksDark', side * (this.hw + 0.4), 3.2, z, 2, true);
        this.boxAt(0.25, 3.2, 0.25, 'bark', side * (this.hw + 0.4), 0, z, 2, false);
        this.perches.push({ x: side * (this.hw + 0.4), y: 3.5, z });
      }
    }
  }

  side_open(z0, z1) {
    const r = this.r;
    for (const side of [-1, 1]) {
      // hek langs de rand
      for (let z = z0; z > z1; z -= 4) {
        this.boxAt(0.15, 1.1, 0.15, 'planksDark', side * this.hw, 0, z, 2, false);
        this.boxAt(0.08, 0.12, 4, 'planks', side * this.hw, 0.8, z - 2, 2, false);
        this.boxAt(0.08, 0.12, 4, 'planks', side * this.hw, 0.4, z - 2, 2, false);
      }
      for (let z = z0; z > z1; z -= 6 + r() * 10) this.tree(side * (this.hw + 4 + r() * 20), z, 1 + r() * 0.8, false);
      for (let z = z0 - 10; z > z1; z -= 28 + r() * 16) this.tower(side * (this.hw - 1.5), z);
      if (this.level.theme === 'prairie' || this.level.theme === 'heath') for (let z = z0; z > z1; z -= 40 + r() * 30) {
        if (r() < 0.6) this.farmhouse(side * (this.hw + 9 + r() * 6), z);
      }
    }
  }

  side_railyard(z0, z1) {
    const r = this.r;
    for (const side of [-1, 1]) {
      for (let z = z0; z > z1; z -= 16 + r() * 6) {
        if (r() < 0.6) this.traincar(side * (this.hw - 1.8), z, r());
        else this.shed(side * (this.hw + 3), z);
      }
      for (let z = z0 - 20; z > z1; z -= 40) this.waterTower(side * (this.hw + 2), z);
    }
    // sporen over de lengte
    for (const x of [-5, 0, 5]) {
      const g = new THREE.PlaneGeometry(2.4, z0 - z1);
      const t = tex('rail').clone(); t.needsUpdate = true; t.repeat.set(1, (z0 - z1) / 2.4);
      const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: t })); m.rotation.x = -Math.PI / 2;
      this.add(m, x, 0.02, (z0 + z1) / 2, 0, true);
    }
  }

  side_cave(z0, z1) {
    const r = this.r;
    for (const side of [-1, 1]) {
      for (let z = z0; z > z1; z -= 3 + r() * 3) {
        const w = 3 + r() * 4, h = 6;
        const m = new THREE.Mesh(blob(1, 0), mat('#ffffff', tex('cave')));
        m.scale.set(2.5, h / 2, w / 2);
        this.add(m, side * (this.hw + 1.8), h / 2 - 0.5, z, r() * 3);
      }
      this.solid(side * (this.hw + 1.5), (z0 + z1) / 2, 3, z0 - z1, 6);
    }
    // plafond en steunbalken
    const ceil = new THREE.Mesh(tbox(this.hw * 2 + 6, 1, z0 - z1, 'cave', 3), mat('#ffffff', tex('cave')));
    this.add(ceil, 0, 5, (z0 + z1) / 2);
    for (let z = z0 - 4; z > z1; z -= 8) {
      for (const s of [-1, 1]) this.boxAt(0.35, 4.6, 0.35, 'planksDark', s * (this.hw - 0.3), 0, z, 2, true);
      this.boxAt(this.hw * 2, 0.35, 0.4, 'planksDark', 0, 4.4, z, 2, false);
      this.lamp(0, 4.0, z, '#ffb050');
    }
    for (let z = z0 - 20; z > z1; z -= 25) { this.perches.push({ x: -this.hw + 1, y: 0, z }); }
  }

  side_palisade(z0, z1) {
    const r = this.r;
    for (const side of [-1, 1]) {
      for (let z = z0; z > z1; z -= 0.6) {
        const h = 4.2 + r() * 0.6;
        const m = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, h, 16), mat('#8a6a48', tex('bark')));
        this.add(m, side * (this.hw + 0.3), h / 2, z);
      }
      for (let z = z0 - 15; z > z1; z -= 22 + r() * 8) this.tower(side * (this.hw - 1.5), z, 4.5);
      for (let z = z0 - 5; z > z1; z -= 30) this.barracks(side * (this.hw - 3.5), z);
    }
    if (this.level.theme === 'border') {
      for (let z = z0; z > z1; z -= 10) this.tree((this.r() < 0.5 ? -1 : 1) * (this.hw + 6 + this.r() * 20), z, 1.2, false);
    }
  }

  side_docks(z0, z1) {
    const r = this.r;
    // rechts water, links pakhuizen
    for (let z = z0; z > z1; z -= 10 + r() * 4) this.shed(-(this.hw + 4), z, 8, 9);
    for (let z = z0 - 8; z > z1; z -= 30) this.perches.push({ x: -(this.hw + 0.5), y: 5.2, z });
    for (let z = z0; z > z1; z -= 3) {
      this.boxAt(0.3, 1.6, 0.3, 'planksDark', this.hw - 0.2, -0.6, z, 2, false);
      if (r() < 0.07) this.boat(this.hw + 6, z);
    }
    this.waterPlane(this.hw + 60, (z0 + z1) / 2, 120, z0 - z1 + 100);
    for (let z = z0 - 25; z > z1; z -= 35) this.tower(this.hw - 1.5, z);
  }

  side_river(z0, z1) {
    const r = this.r;
    // brede rivier in het midden; oevers met bomen, ruiters rijden op de oever
    this.waterPlane(0, (z0 + z1) / 2, this.hw * 2, z0 - z1 + 60);
    for (const side of [-1, 1]) {
      for (let z = z0; z > z1; z -= 5 + r() * 8) this.tree(side * (this.hw + 8 + r() * 25), z, 1 + r() * 0.6, false);
      for (let z = z0 - 30; z > z1; z -= 45 + r() * 20) {
        if (r() < 0.6) { this.farmhouse(side * (this.hw + 12), z); this.perches.push({ x: side * (this.hw + 3), y: 0, z }); }
        else this.tower(side * (this.hw + 3), z);
      }
    }
  }

  side_reeds(z0, z1) {
    const r = this.r;
    for (const side of [-1, 1]) {
      for (let z = z0; z > z1; z -= 1.2) {
        for (let k = 0; k < 2; k++) {
          const h = 1.4 + r();
          this.boxAt(0.12, h, 0.12, 'hay', side * (this.hw + 0.3 + r() * 3), 0, z + r(), 2, false, '#a0a060');
        }
      }
      for (let z = z0; z > z1; z -= 8 + r() * 6) this.deadtree(side * (this.hw + 5 + r() * 10), z);
      for (let z = z0 - 15; z > z1; z -= 30) { this.shed(side * (this.hw + 4), z, 5, 5); this.perches.push({ x: side * (this.hw + 1), y: 0, z: z + 3 }); }
      this.waterPlane(side * (this.hw + 40), (z0 + z1) / 2, 70, z0 - z1 + 100, 'swamp');
    }
    // plassen (geen botsing)
    for (let z = z0; z > z1; z -= 10) {
      const m = new THREE.Mesh(new THREE.CircleGeometry(1.5 + r() * 2, 20), new THREE.MeshLambertMaterial({ map: tex('water') }));
      m.rotation.x = -Math.PI / 2;
      this.add(m, (r() - 0.5) * this.hw * 1.6, 0.02, z, 0);
    }
  }

  backdrop(z0) {
    // verre heuvels/mesa's buiten de speelruimte, in de mist
    const r = this.r;
    const rt = this.level.theme === 'snow' ? 'rockgrey' : this.level.theme === 'canyon' ? 'rock' : 'rockgrey';
    const col = { forest: '#405030', prairie: '#8a8a60', heath: '#7a6a5a', marsh: '#506048', snow: '#e8eef2', mine: '#2a2018' }[this.level.theme] || '#c08a60';
    if (this.level.theme === 'mine') return;
    for (let z = z0; z > this.endZ - 40; z -= 25 + r() * 20) {
      for (const side of [-1, 1]) {
        const h = 12 + r() * 25, w = 20 + r() * 30;
        const m = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.4, w * 0.6, h, 16), mat(col, tex(rt)));
        this.add(m, side * (this.hw + 45 + r() * 30), h / 2 - 2, z, r() * 3);
      }
    }
  }

  waterPlane(x, z, w, d, t = 'water') {
    const tt = tex(t).clone(); tt.needsUpdate = true; tt.repeat.set(w / 4, d / 4);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshLambertMaterial({ map: tt }));
    m.rotation.x = -Math.PI / 2;
    this.add(m, x, 0.03, z, 0, true);
    this.waterTex = this.waterTex || [];
    this.waterTex.push(tt);
  }

  // ===== props =====
  scatterProps() {
    const r = this.r, th = this.th;
    const list = th.props;
    for (let z = -12; z > this.endZ + 6; z -= 3.2 + r() * 3.8) {
      if (this.inQuiet(z)) continue;
      const ride = this.inRide(z, 4);
      const n = ride ? (r() < 0.3 ? 1 : 0) : 1 + (r() < 0.35 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        let x = (r() * 2 - 1) * (this.hw - 1.8);
        if (ride && Math.abs(x) < 5) x = Math.sign(x || 1) * (5 + r() * (this.hw - 6.5));
        if (Math.abs(x) < 1.3 && r() < 0.6) continue; // middenpad vaak vrij
        this.prop(list[Math.floor(r() * list.length)], x, z + r() * 2);
      }
    }
  }

  prop(kind, x, z) {
    const r = this.r;
    switch (kind) {
      case 'crate': {
        const s = 1 + r() * 0.3;
        this.boxAt(s, s, s, 'crate', x, 0, z, s, true);
        if (r() < 0.4) this.boxAt(0.8, 0.8, 0.8, 'crate', x + (r() - 0.5) * 0.3, s, z, 0.8, true);
        else if (r() < 0.5) this.boxAt(s, s, s, 'crate', x + s, 0, z, s, true);
        break;
      }
      case 'barrel': {
        for (let i = 0; i < 1 + Math.floor(r() * 3); i++) {
          const m = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 1.05, 16), mat('#ffffff', tex('barrel')));
          const bx = x + i * 0.85, bz = z + (r() - 0.5) * 0.4;
          this.add(m, bx, 0.525, bz);
          this.solid(bx, bz, 0.8, 0.8, 1.05);
        }
        break;
      }
      case 'wagon': {
        const ry = r() < 0.5 ? 0 : Math.PI / 2;
        const w = ry ? 3.6 : 1.8, d = ry ? 1.8 : 3.6;
        this.boxAt(w, 0.9, d, 'planks', x, 0.55, z, 2, false);
        this.solid(x, z, w, d, 1.45);
        for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
          const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.12, 16), mat('#5a3a20', tex('planksDark')));
          wh.rotation.z = Math.PI / 2; if (ry) wh.rotation.set(Math.PI / 2, 0, 0);
          this.add(wh, x + (ry ? a * 1.2 : a * 0.95), 0.55, z + (ry ? b * 0.95 : b * 1.2), wh.rotation.y);
        }
        if (r() < 0.5) this.boxAt(w - 0.2, 0.7, d - 0.2, 'hay', x, 1.45, z, 1, false);
        break;
      }
      case 'trough': this.boxAt(2.4, 0.7, 0.8, 'planksDark', x, 0, z, 2, true); break;
      case 'hay': {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 1.4, 16), mat('#ffffff', tex('hay')));
        m.rotation.z = Math.PI / 2;
        this.add(m, x, 0.8, z);
        this.solid(x, z, 1.4, 1.6, 1.6);
        break;
      }
      case 'fence': {
        for (let i = 0; i < 3; i++) this.boxAt(0.12, 1.1, 0.12, 'planksDark', x + i * 1.5, 0, z, 2, false);
        this.boxAt(3.2, 0.12, 0.08, 'planks', x + 1.5, 0.85, z, 2, false);
        this.boxAt(3.2, 0.12, 0.08, 'planks', x + 1.5, 0.45, z, 2, false);
        this.solid(x + 1.5, z, 3.2, 0.25, 1.1);
        break;
      }
      case 'boulder': {
        const s = 0.8 + r() * 0.9;
        const m = new THREE.Mesh(blob(s, 0), mat('#ffffff', tex(this.th.rock || 'rockgrey')));
        m.scale.y = 0.75;
        this.add(m, x, s * 0.5, z, r() * 3);
        this.solid(x, z, s * 1.6, s * 1.6, s * 1.25);
        break;
      }
      case 'cactus': {
        const g = mat('#5a7a3a');
        this.boxAt(0.4, 2.6, 0.4, 'leaves', x, 0, z, 2, true, '#7aa050');
        this.boxAt(0.3, 1, 0.3, 'leaves', x + 0.45, 1, z, 2, false, '#7aa050');
        this.boxAt(0.5, 0.25, 0.25, 'leaves', x + 0.25, 1, z, 2, false, '#7aa050');
        void g;
        break;
      }
      case 'deadtree': this.deadtree(x, z); break;
      case 'tree': this.tree(x, z, 0.9 + r() * 0.5, true); break;
      case 'pine': this.pine(x, z, 0.8 + r() * 0.4, true); break;
      case 'log': {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.45, 4, 16), mat('#ffffff', tex('bark')));
        m.rotation.z = Math.PI / 2;
        this.add(m, x, 0.4, z);
        this.solid(x, z, 4, 0.9, 0.85);
        break;
      }
      case 'stump': this.boxAt(0.8, 0.9, 0.8, 'bark', x, 0, z, 1, true); break;
      case 'tent': {
        const m = new THREE.Mesh(new THREE.ConeGeometry(2, 2.6, 4), mat('#ffffff', tex('canvas')));
        this.add(m, x, 1.3, z, Math.PI / 4);
        this.solid(x, z, 2.6, 2.6, 2.4);
        break;
      }
      case 'sandbag': {
        for (let i = 0; i < 3; i++) this.boxAt(0.9, 0.35, 0.5, 'canvas', x + i * 0.92 - 0.9, 0, z, 1, false, '#b0a080');
        for (let i = 0; i < 3; i++) this.boxAt(0.9, 0.35, 0.5, 'canvas', x + i * 0.92 - 0.9, 0.35, z, 1, false, '#a89878');
        for (let i = 0; i < 2; i++) this.boxAt(0.9, 0.35, 0.5, 'canvas', x + i * 0.92 - 0.45, 0.7, z, 1, false, '#b0a080');
        this.solid(x, z, 2.8, 0.55, 1.05);
        break;
      }
      case 'cannon': {
        this.boxAt(1.2, 0.5, 1.6, 'planksDark', x, 0.3, z, 2, false);
        const m = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 2.2, 16), mat('#3a3a3a', tex('metal')));
        m.rotation.x = Math.PI / 2 - 0.15;
        this.add(m, x, 1.0, z + 0.4);
        for (const s of [-1, 1]) {
          const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.12, 16), mat('#5a3a20'));
          wh.rotation.z = Math.PI / 2;
          this.add(wh, x + s * 0.7, 0.55, z);
        }
        this.solid(x, z, 1.6, 2, 1.2);
        break;
      }
      case 'coffin': this.boxAt(0.8, 0.6, 2.1, 'planksDark', x, 0, z, 1, true); break;
      case 'cart': {
        this.boxAt(1.3, 0.8, 1.8, 'metal', x, 0.25, z, 1, false, '#8a6a4a');
        this.solid(x, z, 1.3, 1.8, 1.05);
        break;
      }
      case 'beam': this.boxAt(0.4, 0.4, 3, 'planksDark', x, 0, z, 2, true); break;
      case 'traincar': this.traincar(x, z, r()); break;
      case 'lamp': this.lamp(x, 3, z); this.boxAt(0.15, 3, 0.15, 'metal', x, 0, z, 2, true); break;
    }
  }

  tree(x, z, s, coll) {
    const r = this.r;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18 * s, 0.28 * s, 3 * s, 16), mat('#ffffff', tex('bark')));
    this.add(trunk, x, 1.5 * s, z);
    for (let i = 0; i < 2; i++) {
      const c = new THREE.Mesh(blob(1.5 * s - i * 0.4, 0), mat(this.level.theme === 'forest' ? '#6a8a50' : '#9aaa60', tex('leaves')));
      this.add(c, x + (r() - 0.5) * 0.6, 3.2 * s + i * 0.9 * s, z + (r() - 0.5) * 0.6, r() * 3);
    }
    if (coll) this.solid(x, z, 0.6 * s, 0.6 * s, 3);
  }
  pine(x, z, s, coll) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15 * s, 0.22 * s, 2 * s, 16), mat('#ffffff', tex('bark')));
    this.add(trunk, x, s, z);
    for (let i = 0; i < 3; i++) {
      const c = new THREE.Mesh(new THREE.ConeGeometry((1.8 - i * 0.45) * s, 2 * s, 6), mat(this.level.theme === 'snow' ? '#c0d0c0' : '#ffffff', tex('pine')));
      this.add(c, x, (2 + i * 1.2) * s, z);
    }
    if (coll) this.solid(x, z, 0.6 * s, 0.6 * s, 3);
  }
  deadtree(x, z) {
    const r = this.r;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.22, 3.4, 16), mat('#ffffff', tex('bark')));
    this.add(m, x, 1.7, z);
    for (let i = 0; i < 3; i++) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.09, 1.4, 16), mat('#ffffff', tex('bark')));
      b.rotation.z = (r() - 0.5) * 2; b.rotation.x = (r() - 0.5);
      this.add(b, x + (r() - 0.5) * 0.6, 2 + i * 0.5, z, b.rotation.y);
      b.rotation.z = (r() - 0.5) * 2;
    }
    this.solid(x, z, 0.4, 0.4, 3);
  }
  tower(x, z, h = 3.6) {
    for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) this.boxAt(0.2, h, 0.2, 'planksDark', x + a * 0.9, 0, z + b * 0.9, 2, false);
    this.boxAt(2.3, 0.25, 2.3, 'floor', x, h, z, 2, false);
    this.boxAt(2.3, 0.7, 0.1, 'planks', x, h + 0.25, z + 1.1, 2, false);
    this.boxAt(2.3, 0.7, 0.1, 'planks', x, h + 0.25, z - 1.1, 2, false);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.9, 1, 4), mat('#ffffff', tex('roof')));
    this.add(roof, x, h + 2.4, z, Math.PI / 4);
    for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) this.boxAt(0.12, 1.9, 0.12, 'planksDark', x + a * 1.05, h, z + b * 1.05, 2, false);
    this.solid(x, z, 2.1, 2.1, h + 0.25);
    this.perches.push({ x, y: h + 0.25, z });
  }
  shed(x, z, w = 7, h = 4) {
    this.boxAt(6, h, w, 'planksGrey', x, 0, z, 2.5, true);
    const roof = new THREE.Mesh(tbox(6.6, 0.3, w + 0.6, 'roof', 2), mat('#ffffff', tex('roof')));
    this.add(roof, x, h + 0.15, z);
    this.perches.push({ x: x - Math.sign(x) * 2.6, y: h + 0.3, z });
  }
  barracks(x, z) {
    this.boxAt(4.5, 3.2, 9, 'planksH', x, 0, z, 2.5, true, '#d8c8b0');
    const roof = new THREE.Mesh(tbox(5, 0.3, 9.6, 'roof', 2), mat('#ffffff', tex('roof')));
    this.add(roof, x, 3.35, z);
    this.perches.push({ x: x - Math.sign(x) * 1.6, y: 3.5, z });
  }
  farmhouse(x, z) {
    this.boxAt(7, 3.4, 6, 'planksH', x, 0, z, 2.5, true, '#c8a080');
    const roof = new THREE.Mesh(new THREE.ConeGeometry(5.4, 2.4, 4), mat('#8a3a2a', tex('roof')));
    roof.scale.z = 0.85;
    this.add(roof, x, 4.6, z, Math.PI / 4);
  }
  traincar(x, z, v) {
    const col = ['#8a2a1a', '#5a4a3a', '#3a4a5a', '#6a5a2a'][Math.floor(v * 4)];
    this.boxAt(2.8, 2.8, 9, 'planksH', x, 0.8, z, 2.5, false, col);
    this.boxAt(2.4, 0.6, 8, 'metal', x, 0.2, z, 2, false);
    this.solid(x, z, 2.8, 9, 3.6);
    this.boxAt(2.9, 0.15, 9.1, 'roof', x, 3.6, z, 2, false);
    this.perches.push({ x, y: 3.75, z });
  }
  waterTower(x, z) {
    for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) this.boxAt(0.25, 6, 0.25, 'planksDark', x + a * 1.4, 0, z + b * 1.4, 2, false);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 3, 16), mat('#ffffff', tex('barrel')));
    this.add(m, x, 7.5, z);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.3, 1.2, 16), mat('#ffffff', tex('roof')));
    this.add(roof, x, 9.6, z);
    this.solid(x, z, 3, 3, 6);
  }
  boat(x, z) {
    this.boxAt(3, 1, 8, 'planksDark', x, -0.3, z, 2, false);
    this.boxAt(0.2, 5, 0.2, 'planksDark', x, 0.7, z, 2, false);
  }
  lamp(x, y, z, color = '#ffd070') {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.32, 0.22), new THREE.MeshBasicMaterial({ color }));
    this.add(m, x, y, z, 0, true);
    this.lamps.push(m);
  }

  rails(S) {
    // spoor in het midden voor de trein
    const g = new THREE.PlaneGeometry(2.4, S.start - S.end + 40);
    const t = tex('rail').clone(); t.needsUpdate = true; t.repeat.set(1, (S.start - S.end + 40) / 2.4);
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: t })); m.rotation.x = -Math.PI / 2;
    this.add(m, 0, 0.03, (S.start + S.end) / 2, 0, true);
  }

  defendProp(S, i) {
    const z = (S.start + S.end) / 2;
    S.center = { x: 0, z };
    const kind = this.level.theme;
    if (this.level.mill) return;
    if (i === 2 && this.level.name === 'Hatert Town Burning') {
      const h = makeHorse('#c89050', '#f0e0c0');
      h.rotation.y = Math.PI / 2;
      this.add(h, 2.5, 0, z, Math.PI / 2, true);
      this.solid(2.5, z, 1.8, 1, 1.6);
      this.npcs.horse = h;
      return;
    }
    // barricade-ring van zandzakken als ankerpunt
    for (const [dx, dz, ry] of [[-4, 0, Math.PI / 2], [4, 0, Math.PI / 2], [0, -4, 0], [0, 4, 0]]) {
      if (ry) for (let k = -1; k <= 1; k++) this.boxAt(0.5, 1.05, 0.9, 'canvas', dx, 0, z + dz + k * 0.92, 1, false, '#b0a080');
      else for (let k = -1; k <= 1; k++) this.boxAt(0.9, 1.05, 0.5, 'canvas', dx + k * 0.92, 0, z + dz, 1, false, '#b0a080');
      this.solid(dx, z + dz, ry ? 0.55 : 2.8, ry ? 2.8 : 0.55, 1.05);
    }
    void kind;
  }

  giveNpc(S) {
    const z = S.end + 8;
    const looks = { lever: { skin: '#e0b090', hair: 'short', hairColor: '#aaa', stache: true, beardColor: '#ccc', hat: 'cowboy', hatColor: '#3a2a1a', shirt: '#cfc4a8', vest: '#2a2a2a', coat: '#4a3a2a' },
      shotgun: { skin: '#d8a888', hair: 'long', hairColor: '#ddd', bigBeard: true, beardColor: '#ddd', hat: 'bowler', hatColor: '#4a3a2a', shirt: '#6a5a4a', pants: '#3a3a5a' },
      dynamite: { skin: '#e8c0a0', hair: 'curly', hairColor: '#c06020', stache: true, beardColor: '#c06020', shirt: '#8a3a2a', pants: '#3a3226', hat: 'cap', hatColor: '#3a3a3a' } };
    const npc = makeHuman(looks[S.s.give]);
    const x = S.s.give === 'dynamite' ? -this.hw + 2 : 3.5;
    this.add(npc, x, 0, z, -Math.PI / 2, true);
    if (S.s.give === 'lever') { npc.userData.sitDown = true; this.waterTower(x + 2.5, z - 2); }
    if (S.s.give === 'dynamite') {
      // cel van de sheriff
      for (let k = -2; k <= 2; k++) this.boxAt(0.06, 2.4, 0.06, 'metal', x + 1.4, 0, z + k * 0.35, 2, false);
    }
    npc.userData.weapon = S.s.give;
    S.npc = npc;
  }

  buildBar() {
    // Fifty Fifty: links aan de straat, met een open binnenkant
    const x0 = -this.hw - 9, x1 = -this.hw, z0 = -7, z1 = 7, h = 3.6;
    const W = x1 - x0;
    const wall = 'planksH';
    this.boxAt(W, h, 0.3, wall, (x0 + x1) / 2, 0, z0, 2.5, true, '#d8b890');
    this.boxAt(W, h, 0.3, wall, (x0 + x1) / 2, 0, z1, 2.5, true, '#d8b890');
    this.boxAt(0.3, h, z1 - z0, wall, x0, 0, 0, 2.5, true, '#d8b890');
    // voorgevel met deur bij z=0
    this.boxAt(0.3, h, 6, wall, x1, 0, -4, 2.5, true, '#d8b890');
    this.boxAt(0.3, h, 6, wall, x1, 0, 4, 2.5, true, '#d8b890');
    this.boxAt(0.3, 1.0, 2, wall, x1, 2.6, 0, 2.5, false, '#d8b890');
    // tweede verdieping + balkon
    this.boxAt(W, 3, z1 - z0 + 0.3, wall, (x0 + x1) / 2, h, 0, 2.5, false, '#c8a880');
    this.boxAt(2.2, 0.25, 12, 'floor', x1 + 1.1, h, 0, 2, false);
    this.boxAt(0.1, 0.9, 12, 'planksDark', x1 + 2.15, h + 0.25, 0, 2, false);
    for (const pz of [-5.8, 0, 5.8]) this.boxAt(0.18, h, 0.18, 'planksDark', x1 + 2.05, 0, pz, 2, true);
    const floor = new THREE.Mesh(tbox(W, 0.05, z1 - z0, 'floor', 2), mat('#ffffff', tex('floor')));
    this.add(floor, (x0 + x1) / 2, 0.03, 0);
    // bord
    const sign = canvasTex(128, 32, (x) => {
      x.fillStyle = '#2a1a10'; x.fillRect(0, 0, 128, 32);
      x.fillStyle = '#e8c860'; x.font = 'bold 20px serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText('FIFTY FIFTY', 64, 13);
      x.font = '8px serif'; x.fillText('SALOON · HATERT TOWN', 64, 27);
    }, false);
    const sm = new THREE.Mesh(new THREE.PlaneGeometry(5, 1.25), new THREE.MeshLambertMaterial({ map: sign }));
    this.add(sm, x1 + 2.22, h + 1.6, 0, Math.PI / 2, true);
    // binnen: bar, tafels, piano
    this.boxAt(1, 1.1, 8, 'planksDark', x0 + 1.5, 0, 0, 2, true);
    this.boxAt(0.4, 2.2, 8, 'planksDark', x0 + 0.4, 1, 0, 2, false);
    for (let i = 0; i < 6; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.3, 0.12), mat(['#3a6a3a', '#8a5a2a', '#6a2a2a'][i % 3]));
      this.add(b, x0 + 0.5, 2.0, -3 + i * 1.2, 0, true);
    }
    this.barTable = { x: x0 + 5.5, z: 3.5 };
    for (const [tx, tz] of [[x0 + 5.5, 3.5], [x0 + 5, -3], [x0 + 7.5, -0.5]]) {
      this.boxAt(1.2, 0.08, 1.2, 'planksDark', tx, 0.75, tz, 2, false);
      this.boxAt(0.15, 0.75, 0.15, 'planksDark', tx, 0, tz, 2, false);
      this.solid(tx, tz, 1.2, 1.2, 0.83);
    }
    this.boxAt(0.5, 0.45, 0.5, 'planksDark', x0 + 5.5 - 1.0, 0, 3.5, 2, false); // kruk van Shane
    this.boxAt(1.6, 1.3, 0.6, 'planksDark', x0 + 7, 0, 6.4, 2, true, '#3a2a1a'); // piano
    // licht binnen
    this.lamp(x0 + 4, 3.2, 0, '#ffd090');
    const bt = makeHuman(CAST.bartender);
    this.add(bt, x0 + 1, 0, 1, Math.PI / 2, true);
    this.npcs.bartender = bt;
    this.barInfo = { x0, x1, z0, z1, balcony: { x: x1 + 1.3, y: h + 0.25, z: -3 } };
  }

  mill() {
    const S = this.sections.find((s) => s.s.t === 'defend');
    const z = S ? (S.start + S.end) / 2 : -60;
    const x = -this.hw + 4;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(2, 3, 9, 16), mat('#ffffff', tex('brick')));
    this.add(body, x, 4.5, z);
    this.solid(x, z, 5, 5, 9);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(2.4, 2, 16), mat('#ffffff', tex('roof')));
    this.add(cap, x, 10, z);
    const wings = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const w = new THREE.Mesh(tbox(0.15, 5, 1, 'planksGrey', 1), mat('#ffffff', tex('planksGrey')));
      w.position.y = 2.6; const g = new THREE.Group(); g.rotation.z = i * Math.PI / 2; g.add(w); wings.add(g);
    }
    wings.position.set(x + 2.3, 8.5, z);
    wings.rotation.y = Math.PI / 2;
    this.dyn.add(wings);
    this.millWings = wings;
    if (S) S.center = { x: 0, z };
  }

  endGate() {
    const z = this.endZ + 3;
    const t = this.level.theme;
    const label = t === 'border' ? 'DEUTSCHES REICH' : t === 'mine' ? 'EXIT' : 'LEAVING ' + this.level.place.toUpperCase();
    for (const s of [-1, 1]) this.boxAt(0.4, 5, 0.4, 'planksDark', s * (this.hw - 0.5), 0, z, 2, false);
    this.boxAt(this.hw * 2, 0.5, 0.4, 'planksDark', 0, 5, z, 2, false);
    const sign = canvasTex(256, 32, (x) => {
      x.fillStyle = t === 'border' ? '#e8e8e8' : '#e8d8b0'; x.fillRect(0, 0, 256, 32);
      x.fillStyle = '#2a1a10'; x.font = 'bold 16px serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(label, 128, 16, 240);
      if (t === 'border') { x.fillStyle = '#111'; x.fillRect(0, 0, 256, 3); x.fillStyle = '#c00'; x.fillRect(0, 29, 256, 3); }
    }, false);
    const sm = new THREE.Mesh(new THREE.PlaneGeometry(8, 1), new THREE.MeshLambertMaterial({ map: sign, side: THREE.DoubleSide }));
    this.add(sm, 0, 4.4, z + 0.25, 0, true);
    if (t === 'border') {
      // slagboom
      this.boxAt(0.3, 1.2, 0.3, 'planksDark', -3, 0, z + 2, 2, false);
      for (let i = 0; i < 6; i++) this.boxAt(1, 0.2, 0.2, 'planksDark', -2.5 + i, 1.0, z + 2, 2, false, i % 2 ? '#c02020' : '#ffffff');
    }
  }

  wantedPosters() {
    // WANTED: SHANE – op muren in de stadjes
    if (!['town', 'ghost', 'city', 'rail', 'fort', 'border', 'docks'].includes(this.level.theme)) return;
    const img = new Image();
    const c = document.createElement('canvas'); c.width = 48; c.height = 64;
    const x = c.getContext('2d');
    const draw = (face) => {
      x.fillStyle = '#e8d8b0'; x.fillRect(0, 0, 48, 64);
      x.fillStyle = '#2a1a10'; x.font = 'bold 10px serif'; x.textAlign = 'center';
      x.fillText('WANTED', 24, 11);
      if (face) x.drawImage(face, 10, 14, 28, 28); else { x.fillStyle = '#8a7a60'; x.fillRect(10, 14, 28, 28); }
      x.font = 'bold 7px serif'; x.fillText('SHANE', 24, 50);
      x.font = '6px serif'; x.fillText('2 FRIKANDELBROODJES', 24, 57, 46);
      x.fillText('$$$ REWARD $$$', 24, 63);
    };
    draw(null);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    img.onload = () => { draw(img); t.needsUpdate = true; };
    img.src = 'img/shane-face.png';
    const m = new THREE.MeshLambertMaterial({ map: t });
    const r = this.r;
    for (let z = -6; z > this.endZ; z -= 9 + r() * 10) {
      const s = r() < 0.5 ? -1 : 1;
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.8), m);
      const px = s * (this.level.theme === 'rail' || this.level.theme === 'fort' || this.level.theme === 'border' ? this.hw - 0.05 : this.hw - 0.02);
      this.add(p, px + (this.level.theme === 'fort' || this.level.theme === 'border' ? -s * 0.0 : 0), 1.6, z, s < 0 ? Math.PI / 2 : -Math.PI / 2, true);
    }
  }

  // alles wat stil staat samenvoegen per materiaal: veel minder draw calls
  merge() {
    this.group.updateMatrixWorld(true);
    const buckets = new Map();
    const keep = [];
    this.group.children.slice().forEach((m) => {
      if (!m.isMesh || Array.isArray(m.material) || m.userData.noMerge) { keep.push(m); return; }
      const k = m.material.uuid;
      if (!buckets.has(k)) buckets.set(k, { mat: m.material, list: [] });
      buckets.get(k).list.push(m);
    });
    for (const { mat: mm, list } of buckets.values()) {
      if (list.length < 2) continue;
      const pos = [], nor = [], uv = [], idx = [];
      let off = 0;
      const nm = new THREE.Matrix3();
      const v = new THREE.Vector3();
      for (const m of list) {
        const g = m.geometry;
        const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
        nm.getNormalMatrix(m.matrixWorld);
        for (let i = 0; i < P.count; i++) {
          v.fromBufferAttribute(P, i).applyMatrix4(m.matrixWorld); pos.push(v.x, v.y, v.z);
          v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); nor.push(v.x, v.y, v.z);
          uv.push(U ? U.getX(i) : 0, U ? U.getY(i) : 0);
        }
        if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + off);
        else for (let i = 0; i < P.count; i++) idx.push(i + off);
        off += P.count;
        this.group.remove(m);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeBoundingSphere();
      this.group.add(new THREE.Mesh(g, mm));
    }
    void keep;
    this.group.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    this.dyn.traverse((m) => { if (m.isMesh && !m.material.isMeshBasicMaterial) { m.receiveShadow = true; if (m.geometry.type !== 'PlaneGeometry') m.castShadow = true; } });
  }

  dispose() {
    this.scene.remove(this.group, this.dyn, this.hemi, this.sun, this.sky);
    const seen = new Set();
    const free = (o) => o.traverse((m) => {
      if (m.geometry && !seen.has(m.geometry)) { seen.add(m.geometry); if (!m.geometry.parameters || m.geometry.type !== 'BoxGeometry') m.geometry.dispose(); }
    });
    free(this.group); free(this.dyn);
  }

  // ===== botsing en stralen =====
  pushOut(p, rad, yFeet = 0, height = 1.7) {
    for (const c of this.colliders) {
      if (yFeet >= c.y1 - 0.05 || yFeet + height <= c.y0) continue;
      const nx = Math.max(c.x0, Math.min(p.x, c.x1)), nz = Math.max(c.z0, Math.min(p.z, c.z1));
      const dx = p.x - nx, dz = p.z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= rad * rad) continue;
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        p.x = nx + dx / d * rad; p.z = nz + dz / d * rad;
      } else {
        // midden in een doos: kortste weg eruit
        const o = [[p.x - c.x0 + rad, -1, 0], [c.x1 - p.x + rad, 1, 0], [p.z - c.z0 + rad, 0, -1], [c.z1 - p.z + rad, 0, 1]].sort((a, b) => a[0] - b[0])[0];
        p.x += o[1] * o[0]; p.z += o[2] * o[0];
      }
    }
  }
  // straal tegen alle dozen; geeft afstand of Infinity
  ray(o, d, maxT = 200) {
    let best = maxT, hit = null;
    for (const c of this.colliders) {
      let t0 = 0, t1 = best;
      let ok = true;
      for (const [oa, da, a0, a1] of [[o.x, d.x, c.x0, c.x1], [o.y, d.y, c.y0, c.y1], [o.z, d.z, c.z0, c.z1]]) {
        if (Math.abs(da) < 1e-9) { if (oa < a0 || oa > a1) { ok = false; break; } continue; }
        let ta = (a0 - oa) / da, tb = (a1 - oa) / da;
        if (ta > tb) { const s = ta; ta = tb; tb = s; }
        if (ta > t0) t0 = ta;
        if (tb < t1) t1 = tb;
        if (t0 > t1) { ok = false; break; }
      }
      if (ok && t0 < best && t0 > 0.0001) { best = t0; hit = c; }
    }
    // grond
    if (d.y < -1e-6) { const tg = -o.y / d.y; if (tg > 0 && tg < best) { best = tg; hit = 'ground'; } }
    return { t: best, hit };
  }
  los(a, b) {
    const d = new THREE.Vector3().subVectors(b, a);
    const L = d.length(); d.divideScalar(L);
    return this.ray(a, d, L).t >= L - 0.05;
  }
  // vrije plek dichtbij (voor spawns)
  free(x, z, rad = 0.5) {
    const p = { x, z };
    for (let i = 0; i < 3; i++) this.pushOut(p, rad);
    p.x = Math.max(-this.hw + 0.8, Math.min(this.hw - 0.8, p.x));
    return p;
  }
}
