'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp, Check, ChevronLeft, ChevronRight, Plus, Trash2, X } from 'lucide-react';
import { AppMobileNavigation } from '@/components/AppMobileNavigation';
import { useConfirmDialog } from '@/components/ConfirmDialogProvider';
import { deriveAppViews, deriveAvailableViews, deriveCapabilities, type PersonalAppView, type RoleCode } from '@/lib/authz.js';
import { adjustWorkoutValue, buildWorkoutExerciseCards, decideFocusTrapTarget, formatWorkoutDate, groupAvailableExercises, validateWorkoutSet } from '@/lib/gym-workouts.js';
import { deriveFeatureCapabilities, normalizeFeatureRows } from '@/lib/feature-permissions.js';
import { madridDateString } from '@/lib/historical-date.js';
import { supabase } from '@/lib/supabase';
import { advanceAuthIdentity } from '@/lib/view-capabilities-guard.js';

type Membership = { id: string; group_id: string };
type ExerciseGroup = { code: string; name: string; sort_order: number; is_active: boolean };
type Exercise = {
  code: string;
  name: string;
  group_id: string;
  is_active: boolean;
  gym_exercise_groups: ExerciseGroup | ExerciseGroup[];
};
type DailyExercise = {
  id: string;
  exercise_code: string;
  exercise_name_snapshot: string;
  position: number | null;
  created_at: string;
};
type WorkoutSet = {
  id: string;
  exercise_code: string;
  weight_kg: number;
  reps: number;
  is_completed: boolean;
  created_at: string;
};
type RoleRow = { role_code: string };

function shiftDate(date: string, amount: number) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + amount);
  return value.toISOString().slice(0, 10);
}

function StepControl({ label, value, delta, minimum, suffix, inputStep, onChange }: { label: string; value: number; delta: number; minimum: number; suffix: string; inputStep?: number | 'any'; onChange: (value: number) => void }) {
  return (
    <div>
      <p className="mb-2 text-center text-xs font-semibold text-slate-500">{label}</p>
      <div className="flex items-center gap-2">
        <button type="button" aria-label={`Restar ${label}`} onClick={() => onChange(adjustWorkoutValue(value, -delta, minimum))} className="min-h-14 min-w-14 rounded-2xl bg-slate-100 text-2xl font-bold text-slate-800">
          −
        </button>
        <label className="min-w-0 flex-1">
          <span className="sr-only">{label}</span>
          <input type="number" min={minimum} step={inputStep ?? (minimum < 1 ? 'any' : delta)} value={value} onChange={(event) => onChange(Number(event.target.value))} className="min-h-14 w-full rounded-2xl border text-center text-lg font-bold" />
        </label>
        <button type="button" aria-label={`Sumar ${label}`} onClick={() => onChange(adjustWorkoutValue(value, delta, minimum))} className="min-h-14 min-w-14 rounded-2xl bg-slate-100 text-2xl font-bold text-slate-800">
          +
        </button>
      </div>
      <p className="mt-1 text-center text-xs text-slate-400">{suffix}</p>
    </div>
  );
}

