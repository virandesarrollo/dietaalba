export function filterGymSubstitutesByGroup<T extends { code: string; group_id: string }>(
  catalog: readonly T[], groupId: string, exerciseCode?: string | null,
): T[];

export function getGymSubstitute<T extends { code: string; is_active: boolean; substitute_code?: string | null }>(
  catalog: readonly T[], exerciseCode: string, selectedCodes: readonly string[],
): T | null;
