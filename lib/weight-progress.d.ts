export type WeightPeriod = 'week' | 'month';
export type WeightRecord = { recorded_at: string; weight_kg: number | null };
export type WeightProgress = {
  period: WeightPeriod;
  start: string;
  end: string;
  measurements: { date: string; recordedAt: string; value: number }[];
  change: number | null;
};
export function weightProgressDates(period: WeightPeriod, today?: string): { start: string; end: string };
export function weightProgressQueryRange(today?: string): { start: string; end: string };
export function summarizeWeightProgress(rows: readonly WeightRecord[], period: WeightPeriod, today?: string): WeightProgress;
export function formatWeightProgressChange(change: number | null): string;
export function formatWeightProgressShare(summary: WeightProgress): string;
export function copyWeightProgress(text: string): Promise<void>;
