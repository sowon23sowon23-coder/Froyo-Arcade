import type { GameSlug } from '@/games/registry';

/**
 * The last mission this browser achieved but hasn't exchanged yet, so the home
 * page can offer it again if the player left the result screen. The claim
 * itself lives on the server; this is only a pointer to it.
 */
const KEY = 'froyo-arcade:pending-claim';
const TTL_MS = 24 * 60 * 60 * 1000;

export type PendingClaim = { claimId: string; game: GameSlug; at: number };

export function savePendingClaim(claimId: string, game: GameSlug): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ claimId, game, at: Date.now() } satisfies PendingClaim));
  } catch {
    // Storage blocked: the result screen's claim button still works.
  }
}

export function readPendingClaim(): PendingClaim | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as PendingClaim | null;
    if (!v || typeof v.claimId !== 'string' || Date.now() - v.at > TTL_MS) return null;
    return v;
  } catch {
    return null;
  }
}

export function clearPendingClaim(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

export function claimHref(claimId: string): string {
  return `/rewards/claim?c=${encodeURIComponent(claimId)}`;
}
