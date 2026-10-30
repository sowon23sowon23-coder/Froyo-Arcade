'use client';

import Link from 'next/link';
import type { GameSlug } from '@/games/registry';
import { PROMOTION, catchTiers, missionText } from '../config';
import { useRewards } from '../client/hooks';
import { canUpgrade } from '../format';
import { SampleBadge } from './SampleBadge';
import './rewards.css';

/** "Reward mission" box on a game's start screen. Hidden when the game isn't in the promotion. */
export function MissionCard({ game }: { game: GameSlug }) {
  const { me } = useRewards();
  const text = missionText(game);
  if (!text || (me && !me.configured)) return null;

  const coupon = me?.coupon ?? null;
  const tiers = game === 'catch' ? catchTiers() : [];
  // With a reward already saved, only a game that can still raise it keeps showing its tiers.
  const showTiers = tiers.length > 0 && (!coupon || canUpgrade(coupon));

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
      {coupon ? (
        <p className="rw-mission-note">
          You have {coupon.rewardTitle}.{' '}
          {showTiers ? 'Score higher to upgrade it before you use it.' : 'Games are always free to play.'}{' '}
          <Link href="/rewards">My Rewards</Link>
        </p>
      ) : (
        <p className="rw-mission-note">
          {tiers.length > 0 ? 'The higher you score, the bigger the discount.' : `Earn ${PROMOTION.reward.title}.`} Complete any
          one game&apos;s mission. One reward per account.
        </p>
      )}
      {showTiers && (
        <ul className="rw-tiers">
          {tiers.map((tier) => (
            <li key={tier.score}>
              <span>{tier.score}+ points</span>
              <b>{tier.title}</b>
            </li>
          ))}
        </ul>
      )}
      <SampleBadge />
    </section>
  );
}
