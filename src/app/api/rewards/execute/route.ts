import { anonId } from '@/rewards/server/anon';
import { couponForUser, executeQr, toView } from '@/rewards/server/coupons';
import { UUID, json, readBody } from '@/rewards/server/http';
import { currentUser, rewardsConfigured, storeQrValue } from '@/rewards/server/supabase';
import type { ExecuteResponse } from '@/rewards/types';

/**
 * "Staff: Show QR now" at the register. The first successful call fixes the start
 * time; later calls (refresh, second device, double tap) get the same window
 * back. A call that fails before the database write leaves the coupon unused.
 */
export async function POST(request: Request) {
  if (!rewardsConfigured()) return json<ExecuteResponse>({ ok: false, reason: 'not_configured' }, 503);

  const body = await readBody(request);
  const couponId = typeof body.couponId === 'string' && UUID.test(body.couponId) ? body.couponId : null;
  if (!couponId) return json<ExecuteResponse>({ ok: false, reason: 'not_found' }, 404);

  const user = await currentUser();
  if (!user) return json<ExecuteResponse>({ ok: false, reason: 'signed_out' }, 401);

  try {
    // Never mark a coupon used when there is no QR to show for its discount.
    const current = await couponForUser(user.id);
    if (!current || current.id !== couponId) return json<ExecuteResponse>({ ok: false, reason: 'not_found' }, 404);
    if (!storeQrValue(current.reward_percent)) return json<ExecuteResponse>({ ok: false, reason: 'qr_not_configured' }, 503);

    const result = await executeQr(couponId, user.id, await anonId());
    const serverNow = new Date(result.dbNowMs).toISOString();
    if (!result.ok) {
      return json<ExecuteResponse>(
        { ok: false, reason: result.reason, coupon: result.row ? toView(result.row, result.dbNowMs) : undefined, serverNow },
        result.reason === 'not_found' ? 404 : 409
      );
    }
    const coupon = toView(result.row, result.dbNowMs);
    return json<ExecuteResponse>({
      ok: true,
      coupon,
      // Read after the write, so it matches the reward the coupon was actually opened with.
      qrValue: coupon.status === 'showing' ? storeQrValue(result.row.reward_percent) : null,
      serverNow,
    });
  } catch {
    return json<ExecuteResponse>({ ok: false, reason: 'server' }, 500);
  }
}
