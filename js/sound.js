const STORAGE_KEY = 'battleship-sound-v1';
const MASTER_VOLUME = 0.5;

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
    this.active = new Set();
    this.unlocked = false;
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (this.master) {
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setValueAtTime(enabled ? MASTER_VOLUME : 0, t);
    }
    if (!enabled) this.stopAll();
    try {
      localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
    } catch { /* storage unavailable */ }
  }

  stopAll() {
    for (const src of this.active) {
      try { src.stop(); } catch { /* already stopped */ }
    }
    this.active.clear();
  }

  track(src) {
    this.active.add(src);
    src.onended = () => this.active.delete(src);
  }

  // Browsers only allow audio after a user gesture; iOS also needs a sound
  // started inside that gesture, and mutes Web Audio on the silent switch
  // unless the page declares itself a playback session.
  unlock() {
    if (!this.enabled || this.unlocked) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const src = ctx.createBufferSource();
    src.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    src.connect(ctx.destination);
    src.start(0);
    if (ctx.state === 'running') this.unlocked = true;
    else ctx.resume().then(() => { this.unlocked = ctx.state === 'running'; }).catch(() => {});
  }

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try {
        if (navigator.audioSession) navigator.audioSession.type = 'playback';
      } catch { /* unsupported */ }
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = MASTER_VOLUME;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 2;
      this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
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
    this.track(osc);
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
    this.track(src);
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
