export function getGymSubstitute(catalog, exerciseCode, selectedCodes) {
  const code = catalog.find((exercise) => exercise.code === exerciseCode)?.substitute_code;
  if (!code || code === exerciseCode || selectedCodes.includes(code)) return null;
  return catalog.find((exercise) => exercise.code === code && exercise.is_active) ?? null;
}
