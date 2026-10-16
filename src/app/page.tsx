import Link from 'next/link';
import { GameThumbnail } from '@/components/arcade/Thumbnails';
import { GAMES, gameHref, type GameEntry } from '@/games/registry';
import { RewardsBanner, RewardsButton } from '@/rewards/ui/HomeRewards';
import './home.css';

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 5.5v13a1 1 0 0 0 1.52.85l10.4-6.5a1 1 0 0 0 0-1.7L9.52 4.65A1 1 0 0 0 8 5.5z" fill="currentColor" />
    </svg>
  );
}

function GameCard({ game, index }: { game: GameEntry; index: number }) {
  const live = game.status === 'live';
  const body = (
    <>
      <div className="game-card-art">
        <GameThumbnail slug={game.slug} />
        {!live && <span className="badge game-card-soon">Coming Soon</span>}
      </div>
      <div className="game-card-body">
        <div className="game-card-text">
          <h2>{game.title}</h2>
          <p>{game.description}</p>
        </div>
        <span className={`btn btn-sm ${live ? 'btn-primary' : 'btn-secondary'} game-card-play`} aria-hidden="true">
          {live ? (
            <>
              <PlayIcon />
              Play
            </>
          ) : (
            'Coming Soon'
          )}
        </span>
      </div>
    </>
  );

  const style = { animationDelay: `${index * 60}ms` };

  if (!live) {
    return (
      <article className="game-card is-disabled" aria-disabled="true" style={style}>
        <span className="sr-only">{game.title} is coming soon.</span>
        {body}
      </article>
    );
  }

  return (
    <Link className="game-card" href={gameHref(game.slug)} aria-label={`Play ${game.title}`} style={style}>
      {body}
    </Link>
  );
}

export default function HomePage() {
  return (
    <div className="home">
      <header className="home-head">
        <div className="home-top">
          <img className="home-logo" src="/brand/yogurtland-logo.png" alt="Yogurtland" width={112} height={30} />
          <RewardsButton />
        </div>
        <h1>Froyo Arcade</h1>
        <p>Sweet little games, served by the cup. Pick one and start playing, no sign-up needed.</p>
      </header>

      <main>
        <RewardsBanner />
        <ul className="game-grid">
          {GAMES.map((game, i) => (
            <li key={game.slug}>
              <GameCard game={game} index={i} />
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
