// Tiny synthesized sound effects. The AudioContext is only created inside a user
// gesture (unlock), so browsers that block autoplay never complain.

export type Sfx = 'slice' | 'combo' | 'bomb' | 'tick' | 'go' | 'end';

const MUTE_KEY = 'froyo-arcade:slice:muted';

export function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function createSound() {
  let ctx: AudioContext | null = null;
  let muted = readMuted();
  let noise: AudioBuffer | null = null;
  let lastSlice = 0;

  const getNoise = (c: AudioContext) => {
    if (noise) return noise;
    noise = c.createBuffer(1, c.sampleRate * 0.3, c.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return noise;
  };

  const tone = (c: AudioContext, freq: number, at: number, dur: number, type: OscillatorType, gain: number, to?: number) => {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, at);
    if (to) o.frequency.exponentialRampToValueAtTime(to, at + dur);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(c.destination);
    o.start(at);
    o.stop(at + dur + 0.02);
  };

  const whoosh = (c: AudioContext, at: number, dur: number, from: number, to: number, gain: number) => {
    const src = c.createBufferSource();
    src.buffer = getNoise(c);
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(from, at);
    f.frequency.exponentialRampToValueAtTime(to, at + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(f).connect(g).connect(c.destination);
    src.start(at);
    src.stop(at + dur + 0.02);
  };

  return {
    /** Call from a click/pointerdown handler. */
    unlock() {
      try {
        if (!ctx) {
          const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
          if (!Ctx) return;
          ctx = new Ctx();
        }
        if (ctx.state === 'suspended') void ctx.resume();
      } catch {
        ctx = null;
      }
    },
    play(kind: Sfx) {
      if (muted || !ctx || ctx.state !== 'running') return;
      const c = ctx;
      const now = c.currentTime + 0.005;
      try {
        if (kind === 'slice') {
          // several fruits in one frame should sound like one cut
          if (now - lastSlice < 0.05) return;
          lastSlice = now;
          whoosh(c, now, 0.14, 2400, 700, 0.18);
          tone(c, 520 + Math.random() * 120, now, 0.09, 'triangle', 0.05, 300);
        } else if (kind === 'combo') {
          tone(c, 660, now, 0.09, 'triangle', 0.05);
          tone(c, 880, now + 0.08, 0.09, 'triangle', 0.05);
          tone(c, 1175, now + 0.16, 0.14, 'triangle', 0.055);
        } else if (kind === 'bomb') {
          tone(c, 140, now, 0.35, 'sine', 0.16, 50);
          whoosh(c, now, 0.3, 900, 120, 0.12);
        } else if (kind === 'tick') {
          tone(c, 660, now, 0.08, 'sine', 0.06);
        } else if (kind === 'go') {
          tone(c, 990, now, 0.16, 'sine', 0.07);
        } else if (kind === 'end') {
          tone(c, 880, now, 0.12, 'triangle', 0.05);
          tone(c, 660, now + 0.13, 0.22, 'triangle', 0.05);
        }
      } catch {
        // audio is optional
      }
    },
    isMuted: () => muted,
    setMuted(value: boolean) {
      muted = value;
      try {
        localStorage.setItem(MUTE_KEY, value ? '1' : '0');
      } catch {
        // ignore
      }
    },
    close() {
      void ctx?.close().catch(() => undefined);
      ctx = null;
    },
  };
}

export type Sound = ReturnType<typeof createSound>;
