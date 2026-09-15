import type { MealType, Weekday, WeeklyPlan } from './diet-import.js';

export type ImportWarning = { code: string; message: string; url?: string };
export type ImportResult = {
  plan: WeeklyPlan | null;
  warnings: ImportWarning[];
  errors: Record<string, string>;
};

export function stripJsonFence(text: string): string;
export function normalizeWeekday(value: unknown): Weekday | null;
export function normalizeMealType(value: unknown): MealType | null;
export function parseImportedJson(text: string): ImportResult;
export function parseTabularText(text: string): ImportResult;
export function buildExternalAiPrompt(): string;
