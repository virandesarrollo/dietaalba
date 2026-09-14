export const WEEKDAYS: readonly ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
export type Weekday = (typeof WEEKDAYS)[number];

export const MEAL_TYPES: readonly ['DESAYUNO', 'MEDIA MAÑANA', 'ALMUERZO', 'MERIENDA', 'CENA', 'POSTRE NOCTURNO'];
export type MealType = (typeof MEAL_TYPES)[number];

export type ImportedMeal = {
  meal_type: MealType;
  title: string;
  ingredients: string;
  recipe_url: string;
};

export type WeeklyPlan = Record<Weekday, ImportedMeal[]>;

export type ValidationResult =
  | { ok: true; errors: Record<string, never> }
  | { ok: false; errors: Record<string, string> };

export type ExpandedMeal = ImportedMeal & { is_completed: false };
export type ExpandedPlanDay = { date: string; weekday: Weekday; meals: ExpandedMeal[] };

export function localDateString(date?: Date): string;
export function getImportEndDate(startDate: string): string;
export function emptyWeeklyPlan(): WeeklyPlan;
export function validateWeeklyPlan(plan: unknown): ValidationResult;
export function expandWeeklyPlan(plan: WeeklyPlan, startDate: string): ExpandedPlanDay[];
export function stablePlanJson(plan: WeeklyPlan): string;
export function sha256Hex(value: string): Promise<string>;
