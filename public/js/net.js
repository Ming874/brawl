// WebSocket 連線（自動重連）
export class Net {
  constructor() {
    this.handlers = new Map();
    this.ws = null; this.connected = false; this.queue = [];
    this.retry = 0;
  }
  on(type, fn) { if (!this.handlers.has(type)) this.handlers.set(type, []); this.handlers.get(type).push(fn); }
  emit(type, msg) { for (const fn of this.handlers.get(type) || []) fn(msg); }
  connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws = ws;
    ws.onopen = () => { this.connected = true; this.retry = 0; this.emit('open'); for (const m of this.queue) ws.send(m); this.queue = []; };
    ws.onmessage = ev => { let m; try { m = JSON.parse(ev.data); } catch { return; } this.emit(m.t, m); };
    ws.onclose = () => {
      const was = this.connected; this.connected = false;
      if (this.ws !== ws) return;
      this.emit('close', { was });
      if (this.noReconnect) return;
      this.retry++;
      setTimeout(() => this.connect(), Math.min(5000, 600 * this.retry));
    };
    ws.onerror = () => {};
  }
  send(msg) {
    const s = JSON.stringify(msg);
    if (this.connected && this.ws.readyState === 1) this.ws.send(s);
    else if (msg.t !== 'st' && msg.t !== 'ev') this.queue.push(s);
  }
}
