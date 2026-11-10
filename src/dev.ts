// Development-only test hooks (loaded with ?dev). An autopilot that plays through the same
// virtual arrow/Space input as a person would, plus inspection helpers. Dev runs save to a
// separate storage key so they can never pollute real best scores.
import type { Game } from './game/game';
import type { Key } from './input';
import { BASKET, insideHouse, inRect, DECK } from './world/layout';
import { PETS } from './config';
import { PETE } from './game/neighbors';

type V = [number, number];
const CHAIN: V[] = [
  [BASKET.x - 0.75, BASKET.z], // basket approach
  [7.2, -2.3], // living, just inside the dining opening
  [4.8, -2.55], // dining
  [2.2, -2.8], // kitchen, past the doorway
  [0.6, -3.0], // flap inside
  [-0.6, -3.0], // flap outside
  [-0.6, -3.8], // turn right onto the runner
  [-0.5, -5.9],
  [-0.3, -6.25], // ramp top
  [-0.3, -8.5], // ramp bottom
  [-0.6, -10.0],
];

export function attachDev(game: Game) {
  const bot = new Bot(game);
  const origStep = game.step.bind(game);
  game.step = (dt: number) => {
    if (bot.enabled) bot.tick(dt);
    origStep(dt);
  };
  (window as any).__sd = {
    game,
    bot,
    state: () => game.snapshot(),
    render: () => game.render(),
    timeScale: (n: number) => (game.timeScale = n),
    keys: (k: Key[]) => game.input.setVirtual(k),
    teleport: (x: number, z: number, h = 0) => {
      game.devTainted = true;
      (game as any).setPlayerPose(x, z, h);
      game.fcam.snap(x, game.py, z, h);
    },
    forceAmbush: () => {
      game.devTainted = true;
      (game.scheduler as any).rng = () => 0;
      game.scheduler.lastEncounterTime = -1e9;
    },
    setTimeLeft: (t: number) => {
      game.devTainted = true;
      game.elapsed = game.runSeconds - t;
    },
    /** jump to the halfway mark (Postal Pete) */
    halfway: () => {
      game.devTainted = true;
      game.elapsed = game.runSeconds / 2 - 0.05;
    },
    spawnPrey: (kind: string, x: number, z: number) => game.wildlife.spawnPrey(kind as any, x, z),
    PETE,
  };
}

class Bot {
  enabled = false;
  goal: 'loop' | 'route' | 'direct' | 'idle' = 'idle';
  routeTarget: V | null = null;
  skill = 1;
  noDodge = false;
  keys = new Set<Key>();
  private tapFrames = 0;
  private hist: number[] = [];
  private stuckT = 0;
  private lastPos: V = [0, 0];
  private sidestep = 0;
  private sideDir = 1;
  private wantStalk = false;
  log: string[] = [];
  targetId: number | null = null;
  constructor(private g: Game) {}

  start(goal: 'loop' | 'route' | 'direct', target?: V) {
    this.enabled = true;
    this.goal = goal;
    this.routeTarget = target ?? null;
    this.keys.clear();
  }
  stop() {
    this.enabled = false;
    this.g.input.setVirtual([]);
  }

  private tap() {
    this.tapFrames = 3;
  }

