export type AppTheme = 'alba' | 'dark';
export const COLOR_KEYS: readonly ['background', 'surface', 'surfaceSoft', 'text', 'heading', 'muted', 'border', 'accent'];
export type ThemeColorKey = (typeof COLOR_KEYS)[number];
export type ThemePalette = Record<ThemeColorKey, string>;

export function normalizeTheme(value: unknown): AppTheme;
export function getThemePalette(theme: unknown): ThemePalette;
export function normalizeCustomColors(value: unknown): ThemePalette | null;
export function validateColorPalette(value: unknown): { ok: boolean; error: string | null };

export type ThemeSaveRequest = { id: number; theme: AppTheme };

export type ThemeSaveGuard = {
  next(theme: AppTheme): ThemeSaveRequest;
  isCurrent(request: ThemeSaveRequest): boolean;
  invalidate(): void;
};

export function createThemeSaveGuard(): ThemeSaveGuard;
