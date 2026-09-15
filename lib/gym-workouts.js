export function validateWorkoutSet({ weightKg, reps }) {
  if (!Number.isFinite(weightKg) || weightKg <= 0) {
    throw new RangeError('El peso debe ser positivo');
  }
  if (!Number.isInteger(reps) || reps <= 0) {
    throw new RangeError('Las repeticiones deben ser enteras y positivas');
  }
  return { weightKg, reps };
}

export function toProgressPoints(rows) {
  const winners = new Map();

  for (const row of rows) {
    const current = winners.get(row.workout_date);
    if (!current || row.weight_kg > current.weight_kg ||
      (row.weight_kg === current.weight_kg && row.reps > current.reps)) {
      winners.set(row.workout_date, row);
    }
  }

  return [...winners.entries()]
    .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
    .map(([date, row]) => ({ date, weightKg: row.weight_kg, reps: row.reps }));
}
