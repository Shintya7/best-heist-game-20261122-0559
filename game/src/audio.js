// Synthesised WebAudio sounds: every beep, chime and sting is an oscillator, so the
// game loads no audio file and plays with no network request. The audio context is
// created on the first user gesture; until then every call is a silent no-op.

export function createAudio() {
  let context = null;
  let master = null;
  let muted = false;
  let lastStep = 0;

  function ensure() {
    if (context) return true;
    try {
      const AudioContext = window.AudioContext ?? window.webkitAudioContext;
      if (!AudioContext) return false;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = muted ? 0 : 0.22;
      master.connect(context.destination);
      return true;
    } catch {
      return false;
    }
  }

  function tone(frequency, duration, type, gainValue, when = 0, slideTo = null) {
    if (!ensure() || muted) return;
    if (context.state === 'suspended') void context.resume();
    const start = context.currentTime + when;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    if (slideTo !== null) oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), start + duration);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(gainValue, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.05);
  }

  return {
    /** Call from any user gesture so the browser lets sound play. */
    unlock() {
      ensure();
    },
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = muted ? 0 : 0.22;
    },
    isMuted() {
      return muted;
    },
    click() {
      tone(660, 0.07, 'sine', 0.4);
    },
    step() {
      const now = performance.now();
      if (now - lastStep < 240) return;
      lastStep = now;
      tone(140, 0.05, 'triangle', 0.18);
    },
    coinToss() {
      tone(880, 0.12, 'sine', 0.35, 0, 1320);
    },
    coinLand() {
      tone(520, 0.08, 'sine', 0.3);
    },
    pickup() {
      tone(880, 0.09, 'sine', 0.4);
      tone(1318, 0.14, 'sine', 0.4, 0.08);
    },
    prize() {
      tone(523, 0.12, 'triangle', 0.45);
      tone(659, 0.12, 'triangle', 0.45, 0.1);
      tone(784, 0.2, 'triangle', 0.45, 0.2);
      tone(1046, 0.3, 'triangle', 0.45, 0.3);
    },
    emp() {
      tone(1800, 0.35, 'sawtooth', 0.25, 0, 120);
      tone(90, 0.3, 'square', 0.2, 0.05, 40);
    },
    alarmSting() {
      tone(440, 0.22, 'sawtooth', 0.3, 0, 880);
      tone(440, 0.22, 'sawtooth', 0.3, 0.24, 880);
    },
    spotted() {
      tone(220, 0.3, 'sawtooth', 0.35, 0, 110);
    },
    caught() {
      tone(160, 0.5, 'sawtooth', 0.4, 0, 55);
      tone(110, 0.5, 'square', 0.25, 0.1, 40);
    },
    levelClear() {
      tone(659, 0.12, 'triangle', 0.4);
      tone(784, 0.12, 'triangle', 0.4, 0.1);
      tone(988, 0.25, 'triangle', 0.4, 0.2);
    },
    win() {
      const notes = [523, 659, 784, 1046, 784, 1046, 1318];
      notes.forEach((note, index) => tone(note, 0.18, 'triangle', 0.4, index * 0.11));
    },
  };
}
