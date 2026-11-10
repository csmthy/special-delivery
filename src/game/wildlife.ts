import * as THREE from 'three';
import { PreyModel } from '../actors/prey';
import { DELIVERED, POPULATION, PREY_WORLD, type PreyKind } from '../config';
import { mulberry32, type Ledger, type Rng } from '../rules';
import { resolve } from './physics';
import { BASKET, FLOOR, GARDEN, LOT, OAK, SHED, STAIR_FOOT, groundHeight, insideHouse, inRect, DECK, ROOMS } from '../world/layout';
import type { Interior } from '../world/furniture';
import type { Audio } from '../audio';

export type PreyState = 'idle' | 'walk' | 'flee' | 'fly' | 'climb' | 'pounced' | 'carried' | 'leaving' | 'gone';

export interface WildPrey {
  id: number; // ledger present id
  kind: PreyKind;
  model: PreyModel;
  x: number;
  z: number;
  y: number;
  heading: number;
  state: PreyState;
  alert: number;
  timer: number;
  tx: number;
  tz: number;
  sleepy: boolean;
  fly?: { fx: number; fz: number; fy: number; tx: number; tz: number; ty: number; t: number; dur: number };
  climb?: { x: number; z: number; r: number; up: number; t: number };
  marker: THREE.Sprite;
  skittish: number;
}

export interface Stick {
  id: number;
  mesh: THREE.Group;
  x: number;
  z: number;
  state: 'ground' | 'carried' | 'delivered';
}

interface Delivered {
  kind: PreyKind;
  model: PreyModel;
  x: number;
  y: number;
  z: number;
  heading: number;
  state: 'basket' | 'hop' | 'roam' | 'idle' | 'flyTo' | 'perch';
  t: number;
  tx: number;
  ty: number;
  tz: number;
  fx: number;
  fy: number;
  fz: number;
  dur: number;
}

// Plausible, reachable backyard spots (lawn, garden edges, shrubs, tree base, shed, fence lines).
// Yard: x -4.4..12.2 (wood fence left, chain-link right), z from the house (-7.6) back to -19; the shed occupies
// x 9.3..13.3, z -8.8..-15.2; the garden bed runs x 0.4..8.4 around z -12.6; the oak is at (-2.3, -12.4).
const SPOTS: Record<PreyKind, [number, number][]> = {
  mouse: [
    [-1.6, -10.2], [1.2, -11.2], [7.8, -11.3], [8.6, -13.6], [-2.9, -15.0], [2.5, -16.6], [6.0, -17.6], [10.6, -16.3], [4.4, -14.0],
  ],
  chipmunk: [
    [-3.4, -11.0], [-3.0, -13.8], [8.7, -9.7], [9.0, -16.2], [0.8, -17.6], [-2.4, -17.4], [11.0, -17.8], [5.6, -15.6],
  ],
  bird: [
    [2.6, -10.8], [5.6, -11.2], [3.2, -14.2], [6.6, -14.4], [-0.6, -15.4], [1.6, -18.0], [8.2, -17.2], [-2.8, -16.6], [8.6, -9.0], [0.0, -13.6],
  ],
  squirrel: [
    [-1.0, -12.0], [-3.2, -11.9], [-1.6, -14.0], [4.8, -17.8], [10.4, -17.0], [8.4, -15.8], [-3.6, -17.0],
  ],
  // snakes keep to cover: the garden edges, the fence lines, under the shrubs, by the tarp and the shed
  snake: [
    [-3.7, -13.4], [0.9, -13.5], [8.1, -12.0], [8.7, -15.0], [-2.6, -18.2], [5.2, -18.4], [2.4, -16.1], [-3.8, -10.4],
  ],
};
const TREES = [OAK, { x: 7.4, z: -18.2, r: 0.14 }, { x: 0.4, z: -18.1, r: 0.14 }];
const STICK_SPOTS: [number, number][] = [
  [-1.25, -9.7], [-3.2, -10.6], [-1.0, -13.8], [-3.6, -13.0], [1.4, -10.4], [6.4, -10.5], [8.6, -11.0], [2.4, -14.2], [5.0, -14.3], [8.0, -14.6],
  [-2.2, -16.4], [0.6, -16.8], [3.6, -17.2], [6.8, -16.8], [9.6, -17.6], [10.6, -15.9], [-2.8, -18.4], [4.4, -9.8],
];

/** Pete's side of the yard (left), which animals avoid after he pops up. */
const SCARE_X1 = 3.4;
const inScare = (x: number, z: number) => x < SCARE_X1 && z < -6.6;
const yardOK = (x: number, z: number) => z < -8.3 && x > LOT.x0 + 0.4 && x < LOT.x1 - 0.4 && z > LOT.z1 + 0.4 && !inRect(x, z, DECK, 0.3) && !inRect(x, z, SHED, 0.4);

