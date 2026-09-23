'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  Calendar,
  CheckCircle,
  ChevronRight,
  FileUp,
  LogOut,
  Plus,
  Save,
  Trash2,
  Users,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { isHistoricalDate, madridDateString } from '@/lib/historical-date';
import { AdminNavigation } from '@/components/AdminNavigation';
import { deriveAdminViews, deriveAvailableViews, deriveCapabilities, type AdminView, type RoleCode } from '@/lib/authz.js';
import { createMutationLock, deriveFeatureCapabilities, normalizeFeatureRows } from '@/lib/feature-permissions.js';
import { advanceAuthIdentity } from '@/lib/view-capabilities-guard.js';
import { applySavedMealIds, buildMealPayload, type SavedMeal } from '@/lib/admin-plan.js';
import { groupMealOptions, MAX_MEAL_OPTIONS } from '@/lib/meal-options.js';
import { DietImportWizard } from '@/components/DietImportWizard';

type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  is_sudo?: boolean;
};

type Membership = { id: string };
type UserRole = { role_code: RoleCode };
type ManageablePatient = Pick<Profile, 'id' | 'email' | 'full_name'>;

type DailyPlanRow = {
  id: string;
  meal_type: string;
  title: string;
  ingredients: string | null;
  recipe_url: string | null;
  is_completed: boolean;
  option_order: number | null;
  meal_order: number | null;
  created_at: string;
};

type MealDraft = {
  id?: string;
  clientKey: string;
  title: string;
  ingredients: string;
  recipeUrl: string;
  isCompleted: boolean;
};

type MealType = string;
type MealDrafts = Record<string, MealDraft[]>;

function createClientKey(): string {
  return crypto.randomUUID();
}

function emptyMealDraft(): MealDraft {
  return { clientKey: createClientKey(), title: '', ingredients: '', recipeUrl: '', isCompleted: false };
}

function emptyDrafts(): MealDrafts {
  return {};
}

function planContextKey(patientId: string, date: string): string {
  return `${patientId}\u0000${date}`;
}

