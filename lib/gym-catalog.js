const REQUIRED_NAME_ERROR = 'El nombre es obligatorio';
const REQUIRED_GROUP_ERROR = 'El grupo es obligatorio';
const INVALID_GROUP_ERROR = 'El grupo no es válido';

function cleanString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isSuccessfulListResponse(response) {
  return response !== null
    && typeof response === 'object'
    && !Array.isArray(response)
    && Object.hasOwn(response, 'error')
    && response.error === null
    && Array.isArray(response.data);
}

function compareNames(left, right) {
  const baseComparison = left.name.localeCompare(right.name, 'es', { sensitivity: 'base' });
  if (baseComparison !== 0) return baseComparison;

  const exactComparison = left.name.localeCompare(right.name, 'es', { sensitivity: 'variant' });
  if (exactComparison !== 0) return exactComparison;

  const leftKey = cleanString(left.code) || cleanString(left.id);
  const rightKey = cleanString(right.code) || cleanString(right.id);
  return leftKey.localeCompare(rightKey, 'es', { sensitivity: 'variant' });
}

function containsGroupId(validGroupIds, groupId) {
  try {
    if (Array.isArray(validGroupIds)) return validGroupIds.includes(groupId);
    return validGroupIds !== null
      && (typeof validGroupIds === 'object' || typeof validGroupIds === 'function')
      && typeof validGroupIds.has === 'function'
      && validGroupIds.has(groupId) === true;
  } catch {
    return false;
  }
}

export function normalizeGymGroups(response) {
  if (!isSuccessfulListResponse(response)) return [];

  const ids = new Set();
  const codes = new Set();
  const groups = [];

  for (const row of response.data) {
    if (row === null || typeof row !== 'object' || Array.isArray(row)) continue;
    const id = cleanString(row.id);
    const code = cleanString(row.code);
    const name = cleanString(row.name);
    const sortOrder = row.sort_order;
    if (!id || !code || !name || !Number.isInteger(sortOrder) || typeof row.is_active !== 'boolean') continue;
    if (ids.has(id) || codes.has(code)) continue;
    ids.add(id);
    codes.add(code);
    groups.push({ id, code, name, sort_order: sortOrder, is_active: row.is_active });
  }

  return groups.sort((left, right) => left.sort_order - right.sort_order || compareNames(left, right));
}

export function normalizeGymExercises(response) {
  if (!isSuccessfulListResponse(response)) return [];

  const codes = new Set();
  const exercises = [];

  for (const row of response.data) {
    if (row === null || typeof row !== 'object' || Array.isArray(row)) continue;
    const code = cleanString(row.code);
    const name = cleanString(row.name);
    const groupId = cleanString(row.group_id);
    if (!code || !name || !groupId || typeof row.is_active !== 'boolean' || codes.has(code)) continue;
    codes.add(code);
    exercises.push({ code, name, group_id: groupId, is_active: row.is_active });
  }

  return exercises.sort(compareNames);
}

export function partitionByActive(items) {
  const result = { active: [], inactive: [] };
  if (!Array.isArray(items)) return result;

  for (const item of items) {
    if (item?.is_active === true) result.active.push(item);
    if (item?.is_active === false) result.inactive.push(item);
  }
  return result;
}

export function buildGymCatalog(groupResponse, exerciseResponse, options = {}) {
  if (!isSuccessfulListResponse(groupResponse) || !isSuccessfulListResponse(exerciseResponse)) return [];

  const showInactive = options?.showInactive === true;
  const groups = normalizeGymGroups(groupResponse);
  const exercises = normalizeGymExercises(exerciseResponse);
  const visibleGroups = showInactive ? groups : partitionByActive(groups).active;

  return visibleGroups.map((group) => ({
    ...group,
    exercises: exercises.filter((exercise) => (
      exercise.group_id === group.id && (showInactive || exercise.is_active)
    )),
  }));
}

export function validateGymName(value) {
  const name = cleanString(value);
  return name
    ? { valid: true, value: name, error: null }
    : { valid: false, value: '', error: REQUIRED_NAME_ERROR };
}

export function validateGymGroupForm(form) {
  const name = validateGymName(form?.name);
  return {
    valid: name.valid,
    values: { name: name.value },
    errors: name.valid ? {} : { name: name.error },
  };
}

export function validateGymExerciseForm(form, validGroupIds) {
  const name = validateGymName(form?.name);
  const groupId = cleanString(form?.groupId);
  const errors = {};
  if (!name.valid) errors.name = name.error;
  if (!groupId) errors.groupId = REQUIRED_GROUP_ERROR;
  else if (!containsGroupId(validGroupIds, groupId)) errors.groupId = INVALID_GROUP_ERROR;

  return {
    valid: Object.keys(errors).length === 0,
    values: { name: name.value, groupId },
    errors,
  };
}
