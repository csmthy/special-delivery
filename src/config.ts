// All tunable balance values live here so they can be adjusted after playtesting.

export type PetId = 'darrow' | 'rufus' | 'penny';
export type PreyKind = 'mouse' | 'chipmunk' | 'bird' | 'squirrel' | 'snake';
export type PresentKind = PreyKind | 'stick';

export const RUN_SECONDS = 180;
export const BLITZ_SECONDS = 30; // the quick 'Blitz Round' from the title screen
export const MOM_WARNING_AT = 20;

export const POINTS: Record<PresentKind, number> = {
  mouse: 10,
  chipmunk: 20,
  bird: 25,
  squirrel: 40,
  snake: 50,
  stick: 5,
};

export interface PetStats {
  name: string;
  title: string;
  tagline: string;
  runSpeed: number; // m/s
  stalkSpeed: number;
  turnRate: number; // rad/s
  radius: number; // collision radius
  runNoise: number; // m, alert radius while running
  stalkNoise: number; // m, alert radius while stalking
  bell: boolean;
  bellRadius: number;
  pounceRange: number;
  zoneWidth: number; // catch zone width (fraction of track)
  catchGain: number; // progress per second while overlapping
  catchDrain: number; // progress per second while missing
  canPickSticks: boolean;
  stickPoints: number; // cats get 1 per stick, Penny the full 5
  // Babadook resistance
  dodgeLock: number; // seconds before lunge that aim locks (more = more forgiving)
  windup: number; // telegraph duration
  hitStun: number; // recovery after a hit
  dizzyTime: number; // counter window
  counterRange: number;
}

export const PETS: Record<PetId, PetStats> = {
  darrow: {
    name: 'Darrow',
    title: 'The Expert Hunter',
    tagline: 'Easier catches · Noisy when running',
    runSpeed: 3.7,
    stalkSpeed: 1.15,
    turnRate: 9,
    radius: 0.17,
    runNoise: 3.2,
    stalkNoise: 0.75,
    bell: true,
    bellRadius: 6.5,
    pounceRange: 1.3,
    zoneWidth: 0.39, // 30% smaller than the doubled 0.56 (owner request)
    catchGain: 0.37,
    catchDrain: 0.17,
    canPickSticks: true,
    stickPoints: 1,
    dodgeLock: 0.45,
    windup: 1.1,
    hitStun: 0.9,
    dizzyTime: 2.0,
    counterRange: 1.9,
  },
  rufus: {
    name: 'Rufus',
    title: 'The Rowdy Adventurer',
    tagline: 'Quiet approach · Faster running · Trickier catches',
    runSpeed: 4.4,
    stalkSpeed: 1.3,
    turnRate: 8,
    radius: 0.19,
    runNoise: 3.3,
    stalkNoise: 0.7,
    bell: false,
    bellRadius: 0,
    pounceRange: 1.25,
    zoneWidth: 0.42,
    catchGain: 0.35,
    catchDrain: 0.18,
    canPickSticks: true,
    stickPoints: 1,
    dodgeLock: 0.45,
    windup: 1.1,
    hitStun: 0.9,
    dizzyTime: 2.0,
    counterRange: 1.9,
  },
  penny: {
    name: 'Penny',
    title: 'The Stick Specialist',
    tagline: 'Easy stick presents · Stands up to Babadook · Very difficult animal catches',
    runSpeed: 3.5,
    stalkSpeed: 1.0,
    turnRate: 7,
    radius: 0.2,
    runNoise: 3.8,
    stalkNoise: 0.85,
    bell: false,
    bellRadius: 0,
    pounceRange: 1.15,
    zoneWidth: 0.28,
    catchGain: 0.31,
    catchDrain: 0.19,
    canPickSticks: true,
    stickPoints: 5,
    dodgeLock: 0.7,
    windup: 1.45,
    hitStun: 0.45,
    dizzyTime: 3.0,
    counterRange: 2.5,
  },
};

// Catching minigame
export const CATCH = {
  startProgress: 0.22,
  settle: 0.5, // seconds the zone is held centered at the start
  timeLimit: 17, // finite attempt length (doubled at the owner's request)
  accelUp: 2.6, // track-widths / s^2 while holding Space
  accelDown: 2.2, // while released
  damping: 1.6,
  bounce: 0.35,
};

export interface PreyMotion {
  speed: number; // marker speed (track/s)
  retargetMin: number;
  retargetMax: number;
  burst: number; // 0 = smooth, >0 = dart-and-pause behaviour
  pauseMin: number;
  pauseMax: number;
  span: number; // how far the marker roams from current spot
}

export const PREY_MOTION: Record<PreyKind, PreyMotion> = {
  mouse: { speed: 0.22, retargetMin: 1.2, retargetMax: 2.0, burst: 0, pauseMin: 0, pauseMax: 0, span: 0.35 },
  chipmunk: { speed: 0.5, retargetMin: 0.3, retargetMax: 0.7, burst: 0, pauseMin: 0, pauseMax: 0, span: 0.45 },
  bird: { speed: 1.1, retargetMin: 0.2, retargetMax: 0.35, burst: 1, pauseMin: 0.45, pauseMax: 0.85, span: 0.65 },
  squirrel: { speed: 0.74, retargetMin: 0.3, retargetMax: 0.65, burst: 0.45, pauseMin: 0.12, pauseMax: 0.3, span: 0.7 },
  // slithers in long smooth sweeps, then freezes and strikes sideways
  snake: { speed: 0.6, retargetMin: 0.45, retargetMax: 0.9, burst: 0.3, pauseMin: 0.25, pauseMax: 0.55, span: 0.75 },
};

// Prey world behaviour
export const PREY_WORLD: Record<PreyKind, { walk: number; flee: number; calmRate: number; alertRate: number; size: number }> = {
  mouse: { walk: 0.35, flee: 2.6, calmRate: 0.35, alertRate: 1.0, size: 1 },
  chipmunk: { walk: 0.6, flee: 3.6, calmRate: 0.3, alertRate: 1.25, size: 1 },
  bird: { walk: 0.3, flee: 5.0, calmRate: 0.3, alertRate: 1.35, size: 1 },
  squirrel: { walk: 0.8, flee: 4.2, calmRate: 0.25, alertRate: 1.5, size: 1 },
  snake: { walk: 0.22, flee: 1.9, calmRate: 0.3, alertRate: 0.9, size: 1 },
};

export const POPULATION = {
  // snakes show up about half as often as everything else
  target: { mouse: 2, chipmunk: 2, bird: 2, squirrel: 2, snake: 1 } as Record<PreyKind, number>,
  maxWild: 9,
  respawnDelay: 4,
  sticksOnGround: 9,
  stickPickRange: 0.8,
};

export const BASKET_RANGE = 1.25;

export const BABADOOK = {
  // Always ambushes on the return trip with the 2nd present, then 1 in 4 presents after that.
  guaranteedHaul: 2, // 1-based index of acquired present
  laterChance: 0.25,
  maxEncounters: 99,
  triggerRadius: 3.6,
  lungeSpeed: 9.5,
  lungeHitRadius: 0.5,
  emergeTime: 0.9,
  retreatSpeed: 3.2,
  peekCooldown: 9,
};

export const DELIVERED = {
  escapeDelay: 1.3,
  maxVisible: 30,
};

export function pointsFor(pet: PetId, kind: PresentKind): number {
  return kind === 'stick' ? PETS[pet].stickPoints : POINTS[kind];
}
