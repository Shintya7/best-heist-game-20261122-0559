// Vaultbreak: The Meridian Job — the game's rules and state, with no drawing and no
// browser in it: the thief, the guards and their suspicion, the cameras, the lasers,
// the alarm meter, the loot, the prize and the getaway. step() advances one fixed
// step and returns what happened as bit flags, so the caller can react (sound,
// announcements) without the world knowing about screens.
import {
  ALARM, CAMERA, FIELD, GADGETS, GUARD, HEARTS, LASER, LOOT, THIEF,
} from './config.js';
import { LEVELS, hasLineOfSight, isSolidTile, parseLevel, tileAt } from './levels.js';

export const EVENT_LOOT = 1;
export const EVENT_PRIZE = 2;
export const EVENT_CAUGHT = 4;
export const EVENT_LEVEL_CLEAR = 8;
export const EVENT_WIN = 16;
export const EVENT_OVER = 32;
export const EVENT_ALARM = 64;
export const EVENT_LOCKDOWN = 128;
export const EVENT_EMP = 256;
export const EVENT_COIN = 512;
export const EVENT_SPOTTED = 1024;

/** Guard states: patrol, suspicious, investigate, chase, search, return. */
export const GUARD_PATROL = 'patrol';
export const GUARD_SUSPICIOUS = 'suspicious';
export const GUARD_INVESTIGATE = 'investigate';
export const GUARD_CHASE = 'chase';
export const GUARD_SEARCH = 'search';

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  let t = lengthSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export function createWorld(random) {
  const state = {
    levelIndex: 0,
    levelName: '',
    prizeName: '',
    tiles: [],
    loot: [],
    prize: null,
    exit: null,
    exitOpen: false,
    start: null,
    thief: { x: 0, y: 0, angle: 0, moving: false, sneaking: false, invulnerable: 0 },
    guards: [],
    cameras: [],
    lasers: [],
    alarm: 0,
    maxAlarm: 0,
    lockdown: 0,
    empTimer: 0,
    coins: GADGETS.coinsPerLevel,
    emp: GADGETS.empPerLevel,
    hearts: HEARTS,
    score: 0,
    levelScore: 0,
    elapsed: 0,
    totalTime: 0,
    lootTaken: 0,
    lootTotal: 0,
    alerts: 0,
    coinRipples: [],
    noise: null,
    time: 0,
    spotted: false,
  };

  function loadLevel(index) {
    const level = LEVELS[index];
    const parsed = parseLevel(level);
    state.levelIndex = index;
    state.levelName = level.name;
    state.prizeName = level.prizeName;
    state.tiles = parsed.tiles;
    state.loot = parsed.loot;
    state.prize = parsed.prize;
    state.exit = parsed.exit;
    state.exitOpen = false;
    state.start = parsed.start;
    state.lootTotal = parsed.loot.length;
    state.thief.x = parsed.start.x;
    state.thief.y = parsed.start.y;
    state.thief.angle = -Math.PI / 2;
    state.thief.invulnerable = 0;
    state.guards = level.guards.map((guard) => ({
      name: guard.name,
      waypoints: guard.waypoints,
      waypoint: 0,
      x: guard.waypoints[0].x,
      y: guard.waypoints[0].y,
      radius: GUARD.radius,
      angle: 0,
      state: GUARD_PATROL,
      suspicion: 0,
      lastSeen: null,
      stateTimer: 0,
      loseSight: 0,
      investigate: null,
    }));
    state.cameras = level.cameras.map((camera) => ({
      ...camera,
      currentAngle: camera.angle,
      seesThief: false,
    }));
    state.lasers = level.lasers.map((laser) => ({ ...laser, offset: 0 }));
    state.alarm = 0;
    state.maxAlarm = 0;
    state.lockdown = 0;
    state.empTimer = 0;
    state.coins = GADGETS.coinsPerLevel;
    state.emp = GADGETS.empPerLevel;
    state.elapsed = 0;
    state.coinRipples = [];
    state.noise = null;
    state.spotted = false;
  }

  function reset() {
    state.score = 0;
    state.levelScore = 0;
    state.totalTime = 0;
    state.hearts = HEARTS;
    state.lootTaken = 0;
    state.alerts = 0;
    loadLevel(0);
  }

  /** True when the thief stands on a potted plant, which hides them. */
  function thiefHidden() {
    return tileAt(state.tiles, state.thief.x, state.thief.y) === 'P';
  }

  /** Can this guard see the thief right now? Bushes and sneaking shrink the odds. */
  function guardSees(guard) {
    const dx = state.thief.x - guard.x;
    const dy = state.thief.y - guard.y;
    const distance = Math.hypot(dx, dy);
    let range = GUARD.viewRange;
    if (thiefHidden()) range *= 0.55;
    if (distance > range) return false;
    if (Math.abs(angleDiff(Math.atan2(dy, dx), guard.angle)) > GUARD.viewHalfAngle) return false;
    return hasLineOfSight(state.tiles, guard.x, guard.y, state.thief.x, state.thief.y);
  }

  function cameraSees(camera) {
    if (state.empTimer > 0) return false;
    const dx = state.thief.x - camera.x;
    const dy = state.thief.y - camera.y;
    const distance = Math.hypot(dx, dy);
    let range = CAMERA.range;
    if (thiefHidden()) range *= 0.55;
    if (distance > range) return false;
    if (Math.abs(angleDiff(Math.atan2(dy, dx), camera.currentAngle)) > CAMERA.halfAngle) return false;
    return hasLineOfSight(state.tiles, camera.x, camera.y, state.thief.x, state.thief.y);
  }

  /** Move a circle against solid tiles: try x, then y, so it slides along walls. */
  function moveCircle(body, dx, dy) {
    const radius = body.radius;
    const nextX = body.x + dx;
    const blockedX =
      isSolidTile(tileAt(state.tiles, nextX - radius, body.y - radius)) ||
      isSolidTile(tileAt(state.tiles, nextX + radius, body.y - radius)) ||
      isSolidTile(tileAt(state.tiles, nextX - radius, body.y + radius)) ||
      isSolidTile(tileAt(state.tiles, nextX + radius, body.y + radius));
    if (!blockedX) body.x = Math.min(FIELD.width - radius, Math.max(radius, nextX));
    const nextY = body.y + dy;
    const blockedY =
      isSolidTile(tileAt(state.tiles, body.x - radius, nextY - radius)) ||
      isSolidTile(tileAt(state.tiles, body.x + radius, nextY - radius)) ||
      isSolidTile(tileAt(state.tiles, body.x - radius, nextY + radius)) ||
      isSolidTile(tileAt(state.tiles, body.x + radius, nextY + radius));
    if (!blockedY) body.y = Math.min(FIELD.height - radius, Math.max(FIELD.topBar + radius, nextY));
  }

  function moveToward(body, targetX, targetY, speed, dt) {
    const dx = targetX - body.x;
    const dy = targetY - body.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 2) return true;
    const step = Math.min(distance, speed * dt);
    moveCircle(body, (dx / distance) * step, (dy / distance) * step);
    body.angle = Math.atan2(dy, dx);
    return distance <= speed * dt + 2;
  }

  function updateGuard(guard, dt, events) {
    const sees = guardSees(guard);
    const hidden = thiefHidden();
    if (sees) {
      let rate = GUARD.spotRate;
      if (hidden) rate *= 0.3;
      if (state.thief.sneaking) rate *= 0.5;
      guard.suspicion = Math.min(1, guard.suspicion + rate * dt);
      guard.lastSeen = { x: state.thief.x, y: state.thief.y };
      guard.loseSight = 0;
    } else {
      guard.suspicion = Math.max(0, guard.suspicion - GUARD.decayRate * dt);
      if (guard.state === GUARD_CHASE) guard.loseSight += dt;
    }

    if (guard.state !== GUARD_CHASE && guard.suspicion >= GUARD.chaseAt) {
      guard.state = GUARD_CHASE;
      state.alerts += 1;
      events.value |= EVENT_SPOTTED;
    } else if (guard.state === GUARD_PATROL && guard.suspicion >= GUARD.suspiciousAt) {
      guard.state = GUARD_SUSPICIOUS;
      guard.stateTimer = 0.6;
    }

    switch (guard.state) {
      case GUARD_PATROL: {
        const target = guard.waypoints[guard.waypoint];
        if (moveToward(guard, target.x, target.y, GUARD.patrolSpeed, dt)) {
          guard.waypoint = (guard.waypoint + 1) % guard.waypoints.length;
        }
        break;
      }
      case GUARD_SUSPICIOUS: {
        if (guard.lastSeen) guard.angle = Math.atan2(guard.lastSeen.y - guard.y, guard.lastSeen.x - guard.x);
        guard.stateTimer -= dt;
        if (guard.suspicion < 0.3) guard.state = GUARD_PATROL;
        else if (guard.stateTimer <= 0 && guard.lastSeen) {
          guard.state = GUARD_INVESTIGATE;
          guard.investigate = { ...guard.lastSeen };
        }
        break;
      }
      case GUARD_INVESTIGATE: {
        const target = guard.investigate ?? guard.waypoints[guard.waypoint];
        if (moveToward(guard, target.x, target.y, GUARD.investigateSpeed, dt)) {
          guard.stateTimer = 2.0;
          guard.state = GUARD_SEARCH;
        }
        break;
      }
      case GUARD_CHASE: {
        const speed = state.lockdown > 0 ? GUARD.chaseSpeed * 1.2 : GUARD.chaseSpeed;
        moveToward(guard, state.thief.x, state.thief.y, speed, dt);
        if (guard.loseSight > GUARD.loseSightAfter && guard.lastSeen) {
          guard.state = GUARD_SEARCH;
          guard.stateTimer = GUARD.searchTime;
          guard.investigate = { ...guard.lastSeen };
        }
        break;
      }
      case GUARD_SEARCH: {
        if (guard.investigate) {
          if (moveToward(guard, guard.investigate.x, guard.investigate.y, GUARD.investigateSpeed, dt)) {
            guard.stateTimer -= dt;
            guard.angle += dt * 1.8;
            if (guard.stateTimer <= 0) {
              guard.state = GUARD_PATROL;
              guard.investigate = null;
            }
          }
        } else {
          guard.state = GUARD_PATROL;
        }
        break;
      }
      default:
        guard.state = GUARD_PATROL;
        break;
    }
  }

  function laserBeam(laser) {
    // The beam slides sideways, perpendicular to its own line.
    const dx = laser.bx - laser.ax;
    const dy = laser.by - laser.ay;
    const length = Math.hypot(dx, dy) || 1;
    const nx = -dy / length;
    const ny = dx / length;
    const slide = laser.slide * Math.sin((2 * Math.PI * (state.time + laser.phase)) / laser.period);
    return {
      ax: laser.ax + nx * slide,
      ay: laser.ay + ny * slide,
      bx: laser.bx + nx * slide,
      by: laser.by + ny * slide,
    };
  }

  /**
   * One fixed step. `input` is { dx, dy, sneak, emp, click } where dx/dy is a unit
   * direction (or 0), emp is a one-shot EMP press, and click is {x, y} or null.
   * With `harmless` set (the title screen's backdrop) the guards patrol and the
   * cameras sweep, but nobody spots the thief and nothing scores.
   */
  function step(dt, input, harmless) {
    const events = { value: 0 };
    state.time += dt;
    if (harmless) {
      for (const guard of state.guards) {
        const target = guard.waypoints[guard.waypoint];
        if (moveToward(guard, target.x, target.y, GUARD.patrolSpeed, dt)) {
          guard.waypoint = (guard.waypoint + 1) % guard.waypoints.length;
        }
      }
      for (const camera of state.cameras) {
        camera.currentAngle = camera.angle + camera.sweep * Math.sin((2 * Math.PI * state.time) / CAMERA.sweepSeconds);
      }
      return events.value;
    }

    state.elapsed += dt;
    state.totalTime += dt;
    if (state.thief.invulnerable > 0) state.thief.invulnerable = Math.max(0, state.thief.invulnerable - dt);
    if (state.empTimer > 0) state.empTimer = Math.max(0, state.empTimer - dt);
    if (state.lockdown > 0) state.lockdown = Math.max(0, state.lockdown - dt);

    // The thief moves; sneaking is slower and quieter.
    const thief = state.thief;
    thief.sneaking = Boolean(input.sneak);
    const speed = thief.sneaking ? THIEF.sneakSpeed : THIEF.walkSpeed;
    const length = Math.hypot(input.dx, input.dy);
    thief.moving = length > 0;
    if (length > 0) {
      const nx = input.dx / length;
      const ny = input.dy / length;
      const body = { x: thief.x, y: thief.y, radius: THIEF.radius, angle: thief.angle };
      moveCircle(body, nx * speed * dt, ny * speed * dt);
      thief.x = body.x;
      thief.y = body.y;
      thief.angle = Math.atan2(ny, nx);
    }

    // Running feet are loud: nearby guards turn to look.
    if (thief.moving && !thief.sneaking) {
      for (const guard of state.guards) {
        const distance = Math.hypot(guard.x - thief.x, guard.y - thief.y);
        if (distance < GUARD.hearRange && guard.state === GUARD_PATROL) {
          guard.suspicion = Math.min(GUARD.suspiciousAt, guard.suspicion + 0.35 * dt);
          if (guard.suspicion >= GUARD.suspiciousAt) {
            guard.state = GUARD_SUSPICIOUS;
            guard.stateTimer = 0.6;
            guard.lastSeen = { x: thief.x, y: thief.y };
          }
        }
      }
    }

    // A clicked coin pulls the nearest patrolling guard over to look.
    if (input.click && state.coins > 0) {
      state.coins -= 1;
      state.coinRipples.push({ x: input.click.x, y: input.click.y, age: 0 });
      events.value |= EVENT_COIN;
      let nearest = null;
      let nearestDistance = Infinity;
      for (const guard of state.guards) {
        if (guard.state !== GUARD_PATROL && guard.state !== GUARD_SUSPICIOUS) continue;
        const distance = Math.hypot(guard.x - input.click.x, guard.y - input.click.y);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearest = guard;
        }
      }
      if (nearest) {
        nearest.state = GUARD_INVESTIGATE;
        nearest.investigate = { x: input.click.x, y: input.click.y };
        nearest.suspicion = Math.max(nearest.suspicion, GUARD.suspiciousAt);
      }
    }
    for (const ripple of state.coinRipples) ripple.age += dt;
    state.coinRipples = state.coinRipples.filter((ripple) => ripple.age < 1.2);

    // EMP: one press blacks out every camera and laser for a few seconds.
    if (input.emp && state.emp > 0 && state.empTimer === 0) {
      state.emp -= 1;
      state.empTimer = GADGETS.empSeconds;
      events.value |= EVENT_EMP;
    }

    // Cameras sweep; a camera holding the thief feeds the alarm and the nearest guard.
    let anyoneSees = false;
    for (const camera of state.cameras) {
      camera.currentAngle = camera.angle + camera.sweep * Math.sin((2 * Math.PI * state.time) / CAMERA.sweepSeconds);
      camera.seesThief = cameraSees(camera);
      if (camera.seesThief) {
        anyoneSees = true;
        state.alarm = Math.min(ALARM.max, state.alarm + CAMERA.alarmRate * dt);
        let nearest = null;
        let nearestDistance = Infinity;
        for (const guard of state.guards) {
          const distance = Math.hypot(guard.x - state.thief.x, guard.y - state.thief.y);
          if (distance < nearestDistance) {
            nearestDistance = distance;
            nearest = guard;
          }
        }
        if (nearest && nearest.state !== GUARD_CHASE) {
          nearest.suspicion = Math.min(1, nearest.suspicion + CAMERA.suspicionRate * dt);
          nearest.lastSeen = { x: state.thief.x, y: state.thief.y };
        }
      }
    }

    // Lasers: standing in a beam floods the alarm.
    if (state.empTimer === 0) {
      for (const laser of state.lasers) {
        const beam = laserBeam(laser);
        const distance = distanceToSegment(state.thief.x, state.thief.y, beam.ax, beam.ay, beam.bx, beam.by);
        if (distance < THIEF.radius + LASER.width) {
          state.alarm = Math.min(ALARM.max, state.alarm + LASER.alarmRate * dt);
          anyoneSees = true;
        }
      }
    }

    // Guards: suspicion, chase, search, and the catch.
    for (const guard of state.guards) {
      const wasChasing = guard.state === GUARD_CHASE;
      updateGuard(guard, dt, events);
      if (guardSees(guard)) anyoneSees = true;
      if (guard.state === GUARD_CHASE) {
        const distance = Math.hypot(guard.x - thief.x, guard.y - thief.y);
        if (distance < GUARD.catchDistance && thief.invulnerable === 0) {
          state.hearts -= 1;
          events.value |= EVENT_CAUGHT;
          if (state.hearts <= 0) {
            events.value |= EVENT_OVER;
            return events.value;
          }
          thief.x = state.start.x;
          thief.y = state.start.y;
          thief.invulnerable = THIEF.invulnerable;
          state.alarm = Math.max(0, state.alarm - 40);
          for (const other of state.guards) {
            other.state = GUARD_PATROL;
            other.suspicion = 0;
            other.lastSeen = null;
            other.investigate = null;
          }
          break;
        }
      }
      if (!wasChasing && guard.state === GUARD_CHASE) state.spotted = true;
    }
    state.spotted = state.guards.some((guard) => guard.state === GUARD_CHASE);

    // The alarm rises while anyone watches, and falls when the thief is hidden.
    if (anyoneSees && state.lockdown === 0) {
      state.alarm = Math.min(ALARM.max, state.alarm + ALARM.seenRate * dt);
      events.value |= EVENT_ALARM;
    } else if (state.lockdown === 0) {
      state.alarm = Math.max(0, state.alarm - ALARM.decayRate * dt);
    }
    state.maxAlarm = Math.max(state.maxAlarm, state.alarm);
    if (state.alarm >= ALARM.max && state.lockdown === 0) {
      state.lockdown = ALARM.lockdownSeconds;
      events.value |= EVENT_LOCKDOWN;
      for (const guard of state.guards) {
        if (guard.state !== GUARD_CHASE) {
          guard.state = GUARD_CHASE;
          guard.lastSeen = { x: thief.x, y: thief.y };
        }
      }
    }
    if (state.lockdown > 0 && state.lockdown - dt <= 0) state.alarm = ALARM.afterLockdown;

    // Loot, the prize, and the getaway.
    for (const item of state.loot) {
      if (item.taken) continue;
      if (Math.hypot(item.x - thief.x, item.y - thief.y) < 26) {
        item.taken = true;
        state.lootTaken += 1;
        const points = item.kind === 'gold' ? LOOT.goldPoints : LOOT.cashPoints;
        state.score += points;
        state.levelScore += points;
        events.value |= EVENT_LOOT;
      }
    }
    if (state.prize && !state.prize.taken && Math.hypot(state.prize.x - thief.x, state.prize.y - thief.y) < 28) {
      state.prize.taken = true;
      const points = state.levelIndex === 0 ? LOOT.prizePointsLevel1 : LOOT.prizePointsLevel2;
      state.score += points;
      state.levelScore += points;
      state.exitOpen = true;
      events.value |= EVENT_PRIZE;
    }
    if (state.exitOpen && Math.hypot(state.exit.x - thief.x, state.exit.y - thief.y) < 28) {
      const timeBonus = Math.max(0, Math.floor(LOOT.parSeconds - state.elapsed)) * LOOT.timeBonusPerSecond;
      const calmBonus = state.maxAlarm < 50 ? LOOT.calmBonus : 0;
      state.score += timeBonus + calmBonus;
      state.levelScore += timeBonus + calmBonus;
      if (state.levelIndex >= LEVELS.length - 1) {
        events.value |= EVENT_WIN;
      } else {
        events.value |= EVENT_LEVEL_CLEAR;
        state.hearts = Math.min(HEARTS, state.hearts + 1);
        loadLevel(state.levelIndex + 1);
      }
    }
    return events.value;
  }

  reset();
  return { state, reset, step, loadLevel };
}
