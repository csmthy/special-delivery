import * as THREE from 'three';
import { BASKET_RANGE, BABADOOK, BLITZ_SECONDS, CATCH, MOM_WARNING_AT, PETS, POPULATION, RUN_SECONDS, pointsFor, type PetId, type PresentKind, type PreyKind } from '../config';
import { AmbushScheduler, Ledger, mulberry32, newCatch, stepCatch, totalDelivered, type CatchSim, type RunStats } from '../rules';
import { Input } from '../input';
import { Audio } from '../audio';
import { Store } from '../storage';
import { UI, type MenuItem } from '../ui/ui';
import { TouchControls } from '../ui/touch';
import { canFullscreen, isFullscreen, onFullscreenChange, requestFullscreen } from '../ui/fullscreen';
import { buildWorld, followSun, type World } from '../world/world';
import { BASKET, CEIL, FLAP, FLOOR, FRONT_DOOR, HOLE, HOUSE, LOT, STAIR_FOOT, groundHeight, insideHouse, surfaceType, boxes } from '../world/layout';
import { Neighbors, PETE, PETE_SCENE } from './neighbors';
import { Nuke } from './nuke';
import { makePet } from '../actors/species';
import { Quadruped } from '../actors/rig';
import { PreyModel } from '../actors/prey';
import { FollowCam, angDiff } from './camera';
import { cameraClear, moveActor } from './physics';
import { Wildlife, type Stick, type WildPrey } from './wildlife';
import { Babadook } from './babadook';

type Mode = 'title' | 'select' | 'prerun' | 'practice' | 'practiceCatch' | 'countdown' | 'play' | 'paused' | 'ending' | 'results' | 'records' | 'recordDetail';
type Action = 'free' | 'pounce' | 'catch' | 'deposit' | 'hit' | 'counter' | 'pickup';

interface Carry {
  kind: PresentKind;
  id: number;
  prey?: WildPrey;
  stick?: Stick;
}

const START_BEHIND = 1.3; // how far behind the basket centre the pet starts a run (m): clear of the rim, nose included
const PET_IDS: PetId[] = ['darrow', 'rufus', 'penny'];
const PREY_KINDS: PreyKind[] = ['mouse', 'chipmunk', 'bird', 'squirrel', 'snake'];
/** Seconds the game pauses while the camera shows Babadook coming out. */
const REVEAL_TIME = 2.6;
const NAP: Record<PetId, 'couch' | 'armchair' | 'dogbed'> = { darrow: 'couch', rufus: 'armchair', penny: 'dogbed' };
const KIND_NAME: Record<PresentKind, string> = { mouse: 'mouse', chipmunk: 'chipmunk', bird: 'bird', squirrel: 'squirrel', snake: 'snake', stick: 'stick' };

export class Game {
  renderer: THREE.WebGLRenderer;
  world: World;
  scene: THREE.Scene;
  fcam: FollowCam;
  input = new Input();
  store: Store;
  audio: Audio;
  ui = new UI();
  touch: TouchControls;

  mode: Mode = 'title';
  prevMode: Mode = 'title';
  menuIndex = 0;
  selIndex = 0;
  selOnBack = false;
  petId: PetId = 'darrow';
  pets: Record<PetId, Quadruped>;
  pet: Quadruped;
  S = PETS.darrow;

  // player state
  px = 0;
  pz = 0;
  py = FLOOR;
  pyVis = FLOOR;
  heading = 0;
  vx = 0;
  vz = 0;
  speed = 0;
  action: Action = 'free';
  actionT = 0;
  stalking = false;
  target: WildPrey | null = null;
  carry: Carry | null = null;
  capturedYaw = 0;
  arrowSig = '';
  noiseR = 0.4;
  bellT = 0;
  bellActive = false;
  stepDist = 0;
  inStairZone = false;
  flapAngle = 0;
  flapVel = 0;
  flapCD = 0;
  pounceFrom = new THREE.Vector3();
  pounceTo = new THREE.Vector3();
  counterFrom = new THREE.Vector3();
  counterTo = new THREE.Vector3();

  // run state
  explore = false;
  blitz = false; // 30-second round
  hard = false; // Hard Mode: Babadook boss fight + king cobras
  neighbors: Neighbors;
  peteT = -1; // Postal Pete's scene clock (>= 0 while it plays)
  peteDone = false;
  bossDone = false;
  hopT = -1; // hopping over a shockwave
  nuke: Nuke;
  snakeEnd = false;
  private hiddenForNuke: THREE.Object3D[] = [];
  elapsed = 0;
  timeLeft = RUN_SECONDS;
  warned = false;
  ledger: Ledger;
  scheduler: AmbushScheduler;
  wildlife: Wildlife;
  bab: Babadook;
  catchSim: CatchSim | null = null;
  catchPrey: WildPrey | null = null;
  rng = mulberry32(Date.now() & 0xffff);
  countdownT = 0;
  endingT = 0;
  endingFlags: Record<string, boolean> = {};
  lastStats: RunStats | null = null;
  lastBest = false;
  lastPrevBest: number | null = null;
  recordsSel = 0;
  carT = -1;
  carCurve: THREE.CatmullRomCurve3;
  practiceKind = 0;
  practiceNote = '';
  practicePrey: PreyModel | null = null;
  timeScale = 1;
  devTainted = false;
  dev = false;
  simTime = 0;
  titleT = 0;
  peekRoll = 0;

  // visuals
  bellRings: THREE.Mesh[] = [];
  basketMarker: THREE.Sprite;
  doorLight: THREE.SpotLight;
  momShadow: THREE.Mesh;

