import 'server-only';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import type { CouponStatus, CouponView } from '../types';
import { COUPON_COLUMNS, toView, type CouponRow } from './coupons';
import { admin, rewardsConfigured } from './supabase';

// Read-only admin. One shared password, set in ADMIN_PASSWORD; without it the
// admin stays closed. The password never appears in the code or the browser:
// signing in sets a signed httpOnly cookie that every admin API checks.

const COOKIE = 'fa_admin';
const SESSION_SECONDS = 12 * 60 * 60;
const MAX_FAILURES = 10;
const LOCK_WINDOW_MS = 15 * 60 * 1000;
const FAILED_EVENT = 'admin_login_failed';
const PAGE = 1000;

function password(): string {
  return process.env.ADMIN_PASSWORD?.trim() ?? '';
}

export function adminConfigured(): boolean {
  return Boolean(password()) && rewardsConfigured();
}

const sha = (value: string) => createHash('sha256').update(value).digest();

function passwordMatches(attempt: string): boolean {
  return timingSafeEqual(sha(attempt), sha(password()));
}

// Keyed by the password too, so changing the password signs everyone out.
function signature(expires: number): string {
  const key = `${password()}:${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''}`;
  return createHmac('sha256', key).update(`admin:${expires}`).digest('hex');
}

export async function isAdmin(): Promise<boolean> {
  if (!adminConfigured()) return false;
  const [expires, sig] = ((await cookies()).get(COOKIE)?.value ?? '').split('.');
  const when = Number(expires);
  if (!sig || !Number.isFinite(when) || when < Date.now()) return false;
  return timingSafeEqual(sha(sig), sha(signature(when)));
}

export type LoginResult = 'ok' | 'wrong' | 'locked' | 'closed';

/** Too many wrong passwords in a row, from anyone, closes sign-in for a while. */
export async function signIn(attempt: string): Promise<LoginResult> {
  if (!adminConfigured()) return 'closed';
  const db = admin();

  const since = new Date(Date.now() - LOCK_WINDOW_MS).toISOString();
  const { count, error } = await db
    .from('events')
    .select('id', { count: 'exact', head: true })
    .eq('type', FAILED_EVENT)
    .gte('created_at', since);
  if (error) throw error;
  if ((count ?? 0) >= MAX_FAILURES) return 'locked';

  if (!passwordMatches(attempt)) {
    await db.from('events').insert({ type: FAILED_EVENT });
    return 'wrong';
  }

  const expires = Date.now() + SESSION_SECONDS * 1000;
  (await cookies()).set(COOKIE, `${expires}.${signature(expires)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: SESSION_SECONDS,
  });
  return 'ok';
}

export async function signOut(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

/** Every matching row: PostgREST returns at most 1000 at a time. */
async function allCoupons(): Promise<CouponRow[]> {
  const rows: CouponRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin()
      .from('coupons')
      .select(COUPON_COLUMNS)
      .order('issued_at', { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data as CouponRow[]));
    if (!data || data.length < PAGE) return rows;
  }
}

export type FunnelRow = {
  game: string;
  game_starts: number;
  game_completes: number;
  missions_achieved: number;
  coupons_issued: number;
  store_clicks: number;
  qr_executions: number;
};

export type AdminOverview = {
  funnel: FunnelRow[];
  couponTotal: number;
  byStatus: Record<CouponStatus, number>;
  byPercent: { percentOff: number; count: number }[];
  upgrades: number;
  generatedAt: string;
};

export async function overview(): Promise<AdminOverview> {
  const db = admin();
  const now = Date.now();
  const [funnel, coupons, upgrades] = await Promise.all([
    db.from('reward_funnel_by_game').select('*').not('game', 'is', null).order('game'),
    allCoupons(),
    db.from('events').select('id', { count: 'exact', head: true }).eq('type', 'coupon_upgraded'),
  ]);
  if (funnel.error) throw funnel.error;
  if (upgrades.error) throw upgrades.error;

  const byStatus: Record<CouponStatus, number> = { waiting: 0, available: 0, showing: 0, shown: 0, expired: 0 };
  const percents = new Map<number, number>();
  for (const row of coupons) {
    const view = toView(row, now);
    byStatus[view.status] += 1;
    percents.set(view.percentOff, (percents.get(view.percentOff) ?? 0) + 1);
  }

  return {
    funnel: (funnel.data ?? []) as FunnelRow[],
    couponTotal: coupons.length,
    byStatus,
    byPercent: [...percents].map(([percentOff, count]) => ({ percentOff, count })).sort((a, b) => a.percentOff - b.percentOff),
    upgrades: upgrades.count ?? 0,
    generatedAt: new Date(now).toISOString(),
  };
}

async function emailsById(): Promise<Map<string, string>> {
  const emails = new Map<string, string>();
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin().auth.admin.listUsers({ page, perPage: PAGE });
    if (error) throw error;
    for (const user of data.users) emails.set(user.id, user.email ?? '');
    if (data.users.length < PAGE) return emails;
  }
}

export type AdminCoupon = CouponView & { email: string };

const RESULT_LIMIT = 50;

/** Finds coupons by part of an email or a coupon code. An empty search lists the newest. */
export async function searchCoupons(query: string): Promise<AdminCoupon[]> {
  const db = admin();
  const now = Date.now();
  const emails = await emailsById();
  const q = query.trim().toLowerCase();
  const columns = `${COUPON_COLUMNS}, user_id`;
  type Row = CouponRow & { user_id: string };
  let rows: Row[] = [];

  if (!q) {
    const { data, error } = await db.from('coupons').select(columns).order('issued_at', { ascending: false }).limit(20);
    if (error) throw error;
    rows = data as unknown as Row[];
  } else {
    const ids = [...emails].filter(([, email]) => email.toLowerCase().includes(q)).map(([id]) => id).slice(0, RESULT_LIMIT);
    if (ids.length > 0) {
      const { data, error } = await db.from('coupons').select(columns).in('user_id', ids).limit(RESULT_LIMIT);
      if (error) throw error;
      rows = data as unknown as Row[];
    }
    // Codes only use letters, digits and a dash, so nothing else can reach the filter.
    const code = q.replace(/[^a-z0-9-]/g, '');
    if (code && code === q) {
      const { data, error } = await db.from('coupons').select(columns).ilike('code', `%${code}%`).limit(RESULT_LIMIT);
      if (error) throw error;
      const seen = new Set(rows.map((row) => row.id));
      rows.push(...(data as unknown as Row[]).filter((row) => !seen.has(row.id)));
    }
  }

  return rows
    .sort((a, b) => b.issued_at.localeCompare(a.issued_at))
    .slice(0, RESULT_LIMIT)
    .map((row) => ({ ...toView(row, now), email: emails.get(row.user_id) ?? '' }));
}
