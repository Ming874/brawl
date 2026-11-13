// 地圖共用零件：地形、水面、樹、石頭、草、碼頭
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32, noise2, smoothstep } from '../util.js';
import { waterNormalTexture, groundDetailTexture, barkTexture, woodTexture } from '../textures.js';

export function makeTerrain(heightFn, colorFn, size, segs) {
  const geo = new THREE.PlaneGeometry(size, size, segs, segs);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const y = heightFn(x, z);
    pos.setY(i, y);
    colorFn(x, y, z, c);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, map: groundDetailTexture() });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

export class Water {
  constructor(size, { color = 0x2a7a86, deep = 0x0e4a5c, opacity = 0.86, y = 0 } = {}) {
    const n1 = waterNormalTexture(1).clone(); n1.needsUpdate = true; n1.repeat.set(size / 9, size / 9);
    const n2 = waterNormalTexture(2).clone(); n2.needsUpdate = true; n2.repeat.set(size / 23, size / 23);
    this.n1 = n1; this.n2 = n2;
    this.material = new THREE.MeshPhysicalMaterial({
      color, roughness: 0.1, metalness: 0.0, transparent: true, opacity,
      normalMap: n1, normalScale: new THREE.Vector2(0.35, 0.35),
      clearcoat: 0.3, clearcoatRoughness: 0.08, clearcoatNormalMap: n2, clearcoatNormalScale: new THREE.Vector2(0.45, 0.45),
      envMapIntensity: 0.28, specularIntensity: 0.7, ior: 1.33, depthWrite: false,
    });
    const geo = new THREE.PlaneGeometry(size, size, 1, 1); geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.position.y = y;
    this.mesh.receiveShadow = true;
    this.mesh.renderOrder = 2;
  }
  update(t) {
    this.n1.offset.set(t * 0.012, t * 0.008);
    this.n2.offset.set(-t * 0.006, t * 0.011);
  }
}

