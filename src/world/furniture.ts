// Interior furnishing, rebuilt from the owner's walkthrough video (October 2026). The floor plan is the
// sketch-derived one in layout.ts; the furniture, colours and textures follow the video room by room.
import * as THREE from 'three';
import { boxGeo, decal, std, texMat } from './build';
import * as T from './textures';
import * as D from './decortex';
import { BASKET, CEIL, FLOOR, FRONT_DOOR, HALL_OPEN, ROW, addBox, addCircle } from './layout';

export interface Fadeable {
  obj: THREE.Object3D;
  mats: THREE.Material[];
  opacity: number;
}

export interface ChaosProp {
  obj: THREE.Object3D;
  stage: number; // delivered-wildlife count needed
  from: { p: THREE.Vector3; r: THREE.Euler };
  to: { p: THREE.Vector3; r: THREE.Euler };
  t: number;
  show?: boolean; // hidden until stage (e.g. spilled soil)
}

export interface Interior {
  fadeables: Fadeable[];
  basket: THREE.Group;
  basketTop: number;
  stickPile: THREE.Group;
  napSpots: Record<'couch' | 'armchair' | 'dogbed', { x: number; y: number; z: number; rot: number }>;
  chaos: ChaosProp[];
  perches: THREE.Vector3[]; // spots on furniture where delivered birds can perch
}

const UP = new THREE.Vector3(0, 1, 0);

