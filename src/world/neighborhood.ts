// The rest of the street: Postal Pete's house next door (behind the wooden fence), the side road that runs
// past the right of our lot, houses across both streets, power lines, and a belt of trees fading into the haze
// so the world doesn't end at the fence.
import * as THREE from 'three';
import { Batch, boxGeo, std, texMat } from './build';
import * as T from './textures';
import { mulberry32 } from '../rules';
import { buildHouse } from './houses';
import { tree } from './yard';
import { ROAD_X } from './backlot';
import { LOT } from './layout';

const FRONT_Z = LOT.z0 + 5; // the front street's centre line (runs along x)

export function buildNeighborhood(scene: THREE.Scene) {
  const group = new THREE.Group();
  group.name = 'neighborhood';
  scene.add(group);
  const B = new Batch();
  const R = mulberry32(2024);

  // ---------------------------------------------------------------- the side road (runs front-to-back)
  const asphalt = texMat(T.asphalt(), 1, { roughness: 0.95 });
  {
    const len = 150;
    const z0 = FRONT_Z + 3.5;
    const road = new THREE.Mesh(new THREE.PlaneGeometry(7, len), asphalt);
    const uv = road.geometry.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * 7) / 4, (uv.getY(i) * len) / 4);
    road.rotation.x = -Math.PI / 2;
    road.position.set(ROAD_X, 0.016, z0 - len / 2);
    road.receiveShadow = true;
    group.add(road);
    const line = std('#e0b532', { roughness: 0.7 });
    for (const dx of [-0.07, 0.07]) B.add(new THREE.PlaneGeometry(0.08, len - 8), line, ROAD_X + dx, 0.021, z0 - 8 - (len - 8) / 2, -Math.PI / 2, 0, 0, 1, 1, 1, false, true);
    for (const dx of [-3.2, 3.2]) B.add(new THREE.PlaneGeometry(0.1, len), std('#e7e5df', { roughness: 0.7 }), ROAD_X + dx, 0.021, z0 - len / 2, -Math.PI / 2, 0, 0, 1, 1, 1, false, true);
    // curbs + sidewalk on our side
    B.add(boxGeo(0.15, 0.12, len, 2), std('#d2cfc6'), ROAD_X - 3.6, 0.06, z0 - len / 2);
    B.add(boxGeo(1.4, 0.04, len, 2), texMat(T.concrete(), 1), ROAD_X - 4.6, 0.02, z0 - len / 2);
    B.add(boxGeo(0.15, 0.12, len, 2), std('#d2cfc6'), ROAD_X + 3.6, 0.06, z0 - len / 2);
    // stop sign at the corner
    B.add(new THREE.CylinderGeometry(0.03, 0.03, 2.4), std('#8d9191', { metalness: 0.6 }), ROAD_X - 4.0, 1.2, FRONT_Z + 4.2);
    const oct = new THREE.CylinderGeometry(0.33, 0.33, 0.03, 8);
    B.add(oct, std('#c0262c', { roughness: 0.6 }), ROAD_X - 4.0, 2.35, FRONT_Z + 4.2, Math.PI / 2, 0, Math.PI / 8);
    // power poles + sagging lines along the far side of the side road
    const poles: number[] = [];
    for (let z = FRONT_Z - 2; z >= z0 - len + 4; z -= 24) poles.push(z);
    const wood = std('#5a4634', { roughness: 1 });
    for (const z of poles) {
      B.add(new THREE.CylinderGeometry(0.12, 0.16, 9, 8), wood, ROAD_X + 4.6, 4.5, z);
      B.add(boxGeo(0.12, 0.12, 1.8), wood, ROAD_X + 4.6, 8.4, z);
      for (const s of [-0.75, 0, 0.75]) B.add(new THREE.CylinderGeometry(0.04, 0.05, 0.12, 6), std('#7a8a80', { roughness: 0.3 }), ROAD_X + 4.6, 8.52, z + s);
    }
    const wire = new THREE.MeshBasicMaterial({ color: '#1a1a1a' });
    for (let i = 0; i < poles.length - 1; i++)
      for (const s of [-0.75, 0, 0.75]) {
        const a = new THREE.Vector3(ROAD_X + 4.6, 8.55, poles[i] + s);
        const b = new THREE.Vector3(ROAD_X + 4.6, 8.55, poles[i + 1] + s);
        const c = new THREE.QuadraticBezierCurve3(a, a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, -0.7, 0)), b);
        B.add(new THREE.TubeGeometry(c, 16, 0.012, 3, false), wire, 0, 0, 0, 0, 0, 0, 1, 1, 1, false, false);
      }
  }

  // ---------------------------------------------------------------- Postal Pete's house (next door, behind the wood fence)
  {
    buildHouse(B, {
      x: -11.9,
      z: -3.6,
      facing: 0,
      w: 9.6,
      d: 8.0,
      siding: '#c9c7bd',
      trim: '#e6e1d4',
      roof: '#6c6a66',
      door: '#2f3a4a',
      shutters: '#2c3640',
      front: [{ at: -2.9, kind: 'blinds' }, { at: 2.8, kind: 'blinds' }],
      right: [{ at: -1.8, kind: 'blinds' }, { at: 1.6, w: 0.6, h: 0.6, sill: 1.5, kind: 'dark' }], // the side facing our carport
      back: [{ at: -2.4, kind: 'blinds' }, { at: 2.2, kind: 'dark' }],
      left: [{ at: 0, kind: 'blinds' }],
      doorAt: -0.4,
      porch: 'stoop',
      backDoor: 1.2,
      chimney: -2.6,
      ac: true,
      seed: 31,
    });
    // a neat little front walk… and the stacks of undelivered mail on the stoop
    B.add(boxGeo(1.0, 0.03, 4.0, 2), texMat(T.concrete(), 1), -12.3, 0.015, 3.6);
    const env = std('#efe9da', { roughness: 0.9 });
    for (let i = 0; i < 6; i++) B.add(boxGeo(0.24, 0.05, 0.12), env, -11.65 + (R() - 0.5) * 0.2, 0.47 + i * 0.05, 1.0 + (R() - 0.5) * 0.08, 0, R() * 0.6, 0);
    // garden gnome staring at our house, and a single rocking chair
    B.add(new THREE.ConeGeometry(0.07, 0.18, 10), std('#b0302a'), -8.3, 0.33, 1.6);
    B.add(new THREE.SphereGeometry(0.075, 12, 10), std('#e9cdb5'), -8.3, 0.2, 1.6);
    B.add(new THREE.CylinderGeometry(0.08, 0.1, 0.16, 10), std('#2f5c8a'), -8.3, 0.08, 1.6);
    // gravel drive along the fence line, with his little white mail truck parked nose-out
    B.add(new THREE.PlaneGeometry(2.6, 15), new THREE.MeshStandardMaterial({ color: '#8f887c', roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 }), -5.9, 0.012, 4.0, -Math.PI / 2);
    mailTruck(group, -5.9, 3.2, 0);
    // his mailbox at the street
    B.add(boxGeo(0.08, 1.05, 0.08), std('#4a3a2a'), -7.4, 0.52, LOT.z0 + 1.3);
    B.add(boxGeo(0.2, 0.22, 0.48), std('#2c3640', { metalness: 0.4 }), -7.4, 1.15, LOT.z0 + 1.3);
    // the stepladder he stands on behind the fence (only the top shows)
    const lad = std('#9a9a92', { metalness: 0.6, roughness: 0.5 });
    for (const dz of [-0.22, 0.22]) {
      B.add(boxGeo(0.04, 1.5, 0.04), lad, -5.25, 0.75, -13.83 + dz, 0, 0, 0.18);
      B.add(boxGeo(0.04, 1.5, 0.04), lad, -4.95, 0.75, -13.83 + dz, 0, 0, -0.18);
    }
    for (let i = 0; i < 3; i++) B.add(boxGeo(0.08, 0.03, 0.48), lad, -4.95 - i * 0.03, 0.4 + i * 0.4, -13.83);
    // his back yard: overgrown, a rusty swing set nobody uses
    const rust = std('#7a5a3a', { roughness: 0.9 });
    for (const dz of [-1.2, 1.2]) for (const s of [-1, 1]) B.add(new THREE.CylinderGeometry(0.035, 0.035, 2.3), rust, -12 + s * 0.6, 1.05, -16 + dz, 0, 0, s * 0.27);
    B.add(new THREE.CylinderGeometry(0.035, 0.035, 2.6), rust, -12, 2.12, -16, Math.PI / 2, 0, 0);
    B.add(boxGeo(0.45, 0.04, 0.18), std('#2a2a2a'), -12, 0.55, -16.3);
    for (const dz of [-0.48, -0.12]) B.add(new THREE.CylinderGeometry(0.006, 0.006, 1.55), std('#555'), -12, 1.33, -16 + dz - 0.0);
    // wood privacy fence along his front side yard toward the street, so his lot reads as its own
    tree(B, -15.2, 6.5, 0.4, 7, 5, 'magnolia', 77, false);
  }

  // ---------------------------------------------------------------- houses across the streets and beyond
  const palette = ['#d8cfbd', '#b9c3c9', '#e7dfcf', '#c7b59a', '#a8b7a2', '#d9d4c8', '#c9a98e', '#9fb0bf', '#e1dccf', '#bfae94'];
  const roofs = ['#55575a', '#6a5f55', '#4f5357', '#7a6f63', '#5d5f61'];
  const winsF = (): { at: number; kind: 'curtain' | 'blinds' | 'dark' }[] => [
    { at: -2.6, kind: R() > 0.5 ? 'curtain' : 'blinds' },
    { at: 2.6, kind: R() > 0.5 ? 'curtain' : 'dark' },
  ];
  let k = 0;
  const house = (x: number, z: number, facing: number, w = 9 + R() * 2, d = 7.5 + R() * 1.5) =>
    buildHouse(B, {
      x,
      z,
      facing,
      w,
      d,
      siding: palette[k % palette.length],
      roof: roofs[k % roofs.length],
      door: ['#6b3b2b', '#2f3a4a', '#3d5a3a', '#7a2a2a'][k % 4],
      shutters: R() > 0.4 ? ['#2c3640', '#3d4a3a', '#5a2a2a', '#222'][k++ % 4] : (k++, null),
      front: winsF(),
      left: [{ at: 0, kind: 'blinds' }],
      right: [{ at: 0, kind: 'dark' }],
      back: [{ at: -2, kind: 'dark' }, { at: 2, kind: 'dark' }],
      doorAt: (R() - 0.5) * 1.5,
      porch: R() > 0.5 ? 'porch' : 'stoop',
      chimney: R() > 0.5 ? (R() - 0.5) * 4 : null,
      ac: R() > 0.4,
      garage: R() > 0.6,
      seed: 100 + k,
    });
  // across the front street (they face back toward us, -z)
  for (const x of [-27, -13, 1, 15, 31]) house(x, FRONT_Z + 11, Math.PI);
  // across the side road (they face west toward it)
  for (const z of [6, -9, -24, -39, -54]) house(ROAD_X + 13, z, -Math.PI / 2);
  // further west, past Pete
  house(-26, -4, 0);
  house(-27, -24, 0);
  // the row behind the house behind us, facing the side road too
  house(9, -48, Math.PI / 2);
  house(-6, -48, Math.PI);
  // the far side of the front street, second row (just roofs over the fences)
  for (const x of [-20, 8, 24]) house(x, FRONT_Z + 27, Math.PI, 10, 8);

  // driveways/front walks for the houses across the front street
  const drive = new THREE.MeshStandardMaterial({ color: '#a29e94', roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 });
  for (const x of [-27, -13, 1, 15, 31]) B.add(new THREE.PlaneGeometry(2.8, 6.5), drive, x + 3.5, 0.012, FRONT_Z + 4.6, -Math.PI / 2);
  for (const z of [6, -9, -24, -39, -54]) B.add(new THREE.PlaneGeometry(6.5, 2.8), drive, ROAD_X + 6.6, 0.012, z + 3.2, -Math.PI / 2);

  // yard trees near the houses (full detail), then a cheap belt of trees into the haze
  const near: [number, number, number, number, 'oak' | 'magnolia'][] = [
    [-20, 21, 0.5, 10, 'oak'],
    [-6, 23, 0.45, 9, 'magnolia'],
    [8, 22, 0.5, 11, 'oak'],
    [23.5, 24, 0.45, 9, 'oak'],
    [30, -1, 0.5, 10, 'oak'],
    [29.5, -16, 0.45, 9, 'magnolia'],
    [30, -31, 0.5, 11, 'oak'],
    [-22, -12, 0.5, 10, 'oak'],
    [-19, 6, 0.45, 8, 'magnolia'],
    [16.5, -44, 0.5, 10, 'oak'],
  ];
  near.forEach(([x, z, r, h, kk], i) => tree(B, x, z, r, h, h * 0.75, kk, 200 + i, false));
  B.build(group, 'neighborhood-static');
  group.add(treeBelt());
  return group;
}