  tick(dt: number) {
    const g = this.g;
    this.keys.clear();
    if (g.mode !== 'play') {
      this.g.input.setVirtual([]);
      return;
    }
    const s = g.snapshot();
    // catching minigame
    if (s.action === 'catch' && s.catch) {
      const c = s.catch;
      this.hist.push(c.marker);
      const seen = this.hist[Math.max(0, this.hist.length - 1 - 12)];
      const prev = this.hist[Math.max(0, this.hist.length - 2 - 12)];
      const v = (seen - prev) * 60;
      const target = seen + v * 0.15 + (Math.random() - 0.5) * 0.06 / this.skill;
      if (c.zone + c.zoneVel * 0.22 < target) this.keys.add('space');
      this.apply();
      return;
    }
    this.hist = [];
    if (s.action !== 'free') {
      this.apply();
      return;
    }
    // Babadook boss fight: hop the shockwaves, hold still while he circles
    if (g.bab.boss && g.bab.active) {
      for (const r of g.bab.rings) {
        const gap = Math.hypot(s.x - g.bab.ringCX, s.z - g.bab.ringCZ) - r.r;
        if (gap > 0.12 && gap < 0.42 && this.tapFrames === 0 && !this.noDodge) this.tap();
      }
      if (['bstalk', 'btaunt', 'bring', 'bdefeat', 'retreat'].includes(s.bab)) {
        this.apply();
        return;
      }
    }
    // Babadook
    if ((s.bab === 'emerge' || s.bab === 'windup' || s.bab === 'lunge') && this.noDodge) {
      this.apply();
      return;
    }
    if (s.bab === 'emerge' || s.bab === 'windup' || s.bab === 'lunge') {
      const b = g.bab;
      const dx = s.x - b.x;
      const dz = s.z - b.z;
      // dodge perpendicular to his aim
      const px = -dz * this.sideDir;
      const pz = dx * this.sideDir;
      this.steer(Math.atan2(px, pz));
      this.apply();
      return;
    }
    if (s.bab === 'dizzy') {
      if (g.bab.canCounter(s.x, s.z)) {
        if (this.tapFrames === 0) this.tap();
      } else this.steer(Math.atan2(g.bab.x - s.x, g.bab.z - s.z));
      this.apply();
      return;
    }
    if (this.goal === 'direct' && this.routeTarget) {
      const [tx, tz] = this.routeTarget;
      if (Math.hypot(tx - s.x, tz - s.z) > 0.2) this.steer(Math.atan2(tx - s.x, tz - s.z));
      this.apply();
      return;
    }
    if (this.goal === 'route' && this.routeTarget) {
      this.navigate(this.routeTarget, s);
      this.apply();
      return;
    }
    if (this.goal !== 'loop') {
      this.apply();
      return;
    }
    // carrying: go home and deposit
    if (s.carrying) {
      this.wantStalk = false;
      const d = Math.hypot(s.x - BASKET.x, s.z - BASKET.z);
      if (d < 1.0 && s.y > 0.5) {
        if (this.tapFrames === 0) this.tap();
      } else this.navigate([BASKET.x - 0.7, BASKET.z], s);
      this.apply();
      return;
    }
    // Penny: sticks first
    if (s.pet === 'penny' && s.sticks.length) {
      let best = s.sticks[0];
      for (const st of s.sticks) if (Math.hypot(st.x - s.x, st.z - s.z) < Math.hypot(best.x - s.x, best.z - s.z)) best = st;
      const d = Math.hypot(best.x - s.x, best.z - s.z);
      if (d < 0.6 && s.y < 0.3) {
        if (this.tapFrames === 0) this.tap();
      } else this.navigate([best.x, best.z], s);
      this.apply();
      return;
    }
    // hunt: pick the nearest catchable animal in the yard
    const cands = s.prey.filter((p) => (p.state === 'idle' || p.state === 'walk') && p.y < 0.2);
    if (!cands.length) {
      this.navigate([3, -12], s);
      this.apply();
      return;
    }
    let tgt = cands.find((p) => p.id === this.targetId) ?? null;
    if (!tgt) {
      tgt = cands.reduce((a, b) => (Math.hypot(a.x - s.x, a.z - s.z) < Math.hypot(b.x - s.x, b.z - s.z) ? a : b));
      this.targetId = tgt.id;
    }
    const d = Math.hypot(tgt.x - s.x, tgt.z - s.z);
    const S = PETS[s.pet];
    const stalkFrom = (S.bell ? S.bellRadius : S.runNoise) + 0.6;
    if (s.y < 0.3 && d < stalkFrom) {
      if (d < S.pounceRange * 0.8 && s.stalking) {
        // release to pounce
        this.wantStalk = false;
      } else {
        this.wantStalk = true;
        this.steer(Math.atan2(tgt.x - s.x, tgt.z - s.z));
      }
      if (tgt.alert >= 0.95) this.targetId = null;
    } else {
      this.wantStalk = false;
      this.navigate([tgt.x, tgt.z], s);
    }
    if (this.wantStalk) this.keys.add('space');
    this.apply();
  }

  private apply() {
    if (this.tapFrames > 0) {
      if (this.tapFrames >= 2) this.keys.add('space');
      this.tapFrames--;
    }
    this.g.input.setVirtual([...this.keys]);
  }

