// The lot behind the back fence: one run-down single-storey house (back toward us) with a bonfire, a sagging
// couch and junk in its back yard, a yard sale on the front lawn, a pickup in the gravel drive, and the road
// beyond with power poles and trees. Purely backdrop (no colliders) except what the neighbour walks around.
import * as THREE from 'three';
import { Batch, boxGeo, std, texMat } from './build';
import * as T from './textures';
import { mulberry32 } from '../rules';
import { tree } from './yard';
import { buildHouse } from './houses';

// The house behind faces the side road that runs front-to-back past the right of our lot (x ≈ 22): from our
// yard you see its side wall, its back yard (bonfire) to the left and its front yard + drive (yard sale) to the right.
export const ROAD_X = 22; // centre line of the side road
export const BACKLOT = {
  house: { x0: 5.4, x1: 12.9, z0: -22.6, z1: -32.6 }, // x1 = front wall (faces the road), z0 = side wall facing our yard
  fire: { x: 0.4, z: -24.8 },
  chair: { x: 1.5, z: -23.4, ry: -2.45 }, // the neighbour's lawn chair by the fire
  fenceZ: -19.0,
  roadZ: -45, // (unused now: the road is ROAD_X)
};

export interface BackLot {
  update(dt: number, t: number): void;
  group: THREE.Group;
}

