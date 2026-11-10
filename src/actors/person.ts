// Sculpted, skinned people: Postal Pete (the creepy old mail carrier behind the left fence) and the
// sketchy back neighbour. Same clay pipeline as the pets (signed-distance sculpt -> marching cubes ->
// automatic skin weights), split into a skinned body, a fine-resolution skinned head (head + jaw bones)
// and rigid sculpted hands, with procedural cloth/skin patterns in the shader for sub-voxel detail.
// Feet at y=0, facing +z.
import * as THREE from 'three';
import { Sculpt, V, type Prim } from './sculpt';

const C = (c: string) => new THREE.Color(c);
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const ss = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

// ---------------------------------------------------------------- noise (CPU, for sculpt detail + vertex paint)
function hash3(x: number, y: number, z: number) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function vnoise(x: number, y: number, z: number) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  return l(
    l(l(hash3(xi, yi, zi), hash3(xi + 1, yi, zi), u), l(hash3(xi, yi + 1, zi), hash3(xi + 1, yi + 1, zi), u), v),
    l(l(hash3(xi, yi, zi + 1), hash3(xi + 1, yi, zi + 1), u), l(hash3(xi, yi + 1, zi + 1), hash3(xi + 1, yi + 1, zi + 1), u), v),
    w,
  );
}
function fbm(x: number, y: number, z: number) {
  return vnoise(x, y, z) * 0.55 + vnoise(x * 2.1, y * 2.1, z * 2.1) * 0.3 + vnoise(x * 4.3, y * 4.3, z * 4.3) * 0.15;
}

// ---------------------------------------------------------------- material with procedural surface patterns
// aPat selects a pattern computed from the bind-pose object-space position (so it sticks to the cloth/skin):
// 0 plain · 1 pinstripe shirting · 2 cotton weave · 3 woodland camo · 4 twill/denim · 5 skin (pores, blotches)
// 6 stubble skin · 7 leather · 8 knit · 9 stained cotton (tank top)
const PATTERN_GLSL = /* glsl */ `
varying vec3 vRest;
varying float vPat;
uniform vec4 uTat;
uniform vec3 uElbow;
float pH(vec3 p){ p = fract(p*0.3183099+vec3(0.1,0.2,0.3)); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float pN(vec3 x){ vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(pH(i),pH(i+vec3(1,0,0)),f.x),mix(pH(i+vec3(0,1,0)),pH(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(pH(i+vec3(0,0,1)),pH(i+vec3(1,0,1)),f.x),mix(pH(i+vec3(0,1,1)),pH(i+vec3(1,1,1)),f.x),f.y),f.z); }
vec3 applyPattern(vec3 c){
  vec3 p = vRest;
  float k = floor(vPat + 0.5);
  if (k < 0.5) return c;
  float weave = (pN(p*900.0) - 0.5) * 0.06;
  if (k < 1.5) { // pinstripe: thin navy stripes every ~9 mm, with weave
    float s = smoothstep(0.86, 0.93, fract(p.x * 110.0 + pN(p*4.0)*0.15)) * (1.0 - smoothstep(0.96, 1.0, fract(p.x * 110.0 + pN(p*4.0)*0.15)));
    c = mix(c, c * vec3(0.42, 0.48, 0.66), s * 0.85);
    return c * (1.0 + weave);
  }
  if (k < 2.5) return c * (1.0 + weave + (pN(p*60.0)-0.5)*0.05);
  if (k < 3.5) { // camo
    float a = pN(p*9.0 + 3.1), b = pN(p*14.0 + 7.7), d = pN(p*22.0 + 1.3);
    vec3 col = c;
    if (a > 0.55) col = vec3(0.24, 0.23, 0.15);
    if (b > 0.62) col = vec3(0.47, 0.41, 0.29);
    if (d > 0.68) col = vec3(0.16, 0.15, 0.10);
    return col * (1.0 + weave);
  }
  if (k < 4.5) { // twill
    float tw = fract((p.x + p.y) * 520.0);
    return c * (0.93 + 0.1 * smoothstep(0.3, 0.7, tw) + (pN(p*40.0)-0.5)*0.12);
  }
  if (k < 5.5) { // skin: pores and faint blotches
    float por = pN(p*1400.0);
    float bl = pN(p*55.0);
    return c * (0.96 + por*0.06) * mix(vec3(1.0), vec3(1.04, 0.95, 0.94), smoothstep(0.55, 0.8, bl));
  }
  if (k < 6.5) { // stubble
    float st = step(0.72, pN(p*2600.0));
    return mix(c * (0.96 + pN(p*1400.0)*0.06), c * vec3(0.55, 0.52, 0.5), st * 0.55);
  }
  if (k < 7.5) { // leather
    return c * (0.9 + pN(p*500.0)*0.2) * (0.95 + pN(p*30.0)*0.1);
  }
  if (k < 8.5) { // knit
    float r = abs(sin(p.x * 900.0)) * 0.5 + abs(sin(p.y * 600.0 + sin(p.x*900.0)*0.6)) * 0.5;
    return c * (0.85 + r * 0.2);
  }
  if (k > 9.5) { // tattooed skin (neighbour): barbed-wire bands round both upper arms, a spider web on the left
    // elbow, and a block of jailhouse script on the right forearm, in blurred blue-black ink
    float por = pN(p*1400.0);
    vec3 skin = c * (0.96 + por*0.06);
    float side = sign(p.x);
    float ax = side * uTat.x;
    float ang = atan(p.z + 0.03, (p.x - ax) * side);
    float bandY = uTat.y;
    float w1 = abs(p.y - (bandY + 0.009 * sin(ang * 5.0)));
    float w2 = abs(p.y - (bandY - 0.009 * sin(ang * 5.0)));
    float wire = 1.0 - smoothstep(0.0011, 0.0026, min(w1, w2));
    float bt = fract(ang * 5.0 / 3.14159);
    float barb = (1.0 - smoothstep(0.0, 0.06, abs(bt - 0.5))) * (1.0 - smoothstep(0.004, 0.009, abs(p.y - bandY)));
    float ink = max(wire, barb * 0.9) * step(abs(p.y - bandY), 0.02);
    // spider web around the left elbow
    vec3 e = p - uElbow;
    float de = length(e.yz + vec2(0.0, 0.0));
    if (p.x < 0.0 && de < 0.05 && abs(e.x) < 0.05) {
      float a2 = atan(e.y, e.z);
      float spokes = 1.0 - smoothstep(0.02, 0.06, abs(sin(a2 * 4.0)));
      float rings = 1.0 - smoothstep(0.06, 0.16, abs(sin(de * 230.0)));
      ink = max(ink, max(spokes, rings) * (1.0 - smoothstep(0.04, 0.05, de)) * 0.85);
    }
    // forearm script (right arm, outer face)
    if (p.x > 0.0 && p.y < uTat.z && p.y > uTat.w && p.z > -0.01) {
      vec2 g = vec2(p.z * 260.0, p.y * 140.0);
      float cell = pH(vec3(floor(g), 3.0));
      vec2 f2 = fract(g);
      float stroke = step(0.35, cell) * (1.0 - smoothstep(0.08, 0.2, abs(f2.x - 0.5 + (cell - 0.5) * 0.4)));
      ink = max(ink, stroke * 0.8 * step(0.25, f2.y) * step(f2.y, 0.85));
    }
    return mix(skin, vec3(0.13, 0.17, 0.26), ink * 0.75);
  }
  // stained cotton: yellowed sweat patches, grease spots
  float st2 = smoothstep(0.62, 0.78, pN(p*16.0 + 4.0));
  float gr = smoothstep(0.8, 0.86, pN(p*45.0));
  c = mix(c, c * vec3(0.86, 0.78, 0.58), st2 * 0.7);
  c = mix(c, vec3(0.32, 0.27, 0.2), gr * 0.6);
  return c * (1.0 + weave);
}
`;

function personMaterial(rough = 0.75, sheen = 0, tat?: { arm: number; band: number; foreTop: number; foreBot: number; elbow: THREE.Vector3 }) {
  const m = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: rough, sheen, sheenRoughness: 0.8, sheenColor: new THREE.Color('#ffffff') });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTat = { value: new THREE.Vector4(tat?.arm ?? 0, tat?.band ?? -9, tat?.foreTop ?? -9, tat?.foreBot ?? -9) };
    sh.uniforms.uElbow = { value: tat?.elbow ?? new THREE.Vector3(0, -9, 0) };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aPat;\nvarying vec3 vRest;\nvarying float vPat;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRest = position;\nvPat = aPat;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + PATTERN_GLSL)
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = applyPattern(diffuseColor.rgb);');
  };
  m.customProgramCacheKey = () => 'person-pattern';
  return m;
}

export interface Paint {
  color: THREE.Color;
  pat: number;
  rough?: number;
}

/** Bake per-vertex colour + pattern id from a painter. */
function paintGeo(geo: THREE.BufferGeometry, parts: string[], painter: (part: string, p: THREE.Vector3) => Paint) {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  const pat = new Float32Array(pos.count);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const p = painter(parts[i], v);
    col[i * 3] = p.color.r;
    col[i * 3 + 1] = p.color.g;
    col[i * 3 + 2] = p.color.b;
    pat[i] = p.pat;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aPat', new THREE.BufferAttribute(pat, 1));
  geo.computeBoundingSphere();
}

// ---------------------------------------------------------------- spec
export interface FaceSpec {
  skin: string;
  age: number; // 0..1 wrinkles, jowls, eye bags
  gaunt: number; // 0..1 hollow cheeks, sharp cheekbones
  jawW: number; // jaw width scale
  noseLen: number;
  noseW: number;
  brow: number; // brow ridge prominence
  earSize: number;
  eye: { iris: string; open: number; size: number }; // open 0.6 sleepy .. 1.2 wide
  hair: 'combover' | 'mullet';
  hairColor: string;
  beard: 'none' | 'scraggly';
  beardColor: string;
  teeth: 'clean' | 'bad';
  grin?: boolean;
}

