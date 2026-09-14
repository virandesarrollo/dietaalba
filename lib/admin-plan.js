export function buildMealPayload(drafts, mealTypes) {
  return mealTypes.map((mealType) => ({
    meal_type: mealType,
    title: drafts[mealType].title.trim(),
    ingredients: drafts[mealType].ingredients.trim(),
    is_completed: drafts[mealType].isCompleted,
  }));
}

export function applySavedMealIds(drafts, savedMeals) {
  const next = { ...drafts };
  for (const savedMeal of savedMeals) {
    if (savedMeal.meal_type in next) {
      next[savedMeal.meal_type] = {
        ...next[savedMeal.meal_type],
        id: savedMeal.id,
      };
    }
  }
  return next;
}
