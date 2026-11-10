import { describe, it, expect } from 'vitest';
import { Ledger, AmbushScheduler, newCatch, stepCatch, HumanBot, mulberry32, accuracy } from '../src/rules';
import type { PetId, PreyKind } from '../src/config';

function simulate(pet: PetId, prey: PreyKind, seed: number, skill = 1) {
  const rng = mulberry32(seed);
  const c = newCatch(prey, pet);
  const bot = new HumanBot(mulberry32(seed + 1), 12, 0.03 / skill);
  const dt = 1 / 60;
  while (c.result === 'running') stepCatch(c, dt, bot.hold(c), rng);
  return c;
}

function rate(pet: PetId, prey: PreyKind, n = 400) {
  let ok = 0;
  let tsum = 0;
  for (let i = 0; i < n; i++) {
    const c = simulate(pet, prey, 1000 + i * 7);
    if (c.result === 'caught') {
      ok++;
      tsum += c.t;
    }
  }
  return { rate: ok / n, avgT: ok ? tsum / ok : 0 };
}

describe('catching minigame', () => {
  const kinds: PreyKind[] = ['mouse', 'chipmunk', 'bird', 'squirrel'];
  const table: Record<string, Record<string, { rate: number; avgT: number }>> = {};
  for (const pet of ['darrow', 'rufus', 'penny'] as PetId[]) {
    table[pet] = {};
    for (const k of kinds) table[pet][k] = rate(pet, k);
  }

  it('prints tuning table', () => {
    console.table(
      Object.fromEntries(
        Object.entries(table).map(([p, r]) => [p, Object.fromEntries(Object.entries(r).map(([k, v]) => [k, `${Math.round(v.rate * 100)}% ${v.avgT.toFixed(1)}s`]))]),
      ),
    );
  });

  it('every pet can catch every species (skilled play)', () => {
    for (const pet of Object.keys(table)) for (const k of kinds) expect(table[pet][k].rate).toBeGreaterThan(0.08);
  });

  it('Darrow catches fastest, Penny slowest by a wide margin', () => {
    for (const k of ['bird', 'squirrel'] as const) {
      expect(table.darrow[k].avgT).toBeLessThan(table.rufus[k].avgT);
      expect(table.rufus[k].avgT).toBeLessThan(table.penny[k].avgT);
    }
    expect(table.penny.squirrel.avgT).toBeGreaterThan(table.darrow.squirrel.avgT * 1.5);
  });

  it('species difficulty ordering (Darrow): mouse easiest, squirrel hardest', () => {
    expect(table.darrow.mouse.rate).toBeGreaterThanOrEqual(table.darrow.squirrel.rate);
  });

  it('successful catches usually take about 3-5 seconds', () => {
    expect(table.darrow.mouse.avgT).toBeGreaterThan(2.5);
    expect(table.darrow.mouse.avgT).toBeLessThan(5.5);
  });

  it('doing nothing fails within the attempt limit', () => {
    const c = newCatch('squirrel', 'penny');
    while (c.result === 'running') stepCatch(c, 1 / 60, true, () => 0.5); // zone pinned right, prey centred
    expect(c.result).toBe('escaped');
    expect(c.t).toBeLessThan(18);
  });

  it('released Space at start does not instantly fail (settle window centres zone)', () => {
    const rng = mulberry32(5);
    const c = newCatch('mouse', 'penny');
    for (let i = 0; i < 25; i++) stepCatch(c, 1 / 60, false, rng);
    expect(c.result).toBe('running');
    expect(c.zone).toBe(0.5);
  });
});

