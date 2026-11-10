// Character specs matched to the owner's video and photos:
// Darrow: slim dark-gray mackerel tabby, silver reflective collar + bell.
// Rufus: young orange-and-white bicolour tabby (white muzzle/chest/belly/legs), green-gold eyes, pink nose.
// Penny: long-coated white dachshund mix, black head with tan brows/cheeks and white muzzle tip,
//        big black saddle and hip patch, long feathered black ears, plumed white tail.
// Babadook: mangy dark stray with golden eyes and a torn ear.
import * as THREE from 'three';
import { Quadruped, vnoise, fbm, type QuadSpec, type Coat, type Landmarks } from './rig';
import type { PetId } from '../config';

const C = (h: string) => new THREE.Color(h);
const ss = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
const mix = (a: THREE.Color, b: THREE.Color, t: number) => a.clone().lerp(b, Math.max(0, Math.min(1, t)));
const coat = (color: THREE.Color, stripe = 0, mask = 0, fur = 1): Coat => ({ color, stripe, mask, fur });
const rel = (p: THREE.Vector3, L: Landmarks) => p.clone().sub(L.head).divideScalar(L.headR); // head-relative, in head radii

// ---------------------------------------------------------------- Darrow
function darrowSpec(): QuadSpec {
  const base = C('#76716b');
  const light = C('#a49e96');
  const muzzle = C('#b3ada4');
  return {
    len: 0.36, r: 0.066, width: 0.84, bodyY: 0.2, legR: 0.0158,
    front: [0.1, 0.1], hind: [0.11, 0.1],
    neckLen: 0.07, neckPitch: -0.1, headR: 0.05, headScale: [1.0, 0.9, 1.0],
    muzzleLen: 0.02, muzzleR: 0.021, snout: 'cat',
    ear: { type: 'cat', size: 0.034, spread: 0.6, outer: '#5c5853', inner: '#d6a9a6' },
    tail: { n: 10, len: 0.28, r0: 0.0135, r1: 0.0085, restCurl: 0.45, lift: 1.05 },
    eye: { color: '#b4b84c', ring: '#5d5a1c', pupil: 'slit', size: 0.0105 },
    nose: '#4a3c3b',
    collar: { color: '#cfd3d6', bell: true, reflective: true },
    personality: 'calm',
    whiskers: true,
    stripes: { color: '#1d1b1a', freq: 52, width: 0.4, warp: 0.7, breakup: 0.45 },
    fur: { len: 0.0045, shells: 6, density: 480, clump: 0.6, mottle: 0.1 },
    coat: (part, p, L) => {
      const up = (p.y - L.bodyY) / L.r;
      const n = fbm(p.x * 30, p.y * 30, p.z * 30);
      if (part === 'tail') {
        const tip = ss(L.tailBase.y + 0.2, L.tailBase.y + 0.26, p.y);
        return coat(mix(base, C('#24211f'), tip), p.y, 1, 1.25);
      }
      if (part === 'leg' || part === 'paw') return coat(mix(base, light, 0.25 + (part === 'paw' ? 0.3 : 0)), p.y, part === 'paw' ? 0.15 : 0.5, 0.8);
      if (['head', 'cheek', 'muzzle', 'bridge', 'chin', 'ear', 'brow'].includes(part)) {
        const q = rel(p, L);
        if (part === 'chin') return coat(muzzle, 0, 0, 0.7);
        if (part === 'muzzle') return coat(mix(muzzle, base, ss(-0.2, 0.2, q.y + 0.1)), 0, 0, 0.6);
        const forehead = ss(0.05, 0.35, q.y) * ss(0.2, 0.7, q.z + 0.4);
        const eyeRim = ss(0.2, 0.05, Math.abs(Math.hypot(Math.abs(q.x) - 0.4, q.y - 0.1) - 0.27));
        let c = mix(base, light, ss(-0.1, -0.4, q.y) * 0.7);
        c = mix(c, muzzle, eyeRim * 0.6);
        // forehead "M" lines run front-to-back, cheek lines sideways
        if (forehead > 0.1) return coat(c, q.x * 0.05, forehead * 0.9, 0.7);
        return coat(c, q.y * 0.05 + q.z * 0.02, ss(0.3, 0.6, Math.abs(q.x)) * ss(0.0, -0.2, q.y) * 0.6, 0.8);
      }
      if (part === 'neck') return coat(mix(base, light, ss(-0.2, -0.7, up)), p.y * 0.8 + p.z * 0.5, 0.6 * ss(-0.6, -0.1, up), 1.1);
      // torso: darker spine, lighter belly; mackerel stripes run down the sides
      let c = mix(base, C('#5b5751'), ss(0.4, 1.0, up) + (n - 0.5) * 0.4);
      c = mix(c, light, ss(-0.35, -0.85, up));
      return coat(c, p.z + Math.abs(p.x) * 0.2 - (p.y - L.bodyY) * 0.35, ss(-0.75, -0.2, up), 1.0);
    },
  };
}

