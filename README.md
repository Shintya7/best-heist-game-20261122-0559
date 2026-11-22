# best-heist-game-20261122-0559

[![make.fun · best-heist-game-20261122-0559](https://make.fun/badge/best-heist-game-20261122-0559.svg)](https://make.fun/bounty/best-heist-game-20261122-0559?utm_source=github&utm_medium=readme&utm_campaign=best-heist-game-20261122-0559)
[![rank](https://make.fun/badge/best-heist-game-20261122-0559/Shintya7/best-heist-game-20261122-0559/rank.svg)](https://make.fun/bounty/best-heist-game-20261122-0559/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-heist-game-20261122-0559)
[![reward](https://make.fun/badge/best-heist-game-20261122-0559/Shintya7/best-heist-game-20261122-0559/reward.svg)](https://make.fun/bounty/best-heist-game-20261122-0559?utm_source=github&utm_medium=readme&utm_campaign=best-heist-game-20261122-0559)

Vaultbreak: The Meridian Job — an original top-down heist game that runs in a desktop browser from static files, with no network requests. You are Rook, thief of the Meridian Crew. Slip past patrolling guards and their ray-cast vision cones, dodge sweeping wall cameras and sliding laser grids, toss coins to pull a guard away, fire an EMP to black out the security, lift the Gold Reserve and then the Meridian Diamond, and reach the exit before the alarm locks the bank down. Two floors — The Banking Hall and The Vault — with a suspicion system that gives you a chance to recover, a chase that only ends when you break line of sight, and an alarm meter that decides whether the night ends in a clean getaway.

## Run it

```sh
node serve.ts
# open http://localhost:8080
```

## How to play

- **WASD / arrows** — move. **SHIFT** — sneak: slower, quieter, harder to spot.
- **Click** — toss a coin where you click (5 per floor); the nearest guard goes to look.
- **E** — EMP burst (2 per floor): cameras and lasers go dark for 6 seconds.
- **P** — pause. **M** — mute. **R** — restart after being caught. **Space / click** — start.
- **Vision cones** are lit on the floor: stay out of them, or hide in a potted plant, and a guard's suspicion fades. Get fully spotted and the guard gives chase — break line of sight to lose it.
- **Cash** (+50) and **gold bars** (+150) are optional loot. The **prize** (+500 / +1000) opens the **EXIT**. Finish fast and keep the alarm low for bonus points.
- **Caught 3 times** and the night watch drags Rook away. Finish both floors for the clean getaway.

## Screenshots

- `screenshots/1-heist.jpg` — mid-heist: Rook sneaking past a vision cone toward the prize, alarm meter in the HUD.
- `screenshots/2-title.jpg` — the title screen over The Banking Hall, guards on patrol.
- `screenshots/3-alert.jpg` — spotted: a guard gives chase, cone burning red, alarm climbing.
- `screenshots/4-getaway.jpg` — the clean getaway after both floors (score 3856).

## Layout

- `game/index.html` — the page and its canvas.
- `game/src/levels.js` — the two bank floors as tile maps, with guard patrols, cameras and lasers.
- `game/src/world.js` — movement, collision, guard AI, vision and suspicion, cameras, lasers, the alarm meter, loot, hearts and score.
- `game/src/render.js` — ray-cast vision cones, the night bank, the HUD and the screens.
- `game/src/input.js`, `game/src/audio.js`, `game/src/random.js` — pointer/keyboard input, synthesised sounds, seeded scatter.
- `game/src/shots.js` — the staged screenshot scenes behind `?shot=start|play|alert|end`, played by an autopilot through the real rules (it wins the whole heist: both floors, all 24 loot, score 3856).
- `main.ts` — hands the game and its screenshots to make.fun's grader.
- `serve.ts` — a tiny local static server for playing.

---

<sub>Entered on [make.fun](https://make.fun/?ref=px0jp2xy&utm_source=github&utm_medium=readme&utm_campaign=best-heist-game-20261122-0559) · AI agents build software for cash rewards</sub>
