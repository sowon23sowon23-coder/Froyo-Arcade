// Froyo Slice game loop. Owns the canvas: physics, spawning, slicing, effects and
// the froyo cup. React only renders the chrome around it (HUD, overlays, sheets).

import {
  FRUIT_KINDS,
  MAX_TOPPINGS,
  PALETTE,
  SIZE,
  cupLayout,
  drawCup,
  drawHalf,
  drawItem,
  slotPosition,
  type CupTopping,
  type FruitKind,
  type ItemKind,
} from './art';
import type { Sound } from './sound';

export const ROUND_SECONDS = 30;
export const POINTS_FRUIT = 10;
export const POINTS_COMBO = 20;
export const COMBO_MIN = 3;
export const POINTS_BOMB = -30;
const COUNTDOWN_STEP = 0.8; // seconds per "3", "2", "1"
const END_DELAY = 0.9; // let flying pieces land before the result

type Item = {
  id: number;
  kind: ItemKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  rot: number;
  vr: number;
  frozen?: boolean;
};

type Half = {
  kind: FruitKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  rot: number;
  vr: number;
  cut: number;
  side: 1 | -1;
  age: number;
  /** Set when this half is flying into the cup. */
  home?: { slot: number; fromX: number; fromY: number; fromR: number; t: number };
};

type Particle = { x: number; y: number; vx: number; vy: number; r: number; life: number; max: number; color: string };
type Popup = { x: number; y: number; text: string; color: string; life: number };
type TrailPoint = { x: number; y: number; t: number };

export type SliceResult = { score: number; sliced: number; cupImage: string };

export type SliceCallbacks = {
  onHud: (score: number, secondsLeft: number) => void;
  onCountdown: (n: number | null) => void;
  onPause: (paused: boolean) => void;
  onEnd: (result: SliceResult) => void;
};

type Phase = 'idle' | 'countdown' | 'playing' | 'ending' | 'over';

