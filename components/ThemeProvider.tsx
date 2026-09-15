'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { deriveFeatureCapabilities, normalizeFeatureRows } from '@/lib/feature-permissions.js';
import {
  COLOR_KEYS,
  createThemeSaveGuard,
  getThemePalette,
  normalizeCustomColors,
  normalizeTheme,
  validateColorPalette,
  type AppTheme,
  type ThemePalette,
} from '@/lib/theme-preferences.js';
import { supabase } from '@/lib/supabase';

type ThemeContextValue = {
  theme: AppTheme;
  loading: boolean;
  saving: boolean;
  error: string | null;
  colors: ThemePalette;
  setTheme: (theme: AppTheme) => Promise<void>;
  setColors: (colors: ThemePalette) => Promise<void>;
  resetColors: () => Promise<void>;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const CSS_COLOR_VARIABLES: Record<(typeof COLOR_KEYS)[number], string> = {
  background: '--app-bg',
  surface: '--app-surface',
  surfaceSoft: '--app-surface-soft',
  text: '--app-text',
  heading: '--app-heading',
  muted: '--app-muted',
  border: '--app-border',
  accent: '--app-accent',
};

function applyTheme(theme: AppTheme, colors: ThemePalette = getThemePalette(theme), custom = false) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.customColors = custom ? 'true' : 'false';
  for (const key of COLOR_KEYS) {
    document.documentElement.style.setProperty(CSS_COLOR_VARIABLES[key], colors[key]);
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<AppTheme>('alba');
  const [colors, setColorsState] = useState<ThemePalette>(() => getThemePalette('alba'));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [canChangeTheme, setCanChangeTheme] = useState(false);
  const loadGenerationRef = useRef(0);
  const saveGuardRef = useRef(createThemeSaveGuard());
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const themeRef = useRef<AppTheme>('alba');
  const persistedThemeRef = useRef<AppTheme>('alba');
  const colorsRef = useRef<ThemePalette>(getThemePalette('alba'));
  const persistedColorsRef = useRef<ThemePalette>(getThemePalette('alba'));
  const customColorsRef = useRef(false);
  const persistedCustomColorsRef = useRef(false);

  useEffect(() => {
    let active = true;
    const saveGuard = saveGuardRef.current;

    async function loadForSession(session: Session | null) {
      loadGenerationRef.current += 1;
      const generation = loadGenerationRef.current;
      saveGuard.invalidate();
      setSaving(false);
      setError(null);
      setUserId(session?.user.id ?? null);

      if (!session) {
        const albaColors = getThemePalette('alba');
        themeRef.current = 'alba';
        persistedThemeRef.current = 'alba';
        colorsRef.current = albaColors;
        persistedColorsRef.current = albaColors;
        customColorsRef.current = false;
        persistedCustomColorsRef.current = false;
        applyTheme('alba', albaColors, false);
        setThemeState('alba');
        setColorsState(albaColors);
        setCanChangeTheme(false);
        setLoading(false);
        return;
      }

      setLoading(true);
      const { data: featureRows, error: featuresError } = await supabase.rpc('get_my_features');
      if (!active || generation !== loadGenerationRef.current) return;
      const capabilities = featuresError
        ? deriveFeatureCapabilities([])
        : deriveFeatureCapabilities(normalizeFeatureRows(featureRows));
      setCanChangeTheme(capabilities.canChangeTheme);

      if (!capabilities.canAccessSettings) {
        const albaColors = getThemePalette('alba');
        themeRef.current = 'alba';
        persistedThemeRef.current = 'alba';
        colorsRef.current = albaColors;
        persistedColorsRef.current = albaColors;
        customColorsRef.current = false;
        persistedCustomColorsRef.current = false;
        applyTheme('alba', albaColors, false);
        setThemeState('alba');
        setColorsState(albaColors);
        setLoading(false);
        return;
      }

      const { data: preference, error: preferenceError } = await supabase
        .from('user_preferences')
        .select('theme, custom_colors')
        .eq('user_id', session.user.id)
        .maybeSingle();
      if (!active || generation !== loadGenerationRef.current) return;

      const nextTheme = preferenceError ? 'alba' : normalizeTheme(preference?.theme);
      const customColors = preferenceError ? null : normalizeCustomColors(preference?.custom_colors);
      const nextColors = customColors && validateColorPalette(customColors).ok
        ? customColors
        : getThemePalette(nextTheme);
      const hasCustomColors = Boolean(customColors && validateColorPalette(customColors).ok);
      themeRef.current = nextTheme;
      persistedThemeRef.current = nextTheme;
      colorsRef.current = nextColors;
      persistedColorsRef.current = nextColors;
      customColorsRef.current = hasCustomColors;
      persistedCustomColorsRef.current = hasCustomColors;
      applyTheme(nextTheme, nextColors, hasCustomColors);
      setThemeState(nextTheme);
      setColorsState(nextColors);
      setError(preferenceError ? 'No se pudo cargar tu tema. Se ha aplicado Tema Alba.' : null);
      setLoading(false);
    }

    void supabase.auth.getSession().then(({ data }) => loadForSession(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      void loadForSession(session);
    });

    return () => {
      active = false;
      loadGenerationRef.current += 1;
      saveGuard.invalidate();
      subscription.unsubscribe();
    };
  }, []);

  async function setTheme(nextTheme: AppTheme) {
    if (!userId || !canChangeTheme) return;
    const request = saveGuardRef.current.next(nextTheme);
    const nextColors = getThemePalette(nextTheme);
    themeRef.current = nextTheme;
    colorsRef.current = nextColors;
    customColorsRef.current = false;
    applyTheme(nextTheme, nextColors, false);
    setThemeState(nextTheme);
    setColorsState(nextColors);
    setSaving(true);
    setError(null);

    let saveError: unknown = null;
    const queuedSave = saveQueueRef.current.then(async () => {
      if (!saveGuardRef.current.isCurrent(request)) return;
      const result = await supabase
        .from('user_preferences')
        .upsert({ user_id: userId, theme: nextTheme, custom_colors: null }, { onConflict: 'user_id' });
      saveError = result.error;
      if (!result.error) {
        persistedThemeRef.current = nextTheme;
        persistedColorsRef.current = nextColors;
        persistedCustomColorsRef.current = false;
      }
    });
    saveQueueRef.current = queuedSave;
    await queuedSave;
    if (!saveGuardRef.current.isCurrent(request)) return;

    setSaving(false);
    if (saveError) {
      const persistedTheme = persistedThemeRef.current;
      const persistedColors = persistedColorsRef.current;
      themeRef.current = persistedTheme;
      colorsRef.current = persistedColors;
      customColorsRef.current = persistedCustomColorsRef.current;
      applyTheme(persistedTheme, persistedColors, persistedCustomColorsRef.current);
      setThemeState(persistedTheme);
      setColorsState(persistedColors);
      setError('No se pudo guardar el tema. Se ha restaurado la opción anterior.');
    }
  }

  async function setColors(nextColors: ThemePalette) {
    if (!userId || !canChangeTheme || !validateColorPalette(nextColors).ok) return;
    const request = saveGuardRef.current.next(themeRef.current);
    colorsRef.current = nextColors;
    customColorsRef.current = true;
    applyTheme(themeRef.current, nextColors, true);
    setColorsState(nextColors);
    setSaving(true);
    setError(null);

    let saveError: unknown = null;
    const queuedSave = saveQueueRef.current.then(async () => {
      if (!saveGuardRef.current.isCurrent(request)) return;
      const result = await supabase.from('user_preferences').upsert({
        user_id: userId,
        theme: themeRef.current,
        custom_colors: nextColors,
      }, { onConflict: 'user_id' });
      saveError = result.error;
      if (!result.error) {
        persistedColorsRef.current = nextColors;
        persistedCustomColorsRef.current = true;
      }
    });
    saveQueueRef.current = queuedSave;
    await queuedSave;
    if (!saveGuardRef.current.isCurrent(request)) return;

    setSaving(false);
    if (saveError) {
      const persistedColors = persistedColorsRef.current;
      colorsRef.current = persistedColors;
      customColorsRef.current = persistedCustomColorsRef.current;
      applyTheme(themeRef.current, persistedColors, persistedCustomColorsRef.current);
      setColorsState(persistedColors);
      setError('No se pudieron guardar los colores. Se ha restaurado la paleta anterior.');
    }
  }

  async function resetColors() {
    await setTheme(themeRef.current);
  }

  return (
    <ThemeContext.Provider value={{ theme, colors, loading, saving, error, setTheme, setColors, resetColors }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme debe usarse dentro de ThemeProvider');
  return value;
}
