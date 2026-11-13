// 介面：選單、好友、房間、聊天、圖鑑、提示
import { HATS, SCARVES, COLORS } from './accessories.js';
import { SPECIES_INFO } from './character.js';
import { FISH, stars } from './fish.js';

const $ = id => document.getElementById(id);
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
function btn(text, cls, fn) { const b = el('button', 'btn ' + (cls || ''), text); b.addEventListener('click', e => { e.stopPropagation(); fn(e); }); return b; }

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch { /* */ }
    ta.remove(); return ok;
  }
}

export class UI {
  constructor(game) {
    this.g = game;
    this.modal = null;
    this.bannerT = 0; this.subT = 0;
    this.chatOpen = false;
    this.bind();
  }

  bind() {
    const g = this.g;
    $('btnCreate').onclick = () => { g.audio.click(); g.createRoom(); };
    $('btnJoin').onclick = () => { g.audio.click(); const c = $('joinCode').value.trim(); if (c) g.joinRoom(c); else this.toast('請先輸入房間代碼', 'error'); };
    $('joinCode').addEventListener('keydown', e => { if (e.key === 'Enter') $('btnJoin').click(); });
    $('joinCode').addEventListener('input', e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
    $('btnCustomize').onclick = () => { g.audio.click(); g.openCustomize(); };
    $('btnFriends').onclick = () => { g.audio.click(); this.openModal('friendsPanel'); };
    $('btnBook').onclick = () => { g.audio.click(); this.openModal('bookPanel'); };
    $('btnSettings').onclick = () => { g.audio.click(); this.openModal('settingsPanel'); };
    $('btnCopyCode').onclick = $('btnCopyCode2').onclick = async () => { if (await copyText(g.myCode)) this.toast('已複製玩家代碼：' + g.myCode, 'ok'); else this.toast('你的代碼是 ' + g.myCode); };
    $('btnCopyRoom').onclick = async () => { if (g.room && await copyText(g.room.code)) this.toast('已複製房間代碼', 'ok'); };
    const nameInput = $('nameInput');
    const saveName = () => { const n = nameInput.value.trim(); if (n && n !== g.profile.name) g.setName(n); };
    nameInput.addEventListener('change', saveName);
    nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') nameInput.blur(); });

    // 好友
    $('btnAddFriend').onclick = () => {
      const c = $('friendCode').value.trim();
      if (!c) { this.toast('請輸入好友的玩家代碼', 'error'); return; }
      g.net.send({ t: 'friendAdd', code: c }); $('friendCode').value = '';
    };
    $('friendCode').addEventListener('keydown', e => { if (e.key === 'Enter') $('btnAddFriend').click(); });
    $('friendCode').addEventListener('input', e => {
      let v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
      if (v.length > 4) v = v.slice(0, 4) + '-' + v.slice(4);
      e.target.value = v;
    });

    // 關閉 modal
    document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => this.closeModal()));
    document.querySelectorAll('.modal').forEach(m => m.addEventListener('mousedown', e => { if (e.target === m) this.closeModal(); }));

    // 暫停選單
    $('btnResume').onclick = () => { this.closeModal(); g.requestLock(); };
    $('btnLeave').onclick = () => { this.closeModal(); g.leaveRoom(); };
    $('btnInvite').onclick = () => this.openModal('friendsPanel');
    $('btnPmBook').onclick = () => this.openModal('bookPanel');
    $('btnPmCustom').onclick = () => { this.closeModal(); g.openCustomize(); };
    $('btnPmSettings').onclick = () => this.openModal('settingsPanel');
    $('btnPmHelp').onclick = () => this.openModal('helpPanel');
    document.querySelectorAll('.mode-btn').forEach(b => b.onclick = () => { g.audio.click(); g.net.send({ t: 'mode', mode: b.dataset.mode }); });
    $('btnBotAdd').onclick = () => { g.audio.click(); g.net.send({ t: 'botAdd' }); };
    $('btnBotRemove').onclick = () => { g.audio.click(); g.net.send({ t: 'botRemove' }); };

