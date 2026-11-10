// Arrow keys + Space (or the touch joystick + paw button on phones). Edge detection, fresh-press gating,
// focus-loss clearing.
export type Key = 'up' | 'down' | 'left' | 'right' | 'space' | 'esc' | 'mute';

const MAP: Record<string, Key> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ' ': 'space',
  Space: 'space',
  Spacebar: 'space',
  Escape: 'esc',
  m: 'mute',
  M: 'mute',
};

const STICK_DEAD = 0.18;

export class Input {
  down = new Set<Key>();
  private pressed = new Set<Key>();
  private released = new Set<Key>();
  private spaceLock = false; // requires Space to be released before it counts again
  virtual: Set<Key> | null = null; // dev autopilot drives this instead of the keyboard
  onAny: (() => void) | null = null;
  onKeyboard: (() => void) | null = null; // a real key was pressed (switches touch controls off)
  /** Touch joystick: x right, y up, each -1..1 (null when no thumb is down). */
  stick: { x: number; y: number } | null = null;

  constructor() {
    window.addEventListener('keydown', (e) => {
      const k = MAP[e.key] ?? MAP[e.code];
      if (!k) return;
      e.preventDefault();
      this.onAny?.();
      this.onKeyboard?.();
      if (e.repeat) return;
      if (!this.down.has(k)) this.pressed.add(k);
      this.down.add(k);
    });
    window.addEventListener('keyup', (e) => {
      const k = MAP[e.key] ?? MAP[e.code];
      if (!k) return;
      e.preventDefault();
      if (this.down.has(k)) this.released.add(k);
      this.down.delete(k);
      if (k === 'space') this.spaceLock = false;
    });
    window.addEventListener('blur', () => this.clear());
  }

  /** Virtual keys (dev autopilot): set the full held set each frame. */
  setVirtual(keys: Key[]) {
    const next = new Set(keys);
    for (const k of next) if (!this.down.has(k)) this.pressed.add(k);
    for (const k of this.down) if (!next.has(k)) {
      this.released.add(k);
      if (k === 'space') this.spaceLock = false;
    }
    this.down = next;
  }

  /** Touch buttons press and release keys the same way the keyboard does. */
  touchDown(k: Key) {
    this.onAny?.();
    if (!this.down.has(k)) this.pressed.add(k);
    this.down.add(k);
  }
  touchUp(k: Key) {
    if (this.down.has(k)) this.released.add(k);
    this.down.delete(k);
    if (k === 'space') this.spaceLock = false;
  }
  /** A one-frame press (touch pause button). */
  tap(k: Key) {
    this.onAny?.();
    this.pressed.add(k);
  }

  private stickOn() {
    const s = this.stick;
    return s && Math.hypot(s.x, s.y) > STICK_DEAD ? s : null;
  }
  /** Speed multiplier: the joystick is analog (a light push walks), the keyboard is always full speed. */
  moveScale() {
    const s = this.stickOn();
    if (!s) return 1;
    const m = Math.min(1, (Math.hypot(s.x, s.y) - STICK_DEAD) / (0.75 - STICK_DEAD));
    return 0.35 + 0.65 * Math.max(0, m);
  }

  held(k: Key) {
    if (k === 'space' && this.spaceLock) return false;
    return this.down.has(k);
  }
  justPressed(k: Key) {
    if (k === 'space' && this.spaceLock) return false;
    return this.pressed.has(k);
  }
  justReleased(k: Key) {
    if (k === 'space' && this.spaceLock) return false;
    return this.released.has(k);
  }
  /** Call after consuming a frame's events. */
  endFrame() {
    this.pressed.clear();
    this.released.clear();
  }
  /** After a context change: ignore Space until it is released and pressed again. */
  requireFreshSpace() {
    this.spaceLock = this.down.has('space');
    this.pressed.delete('space');
    this.released.delete('space');
  }
  clear() {
    this.stick = null;
    this.down.clear();
    this.pressed.clear();
    this.released.clear();
    this.spaceLock = false;
  }
  arrows() {
    const s = this.stickOn();
    if (s) return { x: s.x, y: s.y };
    return {
      x: (this.down.has('right') ? 1 : 0) - (this.down.has('left') ? 1 : 0),
      y: (this.down.has('up') ? 1 : 0) - (this.down.has('down') ? 1 : 0),
    };
  }
  arrowSignature() {
    const s = this.stickOn();
    if (s) {
      // the joystick direction, snapped to the same eight "key combos" the arrows make, so the game's
      // heading logic (forward alone keeps going the way the pet faces) behaves the same on both
      const sector = ((Math.round(Math.atan2(s.x, s.y) / (Math.PI / 4)) % 8) + 8) % 8;
      return ['u', 'ur', 'r', 'dr', 'd', 'dl', 'l', 'ul'][sector];
    }
    return (this.down.has('up') ? 'u' : '') + (this.down.has('down') ? 'd' : '') + (this.down.has('left') ? 'l' : '') + (this.down.has('right') ? 'r' : '');
  }
}
