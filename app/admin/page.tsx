'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Calendar,
  CheckCircle,
  ChevronRight,
  LogOut,
  Save,
  Users,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { deriveCapabilities, type RoleCode } from '@/lib/authz.js';
import { applySavedMealIds, buildMealPayload, type SavedMeal } from '@/lib/admin-plan.js';

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
  is_completed: boolean;
};

type MealDraft = {
  id?: string;
  title: string;
  ingredients: string;
  isCompleted: boolean;
};

const MEALS = [
  { key: 'DESAYUNO', label: 'Desayuno', accent: 'bg-amber-50 border-amber-100' },
  { key: 'MEDIA MAÑANA', label: 'Media mañana', accent: 'bg-orange-50 border-orange-100' },
  { key: 'ALMUERZO', label: 'Almuerzo', accent: 'bg-emerald-50 border-emerald-100' },
  { key: 'MERIENDA', label: 'Merienda', accent: 'bg-pink-50 border-pink-100' },
  { key: 'CENA', label: 'Cena', accent: 'bg-indigo-50 border-indigo-100' },
  { key: 'POSTRE NOCTURNO', label: 'Postre nocturno', accent: 'bg-purple-50 border-purple-100' },
] as const;

type MealType = (typeof MEALS)[number]['key'];
type MealDrafts = Record<MealType, MealDraft>;

