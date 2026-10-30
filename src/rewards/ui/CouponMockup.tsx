'use client';

import { useEffect, useState } from 'react';
import { GameShell } from '@/components/arcade/GameShell';
import { PROMOTION } from '../config';
import { formatDateTime } from '../format';
import type { CouponView } from '../types';
import { CouponCard, PastRewards, RewardTerms } from './CouponCard';
import { StoreList } from './StoreList';
import { ConfirmSheet, QrOverlay } from './UseInStore';
import './rewards.css';

/**
 * A look at every coupon screen with made-up data. Nothing here calls the
 * server or touches the database, and the QR holds a value no POS accepts.
 */
const SAMPLE_QR = 'FROYO-ARCADE-MOCKUP-NOT-A-REAL-COUPON';
const SAMPLE_CODE = 'SAMP-LE00';
const HOUR_MS = 60 * 60 * 1000;

const STATES = ['waiting', 'available', 'shown', 'expired'] as const;
type MockState = (typeof STATES)[number];
const STATE_LABEL: Record<MockState, string> = { waiting: 'Starts soon', available: 'Ready', shown: 'Used', expired: 'Expired' };
const PERCENTS = [10, 15, 25, 30, 35];

function sampleCoupon(state: MockState, percentOff: number, nowMs: number): CouponView {
  const iso = (hours: number) => new Date(nowMs + hours * HOUR_MS).toISOString();
  const week = PROMOTION.validDays * 24;
  const wait = PROMOTION.activationHours;
  // Hours since the coupon was issued, chosen to land inside each state.
  const age = { waiting: 3, available: wait + 24, shown: wait + 30, expired: wait + week + 5 }[state];
  return {
    id: 'mockup',
    code: SAMPLE_CODE,
    rewardTitle: `${percentOff}% off 1 cup`,
    percentOff,
    sourceGame: 'catch',
    issuedAt: iso(-age),
    validFrom: iso(wait - age),
    expiresAt: iso(wait + week - age),
    qrExecutedAt: state === 'shown' ? iso(-2) : null,
    showUntil: null,
    status: state,
  };
}

export function CouponMockup() {
  const [nowMs, setNowMs] = useState<number | null>(null);
  const [state, setState] = useState<MockState>('available');
  const [percentOff, setPercentOff] = useState(25);
  const [confirming, setConfirming] = useState(false);
  const [showUntilMs, setShowUntilMs] = useState<number | null>(null);

  // The clock starts in the browser, so server and browser renders match.
  useEffect(() => setNowMs(Date.now()), []);

  const pick = (next: MockState) => {
    setNowMs(Date.now());
    setState(next);
  };

  if (nowMs === null) return null;

  const coupon = sampleCoupon(state, percentOff, nowMs);
  const finished = state === 'shown' || state === 'expired';

  return (
    <GameShell title="Reward Mockup" className="rewards">
      <div className="rw-page screen-in">
        <p className="rw-mock-banner" role="note">
          <b>Mockup.</b> This is not a real coupon, and its QR won&apos;t work in store.
        </p>

        <div className="rw-mock-controls card">
          <div>
            <span className="eyebrow">Coupon state</span>
            <div className="rw-mock-options">
              {STATES.map((s) => (
                <button key={s} type="button" className={`btn btn-sm ${s === state ? 'btn-primary' : 'btn-secondary'}`} aria-pressed={s === state} onClick={() => pick(s)}>
                  {STATE_LABEL[s]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="eyebrow">Discount</span>
            <div className="rw-mock-options">
              {PERCENTS.map((p) => (
                <button key={p} type="button" className={`btn btn-sm ${p === percentOff ? 'btn-primary' : 'btn-secondary'}`} aria-pressed={p === percentOff} onClick={() => setPercentOff(p)}>
                  {p}%
                </button>
              ))}
            </div>
          </div>
        </div>

        {finished ? (
          <div className="card rw-empty">
            <b>No active reward</b>
            <span>
              {state === 'shown' ? "This promotion's reward has been used." : "This promotion's reward has expired."} Each account
              gets one reward per promotion. Games are always free to play.
            </span>
          </div>
        ) : (
          <>
            <CouponCard coupon={coupon} serverNow={new Date(nowMs).toISOString()} />
            {state === 'waiting' && (
              <p className="rw-fine rw-center">
                The staff button opens when the countdown ends. Saving or viewing your reward does not open the QR.
              </p>
            )}
            {state === 'available' && (
              <div className="rw-use">
                <button type="button" className="btn btn-primary btn-block" onClick={() => setConfirming(true)}>
                  Staff only: Use in store
                </button>
                <p className="rw-fine">
                  Don&apos;t tap this yourself. Hand your phone to staff at the register, and they will open the QR. It works only once.
                </p>
              </div>
            )}
          </>
        )}

        {!finished && <StoreList />}
        <RewardTerms />
        <PastRewards coupons={finished ? [coupon] : []} />
        <p className="rw-account">Sample code {SAMPLE_CODE} · Expires {formatDateTime(coupon.expiresAt!)}</p>
      </div>

      {confirming && (
        <ConfirmSheet
          busy={false}
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            setShowUntilMs(Date.now() + PROMOTION.qrDisplaySeconds * 1000);
          }}
        />
      )}

      {showUntilMs !== null && (
        <QrOverlay
          value={SAMPLE_QR}
          code={SAMPLE_CODE}
          rewardTitle={coupon.rewardTitle}
          showUntilMs={showUntilMs}
          offsetMs={0}
          mockup
          onEnd={() => {
            setShowUntilMs(null);
            pick('shown');
          }}
        />
      )}
    </GameShell>
  );
}
