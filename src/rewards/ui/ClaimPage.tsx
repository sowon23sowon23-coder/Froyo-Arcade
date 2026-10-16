'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { GameShell } from '@/components/arcade/GameShell';
import { PROMOTION } from '../config';
import { claimReward, track } from '../client/api';
import { useRewards } from '../client/hooks';
import { clearPendingClaim } from '../client/pending';
import type { ClaimResponse } from '../types';
import { CouponCard } from './CouponCard';
import { SampleBadge } from './SampleBadge';
import { SignIn } from './SignIn';
import { StoreList } from './StoreList';
import './rewards.css';

/** Mission complete → sign in (if needed) → coupon saved → where to use it. */
export function ClaimPage() {
  const params = useSearchParams();
  const claimId = params.get('c') ?? '';
  const { me, failed, reload } = useRewards();
  const [result, setResult] = useState<ClaimResponse | null>(null);
  const started = useRef(false);

  useEffect(() => track('claim_view'), []);

  const claim = useCallback(async () => {
    if (started.current) return;
    started.current = true;
    const res = await claimReward(claimId);
    setResult(res);
    if (res.ok || res.reason === 'claim_not_found' || res.reason === 'claim_expired') clearPendingClaim();
    if (!res.ok && res.reason === 'signed_out') started.current = false;
  }, [claimId]);

  // Claim as soon as we know the player is signed in (also right after Google sends them back here).
  useEffect(() => {
    if (me?.configured && me.signedIn && claimId) void claim();
  }, [me, claimId, claim]);

  const next = `/rewards/claim?c=${encodeURIComponent(claimId)}`;
  let body: React.ReactNode;

  if (!claimId) {
    body = <div className="card rw-empty">This link is missing its mission result. Play a game to earn a reward.</div>;
  } else if (!me) {
    body = failed ? (
      <div className="card rw-empty">
        Couldn&apos;t reach the server. Your mission result is kept for 24 hours.
        <button type="button" className="btn btn-sm btn-primary" onClick={() => void reload()}>
          Try Again
        </button>
      </div>
    ) : (
      <p className="rw-muted">Loading…</p>
    );
  } else if (!me.configured) {
    body = <div className="card rw-empty">Rewards aren&apos;t available yet. You can still play every game.</div>;
  } else if (!me.signedIn) {
    body = (
      <>
        <div className="rw-intro">
          <span className="rw-big" aria-hidden="true">
            🎉
          </span>
          <h2>Mission complete!</h2>
          <p>
            Sign in to save {PROMOTION.reward.title} to your account. Your result is kept while you sign in.
          </p>
          <SampleBadge />
        </div>
        <SignIn next={next} onSignedIn={() => void reload()} allowBrowserSwitch={false} />
      </>
    );
  } else if (!result) {
    body = <p className="rw-muted">Saving your reward…</p>;
  } else if (result.ok) {
    body = (
      <>
        <div className="rw-intro">
          <span className="rw-big" aria-hidden="true">
            {result.newlyIssued ? '🎁' : '🍨'}
          </span>
          <h2>{result.newlyIssued ? 'Saved to My Rewards' : "You've already received this reward"}</h2>
          <p>
            {result.newlyIssued
              ? 'At the store, open My Rewards and tap Use in store at the register.'
              : 'Each account gets one reward per promotion, whichever game earned it. Your games are still free to play.'}
          </p>
        </div>
        <CouponCard coupon={result.coupon} />
        <Link className="btn btn-primary btn-block" href="/rewards">
          Go to My Rewards
        </Link>
        {result.newlyIssued && (
          <p className="rw-fine rw-center">
            Tip: open this site in Safari or Chrome, or add it to your Home Screen, so it&apos;s quick to find at the register.
          </p>
        )}
        <StoreList sourceGame={result.coupon.sourceGame} />
      </>
    );
  } else {
    const message =
      result.reason === 'claim_expired'
        ? 'This mission result has expired. Play again to earn a new one.'
        : result.reason === 'claim_not_found'
          ? "We couldn't find this mission result. It may have been played in a different browser."
          : "Couldn't save your reward. Check your connection and try again.";
    body = (
      <div className="card rw-empty">
        {message}
        {result.reason === 'server' ? (
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={() => {
              setResult(null);
              started.current = false;
              void claim();
            }}
          >
            Try Again
          </button>
        ) : (
          <Link className="btn btn-sm btn-primary" href="/">
            Back to Arcade
          </Link>
        )}
      </div>
    );
  }

  return (
    <GameShell title="Claim Reward" className="rewards">
      <div className="rw-page screen-in">{body}</div>
    </GameShell>
  );
}
