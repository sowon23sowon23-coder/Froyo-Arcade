import { GAMES, type GameSlug } from '@/games/registry';
import { anonId } from '@/rewards/server/anon';
import { logEvent } from '@/rewards/server/events';
import { json, readBody } from '@/rewards/server/http';
import { admin, rewardsConfigured } from '@/rewards/server/supabase';

/** A round is starting. The session's server-side start time is what /api/play/finish checks against. */
export async function POST(request: Request) {
  const body = await readBody(request);
  const game = GAMES.find((g) => g.slug === body.game)?.slug as GameSlug | undefined;
  if (!game) return json({ ok: false }, 400);
  if (!rewardsConfigured()) return json({ ok: true, sessionId: null });

  const anon = await anonId();
  const { data, error } = await admin().from('play_sessions').insert({ anon_id: anon, game }).select('id').single();
  if (error || !data) return json({ ok: false }, 500);

  logEvent({ type: 'game_start', game, anonId: anon });
  return json({ ok: true, sessionId: data.id as string });
}