  private chainIndex(x: number, z: number, y: number) {
    let best = 0;
    let bd = 1e9;
    for (let i = 0; i < CHAIN.length; i++) {
      const [cx, cz] = CHAIN[i];
      // keep to the same level: indoor/deck nodes 0..8, yard nodes 9..
      const nodeHigh = i <= 8;
      const high = y > 0.5;
      const pen = nodeHigh === high ? 0 : 6;
      const d = Math.hypot(cx - x, cz - z) + pen;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  }

  private path: V[] = [];
  private pathGoal: V | null = null;
  private pathAge = 0;

  private buildPath(goal: V, s: { x: number; z: number; y: number }) {
    const goalHigh = insideHouse(goal[0], goal[1]) || inRect(goal[0], goal[1], DECK);
    const high = s.y > 0.5;
    const here = this.chainIndex(s.x, s.z, s.y);
    const path: V[] = [];
    if (high && goalHigh) {
      const gi = this.chainIndex(goal[0], goal[1], 1);
      const step = Math.sign(gi - here);
      for (let i = here; step !== 0 && i !== gi; i += step) path.push(CHAIN[i]);
    } else if (high && !goalHigh) {
      for (let i = here; i < CHAIN.length; i++) path.push(CHAIN[i]);
    } else if (!high && goalHigh) {
      const gi = this.chainIndex(goal[0], goal[1], 1);
      if (Math.hypot(s.x - CHAIN[9][0], s.z - CHAIN[9][1]) > 3) path.push(CHAIN[10]);
      for (let i = 9; i >= gi; i--) path.push(CHAIN[i]);
    }
    path.push(goal);
    // drop leading nodes we are already past
    while (path.length > 1) {
      const a = path[0];
      const b = path[1];
      const dab = Math.hypot(a[0] - b[0], a[1] - b[1]);
      const dsb = Math.hypot(s.x - b[0], s.z - b[1]);
      const dsa = Math.hypot(s.x - a[0], s.z - a[1]);
      // already past a, heading toward b (projection onto the segment), or simply close to a
      const along = ((s.x - a[0]) * (b[0] - a[0]) + (s.z - a[1]) * (b[1] - a[1])) / Math.max(1e-6, dab * dab);
      if ((dsb < dab && dsa < 1.0) || (along > 0.05 && along < 1 && dsa < 3.5)) path.shift();
      else break;
    }
    this.path = path;
    this.pathGoal = goal;
    this.pathAge = 0;
  }

  navigate(goal: V, s: { x: number; z: number; y: number }) {
    this.pathAge += 1 / 60;
    if (!this.pathGoal || Math.hypot(goal[0] - this.pathGoal[0], goal[1] - this.pathGoal[1]) > 1.0 || this.pathAge > 12 || !this.path.length) this.buildPath(goal, s);
    else this.path[this.path.length - 1] = goal;
    while (this.path.length > 1 && Math.hypot(this.path[0][0] - s.x, this.path[0][1] - s.z) < 0.35) this.path.shift();
    const wp = this.path[0];
    // stuck handling
    const moved = Math.hypot(s.x - this.lastPos[0], s.z - this.lastPos[1]);
    this.lastPos = [s.x, s.z];
    this.stuckT = moved < 0.004 ? this.stuckT + 1 / 60 : Math.max(0, this.stuckT - 1 / 30);
    let ang = Math.atan2(wp[0] - s.x, wp[1] - s.z);
    if (this.stuckT > 0.6) {
      this.sidestep = 0.7;
      this.sideDir = Math.random() < 0.5 ? 1 : -1;
      this.stuckT = 0;
      this.log.push(`stuck at ${s.x.toFixed(2)},${s.z.toFixed(2)} -> wp ${wp[0]},${wp[1]}`);
    }
    if (this.sidestep > 0) {
      this.sidestep -= 1 / 60;
      ang += (this.sideDir * Math.PI) / 2;
    }
    this.steer(ang);
  }

  /** Convert a world direction into arrow keys relative to the current camera. */
  steer(ang: number) {
    const yaw = this.g.fcam.yaw;
    const rel = ang - yaw;
    const ay = Math.cos(rel);
    const ax = -Math.sin(rel);
    if (ay > 0.38) this.keys.add('up');
    if (ay < -0.38) this.keys.add('down');
    if (ax > 0.38) this.keys.add('right');
    if (ax < -0.38) this.keys.add('left');
  }
}