export function buildInterior(scene: THREE.Scene): Interior {
  const fadeables: Fadeable[] = [];
  const chaos: ChaosProp[] = [];
  const perches: THREE.Vector3[] = [];
  const P = (x: number, y: number, z: number) => perches.push(new THREE.Vector3(x, FLOOR + y, z));

  /** A furniture group standing on the floor. Fadeable pieces turn see-through when they block the camera. */
  const piece = (x: number, z: number, ry = 0, fade = true, y = FLOOR) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = ry;
    scene.add(g);
    if (fade) fadeables.push({ obj: g, mats: [], opacity: 1 });
    return g;
  };
  const mesh = (g: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, shadow = true) => {
    // walk up to the fadeable root so its materials can be faded
    let root: THREE.Object3D | null = g;
    let f: Fadeable | undefined;
    while (root && !(f = fadeables.find((q) => q.obj === root))) root = root.parent;
    const own = f ? mat.clone() : mat;
    const m = new THREE.Mesh(geo, own);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    // tiny props skip the shadow pass (saves draw calls; their shadows are invisible indoors anyway)
    if (!geo.boundingSphere) geo.computeBoundingSphere();
    m.castShadow = shadow && geo.boundingSphere!.radius > 0.12;
    m.receiveShadow = true;
    g.add(m);
    if (f) f.mats.push(own);
    return m;
  };
  /** Flat floor covering (rugs, mats) — polygon-offset so it never flickers against the floor. */
  const floorDecal = (map: THREE.Texture | null, color: string, w: number, d: number, x: number, z: number, ry = 0, round = false) => {
    const mat = decal(new THREE.MeshStandardMaterial({ map, color: map ? '#ffffff' : color, roughness: 1 }));
    const geo = round ? new THREE.CircleGeometry(w / 2, 48) : new THREE.PlaneGeometry(w, d);
    const m = new THREE.Mesh(geo, mat);
    m.rotation.set(-Math.PI / 2, 0, ry);
    m.position.set(x, FLOOR + 0.0075, z);
    m.receiveShadow = true;
    scene.add(m);
    // a thin rug body so edges read as fabric, not paint
    if (!round) {
      const edge = new THREE.Mesh(boxGeo(w, 0.005, d), std(color, { roughness: 1 }));
      edge.rotation.y = ry;
      edge.position.set(x, FLOOR + 0.0025, z);
      edge.receiveShadow = true;
      scene.add(edge);
    }
    return m;
  };

  // ---------------------------------------------------------------- shared materials
  const mEspresso = std('#2e2119', { roughness: 0.5 });
  const mUpperWood = std('#8e5f33', { roughness: 0.55 });
  const mWhiteTop = std('#f1efea', { roughness: 0.25 });
  const mWhite = std('#f3f2ee', { roughness: 0.45 });
  const mSteel = std('#cfd2d4', { metalness: 0.35, roughness: 0.32 });
  const mBlackGloss = std('#141414', { roughness: 0.25 });
  const mBlackMatte = std('#1b1b1b', { roughness: 0.7 });
  const mDarkWood = std('#33241a', { roughness: 0.5 });
  const mMidWood = std('#7c5634', { roughness: 0.55 });
  const mPot = std('#1e1e1e', { roughness: 0.6 });

  // ---------------------------------------------------------------- reusable builders
  const leafGeo = (() => {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.bezierCurveTo(0.45, 0.25, 0.4, 0.75, 0, 1);
    s.bezierCurveTo(-0.4, 0.75, -0.45, 0.25, 0, 0);
    const g = new THREE.ShapeGeometry(s, 6);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const x = pos.getX(i);
      pos.setZ(i, -y * y * 0.35 + Math.abs(x) * 0.25); // arched, slightly cupped
    }
    g.computeVertexNormals();
    return g;
  })();
  const strapGeo = (() => {
    const g = new THREE.PlaneGeometry(0.12, 1, 1, 6);
    g.translate(0, 0.5, 0);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      pos.setX(i, pos.getX(i) * (1 - y * 0.6));
      pos.setZ(i, -y * y * 0.4);
    }
    g.computeVertexNormals();
    return g;
  })();
  const leafMats = ['#2f6b2d', '#3b7d33', '#285c27', '#4c8a3a'].map((c) => std(c, { roughness: 0.6, side: THREE.DoubleSide }));
  /** Potted house plant: 'broad' (philodendron / peace lily) or 'strap' (spider/snake-style strap leaves). */
  const plant = (parent: THREE.Object3D, x: number, y: number, z: number, size: number, kind: 'broad' | 'strap', potColor = '#1e1e1e', seed = 1) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    const pr = size * 0.22;
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(pr, pr * 0.78, pr * 1.6, 20), potColor === '#1e1e1e' ? mPot : std(potColor, { roughness: 0.5 }));
    pot.position.y = pr * 0.8;
    pot.castShadow = true;
    g.add(pot);
    const soil = new THREE.Mesh(new THREE.CircleGeometry(pr * 0.95, 16), std('#3a2a1e'));
    soil.rotation.x = -Math.PI / 2;
    soil.position.y = pr * 1.5;
    g.add(soil);
    let r = seed * 9301 + 49297;
    const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
    const n = kind === 'broad' ? 11 : 16;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd() * 0.5;
      const tilt = 0.25 + rnd() * (kind === 'broad' ? 0.9 : 0.6);
      const len = size * (kind === 'broad' ? 0.42 + rnd() * 0.25 : 0.7 + rnd() * 0.5);
      const leaf = new THREE.Mesh(kind === 'broad' ? leafGeo : strapGeo, leafMats[Math.floor(rnd() * leafMats.length)]);
      const stemH = kind === 'broad' ? size * (0.25 + rnd() * 0.45) : pr * 1.4;
      leaf.position.set(Math.cos(a) * pr * 0.3, stemH, Math.sin(a) * pr * 0.3);
      leaf.scale.setScalar(len);
      leaf.rotation.set(0, -a - Math.PI / 2, 0, 'YXZ');
      leaf.rotateX(-tilt);
      leaf.castShadow = true;
      g.add(leaf);
      if (kind === 'broad') {
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.008, stemH - pr), leafMats[2]);
        stem.position.set(Math.cos(a) * pr * 0.15, pr + (stemH - pr) / 2, Math.sin(a) * pr * 0.15);
        g.add(stem);
      }
    }
    return g;
  };
  /** Gathered curtain panel hanging in the plane of a wall. */
  const curtainPanel = (mat: THREE.Material, w: number, h: number, folds: number) => {
    const g = new THREE.PlaneGeometry(w, h, Math.max(8, folds * 4), 4);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      pos.setZ(i, Math.sin((x / w) * folds * Math.PI * 2) * 0.03 * (1 + (0.5 - y / h) * 0.6));
    }
    g.computeVertexNormals();
    return new THREE.Mesh(g, mat);
  };
  /** Window dressing on a wall: side curtains, a bamboo roman shade or white blinds, and a rod.
   *  axis = which world axis the wall runs along; fixed = wall position; inward = room side (+1/-1). */
  const dressWindow = (axis: 'x' | 'z', fixed: number, inward: 1 | -1, a: number, b: number, bottom: number, top: number, curtain: THREE.Material | null, shade: 'bamboo' | 'blinds' | null, shadeDrop = 0.45) => {
    const rotY = axis === 'x' ? (inward > 0 ? 0 : Math.PI) : inward > 0 ? Math.PI / 2 : -Math.PI / 2;
    const at = (o: THREE.Object3D, along: number, y: number, depth: number) => {
      if (axis === 'x') o.position.set(along, FLOOR + y, fixed + inward * depth);
      else o.position.set(fixed + inward * depth, FLOOR + y, along);
      scene.add(o);
      return o;
    };
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const w = hi - lo;
    const c = (lo + hi) / 2;
    if (shade) {
      const mat = shade === 'bamboo' ? texMat(D.bamboo(), 1, { roughness: 0.85 }) : texMat(D.blinds(), 1, { roughness: 0.6 });
      const drop = shade === 'blinds' ? top - bottom - 0.02 : shadeDrop;
      mat.map!.repeat.set(1, shade === 'blinds' ? drop * 12 : drop * 3);
      const sh = new THREE.Mesh(boxGeo(w + 0.04, drop, 0.02), mat);
      sh.rotation.y = rotY;
      sh.castShadow = true;
      at(sh, c, top - drop / 2, 0.115);
      if (shade === 'bamboo')
        for (let k = 0; k < 2; k++) {
          const f = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, w + 0.04, 8), mat);
          f.rotation.set(0, rotY, Math.PI / 2);
          at(f, c, top - drop + 0.03 + k * 0.08, 0.125);
        }
    }
    if (curtain) {
      const ch = top + 0.23;
      for (const sx of [lo - 0.22, hi + 0.22]) {
        const cp = curtainPanel(curtain, 0.48, ch, 3);
        cp.rotation.y = rotY;
        cp.castShadow = true;
        at(cp, sx, ch / 2 + 0.02, 0.17);
      }
      const rodMat = std('#2a2a2a', { metalness: 0.6, roughness: 0.4 });
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, w + 1.1), rodMat);
      rod.rotation.set(0, rotY, Math.PI / 2);
      at(rod, c, ch + 0.04, 0.17);
      for (const ex of [lo - 0.56, hi + 0.56]) at(new THREE.Mesh(new THREE.SphereGeometry(0.025, 10, 8), rodMat), ex, ch + 0.04, 0.17);
    }
  };
  /** Framed picture hung on a wall (ry faces the room). */
  const art = (x: number, y: number, z: number, ry: number, w: number, h: number, draw: (ctx: CanvasRenderingContext2D, W: number, H: number) => void, frame = '#d9d4c8') => {
    const g = new THREE.Group();
    g.position.set(x, FLOOR + y, z);
    g.rotation.y = ry;
    const cv = document.createElement('canvas');
    cv.width = 128;
    cv.height = Math.round((128 * h) / w);
    const ctx = cv.getContext('2d')!;
    draw(ctx, cv.width, cv.height);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    const fr = new THREE.Mesh(boxGeo(w + 0.08, h + 0.08, 0.03), std(frame, { roughness: 0.5 }));
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 }));
    pic.position.z = 0.0165;
    g.add(fr, pic);
    scene.add(g);
    return g;
  };

  // ======================================================================== LIVING ROOM (x 6.8–10.7)
  // couch against the west half of the navy panelled back wall (TV is on the east wall, laundry door beside it)
  {
    const mCouch = texMat(T.fabric('#6a645d', 2), 1, { roughness: 0.92 });
    const CX = 8.0;
    const CZ = ROW + 0.06 + 0.37;
    const g = piece(CX, CZ);
    mesh(g, boxGeo(2.0, 0.25, 0.7, 0.6), mCouch, 0, 0.2, 0);
    for (const sx of [-0.48, 0.48]) mesh(g, roundedCushion(0.94, 0.15, 0.6), mCouch, sx, 0.4, 0.04);
    for (const sx of [-0.48, 0.48]) mesh(g, roundedCushion(0.92, 0.42, 0.18), mCouch, sx, 0.66, -0.24, -0.15);
    mesh(g, boxGeo(2.0, 0.55, 0.14, 0.6), mCouch, 0, 0.55, -0.3, -0.1);
    for (const sx of [-0.95, 0.95]) mesh(g, roundedCushion(0.17, 0.42, 0.7), mCouch, sx, 0.43, 0);
    for (const sx of [-0.92, 0.92]) for (const sz of [-0.29, 0.29]) mesh(g, new THREE.CylinderGeometry(0.025, 0.018, 0.08), mDarkWood, sx, 0.04, sz);
    // crocheted throw over one arm
    mesh(g, roundedCushion(0.4, 0.05, 0.7), texMat(T.fabric('#b9a37e', 19), 1), 0.86, 0.66, 0.02, 0, 0, -0.25);
    addBox(CX - 1.0, CX + 1.0, CZ - 0.37, CZ + 0.36, FLOOR - 0.1, FLOOR + 0.95, true, 'couch');
    P(CX - 0.55, 0.86, CZ - 0.29);
    P(CX + 0.65, 0.86, CZ - 0.29);
    P(CX + 0.95, 0.66, CZ - 0.01);
    const pillow = mesh(g, roundedCushion(0.4, 0.13, 0.38), texMat(T.fabric('#d39b2c', 5), 1), -0.68, 0.64, -0.1, -0.95, 0, 0.2);
    chaos.push(makeChaos(pillow, 2, new THREE.Vector3(-0.17, -0.545, 0.82), new THREE.Euler(0.1, 1.2, 0.1)));
    const pillow2 = mesh(g, roundedCushion(0.4, 0.13, 0.38), texMat(T.fabric('#1f6e74', 6), 1), 0.68, 0.64, -0.1, -0.95, 0, -0.15);
    chaos.push(makeChaos(pillow2, 5, new THREE.Vector3(0.32, -0.565, 0.91), new THREE.Euler(0.05, -0.6, 0.0)));
  }
  // coffee table (pets can walk under it)
  {
    const TX = 8.0;
    const TZ = -2.82;
    const g = piece(TX, TZ);
    mesh(g, boxGeo(1.0, 0.04, 0.5), mDarkWood, 0, 0.42, 0);
    mesh(g, boxGeo(0.92, 0.03, 0.42), mDarkWood, 0, 0.12, 0);
    for (const sx of [-0.45, 0.45])
      for (const sz of [-0.2, 0.2]) {
        mesh(g, boxGeo(0.04, 0.42, 0.04), mDarkWood, sx, 0.21, sz);
        addCircle(TX + sx, TZ + sz, 0.04, FLOOR - 0.1, FLOOR + 0.45);
      }
    const mag = mesh(g, boxGeo(0.28, 0.01, 0.2), std('#c44c3a'), 0.2, 0.445, 0.05, 0, 0.3, 0);
    chaos.push(makeChaos(mag, 3, new THREE.Vector3(0.75, -0.43, 0.55), new THREE.Euler(0, 1.4, 0)));
    const remote = mesh(g, boxGeo(0.05, 0.02, 0.17), mBlackMatte, -0.25, 0.45, 0, 0, 0.4, 0);
    chaos.push(makeChaos(remote, 6, new THREE.Vector3(-0.8, -0.44, 0.9), new THREE.Euler(0, -1.0, 0)));
    mesh(g, new THREE.CylinderGeometry(0.06, 0.06, 0.12, 14), std('#e9d8a6', { emissive: '#6b5420', emissiveIntensity: 0.3 }), -0.05, 0.5, -0.1);
    P(TX - 0.3, 0.45, TZ);
  }
  // TV on a dark console with woven basket drawers, against the right wall
  {
    const g = piece(10.7 - 0.06 - 0.21, -3.05, -Math.PI / 2);
    mesh(g, boxGeo(1.45, 0.62, 0.42), std('#24201c', { roughness: 0.55 }), 0, 0.33, 0);
    const mBasket = texMat(D.rattan('#a77b45'), 1, { roughness: 0.9 });
    for (const sx of [-0.48, 0, 0.48]) mesh(g, boxGeo(0.4, 0.26, 0.02), mBasket, sx, 0.2, 0.215);
    for (const sx of [-0.72, 0.72]) mesh(g, boxGeo(0.04, 0.04, 0.38), mDarkWood, sx, 0.02, 0);
    mesh(g, boxGeo(1.25, 0.72, 0.04), mBlackGloss, 0, 1.08, -0.06);
    mesh(g, new THREE.PlaneGeometry(1.19, 0.66), std('#0d1117', { roughness: 0.15, metalness: 0.3 }), 0, 1.08, -0.035);
    mesh(g, boxGeo(0.32, 0.03, 0.2), mBlackMatte, 0, 0.66, -0.06);
    mesh(g, boxGeo(0.06, 0.04, 0.06), mBlackMatte, 0, 0.7, -0.06);
    // small bowl and a speaker on the console
    mesh(g, new THREE.SphereGeometry(0.07, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), std('#ddd6c8'), 0.55, 0.64, 0.08, Math.PI);
    addBox(10.2, 10.66, -3.84, -2.28, FLOOR - 0.1, FLOOR + 1.45, true, 'tv');
    P(10.45, 0.64, -2.5);
    P(10.5, 1.45, -3.05);
  }
  // back-left corner: little floating shelf with a basket, tall dark urn and a floor plant (from the video)
  {
    const g = piece(9.45, ROW + 0.32, 0, false);
    plant(g, 0.47, 0, 0.0, 0.95, 'strap', '#1e1e1e', 3);
    const urn = new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(0.05, 0), new THREE.Vector2(0.11, 0.12), new THREE.Vector2(0.12, 0.3), new THREE.Vector2(0.06, 0.48), new THREE.Vector2(0.08, 0.58), new THREE.Vector2(0.05, 0.62)], 18), std('#2a1d17', { roughness: 0.35 }));
    urn.position.set(0.0, 0, -0.1);
    urn.castShadow = true;
    g.add(urn);
    addCircle(9.92, ROW + 0.32, 0.22, FLOOR - 0.1, FLOOR + 1.2);
    addCircle(9.45, ROW + 0.22, 0.13, FLOOR - 0.1, FLOOR + 0.7);
    const shelf = new THREE.Group();
    shelf.position.set(9.45, FLOOR + 1.15, ROW + 0.16);
    scene.add(shelf);
    mesh(shelf, boxGeo(0.42, 0.03, 0.2), mDarkWood, 0, 0, 0);
    mesh(shelf, boxGeo(0.28, 0.18, 0.17), texMat(D.rattan('#9d7444'), 1), 0, 0.105, 0);
    P(9.45, 1.36, ROW + 0.16);
  }
  // table lamp on the front end of the TV console (tips over with enough chaos)
  {
    const g = piece(10.43, -2.5);
    const lamp = new THREE.Group();
    lamp.position.set(0, 0.64, 0);
    g.add(lamp);
    const base = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 12), std('#c9b37e', { roughness: 0.35 }));
    base.position.y = 0.1;
    lamp.add(base);
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.15, 0.18, 18, 1, true), std('#f2ead8', { side: THREE.DoubleSide, emissive: '#6b5530', emissiveIntensity: 0.45 }));
    shade.position.y = 0.32;
    lamp.add(shade);
    chaos.push(makeChaos(lamp, 4, new THREE.Vector3(-0.05, 0, 0), new THREE.Euler(0.0, 0, 0.32)));
  }
  // two cream cat trees with pink pads in front of the front window
  const catTree = (x: number, z: number, tall: boolean, ry: number) => {
    const g = piece(x, z, ry);
    const mCarpet = texMat(T.fabric('#e8dcc0', 23), 1, { roughness: 1 });
    const mSisal = texMat(D.rattan('#cdb589'), 1, { roughness: 1 });
    const mPink = texMat(T.fabric('#e9a2a7', 24), 1, { roughness: 1 });
    mesh(g, boxGeo(0.5, 0.05, 0.42), mCarpet, 0, 0.025, 0);
    const posts: [number, number, number][] = tall
      ? [
          [-0.14, 0.12, 0.62],
          [0.14, -0.1, 1.05],
          [-0.1, -0.12, 1.32],
        ]
      : [
          [-0.12, 0.1, 0.48],
          [0.13, -0.08, 0.9],
        ];
    for (const [px, pz, h] of posts) {
      const p = mesh(g, new THREE.CylinderGeometry(0.045, 0.045, h, 12), mSisal, px, h / 2, pz);
      (p.material as THREE.MeshStandardMaterial).map!.repeat.set(2, h * 6);
    }
    // condo box with a round door
    mesh(g, boxGeo(0.34, 0.3, 0.32), mCarpet, 0.06, 0.32, 0.02);
    mesh(g, new THREE.CircleGeometry(0.08, 16), std('#5a4f3e'), 0.06, 0.32, 0.181);
    // platforms with pink pads, top perch and a dangling pom-pom
    const plats: [number, number, number][] = tall
      ? [
          [-0.14, 0.12, 0.64],
          [0.14, -0.1, 1.07],
          [-0.1, -0.12, 1.34],
        ]
      : [
          [-0.12, 0.1, 0.5],
          [0.13, -0.08, 0.92],
        ];
    for (const [px, pz, h] of plats) {
      mesh(g, new THREE.CylinderGeometry(0.17, 0.17, 0.035, 20), mCarpet, px, h, pz);
      mesh(g, new THREE.CylinderGeometry(0.15, 0.15, 0.02, 20), mPink, px, h + 0.025, pz);
      P(x + px, h + 0.04, z + pz);
    }
    const [tx, tz, th] = plats[plats.length - 1];
    const toyLine = mesh(g, new THREE.CylinderGeometry(0.003, 0.003, 0.22), mWhite, tx + 0.13, th - 0.12, tz, 0, 0, 0, false);
    void toyLine;
    mesh(g, new THREE.SphereGeometry(0.03, 10, 8), std('#e9c84b'), tx + 0.13, th - 0.24, tz);
    addBox(x - 0.27, x + 0.27, z - 0.23, z + 0.23, FLOOR - 0.1, FLOOR + (tall ? 1.4 : 1.0), true, 'cattree');
    return { top: FLOOR + th + 0.04, tx: x + tx, tz: z + tz };
  };
  const tree1 = catTree(8.85, -0.48, true, 0);
  catTree(9.62, -0.52, false, 0.2);
  // black tiered plant stand with plants, under the rattan sunburst mirror (right wall, front corner)
  {
    const g = piece(10.7 - 0.06 - 0.25, -0.6, -Math.PI / 2); // deepest tier stops just short of the wall
    for (const [y, dz] of [
      [0.25, 0.14],
      [0.55, 0.0],
      [0.85, -0.14],
    ])
      mesh(g, boxGeo(0.7, 0.025, 0.2), mBlackMatte, 0, y, dz);
    // thin black metal legs for each stepped tier
    for (const sx of [-0.34, 0.34])
      for (const [h, dz] of [
        [0.25, 0.22],
        [0.55, 0.09],
        [0.85, -0.05],
        [0.85, -0.22],
      ])
        mesh(g, boxGeo(0.018, h, 0.018), mBlackMatte, sx, h / 2, dz);
    plant(g, -0.2, 0.26, 0.14, 0.5, 'broad', '#c46a3d', 4);
    plant(g, 0.18, 0.26, 0.14, 0.42, 'strap', '#e8e2d6', 5);
    plant(g, 0.0, 0.56, 0.0, 0.5, 'broad', '#1e1e1e', 6);
    plant(g, 0.12, 0.86, -0.14, 0.62, 'strap', '#1e1e1e', 7);
    const ball = mesh(g, new THREE.SphereGeometry(0.06, 16, 12), std('#b4307a', { metalness: 0.6, roughness: 0.2 }), -0.22, 0.92, -0.14);
    void ball;
    addBox(10.3, 10.66, -0.98, -0.22, FLOOR - 0.1, FLOOR + 1.2, true, 'plantstand');
    P(10.55, 0.9, -0.42);
  }
  // rattan sunburst mirror
  {
    const g = new THREE.Group();
    g.position.set(10.7 - 0.07, FLOOR + 1.72, -0.6);
    g.rotation.y = -Math.PI / 2;
    scene.add(g);
    const mR = texMat(D.rattan('#b0703e'), 1, { roughness: 0.8 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.05, 8, 28), mR);
    g.add(ring);
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2;
      const loop = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.012, 6, 14), mR);
      loop.position.set(Math.cos(a) * 0.33, Math.sin(a) * 0.33, 0);
      loop.rotation.z = a;
      loop.scale.set(1.4, 0.8, 1);
      g.add(loop);
    }
    const glass = new THREE.Mesh(new THREE.CircleGeometry(0.2, 28), std('#c9d5d8', { metalness: 0.9, roughness: 0.08 }));
    glass.position.z = 0.012;
    g.add(glass);
  }
  // lime-green crinkle cat tunnel on the floor
  {
    const g = piece(9.8, -1.25, -0.2);
    const tun = new THREE.CylinderGeometry(0.15, 0.15, 0.9, 20, 12, true);
    const pos = tun.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const s = 1 + Math.sin(pos.getY(i) * 70) * 0.04;
      pos.setX(i, pos.getX(i) * s);
      pos.setZ(i, pos.getZ(i) * s);
    }
    tun.computeVertexNormals();
    mesh(g, tun, texMat(D.crinkle(), 1, { side: THREE.DoubleSide, roughness: 0.45 }), 0, 0.15, 0, 0, 0, Math.PI / 2);
    for (const u of [-0.38, 0, 0.38]) addCircle(9.8 + Math.cos(-0.2) * u, -1.25 - Math.sin(-0.2) * u, 0.16, FLOOR - 0.1, FLOOR + 0.3);
  }
  // woven pendant light near the front window
  {
    const g = new THREE.Group();
    g.position.set(9.2, CEIL - 0.62, -1.0);
    scene.add(g);
    const shade = new THREE.Mesh(new THREE.SphereGeometry(0.22, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), texMat(D.rattan('#c79a5c'), 1, { side: THREE.DoubleSide, emissive: '#5a3b10', emissiveIntensity: 0.35 }));
    g.add(shade);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffe0a0' }));
    bulb.position.y = 0.05;
    g.add(bulb);
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.42), mBlackMatte);
    cord.position.y = 0.42;
    g.add(cord);
  }
  // Penny's round tan plush bed: in the dining room, in front of the window by the speaker (video)
  const DOGBED = { x: 5.85, z: -0.62 };
  {
    const g = piece(DOGBED.x, DOGBED.z, 0, false);
    const mPlush = texMat(T.fabric('#b49a7e', 11), 1, { roughness: 1 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.11, 12, 28), mPlush);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.1;
    ring.castShadow = ring.receiveShadow = true;
    g.add(ring);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.07, 24), texMat(T.fabric('#c9b39a', 12), 1, { roughness: 1 }));
    pad.position.y = 0.045;
    pad.receiveShadow = true;
    g.add(pad);
    addCircle(DOGBED.x, DOGBED.z, 0.42, FLOOR - 0.1, FLOOR + 0.3);
  }
  // big floor plant by the front door corner of the dining opening wall (tips over with enough chaos)
  {
    const g = new THREE.Group();
    g.position.set(7.02, FLOOR, -0.98);
    scene.add(g);
    plant(g, 0, 0, 0, 1.05, 'broad', '#c46a3d', 9);
    chaos.push(makeChaos(g, 7, new THREE.Vector3(0.12, 0.13, -0.1), new THREE.Euler(1.35, -0.6, 0)));
    const spill = new THREE.Mesh(new THREE.CircleGeometry(0.32, 16), decal(std('#4a3526', { roughness: 1 })));
    spill.rotation.x = -Math.PI / 2;
    spill.position.set(7.3, FLOOR + 0.008, -1.15);
    spill.scale.set(1.3, 0.8, 1);
    spill.visible = false;
    scene.add(spill);
    chaos.push({ obj: spill, stage: 7, from: { p: spill.position.clone(), r: spill.rotation.clone() }, to: { p: spill.position.clone(), r: spill.rotation.clone() }, t: 0, show: true });
    addCircle(7.02, -0.98, 0.22, FLOOR - 0.1, FLOOR + 0.8);
  }
  // toilet-paper trail appears with enough chaos (stolen from the bathroom, naturally)
  {
    const tp = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 2.2), decal(std('#fbfbf8', { side: THREE.DoubleSide }), 1.5));
    tp.rotation.set(-Math.PI / 2, 0, 0.9);
    tp.position.set(8.9, FLOOR + 0.012, -1.3);
    tp.visible = false;
    scene.add(tp);
    chaos.push({ obj: tp, stage: 9, from: { p: tp.position.clone(), r: tp.rotation.clone() }, to: { p: tp.position.clone(), r: tp.rotation.clone() }, t: 0, show: true });
    const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.1, 14), std('#fbfbf8'));
    roll.rotation.z = Math.PI / 2;
    roll.position.set(9.85, FLOOR + 0.055, -0.75);
    roll.visible = false;
    scene.add(roll);
    chaos.push({ obj: roll, stage: 9, from: { p: roll.position.clone(), r: roll.rotation.clone() }, to: { p: roll.position.clone(), r: roll.rotation.clone() }, t: 0, show: true });
  }
  // rugs: big multicolour vintage rug under the basket, colourful rug at the front door
  floorDecal(D.persianRug({ field: '#d9c7ad', border: '#3e5f86', border2: '#c96d4f', accent: ['#e08f6d', '#5a83a8', '#e6b98a', '#8aa7c2'], medallion: '#7ea0c1', seed: 21, wear: 0.4 }), '#c9b79c', 1.9, 2.7, 8.6, -1.95, Math.PI / 2);
  floorDecal(D.persianRug({ field: '#2f4f7a', border: '#b0412f', border2: '#e3b25c', accent: ['#e07a3a', '#6fb0c9', '#f0d07a', '#c33b5a'], medallion: '#d26a3c', seed: 22, wear: 0.15 }, 512, 768), '#2f4f7a', 0.62, 0.95, FRONT_DOOR.xc, -0.55, Math.PI / 2);
  // wall art above the couch (on the navy panelling) and in the dining room
  {
    const a1 = art(8.0, 1.62, ROW + 0.06 + 0.017, 0, 0.95, 0.62, (ctx, W, H) => {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#f2d7a8');
      g.addColorStop(1, '#e7a874');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#2c3b5a';
      ctx.beginPath();
      ctx.moveTo(0, H * 0.75);
      ctx.lineTo(W * 0.3, H * 0.35);
      ctx.lineTo(W * 0.55, H * 0.7);
      ctx.lineTo(W * 0.78, H * 0.45);
      ctx.lineTo(W, H * 0.75);
      ctx.lineTo(W, H);
      ctx.lineTo(0, H);
      ctx.fill();
      ctx.fillStyle = '#f4f1e8';
      ctx.beginPath();
      ctx.arc(W * 0.72, H * 0.25, H * 0.1, 0, Math.PI * 2);
      ctx.fill();
    }, '#e9e3d6');
    chaos.push(makeChaos(a1, 8, new THREE.Vector3(0, 0, 0), new THREE.Euler(0, 0, 0.18), true));
  }

  // ======================================================================== TOY BASKET (small wicker, a few dog toys)
  const basket = new THREE.Group();
  basket.position.set(BASKET.x, FLOOR, BASKET.z);
  scene.add(basket);
  const basketTop = 0.24;
  {
    const wick = texMat(T.wicker(), 1, { roughness: 0.9, side: THREE.DoubleSide });
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.28, basketTop, 28, 1, true), wick);
    (wall.material as THREE.MeshStandardMaterial).map!.repeat.set(5, 1);
    wall.position.y = basketTop / 2;
    wall.castShadow = true;
    wall.receiveShadow = true;
    basket.add(wall);
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.28, 24), wick);
    bottom.rotation.x = -Math.PI / 2;
    bottom.position.y = 0.02;
    basket.add(bottom);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.022, 8, 32), std('#7d5a33'));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = basketTop;
    basket.add(rim);
    for (const s of [-1, 1]) {
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.015, 6, 12, Math.PI), std('#7d5a33'));
      handle.position.set(s * 0.34, basketTop - 0.02, 0);
      handle.rotation.y = Math.PI / 2;
      basket.add(handle);
    }
    const rope = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.03, 8, 16), std('#d13f3f', { roughness: 0.9 }));
    rope.position.set(-0.08, 0.17, 0.05);
    rope.rotation.set(1.2, 0.3, 0);
    basket.add(rope);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.065, 16, 12), std('#2f7fd6', { roughness: 0.4 }));
    ball.position.set(0.12, 0.2, -0.06);
    basket.add(ball);
    const bone = new THREE.Group();
    const bm = std('#f1d45a', { roughness: 0.4 });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.2, 8), bm);
    shaft.rotation.z = Math.PI / 2;
    bone.add(shaft);
    for (const s of [-1, 1])
      for (const t of [-1, 1]) {
        const k = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), bm);
        k.position.set(s * 0.1, 0, t * 0.03);
        bone.add(k);
      }
    bone.position.set(0.02, 0.24, 0.1);
    bone.rotation.set(0.4, 0.8, 0.5);
    basket.add(bone);
    addCircle(BASKET.x, BASKET.z, 0.3, FLOOR - 0.1, FLOOR + 0.3);
  }
  const stickPile = new THREE.Group();
  stickPile.position.set(BASKET.x - 0.55, FLOOR, BASKET.z + 0.35);
  scene.add(stickPile);

  // ======================================================================== DINING ROOM (x 2.8–6.8)
  // round table with the colourful mandala tablecloth
  {
    const cx = 4.35;
    const cz = -1.33;
    const g = piece(cx, cz);
    const mCloth = texMat(D.mandala(), 1, { roughness: 0.85, side: THREE.DoubleSide });
    mesh(g, new THREE.CylinderGeometry(0.56, 0.56, 0.02, 40), mCloth, 0, 0.765, 0);
    // draped skirt with soft folds
    const skirt = new THREE.CylinderGeometry(0.565, 0.66, 0.46, 40, 3, true);
    const pos = skirt.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const a = Math.atan2(pos.getZ(i), pos.getX(i));
      const t = (0.23 - pos.getY(i)) / 0.46;
      const k = 1 + Math.sin(a * 9) * 0.035 * t;
      pos.setX(i, pos.getX(i) * k);
      pos.setZ(i, pos.getZ(i) * k);
    }
    skirt.computeVertexNormals();
    mesh(g, skirt, mCloth, 0, 0.54, 0);
    // everyday clutter: candle jar, handbag, papers, a mug
    mesh(g, new THREE.CylinderGeometry(0.07, 0.07, 0.14, 16), std('#f1dd8a', { emissive: '#6a5410', emissiveIntensity: 0.2 }), -0.12, 0.85, 0.1);
    mesh(g, roundedCushion(0.3, 0.2, 0.12), std('#8a5a32', { roughness: 0.6 }), 0.18, 0.88, -0.1, 0, 0.5, 0);
    mesh(g, new THREE.TorusGeometry(0.08, 0.008, 6, 14, Math.PI), std('#6b4426'), 0.18, 0.98, -0.1, 0, 0.5, 0);
    mesh(g, boxGeo(0.22, 0.004, 0.3), mWhite, -0.2, 0.778, -0.25, 0, 0.4, 0, false);
    mesh(g, new THREE.CylinderGeometry(0.04, 0.035, 0.09, 14), std('#3e6f9e'), 0.3, 0.82, 0.22);
    addCircle(cx, cz, 0.66, FLOOR - 0.1, FLOOR + 0.82);
    P(cx - 0.3, 0.78, cz + 0.3);
    P(cx + 0.25, 0.78, cz + 0.28);
    // four mustard tufted barrel chairs
    const mMustard = texMat(D.tufted('#c99a3a', 3), 1, { roughness: 0.95 });
    const mSeat = texMat(T.fabric('#cfa043', 4), 1, { roughness: 0.95 });
    for (const a of [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4]) {
      const x = cx + Math.cos(a) * 0.82;
      const z = cz + Math.sin(a) * 0.82;
      const ch = piece(x, z, Math.atan2(cx - x, cz - z) + Math.PI);
      // the chair faces the table: local -z toward the table
      mesh(ch, roundedCushion(0.5, 0.12, 0.48), mSeat, 0, 0.46, 0);
      const back = new THREE.CylinderGeometry(0.27, 0.25, 0.42, 20, 1, true, -Math.PI * 0.62, Math.PI * 1.24);
      mesh(ch, back, mMustard, 0, 0.72, 0.02);
      const backIn = new THREE.CylinderGeometry(0.245, 0.23, 0.42, 20, 1, true, -Math.PI * 0.62, Math.PI * 1.24);
      backIn.scale(-1, 1, 1);
      mesh(ch, backIn, mMustard, 0, 0.72, 0.02);
      mesh(ch, new THREE.TorusGeometry(0.26, 0.025, 6, 20, Math.PI * 1.24), mMustard, 0, 0.93, 0.02, Math.PI / 2, 0, -Math.PI * 0.12);
      for (const sx of [-0.18, 0.18]) for (const sz of [-0.17, 0.17]) mesh(ch, new THREE.CylinderGeometry(0.018, 0.013, 0.42), mMidWood, sx, 0.2, sz, sz * 0.5, 0, -sx * 0.5);
      addCircle(x, z, 0.27, FLOOR - 0.1, FLOOR + 0.95);
    }
    floorDecal(D.roundRug(), '#e4ddd0', 2.3, 2.3, cx, cz, 0, true);
  }
  // tall black party speaker with a glowing blue ring (by the window)
  {
    const g = piece(6.5, -0.36, 0);
    mesh(g, boxGeo(0.4, 0.95, 0.36, 0.5), mBlackMatte, 0, 0.475, 0);
    for (const [y, r] of [
      [0.66, 0.13],
      [0.3, 0.12],
    ]) {
      mesh(g, new THREE.CircleGeometry(r, 24), std('#0d0d0d', { roughness: 0.9 }), 0, y, -0.186, 0, Math.PI, 0);
      mesh(g, new THREE.TorusGeometry(r + 0.012, 0.012, 6, 28), new THREE.MeshStandardMaterial({ color: '#3f6dff', emissive: '#3a5dff', emissiveIntensity: 2.2 }), 0, y, -0.188);
    }
    addBox(6.29, 6.71, -0.56, -0.12, FLOOR - 0.1, FLOOR + 1.0, true, 'speaker');
    P(6.5, 0.96, -0.36);
  }
  // plants: one on a little stand between the speaker and the window, two big ones in the back corner by the kitchen
  {
    const g = piece(6.45, -1.0, 0, false);
    mesh(g, new THREE.CylinderGeometry(0.16, 0.16, 0.02, 16), mBlackMatte, 0, 0.42, 0);
    for (let k = 0; k < 3; k++) mesh(g, new THREE.CylinderGeometry(0.01, 0.01, 0.42), mBlackMatte, Math.cos(k * 2.1) * 0.13, 0.21, Math.sin(k * 2.1) * 0.13);
    plant(g, 0, 0.43, 0, 0.6, 'broad', '#3a3a3a', 12);
    addCircle(6.45, -1.0, 0.2, FLOOR - 0.1, FLOOR + 1.0);
    const g2 = piece(3.15, -3.55, 0, false);
    plant(g2, 0, 0, 0, 1.0, 'broad', '#1e1e1e', 11);
    addCircle(3.15, -3.55, 0.22, FLOOR - 0.1, FLOOR + 0.9);
    const g3 = piece(3.7, -3.6, 0, false);
    plant(g3, 0, 0, 0, 0.85, 'broad', '#262626', 13);
    addCircle(3.7, -3.6, 0.2, FLOOR - 0.1, FLOOR + 0.9);
  }
  // white built-in bookshelf beside the hall opening
  {
    const SW = 0.64;
    const SX = HALL_OPEN.xc + HALL_OPEN.w / 2 + 0.12 + SW / 2;
    const g = piece(SX, ROW + 0.06 + 0.16);
    const mShelf = std('#f4f2ec', { roughness: 0.5 });
    mesh(g, boxGeo(SW, 2.05, 0.04), mShelf, 0, 1.025, -0.14);
    for (const sx of [-SW / 2 + 0.02, SW / 2 - 0.02]) mesh(g, boxGeo(0.04, 2.05, 0.32), mShelf, sx, 1.025, 0);
    const mBooks = texMat(D.books(4), 1, { roughness: 0.7 });
    for (let k = 0; k < 6; k++) {
      const y = 0.08 + k * 0.38;
      mesh(g, boxGeo(SW - 0.08, 0.03, 0.3), mShelf, 0, y, 0);
      if (k < 5 && k !== 2) {
        const b = mesh(g, boxGeo(SW - 0.2, 0.26, 0.2), mBooks, -0.02, y + 0.145, -0.02);
        (b.material as THREE.MeshStandardMaterial).map!.repeat.set((SW - 0.2) * 1.4, 1);
      }
      if (k === 2) {
        mesh(g, new THREE.SphereGeometry(0.08, 12, 10), std('#b47a43'), -0.12, y + 0.09, 0);
        mesh(g, boxGeo(0.16, 0.22, 0.03), std('#2e2e2e'), 0.14, y + 0.125, -0.08, -0.15, 0, 0);
      }
    }
    addBox(SX - SW / 2, SX + SW / 2, ROW + 0.04, ROW + 0.4, FLOOR - 0.1, FLOOR + 2.1, true, 'bookshelf');
    P(SX - 0.1, 0.95, ROW + 0.2);
    P(SX + 0.1, 1.71, ROW + 0.2);
  }
  // patterned curtain hung in the hall opening, tied back to one side (video)
  {
    const cm = texMat(D.damask('#3b4c6e', '#c9cfd8'), 1, { side: THREE.DoubleSide, roughness: 0.95 });
    (cm.map as THREE.Texture).repeat.set(1, 3);
    const c = curtainPanel(cm, 0.32, 2.05, 3);
    c.position.set(HALL_OPEN.xc - HALL_OPEN.w / 2 + 0.12, FLOOR + 1.03, ROW + 0.1);
    c.castShadow = true;
    scene.add(c);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, HALL_OPEN.w + 0.3), std('#2a2a2a'));
    rod.rotation.z = Math.PI / 2;
    rod.position.set(HALL_OPEN.xc, FLOOR + 2.1, ROW + 0.1);
    scene.add(rod);
  }
  // window dressing: navy curtains + bamboo shade (dining), coral sheers + bamboo shades (living)
  {
    const navy = texMat(T.fabric('#1f2b45', 31), 1, { side: THREE.DoubleSide, roughness: 0.95 });
    dressWindow('x', 0, -1, 5.15, 6.35, 0.85, 2.05, navy, 'bamboo', 0.5);
    const coral = new THREE.MeshStandardMaterial({ map: D.sheer('#e7774f'), side: THREE.DoubleSide, transparent: true, opacity: 0.72, roughness: 0.9, depthWrite: false });
    dressWindow('x', 0, -1, 8.45, 9.95, 0.85, 2.05, coral, 'bamboo', 0.45);
  }
  // pictures: blue print on the wall beside the red opening (above the speaker), yellow floral print over the corner plants
  art(6.8 - 0.06 - 0.017, 1.55, -0.78, -Math.PI / 2, 0.5, 0.72, (ctx, W, H) => {
    ctx.fillStyle = '#e9eef4';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#2f55a3';
    ctx.fillRect(W * 0.12, H * 0.08, W * 0.76, H * 0.84);
    ctx.fillStyle = '#9fc0ea';
    for (let k = 0; k < 6; k++) {
      ctx.beginPath();
      ctx.ellipse(W * (0.3 + (k % 2) * 0.35), H * (0.2 + k * 0.12), W * 0.12, H * 0.04, k, 0, Math.PI * 2);
      ctx.fill();
    }
  }, '#f3f1ea');
  art(3.45, 1.62, ROW + 0.06 + 0.017, 0, 0.55, 0.7, (ctx, W, H) => {
    ctx.fillStyle = '#f1e9d6';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#e9c24a';
    ctx.beginPath();
    ctx.ellipse(W * 0.5, H * 0.45, W * 0.3, H * 0.28, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8bb06a';
    ctx.fillRect(W * 0.47, H * 0.6, W * 0.05, H * 0.35);
  }, '#a99a7d');
  // dining ceiling light (simple drum)
  {
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.12, 24), std('#f4ecd8', { emissive: '#8a6a30', emissiveIntensity: 0.55 }));
    l.position.set(4.35, CEIL - 0.08, -1.33);
    scene.add(l);
  }

  // ======================================================================== KITCHEN (x 0–2.8) — narrow galley running front-to-back
  // From the bedroom doorway (back end) looking toward the front window (video): exterior door + dog flap and
  // the long counter run with the sink on the right (west / deck side), the fridge and then the doorway to the
  // dining room on the left (east), the black range further along the east wall, and the window with blinds at
  // the far (front) end. Espresso lowers, white counters, medium-wood uppers.
  /** A cabinet run along the z axis against a side wall. side=+1: against the west wall facing +x; -1: east wall facing -x. */
  const run = (side: 1 | -1, xWall: number, z0: number, z1: number, sink = false) => {
    const len = Math.abs(z1 - z0);
    const d = 0.6;
    const cz = (z0 + z1) / 2;
    const cx = xWall + side * (d / 2);
    const g = piece(cx, cz, side > 0 ? Math.PI / 2 : -Math.PI / 2);
    // local: run along x, front of the cabinets at +z
    mesh(g, boxGeo(len, 0.8, d), mEspresso, 0, 0.5, 0);
    mesh(g, boxGeo(len - 0.02, 0.1, d - 0.1), std('#1b140f'), 0, 0.05, -0.05); // recessed toe kick
    mesh(g, boxGeo(len + 0.02, 0.035, d + 0.03), mWhiteTop, 0, 0.9175, 0.015);
    const n = Math.max(1, Math.round(len / 0.45));
    const dw = len / n;
    for (let k = 0; k < n; k++) {
      const x = -len / 2 + (k + 0.5) * dw;
      mesh(g, boxGeo(dw - 0.03, 0.18, 0.02), std('#3a2a1f', { roughness: 0.45 }), x, 0.78, d / 2 + 0.01, 0, 0, 0, false);
      mesh(g, boxGeo(dw - 0.03, 0.52, 0.02), std('#3a2a1f', { roughness: 0.45 }), x, 0.38, d / 2 + 0.01, 0, 0, 0, false);
      mesh(g, boxGeo(0.1, 0.012, 0.02), mSteel, x, 0.78, d / 2 + 0.026, 0, 0, 0, false);
      mesh(g, boxGeo(0.012, 0.1, 0.02), mSteel, x + dw * 0.35 * (k % 2 ? -1 : 1), 0.52, d / 2 + 0.026, 0, 0, 0, false);
    }
    if (sink) {
      mesh(g, boxGeo(0.62, 0.03, 0.42), mSteel, 0, 0.93, 0.02);
      mesh(g, boxGeo(0.56, 0.012, 0.36), std('#7d8184', { metalness: 0.7, roughness: 0.35 }), 0, 0.944, 0.02);
      mesh(g, new THREE.CylinderGeometry(0.014, 0.014, 0.3), mSteel, 0, 1.08, -0.2);
      mesh(g, new THREE.TorusGeometry(0.08, 0.013, 6, 12, Math.PI), mSteel, 0, 1.23, -0.12, 0, Math.PI / 2, 0);
    }
    const xa = Math.min(xWall, xWall + side * d);
    addBox(xa, xa + d, Math.min(z0, z1), Math.max(z0, z1), FLOOR - 0.1, FLOOR + 0.95, true, 'counter');
    P(cx, 0.94, cz);
    return g;
  };
  // west run: from the front corner back to the trash can by the door, sink in the middle
  const W0 = 0.06;
  const westRun = run(1, W0, -0.06, -2.2, true);
  // countertop clutter (local x runs from the front end (-) to the back end (+)): toaster oven by the door end,
  // knife block, oils and a dish rack
  mesh(westRun, boxGeo(0.42, 0.24, 0.3), std('#c9cbcc', { metalness: 0.4, roughness: 0.35 }), 0.75, 1.055, -0.05);
  mesh(westRun, boxGeo(0.3, 0.16, 0.02), std('#111315', { roughness: 0.1 }), 0.72, 1.06, 0.105);
  mesh(westRun, boxGeo(0.12, 0.22, 0.12), mDarkWood, -0.55, 1.04, -0.12, 0, 0.3, 0);
  for (let k = 0; k < 4; k++) mesh(westRun, new THREE.CylinderGeometry(0.025, 0.03, 0.22 + (k % 2) * 0.06, 10), std(['#7a4d1c', '#3f5a2a', '#c7a14a', '#5a2a1a'][k]), -0.85 + k * 0.07, 1.05, -0.2);
  mesh(westRun, new THREE.CylinderGeometry(0.11, 0.09, 0.08, 18), std('#3c8fb4', { roughness: 0.35 }), 0.38, 0.975, 0.05);
  // east side: counter in the front corner, the black gas range, the feeder by the doorway, then (past the
  // doorway) the fridge at the back corner
  const E0 = 2.8 - 0.06;
  run(-1, E0, -0.06, -0.85);
  {
    const g = piece(E0 - 0.3, -1.23, -Math.PI / 2);
    mesh(g, boxGeo(0.76, 0.9, 0.6), mBlackGloss, 0, 0.45, 0);
    mesh(g, boxGeo(0.62, 0.42, 0.01), std('#0a0a0a', { roughness: 0.1 }), 0, 0.42, 0.302);
    mesh(g, boxGeo(0.6, 0.02, 0.02), mSteel, 0, 0.68, 0.32);
    mesh(g, boxGeo(0.76, 0.16, 0.06), mBlackGloss, 0, 1.0, -0.28); // back panel
    mesh(g, new THREE.PlaneGeometry(0.12, 0.04), new THREE.MeshBasicMaterial({ color: '#48a9ff' }), 0, 1.0, -0.244);
    for (const [gx, gz] of [
      [-0.18, -0.13],
      [0.18, -0.13],
      [-0.18, 0.13],
      [0.18, 0.13],
    ]) {
      mesh(g, new THREE.TorusGeometry(0.075, 0.012, 6, 16), std('#111', { roughness: 0.6 }), gx, 0.915, gz, Math.PI / 2, 0, 0);
      mesh(g, new THREE.CylinderGeometry(0.03, 0.03, 0.015, 10), std('#2a2a2a'), gx, 0.912, gz);
    }
    for (let k = 0; k < 5; k++) mesh(g, new THREE.CylinderGeometry(0.02, 0.02, 0.03, 10), std('#222'), -0.28 + k * 0.14, 0.82, 0.31, Math.PI / 2, 0, 0);
    // pans on the burners (as in the video)
    mesh(g, new THREE.CylinderGeometry(0.13, 0.11, 0.05, 18), std('#2b2b2b', { metalness: 0.4, roughness: 0.5 }), -0.18, 0.95, 0.13);
    mesh(g, new THREE.CylinderGeometry(0.15, 0.12, 0.09, 18), std('#e8eef0', { transparent: true, opacity: 0.7, roughness: 0.1 }), 0.18, 0.97, 0.13);
    mesh(g, new THREE.CylinderGeometry(0.12, 0.11, 0.1, 18), std('#1d3a78', { roughness: 0.4 }), 0.18, 0.97, -0.13);
    // stainless over-range microwave
    mesh(g, boxGeo(0.76, 0.42, 0.4), mSteel, 0, 1.62, -0.08);
    mesh(g, boxGeo(0.5, 0.28, 0.01), std('#121416', { roughness: 0.1 }), -0.08, 1.62, 0.126);
    mesh(g, boxGeo(0.03, 0.3, 0.03), mSteel, 0.2, 1.62, 0.14);
    mesh(g, boxGeo(0.14, 0.3, 0.01), std('#2a2c2e'), 0.29, 1.62, 0.126);
    // a red pot holder and utensils hanging beside the microwave
    mesh(g, new THREE.CylinderGeometry(0.08, 0.08, 0.01, 16), std('#c8473f'), 0.47, 1.45, -0.27, Math.PI / 2, 0, 0);
    addBox(E0 - 0.61, E0, -1.62, -0.84, FLOOR - 0.1, FLOOR + 1.0, true, 'stove');
    P(E0 - 0.3, 1.85, -1.23);
  }
  {
    // stainless French-door fridge in the back-east corner, just behind the dining doorway
    const g = piece(E0 - 0.35, -3.52, -Math.PI / 2);
    mesh(g, boxGeo(0.76, 1.78, 0.68), mSteel, 0, 0.89, 0);
    mesh(g, boxGeo(0.005, 1.0, 0.01), std('#666'), 0, 1.25, 0.345);
    mesh(g, boxGeo(0.74, 0.005, 0.01), std('#666'), 0, 0.72, 0.345);
    for (const sx of [-0.03, 0.03]) mesh(g, new THREE.CylinderGeometry(0.012, 0.012, 0.55), mSteel, sx, 1.25, 0.37);
    mesh(g, boxGeo(0.5, 0.02, 0.02), mSteel, 0, 0.62, 0.36);
    // a tea towel hanging from the handle
    mesh(g, boxGeo(0.16, 0.32, 0.01), texMat(T.fabric('#d9c37a', 33), 1), -0.08, 1.05, 0.38, 0, 0, 0.05);
    addBox(E0 - 0.7, E0, -3.9, -3.14, FLOOR - 0.1, FLOOR + 1.85, true, 'fridge');
    P(E0 - 0.35, 1.8, -3.52);
  }
  // medium-wood upper cabinets (local x along the wall, doors on +z)
  {
    const upper = (side: 1 | -1, xWall: number, z0: number, z1: number, y = FLOOR + 1.5, h = 0.78) => {
      const len = Math.abs(z1 - z0);
      const d = 0.33;
      const g = piece(xWall + side * (d / 2), (z0 + z1) / 2, side > 0 ? Math.PI / 2 : -Math.PI / 2, false, y);
      mesh(g, boxGeo(len, h, d), mUpperWood, 0, h / 2, 0);
      const n = Math.max(1, Math.round(len / 0.42));
      for (let k = 0; k < n; k++) {
        const x = -len / 2 + ((k + 0.5) * len) / n;
        mesh(g, boxGeo(len / n - 0.04, h - 0.08, 0.02), std('#9b6a3b', { roughness: 0.5 }), x, h / 2, d / 2 + 0.01, 0, 0, 0, false);
        mesh(g, boxGeo(len / n - 0.14, h - 0.24, 0.02), std('#86592f', { roughness: 0.55 }), x, h / 2, d / 2 + 0.018, 0, 0, 0, false);
        mesh(g, boxGeo(0.015, 0.08, 0.02), std('#2a2a2a'), x + (len / n) * 0.36 * (k % 2 ? -1 : 1), 0.12, d / 2 + 0.03, 0, 0, 0, false);
      }
      return g;
    };
    upper(1, W0, -0.06, -2.2);
    upper(-1, E0, -0.06, -0.84);
    upper(-1, E0, -3.14, -3.88, FLOOR + 1.93, 0.45);
    // decorative baskets and a plant on top of the cabinets (as in the video)
    const top = new THREE.Group();
    scene.add(top);
    mesh(top, new THREE.CylinderGeometry(0.12, 0.1, 0.16, 14), texMat(D.rattan('#b3884e'), 1), 0.22, FLOOR + 2.36, -1.5);
    plant(top, 2.58, FLOOR + 2.28, -0.4, 0.45, 'strap', '#e9e4da', 14);
  }
  // white automatic pet feeder + water fountain on a black mat, between the range and the dining doorway
  {
    floorDecal(null, '#141414', 0.42, 0.62, E0 - 0.24, -1.92, 0);
    const g = piece(E0 - 0.24, -1.92, -Math.PI / 2, false);
    mesh(g, roundedCushion(0.2, 0.3, 0.2), mWhite, -0.13, 0.16, 0);
    mesh(g, new THREE.CylinderGeometry(0.08, 0.08, 0.14, 16), std('#e8f0f2', { transparent: true, opacity: 0.6, roughness: 0.05 }), -0.13, 0.36, 0);
    mesh(g, new THREE.CylinderGeometry(0.07, 0.08, 0.03, 16), std('#d8d0c0'), -0.13, 0.03, 0.12);
    mesh(g, new THREE.CylinderGeometry(0.1, 0.11, 0.13, 18), mWhite, 0.14, 0.065, 0);
    mesh(g, new THREE.CylinderGeometry(0.075, 0.075, 0.01, 18), std('#8fc6dd', { roughness: 0.05, metalness: 0.2 }), 0.14, 0.135, 0);
    addCircle(E0 - 0.24, -1.92, 0.24, FLOOR - 0.1, FLOOR + 0.45);
  }
  // black step trash can between the counter run and the door
  {
    const g = piece(W0 + 0.2, -2.38, Math.PI / 2);
    mesh(g, roundedCushion(0.3, 0.62, 0.26), mBlackMatte, 0, 0.31, 0);
    mesh(g, roundedCushion(0.31, 0.05, 0.27), std('#2a2a2a', { roughness: 0.3 }), 0, 0.63, 0);
    addBox(W0, W0 + 0.34, -2.52, -2.23, FLOOR - 0.1, FLOOR + 0.7, true, 'trash');
    P(W0 + 0.2, 0.67, -2.38);
  }
  // gray mat inside the dog-door, terracotta vintage runner down the galley
  floorDecal(null, '#5e5e5c', 0.5, 0.75, 0.33, -3.0, 0);
  floorDecal(D.persianRug({ field: '#c48a6c', border: '#9c5a45', border2: '#e4c3a6', accent: ['#a8634c', '#7e8fa0', '#e8cdb4', '#b27660'], medallion: '#a4614a', seed: 31, wear: 0.55 }, 384, 1280), '#b98266', 0.72, 2.0, 1.4, -1.3, 0);
  // white blinds on the kitchen window at the front end of the galley (no curtains)
  dressWindow('x', 0, -1, 0.95, 1.85, 1.0, 2.05, null, 'blinds');

  // ======================================================================== HALL (x 4.5–8.0, z -3.9…-5.7): east-west, gray runner
  floorDecal(D.persianRug({ field: '#9ea3a6', border: '#6c7277', border2: '#c8cbcc', accent: ['#6f8fa3', '#d5c6a5', '#8e8a84', '#b7c3c9'], medallion: '#7b8f9c', seed: 41, wear: 0.4 }, 384, 1280), '#9ea3a6', 0.7, 2.7, 6.25, -4.8, Math.PI / 2);

  // ======================================================================== MAIN BEDROOM (x 0–4.5, z -3.9…-7.6) navy walls
  // From the hall door (east wall) the headboard faces you on the far (west) wall, under the coral swag; the bed
  // runs along the back wall, the nightstand + lamp is to the left of the headboard (video).
  {
    const L = 2.0;
    const W = 1.55;
    const BX = 0.06 + L / 2;
    const BZ = -7.6 + 0.06 + W / 2;
    // local -z (headboard) faces world -x (the west wall)
    const g = piece(BX, BZ, Math.PI / 2, false);
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, px: number, py: number, pz: number, rx = 0, ry = 0, rz = 0) => mesh(g, geo, mat, px, py, pz, rx, ry, rz);
    add(boxGeo(W, 0.28, L), mDarkWood, 0, 0.16, 0);
    add(roundedCushion(W - 0.04, 0.24, L - 0.06), mWhite, 0, 0.42, 0.02);
    add(roundedCushion(W + 0.08, 0.1, L * 0.72), texMat(D.bedding('#a3285a', 3), 1, { roughness: 0.95 }), 0, 0.55, L * 0.14);
    add(roundedCushion(W + 0.1, 0.06, 0.6), texMat(D.bedding('#7a2632', 4), 1), 0, 0.6, L * 0.32, 0, 0, 0.03); // burgundy throw at the foot
    add(boxGeo(W + 0.14, 1.15, 0.1), texMat(D.tufted('#273041', 6), 1, { roughness: 0.9 }), 0, 0.82, -L / 2 - 0.02);
    add(roundedCushion(W + 0.2, 0.1, 0.14), texMat(D.tufted('#273041', 6), 1), 0, 1.4, -L / 2 - 0.02);
    for (const [px, col] of [
      [-0.42, '#1f7c84'],
      [0.42, '#1f7c84'],
      [-0.2, '#e08a2c'],
      [0.25, '#e08a2c'],
    ] as [number, string][])
      add(roundedCushion(0.42, 0.13, 0.3), texMat(T.fabric(col, 8), 1), px, 0.66, -L / 2 + 0.22 + (Math.abs(px) < 0.3 ? 0.14 : 0), -0.6);
    addBox(0.06, 0.06 + L + 0.02, -7.54, -7.54 + W + 0.02, FLOOR - 0.1, FLOOR + 1.2, true, 'bed');
    // coral canopy swag over the headboard, on the west wall
    const coral = new THREE.MeshStandardMaterial({ map: D.sheer('#e8634a'), side: THREE.DoubleSide, roughness: 0.9 });
    const swag = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(-0.72, 2.3, 0), new THREE.Vector3(-0.36, 2.02, 0.08), new THREE.Vector3(0, 2.18, 0.04), new THREE.Vector3(0.36, 2.02, 0.08), new THREE.Vector3(0.72, 2.3, 0)]), 40, 0.07, 8), coral);
    swag.position.z = -L / 2 + 0.06;
    g.add(swag);
    for (const sx of [-1, 1]) {
      const tail = curtainPanel(coral, 0.3, 1.0, 2);
      tail.position.set(sx * 0.7, 1.75, -L / 2 + 0.08);
      g.add(tail);
    }
    // nightstand + lamp just south of the headboard, wicker basket beside it, pink rug off the foot
    const NZ = BZ + W / 2 + 0.26;
    const ns = piece(0.27, NZ, Math.PI / 2, false);
    mesh(ns, boxGeo(0.42, 0.55, 0.38), mMidWood, 0, 0.275, 0);
    mesh(ns, new THREE.CylinderGeometry(0.07, 0.09, 0.28, 14), std('#d8cdb6'), 0, 0.69, 0);
    mesh(ns, new THREE.CylinderGeometry(0.12, 0.15, 0.18, 16, 1, true), std('#f2e9d6', { side: THREE.DoubleSide, emissive: '#806030', emissiveIntensity: 0.6 }), 0, 0.92, 0);
    addBox(0.06, 0.47, NZ - 0.22, NZ + 0.22, FLOOR - 0.1, FLOOR + 0.6, true, 'nightstand');
    const wb = piece(0.3, NZ + 0.42, 0, false);
    mesh(wb, new THREE.CylinderGeometry(0.17, 0.14, 0.32, 16, 1, true), texMat(D.rattan('#e8dcc6'), 1, { side: THREE.DoubleSide }), 0, 0.16, 0);
    addCircle(0.3, NZ + 0.42, 0.17, FLOOR - 0.1, FLOOR + 0.4);
    floorDecal(D.persianRug({ field: '#e6b9b5', border: '#d58e8c', border2: '#f3dcd8', accent: ['#c97a7e', '#f1cfc9', '#b9858a', '#ead7c8'], medallion: '#d79a96', seed: 51, wear: 0.5 }, 512, 768), '#e6b9b5', 0.85, 1.25, 1.2, BZ + W / 2 + 0.55, Math.PI / 2);
    // wood dresser against the kitchen wall, east of the kitchen door
    const dr = piece(3.05, ROW - 0.06 - 0.23, Math.PI, false);
    mesh(dr, boxGeo(0.85, 0.95, 0.45), mMidWood, 0, 0.475, 0);
    for (let k = 0; k < 3; k++) mesh(dr, boxGeo(0.78, 0.26, 0.02), std('#6a4628'), 0, 0.17 + k * 0.29, 0.23);
    addBox(2.62, 3.48, ROW - 0.52, ROW - 0.05, FLOOR - 0.1, FLOOR + 1, true, 'dresser');
    // bamboo roman shades on both windows
    dressWindow('x', -7.6, 1, 2.3, 3.2, 0.85, 2.05, null, 'bamboo', 0.55);
    dressWindow('z', 0, 1, -4.3, -5.1, 0.85, 2.05, null, 'bamboo', 0.55);
  }

  // ======================================================================== SPARE BEDROOM (x 8.0–12.1, z -3.9…-7.6) light gray
  // Headboard on the back wall under a small high window, nightstand with the ginger-jar lamp on its east side,
  // the curtained window on the east wall, bench at the foot (video).
  {
    const bx = 10.3;
    const g = piece(bx, -6.55, 0, false);
    const W = 1.55;
    const L = 2.0;
    const mGrayBed = texMat(D.bedding('#7d8287', 7), 1, { roughness: 0.95 });
    mesh(g, boxGeo(W, 0.28, L), std('#4a4644'), 0, 0.16, 0);
    mesh(g, roundedCushion(W - 0.04, 0.24, L - 0.06), mWhite, 0, 0.42, 0.02);
    mesh(g, roundedCushion(W + 0.08, 0.12, L * 0.8), mGrayBed, 0, 0.55, L * 0.1);
    mesh(g, boxGeo(W + 0.1, 1.05, 0.12), texMat(D.tufted('#8e9194', 8), 1), 0, 0.78, -L / 2 + 0.02);
    for (const px of [-0.4, 0.4]) mesh(g, roundedCushion(0.5, 0.14, 0.32), std('#e9e9e6'), px, 0.68, -L / 2 + 0.26, -0.5);
    mesh(g, roundedCushion(0.42, 0.12, 0.28), texMat(T.fabric('#3f454c', 9), 1), 0.05, 0.68, -L / 2 + 0.42, -0.6);
    mesh(g, roundedCushion(0.36, 0.1, 0.24), std('#d6c8b8'), -0.05, 0.64, 0.05, 0.1, 0.4, 0);
    addBox(bx - W / 2, bx + W / 2, -7.56, -5.55, FLOOR - 0.1, FLOOR + 1.1, true, 'bed2');
    // upholstered bench at the foot
    const bench = piece(bx, -5.3, 0, false);
    mesh(bench, roundedCushion(1.2, 0.12, 0.38), texMat(T.fabric('#8c8f92', 10), 1), 0, 0.42, 0);
    mesh(bench, boxGeo(1.16, 0.36, 0.34), std('#3c3633'), 0, 0.18, 0);
    addBox(bx - 0.6, bx + 0.6, -5.48, -5.12, FLOOR - 0.1, FLOOR + 0.5, true, 'bench');
    // nightstand with the blue-and-white ginger-jar lamp, east of the bed
    const nx = bx + W / 2 + 0.32;
    const ns = piece(nx, -7.33, 0, false);
    mesh(ns, boxGeo(0.45, 0.6, 0.38), std('#e6e4de'), 0, 0.3, 0);
    const jar = new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(0.06, 0), new THREE.Vector2(0.11, 0.06), new THREE.Vector2(0.12, 0.16), new THREE.Vector2(0.08, 0.27), new THREE.Vector2(0.03, 0.3)], 18), texMat(D.damask('#284f96', '#f4f6fa'), 1));
    jar.position.set(0, 0.6, 0);
    ns.add(jar);
    mesh(ns, new THREE.CylinderGeometry(0.13, 0.18, 0.22, 16, 1, true), std('#f4ecd9', { side: THREE.DoubleSide, emissive: '#806030', emissiveIntensity: 0.6 }), 0, 1.02, 0);
    addBox(nx - 0.23, nx + 0.23, -7.56, -7.13, FLOOR - 0.1, FLOOR + 0.7, true, 'nightstand2');
    // white dresser against the living-room wall
    const dr = piece(11.05, ROW - 0.06 - 0.23, Math.PI, false);
    mesh(dr, boxGeo(1.0, 0.82, 0.45), std('#f1efe9', { roughness: 0.45 }), 0, 0.41, 0);
    for (let k = 0; k < 3; k++) for (const sx of [-0.25, 0.25]) mesh(dr, boxGeo(0.46, 0.22, 0.02), std('#f7f6f2'), sx, 0.15 + k * 0.25, 0.23);
    mesh(dr, boxGeo(0.3, 0.2, 0.2), texMat(D.rattan('#c9a06a'), 1), 0.3, 0.92, 0);
    addBox(10.54, 11.56, ROW - 0.52, ROW - 0.05, FLOOR - 0.1, FLOOR + 0.9, true, 'dresser2');
    // gray blackout curtains on the east window, a plain shade on the small window over the bed
    const gray = texMat(T.fabric('#6f7276', 34), 1, { side: THREE.DoubleSide, roughness: 0.95 });
    dressWindow('z', 12.1, -1, -5.4, -6.4, 0.85, 2.05, gray, null);
    dressWindow('x', -7.6, 1, 9.9, 10.7, 1.4, 2.05, null, 'blinds');
    // ceiling fan
    const fan = new THREE.Group();
    fan.position.set(10.05, CEIL - 0.3, -5.75);
    scene.add(fan);
    fan.add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.08, 0.12, 14), std('#2a2826')));
    for (let i = 0; i < 4; i++) {
      const b = new THREE.Mesh(boxGeo(0.55, 0.012, 0.12), std('#3a2c22'));
      b.position.set(Math.cos((i * Math.PI) / 2) * 0.36, -0.02, Math.sin((i * Math.PI) / 2) * 0.36);
      b.rotation.y = (-i * Math.PI) / 2;
      fan.add(b);
    }
  }

  // ======================================================================== BATHROOM (x 4.5–8.0, z -5.7…-7.6)
  // Through the door (from the hall): toilet against the left (west) wall under the metal tree art, the vanity
  // with the white wicker mirror straight ahead on the back wall, and the tub with the blue damask curtain to
  // the right along the back wall (video).
  {
    const tx0 = 6.25;
    const tx1 = 7.94;
    const tub = new THREE.Mesh(boxGeo(tx1 - tx0, 0.55, 0.72), mWhite);
    tub.position.set((tx0 + tx1) / 2, FLOOR + 0.275, -7.2);
    tub.castShadow = true;
    scene.add(tub);
    addBox(tx0, tx1, -7.56, -6.84, FLOOR - 0.1, FLOOR + 0.6, true, 'tub');
    const cm = texMat(D.damask(), 1, { side: THREE.DoubleSide, roughness: 0.8 });
    (cm.map as THREE.Texture).repeat.set(3, 3.2);
    const sc = curtainPanel(cm, tx1 - tx0, 1.75, 7);
    sc.position.set((tx0 + tx1) / 2, FLOOR + 1.12, -6.8);
    sc.castShadow = true;
    scene.add(sc);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, tx1 - tx0 + 0.1), mSteel);
    rod.rotation.z = Math.PI / 2;
    rod.position.set((tx0 + tx1) / 2, FLOOR + 2.02, -6.8);
    scene.add(rod);
    // toilet on the west wall, facing east
    const toilet = new THREE.Group();
    toilet.position.set(4.5 + 0.06 + 0.36, FLOOR, -6.75);
    toilet.rotation.y = Math.PI / 2;
    scene.add(toilet);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.4, 18), mWhite);
    bowl.position.y = 0.2;
    bowl.scale.z = 1.25;
    toilet.add(bowl);
    const seat = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.035, 8, 20), mWhite);
    seat.rotation.x = Math.PI / 2;
    seat.position.set(0, 0.42, 0.04);
    seat.scale.y = 1.25;
    toilet.add(seat);
    const tank = new THREE.Mesh(boxGeo(0.45, 0.4, 0.2), mWhite);
    tank.position.set(0, 0.62, -0.22);
    toilet.add(tank);
    plant(toilet, 0, 0.82, -0.22, 0.32, 'broad', '#b9b4aa', 15);
    addCircle(toilet.position.x, toilet.position.z, 0.26, FLOOR - 0.1, FLOOR + 0.9);
    // small white vanity on the back wall
    const vx = 5.55;
    const van = piece(vx, -7.6 + 0.06 + 0.21, 0, false);
    mesh(van, boxGeo(0.55, 0.82, 0.42), mWhite, 0, 0.41, 0);
    mesh(van, boxGeo(0.6, 0.06, 0.46), std('#f7f7f5', { roughness: 0.15 }), 0, 0.85, 0);
    for (const sx of [-0.13, 0.13]) mesh(van, boxGeo(0.24, 0.6, 0.02), std('#f8f8f6'), sx, 0.38, 0.215);
    mesh(van, new THREE.CylinderGeometry(0.012, 0.012, 0.15), mSteel, 0, 0.94, -0.14);
    addBox(vx - 0.3, vx + 0.3, -7.56, -7.08, FLOOR - 0.1, FLOOR + 0.9, true, 'vanity');
    // white wicker mirror over the vanity, metal tree art over the toilet
    const mir = new THREE.Group();
    mir.position.set(vx, FLOOR + 1.55, -7.6 + 0.06 + 0.017);
    scene.add(mir);
    mir.add(new THREE.Mesh(boxGeo(0.5, 0.68, 0.03), texMat(D.rattan('#f1efe8'), 1)));
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.52), std('#cfdadd', { metalness: 0.9, roughness: 0.06 }));
    glass.position.z = 0.017;
    mir.add(glass);
    const treeArt = art(4.5 + 0.06 + 0.017, 1.62, -6.75, Math.PI / 2, 0.6, 0.6, (ctx, W, H) => {
      ctx.fillStyle = '#c8d3d8';
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = '#8d9396';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, W * 0.45, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#9aa0a3';
      ctx.fillRect(W * 0.47, H * 0.5, W * 0.06, H * 0.38);
      for (let k = 0; k < 40; k++) {
        const a = (k / 40) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(W / 2 + Math.cos(a) * W * 0.22 * (0.5 + (k % 3) * 0.25), H * 0.38 + Math.sin(a) * H * 0.16 * (0.5 + (k % 3) * 0.25), 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }, '#9aa0a3');
    void treeArt;
    floorDecal(null, '#2f8f95', 0.85, 0.5, (tx0 + tx1) / 2, -6.5, 0);
  }

  // ======================================================================== LAUNDRY (x 10.7–13.3, z 0…-3.9) light gray
  // Through the teal door: dryer, wooden detergent shelf and washer along the back wall with the wire shelf of
  // blankets above, the red runner on the floor, the pine closet door and a window with blinds on the far wall,
  // laundry baskets, boxes and the litter boxes (video).
  {
    const back = ROW + 0.06;
    const appliance = (x: number, dryer: boolean) => {
      const g = piece(x, back + 0.34, 0, false);
      mesh(g, boxGeo(0.66, 0.9, 0.66), std('#f4f4f2', { roughness: 0.35 }), 0, 0.45, 0);
      mesh(g, boxGeo(0.64, 0.12, 0.02), std('#eceae6'), 0, 0.83, 0.33);
      mesh(g, new THREE.TorusGeometry(0.2, 0.035, 10, 28), std('#c9cbcd', { metalness: 0.6, roughness: 0.3 }), 0, 0.45, 0.335);
      mesh(g, new THREE.CircleGeometry(0.19, 28), std(dryer ? '#3a3f44' : '#26323a', { roughness: 0.08, metalness: 0.2 }), 0, 0.45, 0.336);
      mesh(g, new THREE.CylinderGeometry(0.04, 0.04, 0.02, 14), std('#bfc2c4', { metalness: 0.6 }), -0.18, 0.83, 0.345, Math.PI / 2, 0, 0);
      addBox(x - 0.34, x + 0.34, back, back + 0.68, FLOOR - 0.1, FLOOR + 1, true, dryer ? 'dryer' : 'washer');
      P(x, 0.92, back + 0.34);
    };
    appliance(11.15, true);
    appliance(12.6, false);
    // wood shelf between them, crowded with detergent bottles
    const sh = piece(11.875, back + 0.16, 0, false);
    mesh(sh, boxGeo(0.7, 0.95, 0.3), std('#5b3a22'), 0, 0.475, -0.02);
    const cols = ['#2b4bb0', '#e8e8e8', '#7a2f8a', '#f2b632', '#3e8f4f', '#e05a2a'];
    for (let k = 0; k < 12; k++) {
      const row = Math.floor(k / 6);
      mesh(sh, boxGeo(0.08, 0.2, 0.1), std(cols[k % cols.length], { roughness: 0.4 }), -0.25 + (k % 6) * 0.1, 0.2 + row * 0.4, 0.06);
    }
    addBox(11.52, 12.23, back, back + 0.33, FLOOR - 0.1, FLOOR + 1.0, true, 'lshelf');
    // wire shelf with folded blankets above
    const ws = new THREE.Group();
    ws.position.set(11.9, FLOOR + 1.78, back + 0.18);
    scene.add(ws);
    mesh(ws, boxGeo(2.2, 0.02, 0.35), std('#f0f0ee', { metalness: 0.3, roughness: 0.4 }), 0, 0, 0);
    const bl = ['#6b4a7a', '#c7a07a', '#7d8f6a', '#b0413e', '#e6dccb', '#4f6b8a'];
    for (let k = 0; k < 7; k++) mesh(ws, roundedCushion(0.3, 0.12 + (k % 3) * 0.04, 0.32), texMat(T.fabric(bl[k % bl.length], 40 + k), 1), -0.95 + k * 0.3, 0.08 + (k % 2) * 0.02, 0, 0, (k % 3) * 0.2, 0);
    // red Persian runner from the door toward the far wall
    floorDecal(D.persianRug({ field: '#a3282a', border: '#3a3b5a', border2: '#e2b46a', accent: ['#e2b46a', '#2f5c5a', '#e7d1b0', '#6a1e22'], medallion: '#2f3e6a', seed: 61, wear: 0.2 }, 384, 1024), '#a3282a', 0.72, 1.9, 12.0, -1.75, Math.PI / 2);
    // natural pine closet door on the far (east) wall
    const ex = 13.3 - 0.06;
    const door = new THREE.Mesh(boxGeo(0.03, 2.0, 0.82), std('#d9b67c', { roughness: 0.55 }));
    door.position.set(ex - 0.016, FLOOR + 1.0, -2.95);
    scene.add(door);
    for (const sz of [-0.2, 0.2]) {
      const pnl = new THREE.Mesh(boxGeo(0.015, 1.75, 0.34), std('#cfa96d', { roughness: 0.6 }));
      pnl.position.set(ex - 0.035, FLOOR + 1.0, -2.95 + sz);
      scene.add(pnl);
    }
    // litter boxes under the window, white laundry basket and moving boxes by the front wall
    for (const lz of [-0.95, -1.55]) {
      const lt = piece(ex - 0.24, lz, Math.PI / 2, false);
      mesh(lt, boxGeo(0.42, 0.14, 0.32), std('#b4b8bb', { roughness: 0.5 }), 0, 0.07, 0);
      addBox(ex - 0.42, ex - 0.06, lz - 0.21, lz + 0.21, FLOOR - 0.1, FLOOR + 0.2, true, 'litter');
    }
    const lb = piece(11.25, -0.42, 0.3, false);
    mesh(lb, new THREE.CylinderGeometry(0.24, 0.2, 0.5, 18, 1, true), std('#f4f4f2', { side: THREE.DoubleSide }), 0, 0.25, 0);
    addCircle(11.25, -0.42, 0.25, FLOOR - 0.1, FLOOR + 0.6);
    const boxes = piece(12.0, -0.36, 0.1, false);
    mesh(boxes, boxGeo(0.5, 0.36, 0.4), std('#b38f62'), 0, 0.18, 0);
    mesh(boxes, boxGeo(0.4, 0.3, 0.34), std('#c19c6c'), 0.05, 0.51, 0.02, 0, 0.2, 0);
    addBox(11.73, 12.27, -0.58, -0.14, FLOOR - 0.1, FLOOR + 0.7, true, 'boxes');
    dressWindow('z', 13.3, -1, -0.8, -1.8, 1.1, 2.05, null, 'blinds');
    dressWindow('x', 0, -1, 11.6, 12.5, 1.0, 2.05, null, 'blinds');
  }

  return {
    fadeables,
    basket,
    basketTop,
    stickPile,
    napSpots: {
      couch: { x: 8.45, y: FLOOR + 0.5, z: ROW + 0.06 + 0.43, rot: 0.3 },
      armchair: { x: tree1.tx, y: tree1.top, z: tree1.tz, rot: 0.9 }, // top of the tall cat tree
      dogbed: { x: DOGBED.x, y: FLOOR + 0.08, z: DOGBED.z, rot: -0.6 },
    },
    chaos,
    perches,
  };
}

function makeChaos(obj: THREE.Object3D, stage: number, dp: THREE.Vector3, r: THREE.Euler, absoluteRot = false): ChaosProp {
  const from = { p: obj.position.clone(), r: obj.rotation.clone() };
  const to = {
    p: obj.position.clone().add(dp),
    r: absoluteRot ? new THREE.Euler(from.r.x + r.x, from.r.y + r.y, from.r.z + r.z) : new THREE.Euler(r.x, r.y, r.z),
  };
  return { obj, stage, from, to, t: 0 };
}

function roundedCushion(w: number, h: number, d: number) {
  const g = new THREE.SphereGeometry(0.5, 20, 12);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i) * 2;
    let y = pos.getY(i) * 2;
    let z = pos.getZ(i) * 2;
    const f = (v: number) => Math.sign(v) * Math.pow(Math.abs(v), 0.35);
    x = f(x);
    y = f(y);
    z = f(z);
    pos.setXYZ(i, (x * w) / 2, (y * h) / 2, (z * d) / 2);
  }
  g.computeVertexNormals();
  return g;
}
void UP;