    // 裝扮
    $('btnSaveLook').onclick = () => { g.audio.click(); g.closeCustomize(true); };
    $('btnRandomLook').onclick = () => {
      g.audio.click();
      const r = n => Math.floor(Math.random() * n);
      g.editLook({ species: Math.random() < 0.5 ? 'dog' : 'cat', hat: HATS[r(HATS.length)].id, hatColor: r(COLORS.length), scarf: SCARVES[r(SCARVES.length)].id, scarfColor: r(COLORS.length) });
    };

    // 設定
    const s = g.settings;
    $('setQuality').value = s.quality;
    $('setVolume').value = Math.round(s.volume * 100);
    $('setSens').value = Math.round(s.sens * 100);
    $('setQuality').onchange = e => { s.quality = e.target.value; g.saveSettings(); this.toast('畫質已儲存，重新整理頁面後套用', 'ok', [{ text: '立即重新整理', fn: () => location.reload() }]); };
    $('setVolume').oninput = e => { s.volume = e.target.value / 100; g.audio.setVolume(s.volume); g.saveSettings(); };
    $('setSens').oninput = e => { s.sens = e.target.value / 100; g.saveSettings(); };

    // 聊天
    const ci = $('chatInput');
    ci.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter') { const t = ci.value.trim(); if (t) g.net.send({ t: 'chat', text: t }); ci.value = ''; this.closeChat(); }
      else if (e.key === 'Escape') this.closeChat();
    });
  }

  showScreen(name) {
    for (const id of ['loading', 'menu', 'customize', 'hud']) $(id).classList.toggle('hidden', id !== name);
    if (name === 'menu') { $('nameInput').value = this.g.profile.name || ''; }
  }
  setLoading(text) { $('loadingText').textContent = text; }

  // ---------------------------------------------------------------- Modal
  openModal(id) {
    this.closeModal(true);
    this.modal = id;
    $(id).classList.remove('hidden');
    if (id === 'friendsPanel') this.renderFriends();
    if (id === 'bookPanel') this.renderBook();
    if (id === 'pauseMenu') this.renderPause();
    this.g.onModalChange();
  }
  closeModal(silent) {
    if (!this.modal) return;
    $(this.modal).classList.add('hidden');
    this.modal = null;
    if (!silent) this.g.onModalChange();
  }
  get blocking() { return !!this.modal || this.chatOpen; }

  // ---------------------------------------------------------------- Toast
  toast(text, kind = '', actions = [], sec = 4) {
    const t = el('div', 'toast ' + kind);
    t.appendChild(el('div', '', text));
    if (actions.length) {
      const a = el('div', 'acts');
      for (const ac of actions) a.appendChild(btn(ac.text, 'small ' + (ac.cls || ''), () => { ac.fn(); t.remove(); }));
      t.appendChild(a);
      sec = Math.max(sec, 12);
    }
    $('toasts').appendChild(t);
    setTimeout(() => t.remove(), sec * 1000);
    if (kind === 'invite') this.g.audio.notify();
  }

  // ---------------------------------------------------------------- 好友
  renderFriends() {
    const g = this.g;
    $('fpMyCode').textContent = g.myCode;
    const badge = $('friendBadge');
    badge.textContent = g.requests.length; badge.classList.toggle('hidden', !g.requests.length);
    if (this.modal !== 'friendsPanel') return;
    const rl = $('requestList'); rl.innerHTML = '';
    $('requestsBox').classList.toggle('hidden', !g.requests.length);
    for (const r of g.requests) {
      const row = el('div', 'friend');
      const info = el('div', 'info'); info.append(el('div', 'name', r.name), el('div', 'sub', '想加你為好友 · ' + r.code));
      row.append(el('span', '', SPECIES_INFO[r.look?.species]?.emoji || '🐾'), info,
        btn('接受', 'small primary', () => g.net.send({ t: 'friendAccept', id: r.id })),
        btn('拒絕', 'small ghost', () => g.net.send({ t: 'friendDecline', id: r.id })));
      rl.appendChild(row);
    }
    const fl = $('friendList'); fl.innerHTML = '';
    if (!g.friends.length) fl.appendChild(el('div', 'empty', '還沒有好友～把你的玩家代碼傳給朋友，或輸入朋友的代碼加好友吧！'));
    for (const f of g.friends) {
      const row = el('div', 'friend');
      const dot = el('span', 'dot' + (f.online ? (f.room ? ' room' : ' on') : ''));
      const info = el('div', 'info');
      const status = !f.online ? '離線' : f.room ? (g.room && f.room === g.room.code ? '在你的房間裡' : '在房間中') : '線上';
      info.append(el('div', 'name', `${SPECIES_INFO[f.look?.species]?.emoji || ''} ${f.name}`), el('div', 'sub', `${status} · ${f.code}`));
      row.append(dot, info);
      if (g.room && f.online && f.room !== g.room.code) row.appendChild(btn('邀請', 'small primary', () => g.net.send({ t: 'invite', id: f.id })));
      if (f.online && f.room && (!g.room || f.room !== g.room.code)) row.appendChild(btn('加入', 'small', () => { this.closeModal(); g.joinRoom(f.room); }));
      row.appendChild(btn('✕', 'small ghost', () => { if (confirm(`確定要刪除好友 ${f.name} 嗎？`)) g.net.send({ t: 'friendRemove', id: f.id }); }));
      fl.appendChild(row);
    }
  }

  // ---------------------------------------------------------------- 圖鑑
  renderBook() {
    const g = this.g, grid = $('bookGrid');
    grid.innerHTML = '';
    let got = 0;
    for (const f of FISH) {
      const rec = g.fishBook[f.id];
      if (rec) got++;
      const it = el('div', 'book-item' + (rec ? '' : ' unknown'));
      it.append(el('div', 'ic', f.emoji), el('div', 'nm', rec ? f.name : '？？？'), el('div', 'st', f.rarity ? '★'.repeat(f.rarity) : '雜物'));
      it.appendChild(el('div', 'small muted', rec ? `釣到 ${rec.count} 次 · 最大 ${rec.best} cm` : '還沒釣到'));
      grid.appendChild(it);
    }
    $('bookCount').textContent = `（${got} / ${FISH.length}）`;
  }

  // ---------------------------------------------------------------- 房間選單
  renderPause() {
    const g = this.g, room = g.room;
    if (!room) return;
    $('pmCode').textContent = room.code;
    const isHost = room.hostId === g.myId;
    $('pmHost').classList.toggle('hidden', !isHost);
    $('pmGuest').classList.toggle('hidden', isHost);
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('sel', b.dataset.mode === room.mode));
    const list = $('pmPlayers'); list.innerHTML = '';
    for (const m of room.members) {
      const row = el('div', 'pm-player');
      row.append(el('span', '', SPECIES_INFO[m.look.species]?.emoji || '🐾'), el('span', 'grow', m.name + (m.id === g.myId ? '（你）' : '')));
      if (m.id === room.hostId) row.appendChild(el('span', 'tag host', '👑 房主'));
      if (m.bot) row.appendChild(el('span', 'tag', '🤖 電腦'));
      if (m.bot && isHost) row.appendChild(btn('移除', 'tiny', () => g.net.send({ t: 'botRemove', id: m.id })));
      list.appendChild(row);
    }
  }

  // ---------------------------------------------------------------- 裝扮
  renderCustomize() {
    const g = this.g, look = g.editingLook;
    const sr = $('speciesRow'); sr.innerHTML = '';
    for (const [id, info] of Object.entries(SPECIES_INFO)) {
      const b = btn('', 'species-btn' + (look.species === id ? ' sel' : ''), () => g.editLook({ species: id }));
      b.append(el('span', 'emoji', info.emoji), el('span', '', info.name), el('span', 'small muted', info.desc));
      sr.appendChild(b);
    }
    const grid = (box, items, key) => {
      box.innerHTML = '';
      for (const it of items) {
        const b = btn('', 'item-btn' + (look[key] === it.id ? ' sel' : ''), () => g.editLook({ [key]: it.id }));
        b.append(el('span', 'emoji', it.emoji), el('span', '', it.name));
        box.appendChild(b);
      }
    };
    grid($('hatGrid'), HATS, 'hat');
    grid($('scarfGrid'), SCARVES, 'scarf');
    const sw = (box, key, show) => {
      box.innerHTML = ''; box.classList.toggle('hidden', !show);
      COLORS.forEach((c, i) => {
        const s = el('div', 'swatch' + (look[key] === i ? ' sel' : ''));
        s.style.background = c;
        s.onclick = () => g.editLook({ [key]: i });
        box.appendChild(s);
      });
    };
    sw($('hatColors'), 'hatColor', !['none', 'chef'].includes(look.hat));
    sw($('scarfColors'), 'scarfColor', look.scarf !== 'none');
  }

  // ---------------------------------------------------------------- HUD
  renderHud() {
    const g = this.g, room = g.room;
    if (!room) return;
    $('hudRoomCode').textContent = room.code;
    $('hudMode').textContent = room.mode === 'brawl' ? '🥊 擂台大亂鬥' : '🎣 湖畔釣魚';
    const hp = $('hudPlayers'); hp.innerHTML = '';
    for (const m of room.members) {
      const d = el('div', m.id === g.myId ? 'me' : '', `${m.id === room.hostId ? '👑' : m.bot ? '🤖' : '•'} ${m.name}`);
      hp.appendChild(d);
    }
    this.renderHints();
  }
  renderHints() {
    const g = this.g;
    const lake = g.room && g.room.mode === 'fishing';
    const lines = [
      '<kbd>WASD</kbd> 移動 <kbd>Shift</kbd> 跑 <kbd>空白</kbd> 跳',
      '<kbd>左鍵</kbd> 出拳 <kbd>右鍵</kbd> 抓 → <kbd>左鍵</kbd> 丟 <kbd>F</kbd> 飛撲',
      lake ? '<kbd>E</kbd> 釣竿 <kbd>B</kbd> 圖鑑' : '',
      '<kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> 表情 <kbd>Enter</kbd> 聊天 <kbd>Tab</kbd> 選單',
    ].filter(Boolean);
    $('hints').innerHTML = lines.join('<br>');
  }

  brawlBar(b, members) {
    const bar = $('brawlBar');
    if (!b || b.phase === 'free') { bar.classList.add('hidden'); return; }
    bar.classList.remove('hidden');
    $('brawlRound').textContent = `第 ${b.round} 回合`;
    const sc = $('brawlScores'); sc.innerHTML = '';
    for (const m of members) {
      const d = el('span', 'sc' + (b.out.includes(m.id) ? ' out' : ''));
      d.append(el('span', '', m.name + ' '), el('span', 'stars', '★'.repeat(b.scores[m.id] || 0) || '☆'));
      sc.appendChild(d);
    }
  }
  setTimer(text) { $('brawlTimer').textContent = text; }

  banner(text, sec = 1.6) {
    const b = $('banner');
    b.textContent = text; b.classList.remove('hidden');
    b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
    this.bannerT = sec;
  }
  subBanner(text, sec = 2.5) {
    const b = $('subBanner'); b.textContent = text; b.classList.remove('hidden'); this.subT = sec;
  }
  update(dt) {
    if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT <= 0) $('banner').classList.add('hidden'); }
    if (this.subT > 0) { this.subT -= dt; if (this.subT <= 0) $('subBanner').classList.add('hidden'); }
    const me = this.g.me;
    const dz = $('dizzyMeter');
    if (me && me.dizzy > 3 && !me.ko) { dz.classList.remove('hidden'); dz.querySelector('i').style.width = `${Math.min(100, me.dizzy)}%`; }
    else dz.classList.add('hidden');
    const st = $('struggle');
    if (me && me.heldBy && me.ko <= 0) { st.classList.remove('hidden'); st.querySelector('i').style.width = `${Math.min(100, me.struggle * 100)}%`; }
    else st.classList.add('hidden');
    $('clickToPlay').classList.toggle('hidden', !(this.g.state === 'game' && !this.g.input.locked && !this.blocking));
  }

  // ---------------------------------------------------------------- 聊天
  openChat() {
    this.chatOpen = true;
    const ci = $('chatInput'); ci.classList.remove('hidden'); ci.focus();
    this.g.onModalChange();
  }
  closeChat() {
    this.chatOpen = false;
    const ci = $('chatInput'); ci.blur(); ci.classList.add('hidden');
    this.g.onModalChange();
  }
  chat(name, text, sys = false) {
    const log = $('chatLog');
    const d = el('div', sys ? 'sys' : '');
    if (name) { d.appendChild(el('b', '', name + '：')); }
    d.appendChild(document.createTextNode(text));
    log.appendChild(d);
    while (log.children.length > 30) log.firstChild.remove();
    setTimeout(() => d.classList.add('fade'), 14000);
  }
}
