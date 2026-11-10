import * as THREE from 'three';
import { buildWorld, followSun } from '../src/world/world';
import { makePet, makeBabadook } from '../src/actors/species';
import { PreyModel } from '../src/actors/prey';
import { makePostalPete, makeBackNeighbor } from '../src/actors/person';
import { FLOOR } from '../src/world/layout';

const q = new URLSearchParams(location.search);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);
if (q.get('cut')) renderer.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, -1, 0), FLOOR + Number(q.get('cut')))];
const studio = !!q.get('studio');
const w = studio ? (null as any) : buildWorld();
function studioScene() {
  // neutral turntable: grey ground, soft sky light and one shadowed key light, for judging models
  const sc = new THREE.Scene();
  sc.background = new THREE.Color('#aeb6bd');
  sc.add(new THREE.HemisphereLight('#e8eef5', '#5b5348', 1.1));
  const key = new THREE.DirectionalLight('#fff2e0', 2.4);
  key.position.set(3, 6, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  const sc2 = key.shadow.camera as THREE.OrthographicCamera;
  sc2.left = sc2.bottom = -3; sc2.right = sc2.top = 3; sc2.near = 0.5; sc2.far = 20;
  key.shadow.bias = -0.0004;
  sc.add(key);
  const rim = new THREE.DirectionalLight('#cfe0ff', 1.0);
  rim.position.set(-4, 3, -5);
  sc.add(rim);
  const g = new THREE.Mesh(new THREE.CircleGeometry(12, 48), new THREE.MeshStandardMaterial({ color: '#8d8a83', roughness: 0.95 }));
  g.rotation.x = -Math.PI / 2;
  g.receiveShadow = true;
  sc.add(g);
  return sc;
}
const scene: THREE.Scene = studio ? studioScene() : w.scene;
const cam = new THREE.PerspectiveCamera(Number(q.get('fov') ?? 55), innerWidth / innerHeight, 0.03, 300);
const [px, py, pz, tx, ty, tz] = (q.get('cam') ?? '6,8,-26,4,0,-10').split(',').map(Number);
cam.position.set(px, py, pz);
cam.lookAt(tx, ty, tz);
if (!studio) followSun(w, tx, tz);
const actors: { update(dt: number): void }[] = [];
const pets = ['darrow', 'rufus', 'penny'] as const;
const pose = q.get('pose') ?? 'walk';
const ax = Number(q.get('ax') ?? 9.85), az = Number(q.get('az') ?? -1.0), ay = Number(q.get('ay') ?? FLOOR);
const only = q.get('only');
const buildTimes: string[] = [];
pets.filter((id) => !only || id === only).forEach((id, i) => {
  const t0 = performance.now(); const p = makePet(id); buildTimes.push(id + ':' + Math.round(performance.now() - t0) + 'ms tris=' + p.triangles);
  p.root.position.set(ax, ay, az - i * 0.8);
  p.root.rotation.y = Number(q.get('rot') ?? 0);
  if (pose === 'walk') { p.p.speed = 0.8; p.p.gait = 'walk'; }
  if (pose === 'run') { p.p.speed = 3.5; p.p.gait = 'bound'; }
  if (pose === 'sit') { p.p.sit = 1; p.p.proud = 1; }
  if (pose === 'lie') { p.p.lie = 1; }
  if (pose === 'stalk') { p.p.crouch = 1; p.p.speed = 0.5; }
  scene.add(p.root);
  actors.push({ update: (dt) => { p.update(dt); if (pose !== 'idle' && p.p.speed > 0) {} } });
});
if (q.get('car') && !studio) { w.car.group.visible = true; w.car.group.position.set(-2.3, 0, 3.3); w.car.group.rotation.y = Math.PI; }
if (q.get('bab')) { const b = makeBabadook(); b.root.position.set(ax + 1.2, ay, az); b.root.rotation.y = -1; scene.add(b.root); actors.push(b); }
if (q.get('humans')) {
  const which = q.get('humans');
  const list: any[] = [];
  if (which === 'pete' || which === '1') list.push(makePostalPete());
  if (which === 'nb' || which === '1') list.push(makeBackNeighbor());
  list.forEach((h, i) => {
    h.root.position.set(ax + i * 0.9, ay, az);
    h.root.rotation.y = Number(q.get('hrot') ?? 0);
    if (q.get('hpose')) h.pose = q.get('hpose');
    if (q.get('hwalk')) h.speed = Number(q.get('hwalk'));
    if (q.get('htalk')) h.talk = 1;
    scene.add(h.root);
    actors.push(h);
    buildTimes.push(h.spec.name + ':' + Math.round(h.buildMs) + 'ms tris=' + h.triangles);
  });
}
if (q.get('prey')) {
  ((q.get('pkind') ? [q.get('pkind')] : ['mouse', 'chipmunk', 'bird', 'squirrel', 'snake']) as any[]).forEach((k, i) => {
    const m = new PreyModel(k, i); m.root.position.set(q.get('pkind') ? ax : ax - 0.45 + i * 0.3, ay, q.get('pkind') ? az : az + 0.5); m.root.rotation.y = Number(q.get('prot') ?? 0.6); m.pose = (q.get('ppose') ?? 'idle') as any; scene.add(m.root); actors.push(m);
  });
}
let last = performance.now();
let frames = 0;
function loop() {
  const now = performance.now();
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  actors.forEach((a) => a.update(dt));
  renderer.render(scene, cam);
  frames++;
  (window as any).__frames = frames;
  if (frames < Number(q.get("frames") ?? 1e9)) requestAnimationFrame(loop);
}
loop();
(window as any).__ready = true;
(window as any).__info = buildTimes.join(' ');
if (q.get('nofur')) actors.forEach(() => {});
(window as any).__view = (c: number[], fov = 55) => {
  cam.fov = fov;
  cam.aspect = innerWidth / innerHeight;
  cam.updateProjectionMatrix();
  cam.position.set(c[0], c[1], c[2]);
  cam.lookAt(c[3], c[4], c[5]);
  if (!studio) followSun(w, c[3], c[5]);
  for (let i = 0; i < 2; i++) renderer.render(scene, cam);
};
