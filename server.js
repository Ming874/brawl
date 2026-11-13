// 毛毛大亂鬥 — 遊戲伺服器
// 功能：靜態檔案、玩家帳號(代碼)、好友、房間、邀請、狀態轉送、擂台回合管理、釣魚圖鑑存檔
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const THREE_DIR = path.join(__dirname, 'node_modules', 'three');
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'players.json');
const MAX_ROOM = 8;

// ---------------------------------------------------------------- 靜態檔案
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
};

function serveFile(res, file) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': file.startsWith(THREE_DIR) ? 'public, max-age=86400' : 'no-cache',
    });
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  let url;
  try { url = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400); res.end(); return; }
  if (url === '/health') { res.writeHead(200); res.end('ok'); return; }
  let base = PUBLIC_DIR, rel = url;
  if (url.startsWith('/vendor/three/')) { base = THREE_DIR; rel = url.slice('/vendor/three'.length); }
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.normalize(path.join(base, rel));
  if (!file.startsWith(base)) { res.writeHead(403); res.end(); return; }
  serveFile(res, file);
});

// ---------------------------------------------------------------- 資料
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function randCode(n) {
  let s = '';
  const bytes = crypto.randomBytes(n);
  for (let i = 0; i < n; i++) s += CODE_CHARS[bytes[i] % CODE_CHARS.length];
  return s;
}

const players = new Map(); // id -> player
const byToken = new Map();
const byCode = new Map();

function loadData() {
  try {
    const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    for (const p of raw.players || []) {
      p.friends = new Set(p.friends || []);
      p.incoming = new Set(p.incoming || []);
      p.fishBook = p.fishBook || {};
      players.set(p.id, p); byToken.set(p.token, p.id); byCode.set(p.code, p.id);
    }
    console.log(`已載入 ${players.size} 位玩家資料`);
  } catch { /* 第一次啟動 */ }
}
let saveTimer = null;
function saveSoon() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const out = { players: [...players.values()].map(p => ({
      id: p.id, token: p.token, code: p.code, name: p.name, look: p.look,
      friends: [...p.friends], incoming: [...p.incoming], fishBook: p.fishBook, created: p.created,
    })) };
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFile(DATA_FILE + '.tmp', JSON.stringify(out), err => {
      if (!err) fs.rename(DATA_FILE + '.tmp', DATA_FILE, () => {});
    });
  }, 1500);
}
loadData();

const DEFAULT_LOOK = { species: 'dog', hat: 'none', hatColor: 0, scarf: 'none', scarfColor: 0 };
const SPECIES = ['dog', 'cat'];
const HATS = ['none', 'beanie', 'party', 'straw', 'crown', 'bucket', 'cowboy', 'duck', 'chef', 'flower'];
const SCARVES = ['none', 'knit', 'striped', 'plaid', 'bandana', 'bowtie'];

function cleanLook(l) {
  l = l || {};
  return {
    species: SPECIES.includes(l.species) ? l.species : 'dog',
    hat: HATS.includes(l.hat) ? l.hat : 'none',
    hatColor: Math.max(0, Math.min(11, l.hatColor | 0)),
    scarf: SCARVES.includes(l.scarf) ? l.scarf : 'none',
    scarfColor: Math.max(0, Math.min(11, l.scarfColor | 0)),
  };
}
function cleanName(n) {
  n = String(n || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 12);
  return n || '毛毛' + randCode(3);
}

function newPlayer(name) {
  let id; do { id = 'p' + randCode(10); } while (players.has(id));
  let code; do { code = randCode(4) + '-' + randCode(4); } while (byCode.has(code));
  const token = crypto.randomBytes(24).toString('hex');
  const p = { id, token, code, name: cleanName(name), look: { ...DEFAULT_LOOK }, friends: new Set(), incoming: new Set(), fishBook: {}, created: Date.now() };
  players.set(id, p); byToken.set(token, id); byCode.set(code, id);
  saveSoon();
  return p;
}

// ---------------------------------------------------------------- 連線
const online = new Map(); // playerId -> ws
const rooms = new Map();  // code -> room

function send(ws, msg) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); }
function sendTo(pid, msg) { send(online.get(pid), msg); }

