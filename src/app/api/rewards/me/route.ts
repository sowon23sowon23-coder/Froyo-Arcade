import { couponForUser, toView } from '@/rewards/server/coupons';
import { json } from '@/rewards/server/http';
import { currentUser, rewardsConfigured, storeQrValue } from '@/rewards/server/supabase';
import type { RewardsMe } from '@/rewards/types';

/** The signed-in account's coupon state, restored the same way on any device. */
export async function GET() {
  const now = Date.now();
  const base: RewardsMe = {
    configured: rewardsConfigured(),
    qrConfigured: Boolean(storeQrValue()),
    signedIn: false,
    email: null,
    coupon: null,
    qrValue: null,
    serverNow: new Date(now).toISOString(),
  };
  if (!base.configured) return json(base);

  const user = await currentUser();
  if (!user) return json(base);

  try {
    const row = await couponForUser(user.id);
    const coupon = row ? toView(row, now) : null;
    return json<RewardsMe>({
      ...base,
      signedIn: true,
      email: user.email ?? null,
      coupon,
      // Reopening the page mid-window shows the rest of the window, never a new one.
      qrValue: coupon?.status === 'showing' ? storeQrValue() : null,
    });
  } catch {
    return json({ ...base, signedIn: true, email: user.email ?? null }, 500);
  }
}
