// Froyo Crush match-3 engine, ported from the original assets/game.js.
// Matching, specials, ice, cookies, boosters, scoring and level progression are
// unchanged. What changed: it only touches DOM inside its own root, and every
// timer, animation frame, listener and the audio context is released by destroy().

import {
  BLOCK,
  LEVELS,
  TYPES,
  WORLDS,
  WORLD_SIZE,
  currentLevelOf,
  layoutCell,
  loadCrushState,
  saveCrushState,
  worldOf,
  type CrushState,
  type Level,
} from './levels';

type Special = 'line-h' | 'line-v' | 'bomb' | null;
type Tile = { type: number; special: Special; el: HTMLDivElement; block: boolean; r: number; c: number };
type Group = { tiles: Tile[]; dir: 'h' | 'v' };
type Grid = (Tile | null)[][];

export type ClearResult = { level: Level; stars: number; score: number; next: Level | null; continueLevel: Level };
export type FailResult = { level: Level; needed: string };

export type CrushCallbacks = {
  onClear: (result: ClearResult) => void;
  onFail: (result: FailResult) => void;
  /** A level node on the map was picked; the host should show the board and call startLevel(). */
  onPickLevel: () => void;
  /** The in-game menu button was pressed. */
  onMenu: () => void;
};

export type CrushEngine = ReturnType<typeof createCrushGame>;

const C = 8;
const R = 8;
const pad2 = (n: number) => String(n).padStart(2, '0');

