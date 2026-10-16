'use client';

import { useEffect, useRef, useState } from 'react';
import { PROMOTION } from '../config';
import { QrCode } from './QrCode';
import './rewards.css';

/** Step 2: make sure staff are ready before the one-time window starts. */
export function ConfirmSheet({ busy, onConfirm, onCancel }: { busy: boolean; onConfirm: () => void; onCancel: () => void }) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => confirmRef.current?.focus({ preventScroll: true }), []);

  return (
    <div className="sheet-backdrop">
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="rw-confirm-title">
        <div className="sheet-icon" aria-hidden="true">
          🏪
        </div>
        <h2 id="rw-confirm-title">Ready at the register?</h2>
        <p className="sheet-message">
          Tap <b>Show QR now</b> only when staff are ready to scan. The QR stays on screen for{' '}
          <b>{PROMOTION.qrDisplaySeconds} seconds</b> and <b>can&apos;t be opened again</b>.
        </p>
        <div className="sheet-actions">
          <button ref={confirmRef} type="button" className="btn btn-block btn-primary" onClick={onConfirm} disabled={busy}>
            {busy ? 'Opening…' : 'Show QR now'}
          </button>
          <button type="button" className="btn btn-block btn-ghost" onClick={onCancel} disabled={busy}>
            Not yet
          </button>
        </div>
      </div>
    </div>
  );
}

function clockText(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-US', {
    timeZone: PROMOTION.timeZone,
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * The shared store QR with a live countdown. Time comes from the server's
 * start time plus the offset between the server clock and this phone, so a
 * refresh or another device shows only what is left of the same window.
 * The ticking clock and moving ring help staff tell a live screen from a screenshot.
 */
export function QrOverlay({
  value,
  code,
  showUntilMs,
  offsetMs,
  onEnd,
}: {
  value: string;
  code: string;
  showUntilMs: number;
  offsetMs: number;
  onEnd: () => void;
}) {
  const [now, setNow] = useState(() => Date.now() + offsetMs);
  const ended = useRef(false);
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;

  useEffect(() => {
    const tick = () => {
      const t = Date.now() + offsetMs;
      setNow(t);
      if (t >= showUntilMs && !ended.current) {
        ended.current = true;
        onEndRef.current();
      }
    };
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [offsetMs, showUntilMs]);

  // Keep the screen awake while staff scan.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock
      ?.request('screen')
      .then((l) => (lock = l))
      .catch(() => undefined);
    return () => void lock?.release().catch(() => undefined);
  }, []);

  const totalMs = PROMOTION.qrDisplaySeconds * 1000;
  const leftMs = Math.max(0, showUntilMs - now);
  const seconds = Math.ceil(leftMs / 1000);

  return (
    <div className="rw-qr-overlay" role="dialog" aria-modal="true" aria-labelledby="rw-qr-title">
      <div className="rw-qr-card">
        <h2 id="rw-qr-title">Show this to staff</h2>
        <p className="rw-muted">{PROMOTION.reward.title}</p>
        <div className="rw-qr-frame">
          <QrCode value={value} label="Store QR code" />
        </div>
        <div className="rw-qr-timer" aria-live="polite">
          <span className="rw-live-dot" aria-hidden="true" />
          <b>{seconds}s</b>
          <span>left</span>
        </div>
        <div className="rw-qr-bar" aria-hidden="true">
          <i style={{ transform: `scaleX(${leftMs / totalMs})` }} />
        </div>
        <dl className="rw-qr-meta">
          <div>
            <dt>Time now</dt>
            <dd>{clockText(now)}</dd>
          </div>
          <div>
            <dt>Code</dt>
            <dd className="rw-code">{code}</dd>
          </div>
        </dl>
        <p className="rw-fine">This QR closes on its own and can&apos;t be opened again.</p>
      </div>
    </div>
  );
}
