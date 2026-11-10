// A reusable, reasonably detailed single-storey house for the neighbourhood: block foundation, lap siding,
// gable roof with shingles/fascia/gutters, trimmed windows with sashes, shutters and curtains/blinds, a front
// door with a stoop or porch, downspouts, a chimney and an AC unit. Built in local space (front faces +z,
// width along x) and placed with a single transform, all merged into the caller's Batch.
import * as THREE from 'three';
import { Batch, boxGeo, std, texMat } from './build';
import * as T from './textures';
import { mulberry32 } from '../rules';

export type WinKind = 'curtain' | 'blinds' | 'foil' | 'board' | 'dark' | 'ac';
export interface Win {
  at: number; // offset along the wall (m, from its centre)
  w?: number;
  h?: number;
  sill?: number;
  kind?: WinKind;
}
export interface HouseSpec {
  x: number;
  z: number;
  facing: number; // yaw of the front (+z local) in world space
  w: number; // front width
  d: number; // depth
  wallH?: number;
  base?: number;
  siding: string;
  trim?: string;
  roof?: string;
  door?: string;
  shutters?: string | null;
  front?: Win[];
  back?: Win[];
  left?: Win[]; // the -x side wall
  right?: Win[]; // the +x side wall
  doorAt?: number;
  porch?: 'stoop' | 'porch' | 'none';
  backDoor?: number | null; // offset of a back door, or null
  chimney?: number | null; // x offset of a chimney, or null
  ac?: boolean;
  garage?: boolean; // a single garage on the +x end of the front
  seed?: number;
  shabby?: boolean;
}

const mats = new Map<string, THREE.Material>();
function mat(key: string, make: () => THREE.Material) {
  let m = mats.get(key);
  if (!m) {
    m = make();
    mats.set(key, m);
  }
  return m;
}