/** Instanced, low-cost trees in a broad belt around the neighbourhood (they sit in the fog). */
function treeBelt() {
  const R = mulberry32(99);
  const trunkG = new THREE.CylinderGeometry(0.25, 0.4, 4, 6);
  trunkG.translate(0, 2, 0);
  const crown = new THREE.IcosahedronGeometry(1, 1);
  {
    const p = crown.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(p, i);
      v.multiplyScalar(1 + (Math.sin(v.x * 5) + Math.sin(v.z * 4 + v.y * 3)) * 0.08);
      p.setXYZ(i, v.x, v.y, v.z);
    }
    crown.computeVertexNormals();
  }
  const g = new THREE.Group();
  const spots: [number, number, number][] = [];
  const cx = 4;
  const cz = -10;
  let tries = 0;
  while (spots.length < 220 && tries++ < 5000) {
    const a = R() * Math.PI * 2;
    const r = 42 + R() * 70;
    const x = cx + Math.cos(a) * r;
    const z = cz + Math.sin(a) * r;
    if (Math.abs(x - ROAD_X) < 6) continue;
    if (Math.abs(z - (LOT.z0 + 5)) < 6) continue;
    spots.push([x, z, 0.8 + R() * 0.7]);
  }
  const trunks = new THREE.InstancedMesh(trunkG, new THREE.MeshStandardMaterial({ color: '#4d3d2e', roughness: 1 }), spots.length);
  const crowns = new THREE.InstancedMesh(crown, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1 }), spots.length * 3);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const col = new THREE.Color();
  const greens = ['#3d5a2a', '#4a6a32', '#35502a', '#56723a', '#2f4a26'];
  spots.forEach(([x, z, s], i) => {
    m.compose(new THREE.Vector3(x, 0, z), q.identity(), new THREE.Vector3(s, s * (1.2 + R() * 0.6), s));
    trunks.setMatrixAt(i, m);
    for (let j = 0; j < 3; j++) {
      const r = (2.4 + R() * 1.6) * s;
      q.setFromEuler(new THREE.Euler(R(), R() * 3, R()));
      m.compose(new THREE.Vector3(x + (R() - 0.5) * 2.4 * s, (5 + R() * 3) * s + j * 0.8, z + (R() - 0.5) * 2.4 * s), q, new THREE.Vector3(r, r * 0.85, r));
      crowns.setMatrixAt(i * 3 + j, m);
      crowns.setColorAt(i * 3 + j, col.set(greens[Math.floor(R() * greens.length)]));
    }
  });
  trunks.castShadow = false;
  crowns.castShadow = false;
  g.add(trunks, crowns);
  return g;
}

