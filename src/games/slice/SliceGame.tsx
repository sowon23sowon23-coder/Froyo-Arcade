'use client';

import { useEffect, useRef, useState } from 'react';
import { GameShell } from '@/components/arcade/GameShell';
import { ResultSheet } from '@/components/arcade/ResultSheet';
import { SoundToggle } from '@/components/arcade/SoundToggle';
import { StartScreen, type Rule } from '@/components/arcade/StartScreen';
import { StatBar } from '@/components/arcade/StatBar';
import { GameThumbnail } from '@/components/arcade/Thumbnails';
import { getGame } from '@/games/registry';
import { usePlaySession } from '@/rewards/client/hooks';
import { MissionCard } from '@/rewards/ui/MissionCard';
import { MissionResult } from '@/rewards/ui/MissionResult';
import { ItemIcon } from './ItemIcon';
import {
  COMBO_MIN,
  POINTS_BOMB,
  POINTS_COMBO,
  POINTS_FRUIT,
  ROUND_SECONDS,
  createSliceGame,
  type SliceEngine,
  type SliceResult,
} from './engine';
import { createSound, readMuted, type Sound } from './sound';
import './slice.css';

const BEST_KEY = 'froyo-arcade:slice:best';

function readBest(): number {
  try {
    return Number(localStorage.getItem(BEST_KEY) || 0) || 0;
  } catch {
    return 0;
  }
}

const RULES: Rule[] = [
  {
    icon: <ItemIcon kind="strawberry" />,
    title: 'Swipe to slice',
    text: 'Drag your finger, or hold the mouse button and drag, across the fruit.',
  },
  { icon: <ItemIcon kind="kiwi" />, title: `Fruit +${POINTS_FRUIT}`, text: 'Every fruit you cut is worth 10 points.' },
  {
    icon: <ItemIcon kind="banana" />,
    title: `Combo +${POINTS_COMBO}`,
    text: `Cut ${COMBO_MIN} or more fruits in one swipe for a bonus.`,
  },
  {
    icon: <ItemIcon kind="bomb" />,
    title: `Avoid bombs ${POINTS_BOMB}`,
    text: 'Slicing a bomb costs 30 points. The game keeps going.',
  },
  { icon: '⏱️', title: `${ROUND_SECONDS} seconds`, text: 'Fruit comes faster near the end. Missed fruit costs nothing.' },
];

type Outcome = SliceResult & { best: number; newBest: boolean };