function localDateString(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function moveDate(value: string, days: number): string {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return localDateString(date);
}

export default function AdminPage() {
  const router = useRouter();
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [selectedDate, setSelectedDate] = useState(madridDateString);
  const isHistoricalDay = isHistoricalDate(selectedDate);
  const [drafts, setDrafts] = useState<MealDrafts>(emptyDrafts);
  const [mealGroups, setMealGroups] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importRefreshKey, setImportRefreshKey] = useState(0);
  const [planRetryKey, setPlanRetryKey] = useState(0);
  const [loadedPlanContext, setLoadedPlanContext] = useState<string | null>(null);
  const [planLoadError, setPlanLoadError] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [adminViews, setAdminViews] = useState<AdminView[]>([]);
  const planContext = planContextKey(selectedPatientId, selectedDate);
  const isPlanReady = loadedPlanContext === planContext;
  const selectionRef = useRef({ patientId: selectedPatientId, date: selectedDate });
  const mountedRef = useRef(true);
  const authGenerationRef = useRef(0);
  const currentUserIdRef = useRef<string | null>(null);
  const authInitializedRef = useRef(false);
  const requestGenerationRef = useRef(0);
  const mutationLockRef = useRef(createMutationLock());

  const isAuthCurrent = useCallback((generation: number, userId: string | null) => (
    mountedRef.current
    && generation === authGenerationRef.current
    && userId !== null
    && userId === currentUserIdRef.current
  ), []);

  useEffect(() => {
    selectionRef.current = { patientId: selectedPatientId, date: selectedDate };
  }, [selectedDate, selectedPatientId]);

  useEffect(() => {
    mountedRef.current = true;
    let receivedAuthEvent = false;
    async function initialize(userId: string, generation: number) {
      try {
      const [profileResult, membershipResult] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, email, full_name, is_sudo')
          .eq('id', userId)
          .maybeSingle(),
        supabase
          .from('group_memberships')
          .select('id')
          .eq('user_id', userId)
          .eq('status', 'active')
          .maybeSingle(),
      ]);

      const ownProfile = profileResult.data as Profile | null;
      const membership = membershipResult.data as Membership | null;
      const accessLookupError = profileResult.error ?? membershipResult.error;
      if (!isAuthCurrent(generation, userId)) return;
      if (accessLookupError) {
        setAccessError(
          accessLookupError.code === '42501'
            ? 'No tienes permiso para consultar los datos de acceso.'
            : 'No se pudo verificar el acceso. Inténtalo de nuevo en unos minutos.',
        );
        return;
      }

      if (!ownProfile || !membership) {
        router.replace('/');
        return;
      }

      const [rolesResult, featuresResult] = await Promise.all([
        supabase.from('user_roles').select('role_code').eq('membership_id', membership.id),
        supabase.rpc('get_my_features'),
      ]);
      const { data: roleRows, error: rolesError } = rolesResult;

      if (!isAuthCurrent(generation, userId)) return;

      if (rolesError) {
        setAccessError(
          rolesError.code === '42501'
            ? 'No tienes permiso para consultar los roles de acceso.'
            : 'No se pudo verificar el acceso. Inténtalo de nuevo en unos minutos.',
        );
        return;
      }

      const roles = (roleRows ?? []).map((row) => (row as UserRole).role_code);
      const capabilities = deriveCapabilities(Boolean(ownProfile.is_sudo), roles);
      const featureCapabilities = deriveFeatureCapabilities(
        featuresResult.error ? [] : normalizeFeatureRows(featuresResult.data),
      );

      if (!capabilities.canOpenDietAdmin) {
        router.replace('/');
        return;
      }

      let availableProfiles: ManageablePatient[];
      let patientsError: { code?: string } | null = null;
      if (capabilities.canManageGroupPlans) {
        const result = await supabase.rpc('list_manageable_patients');
        availableProfiles = (result.data ?? []) as ManageablePatient[];
        patientsError = result.error;
      } else {
        availableProfiles = [ownProfile];
      }

      if (!isAuthCurrent(generation, userId)) return;
      setCurrentProfile(ownProfile);
      setAdminViews(deriveAdminViews(deriveAvailableViews(capabilities, {
        canManageGymWorkouts: featureCapabilities.canManageGymWorkouts,
      })));
      if (patientsError) {
        setMessage({
          type: 'error',
          text:
            patientsError.code === '42501'
              ? 'No tienes permiso para consultar pacientes de este grupo.'
              : 'No se pudo cargar la lista de pacientes. Inténtalo de nuevo.',
        });
      } else {
        setProfiles(availableProfiles);
        setSelectedPatientId(
          availableProfiles.some((profile) => profile.id === ownProfile.id)
            ? ownProfile.id
            : (availableProfiles[0]?.id ?? ''),
        );
      }
      } catch {
        if (isAuthCurrent(generation, userId)) setAccessError('No se pudo verificar el acceso. Inténtalo de nuevo en unos minutos.');
      } finally {
        if (isAuthCurrent(generation, userId)) setLoading(false);
      }
    }
    const applySession = (userId: string | null) => {
      const transition = advanceAuthIdentity({
        initialized: authInitializedRef.current,
        generation: authGenerationRef.current,
        userId: currentUserIdRef.current,
      }, userId);
      if (!transition.changed) return;
      authInitializedRef.current = transition.state.initialized;
      authGenerationRef.current = transition.state.generation;
      currentUserIdRef.current = transition.state.userId;
      requestGenerationRef.current += 1;
      mutationLockRef.current = createMutationLock();
      setCurrentProfile(null); setProfiles([]); setSelectedPatientId(''); setSelectedDate(madridDateString());
      setDrafts(emptyDrafts()); setMealGroups([]); setAdminViews([]); setAccessError(null); setMessage(null);
      setImportOpen(false); setImportRefreshKey(0); setPlanRetryKey(0); setSaving(false); setLoadingPlan(false);
      setLoadedPlanContext(null); setPlanLoadError(false);
      setLoading(Boolean(userId));
      if (!userId) { router.replace('/'); return; }
      void initialize(userId, transition.state.generation);
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      receivedAuthEvent = true;
      applySession(session?.user.id ?? null);
    });
    supabase.auth.getSession()
      .then(({ data }) => { if (mountedRef.current && !receivedAuthEvent) applySession(data.session?.user.id ?? null); })
      .catch(() => { if (mountedRef.current && !receivedAuthEvent) applySession(null); });
    return () => {
      mountedRef.current = false;
      authGenerationRef.current += 1;
      currentUserIdRef.current = null;
      requestGenerationRef.current += 1;
      subscription.unsubscribe();
    };
  }, [isAuthCurrent, router]);

  useEffect(() => {
    async function loadPlan() {
      const generation = authGenerationRef.current;
      const userId = currentUserIdRef.current;
      const requestGeneration = ++requestGenerationRef.current;
      if (!userId || !isAuthCurrent(generation, userId)) return;
      setLoadedPlanContext(null);
      setPlanLoadError(false);
      if (!selectedPatientId) {
        setDrafts(emptyDrafts());
        setLoadingPlan(false);
        return;
      }
      setLoadingPlan(true);
      setMessage(null);
      try {
        const { data, error } = await supabase
          .from('daily_plan')
          .select('id, meal_type, meal_order, title, ingredients, recipe_url, is_completed, option_order, created_at')
          .eq('user_id', selectedPatientId)
          .eq('date', selectedDate);
        if (!isAuthCurrent(generation, userId) || requestGeneration !== requestGenerationRef.current) return;
        if (error) throw error;
        const nextDrafts: MealDrafts = {};
        const groupedRows = groupMealOptions((data ?? []) as DailyPlanRow[]) as Record<string, DailyPlanRow[]>;
        const groups = Object.entries(groupedRows).sort(([, left], [, right]) => (left[0]?.meal_order ?? 0) - (right[0]?.meal_order ?? 0));
        for (const [key, rows] of groups) {
          if (rows.length) {
            nextDrafts[key] = rows.map((row) => ({
              id: row.id,
              clientKey: createClientKey(),
              title: row.title ?? '',
              ingredients: row.ingredients ?? '',
              recipeUrl: row.recipe_url ?? '',
              isCompleted: row.is_completed ?? false,
            }));
          }
        }
        setDrafts(nextDrafts);
        setMealGroups(groups.map(([key]) => key));
        setLoadedPlanContext(planContext);
      } catch {
        if (isAuthCurrent(generation, userId) && requestGeneration === requestGenerationRef.current) {
          setDrafts(emptyDrafts());
          setPlanLoadError(true);
          setMessage({ type: 'error', text: 'No se pudo cargar el plan de este día.' });
        }
      } finally {
        if (isAuthCurrent(generation, userId) && requestGeneration === requestGenerationRef.current) setLoadingPlan(false);
      }
    }

    void loadPlan();
    return () => { requestGenerationRef.current += 1; };
  }, [importRefreshKey, isAuthCurrent, planContext, planRetryKey, selectedDate, selectedPatientId]);

  useEffect(() => {
    if (!message || message.type !== 'success') return;
    const timeout = window.setTimeout(() => setMessage(null), 3000);
    return () => window.clearTimeout(timeout);
  }, [message]);

  const selectedPatient = profiles.find((profile) => profile.id === selectedPatientId);
  const contextDisabled = loadingPlan || saving || importOpen;
  const editingDisabled = !isPlanReady || loadingPlan || saving || importOpen || isHistoricalDay;

  function updateOption(mealType: string, index: number, field: 'title' | 'ingredients', value: string) {
    if (editingDisabled) return;
    setDrafts((current) => ({
      ...current,
      [mealType]: current[mealType].map((option, optionIndex) => (
        optionIndex === index ? { ...option, [field]: value } : option
      )),
    }));
  }

  function addOption(mealType: string) {
    if (editingDisabled) return;
    setDrafts((current) => current[mealType].length >= MAX_MEAL_OPTIONS ? current : ({
      ...current,
      [mealType]: [...current[mealType], emptyMealDraft()],
    }));
  }

  function removeOption(mealType: string, index: number) {
    if (editingDisabled) return;
    setDrafts((current) => current[mealType].length <= 1 ? current : ({
      ...current,
      [mealType]: current[mealType].filter((_, optionIndex) => optionIndex !== index),
    }));
  }

  function moveOption(mealType: string, index: number, direction: -1 | 1) {
    if (editingDisabled) return;
    setDrafts((current) => {
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= current[mealType].length) return current;
      const options = [...current[mealType]];
      [options[index], options[targetIndex]] = [options[targetIndex], options[index]];
      return { ...current, [mealType]: options };
    });
  }

  function renameGroup(mealType: string) {
    if (editingDisabled) return;
    const next = window.prompt('Nombre del grupo', mealType)?.trim();
    if (!next || next === mealType || drafts[next]) return;
    setDrafts((current) => {
      const { [mealType]: options, ...rest } = current;
      return { ...rest, [next]: options };
    });
    setMealGroups((current) => current.map((group) => group === mealType ? next : group));
  }

  function moveGroup(mealType: string, direction: -1 | 1) {
    if (editingDisabled) return;
    setMealGroups((current) => {
      const index = current.indexOf(mealType); const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current]; [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function deleteGroup(mealType: string) {
    if (editingDisabled || !window.confirm(`Eliminar el grupo ${mealType}?`)) return;
    setDrafts((current) => { const { [mealType]: _, ...rest } = current; return rest; });
    setMealGroups((current) => current.filter((group) => group !== mealType));
  }

  async function savePlan() {
    if (!isPlanReady || loadingPlan || saving || importOpen || isHistoricalDay) return;
    if (mealGroups.length < 1) {
      setMessage({ type: 'error', text: 'Añade al menos un grupo de comida antes de guardar.' });
      return;
    }
    const generation = authGenerationRef.current;
    const userId = currentUserIdRef.current;
    if (!userId || !isAuthCurrent(generation, userId)) return;
    const mutationLock = mutationLockRef.current;
    if (!mutationLock.tryAcquire()) return;
    const patientSnapshot = selectedPatientId;
    const dateSnapshot = selectedDate;
    const applyFuture = window.confirm('¿Aplicar este plan a todos los días desde esta fecha?\n\nAceptar: todos los días futuros.\nCancelar: solo este día.');
    try {
      setSaving(true); setMessage(null);
      const payload = buildMealPayload(drafts, mealGroups);
      const { data, error } = await supabase.rpc(applyFuture ? 'save_daily_plan_from_date' : 'save_daily_plan', {
        target_user: patientSnapshot,
        target_date: dateSnapshot,
        meals: applyFuture ? payload.map((group) => ({ ...group, options: group.options.map(({ id: _id, ...option }) => option) })) : payload,
      });
      if (!isAuthCurrent(generation, userId)) return;
      if (error) {
        console.error('Error guardando el plan:', error);
        setMessage({ type: 'error', text: 'No se pudo guardar el plan completo. Inténtalo de nuevo.' });
      } else {
        const selection = selectionRef.current;
        if (selection.patientId === patientSnapshot && selection.date === dateSnapshot) {
          setDrafts((current) => applySavedMealIds(current, (data ?? []) as SavedMeal[], mealGroups) as MealDrafts);
        }
        setMessage({ type: 'success', text: applyFuture ? 'Plan aplicado desde hoy en adelante.' : 'Plan guardado correctamente.' });
      }
    } catch {
      if (isAuthCurrent(generation, userId)) setMessage({ type: 'error', text: 'No se pudo guardar el plan completo. Inténtalo de nuevo.' });
    } finally {
      if (isAuthCurrent(generation, userId)) setSaving(false);
      mutationLock.release();
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    router.replace('/');
  }

  if (loading) {
    return (
      <main className="theme-page flex min-h-screen items-center justify-center text-sm text-slate-500">
        <div className="flex items-center gap-3 rounded-2xl bg-white px-5 py-4 shadow-sm">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-rose-200 border-t-rose-500" />
          Cargando panel de administración...
        </div>
      </main>
    );
  }

  if (accessError) {
    return (
      <main className="theme-page flex min-h-screen items-center justify-center p-6 text-slate-700">
        <div className="w-full max-w-lg rounded-3xl border border-red-100 bg-white p-7 shadow-sm">
          <h1 className="text-xl font-bold text-slate-800">No se pudo abrir el panel</h1>
          <p className="mt-3 text-sm leading-6 text-red-600">{accessError}</p>
          <p className="mt-3 text-xs leading-5 text-slate-500">
            Revisa que las políticas RLS permitan al usuario autenticado leer su propia fila de profiles.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="theme-page min-h-screen text-slate-700">
      <div className="lg:flex" inert={importOpen ? true : undefined} aria-hidden={importOpen}>
      <aside className="border-b border-rose-100 bg-white/90 px-5 py-6 shadow-sm backdrop-blur lg:fixed lg:inset-y-0 lg:left-0 lg:w-80 lg:border-b-0 lg:border-r lg:px-7 lg:py-8">
        <div className="flex h-full flex-col">
          <div className="mb-7">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-400">Panel profesional</p>
            <h1 className="mt-2 text-2xl font-bold text-slate-800">Dieta Alba - Admin</h1>
            <div className="mt-4 rounded-2xl bg-rose-50 p-4">
              <p className="font-semibold text-slate-700">{currentProfile?.full_name || 'Usuario'}</p>
              <p className="mt-1 truncate text-xs text-slate-500">{currentProfile?.email}</p>
            </div>
          </div>

          <section className="min-h-0 flex-1">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <Users size={17} className="text-rose-400" />
              Pacientes
            </div>
            <div className="max-h-56 space-y-2 overflow-y-auto pr-1 lg:max-h-[calc(100vh-380px)]">
              {profiles.map((profile) => {
                const selected = profile.id === selectedPatientId;
                return (
                  <button
                    key={profile.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setSelectedPatientId(profile.id)}
                    disabled={contextDisabled}
                    className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left transition ${
                      selected
                        ? 'bg-slate-800 text-white shadow-sm'
                        : 'bg-slate-50 text-slate-600 hover:bg-rose-50'
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{profile.full_name || 'Sin nombre'}</span>
                      <span className={`block truncate text-xs ${selected ? 'text-slate-300' : 'text-slate-400'}`}>
                        {profile.email}
                      </span>
                    </span>
                    <ChevronRight size={16} className="shrink-0" />
                  </button>
                );
              })}
              {profiles.length === 0 && (
                <p className="rounded-2xl bg-slate-50 p-4 text-xs text-slate-500">No hay perfiles disponibles.</p>
              )}
            </div>
          </section>

          <nav className="mt-6 space-y-2 border-t border-slate-100 pt-5">
            <AdminNavigation current="admin" resolvedViews={adminViews} />
            <button
              type="button"
              onClick={() => void logout()}
              disabled={importOpen}
              className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium text-rose-500 hover:bg-rose-50"
            >
              <LogOut size={17} /> Cerrar sesión
            </button>
          </nav>
        </div>
      </aside>

      <section className="w-full px-5 py-7 sm:px-8 lg:ml-80 lg:px-10 lg:py-9 xl:px-14">
        <div className="mx-auto max-w-6xl">
          <header className="mb-7 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-sm font-medium text-rose-400">Plan diario</p>
              <h2 className="mt-1 text-3xl font-bold tracking-tight text-slate-800">
                {selectedPatient?.full_name || 'Selecciona un paciente'}
              </h2>
              {selectedPatient && <p className="mt-1 text-sm text-slate-400">{selectedPatient.email}</p>}
            </div>

            <div className="flex flex-wrap items-center gap-2 rounded-3xl border border-white bg-white/80 p-2 shadow-sm">
              <button
                type="button"
                aria-label="Día anterior"
                onClick={() => setSelectedDate((date) => moveDate(date, -1))}
                disabled={contextDisabled}
                className="rounded-2xl p-2.5 text-slate-500 hover:bg-rose-50 hover:text-rose-500"
              >
                <ArrowLeft size={18} />
              </button>
              <div className="relative">
                <Calendar className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-rose-400" size={17} />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(event) => setSelectedDate(event.target.value)}
                  disabled={!selectedPatientId || contextDisabled}
                  className="rounded-2xl border-0 bg-slate-50 py-2.5 pl-10 pr-3 text-sm font-medium text-slate-700 outline-none ring-rose-200 focus:ring-2"
                />
              </div>
              <button
                type="button"
                onClick={() => setSelectedDate(madridDateString())}
                disabled={contextDisabled}
                className="rounded-2xl px-4 py-2.5 text-sm font-semibold text-rose-500 hover:bg-rose-50"
              >
                Hoy
              </button>
              <button
                type="button"
                aria-label="Día siguiente"
                onClick={() => setSelectedDate((date) => moveDate(date, 1))}
                disabled={contextDisabled}
                className="rounded-2xl p-2.5 text-slate-500 hover:bg-rose-50 hover:text-rose-500"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </header>

          {message && (
            <div
              role="status"
              className={`mb-5 flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm shadow-sm ${
                message.type === 'success'
                  ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
                  : 'border-red-100 bg-red-50 text-red-700'
              }`}
            >
              {message.type === 'success' && <CheckCircle size={18} />}
              {message.text}
            </div>
          )}

          {planLoadError && selectedPatientId && (
            <div className="mb-5 flex justify-end">
              <button
                type="button"
                onClick={() => setPlanRetryKey((key) => key + 1)}
                disabled={loadingPlan || saving || importOpen}
                className="min-h-11 rounded-2xl border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Reintentar carga
              </button>
            </div>
          )}

          <div className={`grid gap-5 md:grid-cols-2 xl:grid-cols-3 ${loadingPlan ? 'pointer-events-none opacity-50' : ''}`}>
            {mealGroups.map((key, index) => {
              const label = key;
              const accent = 'bg-slate-50 border-slate-100';
              return <article key={`${key}-${index}`} className={`rounded-3xl border p-5 shadow-sm ${accent}`}>
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                      Bloque {String(index + 1).padStart(2, '0')}
                    </p>
                    <h3 className="mt-1 text-lg font-bold text-slate-800">{label}</h3>
                  </div>
                  <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-white/80 text-sm font-bold text-slate-500">
                    {index + 1}
                  </span>
                </div>
                <div className="mb-3 flex justify-end gap-1">
                  <button type="button" onClick={() => moveGroup(key, -1)} disabled={editingDisabled || index === 0} className="min-h-11 min-w-11 rounded-xl disabled:opacity-40" aria-label={`Mover arriba ${label}`}><ArrowUp size={16} /></button>
                  <button type="button" onClick={() => moveGroup(key, 1)} disabled={editingDisabled || index === mealGroups.length - 1} className="min-h-11 min-w-11 rounded-xl disabled:opacity-40" aria-label={`Mover abajo ${label}`}><ArrowDown size={16} /></button>
                  <button type="button" onClick={() => renameGroup(key)} disabled={editingDisabled} className="min-h-11 rounded-xl px-2 text-xs disabled:opacity-40">Renombrar</button>
                  <button type="button" onClick={() => deleteGroup(key)} disabled={editingDisabled} className="min-h-11 min-w-11 rounded-xl text-rose-500 disabled:opacity-40" aria-label={`Eliminar ${label}`}><Trash2 size={16} /></button>
                </div>

                <div className="space-y-4">
                  {drafts[key].map((draft, optionIndex) => (
                    <section
                      key={draft.id ?? draft.clientKey}
                      className="rounded-2xl border border-white/80 bg-white/35 p-3"
                    >
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        {drafts[key].length > 1 && (
                          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                            Opción {optionIndex + 1}
                          </p>
                        )}
                        <div className="ml-auto flex items-center gap-1">
                          <button
                            type="button"
                            aria-label={`Mover arriba la opción ${optionIndex + 1} de ${label}`}
                            onClick={() => moveOption(key, optionIndex, -1)}
                            disabled={editingDisabled || optionIndex === 0}
                            className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-slate-500 hover:bg-white/80 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <ArrowUp size={16} />
                          </button>
                          <button
                            type="button"
                            aria-label={`Mover abajo la opción ${optionIndex + 1} de ${label}`}
                            onClick={() => moveOption(key, optionIndex, 1)}
                            disabled={editingDisabled || optionIndex === drafts[key].length - 1}
                            className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-slate-500 hover:bg-white/80 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <ArrowDown size={16} />
                          </button>
                          <button
                            type="button"
                            aria-label={`Eliminar la opción ${optionIndex + 1} de ${label}`}
                            onClick={() => removeOption(key, optionIndex)}
                            disabled={editingDisabled || drafts[key].length === 1}
                            className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-rose-500 hover:bg-white/80 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>

                      <label className="block text-xs font-semibold text-slate-600">
                        Plato
                        <input
                          id={`meal-${index}-option-${optionIndex}-title`}
                          name={`meal-${index}-option-${optionIndex}-title`}
                          value={draft.title}
                          onChange={(event) => updateOption(key, optionIndex, 'title', event.target.value)}
                          placeholder={`Nombre del ${label.toLowerCase()}`}
                          disabled={!isPlanReady || loadingPlan || saving || importOpen || isHistoricalDay}
                          className="mt-2 w-full rounded-2xl border border-white/80 bg-white/90 px-4 py-3 text-sm font-normal text-slate-700 outline-none ring-rose-200 placeholder:text-slate-300 focus:ring-2 disabled:cursor-not-allowed"
                        />
                      </label>

                      <label className="mt-4 block text-xs font-semibold text-slate-600">
                        Ingredientes e indicaciones
                        <textarea
                          id={`meal-${index}-option-${optionIndex}-ingredients`}
                          name={`meal-${index}-option-${optionIndex}-ingredients`}
                          value={draft.ingredients}
                          onChange={(event) => updateOption(key, optionIndex, 'ingredients', event.target.value)}
                          placeholder="Cantidades, preparación y observaciones…"
                          disabled={!isPlanReady || loadingPlan || saving || importOpen || isHistoricalDay}
                          rows={5}
                          className="mt-2 w-full resize-none rounded-2xl border border-white/80 bg-white/90 px-4 py-3 text-sm font-normal leading-6 text-slate-700 outline-none ring-rose-200 placeholder:text-slate-300 focus:ring-2 disabled:cursor-not-allowed"
                        />
                      </label>
                    </section>
                  ))}
                </div>

                <button
                  type="button"
                  aria-label={`Añadir opción a ${label}`}
                  onClick={() => addOption(key)}
                  disabled={editingDisabled || drafts[key].length >= MAX_MEAL_OPTIONS}
                  className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white/50 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-white/80 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Plus size={17} /> Añadir opción
                </button>
              </article>;
            })}
          </div>

          <button
            type="button"
            disabled={editingDisabled}
            onClick={() => {
              const label = window.prompt('Nombre del nuevo grupo de comida')?.trim();
              if (!label || drafts[label]) return;
              setDrafts((current) => ({ ...current, [label]: [emptyMealDraft()] }));
              setMealGroups((current) => [...current, label]);
            }}
            className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white/50 px-4 py-2 text-sm font-semibold text-slate-600 disabled:opacity-50"
          ><Plus size={17} /> Añadir grupo de comida</button>

          <div className="sticky bottom-5 mt-7 flex flex-col justify-end gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              disabled={!isPlanReady || saving || loadingPlan || importOpen || isHistoricalDay}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-rose-100 px-6 py-3.5 text-sm font-bold text-rose-700 shadow-lg shadow-slate-200 transition hover:bg-rose-200 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              <FileUp size={18} /> Importar dieta
            </button>
            <button
              type="button"
              onClick={() => void savePlan()}
              disabled={!isPlanReady || saving || loadingPlan || importOpen || isHistoricalDay}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-800 px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-slate-300 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              <Save size={18} />
              {saving ? 'Guardando…' : 'Guardar Plan'}
            </button>
          </div>
        </div>
      </section>
      </div>
      {importOpen && <DietImportWizard
        open={importOpen}
        patientId={selectedPatientId}
        patientName={selectedPatient?.full_name || selectedPatient?.email || ''}
        onClose={() => setImportOpen(false)}
        onImported={(startDate) => {
          setLoadedPlanContext(null);
          setSelectedDate(startDate);
          setImportRefreshKey((key) => key + 1);
          setMessage({ type: 'success', text: 'Dieta importada correctamente.' });
        }}
      />}
    </main>
  );
}
