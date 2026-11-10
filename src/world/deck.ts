// Deck furnishing and back-of-house details, from the owner's backyard video (night walkthrough):
// green outdoor-carpet runner along the house from the door to the stairs; right outside the door the purple
// mosaic bistro table with yellow wire chairs on a teal butterfly rug against the railing, with the reed screen
// and string lights behind it; the covered grill on the front (carport) end; the brown inflatable hot tub on the
// far (back) end by the stairs, with the pink ti plant; potted plants on the wide railing cap; brick piers with
// white lattice under the house; the tankless water heater on the back wall; pavers at the foot of the stairs.
import * as THREE from 'three';
import { Batch, boxGeo, decal, std, texMat } from './build';
import * as T from './textures';
import * as D from './decortex';
import { DECK, FLOOR, FRONT_DOOR, HOUSE, KITCHEN_DOOR, ROOMS, ROW, STAIRS, addCircle } from './layout';
import { mulberry32 } from '../rules';

function canvasTex(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

export function buildDeckProps(scene: THREE.Scene) {
  const group = new THREE.Group();
  group.name = 'deck-props';
  scene.add(group);
  const B = new Batch();
  const R = mulberry32(77);
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    return m;
  };
  const leafMat = std('#2f6b2d', { roughness: 0.6, side: THREE.DoubleSide });
  const leafMat2 = std('#467f35', { roughness: 0.6, side: THREE.DoubleSide });
  const tiMat = std('#a3364f', { roughness: 0.55, side: THREE.DoubleSide });
  const strap = (() => {
    const g = new THREE.PlaneGeometry(0.1, 1, 1, 5);
    g.translate(0, 0.5, 0);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      pos.setX(i, pos.getX(i) * (0.6 + Math.sin(y * Math.PI) * 0.8));
      pos.setZ(i, -y * y * 0.45);
    }
    g.computeVertexNormals();
    return g;
  })();
  const pottedPlant = (x: number, y: number, z: number, potR: number, potColor: string, leaves: THREE.Material, n: number, len: number) => {
    const pot = add(new THREE.CylinderGeometry(potR, potR * 0.75, potR * 1.5, 16), std(potColor, { roughness: 0.35 }), x, y + potR * 0.75, z);
    void pot;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + R() * 0.6;
      const l = add(strap, i % 3 === 0 ? leafMat2 : leaves, x + Math.cos(a) * potR * 0.3, y + potR * 1.4, z + Math.sin(a) * potR * 0.3);
      l.rotation.set(0, -a - Math.PI / 2, 0, 'YXZ');
      l.rotateX(-(0.25 + R() * 0.7));
      l.scale.setScalar(len * (0.7 + R() * 0.5));
    }
  };

  // ---------------------------------------------------------------- green outdoor-carpet runner (door -> stairs)
  {
    const mat = decal(texMat(T.fabric('#58724b', 52), 1, { roughness: 1 }));
    (mat.map as THREE.Texture).repeat.set(1, 8);
    const zA = KITCHEN_DOOR.zc + KITCHEN_DOOR.w / 2 + 0.05;
    const len = zA - DECK.z1;
    const m = add(new THREE.PlaneGeometry(0.62, len), mat, -0.4, FLOOR + 0.006, (zA + DECK.z1) / 2, -Math.PI / 2);
    m.castShadow = false;
  }
  // ---------------------------------------------------------------- brown inflatable hot tub with cover
  {
    // far end of the deck, beside the top of the stairs
    const cx = -2.25;
    const cz = -5.2;
    const tubTex = canvasTex(256, 64, (ctx) => {
      ctx.fillStyle = '#4a3428';
      ctx.fillRect(0, 0, 256, 64);
      for (let x = 0; x < 256; x += 16) {
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.fillRect(x, 0, 2, 64);
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.fillRect(x + 3, 0, 5, 64);
      }
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(0, 54, 256, 10);
    });
    tubTex.repeat.set(4, 1);
    const mTub = new THREE.MeshStandardMaterial({ map: tubTex, roughness: 0.6 });
    add(new THREE.CylinderGeometry(0.95, 0.97, 0.66, 40, 1), mTub, cx, FLOOR + 0.33, cz);
    // padded cover, slightly domed, with a seam ring
    const cover = new THREE.SphereGeometry(1, 40, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    cover.scale(0.97, 0.08, 0.97);
    add(cover, std('#3e2c22', { roughness: 0.55 }), cx, FLOOR + 0.66, cz);
    add(new THREE.TorusGeometry(0.97, 0.03, 8, 40), std('#2f221b', { roughness: 0.5 }), cx, FLOOR + 0.66, cz, Math.PI / 2);
    // small white label on the side
    add(new THREE.PlaneGeometry(0.22, 0.07), std('#e9e5dc'), cx + 0.97 * Math.sin(1.2), FLOOR + 0.48, cz + 0.97 * Math.cos(1.2) + 0.002, 0, 1.2, 0);
    addCircle(cx, cz, 0.98, FLOOR - 0.1, FLOOR + 0.8);
  }
  // ---------------------------------------------------------------- teal butterfly rug, purple mosaic bistro table, yellow wire chairs
  {
    // right in front of the kitchen door, against the outer railing
    const cx = -2.45;
    const cz = KITCHEN_DOOR.zc;
    const rugTex = canvasTex(512, 384, (ctx) => {
      ctx.fillStyle = '#2f9fae';
      ctx.fillRect(0, 0, 512, 384);
      ctx.strokeStyle = '#173b78';
      ctx.lineWidth = 14;
      ctx.strokeRect(14, 14, 484, 356);
      const r = mulberry32(5);
      ctx.fillStyle = '#1d3f86';
      for (let i = 0; i < 9; i++) {
        const x = 60 + (i % 3) * 190 + r() * 30;
        const y = 70 + Math.floor(i / 3) * 120 + r() * 20;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate((r() - 0.5) * 0.8);
        const s = 0.8 + r() * 0.5;
        ctx.scale(s, s);
        for (const sx of [-1, 1]) {
          ctx.beginPath();
          ctx.ellipse(sx * 22, -14, 24, 18, sx * 0.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.ellipse(sx * 16, 16, 15, 12, -sx * 0.4, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillRect(-3, -24, 6, 48);
        ctx.restore();
      }
      for (let i = 0; i < 3000; i++) {
        ctx.fillStyle = `rgba(255,255,255,${r() * 0.08})`;
        ctx.fillRect(r() * 512, r() * 384, 2, 2);
      }
    });
    rugTex.wrapS = rugTex.wrapT = THREE.ClampToEdgeWrapping;
    const rug = add(new THREE.PlaneGeometry(2.0, 1.5), decal(new THREE.MeshStandardMaterial({ map: rugTex, roughness: 1 })), cx + 0.25, FLOOR + 0.007, cz, -Math.PI / 2, 0, Math.PI / 2);
    rug.castShadow = false;
    // table: purple swirled mosaic top on a black wrought-iron base
    const topTex = canvasTex(256, 256, (ctx) => {
      ctx.fillStyle = '#5a3f8f';
      ctx.fillRect(0, 0, 256, 256);
      const r = mulberry32(9);
      for (let ring = 0; ring < 12; ring++) {
        const rad = 10 + ring * 10;
        const n = 6 + ring * 5;
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2 + ring * 0.2;
          const t = r();
          ctx.fillStyle = `rgb(${80 + t * 70},${60 + t * 50},${140 + t * 70})`;
          ctx.fillRect(128 + Math.cos(a) * rad - 4, 128 + Math.sin(a) * rad - 4, 8, 8);
        }
      }
    });
    const mIron = std('#1c1c1c', { roughness: 0.55, metalness: 0.3 });
    add(new THREE.CylinderGeometry(0.42, 0.42, 0.04, 32), new THREE.MeshStandardMaterial({ map: topTex, roughness: 0.3 }), cx, FLOOR + 0.72, cz);
    add(new THREE.TorusGeometry(0.42, 0.02, 6, 32), mIron, cx, FLOOR + 0.72, cz, Math.PI / 2);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      add(new THREE.CylinderGeometry(0.012, 0.012, 0.74), mIron, cx + Math.cos(a) * 0.2, FLOOR + 0.36, cz + Math.sin(a) * 0.2, Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25);
    }
    addCircle(cx, cz, 0.44, FLOOR - 0.1, FLOOR + 0.78);
    // potted plant on the table
    pottedPlant(cx + 0.1, FLOOR + 0.74, cz - 0.05, 0.09, '#6a3a24', leafMat, 9, 0.32);
    // yellow wire mesh bistro chairs
    const wire = canvasTex(64, 64, (ctx) => {
      ctx.clearRect(0, 0, 64, 64);
      ctx.strokeStyle = '#e8c832';
      ctx.lineWidth = 3;
      for (let i = 0; i <= 64; i += 8) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, 64);
        ctx.moveTo(0, i);
        ctx.lineTo(64, i);
        ctx.stroke();
      }
    });
    wire.repeat.set(4, 4);
    const mWire = new THREE.MeshStandardMaterial({ map: wire, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.45, metalness: 0.3 });
    const mYellow = std('#e2c32e', { roughness: 0.45, metalness: 0.3 });
    // chairs on the railing side of the table, leaving the walkway by the house clear
    for (const [a, face] of [
      [2.25, 0],
      [4.05, 0],
    ]) {
      void face;
      const x = cx + Math.cos(a) * 0.75;
      const z = cz + Math.sin(a) * 0.75;
      const ch = new THREE.Group();
      ch.position.set(x, FLOOR, z);
      ch.rotation.y = Math.atan2(cx - x, cz - z) + Math.PI;
      group.add(ch);
      const seat = new THREE.Mesh(new THREE.CircleGeometry(0.22, 20), mWire);
      seat.rotation.x = -Math.PI / 2;
      seat.position.y = 0.45;
      ch.add(seat);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.012, 6, 24), mYellow);
      rim.rotation.x = Math.PI / 2;
      rim.position.y = 0.45;
      ch.add(rim);
      const back = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.4, 20, 1, true, -Math.PI * 0.45, Math.PI * 0.9), mWire);
      back.position.set(0, 0.67, 0);
      ch.add(back);
      for (let k = 0; k < 4; k++) {
        const la = (k / 4) * Math.PI * 2 + Math.PI / 4;
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.46), mYellow);
        leg.position.set(Math.cos(la) * 0.17, 0.225, Math.sin(la) * 0.17);
        leg.rotation.set(Math.sin(la) * 0.15, 0, -Math.cos(la) * 0.15);
        ch.add(leg);
      }
      ch.traverse((o) => ((o as THREE.Mesh).castShadow = true));
      addCircle(x, z, 0.26, FLOOR - 0.1, FLOOR + 0.9);
    }
  }
  // ---------------------------------------------------------------- covered kamado grill by the door
  {
    // on the front (carport) end of the deck
    const x = -1.05;
    const z = -1.95;
    const cover = new THREE.SphereGeometry(0.36, 20, 14);
    const pos = cover.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const k = y < 0 ? 1 + y * 0.25 : 1;
      pos.setX(i, pos.getX(i) * k * (1 + Math.sin(i * 1.7) * 0.02));
      pos.setZ(i, pos.getZ(i) * k);
      pos.setY(i, y * 1.35);
    }
    cover.computeVertexNormals();
    add(cover, std('#3a3b3d', { roughness: 0.85 }), x, FLOOR + 0.62, z);
    // cover skirt drooping over the cart's side shelves
    add(boxGeo(0.95, 0.5, 0.42), std('#35363a', { roughness: 0.9 }), x, FLOOR + 0.5, z);
    for (const sx of [-0.4, 0.4]) add(new THREE.CylinderGeometry(0.03, 0.03, 0.06, 10), std('#111'), x + sx, FLOOR + 0.03, z, Math.PI / 2);
    addCircle(x, z, 0.48, FLOOR - 0.1, FLOOR + 1.1);
  }
  // ---------------------------------------------------------------- pots on the railing cap and on the deck
  const capY = FLOOR + 0.94;
  const potCols = ['#2e5f9e', '#3b6fb0', '#264f86', '#6a3a24'];
  for (const [i, [x, z]] of (
    [
      [DECK.x0 + 0.03, -1.75],
      [DECK.x0 + 0.03, -4.25],
      [DECK.x0 + 0.03, -5.95],
      [-2.6, DECK.z0],
      [-1.6, DECK.z0],
    ] as [number, number][]
  ).entries())
    pottedPlant(x, capY, z, 0.12 + (i % 2) * 0.03, potCols[i % potCols.length], leafMat, 10, 0.5);
  // pink-red ti plant in a big pot beside the hot tub, and a philodendron just south of the door
  pottedPlant(-2.95, FLOOR, -4.0, 0.2, '#6a3a24', tiMat, 14, 0.75);
  addCircle(-2.95, -4.0, 0.24, FLOOR - 0.1, FLOOR + 0.9);
  pottedPlant(-0.3, FLOOR, -2.25, 0.16, '#2e5f9e', leafMat, 12, 0.6);
  addCircle(-0.3, -2.25, 0.2, FLOOR - 0.1, FLOOR + 0.8);
  // ---------------------------------------------------------------- reed screen with string lights along the outer railing, behind the table
  {
    const z0 = DECK.z0 - 0.15;
    const z1 = -4.05;
    const len = z0 - z1;
    const h = 1.9;
    const reed = canvasTex(256, 64, (ctx) => {
      const r = mulberry32(3);
      for (let x = 0; x < 256; x += 3) {
        const t = r();
        ctx.fillStyle = `rgb(${150 + t * 50},${120 + t * 40},${70 + t * 25})`;
        ctx.fillRect(x, 0, 3, 64);
        ctx.fillStyle = 'rgba(60,40,15,0.4)';
        ctx.fillRect(x + 2.4, 0, 0.6, 64);
      }
      ctx.fillStyle = 'rgba(70,50,20,0.55)';
      for (const y of [14, 48]) ctx.fillRect(0, y, 256, 1.5);
    });
    reed.repeat.set(len / 0.8, 1);
    const scr = add(new THREE.PlaneGeometry(len, h), new THREE.MeshStandardMaterial({ map: reed, side: THREE.DoubleSide, roughness: 0.95 }), DECK.x0 - 0.06, FLOOR + h / 2, (z0 + z1) / 2, 0, Math.PI / 2, 0);
    void scr;
    // string lights draped along the top
    const bulbMat = new THREE.MeshBasicMaterial({ color: '#ffd98a' });
    const wire = std('#151515');
    const pts: THREE.Vector3[] = [];
    const spans = 3;
    for (let i = 0; i <= 36; i++) {
      const t = i / 36;
      const local = (t * spans) % 1;
      pts.push(new THREE.Vector3(DECK.x0 - 0.02, FLOOR + h + 0.05 - Math.sin(local * Math.PI) * 0.18, z0 - len * t));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    add(new THREE.TubeGeometry(curve, 60, 0.004, 4), wire, 0, 0, 0);
    for (let i = 1; i < 18; i++) {
      const p = curve.getPoint(i / 18);
      add(new THREE.SphereGeometry(0.022, 8, 6), bulbMat, p.x + 0.02, p.y - 0.04, p.z).castShadow = false;
    }
  }
  // ---------------------------------------------------------------- navy floral blanket hung on the corner post at the top of the stairs
  {
    const tex = canvasTex(128, 256, (ctx) => {
      ctx.fillStyle = '#1d2140';
      ctx.fillRect(0, 0, 128, 256);
      const r = mulberry32(17);
      for (let i = 0; i < 26; i++) {
        const x = r() * 128, y = r() * 256, s = 8 + r() * 12;
        const pal = ['#e7b48c', '#d9865a', '#f1d7b8', '#b9523a', '#6f8c6a'];
        ctx.fillStyle = pal[Math.floor(r() * pal.length)];
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * Math.PI * 2 + r();
          ctx.beginPath();
          ctx.ellipse(x + Math.cos(a) * s * 0.5, y + Math.sin(a) * s * 0.5, s * 0.45, s * 0.25, a, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = '#3a2a1c';
        ctx.beginPath(); ctx.arc(x, y, s * 0.18, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = '#e9e4da';
      ctx.fillRect(0, 0, 6, 256); // pale lining showing at one edge
    });
    const w = 0.62, h = 1.75;
    const g = new THREE.PlaneGeometry(w, h, 10, 1);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin((pos.getX(i) / w) * Math.PI * 3) * 0.035);
    g.computeVertexNormals();
    add(g, new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.9 }), DECK.x0 + 0.05, FLOOR + 0.1 + h / 2, DECK.z1 + 0.12 + w / 2, 0, Math.PI / 2, 0);
    add(new THREE.CylinderGeometry(0.008, 0.008, w + 0.1), std('#2a2a2a'), DECK.x0 + 0.05, FLOOR + 0.12 + h, DECK.z1 + 0.12 + w / 2, Math.PI / 2, 0, 0);
    // the tall 2x4 it hangs from, screwed to the corner post
    add(boxGeo(0.045, 2.05 - 0.95, 0.09), std('#9c8463', { roughness: 0.9 }), DECK.x0 + 0.03, FLOOR + 0.95 + (2.05 - 0.95) / 2, DECK.z1 + 0.07);
  }
  // stone Buddha and a little owl in the front corner of the deck by the reed screen
  {
    const stone = std('#8e8a80', { roughness: 0.95 });
    const bx = DECK.x0 + 0.35;
    const bz = DECK.z0 - 0.4;
    add(new THREE.CylinderGeometry(0.2, 0.22, 0.08, 18), stone, bx, FLOOR + 0.04, bz);
    const body = new THREE.SphereGeometry(0.17, 16, 12);
    body.scale(1.1, 1.05, 0.85);
    add(body, stone, bx, FLOOR + 0.22, bz);
    add(new THREE.SphereGeometry(0.085, 14, 10), stone, bx, FLOOR + 0.44, bz);
    add(new THREE.SphereGeometry(0.03, 8, 6), stone, bx, FLOOR + 0.53, bz);
    add(new THREE.TorusGeometry(0.1, 0.04, 8, 16), stone, bx, FLOOR + 0.12, bz + 0.05, Math.PI / 2);
    addCircle(bx, bz, 0.24, FLOOR - 0.1, FLOOR + 0.6);
    const owl = new THREE.SphereGeometry(0.08, 12, 10);
    owl.scale(1, 1.4, 0.9);
    add(owl, std('#6b5038', { roughness: 0.8 }), bx + 0.42, FLOOR + 0.11, bz - 0.05);
    for (const sx of [-0.03, 0.03]) add(new THREE.SphereGeometry(0.018, 8, 6), std('#e3c45a'), bx + 0.42 + sx, FLOOR + 0.16, bz - 0.12);
  }
  // ---------------------------------------------------------------- pavers at the stair foot
  {
    const zBot = STAIRS.zTop - STAIRS.run * STAIRS.steps;
    const mPaver = std('#9a948a', { roughness: 0.95 });
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 2; j++) B.box(mPaver, STAIRS.x0 + 0.3 + i * 0.42, 0.02, zBot - 0.25 - j * 0.42, 0.4, 0.04, 0.4, 1, (R() - 0.5) * 0.06);
  }
  // ---------------------------------------------------------------- foundation: red brick piers between the white lattice panels
  {
    const brick = canvasTex(128, 128, (ctx) => {
      ctx.fillStyle = '#c9c1b2';
      ctx.fillRect(0, 0, 128, 128);
      const r = mulberry32(31);
      for (let row = 0; row < 8; row++)
        for (let k = -1; k < 4; k++) {
          const x = k * 32 + (row % 2) * 16;
          const t = r();
          ctx.fillStyle = `rgb(${135 + t * 40},${58 + t * 20},${44 + t * 15})`;
          ctx.fillRect(x + 1, row * 16 + 1, 30, 14);
        }
    });
    brick.repeat.set(1, 1);
    const mBrickP = new THREE.MeshStandardMaterial({ map: brick, roughness: 0.95 });
    const pier = (x: number, z: number) => {
      const g = boxGeo(0.42, FLOOR - 0.04, 0.42, 0.45);
      B.add(g, mBrickP, x, (FLOOR - 0.04) / 2, z);
    };
    // back wall (z = HOUSE.z1), front wall, the yard-side end (x = HOUSE.x1) and the laundry
    for (let x = 0.2; x <= HOUSE.x1 - 0.1; x += 2.4) {
      pier(x, HOUSE.z1 - 0.12);
      if (Math.abs(x - FRONT_DOOR.xc) > 1.0) pier(x, 0.12);
    }
    pier(HOUSE.x1 - 0.2, HOUSE.z1 - 0.12);
    for (let z = ROW - 0.4; z >= HOUSE.z1 + 0.3; z -= 1.6) pier(HOUSE.x1 + 0.12, z);
    pier(ROOMS.laundry.x1 + 0.12, -0.2);
    pier(ROOMS.laundry.x1 + 0.12, ROW + 0.25);
    pier(ROOMS.laundry.x1 - 0.2, 0.12);
  }
  // ---------------------------------------------------------------- tankless water heater + conduit on the back wall, cinder blocks, hose
  {
    const wx = 7.45; // just east of the bath window, between it and the spare room's high window
    const wz = HOUSE.z1 - 0.1;
    add(boxGeo(0.4, 0.62, 0.2), std('#9fa3a6', { metalness: 0.5, roughness: 0.4 }), wx, FLOOR + 1.35, wz - 0.03);
    add(boxGeo(0.12, 0.16, 0.08), std('#d8d8d4'), wx + 0.4, FLOOR + 0.9, wz - 0.02);
    for (const dx of [-0.1, 0.0, 0.1]) add(new THREE.CylinderGeometry(0.014, 0.014, 0.9), std(dx === 0 ? '#c9a24a' : '#d8d8d4', { metalness: 0.4 }), wx + dx, FLOOR + 0.6, wz - 0.06);
    const cb = std('#a8a59e', { roughness: 1 });
    add(boxGeo(0.4, 0.2, 0.2), cb, wx - 0.6, 0.1, wz - 0.35, 0, 0.3, 0);
    add(boxGeo(0.4, 0.2, 0.2), cb, wx + 0.5, 0.1, wz - 0.45, 0, -0.2, 0);
    // a coil of black hose on the ground
    add(new THREE.TorusGeometry(0.28, 0.018, 6, 30), std('#151515'), wx - 1.2, 0.02, wz - 0.5, Math.PI / 2);
    add(new THREE.TorusGeometry(0.22, 0.018, 6, 30), std('#151515'), wx - 1.18, 0.05, wz - 0.48, Math.PI / 2 + 0.1);
  }

  B.build(group, 'deck-static');
  return group;
}
