import { NextResponse } from 'next/server';
import { submitGuess } from '@/games/wordle/server/game';

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, reason: 'invalid_length' }, { status: 400 });
  }

  const result = await submitGuess((body as { guess?: unknown } | null)?.guess);
  return NextResponse.json(result, {
    status: result.ok ? 200 : 400,
    headers: { 'Cache-Control': 'no-store' },
  });
}
