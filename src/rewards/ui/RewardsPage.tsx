'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { GameShell } from '@/components/arcade/GameShell';
import { executeQr, track } from '../client/api';
import { useRewards } from '../client/hooks';
import { claimHref, readPendingClaim, type PendingClaim } from '../client/pending';
import { browserAuth } from '../client/supabase';
import { canUpgrade, formatDateTime } from '../format';
import type { RewardsMe } from '../types';
import { CouponCard, PastRewards, RewardTerms } from './CouponCard';
import { SignIn } from './SignIn';
import { StoreList } from './StoreList';
import { ConfirmSheet, QrOverlay } from './UseInStore';
import './rewards.css';

type ActiveQr = { value: string; code: string; rewardTitle: string; showUntilMs: number; offsetMs: number };

function activeFrom(me: RewardsMe | null): ActiveQr | null {
  const c = me?.coupon;
  if (!me || !c || c.status !== 'showing' || !me.qrValue || !c.showUntil) return null;
  return { value: me.qrValue, code: c.code, rewardTitle: c.rewardTitle, showUntilMs: Date.parse(c.showUntil), offsetMs: Date.parse(me.serverNow) - Date.now() };
}

export function RewardsPage() {
  const { me, failed, reload, setMe } = useRewards();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState<ActiveQr | null>(null);
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState<PendingClaim | null>(null);

  useEffect(() => {
    track('rewards_view');
    setPending(readPendingClaim());
  }, []);

  // Coming back while the QR is up (refresh, another device) resumes the same window.
  useEffect(() => {
    const resumed = activeFrom(me);
    if (resumed) setActive(resumed);
  }, [me]);

  const coupon = me?.coupon ?? null;

  const open = async () => {
    if (!coupon) return;
    setBusy(true);
    setNotice('');
    const res = await executeQr(coupon.id);

    if (res?.ok) {
      setBusy(false);
      setConfirming(false);
      setMe((m) => (m ? { ...m, coupon: res.coupon, qrValue: res.qrValue, serverNow: res.serverNow } : m));
      if (res.qrValue && res.coupon.showUntil) {
        setActive({
          value: res.qrValue,
          code: res.coupon.code,
          rewardTitle: res.coupon.rewardTitle,
          showUntilMs: Date.parse(res.coupon.showUntil),
          offsetMs: Date.parse(res.serverNow) - Date.now(),
        });
      } else if (res.coupon.status === 'shown') {
        setNotice('This QR was already opened and its time has ended.');
      }
      return;
    }

    if (res && !res.ok && res.reason !== 'server') {
      setBusy(false);
      setConfirming(false);
      if (res.coupon) setMe((m) => (m ? { ...m, coupon: res.coupon ?? m.coupon } : m));
      if (res.reason === 'signed_out') void reload();
      setNotice(
        res.reason === 'qr_not_configured'
          ? "The in-store QR isn't set up yet. Your reward is still saved."
          : res.reason === 'not_yet'
            ? "This reward can't be used yet. Check the countdown above."
          : res.reason === 'expired'
            ? 'This reward has expired.'
            : "Couldn't open the QR. Your reward wasn't used. Try again."
      );
      return;
    }

    // No clear answer (offline, or the reply was lost): ask the server what actually happened.
    const latest = await reload();
    setBusy(false);
    setConfirming(false);
    if (activeFrom(latest)) return;
    if (latest?.coupon?.status === 'available') setNotice("Couldn't open the QR. Your reward wasn't used. Try again.");
    else if (!latest)
      setNotice(
        "Couldn't reach the server. Check your connection and try again. If the QR did open, the time left will show when you reconnect."
      );
  };

  const signOut = async () => {
    await browserAuth()?.auth.signOut();
    setActive(null);
    void reload();
  };

  let body: React.ReactNode;
  if (!me) {
    body = failed ? (
      <div className="card rw-empty">
        Couldn&apos;t load your rewards. Check your connection.
        <button type="button" className="btn btn-sm btn-primary" onClick={() => void reload()}>
          Try Again
        </button>
      </div>
    ) : (
      <p className="rw-muted">Loading your rewards…</p>
    );
  } else if (!me.configured) {
    body = <div className="card rw-empty">Rewards aren&apos;t available yet. You can still play every game.</div>;
  } else if (!me.signedIn) {
    body = (
      <>
        <div className="rw-intro">
          <h2>Sign in to see your reward</h2>
          <p>Your reward is saved to your account, so it&apos;s there on any device.</p>
        </div>
        <SignIn next="/rewards" onSignedIn={() => void reload()} />
      </>
    );
  } else if (!coupon) {
    body = (
      <>
        <div className="card rw-empty">
          <b>No reward yet</b>
          <span>
            Pick any game and complete its reward mission to earn a discount. One reward per account.
          </span>
          {pending ? (
            <Link className="btn btn-primary" href={claimHref(pending.claimId)}>
              Claim your mission reward
            </Link>
          ) : (
            <Link className="btn btn-primary" href="/">
              Play a game
            </Link>
          )}
        </div>
        <RewardTerms />
      </>
    );
  } else if (coupon.status === 'shown' || coupon.status === 'expired') {
    body = (
      <>
        <div className="card rw-empty">
          <b>No active reward</b>
          <span>
            {coupon.status === 'shown'
              ? "This promotion's reward has been used."
              : "This promotion's reward has expired."}{' '}
            Each account gets one reward per promotion. Games are always free to play.
          </span>
        </div>
        <RewardTerms />
      </>
    );
  } else {
    const canUse = coupon.status === 'available' && me.qrConfigured;
    body = (
      <>
        <CouponCard coupon={coupon} serverNow={me.serverNow} onTimerElapsed={() => void reload()} />

        {pending && canUpgrade(coupon) && pending.percentOff > coupon.percentOff && (
          <Link className="btn btn-primary btn-block" href={claimHref(pending.claimId)}>
            Upgrade your reward with your new score
          </Link>
        )}

        {coupon.status === 'waiting' && (
          <p className="rw-fine rw-center">
            The staff button opens when the countdown ends. Saving or viewing your reward does not open the QR.
          </p>
        )}

        {coupon.status === 'available' && (
          <div className="rw-use">
            <button
              type="button"
              className="btn btn-primary btn-block"
              disabled={!canUse}
              onClick={() => {
                track('use_in_store_open', { game: coupon.sourceGame });
                setNotice('');
                setConfirming(true);
              }}
            >
              Staff only: Use in store
            </button>
            <p className="rw-fine">
              {me.qrConfigured
                ? "Don't tap this yourself. Hand your phone to staff at the register, and they will open the QR. It works only once."
                : "The in-store QR for this reward isn't set up yet. Your reward is saved and will be ready to use once it is."}
            </p>
          </div>
        )}

        <StoreList sourceGame={coupon.sourceGame} />
        <RewardTerms />
      </>
    );
  }

  return (
    <GameShell title="My Rewards" className="rewards">
      <div className="rw-page screen-in">
        {notice && (
          <p className="rw-notice" role="status">
            {notice}
          </p>
        )}
        {body}
        {me?.signedIn && <PastRewards coupons={me.history} />}
        {me?.signedIn && (
          <p className="rw-account">
            Signed in as {me.email ?? 'your account'} ·{' '}
            <button type="button" className="rw-link" onClick={() => void signOut()}>
              Sign out
            </button>
          </p>
        )}
      </div>

      {confirming && <ConfirmSheet busy={busy} onConfirm={() => void open()} onCancel={() => setConfirming(false)} />}

      {active && (
        <QrOverlay
          {...active}
          onEnd={() => {
            setActive(null);
            setNotice(`QR display ended at ${formatDateTime(new Date(active.showUntilMs).toISOString())}.`);
            void reload();
          }}
        />
      )}
    </GameShell>
  );
}
