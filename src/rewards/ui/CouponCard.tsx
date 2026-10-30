import { PROMOTION } from '../config';
import { STATUS_LABEL, canUpgrade, formatDateTime, gameTitle } from '../format';
import type { CouponView } from '../types';
import { CouponTimer } from './CouponTimer';
import { SampleBadge } from './SampleBadge';
import './rewards.css';

export function CouponCard({
  coupon,
  serverNow,
  onTimerElapsed,
}: {
  coupon: CouponView;
  serverNow: string;
  onTimerElapsed?: () => void;
}) {
  return (
    <article className={`rw-coupon card is-${coupon.status}`}>
      <div className="rw-coupon-top">
        <span className={`badge rw-status is-${coupon.status}`}>{STATUS_LABEL[coupon.status]}</span>
        <SampleBadge />
      </div>
      <h2>{coupon.rewardTitle}</h2>
      <CouponTimer coupon={coupon} serverNow={serverNow} onElapsed={onTimerElapsed} />
      <dl className="rw-meta">
        <div>
          <dt>Usable from</dt>
          <dd>{coupon.validFrom ? formatDateTime(coupon.validFrom) : 'Now'}</dd>
        </div>
        <div>
          <dt>Valid until</dt>
          <dd>{coupon.expiresAt ? formatDateTime(coupon.expiresAt) : 'To be announced'}</dd>
        </div>
        <div>
          <dt>Earned in</dt>
          <dd>{gameTitle(coupon.sourceGame)}</dd>
        </div>
        <div>
          <dt>Code</dt>
          <dd className="rw-code">{coupon.code}</dd>
        </div>
      </dl>
      {canUpgrade(coupon) && coupon.percentOff > 0 && (
        <p className="rw-coupon-note">Score higher in Froyo Catch to upgrade this reward. Upgrades stop once you open the QR.</p>
      )}
    </article>
  );
}

/** Rewards that are finished. A record only: no QR and nothing to tap. */
export function PastRewards({ coupons }: { coupons: CouponView[] }) {
  return (
    <section>
      <h3 className="section-label">Used and expired rewards</h3>
      {coupons.length === 0 ? (
        <div className="card rw-empty">Rewards you&apos;ve used or that have expired will appear here.</div>
      ) : (
        <ul className="rw-past card">
          {coupons.map((coupon) => (
            <li key={coupon.id}>
              <div className="rw-past-top">
                <b>{coupon.rewardTitle}</b>
                <span className={`badge rw-status is-${coupon.status}`}>{STATUS_LABEL[coupon.status]}</span>
              </div>
              <span>
                {coupon.status === 'shown' && coupon.qrExecutedAt
                  ? `QR opened on ${formatDateTime(coupon.qrExecutedAt)}`
                  : coupon.expiresAt
                    ? `Expired on ${formatDateTime(coupon.expiresAt)}`
                    : 'Expired'}
              </span>
              <span className="rw-fine">
                Earned in {gameTitle(coupon.sourceGame)} · <span className="rw-code">{coupon.code}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function RewardTerms() {
  return (
    <section>
      <h3 className="section-label">How it works</h3>
      <ul className="rw-terms card">
        {PROMOTION.reward.terms.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </section>
  );
}
