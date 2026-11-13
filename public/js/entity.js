// 遊戲中的角色（自己、電腦玩家、其他連線玩家）
import * as THREE from 'three';
import { Character } from './character.js';
import { stepPhysics, pushApart } from './physics.js';
import { clamp, damp, dampAngle } from './util.js';

export const PHASES = ['', 'idle', 'charge', 'flying', 'wait', 'bite', 'reel', 'catch'];
const r2 = v => Math.round(v * 100) / 100;
const UP = new THREE.Vector3(0, 1, 0);

const bobberMats = {};
function bobberMesh() {
  if (!bobberMats.red) {
    bobberMats.red = new THREE.MeshPhysicalMaterial({ color: 0xff3b2f, roughness: 0.3, clearcoat: 1 });
    bobberMats.white = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.3, clearcoat: 1 });
  }
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.07, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), bobberMats.red);
  const bot = new THREE.Mesh(new THREE.SphereGeometry(0.07, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), bobberMats.white);
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.12, 5), bobberMats.red); ant.position.y = 0.1;
  g.add(top, bot, ant);
  return g;
}

export class Entity {
  constructor(game, info, owned) {
    this.game = game;
    this.id = info.id; this.name = info.name; this.isBot = !!info.bot; this.owned = owned;
    this.look = info.look;
    this.isMe = info.id === game.myId;
    this.char = new Character(info.look, { name: this.isMe ? null : info.name, nameColor: info.bot ? '#d6ecff' : '#ffffff' });
    game.scene.add(this.char.root);

    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3(); this.yaw = 0;
    this.renderPos = new THREE.Vector3(); this.renderYaw = 0;
    this.onGround = true; this.swim = false; this.inShallow = false;

    this.dizzy = 0; this.lastHit = -99; this.ko = 0; this.stun = 0; this.lastAttacker = null;
    this.punchCount = 0; this.punchCD = 0; this.pendingHit = -1;
    this.grabbing = false; this.holding = null; this.holdT = 0; this.heldBy = null; this.heldT = 0; this.struggle = 0;
    this.diving = 0; this.diveCD = 0; this.diveHit = new Set(); this.diveAir = 0;
    this.emote = 0;
    this.out = false; this.frozen = false; this.respawnT = 0;
    this.rod = false; this.fishPhase = ''; this.charge = 0; this.bobber = null;
    this.stepT = 0;

    this.netPos = new THREE.Vector3(); this.netVel = new THREE.Vector3(); this.netYaw = 0; this.netT = 0; this.gotState = false;
    this.netBobber = new THREE.Vector3(); this.renderBobber = new THREE.Vector3();
  }

  setInfo(info) {
    if (info.name !== this.name) { this.name = info.name; if (!this.isMe) this.char.setName(info.name, this.isBot ? '#d6ecff' : '#ffffff'); }
    if (JSON.stringify(info.look) !== JSON.stringify(this.look)) { this.look = info.look; this.char.setLook(info.look); }
  }

  teleport(p, yaw = this.yaw) {
    this.pos.copy(p); this.vel.set(0, 0, 0); this.yaw = yaw;
    this.renderPos.copy(p); this.renderYaw = yaw;
    this.netPos.copy(p); this.netVel.set(0, 0, 0); this.netYaw = yaw;
    this.swim = false; this.onGround = true;
  }

  resetCombat() {
    this.dizzy = 0; this.ko = 0; this.stun = 0; this.grabbing = false; this.holding = null; this.heldBy = null;
    this.diving = 0; this.emote = 0; this.out = false; this.struggle = 0; this.pendingHit = -1;
  }

  forward(out = new THREE.Vector3()) { return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }

  // 被抓住時的位置（在抓人者頭上）
  heldAnchor(holder, out) {
    const f = new THREE.Vector3(Math.sin(holder.renderYaw), 0, Math.cos(holder.renderYaw));
    return out.copy(holder.renderPos).addScaledVector(f, 0.2).addScaledVector(UP, 1.32);
  }

