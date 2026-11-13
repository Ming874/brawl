// 魚的資料與 3D 模型
import * as THREE from 'three';
import { paint } from './fur.js';
import { smoothstep } from './util.js';
import { canLabelTexture } from './textures.js';
import { buildHat } from './accessories.js';

// rarity: 0 = 垃圾, 1~5 星
export const FISH = [
  { id: 'crucian', name: '小鯽魚', emoji: '🐟', rarity: 1, min: 10, max: 24, top: '#6b7d5a', belly: '#e6e2c8', shape: 'deep' },
  { id: 'tilapia', name: '吳郭魚', emoji: '🐟', rarity: 1, min: 15, max: 38, top: '#4f5a56', belly: '#c9cbc0', shape: 'deep', bars: true },
  { id: 'minnow', name: '溪哥', emoji: '🐟', rarity: 1, min: 7, max: 15, top: '#7c8a93', belly: '#f2f2ee', shape: 'slim', stripe: '#e88a5a' },
  { id: 'goldfish', name: '金魚', emoji: '🐠', rarity: 2, min: 6, max: 18, top: '#ff7a1c', belly: '#ffc070', shape: 'round', fancyTail: true },
  { id: 'bass', name: '鱸魚', emoji: '🐟', rarity: 2, min: 25, max: 58, top: '#4a6b3a', belly: '#e8e6cf', shape: 'normal', blotch: true },
  { id: 'carp', name: '鯉魚', emoji: '🐟', rarity: 2, min: 30, max: 75, top: '#7a6a3a', belly: '#e6d29a', shape: 'normal', scales: true },
  { id: 'trout', name: '彩虹鱒', emoji: '🐟', rarity: 2, min: 25, max: 62, top: '#5b7562', belly: '#f2efe6', shape: 'slim', stripe: '#ef7a8f', spots: true },
  { id: 'catfish', name: '鯰魚', emoji: '🐟', rarity: 3, min: 40, max: 110, top: '#3f3a36', belly: '#a9a08e', shape: 'cat', whiskers: true },
  { id: 'puffer', name: '河豚', emoji: '🐡', rarity: 3, min: 12, max: 30, top: '#c9b26a', belly: '#f6f1df', shape: 'puffer', spots: true },
  { id: 'koi', name: '錦鯉', emoji: '🎏', rarity: 3, min: 35, max: 82, top: '#f4f1ea', belly: '#ffffff', shape: 'normal', koi: true },
  { id: 'salmon', name: '鮭魚', emoji: '🐟', rarity: 3, min: 50, max: 95, top: '#5f6f80', belly: '#f1e7e0', shape: 'normal', spots: true },
  { id: 'eel', name: '鰻魚', emoji: '🐍', rarity: 4, min: 50, max: 125, top: '#3a3f2a', belly: '#c9c48a', shape: 'eel' },
  { id: 'duck', name: '小黃鴨', emoji: '🐤', rarity: 4, min: 8, max: 12, junk: true, shape: 'duck' },
  { id: 'golden', name: '黃金鯉魚', emoji: '✨', rarity: 5, min: 60, max: 105, top: '#ffcf3a', belly: '#fff0a8', shape: 'normal', gold: true, scales: true },
  { id: 'lord', name: '湖之主', emoji: '👑', rarity: 5, min: 150, max: 260, top: '#2a2d33', belly: '#7d7a70', shape: 'cat', whiskers: true, crown: true },
  { id: 'boot', name: '舊靴子', emoji: '👢', rarity: 0, min: 24, max: 30, junk: true, shape: 'boot' },
  { id: 'can', name: '空罐子', emoji: '🥫', rarity: 0, min: 10, max: 12, junk: true, shape: 'can' },
];
export const FISH_BY_ID = Object.fromEntries(FISH.map(f => [f.id, f]));

