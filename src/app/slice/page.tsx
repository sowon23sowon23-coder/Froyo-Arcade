import type { Metadata } from 'next';
import SliceGame from '@/games/slice/SliceGame';
import { getGame } from '@/games/registry';

const game = getGame('slice');

export const metadata: Metadata = { title: game.title, description: game.description };

export default function SlicePage() {
  return <SliceGame />;
}
