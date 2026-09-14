import { MEAL_TYPES, WEEKDAYS, emptyWeeklyPlan, validateWeeklyPlan } from './diet-import.js';

const DAY_ALIASES = new Map([
  ['lunes', 'monday'], ['martes', 'tuesday'], ['miercoles', 'wednesday'],
  ['jueves', 'thursday'], ['viernes', 'friday'], ['sabado', 'saturday'], ['domingo', 'sunday'],
]);

const MEAL_ALIASES = new Map([
  ['desayuno', 'DESAYUNO'],
  ['media manana', 'MEDIA MAÑANA'],
  ['almuerzo', 'ALMUERZO'], ['comida', 'ALMUERZO'],
  ['merienda', 'MERIENDA'], ['cena', 'CENA'],
  ['postre nocturno', 'POSTRE NOCTURNO'],
]);

function folded(value) {
  return typeof value === 'string'
    ? value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ')
    : '';
}

export function stripJsonFence(text) {
  if (typeof text !== 'string') return text;
  const match = text.match(/^\s*```json[ \t]*\r?\n([\s\S]*?)\r?\n```\s*$/i);
  return match ? match[1] : text;
}

export function normalizeWeekday(value) {
  const normalized = folded(value);
  if (WEEKDAYS.includes(normalized)) return normalized;
  return DAY_ALIASES.get(normalized) ?? null;
}

export function normalizeMealType(value) {
  const normalized = folded(value);
  const canonical = MEAL_TYPES.find((mealType) => folded(mealType) === normalized);
  return canonical ?? MEAL_ALIASES.get(normalized) ?? null;
}

function resultFromPlan(plan, warnings = []) {
  const validation = validateWeeklyPlan(plan);
  return validation.ok
    ? { plan, warnings, errors: {} }
    : { plan: null, warnings, errors: validation.errors };
}

function normalizeMeal(meal, fallbackType) {
  if (!meal || typeof meal !== 'object' || Array.isArray(meal)) return meal;
  const mealType = normalizeMealType(meal.meal_type ?? fallbackType);
  return {
    ...meal,
    meal_type: mealType ?? meal.meal_type ?? fallbackType,
    recipe_url: normalizeMarkdownUrl(meal.recipe_url),
  };
}

function normalizeMarkdownUrl(value) {
  if (typeof value !== 'string') return value;
  const match = value.trim().match(/^\[([^\]]+)\]\((.+)\)$/s);
  if (!match) return value;
  const label = match[1].trim();
  const target = match[2].trim();
  return label === target ? target : value;
}

function normalizePlan(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { plan: value, errors: {} };
  const plan = {};
  const errors = {};
  for (const [dayName, sourceMeals] of Object.entries(value)) {
    const weekday = normalizeWeekday(dayName) ?? dayName;
    if (Object.hasOwn(plan, weekday)) {
      errors['_normalize.day-collision'] = `Los días "${dayName}" y otro alias representan ${weekday}`;
      continue;
    }
    plan[weekday] = Array.isArray(sourceMeals)
      ? sourceMeals.map((meal) => normalizeMeal(meal))
      : sourceMeals && typeof sourceMeals === 'object'
        ? Object.entries(sourceMeals).map(([mealType, meal]) => normalizeMeal(meal, mealType))
        : sourceMeals;
  }
  return { plan, errors };
}

export function parseImportedJson(text) {
  let parsed;
  try {
    parsed = JSON.parse(stripJsonFence(text));
  } catch {
    return { plan: null, warnings: [], errors: { '_json.parse': 'El contenido no es JSON válido' } };
  }
  const normalized = normalizePlan(parsed);
  if (Object.keys(normalized.errors).length > 0) {
    return { plan: null, warnings: [], errors: normalized.errors };
  }
  return resultFromPlan(normalized.plan);
}

const URL_PATTERN = /https?:\/\/[^\s|]+/giu;

function urlsIn(value) {
  return (value.match(URL_PATTERN) ?? []).map((rawUrl) => {
    let url = rawUrl.replace(/[.,;]+$/g, '');
    const opening = (url.match(/\(/g) ?? []).length;
    let closing = (url.match(/\)/g) ?? []).length;
    while (url.endsWith(')') && closing > opening) {
      url = url.slice(0, -1);
      closing -= 1;
    }
    return url;
  });
}

