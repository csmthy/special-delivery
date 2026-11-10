import * as THREE from 'three';
import { Batch, boxGeo, decal, std, texMat } from './build';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as T from './textures';
import * as D from './decortex';
import { mulberry32 } from '../rules';
import {
  CARPORT, CHAIRS, DECK, FLOOR, FRONT_DOOR, FRONT_OAK, GARDEN, HOUSE, LOT, OAK, OAK2, ROOMS, SHED, addBox, addCircle, inRect,
} from './layout';

export interface YardParts {
  chimes: THREE.Object3D;
  swayers: THREE.Object3D[];
}

const rng = mulberry32(777);

export function buildYard(scene: THREE.Scene): YardParts {
  const group = new THREE.Group();
  group.name = 'yard';
  scene.add(group);
  const B = new Batch();

  // ---------------------------------------------------------------- ground
  const mGrass = texMat(T.grass(), 1, { roughness: 1 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), mGrass);
  {
    const uv = ground.geometry.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 160 / 2.6, uv.getY(i) * 160 / 2.6);
  }
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(6, 0, -8);
  ground.receiveShadow = true;
  group.add(ground);

  // bare dirt patches under the oak (as in backyard-1)
  const mDirt = decal(new THREE.MeshStandardMaterial({ map: T.soil(), alphaMap: T.radialShadow(), roughness: 1, transparent: true, opacity: 0.9, depthWrite: false }));
  for (const [x, z, r] of [
    [OAK.x + 0.3, OAK.z + 1.0, 2.0],
    [OAK.x - 1.0, OAK.z - 1.6, 1.4],
  ]) {
    const d = new THREE.Mesh(new THREE.CircleGeometry(r, 24), mDirt);
    d.rotation.x = -Math.PI / 2;
    d.position.set(x, 0.012, z);
    d.receiveShadow = true;
    group.add(d);
  }

  // garden bed (long and narrow)
  {
    const bed = new THREE.Mesh(new THREE.CircleGeometry(1, 40), decal(texMat(T.soil(), 3, { roughness: 1 })));
    bed.rotation.x = -Math.PI / 2;
    bed.rotation.z = GARDEN.rot;
    bed.scale.set(GARDEN.rx, GARDEN.rz, 1);
    bed.position.set(GARDEN.cx, 0.02, GARDEN.cz);
    bed.receiveShadow = true;
    group.add(bed);
  }

  // ---------------------------------------------------------------- driveway, carport, street
  const mConcrete = texMat(T.concrete(), 1);
  B.box(mConcrete, (CARPORT.x0 + CARPORT.x1) / 2, 0.02, (CARPORT.z0 + CARPORT.z1) / 2, CARPORT.x1 - CARPORT.x0, 0.04, CARPORT.z0 - CARPORT.z1, 3);
  B.box(mConcrete, (CARPORT.x0 + CARPORT.x1) / 2, 0.015, (CARPORT.z0 + LOT.z0 + 2) / 2, CARPORT.x1 - CARPORT.x0, 0.03, LOT.z0 + 2 - CARPORT.z0, 3);
  // walkway to the front stoop
  B.box(mConcrete, (FRONT_DOOR.xc + CARPORT.x1) / 2 + 0.4, 0.012, 1.6, FRONT_DOOR.xc - CARPORT.x1 + 0.6, 0.024, 0.9, 3);
  B.box(mConcrete, FRONT_DOOR.xc, 0.017, 1.15, 1.0, 0.034, 0.6, 3);
  const mAsphalt = texMat(T.asphalt(), 1, { roughness: 0.95 });
  B.box(mAsphalt, 6, 0.012, LOT.z0 + 5, 90, 0.024, 7, 4, 0, false);
  B.box(std('#d8d4c8'), 6, 0.02, LOT.z0 + 1.5, 90, 0.04, 0.25);
  // carport: metal posts + flat roof
  const mMetal = std('#c9c8c2', { metalness: 0.5, roughness: 0.45 });
  for (const [x, z] of [
    [CARPORT.x0 + 0.1, CARPORT.z0 - 0.1],
    [CARPORT.x0 + 0.1, CARPORT.z1 + 0.1],
    [CARPORT.x1 - 0.1, CARPORT.z0 - 0.1],
    [CARPORT.x1 - 0.1, CARPORT.z1 + 0.1],
  ]) {
    B.box(mMetal, x, 1.15, z, 0.08, 2.3, 0.08);
    addCircle(x, z, 0.07);
  }
  // white gable roof (ridge runs front-to-back), ribbed metal panels
  {
    const mRoofW = std('#f2f1ec', { roughness: 0.5, metalness: 0.15, side: THREE.DoubleSide });
    const cx = (CARPORT.x0 + CARPORT.x1) / 2;
    const cz = (CARPORT.z0 + CARPORT.z1) / 2;
    const half = (CARPORT.x1 - CARPORT.x0) / 2 + 0.25;
    const rise = 0.6;
    const slope = Math.hypot(half, rise);
    const ang = Math.atan2(rise, half);
    const depth = CARPORT.z0 - CARPORT.z1 + 0.5;
    for (const s of [-1, 1]) {
      B.add(boxGeo(slope, 0.04, depth), mRoofW, cx + (s * half) / 2, 2.32 + rise / 2, cz, 0, 0, -s * ang);
      for (let k = 0; k < 6; k++) B.add(boxGeo(0.03, 0.03, depth), mRoofW, cx + s * (0.15 + k * (half - 0.2) / 5), 2.36 + rise * (1 - (0.15 + k * (half - 0.2) / 5) / half), cz, 0, 0, -s * ang);
      // beam along each side
      B.box(mMetal, cx + s * (half - 0.25), 2.28, cz, 0.08, 0.1, depth - 0.4);
    }
    B.box(mMetal, cx, 2.3 + rise, cz, 0.1, 0.08, depth - 0.03);
    // gable-end triangles
    for (const zz of [CARPORT.z0 + 0.25, CARPORT.z1 - 0.25]) {
      const sh = new THREE.Shape();
      sh.moveTo(-half, 0);
      sh.lineTo(half, 0);
      sh.lineTo(0, rise);
      sh.closePath();
      B.add(new THREE.ShapeGeometry(sh), mRoofW, cx, 2.32, zz);
    }
  }

  // ---------------------------------------------------------------- fences
  const mChain = new THREE.MeshStandardMaterial({ map: T.chainlink(), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.3 });
  const mPost = std('#2b2e2d', { metalness: 0.4, roughness: 0.5 });
  const fence = (x0: number, z0: number, x1: number, z1: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const h = 1.2;
    const g = new THREE.PlaneGeometry(len, h);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * len) / 0.07, (uv.getY(i) * h) / 0.07);
    const ang = Math.atan2(-(z1 - z0), x1 - x0);
    B.add(g, mChain, (x0 + x1) / 2, h / 2 + 0.02, (z0 + z1) / 2, 0, ang, 0, 1, 1, 1, true, false);
    B.add(new THREE.CylinderGeometry(0.02, 0.02, len, 6), mPost, (x0 + x1) / 2, h, (z0 + z1) / 2, 0, ang, Math.PI / 2);
    const n = Math.ceil(len / 2.8);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      B.add(new THREE.CylinderGeometry(0.03, 0.03, h + 0.08, 6), mPost, x0 + (x1 - x0) * t, (h + 0.08) / 2, z0 + (z1 - z0) * t);
    }
    addBox(Math.min(x0, x1) - 0.05, Math.max(x0, x1) + 0.05, Math.min(z0, z1) - 0.05, Math.max(z0, z1) + 0.05, 0, 1.4, false, 'fence');
  };
  // weathered gray wood privacy fence around the back yard (from the video), with a gate in the back
  const mBoards = texMat(D.boards('#8c877d', 'rgba(40,36,30,0.75)', 14), 1, { roughness: 0.95, side: THREE.DoubleSide });
  const mFrame = std('#77726a', { roughness: 0.95 });
  const woodFence = (x0: number, z0: number, x1: number, z1: number, gateAt = -1) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const h = 1.8;
    const ang = Math.atan2(-(z1 - z0), x1 - x0);
    const g = new THREE.BoxGeometry(len, h, 0.025);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * len) / 2, uv.getY(i));
    B.add(g, mBoards, (x0 + x1) / 2, h / 2 + 0.03, (z0 + z1) / 2, 0, ang, 0);
    // rails and posts on the yard side
    const nx = -(z1 - z0) / len;
    const nz = (x1 - x0) / len;
    const side = Math.sign((6 - (x0 + x1) / 2) * nx + (-8 - (z0 + z1) / 2) * nz) || 1; // rails face the lot centre
    for (const y of [0.3, 1.5]) B.add(boxGeo(len, 0.09, 0.04), mFrame, (x0 + x1) / 2 + nx * side * 0.035, y, (z0 + z1) / 2 + nz * side * 0.035, 0, ang, 0);
    const n = Math.ceil(len / 2.4);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      B.box(mFrame, x0 + (x1 - x0) * t + nx * side * 0.06, 0.95, z0 + (z1 - z0) * t + nz * side * 0.06, 0.1, 1.9, 0.1, 1, ang);
    }
    if (gateAt >= 0) {
      // gate: diagonal brace, black strap hinges and a latch
      const gx = x0 + (x1 - x0) * gateAt;
      const gz = z0 + (z1 - z0) * gateAt;
      const off = side * 0.04;
      B.add(boxGeo(1.25, 0.08, 0.035), mFrame, gx + nx * off, 0.9, gz + nz * off, 0, ang, 0.85);
      for (const y of [0.35, 1.45]) B.add(boxGeo(0.35, 0.04, 0.02), std('#151515'), gx - (x1 - x0) / len * 0.45 + nx * off * 1.4, y, gz - (z1 - z0) / len * 0.45 + nz * off * 1.4, 0, ang, 0);
      B.add(boxGeo(0.06, 0.12, 0.05), std('#2a2a2a', { metalness: 0.5 }), gx + (x1 - x0) / len * 0.45 + nx * off * 1.4, 1.05, gz + (z1 - z0) / len * 0.45 + nz * off * 1.4, 0, ang, 0);
    }
    addBox(Math.min(x0, x1) - 0.05, Math.max(x0, x1) + 0.05, Math.min(z0, z1) - 0.05, Math.max(z0, z1) + 0.05, 0, 2.0, false, 'fence');
  };
  // Owner's sketch: the gray wood privacy fence (with its gate) is only the left side; chain-link runs across the
  // back and down the right side to the shed, then from the shed to the back-right corner of the house.
  // Nothing wraps around the front. The fence meets the back corner of the deck on the left.
  const backCornerZ = DECK.z1 - 0.2;
  woodFence(LOT.x0, LOT.z1, LOT.x0, backCornerZ, 0.5);
  woodFence(LOT.x0, backCornerZ, DECK.x0 - 0.02, DECK.z1);
  fence(LOT.x0, LOT.z1, LOT.x1, LOT.z1);
  fence(LOT.x1, LOT.z1, LOT.x1, SHED.z1);
  fence(LOT.x1 - 0.05, SHED.z0, HOUSE.x1, HOUSE.z1);
  void mPost;

  // ---------------------------------------------------------------- shed (from backyard-2)
  buildShed(B, group);

  // ---------------------------------------------------------------- trees
  const swayers: THREE.Object3D[] = [];
  tree(B, OAK.x, OAK.z, OAK.r, 7.5, 7.5, 'oak', 1, true);
  tree(B, OAK2.x, OAK2.z, OAK2.r, 7.0, 5.5, 'oak', 2, true);
  tree(B, FRONT_OAK.x, FRONT_OAK.z, FRONT_OAK.r, 8.0, 7.0, 'oak', 3, true);
  // trees beyond the fence (background, no collision)
  const bg: [number, number, number, number, 'oak' | 'magnolia' | 'myrtle'][] = [
    [-14, -20, 0.5, 9, 'oak'],
    [-19.5, -13, 0.5, 9, 'oak'],
    [-14, 9, 0.4, 7, 'magnolia'],
    [28.5, 3, 0.45, 8, 'oak'],
  ];
  bg.forEach(([x, z, r, h, k], i) => tree(B, x, z, r, h, h * 0.75, k, 10 + i, false));
  // crape myrtles (pink flowers) and shrubs along the fences
  const myrtles: [number, number][] = [
    [0.4, -18.1],
    [7.4, -18.2],
  ];
  myrtles.forEach(([x, z], i) => {
    tree(B, x, z, 0.12, 3.6, 1.8, 'myrtle', 40 + i, true);
  });
  const shrubs: [number, number, number][] = [
    // inside the fence line (video: dense shrubs along the wood fence and the back)
    [-3.8, -15.6, 0.9], [-3.7, -17.9, 1.0], [-1.6, -18.4, 0.9], [3.6, -18.4, 0.8], [10.1, -18.3, 1.0], [11.6, -16.4, 0.8],
    // boxwood hedge along the front of the house
    [1.0, 0.65, 0.55], [3.2, 0.65, 0.6], [5.6, 0.6, 0.55], [9.4, 0.65, 0.6], [10.8, 0.65, 0.55], [12.8, 0.6, 0.5],
  ];
  shrubs.forEach(([x, z, r], i) => bush(B, x, z, r, 60 + i, true));

  // ---------------------------------------------------------------- garden bed details (backyard-1)
  const gpt = (t: number, off = 0) => {
    const ang = GARDEN.rot;
    const lx = t * GARDEN.rx;
    const lz = off;
    return [GARDEN.cx + lx * Math.cos(ang) - lz * Math.sin(ang), GARDEN.cz - (lx * Math.sin(ang) + lz * Math.cos(ang))] as [number, number];
  };
  const mNet = new THREE.MeshStandardMaterial({ map: T.netting(), alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.7 });
  const mStake = std('#3f6b3a');
  const plants = [-0.8, -0.5, -0.2, 0.1, 0.35, 0.6, 0.82];
  plants.forEach((t, i) => {
    const [x, z] = gpt(t, (i % 2 ? 0.25 : -0.2));
    bush(B, x, z, 0.32 + rng() * 0.15, 90 + i, false, 'shrub');
    addCircle(x, z, 0.25, 0, 1);
    if (i % 2 === 0) {
      // netting cage support
      const cyl = new THREE.CylinderGeometry(0.42, 0.45, 0.85, 12, 1, true);
      B.add(cyl, mNet, x, 0.45, z, 0, 0, 0, 1, 1, 1, false, false);
      for (let k = 0; k < 4; k++) B.add(new THREE.CylinderGeometry(0.012, 0.012, 0.95, 5), mStake, x + Math.cos(k * 1.57) * 0.43, 0.47, z + Math.sin(k * 1.57) * 0.43);
    }
  });
  // round wire hoop at the left end of the bed
  {
    const [x, z] = gpt(-0.95, 0.1);
    B.add(new THREE.TorusGeometry(0.38, 0.01, 6, 28), std('#2d2d2a', { metalness: 0.5 }), x, 0.42, z, 0, 0.6, 0);
  }
  // coiled hoses and sprinkler
  const mHose = std('#2f6e3b', { roughness: 0.5 });
  for (const [t, off] of [
    [-0.35, 0.55],
    [0.15, 0.6],
  ]) {
    const [x, z] = gpt(t, off);
    for (let k = 0; k < 3; k++) B.add(new THREE.TorusGeometry(0.22 + k * 0.05, 0.018, 6, 24), mHose, x, 0.03 + k * 0.012, z, Math.PI / 2, 0, 0, 1, 1, 1, true, true);
  }
  {
    const [x, z] = gpt(-0.25, 0.85);
    B.box(std('#2c5e33'), x, 0.06, z, 0.3, 0.11, 0.2);
    B.box(std('#a7a7a0', { metalness: 0.6 }), x, 0.14, z, 0.05, 0.08, 0.05);
  }
  // birdbath / plant stand (shallow terracotta dish on a stake)
  {
    const [x, z] = gpt(0.48, 0.45);
    B.add(new THREE.CylinderGeometry(0.012, 0.012, 0.9, 6), std('#262626'), x, 0.45, z);
    B.add(new THREE.CylinderGeometry(0.17, 0.12, 0.05, 20), std('#a65a35', { roughness: 0.7 }), x, 0.92, z);
    B.add(new THREE.CylinderGeometry(0.14, 0.14, 0.01, 20), std('#6f8a95', { roughness: 0.1 }), x, 0.94, z);
    addCircle(x, z, 0.05, 0, 1);
  }
  // solar stake lights
  for (const t of [-0.6, 0.0, 0.7]) {
    const [x, z] = gpt(t, -1.0);
    B.add(new THREE.CylinderGeometry(0.01, 0.01, 0.35, 5), std('#222'), x, 0.17, z);
    B.box(std('#222'), x, 0.37, z, 0.06, 0.05, 0.06);
  }

  // turquoise Adirondack-style chairs
  const mTurq = std('#2fc3b0', { roughness: 0.45 });
  for (const c of CHAIRS) {
    adirondack(B, mTurq, c.x, c.z, c.rot);
    addBox(c.x - 0.42, c.x + 0.42, c.z - 0.45, c.z + 0.45, 0, 1.0, false, 'chair');
  }

  // small blue/teal yard objects
  {
    // teal plastic sled/kiddie board lying on the lawn
    B.add(boxGeo(1.3, 0.03, 0.55), std('#3aa6b9', { roughness: 0.4 }), 8.4, 0.05, -18.4, 0.1, 0.25, 0.05);
    // blue tarp, crumpled at the left edge of the yard
    const tarp = new THREE.PlaneGeometry(1.8, 1.2, 10, 8);
    const pos = tarp.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 4) * 0.06 + Math.cos(pos.getY(i) * 5) * 0.05 + 0.06);
    tarp.computeVertexNormals();
    B.add(tarp, std('#2f64c9', { roughness: 0.5, side: THREE.DoubleSide }), -3.2, 0.04, -16.9, -Math.PI / 2, 0, 0.3);
    // teal hanging chair frame near the shed (backyard-2)
    B.add(new THREE.TorusGeometry(0.35, 0.02, 6, 24), std('#3cb6c7'), 11.2, 0.55, -17.2, 1.2, 0, 0);
    // tennis ball
    B.add(new THREE.SphereGeometry(0.035, 10, 8), std('#d6e84a'), 3.0, 0.035, -10.6);
  }

  // AC unit and trash cans
  // AC unit against the back wall by the corner nearest the shed (video), trash cans by the carport
  B.box(std('#c7c9c5', { metalness: 0.3, roughness: 0.5 }), 10.85, 0.45, -8.1, 0.85, 0.9, 0.85);
  B.add(new THREE.CylinderGeometry(0.3, 0.3, 0.02, 20), std('#333'), 10.85, 0.91, -8.1);
  addBox(10.4, 11.3, -8.55, -7.65, 0, 1, true, 'ac');
  B.add(new THREE.CylinderGeometry(0.32, 0.29, 1.05, 16), std('#2a2c2c'), -4.4, 0.53, 0.4);
  B.add(new THREE.CylinderGeometry(0.34, 0.34, 0.06, 16), std('#c45a2a'), -4.4, 1.08, 0.4);
  addCircle(-4.4, 0.4, 0.33);

  // wind chimes hanging from the oak's branch
  const chimes = new THREE.Group();
  chimes.position.set(OAK.x + 0.9, 2.6, OAK.z + 1.1);
  {
    const mBronze = std('#6b4a2a', { metalness: 0.7, roughness: 0.35 });
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.03, 16), std('#5a3e25'));
    chimes.add(top);
    const string = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.6), std('#ddd'));
    string.position.y = 0.3;
    chimes.add(string);
    for (let i = 0; i < 5; i++) {
      const l = 0.35 + i * 0.07;
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, l, 8), mBronze);
      tube.position.set(Math.cos(i * 1.25) * 0.07, -0.08 - l / 2, Math.sin(i * 1.25) * 0.07);
      tube.castShadow = true;
      chimes.add(tube);
    }
    const sail = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.015, 20), std('#5a3c22'));
    sail.rotation.x = Math.PI / 2;
    sail.position.y = -0.95;
    chimes.add(sail);
  }
  group.add(chimes);

  // ---------------------------------------------------------------- grass clumps (instanced)
  {
    const g = new THREE.PlaneGeometry(0.26, 0.13);
    g.translate(0, 0.065, 0);
    const g2 = g.clone().rotateY(Math.PI / 2);
    const m = mergeGeometries([g, g2])!;
    const mat = new THREE.MeshStandardMaterial({ map: T.grassBlade(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1 });
    const count = 5200;
    const inst = new THREE.InstancedMesh(m, mat, count);
    const M = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    let n = 0;
    let guard = 0;
    while (n < count && guard++ < count * 6) {
      const x = LOT.x0 + rng() * (LOT.x1 - LOT.x0);
      const z = LOT.z1 + rng() * (LOT.z0 - LOT.z1);
      if (inRect(x, z, HOUSE, 0.3) || inRect(x, z, ROOMS.laundry, 0.3) || inRect(x, z, DECK, 0.3) || inRect(x, z, CARPORT, 0.3)) continue;
      if (x > CARPORT.x0 && x < CARPORT.x1 && z > 0) continue;
      if (z > -1 && z < 2.2 && x > CARPORT.x1 && x < FRONT_DOOR.xc + 0.6) continue;
      if (x > -2.4 && x < 0.2 && z < -6 && z > -8.4) continue;
      if (inRect(x, z, { x0: SHED.x0, x1: SHED.x1, z0: SHED.z0, z1: SHED.z1 }, 0.2)) continue;
      const dx = (x - GARDEN.cx) / GARDEN.rx;
      const dz = (z - GARDEN.cz) / GARDEN.rz;
      if (dx * dx + dz * dz < 1) continue;
      if (Math.hypot(x - OAK.x - 0.3, z - OAK.z - 1.0) < 1.8 && rng() < 0.8) continue;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * Math.PI);
      const sc = 0.7 + rng() * 0.6;
      s.set(sc, sc * (0.6 + rng() * 0.6), sc);
      p.set(x, 0, z);
      M.compose(p, q, s);
      inst.setMatrixAt(n++, M);
    }
    inst.count = n;
    inst.receiveShadow = true;
    inst.frustumCulled = false;
    group.add(inst);
  }

  // ---------------------------------------------------------------- neighbours (backdrop)
  const neighbour = (x: number, z: number, w: number, d: number, wall: string, roof: string, ry = 0) => {
    const h = 2.8;
    B.add(boxGeo(w, h, d, 2), std(wall), x, h / 2, z, 0, ry, 0, 1, 1, 1, false, false);
    const r = new THREE.ConeGeometry(Math.max(w, d) * 0.72, 1.6, 4, 1);
    B.add(r, std(roof), x, h + 0.8, z, 0, ry + Math.PI / 4, 0, w / Math.max(w, d), 1, d / Math.max(w, d), false, false);
  };
  // (the house directly behind is built in detail in backlot.ts)
  // (the neighbourhood — Pete's house, the house behind, the streets — is built in neighborhood.ts/backlot.ts)
  void neighbour;

  B.build(group, 'yard-static');
  return { chimes, swayers };
}


