export function getGymSubstitute<T extends { code: string; is_active: boolean; substitute_code?: string | null }>(
  catalog: readonly T[], exerciseCode: string, selectedCodes: readonly string[],
): T | null;
