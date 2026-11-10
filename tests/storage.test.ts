import { describe, it, expect, beforeEach } from 'vitest';
import { Store } from '../src/storage';
import { emptyStats } from '../src/rules';

class MemStorage {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
}

describe('records storage', () => {
  beforeEach(() => {
    (globalThis as any).localStorage = new MemStorage();
  });

  it('keeps an independent best per pet with its own full stats', () => {
    const s = new Store('t');
    const d1 = { ...emptyStats('darrow'), score: 80 };
    d1.delivered.squirrel = 2;
    expect(s.submit(d1)).toBe(true);
    const r1 = { ...emptyStats('rufus'), score: 30 };
    expect(s.submit(r1)).toBe(true);
    const d2 = { ...emptyStats('darrow'), score: 50 };
    expect(s.submit(d2)).toBe(false); // lower: old record and its stats stay
    const recs = new Store('t').loadRecords();
    expect(recs.darrow!.score).toBe(80);
    expect(recs.darrow!.delivered.squirrel).toBe(2);
    expect(recs.rufus!.score).toBe(30);
    expect(recs.penny).toBeNull();
    const d3 = { ...emptyStats('darrow'), score: 90 };
    expect(s.submit(d3)).toBe(true);
    expect(new Store('t').loadRecords().darrow!.delivered.squirrel).toBe(0); // new best brings its own stats
  });

  it('ignores corrupt or tampered data', () => {
    localStorage.setItem('t.records', '{oops');
    expect(new Store('t').loadRecords()).toEqual({ darrow: null, rufus: null, penny: null });
    localStorage.setItem('t.records', JSON.stringify({ darrow: { pet: 'rufus', score: 5 }, penny: { pet: 'penny', score: -3 } }));
    expect(new Store('t').loadRecords()).toEqual({ darrow: null, rufus: null, penny: null });
  });

  it('works (in memory) when storage is blocked', () => {
    (globalThis as any).localStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
    const s = new Store('t');
    expect(s.available).toBe(false);
    expect(s.submit({ ...emptyStats('penny'), score: 15 })).toBe(true);
    expect(s.loadRecords().penny!.score).toBe(15);
    expect(s.loadSound()).toBe(true);
  });

  it('persists the sound preference', () => {
    new Store('t').saveSound(false);
    expect(new Store('t').loadSound()).toBe(false);
  });
});