export interface PersonSpec {
  name: string;
  height: number;
  shoulder: number; // half width at the shoulder joints
  hipW: number;
  chestD: number;
  belly: number;
  limb: number; // limb thickness scale
  hunch: number; // rad
  face: FaceSpec;
  /** extra clothing prims for the body sculpt (collar, pockets, straps …) */
  clothes(S: Sculpt, J: Joints, B: BoneIdx): void;
  paint(part: string, p: THREE.Vector3, J: Joints): Paint;
  handPose: [HandPose, HandPose]; // left, right
  nails: string;
}

export type HandPose = 'grip' | 'relaxed' | 'can' | 'pinch';

interface Joints {
  hips: THREE.Vector3;
  spine: THREE.Vector3;
  chest: THREE.Vector3;
  neck: THREE.Vector3;
  head: THREE.Vector3;
  sh: [THREE.Vector3, THREE.Vector3];
  el: [THREE.Vector3, THREE.Vector3];
  wr: [THREE.Vector3, THREE.Vector3];
  hp: [THREE.Vector3, THREE.Vector3];
  kn: [THREE.Vector3, THREE.Vector3];
  an: [THREE.Vector3, THREE.Vector3];
  toe: [THREE.Vector3, THREE.Vector3];
  H: number;
}
interface BoneIdx {
  hips: number;
  spine: number;
  chest: number;
  neck: number;
  clav: [number, number];
  up: [number, number];
  fo: [number, number];
  th: [number, number];
  sh: [number, number];
  ft: [number, number];
}

function joints(s: PersonSpec): Joints {
  const k = s.height / 1.75;
  const W = s.shoulder;
  const hw = s.hipW;
  const sideL = (x: number) => [-x, x] as [number, number];
  const [l, r] = sideL(1);
  const mk = (f: (sd: number) => THREE.Vector3) => [f(l), f(r)] as [THREE.Vector3, THREE.Vector3];
  return {
    H: s.height,
    hips: V(0, 0.95 * k, 0),
    spine: V(0, 1.08 * k, -0.005),
    chest: V(0, 1.3 * k, -0.01),
    neck: V(0, 1.47 * k, -0.02),
    head: V(0, 1.565 * k, -0.01),
    sh: mk((sd) => V(sd * W, 1.425 * k, -0.02)),
    el: mk((sd) => V(sd * (W + 0.045), 1.135 * k, -0.035)),
    wr: mk((sd) => V(sd * (W + 0.06), 0.885 * k, 0.0)),
    hp: mk((sd) => V(sd * hw, 0.93 * k, 0)),
    kn: mk((sd) => V(sd * (hw - 0.005), 0.505 * k, 0.012)),
    an: mk((sd) => V(sd * (hw - 0.01), 0.085 * k, -0.02)),
    toe: mk((sd) => V(sd * (hw + 0.005), 0.03, 0.15 * k)),
  };
}

const quatTo = (a: THREE.Vector3, b: THREE.Vector3) => new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize());

// ---------------------------------------------------------------- the person
export class Person {
  root = new THREE.Group();
  hips = new THREE.Bone();
  spine = new THREE.Bone();
  chest = new THREE.Bone();
  neck = new THREE.Bone();
  head = new THREE.Bone();
  jaw = new THREE.Bone();
  clav: THREE.Bone[] = [new THREE.Bone(), new THREE.Bone()];
  up: THREE.Bone[] = [new THREE.Bone(), new THREE.Bone()];
  fo: THREE.Bone[] = [new THREE.Bone(), new THREE.Bone()];
  hand: THREE.Bone[] = [new THREE.Bone(), new THREE.Bone()];
  th: THREE.Bone[] = [new THREE.Bone(), new THREE.Bone()];
  sh: THREE.Bone[] = [new THREE.Bone(), new THREE.Bone()];
  ft: THREE.Bone[] = [new THREE.Bone(), new THREE.Bone()];
  eyes: THREE.Object3D[] = [];
  lids: THREE.Object3D[] = [];
  J: Joints;
  triangles = 0;
  buildMs = 0;
  private headSculpt: Sculpt | null = null;
  /** march along +z (front) to the head surface at (x, y); returns the surface z, or fallback */
  private surfZ(x: number, y: number, fallback: number, from = 0.16) {
    const S = this.headSculpt;
    if (!S) return fallback;
    for (let z = from; z > -0.02; z -= 0.0015) if (S.dist(x, y, z) < 0) return z + 0.0015;
    return fallback;
  }

  // animation inputs
  speed = 0; // m/s
  talk = 0; // 0..1
  lookYaw = 0;
  lookPitch = 0;
  pose: 'stand' | 'fence' | 'lean' | 'sit' | 'smoke' = 'stand';
  poseBlend = 0;
  creep = 0; // slow sideways head tilt
  fenceHook = 1.1; // wrist bend in the fence pose (fingers hooked over the top board)
  fenceAmt: number | null = null; // drives the fence pose directly when set (Pete's scripted reach)
  fenceLift = 0.45; // scripted reach only: extra upper-arm lift mid-reach so the hands clear the top board
  fenceBend = 1.4; // scripted reach only: extra elbow bend mid-reach
  fenceTwist = -1.6; // forearm roll in the fence pose (palms down onto the board)
  breathe = 1;
  private t = Math.random() * 10;
  private ph = 0;
  private blinkIn = 2;
  private blinkT = 0;
  private sm = { speed: 0, fence: 0, lean: 0, sit: 0, smoke: 0, talk: 0 };
  private rest = new Map<THREE.Object3D, THREE.Quaternion>();

  constructor(public spec: PersonSpec) {
    const t0 = performance.now();
    this.J = joints(spec);
    this.build();
    this.buildMs = performance.now() - t0;
  }

