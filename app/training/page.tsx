'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Activity, CalendarDays, Dumbbell, Plus, TrendingUp } from 'lucide-react';
import { ViewNavigation } from '@/components/ViewNavigation';
import { deriveFeatureCapabilities, normalizeFeatureRows } from '@/lib/feature-permissions.js';
import { madridDateString } from '@/lib/historical-date.js';
import { toProgressPoints, validateWorkoutSet } from '@/lib/gym-workouts.js';
import { supabase } from '@/lib/supabase';

const EXERCISE_CODE = 'press_chest_machine';
const EXERCISE_NAME = 'Press pecho en máquina';

type Tab = 'register' | 'history' | 'progress';

type Membership = {
  id: string;
  group_id: string;
};

type Exercise = {
  code: string;
  name: string;
};

type WorkoutSetRow = {
  id: string;
  exercise_name_snapshot: string;
  workout_date: string;
  weight_kg: number;
  reps: number;
  created_at: string;
};

type Feedback = {
  type: 'error' | 'success';
  text: string;
};

function formatWorkoutDate(date: string) {
  return new Intl.DateTimeFormat('es-ES', {
    dateStyle: 'long',
    timeZone: 'Europe/Madrid',
  }).format(new Date(`${date}T12:00:00+02:00`));
}

function isBetterSet(candidate: WorkoutSetRow, current: WorkoutSetRow) {
  return candidate.weight_kg > current.weight_kg
    || (candidate.weight_kg === current.weight_kg && candidate.reps > current.reps);
}

