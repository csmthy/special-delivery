import * as THREE from 'three';
import { buildHouse, type HouseParts } from './house';
import { buildYard, type YardParts } from './yard';
import { buildBackLot, type BackLot } from './backlot';
import { buildInterior, type Interior } from './furniture';
import { buildCar } from './car';
import { buildDeckProps } from './deck';
import { buildDeckColliders, buildWallColliders, boxes, circles } from './layout';
import { buildNeighborhood } from './neighborhood';

export interface World {
  scene: THREE.Scene;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  house: HouseParts;
  yard: YardParts;
  interior: Interior;
  car: ReturnType<typeof buildCar>;
  backlot: BackLot;
}

let built: World | null = null;
const SUN_DIR = new THREE.Vector3(12, 22, 9).normalize();

/** A dome of soft, drifting cumulus painted procedurally (thicker toward the horizon, thin overhead). */
function cloudDome() {
  const W = 1024;
  const H = 256;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const img = g.createImageData(W, H);
  // value noise on a wrapped grid
  const N = 64;
  const grid = new Float32Array(N * N * 4);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < grid.length; i++) grid[i] = rnd();
  const vn = (x: number, y: number, o: number) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const at = (a: number, b: number) => grid[(((a % N) + N) % N) + ((((b % N) + N) % N) * N) + o * N * N];
    return at(xi, yi) * (1 - u) * (1 - v) + at(xi + 1, yi) * u * (1 - v) + at(xi, yi + 1) * (1 - u) * v + at(xi + 1, yi + 1) * u * v;
  };
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const fx = (x / W) * 32;
      const fy = (y / H) * 8;
      let n = vn(fx, fy * 1.6, 0) * 0.5 + vn(fx * 2.1, fy * 3.3, 1) * 0.27 + vn(fx * 4.3, fy * 6.9, 2) * 0.15 + vn(fx * 8.7, fy * 13, 3) * 0.08;
      const elev = y / H; // 0 = top of the dome, 1 = horizon
      const cover = 0.6 - elev * 0.06;
      let a = Math.max(0, (n - cover) / (1 - cover));
      a = Math.min(1, a * 2.2) * Math.min(1, (1 - elev) * 5) * (0.55 + elev * 0.45);
      const shade = 0.82 + (n - 0.5) * 0.5;
      const i = (y * W + x) * 4;
      img.data[i] = 255 * Math.min(1, shade + 0.1);
      img.data[i + 1] = 255 * Math.min(1, shade + 0.11);
      img.data[i + 2] = 255 * Math.min(1, shade + 0.14);
      img.data[i + 3] = a * 235;
    }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(200, 48, 16, 0, Math.PI * 2, 0, Math.PI * 0.49),
    new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.BackSide, depthWrite: false, fog: false }),
  );
  dome.position.set(6, -12, -8);
  dome.renderOrder = -1;
  dome.frustumCulled = false;
  dome.name = 'clouds';
  return dome;
}

export function buildWorld(): World {
  if (built) return built;
  boxes.length = 0;
  circles.length = 0;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#a9cbe8');
  scene.fog = new THREE.Fog('#c9dbe6', 30, 95);

  // physically-based sky (Preetham scattering) with the sun where the shadows say it is, a soft cloud layer
  // above it, and the fog tinted to the horizon haze so distant trees and houses melt into the sky
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(220, 48, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      toneMapped: false,
      uniforms: { uSun: { value: SUN_DIR.clone() } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position.z = gl_Position.w; }',
      fragmentShader: `
        varying vec3 vDir; uniform vec3 uSun;
        void main(){
          vec3 d = normalize(vDir);
          float h = max(d.y, 0.0);
          vec3 zenith = vec3(0.24, 0.47, 0.80);
          vec3 mid = vec3(0.47, 0.67, 0.89);
          vec3 horizon = vec3(0.80, 0.87, 0.92);
          vec3 c = mix(horizon, mid, smoothstep(0.0, 0.22, h));
          c = mix(c, zenith, smoothstep(0.18, 0.95, h));
          if (d.y < 0.0) c = mix(horizon, vec3(0.70, 0.74, 0.70), smoothstep(0.0, -0.2, d.y));
          float s = max(dot(d, normalize(uSun)), 0.0);
          c += vec3(1.0, 0.92, 0.75) * (pow(s, 600.0) * 2.5 + pow(s, 24.0) * 0.18 + pow(s, 4.0) * 0.06);
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
    }),
  );
  sky.position.set(6, 0, -8);
  sky.renderOrder = -2;
  sky.frustumCulled = false;
  scene.add(sky);
  scene.add(cloudDome());
  scene.fog = new THREE.Fog('#c8d6e0', 34, 125);
  scene.background = new THREE.Color('#b9d2e6');

  const hemi = new THREE.HemisphereLight('#d7e8ff', '#5d6b3a', 1.05);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff1d6', 3.1);
  sun.position.set(14, 22, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -16;
  sc.right = 16;
  sc.top = 16;
  sc.bottom = -16;
  sc.near = 1;
  sc.far = 70;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 3;
  scene.add(sun);
  scene.add(sun.target);

  buildWallColliders();
  buildDeckColliders();
  const house = buildHouse(scene);
  const yard = buildYard(scene);
  const backlot = buildBackLot(scene);
  buildNeighborhood(scene);
  const interior = buildInterior(scene);
  buildDeckProps(scene);
  const car = buildCar();
  car.group.visible = false;
  scene.add(car.group);

  built = { scene, sun, hemi, house, yard, backlot, interior, car };
  return built;
}

/** Keep the shadow frustum centred on the action for crisp shadows. */
const _r = new THREE.Vector3();
const _u = new THREE.Vector3();
const _c = new THREE.Vector3();
export function followSun(w: World, x: number, z: number) {
  // Stable shadows: move the shadow frustum only in whole shadow-map texels, measured in the light's own
  // screen axes. Shadow edges then stay put as the camera follows the pet instead of crawling/shimmering.
  const s = w.sun;
  const sc = s.shadow.camera;
  const texel = (sc.right - sc.left) / s.shadow.mapSize.x;
  _r.crossVectors(new THREE.Vector3(0, 1, 0), SUN_DIR).normalize();
  _u.crossVectors(SUN_DIR, _r).normalize();
  _c.set(x, 0, z);
  const a = Math.round(_c.dot(_r) / texel) * texel;
  const b = Math.round(_c.dot(_u) / texel) * texel;
  const d = _c.dot(SUN_DIR);
  _c.copy(_r).multiplyScalar(a).addScaledVector(_u, b).addScaledVector(SUN_DIR, d);
  s.target.position.copy(_c);
  s.position.copy(_c).addScaledVector(SUN_DIR, 27.6);
  s.target.updateMatrixWorld();
  s.updateMatrixWorld();
}
