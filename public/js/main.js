// 毛毛大亂鬥 — 主程式
import * as THREE from 'three';
import { createRenderer, Env } from './renderer.js';
import { setFurQuality } from './fur.js';
import { Character } from './character.js';
import { LakeWorld } from './world/lake.js';
import { ArenaWorld } from './world/arena.js';
import { Effects } from './world/common.js';
import { Input } from './input.js';
import { FollowCamera } from './camera.js';
import { Audio } from './audio.js';
import { Net } from './net.js';
import { UI } from './ui.js';
import { Entity } from './entity.js';
import { BotBrain } from './bots.js';
import { Fishing, fishDisplayModel } from './fishing.js';
import { buildFishModel, FISH_BY_ID, stars, wiggleFish } from './fish.js';

const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 私密模式 */ } },
};
const EMPTY_INPUT = Object.freeze({ move: new THREE.Vector3(), run: false, jump: false, punch: false, grab: false, dive: false, struggle: false, emote: 0 });
const DEFAULT_LOOK = { species: 'dog', hat: 'none', hatColor: 0, scarf: 'knit', scarfColor: 0 };
const PREVIEW_POS = new THREE.Vector3(0, 0.62, 6.4);

class Game {
  constructor() {
    const saved = LS.get('fb_settings', null);
    const weak = /Mobi|Android/i.test(navigator.userAgent) || (navigator.hardwareConcurrency || 8) <= 4;
    this.settings = { quality: weak ? 'medium' : 'high', volume: 0.7, sens: 1, ...(saved || {}) };
    setFurQuality(this.settings.quality);

    this.canvas = document.getElementById('game');
    this.renderer = createRenderer(this.canvas, this.settings.quality);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 6000);
    this.env = new Env(this.renderer, this.scene, this.settings.quality);
    this.effects = new Effects(this.scene);
    this.input = new Input(this.canvas);
    this.input.onLockChange = l => this.onLockChange(l);
    this.audio = new Audio(); this.audio.setVolume(this.settings.volume);
    this.net = new Net();
    this.cam = new FollowCamera(this.camera);
    this.entities = new Map(); this.brains = new Map();
    this.time = 0; this.state = 'loading'; this.sendT = 0; this.lastCount = 0;
    this.profile = { name: '', look: { ...DEFAULT_LOOK, ...LS.get('fb_look', {}) } };
    this.friends = []; this.requests = []; this.fishBook = {};
    this.room = null; this.brawl = null; this.me = null; this.myId = null; this.myCode = '';
    this.moveInput = new THREE.Vector3();
    this.ui = new UI(this);
    this.fishing = new Fishing(this);
    this.world = null;
    this.setWorld('lake');

    this.preview = new Character(this.profile.look, {});
    this.preview.root.position.copy(PREVIEW_POS);
    this.scene.add(this.preview.root);
    this.previewState = { vel: new THREE.Vector3(), yaw: 0, onGround: true, punchCount: 0, emote: 0, dizzy: 0 };

    addEventListener('resize', () => {
      this.renderer.setSize(innerWidth, innerHeight, false);
      this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix();
    });
    document.addEventListener('pointerlockerror', () => { this.lockFailed = true; });
    this.canvas.addEventListener('mousedown', () => {
      if (this.state === 'game' && !this.input.locked && !this.ui.blocking && !this.lockFailed) { this.requestLock(); this.input.mousePressed[0] = false; }
    });
    addEventListener('keydown', e => {
      if (e.code !== 'Escape') return;
      if (this.ui.chatOpen) return;
      if (this.ui.modal) { this.ui.closeModal(); return; }
      if (this.state === 'customize') { this.closeCustomize(false); return; }
      if (this.state === 'game' && !this.input.locked) this.ui.openModal('pauseMenu');
    });

