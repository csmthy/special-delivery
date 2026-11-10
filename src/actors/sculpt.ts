// Signed-distance "clay" sculpting for organic characters: blended ellipsoids/capsules,
// polygonised with marching cubes into one smooth mesh, with automatic skin weights.
import * as THREE from 'three';
import { edgeTable as ET0, triTable as TT0 } from 'three/examples/jsm/objects/MarchingCubes.js';
const edgeTable = ET0 as unknown as Int32Array;
const triTable = TT0 as unknown as Int32Array;

export type Prim =
  | {
      kind: 'ellipsoid';
      c: THREE.Vector3;
      r: THREE.Vector3;
      rot?: THREE.Quaternion; // orientation of the ellipsoid axes
      bone: number;
      part: string;
      k: number; // blend radius with what came before
      sub?: boolean; // carve instead of add
    }
  | {
      kind: 'capsule';
      a: THREE.Vector3;
      b: THREE.Vector3;
      ra: number;
      rb: number;
      bone: number;
      part: string;
      k: number;
      sub?: boolean;
    };

interface PrimC {
  p: Prim;
  min: THREE.Vector3;
  max: THREE.Vector3;
  inv?: THREE.Quaternion;
}

const tv = new THREE.Vector3();

function sdEllipsoid(px: number, py: number, pz: number, c: PrimC): number {
  const p = c.p as Extract<Prim, { kind: 'ellipsoid' }>;
  let x = px - p.c.x;
  let y = py - p.c.y;
  let z = pz - p.c.z;
  if (c.inv) {
    tv.set(x, y, z).applyQuaternion(c.inv);
    x = tv.x;
    y = tv.y;
    z = tv.z;
  }
  // iq's ellipsoid bound
  const k0 = Math.sqrt((x / p.r.x) ** 2 + (y / p.r.y) ** 2 + (z / p.r.z) ** 2);
  const k1 = Math.sqrt((x / (p.r.x * p.r.x)) ** 2 + (y / (p.r.y * p.r.y)) ** 2 + (z / (p.r.z * p.r.z)) ** 2);
  if (k1 < 1e-9) return -Math.min(p.r.x, p.r.y, p.r.z);
  return (k0 * (k0 - 1)) / k1;
}

function sdCapsule(px: number, py: number, pz: number, c: PrimC): number {
  const p = c.p as Extract<Prim, { kind: 'capsule' }>;
  // round cone between a and b with radii ra, rb (approximate with lerped radius)
  const bax = p.b.x - p.a.x;
  const bay = p.b.y - p.a.y;
  const baz = p.b.z - p.a.z;
  const pax = px - p.a.x;
  const pay = py - p.a.y;
  const paz = pz - p.a.z;
  const l2 = bax * bax + bay * bay + baz * baz;
  const h = Math.max(0, Math.min(1, (pax * bax + pay * bay + paz * baz) / (l2 || 1)));
  const dx = pax - bax * h;
  const dy = pay - bay * h;
  const dz = paz - baz * h;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - (p.ra + (p.rb - p.ra) * h);
}

export function primDist(px: number, py: number, pz: number, c: PrimC) {
  return c.p.kind === 'ellipsoid' ? sdEllipsoid(px, py, pz, c) : sdCapsule(px, py, pz, c);
}

function smin(a: number, b: number, k: number) {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}
function smax(a: number, b: number, k: number) {
  return -smin(-a, -b, k);
}

export class Sculpt {
  prims: PrimC[] = [];
  /** Optional surface detail (wrinkles, folds, hair clumps): added to the distance near the surface only. */
  detail: ((x: number, y: number, z: number, d: number) => number) | null = null;
  detailBand = 0.03;

  add(p: Prim) {
    const min = new THREE.Vector3();
    const max = new THREE.Vector3();
    let inv: THREE.Quaternion | undefined;
    if (p.kind === 'ellipsoid') {
      const R = Math.max(p.r.x, p.r.y, p.r.z);
      min.copy(p.c).subScalar(R);
      max.copy(p.c).addScalar(R);
      if (p.rot) inv = p.rot.clone().invert();
    } else {
      const R = Math.max(p.ra, p.rb);
      min.copy(p.a).min(p.b).subScalar(R);
      max.copy(p.a).max(p.b).addScalar(R);
    }
    const pad = p.k + 0.002;
    min.subScalar(pad);
    max.addScalar(pad);
    this.prims.push({ p, min, max, inv });
    return this;
  }

