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

export type ExerciseGroupRelation = {
  code?: string;
  id?: string;
  name: string;
  sort_order: number;
  is_active: boolean;
};

export type GroupedExerciseRow = {
  code: string;
  name: string;
  is_active: boolean;
  gym_exercise_groups: ExerciseGroupRelation | ExerciseGroupRelation[];
};

export type AvailableExerciseGroup = {
  code: string;
  name: string;
  exercises: { code: string; name: string }[];
};

export function validateWorkoutSet(set: WorkoutSet): WorkoutSet;
export function adjustWorkoutValue(value: number, delta: number, minimum: number): number;
export function decideFocusTrapTarget<T>(focusable: readonly T[], activeElement: T | null, shiftKey: boolean, activeIsContainer: boolean): T | null;
export function groupAvailableExercises(
  exercises: readonly GroupedExerciseRow[],
  selectedExerciseCodes: readonly string[],
): AvailableExerciseGroup[];
export function toProgressPoints(rows: readonly WorkoutSetRow[]): ProgressPoint[];
export function buildWorkoutExerciseCards(
  exercises: readonly WorkoutExerciseRow[],
  sets: readonly WorkoutExerciseSetRow[],
): WorkoutExerciseCard[];