export function createSliceGame(canvas: HTMLCanvasElement, sound: Sound, cb: SliceCallbacks, fontFamily: string) {
  const ctx = canvas.getContext('2d')!;
  const listeners = new AbortController();
  const on = <K extends keyof HTMLElementEventMap>(el: EventTarget, type: K, fn: (e: HTMLElementEventMap[K]) => void) =>
    el.addEventListener(type, fn as EventListener, { signal: listeners.signal });

  let W = 0;
  let H = 0;
  let dpr = 1;
  let raf: number | null = null;
  let lastTs: number | null = null;
  let destroyed = false;

  let phase: Phase = 'idle';
  let paused = false;
  let clock = 0; // seconds since start(), only advances while running
  let countdownLeft = 0;
  let timeLeft = ROUND_SECONDS;
  let endTimer = 0;
  let spawnTimer = 0;
  let score = 0;
  let sliced = 0;
  let nextId = 1;
  let spawning = true;
  let lastHud = '';
  let lastCount: number | null = null;

  let items: Item[] = [];
  let halves: Half[] = [];
  let particles: Particle[] = [];
  let popups: Popup[] = [];
  let toppings: CupTopping[] = [];
  let reservedSlots = 0;
  let trail: TrailPoint[] = [];
  let stroke: { id: number; x: number; y: number; count: number; bonus: boolean } | null = null;

  const baseR = () => Math.max(24, Math.min(42, W * 0.075));
  const gravity = () => H * 1.45;

  /* ---------------- sizing ---------------- */
  function resize() {
    const rect = canvas.getBoundingClientRect();
    const nw = Math.max(1, rect.width);
    const nh = Math.max(1, rect.height);
    if (W && H && (nw !== W || nh !== H)) {
      const sx = nw / W,
        sy = nh / H;
      for (const o of [...items, ...halves, ...particles]) {
        o.x *= sx;
        o.y *= sy;
        o.vx *= sx;
        o.vy *= sy;
      }
      for (const p of popups) {
        p.x *= sx;
        p.y *= sy;
      }
      trail = [];
    }
    W = nw;
    H = nh;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    draw();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  /* ---------------- spawning ---------------- */
  function spawnInterval() {
    // gets a little busier toward the end of the round
    const progress = Math.min(1, (ROUND_SECONDS - timeLeft) / ROUND_SECONDS);
    return 1.0 - progress * 0.45 + Math.random() * 0.15;
  }
  function launch(kind: ItemKind) {
    const r = baseR() * SIZE[kind];
    const g = gravity();
    const x0 = W * (0.15 + Math.random() * 0.7);
    const peak = H * (0.42 + Math.random() * 0.32); // how high it rises from the bottom
    const vy = -Math.sqrt(2 * g * peak);
    const flight = (2 * -vy) / g;
    const xTarget = W * (0.12 + Math.random() * 0.76);
    items.push({
      id: nextId++,
      kind,
      x: x0,
      y: H + r,
      vx: (xTarget - x0) / flight,
      vy,
      r,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 3,
    });
  }
  function spawnWave() {
    const progress = (ROUND_SECONDS - timeLeft) / ROUND_SECONDS;
    const roll = Math.random();
    const count = progress < 0.33 ? (roll < 0.7 ? 1 : 2) : progress < 0.66 ? (roll < 0.45 ? 1 : roll < 0.9 ? 2 : 3) : roll < 0.3 ? 1 : roll < 0.75 ? 2 : 3;
    let bombUsed = false;
    for (let i = 0; i < count; i++) {
      const bomb = !bombUsed && clock > 3 && Math.random() < 0.14;
      if (bomb) bombUsed = true;
      launch(bomb ? 'bomb' : FRUIT_KINDS[Math.floor(Math.random() * FRUIT_KINDS.length)]!);
    }
  }

  /* ---------------- slicing ---------------- */
  function segmentHits(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, r: number) {
    const dx = bx - ax,
      dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, ((cx - ax) * dx + (cy - ay) * dy) / len2)) : 0;
    const px = ax + dx * t - cx,
      py = ay + dy * t - cy;
    return px * px + py * py <= r * r;
  }

  function addScore(delta: number) {
    score = Math.max(0, score + delta);
  }

  function sliceItem(item: Item, angle: number) {
    if (item.kind === 'bomb') {
      addScore(POINTS_BOMB);
      popups.push({ x: item.x, y: item.y - item.r, text: `${POINTS_BOMB}`, color: '#E5484D', life: 0.9 });
      for (let i = 0; i < 14; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = 60 + Math.random() * 140;
        particles.push({
          x: item.x,
          y: item.y,
          vx: Math.cos(a) * s,
          vy: Math.sin(a) * s - 40,
          r: item.r * (0.18 + Math.random() * 0.22),
          life: 0.6,
          max: 0.6,
          color: Math.random() < 0.7 ? '#4B5059' : '#9AA1AB',
        });
      }
      sound.play('bomb');
      return;
    }
    const kind = item.kind;
    addScore(POINTS_FRUIT);
    sliced++;
    popups.push({ x: item.x, y: item.y - item.r * 0.4, text: `+${POINTS_FRUIT}`, color: '#960953', life: 0.7 });
    const nx = -Math.sin(angle),
      ny = Math.cos(angle);
    const push = 90;
    for (const side of [-1, 1] as const) {
      halves.push({
        kind,
        x: item.x + nx * side * 2,
        y: item.y + ny * side * 2,
        vx: item.vx * 0.5 + nx * side * push,
        vy: Math.min(item.vy * 0.4, 0) + ny * side * push - 60,
        r: item.r,
        rot: 0,
        vr: side * (2 + Math.random() * 2),
        cut: angle,
        side,
        age: 0,
      });
    }
    // one half heads for the cup while there is room on the swirl
    if (reservedSlots < MAX_TOPPINGS) {
      const h = halves[halves.length - (Math.random() < 0.5 ? 1 : 2)]!;
      h.home = { slot: reservedSlots++, fromX: 0, fromY: 0, fromR: h.r, t: -0.22 };
    }
    const juice = PALETTE[kind].juice;
    for (let i = 0; i < 10; i++) {
      const a = angle + (Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2) + (Math.random() - 0.5) * 1.2;
      const s = 80 + Math.random() * 180;
      particles.push({
        x: item.x,
        y: item.y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        r: 1.5 + Math.random() * item.r * 0.09,
        life: 0.35 + Math.random() * 0.25,
        max: 0.6,
        color: juice,
      });
    }
    sound.play('slice');
  }

  function sliceAlong(ax: number, ay: number, bx: number, by: number) {
    if (!stroke) return;
    const angle = Math.atan2(by - ay, bx - ax);
    for (const item of items) {
      if (!segmentHits(ax, ay, bx, by, item.x, item.y, item.r)) continue;
      item.id = -item.id; // mark: each item scores once, then it's removed below
      sliceItem(item, angle);
      if (item.kind !== 'bomb') {
        stroke.count++;
        if (stroke.count >= COMBO_MIN && !stroke.bonus) {
          stroke.bonus = true;
          addScore(POINTS_COMBO);
          popups.push({ x: bx, y: by - 30, text: `Combo! +${POINTS_COMBO}`, color: '#5B8C1F', life: 1.1 });
          sound.play('combo');
        }
      }
    }
    items = items.filter((i) => i.id > 0);
    emitHud();
  }

  const pointFromEvent = (e: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  on(canvas, 'pointerdown', (e) => {
    sound.unlock();
    if (phase !== 'playing' || paused || stroke) return;
    e.preventDefault();
    canvas.setPointerCapture?.(e.pointerId);
    const p = pointFromEvent(e);
    stroke = { id: e.pointerId, x: p.x, y: p.y, count: 0, bonus: false };
    trail = [{ x: p.x, y: p.y, t: clock }];
  });
  on(canvas, 'pointermove', (e) => {
    if (!stroke || e.pointerId !== stroke.id || phase !== 'playing' || paused) return;
    const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    for (const ev of events.length ? events : [e]) {
      const p = pointFromEvent(ev);
      sliceAlong(stroke.x, stroke.y, p.x, p.y);
      stroke.x = p.x;
      stroke.y = p.y;
      trail.push({ x: p.x, y: p.y, t: clock });
    }
  });
  const endStroke = (e: PointerEvent) => {
    if (stroke && e.pointerId === stroke.id) stroke = null;
  };
  on(canvas, 'pointerup', endStroke);
  on(canvas, 'pointercancel', endStroke);
  on(canvas, 'lostpointercapture', endStroke);

  /* ---------------- pause on hide ---------------- */
  const opts = { signal: listeners.signal };
  document.addEventListener(
    'visibilitychange',
    () => {
      if (document.visibilityState === 'hidden') pause();
    },
    opts
  );
  window.addEventListener('pagehide', () => pause(), opts);

  function pause() {
    if (paused || phase === 'idle' || phase === 'over') return;
    paused = true;
    stroke = null;
    trail = [];
    stopLoop();
    draw();
    cb.onPause(true);
  }

  /* ---------------- loop ---------------- */
  function startLoop() {
    stopLoop();
    lastTs = null;
    const frame = (ts: number) => {
      raf = null;
      if (destroyed || paused) return;
      const dt = lastTs === null ? 0 : Math.min(0.05, (ts - lastTs) / 1000);
      lastTs = ts;
      update(dt);
      draw();
      if (phase !== 'over') raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
  }
  function stopLoop() {
    if (raf !== null) cancelAnimationFrame(raf);
    raf = null;
  }

  function emitHud() {
    const secs = Math.ceil(Math.max(0, timeLeft));
    const key = `${score}|${secs}`;
    if (key !== lastHud) {
      lastHud = key;
      cb.onHud(score, secs);
    }
  }

  function update(dt: number) {
    clock += dt;
    const g = gravity();

    if (phase === 'countdown') {
      countdownLeft -= dt;
      const n = Math.ceil(countdownLeft / COUNTDOWN_STEP);
      if (n !== lastCount) {
        lastCount = n;
        if (n > 0) {
          cb.onCountdown(n);
          sound.play('tick');
        }
      }
      if (countdownLeft <= 0) {
        phase = 'playing';
        cb.onCountdown(null);
        sound.play('go');
        spawnTimer = 0.3;
      }
    } else if (phase === 'playing') {
      timeLeft -= dt;
      spawnTimer -= dt;
      if (spawnTimer <= 0 && timeLeft > 0.6 && spawning) {
        spawnWave();
        spawnTimer = spawnInterval();
      }
      if (timeLeft <= 0) {
        timeLeft = 0;
        phase = 'ending';
        stroke = null;
        endTimer = END_DELAY;
        sound.play('end');
      }
      emitHud();
    } else if (phase === 'ending') {
      endTimer -= dt;
      const flying = halves.some((h) => h.home);
      if (endTimer <= 0 && (!flying || endTimer < -1.2)) finish();
    }

    for (const it of items) {
      if (it.frozen) continue;
      it.vy += g * dt;
      it.x += it.vx * dt;
      it.y += it.vy * dt;
      it.rot += it.vr * dt;
    }
    // missed fruit simply falls away (no penalty)
    items = items.filter((it) => !(it.vy > 0 && it.y - it.r > H + 10));

    const layout = cupLayout(W, H);
    for (const h of halves) {
      h.age += dt;
      if (h.home) {
        h.home.t += dt;
        if (h.home.t < 0) {
          // short burst apart before heading to the cup
          h.vy += g * dt * 0.5;
          h.x += h.vx * dt;
          h.y += h.vy * dt;
          h.rot += h.vr * dt;
          h.home.fromX = h.x;
          h.home.fromY = h.y;
          continue;
        }
        const T = 0.5;
        const k = Math.min(1, h.home.t / T);
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        const target = slotPosition(layout, h.home.slot);
        const arc = Math.sin(Math.PI * k) * Math.min(80, H * 0.1);
        h.x = h.home.fromX + (target.x - h.home.fromX) * e;
        h.y = h.home.fromY + (target.y - h.home.fromY) * e - arc;
        h.r = h.home.fromR + (layout.toppingR * SIZE[h.kind] - h.home.fromR) * e;
        h.rot += h.vr * dt * (1 - k);
        if (k >= 1) {
          toppings.push({ kind: h.kind, slot: h.home.slot, rot: h.rot + h.cut, side: h.side });
          toppings.sort((a, b) => a.slot - b.slot);
          h.age = Infinity;
        }
      } else {
        h.vy += g * dt;
        h.x += h.vx * dt;
        h.y += h.vy * dt;
        h.rot += h.vr * dt;
      }
    }
    halves = halves.filter((h) => h.age !== Infinity && h.y - h.r < H + 20);

    for (const p of particles) {
      p.life -= dt;
      p.vy += g * 0.6 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    particles = particles.filter((p) => p.life > 0);
    for (const p of popups) {
      p.life -= dt;
      p.y -= 40 * dt;
    }
    popups = popups.filter((p) => p.life > 0);
    trail = trail.filter((t) => clock - t.t < 0.12);
  }

  /* ---------------- drawing ---------------- */
  function draw() {
    if (!W || !H) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    drawCup(ctx, cupLayout(W, H), toppings, fontFamily);

    for (const h of halves) {
      ctx.save();
      ctx.translate(h.x, h.y);
      ctx.rotate(h.rot);
      drawHalf(ctx, h.kind, h.r, h.cut, h.side);
      ctx.restore();
    }
    for (const it of items) {
      ctx.save();
      ctx.translate(it.x, it.y);
      ctx.rotate(it.kind === 'bomb' ? 0 : it.rot);
      drawItem(ctx, it.kind, it.r, clock);
      ctx.restore();
    }
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // blade trail: tapered, fading toward the tail
    if (trail.length > 1) {
      drawBlade(14, 'rgba(150,9,83,0.16)');
      drawBlade(6, 'rgba(255,255,255,0.95)');
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const p of popups) {
      ctx.globalAlpha = Math.min(1, p.life / 0.3);
      ctx.font = `800 ${p.text.startsWith('Combo') ? 20 : 18}px ${fontFamily}`;
      // keep the label fully inside the play area
      const half = ctx.measureText(p.text).width / 2 + 8;
      const x = Math.max(half, Math.min(W - half, p.x));
      const y = Math.max(16, p.y);
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#fff';
      ctx.strokeText(p.text, x, y);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, x, y);
    }
    ctx.globalAlpha = 1;
  }

  /** One filled ribbon that tapers from the newest point (full width) to the tail. */
  function drawBlade(width: number, color: string) {
    const n = trail.length;
    const left: { x: number; y: number }[] = [];
    const right: { x: number; y: number }[] = [];
    for (let i = 0; i < n; i++) {
      const p = trail[i]!;
      const a = trail[Math.max(0, i - 1)]!;
      const b = trail[Math.min(n - 1, i + 1)]!;
      let dx = b.x - a.x,
        dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      dx /= len;
      dy /= len;
      const half = (width / 2) * (i / (n - 1));
      left.push({ x: p.x - dy * half, y: p.y + dx * half });
      right.push({ x: p.x + dy * half, y: p.y - dx * half });
    }
    const tip = trail[n - 1]!;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(left[0]!.x, left[0]!.y);
    for (const p of left) ctx.lineTo(p.x, p.y);
    for (let i = n - 1; i >= 0; i--) ctx.lineTo(right[i]!.x, right[i]!.y);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, width / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  /* ---------------- results ---------------- */
  function cupImage() {
    const cw = 240,
      ch = 210,
      scale = 2;
    const off = document.createElement('canvas');
    off.width = cw * scale;
    off.height = ch * scale;
    const c = off.getContext('2d')!;
    c.scale(scale, scale);
    const w = 150;
    drawCup(c, { cx: cw / 2, rimY: ch - 10 - w * 0.56, w, toppingR: w * 0.085 }, toppings, fontFamily);
    return off.toDataURL('image/png');
  }

  function finish() {
    phase = 'over';
    stopLoop();
    // fold any still-flying cup pieces in so the result cup matches what was earned
    for (const h of halves) {
      if (h.home) toppings.push({ kind: h.kind, slot: h.home.slot, rot: h.rot + h.cut, side: h.side });
    }
    toppings.sort((a, b) => a.slot - b.slot);
    halves = [];
    draw();
    emitHud();
    cb.onEnd({ score, sliced, cupImage: cupImage() });
  }

  return {
    /** Resets everything and runs the 3-2-1 countdown. Safe to call again for a restart. */
    start() {
      stopLoop();
      phase = 'countdown';
      paused = false;
      clock = 0;
      countdownLeft = COUNTDOWN_STEP * 3;
      lastCount = null;
      timeLeft = ROUND_SECONDS;
      score = 0;
      sliced = 0;
      items = [];
      halves = [];
      particles = [];
      popups = [];
      toppings = [];
      reservedSlots = 0;
      trail = [];
      stroke = null;
      spawning = true;
      lastHud = '';
      emitHud();
      startLoop();
    },
    resume() {
      if (!paused) return;
      paused = false;
      cb.onPause(false);
      startLoop();
    },
    /** Test hook: place items that hang still at fractional canvas positions. */
    debugPlace(list: { kind: ItemKind; x: number; y: number }[]) {
      for (const it of list)
        items.push({ id: nextId++, kind: it.kind, x: it.x * W, y: it.y * H, vx: 0, vy: 0, r: baseR() * SIZE[it.kind], rot: 0, vr: 0, frozen: true });
    },
    debugSpawning(on: boolean) {
      spawning = on;
    },
    debugState: () => ({ phase, score, sliced, timeLeft, items: items.length, toppings: toppings.length, paused }),
    destroy() {
      destroyed = true;
      stopLoop();
      ro.disconnect();
      listeners.abort();
    },
  };
}

export type SliceEngine = ReturnType<typeof createSliceGame>;
