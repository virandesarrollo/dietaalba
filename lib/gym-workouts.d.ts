export type WorkoutSet = {
  weightKg: number;
  reps: number;
};

export type WorkoutSetRow = {
  workout_date: string;
  weight_kg: number;
  reps: number;
};

export type ProgressPoint = {
  date: string;
  weightKg: number;
  reps: number;
};

export type WorkoutExerciseRow = {
  id: string;
  exercise_code: string;
  exercise_name_snapshot: string;
};

export type WorkoutExerciseSetRow = {
  id: string;
  exercise_code: string;
  weight_kg: number;
  reps: number;
  created_at: string;
};

export type WorkoutExerciseCard = {
  id: string;
  exerciseCode: string;
  name: string;
  sets: { id: string; weightKg: number; reps: number }[];
};

export function validateWorkoutSet(set: WorkoutSet): WorkoutSet;
export function toProgressPoints(rows: readonly WorkoutSetRow[]): ProgressPoint[];
export function buildWorkoutExerciseCards(
  exercises: readonly WorkoutExerciseRow[],
  sets: readonly WorkoutExerciseSetRow[],
): WorkoutExerciseCard[];
