// The two neighbours. Postal Pete lives behind the left (wooden) fence and pops up over it halfway through
// every run; the back neighbour hangs around his bonfire and wanders over to the chain-link fence whenever
// the pet loiters near it, and says his piece if the pet is still there when he arrives.
import * as THREE from 'three';
import { Person, makeBackNeighbor, makePostalPete } from '../actors/person';
import { BACKLOT } from '../world/backlot';
import { LOT } from '../world/layout';
import type { Audio } from '../audio';

export const PETE = { x: LOT.x0 - 0.54, z: -13.83, up: 0.5, line: 'Psst. You\'ve got mail.' };

/** The scare zone: the left side of the back yard, where Pete pops up. */
export const SCARE = { x0: LOT.x0, x1: 3.4, z0: -6.6, z1: LOT.z1 };

type NState = 'chair' | 'getup' | 'walk' | 'arrive' | 'talk' | 'linger' | 'return' | 'sitdown';

export class Neighbors {
  pete: Person | null = null;
  back: Person | null = null;
  private built = false;
  // Pete
  peteT = -1; // >= 0 while his scene plays
  // back neighbour
  nState: NState = 'chair';
  private nT = 0;
  private nx = BACKLOT.chair.x;
  private nz = BACKLOT.chair.z;
  private nHeading = BACKLOT.chair.ry;
  private tx = 0;
  private tz = 0;
  private loiter = 0;
  private cooldown = 6;
  private talked = false;
  talkedCount = 0;

  constructor(private scene: THREE.Scene, private audio: Audio) {}

  /** Build the people (expensive: ~1 s each). Called once, after the title screen is up. */
  build() {
    if (this.built) return;
    this.built = true;
    this.pete = makePostalPete();
    this.pete.root.visible = false;
    this.pete.root.rotation.y = Math.PI / 2; // facing the yard (+x)
    this.pete.pose = 'fence';
    this.scene.add(this.pete.root);
    this.back = makeBackNeighbor();
    this.back.pose = 'sit';
    this.scene.add(this.back.root);
    this.placeBack();
  }
  get ready() {
    return this.built;
  }

  reset() {
    this.peteT = -1;
    if (this.pete) this.pete.root.visible = false;
    this.nState = 'chair';
    this.nx = BACKLOT.chair.x;
    this.nz = BACKLOT.chair.z;
    this.nHeading = BACKLOT.chair.ry;
    this.cooldown = 6;
    this.loiter = 0;
    this.talkedCount = 0;
    if (this.back) {
      this.back.pose = 'sit';
      this.back.speed = 0;
      this.back.talk = 0;
    }
    this.placeBack();
  }

  // ---------------------------------------------------------------- Pete
  /** Starts Pete's appearance. Returns the scene length. */
  startPete() {
    this.peteT = 0;
    if (this.pete) {
      this.pete.root.visible = true;
      this.pete.pose = 'fence';
      this.pete.creep = 1;
      this.pete.talk = 0;
    }
    return PETE_SCENE.total;
  }

  /** Root height for Pete at scene time t (behind the 1.8 m fence). He rises a little higher than his resting
   *  height, reaches over, then settles his hands onto the top board; leaving reverses it, so his hands never
   *  pass through the boards. */
  private peteY(t: number) {
    const S = PETE_SCENE;
    const down = -1.2;
    const up = PETE.up;
    const hi = up + 0.13;
    const ease = (u: number) => u * u * (3 - 2 * u);
    const k = (a: number, b: number) => ease(Math.min(1, Math.max(0, (t - a) / (b - a))));
    if (t < S.rise0) return down;
    if (t < S.rise1) return down + (hi - down) * k(S.rise0, S.rise1);
    if (t < S.grip1) return hi;
    if (t < S.settle) return hi + (up - hi) * k(S.grip1, S.settle);
    if (t < S.sink0) return up;
    if (t < S.let0) return up + (hi - up) * k(S.sink0, S.let0);
    if (t < S.let1) return hi;
    if (t < S.sink1) return hi + (down - hi) * k(S.let1, S.sink1);
    return down;
  }

  /** How far into the fence-gripping arm pose Pete is at scene time t (0 = arms down, 1 = gripping the top). */
  private peteGrip(t: number) {
    const S = PETE_SCENE;
    const ease = (u: number) => u * u * (3 - 2 * u);
    if (t < S.rise1) return 0;
    if (t < S.grip1) return ease((t - S.rise1) / (S.grip1 - S.rise1));
    if (t < S.let0) return 1;
    if (t < S.let1) return 1 - ease((t - S.let0) / (S.let1 - S.let0));
    return 0;
  }

