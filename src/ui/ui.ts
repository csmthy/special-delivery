// DOM overlay UI: menus, HUD, catching track, captions, results. All of it is driven by arrows + Space;
// mouse clicks also work on menu items but are never required.
import { PETS, pointsFor, type PetId, type PresentKind } from '../config';
import { accuracy, totalDelivered, type RunStats } from '../rules';
import './style.css';
import { canFullscreen, isIPhone } from './fullscreen';

export interface MenuItem {
  label: string;
  id: string;
  hint?: string;
}

const KIND_LABEL: Record<PresentKind, string> = { mouse: 'Mouse', chipmunk: 'Chipmunk', bird: 'Bird', squirrel: 'Squirrel', snake: 'Snake', stick: 'Stick' };
const svg = (body: string) => `<svg class="kind-ico" viewBox="0 0 48 32" width="44" height="30" aria-hidden="true">${body}</svg>`;
export const KIND_ICON: Record<PresentKind, string> = {
  mouse: svg('<path d="M6 22 Q2 30 12 28" stroke="#d99a92" stroke-width="2" fill="none"/><ellipse cx="22" cy="20" rx="13" ry="8" fill="#8b7b6b"/><circle cx="33" cy="16" r="7" fill="#8b7b6b"/><circle cx="31" cy="9" r="4.5" fill="#d9a5a0" stroke="#8b7b6b" stroke-width="1.5"/><circle cx="36" cy="15" r="1.4" fill="#111"/><circle cx="40" cy="18" r="1.5" fill="#e1a5a0"/>'),
  chipmunk: svg('<path d="M10 20 Q3 8 9 4 Q14 10 13 18Z" fill="#7a5233"/><ellipse cx="23" cy="20" rx="12" ry="8.5" fill="#a8673a"/><path d="M14 15 Q23 11 32 15" stroke="#2a1a12" stroke-width="2" fill="none"/><path d="M14 18 Q23 14 32 18" stroke="#f1e3c8" stroke-width="1.6" fill="none"/><circle cx="34" cy="15" r="6.5" fill="#a8673a"/><circle cx="36" cy="18" r="3.4" fill="#c99a6c"/><circle cx="35.5" cy="13" r="1.3" fill="#111"/><ellipse cx="22" cy="25" rx="8" ry="3" fill="#efe0c6"/>'),
  bird: svg('<path d="M8 22 L2 26 L4 18Z" fill="#9b1914"/><ellipse cx="20" cy="19" rx="12" ry="8" fill="#c4231d"/><path d="M14 17 Q20 10 27 18" fill="#9b1914"/><circle cx="31" cy="12" r="6.5" fill="#c4231d"/><path d="M28 7 L31 1 L34 7Z" fill="#c4231d"/><path d="M37 12 L44 13.5 L37 15.5Z" fill="#e8762a"/><path d="M30 11 L37 11 L36 15 L31 15Z" fill="#141010"/><circle cx="32.5" cy="11.5" r="1.1" fill="#fff"/>'),
  squirrel: svg('<path d="M14 24 Q0 22 3 10 Q6 1 14 4 Q8 8 10 14 Q12 20 18 21Z" fill="#8d8a84"/><ellipse cx="24" cy="21" rx="9" ry="8" fill="#7c7a76"/><circle cx="32" cy="12" r="6" fill="#7c7a76"/><path d="M30 6 L31 2 L34 6Z" fill="#6f6a66"/><circle cx="34" cy="11" r="1.4" fill="#111"/><ellipse cx="26" cy="25" rx="6" ry="3" fill="#ebe5da"/>'),
  snake: svg('<path d="M4 24 Q10 14 17 22 Q24 30 31 20 Q35 14 39 15" stroke="#8a6a3c" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M8 20 L10 24 M15 20 L17 25 M22 25 L24 28 M29 21 L31 25" stroke="#5a3e22" stroke-width="2.2"/><ellipse cx="41" cy="15" rx="5" ry="3.4" fill="#9a7845"/><circle cx="42.5" cy="13.6" r="1" fill="#111"/><path d="M46 15.5 L48 14.5 M46 15.5 L48 16.8" stroke="#d02020" stroke-width="0.9"/>'),
  stick: svg('<path d="M4 22 L44 12" stroke="#6b4b2e" stroke-width="4" stroke-linecap="round"/><path d="M22 17 L30 6" stroke="#5a3e24" stroke-width="2.4" stroke-linecap="round"/><path d="M34 14.5 L41 22" stroke="#5a3e24" stroke-width="2" stroke-linecap="round"/><ellipse cx="31" cy="5" rx="4" ry="2" fill="#4f7a2a"/>'),
};

