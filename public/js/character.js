// 憨憨動物角色：程式建模 + 程式動畫（Q彈搖晃）
import * as THREE from 'three';
import { furMesh, paint } from './fur.js';
import { buildHat, buildScarf } from './accessories.js';
import { Spring, damp, clamp, smoothstep, lerp } from './util.js';
import { nameTagTexture } from './textures.js';

export const SPECIES_INFO = {
  dog: { name: '橘寶', desc: '橘白色的憨憨柴犬', emoji: '🐶' },
  cat: { name: '灰灰', desc: '灰白色的呆萌貓咪', emoji: '🐱' },
};

const C = h => new THREE.Color(h);
const PAL = {
  dog: { main: C('#d8701f'), back: C('#ad4f12'), white: C('#f8efe2'), inner: C('#f7dcc4'), stripe: C('#b95a18'), nose: '#2a1f1b', iris: '#3b2414' },
  cat: { main: C('#7f848c'), back: C('#60656d'), white: C('#f4f4f1'), inner: C('#f3a7b6'), stripe: C('#3e4249'), nose: '#ef8fa0', iris: '#b5c43c' },
};

// 共用材質
const MAT = {};
function mats() {
  if (MAT.sclera) return MAT;
  MAT.sclera = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05 });
  MAT.pupil = new THREE.MeshPhysicalMaterial({ color: 0x0b0806, roughness: 0.1, clearcoat: 1 });
  MAT.highlight = new THREE.MeshBasicMaterial({ color: 0xffffff });
  MAT.tongue = new THREE.MeshPhysicalMaterial({ color: 0xef7d8f, roughness: 0.35, clearcoat: 0.8 });
  MAT.mouth = new THREE.MeshStandardMaterial({ color: 0x3a2420, roughness: 0.6 });
  MAT.whisker = new THREE.MeshStandardMaterial({ color: 0xfafafa, roughness: 0.5 });
  MAT.star = new THREE.MeshBasicMaterial({ color: 0xffd83a });
  MAT.rodBlank = new THREE.MeshPhysicalMaterial({ color: 0x23324a, roughness: 0.3, clearcoat: 1 });
  MAT.cork = new THREE.MeshStandardMaterial({ color: 0xc89a62, roughness: 0.9 });
  MAT.metal = new THREE.MeshStandardMaterial({ color: 0xc8ccd2, metalness: 1, roughness: 0.3 });
  MAT.iris = {};
  MAT.nose = {};
  MAT.inner = {};
  return MAT;
}
function cachedMat(store, key, make) { if (!store[key]) store[key] = make(); return store[key]; }

function mesh(geo, mat, cast = true) { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = true; return m; }
function pointOnEllipsoid(dir, a, b, c) {
  const d = dir.clone().normalize();
  const k = 1 / Math.sqrt((d.x / a) ** 2 + (d.y / b) ** 2 + (d.z / c) ** 2);
  return d.multiplyScalar(k);
}

function starGeometry() {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 0.022 : 0.05, a = (i / 10) * Math.PI * 2;
    const x = Math.sin(a) * r, y = Math.cos(a) * r;
    i ? s.lineTo(x, y) : s.moveTo(x, y);
  }
  return new THREE.ExtrudeGeometry(s, { depth: 0.015, bevelEnabled: false });
}

export class Character {
  constructor(look, opts = {}) {
    this.root = new THREE.Group();
    this.opts = opts;
    this.look = null;
    this.t = Math.random() * 10;
    this.phase = 0;
    this.prevVel = new THREE.Vector3();
    this.lastPunchCount = 0;
    this.punchT = 9; this.punchSide = 0;
    this.blinkT = 2; this.eyeTarget = [new THREE.Vector2(), new THREE.Vector2()]; this.eyeT = 1;
    this.headLagX = new Spring(80, 8); this.headLagZ = new Spring(80, 8);
    this.earSpring = new Spring(140, 7);
    this.scarfSpring = new Spring(60, 5);
    this.lying = 0;
    this.heldFishT = 0;
    this.setLook(look);
    if (opts.name) this.setName(opts.name, opts.nameColor);
  }

  setLook(look) {
    look = { species: 'dog', hat: 'none', hatColor: 0, scarf: 'none', scarfColor: 0, ...look };
    const prev = this.look;
    this.look = look;
    if (!prev || prev.species !== look.species) { this.build(); }
    else {
      if (prev.hat !== look.hat || prev.hatColor !== look.hatColor) this.attachHat();
      if (prev.scarf !== look.scarf || prev.scarfColor !== look.scarfColor) this.attachScarf();
    }
  }

  setName(name, color) {
    if (this.nameTag) { this.root.remove(this.nameTag); this.nameTag.material.map.dispose(); this.nameTag.material.dispose(); }
    if (!name) { this.nameTag = null; return; }
    const sm = new THREE.SpriteMaterial({ map: nameTagTexture(name, color), depthWrite: false, sizeAttenuation: false, transparent: true });
    this.nameTag = new THREE.Sprite(sm);
    this.nameTag.scale.set(0.15, 0.0375, 1);
    this.nameTag.position.y = 1.55;
    this.nameTag.renderOrder = 10;
    this.root.add(this.nameTag);
  }

