'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameSlug } from '@/games/registry';
import { PROMOTION } from '../config';
import type { MissionOutcome, RewardsMe } from '../types';
import { fetchMe, finishPlay, startPlay } from './api';
import { savePendingClaim } from './pending';

// Several components on one screen ask at once; they share one request.
let shared: { at: number; request: Promise<RewardsMe | null> } | null = null;

function loadMe(force: boolean): Promise<RewardsMe | null> {
  if (!force && shared && Date.now() - shared.at < 3000) return shared.request;
  shared = { at: Date.now(), request: fetchMe() };
  return shared.request;
}

/** The visitor's rewards state. `me` is null while loading. */
export function useRewards() {
  const [me, setMe] = useState<RewardsMe | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async (force: boolean) => {
    const next = await loadMe(force);
    setFailed(!next);
    if (next) setMe(next);
    return next;
  }, []);

  const reload = useCallback(() => load(true), [load]);

  useEffect(() => {
    void load(false);
  }, [load]);

  return { me, failed, reload, setMe };
}

/**
 * Ties one game round to a server play session: call `begin` when a round
 * starts and `finish` when it ends. `outcome` is null while waiting.
 */
export function usePlaySession(game: GameSlug) {
  const sessionRef = useRef<Promise<string | null> | null>(null);
  const [outcome, setOutcome] = useState<MissionOutcome | null>(null);
  const enabled = PROMOTION.missions[game] !== null;

  const begin = useCallback(() => {
    setOutcome(null);
    sessionRef.current = enabled ? startPlay(game) : Promise.resolve(null);
  }, [enabled, game]);

  /** Crush reports every cleared level on one session; pass keep=true to reuse it. */
  const finish = useCallback(
    async (result: { score?: number; level?: number }, keep = false) => {
      const pending = sessionRef.current;
      if (!keep) sessionRef.current = null;
      setOutcome(null);
      const sessionId = pending ? await pending : null;
      if (!sessionId) {
        setOutcome({ state: 'off' });
        return;
      }
      const next = await finishPlay(sessionId, result);
      if (next.state === 'achieved') savePendingClaim(next.claimId, game, next.reward.percentOff);
      setOutcome(next);
    },
    [game]
  );

  /** Starts a session only if none is open (Crush keeps one for the whole visit). */
  const ensure = useCallback(() => {
    if (!sessionRef.current) begin();
  }, [begin]);

  return { begin, ensure, finish, outcome };
}
