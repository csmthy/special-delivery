// Character rig: a skeleton of bones driving ONE smooth sculpted skinned mesh per animal,
// with layered fur shells, per-pixel coat patterns, and detailed eyes/nose/ears.
// The animation half (IK legs, gaits, tail, ears, blinking) drives the bones.
import * as THREE from 'three';
import { Sculpt, V } from './sculpt';
import { glowDot } from '../world/textures';

export type Part = 'torso' | 'head' | 'muzzle' | 'ear' | 'earInner' | 'leg' | 'paw' | 'tail' | 'neck' | 'cheek';
export type Colorizer = (part: Part, p: THREE.Vector3, side: number) => THREE.Color;

/** What the coat looks like at a rest-pose point. */
export interface Coat {
  color: THREE.Color;
  stripe: number; // stripe coordinate (bands repeat along it)
  mask: number; // 0..1 where stripes may appear
  fur: number; // fur length multiplier
}
export interface Landmarks {
  head: THREE.Vector3; // skull centre (rest, actor space)
  neck: THREE.Vector3;
  body: THREE.Vector3;
  tailBase: THREE.Vector3;
  len: number;
  r: number;
  headR: number;
  bodyY: number;
}
export type CoatFn = (part: string, p: THREE.Vector3, L: Landmarks) => Coat;

export interface QuadSpec {
  len: number;
  r: number;
  width: number;
  bodyY: number;
  legR: number;
  front: [number, number];
  hind: [number, number];
  neckLen: number;
  neckPitch: number;
  headR: number;
  headScale: [number, number, number];
  muzzleLen: number;
  muzzleR: number;
  snout: 'cat' | 'dog';
  ear: { type: 'cat' | 'flop'; size: number; spread: number; torn?: boolean; outer?: string; inner?: string };
  tail: { n: number; len: number; r0: number; r1: number; restCurl: number; lift: number };
  eye: { color: string; ring?: string; pupil: 'slit' | 'round'; size: number; glow?: number };
  nose: string;
  coat: CoatFn;
  stripes?: { color: string; freq: number; width: number; warp: number; breakup: number };
  fur: { len: number; shells: number; density: number; clump: number; mottle?: number };
  collar?: { color: string; bell: boolean; reflective?: boolean };
  personality?: 'calm' | 'rowdy' | 'eager';
  whiskers?: boolean;
  deepChest?: number;
  voxel?: number;
}

// ---------------------------------------------------------------- coat shader
const NOISE_GLSL = /* glsl */ `
float sdHash(vec3 p){ p = fract(p * 0.3183099 + vec3(0.1,0.2,0.3)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float sdNoise(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(sdHash(i+vec3(0,0,0)),sdHash(i+vec3(1,0,0)),f.x), mix(sdHash(i+vec3(0,1,0)),sdHash(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(sdHash(i+vec3(0,0,1)),sdHash(i+vec3(1,0,1)),f.x), mix(sdHash(i+vec3(0,1,1)),sdHash(i+vec3(1,1,1)),f.x),f.y), f.z); }
`;

export interface CoatUniforms {
  uLayer: { value: number };
  uFurLen: { value: number };
  uDensity: { value: number };
  uClump: { value: number };
  uStripeColor: { value: THREE.Color };
  uStripeFreq: { value: number };
  uStripeWidth: { value: number };
  uWarp: { value: number };
  uBreakup: { value: number };
  uMottle: { value: number };
}

export function coatMaterial(spec: QuadSpec, layer: number): THREE.MeshStandardMaterial {
  const st = spec.stripes;
  const u: CoatUniforms = {
    uLayer: { value: layer },
    uFurLen: { value: spec.fur.len },
    uDensity: { value: spec.fur.density },
    uClump: { value: spec.fur.clump },
    uStripeColor: { value: new THREE.Color(st?.color ?? '#000000') },
    uStripeFreq: { value: st?.freq ?? 0 },
    uStripeWidth: { value: st?.width ?? 0.3 },
    uWarp: { value: st?.warp ?? 0 },
    uBreakup: { value: st?.breakup ?? 0 },
    uMottle: { value: spec.fur.mottle ?? 0.12 },
  };
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
  if (layer > 0) {
    m.alphaToCoverage = true;
    m.transparent = false;
  }
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute float aStripe; attribute float aMask; attribute float aFur;
uniform float uLayer; uniform float uFurLen;
varying vec3 vRest; varying float vStripe; varying float vMask; varying float vFurL;`,
      )
      .replace(
        '#include <skinning_vertex>',
        `#include <skinning_vertex>
  float furL = uFurLen * aFur * uLayer;
  transformed += normalize(objectNormal) * furL;
  transformed.y -= furL * uLayer * 0.35;
  vRest = position; vStripe = aStripe; vMask = aMask; vFurL = aFur;`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uLayer; uniform float uDensity; uniform float uClump; uniform vec3 uStripeColor; uniform float uStripeFreq;
uniform float uStripeWidth; uniform float uWarp; uniform float uBreakup; uniform float uMottle;
varying vec3 vRest; varying float vStripe; varying float vMask; varying float vFurL;
${NOISE_GLSL}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
  // coat stripes (tabby bands with organic warp and breakup into spots)
  if (uStripeFreq > 0.0 && vMask > 0.01) {
    float w = sdNoise(vRest * 11.0) * 0.55 + sdNoise(vRest * 38.0) * 0.3 + sdNoise(vRest * 90.0) * 0.15;
    float s = fract(vStripe * uStripeFreq + w * uWarp * 1.6);
    float wid = uStripeWidth * (0.7 + 0.6 * sdNoise(vRest * 24.0 + 7.0));
    float band = smoothstep(1.0 - wid - 0.12, 1.0 - wid + 0.12, abs(s - 0.5) * 2.0);
    float brk = mix(1.0, smoothstep(0.35, 0.6, sdNoise(vRest * 70.0 + 3.1)), uBreakup);
    diffuseColor.rgb = mix(diffuseColor.rgb, uStripeColor, clamp(band * brk * vMask, 0.0, 1.0));
  }
  diffuseColor.rgb *= 1.0 - uMottle + uMottle * 2.0 * sdNoise(vRest * 160.0);
  // fur shells: strand mask with clumping, darker near the skin
  float ao = mix(0.8, 1.05, uLayer);
  diffuseColor.rgb *= ao;
  if (uLayer > 0.0) {
    float cl = sdNoise(vRest * 55.0);
    float strand = sdHash(floor(vRest * uDensity) + 0.5);
    float keep = strand * (1.0 - uClump * 0.5 + uClump * cl) - uLayer * uLayer * 0.95 + 0.05;
    keep *= step(0.05, vFurL);
    diffuseColor.a = smoothstep(0.0, 0.18, keep);
    if (diffuseColor.a < 0.02) discard;
  }`,
      );
  };
  m.customProgramCacheKey = () => `coat-${layer > 0 ? 'shell' : 'base'}-${st ? 'st' : 'plain'}`;
  (m as any).userData.u = u;
  return m;
}

