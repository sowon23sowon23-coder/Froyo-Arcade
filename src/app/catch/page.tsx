import type { Metadata } from 'next';
import CatchGame from '@/games/catch/CatchGame';
import { getGame } from '@/games/registry';

const game = getGame('catch');

export const metadata: Metadata = { title: game.title, description: game.description };

export default function CatchPage() {
  return <CatchGame />;
}
