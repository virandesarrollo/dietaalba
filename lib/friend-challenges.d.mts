export function normalizeScore(value: unknown): number;

export function normalizeChallenge<T extends object>(challenge: T): T & {
  my_score: number;
  opponent_score: number;
};

export function challengeProgress(myScore: unknown, opponentScore: unknown): number;
