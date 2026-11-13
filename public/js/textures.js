// 程式產生的貼圖（不需要外部圖片檔）
import * as THREE from 'three';
import { mulberry32, noise2 } from './util.js';

const cache = new Map();
function cached(key, fn) { if (!cache.has(key)) cache.set(key, fn()); return cache.get(key); }

function canvas(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function tex(c, { srgb = true, repeat = [1, 1] } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 針織紋理（灰階，乘上顏色）
export function knitTexture() {
  return cached('knit', () => {
    const [c, g] = canvas(128);
    g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, 128, 128);
    const cols = 8, rows = 10, w = 128 / cols, h = 128 / rows;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const x = i * w, y = j * h;
      for (const side of [0, 1]) {
        const grd = g.createLinearGradient(x, y, x + w, y + h);
        grd.addColorStop(0, '#ffffff'); grd.addColorStop(1, '#bdbdbd');
        g.fillStyle = grd;
        g.beginPath();
        if (side === 0) { g.moveTo(x + 1, y); g.quadraticCurveTo(x + w * 0.2, y + h * 0.9, x + w * 0.5, y + h * 1.1); g.lineTo(x + w * 0.5, y + h * 0.6); g.quadraticCurveTo(x + w * 0.3, y + h * 0.2, x + 1, y); }
        else { g.moveTo(x + w - 1, y); g.quadraticCurveTo(x + w * 0.8, y + h * 0.9, x + w * 0.5, y + h * 1.1); g.lineTo(x + w * 0.5, y + h * 0.6); g.quadraticCurveTo(x + w * 0.7, y + h * 0.2, x + w - 1, y); }
        g.fill();
      }
    }
    return tex(c, { repeat: [3, 1] });
  });
}

export function stripeTexture(a, b, n = 6) {
  return cached(`stripe${a}${b}${n}`, () => {
    const [c, g] = canvas(64, 256);
    for (let i = 0; i < n; i++) { g.fillStyle = i % 2 ? b : a; g.fillRect(0, (i * 256) / n, 64, 256 / n + 1); }
    return tex(c);
  });
}

export function plaidTexture(base) {
  return cached('plaid' + base, () => {
    const [c, g] = canvas(128);
    g.fillStyle = base; g.fillRect(0, 0, 128, 128);
    g.globalAlpha = 0.35; g.fillStyle = '#1e1a18';
    for (let i = 0; i < 128; i += 32) { g.fillRect(i, 0, 12, 128); g.fillRect(0, i, 128, 12); }
    g.globalAlpha = 0.5; g.fillStyle = '#fff6d8';
    for (let i = 20; i < 128; i += 32) { g.fillRect(i, 0, 2, 128); g.fillRect(0, i, 128, 2); }
    g.globalAlpha = 1;
    return tex(c, { repeat: [3, 1] });
  });
}

export function dotsTexture(base) {
  return cached('dots' + base, () => {
    const [c, g] = canvas(128);
    g.fillStyle = base; g.fillRect(0, 0, 128, 128);
    g.fillStyle = 'rgba(255,255,255,0.85)';
    for (let y = 0; y < 128; y += 21) for (let x = (y / 21) % 2 ? 10 : 0; x < 128; x += 21) { g.beginPath(); g.arc(x + 5, y + 5, 3.5, 0, Math.PI * 2); g.fill(); }
    return tex(c, { repeat: [2, 2] });
  });
}

export function strawTexture() {
  return cached('straw', () => {
    const [c, g] = canvas(256);
    g.fillStyle = '#e2c27a'; g.fillRect(0, 0, 256, 256);
    const r = mulberry32(7);
    for (let i = 0; i < 900; i++) {
      const y = r() * 256, x = r() * 256, l = 20 + r() * 40;
      g.strokeStyle = r() < 0.5 ? 'rgba(160,120,50,0.35)' : 'rgba(255,240,190,0.45)';
      g.lineWidth = 1 + r() * 2;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + l, y + (r() - 0.5) * 3); g.stroke();
    }
    for (let y = 0; y < 256; y += 16) { g.fillStyle = 'rgba(120,85,30,0.18)'; g.fillRect(0, y, 256, 2); }
    return tex(c, { repeat: [4, 1] });
  });
}