export function buildHouse(B: Batch, h: HouseSpec) {
  const R = mulberry32((h.seed ?? 1) * 131 + 7);
  const M = new THREE.Matrix4().compose(new THREE.Vector3(h.x, 0, h.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), h.facing), new THREE.Vector3(1, 1, 1));
  const L = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, cast = true) => {
    e.set(rx, ry, rz);
    q.setFromEuler(e);
    L.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(1, 1, 1));
    B.addMatrix(geo, m, M.clone().multiply(L), cast, true);
  };
  const box = (m: THREE.Material, x: number, y: number, z: number, w: number, hh: number, d: number, uv = 1, ry = 0, cast = true) => add(boxGeo(w, hh, d, uv), m, x, y, z, 0, ry, 0, cast);
  const W = h.w;
  const D = h.d;
  const wallH = h.wallH ?? 2.7;
  const base = h.base ?? 0.45;
  const trimC = h.trim ?? '#ece8de';
  const mSide = mat('siding' + h.siding, () => {
    const t = T.siding().clone();
    t.needsUpdate = true;
    return new THREE.MeshStandardMaterial({ map: t, color: h.siding, roughness: 0.9 });
  });
  const mTrim = mat('trim' + trimC, () => std(trimC, { roughness: 0.8 }));
  const mRoof = mat('roof' + (h.roof ?? '#7d7a74'), () => texMat(T.shingles(), 1, { roughness: 0.95, color: h.roof ?? '#7d7a74' }));
  const mBlock = mat('block', () => texMat(T.concrete(), 1, { roughness: 1, color: '#a29e94' }));
  const mGlass = mat('glass', () => new THREE.MeshPhysicalMaterial({ color: '#1f272b', roughness: 0.06, metalness: 0.2, clearcoat: 1 }));
  const mGutter = mat('gutter', () => std('#dcd8cc', { roughness: 0.6 }));
  const mDark = mat('dark', () => std('#1c1c1c', { roughness: 0.8 }));
  const mCurtain = mat('curtain', () => std('#c9b892', { roughness: 1 }));
  const mBlind = mat('blind', () => std('#e4ddca', { roughness: 0.9 }));
  const mFoil = mat('foil', () => std('#c9c9c9', { metalness: 0.9, roughness: 0.35 }));
  const mPly = mat('ply', () => std('#b08a55', { roughness: 0.95 }));
  const mShut = h.shutters ? mat('shut' + h.shutters, () => std(h.shutters!, { roughness: 0.8 })) : null;
  const mBrick = mat('brick', () => std('#8a4a3a', { roughness: 0.95 }));

  // foundation + walls (world-scaled UVs keep the siding boards a constant size)
  box(mBlock, 0, base / 2, 0, W + 0.1, base, D + 0.1, 1);
  box(mSide, 0, base + wallH / 2, 0, W, wallH, D, 2.4);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(mTrim, (sx * W) / 2, base + wallH / 2, (sz * D) / 2, 0.12, wallH, 0.12);
  // frieze boards
  for (const sz of [-1, 1]) box(mTrim, 0, base + wallH - 0.1, (sz * (D / 2 + 0.02)), W + 0.06, 0.16, 0.04);
  // gable roof, ridge along x
  const ov = 0.45;
  const pitch = Math.atan(5 / 12);
  const halfRun = D / 2 + ov;
  const rise = Math.tan(pitch) * (D / 2);
  const slope = halfRun / Math.cos(pitch);
  const roofY = base + wallH;
  for (const sd of [-1, 1]) {
    add(boxGeo(W + ov * 2, 0.08, slope, 1.2), mRoof, 0, roofY + rise / 2 + 0.03, (sd * halfRun) / 2, sd * pitch, 0, 0);
    box(mTrim, 0, roofY - 0.08, sd * (D / 2 + ov - 0.02), W + ov * 2, 0.2, 0.04);
    add(new THREE.CylinderGeometry(0.06, 0.06, W + ov * 2, 10, 1, true, 0, Math.PI), mGutter, 0, roofY - 0.12, sd * (D / 2 + ov + 0.04), 0, 0, Math.PI / 2);
  }
  // gable ends
  for (const sx of [-1, 1]) {
    const sh = new THREE.Shape();
    sh.moveTo(-D / 2, 0);
    sh.lineTo(D / 2, 0);
    sh.lineTo(0, rise);
    sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.1, bevelEnabled: false });
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 2.4, uv.getY(i) / 2.4);
    add(g, mSide, (sx * W) / 2 - (sx > 0 ? 0.1 : 0), roofY, 0, 0, Math.PI / 2, 0);
    box(mTrim, (sx * W) / 2 + sx * 0.03, roofY + rise * 0.45, 0, 0.04, 0.42, 0.5);
    box(mDark, (sx * W) / 2 + sx * 0.05, roofY + rise * 0.45, 0, 0.02, 0.32, 0.4);
    // rake boards
    for (const sz of [-1, 1]) add(boxGeo(0.04, 0.18, slope), mTrim, (sx * (W / 2 + ov)), roofY + rise / 2 - 0.03, (sz * halfRun) / 2, sz * pitch, 0, 0);
  }
  box(mat('ridge', () => std('#5e5b56')), 0, roofY + rise + 0.07, 0, W + ov * 2, 0.06, 0.26);
  if (h.chimney !== null && h.chimney !== undefined) {
    box(mBrick, h.chimney, roofY + rise + 0.1, -D * 0.18, 0.6, 1.7, 0.6);
    box(mat('cap', () => std('#4a4a48')), h.chimney, roofY + rise + 0.98, -D * 0.18, 0.7, 0.06, 0.7);
  }
  // downspouts
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(new THREE.CylinderGeometry(0.04, 0.04, wallH + base, 8), mGutter, sx * (W / 2 - 0.15), (wallH + base) / 2, sz * (D / 2 + 0.06));

  // windows: on a wall given by side; local frame along the wall
  const wallFrame = (side: 'front' | 'back' | 'left' | 'right') => {
    // returns [cx, cz, along-x?, outward sign]
    if (side === 'front') return { x: 0, z: D / 2, ax: true, n: 1 };
    if (side === 'back') return { x: 0, z: -D / 2, ax: true, n: -1 };
    if (side === 'left') return { x: -W / 2, z: 0, ax: false, n: -1 };
    return { x: W / 2, z: 0, ax: false, n: 1 };
  };
  const win = (side: 'front' | 'back' | 'left' | 'right', o: Win) => {
    const F = wallFrame(side);
    const w = o.w ?? 1.0;
    const hh = o.h ?? 1.2;
    const sill = o.sill ?? 0.85;
    const kind = o.kind ?? 'curtain';
    const y = base + sill + hh / 2;
    const P = (along: number, out: number): [number, number] => (F.ax ? [F.x + along, F.z + F.n * out] : [F.x + F.n * out, F.z + along]);
    const bx = (m: THREE.Material, along: number, yy: number, out: number, ww: number, hgt: number, dep: number, rz = 0) => {
      const [x, z] = P(along, out);
      if (F.ax) add(boxGeo(ww, hgt, dep), m, x, yy, z, 0, 0, rz);
      else add(boxGeo(dep, hgt, ww), m, x, yy, z, rz, 0, 0);
    };
    bx(mGlass, o.at, y, 0.03, w, hh, 0.02);
    bx(mTrim, o.at, y + hh / 2 + 0.06, 0.05, w + 0.22, 0.1, 0.06);
    bx(mTrim, o.at, y - hh / 2 - 0.05, 0.07, w + 0.26, 0.06, 0.1);
    for (const s of [-1, 1]) bx(mTrim, o.at + s * (w / 2 + 0.05), y, 0.05, 0.08, hh + 0.12, 0.05);
    bx(mTrim, o.at, y, 0.045, 0.03, hh, 0.02);
    bx(mTrim, o.at, y, 0.045, w, 0.04, 0.02);
    if (kind === 'curtain') {
      bx(mCurtain, o.at - w * 0.3, y, -0.03, w * 0.35, hh, 0.02);
      bx(mCurtain, o.at + w * 0.3, y, -0.03, w * 0.35, hh, 0.02);
    }
    if (kind === 'blinds') bx(mBlind, o.at, y + hh * 0.15, -0.03, w, hh * 0.7, 0.02);
    if (kind === 'foil') bx(mFoil, o.at, y, -0.03, w, hh, 0.01);
    if (kind === 'board') {
      bx(mPly, o.at, y, 0.09, w + 0.2, hh + 0.18, 0.02);
    }
    if (kind === 'ac') {
      bx(mat('acbox', () => std('#cfcac0', { roughness: 0.6 })), o.at, y - hh / 4, 0.27, w * 0.8, hh * 0.45, 0.55);
      bx(mPly, o.at, y + hh / 4, 0.08, w, hh * 0.45, 0.015);
    }
    if (mShut && kind !== 'board' && kind !== 'ac') for (const s of [-1, 1]) bx(mShut, o.at + s * (w / 2 + 0.26), y, 0.07, 0.36, hh + 0.1, 0.035, h.shabby && s > 0 && R() > 0.5 ? 0.1 : 0);
  };
  for (const o of h.front ?? []) win('front', o);
  for (const o of h.back ?? []) win('back', o);
  for (const o of h.left ?? []) win('left', o);
  for (const o of h.right ?? []) win('right', o);

  // front door + stoop/porch
  const dx = h.doorAt ?? 0;
  const mDoor = mat('door' + (h.door ?? '#6b3b2b'), () => std(h.door ?? '#6b3b2b', { roughness: 0.6 }));
  box(mDoor, dx, base + 1.02, D / 2 + 0.03, 0.92, 2.04, 0.05);
  box(mTrim, dx, base + 1.06, D / 2 + 0.02, 1.08, 2.18, 0.03);
  box(mat('knob', () => std('#c9a85a', { metalness: 0.8, roughness: 0.3 })), dx + 0.36, base + 1.0, D / 2 + 0.07, 0.05, 0.05, 0.05);
  if ((h.porch ?? 'stoop') === 'porch') {
    box(mBlock, dx, base / 2, D / 2 + 1.0, 3.2, base, 2.0);
    for (const sx of [-1, 1]) box(mTrim, dx + sx * 1.45, base + 1.3, D / 2 + 1.85, 0.14, 2.6, 0.14);
    box(mTrim, dx, base + 2.66, D / 2 + 1.0, 3.3, 0.14, 2.1);
    add(boxGeo(3.5, 0.06, 2.4, 1.2), mRoof, dx, base + 2.85, D / 2 + 1.05, 0.18, 0, 0);
    for (let s = 0; s < 2; s++) box(mBlock, dx, base * (0.33 - s * 0.16), D / 2 + 2.15 + s * 0.3, 1.4, base * (0.66 - s * 0.33), 0.3);
  } else if ((h.porch ?? 'stoop') === 'stoop') {
    box(mBlock, dx, base / 2, D / 2 + 0.55, 1.5, base, 1.1);
    box(mBlock, dx, base * 0.25, D / 2 + 1.25, 1.3, base * 0.5, 0.3);
    // a little light by the door
    box(mat('lamp', () => std('#f4e9c8', { emissive: '#d8b56a', emissiveIntensity: 0.3 })), dx + 0.75, base + 1.85, D / 2 + 0.08, 0.12, 0.2, 0.1);
  }
  if (h.backDoor !== null && h.backDoor !== undefined) {
    box(mDoor, h.backDoor, base + 1.02, -D / 2 - 0.03, 0.9, 2.04, 0.05);
    box(mTrim, h.backDoor, base + 1.06, -D / 2 - 0.02, 1.06, 2.18, 0.03);
    box(mBlock, h.backDoor, base * 0.4, -D / 2 - 0.5, 1.2, base * 0.8, 0.9);
  }
  if (h.garage) {
    const gx = W / 2 - 1.7;
    box(mat('gdoor', () => std('#e9e6de', { roughness: 0.7 })), gx, base * 0 + 1.05, D / 2 + 0.03, 2.6, 2.1, 0.05);
    for (let i = 0; i < 4; i++) box(mat('gline', () => std('#c9c5bb')), gx, 0.3 + i * 0.52, D / 2 + 0.06, 2.6, 0.03, 0.02);
  }
  if (h.ac) {
    box(mat('acu', () => std('#c9c7c0', { roughness: 0.5, metalness: 0.3 })), W / 2 + 0.45, 0.4, -D * 0.25, 0.75, 0.75, 0.75);
    box(mDark, W / 2 + 0.83, 0.45, -D * 0.25, 0.01, 0.55, 0.6);
  }
  return { roofTop: roofY + rise, M };
}