// ------------------------------------------------------------------ props
export function tree(B: Batch, x: number, z: number, r: number, h: number, canopy: number, kind: 'oak' | 'magnolia' | 'myrtle', seed: number, collide: boolean) {
  const R = mulberry32(seed * 97 + 13);
  const mBark = texMat(T.bark(), 1, { roughness: 0.95 });
  const barkMat = sharedMat('bark', () => mBark);
  const leafMat = sharedMat('leaf' + kind, () => leafMaterial(kind, 3));
  const innerMat = sharedMat('inner' + kind, () => std(kind === 'magnolia' ? '#203d1c' : kind === 'myrtle' ? '#3a5a26' : '#2e4f1d', { roughness: 1 }));
  const trunkH = kind === 'myrtle' ? h * 0.5 : h * 0.45;
  if (kind === 'myrtle') {
    for (let i = 0; i < 4; i++) {
      const a = i * 1.6 + R();
      B.add(new THREE.CylinderGeometry(0.03, 0.06, trunkH * 1.2, 6), barkMat, x + Math.cos(a) * 0.12, trunkH * 0.55, z + Math.sin(a) * 0.12, Math.cos(a) * 0.25, 0, Math.sin(a) * 0.25);
    }
  } else if (seed === 1) {
    // the big backyard live oak: a massive low trunk that splits into two leaning trunks (from the video)
    const base = new THREE.CylinderGeometry(r * 0.95, r * 1.15, 1.9, 14, 3);
    const bu = base.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < bu.count; i++) bu.setXY(i, bu.getX(i) * 3, bu.getY(i) * 1.9);
    B.add(base, barkMat, x, 0.95, z);
    B.add(new THREE.CylinderGeometry(r * 1.15, r * 1.75, 0.4, 14), barkMat, x, 0.2, z);
    for (const sd of [-1, 1]) {
      const len = trunkH * 1.05;
      const lean = 0.42;
      const g = new THREE.CylinderGeometry(r * 0.5, r * 0.78, len, 12, 3);
      const gu = g.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < gu.count; i++) gu.setXY(i, gu.getX(i) * 2, gu.getY(i) * len);
      const dir = new THREE.Vector3(sd * Math.sin(lean), Math.cos(lean), sd * 0.25 * Math.sin(lean)).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      const m = new THREE.Matrix4().compose(new THREE.Vector3(x + dir.x * len * 0.5, 1.6 + dir.y * len * 0.5, z + dir.z * len * 0.5), q, new THREE.Vector3(1, 1, 1));
      B.addMatrix(g, barkMat, m);
    }
    // a boulder tucked against the trunk and two solar stake lights
    const rock = new THREE.IcosahedronGeometry(0.32, 1);
    B.add(rock, std('#8d877c', { roughness: 0.95 }), x + 0.15, 0.16, z + r + 0.2, 0.3, 0.5, 0, 1.2, 0.7, 1.0);
    for (const [dx, dz] of [
      [0.55, 0.62],
      [-0.7, 0.45],
    ]) {
      B.add(new THREE.CylinderGeometry(0.012, 0.012, 0.42, 5), std('#1e1e1e'), x + dx, 0.21, z + dz);
      B.add(new THREE.CylinderGeometry(0.035, 0.03, 0.1, 8), std('#e3a21a', { emissive: '#b8740a', emissiveIntensity: 0.6 }), x + dx, 0.45, z + dz);
    }
  } else {
    const trunk = new THREE.CylinderGeometry(r * 0.65, r * 1.1, trunkH, 12, 4);
    const uv = trunk.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2, uv.getY(i) * trunkH);
    B.add(trunk, barkMat, x, trunkH / 2, z);
    // root flare
    B.add(new THREE.CylinderGeometry(r * 1.1, r * 1.6, 0.35, 12), barkMat, x, 0.17, z);
  }
  if (collide) addCircle(x, z, kind === 'myrtle' ? 0.25 : seed === 1 ? r * 1.3 : r + 0.05);
  // branches
  const nb = kind === 'myrtle' ? 0 : 5;
  const tips: [number, number, number][] = [];
  for (let i = 0; i < nb; i++) {
    const a = (i / nb) * Math.PI * 2 + R() * 0.6;
    const len = canopy * (0.55 + R() * 0.3);
    const tilt = 0.7 + R() * 0.45;
    const bx = x + Math.cos(a) * len * Math.sin(tilt) * 0.5;
    const bz = z + Math.sin(a) * len * Math.sin(tilt) * 0.5;
    const by = trunkH + Math.cos(tilt) * len * 0.5 - 0.3;
    const g = new THREE.CylinderGeometry(r * 0.18, r * 0.5, len, 7);
    const m = new THREE.Matrix4();
    const dir = new THREE.Vector3(Math.cos(a) * Math.sin(tilt), Math.cos(tilt), Math.sin(a) * Math.sin(tilt));
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    m.compose(new THREE.Vector3(bx, by, bz), q, new THREE.Vector3(1, 1, 1));
    B.addMatrix(g, barkMat, m);
    tips.push([x + dir.x * len, trunkH - 0.3 + dir.y * len, z + dir.z * len]);
  }
  // foliage clusters
  const clusters = kind === 'myrtle' ? 5 : 16;
  for (let i = 0; i < clusters; i++) {
    let cx: number, cy: number, cz: number;
    if (tips.length && i < tips.length * 2) {
      const t = tips[i % tips.length];
      cx = t[0] + (R() - 0.5) * 1.2;
      cy = t[1] + (R() - 0.3) * 1.0;
      cz = t[2] + (R() - 0.5) * 1.2;
    } else {
      const a = R() * Math.PI * 2;
      const rr = R() * canopy * 0.6;
      cx = x + Math.cos(a) * rr;
      cz = z + Math.sin(a) * rr;
      cy = (kind === 'myrtle' ? h * 0.65 : trunkH + 1.2) + R() * (h - trunkH) * 0.6;
    }
    const s = (kind === 'myrtle' ? 0.7 : canopy * 0.22) * (0.8 + R() * 0.5);
    const sd = Math.floor(R() * 1000);
    B.add(lumpy(sd, 1), innerMat, cx, cy, cz, R(), R(), R(), s * 0.72, s * 0.58, s * 0.72, true, false);
    B.add(lumpy(sd + 1, 2), leafMat, cx, cy, cz, R() * 3, R() * 3, R() * 3, s, s * 0.82, s, true, true);
    B.add(lumpy(sd + 2, 2), leafMat, cx + s * 0.2, cy + s * 0.1, cz - s * 0.15, R() * 3, R() * 3, R() * 3, s * 0.88, s * 0.75, s * 0.88, false, true);
  }
}

