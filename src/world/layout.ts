// World layout from the owner's two sketches and the Oct 2026 walkthrough videos
// (front of house = +z, backyard = -z, drawing-left = -x). Dimensions are approximations
// (~1,050 sq ft), not surveyed. Room topology follows the second, annotated sketch:
//   back row  (drawing top):    main bedroom | bath over hall | spare bedroom
//   front row (drawing bottom): kitchen (narrow galley, runs front-to-back) | dining | living | laundry
// The laundry sticks out past the spare bedroom on the right, as in both sketches.

export const FLOOR = 0.75; // raised floor height (pier foundation)
export const CEIL = FLOOR + 2.45;
export const WALL_T = 0.12;

export const ROW = -3.9; // wall between the front and back rows
export const HALL_BATH = -5.7; // wall between hall (front) and bathroom (back)

// Rooms (x0,x1,z0,z1) with z0 > z1 (front is +z)
export const ROOMS = {
  kitchen: { x0: 0, x1: 2.8, z0: 0, z1: ROW },
  dining: { x0: 2.8, x1: 6.8, z0: 0, z1: ROW },
  living: { x0: 6.8, x1: 10.7, z0: 0, z1: ROW },
  laundry: { x0: 10.7, x1: 13.3, z0: 0, z1: ROW },
  mainBed: { x0: 0, x1: 4.5, z0: ROW, z1: -7.6 },
  hall: { x0: 4.5, x1: 8.0, z0: ROW, z1: HALL_BATH },
  bath: { x0: 4.5, x1: 8.0, z0: HALL_BATH, z1: -7.6 },
  spareBed: { x0: 8.0, x1: 12.1, z0: ROW, z1: -7.6 },
};
export type RoomName = keyof typeof ROOMS;

export const HOUSE = { x0: 0, x1: 12.1, z0: 0, z1: -7.6 }; // main block (the laundry adds x 12.1..13.3 in front)

// Key openings
export const KITCHEN_DOOR = { x: 0, zc: -3.0, w: 0.9 }; // exterior door at the back end of the galley, with the dog flap
export const FLAP = { x: 0, zc: -3.0, w: 0.46, h: 0.42 };
export const KD_OPEN = { x: 2.8, zc: -2.65, w: 0.95 }; // kitchen -> dining doorway, just in front of the fridge
export const DL_OPEN = { x: 6.8, zc: -2.25, w: 1.45 }; // dining -> living (red-orange casing)
export const HALL_OPEN = { z: ROW, xc: 5.6, w: 0.8 }; // dining -> hall (curtained)
export const MAIN_DOOR = { z: ROW, xc: 1.3, w: 0.82 }; // kitchen -> main bedroom
export const LAUNDRY_DOOR = { x: 10.7, zc: -1.5, w: 0.8 }; // living -> laundry (teal)
export const FRONT_DOOR = { z: 0, xc: 7.6, w: 0.92 }; // right beside the dining opening, as in the video
export const BASKET = { x: 8.35, z: -2.05 };

// Deck, stairs and ramp: out of the kitchen door, turn right, walk along the house to the stairs
export const DECK = { x0: -3.3, x1: 0, z0: -1.4, z1: -6.4 };
export const STAIRS = { x0: -2.2, x1: -0.08, zTop: -6.4, run: 0.3, steps: 4 }; // treads down to ground at z=-7.6
export const RAMP = { x0: -0.5, x1: -0.08, zTop: -6.4, zBottom: -8.05 }; // ~20% of stair width, extends past bottom step
export const STAIR_FOOT = { x: -1.0, z: -8.6 };
export const HOLE = { x: 0.72, z: -7.6, w: 0.42, h: 0.36 }; // Babadook's hole in the lattice, beside the stairs

export const CARPORT = { x0: -3.9, x1: -0.7, z0: 5.0, z1: -0.6 };
// The fenced backyard: wood fence on the left, chain-link across the back and down the right side to the shed,
// then chain-link from the shed to the back-right corner of the house. No fence around the front.
export const LOT = { x0: -4.4, x1: 12.2, z0: 11, z1: -19.0 };

