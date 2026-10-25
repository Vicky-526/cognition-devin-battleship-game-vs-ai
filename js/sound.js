const STORAGE_KEY = 'battleship-sound-v1';

function loadEnabled() {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

export class SoundFX {
  constructor() {
    this.enabled = loadEnabled();
    this.ctx = null;
    this.master = null;
    this.noiseBuffer = null;
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    try {
      localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
    } catch { /* storage unavailable */ }
  }

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 2;
      this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  envelope(gainNode, t, vol, dur) {
    gainNode.gain.setValueAtTime(0.0001, t);
    gainNode.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  tone({ freq, to = freq, type = 'sine', dur = 0.15, vol = 0.3, delay = 0 }) {
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (to !== freq) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
    this.envelope(g, t, vol, dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  noise({ dur = 0.3, vol = 0.3, filter = 'lowpass', freq = 1000, to = freq, q = 1, delay = 0 }) {
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = this.ctx.createBiquadFilter();
    f.type = filter;
    f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (to !== freq) f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = this.ctx.createGain();
    this.envelope(g, t, vol, dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  play(name) {
    this.last = name;
    if (!this.enabled || !this.ensure()) return;
    const recipe = SOUNDS[name];
    if (recipe) recipe(this);
  }
}

const SOUNDS = {
  click: (s) => s.tone({ freq: 660, type: 'triangle', dur: 0.05, vol: 0.15 }),
  place: (s) => {
    s.tone({ freq: 220, to: 160, type: 'triangle', dur: 0.12, vol: 0.35 });
    s.noise({ dur: 0.08, vol: 0.12, filter: 'bandpass', freq: 900 });
  },
  pickup: (s) => s.tone({ freq: 300, to: 420, type: 'triangle', dur: 0.1, vol: 0.25 }),
  error: (s) => {
    s.tone({ freq: 170, type: 'square', dur: 0.09, vol: 0.12 });
    s.tone({ freq: 140, type: 'square', dur: 0.12, vol: 0.12, delay: 0.1 });
  },
  start: (s) => [392, 523, 659, 784].forEach((f, i) =>
    s.tone({ freq: f, type: 'triangle', dur: 0.18, vol: 0.25, delay: i * 0.1 })),
  fire: (s) => {
    s.tone({ freq: 140, to: 45, dur: 0.25, vol: 0.5 });
    s.noise({ dur: 0.22, vol: 0.25, filter: 'highpass', freq: 3000, to: 600 });
  },
  miss: (s) => {
    s.noise({ dur: 0.45, vol: 0.35, filter: 'bandpass', freq: 1400, to: 350, q: 0.8 });
    s.tone({ freq: 700, to: 250, dur: 0.18, vol: 0.12 });
  },
  hit: (s) => {
    s.noise({ dur: 0.7, vol: 0.7, filter: 'lowpass', freq: 2200, to: 90 });
    s.tone({ freq: 95, to: 30, dur: 0.55, vol: 0.6 });
  },
  sunk: (s) => {
    SOUNDS.hit(s);
    s.noise({ dur: 1.4, vol: 0.45, filter: 'lowpass', freq: 500, to: 60, delay: 0.15 });
    s.tone({ freq: 330, to: 80, type: 'sawtooth', dur: 1.1, vol: 0.12, delay: 0.25 });
  },
  win: (s) => [523, 659, 784, 1047].forEach((f, i) =>
    s.tone({ freq: f, type: 'triangle', dur: i === 3 ? 0.6 : 0.2, vol: 0.3, delay: 0.5 + i * 0.14 })),
  lose: (s) => [392, 311, 262, 196].forEach((f, i) =>
    s.tone({ freq: f, type: 'triangle', dur: i === 3 ? 0.8 : 0.28, vol: 0.3, delay: 0.5 + i * 0.25 })),
};
