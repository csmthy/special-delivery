// Procedural Web Audio, plus a few real recordings (Mom's ending lines, the back neighbor).
// Starts only after a user gesture.
import momRufusUrl from './assets/mom-rufus.mp3?inline';
import momDarrowUrl from './assets/mom-darrow.mp3?inline';
import momPennyUrl from './assets/mom-penny.mp3?inline';
import momSnakeUrl from './assets/mom-snake.mp3?inline';
import backNeighborUrl from './assets/back-neighbor.mp3?inline';

/** Real recordings (trimmed + level-matched from the owner's videos), inlined as data URLs so file:// works. */
const CLIP_URLS = { rufus: momRufusUrl, darrow: momDarrowUrl, penny: momPennyUrl, snake: momSnakeUrl, neighbor: backNeighborUrl };
export type ClipId = keyof typeof CLIP_URLS;
type Surface = 'wood' | 'grass' | 'tile' | 'concrete';

export class Audio {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  musicGain: GainNode | null = null;
  sfx: GainNode | null = null;
  muted = false;
  private noiseBuf: AudioBuffer | null = null;
  private ambience: { stop(): void } | null = null;
  private musicTimer: number | null = null;
  private musicOn = false;
  private clips: Partial<Record<ClipId, AudioBuffer>> = {};
  private engine: { osc: OscillatorNode; osc2: OscillatorNode; gain: GainNode; filt: BiquadFilterNode } | null = null;

  constructor(muted: boolean) {
    this.muted = muted;
  }