  /** Where Pete's face is (for the camera). */
  peteHead() {
    return new THREE.Vector3(PETE.x + 0.08, this.peteY(this.peteT) + 1.47, PETE.z);
  }

  private updatePete(dt: number) {
    const P = this.pete;
    if (!P) return;
    if (this.peteT < 0) {
      P.root.visible = false;
      return;
    }
    this.peteT += dt;
    const t = this.peteT;
    P.root.position.set(PETE.x, this.peteY(t), PETE.z);
    P.fenceAmt = this.peteGrip(t);
    P.root.rotation.y = Math.PI / 2;
    // the slow head tilt, then a stare straight down the camera while he talks
    P.talk = t > PETE_SCENE.line0 && t < PETE_SCENE.line1 ? 1 : 0;
    P.lookYaw = Math.sin(t * 0.7) * 0.08;
    P.lookPitch = -0.08;
    P.update(dt);
    if (t > PETE_SCENE.total) {
      this.peteT = -1;
      P.root.visible = false;
    }
  }

  // ---------------------------------------------------------------- back neighbour
  private placeBack() {
    const B = this.back;
    if (!B) return;
    B.root.position.set(this.nx, 0, this.nz);
    B.root.rotation.y = this.nHeading;
  }

  /** Walk to (tx,tz), going round the corner of his house via the strip along our fence when needed. */
  private walkVia(tx: number, tz: number, dt: number, speed = 1.05) {
    const H = BACKLOT.house;
    const corner = { x: H.x0 - 0.7, z: H.z0 + 1.9 };
    const inBack = this.nx < H.x0 - 0.2 && this.nz < H.z0 + 0.4;
    const inStrip = this.nz > H.z0 + 0.4;
    const targetStrip = tz > H.z0 + 0.4 && tx > H.x0 - 0.5;
    const targetBack = tx < H.x0 - 0.2 && tz < H.z0 + 0.4;
    if ((inBack && targetStrip) || (inStrip && targetBack && this.nx > H.x0 - 0.5)) {
      this.walkTo(corner.x, corner.z, dt, speed);
      return false;
    }
    return this.walkTo(tx, tz, dt, speed);
  }

  private walkTo(tx: number, tz: number, dt: number, speed = 1.05) {
    // steer round the fire pit
    const F = BACKLOT.fire;
    let gx = tx;
    let gz = tz;
    const dx = tx - this.nx;
    const dz = tz - this.nz;
    const len = Math.hypot(dx, dz) || 1;
    const t = Math.max(0, Math.min(1, ((F.x - this.nx) * dx + (F.z - this.nz) * dz) / (len * len)));
    const px = this.nx + dx * t - F.x;
    const pz = this.nz + dz * t - F.z;
    if (Math.hypot(px, pz) < 1.4 && t > 0 && t < 1) {
      const s = Math.sign(px * 1 + pz * 0.01) || 1;
      gx = F.x + (px / (Math.hypot(px, pz) || 1)) * 1.8 + s * 0.01;
      gz = F.z + (pz / (Math.hypot(px, pz) || 1)) * 1.8;
    }
    const ddx = gx - this.nx;
    const ddz = gz - this.nz;
    const d = Math.hypot(ddx, ddz);
    const want = Math.atan2(ddx, ddz);
    let diff = want - this.nHeading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.nHeading += diff * Math.min(1, dt * 4);
    const step = Math.min(d, speed * dt);
    if (d > 0.01) {
      this.nx += (ddx / d) * step;
      this.nz += (ddz / d) * step;
    }
    return Math.hypot(tx - this.nx, tz - this.nz) < 0.12;
  }

  private turnTo(want: number, dt: number) {
    let diff = want - this.nHeading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.nHeading += diff * Math.min(1, dt * 3);
  }

