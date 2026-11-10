// The snake ending: the house goes up like a small sun. White flash, a churning fireball that climbs into
// a mushroom cloud on a boiling stem, a ground shockwave, flying debris, a dust skirt, then a smoking crater
// where the house was. (Played for laughs: Mom really, really does not do snakes.)
import * as THREE from 'three';
import { glowDot, radialShadow } from '../world/textures';

const ss = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function fireballTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  gr.addColorStop(0, 'rgba(255,255,230,1)');
  gr.addColorStop(0.3, 'rgba(255,214,120,1)');
  gr.addColorStop(0.6, 'rgba(255,120,30,0.9)');
  gr.addColorStop(0.85, 'rgba(160,40,10,0.5)');
  gr.addColorStop(1, 'rgba(60,10,0,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  // turbulence
  for (let i = 0; i < 260; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * 50;
    g.fillStyle = `rgba(${120 + Math.random() * 120},${30 + Math.random() * 60},0,${Math.random() * 0.25})`;
    g.beginPath();
    g.arc(64 + Math.cos(a) * r, 64 + Math.sin(a) * r, 3 + Math.random() * 9, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function smokeTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  for (let i = 0; i < 40; i++) {
    const x = 64 + (Math.random() - 0.5) * 60;
    const y = 64 + (Math.random() - 0.5) * 60;
    const r = 14 + Math.random() * 26;
    const gr = g.createRadialGradient(x, y, 1, x, y, r);
    const v = 150 + Math.random() * 70;
    gr.addColorStop(0, `rgba(${v},${v - 10},${v - 20},0.35)`);
    gr.addColorStop(1, `rgba(${v},${v},${v},0)`);
    g.fillStyle = gr;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface Puff {
  s: THREE.Sprite;
  base: THREE.Vector3;
  vel: THREE.Vector3;
  size: number;
  grow: number;
  delay: number;
  role: 'stem' | 'cap' | 'skirt' | 'fire';
}

export class Nuke {
  group = new THREE.Group();
  t = -1;
  private flash: THREE.Mesh;
  private fireball: THREE.Mesh;
  private shock: THREE.Mesh;
  private puffs: Puff[] = [];
  private debris: { m: THREE.Mesh; v: THREE.Vector3; w: THREE.Vector3 }[] = [];
  private crater: THREE.Group;
  private glowMat: THREE.SpriteMaterial;
  private ox: number;
  private oz: number;

  constructor(private scene: THREE.Scene, cx: number, cz: number) {
    this.ox = cx;
    this.oz = cz;
    this.group.position.set(cx, 0, cz);
    this.group.visible = false;
    scene.add(this.group);
    // blinding core
    this.flash = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, toneMapped: false, depthWrite: false, fog: false }));
    this.group.add(this.flash);
    // fireball with a displaced, churning surface
    const fg = new THREE.SphereGeometry(1, 48, 32);
    {
      const p = fg.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        const v = new THREE.Vector3().fromBufferAttribute(p, i);
        const n = 1 + Math.sin(v.x * 7) * 0.06 + Math.sin(v.y * 9 + v.z * 5) * 0.06 + Math.sin(v.z * 11) * 0.04;
        v.multiplyScalar(n);
        p.setXYZ(i, v.x, v.y, v.z);
      }
      fg.computeVertexNormals();
    }
    this.fireball = new THREE.Mesh(fg, new THREE.MeshBasicMaterial({ map: fireballTexture(), color: '#ffd28a', transparent: true, toneMapped: false, fog: false }));
    this.group.add(this.fireball);
    // ground shockwave
    this.shock = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 96), new THREE.MeshBasicMaterial({ color: '#fff1d0', transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    this.shock.rotation.x = -Math.PI / 2;
    this.shock.position.y = 0.3;
    this.group.add(this.shock);
    // smoke puffs: the boiling stem, the cap that rolls outward, and a dust skirt along the ground
    const smoke = smokeTexture();
    const fireTex = glowDot('255,140,40');
    this.glowMat = new THREE.SpriteMaterial({ map: fireTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false });
    const add = (role: Puff['role'], n: number) => {
      for (let i = 0; i < n; i++) {
        const mat =
          role === 'fire'
            ? this.glowMat.clone()
            : new THREE.SpriteMaterial({ map: smoke, color: role === 'skirt' ? '#a59a88' : '#b8a99a', transparent: true, depthWrite: false, opacity: 0, fog: false });
        const s = new THREE.Sprite(mat);
        s.visible = false;
        const a = Math.random() * Math.PI * 2;
        let base = new THREE.Vector3();
        let vel = new THREE.Vector3();
        let size = 4;
        let grow = 1;
        let delay = 0;
        if (role === 'stem') {
          base = new THREE.Vector3(Math.cos(a) * 0.9, (i / n) * 15, Math.sin(a) * 0.9);
          vel = new THREE.Vector3(Math.cos(a) * 0.3, 2.5, Math.sin(a) * 0.3);
          size = 3 + Math.random() * 1.8;
          grow = 0.25;
          delay = 0.6 + (i / n) * 1.2;
        } else if (role === 'cap') {
          // a rolling torus round the top of the stem, plus a dome over it
          const dome = i % 4 === 0;
          const r = dome ? Math.random() * 2.5 : 3.5 + Math.random() * 2.5;
          base = new THREE.Vector3(Math.cos(a) * r, 17 + (dome ? 3 + Math.random() * 2 : (Math.random() - 0.5) * 3), Math.sin(a) * r);
          vel = new THREE.Vector3(Math.cos(a) * 1.8, dome ? 1.2 : -0.2, Math.sin(a) * 1.8);
          size = 5 + Math.random() * 3;
          grow = 1.0;
          delay = 1.2 + Math.random() * 0.8;
        } else if (role === 'skirt') {
          base = new THREE.Vector3(Math.cos(a) * 2, 1.5, Math.sin(a) * 2);
          vel = new THREE.Vector3(Math.cos(a) * 14, 0.6, Math.sin(a) * 14);
          size = 6 + Math.random() * 4;
          grow = 1.6;
          delay = 0.15 + Math.random() * 0.3;
        } else {
          base = new THREE.Vector3((Math.random() - 0.5) * 6, 2 + Math.random() * 8, (Math.random() - 0.5) * 6);
          vel = new THREE.Vector3(0, 4 + Math.random() * 3, 0);
          size = 7 + Math.random() * 6;
          grow = 0.8;
          delay = 0.2 + Math.random() * 1.5;
        }
        this.group.add(s);
        this.puffs.push({ s, base, vel, size, grow, delay, role });
      }
    };
    add('skirt', 14);
    add('stem', 14);
    add('cap', 24);
    add('fire', 10);
    // debris: boards, shingles, a chair, a fridge door…
    const mats = ['#e8dfca', '#5d6166', '#7a5a3a', '#cfcac0', '#2a2622', '#c8452e'].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 }));
    const boxGeos = [0, 1, 2, 3, 4, 5].map(() => new THREE.BoxGeometry(0.2 + Math.random() * 1.4, 0.05 + Math.random() * 0.2, 0.15 + Math.random() * 0.8));
    for (let i = 0; i < 36; i++) {
      const m = new THREE.Mesh(boxGeos[i % 6], mats[i % mats.length]);
      m.visible = false;
      this.group.add(m);
      const a = Math.random() * Math.PI * 2;
      const sp = 10 + Math.random() * 22;
      this.debris.push({ m, v: new THREE.Vector3(Math.cos(a) * sp * 0.6, 12 + Math.random() * 26, Math.sin(a) * sp * 0.6), w: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8) });
    }
    // what's left afterwards: a scorched crater with burning, splintered timbers
    this.crater = new THREE.Group();
    const scorch = new THREE.Mesh(new THREE.CircleGeometry(11, 48), new THREE.MeshBasicMaterial({ map: radialShadow(), color: '#000000', transparent: true, opacity: 0.85, depthWrite: false }));
    scorch.rotation.x = -Math.PI / 2;
    scorch.position.y = 0.03;
    this.crater.add(scorch);
    const pit = new THREE.Mesh(new THREE.CircleGeometry(6.5, 40), new THREE.MeshStandardMaterial({ color: '#211c18', roughness: 1 }));
    pit.rotation.x = -Math.PI / 2;
    pit.position.y = 0.04;
    this.crater.add(pit);
    const burnt = new THREE.MeshStandardMaterial({ color: '#1b1714', roughness: 1 });
    for (let i = 0; i < 16; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 1.2 + Math.random() * 2.5), burnt);
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 5;
      b.position.set(Math.cos(a) * r, 0.3 + Math.random() * 0.6, Math.sin(a) * r);
      b.rotation.set(Math.random() - 0.5, Math.random() * 3, Math.random() - 0.5);
      this.crater.add(b);
    }
    for (let i = 0; i < 8; i++) {
      const f = new THREE.Sprite(this.glowMat.clone());
      f.position.set((Math.random() - 0.5) * 8, 0.6, (Math.random() - 0.5) * 8);
      f.scale.setScalar(1.2 + Math.random());
      f.userData.ph = Math.random() * 10;
      this.crater.add(f);
    }
    this.crater.visible = false;
    this.group.add(this.crater);
  }

  start() {
    this.t = 0;
    this.group.visible = true;
    this.crater.visible = false;
    for (const d of this.debris) {
      d.m.position.set((Math.random() - 0.5) * 8, 1 + Math.random() * 2, (Math.random() - 0.5) * 6);
      d.m.visible = true;
    }
  }

  stop() {
    this.t = -1;
    this.group.visible = false;
  }

  /** Heat glow 0..1 for lighting the scene (instead of a point light, which would recompile every shader). */
  glow() {
    if (this.t < 0) return 0;
    return Math.max(0, 1 - this.t / 3.5);
  }

  /** Compile every material up front so the blast doesn't hitch on first draw. */
  warm(renderer: THREE.WebGLRenderer, cam: THREE.Camera) {
    const was = this.group.visible;
    this.group.visible = true;
    this.crater.visible = true;
    for (const p of this.puffs) p.s.visible = true;
    for (const d of this.debris) d.m.visible = true;
    renderer.compile(this.group, cam);
    for (const p of this.puffs) p.s.visible = false;
    this.crater.visible = false;
    this.group.visible = was;
  }

  /** Screen flash amount 0..1 for the overlay. */
  flashAmount() {
    if (this.t < 0) return 0;
    return Math.max(0, 1 - this.t / 0.9) ** 1.5;
  }

  /** Camera shake amplitude. */
  shake() {
    if (this.t < 0) return 0;
    return Math.max(0, 0.5 - this.t * 0.12) * (this.t > 0.05 ? 1 : 0);
  }

  get crumbled() {
    return this.t > 0.18;
  }

  update(dt: number) {
    if (this.t < 0) return;
    this.t += dt;
    const t = this.t;
    // flash core: instant, then shrinks into the fireball
    this.flash.scale.setScalar(4 + t * 30);
    (this.flash.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - t / 0.5);
    // fireball rises and swells, cooling from white-hot to orange to dull red
    const fr = 2.4 + ss(0, 2.2, t) * 5.2;
    this.fireball.scale.set(fr, fr * (0.85 + ss(1.5, 4, t) * 0.25), fr);
    this.fireball.position.y = 3 + ss(0.3, 5, t) * 15;
    this.fireball.rotation.y += dt * 0.4;
    const fm = this.fireball.material as THREE.MeshBasicMaterial;
    fm.color.setRGB(1, 0.85 - ss(0.5, 4, t) * 0.45, 0.6 - ss(0.3, 3, t) * 0.5);
    fm.opacity = 1 - ss(4.5, 7, t) * 0.7;
    // shockwave races outward along the ground
    const sr = t * 40;
    this.shock.scale.setScalar(Math.max(0.1, sr));
    (this.shock.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.9 - t * 0.55);
    // smoke
    for (const p of this.puffs) {
      const lt = t - p.delay;
      if (lt < 0) {
        p.s.visible = false;
        continue;
      }
      p.s.visible = true;
      const k = 1 - Math.exp(-lt * 0.9);
      p.s.position.copy(p.base).addScaledVector(p.vel, k * 3.2);
      if (p.role === 'cap') p.s.position.y = this.fireball.position.y - 1 + (p.base.y - 17) + p.vel.y * k * 2;
      if (p.role === 'stem') p.s.position.y = Math.min(p.base.y, this.fireball.position.y - 2);
      const size = p.size * (1 + lt * p.grow * 0.4);
      p.s.scale.setScalar(size);
      const mat = p.s.material as THREE.SpriteMaterial;
      if (p.role === 'fire') {
        mat.opacity = Math.max(0, 1 - lt / 2.5);
        p.s.position.y = this.fireball.position.y - 3 + (p.base.y - 6);
      } else {
        mat.opacity = Math.min(p.role === 'skirt' ? 0.55 : p.role === 'stem' ? 0.7 : 0.92, lt * 1.2) * (1 - ss(9, 14, t) * 0.6);
        // lit from below by the fire early on
        const glow = Math.max(0, 1 - lt / 3);
        mat.color.setRGB(0.72 + glow * 0.3, 0.66 + glow * 0.12, 0.6 - glow * 0.25);
      }
    }
    // debris arcs out under gravity, tumbling
    for (const d of this.debris) {
      if (!d.m.visible) continue;
      d.v.y -= 22 * dt;
      d.m.position.addScaledVector(d.v, dt);
      d.m.rotation.x += d.w.x * dt;
      d.m.rotation.y += d.w.y * dt;
      d.m.rotation.z += d.w.z * dt;
      if (d.m.position.y < 0.1) {
        d.m.position.y = 0.1;
        d.v.set(d.v.x * 0.3, Math.abs(d.v.y) * 0.15, d.v.z * 0.3);
        d.w.multiplyScalar(0.5);
      }
    }
    this.crater.visible = t > 0.25;
    for (const c of this.crater.children) {
      if (c instanceof THREE.Sprite) {
        const ph = c.userData.ph as number;
        c.material.opacity = 0.6 + Math.sin(t * 9 + ph) * 0.3;
      }
    }
    void this.ox;
    void this.oz;
    void this.scene;
  }
}