function publicInfo(p) { return { id: p.id, name: p.name, code: p.code, look: p.look }; }

function friendsPayload(p) {
  const list = [...p.friends].map(fid => players.get(fid)).filter(Boolean).map(f => {
    const ws = online.get(f.id);
    return { ...publicInfo(f), online: !!ws, room: ws && ws.roomCode ? ws.roomCode : null };
  });
  list.sort((a, b) => (b.online - a.online) || a.name.localeCompare(b.name));
  const requests = [...p.incoming].map(fid => players.get(fid)).filter(Boolean).map(publicInfo);
  return { t: 'friends', list, requests };
}
function pushFriends(pid) { const p = players.get(pid); if (p && online.has(pid)) sendTo(pid, friendsPayload(p)); }
function pushFriendsOfFriends(pid) { const p = players.get(pid); if (!p) return; for (const f of p.friends) pushFriends(f); }

// ---------------------------------------------------------------- 房間
function makeRoomCode() { let c; do { c = randCode(5); } while (rooms.has(c)); return c; }

function roomPayload(room) {
  return {
    t: 'room', code: room.code, hostId: room.hostId, mode: room.mode,
    members: [...room.members.values()].map(m => ({ id: m.id, name: m.name, look: m.look, bot: !!m.bot, owner: m.owner || null })),
  };
}
function broadcast(room, msg, exceptPid) {
  const data = JSON.stringify(msg);
  for (const m of room.members.values()) {
    if (m.bot || m.id === exceptPid) continue;
    const ws = online.get(m.id);
    if (ws && ws.readyState === 1) ws.send(data);
  }
}
function humanCount(room) { let n = 0; for (const m of room.members.values()) if (!m.bot) n++; return n; }

function joinRoom(ws, room) {
  const p = players.get(ws.pid);
  if (ws.roomCode) leaveRoom(ws);
  if (room.members.size >= MAX_ROOM) {
    // 有電腦玩家時，踢掉一隻電腦讓真人進來
    const bot = [...room.members.values()].find(m => m.bot);
    if (!bot) { send(ws, { t: 'toast', kind: 'error', text: '房間已滿（最多 8 人）' }); return false; }
    room.members.delete(bot.id);
  }
  room.members.set(p.id, { id: p.id, name: p.name, look: p.look });
  ws.roomCode = room.code;
  if (room.mode === 'brawl') addLateComer(room, p.id);
  send(ws, { t: 'joined', code: room.code });
  broadcast(room, roomPayload(room));
  sendBrawl(room, ws);
  broadcast(room, { t: 'chat', sys: true, text: `${p.name} 進入了房間` }, p.id);
  pushFriendsOfFriends(p.id);
  brawlCheck(room);
  return true;
}

function leaveRoom(ws) {
  const room = rooms.get(ws.roomCode);
  ws.roomCode = null;
  if (!room) return;
  const p = players.get(ws.pid);
  room.members.delete(ws.pid);
  // 移除此玩家擁有的電腦玩家
  for (const m of [...room.members.values()]) if (m.bot && m.owner === ws.pid) room.members.delete(m.id);
  if (humanCount(room) === 0) { clearTimeout(room.brawl.timer); rooms.delete(room.code); }
  else {
    if (room.hostId === ws.pid) room.hostId = [...room.members.values()].find(m => !m.bot).id;
    broadcast(room, roomPayload(room));
    broadcast(room, { t: 'chat', sys: true, text: `${p ? p.name : '有人'} 離開了房間` });
    brawlCheck(room);
  }
  if (p) pushFriendsOfFriends(p.id);
}

function createRoom(ws) {
  const room = {
    code: makeRoomCode(), hostId: ws.pid, mode: 'fishing', members: new Map(), created: Date.now(),
    brawl: { phase: 'free', round: 0, scores: {}, out: new Set(), participants: [], timer: null, endsAt: 0, winner: null, spawns: {} },
  };
  rooms.set(room.code, room);
  joinRoom(ws, room);
}

// ---------------------------------------------------------------- 擂台回合
const WIN_SCORE = 3;
const ROUND_TIME = 120;

