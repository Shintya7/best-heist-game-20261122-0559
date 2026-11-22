// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s
// steps (several in a slow frame, none in a fast one), and the renderer paints what is
// there. The game moves between six screens: title, play, paused, level clear, caught
// and the clean getaway.
//
// ?seed=N fixes the scattered details. ?shot=start|play|alert|end (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { BEST_KEY, FIELD, STEP } from './config.js';
import { createRandom } from './random.js';
import {
  EVENT_ALARM, EVENT_CAUGHT, EVENT_COIN, EVENT_EMP, EVENT_LEVEL_CLEAR, EVENT_LOCKDOWN,
  EVENT_LOOT, EVENT_OVER, EVENT_PRIZE, EVENT_SPOTTED, EVENT_WIN, createWorld,
} from './world.js';
import {
  ACTION_CONFIRM, ACTION_EMP, ACTION_MUTE, ACTION_PAUSE, ACTION_RESTART, createInput,
} from './input.js';
import { createAudio } from './audio.js';
import {
  SCREEN_LEVEL_CLEAR, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN,
  createRenderer,
} from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best, scene.ui);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas, (clientX, clientY) => {
    const rect = canvas.getBoundingClientRect();
    const scale = Math.min(rect.width / FIELD.width, rect.height / FIELD.height);
    const offsetX = (rect.width - FIELD.width * scale) / 2;
    const offsetY = (rect.height - FIELD.height * scale) / 2;
    return { x: (clientX - offsetX) / scale, y: (clientY - offsetY) / scale };
  });
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let toast = null;
  let toastAge = 0;
  let clearLines = [];
  let winLines = [];
  let alarmStingAt = 0;

  // The play-test and the screenshot scripts read the live game through this.
  window.__heist = {
    get screen() {
      return screen;
    },
    get state() {
      return world.state;
    },
    get best() {
      return best;
    },
  };

  // Screen readers (and anyone watching the page's text) hear the screen changes.
  function announce(message) {
    status.textContent = message;
  }

  function say(message) {
    toast = message;
    toastAge = 0;
  }

  function startGame() {
    audio.unlock();
    world.reset();
    accumulator = 0;
    toast = null;
    screen = SCREEN_PLAY;
    announce(`Playing. ${world.state.levelName}. Lift the prize, then reach the exit.`);
  }

  function finishRun(won) {
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    if (won) {
      screen = SCREEN_WIN;
      winLines = [
        `Score ${world.state.score} — best ${best}`,
        `Loot ${world.state.lootTaken} pieces · ${world.state.alerts} full alerts · ${Math.floor(world.state.totalTime)}s on the job`,
        'The Meridian Diamond is gone before the first alarm is raised.',
      ];
      announce(`Clean getaway. Score ${world.state.score}.`);
    } else {
      screen = SCREEN_OVER;
      announce(`Caught. Score ${world.state.score}. Best ${best}.`);
    }
  }

  function handleEvents(events) {
    if (events & EVENT_LOOT) {
      audio.pickup();
      say('Loot lifted.');
    }
    if (events & EVENT_PRIZE) {
      audio.prize();
      say('Prize lifted — reach the EXIT!');
      announce('Prize lifted. The exit is open.');
    }
    if (events & EVENT_COIN) {
      audio.coinToss();
      say('Coin tossed — a guard goes to look.');
    }
    if (events & EVENT_EMP) {
      audio.emp();
      say('EMP burst — cameras and lasers dark.');
    }
    if (events & EVENT_SPOTTED) {
      audio.spotted();
      say('SPOTTED! Break line of sight!');
    }
    if (events & EVENT_ALARM) {
      if (world.state.alarm > 60 && world.state.time - alarmStingAt > 4) {
        alarmStingAt = world.state.time;
        audio.alarmSting();
      }
    }
    if (events & EVENT_LOCKDOWN) {
      audio.alarmSting();
      say('LOCKDOWN! Every guard is coming for you!');
      announce('Lockdown. Every guard is chasing.');
    }
    if (events & EVENT_CAUGHT) {
      audio.caught();
      say(`Caught! ${world.state.hearts} ${world.state.hearts === 1 ? 'heart' : 'hearts'} left.`);
    }
    if (events & EVENT_LEVEL_CLEAR) {
      audio.levelClear();
      const state = world.state;
      clearLines = [
        `Score ${state.score} · Loot ${state.lootTaken}/${state.lootTotal}`,
        `Time bonus and a calm bonus are already in the score.`,
        `Next floor: ${state.levelName} — ${state.prizeName} waits inside.`,
      ];
      screen = SCREEN_LEVEL_CLEAR;
      announce(`Floor cleared. Score ${state.score}.`);
    }
    if (events & EVENT_WIN) {
      audio.win();
      finishRun(true);
    } else if (events & EVENT_OVER) {
      audio.caught();
      finishRun(false);
    }
  }

  let pendingEmp = false;

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      audio.setMuted(!audio.isMuted());
      say(audio.isMuted() ? 'Sound off.' : 'Sound on.');
    }
    if (actions & ACTION_RESTART && (screen === SCREEN_OVER || screen === SCREEN_WIN)) {
      startGame();
      return;
    }
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_WIN)) {
      startGame();
      return;
    }
    if (actions & ACTION_CONFIRM && screen === SCREEN_LEVEL_CLEAR) {
      screen = SCREEN_PLAY;
      announce('Playing.');
      return;
    }
    if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
    if (actions & ACTION_EMP && screen === SCREEN_PLAY) {
      // The EMP is spent on the next world step.
      pendingEmp = true;
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, { dx: 0, dy: 0, sneak: false, emp: false, click: null }, true);
      return;
    }
    const direction = input.direction();
    const click = input.takeClick();
    const events = world.step(
      STEP,
      {
        dx: direction.dx,
        dy: direction.dy,
        sneak: direction.sneak,
        emp: pendingEmp,
        click: screen === SCREEN_PLAY ? click : null,
      },
      false,
    );
    pendingEmp = false;
    if (direction.dx !== 0 || direction.dy !== 0) audio.step();
    handleEvents(events);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    accumulator += dt;
    handleActions();
    if (toast !== null) toastAge += dt;
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best, { toast, toastAge, clearLines, winLines });
  }

  // Leaving the tab pauses a running game rather than letting guards close in unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Vaultbreak: The Meridian Job. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
