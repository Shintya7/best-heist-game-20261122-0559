// Drawing only: the world's state and the current screen in, pixels out. The
// 1280x776 playfield (a 56 px HUD strip above an 18x32 tile floor) is scaled to
// fit the window and centred, the margin filled with the backdrop colour. Vision
// cones are ray-cast against the walls and desks, so they stop at cover exactly
// where a guard's sight stops. Flat shapes and canvas text throughout: the game
// loads no image, font or sound over the network.
import { FIELD, FONT, HEARTS, PALETTE, TILE, TILE_Y0 } from './config.js';
import { GUARD_CHASE, GUARD_SUSPICIOUS } from './world.js';
import { isSolidTile, tileAt } from './levels.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_LEVEL_CLEAR = 'clear';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

/** How many rays a vision cone is cast with; more rays, smoother edges. */
const CONE_RAYS = 26;
const PANEL = { width: 660, top: 150, line: 32, bottom: 76 };

function cachedLabel(prefix) {
  let value = null;
  let text = '';
  return function label(next) {
    if (next !== value) {
      value = next;
      text = prefix + next;
    }
    return text;
  };
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const scoreLabel = cachedLabel('SCORE ');
  const lootLabel = cachedLabel('LOOT ');
  const timeLabel = cachedLabel('');
  const bestLabel = cachedLabel('BEST ');
  const finalLabel = cachedLabel('SCORE ');

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align) {
    if (!fonts.has(size)) fonts.set(size, `${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align;
    context.fillText(value, x, y);
  }

  function formatTime(seconds) {
    const total = Math.floor(seconds);
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }

  function drawFloor(state) {
    for (let row = 0; row < state.tiles.length; row += 1) {
      for (let col = 0; col < state.tiles[row].length; col += 1) {
        const x = col * TILE;
        const y = TILE_Y0 + row * TILE;
        context.fillStyle = (row + col) % 2 === 0 ? PALETTE.floorA : PALETTE.floorB;
        context.fillRect(x, y, TILE, TILE);
      }
    }
    // A red carpet runner down the entry corridor, and a rug under the prize.
    context.fillStyle = PALETTE.carpet;
    context.fillRect(TILE, TILE_Y0 + 16 * TILE, FIELD.width - 2 * TILE, TILE);
    context.fillStyle = PALETTE.carpetEdge;
    context.fillRect(TILE, TILE_Y0 + 16 * TILE, FIELD.width - 2 * TILE, 3);
    context.fillRect(TILE, TILE_Y0 + 17 * TILE - 3, FIELD.width - 2 * TILE, 3);
    if (state.prize) {
      context.beginPath();
      context.arc(state.prize.x, state.prize.y, 30, 0, Math.PI * 2);
      context.fillStyle = 'rgba(94, 31, 40, 0.9)';
      context.fill();
    }
  }

  function drawWallsAndDesks(state) {
    for (let row = 0; row < state.tiles.length; row += 1) {
      for (let col = 0; col < state.tiles[row].length; col += 1) {
        const tile = state.tiles[row][col];
        const x = col * TILE;
        const y = TILE_Y0 + row * TILE;
        if (tile === '#') {
          context.fillStyle = PALETTE.wall;
          context.fillRect(x, y, TILE, TILE);
          context.fillStyle = PALETTE.wallTop;
          context.fillRect(x, y, TILE, 6);
          context.fillStyle = PALETTE.wallTrim;
          context.fillRect(x, y + TILE - 3, TILE, 3);
        } else if (tile === 'D') {
          context.fillStyle = PALETTE.desk;
          context.fillRect(x + 2, y + 2, TILE - 4, TILE - 4);
          context.fillStyle = PALETTE.deskTop;
          context.fillRect(x + 5, y + 5, TILE - 10, TILE - 10);
          context.fillStyle = PALETTE.gold;
          context.fillRect(x + 8, y + 14, 10, 12);
          context.fillRect(x + 22, y + 20, 10, 12);
        }
      }
    }
  }

  function drawPlants(state) {
    for (let row = 0; row < state.tiles.length; row += 1) {
      for (let col = 0; col < state.tiles[row].length; col += 1) {
        if (state.tiles[row][col] !== 'P') continue;
        const cx = col * TILE + TILE / 2;
        const cy = TILE_Y0 + row * TILE + TILE / 2;
        context.fillStyle = PALETTE.plant;
        context.beginPath();
        context.arc(cx - 7, cy + 4, 12, 0, Math.PI * 2);
        context.arc(cx + 8, cy - 3, 13, 0, Math.PI * 2);
        context.arc(cx + 2, cy + 9, 10, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = PALETTE.plantLight;
        context.beginPath();
        context.arc(cx - 4, cy - 4, 6, 0, Math.PI * 2);
        context.arc(cx + 9, cy + 5, 5, 0, Math.PI * 2);
        context.fill();
      }
    }
  }

  function drawLoot(state) {
    for (const item of state.loot) {
      if (item.taken) continue;
      if (item.kind === 'cash') {
        context.fillStyle = PALETTE.cash;
        context.fillRect(item.x - 11, item.y - 7, 22, 14);
        context.fillStyle = '#2e7d32';
        context.fillRect(item.x - 11, item.y - 2, 22, 4);
        context.fillStyle = '#e8f5e9';
        context.fillRect(item.x - 2, item.y - 5, 4, 10);
      } else {
        context.fillStyle = PALETTE.gold;
        context.beginPath();
        context.moveTo(item.x - 12, item.y + 7);
        context.lineTo(item.x - 8, item.y - 7);
        context.lineTo(item.x + 8, item.y - 7);
        context.lineTo(item.x + 12, item.y + 7);
        context.closePath();
        context.fill();
        context.fillStyle = '#fff8c4';
        context.fillRect(item.x - 6, item.y - 4, 12, 3);
      }
    }
    if (state.prize && !state.prize.taken) {
      const pulse = 0.5 + 0.5 * Math.sin(state.time * 3);
      context.save();
      context.globalAlpha = 0.25 + 0.2 * pulse;
      context.fillStyle = PALETTE.diamond;
      context.beginPath();
      context.arc(state.prize.x, state.prize.y, 34 + 6 * pulse, 0, Math.PI * 2);
      context.fill();
      context.restore();
      context.fillStyle = PALETTE.diamond;
      context.beginPath();
      context.moveTo(state.prize.x, state.prize.y - 14);
      context.lineTo(state.prize.x + 10, state.prize.y);
      context.lineTo(state.prize.x, state.prize.y + 14);
      context.lineTo(state.prize.x - 10, state.prize.y);
      context.closePath();
      context.fill();
      context.fillStyle = '#ffffff';
      context.beginPath();
      context.moveTo(state.prize.x, state.prize.y - 7);
      context.lineTo(state.prize.x + 5, state.prize.y);
      context.lineTo(state.prize.x, state.prize.y + 7);
      context.lineTo(state.prize.x - 5, state.prize.y);
      context.closePath();
      context.fill();
    }
    if (state.exit) {
      const open = state.exitOpen;
      context.fillStyle = open ? PALETTE.exit : PALETTE.exitLocked;
      context.fillRect(state.exit.x - 16, state.exit.y - 16, 32, 32);
      context.fillStyle = '#0d0f16';
      context.fillRect(state.exit.x - 11, state.exit.y - 11, 22, 22);
      context.fillStyle = open ? PALETTE.exit : '#9aa1b5';
      text('EXIT', state.exit.x, state.exit.y + 5, 11, open ? PALETTE.exit : '#9aa1b5', 'center');
    }
  }

  /** The polygon a cone of light covers, clipped by walls and desks. */
  function conePolygon(x, y, angle, halfAngle, range, tiles) {
    const points = [[x, y]];
    for (let index = 0; index <= CONE_RAYS; index += 1) {
      const a = angle - halfAngle + (2 * halfAngle * index) / CONE_RAYS;
      let r = range;
      for (let step = 8; step <= range; step += 8) {
        if (isSolidTile(tileAt(tiles, x + Math.cos(a) * step, y + Math.sin(a) * step))) {
          r = step;
          break;
        }
      }
      points.push([x + Math.cos(a) * r, y + Math.sin(a) * r]);
    }
    return points;
  }

  function fillCone(points, fill, edge) {
    context.beginPath();
    context.moveTo(points[0][0], points[0][1]);
    for (let index = 1; index < points.length; index += 1) context.lineTo(points[index][0], points[index][1]);
    context.closePath();
    context.fillStyle = fill;
    context.fill();
    context.strokeStyle = edge;
    context.lineWidth = 1.5;
    context.stroke();
  }

  function drawCones(state) {
    for (const guard of state.guards) {
      const fill =
        guard.state === GUARD_CHASE
          ? PALETTE.coneChase
          : guard.state === GUARD_SUSPICIOUS
            ? PALETTE.coneSuspicious
            : PALETTE.coneCalm;
      const edge = guard.state === GUARD_CHASE ? 'rgba(255, 60, 50, 0.7)' : PALETTE.coneCalmEdge;
      fillCone(
        conePolygon(guard.x, guard.y, guard.angle, 0.61, 235, state.tiles),
        fill,
        edge,
      );
    }
    for (const camera of state.cameras) {
      if (state.empTimer > 0) continue;
      fillCone(
        conePolygon(camera.x, camera.y, camera.currentAngle, 0.42, 270, state.tiles),
        camera.seesThief ? 'rgba(255, 60, 50, 0.28)' : PALETTE.coneCamera,
        camera.seesThief ? 'rgba(255, 60, 50, 0.7)' : 'rgba(255, 140, 40, 0.5)',
      );
    }
  }

  function drawCamerasAndLasers(state) {
    for (const camera of state.cameras) {
      const disabled = state.empTimer > 0;
      context.fillStyle = disabled ? PALETTE.cameraOff : PALETTE.cameraBody;
      context.beginPath();
      context.arc(camera.x, camera.y, 9, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = disabled ? '#333' : camera.seesThief ? '#ff2e3e' : '#ff8c28';
      context.beginPath();
      context.arc(camera.x, camera.y, 4, 0, Math.PI * 2);
      context.fill();
      // A short mount arm pointing back to the wall it hangs from.
      context.strokeStyle = disabled ? PALETTE.cameraOff : PALETTE.cameraBody;
      context.lineWidth = 4;
      context.beginPath();
      context.moveTo(camera.x, camera.y);
      context.lineTo(camera.x - Math.cos(camera.angle) * 12, camera.y - Math.sin(camera.angle) * 12);
      context.stroke();
    }
    if (state.empTimer === 0) {
      for (const laser of state.lasers) {
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
        context.save();
        context.globalAlpha = 0.35;
        context.strokeStyle = PALETTE.laser;
        context.lineWidth = 9;
        context.beginPath();
        context.moveTo(ax, ay);
        context.lineTo(bx, by);
        context.stroke();
        context.restore();
        context.strokeStyle = '#ff8fa3';
        context.lineWidth = 2;
        context.beginPath();
        context.moveTo(ax, ay);
        context.lineTo(bx, by);
        context.stroke();
        context.fillStyle = PALETTE.laser;
        context.fillRect(ax - 5, ay - 5, 10, 10);
        context.fillRect(bx - 5, by - 5, 10, 10);
      }
    }
  }

  function drawGuards(state) {
    for (const guard of state.guards) {
      context.fillStyle = PALETTE.guard;
      context.beginPath();
      context.arc(guard.x, guard.y, 14, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = PALETTE.guardCap;
      context.beginPath();
      context.arc(guard.x, guard.y - 3, 11, Math.PI, 0);
      context.fill();
      context.fillStyle = PALETTE.guardFace;
      context.beginPath();
      context.arc(guard.x + Math.cos(guard.angle) * 5, guard.y + Math.sin(guard.angle) * 5, 6, 0, Math.PI * 2);
      context.fill();
      // A suspicion ring over the guard's head fills as it grows sure of you.
      if (guard.suspicion > 0.05 && guard.state !== GUARD_CHASE) {
        context.strokeStyle = guard.suspicion >= 0.55 ? '#ff9628' : '#e8d44d';
        context.lineWidth = 3;
        context.beginPath();
        context.arc(guard.x, guard.y, 19, -Math.PI / 2, -Math.PI / 2 + guard.suspicion * Math.PI * 2);
        context.stroke();
      }
      if (guard.state === GUARD_CHASE) {
        text('!', guard.x, guard.y - 22, 26, '#ff4b3e', 'center');
      } else if (guard.state === GUARD_SUSPICIOUS || guard.state === 'investigate') {
        text('?', guard.x, guard.y - 22, 24, '#ff9628', 'center');
      }
    }
  }

  function drawThief(state) {
    const thief = state.thief;
    const hidden = tileAt(state.tiles, thief.x, thief.y) === 'P';
    context.save();
    if (thief.invulnerable > 0 && Math.floor(thief.invulnerable * 10) % 2 === 0) context.globalAlpha = 0.35;
    else if (hidden) context.globalAlpha = 0.6;
    // Hooded cloak: a dark body with a purple hood and a gold clasp.
    context.fillStyle = PALETTE.thief;
    context.beginPath();
    context.arc(thief.x, thief.y, 13, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = PALETTE.thiefHood;
    context.beginPath();
    context.arc(thief.x, thief.y - 2, 10, Math.PI, 0);
    context.fill();
    context.fillStyle = PALETTE.thiefTrim;
    context.beginPath();
    context.arc(thief.x + Math.cos(thief.angle) * 6, thief.y + Math.sin(thief.angle) * 6, 3, 0, Math.PI * 2);
    context.fill();
    context.restore();
    if (thief.sneaking) {
      context.save();
      context.setLineDash([4, 4]);
      context.strokeStyle = 'rgba(232, 212, 77, 0.6)';
      context.lineWidth = 1.5;
      context.beginPath();
      context.arc(thief.x, thief.y, 19, 0, Math.PI * 2);
      context.stroke();
      context.restore();
    }
    for (const ripple of state.coinRipples) {
      context.save();
      context.globalAlpha = Math.max(0, 1 - ripple.age / 1.2);
      context.strokeStyle = '#e8d44d';
      context.lineWidth = 2;
      context.beginPath();
      context.arc(ripple.x, ripple.y, 8 + ripple.age * 40, 0, Math.PI * 2);
      context.stroke();
      context.restore();
    }
  }

  function drawHud(state, ui) {
    context.fillStyle = PALETTE.hud;
    context.fillRect(0, 0, FIELD.width, FIELD.topBar);
    context.fillStyle = PALETTE.hudLine;
    context.fillRect(0, FIELD.topBar - 2, FIELD.width, 2);
    context.textBaseline = 'top';
    text(scoreLabel(state.score), 16, 10, 26, PALETTE.text, 'left');
    text(lootLabel(`${state.lootTaken}/${state.lootTotal} loot`), 16, 36, 14, PALETTE.muted, 'left');

    const prizeLine = state.exitOpen ? 'PRIZE TAKEN — reach the EXIT' : `PRIZE: ${state.prizeName}`;
    text(state.levelName, FIELD.width / 2, 8, 18, PALETTE.text, 'center');
    text(prizeLine, FIELD.width / 2, 32, 14, state.exitOpen ? PALETTE.exit : PALETTE.gold, 'center');

    // Hearts, timer and gadgets on the right.
    let right = FIELD.width - 16;
    text(timeLabel(formatTime(state.elapsed)), right, 10, 22, PALETTE.text, 'right');
    right -= 90;
    for (let heart = 0; heart < HEARTS; heart += 1) {
      text('♥', right - heart * 22, 8, 22, heart < state.hearts ? '#ff4b6e' : '#3a4157', 'right');
    }
    right -= HEARTS * 22 + 14;
    text(`◉ ${state.coins}   EMP ${state.emp}`, right, 10, 20, PALETTE.muted, 'right');

    // The alarm meter: the one number the whole heist turns on.
    const meterWidth = 210;
    const meterX = FIELD.width / 2 + 210;
    const meterY = 34;
    const alarmColour =
      state.alarm >= 75 ? PALETTE.alarmHigh : state.alarm >= 40 ? PALETTE.alarmMid : PALETTE.alarmLow;
    text('ALARM', meterX - 8, meterY - 2, 14, state.lockdown > 0 ? '#ff4b3e' : PALETTE.muted, 'right');
    context.fillStyle = '#1d2130';
    context.fillRect(meterX, meterY, meterWidth, 14);
    context.fillStyle = alarmColour;
    context.fillRect(meterX, meterY, Math.round((meterWidth * state.alarm) / 100), 14);
    context.strokeStyle = state.lockdown > 0 ? '#ff4b3e' : PALETTE.hudLine;
    context.lineWidth = 1;
    context.strokeRect(meterX, meterY, meterWidth, 14);
    if (state.lockdown > 0) {
      text('LOCKDOWN!', meterX + meterWidth + 10, meterY - 2, 14, '#ff4b3e', 'left');
    } else if (state.spotted) {
      text('SPOTTED!', meterX + meterWidth + 10, meterY - 2, 14, '#ff9628', 'left');
    }
    context.textBaseline = 'alphabetic';

    if (ui.toast) {
      context.save();
      context.globalAlpha = Math.max(0, 1 - ui.toastAge / 2.4);
      text(ui.toast, FIELD.width / 2, FIELD.topBar + 34, 22, PALETTE.toast, 'center');
      context.restore();
    }
  }

  function drawPanel(title, lines, prompt, accent) {
    const height = PANEL.top + lines.length * PANEL.line + PANEL.bottom;
    const x = (FIELD.width - PANEL.width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = PALETTE.panel;
    context.fillRect(x, y, PANEL.width, height);
    context.strokeStyle = accent || PALETTE.panelEdge;
    context.lineWidth = 2;
    context.strokeRect(x, y, PANEL.width, height);
    context.textBaseline = 'alphabetic';
    text(title, FIELD.width / 2, y + 74, 44, PALETTE.text, 'center');
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], FIELD.width / 2, y + PANEL.top + index * PANEL.line, 21, PALETTE.muted, 'center');
    }
    text(prompt, FIELD.width / 2, y + height - 36, 22, PALETTE.gold, 'center');
  }

  /** Paint one frame: the floor, then the HUD or a panel for the screen the game is on. */
  function draw(state, screen, best, ui) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    drawFloor(state);
    drawWallsAndDesks(state);
    drawPlants(state);
    drawLoot(state);
    drawCones(state);
    drawCamerasAndLasers(state);
    drawGuards(state);
    drawThief(state);
    if (screen === SCREEN_TITLE) {
      drawHud(state, { toast: null, toastAge: 0 });
      drawPanel(
        'VAULTBREAK',
        [
          'The Meridian Job — Rook and the crew hit the bank tonight.',
          'Lift the prize, then reach the EXIT. Stay out of the cones.',
          'WASD / arrows — move · SHIFT — sneak · Click — toss a coin',
          'E — EMP burst (cameras + lasers off) · P — pause · M — mute',
          best > 0 ? bestLabel(best) : 'No getaway yet — make this one clean.',
        ],
        'Press Space or click to start the heist',
      );
      return;
    }
    drawHud(state, ui);
    if (screen === SCREEN_PAUSED) {
      drawPanel('Paused', ['The guards will wait for you.'], 'Press P to keep sneaking');
    } else if (screen === SCREEN_LEVEL_CLEAR) {
      const lines = ui.clearLines ?? [];
      drawPanel('Floor cleared!', lines, 'Press Space for the next floor', PALETTE.exit);
    } else if (screen === SCREEN_OVER) {
      drawPanel(
        'CAUGHT!',
        [`${finalLabel(state.score)}`, bestLabel(best), 'The night watch drags Rook away.'],
        'Press Space or click to try again',
        PALETTE.alarmHigh,
      );
    } else if (screen === SCREEN_WIN) {
      const lines = ui.winLines ?? [];
      drawPanel('CLEAN GETAWAY!', lines, 'Press Space or click to run it back', PALETTE.exit);
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}
