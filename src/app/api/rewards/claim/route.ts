import { anonId } from '@/rewards/server/anon';
import { redeemClaim, toView } from '@/rewards/server/coupons';
import { UUID, json, readBody } from '@/rewards/server/http';
import { currentUser, rewardsConfigured } from '@/rewards/server/supabase';
import type { ClaimResponse } from '@/rewards/types';

export async function POST(request: Request) {
  if (!rewardsConfigured()) return json<ClaimResponse>({ ok: false, reason: 'not_configured' }, 503);

  const body = await readBody(request);
  const claimId = typeof body.claimId === 'string' && UUID.test(body.claimId) ? body.claimId : null;
  if (!claimId) return json<ClaimResponse>({ ok: false, reason: 'claim_not_found' }, 404);

  const user = await currentUser();
  if (!user) return json<ClaimResponse>({ ok: false, reason: 'signed_out' }, 401);

  try {
    const result = await redeemClaim(claimId, user.id, await anonId());
    if (!result.ok) return json<ClaimResponse>(result, result.reason === 'claim_expired' ? 410 : 404);
    return json<ClaimResponse>({ ok: true, coupon: toView(result.row, Date.now()), newlyIssued: result.newlyIssued });
  } catch {
    return json<ClaimResponse>({ ok: false, reason: 'server' }, 500);
  }
}
