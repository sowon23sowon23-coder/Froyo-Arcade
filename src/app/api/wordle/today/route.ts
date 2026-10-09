import { NextResponse } from 'next/server';
import { getToday } from '@/games/wordle/server/game';

export async function GET() {
  return NextResponse.json(await getToday(), { headers: { 'Cache-Control': 'no-store' } });
}
