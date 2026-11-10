// Procedural canvas textures for the interior, matched to the owner's walkthrough video.
import * as THREE from 'three';
import { mulberry32 } from '../rules';

type Ctx = CanvasRenderingContext2D;

function canvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}
function tex(c: HTMLCanvasElement, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const cache = new Map<string, THREE.Texture>();
function cached(key: string, make: () => THREE.Texture) {
  let t = cache.get(key);
  if (!t) cache.set(key, (t = make()));
  return t;
}
function speckle(ctx: Ctx, w: number, h: number, n: number, alpha: number, seed: number, dark = true, size = 2) {
  const r = mulberry32(seed);
  for (let i = 0; i < n; i++) {
    const v = dark ? 0 : 255;
    ctx.fillStyle = `rgba(${v},${v},${v},${r() * alpha})`;
    ctx.fillRect(r() * w, r() * h, size * (0.5 + r()), size * (0.5 + r()));
  }
}

/** Gray-and-white encaustic-look cement tile (kitchen, bath, laundry). One texture repeat = 2x2 tiles. */
export function encaustic(ink = '#4d4c49', ground = '#e9e6de') {
  return cached('enc' + ink + ground, () => {
    const S = 512;
    const [c, ctx] = canvas(S, S);
    const t = S / 2;
    for (let i = 0; i < 2; i++)
      for (let j = 0; j < 2; j++) {
        ctx.save();
        ctx.translate(i * t, j * t);
        ctx.fillStyle = ground;
        ctx.fillRect(0, 0, t, t);
        ctx.strokeStyle = ink;
        ctx.fillStyle = ink;
        const m = t / 2;
        // quarter circles in each corner join into rings across four tiles
        ctx.lineWidth = t * 0.05;
        for (const [cx, cy] of [
          [0, 0],
          [t, 0],
          [0, t],
          [t, t],
        ]) {
          ctx.beginPath();
          ctx.arc(cx, cy, t * 0.34, 0, Math.PI * 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(cx, cy, t * 0.16, 0, Math.PI * 2);
          ctx.fill();
        }
        // central four-petal flower
        for (let k = 0; k < 4; k++) {
          ctx.save();
          ctx.translate(m, m);
          ctx.rotate((k * Math.PI) / 2);
          ctx.beginPath();
          ctx.moveTo(0, -t * 0.04);
          ctx.bezierCurveTo(t * 0.13, -t * 0.12, t * 0.1, -t * 0.3, 0, -t * 0.27);
          ctx.bezierCurveTo(-t * 0.1, -t * 0.3, -t * 0.13, -t * 0.12, 0, -t * 0.04);
          ctx.fill();
          // small leaf toward the edge midpoint
          ctx.beginPath();
          ctx.ellipse(0, -t * 0.44, t * 0.03, t * 0.06, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        ctx.beginPath();
        ctx.arc(m, m, t * 0.04, 0, Math.PI * 2);
        ctx.fillStyle = ground;
        ctx.fill();
        // grout
        ctx.strokeStyle = 'rgba(80,78,72,0.45)';
        ctx.lineWidth = 2;
        ctx.strokeRect(0, 0, t, t);
        ctx.restore();
      }
    speckle(ctx, S, S, 7000, 0.06, 5, true, 2);
    speckle(ctx, S, S, 3000, 0.05, 6, false, 2);
    return tex(c);
  });
}

/** Honey/golden oak strip flooring (as in the video). One repeat ≈ 1.6 m. */
export function honeyOak() {
  return cached('honeyoak', () => {
    const S = 512;
    const [c, ctx] = canvas(S, S);
    const r = mulberry32(17);
    const rows = 9;
    const ph = S / rows;
    for (let y = 0; y < rows; y++) {
      let x = -r() * 300;
      while (x < S) {
        const len = 160 + r() * 280;
        const tone = r();
        const base = [196 + tone * 28, 132 + tone * 26, 62 + tone * 18];
        const g = ctx.createLinearGradient(x, 0, x + len, 0);
        g.addColorStop(0, `rgb(${base[0] - 12},${base[1] - 10},${base[2] - 6})`);
        g.addColorStop(0.5, `rgb(${base[0]},${base[1]},${base[2]})`);
        g.addColorStop(1, `rgb(${base[0] - 18},${base[1] - 14},${base[2] - 8})`);
        ctx.fillStyle = g;
        ctx.fillRect(x, y * ph, len, ph);
        for (let k = 0; k < 16; k++) {
          ctx.strokeStyle = `rgba(110,62,22,${0.07 + r() * 0.13})`;
          ctx.lineWidth = 0.5 + r() * 1.5;
          ctx.beginPath();
          const gy = y * ph + r() * ph;
          ctx.moveTo(x, gy);
          ctx.bezierCurveTo(x + len * 0.3, gy + (r() - 0.5) * 7, x + len * 0.7, gy + (r() - 0.5) * 7, x + len, gy + (r() - 0.5) * 4);
          ctx.stroke();
        }
        // occasional darker knot / wear
        if (r() < 0.25) {
          ctx.fillStyle = 'rgba(120,70,25,0.25)';
          ctx.beginPath();
          ctx.ellipse(x + r() * len, y * ph + ph / 2, 6 + r() * 6, 2 + r() * 2, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = 'rgba(70,38,12,0.55)';
        ctx.fillRect(x, y * ph, 1.4, ph);
        x += len;
      }
      ctx.fillStyle = 'rgba(70,38,12,0.5)';
      ctx.fillRect(0, y * ph, S, 1.3);
    }
    speckle(ctx, S, S, 2500, 0.04, 3, false);
    return tex(c);
  });
}

export interface RugStyle {
  field: string;
  border: string;
  border2: string;
  accent: string[];
  medallion: string;
  seed: number;
  wear?: number;
}
/** Persian / vintage style rectangular rug (UV 0..1 across the rug). */
export function persianRug(st: RugStyle, w = 512, h = 1024) {
  return cached('rug' + JSON.stringify(st) + w + h, () => {
    const [c, ctx] = canvas(w, h);
    const r = mulberry32(st.seed);
    ctx.fillStyle = st.field;
    ctx.fillRect(0, 0, w, h);
    // all-over small motifs
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = st.accent[Math.floor(r() * st.accent.length)];
      ctx.globalAlpha = 0.35 + r() * 0.4;
      const x = r() * w;
      const y = r() * h;
      const s = 3 + r() * 7;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-s / 2, -s / 2, s, s);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    // central medallion (lozenge with layered outlines)
    const cx = w / 2;
    const cy = h / 2;
    const lay = [
      [0.42, st.medallion],
      [0.32, st.border2],
      [0.24, st.accent[0]],
      [0.14, st.medallion],
      [0.06, st.border],
    ] as [number, string][];
    for (const [s, col] of lay) {
      ctx.fillStyle = col;
      ctx.beginPath();
      const rx = w * s;
      const ry = h * s * 0.75;
      for (let k = 0; k <= 32; k++) {
        const a = (k / 32) * Math.PI * 2;
        const wob = 1 + 0.12 * Math.sin(a * 8);
        const px = cx + Math.sin(a) * rx * wob * Math.abs(Math.sin(a)) ** 0.3;
        const py = cy - Math.cos(a) * ry * wob;
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.fill();
    }
    // corner spandrels
    ctx.fillStyle = st.border2;
    for (const [x, y] of [
      [0, 0],
      [w, 0],
      [0, h],
      [w, h],
    ]) {
      ctx.beginPath();
      ctx.ellipse(x, y, w * 0.28, h * 0.16, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // borders
    const bw = w * 0.11;
    ctx.lineWidth = bw;
    ctx.strokeStyle = st.border;
    ctx.strokeRect(bw / 2, bw / 2, w - bw, h - bw);
    ctx.lineWidth = bw * 0.18;
    ctx.strokeStyle = st.border2;
    ctx.strokeRect(bw * 1.1, bw * 1.1, w - bw * 2.2, h - bw * 2.2);
    ctx.strokeRect(bw * 0.2, bw * 0.2, w - bw * 0.4, h - bw * 0.4);
    // border motif: small repeated lozenges
    ctx.fillStyle = st.accent[1 % st.accent.length];
    for (let t = 0; t < 1; t += 0.035) {
      for (const [x, y] of [
        [bw / 2 + t * (w - bw), bw / 2],
        [bw / 2 + t * (w - bw), h - bw / 2],
      ]) {
        ctx.beginPath();
        ctx.ellipse(x, y, bw * 0.18, bw * 0.24, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    for (let t = 0; t < 1; t += 0.018) {
      for (const [x, y] of [
        [bw / 2, bw / 2 + t * (h - bw)],
        [w - bw / 2, bw / 2 + t * (h - bw)],
      ]) {
        ctx.beginPath();
        ctx.ellipse(x, y, bw * 0.24, bw * 0.18, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // faded/vintage wear
    const wear = st.wear ?? 0.25;
    for (let i = 0; i < 70; i++) {
      ctx.fillStyle = `rgba(235,225,210,${r() * wear * 0.5})`;
      ctx.beginPath();
      ctx.ellipse(r() * w, r() * h, 20 + r() * 60, 8 + r() * 30, r() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    speckle(ctx, w, h, 9000, 0.12, st.seed + 1, true, 2);
    speckle(ctx, w, h, 5000, 0.08, st.seed + 2, false, 2);
    const t = tex(c);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  });
}

/** Round medallion rug (blue/cream), UV centred. */
export function roundRug(ink = '#3c5c8c', ground = '#e8e2d4', seed = 4) {
  return cached('rround' + ink + ground, () => {
    const S = 512;
    const [c, ctx] = canvas(S, S);
    const r = mulberry32(seed);
    ctx.fillStyle = ground;
    ctx.fillRect(0, 0, S, S);
    const m = S / 2;
    ctx.translate(m, m);
    const ring = (rad: number, wdt: number, col: string) => {
      ctx.strokeStyle = col;
      ctx.lineWidth = wdt;
      ctx.beginPath();
      ctx.arc(0, 0, rad, 0, Math.PI * 2);
      ctx.stroke();
    };
    ring(m * 0.94, m * 0.08, ink);
    ring(m * 0.84, m * 0.02, ink);
    // scalloped band
    ctx.fillStyle = ink;
    for (let k = 0; k < 40; k++) {
      const a = (k / 40) * Math.PI * 2;
      ctx.beginPath();
      ctx.ellipse(Math.cos(a) * m * 0.74, Math.sin(a) * m * 0.74, m * 0.05, m * 0.025, a, 0, Math.PI * 2);
      ctx.fill();
    }
    // floral rosette
    for (let k = 0; k < 16; k++) {
      ctx.save();
      ctx.rotate((k / 16) * Math.PI * 2);
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.moveTo(0, -m * 0.12);
      ctx.bezierCurveTo(m * 0.1, -m * 0.3, m * 0.05, -m * 0.5, 0, -m * 0.56);
      ctx.bezierCurveTo(-m * 0.05, -m * 0.5, -m * 0.1, -m * 0.3, 0, -m * 0.12);
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    ring(m * 0.2, m * 0.06, ink);
    ctx.fillStyle = ground;
    ctx.beginPath();
    ctx.arc(0, 0, m * 0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // distressed vintage wash
    for (let i = 0; i < 90; i++) {
      ctx.fillStyle = `rgba(240,236,228,${r() * 0.25})`;
      ctx.beginPath();
      ctx.ellipse(r() * S, r() * S, 10 + r() * 40, 5 + r() * 20, r() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    speckle(ctx, S, S, 8000, 0.1, seed + 9, true, 2);
    return tex(c);
  });
}

/** Colourful mandala tablecloth (purples, orange, yellow, teal). */
export function mandala() {
  return cached('mandala', () => {
    const S = 512;
    const [c, ctx] = canvas(S, S);
    ctx.fillStyle = '#2f2a6b';
    ctx.fillRect(0, 0, S, S);
    ctx.translate(S / 2, S / 2);
    const cols = ['#f2a02c', '#e2442f', '#f6d34a', '#2aa59a', '#7b3fa0', '#ef7aa5', '#2f6fd0'];
    for (let ring = 9; ring >= 1; ring--) {
      const n = 8 + ring * 4;
      const rad = ring * 26;
      ctx.fillStyle = cols[ring % cols.length];
      for (let k = 0; k < n; k++) {
        ctx.save();
        ctx.rotate((k / n) * Math.PI * 2);
        ctx.beginPath();
        ctx.ellipse(0, -rad, 9 + ring, 16 + ring * 1.4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.strokeStyle = cols[(ring + 3) % cols.length];
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, rad - 14, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = '#f6d34a';
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    speckle(ctx, S, S, 4000, 0.08, 77, true, 2);
    return tex(c);
  });
}

/** Blue-and-white damask (shower curtain). */
export function damask(ink = '#5577a8', ground = '#eef1f5') {
  return cached('damask' + ink, () => {
    const S = 256;
    const [c, ctx] = canvas(S, S);
    ctx.fillStyle = ground;
    ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = ink;
    const motif = (x: number, y: number, s: number) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(s, s);
      ctx.beginPath();
      ctx.moveTo(0, -60);
      ctx.bezierCurveTo(30, -40, 40, -10, 18, 10);
      ctx.bezierCurveTo(40, 25, 26, 55, 0, 62);
      ctx.bezierCurveTo(-26, 55, -40, 25, -18, 10);
      ctx.bezierCurveTo(-40, -10, -30, -40, 0, -60);
      ctx.fill();
      ctx.fillStyle = ground;
      ctx.beginPath();
      ctx.ellipse(0, 4, 9, 22, 0, 0, Math.PI * 2);
      ctx.fill();
      for (const sx of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(sx * 16, -18, 5, 12, sx * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = ink;
      ctx.restore();
    };
    motif(64, 64, 0.85);
    motif(192, 192, 0.85);
    motif(192, -64, 0.85);
    motif(-64, 192, 0.85);
    motif(320, 64, 0.85);
    motif(64, 320, 0.85);
    ctx.globalAlpha = 0.4;
    for (const [x, y] of [
      [192, 64],
      [64, 192],
    ]) {
      ctx.beginPath();
      ctx.arc(x, y, 14, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    return tex(c);
  });
}

/** Leafy decorative window film (laundry door panes). */
export function leafFilm() {
  return cached('leaf', () => {
    const S = 256;
    const [c, ctx] = canvas(S, S);
    ctx.fillStyle = 'rgba(230,240,232,1)';
    ctx.fillRect(0, 0, S, S);
    const r = mulberry32(8);
    for (let i = 0; i < 70; i++) {
      const x = r() * S;
      const y = r() * S;
      const a = r() * Math.PI;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      const g = 120 + r() * 80;
      ctx.fillStyle = `rgba(${60 + r() * 40},${g},${70 + r() * 30},0.75)`;
      ctx.beginPath();
      ctx.ellipse(0, 0, 5 + r() * 4, 16 + r() * 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    for (let i = 0; i < 12; i++) {
      ctx.strokeStyle = 'rgba(80,120,80,0.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      const x = r() * S;
      ctx.moveTo(x, 0);
      ctx.bezierCurveTo(x + 30, 80, x - 30, 160, x + 10, 256);
      ctx.stroke();
    }
    return tex(c);
  });
}

/** Vertical board panelling (navy accent wall, white beadboard). u = metres/1, so ~8 boards per metre. */
export function boards(color: string, groove: string, perM = 6) {
  return cached('boards' + color + perM, () => {
    const [c, ctx] = canvas(256, 64);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 256, 64);
    const step = 256 / perM;
    for (let i = 0; i < perM; i++) {
      const x = i * step;
      const g = ctx.createLinearGradient(x, 0, x + step, 0);
      g.addColorStop(0, 'rgba(255,255,255,0.08)');
      g.addColorStop(0.5, 'rgba(255,255,255,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.08)');
      ctx.fillStyle = g;
      ctx.fillRect(x, 0, step, 64);
      ctx.fillStyle = groove;
      ctx.fillRect(x, 0, 2.5, 64);
    }
    speckle(ctx, 256, 64, 500, 0.04, 2, true, 2);
    return tex(c);
  });
}

/** Bamboo/woven roman shade. */
export function bamboo() {
  return cached('bamboo', () => {
    const [c, ctx] = canvas(64, 128);
    const r = mulberry32(5);
    for (let y = 0; y < 128; y += 3) {
      const t = r();
      ctx.fillStyle = `rgb(${165 + t * 40},${125 + t * 30},${70 + t * 20})`;
      ctx.fillRect(0, y, 64, 3);
      ctx.fillStyle = 'rgba(60,40,15,0.35)';
      ctx.fillRect(0, y + 2.4, 64, 0.6);
    }
    for (const x of [10, 32, 54]) {
      ctx.fillStyle = 'rgba(80,55,25,0.6)';
      ctx.fillRect(x, 0, 1.2, 128);
    }
    return tex(c);
  });
}

/** Rows of book spines for the built-in shelf. */
export function books(seed = 3) {
  return cached('books' + seed, () => {
    const [c, ctx] = canvas(256, 64);
    const r = mulberry32(seed);
    ctx.fillStyle = '#efe9dc';
    ctx.fillRect(0, 0, 256, 64);
    let x = 0;
    const cols = ['#7d2f2f', '#2f4f7d', '#d9b45a', '#3d6b4a', '#e8e0cc', '#5a3c6e', '#c76b3a', '#222', '#9fb4c7'];
    while (x < 256) {
      const w = 5 + r() * 10;
      const h = 40 + r() * 22;
      if (r() < 0.12) {
        x += 10;
        continue;
      }
      ctx.fillStyle = cols[Math.floor(r() * cols.length)];
      ctx.fillRect(x, 64 - h, w - 1, h);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(x + 1, 64 - h + 6, w - 3, 2);
      x += w;
    }
    return tex(c);
  });
}

/** Tufted upholstery (headboards, dining chairs). */
export function tufted(color: string, seed = 1) {
  return cached('tuft' + color, () => {
    const [c, ctx] = canvas(128, 128);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++) {
        const cx = x * 32 + (y % 2 ? 16 : 0);
        const cy = y * 32 + 16;
        const g = ctx.createRadialGradient(cx, cy, 1, cx, cy, 18);
        g.addColorStop(0, 'rgba(0,0,0,0.45)');
        g.addColorStop(0.2, 'rgba(0,0,0,0.1)');
        g.addColorStop(0.7, 'rgba(255,255,255,0.08)');
        g.addColorStop(1, 'rgba(0,0,0,0.05)');
        ctx.fillStyle = g;
        ctx.fillRect(cx - 18, cy - 18, 36, 36);
      }
    speckle(ctx, 128, 128, 900, 0.07, seed, true, 2);
    return tex(c);
  });
}

/** Rumpled bedding with subtle folds. */
export function bedding(color: string, seed = 2) {
  return cached('bed' + color, () => {
    const [c, ctx] = canvas(256, 256);
    const r = mulberry32(seed);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 40; i++) {
      const y = r() * 256;
      const g = ctx.createLinearGradient(0, y - 8, 0, y + 8);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.5, `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${0.06 + r() * 0.08})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.save();
      ctx.translate(128, y);
      ctx.rotate((r() - 0.5) * 0.6);
      ctx.fillRect(-180, -8, 360, 16);
      ctx.restore();
    }
    speckle(ctx, 256, 256, 2500, 0.05, seed + 3, true, 2);
    return tex(c);
  });
}

/** Sheer curtain: soft vertical weave, used with transparency. */
export function sheer(color: string) {
  return cached('sheer' + color, () => {
    const [c, ctx] = canvas(64, 64);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 64, 64);
    for (let x = 0; x < 64; x += 2) {
      ctx.fillStyle = `rgba(255,255,255,${x % 4 ? 0.08 : 0.16})`;
      ctx.fillRect(x, 0, 1, 64);
    }
    return tex(c);
  });
}

/** Window blinds (white horizontal slats). */
export function blinds() {
  return cached('blinds', () => {
    const [c, ctx] = canvas(32, 64);
    for (let y = 0; y < 64; y += 4) {
      const g = ctx.createLinearGradient(0, y, 0, y + 4);
      g.addColorStop(0, '#fbfbf9');
      g.addColorStop(0.7, '#e2e2de');
      g.addColorStop(1, '#a9a9a4');
      ctx.fillStyle = g;
      ctx.fillRect(0, y, 32, 4);
    }
    return tex(c);
  });
}

/** Crinkle play-tunnel (lime green with ribs). */
export function crinkle() {
  return cached('crinkle', () => {
    const [c, ctx] = canvas(128, 64);
    ctx.fillStyle = '#c9e64a';
    ctx.fillRect(0, 0, 128, 64);
    const r = mulberry32(12);
    for (let x = 0; x < 128; x += 8) {
      ctx.fillStyle = 'rgba(60,80,0,0.35)';
      ctx.fillRect(x, 0, 1.5, 64);
    }
    for (let i = 0; i < 300; i++) {
      ctx.fillStyle = `rgba(255,255,220,${r() * 0.35})`;
      ctx.fillRect(r() * 128, r() * 64, 2 + r() * 6, 1);
    }
    return tex(c);
  });
}

/** Woven seagrass/rattan for the papasan, pendant shade and baskets (finer than the basket wicker). */
export function rattan(tone = '#b88c55') {
  return cached('rattan' + tone, () => {
    const [c, ctx] = canvas(64, 64);
    ctx.fillStyle = tone;
    ctx.fillRect(0, 0, 64, 64);
    for (let y = 0; y < 64; y += 4)
      for (let x = 0; x < 64; x += 8) {
        const o = (y / 4) % 2 ? 4 : 0;
        ctx.fillStyle = 'rgba(255,230,180,0.25)';
        ctx.fillRect(x + o, y, 6, 3);
        ctx.fillStyle = 'rgba(60,35,10,0.35)';
        ctx.fillRect(x + o + 6, y, 2, 4);
      }
    return tex(c);
  });
}

/** Bath wall: white beadboard wainscot below, light blue-gray paint above (v = 0 at floor, 1 at ceiling). */
export function bathWall() {
  return cached('bathwall', () => {
    const [c, ctx] = canvas(256, 512);
    const H = 512;
    const wain = H * (1 - 1.0 / 2.45);
    ctx.fillStyle = '#c8d3d8';
    ctx.fillRect(0, 0, 256, wain);
    ctx.fillStyle = '#f6f6f2';
    ctx.fillRect(0, wain, 256, H - wain);
    for (let x = 0; x < 256; x += 256 / 12) {
      ctx.fillStyle = 'rgba(120,120,110,0.35)';
      ctx.fillRect(x, wain + 10, 1.6, H - wain);
    }
    // chair-rail shadow
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(0, wain + 9, 256, 3);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, wain, 256, 9);
    speckle(ctx, 256, wain, 900, 0.03, 4, true, 2);
    return tex(c);
  });
}