// 很多棵樹合併成兩個網格（效能好）
export function makeForest(spots, seed = 1) {
  const rnd = mulberry32(seed);
  const trunks = [], leaves = [];
  const c = new THREE.Color();
  for (const s of spots) {
    const h = s.h || (3.5 + rnd() * 3);
    const kind = s.kind || (rnd() < 0.35 ? 'pine' : 'round');
    const tg = new THREE.CylinderGeometry(0.14 * h / 4, 0.26 * h / 4, h * 0.6, 8, 3);
    tg.translate(0, h * 0.3, 0);
    tg.translate(s.x, s.y - 0.1, s.z);
    trunks.push(tg);
    const base = kind === 'pine' ? new THREE.Color().setHSL(0.36 + rnd() * 0.04, 0.5, 0.15 + rnd() * 0.05) : new THREE.Color().setHSL(0.25 + rnd() * 0.07, 0.55, 0.22 + rnd() * 0.07);
    if (kind === 'pine') {
      for (let k = 0; k < 4; k++) {
        const r = (1.5 - k * 0.3) * h / 5, hh = h * 0.35;
        const cg = new THREE.ConeGeometry(r, hh, 10, 2);
        jitter(cg, 0.08 * h / 5, rnd);
        cg.translate(s.x, s.y + h * 0.35 + k * h * 0.17 + hh / 2, s.z);
        colorize(cg, base, rnd, 0.12);
        leaves.push(cg);
      }
    } else {
      const n = 5 + Math.floor(rnd() * 4);
      for (let k = 0; k < n; k++) {
        const r = (0.9 + rnd() * 0.8) * h / 5;
        const sg = new THREE.IcosahedronGeometry(r, 2);
        jitter(sg, r * 0.18, rnd);
        const a = rnd() * Math.PI * 2, d = rnd() * h * 0.22;
        sg.translate(s.x + Math.cos(a) * d, s.y + h * 0.62 + rnd() * h * 0.3, s.z + Math.sin(a) * d);
        colorize(sg, base, rnd, 0.15);
        leaves.push(sg);
      }
    }
  }
  const g = new THREE.Group();
  if (trunks.length) {
    const tm = new THREE.Mesh(mergeGeometries(trunks), new THREE.MeshStandardMaterial({ map: barkTexture(), roughness: 0.95, color: 0xb89a80 }));
    tm.castShadow = true; tm.receiveShadow = true; g.add(tm);
    const lm = new THREE.Mesh(mergeGeometries(leaves.map(x => x.index ? x.toNonIndexed() : x)), new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.9, sheen: 0.25, sheenColor: new THREE.Color(0.35, 0.5, 0.2) }));
    lm.castShadow = true; lm.receiveShadow = true; g.add(lm);
  }
  return g;
}
function jitter(geo, amt, rnd) {
  const p = geo.attributes.position;
  const map = new Map();
  for (let i = 0; i < p.count; i++) {
    const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    if (!map.has(k)) map.set(k, [(rnd() - 0.5) * amt, (rnd() - 0.5) * amt, (rnd() - 0.5) * amt]);
    const o = map.get(k);
    p.setXYZ(i, p.getX(i) + o[0], p.getY(i) + o[1], p.getZ(i) + o[2]);
  }
  geo.computeVertexNormals();
}
function colorize(geo, base, rnd, v) {
  const p = geo.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  for (let i = 0; i < p.count; i++) {
    const t = (p.getY(i) - bb.min.y) / Math.max(0.01, bb.max.y - bb.min.y);
    c.copy(base).multiplyScalar(0.7 + t * 0.55 + (rnd() - 0.5) * v);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

export function makeRocks(spots, seed = 2) {
  const rnd = mulberry32(seed);
  const geos = [];
  for (const s of spots) {
    const g = new THREE.IcosahedronGeometry(s.r, 2);
    jitter(g, s.r * 0.35, rnd);
    g.scale(1, 0.55 + rnd() * 0.3, 0.8 + rnd() * 0.4);
    g.rotateY(rnd() * 6);
    g.translate(s.x, s.y + s.r * 0.15, s.z);
    const base = new THREE.Color().setHSL(0.08, 0.06 + rnd() * 0.05, 0.42 + rnd() * 0.12);
    const p = g.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const moss = smoothstep(0.3, 0.9, (p.getY(i) - s.y) / s.r + noise2(p.getX(i) * 2, p.getZ(i) * 2) * 0.4);
      c.copy(base).lerp(new THREE.Color(0x5d7a3a), moss * 0.5).multiplyScalar(0.85 + rnd() * 0.25);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geos.push(g.index ? g.toNonIndexed() : g);
  }
  const m = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

// 會隨風擺動的草（InstancedMesh）
export function makeGrass(points, { height = 0.45, color = 0x6aa84f } = {}) {
  const blade = new THREE.PlaneGeometry(0.07, 1, 1, 4);
  const p = blade.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i) + 0.5; p.setX(i, p.getX(i) * (1 - y * 0.9)); p.setY(i, y); p.setZ(i, y * y * 0.12); }
  blade.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.85, side: THREE.DoubleSide, vertexColors: false });
  const uni = { uTime: { value: 0 } };
  mat.onBeforeCompile = sh => {
    sh.uniforms.uTime = uni.uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime; varying float vGy;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vGy = position.y;
        vec4 wp = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float sway = sin(uTime * 1.8 + wp.x * 0.35 + wp.z * 0.27) * 0.12 + sin(uTime * 3.7 + wp.x * 1.3) * 0.04;
        transformed.x += sway * position.y * position.y;
        transformed.z += sway * 0.5 * position.y * position.y;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vGy;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb *= mix(0.45, 1.15, vGy);');
  };
  const inst = new THREE.InstancedMesh(blade, mat, points.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3();
  const col = new THREE.Color();
  points.forEach((pt, i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), pt.rot);
    const h = height * pt.scale;
    s.set(1, h, 1); v.set(pt.x, pt.y, pt.z);
    m4.compose(v, q, s); inst.setMatrixAt(i, m4);
    col.setHSL(0.25 + (pt.hue || 0) * 0.06, 0.55, 0.42 + (pt.light || 0) * 0.12);
    inst.setColorAt(i, col);
  });
  inst.instanceMatrix.needsUpdate = true;
  inst.receiveShadow = true;
  inst.userData.uni = uni;
  return inst;
}

// 碼頭（木板 + 柱子）, 回傳 mesh 和碰撞盒
export function makeDock(x0, z0, x1, z1, topY, { postDepth = 3, tint = '#a8774a' } = {}) {
  const g = new THREE.Group();
  const w = x1 - x0, d = z1 - z0, th = 0.16;
  const tex = woodTexture(4, tint).clone(); tex.needsUpdate = true;
  tex.repeat.set(w / 4, d / 2.2);
  tex.rotation = 0;
  const plankMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92 });
  const top = new THREE.Mesh(new THREE.BoxGeometry(w, th, d), plankMat);
  top.position.set((x0 + x1) / 2, topY - th / 2, (z0 + z1) / 2);
  top.castShadow = true; top.receiveShadow = true;
  g.add(top);
  const postMat = new THREE.MeshStandardMaterial({ color: 0x6e4b2e, roughness: 0.9 });
  const postGeo = new THREE.CylinderGeometry(0.12, 0.14, postDepth + 0.2, 8);
  const nx = Math.max(2, Math.round(w / 2.5) + 1), nz = Math.max(2, Math.round(d / 2.5) + 1);
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    if (i > 0 && i < nx - 1 && j > 0 && j < nz - 1) continue;
    const p = new THREE.Mesh(postGeo, postMat);
    p.position.set(x0 + 0.15 + (w - 0.3) * (i / (nx - 1)), topY - th - 0.02 - (postDepth + 0.2) / 2, z0 + 0.15 + (d - 0.3) * (j / (nz - 1)));
    p.castShadow = true; p.receiveShadow = true;
    g.add(p);
  }
  const box = { min: [x0, topY - th - 0.1, z0], max: [x1, topY, z1] };
  return { group: g, box };
}

