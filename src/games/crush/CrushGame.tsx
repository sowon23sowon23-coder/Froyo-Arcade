'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { GameShell } from '@/components/arcade/GameShell';
import { ResultSheet, type SheetAction } from '@/components/arcade/ResultSheet';
import { SoundToggle } from '@/components/arcade/SoundToggle';
import { StartScreen, type Rule } from '@/components/arcade/StartScreen';
import { GameThumbnail } from '@/components/arcade/Thumbnails';
import { getGame } from '@/games/registry';
import { PROMOTION } from '@/rewards/config';
import { usePlaySession } from '@/rewards/client/hooks';
import { MissionCard } from '@/rewards/ui/MissionCard';
import { MissionResult } from '@/rewards/ui/MissionResult';
import { createCrushGame, type ClearResult, type CrushEngine, type FailResult } from './engine';
import { LEVELS, WORLDS, currentLevelOf, worldOf, type CrushState } from './levels';
import './crush.css';

type Result = { kind: 'clear'; r: ClearResult } | { kind: 'fail'; r: FailResult };

const pad2 = (n: number) => String(n).padStart(2, '0');

function Dot({ emoji, a, b }: { emoji: string; a: string; b: string }) {
  return (
    <span className="crush-dot" style={{ background: `radial-gradient(circle at 32% 28%, ${a}, ${b})` }}>
      {emoji}
    </span>
  );
}

const RULES: Rule[] = [
  {
    icon: <Dot emoji="🍓" a="#FF8A9A" b="#E02B45" />,
    title: 'Match 3',
    text: 'Drag a topping into a neighbor to swap them and line up three of a kind.',
  },
  { icon: <Dot emoji="🥝" a="#B9E36B" b="#5C8C1E" />, title: 'Match 4', text: 'Four in a row creates a line-clearing topping.' },
  { icon: <Dot emoji="✦" a="#FFE38A" b="#E09300" />, title: 'Match 5', text: 'Five in a row makes a Froyo Bomb.' },
  {
    icon: <Dot emoji="🧊" a="#E6F6FF" b="#7CC4FF" />,
    title: 'Crack the ice',
    text: 'Match on frosted tiles to break the ice. Thick ice takes two hits.',
  },
  {
    icon: <Dot emoji="🍪" a="#F3D7A6" b="#C58A3E" />,
    title: 'Crumble cookies',
    text: "Cookies can't be swapped. Match right next to them, or use a booster.",
  },
  {
    icon: '🌀',
    title: 'Boosters',
    text: 'Shuffle the board, drop a 3×3 bomb, or scoop out a single topping with the spoon.',
  },
  {
    icon: <Dot emoji="🎯" a="#FF9CC3" b="#960953" />,
    title: 'Hit the goal',
    text: 'Reach the level goal before you run out of moves.',
  },
];

