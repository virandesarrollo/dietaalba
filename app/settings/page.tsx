'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Moon, Palette, Sun } from 'lucide-react';
import { ViewNavigation } from '@/components/ViewNavigation';
import { useTheme } from '@/components/ThemeProvider';
import { deriveFeatureCapabilities, normalizeFeatureRows } from '@/lib/feature-permissions.js';
import { supabase } from '@/lib/supabase';

export default function SettingsPage() {
  const router = useRouter();
  const { theme, saving, error, setTheme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [canAccessSettings, setCanAccessSettings] = useState(false);
  const [canChangeTheme, setCanChangeTheme] = useState(false);

  useEffect(() => {
    let active = true;
    async function checkAccess() {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        router.replace('/');
        return;
      }

      const { data, error: featuresError } = await supabase.rpc('get_my_features');
      if (!active) return;
      const capabilities = featuresError
        ? deriveFeatureCapabilities([])
        : deriveFeatureCapabilities(normalizeFeatureRows(data));
      if (!capabilities.canAccessSettings) {
        router.replace('/');
        return;
      }
      setCanAccessSettings(capabilities.canAccessSettings);
      setCanChangeTheme(capabilities.canChangeTheme);
      setLoading(false);
    }
    void checkAccess();
    return () => { active = false; };
  }, [router]);

  if (loading || !canAccessSettings) {
    return <main className="theme-page flex min-h-screen items-center justify-center text-sm theme-muted">Cargando ajustes…</main>;
  }

  return (
    <main className="theme-page min-h-screen px-4 py-7 sm:px-8">
      <div className="mx-auto max-w-4xl">
        <header className="mb-7 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-rose-400">Preferencias personales</p>
            <h1 className="mt-1 text-3xl font-bold text-slate-800">Ajustes</h1>
          </div>
          <ViewNavigation current="settings" />
        </header>

        {!canChangeTheme ? (
          <section className="theme-surface rounded-3xl p-7 shadow-sm">
            <p className="theme-muted text-sm">No tienes ajustes disponibles.</p>
          </section>
        ) : (
          <section className="theme-surface rounded-3xl p-5 shadow-sm sm:p-7">
            <div className="mb-6 flex items-center gap-3">
              <span className="rounded-2xl bg-rose-50 p-3 text-rose-400"><Palette size={20} /></span>
              <div>
                <h2 className="font-bold text-slate-800">Tema de la aplicación</h2>
                <p className="theme-muted mt-1 text-xs">El cambio se aplica y guarda automáticamente.</p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {([
                { value: 'alba' as const, label: 'Tema Alba', description: 'Claro, cálido y con tonos pastel.', icon: Sun },
                { value: 'dark' as const, label: 'Tema Oscuro', description: 'Fondos oscuros y contraste suave.', icon: Moon },
              ]).map((option) => {
                const selected = theme === option.value;
                const Icon = option.icon;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => void setTheme(option.value)}
                    disabled={saving}
                    aria-pressed={selected}
                    className={`theme-border relative flex items-start gap-4 rounded-3xl border-2 p-5 text-left transition disabled:opacity-60 ${selected ? 'border-rose-400 ring-2 ring-rose-200' : ''}`}
                  >
                    <span className="theme-surface rounded-2xl p-3 shadow-sm"><Icon size={22} /></span>
                    <span>
                      <span className="block font-bold text-slate-800">{option.label}</span>
                      <span className="theme-muted mt-1 block text-xs leading-5">{option.description}</span>
                    </span>
                    {selected && <Check className="absolute right-4 top-4 text-rose-400" size={18} />}
                  </button>
                );
              })}
            </div>

            {saving && <p className="theme-muted mt-4 text-xs" role="status">Guardando…</p>}
            {error && <p className="mt-4 text-sm text-red-500" role="alert">{error}</p>}
          </section>
        )}
      </div>
    </main>
  );
}