const RARITY_WEIGHT = { 0: 7, 1: 38, 2: 28, 3: 14, 4: 4, 5: 1.2 };
export function rollFish(depth01) {
  // 拋越遠、水越深 → 稀有魚機率越高
  const items = FISH.map(f => {
    let w = RARITY_WEIGHT[f.rarity] / FISH.filter(g => g.rarity === f.rarity).length;
    if (f.rarity >= 2) w *= 1 + depth01 * (f.rarity - 1) * 0.7;
    if (f.rarity === 0) w *= 1.4 - depth01;
    return [f, w];
  });
  const total = items.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [f, w] of items) { r -= w; if (r <= 0) return f; }
  return items[0][0];
}
export function rollSize(f) {
  const r = Math.pow(Math.random(), 1.8);
  return Math.round((f.min + (f.max - f.min) * r) * 10) / 10;
}
export function stars(r) { return r === 0 ? '🗑️' : '★'.repeat(r) + '☆'.repeat(5 - r); }

// ---------------------------------------------------------------- 模型（長度 1，頭朝 +x）
const C = h => new THREE.Color(h);

function fishMaterial(f) {
  if (f.gold) return new THREE.MeshPhysicalMaterial({ vertexColors: true, metalness: 0.85, roughness: 0.22, clearcoat: 1, iridescence: 0.4 });
  return new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.15, iridescence: f.koi || f.id === 'trout' ? 0.5 : 0.25, iridescenceIOR: 1.4 });
}
function finMaterial(color) {
  return new THREE.MeshPhysicalMaterial({ color, roughness: 0.4, transparent: true, opacity: 0.85, side: THREE.DoubleSide, clearcoat: 0.6 });
}
function m(geo, mat) { const x = new THREE.Mesh(geo, mat); x.castShadow = true; return x; }

function fishEyes(g, x, y, z, r) {
  const w = new THREE.MeshPhysicalMaterial({ color: 0xf6f3e8, roughness: 0.1, clearcoat: 1 });
  const b = new THREE.MeshPhysicalMaterial({ color: 0x0c0a08, roughness: 0.05, clearcoat: 1 });
  for (const s of [-1, 1]) {
    const e = m(new THREE.SphereGeometry(r, 14, 10), w); e.position.set(x, y, s * z); e.scale.z = 0.6;
    const p = m(new THREE.SphereGeometry(r * 0.55, 10, 8), b); p.position.set(x + r * 0.15, y, s * (z + r * 0.42)); p.scale.z = 0.5;
    g.add(e, p);
  }
}