function withoutUrls(value) {
  return value.replace(URL_PATTERN, '').replace(/\(\s*\)/g, '').replace(/\(\s*$/g, '').replace(/\s+[.,;]+$/g, '').trim();
}

function cellMeal(cell, mealType) {
  const urls = urlsIn(cell);
  const recipeUrl = urls.length === 1 ? urls[0] : '';
  const title = withoutUrls(cell);
  return { meal_type: mealType, title, ingredients: '', recipe_url: recipeUrl };
}

function splitTableRow(line, semicolonMatrix) {
  let cells;
  if (!semicolonMatrix && !line.includes('\t') && !line.includes('|') && line.includes(';')) {
    const separatorCount = (line.match(/;/g) ?? []).length;
    const fields = separatorCount === 2 ? 3 : 5;
    cells = [];
    let start = 0;
    for (let index = 1; index < fields; index += 1) {
      const separator = line.indexOf(';', start);
      cells.push(line.slice(start, separator));
      start = separator + 1;
    }
    cells.push(line.slice(start));
  } else {
    cells = line.split(/\t|\s*;\s*|\s*\|\s*/);
  }
  if (line.trimStart().startsWith('|')) cells.shift();
  if (line.trimEnd().endsWith('|')) cells.pop();
  return cells.map((cell) => cell.trim());
}

export function parseTabularText(text) {
  const warnings = [];
  const errors = {};
  const plan = emptyWeeklyPlan();
  const assigned = new Set();
  const assignedUrls = [];
  const lines = typeof text === 'string' ? text.split(/\r?\n/).filter((line) => line.trim()) : [];
  const semicolonHeader = lines[0]?.split(';').map((cell) => cell.trim()) ?? [];
  const semicolonMatrix = !lines[0]?.includes('\t') && !lines[0]?.includes('|')
    && semicolonHeader.slice(1).some((cell) => normalizeWeekday(cell));
  if (semicolonMatrix && lines.slice(1).some((line) => /https?:\/\/\S*;/iu.test(line))) {
    return {
      plan: null,
      warnings,
      errors: { '_table.ambiguous-semicolon': 'Una URL hace ambigua esta matriz separada por punto y coma' },
    };
  }
  const ambiguousRow = !semicolonMatrix && lines.some((line) => {
    if (line.includes('\t') || line.includes('|') || (line.match(/;/g) ?? []).length !== 3) return false;
    const [day, meal] = line.split(';', 2);
    return normalizeWeekday(day) && normalizeMealType(meal);
  });
  if (ambiguousRow) {
    return {
      plan: null,
      warnings,
      errors: { '_table.ambiguous-semicolon': 'La fila debe tener 2 separadores o al menos 4' },
    };
  }
  const rows = lines.map((line) => splitTableRow(line, semicolonMatrix));

  function assign(weekday, mealType, meal) {
    const key = `${weekday}:${mealType}`;
    if (assigned.has(key)) {
      errors[`_table.duplicate.${weekday}.${mealType}`] = 'Asignación repetida para el mismo día y comida';
      return;
    }
    plan[weekday][MEAL_TYPES.indexOf(mealType)] = meal;
    assigned.add(key);
    if (meal.recipe_url) assignedUrls.push(meal.recipe_url);
  }

  // Row format: day, meal, title, ingredients, URL.
  for (const cells of rows) {
    const weekday = normalizeWeekday(cells[0]);
    const mealType = normalizeMealType(cells[1]);
    if (!weekday || !mealType) continue;
    const cellUrls = cells.flatMap(urlsIn);
    const recipeUrl = cellUrls.length === 1 ? cellUrls[0] : '';
    assign(weekday, mealType, {
      meal_type: mealType,
      title: withoutUrls(cells[2] ?? ''),
      ingredients: withoutUrls(cells[3] ?? ''),
      recipe_url: recipeUrl,
    });
  }

  // Matrix format: first row contains weekdays; first column contains meal types.
  if (rows.length > 1) {
    const dayColumns = rows[0].map((cell, index) => [index, normalizeWeekday(cell)]).filter(([, day]) => day);
    for (const cells of rows.slice(1)) {
      const mealType = normalizeMealType(cells[0]);
      if (!mealType) continue;
      for (const [column, weekday] of dayColumns) {
        assign(weekday, mealType, cellMeal(cells[column] ?? '', mealType));
      }
    }
  }

  const allUrls = typeof text === 'string' ? urlsIn(text) : [];
  const remainingAssigned = new Map();
  for (const url of assignedUrls) remainingAssigned.set(url, (remainingAssigned.get(url) ?? 0) + 1);
  for (const url of allUrls) {
    const remaining = remainingAssigned.get(url) ?? 0;
    if (remaining > 0) remainingAssigned.set(url, remaining - 1);
    else warnings.push({ code: 'unassigned-url', url, message: 'URL sin relación inequívoca con una comida' });
  }

  if (assigned.size === 0) {
    return { plan: null, warnings, errors: { '_table.structure': 'No se reconocieron filas o columnas de días y comidas' } };
  }
  if (Object.keys(errors).length > 0) return { plan: null, warnings, errors };
  return resultFromPlan(plan, warnings);
}

export function buildExternalAiPrompt(sourceText) {
  return `Convierte el contenido siguiente en JSON estricto. Debe contener exactamente 7 días (monday a sunday) y exactamente 6 comidas por día: ${MEAL_TYPES.join(', ')}. Cada comida tendrá únicamente meal_type, title, ingredients y recipe_url, todos como texto. En recipe_url escribe una URL directa http/https, sin sintaxis Markdown; usa cadena vacía cuando no exista. Responde solo JSON, sin Markdown. No inventes datos ni URLs. Protege la privacidad: no incluyas datos personales innecesarios ni información ajena a la dieta.\n\nContenido:\n${String(sourceText ?? '')}`;
}
