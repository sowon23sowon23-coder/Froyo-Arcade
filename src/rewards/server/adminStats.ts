import { PROMOTION, rewardSteps, tiersFor } from '../config';
import type { GameSlug } from '@/games/registry';
import type { CouponStatus, CouponView } from '../types';

// Turns raw records into the admin numbers. No database access here, so the
// arithmetic can be tested on its own.

export type StatEvent = {
  type: string;
  game: string | null;
  anon_id: string | null;
  user_id: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
};
export type StatUser = { id: string; email: string; provider: string; created_at: string; last_sign_in_at: string | null };
export type StatClaim = { anon_id: string; user_id: string | null };
export type StatCoupon = CouponView & { userId: string };

export type GameRow = {
  game: GameSlug;
  players: number;
  plays: number;
  completes: number;
  missions: number;
  coupons: number;
  qr: number;
  storeClicks: number;
  /** Rounds with a measured time. Wordle has none. */
  timedRounds: number;
  averageMs: number;
  medianMs: number;
  totalMs: number;
  /** Results the server judged impossible; left out of scores and time. */
  suspicious: number;
};

export type ScoreRow = {
  game: 'catch' | 'slice' | 'crush';
  /** What one sample is: one round, or for Crush one player's best level. */
  basis: 'round' | 'player';
  samples: number;
  average: number;
  median: number;
  p90: number;
  max: number;
  tiers: { goal: string; title: string; reached: number }[];
};

export type WordleRow = { rounds: number; wins: number; averageAttempts: number; attempts: number[] };
export type DailyRow = { date: string; plays: number; players: number; newAccounts: number; coupons: number; qr: number };

export type PlayerRow = {
  userId: string;
  email: string;
  provider: string;
  joinedAt: string;
  lastSignInAt: string | null;
  plays: number;
  completes: number;
  playMs: number;
  missions: number;
  best: { game: GameSlug; value: number }[];
  couponTitle: string | null;
  couponStatus: CouponStatus | null;
  qrExecutedAt: string | null;
};

export type AdminOverview = {
  totals: {
    players: number;
    accounts: number;
    activeAccounts7d: number;
    playersWithMission: number;
    coupons: number;
    qrExecuted: number;
    plays: number;
    completes: number;
    playMs: number;
    storeClicks: number;
    upgrades: number;
  };
  byStatus: Record<CouponStatus, number>;
  byPercent: { percentOff: number; count: number }[];
  games: GameRow[];
  scores: ScoreRow[];
  wordle: WordleRow;
  daily: DailyRow[];
  players: PlayerRow[];
  generatedAt: string;
};

const GAMES: GameSlug[] = ['catch', 'crush', 'wordle', 'slice'];
const DAY_MS = 24 * 60 * 60 * 1000;
const DAILY_DAYS = 14;

const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
const average = (values: number[]) => (values.length ? sum(values) / values.length : 0);

/** Nearest-rank percentile of an ascending list. */
function percentile(sorted: number[], share: number): number {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * share) - 1)]!;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function dayKey(ms: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: PROMOTION.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms);
}

/**
 * Crush reports the time since the visit started with every level it clears, so
 * those overlap: a visit's time is its largest value. Catch and Slice report one
 * time per round. Events from before session ids were recorded group by browser.
 */
function roundTimes(game: GameSlug, completes: StatEvent[]): number[] {
  if (game === 'crush') {
    const byVisit = new Map<string, number>();
    for (const e of completes) {
      const ms = num(e.meta?.elapsedMs);
      if (ms === null) continue;
      const key = String(e.meta?.sessionId ?? e.anon_id);
      byVisit.set(key, Math.max(byVisit.get(key) ?? 0, ms));
    }
    return [...byVisit.values()];
  }
  return completes.flatMap((e) => {
    const ms = num(e.meta?.elapsedMs);
    return ms === null ? [] : [ms];
  });
}

