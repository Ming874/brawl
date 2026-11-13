// 釣魚玩法（只控制自己的角色）
import * as THREE from 'three';
import { FISH_BY_ID, rollFish, rollSize, stars } from './fish.js';
import { clamp, rand } from './util.js';

export class Fishing {
  constructor(game) {
    this.game = game;
    this.ui = {
      cast: document.getElementById('castMeter'), castBar: document.querySelector('#castMeter .bar i'),
      hint: document.getElementById('fishHint'), reel: document.getElementById('reelUI'),
      tension: document.querySelector('#reelUI .tension'), tensionFill: document.querySelector('#reelUI .tension-fill'),
      fishIcon: document.querySelector('#reelUI .fish-icon'), card: document.getElementById('catchCard'),
    };
    this.reset();
  }
  reset() {
    this.chargeDir = 1; this.flightT = 0; this.flightDur = 1; this.waitT = 0; this.biteT = 0; this.nibbleT = 0;
    this.from = new THREE.Vector3(); this.to = new THREE.Vector3(); this.depth = 0;
    this.fish = null; this.progress = 0; this.tension = 0; this.pulling = false; this.pullT = 0; this.tickT = 0;
    this.hintT = 0; this.catchT = 0; this.cardT = 0; this.faceYaw = null;
  }

  canFish() { return this.game.world && this.game.world.name === 'lake'; }
  get busy() { const e = this.game.me; return !!(e && e.rod && e.fishPhase && e.fishPhase !== 'idle'); }

  toggleRod() {
    const e = this.game.me;
    if (!e) return;
    if (!this.canFish()) { this.hint('這裡不能釣魚喔！切換到「湖畔釣魚」吧', 2); return; }
    if (e.swim) { this.hint('游泳的時候不能釣魚啦', 1.5); return; }
    if (e.rod) { this.stop(); return; }
    e.rod = true; e.fishPhase = 'idle'; e.bobber = null; e.emote = 0;
    if (e.holding) e.releaseHeld();
    this.hint('按住左鍵蓄力，放開拋竿！', 2.5);
  }
  stop() {
    const e = this.game.me;
    if (e) { e.rod = false; e.fishPhase = ''; e.bobber = null; e.charge = 0; }
    this.reset(); this.hideAll();
  }
  cancel(msg) {
    const e = this.game.me;
    if (!e || !e.rod) return;
    if (e.fishPhase === 'reel' && msg) this.hint(msg, 1.8);
    e.fishPhase = 'idle'; e.bobber = null; e.charge = 0;
    this.ui.reel.classList.add('hidden'); this.ui.cast.classList.add('hidden');
  }
  hideAll() { for (const k of ['cast', 'hint', 'reel']) this.ui[k].classList.add('hidden'); }
  hint(text, sec = 2, alert = false) {
    this.ui.hint.textContent = text;
    this.ui.hint.classList.remove('hidden');
    this.ui.hint.classList.toggle('alert', alert);
    this.hintT = sec;
  }