export default function CrushGame() {
  const game = getGame('crush');
  const mission = usePlaySession('crush');
  const rootRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<CrushEngine | null>(null);
  const [view, setView] = useState<'start' | 'map' | 'game'>('start');
  const [progress, setProgress] = useState<CrushState | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const refresh = useCallback(() => {
    const s = engineRef.current?.getState();
    if (s) setProgress({ ...s, stars: { ...s.stars }, settings: { ...s.settings } });
  }, []);

  /** Show the board first (it measures itself), then start the current level. */
  const openGame = useCallback(() => {
    flushSync(() => {
      setResult(null);
      setView('game');
    });
    window.scrollTo({ top: 0 });
    mission.ensure();
    engineRef.current?.startLevel();
    refresh();
  }, [refresh, mission.ensure]);

  const openMap = useCallback(() => {
    engineRef.current?.leaveBoard();
    flushSync(() => {
      setResult(null);
      setView('map');
    });
    window.scrollTo({ top: 0 });
    engineRef.current?.showMap();
    refresh();
  }, [refresh]);

  const openStart = useCallback(() => {
    engineRef.current?.leaveBoard();
    setResult(null);
    setView('start');
    window.scrollTo({ top: 0 });
    refresh();
  }, [refresh]);

  // Latest handlers for the engine, which is created once.
  const handlers = useRef({ openGame, openStart, refresh, finishMission: mission.finish });
  handlers.current = { openGame, openStart, refresh, finishMission: mission.finish };

  useEffect(() => {
    const engine = createCrushGame(rootRef.current!, {
      onClear: (r) => {
        void handlers.current.finishMission({ level: r.level.n }, true);
        setResult({ kind: 'clear', r });
        handlers.current.refresh();
      },
      onFail: (r) => setResult({ kind: 'fail', r }),
      onPickLevel: () => handlers.current.openGame(),
      onMenu: () => handlers.current.openStart(),
    });
    engineRef.current = engine;
    handlers.current.refresh();
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  const closeAnd = (fn: () => void) => () => {
    setResult(null);
    fn();
  };

  const level = progress ? currentLevelOf(progress) : LEVELS[0]!;
  const totalStars = progress ? Object.values(progress.stars).reduce((a, b) => a + b, 0) : 0;
  const soundOn = progress?.settings.sound ?? true;

  const soundButton = (
    <SoundToggle
      on={soundOn}
      onToggle={() => {
        engineRef.current?.setSound(!soundOn);
        refresh();
      }}
    />
  );

  let sheet: React.ReactNode = null;
  if (result?.kind === 'clear') {
    const { r } = result;
    const actions: SheetAction[] = [];
    if (r.next) {
      actions.push({
        label: r.continueLevel.n === r.next.n ? 'Next Level' : `Continue to Level ${r.continueLevel.n}`,
        onClick: openGame,
      });
    }
    actions.push({
      label: 'Play Again',
      onClick: closeAnd(() => {
        engineRef.current?.playLevel(r.level.n);
        refresh();
      }),
      variant: r.next ? 'secondary' : 'primary',
    });
    actions.push({ label: 'Level Map', onClick: openMap, variant: 'secondary' });
    sheet = (
      <ResultSheet
        icon="🍨"
        iconTone="green"
        title={r.next ? 'Level complete!' : 'You finished every level!'}
        message={`Level ${pad2(r.level.n)} · ${r.level.name}. ${
          r.stars === 3 ? 'Perfect run.' : 'Level cleared.'
        } Your progress is saved.`}
        stats={[
          { label: 'Score', value: r.score.toLocaleString(), tone: 'brand' },
          { label: 'Target', value: r.level.target.toLocaleString() },
        ]}
        actions={actions}
      >
        <div className="crush-starrow" aria-label={`${r.stars} of 3 stars`}>
          {[0, 1, 2].map((i) => (
            <span key={i} className={i < r.stars ? 'on' : ''}>
              ★
            </span>
          ))}
        </div>
        <MissionResult
          game="crush"
          outcome={mission.outcome}
          progressNote={
            PROMOTION.missions.crush && r.level.n < PROMOTION.missions.crush.level
              ? `Keep going: clear Level ${PROMOTION.missions.crush.level} to earn the reward.`
              : undefined
          }
        />
      </ResultSheet>
    );
  } else if (result?.kind === 'fail') {
    sheet = (
      <ResultSheet
        icon="🍨"
        iconTone="gray"
        title="Out of moves"
        message={
          <>
            You needed <b>{result.r.needed}</b>. Try a booster or one more run.
          </>
        }
        actions={[
          { label: 'Add 5 Moves', onClick: closeAnd(() => engineRef.current?.addMoves()) },
          { label: 'Shuffle Board', onClick: closeAnd(() => void engineRef.current?.shuffleAfterFail()), variant: 'tonal' },
          { label: 'Play Again', onClick: closeAnd(() => engineRef.current?.startLevel()), variant: 'secondary' },
        ]}
      />
    );
  }

  return (
    <GameShell title={game.title} className="crush" headerRight={soundButton}>
      {view === 'start' && (
        <StartScreen
          hero={<GameThumbnail slug="crush" />}
          title={game.title}
          description={game.description}
          rules={RULES}
          actions={
            <>
              <button type="button" className="btn btn-primary btn-block" onClick={openGame}>
                {progress && progress.unlockedLevel > 1 ? `Play Level ${level.n}` : 'Play'}
              </button>
              <button type="button" className="btn btn-secondary btn-block" onClick={openMap}>
                Level Map
              </button>
            </>
          }
        >
          <div className="crush-progress card">
            <div>
              <span className="eyebrow">
                World {worldOf(level.n) + 1} · {WORLDS[worldOf(level.n)]?.name}
              </span>
              <b>
                Level {pad2(level.n)} · {level.name}
              </b>
            </div>
            <div className="crush-progress-meta">
              <span className="badge badge-brand">★ {totalStars} / {LEVELS.length * 3}</span>
              <span className="badge">
                {Math.min(progress?.unlockedLevel ?? 1, LEVELS.length)} / {LEVELS.length} unlocked
              </span>
            </div>
          </div>
          <MissionCard game="crush" />
        </StartScreen>
      )}

      {/* Engine-owned DOM: React renders these nodes once and never gives them children it would re-render. */}
      <div ref={rootRef} className="crush-root">
        <section className="crush-view crush-map" hidden={view !== 'map'}>
          <div className="crush-worldbar">
            <button type="button" className="icon-btn" data-ref="worldPrev" aria-label="Previous world">
              ‹
            </button>
            <div className="crush-worldname" data-ref="worldName" />
            <button type="button" className="icon-btn" data-ref="worldNext" aria-label="Next world">
              ›
            </button>
          </div>
          <div className="crush-mapwrap" data-ref="mapWrap">
            <div className="crush-swirl" data-ref="swirlMap" />
          </div>
          <div className="crush-map-actions">
            <button type="button" className="btn btn-primary btn-block" onClick={openGame}>
              Play Level {level.n}
            </button>
            <button type="button" className="btn btn-ghost btn-block" onClick={openStart}>
              How to Play
            </button>
          </div>
        </section>

        <section className="crush-view crush-game" hidden={view !== 'game'}>
          <div className="crush-levelline">
            <span className="badge badge-brand">
              Level <span data-ref="gameLevel" />
            </span>
            <span className="crush-levelname" data-ref="levelName" />
          </div>
          <div className="stat-bar crush-hud">
            <div className="stat" data-ref="goalStat">
              <span className="stat-label" data-ref="goalLabel" />
              <span className="stat-value">
                <em className="crush-goal-icon" data-ref="goalIcon" />
                <span data-ref="goalLeft" />
              </span>
            </div>
            <div className="stat" data-ref="movesStat">
              <span className="stat-label">Moves</span>
              <span className="stat-value" data-ref="movesLeft" />
            </div>
            <div className="stat tone-brand">
              <span className="stat-label">Score</span>
              <span className="stat-value" data-ref="scoreVal" />
            </div>
          </div>
          <div className="crush-scorebar" aria-hidden="true">
            <i data-ref="scoreFill" />
            <span className="st" data-ref="st1" style={{ left: '33%' }}>
              ★
            </span>
            <span className="st" data-ref="st2" style={{ left: '66%' }}>
              ★
            </span>
            <span className="st" data-ref="st3" style={{ left: '97%' }}>
              ★
            </span>
          </div>
          <div className="crush-boardwrap" data-ref="boardwrap">
            <div className="crush-board" data-ref="board" />
            <div className="crush-combo" data-ref="combo" />
            <div className="crush-tutorial" data-ref="tutorial">
              <div className="gesture" />
              <b>Slide a topping</b>
              <span>Drag one tile into a neighbor to make a match.</span>
              <button type="button" className="btn btn-sm btn-primary" data-ref="tutorialOk">
                Got It
              </button>
            </div>
            <div className="crush-banner" data-ref="banner" />
            <div className="crush-flash" data-ref="flash" />
          </div>
          <div className="crush-boosters">
            <button type="button" className="crush-bo" data-ref="boMenu" title="Menu" aria-label="Menu">
              <span aria-hidden="true">⏸</span>
            </button>
            <button type="button" className="crush-bo" data-ref="boShuffle" title="Shuffle" aria-label="Shuffle booster">
              <span aria-hidden="true">🌀</span>
              <b data-ref="cShuffle" />
            </button>
            <button type="button" className="crush-bo" data-ref="boBomb" title="Bomb — clears 3×3" aria-label="Bomb booster">
              <span aria-hidden="true">💣</span>
              <b data-ref="cBomb" />
            </button>
            <button
              type="button"
              className="crush-bo"
              data-ref="boHammer"
              title="Spoon — clears 1 topping"
              aria-label="Spoon booster"
            >
              <span aria-hidden="true">🥄</span>
              <b data-ref="cHammer" />
            </button>
            <button type="button" className="crush-bo" data-ref="boReset" title="Restart" aria-label="Restart level">
              <span aria-hidden="true">🔄</span>
            </button>
          </div>
        </section>
        <div className="crush-confetti" data-ref="confetti" />
      </div>

      {sheet}
    </GameShell>
  );
}
