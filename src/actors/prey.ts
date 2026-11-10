// Small wildlife models: mouse, chipmunk, bird (cardinal / wren), squirrel, and a big king cobra.
import * as THREE from 'three';
import { fbm, furMaterial, paint, type Part } from './rig';
import type { PreyKind } from '../config';

export type PreyPose = 'idle' | 'walk' | 'run' | 'peck' | 'sitUp' | 'fly' | 'carried' | 'look' | 'perch';

const C = (h: string) => new THREE.Color(h);
const out = new THREE.Color();

function ell(rx: number, ry: number, rz: number, seg = 14) {
  const g = new THREE.SphereGeometry(1, seg, Math.max(8, seg - 4));
  g.scale(rx, ry, rz);
  return g;
}

export class PreyModel {
  root = new THREE.Group(); // ground position, rotation.y heading
  body = new THREE.Group();
  head = new THREE.Group();
  legs: THREE.Object3D[] = [];
  tail: THREE.Object3D[] = [];
  wings: THREE.Object3D[] = [];
  pose: PreyPose = 'idle';
  speed = 0;
  private t = Math.random() * 10;
  private peckT = 0;
  private lookT = 0;
  variant = 0;
  height = 0.05; // body centre height

  constructor(public kind: PreyKind, variant = 0) {
    this.variant = variant;
    this.root.add(this.body);
    if (kind === 'mouse') this.buildMouse();
    else if (kind === 'chipmunk') this.buildChipmunk();
    else if (kind === 'bird') this.buildBird();
    else if (kind === 'snake') this.buildSnake();
    else this.buildSquirrel();
    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
      }
    });
  }

  private eyes(r: number, x: number, y: number, z: number) {
    const m = new THREE.MeshPhysicalMaterial({ color: '#0a0806', roughness: 0.05, clearcoat: 1 });
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), m);
      e.position.set(s * x, y, z);
      this.head.add(e);
      const g = new THREE.Mesh(new THREE.SphereGeometry(r * 0.3, 4, 4), new THREE.MeshBasicMaterial({ color: '#fff' }));
      g.position.set(s * x + r * 0.3, y + r * 0.4, z + r * 0.7);
      this.head.add(g);
    }
  }

  private legSet(mat: THREE.Material, r: number, len: number, xs: number, zf: number, zh: number, y: number) {
    for (const [x, z] of [
      [-xs, zf],
      [xs, zf],
      [-xs, zh],
      [xs, zh],
    ]) {
      const pivot = new THREE.Group();
      pivot.position.set(x, y, z);
      const g = new THREE.CylinderGeometry(r, r * 0.8, len, 6);
      g.translate(0, -len / 2, 0);
      const m = new THREE.Mesh(g, mat);
      pivot.add(m);
      const foot = new THREE.Mesh(ell(r * 1.3, r * 0.6, r * 2), mat);
      foot.position.set(0, -len, r);
      pivot.add(foot);
      this.body.add(pivot);
      this.legs.push(pivot);
    }
  }

  private tailChain(n: number, segLen: number, r0: number, r1: number, mat: THREE.Material, puff = 0, colorize?: (i: number) => THREE.Material) {
    let parent: THREE.Object3D = this.body;
    for (let i = 0; i < n; i++) {
      const seg = new THREE.Group();
      parent.add(seg);
      if (i > 0) seg.position.y = segLen;
      const rr = r0 + ((r1 - r0) * i) / n;
      const g = new THREE.CylinderGeometry(rr * 0.85, rr, segLen * 1.05, 6);
      g.translate(0, segLen / 2, 0);
      seg.add(new THREE.Mesh(g, colorize ? colorize(i) : mat));
      if (puff > 0) {
        const pr = puff * (0.7 + 0.6 * Math.sin((i / n) * Math.PI * 0.9 + 0.3));
        const pm = new THREE.Mesh(ell(pr, pr * 1.1, pr * 0.9, 10), colorize ? colorize(i) : mat);
        pm.position.y = segLen * 0.5;
        seg.add(pm);
      }
      this.tail.push(seg);
      parent = seg;
    }
    return this.tail[0];
  }

  // ---------------------------------------------------------------- mouse
  private buildMouse() {
    this.height = 0.026;
    const fur = new THREE.MeshPhysicalMaterial({ color: '#8b7b6b', roughness: 0.85, sheen: 1, sheenColor: C('#c9b9a5'), sheenRoughness: 0.5 });
    const belly = new THREE.MeshStandardMaterial({ color: '#d8cbb8', roughness: 0.9 });
    const pink = new THREE.MeshStandardMaterial({ color: '#e1a5a0', roughness: 0.6 });
    this.body.position.y = this.height;
    this.body.add(new THREE.Mesh(ell(0.024, 0.022, 0.042), fur));
    const b = new THREE.Mesh(ell(0.02, 0.012, 0.034), belly);
    b.position.y = -0.01;
    this.body.add(b);
    this.head.position.set(0, 0.008, 0.042);
    this.body.add(this.head);
    const hg = ell(0.017, 0.015, 0.024);
    hg.translate(0, 0, 0.008);
    this.head.add(new THREE.Mesh(hg, fur));
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.004, 6, 4), pink);
    nose.position.set(0, -0.002, 0.034);
    this.head.add(nose);
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(ell(0.011, 0.012, 0.003), pink);
      ear.position.set(s * 0.012, 0.016, 0.0);
      ear.rotation.y = s * 0.4;
      this.head.add(ear);
      const er = new THREE.Mesh(ell(0.013, 0.014, 0.002), fur);
      er.position.set(s * 0.012, 0.016, -0.002);
      er.rotation.y = s * 0.4;
      this.head.add(er);
    }
    this.eyes(0.0035, 0.009, 0.006, 0.02);
    this.whiskers(0.03, 0.0, 0.028);
    this.legSet(pink, 0.003, 0.016, 0.014, 0.025, -0.02, -0.008);
    const t = this.tailChain(6, 0.016, 0.0035, 0.0015, pink);
    t.position.set(0, 0.0, -0.04);
    t.rotation.x = -1.7;
  }

  // ---------------------------------------------------------------- chipmunk
  private buildChipmunk() {
    this.height = 0.035;
    const fn = (part: Part, p: THREE.Vector3) => {
      const brown = C('#a8673a');
      if (part === 'head') {
        if (Math.abs(p.x) > 0.008 && Math.abs(p.x) < 0.014 && p.y > -0.002) return out.copy(C('#f1e3c8'));
        return out.copy(p.y < -0.008 ? C('#efe0c6') : brown);
      }
      if (p.y < this.height - 0.012) return out.copy(C('#efe0c6'));
      const ax = Math.abs(p.x);
      // five dark stripes separated by pale ones along the back
      if (ax < 0.004) return out.copy(C('#2a1a12'));
      if (ax > 0.009 && ax < 0.013 && p.z < 0.035) return out.copy(C('#2a1a12'));
      if (ax > 0.013 && ax < 0.018 && p.z < 0.03) return out.copy(C('#f0e2c4'));
      if (ax > 0.018 && ax < 0.021 && p.z < 0.03) return out.copy(C('#3a2416'));
      return out.copy(p.z < -0.02 ? C('#b8783f') : C('#9b6d4c'));
    };
    const mat = furMaterial('#ffe0c0');
    this.body.position.y = this.height;
    const bg = ell(0.03, 0.028, 0.052, 18);
    paint(bg, 'torso', fn, new THREE.Matrix4().makeTranslation(0, this.height, 0));
    this.body.add(new THREE.Mesh(bg, mat));
    this.head.position.set(0, 0.014, 0.05);
    this.body.add(this.head);
    const hg = ell(0.022, 0.02, 0.026, 16);
    hg.translate(0, 0, 0.006);
    paint(hg, 'head', fn, new THREE.Matrix4());
    this.head.add(new THREE.Mesh(hg, mat));
    // cheek pouches
    const cheekMat = new THREE.MeshStandardMaterial({ color: '#c99a6c', roughness: 0.9 });
    for (const s of [-1, 1]) {
      const c = new THREE.Mesh(ell(0.011, 0.01, 0.012), cheekMat);
      c.position.set(s * 0.013, -0.006, 0.016);
      this.head.add(c);
      const ear = new THREE.Mesh(ell(0.007, 0.009, 0.003), new THREE.MeshStandardMaterial({ color: '#8a5a38' }));
      ear.position.set(s * 0.012, 0.019, -0.004);
      this.head.add(ear);
    }
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.004, 6, 4), new THREE.MeshStandardMaterial({ color: '#3a2a22' }));
    nose.position.set(0, 0, 0.033);
    this.head.add(nose);
    this.eyes(0.0045, 0.012, 0.007, 0.02);
    this.whiskers(0.03, 0.0, 0.03);
    this.legSet(new THREE.MeshStandardMaterial({ color: '#8f5c35' }), 0.004, 0.022, 0.018, 0.03, -0.025, -0.012);
    const tm = new THREE.MeshPhysicalMaterial({ color: '#7a5233', roughness: 0.9, sheen: 1, sheenColor: C('#d4a77a') });
    const t = this.tailChain(5, 0.018, 0.008, 0.006, tm, 0.009);
    t.position.set(0, 0.008, -0.048);
    t.rotation.x = -0.5;
  }

  // ---------------------------------------------------------------- bird (cardinal or Carolina wren)
  private buildBird() {
    const cardinal = this.variant % 2 === 0;
    this.height = 0.045;
    const bodyCol = cardinal ? '#c4231d' : '#8a5a33';
    const mat = new THREE.MeshPhysicalMaterial({ color: bodyCol, roughness: 0.7, sheen: 0.6, sheenColor: C(cardinal ? '#ff8a7a' : '#e0b88a') });
    const wingMat = new THREE.MeshStandardMaterial({ color: cardinal ? '#9b1914' : '#6b4426', roughness: 0.8 });
    const bellyMat = new THREE.MeshStandardMaterial({ color: cardinal ? '#d8463a' : '#d9b48a', roughness: 0.85 });
    this.body.position.y = this.height;
    this.body.rotation.x = -0.3;
    this.body.add(new THREE.Mesh(ell(0.024, 0.025, 0.04), mat));
    const belly = new THREE.Mesh(ell(0.02, 0.02, 0.03), bellyMat);
    belly.position.set(0, -0.008, 0.006);
    this.body.add(belly);
    this.head.position.set(0, 0.022, 0.032);
    this.body.add(this.head);
    this.head.add(new THREE.Mesh(ell(0.018, 0.018, 0.019), mat));
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.02, 8), new THREE.MeshStandardMaterial({ color: cardinal ? '#e8762a' : '#4a3a2a', roughness: 0.4 }));
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, -0.003, 0.025);
    this.head.add(beak);
    if (cardinal) {
      const crest = new THREE.Mesh(new THREE.ConeGeometry(0.009, 0.026, 6), mat);
      crest.position.set(0, 0.018, -0.006);
      crest.rotation.x = -0.6;
      this.head.add(crest);
      const mask = new THREE.Mesh(ell(0.014, 0.008, 0.006), new THREE.MeshStandardMaterial({ color: '#141010' }));
      mask.position.set(0, -0.002, 0.016);
      this.head.add(mask);
    } else {
      // wren eye-stripe
      for (const s of [-1, 1]) {
        const st = new THREE.Mesh(ell(0.002, 0.003, 0.012), new THREE.MeshStandardMaterial({ color: '#f2e6cc' }));
        st.position.set(s * 0.015, 0.006, 0.004);
        this.head.add(st);
      }
    }
    this.eyes(0.0035, 0.012, 0.004, 0.012);
    for (const s of [-1, 1]) {
      const w = new THREE.Group();
      w.position.set(s * 0.02, 0.008, 0.005);
      const wg = ell(0.006, 0.018, 0.032);
      wg.translate(s * 0.002, -0.006, -0.012);
      w.add(new THREE.Mesh(wg, wingMat));
      this.body.add(w);
      this.wings.push(w);
    }
    const tail = new THREE.Group();
    tail.position.set(0, 0.004, -0.035);
    const tg = new THREE.BoxGeometry(0.022, 0.004, 0.045);
    tg.translate(0, 0, -0.022);
    tail.add(new THREE.Mesh(tg, wingMat));
    tail.rotation.x = cardinal ? 0.15 : -0.6; // wrens cock their tails up
    this.body.add(tail);
    this.tail.push(tail);
    const legMat = new THREE.MeshStandardMaterial({ color: '#7a5a4a' });
    for (const s of [-1, 1]) {
      const l = new THREE.Group();
      l.position.set(s * 0.008, -0.02, 0.004);
      const lg = new THREE.CylinderGeometry(0.0015, 0.0015, 0.026, 4);
      lg.translate(0, -0.013, 0);
      l.add(new THREE.Mesh(lg, legMat));
      this.body.add(l);
      this.legs.push(l);
    }
  }

  // ---------------------------------------------------------------- squirrel
  private buildSquirrel() {
    this.height = 0.06;
    const fn = (part: Part, p: THREE.Vector3) => {
      const n = fbm(p.x * 40, p.y * 40, p.z * 40);
      const grey = C('#7c7a76').lerp(C('#8c6f55'), 0.25 + (n - 0.5) * 0.6);
      if (part === 'head') return out.copy(p.y < -0.01 ? C('#e9e3d8') : grey);
      if (p.y < this.height - 0.02) return out.copy(C('#ebe5da'));
      return out.copy(grey);
    };
    const mat = furMaterial('#e8e2d8');
    this.body.position.y = this.height;
    const bg = ell(0.042, 0.045, 0.085, 18);
    paint(bg, 'torso', fn, new THREE.Matrix4().makeTranslation(0, this.height, 0));
    this.body.add(new THREE.Mesh(bg, mat));
    this.head.position.set(0, 0.03, 0.08);
    this.body.add(this.head);
    const hg = ell(0.031, 0.03, 0.038, 16);
    hg.translate(0, 0, 0.01);
    paint(hg, 'head', fn, new THREE.Matrix4());
    this.head.add(new THREE.Mesh(hg, mat));
    const earMat = new THREE.MeshStandardMaterial({ color: '#6f6a66' });
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.009, 0.02, 6), earMat);
      ear.position.set(s * 0.016, 0.03, -0.004);
      ear.rotation.z = -s * 0.2;
      this.head.add(ear);
    }
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.006, 6, 4), new THREE.MeshStandardMaterial({ color: '#4a3c38' }));
    nose.position.set(0, 0.0, 0.05);
    this.head.add(nose);
    this.eyes(0.0065, 0.018, 0.01, 0.026);
    // eye rings
    for (const s of [-1, 1]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.008, 0.002, 5, 12), new THREE.MeshStandardMaterial({ color: '#e8e2d6' }));
      ring.position.set(s * 0.018, 0.01, 0.025);
      ring.rotation.y = s * 0.5;
      this.head.add(ring);
    }
    this.whiskers(0.04, 0.0, 0.046);
    this.legSet(new THREE.MeshStandardMaterial({ color: '#77736d' }), 0.007, 0.04, 0.028, 0.055, -0.045, -0.02);
    const tm = new THREE.MeshPhysicalMaterial({ color: '#7d7974', roughness: 0.95, sheen: 1, sheenColor: C('#f4efe6'), sheenRoughness: 0.4 });
    const t = this.tailChain(7, 0.035, 0.014, 0.012, tm, 0.03);
    t.position.set(0, 0.012, -0.08);
    t.rotation.x = -0.4;
  }

  // ---------------------------------------------------------------- snake (king cobra)
  /**
   * A big king cobra (~2.7 m). The body is one tube whose spine is recomputed every frame, so it can slither in
   * S-curves, rear up with the hood spread, or drape out of a pet's mouth. Root origin = the back of the head;
   * the head points +z and the body trails back along -z.
   */
  private snakeTube: THREE.Mesh | null = null;
  private snakeHead = new THREE.Group();
  private snakeHeadScale = 1.95;
  private jaw: THREE.Object3D | null = null;
  private hissT = 0;
  private tongue: THREE.Object3D | null = null;
  private tongueT = 0;
  private rear = 0; // 0 lying flat … 1 reared up, hood spread
  private hood = 0;
  private static RINGS = 96;
  private static SIDES = 18;
  static SNAKE_SCALE = 0.34;
  private static LEN = 2.4; // big for a backyard (~8 ft), but it still fits in the living room
  private spine: THREE.Vector3[] = [];

  private snakeRadius(u: number) {
    // u: 0 at the neck … 1 at the tail tip
    const k = 1.2; // a big, heavy-bodied snake
    if (u < 0.03) return (0.042 + u * 0.45) * k;
    if (u < 0.45) return (0.055 + Math.sin(((u - 0.03) / 0.42) * Math.PI * 0.5) * 0.015) * k;
    return (0.07 * Math.pow(1 - (u - 0.45) / 0.55, 0.85) + 0.004) * k;
  }

  private buildSnake() {
    this.height = 0.13; // markers float above a reared head
    // a small snake: the whole sculpt is built at king-cobra proportions, then scaled down (~1 m long)
    this.body.scale.setScalar(PreyModel.SNAKE_SCALE);
    const R = PreyModel.RINGS;
    const S = PreyModel.SIDES;
    const olive = C('#2c2b1a');
    const dark = C('#17150e');
    const band = C('#a99a52');
    const throat = C('#d9c98a');
    const belly = C('#b9ab76');
    const pos = new Float32Array((R + 1) * (S + 1) * 3);
    const col = new Float32Array((R + 1) * (S + 1) * 3);
    const idx: number[] = [];
    const c = new THREE.Color();
    for (let i = 0; i <= R; i++) {
      const u = i / R;
      const sAlong = u * PreyModel.LEN;
      for (let j = 0; j <= S; j++) {
        const a = (j / S) * Math.PI * 2;
        const up = Math.cos(a); // +1 spine, -1 belly
        const n = fbm(i * 0.9 + 3, j * 0.7, this.variant * 5.3);
        // olive body darkening to near-black toward the tail; thin pale chevron bands that fade on the rear half
        c.copy(olive).lerp(dark, Math.min(1, Math.max(0, (u - 0.25) * 1.6)) * 0.85);
        c.lerp(C('#4a4a2c'), (n - 0.5) * 0.6);
        const chev = ((sAlong + Math.abs(Math.sin(a)) * 0.06) / 0.16) % 1;
        if (u > 0.06 && chev < 0.12) c.lerp(band, Math.max(0, 0.75 - u) * 0.7);
        if (up < -0.35) {
          c.copy(u < 0.18 ? throat : belly).lerp(C('#8f8455'), u * 0.8 + n * 0.2);
          // dark crossbars across the hood's pale underside
          if (u > 0.025 && u < 0.24 && (sAlong / 0.075) % 1 < 0.28) c.lerp(C('#2b281a'), 0.75);
        }
        // overlapping-scale speckle
        if ((i * 7 + j * 3) % 5 === 0) c.multiplyScalar(0.86);
        const k = (i * (S + 1) + j) * 3;
        col[k] = c.r;
        col[k + 1] = c.g;
        col[k + 2] = c.b;
      }
    }
    for (let i = 0; i < R; i++)
      for (let j = 0; j < S; j++) {
        const a = i * (S + 1) + j;
        const b2 = a + S + 1;
        idx.push(a, a + 1, b2, b2, a + 1, b2 + 1); // outward-facing winding
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    // overlapping-scale texture: u around the body, v along it (about one scale row per 2.2 cm)
    const uvs = new Float32Array((R + 1) * (S + 1) * 2);
    for (let i = 0; i <= R; i++) for (let j = 0; j <= S; j++) {
      uvs[(i * (S + 1) + j) * 2] = (j / S) * 7;
      uvs[(i * (S + 1) + j) * 2 + 1] = ((i / R) * PreyModel.LEN) / 0.044;
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    g.setIndex(idx);
    const mat = new THREE.MeshPhysicalMaterial({ vertexColors: true, map: scaleTexture(), bumpMap: scaleTexture(), bumpScale: 1.2, roughness: 0.42, clearcoat: 0.55, clearcoatRoughness: 0.3 });
    const tube = new THREE.Mesh(g, mat);
    tube.frustumCulled = false;
    this.body.add(tube);
    this.snakeTube = tube;
    for (let i = 0; i <= R; i++) this.spine.push(new THREE.Vector3());

    // ---- head: broad, heavy-browed, with big plate scales
    const H = this.snakeHead;
    H.scale.setScalar(this.snakeHeadScale);
    this.body.add(H);
    const hm = new THREE.MeshPhysicalMaterial({ color: '#2f2e1c', roughness: 0.38, clearcoat: 0.7, clearcoatRoughness: 0.25 });
    const hg = new THREE.SphereGeometry(1, 20, 14);
    {
      const p = hg.attributes.position;
      for (let i = 0; i < p.count; i++) {
        let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const front = Math.max(0, z);
        x *= 0.043 * (1 - front * 0.32);
        y *= (y > 0 ? 0.03 : 0.024) * (1 - front * 0.25);
        z *= 0.072;
        p.setXYZ(i, x, y, z);
      }
      hg.computeVertexNormals();
    }
    hg.translate(0, 0.004, 0.05);
    H.add(new THREE.Mesh(hg, hm));
    // pale upper lip / chin scales
    const lip = new THREE.Mesh(ell(0.038, 0.012, 0.06), new THREE.MeshStandardMaterial({ color: '#cdbf86', roughness: 0.5 }));
    lip.position.set(0, -0.012, 0.055);
    H.add(lip);
    // big crown plates (two rows of darker shields on top of the head)
    const plate = new THREE.MeshStandardMaterial({ color: '#232214', roughness: 0.45 });
    for (const [x, z, w, l] of [
      [-0.016, 0.052, 0.016, 0.022], [0.016, 0.052, 0.016, 0.022], [-0.014, 0.078, 0.013, 0.018], [0.014, 0.078, 0.013, 0.018], [0, 0.03, 0.022, 0.03],
    ]) {
      const pl = new THREE.Mesh(ell(w, 0.004, l, 8), plate);
      pl.position.set(x, 0.031, z);
      H.add(pl);
    }
    // heavy brow ridges over small black eyes with a cold glint: a permanent scowl
    const eyeMat = new THREE.MeshPhysicalMaterial({ color: '#0b0a06', roughness: 0.05, clearcoat: 1 });
    const browMat = new THREE.MeshStandardMaterial({ color: '#2a2918', roughness: 0.5 });
    for (const sd of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.0072, 12, 10), eyeMat);
      e.position.set(sd * 0.034, 0.007, 0.07);
      H.add(e);
      const gl = new THREE.Mesh(new THREE.SphereGeometry(0.0022, 6, 4), new THREE.MeshBasicMaterial({ color: '#f4f0d8' }));
      gl.position.set(sd * 0.038, 0.01, 0.075);
      H.add(gl);
      const brow = new THREE.Mesh(ell(0.013, 0.005, 0.02, 10), browMat);
      brow.position.set(sd * 0.031, 0.015, 0.072);
      brow.rotation.set(0.25, 0, sd * -0.6);
      H.add(brow);
      // mouth line curving up into a smirk
      const ml = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.0015, 0.06), new THREE.MeshBasicMaterial({ color: '#0d0c08' }));
      ml.position.set(sd * 0.036, -0.006, 0.06);
      ml.rotation.y = sd * 0.18;
      H.add(ml);
    }
    // forked black tongue
    const tongue = new THREE.Group();
    const tm = new THREE.MeshStandardMaterial({ color: '#111012', roughness: 0.35 });
    const stem = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.0025, 0.045), tm);
    stem.position.z = 0.022;
    tongue.add(stem);
    for (const sd of [-1, 1]) {
      const fork = new THREE.Mesh(new THREE.BoxGeometry(0.0025, 0.002, 0.028), tm);
      fork.position.set(sd * 0.005, 0, 0.055);
      fork.rotation.y = sd * 0.35;
      tongue.add(fork);
    }
    // lower jaw: pink mouth lining and two hooked fangs, gapes open in a hiss when he rears up
    const jaw = new THREE.Group();
    jaw.position.set(0, -0.012, 0.005);
    const jm = new THREE.Mesh(ell(0.034, 0.008, 0.06, 12), new THREE.MeshStandardMaterial({ color: '#cdbf86', roughness: 0.5 }));
    jm.position.set(0, -0.006, 0.052);
    jaw.add(jm);
    const lining = new THREE.Mesh(ell(0.029, 0.004, 0.052, 12), new THREE.MeshStandardMaterial({ color: '#4a2430', roughness: 0.4 }));
    lining.position.set(0, -0.001, 0.05);
    jaw.add(lining);
    H.add(jaw);
    this.jaw = jaw;
    const roof = new THREE.Mesh(ell(0.03, 0.003, 0.05, 12), new THREE.MeshStandardMaterial({ color: '#3a1a24', roughness: 0.4 }));
    roof.position.set(0, -0.012, 0.055);
    H.add(roof);
    const fangMat = new THREE.MeshStandardMaterial({ color: '#f2ead2', roughness: 0.3 });
    for (const sd of [-1, 1]) {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.0035, 0.016, 6), fangMat);
      f.rotation.x = Math.PI - 0.25;
      f.position.set(sd * 0.012, -0.019, 0.098);
      H.add(f);
    }
    tongue.position.set(0, -0.008, 0.11);
    tongue.scale.z = 0.01;
    H.add(tongue);
    this.tongue = tongue;
  }

  /** Spine angle profile for the reared-up front: horizontal head, a near-vertical neck, curving back to the ground. */
  private static rearAngle(s: number, L: number) {
    if (s < 0.09) return -(s / 0.09) * 1.45;
    if (s < L - 0.32) return -1.45 + Math.sin(s * 3) * 0.06;
    if (s < L) return -1.45 * (1 - (s - (L - 0.32)) / 0.32);
    return 0;
  }

  private updateSnake(dt: number) {
    const t = this.t;
    const moving = this.pose === 'walk' || this.pose === 'run';
    const fast = this.pose === 'run';
    const carried = this.pose === 'carried';
    const wantRear = carried ? 0 : this.pose === 'sitUp' || this.pose === 'look' ? 1 : this.pose === 'idle' || this.pose === 'perch' ? 0.35 : moving ? 0.12 : 0.2;
    this.rear += (wantRear - this.rear) * Math.min(1, dt * (wantRear > this.rear ? 3.5 : 2));
    const wantHood = this.rear > 0.6 ? 1 : carried ? 0.55 : 0;
    this.hood += (wantHood - this.hood) * Math.min(1, dt * 4);
    // tongue flick
    this.tongueT -= dt;
    if (this.tongueT < -0.6 - Math.random() * 1.4) this.tongueT = 0.4;
    if (this.tongue) this.tongue.scale.z = this.tongueT > 0 ? Math.sin((this.tongueT / 0.4) * Math.PI) * (1 + Math.sin(t * 70) * 0.2) : 0.01;
    // hiss: when reared, the jaw drops open every couple of seconds
    this.hissT += dt;
    const hissCycle = (this.hissT % 2.6) / 2.6;
    const gape = this.rear > 0.6 && !carried ? Math.max(0, Math.sin(Math.min(1, hissCycle / 0.45) * Math.PI)) : carried ? 0.25 : 0;
    if (this.jaw) this.jaw.rotation.x = gape * 0.5;

    // ---- spine
    const R = PreyModel.RINGS;
    const L = PreyModel.LEN;
    const ds = L / R;
    const rearLen = 0.95 * this.rear; // length of the raised front
    const dropLen = carried ? 0.42 : 0;
    const amp = carried ? 0.16 : moving ? (fast ? 0.22 : 0.17) : 0.1;
    const freq = carried ? 5 : moving ? (fast ? 9 : 5.5) : 0.8;
    const k = 5.2; // waves per metre-ish
    let y = 0;
    let z = 0;
    const sp = this.spine;
    sp[0].set(0, 0, 0);
    for (let i = 1; i <= R; i++) {
      const s = i * ds;
      let ang = 0; // pitch of the spine going backward (negative = descending)
      if (rearLen > 0.05) ang = PreyModel.rearAngle(s, rearLen) * Math.min(1, this.rear * 1.2);
      if (carried) ang = s < dropLen ? -1.25 + s * 1.2 : Math.sin(t * 6 - s * 4) * 0.12;
      y += Math.sin(ang) * ds;
      z -= Math.cos(ang) * ds;
      sp[i].set(0, y, z);
    }
    // put the lowest (back) part on the ground: shift so the tail rests at y=0
    const yGround = carried ? sp[R].y : Math.min(...sp.map((v) => v.y));
    for (let i = 0; i <= R; i++) {
      const s = i * ds;
      const onGround = carried ? s > dropLen : s > rearLen;
      const ramp = Math.min(1, Math.max(0, (s - (onGround ? (carried ? dropLen : rearLen) : 1e9)) / 0.5));
      sp[i].y -= yGround;
      sp[i].x = Math.sin(t * freq - s * k) * amp * (carried ? Math.min(1, s / 0.5) : ramp) + (carried ? 0 : Math.sin(s * 1.3 + this.variant) * 0.05 * ramp);
    }
    // ---- rebuild the tube around the spine
    const g = this.snakeTube!.geometry as THREE.BufferGeometry;
    const P = g.attributes.position as THREE.BufferAttribute;
    const S = PreyModel.SIDES;
    const tan = new THREE.Vector3();
    const side = new THREE.Vector3();
    const upv = new THREE.Vector3();
    const Y = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i <= R; i++) {
      const u = i / R;
      const a0 = sp[Math.max(0, i - 1)];
      const a1 = sp[Math.min(R, i + 1)];
      tan.subVectors(a0, a1).normalize(); // points toward the head
      side.crossVectors(Y, tan);
      if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
      side.normalize();
      upv.crossVectors(tan, side).normalize();
      const r = this.snakeRadius(u);
      // the hood: ribs flare the neck sideways into a broad flat shield just behind the head
      const hu = u * L;
      // king cobras have a long, fairly narrow hood: it starts right behind the head and tapers over ~0.55 m
      const hoodBump = hu > 0.03 && hu < 0.6 ? Math.pow(Math.sin(((hu - 0.03) / 0.57) * Math.PI), 0.7) * (hu < 0.2 ? 1 : 1 - (hu - 0.2) * 0.9) : 0;
      const wide = 1.15 + this.hood * hoodBump * 1.45;
      const flat = 0.85 - this.hood * hoodBump * 0.45;
      for (let j = 0; j <= S; j++) {
        const a = (j / S) * Math.PI * 2;
        const cy = Math.cos(a) * r * flat;
        const cx = Math.sin(a) * r * wide;
        const v = (i * (S + 1) + j);
        P.setXYZ(v, sp[i].x + side.x * cx + upv.x * cy, sp[i].y + side.y * cx + upv.y * cy + r * 0.85, sp[i].z + side.z * cx + upv.z * cy);
      }
    }
    P.needsUpdate = true;
    g.computeVertexNormals();
    g.computeBoundingSphere();
    // ---- head rides the front of the spine
    const front = sp[0];
    const next = sp[2];
    const H = this.snakeHead;
    H.position.set(front.x, front.y + this.snakeRadius(0) * 0.85, front.z);
    const pitch = Math.atan2(front.y - next.y, front.z - next.z);
    H.rotation.set(-pitch * 0.6 + (this.rear > 0.5 ? 0.18 : 0) + (carried ? 0.25 : 0), Math.atan2(front.x - next.x, front.z - next.z) * 0.8 + (this.pose === 'look' ? Math.sin(t * 2.1) * 0.25 : 0), 0);
    this.body.position.y = 0;
    this.body.rotation.set(0, 0, 0);
  }

  private whiskers(len: number, y: number, z: number) {
    const pts: number[] = [];
    for (const s of [-1, 1])
      for (let i = 0; i < 3; i++) {
        pts.push(s * 0.006, y + (i - 1) * 0.002, z, s * len, y + (i - 1) * 0.006, z - 0.004);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.head.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#e8e8e8', transparent: true, opacity: 0.6 })));
  }

  update(dt: number) {
    this.t += dt;
    if (this.kind === 'snake') return this.updateSnake(dt);
    const t = this.t;
    const k = this.kind;
    const moving = this.pose === 'walk' || this.pose === 'run';
    const freq = this.pose === 'run' ? 14 : 8;
    // legs
    for (let i = 0; i < this.legs.length; i++) {
      const l = this.legs[i];
      if (k === 'bird') {
        l.rotation.x = this.pose === 'fly' ? 0.9 : 0;
        continue;
      }
      if (this.pose === 'carried') {
        l.rotation.x = Math.sin(t * 22 + i * 1.7) * 0.7; // gentle wriggle
      } else if (moving) {
        const bound = k === 'squirrel' || k === 'chipmunk';
        const ph = bound ? (i < 2 ? 0 : Math.PI) : i === 0 || i === 3 ? 0 : Math.PI;
        l.rotation.x = Math.sin(t * freq + ph) * 0.8;
      } else l.rotation.x *= 0.8;
    }
    // body motion
    const h = this.height;
    let by = h;
    let pitch = k === 'bird' ? -0.3 : 0;
    if (moving && k !== 'bird') {
      const bound = k === 'squirrel' || k === 'chipmunk';
      by += Math.abs(Math.sin(t * freq * (bound ? 1 : 2))) * (bound ? h * 0.5 : h * 0.12);
      if (bound) pitch += Math.sin(t * freq) * 0.2;
    }
    if (k === 'bird') {
      if (this.pose === 'walk' || this.pose === 'run') by += Math.abs(Math.sin(t * 10)) * 0.03; // hop
      if (this.pose === 'fly') by += 0;
    }
    if (this.pose === 'sitUp' && k !== 'bird') {
      pitch = -1.1;
      by = h * 1.6;
    }
    if (this.pose === 'carried') {
      pitch = 0.2 + Math.sin(t * 9) * 0.15;
      by = 0;
    }
    this.body.position.y = by;
    this.body.rotation.x += (pitch - this.body.rotation.x) * Math.min(1, dt * 12);
    this.body.rotation.z = this.pose === 'carried' ? Math.sin(t * 7) * 0.3 : 0;

    // head: pecking, looking around
    this.peckT -= dt;
    this.lookT -= dt;
    if (this.pose === 'peck' || (this.pose === 'idle' && k === 'bird')) {
      if (this.peckT < -0.6 - Math.random()) this.peckT = 0.25;
      this.head.rotation.x = this.peckT > 0 ? 0.9 : 0;
    } else if (this.pose === 'look' || this.pose === 'idle' || this.pose === 'sitUp' || this.pose === 'perch') {
      if (this.lookT < 0) this.lookT = 0.6 + Math.random() * 1.4;
      const target = Math.sin(Math.floor(t / 0.8) * 12.9) * 0.8;
      this.head.rotation.y += (target - this.head.rotation.y) * Math.min(1, dt * 10);
      this.head.rotation.x *= 0.9;
    } else {
      this.head.rotation.x *= 0.85;
      this.head.rotation.y *= 0.85;
    }
    // wings
    for (let i = 0; i < this.wings.length; i++) {
      const w = this.wings[i];
      const s = i === 0 ? -1 : 1;
      if (this.pose === 'fly' || this.pose === 'carried') w.rotation.z = s * (0.4 + Math.sin(t * 40) * 1.1);
      else w.rotation.z *= 0.8;
    }
    // tails
    for (let i = 0; i < this.tail.length; i++) {
      const seg = this.tail[i];
      if (k === 'bird') {
        seg.rotation.y = Math.sin(t * 3) * 0.1;
        continue;
      }
      if (k === 'squirrel') {
        // bushy S-curve held high, flicking when alert
        const base = this.pose === 'run' ? -0.15 : -0.1;
        seg.rotation.x = i === 0 ? (this.pose === 'run' ? -1.25 : -0.35) : base + 0.32 + Math.sin(t * 6 - i) * 0.08;
        if (this.pose === 'carried') seg.rotation.x = i === 0 ? -0.8 : 0.25 + Math.sin(t * 10 - i) * 0.25;
      } else if (k === 'chipmunk') {
        seg.rotation.x = i === 0 ? (moving ? -0.3 : -0.55) : 0.15 + Math.sin(t * 5 - i) * 0.05;
      } else {
        seg.rotation.z = Math.sin(t * 4 - i * 0.7) * 0.25;
        seg.rotation.x = i === 0 ? -1.62 : 0.06;
      }
    }
  }
}

