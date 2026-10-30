import { isAdmin, searchCoupons } from '@/rewards/server/admin';
import { json } from '@/rewards/server/http';

export async function GET(request: Request) {
  if (!(await isAdmin())) return json({ error: 'unauthorized' }, 401);
  const q = new URL(request.url).searchParams.get('q') ?? '';
  try {
    return json({ coupons: await searchCoupons(q.slice(0, 120)) });
  } catch {
    return json({ error: 'server' }, 500);
  }
}
