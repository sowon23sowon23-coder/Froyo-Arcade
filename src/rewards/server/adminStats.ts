import { NO_RECORD, channelKey, channelOf, type Channel } from '../attribution';
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
export type ChannelRow = Channel & {
  /** True when the channel came from UTM tags. */
  tagged: boolean;
  visits: number;
  visitors: number;
  players: number;
  plays: number;
  missions: number;
  coupons: number;
  qr: number;
};

export type DailyRow ={ date: string; plays: number; players: number; newAccounts: number; coupons: number; qr: number };

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
    /** Accounts whose latest sign-in falls in the period (the last 7 days with no period). */
    recentSignIns: number;
    newAccounts: number;
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
  channels: ChannelRow[];
  players: PlayerRow[];
  range: DateRange | null;
  /** True when the period had more days than the daily table shows. */
  dailyTrimmed: boolean;
  generatedAt: string;
};

/** Both days included, as YYYY-MM-DD in the stores' time zone. */
export type DateRange = { from: string; to: string };

const GAMES: GameSlug[] = ['catch', 'crush', 'wordle', 'slice'];
const DAY_MS = 24 * 60 * 60 * 1000;
const DAILY_DAYS = 14;
const MAX_DAILY_DAYS = 92;

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

const DAY_FORMAT = new Intl.DateTimeFormat('en-CA', { timeZone: PROMOTION.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });

/** The calendar day in the stores' time zone, as YYYY-MM-DD. */
function dayKey(ms: number): string {
  return DAY_FORMAT.format(ms);
}