describe('ledger scoring', () => {
  it('scores a delivered present exactly once', () => {
    const L = new Ledger('darrow');
    const m = L.spawn('mouse');
    expect(L.acquire(m.id)).toBe(true);
    expect(L.deposit().points).toBe(10);
    expect(L.deposit().points).toBe(0);
    expect(L.acquire(m.id)).toBe(false); // delivered animals can't be re-caught
    expect(L.stats.score).toBe(10);
    expect(L.stats.delivered.mouse).toBe(1);
  });

  it('cannot carry two presents', () => {
    const L = new Ledger('penny');
    const a = L.spawn('stick');
    const b = L.spawn('stick');
    expect(L.acquire(a.id)).toBe(true);
    expect(L.acquire(b.id)).toBe(false);
  });

  it('dropped animals never score; dropped sticks can be recovered once', () => {
    const L = new Ledger('penny');
    const s = L.spawn('stick');
    const m = L.spawn('mouse');
    L.acquire(m.id);
    L.dropCarried(true);
    expect(L.get(m.id)!.state).toBe('lost');
    expect(L.acquire(m.id)).toBe(false);
    L.acquire(s.id);
    L.dropCarried(true);
    expect(L.get(s.id)!.state).toBe('ground');
    expect(L.acquire(s.id)).toBe(true);
    expect(L.deposit().points).toBe(5);
    expect(L.stats.lostToBabadook).toBe(2);
    expect(L.stats.score).toBe(5);
  });

  it('nothing scores after the deadline', () => {
    const L = new Ledger('rufus');
    const m = L.spawn('squirrel');
    L.acquire(m.id);
    L.close();
    expect(L.deposit().points).toBe(0);
    expect(L.stats.score).toBe(0);
    const b = L.spawn('bird');
    expect(L.acquire(b.id)).toBe(false);
  });

  it('unranked (explore) deliveries never award points', () => {
    const L = new Ledger('darrow', false);
    const m = L.spawn('squirrel');
    L.acquire(m.id);
    expect(L.deposit().points).toBe(0);
    expect(L.stats.score).toBe(0);
    expect(L.stats.delivered.squirrel).toBe(1);
  });

  it('accuracy calculation', () => {
    const L = new Ledger('darrow');
    expect(accuracy(L.stats)).toBeNull();
    L.noteAttempt();
    L.noteAttempt();
    L.noteAttempt();
    const m = L.spawn('mouse');
    L.acquire(m.id);
    expect(accuracy(L.stats)).toBe(33);
  });
});

describe('Babadook scheduler', () => {
  it('never on the first haul, always on the second', () => {
    const s = new AmbushScheduler(true, () => 0.99);
    expect(s.check(10, 1, true)).toBe(false);
    expect(s.check(20, 2, true)).toBe(true);
  });
  it('one roll per haul, then 1 in 4 after the second', () => {
    const rolls = [0.5, 0.1, 0.3, 0.2];
    let i = 0;
    const s = new AmbushScheduler(true, () => rolls[i++] ?? 0.9);
    expect(s.check(10, 2, true)).toBe(true);
    expect(s.check(11, 2, true)).toBe(false); // same haul never re-triggers
    expect(s.check(30, 3, true)).toBe(false); // 0.5 >= 0.25
    expect(s.check(31, 3, true)).toBe(false); // already rolled for haul 3
    expect(s.check(40, 4, true)).toBe(true); // 0.1 < 0.25
    expect(s.check(50, 5, true)).toBe(false); // 0.3
    expect(s.check(60, 6, true)).toBe(true); // 0.2
    expect(s.encounters).toBe(3);
  });
  it('about a quarter of later hauls', () => {
    let n = 0;
    const rng = mulberry32(9);
    for (let k = 0; k < 2000; k++) {
      const s = new AmbushScheduler(true, rng);
      s.check(0, 2, true);
      if (s.check(1, 3, true)) n++;
    }
    expect(n / 2000).toBeGreaterThan(0.2);
    expect(n / 2000).toBeLessThan(0.3);
  });
  it('disabled in explore mode and needs a carried present', () => {
    const s = new AmbushScheduler(false, () => 0);
    expect(s.check(100, 3, true)).toBe(false);
    const t = new AmbushScheduler(true, () => 0);
    expect(t.check(100, 2, false)).toBe(false);
  });
});

describe('stick points', () => {
  it('cats get 1 per stick, Penny 5', () => {
    for (const [pet, pts] of [['darrow', 1], ['rufus', 1], ['penny', 5]] as const) {
      const L = new Ledger(pet);
      const st = L.spawn('stick');
      L.acquire(st.id);
      expect(L.deposit().points).toBe(pts);
    }
  });
});
