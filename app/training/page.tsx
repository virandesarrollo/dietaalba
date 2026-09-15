'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Dumbbell, Plus, X } from 'lucide-react';
import { adjustWorkoutValue, buildWorkoutExerciseCards, validateWorkoutSet } from '@/lib/gym-workouts.js';
import { deriveFeatureCapabilities, normalizeFeatureRows } from '@/lib/feature-permissions.js';
import { madridDateString } from '@/lib/historical-date.js';
import { supabase } from '@/lib/supabase';

type Membership = { id: string; group_id: string };
type Exercise = { code: string; name: string };
type DailyExercise = { id: string; exercise_code: string; exercise_name_snapshot: string };
type WorkoutSet = { id: string; exercise_code: string; weight_kg: number; reps: number; created_at: string };
type RoleRow = { role_code: string };

function shiftDate(date: string, amount: number) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + amount);
  return value.toISOString().slice(0, 10);
}

function StepControl({ label, value, delta, minimum, suffix, onChange }: {
  label: string; value: number; delta: number; minimum: number; suffix: string; onChange: (value: number) => void;
}) {
  return <div><p className="mb-2 text-center text-xs font-semibold text-slate-500">{label}</p><div className="flex items-center gap-2"><button type="button" aria-label={`Restar ${label}`} onClick={() => onChange(adjustWorkoutValue(value, -delta, minimum))} className="min-h-12 min-w-12 rounded-2xl bg-slate-100 text-xl font-bold">−</button><label className="min-w-0 flex-1"><span className="sr-only">{label}</span><input type="number" min={minimum} step={delta} value={value} onChange={(event) => onChange(Number(event.target.value))} className="min-h-12 w-full rounded-2xl border text-center font-bold" /></label><button type="button" aria-label={`Sumar ${label}`} onClick={() => onChange(adjustWorkoutValue(value, delta, minimum))} className="min-h-12 min-w-12 rounded-2xl bg-slate-100 text-xl font-bold">+</button></div><p className="mt-1 text-center text-xs text-slate-400">{suffix}</p></div>;
}

