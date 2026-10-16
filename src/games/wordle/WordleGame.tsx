'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GameShell } from '@/components/arcade/GameShell';
import { ResultSheet } from '@/components/arcade/ResultSheet';
import { StartScreen, type Rule } from '@/components/arcade/StartScreen';
import { StatBar } from '@/components/arcade/StatBar';
import { GameThumbnail } from '@/components/arcade/Thumbnails';
import { getGame } from '@/games/registry';
import { startPlay } from '@/rewards/client/api';
import { savePendingClaim } from '@/rewards/client/pending';
import type { MissionOutcome } from '@/rewards/types';
import { MissionCard } from '@/rewards/ui/MissionCard';
import { MissionResult } from '@/rewards/ui/MissionResult';
import {
  MAX_ATTEMPTS,
  type GuessErrorReason,
  type GuessRecord,
  type GuessResponse,
  type PlayerStats,
  type TileMark,
  type TodayResponse,
} from './types';
import './wordle.css';

const KEY_ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];
const RANK: Record<TileMark, number> = { absent: 1, present: 2, correct: 3 };
const EMOJI: Record<TileMark, string> = { correct: '🟩', present: '🟨', absent: '⬛' };
const GAME_TIMEZONE = 'America/Los_Angeles';

type ClientError = GuessErrorReason | 'network' | 'server';

function errorMessage(reason: ClientError): string {
  switch (reason) {
    case 'invalid_length':
      return 'Not enough letters';
    case 'invalid_characters':
      return 'Letters only';
    case 'not_in_wordlist':
      return 'Not in word list';
    case 'network':
      return 'Connection problem';
    default:
      return 'Something went wrong';
  }
}

