// The screenshot scenes behind ?shot=start|play|alert|end. Each one plays the real
// rules forward from a fresh world, steered by an autopilot that reads the guards'
// cones before it moves: it plans an A* route over the tile grid with danger costs
// (guard cones, camera cones, laser beams), waits when the way ahead is watched,
// sneaks when a guard is near, and fires the EMP when a camera has it in sight.
// The same seed always gives the same frame.
import { STEP, TILE, TILE_Y0 } from './config.js';
import {
  EVENT_CAUGHT, EVENT_LEVEL_CLEAR, EVENT_OVER, EVENT_WIN, GUARD_CHASE,
} from './world.js';
import { hasLineOfSight, isSolidTile, tileAt } from './levels.js';
import {
  SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN,
} from './render.js';

const START_SECONDS = 5;
const PLAY_SECONDS = 30;
const END_LIMIT_SECONDS = 600;
const REPLAN_SECONDS = 0.5;

/** How far a tile's danger reaches into its neighbours, in tiles. */
const DANGER_RADIUS = 1;

/** True when a point sits inside a guard's or a camera's cone, or near a laser beam. */
function pointDanger(state, x, y) {
  for (const guard of state.guards) {
    const dx = x - guard.x;
    const dy = y - guard.y;
    if (Math.hypot(dx, dy) > 235) continue;
    let angle = Math.atan2(dy, dx) - guard.angle;
    while (angle > Math.PI) angle -= Math.PI * 2;
    while (angle < -Math.PI) angle += Math.PI * 2;
    if (Math.abs(angle) < 0.61) return 3;
  }
  for (const camera of state.cameras) {
    if (state.empTimer > 0) continue;
    const dx = x - camera.x;
    const dy = y - camera.y;
    if (Math.hypot(dx, dy) > 270) continue;
    let angle = Math.atan2(dy, dx) - camera.currentAngle;
    while (angle > Math.PI) angle -= Math.PI * 2;
    while (angle < -Math.PI) angle += Math.PI * 2;
    if (Math.abs(angle) < 0.42) return 3;
  }
  for (const laser of state.lasers) {
    if (state.empTimer > 0) continue;
    const dx = laser.bx - laser.ax;
    const dy = laser.by - laser.ay;
    const length = Math.hypot(dx, dy) || 1;
    const nx = -dy / length;
    const ny = dx / length;
    const slide = laser.slide * Math.sin((2 * Math.PI * (state.time + laser.phase)) / laser.period);
    const ax = laser.ax + nx * slide;
    const ay = laser.ay + ny * slide;
    const bx = laser.bx + nx * slide;
    const by = laser.by + ny * slide;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (length * length)));
    const px = ax + t * dx;
    const py = ay + t * dy;
    if (Math.hypot(x - px, y - py) < 34) return 2;
  }
  return 0;
}

/** A* over the tile grid; a dangerous tile costs far more than a safe one. */
function planRoute(state, fromX, fromY, toX, toY) {
  const startCol = Math.floor(fromX / TILE);
  const startRow = Math.floor((fromY - TILE_Y0) / TILE);
  const goalCol = Math.floor(toX / TILE);
  const goalRow = Math.floor((toY - TILE_Y0) / TILE);
  const key = (col, row) => `${col},${row}`;
  const open = [{ col: startCol, row: startRow, cost: 0, score: 0, path: [] }];
  const best = new Map([[key(startCol, startRow), 0]]);
  while (open.length > 0) {
    let pick = 0;
    for (let index = 1; index < open.length; index += 1) {
      if (open[index].score < open[pick].score) pick = index;
    }
    const node = open.splice(pick, 1)[0];
    if (node.col === goalCol && node.row === goalRow) return node.path;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const col = node.col + dc;
      const row = node.row + dr;
      if (row < 0 || row >= state.tiles.length || col < 0 || col >= state.tiles[row].length) continue;
      if (isSolidTile(state.tiles[row][col])) continue;
      const cx = col * TILE + TILE / 2;
      const cy = TILE_Y0 + row * TILE + TILE / 2;
      let danger = 0;
      for (let rr = -DANGER_RADIUS; rr <= DANGER_RADIUS; rr += 1) {
        for (let cc = -DANGER_RADIUS; cc <= DANGER_RADIUS; cc += 1) {
          danger = Math.max(danger, pointDanger(state, cx + cc * 12, cy + rr * 12));
        }
      }
      const cost = node.cost + 1 + danger * 6;
      const k = key(col, row);
      if (best.has(k) && best.get(k) <= cost) continue;
      best.set(k, cost);
      const heuristic = Math.abs(goalCol - col) + Math.abs(goalRow - row);
      open.push({
        col,
        row,
        cost,
        score: cost + heuristic,
        path: [...node.path, { x: cx, y: cy }],
      });
    }
  }
  return null;
}