    this.setupNet();
    this.ui.setLoading('正在連線到伺服器…');
    this.net.connect();
    this.clock = new THREE.Timer();
    this.renderer.setAnimationLoop(() => this.tick());
  }

  saveSettings() { LS.set('fb_settings', this.settings); }

  setWorld(name) {
    if (this.world && this.world.name === name) return;
    if (this.world) { this.scene.remove(this.world.group); this.world.dispose(); }
    this.world = name === 'arena' ? new ArenaWorld(this.settings.quality) : new LakeWorld(this.settings.quality);
    this.scene.add(this.world.group);
    this.env.apply(this.world.preset);
    this.audio.setScene(name);
  }

  // ---------------------------------------------------------------- 網路
  setupNet() {
    const n = this.net, ui = this.ui;
    n.on('open', () => { ui.setLoading('登入中…'); n.send({ t: 'hello', token: LS.get('fb_token', null), name: this.profile.name }); });
    n.on('close', ({ was }) => {
      if (!was) { ui.setLoading('連不上伺服器…請確認伺服器有開，正在重試'); return; }
      this.rejoinCode = this.room ? this.room.code : null;
      this.clearGame();
      this.state = 'loading'; ui.showScreen('loading'); ui.setLoading('連線中斷了，正在重新連線…');
    });
    n.on('welcome', m => {
      const firstTime = LS.get('fb_token', null) !== m.token;
      this.myId = m.id; this.myCode = m.code;
      LS.set('fb_token', m.token);
      this.profile.name = m.name;
      if (firstTime) n.send({ t: 'profile', look: this.profile.look }); // 新帳號：沿用本機的裝扮
      else { this.profile.look = { ...DEFAULT_LOOK, ...m.look }; LS.set('fb_look', this.profile.look); }
      this.fishBook = m.fishBook || {};
      this.preview.setLook(this.profile.look);
      document.getElementById('myCode').textContent = m.code;
      if (this.rejoinCode) { const c = this.rejoinCode; this.rejoinCode = null; this.goMenu(); this.joinRoom(c); }
      else if (this.state === 'loading') this.goMenu();
    });
    n.on('profile', m => { this.profile.name = m.name; this.profile.look = m.look; LS.set('fb_look', m.look); if (this.state === 'menu') document.getElementById('nameInput').value = m.name; });
    n.on('friends', m => { this.friends = m.list; this.requests = m.requests; ui.renderFriends(); });
    n.on('friendRequest', m => {
      ui.toast(`${m.from.name} 想加你為好友！`, 'invite', [
        { text: '接受', cls: 'primary', fn: () => n.send({ t: 'friendAccept', id: m.from.id }) },
        { text: '拒絕', cls: 'ghost', fn: () => n.send({ t: 'friendDecline', id: m.from.id }) },
      ]);
    });
    n.on('invited', m => {
      ui.toast(`${m.from.name} 邀請你進入房間 ${m.room}！`, 'invite', [
        { text: '加入', cls: 'primary', fn: () => this.joinRoom(m.room) },
        { text: '忽略', cls: 'ghost', fn: () => {} },
      ]);
    });
    n.on('toast', m => ui.toast(m.text, m.kind || ''));
    n.on('joined', () => this.enterGame());
    n.on('room', m => this.onRoom(m));
    n.on('left', () => this.exitGame());
    n.on('st', m => { const e = this.entities.get(m.e); if (e && !e.owned) e.applyState(m); });
    n.on('ev', m => this.handleEv(m));
    n.on('chat', m => ui.chat(m.sys ? '' : m.name, m.text, !!m.sys));
    n.on('brawl', m => this.onBrawl(m));
    n.on('fishBook', m => { this.fishBook = m.fishBook; if (ui.modal === 'bookPanel') ui.renderBook(); });
    n.on('kicked', m => { n.noReconnect = true; this.clearGame(); this.state = 'loading'; ui.showScreen('loading'); ui.setLoading(m.text + '（重新整理頁面可以再連線）'); });
  }

  goMenu() {
    this.state = 'menu';
    this.ui.showScreen('menu');
    this.preview.root.visible = true;
    this.cam.yaw = 0;
  }
  setName(name) { this.profile.name = name; this.net.send({ t: 'profile', name }); }
  createRoom() { this.net.send({ t: 'roomCreate' }); }
  joinRoom(code) { this.net.send({ t: 'roomJoin', code }); }
  leaveRoom() { this.net.send({ t: 'roomLeave' }); }

  enterGame() {
    this.state = 'game';
    this.ui.showScreen('hud');
    this.preview.root.visible = false;
    this.fishing.stop();
    this.camera.clearViewOffset();
    this.ui.chat('', '歡迎！點一下畫面開始操作，按 Tab 打開房間選單（邀請好友、切換模式）', true);
    this.onModalChange();
  }
  clearGame() {
    for (const e of this.entities.values()) e.dispose();
    this.entities.clear(); this.brains.clear();
    this.me = null; this.room = null; this.brawl = null;
    this.fishing.stop();
    this.input.unlock();
    this.ui.closeModal(true);
    this.ui.brawlBar(null);
  }
  exitGame() {
    this.clearGame();
    this.setWorld('lake');
    this.goMenu();
    this.onModalChange();
  }

  onRoom(m) {
    this.room = m;
    const worldName = m.mode === 'brawl' ? 'arena' : 'lake';
    const switched = this.world.name !== worldName;
    if (switched) { this.setWorld(worldName); this.fishing.stop(); this.brawl = null; this.ui.brawlBar(null); }
    const ids = new Set(m.members.map(x => x.id));
    for (const [id, e] of this.entities) if (!ids.has(id)) { e.dispose(); this.entities.delete(id); this.brains.delete(id); }
    m.members.forEach((mem, i) => {
      let e = this.entities.get(mem.id);
      const owned = mem.id === this.myId || (mem.bot && mem.owner === this.myId);
      if (e && e.owned !== owned) { e.dispose(); this.entities.delete(mem.id); this.brains.delete(mem.id); e = null; }
      if (!e) {
        e = new Entity(this, mem, owned);
        this.entities.set(mem.id, e);
        if (owned) this.spawnOwned(e, i, m.members.length);
        if (owned && mem.bot) this.brains.set(mem.id, new BotBrain(this, e));
        if (mem.id === this.myId) { this.me = e; this.cam.yaw = e.yaw + Math.PI; }
      } else e.setInfo(mem);
    });
    if (switched) {
      let i = 0;
      for (const e of this.entities.values()) if (e.owned) { e.resetCombat(); e.frozen = false; e.rod = false; e.fishPhase = ''; e.bobber = null; this.spawnOwned(e, i++, m.members.length); }
      if (this.me) this.cam.yaw = this.me.yaw + Math.PI;
      this.ui.banner(worldName === 'arena' ? '🥊 擂台大亂鬥' : '🎣 湖畔釣魚', 1.8);
      this.ui.subBanner(worldName === 'arena' ? '把大家丟進海裡！最後留在擂台上的獲勝' : '按 E 拿出釣竿，一起來釣魚吧～', 3);
    }
    this.ui.renderHud();
    if (this.ui.modal === 'pauseMenu') this.ui.renderPause();
    if (this.ui.modal === 'friendsPanel') this.ui.renderFriends();
    if (this.brawl) this.ui.brawlBar(this.brawl, m.members);
  }

  spawnOwned(e, i, n) {
    const w = this.world;
    if (w.name === 'arena' && this.brawl && this.brawl.phase !== 'free' && !this.brawl.participants.includes(e.id)) { this.toSpectator(e); return; }
    const p = w.spawnPoint(i, Math.max(n, 2));
    if (w.name === 'lake') { p.x += (Math.random() - 0.5) * 0.6; }
    e.teleport(p, w.spawnYaw(i, Math.max(n, 2)));
  }
  toSpectator(e) {
    const a = Math.random() * Math.PI * 2;
    e.teleport(new THREE.Vector3(Math.cos(a) * 11, -0.62, Math.sin(a) * 11), a + Math.PI);
    e.swim = true; e.out = true;
  }

  onBrawl(m) {
    const prev = this.brawl;
    this.brawl = { ...m, deadline: this.time + (m.endsAt || 0) / 1000 };
    if (!this.room || this.room.mode !== 'brawl') return;
    const owned = [...this.entities.values()].filter(e => e.owned);
    const name = id => (this.room.members.find(x => x.id === id) || {}).name || '???';
    const n = m.participants.length;
    if (m.phase === 'countdown' && (!prev || prev.phase !== 'countdown' || prev.round !== m.round)) {
      this.ui.banner(`第 ${m.round} 回合`, 1.1);
      this.lastCount = 9;
    }
    if (m.phase === 'countdown') {
      for (const e of owned) {
        const idx = m.spawns[e.id];
        if (e.spawnedRound === m.round && e.spawnIdx === idx) continue;
        e.spawnedRound = m.round; e.spawnIdx = idx;
        e.resetCombat();
        if (idx === undefined) { this.toSpectator(e); continue; }
        e.teleport(this.world.spawnPoint(idx, 8), this.world.spawnYaw(idx, 8));
        e.frozen = true;
        if (e === this.me) this.cam.yaw = this.me.yaw + Math.PI;
      }
    }
    if (m.phase !== 'countdown') for (const e of owned) e.spawnedRound = null;
    if (m.phase === 'fight' && (!prev || prev.phase !== 'fight')) {
      for (const e of owned) e.frozen = false;
      this.ui.banner('開打！', 1.1); this.audio.beep(true);
    }
    if (m.phase === 'roundEnd' && (!prev || prev.phase !== 'roundEnd')) {
      this.ui.banner(m.winner ? `${name(m.winner)} 贏了這回合！` : '平手！', 3);
      this.audio.fanfare(false);
    }
    if (m.phase === 'matchEnd' && (!prev || prev.phase !== 'matchEnd')) {
      this.ui.banner(`🏆 ${name(m.winner)} 是冠軍！`, 5.5);
      const w = this.entities.get(m.winner);
      if (w) { this.effects.confetti(w.renderPos); if (w.owned) w.emote = 2; }
      this.audio.fanfare(true);
    }
    if (m.phase === 'free') {
      for (const e of owned) { e.frozen = false; e.out = false; }
      if (prev && prev.phase !== 'free') this.ui.subBanner('人數不夠囉，等待其他玩家加入…', 3);
    }
    if (m.phase !== 'free') {
      for (const e of owned) if ((m.out.includes(e.id) || !m.participants.includes(e.id)) && !e.out) this.toSpectator(e);
    }
    this.ui.brawlBar(this.brawl, this.room.members);
  }
  isOutOfPlay(e) {
    if (!this.world || this.world.name !== 'arena' || !this.brawl || this.brawl.phase === 'free') return false;
    return e.out || this.brawl.out.includes(e.id) || !this.brawl.participants.includes(e.id);
  }

  // ---------------------------------------------------------------- 事件
  emitEv(ev) { this.handleEv(ev); this.net.send({ t: 'ev', ...ev }); }
  handleEv(ev) {
    const src = this.entities.get(ev.src), tgt = this.entities.get(ev.tgt);
    switch (ev.k) {
      case 'hit':
        if (!tgt) break;
        this.effects.pow(tgt.char.getHeadPos(new THREE.Vector3()), ev.dz > 30 ? 0xff9a3c : 0xffe066);
        if (this.near(tgt)) { this.audio.punch(ev.dz > 30 ? 1.3 : 1); this.audio.squeak(tgt.look.species === 'cat' ? 1.25 : 0.9); }
        if (tgt.isMe) this.cam.addShake(ev.dz > 30 ? 0.45 : 0.22);
        if (tgt.owned) tgt.applyHit(ev);
        break;
      case 'grab': if (this.near(tgt)) this.audio.grab(); if (tgt && tgt.owned) tgt.onGrabbed(ev.src); break;
      case 'release': if (tgt && tgt.owned) tgt.onReleased(ev.src); break;
      case 'throw': if (this.near(tgt)) this.audio.throw_(); if (tgt && tgt.owned) tgt.onThrown(ev); break;
      case 'free': if (tgt && tgt.owned) tgt.onFreed(ev.src); break;
      case 'splash': {
        const p = new THREE.Vector3(ev.p[0], ev.p[1], ev.p[2]);
        this.effects.splash(p, ev.big || 1);
        if (p.distanceTo(this.camera.position) < 40) this.audio.splash(1);
        break;
      }
      case 'ko': if (src && this.near(src)) { this.audio.boing(); this.audio.dizzy(); } break;
      case 'catch': {
        if (!src) break;
        const f = FISH_BY_ID[ev.fish];
        if (!f) break;
        const model = fishDisplayModel(buildFishModel, ev.fish, ev.size);
        if (model) src.char.showHeldItem(model, 2.8);
        this.ui.chat('', `${src.name} 釣到了 ${f.emoji} ${f.name}（${ev.size} 公分）${f.rarity ? ' ' + stars(f.rarity) : ''}`, true);
        if (this.near(src)) this.audio.fanfare(f.rarity >= 4);
        if (f.rarity >= 4 && !src.isMe) this.ui.subBanner(`${src.name} 釣到稀有的 ${f.name}！`, 3);
        break;
      }
      case 'out': if (src) this.ui.subBanner(`${src.name} 掉進海裡了！`, 2); break;
    }
  }
  near(e, d = 30) { return e && e.renderPos.distanceTo(this.camera.position) < d; }
  sfx(name, e) { if (e && !this.near(e, 22)) return; const fn = this.audio[name]; if (fn) fn.call(this.audio); }
  onOwnedHit(e) { if (e.isMe && this.fishing.busy) this.fishing.cancel('被打斷了！'); }

  // ---------------------------------------------------------------- 裝扮
  openCustomize() {
    this.editingLook = { ...this.profile.look };
    this.customizeFrom = this.state;
    this.state = 'customize';
    this.ui.showScreen('customize');
    this.ui.renderCustomize();
    this.input.unlock();
    this.onModalChange();
    const target = this.me && this.customizeFrom === 'game' ? this.me : null;
    this.cam.yaw = target ? target.yaw : 0;
  }
  editLook(patch) {
    Object.assign(this.editingLook, patch);
    const c = this.me && this.customizeFrom === 'game' ? this.me.char : this.preview;
    c.setLook(this.editingLook);
    this.ui.renderCustomize();
  }
  closeCustomize(save) {
    const c = this.me && this.customizeFrom === 'game' ? this.me.char : this.preview;
    if (save) {
      this.profile.look = { ...this.editingLook };
      LS.set('fb_look', this.profile.look);
      this.net.send({ t: 'profile', look: this.profile.look });
      if (this.me) this.me.look = { ...this.profile.look };
    } else c.setLook(this.profile.look);
    this.preview.setLook(this.profile.look);
    this.camera.clearViewOffset();
    if (this.customizeFrom === 'game' && this.room) { this.state = 'game'; this.ui.showScreen('hud'); }
    else this.goMenu();
    this.onModalChange();
  }

  // ---------------------------------------------------------------- 輸入
  onModalChange() {
    const blocking = this.ui.blocking || this.state !== 'game';
    this.input.enabled = !blocking;
    if (blocking) this.input.unlock();
  }
  requestLock() { if (this.state === 'game' && !this.ui.blocking) this.input.lock(); }
  onLockChange(locked) {
    if (!locked && this.state === 'game' && !this.ui.blocking) this.ui.openModal('pauseMenu');
  }

  handleKeys() {
    const i = this.input;
    if (i.hit('Enter')) { this.ui.openChat(); return; }
    if (i.hit('Tab')) { this.ui.openModal('pauseMenu'); return; }
    if (i.hit('KeyB')) { this.ui.openModal('bookPanel'); return; }
    if (i.hit('KeyE')) this.fishing.toggleRod();
  }

  buildInput() {
    const i = this.input;
    const f = this.cam.forward(new THREE.Vector3()), r = this.cam.right(new THREE.Vector3());
    let mx = 0, mz = 0;
    if (i.down('KeyW') || i.down('ArrowUp')) mz += 1;
    if (i.down('KeyS') || i.down('ArrowDown')) mz -= 1;
    if (i.down('KeyD') || i.down('ArrowRight')) mx += 1;
    if (i.down('KeyA') || i.down('ArrowLeft')) mx -= 1;
    const move = f.multiplyScalar(mz).add(r.multiplyScalar(mx));
    if (move.lengthSq() > 1) move.normalize();
    this.moveInput.copy(move);
    let emote = 0;
    if (i.hit('Digit1')) emote = 1; else if (i.hit('Digit2')) emote = 2; else if (i.hit('Digit3')) emote = 3;
    return {
      move, run: i.down('ShiftLeft') || i.down('ShiftRight'), jump: i.hit('Space'),
      punch: i.mouseHit(0), grab: i.mouseDown(2), dive: i.hit('KeyF'),
      struggle: i.hit('Space') || i.hit('KeyW') || i.hit('KeyA') || i.hit('KeyS') || i.hit('KeyD') || i.mouseHit(0),
      emote,
    };
  }

  // ---------------------------------------------------------------- 主迴圈
  checkOut(dt) {
    if (this.world.name !== 'arena') return;
    const ph = this.brawl ? this.brawl.phase : 'free';
    for (const e of this.entities.values()) {
      if (!e.owned || e.heldBy) continue;
      const inWater = e.swim || e.pos.y < 0.4;
      if (!inWater) { e.respawnT = 0; continue; }
      if (ph === 'fight' && this.brawl.participants.includes(e.id) && !e.out) {
        e.out = true;
        if (e.holding) e.releaseHeld();
        this.emitEv({ k: 'out', src: e.id });
        if (e.isMe) this.ui.banner('噗通！掉進海裡了～', 1.6);
      } else if (ph === 'free') {
        e.respawnT += dt;
        if (e.respawnT > 1.8) {
          e.respawnT = 0; e.resetCombat();
          const k = Math.floor(Math.random() * 8);
          e.teleport(this.world.spawnPoint(k, 8), this.world.spawnYaw(k, 8));
        }
      }
    }
  }

  tick() {
    this.clock.update(); const dt = Math.min(this.clock.getDelta(), 0.05);
    this.time += dt;
    const inRoom = !!this.room && !!this.me && (this.state === 'game' || this.state === 'customize');
    let focus = PREVIEW_POS;

    if (inRoom) {
      if (this.state === 'game' && !this.ui.blocking) this.handleKeys();
      const active = this.state === 'game' && !this.ui.blocking;
      const inp = active ? this.buildInput() : { ...EMPTY_INPUT, move: new THREE.Vector3() };
      if (!active) this.moveInput.set(0, 0, 0);
      this.fishing.update(dt, this.input, this.cam.yaw + Math.PI);
      inp.faceYaw = this.fishing.faceYaw;
      if (this.me.rod) inp.punch = false;
      this.me.simulate(dt, inp);
      for (const [id, brain] of this.brains) { const e = this.entities.get(id); if (e) e.simulate(dt, brain.think(dt)); }
      for (const e of this.entities.values()) if (!e.owned) e.updateRemote(dt);
      this.checkOut(dt);
      for (const e of this.entities.values()) {
        e.char.root.visible = e.owned || e.gotState;
        e.animate(dt);
        if (e.char.heldItem) wiggleFish(e.char.heldItem.children[0], this.time);
      }
      focus = this.me.renderPos;
      if (this.state === 'game') this.cam.update(dt, this.input, this.me.renderPos, this.world, this.settings.sens);
      else this.cam.orbit(dt, this.me.renderPos, { dist: 3.0, height: 1.0, speed: 0, offsetX: innerWidth > 760 ? -0.17 : 0, input: this.input, lookY: 0.65 });

      this.sendT -= dt;
      if (this.sendT <= 0) {
        this.sendT = 0.05;
        for (const e of this.entities.values()) if (e.owned) this.net.send(e.packState());
      }
      if (this.brawl && this.room.mode === 'brawl') {
        const rem = this.brawl.deadline - this.time;
        if (this.brawl.phase === 'fight') {
          const s = Math.max(0, Math.ceil(rem));
          this.ui.setTimer(`⏱ ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
        } else this.ui.setTimer('');
        if (this.brawl.phase === 'countdown') {
          const c = Math.ceil(rem);
          if (c !== this.lastCount && c >= 1 && c <= 3) { this.lastCount = c; this.ui.banner(String(c), 0.9); this.audio.beep(false); }
        }
      }
    } else {
      // 主選單 / 裝扮：角色展示
      const p = this.preview;
      this.previewState.yaw = 0;
      p.update(dt, this.previewState);
      const custom = this.state === 'customize';
      const wide = innerWidth > 760;
      this.cam.orbit(dt, PREVIEW_POS, custom
        ? { dist: 2.6, height: 0.95, speed: 0, offsetX: wide ? -0.17 : 0, input: this.input, lookY: 0.62 }
        : { dist: 4.4, height: 1.25, speed: 0.08, offsetX: wide ? 0.16 : 0, input: this.input, lookY: 0.75 });
      // 偶爾揮手
      this.previewEmoteT = (this.previewEmoteT || 4) - dt;
      if (this.previewEmoteT < 0) { this.previewState.emote = this.previewState.emote ? 0 : (Math.random() < 0.5 ? 1 : 2); this.previewEmoteT = this.previewState.emote ? 2.2 : 5 + Math.random() * 4; }
    }

    this.world.update(dt, this.time);
    this.effects.update(dt, this.world.waterLevel);
    this.env.follow(focus);
    this.env.update(this.time);
    this.ui.update(dt);
    this.renderer.render(this.scene, this.camera);
    this.input.endFrame();
  }
}

try {
  window.game = new Game();
} catch (err) {
  console.error(err);
  document.getElementById('loadingText').textContent = '遊戲啟動失敗：' + err.message + '（請確認瀏覽器支援 WebGL2）';
}
