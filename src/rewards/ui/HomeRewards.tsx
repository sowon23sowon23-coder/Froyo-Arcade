'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRewards } from '../client/hooks';
import { claimHref, readPendingClaim, type PendingClaim } from '../client/pending';
import { canUpgrade } from '../format';
import { SampleBadge } from './SampleBadge';
import './rewards.css';

function GiftIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 11h16v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9zM3 7h18v4H3zM12 7v14M12 7c-1.5-3-5-3.5-5-1s3 1 5 1zm0 0c1.5-3 5-3.5 5-1s-3 1-5 1z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Header button on the home page, with a dot when a reward is ready to use. */
export function RewardsButton() {
  const { me } = useRewards();
  if (me && !me.configured) return null;
  const ready = me?.coupon?.status === 'available' || me?.coupon?.status === 'showing';
  return (
    <div className="rw-header-account">
      <Link className="btn btn-sm btn-secondary rw-header-btn" href="/rewards">
        <GiftIcon />
        My Rewards
        {ready && <span className="rw-dot" aria-label="Reward ready" />}
      </Link>
      {me?.signedIn && (
        <div className="rw-signed-in" title={me.email ?? undefined}>
          <span className="rw-signed-in-dot" aria-hidden="true" />
          <span className="rw-signed-in-text">Signed in{me.email ? ` as ${me.email}` : ''}</span>
        </div>
      )}
    </div>
  );
}

/** The shared-reward explainer above the game cards, plus where this visitor stands. */
export function RewardsBanner() {
  const { me } = useRewards();
  const [pending, setPending] = useState<PendingClaim | null>(null);
  useEffect(() => setPending(readPendingClaim()), []);

  if (!me || !me.configured) return null;
  const coupon = me.coupon;

  let status: React.ReactNode;
  if (pending && (!coupon || (canUpgrade(coupon) && pending.percentOff > coupon.percentOff))) {
    status = (
      <Link className="btn btn-sm btn-primary" href={claimHref(pending.claimId)}>
        {coupon ? 'New high score · Upgrade your reward' : 'Mission complete · Claim your reward'}
      </Link>
    );
  } else if (coupon?.status === 'waiting') {
    status = (
      <Link className="btn btn-sm btn-primary" href="/rewards">
        Reward saved · See when you can use it
      </Link>
    );
  } else if (coupon?.status === 'available' || coupon?.status === 'showing') {
    status = (
      <Link className="btn btn-sm btn-primary" href="/rewards">
        Your reward is ready · My Rewards
      </Link>
    );
  } else if (coupon) {
    status = <span className="rw-banner-note">You&apos;ve received this promotion&apos;s reward. Keep playing for fun!</span>;
  }

  return (
    <section className="rw-banner" aria-label="Froyo Rewards">
      <div className="rw-banner-text">
        <span className="eyebrow">Froyo Rewards</span>
        <h2>Play any game. Hit its mission. Get a reward.</h2>
        <p>
          Complete one game&apos;s reward mission to earn a discount. You only need one game. One reward per account.
        </p>
        <SampleBadge />
      </div>
      {status && <div className="rw-banner-status">{status}</div>}
    </section>
  );
}