// Shed: long side runs front-to-back, close to the back-right corner of the house, door facing the yard (west).
// The south (near-house) part is the darker extension with the glazed door; the north part is the white block.
export const SHED = { x0: 9.3, x1: 13.3, z0: -8.8, z1: -15.2, split: -12.0 };
export const GARDEN = { cx: 4.4, cz: -12.6, rx: 4.0, rz: 0.85, rot: 0 };
export const OAK = { x: -2.3, z: -12.4, r: 0.55 };
export const OAK2 = { x: -2.6, z: -30.5, r: 0.42 }; // neighbour's tree beyond the back fence
export const FRONT_OAK = { x: 5.5, z: 6.8, r: 0.6 };
export const CHAIRS = [
  // between the house and the garden, east of the oak
  { x: 2.0, z: -9.5, rot: 0.15 },
  { x: 3.9, z: -9.2, rot: -0.2 },
];

// ------------------------------------------------------------------ colliders
export interface Box {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  minY: number;
  maxY: number;
  cam: boolean; // blocks camera
  tag?: string;
}
export interface Circle {
  x: number;
  z: number;
  r: number;
  minY: number;
  maxY: number;
}

export const boxes: Box[] = [];
export const circles: Circle[] = [];

export function addBox(minX: number, maxX: number, minZ: number, maxZ: number, minY = 0, maxY = 3, cam = true, tag?: string) {
  const b: Box = { minX: Math.min(minX, maxX), maxX: Math.max(minX, maxX), minZ: Math.min(minZ, maxZ), maxZ: Math.max(minZ, maxZ), minY, maxY, cam, tag };
  boxes.push(b);
  return b;
}
export function addCircle(x: number, z: number, r: number, minY = 0, maxY = 3) {
  circles.push({ x, z, r, minY, maxY });
}

// ------------------------------------------------------------------ ground height
export function inRect(x: number, z: number, r: { x0: number; x1: number; z0: number; z1: number }, pad = 0) {
  return x >= Math.min(r.x0, r.x1) - pad && x <= Math.max(r.x0, r.x1) + pad && z <= Math.max(r.z0, r.z1) + pad && z >= Math.min(r.z0, r.z1) - pad;
}

export function insideHouse(x: number, z: number) {
  return inRect(x, z, HOUSE) || inRect(x, z, ROOMS.laundry);
}

/** Surface height a pet stands on at (x,z), given its current height (for multi-level areas). */
export function groundHeight(x: number, z: number): number {
  if (insideHouse(x, z)) return FLOOR;
  if (inRect(x, z, DECK)) return FLOOR;
  // ramp (smooth slope)
  if (x >= RAMP.x0 && x <= RAMP.x1 && z <= RAMP.zTop && z >= RAMP.zBottom) {
    const t = (RAMP.zTop - z) / (RAMP.zTop - RAMP.zBottom);
    return FLOOR * (1 - t);
  }
  // stairs (treads)
  if (x >= STAIRS.x0 && x < RAMP.x0 && z <= STAIRS.zTop && z > STAIRS.zTop - STAIRS.run * STAIRS.steps) {
    const k = Math.floor((STAIRS.zTop - z) / STAIRS.run); // 0..steps-1
    return FLOOR - ((k + 1) * FLOOR) / (STAIRS.steps + 1);
  }
  // front entry steps
  if (x > FRONT_DOOR.xc - 0.75 && x < FRONT_DOOR.xc + 0.75 && z > 0 && z < 0.9) {
    const k = Math.floor(z / 0.3);
    return FLOOR - ((k + 1) * FLOOR) / 4;
  }
  return 0;
}

export function surfaceType(x: number, z: number): 'wood' | 'grass' | 'tile' | 'concrete' {
  if (inRect(x, z, ROOMS.kitchen) || inRect(x, z, ROOMS.bath) || inRect(x, z, ROOMS.laundry)) return 'tile';
  if (insideHouse(x, z) || inRect(x, z, DECK, 0.05) || (z < -6.3 && z > -8.1 && x > -2.3 && x < 0)) return 'wood';
  if (inRect(x, z, CARPORT) || (x > -3.9 && x < -0.7 && z > 5.6)) return 'concrete';
  return 'grass';
}

