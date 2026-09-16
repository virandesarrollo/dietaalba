export type MonotonicGuard = {
  begin(): number;
  invalidate(): void;
  isCurrent(token: unknown): token is number;
};

export function createMonotonicGuard(): MonotonicGuard;
export function isValidCalendarDate(value: unknown): value is string;
export function isValidDateRange(startDate: unknown, endDate: unknown): boolean;