  constructor(canvas: HTMLCanvasElement, opts: { dev: boolean; preserve?: boolean }) {
    this.dev = opts.dev;
    this.store = new Store(opts.dev ? 'sd.dev' : 'sd.v1');
    this.audio = new Audio(!this.store.loadSound());
    this.ui.setMuteIndicator(this.audio.muted);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: !!opts.preserve });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.world = buildWorld();
    this.scene = this.world.scene;
    this.fcam = new FollowCam(window.innerWidth / window.innerHeight);

    this.pets = { darrow: makePet('darrow'), rufus: makePet('rufus'), penny: makePet('penny') };
    for (const id of PET_IDS) this.scene.add(this.pets[id].root);
    this.pet = this.pets.darrow;

    this.ledger = new Ledger('darrow', false);
    this.scheduler = new AmbushScheduler(false, this.rng);
    this.wildlife = new Wildlife(this.scene, this.ledger, this.world.interior, this.audio, Date.now());
    this.bab = new Babadook(this.scene, this.world.house.holeEyes);
    this.neighbors = new Neighbors(this.scene, this.audio);
    // the neighbours are sculpted at load-time cost (~1 s each): build them once the title screen is showing
    setTimeout(() => this.neighbors.build(), 400);
    this.nuke = new Nuke(this.scene, (HOUSE.x0 + HOUSE.x1) / 2, (HOUSE.z0 + HOUSE.z1) / 2);

    // bell sound rings (visible even when muted)
    const ringMat = new THREE.MeshBasicMaterial({ color: '#ffe48a', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    for (let i = 0; i < 4; i++) {
      const r = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.13, 32), ringMat.clone());
      r.visible = false;
      this.scene.add(r);
      this.bellRings.push(r);
    }
    // floating basket marker shown while carrying
    this.basketMarker = new THREE.Sprite(new THREE.SpriteMaterial({ map: basketIcon(), depthTest: false, transparent: true }));
    this.basketMarker.scale.set(0.42, 0.42, 1);
    this.basketMarker.position.set(BASKET.x, FLOOR + 0.95, BASKET.z);
    this.basketMarker.renderOrder = 10;
    this.basketMarker.visible = false;
    this.scene.add(this.basketMarker);

    // ending: light from the open front door and Mom's shadow
    this.doorLight = new THREE.SpotLight('#fff3dc', 0, 9, 0.7, 0.6, 1);
    this.doorLight.position.set(FRONT_DOOR.xc, FLOOR + 2.0, 0.9);
    this.doorLight.target.position.set(FRONT_DOOR.xc, FLOOR, -2.5);
    this.scene.add(this.doorLight, this.doorLight.target);
    this.momShadow = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 2.6), new THREE.MeshBasicMaterial({ map: momShadowTex(), transparent: true, opacity: 0, depthWrite: false }));
    this.momShadow.rotation.set(-Math.PI / 2, 0, Math.PI - 0.42);
    this.momShadow.position.set(FRONT_DOOR.xc - 0.5, FLOOR + 0.007, -1.25);
    this.scene.add(this.momShadow);

    this.carCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-34, 0, 15.6),
      new THREE.Vector3(-12, 0, 15.6),
      new THREE.Vector3(-5, 0, 15.2),
      new THREE.Vector3(-2.35, 0, 12.2),
      new THREE.Vector3(-2.3, 0, 8.0),
      new THREE.Vector3(-2.3, 0, 3.3),
    ]);

    this.input.onAny = () => this.audio.unlock();
    window.addEventListener('pointerdown', () => {
      window.focus();
      this.audio.unlock();
    });
    window.addEventListener('pointerup', () => this.audio.unlock()); // iOS only lets audio start on a touch *end*
    // phone / tablet controls (switch on by themselves on touch screens)
    this.touch = new TouchControls(this.input, this.ui.root);
    this.ui.setTouch(this.touch.enabled);
    this.touch.onChange = (on) => {
      this.ui.setTouch(on);
      if (this.ui.screen.childElementCount) this.renderMenu();
    };
    this.touch.onPortrait = () => this.autoPause();
    onFullscreenChange(() => {
      this.resize();
      if (this.ui.screen.childElementCount) this.renderMenu();
    });
    window.addEventListener('focus', () => {
      if (this.mode === 'title') this.renderMenu();
    });
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.autoPause();
    });
    window.addEventListener('blur', () => this.autoPause());
    this.ui.onClick = (id) => this.click(id);
    this.ui.onHover = (i) => {
      if (['title', 'prerun', 'practice', 'paused', 'results'].includes(this.mode) && i !== this.menuIndex) {
        this.menuIndex = i;
        this.renderMenu();
      }
    };
    this.placeNappers(null);
    this.toTitle();
  }

  // ================================================================ menus
  private items(): MenuItem[] {
    switch (this.mode) {
      case 'title':
        return [
          { id: 'play', label: 'Play', hint: '3 minutes until Mom gets home' },
          { id: 'blitz', label: 'Blitz Round', hint: '30 seconds until Mom gets home' },
          { id: 'hard', label: 'Hard Mode', hint: 'Babadook boss fight · king cobras · 3 minutes' },
          { id: 'explore', label: 'Explore the House', hint: 'No clock, no Babadook, no score' },
          { id: 'records', label: 'Best Records' },
          { id: 'sound', label: `Sound: ${this.audio.muted ? 'Off' : 'On'}` },
          ...(this.offerFullscreen() ? [{ id: 'fullscreen', label: 'Full screen' }] : []),
        ];
      case 'prerun':
        return this.explore
          ? [
              { id: 'go', label: 'Start exploring' },
              { id: 'back', label: 'Choose a different pet' },
            ]
          : [
              { id: 'go', label: this.blitz ? 'Start the 30-second blitz' : this.hard ? 'Start Hard Mode (3 minutes)' : 'Start the 3-minute run' },
              { id: 'practice', label: 'Practice a catch first', hint: 'Untimed · no points' },
              { id: 'back', label: 'Choose a different pet' },
            ];
      case 'practice':
        return [
          { id: 'try', label: `<span>Try catching: <span class="kind-arrow" data-id="kind-prev">◀</span> ${cap(PREY_KINDS[this.practiceKind])} <span class="kind-arrow" data-id="kind-next">▶</span></span>` },
          { id: 'go', label: this.blitz ? 'Start the 30-second blitz' : this.hard ? 'Start Hard Mode (3 minutes)' : 'Start the 3-minute run' },
          { id: 'back', label: 'Back' },
        ];
      case 'paused':
        return [
          { id: 'resume', label: 'Resume' },
          ...(this.offerFullscreen() ? [{ id: 'fullscreen', label: 'Full screen' }] : []),
          { id: 'quit', label: this.explore ? 'Stop exploring' : 'Quit to title (run won’t count)' },
        ];
      case 'results':
        return [
          { id: 'again', label: 'Play again' },
          { id: 'select', label: 'Choose a pet' },
          { id: 'title', label: 'Title' },
        ];
      default:
        return [];
    }
  }

  private renderMenu() {
    const items = this.items();
    this.menuIndex = Math.max(0, Math.min(items.length - 1, this.menuIndex));
    switch (this.mode) {
      case 'title':
        this.ui.showTitle(items, this.menuIndex, !this.store.available);
        break;
      case 'select':
        this.ui.showSelect(this.selIndex, this.selOnBack);
        break;
      case 'prerun':
        this.ui.showPreRun(this.petId, items, this.menuIndex, this.explore ? 'Exploring: wander anywhere. Catches and deliveries are just for fun. Walk to the front door and press Space to leave.' : '');
        break;
      case 'practice':
        this.ui.showPractice(items, this.menuIndex, this.practiceNote);
        break;
      case 'paused':
        this.ui.showPause(items, this.menuIndex);
        break;
      case 'results':
        if (this.lastStats) this.ui.showResults(this.lastStats, this.lastBest, this.lastPrevBest, items, this.menuIndex, this.blitz, this.snakeEnd ? 'Game over: Snake Induced Detonation · Hard Mode · not saved' : this.hard ? 'Hard Mode · not saved to Best Records' : '');
        break;
      case 'records':
        this.ui.showRecords(this.store.loadRecords(), this.recordsSel, this.selOnBack);
        break;
    }
  }

  private click(id: string) {
    this.audio.unlock();
    if (this.mode === 'practice' && (id === 'kind-prev' || id === 'kind-next')) {
      this.practiceKind = (this.practiceKind + (id === 'kind-prev' ? 3 : 1)) % 4;
      this.menuIndex = 0;
      this.audio.uiMove();
      this.setupPracticeScene();
      this.renderMenu();
      return;
    }
    if (this.mode === 'select') {
      if (id === 'back') return this.toTitle();
      const p = id.replace('pet-', '') as PetId;
      this.selIndex = PET_IDS.indexOf(p);
      return this.confirmPet();
    }
    if (this.mode === 'records') {
      if (id === 'back') return this.toTitle();
      const p = id.replace('rec-', '') as PetId;
      this.recordsSel = PET_IDS.indexOf(p);
      return this.openRecord();
    }
    if (this.mode === 'recordDetail') return this.toRecords();
    const items = this.items();
    const i = items.findIndex((it) => it.id === id);
    if (i >= 0) {
      // on a phone, starting a game also goes full screen where the browser allows it (it has to happen inside the tap)
      if (this.mode === 'title' && ['play', 'blitz', 'hard', 'explore'].includes(id) && this.offerFullscreen()) requestFullscreen();
      this.menuIndex = i;
      this.activate(id);
    }
  }

  private navMenu() {
    const items = this.items();
    if (this.input.justPressed('up')) {
      this.menuIndex = (this.menuIndex + items.length - 1) % items.length;
      this.audio.uiMove();
      this.renderMenu();
    }
    if (this.input.justPressed('down')) {
      this.menuIndex = (this.menuIndex + 1) % items.length;
      this.audio.uiMove();
      this.renderMenu();
    }
    if (this.mode === 'practice' && this.menuIndex === 0 && (this.input.justPressed('left') || this.input.justPressed('right'))) {
      this.practiceKind = (this.practiceKind + (this.input.justPressed('left') ? 3 : 1)) % 4;
      this.audio.uiMove();
      this.setupPracticeScene();
      this.renderMenu();
    }
    if (this.input.justPressed('space')) {
      this.audio.uiSelect();
      this.activate(items[this.menuIndex].id);
    }
  }

  /** Phones that can go full screen (Android, iPad) and aren't already. */
  private offerFullscreen() {
    return this.touch.enabled && canFullscreen() && !isFullscreen();
  }

  private activate(id: string) {
    const m = this.mode;
    if (id === 'fullscreen') {
      requestFullscreen();
      return;
    }
    if (m === 'title') {
      if (id === 'play' || id === 'blitz' || id === 'hard') {
        this.explore = false;
        this.blitz = id === 'blitz';
        this.hard = id === 'hard';
        this.toSelect();
      } else if (id === 'explore') {
        this.explore = true;
        this.blitz = false;
        this.hard = false;
        this.toSelect();
      } else if (id === 'records') this.toRecords();
      else if (id === 'sound') this.toggleMute();
    } else if (m === 'prerun') {
      if (id === 'go') this.explore ? this.startExplore() : this.startCountdown();
      else if (id === 'practice') this.toPractice();
      else if (id === 'back') this.toSelect();
    } else if (m === 'practice') {
      if (id === 'try') this.startPracticeCatch();
      else if (id === 'go') this.startCountdown();
      else if (id === 'back') this.toPreRun();
    } else if (m === 'paused') {
      if (id === 'resume') this.resume();
      else if (id === 'quit') this.abandonRun();
    } else if (m === 'results') {
      if (id === 'again') this.startCountdown();
      else if (id === 'select') {
        this.explore = false;
        this.toSelect();
      } else this.toTitle();
    }
    this.input.requireFreshSpace();
  }

  toggleMute() {
    this.audio.setMuted(!this.audio.muted);
    this.store.saveSound(!this.audio.muted);
    this.ui.setMuteIndicator(this.audio.muted);
    this.renderMenu();
  }

  // ================================================================ transitions
  private setMode(m: Mode) {
    this.prevMode = this.mode;
    this.mode = m;
    this.menuIndex = 0;
    this.input.requireFreshSpace();
  }

  toTitle() {
    this.cleanupRun();
    this.setMode('title');
    this.titleT = 0;
    this.ui.showHud(false);
    this.ui.hideCaption();
    this.placeNappers(null);
    this.audio.stopMusic();
    this.renderMenu();
  }

  toSelect() {
    this.cleanupRun();
    this.setMode('select');
    this.selOnBack = false;
    this.selIndex = PET_IDS.indexOf(this.petId);
    this.ui.showHud(false);
    this.ui.hideCaption();
    this.layoutSelect();
    this.renderMenu();
  }

  private confirmPet() {
    this.petId = PET_IDS[this.selIndex];
    this.audio.uiSelect();
    if (this.petId === 'penny') this.audio.bark();
    else this.audio.meow();
    this.toPreRun();
  }

  toPreRun() {
    this.cleanupRun();
    this.setMode('prerun');
    this.usePet(this.petId);
    this.placeNappers(this.petId);
    // show the chosen pet by the basket
    this.setPlayerPose(BASKET.x - 0.55, BASKET.z + 0.3, 0.75);
    this.pet.p = { ...this.pet.p, sit: 1, proud: 0.6, speed: 0, crouch: 0, carry: 0, lie: 0 };
    this.fcam.set(BASKET.x - 0.3, FLOOR + 0.66, -0.42, BASKET.x + 0.45, FLOOR + 0.25, BASKET.z + 0.05);
    this.renderMenu();
  }

  toRecords() {
    this.setMode('records');
    this.selOnBack = false;
    this.renderMenu();
  }
  private openRecord() {
    const r = this.store.loadRecords()[PET_IDS[this.recordsSel]];
    if (!r) return;
    this.setMode('recordDetail');
    this.ui.showRecordDetail(r);
  }

  private toPractice() {
    this.setMode('practice');
    this.practiceNote = 'Hold Space to slide the paw right, release to slide left. Keep it on the animal to fill the meter.';
    this.setupPracticeScene();
    this.renderMenu();
  }

  private setupPracticeScene() {
    if (this.practicePrey) this.scene.remove(this.practicePrey.root);
    const kind = PREY_KINDS[this.practiceKind];
    const prey = new PreyModel(kind, 0);
    this.practicePrey = prey;
    this.scene.add(prey.root);
    const x = 2.2;
    const z = -10.6;
    this.setPlayerPose(x, z, Math.PI);
    this.pet.p = { ...this.pet.p, sit: 0, proud: 0, crouch: 0.8, speed: 0 };
    prey.root.position.set(x, 0, z - 0.42);
    prey.root.rotation.y = 0.4;
    prey.pose = 'look';
    this.fcam.set(x + 0.9, 0.8, z + 1.1, x, 0.12, z - 0.25);
  }

  private startPracticeCatch() {
    const kind = PREY_KINDS[this.practiceKind];
    this.catchSim = newCatch(kind, this.petId);
    this.setMode('practiceCatch');
    this.ui.clearScreen();
    this.ui.showCatch(kind, this.S.zoneWidth, `Practice: catch the ${kind}!`);
  }

  private startCountdown() {
    this.cleanupRun();
    this.explore = false;
    this.setMode('countdown');
    this.ui.clearScreen();
    this.resetRun(true);
    this.countdownT = 0;
    this.ui.showHud(true);
    this.updateHud();
    this.audio.startAmbience();
  }

  private startExplore() {
    this.cleanupRun();
    this.explore = true;
    this.setMode('play');
    this.ui.clearScreen();
    this.resetRun(false);
    this.ui.showHud(true);
    this.audio.startAmbience();
    this.ui.showBanner('Explore!', '', 1200);
  }

  get runSeconds() {
    return this.blitz ? BLITZ_SECONDS : RUN_SECONDS;
  }

  private resetRun(ranked: boolean) {
    this.usePet(this.petId);
    this.placeNappers(this.petId);
    this.ledger = new Ledger(this.petId, ranked);
    this.scheduler = new AmbushScheduler(ranked, this.rng);
    this.wildlife.setLedger(this.ledger);
    this.wildlife.reset(this.petId === 'penny', true, this.hard && !this.explore);
    this.neighbors.reset();
    this.peteT = -1;
    this.peteDone = false;
    this.bossDone = false;
    this.hopT = -1;
    this.snakeEnd = false;
    this.restoreHouse();
    this.ui.hideBoss();
    this.bab.cancel();
    this.bab.hold = false;
    this.revealT = 0;
    this.elapsed = 0;
    this.timeLeft = this.runSeconds;
    this.warned = false;
    this.carry = null;
    this.catchSim = null;
    this.catchPrey = null;
    this.action = 'free';
    this.stalking = false;
    this.target = null;
    this.inStairZone = false;
    this.carT = -1;
    this.world.car.group.visible = false;
    this.world.house.frontDoor.rotation.y = 0;
    this.doorLight.intensity = 0;
    (this.momShadow.material as THREE.MeshBasicMaterial).opacity = 0;
    this.setFrontDoorCollider(true);
    for (const c of this.world.interior.chaos) {
      c.t = 0;
      c.obj.position.copy(c.from.p);
      c.obj.rotation.copy(c.from.r);
      if (c.show) c.obj.visible = false;
    }
    // just behind the toy basket (not in it), facing past it toward the dining room doorway
    this.setPlayerPose(BASKET.x + START_BEHIND, BASKET.z + 0.1, -Math.PI / 2);
    this.pet.p = { ...this.pet.p, sit: 0, proud: 0, lie: 0, crouch: 0, carry: 0, speed: 0, leap: -1, hit: 0, dip: 0 };
    this.fcam.snap(this.px, this.py, this.pz, this.heading);
    this.capturedYaw = this.heading;
    this.ui.hideCaption();
    this.ui.hideCatch();
    this.ui.fade(false);
    this.endingFlags = {};
  }

  private cleanupRun() {
    if (this.practicePrey) {
      this.scene.remove(this.practicePrey.root);
      this.practicePrey = null;
    }
    this.bab.cancel();
    this.bab.hold = false;
    this.revealT = 0;
    this.ui.hideCatch();
    this.ui.hideBanner();
    this.audio.stopMusic();
    this.audio.carStop();
    this.basketMarker.visible = false;
    this.wildlife.targetRing.visible = false;
    this.ui.hideBoss();
    this.peteT = -1;
    this.neighbors.reset();
    this.restoreHouse();
    if (this.carry) {
      if (this.carry.prey) this.carry.prey.model.root.removeFromParent();
      if (this.carry.stick) this.carry.stick.mesh.removeFromParent();
      this.carry = null;
    }
  }

  private abandonRun() {
    this.ui.showHud(false);
    this.timeScale = 1;
    this.toTitle();
  }

  private autoPause() {
    this.input.clear();
    if (this.mode === 'play' || this.mode === 'countdown' || this.mode === 'practiceCatch') {
      this.prevMode = this.mode;
      this.mode = 'paused';
      this.menuIndex = 0;
      this.audio.stopMusic();
      this.audio.suspend();
      this.renderMenu();
    }
  }

  private resume() {
    this.mode = this.prevMode;
    this.ui.clearScreen();
    this.audio.resume();
    if (this.mode === 'play' && !this.explore) this.audio.startMusic(this.timeLeft <= MOM_WARNING_AT);
    if (this.mode === 'practiceCatch' && this.catchSim) this.ui.showCatch(this.catchSim.prey, this.S.zoneWidth, `Practice: catch the ${this.catchSim.prey}!`);
    this.input.requireFreshSpace();
  }

  private usePet(id: PetId) {
    this.petId = id;
    this.pet = this.pets[id];
    this.S = PETS[id];
    this.pet.p.tailMood = 0.6;
  }

  private setPlayerPose(x: number, z: number, heading: number) {
    this.px = x;
    this.pz = z;
    this.py = groundHeight(x, z);
    this.pyVis = this.py;
    this.heading = heading;
    this.vx = this.vz = this.speed = 0;
    this.pet.root.position.set(x, this.py, z);
    this.pet.root.rotation.set(0, heading, 0);
    this.pet.root.visible = true;
  }

  /** Unselected pets nap indoors as decoration. */
  private placeNappers(active: PetId | null) {
    // sleeping pets in the background use half the fur shells (they're small on screen); the player's pet gets full fur
    for (const id of PET_IDS) this.pets[id].setFurLevel(id === active ? this.furLevel : Math.min(this.furLevel, 1));
    const spots = this.world.interior.napSpots;
    for (const id of PET_IDS) {
      const q = this.pets[id];
      if (id === active) continue;
      const s = spots[NAP[id]];
      q.root.position.set(s.x, s.y, s.z);
      q.root.rotation.set(0, s.rot, 0);
      q.p = { ...q.p, lie: 1, sit: 0, speed: 0, crouch: 0, carry: 0, proud: 0, leap: -1 };
      q.root.visible = true;
    }
  }

  private layoutSelect() {
    PET_IDS.forEach((id, i) => {
      const q = this.pets[id];
      q.setFurLevel(this.furLevel); // close-up on the select screen: full fur for everyone
      // Penny (right) sits a little further in and back so the plant and frame edge don't crop her
      q.root.position.set(BASKET.x - 0.66 + i * 0.64, FLOOR, BASKET.z + 0.6 - (i === 1 ? 0.12 : i === 2 ? 0.08 : 0));
      q.root.rotation.set(0, 0.35 - i * 0.35, 0);
      q.p = { ...q.p, lie: 0, sit: 0, speed: 0, crouch: 0, carry: 0, proud: 0, leap: -1 };
    });
    // stand back from the front-window sheers and look down a little, so the cards sit above the pets
    this.fcam.set(BASKET.x, FLOOR + 0.8, -0.42, BASKET.x, FLOOR + 0.42, BASKET.z + 0.25);
  }

  // ================================================================ main step
  step(dt: number) {
    this.simTime += dt;
    this.touch.update(this.ui.screen.childElementCount === 0, this.mode === 'play' || this.mode === 'countdown' || this.mode === 'practiceCatch');
    switch (this.mode) {
      case 'title':
        this.titleT += dt;
        this.navMenu();
        if (this.mode === 'title') this.titleCamera(); // don't stomp the next screen's camera on the frame we leave
        break;
      case 'select':
        this.stepSelect(dt);
        break;
      case 'prerun':
      case 'practice':
      case 'paused':
      case 'results':
        this.navMenu();
        break;
      case 'records':
        this.stepRecords();
        break;
      case 'recordDetail':
        if (this.input.justPressed('space')) this.toRecords();
        break;
      case 'practiceCatch':
        this.stepPracticeCatch(dt);
        break;
      case 'countdown':
        this.stepCountdown(dt);
        break;
      case 'play':
        this.stepPlay(dt);
        break;
      case 'ending':
        this.stepEnding(dt);
        break;
    }
    if (this.input.justPressed('mute')) this.toggleMute();
    if (this.input.justPressed('esc') && (this.mode === 'play' || this.mode === 'countdown')) this.autoPause();

    // animate everything
    for (const id of PET_IDS) this.pets[id].update(dt);
    if (this.practicePrey) this.practicePrey.update(dt);
    this.world.house.fan.rotation.y += dt * 2.2;
    this.world.yard.chimes.rotation.z = Math.sin(this.simTime * 1.3) * 0.06;
    this.world.yard.chimes.rotation.x = Math.sin(this.simTime * 0.9) * 0.05;
    this.world.backlot.update(dt, this.simTime);
    this.neighbors.update(dt, { x: this.px, z: this.pz, inYard: this.mode === 'play' && !insideHouse(this.px, this.pz) && this.py < 0.3 }, this.mode === 'play' && this.peteT < 0 && this.revealT <= 0);
    this.nuke.update(dt);
    this.updateFlap(dt);
    this.updateChaos(dt);
    this.updateBellRings(dt);
    this.input.endFrame();
  }

  private titleCamera() {
    // slow drift above the couch, looking past the toy basket at the cat trees in the front window
    const t = this.titleT * 0.06;
    const x = BASKET.x - 0.05 + Math.sin(t) * 0.25;
    const z = -3.2 + Math.cos(t * 1.3) * 0.08;
    this.fcam.set(x, FLOOR + 1.25, z, BASKET.x + 0.65, FLOOR + 0.4, -0.9);
  }

  private stepSelect(dt: number) {
    const inp = this.input;
    if (!this.selOnBack) {
      if (inp.justPressed('left')) {
        this.selIndex = (this.selIndex + 2) % 3;
        this.audio.uiMove();
        this.renderMenu();
      }
      if (inp.justPressed('right')) {
        this.selIndex = (this.selIndex + 1) % 3;
        this.audio.uiMove();
        this.renderMenu();
      }
      if (inp.justPressed('down')) {
        this.selOnBack = true;
        this.audio.uiMove();
        this.renderMenu();
      }
      if (inp.justPressed('space')) {
        this.confirmPet();
        return;
      }
    } else {
      if (inp.justPressed('up')) {
        this.selOnBack = false;
        this.audio.uiMove();
        this.renderMenu();
      }
      if (inp.justPressed('space')) {
        this.toTitle();
        return;
      }
    }
    // selected pet stands proud and wags; others sit
    PET_IDS.forEach((id, i) => {
      const q = this.pets[id];
      const sel = i === this.selIndex && !this.selOnBack;
      q.p.sit = sel ? 0 : 1;
      q.p.proud = sel ? 0 : 0.3;
      q.p.tailMood = sel ? 1 : 0.4;
      q.p.lookYaw = sel ? Math.sin(this.simTime * 1.5) * 0.3 : 0;
      q.p.bark = sel && id === 'penny' ? Math.max(0, Math.sin(this.simTime * 3) - 0.85) * 4 : 0;
      q.root.position.y = FLOOR + (sel ? Math.abs(Math.sin(this.simTime * 4)) * 0.02 : 0);
    });
    void dt;
  }

  private stepRecords() {
    const inp = this.input;
    if (!this.selOnBack) {
      if (inp.justPressed('left')) {
        this.recordsSel = (this.recordsSel + 2) % 3;
        this.renderMenu();
      }
      if (inp.justPressed('right')) {
        this.recordsSel = (this.recordsSel + 1) % 3;
        this.renderMenu();
      }
      if (inp.justPressed('down')) {
        this.selOnBack = true;
        this.renderMenu();
      }
      if (inp.justPressed('space')) this.openRecord();
    } else {
      if (inp.justPressed('up')) {
        this.selOnBack = false;
        this.renderMenu();
      }
      if (inp.justPressed('space')) this.toTitle();
    }
  }

  private stepPracticeCatch(dt: number) {
    const c = this.catchSim!;
    stepCatch(c, dt, this.input.held('space'), this.rng);
    this.ui.updateCatch(c.zone, this.S.zoneWidth, c.marker, c.progress, c.overlap, 1 - c.t / CATCH.timeLimit, c.t < 0.5);
    this.pet.p.wiggle = 0.6;
    this.pet.p.crouch = 1;
    if (this.practicePrey) this.practicePrey.pose = 'carried';
    if (c.result !== 'running') {
      const won = c.result === 'caught';
      this.ui.endCatch(won);
      won ? this.audio.caught() : this.audio.escaped();
      this.practiceNote = won ? `Nice catch! That ${c.prey} took ${c.t.toFixed(1)} seconds.` : `The ${c.prey} wriggled free. Keep the paw over it — it’s all about timing.`;
      this.catchSim = null;
      this.pet.p.wiggle = 0;
      if (this.practicePrey) this.practicePrey.pose = 'look';
      this.setMode('practice');
      this.renderMenu();
    }
  }

  private stepCountdown(dt: number) {
    const prev = this.countdownT;
    this.countdownT += dt;
    const marks = [0, 1, 2, 3];
    for (const m of marks) {
      if (prev <= m && this.countdownT > m) {
        const n = 3 - m;
        this.ui.showBanner(n > 0 ? String(n) : 'Go!', '', 900);
        this.audio.countdown(n === 0);
      }
    }
    this.fcam.update(dt, this.px, this.pyVis, this.pz, this.heading, 0);
    followSun(this.world, this.px, this.pz);
    this.updateHud();
    if (this.countdownT > 3.05) {
      this.setMode('play');
      this.audio.startMusic(false);
    }
  }

  // ================================================================ gameplay
  private stepPlay(dt: number) {
    // Postal Pete's scene: the run pauses while he pops up over the left fence and says his line
    if (this.peteT >= 0) {
      this.peteT += dt;
      const t = this.peteT;
      const F = this.endingFlags;
      if (t > PETE_SCENE.line0 && !F.peteLine) {
        F.peteLine = true;
        this.ui.showCaption('Postal Pete', `“${PETE.line}”`, 'sub');
        this.audio.creepyLine(PETE.line);
      }
      if (t > PETE_SCENE.scare && !F.peteScare) {
        F.peteScare = true;
        this.wildlife.scare(this.timeLeft);
      }
      if (t > PETE_SCENE.line1 && !F.peteCapOff) {
        F.peteCapOff = true;
        this.ui.hideCaption();
      }
      // everything else keeps moving (the animals bolt), the pet freezes and stares at the fence
      this.wildlife.update(dt, { x: -99, z: -99, y: 0, noiseR: 0, bell: false }, false);
      const p = this.pet.p;
      p.speed = 0;
      p.crouch = 0.6;
      p.tailMood = 0.1;
      this.vx = this.vz = 0;
      const want = Math.atan2(PETE.x - this.px, PETE.z - this.pz);
      this.heading += angDiff(want, this.heading) * Math.min(1, dt * 4);
      this.syncPetTransform(dt);
      if (t >= PETE_SCENE.total) {
        this.peteT = -1;
        this.pet.p.crouch = 0;
        this.input.requireFreshSpace();
        this.audio.startMusic(this.timeLeft <= MOM_WARNING_AT);
        this.ui.toast('The animals fled his side of the yard…', 'bad');
      }
      this.updateCamera(dt);
      this.updateHud();
      return;
    }
    // halfway through every timed run: Pete (waits for a quiet moment — not mid-catch, not during Babadook)
    if (!this.explore && !this.blitz && !this.peteDone && this.elapsed >= this.runSeconds / 2 && this.action === 'free' && !this.bab.active && this.revealT <= 0 && this.neighbors.ready) {
      this.peteDone = true;
      this.peteT = 0;
      this.endingFlags.peteLine = this.endingFlags.peteScare = this.endingFlags.peteCapOff = false;
      this.neighbors.startPete();
      this.stalking = false;
      this.wildlife.targetRing.visible = false;
      this.audio.stopMusic();
      this.audio.creepySting();
      this.updateCamera(dt);
      return;
    }
    // Babadook reveal: everything stops for a moment while the camera swings round to show him
    if (this.revealT > 0) {
      this.revealT = Math.max(0, this.revealT - dt);
      this.updateEncounter(dt);
      const p = this.pet.p;
      p.speed = 0;
      p.crouch = 0.5;
      p.tailMood = 0.15;
      this.vx = this.vz = 0;
      const want = Math.atan2(this.bab.x - this.px, this.bab.z - this.pz);
      this.heading += angDiff(want, this.heading) * Math.min(1, dt * 6);
      this.syncPetTransform(dt);
      if (this.revealT <= 0) {
        this.bab.hold = false;
        this.pet.p.crouch = 0;
        this.input.requireFreshSpace();
        this.ui.toast('Watch the arrow — dodge with ←/→!', 'bad');
      }
      this.updateCamera(dt);
      this.updateHud();
      return;
    }
    const ranked = !this.explore;
    const bossFight = this.bab.boss && this.bab.active;
    if (ranked && !bossFight) {
      this.elapsed += dt;
      this.timeLeft = this.runSeconds - this.elapsed;
      if (!this.warned && this.timeLeft <= MOM_WARNING_AT) {
        this.warned = true;
        this.ui.showBanner('Mom’s almost home!', 'mom', 2600);
        this.carT = 0;
        this.world.car.group.visible = true;
        this.audio.carStart();
        this.audio.startMusic(true);
      }
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        this.startEnding();
        return;
      }
    }
    this.updatePlayer(dt);
    this.updateEncounter(dt);
    this.wildlife.update(dt, { x: this.px, z: this.pz, y: this.py, noiseR: this.noiseR, bell: this.bellActive, speed: this.speed, stalking: this.stalking }, true);
    // targeting ring while stalking
    if (this.stalking && this.action === 'free') {
      this.target = this.wildlife.findTarget(this.px, this.pz, this.heading, 4.5);
      const d = this.target ? Math.hypot(this.target.x - this.px, this.target.z - this.pz) : 99;
      this.wildlife.updateTargetRing(this.target, d <= this.S.pounceRange, this.simTime);
    } else if (this.action !== 'pounce' && this.action !== 'catch') {
      this.target = null;
      this.wildlife.targetRing.visible = false;
    }
    // peeking eyes as foreshadowing
    this.peekRoll = this.rng();
    const hd = Math.hypot(this.px - HOLE.x, this.pz - HOLE.z);
    if (this.bab.updatePeek(dt, hd, this.py < 0.3, this.peekRoll)) this.audio.rustle();
    this.updateCar(dt);
    this.basketMarker.visible = !!this.carry && this.action !== 'deposit';
    this.basketMarker.position.y = FLOOR + 0.95 + Math.sin(this.simTime * 3) * 0.05;
    this.updateCamera(dt);
    this.updateHud();
  }

  private updatePlayer(dt: number) {
    const S = this.S;
    const p = this.pet.p;
    const inp = this.input;
    this.actionT += dt;
    p.hit = Math.max(0, p.hit - dt * 2);
    p.bark = Math.max(0, p.bark - dt * 1.6);
    p.dip = 0;
    p.leap = -1;
    p.wiggle = 0;

    // ---------------- non-free actions
    if (this.action === 'pounce') {
      const u = Math.min(1, this.actionT / 0.32);
      this.px = this.pounceFrom.x + (this.pounceTo.x - this.pounceFrom.x) * u;
      this.pz = this.pounceFrom.z + (this.pounceTo.z - this.pounceFrom.z) * u;
      this.py = groundHeight(this.px, this.pz);
      p.leap = u;
      p.speed = 0;
      if (u >= 1) this.beginCatch();
      this.syncPetTransform(dt);
      return;
    }
    if (this.action === 'catch') {
      this.stepCatchGame(dt);
      this.syncPetTransform(dt);
      return;
    }
    if (this.action === 'deposit') {
      p.speed = 0;
      p.dip = this.actionT < 0.55 ? 1 : 0;
      p.proud = this.actionT > 0.55 ? 1 : 0;
      p.tailMood = 1;
      if (this.actionT >= 0.38 && this.carry) this.completeDeposit();
      if (this.actionT >= 0.95) {
        this.action = 'free';
        p.proud = 0;
        inp.requireFreshSpace();
      }
      this.syncPetTransform(dt);
      return;
    }
    if (this.action === 'pickup') {
      p.dip = this.actionT < 0.2 ? 1 : 0;
      p.speed = 0;
      if (this.actionT >= 0.28) {
        this.action = 'free';
        inp.requireFreshSpace();
      }
      this.syncPetTransform(dt);
      return;
    }
    if (this.action === 'hit') {
      p.hit = Math.max(p.hit, 0.6);
      // knockback slide
      const r = moveActor(this.px, this.pz, this.vx * dt, this.vz * dt, S.radius);
      this.px = r.x;
      this.pz = r.z;
      this.py = r.y;
      this.vx *= Math.exp(-dt * 6);
      this.vz *= Math.exp(-dt * 6);
      p.speed = 0;
      if (this.actionT >= S.hitStun) {
        this.action = 'free';
        inp.requireFreshSpace();
      }
      this.syncPetTransform(dt);
      return;
    }
    if (this.action === 'counter') {
      const u = Math.min(1, this.actionT / 0.35);
      if (this.petId !== 'penny') {
        // leap along a collision-checked path (never through walls or the house foundation)
        this.px = this.counterFrom.x + (this.counterTo.x - this.counterFrom.x) * u;
        this.pz = this.counterFrom.z + (this.counterTo.z - this.counterFrom.z) * u;
        this.py = groundHeight(this.px, this.pz);
        p.leap = u;
      } else {
        p.bark = 1;
        p.proud = 0.5;
      }
      this.heading = Math.atan2(this.bab.x - this.px, this.bab.z - this.pz);
      p.speed = 0;
      if (this.actionT >= 0.55) {
        this.action = 'free';
        p.proud = 0;
        inp.requireFreshSpace();
      }
      this.syncPetTransform(dt);
      return;
    }

    // ---------------- free movement
    const ar = inp.arrows();
    const sig = inp.arrowSignature();
    if (sig !== this.arrowSig) {
      // forward alone keeps going the way the pet faces; other combos are relative to the view
      if (sig === 'u' && this.speed > 0.5 && Math.abs(angDiff(this.heading, this.fcam.yaw)) < 1.6) this.capturedYaw = this.heading;
      else this.capturedYaw = this.fcam.yaw;
      this.arrowSig = sig;
    }
    let mx = 0;
    let mz = 0;
    if (ar.x || ar.y) {
      const yaw = this.capturedYaw;
      const fx = Math.sin(yaw);
      const fz = Math.cos(yaw);
      mx = fx * ar.y - Math.cos(yaw) * ar.x;
      mz = fz * ar.y + Math.sin(yaw) * ar.x;
      const l = Math.hypot(mx, mz);
      mx /= l;
      mz /= l;
    }

    // Space context priority
    const nearBasket = Math.hypot(this.px - BASKET.x, this.pz - BASKET.z) < BASKET_RANGE && this.py > FLOOR - 0.1;
    const nearDoor = this.explore && Math.hypot(this.px - FRONT_DOOR.xc, this.pz + 0.45) < 0.9;
    const stick = !this.carry ? this.stickHere() : null;
    if (inp.justPressed('space')) {
      if (this.bab.canCounter(this.px, this.pz)) {
        this.doCounter();
      } else if (this.bab.boss && this.bab.active && this.hopT < 0 && this.py < 0.3) {
        this.hopT = 0; // hop over the shockwave
        this.audio.whoosh();
      } else if (this.carry && nearBasket) {
        this.action = 'deposit';
        this.actionT = 0;
        this.heading = Math.atan2(BASKET.x - this.px, BASKET.z - this.pz);
      } else if (nearDoor) {
        this.toTitle();
        return;
      } else if (this.bab.boss && this.bab.active) {
        // boss fight: no hunting, no sticks — focus on him
      } else if (stick) {
        this.pickStick(stick);
      } else if (!this.carry) {
        this.stalking = true;
      }
    }
    if (this.stalking && (!inp.held('space') || this.carry)) {
      // release: pounce if close enough
      const t = this.target;
      if (inp.justReleased('space') && t && Math.hypot(t.x - this.px, t.z - this.pz) <= S.pounceRange && (t.state === 'idle' || t.state === 'walk')) {
        this.startPounce(t);
        this.stalking = false;
        this.syncPetTransform(dt);
        return;
      }
      this.stalking = false;
    }

    const maxSpeed = (this.stalking ? S.stalkSpeed : S.runSpeed) * inp.moveScale();
    const accel = 10;
    this.vx += (mx * maxSpeed - this.vx) * Math.min(1, accel * dt);
    this.vz += (mz * maxSpeed - this.vz) * Math.min(1, accel * dt);
    const r = moveActor(this.px, this.pz, this.vx * dt, this.vz * dt, S.radius);
    const realV = Math.hypot(r.x - this.px, r.z - this.pz) / Math.max(dt, 1e-4);
    this.px = r.x;
    this.pz = r.z;
    this.py = r.y;
    this.speed = Math.min(Math.hypot(this.vx, this.vz), realV + 0.3);
    if (Math.hypot(this.vx, this.vz) > 0.15) {
      const want = Math.atan2(this.vx, this.vz);
      const d = angDiff(want, this.heading);
      const turn = S.turnRate * dt;
      this.heading += Math.max(-turn, Math.min(turn, d));
      p.turn = d;
    } else p.turn = 0;

    // animation params
    const nearFlap = Math.abs(this.px - FLAP.x) < 0.42 && Math.abs(this.pz - FLAP.zc) < 0.4 && this.py > FLOOR - 0.1;
    p.speed = this.speed;
    p.crouch = this.stalking ? 1 : nearFlap ? 0.85 : 0;
    p.carry = this.carry ? 1 : 0;
    p.gait = this.speed > 2.4 ? 'bound' : this.speed > 1.3 ? 'trot' : 'walk';
    p.tailMood = this.stalking ? 0.1 : this.carry ? 1 : 0.65;
    p.dizzy = 0;

    // noise / bell
    const moving = this.speed > 0.4;
    this.bellActive = false;
    if (this.stalking) this.noiseR = S.stalkNoise;
    else if (moving) {
      this.noiseR = S.runNoise;
      if (S.bell && this.speed > 1.6) {
        this.noiseR = Math.max(S.runNoise, S.bellRadius);
        this.bellActive = true;
        this.bellT -= dt;
        if (this.bellT <= 0) {
          this.bellT = 0.3;
          this.audio.bell();
          this.spawnBellRing();
        }
      }
    } else this.noiseR = 0.45;
    this.pet.bellRing = this.bellActive ? 1 : 0;

    // footsteps
    this.stepDist += this.speed * dt;
    const stride = this.petId === 'penny' ? 0.16 : 0.3;
    if (this.stepDist > stride) {
      this.stepDist = 0;
      this.audio.footstep(surfaceType(this.px, this.pz), this.stalking ? 0.3 : 1);
    }

    // Babadook ambush check on return trips by the stairs
    const zone = this.py < 0.25 && Math.hypot(this.px - STAIR_FOOT.x, this.pz - STAIR_FOOT.z) < BABADOOK.triggerRadius;
    if (zone && !this.inStairZone && this.carry && !this.bab.active && !this.explore) {
      if (this.scheduler.check(this.elapsed, this.ledger.acquiredCount, true)) this.startEncounter();
    }
    this.inStairZone = zone;

    this.syncPetTransform(dt);
  }

  private syncPetTransform(dt: number) {
    const target = this.py;
    const dy = target - this.pyVis;
    this.pyVis += dy * Math.min(1, dt * 16);
    if (Math.abs(dy) > 0.25) this.pyVis = target;
    let hop = 0;
    if (this.hopT >= 0) {
      this.hopT += dt;
      const u = this.hopT / 0.55;
      hop = Math.sin(Math.min(1, u) * Math.PI) * 0.34;
      this.pet.p.leap = Math.min(1, u);
      if (u >= 1) this.hopT = -1;
    }
    this.bab.petAirborne = hop > 0.12;
    this.pet.root.position.set(this.px, this.pyVis + hop, this.pz);
    this.pet.root.rotation.y = this.heading;
  }

  // ---------------- the snake ending's explosion: hide the house (and everything in it), show the crater
  private nukeList: THREE.Object3D[] = [];
  private hideHouseForNuke() {
    if (!this.nukeList.length) this.collectHouseForNuke();
    this.hiddenForNuke = [];
    for (const o of this.nukeList) {
      if (!o.visible) continue;
      o.visible = false;
      this.hiddenForNuke.push(o);
    }
  }
  private collectHouseForNuke() {
    this.nukeList = [];
    const box = new THREE.Box3();
    const c = new THREE.Vector3();
    for (const o of this.scene.children) {
      if (!o.visible || o === this.nuke.group || (o as THREE.Light).isLight) continue;
      if (o.name === 'yard' || o.name === 'backlot' || o === this.world.car.group) continue;
      box.setFromObject(o);
      if (box.isEmpty() || box.getSize(c).length() > 40) continue;
      box.getCenter(c);
      const inHouse = c.x > HOUSE.x0 - 3.6 && c.x < LOT.x1 + 1.2 && c.z < HOUSE.z0 + 1.5 && c.z > HOUSE.z1 - 0.8 && c.y < 6;
      if (inHouse || o.name === 'house' || o.name === 'deck-props') this.nukeList.push(o);
    }
  }
  private restoreHouse() {
    for (const o of this.hiddenForNuke) o.visible = true;
    this.hiddenForNuke = [];
    this.nuke.stop();
    this.ui.setFlash(0);
    this.world.hemi.intensity = 1.05;
    this.world.hemi.color.set('#d7e8ff');
  }

  private spawnBellRing() {
    const r = this.bellRings.find((m) => !m.visible) ?? this.bellRings[0];
    r.visible = true;
    r.userData.t = 0;
    const neck = new THREE.Vector3();
    (this.pet.bell ?? this.pet.head).getWorldPosition(neck);
    r.position.copy(neck);
    r.lookAt(this.fcam.cam.position);
  }

  private updateBellRings(dt: number) {
    for (const r of this.bellRings) {
      if (!r.visible) continue;
      r.userData.t += dt;
      const t = r.userData.t as number;
      r.scale.setScalar(1 + t * 5);
      (r.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.9 - t * 1.8);
      if (this.pet.bell) {
        const p = new THREE.Vector3();
        this.pet.bell.getWorldPosition(p);
        r.position.copy(p);
      }
      r.lookAt(this.fcam.cam.position);
      if (t > 0.5) r.visible = false;
    }
  }

  // ---------------- hunting
  private startPounce(t: WildPrey) {
    this.action = 'pounce';
    this.actionT = 0;
    this.catchPrey = t;
    t.state = 'pounced';
    this.pounceFrom.set(this.px, this.py, this.pz);
    const dx = t.x - this.px;
    const dz = t.z - this.pz;
    const d = Math.hypot(dx, dz) || 1;
    const stop = this.S.radius + 0.12;
    this.pounceTo.set(t.x - (dx / d) * stop, 0, t.z - (dz / d) * stop);
    // keep the landing spot legal
    const r = moveActor(this.px, this.pz, this.pounceTo.x - this.px, this.pounceTo.z - this.pz, this.S.radius);
    this.pounceTo.set(r.x, r.y, r.z);
    this.heading = Math.atan2(dx, dz);
    this.audio.pounce();
    this.wildlife.targetRing.visible = false;
  }

  private beginCatch() {
    const prey = this.catchPrey!;
    this.action = 'catch';
    this.actionT = 0;
    this.catchSim = newCatch(prey.kind, this.petId);
    this.ledger.noteAttempt();
    this.ui.showCatch(prey.kind, this.S.zoneWidth, `Catch the ${prey.kind}!`);
    this.input.requireFreshSpace();
  }

  private stepCatchGame(dt: number) {
    const c = this.catchSim!;
    const prey = this.catchPrey!;
    stepCatch(c, dt, this.input.held('space'), this.rng);
    this.ui.updateCatch(c.zone, this.S.zoneWidth, c.marker, c.progress, c.overlap, 1 - c.t / CATCH.timeLimit, c.t < 0.5);
    // tussle animation: pet wiggles over the prey, prey squirms
    const p = this.pet.p;
    p.crouch = 1;
    p.wiggle = 0.7;
    p.speed = 0;
    p.lookPitch = 0.35;
    prey.model.pose = 'carried';
    prey.model.root.position.set(prey.x + Math.sin(this.simTime * 13) * 0.03, 0, prey.z + Math.cos(this.simTime * 11) * 0.03);
    if (c.result === 'running') return;
    p.lookPitch = 0;
    p.wiggle = 0;
    const won = c.result === 'caught' && this.ledger.acquire(prey.id);
    this.ui.endCatch(won);
    this.catchSim = null;
    this.catchPrey = null;
    this.action = 'free';
    this.input.requireFreshSpace();
    if (won) {
      this.audio.caught();
      prey.state = 'carried';
      prey.marker.visible = false;
      this.carry = { kind: prey.kind, id: prey.id, prey };
      this.attachToMouth(prey.model.root, prey.kind);
      this.ui.toast(`Got a ${prey.kind}! Bring it home to the basket.`, 'good');
    } else {
      this.audio.escaped();
      this.wildlife.escapeFromPounce(prey, this.px, this.pz);
      this.ui.toast(`The ${prey.kind} got away!`, 'bad');
    }
  }

  private attachToMouth(obj: THREE.Object3D, kind: PresentKind) {
    const mouth = this.pet.mouth;
    mouth.add(obj);
    obj.position.set(0, kind === 'stick' ? 0 : -0.02, kind === 'stick' ? 0.0 : 0.01);
    obj.rotation.set(0, kind === 'stick' ? 0 : Math.PI / 2, kind === 'stick' ? 0 : 0.3);
    const s = kind === 'squirrel' ? 0.8 : kind === 'stick' ? 0.85 : kind === 'snake' ? 1.0 : 1;
    obj.scale.setScalar(s / this.pet.root.scale.x);
    if (kind === 'snake') {
      // held just behind the head; the body drapes down and trails along the ground, still writhing
      obj.position.set(0, -0.01, 0.03);
      obj.rotation.set(-0.35, Math.PI * 0.5, 0);
    } else if (kind !== 'stick') {
      obj.position.y = -0.03;
      obj.rotation.set(-0.2, Math.PI / 2, -0.9); // dangling sideways, held gently by the scruff
    }
  }

  /** A stick Space would grab right now. Cats prefer sneaking when an animal is close, so a stick
   *  lying near a mouse never steals the stalk; Penny always grabs (sticks are her main thing). */
  private stickHere(): Stick | null {
    if (!this.S.canPickSticks || this.stalking) return null;
    const s = this.wildlife.nearestStick(this.px, this.pz, POPULATION.stickPickRange);
    if (!s) return null;
    if (this.petId !== 'penny' && this.py < 0.3 && this.wildlife.findTarget(this.px, this.pz, this.heading, 3.5)) return null;
    return s;
  }

  private pickStick(s: Stick) {
    if (!this.ledger.acquire(s.id)) return;
    s.state = 'carried';
    this.carry = { kind: 'stick', id: s.id, stick: s };
    this.attachToMouth(s.mesh, 'stick');
    this.action = 'pickup';
    this.actionT = 0;
    this.audio.stickPick();
    this.ui.toast('Stick! Bring it home to the basket.', 'good');
  }

  private completeDeposit() {
    const c = this.carry!;
    const { points } = this.ledger.deposit();
    this.carry = null;
    if (c.prey) this.wildlife.deliver(c.prey);
    if (c.stick) this.wildlife.depositStick(c.stick);
    if (this.explore) {
      this.ui.toast(`Delivered a ${KIND_NAME[c.kind]}!`, 'good');
      this.audio.deposit(pointsFor(this.petId, c.kind));
    } else if (points > 0) {
      this.ui.toast(`+${points} ${cap(KIND_NAME[c.kind])}!`, 'pts');
      this.ui.bumpScore();
      this.audio.deposit(points);
    }
  }

  // ---------------- Babadook
  private startEncounter() {
    const boss = this.hard && !this.bossDone;
    if (boss) this.bab.startBoss(this.S, this.px, this.pz, this.rng);
    else this.bab.start(this.S, this.px, this.pz);
    this.bab.hold = true;
    this.revealT = REVEAL_TIME;
    this.action = 'free';
    this.vx = this.vz = 0;
    this.ledger.encounterStarted();
    this.audio.sting();
    this.audio.hiss();
    this.stalking = false;
    this.ui.showBanner(boss ? 'BOSS FIGHT<br><small>The Babadook</small>' : 'Babadook!', 'mom', 2300);
    if (boss) {
      this.ui.showBoss(this.bab.hp, this.bab.hpMax, 'Dodge his lunges, then pounce while he’s dizzy');
      this.audio.startMusic(true);
    }
  }

  private doCounter() {
    if (!this.bab.counter()) return;
    this.action = 'counter';
    this.actionT = 0;
    this.counterFrom.set(this.px, 0, this.pz);
    const dx = this.bab.x - this.px;
    const dz = this.bab.z - this.pz;
    const d = Math.hypot(dx, dz) || 1;
    const reach = Math.max(0, d - 0.35);
    const r = moveActor(this.px, this.pz, (dx / d) * reach, (dz / d) * reach, this.S.radius);
    this.counterTo.set(r.x, r.y, r.z);
    if (this.petId === 'penny') this.audio.bark();
    else this.audio.pounce();
  }

  private updateEncounter(dt: number) {
    if (!this.bab.active) return;
    const ev = this.bab.update(dt, this.px, this.py, this.pz);
    if (ev === 'hit') {
      this.audio.thud();
      this.action = 'hit';
      this.actionT = 0;
      const dx = this.px - this.bab.x;
      const dz = this.pz - this.bab.z;
      const d = Math.hypot(dx, dz) || 1;
      this.vx = (dx / d) * 2.5;
      this.vz = (dz / d) * 2.5;
      this.stalking = false;
      const c = this.carry;
      if (c) {
        this.ledger.dropCarried(true);
        this.carry = null;
        if (c.prey) this.wildlife.release(c.prey, this.px, this.pz);
        if (c.stick) this.wildlife.dropStick(c.stick, this.px - (dx / d) * 0.6, this.pz - (dz / d) * 0.6);
        this.ui.toast(c.kind === 'stick' ? 'Babadook knocked the stick away!' : `Babadook made you drop the ${c.kind}!`, 'bad');
      }
    } else if (ev === 'dodged') {
      this.audio.whoosh();
      this.ui.toast(this.petId === 'penny' ? 'Dodged! Now BARK — press Space!' : 'Dodged! He’s dizzy — pounce with Space!', 'good');
    } else if (ev === 'victory') {
      this.ledger.encounterWon();
      this.audio.victory();
      this.ui.toast('Babadook fled back under the house!', 'good');
    } else if (ev === 'timeout') {
      this.ui.toast(this.bab.boss ? 'Too slow — he shook it off!' : 'Babadook slinks off…');
    } else if (ev === 'bossHurt') {
      this.audio.victory();
      const left = this.bab.hp;
      const phase = this.bab.phase;
      this.ui.toast(left === 1 ? 'One more hit!' : `Hit! ${left} to go`, 'good');
      this.ui.showBoss(left, this.bab.hpMax, phase === 2 ? 'He’s angry: double lunges and shockwaves — jump them with Space!' : phase === 3 ? 'Last hit! Watch for fake-outs: wait for the arrow to lock' : '');
    } else if (ev === 'bossDefeated') {
      this.bossDone = true;
      this.ledger.encounterWon();
      this.audio.victory();
      this.audio.hiss();
      this.ui.showBoss(0, this.bab.hpMax, '');
      this.ui.showBanner('You beat the Babadook!', 'mom', 2600);
      setTimeout(() => this.ui.hideBoss(), 1600);
      this.audio.startMusic(this.timeLeft <= MOM_WARNING_AT);
    } else if (ev === 'bossEscaped') {
      this.bossDone = true;
      this.ui.hideBoss();
      this.ui.toast('Babadook got bored and slunk back under the house…');
      this.audio.startMusic(this.timeLeft <= MOM_WARNING_AT);
    } else if (ev === 'done' && this.bab.boss === false && this.bossDone) {
      this.ui.hideBoss();
    } else if (ev === 'ringStart') {
      this.audio.rumble();
    } else if (ev === 'ringDodged') {
      this.ui.toast('Jumped it!', 'good');
    } else if (ev === 'ringHit') {
      this.audio.thud();
      this.action = 'hit';
      this.actionT = 0;
      const dx = this.px - this.bab.x;
      const dz = this.pz - this.bab.z;
      const d = Math.hypot(dx, dz) || 1;
      this.vx = (dx / d) * 3;
      this.vz = (dz / d) * 3;
      this.stalking = false;
      this.ui.toast('The shockwave knocked you flying! Press Space to jump it', 'bad');
    } else if (ev === 'feint') {
      this.audio.hiss();
    }
  }

  // ---------------- camera & HUD
  private updateCamera(dt: number) {
    this.fcam.frozenYaw = this.bab.active && this.bab.state !== 'retreat' && this.bab.state !== 'flee';
    const catching = this.action === 'catch' || this.action === 'pounce';
    this.fcam.update(dt, this.px, this.pyVis, this.pz, this.heading, catching ? 0 : this.speed);
    if (this.revealT > 0) {
      // cinematic close-up on Babadook, blended in and out of the follow camera
      const e = REVEAL_TIME - this.revealT;
      const ss = (a: number, b: number, x: number) => {
        const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
        return t * t * (3 - 2 * t);
      };
      const w = ss(0, 0.55, e) * (1 - ss(REVEAL_TIME - 0.5, REVEAL_TIME, e));
      const cam = this.fcam.cam;
      const followPos = cam.position.clone();
      const followLook = followPos.clone().add(cam.getWorldDirection(new THREE.Vector3()).multiplyScalar(2));
      const bx = this.bab.x;
      const bz = this.bab.z;
      let dx = this.px - bx;
      let dz = this.pz - bz;
      const d = Math.hypot(dx, dz) || 1;
      dx /= d;
      dz /= d;
      // stand between him and the pet, a little to the side, low and close, looking into his face
      const sideX = -dz;
      const sideZ = dx;
      const cinePos = new THREE.Vector3(bx + dx * 1.15 + sideX * 0.45, 0.42 + e * 0.03, bz + dz * 1.15 + sideZ * 0.45);
      const clear = cameraClear(bx, 0.3, bz, cinePos.x, cinePos.y, cinePos.z);
      cinePos.set(bx + (cinePos.x - bx) * clear, cinePos.y, bz + (cinePos.z - bz) * clear);
      const cineLook = new THREE.Vector3(bx + dx * 0.1, 0.24, bz + dz * 0.1);
      cam.position.lerpVectors(followPos, cinePos, w);
      cam.lookAt(followLook.lerp(cineLook, w));
    }
    if (this.peteT >= 0) {
      // Postal Pete: push in on his face over the fence, then a wide shot of the side of the yard he emptied
      const t = this.peteT;
      const S = PETE_SCENE;
      const sm = (a: number, b: number, x: number) => {
        const u = Math.max(0, Math.min(1, (x - a) / (b - a)));
        return u * u * (3 - 2 * u);
      };
      const cam = this.fcam.cam;
      const followPos = cam.position.clone();
      const followLook = followPos.clone().add(cam.getWorldDirection(new THREE.Vector3()).multiplyScalar(2));
      const head = this.neighbors.peteHead();
      const push = sm(S.rise1, S.line1, t);
      // low and close on our side of the fence, looking up into his face; a slow creep closer while he talks
      const closePos = new THREE.Vector3(PETE.x + 1.55 - push * 0.45, 1.9 + push * 0.06, PETE.z + 0.42 - push * 0.15);
      const closeLook = new THREE.Vector3(head.x, Math.max(1.85, head.y - 0.02), head.z);
      const widePos = new THREE.Vector3(9.6, 6.8, -10.8);
      const wideLook = new THREE.Vector3(-0.8, 0.0, -13.2);
      const wide = sm(S.wide0, S.wide0 + 0.6, t);
      const shotPos = closePos.clone().lerp(widePos, wide);
      const shotLook = closeLook.clone().lerp(wideLook, wide);
      const w = sm(0, 0.6, t) * (1 - sm(S.total - 0.6, S.total, t));
      cam.position.lerpVectors(followPos, shotPos, w);
      cam.lookAt(followLook.lerp(shotLook, w));
      followSun(this.world, -1, -13);
    } else followSun(this.world, this.px, this.pz);
    // fade the kitchen door / obstructing furniture when it sits between camera and pet
    const cp = this.fcam.cam.position;
    const doorBetween = (cp.x > 0) !== (this.px > 0) && Math.abs(cp.z - FLAP.zc) < 1.2 && Math.abs(this.pz - FLAP.zc) < 1.5;
    for (const m of this.world.house.kitchenDoorMeshes) {
      const mat = m.material as THREE.MeshStandardMaterial;
      const want = doorBetween ? 0.18 : 1;
      mat.opacity += (want - mat.opacity) * Math.min(1, dt * 10);
      mat.depthWrite = mat.opacity > 0.95;
    }
    this.fadeFurniture(dt);
  }

  private ray = new THREE.Raycaster();
  private fadeFurniture(dt: number) {
    const cp = this.fcam.cam.position;
    const target = new THREE.Vector3(this.px, this.pyVis + 0.2, this.pz);
    const dir = target.clone().sub(cp);
    const len = dir.length();
    dir.normalize();
    this.ray.set(cp, dir);
    this.ray.far = len - 0.15;
    for (const f of this.world.interior.fadeables) {
      const hit = this.ray.intersectObject(f.obj, true).length > 0;
      const want = hit ? 0.25 : 1;
      if (Math.abs(f.opacity - want) < 0.01) continue;
      f.opacity += (want - f.opacity) * Math.min(1, dt * 10);
      for (const m of f.mats) {
        m.transparent = f.opacity < 0.99;
        (m as THREE.MeshStandardMaterial).opacity = f.opacity;
        m.depthWrite = f.opacity > 0.9;
      }
    }
  }

  private prompt(): string {
    const S = this.S;
    if (this.action === 'catch') return '';
    if (this.action === 'hit') return 'Oof!';
    if (this.peteT >= 0) return '';
    if (this.bab.active && this.bab.boss) {
      if (this.revealT > 0) return 'Get ready…';
      const st = this.bab.state;
      if (st === 'bring' || this.bab.rings.length) return 'Shockwave! Press <kbd>Space</kbd> to jump it as it reaches you';
      if (st === 'dizzy') return this.bab.canCounter(this.px, this.pz) ? (this.petId === 'penny' ? '<kbd>Space</kbd> Bark at him!' : '<kbd>Space</kbd> Pounce on him!') : 'He’s dizzy — get closer and hit him!';
      if (st === 'windup' || st === 'lunge') return 'Dodge the arrow! <kbd>←</kbd><kbd>→</kbd>';
      if (st === 'bdefeat') return '';
      return 'Keep moving… watch him';
    }
    if (this.bab.active) {
      if (this.revealT > 0) return 'Get ready…';
      if (this.bab.state === 'emerge' || this.bab.state === 'windup' || this.bab.state === 'lunge') return 'Dodge the arrow! <kbd>←</kbd><kbd>→</kbd>';
      if (this.bab.state === 'dizzy')
        return this.bab.canCounter(this.px, this.pz) ? (this.petId === 'penny' ? '<kbd>Space</kbd> Bark at Babadook!' : '<kbd>Space</kbd> Pounce on Babadook!') : 'He’s dizzy — get closer!';
    }
    const nearBasket = Math.hypot(this.px - BASKET.x, this.pz - BASKET.z) < BASKET_RANGE && this.py > FLOOR - 0.1;
    if (this.explore && Math.hypot(this.px - FRONT_DOOR.xc, this.pz + 0.45) < 0.9) return '<kbd>Space</kbd> Stop exploring';
    if (this.carry) return nearBasket ? '<kbd>Space</kbd> Drop it in the basket' : 'Bring it home to the basket!';
    if (!this.stalking && this.stickHere()) return `<kbd>Space</kbd> Grab the stick (${S.stickPoints} pt${S.stickPoints === 1 ? '' : 's'})`;
    if (this.stalking) {
      const t = this.target;
      if (!t) return 'Sneaking… no animal nearby';
      return Math.hypot(t.x - this.px, t.z - this.pz) <= S.pounceRange ? 'Release <kbd>Space</kbd> to pounce!' : `Creep closer to the ${t.kind}…`;
    }
    const near = this.wildlife.findTarget(this.px, this.pz, this.heading, S.bell ? 7 : 5);
    if (near && this.py < 0.3) {
      if (this.bellActive) return 'Your bell is jingling! Hold <kbd>Space</kbd> to sneak quietly';
      return `Hold <kbd>Space</kbd> to sneak up on the ${near.kind}`;
    }
    if (insideHouse(this.px, this.pz) && this.elapsed < 25 && !this.explore) return 'Head out the doggy door in the kitchen!';
    return '';
  }

  private updateHud() {
    const score = this.explore ? null : this.ledger.stats.score;
    this.ui.setHud(this.explore ? null : this.timeLeft, score, this.carry ? this.carry.kind : null, this.prompt(), this.explore ? 'Exploring · walk to the front door to leave' : '');
  }

  // ---------------- dog flap, chaos, car
  private updateFlap(dt: number) {
    const f = this.world.house.flap;
    const near = Math.abs(this.px - FLAP.x) < 0.3 && Math.abs(this.pz - FLAP.zc) < 0.3 && (this.mode === 'play');
    let target = 0;
    if (near) {
      target = Math.max(-1.25, Math.min(1.25, (this.vx >= 0 ? 1 : -1) * 1.2));
      if (this.flapCD <= 0 && this.speed > 0.3) {
        this.audio.flap();
        this.flapCD = 0.8;
      }
    }
    this.flapCD -= dt;
    const acc = (target - this.flapAngle) * 60 - this.flapVel * 6;
    this.flapVel += acc * dt;
    this.flapAngle += this.flapVel * dt;
    f.rotation.z = this.flapAngle;
  }

  private updateChaos(dt: number) {
    const st = this.ledger.stats;
    const level = st.delivered.mouse + st.delivered.chipmunk + st.delivered.bird + st.delivered.squirrel + st.delivered.snake * 2 + Math.floor(st.delivered.stick / 3);
    for (const c of this.world.interior.chaos) {
      const want = level >= c.stage ? 1 : 0;
      if (c.t === want) continue;
      c.t += (want > c.t ? 1 : -1) * dt * 3;
      c.t = Math.max(0, Math.min(1, c.t));
      const e = c.t * c.t * (3 - 2 * c.t);
      c.obj.position.lerpVectors(c.from.p, c.to.p, e);
      c.obj.rotation.set(c.from.r.x + (c.to.r.x - c.from.r.x) * e, c.from.r.y + (c.to.r.y - c.from.r.y) * e, c.from.r.z + (c.to.r.z - c.from.r.z) * e);
      if (c.show) c.obj.visible = c.t > 0.05;
    }
  }

  private updateCar(dt: number) {
    if (this.carT < 0) return;
    const dur = MOM_WARNING_AT - 4;
    this.carT = Math.min(dur, this.carT + dt);
    const u = this.carT / dur;
    const e = 1 - Math.pow(1 - u, 2.2);
    const pos = this.carCurve.getPointAt(e);
    const tan = this.carCurve.getTangentAt(Math.min(0.999, e));
    const g = this.world.car.group;
    const prev = g.position.clone();
    g.position.copy(pos);
    g.rotation.y = Math.atan2(tan.x, tan.z);
    const moved = prev.distanceTo(pos);
    for (const w of this.world.car.wheels) w.rotation.x += moved / 0.37;
    const near = Math.max(0, 1 - Math.hypot(pos.x - this.px, pos.z - this.pz) / 30);
    this.audio.carUpdate(1 - u, near);
    if (this.carT >= dur && !this.endingFlags.parked) {
      this.endingFlags.parked = true;
      this.audio.carStop();
    }
  }

  private setFrontDoorCollider(closed: boolean) {
    for (const b of boxes) if (b.tag === 'frontdoor') b.maxY = closed ? CEIL : -1;
  }

  // ================================================================ ending
  private startEnding() {
    this.setMode('ending');
    this.endingT = 0;
    this.endingFlags = { parked: this.endingFlags.parked ?? false };
    this.ledger.close(); // nothing can score from here on
    // resolve anything in progress
    if (this.catchSim) {
      this.ui.endCatch(false);
      this.catchSim = null;
    }
    if (this.catchPrey) {
      this.wildlife.escapeFromPounce(this.catchPrey, this.px, this.pz);
      this.catchPrey = null;
    }
    this.snakeEnd = this.hard && (this.ledger.stats.delivered.snake > 0 || (this.carry?.kind === 'snake' && insideHouse(this.px, this.pz)));
    this.wildlife.freezeAll();
    this.bab.cancel();
    this.bab.hold = false;
    this.revealT = 0;
    this.peteT = -1;
    this.ui.hideBoss();
    this.ui.hideCaption();
    if (this.carry) {
      if (this.carry.prey) {
        this.carry.prey.model.root.removeFromParent();
        this.carry.prey.state = 'gone';
      }
      if (this.carry.stick) this.wildlife.dropStick(this.carry.stick, this.px, this.pz);
      this.carry = null;
    }
    this.action = 'free';
    this.stalking = false;
    this.basketMarker.visible = false;
    this.audio.stopMusic();
    this.ui.showHud(false);
    this.ui.fade(true, 500);
    this.lastStats = JSON.parse(JSON.stringify(this.ledger.stats));
  }

  private stepEnding(dt: number) {
    this.endingT += dt;
    const t = this.endingT;
    const F = this.endingFlags;
    if (t > 0.55 && !F.staged) {
      F.staged = true;
      // finish Mom's arrival off-screen if needed and stage the tableau (an intentional cut)
      const g = this.world.car.group;
      g.visible = true;
      g.position.copy(this.carCurve.getPointAt(1));
      g.rotation.y = Math.PI;
      this.audio.carStop();
      this.setPlayerPose(BASKET.x - 0.6, BASKET.z + 0.5, -0.14); // beside the basket, facing the front door
      this.pet.p = { ...this.pet.p, sit: 1, proud: 1, speed: 0, crouch: 0, carry: 0, leap: -1, hit: 0, dip: 0, tailMood: 1, lookYaw: 0 };
      this.wildlife.stageTableau();
      // from beside the coffee table, looking past the basket at the front door as it opens
      this.fcam.set(BASKET.x + 1.0, FLOOR + 0.9, BASKET.z - 0.8, BASKET.x - 0.65, FLOOR + 0.3, BASKET.z + 1.35);
      this.ui.fade(false, 500);
    }
    if (t > 1.3 && !F.door) {
      F.door = true;
      this.audio.doorOpen();
      this.setFrontDoorCollider(false);
    }
    if (F.door) {
      const u = Math.min(1, (t - 1.3) / 0.8);
      this.world.house.frontDoor.rotation.y = (u * u * (3 - 2 * u)) * 1.45;
      this.doorLight.intensity = u * 14;
      (this.momShadow.material as THREE.MeshBasicMaterial).opacity = u * 0.72;
    }
    if (this.snakeEnd) {
      this.stepSnakeEnding(dt, t);
      return;
    }
    // Mom's real recorded lines: always for Darrow and Penny, and for Rufus when he brought an animal home.
    // They replace the synthetic shout and the generated caption line.
    const momReal = this.petId !== 'rufus' || animalsDelivered(this.lastStats!) > 0;
    if (t > (momReal ? 1.75 : 2.0) && !F.shout) {
      F.shout = true;
      const name = PETS[this.petId].name.toUpperCase();
      this.ui.showCaption(`${name}!`);
      F.real = momReal && this.audio.clip(this.petId);
      if (!F.real) this.audio.shout(name);
      this.pet.p.lookYaw = 0.9;
    }
    if (t > 3.1 && !F.line) {
      F.line = true;
      if (!F.real) this.ui.showCaption(`${PETS[this.petId].name.toUpperCase()}!`, momLine(this.lastStats!));
    }
    // delivered animals keep the party going
    this.wildlife.update(dt, { x: -99, z: -99, y: 0, noiseR: 0, bell: false }, false);
    if ((t > 5.6 || (t > 1.2 && this.input.justPressed('space'))) && !F.results) {
      F.results = true;
      this.finishRun();
    }
  }

  /** Mom opens the door, sees the king cobra in her living room… and the house goes up like a bomb. */
  private stepSnakeEnding(dt: number, t: number) {
    const F = this.endingFlags;
    if (!F.warm && t > 0.6) {
      // do the expensive bits while we're still indoors: compile the blast's shaders, find what to hide
      F.warm = true;
      this.nuke.warm(this.renderer, this.fcam.cam);
      this.collectHouseForNuke();
    }
    if (t > 1.8 && !F.shout) {
      F.shout = true;
      if (!this.audio.clip('snake', 1.3)) this.audio.shout('SNAKE');
      this.pet.p.lookYaw = 0.9;
    }
    this.wildlife.update(dt, { x: -99, z: -99, y: 0, noiseR: 0, bell: false }, false);
    const S0 = 2.0 + Math.max(1.3, this.audio.clipDuration('snake')); // cut outside once she's said her piece
    if (t > S0 && !F.outside) {
      F.outside = true;
      this.ui.hideCaption();
      this.doorLight.intensity = 0;
      (this.momShadow.material as THREE.MeshBasicMaterial).opacity = 0;
    }
    const boomAt = S0 + 1.4;
    if (F.outside) {
      // exterior: across the street, looking back at the house; a slow push-in, then the shake
      const cx = (HOUSE.x0 + HOUSE.x1) / 2;
      const u = Math.min(1, (t - S0) / 1.4);
      const cam = this.fcam.cam;
      const back = t > boomAt ? Math.min(1, (t - boomAt) / 2.5) : 0;
      // from the far side of the street, off to the right of the big front oak, pulling back as it goes up
      cam.position.set(cx + 6.2 - u * 0.6 + back * 2.0, 2.0 + back * 2.2, 18.6 - u * 1.2 + back * 2.9);
      const sh = this.nuke.shake();
      cam.position.x += (Math.random() - 0.5) * sh;
      cam.position.y += (Math.random() - 0.5) * sh;
      cam.lookAt(cx, 2.4 + back * 8, -3.5);
      followSun(this.world, cx, 2);
    }
    if (t > boomAt && !F.boom) {
      F.boom = true;
      this.nuke.start();
      this.audio.boom();
    }
    if (F.boom) {
      this.ui.setFlash(this.nuke.flashAmount());
      const g = this.nuke.glow();
      this.world.hemi.intensity = 1.05 + g * 2.2;
      this.world.hemi.color.setRGB(0.84 + g * 0.16, 0.91 - g * 0.2, 1 - g * 0.55);
      if (this.nuke.crumbled && !F.gone) {
        F.gone = true;
        this.hideHouseForNuke();
      }
    }
    if (t > boomAt + 5.0 && !F.title) {
      F.title = true;
      this.ui.showCaption('GAME OVER', 'Snake Induced Detonation', 'mid');
    }
    if ((t > boomAt + 9.5 || (F.title && this.input.justPressed('space'))) && !F.results) {
      F.results = true;
      this.finishRun();
    }
  }

  private finishRun() {
    const s = this.lastStats!;
    const prev = this.store.loadRecords()[s.pet];
    this.lastPrevBest = prev ? prev.score : null;
    // blitz and hard mode scores aren't comparable to normal 3-minute records, so they aren't saved
    this.lastBest = this.ledger.ranked && !this.devTainted && !this.blitz && !this.hard ? this.store.submit(s) : false;
    this.restoreHouse();
    this.ui.hideCaption();
    this.setMode('results');
    this.renderMenu();
  }

  // ================================================================ render
  render() {
    this.renderer.render(this.scene, this.fcam.cam);
  }

  furLevel = 2;
  revealT = 0;
  setFurLevel(level: number) {
    this.furLevel = level;
    for (const id of PET_IDS) this.pets[id].setFurLevel(this.petId === id || this.mode === 'select' ? level : Math.min(level, 1));
    this.bab.model.setFurLevel(level);
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.fcam.cam.aspect = w / h;
    this.fcam.cam.updateProjectionMatrix();
  }

  /** Read-only snapshot for tests/dev tools. */
  snapshot() {
    return {
      mode: this.mode,
      pet: this.petId,
      x: this.px,
      y: this.py,
      z: this.pz,
      heading: this.heading,
      camYaw: this.fcam.yaw,
      action: this.action,
      stalking: this.stalking,
      carrying: this.carry?.kind ?? null,
      timeLeft: this.timeLeft,
      elapsed: this.elapsed,
      score: this.ledger.stats.score,
      stats: this.ledger.stats,
      acquired: this.ledger.acquiredCount,
      bab: this.bab.state,
      encounters: this.scheduler.encounters,
      delivered: this.wildlife.delivered.length,
      deliveredVisible: this.wildlife.delivered.filter((d) => d.model.root.visible && insideHouse(d.x, d.z)).length,
      catch: this.catchSim ? { zone: this.catchSim.zone, marker: this.catchSim.marker, markerTarget: this.catchSim.markerTarget, progress: this.catchSim.progress, t: this.catchSim.t, zoneVel: this.catchSim.zoneVel } : null,
      prey: this.wildlife.prey.map((p) => ({ id: p.id, kind: p.kind, x: p.x, z: p.z, y: p.y, state: p.state, alert: p.alert })),
      sticks: this.wildlife.sticks.filter((s) => s.state === 'ground').map((s) => ({ id: s.id, x: s.x, z: s.z })),
      endingT: this.endingT,
      hard: this.hard,
      peteT: this.peteT,
      peteDone: this.peteDone,
      fear: this.wildlife.fear,
      neighbor: this.neighbors.backPos(),
      neighborTalks: this.neighbors.talkedCount,
      bossHp: this.bab.boss ? this.bab.hp : null,
      bossDone: this.bossDone,
      snakeEnd: this.snakeEnd,
      lastStats: this.lastStats,
      lastBest: this.lastBest,
      menuIndex: this.menuIndex,
    };
  }
}