// ---------------------------------------------------------------- eyes, nose, ears
function irisTexture(color: string, ring: string, pupil: 'slit' | 'round', glow: number) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const base = new THREE.Color(color);
  const grad = g.createRadialGradient(64, 64, 6, 64, 64, 64);
  grad.addColorStop(0, '#' + base.clone().multiplyScalar(1.25).getHexString());
  grad.addColorStop(0.55, color);
  grad.addColorStop(0.9, ring);
  grad.addColorStop(1, '#0a0806');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  // radial fibres
  for (let i = 0; i < 90; i++) {
    const a = (i / 90) * Math.PI * 2;
    g.strokeStyle = `rgba(${i % 2 ? '255,255,220' : '40,30,10'},${0.12 + Math.random() * 0.12})`;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(64 + Math.cos(a) * 14, 64 + Math.sin(a) * 14);
    g.lineTo(64 + Math.cos(a) * 60, 64 + Math.sin(a) * 60);
    g.stroke();
  }
  g.fillStyle = '#050403';
  g.beginPath();
  if (pupil === 'slit') g.ellipse(64, 64, 9, 44, 0, 0, Math.PI * 2);
  else g.arc(64, 64, 26, 0, Math.PI * 2);
  g.fill();
  if (glow > 0.5) {
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = 'rgba(255,200,40,0.25)';
    g.fillRect(0, 0, 128, 128);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function catEarGeometry(size: number, torn: boolean, outer: THREE.Color, inner: THREE.Color, rim: THREE.Color) {
  const U = 10;
  const Vn = 12;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const thick = size * 0.09;
  const pt = (u: number, v: number, back: boolean) => {
    let vv = v;
    if (torn && u > 0.2 && v > 0.62) vv = 0.62 + (v - 0.62) * 0.4; // notched tip
    const w = size * 0.6 * Math.pow(1 - vv, 0.85) + size * 0.02;
    const x = u * w;
    const y = vv * size * 1.15;
    const cup = size * 0.22 * (1 - u * u) * Math.sin(Math.min(1, vv * 1.4) * Math.PI * 0.9);
    const z = back ? -cup * 0.35 - thick * (1 - u * u) * (1 - vv) : -cup;
    return [x, y, z];
  };
  for (const back of [false, true]) {
    const off = pos.length / 3;
    for (let j = 0; j <= Vn; j++)
      for (let i = 0; i <= U; i++) {
        const u = (i / U) * 2 - 1;
        const v = j / Vn;
        const p = pt(u, v, back);
        pos.push(p[0], p[1], p[2]);
        let c = outer;
        if (!back) {
          const edge = Math.abs(u) > 0.72 || v > 0.9;
          c = edge ? rim : inner.clone().lerp(rim, Math.max(0, (Math.abs(u) - 0.4) * 1.2) + (v < 0.15 ? 0.4 : 0));
        }
        col.push(c.r, c.g, c.b);
      }
    for (let j = 0; j < Vn; j++)
      for (let i = 0; i < U; i++) {
        const a = off + j * (U + 1) + i;
        const b = a + 1;
        const c = a + U + 1;
        const d = c + 1;
        if (back) idx.push(a, b, c, b, d, c);
        else idx.push(a, c, b, b, c, d);
      }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function catNoseGeometry(w: number) {
  const s = new THREE.Shape();
  s.moveTo(-w, w * 0.35);
  s.quadraticCurveTo(0, w * 0.55, w, w * 0.35);
  s.quadraticCurveTo(w * 0.35, -w * 0.25, 0, -w * 0.75);
  s.quadraticCurveTo(-w * 0.35, -w * 0.25, -w, w * 0.35);
  const g = new THREE.ExtrudeGeometry(s, { depth: w * 0.35, bevelEnabled: true, bevelThickness: w * 0.25, bevelSize: w * 0.2, bevelSegments: 3, curveSegments: 8 });
  g.translate(0, 0, -w * 0.35);
  return g;
}

// ---------------------------------------------------------------- rig
interface Leg {
  root: THREE.Bone;
  upper: THREE.Bone;
  lower: THREE.Bone;
  paw: THREE.Bone;
  L1: number;
  L2: number;
  front: boolean;
  side: number;
  phaseOff: number;
  zOff: number;
}

export interface AnimParams {
  speed: number;
  crouch: number;
  sit: number;
  lie: number;
  carry: number;
  leap: number;
  hit: number;
  dip: number;
  bark: number;
  lookYaw: number;
  lookPitch: number;
  turn: number;
  proud: number;
  wiggle: number;
  dizzy: number;
  eyesClosed: number;
  tailMood: number;
  gait: 'walk' | 'trot' | 'bound';
}

export function defaultParams(): AnimParams {
  return { speed: 0, crouch: 0, sit: 0, lie: 0, carry: 0, leap: -1, hit: 0, dip: 0, bark: 0, lookYaw: 0, lookPitch: 0, turn: 0, proud: 0, wiggle: 0, dizzy: 0, eyesClosed: 0, tailMood: 0.5, gait: 'walk' };
}

const geoCache = new Map<string, { geo: THREE.BufferGeometry }>();

export class Quadruped {
  root = new THREE.Group();
  body = new THREE.Bone();
  neck = new THREE.Bone();
  head = new THREE.Bone();
  jaw = new THREE.Bone();
  mouth = new THREE.Group();
  eyes: THREE.Object3D[] = [];
  ears: THREE.Object3D[] = [];
  tail: THREE.Bone[] = [];
  legs: Leg[] = [];
  bell?: THREE.Object3D;
  skin!: THREE.SkinnedMesh;
  shells: THREE.SkinnedMesh[] = [];
  p = defaultParams();
  phase = Math.random();
  private t = Math.random() * 10;
  private blinkIn = 2;
  private blinkT = 0;
  private earVel = [0, 0];
  private earAng = [0, 0];
  private idleT = 0;
  private smooth = { crouch: 0, sit: 0, lie: 0, carry: 0, dip: 0, proud: 0, bob: 0, pitch: 0, speed: 0 };
  bellRing = 0;
  stepEvent: ((front: boolean) => void) | null = null;
  materials: THREE.Material[] = [];
  triangles = 0;

  constructor(public spec: QuadSpec, private cacheKey = '') {
    this.build();
  }

  setFur(on: boolean) {
    for (const s of this.shells) s.visible = on;
  }
  /** 0 = no fur, 1 = half the shells, 2 = full */
  setFurLevel(level: number) {
    this.shells.forEach((m, i) => (m.visible = level >= 2 || (level === 1 && i % 2 === 1)));
  }

  private build() {
    const s = this.spec;
    const bones: THREE.Bone[] = [];
    const reg = (b: THREE.Bone) => {
      bones.push(b);
      return bones.length - 1;
    };
    this.root.add(this.body);
    this.body.position.set(0, s.bodyY, 0);
    const iBody = reg(this.body);
    this.neck.position.set(0, s.r * 0.45, s.len / 2 - s.r * 0.45);
    this.body.add(this.neck);
    const iNeck = reg(this.neck);
    this.head.position.set(0, Math.cos(0.6) * s.neckLen, Math.sin(0.6) * s.neckLen);
    this.neck.add(this.head);
    const iHead = reg(this.head);
    const hR = s.headR;
    const [hx, hy, hz] = s.headScale;
    this.jaw.position.set(0, -hR * 0.42, hR * 0.32);
    this.head.add(this.jaw);
    const iJaw = reg(this.jaw);
    this.mouth.position.set(0, -hR * 0.48, hR * hz * 0.72 + s.muzzleLen * 0.8);
    this.head.add(this.mouth);

    // legs
    const legDefs: [boolean, number, number][] = [
      [true, -1, 0.25],
      [true, 1, 0.75],
      [false, -1, 0.0],
      [false, 1, 0.5],
    ];
    const legIdx: { root: number; upper: number; lower: number; paw: number }[] = [];
    for (const [front, side, phaseOff] of legDefs) {
      const [L1, L2] = front ? s.front : s.hind;
      const root = new THREE.Bone();
      const zOff = front ? s.len / 2 - s.r * 0.75 : -s.len / 2 + s.r * 0.7;
      root.position.set(side * s.r * s.width * 0.55, -s.r * 0.25, zOff);
      this.body.add(root);
      const upper = new THREE.Bone();
      root.add(upper);
      const lower = new THREE.Bone();
      lower.position.y = -L1;
      upper.add(lower);
      const paw = new THREE.Bone();
      paw.position.y = -L2;
      lower.add(paw);
      legIdx.push({ root: reg(root), upper: reg(upper), lower: reg(lower), paw: reg(paw) });
      this.legs.push({ root, upper, lower, paw, L1, L2, front, side, phaseOff, zOff });
    }
    // tail
    const segLen = s.tail.len / s.tail.n;
    let parent: THREE.Object3D = this.body;
    const tailIdx: number[] = [];
    for (let i = 0; i < s.tail.n; i++) {
      const seg = new THREE.Bone();
      if (i === 0) seg.position.set(0, s.r * 0.35, -s.len / 2 + s.r * 0.15);
      else seg.position.set(0, segLen, 0);
      parent.add(seg);
      this.tail.push(seg);
      tailIdx.push(reg(seg));
      parent = seg;
    }
    // ears
    const earIdx: number[] = [];
    for (const sd of [-1, 1]) {
      if (s.ear.type === 'cat') {
        const pivot = new THREE.Group();
        pivot.position.set(sd * hR * s.ear.spread * hx, hR * 0.6 * hy, -hR * 0.02);
        this.head.add(pivot);
        this.ears.push(pivot);
      } else {
        const pivot = new THREE.Bone();
        pivot.position.set(sd * hR * s.ear.spread * hx, hR * 0.32, -hR * 0.12);
        this.head.add(pivot);
        this.ears.push(pivot);
        earIdx.push(reg(pivot));
      }
    }

    // ---------------- rest pose landmarks
    this.root.updateMatrixWorld(true);
    const W = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3());
    const B = W(this.body);
    const H = W(this.head);
    const J = W(this.jaw);
    const N = W(this.neck);
    const L: Landmarks = { head: H, neck: N, body: B, tailBase: W(this.tail[0]), len: s.len, r: s.r, headR: hR, bodyY: s.bodyY };
    const r = s.r;
    const w = s.width;

    let geo: THREE.BufferGeometry;
    const cached = this.cacheKey ? geoCache.get(this.cacheKey) : undefined;
    if (cached) geo = cached.geo;
    else {
      const S = new Sculpt();
      const deep = s.deepChest ?? 0;
      // torso: pelvis, belly, ribcage, shoulders
      S.add({ kind: 'ellipsoid', c: B.clone().add(V(0, 0.02 * r, -s.len * 0.3)), r: V(r * w * 0.9, r * 0.9, r * 1.15), bone: iBody, part: 'torso', k: 0 });
      S.add({ kind: 'ellipsoid', c: B.clone().add(V(0, -0.08 * r, -s.len * 0.02)), r: V(r * w * 0.84, r * 0.84, s.len * 0.3), bone: iBody, part: 'torso', k: r * 0.6 });
      S.add({ kind: 'ellipsoid', c: B.clone().add(V(0, -0.04 * r - deep * 0.12 * r, s.len * 0.2)), r: V(r * w * 0.95, r * (1.02 + 0.18 * deep), r * 1.25), bone: iBody, part: 'torso', k: r * 0.6 });
      S.add({ kind: 'ellipsoid', c: B.clone().add(V(0, 0.14 * r, s.len * 0.36)), r: V(r * w * 0.78, r * 0.82, r * 0.8), bone: iBody, part: 'torso', k: r * 0.5 });
      // neck
      S.add({ kind: 'capsule', a: N.clone().add(V(0, -0.15 * r, -0.1 * r)), b: H.clone().add(V(0, -0.1 * hR, -0.1 * hR)), ra: r * 0.66, rb: hR * 0.64, bone: iNeck, part: 'neck', k: r * 0.45 });
      // head
      S.add({ kind: 'ellipsoid', c: H.clone().add(V(0, 0.04 * hR, -0.04 * hR)), r: V(hR * hx, hR * hy * 0.94, hR * hz * 0.95), bone: iHead, part: 'head', k: hR * 0.35 });
      const eyeZ = hR * hz * 0.74;
      const eyeX = hR * 0.4 * hx;
      const eyeY = hR * (s.snout === 'dog' ? 0.16 : 0.1);
      if (s.snout === 'cat') {
        for (const sd of [-1, 1]) {
          S.add({ kind: 'ellipsoid', c: H.clone().add(V(sd * hR * 0.46 * hx, -hR * 0.26, hR * 0.28)), r: V(hR * 0.44, hR * 0.38, hR * 0.44), bone: iHead, part: 'cheek', k: hR * 0.25 });
          S.add({ kind: 'ellipsoid', c: H.clone().add(V(sd * s.muzzleR * 0.52, -hR * 0.32, hR * hz * 0.76 + s.muzzleLen * 0.3)), r: V(s.muzzleR * 0.62, s.muzzleR * 0.55, s.muzzleR * 0.62), bone: iHead, part: 'muzzle', k: hR * 0.14 });
        }
        S.add({ kind: 'capsule', a: H.clone().add(V(0, 0.18 * hR, 0.55 * hR)), b: H.clone().add(V(0, -0.1 * hR, hR * hz * 0.8 + s.muzzleLen * 0.45)), ra: hR * 0.24, rb: s.muzzleR * 0.42, bone: iHead, part: 'bridge', k: hR * 0.22 });
        S.add({ kind: 'ellipsoid', c: J.clone().add(V(0, -0.005, hR * 0.5)), r: V(s.muzzleR * 0.7, s.muzzleR * 0.42, s.muzzleR * 0.85), bone: iJaw, part: 'chin', k: hR * 0.12 });
        // ear bases
        for (const sd of [-1, 1]) S.add({ kind: 'ellipsoid', c: H.clone().add(V(sd * hR * s.ear.spread * hx, hR * 0.55 * hy, -hR * 0.02)), r: V(hR * 0.22, hR * 0.18, hR * 0.14), bone: iHead, part: 'head', k: hR * 0.2 });
      } else {
        // dog: long snout, stop and brows, lower jaw, floppy ears
        S.add({ kind: 'capsule', a: H.clone().add(V(0, -0.12 * hR, 0.5 * hR)), b: H.clone().add(V(0, -0.3 * hR, hR * hz + s.muzzleLen)), ra: s.muzzleR * 1.25, rb: s.muzzleR * 0.82, bone: iHead, part: 'muzzle', k: hR * 0.3 });
        for (const sd of [-1, 1]) S.add({ kind: 'ellipsoid', c: H.clone().add(V(sd * hR * 0.32, hR * 0.28, hR * 0.5)), r: V(hR * 0.26, hR * 0.18, hR * 0.24), bone: iHead, part: 'brow', k: hR * 0.25 });
        S.add({ kind: 'capsule', a: J.clone().add(V(0, 0.0, 0.25 * hR)), b: J.clone().add(V(0, 0.02, hR * hz * 0.6 + s.muzzleLen * 0.95)), ra: s.muzzleR * 0.78, rb: s.muzzleR * 0.5, bone: iJaw, part: 'chin', k: hR * 0.15 });
        earIdx.forEach((bi, k) => {
          const sd = k === 0 ? -1 : 1;
          const P = W(this.ears[k]);
          S.add({ kind: 'ellipsoid', c: P.clone().add(V(sd * 0.007, -s.ear.size * 0.82, -0.004)), r: V(s.ear.size * 0.13, s.ear.size * 0.95, s.ear.size * 0.5), bone: bi, part: 'ear', k: 0.01 });
        });
      }
      // eye sockets
      for (const sd of [-1, 1]) S.add({ kind: 'ellipsoid', c: H.clone().add(V(sd * eyeX, eyeY, eyeZ)), r: V(s.eye.size * 1.2, s.eye.size * 1.0, s.eye.size * 1.1), bone: iHead, part: 'head', k: hR * 0.1, sub: true });
      // legs
      this.legs.forEach((leg, li) => {
        const ids = legIdx[li];
        const R = W(leg.root);
        const Lw = W(leg.lower);
        const P = W(leg.paw);
        const lr = s.legR;
        if (leg.front) S.add({ kind: 'ellipsoid', c: R.clone().add(V(-leg.side * r * 0.04, r * 0.15, 0.02 * r)), r: V(r * 0.36, r * 0.7, r * 0.5), bone: iBody, part: 'torso', k: r * 0.35 });
        else S.add({ kind: 'ellipsoid', c: R.clone().add(V(-leg.side * r * 0.04, -r * 0.08, -r * 0.02)), r: V(r * 0.47, r * 1.0, r * 0.8), bone: iBody, part: 'torso', k: r * 0.45 });
        S.add({ kind: 'capsule', a: R.clone().add(V(0, -r * 0.1, 0)), b: Lw, ra: leg.front ? lr * 1.75 : lr * 2.1, rb: lr * 1.05, bone: ids.upper, part: 'leg', k: lr * 1.6 });
        S.add({ kind: 'capsule', a: Lw, b: P, ra: lr * 1.0, rb: lr * 0.82, bone: ids.lower, part: 'leg', k: lr * 0.8 });
        S.add({ kind: 'ellipsoid', c: P.clone().add(V(0, -lr * 0.25, lr * 0.5)), r: V(lr * 1.3, lr * 0.72, lr * 1.65), bone: ids.paw, part: 'paw', k: lr * 0.6 });
        for (const tx of [-1.2, -0.4, 0.4, 1.2]) S.add({ kind: 'ellipsoid', c: P.clone().add(V(tx * lr * 0.5, -lr * 0.32, lr * 1.55 - Math.abs(tx) * lr * 0.18)), r: V(lr * 0.42, lr * 0.4, lr * 0.45), bone: ids.paw, part: 'paw', k: lr * 0.25 });
      });
      // tail
      for (let i = 0; i < s.tail.n; i++) {
        const a = W(this.tail[i]);
        const b = i + 1 < s.tail.n ? W(this.tail[i + 1]) : a.clone().add(V(0, segLen, 0));
        const t0 = i / s.tail.n;
        const t1 = (i + 1) / s.tail.n;
        S.add({ kind: 'capsule', a, b, ra: s.tail.r0 + (s.tail.r1 - s.tail.r0) * t0, rb: s.tail.r0 + (s.tail.r1 - s.tail.r0) * t1, bone: tailIdx[i], part: 'tail', k: i === 0 ? r * 0.35 : s.tail.r0 * 0.6 });
      }
      const built = S.build(s.voxel ?? 0.0042, bones.length, 0.009);
      geo = built.geo;
      // coat attributes
      const pos = geo.attributes.position as THREE.BufferAttribute;
      const col = new Float32Array(pos.count * 3);
      const aS = new Float32Array(pos.count);
      const aM = new Float32Array(pos.count);
      const aF = new Float32Array(pos.count);
      const pv = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        pv.fromBufferAttribute(pos, i);
        const c = s.coat(built.parts[i], pv, L);
        col[i * 3] = c.color.r;
        col[i * 3 + 1] = c.color.g;
        col[i * 3 + 2] = c.color.b;
        aS[i] = c.stripe;
        aM[i] = c.mask;
        aF[i] = c.fur;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geo.setAttribute('aStripe', new THREE.BufferAttribute(aS, 1));
      geo.setAttribute('aMask', new THREE.BufferAttribute(aM, 1));
      geo.setAttribute('aFur', new THREE.BufferAttribute(aF, 1));
      geo.computeBoundingSphere();
      if (this.cacheKey) geoCache.set(this.cacheKey, { geo });
    }
    this.triangles = (geo.index?.count ?? 0) / 3;

    const skeleton = new THREE.Skeleton(bones);
    const baseMat = coatMaterial(s, 0);
    this.materials.push(baseMat);
    this.skin = new THREE.SkinnedMesh(geo, baseMat);
    this.skin.castShadow = true;
    this.skin.receiveShadow = true;
    this.skin.frustumCulled = false;
    this.root.add(this.skin);
    this.skin.bind(skeleton);
    for (let l = 1; l <= s.fur.shells; l++) {
      const m = coatMaterial(s, l / s.fur.shells);
      const sh = new THREE.SkinnedMesh(geo, m);
      sh.frustumCulled = false;
      sh.castShadow = false;
      sh.receiveShadow = true;
      this.root.add(sh);
      sh.bind(skeleton);
      this.shells.push(sh);
      this.materials.push(m);
    }

    // ---------------- rigid details
    const headCoat = (p: THREE.Vector3, part = 'head') => s.coat(part, p, L).color;
    // eyes
    const iris = irisTexture(s.eye.color, s.eye.ring ?? '#2a2412', s.eye.pupil, s.eye.glow ?? 0);
    const evil = (s.eye.glow ?? 0) > 0.5;
    const eyeMat: THREE.Material = evil
      ? new THREE.MeshBasicMaterial({ map: iris, color: new THREE.Color(1, 1, 1).multiplyScalar(1 + (s.eye.glow ?? 1) * 0.6), toneMapped: false })
      : new THREE.MeshPhysicalMaterial({ map: iris, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05, emissive: new THREE.Color(s.eye.color), emissiveIntensity: s.eye.glow ?? 0.08, emissiveMap: iris });
    const haloMat = evil ? new THREE.SpriteMaterial({ map: glowDot('255,190,40'), color: '#ffcc33', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.9, toneMapped: false }) : null;
    const eyeZ = hR * hz * 0.74;
    const eyeX = hR * 0.4 * hx;
    const eyeY = hR * (s.snout === 'dog' ? 0.16 : 0.1);
    for (const sd of [-1, 1]) {
      const eg = new THREE.Group();
      eg.position.set(sd * eyeX, eyeY, eyeZ - s.eye.size * 0.25);
      eg.rotation.y = sd * 0.32;
      this.head.add(eg);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(s.eye.size, 20, 14), eyeMat);
      ball.rotation.y = -Math.PI / 2; // texture centre faces +z
      ball.scale.set(1, s.snout === 'dog' ? 0.9 : 0.86, 0.82);
      eg.add(ball);
      const glint = new THREE.Mesh(new THREE.SphereGeometry(s.eye.size * 0.14, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
      glint.position.set(s.eye.size * 0.28, s.eye.size * 0.34, s.eye.size * 0.72);
      eg.add(glint);
      const lidG = new THREE.SphereGeometry(s.eye.size * 1.1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
      const lc = headCoat(H.clone().add(V(sd * eyeX, eyeY + s.eye.size, eyeZ)));
      const lid = new THREE.Mesh(lidG, new THREE.MeshStandardMaterial({ color: lc.clone().multiplyScalar(0.85), roughness: 0.9 }));
      lid.rotation.x = 0.35;
      lid.scale.set(1, 0.12, 1);
      if (evil) {
        // heavy, inward-slanted brow lid: a permanent scowl
        lid.rotation.z = sd * 0.55;
        lid.position.y = s.eye.size * 0.12;
        eg.userData.lidMin = 0.5;
        const halo = new THREE.Sprite(haloMat!);
        halo.scale.setScalar(s.eye.size * 7);
        halo.position.set(0, 0, s.eye.size * 0.9);
        halo.renderOrder = 5;
        eg.add(halo);
        eg.userData.halo = halo;
      }
      eg.add(lid);
      eg.userData.lid = lid;
      this.eyes.push(eg);
    }
    // fangs (evil stray only): yellowed canines hanging past the lip
    if (evil) {
      const fm = new THREE.MeshStandardMaterial({ color: '#e8dcb4', roughness: 0.35 });
      for (const sd of [-1, 1]) {
        const f = new THREE.Mesh(new THREE.ConeGeometry(s.muzzleR * 0.13, s.muzzleR * 0.62, 6), fm);
        f.rotation.x = Math.PI + 0.12;
        f.position.set(sd * s.muzzleR * 0.36, -hR * 0.36, hR * hz * 0.78 + s.muzzleLen * 0.62);
        this.head.add(f);
      }
    }
    // nose
    if (s.snout === 'cat') {
      const nose = new THREE.Mesh(catNoseGeometry(s.muzzleR * 0.34), new THREE.MeshPhysicalMaterial({ color: s.nose, roughness: 0.45, clearcoat: 0.4 }));
      nose.position.set(0, -hR * 0.1, hR * hz * 0.8 + s.muzzleLen * 0.86);
      nose.rotation.x = -0.55;
      this.head.add(nose);
    } else {
      const nose = new THREE.Mesh(new THREE.SphereGeometry(s.muzzleR * 0.62, 16, 12), new THREE.MeshPhysicalMaterial({ color: s.nose, roughness: 0.3, clearcoat: 0.8 }));
      nose.scale.set(1.15, 0.85, 0.8);
      nose.position.set(0, -0.3 * hR + s.muzzleR * 0.25, hR * hz + s.muzzleLen + s.muzzleR * 0.55);
      this.head.add(nose);
      for (const sd of [-1, 1]) {
        const nos = new THREE.Mesh(new THREE.SphereGeometry(s.muzzleR * 0.14, 8, 6), new THREE.MeshBasicMaterial({ color: '#050404' }));
        nos.position.set(nose.position.x + sd * s.muzzleR * 0.26, nose.position.y - s.muzzleR * 0.05, nose.position.z + s.muzzleR * 0.42);
        this.head.add(nos);
      }
    }
    // whiskers
    if (s.whiskers) {
      const pts: number[] = [];
      const z0 = hR * hz * 0.76 + s.muzzleLen * 0.45;
      for (const sd of [-1, 1])
        for (let i = 0; i < 4; i++) {
          const y = -hR * 0.3 + (i - 1.5) * 0.0035;
          pts.push(sd * s.muzzleR * 0.85, y, z0, sd * (s.muzzleR * 0.85 + 0.06 + i * 0.004), y + (i - 1.5) * 0.012 + 0.006, z0 - 0.018);
        }
      const wg = new THREE.BufferGeometry();
      wg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      this.head.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: '#f6f3ec', transparent: true, opacity: 0.8 })));
    }
    // cat ears (thin cupped shells)
    if (s.ear.type === 'cat') {
      this.ears.forEach((pivot, k) => {
        const sd = k === 0 ? -1 : 1;
        const P = W(pivot);
        const outer = s.ear.outer ? new THREE.Color(s.ear.outer) : headCoat(P.clone().add(V(0, s.ear.size * 0.5, -0.01)), 'ear');
        const inner = new THREE.Color(s.ear.inner ?? '#d9a3a0');
        const g = catEarGeometry(s.ear.size, !!s.ear.torn && sd > 0, outer, inner, outer.clone().lerp(new THREE.Color('#ffffff'), 0.15));
        const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }));
        m.rotation.y = sd * 0.35;
        m.position.y = -s.ear.size * 0.08;
        m.castShadow = true;
        pivot.add(m);
        // fluffy inner tuft
        const tuft = new THREE.Mesh(new THREE.ConeGeometry(s.ear.size * 0.18, s.ear.size * 0.55, 5), new THREE.MeshStandardMaterial({ color: '#f1ebe2', roughness: 1, transparent: true, opacity: 0.55 }));
        tuft.position.set(sd * s.ear.size * 0.08, s.ear.size * 0.32, -s.ear.size * 0.1);
        tuft.rotation.set(-0.3, 0, -sd * 0.3);
        m.add(tuft);
      });
    }
    // collar
    if (s.collar) {
      const cg = new THREE.TorusGeometry(r * 0.6, s.collar.reflective ? 0.006 : 0.005, 8, 28);
      const collar = new THREE.Mesh(
        cg,
        new THREE.MeshStandardMaterial({ color: s.collar.color, roughness: s.collar.reflective ? 0.25 : 0.5, metalness: s.collar.reflective ? 0.5 : 0, emissive: s.collar.reflective ? '#555555' : '#000000' }),
      );
      collar.scale.set(1, 1, 1.4);
      collar.position.set(0, s.neckLen * 0.3, s.neckLen * 0.14);
      collar.rotation.x = Math.PI / 2 - 0.6;
      this.neck.add(collar);
      if (s.collar.bell) {
        const bell = new THREE.Group();
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.0125, 14, 10), new THREE.MeshStandardMaterial({ color: '#e2b93b', metalness: 0.9, roughness: 0.25 }));
        bell.add(b);
        const slot = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.002, 0.004), new THREE.MeshBasicMaterial({ color: '#3a2a08' }));
        slot.position.set(0, -0.005, 0.011);
        bell.add(slot);
        bell.position.set(0, s.neckLen * 0.3 - r * 0.42, s.neckLen * 0.14 + r * 0.55);
        this.neck.add(bell);
        this.bell = bell;
      }
    }
  }

  // ---------------------------------------------------------------- animation
  private ikTmp = new THREE.Matrix4();
  private ikInv = new THREE.Matrix4();
  private v = new THREE.Vector3();

  update(dt: number) {
    const s = this.spec;
    const p = this.p;
    this.t += dt;
    const k = 1 - Math.exp(-dt * 10);
    const sm = this.smooth;
    sm.crouch += (p.crouch - sm.crouch) * k;
    sm.sit += (p.sit - sm.sit) * (1 - Math.exp(-dt * 6));
    sm.lie += (p.lie - sm.lie) * (1 - Math.exp(-dt * 4));
    sm.carry += (p.carry - sm.carry) * k;
    sm.dip += (p.dip - sm.dip) * (1 - Math.exp(-dt * 12));
    sm.proud += (p.proud - sm.proud) * (1 - Math.exp(-dt * 5));
    sm.speed += (p.speed - sm.speed) * (1 - Math.exp(-dt * 12));
    const spd = sm.speed;
    const moving = spd > 0.05;

    // gait timing
    const gait = p.gait;
    const duty = gait === 'walk' ? 0.62 : gait === 'trot' ? 0.5 : 0.42;
    const freq = gait === 'walk' ? 0.9 + spd * 1.6 : gait === 'trot' ? 1.6 + spd * 0.7 : 2.1 + spd * 0.55;
    const prevPhase = this.phase;
    if (moving) this.phase += dt * freq;
    else this.phase += dt * 0.0;
    const stride = moving ? (spd * duty) / freq : 0;

    // body height and pitch
    const crouchY = 1 - 0.38 * sm.crouch;
    const pers = s.personality ?? 'calm';
    const bounce = pers === 'rowdy' ? 1.7 : pers === 'eager' ? 1.2 : 0.8;
    let bob = moving ? Math.sin(this.phase * Math.PI * 4) * (gait === 'bound' ? 0.018 : 0.008) * bounce : Math.sin(this.t * 1.6) * 0.002;
    // Rufus can't keep still: idle play-crouch and a little hop every few seconds
    this.idleT = moving || p.sit > 0 || p.lie > 0 || p.carry > 0 ? 0 : this.idleT + dt;
    let playHop = 0;
    let playWiggle = 0;
    if (pers === 'rowdy' && this.idleT > 2.2) {
      const c = (this.idleT - 2.2) % 3.6;
      if (c < 0.7) playWiggle = Math.sin((c / 0.7) * Math.PI);
      else if (c < 1.0) playHop = Math.sin(((c - 0.7) / 0.3) * Math.PI);
    }
    bob += playHop * s.bodyY * 0.35;
    const liePose = sm.lie;
    const sitPose = sm.sit * (1 - liePose);
    let y = s.bodyY * crouchY + bob;
    y = y * (1 - liePose) + s.r * 0.95 * liePose;
    y = y * (1 - sitPose) + (s.bodyY * 0.72) * sitPose;
    let pitch = 0;
    if (gait === 'bound' && moving) pitch = Math.sin(this.phase * Math.PI * 2) * 0.09;
    // sitting tips the chest up; long, low bodies (Penny) tip less so the hindquarters stay on the floor
    const sitPitch = Math.min(0.72, Math.asin(Math.max(0, Math.min(1, (s.bodyY * 0.72 - s.r * 0.35) / (s.len / 2)))));
    pitch += -sitPitch * sitPose + 0.1 * sm.crouch + playWiggle * 0.18 - playHop * 0.15 - 0.05 * sm.proud * (1 - sitPose);
    let roll = -p.turn * 0.04 * Math.min(1, spd / 2);
    // pounce leap arc
    if (p.leap >= 0) {
      const a = Math.sin(Math.min(1, p.leap) * Math.PI);
      y += a * s.bodyY * 0.9;
      pitch += (p.leap < 0.5 ? -0.25 : 0.3) * a;
    }
    // wiggle before pouncing
    const wig = Math.max(p.wiggle, playWiggle) * Math.sin(this.t * 22) * 0.06;
    roll += wig * 0.5;
    // hit flinch
    roll += p.hit * Math.sin(this.t * 30) * 0.25;
    y += p.hit * 0.03;
    // dizzy wobble
    roll += p.dizzy * Math.sin(this.t * 5) * 0.2;
    sm.pitch += (pitch - sm.pitch) * (1 - Math.exp(-dt * 14));
    this.body.position.y = y;
    this.body.rotation.set(sm.pitch, wig * 0.6 + p.dizzy * Math.sin(this.t * 3.3) * 0.15, roll);
    // when sitting the pivot moves to the hips
    this.body.position.z = sitPose * s.len * 0.18 + liePose * 0;

    // legs (IK)
    this.body.updateMatrix();
    let stepped = false;
    for (const leg of this.legs) {
      let fz = 0;
      let fy = 0;
      let fx = 0;
      if (moving) {
        let off = leg.phaseOff;
        if (gait === 'trot') off = leg.front ? (leg.side < 0 ? 0 : 0.5) : leg.side < 0 ? 0.5 : 0;
        if (gait === 'bound') off = leg.front ? (leg.side < 0 ? 0 : 0.08) : leg.side < 0 ? 0.5 : 0.58;
        const ph = (((this.phase + off) % 1) + 1) % 1;
        const prevPh = (((prevPhase + off) % 1) + 1) % 1;
        if (ph < duty) {
          fz = stride / 2 - (ph / duty) * stride;
          if (prevPh >= duty || prevPh > ph) stepped = true;
        } else {
          const u = (ph - duty) / (1 - duty);
          const e = u * u * (3 - 2 * u);
          fz = -stride / 2 + e * stride;
          fy = Math.sin(u * Math.PI) * Math.min(0.06, 0.02 + stride * 0.25) * (1 - sm.crouch * 0.5);
        }
      } else {
        // idle weight shift
        fz = Math.sin(this.t * 0.7 + leg.phaseOff * 6) * 0.003;
      }
      // rest foot position in root space
      let footZ = leg.zOff + fz + this.body.position.z;
      const footX = leg.side * s.r * s.width * 0.5 + fx;
      let footY = fy;
      // sitting: hind feet forward under the hips, front feet slightly back
      if (sitPose > 0) {
        if (!leg.front) footZ = footZ * (1 - sitPose) + (leg.zOff + s.len * 0.42) * sitPose;
        else footZ = footZ * (1 - sitPose) + (leg.zOff - s.len * 0.12) * sitPose;
      }
      if (liePose > 0) {
        footZ = footZ * (1 - liePose) + (leg.front ? leg.zOff + s.len * 0.25 : leg.zOff + s.len * 0.12) * liePose;
        footY = footY * (1 - liePose) + 0.005 * liePose;
      }
      if (p.leap >= 0) {
        const a = Math.sin(Math.min(1, p.leap) * Math.PI);
        footZ += (leg.front ? 0.14 : -0.14) * a;
        footY += a * 0.1;
      }
      // dachshund-style short legs etc: transform target into leg root space
      this.v.set(footX, footY, footZ);
      leg.root.updateMatrix();
      this.ikTmp.multiplyMatrices(this.body.matrix, leg.root.matrix);
      this.ikInv.copy(this.ikTmp).invert();
      this.v.applyMatrix4(this.ikInv);
      // solve in the y-z plane
      const ty = this.v.y;
      const tz = this.v.z;
      let d = Math.hypot(ty, tz);
      const L1 = leg.L1;
      const L2 = leg.L2;
      d = Math.max(Math.abs(L1 - L2) + 0.002, Math.min(L1 + L2 - 0.0005, d));
      const a = Math.atan2(tz, -ty);
      const alpha = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))));
      const beta = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2))));
      const bend = -1; // joints point backward: front elbow, hind hock (thigh is hidden in the haunch)
      const th1 = a + bend * alpha;
      const th2 = -bend * (Math.PI - beta);
      leg.upper.rotation.x = -th1;
      leg.lower.rotation.x = -th2;
      leg.paw.rotation.x = th1 + th2 - sm.pitch;
    }
    if (stepped && this.stepEvent) this.stepEvent(true);

    // neck & head
    const look = Math.sin(this.t * 0.37) * 0.25 * (moving ? 0.2 : 1) * (1 - liePose);
    const neckPitch = s.neckPitch + 0.35 * sm.crouch - 0.25 * sm.carry + 0.75 * sm.dip - 0.35 * sm.proud + 0.65 * liePose + 0.3 * sitPose * 0 + p.lookPitch;
    this.neck.rotation.set(neckPitch - sm.pitch * 0.6, (p.lookYaw + look) * 0.5, 0);
    this.head.rotation.set(-0.15 * sm.proud + p.bark * -0.25 + sm.dip * 0.2 - sitPose * 0.25 + liePose * 0.35 + (moving ? Math.sin(this.phase * Math.PI * 4) * 0.03 : 0), (p.lookYaw + look) * 0.5, p.dizzy * Math.sin(this.t * 4) * 0.3);
    this.jaw.rotation.x = 0.05 + p.bark * 0.5 * (0.6 + 0.4 * Math.sin(this.t * 30)) + sm.carry * 0.25;

    // ears
    for (let i = 0; i < this.ears.length; i++) {
      const ear = this.ears[i];
      const sd = i === 0 ? -1 : 1;
      if (s.ear.type === 'cat') {
        const flat = Math.max(sm.crouch * 0.5, p.hit, p.wiggle * 0.3, p.dizzy * 0.6);
        const twitch = Math.max(0, Math.sin(this.t * 0.9 + i * 2.1) - 0.97) * 8;
        ear.rotation.x = -0.1 - flat * 0.9 + twitch * 0.2;
        ear.rotation.z = -sd * (0.28 + flat * 0.6);
      } else {
        // floppy spring: swings with motion
        const target = (moving ? Math.sin(this.phase * Math.PI * 4 + i) * 0.25 : 0) + p.bark * 0.4 + p.hit * 0.6 - sm.carry * 0.2;
        const acc = (target - this.earAng[i]) * 90 - this.earVel[i] * 10;
        this.earVel[i] += acc * dt;
        this.earAng[i] += this.earVel[i] * dt;
        ear.rotation.set(this.earAng[i] * 0.6, 0, sd * (0.15 + Math.abs(this.earAng[i]) * 0.4));
      }
    }

    // tail
    const n = this.tail.length;
    const happy = p.tailMood;
    for (let i = 0; i < n; i++) {
      const tt = i / n;
      let rx: number;
      let rz: number;
      if (liePose > 0.5) {
        rx = i === 0 ? -1.75 : 0.04;
        rz = i === 0 ? 0.9 : 0.42;
      } else {
        // base angle: low J-curve when relaxed, raised question mark when happy, dragged low when stalking
        const mood = Math.max(0, Math.min(1, happy * (1 - sm.crouch * 0.9)));
        const lift = s.tail.lift;
        const base = -2.45 + (1.15 + 0.55 * lift) * mood;
        const curl = (0.2 - 0.12 * mood + s.tail.restCurl * 0.1 * mood) * (0.4 + 1.6 * tt);
        rx = i === 0 ? base : curl;
        const wagFast = pers === 'eager' && happy > 0.6;
        const wave = Math.sin(this.t * (wagFast ? 16 : moving ? 5 : 2) - i * (wagFast ? 0.25 : 0.6)) * (wagFast ? 0.22 : 0.06 + 0.1 * tt) * (sm.crouch > 0.5 ? 0.4 : 1);
        const twitch = sm.crouch * Math.sin(this.t * 9 - i) * 0.18 * tt * tt * 3;
        rz = wave + twitch;
        if (sitPose > 0.3) {
          rx = rx * (1 - sitPose) + (i === 0 ? -1.75 : 0.32) * sitPose;
          rz = rz * (1 - sitPose) + 0.28 * sitPose;
        }
      }
      this.tail[i].rotation.set(rx, 0, rz);
    }

    // blinking
    this.blinkIn -= dt;
    if (this.blinkIn <= 0) {
      this.blinkT = 0.14;
      this.blinkIn = 2.5 + Math.random() * 3;
    }
    if (this.blinkT > 0) this.blinkT -= dt;
    const closed = Math.max(p.eyesClosed, liePose > 0.6 ? 1 : 0, this.blinkT > 0 ? 1 : 0, sm.proud * 0.45);
    for (const e of this.eyes) {
      const lid = e.userData.lid as THREE.Mesh;
      const mn = (e.userData.lidMin as number | undefined) ?? 0.05;
      lid.scale.y = mn + closed * (1.1 - mn);
      const halo = e.userData.halo as THREE.Sprite | undefined;
      if (halo) {
        halo.visible = closed < 0.5;
        (halo.material as THREE.SpriteMaterial).opacity = 0.75 + 0.25 * Math.sin(this.t * 5.3);
      }
    }

    // bell jiggle
    if (this.bell) {
      this.bell.rotation.x = Math.sin(this.t * 25) * 0.4 * Math.min(1, spd / 2);
      this.bell.rotation.z = Math.cos(this.t * 21) * 0.3 * Math.min(1, spd / 2);
    }
  }
}


