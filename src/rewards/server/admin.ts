import 'server-only';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import type { CouponView } from '../types';
import { buildOverview, type AdminOverview, type StatClaim, type StatEvent, type StatUser } from './adminStats';
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

/** Every row of a table: PostgREST returns at most 1000 at a time. */
async function allRows<T>(table: string, columns: string, orderBy: string): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin()
      .from(table)
      .select(columns)
      .order(orderBy, { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) return rows;
  }
}

async function allUsers(): Promise<StatUser[]> {
  const users: StatUser[] = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin().auth.admin.listUsers({ page, perPage: PAGE });
    if (error) throw error;
    for (const user of data.users) {
      users.push({
        id: user.id,
        email: user.email ?? '',
        provider: String(user.app_metadata?.provider ?? 'email'),
        created_at: user.created_at,
        last_sign_in_at: user.last_sign_in_at ?? null,
      });
    }
    if (data.users.length < PAGE) return users;
  }
}

/** Funnel events only: screen views and failed admin sign-ins aren't part of these numbers. */
const STAT_EVENTS = ['game_start', 'game_complete', 'mission_achieved', 'coupon_issued', 'coupon_upgraded', 'qr_execute', 'store_click'];

export async function overview(): Promise<AdminOverview> {
  const now = Date.now();
  const [events, users, claims, coupons] = await Promise.all([
    allRows<StatEvent>('events', 'type, game, anon_id, user_id, meta, created_at', 'id'),
    allUsers(),
    allRows<StatClaim>('mission_claims', 'anon_id, user_id', 'achieved_at'),
    allRows<CouponRow & { user_id: string }>('coupons', `${COUPON_COLUMNS}, user_id`, 'issued_at'),
  ]);
  return buildOverview({
    // A browser's page views still tie it to an account, so they stay for linking only.
    events: events.map((e) => (STAT_EVENTS.includes(e.type) ? e : { ...e, type: 'link_only' })),
    users,
    claims,
    coupons: coupons.map((row) => ({ ...toView(row, now), userId: row.user_id })),
    nowMs: now,
  });
}

async function emailsById(): Promise<Map<string, string>> {
  return new Map((await allUsers()).map((user) => [user.id, user.email]));
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