export function roomAt(x: number, z: number): RoomName | 'deck' | 'yard' | 'front' {
  for (const [k, r] of Object.entries(ROOMS)) if (inRect(x, z, r)) return k as RoomName;
  if (inRect(x, z, DECK) || (z < -6.3 && z > -8.1 && x > -2.3 && x < 0)) return 'deck';
  return z < -7.6 ? 'yard' : 'front';
}

// ------------------------------------------------------------------ wall definitions
export interface Opening {
  a: number; // start along wall
  b: number;
  bottom: number; // above floor
  top: number;
  kind: 'door' | 'window' | 'open' | 'flap';
}
export interface WallDef {
  axis: 'x' | 'z'; // wall runs along this axis
  fixed: number; // coordinate of the other axis
  from: number;
  to: number;
  exterior: boolean;
  openings: Opening[];
  base: number; // y of bottom
  height: number;
  outward?: 1 | -1; // which side faces outdoors for exterior walls (sign along the fixed axis)
}

const W = (axis: 'x' | 'z', fixed: number, from: number, to: number, exterior: boolean, openings: Opening[] = [], outward?: 1 | -1): WallDef => ({
  axis,
  fixed,
  from: Math.min(from, to),
  to: Math.max(from, to),
  exterior,
  openings,
  base: FLOOR,
  height: CEIL - FLOOR,
  outward,
});
const door = (c: number, w: number, kind: Opening['kind'] = 'door', top = 2.05): Opening => ({ a: c - w / 2, b: c + w / 2, bottom: 0, top, kind });
const win = (a: number, b: number, bottom = 0.85, top = 2.05): Opening => ({ a, b, bottom, top, kind: 'window' });

export const WALLS: WallDef[] = [
  // exterior
  W('x', 0, 0, ROOMS.laundry.x1, true, [win(0.95, 1.85, 1.0), win(5.15, 6.35), door(FRONT_DOOR.xc, FRONT_DOOR.w), win(8.45, 9.95), win(11.6, 12.5, 1.0)], 1),
  W('x', -7.6, 0, 12.1, true, [win(2.3, 3.2), win(6.45, 6.95, 1.45), win(9.9, 10.7, 1.4)], -1),
  W('z', 0, 0, -7.6, true, [door(KITCHEN_DOOR.zc, KITCHEN_DOOR.w, 'door'), win(-4.3, -5.1)], -1),
  W('z', 12.1, ROW, -7.6, true, [win(-5.4, -6.4)], 1),
  W('z', ROOMS.laundry.x1, 0, ROW, true, [win(-0.8, -1.8, 1.1)], 1),
  W('x', ROW, 12.1, ROOMS.laundry.x1, true, [], -1),
  // interior
  W('x', ROW, 0, 12.1, false, [door(MAIN_DOOR.xc, MAIN_DOOR.w), { a: HALL_OPEN.xc - HALL_OPEN.w / 2, b: HALL_OPEN.xc + HALL_OPEN.w / 2, bottom: 0, top: 2.05, kind: 'open' }]),
  W('z', KD_OPEN.x, 0, ROW, false, [door(KD_OPEN.zc, KD_OPEN.w, 'open', 2.05)]),
  W('z', DL_OPEN.x, 0, ROW, false, [{ a: DL_OPEN.zc - DL_OPEN.w / 2, b: DL_OPEN.zc + DL_OPEN.w / 2, bottom: 0, top: 2.15, kind: 'open' }]),
  W('z', LAUNDRY_DOOR.x, 0, ROW, false, [door(LAUNDRY_DOOR.zc, LAUNDRY_DOOR.w)]),
  W('z', 4.5, ROW, -7.6, false, [door(-4.75, 0.78)]),
  W('z', 8.0, ROW, -7.6, false, [door(-4.75, 0.78)]),
  W('x', HALL_BATH, 4.5, 8.0, false, [door(5.85, 0.72)]),
];

