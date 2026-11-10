import * as THREE from 'three';
import { cameraClear } from './physics';
import { FLAP, FLOOR, insideHouse } from '../world/layout';

export function angDiff(a: number, b: number) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Third-person follow camera: behind and slightly above the pet, auto-reorienting, wall-aware. */
export class FollowCam {
  cam: THREE.PerspectiveCamera;
  yaw = 0; // camera looks along (sin yaw, 0, cos yaw)
  dist = 1.4;
  height = 0.7;
  private curDist = 1.4;
  private pos = new THREE.Vector3();
  private look = new THREE.Vector3();
  frozenYaw = false; // during Babadook encounters
  private initialised = false;
  indoorBlend = 1;

  constructor(aspect: number) {
    this.cam = new THREE.PerspectiveCamera(62, aspect, 0.06, 260);
  }

  snap(x: number, y: number, z: number, heading: number) {
    this.yaw = heading;
    this.initialised = false;
    this.update(0, x, y, z, heading, 0);
  }

  update(dt: number, x: number, y: number, z: number, heading: number, speed: number) {
    const indoors = insideHouse(x, z) || (x > -2.4 && x < 0.3 && z < -0.8 && z > -6.5 && y > FLOOR - 0.2);
    const k = dt > 0 ? 1 - Math.exp(-dt * 2.5) : 1;
    this.indoorBlend += ((indoors ? 1 : 0) - this.indoorBlend) * k;
    const ib = this.indoorBlend;
    this.dist = 1.12 * ib + 1.7 * (1 - ib);
    this.height = 0.55 * ib + 0.78 * (1 - ib);

    // auto-follow: swing gently behind the pet's travel direction
    if (!this.frozenYaw && speed > 0.25) {
      let target = heading;
      // dog-flap rail: align with the door normal so the camera passes cleanly through the doorway
      const nearFlap = Math.abs(x - FLAP.x) < 1.6 && Math.abs(z - FLAP.zc) < 0.9;
      if (nearFlap) target = Math.sin(heading) < 0 ? -Math.PI / 2 : Math.PI / 2;
      const d = angDiff(target, this.yaw);
      // slower when the pet runs toward the camera so the view never whips around
      const rate = (nearFlap ? 5.5 : 2.2) * (Math.abs(d) > 2.4 ? 0.45 : 1) * Math.min(1, speed / 1.5);
      this.yaw += d * Math.min(1, rate * dt);
    }

    const tx = x;
    const ty = y + 0.22;
    const tz = z;
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    const cx = tx - fx * this.dist;
    const cz = tz - fz * this.dist;
    const cy = y + this.height;
    const clear = cameraClear(tx, ty, tz, cx, cy, cz);
    const want = Math.max(0.35, this.dist * clear);
    // pull in fast, ease out slowly
    if (!this.initialised) this.curDist = want;
    else if (want < this.curDist) this.curDist += (want - this.curDist) * Math.min(1, dt * 18);
    else this.curDist += (want - this.curDist) * Math.min(1, dt * 2.5);
    const dd = this.curDist / this.dist;
    const px = tx + (cx - tx) * dd;
    const pz = tz + (cz - tz) * dd;
    const py = ty + (cy - ty) * Math.max(0.55, dd);
    const target = new THREE.Vector3(px, py, pz);
    if (!this.initialised) {
      this.pos.copy(target);
      this.look.set(tx, ty, tz);
      this.initialised = true;
    } else {
      this.pos.lerp(target, Math.min(1, dt * 12));
      this.look.lerp(new THREE.Vector3(tx, ty, tz), Math.min(1, dt * 14));
    }
    this.cam.position.copy(this.pos);
    // look slightly ahead of the pet
    this.cam.lookAt(this.look.x + fx * 0.6, this.look.y + 0.05, this.look.z + fz * 0.6);
  }

  /** Fixed cinematic shot. */
  set(px: number, py: number, pz: number, lx: number, ly: number, lz: number) {
    this.cam.position.set(px, py, pz);
    this.cam.lookAt(lx, ly, lz);
    this.pos.set(px, py, pz);
    this.initialised = false;
  }
}
