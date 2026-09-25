export type WeeklyDay = {
  report_date: string;
  completed: number;
  skipped: number;
  pending: number;
  free_meals: number;
  snacks: number;
  night_binges: number;
};

export type WeeklyDayInput = {
  report_date: string;
  completed?: unknown;
  skipped?: unknown;
  pending?: unknown;
  free_meals?: unknown;
  snacks?: unknown;
  night_binges?: unknown;
};

export function normalizeWeeklyDay(day: WeeklyDayInput): WeeklyDay;
export function summarizeWeeklyDays(days: readonly WeeklyDay[]): {
  totals: { completed: number; skipped: number; pending: number; snacks: number; nightBinges: number; freeMeals: number };
  goodDays: number;
  maxDayValue: number;
  chartSegments: { value: number; color: string }[];
};
export function getDayBarMetrics(day: WeeklyDay, maxDayValue: number): {
  incidents: number;
  total: number;
  height: number;
  completedHeight: number;
  skippedHeight: number;
};
export function getChartBackground(segments: readonly { value: number; color: string }[]): string;