  private build() {
    const s = this.spec;
    const J = this.J;
    // ---- skeleton (bones positioned in their parent's space)
    const bones: THREE.Bone[] = [];
    const reg = (b: THREE.Bone, parent: THREE.Object3D, world: THREE.Vector3, parentWorld: THREE.Vector3) => {
      b.position.copy(world).sub(parentWorld);
      parent.add(b);
      bones.push(b);
      return bones.length - 1;
    };
    const O = V(0, 0, 0);
    const iH = reg(this.hips, this.root, J.hips, O);
    const iSp = reg(this.spine, this.hips, J.spine, J.hips);
    const iCh = reg(this.chest, this.spine, J.chest, J.spine);
    const iNk = reg(this.neck, this.chest, J.neck, J.chest);
    this.head.position.copy(J.head).sub(J.neck);
    this.neck.add(this.head);
    const clavPos = (i: number) => V(J.sh[i].x * 0.25, J.sh[i].y + 0.01, J.sh[i].z);
    const iClav: number[] = [];
    const iUp: number[] = [];
    const iFo: number[] = [];
    const iTh: number[] = [];
    const iSh: number[] = [];
    const iFt: number[] = [];
    for (let i = 0; i < 2; i++) {
      iClav.push(reg(this.clav[i], this.chest, clavPos(i), J.chest));
      iUp.push(reg(this.up[i], this.clav[i], J.sh[i], clavPos(i)));
      iFo.push(reg(this.fo[i], this.up[i], J.el[i], J.sh[i]));
      this.hand[i].position.copy(J.wr[i]).sub(J.el[i]);
      this.fo[i].add(this.hand[i]);
      iTh.push(reg(this.th[i], this.hips, J.hp[i], J.hips));
      iSh.push(reg(this.sh[i], this.th[i], J.kn[i], J.hp[i]));
      iFt.push(reg(this.ft[i], this.sh[i], J.an[i], J.kn[i]));
    }
    const B: BoneIdx = {
      hips: iH,
      spine: iSp,
      chest: iCh,
      neck: iNk,
      clav: iClav as [number, number],
      up: iUp as [number, number],
      fo: iFo as [number, number],
      th: iTh as [number, number],
      sh: iSh as [number, number],
      ft: iFt as [number, number],
    };

    // ---- body sculpt (clothes included)
    const S = new Sculpt();
    const k = J.H / 1.75;
    const lw = s.limb;
    const add = (p: Prim) => S.add(p);
    const ell = (c: THREE.Vector3, r: THREE.Vector3, bone: number, part: string, kk: number, rot?: THREE.Quaternion, sub = false) =>
      add({ kind: 'ellipsoid', c, r, bone, part, k: kk, rot, sub });
    const cap = (a: THREE.Vector3, b: THREE.Vector3, ra: number, rb: number, bone: number, part: string, kk: number, sub = false) =>
      add({ kind: 'capsule', a, b, ra, rb, bone, part, k: kk, sub });
    const W = s.shoulder;
    // pelvis + belly + chest + shoulders (shirt over it)
    ell(V(0, J.hips.y + 0.01, 0), V(s.hipW + 0.07, 0.11 * k, s.chestD * 0.95), iH, 'pants', 0.02);
    ell(V(0, J.spine.y + 0.03, 0.005 + s.belly * 0.04), V(W * 0.72 + s.belly * 0.02, 0.15 * k, s.chestD * 0.9 + s.belly * 0.045), iSp, 'shirt', 0.06);
    ell(V(0, J.chest.y + 0.02, 0.0), V(W * 0.84, 0.15 * k, s.chestD), iCh, 'shirt', 0.06);
    ell(V(0, J.chest.y + 0.1 * k, -0.015), V(W * 0.76, 0.075 * k, s.chestD * 0.85), iCh, 'shirt', 0.05);
    // trapezius: the slope from the neck down to each shoulder
    for (const sd of [-1, 1]) cap(V(sd * 0.035, J.neck.y + 0.0, -0.03), V(sd * W * 0.82, J.sh[0].y + 0.015, -0.025), 0.034 * lw, 0.03 * lw, iCh, 'shirt', 0.04);
    // shoulder blades
    for (const sd of [-1, 1]) ell(V(sd * W * 0.45, J.chest.y + 0.05, -s.chestD * 0.75), V(0.06, 0.08, 0.025), iCh, 'shirt', 0.04);
    // slightly sunken chest for a skinny frame (subtle sternum line)
    cap(V(0, J.chest.y + 0.09, s.chestD + 0.012), V(0, J.chest.y - 0.08, s.chestD + 0.02), 0.007, 0.006, iCh, 'shirt', 0.012, true);
    // shoulder caps
    for (let i = 0; i < 2; i++) ell(J.sh[i].clone().add(V(Math.sign(J.sh[i].x) * 0.008, -0.012, 0)), V(0.045 * lw, 0.06 * lw, 0.05 * lw), iUp[i], 'sleeve', 0.035);
    // neck (skin)
    cap(V(0, J.chest.y + 0.12 * k, -0.02), V(0, J.head.y + 0.03, -0.012), 0.047 * lw, 0.043 * lw, iNk, 'skin', 0.025);
    // arms
    for (let i = 0; i < 2; i++) {
      cap(J.sh[i], J.el[i], 0.047 * lw, 0.037 * lw, iUp[i], 'sleeve', 0.02);
      cap(J.el[i], J.wr[i], 0.036 * lw, 0.026 * lw, iFo[i], 'arm', 0.015);
      ell(J.el[i].clone().add(V(0, -0.01, -0.012)), V(0.03 * lw, 0.03, 0.03 * lw), iFo[i], 'arm', 0.015); // elbow point
      // forearm muscle bulge near the elbow
      ell(J.el[i].clone().lerp(J.wr[i], 0.28).add(V(0, 0, 0.006)), V(0.035 * lw, 0.07, 0.033 * lw), iFo[i], 'arm', 0.02, quatTo(J.el[i], J.wr[i]));
      // wrist stub (the sculpted hand covers the joint)
      cap(J.wr[i].clone().lerp(J.el[i], 0.1), J.wr[i].clone().add(V(0, -0.02, 0)), 0.024 * lw, 0.022 * lw, iFo[i], 'arm', 0.01);
    }
    // legs (trousers)
    for (let i = 0; i < 2; i++) {
      cap(J.hp[i], J.kn[i], 0.074 * lw, 0.05 * lw, iTh[i], 'pants', 0.035);
      ell(J.kn[i].clone().add(V(0, 0, 0.01)), V(0.05 * lw, 0.055, 0.05 * lw), iSh[i], 'pants', 0.02);
      cap(J.kn[i], J.an[i].clone().add(V(0, 0.05, 0)), 0.05 * lw, 0.038 * lw, iSh[i], 'pants', 0.02);
      // calf
      ell(J.kn[i].clone().lerp(J.an[i], 0.3).add(V(0, 0, -0.015)), V(0.048 * lw, 0.11, 0.05 * lw), iSh[i], 'pants', 0.03);
    }
    // groin
    ell(V(0, J.hips.y - 0.08 * k, 0.01), V(s.hipW * 0.9, 0.07, s.chestD * 0.75), iH, 'pants', 0.04);
    s.clothes(S, J, B);
    // fabric wrinkles: folds at the elbows, knees, waist and armpits
    S.detail = (x, y, z) => {
      let a = 0;
      for (let i = 0; i < 2; i++) {
        const de = Math.hypot(x - J.el[i].x, y - J.el[i].y, z - J.el[i].z);
        if (de < 0.09) a += (1 - de / 0.09) * Math.sin(y * 260 + Math.sin(x * 90) * 2) * 0.0035;
        const dk = Math.hypot(x - J.kn[i].x, y - J.kn[i].y, z - J.kn[i].z);
        if (dk < 0.12) a += (1 - dk / 0.12) * Math.sin(y * 190 + Math.sin(z * 70) * 2) * 0.0042;
        const da = Math.hypot(x - J.an[i].x, y - J.an[i].y - 0.1, z - J.an[i].z);
        if (da < 0.1) a += (1 - da / 0.1) * Math.sin(y * 160) * 0.004; // trouser bunching above the shoes
      }
      if (Math.abs(y - (J.hips.y + 0.06)) < 0.07) a += (1 - Math.abs(y - (J.hips.y + 0.06)) / 0.07) * Math.sin(x * 120 + y * 30) * 0.003;
      return a + (fbm(x * 30, y * 30, z * 30) - 0.5) * 0.004;
    };
    S.detailBand = 0.008;
    const body = S.build(0.0122 * k, bones.length, 0.022);
    paintGeo(body.geo, body.parts, (part, p) => s.paint(part, p, J));
    const skeleton = new THREE.Skeleton(bones);
    const tat =
      s.name === 'neighbor'
        ? { arm: Math.abs(J.sh[1].x) + 0.025, band: J.sh[1].y - 0.12, foreTop: J.el[1].y - 0.05, foreBot: J.wr[1].y + 0.06, elbow: J.el[0].clone() }
        : undefined;
    const bodyMesh = new THREE.SkinnedMesh(body.geo, personMaterial(0.82, 0.35, tat));
    bodyMesh.castShadow = bodyMesh.receiveShadow = true;
    bodyMesh.frustumCulled = false;
    this.root.add(bodyMesh);
    this.root.updateMatrixWorld(true);
    bodyMesh.bind(skeleton);
    this.triangles += body.triangles;

    // ---- head (fine voxel), skinned to head + jaw
    this.buildHead();
    // ---- hands (rigid, sculpted fingers)
    for (let i = 0; i < 2; i++) this.buildHand(i);

    // remember rest orientations
    this.root.traverse((o) => this.rest.set(o, o.quaternion.clone()));
  }

