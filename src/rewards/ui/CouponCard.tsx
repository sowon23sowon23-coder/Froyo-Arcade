import { PROMOTION } from '../config';
import { STATUS_LABEL, formatDate, formatDateTime, gameTitle } from '../format';
import type { CouponView } from '../types';
import { SampleBadge } from './SampleBadge';
import './rewards.css';

export function CouponCard({ coupon }: { coupon: CouponView }) {
  return (
    <article className={`rw-coupon card is-${coupon.status}`}>
      <div className="rw-coupon-top">
        <span className={`badge rw-status is-${coupon.status}`}>{STATUS_LABEL[coupon.status]}</span>
        <SampleBadge />
      </div>
      <h2>{PROMOTION.reward.title}</h2>
      <dl className="rw-meta">
        <div>
          <dt>Valid until</dt>
          <dd>{coupon.expiresAt ? formatDate(coupon.expiresAt) : 'To be announced'}</dd>
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
      {coupon.status === 'shown' && coupon.qrExecutedAt && (
        <p className="rw-coupon-note">
          The in-store QR was opened on {formatDateTime(coupon.qrExecutedAt)}. It can&apos;t be opened again.
        </p>
      )}
      {coupon.status === 'expired' && <p className="rw-coupon-note">This reward expired before it was used in store.</p>}
    </article>
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
