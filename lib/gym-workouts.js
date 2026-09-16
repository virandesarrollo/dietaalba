export function validateWorkoutSet({ weightKg, reps }) {
  if (!Number.isFinite(weightKg) || weightKg <= 0) {
    throw new RangeError('El peso debe ser positivo');
  }
  if (!Number.isInteger(reps) || reps <= 0) {
    throw new RangeError('Las repeticiones deben ser enteras y positivas');
  }
  return { weightKg, reps };
}

export function adjustWorkoutValue(value, delta, minimum) {
  return Math.max(minimum, Math.round((value + delta) * 100) / 100);
}

export function decideFocusTrapTarget(focusable, activeElement, shiftKey, activeIsContainer) {
  if (focusable.length === 0) return null;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (activeIsContainer) return shiftKey ? last : first;
  if (shiftKey && activeElement === first) return last;
  if (!shiftKey && activeElement === last) return first;
  return null;
}

export function groupAvailableExercises(exercises, selectedExerciseCodes) {
  if (!Array.isArray(exercises)) return [];
  const selected = new Set(Array.isArray(selectedExerciseCodes) ? selectedExerciseCodes : []);
  const groups = new Map();

  for (const exercise of exercises) {
    if (!exercise || typeof exercise.code !== 'string' || exercise.code.length === 0 ||
      typeof exercise.name !== 'string' || exercise.name.length === 0 || exercise.is_active !== true) continue;
    if (selected.has(exercise.code)) continue;
    const relation = Array.isArray(exercise.gym_exercise_groups)
      ? exercise.gym_exercise_groups[0]
      : exercise.gym_exercise_groups;
    const groupCode = typeof relation?.code === 'string' && relation.code.length > 0
      ? relation.code
      : relation?.id;
    if (!relation || typeof groupCode !== 'string' || groupCode.length === 0 ||
      typeof relation.name !== 'string' || relation.name.length === 0 ||
      !Number.isInteger(relation.sort_order) || relation.is_active !== true) continue;
    const group = groups.get(groupCode) ?? {
      code: groupCode,
      name: relation.name,
      sortOrder: relation.sort_order,
      exercises: [],
    };
    group.exercises.push({ code: exercise.code, name: exercise.name });
    groups.set(groupCode, group);
  }

  return [...groups.values()]
    .sort((left, right) => left.sortOrder - right.sortOrder ||
      left.name.localeCompare(right.name, 'es') || left.code.localeCompare(right.code, 'es'))
    .map((group) => ({
      code: group.code,
      name: group.name,
      exercises: group.exercises.sort((left, right) =>
        left.name.localeCompare(right.name, 'es') || left.code.localeCompare(right.code, 'es')),
    }));
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
