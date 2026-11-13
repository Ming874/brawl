// 第三人稱鏡頭
import * as THREE from 'three';
import { clamp, damp, dampAngle } from './util.js';

export class FollowCamera {
  constructor(camera) {
    this.cam = camera;
    this.yaw = 0; this.pitch = 0.32; this.dist = 5.2; this.targetDist = 5.2;
    this.focus = new THREE.Vector3();
    this.shake = 0;
    this.mode = 'game';
  }
  forward(out) { return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }
  right(out) { return out.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw)); }
  addShake(a) { this.shake = Math.min(0.5, this.shake + a); }

  update(dt, input, focusPos, world, sens = 1) {
    if (input.locked || input.dragging) {
      this.yaw -= input.dx * 0.0025 * sens;
      this.pitch = clamp(this.pitch + input.dy * 0.0022 * sens, -0.35, 1.25);
    }
    if (input.wheel) this.targetDist = clamp(this.targetDist + input.wheel * 0.6, 2.4, 11);
    this.dist = damp(this.dist, this.targetDist, 10, dt);
    this.focus.x = damp(this.focus.x, focusPos.x, 14, dt);
    this.focus.z = damp(this.focus.z, focusPos.z, 14, dt);
    this.focus.y = damp(this.focus.y, focusPos.y + 1.05, 8, dt);
    if (this.focus.distanceToSquared(focusPos) > 100) this.focus.copy(focusPos).y += 1.05;
    this.place(world);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 1.5);
      this.cam.position.x += (Math.random() - 0.5) * this.shake * 0.3;
      this.cam.position.y += (Math.random() - 0.5) * this.shake * 0.3;
    }
  }

  place(world) {
    const cp = Math.cos(this.pitch);
    const off = new THREE.Vector3(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp).multiplyScalar(this.dist);
    const pos = this.focus.clone().add(off);
    if (world) {
      const gh = Math.max(world.groundHeight(pos.x, pos.z), world.waterLevel) + 0.35;
      if (pos.y < gh) pos.y = gh;
    }
    this.cam.position.copy(pos);
    this.cam.lookAt(this.focus);
  }

  // 主選單：繞著角色慢慢轉
  orbit(dt, center, { dist = 4.2, height = 1.0, speed = 0.12, offsetX = 0, input = null, lookY = 0.7 } = {}) {
    if (input && input.dragging) this.yaw -= input.dx * 0.006;
    else this.yaw += speed * dt;
    this.dist = damp(this.dist, dist, 4, dt);
    const tgt = new THREE.Vector3(center.x, center.y + lookY, center.z);
    const pos = new THREE.Vector3(center.x + Math.sin(this.yaw) * this.dist, center.y + height, center.z + Math.cos(this.yaw) * this.dist);
    this.cam.position.lerp(pos, 1 - Math.exp(-6 * dt));
    this.focus.lerp(tgt, 1 - Math.exp(-6 * dt));
    this.cam.lookAt(this.focus);
    if (offsetX) { // 讓角色偏到畫面一側
      this.cam.setViewOffset(innerWidth, innerHeight, -innerWidth * offsetX, 0, innerWidth, innerHeight);
    } else this.cam.clearViewOffset();
  }
}
