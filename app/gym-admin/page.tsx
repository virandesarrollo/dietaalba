'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowLeft, ArrowUp, Dumbbell, Pencil, Plus, Save, X } from 'lucide-react';
import { ViewNavigation } from '@/components/ViewNavigation';
import { createMutationLock } from '@/lib/feature-permissions.js';
import { deriveFeatureCapabilities, normalizeFeatureRows } from '@/lib/feature-permissions.js';
import {
  buildGymCatalog,
  normalizeGymExercises,
  normalizeGymGroups,
  validateGymExerciseForm,
  validateGymGroupForm,
  type GymCatalogGroup,
  type GymExercise,
  type GymGroup,
} from '@/lib/gym-catalog.js';
import { supabase } from '@/lib/supabase';

type Message = { kind: 'error' | 'success'; text: string };
type RoleRow = { role_code: string };

function mutationError(error: { code?: string } | null, fallback: string) {
  return error?.code === '42501' ? 'Ya no tienes permiso para gestionar el catálogo.' : fallback;
}

export default function GymAdminPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<GymGroup[]>([]);
  const [exercises, setExercises] = useState<GymExercise[]>([]);
  const [showInactive, setShowInactive] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupEditName, setGroupEditName] = useState('');
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [exerciseName, setExerciseName] = useState('');
  const [exerciseGroupId, setExerciseGroupId] = useState('');
  const [exerciseEditName, setExerciseEditName] = useState('');
  const [exerciseEditGroupId, setExerciseEditGroupId] = useState('');
  const [editingExerciseCode, setEditingExerciseCode] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const mutationLockRef = useRef(createMutationLock());
  const mountedRef = useRef(true);
  const requestGenerationRef = useRef(0);
  const authGenerationRef = useRef(0);
  const currentUserIdRef = useRef<string | null>(null);

  const isAuthCurrent = useCallback((generation: number, userId: string | null) => (
    mountedRef.current
    && generation === authGenerationRef.current
    && userId !== null
    && userId === currentUserIdRef.current
  ), []);

  const loadCatalog = useCallback(async (generation: number, userId: string) => {
    const requestGeneration = ++requestGenerationRef.current;
    try {
      const [groupResult, exerciseResult] = await Promise.all([
        supabase.from('gym_exercise_groups').select('id, code, name, sort_order, is_active'),
        supabase.from('gym_exercises').select('code, name, group_id, is_active'),
      ]);
      if (!isAuthCurrent(generation, userId) || requestGeneration !== requestGenerationRef.current) return false;
      const nextGroups = normalizeGymGroups(groupResult);
      const nextExercises = normalizeGymExercises(exerciseResult);
      if (groupResult.error || exerciseResult.error) {
        setMessage({ kind: 'error', text: 'No se pudo cargar el catálogo de gimnasio.' });
        return false;
      }
      setGroups(nextGroups);
      setExercises(nextExercises);
      setExerciseGroupId((current) => nextGroups.some((group) => group.id === current)
        ? current
        : (nextGroups.find((group) => group.is_active)?.id ?? nextGroups[0]?.id ?? ''));
      return true;
    } catch {
      if (isAuthCurrent(generation, userId) && requestGeneration === requestGenerationRef.current) {
        setMessage({ kind: 'error', text: 'No se pudo cargar el catálogo de gimnasio.' });
      }
      return false;
    }
  }, [isAuthCurrent]);

  useEffect(() => {
    mountedRef.current = true;
    let receivedAuthEvent = false;
    async function initialize(userId: string, generation: number) {
      try {
        const [profileResult, membershipResult] = await Promise.all([
          supabase.from('profiles').select('is_active').eq('id', userId).maybeSingle(),
          supabase.from('group_memberships').select('id').eq('user_id', userId).eq('status', 'active').maybeSingle(),
        ]);
        if (!isAuthCurrent(generation, userId)) return;
        const profile = profileResult.data as { is_active?: boolean } | null;
        const membership = membershipResult.data as { id: string } | null;
        if (profileResult.error || membershipResult.error || profile?.is_active !== true || !membership) {
          router.replace('/'); return;
        }
        const [rolesResult, featuresResult] = await Promise.all([
          supabase.from('user_roles').select('role_code').eq('membership_id', membership.id),
          supabase.rpc('get_my_features'),
        ]);
        if (!isAuthCurrent(generation, userId)) return;
        const isGymCoach = !rolesResult.error && (rolesResult.data ?? [])
          .some((row) => (row as RoleRow).role_code === 'gym_coach');
        const canManageGymWorkouts = !featuresResult.error
          && deriveFeatureCapabilities(normalizeFeatureRows(featuresResult.data)).canManageGymWorkouts;
        if (!isGymCoach || !canManageGymWorkouts) { router.replace('/'); return; }
        setAuthorized(true);
        await loadCatalog(generation, userId);
      } catch {
        if (isAuthCurrent(generation, userId)) {
          setMessage({ kind: 'error', text: 'No se pudo verificar el acceso.' });
          router.replace('/');
        }
      } finally {
        if (isAuthCurrent(generation, userId)) setLoading(false);
      }
    }
    const applySession = (userId: string | null) => {
      const generation = ++authGenerationRef.current;
      currentUserIdRef.current = userId;
      requestGenerationRef.current += 1;
      mutationLockRef.current = createMutationLock();
      setAuthorized(false);
      setGroups([]);
      setExercises([]);
      setSavingKey(null);
      setMessage(null);
      setLoading(Boolean(userId));
      if (!userId) { router.replace('/'); return; }
      void initialize(userId, generation);
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
  }, [isAuthCurrent, loadCatalog, router]);

  const catalog = useMemo<GymCatalogGroup[]>(() => buildGymCatalog(
    { data: groups, error: null }, { data: exercises, error: null }, { showInactive },
  ), [groups, exercises, showInactive]);
  const busy = savingKey !== null;

  function reportWriteError(error: { code?: string } | null, fallback: string) {
    if (!mountedRef.current) return;
    setMessage({ kind: 'error', text: mutationError(error, fallback) });
    if (error?.code === '42501') { setAuthorized(false); router.replace('/'); }
  }

  async function saveGroup(groupId: string | null = null) {
    const validation = validateGymGroupForm({ name: groupId ? groupEditName : groupName });
    if (!validation.valid) { setMessage({ kind: 'error', text: validation.errors.name ?? 'Revisa el nombre.' }); return; }
    const generation = authGenerationRef.current;
    const userId = currentUserIdRef.current;
    if (!userId || !isAuthCurrent(generation, userId)) return;
    const mutationLock = mutationLockRef.current;
    if (!mutationLock.tryAcquire()) return;
    try {
      setSavingKey(groupId ? `group:${groupId}` : 'new-group'); setMessage(null);
      const result = groupId
        ? await supabase.rpc('update_gym_exercise_group', { p_group_id: groupId, p_name: validation.values.name })
        : await supabase.rpc('create_gym_exercise_group', { p_name: validation.values.name });
      if (!isAuthCurrent(generation, userId)) return;
      if (result.error) reportWriteError(result.error, 'No se pudo guardar el grupo.');
      else if (await loadCatalog(generation, userId)) {
        if (!isAuthCurrent(generation, userId)) return;
        if (groupId) { setGroupEditName(''); setEditingGroupId(null); } else setGroupName('');
        setMessage({ kind: 'success', text: groupId ? 'Grupo actualizado.' : 'Grupo creado.' });
      }
    } catch {
      if (isAuthCurrent(generation, userId)) setMessage({ kind: 'error', text: 'No se pudo guardar el grupo.' });
    } finally {
      if (isAuthCurrent(generation, userId)) setSavingKey(null);
      mutationLock.release();
    }
  }

  async function moveGroup(group: GymGroup, amount: -1 | 1) {
    const visibleIndex = catalog.findIndex((item) => item.id === group.id);
    const destinationGroup = catalog[visibleIndex + amount];
    const index = groups.findIndex((item) => item.id === group.id);
    const destination = groups.findIndex((item) => item.id === destinationGroup?.id);
    if (visibleIndex < 0 || index < 0 || destination < 0) return;
    const reordered = [...groups];
    [reordered[index], reordered[destination]] = [reordered[destination], reordered[index]];
    const generation = authGenerationRef.current;
    const userId = currentUserIdRef.current;
    if (!userId || !isAuthCurrent(generation, userId)) return;
    const mutationLock = mutationLockRef.current;
    if (!mutationLock.tryAcquire()) return;
    try {
      setSavingKey(`move:${group.id}`); setMessage(null);
      const result = await supabase.rpc('reorder_gym_exercise_groups', { p_group_ids: reordered.map((item) => item.id) });
      if (!isAuthCurrent(generation, userId)) return;
      if (result.error) reportWriteError(result.error, 'No se pudo reordenar el grupo.');
      else if (await loadCatalog(generation, userId) && isAuthCurrent(generation, userId)) setMessage({ kind: 'success', text: 'Orden actualizado.' });
    } catch {
      if (isAuthCurrent(generation, userId)) setMessage({ kind: 'error', text: 'No se pudo reordenar el grupo.' });
    } finally {
      if (isAuthCurrent(generation, userId)) setSavingKey(null);
      mutationLock.release();
    }
  }

  async function setGroupActive(group: GymGroup, active: boolean) {
    if (!window.confirm(`¿${active ? 'Activar' : 'Desactivar'} el grupo ${group.name}?`)) return;
    const generation = authGenerationRef.current;
    const userId = currentUserIdRef.current;
    if (!userId || !isAuthCurrent(generation, userId)) return;
    const mutationLock = mutationLockRef.current;
    if (!mutationLock.tryAcquire()) return;
    try {
      setSavingKey(`group-active:${group.id}`); setMessage(null);
      const result = await supabase.rpc('set_gym_exercise_group_active', { p_group_id: group.id, p_is_active: active });
      if (!isAuthCurrent(generation, userId)) return;
      if (result.error) reportWriteError(result.error, 'No se pudo cambiar el estado del grupo.');
      else if (await loadCatalog(generation, userId) && isAuthCurrent(generation, userId)) setMessage({ kind: 'success', text: active ? 'Grupo activado.' : 'Grupo desactivado.' });
    } catch {
      if (isAuthCurrent(generation, userId)) setMessage({ kind: 'error', text: 'No se pudo cambiar el estado del grupo.' });
    } finally {
      if (isAuthCurrent(generation, userId)) setSavingKey(null);
      mutationLock.release();
    }
  }

  async function saveExercise(exerciseCode: string | null = null) {
    const validation = validateGymExerciseForm({
      name: exerciseCode ? exerciseEditName : exerciseName,
      groupId: exerciseCode ? exerciseEditGroupId : exerciseGroupId,
    }, groups.map((group) => group.id));
    if (!validation.valid) {
      setMessage({ kind: 'error', text: validation.errors.name ?? validation.errors.groupId ?? 'Revisa el ejercicio.' });
      return;
    }
    const generation = authGenerationRef.current;
    const userId = currentUserIdRef.current;
    if (!userId || !isAuthCurrent(generation, userId)) return;
    const mutationLock = mutationLockRef.current;
    if (!mutationLock.tryAcquire()) return;
    try {
      setSavingKey(exerciseCode ? `exercise:${exerciseCode}` : 'new-exercise'); setMessage(null);
      const result = exerciseCode
        ? await supabase.rpc('update_gym_exercise', { p_exercise_code: exerciseCode, p_name: validation.values.name, p_group_id: validation.values.groupId })
        : await supabase.rpc('create_gym_exercise', { p_name: validation.values.name, p_group_id: validation.values.groupId });
      if (!isAuthCurrent(generation, userId)) return;
      if (result.error) reportWriteError(result.error, 'No se pudo guardar el ejercicio.');
      else if (await loadCatalog(generation, userId)) {
        if (!isAuthCurrent(generation, userId)) return;
        if (exerciseCode) { setExerciseEditName(''); setExerciseEditGroupId(''); setEditingExerciseCode(null); } else setExerciseName('');
        setMessage({ kind: 'success', text: exerciseCode ? 'Ejercicio actualizado.' : 'Ejercicio creado.' });
      }
    } catch {
      if (isAuthCurrent(generation, userId)) setMessage({ kind: 'error', text: 'No se pudo guardar el ejercicio.' });
    } finally {
      if (isAuthCurrent(generation, userId)) setSavingKey(null);
      mutationLock.release();
    }
  }

  async function setExerciseActive(exercise: GymExercise, active: boolean) {
    if (!window.confirm(`¿${active ? 'Activar' : 'Desactivar'} el ejercicio ${exercise.name}?`)) return;
    const generation = authGenerationRef.current;
    const userId = currentUserIdRef.current;
    if (!userId || !isAuthCurrent(generation, userId)) return;
    const mutationLock = mutationLockRef.current;
    if (!mutationLock.tryAcquire()) return;
    try {
      setSavingKey(`exercise-active:${exercise.code}`); setMessage(null);
      const result = await supabase.rpc('set_gym_exercise_active', { p_exercise_code: exercise.code, p_is_active: active });
      if (!isAuthCurrent(generation, userId)) return;
      if (result.error) reportWriteError(result.error, 'No se pudo cambiar el estado del ejercicio.');
      else if (await loadCatalog(generation, userId) && isAuthCurrent(generation, userId)) setMessage({ kind: 'success', text: active ? 'Ejercicio activado.' : 'Ejercicio desactivado.' });
    } catch {
      if (isAuthCurrent(generation, userId)) setMessage({ kind: 'error', text: 'No se pudo cambiar el estado del ejercicio.' });
    } finally {
      if (isAuthCurrent(generation, userId)) setSavingKey(null);
      mutationLock.release();
    }
  }

  function editGroup(group: GymGroup) { setEditingGroupId(group.id); setGroupEditName(group.name); }
  function editExercise(exercise: GymExercise) {
    setEditingExerciseCode(exercise.code); setExerciseEditName(exercise.name); setExerciseEditGroupId(exercise.group_id);
  }

  if (loading || !authorized) return <main className="theme-page flex min-h-screen items-center justify-center text-sm theme-muted">Cargando catálogo…</main>;

  return (
    <main className="theme-page mx-auto min-h-screen max-w-md pb-12 font-sans">
      <header className="rounded-b-[2.5rem] border-b border-pink-100/50 bg-gradient-to-br from-pink-100 via-purple-100 to-blue-100 px-5 pb-7 pt-7 shadow-sm">
        <button type="button" onClick={() => router.push('/')} disabled={busy} aria-label="Volver a mi dieta" className="mb-5 flex min-h-12 items-center gap-2 rounded-full bg-white/70 px-4 text-sm font-semibold text-pink-500 disabled:opacity-50">
          <ArrowLeft size={18} /> Mi dieta
        </button>
        <div className="flex items-center gap-2 text-pink-500"><Dumbbell size={19} /><p className="text-xs font-semibold uppercase tracking-widest">Catálogo global</p></div>
        <h1 className="mt-2 text-3xl font-bold text-slate-800">Administrar gimnasio</h1>
        <div className="mt-5"><ViewNavigation current="gymAdmin" /></div>
      </header>

      <div className="space-y-5 px-4 pt-6">
        {savingKey && <p role="status" className="rounded-2xl bg-blue-50 p-3 text-sm text-blue-700">Guardando cambios…</p>}
        {message && <p role={message.kind === 'error' ? 'alert' : 'status'} className={`rounded-2xl p-3 text-sm ${message.kind === 'error' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>{message.text}</p>}

        <section className="theme-surface rounded-3xl p-5 shadow-sm">
          <h2 className="text-lg font-bold text-slate-800">Nuevo grupo</h2>
          <div className="mt-3 flex gap-2">
            <input value={groupName} onChange={(event) => setGroupName(event.target.value)} disabled={busy} aria-label="Nombre del grupo" placeholder="Nombre del grupo" className="theme-border min-h-12 min-w-0 flex-1 rounded-2xl border px-4" />
            <button type="button" onClick={() => void saveGroup()} disabled={busy} aria-label="Crear grupo" className="min-h-12 min-w-12 rounded-2xl bg-pink-500 px-3 text-white disabled:opacity-50"><Plus className="mx-auto" /></button>
          </div>
        </section>

        <section className="theme-surface rounded-3xl p-5 shadow-sm">
          <h2 className="text-lg font-bold text-slate-800">Nuevo ejercicio</h2>
          <input value={exerciseName} onChange={(event) => setExerciseName(event.target.value)} disabled={busy} aria-label="Nombre del ejercicio" placeholder="Nombre del ejercicio" className="theme-border mt-3 min-h-12 w-full rounded-2xl border px-4" />
          <select value={exerciseGroupId} onChange={(event) => setExerciseGroupId(event.target.value)} disabled={busy} aria-label="Grupo del ejercicio" className="theme-border mt-3 min-h-12 w-full rounded-2xl border px-4">
            <option value="">Selecciona grupo</option>
            {groups.map((group) => <option key={group.id} value={group.id}>{group.name}{group.is_active ? '' : ' (inactivo)'}</option>)}
          </select>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => void saveExercise()} disabled={busy} className="min-h-12 flex-1 rounded-2xl bg-pink-500 px-4 font-semibold text-white disabled:opacity-50">Crear ejercicio</button>
          </div>
        </section>

        <label className="theme-surface flex min-h-12 items-center justify-between rounded-2xl px-4 text-sm font-semibold shadow-sm">
          Mostrar inactivos
          <input type="checkbox" checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} disabled={busy} className="h-6 w-6 accent-pink-500" />
        </label>

        <section aria-label="Grupos y ejercicios" className="space-y-3">
          {catalog.map((group, index) => (
            <details key={group.id} className="theme-surface overflow-hidden rounded-3xl shadow-sm">
              <summary className="min-h-12 cursor-pointer px-5 py-4 font-bold text-slate-800">
                {group.name}{!group.is_active && <span className="theme-muted ml-2 text-xs">Inactivo</span>}
              </summary>
              <div className="theme-border space-y-3 border-t px-4 pb-4 pt-3">
                <p className="theme-muted text-xs">Código: {group.code}</p>
                {editingGroupId === group.id && (
                  <div className="flex gap-2 rounded-2xl bg-pink-50/60 p-2">
                    <input value={groupEditName} onChange={(event) => setGroupEditName(event.target.value)} disabled={busy} aria-label={`Nuevo nombre de ${group.name}`} className="theme-border min-h-12 min-w-0 flex-1 rounded-xl border px-3" />
                    <button type="button" onClick={() => void saveGroup(group.id)} disabled={busy} aria-label="Guardar grupo" className="min-h-12 min-w-12 rounded-xl bg-pink-500 text-white disabled:opacity-50"><Save className="mx-auto" /></button>
                    <button type="button" onClick={() => { setEditingGroupId(null); setGroupEditName(''); }} disabled={busy} aria-label="Cancelar edición del grupo" className="theme-border min-h-12 min-w-12 rounded-xl border"><X className="mx-auto" /></button>
                  </div>
                )}
                <div className="grid grid-cols-4 gap-2">
                  <button type="button" onClick={() => void moveGroup(group, -1)} disabled={busy || index === 0} aria-label={`Mover ${group.name} arriba`} className="theme-border min-h-12 rounded-xl border disabled:opacity-40"><ArrowUp className="mx-auto" /></button>
                  <button type="button" onClick={() => void moveGroup(group, 1)} disabled={busy || index === catalog.length - 1} aria-label={`Mover ${group.name} abajo`} className="theme-border min-h-12 rounded-xl border disabled:opacity-40"><ArrowDown className="mx-auto" /></button>
                  <button type="button" onClick={() => editGroup(group)} disabled={busy} aria-label={`Editar ${group.name}`} className="theme-border min-h-12 rounded-xl border"><Pencil className="mx-auto" /></button>
                  <button type="button" onClick={() => void setGroupActive(group, !group.is_active)} disabled={busy} aria-label={`${group.is_active ? 'Desactivar' : 'Activar'} ${group.name}`} className="theme-border min-h-12 rounded-xl border text-xs font-semibold">{group.is_active ? 'Desactivar' : 'Activar'}</button>
                </div>
                <div className="space-y-2">
                  {group.exercises.map((exercise) => (
                    <article key={exercise.code} className="theme-border rounded-2xl border p-3">
                      <div className="flex items-center justify-between gap-2"><div><h3 className="font-semibold text-slate-800">{exercise.name}</h3><p className="theme-muted text-xs">Código: {exercise.code}{!exercise.is_active && ' · Inactivo'}</p></div></div>
                      {editingExerciseCode === exercise.code && (
                        <div className="mt-3 space-y-2 rounded-2xl bg-pink-50/60 p-2">
                          <input value={exerciseEditName} onChange={(event) => setExerciseEditName(event.target.value)} disabled={busy} aria-label={`Nuevo nombre de ${exercise.name}`} className="theme-border min-h-12 w-full rounded-xl border px-3" />
                          <select value={exerciseEditGroupId} onChange={(event) => setExerciseEditGroupId(event.target.value)} disabled={busy} aria-label={`Nuevo grupo de ${exercise.name}`} className="theme-border min-h-12 w-full rounded-xl border px-3">
                            {groups.map((option) => <option key={option.id} value={option.id}>{option.name}{option.is_active ? '' : ' (inactivo)'}</option>)}
                          </select>
                          <div className="grid grid-cols-2 gap-2">
                            <button type="button" onClick={() => void saveExercise(exercise.code)} disabled={busy} className="min-h-12 rounded-xl bg-pink-500 font-semibold text-white disabled:opacity-50">Guardar ejercicio</button>
                            <button type="button" onClick={() => { setEditingExerciseCode(null); setExerciseEditName(''); setExerciseEditGroupId(''); }} disabled={busy} aria-label="Cancelar edición del ejercicio" className="theme-border min-h-12 rounded-xl border font-semibold">Cancelar</button>
                          </div>
                        </div>
                      )}
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <button type="button" onClick={() => editExercise(exercise)} disabled={busy} aria-label={`Editar ${exercise.name}`} className="theme-border min-h-12 rounded-xl border text-sm font-semibold">Editar</button>
                        <button type="button" onClick={() => void setExerciseActive(exercise, !exercise.is_active)} disabled={busy} aria-label={`${exercise.is_active ? 'Desactivar' : 'Activar'} ${exercise.name}`} className="theme-border min-h-12 rounded-xl border text-sm font-semibold">{exercise.is_active ? 'Desactivar' : 'Activar'}</button>
                      </div>
                    </article>
                  ))}
                  {group.exercises.length === 0 && <p className="theme-muted py-3 text-center text-sm">No hay ejercicios visibles.</p>}
                </div>
              </div>
            </details>
          ))}
        </section>
      </div>
    </main>
  );
}
