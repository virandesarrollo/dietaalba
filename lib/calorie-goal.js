export function parseCalorieGoal(value) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const goal = Number(value);
  return Number.isSafeInteger(goal) && goal >= 500 && goal <= 10000 ? goal : null;
}

export function remainingCalories(goal, consumed) {
  if (!Number.isFinite(goal) || !Number.isFinite(consumed)) return null;
  return Math.max(0, goal - consumed);
}
