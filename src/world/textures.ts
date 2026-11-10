// Procedural canvas textures (no external image assets needed).
import * as THREE from 'three';
import { mulberry32 } from '../rules';

type Ctx = CanvasRenderingContext2D;

function canvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function tex(c: HTMLCanvasElement, repeat = 1, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function noise(ctx: Ctx, w: number, h: number, n: number, alpha: number, seed: number, light = true, size = 2) {
  const r = mulberry32(seed);
  for (let i = 0; i < n; i++) {
    const v = light ? 255 : 0;
    ctx.fillStyle = `rgba(${v},${v},${v},${r() * alpha})`;
    ctx.fillRect(r() * w, r() * h, size * (0.5 + r()), size * (0.5 + r()));
  }
}

const cache = new Map<string, THREE.Texture>();
function cached(key: string, make: () => THREE.Texture) {
  let t = cache.get(key);
  if (!t) {
    t = make();
    cache.set(key, t);
  }
  return t;
}

export function hardwood() {
  return cached('hardwood', () => {
    const [c, ctx] = canvas(512, 512);
    const r = mulberry32(11);
    const rows = 8;
    const ph = 512 / rows;
    for (let y = 0; y < rows; y++) {
      let x = -r() * 300;
      while (x < 512) {
        const len = 180 + r() * 260;
        const base = [150 + r() * 30, 98 + r() * 22, 58 + r() * 16];
        ctx.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`;
        ctx.fillRect(x, y * ph, len, ph);
        // grain
        for (let g = 0; g < 14; g++) {
          ctx.strokeStyle = `rgba(70,40,20,${0.08 + r() * 0.12})`;
          ctx.lineWidth = 0.6 + r() * 1.4;
          ctx.beginPath();
          const gy = y * ph + r() * ph;
          ctx.moveTo(x, gy);
          ctx.bezierCurveTo(x + len * 0.3, gy + (r() - 0.5) * 6, x + len * 0.7, gy + (r() - 0.5) * 6, x + len, gy + (r() - 0.5) * 4);
          ctx.stroke();
        }
        ctx.fillStyle = 'rgba(40,22,10,0.6)';
        ctx.fillRect(x, y * ph, 1.5, ph);
        x += len;
      }
      ctx.fillStyle = 'rgba(40,22,10,0.55)';
      ctx.fillRect(0, y * ph, 512, 1.5);
    }
    noise(ctx, 512, 512, 3000, 0.05, 3);
    return tex(c, 1);
  });
}

export function deckWood() {
  // weathered gray pressure-treated boards with dark gaps (from the video)
  return cached('deck', () => {
    const [c, ctx] = canvas(256, 256);
    const r = mulberry32(21);
    const n = 5;
    const pw = 256 / n;
    for (let i = 0; i < n; i++) {
      const g = 150 + r() * 25;
      ctx.fillStyle = `rgb(${g + 6},${g - 2},${g - 18})`;
      ctx.fillRect(i * pw, 0, pw - 4, 256);
      for (let k = 0; k < 14; k++) {
        ctx.strokeStyle = `rgba(70,60,45,${0.1 + r() * 0.2})`;
        ctx.lineWidth = 0.6 + r();
        ctx.beginPath();
        const gx = i * pw + r() * pw;
        ctx.moveTo(gx, 0);
        ctx.bezierCurveTo(gx + (r() - 0.5) * 6, 80, gx + (r() - 0.5) * 6, 170, gx + (r() - 0.5) * 6, 256);
        ctx.stroke();
      }
      // darker weathering stains and a few knots
      for (let k = 0; k < 4; k++) {
        ctx.fillStyle = `rgba(80,70,55,${0.08 + r() * 0.12})`;
        ctx.beginPath();
        ctx.ellipse(i * pw + r() * pw, r() * 256, 4 + r() * 10, 10 + r() * 30, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(55,40,25,0.75)';
      ctx.beginPath();
      ctx.ellipse(i * pw + pw * r(), 256 * r(), 3, 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(25,20,14,0.9)';
      ctx.fillRect(i * pw + pw - 4, 0, 4, 256);
      ctx.fillStyle = 'rgba(40,40,40,0.7)';
      for (const y of [40, 200]) {
        ctx.fillRect(i * pw + 6, y, 2, 2);
        ctx.fillRect(i * pw + pw - 12, y, 2, 2);
      }
    }
    noise(ctx, 256, 256, 1800, 0.08, 4, false);
    return tex(c, 1);
  });
}

export function grass() {
  // late-October yard under live oaks: thin, slightly dry grass with lots of fallen leaves (from the video)
  return cached('grass', () => {
    const [c, ctx] = canvas(512, 512);
    ctx.fillStyle = '#6a7535';
    ctx.fillRect(0, 0, 512, 512);
    const r = mulberry32(5);
    // soft tonal patches: greener and bare/dusty areas
    for (let i = 0; i < 70; i++) {
      const dry = r() < 0.55;
      ctx.fillStyle = dry ? `rgba(${128 + r() * 30},${112 + r() * 20},${70 + r() * 15},${0.18 + r() * 0.2})` : `rgba(${70 + r() * 20},${110 + r() * 25},${40},${0.15 + r() * 0.15})`;
      ctx.beginPath();
      ctx.ellipse(r() * 512, r() * 512, 20 + r() * 60, 14 + r() * 40, r() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < 20000; i++) {
      const g = 95 + r() * 70;
      const dry = r() < 0.35;
      ctx.strokeStyle = dry ? `rgba(${140 + r() * 40},${125 + r() * 30},${70},${0.35 + r() * 0.4})` : `rgba(${60 + r() * 50},${g + 10},${30 + r() * 25},${0.35 + r() * 0.45})`;
      ctx.lineWidth = 1;
      const x = r() * 512;
      const y = r() * 512;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (r() - 0.5) * 3, y - 3 - r() * 6);
      ctx.stroke();
    }
    // fallen oak leaves
    for (let i = 0; i < 900; i++) {
      const t = r();
      ctx.fillStyle = `rgba(${95 + t * 70},${62 + t * 40},${28 + t * 15},${0.55 + r() * 0.35})`;
      ctx.beginPath();
      ctx.ellipse(r() * 512, r() * 512, 2.2 + r() * 2.5, 1.1 + r() * 1.1, r() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    return tex(c, 1);
  });
}

export function soil() {
  return cached('soil', () => {
    const [c, ctx] = canvas(256, 256);
    ctx.fillStyle = '#6b5440';
    ctx.fillRect(0, 0, 256, 256);
    noise(ctx, 256, 256, 6000, 0.25, 6, false, 2);
    noise(ctx, 256, 256, 2000, 0.15, 7, true, 2);
    const r = mulberry32(8);
    for (let i = 0; i < 80; i++) {
      ctx.fillStyle = `rgba(${130 + r() * 40},${100 + r() * 30},60,0.6)`;
      ctx.beginPath();
      ctx.ellipse(r() * 256, r() * 256, 3, 1.4, r() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    return tex(c, 1);
  });
}

export function siding() {
  return cached('siding', () => {
    const [c, ctx] = canvas(256, 256);
    const rows = 12;
    const h = 256 / rows;
    for (let i = 0; i < rows; i++) {
      const grad = ctx.createLinearGradient(0, i * h, 0, (i + 1) * h);
      grad.addColorStop(0, '#f3ead6');
      grad.addColorStop(0.85, '#e6dcc4');
      grad.addColorStop(1, '#b9ad94');
      ctx.fillStyle = grad;
      ctx.fillRect(0, i * h, 256, h);
    }
    noise(ctx, 256, 256, 1500, 0.04, 9, false);
    return tex(c, 1);
  });
}

export function plaster(color = '#efe6d2') {
  return cached('plaster' + color, () => {
    const [c, ctx] = canvas(128, 128);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 128, 128);
    noise(ctx, 128, 128, 1400, 0.03, 10, false, 3);
    noise(ctx, 128, 128, 800, 0.04, 12, true, 3);
    return tex(c, 1);
  });
}

export function kitchenFloor() {
  return cached('kfloor', () => {
    const [c, ctx] = canvas(256, 256);
    const n = 4;
    const s = 256 / n;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        ctx.fillStyle = (i + j) % 2 ? '#e8e1d0' : '#d9d0bc';
        ctx.fillRect(i * s, j * s, s, s);
      }
    ctx.strokeStyle = 'rgba(120,110,90,0.4)';
    for (let i = 0; i <= n; i++) {
      ctx.beginPath();
      ctx.moveTo(i * s, 0);
      ctx.lineTo(i * s, 256);
      ctx.moveTo(0, i * s);
      ctx.lineTo(256, i * s);
      ctx.stroke();
    }
    noise(ctx, 256, 256, 2500, 0.05, 13, false);
    return tex(c, 1);
  });
}

export function shingles() {
  return cached('shingles', () => {
    const [c, ctx] = canvas(256, 256);
    ctx.fillStyle = '#5d6166';
    ctx.fillRect(0, 0, 256, 256);
    const r = mulberry32(14);
    const rows = 10;
    const h = 256 / rows;
    for (let y = 0; y < rows; y++) {
      const off = (y % 2) * 16;
      for (let x = -32; x < 256; x += 32) {
        const g = 78 + r() * 26;
        ctx.fillStyle = `rgb(${g},${g + 3},${g + 7})`;
        ctx.fillRect(x + off + 1, y * h + 1, 30, h - 2);
      }
      ctx.fillStyle = 'rgba(20,20,25,0.6)';
      ctx.fillRect(0, y * h + h - 3, 256, 3);
    }
    noise(ctx, 256, 256, 5000, 0.12, 15, true, 1.5);
    return tex(c, 1);
  });
}

export function lattice() {
  return cached('lattice', () => {
    const [c, ctx] = canvas(128, 128);
    ctx.clearRect(0, 0, 128, 128);
    ctx.strokeStyle = '#efeee6';
    ctx.lineWidth = 9;
    for (let i = -128; i < 256; i += 32) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + 128, 128);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(i + 128, 0);
      ctx.lineTo(i, 128);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(120,120,110,0.4)';
    ctx.lineWidth = 1;
    for (let i = -128; i < 256; i += 32) {
      ctx.beginPath();
      ctx.moveTo(i + 4, 0);
      ctx.lineTo(i + 132, 128);
      ctx.stroke();
    }
    return tex(c, 1);
  });
}

export function chainlink() {
  return cached('chain', () => {
    const [c, ctx] = canvas(64, 64);
    ctx.clearRect(0, 0, 64, 64);
    ctx.strokeStyle = '#2a2d2c';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(0, 32);
    ctx.lineTo(32, 0);
    ctx.lineTo(64, 32);
    ctx.lineTo(32, 64);
    ctx.closePath();
    ctx.stroke();
    return tex(c, 1);
  });
}

export function bark() {
  return cached('bark', () => {
    const [c, ctx] = canvas(128, 256);
    ctx.fillStyle = '#4e4238';
    ctx.fillRect(0, 0, 128, 256);
    const r = mulberry32(16);
    for (let i = 0; i < 70; i++) {
      ctx.strokeStyle = `rgba(${20 + r() * 20},${18 + r() * 15},${14},${0.5 + r() * 0.4})`;
      ctx.lineWidth = 1 + r() * 3;
      const x = r() * 128;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      for (let y = 0; y < 256; y += 16) ctx.lineTo(x + (r() - 0.5) * 8, y);
      ctx.stroke();
    }
    noise(ctx, 128, 256, 3000, 0.12, 17, true);
    for (let i = 0; i < 30; i++) {
      ctx.fillStyle = `rgba(110,130,90,${0.15 + r() * 0.2})`;
      ctx.beginPath();
      ctx.ellipse(r() * 128, r() * 256, 6 + r() * 10, 3 + r() * 8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    return tex(c, 1);
  });
}

export function leaves(hue: 'oak' | 'magnolia' | 'shrub' | 'myrtle') {
  return cached('leaves' + hue, () => {
    const [c, ctx] = canvas(256, 256);
    ctx.clearRect(0, 0, 256, 256);
    const r = mulberry32(hue.length * 7 + 3);
    const n = hue === 'magnolia' ? 90 : 260;
    for (let i = 0; i < n; i++) {
      const x = 20 + r() * 216;
      const y = 20 + r() * 216;
      const dx = x - 128;
      const dy = y - 128;
      if (dx * dx + dy * dy > 118 * 118) continue;
      let col: string;
      const v = r();
      if (hue === 'oak') col = `rgb(${40 + v * 40},${75 + v * 55},${25 + v * 20})`;
      else if (hue === 'magnolia') col = `rgb(${25 + v * 30},${60 + v * 40},${25 + v * 15})`;
      else if (hue === 'myrtle') col = r() < 0.35 ? `rgb(${210 + v * 40},${90 + v * 50},${140 + v * 40})` : `rgb(${50 + v * 30},${90 + v * 50},${35})`;
      else col = `rgb(${45 + v * 35},${85 + v * 55},${30 + v * 20})`;
      ctx.fillStyle = col;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(r() * Math.PI * 2);
      const s = hue === 'magnolia' ? 11 : hue === 'oak' ? 7 : 6;
      ctx.beginPath();
      ctx.ellipse(0, 0, s, s * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(20,40,10,0.35)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(-s, 0);
      ctx.lineTo(s, 0);
      ctx.stroke();
      ctx.restore();
    }
    return tex(c, 1);
  });
}

export function wicker() {
  return cached('wicker', () => {
    const [c, ctx] = canvas(128, 128);
    ctx.fillStyle = '#9a7445';
    ctx.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 128; y += 8) {
      for (let x = 0; x < 128; x += 16) {
        const off = (y / 8) % 2 ? 8 : 0;
        const g = ctx.createLinearGradient(x + off, y, x + off + 16, y);
        g.addColorStop(0, '#6b4b26');
        g.addColorStop(0.5, '#d2a86a');
        g.addColorStop(1, '#6b4b26');
        ctx.fillStyle = g;
        ctx.fillRect(x + off, y + 1, 15, 6);
      }
    }
    for (let x = 0; x < 128; x += 16) {
      ctx.fillStyle = 'rgba(70,45,20,0.6)';
      ctx.fillRect(x + 7, 0, 2, 128);
    }
    return tex(c, 1);
  });
}

export function fabric(color: string, seed = 1) {
  return cached('fabric' + color, () => {
    const [c, ctx] = canvas(128, 128);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 128; y += 2) {
      ctx.fillStyle = `rgba(0,0,0,${y % 4 ? 0.06 : 0.02})`;
      ctx.fillRect(0, y, 128, 1);
    }
    for (let x = 0; x < 128; x += 2) {
      ctx.fillStyle = 'rgba(255,255,255,0.03)';
      ctx.fillRect(x, 0, 1, 128);
    }
    noise(ctx, 128, 128, 800, 0.06, seed + 30, false);
    return tex(c, 1);
  });
}

export function shedWhite() {
  return cached('shedwhite', () => {
    const [c, ctx] = canvas(256, 256);
    ctx.fillStyle = '#ece9df';
    ctx.fillRect(0, 0, 256, 256);
    const r = mulberry32(31);
    // weathering streaks and mildew like the photo
    for (let i = 0; i < 60; i++) {
      const x = r() * 256;
      const g = ctx.createLinearGradient(x, 0, x, 256);
      g.addColorStop(0, 'rgba(120,120,100,0)');
      g.addColorStop(0.6 + r() * 0.3, `rgba(${90 + r() * 30},${95 + r() * 20},${80},${0.1 + r() * 0.15})`);
      g.addColorStop(1, 'rgba(90,90,70,0.3)');
      ctx.fillStyle = g;
      ctx.fillRect(x, 0, 2 + r() * 10, 256);
    }
    for (let i = 0; i < 25; i++) {
      ctx.fillStyle = `rgba(${80 + r() * 40},${90 + r() * 30},${70},${0.08 + r() * 0.12})`;
      ctx.beginPath();
      ctx.ellipse(r() * 256, 180 + r() * 76, 8 + r() * 30, 4 + r() * 18, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    noise(ctx, 256, 256, 3000, 0.06, 32, false);
    return tex(c, 1);
  });
}

export function osb() {
  return cached('osb', () => {
    const [c, ctx] = canvas(256, 256);
    ctx.fillStyle = '#8a857a';
    ctx.fillRect(0, 0, 256, 256);
    const r = mulberry32(33);
    for (let i = 0; i < 900; i++) {
      const v = 100 + r() * 70;
      ctx.fillStyle = `rgba(${v + 10},${v + 5},${v - 5},${0.35 + r() * 0.35})`;
      ctx.save();
      ctx.translate(r() * 256, r() * 256);
      ctx.rotate(r() * Math.PI);
      ctx.fillRect(-8, -2, 10 + r() * 14, 3 + r() * 3);
      ctx.restore();
    }
    // panel seams
    ctx.strokeStyle = 'rgba(50,48,44,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(128, 0);
    ctx.lineTo(128, 256);
    ctx.stroke();
    noise(ctx, 256, 256, 2000, 0.1, 34, false);
    return tex(c, 1);
  });
}

export function concrete() {
  return cached('concrete', () => {
    const [c, ctx] = canvas(256, 256);
    ctx.fillStyle = '#a9a69e';
    ctx.fillRect(0, 0, 256, 256);
    noise(ctx, 256, 256, 6000, 0.12, 35, false, 2);
    noise(ctx, 256, 256, 3000, 0.1, 36, true, 2);
    ctx.strokeStyle = 'rgba(60,60,60,0.4)';
    ctx.beginPath();
    ctx.moveTo(0, 128);
    ctx.lineTo(256, 128);
    ctx.stroke();
    return tex(c, 1);
  });
}

export function asphalt() {
  return cached('asphalt', () => {
    const [c, ctx] = canvas(256, 256);
    ctx.fillStyle = '#3b3c3e';
    ctx.fillRect(0, 0, 256, 256);
    noise(ctx, 256, 256, 9000, 0.18, 37, true, 1.5);
    return tex(c, 1);
  });
}

export function rug() {
  return cached('rug', () => {
    const [c, ctx] = canvas(256, 256);
    ctx.fillStyle = '#7c3b2c';
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = '#d9c39a';
    ctx.lineWidth = 8;
    ctx.strokeRect(14, 14, 228, 228);
    ctx.strokeStyle = '#2f4a5a';
    ctx.lineWidth = 5;
    ctx.strokeRect(30, 30, 196, 196);
    ctx.fillStyle = '#c9a66b';
    for (let i = 0; i < 4; i++) {
      ctx.save();
      ctx.translate(128, 128);
      ctx.rotate((i * Math.PI) / 2);
      ctx.beginPath();
      ctx.moveTo(0, -70);
      ctx.lineTo(24, -30);
      ctx.lineTo(0, -10);
      ctx.lineTo(-24, -30);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    noise(ctx, 256, 256, 6000, 0.08, 38, false, 2);
    return tex(c, 1);
  });
}

export function netting() {
  return cached('net', () => {
    const [c, ctx] = canvas(64, 64);
    ctx.clearRect(0, 0, 64, 64);
    ctx.strokeStyle = 'rgba(60,150,90,0.9)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 64; i += 16) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 64);
      ctx.moveTo(0, i);
      ctx.lineTo(64, i);
      ctx.stroke();
    }
    return tex(c, 1);
  });
}

export function grassBlade() {
  return cached('blade', () => {
    const [c, ctx] = canvas(64, 64);
    ctx.clearRect(0, 0, 64, 64);
    const r = mulberry32(40);
    for (let i = 0; i < 16; i++) {
      const x = 4 + r() * 56;
      const h = 30 + r() * 32;
      const g = ctx.createLinearGradient(0, 64, 0, 64 - h);
      const dry = r() < 0.35;
      g.addColorStop(0, '#56702c');
      g.addColorStop(1, dry ? `rgb(${160 + r() * 30},${150 + r() * 25},${85})` : `rgb(${105 + r() * 35},${140 + r() * 30},${60})`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x - 1.6, 64);
      ctx.quadraticCurveTo(x + (r() - 0.5) * 6, 64 - h * 0.6, x + (r() - 0.5) * 10, 64 - h);
      ctx.quadraticCurveTo(x + 1, 64 - h * 0.5, x + 1.6, 64);
      ctx.fill();
    }
    return tex(c, 1);
  });
}

export function skyTexture() {
  const [c, ctx] = canvas(16, 256);
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#5f97d6');
  g.addColorStop(0.45, '#9cc4ea');
  g.addColorStop(0.62, '#dfe9ef');
  g.addColorStop(1, '#e8eadf');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 16, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function radialShadow() {
  return cached('blob', () => {
    const [c, ctx] = canvas(64, 64);
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 31);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.55, 'rgba(160,160,160,0.6)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    return t;
  });
}

export function glowDot(color = '255,210,80') {
  return cached('glow' + color, () => {
    const [c, ctx] = canvas(64, 64);
    const g = ctx.createRadialGradient(32, 32, 1, 32, 32, 31);
    g.addColorStop(0, `rgba(${color},1)`);
    g.addColorStop(0.35, `rgba(${color},0.6)`);
    g.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  });
}