  disposeModel() {
    if (!this.pose) return;
    this.root.remove(this.pose);
    this.pose.traverse(o => { if (o.isMesh && o.geometry) o.geometry.dispose(); });
  }

  build() {
    this.disposeModel();
    const sp = this.look.species;
    const P = PAL[sp];
    const M = mats();
    const tmp = new THREE.Color();

    this.pose = new THREE.Group(); this.pose.position.y = 0.5;
    this.rig = new THREE.Group(); this.rig.position.y = -0.5;
    this.pose.add(this.rig);
    this.root.add(this.pose);

    // ---------- 身體（梨形）
    this.hips = new THREE.Group(); this.hips.position.y = 0.255;
    this.rig.add(this.hips);
    const prof = [];
    for (let i = 0; i <= 18; i++) {
      const t = i / 18;
      const r = 0.3 * Math.pow(Math.sin(Math.PI * t), 0.55) * (1.06 - 0.32 * t);
      prof.push(new THREE.Vector2(Math.max(r, 0.0001), -0.08 + t * 0.58));
    }
    const bodyGeo = new THREE.LatheGeometry(prof, 36);
    bodyGeo.scale(1, 1, 0.9);
    bodyGeo.computeVertexNormals();
    paint(bodyGeo, (p, n, c) => {
      let front = smoothstep(0.62, 0.88, n.z) * smoothstep(0.5, 0.26, p.y) * smoothstep(0.17, 0.09, Math.abs(p.x));
      if (sp === 'cat') front *= smoothstep(-0.02, 0.06, p.y + 0.0) ;
      const belly = smoothstep(0.02, -0.06, p.y);
      const w = Math.max(front, belly);
      c.copy(P.main).lerp(P.back, smoothstep(-0.2, -0.85, n.z) * 0.6);
      if (sp === 'cat') {
        const ang = Math.atan2(p.x, p.z);
        const s = smoothstep(0.55, 0.9, Math.sin(p.y * 30 + Math.abs(ang) * 1.5)) * smoothstep(0.1, -0.5, n.z);
        c.lerp(P.stripe, s * 0.85);
      }
      c.lerp(P.white, w);
    });
    this.body = furMesh(bodyGeo, { length: 0.032, density: 90 });
    this.hips.add(this.body);

    // ---------- 頭
    this.neck = new THREE.Group(); this.neck.position.y = 0.47;
    this.hips.add(this.neck);
    this.head = new THREE.Group(); this.head.position.set(0, 0.2, 0.01);
    this.neck.add(this.head);
    const HA = 0.318, HB = 0.282, HC = 0.3;
    const headGeo = new THREE.SphereGeometry(0.3, 44, 32);
    headGeo.scale(HA / 0.3, HB / 0.3, 1);
    if (sp === 'cat') { // 貓咪：胖臉頰
      const pos = headGeo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        const cheek = smoothstep(0.05, -0.12, y) * smoothstep(-0.25, 0.1, z) * 0.12;
        pos.setX(i, x * (1 + cheek));
      }
      headGeo.computeVertexNormals();
    }
    paint(headGeo, (p, n, c) => {
      const u = new THREE.Vector3(p.x / HA, p.y / HB, p.z / HC);
      c.copy(P.main).lerp(P.back, smoothstep(0.3, 1.0, u.y) * 0.35 + smoothstep(0, -1, u.z) * 0.3);
      let w = 0;
      if (sp === 'dog') {
        w = Math.max(smoothstep(0.32, 0.62, u.z) * smoothstep(-0.02, -0.24, u.y), smoothstep(-0.3, -0.55, u.y) * smoothstep(-0.3, 0.2, u.z));
        for (const sx of [-1, 1]) { // 柴犬的白眉毛
          const d = Math.hypot(u.x - sx * 0.36, u.y - 0.36, (u.z - 0.86) * 0.7);
          w = Math.max(w, smoothstep(0.14, 0.09, d));
        }
      } else {
        const muzzle = smoothstep(0.55, 0.75, u.z) * smoothstep(0.0, -0.22, u.y);
        const chin = smoothstep(-0.35, -0.6, u.y) * smoothstep(-0.2, 0.3, u.z);
        const blaze = smoothstep(0.16 + Math.max(0, -u.y) * 0.4, 0.08, Math.abs(u.x)) * smoothstep(0.55, 0.8, u.z) * smoothstep(0.42, 0.2, u.y);
        w = Math.max(muzzle, chin, blaze);
        // 額頭虎斑 M 字紋
        const fore = smoothstep(0.62, 0.9, Math.sin(u.x * 15 + 1.57)) * smoothstep(0.38, 0.6, u.y) * smoothstep(-0.1, 0.35, u.z);
        const side = smoothstep(0.7, 0.95, Math.sin(u.y * 17 + 0.5)) * smoothstep(0.55, 0.85, Math.abs(u.x)) * smoothstep(-0.4, 0.0, u.z) * smoothstep(0.4, 0.1, u.y);
        c.lerp(P.stripe, Math.max(fore, side) * 0.8);
      }
      c.lerp(P.white, w);
    });
    this.head.add(furMesh(headGeo, { length: 0.022, density: 105 }));