// ---------------------------------------------------------------- Rufus
function rufusSpec(): QuadSpec {
  const orange = C('#de9a55');
  const deep = C('#c97d3c');
  const white = C('#f4efe6');
  return {
    len: 0.42, r: 0.069, width: 0.82, bodyY: 0.222, legR: 0.0178,
    front: [0.112, 0.11], hind: [0.122, 0.11],
    neckLen: 0.08, neckPitch: -0.15, headR: 0.052, headScale: [1.02, 0.9, 1.0],
    muzzleLen: 0.023, muzzleR: 0.022, snout: 'cat',
    ear: { type: 'cat', size: 0.041, spread: 0.6, outer: '#d7914c', inner: '#ecbcb6' },
    tail: { n: 11, len: 0.33, r0: 0.015, r1: 0.009, restCurl: 0.5, lift: 1.15 },
    eye: { color: '#b9c25c', ring: '#5f6a22', pupil: 'slit', size: 0.0115 },
    nose: '#e7a3a1',
    personality: 'rowdy',
    whiskers: true,
    stripes: { color: '#c0712f', freq: 44, width: 0.42, warp: 0.5, breakup: 0.18 },
    fur: { len: 0.0058, shells: 6, density: 440, clump: 0.55, mottle: 0.08 },
    coat: (part, p, L) => {
      const up = (p.y - L.bodyY) / L.r;
      if (part === 'tail') return coat(orange, p.y, 1, 1.3);
      if (part === 'paw') return coat(white, 0, 0, 0.8);
      if (part === 'leg') {
        // front legs white; hind legs orange on the outer thigh, white lower down
        const front = p.z > 0;
        const o = front ? ss(L.bodyY - 0.02, L.bodyY + 0.02, p.y) : ss(L.bodyY - 0.11, L.bodyY - 0.06, p.y) * ss(0.0, 0.02, Math.abs(p.x) - 0.03);
        return coat(mix(white, orange, o), p.y, o, 0.85);
      }
      if (['head', 'cheek', 'muzzle', 'bridge', 'chin', 'ear', 'brow'].includes(part)) {
        const q = rel(p, L);
        if (part === 'chin' || part === 'muzzle') return coat(white, 0, 0, 0.7);
        // white blaze widening down the face between the eyes, orange crown and outer cheeks
        const blaze = ss(0.22, 0.12, Math.abs(q.x) - Math.max(0, -q.y) * 0.55 - Math.max(0, q.z - 0.4) * 0.25);
        const lower = ss(-0.05, -0.32, q.y) * ss(0.2, 0.55, q.z + 0.1);
        const w = Math.max(blaze * ss(0.1, 0.5, q.z), lower);
        const c = mix(mix(orange, deep, ss(0.3, 0.7, q.y) * 0.3), white, w);
        return coat(c, q.x * 0.045 + q.z * 0.01, (1 - w) * ss(0.1, 0.45, q.y), 0.8);
      }
      if (part === 'neck') {
        // white throat and bib, orange back of the neck
        const throat = ss(0.15, -0.25, (p.y - L.neck.y) / L.r - (p.z - L.neck.z) / L.r * 0.9);
        return coat(mix(orange, white, throat), p.y + p.z, 1 - throat, 1.25);
      }
      // torso: orange back and flanks, white chest, belly and inner legs
      const chest = ss(L.len * 0.2, L.len * 0.42, p.z) * ss(0.4, -0.2, up);
      const belly = ss(-0.25, -0.6, up);
      const w = Math.max(chest, belly);
      return coat(mix(orange, white, w), p.z + Math.abs(p.x) * 0.2 - (p.y - L.bodyY) * 0.35, 1 - w, 1.05);
    },
  };
}

