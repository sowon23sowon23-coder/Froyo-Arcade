import 'server-only';
import { cookies } from 'next/headers';

const COOKIE = 'fa_anon';
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * A random id for this browser, so a mission played before sign-in can be
 * matched to the account afterwards and events can be joined into a funnel.
 * Route handlers only (it may set a cookie).
 */
export async function anonId(): Promise<string> {
  const store = await cookies();
  const existing = store.get(COOKIE)?.value;
  if (existing && UUID.test(existing)) return existing;

  const id = crypto.randomUUID();
  store.set(COOKIE, id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: ONE_YEAR_SECONDS,
  });
  return id;
}
