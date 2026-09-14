export const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

export const MEAL_TYPES = ['DESAYUNO', 'MEDIA MAÑANA', 'ALMUERZO', 'MERIENDA', 'CENA', 'POSTRE NOCTURNO'];

export function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseLocalDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new TypeError('La fecha debe usar el formato YYYY-MM-DD');
  }
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw new RangeError('La fecha no es válida');
  }
  return date;
}

export function getImportEndDate(startDate) {
  const start = parseLocalDate(startDate);
  const targetMonth = start.getMonth() + 3;
  const lastTargetDay = new Date(start.getFullYear(), targetMonth + 1, 0).getDate();
  const end = new Date(start.getFullYear(), targetMonth, Math.min(start.getDate(), lastTargetDay));
  end.setDate(end.getDate() - 1);
  return localDateString(end);
}

export function emptyWeeklyPlan() {
  return Object.fromEntries(WEEKDAYS.map((weekday) => [
    weekday,
    MEAL_TYPES.map((mealType) => ({
      meal_type: mealType,
      title: '',
      ingredients: '',
      recipe_url: '',
    })),
  ]));
}

export function validateWeeklyPlan(plan) {
  const errors = {};
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) {
    return { ok: false, errors: { '_plan.structure': 'La plantilla debe ser un objeto' } };
  }

  for (const key of Object.keys(plan)) {
    if (!WEEKDAYS.includes(key)) errors[`${key}._day.unknown`] = 'Día no reconocido';
  }

  for (const weekday of WEEKDAYS) {
    const meals = plan[weekday];
    if (!Array.isArray(meals)) {
      errors[`${weekday}._day.required`] = 'Falta el día o su lista de comidas';
      continue;
    }

    const seen = new Set();
    for (const [index, meal] of meals.entries()) {
      if (!meal || typeof meal !== 'object' || Array.isArray(meal)) {
        errors[`${weekday}.${index}.meal`] = 'La comida debe ser un objeto';
        continue;
      }
      const mealType = meal.meal_type;
      const errorMeal = typeof mealType === 'string' ? mealType : String(index);
      if (!MEAL_TYPES.includes(mealType)) {
        errors[`${weekday}.${errorMeal}.meal_type`] = 'Tipo de comida no válido';
      } else if (seen.has(mealType)) {
        errors[`${weekday}.${mealType}.meal_type`] = 'Tipo de comida repetido';
      } else {
        seen.add(mealType);
      }

      for (const field of Object.keys(meal)) {
        if (!['meal_type', 'title', 'ingredients', 'recipe_url'].includes(field)) {
          errors[`${weekday}.${errorMeal}.${field}`] = 'Propiedad no reconocida';
        }
      }

      validateText(errors, weekday, errorMeal, 'title', meal.title, 200);
      validateText(errors, weekday, errorMeal, 'ingredients', meal.ingredients, 5000);
      validateText(errors, weekday, errorMeal, 'recipe_url', meal.recipe_url, Infinity);
      if (typeof meal.recipe_url === 'string' && meal.recipe_url.trim() !== '' && !isHttpUrl(meal.recipe_url.trim())) {
        errors[`${weekday}.${errorMeal}.recipe_url`] = 'La URL debe usar http o https';
      }
    }

    for (const mealType of MEAL_TYPES) {
      if (!seen.has(mealType)) errors[`${weekday}.${mealType}.meal_type`] ??= 'Falta este tipo de comida';
    }
  }

  return { ok: Object.keys(errors).length === 0, errors };
}

function isHttpUrl(value) {
  if (/\s|[\u0000-\u001f\u007f]/u.test(value)) return false;
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname !== '';
  } catch {
    return false;
  }
}

function validateText(errors, weekday, mealType, field, value, maxLength) {
  const key = `${weekday}.${mealType}.${field}`;
  if (typeof value !== 'string') errors[key] = 'El valor debe ser texto';
  else if (value.length > maxLength) errors[key] = `El valor supera ${maxLength} caracteres`;
}

export function expandWeeklyPlan(plan, startDate) {
  const validation = validateWeeklyPlan(plan);
  if (!validation.ok) throw new TypeError('La plantilla semanal no es válida');

  const date = parseLocalDate(startDate);
  const endDate = getImportEndDate(startDate);
  const days = [];
  while (localDateString(date) <= endDate) {
    const weekday = WEEKDAYS[(date.getDay() + 6) % 7];
    days.push({
      date: localDateString(date),
      weekday,
      meals: MEAL_TYPES.map((mealType) => {
        const meal = plan[weekday].find((candidate) => candidate.meal_type === mealType);
        return { ...meal, is_completed: false };
      }),
    });
    date.setDate(date.getDate() + 1);
  }
  return days;
}

export function stablePlanJson(plan) {
  const canonical = Object.fromEntries(WEEKDAYS.map((weekday) => [
    weekday,
    MEAL_TYPES.map((mealType) => {
      const meal = Array.isArray(plan?.[weekday])
        ? plan[weekday].find((candidate) => candidate?.meal_type === mealType)
        : undefined;
      return {
        meal_type: mealType,
        title: meal?.title ?? '',
        ingredients: meal?.ingredients ?? '',
        recipe_url: typeof meal?.recipe_url === 'string' ? meal.recipe_url.trim() : (meal?.recipe_url ?? ''),
      };
    }),
  ]));
  return JSON.stringify(canonical);
}

export async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
