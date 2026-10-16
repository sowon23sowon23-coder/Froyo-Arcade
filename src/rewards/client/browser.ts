/**
 * Instagram (and other apps) open links in their own browser, where Google
 * blocks sign-in. Email codes work there; Google sign-in is offered only in a
 * regular browser.
 */
const IN_APP = /Instagram|FBAN|FBAV|FB_IAB|FBIOS|Messenger|KAKAOTALK|NAVER\(inapp|Line\/|Snapchat|TikTok|musical_ly|Twitter|Pinterest|; wv\)/i;

export function isInAppBrowser(ua: string = typeof navigator === 'undefined' ? '' : navigator.userAgent): boolean {
  return IN_APP.test(ua);
}

export function isAndroid(ua: string = typeof navigator === 'undefined' ? '' : navigator.userAgent): boolean {
  return /Android/i.test(ua);
}

/** On Android an intent link can hand the page to Chrome. iOS has no equivalent: the player uses the app's menu. */
export function chromeIntentUrl(href: string): string {
  const url = new URL(href);
  return `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=${url.protocol.replace(':', '')};package=com.android.chrome;end`;
}
