import 'server-only';
import type { GameSlug } from '@/games/registry';
import { PROMOTION, rewardFor } from '../config';
import type { MissionOutcome } from '../types';
import { logEvent } from './events';
import { admin } from './supabase';

/**
 * Catch, Crush and Slice run in the browser, so their results are self-reported.
 * These checks don't make cheating impossible; they reject results that could
 * not have come from real play (too fast, or more points than the game can
 * physically award in the time played). Wordle is scored on the server and
 * skips this path entirely.
 */

export type PlayResult = { score?: unknown; level?: unknown };

type Verdict = { plausible: boolean; achieved: boolean; summary: Record<string, number> };

const isCount = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0;

// Catch spawns a burst every 0.9s and a burst is at most 3 toppings, 1 point each.
const CATCH_MAX_POINTS_PER_SECOND = 3.5;
// Slice: a round is 30s after a 3s countdown.
const SLICE_MIN_SECONDS = 29;
const SLICE_MAX_SCORE = 3000;
// Crush: even the first level takes a few swaps.
const CRUSH_MIN_SECONDS = 15;
const CRUSH_LEVELS = 21;

export function judge(game: GameSlug, result: PlayResult, elapsedMs: number): Verdict {
  const seconds = elapsedMs / 1000;
  const m = PROMOTION.missions;

  if (game === 'catch') {
    if (!isCount(result.score)) return { plausible: false, achieved: false, summary: {} };
    const plausible = result.score <= seconds * CATCH_MAX_POINTS_PER_SECOND + 3;
    const lowest = m.catch?.tiers[0]?.score;
    return { plausible, achieved: plausible && lowest !== undefined && result.score >= lowest, summary: { score: result.score } };
  }

  if (game === 'slice') {
    if (!isCount(result.score)) return { plausible: false, achieved: false, summary: {} };
    const plausible = seconds >= SLICE_MIN_SECONDS && result.score <= SLICE_MAX_SCORE;
    return { plausible, achieved: plausible && !!m.slice && result.score >= m.slice.score, summary: { score: result.score } };
  }

  if (game === 'crush') {
    const level = result.level;
    if (!isCount(level) || level < 1 || level > CRUSH_LEVELS) return { plausible: false, achieved: false, summary: {} };
    const plausible = seconds >= CRUSH_MIN_SECONDS;
    return { plausible, achieved: plausible && !!m.crush && level >= m.crush.level, summary: { level } };
  }

  return { plausible: false, achieved: false, summary: {} };
}

/** Saves an achieved mission so it can be exchanged for a coupon after sign-in. */
export async function createClaim(input: {
  game: GameSlug;
  anonId: string;
  playSessionId: string | null;
  result: Record<string, number>;
}): Promise<MissionOutcome> {
  const { data, error } = await admin()
    .from('mission_claims')
    .insert({
      promotion_id: PROMOTION.id,
      anon_id: input.anonId,
      game: input.game,
      play_session_id: input.playSessionId,
      result: input.result,
    })
    .select('id')
    .single();
  if (error || !data) return { state: 'error' };

  logEvent({ type: 'mission_achieved', game: input.game, anonId: input.anonId, meta: input.result });
  return { state: 'achieved', claimId: data.id as string, reward: rewardFor(input.game, input.result) };
}
