// 裝飾品：帽子與圍巾（全部用程式建模）
import * as THREE from 'three';
import { knitTexture, stripeTexture, plaidTexture, dotsTexture, strawTexture } from './textures.js';
import { furMesh, paint } from './fur.js';

export const COLORS = ['#e94b4b', '#f08a32', '#f5c842', '#6cc04a', '#2fb5a6', '#4a90e2', '#2f4a8a', '#9b5de5', '#f48fb1', '#f4f1ea', '#7d7f84', '#3a3330'];

export const HATS = [
  { id: 'none', name: '不戴', emoji: '🚫' },
  { id: 'beanie', name: '毛線帽', emoji: '🧶' },
  { id: 'party', name: '派對帽', emoji: '🥳' },
  { id: 'straw', name: '草帽', emoji: '👒' },
  { id: 'crown', name: '皇冠', emoji: '👑' },
  { id: 'bucket', name: '漁夫帽', emoji: '🎣' },
  { id: 'cowboy', name: '牛仔帽', emoji: '🤠' },
  { id: 'duck', name: '小鴨', emoji: '🐤' },
  { id: 'chef', name: '廚師帽', emoji: '👨‍🍳' },
  { id: 'flower', name: '花圈', emoji: '🌸' },
];
export const SCARVES = [
  { id: 'none', name: '不戴', emoji: '🚫' },
  { id: 'knit', name: '針織圍巾', emoji: '🧣' },
  { id: 'striped', name: '條紋圍巾', emoji: '〰️' },
  { id: 'plaid', name: '格紋圍巾', emoji: '🟥' },
  { id: 'bandana', name: '領巾', emoji: '🔺' },
  { id: 'bowtie', name: '領結', emoji: '🎀' },
];

function fabric(color, map) {
  const c = new THREE.Color(color);
  return new THREE.MeshPhysicalMaterial({ color: c, map: map || null, roughness: 0.95, sheen: 1, sheenRoughness: 0.5, sheenColor: c.clone().lerp(new THREE.Color(1, 1, 1), 0.5) });
}
function mesh(geo, mat, shadow = true) { const m = new THREE.Mesh(geo, mat); m.castShadow = shadow; m.receiveShadow = true; return m; }
function lighten(hex, t) { return '#' + new THREE.Color(hex).lerp(new THREE.Color('#ffffff'), t).getHexString(); }

function pompom(color, r = 0.065) {
  const geo = new THREE.SphereGeometry(r, 20, 14);
  const c = new THREE.Color(color);
  paint(geo, (p, n, out) => out.copy(c));
  return furMesh(geo, { length: 0.03, density: 140 });
}

