export function rankSourceDays<T extends { date: string }>(
  days: readonly T[],
  selectedDate: string,
  mode: 'copy' | 'swap',
  today: string,
): T[];