  // 回傳這一幀要不要擋住一般操作（出拳等）
  update(dt, input, camFwdYaw) {
    const g = this.game, e = g.me;
    if (this.hintT > 0) { this.hintT -= dt; if (this.hintT <= 0) this.ui.hint.classList.add('hidden'); }
    if (this.cardT > 0) { this.cardT -= dt; if (this.cardT <= 0) this.ui.card.classList.add('hidden'); }
    if (!e || !e.rod) { this.faceYaw = null; return false; }
    if (!this.canFish()) { this.stop(); return false; }
    if (e.ko > 0 || e.heldBy || e.stun > 0.15) {
      if (e.fishPhase !== 'idle') this.cancel(e.fishPhase === 'reel' ? '被打斷了！魚跑掉了…' : null);
      return false;
    }
    const lmbDown = input.mouseDown(0), lmbHit = input.mouseHit(0), lmbUp = input.mouseUp(0);
    this.faceYaw = null;

    switch (e.fishPhase) {
      case 'idle': {
        if (lmbHit) { e.fishPhase = 'charge'; e.charge = 0; this.chargeDir = 1; this.ui.cast.classList.remove('hidden'); }
        break;
      }
      case 'charge': {
        this.faceYaw = camFwdYaw;
        e.charge += this.chargeDir * dt * 1.05;
        if (e.charge >= 1) { e.charge = 1; this.chargeDir = -1; } else if (e.charge <= 0) { e.charge = 0; this.chargeDir = 1; }
        this.ui.castBar.style.width = `${e.charge * 100}%`;
        if (!lmbDown || lmbUp) this.cast(e);
        break;
      }
      case 'flying': {
        this.flightT += dt;
        const k = Math.min(1, this.flightT / this.flightDur);
        e.bobber.lerpVectors(this.from, this.to, k);
        e.bobber.y += Math.sin(k * Math.PI) * (1.5 + this.to.distanceTo(this.from) * 0.25);
        if (k >= 1) this.land(e);
        break;
      }
      case 'wait': {
        this.waitT -= dt; this.nibbleT -= dt;
        if (this.nibbleT < 0) { this.nibbleT = rand(0.9, 2.2); g.effects.ripple(e.bobber, 0.05, 0.5, 0.8); }
        if (input.mouseHit(0)) { this.cancel(); this.hint('太早拉竿了～再拋一次吧', 1.6); break; }
        const mv = g.moveInput;
        if (mv && mv.lengthSq() > 0.05) { this.cancel(); break; }
        if (this.waitT <= 0) {
          e.fishPhase = 'bite'; this.biteT = 1.05;
          g.audio.bite(); g.effects.ripple(e.bobber, 0.1, 1.2, 0.8);
          this.hint('！！上鉤了！快按左鍵 ！！', 1.05, true);
        }
        break;
      }
      case 'bite': {
        this.biteT -= dt;
        if (lmbHit) { this.hook(e); break; }
        if (this.biteT <= 0) {
          e.fishPhase = 'wait'; this.waitT = rand(2.5, 6); this.nibbleT = 1;
          this.hint('啊…魚跑掉了，再等等看', 1.6);
        }
        break;
      }
      case 'reel': this.reel(dt, e, lmbDown); break;
      case 'catch': {
        this.catchT -= dt;
        if (this.catchT <= 0) { e.fishPhase = 'idle'; }
        break;
      }
    }
    return true;
  }

  cast(e) {
    const g = this.game;
    this.ui.cast.classList.add('hidden');
    const f = new THREE.Vector3(Math.sin(e.yaw), 0, Math.cos(e.yaw));
    const dist = 3 + e.charge * 15;
    e.char.getRodTip(this.from);
    this.to.copy(e.pos).addScaledVector(f, dist); this.to.y = g.world.waterLevel + 0.02;
    const gh = g.world.groundHeight(this.to.x, this.to.z);
    if (gh > this.to.y) this.to.y = gh + 0.05;
    for (const b of g.world.boxes) if (this.to.x > b.min[0] && this.to.x < b.max[0] && this.to.z > b.min[2] && this.to.z < b.max[2]) this.to.y = Math.max(this.to.y, b.max[1] + 0.05);
    e.bobber = this.from.clone();
    this.flightT = 0; this.flightDur = 0.45 + e.charge * 0.45;
    e.fishPhase = 'flying'; e.charge = 0;
    g.audio.cast();
  }

  land(e) {
    const g = this.game;
    this.depth = g.world.fishDepth(this.to.x, this.to.z);
    if (this.depth < 0) {
      this.hint('拋到岸上了啦～再試一次', 1.6);
      g.audio.land();
      e.fishPhase = 'idle'; e.bobber = null;
      return;
    }
    g.audio.plop();
    g.effects.ripple(this.to, 0.1, 1.0);
    e.fishPhase = 'wait'; this.waitT = rand(2.5, 7.5) - this.depth * 1.5; this.nibbleT = 1;
    this.hint('等魚上鉤…（浮標下沉時按左鍵）', 2.2);
  }

  hook(e) {
    this.fish = rollFish(Math.max(0, this.depth));
    const r = this.fish.rarity;
    this.strength = this.fish.junk ? 0.18 : 0.25 + r * 0.12;
    this.progress = 0.2; this.tension = 0.25; this.pulling = false; this.pullT = rand(0.8, 1.8);
    this.castPoint = e.bobber.clone();
    e.fishPhase = 'reel';
    this.ui.reel.classList.remove('hidden');
    this.ui.hint.classList.add('hidden');
    this.game.audio.splash(0.4);
    this.game.effects.splash(e.bobber, 0.4);
  }

