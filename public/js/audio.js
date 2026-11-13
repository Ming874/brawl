// 音效：全部用 WebAudio 即時合成（不需要音檔）
export class Audio {
  constructor() {
    this.ctx = null; this.master = null; this.volume = 0.7;
    this.noiseBuf = null;
    const unlock = () => { this.init(); if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); };
    addEventListener('pointerdown', unlock); addEventListener('keydown', unlock);
  }
  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain(); this.master.gain.value = this.volume; this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.startAmbience();
    } catch { this.ctx = null; }
  }
  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }

  env(g, t, a, peak, dcy) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dcy); }
  tone(type, f0, f1, dur, vol = 0.3, delay = 0, dest = null) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    this.env(g, t, 0.008, vol, dur);
    o.connect(g); g.connect(dest || this.master); o.start(t); o.stop(t + dur + 0.05);
  }
  noise(dur, vol = 0.3, { type = 'lowpass', f0 = 1200, f1 = 300, q = 1, delay = 0, attack = 0.005 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    const g = this.ctx.createGain(); this.env(g, t, attack, vol, dur);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + attack + 0.05);
  }

  // ---- 遊戲音效
  punch(volume = 1) { this.noise(0.12, 0.5 * volume, { f0: 900, f1: 120 }); this.tone('sine', 160, 50, 0.14, 0.5 * volume); }
  whoosh() { this.noise(0.18, 0.12, { type: 'bandpass', f0: 600, f1: 2200, q: 2, attack: 0.04 }); }
  squeak(pitch = 1) { // 被打到的憨憨叫聲
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain(), lfo = this.ctx.createOscillator(), lg = this.ctx.createGain();
    o.type = 'triangle'; const f = (500 + Math.random() * 250) * pitch;
    o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 1.6, t + 0.08); o.frequency.exponentialRampToValueAtTime(f * 0.8, t + 0.22);
    lfo.frequency.value = 28; lg.gain.value = 40; lfo.connect(lg); lg.connect(o.frequency);
    this.env(g, t, 0.01, 0.16, 0.22);
    o.connect(g); g.connect(this.master); o.start(t); lfo.start(t); o.stop(t + 0.3); lfo.stop(t + 0.3);
  }
  boing() { this.tone('sine', 180, 520, 0.35, 0.35); this.tone('sine', 520, 160, 0.3, 0.2, 0.18); }
  dizzy() { for (let i = 0; i < 4; i++) this.tone('sine', 1200 + i * 200, 1500 + i * 200, 0.08, 0.08, i * 0.07); }
  jump() { this.tone('square', 300, 520, 0.09, 0.05); }
  land() { this.noise(0.06, 0.12, { f0: 500, f1: 100 }); }
  step() { this.noise(0.04, 0.035, { f0: 700, f1: 200 }); }
  splash(big = 1) { this.noise(0.5 * big, 0.35 * big, { f0: 3000, f1: 300, attack: 0.01 }); this.noise(0.25, 0.25, { type: 'highpass', f0: 2000, f1: 4000, delay: 0.05 }); }
  grab() { this.tone('triangle', 400, 300, 0.08, 0.12); }
  throw_() { this.noise(0.3, 0.2, { type: 'bandpass', f0: 400, f1: 2500, q: 1.5, attack: 0.05 }); this.tone('sine', 300, 700, 0.25, 0.1); }
  cast() { this.noise(0.4, 0.15, { type: 'bandpass', f0: 2500, f1: 500, q: 3, attack: 0.02 }); }
  plop() { this.tone('sine', 900, 250, 0.12, 0.3); this.noise(0.12, 0.1, { f0: 2000, f1: 400 }); }
  bite() { this.plop(); this.tone('square', 880, 880, 0.08, 0.1, 0.12); this.tone('square', 1320, 1320, 0.12, 0.1, 0.22); }
  reelTick() { this.tone('square', 2400, 2000, 0.015, 0.03); }
  snap() { this.tone('sawtooth', 900, 100, 0.25, 0.15); this.noise(0.15, 0.3, { type: 'highpass', f0: 3000, f1: 800 }); }
  fanfare(big = false) {
    const notes = big ? [523, 659, 784, 1047, 784, 1047] : [523, 659, 784, 1047];
    notes.forEach((n, i) => { this.tone('triangle', n, n, 0.16, 0.18, i * 0.11); this.tone('sine', n * 2, n * 2, 0.12, 0.05, i * 0.11); });
  }
  beep(high = false) { this.tone('square', high ? 1046 : 523, high ? 1046 : 523, high ? 0.4 : 0.15, 0.12); }
  click() { this.tone('sine', 700, 900, 0.05, 0.08); }
  notify() { this.tone('sine', 880, 880, 0.09, 0.12); this.tone('sine', 1320, 1320, 0.14, 0.12, 0.1); }

  // 環境音：微風 + 鳥叫
  startAmbience() {
    if (!this.ctx) return;
    const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
    this.ambGain = this.ctx.createGain(); this.ambGain.gain.value = 0.035;
    s.connect(f); f.connect(this.ambGain); this.ambGain.connect(this.master); s.start();
    const chirp = () => {
      if (this.birds !== false && this.ctx.state === 'running') {
        const base = 2200 + Math.random() * 1500, n = 2 + Math.floor(Math.random() * 4);
        for (let i = 0; i < n; i++) this.tone('sine', base, base * (1.2 + Math.random() * 0.3), 0.07, 0.025, i * 0.11);
      }
      setTimeout(chirp, 2500 + Math.random() * 6000);
    };
    setTimeout(chirp, 3000);
  }
  setScene(name) { this.birds = name !== 'arena'; if (this.ambGain) this.ambGain.gain.value = name === 'arena' ? 0.06 : 0.035; }
}
