/**
 * Where a visitor came from. Recorded once per browser visit as a `landing`
 * event; every later play, coupon and QR from that browser is credited to the
 * first landing that carried UTM tags, or else the first landing at all.
 */

export const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'] as const;

export type Channel = { source: string; medium: string; campaign: string };

export const NO_RECORD: Channel = { source: '(유입 기록 없음)', medium: '', campaign: '' };

/** Lowercase, trimmed, safe characters only, so "Instagram " and "instagram" count as one. */
export function cleanTag(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣._~+-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

/** Apps that open links in their own browser, from the user agent. */
const APPS: [RegExp, string][] = [
  [/Instagram/i, 'instagram'],
  [/FBAN|FBAV|FB_IAB|FBIOS|Messenger/i, 'facebook'],
  [/KAKAOTALK/i, 'kakaotalk'],
  [/NAVER\(inapp/i, 'naver'],
  [/Line\//i, 'line'],
  [/Snapchat/i, 'snapchat'],
  [/TikTok|musical_ly/i, 'tiktok'],
  [/Twitter/i, 'twitter'],
  [/Pinterest/i, 'pinterest'],
];

export function inAppName(userAgent: string): string {
  return APPS.find(([pattern]) => pattern.test(userAgent))?.[1] ?? '';
}

export type LandingMeta = {
  source: string;
  medium: string;
  campaign: string;
  content: string;
  /** True when the source came from UTM tags rather than a guess. */
  tagged: boolean;
  app: string;
  referrer: string;
  path: string;
};

/** A landing's channel: its UTM tags, or a guess from the in-app browser, the referring site, or nothing. */
export function landingMeta(input: {
  utm: Record<string, unknown>;
  referrer: string;
  path: string;
  userAgent: string;
  ownHost: string;
}): LandingMeta {
  const source = cleanTag(input.utm.utm_source);
  const app = inAppName(input.userAgent);
  let referrer = '';
  try {
    const host = new URL(input.referrer).hostname.replace(/^www\./, '');
    if (host && host !== input.ownHost) referrer = host.slice(0, 80);
  } catch {
    // no or bad referrer
  }
  const base = {
    campaign: cleanTag(input.utm.utm_campaign),
    content: cleanTag(input.utm.utm_content),
    app,
    referrer,
    path: input.path.startsWith('/') ? input.path.slice(0, 80) : '/',
  };
  if (source) return { ...base, source, medium: cleanTag(input.utm.utm_medium), tagged: true };
  if (app) return { ...base, source: app, medium: 'in-app', tagged: false };
  if (referrer) return { ...base, source: referrer, medium: 'referral', tagged: false };
  return { ...base, source: '(direct)', medium: '(none)', tagged: false };
}

export function channelOf(meta: Record<string, unknown> | null): Channel {
  return {
    source: String(meta?.source ?? '') || '(direct)',
    medium: String(meta?.medium ?? ''),
    campaign: String(meta?.campaign ?? ''),
  };
}

export function channelKey(channel: Channel): string {
  return `${channel.source}|${channel.medium}|${channel.campaign}`;
}
