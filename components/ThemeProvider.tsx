'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { deriveFeatureCapabilities, normalizeFeatureRows } from '@/lib/feature-permissions.js';
import {
  createThemeSaveGuard,
  normalizeTheme,
  type AppTheme,
} from '@/lib/theme-preferences.js';
import { supabase } from '@/lib/supabase';

type ThemeContextValue = {
  theme: AppTheme;
  loading: boolean;
  saving: boolean;
  error: string | null;
  setTheme: (theme: AppTheme) => Promise<void>;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyTheme(theme: AppTheme) {
  document.documentElement.dataset.theme = theme;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<AppTheme>('alba');
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
        themeRef.current = 'alba';
        persistedThemeRef.current = 'alba';
        applyTheme('alba');
        setThemeState('alba');
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
        themeRef.current = 'alba';
        persistedThemeRef.current = 'alba';
        applyTheme('alba');
        setThemeState('alba');
        setLoading(false);
        return;
      }

      const { data: preference, error: preferenceError } = await supabase
        .from('user_preferences')
        .select('theme')
        .eq('user_id', session.user.id)
        .maybeSingle();
      if (!active || generation !== loadGenerationRef.current) return;

      const nextTheme = preferenceError ? 'alba' : normalizeTheme(preference?.theme);
      themeRef.current = nextTheme;
      persistedThemeRef.current = nextTheme;
      applyTheme(nextTheme);
      setThemeState(nextTheme);
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
    if (!userId || !canChangeTheme || nextTheme === themeRef.current) return;
    const request = saveGuardRef.current.next(nextTheme);
    themeRef.current = nextTheme;
    applyTheme(nextTheme);
    setThemeState(nextTheme);
    setSaving(true);
    setError(null);

    let saveError: unknown = null;
    const queuedSave = saveQueueRef.current.then(async () => {
      if (!saveGuardRef.current.isCurrent(request)) return;
      const result = await supabase
        .from('user_preferences')
        .upsert({ user_id: userId, theme: nextTheme }, { onConflict: 'user_id' });
      saveError = result.error;
      if (!result.error) persistedThemeRef.current = nextTheme;
    });
    saveQueueRef.current = queuedSave;
    await queuedSave;
    if (!saveGuardRef.current.isCurrent(request)) return;

    setSaving(false);
    if (saveError) {
      const persistedTheme = persistedThemeRef.current;
      themeRef.current = persistedTheme;
      applyTheme(persistedTheme);
      setThemeState(persistedTheme);
      setError('No se pudo guardar el tema. Se ha restaurado la opción anterior.');
    }
  }

  return (
    <ThemeContext.Provider value={{ theme, loading, saving, error, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme debe usarse dentro de ThemeProvider');
  return value;
}