function brawlMsg(room) {
  const b = room.brawl;
  return { t: 'brawl', phase: b.phase, round: b.round, scores: b.scores, out: [...b.out], participants: b.participants,
    endsAt: b.endsAt ? b.endsAt - Date.now() : 0, winner: b.winner, spawns: b.spawns };
}
function sendBrawl(room, ws) { if (room.mode === 'brawl') ws ? send(ws, brawlMsg(room)) : broadcast(room, brawlMsg(room)); }

// 倒數中加入的人一起參賽；開打後加入的人先在水裡觀戰
function addLateComer(room, id) {
  const b = room.brawl;
  if (b.phase === 'countdown') {
    if (!b.participants.includes(id)) { b.participants.push(id); b.spawns[id] = Object.keys(b.spawns).length; if (!(id in b.scores)) b.scores[id] = 0; }
    sendBrawl(room);
  } else if (b.phase !== 'free') b.out.add(id);
}

function setPhase(room, phase, ms, next) {
  const b = room.brawl;
  clearTimeout(b.timer);
  b.phase = phase;
  b.endsAt = ms ? Date.now() + ms : 0;
  if (ms && next) b.timer = setTimeout(next, ms);
  sendBrawl(room);
}

function brawlCheck(room) {
  if (room.mode !== 'brawl') return;
  const b = room.brawl;
  const count = room.members.size;
  if (count < 2) {
    if (b.phase !== 'free') { b.round = 0; b.scores = {}; b.out = new Set(); b.participants = []; b.winner = null; b.spawns = {}; setPhase(room, 'free'); }
    return;
  }
  if (b.phase === 'free' || b.phase === 'waiting') { startCountdown(room); return; }
  if (b.phase === 'fight') {
    const alive = b.participants.filter(id => room.members.has(id) && !b.out.has(id));
    if (alive.length <= 1) endRound(room, alive[0] || null);
  }
}

function startCountdown(room) {
  const b = room.brawl;
  if (room.members.size < 2) { brawlCheck(room); return; }
  b.round += 1;
  b.participants = [...room.members.keys()];
  b.out = new Set();
  b.winner = null;
  const order = [...b.participants].sort(() => Math.random() - 0.5);
  b.spawns = {}; order.forEach((id, i) => { b.spawns[id] = i; });
  for (const id of b.participants) if (!(id in b.scores)) b.scores[id] = 0;
  setPhase(room, 'countdown', 3500, () => {
    setPhase(room, 'fight', ROUND_TIME * 1000, () => endRound(room, null));
    brawlCheck(room);
  });
}

function endRound(room, winnerId) {
  const b = room.brawl;
  b.winner = winnerId;
  if (winnerId) b.scores[winnerId] = (b.scores[winnerId] || 0) + 1;
  const champion = winnerId && b.scores[winnerId] >= WIN_SCORE;
  if (champion) {
    setPhase(room, 'matchEnd', 7000, () => { b.scores = {}; b.round = 0; startCountdown(room); });
  } else {
    setPhase(room, 'roundEnd', 3500, () => startCountdown(room));
  }
}

function setMode(room, mode) {
  room.mode = mode;
  const b = room.brawl;
  clearTimeout(b.timer);
  Object.assign(b, { phase: 'free', round: 0, scores: {}, out: new Set(), participants: [], winner: null, spawns: {}, endsAt: 0 });
  broadcast(room, roomPayload(room));
  if (mode === 'brawl') { sendBrawl(room); setTimeout(() => brawlCheck(room), 1500); }
}

// ---------------------------------------------------------------- 訊息處理
const BOT_NAMES = ['阿呆', '憨憨', '肉圓', '麻糬', '湯圓', '布丁', '豆花', '飯糰', '包子', '芋圓', '小籠包', '珍奶'];

