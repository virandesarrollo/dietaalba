export const MAX_MEAL_OPTIONS: 10;

export type MealOption = {
  id: string;
  meal_type: string;
  option_order?: number | null;
  created_at?: string | null;
  is_completed: boolean;
};

export function sortMealOptions<T extends MealOption>(meals: readonly T[]): T[];

export function groupMealOptions<T extends MealOption>(meals: readonly T[]): Record<string, T[]>;

export function applyExclusiveSelection<T extends MealOption>(meals: readonly T[], id: string): T[];

export function reconcileMealSelection<T extends MealOption>(meals: readonly T[], id: string, response: unknown): T[] | null;