  // ---------------------------------------------------------------- head
  private buildHead() {
    const f = this.spec.face;
    const S = new Sculpt();
    // head-bone space: origin at the base of the skull; face toward +z
    const hb = 0; // head bone index
    const jb = 1; // jaw bone index
    this.jaw.position.set(0, 0.062, 0.006); // the jaw hinge, just in front of the ears
    this.head.add(this.jaw);
    const ell = (c: THREE.Vector3, r: THREE.Vector3, part: string, k: number, bone = hb, rot?: THREE.Quaternion, sub = false) =>
      S.add({ kind: 'ellipsoid', c, r, bone, part, k, rot, sub });
    const cap = (a: THREE.Vector3, b: THREE.Vector3, ra: number, rb: number, part: string, k: number, bone = hb, sub = false) =>
      S.add({ kind: 'capsule', a, b, ra, rb, bone, part, k, sub });
    const g = f.gaunt;
    const age = f.age;
    // cranium + face mass
    ell(V(0, 0.115, -0.012), V(0.074, 0.086, 0.094), 'scalp', 0.02);
    ell(V(0, 0.083, 0.035), V(0.066, 0.068, 0.068), 'face', 0.03);
    // temples hollow on a gaunt face
    for (const sd of [-1, 1]) ell(V(sd * 0.071, 0.112, 0.04), V(0.012, 0.02, 0.022), 'face', 0.015, hb, undefined, true);
    // brow ridge
    cap(V(-0.045, 0.118, 0.073), V(0.045, 0.118, 0.073), 0.011 * f.brow, 0.011 * f.brow, 'brow', 0.016);
    // cheekbones (sharper when gaunt)
    for (const sd of [-1, 1]) ell(V(sd * 0.049, 0.08, 0.064), V(0.018, 0.011 + g * 0.002, 0.016), 'cheek', 0.012);
    // hollow cheeks
    for (const sd of [-1, 1]) ell(V(sd * 0.056, 0.05, 0.058), V(0.012 * g, 0.018, 0.012), 'cheek', 0.012, hb, undefined, true);
    if (g < 0.5) for (const sd of [-1, 1]) ell(V(sd * 0.047, 0.045, 0.062), V(0.02, 0.022, 0.018), 'cheek', 0.02);
    // jaw (jaw bone) + chin
    ell(V(0, 0.025, 0.04), V(0.054 * f.jawW, 0.035, 0.06), 'jaw', 0.025, jb);
    for (const sd of [-1, 1]) ell(V(sd * 0.05 * f.jawW, 0.035, 0.0), V(0.014, 0.03, 0.03), 'jaw', 0.02, jb); // jaw angles
    ell(V(0, 0.006 + g * 0.004, 0.083 - g * 0.004), V(0.021 - g * 0.004, 0.02 - g * 0.005, 0.018 - g * 0.003), 'chin', 0.016, jb);
    // jowls with age
    if (age > 0.3 && g < 0.6) for (const sd of [-1, 1]) ell(V(sd * 0.042, 0.016, 0.06), V(0.014 * age, 0.016 * age, 0.012), 'jowl', 0.015, jb);
    // eye sockets
    for (const sd of [-1, 1]) ell(V(sd * 0.031, 0.096, 0.083), V(0.02, 0.015, 0.016), 'socket', 0.012, hb, undefined, true);
    // eye bags / lower lids
    for (const sd of [-1, 1]) ell(V(sd * 0.031, 0.083, 0.085), V(0.014, 0.004 + age * 0.002, 0.008), 'lowerlid', 0.005);
    // nose: bridge, tip, alae, nostrils
    const nl = f.noseLen;
    cap(V(0, 0.112, 0.088), V(0, 0.074 - (nl - 1) * 0.02, 0.104 + (nl - 1) * 0.01), 0.0075, 0.0105 * f.noseW, 'nose', 0.008);
    ell(V(0, 0.066 - (nl - 1) * 0.02, 0.108 + (nl - 1) * 0.012), V(0.011 * f.noseW, 0.0095, 0.011), 'nose', 0.007);
    for (const sd of [-1, 1]) ell(V(sd * 0.0125 * f.noseW, 0.064, 0.098), V(0.0075, 0.0068, 0.0085), 'nose', 0.005);
    for (const sd of [-1, 1]) ell(V(sd * 0.0065, 0.0575, 0.103), V(0.003, 0.0022, 0.004), 'nostril', 0.002, hb, undefined, true);
    // philtrum + lips (upper on head, lower on jaw)
    cap(V(0, 0.057, 0.1), V(0, 0.047, 0.098), 0.005, 0.0055, 'face', 0.006);
    ell(V(0, 0.042, 0.096), V(0.02, 0.0055, 0.009), 'lip', 0.005);
    ell(V(0, 0.032, 0.093), V(0.018, 0.0062, 0.0095), 'lip', 0.005, jb);
    // mouth line / opening
    cap(V(-0.019, 0.0375, 0.1), V(0.019, 0.0375, 0.1), 0.0018, 0.0018, 'mouth', 0.0015, hb, true);
    if (f.grin) {
      // a thin, too-wide smile: corners pulled up and back, lips parted over his bad teeth
      for (const sd of [-1, 1]) cap(V(sd * 0.015, 0.0365, 0.098), V(sd * 0.028, 0.047, 0.089), 0.003, 0.0016, 'mouth', 0.0015, hb, true);
      cap(V(-0.015, 0.0362, 0.0985), V(0.015, 0.0362, 0.0985), 0.0042, 0.0042, 'mouth', 0.0015, hb, true);
    }
    // nasolabial folds with age
    if (age > 0.2) for (const sd of [-1, 1]) cap(V(sd * 0.017, 0.064, 0.097), V(sd * 0.027, 0.035, 0.09), 0.0022 * age, 0.002 * age, 'face', 0.003, hb, true);
    // ears
    for (const sd of [-1, 1]) {
      const e = f.earSize;
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.15, sd * 0.35, sd * 0.1));
      ell(V(sd * 0.076, 0.087, 0.0), V(0.008, 0.03 * e, 0.019 * e), 'ear', 0.006, hb, q);
      ell(V(sd * 0.08, 0.088, 0.002), V(0.006, 0.02 * e, 0.012 * e), 'ear', 0.003, hb, q, true); // concha
      ell(V(sd * 0.075, 0.06, 0.004), V(0.008, 0.011 * e, 0.009), 'ear', 0.004, hb); // lobe
    }
    // neck stub (overlaps the body neck)
    cap(V(0, -0.04, -0.012), V(0, 0.05, -0.012), 0.042, 0.045, 'neck', 0.03);
    // Adam's apple
    ell(V(0, -0.005, 0.034), V(0.009, 0.013, 0.008), 'neck', 0.01);
    // beard: a thin, scraggly shell over the jaw, chin and upper lip (part of the face sculpt so nothing is carved)
    if (f.beard === 'scraggly') {
      ell(V(0, 0.026, 0.042), V(0.058 * f.jawW, 0.039, 0.064), 'beard', 0.012, jb);
      ell(V(0, 0.003, 0.084), V(0.025, 0.026, 0.023), 'beard', 0.01, jb); // goatee
      ell(V(0, -0.016, 0.082), V(0.016, 0.02, 0.016), 'beard', 0.008, jb); // the scraggly drip off the chin
      for (const sd of [-1, 1]) ell(V(sd * 0.05 * f.jawW, 0.04, 0.012), V(0.016, 0.034, 0.032), 'beard', 0.012, jb);
      cap(V(-0.022, 0.0485, 0.1), V(0.022, 0.0485, 0.1), 0.004, 0.004, 'beard', 0.003); // moustache
      for (const sd of [-1, 1]) cap(V(sd * 0.022, 0.048, 0.099), V(sd * 0.025, 0.03, 0.095), 0.0035, 0.003, 'beard', 0.003);
      // re-open the mouth through the moustache/beard
      cap(V(-0.017, 0.0375, 0.104), V(0.017, 0.0375, 0.104), 0.0032, 0.0032, 'mouth', 0.002, hb, true);
      ell(V(0, 0.033, 0.098), V(0.017, 0.0055, 0.008), 'lip', 0.003, jb);
    }
    // eyelids (upper), and the eyes
    const eo = f.eye.open;
    for (const sd of [-1, 1]) {
      const up = eo >= 1 ? (eo - 1) * 0.012 : (eo - 1) * 0.005;
      ell(V(sd * 0.031, 0.101 + up, 0.083 - Math.max(0, eo - 1) * 0.008), V(0.0155, 0.007 - Math.max(0, eo - 1) * 0.008 + Math.max(0, 1 - eo) * 0.0015, 0.012), 'lid', 0.004);
    }
    S.detailBand = 0.004;
    S.detail = (x, y, z) => {
      let a = 0;
      // forehead wrinkles and crow's feet with age
      if (age > 0.2) {
        if (z > 0.04 && y > 0.125 && y < 0.17) a += Math.sin(y * 520) * 0.0006 * age;
        const cx = Math.abs(x) - 0.052;
        if (Math.abs(cx) < 0.012 && Math.abs(y - 0.096) < 0.015 && z > 0.05) a += Math.sin(y * 700 + x * 200) * 0.0004 * age;
      }
      return a + (vnoise(x * 220, y * 220, z * 220) - 0.5) * 0.0009;
    };
    const built = S.build(0.0031, 2, 0.006);
    this.headSculpt = S;
    const f2 = this.spec.face;
    const skin = C(f2.skin);
    const hairC = C(f2.hairColor);
    const beardC = C(f2.beardColor);
    paintGeo(built.geo, built.parts, (part, p) => {
      const n = fbm(p.x * 60, p.y * 60, p.z * 60);
      let c = skin.clone();
      // redness: nose, cheeks, ears; dark under-eye; veins at the temples for pale skin
      const red = Math.max(ss(0.03, 0.0, Math.hypot(p.x, p.y - 0.066, p.z - 0.106)), ss(0.03, 0.0, Math.hypot(Math.abs(p.x) - 0.045, p.y - 0.065, p.z - 0.07)) * 0.6);
      c.lerp(C('#c96f68'), red * 0.35);
      const under = ss(0.018, 0.0, Math.hypot(Math.abs(p.x) - 0.031, p.y - 0.083, p.z - 0.087));
      c.lerp(C('#6d4f5a'), under * (0.25 + age * 0.4));
      c.multiplyScalar(0.94 + n * 0.1);
      let pat = 5;
      if (part === 'lip') c.lerp(C('#a7615f'), 0.55);
      if (part === 'mouth') c = C('#2a1514');
      if (part === 'nostril') c.multiplyScalar(0.45);
      if (part === 'ear') c.lerp(C('#d08a80'), 0.25);
      if (part === 'hair') {
        c = hairC.clone().multiplyScalar(0.8 + n * 0.4);
        pat = 2;
      }
      if (part === 'eyebrow') {
        c = hairC.clone().multiplyScalar(0.7 + n * 0.3);
        pat = 0;
      }
      if (part === 'beard') {
        c = beardC.clone().multiplyScalar(0.7 + n * 0.5);
        pat = 2;
      }
      // stubble on the jaw/neck for the neighbour; liver spots on Pete's scalp
      if (f2.beard === 'scraggly' && (part === 'jaw' || part === 'chin' || part === 'neck' || part === 'jowl') && p.y < 0.05) pat = 6;
      if (f2.hair === 'combover' && part === 'scalp' && p.y > 0.15) {
        const sp = vnoise(p.x * 140, p.y * 140, p.z * 140);
        c.lerp(C('#b08a6a'), ss(0.7, 0.86, sp) * 0.45);
      }
      if (f2.hair === 'combover' && Math.abs(p.x) > 0.06 && p.y > 0.1 && p.y < 0.14 && p.z > 0.02) c.lerp(C('#8a92b4'), 0.06); // faint temple veins
      return { color: c, pat };
    });
    const skel = new THREE.Skeleton([this.head, this.jaw]);
    const mesh = new THREE.SkinnedMesh(built.geo, personMaterial(0.55, 0));
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    this.head.add(mesh);
    this.root.updateMatrixWorld(true);
    mesh.bind(skel);
    this.triangles += built.triangles;

    this.buildHair();
    // eyes: wet sclera, textured iris, with a subtle highlight
    const iris = irisTex(f.eye.iris);
    const eyeMat = new THREE.MeshPhysicalMaterial({ map: iris, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.03 });
    for (const sd of [-1, 1]) {
      const g = new THREE.Group();
      g.position.set(sd * 0.031, 0.096, 0.08);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.0118 * f.eye.size, 24, 18), eyeMat);
      ball.rotation.y = -Math.PI / 2;
      g.add(ball);
      this.head.add(g);
      this.eyes.push(g);
      // blinking lid: skin-coloured cap that slides down
      const lid = new THREE.Mesh(new THREE.SphereGeometry(0.0124 * f.eye.size, 18, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), new THREE.MeshStandardMaterial({ color: skin.clone().multiplyScalar(0.93), roughness: 0.6 }));
      lid.scale.set(1, 0.05, 1);
      lid.rotation.x = 0.25;
      g.add(lid);
      this.lids.push(lid);
    }
    // teeth (a peek inside the mouth)
    const teethMat = new THREE.MeshStandardMaterial({ color: f.teeth === 'bad' ? '#c9b47a' : '#e9e4d6', roughness: 0.4 });
    for (let i = 0; i < 8; i++) {
      if (f.teeth === 'bad' && (i === 2 || i === 5)) continue; // missing teeth
      const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.0042, 0.006, 0.003), teethMat);
      const a = (i - 3.5) * 0.12;
      tooth.position.set(Math.sin(a) * 0.026, 0.0385 + (f.teeth === 'bad' ? (i % 3) * 0.0005 : 0), 0.092 - (1 - Math.cos(a)) * 0.02);
      tooth.rotation.y = a;
      this.head.add(tooth);
    }
    const mouthIn = new THREE.Mesh(new THREE.SphereGeometry(0.018, 12, 8), new THREE.MeshBasicMaterial({ color: '#1a0b0a' }));
    mouthIn.scale.set(1, 0.5, 0.6);
    mouthIn.position.set(0, 0.036, 0.082);
    this.head.add(mouthIn);
  }

  // ---------------------------------------------------------------- hair (its own sculpt so the face window can be carved)
  private buildHair() {
    const f = this.spec.face;
    const S = new Sculpt();
    const ell = (c: THREE.Vector3, r: THREE.Vector3, k: number, sub = false, rot?: THREE.Quaternion) => S.add({ kind: 'ellipsoid', c, r, bone: 0, part: 'hair', k, sub, rot });
    const cap = (a: THREE.Vector3, b: THREE.Vector3, ra: number, rb: number, k: number) => S.add({ kind: 'capsule', a, b, ra, rb, bone: 0, part: 'hair', k });
    if (f.hair === 'mullet') {
      ell(V(0, 0.122, -0.016), V(0.08, 0.088, 0.1), 0.012);
      ell(V(0, 0.05, -0.068), V(0.07, 0.09, 0.042), 0.03); // party in the back
      ell(V(0, -0.02, -0.07), V(0.06, 0.05, 0.03), 0.03);
      for (const sd of [-1, 1]) ell(V(sd * 0.063, 0.05, -0.04), V(0.026, 0.07, 0.04), 0.03);
      // greasy strands hanging over the neck
      for (let i = 0; i < 9; i++) {
        const x = -0.05 + i * 0.0125;
        cap(V(x, 0.03, -0.085 + Math.abs(x) * 0.25), V(x * 1.15, -0.075 - (i % 3) * 0.012, -0.072 + Math.abs(x) * 0.3), 0.007, 0.003, 0.006);
      }
      // carve the face, and the ears showing through
      ell(V(0, 0.072, 0.11), V(0.068, 0.095, 0.075), 0.015, true);
      for (const sd of [-1, 1]) ell(V(sd * 0.08, 0.087, 0.005), V(0.02, 0.03, 0.022), 0.008, true);
    } else {
      // thin grey fringe around the sides and back, bald crown, a few combed-over strands
      ell(V(0, 0.098, -0.03), V(0.079, 0.052, 0.09), 0.01);
      ell(V(0, 0.15, 0.0), V(0.09, 0.05, 0.1), 0.01, true); // bald top
      ell(V(0, 0.09, 0.09), V(0.08, 0.07, 0.07), 0.01, true); // face
      for (const sd of [-1, 1]) ell(V(sd * 0.08, 0.087, 0.005), V(0.02, 0.03, 0.022), 0.008, true); // ears
    }
    S.detailBand = 0.005;
    S.detail = (x, y, z) => (vnoise(x * 160, y * 60, z * 160) - 0.5) * 0.004 + (vnoise(x * 600, y * 220, z * 600) - 0.5) * 0.0012;
    const built = S.build(0.0034, 1, 0.01);
    const hc = C(f.hairColor);
    paintGeo(built.geo, built.parts, (_part, p) => ({ color: hc.clone().multiplyScalar(0.7 + vnoise(p.x * 400, p.y * 120, p.z * 400) * 0.6), pat: 0 }));
    const m = new THREE.Mesh(built.geo, personMaterial(0.55, 0.6));
    m.castShadow = m.receiveShadow = true;
    this.head.add(m);
    this.triangles += built.triangles;
    // strand-level detail: eyebrows as tapered hair tufts, and Pete's greasy comb-over strands
    const hairMat = new THREE.MeshStandardMaterial({ color: hc, roughness: 0.5 });
    const strand = (pts: THREE.Vector3[], r: number, mat: THREE.Material) => {
      const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, r, 4, false);
      const mm = new THREE.Mesh(g, mat);
      this.head.add(mm);
    };
    const browMat = new THREE.MeshStandardMaterial({ color: hc.clone().multiplyScalar(0.75), roughness: 0.6 });
    const rnd = mulberry(f.hair === 'mullet' ? 7 : 3);
    for (const sd of [-1, 1]) {
      const raise = f.eye.open > 1 ? 0.004 : -0.003;
      for (let k = 0; k < 26; k++) {
        const t = k / 25;
        const x = sd * (0.012 + t * 0.037);
        const y = 0.12 + raise * t + Math.sin(t * Math.PI) * 0.003 - (f.eye.open < 1 ? t * t * 0.004 : 0);
        const yy = y - 0.002 + rnd() * 0.004;
        const z = this.surfZ(x, yy, 0.09) + 0.0006;
        const len = 0.006 + rnd() * 0.004;
        const a = V(x, yy, z);
        const b = a.clone().add(V(sd * len * 0.9, len * (0.2 + rnd() * 0.3), 0));
        b.z = this.surfZ(b.x, b.y, a.z) + 0.0006;
        strand([a, a.clone().lerp(b, 0.5).add(V(0, 0, 0.0008)), b], 0.0011 + (1 - t) * 0.0005, browMat);
      }
    }
    if (f.hair === 'combover' && false) {
      for (let i = 0; i < 16; i++) {
        const z = 0.05 - i * 0.008 + rnd() * 0.004;
        const pts: THREE.Vector3[] = [];
        for (let k = 0; k <= 6; k++) {
          const t = k / 6;
          const x = -0.072 + t * 0.14;
          // hug the scalp ellipsoid
          const yy = 0.115 + 0.087 * Math.sqrt(Math.max(0, 1 - (x / 0.077) ** 2 - ((z + 0.012) / 0.096) ** 2)) + 0.0012;
          pts.push(V(x, yy, z + Math.sin(t * 3) * 0.003));
        }
        strand(pts, 0.0011, hairMat);
      }
    }
  }

  // ---------------------------------------------------------------- hands
  private buildHand(i: number) {
    const sd = i === 0 ? -1 : 1; // x side of the body
    const inward = -sd; // the palm faces the thigh
    const pose = this.spec.handPose[i];
    const S = new Sculpt();
    const lw = this.spec.limb;
    // hand space: origin at the wrist, fingers pointing -y (down), palm facing the thigh (-x for the right hand)
    const palmC = V(0, -0.045, 0.004);
    S.add({ kind: 'ellipsoid', c: palmC, r: V(0.017 * lw, 0.045, 0.039), bone: 0, part: 'palm', k: 0.01 });
    S.add({ kind: 'ellipsoid', c: V(0, -0.012, 0.0), r: V(0.019 * lw, 0.02, 0.028), bone: 0, part: 'palm', k: 0.012 });
    const curl = pose === 'grip' ? 1.45 : pose === 'can' ? 1.15 : pose === 'pinch' ? 0.9 : 0.42;
    const lens = [0.044, 0.05, 0.047, 0.038];
    const segs = [0.45, 0.32, 0.23];
    for (let fi = 0; fi < 4; fi++) {
      const zf = 0.026 - fi * 0.0175;
      let p = V(0, -0.086, zf);
      let ang = (pose === 'pinch' && fi === 0 ? 1.25 : curl) * (fi === 3 ? 1.08 : 1);
      let dir = V(0, -1, 0);
      const r0 = (0.0085 - fi * 0.0006) * lw;
      for (let s2 = 0; s2 < 3; s2++) {
        // bend toward the palm (-x * sd ... palm faces +x for the left hand)
        const a = (ang / 3) * (s2 + 1);
        dir = V(inward * Math.sin(a) * 0.9, -Math.cos(a), 0).normalize();
        const q = p.clone().add(dir.clone().multiplyScalar(lens[fi] * segs[s2] * 1.05));
        S.add({ kind: 'capsule', a: p, b: q, ra: r0 * (1 - s2 * 0.12), rb: r0 * (1 - (s2 + 1) * 0.12), bone: 0, part: s2 === 2 ? 'tip' : 'finger', k: 0.004 });
        // knuckle
        S.add({ kind: 'ellipsoid', c: p.clone(), r: V(r0 * 1.12, r0 * 1.0, r0 * 1.12), bone: 0, part: 'knuckle', k: 0.004 });
        p = q;
      }
      // fingernail
      S.add({ kind: 'ellipsoid', c: p.clone().add(dir.clone().multiplyScalar(-0.006)).add(V(sd * r0 * 0.75, 0, 0)), r: V(0.0022, 0.006, r0 * 0.8), bone: 0, part: 'nail', k: 0.0015 });
      ang += 0;
    }
    // thumb: from the base of the palm, across
    {
      let p = V(inward * 0.004, -0.03, 0.03);
      const tc = pose === 'pinch' ? 1.0 : pose === 'grip' ? 0.9 : pose === 'can' ? 0.6 : 0.3;
      const dirs = [V(inward * 0.35, -0.6, 0.72), V(inward * (0.4 + tc * 0.4), -0.7, 0.45), V(inward * (0.5 + tc * 0.5), -0.8, 0.15)];
      const ls = [0.03, 0.026, 0.022];
      for (let s2 = 0; s2 < 3; s2++) {
        const q = p.clone().add(dirs[s2].normalize().multiplyScalar(ls[s2]));
        S.add({ kind: 'capsule', a: p, b: q, ra: 0.0115 * lw * (1 - s2 * 0.12), rb: 0.0105 * lw * (1 - (s2 + 1) * 0.12), bone: 0, part: s2 === 2 ? 'tip' : 'finger', k: s2 === 0 ? 0.012 : 0.004 });
        p = q;
      }
    }
    // tendons on the back of the hand (bony, older hands)
    for (let fi = 0; fi < 4; fi++) S.add({ kind: 'capsule', a: V(sd * 0.014, -0.02, 0.012 - fi * 0.009), b: V(sd * 0.016, -0.08, 0.026 - fi * 0.0175), ra: 0.0028, rb: 0.0026, bone: 0, part: 'palm', k: 0.004 });
    const built = S.build(0.0025, 1, 0.01);
    const skin = C(this.spec.face.skin);
    const nail = C(this.spec.nails);
    paintGeo(built.geo, built.parts, (part, p) => {
      let c = skin.clone().multiplyScalar(0.95 + vnoise(p.x * 300, p.y * 300, p.z * 300) * 0.08);
      if (part === 'knuckle') c.lerp(C('#c98274'), 0.18);
      if (part === 'tip') c.lerp(C('#d98d84'), 0.12);
      if (part === 'nail') c = nail.clone();
      const back = sd * p.x > 0.006;
      if (this.spec.name === 'neighbor' && back && p.y > -0.08) {
        // crude knuckle/hand tattoos on the back of the hand
        const tt = Math.sin(p.z * 400) > 0.6 && p.y > -0.06 ? 1 : 0;
        c.lerp(C('#2c3a52'), tt * 0.6);
      }
      return { color: c, pat: part === 'nail' ? 0 : 5 };
    });
    const mesh = new THREE.Mesh(built.geo, personMaterial(0.6, 0));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.hand[i].add(mesh);
    this.triangles += built.triangles;
  }

  // ---------------------------------------------------------------- animation
  private q(o: THREE.Object3D) {
    return this.rest.get(o)!;
  }
  private rot(o: THREE.Object3D, x: number, y: number, z: number) {
    o.quaternion.copy(this.q(o)).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, 'YXZ')));
  }

  update(dt: number) {
    this.t += dt;
    const sm = this.sm;
    const lerp = (k: keyof typeof sm, v: number, rate: number) => (sm[k] += (v - sm[k]) * (1 - Math.exp(-dt * rate)));
    lerp('speed', this.speed, 6);
    if (this.fenceAmt !== null) sm.fence = this.fenceAmt;
    else lerp('fence', this.pose === 'fence' ? 1 : 0, 5);
    lerp('lean', this.pose === 'lean' ? 1 : 0, 4);
    lerp('sit', this.pose === 'sit' ? 1 : 0, 3);
    lerp('smoke', this.pose === 'smoke' ? 1 : 0, 3);
    lerp('talk', this.talk, 8);
    const sp = sm.speed;
    const stride = Math.min(1, sp / 1.2);
    this.ph += dt * (sp > 0.05 ? 1.6 + sp * 0.9 : 0) * Math.PI;
    const ph = this.ph;
    // breathing; damped while gripping the fence so the hands stay planted on the board
    const br = Math.sin(this.t * 1.7) * this.breathe * (1 - 0.85 * this.sm.fence);
    const hunch = this.spec.hunch;
    const fe = sm.fence;
    const le = sm.lean;
    const si = sm.sit;
    // hips: walking bob/sway, sitting drop
    this.hips.position.y = this.J.hips.y + Math.abs(Math.sin(ph)) * 0.025 * stride - 0.012 * stride - si * 0.47;
    this.rot(this.hips, si * -0.15, Math.sin(ph) * 0.12 * stride, Math.sin(ph) * 0.03 * stride);
    this.rot(this.spine, hunch * 0.4 + le * 0.35 + si * 0.15 + br * 0.006, -Math.sin(ph) * 0.08 * stride, 0);
    this.rot(this.chest, hunch * 0.6 + le * 0.25 + br * 0.012 - fe * 0.1, -Math.sin(ph) * 0.1 * stride, 0);
    const tilt = this.creep * Math.sin(this.t * 0.35) * 0.35;
    this.rot(this.neck, -hunch * 0.4 - le * 0.3 + this.lookPitch * 0.4 + sm.talk * Math.sin(this.t * 9) * 0.02, this.lookYaw * 0.4, tilt * 0.4);
    this.rot(this.head, -hunch * 0.5 - le * 0.2 + this.lookPitch * 0.6 + sm.talk * Math.sin(this.t * 7) * 0.035, this.lookYaw * 0.6, tilt);
    this.rot(this.jaw, sm.talk * (0.12 + Math.abs(Math.sin(this.t * 13)) * 0.18), 0, 0);
    // legs
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? -1 : 1; // x side
      const a = Math.sin(ph + (i === 0 ? 0 : Math.PI));
      const knee = Math.max(0, -Math.cos(ph + (i === 0 ? 0 : Math.PI))) * 0.9 * stride + 0.05;
      this.rot(this.th[i], -a * 0.42 * stride - si * 1.45, 0, s * 0.02);
      this.rot(this.sh[i], knee + si * 1.5, 0, 0);
      this.rot(this.ft[i], a * 0.18 * stride - si * 0.05, 0, 0);
    }
    // arms
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? -1 : 1; // x side
      const a = Math.sin(ph + (i === 0 ? Math.PI : 0));
      // free swing
      let ux = a * 0.35 * stride;
      let uz = s * 0.07;
      let fx = -0.15 - Math.max(0, a) * 0.3 * stride;
      let uy = 0;
      // fence: both hands up, gripping the top board in front of the chest
      ux = ux * (1 - fe) + fe * -1.5;
      uz = uz * (1 - fe) + fe * s * 0.06;
      fx = fx * (1 - fe) + fe * -0.32;
      if (this.fenceAmt !== null) {
        // scripted reach: bring the hands up close to the body first, then out over the top board
        const bump = Math.sin(Math.PI * Math.min(1, fe * 1.08)) ** 0.7;
        ux -= bump * this.fenceLift;
        fx -= bump * this.fenceBend;
      }
      // lean: forearms resting on a low rail
      ux = ux * (1 - le) + le * -1.15;
      uz = uz * (1 - le) + le * s * -0.12;
      fx = fx * (1 - le) + le * -1.25;
      // smoke: right hand to the mouth now and then (the left holds the can)
      if (i === 1) {
        const puff = Math.max(0, Math.sin(this.t * 0.6)) ** 6 * sm.smoke;
        ux += puff * -0.9;
        fx += puff * -1.6;
        uy += puff * 0.3;
      } else {
        ux += sm.smoke * -0.15;
        fx += sm.smoke * -1.15;
      }
      // sitting: hands on the knees
      ux = ux * (1 - si) + si * -0.85;
      fx = fx * (1 - si) + si * -0.6;
      this.rot(this.clav[i], 0, 0, s * fe * 0.12);
      this.rot(this.up[i], ux + br * 0.01, uy, uz);
      this.rot(this.fo[i], fx, 0, 0);
      this.rot(this.hand[i], fe * this.fenceHook, s * fe * this.fenceTwist, 0); // fingers hooked down over the top board
    }
    // blinking (Pete barely blinks)
    this.blinkIn -= dt;
    if (this.blinkIn <= 0) {
      this.blinkT = 0.13;
      this.blinkIn = this.spec.face.eye.open > 1.05 ? 6 + Math.random() * 6 : 2 + Math.random() * 3;
    }
    if (this.blinkT > 0) this.blinkT -= dt;
    for (const l of this.lids) l.scale.y = this.blinkT > 0 ? 1.0 : 0.05;
  }
}

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function irisTex(color: string) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const g = c.getContext('2d')!;
  // equirect-ish: centre of the texture faces forward after rotation
  g.fillStyle = '#efe9e1';
  g.fillRect(0, 0, 128, 64);
  // faint veins
  g.strokeStyle = 'rgba(190,80,80,0.35)';
  g.lineWidth = 0.6;
  for (let i = 0; i < 14; i++) {
    g.beginPath();
    const y = Math.random() * 64;
    g.moveTo(Math.random() < 0.5 ? 0 : 128, y);
    g.quadraticCurveTo(64 + (Math.random() - 0.5) * 60, y + (Math.random() - 0.5) * 20, 64 + (Math.random() - 0.5) * 30, 32 + (Math.random() - 0.5) * 20);
    g.stroke();
  }
  const cx = 64;
  const cy = 32;
  const gr = g.createRadialGradient(cx, cy, 2, cx, cy, 10);
  gr.addColorStop(0, '#0a0a0a');
  gr.addColorStop(0.32, '#0a0a0a');
  gr.addColorStop(0.36, color);
  gr.addColorStop(0.85, new THREE.Color(color).multiplyScalar(0.6).getStyle());
  gr.addColorStop(1, '#3a3a3a');
  g.fillStyle = gr;
  g.beginPath();
  g.ellipse(cx, cy, 10, 10, 0, 0, Math.PI * 2);
  g.fill();
  // iris fibres
  g.strokeStyle = 'rgba(255,255,255,0.18)';
  for (let i = 0; i < 30; i++) {
    const a = (i / 30) * Math.PI * 2;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * 4, cy + Math.sin(a) * 4);
    g.lineTo(cx + Math.cos(a) * 9.5, cy + Math.sin(a) * 9.5);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ================================================================ characters
