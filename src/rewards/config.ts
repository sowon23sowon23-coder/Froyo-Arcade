import type { GameSlug } from '@/games/registry';

/**
 * Everything about the promotion that the business decides. None of these
 * values are final yet: while `draft` is true every screen that shows them
 * carries a "Sample terms" label, so placeholder numbers never read as a
 * confirmed offer. Flip `draft` to false only once each value is signed off.
 *
 * Safe to import in the browser. The in-store QR value is NOT here: it lives
 * in the server-only STORE_QR_VALUE environment variable.
 */

export type Store = {
  name: string;
  address: string;
  /** Optional; when missing, directions open a Google Maps search for the address. */
  mapsUrl?: string;
  hours?: string;
};

export type Missions = {
  /** Reach this score in one run. */
  catch: { score: number } | null;
  /** Clear this level (or any later one). */
  crush: { level: number } | null;
  /** Solve the word within this many tries. */
  wordle: { maxAttempts: number } | null;
  /** Reach this score in one 30-second round. */
  slice: { score: number } | null;
};

const QR_DISPLAY_SECONDS = 10;

export const PROMOTION = {
  /** Changing the id starts a new promotion: every account can earn one coupon per id. */
  id: 'froyo-arcade-launch',
  draft: true,

  reward: {
    /** Headline on the coupon. Sample wording until the offer is decided. */
    title: '$1 off any froyo',
    terms: [
      'One reward per account for this promotion.',
      `Show the in-store QR at the register. It stays on screen for ${QR_DISPLAY_SECONDS} seconds and opens only once.`,
      'Valid at participating stores only. Cannot be combined with other offers.',
    ],
  },

  /** Days a coupon stays valid after it is issued. */
  validDays: 14,
  /** Optional hard end for every coupon (ISO 8601 with offset), e.g. '2026-12-31T23:59:59-08:00'. */
  endsAt: null as string | null,
  /** Dates are shown in the stores' time zone. */
  timeZone: 'America/Los_Angeles',

  /** How long the QR stays on screen once opened. */
  qrDisplaySeconds: QR_DISPLAY_SECONDS,

  /** Set a game to null to leave it out of the promotion. */
  missions: {
    catch: { score: 50 },
    crush: { level: 3 },
    wordle: { maxAttempts: 6 },
    slice: { score: 300 },
  } satisfies Missions as Missions,

  /** Participating stores. Empty until the list is confirmed. */
  stores: [] as Store[],

  /** Players must confirm this age before signing in (COPPA). */
  minAge: 13,
  termsUrl: null as string | null,
  privacyUrl: null as string | null,
} as const;

export function missionText(game: GameSlug): string | null {
  const m = PROMOTION.missions;
  switch (game) {
    case 'catch':
      return m.catch ? `Score ${m.catch.score} points in one run.` : null;
    case 'crush':
      return m.crush ? `Clear Level ${m.crush.level}.` : null;
    case 'wordle':
      return m.wordle ? `Solve the word in ${m.wordle.maxAttempts} tries or fewer.` : null;
    case 'slice':
      return m.slice ? `Score ${m.slice.score} points in one 30-second round.` : null;
  }
}

export function directionsUrl(store: Store): string {
  return store.mapsUrl ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(store.address)}`;
}