    // 嘴巴/口鼻
    if (sp === 'dog') {
      const mz = new THREE.SphereGeometry(0.13, 28, 20); mz.scale(1.12, 0.78, 1.0);
      paint(mz, (p, n, c) => c.copy(P.white).lerp(P.main, smoothstep(0.02, 0.09, p.y) * smoothstep(0.0, -0.1, p.z) * 0.6));
      const muzzle = furMesh(mz, { length: 0.012, density: 150 }); muzzle.position.set(0, -0.09, 0.215);
      this.head.add(muzzle);
      const nose = mesh(new THREE.SphereGeometry(0.043, 18, 14), cachedMat(M.nose, P.nose, () => new THREE.MeshPhysicalMaterial({ color: P.nose, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.15 })));
      nose.scale.set(1.35, 0.85, 0.9); nose.position.set(0, -0.05, 0.338);
      this.head.add(nose);
      for (const s of [-1, 1]) {
        const arc = mesh(new THREE.TorusGeometry(0.026, 0.0065, 6, 14, Math.PI), M.mouth, false);
        arc.rotation.set(-0.35, 0, Math.PI); arc.position.set(s * 0.026, -0.112, 0.318);
        this.head.add(arc);
      }
      const tongue = mesh(new THREE.SphereGeometry(0.042, 16, 12), M.tongue, false);
      tongue.scale.set(1, 0.35, 1.35); tongue.position.set(0.03, -0.145, 0.31); tongue.rotation.set(0.6, 0.2, 0.15);
      this.tongue = tongue;
      this.head.add(tongue);
    } else {
      for (const s of [-1, 1]) {
        const pg = new THREE.SphereGeometry(0.066, 20, 14);
        paint(pg, (p, n, c) => c.copy(P.white));
        const puff = furMesh(pg, { length: 0.012, density: 170 }); puff.position.set(s * 0.05, -0.088, 0.252);
        this.head.add(puff);
        for (let k = 0; k < 3; k++) {
          const w = mesh(new THREE.CylinderGeometry(0.0025, 0.0015, 0.2, 4), M.whisker, false);
          w.position.set(s * 0.17, -0.07 - k * 0.018 + 0.01, 0.27);
          w.rotation.z = s * (Math.PI / 2 + 0.12 - k * 0.12);
          w.rotation.y = -s * 0.35;
          this.head.add(w);
        }
      }
      const chg = new THREE.SphereGeometry(0.048, 16, 12); paint(chg, (p, n, c) => c.copy(P.white));
      const chin = furMesh(chg, { length: 0.01, density: 170 }); chin.position.set(0, -0.135, 0.235); this.head.add(chin);
      const nose = mesh(new THREE.ConeGeometry(0.026, 0.026, 3), cachedMat(M.nose, P.nose, () => new THREE.MeshPhysicalMaterial({ color: P.nose, roughness: 0.35, clearcoat: 0.8 })));
      nose.rotation.set(-Math.PI / 2 - 0.3, Math.PI, 0); nose.position.set(0, -0.045, 0.312); nose.scale.set(1.2, 1, 0.7);
      this.head.add(nose);
      for (const s of [-1, 1]) {
        const arc = mesh(new THREE.TorusGeometry(0.02, 0.005, 6, 12, Math.PI), M.mouth, false);
        arc.rotation.set(-0.25, 0, Math.PI); arc.position.set(s * 0.02, -0.085, 0.312);
        this.head.add(arc);
      }
      this.tongue = null;
    }

    // 眼睛（大大的、有點呆）
    this.eyes = [];
    const irisMat = cachedMat(M.iris, P.iris, () => new THREE.MeshPhysicalMaterial({ color: P.iris, roughness: 0.2, clearcoat: 1 }));
    for (const s of [-1, 1]) {
      const dir = new THREE.Vector3(s * (sp === 'cat' ? 0.38 : 0.36), sp === 'cat' ? 0.12 : 0.15, 0.92);
      const pos = pointOnEllipsoid(dir, HA, HB, HC);
      const eye = new THREE.Group();
      eye.position.copy(pos).addScaledVector(dir.normalize(), -0.012);
      eye.lookAt(pos.clone().multiplyScalar(3));
      const r = sp === 'cat' ? 0.072 : 0.066;
      const sclera = mesh(new THREE.SphereGeometry(r, 24, 18), M.sclera, false); sclera.scale.z = 0.62;
      eye.add(sclera);
      const iris = new THREE.Group(); iris.position.z = r * 0.5;
      const ir = mesh(new THREE.SphereGeometry(r * (sp === 'cat' ? 0.72 : 0.6), 20, 14), irisMat, false); ir.scale.z = 0.3;
      const pu = mesh(new THREE.SphereGeometry(r * 0.38, 16, 12), M.pupil, false); pu.scale.set(sp === 'cat' ? 0.55 : 1, 1, 0.3); pu.position.z = 0.006;
      const hl = mesh(new THREE.SphereGeometry(r * 0.17, 10, 8), M.highlight, false); hl.position.set(r * 0.22, r * 0.25, 0.014);
      const hl2 = mesh(new THREE.SphereGeometry(r * 0.08, 8, 6), M.highlight, false); hl2.position.set(-r * 0.2, -r * 0.18, 0.014);
      iris.add(ir, pu, hl, hl2);
      eye.add(iris);
      this.head.add(eye);
      this.eyes.push({ g: eye, iris, base: new THREE.Vector2(s * r * 0.08, 0), side: s });
    }