// ---------------------------------------------------------------- Penny
function pennySpec(): QuadSpec {
  const white = C('#f2eee6');
  const black = C('#151314');
  const tan = C('#a8683a');
  return {
    len: 0.52, r: 0.071, width: 0.9, bodyY: 0.135, legR: 0.0195,
    front: [0.05, 0.048], hind: [0.052, 0.048],
    neckLen: 0.085, neckPitch: 0.02, headR: 0.05, headScale: [0.95, 0.95, 1.1],
    muzzleLen: 0.052, muzzleR: 0.022, snout: 'dog',
    ear: { type: 'flop', size: 0.056, spread: 0.8 },
    tail: { n: 8, len: 0.2, r0: 0.014, r1: 0.007, restCurl: 0.0, lift: 1.3 },
    eye: { color: '#4a2c18', ring: '#1e120a', pupil: 'round', size: 0.011 },
    nose: '#121011',
    collar: { color: '#b33a3a', bell: false },
    personality: 'eager',
    deepChest: 1,
    voxel: 0.0045,
    fur: { len: 0.0075, shells: 7, density: 380, clump: 0.85, mottle: 0.06 },
    coat: (part, p, L) => {
      const up = (p.y - L.bodyY) / L.r;
      if (part === 'ear') return coat(black, 0, 0, 1.5);
      if (part === 'tail') return coat(white, 0, 0, 3.0);
      if (part === 'paw') return coat(white, 0, 0, 1.0);
      if (part === 'leg') return coat(white, 0, 0, 1.7);
      if (['head', 'muzzle', 'chin', 'brow'].includes(part)) {
        const q = rel(p, L);
        const muzzleTip = ss(1.75, 2.0, q.z) * ss(0.2, -0.2, q.y + 0.2) + ss(1.3, 1.7, q.z) * ss(-0.3, -0.5, q.y);
        if (part === 'chin') return coat(mix(tan, white, ss(1.0, 1.3, q.z)), 0, 0, 0.8);
        const browDot = ss(0.16, 0.08, Math.hypot(Math.abs(q.x) - 0.34, q.y - 0.42, q.z - 0.55));
        const cheek = ss(-0.05, -0.3, q.y) * ss(0.2, 0.45, Math.abs(q.x)) * ss(0.3, 0.7, q.z);
        let c = mix(black, tan, Math.max(browDot, cheek));
        c = mix(c, white, muzzleTip);
        return coat(c, 0, 0, part === 'muzzle' ? 0.5 : 0.9);
      }
      if (part === 'neck') {
        const blk = ss(-0.1, 0.25, up) * ss(-0.02, 0.03, p.z - L.neck.z - 0.02);
        return coat(mix(white, black, blk), 0, 0, 1.4);
      }
      // torso: saddle across the middle of the back, patch on the hip, a few small spots
      const n = fbm(p.x * 9 + 3, p.y * 9, p.z * 9);
      const n2 = fbm(p.x * 22 + 11, p.y * 22, p.z * 22);
      const zs = p.z / L.len;
      const wob = (n - 0.5) * 0.16 + (n2 - 0.5) * 0.05;
      // saddle: a band over the back that reaches about two-thirds down the flanks, wider at the top
      const saddleSide = ss(-0.55, -0.2, up + (n2 - 0.5) * 0.5);
      const saddle = saddleSide * ss(-0.16, -0.08, zs + wob - up * 0.04) * ss(0.2, 0.12, zs + wob + up * 0.05);
      // hip patch over the rump, rounded
      const hipD = Math.hypot((zs + 0.36) * 2.4, (up - 0.55) * 0.75) + (n - 0.5) * 0.35;
      const hip = ss(0.62, 0.5, hipD);
      const blk = Math.max(saddle, hip);
      const chestFluff = ss(0.15, 0.4, zs) * ss(0.0, -0.7, up);
      return coat(mix(white, black, blk), 0, 0, 1.0 + chestFluff * 0.9 + ss(-0.4, -0.9, up) * 0.6);
    },
  };
}