let scaleTexCache: THREE.CanvasTexture | null = null;
/** Keeled, overlapping snake scales (greyscale; tinted by the vertex colours). */
function scaleTexture() {
  if (scaleTexCache) return scaleTexCache;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#9a9a9a';
  g.fillRect(0, 0, 64, 64);
  for (let row = -1; row < 5; row++)
    for (let col = -1; col < 5; col++) {
      const x = col * 16 + (row % 2 ? 8 : 0);
      const y = row * 16;
      const gr = g.createLinearGradient(x, y, x, y + 18);
      gr.addColorStop(0, '#5a5a5a');
      gr.addColorStop(0.55, '#d8d8d8');
      gr.addColorStop(1, '#ffffff');
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + 9, y + 3, x + 8, y + 18);
      g.quadraticCurveTo(x, y + 21, x - 8, y + 18);
      g.quadraticCurveTo(x - 9, y + 3, x, y);
      g.fill();
      g.strokeStyle = 'rgba(30,30,30,0.6)';
      g.lineWidth = 1;
      g.stroke();
      // keel ridge
      g.strokeStyle = 'rgba(255,255,255,0.35)';
      g.beginPath();
      g.moveTo(x, y + 3);
      g.lineTo(x, y + 15);
      g.stroke();
    }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  scaleTexCache = t;
  return t;
}