    // 耳朵
    this.ears = [];
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      const h = sp === 'cat' ? 0.2 : 0.18, rr = sp === 'cat' ? 0.095 : 0.1;
      const eg = new THREE.ConeGeometry(rr, h, 24, 4); eg.translate(0, h / 2, 0); eg.scale(1, 1, 0.5);
      paint(eg, (p, n, c) => c.copy(P.main).lerp(P.back, smoothstep(0.05, h, p.y) * 0.5));
      const ear = furMesh(eg, { length: 0.008, density: 160, castShadow: true });
      const ig = new THREE.ConeGeometry(rr * 0.62, h * 0.72, 16, 1); ig.translate(0, h * 0.36, 0); ig.scale(1, 1, 0.3);
      const inner = mesh(ig, cachedMat(M.inner, sp, () => new THREE.MeshPhysicalMaterial({ color: P.inner, roughness: 0.8, sheen: 1, sheenColor: new THREE.Color(1, 1, 1) })), false);
      inner.position.set(0, 0.005, rr * 0.25);
      pivot.add(ear, inner);
      pivot.position.set(s * 0.165, sp === 'cat' ? 0.205 : 0.2, -0.015);
      pivot.rotation.set(-0.12, 0, -s * (sp === 'cat' ? 0.4 : 0.34));
      this.head.add(pivot);
      this.ears.push({ pivot, side: s, baseZ: pivot.rotation.z });
    }

    // 頭頂暈眩星星
    this.stars = new THREE.Group(); this.stars.position.y = 0.38; this.stars.visible = false;
    const sg = starGeometry();
    for (let i = 0; i < 3; i++) {
      const st = mesh(sg, M.star, false);
      const a = (i / 3) * Math.PI * 2; st.position.set(Math.sin(a) * 0.24, 0, Math.cos(a) * 0.24);
      this.stars.add(st);
    }
    this.head.add(this.stars);

    // ---------- 手
    this.arms = [];
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.position.set(s * 0.232, 0.33, 0.01);
      const ag = new THREE.CapsuleGeometry(0.072, 0.13, 8, 14); ag.translate(0, -0.137, 0);
      paint(ag, (p, n, c) => c.copy(P.main).lerp(P.white, smoothstep(-0.17, -0.215, p.y)));
      const arm = furMesh(ag, { length: 0.02, density: 120 });
      pivot.add(arm);
      const hand = new THREE.Object3D(); hand.position.y = -0.26; pivot.add(hand);
      this.hips.add(pivot);
      this.arms.push({ pivot, hand, side: s });
    }
    // ---------- 腳
    this.legs = [];
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.position.set(s * 0.12, 0.255, 0);
      const lg = new THREE.CapsuleGeometry(0.086, 0.06, 6, 14); lg.translate(0, -0.115, 0);
      paint(lg, (p, n, c) => c.copy(P.main).lerp(P.white, smoothstep(-0.08, -0.15, p.y)));
      const fg = new THREE.SphereGeometry(0.095, 20, 14); fg.scale(1, 0.6, 1.3); fg.translate(0, -0.198, 0.035);
      paint(fg, (p, n, c) => c.copy(P.white));
      pivot.add(furMesh(lg, { length: 0.018, density: 120 }), furMesh(fg, { length: 0.012, density: 140 }));
      this.rig.add(pivot);
      this.legs.push({ pivot, side: s });
    }

    // ---------- 尾巴
    this.tailSegs = [];
    if (sp === 'dog') {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.07, -0.09), new THREE.Vector3(0, 0.18, -0.1),
        new THREE.Vector3(0, 0.24, -0.02), new THREE.Vector3(0, 0.2, 0.05),
      ]);
      const tg = new THREE.TubeGeometry(curve, 24, 0.05, 12, false);
      const pos = tg.attributes.position;
      for (let i = 0; i < pos.count; i++) { // 尾端變細
        const seg = Math.floor(i / 13) / 24;
        const pt = curve.getPoint(seg);
        const k = 1 - seg * 0.45;
        pos.setXYZ(i, pt.x + (pos.getX(i) - pt.x) * k, pt.y + (pos.getY(i) - pt.y) * k, pt.z + (pos.getZ(i) - pt.z) * k);
      }
      tg.computeVertexNormals();
      paint(tg, (p, n, c) => c.copy(P.main).lerp(P.white, smoothstep(0.0, -0.6, n.y) * 0.9 + smoothstep(0.17, 0.24, p.y) * smoothstep(0.0, 0.05, p.z)));
      const tip = new THREE.SphereGeometry(0.028, 12, 10); tip.translate(0, 0.2, 0.05); paint(tip, (p, n, c) => c.copy(P.white));
      const tail = new THREE.Group();
      tail.add(furMesh(tg, { length: 0.035, density: 110 }), furMesh(tip, { length: 0.03, density: 120 }));
      tail.position.set(0, 0.2, -0.235);
      this.hips.add(tail);
      this.tail = tail;
    } else {
      let parent = this.hips;
      const n = 7;
      for (let i = 0; i < n; i++) {
        const g = new THREE.Group();
        const r = 0.045 - i * 0.003, len = 0.06;
        const sg2 = new THREE.CapsuleGeometry(r, len, 6, 12); sg2.translate(0, len / 2 + r * 0.3, 0);
        const dark = i % 2 === 1 || i === n - 1;
        paint(sg2, (p, n2, c) => c.copy(P.main).lerp(P.stripe, dark ? 0.85 * smoothstep(0.0, 0.03, p.y) * smoothstep(len + 0.04, len - 0.01, p.y) : 0));
        g.add(furMesh(sg2, { length: 0.022, density: 120 }));
        if (i === 0) { g.position.set(0, 0.05, -0.24); }
        else g.position.y = len + r * 0.5;
        parent.add(g);
        this.tailSegs.push(g);
        parent = g;
      }
      this.tail = this.tailSegs[0];
    }

    // ---------- 釣竿
    this.rod = new THREE.Group();
    const handle = mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.2, 10), M.cork); handle.position.y = 0.0;
    const reel = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 16), M.metal); reel.rotation.z = Math.PI / 2; reel.position.set(0.035, 0.07, 0);
    const blank = mesh(new THREE.CylinderGeometry(0.005, 0.013, 1.3, 8), M.rodBlank); blank.position.y = 0.75;
    this.rod.add(handle, reel, blank);
    this.rodTip = new THREE.Object3D(); this.rodTip.position.y = 1.4; this.rod.add(this.rodTip);
    this.rod.position.set(0, -0.02, 0.02);
    this.rod.rotation.x = 1.25;
    this.rod.visible = false;
    this.arms[1].hand.add(this.rod);

    // 舉起來的東西（釣到的魚）
    this.holdPoint = new THREE.Group(); this.holdPoint.position.set(0, 1.0, 0.05);
    this.hips.add(this.holdPoint);

    this.attachHat();
    this.attachScarf();
  }

  attachHat() {
    if (this.hat) { this.head.remove(this.hat); this.hat.traverse(o => o.isMesh && o.geometry.dispose()); }
    this.hat = buildHat(this.look.hat, this.look.hatColor);
    if (this.hat) this.head.add(this.hat);
    // 戴帽子時耳朵稍微壓扁
    const squash = ['beanie', 'bucket', 'straw', 'cowboy', 'chef'].includes(this.look.hat);
    for (const e of this.ears) { e.pivot.scale.set(squash ? 0.85 : 1, squash ? 0.75 : 1, 1); }
  }
  attachScarf() {
    if (this.scarf) { this.hips.remove(this.scarf); this.scarf.traverse(o => o.isMesh && o.geometry.dispose()); }
    this.scarf = buildScarf(this.look.scarf, this.look.scarfColor);
    if (this.scarf) { this.scarf.position.set(0, 0.455, 0.0); this.hips.add(this.scarf); }
  }

  showHeldItem(obj, seconds = 2.8) {
    this.clearHeldItem();
    this.heldItem = obj;
    this.holdPoint.add(obj);
    this.heldFishT = seconds;
  }
  clearHeldItem() {
    if (this.heldItem) { this.holdPoint.remove(this.heldItem); this.heldItem = null; }
    this.heldFishT = 0;
  }

  getRodTip(out) { return this.rodTip.getWorldPosition(out); }
  getHeadPos(out) { return this.head.getWorldPosition(out); }

  // s: 動畫狀態 { vel, yaw, onGround, swim, ko, held, grabbing, holding, diving, punchCount, emote, rod, fishPhase, charge, dizzy, sitting }
  update(dt, s) {
    dt = Math.min(dt, 0.05);
    this.t += dt;
    const t = this.t;
    const v = s.vel;
    const spd = Math.hypot(v.x, v.z);
    const sy = Math.sin(s.yaw || 0), cy = Math.cos(s.yaw || 0);
    const ax = (v.x - this.prevVel.x) / Math.max(dt, 1e-3), az = (v.z - this.prevVel.z) / Math.max(dt, 1e-3);
    const ay = (v.y - this.prevVel.y) / Math.max(dt, 1e-3);
    this.prevVel.copy(v);
    const fwdAcc = clamp(ax * sy + az * cy, -40, 40), sideAcc = clamp(ax * cy - az * sy, -40, 40);

    // 預設姿勢
    let poseX = 0, poseZ = 0, poseY = 0.5, rigY = -0.5;
    let hipsY = 0.255, hipsRy = 0, hipsRz = 0, hipsRx = 0;
    let aL = { x: 0.05, z: -0.32 }, aR = { x: 0.05, z: 0.32 }; // 左手 side=-1 → z 為負往外
    let lL = { x: 0, z: 0 }, lR = { x: 0, z: 0 };
    let headX = 0, headY = 0, headZ = 0;
    let breathe = 1 + Math.sin(t * 2.4) * 0.012;
    let lyingTarget = 0;
    let armLambda = 16;
    const moving = spd > 0.3;

    if (s.ko || s.held) {
      lyingTarget = 1;
      poseX = -Math.PI / 2;
      if (s.held) {
        aL = { x: 1.25 + Math.sin(t * 3) * 0.15, z: -0.3 }; aR = { x: 1.25 + Math.sin(t * 3 + 1) * 0.15, z: 0.3 };
        lL = { x: 1.1 + Math.sin(t * 3 + 2) * 0.12, z: -0.15 }; lR = { x: 1.1 + Math.sin(t * 3 + 0.5) * 0.12, z: 0.15 };
        headX = 0.5;
      } else {
        aL = { x: -0.2, z: -1.35 }; aR = { x: -0.2, z: 1.35 };
        lL = { x: -0.25, z: -0.45 }; lR = { x: -0.25, z: 0.45 };
        headX = -0.15 + Math.sin(t * 1.3) * 0.08; headZ = Math.sin(t * 2) * 0.25;
      }
      breathe = 1 + Math.sin(t * 5) * 0.02;
    } else if (s.diving) {
      poseX = 1.25;
      aL = { x: -3.0, z: -0.2 }; aR = { x: -3.0, z: 0.2 };
      lL = { x: 0.4, z: -0.1 }; lR = { x: 0.3, z: 0.1 };
      headX = -0.6;
      poseY = 0.42;
    } else if (s.swim) {
      poseX = 0.9; poseY = 0.62;
      const p = t * 7;
      aL = { x: -1.7 + Math.sin(p) * 0.75, z: -0.35 }; aR = { x: -1.7 + Math.sin(p + Math.PI) * 0.75, z: 0.35 };
      lL = { x: Math.sin(p * 1.3) * 0.5 + 0.3, z: 0 }; lR = { x: -Math.sin(p * 1.3) * 0.5 + 0.3, z: 0 };
      headX = -0.75;
    } else if (!s.onGround) {
      lL = { x: -0.7, z: -0.1 }; lR = { x: 0.35, z: 0.1 };
      const flap = Math.sin(t * 16) * 0.35;
      aL = { x: -2.3 + flap, z: -0.6 }; aR = { x: -2.3 - flap, z: 0.6 };
      headX = clamp(-v.y * 0.04, -0.3, 0.3);
      poseX = clamp(spd * 0.03, 0, 0.2);
    } else if (s.sitting) {
      poseY = 0.33; lL = { x: -1.5, z: -0.2 }; lR = { x: -1.5, z: 0.2 };
      aL = { x: -0.5, z: -0.2 }; aR = { x: -0.5, z: 0.2 };
      headY = Math.sin(t * 0.6) * 0.3; headZ = Math.sin(t * 0.9) * 0.1;
    } else {
      // 走路 / 跑步 / 待機
      if (moving) {
        this.phase += dt * (5.5 + spd * 1.5);
        const amp = clamp(spd / 5, 0.25, 1.1);
        const ph = this.phase;
        lL.x = Math.sin(ph) * 0.8 * amp; lR.x = -Math.sin(ph) * 0.8 * amp;
        hipsY += Math.abs(Math.cos(ph)) * 0.04 * amp;
        hipsRz = Math.sin(ph) * 0.09 * amp; hipsRy = Math.sin(ph) * 0.12 * amp;
        poseX = clamp(spd * 0.035, 0, 0.22);
        if (spd > 5.4) { // 跑起來手亂揮，憨憨的
          aL = { x: -1.3 + Math.sin(ph) * 1.3, z: -0.85 + Math.cos(ph * 2) * 0.2 };
          aR = { x: -1.3 - Math.sin(ph) * 1.3, z: 0.85 - Math.cos(ph * 2) * 0.2 };
          headZ = Math.sin(ph) * 0.12;
        } else {
          aL = { x: -Math.sin(ph) * 0.85 * amp, z: -0.35 }; aR = { x: Math.sin(ph) * 0.85 * amp, z: 0.35 };
          headZ = Math.sin(ph) * 0.06;
        }
        armLambda = 22;
      } else {
        headY = Math.sin(t * 0.47) * 0.18; headZ = Math.sin(t * 0.31) * 0.07; headX = Math.sin(t * 0.7) * 0.04;
        aL.x += Math.sin(t * 1.1) * 0.05; aR.x += Math.sin(t * 1.1 + 0.5) * 0.05;
      }
      // 表情動作
      if (s.emote === 1) { aR = { x: -2.75, z: -0.15 + Math.sin(t * 13) * 0.5 }; headZ = 0.15; }
      else if (s.emote === 2) {
        const d = t * 7.5;
        hipsRy = Math.sin(d) * 0.5; hipsY += Math.abs(Math.sin(d)) * 0.06;
        aL = { x: -2.4 + Math.sin(d) * 0.7, z: -0.5 }; aR = { x: -2.4 - Math.sin(d) * 0.7, z: 0.5 };
        headZ = Math.sin(d) * 0.3; lL.x = Math.max(0, Math.sin(d)) * -0.5; lR.x = Math.max(0, -Math.sin(d)) * -0.5;
      }
    }

    // 頭暈搖晃
    if (!s.ko && s.dizzy > 40) { headZ += Math.sin(t * 6) * 0.15 * (s.dizzy / 100); hipsRz += Math.sin(t * 3) * 0.05; }

    // 抓 / 舉
    if (!s.ko && !s.held) {
      if (s.holding) { aL = { x: -2.9, z: -0.3 }; aR = { x: -2.9, z: 0.3 }; }
      else if (s.grabbing) { aL = { x: -1.45, z: 0.12 }; aR = { x: -1.45, z: -0.12 }; armLambda = 25; }
    }

    // 釣竿
    const rodOn = !!s.rod && !s.ko && !s.held && !s.swim;
    this.rod.visible = rodOn;
    if (rodOn && !s.holding && this.heldFishT <= 0) {
      const ph = s.fishPhase;
      aR = { x: -0.95, z: 0.05 }; aL = { x: -0.85, z: -0.05 };
      if (ph === 'charge') { aR = { x: -0.95 - s.charge * 1.9, z: 0.1 }; aL = { x: -0.7, z: -0.25 }; hipsRx = -0.15 * s.charge; }
      else if (ph === 'flying') { aR = { x: -0.55, z: 0.05 }; armLambda = 30; }
      else if (ph === 'reel') { aL = { x: -0.95 + Math.sin(t * 13) * 0.28, z: 0.15 + Math.cos(t * 13) * 0.15 }; hipsRx = -0.12; aR.x = -1.05; }
      else if (ph === 'bite') { aR.x += Math.sin(t * 40) * 0.05; }
    }
    // 舉起釣到的魚
    if (this.heldFishT > 0) {
      this.heldFishT -= dt;
      aL = { x: -2.95, z: -0.18 }; aR = { x: -2.95, z: 0.18 };
      this.rod.visible = false;
      if (this.heldFishT <= 0) this.clearHeldItem();
    }

    // 出拳
    if (s.punchCount !== this.lastPunchCount) {
      this.lastPunchCount = s.punchCount; this.punchT = 0; this.punchSide = s.punchCount % 2;
    }
    this.punchT += dt;
    if (this.punchT < 0.32 && !s.ko && !s.held) {
      const p = this.punchT / 0.32;
      const e = p < 0.25 ? p / 0.25 : 1 - smoothstep(0.25, 1, p);
      const arm = this.punchSide ? aL : aR, sgn = this.punchSide ? -1 : 1;
      arm.x = lerp(arm.x, -1.55, e); arm.z = lerp(arm.z, -sgn * 0.12, e);
      hipsRy -= sgn * 0.4 * e;
      poseX += 0.08 * e;
      armLambda = 40;
      (this.punchSide ? this.arms[0] : this.arms[1]).pivot.scale.y = 1 + 0.5 * e;
    } else { this.arms[0].pivot.scale.y = damp(this.arms[0].pivot.scale.y, 1, 20, dt); this.arms[1].pivot.scale.y = damp(this.arms[1].pivot.scale.y, 1, 20, dt); }

    // ---- 套用（平滑）
    this.lying = damp(this.lying, lyingTarget, 10, dt);
    const L = 12;
    this.pose.rotation.x = damp(this.pose.rotation.x, poseX, s.diving ? 14 : L, dt);
    this.pose.rotation.z = damp(this.pose.rotation.z, poseZ, L, dt);
    this.pose.position.y = damp(this.pose.position.y, lerp(poseY, 0.3, this.lying), L, dt);
    this.hips.position.y = damp(this.hips.position.y, hipsY, 20, dt);
    this.hips.rotation.y = damp(this.hips.rotation.y, hipsRy, 18, dt);
    this.hips.rotation.z = damp(this.hips.rotation.z, hipsRz, 14, dt);
    this.hips.rotation.x = damp(this.hips.rotation.x, hipsRx, 14, dt);
    this.body.scale.set(1 / Math.sqrt(breathe), breathe, 1 / Math.sqrt(breathe));
    const [AL, AR] = this.arms;
    AL.pivot.rotation.x = damp(AL.pivot.rotation.x, aL.x, armLambda, dt); AL.pivot.rotation.z = damp(AL.pivot.rotation.z, aL.z, armLambda, dt);
    AR.pivot.rotation.x = damp(AR.pivot.rotation.x, aR.x, armLambda, dt); AR.pivot.rotation.z = damp(AR.pivot.rotation.z, aR.z, armLambda, dt);
    const [LL, LR] = this.legs;
    LL.pivot.rotation.x = damp(LL.pivot.rotation.x, lL.x, 20, dt); LL.pivot.rotation.z = damp(LL.pivot.rotation.z, lL.z, 20, dt);
    LR.pivot.rotation.x = damp(LR.pivot.rotation.x, lR.x, 20, dt); LR.pivot.rotation.z = damp(LR.pivot.rotation.z, lR.z, 20, dt);

    // 頭部慣性晃動（憨憨的大頭）
    const lagX = this.headLagX.update(clamp(-fwdAcc * 0.012, -0.45, 0.45), dt);
    const lagZ = this.headLagZ.update(clamp(sideAcc * 0.012, -0.45, 0.45), dt);
    if (Math.abs(ay) > 60) this.headLagX.kick(clamp(ay * 0.004, -1.2, 1.2));
    this.head.rotation.x = damp(this.head.rotation.x, headX, 10, dt);
    this.neck.rotation.x = lagX; this.neck.rotation.z = lagZ;
    this.head.rotation.y = damp(this.head.rotation.y, headY, 6, dt);
    this.head.rotation.z = damp(this.head.rotation.z, headZ, 8, dt);

    // 耳朵彈跳
    const earFlop = this.earSpring.update(clamp(fwdAcc * 0.01 + (moving ? Math.sin(this.phase * 2) * 0.12 : 0), -0.5, 0.5), dt);
    for (const e of this.ears) { e.pivot.rotation.x = -0.12 + earFlop * 0.8; e.pivot.rotation.z = e.baseZ - e.side * Math.max(0, earFlop) * 0.3 + (s.ko ? -e.side * 0.4 : 0); }

    // 尾巴
    if (this.look.species === 'dog') {
      const wag = s.ko ? 0 : Math.sin(t * (moving ? 16 : 10)) * (s.emote ? 0.6 : 0.35);
      this.tail.rotation.y = wag; this.tail.rotation.x = s.ko ? 0.6 : 0;
    } else {
      this.tailSegs.forEach((g, i) => {
        g.rotation.x = i === 0 ? (s.ko ? -1.3 : -1.0) : (s.ko ? 0.05 : 0.2 + Math.sin(t * 1.7 + i * 0.4) * 0.06);
        g.rotation.z = Math.sin(t * 2.2 - i * 0.55) * (0.1 + i * 0.03) * (s.ko ? 0.2 : 1);
      });
    }
    if (this.tongue) this.tongue.rotation.x = 0.6 + Math.sin(t * (moving ? 14 : 3)) * (moving ? 0.25 : 0.06);

    // 圍巾尾巴飄動
    if (this.scarf && this.scarf.userData.tails.length) {
      const fl = this.scarfSpring.update(clamp(spd * 0.12, 0, 1.0) + (s.onGround ? 0 : 0.4), dt);
      for (const tl of this.scarf.userData.tails) { tl.rotation.x = -fl + Math.sin(t * 9) * 0.04 * spd * 0.2; }
    }

    // 眨眼 / 眼珠亂飄
    this.blinkT -= dt;
    let blink = 1;
    if (this.blinkT < 0.12) blink = 0.12;
    if (this.blinkT < 0) this.blinkT = 2 + Math.random() * 3.5;
    this.eyeT -= dt;
    if (this.eyeT < 0) {
      this.eyeT = 0.6 + Math.random() * 2.2;
      for (const tg of this.eyeTarget) tg.set((Math.random() - 0.5) * 0.02, (Math.random() - 0.5) * 0.016);
      if (Math.random() < 0.3) this.eyeTarget[1].x = this.eyeTarget[0].x + (Math.random() - 0.5) * 0.02; // 偶爾鬥雞眼
    }
    this.eyes.forEach((e, i) => {
      let tx = e.base.x + this.eyeTarget[i].x, ty = e.base.y + this.eyeTarget[i].y;
      if (s.ko || (s.dizzy || 0) > 70) { const a = t * 11 * (i ? 1 : -1); tx = Math.cos(a) * 0.016; ty = Math.sin(a) * 0.016; }
      e.iris.position.x = damp(e.iris.position.x, tx, s.ko ? 40 : 12, dt);
      e.iris.position.y = damp(e.iris.position.y, ty, s.ko ? 40 : 12, dt);
      e.g.scale.y = s.ko ? 1 : damp(e.g.scale.y, blink, 40, dt);
    });

    // 暈眩星星
    const showStars = s.ko || (s.dizzy || 0) > 65;
    this.stars.visible = showStars;
    if (showStars) {
      this.stars.rotation.y += dt * 5;
      this.stars.children.forEach((st, i) => { st.rotation.y = -this.stars.rotation.y; st.visible = s.ko || i === 0; st.position.y = Math.sin(t * 6 + i * 2) * 0.03; });
    }

    // 釣到的魚：在頭上轉
    if (this.heldItem) { this.heldItem.rotation.y = Math.sin(t * 2) * 0.4; this.heldItem.position.y = 0.4 + Math.sin(t * 8) * 0.02; }
  }

  dispose() {
    this.disposeModel();
    if (this.nameTag) { this.nameTag.material.map.dispose(); this.nameTag.material.dispose(); }
    if (this.root.parent) this.root.parent.remove(this.root);
  }
}