  /**
   * @param pet where the pet is (in the yard?) — `near` means it is loitering close to the back fence.
   * @param allow false during cutscenes/menus: he stays put.
   */
  update(dt: number, pet: { x: number; z: number; inYard: boolean }, allow: boolean) {
    this.updatePete(dt);
    const B = this.back;
    if (!B) return;
    const near = allow && pet.inYard && pet.z < BACKLOT.fenceZ + 2.6 && pet.x > LOT.x0 + 0.3 && pet.x < LOT.x1 - 0.3;
    this.loiter = near ? this.loiter + dt : Math.max(0, this.loiter - dt * 2);
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.nT += dt;
    B.speed = 0;
    switch (this.nState) {
      case 'chair':
        B.pose = 'sit';
        B.talk = 0;
        B.lookYaw = Math.sin(this.nT * 0.3) * 0.3;
        this.nx = BACKLOT.chair.x;
        this.nz = BACKLOT.chair.z;
        this.turnTo(BACKLOT.chair.ry, dt);
        if (this.loiter > 0.7 && this.cooldown <= 0) {
          this.nState = 'getup';
          this.nT = 0;
        }
        break;
      case 'getup':
        B.pose = 'stand';
        if (this.nT > 0.9) {
          this.nState = 'walk';
          this.nT = 0;
          this.talked = false;
        }
        break;
      case 'walk': {
        B.pose = 'smoke';
        // head for the stretch of fence nearest the pet (his side of it), re-aiming as the pet moves
        this.tx = Math.max(-3.4, Math.min(LOT.x1 - 0.8, pet.x));
        this.tz = BACKLOT.fenceZ - 0.42;
        B.speed = 1.05;
        B.lookYaw = 0;
        if (this.walkVia(this.tx, this.tz, dt)) {
          this.nState = 'arrive';
          this.nT = 0;
        }
        if (this.nT > 2 && this.loiter <= 0) {
          // the pet left before he got there
          this.nState = 'return';
          this.nT = 0;
        }
        break;
      }
      case 'arrive':
        B.pose = 'lean';
        this.turnTo(0, dt); // face our yard (+z)
        if (this.nT > 0.6) {
          const close = near && Math.hypot(pet.x - this.nx, pet.z - this.nz) < 4.5;
          if (close && !this.talked) {
            this.nState = 'talk';
            this.nT = 0;
            this.talked = true;
            this.talkedCount++;
            if (!this.audio.clip('neighbor', 1.25)) this.nT = 99;
          } else {
            this.nState = 'linger';
            this.nT = 0;
          }
        }
        break;
      case 'talk': {
        B.pose = 'lean';
        const dur = Math.max(1.5, this.audio.clipDuration('neighbor'));
        B.talk = this.nT < dur ? 1 : 0;
        // look at the pet
        B.lookYaw = Math.max(-0.7, Math.min(0.7, Math.atan2(pet.x - this.nx, pet.z - this.nz) - this.nHeading));
        if (this.nT > dur + 0.3) {
          this.nState = 'linger';
          this.nT = 0;
        }
        break;
      }
      case 'linger':
        B.pose = 'lean';
        B.talk = 0;
        B.lookYaw = Math.max(-0.7, Math.min(0.7, Math.atan2(pet.x - this.nx, pet.z - this.nz) - this.nHeading)) * (near ? 1 : 0.3);
        if ((!near && this.nT > 1.5) || this.nT > 7) {
          this.nState = 'return';
          this.nT = 0;
        }
        break;
      case 'return':
        B.pose = 'smoke';
        B.speed = 0.85;
        B.lookYaw = 0;
        if (this.walkVia(BACKLOT.chair.x, BACKLOT.chair.z + 0.05, dt, 0.85)) {
          this.nState = 'sitdown';
          this.nT = 0;
        }
        break;
      case 'sitdown':
        B.pose = 'sit';
        this.turnTo(BACKLOT.chair.ry, dt);
        if (this.nT > 1.2) {
          this.nState = 'chair';
          this.nT = 0;
          this.cooldown = 14;
        }
        break;
    }
    this.placeBack();
    B.update(dt);
  }

  /** Where the back neighbour is (for tests and the camera). */
  backPos() {
    return { x: this.nx, z: this.nz, state: this.nState };
  }
}

/** Timing of Pete's scene (seconds). */
export const PETE_SCENE = {
  rise0: 0.5,
  rise1: 1.55, // up behind the fence, a little high
  grip1: 2.0, // arms reached over the top board
  settle: 2.3, // hands set down on it
  line0: 2.3,
  line1: 6.4,
  scare: 2.4, // the animals bolt as he starts talking
  wide0: 6.6, // cut to a wide shot of the emptied side of the yard
  sink0: 6.6, // lift the hands off the board...
  let0: 6.8,
  let1: 7.2, // ...arms back down...
  sink1: 7.9, // ...and sink out of sight
  total: 8.6,
};
