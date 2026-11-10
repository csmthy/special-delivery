// Full screen on phones. Android (Chrome, Samsung) and iPads support the Fullscreen API, including inside
// itch.io's game frame. iPhones don't: Safari on iPhone only lets video go full screen, so there the best a
// page can do is fill the browser window (which itch.io's "Run game" does) and the player can hide
// Safari's toolbar.
type FSDoc = Document & { webkitFullscreenEnabled?: boolean; webkitFullscreenElement?: Element | null };
type FSEl = HTMLElement & { webkitRequestFullscreen?: () => void };

export function canFullscreen() {
  const d = document as FSDoc;
  return !!(d.fullscreenEnabled || d.webkitFullscreenEnabled);
}

/** True when the game already covers the whole screen (our own full screen, or itch.io's around our frame). */
export function isFullscreen() {
  const d = document as FSDoc;
  if (d.fullscreenElement || d.webkitFullscreenElement) return true;
  return Math.abs(window.innerWidth - screen.width) < 4 && Math.abs(window.innerHeight - screen.height) < 4;
}

export function isIPhone() {
  return /iPhone|iPod/.test(navigator.userAgent);
}

/** Must be called from inside a tap/click. Also asks for landscape where the browser allows it. */
export function requestFullscreen() {
  const el = document.documentElement as FSEl;
  try {
    const p = el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : (el.webkitRequestFullscreen?.(), undefined);
    Promise.resolve(p)
      .then(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> })?.lock?.('landscape'))
      .catch(() => {});
  } catch {}
}

export function onFullscreenChange(fn: () => void) {
  document.addEventListener('fullscreenchange', fn);
  document.addEventListener('webkitfullscreenchange', fn);
}