/** Build wall colliders (pass-through at door/open/flap openings; the closed front door and kitchen door are added separately). */
export function buildWallColliders() {
  for (const w of WALLS) {
    const t = WALL_T / 2;
    let cursor = w.from;
    const solid: [number, number][] = [];
    const sorted = [...w.openings].sort((p, q) => Math.min(p.a, p.b) - Math.min(q.a, q.b));
    for (const o of sorted) {
      const a = Math.min(o.a, o.b);
      const b = Math.max(o.a, o.b);
      if (o.kind === 'window') continue; // windows are solid for collision
      if (a > cursor) solid.push([cursor, a]);
      cursor = Math.max(cursor, b);
    }
    if (cursor < w.to) solid.push([cursor, w.to]);
    for (const [a, b] of solid) {
      if (w.axis === 'x') addBox(a, b, w.fixed - t, w.fixed + t, 0, CEIL + 0.2, true, 'wall');
      else addBox(w.fixed - t, w.fixed + t, a, b, 0, CEIL + 0.2, true, 'wall');
    }
    // lintels above doors block camera
    for (const o of w.openings) {
      if (o.kind === 'window') continue;
      const a = Math.min(o.a, o.b);
      const b = Math.max(o.a, o.b);
      if (w.axis === 'x') addBox(a, b, w.fixed - t, w.fixed + t, FLOOR + o.top, CEIL + 0.2, true, 'lintel');
      else addBox(w.fixed - t, w.fixed + t, a, b, FLOOR + o.top, CEIL + 0.2, true, 'lintel');
    }
  }
  // Kitchen exterior door: solid except the flap. Camera may pass through the whole door opening.
  const kz0 = KITCHEN_DOOR.zc - KITCHEN_DOOR.w / 2;
  const kz1 = KITCHEN_DOOR.zc + KITCHEN_DOOR.w / 2;
  const fz0 = FLAP.zc - FLAP.w / 2;
  const fz1 = FLAP.zc + FLAP.w / 2;
  addBox(-0.06, 0.06, kz0, fz0, 0, CEIL, false, 'door');
  addBox(-0.06, 0.06, fz1, kz1, 0, CEIL, false, 'door');
  addBox(-0.06, 0.06, fz0, fz1, FLOOR + FLAP.h, CEIL, false, 'door');
  // Front door (closed during play) — tagged so the ending can open it
  addBox(FRONT_DOOR.xc - FRONT_DOOR.w / 2, FRONT_DOOR.xc + FRONT_DOOR.w / 2, -0.06, 0.06, 0, CEIL, true, 'frontdoor');
  // Foundation: nobody walks under the house except Babadook
  addBox(HOUSE.x0, HOUSE.x1, HOUSE.z1, HOUSE.z0, 0, FLOOR - 0.05, true, 'foundation');
  addBox(ROOMS.laundry.x0, ROOMS.laundry.x1, ROOMS.laundry.z1, ROOMS.laundry.z0, 0, FLOOR - 0.05, true, 'foundation');
}

export function buildDeckColliders() {
  // deck skirt (blocks ground-level walking under the deck)
  addBox(DECK.x0, DECK.x1, DECK.z1, DECK.z0, 0, FLOOR - 0.22, true, 'deckskirt'); // below the top tread so pets step freely
  // railings
  addBox(DECK.x0 - 0.05, DECK.x0 + 0.05, DECK.z1, DECK.z0, FLOOR - 0.1, FLOOR + 0.95, true, 'rail');
  addBox(DECK.x0, DECK.x1, DECK.z0 - 0.05, DECK.z0 + 0.05, FLOOR - 0.1, FLOOR + 0.95, true, 'rail');
  // the back edge of the wide deck beside the stairs
  addBox(DECK.x0, STAIRS.x0 - 0.12, DECK.z1 - 0.05, DECK.z1 + 0.05, FLOOR - 0.1, FLOOR + 0.95, true, 'rail');
  // stair side (outer) with stringer under it
  const zBot = STAIRS.zTop - STAIRS.run * STAIRS.steps;
  addBox(STAIRS.x0 - 0.12, STAIRS.x0 - 0.02, zBot, STAIRS.zTop, 0, FLOOR + 0.95, true, 'rail');
  // under the stairs/ramp: block walking underneath the risers (each tread blocks below itself)
  for (let k = 0; k < STAIRS.steps; k++) {
    const h = FLOOR - ((k + 1) * FLOOR) / (STAIRS.steps + 1);
    const z0 = STAIRS.zTop - STAIRS.run * k;
    addBox(STAIRS.x0, RAMP.x0, z0 - STAIRS.run, z0, 0, h - 0.16, false, 'stairbody');
  }
}
