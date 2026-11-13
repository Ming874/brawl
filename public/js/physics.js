// 簡單的角色物理：重力、地形、方塊/圓柱碰撞、游泳
export const RADIUS = 0.34;
export const HEIGHT = 1.2;
export const GRAVITY = 22;
export const SWIM_DEPTH = 0.62; // 游泳時腳在水面下多少

// e: { pos, vel, onGround, swim }
export function stepPhysics(e, dt, world, opts = {}) {
  const prevY = e.pos.y;
  const wasGround = e.onGround;
  e.onGround = false;

  if (e.swim) {
    // 浮力：拉回水面附近
    const target = world.waterLevel - SWIM_DEPTH;
    e.vel.y += (target - e.pos.y) * 30 * dt;
    e.vel.y *= 1 - 4 * dt;
  } else {
    e.vel.y -= GRAVITY * dt;
  }
  if (e.vel.y < -30) e.vel.y = -30;

  e.pos.x += e.vel.x * dt;
  e.pos.y += e.vel.y * dt;
  e.pos.z += e.vel.z * dt;

  // 方塊（碼頭、箱子、擂台）
  for (const b of world.boxes) {
    if (e.pos.y >= b.max[1] || e.pos.y + HEIGHT <= b.min[1]) continue;
    const cx = Math.max(b.min[0], Math.min(e.pos.x, b.max[0]));
    const cz = Math.max(b.min[2], Math.min(e.pos.z, b.max[2]));
    const dx = e.pos.x - cx, dz = e.pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= RADIUS * RADIUS) continue;
    const d = Math.sqrt(d2);
    // 從上方落下 / 小台階 → 站上去
    if (prevY >= b.max[1] - 0.32 && e.vel.y <= 0.5 && d < RADIUS * 0.75) {
      e.pos.y = b.max[1]; if (e.vel.y < 0) e.vel.y = 0; e.onGround = true; e.groundBox = b;
      continue;
    }
    // 頭撞到底部
    if (prevY + HEIGHT <= b.min[1] + 0.05 && e.vel.y > 0) { e.pos.y = b.min[1] - HEIGHT; e.vel.y = 0; continue; }
    // 側面推出去
    if (d > 1e-5) {
      const push = (RADIUS - d) / d;
      e.pos.x += dx * push; e.pos.z += dz * push;
      const vn = (e.vel.x * dx + e.vel.z * dz) / d;
      if (vn < 0) { e.vel.x -= (dx / d) * vn; e.vel.z -= (dz / d) * vn; }
    } else {
      // 中心在方塊內：往最近的面推
      const opts4 = [
        [e.pos.x - b.min[0], -1, 0], [b.max[0] - e.pos.x, 1, 0], [e.pos.z - b.min[2], 0, -1], [b.max[2] - e.pos.z, 0, 1],
      ].sort((a, c) => a[0] - c[0]);
      const [dist, nx, nz] = opts4[0];
      if (b.max[1] - e.pos.y < 0.35) { e.pos.y = b.max[1]; e.vel.y = Math.max(0, e.vel.y); e.onGround = true; }
      else { e.pos.x += nx * (dist + RADIUS); e.pos.z += nz * (dist + RADIUS); }
    }
  }

  // 圓柱（樹、石頭、木桶）
  for (const c of world.circles) {
    if (c.top !== undefined && e.pos.y >= c.top - 0.05) {
      const dx = e.pos.x - c.x, dz = e.pos.z - c.z;
      if (dx * dx + dz * dz < c.r * c.r && prevY >= c.top - 0.3 && e.vel.y <= 0) { e.pos.y = c.top; e.vel.y = 0; e.onGround = true; }
      continue;
    }
    const dx = e.pos.x - c.x, dz = e.pos.z - c.z;
    const rr = RADIUS + c.r;
    const d2 = dx * dx + dz * dz;
    if (d2 >= rr * rr || d2 < 1e-8) continue;
    const d = Math.sqrt(d2), push = (rr - d) / d;
    e.pos.x += dx * push; e.pos.z += dz * push;
  }

  // 世界邊界
  const r = Math.hypot(e.pos.x, e.pos.z);
  if (r > world.boundsR) { e.pos.x *= world.boundsR / r; e.pos.z *= world.boundsR / r; }

  // 地形
  const gh = world.groundHeight(e.pos.x, e.pos.z);
  if (e.pos.y <= gh) {
    e.pos.y = gh; if (e.vel.y < 0) e.vel.y = 0; e.onGround = true;
  } else if (wasGround && !e.onGround && e.vel.y <= 0 && e.pos.y - gh < 0.25 && !e.swim) {
    e.pos.y = gh; e.onGround = true; // 下坡貼地
  }

  // 水
  const deep = world.waterLevel - gh > SWIM_DEPTH + 0.15;
  if (!opts.noSwim && deep && e.pos.y < world.waterLevel - SWIM_DEPTH + 0.05 && !e.onGround) {
    if (!e.swim) { e.swim = true; e.justSplashed = true; }
  }
  if (e.swim && (!deep || e.onGround || e.pos.y > world.waterLevel - SWIM_DEPTH + 0.6)) e.swim = false;
  if (e.swim) e.onGround = false;
  e.inShallow = !e.swim && e.pos.y < world.waterLevel - 0.05;
}

// 角色之間互相推開（只移動自己）
export function pushApart(e, others) {
  for (const o of others) {
    if (o === e || o.hidden) continue;
    const dy = Math.abs(o.pos.y - e.pos.y);
    if (dy > HEIGHT * 0.9) continue;
    const dx = e.pos.x - o.pos.x, dz = e.pos.z - o.pos.z;
    const rr = RADIUS * 2;
    const d2 = dx * dx + dz * dz;
    if (d2 >= rr * rr) continue;
    const d = Math.sqrt(d2) || 0.01;
    const push = (rr - d) * 0.5;
    e.pos.x += (dx / d) * push; e.pos.z += (dz / d) * push;
  }
}
