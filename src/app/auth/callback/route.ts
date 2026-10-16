import { NextResponse } from 'next/server';
import { authClient, rewardsConfigured } from '@/rewards/server/supabase';

/** Google sign-in lands here; the session cookie is set and the player goes back where they were. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const nextParam = url.searchParams.get('next') ?? '/rewards';
  // Same-site paths only, so this can't be used as an open redirect.
  const next = nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/rewards';

  if (code && rewardsConfigured()) {
    const { error } = await (await authClient()).auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }

  const back = new URL(next, url.origin);
  back.searchParams.set('signin', 'failed');
  return NextResponse.redirect(back);
}