// ---------------------------------------------------------------- 帽子（以頭部中心為原點，頭半徑約 0.3）
export function buildHat(type, colorIdx = 0) {
  const color = COLORS[colorIdx % COLORS.length];
  const g = new THREE.Group();
  switch (type) {
    case 'beanie': {
      const t = knitTexture().clone(); t.needsUpdate = true; t.repeat.set(6, 2);
      const cap = mesh(new THREE.SphereGeometry(0.322, 36, 18, 0, Math.PI * 2, 0, Math.PI * 0.4), fabric(color, t));
      const rimR = 0.322 * Math.sin(Math.PI * 0.4), rimY = 0.322 * Math.cos(Math.PI * 0.4);
      const tr = knitTexture().clone(); tr.needsUpdate = true; tr.repeat.set(16, 1);
      const rim = mesh(new THREE.TorusGeometry(rimR, 0.05, 12, 40), fabric(lighten(color, 0.15), tr));
      rim.rotation.x = Math.PI / 2; rim.position.y = rimY;
      const pp = pompom(lighten(color, 0.35)); pp.position.y = 0.36;
      g.add(cap, rim, pp);
      g.rotation.x = -0.18;
      break;
    }
    case 'party': {
      const cone = mesh(new THREE.ConeGeometry(0.13, 0.36, 28, 1, true), new THREE.MeshPhysicalMaterial({ map: stripeTexture(color, '#ffffff', 7), roughness: 0.5, side: THREE.DoubleSide, clearcoat: 0.4 }));
      cone.position.y = 0.18;
      const pp = pompom('#ffffff', 0.05); pp.position.y = 0.37;
      const holder = new THREE.Group(); holder.add(cone, pp);
      holder.position.set(0.05, 0.2, 0); holder.rotation.z = -0.28;
      g.add(holder);
      break;
    }
    case 'straw': {
      const mat = new THREE.MeshStandardMaterial({ map: strawTexture(), roughness: 0.95 });
      const brim = mesh(new THREE.CylinderGeometry(0.5, 0.53, 0.025, 48), mat);
      brim.position.y = 0.17;
      const crown = mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.17, 40), mat); crown.position.y = 0.26;
      const top = mesh(new THREE.SphereGeometry(0.22, 32, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat); top.scale.y = 0.25; top.position.y = 0.345;
      const band = mesh(new THREE.CylinderGeometry(0.262, 0.262, 0.055, 40, 1, true), fabric(color)); band.position.y = 0.205;
      g.add(brim, crown, top, band);
      g.rotation.x = -0.12;
      break;
    }
    case 'crown': {
      const gold = new THREE.MeshPhysicalMaterial({ color: 0xffc83d, metalness: 1, roughness: 0.22, clearcoat: 0.6 });
      const band = mesh(new THREE.CylinderGeometry(0.17, 0.155, 0.09, 40, 1, true), gold);
      band.material.side = THREE.DoubleSide;
      g.add(band);
      const gem = new THREE.MeshPhysicalMaterial({ color, roughness: 0.05, transmission: 0.3, clearcoat: 1, metalness: 0.1, ior: 2.0 });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const spike = mesh(new THREE.ConeGeometry(0.04, 0.11, 8), gold);
        spike.position.set(Math.sin(a) * 0.163, 0.095, Math.cos(a) * 0.163);
        const ball = mesh(new THREE.SphereGeometry(0.018, 10, 8), gold); ball.position.set(spike.position.x, 0.155, spike.position.z);
        const jewel = mesh(new THREE.SphereGeometry(0.022, 12, 10), gem); jewel.scale.z = 0.5;
        jewel.position.set(Math.sin(a) * 0.172, 0, Math.cos(a) * 0.172); jewel.lookAt(Math.sin(a), 0, Math.cos(a));
        g.add(spike, ball, jewel);
      }
      g.position.set(0.02, 0.29, 0); g.rotation.z = -0.22; g.rotation.x = -0.08;
      break;
    }
    case 'bucket': {
      const m = fabric(color);
      const crown = mesh(new THREE.CylinderGeometry(0.21, 0.27, 0.17, 40), m); crown.position.y = 0.27;
      const brim = mesh(new THREE.CylinderGeometry(0.27, 0.4, 0.09, 40, 1, true), m); brim.material.side = THREE.DoubleSide; brim.position.y = 0.17;
      const band = mesh(new THREE.CylinderGeometry(0.272, 0.272, 0.04, 40, 1, true), fabric(lighten(color, 0.5))); band.position.y = 0.205;
      g.add(crown, brim, band);
      g.rotation.x = -0.1;
      break;
    }
    case 'cowboy': {
      const leather = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).lerp(new THREE.Color('#7a4a24'), 0.82), roughness: 0.7 });
      const pts = [];
      for (let i = 0; i <= 12; i++) { const t = i / 12; const r = 0.2 + t * 0.21; pts.push(new THREE.Vector2(r, Math.pow(t, 3) * 0.09)); }
      const brimGeo = new THREE.LatheGeometry(pts, 48);
      brimGeo.scale(1, 1, 0.82);
      const brim = mesh(brimGeo, leather); brim.material.side = THREE.DoubleSide; brim.position.y = 0.2;
      const crownPts = [new THREE.Vector2(0.2, 0), new THREE.Vector2(0.21, 0.08), new THREE.Vector2(0.19, 0.18), new THREE.Vector2(0.12, 0.215), new THREE.Vector2(0.0, 0.18)];
      const crown = mesh(new THREE.LatheGeometry(crownPts, 40), leather); crown.position.y = 0.19; crown.scale.z = 0.85;
      const band = mesh(new THREE.CylinderGeometry(0.207, 0.207, 0.035, 40, 1, true), new THREE.MeshStandardMaterial({ color: 0x3a2a1e, roughness: 0.6 })); band.position.y = 0.215;
      g.add(brim, crown, band);
      g.rotation.x = -0.1;
      break;
    }
    case 'duck': {
      const yellow = new THREE.MeshPhysicalMaterial({ color: colorIdx === 0 || colorIdx === 2 ? '#ffd83a' : lighten(color, 0.25), roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1 });
      const body = mesh(new THREE.SphereGeometry(0.14, 28, 20), yellow); body.scale.set(1, 0.78, 1.25);
      const head = mesh(new THREE.SphereGeometry(0.09, 24, 18), yellow); head.position.set(0, 0.13, 0.09);
      const tail = mesh(new THREE.ConeGeometry(0.05, 0.1, 12), yellow); tail.position.set(0, 0.06, -0.17); tail.rotation.x = -1.1;
      const beakMat = new THREE.MeshPhysicalMaterial({ color: 0xff8a1c, roughness: 0.3, clearcoat: 1 });
      const beak = mesh(new THREE.SphereGeometry(0.045, 16, 10), beakMat); beak.scale.set(1.2, 0.45, 1.3); beak.position.set(0, 0.11, 0.18);
      const eyeM = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.2 });
      for (const s of [-1, 1]) { const e = mesh(new THREE.SphereGeometry(0.016, 10, 8), eyeM, false); e.position.set(s * 0.055, 0.16, 0.155); g.add(e); }
      g.add(body, head, tail, beak);
      g.position.set(0, 0.36, -0.02); g.rotation.y = 0.4;
      break;
    }
    case 'chef': {
      const white = fabric('#fbfaf6');
      const band = mesh(new THREE.CylinderGeometry(0.2, 0.21, 0.13, 36), white); band.position.y = 0.27;
      const puff = new THREE.Group();
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const s = mesh(new THREE.SphereGeometry(0.12, 20, 14), white); s.position.set(Math.sin(a) * 0.12, 0, Math.cos(a) * 0.12);
        puff.add(s);
      }
      const c = mesh(new THREE.SphereGeometry(0.16, 22, 16), white); c.position.y = 0.04; puff.add(c);
      puff.position.y = 0.42;
      g.add(band, puff);
      g.rotation.z = 0.15;
      break;
    }
    case 'flower': {
      const leafM = new THREE.MeshStandardMaterial({ color: 0x4f9a3c, roughness: 0.7 });
      const ring = mesh(new THREE.TorusGeometry(0.24, 0.02, 8, 40), leafM); ring.rotation.x = Math.PI / 2;
      g.add(ring);
      const petalM = new THREE.MeshPhysicalMaterial({ color, roughness: 0.6, sheen: 0.6, sheenColor: new THREE.Color('#ffffff') });
      const centerM = new THREE.MeshStandardMaterial({ color: 0xffd23f, roughness: 0.6 });
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const f = new THREE.Group();
        for (let k = 0; k < 5; k++) {
          const pa = (k / 5) * Math.PI * 2;
          const p = mesh(new THREE.SphereGeometry(0.03, 10, 8), i % 3 === 1 ? new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.6 }) : petalM, false);
          p.scale.set(1, 0.35, 0.65); p.position.set(Math.cos(pa) * 0.03, 0, Math.sin(pa) * 0.03);
          f.add(p);
        }
        const c = mesh(new THREE.SphereGeometry(0.016, 8, 6), centerM, false); c.position.y = 0.01; f.add(c);
        const leaf = mesh(new THREE.SphereGeometry(0.03, 8, 6), leafM, false); leaf.scale.set(1.6, 0.25, 0.6); leaf.position.set(0.04, -0.01, 0.0); f.add(leaf);
        f.position.set(Math.sin(a) * 0.24, 0.015, Math.cos(a) * 0.24);
        f.rotation.set(0.25 * Math.cos(a), a, 0.25 * Math.sin(a));
        g.add(f);
      }
      g.position.y = 0.2; g.rotation.z = 0.12; g.rotation.x = -0.1;
      break;
    }
    default: return null;
  }
  return g;
}