export default function SliceGame() {
  const game = getGame('slice');
  const mission = usePlaySession('slice');
  const { finish: finishMission } = mission;
  const [view, setView] = useState<'start' | 'game'>('start');
  const [muted, setMuted] = useState(false);
  const [best, setBest] = useState(0);
  const [score, setScore] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(ROUND_SECONDS);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<SliceEngine | null>(null);
  const soundRef = useRef<Sound | null>(null);

  // Sound + saved values live for the whole page visit.
  useEffect(() => {
    soundRef.current = createSound();
    setMuted(readMuted());
    setBest(readBest());
    return () => {
      soundRef.current?.close();
      soundRef.current = null;
    };
  }, []);

  // The engine exists while the play view is mounted.
  useEffect(() => {
    if (view !== 'game' || !canvasRef.current || !soundRef.current) return;
    const font = getComputedStyle(document.body).fontFamily;
    const engine = createSliceGame(
      canvasRef.current,
      soundRef.current,
      {
        onHud: (s, t) => {
          setScore(s);
          setSecondsLeft(t);
        },
        onCountdown: setCountdown,
        onPause: setPaused,
        onEnd: (r) => {
          void finishMission({ score: r.score });
          const prev = readBest();
          const newBest = r.score > prev;
          if (newBest) {
            try {
              localStorage.setItem(BEST_KEY, String(r.score));
            } catch {
              // storage blocked; the result still shows
            }
          }
          const nextBest = Math.max(prev, r.score);
          setBest(nextBest);
          setOutcome({ ...r, best: nextBest, newBest });
        },
      },
      font
    );
    engineRef.current = engine;
    engine.start();
    // Test hook for automated checks: /slice?test=1
    if (new URLSearchParams(window.location.search).has('test')) {
      (window as unknown as { __slice?: SliceEngine }).__slice = engine;
    }
    return () => {
      engine.destroy();
      engineRef.current = null;
      delete (window as unknown as { __slice?: SliceEngine }).__slice;
    };
  }, [view, finishMission]);

  // No page scrolling or overscroll while a round is on screen.
  useEffect(() => {
    if (view !== 'game' || outcome) return;
    const prev = { o: document.body.style.overflow, t: document.body.style.overscrollBehavior };
    document.body.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'none';
    return () => {
      document.body.style.overflow = prev.o;
      document.body.style.overscrollBehavior = prev.t;
    };
  }, [view, outcome]);

  const toggleSound = () => {
    const s = soundRef.current;
    if (!s) return;
    s.unlock();
    s.setMuted(!muted);
    setMuted(!muted);
  };

  const play = () => {
    soundRef.current?.unlock(); // inside the click, so audio is allowed
    mission.begin();
    setOutcome(null);
    setPaused(false);
    setScore(0);
    setSecondsLeft(ROUND_SECONDS);
    window.scrollTo({ top: 0 });
    if (view === 'game') engineRef.current?.start();
    else setView('game');
  };

  const header = <SoundToggle on={!muted} onToggle={toggleSound} />;

  if (view === 'start') {
    return (
      <GameShell title={game.title} className="slice" headerRight={header}>
        <StartScreen
          hero={<GameThumbnail slug="slice" />}
          title={game.title}
          description="Slice fruits. Top your froyo."
          rules={RULES}
          actions={
            <button type="button" className="btn btn-primary btn-block" onClick={play}>
              Play
            </button>
          }
        >
          {best > 0 && (
            <p className="slice-best">
              Your best score <b>{best}</b>
            </p>
          )}
          <MissionCard game="slice" />
        </StartScreen>
      </GameShell>
    );
  }

  return (
    <GameShell title={game.title} className="slice" headerRight={header}>
      <div className="slice-play screen-in">
        <StatBar
          items={[
            { label: 'Score', value: score, tone: 'brand' },
            { label: 'Time', value: `${secondsLeft}s`, tone: secondsLeft <= 5 && !outcome ? 'warn' : undefined },
          ]}
        />
        <div className="slice-area">
          <canvas ref={canvasRef} className="slice-canvas" aria-label="Play area. Swipe across fruit to slice it." />
          {countdown !== null && !paused && (
            <div className="slice-count" key={countdown} aria-live="assertive">
              {countdown}
            </div>
          )}
          {paused && (
            <div className="slice-paused">
              <div className="slice-paused-card">
                <b>Paused</b>
                <span>The round stopped while you were away.</span>
                <button
                  type="button"
                  className="btn btn-primary btn-block"
                  onClick={() => {
                    soundRef.current?.unlock();
                    engineRef.current?.resume();
                  }}
                >
                  Resume
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {outcome && (
        <ResultSheet
          icon={outcome.newBest ? '🏆' : '🍨'}
          iconTone="green"
          title={outcome.newBest ? 'New Best!' : "Time's up!"}
          message={outcome.newBest ? 'That is your highest score so far.' : 'Here is the froyo you topped this round.'}
          stats={[
            { label: 'Score', value: outcome.score, tone: 'brand' },
            { label: 'Best', value: outcome.best },
            { label: 'Fruits', value: outcome.sliced },
          ]}
          actions={[{ label: 'Play Again', onClick: play }]}
        >
          <img className="slice-cup" src={outcome.cupImage} alt="Your froyo cup with the fruit you sliced on top" />
          <MissionResult game="slice" outcome={mission.outcome} />
        </ResultSheet>
      )}
    </GameShell>
  );
}