async function fetchToday(): Promise<TodayResponse | null> {
  try {
    const res = await fetch('/api/wordle/today', { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as TodayResponse;
  } catch {
    return null;
  }
}

async function postGuess(guess: string): Promise<GuessResponse | { ok: false; reason: 'network' | 'server' }> {
  try {
    const res = await fetch('/api/wordle/guess', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guess }),
    });
    const data: unknown = await res.json().catch(() => null);
    if (data && typeof (data as { ok?: unknown }).ok === 'boolean') return data as GuessResponse;
    return { ok: false, reason: 'server' };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/** Best mark seen so far for each letter, for coloring the keyboard. */
function letterStates(guesses: GuessRecord[]): Record<string, TileMark> {
  const best: Record<string, TileMark> = {};
  for (const { guess, marks } of guesses) {
    for (let i = 0; i < guess.length; i++) {
      const letter = guess[i];
      const mark = marks[i];
      if (!letter || !mark) continue;
      const prev = best[letter];
      if (!prev || RANK[mark] > RANK[prev]) best[letter] = mark;
    }
  }
  return best;
}

/** Time left until midnight in the game's timezone, when the next word unlocks. */
function msUntilNextWord(now = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: GAME_TIMEZONE,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const elapsed = get('hour') * 3600 + get('minute') * 60 + get('second');
  return (86400 - elapsed) * 1000;
}

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

function dateLabel(playDate: string | undefined): string {
  if (!playDate) return 'Today';
  const d = new Date(`${playDate}T12:00:00`);
  if (Number.isNaN(d.getTime())) return 'Today';
  return `Today · ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

function TileRow({
  letters = '',
  marks,
  flip,
  cursor,
}: {
  letters?: string;
  marks?: TileMark[];
  flip?: boolean;
  cursor?: boolean;
}) {
  return (
    <div className="wd-row">
      {[0, 1, 2, 3, 4].map((i) => {
        const ch = letters[i] ?? '';
        let cls = 'wd-tile';
        if (marks) cls += ` ${marks[i] ?? ''}${flip ? ' flip' : ''}`;
        else if (cursor && ch) cls += ' filled';
        return (
          <div key={i} className={cls} style={flip ? { animationDelay: `${i * 90}ms` } : undefined}>
            {ch}
          </div>
        );
      })}
    </div>
  );
}

function RuleTile({ letter, mark }: { letter: string; mark: TileMark }) {
  return <span className={`wd-rule-tile ${mark}`}>{letter}</span>;
}

const RULES: Rule[] = [
  { icon: '⌨️', title: 'Six tries', text: 'Type any five-letter word and press Enter to check it.' },
  { icon: <RuleTile letter="B" mark="correct" />, title: 'Green', text: 'The letter is in the word and in the right spot.' },
  { icon: <RuleTile letter="E" mark="present" />, title: 'Yellow', text: 'The letter is in the word but in the wrong spot.' },
  { icon: <RuleTile letter="R" mark="absent" />, title: 'Gray', text: 'The letter is not in the word at all.' },
  { icon: '📅', title: 'One word a day', text: 'A new word unlocks every midnight, Pacific Time.' },
];

export default function WordleGame() {
  const game = getGame('wordle');
  const [view, setView] = useState<'loading' | 'error' | 'start' | 'play'>('loading');
  const [today, setToday] = useState<TodayResponse | null>(null);
  const [guesses, setGuesses] = useState<GuessRecord[]>([]);
  const [stats, setStats] = useState<PlayerStats>({ plays: 0, wins: 0, streak: 0 });
  const [answer, setAnswer] = useState<string | null>(null);
  const [current, setCurrent] = useState('');
  const [toast, setToast] = useState('');
  const [shake, setShake] = useState(false);
  const [flipIdx, setFlipIdx] = useState(-1);
  const [busy, setBusy] = useState(false);
  const [finished, setFinished] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [shareNote, setShareNote] = useState('');
  const [nextWordIn, setNextWordIn] = useState(() => msUntilNextWord());
  const [mission, setMission] = useState<MissionOutcome>({ state: 'off' });
  const startLogged = useRef(false);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const mounted = useRef(true);

  const later = useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      timers.current.delete(id);
      fn();
    }, ms);
    timers.current.add(id);
  }, []);

  useEffect(() => {
    mounted.current = true;
    const pending = timers.current;
    return () => {
      mounted.current = false;
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);

  const load = useCallback(async () => {
    setView('loading');
    const data = await fetchToday();
    if (!mounted.current) return;
    if (!data) return setView('error');
    setToday(data);
    setGuesses(data.guesses);
    setStats(data.stats);
    setAnswer(data.answer);
    setMission(data.mission);
    setFinished(data.status === 'won' || data.status === 'lost');
    setCurrent('');
    setFlipIdx(-1);
    setShowResult(false);
    setView('start');
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Countdown to the next word while the result is open; reload when it arrives.
  useEffect(() => {
    if (!finished) return;
    setNextWordIn(msUntilNextWord());
    const id = setInterval(() => {
      const left = msUntilNextWord();
      setNextWordIn(left);
      if (left <= 1000) void load();
    }, 1000);
    return () => clearInterval(id);
  }, [finished, load]);

  const flash = useCallback(
    (msg: string) => {
      setToast(msg);
      setShake(true);
      later(() => setShake(false), 400);
      later(() => setToast((t) => (t === msg ? '' : t)), 2000);
    },
    [later]
  );

  const submit = useCallback(async () => {
    if (busy || finished) return;
    if (current.length < 5) return flash('Not enough letters');

    setBusy(true);
    const res = await postGuess(current);
    if (!mounted.current) return;
    setBusy(false);

    if (!res.ok) {
      if (res.reason === 'already_finished') {
        void load();
        return;
      }
      flash(errorMessage(res.reason));
      return;
    }

    setFlipIdx(guesses.length);
    setGuesses((g) => [...g, { guess: current, marks: res.marks }]);
    setCurrent('');
    setStats(res.stats);

    if (res.status === 'won' || res.status === 'lost') {
      setFinished(true);
      setAnswer(res.answer);
      setMission(res.mission);
      if (res.mission.state === 'achieved') savePendingClaim(res.mission.claimId, 'wordle');
      setToday((t) => (t ? { ...t, status: res.status, attempts: res.attempt } : t));
      later(() => setShowResult(true), 1100);
    }
  }, [busy, finished, current, guesses.length, flash, later, load]);

  const press = useCallback(
    (key: string) => {
      if (view !== 'play' || finished) return;
      if (key === 'ENTER') void submit();
      else if (key === 'DEL') setCurrent((c) => c.slice(0, -1));
      else setCurrent((c) => (c.length < 5 ? c + key : c));
    },
    [view, finished, submit]
  );

  // Physical keyboard, only while the board is on screen.
  useEffect(() => {
    if (view !== 'play') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Enter') {
        // Let Enter activate a focused button (e.g. the result sheet) instead of submitting.
        if (document.activeElement instanceof HTMLButtonElement) return;
        e.preventDefault();
        press('ENTER');
      } else if (e.key === 'Backspace') press('DEL');
      else if (/^[a-zA-Z]$/.test(e.key)) press(e.key.toUpperCase());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view, press]);

  const states = useMemo(() => letterStates(guesses), [guesses]);

  const share = async () => {
    const won = today?.status === 'won';
    const grid = guesses.map((g) => g.marks.map((m) => EMOJI[m]).join('')).join('\n');
    const text = `Froyo Arcade Wordle ${won ? guesses.length : 'X'}/${MAX_ATTEMPTS}\n${grid}`;
    try {
      if (navigator.share) {
        await navigator.share({ text });
        return;
      }
      await navigator.clipboard.writeText(text);
      setShareNote('Copied to clipboard');
      later(() => setShareNote(''), 2000);
    } catch {
      // Share sheet dismissed or clipboard blocked: nothing useful to report.
    }
  };

  const enterGame = () => {
    if (today?.status === 'not_started' && !startLogged.current) {
      startLogged.current = true;
      void startPlay('wordle');
    }
    setView('play');
    window.scrollTo({ top: 0 });
    if (finished) setShowResult(true);
  };

  if (view === 'loading' || view === 'error') {
    return (
      <GameShell title={game.title} className="wordle">
        <div className="wd-status screen-in">
          {view === 'loading' ? (
            <p>Loading today&apos;s word…</p>
          ) : (
            <>
              <p>Couldn&apos;t load today&apos;s word. Check your connection and try again.</p>
              <button type="button" className="btn btn-primary" onClick={() => void load()}>
                Try Again
              </button>
            </>
          )}
        </div>
      </GameShell>
    );
  }

  if (view === 'start') {
    const status = today?.status ?? 'not_started';
    const label = finished ? 'See Result' : status === 'in_progress' ? 'Continue' : 'Play';
    return (
      <GameShell title={game.title} className="wordle">
        <StartScreen
          hero={<GameThumbnail slug="wordle" />}
          title={game.title}
          description={game.description}
          rules={RULES}
          actions={
            <button type="button" className="btn btn-primary btn-block" onClick={enterGame}>
              {label}
            </button>
          }
        >
          <div className="wd-today">
            <span className="badge badge-green">{dateLabel(today?.playDate)}</span>
            {status === 'in_progress' && (
              <span className="badge">
                {guesses.length} of {MAX_ATTEMPTS} guesses used
              </span>
            )}
            {finished && <span className="badge badge-brand">Today&apos;s word is done</span>}
          </div>
          <MissionCard game="wordle" />
        </StartScreen>
      </GameShell>
    );
  }

  const won = today?.status === 'won';
  const winRate = stats.plays > 0 ? Math.round((stats.wins / stats.plays) * 100) : 0;
  const rows = [];
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const g = guesses[i];
    if (g) rows.push(<TileRow key={i} letters={g.guess} marks={g.marks} flip={i === flipIdx} />);
    else if (i === guesses.length && !finished) rows.push(<TileRow key={i} letters={current} cursor />);
    else rows.push(<TileRow key={i} />);
  }

  return (
    <GameShell title={game.title} className="wordle">
      <div className="wd-play screen-in">
        <StatBar
          items={[
            { label: 'Attempt', value: `${Math.min(guesses.length + (finished ? 0 : 1), MAX_ATTEMPTS)}/${MAX_ATTEMPTS}` },
            { label: 'Streak', value: stats.streak, tone: 'brand' },
          ]}
        />

        <div className={`wd-grid${shake ? ' shake' : ''}`} aria-label="Guesses">
          {rows}
        </div>

        <div className="wd-kb" aria-label="Keyboard">
          {KEY_ROWS.map((line, i) => (
            <div key={line} className={`wd-kr${i === 1 ? ' pad' : ''}`}>
              {i === 2 && (
                <button type="button" className="wd-key wide" onClick={() => press('ENTER')} disabled={busy}>
                  Enter
                </button>
              )}
              {line.split('').map((c) => (
                <button key={c} type="button" className={`wd-key ${states[c] ?? ''}`} onClick={() => press(c)}>
                  {c}
                </button>
              ))}
              {i === 2 && (
                <button type="button" className="wd-key wide" onClick={() => press('DEL')} aria-label="Delete">
                  ⌫
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}

      {finished && showResult && (
        <ResultSheet
          icon={won ? '🎉' : '🍨'}
          iconTone={won ? 'green' : 'gray'}
          title={won ? 'Nice one!' : 'So close!'}
          message={
            won
              ? `Solved in ${guesses.length} ${guesses.length === 1 ? 'try' : 'tries'}.`
              : "Today's word was"
          }
          stats={[
            { label: 'Played', value: stats.plays },
            { label: 'Streak', value: stats.streak },
            { label: 'Win rate', value: `${winRate}%` },
          ]}
          actions={[
            { label: shareNote || 'Share Result', onClick: () => void share() },
            // One word per day: replay unlocks with tomorrow's word (see the countdown below).
            { label: 'Play Again', onClick: () => void load(), disabled: true, variant: 'secondary' },
          ]}
          note={`One word per day. The next word unlocks in ${formatCountdown(nextWordIn)}.`}
        >
          {answer ? <TileRow letters={answer} marks={Array(5).fill(won ? 'correct' : 'absent')} /> : null}
          <MissionResult game="wordle" outcome={mission} />
        </ResultSheet>
      )}
    </GameShell>
  );
}
