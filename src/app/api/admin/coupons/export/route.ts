import { getGame, type GameSlug } from '@/games/registry';
import { csvName, csvTime, toCsv } from '@/rewards/csv';
import { exportCoupons, isAdmin } from '@/rewards/server/admin';
import { json } from '@/rewards/server/http';
import { ADMIN_TEXT } from '@/rewards/ui/adminText';
import { readRange } from '../../overview/range';

/** Every coupon in the period (by issue date) as a CSV file, with emails. Admins only. ?lang=en for English titles. */
export async function GET(request: Request) {
  if (!(await isAdmin())) return json({ error: 'unauthorized' }, 401);
  const url = new URL(request.url);
  const range = readRange(url);
  const t = ADMIN_TEXT[url.searchParams.get('lang') === 'en' ? 'en' : 'ko'];
  try {
    const coupons = await exportCoupons(range);
    const csv = toCsv(
      t.csv.couponHead,
      coupons.map((c) => [
        c.email,
        c.code,
        c.rewardTitle,
        c.percentOff || '',
        t.statusShort[c.status],
        getGame(c.sourceGame as GameSlug).title,
        csvTime(c.issuedAt),
        csvTime(c.validFrom),
        csvTime(c.expiresAt),
        csvTime(c.qrExecutedAt),
      ])
    );
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${csvName('coupons', range)}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return json({ error: 'server' }, 500);
  }
}
