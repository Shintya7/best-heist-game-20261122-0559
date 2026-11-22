// Vaultbreak: The Meridian Job — the two floors of the Meridian Bank as tile maps,
// with the guard patrols, the wall cameras and the laser grids that protect them.
//
// Tile legend:
//   '#' wall — solid, blocks sight        '.' marble floor
//   'D' teller desk — solid, blocks sight 'P' potted plant — walkable, hides the thief
//   'S' the thief's entry point           'E' the getaway exit
//   '*' the floor's prize                 '$' a cash stack (+50)   'G' a gold bar (+150)
//
// A row is 32 tiles; a floor is 18 rows. Guards walk axis-aligned waypoint loops;
// cameras sit on a wall tile and sweep their cone; lasers are beam segments that
// slide sideways across a doorway or corridor.

export const TILE_LEGEND = '#.DPSE*$G';

const LEVEL_1_MAP = [
  '################################',
  '#......$........#.......$......#',
  '#..DD...DD......#..DD...DD.....#',
  '#..DD...DD......#..DD...DD.....#',
  '#......P................P......#',
  '#..$........DD..#..DD.......$..#',
  '#...........DD..#..DD..........#',
  '#....P..........#........P.....#',
  '#.......$......G#.....$........#',
  '#..G..........*............G...#',
  '#...............#..............#',
  '#...$..P................P..$...#',
  '#..DD...DD......#..DD...DD.....#',
  '#..DD...DD......#..DD...DD.....#',
  '#......P........#.......P......#',
  '#..$............#...........$..#',
  '#..S........................E..#',
  '################################',
];

const LEVEL_2_MAP = [
  '################################',
  '#..$.......P............$.....G#',
  '#.DD....#########.....DD.......#',
  '#.DD....#.......#.....DD.......#',
  '#.......#...*...#......P.......#',
  '#..$....#.......#..............#',
  '#.......#####..##..............#',
  '#.DD.........P.................#',
  '#.DD....$.............DD.$.....#',
  '#.....................DD.......#',
  '#......P...$............P......#',
  '#....DD....DD......DD......DD..#',
  '#....DD....DD......DD......DD..#',
  '#..$.......P.............P$....#',
  '#........DD....DD..........$...#',
  '#..G.....DD....DD.......P......#',
  '#..S........................E..#',
  '################################',
];

import { TILE_Y0 } from './config.js';

/** Tile centre, in pixels. */
function at(col, row) {
  return { x: col * 40 + 20, y: TILE_Y0 + row * 40 + 20 };
}

export const LEVELS = [
  {
    name: 'Floor 1 — The Banking Hall',
    prizeName: 'The Gold Reserve',
    map: LEVEL_1_MAP,
    guards: [
      { name: 'Mara', waypoints: [at(5, 4), at(11, 4), at(11, 5), at(5, 5)] },
      { name: 'Dario', waypoints: [at(20, 7), at(26, 7), at(26, 10), at(20, 10)] },
      { name: 'Petra', waypoints: [at(5, 14), at(11, 14), at(11, 15), at(5, 15)] },
    ],
    cameras: [
      { x: 340, y: 76, angle: Math.PI / 2, sweep: 0.5 },
      { x: 1250, y: 436, angle: Math.PI, sweep: 0.45 },
    ],
    lasers: [],
  },
  {
    name: 'Floor 2 — The Vault',
    prizeName: 'The Meridian Diamond',
    map: LEVEL_2_MAP,
    guards: [
      { name: 'Mara', waypoints: [at(4, 1), at(7, 1), at(7, 5), at(4, 5)] },
      { name: 'Dario', waypoints: [at(19, 4), at(26, 4), at(26, 7), at(19, 7)] },
      { name: 'Petra', waypoints: [at(5, 13), at(8, 13), at(8, 15), at(5, 15)] },
      { name: 'Voss', waypoints: [at(21, 13), at(24, 13), at(24, 15), at(21, 15)] },
    ],
    cameras: [
      { x: 980, y: 76, angle: Math.PI / 2, sweep: 0.5 },
      { x: 20, y: 436, angle: 0, sweep: 0.45 },
      { x: 460, y: 316, angle: Math.PI / 2, sweep: 0.5 },
    ],
    lasers: [
      // Across the vault door: a horizontal beam that slides up and down.
      { ax: 320, ay: 316, bx: 680, by: 316, slide: 26, period: 3.2, phase: 0 },
      // Down the east corridor: a vertical beam that slides left and right.
      { ax: 1060, ay: 396, bx: 1060, by: 596, slide: 26, period: 4.1, phase: 1.3 },
    ],
  },
];

/** Parse one map into the pieces the world and the renderer need. */
export function parseLevel(level) {
  const tiles = level.map.map((row) => row.split(''));
  const loot = [];
  let start = null;
  let exit = null;
  let prize = null;
  for (let row = 0; row < tiles.length; row += 1) {
    for (let col = 0; col < tiles[row].length; col += 1) {
      const tile = tiles[row][col];
      const x = col * 40 + 20;
      const y = TILE_Y0 + row * 40 + 20;
      if (tile === 'S') start = { x, y };
      else if (tile === 'E') exit = { x, y };
      else if (tile === '*') prize = { x, y, taken: false };
      else if (tile === '$') loot.push({ kind: 'cash', x, y, taken: false });
      else if (tile === 'G') loot.push({ kind: 'gold', x, y, taken: false });
    }
  }
  return { tiles, loot, start, exit, prize };
}

/** A tile is solid when it stops feet and sight alike. */
export function isSolidTile(tile) {
  return tile === '#' || tile === 'D';
}

/** The tile at a pixel position, or '#' outside the floor. */
export function tileAt(tiles, x, y) {
  const col = Math.floor(x / 40);
  const row = Math.floor((y - TILE_Y0) / 40);
  if (row < 0 || row >= tiles.length || col < 0 || col >= tiles[row].length) return '#';
  return tiles[row][col];
}

/** True when the straight segment between two points crosses no solid tile. */
export function hasLineOfSight(tiles, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const distance = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(distance / 12));
  for (let step = 1; step < steps; step += 1) {
    const x = ax + (dx * step) / steps;
    const y = ay + (dy * step) / steps;
    if (isSolidTile(tileAt(tiles, x, y))) return false;
  }
  return true;
}
