import * as THREE from 'three';
import { Batch, boxGeo, std, texMat } from './build';
import * as T from './textures';
import * as D from './decortex';
import {
  CEIL, DECK, FLAP, FLOOR, FRONT_DOOR, HALL_BATH, HOLE, HOUSE, KITCHEN_DOOR, LAUNDRY_DOOR, MAIN_DOOR, RAMP, ROOMS, ROW, STAIRS, WALLS, WALL_T, addBox, roomAt, type WallDef,
} from './layout';

export interface HouseParts {
  group: THREE.Group;
  frontDoor: THREE.Object3D; // pivot, rotate y to open
  flap: THREE.Object3D; // pivot, rotate z to swing
  kitchenDoorMeshes: THREE.Mesh[]; // fadeable when the camera passes the doggy door
  holeEyes: THREE.Object3D;
  fan: THREE.Object3D;
  lights: THREE.Light[];
}

export function buildHouse(scene: THREE.Scene): HouseParts {
  const group = new THREE.Group();
  group.name = 'house';
  scene.add(group);
  const B = new Batch();

  // ---------------------------------------------------------------- materials
  const mPlaster = texMat(T.plaster('#efe5cf'), 1, { roughness: 0.95 });
  const mCeiling = texMat(T.plaster('#f6f2ea'), 1, { roughness: 1 });
  const mSiding = texMat(T.siding(), 1, { roughness: 0.75 });
  const mTrim = std('#f7f5ef', { roughness: 0.55 });
  const mShutter = std('#2c3431', { roughness: 0.6 });
  const mGlass = new THREE.MeshPhysicalMaterial({ color: '#b9d6e6', roughness: 0.05, metalness: 0, transparent: true, opacity: 0.22, depthWrite: false });
  const mHardwood = texMat(D.honeyOak(), 1, { roughness: 0.38 });
  const mKitchenFloor = texMat(D.encaustic('#6e6c67', '#e4e1d9'), 1, { roughness: 0.5 });
  const mLaundryFloor = texMat(D.encaustic('#8b8a84', '#ecebe5'), 1, { roughness: 0.55 });
  // per-room wall paint, as in the walkthrough video
  const paint = (hex: string) => texMat(T.plaster(hex), 1, { roughness: 0.92 });
  const roomPaint: Record<string, THREE.Material> = {
    kitchen: paint('#d5d8d7'),
    // V-groove board panelling painted cream, as on the navy accent wall
    dining: texMat(D.boards('#eadcc2', 'rgba(120,100,70,0.35)', 10), 1, { roughness: 0.85 }),
    living: texMat(D.boards('#ecdcc0', 'rgba(120,100,70,0.35)', 10), 1, { roughness: 0.85 }),
    hall: texMat(D.boards('#ece4d5', 'rgba(120,100,70,0.3)', 10), 1, { roughness: 0.85 }),
    mainBed: paint('#27324a'),
    spareBed: paint('#cdd0cf'),
    bath: texMat(D.bathWall(), 1, { roughness: 0.8 }),
    laundry: paint('#d2d5d6'),
  };
  const mNavyPanel = texMat(D.boards('#2a3550', 'rgba(10,14,25,0.75)', 10), 1, { roughness: 0.7 });
  const mAccentTrim = std('#c4472e', { roughness: 0.6 });
  const wallPaint = (w: WallDef, x: number, z: number) => {
    const room = roomAt(x, z);
    if (room === 'living' && w.axis === 'x' && Math.abs(w.fixed - ROW) < 0.01) return mNavyPanel;
    return roomPaint[room] ?? mPlaster;
  };
  const mRoof = texMat(T.shingles(), 1, { roughness: 0.9 });
  const mLattice = new THREE.MeshStandardMaterial({ map: T.lattice(), alphaTest: 0.5, roughness: 0.8, side: THREE.DoubleSide });
  const mVoid = std('#0b0a09', { roughness: 1 });
  const mDeck = texMat(T.deckWood(), 1, { roughness: 0.85 });
  const mDeckFrame = std('#806a4f', { roughness: 0.9 });
  const mBrick = std('#8f5141', { roughness: 0.95 });
  const mDoorWood = std('#6e4a2c', { roughness: 0.6 });

  // floors: uv scaled so the hardwood texture tiles in ~1.6 m repeats
  const floorUV = 1.6;
  for (const [name, r] of Object.entries(ROOMS)) {
    const w = r.x1 - r.x0;
    const d = r.z0 - r.z1;
    const tile = name === 'kitchen' || name === 'bath' || name === 'laundry';
    B.add(boxGeo(w, 0.06, d, tile ? 0.46 : floorUV), tile ? (name === 'laundry' ? mLaundryFloor : mKitchenFloor) : mHardwood, (r.x0 + r.x1) / 2, FLOOR - 0.03, (r.z0 + r.z1) / 2, 0, 0, 0, 1, 1, 1, false, true);
    const c = new THREE.Mesh(boxGeo(w, 0.04, d, 2), mCeiling);
    c.position.set((r.x0 + r.x1) / 2, CEIL + 0.02, (r.z0 + r.z1) / 2);
    c.receiveShadow = true;
    c.castShadow = true;
    group.add(c);
  }

  // ---------------------------------------------------------------- walls
  for (const w of WALLS) buildWall(B, w, mPlaster, mSiding, mTrim, mShutter, mGlass, wallPaint, mAccentTrim);

  // sill/rim board around the exterior at floor level
  const LX = ROOMS.laundry.x1;
  B.box(mTrim, (HOUSE.x0 + LX) / 2, FLOOR - 0.06, 0.07, LX + 0.2, 0.14, 0.04);
  B.box(mTrim, (HOUSE.x0 + HOUSE.x1) / 2, FLOOR - 0.06, HOUSE.z1 - 0.07, 12.3, 0.14, 0.04);
  B.box(mTrim, -0.07, FLOOR - 0.06, HOUSE.z1 / 2, 0.04, 0.14, 7.8);
  B.box(mTrim, 12.17, FLOOR - 0.06, (ROW + HOUSE.z1) / 2, 0.04, 0.14, -HOUSE.z1 + ROW + 0.1);
  B.box(mTrim, LX + 0.07, FLOOR - 0.06, ROW / 2, 0.04, 0.14, -ROW + 0.1);
  B.box(mTrim, (12.1 + LX) / 2, FLOOR - 0.06, ROW - 0.07, LX - 12.1 + 0.1, 0.14, 0.04);

  // corner boards
  for (const [x, z] of [
    [0, 0],
    [0, -7.6],
    [12.1, -7.6],
    [LX, 0],
    [LX, ROW],
    [12.1, ROW],
  ])
    B.box(mTrim, x, (FLOOR + CEIL) / 2, z, 0.16, CEIL - FLOOR + 0.1, 0.16);

  // ---------------------------------------------------------------- foundation: dark void + lattice skirt
  B.box(mVoid, HOUSE.x1 / 2, (FLOOR - 0.1) / 2, HOUSE.z1 / 2, HOUSE.x1 - 0.3, FLOOR - 0.1, -HOUSE.z1 - 0.3, 1, 0, false);
  B.box(mVoid, (12.0 + LX) / 2, (FLOOR - 0.1) / 2, ROW / 2, LX - 12.0 - 0.3, FLOOR - 0.1, -ROW - 0.3, 1, 0, false);
  const lh = FLOOR - 0.12;
  const latticeRun = (x0: number, z0: number, x1: number, z1: number, y0 = 0, h = lh) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const g = new THREE.PlaneGeometry(len, h);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * len) / 0.42, (uv.getY(i) * h) / 0.42);
    const ang = Math.atan2(-(z1 - z0), x1 - x0);
    B.add(g, mLattice, (x0 + x1) / 2, y0 + h / 2, (z0 + z1) / 2, 0, ang, 0, 1, 1, 1, false, true);
  };
  latticeRun(0, 0.02, LX, 0.02);
  latticeRun(LX + 0.02, 0, LX + 0.02, ROW);
  latticeRun(12.1, ROW - 0.02, LX, ROW - 0.02);
  latticeRun(12.12, ROW, 12.12, -7.6);
  latticeRun(-0.02, 0, -0.02, -7.6);
  // back wall with Babadook's hole
  const hz = HOLE.z - 0.02;
  latticeRun(0, hz, HOLE.x - HOLE.w / 2, hz);
  latticeRun(HOLE.x + HOLE.w / 2, hz, 12.1, hz);
  latticeRun(HOLE.x - HOLE.w / 2, hz, HOLE.x + HOLE.w / 2, hz, HOLE.h, lh - HOLE.h);
  // broken slats at the hole
  const mSlat = std('#e9e7de');
  B.add(boxGeo(0.03, 0.22, 0.015), mSlat, HOLE.x - 0.12, HOLE.h - 0.05, hz - 0.03, 0.2, 0, 0.7);
  B.add(boxGeo(0.03, 0.18, 0.015), mSlat, HOLE.x + 0.15, HOLE.h - 0.08, hz - 0.04, -0.3, 0, -0.9);
  B.add(boxGeo(0.03, 0.14, 0.015), mSlat, HOLE.x + 0.02, 0.05, hz - 0.12, 1.3, 0.4, 0.3);
  // lattice top trim
  B.box(mTrim, 7.2, lh + 0.02, 0.04, 14.5, 0.05, 0.05);
  B.box(mTrim, 6.05, lh + 0.02, HOUSE.z1 - 0.04, 12.2, 0.05, 0.05);

  // eyes in the hole (shown during peeks/ambush)
  const holeEyes = new THREE.Group();
  const eyeMat = new THREE.SpriteMaterial({ map: T.glowDot('255,200,60'), color: '#ffd24a', depthWrite: false, transparent: true });
  for (const dx of [-0.05, 0.05]) {
    const s = new THREE.Sprite(eyeMat);
    s.scale.set(0.07, 0.05, 1);
    s.position.set(HOLE.x + dx, 0.17, HOLE.z + 0.15);
    holeEyes.add(s);
  }
  holeEyes.visible = false;
  group.add(holeEyes);

  // ---------------------------------------------------------------- roof
  const ridgeZ = -3.8;
  const ridgeY = CEIL + 1.75;
  const eaveY = CEIL - 0.08;
  const roofSlope = (zEave: number) => {
    const dz = ridgeZ - zEave;
    const dy = ridgeY - eaveY;
    const len = Math.hypot(dz, dy);
    const ang = Math.atan2(dy, Math.abs(dz)) * (dz < 0 ? 1 : -1);
    const g = boxGeo(13.1, 0.08, len, 1.3);
    B.add(g, mRoof, 6.05, (ridgeY + eaveY) / 2, (ridgeZ + zEave) / 2, ang, 0, 0);
    // fascia
    B.box(mTrim, 6.05, eaveY - 0.08, zEave + (dz < 0 ? 0.02 : -0.02), 13.1, 0.16, 0.05);
  };
  roofSlope(0.5);
  roofSlope(-8.1);
  B.box(mRoof, 6.05, ridgeY + 0.04, ridgeZ, 13.15, 0.08, 0.22);
  // gable ends (siding triangles)
  for (const x of [-0.005, 12.105]) {
    const shape = new THREE.Shape();
    shape.moveTo(0.05, 0);
    shape.lineTo(-7.65, 0);
    shape.lineTo(ridgeZ, ridgeY - CEIL + 0.02);
    shape.closePath();
    const g = new THREE.ShapeGeometry(shape);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 1.8, uv.getY(i) / 1.8);
    B.add(g, mSiding, x, CEIL, 0, 0, x < 1 ? -Math.PI / 2 : Math.PI / 2, 0, 1, 1, x < 1 ? 1 : -1);
    // gable vent
    B.box(mTrim, x + (x < 1 ? -0.03 : 0.03), CEIL + 0.9, ridgeZ, 0.04, 0.5, 0.42);
    B.box(std('#3a3a36'), x + (x < 1 ? -0.05 : 0.05), CEIL + 0.9, ridgeZ, 0.02, 0.4, 0.32);
  }
  // laundry shed roof
  {
    // lean-to over the part of the laundry that sticks out past the spare bedroom
    const run = LX - 12.1 + 0.3;
    const len = Math.hypot(run, 0.25);
    B.add(boxGeo(len, 0.08, -ROW + 0.5, 1.3), mRoof, 12.1 + run / 2, CEIL + 0.1, ROW / 2, 0, 0, -Math.atan2(0.25, run));
  }

  // ---------------------------------------------------------------- deck, stairs, ramp
  const dw = DECK.x1 - DECK.x0;
  const dd = DECK.z0 - DECK.z1;
  const dcx = (DECK.x0 + DECK.x1) / 2;
  const dcz = (DECK.z0 + DECK.z1) / 2;
  B.add(boxGeo(dd, 0.05, dw, 1), mDeck, dcx, FLOOR - 0.025, dcz, 0, Math.PI / 2, 0, 1, 1, 1, true, true);
  B.box(mDeckFrame, dcx, FLOOR - 0.15, DECK.z0 - 0.02, dw, 0.2, 0.05);
  B.box(mDeckFrame, DECK.x0 + 0.02, FLOOR - 0.15, dcz, 0.05, 0.2, dd);
  // dark under-deck void behind lattice
  B.box(mVoid, dcx + 0.1, (FLOOR - 0.25) / 2, dcz, dw - 0.3, FLOOR - 0.25, dd - 0.3, 1, 0, false);
  latticeRun(DECK.x0 + 0.03, DECK.z0 - 0.03, DECK.x1, DECK.z0 - 0.03, 0, FLOOR - 0.25);
  latticeRun(DECK.x0 + 0.03, DECK.z0, DECK.x0 + 0.03, DECK.z1, 0, FLOOR - 0.25);
  latticeRun(DECK.x0 + 0.03, DECK.z1 + 0.03, STAIRS.x0 - 0.1, DECK.z1 + 0.03, 0, FLOOR - 0.25);
  B.box(mDeckFrame, (DECK.x0 + STAIRS.x0) / 2, FLOOR - 0.15, DECK.z1 + 0.02, STAIRS.x0 - DECK.x0, 0.2, 0.05);
  // railings: white-washed lattice panels between posts, with a wide flat cap that holds potted plants
  const railH = 0.92;
  const mRail = std('#9c917f', { roughness: 0.9 });
  const mCap = texMat(T.deckWood(), 1, { roughness: 0.9 });
  const railRun = (x0: number, z0: number, x1: number, z1: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const ang = Math.atan2(-(z1 - z0), x1 - x0);
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const ph = railH - 0.16;
    const g = new THREE.PlaneGeometry(len, ph);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * len) / 0.3, (uv.getY(i) * ph) / 0.3);
    B.add(g, mLattice, cx, FLOOR + 0.08 + ph / 2, cz, 0, ang, 0, 1, 1, 1, true, true);
    B.add(boxGeo(len, 0.04, 0.17, 1), mCap, cx, FLOOR + railH, cz, 0, ang, 0); // wide cap
    B.add(boxGeo(len, 0.06, 0.05), mRail, cx, FLOOR + railH - 0.06, cz, 0, ang, 0);
    B.add(boxGeo(len, 0.06, 0.05), mRail, cx, FLOOR + 0.06, cz, 0, ang, 0);
    const n = Math.max(1, Math.round(len / 1.4));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      B.box(mRail, x0 + (x1 - x0) * t, (FLOOR + railH) / 2, z0 + (z1 - z0) * t, 0.104, FLOOR + railH, 0.104);
    }
  };
  railRun(DECK.x0 + 0.03, DECK.z0, -0.06, DECK.z0);
  railRun(DECK.x0 + 0.03, DECK.z0, DECK.x0 + 0.03, DECK.z1);
  railRun(DECK.x0 + 0.03, DECK.z1, STAIRS.x0 - 0.07, DECK.z1);
  // stairs (descend toward the backyard)
  const sw = RAMP.x0 - STAIRS.x0;
  const scx = (STAIRS.x0 + RAMP.x0) / 2;
  for (let k = 0; k < STAIRS.steps; k++) {
    const h = FLOOR - ((k + 1) * FLOOR) / (STAIRS.steps + 1);
    const z0 = STAIRS.zTop - STAIRS.run * k;
    B.add(boxGeo(sw, 0.045, STAIRS.run + 0.03, 1), mDeck, scx, h - 0.022, z0 - STAIRS.run / 2, 0, 0, 0);
    B.box(mDeckFrame, scx, h - 0.1, z0 - STAIRS.run + 0.01, sw, 0.15, 0.03); // riser
  }
  const zBot = STAIRS.zTop - STAIRS.run * STAIRS.steps;
  // stringers
  for (const x of [STAIRS.x0 + 0.02, RAMP.x0 - 0.02]) {
    const len = Math.hypot(STAIRS.zTop - zBot, FLOOR);
    B.add(boxGeo(0.05, 0.22, len + 0.1), mDeckFrame, x, FLOOR / 2 - 0.08, (STAIRS.zTop + zBot) / 2, -Math.atan2(FLOOR, STAIRS.zTop - zBot), 0, 0);
  }
  // stair handrail on the outer side
  {
    const len = Math.hypot(STAIRS.zTop - zBot, FLOOR);
    B.add(boxGeo(0.06, 0.05, len + 0.2), mDeckFrame, STAIRS.x0 - 0.07, FLOOR / 2 + railH, (STAIRS.zTop + zBot) / 2, -Math.atan2(FLOOR, STAIRS.zTop - zBot), 0, 0);
    B.box(mDeckFrame, STAIRS.x0 - 0.07, railH / 2 + 0.05, zBot + 0.05, 0.08, railH + 0.1, 0.08);
    B.box(mDeckFrame, STAIRS.x0 - 0.07, (FLOOR + railH) / 2, STAIRS.zTop, 0.08, FLOOR + railH, 0.08);
  }
  // the pet ramp: ~20% of stair width on the right when descending, extending past the bottom step
  {
    const rw = RAMP.x1 - RAMP.x0;
    const dz = RAMP.zTop - RAMP.zBottom;
    const len = Math.hypot(dz, FLOOR);
    const ang = -Math.atan2(FLOOR, dz);
    const cx = (RAMP.x0 + RAMP.x1) / 2;
    const cz = (RAMP.zTop + RAMP.zBottom) / 2;
    B.add(boxGeo(rw, 0.035, len, 0.8), texMat(T.fabric('#56704a', 51), 1, { roughness: 1 }), cx, FLOOR / 2 - 0.01, cz, ang, Math.PI, 0);
    const n = 9;
    for (let i = 1; i < n; i++) {
      const t = i / n;
      B.add(boxGeo(rw - 0.04, 0.02, 0.03), mDeckFrame, cx, FLOOR * (1 - t) + 0.012, RAMP.zTop - dz * t, ang, 0, 0);
    }
    B.box(mDeckFrame, RAMP.x1 + 0.02, FLOOR / 2 + 0.02, cz, 0.03, 0.08, len, 1, ang); // edge board
    B.add(boxGeo(0.04, 0.07, len), mDeckFrame, RAMP.x1 + 0.02, FLOOR / 2 + 0.03, cz, ang, 0, 0);
  }

  // ---------------------------------------------------------------- front stoop + porch roof
  // wooden front steps with simple railings
  for (let k = 0; k < 3; k++) {
    const h = FLOOR - ((k + 1) * FLOOR) / 4;
    B.add(boxGeo(1.5, 0.045, 0.32, 1), mDeck, FRONT_DOOR.xc, h - 0.022, 0.15 + k * 0.3, 0, Math.PI / 2 * 0, 0);
    B.box(mDeckFrame, FRONT_DOOR.xc, (h - 0.045) / 2, 0.15 + k * 0.3, 1.46, h - 0.045, 0.3);
  }
  for (const s of [-1, 1]) {
    const x = FRONT_DOOR.xc + s * 0.78;
    B.box(mDeckFrame, x, (FLOOR + 0.9) / 2, 0.86, 0.08, FLOOR + 0.9, 0.08);
    const len = Math.hypot(0.85, FLOOR);
    B.add(boxGeo(0.06, 0.05, len), mDeckFrame, x, FLOOR / 2 + 0.9, 0.45, Math.atan2(FLOOR, 0.85), 0, 0);
    for (let k = 1; k < 5; k++) B.box(mDeckFrame, x, (FLOOR * (1 - k / 5) + 0.9) / 2 + 0.03, (k / 5) * 0.85, 0.03, FLOOR * (1 - k / 5) + 0.85, 0.03);
  }
  void mBrick;
  B.box(mTrim, FRONT_DOOR.xc - 0.85, (FLOOR + CEIL) / 2 + 0.1, 0.95, 0.1, CEIL - 0.1, 0.1);
  B.box(mTrim, FRONT_DOOR.xc + 0.85, (FLOOR + CEIL) / 2 + 0.1, 0.95, 0.1, CEIL - 0.1, 0.1);
  for (const s of [-1, 1]) {
    B.add(boxGeo(1.05, 0.06, 1.3, 1.3), mRoof, FRONT_DOOR.xc + s * 0.48, CEIL + 0.25, 0.55, 0, 0, s * -0.5);
  }

  // ---------------------------------------------------------------- doors
  // Front door (pivot at hinge, leaf extends +x, opens inward with +rotation)
  const frontDoor = new THREE.Group();
  frontDoor.position.set(FRONT_DOOR.xc - FRONT_DOOR.w / 2, FLOOR, 0);
  {
    // black six-panel door with a half-moon leaded glass light at the top (from the video)
    const mBlackDoor = std('#1c1d1f', { roughness: 0.42 });
    const leaf = new THREE.Mesh(boxGeo(FRONT_DOOR.w, 2.03, 0.05), mBlackDoor);
    leaf.position.set(FRONT_DOOR.w / 2, 1.015, 0);
    leaf.castShadow = true;
    frontDoor.add(leaf);
    const panelMat = std('#232427', { roughness: 0.4 });
    for (const [px, py, ph] of [
      [0.25, 0.32, 0.42],
      [0.67, 0.32, 0.42],
      [0.25, 0.95, 0.6],
      [0.67, 0.95, 0.6],
      [0.25, 1.45, 0.24],
      [0.67, 1.45, 0.24],
    ]) {
      const p = new THREE.Mesh(boxGeo(0.3, ph, 0.066), panelMat);
      p.position.set(px, py, 0);
      frontDoor.add(p);
    }
    // half-moon light: dark leading over amber/clear glass
    const arcGlass = new THREE.MeshStandardMaterial({ color: '#c9b98f', emissive: '#4a3a1a', emissiveIntensity: 0.25, roughness: 0.15, metalness: 0.1, side: THREE.DoubleSide });
    const lead = std('#151515', { roughness: 0.5, side: THREE.DoubleSide });
    for (const sz of [-1, 1]) {
      const half = new THREE.Mesh(new THREE.CircleGeometry(0.33, 28, 0, Math.PI), arcGlass);
      half.position.set(0.46, 1.62, sz * 0.03);
      frontDoor.add(half);
      // leading: radiating spokes and an inner arc
      for (let k = 1; k < 6; k++) {
        const a = (k / 6) * Math.PI;
        const sp = new THREE.Mesh(boxGeo(0.33, 0.012, 0.004), lead);
        sp.position.set(0.46 + Math.cos(a) * 0.165, 1.62 + Math.sin(a) * 0.165, sz * 0.04);
        sp.rotation.z = a;
        frontDoor.add(sp);
      }
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.008, 6, 20, Math.PI), lead);
      ring.position.set(0.46, 1.62, sz * 0.04);
      frontDoor.add(ring);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.335, 0.014, 6, 28, Math.PI), lead);
      rim.position.set(0.46, 1.62, sz * 0.042);
      frontDoor.add(rim);
    }
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), std('#b8955a', { metalness: 0.8, roughness: 0.3 }));
    knob.position.set(0.82, 1.0, -0.06);
    frontDoor.add(knob);
    const knob2 = knob.clone();
    knob2.position.z = 0.06;
    frontDoor.add(knob2);
  }
  group.add(frontDoor);

  // Kitchen exterior door with the dog flap (wall at x=0, door spans z)
  const kitchenDoorMeshes: THREE.Mesh[] = [];
  const kz0 = KITCHEN_DOOR.zc - KITCHEN_DOOR.w / 2;
  const fz0 = FLAP.zc - FLAP.w / 2;
  const fz1 = FLAP.zc + FLAP.w / 2;
  const kz1 = KITCHEN_DOOR.zc + KITCHEN_DOOR.w / 2;
  const doorMat = std('#f2f0e8', { roughness: 0.5, transparent: true, opacity: 1 });
  const addDoorPiece = (z0: number, z1: number, y0: number, y1: number, mat: THREE.Material) => {
    const m = new THREE.Mesh(boxGeo(0.05, y1 - y0, z1 - z0), mat);
    m.position.set(0, FLOOR + (y0 + y1) / 2, (z0 + z1) / 2);
    m.castShadow = true;
    group.add(m);
    kitchenDoorMeshes.push(m);
  };
  addDoorPiece(kz0, fz0, 0, 2.03, doorMat);
  addDoorPiece(fz1, kz1, 0, 2.03, doorMat);
  addDoorPiece(fz0, fz1, FLAP.h + 0.04, 1.15, doorMat);
  addDoorPiece(fz0, fz1, 1.75, 2.03, doorMat);
  const gl = new THREE.Mesh(boxGeo(0.03, 0.6, FLAP.w), mGlass);
  gl.position.set(0, FLOOR + 1.45, FLAP.zc);
  group.add(gl);
  // gray curtain hung over the door's window on the kitchen side
  {
    const cm = texMat(T.fabric('#8d8c88', 41), 1, { side: THREE.DoubleSide, transparent: true, opacity: 1 });
    const cw = KITCHEN_DOOR.w - 0.16;
    const g = new THREE.PlaneGeometry(cw, 0.95, 24, 1);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 46) * 0.012 + 0.012);
    g.computeVertexNormals();
    const cur = new THREE.Mesh(g, cm);
    cur.rotation.y = Math.PI / 2;
    cur.position.set(0.05, FLOOR + 1.5, KITCHEN_DOOR.zc);
    cur.castShadow = true;
    group.add(cur);
    kitchenDoorMeshes.push(cur);
    const crod = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, cw + 0.1), std('#3a3a3a', { transparent: true }));
    crod.rotation.x = Math.PI / 2;
    crod.position.set(0.07, FLOOR + 1.98, KITCHEN_DOOR.zc);
    group.add(crod);
    kitchenDoorMeshes.push(crod);
  }
  // flap frame (dark plastic)
  const frameMat = std('#2b2a28', { roughness: 0.5 });
  B.box(frameMat, 0, FLOOR + FLAP.h + 0.02, FLAP.zc, 0.09, 0.05, FLAP.w + 0.06);
  B.box(frameMat, 0, FLOOR + FLAP.h / 2, fz0 - 0.012, 0.09, FLAP.h, 0.03);
  B.box(frameMat, 0, FLOOR + FLAP.h / 2, fz1 + 0.012, 0.09, FLAP.h, 0.03);
  B.box(frameMat, 0, FLOOR + 0.01, FLAP.zc, 0.09, 0.03, FLAP.w + 0.06);
  const flap = new THREE.Group();
  flap.position.set(0, FLOOR + FLAP.h, FLAP.zc);
  const flapPanel = new THREE.Mesh(boxGeo(0.015, FLAP.h - 0.03, FLAP.w - 0.02), new THREE.MeshStandardMaterial({ color: '#6d6a5e', roughness: 0.3, transparent: true, opacity: 0.85 }));
  flapPanel.position.y = -(FLAP.h - 0.03) / 2;
  flapPanel.castShadow = true;
  flap.add(flapPanel);
  group.add(flap);
  // porch light by the kitchen door
  B.box(std('#222'), -0.06, FLOOR + 1.9, KITCHEN_DOOR.zc + 0.62, 0.08, 0.22, 0.14);
  B.box(std('#f6e7b6', { emissive: '#f6d98a', emissiveIntensity: 0.3 }), -0.11, FLOOR + 1.88, KITCHEN_DOOR.zc + 0.62, 0.05, 0.14, 0.1);

  // interior doors standing open
  const mWhiteDoor = std('#f4f2ec', { roughness: 0.5 });
  const leaf = (x: number, z: number, along: 'x' | 'z', len: number, mat: THREE.Material = mWhiteDoor) => {
    const w = along === 'x' ? len : 0.04;
    const d = along === 'z' ? len : 0.04;
    B.box(mat, x, FLOOR + 1.01, z, w, 2.02, d);
    // raised panels on both faces (two-panel interior doors)
    for (const s of [-1, 1])
      for (const [py, ph] of [
        [0.55, 0.7],
        [1.45, 0.75],
      ]) {
        const pw = len - 0.22;
        if (along === 'x') B.box(mat, x, FLOOR + py, z + s * 0.022, pw, ph, 0.012);
        else B.box(mat, x + s * 0.022, FLOOR + py, z, 0.012, ph, pw);
      }
    addBox(x - w / 2, x + w / 2, z - d / 2, z + d / 2, 0, CEIL, false, 'doorleaf');
  };
  void mDoorWood;
  leaf(MAIN_DOOR.xc + MAIN_DOOR.w / 2 + 0.01, ROW - 0.07 - 0.4, 'z', 0.8); // kitchen -> main bedroom (swung into the bedroom)
  leaf(4.5 - 0.07 - 0.39, -4.75 + 0.41 - 0.015, 'x', 0.78); // hall -> main bedroom
  leaf(8.0 + 0.07 + 0.39, -4.75 + 0.41 - 0.015, 'x', 0.78); // spare bedroom
  leaf(5.85 - 0.36 - 0.035, HALL_BATH - 0.07 - 0.36, 'z', 0.72); // bath
  // laundry: teal door with three tall panes of leafy window film
  {
    const x = LAUNDRY_DOOR.x + 0.41;
    const z = LAUNDRY_DOOR.zc + LAUNDRY_DOOR.w / 2 + 0.02;
    const mTeal = std('#1f5c5a', { roughness: 0.55 });
    const mFilm = new THREE.MeshStandardMaterial({ map: D.leafFilm(), roughness: 0.2, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
    // frame around the glass
    B.box(mTeal, x, FLOOR + 0.3, z, 0.78, 0.6, 0.045);
    B.box(mTeal, x, FLOOR + 1.98, z, 0.78, 0.08, 0.045);
    B.box(mTeal, x - 0.35, FLOOR + 1.29, z, 0.08, 1.38, 0.045);
    B.box(mTeal, x + 0.35, FLOOR + 1.29, z, 0.08, 1.38, 0.045);
    for (const dx of [-0.105, 0.105]) B.box(mTeal, x + dx, FLOOR + 1.29, z, 0.04, 1.38, 0.045);
    const film = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 1.38), mFilm);
    film.position.set(x, FLOOR + 1.29, z);
    group.add(film);
    const k = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), std('#3b3b3b', { metalness: 0.7, roughness: 0.35 }));
    k.position.set(x + 0.3, FLOOR + 0.98, z + 0.04);
    group.add(k);
    addBox(x - 0.39, x + 0.39, z - 0.025, z + 0.025, 0, CEIL, false, 'doorleaf');
  }

  const lights: THREE.Light[] = [];
  const addLight = (x: number, z: number, intensity: number) => {
    const l = new THREE.PointLight('#ffe2b8', intensity, 7.5, 1.6);
    l.position.set(x, CEIL - 0.35, z);
    group.add(l);
    lights.push(l);
  };
  addLight(1.4, -1.9, 4.5);
  addLight(4.8, -1.9, 4.5);
  addLight(8.75, -1.9, 6);
  addLight(6.25, -4.8, 3);
  addLight(2.2, -5.8, 2.5);
  addLight(10.0, -5.8, 2.5);

  // ceiling fan in the living room
  const fan = new THREE.Group();
  fan.position.set(8.75, CEIL - 0.32, -1.95);
  const mFan = std('#1f1d1b', { roughness: 0.55 });
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.09, 0.14, 16), std('#2a2826', { metalness: 0.5, roughness: 0.4 }));
  fan.add(hub);
  for (let i = 0; i < 5; i++) {
    const blade = new THREE.Mesh(boxGeo(0.62, 0.012, 0.13), mFan);
    blade.position.set(Math.cos((i * Math.PI * 2) / 5) * 0.42, -0.02, Math.sin((i * Math.PI * 2) / 5) * 0.42);
    blade.rotation.y = -(i * Math.PI * 2) / 5;
    fan.add(blade);
  }
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.3), hub.material);
  rod.position.y = 0.2;
  group.add(fan);
  const rodM = rod.clone();
  rodM.position.set(8.75, CEIL - 0.15, -1.95);
  group.add(rodM);

  B.build(group, 'house-static');
  return { group, frontDoor, flap, kitchenDoorMeshes, holeEyes, fan, lights };
}

