'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, LogOut, Moon, Palette, Sparkles, Sun } from 'lucide-react';
import { useTheme } from '@/components/ThemeProvider';
import { AppMobileNavigation } from '@/components/AppMobileNavigation';
import { deriveAppViews, deriveAvailableViews, deriveCapabilities, type RoleCode } from '@/lib/authz.js';
import { deriveFeatureCapabilities, normalizeFeatureRows } from '@/lib/feature-permissions.js';
import { validateColorPalette, type ThemeColorKey } from '@/lib/theme-preferences.js';
import { supabase } from '@/lib/supabase';
import { advanceAuthIdentity } from '@/lib/view-capabilities-guard.js';

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
  const [canTrackGymWorkouts, setCanTrackGymWorkouts] = useState(false);
  const [canManageGymWorkouts, setCanManageGymWorkouts] = useState(false);
  const [navigationRoles, setNavigationRoles] = useState<RoleCode[]>([]);
  const [gymWeightStep, setGymWeightStep] = useState('1');
  const [savingGymStep, setSavingGymStep] = useState(false);
  const [gymStepMessage, setGymStepMessage] = useState<string | null>(null);
  const [waterGoalMl, setWaterGoalMl] = useState('2000');
  const [waterGlassMl, setWaterGlassMl] = useState('250');
  const [waterMessage, setWaterMessage] = useState<string | null>(null);
  const authGenerationRef = useRef(0);
  const currentUserIdRef = useRef<string | null>(null);
  const authInitializedRef = useRef(false);
  const requestGenerationRef = useRef(0);
  const draftColors = { ...colors, ...colorEdits };
  const colorValidation = validateColorPalette(draftColors);
  const colorsChanged = JSON.stringify(draftColors) !== JSON.stringify(colors);
  const appNavigationViews = deriveAppViews(deriveAvailableViews(deriveCapabilities(false, navigationRoles), { canAccessSettings, canTrackGymWorkouts, canManageGymWorkouts }));

  useEffect(() => {
    let active = true;
    let receivedAuthEvent = false;
    const clearIdentityState = () => {
      setCanAccessSettings(false); setCanChangeTheme(false); setCanTrackGymWorkouts(false); setCanManageGymWorkouts(false);
      setNavigationRoles([]); setColorEdits({}); setGymWeightStep('1'); setGymStepMessage(null); setSavingGymStep(false);
    };
    async function checkAccess(generation: number, userId: string, requestGeneration: number) {
      const isCurrent = () => active && generation === authGenerationRef.current && userId === currentUserIdRef.current && requestGeneration === requestGenerationRef.current;
      try {

      const [featuresResult, membershipResult] = await Promise.all([
        supabase.rpc('get_my_features'),
        supabase.from('group_memberships').select('user_roles(role_code)').eq('user_id', userId).eq('status', 'active').maybeSingle(),
      ]);
      const { data, error: featuresError } = featuresResult;
      if (!isCurrent()) return;
      const capabilities = featuresError
        ? deriveFeatureCapabilities([])
        : deriveFeatureCapabilities(normalizeFeatureRows(data));
      if (!capabilities.canAccessSettings) {
        router.replace('/');
        return;
      }
      setCanAccessSettings(capabilities.canAccessSettings);
      setCanChangeTheme(capabilities.canChangeTheme);
      setCanTrackGymWorkouts(capabilities.canTrackGymWorkouts);
      setCanManageGymWorkouts(capabilities.canManageGymWorkouts);
      const membership = membershipResult.data as { user_roles?: Array<{ role_code?: RoleCode }> } | null;
      setNavigationRoles(membershipResult.error ? [] : (membership?.user_roles ?? []).flatMap((row) => row.role_code ? [row.role_code] : []));
      if (capabilities.canTrackGymWorkouts) {
        const { data: step } = await supabase.rpc('get_my_gym_weight_step');
        if (isCurrent() && typeof step === 'number' && step > 0) setGymWeightStep(String(step));
      }
      const { data: water } = await supabase.rpc('get_my_water_preferences');
      if (isCurrent() && Array.isArray(water) && water[0]) { setWaterGoalMl(String(water[0].goal_ml)); setWaterGlassMl(String(water[0].glass_ml)); }
      } catch { if (isCurrent()) router.replace('/'); }
      finally { if (isCurrent()) setLoading(false); }
    }
    const applySession = (userId: string | null) => {
      const transition = advanceAuthIdentity({ initialized: authInitializedRef.current, generation: authGenerationRef.current, userId: currentUserIdRef.current }, userId);
      if (!transition.changed) return;
      authInitializedRef.current = transition.state.initialized; authGenerationRef.current = transition.state.generation; currentUserIdRef.current = transition.state.userId;
      const requestGeneration = ++requestGenerationRef.current; clearIdentityState(); setLoading(Boolean(userId));
      if (userId) void checkAccess(transition.state.generation, userId, requestGeneration); else router.replace('/');
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => { receivedAuthEvent = true; applySession(session?.user.id ?? null); });
    supabase.auth.getSession().then(({ data }) => { if (active && !receivedAuthEvent) applySession(data.session?.user.id ?? null); }).catch(() => { if (active && !receivedAuthEvent) applySession(null); });
    return () => { active = false; authGenerationRef.current += 1; currentUserIdRef.current = null; requestGenerationRef.current += 1; subscription.unsubscribe(); };
  }, [router]);

  async function saveGymWeightStep() {
    const step = Number(gymWeightStep);
    if (!Number.isFinite(step) || step <= 0 || step > 100) {
      setGymStepMessage('Indica un valor entre 0,01 y 100 kg.');
      return;
    }
    setSavingGymStep(true);
    const generation = authGenerationRef.current;
    const userId = currentUserIdRef.current;
    try {
      const { error: stepError } = await supabase.rpc('set_my_gym_weight_step', { p_step: step });
      if (generation === authGenerationRef.current && userId !== null && userId === currentUserIdRef.current) setGymStepMessage(stepError ? 'No se pudo guardar el incremento.' : 'Incremento guardado.');
    } catch {
      if (generation === authGenerationRef.current && userId !== null && userId === currentUserIdRef.current) setGymStepMessage('No se pudo guardar el incremento.');
    } finally {
      if (generation === authGenerationRef.current && userId !== null && userId === currentUserIdRef.current) setSavingGymStep(false);
    }
  }

  async function saveWaterPreferences() {
    const goal = Number(waterGoalMl); const glass = Number(waterGlassMl);
    if (!Number.isInteger(goal) || !Number.isInteger(glass) || goal < 250 || glass < 50) { setWaterMessage('Indica valores válidos.'); return; }
    const { error: waterError } = await supabase.rpc('set_my_water_preferences', { p_goal_ml: goal, p_glass_ml: glass });
    setWaterMessage(waterError ? 'No se pudo guardar el agua.' : 'Preferencias de agua guardadas.');
  }

  async function changeTheme(nextTheme: 'alba' | 'dark') {
    const generation = authGenerationRef.current;
    const userId = currentUserIdRef.current;
    try {
      await setTheme(nextTheme);
      if (generation === authGenerationRef.current && userId !== null && userId === currentUserIdRef.current) setColorEdits({});
    } catch { /* ThemeProvider exposes the actionable error. */ }
  }

  async function saveColors() {
    const generation = authGenerationRef.current;
    const userId = currentUserIdRef.current;
    try {
      await setColors(draftColors);
      if (generation === authGenerationRef.current && userId !== null && userId === currentUserIdRef.current) setColorEdits({});
    } catch { /* ThemeProvider exposes the actionable error. */ }
  }

  async function restoreColors() {
    const generation = authGenerationRef.current;
    const userId = currentUserIdRef.current;
    try {
      await resetColors();
      if (generation === authGenerationRef.current && userId !== null && userId === currentUserIdRef.current) setColorEdits({});
    } catch { /* ThemeProvider exposes the actionable error. */ }
  }

  async function logout() {
    await supabase.auth.signOut();
  }

  if (loading || !canAccessSettings) {
    return <main className="theme-page flex min-h-screen items-center justify-center text-sm theme-muted">Cargando ajustes…</main>;
  }

  return (
    <main className="theme-page min-h-screen max-w-md mx-auto pb-28 font-sans">
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

        <button type="button" onClick={() => void logout()} className="mb-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-rose-200 text-sm font-semibold text-rose-600"><LogOut size={17} />Salir</button>
        <section className="theme-surface mb-5 rounded-3xl p-5 shadow-sm"><h2 className="font-bold text-slate-800">Agua diaria</h2><p className="theme-muted mt-1 text-xs">Configura el objetivo y el tamaño de cada vaso.</p><div className="mt-4 grid grid-cols-2 gap-3"><label className="text-xs font-semibold">Objetivo (ml)<input type="number" min="250" value={waterGoalMl} onChange={(event) => setWaterGoalMl(event.target.value)} className="mt-2 min-h-12 w-full rounded-2xl border px-3" /></label><label className="text-xs font-semibold">Vaso (ml)<input type="number" min="50" value={waterGlassMl} onChange={(event) => setWaterGlassMl(event.target.value)} className="mt-2 min-h-12 w-full rounded-2xl border px-3" /></label></div><button type="button" onClick={() => void saveWaterPreferences()} className="mt-4 min-h-12 rounded-2xl bg-cyan-500 px-5 font-semibold text-white">Guardar agua</button>{waterMessage && <p className="mt-2 text-xs" role="status">{waterMessage}</p>}</section>

        {canTrackGymWorkouts && (
          <section className="theme-surface mb-5 rounded-3xl p-5 shadow-sm">
            <h2 className="font-bold text-slate-800">Incremento de peso</h2>
            <p className="theme-muted mt-1 text-xs">Cantidad que suman o restan los botones del entrenamiento.</p>
            <div className="mt-4 flex items-center gap-3">
              <input type="number" min="0.01" max="100" step="0.25" value={gymWeightStep} onChange={(event) => setGymWeightStep(event.target.value)} className="min-h-12 w-full rounded-2xl border px-4" aria-label="Incremento de peso en kg" />
              <button type="button" disabled={savingGymStep} onClick={() => void saveGymWeightStep()} className="min-h-12 rounded-2xl bg-rose-500 px-5 font-semibold text-white disabled:opacity-50">Guardar</button>
            </div>
            {gymStepMessage && <p className="theme-muted mt-3 text-xs" role="status">{gymStepMessage}</p>}
          </section>
        )}

        {!canChangeTheme ? (
          <section className="theme-surface rounded-3xl p-7 shadow-sm">
            {!canTrackGymWorkouts && <p className="theme-muted text-sm">No tienes ajustes disponibles.</p>}
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
                    onClick={() => void changeTheme(option.value)}
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
                onClick={() => void saveColors()}
                className="rounded-xl bg-rose-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                Guardar colores
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void restoreColors()}
                className="theme-border rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-40"
              >
                Restaurar colores del tema
              </button>
            </div>
          </section>
          </div>
        )}
      </div>
      <AppMobileNavigation current="settings" resolvedViews={appNavigationViews} />
    </main>
  );
}
