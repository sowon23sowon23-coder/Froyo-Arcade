import { isAdmin, overview } from '@/rewards/server/admin';
import type { DateRange } from '@/rewards/server/adminStats';
import { json } from '@/rewards/server/http';

function validDay(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  // Rejects dates that roll over, such as 2026-02-31.
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null;
}

/** Both days, or no period at all. Swapped days are put in order. */
function readRange(url: URL): DateRange | null {
  const from = validDay(url.searchParams.get('from'));
  const to = validDay(url.searchParams.get('to'));
  if (!from || !to) return null;
  return from <= to ? { from, to } : { from: to, to: from };
}

export async function GET(request: Request) {
  if (!(await isAdmin())) return json({ error: 'unauthorized' }, 401);
  try {
    return json(await overview(readRange(new URL(request.url))));
  } catch {
    return json({ error: 'server' }, 500);
  }
}