// 木板（碼頭、擂台）
export function woodTexture(seed = 3, tint = '#a8774a') {
  return cached('wood' + seed + tint, () => {
    const [c, g] = canvas(512);
    const r = mulberry32(seed);
    const planks = 8, ph = 512 / planks;
    for (let p = 0; p < planks; p++) {
      const y0 = p * ph;
      const shade = 0.82 + r() * 0.3;
      const base = new THREE.Color(tint).multiplyScalar(shade);
      g.fillStyle = `#${base.getHexString()}`;
      g.fillRect(0, y0, 512, ph);
      for (let k = 0; k < 40; k++) {
        const y = y0 + r() * ph;
        g.strokeStyle = `rgba(${r() < 0.5 ? '60,35,15' : '230,190,140'},${0.08 + r() * 0.14})`;
        g.lineWidth = 0.6 + r() * 1.6;
        g.beginPath(); g.moveTo(0, y);
        for (let x = 0; x <= 512; x += 32) g.lineTo(x, y + Math.sin(x * 0.02 + k) * 1.5 + (r() - 0.5));
        g.stroke();
      }
      if (r() < 0.6) { // 木節
        const kx = r() * 512, ky = y0 + ph * (0.3 + r() * 0.4);
        g.fillStyle = 'rgba(70,40,18,0.45)'; g.beginPath(); g.ellipse(kx, ky, 7 + r() * 5, 4, 0, 0, Math.PI * 2); g.fill();
      }
      g.fillStyle = 'rgba(40,22,10,0.75)'; g.fillRect(0, y0, 512, 3);
      const cut = r() * 512; g.fillRect(cut, y0, 3, ph);
      g.fillStyle = 'rgba(60,60,60,0.8)';
      for (const nx of [cut - 14, cut + 17]) { g.beginPath(); g.arc(nx, y0 + 10, 2.2, 0, 7); g.arc(nx, y0 + ph - 10, 2.2, 0, 7); g.fill(); }
    }
    return tex(c);
  });
}

export function crateTexture() {
  return cached('crate', () => {
    const [c, g] = canvas(256);
    g.fillStyle = '#b8864e'; g.fillRect(0, 0, 256, 256);
    const r = mulberry32(11);
    for (let i = 0; i < 160; i++) { g.strokeStyle = `rgba(90,55,25,${0.08 + r() * 0.12})`; g.lineWidth = 1; const y = r() * 256; g.beginPath(); g.moveTo(0, y); g.lineTo(256, y + (r() - 0.5) * 6); g.stroke(); }
    g.strokeStyle = '#7a5129'; g.lineWidth = 22; g.strokeRect(11, 11, 234, 234);
    g.lineWidth = 20; g.beginPath(); g.moveTo(20, 20); g.lineTo(236, 236); g.stroke();
    g.strokeStyle = 'rgba(40,20,5,0.5)'; g.lineWidth = 2; g.strokeRect(22, 22, 212, 212); g.strokeRect(1, 1, 254, 254);
    return tex(c);
  });
}

export function barkTexture() {
  return cached('bark', () => {
    const [c, g] = canvas(128, 256);
    g.fillStyle = '#6b4a33'; g.fillRect(0, 0, 128, 256);
    const r = mulberry32(5);
    for (let i = 0; i < 140; i++) {
      const x = r() * 128;
      g.strokeStyle = r() < 0.5 ? 'rgba(40,25,15,0.5)' : 'rgba(140,105,80,0.35)';
      g.lineWidth = 1 + r() * 3;
      g.beginPath(); g.moveTo(x, 0);
      for (let y = 0; y <= 256; y += 16) g.lineTo(x + Math.sin(y * 0.05 + i) * 3, y);
      g.stroke();
    }
    return tex(c, { repeat: [2, 2] });
  });
}