function ProgressChart({ rows }: { rows: WorkoutSetRow[] }) {
  const points = toProgressPoints(rows);
  const width = 640;
  const height = 260;
  const inset = 34;

  if (points.length === 0) {
    return <p className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">Registra tu primera serie para ver la evolución.</p>;
  }

  const weights = points.map((point) => point.weightKg);
  const minWeight = Math.min(...weights);
  const maxWeight = Math.max(...weights);
  const weightRange = Math.max(maxWeight - minWeight, 1);
  const plotWidth = width - inset * 2;
  const plotHeight = height - inset * 2;
  const chartPoints = points.map((point, index) => ({
    ...point,
    x: inset + (points.length === 1 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth),
    y: inset + ((maxWeight - point.weightKg) / weightRange) * plotHeight,
  }));
  const polyline = chartPoints.map(({ x, y }) => `${x},${y}`).join(' ');

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Progreso del mejor peso diario en press de pecho"
        className="min-w-[560px]"
      >
        <title>Progreso del mejor peso diario</title>
        <line x1={inset} y1={height - inset} x2={width - inset} y2={height - inset} stroke="#cbd5e1" />
        <polyline points={polyline} fill="none" stroke="#f43f5e" strokeWidth="4" strokeLinejoin="round" />
        {chartPoints.map((point) => (
          <g key={point.date}>
            <circle cx={point.x} cy={point.y} r="6" fill="#f43f5e" />
            <text x={point.x} y={point.y - 12} textAnchor="middle" className="fill-slate-700 text-[12px] font-semibold">
              {point.weightKg} kg · {point.reps} rep.
            </text>
            <text x={point.x} y={height - 12} textAnchor="middle" className="fill-slate-500 text-[11px]">
              {new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit' }).format(new Date(`${point.date}T12:00:00+02:00`))}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

export default function TrainingPage() {
  const router = useRouter();
  const today = madridDateString();
  const [tab, setTab] = useState<Tab>('register');
  const [loading, setLoading] = useState(true);
  const [loadingSets, setLoadingSets] = useState(false);
  const [saving, setSaving] = useState(false);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [userId, setUserId] = useState('');
  const [exercise, setExercise] = useState<Exercise>({ code: EXERCISE_CODE, name: EXERCISE_NAME });
  const [sets, setSets] = useState<WorkoutSetRow[]>([]);
  const [workoutDate, setWorkoutDate] = useState(today);
  const [weightKg, setWeightKg] = useState('');
  const [reps, setReps] = useState('');
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  useEffect(() => {
    let active = true;

    async function checkAccess() {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      const session = sessionData.session;
      if (!active) return;
      if (sessionError || !session) {
        router.replace('/');
        return;
      }

      const membershipResult = await supabase
        .from('group_memberships')
        .select('id, group_id')
        .eq('user_id', session.user.id)
        .eq('status', 'active')
        .maybeSingle();
      if (!active) return;
      const activeMembership = membershipResult.data as Membership | null;
      if (membershipResult.error || !activeMembership) {
        router.replace('/');
        return;
      }

      const [rolesResult, featuresResult] = await Promise.all([
        supabase
          .from('user_roles')
          .select('role_code')
          .eq('membership_id', activeMembership.id),
        supabase.rpc('get_my_features'),
      ]);
      if (!active) return;
      const isGymPatient = !rolesResult.error
        && (rolesResult.data ?? []).some((row) => (row as { role_code: string }).role_code === 'gym_patient');
      const { canTrackGymWorkouts } = featuresResult.error
        ? deriveFeatureCapabilities([])
        : deriveFeatureCapabilities(normalizeFeatureRows(featuresResult.data));
      if (!isGymPatient || !canTrackGymWorkouts) {
        router.replace('/');
        return;
      }

      const [exerciseResult, setsResult] = await Promise.all([
        supabase
          .from('gym_exercises')
          .select('code, name')
          .eq('code', EXERCISE_CODE)
          .maybeSingle(),
        supabase
          .from('gym_workout_sets')
          .select('id, exercise_name_snapshot, workout_date, weight_kg, reps, created_at')
          .eq('user_id', session.user.id)
          .eq('exercise_code', EXERCISE_CODE)
          .order('workout_date', { ascending: false })
          .order('created_at', { ascending: true }),
      ]);
      if (!active) return;

      setMembership(activeMembership);
      setUserId(session.user.id);
      if (exerciseResult.data) setExercise(exerciseResult.data as Exercise);
      if (setsResult.error) {
        setFeedback({ type: 'error', text: 'No se pudieron cargar tus entrenamientos.' });
      } else {
        setSets((setsResult.data ?? []) as WorkoutSetRow[]);
      }
      setLoading(false);
    }

    void checkAccess();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) router.replace('/');
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [router]);

  const setsForSelectedDay = useMemo(
    () => sets.filter((row) => row.workout_date === workoutDate),
    [sets, workoutDate],
  );

  const historyGroups = useMemo(() => {
    const grouped = new Map<string, WorkoutSetRow[]>();
    for (const row of sets) {
      const group = grouped.get(row.workout_date) ?? [];
      group.push(row);
      grouped.set(row.workout_date, group);
    }
    return [...grouped.entries()].map(([date, rows]) => ({
      date,
      rows,
      best: rows.reduce((best, row) => isBetterSet(row, best) ? row : best),
    }));
  }, [sets]);

  async function registerSet(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!membership || !userId || saving) return;
    setFeedback(null);

    if (workoutDate < today) {
      setFeedback({ type: 'error', text: 'No se pueden registrar series en fechas anteriores a hoy.' });
      return;
    }

    let validated: { weightKg: number; reps: number };
    try {
      validated = validateWorkoutSet({ weightKg: Number(weightKg), reps: Number(reps) });
    } catch (error) {
      setFeedback({
        type: 'error',
        text: error instanceof Error ? error.message : 'Revisa el peso y las repeticiones.',
      });
      return;
    }

    setSaving(true);
    setLoadingSets(true);
    const { data, error } = await supabase
      .from('gym_workout_sets')
      .insert({
        user_id: userId,
        group_id: membership.group_id,
        exercise_code: exercise.code,
        exercise_name_snapshot: exercise.name,
        workout_date: workoutDate,
        weight_kg: validated.weightKg,
        reps: validated.reps,
      })
      .select('id, exercise_name_snapshot, workout_date, weight_kg, reps, created_at')
      .single();

    if (error || !data) {
      setFeedback({ type: 'error', text: 'No se pudo guardar la serie. Inténtalo de nuevo.' });
    } else {
      setSets((current) => [data as WorkoutSetRow, ...current]);
      setWeightKg('');
      setReps('');
      setFeedback({ type: 'success', text: 'Serie guardada.' });
    }
    setLoadingSets(false);
    setSaving(false);
  }

  if (loading) {
    return <main className="theme-page flex min-h-screen items-center justify-center text-sm text-slate-500">Cargando entrenamiento…</main>;
  }

  return (
    <main className="theme-page min-h-screen text-slate-700">
      <header className="border-b border-rose-100 bg-white/90 px-5 py-6 shadow-sm backdrop-blur sm:px-8">
        <div className="mx-auto flex max-w-5xl flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-rose-400">
              <Dumbbell size={17} /> Área de gimnasio
            </p>
            <h1 className="mt-2 text-3xl font-bold text-slate-800">Entrenamiento</h1>
            <p className="mt-1 text-sm text-slate-500">Registra tus series y sigue tu evolución.</p>
          </div>
          <ViewNavigation current="training" />
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-5 py-7 sm:px-8">
        <section className="rounded-3xl border border-rose-100 bg-gradient-to-br from-rose-50 to-violet-50 p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <span className="rounded-2xl bg-white p-3 text-rose-500 shadow-sm"><Dumbbell size={24} /></span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-rose-400">Ejercicio 01</p>
              <h2 className="mt-1 text-xl font-bold text-slate-800">{exercise.name}</h2>
            </div>
          </div>
        </section>

        <div className="mt-6 grid grid-cols-3 gap-2 rounded-2xl bg-slate-100 p-1.5" role="tablist" aria-label="Secciones de entrenamiento">
          {([
            { id: 'register' as const, label: 'Registrar' },
            { id: 'history' as const, label: 'Historial' },
            { id: 'progress' as const, label: 'Progreso' },
          ]).map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => setTab(item.id)}
              className={`rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                tab === item.id ? 'bg-white text-rose-500 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >{item.label}</button>
          ))}
        </div>

        {feedback && (
          <p
            className={`mt-5 rounded-2xl px-4 py-3 text-sm ${feedback.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}
            role={feedback.type === 'error' ? 'alert' : 'status'}
          >
            {feedback.text}
          </p>
        )}

        {tab === 'register' && (
          <div className="mt-6 grid gap-5 md:grid-cols-2">
            <form onSubmit={registerSet} className="rounded-3xl bg-white p-6 shadow-sm">
              <div className="mb-5 flex items-center gap-3">
                <Plus className="text-rose-500" size={20} />
                <h2 className="text-lg font-bold text-slate-800">Nueva serie</h2>
              </div>
              <label className="block text-xs font-semibold text-slate-600">
                Fecha
                <input
                  type="date"
                  min={today}
                  value={workoutDate}
                  onChange={(event) => setWorkoutDate(event.target.value)}
                  disabled={saving}
                  required
                  className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none ring-rose-200 focus:ring-2"
                />
              </label>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <label className="text-xs font-semibold text-slate-600">
                  Peso (kg)
                  <input
                    type="number"
                    aria-label="Peso (kg)"
                    min="0.01"
                    step="0.01"
                    value={weightKg}
                    onChange={(event) => setWeightKg(event.target.value)}
                    disabled={saving}
                    required
                    className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none ring-rose-200 focus:ring-2"
                  />
                </label>
                <label className="text-xs font-semibold text-slate-600">
                  Repeticiones
                  <input
                    type="number"
                    aria-label="Repeticiones"
                    min="1"
                    step="1"
                    value={reps}
                    onChange={(event) => setReps(event.target.value)}
                    disabled={saving}
                    required
                    className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none ring-rose-200 focus:ring-2"
                  />
                </label>
              </div>
              <button
                type="submit"
                disabled={saving}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-800 px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
              >
                <Plus size={17} /> {saving ? 'Guardando…' : 'Guardar serie'}
              </button>
            </form>

            <section className={`rounded-3xl bg-white p-6 shadow-sm ${loadingSets ? 'opacity-60' : ''}`}>
              <div className="mb-5 flex items-center gap-3">
                <CalendarDays className="text-rose-500" size={20} />
                <div>
                  <h2 className="font-bold text-slate-800">Series del día</h2>
                  <p className="text-xs text-slate-400">{formatWorkoutDate(workoutDate)}</p>
                </div>
              </div>
              {setsForSelectedDay.length === 0 ? (
                <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">Aún no hay series en esta fecha.</p>
              ) : (
                <ol className="space-y-3">
                  {setsForSelectedDay.map((row, index) => (
                    <li key={row.id} className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                      <span className="text-sm font-semibold text-slate-500">Serie {index + 1}</span>
                      <span className="font-bold text-slate-800">{row.weight_kg} kg × {row.reps}</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
        )}

        {tab === 'history' && (
          <section className="mt-6 rounded-3xl bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <Activity className="text-rose-500" size={20} />
              <div>
                <h2 className="font-bold text-slate-800">Historial de series</h2>
                <p className="text-xs text-slate-500">El histórico es de solo lectura para conservar lo registrado.</p>
              </div>
            </div>
            {historyGroups.length === 0 ? (
              <p className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">Todavía no hay entrenamientos guardados.</p>
            ) : (
              <div className="space-y-5">
                {historyGroups.map((group) => (
                  <article key={group.date}>
                    <h3 className="mb-2 text-sm font-bold capitalize text-slate-700">{formatWorkoutDate(group.date)}</h3>
                    <ol className="space-y-2">
                      {group.rows.map((row, index) => {
                        const best = row.id === group.best.id;
                        return (
                          <li key={row.id} className={`flex items-center justify-between rounded-2xl border px-4 py-3 ${best ? 'border-amber-200 bg-amber-50' : 'border-slate-100'}`}>
                            <span className="text-sm text-slate-500">Serie {index + 1}</span>
                            <span className="text-right">
                              <span className="block font-bold text-slate-800">{row.weight_kg} kg × {row.reps}</span>
                              {best && <span className="text-xs font-semibold text-amber-700">Mejor serie</span>}
                            </span>
                          </li>
                        );
                      })}
                    </ol>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {tab === 'progress' && (
          <section className="mt-6 rounded-3xl bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <TrendingUp className="text-rose-500" size={20} />
              <div>
                <h2 className="font-bold text-slate-800">Progreso</h2>
                <p className="text-xs text-slate-500">Mejor peso diario; las repeticiones aparecen como contexto.</p>
              </div>
            </div>
            <ProgressChart rows={sets} />
          </section>
        )}
      </div>
    </main>
  );
}
