'use client';

import { useEffect } from 'react';
import { UTM_KEYS } from '../attribution';

const SEEN_KEY = 'froyo-arcade:landed';

/**
 * Records where this visit came from, once per browser tab session, or again
 * when a new tagged link is opened. Staff and preview pages are left out.
 */
export function TrackLanding() {
  useEffect(() => {
    const { pathname, search } = window.location;
    if (pathname.startsWith('/admin') || pathname.startsWith('/rewards/preview')) return;

    const params = new URLSearchParams(search);
    const utm = Object.fromEntries(UTM_KEYS.flatMap((key) => (params.get(key) ? [[key, params.get(key)]] : [])));
    const tagged = Object.keys(utm).length > 0;

    let seen = false;
    try {
      seen = sessionStorage.getItem(SEEN_KEY) === '1';
      sessionStorage.setItem(SEEN_KEY, '1');
    } catch {
      // Storage blocked: record every load rather than none.
    }
    if (seen && !tagged) return;

    void fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'landing', utm, referrer: document.referrer, path: pathname }),
      keepalive: true,
    }).catch(() => undefined);
  }, []);

  return null;
}
