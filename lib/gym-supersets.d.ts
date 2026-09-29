import type { WorkoutExerciseCard } from './gym-workouts.js';

export type WorkoutSuperset = {
  id: string;
  first_exercise_id: string;
  second_exercise_id: string;
};

export type WorkoutBlock = {
  id: string;
  supersetId: string | null;
  exercises: WorkoutExerciseCard[];
};

export function buildWorkoutBlocks(
  cards: readonly WorkoutExerciseCard[],
  supersets: readonly WorkoutSuperset[],
): WorkoutBlock[];