  // ------------------------------------------------------------ 自己控制的角色
  simulate(dt, inp) {
    const g = this.game, now = g.time;
    this.punchCD -= dt; this.diveCD -= dt; this.stun -= dt;
    if (this.ko > 0) {
      this.ko -= dt;
      if (this.ko <= 0) { this.ko = 0; this.dizzy = 0; this.stun = 0.25; if (!this.heldBy) this.vel.y = 4; }
    }
    if (now - this.lastHit > 2.5) this.dizzy = Math.max(0, this.dizzy - 14 * dt);

    // 被抓住
    if (this.heldBy) {
      const h = g.entities.get(this.heldBy);
      this.heldT += dt;
      const holderLost = !h || (this.heldT > 0.8 && h.holding !== this.id);
      if (holderLost || this.heldT > 8) { this.heldBy = null; this.vel.set(0, 2, 0); }
      else {
        this.heldAnchor(h, this.pos);
        this.yaw = h.renderYaw + Math.PI / 2;
        this.vel.set(0, 0, 0);
        this.onGround = false; this.swim = false;
        if (!this.ko) {
          if (inp.struggle) this.struggle += 0.11;
          this.struggle = Math.max(0, this.struggle - dt * 0.3);
          if (this.struggle >= 1) {
            const f = new THREE.Vector3(Math.sin(h.renderYaw), 0, Math.cos(h.renderYaw));
            g.emitEv({ k: 'free', src: this.id, tgt: h.id });
            this.heldBy = null; this.struggle = 0;
            this.vel.set(-f.x * 3, 5, -f.z * 3); this.stun = 0.2;
          }
        }
        this.renderPos.copy(this.pos); this.renderYaw = this.yaw;
        return;
      }
    }

    const fishingBusy = this.rod && ['charge', 'flying', 'bite', 'reel', 'catch'].includes(this.fishPhase);
    const control = this.ko <= 0 && this.stun <= 0 && !this.frozen && this.diving <= 0;
    const mv = inp.move || new THREE.Vector3();
    let maxSpd = inp.run ? 6.6 : 4.1;
    if (this.swim) maxSpd *= 0.55;
    if (this.inShallow) maxSpd *= 0.75;
    if (this.holding) maxSpd *= 0.8;
    if (fishingBusy || this.emote === 3) maxSpd = 0;
    const dx = control ? mv.x * maxSpd : 0, dz = control ? mv.z * maxSpd : 0;
    let accel = this.onGround ? 30 : this.swim ? 10 : 7;
    if (this.diving > 0) accel = 0;
    if ((this.ko > 0 || this.stun > 0) && this.onGround) { this.vel.x *= 1 - Math.min(1, 6 * dt); this.vel.z *= 1 - Math.min(1, 6 * dt); }
    else {
      this.vel.x += clamp(dx - this.vel.x, -accel * dt, accel * dt);
      this.vel.z += clamp(dz - this.vel.z, -accel * dt, accel * dt);
    }
    const moving = mv.lengthSq() > 0.01;
    if (control && moving && maxSpd > 0) this.yaw = dampAngle(this.yaw, Math.atan2(mv.x, mv.z), 12, dt);
    if (control && inp.faceYaw !== undefined && inp.faceYaw !== null) this.yaw = dampAngle(this.yaw, inp.faceYaw, 14, dt);
    if (moving && this.emote) this.emote = 0;
    if (control && inp.emote) this.emote = this.emote === inp.emote ? 0 : inp.emote;

    // 跳
    if (control && inp.jump && !fishingBusy) {
      if (this.onGround) { this.vel.y = 7.4; this.onGround = false; this.emote = 0; g.sfx('jump', this); }
      else if (this.swim) { this.vel.y = 8.2; this.swim = false; g.sfx('jump', this); }
    }

    // 出拳 / 丟
    if (control && inp.punch && this.punchCD <= 0 && !this.rod) {
      this.emote = 0;
      if (this.holding) this.throwHeld();
      else { this.punchCount++; this.punchCD = 0.28; this.pendingHit = 0.09; g.sfx('whoosh', this); }
    }
    if (this.pendingHit >= 0) { this.pendingHit -= dt; if (this.pendingHit < 0) this.doPunchHit(); }

    // 抓
    if (control && inp.grab && !this.rod) {
      if (!this.holding) { this.grabbing = true; this.tryGrab(); }
    } else if (!inp.grab || this.ko > 0) {
      this.grabbing = false;
      if (this.holding) this.releaseHeld();
    }
    if (this.holding) {
      this.holdT += dt;
      const t = g.entities.get(this.holding);
      if (!t || (this.holdT > 0.8 && t.heldBy !== this.id)) this.holding = null;
    }

    // 飛撲
    if (control && inp.dive && this.diveCD <= 0 && (this.onGround || this.swim) && !this.rod && !this.holding) {
      const f = this.forward();
      this.diving = 0.75; this.diveAir = 0; this.diveCD = 1.5; this.diveHit.clear(); this.emote = 0;
      this.vel.set(f.x * 9, 4.6, f.z * 9);
      g.sfx('whoosh', this);
    }
    if (this.diving > 0) {
      this.diving -= dt; this.diveAir += dt;
      this.checkDiveHit();
      if ((this.onGround && this.diveAir > 0.15) || this.diving <= 0) { this.diving = 0; this.stun = 0.45; }
    }

    // 物理
    const wasGround = this.onGround;
    stepPhysics(this, dt, g.world);
    if (!wasGround && this.onGround && this.vel.y <= 0) g.sfx('land', this);
    if (this.justSplashed) { this.justSplashed = false; g.emitEv({ k: 'splash', src: this.id, p: [r2(this.pos.x), g.world.waterLevel, r2(this.pos.z)], big: 1 }); }
    if (this.swim && this.rod) { this.rod = false; this.fishPhase = ''; this.bobber = null; }
    const others = [];
    for (const e of g.entities.values()) if (e !== this && !e.heldBy && e.id !== this.holding) others.push(e);
    pushApart(this, others);

    // 腳步聲
    if (this.onGround && Math.hypot(this.vel.x, this.vel.z) > 1) {
      this.stepT -= dt * Math.hypot(this.vel.x, this.vel.z);
      if (this.stepT < 0) { this.stepT = 1.3; g.sfx('step', this); }
    }

    this.renderPos.copy(this.pos); this.renderYaw = this.yaw;
  }

