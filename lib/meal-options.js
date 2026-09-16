export const MAX_MEAL_OPTIONS = 10;

const MEAL_TYPE_ORDER = new Map([
  'DESAYUNO',
  'MEDIA MAÑANA',
  'ALMUERZO',
  'MERIENDA',
  'CENA',
  'POSTRE NOCTURNO',
].map((mealType, index) => [mealType, index]));

function compareText(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function compareMealTypes(left, right) {
  const leftOrder = MEAL_TYPE_ORDER.get(left);
  const rightOrder = MEAL_TYPE_ORDER.get(right);

  if (leftOrder !== undefined || rightOrder !== undefined) {
    return (leftOrder ?? Number.MAX_SAFE_INTEGER) - (rightOrder ?? Number.MAX_SAFE_INTEGER);
  }
  return compareText(left, right);
}

export function sortMealOptions(meals) {
  return [...meals].sort((left, right) => {
    const typeDifference = compareMealTypes(left.meal_type, right.meal_type);
    if (typeDifference !== 0) return typeDifference;

    const orderDifference = (left.option_order ?? 1) - (right.option_order ?? 1);
    if (orderDifference !== 0) return orderDifference;

    const createdDifference = compareText(left.created_at ?? '', right.created_at ?? '');
    if (createdDifference !== 0) return createdDifference;

    return compareText(left.id, right.id);
  });
}

export function groupMealOptions(meals) {
  const groups = Object.create(null);
  for (const meal of sortMealOptions(meals)) {
    (groups[meal.meal_type] ??= []).push(meal);
  }
  return groups;
}

export function applyExclusiveSelection(meals, id) {
  const target = meals.find((meal) => meal.id === id);
  if (!target) return [...meals];

  const shouldSelect = !target.is_completed;
  return meals.map((meal) => meal.meal_type === target.meal_type
    ? { ...meal, is_completed: meal.id === id && shouldSelect }
    : meal);
}

export function reconcileMealSelection(meals, id, response) {
  const target = meals.find(meal => meal.id === id);
  if (!target || !Array.isArray(response)) return null;
  const groupIds = new Set(meals.filter(meal => meal.meal_type === target.meal_type).map(meal => meal.id));
  if (response.length !== groupIds.size) return null;
  const statuses = new Map();
  let selectedCount = 0;
  for (const row of response) {
    if (!row || typeof row.id !== 'string' || !groupIds.has(row.id)
      || row.meal_type !== target.meal_type || typeof row.is_completed !== 'boolean'
      || statuses.has(row.id)) return null;
    statuses.set(row.id, row.is_completed);
    if (row.is_completed) selectedCount += 1;
  }
  if (selectedCount > 1) return null;
  return meals.map(meal => statuses.has(meal.id)
    ? { ...meal, is_completed: statuses.get(meal.id) }
    : meal);
}
