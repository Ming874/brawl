// 地圖一：湖畔釣魚場
import * as THREE from 'three';
import { fbm2, noise2, smoothstep, mulberry32 } from '../util.js';
import { makeTerrain, Water, makeForest, makeRocks, makeGrass, makeDock } from './common.js';
import { woodTexture } from '../textures.js';

const LAKE_R = 24;
function shoreR(a) { return LAKE_R + 3 * Math.sin(3 * a + 1) + 2 * Math.sin(5 * a + 2) + 1.2 * Math.sin(7 * a + 0.3); }
function shoreE(x, z) { return Math.hypot(x, z) - shoreR(Math.atan2(z, x)); }
export function lakeHeight(x, z) {
  const d = Math.hypot(x, z);
  const e = d - shoreR(Math.atan2(z, x));
  let h;
  if (e < 0) h = 0.3 - 4.8 * (1 - Math.exp(e / 5));
  else h = 0.3 + e * 0.05 + (fbm2(x * 0.02 + 5, z * 0.02 + 3, 3) * 0.5 + 0.25) * 5 * smoothstep(4, 32, e) + smoothstep(52, 120, d) * (16 + 26 * (fbm2(x * 0.012, z * 0.012, 3) + 0.5));
  h += noise2(x * 0.35, z * 0.35) * 0.07 * smoothstep(-2, 2, e);
  return h;
}

