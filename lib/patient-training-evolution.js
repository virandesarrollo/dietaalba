import { buildProgressSessions, summarizeProgress } from './gym-progress.js';

export function buildPatientTrainingEvolution(workouts) {
  const dates = new Set();
  const byExercise = new Map();

  for (const workout of workouts) {
    if (!workout.date) continue;
    dates.add(workout.date);
    if (!Number.isFinite(workout.weight_kg) || !Number.isFinite(workout.reps)) continue;
    const name = workout.exercise?.trim() || 'Ejercicio sin nombre';
    const rows = byExercise.get(name) ?? [];
    rows.push({ workout_date: workout.date, weight_kg: workout.weight_kg, reps: workout.reps });
    byExercise.set(name, rows);
  }

  const exercises = [...byExercise].map(([name, rows]) => {
    const sessions = buildProgressSessions(rows);
    return { name, sessions, summary: summarizeProgress(sessions) };
  }).sort((left, right) => {
    const byDate = right.sessions.at(-1).date.localeCompare(left.sessions.at(-1).date);
    return byDate || left.name.localeCompare(right.name, 'es');
  });

  const sortedDates = [...dates].sort();
  return {
    sessionCount: dates.size,
    setCount: workouts.length,
    lastSessionDate: sortedDates.at(-1) ?? null,
    exercises,
  };
}
