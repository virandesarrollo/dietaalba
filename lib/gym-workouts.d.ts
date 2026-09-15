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

export function validateWorkoutSet(set: WorkoutSet): WorkoutSet;
export function toProgressPoints(rows: readonly WorkoutSetRow[]): ProgressPoint[];