  /** Must be called from a key/click handler. */
  private speechWarm = false;
  private iosKeepAlive: HTMLAudioElement | null = null;
  unlock() {
    this.iosPlayback();
    if (!this.speechWarm) {
      // iOS only lets a page speak after it has spoken once from inside a tap: say nothing, silently, now
      this.speechWarm = true;
      try {
        const s = window.speechSynthesis;
        if (s) {
          const u = new SpeechSynthesisUtterance(' ');
          u.volume = 0;
          s.speak(u);
        }
      } catch {}
    }
    if (this.ctx) {
      // iOS also has an 'interrupted' state (after a call, Siri, or leaving the browser)
      if (this.ctx.state !== 'running' && this.ctx.state !== 'closed') {
        this.ctx.resume().catch(() => {});
        this.kick();
      }
      return;
    }
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.8;
      this.master.connect(this.ctx.destination);
      this.decodeClips();
      this.sfx = this.ctx.createGain();
      this.sfx.connect(this.master);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.16;
      this.musicGain.connect(this.master);
      const len = this.ctx.sampleRate * 2;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
      this.kick();
    } catch {
      this.ctx = null;
    }
  }

  /** The classic iOS unlock: start a silent one-sample sound from inside the tap. */
  private kick() {
    if (!this.ctx) return;
    try {
      const b = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
      const src = this.ctx.createBufferSource();
      src.buffer = b;
      src.connect(this.ctx.destination);
      src.start(0);
    } catch {}
  }

  /**
   * iPhones mute Web Audio (music, sound effects, Mom's recordings) when the ring/silent switch is on silent,
   * while speech still plays, so Pete's line could be heard and nothing else. Tell iOS this page plays real audio:
   * Safari 17+ has navigator.audioSession; older iOS needs a (silent) media element playing to switch the
   * audio session to "playback".
   */
  private iosPlayback() {
    try {
      const as = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
      if (as && as.type !== 'playback') as.type = 'playback';
    } catch {}
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (!ios) return;
    try {
      if (!this.iosKeepAlive) {
        const a = document.createElement('audio');
        a.src = silentWav();
        a.loop = true;
        a.setAttribute('playsinline', '');
        a.preload = 'auto';
        this.iosKeepAlive = a;
      }
      if (this.iosKeepAlive.paused) this.iosKeepAlive.play().catch(() => {});
    } catch {}
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05);
    if (m) window.speechSynthesis?.cancel();
  }

  suspend() {
    this.ctx?.suspend().catch(() => {});
    this.iosKeepAlive?.pause();
  }
  resume() {
    this.ctx?.resume().catch(() => {});
    if (this.iosKeepAlive?.paused) this.iosKeepAlive.play().catch(() => {});
  }

  private get ok() {
    return !!(this.ctx && this.sfx && this.ctx.state !== 'closed');
  }

  private noise(dur: number, filterType: BiquadFilterType, freq: number, q: number, gain: number, when = 0, dest?: AudioNode) {
    if (!this.ok) return;
    const c = this.ctx!;
    const t = c.currentTime + when;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(dest ?? this.sfx!);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, when = 0, slideTo?: number, dest?: AudioNode) {
    if (!this.ok) return;
    const c = this.ctx!;
    const t = c.currentTime + when;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest ?? this.sfx!);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  footstep(surface: Surface, heavy = 1) {
    if (surface === 'grass') this.noise(0.09, 'bandpass', 2600, 0.8, 0.05 * heavy);
    else if (surface === 'wood') {
      this.noise(0.06, 'lowpass', 600, 1, 0.09 * heavy);
      this.tone(180 + Math.random() * 30, 0.05, 'sine', 0.03 * heavy);
    } else if (surface === 'tile') this.noise(0.04, 'highpass', 2200, 0.7, 0.04 * heavy);
    else this.noise(0.05, 'bandpass', 1400, 0.7, 0.04 * heavy);
  }

  bell() {
    const f = 2350 + Math.random() * 120;
    this.tone(f, 0.35, 'sine', 0.07);
    this.tone(f * 1.51, 0.22, 'sine', 0.035);
    this.tone(f * 2.7, 0.12, 'sine', 0.02);
  }

  rustle() {
    this.noise(0.35, 'bandpass', 3200, 0.6, 0.06);
    this.noise(0.25, 'bandpass', 1800, 0.6, 0.04, 0.08);
  }

  squeak(kind: string) {
    if (kind === 'bird') {
      this.tone(3200, 0.08, 'sine', 0.05, 0, 4200);
      this.tone(3600, 0.1, 'sine', 0.05, 0.1, 2800);
    } else if (kind === 'squirrel') {
      this.tone(1800, 0.06, 'square', 0.025, 0, 2400);
      this.tone(1800, 0.06, 'square', 0.025, 0.08, 2400);
      this.tone(1800, 0.06, 'square', 0.025, 0.16, 2400);
    } else if (kind === 'snake') {
      this.noise(0.55, 'highpass', 4200, 0.7, 0.07);
    } else this.tone(2800, 0.07, 'sine', 0.04, 0, 3600);
  }

  flap() {
    this.noise(0.12, 'lowpass', 900, 1, 0.12);
    this.tone(140, 0.12, 'triangle', 0.06, 0.02);
    this.noise(0.08, 'lowpass', 700, 1, 0.07, 0.18);
  }

  pounce() {
    this.noise(0.18, 'bandpass', 1200, 0.5, 0.08);
  }

  catchTick(good: boolean) {
    this.tone(good ? 880 : 300, 0.05, 'triangle', 0.02);
  }

  caught() {
    [523, 659, 784].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.08, i * 0.07));
  }
  escaped() {
    this.tone(440, 0.25, 'sawtooth', 0.04, 0, 220);
    this.noise(0.3, 'bandpass', 2500, 0.5, 0.05);
  }

  deposit(points: number) {
    const base = points >= 40 ? 659 : points >= 20 ? 587 : 523;
    [1, 1.25, 1.5, 2].forEach((m, i) => this.tone(base * m, 0.25, 'triangle', 0.08, i * 0.06));
    this.tone(base * 4, 0.4, 'sine', 0.03, 0.24);
  }

  stickPick() {
    this.noise(0.08, 'bandpass', 1800, 1.5, 0.09);
    this.tone(320, 0.06, 'triangle', 0.04);
  }

  bark() {
    if (!this.ok) return;
    for (let i = 0; i < 2; i++) {
      this.tone(520, 0.14, 'sawtooth', 0.09, i * 0.2, 260);
      this.noise(0.12, 'bandpass', 900, 1.2, 0.08, i * 0.2);
    }
  }

  meow() {
    this.tone(700, 0.35, 'sawtooth', 0.04, 0, 950);
    this.tone(950, 0.2, 'sawtooth', 0.03, 0.3, 600);
  }

  hiss() {
    this.noise(0.6, 'highpass', 3000, 0.5, 0.09);
  }

  /** Dramatic-but-silly musical sting for Babadook. */
  sting() {
    if (!this.ok) return;
    const f = [146.8, 155.6, 146.8];
    f.forEach((fr, i) => {
      this.tone(fr, 0.32, 'sawtooth', 0.07, i * 0.24);
      this.tone(fr * 1.498, 0.32, 'sawtooth', 0.04, i * 0.24);
    });
    this.tone(220, 0.9, 'sawtooth', 0.06, 0.75, 110); // sad trombone-ish slide
    this.noise(0.4, 'lowpass', 400, 1, 0.12, 0);
  }

  whoosh() {
    this.noise(0.3, 'bandpass', 700, 0.8, 0.12);
  }

  thud() {
    this.tone(90, 0.25, 'sine', 0.15, 0, 50);
    this.noise(0.15, 'lowpass', 500, 1, 0.12);
  }

  /** Postal Pete's entrance: a low, beating drone and a thin high whine. */
  creepySting() {
    if (!this.ok) return;
    this.tone(55, 3.6, 'sawtooth', 0.045, 0, 52);
    this.tone(58.4, 3.6, 'sawtooth', 0.04, 0, 55.5);
    this.tone(1480, 2.6, 'sine', 0.012, 0.5, 1530);
    this.noise(3.0, 'bandpass', 260, 5, 0.03, 0.2);
  }

  /** Pete's line, spoken by the system voice pitched right down and slowed, over a sub drone. */
  creepyLine(text: string) {
    if (this.ok) {
      this.tone(41, 4.5, 'sine', 0.08, 0, 39);
      this.tone(82.4, 4.5, 'triangle', 0.02, 0.2, 80);
    }
    if (this.muted) return;
    try {
      const s = window.speechSynthesis;
      if (!s) return;
      s.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const voices = s.getVoices();
      const v = voices.find((v) => /en/i.test(v.lang) && /(Daniel|Fred|Ralph|Albert|Bruce|Alex|Male|Guy)/i.test(v.name)) ?? voices.find((v) => /en/i.test(v.lang));
      if (v) u.voice = v;
      u.rate = 0.74;
      u.pitch = 0.15;
      u.volume = 1;
      s.speak(u);
    } catch {}
  }

  /** The snake ending: a deep, long, rolling boom. */
  boom() {
    if (!this.ok) return;
    this.noise(4.5, 'lowpass', 160, 0.7, 0.55);
    this.noise(1.2, 'lowpass', 900, 0.7, 0.35);
    this.tone(48, 3.5, 'sawtooth', 0.22, 0, 22);
    this.tone(31, 4.5, 'sine', 0.3, 0.05, 18);
    this.noise(6.0, 'lowpass', 90, 0.5, 0.25, 0.8);
  }

  /** Boss fight shockwave rolling out. */
  rumble() {
    this.tone(70, 0.7, 'sawtooth', 0.08, 0, 40);
    this.noise(0.7, 'lowpass', 300, 1, 0.12);
  }

  victory() {
    [392, 523, 659, 784].forEach((f, i) => this.tone(f, 0.2, 'square', 0.04, i * 0.08));
  }

  countdown(go: boolean) {
    this.tone(go ? 880 : 520, go ? 0.4 : 0.15, 'triangle', 0.1);
  }

  uiMove() {
    this.tone(660, 0.05, 'triangle', 0.035);
  }
  uiSelect() {
    this.tone(660, 0.07, 'triangle', 0.05);
    this.tone(990, 0.1, 'triangle', 0.05, 0.06);
  }

  chimes() {
    const notes = [1047, 1175, 1319, 1568, 1760];
    for (let i = 0; i < 3; i++) this.tone(notes[Math.floor(Math.random() * 5)], 1.6, 'sine', 0.015, i * 0.25 + Math.random() * 0.1);
  }

  birdsong() {
    const base = 2600 + Math.random() * 1200;
    const n = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) this.tone(base * (1 + (Math.random() - 0.5) * 0.3), 0.07, 'sine', 0.012, i * 0.11, base * 1.2);
  }

  startAmbience() {
    if (!this.ok || this.ambience) return;
    const c = this.ctx!;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 420;
    const g = c.createGain();
    g.gain.value = 0.025;
    src.connect(f).connect(g).connect(this.master!);
    src.start();
    let alive = true;
    const tick = () => {
      if (!alive) return;
      if (Math.random() < 0.5) this.birdsong();
      if (Math.random() < 0.12) this.chimes();
      setTimeout(tick, 1800 + Math.random() * 3000);
    };
    setTimeout(tick, 800);
    this.ambience = {
      stop: () => {
        alive = false;
        try {
          src.stop();
        } catch {}
      },
    };
  }

  stopAmbience() {
    this.ambience?.stop();
    this.ambience = null;
  }

  /** Gentle plucky loop during the run. */
  startMusic(tense = false) {
    if (!this.ok) return;
    this.stopMusic();
    this.musicOn = true;
    const prog = [
      [262, 330, 392],
      [220, 262, 330],
      [175, 220, 262],
      [196, 247, 294],
    ];
    let step = 0;
    const bpm = tense ? 132 : 100;
    const beat = 60 / bpm;
    const tick = () => {
      if (!this.musicOn || !this.ok) return;
      const chord = prog[Math.floor(step / 8) % 4];
      const n = chord[[0, 1, 2, 1, 0, 2, 1, 2][step % 8]];
      this.tone(n * (step % 8 === 0 ? 1 : 2), beat * 0.9, 'triangle', 0.25, 0, undefined, this.musicGain!);
      if (step % 4 === 0) this.tone(chord[0] / 2, beat * 2, 'sine', 0.3, 0, undefined, this.musicGain!);
      step++;
      this.musicTimer = window.setTimeout(tick, beat * 500);
    };
    tick();
  }
  stopMusic() {
    this.musicOn = false;
    if (this.musicTimer) clearTimeout(this.musicTimer);
    this.musicTimer = null;
  }

  carStart() {
    if (!this.ok || this.engine) return;
    const c = this.ctx!;
    const osc = c.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 48;
    const osc2 = c.createOscillator();
    osc2.type = 'square';
    osc2.frequency.value = 24;
    const filt = c.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 260;
    const gain = c.createGain();
    gain.gain.value = 0;
    osc.connect(filt);
    osc2.connect(filt);
    filt.connect(gain).connect(this.sfx!);
    osc.start();
    osc2.start();
    gain.gain.setTargetAtTime(0.12, c.currentTime, 1.5);
    this.engine = { osc, osc2, gain, filt };
    // a friendly double honk
    this.tone(392, 0.18, 'square', 0.04, 0.4);
    this.tone(392, 0.25, 'square', 0.04, 0.65);
  }
  carUpdate(speed01: number, near01: number) {
    if (!this.engine || !this.ctx) return;
    const t = this.ctx.currentTime;
    this.engine.osc.frequency.setTargetAtTime(40 + speed01 * 40, t, 0.2);
    this.engine.osc2.frequency.setTargetAtTime(20 + speed01 * 20, t, 0.2);
    this.engine.gain.gain.setTargetAtTime(0.03 + 0.14 * near01, t, 0.3);
  }
  carStop() {
    if (!this.engine || !this.ctx) return;
    const e = this.engine;
    e.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
    setTimeout(() => {
      try {
        e.osc.stop();
        e.osc2.stop();
      } catch {}
    }, 800);
    this.engine = null;
    this.noise(0.15, 'lowpass', 300, 1, 0.1, 0.4); // door thunk
  }

  doorOpen() {
    this.noise(0.5, 'bandpass', 500, 2, 0.05);
    this.tone(320, 0.4, 'triangle', 0.02, 0, 260);
  }

  private decodeClips() {
    const c = this.ctx;
    if (!c) return;
    for (const [id, url] of Object.entries(CLIP_URLS) as [ClipId, string][]) {
      try {
        const bin = atob(url.slice(url.indexOf(',') + 1));
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        c.decodeAudioData(bytes.buffer).then((b) => (this.clips[id] = b)).catch(() => {});
      } catch {}
    }
  }

  clipDuration(id: ClipId) {
    return this.clips[id]?.duration ?? 0;
  }

  /** Play a recorded clip. Returns false if it isn't available (no audio yet), so the caller can fall back. */
  clip(id: ClipId, gain = 1.15, pan = 0): boolean {
    const buf = this.clips[id];
    if (!this.ok || !buf) return false;
    if (this.muted) return true; // muted: stay silent, and don't fall back to synthetic sounds either
    const c = this.ctx!;
    const src = c.createBufferSource();
    src.buffer = buf;
    const g = c.createGain();
    g.gain.value = gain;
    let node: AudioNode = src.connect(g);
    if (pan && c.createStereoPanner) {
      const p = c.createStereoPanner();
      p.pan.value = pan;
      node = node.connect(p);
    }
    node.connect(this.master!);
    src.start();
    return true;
  }

  momRufus(): boolean {
    return this.clip('rufus');
  }

  /** Mom's shout: speech synthesis if available, plus a stylised exclamation. */
  shout(name: string) {
    if (this.ok) {
      this.tone(330, 0.25, 'sawtooth', 0.06, 0, 520);
      this.tone(520, 0.45, 'sawtooth', 0.06, 0.22, 300);
      [196, 233, 277].forEach((f) => this.tone(f, 0.9, 'triangle', 0.05, 0.1));
    }
    if (this.muted) return;
    try {
      const s = window.speechSynthesis;
      if (!s) return;
      s.cancel();
      const u = new SpeechSynthesisUtterance(name + '!');
      u.rate = 0.85;
      u.pitch = 1.25;
      u.volume = 1;
      s.speak(u);
    } catch {}
  }
}

/** Half a second of silence as a WAV data URL (8 kHz, 8-bit mono). */
function silentWav() {
  const n = 4000;
  const b = new Uint8Array(44 + n);
  const v = new DataView(b.buffer);
  const str = (o: number, t: string) => { for (let i = 0; i < t.length; i++) b[o + i] = t.charCodeAt(i); };
  str(0, 'RIFF');
  v.setUint32(4, 36 + n, true);
  str(8, 'WAVEfmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, 8000, true);
  v.setUint32(28, 8000, true);
  v.setUint16(32, 1, true);
  v.setUint16(34, 8, true);
  str(36, 'data');
  v.setUint32(40, n, true);
  b.fill(128, 44); // 8-bit silence is the mid value
  let bin = '';
  for (let i = 0; i < b.length; i++) bin += String.fromCharCode(b[i]);
  return 'data:audio/wav;base64,' + btoa(bin);
}