export default function TrainingPage() {
  const router = useRouter();
  const confirmDialog = useConfirmDialog();
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
  const [appNavigationViews, setAppNavigationViews] = useState<PersonalAppView[]>([]);
  const pickerDialogRef = useRef<HTMLElement>(null);
  const pickerTriggerRef = useRef<HTMLButtonElement>(null);
  const pickerWasOpen = useRef(false);
  const mutationLockRef = useRef(false);
  const mutationTokenRef = useRef(0);
  const workoutGenerationRef = useRef(0);
  const authGenerationRef = useRef(0);
  const currentUserIdRef = useRef<string | null>(null);
  const authInitializedRef = useRef(false);
  const requestGenerationRef = useRef(0);
  const [authIdentity, setAuthIdentity] = useState<{ generation: number; userId: string } | null>(null);

  useEffect(() => {
    if (!showPicker) {
      if (pickerWasOpen.current) {
        pickerWasOpen.current = false;
        pickerTriggerRef.current?.focus();
      }
      return;
    }

    pickerWasOpen.current = true;
    pickerDialogRef.current?.focus();
    function closeWithEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setShowPicker(false);
    }
    document.addEventListener('keydown', closeWithEscape);
    return () => document.removeEventListener('keydown', closeWithEscape);
  }, [showPicker]);

  useEffect(() => {
    if (!showPicker) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [showPicker]);

  useEffect(() => {
    let active = true;
    let receivedAuthEvent = false;
    const clearIdentityState = () => {
      setMembership(null); setUserId(''); setCatalog([]); setDailyExercises([]); setSets([]);
      setDraftExerciseCode(null); setEditingSetId(null); setAppNavigationViews([]); setFeedback(''); setShowPicker(false);
      mutationTokenRef.current += 1; mutationLockRef.current = false; setSaving(false);
    };
    const applySession = (nextUserId: string | null) => {
      const transition = advanceAuthIdentity({ initialized: authInitializedRef.current, generation: authGenerationRef.current, userId: currentUserIdRef.current }, nextUserId);
      if (!transition.changed) return;
      authInitializedRef.current = transition.state.initialized;
      authGenerationRef.current = transition.state.generation;
      currentUserIdRef.current = transition.state.userId;
      requestGenerationRef.current += 1; workoutGenerationRef.current += 1;
      clearIdentityState(); setLoading(Boolean(nextUserId));
      setAuthIdentity(nextUserId ? { generation: transition.state.generation, userId: nextUserId } : null);
      if (!nextUserId) router.replace('/');
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => { receivedAuthEvent = true; applySession(session?.user.id ?? null); });
    supabase.auth.getSession().then(({ data }) => { if (active && !receivedAuthEvent) applySession(data.session?.user.id ?? null); }).catch(() => { if (active && !receivedAuthEvent) applySession(null); });
    return () => { active = false; authGenerationRef.current += 1; currentUserIdRef.current = null; requestGenerationRef.current += 1; subscription.unsubscribe(); };
  }, [router]);

  useEffect(() => {
    if (!authIdentity) return;
    const { generation, userId: activeUserId } = authIdentity;
    const requestGeneration = ++requestGenerationRef.current;
    const requestDate = workoutDate;
    const isCurrent = () => generation === authGenerationRef.current && activeUserId === currentUserIdRef.current && requestGeneration === requestGenerationRef.current && requestDate === workoutDate;
    async function load() {
      setLoading(true);
      setShowPicker(false);
      setDraftExerciseCode(null);
      setEditingSetId(null);
      try {
      const membershipResult = await supabase.from('group_memberships').select('id, group_id').eq('user_id', activeUserId).eq('status', 'active').maybeSingle();
      if (!isCurrent()) return;
      const activeMembership = membershipResult.data as Membership | null;
      if (!activeMembership) {
        router.replace('/');
        return;
      }
      const [rolesResult, featuresResult] = await Promise.all([supabase.from('user_roles').select('role_code').eq('membership_id', activeMembership.id), supabase.rpc('get_my_features')]);
      if (!isCurrent()) return;
      const roles = (rolesResult.data ?? []).map((row) => (row as RoleRow).role_code as RoleCode);
      const isPatient = roles.includes('gym_patient');
      const featureCapabilities = deriveFeatureCapabilities(featuresResult.error ? [] : normalizeFeatureRows(featuresResult.data));
      const canTrackGymWorkouts = featureCapabilities.canTrackGymWorkouts;
      if (!isPatient || !canTrackGymWorkouts) {
        router.replace('/');
        return;
      }
      const [catalogResult, dailyResult, setsResult, stepResult] = await Promise.all([supabase.from('gym_exercises').select('code, name, group_id, is_active, gym_exercise_groups!inner(code, name, sort_order, is_active)').eq('is_active', true).eq('gym_exercise_groups.is_active', true), supabase.from('gym_workout_exercises').select('id, exercise_code, exercise_name_snapshot, position, created_at').eq('user_id', activeUserId).eq('workout_date', requestDate), supabase.from('gym_workout_sets').select('id, exercise_code, weight_kg, reps, is_completed, created_at').eq('user_id', activeUserId).eq('workout_date', requestDate).order('created_at'), supabase.rpc('get_my_gym_weight_step')]);
      if (!isCurrent()) return;
      setAppNavigationViews(deriveAppViews(deriveAvailableViews(deriveCapabilities(false, roles), featureCapabilities)));
      setMembership(activeMembership);
      setUserId(activeUserId);
      setCatalog((catalogResult.data ?? []) as Exercise[]);
      setDailyExercises((dailyResult.data ?? []) as DailyExercise[]);
      setSets((setsResult.data ?? []) as WorkoutSet[]);
      if (typeof stepResult.data === 'number' && stepResult.data > 0) setGymWeightStep(stepResult.data);
      setFeedback(catalogResult.error || dailyResult.error || setsResult.error ? 'No se pudo cargar el entrenamiento.' : '');
      } catch { if (isCurrent()) setFeedback('No se pudo cargar el entrenamiento.'); }
      finally { if (isCurrent()) setLoading(false); }
    }
    void load();
    return () => { requestGenerationRef.current += 1; };
  }, [authIdentity, router, workoutDate]);

  const cards = useMemo(() => buildWorkoutExerciseCards(dailyExercises, sets), [dailyExercises, sets]);
  const availableExerciseGroups = useMemo(
    () =>
      groupAvailableExercises(
        catalog,
        dailyExercises.map((exercise) => exercise.exercise_code),
      ),
    [catalog, dailyExercises],
  );

  function changeWorkoutDate(amount: number) {
    if (mutationLockRef.current || saving) return;
    workoutGenerationRef.current += 1;
    setWorkoutDate((current) => shiftDate(current, amount));
  }

  function selectWorkoutDate(nextDate: string) {
    if (!nextDate || mutationLockRef.current || saving) return;
    workoutGenerationRef.current += 1;
    setWorkoutDate(nextDate);
  }

  async function addExercise(exercise: Pick<Exercise, 'code' | 'name'>) {
    if (!membership || mutationLockRef.current) return;
    mutationLockRef.current = true;
    const mutationToken = ++mutationTokenRef.current;
    const authGeneration = authGenerationRef.current;
    const mutationUserId = currentUserIdRef.current;
    const mutationGeneration = workoutGenerationRef.current;
    const mutationDate = workoutDate;
    setSaving(true);
    try {
      const result = await supabase
        .from('gym_workout_exercises')
        .insert({
          user_id: userId,
          group_id: membership.group_id,
          exercise_code: exercise.code,
          workout_date: workoutDate,
        })
        .select('id, exercise_code, exercise_name_snapshot, position, created_at')
        .single();
      if (authGeneration !== authGenerationRef.current || mutationUserId !== currentUserIdRef.current || mutationGeneration !== workoutGenerationRef.current || mutationDate !== workoutDate) return;
      if (result.error || !result.data) setFeedback('No se pudo añadir el ejercicio.');
      else {
        setDailyExercises((value) => [...value, result.data as DailyExercise]);
        setShowPicker(false);
      }
    } finally {
      if (mutationToken === mutationTokenRef.current) { mutationLockRef.current = false; setSaving(false); }
    }
  }

  function beginNew(exerciseCode: string) {
    const previous = [...sets].reverse().find((set) => set.exercise_code === exerciseCode);
    setDraftExerciseCode(exerciseCode);
    setEditingSetId(null);
    setDraftWeight(previous?.weight_kg ?? gymWeightStep);
    setDraftReps(previous?.reps ?? 1);
  }

  function beginEdit(set: WorkoutSet) {
    setDraftExerciseCode(set.exercise_code);
    setEditingSetId(set.id);
    setDraftWeight(set.weight_kg);
    setDraftReps(set.reps);
  }

  function cancelDraft() {
    setDraftExerciseCode(null);
    setEditingSetId(null);
  }

  async function saveDraft(event: FormEvent, exerciseCode: string, exerciseName: string) {
    event.preventDefault();
    if (!membership || mutationLockRef.current) return;
    mutationLockRef.current = true;
    const mutationToken = ++mutationTokenRef.current;
    const authGeneration = authGenerationRef.current;
    const mutationUserId = currentUserIdRef.current;
    const mutationGeneration = workoutGenerationRef.current;
    const mutationDate = workoutDate;
    try {
      const validated = validateWorkoutSet({
        weightKg: draftWeight,
        reps: draftReps,
      });
      setSaving(true);
      setFeedback('');
      const query = editingSetId
        ? supabase.from('gym_workout_sets').update({ weight_kg: validated.weightKg, reps: validated.reps }).eq('id', editingSetId).eq('user_id', userId).eq('workout_date', workoutDate)
        : supabase.from('gym_workout_sets').insert({
            user_id: userId,
            group_id: membership.group_id,
            exercise_code: exerciseCode,
            exercise_name_snapshot: exerciseName,
            workout_date: workoutDate,
            weight_kg: validated.weightKg,
            reps: validated.reps,
            is_completed: false,
          });
      const result = await query.select('id, exercise_code, weight_kg, reps, is_completed, created_at').single();
      if (authGeneration !== authGenerationRef.current || mutationUserId !== currentUserIdRef.current || mutationGeneration !== workoutGenerationRef.current || mutationDate !== workoutDate) return;
      if (result.error || !result.data) setFeedback(editingSetId ? 'No se pudo actualizar la serie.' : 'No se pudo guardar la serie.');
      else {
        const saved = result.data as WorkoutSet;
        setSets((currentSets) => (editingSetId ? currentSets.map((set) => (set.id === saved.id ? saved : set)) : [...currentSets, saved]));
        cancelDraft();
      }
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Revisa la serie.');
    } finally {
      if (mutationToken === mutationTokenRef.current) { mutationLockRef.current = false; setSaving(false); }
    }
  }

  async function moveExercise(exercise: DailyExercise, direction: -1 | 1) {
    if (!membership || mutationLockRef.current) return;
    const orderedIds = cards.map((card) => card.id);
    const currentIndex = orderedIds.indexOf(exercise.id);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= orderedIds.length) return;
    mutationLockRef.current = true;
    const mutationToken = ++mutationTokenRef.current;
    const authGeneration = authGenerationRef.current;
    const mutationUserId = currentUserIdRef.current;
    const mutationGeneration = workoutGenerationRef.current;
    const mutationDate = workoutDate;
    setSaving(true);
    try {
      setFeedback('');
      const result = await supabase.rpc('move_my_gym_workout_exercise', { p_exercise_id: exercise.id, p_direction: direction });
      if (authGeneration !== authGenerationRef.current || mutationUserId !== currentUserIdRef.current || mutationGeneration !== workoutGenerationRef.current || mutationDate !== workoutDate) return;
      if (result.error) setFeedback('No se pudo reordenar el ejercicio.');
      else {
        const nextIds = [...orderedIds];
        [nextIds[currentIndex], nextIds[nextIndex]] = [nextIds[nextIndex], nextIds[currentIndex]];
        setDailyExercises((current) => nextIds.map((id, index) => ({ ...current.find((item) => item.id === id)!, position: (index + 1) * 10 })));
      }
    } finally {
      if (mutationToken === mutationTokenRef.current) { mutationLockRef.current = false; setSaving(false); }
    }
  }

  async function toggleSetCompleted(set: WorkoutSet) {
    if (!membership || mutationLockRef.current) return;
    mutationLockRef.current = true;
    const mutationToken = ++mutationTokenRef.current;
    const authGeneration = authGenerationRef.current;
    const mutationUserId = currentUserIdRef.current;
    const mutationGeneration = workoutGenerationRef.current;
    const mutationDate = workoutDate;
    setSaving(true);
    try {
      setFeedback('');
      const result = await supabase
        .from('gym_workout_sets')
        .update({ is_completed: !set.is_completed })
        .eq('id', set.id)
        .eq('user_id', userId)
        .eq('group_id', membership.group_id)
        .eq('workout_date', workoutDate)
        .eq('exercise_code', set.exercise_code)
        .select('id, exercise_code, weight_kg, reps, is_completed, created_at')
        .single();
      if (authGeneration !== authGenerationRef.current || mutationUserId !== currentUserIdRef.current || mutationGeneration !== workoutGenerationRef.current || mutationDate !== workoutDate) return;
      if (result.error || !result.data) setFeedback('No se pudo actualizar el estado de la serie.');
      else setSets((current) => current.map((item) => (item.id === set.id ? result.data as WorkoutSet : item)));
    } finally {
      if (mutationToken === mutationTokenRef.current) { mutationLockRef.current = false; setSaving(false); }
    }
  }

  async function deleteSet(set: WorkoutSet) {
    if (!membership || mutationLockRef.current) return;
    if (!(await confirmDialog({ title: 'Eliminar serie', message: '¿Eliminar esta serie?', confirmLabel: 'Eliminar', tone: 'danger' }))) return;
    mutationLockRef.current = true;
    const mutationToken = ++mutationTokenRef.current;
    const authGeneration = authGenerationRef.current;
    const mutationUserId = currentUserIdRef.current;
    const mutationGeneration = workoutGenerationRef.current;
    const mutationDate = workoutDate;
    setSaving(true);
    try {
      setFeedback('');
      const result = await supabase
        .from('gym_workout_sets')
        .delete()
        .eq('id', set.id)
        .eq('user_id', userId)
        .eq('group_id', membership.group_id)
        .eq('workout_date', workoutDate)
        .eq('exercise_code', set.exercise_code)
        .select('id')
        .maybeSingle();
      if (authGeneration !== authGenerationRef.current || mutationUserId !== currentUserIdRef.current || mutationGeneration !== workoutGenerationRef.current || mutationDate !== workoutDate) return;
      if (result.error || !result.data) setFeedback('No se pudo eliminar la serie.');
      else {
        const deletedId = result.data.id;
        setSets((currentSets) => currentSets.filter((item) => item.id !== deletedId));
        if (editingSetId === set.id) cancelDraft();
      }
    } finally {
      if (mutationToken === mutationTokenRef.current) { mutationLockRef.current = false; setSaving(false); }
    }
  }

  async function deleteDailyExercise(exercise: DailyExercise) {
    if (!membership || mutationLockRef.current) return;
    if (!(await confirmDialog({ title: 'Quitar ejercicio', message: '¿Quitar este ejercicio y todas sus series?', confirmLabel: 'Quitar', tone: 'danger' }))) return;
    mutationLockRef.current = true;
    const mutationToken = ++mutationTokenRef.current;
    const authGeneration = authGenerationRef.current;
    const mutationUserId = currentUserIdRef.current;
    const mutationGeneration = workoutGenerationRef.current;
    const mutationDate = workoutDate;
    setSaving(true);
    try {
      setFeedback('');
      const result = await supabase.rpc('delete_my_gym_workout_exercise', { p_exercise_id: exercise.id });
      if (authGeneration !== authGenerationRef.current || mutationUserId !== currentUserIdRef.current || mutationGeneration !== workoutGenerationRef.current || mutationDate !== workoutDate) return;
      if (result.error) setFeedback('No se pudo quitar el ejercicio.');
      else {
        setDailyExercises((current) => current.filter((item) => item.id !== exercise.id));
        setSets((current) => current.filter((item) => item.exercise_code !== exercise.exercise_code));
        if (draftExerciseCode === exercise.exercise_code) cancelDraft();
      }
    } finally {
      if (mutationToken === mutationTokenRef.current) { mutationLockRef.current = false; setSaving(false); }
    }
  }

  function handlePickerKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key !== 'Tab') return;
    const focusable = [...(pickerDialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), summary, [href], [tabindex]:not([tabindex="-1"])') ?? [])].filter((element) => {
      if (element.hasAttribute('hidden') || element.hasAttribute('disabled')) return false;
      const closedDetails = element.closest('details:not([open])');
      return !closedDetails || (element.tagName === 'SUMMARY' && element.parentElement === closedDetails);
    });
    if (focusable.length === 0) {
      event.preventDefault();
      pickerDialogRef.current?.focus();
      return;
    }
    const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const target = decideFocusTrapTarget(focusable, activeElement, event.shiftKey, activeElement === pickerDialogRef.current);
    if (target) {
      event.preventDefault();
      target.focus();
    }
  }

  if (loading) return <main className="theme-page flex min-h-screen items-center justify-center">Cargando entrenamiento…</main>;
  return (
    <main className="theme-page mx-auto min-h-screen max-w-md p-5 pb-28">
      <header className="flex items-center justify-between">
        <button type="button" aria-label="Día anterior" className="min-h-12 min-w-12" disabled={saving} onClick={() => changeWorkoutDate(-1)}>
          <ChevronLeft />
        </button>
        <h1 className="font-bold">Entrenamiento</h1>
        <button type="button" aria-label="Día siguiente" className="min-h-12 min-w-12" disabled={saving} onClick={() => changeWorkoutDate(1)}>
          <ChevronRight />
        </button>
      </header>
      <label className="relative mb-4 block cursor-pointer text-center text-sm">
        <span aria-hidden="true">{formatWorkoutDate(workoutDate)}</span>
        <input type="date" aria-label="Seleccionar fecha de entrenamiento" value={workoutDate} onChange={(event) => selectWorkoutDate(event.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
      </label>
      {feedback && (
        <p role="alert" className="mb-4 rounded-2xl bg-red-50 p-3 text-red-700">
          {feedback}
        </p>
      )}
      {cards.map((card, cardIndex) => (
        <article key={card.id} className="mb-4 rounded-3xl bg-white p-4 shadow-sm">
          <header className="flex min-h-12 items-center justify-between gap-2 border-b pb-3">
            <h2 className="min-w-0 flex-1 font-bold">{card.name}</h2>
            <div className="flex shrink-0 gap-1">
                <button type="button" disabled={saving || cardIndex === 0} aria-label={`Subir ${card.name}`} onClick={() => void moveExercise(dailyExercises.find((exercise) => exercise.id === card.id)!, -1)} className="min-h-12 min-w-12 rounded-xl bg-slate-100 text-slate-800 disabled:opacity-30">
                  <ArrowUp aria-hidden="true" className="mx-auto" />
                </button>
                <button type="button" disabled={saving || cardIndex === cards.length - 1} aria-label={`Bajar ${card.name}`} onClick={() => void moveExercise(dailyExercises.find((exercise) => exercise.id === card.id)!, 1)} className="min-h-12 min-w-12 rounded-xl bg-slate-100 text-slate-800 disabled:opacity-30">
                  <ArrowDown aria-hidden="true" className="mx-auto" />
                </button>
                <button type="button" disabled={saving} aria-label={`Quitar ${card.name}`} onClick={() => void deleteDailyExercise(dailyExercises.find((exercise) => exercise.id === card.id)!)} className="min-h-12 min-w-12 rounded-xl bg-rose-50 text-rose-500">
                  <Trash2 aria-hidden="true" className="mx-auto" />
                </button>
            </div>
          </header>
          {card.sets.map((item) => {
            const rawSet = sets.find((set) => set.id === item.id)!;
            return editingSetId === item.id ? (
              <form key={item.id} onSubmit={(event) => void saveDraft(event, card.exerciseCode, card.name)} className="border-b py-4">
                <div className="space-y-4">
                  <StepControl label="Peso" value={draftWeight} delta={gymWeightStep} minimum={0.01} suffix="kg" onChange={setDraftWeight} />
                  <StepControl label="Repeticiones" value={draftReps} delta={1} minimum={1} suffix="reps" onChange={setDraftReps} />
                </div>
                <div className="mt-3 flex gap-2">
                  <button disabled={saving} className="min-h-14 flex-1 rounded-2xl bg-slate-800 text-white">
                    Guardar
                  </button>
                  <button type="button" onClick={cancelDraft} className="min-h-14 flex-1 rounded-2xl bg-slate-100 text-slate-800">
                    Cancelar
                  </button>
                  <button type="button" disabled={saving} aria-label={`Eliminar serie ${item.weightKg} kg, ${item.reps} repeticiones`} onClick={() => void deleteSet(rawSet)} className="min-h-14 min-w-14 rounded-2xl bg-rose-50 text-rose-500">
                    <Trash2 aria-hidden="true" className="mx-auto" />
                  </button>
                </div>
              </form>
            ) : (
              <div key={item.id} className="flex items-center gap-2 border-b py-2">
                <>
                  <button type="button" disabled={saving} aria-pressed={item.isCompleted} aria-label={item.isCompleted ? 'Marcar serie como pendiente' : 'Marcar serie como realizada'} onClick={() => void toggleSetCompleted(rawSet)} className={`min-h-14 min-w-14 rounded-2xl ${item.isCompleted ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-800'}`}>
                    <Check aria-hidden="true" className={`mx-auto ${item.isCompleted ? 'opacity-100' : 'opacity-25'}`} />
                  </button>
                  <button type="button" disabled={saving} onClick={() => beginEdit(rawSet)} className={`flex min-h-14 flex-1 items-center justify-between rounded-xl px-3 text-left ${item.isCompleted ? 'line-through opacity-50' : ''}`}>
                    <b>{item.weightKg} kg</b>
                    <span>{item.reps} reps</span>
                  </button>
                </>
              </div>
            );
          })}
          {draftExerciseCode === card.exerciseCode && editingSetId === null && (
            <form onSubmit={(event) => void saveDraft(event, card.exerciseCode, card.name)} className="py-4">
              <div className="space-y-4">
                <StepControl label="Peso" value={draftWeight} delta={gymWeightStep} minimum={0.01} suffix="kg" onChange={setDraftWeight} />
                <StepControl label="Repeticiones" value={draftReps} delta={1} minimum={1} suffix="reps" onChange={setDraftReps} />
              </div>
              <div className="mt-3 flex gap-2">
                <button disabled={saving} className="min-h-14 flex-1 rounded-2xl bg-slate-800 text-white">
                  Guardar
                </button>
                <button type="button" onClick={cancelDraft} className="min-h-14 flex-1 rounded-2xl bg-slate-100 text-slate-800">
                  Cancelar
                </button>
              </div>
            </form>
          )}
          {draftExerciseCode !== card.exerciseCode && (
            <button type="button" className="mt-3 min-h-14 w-full rounded-2xl bg-rose-50 text-rose-700" onClick={() => beginNew(card.exerciseCode)}>
              Añadir serie
            </button>
          )}
        </article>
      ))}
      <button ref={pickerTriggerRef} type="button" className="min-h-14 w-full rounded-2xl bg-slate-800 text-white" onClick={() => setShowPicker(true)}>
          <Plus className="inline" /> Añadir ejercicio
      </button>
      {showPicker && (
        <div className="fixed inset-0 z-50 bg-slate-950/30">
          <section ref={pickerDialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="exercise-picker-title" onKeyDown={handlePickerKeyDown} className="absolute inset-x-0 bottom-0 mx-auto max-h-[80vh] max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl">
            <div className="flex justify-between">
              <h2 id="exercise-picker-title" className="font-bold">
                Elige ejercicio
              </h2>
              <button type="button" aria-label="Cerrar selector de ejercicios" onClick={() => setShowPicker(false)} className="min-h-12 min-w-12">
                <X />
              </button>
            </div>
            {availableExerciseGroups.map((group) => (
              <details key={group.code} className="border-b">
                <summary className="flex min-h-12 cursor-pointer items-center font-semibold">{group.name}</summary>
                {group.exercises.map((exercise) => (
                  <button key={exercise.code} disabled={saving} className="min-h-12 w-full pl-4 text-left" onClick={() => void addExercise(exercise as Exercise)}>
                    {exercise.name}
                  </button>
                ))}
              </details>
            ))}
          </section>
        </div>
      )}
      <AppMobileNavigation current="training" resolvedViews={appNavigationViews} />
    </main>
  );
}
