import { getGame, type GameSlug } from '@/games/registry';
import { PROMOTION } from './config';
import type { CouponView } from './types';

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    timeZone: PROMOTION.timeZone,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    timeZone: PROMOTION.timeZone,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

export function gameTitle(slug: GameSlug): string {
  return getGame(slug).title;
}

/** A better result can still raise this coupon. Mirrors the rule in upgrade_coupon. */
export function canUpgrade(coupon: CouponView): boolean {
  return coupon.status === 'waiting' || coupon.status === 'available';
}

export const STATUS_LABEL: Record<CouponView['status'], string> = {
  waiting: 'Starts soon',
  available: 'Ready to use',
  showing: 'QR showing',
  // Says the QR was used, not that a discount was applied: the POS doesn't report back.
  shown: 'QR used',
  expired: 'Expired',
};