export default function TrainingPage() {
  const router = useRouter();
  const today = madridDateString();
  const [workoutDate, setWorkoutDate] = useState(today);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [userId, setUserId] = useState('');
  const [catalog, setCatalog] = useState<Exercise[]>([]);
  const [dailyExercises, setDailyExercises] = useState<DailyExercise[]>([]);
  const [sets, setSets] = useState<WorkoutSet[]>([]);
  const [gymWeightStep, setGymWeightStep] = useState(1);
  const [showPicker, setShowPicker] = useState(false);
  const [draftExerciseCode, setDraftExerciseCode] = useState<string | null>(null);
  const [editingSetId, setEditingSetId] = useState<string | null>(null);
  const [draftWeight, setDraftWeight] = useState(1);
  const [draftReps, setDraftReps] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');
  const historical = workoutDate < today;

  useEffect(() => {
    let current = true;
    async function load() {
      setLoading(true);
      setDraftExerciseCode(null);
      setEditingSetId(null);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace('/'); return; }
      const membershipResult = await supabase.from('group_memberships').select('id, group_id').eq('user_id', session.user.id).eq('status', 'active').maybeSingle();
      const activeMembership = membershipResult.data as Membership | null;
      if (!activeMembership) { router.replace('/'); return; }
      const [rolesResult, featuresResult] = await Promise.all([
        supabase.from('user_roles').select('role_code').eq('membership_id', activeMembership.id),
        supabase.rpc('get_my_features'),
      ]);
      const isPatient = (rolesResult.data ?? []).some((row) => (row as RoleRow).role_code === 'gym_patient');
      const canTrackGymWorkouts = deriveFeatureCapabilities(featuresResult.error ? [] : normalizeFeatureRows(featuresResult.data)).canTrackGymWorkouts;
      if (!isPatient || !canTrackGymWorkouts) { router.replace('/'); return; }
      const [catalogResult, dailyResult, setsResult, stepResult] = await Promise.all([
        supabase.from('gym_exercises').select('code, name').order('name'),
        supabase.from('gym_workout_exercises').select('id, exercise_code, exercise_name_snapshot').eq('user_id', session.user.id).eq('workout_date', workoutDate),
        supabase.from('gym_workout_sets').select('id, exercise_code, weight_kg, reps, created_at').eq('user_id', session.user.id).eq('workout_date', workoutDate).order('created_at'),
        supabase.rpc('get_my_gym_weight_step'),
      ]);
      if (!current) return;
      setMembership(activeMembership); setUserId(session.user.id);
      setCatalog((catalogResult.data ?? []) as Exercise[]); setDailyExercises((dailyResult.data ?? []) as DailyExercise[]); setSets((setsResult.data ?? []) as WorkoutSet[]);
      if (typeof stepResult.data === 'number' && stepResult.data > 0) setGymWeightStep(stepResult.data);
      setFeedback(catalogResult.error || dailyResult.error || setsResult.error ? 'No se pudo cargar el entrenamiento.' : '');
      setLoading(false);
    }
    void load();
    return () => { current = false; };
  }, [router, workoutDate]);

  const cards = useMemo(() => buildWorkoutExerciseCards(dailyExercises, sets), [dailyExercises, sets]);
  const availableExercises = catalog.filter((exercise) => !dailyExercises.some((daily) => daily.exercise_code === exercise.code));

  async function addExercise(exercise: Exercise) {
    if (!membership || historical || saving) return;
    setSaving(true);
    const result = await supabase.from('gym_workout_exercises').insert({ user_id: userId, group_id: membership.group_id, exercise_code: exercise.code, workout_date: workoutDate }).select('id, exercise_code, exercise_name_snapshot').single();
    if (result.error || !result.data) setFeedback('No se pudo añadir el ejercicio.');
    else { setDailyExercises((value) => [...value, result.data as DailyExercise]); setShowPicker(false); }
    setSaving(false);
  }

  function beginNew(exerciseCode: string) {
    const previous = [...sets].reverse().find((set) => set.exercise_code === exerciseCode);
    setDraftExerciseCode(exerciseCode); setEditingSetId(null); setDraftWeight(previous?.weight_kg ?? gymWeightStep); setDraftReps(previous?.reps ?? 1);
  }

  function beginEdit(set: WorkoutSet) {
    setDraftExerciseCode(set.exercise_code); setEditingSetId(set.id); setDraftWeight(set.weight_kg); setDraftReps(set.reps);
  }

  function cancelDraft() { setDraftExerciseCode(null); setEditingSetId(null); }

  async function saveDraft(event: FormEvent, exerciseCode: string, exerciseName: string) {
    event.preventDefault();
    if (!membership || historical || saving) return;
    try {
      const validated = validateWorkoutSet({ weightKg: draftWeight, reps: draftReps });
      setSaving(true); setFeedback('');
      const query = editingSetId
        ? supabase.from('gym_workout_sets').update({ weight_kg: validated.weightKg, reps: validated.reps }).eq('id', editingSetId).eq('user_id', userId).eq('workout_date', workoutDate)
        : supabase.from('gym_workout_sets').insert({ user_id: userId, group_id: membership.group_id, exercise_code: exerciseCode, exercise_name_snapshot: exerciseName, workout_date: workoutDate, weight_kg: validated.weightKg, reps: validated.reps });
      const result = await query.select('id, exercise_code, weight_kg, reps, created_at').single();
      if (result.error || !result.data) setFeedback(editingSetId ? 'No se pudo actualizar la serie.' : 'No se pudo guardar la serie.');
      else {
        const saved = result.data as WorkoutSet;
        setSets((currentSets) => editingSetId ? currentSets.map((set) => set.id === saved.id ? saved : set) : [...currentSets, saved]);
        cancelDraft();
      }
    } catch (error) { setFeedback(error instanceof Error ? error.message : 'Revisa la serie.'); }
    finally { setSaving(false); }
  }

  if (loading) return <main className="theme-page flex min-h-screen items-center justify-center">Cargando entrenamiento…</main>;
  return <main className="theme-page mx-auto min-h-screen max-w-md p-5 pb-24"><header className="flex items-center justify-between"><button type="button" className="min-h-12 min-w-12" disabled={workoutDate <= today} onClick={() => setWorkoutDate(shiftDate(workoutDate, -1))}><ChevronLeft /></button><h1 className="font-bold">Entrenamiento</h1><button type="button" className="min-h-12 min-w-12" onClick={() => setWorkoutDate(shiftDate(workoutDate, 1))}><ChevronRight /></button></header><p className="mb-4 text-center text-sm">{workoutDate}</p>{feedback && <p role="alert" className="mb-4 rounded-2xl bg-red-50 p-3 text-red-700">{feedback}</p>}{historical && <p>El histórico es de solo lectura.</p>}{cards.map((card) => <article key={card.id} className="mb-4 rounded-3xl bg-white p-5 shadow-sm"><h2 className="border-b pb-3 font-bold">{card.name}</h2>{card.sets.map((item) => { const rawSet = sets.find((set) => set.id === item.id)!; return editingSetId === item.id ? <form key={item.id} onSubmit={(event) => void saveDraft(event, card.exerciseCode, card.name)} className="border-b py-4"><div className="grid grid-cols-2 gap-3"><StepControl label="Peso" value={draftWeight} delta={gymWeightStep} minimum={0.01} suffix="kg" onChange={setDraftWeight} /><StepControl label="Repeticiones" value={draftReps} delta={1} minimum={1} suffix="reps" onChange={setDraftReps} /></div><div className="mt-3 flex gap-2"><button disabled={saving} className="min-h-12 flex-1 rounded-2xl bg-slate-800 text-white">Guardar</button><button type="button" onClick={cancelDraft} className="min-h-12 flex-1 rounded-2xl bg-slate-100">Cancelar</button></div></form> : <div key={item.id} className="flex min-h-14 items-center justify-between border-b py-2"><b>{item.weightKg} kg</b><span>{item.reps} reps</span>{!historical && <button type="button" onClick={() => beginEdit(rawSet)} className="min-h-12 rounded-xl px-3 text-rose-500">Editar</button>}</div>; })}{draftExerciseCode === card.exerciseCode && editingSetId === null && <form onSubmit={(event) => void saveDraft(event, card.exerciseCode, card.name)} className="py-4"><div className="grid grid-cols-2 gap-3"><StepControl label="Peso" value={draftWeight} delta={gymWeightStep} minimum={0.01} suffix="kg" onChange={setDraftWeight} /><StepControl label="Repeticiones" value={draftReps} delta={1} minimum={1} suffix="reps" onChange={setDraftReps} /></div><div className="mt-3 flex gap-2"><button disabled={saving} className="min-h-12 flex-1 rounded-2xl bg-slate-800 text-white">Guardar</button><button type="button" onClick={cancelDraft} className="min-h-12 flex-1 rounded-2xl bg-slate-100">Cancelar</button></div></form>}{!historical && draftExerciseCode !== card.exerciseCode && <button type="button" className="mt-3 min-h-12 w-full rounded-2xl bg-rose-50" onClick={() => beginNew(card.exerciseCode)}>Añadir serie</button>}</article>)}{!historical && <button type="button" className="min-h-12 w-full rounded-2xl bg-slate-800 text-white" onClick={() => setShowPicker(true)}><Plus className="inline" /> Añadir ejercicio</button>}{showPicker && <section className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-md rounded-t-3xl bg-white p-5 shadow-2xl"><div className="flex justify-between"><h2 className="font-bold">Elige ejercicio</h2><button type="button" onClick={() => setShowPicker(false)} className="min-h-12 min-w-12"><X /></button></div>{availableExercises.map((exercise) => <button key={exercise.code} disabled={saving} className="min-h-12 w-full text-left" onClick={() => void addExercise(exercise)}>{exercise.name}</button>)}</section>}<nav className="fixed bottom-0 inset-x-0 z-40 mx-auto flex max-w-md justify-around bg-white"><button type="button" className="min-h-12" onClick={() => router.push('/')}>Plan diario</button><span className="flex min-h-12 items-center"><Dumbbell /> Entrenamiento</span></nav></main>;
}
