import { Game } from './game/game';
import { UI } from './ui/ui';

const params = new URLSearchParams(location.search);
const dev = params.has('dev');
const manual = dev && params.has('manual');

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

function fatal(msg: string) {
  const ui = new UI();
  ui.showError(msg);
}

function boot() {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  if (!webglAvailable()) {
    fatal('This browser can’t show 3D graphics (WebGL is turned off or unavailable). Try the latest Safari or Chrome, and make sure hardware acceleration is enabled.');
    return;
  }
  let game: Game;
  try {
    game = new Game(canvas, { dev, preserve: manual });
  } catch (e) {
    console.error(e);
    fatal('Something went wrong while building the house. Please reload the page.');
    return;
  }
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    game.ui.showError('The graphics driver hiccuped. Please reload the page to keep playing.');
  });

  const STEP = 1 / 60;
  let acc = 0;
  let last = performance.now();
  // adaptive quality: drop resolution if frames are slow
  let frameAvg = 16;
  let quality = 2;
  const ratios = [0.75, 1, Math.min(window.devicePixelRatio, 1.5)];
  if (game.touch.enabled) {
    // phones: start at 1x resolution (the adaptive step below can still drop further)
    quality = 1;
    game.renderer.setPixelRatio(ratios[1]);
    game.resize();
  }
  let qualityCheck = 0;

  function frame(now: number) {
    const real = Math.min(0.1, (now - last) / 1000);
    last = now;
    acc += real * game.timeScale;
    let steps = 0;
    const maxSteps = dev ? 40 : 8;
    while (acc >= STEP && steps < maxSteps) {
      game.step(STEP);
      acc -= STEP;
      steps++;
    }
    if (steps === maxSteps) acc = 0;
    if (!manual) game.render();
    frameAvg = frameAvg * 0.95 + real * 1000 * 0.05;
    qualityCheck += real;
    if (qualityCheck > 3 && !dev) {
      qualityCheck = 0;
      if (frameAvg > 24 && quality > 0) {
        quality--;
        game.renderer.setPixelRatio(ratios[quality]);
        game.resize();
        if (quality === 0) game.renderer.shadowMap.type = 1; // PCFShadowMap (cheaper)
        if (quality === 0) game.setFurLevel(1);
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  if (dev) import('./dev').then((m) => {
    m.attachDev(game);
    (window as any).__sdReady = true;
  });
  else (window as any).__sdReady = true;
}

boot();
