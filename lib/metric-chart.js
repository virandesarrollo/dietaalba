export function buildMetricChart(values) {
  const measured = values.filter(({ value }) => Number.isFinite(value) && value > 0);
  if (measured.length === 0) return { points: [], segments: [], minimum: null, maximum: null };

  const minimum = Math.min(...measured.map(({ value }) => value));
  const maximum = Math.max(...measured.map(({ value }) => value));
  const padding = maximum === minimum ? Math.max(1, maximum * 0.05) : (maximum - minimum) * 0.15;
  const lower = Math.max(0, minimum - padding);
  const upper = maximum + padding;
  const points = [];
  const segments = [];
  let segment = [];

  values.forEach(({ date, value }, index) => {
    if (!Number.isFinite(value) || value <= 0) {
      if (segment.length > 0) segments.push(segment);
      segment = [];
      return;
    }
    const point = {
      date,
      value,
      x: values.length === 1 ? 300 : 35 + (index / (values.length - 1)) * 530,
      y: 145 - ((value - lower) / (upper - lower)) * 120,
    };
    points.push(point);
    segment.push(point);
  });
  if (segment.length > 0) segments.push(segment);

  return { points, segments, minimum, maximum };
}