export function createCrushGame(root: HTMLElement, cb: CrushCallbacks) {
  const $ = <T extends HTMLElement = HTMLElement>(ref: string) => root.querySelector<T>(`[data-ref="${ref}"]`)!;
  const listeners = new AbortController();
  const on = <K extends keyof HTMLElementEventMap>(
    el: EventTarget,
    type: K,
    fn: (e: HTMLElementEventMap[K]) => void
  ) => el.addEventListener(type, fn as EventListener, { signal: listeners.signal });

  let destroyed = false;
  const timeouts = new Set<number>();
  const frames = new Set<number>();
  const later = (fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timeouts.delete(id);
      if (!destroyed) fn();
    }, ms);
    timeouts.add(id);
    return id;
  };
  const cancelLater = (id: number | null) => {
    if (id === null) return;
    clearTimeout(id);
    timeouts.delete(id);
  };
  const frame = (fn: () => void) => {
    const id = requestAnimationFrame(() => {
      frames.delete(id);
      if (!destroyed) fn();
    });
    frames.add(id);
    return id;
  };
  // After destroy() the pending timeouts are cleared, so in-flight async chains simply stop.
  const sleep = (ms: number) => new Promise<void>((resolve) => void later(resolve, ms));

  let state: CrushState = loadCrushState();
  const saveState = () => saveCrushState(state);
  const currentLevel = () => currentLevelOf(state);

  const board = $<HTMLDivElement>('board');
  let grid: Grid = [];
  let busy = false;
  let sel: Tile | null = null;
  let moves = 18;
  let goal = 15;
  let score = 0;
  let armed: 'bomb' | 'hammer' | null = null;
  let boosters = { shuffle: 3, bomb: 2, hammer: 1 };
  let targetScore = 6000;
  let ice: number[][] = [];
  let iceEls: (HTMLDivElement | null)[][] = [];
  // Pending clear/fail result. Guards against the original bug where a swap made
  // during the short pause before the result fired a second clear (crediting the
  // next level without playing it).
  let endTimer: number | null = null;
  const cancelEnd = () => {
    cancelLater(endTimer);
    endTimer = null;
  };

  /* ---------------- goals ---------------- */
  function levelGoal(level: Level) {
    if (level.mode === 'ice' || level.mode === 'blocks') {
      let n = 0;
      for (let r = 0; r < 8; r++)
        for (let c = 0; c < 8; c++) {
          const ch = layoutCell(level, r, c);
          if (level.mode === 'ice') n += ch === 'I' ? 2 : ch === 'i' ? 1 : 0;
          else n += ch === 'c' ? 1 : 0;
        }
      return n;
    }
    return level.goal || 0;
  }
  function isGoalComplete() {
    return currentLevel().mode === 'score' ? score >= targetScore : goal <= 0;
  }
  function goalHits(hits: Tile[]) {
    const level = currentLevel();
    if (level.mode === 'collect') return hits.filter((t) => t.type === level.targetType);
    if (level.mode === 'blocks') return hits.filter((t) => t.block);
    return [];
  }
  function goalText() {
    const level = currentLevel();
    if (level.mode === 'score') return Math.max(0, targetScore - score).toLocaleString();
    return 'x' + Math.max(0, goal);
  }
  function goalIcon() {
    const level = currentLevel();
    if (level.mode === 'score') return '★';
    if (level.mode === 'ice') return '🧊';
    if (level.mode === 'blocks') return TYPES[BLOCK]!.e;
    return TYPES[level.targetType ?? 0]!.e;
  }
  function typeName(type: number) {
    return ['strawberries', 'blueberries', 'kiwis', 'mangoes', 'chocolates', 'mochi'][type] || 'toppings';
  }
  function goalLeftText() {
    const level = currentLevel();
    if (level.mode === 'score') return Math.max(0, targetScore - score).toLocaleString() + ' points';
    const n = Math.max(0, goal);
    if (level.mode === 'ice') return n + ' more ice';
    if (level.mode === 'blocks') return n + ' more cookie' + (n === 1 ? '' : 's');
    return n + ' more ' + typeName(level.targetType ?? 0);
  }

  /* ---------------- level map ---------------- */
  function swirlPoint(t: number) {
    const cx = 180,
      baseY = 506,
      topY = 112,
      TURNS = 3.05;
    const a = -Math.PI / 2 + t * TURNS * 2 * Math.PI;
    const rx = 100 * (1 - t * 0.8);
    const ry = 27 * (1 - t * 0.55);
    return {
      x: cx + rx * Math.cos(a),
      y: baseY - t * (baseY - topY) + ry * Math.sin(a),
      r: 36 * (1 - t * 0.74),
      front: Math.sin(a),
    };
  }

  let mapWorld = 0;
  function shiftWorld(d: number) {
    const next = mapWorld + d;
    if (next < 0 || next > worldOf(LEVELS.length)) return;
    mapWorld = next;
    blip(660, 0.05);
    buildMap();
  }
  function fitMap() {
    const wrap = $('mapWrap');
    const host = $('swirlMap');
    const s = Math.min(1, wrap.clientWidth / 360 || 1);
    host.style.transform = `translateX(-50%) scale(${s})`;
    wrap.style.height = `${640 * s}px`;
  }
  function buildMap() {
    const host = $('swirlMap');
    const world = WORLDS[mapWorld] || WORLDS[0]!;
    const lastWorld = worldOf(LEVELS.length);
    $('worldName').innerHTML = `World ${mapWorld + 1} <small>${world.name}</small>`;
    $<HTMLButtonElement>('worldPrev').disabled = mapWorld <= 0;
    $<HTMLButtonElement>('worldNext').disabled = mapWorld >= lastWorld;
    $('mapWrap').style.background = `linear-gradient(${world.sky[0]} 0%, ${world.sky[1]} 55%, ${world.sky[2]} 100%)`;
    let blobs = '';
    for (let i = 0; i <= 190; i++) {
      const p = swirlPoint(i / 190);
      blobs += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${p.r.toFixed(1)}" fill="url(#swg)" stroke="${world.tint}" stroke-width="1" stroke-opacity=".5"/>`;
    }
    host.innerHTML = `
    <svg viewBox="0 0 360 640" width="360" height="640" aria-hidden="true">
      <defs>
        <radialGradient id="swg" cx="34%" cy="28%" r="78%">
          <stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="${world.tint}"/>
        </radialGradient>
        <linearGradient id="cup" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#F6E5EC"/><stop offset=".45" stop-color="#FFFFFF"/><stop offset="1" stop-color="#EBD3DE"/>
        </linearGradient>
      </defs>
      <ellipse cx="180" cy="612" rx="108" ry="16" fill="#8A0B44" opacity=".14"/>
      ${blobs}
      <path d="M74 500h212l-20 96a16 16 0 0 1-16 13H110a16 16 0 0 1-16-13z" fill="url(#cup)" stroke="#E4C7D5" stroke-width="2"/>
      <ellipse cx="180" cy="500" rx="106" ry="15" fill="#FFFFFF" stroke="#E4C7D5" stroke-width="2"/>
      <text x="180" y="558" text-anchor="middle" font-family="var(--font)" font-size="19" font-weight="800" fill="#960953">Yogurtland</text>
      <text x="180" y="574" text-anchor="middle" font-family="var(--font)" font-size="9" font-weight="700" fill="#5B8C1F">get real.</text>
    </svg>`;

    // hand-tuned so nodes, stars and toppings never overlap (the swirl is a flat ellipse,
    // so evenly spaced t values stack levels 3 and 4 on top of each other)
    const NODE_T = [0.069, 0.218, 0.384, 0.518, 0.62, 0.786, 0.918];
    const boxes: { x0: number; x1: number; y0: number; y1: number }[] = [];
    const addBox = (x: number, y: number, w: number, h: number) =>
      boxes.push({ x0: x - w / 2, x1: x + w / 2, y0: y - h / 2, y1: y + h / 2 });

    const toppings: [number, number, number][] = [
      [0.1, 22, -56],
      [0.24, 18, -50],
      [0.38, 20, -44],
      [0.52, 17, -38],
      [0.66, 16, 27],
      [0.8, 14, -26],
    ];
    toppings.forEach(([t, s, dx], k) => {
      const p = swirlPoint(t + 0.055);
      const d = document.createElement('div');
      d.className = 'topping';
      d.style.cssText = `left:${p.x + dx}px;top:${p.y + 4}px;font-size:${s}px`;
      d.textContent = world.toppings[k] ?? '';
      host.appendChild(d);
      addBox(p.x + dx, p.y + 4, s, s);
    });

    let here: ReturnType<typeof swirlPoint> | null = null;
    LEVELS.slice(mapWorld * WORLD_SIZE, (mapWorld + 1) * WORLD_SIZE).forEach((level, i) => {
      const lvl = level.n,
        t = NODE_T[i]!,
        p = swirlPoint(t);
      const nodeState = lvl === state.currentLevel ? 'now' : lvl <= state.unlockedLevel ? 'done' : 'lock';
      const n = document.createElement('button');
      n.type = 'button';
      n.className = 'node ' + nodeState;
      n.style.left = p.x + 'px';
      n.style.top = p.y + 'px';
      const sc = 1 - t * 0.22;
      n.style.scale = String(sc);
      n.textContent = nodeState === 'lock' ? '🔒' : String(lvl);
      n.setAttribute('aria-label', nodeState === 'lock' ? `Level ${lvl}, locked` : `Play level ${lvl}: ${level.name}`);
      if (nodeState === 'lock') n.disabled = true;
      else
        n.onclick = () => {
          state.currentLevel = lvl;
          saveState();
          blip(660, 0.05);
          cb.onPickLevel();
        };
      host.appendChild(n);
      addBox(p.x, p.y + 2, 52 * sc, 57 * sc);

      const st = document.createElement('div');
      st.className = 'stars';
      st.style.left = p.x + 'px';
      st.style.top = p.y + 30 * sc + 'px';
      st.style.fontSize = 12 * sc + 'px';
      const earned = state.stars[lvl] || 0;
      st.textContent = earned ? '★'.repeat(earned) + '☆'.repeat(3 - earned) : nodeState === 'now' ? '' : '☆☆☆';
      st.style.opacity = nodeState === 'lock' ? '.35' : '1';
      host.appendChild(st);
      addBox(p.x, p.y + 30 * sc + 3, 34 * sc, 14 * sc);

      if (nodeState === 'now') here = p;
    });

    // put the label in the free spot closest to the current node
    if (here) {
      const h = here as ReturnType<typeof swirlPoint>;
      const W = 88,
        H = 24;
      const free = (x: number, y: number) =>
        x - W / 2 >= 8 &&
        x + W / 2 <= 352 &&
        !boxes.some((b) => x - W / 2 < b.x1 && x + W / 2 > b.x0 && y - H / 2 < b.y1 && y + H / 2 > b.y0);
      let best: { d: number; dx: number; dy: number } | null = null;
      for (let dx = -120; dx <= 120; dx += 4)
        for (let dy = -70; dy <= 70; dy += 4) {
          const d = Math.hypot(dx, dy * 1.6);
          if ((!best || d < best.d) && free(h.x + dx, h.y + dy)) best = { d, dx, dy };
        }
      if (best) {
        const y = document.createElement('div');
        y.className = 'youhere';
        y.style.left = h.x + best.dx + 'px';
        y.style.top = h.y + best.dy + 'px';
        y.textContent = 'YOU ARE HERE';
        host.appendChild(y);
      }
    }
    fitMap();
  }

  /* ---------------- sound + feedback ---------------- */
  let actx: AudioContext | null = null;
  function blip(freq: number, dur = 0.08, type: OscillatorType = 'sine', vol = 0.05) {
    if (destroyed || !state.settings.sound) return;
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      actx = actx || new Ctx();
      const o = actx.createOscillator(),
        g = actx.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.value = vol;
      o.connect(g);
      g.connect(actx.destination);
      o.start();
      g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
      o.stop(actx.currentTime + dur + 0.02);
    } catch {
      // audio can be unavailable; the game doesn't need it
    }
  }
  function buzz(ms: number | number[]) {
    if (destroyed || !state.settings.vibration) return;
    try {
      navigator.vibrate?.(ms);
    } catch {
      // ignore
    }
  }
  function restart(el: HTMLElement, cls: string) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }
  function flashScreen() {
    restart($('flash'), 'go');
  }
  function showBanner(txt: string) {
    const b = $('banner');
    b.textContent = txt;
    restart(b, 'go');
  }
  function shockwave(hits: Tile[]) {
    const s = cell();
    const mx = (hits.reduce((a, t) => a + t.c, 0) / hits.length) * s + s / 2;
    const my = (hits.reduce((a, t) => a + t.r, 0) / hits.length) * s + s / 2;
    const w = document.createElement('div');
    w.className = 'wave';
    w.style.left = mx + 'px';
    w.style.top = my + 'px';
    w.style.width = w.style.height = '20px';
    board.appendChild(w);
    w.animate(
      [
        { width: '20px', height: '20px', opacity: 0.85 },
        { width: s * 3.4 + 'px', height: s * 3.4 + 'px', opacity: 0 },
      ],
      { duration: 480, easing: 'cubic-bezier(.2,.7,.3,1)' }
    ).onfinish = () => w.remove();
  }
  function flyToGoal(t: Tile, delay: number) {
    const pr = root.getBoundingClientRect();
    const tr = t.el.getBoundingClientRect();
    const target = $('goalIcon').getBoundingClientRect();
    const f = document.createElement('div');
    f.className = 'flyer';
    f.textContent = TYPES[t.type]!.e;
    f.style.left = tr.left - pr.left + tr.width / 2 + 'px';
    f.style.top = tr.top - pr.top + tr.height / 2 + 'px';
    root.appendChild(f);
    const dx = target.left - tr.left + (target.width - tr.width) / 2;
    const dy = target.top - tr.top + (target.height - tr.height) / 2;
    f.animate(
      [
        { transform: 'translate(-50%,-50%) scale(1)' },
        { transform: `translate(calc(-50% + ${dx * 0.4}px), calc(-50% + ${dy * 0.4 - 46}px)) scale(1.3)`, offset: 0.45 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.4)`, opacity: 0.85 },
      ],
      { duration: 620, delay: delay || 0, fill: 'backwards', easing: 'cubic-bezier(.45,0,.25,1)' }
    ).onfinish = () => {
      f.remove();
      if (!destroyed) popGoal();
    };
  }
  function popGoal() {
    restart($('goalStat'), 'bump');
    blip(980, 0.05, 'sine', 0.035);
  }
  let shownScore = 0;
  let rollRaf: number | null = null;
  function rollScore() {
    if (rollRaf !== null) {
      cancelAnimationFrame(rollRaf);
      frames.delete(rollRaf);
    }
    const el = $('scoreVal');
    const step = () => {
      const d = score - shownScore;
      if (Math.abs(d) < 1.2) shownScore = score;
      else shownScore += d * 0.2;
      el.textContent = Math.round(shownScore).toLocaleString();
      rollRaf = shownScore !== score ? frame(step) : null;
    };
    step();
  }

  /* hints + deadlock */
  let hintTimer: number | null = null;
  let hinted: Tile[] = [];
  function clearHint() {
    hinted.forEach((t) => t.el.classList.remove('hint'));
    hinted = [];
    cancelLater(hintTimer);
    hintTimer = null;
  }
  function scheduleHint() {
    clearHint();
    hintTimer = later(() => {
      hintTimer = null;
      const m = findMove();
      if (!m) return;
      hinted = m;
      m.forEach((t) => t.el.classList.add('hint'));
    }, 4500);
  }
  function findMove(): Tile[] | null {
    for (let r = 0; r < R; r++)
      for (let c = 0; c < C; c++) {
        for (const [dr, dc] of [
          [0, 1],
          [1, 0],
        ] as const) {
          const r2 = r + dr,
            c2 = c + dc;
          if (r2 >= R || c2 >= C) continue;
          const a = grid[r]![c],
            b = grid[r2]![c2];
          if (!a || !b || a.block || b.block) continue;
          grid[r]![c] = b;
          grid[r2]![c2] = a;
          const ok = matchesAt(grid).length > 0;
          grid[r]![c] = a;
          grid[r2]![c2] = b;
          if (ok) return [a, b];
        }
      }
    return null;
  }
  async function shuffleBoard() {
    // cookies stay put; only real toppings are reshuffled, and never into a dead board
    const tiles: Tile[] = [];
    for (let r = 0; r < R; r++)
      for (let c = 0; c < C; c++) {
        const t = grid[r]![c];
        if (t && !t.block) tiles.push(t);
      }
    const types = tiles.map((t) => t.type);
    for (let tries = 0; tries < 30; tries++) {
      types.sort(() => Math.random() - 0.5);
      tiles.forEach((o, i) => (o.type = types[i]!));
      if (findMove()) break;
    }
    tiles.forEach((o) => {
      paintTile(o);
      o.el.animate([{ rotate: '0deg' }, { rotate: '360deg' }], { duration: 430, delay: (o.r + o.c) * 12 });
    });
    blip(700, 0.18, 'sawtooth', 0.04);
    buzz(20);
    await sleep(560);
  }

  /* ---------------- match-3 ---------------- */
  const cell = () => board.clientWidth / C;
  function wobble(o: Tile) {
    o.el.animate([{ rotate: '0deg' }, { rotate: '-9deg' }, { rotate: '9deg' }, { rotate: '0deg' }], { duration: 240 });
    blip(200, 0.08, 'square', 0.03);
  }
  function makeTile(type: number, special: Special = null): Tile {
    const t = TYPES[type]!;
    const el = document.createElement('div');
    el.className = 'tile';
    el.innerHTML = `<span class="body" style="background:radial-gradient(circle at 32% 26%, ${t.a}, ${t.b} 78%)"></span><span class="gloss"></span><em>${t.e}</em>`;
    board.appendChild(el);
    const o: Tile = { type, special, el, block: type === BLOCK, r: 0, c: 0 };
    paintTile(o);
    return o;
  }
  function paintTile(o: Tile) {
    const t = TYPES[o.type]!;
    o.el.classList.toggle('special-line-h', o.special === 'line-h');
    o.el.classList.toggle('special-line-v', o.special === 'line-v');
    o.el.classList.toggle('special-bomb', o.special === 'bomb');
    o.el.classList.toggle('blocker', !!o.block);
    o.el.querySelector<HTMLElement>('.body')!.style.background = `radial-gradient(circle at 32% 26%, ${t.a}, ${t.b} 78%)`;
    o.el.querySelector('em')!.textContent = o.special === 'bomb' ? '✦' : t.e;
  }
  function place(o: Tile, r: number, c: number, instant?: boolean) {
    const s = cell(),
      pad = s * 0.07;
    o.el.style.width = o.el.style.height = s - pad * 2 + 'px';
    o.el.style.fontSize = s * 0.44 + 'px';
    if (instant) o.el.style.transition = 'none';
    o.el.style.transform = `translate(${c * s + pad}px, ${r * s + pad}px)`;
    if (instant) frame(() => (o.el.style.transition = ''));
    o.r = r;
    o.c = c;
  }
  function matchGroups(g: Grid): Group[] {
    const groups: Group[] = [];
    for (let r = 0; r < R; r++)
      for (let c = 0; c < C - 2; c++) {
        const a = g[r]![c],
          b = g[r]![c + 1],
          d = g[r]![c + 2];
        if (a && b && d && !a.block && a.type === b.type && b.type === d.type) {
          const tiles: Tile[] = [];
          let k = c;
          while (k < C && g[r]![k] && g[r]![k]!.type === a.type) {
            tiles.push(g[r]![k]!);
            k++;
          }
          groups.push({ tiles, dir: 'h' });
          c = k - 1;
        }
      }
    for (let c = 0; c < C; c++)
      for (let r = 0; r < R - 2; r++) {
        const a = g[r]![c],
          b = g[r + 1]![c],
          d = g[r + 2]![c];
        if (a && b && d && !a.block && a.type === b.type && b.type === d.type) {
          const tiles: Tile[] = [];
          let k = r;
          while (k < R && g[k]![c] && g[k]![c]!.type === a.type) {
            tiles.push(g[k]![c]!);
            k++;
          }
          groups.push({ tiles, dir: 'v' });
          r = k - 1;
        }
      }
    return groups;
  }
  function matchesAt(g: Grid) {
    const hit = new Set<Tile>();
    matchGroups(g).forEach((group) => group.tiles.forEach((t) => hit.add(t)));
    return [...hit];
  }
  function quickBad(r: number, c: number, t: number) {
    const left1 = grid[r]![c - 1],
      left2 = grid[r]![c - 2];
    if (c >= 2 && left1 && left2 && left1.type === t && left2.type === t) return true;
    const up1 = grid[r - 1]?.[c],
      up2 = grid[r - 2]?.[c];
    if (r >= 2 && up1 && up2 && up1.type === t && up2.type === t) return true;
    return false;
  }
  function buildBoard() {
    const level = currentLevel();
    for (let attempt = 0; attempt < 12; attempt++) {
      board.innerHTML = '';
      grid = [];
      for (let r = 0; r < R; r++) {
        grid[r] = [];
        for (let c = 0; c < C; c++) {
          let t: number,
            tries = 0;
          if (layoutCell(level, r, c) === 'c') t = BLOCK;
          else
            do {
              t = Math.floor(Math.random() * level.types);
              tries++;
            } while (tries < 20 && quickBad(r, c, t));
          const tile = makeTile(t);
          grid[r]![c] = tile;
          place(tile, r, c, true);
          tile.el.dataset.r = String(r);
          tile.el.dataset.c = String(c);
        }
      }
      if (findMove()) break; // never start on a dead board
    }
    buildIce(level);
  }

  /* ---------------- ice + cookies ---------------- */
  function buildIce(level: Level) {
    ice = [];
    iceEls = [];
    const layer = document.createElement('div');
    layer.className = 'icelayer';
    board.appendChild(layer);
    for (let r = 0; r < R; r++) {
      ice[r] = [];
      iceEls[r] = [];
      for (let c = 0; c < C; c++) {
        const ch = layoutCell(level, r, c);
        const hp = level.mode === 'ice' ? (ch === 'I' ? 2 : ch === 'i' ? 1 : 0) : 0;
        ice[r]![c] = hp;
        iceEls[r]![c] = null;
        if (!hp) continue;
        const el = document.createElement('div');
        el.className = 'ice t' + hp;
        layer.appendChild(el);
        iceEls[r]![c] = el;
      }
    }
    placeIce();
  }
  function placeIce() {
    const s = cell();
    for (let r = 0; r < R; r++)
      for (let c = 0; c < C; c++) {
        const el = iceEls[r] && iceEls[r]![c];
        if (!el) continue;
        el.style.width = el.style.height = s + 'px';
        el.style.transform = `translate(${c * s}px, ${r * s}px)`;
      }
  }
  // cracks the ice under every hit tile; returns how many ice layers came off
  function hitIce(hits: Tile[]) {
    let cleared = 0;
    const seen = new Set<number>();
    hits.forEach((t) => {
      const key = t.r * C + t.c;
      if (seen.has(key) || !ice[t.r] || !ice[t.r]![t.c]) return;
      seen.add(key);
      cleared++;
      const hp = --ice[t.r]![t.c]!,
        el = iceEls[t.r]![t.c]!;
      if (hp > 0) {
        el.classList.remove('t2');
        el.classList.add('t1');
        el.animate([{ scale: 1 }, { scale: 0.86 }, { scale: 1 }], { duration: 220 });
        blip(1500, 0.05, 'triangle', 0.035);
      } else {
        iceEls[t.r]![t.c] = null;
        el.animate(
          [
            { opacity: 1, scale: 1 },
            { opacity: 0, scale: 1.3 },
          ],
          { duration: 300, easing: 'ease-out' }
        ).onfinish = () => el.remove();
        blip(1900, 0.08, 'triangle', 0.04);
      }
    });
    return currentLevel().mode === 'ice' ? cleared : 0;
  }
  // cookies crumble when a match touches them
  function withBlockers(hits: Tile[]) {
    const all = new Set(hits);
    hits.forEach((t) => {
      if (t.block) return;
      (
        [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const
      ).forEach(([dr, dc]) => {
        const n = grid[t.r + dr] && grid[t.r + dr]![t.c + dc];
        if (n && n.block) all.add(n);
      });
    });
    return [...all];
  }

  function startLevel() {
    cancelEnd();
    const level = currentLevel();
    moves = level.moves;
    goal = levelGoal(level);
    targetScore = level.target;
    score = 0;
    sel = null;
    busy = false;
    armed = null;
    boosters = { shuffle: 3, bomb: 2, hammer: 1 };
    shownScore = 0;
    clearHint();
    root.querySelectorAll('.crush-bo').forEach((b) => b.classList.remove('armed'));
    buildBoard();
    syncHud();
    root.querySelectorAll('.st').forEach((s) => s.classList.remove('on', 'burst'));
    $('gameLevel').textContent = pad2(level.n);
    $('levelName').textContent = level.name;
    scheduleHint();
    maybeShowTutorial();
    if (level.tip) later(() => currentLevel() === level && showBanner(level.tip!), 450);
  }
  function maybeShowTutorial() {
    $('tutorial').classList.toggle('on', !state.seenTutorial);
  }
  function completeTutorial() {
    $('tutorial').classList.remove('on');
    if (!state.seenTutorial) {
      state.seenTutorial = true;
      saveState();
    }
  }
  function litStar(ref: string, lit: boolean) {
    const el = $(ref);
    if (lit && !el.classList.contains('on')) {
      el.classList.add('on', 'burst');
      blip(1200, 0.12, 'triangle', 0.05);
      later(() => el.classList.remove('burst'), 560);
    }
  }
  function syncHud() {
    $('movesLeft').textContent = String(moves);
    $('movesStat').classList.toggle('tone-warn', moves <= 5 && !isGoalComplete());
    $('goalLabel').textContent = currentLevel().mode === 'score' ? 'Score left' : 'Goal';
    $('goalIcon').textContent = goalIcon();
    $('goalLeft').textContent = goalText();
    rollScore();
    const p = Math.min(100, (score / targetScore) * 100);
    $('scoreFill').style.width = p + '%';
    litStar('st1', p >= 33);
    litStar('st2', p >= 66);
    litStar('st3', p >= 97);
    $('cShuffle').textContent = String(boosters.shuffle);
    $('cBomb').textContent = String(boosters.bomb);
    $('cHammer').textContent = String(boosters.hammer);
    $('boShuffle').classList.toggle('off', !boosters.shuffle);
    $('boBomb').classList.toggle('off', !boosters.bomb);
    $('boHammer').classList.toggle('off', !boosters.hammer);
  }

  /* input: click or swipe */
  let down: { o: Tile; x: number; y: number; drag: boolean } | null = null;
  on(board, 'pointerdown', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLDivElement>('.tile');
    if (!el || busy) return;
    clearHint();
    const o = find(el);
    if (!o) return;
    down = { o, x: e.clientX, y: e.clientY, drag: false };
    el.setPointerCapture?.(e.pointerId);
    if (armed) {
      void useArmed(o);
      down = null;
      return;
    }
    if (o.block) {
      wobble(o);
      down = null;
      return;
    }
    clearSel();
    sel = o;
    o.el.classList.add('sel');
  });
  on(board, 'pointermove', (e) => {
    if (!down || busy) return;
    const dx = e.clientX - down.x,
      dy = e.clientY - down.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 6) return;
    down.drag = true;
    const o = down.o,
      s = cell(),
      max = s * 0.82;
    let tx = 0,
      ty = 0;
    if (Math.abs(dx) > Math.abs(dy)) tx = Math.max(-max, Math.min(max, dx));
    else ty = Math.max(-max, Math.min(max, dy));
    o.el.classList.add('dragging');
    o.el.style.transform = `translate(${o.c * s + s * 0.07}px, ${o.r * s + s * 0.07}px) translate(${tx}px, ${ty}px)`;
  });
  on(board, 'pointerup', (e) => {
    if (!down || busy) {
      down = null;
      return;
    }
    const dx = e.clientX - down.x,
      dy = e.clientY - down.y;
    down.o.el.classList.remove('dragging');
    if (Math.abs(dx) > 16 || Math.abs(dy) > 16) {
      completeTutorial();
      const o = down.o;
      let r = o.r,
        c = o.c;
      if (Math.abs(dx) > Math.abs(dy)) c += dx > 0 ? 1 : -1;
      else r += dy > 0 ? 1 : -1;
      const target = grid[r]?.[c];
      if (target && target.block) {
        wobble(target);
        place(o, o.r, o.c);
      } else if (target) {
        clearSel();
        void trySwap(o, target);
      } else place(o, o.r, o.c);
    } else {
      place(down.o, down.o.r, down.o.c);
    }
    down = null;
  });
  on(board, 'pointercancel', () => {
    if (down) {
      down.o.el.classList.remove('dragging');
      place(down.o, down.o.r, down.o.c);
    }
    down = null;
  });
  function find(el: HTMLElement) {
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) if (grid[r]![c] && grid[r]![c]!.el === el) return grid[r]![c];
    return null;
  }
  function clearSel() {
    if (sel) {
      sel.el.classList.remove('sel');
      sel = null;
    }
  }

  async function trySwap(a: Tile, b: Tile) {
    busy = true;
    blip(520, 0.06);
    swapCells(a, b);
    place(a, a.r, a.c);
    place(b, b.r, b.c);
    await sleep(190);
    if (matchesAt(grid).length === 0) {
      const specials = [a, b].filter((t) => t.special);
      if (specials.length) {
        moves--;
        syncHud();
        await clearSpecials(specials);
        busy = false;
        void checkEnd();
        return;
      }
      swapCells(a, b);
      place(a, a.r, a.c);
      place(b, b.r, b.c);
      shake();
      blip(180, 0.12, 'square', 0.04);
      await sleep(200);
      busy = false;
      return;
    }
    moves--;
    syncHud();
    await resolve();
    busy = false;
    void checkEnd();
  }
  function swapCells(a: Tile, b: Tile) {
    const ar = a.r,
      ac = a.c;
    grid[a.r]![a.c] = b;
    grid[b.r]![b.c] = a;
    a.r = b.r;
    a.c = b.c;
    b.r = ar;
    b.c = ac;
  }

  async function resolve() {
    let combo = 0;
    while (true) {
      const groups = matchGroups(grid);
      if (!groups.length) break;
      const specials = createSpecials(groups);
      const hits = expandSpecialHits(groupsToHits(groups, specials));
      if (!hits.length) break;
      combo++;
      if (combo > 1) showCombo(combo);
      const collected = goalHits(hits);
      const wasOpen = !isGoalComplete();
      goal -= collected.length + hitIce(hits.concat(specials.map((s) => s.tile)));
      const pts = hits.length * 40 * combo;
      score += pts;
      blip(440 + combo * 110, 0.09, 'triangle', 0.05);
      buzz(combo >= 3 ? 26 : 10);
      if (combo >= 3) {
        flashScreen();
        shake();
      }
      shockwave(hits);
      collected.forEach((t, i) => flyToGoal(t, i * 70));
      if (wasOpen && isGoalComplete())
        later(() => {
          showBanner('GOAL COMPLETE!');
          blip(1320, 0.2, 'triangle', 0.06);
        }, 260);
      popTiles(hits, pts);
      hits.forEach((t) => {
        grid[t.r]![t.c] = null;
      });
      specials.forEach(({ tile, special }) => {
        if (!tile.el.isConnected) return;
        tile.special = special;
        tile.el.classList.remove('pop');
        paintTile(tile);
        grid[tile.r]![tile.c] = tile;
        tile.el
          .querySelector('.body')!
          .animate(
            [
              { scale: 0.55, rotate: '-12deg' },
              { scale: 1.18, rotate: '8deg' },
              { scale: 1, rotate: '0deg' },
            ],
            { duration: 420, easing: 'cubic-bezier(.2,1.5,.4,1)' }
          );
      });
      syncHud();
      await sleep(230);
      hits.forEach((t) => t.el.remove());
      dropAndFill();
      await sleep(240);
    }
  }
  function groupsToHits(groups: Group[], specials: { tile: Tile; special: Special }[]) {
    const saved = new Set(specials.map((s) => s.tile));
    const hit = new Set<Tile>();
    groups.forEach((group) =>
      group.tiles.forEach((t) => {
        if (!saved.has(t)) hit.add(t);
      })
    );
    return [...hit];
  }
  function createSpecials(groups: Group[]) {
    const made: { tile: Tile; special: Special }[] = [];
    const used = new Set<Tile>();
    groups
      .filter((group) => group.tiles.length >= 4 && !group.tiles.some((t) => t.special))
      .sort((a, b) => b.tiles.length - a.tiles.length)
      .forEach((group) => {
        const tile = group.tiles[Math.floor(group.tiles.length / 2)]!;
        if (used.has(tile)) return;
        used.add(tile);
        made.push({ tile, special: group.tiles.length >= 5 ? 'bomb' : group.dir === 'h' ? 'line-h' : 'line-v' });
      });
    if (made.length) {
      const best = made.some((s) => s.special === 'bomb') ? 'FROYO BOMB!' : 'LINE CLEAR!';
      showBanner(best);
      blip(1180, 0.16, 'triangle', 0.055);
    }
    return made;
  }
  function expandSpecialHits(hits: Tile[]) {
    const all = new Set(hits);
    let expanded = true;
    while (expanded) {
      expanded = false;
      [...all].forEach((t) => {
        if (!t.special) return;
        const before = all.size;
        if (t.special === 'line-h') {
          for (let c = 0; c < C; c++) if (grid[t.r]![c]) all.add(grid[t.r]![c]!);
        } else if (t.special === 'line-v') {
          for (let r = 0; r < R; r++) if (grid[r]![t.c]) all.add(grid[r]![t.c]!);
        } else if (t.special === 'bomb') {
          for (let r = t.r - 1; r <= t.r + 1; r++)
            for (let c = t.c - 1; c <= t.c + 1; c++) if (grid[r] && grid[r]![c]) all.add(grid[r]![c]!);
        }
        expanded = expanded || all.size > before;
      });
    }
    if ([...all].some((t) => t.special)) {
      showBanner('SPECIAL BLAST!');
      flashScreen();
      shake();
      buzz(28);
    }
    return withBlockers([...all]);
  }
  async function clearSpecials(specials: Tile[]) {
    const hits = expandSpecialHits(specials);
    const collected = goalHits(hits);
    const wasOpen = !isGoalComplete();
    goal -= collected.length + hitIce(hits);
    const pts = hits.length * 55;
    score += pts;
    collected.forEach((t, i) => flyToGoal(t, i * 65));
    popTiles(hits, pts);
    hits.forEach((t) => {
      grid[t.r]![t.c] = null;
    });
    syncHud();
    await sleep(230);
    hits.forEach((t) => t.el.remove());
    dropAndFill();
    await sleep(260);
    if (wasOpen && isGoalComplete()) showBanner('GOAL COMPLETE!');
    await resolve();
  }
  function popTiles(hits: Tile[], pts: number) {
    hits.forEach((t) => {
      t.el.classList.add('pop');
      const s = cell();
      for (let i = 0; i < 4; i++) {
        const p = document.createElement('div');
        p.className = 'spark';
        p.style.left = t.c * s + s / 2 + 'px';
        p.style.top = t.r * s + s / 2 + 'px';
        p.style.background = TYPES[t.type]!.a;
        board.appendChild(p);
        const ang = Math.random() * 6.28,
          d = 18 + Math.random() * 22;
        p.animate(
          [
            { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
            { transform: `translate(${Math.cos(ang) * d - 6}px, ${Math.sin(ang) * d - 6}px) scale(0)`, opacity: 0 },
          ],
          { duration: 420, easing: 'cubic-bezier(.2,.8,.3,1)' }
        ).onfinish = () => p.remove();
      }
    });
    const f = hits[0]!,
      s = cell();
    const lab = document.createElement('div');
    lab.className = 'float';
    lab.style.left = f.c * s + s / 2 + 'px';
    lab.style.top = f.r * s + 'px';
    lab.textContent = '+' + pts;
    board.appendChild(lab);
    later(() => lab.remove(), 800);
  }
  function landBounce(o: Tile, d: number) {
    later(() => {
      if (!o.el.isConnected) return;
      o.el.classList.add('land');
      later(() => o.el.classList.remove('land'), 300);
    }, 200 + d);
  }
  function dropAndFill() {
    for (let c = 0; c < C; c++) {
      let write = R - 1,
        moved = 0;
      for (let r = R - 1; r >= 0; r--) {
        if (grid[r]![c]) {
          if (write !== r) {
            grid[write]![c] = grid[r]![c]!;
            grid[r]![c] = null;
            place(grid[write]![c]!, write, c);
            landBounce(grid[write]![c]!, moved++ * 18);
          }
          write--;
        }
      }
      for (let r = write; r >= 0; r--) {
        const o = makeTile(Math.floor(Math.random() * currentLevel().types));
        place(o, r - R, c, true);
        grid[r]![c] = o;
        frame(() => frame(() => place(o, r, c)));
        landBounce(o, moved++ * 18);
      }
    }
  }
  function showCombo(n: number) {
    const el = $('combo');
    el.textContent = n >= 4 ? 'YUM! x' + n : n === 3 ? 'SWEET! x3' : 'COMBO x2';
    restart(el, 'go');
  }
  function shake() {
    const p = $('boardwrap');
    p.classList.add('shake');
    later(() => p.classList.remove('shake'), 240);
  }

  async function checkEnd() {
    clearHint();
    if (endTimer !== null) return;
    if (isGoalComplete()) {
      busy = true; // hold input until the result shows
      endTimer = later(() => {
        endTimer = null;
        levelClear();
      }, 760);
      return;
    }
    if (moves <= 0) {
      const level = currentLevel();
      const needed = goalLeftText();
      blip(160, 0.4, 'sawtooth', 0.05);
      buzz([30, 60, 30]);
      busy = true;
      endTimer = later(() => {
        endTimer = null;
        cb.onFail({ level, needed });
      }, 380);
      return;
    }
    if (!findMove()) {
      busy = true;
      showBanner('NO MOVES — SHUFFLING');
      await sleep(400);
      await shuffleBoard();
      await resolve();
      busy = false;
    }
    if (moves === 5 || moves === 3) showBanner(moves + ' MOVES LEFT!');
    if (moves <= 3) buzz(18);
    scheduleHint();
  }
  function levelClear() {
    const level = currentLevel();
    const stars = score >= targetScore ? 3 : score >= targetScore * 0.66 ? 2 : 1;
    state.stars[level.n] = Math.max(state.stars[level.n] || 0, stars);
    const next = LEVELS.find((l) => l.n > level.n) ?? null;
    if (next && level.n >= state.unlockedLevel) {
      state.unlockedLevel = Math.max(state.unlockedLevel, next.n);
      state.currentLevel = next.n;
    } else if (level.n < state.unlockedLevel) {
      state.currentLevel = state.unlockedLevel;
    }
    saveState();
    cb.onClear({ level, stars, score, next, continueLevel: currentLevel() });
    confettiBurst();
    [880, 1100, 1320].forEach((f, i) => later(() => blip(f, 0.14, 'triangle', 0.05), i * 130));
  }
  function confettiBurst() {
    const box = $('confetti');
    const cols = ['#FFC93C', '#960953', '#8DC63F', '#FF8FB8', '#FFFFFF', '#8FA0FF'];
    for (let i = 0; i < 70; i++) {
      const d = document.createElement('div');
      d.className = 'conf';
      d.style.left = Math.random() * 100 + '%';
      d.style.top = '-20px';
      d.style.background = cols[i % cols.length]!;
      d.style.animationDuration = 1.6 + Math.random() * 1.6 + 's';
      d.style.animationDelay = Math.random() * 0.5 + 's';
      box.appendChild(d);
      later(() => d.remove(), 3600);
    }
  }

  /* boosters */
  on($('boMenu'), 'click', () => {
    blip(660, 0.05);
    cb.onMenu();
  });
  on($('boReset'), 'click', () => startLevel());
  on($('boShuffle'), 'click', async () => {
    if (!boosters.shuffle || busy) return;
    boosters.shuffle--;
    busy = true;
    clearHint();
    syncHud();
    await shuffleBoard();
    await resolve();
    busy = false;
    void checkEnd();
  });
  on($('boBomb'), 'click', () => arm('bomb', $('boBomb')));
  on($('boHammer'), 'click', () => arm('hammer', $('boHammer')));
  on($('tutorialOk'), 'click', completeTutorial);
  on($('worldPrev'), 'click', () => shiftWorld(-1));
  on($('worldNext'), 'click', () => shiftWorld(1));

  function arm(k: 'bomb' | 'hammer', btn: HTMLElement) {
    if (!boosters[k] || busy) return;
    root.querySelectorAll('.crush-bo').forEach((b) => b.classList.remove('armed'));
    if (armed === k) {
      armed = null;
      return;
    }
    armed = k;
    btn.classList.add('armed');
    clearSel();
  }
  async function useArmed(o: Tile) {
    const k = armed!;
    armed = null;
    root.querySelectorAll('.crush-bo').forEach((b) => b.classList.remove('armed'));
    if (!boosters[k]) return;
    boosters[k]--;
    busy = true;
    let hits: Tile[] = [];
    if (k === 'hammer') {
      hits = [o];
      blip(300, 0.1, 'square', 0.05);
    } else {
      for (let r = o.r - 1; r <= o.r + 1; r++)
        for (let c = o.c - 1; c <= o.c + 1; c++) if (grid[r] && grid[r]![c]) hits.push(grid[r]![c]!);
      blip(110, 0.3, 'sawtooth', 0.06);
      shake();
    }
    hits = expandSpecialHits(hits);
    const wasOpen = !isGoalComplete();
    goal -= goalHits(hits).length + hitIce(hits);
    if (wasOpen && isGoalComplete()) showBanner('GOAL COMPLETE!');
    score += hits.length * 30;
    popTiles(hits, hits.length * 30);
    hits.forEach((t) => (grid[t.r]![t.c] = null));
    syncHud();
    await sleep(240);
    hits.forEach((t) => t.el.remove());
    dropAndFill();
    await sleep(260);
    await resolve();
    busy = false;
    void checkEnd();
  }

  on(window, 'resize', () => {
    if (grid.length) {
      for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) if (grid[r]![c]) place(grid[r]![c]!, r, c, true);
      placeIce();
    }
    fitMap();
  });

  return {
    /** Starts (or restarts) the current level. The board must be visible. */
    startLevel,
    /** Replays a level that is already unlocked. */
    playLevel(n: number) {
      state.currentLevel = Math.min(n, state.unlockedLevel);
      saveState();
      startLevel();
    },
    showMap() {
      mapWorld = worldOf(currentLevel().n);
      buildMap();
    },
    /** Called when the board is hidden (menu / map) so hints stop. */
    leaveBoard() {
      clearHint();
      clearSel();
      armed = null;
    },
    getState: () => state,
    setSound(onOff: boolean) {
      state.settings.sound = onOff;
      saveState();
    },
    destroy() {
      destroyed = true;
      listeners.abort();
      timeouts.forEach((id) => clearTimeout(id));
      timeouts.clear();
      frames.forEach((id) => cancelAnimationFrame(id));
      frames.clear();
      void actx?.close().catch(() => undefined);
      actx = null;
      try {
        navigator.vibrate?.(0);
      } catch {
        // ignore
      }
    },
  };
}