export function buildFishModel(f) {
  const g = new THREE.Group();
  if (f.shape === 'boot') {
    const leather = new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.85 });
    const sole = new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 0.9 });
    const shaft = m(new THREE.CylinderGeometry(0.17, 0.19, 0.55, 18), leather); shaft.position.y = 0.3;
    const foot = m(new THREE.SphereGeometry(0.2, 18, 12), leather); foot.scale.set(1.9, 0.75, 1); foot.position.set(0.15, 0.05, 0);
    const s = m(new THREE.BoxGeometry(0.75, 0.05, 0.36), sole); s.position.set(0.15, -0.08, 0);
    const weed = m(new THREE.CylinderGeometry(0.01, 0.01, 0.4, 4), new THREE.MeshStandardMaterial({ color: 0x3f7a2a }));
    weed.position.set(0.0, 0.62, 0.05); weed.rotation.z = 0.8;
    g.add(shaft, foot, s, weed);
    g.rotation.z = -0.3;
    return g;
  }
  if (f.shape === 'can') {
    const label = m(new THREE.CylinderGeometry(0.17, 0.17, 0.5, 24, 1, true), new THREE.MeshStandardMaterial({ map: canLabelTexture(), metalness: 0.4, roughness: 0.4 }));
    const top = m(new THREE.CylinderGeometry(0.16, 0.17, 0.03, 24), new THREE.MeshStandardMaterial({ color: 0xc0c4c8, metalness: 1, roughness: 0.3 }));
    top.position.y = 0.26;
    const bot = top.clone(); bot.position.y = -0.26;
    g.add(label, top, bot);
    g.rotation.z = 0.5;
    return g;
  }
  if (f.shape === 'duck') {
    const duck = buildHat('duck', 2);
    duck.position.set(0, 0, 0); duck.rotation.set(0, Math.PI / 2, 0); duck.scale.setScalar(2.2);
    g.add(duck);
    return g;
  }

  // 身體
  const shapes = {
    normal: [1, 0.3, 0.17], slim: [1, 0.22, 0.13], deep: [1, 0.42, 0.15], round: [1, 0.55, 0.32], cat: [1, 0.24, 0.24], puffer: [1, 0.9, 0.9], eel: [1, 0.08, 0.08],
  };
  const [L, H, W] = shapes[f.shape] || shapes.normal;
  const geo = new THREE.SphereGeometry(0.5, 36, 24);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    let taper = 1;
    if (f.shape !== 'puffer') taper = x < 0 ? 1 - Math.pow(-x * 2, 1.6) * 0.72 : 1 - Math.pow(x * 2, 2.5) * 0.35;
    if (f.shape === 'eel') taper = 1 - Math.pow(Math.abs(x) * 2, 4) * 0.6;
    if (f.shape === 'cat' && x > 0.25) { y *= 0.85; }
    pos.setXYZ(i, x * L, y * H * taper, z * W * taper);
  }
  geo.computeVertexNormals();
  const top = C(f.top), belly = C(f.belly);
  const tmp = new THREE.Color();
  paint(geo, (p, n, c) => {
    c.copy(belly).lerp(top, smoothstep(-0.12 * H, 0.18 * H, p.y));
    if (f.stripe) c.lerp(C(f.stripe), smoothstep(0.06, 0.0, Math.abs(p.y - 0.01)) * 0.75);
    if (f.bars) c.lerp(C('#2a302c'), smoothstep(0.55, 0.85, Math.sin(p.x * 30)) * smoothstep(-0.1, 0.1, p.y) * 0.5);
    if (f.blotch) c.lerp(C('#24361c'), smoothstep(0.6, 0.85, Math.sin(p.x * 22 + Math.sin(p.y * 40) * 1.5)) * smoothstep(-0.08, 0.02, p.y) * 0.6);
    if (f.spots) { const sp = Math.sin(p.x * 70) * Math.sin(p.y * 90) * Math.sin(p.z * 60); c.lerp(C('#1d1a16'), smoothstep(0.55, 0.75, sp) * smoothstep(-0.05, 0.05, p.y) * 0.8); }
    if (f.koi) {
      const a = Math.sin(p.x * 9 + 1) + Math.sin(p.z * 14 + p.x * 5) * 0.6 + p.y * 3;
      if (a > 0.6) c.lerp(C('#f2521c'), 0.95);
      else if (a < -1.3 && p.y > 0) c.lerp(C('#1a1a1a'), 0.9);
    }
    if (f.scales) { const s = Math.sin(p.x * 120 + Math.sin(p.y * 120) * 1.4); tmp.copy(c).multiplyScalar(0.78); c.lerp(tmp, smoothstep(0.7, 1, s) * 0.5); }
  });
  const body = m(geo, fishMaterial(f));
  g.add(body);

  const finCol = C(f.top).lerp(C(f.belly), 0.3);
  if (f.gold) finCol.set('#ffd34d');
  if (f.koi) finCol.set('#f8c2a8');
  const fm = finMaterial(finCol);

  if (f.shape === 'puffer') {
    const spikeM = new THREE.MeshStandardMaterial({ color: 0xe8dcae, roughness: 0.6 });
    for (let i = 0; i < 60; i++) {
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2;
      const d = new THREE.Vector3(Math.sqrt(1 - u * u) * Math.cos(a), u, Math.sqrt(1 - u * u) * Math.sin(a));
      if (d.x > 0.85) continue;
      const sp = m(new THREE.ConeGeometry(0.025, 0.09, 5), spikeM);
      sp.position.copy(d).multiply(new THREE.Vector3(0.5, 0.45, 0.45));
      sp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
      g.add(sp);
    }
    fishEyes(g, 0.32, 0.12, 0.28, 0.07);
    const lips = m(new THREE.TorusGeometry(0.04, 0.02, 8, 14), new THREE.MeshStandardMaterial({ color: 0xe8a07a }));
    lips.position.set(0.5, -0.02, 0); lips.rotation.y = Math.PI / 2; g.add(lips);
  } else {
    fishEyes(g, L * 0.33, H * 0.12, W * 0.44 * (f.shape === 'eel' ? 1.3 : 1), f.shape === 'eel' ? 0.022 : 0.035 + H * 0.05);
  }

  // 尾鰭
  const tail = new THREE.Shape();
  if (f.fancyTail) { tail.moveTo(0, 0); tail.bezierCurveTo(-0.3, 0.35, -0.55, 0.3, -0.5, 0.05); tail.bezierCurveTo(-0.45, 0, -0.55, -0.05, -0.5, -0.1); tail.bezierCurveTo(-0.55, -0.3, -0.3, -0.35, 0, 0); }
  else if (f.shape === 'eel') { tail.moveTo(0, 0); tail.lineTo(-0.1, 0.05); tail.lineTo(-0.1, -0.05); tail.lineTo(0, 0); }
  else { tail.moveTo(0, 0); tail.quadraticCurveTo(-0.15, 0.1, -0.24, 0.22); tail.quadraticCurveTo(-0.17, 0.0, -0.24, -0.22); tail.quadraticCurveTo(-0.15, -0.1, 0, 0); }
  const tg = new THREE.ShapeGeometry(tail, 12);
  const tm = m(tg, fm);
  const tailX = f.shape === 'puffer' ? -0.42 : -L * 0.47;
  tm.position.x = tailX; tm.scale.setScalar(f.shape === 'puffer' ? 0.6 : Math.max(0.6, H * 2.6));
  if (f.shape === 'eel') tm.scale.setScalar(1);
  g.add(tm);
  g.userData.tail = tm;

  // 背鰭
  if (f.shape !== 'eel' && f.shape !== 'puffer') {
    const d = new THREE.Shape(); d.moveTo(0.15, 0); d.quadraticCurveTo(0.05, H * 0.9, -0.2, H * 0.55); d.lineTo(-0.25, 0); d.lineTo(0.15, 0);
    const dm = m(new THREE.ShapeGeometry(d, 10), fm); dm.position.y = H * 0.4;
    g.add(dm);
    const pec = new THREE.Shape(); pec.moveTo(0, 0); pec.quadraticCurveTo(-0.08, 0.06, -0.14, 0.0); pec.quadraticCurveTo(-0.08, -0.02, 0, 0);
    for (const s of [-1, 1]) { const pm = m(new THREE.ShapeGeometry(pec, 6), fm); pm.position.set(L * 0.18, -H * 0.15, s * W * 0.45); pm.rotation.y = s * 0.5; g.add(pm); }
  } else if (f.shape === 'eel') {
    const d = new THREE.Shape(); d.moveTo(0.3, 0); d.lineTo(-0.48, 0); d.lineTo(-0.48, 0.05); d.quadraticCurveTo(0, 0.06, 0.3, 0);
    const dm = m(new THREE.ShapeGeometry(d, 8), fm); dm.position.y = 0.06; g.add(dm);
  }
  if (f.whiskers) {
    const wm = new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 0.6 });
    for (const s of [-1, 1]) for (const k of [0, 1]) {
      const w = m(new THREE.CylinderGeometry(0.006, 0.003, 0.32, 5), wm);
      w.position.set(L * 0.5, -0.02 - k * 0.03, s * 0.08);
      w.rotation.set(s * (0.6 + k * 0.3), 0, -1.3 - k * 0.3);
      w.geometry.translate(0, 0.16, 0);
      g.add(w);
    }
  }
  if (f.crown) {
    const crown = buildHat('crown', 0);
    crown.scale.setScalar(0.9); crown.position.set(0.2, H * 0.3, 0); crown.rotation.set(0, 0, -0.4);
    g.add(crown);
  }
  if (f.shape === 'eel') g.scale.set(1, 1, 1);
  return g;
}

// 讓魚在手上扭動
export function wiggleFish(g, t) {
  if (g.userData.tail) g.userData.tail.rotation.y = Math.sin(t * 18) * 0.5;
  g.rotation.z = Math.sin(t * 9) * 0.12;
}