function cap(s: string) {
  return s[0].toUpperCase() + s.slice(1);
}

function animalsDelivered(s: RunStats): number {
  const d = s.delivered;
  return d.mouse + d.chipmunk + d.bird + d.squirrel + d.snake;
}

function momLine(s: RunStats): string {
  const d = s.delivered;
  if (totalDelivered(s) === 0) return '…oh. You were good today?';
  if (d.squirrel > 0) return 'Is that a SQUIRREL on my couch?!';
  if (d.bird > 0) return 'Why is there a BIRD on the TV?!';
  if (d.chipmunk > 0) return 'There is a CHIPMUNK in my living room!';
  if (d.mouse > 0 && d.stick === 0) return 'Mice. In. My. House.';
  if (d.mouse > 0) return 'Sticks AND mice?!';
  return 'Why is my living room full of STICKS?!';
}

function basketIcon() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(255,249,238,0.92)';
  g.beginPath();
  g.arc(64, 56, 46, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.moveTo(52, 98);
  g.lineTo(64, 122);
  g.lineTo(76, 98);
  g.fill();
  g.fillStyle = '#a8773f';
  g.beginPath();
  g.moveTo(34, 50);
  g.lineTo(94, 50);
  g.lineTo(86, 84);
  g.lineTo(42, 84);
  g.closePath();
  g.fill();
  g.strokeStyle = '#6b4a24';
  g.lineWidth = 3;
  for (let y = 58; y < 84; y += 8) {
    g.beginPath();
    g.moveTo(36, y);
    g.lineTo(92, y);
    g.stroke();
  }
  g.beginPath();
  g.arc(64, 50, 22, Math.PI, 0);
  g.lineWidth = 5;
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function momShadowTex() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 192;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(10,8,6,1)';
  // a long human shadow cast in from the doorway (feet at the top = the door)
  g.beginPath();
  g.ellipse(32, 172, 13, 15, 0, 0, Math.PI * 2); // head (far end)
  g.fill();
  g.beginPath();
  g.moveTo(14, 156);
  g.quadraticCurveTo(32, 150, 50, 156);
  g.lineTo(46, 70);
  g.lineTo(40, 6);
  g.lineTo(34, 6);
  g.lineTo(32, 64);
  g.lineTo(30, 6);
  g.lineTo(24, 6);
  g.lineTo(18, 70);
  g.closePath();
  g.fill();
  // handbag
  g.fillRect(48, 96, 10, 14);
  const t = new THREE.CanvasTexture(c);
  return t;
}

