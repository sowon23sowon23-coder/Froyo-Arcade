import { isAdmin, overview } from '@/rewards/server/admin';
import { json } from '@/rewards/server/http';

export async function GET() {
  if (!(await isAdmin())) return json({ error: 'unauthorized' }, 401);
  try {
    return json(await overview());
  } catch {
    return json({ error: 'server' }, 500);
  }
}
