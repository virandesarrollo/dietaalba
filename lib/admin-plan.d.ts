export type MealDraftValue = {
  id?: string;
  title: string;
  ingredients: string;
  recipeUrl?: string;
  isCompleted: boolean;
};

export type MealPayloadOption = {
  id?: string;
  title: string;
  ingredients: string;
  recipe_url: string;
  option_order: number;
};

export type MealPayload<T extends string = string> = {
  meal_type: T;
  options: MealPayloadOption[];
};

export type SavedMeal<T extends string = string> = {
  id: string;
  meal_type: T;
  option_order: number;
};

export function buildMealPayload<T extends string>(
  drafts: Record<T, MealDraftValue | readonly MealDraftValue[]>,
  mealTypes: readonly T[],
): MealPayload<T>[];

export function applySavedMealIds<T extends string>(
  drafts: Record<T, MealDraftValue>,
  savedMeals: readonly SavedMeal[],
): Record<T, MealDraftValue>;

export function applySavedMealIds<T extends string>(
  drafts: Record<T, readonly MealDraftValue[]>,
  savedMeals: readonly SavedMeal[],
): Record<T, MealDraftValue[]>;
