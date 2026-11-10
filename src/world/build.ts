import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Box with UVs scaled to world metres so tiled textures stay consistent. */
export function boxGeo(w: number, h: number, d: number, uvScale = 1): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const sizes: [number, number][] = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  for (let f = 0; f < 6; f++) {
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, (uv.getX(i) * sizes[f][0]) / uvScale, (uv.getY(i) * sizes[f][1]) / uvScale);
    }
  }
  return g;
}

export function planeGeo(w: number, h: number, uvScale = 1) {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / uvScale, (uv.getY(i) * h) / uvScale);
  return g;
}

/** Collects static geometry per material and merges it into few draw calls. */
export class Batch {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private flags = new Map<THREE.Material, { cast: boolean; receive: boolean }>();
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private s = new THREE.Vector3();
  private p = new THREE.Vector3();

  add(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, cast = true, receive = true) {
    this.e.set(rx, ry, rz);
    this.q.setFromEuler(this.e);
    this.p.set(x, y, z);
    this.s.set(sx, sy, sz);
    this.m.compose(this.p, this.q, this.s);
    return this.addMatrix(geo, mat, this.m, cast, receive);
  }

  addMatrix(geo: THREE.BufferGeometry, mat: THREE.Material, m: THREE.Matrix4, cast = true, receive = true) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    // normalise attribute set
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    if (!g.attributes.uv) {
      const n = g.attributes.position.count;
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    }
    if (!g.attributes.normal) g.computeVertexNormals();
    g.applyMatrix4(m);
    let list = this.parts.get(mat);
    if (!list) {
      list = [];
      this.parts.set(mat, list);
      this.flags.set(mat, { cast, receive });
    } else {
      const f = this.flags.get(mat)!;
      f.cast = f.cast || cast;
      f.receive = f.receive || receive;
    }
    list.push(g);
    return this;
  }

  /** Box helper: centre position, size. */
  box(mat: THREE.Material, cx: number, cy: number, cz: number, w: number, h: number, d: number, uv = 1, ry = 0, cast = true) {
    return this.add(boxGeo(w, h, d, uv), mat, cx, cy, cz, 0, ry, 0, 1, 1, 1, cast);
  }

  build(parent: THREE.Object3D, name = 'batch') {
    const group = new THREE.Group();
    group.name = name;
    for (const [mat, list] of this.parts) {
      const merged = mergeGeometries(list, false);
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, mat);
      const f = this.flags.get(mat)!;
      mesh.castShadow = f.cast;
      mesh.receiveShadow = f.receive;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      group.add(mesh);
      list.forEach((g) => g.dispose());
    }
    this.parts.clear();
    parent.add(group);
    return group;
  }
}

/** Mark a material as a decal laid on another surface: pull it toward the camera in depth so it never flickers. */
export function decal<M extends THREE.Material>(m: M, strength = 1): M {
  m.polygonOffset = true;
  m.polygonOffsetFactor = -2 * strength;
  m.polygonOffsetUnits = -4 * strength;
  return m;
}

export function std(color: THREE.ColorRepresentation, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, ...opts });
}

export function texMat(map: THREE.Texture, repeat: number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  const m = map.clone();
  m.needsUpdate = true;
  m.repeat.set(repeat, repeat);
  return new THREE.MeshStandardMaterial({ map: m, roughness: 0.85, ...opts });
}