function scareTexture() {
  // soft-edged, mottled red wash (strongest along the wooden fence where Pete was)
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d')!;
  const img = g.createImageData(128, 256);
  for (let y = 0; y < 256; y++)
    for (let x = 0; x < 128; x++) {
      const u = x / 127;
      const v = y / 255;
      const edge = Math.min(1, Math.min(u, 1 - u, v, 1 - v) * 6);
      const fenceSide = 1 - u * 0.55;
      const n = 0.75 + 0.25 * Math.sin(x * 0.21 + Math.sin(y * 0.07) * 3) * Math.sin(y * 0.13 + x * 0.05);
      const a = edge * edge * fenceSide * n;
      const i = (y * 128 + x) * 4;
      img.data[i] = 255;
      img.data[i + 1] = 255;
      img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(a * 255);
    }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function markerTexture(glyph: string, color: string) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.beginPath();
  g.arc(32, 32, 26, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = color;
  g.font = 'bold 44px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(glyph, 32, 35);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Wildlife {
  prey: WildPrey[] = [];
  sticks: Stick[] = [];
  delivered: Delivered[] = [];
  respawnQueue: { kind: PreyKind; t: number }[] = [];
  rng: Rng;
  private qTex: THREE.Texture;
  private eTex: THREE.Texture;
  targetRing: THREE.Mesh;
  stickMat = new THREE.MeshStandardMaterial({ color: '#6b4b2e', roughness: 0.95 });
  private stickBark = new THREE.MeshStandardMaterial({ color: '#4d3520', roughness: 1 });
  pennyMode = false;
  hard = false; // snakes only appear in Hard Mode
  /** 1 right after Pete's scare, fading slowly: the chance an animal refuses to go to his side of the yard. */
  fear = 0;
  private fearRate = 0;
  private tintT = 99; // seconds since the scare (the red tint fades in ~8 s, much faster than the fear)
  scareZone: THREE.Mesh;
  private time = 0;

  constructor(private scene: THREE.Scene, private ledger: Ledger, private interior: Interior, private audio: Audio, seed = Date.now()) {
    this.rng = mulberry32(seed);
    this.qTex = markerTexture('?', '#ffd54a');
    this.eTex = markerTexture('!', '#ff7a3a');
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.16, 0.22, 32),
      new THREE.MeshBasicMaterial({ color: '#ffe680', transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.visible = false;
    ring.renderOrder = 2;
    scene.add(ring);
    this.targetRing = ring;
    // the faint red hue left on Pete's side of the yard after he scares everything off it
    const zw = SCARE_X1 - LOT.x0;
    const zd = -6.6 - LOT.z1;
    const zone = new THREE.Mesh(
      new THREE.PlaneGeometry(zw, zd),
      new THREE.MeshBasicMaterial({ map: scareTexture(), color: '#ff2a1a', transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 }),
    );
    zone.rotation.x = -Math.PI / 2;
    zone.position.set(LOT.x0 + zw / 2, 0.025, LOT.z1 + zd / 2);
    zone.renderOrder = 1;
    zone.visible = false;
    scene.add(zone);
    this.scareZone = zone;
  }

  /**
   * Postal Pete's scare: every animal on his (left) side of the yard bolts to the far side, and his side stays
   * shunned for the rest of the run — the fear fades slowly so a few wander back toward the end.
   */
  scare(remaining: number) {
    this.fear = 1;
    this.tintT = 0;
    this.fearRate = 0.62 / Math.max(10, remaining);
    for (const p of this.prey) {
      if (!['idle', 'walk', 'flee'].includes(p.state) || !inScare(p.x, p.z)) continue;
      p.alert = 1;
      p.climb = undefined;
      const spots = SPOTS[p.kind === 'snake' ? 'mouse' : p.kind].filter(([x]) => x > SCARE_X1 + 1.2);
      let [tx, tz] = spots[Math.floor(this.rng() * spots.length)] ?? [8, -13];
      tx += (this.rng() - 0.5) * 1.2;
      tz += (this.rng() - 0.5) * 1.2;
      if (p.kind === 'bird') {
        p.fly = { fx: p.x, fz: p.z, fy: p.y, tx, tz, ty: 0, t: 0, dur: 1.0 + Math.hypot(tx - p.x, tz - p.z) / 6 };
        p.state = 'fly';
      } else {
        p.tx = tx;
        p.tz = tz;
        p.state = 'flee';
        p.timer = 6;
      }
      p.skittish = 3;
    }
    this.audio.squeak('chipmunk');
  }

  /** Should a wander/spawn target be refused because it's on Pete's side? */
  private shunned(x: number, z: number) {
    return this.fear > 0 && inScare(x, z) && this.rng() < this.fear;
  }

  setLedger(l: Ledger) {
    this.ledger = l;
  }

  // ---------------------------------------------------------------- population
  reset(pennyMode: boolean, firstEasy = true, hard = false) {
    this.hard = hard;
    this.fear = 0;
    this.fearRate = 0;
    this.tintT = 99;
    this.scareZone.visible = false;
    for (const p of this.prey) this.scene.remove(p.model.root, p.marker);
    for (const s of this.sticks) this.scene.remove(s.mesh);
    for (const d of this.delivered) this.scene.remove(d.model.root);
    this.interior.stickPile.clear();
    this.prey = [];
    this.sticks = [];
    this.delivered = [];
    this.respawnQueue = [];
    this.pennyMode = pennyMode;
    this.time = 0;
    // first opportunity: an easy, drowsy mouse by the deck stairs (cats) / an obvious stick (Penny)
    if (firstEasy && !pennyMode) this.spawnPrey('mouse', -2.4, -10.3, true);
    for (const k of ['mouse', 'chipmunk', 'bird', 'squirrel', 'snake'] as PreyKind[]) {
      if (k === 'snake' && !hard) continue;
      const want = POPULATION.target[k] - this.prey.filter((p) => p.kind === k).length;
      for (let i = 0; i < want; i++) this.spawnAtSpot(k, -99, -99, true);
    }
    {
      // sticks for everyone (cats score 1 per stick, Penny 5); Penny gets an obvious first one by the stairs
      if (pennyMode) this.spawnStick(-1.25, -9.7);
      else this.spawnStick(STICK_SPOTS[1][0], STICK_SPOTS[1][1]);
      const spots = [...STICK_SPOTS.slice(1)].sort(() => this.rng() - 0.5);
      for (let i = 0; i < POPULATION.sticksOnGround - 1; i++) this.spawnStick(spots[i][0] + (this.rng() - 0.5) * 0.6, spots[i][1] + (this.rng() - 0.5) * 0.6);
    }
  }

  private spawnAtSpot(kind: PreyKind, px: number, pz: number, initial = false) {
    const spots = SPOTS[kind].filter(([x, z]) => Math.hypot(x - px, z - pz) > 7 && !this.prey.some((p) => Math.hypot(p.x - x, p.z - z) < 1.5) && !this.shunned(x, z));
    const list = spots.length ? spots : SPOTS[kind];
    const [x, z] = list[Math.floor(this.rng() * list.length)];
    this.spawnPrey(kind, x + (this.rng() - 0.5) * 0.8, z + (this.rng() - 0.5) * 0.8, false, initial);
  }

  spawnPrey(kind: PreyKind, x: number, z: number, sleepy = false, _initial = false): WildPrey {
    const present = this.ledger.spawn(kind);
    const model = new PreyModel(kind, Math.floor(this.rng() * 4));
    const marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.qTex, transparent: true, depthWrite: false }));
    marker.scale.set(0.14, 0.14, 1);
    marker.visible = false;
    this.scene.add(model.root, marker);
    const p: WildPrey = { id: present.id, kind, model, x, z, y: 0, heading: this.rng() * Math.PI * 2, state: 'idle', alert: 0, timer: 1 + this.rng() * 2, tx: x, tz: z, sleepy, marker, skittish: 0 };
    this.prey.push(p);
    this.place(p);
    return p;
  }

  spawnStick(x: number, z: number) {
    const present = this.ledger.spawn('stick');
    const mesh = this.makeStickMesh();
    mesh.position.set(x, 0.02, z);
    mesh.rotation.y = this.rng() * Math.PI;
    this.scene.add(mesh);
    this.sticks.push({ id: present.id, mesh, x, z, state: 'ground' });
  }

  makeStickMesh() {
    const g = new THREE.Group();
    const len = 0.38 + this.rng() * 0.2;
    const main = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.016, len, 6), this.stickMat);
    main.rotation.z = Math.PI / 2;
    main.castShadow = true;
    g.add(main);
    for (let i = 0; i < 2; i++) {
      const tw = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.007, 0.1 + this.rng() * 0.06, 5), this.stickBark);
      tw.position.set((this.rng() - 0.5) * len * 0.6, 0.02, (i ? 1 : -1) * 0.025);
      tw.rotation.set(0, 0, Math.PI / 2 + (i ? 0.7 : -0.6));
      tw.rotation.y = i ? 0.8 : -0.7;
      g.add(tw);
    }
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 4), new THREE.MeshStandardMaterial({ color: '#4f7a2a' }));
    leaf.scale.set(1.4, 0.2, 0.8);
    leaf.position.set(len * 0.42, 0.012, 0.02);
    g.add(leaf);
    return g;
  }

  private place(p: WildPrey) {
    p.model.root.position.set(p.x, p.y, p.z);
    p.model.root.rotation.y = p.heading;
  }

  // ---------------------------------------------------------------- per-frame
  update(dt: number, pet: { x: number; z: number; y: number; noiseR: number; bell: boolean; speed?: number; stalking?: boolean }, allowRespawn: boolean) {
    this.time += dt;
    if (this.fear > 0) this.fear = Math.max(0, this.fear - this.fearRate * dt);
    this.tintT += dt;
    const tint = Math.max(0, 1 - this.tintT / 8);
    if (tint > 0) {
      const m = this.scareZone.material as THREE.MeshBasicMaterial;
      m.opacity = 0.48 * tint * tint * (0.88 + Math.sin(this.time * 1.6) * 0.12);
      this.scareZone.visible = true;
    } else this.scareZone.visible = false;
    for (const p of this.prey) this.updatePrey(p, dt, pet);
    // remove gone prey
    for (let i = this.prey.length - 1; i >= 0; i--) {
      const p = this.prey[i];
      if (p.state === 'gone') {
        this.scene.remove(p.model.root, p.marker);
        this.prey.splice(i, 1);
        // only ever one snake per run: it never comes back once it's gone
        if (p.kind !== 'snake') this.respawnQueue.push({ kind: p.kind, t: (POPULATION.respawnDelay + this.rng() * 3) });
      }
    }
    if (allowRespawn) {
      for (let i = this.respawnQueue.length - 1; i >= 0; i--) {
        const r = this.respawnQueue[i];
        r.t -= dt;
        if (r.t <= 0) {
          this.respawnQueue.splice(i, 1);
          const wild = this.prey.filter((p) => p.state !== 'carried' && p.state !== 'leaving').length;
          const snakeOut = r.kind === 'snake' && this.prey.some((p) => p.kind === 'snake');
          if (snakeOut) r.t = 3; // only ever one snake on the map: wait for this one to go
          else if (wild < POPULATION.maxWild) this.spawnAtSpot(r.kind, pet.x, pet.z);
          if (snakeOut) this.respawnQueue.push(r);
        }
      }
      {
        const onGround = this.sticks.filter((s) => s.state === 'ground').length;
        if (onGround < POPULATION.sticksOnGround - 2) {
          const spots = STICK_SPOTS.filter(([x, z]) => Math.hypot(x - pet.x, z - pet.z) > 6 && !this.sticks.some((s) => s.state === 'ground' && Math.hypot(s.x - x, s.z - z) < 1));
          if (spots.length) {
            const [x, z] = spots[Math.floor(this.rng() * spots.length)];
            this.spawnStick(x + (this.rng() - 0.5) * 0.5, z + (this.rng() - 0.5) * 0.5);
          }
        }
      }
    }
    for (const d of this.delivered) this.updateDelivered(d, dt);
  }

  private updatePrey(p: WildPrey, dt: number, pet: { x: number; z: number; y: number; noiseR: number; bell: boolean; speed?: number; stalking?: boolean }) {
    const W = PREY_WORLD[p.kind];
    const m = p.model;
    const dx = p.x - pet.x;
    const dz = p.z - pet.z;
    const d = Math.hypot(dx, dz);
    p.skittish = Math.max(0, p.skittish - dt);

    // alertness from the pet's noise (only while catchable on the ground)
    if (p.state === 'idle' || p.state === 'walk') {
      const R = pet.noiseR;
      if (d < R && Math.abs(pet.y - p.y) < 1.2) {
        const rush = pet.stalking ? 1 : 0.7 + (pet.speed ?? 0) * 0.3; // charging in is louder than trotting
        const rate = W.alertRate * (p.sleepy ? 0.4 : 1) * (0.35 + 0.65 * (1 - d / R)) * (pet.bell ? 1.3 : 1) * rush;
        p.alert += rate * dt;
      } else p.alert -= W.calmRate * dt;
      p.alert = Math.max(0, p.alert);
      if (p.alert >= 1) this.startFlee(p, pet.x, pet.z);
    }

    switch (p.state) {
      case 'idle': {
        m.pose = p.alert > 0.35 ? (p.kind === 'squirrel' || p.kind === 'chipmunk' ? 'sitUp' : 'look') : p.kind === 'bird' ? 'peck' : 'idle';
        if (p.alert > 0.35) p.heading = Math.atan2(-dx, -dz); // watch the pet
        p.timer -= dt;
        if (p.timer <= 0 && p.alert < 0.3) {
          // wander a little
          for (let k = 0; k < 6; k++) {
            const a = this.rng() * Math.PI * 2;
            const r = 0.5 + this.rng() * 1.8;
            const tx = p.x + Math.cos(a) * r;
            const tz = p.z + Math.sin(a) * r;
            if (yardOK(tx, tz) && !this.shunned(tx, tz)) {
              p.tx = tx;
              p.tz = tz;
              p.state = 'walk';
              break;
            }
          }
          p.timer = 1.5 + this.rng() * 3;
        }
        break;
      }
      case 'walk': {
        m.pose = 'walk';
        if (this.moveToward(p, W.walk, dt)) {
          p.state = 'idle';
          p.timer = 1.5 + this.rng() * 3;
        }
        break;
      }
      case 'flee': {
        m.pose = 'run';
        if (this.moveToward(p, W.flee, dt)) {
          if (p.kind === 'squirrel' && p.climb) {
            p.state = 'climb';
            p.climb.t = 0;
          } else {
            p.state = 'idle';
            p.alert = 0.4;
            p.skittish = 1.5;
            p.timer = 2 + this.rng() * 2;
          }
        }
        break;
      }
      case 'fly': {
        const f = p.fly!;
        f.t += dt;
        const u = Math.min(1, f.t / f.dur);
        p.x = f.fx + (f.tx - f.fx) * u;
        p.z = f.fz + (f.tz - f.fz) * u;
        p.y = f.fy + (f.ty - f.fy) * u + Math.sin(u * Math.PI) * (1.6 + f.dur * 0.4);
        p.heading = Math.atan2(f.tx - f.fx, f.tz - f.fz);
        m.pose = 'fly';
        if (u >= 1) {
          p.y = f.ty;
          p.state = 'idle';
          p.alert = 0.35;
          p.skittish = 1.5;
          p.timer = 2 + this.rng() * 2;
          p.fly = undefined;
        }
        break;
      }
      case 'climb': {
        const c = p.climb!;
        c.t += dt;
        const up = c.t < 1.0 ? c.t / 1.0 : c.t < 5.0 ? 1 : Math.max(0, 1 - (c.t - 5.0) / 1.0);
        p.y = up * c.up;
        m.pose = c.t < 1 || c.t > 5 ? 'run' : 'look';
        m.root.rotation.x = up > 0.05 ? -Math.PI / 2 : 0;
        if (c.t > 6) {
          p.y = 0;
          m.root.rotation.x = 0;
          // step off the trunk
          const a = Math.atan2(p.z - c.z, p.x - c.x);
          p.x = c.x + Math.cos(a) * (c.r + 0.25);
          p.z = c.z + Math.sin(a) * (c.r + 0.25);
          p.state = 'idle';
          p.alert = 0.4;
          p.timer = 2;
          p.climb = undefined;
        }
        break;
      }
      case 'pounced':
        m.pose = 'look';
        break;
      case 'carried':
        m.pose = 'carried';
        break;
      case 'leaving': {
        m.pose = p.kind === 'bird' ? 'fly' : 'run';
        if (p.kind === 'bird') {
          p.y += dt * 1.5;
          this.moveToward(p, W.flee, dt, true);
          if (p.y > 5) p.state = 'gone';
        } else if (this.moveToward(p, W.flee, dt, true)) p.state = 'gone';
        p.timer -= dt;
        if (p.timer < 0) p.state = 'gone';
        break;
      }
    }

    if (p.state !== 'carried') {
      m.root.position.set(p.x, p.y, p.z);
      m.root.rotation.y = p.heading;
    }
    m.update(dt);

    // alert marker
    const show = (p.state === 'idle' || p.state === 'walk') && p.alert > 0.2;
    const fleeing = p.state === 'flee' || (p.state === 'fly' && p.fly && p.fly.t < 0.6);
    p.marker.visible = show || !!fleeing;
    if (p.marker.visible) {
      (p.marker.material as THREE.SpriteMaterial).map = fleeing ? this.eTex : this.qTex;
      const s = fleeing ? 0.17 : 0.09 + 0.08 * Math.min(1, p.alert);
      p.marker.scale.set(s, s, 1);
      p.marker.position.set(p.x, p.y + m.height * 2 + 0.17 + (p.kind === 'squirrel' ? 0.06 : 0), p.z);
      (p.marker.material as THREE.SpriteMaterial).opacity = fleeing ? 1 : 0.5 + 0.5 * Math.min(1, p.alert);
    }
  }

  /** Moves toward (tx,tz); returns true on arrival. */
  private moveToward(p: WildPrey, speed: number, dt: number, ignoreYard = false) {
    const dx = p.tx - p.x;
    const dz = p.tz - p.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.08) return true;
    const step = Math.min(d, speed * dt);
    const want = Math.atan2(dx, dz);
    let diff = want - p.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    p.heading += diff * Math.min(1, dt * 12);
    const nx = p.x + (dx / d) * step;
    const nz = p.z + (dz / d) * step;
    const pos = { x: nx, z: nz };
    resolve(pos, 0.05, groundHeight(nx, nz), 0.1);
    if (!ignoreYard && !yardOK(pos.x, pos.z)) return true;
    const moved = Math.hypot(pos.x - p.x, pos.z - p.z);
    p.x = pos.x;
    p.z = pos.z;
    if (moved < step * 0.2) {
      p.timer -= dt * 3;
      if (p.timer < -1) return true; // stuck: give up
    }
    return false;
  }

  startFlee(p: WildPrey, fromX: number, fromZ: number) {
    p.alert = 1;
    this.audio.squeak(p.kind);
    if (p.kind === 'bird') {
      // fly to another reachable landing spot, away from the pet
      const spots = SPOTS.bird.filter(([x, z]) => Math.hypot(x - fromX, z - fromZ) > 5 && Math.hypot(x - p.x, z - p.z) > 3);
      const [tx, tz] = spots.length ? spots[Math.floor(this.rng() * spots.length)] : SPOTS.bird[0];
      const dist = Math.hypot(tx - p.x, tz - p.z);
      p.fly = { fx: p.x, fz: p.z, fy: p.y, tx, tz, ty: 0, t: 0, dur: 0.9 + dist / 6 };
      p.state = 'fly';
      return;
    }
    if (p.kind === 'squirrel') {
      // dash to the nearest tree and climb it
      let best = TREES[0];
      let bd = 1e9;
      for (const t of TREES) {
        const dd = Math.hypot(t.x - p.x, t.z - p.z) + (Math.hypot(t.x - fromX, t.z - fromZ) < 2 ? 50 : 0);
        if (dd < bd) {
          bd = dd;
          best = t;
        }
      }
      if (bd < 14) {
        const a = Math.atan2(p.z - best.z, p.x - best.x);
        p.tx = best.x + Math.cos(a) * (best.r + 0.06);
        p.tz = best.z + Math.sin(a) * (best.r + 0.06);
        p.climb = { x: best.x, z: best.z, r: best.r, up: 1.5 + this.rng() * 0.8, t: 0 };
        p.state = 'flee';
        return;
      }
    }
    // run directly away to a reachable spot
    let bestScore = -1e9;
    let tx = p.x;
    let tz = p.z;
    for (let k = 0; k < 12; k++) {
      const a = Math.atan2(p.z - fromZ, p.x - fromX) + (this.rng() - 0.5) * 1.8;
      const r = 3 + this.rng() * 4;
      const cx = p.x + Math.cos(a) * r;
      const cz = p.z + Math.sin(a) * r;
      if (!yardOK(cx, cz)) continue;
      const score = Math.hypot(cx - fromX, cz - fromZ) - (inScare(cx, cz) ? this.fear * 6 : 0);
      if (score > bestScore) {
        bestScore = score;
        tx = cx;
        tz = cz;
      }
    }
    p.tx = tx;
    p.tz = tz;
    p.state = 'flee';
    p.timer = 3;
  }

  // ---------------------------------------------------------------- hunting API
  findTarget(px: number, pz: number, heading: number, maxD = 5): WildPrey | null {
    let best: WildPrey | null = null;
    let bs = 1e9;
    const fx = Math.sin(heading);
    const fz = Math.cos(heading);
    for (const p of this.prey) {
      if (p.state !== 'idle' && p.state !== 'walk') continue;
      if (p.y > 0.2) continue;
      const dx = p.x - px;
      const dz = p.z - pz;
      const d = Math.hypot(dx, dz);
      if (d > maxD) continue;
      const front = (dx * fx + dz * fz) / (d || 1);
      const score = d * (1.6 - front * 0.6);
      if (score < bs) {
        bs = score;
        best = p;
      }
    }
    return best;
  }

  /** Remove a prey that escaped from the minigame: it flees visibly. */
  escapeFromPounce(p: WildPrey, fromX: number, fromZ: number) {
    p.state = 'idle';
    this.startFlee(p, fromX, fromZ);
  }

  /** Carried wildlife lost to Babadook: runs off for good (never scores). */
  release(p: WildPrey, x: number, z: number) {
    p.model.root.removeFromParent();
    this.scene.add(p.model.root);
    p.x = x;
    p.z = z;
    p.y = 0;
    p.model.root.rotation.set(0, 0, 0);
    p.model.root.scale.setScalar(1);
    p.state = 'leaving';
    p.timer = 6;
    // run for the nearest fence/shrub line
    const exits: [number, number][] = [
      [LOT.x0 + 0.3, z],
      [x, LOT.z1 + 0.3],
      [LOT.x1 - 0.3, z],
    ];
    exits.sort((a, b) => Math.hypot(a[0] - x, a[1] - z) - Math.hypot(b[0] - x, b[1] - z));
    p.tx = exits[0][0];
    p.tz = exits[0][1];
    this.audio.squeak(p.kind);
  }

  nearestStick(px: number, pz: number, range: number): Stick | null {
    let best: Stick | null = null;
    let bd = range;
    for (const s of this.sticks) {
      if (s.state !== 'ground') continue;
      const d = Math.hypot(s.x - px, s.z - pz);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  }

  dropStick(s: Stick, x: number, z: number) {
    s.mesh.removeFromParent();
    this.scene.add(s.mesh);
    s.state = 'ground';
    const pos = { x, z };
    resolve(pos, 0.15, groundHeight(x, z));
    s.x = pos.x;
    s.z = pos.z;
    s.mesh.position.set(pos.x, groundHeight(pos.x, pos.z) + 0.02, pos.z);
    s.mesh.rotation.set(0, this.rng() * Math.PI, 0);
  }

  depositStick(s: Stick) {
    s.mesh.removeFromParent();
    s.state = 'delivered';
    const pile = this.interior.stickPile;
    const n = pile.children.length;
    s.mesh.position.set((this.rng() - 0.5) * 0.25, 0.02 + Math.floor(n / 4) * 0.025 + (n % 4) * 0.004, (this.rng() - 0.5) * 0.25);
    s.mesh.rotation.set(0, this.rng() * Math.PI, (this.rng() - 0.5) * 0.15);
    pile.add(s.mesh);
  }

  /** A scored animal: hops out of the basket after a moment and joins the living-room chaos. */
  deliver(p: WildPrey) {
    const m = p.model;
    m.root.removeFromParent();
    this.scene.add(m.root);
    m.root.scale.setScalar(1);
    m.root.rotation.set(0, 0, 0);
    p.marker.visible = false;
    this.scene.remove(p.marker);
    const idx = this.prey.indexOf(p);
    if (idx >= 0) this.prey.splice(idx, 1);
    if (p.kind !== 'snake') this.respawnQueue.push({ kind: p.kind, t: POPULATION.respawnDelay });
    const d: Delivered = {
      kind: p.kind, model: m, x: BASKET.x + (this.rng() - 0.5) * 0.15, y: FLOOR + 0.06, z: BASKET.z + (this.rng() - 0.5) * 0.15, heading: this.rng() * 6.28,
      state: 'basket', t: DELIVERED.escapeDelay, tx: 0, ty: 0, tz: 0, fx: 0, fy: 0, fz: 0, dur: 0,
    };
    this.delivered.push(d);
    if (this.delivered.length > DELIVERED.maxVisible) {
      const old = this.delivered.shift()!;
      this.scene.remove(old.model.root);
    }
  }

  private livingPoint(): [number, number] {
    for (let k = 0; k < 10; k++) {
      const L = ROOMS.living;
      const x = L.x0 + 0.5 + this.rng() * (L.x1 - L.x0 - 1.0);
      const z = L.z0 - 0.6 - this.rng() * (L.z0 - L.z1 - 1.2);
      if (Math.hypot(x - BASKET.x, z - BASKET.z) < 0.55) continue;
      const pos = { x, z };
      resolve(pos, 0.06, FLOOR, 0.1);
      if (insideHouse(pos.x, pos.z) && pos.x > ROOMS.living.x0 + 0.15 && pos.x < ROOMS.living.x1 - 0.15) return [pos.x, pos.z];
    }
    return [BASKET.x + 0.6, BASKET.z + 0.6];
  }

  private updateDelivered(d: Delivered, dt: number) {
    const m = d.model;
    if (d.state === 'basket' || d.state === 'idle' || d.state === 'perch') d.t -= dt;
    switch (d.state) {
      case 'basket':
        m.pose = 'look';
        if (d.t <= 0) {
          // hop out of the basket
          const [tx, tz] = this.livingPoint();
          d.fx = d.x;
          d.fy = d.y + 0.18;
          d.fz = d.z;
          const a = Math.atan2(tx - d.x, tz - d.z);
          d.tx = BASKET.x + Math.sin(a) * 0.55;
          d.tz = BASKET.z + Math.cos(a) * 0.55;
          d.ty = FLOOR;
          d.dur = 0.45;
          d.t = 0;
          d.state = 'hop';
          this.audio.squeak(d.kind);
        }
        break;
      case 'hop': {
        d.t += dt;
        const u = Math.min(1, d.t / d.dur);
        d.x = d.fx + (d.tx - d.fx) * u;
        d.z = d.fz + (d.tz - d.fz) * u;
        d.y = d.fy + (d.ty - d.fy) * u + Math.sin(u * Math.PI) * 0.15;
        d.heading = Math.atan2(d.tx - d.fx, d.tz - d.fz);
        m.pose = d.kind === 'bird' ? 'fly' : 'run';
        if (u >= 1) {
          d.state = 'idle';
          d.t = 0.3;
        }
        break;
      }
      case 'idle':
        m.pose = d.kind === 'bird' ? 'perch' : d.kind === 'squirrel' ? 'sitUp' : 'look';
        if (d.t <= 0) {
          if (d.kind === 'bird' || (d.kind === 'squirrel' && this.rng() < 0.4)) {
            // fly / leap up to a perch on the furniture
            const pts = this.interior.perches;
            const pp = pts[Math.floor(this.rng() * pts.length)];
            d.fx = d.x;
            d.fy = d.y;
            d.fz = d.z;
            d.tx = pp.x + (this.rng() - 0.5) * 0.1;
            d.ty = pp.y;
            d.tz = pp.z + (this.rng() - 0.5) * 0.1;
            d.dur = 0.6 + Math.hypot(d.tx - d.x, d.tz - d.z) * 0.25;
            d.t = 0;
            d.state = 'flyTo';
          } else {
            const [tx, tz] = this.livingPoint();
            d.tx = tx;
            d.tz = tz;
            d.state = 'roam';
          }
        }
        break;
      case 'roam': {
        const speed = d.kind === 'mouse' ? 1.6 : d.kind === 'chipmunk' ? 2.0 : d.kind === 'snake' ? 0.55 : 1.8;
        const dx = d.tx - d.x;
        const dz = d.tz - d.z;
        const dist = Math.hypot(dx, dz);
        m.pose = 'run';
        if (dist < 0.06) {
          d.state = 'idle';
          d.t = 0.6 + this.rng() * 2.2;
        } else {
          const step = Math.min(dist, speed * dt);
          d.x += (dx / dist) * step;
          d.z += (dz / dist) * step;
          d.y = FLOOR;
          d.heading = Math.atan2(dx, dz);
        }
        break;
      }
      case 'flyTo': {
        d.t += dt;
        const u = Math.min(1, d.t / d.dur);
        d.x = d.fx + (d.tx - d.fx) * u;
        d.z = d.fz + (d.tz - d.fz) * u;
        d.y = d.fy + (d.ty - d.fy) * u + Math.sin(u * Math.PI) * 0.4;
        d.heading = Math.atan2(d.tx - d.fx, d.tz - d.fz);
        m.pose = d.kind === 'bird' ? 'fly' : 'run';
        if (u >= 1) {
          d.state = 'perch';
          d.t = 1.5 + this.rng() * 4;
        }
        break;
      }
      case 'perch':
        m.pose = d.kind === 'bird' ? 'perch' : 'sitUp';
        if (d.t <= 0) {
          // hop down to the floor or to another perch
          const [tx, tz] = this.livingPoint();
          d.fx = d.x;
          d.fy = d.y;
          d.fz = d.z;
          if (d.kind === 'bird' && this.rng() < 0.6) {
            const pp = this.interior.perches[Math.floor(this.rng() * this.interior.perches.length)];
            d.tx = pp.x;
            d.ty = pp.y;
            d.tz = pp.z;
          } else {
            d.tx = tx;
            d.ty = FLOOR;
            d.tz = tz;
          }
          d.dur = 0.5 + Math.hypot(d.tx - d.x, d.tz - d.z) * 0.25;
          d.t = 0;
          d.state = 'flyTo';
        }
        break;
    }
    if (d.state === 'flyTo' && d.t >= d.dur && d.ty === FLOOR) {
      d.state = 'idle';
      d.t = 0.5;
    }
    m.root.position.set(d.x, d.y, d.z);
    m.root.rotation.y = d.heading;
    m.update(dt);
  }

  deliveredCount() {
    return this.delivered.length;
  }

  /** Ending tableau: settle delivered animals around the basket in view. */
  stageTableau() {
    // gather the delivered animals around the basket (in view of the ending camera)
    const n = this.delivered.length;
    this.delivered.forEach((d, i) => {
      const a = -0.6 + (i / Math.max(1, n)) * Math.PI * 1.6;
      const r = 0.55 + (i % 3) * 0.28;
      const pos = { x: BASKET.x + Math.cos(a) * r, z: BASKET.z + Math.sin(a) * r * 0.8 };
      resolve(pos, 0.06, FLOOR, 0.1);
      if (d.kind === 'bird' && i % 2 === 0) {
        const pp = this.interior.perches[i % this.interior.perches.length];
        d.x = pp.x;
        d.y = pp.y;
        d.z = pp.z;
        d.state = 'perch';
        d.t = 2 + this.rng() * 2;
      } else {
        d.x = pos.x;
        d.z = pos.z;
        d.y = FLOOR;
        d.state = 'idle';
        d.t = 0.4 + i * 0.25;
      }
      d.heading = Math.atan2(BASKET.x - d.x, BASKET.z - d.z) + Math.PI;
    });
  }

  updateTargetRing(target: WildPrey | null, inRange: boolean, t: number) {
    const r = this.targetRing;
    r.visible = !!target;
    if (target) {
      r.position.set(target.x, target.y + 0.01, target.z);
      const s = (target.kind === 'squirrel' ? 1.3 : target.kind === 'mouse' ? 0.8 : 1) * (1 + Math.sin(t * 8) * 0.06);
      r.scale.setScalar(s);
      (r.material as THREE.MeshBasicMaterial).color.set(inRange ? '#7dff8a' : '#ffe680');
    }
  }

  /** Remove everything that is mid-air/hunting at the deadline. */
  freezeAll() {
    for (const p of this.prey) if (p.state === 'pounced') this.escapeFromPounce(p, p.x + 0.5, p.z);
    this.targetRing.visible = false;
  }

  stairFootDist(x: number, z: number) {
    return Math.hypot(x - STAIR_FOOT.x, z - STAIR_FOOT.z);
  }

  gardenNear(x: number, z: number) {
    const dx = (x - GARDEN.cx) / (GARDEN.rx + 1);
    const dz = (z - GARDEN.cz) / (GARDEN.rz + 1);
    return dx * dx + dz * dz < 1;
  }
}
