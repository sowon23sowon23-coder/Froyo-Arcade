import 'server-only';
import type { TileMark } from '../types';

/**
 * Standard Wordle two-pass scoring: exact matches first, then leftover
 * letters get "present" using a pooled count so duplicate letters in the
 * guess don't over-claim duplicate letters in the answer.
 */
export function scoreGuess(guess: string, answer: string): TileMark[] {
  const marks: TileMark[] = Array(5).fill('absent');
  const pool: Record<string, number> = {};

  for (let i = 0; i < 5; i++) {
    if (guess[i] === answer[i]) {
      marks[i] = 'correct';
    } else {
      const letter = answer[i]!;
      pool[letter] = (pool[letter] ?? 0) + 1;
    }
  }

  for (let i = 0; i < 5; i++) {
    if (marks[i] === 'correct') continue;
    const letter = guess[i]!;
    if ((pool[letter] ?? 0) > 0) {
      marks[i] = 'present';
      pool[letter]! -= 1;
    }
  }

  return marks;
}
