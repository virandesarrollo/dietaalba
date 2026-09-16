import { MAX_MEAL_OPTIONS } from './meal-options.js';
import { WEEKDAYS, emptyWeeklyPlan, validateWeeklyPlan } from './diet-import.js';

const DAY_ALIASES = new Map([
  ['lunes', 'monday'], ['martes', 'tuesday'], ['miercoles', 'wednesday'], ['jueves', 'thursday'],
  ['viernes', 'friday'], ['sabado', 'saturday'], ['domingo', 'sunday'],
]);
const MEAL_ALIASES = new Map([
  ['desayuno', 'DESAYUNO'], ['media manana', 'MEDIA MAÑANA'], ['almuerzo', 'ALMUERZO'],
  ['comida', 'ALMUERZO'], ['merienda', 'MERIENDA'], ['cena', 'CENA'], ['postre nocturno', 'POSTRE NOCTURNO'],
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
  return WEEKDAYS.includes(normalized) ? normalized : (DAY_ALIASES.get(normalized) ?? null);
}

export function normalizeMealType(value) {
  const normalized = folded(value);
  if (!normalized) return null;
  return MEAL_ALIASES.get(normalized) ?? value.trim();
}

function normalizeMarkdownUrl(value) {
  if (typeof value !== 'string') return value;
  const match = value.trim().match(/^\[([^\]]+)\]\((.+)\)$/s);
  if (!match) return value;
  return match[1].trim() === match[2].trim() ? match[2].trim() : value;
}

function normalizeOption(option) {
  if (!option || typeof option !== 'object' || Array.isArray(option)) return option;
  return { ...option, recipe_url: normalizeMarkdownUrl(option.recipe_url) };
}

function normalizeMeal(meal, fallbackType) {
  if (!meal || typeof meal !== 'object' || Array.isArray(meal)) return meal;
  const mealType = normalizeMealType(meal.meal_type ?? fallbackType);
  if (Object.hasOwn(meal, 'options')) {
    return {
      ...meal,
      meal_type: mealType ?? meal.meal_type ?? fallbackType,
      options: Array.isArray(meal.options) ? meal.options.map(normalizeOption) : meal.options,
    };
  }
  const { title, ingredients, recipe_url, ...rest } = meal;
  const normalizedRecipeUrl = normalizeMarkdownUrl(recipe_url);
  const splitIngredients = typeof ingredients === 'string' ? splitCellOptions(ingredients) : null;
  if (splitIngredients && !splitIngredients.error
    && splitIngredients.segments.every(({ number }, index) => number === index + 1)) {
    return {
      ...rest,
      meal_type: mealType ?? meal.meal_type ?? fallbackType,
      options: splitIngredients.segments.map(({ option }) => ({
        title,
        ingredients: option.title,
        recipe_url: normalizedRecipeUrl,
      })),
    };
  }
  return {
    ...rest,
    meal_type: mealType ?? meal.meal_type ?? fallbackType,
    options: [{ title, ingredients, recipe_url: normalizedRecipeUrl }],
  };
}

function normalizePlan(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { plan: value, errors: {} };
  const plan = Object.create(null);
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

function resultFromPlan(plan, warnings = []) {
  const validation = validateWeeklyPlan(plan);
  return validation.ok ? { plan, warnings, errors: {} } : { plan: null, warnings, errors: validation.errors };
}

export function parseImportedJson(text) {
  let parsed;
  try { parsed = JSON.parse(stripJsonFence(text)); }
  catch { return { plan: null, warnings: [], errors: { '_json.parse': 'El contenido no es JSON válido' } }; }
  const normalized = normalizePlan(parsed);
  if (Object.keys(normalized.errors).length > 0) return { plan: null, warnings: [], errors: normalized.errors };
  return resultFromPlan(normalized.plan);
}

const URL_PATTERN = /https?:\/\/[^\s|]+/giu;
function urlsIn(value) {
  return (value.match(URL_PATTERN) ?? []).map((rawUrl) => {
    let url = rawUrl.replace(/[.,;]+$/g, '');
    const opening = (url.match(/\(/g) ?? []).length;
    let closing = (url.match(/\)/g) ?? []).length;
    while (url.endsWith(')') && closing > opening) { url = url.slice(0, -1); closing -= 1; }
    return url;
  });
}
function withoutUrls(value) {
  return value.replace(URL_PATTERN, '').replace(/\(\s*\)/g, '').replace(/\(\s*$/g, '').replace(/\s+[.,;]+$/g, '').trim();
}
function splitTableRow(line, semicolonMatrix) {
  let cells;
  if (!semicolonMatrix && !line.includes('\t') && !line.includes('|') && line.includes(';')) {
    const fields = (line.match(/;/g) ?? []).length === 2 ? 3 : 5;
    cells = [];
    let start = 0;
    for (let index = 1; index < fields; index += 1) {
      const separator = line.indexOf(';', start);
      cells.push(line.slice(start, separator));
      start = separator + 1;
    }
    cells.push(line.slice(start));
  } else cells = line.split(/\t|\s*;\s*|\s*\|\s*/);
  if (line.trimStart().startsWith('|')) cells.shift();
  if (line.trimEnd().endsWith('|')) cells.pop();
  return cells.map((cell) => cell.trim());
}

const OPTION_PREFIX = /^\s*opci[oó]n\s+(\d+)(?:\s*[:.)-]\s*|\s+|$)(.*)$/iu;
const OPTION_MARKER = /opci[oó]n\s+(\d+)(?:\s*[:.)-]\s*|\s+|(?=$))/giu;

