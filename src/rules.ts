// Pure gameplay rules: scoring, present lifecycle, Babadook scheduling, catching minigame.
// No three.js or DOM here so these can be unit tested.
import { BABADOOK, CATCH, PREY_MOTION, pointsFor, type PetId, type PresentKind, type PreyKind, PETS } from './config';

export type Rng = () => number;
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- stats
export interface RunStats {
  pet: PetId;
  score: number;
  delivered: Record<PresentKind, number>;
  points: Record<PresentKind, number>;
  catchAttempts: number;
  catches: number;
  encounters: number;
  victories: number;
  lostToBabadook: number;
  date: string;
}

export function emptyStats(pet: PetId): RunStats {
  const z = () => ({ mouse: 0, chipmunk: 0, bird: 0, squirrel: 0, snake: 0, stick: 0 });
  return {
    pet,
    score: 0,
    delivered: z(),
    points: z(),
    catchAttempts: 0,
    catches: 0,
    encounters: 0,
    victories: 0,
    lostToBabadook: 0,
    date: new Date().toISOString(),
  };
}

export function totalDelivered(s: RunStats): number {
  return Object.values(s.delivered).reduce((a, b) => a + b, 0);
}

export function accuracy(s: RunStats): number | null {
  return s.catchAttempts > 0 ? Math.round((100 * s.catches) / s.catchAttempts) : null;
}

// ---------------------------------------------------------------- presents
export type PresentState =
  | 'wild' // free in the yard
  | 'captured' // caught, attached to pet (being carried)
  | 'delivered' // scored, now roaming the living room
  | 'lost' // escaped after Babadook / expired / despawned; can never score
  | 'ground'; // a stick lying on the ground (can be picked up)

export interface Present {
  id: number;
  kind: PresentKind;
  state: PresentState;
  scored: boolean;
}

/**
 * Tracks every present's lifecycle and the run's scoring. All mutations go
 * through here so a present can never score twice or score after the deadline.
 */
export class Ledger {
  presents = new Map<number, Present>();
  private nextId = 1;
  carried: number | null = null;
  acquiredCount = 0; // successful pickups/catches this run (haul index)
  stats: RunStats;
  open = true; // false once time hits zero
  ranked: boolean;

  constructor(pet: PetId, ranked = true) {
    this.stats = emptyStats(pet);
    this.ranked = ranked;
  }

  spawn(kind: PresentKind, state: PresentState = kind === 'stick' ? 'ground' : 'wild'): Present {
    const p: Present = { id: this.nextId++, kind, state, scored: false };
    this.presents.set(p.id, p);
    return p;
  }

  get(id: number) {
    return this.presents.get(id);
  }

  noteAttempt() {
    if (this.open) this.stats.catchAttempts++;
  }

  /** Wildlife caught after a successful minigame, or a stick picked up. */
  acquire(id: number): boolean {
    const p = this.presents.get(id);
    if (!p || !this.open || this.carried !== null) return false;
    if (p.kind === 'stick' ? p.state !== 'ground' : p.state !== 'wild') return false;
    p.state = 'captured';
    this.carried = id;
    this.acquiredCount++;
    if (p.kind !== 'stick') this.stats.catches++;
    return true;
  }

  /** Returns points awarded (0 if ineligible). */
  deposit(): { points: number; present: Present | null } {
    const id = this.carried;
    if (id === null) return { points: 0, present: null };
    const p = this.presents.get(id)!;
    this.carried = null;
    if (!this.open || p.scored || p.state !== 'captured') {
      p.state = 'lost';
      return { points: 0, present: p };
    }
    p.state = 'delivered';
    p.scored = true;
    const pts = this.ranked ? pointsFor(this.stats.pet, p.kind) : 0; // exploring: deliveries count for chaos, never for score
    this.stats.delivered[p.kind]++;
    this.stats.points[p.kind] += pts;
    this.stats.score += pts;
    return { points: pts, present: p };
  }

  /** Carried present lost (Babadook hit). Sticks return to the ground; animals flee for good. */
  dropCarried(byBabadook: boolean): Present | null {
    const id = this.carried;
    if (id === null) return null;
    const p = this.presents.get(id)!;
    this.carried = null;
    p.state = p.kind === 'stick' ? 'ground' : 'lost';
    if (byBabadook && this.open) this.stats.lostToBabadook++;
    return p;
  }

  /** Mark a wild animal as gone (fled off-map) so it can never be acquired. */
  retire(id: number) {
    const p = this.presents.get(id);
    if (p && (p.state === 'wild' || p.state === 'ground')) p.state = 'lost';
  }

  /** Deadline reached: nothing else can score. */
  close() {
    this.open = false;
    if (this.carried !== null) {
      const p = this.presents.get(this.carried)!;
      p.state = 'lost';
      this.carried = null;
    }
  }

  encounterStarted() {
    if (this.open) this.stats.encounters++;
  }
  encounterWon() {
    if (this.open) this.stats.victories++;
  }
}

// ---------------------------------------------------------------- Babadook scheduling
export class AmbushScheduler {
  encounters = 0;
  lastEncounterTime = -1e9;
  lastEncounterHaul = -1;
  checkedHaul = -1; // haul index already rolled for
  enabled: boolean;
  constructor(enabled: boolean, private rng: Rng) {
    this.enabled = enabled;
  }

