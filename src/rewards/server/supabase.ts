import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

/** Rewards need all three keys. Without them the arcade runs as before, games only. */
export function rewardsConfigured(): boolean {
  return Boolean(SUPABASE_URL && ANON_KEY && SERVICE_KEY);
}

/**
 * The in-store QR payload for a reward. Each discount has its own fixed QR,
 * because scanning it is what applies that discount at the POS: STORE_QR_VALUE_10
 * for 10% off, and so on. STORE_QR_VALUE is for rewards without a percentage.
 * Server-only: it reaches a browser only while that coupon's QR is showing.
 */
export function storeQrValue(percentOff: number | null | undefined): string | null {
  const name = percentOff ? `STORE_QR_VALUE_${percentOff}` : 'STORE_QR_VALUE';
  return process.env[name]?.trim() || null;
}

/** Supabase client bound to the visitor's auth cookies (route handlers only). */
export async function authClient(): Promise<SupabaseClient> {
  const store = await cookies();
  return createServerClient(SUPABASE_URL, ANON_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        for (const { name, value, options } of list) store.set(name, value, options);
      },
    },
  });
}

/** The signed-in user, verified with Supabase (not just read from the cookie). */
export async function currentUser(): Promise<User | null> {
  if (!rewardsConfigured()) return null;
  try {
    const { data } = await (await authClient()).auth.getUser();
    return data.user ?? null;
  } catch {
    return null;
  }
}

let adminClient: SupabaseClient | null = null;

/** Service-role client. Every rewards table is locked to this key (RLS on, no policies). */
export function admin(): SupabaseClient {
  adminClient ??= createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return adminClient;
}
