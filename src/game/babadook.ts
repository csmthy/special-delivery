import * as THREE from 'three';
import { makeBabadook } from '../actors/species';
import type { Quadruped } from '../actors/rig';
import { BABADOOK, type PetStats } from '../config';
import { HOLE, groundHeight } from '../world/layout';
import { glowDot } from '../world/textures';

export type EncState = 'hidden' | 'emerge' | 'windup' | 'lunge' | 'dizzy' | 'counter' | 'flee' | 'retreat' | 'bstalk' | 'bring' | 'btaunt' | 'bdefeat';
export type EncEvent = 'none' | 'hit' | 'dodged' | 'victory' | 'timeout' | 'done' | 'bossHurt' | 'bossDefeated' | 'bossEscaped' | 'ringHit' | 'ringDodged' | 'feint' | 'ringStart';

function telegraphTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 256, 0, 0);
  grad.addColorStop(0, 'rgba(255,190,40,0.0)');
  grad.addColorStop(0.3, 'rgba(255,170,40,0.55)');
  grad.addColorStop(1, 'rgba(255,90,30,0.9)');
  g.fillStyle = grad;
  g.fillRect(14, 40, 36, 216);
  g.beginPath();
  g.moveTo(0, 48);
  g.lineTo(32, 0);
  g.lineTo(64, 48);
  g.closePath();
  g.fillStyle = 'rgba(255,90,30,0.95)';
  g.fill();
  // chevrons
  g.strokeStyle = 'rgba(255,255,255,0.7)';
  g.lineWidth = 5;
  for (let y = 90; y < 250; y += 45) {
    g.beginPath();
    g.moveTo(18, y + 14);
    g.lineTo(32, y);
    g.lineTo(46, y + 14);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Babadook {
  model: Quadruped;
  state: EncState = 'hidden';
  t = 0;
  x = HOLE.x;
  z = HOLE.z;
  heading = Math.PI;
  aimX = 0;
  aimZ = 0;
  dirX = 0;
  dirZ = 1;
  lungeLeft = 0;
  locked = false;
  stats!: PetStats;
  telegraph: THREE.Mesh;
  stars: THREE.Group;
  totalT = 0;
  // peeking eyes
  peekT = 0;
  peekCooldown = 4;
  /** While true (the camera reveal), he crouches and glares after emerging instead of winding up. */
  hold = false;

  // ---------------- Hard Mode boss fight
  boss = false;
  hp = 5;
  readonly hpMax = 5;
  bossT = 0;
  private combo = 0;
  private feint = false;
  private feinted = false;
  private orbit = 1;
  /** expanding shockwave rings: radius, and whether the pet has been checked against it */
  rings: { r: number; checked: boolean; mesh: THREE.Mesh }[] = [];
  private ringTell = 0;
  private ringsLeft = 0;
  private ringGap = 0;
  tellRing: THREE.Mesh;
  /** set by the game each frame: the pet is mid-hop over a shockwave */
  petAirborne = false;
  private rnd = Math.random;
  static readonly BOSS_CAP = 50; // after this long he gives up and slinks off

  constructor(private scene: THREE.Scene, private eyes: THREE.Object3D) {
    this.model = makeBabadook();
    this.model.root.visible = false;
    scene.add(this.model.root);
    const tg = new THREE.PlaneGeometry(0.55, 1);
    tg.rotateX(-Math.PI / 2);
    tg.translate(0, 0, 0.5);
    this.telegraph = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ map: telegraphTexture(), transparent: true, depthWrite: false, opacity: 0.8 }));
    this.telegraph.visible = false;
    this.telegraph.renderOrder = 3;
    scene.add(this.telegraph);
    this.stars = new THREE.Group();
    const sm = new THREE.SpriteMaterial({ map: glowDot('255,235,120'), color: '#fff3a0', transparent: true, depthWrite: false });
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Sprite(sm);
      s.scale.set(0.08, 0.08, 1);
      this.stars.add(s);
    }
    this.stars.visible = false;
    scene.add(this.stars);
    // shockwave tell: a red glow pooling under him while he rears up and hisses
    const tr = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshBasicMaterial({ map: glowDot('255,40,20'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    tr.rotation.x = -Math.PI / 2;
    tr.visible = false;
    tr.renderOrder = 3;
    scene.add(tr);
    this.tellRing = tr;
  }

  private makeRing() {
    const m = new THREE.Mesh(
      new THREE.RingGeometry(0.86, 1, 64),
      new THREE.MeshBasicMaterial({ color: '#ff5a2a', transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false }),
    );
    m.rotation.x = -Math.PI / 2;
    m.renderOrder = 4;
    this.scene.add(m);
    return m;
  }

  /** Hard Mode: the first appearance is a full fight. */
  startBoss(stats: PetStats, petX: number, petZ: number, rnd: () => number) {
    this.start(stats, petX, petZ);
    this.boss = true;
    this.bossStarted = false;
    this.hp = this.hpMax;
    this.bossT = 0;
    this.rnd = rnd;
    this.combo = 0;
  }

  /** 1 (healthy) .. 3 (last hit point): attacks get faster and trickier. */
  get phase() {
    return this.hp >= 4 ? 1 : this.hp >= 2 ? 2 : 3;
  }

  private clearRings() {
    for (const r of this.rings) this.scene.remove(r.mesh);
    this.rings = [];
    this.tellRing.visible = false;
    this.ringsLeft = 0;
  }

  private beginWindup(quick = false) {
    this.state = 'windup';
    this.t = quick ? 0.35 : 0;
    this.locked = false;
    this.feinted = false;
    this.feint = this.phase >= 3 && !quick && this.rnd() < 0.65;
  }

  private bossWindupTime() {
    return [1.05, 0.8, 0.7][this.phase - 1];
  }

  /** The boss fight's state machine (runs instead of the normal encounter once he has emerged). */
  private updateBoss(dt: number, petX: number, petY: number, petZ: number): EncEvent {
    const p = this.model.p;
    const S = this.stats;
    let ev: EncEvent = 'none';
    this.bossT += dt;
    const toPet = Math.atan2(petX - this.x, petZ - this.z);
    const dPet = Math.hypot(petX - this.x, petZ - this.z);
    // shockwaves keep travelling whatever he is doing
    for (const r of this.rings) {
      r.r += 3.3 * dt;
      r.mesh.position.set(this.ringCX, 0.035, this.ringCZ);
      r.mesh.scale.setScalar(r.r);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = 0.85 * Math.max(0, 1 - r.r / 7.5);
      const dp = Math.hypot(petX - this.ringCX, petZ - this.ringCZ);
      if (!r.checked && Math.abs(dp - r.r) < 0.22) {
        r.checked = true;
        ev = this.petAirborne ? 'ringDodged' : 'ringHit';
      }
    }
    for (let i = this.rings.length - 1; i >= 0; i--) if (this.rings[i].r > 7.5) {
      this.scene.remove(this.rings[i].mesh);
      this.rings.splice(i, 1);
    }
    if (this.bossT > Babadook.BOSS_CAP && this.state !== 'retreat' && this.state !== 'bdefeat') {
      this.state = 'retreat';
      this.t = 0;
      this.telegraph.visible = false;
      this.stars.visible = false;
      this.clearRings();
    }
    switch (this.state) {
      case 'bstalk': {
        // circle the pet at a distance, eyes on it, then pick an attack
        p.crouch = 0.45;
        p.gait = 'trot';
        const want = 3.0;
        const radial = (dPet - want) * 1.2;
        const tx = Math.sin(toPet) * radial + Math.cos(toPet) * this.orbit * 1.6;
        const tz = Math.cos(toPet) * radial - Math.sin(toPet) * this.orbit * 1.6;
        const sp = Math.min(2.2, Math.hypot(tx, tz));
        const l = Math.hypot(tx, tz) || 1;
        const nx = this.x + (tx / l) * sp * dt;
        const nz = this.z + (tz / l) * sp * dt;
        // keep to the open yard behind the house
        this.x = Math.max(-3.6, Math.min(11.2, nx));
        this.z = Math.max(-18.2, Math.min(-7.9, nz));
        p.speed = sp;
        this.heading = toPet;
        const pause = [0.9, 0.7, 0.55][this.phase - 1];
        if (this.t > pause) {
          this.t = 0;
          if (this.phase >= 2 && this.rnd() < 0.45) {
            this.state = 'bring';
            this.ringTell = 0.85;
            this.ringsLeft = this.phase >= 3 ? 2 : 1;
            this.ringGap = 0;
          } else {
            this.combo = this.phase >= 2 ? 2 : 1;
            this.beginWindup();
          }
        }
        break;
      }
      case 'windup': {
        p.crouch = 0.85;
        p.bark = 0;
        const W = this.bossWindupTime();
        p.wiggle = Math.min(1, this.t / 0.4);
        const lockAt = W - 0.3;
        if (!this.locked) {
          this.aimX = petX;
          this.aimZ = petZ;
          if (this.feint && !this.feinted && this.t > W * 0.5) {
            // the telegraph flickers and snaps to a fresh aim — dodging early gets punished
            this.feinted = true;
            ev = 'feint';
          }
          if (this.t >= lockAt) this.locked = true;
        }
        this.heading = Math.atan2(this.aimX - this.x, this.aimZ - this.z);
        const d = Math.hypot(this.aimX - this.x, this.aimZ - this.z);
        this.dirX = (this.aimX - this.x) / (d || 1);
        this.dirZ = (this.aimZ - this.z) / (d || 1);
        const len = Math.min(5.2, d + 1.4);
        this.telegraph.visible = true;
        this.telegraph.position.set(this.x, 0.03, this.z);
        this.telegraph.rotation.y = this.heading;
        this.telegraph.scale.set(1, 1, len);
        const flick = this.feinted && this.t < W * 0.5 + 0.15 ? 0.5 + Math.sin(this.t * 60) * 0.5 : 1;
        (this.telegraph.material as THREE.MeshBasicMaterial).opacity = ((this.locked ? 0.95 : 0.45) + Math.sin(this.t * 20) * 0.08) * flick;
        if (this.t >= W) {
          this.state = 'lunge';
          this.t = 0;
          this.lungeLeft = len;
        }
        break;
      }
      case 'lunge': {
        const step = Math.min(this.lungeLeft, BABADOOK.lungeSpeed * 1.08 * dt);
        this.x += this.dirX * step;
        this.z += this.dirZ * step;
        this.lungeLeft -= step;
        p.leap = 1 - this.lungeLeft / Math.max(0.01, this.telegraph.scale.z);
        if (dPet < BABADOOK.lungeHitRadius && petY < 0.35) {
          this.telegraph.visible = false;
          this.state = 'btaunt';
          this.t = 0;
          ev = 'hit';
        } else if (this.lungeLeft <= 0.001) {
          this.telegraph.visible = false;
          this.combo--;
          ev = 'dodged';
          if (this.combo > 0) this.beginWindup(true);
          else {
            this.state = 'dizzy';
            this.t = 0;
          }
        }
        break;
      }
      case 'dizzy': {
        p.dizzy = 1;
        this.stars.visible = true;
        this.stars.children.forEach((s, i) => {
          const a = this.t * 5 + (i * Math.PI * 2) / 4;
          s.position.set(Math.cos(a) * 0.14, 0.42 + Math.sin(this.t * 7 + i) * 0.02, Math.sin(a) * 0.14);
        });
        this.stars.position.set(this.x, 0, this.z);
        if (this.t >= [1.9, 1.5, 1.25][this.phase - 1] * (S.dizzyTime / 1.6)) {
          this.stars.visible = false;
          this.state = 'bstalk';
          this.orbit = this.rnd() < 0.5 ? -1 : 1;
          this.t = 0;
          ev = 'timeout';
        }
        break;
      }
      case 'counter':
        this.stars.visible = false;
        p.hit = Math.max(0, 1 - this.t * 2);
        if (this.t > 0.5) {
          this.hp--;
          this.t = 0;
          if (this.hp <= 0) {
            this.state = 'bdefeat';
            this.clearRings();
            ev = 'bossDefeated';
          } else {
            // reel back, then come again (faster)
            this.state = 'bstalk';
            this.orbit = -this.orbit;
            const away = Math.atan2(this.x - petX, this.z - petZ);
            this.x = Math.max(-3.6, Math.min(11.2, this.x + Math.sin(away) * 0.8));
            this.z = Math.max(-18.2, Math.min(-7.9, this.z + Math.cos(away) * 0.8));
            ev = 'bossHurt';
          }
        }
        break;
      case 'btaunt':
        // he got you: tail up, a smug hiss, then back to circling
        p.tailMood = 0.95;
        p.bark = this.t < 0.6 ? 0.8 : 0;
        this.heading = toPet;
        if (this.t > 1.0) {
          this.state = 'bstalk';
          this.t = 0;
        }
        break;
      case 'bring': {
        // rear up and hiss; the red pool under him swells; then the shockwave(s) roll out across the grass
        this.heading = toPet;
        if (this.ringTell > 0) {
          this.ringTell -= dt;
          p.sit = 0.6;
          p.bark = 0.9;
          p.wiggle = 0.6;
          const u = 1 - this.ringTell / 0.85;
          this.tellRing.visible = true;
          this.tellRing.position.set(this.x, 0.04, this.z);
          this.tellRing.scale.setScalar(0.4 + u * 0.8);
          if (this.ringTell <= 0) {
            this.ringCX = this.x;
            this.ringCZ = this.z;
            ev = 'ringStart';
          }
        } else {
          this.tellRing.visible = false;
          p.sit = 0;
          this.ringGap -= dt;
          if (this.ringsLeft > 0 && this.ringGap <= 0) {
            this.rings.push({ r: 0.3, checked: false, mesh: this.makeRing() });
            this.ringsLeft--;
            this.ringGap = 0.75;
            if (ev === 'none') ev = 'ringStart';
          }
          if (this.ringsLeft <= 0 && this.t > 1.6) {
            this.state = 'bstalk';
            this.t = 0;
          }
        }
        break;
      }
      case 'bdefeat':
      case 'retreat': {
        const defeated = this.state === 'bdefeat';
        const speed = BABADOOK.retreatSpeed * (defeated ? 1.9 : 1.1);
        const dx = HOLE.x - this.x;
        const dz = HOLE.z + 0.05 - this.z;
        const d = Math.hypot(dx, dz);
        p.speed = speed;
        p.gait = 'bound';
        p.tailMood = defeated ? 0 : 0.9;
        if (d < 0.12 || this.t > 9) {
          const was = this.state;
          this.cancel();
          return was === 'bdefeat' ? 'done' : 'bossEscaped';
        }
        const step = Math.min(d, speed * dt);
        this.x += (dx / d) * step;
        this.z += (dz / d) * step;
        this.heading = Math.atan2(dx, dz);
        break;
      }
    }
    return ev;
  }
  ringCX = 0;
  private bossStarted = false;
  ringCZ = 0;

  get active() {
    return this.state !== 'hidden';
  }
  /** States in which he can hurt the pet. */
  get dangerous() {
    return this.state === 'emerge' || this.state === 'windup' || this.state === 'lunge' || this.state === 'bring';
  }

  start(stats: PetStats, petX: number, petZ: number) {
    this.stats = stats;
    this.state = 'emerge';
    this.t = 0;
    this.totalT = 0;
    this.x = HOLE.x;
    this.z = HOLE.z + 0.05;
    this.heading = Math.atan2(petX - this.x, petZ - this.z);
    this.model.root.visible = true;
    this.model.p.tailMood = 0.1;
    this.eyes.visible = true;
    this.locked = false;
  }

  /** Cancel immediately (deadline / reset). */
  cancel() {
    this.state = 'hidden';
    this.boss = false;
    this.clearRings();
    this.model.root.visible = false;
    this.telegraph.visible = false;
    this.stars.visible = false;
    this.eyes.visible = false;
  }

  canCounter(petX: number, petZ: number) {
    return this.state === 'dizzy' && Math.hypot(petX - this.x, petZ - this.z) <= this.stats.counterRange;
  }

  counter() {
    if (this.state !== 'dizzy') return false;
    this.state = 'counter';
    this.t = 0;
    return true;
  }

  update(dt: number, petX: number, petY: number, petZ: number): EncEvent {
    if (this.state === 'hidden') return 'none';
    this.t += dt;
    this.totalT += dt;
    const m = this.model;
    const p = m.p;
    let ev: EncEvent = 'none';
    p.speed = 0;
    p.crouch = 0;
    p.wiggle = 0;
    p.dizzy = 0;
    p.leap = -1;
    p.gait = 'trot';
    const S = this.stats;

    if (this.boss && this.state !== 'emerge' && !(this.state === 'windup' && this.hold)) {
      if (!this.bossStarted) {
        // first move after the reveal: start circling
        this.bossStarted = true;
        this.state = 'bstalk';
        this.t = 0;
      }
      ev = this.updateBoss(dt, petX, petY, petZ);
      if ((this.state as EncState) !== 'hidden') {
        m.root.position.set(this.x, 0, this.z);
        m.root.rotation.y = this.heading;
        m.update(dt);
      }
      return ev;
    }
    switch (this.state) {
      case 'emerge': {
        // slink out of the lattice hole toward the pet
        const ex = HOLE.x + Math.sin(this.heading) * 0.85;
        const ez = HOLE.z - 0.55 + Math.cos(this.heading) * 0.35;
        const u = Math.min(1, this.t / BABADOOK.emergeTime);
        this.x = HOLE.x + (ex - HOLE.x) * u;
        this.z = HOLE.z + (ez - HOLE.z) * u;
        p.speed = u < 1 ? 1.2 : 0;
        p.crouch = 0.6;
        this.heading = Math.atan2(petX - this.x, petZ - this.z);
        this.eyes.visible = u < 0.3;
        if (u >= 1) {
          this.state = 'windup';
          this.t = 0;
        }
        break;
      }
      case 'windup': {
        p.crouch = 0.85;
        if (this.hold) {
          // menacing glare for the reveal: low, tail lashing, mouth open in a hiss
          this.t = 0;
          p.wiggle = 0.35;
          p.bark = 0.8 + Math.sin(this.totalT * 9) * 0.2;
          p.tailMood = 0.05;
          this.heading = Math.atan2(petX - this.x, petZ - this.z);
          this.telegraph.visible = false;
          break;
        }
        p.bark = 0;
        p.wiggle = Math.min(1, this.t / 0.4);
        if (!this.locked) {
          this.aimX = petX;
          this.aimZ = petZ;
          if (this.t >= S.windup - S.dodgeLock) this.locked = true;
        }
        this.heading = Math.atan2(this.aimX - this.x, this.aimZ - this.z);
        const d = Math.hypot(this.aimX - this.x, this.aimZ - this.z);
        this.dirX = (this.aimX - this.x) / (d || 1);
        this.dirZ = (this.aimZ - this.z) / (d || 1);
        const len = Math.min(4.4, d + 1.2);
        this.telegraph.visible = true;
        this.telegraph.position.set(this.x, 0.03, this.z);
        this.telegraph.rotation.y = this.heading;
        this.telegraph.scale.set(1, 1, len);
        (this.telegraph.material as THREE.MeshBasicMaterial).opacity = (this.locked ? 0.95 : 0.45) + Math.sin(this.t * 20) * 0.08;
        if (this.t >= S.windup) {
          this.state = 'lunge';
          this.t = 0;
          this.lungeLeft = len;
        }
        break;
      }
      case 'lunge': {
        const step = Math.min(this.lungeLeft, BABADOOK.lungeSpeed * dt);
        this.x += this.dirX * step;
        this.z += this.dirZ * step;
        this.lungeLeft -= step;
        p.leap = 1 - this.lungeLeft / Math.max(0.01, this.telegraph.scale.z);
        p.speed = 0;
        const hit = Math.hypot(petX - this.x, petZ - this.z) < BABADOOK.lungeHitRadius && petY < 0.35;
        if (hit) {
          this.telegraph.visible = false;
          this.state = 'retreat';
          this.t = 0;
          ev = 'hit';
        } else if (this.lungeLeft <= 0.001) {
          this.telegraph.visible = false;
          this.state = 'dizzy';
          this.t = 0;
          ev = 'dodged';
        }
        break;
      }
      case 'dizzy': {
        p.dizzy = 1;
        p.sit = 0;
        this.stars.visible = true;
        const hy = 0.42;
        this.stars.children.forEach((s, i) => {
          const a = this.t * 5 + (i * Math.PI * 2) / 4;
          s.position.set(Math.cos(a) * 0.14, hy + Math.sin(this.t * 7 + i) * 0.02, Math.sin(a) * 0.14);
        });
        this.stars.position.set(this.x, 0, this.z);
        if (this.t >= S.dizzyTime) {
          this.stars.visible = false;
          this.state = 'retreat';
          this.t = 0;
          ev = 'timeout';
        }
        break;
      }
      case 'counter':
        this.stars.visible = false;
        p.hit = Math.max(0, 1 - this.t * 2);
        if (this.t > 0.45) {
          this.state = 'flee';
          this.t = 0;
          ev = 'victory';
        }
        break;
      case 'flee':
      case 'retreat': {
        const speed = this.state === 'flee' ? BABADOOK.retreatSpeed * 1.8 : BABADOOK.retreatSpeed;
        const tx = HOLE.x;
        const tz = HOLE.z + 0.05;
        const dx = tx - this.x;
        const dz = tz - this.z;
        const d = Math.hypot(dx, dz);
        p.speed = speed;
        p.gait = this.state === 'flee' ? 'bound' : 'trot';
        p.tailMood = this.state === 'flee' ? 0 : 0.9; // smug when he wins
        if (d < 0.1 || this.totalT > 14) {
          this.cancel();
          ev = 'done';
        } else {
          const step = Math.min(d, speed * dt);
          this.x += (dx / d) * step;
          this.z += (dz / d) * step;
          this.heading = Math.atan2(dx, dz);
        }
        break;
      }
    }
    if (!this.boss && this.totalT > 14 && (this.state as EncState) !== 'hidden' && this.state !== 'retreat' && this.state !== 'flee') {
      this.state = 'retreat';
      this.telegraph.visible = false;
      this.stars.visible = false;
    }
    if ((this.state as EncState) !== 'hidden') {
      m.root.position.set(this.x, Math.max(0, groundHeight(this.x, this.z) * 0), this.z);
      m.root.rotation.y = this.heading;
      m.update(dt);
    }
    return ev;
  }

  /** Golden eyes occasionally peering out of the hole (foreshadowing, never an attack). */
  updatePeek(dt: number, petDist: number, allowed: boolean, rnd: number) {
    if (this.active) return false;
    this.peekCooldown -= dt;
    if (this.peekT > 0) {
      this.peekT -= dt;
      const blink = Math.sin(this.peekT * 9) > 0.92;
      this.eyes.visible = this.peekT > 0 && !blink;
      return false;
    }
    this.eyes.visible = false;
    if (allowed && petDist < 5.5 && this.peekCooldown <= 0 && rnd < dt * 0.6) {
      this.peekT = 2.2;
      this.peekCooldown = BABADOOK.peekCooldown;
      return true;
    }
    return false;
  }
}
