import 'server-only';
import type { GameSlug } from '@/games/registry';
import { PROMOTION, rewardFor } from '../config';
import type { CouponView } from '../types';
import { logEvent } from './events';
import { admin } from './supabase';

export type CouponRow = {
  id: string;
  code: string;
  reward_title: string | null;
  reward_percent: number | null;
  source_game: GameSlug;
  issued_at: string;
  valid_from: string | null;
  expires_at: string | null;
  qr_executed_at: string | null;
};

const COLUMNS = 'id, code, reward_title, reward_percent, source_game, issued_at, valid_from, expires_at, qr_executed_at';
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
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

/** When a coupon issued now can be used: after the waiting period, for validDays. */
function usablePeriod(issuedAt: Date): { validFrom: string; expiresAt: string } {
  const from = issuedAt.getTime() + PROMOTION.activationHours * HOUR_MS;
  const byDays = from + PROMOTION.validDays * DAY_MS;
  const hardEnd = PROMOTION.endsAt ? Date.parse(PROMOTION.endsAt) : Infinity;
  return { validFrom: new Date(from).toISOString(), expiresAt: new Date(Math.min(byDays, hardEnd)).toISOString() };
}

/** Status is derived from stored times and the server clock, never stored itself. */
export function toView(row: CouponRow, nowMs: number): CouponView {
  const displayMs = PROMOTION.qrDisplaySeconds * 1000;
  const executedMs = row.qr_executed_at ? Date.parse(row.qr_executed_at) : null;
  const showUntil = executedMs !== null ? new Date(executedMs + displayMs).toISOString() : null;

  let status: CouponView['status'];
  if (executedMs !== null) status = nowMs < executedMs + displayMs ? 'showing' : 'shown';
  else if (row.expires_at && nowMs >= Date.parse(row.expires_at)) status = 'expired';
  else if (row.valid_from && nowMs < Date.parse(row.valid_from)) status = 'waiting';
  else status = 'available';

  return {
    id: row.id,
    code: row.code,
    rewardTitle: row.reward_title ?? PROMOTION.reward.title,
    percentOff: row.reward_percent ?? 0,
    sourceGame: row.source_game,
    issuedAt: row.issued_at,
    validFrom: row.valid_from,
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

/** The account's finished coupons from every promotion, newest first. */
export async function couponHistory(userId: string, nowMs: number): Promise<CouponView[]> {
  const { data, error } = await admin()
    .from('coupons')
    .select(COLUMNS)
    .eq('user_id', userId)
    .order('issued_at', { ascending: false });
  if (error) throw error;
  return (data as CouponRow[])
    .map((row) => toView(row, nowMs))
    .filter((coupon) => coupon.status === 'shown' || coupon.status === 'expired');
}

export type ClaimResult =
  | { ok: true; row: CouponRow; newlyIssued: boolean; upgraded: boolean }
  | { ok: false; reason: 'claim_not_found' | 'claim_expired' };

/**
 * Exchanges an achieved mission for this promotion's coupon. An account has at
 * most one coupon per promotion (unique constraint). A better result upgrades
 * that coupon until its QR is opened; it never issues a second one.
 */
export async function redeemClaim(claimId: string, userId: string, anon: string): Promise<ClaimResult> {
  const db = admin();
  const { data: claim, error } = await db
    .from('mission_claims')
    .select('id, promotion_id, anon_id, user_id, game, result, achieved_at, redeemed_at')
    .eq('id', claimId)
    .maybeSingle();
  if (error) throw error;

  // Only the browser that played it, or the account it was already linked to, can use a claim.
  const owns = claim && (claim.user_id ? claim.user_id === userId : claim.anon_id === anon);
  if (!claim || claim.promotion_id !== PROMOTION.id || !owns) return { ok: false, reason: 'claim_not_found' };

  const usable = !claim.redeemed_at && Date.now() - Date.parse(claim.achieved_at) <= CLAIM_TTL_MS;
  // From the server's saved result, never from anything the browser sends now.
  const reward = rewardFor(claim.game as GameSlug, (claim.result ?? {}) as { score?: unknown; level?: unknown });
  const markRedeemed = () =>
    db.from('mission_claims').update({ user_id: userId, redeemed_at: new Date().toISOString() }).eq('id', claim.id);

  const existing = await couponForUser(userId);
  if (existing) {
    let upgraded = false;
    if (usable && reward.percentOff > (existing.reward_percent ?? 0)) {
      const { data, error: upgradeError } = await db.rpc('upgrade_coupon', {
        p_coupon_id: existing.id,
        p_user_id: userId,
        p_title: reward.title,
        p_percent: reward.percentOff,
        p_game: claim.game,
        p_claim_id: claim.id,
      });
      if (upgradeError) throw upgradeError;
      upgraded = data === true;
    }
    if (!claim.redeemed_at) await markRedeemed();
    if (!upgraded) return { ok: true, row: existing, newlyIssued: false, upgraded: false };

    logEvent({
      type: 'coupon_upgraded',
      game: claim.game,
      userId,
      anonId: anon,
      meta: { couponId: existing.id, from: existing.reward_percent ?? 0, to: reward.percentOff },
    });
    const row = await couponForUser(userId);
    if (!row) throw new Error('Coupon disappeared during upgrade');
    return { ok: true, row, newlyIssued: false, upgraded: true };
  }

  if (!usable) return { ok: false, reason: 'claim_expired' };

  const issuedAt = new Date();
  const period = usablePeriod(issuedAt);
  const { data: inserted, error: insertError } = await db
    .from('coupons')
    .upsert(
      {
        user_id: userId,
        promotion_id: PROMOTION.id,
        code: newCode(),
        reward_title: reward.title,
        reward_percent: reward.percentOff || null,
        source_game: claim.game,
        mission_claim_id: claim.id,
        issued_at: issuedAt.toISOString(),
        valid_from: period.validFrom,
        expires_at: period.expiresAt,
      },
      { onConflict: 'user_id,promotion_id', ignoreDuplicates: true }
    )
    .select(COLUMNS);
  if (insertError) throw insertError;

  await markRedeemed();

  const row = (inserted?.[0] as CouponRow | undefined) ?? null;
  if (row) {
    logEvent({ type: 'coupon_issued', game: claim.game, userId, anonId: anon, meta: { couponId: row.id, percentOff: reward.percentOff } });
    return { ok: true, row, newlyIssued: true, upgraded: false };
  }

  // Lost a race with another claim for the same account: return the coupon that won.
  const winner = await couponForUser(userId);
  if (!winner) throw new Error('Coupon insert conflicted but no coupon was found');
  return { ok: true, row: winner, newlyIssued: false, upgraded: false };
}

export type ExecuteResult =
  | { ok: true; row: CouponRow; newlyExecuted: boolean; dbNowMs: number }
  | { ok: false; reason: 'not_found' | 'not_yet' | 'expired'; row?: CouponRow; dbNowMs: number };

/** Opens the in-store QR once, on the database clock (see execute_coupon_qr in the migrations). */
export async function executeQr(couponId: string, userId: string, anon: string): Promise<ExecuteResult> {
  const db = admin();
  const { data, error } = await db.rpc('execute_coupon_qr', { p_coupon_id: couponId, p_user_id: userId });
  if (error) throw error;

  const result = (data as { qr_executed_at: string | null; newly_executed: boolean; db_now: string }[] | null)?.[0];
  const dbNowMs = result ? Date.parse(result.db_now) : Date.now();
  if (!result) return { ok: false, reason: 'not_found', dbNowMs };

  const row = await couponForUser(userId);
  if (!row || row.id !== couponId) return { ok: false, reason: 'not_found', dbNowMs };

  // Nothing was written, and it was never opened before: it's outside its usable period.
  if (!result.qr_executed_at) {
    const early = row.valid_from !== null && dbNowMs < Date.parse(row.valid_from);
    return { ok: false, reason: early ? 'not_yet' : 'expired', row, dbNowMs };
  }

  if (result.newly_executed) {
    logEvent({
      type: 'qr_execute',
      game: row.source_game,
      userId,
      anonId: anon,
      meta: { couponId: row.id, percentOff: row.reward_percent ?? 0 },
    });
  }
  return { ok: true, row, newlyExecuted: result.newly_executed, dbNowMs };
}
