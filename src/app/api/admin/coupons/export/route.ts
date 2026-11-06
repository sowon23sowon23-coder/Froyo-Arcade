import { getGame, type GameSlug } from '@/games/registry';
import { csvName, csvTime, toCsv } from '@/rewards/csv';
import { exportCoupons, isAdmin } from '@/rewards/server/admin';
import { json } from '@/rewards/server/http';
import type { CouponStatus } from '@/rewards/types';
import { readRange } from '../../overview/range';

const STATUS: Record<CouponStatus, string> = {
  waiting: '사용 전',
  available: '사용 가능',
  showing: 'QR 표시 중',
  shown: 'QR 실행됨',
  expired: '소멸',
};

/** Every coupon in the period (by issue date) as a CSV file, with emails. Admins only. */
export async function GET(request: Request) {
  if (!(await isAdmin())) return json({ error: 'unauthorized' }, 401);
  const range = readRange(new URL(request.url));
  try {
    const coupons = await exportCoupons(range);
    const csv = toCsv(
      ['이메일', '쿠폰 코드', '혜택', '할인율(%)', '상태', '획득 게임', '발급', '사용 시작', '만료', 'QR 실행'],
      coupons.map((c) => [
        c.email,
        c.code,
        c.rewardTitle,
        c.percentOff || '',
        STATUS[c.status],
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
