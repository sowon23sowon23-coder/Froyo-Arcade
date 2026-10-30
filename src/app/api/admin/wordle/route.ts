import { getPlayDate } from '@/games/wordle/server/game';
import { answersFrom } from '@/games/wordle/server/schedule';
import { isAdmin } from '@/rewards/server/admin';
import { json } from '@/rewards/server/http';

/** Today's answer and the next six days. Fetched only when an admin asks to see them. */
export async function GET() {
  if (!(await isAdmin())) return json({ error: 'unauthorized' }, 401);
  return json({ answers: answersFrom(getPlayDate(), 7) });
}