  reel(dt, e, reeling) {
    const g = this.game;
    this.pullT -= dt;
    if (this.pullT <= 0) {
      this.pulling = !this.pulling;
      this.pullT = this.pulling ? rand(0.5, 1.0 + this.fish.rarity * 0.22) : rand(0.9, 2.4);
      if (this.pulling) g.effects.ripple(e.bobber, 0.2, 1.4, 0.7);
    }
    const pullF = this.pulling ? this.strength : this.strength * 0.2;
    if (reeling) {
      this.progress += (0.2 - pullF * 0.12) * dt;
      this.tension += (0.28 + pullF * 1.15) * dt;
      this.tickT -= dt; if (this.tickT < 0) { this.tickT = 0.08; g.audio.reelTick(); }
    } else {
      this.progress -= pullF * 0.1 * dt;
      this.tension -= 0.55 * dt;
    }
    this.tension = clamp(this.tension, 0, 1);
    // 浮標往岸邊靠
    const near = e.pos.clone().addScaledVector(new THREE.Vector3(Math.sin(e.yaw), 0, Math.cos(e.yaw)), 1.6);
    near.y = g.world.waterLevel;
    e.bobber.lerpVectors(this.castPoint, near, clamp(this.progress, 0, 1));
    e.bobber.y = g.world.waterLevel;
    this.faceYaw = Math.atan2(this.castPoint.x - e.pos.x, this.castPoint.z - e.pos.z);

    this.ui.tensionFill.style.height = `${this.tension * 100}%`;
    this.ui.tension.classList.toggle('danger', this.tension > 0.78);
    this.ui.fishIcon.style.bottom = `${clamp(this.progress, 0, 1) * 85 + 5}%`;
    this.ui.fishIcon.classList.toggle('pull', this.pulling);

    if (this.tension >= 1) { g.audio.snap(); this.cancel(); this.hint('啪！線斷了… 張力太高要先放開喔', 2.4); return; }
    if (this.progress <= 0) { this.cancel(); this.hint('魚溜走了…', 1.8); return; }
    if (this.progress >= 1) this.landFish(e);
  }

  landFish(e) {
    const g = this.game, f = this.fish;
    const size = rollSize(f);
    this.ui.reel.classList.add('hidden');
    e.fishPhase = 'catch'; e.bobber = null; this.catchT = 2.8;
    g.effects.splash(e.pos.clone().addScaledVector(new THREE.Vector3(Math.sin(e.yaw), 0, Math.cos(e.yaw)), 1.4).setY(g.world.waterLevel), 0.6);
    g.emitEv({ k: 'catch', src: e.id, fish: f.id, size });
    g.net.send({ t: 'fish', fish: f.id, size });
    const prev = g.fishBook[f.id];
    const isNew = !prev;
    const isRecord = prev && size > prev.best;
    const card = this.ui.card;
    card.innerHTML = '';
    const mk = (cls, text) => { const d = document.createElement('div'); d.className = cls; d.textContent = text; card.appendChild(d); return d; };
    mk('t', f.junk ? (f.rarity ? '哇！撈到稀有的東西！' : '撈到了……垃圾？') : isNew ? '🎉 新魚種！' : '釣到了！');
    mk('n', `${f.emoji} ${f.name}`);
    mk('r', stars(f.rarity));
    mk('s', `${size} 公分`);
    if (isRecord) mk('rec', '🏆 新紀錄！');
    card.classList.remove('hidden');
    card.style.animation = 'none'; void card.offsetWidth; card.style.animation = '';
    this.cardT = 3.2;
  }
}

export function fishDisplayModel(buildFishModel, fishId, size) {
  const f = FISH_BY_ID[fishId];
  if (!f) return null;
  const m = buildFishModel(f);
  const s = f.junk ? 0.55 : 0.32 + (size / 100) * 0.6;
  const g = new THREE.Group(); g.add(m); m.scale.setScalar(s);
  if (!f.junk) m.rotation.z = Math.PI / 2 - 0.25; // 頭朝上舉著
  return g;
}
