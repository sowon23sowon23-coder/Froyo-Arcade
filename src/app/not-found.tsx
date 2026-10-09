import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="game-main" style={{ justifyContent: 'center', minHeight: '100dvh', textAlign: 'center', gap: 16 }}>
      <div className="sheet-icon tone-gray" aria-hidden="true">
        🍨
      </div>
      <h1 style={{ fontSize: 'var(--fs-xl)', fontWeight: 800 }}>This page melted away</h1>
      <p style={{ color: 'var(--text-2)' }}>The game you were looking for isn&apos;t here.</p>
      <Link className="btn btn-primary" href="/">
        Back to Arcade
      </Link>
    </main>
  );
}
