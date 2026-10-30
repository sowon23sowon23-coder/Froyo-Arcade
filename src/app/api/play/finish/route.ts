import type { GameSlug } from '@/games/registry';
import { rewardFor } from '@/rewards/config';
import { anonId } from '@/rewards/server/anon';
import { logEvent } from '@/rewards/server/events';
import { UUID, json, readBody } from '@/rewards/server/http';
import { createClaim, judge, type PlayResult } from '@/rewards/server/missions';
import { admin, rewardsConfigured } from '@/rewards/server/supabase';
import type { MissionOutcome } from '@/rewards/types';

/**
 * A round ended. Catch and Slice finish a session once; Crush keeps one
 * session per visit and reports each level it clears.
 */
export async function POST(request: Request) {
  const body = await readBody(request);
  const sessionId = typeof body.sessionId === 'string' && UUID.test(body.sessionId) ? body.sessionId : null;
  const result = (body.result && typeof body.result === 'object' ? body.result : {}) as PlayResult;
  if (!rewardsConfigured() || !sessionId) return json<MissionOutcome>({ state: 'off' });

  const anon = await anonId();
  const db = admin();
  const { data: session } = await db
    .from('play_sessions')
    .select('id, game, started_at, finished_at')
    .eq('id', sessionId)
    .eq('anon_id', anon)
    .maybeSingle();
  if (!session || session.game === 'wordle') return json<MissionOutcome>({ state: 'error' }, 404);

  const game = session.game as GameSlug;
  if (session.finished_at && game !== 'crush') return json<MissionOutcome>({ state: 'error' }, 409);

  const elapsedMs = Date.now() - Date.parse(session.started_at);
  const verdict = judge(game, result, elapsedMs);

  if (!session.finished_at) {
    await db
      .from('play_sessions')
      .update({ finished_at: new Date().toISOString(), result: verdict.summary })
      .eq('id', session.id);
  }
  logEvent({
    type: 'game_complete',
    game,
    anonId: anon,
    meta: { ...verdict.summary, elapsedMs, plausible: verdict.plausible },
  });

  if (!verdict.achieved) return json<MissionOutcome>({ state: 'missed' });

  // Crush reports every level it clears on one session. Replaying a level reuses the
  // best claim so far; only a result that pays more gets a new one, so the coupon
  // matches what the result screen promises.
  const { data: priors } = await db.from('mission_claims').select('id, result').eq('play_session_id', session.id);
  const reward = rewardFor(game, verdict.summary);
  const best = (priors ?? [])
    .map((claim) => ({ id: claim.id as string, reward: rewardFor(game, (claim.result ?? {}) as PlayResult) }))
    .sort((a, b) => b.reward.percentOff - a.reward.percentOff)[0];
  if (best && best.reward.percentOff >= reward.percentOff) {
    return json<MissionOutcome>({ state: 'achieved', claimId: best.id, reward: best.reward });
  }

  return json<MissionOutcome>(
    await createClaim({ game, anonId: anon, playSessionId: session.id, result: verdict.summary })
  );
}
