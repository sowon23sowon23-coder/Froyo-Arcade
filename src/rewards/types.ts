import type { GameSlug } from '@/games/registry';

/**
 * available: saved, not opened in store yet
 * showing:   the QR is on screen right now (inside the display window)
 * shown:     the QR was opened and its window ended. A use attempt, NOT a
 *            confirmed discount: the POS does not report back.
 * expired:   passed its expiry without being opened
 */
export type CouponStatus = 'available' | 'showing' | 'shown' | 'expired';

export type CouponView = {
  id: string;
  code: string;
  sourceGame: GameSlug;
  issuedAt: string;
  expiresAt: string | null;
  qrExecutedAt: string | null;
  /** End of the display window, when the QR has been opened. */
  showUntil: string | null;
  status: CouponStatus;
};

export type RewardsMe = {
  /** False when the server has no Supabase keys yet; games still work. */
  configured: boolean;
  /** False when STORE_QR_VALUE is not set: coupons can be saved but not opened in store. */
  qrConfigured: boolean;
  signedIn: boolean;
  email: string | null;
  coupon: CouponView | null;
  /** Only present while status is 'showing'. */
  qrValue: string | null;
  /** Server clock, so countdowns don't trust the phone's clock. */
  serverNow: string;
};

export type MissionOutcome =
  | { state: 'off' }
  | { state: 'achieved'; claimId: string }
  | { state: 'missed' }
  | { state: 'error' };

export type ClaimResponse =
  | { ok: true; coupon: CouponView; newlyIssued: boolean }
  | { ok: false; reason: 'not_configured' | 'signed_out' | 'claim_not_found' | 'claim_expired' | 'server' };

export type ExecuteResponse =
  | { ok: true; coupon: CouponView; qrValue: string | null; serverNow: string }
  | {
      ok: false;
      reason: 'not_configured' | 'qr_not_configured' | 'signed_out' | 'not_found' | 'expired' | 'server';
      coupon?: CouponView;
      serverNow?: string;
    };

export const CLIENT_EVENTS = ['store_click', 'rewards_view', 'claim_view', 'sign_in_view', 'use_in_store_open'] as const;
export type ClientEvent = (typeof CLIENT_EVENTS)[number];
