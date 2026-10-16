import type { GameSlug } from '@/games/registry';
import type { ClaimResponse, ClientEvent, ExecuteResponse, MissionOutcome, RewardsMe } from '../types';

async function post<T>(url: string, body: unknown): Promise<T | null> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    return ((await res.json().catch(() => null)) as T | null) ?? null;
  } catch {
    return null;
  }
}

export async function fetchMe(): Promise<RewardsMe | null> {
  try {
    const res = await fetch('/api/rewards/me', { cache: 'no-store' });
    // A failed lookup must not look like "no reward yet".
    if (!res.ok) return null;
    return ((await res.json()) as RewardsMe) ?? null;
  } catch {
    return null;
  }
}

/** Returns null when rewards are off or the server can't be reached; the game plays on either way. */
export async function startPlay(game: GameSlug): Promise<string | null> {
  const res = await post<{ ok: boolean; sessionId?: string | null }>('/api/play/start', { game });
  return res?.ok && res.sessionId ? res.sessionId : null;
}

export async function finishPlay(sessionId: string, result: { score?: number; level?: number }): Promise<MissionOutcome> {
  return (await post<MissionOutcome>('/api/play/finish', { sessionId, result })) ?? { state: 'error' };
}

export async function claimReward(claimId: string): Promise<ClaimResponse> {
  return (await post<ClaimResponse>('/api/rewards/claim', { claimId })) ?? { ok: false, reason: 'server' };
}

export async function executeQr(couponId: string): Promise<ExecuteResponse | null> {
  return post<ExecuteResponse>('/api/rewards/execute', { couponId });
}

export function track(type: ClientEvent, extra: { game?: GameSlug; store?: string } = {}): void {
  void post('/api/events', { type, ...extra });
}
