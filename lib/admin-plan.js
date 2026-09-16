import { MAX_MEAL_OPTIONS } from './meal-options.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function buildMealPayload(drafts, mealTypes) {
  return mealTypes.map((mealType) => {
    const draft = drafts[mealType];
    const options = Array.isArray(draft) ? draft : [draft];
    if (options.length < 1 || options.length > MAX_MEAL_OPTIONS) {
      throw new RangeError(`Cada comida debe tener entre 1 y ${MAX_MEAL_OPTIONS} opciones`);
    }

    return {
      meal_type: mealType,
      options: options.map((option, index) => ({
        ...(UUID_PATTERN.test(option.id ?? '') ? { id: option.id } : {}),
        title: option.title.trim(),
        ingredients: option.ingredients.trim(),
        recipe_url: (option.recipeUrl ?? '').trim(),
        option_order: index + 1,
      })),
    };
  });
}

export function applySavedMealIds(drafts, savedMeals) {
  const savedIds = new Map(savedMeals.map((meal) => [
    `${meal.meal_type}\0${meal.option_order}`,
    meal.id,
  ]));

  return Object.fromEntries(Object.entries(drafts).map(([mealType, draft]) => {
    const isOptionList = Array.isArray(draft);
    const options = (isOptionList ? draft : [draft]).map((option, index) => ({
      ...option,
      ...(savedIds.has(`${mealType}\0${index + 1}`)
        ? { id: savedIds.get(`${mealType}\0${index + 1}`) }
        : {}),
    }));
    return [mealType, isOptionList ? options : options[0]];
  }));
}
