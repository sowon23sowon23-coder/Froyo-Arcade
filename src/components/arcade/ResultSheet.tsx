'use client';

import Link from 'next/link';
import { useEffect, useRef, type ReactNode } from 'react';
import { StatBar, type StatItem } from './StatBar';

export type SheetAction = {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary' | 'tonal';
  disabled?: boolean;
};

/**
 * End-of-round card shared by every game. "Back to Arcade" is always the last
 * action so leaving works the same way everywhere.
 */
export function ResultSheet({
  icon,
  iconTone,
  title,
  message,
  stats,
  children,
  actions,
  note,
}: {
  icon: ReactNode;
  iconTone?: 'green' | 'gray';
  title: string;
  message?: ReactNode;
  stats?: StatItem[];
  children?: ReactNode;
  /** Usually "Play Again" first, then any game-specific extras. */
  actions: SheetAction[];
  /** Small caption under the actions (e.g. why Play Again is unavailable). */
  note?: ReactNode;
}) {
  const firstButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    firstButton.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div className="sheet-backdrop">
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="result-title">
        <div className={`sheet-icon${iconTone ? ` tone-${iconTone}` : ''}`} aria-hidden="true">
          {icon}
        </div>
        <h2 id="result-title">{title}</h2>
        {message ? <p className="sheet-message">{message}</p> : null}
        {children ? <div className="sheet-body">{children}</div> : null}
        {stats ? <StatBar items={stats} /> : null}
        <div className="sheet-actions">
          {actions.map((action, i) => (
            <button
              key={action.label}
              ref={i === 0 ? firstButton : undefined}
              type="button"
              className={`btn btn-block btn-${action.variant ?? (i === 0 ? 'primary' : 'secondary')}`}
              onClick={action.onClick}
              disabled={action.disabled}
            >
              {action.label}
            </button>
          ))}
          {note ? <p className="sheet-note">{note}</p> : null}
          <Link className="btn btn-block btn-ghost" href="/">
            Back to Arcade
          </Link>
        </div>
      </div>
    </div>
  );
}