export function buildOverview(input: {
  events: StatEvent[];
  users: StatUser[];
  claims: StatClaim[];
  coupons: StatCoupon[];
  nowMs: number;
}): AdminOverview {
  const { events, users, claims, coupons, nowMs } = input;
  const ofType = (type: string) => events.filter((e) => e.type === type);
  const starts = ofType('game_start');
  const allCompletes = ofType('game_complete');
  // Results the server called impossible don't count as play.
  const completes = allCompletes.filter((e) => e.meta?.plausible !== false);
  const missions = ofType('mission_achieved');
  const qrEvents = ofType('qr_execute');
  const storeClicks = ofType('store_click');
  const issued = ofType('coupon_issued');

  const playerIds = new Set([...starts, ...allCompletes].flatMap((e) => (e.anon_id ? [e.anon_id] : [])));
  const playersWithMission = new Set(missions.flatMap((e) => (e.anon_id ? [e.anon_id] : [])));

  const games: GameRow[] = GAMES.map((game) => {
    const mine = (list: StatEvent[]) => list.filter((e) => e.game === game);
    const times = roundTimes(game, mine(completes));
    return {
      game,
      players: new Set(mine(starts).map((e) => e.anon_id)).size,
      plays: mine(starts).length,
      completes: mine(completes).length,
      missions: mine(missions).length,
      coupons: mine(issued).length,
      qr: mine(qrEvents).length,
      storeClicks: mine(storeClicks).length,
      timedRounds: times.length,
      averageMs: average(times),
      medianMs: median(times),
      totalMs: sum(times),
      suspicious: mine(allCompletes).length - mine(completes).length,
    };
  });

  const scores: ScoreRow[] = (['catch', 'slice', 'crush'] as const).map((game) => {
    const mine = completes.filter((e) => e.game === game);
    let values: number[];
    if (game === 'crush') {
      const best = new Map<string, number>();
      for (const e of mine) {
        const level = num(e.meta?.level);
        if (level === null) continue;
        const key = e.anon_id ?? '';
        best.set(key, Math.max(best.get(key) ?? 0, level));
      }
      values = [...best.values()];
    } else {
      values = mine.flatMap((e) => {
        const score = num(e.meta?.score);
        return score === null ? [] : [score];
      });
    }
    const sorted = [...values].sort((a, b) => a - b);
    const steps = rewardSteps(game);
    const labels = tiersFor(game);
    return {
      game,
      basis: game === 'crush' ? 'player' : 'round',
      samples: values.length,
      average: average(values),
      median: median(values),
      p90: percentile(sorted, 0.9),
      max: sorted.at(-1) ?? 0,
      tiers: steps.map((step, i) => ({
        goal: labels[i]!.goal,
        title: labels[i]!.title,
        reached: values.filter((v) => v >= step.at).length,
      })),
    };
  });

  const wordleRounds = completes.filter((e) => e.game === 'wordle');
  const wins = wordleRounds.filter((e) => e.meta?.won === true);
  const winAttempts = wins.flatMap((e) => {
    const attempts = num(e.meta?.attempts);
    return attempts === null ? [] : [attempts];
  });
  const wordle: WordleRow = {
    rounds: wordleRounds.length,
    wins: wins.length,
    averageAttempts: average(winAttempts),
    attempts: [1, 2, 3, 4, 5, 6].map((n) => winAttempts.filter((a) => a === n).length),
  };

  const dates = Array.from({ length: DAILY_DAYS }, (_, i) => dayKey(nowMs - i * DAY_MS));
  const onDay = (list: StatEvent[], date: string) => list.filter((e) => dayKey(Date.parse(e.created_at)) === date);
  const daily: DailyRow[] = dates.map((date) => ({
    date,
    plays: onDay(starts, date).length,
    players: new Set(onDay(starts, date).map((e) => e.anon_id)).size,
    newAccounts: users.filter((u) => dayKey(Date.parse(u.created_at)) === date).length,
    coupons: onDay(issued, date).length,
    qr: onDay(qrEvents, date).length,
  }));

  // Play happens before sign-in, so a browser is tied to an account through its
  // claims and through events sent while signed in.
  const anonsByUser = new Map<string, Set<string>>();
  const link = (userId: string | null, anon: string | null) => {
    if (!userId || !anon) return;
    if (!anonsByUser.has(userId)) anonsByUser.set(userId, new Set());
    anonsByUser.get(userId)!.add(anon);
  };
  for (const claim of claims) link(claim.user_id, claim.anon_id);
  for (const event of events) link(event.user_id, event.anon_id);

  const players: PlayerRow[] = users
    .map((user) => {
      const anons = anonsByUser.get(user.id) ?? new Set<string>();
      const mine = (list: StatEvent[]) => list.filter((e) => e.anon_id !== null && anons.has(e.anon_id));
      const myCompletes = mine(completes);
      const best = (['catch', 'slice', 'crush'] as const).flatMap((game) => {
        const values = myCompletes.filter((e) => e.game === game).flatMap((e) => {
          const value = num(game === 'crush' ? e.meta?.level : e.meta?.score);
          return value === null ? [] : [value];
        });
        return values.length ? [{ game, value: Math.max(...values) }] : [];
      });
      const coupon = coupons.find((c) => c.userId === user.id) ?? null;
      return {
        userId: user.id,
        email: user.email,
        provider: user.provider,
        joinedAt: user.created_at,
        lastSignInAt: user.last_sign_in_at,
        plays: mine(starts).length,
        completes: myCompletes.length,
        playMs: sum(GAMES.flatMap((game) => roundTimes(game, myCompletes.filter((e) => e.game === game)))),
        missions: mine(missions).length,
        best,
        couponTitle: coupon?.rewardTitle ?? null,
        couponStatus: coupon?.status ?? null,
        qrExecutedAt: coupon?.qrExecutedAt ?? null,
      };
    })
    .sort((a, b) => Date.parse(b.lastSignInAt ?? b.joinedAt) - Date.parse(a.lastSignInAt ?? a.joinedAt));

  const byStatus: Record<CouponStatus, number> = { waiting: 0, available: 0, showing: 0, shown: 0, expired: 0 };
  const percents = new Map<number, number>();
  for (const coupon of coupons) {
    byStatus[coupon.status] += 1;
    percents.set(coupon.percentOff, (percents.get(coupon.percentOff) ?? 0) + 1);
  }

  return {
    totals: {
      players: playerIds.size,
      accounts: users.length,
      activeAccounts7d: users.filter((u) => u.last_sign_in_at && nowMs - Date.parse(u.last_sign_in_at) <= 7 * DAY_MS).length,
      playersWithMission: playersWithMission.size,
      coupons: coupons.length,
      qrExecuted: coupons.filter((c) => c.qrExecutedAt).length,
      plays: starts.length,
      completes: completes.length,
      playMs: sum(games.map((g) => g.totalMs)),
      storeClicks: storeClicks.length,
      upgrades: ofType('coupon_upgraded').length,
    },
    byStatus,
    byPercent: [...percents].map(([percentOff, count]) => ({ percentOff, count })).sort((a, b) => a.percentOff - b.percentOff),
    games,
    scores,
    wordle,
    daily,
    players,
    generatedAt: new Date(nowMs).toISOString(),
  };
}