function bush(B: Batch, x: number, z: number, r: number, seed: number, collide: boolean, kind: 'shrub' | 'oak' = 'shrub') {
  const R = mulberry32(seed * 31 + 7);
  const leafMat = sharedMat('leafb' + kind, () => leafMaterial(kind, 2));
  const innerMat = sharedMat('innerbush', () => std('#2c4a1d', { roughness: 1 }));
  for (let i = 0; i < 3; i++) {
    const s = r * (0.6 + R() * 0.4);
    const cx = x + (R() - 0.5) * r;
    const cz = z + (R() - 0.5) * r;
    const sd = Math.floor(R() * 1000);
    B.add(lumpy(sd, 1), innerMat, cx, s * 0.7, cz, 0, 0, 0, s * 0.78, s * 0.68, s * 0.78, true, false);
    B.add(lumpy(sd + 1, 2), leafMat, cx, s * 0.75, cz, R() * 3, R() * 3, 0, s, s * 0.85, s, true, true);
  }
  if (collide) addCircle(x, z, r * 0.8, 0, 1.5);
}

function leafMaterial(kind: 'oak' | 'magnolia' | 'shrub' | 'myrtle', rep: number) {
  const t = T.leaves(kind).clone();
  t.needsUpdate = true;
  t.repeat.set(rep * 2, rep);
  return new THREE.MeshStandardMaterial({ map: t, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.8 });
}