  targets(range, minDot) {
    const f = this.forward(), res = [];
    for (const e of this.game.entities.values()) {
      if (e === this || e.heldBy) continue;
      if (e.id === this.holding) continue;
      if (this.game.isOutOfPlay && this.game.isOutOfPlay(e) && !this.game.isOutOfPlay(this)) continue;
      const dx = e.renderPos.x - this.pos.x, dz = e.renderPos.z - this.pos.z;
      const dy = e.renderPos.y - this.pos.y;
      const d = Math.hypot(dx, dz);
      if (d > range || Math.abs(dy) > 1.0) continue;
      const dot = d < 0.01 ? 1 : (dx * f.x + dz * f.z) / d;
      if (dot < minDot) continue;
      res.push({ e, d, dx: d ? dx / d : f.x, dz: d ? dz / d : f.z });
    }
    res.sort((a, b) => a.d - b.d);
    return res;
  }

  doPunchHit() {
    const t = this.targets(1.2, 0.3)[0];
    if (!t) return;
    const f = this.forward();
    this.game.emitEv({ k: 'hit', src: this.id, tgt: t.e.id, d: [r2(f.x * 0.6 + t.dx * 0.4), r2(f.z * 0.6 + t.dz * 0.4)], pw: 3.4, dz: 21 });
  }

  checkDiveHit() {
    for (const t of this.targets(1.0, 0.1)) {
      if (this.diveHit.has(t.e.id)) continue;
      this.diveHit.add(t.e.id);
      const f = this.forward();
      this.game.emitEv({ k: 'hit', src: this.id, tgt: t.e.id, d: [r2(f.x), r2(f.z)], pw: 7.5, dz: 40 });
      this.vel.x *= 0.3; this.vel.z *= 0.3;
    }
  }

  tryGrab() {
    const t = this.targets(1.05, 0.25).find(x => !x.e.heldBy && !x.e.holding);
    if (!t) return;
    this.holding = t.e.id; this.holdT = 0; this.grabbing = false;
    this.game.emitEv({ k: 'grab', src: this.id, tgt: t.e.id });
  }
  releaseHeld() {
    const id = this.holding; this.holding = null;
    this.game.emitEv({ k: 'release', src: this.id, tgt: id });
  }
  throwHeld() {
    const id = this.holding; this.holding = null;
    const f = this.forward();
    this.punchCD = 0.45;
    this.game.emitEv({ k: 'throw', src: this.id, tgt: id, d: [r2(f.x), r2(f.z)], pw: 10.5 });
  }