// ---------------------------------------------------------------- 圍巾（以脖子為原點）
export function buildScarf(type, colorIdx = 0) {
  const color = COLORS[colorIdx % COLORS.length];
  const g = new THREE.Group();
  g.userData.tails = [];
  const ringAndTail = (mat, tailMat) => {
    const ring = mesh(new THREE.TorusGeometry(0.175, 0.062, 14, 40), mat);
    ring.rotation.x = Math.PI / 2; ring.scale.set(1, 1.05, 1);
    g.add(ring);
    const tail = new THREE.Group();
    tail.position.set(0.09, -0.01, 0.17);
    const strip = mesh(new THREE.BoxGeometry(0.12, 0.3, 0.035, 1, 6, 1), tailMat || mat);
    strip.position.y = -0.14;
    tail.add(strip);
    const fr = new THREE.MeshStandardMaterial({ color: (tailMat || mat).color, roughness: 1 });
    for (let i = 0; i < 5; i++) { const f = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.05, 5), fr, false); f.position.set(-0.048 + i * 0.024, -0.31, 0); tail.add(f); }
    tail.rotation.z = 0.2;
    g.add(tail);
    g.userData.tails.push(tail);
  };
  switch (type) {
    case 'knit': {
      const t = knitTexture().clone(); t.needsUpdate = true; t.repeat.set(14, 1);
      const t2 = knitTexture().clone(); t2.needsUpdate = true; t2.repeat.set(2, 3);
      ringAndTail(fabric(color, t), fabric(color, t2));
      break;
    }
    case 'striped': {
      const tex = stripeTexture(color, '#fbf6ec', 2).clone(); tex.needsUpdate = true; tex.repeat.set(10, 1); tex.rotation = Math.PI / 2;
      const tex2 = stripeTexture(color, '#fbf6ec', 6);
      ringAndTail(fabric('#ffffff', tex), fabric('#ffffff', tex2));
      break;
    }
    case 'plaid': {
      const tex = plaidTexture(color).clone(); tex.needsUpdate = true; tex.repeat.set(8, 1);
      ringAndTail(fabric('#ffffff', tex), fabric('#ffffff', plaidTexture(color)));
      break;
    }
    case 'bandana': {
      const m = fabric('#ffffff', dotsTexture(color));
      const ring = mesh(new THREE.TorusGeometry(0.17, 0.03, 10, 40), m); ring.rotation.x = Math.PI / 2;
      const shape = new THREE.Shape(); shape.moveTo(-0.16, 0); shape.lineTo(0.16, 0); shape.quadraticCurveTo(0.04, -0.12, 0, -0.2); shape.quadraticCurveTo(-0.04, -0.12, -0.16, 0);
      const tri = mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.012, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.008, bevelSegments: 2 }), m);
      tri.position.set(0, 0.01, 0.16); tri.rotation.x = -0.35;
      const knot = mesh(new THREE.SphereGeometry(0.035, 12, 10), m); knot.position.set(0, 0, -0.17);
      g.add(ring, tri, knot);
      break;
    }
    case 'bowtie': {
      const m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.4, sheen: 1, sheenColor: new THREE.Color(lighten(color, 0.5)) });
      const bow = new THREE.Group();
      for (const s of [-1, 1]) {
        const w = mesh(new THREE.ConeGeometry(0.07, 0.13, 4, 1), m);
        w.rotation.z = s * Math.PI / 2; w.position.x = s * 0.065; w.scale.set(1, 1, 0.45);
        bow.add(w);
      }
      const k = mesh(new THREE.SphereGeometry(0.03, 12, 10), m); k.scale.z = 0.7; bow.add(k);
      bow.position.set(0, 0.0, 0.2); bow.rotation.x = -0.25;
      g.add(bow);
      break;
    }
    default: return null;
  }
  return g;
}
