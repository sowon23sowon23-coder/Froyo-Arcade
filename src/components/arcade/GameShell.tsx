'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';

export function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Shared frame for every game page: sticky header with a way back to the arcade. */
export function GameShell({
  title,
  headerRight,
  className,
  children,
}: {
  title: string;
  headerRight?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className={`game-page${className ? ` ${className}` : ''}`}>
      <header className={`game-header${scrolled ? ' scrolled' : ''}`}>
        <Link className="back-link" href="/" aria-label="Back to Arcade">
          <BackIcon />
          Arcade
        </Link>
        <h1>{title}</h1>
        <div className="slot">{headerRight}</div>
      </header>
      <main className="game-main">{children}</main>
    </div>
  );
}
