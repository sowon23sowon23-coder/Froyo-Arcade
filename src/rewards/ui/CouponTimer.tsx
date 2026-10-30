'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CouponView } from '../types';
import './rewards.css';

function remainingText(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const days = Math.floor(total / 86400);
  const clock = [Math.floor((total % 86400) / 3600), Math.floor((total % 3600) / 60), total % 60]
    .map((n) => String(n).padStart(2, '0'))
    .join(':');
  return days > 0 ? `${days}d ${clock}` : clock;
}

/**
 * Live countdown to when the coupon can be used, then to when it expires.
 * Counts on the server's clock (via `serverNow`), so a wrong phone clock can't
 * change it. The server still decides at the moment the QR is opened.
 */
export function CouponTimer({
  coupon,
  serverNow,
  onElapsed,
}: {
  coupon: CouponView;
  serverNow: string;
  /** Called when the countdown reaches zero, so the page can refresh the coupon's state. */
  onElapsed?: () => void;
}) {
  const offsetMs = useMemo(() => Date.parse(serverNow) - Date.now(), [serverNow]);
  const [now, setNow] = useState(() => Date.now() + offsetMs);

  const waiting = coupon.status === 'waiting';
  const targetIso = waiting ? coupon.validFrom : coupon.status === 'available' ? coupon.expiresAt : null;
  const startIso = waiting ? coupon.issuedAt : (coupon.validFrom ?? coupon.issuedAt);
  const targetMs = targetIso ? Date.parse(targetIso) : null;

  const onElapsedRef = useRef(onElapsed);
  onElapsedRef.current = onElapsed;

  useEffect(() => {
    if (targetMs === null) return;
    let fired = false;
    const tick = () => {
      const t = Date.now() + offsetMs;
      setNow(t);
      if (t >= targetMs && !fired) {
        fired = true;
        onElapsedRef.current?.();
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [offsetMs, targetMs]);

  if (targetMs === null) return null;

  const span = targetMs - Date.parse(startIso);
  const left = Math.max(0, targetMs - now);
  const share = span > 0 ? Math.min(1, left / span) : 0;

  return (
    <div className={`rw-timer${waiting ? ' is-waiting' : ''}`}>
      <div className="rw-timer-row">
        <span className="rw-timer-label">
          <span className="rw-live-dot" aria-hidden="true" />
          {waiting ? 'Usable in' : 'Time left to use'}
        </span>
        <b role="timer">{remainingText(left)}</b>
      </div>
      <div className="rw-qr-bar" aria-hidden="true">
        <i style={{ transform: `scaleX(${share})` }} />
      </div>
    </div>
  );
}