/** Every day from one YYYY-MM-DD to another, newest first, at most `limit` of them. */
function daysBetween(from: string, to: string, limit: number): string[] {
  const days: string[] = [];
  const first = Date.parse(`${from}T00:00:00Z`);
  for (let at = Date.parse(`${to}T00:00:00Z`); at >= first && days.length < limit; at -= DAY_MS) {
    days.push(new Date(at).toISOString().slice(0, 10));
  }
  return days;
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

type Touch = { channel: Channel; tagged: boolean; at: string };

/**
 * Credits each browser to one channel, using every landing ever recorded: its
 * first landing with UTM tags, or else its first landing. A coupon or QR is
 * credited through the account to the browser that earned it, since the QR is
 * often opened on another device at the store.
 */
function buildChannels(
  allEvents: StatEvent[],
  events: StatEvent[],
  claims: StatClaim[],
  anonsByUser: Map<string, Set<string>>
): ChannelRow[] {
  const touches = new Map<string, Touch>();
  for (const e of [...allEvents].filter((x) => x.type === 'landing' && x.anon_id).sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    const tagged = e.meta?.tagged === true;
    const current = touches.get(e.anon_id!);
    if (!current || (tagged && !current.tagged)) touches.set(e.anon_id!, { channel: channelOf(e.meta), tagged, at: e.created_at });
  }

  const pick = (anons: Iterable<string>): Touch | null => {
    let best: Touch | null = null;
    for (const anon of anons) {
      const touch = touches.get(anon);
      if (!touch) continue;
      if (!best || (touch.tagged && !best.tagged) || (touch.tagged === best.tagged && touch.at < best.at)) best = touch;
    }
    return best;
  };
  // An account's channel is that of the browsers it played and claimed in.
  const claimAnons = new Map<string, Set<string>>();
  for (const claim of claims) {
    if (!claim.user_id) continue;
    if (!claimAnons.has(claim.user_id)) claimAnons.set(claim.user_id, new Set());
    claimAnons.get(claim.user_id)!.add(claim.anon_id);
  }
  const userTouch = (userId: string) => pick(claimAnons.get(userId) ?? []) ?? pick(anonsByUser.get(userId) ?? []);

  const touchOf = (e: StatEvent): Touch | null => {
    if (e.user_id && (e.type === 'coupon_issued' || e.type === 'qr_execute')) {
      const viaUser = userTouch(e.user_id);
      if (viaUser) return viaUser;
    }
    return e.anon_id ? (touches.get(e.anon_id) ?? null) : null;
  };

  type Acc = ChannelRow & { visitorSet: Set<string>; playerSet: Set<string> };
  const rows = new Map<string, Acc>();
  const row = (touch: Touch | null): Acc => {
    const channel = touch?.channel ?? NO_RECORD;
    const key = channelKey(channel);
    if (!rows.has(key)) {
      rows.set(key, { ...channel, tagged: touch?.tagged ?? false, visits: 0, visitors: 0, players: 0, plays: 0, missions: 0, coupons: 0, qr: 0, visitorSet: new Set(), playerSet: new Set() });
    }
    return rows.get(key)!;
  };

  for (const e of events) {
    if (e.type === 'landing') {
      // A visit counts toward the channel it arrived through.
      const r = row({ channel: channelOf(e.meta), tagged: e.meta?.tagged === true, at: e.created_at });
      r.visits += 1;
      if (e.anon_id) r.visitorSet.add(e.anon_id);
    } else if (e.type === 'game_start') {
      const r = row(touchOf(e));
      r.plays += 1;
      if (e.anon_id) r.playerSet.add(e.anon_id);
    } else if (e.type === 'mission_achieved') row(touchOf(e)).missions += 1;
    else if (e.type === 'coupon_issued') row(touchOf(e)).coupons += 1;
    else if (e.type === 'qr_execute') row(touchOf(e)).qr += 1;
  }

  return [...rows.values()]
    .map(({ visitorSet, playerSet, ...r }) => ({ ...r, visitors: visitorSet.size, players: playerSet.size }))
    .sort((a, b) => b.visits - a.visits || b.plays - a.plays || b.coupons - a.coupons);
}

export function buildOverview(input: {
  events: StatEvent[];
  users: StatUser[];
  claims: StatClaim[];
  coupons: StatCoupon[];
  nowMs: number;
  range?: DateRange | null;
}): AdminOverview {
  const { events: allEvents, users, claims, coupons: allCoupons, nowMs } = input;
  const range = input.range ?? null;
  const inRange = (iso: string) => {
    if (!range) return true;
    const day = dayKey(Date.parse(iso));
    return day >= range.from && day <= range.to;
  };
  const events = allEvents.filter((e) => inRange(e.created_at));
  // A coupon belongs to the day it was issued, so its QR rate can't pass 100%.
  const coupons = allCoupons.filter((c) => inRange(c.issuedAt));
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

  const dates = range
    ? daysBetween(range.from, range.to, MAX_DAILY_DAYS)
    : Array.from({ length: DAILY_DAYS }, (_, i) => dayKey(nowMs - i * DAY_MS));
  const dailyTrimmed = range !== null && daysBetween(range.from, range.to, MAX_DAILY_DAYS + 1).length > MAX_DAILY_DAYS;
  const onDay =(list: StatEvent[], date: string) => list.filter((e) => dayKey(Date.parse(e.created_at)) === date);
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
  // Uses every event, not just the period's: a browser linked last week still
  // belongs to that account today.
  for (const claim of claims) link(claim.user_id, claim.anon_id);
  for (const event of allEvents) link(event.user_id, event.anon_id);

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
      const coupon = allCoupons.find((c) => c.userId === user.id) ?? null;
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
    // With a period, only people who did something in it.
    .filter((p) => {
      if (!range) return true;
      const issuedHere = coupons.some((c) => c.userId === p.userId);
      return p.plays > 0 || p.completes > 0 || p.missions > 0 || issuedHere || inRange(p.joinedAt) || (p.lastSignInAt !== null && inRange(p.lastSignInAt));
    })
    .sort((a, b) => Date.parse(b.lastSignInAt ?? b.joinedAt) - Date.parse(a.lastSignInAt ?? a.joinedAt));

  const channels = buildChannels(allEvents, events, claims, anonsByUser);

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
      recentSignIns: users.filter((u) => u.last_sign_in_at && (range ? inRange(u.last_sign_in_at) : nowMs - Date.parse(u.last_sign_in_at) <= 7 * DAY_MS)).length,
      newAccounts: users.filter((u) => inRange(u.created_at)).length,
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
    channels,
    players,
    range,
    dailyTrimmed,
    generatedAt: new Date(nowMs).toISOString(),
  };
}
