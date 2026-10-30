import 'server-only';
import { after } from 'next/server';
import { PROMOTION } from '../config';
import { admin, rewardsConfigured } from './supabase';

export type EventType =
  | 'game_start'
  | 'game_complete'
  | 'mission_achieved'
  | 'coupon_issued'
  | 'coupon_upgraded'
  | 'qr_execute'
  | 'store_click'
  | 'rewards_view'
  | 'claim_view'
  | 'sign_in_view'
  | 'use_in_store_open';

export type EventInput = {
  type: EventType;
  game?: string | null;
  anonId?: string | null;
  userId?: string | null;
  meta?: Record<string, unknown>;
};

/** Records a funnel event after the response is sent. Logging never fails a request. */
export function logEvent(event: EventInput): void {
  if (!rewardsConfigured()) return;
  after(async () => {
    try {
      await admin()
        .from('events')
        .insert({
          type: event.type,
          game: event.game ?? null,
          anon_id: event.anonId ?? null,
          user_id: event.userId ?? null,
          promotion_id: PROMOTION.id,
          meta: event.meta ?? {},
        });
    } catch {
      // Analytics only.
    }
  });
}