/** The tile near the thief that is farthest from every chasing guard, out of their
 * cones and behind cover: where a chased thief runs to break line of sight. */
function fleeTarget(state) {
  const chasers = state.guards.filter((guard) => guard.state === GUARD_CHASE);
  if (chasers.length === 0) return null;
  let best = null;
  let bestScore = -Infinity;
  for (let row = 0; row < state.tiles.length; row += 1) {
    for (let col = 0; col < state.tiles[row].length; col += 1) {
      if (isSolidTile(state.tiles[row][col])) continue;
      const x = col * TILE + TILE / 2;
      const y = TILE_Y0 + row * TILE + TILE / 2;
      const distToThief = Math.hypot(x - state.thief.x, y - state.thief.y);
      if (distToThief > 340) continue;
      let score = -distToThief * 0.2;
      for (const guard of chasers) {
        score += Math.hypot(x - guard.x, y - guard.y);
        if (!hasLineOfSight(state.tiles, guard.x, guard.y, x, y)) score += 200;
      }
      if (pointDanger(state, x, y) === 0) score += 400;
      if (score > bestScore) {
        bestScore = score;
        best = { x, y };
      }
    }
  }
  return best;
}

/** The autopilot: pick a target, plan a route, follow it, and wait out watched tiles. */
function createAutopilot() {
  let path = null;
  let replanIn = 0;
  let waitIn = 0;
  let target = null;
  let fleeing = false;

  function pickTarget(state) {
    // The nearest loot first, then the prize, then the exit once the prize is lifted.
    let bestItem = null;
    let bestDistance = Infinity;
    for (const item of state.loot) {
      if (item.taken) continue;
      const distance = Math.hypot(item.x - state.thief.x, item.y - state.thief.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestItem = item;
      }
    }
    if (bestItem) return { x: bestItem.x, y: bestItem.y, kind: 'loot' };
    if (state.prize && !state.prize.taken) return { x: state.prize.x, y: state.prize.y, kind: 'prize' };
    if (state.exitOpen && state.exit) return { x: state.exit.x, y: state.exit.y, kind: 'exit' };
    return null;
  }

  function nearestGuardDistance(state) {
    let nearest = Infinity;
    for (const guard of state.guards) {
      nearest = Math.min(nearest, Math.hypot(guard.x - state.thief.x, guard.y - state.thief.y));
    }
    return nearest;
  }

  function decide(state, dt) {
    replanIn -= dt;
    // A chasing guard outruns the thief in the open: run for cover first, loot later.
    const chasers = state.guards.filter((guard) => guard.state === GUARD_CHASE);
    if (chasers.length > 0) {
      if (!fleeing || replanIn <= 0) {
        const flee = fleeTarget(state);
        if (flee) {
          path = planRoute(state, state.thief.x, state.thief.y, flee.x, flee.y);
          target = { x: flee.x, y: flee.y, kind: 'flee' };
          fleeing = true;
          replanIn = REPLAN_SECONDS;
        }
      }
      if (path && path.length > 0) {
        const next = path[0];
        const dx = next.x - state.thief.x;
        const dy = next.y - state.thief.y;
        const distance = Math.hypot(dx, dy);
        if (distance < 9) path.shift();
        else return { dx: dx / distance, dy: dy / distance, sneak: false, emp: false, click: null };
      }
      return { dx: 0, dy: 0, sneak: false, emp: false, click: null };
    }
    fleeing = false;
    const nextTarget = pickTarget(state);
    if (!nextTarget) return { dx: 0, dy: 0, sneak: false, emp: false, click: null };
    if (!target || target.kind !== nextTarget.kind || replanIn <= 0) {
      target = nextTarget;
      path = planRoute(state, state.thief.x, state.thief.y, target.x, target.y);
      replanIn = REPLAN_SECONDS;
      waitIn = 0;
    }
    // A camera holding the thief gets an EMP, not a footrace.
    let emp = false;
    if (state.emp > 0 && state.empTimer === 0) {
      for (const camera of state.cameras) {
        if (camera.seesThief) {
          emp = true;
          break;
        }
      }
    }
    if (!path || path.length === 0) return { dx: 0, dy: 0, sneak: false, emp, click: null };
    const next = path[0];
    const hereDanger = pointDanger(state, state.thief.x, state.thief.y);
    const aheadDanger = pointDanger(state, next.x, next.y);
    if (aheadDanger > 0 && hereDanger === 0) {
      // The way ahead is watched and this tile is safe: wait for the cone to pass.
      waitIn += dt;
      if (waitIn < 4.0) return { dx: 0, dy: 0, sneak: true, emp, click: null };
    }
    waitIn = 0;
    const dx = next.x - state.thief.x;
    const dy = next.y - state.thief.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 9) {
      path.shift();
      return { dx: 0, dy: 0, sneak: nearestGuardDistance(state) < 260, emp, click: null };
    }
    return {
      dx: dx / distance,
      dy: dy / distance,
      sneak: nearestGuardDistance(state) < 260 || aheadDanger > 0,
      emp,
      click: null,
    };
  }

  return { decide };
}

