export type MetricValue = { date: string; value: number | null };
export type MetricPoint = { date: string; value: number; x: number; y: number };
export function buildMetricChart(values: readonly MetricValue[]): {
  points: MetricPoint[];
  segments: MetricPoint[][];
  minimum: number | null;
  maximum: number | null;
};