export function buildBackLot(scene: THREE.Scene): BackLot {
  const group = new THREE.Group();
  group.name = 'backlot';
  scene.add(group);
  const B = new Batch();
  const R = mulberry32(4242);
  const H = BACKLOT.house;
  const W = H.x1 - H.x0;
  const D = H.z0 - H.z1;
  const cx = (H.x0 + H.x1) / 2;
  const cz = (H.z0 + H.z1) / 2;
  const wallH = 2.75;
  const base = 0.55; // raised floor on a block foundation

  // ---------------------------------------------------------------- materials
  const sidingTex = T.siding().clone();
  sidingTex.needsUpdate = true;
  sidingTex.repeat.set(1, 1);
  const mSiding = new THREE.MeshStandardMaterial({ map: sidingTex, color: '#c7c9b2', roughness: 0.9 }); // faded sage, chalky
  const mSidingDirty = new THREE.MeshStandardMaterial({ map: sidingTex, color: '#a9ab93', roughness: 0.95 });
  const mTrim = std('#e3ddcd', { roughness: 0.85 });
  const mTrimPeel = std('#cfc6b0', { roughness: 0.9 });
  const mRoof = texMat(T.shingles(), 1, { roughness: 0.95, color: '#8f8a80' });
  const mBlock = texMat(T.concrete(), 1, { roughness: 1, color: '#9a968c' });
  const mGlass = new THREE.MeshPhysicalMaterial({ color: '#1d2427', roughness: 0.08, metalness: 0.2, clearcoat: 1 });
  const mCurtain = std('#b9a77d', { roughness: 1 });
  const mFoil = std('#c9c9c9', { metalness: 0.9, roughness: 0.35 });
  const mPly = std('#b08a55', { roughness: 0.95 });
  const mRust = std('#7a4a2a', { roughness: 0.95, metalness: 0.2 });
  const mGutter = std('#d8d4c8', { roughness: 0.6 });
  const mBrick = std('#8a4a3a', { roughness: 0.95 });
  const mDark = std('#202020', { roughness: 0.8 });
  const mWood = std('#7d6a52', { roughness: 0.95 });
  const mWoodGrey = std('#8e877a', { roughness: 1 });

  // world-UV wall box helper: siding texture is 12 boards per tile; tile = 2.4 m
  const wall = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number) => B.add(boxGeo(w, h, d, 2.4), mat, x, y, z);

  // ---------------------------------------------------------------- the house (front faces the side road, +x)
  buildHouse(B, {
    x: cx,
    z: cz,
    facing: Math.PI / 2,
    w: D, // along z
    d: W, // along x
    siding: '#bfc3a8',
    trim: '#ddd6c4',
    roof: '#878279',
    door: '#5b2f2b',
    shutters: '#3d4a3a',
    shabby: true,
    // local left (-x) = world +z = the side facing our yard
    left: [
      { at: -2.2, kind: 'blinds' },
      { at: 0.6, w: 0.6, h: 0.6, sill: 1.5, kind: 'curtain' },
      { at: 2.5, w: 0.9, h: 1.1, kind: 'ac' },
    ],
    right: [{ at: -1.5, kind: 'foil' }, { at: 2.0, kind: 'board' }],
    front: [{ at: -3.4, kind: 'curtain' }, { at: 3.3, kind: 'board' }],
    back: [{ at: -3.6, kind: 'blinds' }, { at: 3.2, kind: 'foil' }],
    doorAt: 0.6,
    porch: 'porch',
    backDoor: -0.8,
    chimney: 2.2,
    seed: 9,
  });
  // satellite dish on the back corner, aimed at nothing
  {
    const dish = new THREE.SphereGeometry(0.32, 16, 8, 0, Math.PI * 2, 0, 0.55);
    B.add(dish, std('#d9d6cf', { roughness: 0.6, side: THREE.DoubleSide }), H.x0 + 0.5, base + wallH + 0.55, H.z0 - 1.2, -1.1, -0.9, 0);
    B.add(new THREE.CylinderGeometry(0.02, 0.02, 0.7), std('#777'), H.x0 + 0.35, base + wallH + 0.2, H.z0 - 1.2);
  }
  // little rotting deck outside the back door (their back yard side, -x)
  {
    const dz = cz - 0.8;
    for (let i = 0; i < 10; i++) {
      if (i === 6) continue;
      B.box(mWoodGrey, H.x0 - 0.8, base - 0.03, dz + (i - 4.5) * 0.25, 1.5, 0.04, 0.23, 1, (R() - 0.5) * 0.02);
    }
    for (const sx of [0.1, 1.5]) for (const sz of [-1.2, 1.2]) B.box(mWood, H.x0 - sx, base / 2, dz + sz, 0.09, base, 0.09);
    for (let s2 = 0; s2 < 2; s2++) B.box(mWoodGrey, H.x0 - 1.75 - s2 * 0.28, base - 0.2 - s2 * 0.18, dz, 0.3, 0.04, 1.2, 1, (R() - 0.5) * 0.05);
    B.add(new THREE.SphereGeometry(0.05, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffe9b0' }), H.x0 - 0.06, base + 2.35, dz + 0.8);
  }

  // ---------------------------------------------------------------- back yard junk
  const F = BACKLOT.fire;
  // fire pit: a ring of mismatched stones, charred ground, a log pile
  B.add(new THREE.CircleGeometry(1.1, 24), new THREE.MeshStandardMaterial({ color: '#2c2621', roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 }), F.x, 0.012, F.z, -Math.PI / 2);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const st = new THREE.IcosahedronGeometry(0.13 + R() * 0.06, 0);
    B.add(st, std(R() > 0.5 ? '#77736b' : '#8d877c', { roughness: 1, flatShading: true }), F.x + Math.cos(a) * 0.72, 0.08, F.z + Math.sin(a) * 0.72, R(), R(), R(), 1.2, 0.7, 1);
  }
  for (let i = 0; i < 5; i++) {
    const a = i * 1.26;
    B.add(new THREE.CylinderGeometry(0.07, 0.08, 0.8, 8), std('#3a2a1c'), F.x + Math.cos(a) * 0.15, 0.2, F.z + Math.sin(a) * 0.15, Math.PI / 2 - 0.5, a, 0);
  }
  // log pile + an axe in a stump
  for (let i = 0; i < 9; i++) B.add(new THREE.CylinderGeometry(0.09, 0.1, 0.9, 8), std('#5b4330'), F.x + 2.2 + (i % 4) * 0.2, 0.1 + Math.floor(i / 4) * 0.17, F.z - 1.4, 0, 0.3, Math.PI / 2);
  B.add(new THREE.CylinderGeometry(0.25, 0.28, 0.45, 12), std('#6d5338'), F.x - 1.9, 0.22, F.z - 1.2);
  B.add(boxGeo(0.04, 0.55, 0.04), mWood, F.x - 1.85, 0.62, F.z - 1.2, 0, 0, 0.35);
  B.add(boxGeo(0.02, 0.1, 0.16), std('#888', { metalness: 0.8 }), F.x - 1.95, 0.46, F.z - 1.2, 0, 0, 0.35);
  // the old couch dragged out by the fire: sagging plaid cushions, one arm burst
  {
    const cxx = F.x + 1.6;
    const czz = F.z - 1.9;
    const ry = -0.7;
    const mCouch = new THREE.MeshStandardMaterial({ map: plaidTex(), roughness: 1 });
    const g = new THREE.Group();
    const part = (w: number, h: number, d: number, x: number, y: number, z: number, rx = 0) => {
      const m = new THREE.Mesh(boxGeo(w, h, d, 0.8), mCouch);
      m.position.set(x, y, z);
      m.rotation.x = rx;
      m.castShadow = true;
      g.add(m);
    };
    part(1.9, 0.38, 0.85, 0, 0.27, 0);
    part(1.9, 0.6, 0.22, 0, 0.62, -0.34, -0.15);
    for (const sx of [-1, 1]) part(0.22, 0.55, 0.85, sx * 1.04, 0.36, 0);
    for (let i = 0; i < 3; i++) part(0.6, 0.14, 0.7, -0.62 + i * 0.62, 0.5 - (i === 1 ? 0.06 : 0), 0.05, (i - 1) * 0.04);
    // stuffing poking out
    const fluff = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 1), std('#efe9d8'));
    fluff.position.set(1.08, 0.66, 0.2);
    g.add(fluff);
    g.position.set(cxx, 0, czz);
    g.rotation.y = ry;
    group.add(g);
  }
  // lawn chairs around the fire
  const lawnChair = (x: number, z: number, ry: number, color: string) => {
    const g = new THREE.Group();
    const tube = std('#b9b9b2', { metalness: 0.7, roughness: 0.4 });
    const web = std(color, { roughness: 0.9 });
    for (const sx of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.62), tube);
      leg.position.set(sx * 0.25, 0.3, 0.05);
      leg.rotation.x = 0.5;
      g.add(leg);
      const leg2 = leg.clone();
      leg2.rotation.x = -0.5;
      leg2.position.z = -0.05;
      g.add(leg2);
    }
    for (let i = 0; i < 5; i++) {
      const s = new THREE.Mesh(boxGeo(0.5, 0.012, 0.06), web);
      s.position.set(0, 0.36, -0.15 + i * 0.08);
      g.add(s);
      const b = new THREE.Mesh(boxGeo(0.5, 0.06, 0.012), web);
      b.position.set(0, 0.45 + i * 0.09, -0.22 - i * 0.025);
      g.add(b);
    }
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
    group.add(g);
  };
  lawnChair(BACKLOT.chair.x, BACKLOT.chair.z, BACKLOT.chair.ry, '#3f7a4a');
  lawnChair(F.x - 1.2, F.z + 1.2, 2.36, '#b8453a');
  // cooler, crushed cans, a burn barrel, trash bags, tires, a dead mower, a kiddie pool full of rainwater
  B.add(boxGeo(0.6, 0.38, 0.38), std('#2b5fa8'), BACKLOT.chair.x + 0.6, 0.19, BACKLOT.chair.z + 0.45, 0, 0.4, 0);
  B.add(boxGeo(0.62, 0.06, 0.4), std('#f2f2f2'), BACKLOT.chair.x + 0.6, 0.41, BACKLOT.chair.z + 0.45, 0, 0.4, 0);
  for (let i = 0; i < 14; i++) {
    const a = R() * Math.PI * 2;
    const r = 0.5 + R() * 2.4;
    B.add(new THREE.CylinderGeometry(0.03, 0.03, 0.06 + R() * 0.06, 10), std(R() > 0.5 ? '#2a4f9a' : '#c8c8c8', { metalness: 0.6, roughness: 0.4 }), F.x + Math.cos(a) * r, 0.03, F.z + 0.5 + Math.sin(a) * r, Math.PI / 2, R() * 3, 0);
  }
  B.add(new THREE.CylinderGeometry(0.3, 0.3, 0.88, 14, 1, true), mRust, -3.3, 0.44, -27.5);
  for (let i = 0; i < 4; i++) {
    const tb = new THREE.SphereGeometry(0.3, 10, 8);
    B.add(tb, std('#111214', { roughness: 0.35 }), H.x0 - 0.9 + (i % 2) * 0.35, 0.25, cz + 2.0 + Math.floor(i / 2) * 0.45, 0, R(), 0, 1, 0.85 + R() * 0.3, 1);
  }
  for (let i = 0; i < 4; i++) B.add(new THREE.TorusGeometry(0.3, 0.11, 8, 16), std('#151515'), -3.6, 0.11 + i * 0.21, -31.5, Math.PI / 2, 0, 0);
  B.add(new THREE.CylinderGeometry(0.9, 0.9, 0.22, 24, 1, true), std('#5fb3d8', { roughness: 0.5, side: THREE.DoubleSide }), -1.6, 0.11, -29.2);
  B.add(new THREE.CircleGeometry(0.88, 24), std('#3f5a43', { roughness: 0.2 }), -1.6, 0.17, -29.2, -Math.PI / 2);
  // clothesline between two T posts, with a pair of jeans and a towel
  {
    const p1 = [-3.0, -21.5];
    const p2 = [-3.0, -26.5];
    for (const p of [p1, p2]) {
      B.add(new THREE.CylinderGeometry(0.04, 0.04, 2.1), mRust, p[0], 1.05, p[1]);
      B.add(boxGeo(0.9, 0.06, 0.06), mRust, p[0], 2.05, p[1]);
    }
    for (const dx of [-0.4, 0.4]) B.add(new THREE.CylinderGeometry(0.004, 0.004, 5), std('#ddd'), p1[0] + dx, 2.02, -24, Math.PI / 2, 0, 0);
    B.add(boxGeo(0.02, 0.9, 0.5), std('#3c5a86'), p1[0] - 0.4, 1.56, -23.2);
    B.add(boxGeo(0.02, 0.6, 0.7), std('#d8a72e'), p1[0] + 0.4, 1.7, -25.0);
  }
  // their side fences (a sagging run of old chain-link) so the lot reads as its own yard
  {
    const mChain = new THREE.MeshStandardMaterial({ map: T.chainlink(), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.3, color: '#b8b2a5' });
    const run = (x0: number, z0: number, x1: number, z1: number) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const g = new THREE.PlaneGeometry(len, 1.15);
      const uv = g.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * len) / 0.07, (uv.getY(i) * 1.15) / 0.07);
      B.add(g, mChain, (x0 + x1) / 2, 0.6, (z0 + z1) / 2, 0, Math.atan2(-(z1 - z0), x1 - x0), 0, 1, 1, 1, false, false);
      const n = Math.ceil(len / 2.8);
      for (let i = 0; i <= n; i++) B.add(new THREE.CylinderGeometry(0.03, 0.03, 1.25), mRust, x0 + ((x1 - x0) * i) / n, 0.62, z0 + ((z1 - z0) * i) / n, 0, 0, (R() - 0.5) * 0.08);
    };
    run(-4.4, -19.1, -4.4, -36);
    run(-4.4, -36, 18.5, -36);
  }

  // ---------------------------------------------------------------- front yard: yard sale, drive, pickup
  const fx = H.x1 + 3.3; // the lawn in front of the house (toward the road)
  const table = (x: number, z: number, ry: number) => {
    B.add(boxGeo(1.8, 0.04, 0.76), std('#e9e6df'), x, 0.74, z, 0, ry, 0);
    for (const sx of [-0.8, 0.8]) B.add(boxGeo(0.04, 0.72, 0.6), std('#555', { metalness: 0.6 }), x + Math.cos(ry) * sx, 0.36, z - Math.sin(ry) * sx, 0, ry, 0.0);
    // assorted junk on top
    for (let i = 0; i < 7; i++) {
      const ox = (R() - 0.5) * 1.6;
      const oz = (R() - 0.5) * 0.55;
      const px = x + Math.cos(ry) * ox + Math.sin(ry) * oz;
      const pz = z - Math.sin(ry) * ox + Math.cos(ry) * oz;
      const k = Math.floor(R() * 5);
      const col = ['#b54b3c', '#3b6fa0', '#e2c044', '#5c9a5a', '#d9d4c8', '#8a5a8a'][Math.floor(R() * 6)];
      if (k === 0) B.add(boxGeo(0.25, 0.18, 0.2), std(col), px, 0.85, pz, 0, R(), 0); // boxed something
      if (k === 1) B.add(new THREE.CylinderGeometry(0.06, 0.08, 0.22, 10), std(col, { roughness: 0.3 }), px, 0.87, pz); // vase
      if (k === 2) {
        B.add(new THREE.CylinderGeometry(0.02, 0.08, 0.35, 8), std('#c9a85a', { metalness: 0.5 }), px, 0.93, pz); // lamp
        B.add(new THREE.CylinderGeometry(0.08, 0.14, 0.16, 12, 1, true), std('#efe3c4', { side: THREE.DoubleSide }), px, 1.15, pz);
      }
      if (k === 3) for (let j = 0; j < 4; j++) B.add(boxGeo(0.16, 0.03, 0.22), std(col), px, 0.775 + j * 0.03, pz, 0, R() * 0.3, 0); // stack of books
      if (k === 4) B.add(new THREE.SphereGeometry(0.08, 10, 8), std(col), px, 0.84, pz); // ball / doll head
    }
  };
  table(fx, cz - 3.2, Math.PI / 2 + 0.08);
  table(fx + 0.3, cz - 0.4, Math.PI / 2 - 0.05);
  table(fx, cz + 2.3, Math.PI / 2 + 0.1);
  // clothes rack with hanging shirts
  {
    const rz = cz + 4.2;
    const rx = fx - 0.4;
    for (const sz of [-0.6, 0.6]) B.add(new THREE.CylinderGeometry(0.015, 0.015, 1.5), std('#999', { metalness: 0.7 }), rx, 0.75, rz + sz);
    B.add(new THREE.CylinderGeometry(0.012, 0.012, 1.25), std('#999', { metalness: 0.7 }), rx, 1.48, rz, Math.PI / 2, 0, 0);
    for (let i = 0; i < 7; i++) B.add(boxGeo(0.45, 0.65, 0.06), std(['#c33', '#36c', '#ddd', '#555', '#e9a', '#6a6', '#a73'][i]), rx, 1.12, rz - 0.5 + i * 0.16, 0, (R() - 0.5) * 0.2, 0);
  }
  // boxes on the grass, an old CRT TV, a kid's bike, a recliner with a sign on it
  for (let i = 0; i < 5; i++) B.add(boxGeo(0.4, 0.35, 0.45), std('#b48d5a', { roughness: 1 }), fx + 1.3 + (i % 2) * 0.2, 0.175, cz - 4 + i * 0.6, 0, R() * 0.5, 0);
  B.add(boxGeo(0.5, 0.5, 0.6), std('#2a2a2a'), fx + 1.4, 0.25, cz + 1.0);
  B.add(boxGeo(0.02, 0.36, 0.46), std('#3a4a55', { roughness: 0.2 }), fx + 1.66, 0.27, cz + 1.0);
  B.add(new THREE.TorusGeometry(0.22, 0.03, 6, 18), std('#222'), fx + 1.5, 0.24, cz + 3.0, 0, Math.PI / 2 + 0.3, 0);
  B.add(new THREE.TorusGeometry(0.22, 0.03, 6, 18), std('#222'), fx + 1.7, 0.24, cz + 3.7, 0, Math.PI / 2 + 0.3, 0);
  B.add(boxGeo(0.05, 0.04, 0.75), std('#d23'), fx + 1.6, 0.42, cz + 3.35, 0, 0.3, 0);
  // the hand-lettered sign at the road
  {
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.7), new THREE.MeshStandardMaterial({ map: signTex(), roughness: 1, side: THREE.DoubleSide }));
    sign.position.set(ROAD_X - 3.9, 1.0, cz + 6.0);
    sign.rotation.y = Math.PI / 2 - 0.5;
    group.add(sign);
    B.add(boxGeo(0.05, 1.2, 0.05), mWood, ROAD_X - 3.93, 0.6, cz + 6.0);
  }
  // gravel drive + a rusted pickup
  // gravel drive along our back fence, from the road to the side of the house; the pickup nose-out
  B.add(new THREE.PlaneGeometry(ROAD_X - 3.5 - (H.x0 + 1), 3.0), new THREE.MeshStandardMaterial({ color: '#8a8378', roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 }), (ROAD_X - 3.5 + H.x0 + 1) / 2, 0.012, -20.9, -Math.PI / 2);
  pickup(group, H.x1 + 2.6, -20.9, Math.PI / 2);

  // their mailbox at the road
  B.add(boxGeo(0.08, 1.05, 0.08), mWood, ROAD_X - 3.9, 0.52, cz - 5.5);
  B.add(boxGeo(0.48, 0.22, 0.2), std('#3a3a3a', { metalness: 0.5 }), ROAD_X - 3.9, 1.15, cz - 5.5);
  // trees in and around the lot
  const trees: [number, number, number, number, 'oak' | 'magnolia'][] = [
    [-3.2, -34.5, 0.45, 9.5, 'oak'],
    [15.5, -35.5, 0.4, 8.5, 'magnolia'],
    [8.0, -37.0, 0.5, 10, 'oak'],
  ];
  trees.forEach(([x, z, r, h, k], i) => tree(B, x, z, r, h, h * 0.75, k, 60 + i, false));

  B.build(group, 'backlot-static');

  // ---------------------------------------------------------------- the bonfire (animated)
  const fire = new THREE.Group();
  fire.position.set(F.x, 0, F.z);
  group.add(fire);
  const flameTex = flameTexture();
  const flames: { m: THREE.Mesh; ph: number; s: number }[] = [];
  for (let i = 0; i < 7; i++) {
    const mat = new THREE.MeshBasicMaterial({ map: flameTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 1.3), mat);
    m.position.set((R() - 0.5) * 0.35, 0.62, (R() - 0.5) * 0.35);
    m.rotation.y = (i / 7) * Math.PI;
    fire.add(m);
    flames.push({ m, ph: R() * 10, s: 0.7 + R() * 0.6 });
  }
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8), new THREE.MeshBasicMaterial({ color: '#ffb347', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  core.scale.set(1, 0.6, 1);
  core.position.y = 0.25;
  fire.add(core);
  const light = new THREE.PointLight('#ff8a3a', 6, 9, 1.6);
  light.position.set(0, 0.9, 0);
  fire.add(light);
  // smoke puffs and embers
  const smokeMat = new THREE.SpriteMaterial({ map: T.radialShadow(), color: '#6b6560', transparent: true, opacity: 0.35, depthWrite: false });
  const smoke: { s: THREE.Sprite; t: number }[] = [];
  for (let i = 0; i < 10; i++) {
    const s = new THREE.Sprite(smokeMat.clone());
    fire.add(s);
    smoke.push({ s, t: i / 10 });
  }
  const emberMat = new THREE.SpriteMaterial({ map: T.glowDot('255,150,60'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const embers: { s: THREE.Sprite; t: number; x: number; z: number }[] = [];
  for (let i = 0; i < 16; i++) {
    const s = new THREE.Sprite(emberMat);
    s.scale.setScalar(0.05);
    fire.add(s);
    embers.push({ s, t: R(), x: (R() - 0.5) * 0.6, z: (R() - 0.5) * 0.6 });
  }

  return {
    group,
    update(dt, t) {
      for (const f of flames) {
        const k = 0.85 + Math.sin(t * 9 * f.s + f.ph) * 0.12 + Math.sin(t * 23 + f.ph * 2) * 0.06;
        f.m.scale.set(0.9 + Math.sin(t * 5 + f.ph) * 0.1, k * f.s, 1);
        f.m.position.y = 0.2 + (0.65 * k * f.s) / 1.3 * 0.9;
        f.m.rotation.y += dt * 0.3;
      }
      light.intensity = 5.5 + Math.sin(t * 13) * 0.8 + Math.sin(t * 31) * 0.5;
      for (const p of smoke) {
        p.t = (p.t + dt * 0.12) % 1;
        p.s.position.set(Math.sin(p.t * 6 + t * 0.3) * 0.3 * p.t, 1.2 + p.t * 4.5, p.t * 0.8);
        p.s.scale.setScalar(0.5 + p.t * 2.2);
        (p.s.material as THREE.SpriteMaterial).opacity = 0.32 * Math.sin(p.t * Math.PI);
      }
      for (const e of embers) {
        e.t = (e.t + dt * 0.5) % 1;
        e.s.position.set(e.x + Math.sin(e.t * 9 + e.x * 20) * 0.15, 0.4 + e.t * 3.2, e.z + e.t * 0.4);
        e.s.material.opacity = 1 - e.t;
      }
    },
  };
}

function flameTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 105, 4, 32, 80, 60);
  grd.addColorStop(0, 'rgba(255,240,180,1)');
  grd.addColorStop(0.25, 'rgba(255,180,60,0.95)');
  grd.addColorStop(0.55, 'rgba(230,80,20,0.6)');
  grd.addColorStop(1, 'rgba(120,20,0,0)');
  g.fillStyle = grd;
  g.beginPath();
  g.moveTo(32, 4);
  g.bezierCurveTo(46, 40, 60, 70, 54, 100);
  g.bezierCurveTo(50, 122, 14, 122, 10, 100);
  g.bezierCurveTo(4, 70, 20, 40, 32, 4);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function plaidTex() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#7a5a3a';
  g.fillRect(0, 0, 128, 128);
  g.globalAlpha = 0.5;
  g.fillStyle = '#3d4a2a';
  for (let i = 0; i < 128; i += 32) {
    g.fillRect(i, 0, 14, 128);
    g.fillRect(0, i, 128, 14);
  }
  g.fillStyle = '#c9a66a';
  for (let i = 8; i < 128; i += 32) {
    g.fillRect(i, 0, 2, 128);
    g.fillRect(0, i, 128, 2);
  }
  g.globalAlpha = 0.35;
  g.fillStyle = '#2a2018';
  g.beginPath();
  g.ellipse(70, 60, 30, 18, 0.4, 0, Math.PI * 2);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function signTex() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 180;
  const g = c.getContext('2d')!;
  g.fillStyle = '#c8a576';
  g.fillRect(0, 0, 256, 180);
  g.fillStyle = 'rgba(0,0,0,0.12)';
  g.fillRect(0, 88, 256, 3);
  g.fillStyle = '#16140f';
  g.font = 'bold 64px "Comic Sans MS", "Marker Felt", sans-serif';
  g.save();
  g.translate(20, 76);
  g.rotate(-0.04);
  g.fillText('YARD', 20, 0);
  g.fillText('SALE', 30, 70);
  g.restore();
  g.font = '24px sans-serif';
  g.fillStyle = '#b02020';
  g.fillText('→ cash only', 120, 170);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function pickup(parent: THREE.Object3D, x: number, z: number, ry: number) {
  const g = new THREE.Group();
  const paint = new THREE.MeshPhysicalMaterial({ color: '#6f5a3e', roughness: 0.6, clearcoat: 0.2 });
  const rust = std('#7a4a2a', { roughness: 0.95 });
  const glass = new THREE.MeshPhysicalMaterial({ color: '#202628', roughness: 0.1, clearcoat: 1 });
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, px: number, py: number, pz: number) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(px, py, pz);
    mesh.castShadow = true;
    g.add(mesh);
    return mesh;
  };
  add(boxGeo(1.85, 0.55, 5.2), paint, 0, 0.75, 0); // body
  add(boxGeo(1.7, 0.62, 1.6), paint, 0, 1.33, 0.55); // cab
  add(boxGeo(1.6, 0.48, 0.02), glass, 0, 1.38, 1.36).rotation.x = -0.3;
  add(boxGeo(0.02, 0.42, 1.2), glass, 0.86, 1.38, 0.55);
  add(boxGeo(0.02, 0.42, 1.2), glass, -0.86, 1.38, 0.55);
  add(boxGeo(1.86, 0.2, 0.15), std('#999', { metalness: 0.7 }), 0, 0.55, 2.62); // bumper
  add(boxGeo(1.7, 0.3, 0.05), std('#222'), 0, 0.8, 2.62); // grille
  add(boxGeo(1.8, 0.4, 2.0), rust, 0, 1.1, -1.55).scale.set(1, 0.4, 1); // rusty bed rails
  for (const sx of [-0.85, 0.85]) for (const sz of [-1.7, 1.6]) {
    const w = add(new THREE.CylinderGeometry(0.38, 0.38, 0.28, 18), std('#151515'), sx, 0.38, sz);
    w.rotation.z = Math.PI / 2;
  }
  // a spare tyre and junk in the bed
  add(new THREE.TorusGeometry(0.3, 0.12, 8, 16), std('#151515'), 0.3, 1.15, -1.6).rotation.x = Math.PI / 2;
  add(boxGeo(0.5, 0.35, 0.4), std('#b48d5a'), -0.4, 1.2, -2.0);
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  parent.add(g);
}