/** Box whose side faces use world-space UVs: u = metres along the wall / 2, v = height above the floor / wall height. */
function wallGeo(axis: 'x' | 'z', len: number, h: number, thick: number, along0: number, y0: number) {
  const g = axis === 'x' ? new THREE.BoxGeometry(len, h, thick) : new THREE.BoxGeometry(thick, h, len);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const nrm = g.attributes.normal as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const a = along0 + (axis === 'x' ? pos.getX(i) : pos.getZ(i));
    const y = y0 + pos.getY(i);
    // keep the pattern un-mirrored as seen from either side
    const flip = axis === 'x' ? (nrm.getZ(i) < 0 ? -1 : 1) : nrm.getX(i) > 0 ? -1 : 1;
    uv.setXY(i, (a * flip) / 2, (y - FLOOR) / (CEIL - FLOOR));
  }
  return g;
}

function buildWall(B: Batch, w: WallDef, mPlaster: THREE.Material, mSiding: THREE.Material, mTrim: THREE.Material, mShutter: THREE.Material, mGlass: THREE.Material,
  paintAt: (w: WallDef, x: number, z: number) => THREE.Material, mAccent: THREE.Material) {
  const H = w.height;
  const T2 = WALL_T;
  const pieces: { a: number; b: number; y0: number; y1: number }[] = [];
  const ops = [...w.openings].map((o) => ({ ...o, a: Math.min(o.a, o.b), b: Math.max(o.a, o.b) })).sort((p, q) => p.a - q.a);
  let cur = w.from;
  for (const o of ops) {
    if (o.a > cur) pieces.push({ a: cur, b: o.a, y0: 0, y1: H });
    if (o.bottom > 0) pieces.push({ a: o.a, b: o.b, y0: 0, y1: o.bottom });
    if (o.top < H) pieces.push({ a: o.a, b: o.b, y0: o.top, y1: H });
    cur = o.b;
  }
  if (cur < w.to) pieces.push({ a: cur, b: w.to, y0: 0, y1: H });

  const place = (a: number, b: number, y0: number, y1: number, thick: number, offset: number, mat: THREE.Material, uv: number) => {
    const len = b - a;
    const c = (a + b) / 2;
    const cy = w.base + (y0 + y1) / 2;
    if (w.axis === 'x') B.add(boxGeo(len, y1 - y0, thick, uv), mat, c, cy, w.fixed + offset);
    else B.add(boxGeo(thick, y1 - y0, len, uv), mat, w.fixed + offset, cy, c);
  };
  const splits = w.axis === 'x' ? [2.8, 4.5, 6.8, 8.0, 10.7, 12.1] : [ROW, HALL_BATH];
  for (const p of pieces) {
    // core: two half-thickness slabs so each face takes the paint of the room it faces
    const cuts = [p.a, ...splits.filter((s) => s > p.a + 1e-4 && s < p.b - 1e-4), p.b];
    for (let k = 0; k + 1 < cuts.length; k++) {
      const a = cuts[k];
      const b = cuts[k + 1];
      const mid = (a + b) / 2;
      const cy = w.base + (p.y0 + p.y1) / 2;
      for (const sd of [-1, 1]) {
        const off = sd * (T2 / 4);
        const px = w.axis === 'x' ? mid : w.fixed + sd * 0.3;
        const pz = w.axis === 'x' ? w.fixed + sd * 0.3 : mid;
        const outdoorSide = w.exterior && w.outward === sd;
        const mat = outdoorSide ? mPlaster : paintAt(w, px, pz);
        const g = wallGeo(w.axis, b - a, p.y1 - p.y0, T2 / 2, mid, cy);
        if (w.axis === 'x') B.add(g, mat, mid, cy, w.fixed + off);
        else B.add(g, mat, w.fixed + off, cy, mid);
      }
    }
    if (w.exterior && w.outward) place(p.a, p.b, p.y0 - (p.y0 === 0 ? 0.1 : 0), p.y1, 0.025, w.outward * (T2 / 2 + 0.012), mSiding, 1.8);
  }
  // baseboards on both sides
  let cur2 = w.from;
  const runs: [number, number][] = [];
  for (const o of ops) {
    if (o.kind === 'window') continue;
    if (o.a > cur2) runs.push([cur2, o.a]);
    cur2 = o.b;
  }
  if (cur2 < w.to) runs.push([cur2, w.to]);
  for (const [a, b] of runs)
    for (const s of w.exterior && w.outward ? [-w.outward] : [-1, 1]) place(a, b, 0, 0.1, 0.02, s * (T2 / 2 + 0.01), mTrim, 1);

  // trims, glass, shutters
  for (const o of ops) {
    const len = o.b - o.a;
    const c = (o.a + o.b) / 2;
    const frame = (along: number, alongLen: number, y: number, h: number, depth: number) => {
      if (w.axis === 'x') B.add(boxGeo(alongLen, h, depth), mTrim, along, w.base + y, w.fixed);
      else B.add(boxGeo(depth, h, alongLen), mTrim, w.fixed, w.base + y, along);
    };
    const depth = T2 + 0.06;
    if (o.kind === 'window') {
      // trims overlap the opening by a few mm so they never share a plane with the wall's jambs (no flicker)
      frame(c, len + 0.12, o.top + 0.037, 0.086, depth);
      frame(c, len + 0.16, o.bottom - 0.02, 0.06, depth + 0.06);
      frame(o.a - 0.027, 0.066, (o.bottom + o.top) / 2, o.top - o.bottom, depth);
      frame(o.b + 0.027, 0.066, (o.bottom + o.top) / 2, o.top - o.bottom, depth);
      // sashes
      frame(c, len, (o.bottom + o.top) / 2, 0.05, 0.05);
      frame(c, 0.03, (o.bottom + o.top) / 2, o.top - o.bottom, 0.04);
      const gy = w.base + (o.bottom + o.top) / 2;
      if (w.axis === 'x') B.add(boxGeo(len, o.top - o.bottom, 0.01), mGlass, c, gy, w.fixed, 0, 0, 0, 1, 1, 1, false, false);
      else B.add(boxGeo(0.01, o.top - o.bottom, len), mGlass, w.fixed, gy, c, 0, 0, 0, 1, 1, 1, false, false);
      if (w.exterior && w.outward && len > 0.6) {
        const off = w.outward * (T2 / 2 + 0.04);
        const sh = o.top - o.bottom + 0.1;
        for (const sx of [o.a - 0.26, o.b + 0.26]) {
          if (w.axis === 'x') B.add(boxGeo(0.4, sh, 0.035, 1), mShutter, sx, gy, w.fixed + off);
          else B.add(boxGeo(0.035, sh, 0.4, 1), mShutter, w.fixed + off, gy, sx);
          // louvre lines
          for (let k = 0; k < 9; k++) {
            const ly = w.base + o.bottom + 0.1 + (k * (sh - 0.25)) / 8;
            if (w.axis === 'x') B.add(boxGeo(0.34, 0.015, 0.05), mShutter, sx, ly, w.fixed + off, 0, 0, 0);
            else B.add(boxGeo(0.05, 0.015, 0.34), mShutter, w.fixed + off, ly, sx);
          }
        }
      }
    } else if (o.kind === 'open' && w.axis === 'z' && Math.abs(w.fixed - 6.8) < 0.01) {
      // the painted red-orange casing and pilasters around the dining -> living opening
      const acc = (along: number, alongLen: number, y: number, h: number, dp: number) => B.add(boxGeo(dp, h, alongLen), mAccent, w.fixed, w.base + y, along);
      acc(c, len + 0.5, o.top + 0.077, 0.166, depth + 0.02);
      acc(o.a - 0.114, 0.252, o.top / 2, o.top, depth + 0.02);
      acc(o.b + 0.114, 0.252, o.top / 2, o.top, depth + 0.02);
    } else {
      // door casing on both faces
      frame(c, len + 0.16, o.top + 0.047, 0.106, depth);
      frame(o.a - 0.037, 0.086, o.top / 2, o.top, depth);
      frame(o.b + 0.037, 0.086, o.top / 2, o.top, depth);
    }
  }
}
