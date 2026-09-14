export type MealDraftValue = {
  id?: string;
  title: string;
  ingredients: string;
  isCompleted: boolean;
};

export type MealPayload = {
  meal_type: string;
  title: string;
  ingredients: string;
  is_completed: boolean;
};

export type SavedMeal = { id: string; meal_type: string };

export function buildMealPayload<T extends string>(
  drafts: Record<T, MealDraftValue>,
  mealTypes: readonly T[],
): MealPayload[];

export function applySavedMealIds<T extends string>(
  drafts: Record<T, MealDraftValue>,
  savedMeals: readonly SavedMeal[],
): Record<T, MealDraftValue>;
