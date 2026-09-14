export type AppTheme = 'alba' | 'dark';

export function normalizeTheme(value: unknown): AppTheme;

export type ThemeSaveRequest = { id: number; theme: AppTheme };

export type ThemeSaveGuard = {
  next(theme: AppTheme): ThemeSaveRequest;
  isCurrent(request: ThemeSaveRequest): boolean;
  invalidate(): void;
};

export function createThemeSaveGuard(): ThemeSaveGuard;
