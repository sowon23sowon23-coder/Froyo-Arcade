'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { GameShell } from '@/components/arcade/GameShell';
import { ResultSheet } from '@/components/arcade/ResultSheet';
import { StartScreen, type Rule } from '@/components/arcade/StartScreen';
import { StatBar } from '@/components/arcade/StatBar';
import { GameThumbnail } from '@/components/arcade/Thumbnails';
import { getGame } from '@/games/registry';
import './catch.css';

// Ported from froyo-catcher (Free Play, the mode the live game ships).
// Rules, timings, speeds and scoring are unchanged; only the UI chrome moved
// to the arcade design system and every timer/listener is now cleaned up.

type CharId = 'green' | 'berry' | 'sprinkle';

const CHARACTERS: { id: CharId; label: string }[] = [
  { id: 'green', label: 'Pistachio' },
  { id: 'berry', label: 'Berry Burst' },
  { id: 'sprinkle', label: 'Sprinkle Pop' },
];

const ASSET = (name: string) => `/catch/${name}`;
const SOCCER_BALL_IMAGE = 'soccer-ball.png';
const FREE_HEART_SPAWN_CHANCE = 0.08;
const FREE_HEART_MIN_INTERVAL_MS = 7000;
const FREE_HEART_MAX_ACTIVE = 1;
const MAX_LIVES = 5;
const START_LIVES = 3;

const FALLING_ITEMS = [
  'gummy-bear.png',
  'green-gummy-bear.png',
  'yellow-gummy-bear.png',
  'orange-gummy-bear.png',
  'strawberry.png',
  'kiwi.png',
  'pineapple.png',
  'mango.png',
  'cookie.png',
  'm-and-m-brown.png',
  'm-and-m-red.png',
  'm-and-m-orange.png',
] as const;

type FallingItem = { id: number; x: number; y: number; v: number; image: string };
type Pop = { id: number; x: number; y: number; text: string; born: number; kind: 'gain' | 'loss' };

const FREE_DIFFICULTY_STEP = 10;
const FREE_BASE_FALL_SPEED_MIN = 0.7;
const FREE_BASE_FALL_SPEED_RANGE = 1.15;
const CATCH_HALF_WIDTH_PCT = 9.5;
const CATCH_Y_START_PCT = 84;
const MISS_Y_PCT = 101;
const PLAYER_W = 80;
const LEVEL_UP_PRAISES = ['Nice catch!', "You're on a roll!", 'Keep it going!', 'Smooth moves!', 'Hot streak!'] as const;

const BEST_KEY = 'froyo-arcade:catch:best';
const CHARACTER_KEY = 'froyo-arcade:catch:character';

function imageScaleBoost(image?: string) {
  if (image === 'strawberry.png') return 1.18;
  if (image === 'mango.png') return 1.16;
  return 1;
}

function freeDifficultyLevelFromScore(score: number) {
  return Math.floor(score / FREE_DIFFICULTY_STEP);
}

function freeSpeedMultiplier(score: number) {
  const level = freeDifficultyLevelFromScore(score);
  if (level <= 2) return 1 + level * 0.06; // 0..29: smooth ramp
  if (level <= 5) return 1 + 2 * 0.06 + (level - 2) * 0.11; // 30..59: medium ramp
  return 1 + 2 * 0.06 + 3 * 0.11 + (level - 5) * 0.16; // 60+: steeper ramp
}

function freeSpawnBurstCount(score: number) {
  if (score < 30) return 1;
  if (score < 60) return Math.random() < 0.35 ? 2 : 1;
  if (score < 90) return Math.random() < 0.7 ? 2 : 1;
  return Math.random() < 0.2 ? 3 : 2;
}

function pickRandomFallingImage(excluded: readonly string[] = []) {
  const excludedSet = new Set(excluded);
  const candidates = FALLING_ITEMS.filter((item) => !excludedSet.has(item));
  const source = candidates.length > 0 ? candidates : FALLING_ITEMS;
  return source[Math.floor(Math.random() * source.length)] ?? FALLING_ITEMS[0];
}

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage can be blocked (private mode); the game still works without it.
  }
}

type SfxKind = 'catch' | 'fail' | 'combo' | 'fanfare';

