import { couponForUser, couponHistory, toView } from '@/rewards/server/coupons';
import { json } from '@/rewards/server/http';
import { currentUser, rewardsConfigured, storeQrValue } from '@/rewards/server/supabase';
import type { RewardsMe } from '@/rewards/types';

/** The signed-in account's coupon state, restored the same way on any device. */
export async function GET() {
  const now = Date.now();
  const base: RewardsMe = {
    configured: rewardsConfigured(),
    qrConfigured: false,
    signedIn: false,
    email: null,
    coupon: null,
    history: [],
    qrValue: null,
    serverNow: new Date(now).toISOString(),
  };
  if (!base.configured) return json(base);

  const user = await currentUser();
  if (!user) return json(base);

  try {
    const [row, history] = await Promise.all([couponForUser(user.id), couponHistory(user.id, now)]);
    const coupon = row ? toView(row, now) : null;
    const qrValue = coupon ? storeQrValue(coupon.percentOff) : null;
    return json<RewardsMe>({
      ...base,
      qrConfigured: Boolean(qrValue),
      signedIn: true,
      email: user.email ?? null,
      coupon,
      history,
      // Reopening the page mid-window shows the rest of the window, never a new one.
      qrValue: coupon?.status === 'showing' ? qrValue : null,
    });
  } catch {
    return json({ ...base, signedIn: true, email: user.email ?? null }, 500);
  }
}