const el = (tag: string, cls = '', html = '') => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};

export class UI {
  root: HTMLElement;
  screen: HTMLElement;
  hud: HTMLElement;
  private hTime: HTMLElement;
  private hScore: HTMLElement;
  private hCarry: HTMLElement;
  private hPrompt: HTMLElement;
  private hMode: HTMLElement;
  private banner: HTMLElement;
  private toasts: HTMLElement;
  private caption: HTMLElement;
  private fadeEl: HTMLElement;
  private catchEl: HTMLElement;
  private cZone: HTMLElement;
  private cPrey: HTMLElement;
  private cFill: HTMLElement;
  private cTime: HTMLElement;
  private cHint: HTMLElement;
  private muteEl: HTMLElement;
  touch = false; // phone controls: key hints become joystick / paw-button hints
  onClick: ((id: string) => void) | null = null;
  onHover: ((index: number) => void) | null = null;

  constructor() {
    this.root = el('div', 'ui');
    document.body.appendChild(this.root);
    this.fadeEl = el('div', 'fade');
    this.root.appendChild(this.fadeEl);

    this.hud = el('div', 'hud hidden');
    this.hud.innerHTML = `
      <div class="hud-top">
        <div class="hud-time"><span class="lbl">Mom's home in</span><span class="val" id="h-time">3:00</span></div>
        <div class="hud-mode" id="h-mode"></div>
        <div class="hud-score"><span class="lbl">Score</span><span class="val" id="h-score">0</span></div>
      </div>
      <div class="hud-carry" id="h-carry"></div>
      <div class="hud-prompt" id="h-prompt"></div>`;
    this.root.appendChild(this.hud);
    this.hTime = this.hud.querySelector('#h-time')!;
    this.hScore = this.hud.querySelector('#h-score')!;
    this.hCarry = this.hud.querySelector('#h-carry')!;
    this.hPrompt = this.hud.querySelector('#h-prompt')!;
    this.hMode = this.hud.querySelector('#h-mode')!;

    this.catchEl = el('div', 'catch hidden');
    this.catchEl.innerHTML = `
      <div class="catch-title" id="c-title">Catch it!</div>
      <div class="catch-track"><div class="catch-zone" id="c-zone"><span>🐾</span></div><div class="catch-prey" id="c-prey">🐭</div></div>
      <div class="catch-meter"><div class="catch-fill" id="c-fill"></div></div>
      <div class="catch-hint" id="c-hint">Hold <b>Space</b> → paw moves right · Release → left</div>
      <div class="catch-time" id="c-time"></div>`;
    this.root.appendChild(this.catchEl);
    this.cZone = this.catchEl.querySelector('#c-zone')!;
    this.cPrey = this.catchEl.querySelector('#c-prey')!;
    this.cFill = this.catchEl.querySelector('#c-fill')!;
    this.cTime = this.catchEl.querySelector('#c-time')!;
    this.cHint = this.catchEl.querySelector('#c-hint')!;

    this.banner = el('div', 'banner');
    this.root.appendChild(this.banner);
    this.toasts = el('div', 'toasts');
    this.root.appendChild(this.toasts);
    this.caption = el('div', 'caption');
    this.root.appendChild(this.caption);
    this.screen = el('div', 'screen');
    this.root.appendChild(this.screen);
    this.muteEl = el('div', 'mute-ind');
    this.root.appendChild(this.muteEl);
    // boss health bar (Hard Mode) and a full-screen white flash (the snake ending)
    this.bossEl = el('div', '');
    this.bossEl.style.cssText =
      'position:absolute;left:50%;top:20px;transform:translateX(-50%);width:min(520px,70vw);display:none;text-align:center;font:700 15px/1.2 Inter,system-ui,sans-serif;color:#fff;text-shadow:0 2px 6px #000;letter-spacing:0.12em;pointer-events:none';
    this.bossEl.innerHTML =
      '<div id="b-name">THE BABADOOK</div><div style="margin-top:6px;height:14px;border-radius:7px;background:rgba(0,0,0,0.55);border:2px solid rgba(255,255,255,0.7);overflow:hidden"><div id="b-fill" style="height:100%;width:100%;background:linear-gradient(90deg,#7a0d0d,#e2361f,#ffb02a);transition:width .35s"></div></div><div id="b-sub" style="margin-top:5px;font-weight:500;font-size:13px;letter-spacing:0.04em;opacity:0.9"></div>';
    this.root.appendChild(this.bossEl);
    this.flashEl = el('div', '');
    this.flashEl.style.cssText = 'position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none';
    this.root.appendChild(this.flashEl);

    this.screen.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest('[data-id]') as HTMLElement | null;
      if (t && this.onClick) this.onClick(t.dataset.id!);
    });
    this.screen.addEventListener('mousemove', (e) => {
      const t = (e.target as HTMLElement).closest('[data-idx]') as HTMLElement | null;
      if (t && this.onHover) this.onHover(Number(t.dataset.idx));
    });
  }

  setTouch(on: boolean) {
    this.touch = on;
    this.cHint.innerHTML = on ? 'Hold <kbd class="paw">🐾</kbd> → paw moves right · Let go → left' : 'Hold <b>Space</b> → paw moves right · Release → left';
  }

  /** Swaps keyboard wording for touch wording when playing on a phone. */
  k(html: string) {
    if (!this.touch) return html;
    return html
      .replace(/<kbd>←<\/kbd><kbd>→<\/kbd>/g, '<kbd>joystick</kbd>')
      .replace(/<kbd>Space<\/kbd>/g, '<kbd class="paw">🐾</kbd>')
      .replace('Space: see the run', 'Tap to see the run')
      .replace(/Release <kbd class="paw">/g, 'Let go of <kbd class="paw">')
      .replace('arrow keys. Through', 'put a thumb down anywhere and slide it (a joystick pops up). Through')
      .replace('dodge with the arrows', 'dodge with the joystick')
      .replace(/press Space/g, 'tap the 🐾 button')
      .replace(/Press Space/g, 'Tap the 🐾 button')
      .replace(/Hold Space/g, 'Hold the 🐾 button')
      .replace(/with Space/g, 'with the 🐾 button');
  }

  fade(on: boolean, ms = 450) {
    this.fadeEl.style.transitionDuration = `${ms}ms`;
    this.fadeEl.classList.toggle('on', on);
  }

  setMuteIndicator(muted: boolean) {
    this.muteEl.textContent = muted ? '🔇 Sound off' : '';
  }

  // ---------------------------------------------------------------- screens
  clearScreen() {
    this.screen.innerHTML = '';
    this.screen.className = 'screen';
  }

  menuHTML(items: MenuItem[], index: number) {
    return `<div class="menu">${items
      .map((it, i) => `<button class="item ${i === index ? 'sel' : ''}" data-id="${it.id}" data-idx="${i}">${it.label}${it.hint ? `<small>${it.hint}</small>` : ''}</button>`)
      .join('')}</div>`;
  }

  showTitle(items: MenuItem[], index: number, storageWarning: boolean) {
    this.screen.className = 'screen title';
    this.screen.innerHTML = `
      <div class="title-wrap">
        <h1><span>Darrow &amp; Rufus</span><em>Special Delivery</em></h1>
        <p class="tag">Collect wonderful presents before Mom gets home from work.</p>
        ${this.menuHTML(items, index)}
        <p class="keys">Use <kbd>↑</kbd><kbd>↓</kbd> to choose · <kbd>Space</kbd> to select</p>
        ${storageWarning ? '<p class="warn">Records can’t be saved in this browser window, but the game still works.</p>' : ''}
        ${document.hasFocus() ? '' : '<p class="warn focus">Click the game once so it can hear the keyboard.</p>'}
        ${this.touch && isIPhone() && !canFullscreen() ? '<p class="warn ios">iPhone tip: Safari can’t do true full screen, but sideways it gets close. For more room, use Hide Toolbar in Safari’s page menu. If you hear no sound, check the ring/silent switch and volume.</p>' : ''}
      </div>`;
  }

  showSelect(sel: number, onBack: boolean) {
    const ids: PetId[] = ['darrow', 'rufus', 'penny'];
    this.screen.className = 'screen select';
    this.screen.innerHTML = `
      <div class="select-head"><h2>Who’s making the delivery?</h2><p>Penny is a bonus pick!</p></div>
      <div class="cards">${ids
        .map((id, i) => {
          const s = PETS[id];
          return `<div class="card ${i === sel && !onBack ? 'sel' : ''}" data-id="pet-${id}" data-idx="${i}">
            <div class="name">${s.name}</div><div class="role">${s.title}</div>
            <div class="trade">${s.tagline.split(' · ').map((t) => `<span>${t}</span>`).join('')}</div>
          </div>`;
        })
        .join('')}</div>
      <div class="select-foot">
        <button class="item small ${onBack ? 'sel' : ''}" data-id="back">Back</button>
        <p class="keys"><kbd>←</kbd><kbd>→</kbd> choose · <kbd>Space</kbd> confirm · <kbd>↓</kbd> back</p>
      </div>`;
  }

  showPreRun(pet: PetId, items: MenuItem[], index: number, note = '') {
    const s = PETS[pet];
    this.screen.className = 'screen prerun';
    const how =
      pet === 'penny'
        ? `<li><b>Sticks:</b> walk up to one and tap <kbd>Space</kbd>.</li><li><b>Animals:</b> hold <kbd>Space</kbd> to sneak, release close to pounce — very tricky for Penny!</li>`
        : `<li><b>Hunt:</b> hold <kbd>Space</kbd> to sneak, release when close to pounce.</li><li><b>Catch:</b> hold <kbd>Space</kbd> to move the paw right, release to move it left — keep it on the animal.</li><li><b>Sticks:</b> tap <kbd>Space</kbd> next to one for a quick 1 point.</li>`;
    this.screen.innerHTML = this.k(`
      <div class="panel">
        <h2>${s.name} <small>${s.title}</small></h2>
        <ul class="how">
          <li><b>Move:</b> arrow keys. Through the dog flap, down the deck ramp, into the backyard.</li>
          ${how}
          <li><b>Deliver:</b> bring it to the wicker basket in the living room and tap <kbd>Space</kbd>.</li>
          <li><b>Babadook</b> may ambush you by the stairs: dodge with the arrows, then <kbd>Space</kbd> while he’s dizzy.</li>
        </ul>
        ${note ? `<p class="note">${note}</p>` : ''}
        ${this.menuHTML(items, index)}
      </div>`);
  }

  showPractice(items: MenuItem[], index: number, note: string) {
    this.screen.className = 'screen practice';
    this.screen.innerHTML = `<div class="panel slim"><h2>Practice catch <small>no points, no clock</small></h2>${note ? `<p class="note">${this.k(note)}</p>` : ''}${this.menuHTML(items, index)}<p class="keys"><kbd>←</kbd><kbd>→</kbd> change animal on the first line</p></div>`;
  }

  showPause(items: MenuItem[], index: number) {
    this.screen.className = 'screen pause';
    this.screen.innerHTML = `<div class="panel slim"><h2>Paused</h2><p class="note">The clock is stopped.</p>${this.menuHTML(items, index)}<p class="keys">Press <kbd>Space</kbd> to choose</p></div>`;
  }

  statsHTML(s: RunStats) {
    const kinds: PresentKind[] = s.pet === 'penny' ? ['stick', 'mouse', 'chipmunk', 'bird', 'squirrel', 'snake'] : ['mouse', 'chipmunk', 'bird', 'squirrel', 'snake', 'stick'];
    const acc = accuracy(s);
    const rows = kinds
      .map((k) => `<tr><td>${KIND_ICON[k]} ${KIND_LABEL[k]}${s.delivered[k] === 1 ? '' : k === 'mouse' ? '' : ''}</td><td>${s.delivered[k] ?? 0} × ${pointsFor(s.pet, k)}</td><td>${s.points[k] ?? 0}</td></tr>`)
      .join('');
    return `
      <table class="stats">
        <thead><tr><th>Present</th><th>Delivered</th><th>Points</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td>Total</td><td>${totalDelivered(s)} presents</td><td>${s.score}</td></tr></tfoot>
      </table>
      <div class="facts">
        <div><b>Catches</b>${s.catches} of ${s.catchAttempts} tries${acc === null ? '' : ` <span>(${acc}% accuracy)</span>`}</div>
        <div><b>Babadook</b>${s.encounters} ambush${s.encounters === 1 ? '' : 'es'} · ${s.victories} sent packing</div>
        <div><b>Lost to Babadook</b>${s.lostToBabadook} present${s.lostToBabadook === 1 ? '' : 's'}</div>
      </div>`;
  }

  bossEl!: HTMLElement;
  flashEl!: HTMLElement;
  showBoss(hp: number, max: number, sub: string) {
    this.bossEl.style.display = 'block';
    (this.bossEl.querySelector('#b-fill') as HTMLElement).style.width = `${(100 * Math.max(0, hp)) / max}%`;
    (this.bossEl.querySelector('#b-sub') as HTMLElement).textContent = this.k(sub);
  }
  hideBoss() {
    this.bossEl.style.display = 'none';
  }
  setFlash(a: number) {
    this.flashEl.style.opacity = String(Math.max(0, Math.min(1, a)));
  }

  showResults(s: RunStats, best: boolean, prevBest: number | null, items: MenuItem[], index: number, blitz = false, note = '') {
    this.screen.className = 'screen results';
    this.screen.innerHTML = `
      <div class="panel wide">
        <div class="res-head"><div><h2>${PETS[s.pet].name}’s ${blitz ? 'blitz' : 'delivery'}</h2><div class="big-score">${s.score}<small> points</small></div></div>
        ${note ? `<div class="prev">${note}</div>` : blitz ? '<div class="prev">Blitz Round · not saved to Best Records</div>' : best ? '<div class="best">New personal best!</div>' : `<div class="prev">Best: ${prevBest ?? 0}</div>`}</div>
        ${this.statsHTML(s)}
        ${this.menuHTML(items, index)}
      </div>`;
  }

  showRecords(recs: Record<PetId, RunStats | null>, sel: number, onBack: boolean) {
    const ids: PetId[] = ['darrow', 'rufus', 'penny'];
    this.screen.className = 'screen records';
    this.screen.innerHTML = `
      <div class="select-head"><h2>Best Records</h2><p>Each pet keeps its own best run.</p></div>
      <div class="cards">${ids
        .map((id, i) => {
          const r = recs[id];
          return `<div class="card rec ${i === sel && !onBack ? 'sel' : ''}" data-id="rec-${id}" data-idx="${i}">
          <div class="name">${PETS[id].name}</div>
          <div class="rec-score">${r ? r.score : '—'}</div>
          <div class="role">${r ? `${totalDelivered(r)} presents · ${new Date(r.date).toLocaleDateString()}` : 'No run yet'}</div>
          ${r ? `<div class="open">${this.touch ? 'Tap to see the run' : 'Space: see the run'}</div>` : ''}
        </div>`;
        })
        .join('')}</div>
      <div class="select-foot"><button class="item small ${onBack ? 'sel' : ''}" data-id="back">Back</button>
      <p class="keys"><kbd>←</kbd><kbd>→</kbd> choose · <kbd>Space</kbd> open · <kbd>↓</kbd> back</p></div>`;
  }

  showRecordDetail(s: RunStats) {
    this.screen.className = 'screen results';
    this.screen.innerHTML = `<div class="panel wide"><div class="res-head"><div><h2>${PETS[s.pet].name}’s best run</h2><div class="big-score">${s.score}<small> points</small></div></div><div class="prev">${new Date(s.date).toLocaleString()}</div></div>${this.statsHTML(s)}${this.menuHTML([{ id: 'back', label: 'Back' }], 0)}</div>`;
  }

  showError(msg: string) {
    this.screen.className = 'screen error';
    this.screen.innerHTML = `<div class="panel slim"><h2>Oh no!</h2><p class="note">${msg}</p></div>`;
  }

  showLoading(msg: string) {
    this.screen.className = 'screen loading';
    this.screen.innerHTML = `<div class="loading-msg">${msg}</div>`;
  }

  // ---------------------------------------------------------------- HUD
  showHud(on: boolean) {
    this.hud.classList.toggle('hidden', !on);
  }

  setHud(timeLeft: number | null, score: number | null, carrying: PresentKind | null, prompt: string, mode = '') {
    if (timeLeft === null) {
      this.hTime.parentElement!.classList.add('hidden');
    } else {
      this.hTime.parentElement!.classList.remove('hidden');
      const t = Math.max(0, Math.ceil(timeLeft));
      const txt = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
      if (this.hTime.textContent !== txt) this.hTime.textContent = txt;
      this.hTime.parentElement!.classList.toggle('urgent', timeLeft <= 20);
    }
    if (score === null) this.hScore.parentElement!.classList.add('hidden');
    else {
      this.hScore.parentElement!.classList.remove('hidden');
      const s = String(score);
      if (this.hScore.textContent !== s) this.hScore.textContent = s;
    }
    const c = carrying ? `<span class="ico">${KIND_ICON[carrying]}</span> Carrying a ${KIND_LABEL[carrying].toLowerCase()}` : '';
    if (this.hCarry.innerHTML !== c) this.hCarry.innerHTML = c;
    this.hCarry.classList.toggle('hidden', !carrying);
    prompt = this.k(prompt);
    if (this.hPrompt.innerHTML !== prompt) this.hPrompt.innerHTML = prompt;
    this.hPrompt.classList.toggle('hidden', !prompt);
    if (this.hMode.textContent !== mode) this.hMode.textContent = mode;
  }

  bumpScore() {
    const e = this.hScore.parentElement!;
    e.classList.remove('bump');
    void e.offsetWidth;
    e.classList.add('bump');
  }

  showBanner(text: string, cls = '', ms = 1600) {
    this.banner.className = `banner show ${cls}`;
    this.banner.innerHTML = text;
    const stamp = String(Math.random());
    this.banner.dataset.stamp = stamp;
    if (ms > 0)
      setTimeout(() => {
        if (this.banner.dataset.stamp === stamp) this.banner.className = 'banner';
      }, ms);
  }
  hideBanner() {
    this.banner.className = 'banner';
  }

  toast(text: string, cls = '') {
    const t = el('div', `toast ${cls}`, this.k(text));
    this.toasts.appendChild(t);
    setTimeout(() => t.classList.add('out'), 1700);
    setTimeout(() => t.remove(), 2300);
    while (this.toasts.children.length > 3) this.toasts.firstChild!.remove();
  }

  showCaption(big: string, sub = '', style = '') {
    this.caption.className = 'caption' + (style ? ' ' + style : '');
    this.caption.innerHTML = `<div class="cap-big">${big}</div>${sub ? `<div class="cap-sub">${sub}</div>` : ''}`;
    this.caption.classList.add('show');
  }
  hideCaption() {
    this.caption.classList.remove('show');
  }

  // ---------------------------------------------------------------- catching track
  showCatch(kind: PresentKind, zoneWidth: number, title: string) {
    this.catchEl.classList.remove('hidden', 'won', 'lost');
    this.cPrey.innerHTML = KIND_ICON[kind];
    this.cZone.style.width = `${zoneWidth * 100}%`;
    this.catchEl.querySelector('#c-title')!.textContent = title;
  }
  updateCatch(zone: number, zoneWidth: number, marker: number, progress: number, overlap: boolean, timeLeft: number, settling: boolean) {
    this.cZone.style.left = `${(zone - zoneWidth / 2) * 100}%`;
    this.cPrey.style.left = `${marker * 100}%`;
    this.cFill.style.width = `${progress * 100}%`;
    this.cZone.classList.toggle('on', overlap);
    this.cTime.style.width = `${Math.max(0, timeLeft) * 100}%`;
    this.cHint.classList.toggle('dim', !settling);
  }
  endCatch(won: boolean) {
    this.catchEl.classList.add(won ? 'won' : 'lost');
    setTimeout(() => this.catchEl.classList.add('hidden'), 650);
  }
  hideCatch() {
    this.catchEl.classList.add('hidden');
  }
}