export class LakeWorld {
  constructor(quality = 'high') {
    this.name = 'lake'; this.preset = 'lake'; this.waterLevel = 0;
    this.group = new THREE.Group();
    this.boxes = []; this.circles = [];
    this.boundsR = 72;
    const rnd = mulberry32(42);

    // 地形
    const grassA = new THREE.Color('#5f9440'), grassB = new THREE.Color('#87ad4c'), sand = new THREE.Color('#d8c48f'), wetSand = new THREE.Color('#8f7b55'), rock = new THREE.Color('#857d72'), mud = new THREE.Color('#4d5a3c');
    const terrain = makeTerrain(lakeHeight, (x, y, z, c) => {
      const e = shoreE(x, z);
      const n = noise2(x * 0.08, z * 0.08);
      c.copy(grassA).lerp(grassB, smoothstep(-0.4, 0.6, n));
      c.lerp(sand, smoothstep(2.8, 0.6, e));
      c.lerp(wetSand, smoothstep(0.2, -1.2, e));
      c.lerp(mud, smoothstep(-2, -5, e) * 0.7);
      c.lerp(rock, smoothstep(14, 24, y) * 0.8);
      c.lerp(new THREE.Color('#f4f6f8'), smoothstep(30, 38, y));
    }, 360, quality === 'low' ? 150 : 230);
    this.group.add(terrain);

    this.water = new Water(700, { color: 0x2d7f86, opacity: 0.84 });
    this.group.add(this.water.mesh);

    // 碼頭
    const docks = [
      [-1.3, 7, 1.3, 24, 0.62], [-3.6, 4.2, 3.6, 9.2, 0.62], [11.5, -11.4, 21.5, -9.4, 0.58],
    ];
    for (const [x0, z0, x1, z1, y] of docks) {
      const d = makeDock(x0, z0, x1, z1, y, { postDepth: 5 });
      this.group.add(d.group); this.boxes.push(d.box);
    }
    this.dockBoxes = this.boxes.slice();
    // 碼頭燈籠
    const lampMat = new THREE.MeshStandardMaterial({ color: 0x3b2a1e, roughness: 0.7 });
    const glow = new THREE.MeshStandardMaterial({ color: 0xffe2a0, emissive: 0xffb84d, emissiveIntensity: 1.6 });
    for (const [x, z] of [[-1.2, 10], [1.2, 15], [-1.2, 20], [3.4, 4.5], [-3.4, 4.5]]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.4, 8), lampMat); post.position.set(x, 0.62 + 0.7, z); post.castShadow = true;
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 10), glow); lamp.position.set(x, 0.62 + 1.45, z);
      this.group.add(post, lamp);
      this.circles.push({ x, z, r: 0.12 });
    }

    // 小木屋（釣具店）
    this.addCabin(-11, 31);
    // 長椅
    for (const [x, z, r] of [[5, 27, 0.3], [-4.5, 26, -0.2]]) this.addBench(x, lakeHeight(x, z), z, r);

    // 樹
    const treeSpots = [];
    for (let i = 0; i < 260 && treeSpots.length < (quality === 'low' ? 45 : 85); i++) {
      const a = rnd() * Math.PI * 2, d = shoreR(a) + 7 + rnd() * 38;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (Math.abs(x) < 7 && z > 15 && z < 48) continue;
      if (Math.hypot(x + 11, z - 31) < 7) continue;
      if (treeSpots.some(t => Math.hypot(t.x - x, t.z - z) < 4)) continue;
      treeSpots.push({ x, z, y: lakeHeight(x, z) });
    }
    this.group.add(makeForest(treeSpots, 3));
    for (const t of treeSpots) this.circles.push({ x: t.x, z: t.z, r: 0.45 });

    // 石頭
    const rockSpots = [];
    for (let i = 0; i < 40; i++) {
      const a = rnd() * Math.PI * 2, d = shoreR(a) + (rnd() * 3 - 0.8);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (Math.abs(x) < 4 && z > 15) continue;
      if (x > 10 && x < 23 && z > -13 && z < -8) continue;
      const r = 0.3 + rnd() * 0.9;
      rockSpots.push({ x, z, y: lakeHeight(x, z), r });
      if (r > 0.7) this.circles.push({ x, z, r: r * 0.8 });
    }
    this.group.add(makeRocks(rockSpots, 5));

    // 草
    const grassN = quality === 'high' ? 14000 : quality === 'medium' ? 6000 : 0;
    if (grassN) {
      const pts = [];
      for (let i = 0; i < grassN * 3 && pts.length < grassN; i++) {
        const a = rnd() * Math.PI * 2, d = shoreR(a) + 1.6 + Math.pow(rnd(), 1.4) * 32;
        const x = Math.cos(a) * d + (rnd() - 0.5) * 2, z = Math.sin(a) * d + (rnd() - 0.5) * 2;
        if (shoreE(x, z) < 1.4) continue;
        if (Math.abs(x) < 1.6 && z > 15 && z < 25) continue;
        if (Math.abs(x + 11) < 4 && Math.abs(z - 31) < 3.5) continue;
        if (noise2(x * 0.15, z * 0.15) < -0.25) continue;
        pts.push({ x, z, y: lakeHeight(x, z) - 0.02, rot: rnd() * 6.28, scale: 0.6 + rnd() * 0.9, hue: rnd(), light: rnd() });
      }
      this.grass = makeGrass(pts, { height: 0.42 });
      this.group.add(this.grass);
    }
    // 花
    this.addFlowers(rnd, quality === 'low' ? 80 : 260);
    // 蘆葦 + 荷葉
    this.addReeds(rnd);

    // 雲朵鴨鴨飄在湖中（可愛）
    this.floaties = [];
  }

  addCabin(x, z) {
    const y = lakeHeight(x, z) - 0.2;
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = 0.35;
    const wall = new THREE.MeshStandardMaterial({ map: woodTexture(8, '#c99a63'), roughness: 0.85 });
    const roofM = new THREE.MeshStandardMaterial({ color: 0xb5503c, roughness: 0.75 });
    const W = 5, D = 4, H = 2.6;
    const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), wall); body.position.y = H / 2; body.castShadow = body.receiveShadow = true;
    const roofShape = new THREE.Shape(); roofShape.moveTo(-W / 2 - 0.4, 0); roofShape.lineTo(0, 1.7); roofShape.lineTo(W / 2 + 0.4, 0); roofShape.lineTo(-W / 2 - 0.4, 0);
    const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(roofShape, { depth: D + 0.8, bevelEnabled: false }), roofM);
    roof.position.set(0, H, -D / 2 - 0.4); roof.castShadow = true;
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.7, 0.08), new THREE.MeshStandardMaterial({ color: 0x6b4226, roughness: 0.8 }));
    door.position.set(-1, 0.85, D / 2 + 0.03);
    const winM = new THREE.MeshPhysicalMaterial({ color: 0xbfe3ff, roughness: 0.05, metalness: 0, emissive: 0x332200, clearcoat: 1 });
    const win = new THREE.Mesh(new THREE.BoxGeometry(1, 0.8, 0.06), winM); win.position.set(1.1, 1.5, D / 2 + 0.03);
    const chim = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.4, 0.5), new THREE.MeshStandardMaterial({ color: 0x8a8580, roughness: 0.9 })); chim.position.set(1.4, H + 1.2, -0.5); chim.castShadow = true;
    // 招牌
    const c = document.createElement('canvas'); c.width = 256; c.height = 96;
    const gg = c.getContext('2d'); gg.fillStyle = '#f6e3b4'; gg.fillRect(0, 0, 256, 96); gg.strokeStyle = '#6b4226'; gg.lineWidth = 8; gg.strokeRect(4, 4, 248, 88);
    gg.fillStyle = '#6b4226'; gg.font = 'bold 44px "Microsoft JhengHei", sans-serif'; gg.textAlign = 'center'; gg.fillText('🎣 釣具店', 128, 64);
    const st = new THREE.CanvasTexture(c); st.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.68), new THREE.MeshStandardMaterial({ map: st, roughness: 0.8 }));
    sign.position.set(0.2, H + 0.25, D / 2 + 0.42);
    g.add(body, roof, door, win, chim, sign);
    this.group.add(g);
    // 碰撞：旋轉過的屋子用圓形近似
    for (let i = -1; i <= 1; i++) {
      const lx = i * 1.7;
      this.circles.push({ x: x + Math.cos(0.35) * lx, z: z - Math.sin(0.35) * lx, r: 2.1 });
    }
  }

  addBench(x, y, z, rot) {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rot;
    const m = new THREE.MeshStandardMaterial({ map: woodTexture(12, '#a8774a'), roughness: 0.85 });
    const leg = new THREE.MeshStandardMaterial({ color: 0x3a3330, roughness: 0.6, metalness: 0.5 });
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 0.5), m); seat.position.y = 0.45;
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.4, 0.06), m); back.position.set(0, 0.75, -0.24); back.rotation.x = -0.15;
    g.add(seat, back);
    for (const sx of [-0.8, 0.8]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.45, 0.5), leg); l.position.set(sx, 0.22, 0); g.add(l); }
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.group.add(g);
    this.circles.push({ x, z, r: 0.6 });
  }

  addFlowers(rnd, n) {
    const geo = new THREE.IcosahedronGeometry(0.06, 0);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.7 });
    const inst = new THREE.InstancedMesh(geo, mat, n);
    const cols = ['#ffffff', '#ffd23f', '#ff8fb1', '#b38cff', '#ff6b6b'].map(c => new THREE.Color(c));
    const m4 = new THREE.Matrix4();
    let k = 0;
    for (let i = 0; i < n * 4 && k < n; i++) {
      const a = rnd() * Math.PI * 2, d = shoreR(a) + 2 + rnd() * 26;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (Math.abs(x) < 2 && z > 15 && z < 25) continue;
      if (noise2(x * 0.2 + 9, z * 0.2) < 0.1) continue;
      m4.makeTranslation(x, lakeHeight(x, z) + 0.22 + rnd() * 0.12, z);
      inst.setMatrixAt(k, m4); inst.setColorAt(k, cols[Math.floor(rnd() * cols.length)]); k++;
    }
    inst.count = k;
    this.group.add(inst);
  }

  addReeds(rnd) {
    const reedGeo = new THREE.CylinderGeometry(0.012, 0.02, 1, 4); reedGeo.translate(0, 0.5, 0);
    const reedMat = new THREE.MeshStandardMaterial({ color: 0x7c8f3a, roughness: 0.8 });
    const headGeo = new THREE.CapsuleGeometry(0.035, 0.16, 3, 6);
    const headMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 0.9 });
    const N = 420;
    const reeds = new THREE.InstancedMesh(reedGeo, reedMat, N), heads = new THREE.InstancedMesh(headGeo, headMat, N);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
    let k = 0;
    for (let c = 0; c < 40; c++) {
      const a = rnd() * Math.PI * 2;
      const cx = Math.cos(a) * (shoreR(a) - 1), cz = Math.sin(a) * (shoreR(a) - 1);
      if (Math.abs(cx) < 5 && cz > 10) continue;
      if (cx > 9 && cz < -6 && cz > -14) continue;
      for (let j = 0; j < 11 && k < N; j++) {
        const x = cx + (rnd() - 0.5) * 2.2, z = cz + (rnd() - 0.5) * 2.2;
        const y = lakeHeight(x, z);
        if (y > 0.25 || y < -1.2) continue;
        const h = 1.2 + rnd() * 1.1;
        e.set((rnd() - 0.5) * 0.25, 0, (rnd() - 0.5) * 0.25); q.setFromEuler(e);
        p.set(x, y, z); s.set(1, h, 1); m4.compose(p, q, s); reeds.setMatrixAt(k, m4);
        const top = new THREE.Vector3(0, h, 0).applyQuaternion(q).add(p);
        s.set(1, 1, 1); m4.compose(top, q, s); heads.setMatrixAt(k, m4);
        k++;
      }
    }
    reeds.count = heads.count = k;
    reeds.castShadow = true;
    this.group.add(reeds, heads);
    // 荷葉
    const padGeo = new THREE.CircleGeometry(0.45, 18, 0.3, Math.PI * 2 - 0.3); padGeo.rotateX(-Math.PI / 2);
    const padMat = new THREE.MeshStandardMaterial({ color: 0x4f8a34, roughness: 0.55, side: THREE.DoubleSide });
    const pads = new THREE.InstancedMesh(padGeo, padMat, 70);
    let n = 0;
    for (let i = 0; i < 300 && n < 70; i++) {
      const a = rnd() * Math.PI * 2, d = shoreR(a) - 2 - rnd() * 5;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (Math.abs(x) < 5 && z > 3) continue;
      if (x > 9 && z < -6 && z > -14) continue;
      e.set(0, rnd() * 6, 0); q.setFromEuler(e); p.set(x, 0.02, z); const sc = 0.6 + rnd() * 0.8; s.set(sc, 1, sc);
      m4.compose(p, q, s); pads.setMatrixAt(n++, m4);
    }
    pads.count = n; pads.receiveShadow = true;
    this.group.add(pads);
  }

  groundHeight(x, z) { return lakeHeight(x, z); }
  spawnPoint(i) {
    const k = i % 8;
    return new THREE.Vector3((k % 2 ? 0.7 : -0.7), 0.7, 19 - Math.floor(k / 2) * 1.6);
  }
  spawnYaw() { return Math.PI; }
  // 回傳 0~1 的「深度」，<0 表示不能釣
  fishDepth(x, z) {
    const h = lakeHeight(x, z);
    if (h > -0.5) return -1;
    for (const b of this.boxes) if (x > b.min[0] - 0.2 && x < b.max[0] + 0.2 && z > b.min[2] - 0.2 && z < b.max[2] + 0.2) return -1;
    return Math.min(1, (-h - 0.5) / 3.8);
  }
  update(dt, t) {
    this.water.update(t);
    if (this.grass) this.grass.userData.uni.uTime.value = t;
  }
  dispose() {
    this.group.traverse(o => { if (o.isMesh) { o.geometry.dispose(); } });
  }
}