/** Lumpy foliage blob so clusters don't read as perfect spheres. */
function lumpy(seed: number, detail = 2) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const R = mulberry32(seed);
  const offs = [R(), R(), R()].map((v) => v * 10);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const n = 0.82 + 0.3 * Math.sin(x * 3.1 + offs[0]) * Math.sin(y * 2.7 + offs[1]) * Math.sin(z * 3.3 + offs[2]);
    pos.setXYZ(i, x * n, y * n, z * n);
  }
  g.computeVertexNormals();
  return g;
}

const matCache = new Map<string, THREE.Material>();
function sharedMat(key: string, make: () => THREE.Material) {
  let m = matCache.get(key);
  if (!m) {
    m = make();
    matCache.set(key, m);
  }
  return m;
}

function adirondack(B: Batch, mat: THREE.Material, x: number, z: number, rot: number) {
  // local frame: chair faces -z (toward the garden) after rotation
  const m = new THREE.Matrix4();
  const base = new THREE.Matrix4().makeRotationY(rot + Math.PI);
  base.setPosition(x, 0, z);
  const part = (geo: THREE.BufferGeometry, px: number, py: number, pz: number, rx = 0, ry = 0, rz = 0) => {
    const l = new THREE.Matrix4().compose(new THREE.Vector3(px, py, pz), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));
    m.multiplyMatrices(base, l);
    B.addMatrix(geo, mat, m);
  };
  // legs
  part(boxGeo(0.05, 0.42, 0.05), -0.3, 0.21, 0.3);
  part(boxGeo(0.05, 0.42, 0.05), 0.3, 0.21, 0.3);
  part(boxGeo(0.05, 0.5, 0.05), -0.3, 0.25, -0.15);
  part(boxGeo(0.05, 0.5, 0.05), 0.3, 0.25, -0.15);
  // seat slats sloping back
  for (let i = 0; i < 5; i++) part(boxGeo(0.62, 0.025, 0.09), 0, 0.36 - i * 0.02, 0.3 - i * 0.11, -0.18);
  // back slats fanning out, rounded tops
  for (let i = 0; i < 5; i++) {
    const a = (i - 2) * 0.1;
    part(boxGeo(0.1, 0.78, 0.025), (i - 2) * 0.12, 0.72, -0.32, -0.38, 0, -a);
  }
  part(boxGeo(0.62, 0.05, 0.03), 0, 0.62, -0.28, -0.38);
  // arms
  part(boxGeo(0.14, 0.03, 0.7), -0.36, 0.62, 0.1);
  part(boxGeo(0.14, 0.03, 0.7), 0.36, 0.62, 0.1);
  part(boxGeo(0.04, 0.24, 0.04), -0.36, 0.5, 0.38);
  part(boxGeo(0.04, 0.24, 0.04), 0.36, 0.5, 0.38);
}