// 水花粒子 + 漣漪
export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.parts = [];
    this.ringGeo = new THREE.RingGeometry(0.85, 1, 40); this.ringGeo.rotateX(-Math.PI / 2);
    this.dropGeo = new THREE.SphereGeometry(0.05, 6, 5);
    this.dropMat = new THREE.MeshStandardMaterial({ color: 0xeaf6ff, roughness: 0.1, transparent: true, opacity: 0.85 });
    this.starGeo = new THREE.OctahedronGeometry(0.09, 0);
    this.confettiGeo = new THREE.PlaneGeometry(0.08, 0.12);
  }
  splash(pos, big = 1) {
    for (let i = 0; i < 14 * big; i++) {
      const m = new THREE.Mesh(this.dropGeo, this.dropMat);
      m.position.copy(pos); m.position.y += 0.05;
      const a = Math.random() * Math.PI * 2, s = (1 + Math.random() * 2.5) * Math.sqrt(big);
      this.parts.push({ m, v: new THREE.Vector3(Math.cos(a) * s, 3 + Math.random() * 4 * big, Math.sin(a) * s), life: 1.2, kind: 'drop', y0: pos.y });
      this.scene.add(m);
    }
    this.ripple(pos, 0.3, 2.5 * big);
  }
  ripple(pos, r0 = 0.1, r1 = 1, life = 1.2) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false });
    const m = new THREE.Mesh(this.ringGeo, mat);
    m.position.set(pos.x, pos.y + 0.02, pos.z);
    m.scale.setScalar(r0);
    this.parts.push({ m, life, maxLife: life, kind: 'ring', r0, r1 });
    this.scene.add(m);
  }
  pow(pos, color = 0xffe066) { // 打到的時候冒出卡通星星（不血腥）
    for (let i = 0; i < 7; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: i % 2 ? 0xffffff : color, transparent: true });
      const m = new THREE.Mesh(this.starGeo, mat);
      m.position.copy(pos);
      const d = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize().multiplyScalar(2.5 + Math.random() * 2);
      this.parts.push({ m, v: d, life: 0.45, maxLife: 0.45, kind: 'star' });
      this.scene.add(m);
    }
  }
  confetti(pos, n = 80) {
    const cols = [0xff5a5a, 0xffc93c, 0x5ad17a, 0x4aa8ff, 0xc77dff, 0xff8fc7];
    for (let i = 0; i < n; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: cols[i % cols.length], side: THREE.DoubleSide });
      const m = new THREE.Mesh(this.confettiGeo, mat);
      m.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 2, 2 + Math.random(), (Math.random() - 0.5) * 2));
      const a = Math.random() * Math.PI * 2;
      this.parts.push({ m, v: new THREE.Vector3(Math.cos(a) * 3, 5 + Math.random() * 5, Math.sin(a) * 3), life: 4, kind: 'confetti', spin: new THREE.Vector3(Math.random() * 10, Math.random() * 10, 0) });
      this.scene.add(m);
    }
  }
  update(dt, waterY = 0) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.kind === 'drop') {
        p.v.y -= 15 * dt; p.m.position.addScaledVector(p.v, dt);
        if (p.m.position.y < waterY && p.v.y < 0) p.life = 0;
      } else if (p.kind === 'ring') {
        const t = 1 - p.life / p.maxLife;
        p.m.scale.setScalar(p.r0 + (p.r1 - p.r0) * Math.sqrt(t));
        p.m.material.opacity = 0.6 * (1 - t);
      } else if (p.kind === 'star') {
        p.v.multiplyScalar(1 - 6 * dt); p.m.position.addScaledVector(p.v, dt);
        p.m.scale.setScalar(Math.max(0.01, p.life / p.maxLife) * 1.4);
        p.m.rotation.x += dt * 10;
      } else if (p.kind === 'confetti') {
        p.v.y -= 9 * dt; p.v.multiplyScalar(1 - 1.5 * dt);
        if (p.v.y < -1.5) p.v.y = -1.5;
        p.m.position.addScaledVector(p.v, dt);
        p.m.rotation.x += p.spin.x * dt; p.m.rotation.y += p.spin.y * dt;
      }
      if (p.life <= 0) {
        this.scene.remove(p.m);
        if (p.kind !== 'drop') p.m.material.dispose();
        this.parts.splice(i, 1);
      }
    }
  }
}
