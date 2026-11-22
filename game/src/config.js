// Vaultbreak: The Meridian Job — every tuning number and colour in one place.
// The playfield is a fixed 1280x720 logical area; the renderer scales it to the
// window, so no rule below depends on the screen size.
export const FIELD = { width: 1280, height: 776, topBar: 56 };

/** The tile grid starts below the HUD strip, so the top wall row is never hidden. */
export const TILE_Y0 = 56;

export const TILE = 40;
export const COLS = 32;
export const ROWS = 18;

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

export const THIEF = {
  radius: 13,
  walkSpeed: 205,
  sneakSpeed: 112,
  /** Seconds of grace after being caught, during which guards cannot catch again. */
  invulnerable: 2.0,
};

export const HEARTS = 3;

export const GUARD = {
  radius: 14,
  patrolSpeed: 88,
  investigateSpeed: 148,
  chaseSpeed: 232,
  /** How far a guard can see, in pixels. */
  viewRange: 235,
  /** Half-angle of a guard's vision cone, in radians. */
  viewHalfAngle: 0.61,
  /** Suspicion 0..1. 0.55 turns a guard curious, 1.0 sends it chasing. */
  suspiciousAt: 0.55,
  chaseAt: 1.0,
  spotRate: 1.35,
  decayRate: 0.34,
  /** Seconds a chasing guard keeps hunting after losing sight. */
  loseSightAfter: 3.0,
  /** Seconds a guard searches the last-seen spot before giving up. */
  searchTime: 4.0,
  /** How close a chasing guard must get to catch the thief. */
  catchDistance: 26,
  /** Running feet are heard this far away. */
  hearRange: 150,
};

export const CAMERA = {
  range: 270,
  halfAngle: 0.42,
  /** Alarm points per second while a camera holds the thief in its cone. */
  alarmRate: 26,
  /** Suspicion per second a camera feeds to the nearest guard. */
  suspicionRate: 0.85,
  /** Seconds a camera sweeps from one end of its arc to the other. */
  sweepSeconds: 3.4,
};

export const LASER = {
  /** Alarm points per second while the thief stands in a beam. */
  alarmRate: 42,
  /** How wide the beam is, in pixels. */
  width: 5,
};

export const ALARM = {
  max: 100,
  /** Alarm points per second while any guard has the thief in sight. */
  seenRate: 22,
  /** Alarm decay per second while nobody sees the thief. */
  decayRate: 5,
  /** How long a full alarm locks the building down. */
  lockdownSeconds: 6,
  /** Alarm left after a lockdown ends. */
  afterLockdown: 60,
};

export const GADGETS = {
  /** Coin noisemakers per level: click to toss one where the pointer is. */
  coinsPerLevel: 5,
  /** EMP bursts per level: E disables every camera and laser for this long. */
  empPerLevel: 2,
  empSeconds: 6,
};

export const LOOT = {
  cashPoints: 50,
  goldPoints: 150,
  prizePointsLevel1: 500,
  prizePointsLevel2: 1000,
  /** Time bonus per second left under the par time, per level. */
  parSeconds: 150,
  timeBonusPerSecond: 4,
  /** Bonus for finishing a level with the alarm low. */
  calmBonus: 200,
};

export const PALETTE = {
  backdrop: '#0d0f16',
  floorA: '#232838',
  floorB: '#20242f',
  carpet: '#5e1f28',
  carpetEdge: '#8a6a2f',
  wall: '#3a4157',
  wallTop: '#4a5470',
  wallTrim: '#c9a227',
  desk: '#5a4632',
  deskTop: '#6e573d',
  plant: '#2e6b34',
  plantLight: '#3f8f46',
  thief: '#1c1a24',
  thiefHood: '#7b2fbe',
  thiefTrim: '#e8d44d',
  guard: '#2c4a7c',
  guardCap: '#1d3355',
  guardFace: '#e8c39a',
  coneCalm: 'rgba(232, 212, 77, 0.20)',
  coneCalmEdge: 'rgba(232, 212, 77, 0.55)',
  coneSuspicious: 'rgba(255, 150, 40, 0.30)',
  coneChase: 'rgba(255, 60, 50, 0.34)',
  coneCamera: 'rgba(255, 140, 40, 0.16)',
  cameraBody: '#8a6a2f',
  cameraOff: '#555a66',
  laser: '#ff2e3e',
  cash: '#4caf50',
  gold: '#f2c94c',
  diamond: '#5ff2ff',
  exit: '#2ecc71',
  exitLocked: '#555a66',
  prize: '#ffd700',
  hud: '#12141d',
  hudLine: '#2a2f42',
  text: '#eef1f5',
  muted: '#9aa1b5',
  alarmLow: '#2ecc71',
  alarmMid: '#f2c94c',
  alarmHigh: '#ff4b3e',
  panel: 'rgba(18, 20, 29, 0.92)',
  panelEdge: '#c9a227',
  toast: '#ffd700',
};

/** System fonts only: the game loads no font over the network. */
export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'vaultbreak-meridian.best';
