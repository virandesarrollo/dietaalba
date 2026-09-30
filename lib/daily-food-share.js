import { sortMealOptions } from './meal-options.js';

const madridTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

function kcalSuffix(item, includeCalories) {
  return includeCalories && item.kcal != null ? ` (${item.kcal} kcal)` : '';
}

function logLines(logs, includeCalories) {
  return logs.map((log) => `- ${madridTime.format(new Date(log.recorded_at))}: ${log.text}${kcalSuffix(log, includeCalories)}`);
}

export function formatDailyFoodShare({ date, meals, snacks, nightBingeLogs, includeCalories = false }) {
  const [year, month, day] = date.split('-');
  const sections = [`Comido el ${day}/${month}/${year}`];
  const completedMeals = sortMealOptions(meals).filter((meal) => meal.is_completed);

  if (completedMeals.length) {
    sections.push(`Comidas:\n${completedMeals.map((meal) => `- ${meal.meal_type}: ${meal.title}${kcalSuffix(meal, includeCalories)}`).join('\n')}`);
  }
  if (snacks.length) sections.push(`Picoteos:\n${logLines(snacks, includeCalories).join('\n')}`);
  if (nightBingeLogs.length) sections.push(`Control nocturno:\n${logLines(nightBingeLogs, includeCalories).join('\n')}`);
  if (sections.length === 1) sections.push('No hay comida registrada.');

  return sections.join('\n\n');
}