/** Postal Pete: short, skinny, pale old mail carrier. Light-blue pinstripe short-sleeve shirt, navy trousers
 * with a dark side stripe, a mail satchel — and a face-cage restraint mask strapped over his mouth. */
export function makePostalPete(): Person {
  const spec: PersonSpec = {
    name: 'pete',
    height: 1.63,
    shoulder: 0.165,
    hipW: 0.085,
    chestD: 0.095,
    belly: 0.15,
    limb: 0.82,
    hunch: 0.22,
    nails: '#cdbfae',
    handPose: ['grip', 'grip'],
    face: {
      skin: '#e9dcd2',
      age: 0.95,
      gaunt: 0.85,
      jawW: 0.92,
      noseLen: 1.18,
      noseW: 0.9,
      brow: 1.15,
      earSize: 1.2,
      eye: { iris: '#8fb4c9', open: 1.25, size: 1.0 },
      hair: 'combover',
      hairColor: '#b9b6ae',
      beard: 'none',
      beardColor: '#9a968f',
      teeth: 'bad',
      grin: true,
    },
    clothes(S, J, B) {
      const k = J.H / 1.75;
      // collar, open at the throat
      for (const sd of [-1, 1]) {
        S.add({ kind: 'capsule', a: V(sd * 0.012, J.chest.y + 0.135 * k, 0.06), b: V(sd * 0.055, J.chest.y + 0.15 * k, -0.02), ra: 0.012, rb: 0.012, bone: B.chest, part: 'collar', k: 0.008 });
        S.add({ kind: 'ellipsoid', c: V(sd * 0.032, J.chest.y + 0.12 * k, 0.078), r: V(0.03, 0.006, 0.02), bone: B.chest, part: 'collar', k: 0.006, rot: new THREE.Quaternion().setFromEuler(new THREE.Euler(0.6, 0, sd * 0.5)) });
      }
      S.add({ kind: 'capsule', a: V(-0.04, J.chest.y + 0.15 * k, -0.06), b: V(0.04, J.chest.y + 0.15 * k, -0.06), ra: 0.014, rb: 0.014, bone: B.chest, part: 'collar', k: 0.01 });
      // button placket
      S.add({ kind: 'capsule', a: V(0, J.chest.y + 0.11 * k, 0.098), b: V(0, J.hips.y + 0.06, 0.105), ra: 0.006, rb: 0.006, bone: B.chest, part: 'placket', k: 0.006 });
      // breast pockets with flaps
      for (const sd of [-1, 1]) {
        S.add({ kind: 'ellipsoid', c: V(sd * 0.075, J.chest.y + 0.04, 0.098), r: V(0.04, 0.045, 0.012), bone: B.chest, part: 'pocket', k: 0.006 });
        S.add({ kind: 'ellipsoid', c: V(sd * 0.075, J.chest.y + 0.085, 0.105), r: V(0.042, 0.012, 0.01), bone: B.chest, part: 'flap', k: 0.004 });
      }
      // short sleeves: hem ring
      for (let i = 0; i < 2; i++) {
        const hem = J.sh[i].clone().lerp(J.el[i], 0.55);
        S.add({ kind: 'capsule', a: J.sh[i].clone().lerp(J.el[i], 0.45), b: hem, ra: 0.05 * 0.82, rb: 0.049 * 0.82, bone: B.up[i], part: 'sleeve', k: 0.006 });
        // shoulder patch (left sleeve)
        if (i === 0) S.add({ kind: 'ellipsoid', c: J.sh[i].clone().lerp(J.el[i], 0.22).add(V(-0.034, 0, 0.006)), r: V(0.006, 0.028, 0.024), bone: B.up[i], part: 'patch', k: 0.004 });
      }
      // belt
      S.add({ kind: 'ellipsoid', c: V(0, J.hips.y + 0.085, 0.005), r: V(0.175, 0.022, 0.12), bone: B.hips, part: 'belt', k: 0.006 });
      S.add({ kind: 'ellipsoid', c: V(0, J.hips.y + 0.085, 0.12), r: V(0.022, 0.017, 0.008), bone: B.hips, part: 'buckle', k: 0.003 });
      // satchel strap: right shoulder -> left hip, across the chest
      const a = V(0.13, J.chest.y + 0.13, -0.02);
      const b = V(0.02, J.chest.y + 0.0, 0.096);
      const c2 = V(-0.12, J.hips.y + 0.04, 0.07);
      S.add({ kind: 'capsule', a, b, ra: 0.0085, rb: 0.0085, bone: B.chest, part: 'strap', k: 0.006 });
      S.add({ kind: 'capsule', a: b, b: c2, ra: 0.0085, rb: 0.0085, bone: B.spine, part: 'strap', k: 0.006 });
      S.add({ kind: 'capsule', a: V(0.13, J.chest.y + 0.13, -0.02), b: V(0.06, J.chest.y + 0.0, -0.1), ra: 0.011, rb: 0.011, bone: B.chest, part: 'strap', k: 0.005 });
      // trouser crease + side stripe ridge, cuffs
      for (let i = 0; i < 2; i++) {
        S.add({ kind: 'capsule', a: J.kn[i].clone().add(V(0, 0, 0.05)), b: J.an[i].clone().add(V(0, 0.06, 0.04)), ra: 0.004, rb: 0.004, bone: B.sh[i], part: 'pants', k: 0.008 });
        // black work shoes
        const toe = J.toe[i];
        S.add({ kind: 'ellipsoid', c: V(toe.x, 0.045, (J.an[i].z + toe.z) / 2 + 0.01), r: V(0.047, 0.045, 0.13), bone: B.ft[i], part: 'shoe', k: 0.02 });
        S.add({ kind: 'ellipsoid', c: V(toe.x, 0.014, (J.an[i].z + toe.z) / 2 + 0.01), r: V(0.052, 0.014, 0.14), bone: B.ft[i], part: 'sole', k: 0.006 });
        S.add({ kind: 'capsule', a: J.an[i].clone().add(V(0, 0.03, 0)), b: J.an[i].clone().add(V(0, 0.09, 0)), ra: 0.043, rb: 0.042, bone: B.ft[i], part: 'sock', k: 0.01 });
      }
    },
    paint(part, p, J) {
      const shirt = C('#a9bfd3');
      const navy = C('#1f2a44');
      switch (part) {
        case 'sleeve': {
          const i = p.x < 0 ? 0 : 1;
          const t = (J.sh[i].y - p.y) / (J.sh[i].y - J.el[i].y);
          if (t > 0.57) {
            const c = C('#e7d9cf').multiplyScalar(0.95 + fbm(p.x * 40, p.y * 40, p.z * 40) * 0.08);
            if (vnoise(p.x * 160, p.y * 160, p.z * 160) > 0.82) c.lerp(C('#a98262'), 0.45);
            return { color: c, pat: 5 };
          }
        }
        // falls through
        case 'shirt':
        case 'collar':
        case 'pocket':
        case 'flap':
        case 'placket': {
          let c = shirt.clone();
          // sweat-yellowed collar and armpits; a grey cast
          if (part === 'collar') c.lerp(C('#c9c09a'), 0.25);
          const pit = Math.min(...[0, 1].map((i) => Math.hypot(p.x - J.sh[i].x * 0.85, p.y - (J.sh[i].y - 0.1), p.z - J.sh[i].z)));
          c.lerp(C('#b9b58e'), ss(0.06, 0.0, pit) * 0.5);
          if (part === 'placket' && Math.abs(((p.y * 100) % 9) - 4.5) < 0.6) c = C('#e8e4da'); // buttons
          return { color: c, pat: 1 };
        }
        case 'patch': {
          // a sleeve patch: navy field with a white envelope
          const c = navy.clone();
          if (Math.abs(p.y - (J.sh[0].y - 0.065)) < 0.008 && Math.abs(p.z - J.sh[0].z) < 0.015) c.set('#e9e6dc');
          return { color: c, pat: 0 };
        }
        case 'pants': {
          const c = navy.clone();
          // black side stripe down the outer seam
          const out = Math.abs(p.x) > J.hp[1].x + 0.05 && p.y < J.hips.y;
          if (out) c.set('#0e1220');
          return { color: c.multiplyScalar(0.95 + fbm(p.x * 20, p.y * 20, p.z * 20) * 0.1), pat: 4 };
        }
        case 'belt':
          return { color: C('#141210'), pat: 7 };
        case 'buckle':
          return { color: C('#9a8f78'), pat: 0 };
        case 'strap':
          return { color: C('#2b211a'), pat: 7 };
        case 'shoe':
          return { color: C('#151413'), pat: 7 };
        case 'sole':
          return { color: C('#0b0b0b'), pat: 0 };
        case 'sock':
          return { color: C('#1a1c2a'), pat: 8 };
        case 'skin':
        case 'arm': {
          // pale, thin arms with liver spots and a few dark hairs
          const c = C('#e7d9cf').multiplyScalar(0.95 + fbm(p.x * 40, p.y * 40, p.z * 40) * 0.08);
          if (vnoise(p.x * 160, p.y * 160, p.z * 160) > 0.82) c.lerp(C('#a98262'), 0.45);
          return { color: c, pat: 5 };
        }
      }
      return { color: shirt, pat: 1 };
    },
  };
  const P = new Person(spec);
  addPeteGear(P);
  return P;
}

