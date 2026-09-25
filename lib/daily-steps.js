const DEFAULT_GOAL = 10000;

export function createSerialTaskQueue() {
  let tail = Promise.resolve();
  return {
    run(task) {
      const result = tail.then(task, task);
      tail = result.then(() => undefined, () => undefined);
      return result;
    },
  };
}

export function canPublishDailyStepsLoad({
  requestCurrent,
  sameLock,
  lockBusy,
  startRevision,
  currentRevision,
}) {
  return requestCurrent
    && sameLock
    && !lockBusy
    && startRevision === currentRevision;
}

export function hasPendingDailyStepWrite(operations) {
  return Array.isArray(operations)
    && operations.some((operation) => operation?.rpc === 'save_my_daily_steps');
}

export function parseDailySteps(value) {
  if (typeof value !== 'number' && (typeof value !== 'string' || value.trim() === '')) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 200000 ? parsed : null;
}

export function parseStepGoal(value) {
  if (typeof value !== 'number' && (typeof value !== 'string' || value.trim() === '')) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1000 && parsed <= 100000 ? parsed : null;
}

export function normalizeDailyStepRow(rows) {
  const row = Array.isArray(rows) && rows.length > 0 && rows[0] !== null
    && typeof rows[0] === 'object' ? rows[0] : {};

  return {
    steps: parseDailySteps(row.steps) ?? 0,
    dailyGoal: parseStepGoal(row.daily_goal) ?? DEFAULT_GOAL,
  };
}

export function dailyStepProgress(steps, dailyGoal) {
  const safeSteps = parseDailySteps(steps) ?? 0;
  const safeGoal = parseStepGoal(dailyGoal) ?? DEFAULT_GOAL;

  return {
    percent: Math.min(100, Math.round((safeSteps / safeGoal) * 100)),
    achieved: safeSteps >= safeGoal,
  };
}
