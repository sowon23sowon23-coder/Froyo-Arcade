import 'server-only';
import { cookies } from 'next/headers';
import words from './allowed-guesses.json';
import { PROMOTION, rewardFor } from '@/rewards/config';
import { anonId } from '@/rewards/server/anon';
import { logEvent } from '@/rewards/server/events';
import { createClaim } from '@/rewards/server/missions';
import { rewardsConfigured } from '@/rewards/server/supabase';
import type { MissionOutcome } from '@/rewards/types';
import { answerFor } from './schedule';
import { scoreGuess } from './scoring';
import { MAX_ATTEMPTS, type GameStatus, type GuessResponse, type TodayResponse } from '../types';

// Ported from yogurtland-wordle's database-free mode: the answer and scoring stay
// on the server, and each player's progress lives in an httpOnly cookie.

// Public-domain (Unlicense) Wordle valid-guess list, ~14.8k five-letter words.
// Source: github.com/tabatkins/wordle-list.
const ALLOWED_GUESSES: ReadonlySet<string> = new Set(words as string[]);

// Which calendar day "today" is, for a store chain operating on US time.
const GAME_TIMEZONE = process.env.GAME_TIMEZONE || 'America/Los_Angeles';

const COOKIE = 'froyo_wordle';
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export function getPlayDate(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: GAME_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** d = play date, g = today's guesses, p/w/s = plays / wins / streak, m = today's reward mission claim. */
type SavedState = { d: string; g: string[]; p: number; w: number; s: number; m?: string };

const isCount = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0;
const isClaimId = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/.test(v);

async function readState(playDate: string): Promise<SavedState> {
  const fresh: SavedState = { d: playDate, g: [], p: 0, w: 0, s: 0 };
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return fresh;

  try {
    const v = JSON.parse(raw) as Partial<SavedState>;
    const guessesOk =
      Array.isArray(v.g) && v.g.length <= MAX_ATTEMPTS && v.g.every((x) => typeof x === 'string' && /^[A-Z]{5}$/.test(x));
    if (typeof v.d !== 'string' || !guessesOk || !isCount(v.p) || !isCount(v.w) || !isCount(v.s)) {
      return fresh;
    }
    // A new day keeps the stats but starts a clean board.
    if (v.d !== playDate) return { d: playDate, g: [], p: v.p, w: v.w, s: v.s };
    return { d: playDate, g: v.g as string[], p: v.p, w: v.w, s: v.s, ...(isClaimId(v.m) ? { m: v.m } : {}) };
  } catch {
    return fresh;
  }
}

async function writeState(state: SavedState): Promise<void> {
  (await cookies()).set(COOKIE, JSON.stringify(state), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: ONE_YEAR_SECONDS,
  });
}

function statusOf(state: SavedState): GameStatus {
  if (state.g.length === 0) return 'not_started';
  if (state.g[state.g.length - 1] === answerFor(state.d)) return 'won';
  return state.g.length >= MAX_ATTEMPTS ? 'lost' : 'in_progress';
}

function missionOf(state: SavedState, status: GameStatus): MissionOutcome {
  const mission = PROMOTION.missions.wordle;
  if (!rewardsConfigured() || !mission) return { state: 'off' };
  if (status === 'lost') return { state: 'missed' };
  if (status !== 'won') return { state: 'off' };
  if (state.g.length > mission.maxAttempts) return { state: 'missed' };
  return state.m ? { state: 'achieved', claimId: state.m, reward: rewardFor('wordle', {}) } : { state: 'error' };
}

export async function getToday(): Promise<TodayResponse> {
  const playDate = getPlayDate();
  const state = await readState(playDate);
  const status = statusOf(state);
  const finished = status === 'won' || status === 'lost';
  const answer = answerFor(playDate);
  return {
    playDate,
    status,
    attempts: state.g.length,
    maxAttempts: MAX_ATTEMPTS,
    guesses: state.g.map((guess) => ({ guess, marks: scoreGuess(guess, answer) })),
    answer: finished ? answer : null,
    stats: { plays: state.p, wins: state.w, streak: state.s },
    mission: missionOf(state, status),
  };
}

export async function submitGuess(raw: unknown): Promise<GuessResponse> {
  const guess = typeof raw === 'string' ? raw.trim().toUpperCase() : null;
  if (guess === null || guess.length !== 5) return { ok: false, reason: 'invalid_length' };
  if (!/^[A-Z]{5}$/.test(guess)) return { ok: false, reason: 'invalid_characters' };

  const state = await readState(getPlayDate());
  const answer = answerFor(state.d);
  const before = statusOf(state);
  if (before === 'won' || before === 'lost') return { ok: false, reason: 'already_finished' };
  if (guess !== answer && !ALLOWED_GUESSES.has(guess)) return { ok: false, reason: 'not_in_wordlist' };

  state.g.push(guess);
  const status = statusOf(state);
  const finished = status === 'won' || status === 'lost';
  if (finished) {
    state.p += 1;
    state.w += status === 'won' ? 1 : 0;
    state.s = status === 'won' ? state.s + 1 : 0;

    // The answer is checked here on the server, so a win is trusted as-is.
    if (rewardsConfigured()) {
      const anon = await anonId();
      logEvent({ type: 'game_complete', game: 'wordle', anonId: anon, meta: { attempts: state.g.length, won: status === 'won' } });
      const mission = PROMOTION.missions.wordle;
      if (status === 'won' && mission && state.g.length <= mission.maxAttempts) {
        const claim = await createClaim({ game: 'wordle', anonId: anon, playSessionId: null, result: { attempts: state.g.length } });
        if (claim.state === 'achieved') state.m = claim.claimId;
      }
    }
  }
  await writeState(state);

  return {
    ok: true,
    marks: scoreGuess(guess, answer),
    attempt: state.g.length,
    status,
    answer: finished ? answer : null,
    stats: { plays: state.p, wins: state.w, streak: state.s },
    mission: missionOf(state, status),
  };
}
