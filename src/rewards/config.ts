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
  /** Reach a tier's score in one run. Higher scores earn a bigger discount. List tiers lowest first. */
  catch: { tiers: { score: number; percentOff: number }[] } | null;
  /** Clear this level (or any later one). */
  crush: { level: number } | null;
  /** Solve the word within this many tries. */
  wordle: { maxAttempts: number } | null;
  /** Reach this score in one 30-second round. */
  slice: { score: number } | null;
};

const QR_DISPLAY_SECONDS = 15;
const ACTIVATION_HOURS = 24;
const VALID_DAYS = 7;

export const PROMOTION = {
  /** Changing the id starts a new promotion: every account can earn one coupon per id. */
  id: 'froyo-arcade-launch',
  draft: true,

  reward: {
    /** Coupon headline for games without their own tiers. Sample wording until the offer is decided. */
    title: '$1 off 1 cup',
    terms: [
      'One reward per account for this promotion. A higher score upgrades it until you open the in-store QR.',
      'Each reward applies to 1 cup.',
      `Usable from ${ACTIVATION_HOURS} hours after it is issued, for ${VALID_DAYS} days. Upgrading does not change these dates.`,
      `Hand your phone to staff at the register. Staff open the QR, which stays on screen for ${QR_DISPLAY_SECONDS} seconds and opens only once.`,
      'Valid at participating stores only. Cannot be combined with other offers.',
    ],
  },

  /** Hours after issue before a coupon can be used in store. */
  activationHours: ACTIVATION_HOURS,
  /** Days a coupon can be used, counted from when it becomes usable. */
  validDays: VALID_DAYS,
  /** Optional hard end for every coupon (ISO 8601 with offset), e.g. '2026-12-31T23:59:59-08:00'. */
  endsAt: null as string | null,
  /** Dates are shown in the stores' time zone. */
  timeZone: 'America/Los_Angeles',

  /** How long the QR stays on screen once opened. */
  qrDisplaySeconds: QR_DISPLAY_SECONDS,

  /** Set a game to null to leave it out of the promotion. */
  missions: {
    catch: {
      tiers: [
        { score: 30, percentOff: 10 },
        { score: 50, percentOff: 15 },
        { score: 100, percentOff: 25 },
        { score: 150, percentOff: 30 },
        { score: 200, percentOff: 35 },
      ],
    },
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
      return m.catch ? `Score ${m.catch.tiers[0]!.score} points or more in one run.` : null;
    case 'crush':
      return m.crush ? `Clear Level ${m.crush.level}.` : null;
    case 'wordle':
      return m.wordle ? `Solve the word in ${m.wordle.maxAttempts} tries or fewer.` : null;
    case 'slice':
      return m.slice ? `Score ${m.slice.score} points in one 30-second round.` : null;
  }
}

export type EarnedReward = {
  title: string;
  /** Percent off, or 0 for the default reward. Used to keep the better of two unclaimed results. */
  percentOff: number;
  /** The next step up, when this game has one. */
  next?: { score: number; title: string };
};

const percentTitle = (percentOff: number) => `${percentOff}% off 1 cup`;

export function catchTiers() {
  return (PROMOTION.missions.catch?.tiers ?? []).map((t) => ({ score: t.score, title: percentTitle(t.percentOff) }));
}

/** What a mission result pays. Decided on the server when the coupon is issued, and stored with it. */
export function rewardFor(game: GameSlug, result: { score?: unknown }): EarnedReward {
  const tiers = PROMOTION.missions.catch?.tiers;
  if (game === 'catch' && tiers && typeof result.score === 'number') {
    const score = result.score;
    const reached = tiers.filter((t) => score >= t.score).at(-1);
    const next = tiers.find((t) => score < t.score);
    return {
      title: percentTitle(reached?.percentOff ?? 0),
      percentOff: reached?.percentOff ?? 0,
      ...(next ? { next: { score: next.score, title: percentTitle(next.percentOff) } } : {}),
    };
  }
  return { title: PROMOTION.reward.title, percentOff: 0 };
}

export function directionsUrl(store: Store): string {
  return store.mapsUrl ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(store.address)}`;
}