function handle(ws, msg) {
  const t = msg.t;
  if (t === 'hello') {
    let p = msg.token && byToken.has(msg.token) ? players.get(byToken.get(msg.token)) : null;
    if (!p) p = newPlayer(msg.name);
    const old = online.get(p.id);
    if (old && old !== ws) { send(old, { t: 'kicked', text: '你的帳號在別的地方登入了' }); if (old.roomCode) leaveRoom(old); old.pid = null; old.close(); }
    ws.pid = p.id;
    online.set(p.id, ws);
    send(ws, { t: 'welcome', token: p.token, id: p.id, code: p.code, name: p.name, look: p.look, fishBook: p.fishBook });
    pushFriends(p.id);
    pushFriendsOfFriends(p.id);
    return;
  }
  const p = players.get(ws.pid);
  if (!p) return;
  const room = ws.roomCode ? rooms.get(ws.roomCode) : null;

  switch (t) {
    case 'profile': {
      if (msg.name !== undefined) p.name = cleanName(msg.name);
      if (msg.look) p.look = cleanLook(msg.look);
      saveSoon();
      send(ws, { t: 'profile', name: p.name, look: p.look });
      if (room) { const m = room.members.get(p.id); if (m) { m.name = p.name; m.look = p.look; } broadcast(room, roomPayload(room)); }
      pushFriendsOfFriends(p.id);
      break;
    }
    case 'friendAdd': {
      const code = String(msg.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      const fmt = code.length === 8 ? code.slice(0, 4) + '-' + code.slice(4) : code;
      const fid = byCode.get(fmt);
      if (!fid) { send(ws, { t: 'toast', kind: 'error', text: '找不到這個玩家代碼' }); break; }
      if (fid === p.id) { send(ws, { t: 'toast', kind: 'error', text: '不能加自己為好友喔' }); break; }
      if (p.friends.has(fid)) { send(ws, { t: 'toast', text: '你們已經是好友了' }); break; }
      const f = players.get(fid);
      if (p.incoming.has(fid)) { // 對方已經邀請過我 → 直接成為好友
        p.incoming.delete(fid); p.friends.add(fid); f.friends.add(p.id);
        send(ws, { t: 'toast', kind: 'ok', text: `你和 ${f.name} 成為好友了！` });
        sendTo(fid, { t: 'toast', kind: 'ok', text: `${p.name} 接受了你的好友邀請！` });
      } else {
        f.incoming.add(p.id);
        send(ws, { t: 'toast', kind: 'ok', text: `已送出好友邀請給 ${f.name}` });
        sendTo(fid, { t: 'friendRequest', from: publicInfo(p) });
      }
      saveSoon(); pushFriends(p.id); pushFriends(fid);
      break;
    }
    case 'friendAccept': {
      const f = players.get(msg.id);
      if (!f || !p.incoming.has(f.id)) break;
      p.incoming.delete(f.id); f.incoming.delete(p.id);
      p.friends.add(f.id); f.friends.add(p.id);
      saveSoon(); pushFriends(p.id); pushFriends(f.id);
      sendTo(f.id, { t: 'toast', kind: 'ok', text: `${p.name} 接受了你的好友邀請！` });
      break;
    }
    case 'friendDecline': {
      p.incoming.delete(msg.id); saveSoon(); pushFriends(p.id);
      break;
    }
    case 'friendRemove': {
      const f = players.get(msg.id);
      p.friends.delete(msg.id); if (f) f.friends.delete(p.id);
      saveSoon(); pushFriends(p.id); if (f) pushFriends(f.id);
      break;
    }
    case 'roomCreate': createRoom(ws); break;
    case 'roomJoin': {
      const code = String(msg.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      const r = rooms.get(code);
      if (!r) { send(ws, { t: 'toast', kind: 'error', text: '找不到這個房間，可能已經關閉了' }); send(ws, { t: 'joinFailed' }); break; }
      if (r === room) break;
      if (!joinRoom(ws, r)) send(ws, { t: 'joinFailed' });
      break;
    }
    case 'roomLeave': if (room) leaveRoom(ws); send(ws, { t: 'left' }); break;
    case 'invite': {
      if (!room) break;
      const f = players.get(msg.id);
      if (!f || !p.friends.has(f.id)) break;
      if (!online.has(f.id)) { send(ws, { t: 'toast', kind: 'error', text: `${f.name} 目前不在線上` }); break; }
      sendTo(f.id, { t: 'invited', from: publicInfo(p), room: room.code });
      send(ws, { t: 'toast', kind: 'ok', text: `已邀請 ${f.name}` });
      break;
    }
    case 'mode': {
      if (!room || room.hostId !== p.id) break;
      if (msg.mode !== 'fishing' && msg.mode !== 'brawl') break;
      setMode(room, msg.mode);
      broadcast(room, { t: 'chat', sys: true, text: msg.mode === 'brawl' ? '房主切換到「擂台大亂鬥」！' : '房主切換到「湖畔釣魚」～' });
      break;
    }
    case 'botAdd': {
      if (!room || room.hostId !== p.id) break;
      if (room.members.size >= MAX_ROOM) { send(ws, { t: 'toast', kind: 'error', text: '房間已滿' }); break; }
      const used = new Set([...room.members.values()].map(m => m.name));
      const name = (BOT_NAMES.filter(n => !used.has(n))[0] || '電腦') ;
      const id = 'b' + randCode(8);
      const look = cleanLook({
        species: Math.random() < 0.5 ? 'dog' : 'cat',
        hat: HATS[1 + Math.floor(Math.random() * (HATS.length - 1))], hatColor: Math.floor(Math.random() * 12),
        scarf: Math.random() < 0.6 ? SCARVES[1 + Math.floor(Math.random() * (SCARVES.length - 1))] : 'none', scarfColor: Math.floor(Math.random() * 12),
      });
      room.members.set(id, { id, name, look, bot: true, owner: p.id });
      if (room.mode === 'brawl') addLateComer(room, id);
      broadcast(room, roomPayload(room));
      brawlCheck(room);
      break;
    }
    case 'botRemove': {
      if (!room || room.hostId !== p.id) break;
      const bots = [...room.members.values()].filter(m => m.bot);
      const b = msg.id ? bots.find(x => x.id === msg.id) : bots[bots.length - 1];
      if (b) { room.members.delete(b.id); broadcast(room, roomPayload(room)); brawlCheck(room); }
      break;
    }
    case 'st': { // 角色狀態 → 轉送
      if (!room) break;
      const e = msg.e;
      const m = room.members.get(e);
      if (!m || (m.bot ? m.owner !== p.id : e !== p.id)) break;
      broadcast(room, msg, p.id);
      break;
    }
    case 'ev': { // 遊戲事件 → 轉送
      if (!room) break;
      const src = msg.src;
      const m = room.members.get(src);
      if (src && (!m || (m.bot ? m.owner !== p.id : src !== p.id))) break;
      if (msg.k === 'out' && room.mode === 'brawl' && room.brawl.phase === 'fight' && src) {
        if (!room.brawl.out.has(src)) { room.brawl.out.add(src); sendBrawl(room); brawlCheck(room); }
      }
      broadcast(room, msg, p.id);
      break;
    }
    case 'chat': {
      if (!room) break;
      const text = String(msg.text || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 120);
      if (!text) break;
      broadcast(room, { t: 'chat', from: p.id, name: p.name, text });
      break;
    }
    case 'fish': { // 釣到魚 → 存圖鑑
      const id = String(msg.fish || '').slice(0, 24);
      const size = Math.max(0, Math.min(1000, Number(msg.size) || 0));
      if (!id) break;
      const rec = p.fishBook[id] || { count: 0, best: 0 };
      const newRecord = size > rec.best;
      rec.count += 1; if (newRecord) rec.best = size;
      p.fishBook[id] = rec;
      saveSoon();
      send(ws, { t: 'fishBook', fishBook: p.fishBook, last: id, newRecord });
      break;
    }
    case 'ping': send(ws, { t: 'pong', at: msg.at }); break;
  }
}

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 });
wss.on('connection', ws => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', data => {
    let msg; try { msg = JSON.parse(data); } catch { return; }
    if (!msg || typeof msg.t !== 'string') return;
    try { handle(ws, msg); } catch (e) { console.error('訊息處理錯誤', e); }
  });
  ws.on('close', () => {
    if (!ws.pid) return;
    if (ws.roomCode) leaveRoom(ws);
    if (online.get(ws.pid) === ws) { online.delete(ws.pid); pushFriendsOfFriends(ws.pid); }
  });
});
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false; ws.ping();
  }
}, 15000);

server.listen(PORT, () => {
  console.log('');
  console.log('  🐶🐱  毛毛大亂鬥 伺服器已啟動！');
  console.log(`  本機遊玩：  http://localhost:${PORT}`);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) console.log(`  區網朋友：  http://${a.address}:${PORT}`);
  }
  console.log('  (關閉這個視窗就會停止伺服器)');
  console.log('');
});