/** Pete's mail-carrier sun helmet, and the mail satchel. */
function addPeteGear(P: Person) {
  const metal = new THREE.MeshStandardMaterial({ color: '#a29c8c', roughness: 0.3, metalness: 0.85 });
  // --- the classic letter-carrier sun helmet: a pale grey-blue dome, a wide sloping brim, a dark band,
  // a vent button on top and a little oval badge on the front
  const helmet = new THREE.Group();
  const shell = new THREE.MeshStandardMaterial({ color: '#b3bac0', roughness: 0.7 });
  const domeG = new THREE.SphereGeometry(1, 40, 18, 0, Math.PI * 2, 0, Math.PI / 2);
  domeG.scale(0.095, 0.092, 0.112);
  const dome = new THREE.Mesh(domeG, shell);
  helmet.add(dome);
  // brim: a lathe profile sloping down and out, longer front and back like a real pith helmet
  const prof: THREE.Vector2[] = [];
  for (let i = 0; i <= 8; i++) {
    const u = i / 8;
    prof.push(new THREE.Vector2(0.094 + u * 0.06, -u * u * 0.03));
  }
  for (let i = 8; i >= 0; i--) {
    const u = i / 8;
    prof.push(new THREE.Vector2(0.094 + u * 0.06, -u * u * 0.03 - 0.005));
  }
  const brimG = new THREE.LatheGeometry(prof, 48);
  brimG.scale(1, 1, 1.22);
  const brim = new THREE.Mesh(brimG, new THREE.MeshStandardMaterial({ color: '#a9b0b6', roughness: 0.75, side: THREE.DoubleSide }));
  helmet.add(brim);
  const bandG = new THREE.CylinderGeometry(0.097, 0.097, 0.018, 40, 1, true);
  bandG.scale(1, 1, 1.18);
  const band = new THREE.Mesh(bandG, new THREE.MeshStandardMaterial({ color: '#2b3142', roughness: 0.6, side: THREE.DoubleSide }));
  band.position.y = 0.012;
  helmet.add(band);
  const button = new THREE.Mesh(new THREE.SphereGeometry(0.012, 12, 8), shell);
  button.scale.y = 0.5;
  button.position.y = 0.091;
  helmet.add(button);
  const badge = new THREE.Mesh(new THREE.CircleGeometry(0.013, 20), metal);
  badge.scale.set(1.3, 1, 1);
  badge.position.set(0, 0.04, 0.106);
  badge.rotation.x = -0.35;
  helmet.add(badge);
  helmet.position.set(0, 0.148, -0.006);
  helmet.rotation.x = -0.06;
  helmet.traverse((o) => ((o as THREE.Mesh).castShadow = true));
  P.head.add(helmet);

  // --- satchel on the left hip (rides with the hips)
  const bagMat = new THREE.MeshStandardMaterial({ color: '#2a2622', roughness: 0.75 });
  const bag = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.27, 0.34, 2, 4, 4), bagMat);
  {
    const p = body.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) * (1 - Math.abs(p.getY(i)) * 1.2) + (Math.random() - 0.5) * 0.002);
    body.geometry.computeVertexNormals();
  }
  bag.add(body);
  const flap = new THREE.Mesh(new THREE.BoxGeometry(0.082, 0.14, 0.345), bagMat);
  flap.position.set(0.006, 0.07, 0);
  bag.add(flap);
  const clasp = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.03, 0.04), metal);
  clasp.position.set(0.048, 0.01, 0);
  bag.add(clasp);
  // letters poking out
  const env = new THREE.MeshStandardMaterial({ color: '#efe9da', roughness: 0.9 });
  for (let i = 0; i < 4; i++) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.08, 0.15), env);
    l.position.set(-0.012 + i * 0.006, 0.14, -0.06 + i * 0.03);
    l.rotation.x = (i - 1.5) * 0.08;
    bag.add(l);
  }
  bag.position.set(-0.165, -0.03, 0.04);
  bag.rotation.set(0, 0, 0.06);
  P.hips.add(bag);
}