  /**
   * Called when a loaded pet enters the stair zone.
   * haulIndex: 1-based index of the currently carried present among acquisitions.
   * Rule: always on the 2nd present's return trip; 1 in 4 presents after that; never the 1st.
   */
  check(now: number, haulIndex: number, carrying: boolean): boolean {
    if (!this.enabled || !carrying) return false;
    if (haulIndex < BABADOOK.guaranteedHaul) return false;
    if (this.encounters >= BABADOOK.maxEncounters) return false;
    if (haulIndex === this.checkedHaul) return false; // one roll per haul
    if (haulIndex <= this.lastEncounterHaul) return false;
    this.checkedHaul = haulIndex;
    const hit = haulIndex === BABADOOK.guaranteedHaul || this.rng() < BABADOOK.laterChance;
    if (hit) {
      this.encounters++;
      this.lastEncounterTime = now;
      this.lastEncounterHaul = haulIndex;
    }
    return hit;
  }
}

// ---------------------------------------------------------------- catching minigame
export interface CatchSim {
  prey: PreyKind;
  pet: PetId;
  t: number;
  zone: number; // centre of paw zone 0..1
  zoneVel: number;
  marker: number; // prey marker 0..1
  markerTarget: number;
  retargetIn: number;
  pauseIn: number;
  paused: boolean;
  progress: number;
  overlap: boolean;
  result: 'running' | 'caught' | 'escaped';
}

export function newCatch(prey: PreyKind, pet: PetId): CatchSim {
  return {
    prey,
    pet,
    t: 0,
    zone: 0.5,
    zoneVel: 0,
    marker: 0.5,
    markerTarget: 0.5,
    retargetIn: 0.6,
    pauseIn: 0.8,
    paused: false,
    progress: CATCH.startProgress,
    overlap: true,
    result: 'running',
  };
}

export function stepCatch(c: CatchSim, dt: number, holding: boolean, rng: Rng): void {
  if (c.result !== 'running') return;
  const pet = PETS[c.pet];
  const m = PREY_MOTION[c.prey];
  c.t += dt;
  const settling = c.t < CATCH.settle;

  // paw zone physics
  const half = pet.zoneWidth / 2;
  if (settling) {
    c.zone = 0.5;
    c.zoneVel = 0;
  } else {
    const acc = holding ? CATCH.accelUp : -CATCH.accelDown;
    c.zoneVel += acc * dt;
    c.zoneVel -= c.zoneVel * CATCH.damping * dt;
    c.zone += c.zoneVel * dt;
    if (c.zone < half) {
      c.zone = half;
      c.zoneVel = -c.zoneVel * CATCH.bounce;
    } else if (c.zone > 1 - half) {
      c.zone = 1 - half;
      c.zoneVel = -c.zoneVel * CATCH.bounce;
    }
  }

  // prey marker
  if (!settling) {
    c.retargetIn -= dt;
    if (m.burst > 0) {
      c.pauseIn -= dt;
      if (c.paused) {
        if (c.pauseIn <= 0) {
          c.paused = false;
          c.pauseIn = 0.35 + rng() * 0.45;
          c.retargetIn = 0;
        }
      } else if (c.pauseIn <= 0 && rng() < m.burst) {
        c.paused = true;
        c.pauseIn = m.pauseMin + rng() * (m.pauseMax - m.pauseMin);
      } else if (c.pauseIn <= 0) {
        c.pauseIn = 0.3 + rng() * 0.4;
      }
    }
    if (c.retargetIn <= 0) {
      c.retargetIn = m.retargetMin + rng() * (m.retargetMax - m.retargetMin);
      const delta = (rng() * 2 - 1) * m.span;
      c.markerTarget = Math.min(0.96, Math.max(0.04, c.marker + delta));
    }
    if (!c.paused) {
      const d = c.markerTarget - c.marker;
      const step = Math.sign(d) * Math.min(Math.abs(d), m.speed * dt);
      c.marker += step;
    }
  }

  c.overlap = Math.abs(c.marker - c.zone) <= half;
  if (!settling) {
    if (c.overlap) c.progress += pet.catchGain * dt;
    else c.progress -= pet.catchDrain * dt;
  }
  if (c.progress >= 1) {
    c.progress = 1;
    c.result = 'caught';
  } else if (c.progress <= 0 || c.t >= CATCH.timeLimit) {
    c.progress = Math.max(0, c.progress);
    c.result = 'escaped';
  }
}

/**
 * Human-like controller used in tests: sees the marker with a reaction delay,
 * has imperfect estimation and no knowledge of where the prey is heading.
 */
export class HumanBot {
  private hist: number[] = [];
  constructor(private rng: Rng, private delayFrames = 12, private noise = 0.03, private gain = 1) {}
  hold(c: CatchSim): boolean {
    this.hist.push(c.marker);
    const seen = this.hist[Math.max(0, this.hist.length - 1 - this.delayFrames)];
    const prev = this.hist[Math.max(0, this.hist.length - 2 - this.delayFrames)];
    const markerVel = (seen - prev) * 60;
    const target = seen + markerVel * 0.15 * this.gain + (this.rng() * 2 - 1) * this.noise;
    const predicted = c.zone + c.zoneVel * 0.22;
    return predicted < target;
  }
}
