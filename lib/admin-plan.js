import { MAX_MEAL_OPTIONS } from './meal-options.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function buildMealPayload(drafts, mealTypes = Object.keys(drafts)) {
  return mealTypes.map((meal) => {
    const mealType = typeof meal === 'string' ? meal : meal.meal_type;
    const draft = typeof meal === 'string' ? drafts[mealType] : meal.options;
    const options = Array.isArray(draft) ? draft : [draft];
    if (options.length < 1 || options.length > MAX_MEAL_OPTIONS) {
      throw new RangeError(`Cada comida debe tener entre 1 y ${MAX_MEAL_OPTIONS} opciones`);
    }

    return {
      meal_type: mealType,
      options: options.map((option, index) => {
        const kcal = option.kcal === '' || option.kcal == null ? null : Number(option.kcal);
        if (kcal !== null && (!Number.isInteger(kcal) || kcal < 0 || kcal > 10000)) {
          throw new RangeError('Las kcal deben ser un número entero entre 0 y 10000');
        }
        return {
          ...(UUID_PATTERN.test(option.id ?? '') ? { id: option.id } : {}),
          title: option.title.trim(),
          ingredients: option.ingredients.trim(),
          recipe_url: (option.recipeUrl ?? '').trim(),
          ...(kcal === null ? {} : { kcal }),
          option_order: index + 1,
        };
      }),
    };
  });
}

export function applySavedMealIds(drafts, savedMeals, mealTypes = Object.keys(drafts)) {
  const savedIds = new Map(savedMeals.map((meal) => [
    `${meal.meal_type}\0${meal.meal_order ?? 1}\0${meal.option_order}`,
    meal.id,
  ]));
  const legacySavedIds = new Map(savedMeals
    .filter((meal) => meal.meal_order == null)
    .map((meal) => [`${meal.meal_type}\0${meal.option_order}`, meal.id]));

  return Object.fromEntries(Object.entries(drafts).map(([mealType, draft]) => {
    const mealOrder = mealTypes.indexOf(mealType) + 1;
    const isOptionList = Array.isArray(draft);
    const options = (isOptionList ? draft : [draft]).map((option, index) => ({
      ...option,
      ...((savedIds.has(`${mealType}\0${mealOrder}\0${index + 1}`) || legacySavedIds.has(`${mealType}\0${index + 1}`))
        ? { id: savedIds.get(`${mealType}\0${mealOrder}\0${index + 1}`) ?? legacySavedIds.get(`${mealType}\0${index + 1}`) }
        : {}),
    }));
    return [mealType, isOptionList ? options : options[0]];
  }));
}