  // ------------------------------------------------------------ 收到事件（只有擁有者處理）
  applyHit(ev) {
    if (this.heldBy) { this.dizzy = Math.min(99, this.dizzy + ev.dz * 0.5); return; }
    const [x, z] = ev.d;
    const kbMul = this.ko > 0 ? 1.3 : 1 + this.dizzy / 160; // 越暈飛越遠
    this.vel.x += x * ev.pw * kbMul; this.vel.z += z * ev.pw * kbMul;
    this.vel.y = Math.max(this.vel.y, 2.4 + ev.pw * 0.3);
    this.onGround = false;
    this.lastHit = this.game.time; this.lastAttacker = ev.src;
    this.stun = Math.max(this.stun, 0.22);
    this.emote = 0;
    if (this.ko <= 0) {
      this.dizzy += ev.dz;
      if (this.dizzy >= 100) this.knockOut();
    }
    this.game.onOwnedHit(this, ev);
  }
  knockOut() {
    this.ko = 4.2; this.dizzy = 0;
    if (this.holding) this.releaseHeld();
    this.grabbing = false;
    this.game.emitEv({ k: 'ko', src: this.id });
  }
  onGrabbed(src) {
    if (this.heldBy || this.out) return;
    this.heldBy = src; this.heldT = 0; this.struggle = 0; this.emote = 0; this.diving = 0;
    if (this.holding) this.releaseHeld();
    this.game.onOwnedHit(this, { k: 'grab', src });
  }
  onReleased(src) { if (this.heldBy === src) { this.heldBy = null; this.vel.set(0, 2, 0); } }
  onThrown(ev) {
    if (this.heldBy !== ev.src) return;
    const h = this.game.entities.get(ev.src);
    if (h) this.heldAnchor(h, this.pos);
    this.heldBy = null;
    this.vel.set(ev.d[0] * ev.pw, 6.5, ev.d[1] * ev.pw);
    this.stun = 0.7; this.lastHit = this.game.time; this.lastAttacker = ev.src;
    if (this.ko <= 0) { this.dizzy += 18; if (this.dizzy >= 100) this.knockOut(); }
  }
  onFreed(src) { if (this.holding === src) { this.holding = null; this.stun = 0.35; } }

  // ------------------------------------------------------------ 網路
  packState() {
    let f = 0;
    if (this.onGround) f |= 1; if (this.swim) f |= 2; if (this.ko > 0) f |= 4; if (this.grabbing) f |= 8;
    if (this.diving > 0) f |= 16; if (this.rod) f |= 32; if (this.out) f |= 64;
    const m = { t: 'st', e: this.id, p: [r2(this.pos.x), r2(this.pos.y), r2(this.pos.z)], v: [r2(this.vel.x), r2(this.vel.y), r2(this.vel.z)], y: r2(this.yaw), f, pc: this.punchCount };
    if (this.holding) m.h = this.holding;
    if (this.heldBy) m.hb = this.heldBy;
    if (this.emote) m.em = this.emote;
    if (this.dizzy > 1) m.dz = Math.round(this.dizzy);
    if (this.rod) { m.fp = PHASES.indexOf(this.fishPhase); if (this.charge) m.ch = r2(this.charge); }
    if (this.bobber) m.b = [r2(this.bobber.x), r2(this.bobber.y), r2(this.bobber.z)];
    return m;
  }
  applyState(m) {
    this.netPos.set(m.p[0], m.p[1], m.p[2]);
    this.netVel.set(m.v[0], m.v[1], m.v[2]);
    this.netYaw = m.y; this.netT = this.game.time;
    const f = m.f | 0;
    this.onGround = !!(f & 1); this.swim = !!(f & 2); this.ko = f & 4 ? 1 : 0; this.grabbing = !!(f & 8);
    this.diving = f & 16 ? 1 : 0; this.rod = !!(f & 32); this.out = !!(f & 64);
    this.punchCount = m.pc | 0;
    this.holding = m.h || null; this.heldBy = m.hb || null;
    this.emote = m.em | 0; this.dizzy = m.dz | 0;
    this.fishPhase = this.rod ? PHASES[m.fp | 0] || 'idle' : ''; this.charge = m.ch || 0;
    if (m.b) { this.netBobber.set(m.b[0], m.b[1], m.b[2]); if (!this.bobber) { this.bobber = this.netBobber.clone(); this.renderBobber.copy(this.netBobber); } }
    else this.bobber = null;
    if (!this.gotState) { this.gotState = true; this.renderPos.copy(this.netPos); this.renderYaw = this.netYaw; }
  }
  updateRemote(dt) {
    const g = this.game;
    const h = this.heldBy ? g.entities.get(this.heldBy) : null;
    if (h) {
      this.heldAnchor(h, this.renderPos);
      this.renderYaw = h.renderYaw + Math.PI / 2;
    } else {
      const ext = Math.min(g.time - this.netT, 0.2);
      const tx = this.netPos.x + this.netVel.x * ext, ty = this.netPos.y + this.netVel.y * ext * 0.5, tz = this.netPos.z + this.netVel.z * ext;
      if (Math.hypot(tx - this.renderPos.x, tz - this.renderPos.z) > 6) this.renderPos.set(tx, ty, tz);
      this.renderPos.x = damp(this.renderPos.x, tx, 14, dt);
      this.renderPos.y = damp(this.renderPos.y, ty, 14, dt);
      this.renderPos.z = damp(this.renderPos.z, tz, 14, dt);
      this.renderYaw = dampAngle(this.renderYaw, this.netYaw, 14, dt);
    }
    this.pos.copy(this.renderPos);
    this.vel.copy(this.netVel);
    this.yaw = this.renderYaw;
    if (this.bobber) { this.renderBobber.lerp(this.netBobber, 1 - Math.exp(-12 * dt)); this.bobber.copy(this.renderBobber); }
  }

