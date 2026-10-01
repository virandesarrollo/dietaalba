import type { ProgressSession, ProgressSummary } from './gym-progress.js';

export type PatientWorkout = { date: string; exercise: string | null; exercise_group?: string | null; weight_kg: number | null; reps: number | null };
export type PatientExerciseEvolution = {
  name: string;
  group: string;
  sessions: ProgressSession[];
  summary: ProgressSummary;
};
export function buildPatientTrainingEvolution(workouts: readonly PatientWorkout[]): {
  sessionCount: number;
  setCount: number;
  lastSessionDate: string | null;
  exercises: PatientExerciseEvolution[];
};
