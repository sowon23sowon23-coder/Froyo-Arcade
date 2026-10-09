/**
 * Every game the arcade knows about. The home page renders cards from this list,
 * so adding a game is: add an entry here, add its route under src/app/<slug>,
 * and build the game with the shared arcade components (GameShell, StartScreen,
 * StatBar, ResultSheet).
 */
export type GameSlug = 'catch' | 'crush' | 'wordle' | 'slice';

export type GameEntry = {
  slug: GameSlug;
  title: string;
  /** One or two sentences that describe how the game is actually played. */
  description: string;
  status: 'live' | 'coming-soon';
};

export const GAMES: GameEntry[] = [
  {
    slug: 'catch',
    title: 'Froyo Catch',
    description:
      'Slide your froyo cup to catch falling toppings. Every miss costs a life, and the toppings fall faster as your score climbs.',
    status: 'live',
  },
  {
    slug: 'crush',
    title: 'Froyo Crush',
    description:
      'Swap toppings to make rows of three or more. Hit each goal before you run out of moves across 21 levels.',
    status: 'live',
  },
  {
    slug: 'wordle',
    title: 'Wordle',
    description:
      'Guess the five-letter word in six tries. Green, yellow and gray tiles show how close each guess is.',
    status: 'live',
  },
  {
    slug: 'slice',
    title: 'Froyo Slice',
    description:
      'Swipe to slice fruit flying up the screen and pile the pieces onto your froyo. Dodge the bombs in a 30-second round.',
    status: 'live',
  },
];

export function gameHref(slug: GameSlug): string {
  return `/${slug}`;
}

export function getGame(slug: GameSlug): GameEntry {
  const game = GAMES.find((g) => g.slug === slug);
  if (!game) throw new Error(`Unknown game: ${slug}`);
  return game;
}
