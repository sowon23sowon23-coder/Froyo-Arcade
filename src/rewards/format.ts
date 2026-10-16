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

export const STATUS_LABEL: Record<CouponView['status'], string> = {
  available: 'Ready to use',
  showing: 'QR showing',
  // Not "Used": opening the QR is a use attempt; the POS doesn't confirm the discount.
  shown: 'QR shown',
  expired: 'Expired',
};
