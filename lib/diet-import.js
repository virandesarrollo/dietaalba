import { MAX_MEAL_OPTIONS } from './meal-options.js';

export const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

const MADRID_DATE_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
});

export function localDateString(date = new Date()) {
  const parts = Object.fromEntries(MADRID_DATE_FORMAT.formatToParts(date)
    .filter(({ type }) => type !== 'literal')
    .map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function parseLocalDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new TypeError('La fecha debe usar el formato YYYY-MM-DD');
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) throw new RangeError('La fecha no es válida');
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

const emptyOption = () => ({ title: '', ingredients: '', recipe_url: '' });

export function emptyWeeklyPlan() {
  return Object.fromEntries(WEEKDAYS.map((weekday) => [weekday, []]));
}

const HTTP_DNS_URL_PATTERN = /^https?:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*(?:[/?#][^\s\u0000-\u001f\u007f]*)?$/iu;

function isHttpUrl(value) {
  return HTTP_DNS_URL_PATTERN.test(value);
}

function validateText(errors, key, value, maxLength) {
  if (typeof value !== 'string') errors[key] = 'El valor debe ser texto';
  else if (value.length > maxLength) errors[key] = `El valor supera ${maxLength} caracteres`;
}

export function validateWeeklyPlan(plan) {
  const errors = {};
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) return { ok: false, errors: { '_plan.structure': 'La plantilla debe ser un objeto' } };
  for (const key of Object.keys(plan)) if (!WEEKDAYS.includes(key)) errors[`${key}._day.unknown`] = 'Día no reconocido';
  for (const weekday of WEEKDAYS) {
    const groups = plan[weekday];
    if (!Array.isArray(groups)) {
      errors[`${weekday}._day.required`] = 'Falta el día o su lista de comidas';
      continue;
    }
    // An empty day represents a day off: it imports no meals.
    const seen = new Set();
    for (const [groupIndex, group] of groups.entries()) {
      if (!group || typeof group !== 'object' || Array.isArray(group)) {
        errors[`${weekday}.${groupIndex}.meal`] = 'La comida debe ser un objeto';
        continue;
      }
      const mealType = group.meal_type;
      const errorMeal = typeof mealType === 'string' ? mealType : String(groupIndex);
      if (typeof mealType !== 'string') errors[`${weekday}.${errorMeal}.meal_type`] = 'El tipo de comida debe ser texto';
      else {
        const normalizedMealType = mealType.trim();
        if (normalizedMealType.length < 1 || normalizedMealType.length > 200) errors[`${weekday}.${errorMeal}.meal_type`] = 'El tipo de comida debe contener entre 1 y 200 caracteres';
        else {
          const mealTypeKey = normalizedMealType.toLocaleUpperCase('es-ES');
          if (seen.has(mealTypeKey)) errors[`${weekday}.${errorMeal}.meal_type`] = 'Tipo de comida repetido';
          else seen.add(mealTypeKey);
        }
      }
      for (const field of Object.keys(group)) {
        if (!['meal_type', 'options'].includes(field)) errors[`${weekday}.${errorMeal}.${field}`] = 'Propiedad no reconocida';
      }
      if (!Array.isArray(group.options) || group.options.length < 1 || group.options.length > MAX_MEAL_OPTIONS) {
        errors[`${weekday}.${errorMeal}.options`] = `Debe contener entre 1 y ${MAX_MEAL_OPTIONS} opciones`;
        continue;
      }
      for (const [optionIndex, option] of group.options.entries()) {
        const prefix = `${weekday}.${errorMeal}.options.${optionIndex}`;
        if (!option || typeof option !== 'object' || Array.isArray(option)) {
          errors[prefix] = 'La opción debe ser un objeto';
          continue;
        }
        for (const field of Object.keys(option)) {
          if (!['title', 'ingredients', 'recipe_url'].includes(field)) errors[`${prefix}.${field}`] = 'Propiedad no reconocida';
        }
        validateText(errors, `${prefix}.title`, option.title, 200);
        validateText(errors, `${prefix}.ingredients`, option.ingredients, 5000);
        validateText(errors, `${prefix}.recipe_url`, option.recipe_url, 2048);
        if (typeof option.recipe_url === 'string' && option.recipe_url.trim() !== '' && !isHttpUrl(option.recipe_url.trim())) errors[`${prefix}.recipe_url`] = 'La URL debe usar http o https';
      }
    }
  }
  return { ok: Object.keys(errors).length === 0, errors };
}

export function expandWeeklyPlan(plan, startDate) {
  if (!validateWeeklyPlan(plan).ok) throw new TypeError('La plantilla semanal no es válida');
  const date = parseLocalDate(startDate);
  const endDate = getImportEndDate(startDate);
  const days = [];
  while (localDateString(date) <= endDate) {
    const weekday = WEEKDAYS[(date.getDay() + 6) % 7];
    days.push({
      date: localDateString(date), weekday,
      meals: plan[weekday].flatMap((group, groupIndex) => {
        return group.options.map((option, index) => ({ meal_type: group.meal_type, ...option, meal_order: groupIndex + 1, option_order: index + 1, is_completed: false }));
      }),
    });
    date.setDate(date.getDate() + 1);
  }
  return days;
}

function canonicalOptions(group) {
  if (Array.isArray(group?.options)) return group.options;
  if (group && typeof group === 'object') return [{ title: group.title ?? '', ingredients: group.ingredients ?? '', recipe_url: group.recipe_url ?? '' }];
  return [emptyOption()];
}

export function stablePlanJson(plan) {
  return JSON.stringify(Object.fromEntries(WEEKDAYS.map((weekday) => [
    weekday,
    (Array.isArray(plan?.[weekday]) ? plan[weekday] : []).map((group) => {
      return {
        meal_type: group?.meal_type ?? '',
        options: canonicalOptions(group).map((option) => ({
          title: option?.title ?? '', ingredients: option?.ingredients ?? '',
          recipe_url: typeof option?.recipe_url === 'string' ? option.recipe_url.trim() : (option?.recipe_url ?? ''),
        })),
      };
    }),
  ])));
}

export async function sha256Hex(value) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
