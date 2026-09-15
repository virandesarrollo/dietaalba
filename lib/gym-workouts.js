export function validateWorkoutSet({ weightKg, reps }) {
  if (!Number.isFinite(weightKg) || weightKg <= 0) {
    throw new RangeError('El peso debe ser positivo');
  }
  if (!Number.isInteger(reps) || reps <= 0) {
    throw new RangeError('Las repeticiones deben ser enteras y positivas');
  }
  return { weightKg, reps };
}

export function buildWorkoutExerciseCards(exercises, sets) {
  return exercises.map((exercise) => ({
    id: exercise.id,
    exerciseCode: exercise.exercise_code,
    name: exercise.exercise_name_snapshot,
    sets: sets
      .filter((set) => set.exercise_code === exercise.exercise_code)
      .sort((left, right) => left.created_at.localeCompare(right.created_at))
      .map((set) => ({ id: set.id, weightKg: set.weight_kg, reps: set.reps })),
  }));
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
