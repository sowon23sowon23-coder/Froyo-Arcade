import { GAMES } from '@/games/registry';
import { landingMeta } from '@/rewards/attribution';
import { anonId } from '@/rewards/server/anon';
import { logEvent } from '@/rewards/server/events';
import { json, readBody } from '@/rewards/server/http';
import { currentUser, rewardsConfigured } from '@/rewards/server/supabase';
import { CLIENT_EVENTS, type ClientEvent } from '@/rewards/types';

/** Funnel events that only the browser sees (arrivals, store link taps, screen views). */
export async function POST(request: Request) {
  const body = await readBody(request);
  const type = CLIENT_EVENTS.find((t) => t === body.type) as ClientEvent | undefined;
  if (!type) return json({ ok: false }, 400);
  if (!rewardsConfigured()) return json({ ok: true });

  if (type === 'landing') {
    const meta = landingMeta({
      utm: body.utm && typeof body.utm === 'object' ? (body.utm as Record<string, unknown>) : {},
      referrer: typeof body.referrer === 'string' ? body.referrer : '',
      path: typeof body.path === 'string' ? body.path : '/',
      userAgent: request.headers.get('user-agent') ?? '',
      ownHost: new URL(request.url).hostname.replace(/^www\./, ''),
    });
    logEvent({ type, anonId: await anonId(), meta });
    return json({ ok: true });
  }

  const game = GAMES.find((g) => g.slug === body.game)?.slug ?? null;
  const store = typeof body.store === 'string' ? body.store.slice(0, 120) : undefined;
  const user = await currentUser();
  logEvent({ type, game, anonId: await anonId(), userId: user?.id ?? null, meta: store ? { store } : {} });
  return json({ ok: true });
}
