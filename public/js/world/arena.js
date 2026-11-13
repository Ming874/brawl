// 地圖二：海上擂台（把對手丟進海裡就贏了，不會受傷，只會變成落湯雞）
import * as THREE from 'three';
import { fbm2, smoothstep, mulberry32 } from '../util.js';
import { makeTerrain, Water, makeForest, makeDock } from './common.js';
import { crateTexture } from '../textures.js';
import { buildHat } from '../accessories.js';

const ISLANDS = [
  { x: 70, z: -60, r: 26, h: 9 }, { x: -95, z: 30, r: 34, h: 14 }, { x: 20, z: 110, r: 30, h: 7 }, { x: -40, z: -130, r: 40, h: 18 },
];
function arenaHeight(x, z) {
  let h = -7 + fbm2(x * 0.02, z * 0.02, 3) * 2;
  for (const is of ISLANDS) {
    const d = Math.hypot(x - is.x, z - is.z);
    h = Math.max(h, -7 + (is.h + 7) * smoothstep(is.r, is.r * 0.25, d) + fbm2(x * 0.05, z * 0.05, 2) * 2 * smoothstep(is.r, 0, d));
  }
  return h;
}

export const PLATFORM_Y = 2.2;
export const HALF = 8;

export class ArenaWorld {
  constructor(quality = 'high') {
    this.name = 'arena'; this.preset = 'arena'; this.waterLevel = 0;
    this.group = new THREE.Group();
    this.boxes = []; this.circles = [];
    this.boundsR = 45;
    const rnd = mulberry32(77);

    const sand = new THREE.Color('#e3d3a2'), deep = new THREE.Color('#4f6f6a'), grass = new THREE.Color('#5d9a45'), rockC = new THREE.Color('#8d857a');
    this.group.add(makeTerrain(arenaHeight, (x, y, z, c) => {
      c.copy(deep).lerp(sand, smoothstep(-6, -1, y));
      c.lerp(grass, smoothstep(0.8, 2.2, y));
      c.lerp(rockC, smoothstep(9, 15, y) * 0.7);
    }, 420, quality === 'low' ? 110 : 170));

    this.water = new Water(3000, { color: 0x1f7f9a, opacity: 0.9 });
    this.group.add(this.water.mesh);

    // 主擂台
    const main = makeDock(-HALF, -HALF, HALF, HALF, PLATFORM_Y, { postDepth: 9, tint: '#a5703f' });
    this.group.add(main.group); this.boxes.push(main.box);
    // 邊緣的輪胎緩衝（裝飾）
    const tireM = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.85 });
    const tireG = new THREE.TorusGeometry(0.32, 0.13, 10, 20);
    for (let i = -6; i <= 6; i += 4) {
      for (const [x, z, ry] of [[i, HALF + 0.08, 0], [i, -HALF - 0.08, 0], [HALF + 0.08, i, Math.PI / 2], [-HALF - 0.08, i, Math.PI / 2]]) {
        const t = new THREE.Mesh(tireG, tireM); t.position.set(x, PLATFORM_Y - 0.45, z); t.rotation.y = ry; t.castShadow = true;
        this.group.add(t);
      }
    }
    // 箱子、木桶當掩護
    const crateM = new THREE.MeshStandardMaterial({ map: crateTexture(), roughness: 0.85 });
    for (const [x, z, s] of [[-4.2, 3.2, 1.2], [4.4, -3.4, 1.2], [3.8, 4.6, 0.9], [-3.6, -4.8, 0.9]]) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), crateM);
      c.position.set(x, PLATFORM_Y + s / 2, z); c.castShadow = c.receiveShadow = true;
      this.group.add(c);
      this.boxes.push({ min: [x - s / 2, PLATFORM_Y, z - s / 2], max: [x + s / 2, PLATFORM_Y + s, z + s / 2] });
    }
    const barrelM = new THREE.MeshStandardMaterial({ color: 0xc8452f, roughness: 0.55, metalness: 0.05 });
    for (const [x, z] of [[0, -6.2], [-6.2, 0.5], [6.3, 1]]) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.0, 20), barrelM);
      b.position.set(x, PLATFORM_Y + 0.5, z); b.castShadow = b.receiveShadow = true;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.025, 6, 24), new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 1, roughness: 0.3 }));
      ring.rotation.x = Math.PI / 2; ring.position.copy(b.position);
      this.group.add(b, ring);
      this.circles.push({ x, z, r: 0.45, top: PLATFORM_Y + 1.0 });
    }
    // 擂台旗子
    const poleM = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.4, metalness: 0.5 });
    const flagCols = [0xff5a5a, 0xffc93c, 0x4aa8ff, 0x5ad17a];
    [[-HALF + 0.3, -HALF + 0.3], [HALF - 0.3, -HALF + 0.3], [-HALF + 0.3, HALF - 0.3], [HALF - 0.3, HALF - 0.3]].forEach(([x, z], i) => {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3, 8), poleM); p.position.set(x, PLATFORM_Y + 1.5, z); p.castShadow = true;
      const f = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.55, 8, 1), new THREE.MeshStandardMaterial({ color: flagCols[i], side: THREE.DoubleSide, roughness: 0.8 }));
      f.position.set(x + 0.45, PLATFORM_Y + 2.7, z); f.userData.flag = true;
      this.group.add(p, f);
      this.circles.push({ x, z, r: 0.1 });
    });

    // 海上的大黃鴨
    const duck = buildHat('duck', 2); duck.scale.setScalar(18); duck.position.set(26, -0.6, -22); duck.rotation.y = -0.8;
    this.bigDuck = duck; this.group.add(duck);
    // 浮球
    this.buoys = [];
    const bm = new THREE.MeshStandardMaterial({ color: 0xff6a3d, roughness: 0.4 });
    const bw = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const g = new THREE.Group();
      const b1 = new THREE.Mesh(new THREE.SphereGeometry(0.35, 14, 10), i % 2 ? bm : bw);
      g.add(b1); g.position.set(Math.cos(a) * 17, 0, Math.sin(a) * 17);
      this.group.add(g); this.buoys.push(g);
    }
    // 燈塔
    this.addLighthouse(62, arenaHeight(62, -54), -54);
    // 島上的樹
    const spots = [];
    for (const is of ISLANDS) for (let i = 0; i < 9; i++) {
      const a = rnd() * 6.28, d = rnd() * is.r * 0.55;
      const x = is.x + Math.cos(a) * d, z = is.z + Math.sin(a) * d, y = arenaHeight(x, z);
      if (y > 1.5 && Math.hypot(x - 62, z + 54) > 6) spots.push({ x, z, y, h: 5 + rnd() * 4, kind: rnd() < 0.6 ? 'pine' : 'round' });
    }
    this.group.add(makeForest(spots, 9));
  }

  addLighthouse(x, y, z) {
    const g = new THREE.Group(); g.position.set(x, y, z);
    const segs = 6, H = 14;
    for (let i = 0; i < segs; i++) {
      const r0 = 2.2 - i * 0.22, r1 = 2.2 - (i + 1) * 0.22;
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, H / segs, 24), new THREE.MeshStandardMaterial({ color: i % 2 ? 0xd94040 : 0xf5f2ea, roughness: 0.6 }));
      m.position.y = (i + 0.5) * (H / segs); m.castShadow = true;
      g.add(m);
    }
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1.4, 16), new THREE.MeshStandardMaterial({ color: 0xfff2b0, emissive: 0xffd36b, emissiveIntensity: 1.3 }));
    lamp.position.y = H + 0.7;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(1.4, 1.2, 16), new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.5 }));
    cap.position.y = H + 2;
    g.add(lamp, cap);
    this.group.add(g);
  }

  groundHeight(x, z) { return arenaHeight(x, z); }
  spawnPoint(i, n = 8) {
    const a = (i / Math.max(2, n)) * Math.PI * 2 + Math.PI / 4;
    const r = 5.2;
    return new THREE.Vector3(Math.cos(a) * r, PLATFORM_Y + 0.05, Math.sin(a) * r);
  }
  spawnYaw(i, n = 8) {
    const p = this.spawnPoint(i, n);
    return Math.atan2(-p.x, -p.z);
  }
  fishDepth() { return -1; }
  update(dt, t) {
    this.water.update(t);
    this.bigDuck.position.y = -0.6 + Math.sin(t * 0.8) * 0.25;
    this.bigDuck.rotation.z = Math.sin(t * 0.6) * 0.04;
    this.buoys.forEach((b, i) => { b.position.y = Math.sin(t * 1.5 + i) * 0.12; });
    this.group.children.forEach(o => { if (o.userData.flag) { const p = o.geometry.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setZ(i, Math.sin(t * 6 + x * 5) * 0.08 * (x + 0.45)); } p.needsUpdate = true; } });
  }
  dispose() { this.group.traverse(o => { if (o.isMesh) o.geometry.dispose(); }); }
}