// 地表細節（灰階雜訊，乘上頂點色）
export function groundDetailTexture() {
  return cached('ground', () => {
    const S = 256;
    const [c, g] = canvas(S);
    const img = g.createImageData(S, S);
    const r = mulberry32(9);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const n = noise2(x / 16, y / 16) * 0.5 + noise2(x / 5, y / 5) * 0.3 + (r() - 0.5) * 0.35;
      const v = Math.max(0, Math.min(255, 215 + n * 60));
      const i = (y * S + x) * 4;
      img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    // 讓邊緣可以無縫重複：把四邊混合
    return tex(c, { repeat: [60, 60] });
  });
}

// 可無縫重複的水面法線貼圖
export function waterNormalTexture(seed = 1) {
  return cached('waterN' + seed, () => {
    const S = 256;
    const [c, g] = canvas(S);
    const img = g.createImageData(S, S);
    const r = mulberry32(seed);
    const waves = [];
    for (let i = 0; i < 18; i++) {
      const fx = Math.round((r() - 0.5) * 16) || 1, fy = Math.round((r() - 0.5) * 16);
      waves.push({ fx, fy, a: 1 / Math.hypot(fx, fy), p: r() * Math.PI * 2 });
    }
    const hgt = new Float32Array(S * S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      let h = 0;
      for (const w of waves) h += Math.sin(((x * w.fx + y * w.fy) / S) * Math.PI * 2 + w.p) * w.a;
      hgt[y * S + x] = h;
    }
    const k = 2.2;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const hl = hgt[y * S + ((x - 1 + S) % S)], hr = hgt[y * S + ((x + 1) % S)];
      const hd = hgt[((y - 1 + S) % S) * S + x], hu = hgt[((y + 1) % S) * S + x];
      let nx = (hl - hr) * k, ny = (hd - hu) * k, nz = 1;
      const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      const i = (y * S + x) * 4;
      img.data[i] = (nx * 0.5 + 0.5) * 255; img.data[i + 1] = (ny * 0.5 + 0.5) * 255; img.data[i + 2] = (nz * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return tex(c, { srgb: false });
  });
}

export function canLabelTexture() {
  return cached('can', () => {
    const [c, g] = canvas(256, 128);
    g.fillStyle = '#d9413b'; g.fillRect(0, 0, 256, 128);
    g.fillStyle = '#fff'; g.fillRect(0, 44, 256, 40);
    g.fillStyle = '#d9413b'; g.font = 'bold 30px sans-serif'; g.fillText('汽水 SODA', 40, 76);
    return tex(c);
  });
}

// 名牌
export function nameTagTexture(text, color = '#ffffff') {
  const [c, g] = canvas(256, 64);
  g.font = 'bold 34px "Microsoft JhengHei", "PingFang TC", sans-serif';
  const w = Math.min(250, g.measureText(text).width + 28);
  g.fillStyle = 'rgba(30,20,12,0.55)';
  const x = (256 - w) / 2;
  g.beginPath(); g.roundRect(x, 8, w, 48, 24); g.fill();
  g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 128, 33);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function emojiTexture(emoji, size = 128) {
  return cached('emoji' + emoji, () => {
    const [c, g] = canvas(size);
    g.font = `${size * 0.8}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(emoji, size / 2, size / 2 + size * 0.05);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

export function softDotTexture() {
  return cached('softdot', () => {
    const [c, g] = canvas(64);
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.5, 'rgba(255,255,255,0.6)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

export function ringTexture() {
  return cached('ring', () => {
    const [c, g] = canvas(128);
    g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 6;
    g.beginPath(); g.arc(64, 64, 56, 0, Math.PI * 2); g.stroke();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}
