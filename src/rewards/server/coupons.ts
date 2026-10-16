import 'server-only';
import type { GameSlug } from '@/games/registry';
import { PROMOTION } from '../config';
import type { CouponView } from '../types';
import { logEvent } from './events';
import { admin } from './supabase';

type CouponRow = {
  id: string;
  code: string;
  source_game: GameSlug;
  issued_at: string;
  expires_at: string | null;
  qr_executed_at: string | null;
};

const COLUMNS = 'id, code, source_game, issued_at, expires_at, qr_executed_at';
const DAY_MS = 24 * 60 * 60 * 1000;
/** A mission has to be exchanged for a coupon within a day. */
const CLAIM_TTL_MS = DAY_MS;
// No 0/O/1/I, so staff can read it aloud.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  let code = '';
  for (const b of bytes) code += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

function expiryFor(issuedAt: Date): string | null {
  const byDays = PROMOTION.validDays > 0 ? issuedAt.getTime() + PROMOTION.validDays * DAY_MS : Infinity;
  const hardEnd = PROMOTION.endsAt ? Date.parse(PROMOTION.endsAt) : Infinity;
  const end = Math.min(byDays, hardEnd);
  return Number.isFinite(end) ? new Date(end).toISOString() : null;
}

/** Status is derived from stored times and the server clock, never stored itself. */
export function toView(row: CouponRow, nowMs: number): CouponView {
  const displayMs = PROMOTION.qrDisplaySeconds * 1000;
  const executedMs = row.qr_executed_at ? Date.parse(row.qr_executed_at) : null;
  const showUntil = executedMs !== null ? new Date(executedMs + displayMs).toISOString() : null;

  let status: CouponView['status'];
  if (executedMs !== null) status = nowMs < executedMs + displayMs ? 'showing' : 'shown';
  else if (row.expires_at && nowMs >= Date.parse(row.expires_at)) status = 'expired';
  else status = 'available';

  return {
    id: row.id,
    code: row.code,
    sourceGame: row.source_game,
    issuedAt: row.issued_at,
    expiresAt: row.expires_at,
    qrExecutedAt: row.qr_executed_at,
    showUntil,
    status,
  };
}

export async function couponForUser(userId: string): Promise<CouponRow | null> {
  const { data, error } = await admin()
    .from('coupons')
    .select(COLUMNS)
    .eq('user_id', userId)
    .eq('promotion_id', PROMOTION.id)
    .maybeSingle();
  if (error) throw error;
  return (data as CouponRow | null) ?? null;
}

export type ClaimResult =
  | { ok: true; row: CouponRow; newlyIssued: boolean }
  | { ok: false; reason: 'claim_not_found' | 'claim_expired' };

/**
 * Exchanges an achieved mission for this promotion's coupon. An account gets
 * at most one coupon per promotion (unique constraint), whichever game earned
 * it and whatever state the earlier coupon is in.
 */
export async function redeemClaim(claimId: string, userId: string, anon: string): Promise<ClaimResult> {
  const db = admin();
  const { data: claim, error } = await db
    .from('mission_claims')
    .select('id, promotion_id, anon_id, user_id, game, achieved_at, redeemed_at')
    .eq('id', claimId)
    .maybeSingle();
  if (error) throw error;

  // Only the browser that played it, or the account it was already linked to, can use a claim.
  const owns = claim && (claim.user_id ? claim.user_id === userId : claim.anon_id === anon);
  if (!claim || claim.promotion_id !== PROMOTION.id || !owns) return { ok: false, reason: 'claim_not_found' };

  const existing = await couponForUser(userId);
  if (existing) {
    if (!claim.redeemed_at) {
      await db.from('mission_claims').update({ user_id: userId, redeemed_at: new Date().toISOString() }).eq('id', claim.id);
    }
    return { ok: true, row: existing, newlyIssued: false };
  }

  if (claim.redeemed_at || Date.now() - Date.parse(claim.achieved_at) > CLAIM_TTL_MS) {
    return { ok: false, reason: 'claim_expired' };
  }

  const issuedAt = new Date();
  const { data: inserted, error: insertError } = await db
    .from('coupons')
    .upsert(
      {
        user_id: userId,
        promotion_id: PROMOTION.id,
        code: newCode(),
        source_game: claim.game,
        mission_claim_id: claim.id,
        issued_at: issuedAt.toISOString(),
        expires_at: expiryFor(issuedAt),
      },
      { onConflict: 'user_id,promotion_id', ignoreDuplicates: true }
    )
    .select(COLUMNS);
  if (insertError) throw insertError;

  await db.from('mission_claims').update({ user_id: userId, redeemed_at: issuedAt.toISOString() }).eq('id', claim.id);

  const row = (inserted?.[0] as CouponRow | undefined) ?? null;
  if (row) {
    logEvent({ type: 'coupon_issued', game: claim.game, userId, anonId: anon, meta: { couponId: row.id } });
    return { ok: true, row, newlyIssued: true };
  }

  // Lost a race with another claim for the same account: return the coupon that won.
  const winner = await couponForUser(userId);
  if (!winner) throw new Error('Coupon insert conflicted but no coupon was found');
  return { ok: true, row: winner, newlyIssued: false };
}

export type ExecuteResult =
  | { ok: true; row: CouponRow; newlyExecuted: boolean; dbNowMs: number }
  | { ok: false; reason: 'not_found' | 'expired'; row?: CouponRow; dbNowMs: number };

/** Opens the in-store QR once, on the database clock (see execute_coupon_qr in the migration). */
export async function executeQr(couponId: string, userId: string, anon: string): Promise<ExecuteResult> {
  const db = admin();
  const { data, error } = await db.rpc('execute_coupon_qr', { p_coupon_id: couponId, p_user_id: userId });
  if (error) throw error;

  const result = (data as { qr_executed_at: string | null; newly_executed: boolean; db_now: string }[] | null)?.[0];
  const dbNowMs = result ? Date.parse(result.db_now) : Date.now();
  if (!result) return { ok: false, reason: 'not_found', dbNowMs };

  const row = await couponForUser(userId);
  if (!row || row.id !== couponId) return { ok: false, reason: 'not_found', dbNowMs };

  // Not executed now and never before: the only reason is that it had expired.
  if (!result.qr_executed_at) return { ok: false, reason: 'expired', row, dbNowMs };

  if (result.newly_executed) {
    logEvent({ type: 'qr_execute', game: row.source_game, userId, anonId: anon, meta: { couponId: row.id } });
  }
  return { ok: true, row, newlyExecuted: result.newly_executed, dbNowMs };
}