/** A small, boxy white right-hand-drive mail truck (no markings beyond a blue stripe). */
function mailTruck(parent: THREE.Object3D, x: number, z: number, ry: number) {
  const g = new THREE.Group();
  const white = new THREE.MeshPhysicalMaterial({ color: '#f1f0ea', roughness: 0.45, clearcoat: 0.3 });
  const blue = std('#2d4f86');
  const red = std('#b0262a');
  const glass = new THREE.MeshPhysicalMaterial({ color: '#20282c', roughness: 0.1, clearcoat: 1 });
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, px: number, py: number, pz: number) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(px, py, pz);
    mesh.castShadow = true;
    g.add(mesh);
    return mesh;
  };
  add(boxGeo(1.75, 1.75, 2.6), white, 0, 1.35, -0.55); // cargo box
  add(boxGeo(1.7, 1.0, 1.35), white, 0, 1.0, 1.35); // cab
  add(boxGeo(1.72, 0.55, 0.9), white, 0, 0.75, 2.15); // nose
  add(boxGeo(1.6, 0.6, 0.02), glass, 0, 1.75, 1.95).rotation.x = -0.25;
  add(boxGeo(0.02, 0.5, 0.9), glass, 0.86, 1.6, 1.3);
  add(boxGeo(0.02, 0.5, 0.9), glass, -0.86, 1.6, 1.3);
  for (const sx of [-0.88, 0.88]) {
    add(boxGeo(0.02, 0.07, 4.5), blue, sx, 1.25, 0.15);
    add(boxGeo(0.02, 0.04, 4.5), red, sx, 1.17, 0.15);
  }
  add(boxGeo(1.75, 0.15, 0.12), std('#3a3a3a'), 0, 0.5, 2.62);
  for (const sx of [-0.78, 0.78]) for (const sz of [-1.3, 1.85]) {
    const w = add(new THREE.CylinderGeometry(0.33, 0.33, 0.24, 16), std('#151515'), sx, 0.33, sz);
    w.rotation.z = Math.PI / 2;
  }
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  parent.add(g);
}