const RULES: Rule[] = [
  {
    icon: <img src={ASSET('berry.png')} alt="" />,
    title: 'Move your cup',
    text: 'Drag on the screen, or move your mouse, to slide left and right.',
  },
  {
    icon: <img src={ASSET('strawberry.png')} alt="" />,
    title: 'Catch toppings',
    text: 'Every topping you catch is worth 1 point.',
  },
  { icon: '❤️', title: 'Watch your lives', text: 'You start with 3 lives and lose one for each topping you miss.' },
  {
    icon: <img src={ASSET(SOCCER_BALL_IMAGE)} alt="" />,
    title: 'Grab the soccer ball',
    text: 'Catch a soccer ball to earn an extra life.',
  },
  { icon: '⚡', title: 'Level up', text: 'Every 10 points, toppings fall faster and more drop at once.' },
];

export default function CatchGame() {
  const game = getGame('catch');
  const [view, setView] = useState<'start' | 'game'>('start');
  const [character, setCharacter] = useState<CharId>('green');
  const [phase, setPhase] = useState<'idle' | 'play' | 'over'>('idle');
  const [countdown, setCountdown] = useState<'ready' | 'go' | null>(null);

  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(START_LIVES);
  const [best, setBest] = useState(0);
  const [newBest, setNewBest] = useState(false);
  const [difficultyLevel, setDifficultyLevel] = useState(0);
  const [difficultyNotice, setDifficultyNotice] = useState<string | null>(null);
  const [levelUpPraise, setLevelUpPraise] = useState<string | null>(null);
  const [levelUpFlash, setLevelUpFlash] = useState(false);
  const [playerX, setPlayerX] = useState(50);

  const [items, setItems] = useState<FallingItem[]>([]);
  const [pops, setPops] = useState<Pop[]>([]);
  const [tilt, setTilt] = useState(0);
  const [bounce, setBounce] = useState(false);
  const [shake, setShake] = useState(false);
  const [dangerFlash, setDangerFlash] = useState(false);
  const [lifeBump, setLifeBump] = useState(0);

  const visibleLives = Math.min(lives, MAX_LIVES);
  const extraLives = Math.max(0, lives - MAX_LIVES);

  const areaRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(0);
  const popIdRef = useRef(0);
  const lastLifeLossRef = useRef(0);
  const lastHeartSpawnAtRef = useRef(0);
  const spawnRef = useRef<number | null>(null);
  const loopRef = useRef<number | null>(null);
  const inputFrameRef = useRef<number | null>(null);
  const areaRectRef = useRef<DOMRect | null>(null);
  const playerXRef = useRef(50);
  const pendingPlayerXRef = useRef(50);
  const bounceActiveRef = useRef(false);
  const bounceTimeoutRef = useRef<number | null>(null);
  const noticeTimeoutRef = useRef<number | null>(null);
  const levelCelebrateTimeoutRef = useRef<number | null>(null);
  const gameOverFiredRef = useRef(false);
  const difficultyLevelRef = useRef(0);
  const scoreRef = useRef(0);
  const popsRef = useRef<Pop[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const catchStreakRef = useRef(0);
  const timersRef = useRef(new Set<number>());

  /** setTimeout that is cancelled automatically when the game unmounts or restarts. */
  const later = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timersRef.current.delete(id);
      fn();
    }, ms);
    timersRef.current.add(id);
    return id;
  }, []);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((id) => clearTimeout(id));
    timersRef.current.clear();
    for (const ref of [bounceTimeoutRef, noticeTimeoutRef, levelCelebrateTimeoutRef]) ref.current = null;
  }, []);

  useEffect(() => {
    scoreRef.current = score;
  }, [score]);

  useEffect(() => {
    popsRef.current = pops;
  }, [pops]);

  useEffect(() => {
    const saved = readStorage(CHARACTER_KEY) as CharId | null;
    if (saved && CHARACTERS.some((c) => c.id === saved)) setCharacter(saved);
    setBest(Number(readStorage(BEST_KEY) || 0));
    // Warm the cache so the first toppings don't pop in.
    for (const name of [...FALLING_ITEMS, SOCCER_BALL_IMAGE, 'game-bg.webp']) {
      const img = new Image();
      img.decoding = 'async';
      img.src = ASSET(name);
    }
  }, []);

  const stopLoops = useCallback(() => {
    if (spawnRef.current !== null) {
      clearInterval(spawnRef.current);
      spawnRef.current = null;
    }
    if (loopRef.current !== null) {
      clearInterval(loopRef.current);
      loopRef.current = null;
    }
    if (inputFrameRef.current !== null) {
      cancelAnimationFrame(inputFrameRef.current);
      inputFrameRef.current = null;
    }
  }, []);

  // Leaving the page (Back to Arcade, browser back) tears everything down.
  useEffect(
    () => () => {
      stopLoops();
      clearTimers();
      void audioCtxRef.current?.close().catch(() => undefined);
      audioCtxRef.current = null;
      if ('vibrate' in navigator) navigator.vibrate(0);
    },
    [stopLoops, clearTimers]
  );

  const vibrateByEvent = (kind: SfxKind) => {
    if (!('vibrate' in navigator)) return;
    if (kind === 'catch') navigator.vibrate(14);
    if (kind === 'fail') navigator.vibrate(26);
    if (kind === 'combo') navigator.vibrate([14, 22, 14]);
    if (kind === 'fanfare') navigator.vibrate([20, 30, 20, 30, 40]);
  };

  const playSfx = (kind: SfxKind) => {
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      if (!audioCtxRef.current) audioCtxRef.current = new Ctx();
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') void ctx.resume();

      const now = ctx.currentTime + 0.001;
      const beep = (freq: number, dur: number, type: OscillatorType, gain: number, at: number) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, at);
        g.gain.setValueAtTime(0.0001, at);
        g.gain.exponentialRampToValueAtTime(gain, at + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(at);
        osc.stop(at + dur + 0.02);
      };

      if (kind === 'catch') beep(920, 0.08, 'triangle', 0.04, now);
      if (kind === 'fail') beep(220, 0.14, 'sawtooth', 0.05, now);
      if (kind === 'combo') {
        beep(680, 0.08, 'triangle', 0.035, now);
        beep(860, 0.08, 'triangle', 0.035, now + 0.09);
        beep(1120, 0.1, 'triangle', 0.04, now + 0.18);
      }
      if (kind === 'fanfare') {
        beep(740, 0.08, 'triangle', 0.035, now);
        beep(940, 0.09, 'triangle', 0.038, now + 0.1);
        beep(1240, 0.12, 'triangle', 0.04, now + 0.22);
        beep(1560, 0.18, 'triangle', 0.042, now + 0.36);
      }
    } catch {
      // Ignore audio errors in restricted browsers.
    }
  };

  const finishGame = () => {
    if (gameOverFiredRef.current) return;
    gameOverFiredRef.current = true;

    stopLoops();
    setPhase('over');

    const prevBest = Number(readStorage(BEST_KEY) || 0);
    const isNewBest = score > prevBest;
    setNewBest(isNewBest);
    if (isNewBest) {
      writeStorage(BEST_KEY, String(score));
      setBest(score);
      playSfx('fanfare');
      vibrateByEvent('fanfare');
    }
  };

  const start = () => {
    stopLoops();
    clearTimers();
    idRef.current = 0;
    popIdRef.current = 0;
    lastLifeLossRef.current = 0;
    lastHeartSpawnAtRef.current = 0;
    playerXRef.current = 50;
    pendingPlayerXRef.current = 50;
    areaRectRef.current = null;
    gameOverFiredRef.current = false;
    bounceActiveRef.current = false;
    catchStreakRef.current = 0;
    difficultyLevelRef.current = 0;
    scoreRef.current = 0;

    setScore(0);
    setLives(START_LIVES);
    setNewBest(false);
    setDifficultyLevel(0);
    setDifficultyNotice(null);
    setLevelUpPraise(null);
    setLevelUpFlash(false);
    setPlayerX(50);
    setItems([]);
    setPops([]);
    setTilt(0);
    setBounce(false);
    setShake(false);
    setDangerFlash(false);

    setCountdown('ready');
    setPhase('idle');
    later(() => setCountdown('go'), 450);
    later(() => {
      setCountdown(null);
      setPhase('play');
    }, 900);
  };

  const begin = () => {
    writeStorage(CHARACTER_KEY, character);
    setView('game');
    window.scrollTo({ top: 0 });
    start();
  };

  // Level up every 10 points.
  useEffect(() => {
    if (phase !== 'play') return;
    const nextLevel = freeDifficultyLevelFromScore(score);
    if (nextLevel <= difficultyLevelRef.current) return;

    difficultyLevelRef.current = nextLevel;
    setDifficultyLevel(nextLevel);
    setDifficultyNotice(`Level Up! Lv.${nextLevel}`);
    setLevelUpPraise(LEVEL_UP_PRAISES[(nextLevel - 1) % LEVEL_UP_PRAISES.length]);
    setLevelUpFlash(true);
    later(() => setLevelUpFlash(false), 320);

    if (noticeTimeoutRef.current !== null) clearTimeout(noticeTimeoutRef.current);
    noticeTimeoutRef.current = later(() => {
      setDifficultyNotice(null);
      noticeTimeoutRef.current = null;
    }, 1400);

    if (levelCelebrateTimeoutRef.current !== null) clearTimeout(levelCelebrateTimeoutRef.current);
    levelCelebrateTimeoutRef.current = later(() => {
      setLevelUpPraise(null);
      levelCelebrateTimeoutRef.current = null;
    }, 1800);
  }, [phase, score, later]);

  const updateAreaRect = () => {
    areaRectRef.current = areaRef.current?.getBoundingClientRect() ?? null;
    return areaRectRef.current;
  };

  const move = (clientX: number) => {
    const r = updateAreaRect();
    if (!r) return;

    const xPx = clientX - r.left;
    const clamped = Math.max(PLAYER_W / 2, Math.min(r.width - PLAYER_W / 2, xPx));
    const pct = (clamped / r.width) * 100;

    playerXRef.current = pct;
    pendingPlayerXRef.current = pct;

    if (inputFrameRef.current === null) {
      inputFrameRef.current = requestAnimationFrame(() => {
        inputFrameRef.current = null;
        const nextX = pendingPlayerXRef.current;
        setPlayerX(nextX);
        setTilt((nextX - 50) / 10);
      });
    }

    if (!bounceActiveRef.current) {
      bounceActiveRef.current = true;
      setBounce(true);
    }
    if (bounceTimeoutRef.current !== null) clearTimeout(bounceTimeoutRef.current);
    bounceTimeoutRef.current = later(() => {
      bounceActiveRef.current = false;
      setBounce(false);
      bounceTimeoutRef.current = null;
    }, 140);
  };

  // Keep the page from scrolling under your finger while playing.
  useEffect(() => {
    if (phase !== 'play') return;
    const prevOverflow = document.body.style.overflow;
    const prevTouchAction = document.body.style.touchAction;
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.touchAction = prevTouchAction;
    };
  }, [phase]);

  // Touch drag (non-passive so the page doesn't scroll).
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;

    const handleTouch = (e: TouchEvent) => {
      if (phase !== 'play') return;
      e.preventDefault();
      const touch = e.touches[0];
      if (touch) move(touch.clientX);
    };

    updateAreaRect();
    el.addEventListener('touchstart', handleTouch, { passive: false });
    el.addEventListener('touchmove', handleTouch, { passive: false });
    window.addEventListener('resize', updateAreaRect);
    window.addEventListener('scroll', updateAreaRect, true);
    return () => {
      el.removeEventListener('touchstart', handleTouch);
      el.removeEventListener('touchmove', handleTouch);
      window.removeEventListener('resize', updateAreaRect);
      window.removeEventListener('scroll', updateAreaRect, true);
      areaRectRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, view]);

  useEffect(() => {
    if (phase !== 'play') return;
    if (lives > 0) return;
    finishGame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lives, phase, score]);

  // Spawn + physics loops.
  useEffect(() => {
    if (phase !== 'play') {
      stopLoops();
      return;
    }
    if (loopRef.current !== null) return;

    spawnRef.current = window.setInterval(() => {
      setItems((currentItems) => {
        const nowMs = Date.now();
        const activeHeartCount = currentItems.filter((item) => item.image === SOCCER_BALL_IMAGE).length;
        const canSpawnHeartByInterval = nowMs - lastHeartSpawnAtRef.current >= FREE_HEART_MIN_INTERVAL_MS;
        const shouldSpawnHeart =
          canSpawnHeartByInterval && activeHeartCount < FREE_HEART_MAX_ACTIVE && Math.random() < FREE_HEART_SPAWN_CHANCE;
        if (shouldSpawnHeart) lastHeartSpawnAtRef.current = nowMs;

        const spawnCount = shouldSpawnHeart ? 1 : freeSpawnBurstCount(scoreRef.current);
        const nextItems: FallingItem[] = [];
        const burstImages: string[] = [];

        for (let i = 0; i < spawnCount; i += 1) {
          const baseFallSpeed = FREE_BASE_FALL_SPEED_MIN + Math.random() * FREE_BASE_FALL_SPEED_RANGE;
          const image = shouldSpawnHeart ? SOCCER_BALL_IMAGE : pickRandomFallingImage(burstImages);
          burstImages.push(image);
          nextItems.push({ id: idRef.current++, x: Math.random() * 90 + 5, y: -5 - i * 3.2, v: baseFallSpeed, image });
        }

        return [...currentItems, ...nextItems];
      });
    }, 900);

    loopRef.current = window.setInterval(() => {
      const now = performance.now();
      const px = playerXRef.current;

      setItems((prev) => {
        let gained = 0;
        let lifeGain = 0;
        let lifeLoss = 0;
        const popsToAdd: Pop[] = [];
        const next: FallingItem[] = [];
        let lifeLossX: number | null = null;

        for (const item of prev) {
          const ny = item.y + item.v * freeSpeedMultiplier(scoreRef.current);
          const inCatchRangeX = Math.abs(item.x - px) <= CATCH_HALF_WIDTH_PCT;
          const inCatchRangeY = ny >= CATCH_Y_START_PCT && ny <= 96;
          const isHeart = item.image === SOCCER_BALL_IMAGE;

          if (inCatchRangeX && inCatchRangeY) {
            if (isHeart) {
              lifeGain += 1;
              popsToAdd.push({ id: popIdRef.current++, x: item.x, y: 88, text: 'LIFE +1', born: now, kind: 'gain' });
            } else {
              gained += 1;
              popsToAdd.push({ id: popIdRef.current++, x: item.x, y: 88, text: '+1', born: now, kind: 'gain' });
            }
            continue;
          }

          if (ny > MISS_Y_PCT) {
            if (isHeart) continue;
            lifeLoss += 1;
            if (lifeLossX === null) lifeLossX = item.x;
            continue;
          }

          next.push({ ...item, y: ny });
        }

        if (gained) {
          setScore((s) => s + gained);
          playSfx('catch');
          vibrateByEvent('catch');
          const prevStreak = catchStreakRef.current;
          const nextStreak = prevStreak + gained;
          catchStreakRef.current = nextStreak;
          if (Math.floor(prevStreak / 5) < Math.floor(nextStreak / 5)) {
            playSfx('combo');
            vibrateByEvent('combo');
          }
        }
        if (lifeGain) {
          playSfx('catch');
          vibrateByEvent('catch');
          setLives((l) => l + lifeGain);
          setLifeBump((n) => n + 1);
        }

        if (lifeLoss) {
          const now2 = performance.now();
          if (now2 - lastLifeLossRef.current >= 400) {
            lastLifeLossRef.current = now2;
            popsToAdd.push({
              id: popIdRef.current++,
              x: lifeLossX ?? playerXRef.current,
              y: 88,
              text: 'MISSED',
              born: now2,
              kind: 'loss',
            });
            setShake(true);
            later(() => setShake(false), 180);
            setDangerFlash(true);
            later(() => setDangerFlash(false), 160);
            catchStreakRef.current = 0;
            playSfx('fail');
            vibrateByEvent('fail');
            setLives((l) => Math.max(0, l - 1));
            setLifeBump((n) => n + 1);
          }
        }

        if (popsToAdd.length > 0 || popsRef.current.length > 0) {
          setPops((ps) => ps.concat(popsToAdd).filter((p) => now - p.born < 700));
        }
        return next;
      });
    }, 30);

    return () => stopLoops();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const headerRight = view === 'game' ? <span className="badge">Best {best}</span> : null;

  if (view === 'start') {
    return (
      <GameShell title={game.title} className="catch">
        <StartScreen
          hero={<GameThumbnail slug="catch" />}
          title={game.title}
          description={game.description}
          rules={RULES}
          actions={
            <button type="button" className="btn btn-primary btn-block" onClick={begin}>
              Play
            </button>
          }
        >
          <section>
            <h3 className="section-label">Pick your cup</h3>
            <div className="catch-picker" role="radiogroup" aria-label="Pick your cup">
              {CHARACTERS.map((c) => {
                const active = c.id === character;
                return (
                  <button
                    key={c.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    className={`catch-pick${active ? ' active' : ''}`}
                    onClick={() => setCharacter(c.id)}
                  >
                    <img src={ASSET(`${c.id}.png`)} alt="" draggable={false} />
                    <span>{c.label}</span>
                  </button>
                );
              })}
            </div>
          </section>
          {best > 0 && (
            <p className="catch-best">
              Your best score <b>{best}</b>
            </p>
          )}
        </StartScreen>
      </GameShell>
    );
  }

  return (
    <GameShell title={game.title} className="catch" headerRight={headerRight}>
      <div className="catch-play screen-in">
        <StatBar
          items={[
            { label: 'Score', value: score },
            {
              label: 'Lives',
              value: (
                <span key={lifeBump} className={`catch-lives${lifeBump ? ' bump' : ''}`}>
                  {Array.from({ length: MAX_LIVES }).map((_, i) => (
                    <img
                      key={i}
                      src={ASSET(SOCCER_BALL_IMAGE)}
                      alt=""
                      className={i < visibleLives ? '' : 'spent'}
                      draggable={false}
                    />
                  ))}
                  {extraLives > 0 && <b>×{extraLives}</b>}
                  <span className="sr-only">{lives} lives</span>
                </span>
              ),
              tone: lives <= 1 && phase === 'play' ? 'warn' : undefined,
            },
            { label: 'Level', value: difficultyLevel, tone: 'brand' },
          ]}
        />

        <div
          ref={areaRef}
          className={`catch-area${shake ? ' shake' : ''}`}
          onPointerDown={() => updateAreaRect()}
          onMouseMove={(e) => phase === 'play' && move(e.clientX)}
        >
          {phase === 'play' && (
            <div
              className="catch-zone"
              style={{ left: `${playerX}%`, top: `${CATCH_Y_START_PCT}%`, width: `${CATCH_HALF_WIDTH_PCT * 2}%` }}
            />
          )}

          {phase === 'play' && dangerFlash && <div className="catch-flash danger" />}
          {levelUpFlash && <div className="catch-flash level" />}

          {phase === 'play' && difficultyNotice && (
            <div className="catch-toast">
              <b>{difficultyNotice}</b>
              {levelUpPraise ? <span>{levelUpPraise}</span> : null}
            </div>
          )}

          {countdown && (
            <div className="catch-countdown" key={countdown}>
              {countdown === 'ready' ? 'Ready' : 'Go!'}
            </div>
          )}

          {items.map((item) => (
            <div key={item.id} className="catch-item" style={{ left: `${item.x}%`, top: `${item.y}%` }}>
              <img
                src={ASSET(item.image)}
                alt=""
                draggable={false}
                style={{ transform: `scale(${imageScaleBoost(item.image)})` }}
              />
            </div>
          ))}

          {pops.map((p) => {
            const age = (performance.now() - p.born) / 1000;
            const opacity = Math.max(0, 1 - age / 0.7);
            const rise = Math.min(12, age * 20);
            return (
              <div
                key={p.id}
                className={`catch-pop ${p.kind}`}
                style={{
                  left: `${p.x}%`,
                  top: `${p.y - rise}%`,
                  opacity,
                  transform: `translateX(-50%) rotate(${tilt}deg) scale(${bounce ? 1.08 : 1})`,
                }}
              >
                {p.text}
              </div>
            );
          })}

          {phase !== 'over' && (
            <div className="catch-player" style={{ left: `${playerX}%` }}>
              <img src={ASSET(`${character}.png`)} alt="Your cup" draggable={false} />
            </div>
          )}
        </div>

        <p className="catch-hint">Drag or move your mouse across the play area to steer your cup.</p>
      </div>

      {phase === 'over' && (
        <ResultSheet
          icon={newBest ? '🏆' : '🍨'}
          iconTone={newBest ? 'green' : undefined}
          title={newBest ? 'New best score!' : 'Game over'}
          message={
            newBest ? 'That is your highest score so far.' : `You reached level ${difficultyLevel}. One more run?`
          }
          stats={[
            { label: 'Score', value: score, tone: 'brand' },
            { label: 'Best', value: Math.max(best, score) },
            { label: 'Level', value: difficultyLevel },
          ]}
          actions={[
            { label: 'Play Again', onClick: start },
            { label: 'Change Cup', onClick: () => setView('start'), variant: 'secondary' },
          ]}
        />
      )}
    </GameShell>
  );
}
