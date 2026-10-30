import 'server-only';
import { createHmac } from 'node:crypto';
import { ANSWERS } from './answers';

// The day's answer depends only on the date and a secret, so it needs no
// database and every server instance agrees. The word list is shuffled once per
// pass through the list, so no word repeats until all of them have been used.
// Without the secret, anyone who can read this code could work out future answers.

const DAY_MS = 24 * 60 * 60 * 1000;

function secret(): string {
  return process.env.WORDLE_SECRET?.trim() || 'froyo-arcade-wordle-dev';
}

/** Whole days since 1970 for a YYYY-MM-DD play date. */
function dayNumber(playDate: string): number {
  return Math.floor(Date.parse(`${playDate}T00:00:00Z`) / DAY_MS);
}

function shuffled(cycle: number): string[] {
  const words = [...ANSWERS];
  // Fisher-Yates, with each swap position drawn from the keyed hash.
  for (let i = words.length - 1; i > 0; i -= 1) {
    const digest = createHmac('sha256', secret()).update(`${cycle}:${i}`).digest();
    const j = digest.readUInt32BE(0) % (i + 1);
    [words[i], words[j]] = [words[j]!, words[i]!];
  }
  return words;
}

let cached: { cycle: number; words: string[] } | null = null;

/** A run of days starting at a play date, for the admin. */
export function answersFrom(playDate: string, days: number): { date: string; answer: string }[] {
  const start = Date.parse(`${playDate}T00:00:00Z`);
  return Array.from({ length: days }, (_, i) => {
    const date = new Date(start + i * DAY_MS).toISOString().slice(0, 10);
    return { date, answer: answerFor(date) };
  });
}

export function answerFor(playDate: string): string {
  const day = dayNumber(playDate);
  const cycle = Math.floor(day / ANSWERS.length);
  if (cached?.cycle !== cycle) cached = { cycle, words: shuffled(cycle) };
  return cached.words[day - cycle * ANSWERS.length]!;
}
