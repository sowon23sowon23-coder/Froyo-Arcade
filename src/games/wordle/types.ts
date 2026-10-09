export type TileMark = 'correct' | 'present' | 'absent';

export type GuessRecord = {
  guess: string;
  marks: TileMark[];
};

export type GameStatus = 'not_started' | 'in_progress' | 'won' | 'lost';

export type PlayerStats = {
  plays: number;
  wins: number;
  streak: number;
};

export const MAX_ATTEMPTS = 6;
export const WORD_LENGTH = 5;

export type TodayResponse = {
  playDate: string;
  status: GameStatus;
  attempts: number;
  maxAttempts: typeof MAX_ATTEMPTS;
  guesses: GuessRecord[];
  /** Only present once today's game has finished (won or lost). */
  answer: string | null;
  stats: PlayerStats;
};

export type GuessErrorReason = 'invalid_length' | 'invalid_characters' | 'not_in_wordlist' | 'already_finished';

export type GuessResponse =
  | {
      ok: true;
      marks: TileMark[];
      attempt: number;
      status: GameStatus;
      answer: string | null;
      stats: PlayerStats;
    }
  | { ok: false; reason: GuessErrorReason };