/** Deliberately walk at the nearest guard until it gives chase. */
function alertPilot(state) {
  let nearest = null;
  let nearestDistance = Infinity;
  for (const guard of state.guards) {
    const distance = Math.hypot(guard.x - state.thief.x, guard.y - state.thief.y);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = guard;
    }
  }
  if (!nearest) return { dx: 0, dy: 0, sneak: false, emp: false, click: null };
  const chasing = state.guards.some((guard) => guard.state === GUARD_CHASE);
  if (chasing) {
    // Stay in the open, in the cone, so the chase reads in the frame.
    return { dx: 0, dy: 0, sneak: false, emp: false, click: null };
  }
  const dx = nearest.x - state.thief.x;
  const dy = nearest.y - state.thief.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 120) return { dx: 0, dy: 0, sneak: false, emp: false, click: null };
  return { dx: dx / distance, dy: dy / distance, sneak: false, emp: false, click: null };
}

function toastFor(state) {
  if (state.lockdown > 0) return 'LOCKDOWN! Every guard is coming for you!';
  if (state.guards.some((guard) => guard.state === GUARD_CHASE)) return 'SPOTTED! Break line of sight!';
  if (state.exitOpen) return 'Prize lifted — reach the EXIT!';
  return null;
}

/**
 * Set `world` to the named scene (start, play, alert or end; any other name is start)
 * and return the screen to draw over it, the best score to show, and the UI extras.
 */
export function stageShot(name, world) {
  const state = world.state;
  world.reset();
  const ui = { toast: null, toastAge: 0, clearLines: [], winLines: [] };
  if (name !== 'play' && name !== 'alert' && name !== 'end') {
    for (let index = 0; index < START_SECONDS / STEP; index += 1) {
      world.step(STEP, { dx: 0, dy: 0, sneak: false, emp: false, click: null }, true);
    }
    return { screen: SCREEN_TITLE, best: 0, ui };
  }
  if (name === 'alert') {
    let chasingFor = 0;
    for (let index = 0; index < 120 / STEP; index += 1) {
      const events = world.step(STEP, alertPilot(state), false);
      if (events & EVENT_OVER) break;
      if (state.guards.some((guard) => guard.state === GUARD_CHASE)) {
        chasingFor += STEP;
        if (chasingFor > 1.0) break;
      }
    }
    ui.toast = toastFor(state);
    ui.toastAge = 0.2;
    return { screen: SCREEN_PLAY, best: 0, ui };
  }
  const pilot = createAutopilot();
  let screen = SCREEN_PLAY;
  let won = false;
  let over = false;
  if (name === 'end') {
    for (let index = 0; index < END_LIMIT_SECONDS / STEP; index += 1) {
      const events = world.step(STEP, pilot.decide(state, STEP), false);
      if (events & EVENT_WIN) {
        won = true;
        break;
      }
      if (events & EVENT_OVER) {
        over = true;
        break;
      }
      if (events & EVENT_LEVEL_CLEAR) {
        // The pilot keeps going on the next floor.
      }
      if (events & EVENT_CAUGHT) {
        // A caught thief respawns; the pilot replans from the door.
      }
    }
    if (won) {
      screen = SCREEN_WIN;
      ui.winLines = [
        `Score ${state.score}`,
        `Loot ${state.lootTaken} pieces · ${state.alerts} full alerts · ${Math.floor(state.totalTime)}s on the job`,
        'The Meridian Diamond is gone before the first alarm is raised.',
      ];
      return { screen, best: state.score, ui };
    }
    if (over) {
      return { screen: SCREEN_OVER, best: state.score, ui };
    }
    ui.toast = toastFor(state);
    return { screen: SCREEN_PLAY, best: 0, ui };
  }
  // The play scene: a mid-heist frame, thief deep in the hall.
  for (let index = 0; index < PLAY_SECONDS / STEP; index += 1) {
    const events = world.step(STEP, pilot.decide(state, STEP), false);
    if (events & (EVENT_OVER | EVENT_WIN | EVENT_LEVEL_CLEAR)) break;
  }
  ui.toast = toastFor(state);
  ui.toastAge = 0.2;
  return { screen: SCREEN_PLAY, best: 0, ui };
}