function buildShed(B: Batch, group: THREE.Group) {
  // Long side runs front-to-back near the back-right corner of the house; its front faces the yard (west, -x).
  // North (far) part: weathered white block with a lean-to roof and a grilled window.
  // South (near-house) part: darker rough-sided extension with the light glazed door (with a pet door).
  const mWhite = texMat(T.shedWhite(), 1, { roughness: 0.95 });
  const mOSB = texMat(T.osb(), 1, { roughness: 1 });
  const mTrim = std('#e9e8e1');
  const mDark = std('#3a3936');
  const fx = SHED.x0; // front face
  const depth = SHED.x1 - SHED.x0;
  const cx = (SHED.x0 + SHED.x1) / 2;
  // white block (north part)
  const l1 = SHED.split - SHED.z1;
  const cz1 = (SHED.split + SHED.z1) / 2;
  B.add(boxGeo(depth, 2.35, l1, 2.2), mWhite, cx, 1.175, cz1);
  B.add(boxGeo(depth + 0.5, 0.07, l1 + 0.3, 2), std('#d9d9d4', { metalness: 0.3, roughness: 0.5 }), cx - 0.05, 2.48, cz1, 0, 0, -0.12);
  B.box(mTrim, fx - 0.25, 2.38, cz1, 0.04, 0.12, l1 + 0.3);
  // window with grille on the front
  B.box(mTrim, fx - 0.02, 1.55, cz1 + 0.3, 0.05, 0.7, 0.85);
  B.box(std('#1e2a2e', { roughness: 0.2 }), fx - 0.04, 1.55, cz1 + 0.3, 0.03, 0.58, 0.72);
  for (let k = 1; k < 4; k++) B.box(mTrim, fx - 0.06, 1.26 + k * 0.145, cz1 + 0.3, 0.02, 0.025, 0.72);
  // small sign
  B.box(std('#e5ecf2'), fx - 0.03, 1.55, cz1 - 0.6, 0.02, 0.16, 0.28);
  // darker extension (south part) with the glazed door near the split
  const l2 = SHED.z0 - SHED.split;
  const cz2 = (SHED.z0 + SHED.split) / 2;
  B.add(boxGeo(depth - 0.1, 2.3, l2, 1.5), mOSB, cx + 0.05, 1.15, cz2);
  B.box(mDark, cx, 2.33, cz2, depth + 0.1, 0.08, l2 + 0.15);
  const dz = SHED.split + 0.75;
  const ff = fx + 0.05;
  B.box(std('#efefe9', { roughness: 0.5 }), ff - 0.03, 1.03, dz, 0.05, 2.0, 0.82);
  B.box(std('#1b2428', { roughness: 0.15 }), ff - 0.06, 1.45, dz, 0.02, 0.85, 0.52);
  for (let k = 1; k < 3; k++) B.box(std('#efefe9'), ff - 0.075, 1.45, dz - 0.26 + k * 0.173, 0.02, 0.85, 0.025);
  for (let k = 1; k < 4; k++) B.box(std('#efefe9'), ff - 0.075, 1.025 + k * 0.212, dz, 0.02, 0.025, 0.52);
  B.box(std('#d8d2c2'), ff - 0.06, 0.25, dz, 0.03, 0.3, 0.24); // pet door
  // ladder leaning against the front where the two parts meet
  const mAl = std('#b9bab5', { metalness: 0.6, roughness: 0.4 });
  for (const off of [-0.18, 0.18]) B.add(boxGeo(0.06, 2.6, 0.04), mAl, fx - 0.35, 1.25, SHED.split + 0.2 + off, 0, 0, -0.18);
  for (let k = 0; k < 7; k++) B.add(boxGeo(0.04, 0.025, 0.36), mAl, fx - 0.53 + k * 0.06, 0.25 + k * 0.33, SHED.split + 0.2);
  addBox(SHED.x0, SHED.x1, SHED.z1, SHED.z0, 0, 2.5, true, 'shed');
  void group;
}
