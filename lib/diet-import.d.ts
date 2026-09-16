export const WEEKDAYS: readonly ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
export type Weekday = (typeof WEEKDAYS)[number];
export type MealType = string;

export type ImportedMealOption = { title: string; ingredients: string; recipe_url: string };
export type ImportedMealGroup = {
  meal_type: MealType;
  options: ImportedMealOption[];
};
export type LegacyImportedMeal = ImportedMealOption & { meal_type: MealType | string };
export type ImportedMealInput = ImportedMealGroup | LegacyImportedMeal;
export type ImportedMeal = ImportedMealGroup;
export type WeeklyPlan = Record<Weekday, ImportedMealGroup[]>;
export type LegacyWeeklyPlan = Record<Weekday, LegacyImportedMeal[]>;
export type WeeklyPlanInput = Record<string, ImportedMealInput[] | Record<string, ImportedMealInput>>;
export type ValidationResult =
  | { ok: true; errors: Record<string, never> }
  | { ok: false; errors: Record<string, string> };
export type ExpandedMeal = ImportedMealOption & {
  meal_type: MealType;
  meal_order: number;
  option_order: number;
  is_completed: false;
};
export type ExpandedPlanDay = { date: string; weekday: Weekday; meals: ExpandedMeal[] };

export function localDateString(date?: Date): string;
export function getImportEndDate(startDate: string): string;
export function emptyWeeklyPlan(): WeeklyPlan;
export function validateWeeklyPlan(plan: unknown): ValidationResult;
export function expandWeeklyPlan(plan: WeeklyPlan, startDate: string): ExpandedPlanDay[];
export function stablePlanJson(plan: WeeklyPlan | LegacyWeeklyPlan): string;
export function sha256Hex(value: string): Promise<string>;
