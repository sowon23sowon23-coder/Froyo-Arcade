'use client';

import Link from 'next/link';
import type { GameSlug } from '@/games/registry';
import { PROMOTION, missionText } from '../config';
import { useRewards } from '../client/hooks';
import { SampleBadge } from './SampleBadge';
import './rewards.css';

/** "Reward mission" box on a game's start screen. Hidden when the game isn't in the promotion. */
export function MissionCard({ game }: { game: GameSlug }) {
  const { me } = useRewards();
  const text = missionText(game);
  if (!text || (me && !me.configured)) return null;

  const hasReward = Boolean(me?.coupon);

  return (
    <section className="rw-mission card" aria-label="Reward mission">
      <div className="rw-mission-head">
        <span className="rw-gift" aria-hidden="true">
          🎁
        </span>
        <div>
          <span className="eyebrow">Reward mission</span>
          <b>{text}</b>
        </div>
      </div>
      {hasReward ? (
        <p className="rw-mission-note">
          You already have this promotion&apos;s reward. Games are always free to play.{' '}
          <Link href="/rewards">My Rewards</Link>
        </p>
      ) : (
        <p className="rw-mission-note">
          Earn {PROMOTION.reward.title}. Complete any one game&apos;s mission. One reward per account.
        </p>
      )}
      <SampleBadge />
    </section>
  );
}