/** The sketchy back neighbour: lanky, sunburnt, mullet under a backwards cap, scraggly beard, bad teeth,
 * stained tank top, camo cargo shorts, socks with flip-flops, prison-style arm tattoos, gold chain,
 * a beer can in one hand and a cigarette in the other. */
export function makeBackNeighbor(): Person {
  const tan = '#d9a383';
  const spec: PersonSpec = {
    name: 'neighbor',
    height: 1.83,
    shoulder: 0.19,
    hipW: 0.088,
    chestD: 0.1,
    belly: 0.4,
    limb: 0.9,
    hunch: 0.14,
    nails: '#b9a07a',
    handPose: ['can', 'pinch'],
    face: {
      skin: tan,
      age: 0.55,
      gaunt: 0.9,
      jawW: 1.0,
      noseLen: 1.1,
      noseW: 1.15,
      brow: 1.25,
      earSize: 1.05,
      eye: { iris: '#5d6a4a', open: 0.72, size: 0.95 },
      hair: 'mullet',
      hairColor: '#5b4632',
      beard: 'scraggly',
      beardColor: '#4a3a2a',
      teeth: 'bad',
    },
    clothes(S, J, B) {
      const k = J.H / 1.75;
      // tank top: deep arm holes and scooped neck (carve the shirt there so skin shows), straps over the shoulders
      // shorts: cargo pockets on the thighs, ragged hem above the knee
      for (let i = 0; i < 2; i++) {
        const mid = J.hp[i].clone().lerp(J.kn[i], 0.5);
        S.add({ kind: 'ellipsoid', c: mid.clone().add(V((i === 0 ? -1 : 1) * 0.06, 0, 0.0)), r: V(0.02, 0.07, 0.055), bone: B.th[i], part: 'pocket', k: 0.008 });
        S.add({ kind: 'capsule', a: J.hp[i].clone().lerp(J.kn[i], 0.7), b: J.hp[i].clone().lerp(J.kn[i], 0.76), ra: 0.06, rb: 0.058, bone: B.th[i], part: 'shorts', k: 0.006 });
        // tube socks + flip-flops
        S.add({ kind: 'capsule', a: J.an[i].clone().add(V(0, -0.01, 0)), b: J.an[i].clone().add(V(0, 0.2, 0.004)), ra: 0.041, rb: 0.04, bone: B.ft[i], part: 'sock', k: 0.012 });
        const toe = J.toe[i];
        S.add({ kind: 'ellipsoid', c: V(toe.x, 0.04, (J.an[i].z + toe.z) / 2 + 0.005), r: V(0.044, 0.035, 0.12), bone: B.ft[i], part: 'sock', k: 0.02 });
        S.add({ kind: 'ellipsoid', c: V(toe.x, 0.008, (J.an[i].z + toe.z) / 2 + 0.01), r: V(0.05, 0.008, 0.14), bone: B.ft[i], part: 'sole', k: 0.003 });
      }
      // beer gut hanging over the waistband
      S.add({ kind: 'ellipsoid', c: V(0, J.hips.y + 0.09, 0.05), r: V(0.12, 0.1, 0.075), bone: B.spine, part: 'shirt', k: 0.05 });
      // gold chain
      for (let a = -1.2; a <= 1.2; a += 0.12) S.add({ kind: 'ellipsoid', c: V(Math.sin(a) * 0.07, J.chest.y + 0.125 - Math.cos(a) * 0.03, Math.cos(a) * 0.08 - 0.005), r: V(0.006, 0.004, 0.004), bone: B.chest, part: 'chain', k: 0.002 });
      void k;
    },
    paint(part, p, J) {
      const skin = C(tan);
      const tank = C('#e4ddcc');
      const k = J.H / 1.75;
      // the tank top only covers the trunk below the collarbones; the arms and shoulders are bare skin
      const isTorso = part === 'shirt';
      if (isTorso) {
        const neckLine = J.chest.y + 0.07 * k - (Math.abs(p.x) < 0.07 ? (0.07 - Math.abs(p.x)) * 0.9 : 0);
        const armHole = Math.abs(p.x) > 0.105 && p.y > J.chest.y - 0.11;
        const strap = Math.abs(Math.abs(p.x) - 0.085) < 0.022 && p.y > neckLine;
        if ((p.y > neckLine && !strap) || armHole) return skinPaint(skin, p, true, J);
        return { color: tank.clone(), pat: 9 };
      }
      switch (part) {
        case 'pants':
        case 'shorts':
        case 'pocket': {
          if (p.y < J.kn[0].y + 0.08 * k && part !== 'pocket' && part !== 'shorts') return skinPaint(skin, p, false, J); // bare shins
          return { color: C('#6b6a45'), pat: 3 };
        }
        case 'sock':
          return p.y < 0.05 ? { color: C('#d9d4c8').multiplyScalar(0.8), pat: 8 } : { color: C('#e6e1d6').lerp(C('#b9a98a'), ss(0.06, 0.0, p.y) * 0.8), pat: 8 };
        case 'sole':
          return { color: C('#1d3b6a'), pat: 0 };
        case 'chain':
          return { color: C('#c99a3a'), pat: 0 };
        case 'sleeve':
        case 'arm':
        case 'skin':
          return skinPaint(skin, p, part !== 'skin', J);
      }
      return { color: tank, pat: 9 };
    },
  };
  const P = new Person(spec);
  addNeighborGear(P);
  return P;
}

