// Phone / tablet controls. A joystick appears wherever a thumb goes down (and follows it), a big paw
// button bottom-right stands in for Space (hold = sneak / move the catch paw, tap = grab, drop, pounce, hop),
// and a small pause button sits under the score. Menus are tapped directly.
//
// Touch mode switches on by itself on phones and tablets (coarse pointer), or the moment anyone touches the
// screen; pressing a real key switches it back off, so a laptop with a touchscreen still plays the normal way.
// ?touch=1 / ?touch=0 force it either way.
import type { Input } from '../input';

const RADIUS = 58; // joystick travel in CSS px

export function prefersTouch(): boolean {
  const q = new URLSearchParams(location.search).get('touch');
  if (q === '1') return true;
  if (q === '0') return false;
  try {
    if (matchMedia('(pointer: coarse)').matches) return true;
    return navigator.maxTouchPoints > 0 && !matchMedia('(hover: hover)').matches;
  } catch {
    return false;
  }
}

export class TouchControls {
  enabled = false;
  private forced: boolean | null;
  private layer: HTMLElement;
  private base: HTMLElement;
  private knob: HTMLElement;
  private action: HTMLElement;
  private pauseBtn: HTMLElement;
  private rotate: HTMLElement;
  private stickId: number | null = null;
  private stickOrigin = { x: 0, y: 0 };
  private actionId: number | null = null;
  private active = false;
  private portrait = false;
  onChange: ((on: boolean) => void) | null = null;
  onPortrait: (() => void) | null = null;

  constructor(private input: Input, root: HTMLElement) {
    const q = new URLSearchParams(location.search).get('touch');
    this.forced = q === '1' ? true : q === '0' ? false : null;

    this.layer = document.createElement('div');
    this.layer.className = 'touch-layer';
    this.base = document.createElement('div');
    this.base.className = 'tj-base';
    this.knob = document.createElement('div');
    this.knob.className = 'tj-knob';
    this.base.appendChild(this.knob);
    this.action = document.createElement('div');
    this.action.className = 'tj-action';
    this.action.innerHTML = '<span>🐾</span>';
    this.pauseBtn = document.createElement('div');
    this.pauseBtn.className = 'tj-pause';
    this.pauseBtn.innerHTML = '<i></i><i></i>';
    this.layer.append(this.base, this.action, this.pauseBtn);
    root.appendChild(this.layer);
    this.rotate = document.createElement('div');
    this.rotate.className = 'tj-rotate';
    this.rotate.innerHTML = '<div><div class="tj-phone"></div><p>Turn your phone sideways to play</p></div>';
    root.appendChild(this.rotate);

    // ---- joystick: anywhere on the layer that isn't a button
    this.layer.addEventListener('pointerdown', (e) => {
      if (e.target !== this.layer || this.stickId !== null) return;
      if (e.pointerType === 'mouse' && this.forced !== true) return;
      e.preventDefault();
      this.input.onAny?.();
      this.stickId = e.pointerId;
      this.layer.setPointerCapture?.(e.pointerId);
      this.stickOrigin = { x: e.clientX, y: e.clientY };
      this.base.style.left = `${e.clientX}px`;
      this.base.style.top = `${e.clientY}px`;
      this.base.classList.add('on');
      this.setKnob(0, 0);
      this.input.stick = { x: 0, y: 0 };
    });
    this.layer.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.stickId) return;
      e.preventDefault();
      let dx = e.clientX - this.stickOrigin.x;
      let dy = e.clientY - this.stickOrigin.y;
      const d = Math.hypot(dx, dy);
      if (d > RADIUS * 1.6) {
        // dragged well past the rim: let the base follow the thumb so it never runs out of travel
        const k = (d - RADIUS * 1.6) / d;
        this.stickOrigin.x += dx * k;
        this.stickOrigin.y += dy * k;
        this.base.style.left = `${this.stickOrigin.x}px`;
        this.base.style.top = `${this.stickOrigin.y}px`;
        dx = e.clientX - this.stickOrigin.x;
        dy = e.clientY - this.stickOrigin.y;
      }
      const l = Math.hypot(dx, dy);
      const c = l > RADIUS ? RADIUS / l : 1;
      this.setKnob(dx * c, dy * c);
      this.input.stick = { x: (dx * c) / RADIUS, y: -(dy * c) / RADIUS };
    });
    const endStick = (e: PointerEvent) => {
      if (e.pointerId !== this.stickId) return;
      this.input.onAny?.();
      this.releaseStick();
    };
    this.layer.addEventListener('pointerup', endStick);
    this.layer.addEventListener('pointercancel', endStick);
    this.layer.addEventListener('lostpointercapture', endStick);

    // ---- paw button (Space)
    this.action.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.actionId !== null) return;
      this.actionId = e.pointerId;
      this.action.setPointerCapture?.(e.pointerId);
      this.action.classList.add('down');
      this.input.touchDown('space');
    });
    const endAction = (e: PointerEvent) => {
      if (e.pointerId !== this.actionId) return;
      this.input.onAny?.();
      this.releaseAction();
    };
    this.action.addEventListener('pointerup', endAction);
    this.action.addEventListener('pointercancel', endAction);
    this.action.addEventListener('lostpointercapture', endAction);

    // ---- pause (Esc)
    this.pauseBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.input.tap('esc');
    });

    // no long-press menus, text selection or pinch-zoom on the controls
    for (const ev of ['contextmenu', 'selectstart', 'gesturestart']) this.layer.addEventListener(ev, (e) => e.preventDefault());

    // auto switching: a touch anywhere turns touch mode on, a real key press turns it off
    window.addEventListener(
      'pointerdown',
      (e) => {
        if (e.pointerType === 'touch' && this.forced !== false) this.setEnabled(true);
      },
      true,
    );
    this.input.onKeyboard = () => {
      if (this.forced !== true) this.setEnabled(false);
    };
    window.addEventListener('resize', () => this.checkOrientation());
    window.addEventListener('orientationchange', () => setTimeout(() => this.checkOrientation(), 200));

    this.setEnabled(this.forced ?? prefersTouch());
  }

  setEnabled(on: boolean) {
    if (on === this.enabled) return;
    this.enabled = on;
    document.body.classList.toggle('touch-mode', on);
    if (!on) {
      this.releaseStick();
      this.releaseAction();
    }
    this.checkOrientation();
    this.onChange?.(on);
  }

  /** Called every frame: the controls only take touches while no menu is on screen. */
  update(active: boolean, showPause: boolean) {
    active = active && this.enabled;
    if (active !== this.active) {
      this.active = active;
      this.layer.classList.toggle('on', active);
      if (!active) {
        this.releaseStick();
        this.releaseAction();
      }
    }
    this.pauseBtn.classList.toggle('hidden', !showPause);
  }

  private checkOrientation() {
    const p = this.enabled && window.innerHeight > window.innerWidth * 1.05;
    if (p === this.portrait) return;
    this.portrait = p;
    this.rotate.classList.toggle('on', p);
    if (p) {
      this.releaseStick();
      this.releaseAction();
      this.onPortrait?.();
    }
  }

  private setKnob(x: number, y: number) {
    this.knob.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
  }
  private releaseStick() {
    this.stickId = null;
    this.input.stick = null;
    this.base.classList.remove('on');
  }
  private releaseAction() {
    if (this.actionId === null) return;
    this.actionId = null;
    this.action.classList.remove('down');
    this.input.touchUp('space');
  }
}