  /** Signed distance of the whole sculpt. */
  dist(x: number, y: number, z: number): number {
    let d = 1e3;
    for (const c of this.prims) {
      if (x < c.min.x || y < c.min.y || z < c.min.z || x > c.max.x || y > c.max.y || z > c.max.z) {
        if (!c.p.sub) continue;
        continue;
      }
      const di = primDist(x, y, z, c);
      d = c.p.sub ? smax(d, -di, c.p.k) : smin(d, di, c.p.k);
    }
    if (this.detail && d < this.detailBand && d > -this.detailBand) d += this.detail(x, y, z, d);
    return d;
  }

  bounds() {
    const b = new THREE.Box3();
    for (const c of this.prims) if (!c.p.sub) {
      b.expandByPoint(c.min);
      b.expandByPoint(c.max);
    }
    return b;
  }

  /**
   * Polygonise with marching cubes. Returns an indexed geometry with smooth normals
   * (from the SDF gradient), plus per-vertex skin indices/weights and dominant part names.
   */
  build(voxel: number, boneCount: number, weightFalloff = 0.01) {
    const box = this.bounds();
    const o = box.min.clone().subScalar(voxel * 2);
    const size = box.getSize(new THREE.Vector3()).addScalar(voxel * 4);
    const nx = Math.ceil(size.x / voxel) + 1;
    const ny = Math.ceil(size.y / voxel) + 1;
    const nz = Math.ceil(size.z / voxel) + 1;
    const field = new Float32Array(nx * ny * nz);
    const idx = (i: number, j: number, k: number) => i + nx * (j + ny * k);
    for (let k = 0; k < nz; k++)
      for (let j = 0; j < ny; j++)
        for (let i = 0; i < nx; i++) field[idx(i, j, k)] = this.dist(o.x + i * voxel, o.y + j * voxel, o.z + k * voxel);

    const positions: number[] = [];
    const edgeVert = new Map<number, number>();
    const indices: number[] = [];
    const cornerOff = [
      [0, 0, 0],
      [1, 0, 0],
      [1, 1, 0],
      [0, 1, 0],
      [0, 0, 1],
      [1, 0, 1],
      [1, 1, 1],
      [0, 1, 1],
    ];
    const edges = [
      [0, 1],
      [1, 2],
      [3, 2],
      [0, 3],
      [4, 5],
      [5, 6],
      [7, 6],
      [4, 7],
      [0, 4],
      [1, 5],
      [2, 6],
      [3, 7],
    ];
    const vals = new Float32Array(8);
    const cid = new Int32Array(8);
    const evi = new Int32Array(12);
    for (let k = 0; k < nz - 1; k++)
      for (let j = 0; j < ny - 1; j++)
        for (let i = 0; i < nx - 1; i++) {
          let cube = 0;
          for (let c = 0; c < 8; c++) {
            const ci = idx(i + cornerOff[c][0], j + cornerOff[c][1], k + cornerOff[c][2]);
            cid[c] = ci;
            vals[c] = field[ci];
            if (vals[c] > 0) cube |= 1 << c; // outside corners (matches three's table winding)
          }
          const bits = edgeTable[cube];
          if (!bits) continue;
          for (let e = 0; e < 12; e++) {
            if (!(bits & (1 << e))) continue;
            const [c0, c1] = edges[e];
            const a = Math.min(cid[c0], cid[c1]);
            const b = Math.max(cid[c0], cid[c1]);
            const key = a * 4 + (b - a === 1 ? 0 : b - a === nx ? 1 : 2);
            let vi = edgeVert.get(key);
            if (vi === undefined) {
              const v0 = vals[c0];
              const v1 = vals[c1];
              const t = Math.abs(v1 - v0) < 1e-9 ? 0.5 : v0 / (v0 - v1);
              const x = o.x + (i + cornerOff[c0][0] + (cornerOff[c1][0] - cornerOff[c0][0]) * t) * voxel;
              const y = o.y + (j + cornerOff[c0][1] + (cornerOff[c1][1] - cornerOff[c0][1]) * t) * voxel;
              const z = o.z + (k + cornerOff[c0][2] + (cornerOff[c1][2] - cornerOff[c0][2]) * t) * voxel;
              vi = positions.length / 3;
              positions.push(x, y, z);
              edgeVert.set(key, vi);
            }
            evi[e] = vi;
          }
          const base = cube << 4;
          for (let t = 0; triTable[base + t] !== -1; t += 3) indices.push(evi[triTable[base + t]], evi[triTable[base + t + 1]], evi[triTable[base + t + 2]]);
        }

    // relax vertices slightly toward the true surface and compute gradient normals
    const n = positions.length / 3;
    const normals = new Float32Array(n * 3);
    const e = voxel * 0.5;
    for (let v = 0; v < n; v++) {
      let x = positions[v * 3];
      let y = positions[v * 3 + 1];
      let z = positions[v * 3 + 2];
      for (let it = 0; it < 2; it++) {
        const d = this.dist(x, y, z);
        const gx = this.dist(x + e, y, z) - this.dist(x - e, y, z);
        const gy = this.dist(x, y + e, z) - this.dist(x, y - e, z);
        const gz = this.dist(x, y, z + e) - this.dist(x, y, z - e);
        const gl = Math.hypot(gx, gy, gz) || 1;
        const nxv = gx / gl;
        const nyv = gy / gl;
        const nzv = gz / gl;
        x -= nxv * d;
        y -= nyv * d;
        z -= nzv * d;
        normals[v * 3] = nxv;
        normals[v * 3 + 1] = nyv;
        normals[v * 3 + 2] = nzv;
      }
      positions[v * 3] = x;
      positions[v * 3 + 1] = y;
      positions[v * 3 + 2] = z;
    }
    // fix winding to face outward
    for (let t = 0; t < indices.length; t += 3) {
      const a = indices[t] * 3;
      const b = indices[t + 1] * 3;
      const c = indices[t + 2] * 3;
      const ux = positions[b] - positions[a];
      const uy = positions[b + 1] - positions[a + 1];
      const uz = positions[b + 2] - positions[a + 2];
      const wx = positions[c] - positions[a];
      const wy = positions[c + 1] - positions[a + 1];
      const wz = positions[c + 2] - positions[a + 2];
      const fx = uy * wz - uz * wy;
      const fy = uz * wx - ux * wz;
      const fz = ux * wy - uy * wx;
      if (fx * normals[a] + fy * normals[a + 1] + fz * normals[a + 2] < 0) {
        const tmp = indices[t + 1];
        indices[t + 1] = indices[t + 2];
        indices[t + 2] = tmp;
      }
    }

    // skin weights from per-primitive proximity, accumulated per bone
    const skinIndex = new Uint16Array(n * 4);
    const skinWeight = new Float32Array(n * 4);
    const parts: string[] = new Array(n);
    const acc = new Float32Array(boneCount);
    for (let v = 0; v < n; v++) {
      const x = positions[v * 3];
      const y = positions[v * 3 + 1];
      const z = positions[v * 3 + 2];
      acc.fill(0);
      let bestD = 1e9;
      let bestPart = 'torso';
      for (const c of this.prims) {
        if (c.p.sub) continue;
        if (x < c.min.x - weightFalloff * 3 || y < c.min.y - weightFalloff * 3 || z < c.min.z - weightFalloff * 3) continue;
        if (x > c.max.x + weightFalloff * 3 || y > c.max.y + weightFalloff * 3 || z > c.max.z + weightFalloff * 3) continue;
        const d = primDist(x, y, z, c);
        const w = Math.exp(-Math.max(0, d) / weightFalloff);
        acc[c.p.bone] += w;
        if (d < bestD) {
          bestD = d;
          bestPart = c.p.part;
        }
      }
      parts[v] = bestPart;
      // top four bones
      const top: [number, number][] = [];
      for (let b = 0; b < boneCount; b++) if (acc[b] > 1e-4) top.push([b, acc[b]]);
      top.sort((p, q) => q[1] - p[1]);
      let sum = 0;
      for (let t = 0; t < Math.min(4, top.length); t++) sum += top[t][1];
      for (let t = 0; t < 4; t++) {
        if (t < top.length && sum > 0) {
          skinIndex[v * 4 + t] = top[t][0];
          skinWeight[v * 4 + t] = top[t][1] / sum;
        }
      }
      if (!top.length) skinWeight[v * 4] = 1;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
    geo.setIndex(indices);
    return { geo, parts, triangles: indices.length / 3 };
  }
}

export const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
