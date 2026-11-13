// 電腦玩家（由房主的電腦負責控制）
import * as THREE from 'three';
import { rand } from './util.js';
import { HALF } from './world/arena.js';

export class BotBrain {
  constructor(game, ent) {
    this.game = game; this.ent = ent;
    this.punchT = rand(0.3, 0.8); this.jumpT = rand(3, 8); this.diveT = rand(2, 5);
    this.wander = null; this.wanderT = 0; this.idleT = 0;
    this.holdT = 0; this.grabWant = 0; this.targetId = null; this.retargetT = 0;
    this.grudge = null; this.grudgeT = 0;
    this.skill = rand(0.75, 1.1);
  }

  think(dt) {
    const g = this.game, e = this.ent;
    const inp = { move: new THREE.Vector3(), run: false, jump: false, punch: false, grab: false, dive: false, struggle: false, emote: 0 };
    if (e.frozen) return inp;
    if (e.heldBy) { inp.struggle = Math.random() < dt * 7 * this.skill; return inp; }
    if (e.ko > 0) return inp;
    this.punchT -= dt; this.jumpT -= dt; this.diveT -= dt; this.retargetT -= dt; this.grudgeT -= dt;
    if (e.lastAttacker && g.time - e.lastHit < 0.1) { this.grudge = e.lastAttacker; this.grudgeT = 10; }

    const brawl = g.world.name === 'arena';
    const out = g.isOutOfPlay(e);
    if (out) { // 掉到水裡就慢慢游
      if (Math.random() < dt * 0.5) this.wander = new THREE.Vector3(rand(-20, 20), 0, rand(-20, 20));
      if (this.wander) this.steer(inp, this.wander, false);
      return inp;
    }

    let target = null;
    if (brawl) {
      if (this.retargetT <= 0 || !g.entities.get(this.targetId)) {
        this.retargetT = rand(2, 4);
        let best = null, bd = 1e9;
        for (const o of g.entities.values()) {
          if (o === e || g.isOutOfPlay(o) || o.heldBy) continue;
          let d = o.pos.distanceTo(e.pos);
          if (o.ko > 0) d *= 0.5;
          if (o.id === this.grudge && this.grudgeT > 0) d *= 0.6;
          if (d < bd) { bd = d; best = o; }
        }
        this.targetId = best ? best.id : null;
      }
      target = g.entities.get(this.targetId);
    } else if (this.grudge && this.grudgeT > 0) {
      target = g.entities.get(this.grudge);
    }

    // 抓著人：往最近的擂台邊走，然後丟出去
    if (e.holding) {
      this.holdT += dt;
      inp.grab = true;
      if (brawl) {
        const p = e.pos;
        const edges = [new THREE.Vector3(HALF + 2, 0, p.z), new THREE.Vector3(-HALF - 2, 0, p.z), new THREE.Vector3(p.x, 0, HALF + 2), new THREE.Vector3(p.x, 0, -HALF - 2)];
        edges.sort((a, b) => a.distanceTo(p) - b.distanceTo(p));
        const edge = edges[0];
        this.steer(inp, edge, true);
        const distEdge = Math.min(HALF - Math.abs(p.x), HALF - Math.abs(p.z));
        if (distEdge < 1.6 || this.holdT > 3.5) { e.yaw = Math.atan2(edge.x - p.x, edge.z - p.z); inp.punch = true; this.holdT = 0; }
      } else if (this.holdT > 2) { inp.punch = true; this.holdT = 0; }
      return inp;
    }
    this.holdT = 0;

    if (target) {
      const d = target.pos.distanceTo(e.pos);
      this.steer(inp, target.pos, d > 3);
      if (d < 1.15) {
        inp.move.multiplyScalar(0.2);
        const wantGrab = target.ko > 0 || (brawl && Math.random() < dt * 0.4);
        if (wantGrab) { this.grabWant = 0.6; }
        if (this.grabWant > 0) { this.grabWant -= dt; inp.grab = true; }
        else if (this.punchT <= 0) { inp.punch = true; this.punchT = rand(0.28, 0.7) / this.skill; }
      } else if (d < 3.2 && this.diveT <= 0 && target.ko <= 0) {
        if (Math.random() < 0.35) inp.dive = true;
        this.diveT = rand(2.5, 6);
      }
    } else {
      // 閒晃
      this.wanderT -= dt;
      if (!this.wander || this.wanderT <= 0 || e.pos.distanceTo(this.wander) < 1) {
        this.wanderT = rand(4, 9);
        if (Math.random() < 0.35) { this.wander = null; this.idleT = rand(2, 5); if (Math.random() < 0.4) inp.emote = 1 + Math.floor(Math.random() * 3); }
        else {
          const a = Math.random() * Math.PI * 2, r = brawl ? rand(0, 5) : rand(27, 40);
          this.wander = new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
          if (!brawl && Math.random() < 0.4) this.wander.set(rand(-1, 1), 0, rand(9, 22));
        }
      }
      if (this.wander) this.steer(inp, this.wander, false);
    }

    // 擂台邊緣別自己掉下去
    if (brawl) {
      const p = e.pos, m = HALF - 1.3;
      if (Math.abs(p.x) > m && Math.sign(inp.move.x) === Math.sign(p.x)) inp.move.x = -Math.sign(p.x) * 0.5;
      if (Math.abs(p.z) > m && Math.sign(inp.move.z) === Math.sign(p.z)) inp.move.z = -Math.sign(p.z) * 0.5;
    }
    if (this.jumpT <= 0) { if (Math.random() < 0.5) inp.jump = true; this.jumpT = rand(3, 9); }
    if (e.swim) inp.jump = Math.random() < dt * 2;
    return inp;
  }

  steer(inp, to, run) {
    const e = this.ent;
    const d = new THREE.Vector3(to.x - e.pos.x, 0, to.z - e.pos.z);
    if (d.lengthSq() > 0.04) inp.move.copy(d.normalize());
    inp.run = run;
  }
}