  // ------------------------------------------------------------ 畫面
  animate(dt) {
    const c = this.char;
    c.root.position.copy(this.renderPos);
    c.root.rotation.y = this.renderYaw;
    c.update(dt, {
      vel: this.vel, yaw: this.renderYaw, onGround: this.onGround, swim: this.swim, ko: this.ko > 0, held: !!this.heldBy,
      grabbing: this.grabbing, holding: !!this.holding, diving: this.diving > 0, punchCount: this.punchCount, emote: this.emote,
      rod: this.rod, fishPhase: this.fishPhase, charge: this.charge, dizzy: this.dizzy, sitting: this.emote === 3,
    });
    this.updateBobber(dt);
  }

  updateBobber(dt) {
    const show = this.rod && this.bobber && ['flying', 'wait', 'bite', 'reel'].includes(this.fishPhase);
    if (!show) { if (this.bobberObj) { this.bobberObj.visible = false; this.line.visible = false; } return; }
    if (!this.bobberObj) {
      this.bobberObj = bobberMesh();
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(24 * 3), 3));
      this.line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75 }));
      this.line.frustumCulled = false;
      this.game.scene.add(this.bobberObj, this.line);
    }
    const t = this.game.time;
    const b = this.bobberObj; b.visible = true; this.line.visible = true;
    b.position.copy(this.bobber);
    if (this.fishPhase === 'wait') b.position.y += Math.sin(t * 2.5) * 0.02;
    if (this.fishPhase === 'bite') b.position.y -= 0.1 + Math.abs(Math.sin(t * 25)) * 0.06;
    if (this.fishPhase === 'reel') { b.position.y -= 0.05; b.position.x += Math.sin(t * 31) * 0.04; b.position.z += Math.cos(t * 27) * 0.04; }
    const a = this.char.getRodTip(new THREE.Vector3());
    const p = this.line.geometry.attributes.position;
    const sag = this.fishPhase === 'reel' ? 0.03 : this.fishPhase === 'flying' ? 0.1 : 0.5;
    for (let i = 0; i < 24; i++) {
      const k = i / 23;
      p.setXYZ(i, a.x + (b.position.x - a.x) * k, a.y + (b.position.y + 0.06 - a.y) * k - sag * 4 * k * (1 - k), a.z + (b.position.z - a.z) * k);
    }
    p.needsUpdate = true;
  }

  dispose() {
    this.char.dispose();
    if (this.bobberObj) { this.game.scene.remove(this.bobberObj, this.line); this.line.geometry.dispose(); }
  }
}