// ---------------------------------------------------------------- Babadook
export function babadookSpec(): QuadSpec {
  // a gaunt, scarred, half-bald feral tom: bony hips, low-slung head, ratty tail
  const base = C('#1d1a18');
  const grey = C('#4a443e');
  const skin = C('#8a5e57'); // bare, raw-looking mange patches
  const scar = C('#b07a70');
  return {
    len: 0.46, r: 0.064, width: 0.72, bodyY: 0.25, legR: 0.0128,
    front: [0.13, 0.12], hind: [0.14, 0.125],
    neckLen: 0.07, neckPitch: -0.2, headR: 0.059, headScale: [1.18, 0.82, 0.96],
    muzzleLen: 0.026, muzzleR: 0.023, snout: 'cat',
    ear: { type: 'cat', size: 0.044, spread: 0.7, torn: true, outer: '#221e1b', inner: '#7a4f4c' },
    tail: { n: 9, len: 0.3, r0: 0.012, r1: 0.005, restCurl: -0.45, lift: 0.4 },
    eye: { color: '#ffb000', ring: '#8a3a00', pupil: 'slit', size: 0.0135, glow: 1.8 },
    nose: '#3a2424',
    whiskers: true,
    fur: { len: 0.0135, shells: 6, density: 230, clump: 1.7, mottle: 0.3 },
    coat: (part, p, L) => {
      const n = fbm(p.x * 20 + 9, p.y * 20, p.z * 20);
      const blotch = vnoise(p.x * 26 + 4, p.y * 26, p.z * 26);
      const up = (p.y - L.bodyY) / L.r;
      let c = mix(base, grey, (n - 0.5) * 1.6);
      // mange: bare pinkish skin with a ragged darker rim
      const m = ss(0.68, 0.76, blotch);
      const rim = ss(0.6, 0.68, blotch) * (1 - m);
      c = mix(c, C('#100e0d'), rim * 0.6);
      c = mix(c, skin, m * 0.85);
      // raking scars across the head and one flank
      if (part === 'head' || part === 'muzzle') {
        const q = rel(p, L);
        const sc = ss(0.05, 0.0, Math.abs(q.y + q.x * 0.9 - 0.25)) * ss(0.2, 0.5, q.z) * ss(0.0, 0.2, q.x);
        c = mix(c, scar, sc * 0.9);
        return coat(c, 0, 0, m > 0.5 ? 0.15 : 0.8 + n * 0.6);
      }
      if (part === 'torso') {
        const zs = p.z / L.len;
        const s1 = ss(0.04, 0.0, Math.abs(up * 0.5 + zs * 1.6 + 0.1)) * ss(0.0, 0.3, p.x / L.r) * ss(-0.6, 0.2, up);
        c = mix(c, scar, s1 * 0.8);
      }
      // raised hackles along the spine, spiky elsewhere, bald where mangy
      const spine = part === 'torso' || part === 'neck' ? ss(0.6, 0.95, up) : 0;
      const tuft = 0.55 + vnoise(p.x * 55, p.y * 55, p.z * 55) * 1.4;
      return coat(c, 0, 0, m > 0.5 ? 0.12 : tuft + spine * 1.3);
    },
  };
}

export function makePet(id: PetId): Quadruped {
  const spec = id === 'darrow' ? darrowSpec() : id === 'rufus' ? rufusSpec() : pennySpec();
  const q = new Quadruped(spec, id);
  q.root.name = id;
  return q;
}

export function makeBabadook(): Quadruped {
  return new Quadruped(babadookSpec(), 'babadook');
}
