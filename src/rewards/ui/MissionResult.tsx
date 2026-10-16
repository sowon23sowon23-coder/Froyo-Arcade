'use client';

import Link from 'next/link';
import type { GameSlug } from '@/games/registry';
import { PROMOTION, missionText } from '../config';
import { useRewards } from '../client/hooks';
import { claimHref } from '../client/pending';
import type { MissionOutcome } from '../types';
import './rewards.css';

/**
 * Reward line inside a game's result sheet. `outcome` is null while the
 * server is checking the round.
 */
export function MissionResult({
  game,
  outcome,
  /** Crush: the level just cleared, to tell "not yet" apart from "missed". */
  progressNote,
}: {
  game: GameSlug;
  outcome: MissionOutcome | null;
  progressNote?: string;
}) {
  const { me } = useRewards();
  const text = missionText(game);
  if (!text || outcome?.state === 'off' || (me && !me.configured)) return null;

  if (!outcome) {
    return <div className="rw-result is-pending">Checking your reward mission…</div>;
  }

  if (outcome.state === 'achieved') {
    if (me?.coupon) {
      return (
        <div className="rw-result is-done">
          <b>Mission complete!</b>
          <span>You already have this promotion&apos;s reward, so no new one is issued.</span>
          <Link className="btn btn-sm btn-secondary" href="/rewards">
            My Rewards
          </Link>
        </div>
      );
    }
    return (
      <div className="rw-result is-won">
        <b>🎁 Mission complete!</b>
        <span>Claim {PROMOTION.reward.title}. We&apos;ll keep this result while you sign in.</span>
        <Link className="btn btn-primary btn-block" href={claimHref(outcome.claimId)}>
          Claim your reward
        </Link>
      </div>
    );
  }

  if (outcome.state === 'missed') {
    const retry =
      game === 'wordle'
        ? 'Pick another game to try for the reward. Any one game earns it.'
        : progressNote ?? 'Try again, or pick another game. Any one game earns it.';
    return (
      <div className="rw-result">
        <b>Reward mission: {text}</b>
        <span>{retry}</span>
      </div>
    );
  }

  return (
    <div className="rw-result">
      <span>We couldn&apos;t check your reward mission this time. Check your connection and play again.</span>
    </div>
  );
}
