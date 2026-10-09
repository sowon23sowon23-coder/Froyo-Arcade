import type { Metadata } from 'next';
import WordleGame from '@/games/wordle/WordleGame';
import { getGame } from '@/games/registry';

const game = getGame('wordle');

export const metadata: Metadata = { title: game.title, description: game.description };

export default function WordlePage() {
  return <WordleGame />;
}