// ---------------------------------------------------------------- legacy helpers (used by small prey models)

export function hash3(x: number, y: number, z: number) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
export function vnoise(x: number, y: number, z: number) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  let acc = 0;
  for (let dx = 0; dx < 2; dx++)
    for (let dy = 0; dy < 2; dy++)
      for (let dz = 0; dz < 2; dz++) {
        const h = hash3(xi + dx, yi + dy, zi + dz);
        acc += h * (dx ? u : 1 - u) * (dy ? v : 1 - v) * (dz ? w : 1 - w);
      }
  return acc;
}
export function fbm(x: number, y: number, z: number) {
  return vnoise(x, y, z) * 0.6 + vnoise(x * 2.1, y * 2.1, z * 2.1) * 0.3 + vnoise(x * 4.3, y * 4.3, z * 4.3) * 0.1;
}

const tmpV = new THREE.Vector3();
/** Paint vertex colours; `toActor` maps geometry-local positions into actor space for pattern lookup. */
export function paint(geo: THREE.BufferGeometry, part: Part, fn: Colorizer, toActor: THREE.Matrix4, side = 0) {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    tmpV.fromBufferAttribute(pos, i).applyMatrix4(toActor);
    const c = fn(part, tmpV, side);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

export function furMaterial(sheen = '#ffffff') {
  return new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 0.82,
    metalness: 0,
    sheen: 1,
    sheenRoughness: 0.55,
    sheenColor: new THREE.Color(sheen).multiplyScalar(0.55),
  });
}


export function mergeSimple(list: THREE.BufferGeometry[]) {
  const nonIdx = list.map((g) => (g.index ? g.toNonIndexed() : g));
  let n = 0;
  for (const g of nonIdx) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  const uv = new Float32Array(n * 2);
  let o = 0;
  for (const g of nonIdx) {
    pos.set(g.attributes.position.array as Float32Array, o * 3);
    nor.set(g.attributes.normal.array as Float32Array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array as Float32Array, o * 2);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return out;
}

