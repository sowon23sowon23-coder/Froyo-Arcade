import type { Metadata } from 'next';
import CrushGame from '@/games/crush/CrushGame';
import { getGame } from '@/games/registry';

const game = getGame('crush');

export const metadata: Metadata = { title: game.title, description: game.description };

export default function CrushPage() {
  return <CrushGame />;
}