function skinPaint(skin: THREE.Color, p: THREE.Vector3, arm: boolean, J: Joints): Paint {
  void ss;
  const c = skin.clone().multiplyScalar(0.94 + fbm(p.x * 40, p.y * 40, p.z * 40) * 0.1);
  // sunburnt neck/shoulders, farmer's tan
  if (p.y > J.chest.y + 0.05) c.lerp(C('#c4705a'), 0.25);
  if (arm) return { color: c, pat: 10 };
  return { color: c, pat: 5 };
}

function addNeighborGear(P: Person) {
  // backwards trucker cap: faded red crown with mesh back, bill pointing back
  const cap = new THREE.Group();
  const crownG = new THREE.SphereGeometry(0.09, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.5);
  crownG.scale(1.05, 1.05, 1.15);
  const capMat = new THREE.MeshStandardMaterial({ color: '#8c3b33', roughness: 0.9 });
  const crown = new THREE.Mesh(crownG, capMat);
  crown.position.set(0, 0.126, -0.014);
  crown.rotation.x = 0.12; // worn backwards, tipped up at the forehead
  cap.add(crown);
  const billG = new THREE.CylinderGeometry(0.075, 0.075, 0.006, 24, 1, false, 0, Math.PI);
  billG.scale(1, 1, 0.9);
  const bill = new THREE.Mesh(billG, new THREE.MeshStandardMaterial({ color: '#6e2c26', roughness: 0.9 }));
  bill.position.set(0, 0.11, -0.105);
  bill.rotation.set(0.32, Math.PI / 2, 0);
  cap.add(bill);
  P.head.add(cap);

  // beer can in the left hand
  const can = new THREE.Group();
  const canBody = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.122, 24), new THREE.MeshPhysicalMaterial({ map: canTex(), roughness: 0.3, metalness: 0.6, clearcoat: 0.6 }));
  can.add(canBody);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.027, 0.033, 0.01, 24), new THREE.MeshStandardMaterial({ color: '#b7b7b7', metalness: 0.9, roughness: 0.3 }));
  top.position.y = 0.065;
  can.add(top);
  can.position.set(0.028, -0.07, 0.01);
  P.hand[0].add(can);

  // cigarette pinched in the right hand, with a glowing tip and a thread of smoke
  const cig = new THREE.Group();
  const paper = new THREE.Mesh(new THREE.CylinderGeometry(0.0042, 0.0042, 0.065, 8), new THREE.MeshStandardMaterial({ color: '#eee', roughness: 0.8 }));
  paper.rotation.z = Math.PI / 2;
  cig.add(paper);
  const filter = new THREE.Mesh(new THREE.CylinderGeometry(0.0043, 0.0043, 0.022, 8), new THREE.MeshStandardMaterial({ color: '#c88a4a', roughness: 0.8 }));
  filter.rotation.z = Math.PI / 2;
  filter.position.x = 0.04;
  cig.add(filter);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.005, 8, 6), new THREE.MeshBasicMaterial({ color: '#ff5a1a', toneMapped: false }));
  tip.position.x = -0.034;
  cig.add(tip);
  cig.position.set(-0.012, -0.098, 0.03);
  cig.rotation.set(0, 0.3, -0.6);
  P.hand[1].add(cig);
}

function canTex() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#d8dde2';
  g.fillRect(0, 0, 128, 64);
  g.fillStyle = '#2a4f9a';
  g.fillRect(0, 18, 128, 26);
  g.fillStyle = '#c8262c';
  g.fillRect(0, 26, 128, 4);
  g.fillStyle = '#fff';
  g.font = 'bold 13px sans-serif';
  g.fillText('LIGHT', 40, 40);
  // dents
  g.fillStyle = 'rgba(0,0,0,0.15)';
  g.fillRect(70, 8, 10, 50);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