function trimOptionBoundary(value) {
  return value.trim().replace(/^[\s,;:.()\-]+|[\s,;:.()\-]+$/gu, '').trim();
}

function splitCellOptions(value) {
  const matches = [...value.matchAll(OPTION_MARKER)];
  if (matches.length < 2) return null;
  if (trimOptionBoundary(value.slice(0, matches[0].index)) !== '') return { error: true, segments: [] };
  const segments = [];
  for (const [index, match] of matches.entries()) {
    const start = match.index + match[0].length;
    const end = matches[index + 1]?.index ?? value.length;
    const content = value.slice(start, end);
    const urls = urlsIn(content);
    if (urls.length > 1) return { error: true, segments: [] };
    segments.push({
      number: Number(match[1]),
      option: {
        title: trimOptionBoundary(withoutUrls(content)),
        ingredients: '',
        recipe_url: urls[0] ?? '',
      },
    });
  }
  return { error: false, segments };
}

export function parseTabularText(text) {
  const warnings = [];
  const errors = {};
  const plan = emptyWeeklyPlan();
  const assignments = new Map();
  const assignedUrls = [];
  const lines = typeof text === 'string' ? text.split(/\r?\n/).filter((line) => line.trim()) : [];
  const semicolonHeader = lines[0]?.split(';').map((cell) => cell.trim()) ?? [];
  const semicolonMatrix = !lines[0]?.includes('\t') && !lines[0]?.includes('|') && semicolonHeader.slice(1).some((cell) => normalizeWeekday(cell));
  if (semicolonMatrix && lines.slice(1).some((line) => /https?:\/\/\S*;/iu.test(line))) {
    return { plan: null, warnings, errors: { '_table.ambiguous-semicolon': 'Una URL hace ambigua esta matriz separada por punto y coma' } };
  }
  const ambiguousRow = !semicolonMatrix && lines.some((line) => {
    if (line.includes('\t') || line.includes('|') || (line.match(/;/g) ?? []).length !== 3) return false;
    const [day, meal] = line.split(';', 2);
    return normalizeWeekday(day) && normalizeMealType(meal);
  });
  if (ambiguousRow) return { plan: null, warnings, errors: { '_table.ambiguous-semicolon': 'La fila debe tener 2 separadores o al menos 4' } };
  const rows = lines.map((line) => splitTableRow(line, semicolonMatrix));

  function assign(weekday, mealType, rawOption, explicitNumber = null) {
    const key = `${weekday}\u0000${mealType}`;
    const state = assignments.get(key) ?? { options: [], explicit: false, implicit: false, numbers: new Set() };
    if (explicitNumber === null) state.implicit = true;
    else {
      state.explicit = true;
      if (state.numbers.has(explicitNumber)) errors[`_table.options.${weekday}.${mealType}.duplicate`] = 'Número de opción repetido';
      state.numbers.add(explicitNumber);
    }
    if (state.explicit && state.implicit) errors[`_table.options.${weekday}.${mealType}.ambiguous`] = 'No se pueden mezclar opciones numeradas y sin numerar';
    state.options.push({ option: rawOption, number: explicitNumber });
    if (state.options.length > MAX_MEAL_OPTIONS || explicitNumber > MAX_MEAL_OPTIONS) errors[`_table.options.${weekday}.${mealType}.excess`] = `Máximo ${MAX_MEAL_OPTIONS} opciones`;
    assignments.set(key, state);
    if (rawOption.recipe_url) assignedUrls.push(rawOption.recipe_url);
  }

  for (const cells of rows) {
    const weekday = normalizeWeekday(cells[0]);
    const mealType = normalizeMealType(cells[1]);
    if (!weekday || !mealType) continue;
    const splitOptions = splitCellOptions(cells[2] ?? '');
    const multipleMarkersOutsideTitle = cells.slice(3).some((cell) => splitCellOptions(cell) !== null);
    if (splitOptions || multipleMarkersOutsideTitle) {
      const hasAmbiguousColumns = cells.slice(3).some((cell) => cell.trim() !== '');
      if (!splitOptions || splitOptions.error || hasAmbiguousColumns) {
        errors[`_table.options.${weekday}.${mealType}.ambiguous`] = 'No se pueden asociar inequívocamente los segmentos de opciones';
      } else {
        for (const segment of splitOptions.segments) assign(weekday, mealType, segment.option, segment.number);
      }
      continue;
    }
    const cellUrls = cells.flatMap(urlsIn);
    const title = withoutUrls(cells[2] ?? '');
    const prefix = title.match(OPTION_PREFIX);
    assign(weekday, mealType, {
      title: prefix ? prefix[2].trim() : title,
      ingredients: withoutUrls(cells[3] ?? ''),
      recipe_url: cellUrls.length === 1 ? cellUrls[0] : '',
    }, prefix ? Number(prefix[1]) : null);
  }

  if (rows.length > 1) {
    const dayColumns = rows[0].map((cell, index) => [index, normalizeWeekday(cell)]).filter(([, day]) => day);
    const seenDays = new Set();
    for (const [, weekday] of dayColumns) {
      if (seenDays.has(weekday)) {
        for (const mealType of new Set(rows.slice(1).map((row) => normalizeMealType(row[0])).filter(Boolean))) {
          errors[`_table.options.${weekday}.${mealType}.ambiguous`] = 'Columna de día repetida';
        }
      }
      seenDays.add(weekday);
    }
    for (const cells of rows.slice(1)) {
      const mealType = normalizeMealType(cells[0]);
      if (!mealType || /^https?:\/\//iu.test(mealType)) continue;
      for (const [column, weekday] of dayColumns) {
        const cell = cells[column] ?? '';
        if (cell.trim() === '') continue;
        const splitOptions = splitCellOptions(cell);
        if (splitOptions) {
          if (splitOptions.error) errors[`_table.options.${weekday}.${mealType}.ambiguous`] = 'No se pueden asociar inequívocamente los segmentos de opciones';
          else for (const segment of splitOptions.segments) assign(weekday, mealType, segment.option, segment.number);
          continue;
        }
        const cellUrls = urlsIn(cell);
        const title = withoutUrls(cell);
        const prefix = title.match(OPTION_PREFIX);
        assign(weekday, mealType, {
          title: prefix ? prefix[2].trim() : title,
          ingredients: '',
          recipe_url: cellUrls.length === 1 ? cellUrls[0] : '',
        }, prefix ? Number(prefix[1]) : null);
      }
    }
  }

  for (const [key, state] of assignments) {
    const [weekday, mealType] = key.split('\u0000');
    if (state.explicit) {
      const numbers = [...state.numbers].sort((a, b) => a - b);
      if (numbers.some((number, index) => number !== index + 1)) errors[`_table.options.${weekday}.${mealType}.gap`] = 'La numeración debe ser consecutiva desde 1';
      state.options.sort((left, right) => left.number - right.number);
    }
    plan[weekday].push({ meal_type: mealType, options: state.options.map(({ option }) => option) });
  }

  const remainingAssigned = new Map();
  for (const url of assignedUrls) remainingAssigned.set(url, (remainingAssigned.get(url) ?? 0) + 1);
  for (const url of (typeof text === 'string' ? urlsIn(text) : [])) {
    const remaining = remainingAssigned.get(url) ?? 0;
    if (remaining > 0) remainingAssigned.set(url, remaining - 1);
    else warnings.push({ code: 'unassigned-url', url, message: 'URL sin relación inequívoca con una comida' });
  }
  if (assignments.size === 0) return { plan: null, warnings, errors: { '_table.structure': 'No se reconocieron filas o columnas de días y comidas' } };
  if (Object.keys(errors).length > 0) return { plan: null, warnings, errors };
  return resultFromPlan(plan, warnings);
}

export function buildExternalAiPrompt() {
  return `Analiza el PDF adjunto y conviértelo en JSON estricto. Debe contener exactamente 7 días (monday a sunday) y al menos 1 grupo por día. Detecta e incluye todos los grupos de comida presentes en el documento, conservando su orden. Cada grupo tendrá únicamente meal_type y options. options contendrá entre 1 y ${MAX_MEAL_OPTIONS} alternativas en orden, cada una únicamente con title, ingredients y recipe_url como texto. Interpreta las etiquetas “Opción N” como el orden de cada alternativa. Conserva los hipervínculos del PDF y asigna una URL directa http/https a recipe_url en su alternativa; usa cadena vacía cuando no exista y nunca null. Responde solo JSON, sin Markdown. No inventes datos ni URLs. Protege la privacidad: no incluyas nombres ni datos personales innecesarios.`;
}
