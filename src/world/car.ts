import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { std } from './build';

/** Approximate 2022 Hyundai Santa Fe in dark brown. Local frame: front = +z. */
export function buildCar(): { group: THREE.Group; wheels: THREE.Object3D[]; lights: THREE.Mesh[] } {
  const g = new THREE.Group();
  const paint = new THREE.MeshPhysicalMaterial({ color: '#5a3a26', metalness: 0.45, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.15 });
  const glass = new THREE.MeshPhysicalMaterial({ color: '#141a1e', metalness: 0.2, roughness: 0.08 });
  const black = std('#151617', { roughness: 0.6 });
  const chrome = std('#c7c9cb', { metalness: 0.9, roughness: 0.2 });
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rx = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.x = rx;
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };
  const W = 1.9;
  const L = 4.78;
  // lower body
  add(new RoundedBoxGeometry(W, 0.78, L, 4, 0.16), paint, 0, 0.72, 0);
  // cabin / greenhouse
  add(new RoundedBoxGeometry(W - 0.12, 0.62, L - 1.45, 4, 0.12), paint, 0, 1.36, -0.32);
  add(new RoundedBoxGeometry(W - 0.08, 0.5, L - 1.65, 3, 0.08), glass, 0, 1.36, -0.32);
  // windshield + rear glass
  add(new THREE.BoxGeometry(W - 0.22, 0.62, 0.05), glass, 0, 1.33, 1.2, -0.55);
  add(new THREE.BoxGeometry(W - 0.3, 0.5, 0.05), glass, 0, 1.38, -1.98, 0.4);
  // hood slope
  add(new RoundedBoxGeometry(W - 0.04, 0.12, 1.2, 3, 0.05), paint, 0, 1.08, 1.75, 0.08);
  // pillars
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.06, 0.6, 0.06), black, s * (W / 2 - 0.08), 1.36, 0.25);
  // roof rails
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.05, 0.05, 2.6), chrome, s * 0.72, 1.7, -0.35);
  // wide grille + T-shaped daytime running lights (2022 Santa Fe look)
  add(new RoundedBoxGeometry(1.35, 0.42, 0.06, 2, 0.04), black, 0, 0.78, L / 2 + 0.01);
  for (let i = 0; i < 6; i++) add(new THREE.BoxGeometry(1.25, 0.012, 0.02), chrome, 0, 0.62 + i * 0.06, L / 2 + 0.04);
  const lights: THREE.Mesh[] = [];
  const lightMat = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fff4d8', emissiveIntensity: 1.2 });
  for (const s of [-1, 1]) {
    lights.push(add(new THREE.BoxGeometry(0.42, 0.04, 0.04), lightMat, s * 0.62, 1.03, L / 2 - 0.02));
    lights.push(add(new THREE.BoxGeometry(0.04, 0.28, 0.04), lightMat, s * 0.8, 0.88, L / 2 - 0.01));
    add(new THREE.BoxGeometry(0.3, 0.14, 0.04), std('#e8e8e8', { emissive: '#666', emissiveIntensity: 0.3 }), s * 0.62, 0.72, L / 2 + 0.01);
    add(new THREE.BoxGeometry(0.45, 0.07, 0.04), std('#8a1010', { emissive: '#600', emissiveIntensity: 0.6 }), s * 0.6, 1.0, -L / 2 - 0.01);
  }
  add(new THREE.BoxGeometry(1.9, 0.18, 0.12), black, 0, 0.42, L / 2 - 0.02);
  add(new THREE.BoxGeometry(1.9, 0.18, 0.12), black, 0, 0.42, -L / 2 + 0.02);
  // side cladding and mirrors
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(0.04, 0.14, L - 1.4), black, s * (W / 2 + 0.005), 0.42, 0);
    add(new RoundedBoxGeometry(0.22, 0.12, 0.14, 2, 0.04), paint, s * (W / 2 + 0.08), 1.18, 0.95);
    add(new THREE.BoxGeometry(0.02, 0.02, 0.18), chrome, s * (W / 2 + 0.01), 0.98, 0.2);
    add(new THREE.BoxGeometry(0.02, 0.02, 0.18), chrome, s * (W / 2 + 0.01), 0.98, -0.85);
  }
  // wheels
  const wheels: THREE.Object3D[] = [];
  const tire = new THREE.CylinderGeometry(0.37, 0.37, 0.26, 24);
  tire.rotateZ(Math.PI / 2);
  const rim = new THREE.CylinderGeometry(0.24, 0.24, 0.27, 10);
  rim.rotateZ(Math.PI / 2);
  for (const [x, z] of [
    [-0.82, 1.45],
    [0.82, 1.45],
    [-0.82, -1.45],
    [0.82, -1.45],
  ]) {
    const w = new THREE.Group();
    w.position.set(x, 0.37, z);
    const t = new THREE.Mesh(tire, std('#1a1a1a', { roughness: 0.9 }));
    t.castShadow = true;
    w.add(t);
    w.add(new THREE.Mesh(rim, std('#9da0a3', { metalness: 0.8, roughness: 0.3 })));
    for (let i = 0; i < 5; i++) {
      const sp = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.035, 0.05), chrome);
      sp.rotation.x = (i * Math.PI * 2) / 5;
      w.add(sp);
    }
    g.add(w);
    wheels.push(w);
    // wheel arch cladding
    const arch = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.05, 6, 16, Math.PI), black);
    arch.position.set(x + Math.sign(x) * 0.12, 0.42, z);
    arch.rotation.y = Math.PI / 2;
    g.add(arch);
  }
  return { group: g, wheels, lights };
}
