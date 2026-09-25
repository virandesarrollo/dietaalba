function normalizeCounter(value) {
  const numericValue = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : Number.NaN;
  return Number.isFinite(numericValue) && numericValue > 0 ? Math.floor(numericValue) : 0;
}

export function normalizeWeeklyDay(day) {
  return {
    ...day,
    completed: normalizeCounter(day.completed),
    skipped: normalizeCounter(day.skipped),
    pending: normalizeCounter(day.pending),
    free_meals: normalizeCounter(day.free_meals),
    snacks: normalizeCounter(day.snacks),
    night_binges: normalizeCounter(day.night_binges),
  };
}

export function summarizeWeeklyDays(days) {
  const totals = days.reduce((sum, day) => ({
    completed: sum.completed + day.completed,
    skipped: sum.skipped + day.skipped,
    pending: sum.pending + day.pending,
    snacks: sum.snacks + day.snacks,
    nightBinges: sum.nightBinges + day.night_binges,
    freeMeals: sum.freeMeals + day.free_meals,
  }), { completed: 0, skipped: 0, pending: 0, snacks: 0, nightBinges: 0, freeMeals: 0 });
  const goodDays = days.filter((day) => day.completed + day.pending + day.skipped > 0
    && day.pending === 0 && day.snacks === 0 && day.night_binges === 0).length;
  const maxDayValue = Math.max(1, ...days.map((day) => day.completed + day.skipped + day.pending + day.snacks + day.night_binges));
  const chartSegments = [
    { value: totals.completed, color: '#22c55e' },
    { value: totals.skipped, color: '#94a3b8' },
    { value: totals.pending, color: '#f59e0b' },
    { value: totals.snacks, color: '#fb7185' },
    { value: totals.nightBinges, color: '#a855f7' },
    { value: totals.freeMeals, color: '#38bdf8' },
  ];
  return { totals, goodDays, maxDayValue, chartSegments };
}

export function getDayBarMetrics(day, maxDayValue) {
  const incidents = day.pending + day.snacks + day.night_binges;
  const total = day.completed + day.skipped + incidents;
  return {
    incidents,
    total,
    height: (total / maxDayValue) * 100,
    completedHeight: total ? (day.completed / total) * 100 : 0,
    skippedHeight: total ? (day.skipped / total) * 100 : 0,
  };
}

export function getChartBackground(segments) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0) || 1;
  let cursor = 0;
  return `conic-gradient(${segments.map((segment) => {
    const start = cursor;
    cursor += (segment.value / total) * 100;
    return `${segment.color} ${start}% ${cursor}%`;
  }).join(', ')})`;
}
