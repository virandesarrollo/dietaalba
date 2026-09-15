'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, Moon, Palette, Sparkles, Sun } from 'lucide-react';
import { useTheme } from '@/components/ThemeProvider';
import { deriveFeatureCapabilities, normalizeFeatureRows } from '@/lib/feature-permissions.js';
import { validateColorPalette, type ThemeColorKey } from '@/lib/theme-preferences.js';
import { supabase } from '@/lib/supabase';

const COLOR_OPTIONS: Array<{ key: ThemeColorKey; label: string }> = [
  { key: 'background', label: 'Fondo de la aplicación' },
  { key: 'surface', label: 'Tarjetas y paneles' },
  { key: 'surfaceSoft', label: 'Fondos secundarios' },
  { key: 'text', label: 'Texto general' },
  { key: 'heading', label: 'Títulos' },
  { key: 'muted', label: 'Texto secundario' },
  { key: 'border', label: 'Bordes' },
  { key: 'accent', label: 'Botones y destacados' },
];

export default function SettingsPage() {
  const router = useRouter();
  const { theme, colors, saving, error, setTheme, setColors, resetColors } = useTheme();
  const [colorEdits, setColorEdits] = useState<Partial<typeof colors>>({});
  const [loading, setLoading] = useState(true);
  const [canAccessSettings, setCanAccessSettings] = useState(false);
  const [canChangeTheme, setCanChangeTheme] = useState(false);
  const draftColors = { ...colors, ...colorEdits };
  const colorValidation = validateColorPalette(draftColors);
  const colorsChanged = JSON.stringify(draftColors) !== JSON.stringify(colors);

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
    <main className="theme-page min-h-screen max-w-md mx-auto pb-10 font-sans">
      <header className="rounded-b-[2.5rem] border-b border-pink-100/50 bg-gradient-to-br from-pink-100 via-purple-100 to-blue-100 px-6 pb-7 pt-8 shadow-sm">
        <button
          type="button"
          onClick={() => router.push('/')}
          className="mb-6 flex items-center gap-2 rounded-full bg-white/70 px-3 py-2 text-xs font-semibold text-pink-500 shadow-sm transition hover:bg-white"
          aria-label="Volver a mi dieta"
        >
          <ArrowLeft size={16} /> Mi dieta
        </button>
        <div className="flex items-center gap-2 text-pink-500">
          <Sparkles size={18} />
          <p className="text-xs font-semibold uppercase tracking-widest">Preferencias personales</p>
        </div>
        <h1 className="mt-2 text-3xl font-bold text-slate-800">Ajustes</h1>
        <p className="theme-muted mt-2 text-sm">Personaliza tu experiencia en Dieta Alba.</p>
      </header>

      <div className="px-5 pt-7">

        {!canChangeTheme ? (
          <section className="theme-surface rounded-3xl p-7 shadow-sm">
            <p className="theme-muted text-sm">No tienes ajustes disponibles.</p>
          </section>
        ) : (
          <div className="space-y-5">
          <section className="theme-surface rounded-3xl p-5 shadow-sm">
            <div className="mb-6 flex items-center gap-3">
              <span className="rounded-2xl bg-rose-50 p-3 text-rose-400"><Palette size={20} /></span>
              <div>
                <h2 className="font-bold text-slate-800">Tema de la aplicación</h2>
                <p className="theme-muted mt-1 text-xs">El cambio se aplica y guarda automáticamente.</p>
              </div>
            </div>

            <div className="grid gap-4">
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
                    onClick={() => { setColorEdits({}); void setTheme(option.value); }}
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

          <section className="theme-surface rounded-3xl p-5 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <span className="rounded-2xl bg-rose-50 p-3 text-rose-400"><Palette size={20} /></span>
              <div>
                <h2 className="font-bold text-slate-800">Colores personalizados</h2>
                <p className="theme-muted mt-1 text-xs">Elige una paleta completa y guárdala cuando esté lista.</p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {COLOR_OPTIONS.map((option) => (
                <label key={option.key} className="theme-border flex items-center justify-between gap-3 rounded-2xl border p-3 text-xs font-semibold">
                  <span>{option.label}</span>
                  <span className="flex items-center gap-2 font-mono">
                    {draftColors[option.key]}
                    <input
                      type="color"
                      aria-label={option.label}
                      value={draftColors[option.key]}
                      disabled={saving}
                      onChange={(event) => setColorEdits((current) => ({ ...current, [option.key]: event.target.value }))}
                      className="h-9 w-11 cursor-pointer rounded-lg border-0 bg-transparent p-0 disabled:cursor-not-allowed"
                    />
                  </span>
                </label>
              ))}
            </div>

            {!colorValidation.ok && <p className="mt-4 text-sm text-red-500" role="alert">{colorValidation.error}</p>}
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                disabled={saving || !colorsChanged || !colorValidation.ok}
                onClick={() => { void setColors(draftColors).then(() => setColorEdits({})); }}
                className="rounded-xl bg-rose-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                Guardar colores
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => { setColorEdits({}); void resetColors(); }}
                className="theme-border rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-40"
              >
                Restaurar colores del tema
              </button>
            </div>
          </section>
          </div>
        )}
      </div>
    </main>
  );
}
