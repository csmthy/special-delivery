import { boxes, circles, groundHeight, FLAP, FLOOR, type Box } from '../world/layout';

/** Push a circle (x,z,r) at standing height y out of colliders. Mutates and returns pos. */
export function resolve(pos: { x: number; z: number }, r: number, y: number, h = 0.35) {
  const y0 = y + 0.04;
  const y1 = y + h;
  for (let iter = 0; iter < 3; iter++) {
    let moved = false;
    for (const b of boxes) {
      if (b.maxY < y0 || b.minY > y1) continue;
      const cx = Math.max(b.minX, Math.min(pos.x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
      const dx = pos.x - cx;
      const dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-9) {
        const d = Math.sqrt(d2);
        pos.x = cx + (dx / d) * r;
        pos.z = cz + (dz / d) * r;
      } else {
        // centre inside the box: push out along the shallowest axis
        const l = pos.x - b.minX, rr = b.maxX - pos.x, f = pos.z - b.minZ, k = b.maxZ - pos.z;
        const m = Math.min(l, rr, f, k);
        if (m === l) pos.x = b.minX - r;
        else if (m === rr) pos.x = b.maxX + r;
        else if (m === f) pos.z = b.minZ - r;
        else pos.z = b.maxZ + r;
      }
      moved = true;
    }
    for (const c of circles) {
      if (c.maxY < y0 || c.minY > y1) continue;
      const dx = pos.x - c.x;
      const dz = pos.z - c.z;
      const rr = c.r + r;
      const d2 = dx * dx + dz * dz;
      if (d2 >= rr * rr) continue;
      const d = Math.sqrt(d2) || 1e-4;
      pos.x = c.x + (dx / d) * rr;
      pos.z = c.z + (dz / d) * rr;
      moved = true;
    }
    if (!moved) break;
  }
  return pos;
}

/**
 * Move from (x,z) by (dx,dz) with collision, step-height limits and the dog-flap funnel.
 * Returns the new position and ground height.
 */
export function moveActor(x: number, z: number, dx: number, dz: number, r: number, h = 0.35) {
  const y0 = groundHeight(x, z);
  // dog-flap funnel: near the door plane, nudge toward the flap centre so pets slip through
  const nearFlap = Math.abs(x - FLAP.x) < 0.55 && Math.abs(z - FLAP.zc) < 0.75 && y0 > FLOOR - 0.1;
  if (nearFlap && Math.abs(dx) > Math.abs(dz) * 0.4) {
    const pull = (FLAP.zc - z) * Math.min(1, 9 * Math.hypot(dx, dz));
    dz += pull;
  }
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / (r * 0.5)));
  let px = x;
  let pz = z;
  let py = y0;
  for (let i = 0; i < n; i++) {
    const nx = px + dx / n;
    const nz = pz + dz / n;
    const ny = groundHeight(nx, nz);
    if (ny - py > 0.3) break; // too high a step (deck edge from the lawn, etc.)
    const p = { x: nx, z: nz };
    const effR = nearFlap ? Math.min(r, FLAP.w / 2 - 0.035) : r;
    resolve(p, effR, ny, h);
    const gy = groundHeight(p.x, p.z);
    if (gy - py > 0.3) break;
    px = p.x;
    pz = p.z;
    py = gy;
  }
  return { x: px, z: pz, y: py };
}

/** Ray-march the camera from target to desired position; returns allowed fraction (0..1). */
export function cameraClear(tx: number, ty: number, tz: number, cx: number, cy: number, cz: number, pad = 0.12): number {
  const steps = 24;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = tx + (cx - tx) * t;
    const y = ty + (cy - ty) * t;
    const z = tz + (cz - tz) * t;
    if (blocked(x, y, z, pad)) return Math.max(0, (i - 1.5) / steps);
  }
  return 1;
}

function blocked(x: number, y: number, z: number, pad: number) {
  for (const b of boxes as Box[]) {
    if (!b.cam) continue;
    if (y < b.minY - pad || y > b.maxY + pad) continue;
    if (x > b.minX - pad && x < b.maxX + pad && z > b.minZ - pad && z < b.maxZ + pad) return true;
  }
  return false;
}
