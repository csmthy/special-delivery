// Best score per character with the matching full stats snapshot. Robust to missing/corrupt/blocked storage.
import type { PetId } from './config';
import type { RunStats } from './rules';

export interface Records {
  darrow: RunStats | null;
  rufus: RunStats | null;
  penny: RunStats | null;
}

const PETS: PetId[] = ['darrow', 'rufus', 'penny'];

export class Store {
  available = true;
  private mem: Record<string, string> = {};
  constructor(private prefix = 'sd.v1') {
    try {
      const k = '__sd_probe';
      localStorage.setItem(k, '1');
      localStorage.removeItem(k);
    } catch {
      this.available = false;
    }
  }

  private get(key: string): string | null {
    try {
      if (this.available) return localStorage.getItem(`${this.prefix}.${key}`);
    } catch {}
    return this.mem[key] ?? null;
  }
  private set(key: string, v: string) {
    this.mem[key] = v;
    try {
      if (this.available) localStorage.setItem(`${this.prefix}.${key}`, v);
    } catch {
      this.available = false;
    }
  }

  loadRecords(): Records {
    const out: Records = { darrow: null, rufus: null, penny: null };
    let raw: unknown = null;
    try {
      const s = this.get('records');
      raw = s ? JSON.parse(s) : null;
    } catch {
      raw = null;
    }
    if (raw && typeof raw === 'object') {
      for (const p of PETS) {
        const r = (raw as Record<string, unknown>)[p];
        if (validStats(r, p)) out[p] = r as RunStats;
      }
    }
    return out;
  }

  /** Save if this run beats the stored best for that pet. Returns true when a new best was stored. */
  submit(stats: RunStats): boolean {
    const recs = this.loadRecords();
    const prev = recs[stats.pet];
    const isBest = !prev || stats.score > prev.score;
    if (isBest) {
      recs[stats.pet] = JSON.parse(JSON.stringify(stats));
      this.set('records', JSON.stringify(recs));
    }
    return isBest;
  }

  loadSound(): boolean {
    return this.get('sound') !== 'off';
  }
  saveSound(on: boolean) {
    this.set('sound', on ? 'on' : 'off');
  }
}

function validStats(r: unknown, pet: PetId): boolean {
  if (!r || typeof r !== 'object') return false;
  const s = r as Partial<RunStats>;
  if (s.pet !== pet || typeof s.score !== 'number' || !isFinite(s.score) || s.score < 0) return false;
  if (!s.delivered || !s.points) return false;
  for (const k of ['mouse', 'chipmunk', 'bird', 'squirrel', 'stick'] as const) {
    if (typeof s.delivered[k] !== 'number' || typeof s.points[k] !== 'number') return false;
  }
  // records saved before snakes existed have no snake fields: fill them in rather than rejecting the record
  if (typeof s.delivered.snake !== 'number') s.delivered.snake = 0;
  if (typeof s.points.snake !== 'number') s.points.snake = 0;
  for (const k of ['catchAttempts', 'catches', 'encounters', 'victories', 'lostToBabadook'] as const) if (typeof s[k] !== 'number') return false;
  return true;
}
