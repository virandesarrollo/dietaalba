export type ProgressRow = { workout_date: string; weight_kg: number; reps: number };
export type ProgressSet = { weightKg: number; reps: number };
export type ProgressSession = { date: string; bestSet: ProgressSet; sets: ProgressSet[] };
export type ProgressSummaryEntry = ProgressSet & { date: string };
export type ProgressSummary = {
  latest: ProgressSummaryEntry | null;
  maximum: ProgressSummaryEntry | null;
  changeKg: number | null;
};
export type ProgressChartPoint = ProgressSummaryEntry & { x: number; y: number };

export function buildProgressSessions(rows: readonly ProgressRow[], limit?: number): ProgressSession[];
export function summarizeProgress(sessions: readonly ProgressSession[]): ProgressSummary;
export function buildProgressChartPoints(sessions: readonly ProgressSession[]): ProgressChartPoint[];
