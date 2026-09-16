export type GymGroup = {
  id: string;
  code: string;
  name: string;
  sort_order: number;
  is_active: boolean;
};

export type GymExercise = {
  code: string;
  name: string;
  group_id: string;
  is_active: boolean;
};

export type GymCatalogGroup = GymGroup & { exercises: GymExercise[] };
export type RemoteListResponse = { data?: unknown; error?: unknown } | null | undefined;
export type ValidationResult = { valid: boolean; value: string; error: string | null };
export type FormValidation<T> = { valid: boolean; values: T; errors: Partial<Record<keyof T, string>> };

export function normalizeGymGroups(response: RemoteListResponse): GymGroup[];
export function normalizeGymExercises(response: RemoteListResponse): GymExercise[];
export function partitionByActive<T extends { is_active?: unknown }>(
  items: readonly T[] | null | undefined,
): { active: T[]; inactive: T[] };
export function buildGymCatalog(
  groupResponse: RemoteListResponse,
  exerciseResponse: RemoteListResponse,
  options?: { showInactive?: boolean },
): GymCatalogGroup[];
export function validateGymName(value: unknown): ValidationResult;
export function validateGymGroupForm(form: unknown): FormValidation<{ name: string }>;
export function validateGymExerciseForm(
  form: unknown,
  validGroupIds: ReadonlySet<string> | readonly string[] | null | undefined,
): FormValidation<{ name: string; groupId: string }>;