function emptyDrafts(): MealDrafts {
  return Object.fromEntries(
    MEALS.map(({ key }) => [key, { title: '', ingredients: '', isCompleted: false }]),
  ) as MealDrafts;
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
  const [selectedDate, setSelectedDate] = useState(localDateString);
  const [drafts, setDrafts] = useState<MealDrafts>(emptyDrafts);
  const [loading, setLoading] = useState(true);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [saving, setSaving] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const selectionRef = useRef({ patientId: selectedPatientId, date: selectedDate });

  useEffect(() => {
    selectionRef.current = { patientId: selectedPatientId, date: selectedDate };
  }, [selectedDate, selectedPatientId]);

  useEffect(() => {
    let active = true;
    let sessionInitialized = false;

    async function checkAccess() {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      const session = sessionData.session;

      if (sessionError || !session) {
        if (!active) return;
        sessionInitialized = true;
        router.push('/');
        return;
      }

      const [profileResult, membershipResult] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, email, full_name, is_sudo')
          .eq('id', session.user.id)
          .maybeSingle(),
        supabase
          .from('group_memberships')
          .select('id')
          .eq('user_id', session.user.id)
          .eq('status', 'active')
          .maybeSingle(),
      ]);

      const ownProfile = profileResult.data as Profile | null;
      const membership = membershipResult.data as Membership | null;
      const accessLookupError = profileResult.error ?? membershipResult.error;

      if (accessLookupError) {
        if (!active) return;
        sessionInitialized = true;
        setAccessError(
          accessLookupError.code === '42501'
            ? 'No tienes permiso para consultar los datos de acceso.'
            : 'No se pudo verificar el acceso. Inténtalo de nuevo en unos minutos.',
        );
        setLoading(false);
        return;
      }

      if (!ownProfile || !membership) {
        if (!active) return;
        sessionInitialized = true;
        router.push('/');
        return;
      }

      const { data: roleRows, error: rolesError } = await supabase
        .from('user_roles')
        .select('role_code')
        .eq('membership_id', membership.id);

      if (!active) return;

      if (rolesError) {
        sessionInitialized = true;
        setAccessError(
          rolesError.code === '42501'
            ? 'No tienes permiso para consultar los roles de acceso.'
            : 'No se pudo verificar el acceso. Inténtalo de nuevo en unos minutos.',
        );
        setLoading(false);
        return;
      }

      const roles = (roleRows ?? []).map((row) => (row as UserRole).role_code);
      const capabilities = deriveCapabilities(Boolean(ownProfile.is_sudo), roles);

      if (!capabilities.canOpenDietAdmin) {
        sessionInitialized = true;
        router.push('/');
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

      if (!active) return;

      sessionInitialized = true;
      setCurrentProfile(ownProfile);
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
      setLoading(false);
    }

    void checkAccess();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (sessionInitialized && !session) {
        router.push('/');
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [router]);

  useEffect(() => {
    let active = true;

    async function loadPlan() {
      if (!selectedPatientId) {
        setDrafts(emptyDrafts());
        return;
      }

      setLoadingPlan(true);
      setMessage(null);
      const { data, error } = await supabase
        .from('daily_plan')
        .select('id, meal_type, title, ingredients, is_completed')
        .eq('user_id', selectedPatientId)
        .eq('date', selectedDate);

      if (!active) return;

      if (error) {
        setDrafts(emptyDrafts());
        setMessage({ type: 'error', text: 'No se pudo cargar el plan de este día.' });
      } else {
        const nextDrafts = emptyDrafts();
        for (const row of (data ?? []) as DailyPlanRow[]) {
          if (row.meal_type in nextDrafts) {
            nextDrafts[row.meal_type as MealType] = {
              id: row.id,
              title: row.title ?? '',
              ingredients: row.ingredients ?? '',
              isCompleted: row.is_completed ?? false,
            };
          }
        }
        setDrafts(nextDrafts);
      }
      setLoadingPlan(false);
    }

    void loadPlan();
    return () => {
      active = false;
    };
  }, [selectedDate, selectedPatientId]);

  useEffect(() => {
    if (!message || message.type !== 'success') return;
    const timeout = window.setTimeout(() => setMessage(null), 3000);
    return () => window.clearTimeout(timeout);
  }, [message]);

  const selectedPatient = profiles.find((profile) => profile.id === selectedPatientId);

  function updateDraft(mealType: MealType, field: 'title' | 'ingredients', value: string) {
    setDrafts((current) => ({
      ...current,
      [mealType]: { ...current[mealType], [field]: value },
    }));
  }

  async function savePlan() {
    if (!selectedPatientId) return;

    const patientSnapshot = selectedPatientId;
    const dateSnapshot = selectedDate;
    setSaving(true);
    setMessage(null);

    const { data, error } = await supabase.rpc('save_daily_plan', {
      target_user: patientSnapshot,
      target_date: dateSnapshot,
      meals: buildMealPayload(
        drafts,
        MEALS.map(({ key }) => key),
      ),
    });

    if (error) {
      console.error('Error guardando el plan:', error);
      setMessage({ type: 'error', text: 'No se pudo guardar el plan completo. Inténtalo de nuevo.' });
    } else {
      const selection = selectionRef.current;
      if (selection.patientId === patientSnapshot && selection.date === dateSnapshot) {
        setDrafts((current) => applySavedMealIds(current, (data ?? []) as SavedMeal[]));
      }
      setMessage({ type: 'success', text: 'Plan guardado correctamente.' });
    }
    setSaving(false);
  }

  async function logout() {
    await supabase.auth.signOut();
    router.replace('/');
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#FAF7F2] text-sm text-slate-500">
        <div className="flex items-center gap-3 rounded-2xl bg-white px-5 py-4 shadow-sm">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-rose-200 border-t-rose-500" />
          Cargando panel de administración...
        </div>
      </main>
    );
  }

  if (accessError) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#FAF7F2] p-6 text-slate-700">
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
    <main className="min-h-screen bg-[#FAF7F2] text-slate-700 lg:flex">
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
                    onClick={() => setSelectedPatientId(profile.id)}
                    disabled={saving}
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
            <button
              type="button"
              onClick={() => router.push('/')}
              className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              <ArrowLeft size={17} /> Vista del paciente
            </button>
            <button
              type="button"
              onClick={() => void logout()}
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
                disabled={saving}
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
                  disabled={saving || !selectedPatientId}
                  className="rounded-2xl border-0 bg-slate-50 py-2.5 pl-10 pr-3 text-sm font-medium text-slate-700 outline-none ring-rose-200 focus:ring-2"
                />
              </div>
              <button
                type="button"
                onClick={() => setSelectedDate(localDateString())}
                disabled={saving}
                className="rounded-2xl px-4 py-2.5 text-sm font-semibold text-rose-500 hover:bg-rose-50"
              >
                Hoy
              </button>
              <button
                type="button"
                aria-label="Día siguiente"
                onClick={() => setSelectedDate((date) => moveDate(date, 1))}
                disabled={saving}
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

          <div className={`grid gap-5 md:grid-cols-2 xl:grid-cols-3 ${loadingPlan ? 'pointer-events-none opacity-50' : ''}`}>
            {MEALS.map(({ key, label, accent }, index) => (
              <article key={key} className={`rounded-3xl border p-5 shadow-sm ${accent}`}>
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

                <label className="block text-xs font-semibold text-slate-600">
                  Plato
                  <input
                    value={drafts[key].title}
                    onChange={(event) => updateDraft(key, 'title', event.target.value)}
                    placeholder={`Nombre del ${label.toLowerCase()}`}
                    disabled={!selectedPatientId || saving}
                    className="mt-2 w-full rounded-2xl border border-white/80 bg-white/90 px-4 py-3 text-sm font-normal text-slate-700 outline-none ring-rose-200 placeholder:text-slate-300 focus:ring-2 disabled:cursor-not-allowed"
                  />
                </label>

                <label className="mt-4 block text-xs font-semibold text-slate-600">
                  Ingredientes e indicaciones
                  <textarea
                    value={drafts[key].ingredients}
                    onChange={(event) => updateDraft(key, 'ingredients', event.target.value)}
                    placeholder="Cantidades, preparación y observaciones…"
                    disabled={!selectedPatientId || saving}
                    rows={5}
                    className="mt-2 w-full resize-none rounded-2xl border border-white/80 bg-white/90 px-4 py-3 text-sm font-normal leading-6 text-slate-700 outline-none ring-rose-200 placeholder:text-slate-300 focus:ring-2 disabled:cursor-not-allowed"
                  />
                </label>
              </article>
            ))}
          </div>

          <div className="sticky bottom-5 mt-7 flex justify-end">
            <button
              type="button"
              onClick={() => void savePlan()}
              disabled={!selectedPatientId || saving || loadingPlan}
              className="flex items-center gap-2 rounded-2xl bg-slate-800 px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-slate-300 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Save size={18} />
              {saving ? 'Guardando…' : 'Guardar Plan'}
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
