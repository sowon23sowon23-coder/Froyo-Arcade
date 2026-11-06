import { isAdmin, overview } from '@/rewards/server/admin';
import { json } from '@/rewards/server/http';
import { readRange } from './range';

export async function GET(request: Request) {
  if (!(await isAdmin())) return json({ error: 'unauthorized' }, 401);
  try {
    return json(await overview(readRange(new URL(request.url))));
  } catch {
    return json({ error: 'server' }, 500);
  }
}
